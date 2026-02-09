const { authenticateToken, authorize, auditLog } = require('../middleware/auth');
const { DashboardState } = require('../models'); // Added import

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
        // Fix for strangely serialized request body (spread string issue)
        if (req.body && !req.body.date && req.body['0'] === '{') {
            try {
                const bodyStr = Object.values(req.body).join('');
                req.body = JSON.parse(bodyStr);
                logger.info(`🩹 [FETCH] Fixed mangled request body:`, JSON.stringify(req.body));
            } catch (err) {
                logger.error(`❌ [FETCH] Failed to fix mangled request body:`, err.message);
            }
        }

        const { date, divisionId: requestDivisionId, force = false } = req.body;

        // Detailed logging to debug 422 errors
        logger.info(`🔍 [FETCH REQUEST] Body:`, JSON.stringify(req.body));

        // Валидация даты
        if (!date || !/^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
            logger.warn(`⚠️ [FETCH] Invalid date format: ${date}`);
            return res.status(422).json({
                success: false,
                error: 'Неверный формат даты. Ожидается DD.MM.YYYY',
                received: date
            });
        }

        // Определяем divisionId
        // Определяем divisionId
        let divisionId = user.role === 'admin'
            ? (requestDivisionId || user.divisionId || 'all')
            : user.divisionId;

        // Если divisionId = 'all' (как у админа по умолчанию), используем дефолтный ID
        if (divisionId === 'all') {
            const defaultDept = process.env.DASHBOARD_DEPARTMENT_ID || '100000052';
            logger.warn(`⚠️ [FETCH] 'all' division detected for user (${user.username}). Using default: ${defaultDept}`);
            divisionId = defaultDept;
        }

        if (!divisionId) {
            logger.warn(`⚠️ [FETCH] Missing divisionId for user ${user.username}`);
            return res.status(422).json({
                success: false,
                error: 'Не указан divisionId, и дефолтный ID не найден'
            });
        }

        logger.info(`📅 On-demand fetch запрос: date=${date}, divisionId=${divisionId}, user=${user.username}`);

        // Standardize date format for DB lookup and storage
        // targetDateStr will be DD.MM.YYYY (legacy)
        // targetDateISO will be YYYY-MM-DD (standard)
        const targetDateStr = date.trim();
        let targetDateISO = targetDateStr;
        if (/^\d{2}\.\d{2}\.\d{4}$/.test(targetDateStr)) {
            const [d, m, y] = targetDateStr.split('.');
            targetDateISO = `${y}-${m}-${d}`;
        }

        // Defined departments for multi-fetch
        const departmentsToFetch = divisionId === 'all'
            ? ['100000052', '100000053', '100000001', '100000002']
            : [divisionId];

        logger.info(`📅 Fetching data for ${departmentsToFetch.length} departments on ${targetDateStr}`);

        const fetchPromises = departmentsToFetch.map(async (divId) => {
            // 1. Check cache (skip if force=true)
            const cachedResults = force ? [] : await sequelize.query(
                `SELECT * FROM api_dashboard_cache 
                 WHERE status_code = 200 
                 AND (target_date = :targetDateISO OR target_date = :targetDateStr)
                 AND division_id = :divisionId
                 ORDER BY created_at DESC LIMIT 1`,
                {
                    replacements: {
                        targetDateISO,
                        targetDateStr,
                        divisionId: String(divId)
                    },
                    type: sequelize.QueryTypes.SELECT
                }
            );

            if (cachedResults.length > 0) {
                logger.debug(`✅ Cache hit for ${targetDateStr}, divId=${divId}`);
                return { divId, data: cachedResults[0].payload, cached: true };
            }

            // 2. Fetch from External API
            if (!process.env.EXTERNAL_API_KEY) {
                throw new Error('Внешний API не настроен');
            }

            const [day, month, year] = targetDateStr.split('.');
            const timeBeg = `${targetDateStr} 00:00:00`;
            const timeEnd = `${targetDateStr} 23:59:59`;
            const apiUrl = process.env.EXTERNAL_API_URL || 'http://app.yaposhka.kh.ua:4999/api/v1/dashboard';

            const params = {
                top: '2000',
                timeDeliveryBeg: timeBeg,
                timeDeliveryEnd: timeEnd,
                departmentId: divId
            };

            const response = await axios.get(apiUrl, {
                headers: {
                    'x-api-key': process.env.EXTERNAL_API_KEY || 'killmetraj_secret_key_2024',
                    'Accept': 'application/json'
                },
                params: params,
                timeout: 30000
            });

            const responseData = response.data;
            if (!responseData || !responseData.orders) {
                return { divId, data: null, error: 'Empty response' };
            }

            // 3. Smart Merge and Store in DB
            const crypto = require('crypto');

            // Load existing data for merging
            const prevResult = await sequelize.query(
                `SELECT payload, data_hash FROM api_dashboard_cache 
                 WHERE status_code = 200 AND division_id = :divId 
                 AND (target_date = :targetDateISO OR target_date = :targetDateStr) 
                 ORDER BY created_at DESC LIMIT 1`,
                { replacements: { divId: String(divId), targetDateISO, targetDateStr }, type: sequelize.QueryTypes.SELECT }
            );

            const prevPayload = prevResult.length > 0 ? (typeof prevResult[0].payload === 'string' ? JSON.parse(prevResult[0].payload) : prevResult[0].payload) : null;
            const lastRecordHash = prevResult.length > 0 ? prevResult[0].data_hash : null;

            const mergedOrdersMap = new Map();
            const mergedCouriersMap = new Map();

            if (prevPayload?.orders && Array.isArray(prevPayload.orders)) {
                prevPayload.orders.forEach(o => mergedOrdersMap.set(o.orderNumber, o));
            }
            if (prevPayload?.couriers && Array.isArray(prevPayload.couriers)) {
                prevPayload.couriers.forEach(c => {
                    const key = c.id || c.name;
                    if (key) mergedCouriersMap.set(key, c);
                });
            }

            const isTimeEmpty = (t) => {
                if (!t) return true;
                const s = String(t).trim();
                return s === '00:00' || s === '00:00:00' || s === '0:00' || s === '';
            };

            if (responseData.orders && Array.isArray(responseData.orders)) {
                for (const order of responseData.orders) {
                    const prevOrder = mergedOrdersMap.get(order.orderNumber);
                    if (isTimeEmpty(order.deliverBy) && !isTimeEmpty(order.plannedTime)) order.deliverBy = order.plannedTime;
                    if (isTimeEmpty(order.plannedTime) && !isTimeEmpty(order.deliverBy)) order.plannedTime = order.deliverBy;
                    order.statusTimings = { ...(prevOrder?.statusTimings || {}), ...(order.statusTimings || {}) };
                    order.departmentId = order.departmentId || divId;
                    mergedOrdersMap.set(order.orderNumber, order);
                }
            }

            if (responseData.couriers && Array.isArray(responseData.couriers)) {
                for (const courier of responseData.couriers) {
                    courier.departmentId = courier.departmentId || divId;
                    const key = courier.id || courier.name;
                    if (key) mergedCouriersMap.set(key, courier);
                }
            }

            const mergedPayload = { ...responseData, orders: Array.from(mergedOrdersMap.values()), couriers: Array.from(mergedCouriersMap.values()) };
            const dataHash = crypto.createHash('sha256').update(JSON.stringify(mergedPayload)).digest('hex');

            if (lastRecordHash === dataHash && !force) {
                return { divId, data: mergedPayload, cached: true };
            }

            await sequelize.query(
                `INSERT INTO api_dashboard_cache (payload, data_hash, status_code, division_id, target_date)
                 VALUES (:payload, :dataHash, :statusCode, :divisionId, :targetDate)`,
                {
                    replacements: {
                        payload: JSON.stringify(mergedPayload),
                        dataHash: dataHash,
                        statusCode: 200,
                        divisionId: String(divId),
                        targetDate: targetDateISO
                    }
                }
            );

            return { divId, data: mergedPayload, cached: false };
        });

        const results = await Promise.allSettled(fetchPromises);
        const successfulResults = results
            .filter(r => r.status === 'fulfilled' && r.value.data)
            .map(r => r.value);

        if (successfulResults.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Данные не найдены ни в одном из отделений'
            });
        }

        // Merge data from all successful results
        const mergedData = {
            orders: [],
            couriers: [],
            routes: [],
            addresses: [],
            warnings: [],
            statistics: { totalOrders: 0, totalAmount: 0, deliveryCount: 0, pickupCount: 0 },
            paymentMethods: [],
            errors: [],
            summary: {
                totalOrders: 0,
                totalCouriers: 0,
                departments: successfulResults.map(r => r.divId)
            }
        };

        successfulResults.forEach(result => {
            try {
                // Parse payload if it's a string (from cache)
                const payload = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;

                if (payload.orders && Array.isArray(payload.orders)) {
                    mergedData.orders.push(...payload.orders);
                }
                if (payload.couriers && Array.isArray(payload.couriers)) {
                    mergedData.couriers.push(...payload.couriers);
                }
                if (payload.routes && Array.isArray(payload.routes)) {
                    mergedData.routes.push(...payload.routes);
                }
                if (payload.paymentMethods && Array.isArray(payload.paymentMethods)) {
                    mergedData.paymentMethods.push(...payload.paymentMethods);
                }
                if (payload.addresses && Array.isArray(payload.addresses)) {
                    mergedData.addresses.push(...payload.addresses);
                }
                if (payload.warnings && Array.isArray(payload.warnings)) {
                    mergedData.warnings.push(...payload.warnings);
                }
                if (payload.statistics) {
                    mergedData.statistics.totalOrders += (payload.statistics.totalOrders || 0);
                    mergedData.statistics.totalAmount += (payload.statistics.totalAmount || 0);
                }
            } catch (parseError) {
                logger.error(`Failed to parse payload for divId ${result.divId}:`, parseError);
            }
        });

        // Deduplicate orders by orderNumber
        const orderMap = new Map();
        mergedData.orders.forEach(order => {
            if (order.orderNumber) {
                orderMap.set(order.orderNumber, order);
            }
        });
        mergedData.orders = Array.from(orderMap.values());

        // Deduplicate couriers by name
        const courierMap = new Map();
        mergedData.couriers.forEach(courier => {
            const courierName = typeof courier === 'string' ? courier : courier.name;
            if (courierName) {
                courierMap.set(courierName, courier);
            }
        });
        mergedData.couriers = Array.from(courierMap.values());

        // Deduplicate payment methods
        mergedData.paymentMethods = Array.from(new Set(mergedData.paymentMethods));

        // Update summary
        mergedData.summary.totalOrders = mergedData.orders.length;
        mergedData.summary.totalCouriers = mergedData.couriers.length;

        logger.info(`✅ Merged data: ${mergedData.orders.length} orders, ${mergedData.couriers.length} couriers from ${successfulResults.length} departments`);

        // Return merged data
        res.json({
            success: true,
            data: mergedData,
            message: `Загружено ${mergedData.orders.length} заказов из ${successfulResults.length} отделений`,
            fetchedAt: new Date().toISOString()
        });

    } catch (error) {
        logger.error('❌ Ошибка on-demand fetch:', {
            message: error.message,
            stack: error.stack
        });

        if (error.response) {
            return res.status(error.response.status || 500).json({
                success: false,
                error: 'Ошибка внешнего API',
                details: error.response.data
            });
        }

        res.status(500).json({
            success: false,
            error: 'Внутренняя ошибка сервера',
            details: error.message
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

module.exports = router;
