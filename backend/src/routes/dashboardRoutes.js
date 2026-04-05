const { authenticateToken, authorize, auditLog } = require('../middleware/auth');
const { DashboardState, sequelize } = require('../models');
const crypto = require('crypto');

const axios = require('axios');
const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// ... (existing code)

/**
 * GET /api/v1/state
 * Получение сохраненного состояния дашборда для текущего пользователя
 */
router.get('/state', authenticateToken, async (req, res) => {
    try {
        const state = await DashboardState.findOne({
            where: { userId: req.user.id }
        });

        if (!state) {
            return res.json({
                success: true,
                data: null
            });
        }

        res.json({
            success: true,
            data: state.data
        });
    } catch (error) {
        logger.error('Ошибка получения состояния дашборда', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Ошибка получения состояния'
        });
    }
});

/**
 * POST /api/v1/state
 * Сохранение состояния дашборда для текущего пользователя
 */
router.post('/state', authenticateToken, async (req, res) => {
    try {
        const { data } = req.body;

        if (!data) {
            return res.status(400).json({
                success: false,
                error: 'Данные отсутствуют'
            });
        }

        const [state, created] = await DashboardState.upsert({
            userId: req.user.id,
            data: data,
            lastSavedAt: new Date()
        }, {
            returning: true
        });

        res.json({
            success: true,
            message: created ? 'Состояние создано' : 'Состояние обновлено',
            lastSavedAt: state.lastSavedAt
        });
    } catch (error) {
        logger.error('Ошибка сохранения состояния дашборда', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Ошибка сохранения состояния',
            details: error.message
        });
    }
});


// Use DASHBOARD_API_URL (base) or extract from EXTERNAL_API_URL (full)
let DASHBOARD_API_BASE_URL = process.env.DASHBOARD_API_URL;
if (!DASHBOARD_API_BASE_URL && process.env.EXTERNAL_API_URL) {
    try {
        const url = new URL(process.env.EXTERNAL_API_URL);
        DASHBOARD_API_BASE_URL = `${url.protocol}//${url.host}`;
        logger.info(`DASHBOARD_API_BASE_URL extracted from EXTERNAL_API_URL: ${DASHBOARD_API_BASE_URL}`);
    } catch (e) {
        DASHBOARD_API_BASE_URL = 'http://localhost:8000';
    }
}
DASHBOARD_API_BASE_URL = DASHBOARD_API_BASE_URL || 'http://localhost:8000';

// All routes require authentication and dashboard:read permission
router.use(authenticateToken);
router.use(authorize('dashboard:read'));

const GetDashboardDataQuery = require('../queries/GetDashboardDataQuery');

/**
 * GET /api/v1/dashboard
 * Теперь служит фасадом для кэшированных данных, чтобы не ломать старый фронтенд
 */
router.get('/dashboard', async (req, res) => {
    try {
        const user = req.user;
        const { dateShift, divisionId: queryDivisionId, departmentId } = req.query;

        // Маппинг параметров для совместимости
        const date = dateShift && dateShift.includes('-') ? dateShift : null;
        const divisionId = user.role === 'admin' ? (queryDivisionId || departmentId || 'all') : user.divisionId;

        logger.info(`Dashboard Proxy Facade: Попытка получить данные для ${divisionId}`);

        const result = await GetDashboardDataQuery.execute({ divisionId, user, date });

        if (!result) {
            // Если данных нет в кэше и ключ API настроен, можно попробовать проксировать (старое поведение)
            if (!process.env.EXTERNAL_API_KEY) {
                return res.status(500).json({
                    success: false,
                    error: 'Записи в кэше отсутствуют и Сервер не настроен для работы с внешним API'
                });
            }
            // ... (здесь мог бы быть прокси-код, но мы предпочитаем кэш)
            return res.status(404).json({
                success: false,
                error: 'Данные в кэше не найдены'
            });
        }

        // Возвращаем данные в формате, который ожидает старый фронтенд
        res.json(result.payload);

    } catch (error) {
        logger.error('Ошибка фасада Dashboard API', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Внутренняя ошибка прокси-фасада',
            details: error.message
        });
    }
});

/**
 * POST /api/v1/dashboard/fetch
 * On-demand загрузка данных за конкретную дату
 * Если данных нет в кэше - запрашивает у внешнего API
 */
router.post('/dashboard/fetch', async (req, res) => {
    try {
        const user = req.user;
        // Robust fix for mangled request body
        if (req.body && !req.body.date && (req.body['0'] === '{' || typeof req.body === 'string')) {
            try {
                let bodyStr = typeof req.body === 'string' ? req.body : Object.values(req.body).join('');
                if (bodyStr.startsWith('{')) {
                    req.body = JSON.parse(bodyStr);
                }
            } catch (err) {
                logger.error(`❌ [FETCH] Failed to fix mangled body:`, err.message);
            }
        }

        const { date, divisionId: requestDivisionId, force = false } = req.body;
        if (!date || !/^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
            return res.status(422).json({ success: false, error: 'Неверный формат даты' });
        }

        const divisionId = user.role === 'admin' ? (requestDivisionId || user.divisionId || 'all') : user.divisionId;
        const targetDateStr = date.trim();
        const [d, m, y] = targetDateStr.split('.');
        const targetDateISO = `${y}-${m}-${d}`;
        const isGlobal = (divisionId === 'all');

        logger.info(`📅 Fetch request: date=${targetDateStr}, divisionId=${divisionId}, isGlobal=${isGlobal}, user=${user.username}`);

        // 1. Initial Cache Check (Skip if force=true)
        if (!force && !isGlobal) {
            const cached = await sequelize.query(
                `SELECT payload FROM api_dashboard_cache 
                 WHERE status_code = 200 AND division_id = :divId AND target_date = :targetDate 
                 LIMIT 1`,
                { replacements: { divId: String(divisionId), targetDate: targetDateISO }, type: sequelize.QueryTypes.SELECT }
            );
            if (cached.length > 0) {
                logger.debug(`✅ Cache hit for ${divisionId}`);
                const payload = typeof cached[0].payload === 'string' ? JSON.parse(cached[0].payload) : cached[0].payload;
                return res.json({ success: true, data: payload, fromCache: true });
            }
        }

        // 2. Fetch from External API
        const apiUrl = req.body.apiUrl || process.env.EXTERNAL_API_URL || 'http://app.yaposhka.kh.ua:4999/api/v1/dashboard';
        const apiKey = req.body.apiKey || process.env.EXTERNAL_API_KEY || 'killmetraj_secret_key_2024';
        const params = {
            top: '2000',
            timeDeliveryBeg: `${targetDateStr} 00:00:00`,
            timeDeliveryEnd: `${targetDateStr} 23:59:59`
        };
        if (!isGlobal) params.departmentId = divisionId;

        logger.info(`🚀 API Call: ${apiUrl} (dept=${params.departmentId || 'GLOBAL'})`);
        const response = await axios.get(apiUrl, {
            headers: { 'x-api-key': apiKey, 'Accept': 'application/json' },
            params: params,
            timeout: 30000
        });

        const responseData = response.data;
        if (!responseData || !responseData.orders) {
            logger.warn(`⚠️ Empty response from API for ${targetDateStr}`);
            return res.json({ success: true, data: { orders: [], couriers: [] }, message: 'Данные отсутствуют' });
        }

        // 3. Process and Split Data
        const processAndCache = async (deptId, deptData) => {
            const payload = { ...deptData, orders: deptData.orders || [], couriers: deptData.couriers || [] };
            const dataHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
            const orderCount = payload.orders.length;
            const courierCount = payload.couriers.length;

            // v31.2: PRESERVE robot-calculated distances from existing cache
            try {
                const oldCache = await sequelize.query(
                    `SELECT payload FROM api_dashboard_cache WHERE division_id = :divId AND target_date = :targetDate LIMIT 1`,
                    { replacements: { divId: String(deptId), targetDate: targetDateISO }, type: sequelize.QueryTypes.SELECT }
                );
                if (oldCache && oldCache.length > 0) {
                    const oldPayload = typeof oldCache[0].payload === 'string' ? JSON.parse(oldCache[0].payload) : oldCache[0].payload;
                    if (oldPayload && oldPayload.couriers && Array.isArray(oldPayload.couriers)) {
                        const metricMap = new Map();
                        oldPayload.couriers.forEach(c => {
                            const name = (c.name || c.courierName || c.courier || '').toString().trim().toUpperCase();
                            if (name && (c.distanceKm > 0 || c.calculatedOrders > 0)) {
                                metricMap.set(name, { distanceKm: c.distanceKm, calculatedOrders: c.calculatedOrders });
                            }
                        });
                        payload.couriers.forEach(c => {
                            const name = (c.name || c.courierName || c.courier || '').toString().trim().toUpperCase();
                            const metrics = metricMap.get(name);
                            if (metrics) {
                                c.distanceKm = metrics.distanceKm;
                                c.calculatedOrders = metrics.calculatedOrders;
                            }
                        });
                    }
                }
            } catch (err) {
                logger.warn(`[FETCH] Metric restoration failed: ${err.message}`);
            }

            // V2: UPSERT pattern matching the fetcher worker
            await sequelize.query(
                `INSERT INTO api_dashboard_cache (payload, data_hash, status_code, division_id, target_date, order_count, courier_count, updated_at)
                 VALUES (:payload, :dataHash, 200, :divisionId, :targetDate, :orderCount, :courierCount, NOW())
                 ON CONFLICT (division_id, target_date) DO UPDATE SET
                   payload = EXCLUDED.payload,
                   data_hash = EXCLUDED.data_hash,
                   status_code = EXCLUDED.status_code,
                   order_count = EXCLUDED.order_count,
                   courier_count = EXCLUDED.courier_count,
                   updated_at = NOW()`,
                {
                    replacements: {
                        payload: JSON.stringify(payload),
                        dataHash,
                        divisionId: String(deptId),
                        targetDate: targetDateISO,
                        orderCount,
                        courierCount
                    }
                }
            );

            // Notify WebSocket clients via PG Notify (consistent with fetcher)
            await sequelize.query('SELECT pg_notify(\'dashboard_update\', :notifyData)', {
                replacements: {
                    notifyData: JSON.stringify({
                        divisionId: deptId,
                        targetDate: targetDateISO,
                        orderCount,
                        courierCount,
                        source: 'on_demand_fetch'
                    })
                },
                type: sequelize.QueryTypes.SELECT
            });

            return payload;
        };

        if (isGlobal) {
            // Split global data by department and cache each
            const deptGroups = {};
            responseData.orders.forEach(o => {
                const dId = String(o.departmentId || o.divisionId || 'UNKNOWN');
                if (!deptGroups[dId]) deptGroups[dId] = { orders: [], couriers: [] };
                deptGroups[dId].orders.push(o);
            });

            // Associate couriers with departments (if they have departmentId)
            if (responseData.couriers) {
                responseData.couriers.forEach(c => {
                    const dId = String(c.departmentId || c.divisionId || '');
                    if (dId && deptGroups[dId]) {
                        deptGroups[dId].couriers.push(c);
                    } else {
                        // If no explicit dept, add to all active departments
                        Object.keys(deptGroups).forEach(dKey => {
                            deptGroups[dKey].couriers.push(c);
                        });
                    }
                });
            }

            // Save each group to cache
            for (const dId of Object.keys(deptGroups)) {
                await processAndCache(dId, deptGroups[dId]);
            }

            logger.info(`✅ Global fetch: Cached ${Object.keys(deptGroups).length} departments`);
            return res.json({
                success: true,
                data: responseData,
                message: `Загружено ${responseData.orders.length} заказов из всех отделений`,
                fetchedAt: new Date().toISOString()
            });
        }

        // Single department fetch
        const resultPayload = await processAndCache(divisionId, responseData);
        return res.json({
            success: true,
            data: resultPayload,
            message: `Загружено ${resultPayload.orders.length} заказов`,
            fetchedAt: new Date().toISOString()
        });

    } catch (error) {
        logger.error('❌ Fetch Error:', error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.message,
            details: error.response?.data
        });
    }
});

// Maintenance routes moved to maintenanceRoutes.js

/**
 * GET /api/v1/health
 */
router.get('/dashboard/health', async (req, res) => {
    try {
        const response = await axios.get(`${DASHBOARD_API_BASE_URL}/health`, { timeout: 5000 });
        res.json({ success: true, apiStatus: 'available', apiResponse: response.data });
    } catch (error) {
        res.status(503).json({ success: false, apiStatus: 'unavailable', error: error.message });
    }
});

/**
 * GET /api/v1/dashboard/metrics
 * Получить метрики работы fetcher (только для админов)
 */
router.get('/dashboard/metrics', authorize('admin'), async (req, res) => {
    try {
        const { sequelize } = require('../models');

        // Статистика кэша
        const cacheStats = await sequelize.query(
            `SELECT 
                COUNT(*) as total_entries,
                COUNT(DISTINCT division_id) as unique_divisions,
                COUNT(DISTINCT target_date) as unique_dates,
                MAX(created_at) as last_update,
                MIN(created_at) as oldest_entry
             FROM api_dashboard_cache`,
            { type: sequelize.QueryTypes.SELECT }
        );

        // Статистика изменений статусов
        const statusStats = await sequelize.query(
            `SELECT 
                COUNT(*) as total_changes,
                COUNT(DISTINCT order_number) as unique_orders,
                MAX(created_at) as last_change
             FROM api_dashboard_status_history
             WHERE created_at > NOW() - INTERVAL '24 hours'`,
            { type: sequelize.QueryTypes.SELECT }
        );

        // Топ изменений статусов
        const topChanges = await sequelize.query(
            `SELECT old_status, new_status, COUNT(*) as count
             FROM api_dashboard_status_history
             WHERE created_at > NOW() - INTERVAL '24 hours'
             GROUP BY old_status, new_status
             ORDER BY count DESC
             LIMIT 10`,
            { type: sequelize.QueryTypes.SELECT }
        );

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            cache: cacheStats[0],
            statusChanges: {
                last24h: statusStats[0],
                topTransitions: topChanges
            },
            systemInfo: {
                nodeVersion: process.version,
                platform: process.platform,
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage()
            }
        });

    } catch (error) {
        logger.error('Metrics error:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка при получении метрик',
            details: error.message
        });
    }
});

/**
 * GET /api/v1/dashboard/analytics/couriers
 * Агрегированная статистика по курьерам за период
 */
router.get('/dashboard/analytics/couriers', async (req, res) => {
    try {
        const { startDate, endDate, divisionId: reqDivId } = req.query;
        const user = req.user;
        const divisionId = user.role === 'admin' ? (reqDivId || 'all') : user.divisionId;

        if (!startDate || !endDate) {
            return res.status(400).json({ success: false, error: 'startDate и endDate обязательны' });
        }

        logger.info(`📊 Courier Analytics Request: ${startDate} to ${endDate}, divisionId=${divisionId}`);

        // Fetch all cache entries for the period
        const whereClause = divisionId === 'all' 
            ? 'target_date BETWEEN :start AND :end'
            : 'target_date BETWEEN :start AND :end AND division_id = :divId';
        
        const cacheEntries = await sequelize.query(
            `SELECT target_date, division_id, payload 
             FROM api_dashboard_cache 
             WHERE ${whereClause}
             ORDER BY target_date ASC`,
            { 
                replacements: { start: startDate, end: endDate, divId: String(divisionId) },
                type: sequelize.QueryTypes.SELECT 
            }
        );

        // Aggregate statistics by courier
        const courierMetrics = {};

        cacheEntries.forEach(entry => {
            const payload = typeof entry.payload === 'string' ? JSON.parse(entry.payload) : entry.payload;
            if (!payload) return;

            const orders = payload.orders || [];
            const couriers = payload.couriers || [];

            // 1. Group orders by courier name for this specific date
            const ordersByCourier = {};
            orders.forEach(o => {
                const name = (o.courier || '').toString().trim().toUpperCase();
                if (!name) return;
                if (!ordersByCourier[name]) ordersByCourier[name] = 0;
                ordersByCourier[name]++;
            });

            // 2. Add courier info and metrics from payload
            couriers.forEach(c => {
                const name = (c.name || c.courierName || c.courier || '').toString().trim().toUpperCase();
                if (!name) return;

                if (!courierMetrics[name]) {
                    courierMetrics[name] = {
                        name: c.name || name,
                        totalOrders: 0,
                        totalDistanceKm: 0,
                        totalCalculatedOrders: 0,
                        daysWorked: new Set(),
                        avgEfficiency: 0,
                        vehicleType: c.vehicleType || 'car'
                    };
                }

                courierMetrics[name].totalOrders += (ordersByCourier[name] || 0);
                courierMetrics[name].totalDistanceKm += (c.distanceKm || 0);
                courierMetrics[name].totalCalculatedOrders += (c.calculatedOrders || 0);
                courierMetrics[name].daysWorked.add(entry.target_date);
            });
        });

        // Finalize aggregation
        const result = Object.values(courierMetrics).map(m => ({
            ...m,
            daysWorked: m.daysWorked.size,
            avgOrdersPerDay: m.daysWorked.size > 0 ? (m.totalOrders / m.daysWorked.size).toFixed(1) : 0,
            avgDistancePerOrder: m.totalCalculatedOrders > 0 ? (m.totalDistanceKm / m.totalCalculatedOrders).toFixed(2) : 0,
            efficiencyScore: m.totalDistanceKm > 0 ? (m.totalCalculatedOrders / m.totalDistanceKm).toFixed(2) : 0
        })).sort((a, b) => b.totalOrders - a.totalOrders);

        res.json({
            success: true,
            period: { start: startDate, end: endDate },
            couriers: result,
            totalDays: cacheEntries.length
        });

    } catch (error) {
        logger.error('Courier Analytics Error:', error);
        res.status(500).json({ success: false, error: 'Ошибка при расчете аналитики', details: error.message });
    }
});

/**
 * GET /api/v1/dashboard/analytics/full
 * Полная аналитика логистики за период
 */
router.get('/dashboard/analytics/full', async (req, res) => {
    try {
        const { startDate, endDate, divisionId: reqDivId } = req.query;
        const analyticsService = require('../services/AnalyticsService');
        const user = req.user;
        const divisionId = user.role === 'admin' ? (reqDivId || 'all') : user.divisionId;

        if (!startDate || !endDate) {
            return res.status(400).json({ success: false, error: 'startDate и endDate обязательны' });
        }

        const data = await analyticsService.getLogisticsOverview(startDate, endDate, divisionId);
        res.json({
            success: true,
            data
        });

    } catch (error) {
        logger.error('Logistics Analytics Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
