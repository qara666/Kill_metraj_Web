const Courier = require('../models/Courier');
const Route = require('../models/Route');
const { GoogleMapsService } = require('../services/GoogleMapsService');

class CourierController {
  constructor() {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    this.mapsService = new GoogleMapsService(apiKey);
  }

  /**
   * Create a new courier
   */
  async createCourier(req, res) {
    try {
      const courier = new Courier(req.body);
      await courier.save();
      
      res.status(201).json({
        success: true,
        data: courier
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to create courier',
        details: error.message
      });
    }
  }

  /**
   * Get all couriers with statistics
   */
  async getCouriers(req, res) {
    try {
      const { 
        active, 
        vehicleType, 
        location, 
        page = 1, 
        limit = 50,
        sortBy = 'name',
        sortOrder = 'asc'
      } = req.query;

      // Build filter
      const filter = {};
      
      if (active !== undefined) {
        filter.isActive = active === 'true';
      }
      
      if (vehicleType) {
        filter.vehicleType = vehicleType;
      }
      
      if (location) {
        filter.location = { $regex: location, $options: 'i' };
      }
  
      // Build sort
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Calculate pagination
      const skip = (Number(page) - 1) * Number(limit);

      const couriers = await Courier.find(filter)
        .populate('routes')
        .sort(sort)
        .skip(skip)
        .limit(Number(limit));
  
      // Calculate statistics for each courier
      const couriersWithStats = await Promise.all(
        couriers.map(async (courier) => {
          const routes = await Route.find({ courier: courier._id });
          
          const totalOrders = routes.reduce((sum, route) => sum + route.waypoints.length, 0);
          const totalDistance = routes.reduce((sum, route) => {
            const distance = parseFloat(route.totalDistance.replace(/[^\d.]/g, '')) || 0;
            return sum + distance;
          }, 0);
          
          const additionalKm = totalOrders * 0.5;
          const totalDistanceWithAdditional = totalDistance + additionalKm;
          const averageOrdersPerRoute = routes.length > 0 ? totalOrders / routes.length : 0;
          const efficiencyScore = this.calculateEfficiencyScore(courier, routes);

          return {
            ...courier.toObject(),
            totalOrders,
            totalDistance,
            totalDistanceWithAdditional,
            averageOrdersPerRoute,
            efficiencyScore,
            routeCount: routes.length,
            activeRoutes: routes.filter(r => r.isActive).length,
            completedRoutes: routes.filter(r => r.isCompleted).length
          };
        })
      );

      // Get total count for pagination
      const total = await Courier.countDocuments(filter);

      res.json({
        success: true,
        data: couriersWithStats,
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
        error: 'Failed to fetch couriers',
        details: error.message
      });
    }
  }

  /**
   * Get courier by ID with detailed statistics
   */
  async getCourierById(req, res) {
    try {
      const courier = await Courier.findById(req.params.id).populate('routes');
      
      if (!courier) {
        return res.status(404).json({
          success: false,
          error: 'Courier not found'
        });
      }

      const routes = await Route.find({ courier: courier._id });
      
      // Calculate detailed statistics
      const totalOrders = routes.reduce((sum, route) => sum + route.waypoints.length, 0);
      const totalDistance = routes.reduce((sum, route) => {
        const distance = parseFloat(route.totalDistance.replace(/[^\d.]/g, '')) || 0;
        return sum + distance;
      }, 0);
      
      const additionalKm = totalOrders * 0.5;
      const totalDistanceWithAdditional = totalDistance + additionalKm;
      const averageOrdersPerRoute = routes.length > 0 ? totalOrders / routes.length : 0;
      const efficiencyScore = this.calculateEfficiencyScore(courier, routes);

      const activeRoutes = routes.filter(r => r.isActive);
      const completedRoutes = routes.filter(r => r.isCompleted);
      const archivedRoutes = routes.filter(r => r.isArchived);
  
      res.json({
        success: true,
        data: {
          ...courier.toObject(),
          totalOrders,
          totalDistance,
          totalDistanceWithAdditional,
          averageOrdersPerRoute,
          efficiencyScore,
          routeCount: routes.length,
          activeRoutes: activeRoutes.length,
          completedRoutes: completedRoutes.length,
          archivedRoutes: archivedRoutes.length,
          routes: routes.map(route => ({
            ...route.toObject(),
            waypointCount: route.waypoints.length,
            orderCount: route.waypoints.length
          }))
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch courier',
        details: error.message
      });
    }
  }

  /**
   * Update courier
   */
  async updateCourier(req, res) {
    try {
      const courier = await Courier.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );
      
      if (!courier) {
        return res.status(404).json({
          success: false,
          error: 'Courier not found'
        });
      }

      res.json({
        success: true,
        data: courier
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to update courier',
        details: error.message
      });
    }
  }

  /**
   * Delete (archive) courier
   */
  async deleteCourier(req, res) {
    try {
      const courier = await Courier.findByIdAndUpdate(
        req.params.id,
        { isArchived: true },
        { new: true }
      );
      
      if (!courier) {
        return res.status(404).json({
          success: false,
          error: 'Courier not found'
        });
      }

      res.json({
        success: true,
        message: 'Courier archived successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to archive courier',
        details: error.message
      });
    }
  }

  /**
   * Get courier statistics
   */
  async getCourierStatistics(req, res) {
    try {
      const { courierId } = req.params;
      
      const courier = await Courier.findById(courierId);
      if (!courier) {
        return res.status(404).json({
          success: false,
          error: 'Courier not found'
        });
      }

      const routes = await Route.find({ courier: courierId });
      
      // Calculate comprehensive statistics
      const totalOrders = routes.reduce((sum, route) => sum + route.waypoints.length, 0);
      const totalDistance = routes.reduce((sum, route) => {
        const distance = parseFloat(route.totalDistance.replace(/[^\d.]/g, '')) || 0;
        return sum + distance;
      }, 0);
      
      const additionalKm = totalOrders * 0.5;
      const totalDistanceWithAdditional = totalDistance + additionalKm;
      const averageOrdersPerRoute = routes.length > 0 ? totalOrders / routes.length : 0;
      const efficiencyScore = this.calculateEfficiencyScore(courier, routes);

      const activeRoutes = routes.filter(r => r.isActive);
      const completedRoutes = routes.filter(r => r.isCompleted);
      const archivedRoutes = routes.filter(r => r.isArchived);

      // Calculate completion rate
      const completionRate = routes.length > 0 ? (completedRoutes.length / routes.length) * 100 : 0;

      // Calculate average route rating
      const averageRating = routes.length > 0 ? 
        routes.reduce((sum, route) => sum + route.routeRating, 0) / routes.length : 0;

      res.json({
        success: true,
        data: {
          courier: {
            id: courier._id,
            name: courier.name,
            vehicleType: courier.vehicleType,
            location: courier.location
          },
          statistics: {
            totalRoutes: routes.length,
            activeRoutes: activeRoutes.length,
            completedRoutes: completedRoutes.length,
            archivedRoutes: archivedRoutes.length,
            totalOrders,
            totalDistance,
            totalDistanceWithAdditional,
            additionalKilometers: additionalKm,
            averageOrdersPerRoute,
            efficiencyScore,
            completionRate,
            averageRating
          },
          routes: routes.map(route => ({
            id: route._id,
            totalDistance: route.totalDistance,
            totalDuration: route.totalDuration,
            waypointCount: route.waypoints.length,
            isActive: route.isActive,
            isCompleted: route.isCompleted,
            priority: route.priority,
            difficulty: route.difficulty,
            routeRating: route.routeRating,
            createdAt: route.createdAt
          }))
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch courier statistics',
        details: error.message
      });
    }
  }

  /**
   * Calculate efficiency score for a courier
   */
  calculateEfficiencyScore(courier, routes) {
    if (routes.length === 0) return 0;
    
    const completedRoutes = routes.filter(r => r.isCompleted);
    const completionRate = (completedRoutes.length / routes.length) * 40;
    
    const avgOrders = routes.reduce((sum, r) => sum + r.waypoints.length, 0) / routes.length;
    const orderEfficiency = Math.min(avgOrders * 10, 30);
    
    const avgDistance = routes.reduce((sum, r) => {
      const distance = parseFloat(r.totalDistance.replace(/[^\d.]/g, '')) || 0;
      return sum + distance;
    }, 0) / routes.length;
    const distanceEfficiency = avgDistance > 0 ? Math.min(50 / avgDistance * 10, 30) : 0;
    
    return Math.min(completionRate + orderEfficiency + distanceEfficiency, 100);
  }
}

module.exports = { CourierController };



