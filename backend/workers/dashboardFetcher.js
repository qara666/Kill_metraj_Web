const axios = require('axios');
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

/**
 * Фоновый загрузчик дашборда
 * Периодически запрашивает данные из внешнего API Fastopertor и сохраняет их в кэш PostgreSQL.
 */
class DashboardFetcher {
    constructor() {
        this.pool = new Pool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'kill_metraj',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD,
        });

        // Конфигурация
        this.fetchInterval = 900000; // 15 минут
        this.maxRetries = parseInt(process.env.DASHBOARD_MAX_RETRIES || '5');
        this.baseBackoff = parseInt(process.env.DASHBOARD_BASE_BACKOFF || '5000');
        this.apiUrl = process.env.EXTERNAL_API_URL || 'http://app.yaposhka.kh.ua:4999/api/v1/dashboard';
        this.apiKey = process.env.EXTERNAL_API_KEY;
        this.departmentId = process.env.DASHBOARD_DEPARTMENT_ID || '100000052';
        this.topCount = process.env.DASHBOARD_TOP || '50';

        // Диагностика
        this.totalFetches = 0;
        this.successfulFetches = 0;
        this.lastHash = null;
        this.retryCount = 0;
        this.consecutiveErrors = 0;
    }

    /**
     * Запуск цикла загрузки
     */
    async start() {
        console.log('============================================================');
        console.log('Фоновый загрузчик дашборда');
        console.log('============================================================');
        console.log(`API URL: ${this.apiUrl}`);
        console.log(`Интервал загрузки: ${this.fetchInterval}мс`);
        console.log(`Макс. попыток: ${this.maxRetries}`);
        console.log(`Базовая задержка: ${this.baseBackoff}мс`);
        console.log('============================================================');

        // Проверка подключения к базе данных
        try {
            await this.pool.query('SELECT NOW()');
            console.log('База данных подключена');

            // Загрузка последнего хеша для обнаружения изменений после перезапуска
            this.lastHash = await this.getLastHash();
            if (this.lastHash) {
                console.log(`Загружен хеш последних данных: ${this.lastHash.substring(0, 8)}...`);
            }
        } catch (error) {
            console.error('Ошибка подключения к базе данных:', error.message);
            process.exit(1);
        }

        console.log('Загрузчик дашборда запущен');
        console.log('============================================================');

        // Начальная загрузка
        await this.fetchAndStore();

        // Запуск интервала
        setInterval(() => this.fetchAndStore(), this.fetchInterval);
    }

    /**
     * Получение хеша последних сохраненных данных из базы
     */
    async getLastHash() {
        try {
            const result = await this.pool.query(
                'SELECT data_hash FROM api_dashboard_cache ORDER BY created_at DESC LIMIT 1'
            );
            return result.rows.length > 0 ? result.rows[0].data_hash : null;
        } catch (error) {
            console.error('Ошибка при получении последнего хеша:', error.message);
            return null;
        }
    }

    /**
     * Получение последних данных из базы
     */
    async getLastPayload() {
        try {
            const result = await this.pool.query(
                'SELECT payload FROM api_dashboard_cache WHERE status_code = 200 ORDER BY created_at DESC LIMIT 1'
            );
            return result.rows.length > 0 ? result.rows[0].payload : null;
        } catch (error) {
            console.error('Ошибка при получении последних данных:', error.message);
            return null;
        }
    }

    /**
     * Основная логика загрузки и сохранения
     */
    async fetchAndStore() {
        const startTime = Date.now();
        this.totalFetches++;

        try {
            console.log(`[${new Date().toISOString()}] Загрузка данных дашборда... (Попытка ${this.retryCount + 1})`);

            // Подготовка параметров запроса
            const params = {
                top: this.topCount,
                timeDeliveryBeg: this.formatDate(new Date(), '00:00:00'),
                timeDeliveryEnd: this.formatDate(new Date(), '23:59:59')
            };

            // Добавление ID подразделения, если указано
            if (process.env.DASHBOARD_DEPARTMENT_ID) {
                const deptId = parseInt(process.env.DASHBOARD_DEPARTMENT_ID, 10);
                if (!isNaN(deptId)) {
                    params.departmentId = deptId;
                }
            }

            // Загрузка данных из внешнего API
            let responseData;

            console.log('  Параметры запроса:', JSON.stringify(params, null, 2));
            console.log('  Наличие API ключа:', !!this.apiKey);

            const response = await axios.get(this.apiUrl, {
                headers: {
                    'x-api-key': this.apiKey,
                    'Accept': 'application/json'
                },
                params: params,
                timeout: 10000 // 10 секунд таймаут
            });
            responseData = response.data;

            // 1. Получение предыдущих заказов для сравнения
            const prevPayload = await this.getLastPayload();
            const prevOrders = prevPayload?.orders || [];
            const ordersMap = new Map(prevOrders.map(o => [o.orderNumber, o]));

            // 2. Отслеживание изменений статуса и обогащение данных
            if (responseData.orders && Array.isArray(responseData.orders)) {
                for (const order of responseData.orders) {
                    const prevOrder = ordersMap.get(order.orderNumber);
                    const oldStatus = prevOrder?.status || null;
                    const newStatus = order.status;

                    // Восстановление времени статусов из предыдущих данных
                    order.statusTimings = {
                        ...(prevOrder?.statusTimings || {}),
                        ...(order.statusTimings || {})
                    };

                    if (oldStatus !== newStatus) {
                        console.log(`  Изменение статуса заказа #${order.orderNumber}: ${oldStatus} -> ${newStatus}`);

                        // Сохранение в историю статусов
                        await this.pool.query(
                            'INSERT INTO api_dashboard_status_history (order_number, old_status, new_status) VALUES ($1, $2, $3)',
                            [order.orderNumber, oldStatus, newStatus]
                        );

                        // Запись конкретных меток времени, если они еще не установлены
                        const nowTimestamp = new Date().toISOString();
                        const normalizedStatus = newStatus.toLowerCase();

                        if (normalizedStatus === 'собран' && !order.statusTimings.assembledAt) {
                            order.statusTimings.assembledAt = nowTimestamp;
                        } else if ((normalizedStatus === 'доставляется' || normalizedStatus === 'в пути') && !order.statusTimings.deliveringAt) {
                            order.statusTimings.deliveringAt = nowTimestamp;
                        }
                    }
                }
            }

            // Расчет хеша для исключения дубликатов
            const dataHash = this.calculateHash(responseData);

            // Проверка на наличие изменений
            if (this.lastHash === dataHash) {
                console.log('  Данные не изменились, пропуск записи');
                this.successfulFetches++;
                this.retryCount = 0;
                this.consecutiveErrors = 0;
                return;
            }

            // Вставка новых данных в базу
            const deptId = params.departmentId || 'all';
            await this.pool.query(
                `INSERT INTO api_dashboard_cache (payload, data_hash, status_code, division_id)
         VALUES ($1, $2, $3, $4)`,
                [responseData, dataHash, 200, String(deptId)]
            );

            this.lastHash = dataHash;
            this.successfulFetches++;
            this.retryCount = 0;
            this.consecutiveErrors = 0;

            const elapsed = Date.now() - startTime;
            console.log(`  Данные успешно сохранены (${elapsed}мс) - Успешность: ${(this.successfulFetches / this.totalFetches * 100).toFixed(1)}%`);

        } catch (error) {
            this.consecutiveErrors++;
            console.error(`  Загрузка не удалась: ${error.message}`);

            if (error.response) {
                console.error(`    Статус: ${error.response.status}`);
                console.error(`    Данные: ${JSON.stringify(error.response.data)}`);
            }

            // Экспоненциальная задержка для повторов
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                const delay = this.baseBackoff * Math.pow(2, this.retryCount - 1);
                console.log(`    Повтор через ${delay}мс...`);
                setTimeout(() => this.fetchAndStore(), delay);
            } else {
                console.error('    Достигнуто максимальное количество попыток для этого цикла.');
                this.retryCount = 0;
            }
        }
    }

    /**
     * Форматирование даты для API (дд.мм.гггг ЧЧ:ММ:СС)
     */
    formatDate(date, timeStr) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year} ${timeStr}`;
    }

    /**
     * Расчет хеша объекта для дедупликации
     */
    calculateHash(obj) {
        const str = JSON.stringify(obj);
        return crypto.createHash('sha256').update(str).digest('hex');
    }
}

// Глобальные обработчики ошибок процесса
process.on('uncaughtException', (err) => {
    console.error('КРИТИЧЕСКАЯ ОШИБКА: Неперехваченное исключение в загрузчике:', err);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('КРИТИЧЕСКАЯ ОШИБКА: Необработанное отклонение промиса в загрузчике:', promise, 'причина:', reason);
    process.exit(1);
});

// Запуск загрузчика
const fetcher = new DashboardFetcher();
fetcher.start();

module.exports = DashboardFetcher;
