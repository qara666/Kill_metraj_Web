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

        // Проверка подключения к базе данных и установка блокировки
        try {
            await this.pool.query('SELECT NOW()');
            console.log('База данных подключена');

            // Singleton check: используем PostgreSQL Advisory Lock
            // 777777 - произвольный ID для блокировки загрузчика
            const lockResult = await this.pool.query('SELECT pg_try_advisory_lock(777777)');
            const hasLock = lockResult.rows[0].pg_try_advisory_lock;

            if (!hasLock) {
                console.warn('!!! ВНИМАНИЕ: Другой экземпляр загрузчика уже запущен !!!');
                console.warn('Этот процесс будет завершен для экономии ресурсов.');
                process.exit(0);
                return;
            }

            console.log('Блокировка получена. Этот процесс является активным загрузчиком.');

            // Загрузка последнего хеша для обнаружения изменений после перезапуска
            this.lastHash = await this.getLastHash();
            if (this.lastHash) {
                console.log(`Загружен хеш последних данных: ${this.lastHash.substring(0, 8)}...`);
            }
        } catch (error) {
            console.error('Ошибка инициализации загрузчика:', error.message);
            console.warn('Цикл загрузки будет перезапущен через 1 минуту...');
            setTimeout(() => this.start(), 60000);
            return;
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
     * Получение списка активных подразделений из таблицы пользователей
     */
    async getActiveDepartments() {
        try {
            const result = await this.pool.query('SELECT DISTINCT "divisionId" FROM users WHERE "divisionId" IS NOT NULL');
            const depts = result.rows.map(r => r.divisionId);

            // Если указан дефолтный ID в окружении, добавляем его
            if (process.env.DASHBOARD_DEPARTMENT_ID && !depts.includes(process.env.DASHBOARD_DEPARTMENT_ID)) {
                depts.push(process.env.DASHBOARD_DEPARTMENT_ID);
            }

            return depts.length > 0 ? depts : ['100000052'];
        } catch (error) {
            console.error('Ошибка при получении списка подразделений:', error.message);
            return ['100000052'];
        }
    }

    /**
     * Основная логика загрузки и сохранения
     */
    async fetchAndStore() {
        const departments = await this.getActiveDepartments();
        console.log(`[${new Date().toISOString()}] Запуск цикла обновления для ${departments.length} подразделений (Сегодня и Вчера)...`);

        for (const deptId of departments) {
            // Загружаем данные за сегодня (0) и за вчера (-1)
            await this.fetchForDepartment(deptId, 0);
            await this.fetchForDepartment(deptId, -1);
        }
    }

    /**
     * Загрузка данных для конкретного подразделения
     */
    async fetchForDepartment(deptId, dateShiftDays = 0) {
        const startTime = Date.now();
        this.totalFetches++;

        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + dateShiftDays);
        const targetDateStr = targetDate.toISOString().split('T')[0];

        try {
            console.log(`  [Dept: ${deptId}, Date: ${targetDateStr}] Загрузка данных... (Попытка ${this.retryCount + 1})`);

            // Подготовка параметров запроса
            const params = {
                top: this.topCount,
                timeDeliveryBeg: this.formatDate(targetDate, '00:00:00'),
                timeDeliveryEnd: this.formatDate(targetDate, '23:59:59'),
                departmentId: parseInt(deptId, 10)
            };

            const response = await axios.get(this.apiUrl, {
                headers: {
                    'x-api-key': this.apiKey,
                    'Accept': 'application/json'
                },
                params: params,
                timeout: 30000 // Увеличиваем таймаут до 30с
            });
            const responseData = response.data;

            // 1. Получение предыдущих заказов для сравнения (из этой же дивизии и за эту же дату)
            const prevResult = await this.pool.query(
                'SELECT payload FROM api_dashboard_cache WHERE status_code = 200 AND division_id = $1 AND target_date = $2 ORDER BY created_at DESC LIMIT 1',
                [String(deptId), targetDateStr]
            );
            const prevPayload = prevResult.rows.length > 0 ? prevResult.rows[0].payload : null;
            const prevOrders = prevPayload?.orders || [];
            const ordersMap = new Map(prevOrders.map(o => [o.orderNumber, o]));

            // 2. Отслеживание изменений статуса
            if (responseData.orders && Array.isArray(responseData.orders)) {
                for (const order of responseData.orders) {
                    const prevOrder = ordersMap.get(order.orderNumber);
                    const oldStatus = prevOrder?.status || null;
                    const newStatus = order.status;

                    order.statusTimings = {
                        ...(prevOrder?.statusTimings || {}),
                        ...(order.statusTimings || {})
                    };

                    if (oldStatus !== newStatus) {
                        await this.pool.query(
                            'INSERT INTO api_dashboard_status_history (order_number, old_status, new_status) VALUES ($1, $2, $3)',
                            [order.orderNumber, oldStatus, newStatus]
                        ).catch(e => console.error('  Ошибка записи истории:', e.message));

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

            // Расчет хеша и проверка изменений
            const dataHash = this.calculateHash(responseData);

            // Получаем последний хеш именно для этого подразделения и даты
            const lastHashResult = await this.pool.query(
                'SELECT data_hash FROM api_dashboard_cache WHERE division_id = $1 AND target_date = $2 ORDER BY created_at DESC LIMIT 1',
                [String(deptId), targetDateStr]
            );
            const lastHash = lastHashResult.rows.length > 0 ? lastHashResult.rows[0].data_hash : null;

            if (lastHash === dataHash) {
                console.log(`  [Dept: ${deptId}] Данные не изменились`);
                this.successfulFetches++;
                this.retryCount = 0;
                return;
            }

            // Вставка новых данных в базу с указанием целевой даты
            await this.pool.query(
                `INSERT INTO api_dashboard_cache (payload, data_hash, status_code, division_id, target_date)
                 VALUES ($1, $2, $3, $4, $5)`,
                [responseData, dataHash, 200, String(deptId), targetDateStr]
            );

            this.successfulFetches++;
            this.retryCount = 0;

            const elapsed = Date.now() - startTime;
            console.log(`  [Dept: ${deptId}] Сохранено ${responseData.orders?.length || 0} заказов (${elapsed}мс)`);

        } catch (error) {
            console.error(`  [Dept: ${deptId}] Ошибка: ${error.message}`);
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                const delay = this.baseBackoff * Math.pow(2, this.retryCount - 1);
                console.log(`    Повтор через ${delay}мс...`);
                setTimeout(() => this.fetchForDepartment(deptId), delay);
            } else {
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
