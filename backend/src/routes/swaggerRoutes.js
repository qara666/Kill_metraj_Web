const express = require('express');
const axios = require('axios');
const router = express.Router();

// Базовый URL Swagger API
const SWAGGER_API_BASE_URL = 'http://app.yaposhka.kh.ua:4999';

/**
 * GET /api/swagger/orders
 * Получение заказов из Swagger API
 * 
 * Query параметры:
 * - top: количество записей (по умолчанию 200)
 * - dateShift: дата смены (формат dd.mm.yyyy)
 * - timeDeliveryBeg: начало окна доставки (формат dd.mm.yyyy HH:MM:SS)
 * - timeDeliveryEnd: конец окна доставки (формат dd.mm.yyyy HH:MM:SS)
 * - departmentId: ID подразделения
 * 
 * Headers:
 * - x-api-key: API ключ для аутентификации
 */
router.get('/orders', async (req, res) => {
    try {
        const {
            top = 1000,
            dateShift,
            timeDeliveryBeg,
            timeDeliveryEnd,
            departmentId
        } = req.query;

        const apiKey = req.headers['x-api-key'] || req.query.apiKey;

        // Валидация обязательных параметров
        if (!apiKey) {
            return res.status(400).json({
                success: false,
                error: 'API ключ не предоставлен. Используйте заголовок x-api-key или параметр apiKey в URL'
            });
        }

        // Формирование параметров запроса
        const params = {
            top: parseInt(top, 10),
        };

        if (dateShift && dateShift !== 'undefined' && dateShift !== 'null') {
            params.dateShift = dateShift;
        }
        if (timeDeliveryBeg) params.timeDeliveryBeg = timeDeliveryBeg;
        if (timeDeliveryEnd) params.timeDeliveryEnd = timeDeliveryEnd;
        if (departmentId) params.departmentId = parseInt(departmentId, 10);

        console.log('📡 Запрос к Swagger API:', {
            url: `${SWAGGER_API_BASE_URL}/api/v1/dashboard`,
            params,
            hasApiKey: !!apiKey
        });

        // Запрос к Swagger API
        const response = await axios.get(`${SWAGGER_API_BASE_URL}/api/v1/dashboard`, {
            params,
            headers: {
                'x-api-key': apiKey,
                'Accept': 'application/json'
            },
            timeout: 30000 // 30 секунд
        });

        console.log('✅ Получен ответ от Swagger API:', {
            ordersCount: response.data.orders?.length || 0,
            couriersCount: response.data.couriers?.length || 0
        });

        // Возврат данных клиенту
        res.json(response.data);

    } catch (error) {
        console.error('❌ Ошибка при запросе к Swagger API:', error.message);

        // Обработка различных типов ошибок
        if (error.response) {
            // Ошибка от Swagger API
            return res.status(error.response.status).json({
                success: false,
                error: error.response.data?.detail || error.response.data?.message || 'Ошибка Swagger API',
                details: error.response.data
            });
        } else if (error.request) {
            // Нет ответа от сервера
            return res.status(503).json({
                success: false,
                error: 'Swagger API недоступен. Проверьте подключение к серверу.',
                details: error.message
            });
        } else {
            // Другие ошибки
            return res.status(500).json({
                success: false,
                error: 'Внутренняя ошибка сервера',
                details: error.message
            });
        }
    }
});

/**
 * GET /api/swagger/health
 * Проверка доступности Swagger API
 */
router.get('/health', async (req, res) => {
    try {
        const response = await axios.get(`${SWAGGER_API_BASE_URL}/health`, {
            timeout: 5000
        });

        res.json({
            success: true,
            swaggerApiStatus: 'available',
            swaggerResponse: response.data
        });
    } catch (error) {
        res.status(503).json({
            success: false,
            swaggerApiStatus: 'unavailable',
            error: error.message
        });
    }
});

module.exports = router;
