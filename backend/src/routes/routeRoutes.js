const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { authenticateToken, auditLog } = require('../middleware/auth');
const { sequelize, Route } = require('../models');

// Все маршруты требуют аутентификации
router.use(authenticateToken);

// GET /api/routes - Получить все маршруты (из локального состояния)
router.get('/', (req, res) => {
    res.json({ success: true, data: [] });
});

// GET /api/routes/calculated - Получить рассчитанные маршруты из базы данных (Turbo Robot)
router.get('/calculated', async (req, res) => {
    try {
        const divisionId = req.query.divisionId || req.user?.divisionId;
        const targetDate = req.query.date; // Опциональный фильтр даты с фронтенда

        // v5.171: Упрощенный запрос — сначала получить все маршруты для даты, фильтровать в JS
        // Комбинация Op.and + Op.or вызывала проблемы с извлечением JSON
        const { Op } = require('sequelize');
        const whereClause = {};

        // v5.150: Нормализация targetDate в YYYY-MM-DD для согласованности запросов к БД
        let queryDate = targetDate;
        if (queryDate && queryDate.includes('.')) {
            const parts = queryDate.split('.');
            if (parts.length === 3 && parts[2].length === 4) {
                queryDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
        } else if (!queryDate) {
            queryDate = new Date().toISOString().split('T')[0];
        }

        // Использовать простой where — получать только по target_date
        // Фильтровать по дивизиону в JS после получения
        whereClause[Op.and] = [
            sequelize.where(
                sequelize.literal("route_data->>'target_date'"),
                queryDate
            )
        ];

        // Получение routes
        let routes = [];
        try {
            routes = await Route.findAll({
                where: whereClause,
                order: [['created_at', 'DESC']],
                limit: 5000
            });
        } catch (dbErr) {
            // v5.170: Если таблица еще не существует (первый деплой), вернуть пустой результат вместо 500
            if (dbErr.message.includes('does not exist') || dbErr.message.includes('relation')) {
                logger.warn('[RouteAPI] calculated_routes table not found — returning empty (table will be created on next restart)');
                return res.json({ success: true, data: [], count: 0 });
            }
            throw dbErr;
        }

        // v5.171: Фильтрация по дивизиону в JS (после получения)
        // v7.x: СТРОГАЯ фильтрация — показывать маршруты только из дивизиона пользователя
        const targetDivision = String(divisionId || '').trim();
        
        const filteredByDivision = routes.filter(r => {
            if (!targetDivision) {
                return true;
            }
            const routeDiv = String(r.division_id || '').trim();
            return routeDiv === targetDivision;
        });

        logger.info(`[RouteAPI] Found ${routes.length} routes, filtered to ${filteredByDivision.length} by division (${targetDivision})`);

        const formattedRoutes = filteredByDivision.map(r => {
            let rd = r.route_data;
            if (typeof rd === 'string') {
                try { rd = JSON.parse(rd); } catch (e) { rd = {}; }
            }
            const timeBlock = rd?.deliveryWindow || rd?.timeBlocks || rd?.timeBlock || '';

            if (!r.courier_id) return null;

            const routeOrders = (rd?.orders || []).map(o => ({
                id: o.id,
                orderNumber: o.orderNumber,
                ttlEnd: o.ttlEnd,
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
                targetDate: rd?.target_date || null,
                startAddress: rd?.startAddress,
                endAddress: rd?.endAddress,
                startCoords: rd?.startCoords || null,
                endCoords: rd?.endCoords || null,
                geoMeta: rd?.geoMeta || null,
                orders: routeOrders,
                _manualModified: rd?._manualModified === true,
                isOptimized: true,
                isTurboRoute: true,
                createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now()
            };
        }).filter(r => r !== null);


        res.json({ success: true, data: formattedRoutes, count: formattedRoutes.length });
    } catch (error) {
        logger.error('Error fetching calculated routes:', error);
        // v5.170: Вернуть JSON-ошибку, а не HTML
        res.status(500).json({ success: false, error: error.message, message: 'Failed to fetch routes' });
    }
});

// GET /api/routes/:id - Получить конкретный маршрут
router.get('/:id', (req, res) => {
    res.json({ success: true, data: { id: req.params.id } });
});

// POST /api/routes/save - Сохранить или обновить рассчитанный маршрут (v5.200)
router.post('/save', auditLog('save_calculated_route'), async (req, res) => {
    try {
        const route = req.body;
        if (!route || (!route.courier && !route.courier_id)) {
            logger.warn('[RouteAPI] Save rejected: Missing courier info', { body: route });
            return res.status(400).json({ success: false, error: 'Route data and courier_id are required' });
        }

        const divisionId = route.division_id || req.user?.divisionId || 'all';
        const targetDate = route.targetDate || (route.route_data?.target_date) || new Date().toISOString().split('T')[0];

        // Форматирование для БД
        const dist = parseFloat(route.totalDistance || 0);
        let courierId = route.courier_id || route.courier;
        if (typeof courierId === 'object' && courierId !== null) {
            courierId = courierId.name || courierId.id || String(courierId);
        }

        const manualMod = route._manualModified || route.route_data?._manualModified;
        const dbData = {
            courier_id: String(courierId),
            division_id: String(divisionId),
            total_distance: isNaN(dist) ? 0 : dist,
            total_duration: parseInt(route.totalDuration || 0) * 60,
            engine_used: route.engine_used || 'manual_frontend',
            orders_count: route.orders?.length || route.ordersCount || 0,
            route_data: {
                ...route,
                target_date: targetDate,
                last_saved_by: req.user?.id,
                _manualModified: manualMod
            },
            updated_at: new Date()
        };

        // Сначала попытаться найти существующий маршрут по ID
        let dbRoute = null;
        if (route.id && !isNaN(parseInt(route.id)) && String(route.id).match(/^\d+$/)) {
            try {
                dbRoute = await Route.findByPk(route.id);
            } catch (err) {
                logger.warn(`[RouteAPI] findByPk failed for ID ${route.id}: ${err.message}`);
            }
        }

        const { Op } = require('sequelize');

        // Если нет ID или не найден по ID, попробовать сопоставление courier + date + time_block
        if (!dbRoute) {
            const timeBlock = route.time_block || route.route_data?.time_block;
            
            const whereConditions = [
                sequelize.where(
                    sequelize.literal("route_data->>'target_date'"),
                    targetDate
                )
            ];

            if (timeBlock) {
                whereConditions.push(
                    sequelize.where(
                        sequelize.literal("route_data->>'time_block'"),
                        timeBlock
                    )
                );
            }

            dbRoute = await Route.findOne({
                where: {
                    courier_id: dbData.courier_id,
                    [Op.and]: whereConditions
                }
            });
        }

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

// POST /api/routes - Создать новый маршрут
router.post('/', auditLog('create_route'), (req, res) => {
    res.json({ success: true, data: { ...req.body, id: 'route_new' } });
});

// POST /api/routes/from-waypoints - Создать маршрут из путевых точек
router.post('/from-waypoints', auditLog('create_route_waypoints'), (req, res) => {
    res.json({ success: true, data: { id: 'route_from_waypoints', input: req.body } });
});

// PUT /api/routes/:id - Обновить маршрут
router.put('/:id', auditLog('update_route'), (req, res) => {
    res.json({ success: true, data: { id: req.params.id, ...req.body } });
});

// PUT /api/routes/:id/complete - Завершить маршрут
router.put('/:id/complete', auditLog('complete_route'), (req, res) => {
    res.json({ success: true, data: { id: req.params.id, status: 'completed' } });
});

// PUT /api/routes/:id/archive - Архивировать маршрут
router.put('/:id/archive', auditLog('archive_route'), (req, res) => {
    res.json({ success: true, data: { id: req.params.id, archived: true } });
});

// DELETE /api/routes/:id - Удалить маршрут
router.delete('/:id', auditLog('delete_route'), (req, res) => {
    res.json({ success: true });
});

// DELETE /api/routes/all/calculated - Удалить все рассчитанные маршруты для дивизиона/даты
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
        logger.info(`[RouteAPI]  User requested clear all routes. Deleted ${deletedCount} routes for division ${divisionId} on ${targetDate}`);

        res.json({ success: true, deletedCount });
    } catch (error) {
        logger.error('Error clearing all calculated routes:', error);
        res.status(500).json({ success: false, error: error.message, message: 'Failed to clear routes' });
    }
});

// GET /api/routes/statistics - Получить статистику маршрутов
router.get('/statistics', (req, res) => {
    res.json({ success: true, data: {} });
});

module.exports = router;
