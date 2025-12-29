const axios = require('axios');

class FastopertorController {
    /**
     * Получить данные из Fastopertor API
     */
    async fetchData(req, res) {
        try {
            const { apiUrl, apiKey, endpoint } = req.body;

            if (!apiUrl || !apiKey) {
                return res.status(400).json({
                    success: false,
                    error: 'API URL и API Key обязательны'
                });
            }

            // Валидация API URL
            let validatedUrl;
            try {
                validatedUrl = new URL(apiUrl);
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    error: 'Неверный формат API URL'
                });
            }

            // Формируем полный URL endpoint
            const fullUrl = endpoint 
                ? `${validatedUrl.origin}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
                : validatedUrl.href;

            console.log(`🔄 FastopertorController: Запрос к ${fullUrl}`);

            // Выполняем запрос к Fastopertor API
            const response = await axios.get(fullUrl, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 30000 // 30 секунд таймаут
            });

            // Проверяем статус ответа
            if (response.status !== 200) {
                return res.status(response.status).json({
                    success: false,
                    error: `API вернул статус ${response.status}`,
                    details: response.data
                });
            }

            // Преобразуем данные в формат приложения
            const transformedData = this.transformFastopertorData(response.data);

            res.json({
                success: true,
                data: transformedData,
                raw: response.data, // Возвращаем также сырые данные для отладки
                message: 'Данные успешно получены из Fastopertor API'
            });

        } catch (error) {
            console.error('❌ FastopertorController: Ошибка получения данных:', error);

            if (error.response) {
                // API вернул ошибку
                return res.status(error.response.status).json({
                    success: false,
                    error: `Ошибка API: ${error.response.status}`,
                    details: error.response.data,
                    message: error.response.data?.message || error.message
                });
            } else if (error.request) {
                // Запрос был отправлен, но ответа не получено
                return res.status(503).json({
                    success: false,
                    error: 'Не удалось подключиться к API',
                    details: error.message
                });
            } else {
                // Ошибка при настройке запроса
                return res.status(500).json({
                    success: false,
                    error: 'Ошибка при выполнении запроса',
                    details: error.message
                });
            }
        }
    }

    /**
     * Валидация API подключения
     */
    async validateApi(req, res) {
        try {
            const { apiUrl, apiKey } = req.body;

            if (!apiUrl || !apiKey) {
                return res.status(400).json({
                    success: false,
                    error: 'API URL и API Key обязательны'
                });
            }

            // Валидация API URL
            let validatedUrl;
            try {
                validatedUrl = new URL(apiUrl);
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    error: 'Неверный формат API URL'
                });
            }

            // Пробуем выполнить простой запрос для проверки
            const testUrl = `${validatedUrl.origin}/health`; // Предполагаем наличие health endpoint

            try {
                const response = await axios.get(testUrl, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000 // 10 секунд для валидации
                });

                res.json({
                    success: true,
                    valid: response.status === 200,
                    message: 'API подключение успешно'
                });
            } catch (error) {
                // Пробуем альтернативный endpoint
                try {
                    const altResponse = await axios.get(validatedUrl.href, {
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 10000
                    });

                    res.json({
                        success: true,
                        valid: altResponse.status === 200,
                        message: 'API подключение успешно'
                    });
                } catch (altError) {
                    res.json({
                        success: false,
                        valid: false,
                        error: 'Не удалось подключиться к API',
                        details: altError.response?.data || altError.message
                    });
                }
            }
        } catch (error) {
            console.error('❌ FastopertorController: Ошибка валидации:', error);
            res.status(500).json({
                success: false,
                valid: false,
                error: 'Ошибка при валидации API',
                details: error.message
            });
        }
    }

    /**
     * Преобразование данных из Fastopertor в формат приложения
     */
    transformFastopertorData(data) {
        // Если данные уже в правильном формате
        if (data.orders && data.couriers) {
            return {
                orders: this.transformOrders(data.orders),
                couriers: this.transformCouriers(data.couriers),
                paymentMethods: data.paymentMethods || [],
                routes: data.routes || [],
                errors: [],
                warnings: []
            };
        }

        // Если данные в другом формате, пытаемся преобразовать
        const transformed = {
            orders: [],
            couriers: [],
            paymentMethods: [],
            routes: [],
            errors: [],
            warnings: []
        };

        // Пытаемся найти заказы в разных возможных форматах
        if (Array.isArray(data)) {
            // Если данные - массив, предполагаем что это заказы
            transformed.orders = this.transformOrders(data);
        } else if (data.data && Array.isArray(data.data)) {
            transformed.orders = this.transformOrders(data.data);
        } else if (data.results && Array.isArray(data.results)) {
            transformed.orders = this.transformOrders(data.results);
        }

        // Пытаемся найти курьеров
        if (data.couriers && Array.isArray(data.couriers)) {
            transformed.couriers = this.transformCouriers(data.couriers);
        } else if (data.drivers && Array.isArray(data.drivers)) {
            transformed.couriers = this.transformCouriers(data.drivers);
        }

        return transformed;
    }

    /**
     * Преобразование заказов
     */
    transformOrders(orders) {
        if (!Array.isArray(orders)) {
            return [];
        }

        return orders.map((order, index) => ({
            orderNumber: order.orderNumber || order.order_id || order.id || `ORDER_${index + 1}`,
            address: order.address || order.delivery_address || order.address_full || '',
            phone: order.phone || order.phone_number || order.contact_phone || '',
            customerName: order.customerName || order.customer_name || order.client_name || '',
            amount: order.amount || order.total || order.sum || 0,
            courier: order.courier || order.courier_name || order.driver || '',
            paymentMethod: order.paymentMethod || order.payment_method || order.payment || '',
            plannedTime: order.plannedTime || order.planned_time || order.delivery_time || null,
            readyAt: order.readyAt || order.ready_at || order.ready_time || null,
            deadlineAt: order.deadlineAt || order.deadline_at || order.deadline || null,
            note: order.note || order.notes || order.comment || '',
            priority: order.priority || 'normal',
            status: order.status || 'pending',
            raw: order // Сохраняем исходные данные
        }));
    }

    /**
     * Преобразование курьеров
     */
    transformCouriers(couriers) {
        if (!Array.isArray(couriers)) {
            return [];
        }

        return couriers.map((courier, index) => ({
            name: courier.name || courier.driver_name || courier.full_name || `COURIER_${index + 1}`,
            phoneNumber: courier.phoneNumber || courier.phone || courier.phone_number || '',
            email: courier.email || '',
            vehicleType: courier.vehicleType || courier.vehicle_type || 'car',
            isActive: courier.isActive !== undefined ? courier.isActive : (courier.active !== undefined ? courier.active : true),
            location: courier.location || courier.current_location || '',
            raw: courier // Сохраняем исходные данные
        }));
    }

    async sendOrders(req, res) {
        try {
            const orders = await Order.find(); // Получаем данные о заказах из базы данных
            return res.json(orders);
        } catch (error) {
            return res.status(500).json({ message: 'Ошибка при получении данных о заказах' });
        }
    }
}

module.exports = { FastopertorController };

