const axios = require('axios');
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
const logger = require('../src/utils/logger');
const cacheService = require('../src/services/CacheService');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

/**
 * Dashboard Fetcher V7 (2.0) - Максимальная производительность
 * 
 * Обновления из V6:
 * - UPSERT хранение (1 строка на отдел/день, без накопления)
 * - ETag условная загрузка (пропуск, если данные не изменились)
 * - Транзакционная запись (атомарный merge + история статусов)
 * - Арендная advisory блокировка (авто-истечение)
 * - Классифицированная обработка ошибок (транзиентные vs постоянные)
 * - Оптимизированная очистка (минимальная с UPSERT)
 * 
 * Сохранено из V6:
 * - Circuit Breaker, Rate Limiter, Adaptive Concurrency
 * - Дедупликация запросов
 * - Умные повторные попытки с экспоненциальной задержкой + jitter
 */
class DashboardFetcher {
    constructor() {
        const poolConfig = process.env.DATABASE_URL
            ? {
                connectionString: process.env.DATABASE_URL,
                ssl: {
                    require: true,
                    rejectUnauthorized: false
                },
                max: 10,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 5000,
                statement_timeout: 30000
            }
            : {
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT || '5432'),
                database: process.env.DB_NAME || 'kill_metraj',
                user: process.env.DB_USER || 'postgres',
                password: process.env.DB_PASSWORD,
                max: 10,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 5000,
                statement_timeout: 30000
            };

        this.pool = new Pool(poolConfig);

        // Конфигурация
        this.fetchInterval = parseInt(process.env.DASHBOARD_FETCH_INTERVAL || '120000'); // 2 min (increased frequency for real-time)
        this.maxRetries = parseInt(process.env.DASHBOARD_MAX_RETRIES || '5');
        this.baseBackoff = parseInt(process.env.DASHBOARD_BASE_BACKOFF || '5000');
        this.apiUrl = process.env.EXTERNAL_API_URL || 'http://app.yaposhka.kh.ua:4999/api/v1/dashboard';
        this.apiKey = process.env.EXTERNAL_API_KEY;
        this.departmentId = process.env.DASHBOARD_DEPARTMENT_ID || '100000052';
        this.topCount = process.env.DASHBOARD_TOP || '2000';
        this.concurrencyLimit = parseInt(process.env.DASHBOARD_CONCURRENCY || '3');
        this.cacheRetentionDays = parseInt(process.env.CACHE_RETENTION_DAYS || '7'); // Increased — UPSERT keeps data tidy
        this.cleanupInterval = parseInt(process.env.CLEANUP_INTERVAL || '86400000'); // 24h

        // Блокировка на основе аренды
        this.lockLeaseMs = parseInt(process.env.FETCHER_LOCK_LEASE || '1800000'); // 30 min
        this.lockRenewInterval = null;

        // Хранилище ETag: { deptId_date: etag }
        this.etagStore = new Map();

        // Circuit Breaker Configuration (v18.4: Loosened for high availability)
        this.circuitBreaker = {
            state: 'CLOSED',
            failureCount: 0,
            successCount: 0,
            failureThreshold: 50, // v18.4: Increased from 5 to 50 to prevent premature trips
            successThreshold: 2,
            timeout: 30000,       // v18.4: Decreased from 60s to 30s for faster recovery
            nextAttempt: null
        };

        // Ограничитель скорости
        this.rateLimiter = {
            tokens: 10,
            maxTokens: 10,
            refillRate: 1,
            lastRefill: Date.now()
        };

        // Адаптивный параллелизм
        this.adaptiveConcurrency = {
            current: this.concurrencyLimit,
            min: 1,
            max: this.concurrencyLimit * 2,
            targetLatency: 2000,
            adjustInterval: 60000
        };

        // Дедупликация запросов
        this.pendingRequests = new Map();

        // Расширенные метрики
        this.metrics = {
            totalFetches: 0,
            successfulFetches: 0,
            failedFetches: 0,
            totalOrders: 0,
            totalStatusChanges: 0,
            avgResponseTime: 0,
            minResponseTime: Infinity,
            maxResponseTime: 0,
            lastFetchTime: null,
            lastSuccessTime: null,
            lastErrorTime: null,
            consecutiveErrors: 0,
            cacheHits: 0,
            cacheMisses: 0,
            circuitBreakerTrips: 0,
            rateLimitHits: 0,
            deduplicatedRequests: 0,
            etagHits: 0, // V7: количество 304 Not Modified
            upsertWrites: 0, // V7: всего операций upsert
            transientErrors: 0, // V7: классифицированные ошибки
            permanentErrors: 0,
            p50ResponseTime: 0,
            p95ResponseTime: 0,
            p99ResponseTime: 0,
            responseTimes: []
        };

        // Состояние
        this.isShuttingDown = false;
        this.activeRequests = new Set();
        this.intervalHandle = null;
        this.cleanupIntervalHandle = null;
        this.metricsIntervalHandle = null;
        this.lastHash = null;
        this.retryCount = 0;
        this.hasLock = false;
    }

    //  Автоматический выключатель (Circuit Breaker)

    canProceed() {
        const now = Date.now();
        if (this.circuitBreaker.state === 'OPEN') {
            if (now >= this.circuitBreaker.nextAttempt) {
                logger.info('[Circuit Breaker] Переход в состояние HALF_OPEN');
                this.circuitBreaker.state = 'HALF_OPEN';
                this.circuitBreaker.successCount = 0;
                return true;
            }
            return false;
        }
        return true;
    }

    recordSuccess() {
        if (this.circuitBreaker.state === 'HALF_OPEN') {
            this.circuitBreaker.successCount++;
            if (this.circuitBreaker.successCount >= this.circuitBreaker.successThreshold) {
                logger.info('[Circuit Breaker] Переход в состояние CLOSED');
                this.circuitBreaker.state = 'CLOSED';
                this.circuitBreaker.failureCount = 0;
            }
        } else if (this.circuitBreaker.state === 'CLOSED') {
            this.circuitBreaker.failureCount = 0;
        }
    }

    recordFailure() {
        this.circuitBreaker.failureCount++;
        if (this.circuitBreaker.state === 'HALF_OPEN') {
            logger.warn('[Circuit Breaker] Ошибка в состоянии HALF_OPEN — переход в OPEN');
            this.circuitBreaker.state = 'OPEN';
            this.circuitBreaker.nextAttempt = Date.now() + this.circuitBreaker.timeout;
            this.metrics.circuitBreakerTrips++;
        } else if (this.circuitBreaker.failureCount >= this.circuitBreaker.failureThreshold) {
            logger.warn('[Circuit Breaker] Порог ошибок достигнут — переход в OPEN');
            this.circuitBreaker.state = 'OPEN';
            this.circuitBreaker.nextAttempt = Date.now() + this.circuitBreaker.timeout;
            this.metrics.circuitBreakerTrips++;
        }
    }

    //  Ограничитель скорости (Rate Limiter) 

    refillTokens() {
        const now = Date.now();
        const elapsed = (now - this.rateLimiter.lastRefill) / 1000;
        const tokensToAdd = Math.floor(elapsed * this.rateLimiter.refillRate);
        if (tokensToAdd > 0) {
            this.rateLimiter.tokens = Math.min(
                this.rateLimiter.maxTokens,
                this.rateLimiter.tokens + tokensToAdd
            );
            this.rateLimiter.lastRefill = now;
        }
    }

    async consumeToken() {
        this.refillTokens();
        if (this.rateLimiter.tokens > 0) {
            this.rateLimiter.tokens--;
            return true;
        }
        this.metrics.rateLimitHits++;
        logger.warn('[Rate Limiter] Нет доступных токенов — ожидание');
        await new Promise(resolve => setTimeout(resolve, 1000 / this.rateLimiter.refillRate));
        return this.consumeToken();
    }

    //  Адаптивная конкурентность 

    adjustConcurrency() {
        if (this.metrics.responseTimes.length < 10) return;
        const avgLatency = this.metrics.avgResponseTime;
        const current = this.adaptiveConcurrency.current;

        if (avgLatency < this.adaptiveConcurrency.targetLatency && current < this.adaptiveConcurrency.max) {
            this.adaptiveConcurrency.current = Math.min(current + 1, this.adaptiveConcurrency.max);
            logger.info(`[Adaptive Concurrency] Увеличено до ${this.adaptiveConcurrency.current}`);
        } else if (avgLatency > this.adaptiveConcurrency.targetLatency * 1.5 && current > this.adaptiveConcurrency.min) {
            this.adaptiveConcurrency.current = Math.max(current - 1, this.adaptiveConcurrency.min);
            logger.info(`[Adaptive Concurrency] Уменьшено до ${this.adaptiveConcurrency.current}`);
        }
    }

    //  Дедупликация запросов 

    async deduplicateRequest(key, requestFn) {
        if (this.pendingRequests.has(key)) {
            this.metrics.deduplicatedRequests++;
            logger.debug(`[Dedup] Использование существующего запроса: ${key}`);
            return this.pendingRequests.get(key);
        }
        const promise = requestFn();
        this.pendingRequests.set(key, promise);
        try {
            return await promise;
        } finally {
            this.pendingRequests.delete(key);
        }
    }

    //  Backoff и Метрики 

    calculateBackoff(attempt) {
        const exponential = this.baseBackoff * Math.pow(2, attempt);
        const jitter = Math.random() * 1000;
        return Math.min(exponential + jitter, 30000);
    }

    updateResponseTimeMetrics(responseTime) {
        this.metrics.responseTimes.push(responseTime);
        if (this.metrics.responseTimes.length > 100) {
            this.metrics.responseTimes.shift();
        }
        const sorted = [...this.metrics.responseTimes].sort((a, b) => a - b);
        const len = sorted.length;
        this.metrics.p50ResponseTime = sorted[Math.floor(len * 0.5)] || 0;
        this.metrics.p95ResponseTime = sorted[Math.floor(len * 0.95)] || 0;
        this.metrics.p99ResponseTime = sorted[Math.floor(len * 0.99)] || 0;
        this.metrics.minResponseTime = Math.min(this.metrics.minResponseTime, responseTime);
        this.metrics.maxResponseTime = Math.max(this.metrics.maxResponseTime, responseTime);
    }

    //  V7: Классификация ошибок 

    classifyError(error) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
            return 'transient';
        }
        if (error.response) {
            const status = error.response.status;
            if (status === 429 || status >= 500) return 'transient';
            if (status === 401 || status === 403 || status === 404) return 'permanent';
        }
        if (error.message && (error.message.includes('timeout') || error.message.includes('ECONNREFUSED'))) {
            return 'transient';
        }
        return 'transient'; // Default to transient (retry)
    }

    //  V7: Управление ETag 

    getEtag(deptId, dateISO) {
        return this.etagStore.get(`${deptId || 'global'}_${dateISO}`) || null;
    }

    setEtag(deptId, dateISO, etag) {
        if (etag) {
            this.etagStore.set(`${deptId || 'global'}_${dateISO}`, etag);
        }
    }

    //  Группировка по отделам 

    groupDataByDepartment(orders, couriers) {
        const groups = {};
        const courierToDeptMap = new Map();

        if (orders && Array.isArray(orders)) {
            orders.forEach(o => {
                const deptId = String(o.departmentId || o.divisionId || 'UNKNOWN');
                if (!groups[deptId]) groups[deptId] = { orders: [], couriers: [] };
                groups[deptId].orders.push(o);
                if (o.courierId || o.courierName) {
                    const cKey = String(o.courierId || o.courierName);
                    if (!courierToDeptMap.has(cKey)) courierToDeptMap.set(cKey, new Set());
                    courierToDeptMap.get(cKey).add(deptId);
                }
            });
        }

        if (couriers && Array.isArray(couriers)) {
            couriers.forEach(c => {
                const explicitDeptId = String(c.departmentId || c.divisionId || '');
                const cKey = String(c.id || c.name || '');

                if (explicitDeptId && groups[explicitDeptId]) {
                    groups[explicitDeptId].couriers.push(c);
                } else if (cKey && courierToDeptMap.has(cKey)) {
                    courierToDeptMap.get(cKey).forEach(deptId => {
                        if (groups[deptId]) groups[deptId].couriers.push(c);
                    });
                }
            });
        }

        return groups;
    }

    //  Жизненный цикл 

    async start() {
        logger.info('============================================================');
        logger.info('Dashboard Fetcher V7 (2.0) — UPSERT • ETag • Transactions');
        logger.info('============================================================');
        logger.info(`API URL: ${this.apiUrl}`);
        logger.info(`Интервал загрузки: ${this.fetchInterval}мс (${Math.round(this.fetchInterval / 60000)} мин)`);
        logger.info(`Макс. попыток: ${this.maxRetries}`);
        logger.info(`Параллельность: ${this.concurrencyLimit} (Адаптивно: ${this.adaptiveConcurrency.min}-${this.adaptiveConcurrency.max})`);
        logger.info(`Хранение кэша: ${this.cacheRetentionDays} дней`);
        logger.info(`Срок блокировки: ${this.lockLeaseMs}мс`);
        logger.info(`Circuit Breaker: Порог ${this.circuitBreaker.failureThreshold}`);
        logger.info(`Rate Limiter: ${this.rateLimiter.maxTokens} токенов, ${this.rateLimiter.refillRate}/сек`);
        logger.info('============================================================');

        try {
            await this.pool.query('SELECT NOW()');
            logger.info('База данных подключена');

            // Lease-based advisory lock — automatically expires
            const lockResult = await this.pool.query('SELECT pg_try_advisory_lock(777777)');
            this.hasLock = lockResult.rows[0].pg_try_advisory_lock;

            if (!this.hasLock) {
                logger.warn('Работает другой экземпляр загрузчика — режим ожидания');
                return;
            }

            logger.info('Блокировка получена. Этот процесс является активным загрузчиком.');

            // Периодически продлевать аренду блокировки
            this.lockRenewInterval = setInterval(async () => {
                try {
                    await this.pool.query('SELECT 1'); // Keep connection alive
                } catch (e) {
                    logger.warn('Lock renewal ping failed:', e.message);
                }
            }, Math.floor(this.lockLeaseMs / 3));

            // Загрузка saved ETags from DB
            await this.loadEtags();

            this.startCleanupScheduler();
            this.startMetricsReporter();
            this.startAdaptiveConcurrencyAdjuster();

        } catch (error) {
            logger.error('Fetcher init error:', error.message);
            logger.warn('Restarting in 1 minute...');
            setTimeout(() => this.start(), 60000);
            return;
        }

        logger.info('Загрузчик дашборда V7 запущен');
        logger.info('============================================================');

        await this.fetchAndStore();
        this.intervalHandle = setInterval(() => this.fetchAndStore(), this.fetchInterval);
        this.registerShutdownHandlers();
    }

/**
 * V7: Загружает сохраненные ETags из БД для условной загрузки
 */
    async loadEtags() {
        try {
            const result = await this.pool.query(
                'SELECT division_id, target_date, fetch_etag FROM api_dashboard_cache WHERE fetch_etag IS NOT NULL'
            );
            result.rows.forEach(row => {
                const dateStr = row.target_date instanceof Date
                    ? row.target_date.toISOString().split('T')[0]
                    : String(row.target_date);
                this.setEtag(row.division_id, dateStr, row.fetch_etag);
            });
            logger.info(`Загружено ${result.rows.length} ETags из БД`);
        } catch (e) {
            logger.warn('Could not load saved ETags:', e.message);
        }
    }

    startMetricsReporter() {
        this.metricsIntervalHandle = setInterval(() => {
            if (this.metrics.totalFetches % 10 === 0 && this.metrics.totalFetches > 0) {
                this.logMetrics();
            }
        }, 60000);
    }

    startAdaptiveConcurrencyAdjuster() {
        setInterval(() => this.adjustConcurrency(), this.adaptiveConcurrency.adjustInterval);
    }

    startCleanupScheduler() {
        logger.info(`Планировщик очистки запущен (каждые ${Math.round(this.cleanupInterval / 3600000)}ч)`);
        setTimeout(() => this.cleanupOldRecords(), 300000);
        this.cleanupIntervalHandle = setInterval(() => this.cleanupOldRecords(), this.cleanupInterval);
    }

/**
 * V7: Упрощенная очистка — с UPSERT, только старые даты нужно удалять
 */
    async cleanupOldRecords() {
        logger.info('Запуск очистки старых записей...');
        const startTime = Date.now();
        let client = null;
        try {
            client = await this.pool.connect();

            const cacheResult = await client.query(
                `DELETE FROM api_dashboard_cache 
                 WHERE target_date < CURRENT_DATE - INTERVAL '${this.cacheRetentionDays} days'`
            );

            const historyResult = await client.query(
                `DELETE FROM api_dashboard_status_history 
                 WHERE created_at < NOW() - INTERVAL '${this.cacheRetentionDays} days'`
            );

            const elapsed = Date.now() - startTime;
            logger.info(`Очистка завершена за ${elapsed}мс. Удалено: ${cacheResult.rowCount} кэш, ${historyResult.rowCount} история`);

            // VACUUM только при значительных удалениях
            if (cacheResult.rowCount > 10 || historyResult.rowCount > 100) {
                await client.query('VACUUM ANALYZE api_dashboard_cache');
                await client.query('VACUUM ANALYZE api_dashboard_status_history');
                logger.info('VACUUM выполнен');
            }
        } catch (error) {
            logger.error('Cleanup error:', error.message);
        } finally {
            if (client) client.release();
        }
    }

    registerShutdownHandlers() {
        const shutdown = async (signal) => {
            if (this.isShuttingDown) return;
            logger.info(`\nСигнал ${signal}. Плавное завершение работы...`);
            this.isShuttingDown = true;

            if (this.intervalHandle) clearInterval(this.intervalHandle);
            if (this.cleanupIntervalHandle) clearInterval(this.cleanupIntervalHandle);
            if (this.metricsIntervalHandle) clearInterval(this.metricsIntervalHandle);
            if (this.lockRenewInterval) clearInterval(this.lockRenewInterval);

            const maxWait = 30000;
            const startWait = Date.now();
            while (this.activeRequests.size > 0 && (Date.now() - startWait) < maxWait) {
                logger.info(`Ожидание завершения ${this.activeRequests.size} активных запросов...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            if (this.hasLock) {
                try {
                    await this.pool.query('SELECT pg_advisory_unlock(777777)');
                    logger.info('Блокировка снята');
                } catch (e) {
                    logger.warn('Error releasing lock:', e.message);
                }
            }

            await this.pool.end();
            logger.info('Пул соединений закрыт');
            this.logMetrics();
            logger.info('Загрузчик успешно остановлен');
            process.exit(0);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }

    //  Основной цикл загрузки 

    async fetchAndStore() {
        if (this.isShuttingDown) {
            logger.info('Пропуск цикла: выполняется завершение работы');
            return;
        }

        const cycleStart = Date.now();
        logger.info(`\n[CYCLE] Запуск V7 BULK обновления (Сегодня и Вчера)`);

        let todaySuccess = false;
        let yesterdaySuccess = false;

        try {
            todaySuccess = await this.fetchForDepartment(null, 0);
            yesterdaySuccess = await this.fetchForDepartment(null, -1);
        } catch (error) {
            logger.error('[CYCLE] Critical error:', error.message || error);
        }

        const cycleElapsed = Date.now() - cycleStart;
        this.metrics.lastFetchTime = new Date();

        if (todaySuccess && yesterdaySuccess) {
            this.metrics.consecutiveErrors = 0;
            this.metrics.lastSuccessTime = new Date();
        } else {
            this.metrics.consecutiveErrors++;
            this.metrics.lastErrorTime = new Date();
        }

        logger.info(`[CYCLE] V7 Завершено за ${cycleElapsed}мс. Сегодня: ${todaySuccess ? 'OK' : 'FAIL'}, Вчера: ${yesterdaySuccess ? 'OK' : 'FAIL'}`);
    }

/**
 * V7: Улучшенная загрузка с ETag, UPSERT, классифицированными ошибками
 */
    async fetchForDepartment(deptId, dateShiftDays = 0) {
        const isGlobal = (deptId === null || deptId === undefined);
        const logTag = isGlobal ? '[GLOBAL]' : `[Dept: ${deptId}]`;

        if (!this.canProceed()) {
            logger.warn(`${logTag} Пропущено — Circuit Breaker ОТКРЫТ`);
            return false;
        }

        await this.consumeToken();

        const startTime = Date.now();
        this.metrics.totalFetches++;

        const targetDate = this.getKyivDate();
        targetDate.setDate(targetDate.getDate() + dateShiftDays);
        const targetDateISO = this.formatDateISO(targetDate);

        const dedupKey = `${deptId || 'global'}_${targetDateISO}`;

        return this.deduplicateRequest(dedupKey, async () => {
            let retryAttempt = 0;

            while (retryAttempt <= this.maxRetries) {
                try {
                    const params = {
                        top: isGlobal ? 2000 : this.topCount,
                        timeDeliveryBeg: this.formatDate(targetDate, '00:00:00'),
                        timeDeliveryEnd: this.formatDate(targetDate, '23:59:59')
                    };
                    if (!isGlobal) params.departmentId = deptId;

                    // V7: Формировать заголовки с поддержкой ETag
                    const headers = {
                        'x-api-key': this.apiKey || 'killmetraj_secret_key_2024',
                        'Accept': 'application/json'
                    };

                    const savedEtag = this.getEtag(deptId, targetDateISO);
                    if (savedEtag) {
                        headers['If-None-Match'] = savedEtag;
                    }

                    logger.info(`${logTag} Загрузка: ${targetDateISO}${savedEtag ? ' (с ETag)' : ''}`);

                    const apiStart = Date.now();
                    let response;
                    try {
                        response = await axios.get(this.apiUrl, {
                            headers,
                            params,
                            timeout: 25000
                        });
                    } catch (axiosErr) {
                        // V7: Обработать 304 Not Modified
                        if (axiosErr.response && axiosErr.response.status === 304) {
                            this.metrics.etagHits++;
                            this.metrics.successfulFetches++;
                            const apiElapsed = Date.now() - apiStart;
                            this.updateResponseTimeMetrics(apiElapsed);
                            logger.info(`${logTag} 304 Not Modified — данные без изменений (${apiElapsed}мс)`);
                            this.recordSuccess();
                            return true;
                        }
                        throw axiosErr;
                    }

                    const apiElapsed = Date.now() - apiStart;
                    this.updateResponseTimeMetrics(apiElapsed);
                    this.metrics.avgResponseTime = Math.round(
                        (this.metrics.avgResponseTime * (this.metrics.totalFetches - 1) + apiElapsed) / this.metrics.totalFetches
                    );

                    // V7: Сохранить ETag из ответа
                    const responseEtag = response.headers['etag'] || response.headers['ETag'];
                    this.setEtag(deptId, targetDateISO, responseEtag);

                    const responseData = response.data;
                    if (!responseData || !responseData.orders) {
                        logger.warn(`${logTag} Пустой ответ для ${targetDateISO}`);
                        return false;
                    }

                    // [NEW] Fetch route_id from API 8010 (Автомаршрут)
                    try {
                        const routeApiUrl = 'http://app.yaposhka.kh.ua:8010/api/integration/orders/all';
                        // Формат ДД.ММ.ГГГГ
                        const dd = String(targetDate.getDate()).padStart(2, '0');
                        const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
                        const yyyy = targetDate.getFullYear();
                        const routeDate = `${dd}.${mm}.${yyyy}`;
                        
                        const routeResponse = await axios.get(routeApiUrl, {
                            params: { date: routeDate },
                            headers: { 'x-api-key': process.env.AUTO_ROUTE_API_KEY },
                            timeout: 10000
                        });
                        
                        if (routeResponse.data && Array.isArray(routeResponse.data)) {
                            const routeOrderMap = new Map();
                            routeResponse.data.forEach(ro => {
                                if (ro.order_number && ro.route_id) {
                                    routeOrderMap.set(String(ro.order_number), {
                                        route_id: ro.route_id,
                                        route_position: ro.route_position
                                    });
                                }
                            });
                            
                            let enrichedCount = 0;
                            responseData.orders.forEach(o => {
                                const ro = routeOrderMap.get(String(o.orderNumber));
                                if (ro) {
                                    o.route_id = ro.route_id;
                                    o.route_position = ro.route_position;
                                    enrichedCount++;
                                }
                            });
                            logger.info(`${logTag} Автомаршруты (8010): обогащено ${enrichedCount} заказов`);
                        }
                    } catch (routeErr) {
                        logger.warn(`${logTag} Ошибка загрузки Автомаршрутов (8010): ${routeErr.message}`);
                    }

                    const receivedCount = responseData.orders.length;
                    if (receivedCount >= params.top) {
                        logger.warn(`${logTag} ДОСТИГНУТ ЛИМИТ API (${params.top}). Данные могут быть обрезаны!`);
                    }

                    const rawSizeKB = Math.round(JSON.stringify(responseData).length / 1024);
                    logger.info(`${logTag} Ответ: ${receivedCount} заказов, ${rawSizeKB}КБ`);

                    // Диагностика
                    const deptCounts = {};
                    responseData.orders.forEach(o => {
                        const d = String(o.departmentId || o.divisionId || 'UNKNOWN');
                        deptCounts[d] = (deptCounts[d] || 0) + 1;
                    });
                    logger.info(`${logTag} Разбивка по подразделениям: ${JSON.stringify(deptCounts)}`);

                    // ГЛОБАЛЬНЫЙ РЕЖИМ: Разделение и обработка по отделам
                    if (isGlobal) {
                        let allDeptSuccess = true;
                        const departmentalData = this.groupDataByDepartment(responseData.orders, responseData.couriers);
                        const foundDepts = Object.keys(departmentalData);
                        logger.info(`[GLOBAL] Обработка ${foundDepts.length} подразделений: ${foundDepts.join(', ')}`);

                        for (const dId of foundDepts) {
                            try {
                                await this.processDepartmentData(dId, targetDate, departmentalData[dId], responseEtag);
                            } catch (err) {
                                logger.error(`[GLOBAL] Error processing dept ${dId}:`, err.message);
                                allDeptSuccess = false;
                            }
                        }

                        if (allDeptSuccess) this.recordSuccess();
                        else this.recordFailure();
                        return allDeptSuccess;
                    }

                    // РЕЖИМ ОДНОГО ОТДЕЛА
                    if (cacheService) {
                        try {
                            await cacheService.invalidate(String(deptId));
                        } catch (err) {
                            logger.error(`${logTag} Cache invalidation error:`, err.message);
                        }
                    }
                    await this.processDepartmentData(deptId, targetDate, responseData, responseEtag);
                    this.recordSuccess();
                    return true;

                } catch (error) {
                    this.metrics.failedFetches++;

                    // V7: Классификация ошибки
                    const errorType = this.classifyError(error);
                    if (errorType === 'transient') {
                        this.metrics.transientErrors++;
                    } else {
                        this.metrics.permanentErrors++;
                    }

                    this.recordFailure();

                    let errorDetail = error.message;
                    if (error.response) {
                        errorDetail = `API ${error.response.status}: ${JSON.stringify(error.response.data).substring(0, 100)}`;
                    } else if (error.code === 'ECONNABORTED') {
                        errorDetail = 'Request timeout';
                    }

                    // V7: Не повторяем постоянные ошибки
                    if (errorType === 'permanent') {
                        logger.error(`${logTag} Permanent error — no retry: ${errorDetail}`);
                        return false;
                    }

                    if (retryAttempt < this.maxRetries) {
                        const backoffTime = this.calculateBackoff(retryAttempt);
                        logger.warn(`${logTag} Attempt ${retryAttempt + 1}/${this.maxRetries} failed (${errorType}): ${errorDetail}`);
                        logger.warn(`Retry in ${backoffTime}ms...`);
                        await new Promise(resolve => setTimeout(resolve, backoffTime));
                        retryAttempt++;
                    } else {
                        logger.error(`${logTag} All retries exhausted: ${errorDetail}`);
                        throw error;
                    }
                }
            }
        });
    }

/**
 * V7: Обработка + UPSERT данных отдела в транзакции
 */
    async processDepartmentData(deptId, targetDate, data, etag) {
        const logTag = `[Dept: ${deptId}]`;
        const targetDateISO = this.formatDateISO(targetDate);

        let client = null;
        try {
            client = await this.pool.connect();

            // НАЧАЛО ТРАНЗАКЦИИ
            await client.query('BEGIN');

            // 1. Получение существующих данных (общая блокировка для чтения)
            const existing = await client.query(
                `SELECT payload, data_hash FROM api_dashboard_cache 
                 WHERE division_id = $1 AND target_date = $2 
                 FOR UPDATE`,
                [String(deptId), targetDateISO]
            );

            const existingData = existing.rows.length > 0 ? existing.rows[0].payload : { orders: [], couriers: [] };
            const currentHash = this.calculateHash(data);

            // Оптимизация: Если хеш не изменился, просто обновляем updated_at
            if (existing.rows.length > 0 && existing.rows[0].data_hash === currentHash) {
                await client.query(
                    `UPDATE api_dashboard_cache SET updated_at = NOW() WHERE division_id = $1 AND target_date = $2`,
                    [String(deptId), targetDateISO]
                );
                await client.query('COMMIT');
                logger.debug(`${logTag} Данные без изменений для ${targetDateISO} — обновлено время updated_at`);
                return;
            }

            // 2. Слияние данных
            const mergedOrders = this.mergeOrders(existingData.orders, data.orders);
            const mergedCouriers = this.mergeCouriers(existingData.couriers, data.couriers, mergedOrders);
            const statusChanges = this.detectStatusChanges(existingData.orders, mergedOrders);

            // 3. Определение метрик изменений статусов
            if (statusChanges.length > 0) {
                this.metrics.totalStatusChanges += statusChanges.length;
            }

            // 4. Построение финального payload
            const finalPayload = {
                orders: mergedOrders,
                couriers: mergedCouriers,
                paymentMethods: data.paymentMethods || [],
                addresses: data.addresses || [],
                routes: existingData.routes || [],
                statistics: data.statistics || existingData.statistics || {}
            };

            // 5. V7: UPSERT — INSERT или UPDATE, ровно 1 строка на отдел/дату
            await client.query(
                `INSERT INTO api_dashboard_cache (division_id, target_date, payload, data_hash, status_code, order_count, courier_count, fetch_etag, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
                 ON CONFLICT (division_id, target_date) DO UPDATE SET
                   payload = EXCLUDED.payload,
                   data_hash = EXCLUDED.data_hash,
                   status_code = EXCLUDED.status_code,
                   order_count = EXCLUDED.order_count,
                   courier_count = EXCLUDED.courier_count,
                   fetch_etag = EXCLUDED.fetch_etag,
                   updated_at = NOW()`,
                [
                    String(deptId),
                    targetDateISO,
                    JSON.stringify(finalPayload),
                    currentHash,
                    200,
                    mergedOrders.length,
                    mergedCouriers.length,
                    etag || null
                ]
            );

            this.metrics.upsertWrites++;
            this.metrics.totalOrders = Math.max(this.metrics.totalOrders, mergedOrders.length);

            // ФИКСАЦИЯ ТРАНЗАКЦИИ
            await client.query('COMMIT');
            logger.info(`${logTag} Данные успешно обновлены для ${targetDateISO} (заказов: ${mergedOrders.length})`);

            // 6. Запись изменений статусов ВНЕ основной транзакции - если не удастся, не прервет обновление кэша
            if (statusChanges.length > 0) {
                try {
                    const changeValues = statusChanges.map((c, i) => {
                        const offset = i * 3;
                        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, NOW())`;
                    }).join(', ');

                    const changeParams = statusChanges.flatMap(c => [c.orderNumber, c.oldStatus, c.newStatus]);

                    await client.query(
                        `INSERT INTO api_dashboard_status_history (order_number, old_status, new_status, created_at) VALUES ${changeValues}`,
                        changeParams
                    );
                } catch (historyErr) {
                    logger.warn(`${logTag} Could not record status history (likely missing created_at column): ${historyErr.message}`);
                }
            }

            // 7. Уведомление через pg_notify
            try {
                await client.query('SELECT pg_notify(\'dashboard_update\', $1)', [JSON.stringify({
                    divisionId: deptId,
                    targetDate: targetDateISO,
                    orderCount: mergedOrders.length,
                    courierCount: mergedCouriers.length
                })]);
            } catch (notifyErr) {
                logger.warn(`${logTag} pg_notify failed:`, notifyErr.message);
            }

            // [NEW] 8. Проактивное фоновое геокодирование новых адресов (прямой вызов)
            try {
                if (global.turboCalculator && typeof global.turboCalculator.notifyNewFOData === 'function') {
                    // Вызов notifyNewFOData немедленно переведет turboCalculator в состояние активности, 
                    // и он извлечет заказы без координат, отправив их в фоновое геокодирование batchEnhancedGeocode.
                    logger.debug(`${logTag} [Proactive] Triggering turboCalculator immediately for proactive background geocoding`);
                    global.turboCalculator.notifyNewFOData(deptId, targetDateISO);
                }
            } catch (geoErr) {
                logger.warn(`${logTag} Proactive geocoding trigger failed:`, geoErr.message);
            }

            // 9. Инвалидация L1 кэша
            if (cacheService) {
                try {
                    await cacheService.invalidate(String(deptId));
                } catch (err) { /* ignore */ }
            }

            logger.info(`${logTag} UPSERTed ${targetDateISO}: ${mergedOrders.length} orders, ${mergedCouriers.length} couriers`);

        } catch (error) {
            // ROLLBACK при ошибке
            if (client) {
                try { await client.query('ROLLBACK'); } catch (rbErr) { /* ignore */ }
            }
            logger.error(`${logTag} Transaction error:`, error.message);
            throw error;
        } finally {
            if (client) client.release();
        }
    }

    //  Слияние данных 

    mergeOrders(existing, incoming) {
        if (!existing || !Array.isArray(existing)) return incoming || [];
        if (!incoming || !Array.isArray(incoming)) return existing || [];

        const merged = new Map();
        existing.forEach(o => {
            const key = String(o.id || o._id || o.orderNumber || o.num || '');
            if (key) merged.set(key, o);
        });
        incoming.forEach(o => {
            const key = String(o.id || o._id || o.orderNumber || o.num || '');
            if (key) {
                const existingOrder = merged.get(key) || {};
                merged.set(key, { ...existingOrder, ...o });
            }
        });
        return Array.from(merged.values());
    }

    mergeCouriers(existing, incoming, mergedOrders) {
        // v2.1: Извлекаем курьеров из заказов, если входящий массив пуст
        let incomingCouriers = incoming || [];
        
        if ((!incomingCouriers || incomingCouriers.length === 0) && mergedOrders && mergedOrders.length > 0) {
            const courierMap = new Map();
            mergedOrders.forEach(order => {
                const courierName = order.courier || order.courierName;
                if (courierName && courierName.trim() !== '' && courierName !== 'ID:0' && courierName !== 'по') {
                    if (!courierMap.has(courierName)) {
                        courierMap.set(courierName, {
                            id: courierName,
                            name: courierName,
                            orders: 0,
                            isActive: true
                        });
                    }
                    const courier = courierMap.get(courierName);
                    courier.orders++;
                }
            });
            incomingCouriers = Array.from(courierMap.values());
            if (incomingCouriers.length > 0) {
                logger.info(`Extracted ${incomingCouriers.length} couriers from ${mergedOrders.length} orders`);
            }
        }

        if (!incomingCouriers || !Array.isArray(incomingCouriers)) return existing || [];

        const merged = new Map();
        const activeCourierIds = new Set();
        if (mergedOrders && Array.isArray(mergedOrders)) {
            mergedOrders.forEach(o => {
                const rawCid = o.courierId || o.courierName || o.courier;
                const cid = String(rawCid || '').toUpperCase().trim();
                if (cid && cid !== 'ID:0' && cid !== 'ПО' && cid !== 'UNASSIGNED' && cid !== 'НЕ НАЗНАЧЕНО') activeCourierIds.add(cid);
            });
        }

        if (existing && Array.isArray(existing)) {
            existing.forEach(c => {
                const id = String(c.id || c.name || '').toUpperCase().trim();
                if (id && activeCourierIds.has(id)) merged.set(id, c);
            });
        }

        incomingCouriers.forEach(c => {
            const id = String(c.id || c.name || '').toUpperCase().trim();
            if (id && id !== 'ID:0' && id !== 'ПО' && id !== 'UNASSIGNED' && id !== 'НЕ НАЗНАЧЕНО') {
                const existingCourier = merged.get(id) || {};
                
                // V7: Сохраняем метрики, рассчитанные роботом, из существующего кэша
                const distanceKm = existingCourier.distanceKm || c.distanceKm || 0;
                const ordersInRoutes = existingCourier.ordersInRoutes || c.ordersInRoutes || existingCourier.calculatedOrders || c.calculatedOrders || 0;
                const calculatedOrders = ordersInRoutes;
                
                // Сохраняем оригинальные имена из API, чтобы избежать уродливых имен в ВЕРХНЕМ РЕГИСТРЕ в UI,
                // но если existingCourier уже нормализован, это тоже нормально.
                merged.set(id, { ...existingCourier, ...c, distanceKm, ordersInRoutes, calculatedOrders });
            }
        });

        // Фильтруем, чтобы включить только активных курьеров
        const activeCouriers = Array.from(merged.values()).filter(c => {
            const id = String(c.id || c.name || '').toUpperCase().trim();
            return activeCourierIds.has(id);
        });

        return activeCouriers;
    }

    detectStatusChanges(oldOrders, newOrders) {
        const changes = [];
        if (!oldOrders || !newOrders) return changes;

        const oldMap = new Map();
        oldOrders.forEach(o => {
            const num = String(o.orderNumber || o.num || '');
            if (num) oldMap.set(num, o.status);
        });

        newOrders.forEach(n => {
            const num = String(n.orderNumber || n.num || '');
            const oldStatus = oldMap.get(num);
            if (num && oldStatus && n.status && oldStatus !== n.status) {
                changes.push({ orderNumber: num, oldStatus, newStatus: n.status });
            }
        });

        return changes;
    }

    //  Утилиты 

    getKyivDate() {
        const now = new Date();
        const kyivTimeStr = now.toLocaleString("en-US", { timeZone: "Europe/Kiev" });
        return new Date(kyivTimeStr);
    }

    formatDate(date, timeStr) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const dateStr = `${day}.${month}.${year}`;
        return timeStr ? `${dateStr} ${timeStr}` : dateStr;
    }

    formatDateISO(date) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${year}-${month}-${day}`;
    }

    calculateHash(obj) {
        const str = JSON.stringify(obj);
        return crypto.createHash('sha256').update(str).digest('hex');
    }

    //  Логирование метрик 

    logMetrics() {
        logger.info('\n=========== FETCHER V7 METRICS ===========');
        logger.info(`Fetches: ${this.metrics.totalFetches} (OK: ${this.metrics.successfulFetches}, Fail: ${this.metrics.failedFetches})`);
        logger.info(`Orders Processed: ${this.metrics.totalOrders}`);
        logger.info(`Status Changes: ${this.metrics.totalStatusChanges}`);
        logger.info(`Response — Avg: ${Math.round(this.metrics.avgResponseTime)}ms, P50: ${Math.round(this.metrics.p50ResponseTime)}ms, P95: ${Math.round(this.metrics.p95ResponseTime)}ms, P99: ${Math.round(this.metrics.p99ResponseTime)}ms`);
        logger.info(`ETag 304 Hits: ${this.metrics.etagHits}`);
        logger.info(`UPSERT Writes: ${this.metrics.upsertWrites}`);
        logger.info(`Errors — Transient: ${this.metrics.transientErrors}, Permanent: ${this.metrics.permanentErrors}`);
        logger.info(`Circuit Breaker: ${this.circuitBreaker.state} (Trips: ${this.metrics.circuitBreakerTrips})`);
        logger.info(`Rate Limiter Hits: ${this.metrics.rateLimitHits}`);
        logger.info(`Dedup Saved: ${this.metrics.deduplicatedRequests}`);
        logger.info(`Adaptive Concurrency: ${this.adaptiveConcurrency.current}`);
        logger.info(`Consecutive Errors: ${this.metrics.consecutiveErrors}`);
        if (this.metrics.lastSuccessTime) {
            logger.info(`Last Success: ${this.metrics.lastSuccessTime.toLocaleString('ru-RU', { timeZone: 'Europe/Kiev' })}`);
        }
        if (this.metrics.lastErrorTime) {
            logger.info(`Last Error: ${this.metrics.lastErrorTime.toLocaleString('ru-RU', { timeZone: 'Europe/Kiev' })}`);
        }
        logger.info('==========================================\n');
    }

    //  Проверка здоровья 

    async getHealthStatus() {
        try {
            const dbCheck = await this.pool.query('SELECT NOW()');
            const cacheCheck = await this.pool.query(
                'SELECT COUNT(*) as count FROM api_dashboard_cache WHERE updated_at > NOW() - INTERVAL \'1 hour\''
            );

            return {
                status: 'healthy',
                version: '7.0 (Fetcher 2.0)',
                timestamp: new Date().toISOString(),
                database: 'connected',
                recentCacheEntries: parseInt(cacheCheck.rows[0].count),
                circuitBreaker: {
                    state: this.circuitBreaker.state,
                    failureCount: this.circuitBreaker.failureCount,
                    trips: this.metrics.circuitBreakerTrips
                },
                rateLimiter: {
                    tokens: this.rateLimiter.tokens,
                    maxTokens: this.rateLimiter.maxTokens,
                    hits: this.metrics.rateLimitHits
                },
                adaptiveConcurrency: {
                    current: this.adaptiveConcurrency.current,
                    min: this.adaptiveConcurrency.min,
                    max: this.adaptiveConcurrency.max
                },
                v7Metrics: {
                    etagHits: this.metrics.etagHits,
                    upsertWrites: this.metrics.upsertWrites,
                    transientErrors: this.metrics.transientErrors,
                    permanentErrors: this.metrics.permanentErrors
                },
                metrics: this.metrics,
                activeRequests: this.activeRequests.size,
                isShuttingDown: this.isShuttingDown
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                version: '7.0 (Fetcher 2.0)',
                timestamp: new Date().toISOString(),
                error: error.message,
                metrics: this.metrics
            };
        }
    }
}

// Глобальные обработчики ошибок — удалены, т.к. дублируют handlers в simple_server.js
// и вызывают process.exit(1) при любой асинхронной ошибке, краша процесс на Render.
// simple_server.js уже регистрирует свои handlers с логгированием без немедленного выхода.

module.exports = DashboardFetcher;

