const express = require('express');
const { RouteController } = require('../controllers/RouteController');

const router = express.Router();
const routeController = new RouteController();

// GET /api/routes - Get all routes
router.get('/', routeController.getRoutes.bind(routeController));

// GET /api/routes/:id - Get route by ID
router.get('/:id', routeController.getRouteById.bind(routeController));

// POST /api/routes - Create new route
router.post('/', routeController.createRoute.bind(routeController));

// PUT /api/routes/:id - Update route
router.put('/:id', routeController.updateRoute.bind(routeController));

// DELETE /api/routes/:id - Delete route
router.delete('/:id', routeController.deleteRoute.bind(routeController));

// POST /api/routes/:id/assign - Assign route to courier
router.post('/:id/assign', routeController.assignRoute.bind(routeController));

// POST /api/routes/:id/complete - Complete route
router.post('/:id/complete', routeController.completeRoute.bind(routeController));

// POST /api/routes/:id/archive - Archive route
router.post('/:id/archive', routeController.archiveRoute.bind(routeController));

// POST /api/routes/optimize - Optimize route
router.post('/optimize', routeController.optimizeRoute.bind(routeController));

module.exports = router;







