import { Request, Response } from 'express';
import { ExcelService } from '../services/ExcelService';
import { GoogleMapsService } from '../services/GoogleMapsService';
import Route from '../models/Route';
import Courier from '../models/Courier';

export class UploadController {
  private excelService: ExcelService;
  private mapsService: GoogleMapsService;

  constructor() {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    this.excelService = new ExcelService(apiKey);
    this.mapsService = new GoogleMapsService(apiKey);
  }

  /**
   * Upload and process Excel file
   */
  async uploadExcelFile(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      const fileBuffer = req.file.buffer;
      const fileName = req.file.originalname;

      // Validate file structure
      const validation = this.excelService.validateExcelStructure(fileBuffer);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: 'Invalid Excel file structure',
          details: validation.errors
        });
      }

      // Parse Excel file
      const orders = this.excelService.parseExcelFile(fileBuffer);
      
      if (orders.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid orders found in Excel file'
        });
      }

      // Process orders with geocoding
      const result = await this.excelService.processOrdersWithGeocoding(orders, {
        delayMs: 100,
        validateUkraine: true,
        maxRetries: 3
      });

      res.json({
        success: true,
        data: {
          fileName,
          orders: result.orders,
          summary: result.summary
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to process Excel file',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Create routes from processed orders
   */
  async createRoutesFromOrders(req: Request, res: Response) {
    try {
      const { orders, courierAssignments } = req.body;

      if (!orders || !Array.isArray(orders) || orders.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No orders provided'
        });
      }

      // Group orders by courier
      const ordersByCourier = this.excelService.groupOrdersByCourier(orders);
      const createdRoutes: any[] = [];
      const errors: string[] = [];

      // Process each courier's orders
      for (const [courierName, courierOrders] of ordersByCourier) {
        try {
          // Find or create courier
          let courier = await Courier.findOne({ name: courierName });
          
          if (!courier) {
            courier = new Courier({
              name: courierName,
              vehicleType: 'car',
              location: 'Київ',
              isActive: true
            });
            await courier.save();
          }

          // Filter successful geocoding results
          const validOrders = courierOrders.filter(order => order.geocodingSuccess);
          
          if (validOrders.length === 0) {
            errors.push(`No valid addresses for courier ${courierName}`);
            continue;
          }

          // Create route for this courier
          const route = await this.createRouteForCourier(courier, validOrders);
          createdRoutes.push(route);

        } catch (error) {
          errors.push(`Failed to create route for courier ${courierName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      res.json({
        success: true,
        data: {
          createdRoutes,
          errors,
          summary: {
            totalRoutes: createdRoutes.length,
            totalErrors: errors.length,
            couriersProcessed: ordersByCourier.size
          }
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to create routes from orders',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get sample Excel template
   */
  async getSampleTemplate(req: Request, res: Response) {
    try {
      const templateBuffer = this.excelService.generateSampleExcel();
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="sample_orders.xlsx"');
      res.send(templateBuffer);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to generate sample template',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Test Google Maps API key
   */
  async testApiKey(req: Request, res: Response) {
    try {
      const { apiKey } = req.body;
      
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          error: 'API key is required'
        });
      }

      const testService = new GoogleMapsService(apiKey);
      const isValid = await testService.testApiKey();

      res.json({
        success: true,
        data: {
          isValid,
          message: isValid ? 'API key is valid' : 'API key is invalid or quota exceeded'
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to test API key',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Create route for a specific courier
   */
  private async createRouteForCourier(courier: any, orders: any[]) {
    // Sort orders by order number for consistent route creation
    const sortedOrders = orders.sort((a, b) => a.orderNumber.localeCompare(b.orderNumber));

    // Create start and end points (using first order as start, last as end)
    const startOrder = sortedOrders[0];
    const endOrder = sortedOrders[sortedOrders.length - 1];

    const startPoint = {
      scannedText: startOrder.originalAddress,
      formattedAddress: startOrder.geocodedAddress,
      latitude: startOrder.coordinates.lat,
      longitude: startOrder.coordinates.lng,
      isDestination: false
    };

    const endPoint = {
      scannedText: endOrder.originalAddress,
      formattedAddress: endOrder.geocodedAddress,
      latitude: endOrder.coordinates.lat,
      longitude: endOrder.coordinates.lng,
      isDestination: true
    };

    // Create waypoints (all orders except start and end)
    const waypoints = sortedOrders.map((order, index) => ({
      scannedText: order.originalAddress,
      formattedAddress: order.geocodedAddress,
      latitude: order.coordinates.lat,
      longitude: order.coordinates.lng,
      isWaypoint: true,
      orderIndex: index,
      orderNumber: order.orderNumber
    }));

    // Calculate route
    const waypointCoords = waypoints.map(wp => ({
      lat: wp.latitude!,
      lng: wp.longitude!
    }));

    const routeResult = await this.mapsService.getRoute(
      { lat: startPoint.latitude!, lng: startPoint.longitude! },
      { lat: endPoint.latitude!, lng: endPoint.longitude! },
      waypointCoords
    );

    if (!routeResult) {
      throw new Error('Failed to calculate route');
    }

    // Create route
    const route = new Route({
      startPoint,
      endPoint,
      waypoints,
      totalDistance: routeResult.distance,
      totalDuration: routeResult.duration,
      polyline: routeResult.polyline,
      courier: courier._id,
      transportationMode: 'driving',
      priority: 'normal',
      difficulty: 'medium'
    });

    await route.save();

    // Update courier statistics
    await courier.updateStatistics();

    return route;
  }

  /**
   * Batch geocode addresses
   */
  async batchGeocodeAddresses(req: Request, res: Response) {
    try {
      const { addresses, delayMs = 100 } = req.body;

      if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No addresses provided'
        });
      }

      const results = await this.mapsService.batchGeocodeAddresses(addresses, delayMs);

      const successful = results.filter(r => r.result !== null);
      const failed = results.filter(r => r.result === null);

      res.json({
        success: true,
        data: {
          results,
          summary: {
            total: results.length,
            successful: successful.length,
            failed: failed.length,
            successRate: (successful.length / results.length) * 100
          }
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to batch geocode addresses',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
