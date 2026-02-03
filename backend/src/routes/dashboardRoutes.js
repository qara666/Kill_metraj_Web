const { authenticateToken, authorize, auditLog } = require('../middleware/auth');

const axios = require('axios');
const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

const DASHBOARD_API_BASE_URL = process.env.DASHBOARD_API_URL || 'http://localhost:8000';

// All routes require authentication and dashboard:read permission
router.use(authenticateToken);
router.use(authorize('dashboard:read'));

/**
 * GET /api/v1/dashboard
 * Получение данных дашборда (заказы и курьеры) через прокси
 */
router.get('/dashboard', async (req, res) => {
    try {
        const {
            top = 1000,
            dateShift,
            timeDeliveryBeg,
            timeDeliveryEnd,
            departmentId,
            divisionId
        } = req.query;


        // Use the server's EXTERNAL_API_KEY instead of client-provided key
        // This is a proxy server, so we should use our own credentials
        const apiKey = process.env.EXTERNAL_API_KEY;

        if (!apiKey) {
            logger.error('EXTERNAL_API_KEY not configured in environment variables');
            return res.status(500).json({
                success: false,
                error: 'Сервер не настроен для работы с внешним API'
            });
        }


        // Helper to format Date to dd.mm.yyyy format
        const formatDateForExternalApi = (date) => {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}.${month}.${year}`;
        };

        // Formating parameters for external API
        let params = {
            top: parseInt(top, 10) || 1000,
        };

        // Normalize dateShift (External API strictly requires dd.mm.yyyy)
        let effectiveDate = formatDateForExternalApi(new Date());
        if (dateShift && dateShift !== 'undefined' && dateShift !== 'null' && String(dateShift).trim()) {
            const val = String(dateShift).trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
                // Convert yyyy-mm-dd to dd.mm.yyyy
                const [y, m, d] = val.split('-').map(Number);
                params.dateShift = effectiveDate;
                logger.debug('Прокси: сконвертирована дата', { original: val, converted: params.dateShift });
            } else {
                params.dateShift = val;
                effectiveDate = val;
            }
        }

        // Set mandatory time parameters for current day/shift
        params.timeDeliveryBeg = `${effectiveDate} 00:00:00`;
        params.timeDeliveryEnd = `${effectiveDate} 23:59:59`;



        // Department ID strictly as integer
        const rawDeptId = departmentId || divisionId || req.query.department_id || req.query.division_id || req.query.branchId || req.query.subdivisionId;
        if (rawDeptId && rawDeptId !== 'undefined' && rawDeptId !== 'null' && String(rawDeptId).trim() !== '') {
            const deptIdValue = parseInt(String(rawDeptId).trim(), 10);
            if (!isNaN(deptIdValue)) {
                params.departmentId = deptIdValue;
            }
        }



        const TARGET_URL = `${DASHBOARD_API_BASE_URL}/api/v1/dashboard`;

        // 3. Выполняем запрос
        const response = await axios.get(TARGET_URL, {
            params: params,
            headers: {
                'x-api-key': apiKey,
                'Accept': 'application/json'
            },
            timeout: 60000,
            validateStatus: (status) => status < 500
        });


        // Check if we got a 4xx error
        if (response.status >= 400 && response.status < 500) {
            logger.warn('Dashboard API вернула клиентскую ошибку', {
                status: response.status,
                statusText: response.statusText,
                data: response.data
            });
            return res.status(response.status).json({
                success: false,
                error: response.data?.detail || 'Ошибка валидации параметров',
                details: response.data,
                statusCode: response.status
            });
        }

        logger.info('Запрос к Dashboard API выполнен успешно', {
            ordersCount: response.data.orders?.length || 0,
            couriersCount: response.data.couriers?.length || 0
        });

        // Просто пробрасываем ответ
        res.json(response.data);

    } catch (error) {
        logger.error('Ошибка прокси-сервера Dashboard API', { error: error.message });

        if (error.response) {
            // Ошибка от внешнего API - логируем полные детали
            logger.error('Детали ошибки внешнего API', {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data
            });

            // Special handling for 500 errors
            if (error.response.status === 500) {
                logger.error('Критическая ошибка внешнего API (500)', {
                    url: TARGET_URL,
                    params: params,
                    data: error.response.data
                });
            }

            return res.status(error.response.status).json({
                success: false,
                error: error.response.data?.detail || error.response.data?.message || 'Ошибка внешнего API',
                details: error.response.data,
                statusCode: error.response.status
            });
        } else if (error.request) {
            // Таймаут или отсутствие связи
            logger.error('Ошибка запроса (нет ответа)', { error: error.message });
            return res.status(503).json({
                success: false,
                error: 'Внешний API недоступен или превышено время ожидания',
                details: error.message
            });
        } else {
            // Внутренняя ошибка
            logger.error('Внутренняя ошибка', { error: error.message });
            return res.status(500).json({
                success: false,
                error: 'Внутренняя ошибка прокси-сервера',
                details: error.message
            });
        }
    }
});

/**
 * GET /api/v1/health
 */
router.get('/health', async (req, res) => {
    try {
        const response = await axios.get(`${DASHBOARD_API_BASE_URL}/health`, { timeout: 5000 });
        res.json({ success: true, apiStatus: 'available', apiResponse: response.data });
    } catch (error) {
        res.status(503).json({ success: false, apiStatus: 'unavailable', error: error.message });
    }
});

module.exports = router;
