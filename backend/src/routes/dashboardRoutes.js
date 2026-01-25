const express = require('express');
const axios = require('axios');
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

        // Используем любую комбинацию departmentId/divisionId и отправляем ВСЕ варианты во внешний API
        const rawDeptId = departmentId || divisionId || req.query.department_id || req.query.division_id || req.query.branchId || req.query.branch_id || req.query.subdivisionId || req.query.subdivision_id;
        const finalDeptId = String(rawDeptId || '').trim();

        if (finalDeptId && finalDeptId !== 'undefined' && finalDeptId !== 'null' && finalDeptId !== '') {
            const deptIdValue = parseInt(finalDeptId, 10);
            params.departmentId = deptIdValue;
            params.divisionId = deptIdValue;
            params.department_id = deptIdValue;
            params.division_id = deptIdValue;
            params.branchId = deptIdValue;
            params.branch_id = deptIdValue;
            params.branch_Id = deptIdValue;
            params.subdivisionId = deptIdValue;
            params.subdivision_id = deptIdValue;
            params.deptId = deptIdValue;
            params.dept_id = deptIdValue;
            params.id = deptIdValue;
        }

        // Удаляем из query параметров самого запроса лишнее, если нужно, 
        // но axios.get(url, { params }) добавит их правильно.
        console.log('📡 Proxy Request to Dashboard API:', {
            url: `${DASHBOARD_API_BASE_URL}/api/v1/dashboard`,
            params,
            hasApiKey: !!apiKey
        });

        // Запрос к Dashboard API
        const response = await axios.get(`${DASHBOARD_API_BASE_URL}/api/v1/dashboard`, {
            params,
            headers: {
                'x-api-key': apiKey,
                'Accept': 'application/json'
            },
            timeout: 60000 // 60 секунд для надежности
        });

        console.log('✅ Dashboard API Success:', {
            ordersCount: response.data.orders?.length || 0,
            couriersCount: response.data.couriers?.length || 0
        });

        // Просто пробрасываем ответ
        res.json(response.data);

    } catch (error) {
        console.error('❌ Dashboard API Proxy Error:', error.message);

        if (error.response) {
            // Ошибка от внешнего API
            return res.status(error.response.status).json({
                success: false,
                error: error.response.data?.detail || error.response.data?.message || 'Ошибка внешнего API',
                details: error.response.data
            });
        } else if (error.request) {
            // Таймаут или отсутствие связи
            return res.status(503).json({
                success: false,
                error: 'Внешний API недоступен или превышено время ожидания',
                details: error.message
            });
        } else {
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
