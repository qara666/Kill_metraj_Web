const multer = require('multer');
const xlsx = require('xlsx');
const { GoogleMapsService } = require('../services/GoogleMapsService');
const Courier = require('../models/Courier');
const Route = require('../models/Route');

class UploadController {
  constructor() {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    this.mapsService = new GoogleMapsService(apiKey);
  }

  /**
   * Configure multer for file uploads
   */
  configureMulter() {
    const storage = multer.memoryStorage();
    
    const fileFilter = (req, file, cb) => {
      if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          file.mimetype === 'application/vnd.ms-excel' ||
          file.mimetype === 'text/csv') {
        cb(null, true);
      } else {
        cb(new Error('Only Excel and CSV files are allowed'), false);
      }
    };

    return multer({
      storage,
      fileFilter,
      limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
      }
    });
  }

  /**
   * Upload and process Excel file
   */
  async uploadExcel(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      // Parse Excel file
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet);

      if (data.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Excel file is empty'
        });
      }

      // Process data
      const processedData = await this.processExcelData(data);

      res.json({
        success: true,
        data: processedData,
        message: `Successfully processed ${data.length} rows`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to process Excel file',
        details: error.message
      });
    }
  }

  /**
   * Process Excel data and create routes
   */
  async processExcelData(data) {
    const results = {
      couriers: [],
      routes: [],
      errors: []
    };

    // Group data by courier
    const courierGroups = {};
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const courierName = row['Курьер'] || row['Courier'] || row['courier'];
      
      if (!courierName) {
        results.errors.push(`Row ${i + 1}: Missing courier name`);
        continue;
      }

      if (!courierGroups[courierName]) {
        courierGroups[courierName] = [];
      }

      courierGroups[courierName].push(row);
    }

    // Process each courier group
    for (const [courierName, orders] of Object.entries(courierGroups)) {
      try {
        // Find or create courier
        let courier = await Courier.findOne({ name: courierName });
        if (!courier) {
          courier = new Courier({
            name: courierName,
            isActive: true,
            vehicleType: 'car',
            location: 'Київ'
          });
          await courier.save();
          results.couriers.push(courier);
        }

        // Process orders for this courier
        const routeData = await this.processCourierOrders(orders, courier._id);
        if (routeData) {
          results.routes.push(routeData);
        }
      } catch (error) {
        results.errors.push(`Courier ${courierName}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Process orders for a specific courier
   */
  async processCourierOrders(orders, courierId) {
    try {
      const waypoints = [];
      let startPoint = null;
      let endPoint = null;

      // Process each order
      for (const order of orders) {
        const address = order['Адрес'] || order['Address'] || order['address'];
        const orderNumber = order['Номер заказа'] || order['Order Number'] || order['orderNumber'];
        
        if (!address) {
          continue;
        }

        // Geocode address
        const geocodedAddress = await this.mapsService.geocodeAddress(address);
        
        if (!geocodedAddress) {
          continue;
        }

        const waypoint = {
          scannedText: address,
          formattedAddress: geocodedAddress.formatted_address,
          latitude: geocodedAddress.geometry.location.lat,
          longitude: geocodedAddress.geometry.location.lng,
          isWaypoint: true,
          orderNumber: orderNumber || `ORDER_${Date.now()}`,
          orderIndex: waypoints.length
        };

        waypoints.push(waypoint);

        // Set start and end points
        if (!startPoint) {
          startPoint = {
            scannedText: 'Стартовая точка',
            formattedAddress: 'Київ, Україна',
            latitude: 50.4501,
            longitude: 30.5234,
            isDestination: false,
            isWaypoint: false,
            orderIndex: -1
          };
        }
      }

      if (waypoints.length === 0) {
        return null;
      }

      // Set end point
      endPoint = {
        scannedText: 'Конечная точка',
        formattedAddress: 'Київ, Україна',
        latitude: 50.4501,
        longitude: 30.5234,
        isDestination: true,
        isWaypoint: false,
        orderIndex: waypoints.length
      };

      // Get optimized route
      const optimizedRoute = await this.mapsService.getOptimizedRoute(
        startPoint,
        endPoint,
        waypoints.map(wp => ({ lat: wp.latitude, lng: wp.longitude }))
      );

      // Create route
      const route = new Route({
        startPoint,
        endPoint,
        waypoints,
        totalDistance: optimizedRoute.totalDistance || '0 км',
        totalDuration: optimizedRoute.totalDuration || '0 мин',
        polyline: optimizedRoute.polyline || '',
        transportationMode: 'driving',
        courier: courierId,
        isActive: true,
        priority: 'normal'
      });

      await route.save();

      // Update courier statistics
      const courier = await Courier.findById(courierId);
      if (courier) {
        await courier.updateStatistics();
      }

      return route;
    } catch (error) {
      throw new Error(`Failed to process orders: ${error.message}`);
    }
  }
}

module.exports = { UploadController };
