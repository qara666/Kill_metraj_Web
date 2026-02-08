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
        const { date, divisionId: requestDivisionId } = req.body;

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

        // Конвертируем дату в формат для БД (DD.MM.YYYY)
        const targetDateStr = date.trim();

        // 1. Проверяем кэш в БД
        const { sequelize } = require('../models');
        const cachedResults = await sequelize.query(
            `SELECT * FROM api_dashboard_cache 
             WHERE status_code = 200 
             AND target_date = :targetDate 
             AND division_id = :divisionId
             ORDER BY created_at DESC LIMIT 1`,
            {
                replacements: { targetDate: targetDateStr, divisionId: String(divisionId) },
                type: sequelize.QueryTypes.SELECT
            }
        );

        // Если данные есть в кэше - возвращаем
        if (cachedResults.length > 0) {
            logger.info(`✅ Cache hit для ${targetDateStr}, divisionId=${divisionId}`);

            let payload = cachedResults[0].payload;

            // Фильтруем по divisionId если не админ
            if (user.role !== 'admin' && user.divisionId) {
                payload = {
                    ...payload,
                    orders: (payload.orders || []).filter(o => String(o.departmentId) === String(user.divisionId)),
                    couriers: (payload.couriers || []).filter(c => String(c.departmentId) === String(user.divisionId))
                };
            }

            return res.json({
                success: true,
                data: payload,
                cached: true,
                fetchedAt: cachedResults[0].created_at
            });
        }

        // 2. Данных нет - делаем запрос к внешнему API
        logger.info(`🔄 Cache miss для ${targetDateStr}. Запрос к внешнему API...`);

        if (!process.env.EXTERNAL_API_KEY) {
            return res.status(503).json({
                success: false,
                error: 'Внешний API не настроен. Обратитесь к администратору.'
            });
        }

        // Парсим дату для формирования временного диапазона
        const [day, month, year] = targetDateStr.split('.');
        const timeBeg = `${targetDateStr} 00:00:00`;
        const timeEnd = `${targetDateStr} 23:59:59`;

        const apiUrl = process.env.EXTERNAL_API_URL || 'http://app.yaposhka.kh.ua:4999/api/v1/dashboard';

        const params = {
            top: '2000',
            timeDeliveryBeg: timeBeg,
            timeDeliveryEnd: timeEnd,
            departmentId: divisionId
        };

        logger.debug(`API запрос: ${apiUrl}`, params);

        const response = await axios.get(apiUrl, {
            headers: {
                'x-api-key': process.env.EXTERNAL_API_KEY,
                'Accept': 'application/json'
            },
            params: params,
            timeout: 30000 // 30 секунд для пользовательского запроса
        });

        const responseData = response.data;

        if (!responseData || !responseData.orders) {
            return res.status(404).json({
                success: false,
                error: 'Внешний API вернул пустой ответ'
            });
        }

        // 3. Сохраняем в БД для будущих запросов
        const crypto = require('crypto');
        const dataHash = crypto.createHash('sha256').update(JSON.stringify(responseData)).digest('hex');

        await sequelize.query(
            `INSERT INTO api_dashboard_cache (payload, data_hash, status_code, division_id, target_date)
             VALUES (:payload, :dataHash, :statusCode, :divisionId, :targetDate)`,
            {
                replacements: {
                    payload: JSON.stringify(responseData),
                    dataHash: dataHash,
                    statusCode: 200,
                    divisionId: String(divisionId),
                    targetDate: targetDateStr
                }
            }
        );

        logger.info(`💾 Данные за ${targetDateStr} сохранены в кэш. Заказов: ${responseData.orders?.length || 0}`);

        // Фильтруем для не-админов
        let filteredData = responseData;
        if (user.role !== 'admin' && user.divisionId) {
            filteredData = {
                ...responseData,
                orders: (responseData.orders || []).filter(o => String(o.departmentId) === String(user.divisionId)),
                couriers: (responseData.couriers || []).filter(c => String(c.departmentId) === String(user.divisionId))
            };
        }

        res.json({
            success: true,
            data: filteredData,
            cached: false,
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

/**
 * POST /api/v1/dashboard/cleanup
 * Очистка кэша и старых данных (Только для админов)
 */
router.post('/dashboard/cleanup', async (req, res) => {
    try {
        const user = req.user;
        if (user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Доступ запрещен. Требуются права администратора.'
            });
        }

        const { sequelize } = require('../models');

        // Очистка кэша
        await sequelize.query('TRUNCATE TABLE api_dashboard_cache');

        // Очистка истории (опционально, можно оставить за последние N дней, но TRUNCATE быстрее)
        await sequelize.query('TRUNCATE TABLE api_dashboard_status_history');

        logger.info(`🧹 DB Cleanup executed by ${user.username}`);

        res.json({
            success: true,
            message: 'База данных успешно очищена (кэш и история удалены).'
        });

    } catch (error) {
        logger.error('Cleanup error:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка при очистке базы данных',
            details: error.message
        });
    }
});

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
