import express from 'express';
import { RouteController } from '../controllers/RouteController';

const router = express.Router();
const routeController = new RouteController();

// GET /api/routes - Get all routes
router.get('/', routeController.getRoutes.bind(routeController));

// GET /api/routes/statistics - Get route statistics
router.get('/statistics', routeController.getRouteStatistics.bind(routeController));

// GET /api/routes/:id - Get route by ID
router.get('/:id', routeController.getRouteById.bind(routeController));

// POST /api/routes - Create new route
router.post('/', routeController.createRoute.bind(routeController));

// POST /api/routes/from-waypoints - Create route from waypoints
router.post('/from-waypoints', routeController.createRouteFromWaypoints.bind(routeController));

// PUT /api/routes/:id - Update route
router.put('/:id', routeController.updateRoute.bind(routeController));

// PUT /api/routes/:id/complete - Complete route
router.put('/:id/complete', routeController.completeRoute.bind(routeController));

// PUT /api/routes/:id/archive - Archive route
router.put('/:id/archive', routeController.archiveRoute.bind(routeController));

// DELETE /api/routes/:id - Delete route
router.delete('/:id', routeController.deleteRoute.bind(routeController));

export default router;
