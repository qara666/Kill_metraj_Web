const Route = require('../models/Route');
const Courier = require('../models/Courier');
const { GoogleMapsService } = require('../services/GoogleMapsService');

class RouteController {
  constructor() {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    this.mapsService = new GoogleMapsService(apiKey);
  }

  /**
   * Create a new route
   */
  async createRoute(req, res) {
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
        details: error.message
      });
    }
  }

  /**
   * Get all routes with filtering and pagination
   */
  async getRoutes(req, res) {
    try {
      const { 
        courier, 
        isActive, 
        isCompleted, 
        priority, 
        page = 1, 
        limit = 50,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build filter
      const filter = {};
      
      if (courier) {
        filter.courier = courier;
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
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Calculate pagination
      const skip = (Number(page) - 1) * Number(limit);

      const routes = await Route.find(filter)
        .populate('courier', 'name phoneNumber vehicleType location')
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
        details: error.message
      });
    }
  }

  /**
   * Get route by ID
   */
  async getRouteById(req, res) {
    try {
      const route = await Route.findById(req.params.id)
        .populate('courier', 'name phoneNumber vehicleType location');
      
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
        details: error.message
      });
    }
  }

  /**
   * Update route
   */
  async updateRoute(req, res) {
    try {
      const route = await Route.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      ).populate('courier', 'name phoneNumber vehicleType location');
      
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
        details: error.message
      });
    }
  }

  /**
   * Delete route
   */
  async deleteRoute(req, res) {
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
        details: error.message
      });
    }
  }

  /**
   * Assign route to courier
   */
  async assignRoute(req, res) {
    try {
      const { courierId } = req.body;
      
      const route = await Route.findById(req.params.id);
      if (!route) {
        return res.status(404).json({
          success: false,
          error: 'Route not found'
        });
      }

      const courier = await Courier.findById(courierId);
      if (!courier) {
        return res.status(404).json({
          success: false,
          error: 'Courier not found'
        });
      }

      route.courier = courierId;
      await route.save();

      // Update courier statistics
      await courier.updateStatistics();

      res.json({
        success: true,
        data: route
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to assign route',
        details: error.message
      });
    }
  }

  /**
   * Complete route
   */
  async completeRoute(req, res) {
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
        data: route
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to complete route',
        details: error.message
      });
    }
  }

  /**
   * Archive route
   */
  async archiveRoute(req, res) {
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
        data: route
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to archive route',
        details: error.message
      });
    }
  }

  /**
   * Optimize route using Google Maps
   */
  async optimizeRoute(req, res) {
    try {
      const { waypoints, startPoint, endPoint } = req.body;

      if (!waypoints || waypoints.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Waypoints are required for optimization'
        });
      }

      // Prepare waypoints for Google Maps
      const processedWaypoints = waypoints.map(wp => ({
        lat: wp.latitude,
        lng: wp.longitude
      }));

      // Get optimized route from Google Maps
      const optimizedRoute = await this.mapsService.getOptimizedRoute(
        startPoint,
        endPoint,
        processedWaypoints
      );

      res.json({
        success: true,
        data: optimizedRoute
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to optimize route',
        details: error.message
      });
    }
  }
}

module.exports = { RouteController };



