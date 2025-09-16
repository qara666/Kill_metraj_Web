import express from 'express';
import Route from '../models/Route';
import Courier from '../models/Courier';

const router = express.Router();

/**
 * Get overall analytics dashboard data
 */
router.get('/dashboard', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build date filter
    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate as string);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate as string);
    }

    // Get route statistics
    const totalRoutes = await Route.countDocuments(dateFilter);
    const activeRoutes = await Route.countDocuments({ ...dateFilter, isActive: true });
    const completedRoutes = await Route.countDocuments({ ...dateFilter, isCompleted: true });
    const archivedRoutes = await Route.countDocuments({ ...dateFilter, isArchived: true });

    // Get courier statistics
    const totalCouriers = await Courier.countDocuments();
    const activeCouriers = await Courier.countDocuments({ isActive: true });
    const archivedCouriers = await Courier.countDocuments({ isArchived: true });

    // Get detailed route data for calculations
    const routes = await Route.find(dateFilter);
    const totalOrders = routes.reduce((sum, route) => sum + route.waypoints.length, 0);
    const totalDistance = routes.reduce((sum, route) => {
      const distance = parseFloat(route.totalDistance.replace(/[^\d.]/g, '')) || 0;
      return sum + distance;
    }, 0);

    // Calculate averages
    const averageOrdersPerRoute = totalRoutes > 0 ? totalOrders / totalRoutes : 0;
    const averageDistancePerRoute = totalRoutes > 0 ? totalDistance / totalRoutes : 0;
    const completionRate = totalRoutes > 0 ? (completedRoutes / totalRoutes) * 100 : 0;

    // Get courier performance data
    const couriers = await Courier.find().populate('routes');
    const courierPerformance = couriers.map(courier => {
      const courierRoutes = routes.filter(route => route.courier?.toString() === courier._id.toString());
      const courierOrders = courierRoutes.reduce((sum, route) => sum + route.waypoints.length, 0);
      const courierDistance = courierRoutes.reduce((sum, route) => {
        const distance = parseFloat(route.totalDistance.replace(/[^\d.]/g, '')) || 0;
        return sum + distance;
      }, 0);
      const courierCompleted = courierRoutes.filter(route => route.isCompleted).length;
      const courierCompletionRate = courierRoutes.length > 0 ? (courierCompleted / courierRoutes.length) * 100 : 0;

      return {
        id: courier._id,
        name: courier.name,
        vehicleType: courier.vehicleType,
        location: courier.location,
        totalRoutes: courierRoutes.length,
        totalOrders: courierOrders,
        totalDistance: courierDistance,
        completionRate: courierCompletionRate,
        efficiencyScore: courier.efficiencyScore
      };
    });

    // Get route priority distribution
    const priorityDistribution = {
      low: await Route.countDocuments({ ...dateFilter, priority: 'low' }),
      normal: await Route.countDocuments({ ...dateFilter, priority: 'normal' }),
      high: await Route.countDocuments({ ...dateFilter, priority: 'high' }),
      urgent: await Route.countDocuments({ ...dateFilter, priority: 'urgent' })
    };

    // Get route difficulty distribution
    const difficultyDistribution = {
      easy: await Route.countDocuments({ ...dateFilter, difficulty: 'easy' }),
      medium: await Route.countDocuments({ ...dateFilter, difficulty: 'medium' }),
      hard: await Route.countDocuments({ ...dateFilter, difficulty: 'hard' }),
      expert: await Route.countDocuments({ ...dateFilter, difficulty: 'expert' })
    };

    // Get vehicle type distribution
    const vehicleTypeDistribution = {
      car: await Courier.countDocuments({ vehicleType: 'car' }),
      motorcycle: await Courier.countDocuments({ vehicleType: 'motorcycle' })
    };

    res.json({
      success: true,
      data: {
        overview: {
          totalRoutes,
          activeRoutes,
          completedRoutes,
          archivedRoutes,
          totalCouriers,
          activeCouriers,
          archivedCouriers,
          totalOrders,
          totalDistance,
          averageOrdersPerRoute,
          averageDistancePerRoute,
          completionRate
        },
        courierPerformance,
        distributions: {
          priority: priorityDistribution,
          difficulty: difficultyDistribution,
          vehicleType: vehicleTypeDistribution
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard analytics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get courier performance analytics
 */
router.get('/courier-performance', async (req, res) => {
  try {
    const { startDate, endDate, courierId } = req.query;

    // Build date filter
    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate as string);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate as string);
    }

    // Build courier filter
    const courierFilter: any = {};
    if (courierId) {
      courierFilter._id = courierId;
    }

    const couriers = await Courier.find(courierFilter).populate('routes');
    const routes = await Route.find(dateFilter);

    const performanceData = couriers.map(courier => {
      const courierRoutes = routes.filter(route => 
        route.courier?.toString() === courier._id.toString()
      );

      const totalOrders = courierRoutes.reduce((sum, route) => sum + route.waypoints.length, 0);
      const totalDistance = courierRoutes.reduce((sum, route) => {
        const distance = parseFloat(route.totalDistance.replace(/[^\d.]/g, '')) || 0;
        return sum + distance;
      }, 0);

      const completedRoutes = courierRoutes.filter(route => route.isCompleted);
      const completionRate = courierRoutes.length > 0 ? (completedRoutes.length / courierRoutes.length) * 100 : 0;

      const averageOrdersPerRoute = courierRoutes.length > 0 ? totalOrders / courierRoutes.length : 0;
      const averageDistancePerRoute = courierRoutes.length > 0 ? totalDistance / courierRoutes.length : 0;

      // Calculate efficiency metrics
      const efficiencyScore = courier.efficiencyScore;
      const ordersPerKm = totalDistance > 0 ? totalOrders / totalDistance : 0;

      return {
        courier: {
          id: courier._id,
          name: courier.name,
          vehicleType: courier.vehicleType,
          location: courier.location
        },
        metrics: {
          totalRoutes: courierRoutes.length,
          completedRoutes: completedRoutes.length,
          totalOrders,
          totalDistance,
          completionRate,
          averageOrdersPerRoute,
          averageDistancePerRoute,
          efficiencyScore,
          ordersPerKm
        }
      };
    });

    res.json({
      success: true,
      data: performanceData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch courier performance analytics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get route analytics
 */
router.get('/route-analytics', async (req, res) => {
  try {
    const { startDate, endDate, courierId } = req.query;

    // Build date filter
    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate as string);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate as string);
    }

    // Build courier filter
    const courierFilter: any = {};
    if (courierId) {
      courierFilter.courier = courierId;
    }

    const routes = await Route.find({ ...dateFilter, ...courierFilter }).populate('courier');

    // Calculate route statistics
    const totalRoutes = routes.length;
    const totalOrders = routes.reduce((sum, route) => sum + route.waypoints.length, 0);
    const totalDistance = routes.reduce((sum, route) => {
      const distance = parseFloat(route.totalDistance.replace(/[^\d.]/g, '')) || 0;
      return sum + distance;
    }, 0);

    const averageOrdersPerRoute = totalRoutes > 0 ? totalOrders / totalRoutes : 0;
    const averageDistancePerRoute = totalRoutes > 0 ? totalDistance / totalRoutes : 0;

    // Route status distribution
    const statusDistribution = {
      active: routes.filter(r => r.isActive).length,
      completed: routes.filter(r => r.isCompleted).length,
      archived: routes.filter(r => r.isArchived).length
    };

    // Priority distribution
    const priorityDistribution = {
      low: routes.filter(r => r.priority === 'low').length,
      normal: routes.filter(r => r.priority === 'normal').length,
      high: routes.filter(r => r.priority === 'high').length,
      urgent: routes.filter(r => r.priority === 'urgent').length
    };

    // Difficulty distribution
    const difficultyDistribution = {
      easy: routes.filter(r => r.difficulty === 'easy').length,
      medium: routes.filter(r => r.difficulty === 'medium').length,
      hard: routes.filter(r => r.difficulty === 'hard').length,
      expert: routes.filter(r => r.difficulty === 'expert').length
    };

    // Top performing routes (by efficiency)
    const topRoutes = routes
      .map(route => ({
        id: route._id,
        courier: route.courier,
        waypointCount: route.waypoints.length,
        distance: parseFloat(route.totalDistance.replace(/[^\d.]/g, '')) || 0,
        efficiency: route.waypoints.length > 0 ? 
          (parseFloat(route.totalDistance.replace(/[^\d.]/g, '')) || 0) / route.waypoints.length : 0,
        priority: route.priority,
        difficulty: route.difficulty,
        isCompleted: route.isCompleted
      }))
      .sort((a, b) => a.efficiency - b.efficiency) // Lower efficiency score is better
      .slice(0, 10);

    res.json({
      success: true,
      data: {
        overview: {
          totalRoutes,
          totalOrders,
          totalDistance,
          averageOrdersPerRoute,
          averageDistancePerRoute
        },
        distributions: {
          status: statusDistribution,
          priority: priorityDistribution,
          difficulty: difficultyDistribution
        },
        topRoutes
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch route analytics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
