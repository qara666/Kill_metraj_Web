const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { authenticateToken, auditLog } = require('../middleware/auth');
const { sequelize, Route } = require('../models');

// All routes require authentication
router.use(authenticateToken);

// GET /api/routes - Get all routes (from local state)
router.get('/', (req, res) => {
    res.json({ success: true, data: [] });
});

// GET /api/routes/calculated - Get calculated routes from database (Turbo Robot)
router.get('/calculated', async (req, res) => {
    try {
        const divisionId = req.query.divisionId || req.user?.divisionId;
        const targetDate = req.query.date; // Optional date filter from frontend

        // v5.171: Simplified query - fetch all routes for date first, filter in JS
        // Complex Op.and + Op.or combination was causing issues with JSON extraction
        const { Op } = require('sequelize');
        const whereClause = {};

        // v5.150: Normalize targetDate to YYYY-MM-DD for database query consistency
        let queryDate = targetDate;
        if (queryDate && queryDate.includes('.')) {
            const parts = queryDate.split('.');
            if (parts.length === 3 && parts[2].length === 4) {
                queryDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
        } else if (!queryDate) {
            queryDate = new Date().toISOString().split('T')[0];
        }

        // Use simple where clause - fetch by target_date only
        // Filter by division in JS after fetching
        whereClause[Op.and] = [
            sequelize.where(
                sequelize.literal("route_data->>'target_date'"),
                queryDate
            )
        ];

        // Get routes
        let routes = [];
        try {
            routes = await Route.findAll({
                where: whereClause,
                order: [['created_at', 'DESC']],
                limit: 5000
            });
        } catch (dbErr) {
            // v5.170: If table doesn't exist yet (first deploy), return empty instead of 500
            if (dbErr.message.includes('does not exist') || dbErr.message.includes('relation')) {
                logger.warn('[RouteAPI] calculated_routes table not found — returning empty (table will be created on next restart)');
                return res.json({ success: true, data: [], count: 0 });
            }
            throw dbErr;
        }

        // v5.171: Filter by division in JS (after fetch)
        const isAdminView = divisionId === 'all' || divisionId === 'all' || !divisionId;
        const targetDivision = String(divisionId || '').trim();
        
        const filteredByDivision = routes.filter(r => {
            if (isAdminView) return true;
            const routeDiv = String(r.division_id || '').trim();
            return routeDiv === targetDivision || routeDiv === '' || routeDiv === 'null' || routeDiv === 'undefined' || !routeDiv;
        });

        logger.info(`[RouteAPI] Found ${routes.length} routes, filtered to ${filteredByDivision.length} by division (${targetDivision})`);

        const formattedRoutes = filteredByDivision.map(r => {
            const timeBlock = r.route_data?.deliveryWindow || r.route_data?.timeBlocks || r.route_data?.timeBlock || '';

            if (!r.courier_id) return null;

            const routeOrders = (r.route_data?.orders || []).map(o => ({
                id: o.id,
                orderNumber: o.orderNumber,
                address: o.address,
                lat: o.lat,
                lng: o.lng,
                coords: o.coords,
                courier: o.courier,
                status: o.status,
                plannedTime: o.deliveryTime || o.plannedTime,
                deliveryTime: o.deliveryTime,
                deliveryZone: o.deliveryZone,
                kmlZone: o.kmlZone,
                isAddressLocked: o.isAddressLocked
            }));

            return {
                id: r.id,
                courier: r.courier_id,
                courier_id: r.courier_id,
                totalDistance: Math.round(parseFloat(r.total_distance || 0) * 100) / 100,
                totalDuration: Math.round((r.total_duration || 0) / 60),
                ordersCount: r.orders_count || routeOrders.length,
                timeBlocks: timeBlock || 'Без часу',
                timeBlock: timeBlock || 'Без часу',
                targetDate: r.route_data?.target_date || null,
                startAddress: r.route_data?.startAddress,
                endAddress: r.route_data?.endAddress,
                startCoords: r.route_data?.startCoords || null,
                endCoords: r.route_data?.endCoords || null,
                geoMeta: r.route_data?.geoMeta || null,
                orders: routeOrders,
                isOptimized: true,
                isTurboRoute: true,
                createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now()
            };
        }).filter(r => r !== null);


        res.json({ success: true, data: formattedRoutes, count: formattedRoutes.length });
    } catch (error) {
        logger.error('Error fetching calculated routes:', error);
        // v5.170: Return JSON error, not HTML
        res.status(500).json({ success: false, error: error.message, message: 'Failed to fetch routes' });
    }
});

// GET /api/routes/:id - Get specific route
router.get('/:id', (req, res) => {
    res.json({ success: true, data: { id: req.params.id } });
});

// POST /api/routes/save - Save or update a calculated route (v5.200)
router.post('/save', auditLog('save_calculated_route'), async (req, res) => {
    try {
        const route = req.body;
        if (!route || !route.courier) {
            return res.status(400).json({ success: false, error: 'Route data and courier are required' });
        }

        const divisionId = route.division_id || req.user?.divisionId || 'all';
        const targetDate = route.targetDate || (route.route_data?.target_date) || new Date().toISOString().split('T')[0];

        // Format for DB
        const dbData = {
            courier_id: route.courier || route.courier_id,
            division_id: String(divisionId),
            total_distance: parseFloat(route.totalDistance || 0),
            total_duration: parseInt(route.totalDuration || 0) * 60, // convert back to seconds
            engine_used: route.engine_used || 'manual_frontend',
            orders_count: route.orders?.length || route.ordersCount || 0,
            route_data: {
                ...route,
                target_date: targetDate,
                last_saved_by: req.user?.id
            },
            updated_at: new Date()
        };

        // Try to find existing route for this courier and date (and division)
        // v5.200: Match by courier/date
        const { Op } = require('sequelize');
        let dbRoute = await Route.findOne({
            where: {
                courier_id: dbData.courier_id,
                [Op.and]: [
                    sequelize.where(
                        sequelize.literal("route_data->>'target_date'"),
                        targetDate
                    )
                ]
            }
        });

        if (dbRoute) {
            await dbRoute.update(dbData);
            logger.info(`[RouteAPI] Updated route for ${dbData.courier_id} on ${targetDate}`);
        } else {
            dbRoute = await Route.create(dbData);
            logger.info(`[RouteAPI] Created new route for ${dbData.courier_id} on ${targetDate}`);
        }

        res.json({ success: true, data: dbRoute });
    } catch (error) {
        logger.error('Error saving calculated route:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/routes - Create new route
router.post('/', auditLog('create_route'), (req, res) => {
    res.json({ success: true, data: { ...req.body, id: 'route_new' } });
});

// POST /api/routes/from-waypoints - Create route from waypoints
router.post('/from-waypoints', auditLog('create_route_waypoints'), (req, res) => {
    res.json({ success: true, data: { id: 'route_from_waypoints', input: req.body } });
});

// PUT /api/routes/:id - Update route
router.put('/:id', auditLog('update_route'), (req, res) => {
    res.json({ success: true, data: { id: req.params.id, ...req.body } });
});

// PUT /api/routes/:id/complete - Complete route
router.put('/:id/complete', auditLog('complete_route'), (req, res) => {
    res.json({ success: true, data: { id: req.params.id, status: 'completed' } });
});

// PUT /api/routes/:id/archive - Archive route
router.put('/:id/archive', auditLog('archive_route'), (req, res) => {
    res.json({ success: true, data: { id: req.params.id, archived: true } });
});

// DELETE /api/routes/:id - Delete route
router.delete('/:id', auditLog('delete_route'), (req, res) => {
    res.json({ success: true });
});

// DELETE /api/routes/all/calculated - Delete all calculated routes for a division/date
router.delete('/all/calculated', async (req, res) => {
    try {
        const divisionId = req.query.divisionId || req.user?.divisionId;
        const targetDate = req.query.date || new Date().toISOString().split('T')[0];

        const { Op } = require('sequelize');
        const whereClause = {};

        if (divisionId && divisionId !== 'all' && divisionId !== 'null' && divisionId !== 'undefined') {
            whereClause[Op.or] = [
                { division_id: String(divisionId) },
                { division_id: null }
            ];
        }

        whereClause[Op.and] = [
            sequelize.where(
                sequelize.literal("route_data->>'target_date'"),
                targetDate
            )
        ];

        const deletedCount = await Route.destroy({ where: whereClause });
        logger.info(`[RouteAPI] 🗑️ User requested clear all routes. Deleted ${deletedCount} routes for division ${divisionId} on ${targetDate}`);

        res.json({ success: true, deletedCount });
    } catch (error) {
        logger.error('Error clearing all calculated routes:', error);
        res.status(500).json({ success: false, error: error.message, message: 'Failed to clear routes' });
    }
});

// GET /api/routes/statistics - Get route statistics
router.get('/statistics', (req, res) => {
    res.json({ success: true, data: {} });
});

module.exports = router;
