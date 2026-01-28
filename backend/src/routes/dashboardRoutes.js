const { authenticateToken, auditLog } = require('../middleware/auth');

// Create a wrapper function that integrates with the existing structure
// Note: dashboardRoutes is already mounted at /api/v1
// We need to apply auditing. Since it's a GET request, we usually don't audit, but user requested 'what user is doing'.
// So we will audit the dashboard access.

// ... existing imports ...
const axios = require('axios');
const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Базовый URL Dashboard API
const DASHBOARD_API_BASE_URL = 'http://app.yaposhka.kh.ua:4999';

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

        const apiKey = req.headers['x-api-key'] || req.query.apiKey;

        if (!apiKey) {
            return res.status(400).json({
                success: false,
                error: 'API ключ не предоставлен'
            });
        }

        // Формирование параметров запроса для внешнего API
        const params = {
            top: parseInt(top, 10),
            apiKey: apiKey, // Pass API key in query params as upstream likely expects it
        };

        if (dateShift && dateShift !== 'undefined' && dateShift !== 'null' && dateShift.trim()) {
            params.dateShift = dateShift;
        }

        if (timeDeliveryBeg && timeDeliveryBeg !== 'undefined' && timeDeliveryBeg !== 'null' && timeDeliveryBeg.trim()) {
            params.timeDeliveryBeg = timeDeliveryBeg;
        }

        if (timeDeliveryEnd && timeDeliveryEnd !== 'undefined' && timeDeliveryEnd !== 'null' && timeDeliveryEnd.trim()) {
            params.timeDeliveryEnd = timeDeliveryEnd;
        }

        // Department/Division ID resolution
        const rawDeptId = departmentId || divisionId || req.query.department_id || req.query.division_id || req.query.branchId || req.query.subdivisionId;
        const finalDeptId = String(rawDeptId || '').trim();

        if (finalDeptId && finalDeptId !== 'undefined' && finalDeptId !== 'null' && finalDeptId !== '') {
            const deptIdValue = parseInt(finalDeptId, 10);
            if (!isNaN(deptIdValue)) {
                params.departmentId = deptIdValue;
            }
        }

        const TARGET_URL = `${DASHBOARD_API_BASE_URL}/api/v1/dashboard`;

        console.log('📡 Proxy Request to Dashboard API (Strict):', {
            url: TARGET_URL,
            params: params,
            hasApiKey: !!apiKey,
            paramTypes: {
                top: typeof params.top,
                dateShift: typeof params.dateShift,
                timeDeliveryBeg: typeof params.timeDeliveryBeg,
                timeDeliveryEnd: typeof params.timeDeliveryEnd,
                departmentId: typeof params.departmentId
            }
        });

        // Log the exact URL that will be called
        const queryString = new URLSearchParams(
            Object.entries(params).filter(([_, v]) => v !== undefined)
        ).toString();
        console.log('🔗 Full Request URL:', `${TARGET_URL}?${queryString}`);

        // 3. Выполняем запрос
        const response = await axios.get(TARGET_URL, {
            params: params,
            headers: {
                'x-api-key': apiKey,
                'Accept': 'application/json'
            },
            timeout: 60000, // 60 секунд для надежности
            validateStatus: (status) => status < 500 // Don't throw on 4xx errors
        });

        // Check if we got a 4xx error
        if (response.status >= 400 && response.status < 500) {
            console.error('❌ Dashboard API returned client error:', {
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

        console.log('✅ Dashboard API Success:', {
            ordersCount: response.data.orders?.length || 0,
            couriersCount: response.data.couriers?.length || 0
        });

        // Просто пробрасываем ответ
        res.json(response.data);

    } catch (error) {
        console.error('❌ Dashboard API Proxy Error:', error.message);

        if (error.response) {
            // Ошибка от внешнего API - логируем полные детали
            console.error('📋 External API Error Details:', {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data,
                headers: error.response.headers
            });

            return res.status(error.response.status).json({
                success: false,
                error: error.response.data?.detail || error.response.data?.message || 'Ошибка внешнего API',
                details: error.response.data,
                statusCode: error.response.status
            });
        } else if (error.request) {
            // Таймаут или отсутствие связи
            console.error('📋 Request Error (no response):', error.request);
            return res.status(503).json({
                success: false,
                error: 'Внешний API недоступен или превышено время ожидания',
                details: error.message
            });
        } else {
            // Внутренняя ошибка
            console.error('📋 Internal Error:', error);
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
