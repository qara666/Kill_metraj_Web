import { Request, Response } from 'express';
import Route from '../models/Route';
import Courier from '../models/Courier';
import { GoogleMapsService } from '../services/GoogleMapsService';

export class RouteController {
  private mapsService: GoogleMapsService;

  constructor() {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    this.mapsService = new GoogleMapsService(apiKey);
  }

  /**
   * Create a new route
   */
  async createRoute(req: Request, res: Response) {
    try {
      const route = new Route(req.body);
      await route.save();
      
      // Update courier statistics if courier is assigned
      if (route.courier) {
        const courier = await Courier.findById(route.courier);
        if (courier) {
          await courier.updateStatistics();
        }
      }
      
      res.status(201).json({
        success: true,
        data: route
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to create route',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get all routes with filtering and pagination
   */
  async getRoutes(req: Request, res: Response) {
    try {
      const { 
        courierId,
        isActive,
        isCompleted,
        priority,
        page = 1,
        limit = 50,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build filter
      const filter: any = {};
      
      if (courierId) {
        filter.courier = courierId;
      }
      
      if (isActive !== undefined) {
        filter.isActive = isActive === 'true';
      }
      
      if (isCompleted !== undefined) {
        filter.isCompleted = isCompleted === 'true';
      }
      
      if (priority) {
        filter.priority = priority;
      }

      // Build sort
      const sort: any = {};
      sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

      // Calculate pagination
      const skip = (Number(page) - 1) * Number(limit);

      const routes = await Route.find(filter)
        .populate('courier', 'name vehicleType location')
        .sort(sort)
        .skip(skip)
        .limit(Number(limit));

      // Get total count for pagination
      const total = await Route.countDocuments(filter);

      res.json({
        success: true,
        data: routes,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch routes',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get route by ID
   */
  async getRouteById(req: Request, res: Response) {
    try {
      const route = await Route.findById(req.params.id).populate('courier');
      
      if (!route) {
        return res.status(404).json({
          success: false,
          error: 'Route not found'
        });
      }

      res.json({
        success: true,
        data: route
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch route',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Update route
   */
  async updateRoute(req: Request, res: Response) {
    try {
      const route = await Route.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      ).populate('courier');
      
      if (!route) {
        return res.status(404).json({
          success: false,
          error: 'Route not found'
        });
      }

      // Update courier statistics if courier is assigned
      if (route.courier) {
        const courier = await Courier.findById(route.courier);
        if (courier) {
          await courier.updateStatistics();
        }
      }

      res.json({
        success: true,
        data: route
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to update route',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Delete route
   */
  async deleteRoute(req: Request, res: Response) {
    try {
      const route = await Route.findByIdAndDelete(req.params.id);
      
      if (!route) {
        return res.status(404).json({
          success: false,
          error: 'Route not found'
        });
      }

      // Update courier statistics if courier was assigned
      if (route.courier) {
        const courier = await Courier.findById(route.courier);
        if (courier) {
          await courier.updateStatistics();
        }
      }

      res.json({
        success: true,
        message: 'Route deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to delete route',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Create route from waypoints
   */
  async createRouteFromWaypoints(req: Request, res: Response) {
    try {
      const { waypoints, courierId, startAddress, endAddress } = req.body;

      if (!waypoints || waypoints.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one waypoint is required'
        });
      }

      // Geocode start and end addresses if provided
      let startPoint, endPoint;
      
      if (startAddress) {
        const startResult = await this.mapsService.geocodeAddress(startAddress);
        if (!startResult) {
          return res.status(400).json({
            success: false,
            error: 'Failed to geocode start address'
          });
        }
        startPoint = {
          scannedText: startAddress,
          formattedAddress: startResult.formattedAddress,
          latitude: startResult.geometry.location.lat,
          longitude: startResult.geometry.location.lng,
          isDestination: false
        };
      } else {
        // Use first waypoint as start
        startPoint = {
          scannedText: waypoints[0].originalAddress,
          formattedAddress: waypoints[0].geocodedAddress,
          latitude: waypoints[0].coordinates.lat,
          longitude: waypoints[0].coordinates.lng,
          isDestination: false
        };
      }

      if (endAddress) {
        const endResult = await this.mapsService.geocodeAddress(endAddress);
        if (!endResult) {
          return res.status(400).json({
            success: false,
            error: 'Failed to geocode end address'
          });
        }
        endPoint = {
          scannedText: endAddress,
          formattedAddress: endResult.formattedAddress,
          latitude: endResult.geometry.location.lat,
          longitude: endResult.geometry.location.lng,
          isDestination: true
        };
      } else {
        // Use start point as end point (return to start)
        endPoint = { ...startPoint, isDestination: true };
      }

      // Process waypoints
      const processedWaypoints = waypoints.map((waypoint: any, index: number) => ({
        scannedText: waypoint.originalAddress,
        formattedAddress: waypoint.geocodedAddress,
        latitude: waypoint.coordinates.lat,
        longitude: waypoint.coordinates.lng,
        isWaypoint: true,
        orderIndex: index,
        orderNumber: waypoint.orderNumber
      }));

      // Calculate route
      const waypointCoords = processedWaypoints.map(wp => ({
        lat: wp.latitude!,
        lng: wp.longitude!
      }));

      const routeResult = await this.mapsService.getRoute(
        { lat: startPoint.latitude!, lng: startPoint.longitude! },
        { lat: endPoint.latitude!, lng: endPoint.longitude! },
        waypointCoords
      );

      if (!routeResult) {
        return res.status(400).json({
          success: false,
          error: 'Failed to calculate route'
        });
      }

      // Create route
      const route = new Route({
        startPoint,
        endPoint,
        waypoints: processedWaypoints,
        totalDistance: routeResult.distance,
        totalDuration: routeResult.duration,
        polyline: routeResult.polyline,
        courier: courierId,
        transportationMode: 'driving'
      });

      await route.save();

      // Update courier statistics if courier is assigned
      if (courierId) {
        const courier = await Courier.findById(courierId);
        if (courier) {
          await courier.updateStatistics();
        }
      }

      res.status(201).json({
        success: true,
        data: route
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to create route from waypoints',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Complete route
   */
  async completeRoute(req: Request, res: Response) {
    try {
      const route = await Route.findById(req.params.id);
      
      if (!route) {
        return res.status(404).json({
          success: false,
          error: 'Route not found'
        });
      }

      await route.complete();

      // Update courier statistics
      if (route.courier) {
        const courier = await Courier.findById(route.courier);
        if (courier) {
          await courier.updateStatistics();
        }
      }

      res.json({
        success: true,
        data: route,
        message: 'Route completed successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to complete route',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Archive route
   */
  async archiveRoute(req: Request, res: Response) {
    try {
      const route = await Route.findById(req.params.id);
      
      if (!route) {
        return res.status(404).json({
          success: false,
          error: 'Route not found'
        });
      }

      await route.archive();

      // Update courier statistics
      if (route.courier) {
        const courier = await Courier.findById(route.courier);
        if (courier) {
          await courier.updateStatistics();
        }
      }

      res.json({
        success: true,
        data: route,
        message: 'Route archived successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to archive route',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get route statistics
   */
  async getRouteStatistics(req: Request, res: Response) {
    try {
      const totalRoutes = await Route.countDocuments();
      const activeRoutes = await Route.countDocuments({ isActive: true });
      const completedRoutes = await Route.countDocuments({ isCompleted: true });
      const archivedRoutes = await Route.countDocuments({ isArchived: true });

      const routes = await Route.find();
      const totalOrders = routes.reduce((sum, route) => sum + route.waypoints.length, 0);
      const totalDistance = routes.reduce((sum, route) => {
        const distance = parseFloat(route.totalDistance.replace(/[^\d.]/g, '')) || 0;
        return sum + distance;
      }, 0);

      const averageOrdersPerRoute = totalRoutes > 0 ? totalOrders / totalRoutes : 0;
      const completionRate = totalRoutes > 0 ? (completedRoutes / totalRoutes) * 100 : 0;

      res.json({
        success: true,
        data: {
          totalRoutes,
          activeRoutes,
          completedRoutes,
          archivedRoutes,
          totalOrders,
          totalDistance,
          averageOrdersPerRoute,
          completionRate
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch route statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
