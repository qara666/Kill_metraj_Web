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
        
        // v5.143: Get routes with optional date filtering
        const { Op } = require('sequelize');
        const whereClause = {};
        
        // Filter by division_id if explicitly provided
        // v5.156: Admins (division_id === 'all') should see routes for ALL divisions
        if (divisionId && divisionId !== 'all' && divisionId !== 'null' && divisionId !== 'undefined') {
            whereClause[Op.or] = [
                { division_id: String(divisionId) },
                { division_id: null }
            ];
        }
        // If divisionId is 'all', we don't add division filtering at all, 
        // allowing admins to see everything.
        
        // v5.143: Filter by date if provided (route_data->>'target_date')
        if (targetDate) {
            whereClause[Op.and] = whereClause[Op.and] || [];
            whereClause[Op.and].push(
                sequelize.where(
                    sequelize.literal("route_data->>'target_date'"),
                    targetDate
                )
            );
        } else {
            // v5.156: If no date provided, try to find the MOST RECENT calculated date
            // This prevents the "empty dashboard after midnight" bug.
            // For now, we fallback to today but logged it for debugging.
            const today = new Date().toISOString().split('T')[0];
            whereClause[Op.and] = whereClause[Op.and] || [];
            whereClause[Op.and].push(
                sequelize.where(
                    sequelize.literal("route_data->>'target_date'"),
                    today
                )
            );
        }
        
        // Get routes
        const routes = await Route.findAll({
            where: whereClause,
            order: [['created_at', 'DESC']],
            limit: 1000
        });
        
        logger.info(`[RouteAPI] Found ${routes.length} routes in database (date: ${targetDate || 'today'})`);
        
        const formattedRoutes = routes.map(r => {
            const timeBlock = r.route_data?.deliveryWindow || r.route_data?.timeBlocks || r.route_data?.timeBlock || '';
            
            // v30.0: Only drop truly empty/null rows — not empty timeBlock (valid routes get dropped!)
            if (!r.courier_id) return null;
            
            const routeOrders = (r.route_data?.orders || []).map(o => ({
                ...o,
                plannedTime: o.deliveryTime || o.plannedTime
            }));
            
            return {
                id: r.id,
                courier: r.courier_id,         // maps to frontend 'courier' field
                courier_id: r.courier_id,      // raw field for compatibility
                totalDistance: Math.round(parseFloat(r.total_distance || 0) * 100) / 100,
                totalDuration: Math.round((r.total_duration || 0) / 60),
                ordersCount: r.orders_count || routeOrders.length,
                timeBlocks: timeBlock || 'Без часу',
                timeBlock: timeBlock || 'Без часу',
                targetDate: r.route_data?.target_date || null,
                startAddress: r.route_data?.startAddress,
                endAddress: r.route_data?.endAddress,
                orders: routeOrders,
                geometry: r.route_data?.geometry || null,
                isOptimized: true,
                isTurboRoute: true,
                createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now()
            };
        }).filter(r => r !== null);

        
        res.json({ success: true, data: formattedRoutes, count: formattedRoutes.length });
    } catch (error) {
        logger.error('Error fetching calculated routes:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/routes/:id - Get specific route
router.get('/:id', (req, res) => {
    res.json({ success: true, data: { id: req.params.id } });
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

// GET /api/routes/statistics - Get route statistics
router.get('/statistics', (req, res) => {
    res.json({ success: true, data: {} });
});

module.exports = router;
