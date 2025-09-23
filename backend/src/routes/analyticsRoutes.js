const express = require('express');
const Courier = require('../models/Courier');
const Route = require('../models/Route');

const router = express.Router();

// GET /api/analytics/dashboard - Get dashboard analytics
router.get('/dashboard', async (req, res) => {
  try {
    const totalCouriers = await Courier.countDocuments({ isArchived: false });
    const totalRoutes = await Route.countDocuments({ isArchived: false });
    const activeRoutes = await Route.countDocuments({ isActive: true, isArchived: false });
    const completedRoutes = await Route.countDocuments({ isCompleted: true, isArchived: false });

    // Get recent routes
    const recentRoutes = await Route.find({ isArchived: false })
      .populate('courier', 'name vehicleType')
      .sort({ createdAt: -1 })
      .limit(10);

    // Get courier statistics
    const couriers = await Courier.find({ isArchived: false });
    const courierStats = couriers.map(courier => ({
      id: courier._id,
      name: courier.name,
      totalRoutes: courier.routes.length,
      totalOrders: courier.totalOrders,
      totalDistance: courier.totalDistance,
      efficiencyScore: courier.efficiencyScore
    }));

    res.json({
      success: true,
      data: {
        overview: {
          totalCouriers,
          totalRoutes,
          activeRoutes,
          completedRoutes,
          completionRate: totalRoutes > 0 ? (completedRoutes / totalRoutes) * 100 : 0
        },
        recentRoutes: recentRoutes.map(route => ({
          id: route._id,
          courier: route.courier,
          waypointCount: route.waypoints.length,
          totalDistance: route.totalDistance,
          totalDuration: route.totalDuration,
          isActive: route.isActive,
          isCompleted: route.isCompleted,
          createdAt: route.createdAt
        })),
        courierStats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard analytics',
      details: error.message
    });
  }
});

// GET /api/analytics/couriers - Get courier analytics
router.get('/couriers', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const startDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));

    const couriers = await Courier.find({ isArchived: false });
    const courierAnalytics = [];

    for (const courier of couriers) {
      const routes = await Route.find({
        courier: courier._id,
        createdAt: { $gte: startDate }
      });

      const totalOrders = routes.reduce((sum, route) => sum + route.waypoints.length, 0);
      const totalDistance = routes.reduce((sum, route) => {
        const distance = parseFloat(route.totalDistance.replace(/[^\d.]/g, '')) || 0;
        return sum + distance;
      }, 0);

      const completedRoutes = routes.filter(r => r.isCompleted).length;
      const completionRate = routes.length > 0 ? (completedRoutes / routes.length) * 100 : 0;

      courierAnalytics.push({
        id: courier._id,
        name: courier.name,
        vehicleType: courier.vehicleType,
        location: courier.location,
        totalRoutes: routes.length,
        totalOrders,
        totalDistance,
        completedRoutes,
        completionRate,
        efficiencyScore: courier.efficiencyScore
      });
    }

    res.json({
      success: true,
      data: courierAnalytics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch courier analytics',
      details: error.message
    });
  }
});

// GET /api/analytics/routes - Get route analytics
router.get('/routes', async (req, res) => {
  try {
    const { period = '30d', courierId } = req.query;
    
    // Calculate date range
    const now = new Date();
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const startDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));

    const filter = {
      createdAt: { $gte: startDate }
    };

    if (courierId) {
      filter.courier = courierId;
    }

    const routes = await Route.find(filter)
      .populate('courier', 'name vehicleType')
      .sort({ createdAt: -1 });

    const routeAnalytics = routes.map(route => ({
      id: route._id,
      courier: route.courier,
      waypointCount: route.waypoints.length,
      totalDistance: route.totalDistance,
      totalDuration: route.totalDuration,
      isActive: route.isActive,
      isCompleted: route.isCompleted,
      priority: route.priority,
      difficulty: route.difficulty,
      routeRating: route.routeRating,
      createdAt: route.createdAt,
      completionDate: route.completionDate
    }));

    res.json({
      success: true,
      data: routeAnalytics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch route analytics',
      details: error.message
    });
  }
});

module.exports = router;


