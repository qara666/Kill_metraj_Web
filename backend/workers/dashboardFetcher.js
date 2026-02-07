const axios = require('axios');
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
const logger = require('../src/utils/logger');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

/**
 * Фоновый загрузчик дашборда (Optimized V3)
 * Периодически запрашивает данные из внешнего API Fastopertor и сохраняет их в кэш PostgreSQL.
 * Особенности:
 * - Параллельная загрузка подразделений
 * - Транзакционная целостность
 * - Пакетная запись истории
 */
class DashboardFetcher {
    constructor() {
        const poolConfig = process.env.DATABASE_URL
            ? {
                connectionString: process.env.DATABASE_URL,
                ssl: {
                    require: true,
                    rejectUnauthorized: false
                }
            }
            : {
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT || '5432'),
                database: process.env.DB_NAME || 'kill_metraj',
                user: process.env.DB_USER || 'postgres',
                password: process.env.DB_PASSWORD,
            };

        this.pool = new Pool(poolConfig);

        // Конфигурация
        this.fetchInterval = 900000; // 15 минут
        this.maxRetries = parseInt(process.env.DASHBOARD_MAX_RETRIES || '5');
        this.baseBackoff = parseInt(process.env.DASHBOARD_BASE_BACKOFF || '5000');
        this.apiUrl = process.env.EXTERNAL_API_URL || 'http://app.yaposhka.kh.ua:4999/api/v1/dashboard';
        this.apiKey = process.env.EXTERNAL_API_KEY;
        this.departmentId = process.env.DASHBOARD_DEPARTMENT_ID || '100000052';
        this.topCount = process.env.DASHBOARD_TOP || '2000';

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
        logger.info('============================================================');
        logger.info('Фоновый загрузчик дашборда [OPTIMIZED V3]');
        logger.info('============================================================');
        logger.info(`API URL: ${this.apiUrl}`);
        logger.info(`Интервал загрузки: ${this.fetchInterval}мс`);
        logger.info(`Макс. попыток: ${this.maxRetries}`);
        logger.info('============================================================');

        // Проверка подключения к базе данных и установка блокировки
        try {
            await this.pool.query('SELECT NOW()');
            logger.info('База данных подключена');

            // Singleton check: используем PostgreSQL Advisory Lock
            const lockResult = await this.pool.query('SELECT pg_try_advisory_lock(777777)');
            const hasLock = lockResult.rows[0].pg_try_advisory_lock;

            if (!hasLock) {
                logger.warn('!!! ВНИМАНИЕ: Другой экземпляр загрузчика уже запущен !!!');
                logger.warn('Этот процесс продолжит работу как клон');
                return;
            }

            logger.info('Блокировка получена. Этот процесс является активным загрузчиком.');

            this.lastHash = await this.getLastHash();
            if (this.lastHash) {
                logger.info(`Загружен хеш последних данных: ${this.lastHash.substring(0, 8)}...`);
            }
        } catch (error) {
            logger.error('Ошибка инициализации загрузчика:', error.message);
            logger.warn('Цикл загрузки будет перезапущен через 1 минуту...');
            setTimeout(() => this.start(), 60000);
            return;
        }

        logger.info('Загрузчик дашборда запущен');
        logger.info('============================================================');

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
            return null;
        }
    }

    /**
     * Получение списка активных подразделений
     */
    async getActiveDepartments() {
        try {
            const result = await this.pool.query('SELECT DISTINCT "divisionId" FROM users WHERE "divisionId" IS NOT NULL');
            const depts = result.rows
                .map(r => r.divisionId)
                .filter(id => id && id !== 'all' && !isNaN(parseInt(id, 10)));

            if (process.env.DASHBOARD_DEPARTMENT_ID && !depts.includes(process.env.DASHBOARD_DEPARTMENT_ID)) {
                depts.push(process.env.DASHBOARD_DEPARTMENT_ID);
            }

            return depts.length > 0 ? depts : ['100000052'];
        } catch (error) {
            logger.error('Ошибка при получении списка подразделений:', error.message);
            return ['100000052'];
        }
    }

    /**
     * Основная логика загрузки и сохранения (Параллельная версия)
     */
    async fetchAndStore() {
        const departments = await this.getActiveDepartments();
        logger.info(`[FETCHER OPTIMIZED] Starting parallel update for ${departments.length} departments...`);

        const tasks = [];
        for (const deptId of departments) {
            // Запускаем задачи параллельно для Сегодня (0) и Вчера (-1)
            tasks.push(this.processDepartmentSafe(deptId, 0));
            tasks.push(this.processDepartmentSafe(deptId, -1));
        }

        const results = await Promise.allSettled(tasks);

        const successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
        const failCount = results.filter(r => r.status === 'rejected' || r.value === false).length;

        logger.info(`[FETCHER OPTIMIZED] Cycle finished. Success: ${successCount}, Failed: ${failCount}. Total: ${tasks.length}`);
    }

    /**
     * Обертка для безопасного вызова
     */
    async processDepartmentSafe(deptId, dateShiftDays) {
        try {
            await this.fetchForDepartment(deptId, dateShiftDays);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Загрузка данных для конкретного подразделения (Транзакционная версия)
     */
    async fetchForDepartment(deptId, dateShiftDays = 0) {
        const startTime = Date.now();
        this.totalFetches++;

        // Use Kyiv time strictly
        const targetDate = this.getKyivDate();
        targetDate.setDate(targetDate.getDate() + dateShiftDays);

        const targetDateStr = this.formatDate(targetDate, '').trim();

        // logger.debug(`[Task] Dept: ${deptId}, Date: ${targetDateStr}`);

        let client = null;

        try {
            const timeBeg = this.formatDate(targetDate, '00:00:00');
            const timeEnd = this.formatDate(targetDate, '23:59:59');

            // 1. API Request (ДО транзакции)
            const params = {
                top: '2000',
                timeDeliveryBeg: timeBeg,
                timeDeliveryEnd: timeEnd,
                departmentId: deptId
            };

            const response = await axios.get(this.apiUrl, {
                headers: {
                    'x-api-key': process.env.EXTERNAL_API_KEY || 'killmetraj_secret_key_2024',
                    'Accept': 'application/json'
                },
                params: params,
                timeout: 10000
            });
            const responseData = response.data;

            if (!responseData || !responseData.orders) {
                logger.warn(`  [Dept: ${deptId}] Empty response or no orders array`);
                return;
            }

            // 2. Начало транзакции БД
            client = await this.pool.connect();
            await client.query('BEGIN');

            // 3. Получение предыдущих данных (Внутри транзакции)
            const prevResult = await client.query(
                'SELECT payload, data_hash FROM api_dashboard_cache WHERE status_code = 200 AND division_id = $1 AND target_date = $2 ORDER BY created_at DESC LIMIT 1',
                [String(deptId), targetDateStr]
            );

            const lastRecord = prevResult.rows[0];
            const prevPayload = lastRecord ? lastRecord.payload : null;
            const lastHash = lastRecord ? lastRecord.data_hash : null;

            const prevOrders = prevPayload?.orders || [];

            // 4. Слияние данных
            const mergedOrdersMap = new Map();

            // Добавляем старые заказы
            if (prevOrders && Array.isArray(prevOrders)) {
                prevOrders.forEach(o => mergedOrdersMap.set(o.orderNumber, o));
            }

            const historyEntries = [];

            if (responseData.orders && Array.isArray(responseData.orders)) {
                for (const order of responseData.orders) {
                    const prevOrder = mergedOrdersMap.get(order.orderNumber);
                    const oldStatus = prevOrder?.status || null;
                    const newStatus = order.status;

                    // Preserve status timings
                    order.statusTimings = {
                        ...(prevOrder?.statusTimings || {}),
                        ...(order.statusTimings || {})
                    };

                    if (oldStatus !== newStatus) {
                        if (prevOrder) {
                            historyEntries.push([order.orderNumber, oldStatus, newStatus]);
                        }

                        const nowTimestamp = new Date().toISOString();
                        const normalizedStatus = newStatus.toLowerCase();

                        if (normalizedStatus === 'собран' && !order.statusTimings.assembledAt) {
                            order.statusTimings.assembledAt = nowTimestamp;
                        } else if ((normalizedStatus === 'доставляется' || normalizedStatus === 'в пути') && !order.statusTimings.deliveringAt) {
                            order.statusTimings.deliveringAt = nowTimestamp;
                        }
                    }

                    mergedOrdersMap.set(order.orderNumber, order);
                }
            }

            // 5. Формирование payload
            const mergedPayload = {
                ...responseData,
                orders: Array.from(mergedOrdersMap.values())
            };

            const dataHash = this.calculateHash(mergedPayload);

            // 6. Проверка хеша
            if (lastHash === dataHash) {
                await client.query('ROLLBACK'); // Откат пустой транзакции
                this.successfulFetches++;
                this.retryCount = 0;
                return;
            }

            // 7. Запись истории статусов (Пакетная вставка)
            if (historyEntries.length > 0) {
                for (const [orderNumber, oldStatus, newStatus] of historyEntries) {
                    await client.query(
                        'INSERT INTO api_dashboard_status_history (order_number, old_status, new_status) VALUES ($1, $2, $3)',
                        [orderNumber, oldStatus, newStatus]
                    );
                }
                logger.info(`  [Dept: ${deptId}] Recorded ${historyEntries.length} status changes`);
            }

            // 8. Сохранение кэша
            await client.query(
                `INSERT INTO api_dashboard_cache (payload, data_hash, status_code, division_id, target_date)
                 VALUES ($1, $2, $3, $4, $5)`,
                [mergedPayload, dataHash, 200, String(deptId), targetDateStr]
            );

            await client.query('COMMIT');

            this.successfulFetches++;
            this.retryCount = 0;
            const elapsed = Date.now() - startTime;

            logger.info(`  [Dept: ${deptId}] Saved ${mergedPayload.orders.length} orders (${elapsed}ms). +${historyEntries.length} updates.`);

        } catch (error) {
            if (client) {
                try { await client.query('ROLLBACK'); } catch (e) { }
            }

            let errorDetail = error.message;
            if (error.response) {
                errorDetail = `API Error ${error.response.status}: ${JSON.stringify(error.response.data).substring(0, 100)}...`;
            } else if (error.request) {
                errorDetail = `No response: ${error.message}`;
            }

            logger.error(`  [Dept: ${deptId}] Error: ${errorDetail}`);

            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
            }
            throw error;
        } finally {
            if (client) client.release();
        }
    }

    /**
     * Получение текущей даты в часовом поясе Киева
     */
    getKyivDate() {
        const now = new Date();
        const kyivTimeStr = now.toLocaleString("en-US", {
            timeZone: "Europe/Kiev"
        });
        return new Date(kyivTimeStr);
    }

    /**
     * Форматирование даты
     */
    formatDate(date, timeStr) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year} ${timeStr}`;
    }

    /**
     * Расчет хеша
     */
    calculateHash(obj) {
        const str = JSON.stringify(obj);
        return crypto.createHash('sha256').update(str).digest('hex');
    }
}

// Глобальные обработчики
process.on('uncaughtException', (err) => {
    logger.error('КРИТИЧЕСКАЯ ОШИБКА: Неперехваченное исключение в загрузчике:', err);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    logger.error('КРИТИЧЕСКАЯ ОШИБКА: Необработанное отклонение промиса в загрузчике:', promise, 'причина:', reason);
    process.exit(1);
});

module.exports = DashboardFetcher;
