const axios = require('axios');
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
const logger = require('../src/utils/logger');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

/**
 * Enhanced Dashboard Fetcher V6 - Production Ready
 * 
 * New Features:
 * - Circuit Breaker pattern for fault tolerance
 * - Smart retry with exponential backoff + jitter
 * - Adaptive concurrency based on system load
 * - Request deduplication
 * - Rate limiting
 * - Advanced metrics and monitoring
 * - Health checks with detailed diagnostics
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
                statement_timeout: 15000
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
                statement_timeout: 15000
            };

        this.pool = new Pool(poolConfig);

        // Configuration
        this.fetchInterval = parseInt(process.env.DASHBOARD_FETCH_INTERVAL || '900000'); // 15 min
        this.maxRetries = parseInt(process.env.DASHBOARD_MAX_RETRIES || '5');
        this.baseBackoff = parseInt(process.env.DASHBOARD_BASE_BACKOFF || '5000');
        this.apiUrl = process.env.EXTERNAL_API_URL || 'http://app.yaposhka.kh.ua:4999/api/v1/dashboard';
        this.apiKey = process.env.EXTERNAL_API_KEY;
        this.departmentId = process.env.DASHBOARD_DEPARTMENT_ID || '100000052';
        this.topCount = process.env.DASHBOARD_TOP || '2000';
        this.concurrencyLimit = parseInt(process.env.DASHBOARD_CONCURRENCY || '3');
        this.cacheRetentionDays = parseInt(process.env.CACHE_RETENTION_DAYS || '2');
        this.cleanupInterval = parseInt(process.env.CLEANUP_INTERVAL || '86400000'); // 24h

        // Circuit Breaker Configuration
        this.circuitBreaker = {
            state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
            failureCount: 0,
            successCount: 0,
            failureThreshold: 5,
            successThreshold: 2,
            timeout: 60000, // 1 minute
            nextAttempt: null
        };

        // Rate Limiter
        this.rateLimiter = {
            tokens: 10,
            maxTokens: 10,
            refillRate: 1, // tokens per second
            lastRefill: Date.now()
        };

        // Adaptive Concurrency
        this.adaptiveConcurrency = {
            current: this.concurrencyLimit,
            min: 1,
            max: this.concurrencyLimit * 2,
            targetLatency: 2000, // 2 seconds
            adjustInterval: 60000 // 1 minute
        };

        // Request Deduplication
        this.pendingRequests = new Map();

        // Enhanced Metrics
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
            p50ResponseTime: 0,
            p95ResponseTime: 0,
            p99ResponseTime: 0,
            responseTimes: []
        };

        // State
        this.isShuttingDown = false;
        this.activeRequests = new Set();
        this.intervalHandle = null;
        this.cleanupIntervalHandle = null;
        this.metricsIntervalHandle = null;
        this.lastHash = null;
        this.retryCount = 0;
        this.hasLock = false;
    }

    /**
     * Circuit Breaker: Check if request should proceed
     */
    canProceed() {
        const now = Date.now();

        switch (this.circuitBreaker.state) {
            case 'OPEN':
                if (now >= this.circuitBreaker.nextAttempt) {
                    logger.info('[Circuit Breaker] Transitioning to HALF_OPEN');
                    this.circuitBreaker.state = 'HALF_OPEN';
                    this.circuitBreaker.successCount = 0;
                    return true;
                }
                logger.warn('[Circuit Breaker] OPEN - Request blocked');
                return false;

            case 'HALF_OPEN':
            case 'CLOSED':
                return true;

            default:
                return true;
        }
    }

    /**
     * Circuit Breaker: Record success
     */
    recordSuccess() {
        if (this.circuitBreaker.state === 'HALF_OPEN') {
            this.circuitBreaker.successCount++;
            if (this.circuitBreaker.successCount >= this.circuitBreaker.successThreshold) {
                logger.info('[Circuit Breaker] Transitioning to CLOSED');
                this.circuitBreaker.state = 'CLOSED';
                this.circuitBreaker.failureCount = 0;
            }
        } else if (this.circuitBreaker.state === 'CLOSED') {
            this.circuitBreaker.failureCount = 0;
        }
    }

    /**
     * Circuit Breaker: Record failure
     */
    recordFailure() {
        this.circuitBreaker.failureCount++;

        if (this.circuitBreaker.state === 'HALF_OPEN') {
            logger.warn('[Circuit Breaker] Failure in HALF_OPEN - Transitioning to OPEN');
            this.circuitBreaker.state = 'OPEN';
            this.circuitBreaker.nextAttempt = Date.now() + this.circuitBreaker.timeout;
            this.metrics.circuitBreakerTrips++;
        } else if (this.circuitBreaker.failureCount >= this.circuitBreaker.failureThreshold) {
            logger.warn('[Circuit Breaker] Failure threshold reached - Transitioning to OPEN');
            this.circuitBreaker.state = 'OPEN';
            this.circuitBreaker.nextAttempt = Date.now() + this.circuitBreaker.timeout;
            this.metrics.circuitBreakerTrips++;
        }
    }

    /**
     * Rate Limiter: Refill tokens
     */
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

    /**
     * Rate Limiter: Try to consume a token
     */
    async consumeToken() {
        this.refillTokens();

        if (this.rateLimiter.tokens > 0) {
            this.rateLimiter.tokens--;
            return true;
        }

        this.metrics.rateLimitHits++;
        logger.warn('[Rate Limiter] No tokens available - waiting');

        // Wait for next token
        await new Promise(resolve => setTimeout(resolve, 1000 / this.rateLimiter.refillRate));
        return this.consumeToken();
    }

    /**
     * Adaptive Concurrency: Adjust based on performance
     */
    adjustConcurrency() {
        if (this.metrics.responseTimes.length < 10) return;

        const avgLatency = this.metrics.avgResponseTime;
        const current = this.adaptiveConcurrency.current;

        if (avgLatency < this.adaptiveConcurrency.targetLatency && current < this.adaptiveConcurrency.max) {
            this.adaptiveConcurrency.current = Math.min(current + 1, this.adaptiveConcurrency.max);
            logger.info(`[Adaptive Concurrency] Increased to ${this.adaptiveConcurrency.current}`);
        } else if (avgLatency > this.adaptiveConcurrency.targetLatency * 1.5 && current > this.adaptiveConcurrency.min) {
            this.adaptiveConcurrency.current = Math.max(current - 1, this.adaptiveConcurrency.min);
            logger.info(`[Adaptive Concurrency] Decreased to ${this.adaptiveConcurrency.current}`);
        }
    }

    /**
     * Request Deduplication
     */
    async deduplicateRequest(key, requestFn) {
        if (this.pendingRequests.has(key)) {
            this.metrics.deduplicatedRequests++;
            logger.debug(`[Dedup] Reusing pending request: ${key}`);
            return this.pendingRequests.get(key);
        }

        const promise = requestFn();
        this.pendingRequests.set(key, promise);

        try {
            const result = await promise;
            return result;
        } finally {
            this.pendingRequests.delete(key);
        }
    }

    /**
     * Smart Retry with Exponential Backoff + Jitter
     */
    calculateBackoff(attempt) {
        const exponential = this.baseBackoff * Math.pow(2, attempt);
        const jitter = Math.random() * 1000; // 0-1000ms jitter
        return Math.min(exponential + jitter, 30000); // Max 30 seconds
    }

    /**
     * Update response time metrics
     */
    updateResponseTimeMetrics(responseTime) {
        this.metrics.responseTimes.push(responseTime);

        // Keep only last 100 measurements
        if (this.metrics.responseTimes.length > 100) {
            this.metrics.responseTimes.shift();
        }

        // Calculate percentiles
        const sorted = [...this.metrics.responseTimes].sort((a, b) => a - b);
        const len = sorted.length;

        this.metrics.p50ResponseTime = sorted[Math.floor(len * 0.5)] || 0;
        this.metrics.p95ResponseTime = sorted[Math.floor(len * 0.95)] || 0;
        this.metrics.p99ResponseTime = sorted[Math.floor(len * 0.99)] || 0;
        this.metrics.minResponseTime = Math.min(this.metrics.minResponseTime, responseTime);
        this.metrics.maxResponseTime = Math.max(this.metrics.maxResponseTime, responseTime);
    }

    /**
     * Start fetch cycle
     */
    async start() {
        logger.info('============================================================');
        logger.info('Enhanced Dashboard Fetcher [V6 - PRODUCTION READY]');
        logger.info('============================================================');
        logger.info(`API URL: ${this.apiUrl}`);
        logger.info(`Fetch Interval: ${this.fetchInterval}ms (${Math.round(this.fetchInterval / 60000)} min)`);
        logger.info(`Max Retries: ${this.maxRetries}`);
        logger.info(`Concurrency: ${this.concurrencyLimit} (Adaptive: ${this.adaptiveConcurrency.min}-${this.adaptiveConcurrency.max})`);
        logger.info(`Cache Retention: ${this.cacheRetentionDays} days`);
        logger.info(`Circuit Breaker: Enabled (Threshold: ${this.circuitBreaker.failureThreshold})`);
        logger.info(`Rate Limiter: ${this.rateLimiter.maxTokens} tokens, ${this.rateLimiter.refillRate}/sec`);
        logger.info('============================================================');

        try {
            await this.pool.query('SELECT NOW()');
            logger.info('Database connected');

            const lockResult = await this.pool.query('SELECT pg_try_advisory_lock(777777)');
            this.hasLock = lockResult.rows[0].pg_try_advisory_lock;

            if (!this.hasLock) {
                logger.warn('ATTENTION: Another fetcher instance is running');
                logger.warn('This process will run in standby mode');
                return;
            }

            logger.info('Lock acquired. This process is the active fetcher.');

            this.lastHash = await this.getLastHash();
            if (this.lastHash) {
                logger.info(`Last data hash loaded: ${this.lastHash.substring(0, 8)}...`);
            }

            this.startCleanupScheduler();
            this.startMetricsReporter();
            this.startAdaptiveConcurrencyAdjuster();

        } catch (error) {
            logger.error('Fetcher initialization error:', error.message);
            logger.warn('Restarting cycle in 1 minute...');
            setTimeout(() => this.start(), 60000);
            return;
        }

        logger.info('Dashboard Fetcher started');
        logger.info('============================================================');

        await this.fetchAndStore();
        this.intervalHandle = setInterval(() => this.fetchAndStore(), this.fetchInterval);
        this.registerShutdownHandlers();
    }

    /**
     * Start metrics reporter
     */
    startMetricsReporter() {
        this.metricsIntervalHandle = setInterval(() => {
            if (this.metrics.totalFetches % 10 === 0 && this.metrics.totalFetches > 0) {
                this.logMetrics();
            }
        }, 60000); // Every minute
    }

    /**
     * Start adaptive concurrency adjuster
     */
    startAdaptiveConcurrencyAdjuster() {
        setInterval(() => {
            this.adjustConcurrency();
        }, this.adaptiveConcurrency.adjustInterval);
    }

    /**
     * Start cleanup scheduler
     */
    startCleanupScheduler() {
        logger.info(`Cleanup scheduler started (every ${Math.round(this.cleanupInterval / 3600000)}h)`);
        setTimeout(() => this.cleanupOldRecords(), 300000);
        this.cleanupIntervalHandle = setInterval(() => this.cleanupOldRecords(), this.cleanupInterval);
    }

    /**
     * Clean old records
     */
    async cleanupOldRecords() {
        logger.info('Starting cleanup of old records...');
        const startTime = Date.now();

        let client = null;
        try {
            client = await this.pool.connect();

            const cacheResult = await client.query(
                `DELETE FROM api_dashboard_cache 
                 WHERE created_at < NOW() - INTERVAL '${this.cacheRetentionDays} days'`
            );

            const historyResult = await client.query(
                `DELETE FROM api_dashboard_status_history 
                 WHERE created_at < NOW() - INTERVAL '${this.cacheRetentionDays} days'`
            );

            const elapsed = Date.now() - startTime;
            logger.info(`Cleanup finished in ${elapsed}ms. Deleted: ${cacheResult.rowCount} cache, ${historyResult.rowCount} history`);

            await client.query('VACUUM ANALYZE api_dashboard_cache');
            await client.query('VACUUM ANALYZE api_dashboard_status_history');
            logger.info('VACUUM executed');

        } catch (error) {
            logger.error('Error cleaning old records:', error.message);
        } finally {
            if (client) client.release();
        }
    }

    /**
     * Graceful shutdown
     */
    registerShutdownHandlers() {
        const shutdown = async (signal) => {
            if (this.isShuttingDown) return;

            logger.info(`\nReceived signal ${signal}. Starting graceful shutdown...`);
            this.isShuttingDown = true;

            if (this.intervalHandle) clearInterval(this.intervalHandle);
            if (this.cleanupIntervalHandle) clearInterval(this.cleanupIntervalHandle);
            if (this.metricsIntervalHandle) clearInterval(this.metricsIntervalHandle);

            const maxWait = 30000;
            const startWait = Date.now();
            while (this.activeRequests.size > 0 && (Date.now() - startWait) < maxWait) {
                logger.info(`Waiting for ${this.activeRequests.size} active requests...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            if (this.hasLock) {
                try {
                    await this.pool.query('SELECT pg_advisory_unlock(777777)');
                    logger.info('Lock released');
                } catch (e) {
                    logger.warn('Error releasing lock:', e.message);
                }
            }

            await this.pool.end();
            logger.info('Connection pool closed');

            this.logMetrics();
            logger.info('Fetcher stopped successfully');
            process.exit(0);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }

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

    async getActiveDepartments() {
        try {
            // Get departments from users
            const result = await this.pool.query(
                'SELECT DISTINCT "divisionId" FROM users WHERE "divisionId" IS NOT NULL'
            );
            const depts = result.rows
                .map(r => r.divisionId)
                .filter(id => id && id !== 'all' && !isNaN(parseInt(id, 10)));

            // Always ensure the default department is included
            const defaultDept = process.env.DASHBOARD_DEPARTMENT_ID || '100000052';
            if (!depts.includes(defaultDept)) {
                depts.push(defaultDept);
            }

            // Expanded list of known departments to ensure full coverage
            // These are common department IDs used in the system
            const knownDepts = ['100000052', '100000053', '100000001', '100000002'];
            knownDepts.forEach(id => {
                if (!depts.includes(id)) depts.push(id);
            });

            const finalDepts = [...new Set(depts)];
            logger.info(`Active departments for fetching: ${finalDepts.join(', ')}`);

            return finalDepts;
        } catch (error) {
            logger.error('Error getting departments:', error.message);
            const fallback = process.env.DASHBOARD_DEPARTMENT_ID || '100000052';
            return [fallback];
        }
    }

    /**
     * Main fetch logic with all enhancements
     */
    async fetchAndStore() {
        if (this.isShuttingDown) {
            logger.info('Skipping cycle: shutdown in progress');
            return;
        }

        const cycleStart = Date.now();
        const departments = await this.getActiveDepartments();
        const concurrency = this.adaptiveConcurrency.current;

        logger.info(`\n[CYCLE] Starting updates for ${departments.length} departments (Concurrency: ${concurrency})`);

        const allTasks = [];
        for (const deptId of departments) {
            allTasks.push(() => this.processDepartmentSafe(deptId, 0));
            allTasks.push(() => this.processDepartmentSafe(deptId, -1));
        }

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < allTasks.length; i += concurrency) {
            if (this.isShuttingDown) break;

            const batch = allTasks.slice(i, i + concurrency).map(task => task());
            const results = await Promise.allSettled(batch);

            results.forEach(r => {
                if (r.status === 'fulfilled' && r.value === true) successCount++;
                else failCount++;
            });

            if (i + concurrency < allTasks.length) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        const cycleElapsed = Date.now() - cycleStart;
        this.metrics.lastFetchTime = new Date();

        if (failCount === 0) {
            this.metrics.consecutiveErrors = 0;
            this.metrics.lastSuccessTime = new Date();
        } else {
            this.metrics.consecutiveErrors++;
            this.metrics.lastErrorTime = new Date();
        }

        logger.info(`[CYCLE] Finished in ${cycleElapsed}ms. Success: ${successCount}, Failed: ${failCount}, Total: ${allTasks.length}`);
    }

    /**
     * Enhanced metrics logging
     */
    logMetrics() {
        logger.info('\n============ PERFORMANCE METRICS ============');
        logger.info(`Total Fetches: ${this.metrics.totalFetches}`);
        logger.info(`Success: ${this.metrics.successfulFetches} (${Math.round(this.metrics.successfulFetches / Math.max(this.metrics.totalFetches, 1) * 100)}%)`);
        logger.info(`Errors: ${this.metrics.failedFetches}`);
        logger.info(`Orders Processed: ${this.metrics.totalOrders}`);
        logger.info(`Status Changes: ${this.metrics.totalStatusChanges}`);
        logger.info(`Response Time - Avg: ${Math.round(this.metrics.avgResponseTime)}ms, P50: ${Math.round(this.metrics.p50ResponseTime)}ms, P95: ${Math.round(this.metrics.p95ResponseTime)}ms, P99: ${Math.round(this.metrics.p99ResponseTime)}ms`);
        logger.info(`Response Time - Min: ${Math.round(this.metrics.minResponseTime)}ms, Max: ${Math.round(this.metrics.maxResponseTime)}ms`);
        logger.info(`Cache - Hits: ${this.metrics.cacheHits}, Misses: ${this.metrics.cacheMisses}`);
        logger.info(`Circuit Breaker - State: ${this.circuitBreaker.state}, Trips: ${this.metrics.circuitBreakerTrips}`);
        logger.info(`Rate Limiter - Hits: ${this.metrics.rateLimitHits}, Tokens: ${this.rateLimiter.tokens}/${this.rateLimiter.maxTokens}`);
        logger.info(`Deduplication - Saved Requests: ${this.metrics.deduplicatedRequests}`);
        logger.info(`Adaptive Concurrency - Current: ${this.adaptiveConcurrency.current}`);
        logger.info(`Consecutive Errors: ${this.metrics.consecutiveErrors}`);
        if (this.metrics.lastSuccessTime) {
            logger.info(`Last Success: ${this.metrics.lastSuccessTime.toLocaleString('ru-RU', { timeZone: 'Europe/Kiev' })}`);
        }
        if (this.metrics.lastErrorTime) {
            logger.info(`Last Error: ${this.metrics.lastErrorTime.toLocaleString('ru-RU', { timeZone: 'Europe/Kiev' })}`);
        }
        logger.info('=====================================================\n');
    }

    async processDepartmentSafe(deptId, dateShiftDays) {
        const requestId = `${deptId}_${dateShiftDays}_${Date.now()}`;
        this.activeRequests.add(requestId);

        try {
            const success = await this.fetchForDepartment(deptId, dateShiftDays);
            return success === true;
        } catch (e) {
            logger.error(`[Dept: ${deptId}] Critical error in safe wrapper:`, e.message);
            return false;
        } finally {
            this.activeRequests.delete(requestId);
        }
    }

    /**
     * Enhanced fetch with all patterns
     */
    async fetchForDepartment(deptId, dateShiftDays = 0) {
        // Circuit Breaker Check
        if (!this.canProceed()) {
            logger.warn(`[Dept: ${deptId}] Skipped due to Circuit Breaker`);
            return;
        }

        // Rate Limiting
        await this.consumeToken();

        const startTime = Date.now();
        this.metrics.totalFetches++;

        const targetDate = this.getKyivDate();
        targetDate.setDate(targetDate.getDate() + dateShiftDays);
        const targetDateLegacy = this.formatDate(targetDate, '').trim(); // DD.MM.YYYY
        const targetDateISO = this.formatDateISO(targetDate); // YYYY-MM-DD
        const targetDateStr = targetDateISO; // Use ISO as primary

        // Request Deduplication
        const dedupKey = `${deptId}_${targetDateStr}`;

        return this.deduplicateRequest(dedupKey, async () => {
            let client = null;
            let retryAttempt = 0;

            while (retryAttempt <= this.maxRetries) {
                try {
                    const timeBeg = this.formatDate(targetDate, '00:00:00');
                    const timeEnd = this.formatDate(targetDate, '23:59:59');

                    const params = {
                        top: this.topCount,
                        timeDeliveryBeg: timeBeg,
                        timeDeliveryEnd: timeEnd,
                        departmentId: deptId
                    };

                    const apiStart = Date.now();
                    const response = await axios.get(this.apiUrl, {
                        headers: {
                            'x-api-key': this.apiKey || 'killmetraj_secret_key_2024',
                            'Accept': 'application/json'
                        },
                        params: params,
                        timeout: 15000
                    });
                    const apiElapsed = Date.now() - apiStart;

                    // Update metrics
                    this.updateResponseTimeMetrics(apiElapsed);
                    this.metrics.avgResponseTime = Math.round(
                        (this.metrics.avgResponseTime * (this.metrics.totalFetches - 1) + apiElapsed) / this.metrics.totalFetches
                    );

                    const responseData = response.data;

                    if (!responseData || !responseData.orders || responseData.orders.length === 0) {
                        logger.warn(`[Dept: ${deptId}] Empty response or zero orders received for ${targetDateStr}`);
                        return false;
                    }

                    client = await this.pool.connect();
                    await client.query('BEGIN');

                    const prevResult = await client.query(
                        'SELECT payload, data_hash FROM api_dashboard_cache WHERE status_code = 200 AND division_id = $1 AND (target_date = $2 OR target_date = $3) ORDER BY created_at DESC LIMIT 1',
                        [String(deptId), targetDateISO, targetDateLegacy]
                    );

                    const lastRecord = prevResult.rows[0];
                    const prevPayload = lastRecord ? lastRecord.payload : null;
                    const lastHash = lastRecord ? lastRecord.data_hash : null;
                    const prevOrders = prevPayload?.orders || [];

                    const mergedOrdersMap = new Map();
                    const mergedCouriersMap = new Map();

                    // Load previous data for merging
                    if (prevOrders && Array.isArray(prevOrders)) {
                        prevOrders.forEach(o => mergedOrdersMap.set(o.orderNumber, o));
                    }
                    if (prevPayload?.couriers && Array.isArray(prevPayload.couriers)) {
                        prevPayload.couriers.forEach(c => mergedCouriersMap.set(c.id, c));
                    }

                    const historyEntries = [];
                    const isTimeEmpty = (t) => {
                        if (!t) return true;
                        const s = String(t).trim();
                        return s === '00:00' || s === '00:00:00' || s === '0:00' || s === '';
                    };

                    // Merge new orders
                    if (responseData.orders && Array.isArray(responseData.orders)) {
                        for (const order of responseData.orders) {
                            const prevOrder = mergedOrdersMap.get(order.orderNumber);
                            const oldStatus = prevOrder?.status || null;
                            const newStatus = order.status;

                            if (isTimeEmpty(order.deliverBy) && !isTimeEmpty(order.plannedTime)) {
                                order.deliverBy = order.plannedTime;
                            }
                            if (isTimeEmpty(order.plannedTime) && !isTimeEmpty(order.deliverBy)) {
                                order.plannedTime = order.deliverBy;
                            }

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

                            order.departmentId = order.departmentId || deptId;
                            mergedOrdersMap.set(order.orderNumber, order);
                        }
                    }

                    // Merge new couriers
                    if (responseData.couriers && Array.isArray(responseData.couriers)) {
                        for (const courier of responseData.couriers) {
                            courier.departmentId = courier.departmentId || deptId;
                            mergedCouriersMap.set(courier.id, courier);
                        }
                    }

                    const mergedPayload = {
                        ...responseData,
                        orders: Array.from(mergedOrdersMap.values()),
                        couriers: Array.from(mergedCouriersMap.values())
                    };

                    const dataHash = this.calculateHash(mergedPayload);

                    if (lastHash === dataHash) {
                        await client.query('ROLLBACK');
                        this.metrics.successfulFetches++;
                        this.metrics.cacheHits++;
                        this.retryCount = 0;
                        this.recordSuccess(); // Circuit Breaker
                        return;
                    }

                    this.metrics.cacheMisses++;

                    if (historyEntries.length > 0) {
                        const values = historyEntries.map((_, i) =>
                            `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`
                        ).join(',');

                        const flatParams = historyEntries.flat();

                        await client.query(
                            `INSERT INTO api_dashboard_status_history (order_number, old_status, new_status) VALUES ${values}`,
                            flatParams
                        );

                        this.metrics.totalStatusChanges += historyEntries.length;
                        logger.info(`[Dept: ${deptId}] Recorded ${historyEntries.length} status changes`);
                    }

                    const insertResult = await client.query(
                        `INSERT INTO api_dashboard_cache (payload, data_hash, status_code, division_id, target_date)
                         VALUES ($1, $2, $3, $4, $5)
                         RETURNING id`,
                        [mergedPayload, dataHash, 200, String(deptId), targetDateStr]
                    );

                    const newId = insertResult.rows[0].id;

                    // Notify listeners (simple_server.js) about the update
                    await client.query(
                        `NOTIFY dashboard_update, '${JSON.stringify({ id: newId, divisionId: String(deptId) })}'`
                    );

                    await client.query('COMMIT');

                    // Invalidate cache immediately after commit to ensure fresh data for users
                    await cacheService.invalidate(String(deptId)).catch(err =>
                        logger.error(`[Dept: ${deptId}] Error invalidating cache after fetch:`, err.message)
                    );

                    this.metrics.successfulFetches++;
                    this.metrics.totalOrders += mergedPayload.orders.length;
                    this.retryCount = 0;
                    this.recordSuccess(); // Circuit Breaker

                    const elapsed = Date.now() - startTime;
                    logger.info(`[Dept: ${deptId}] Saved ${mergedPayload.orders.length} orders in ${elapsed}ms (API: ${apiElapsed}ms). +${historyEntries.length} updates.`);

                    return true;

                } catch (error) {
                    if (client) {
                        try { await client.query('ROLLBACK'); } catch (e) { }
                    }

                    this.metrics.failedFetches++;
                    this.recordFailure(); // Circuit Breaker

                    let errorDetail = error.message;
                    if (error.response) {
                        errorDetail = `API Error ${error.response.status}: ${JSON.stringify(error.response.data).substring(0, 100)}...`;
                    } else if (error.request) {
                        errorDetail = `No response: ${error.message}`;
                    } else if (error.code === 'ECONNABORTED') {
                        errorDetail = 'Request timeout';
                    }

                    if (retryAttempt < this.maxRetries) {
                        const backoffTime = this.calculateBackoff(retryAttempt);
                        logger.warn(`[Dept: ${deptId}] Attempt ${retryAttempt + 1}/${this.maxRetries} failed: ${errorDetail}`);
                        logger.warn(`Retry in ${backoffTime}ms...`);

                        await new Promise(resolve => setTimeout(resolve, backoffTime));
                        retryAttempt++;
                    } else {
                        logger.error(`[Dept: ${deptId}] All attempts exhausted. Error: ${errorDetail}`);
                        throw error;
                    }
                } finally {
                    if (client) client.release();
                }
            }
        });
    }

    getKyivDate() {
        const now = new Date();
        const kyivTimeStr = now.toLocaleString("en-US", {
            timeZone: "Europe/Kiev"
        });
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

    /**
     * Enhanced health check
     */
    async getHealthStatus() {
        try {
            const dbCheck = await this.pool.query('SELECT NOW()');
            const cacheCheck = await this.pool.query(
                'SELECT COUNT(*) as count FROM api_dashboard_cache WHERE created_at > NOW() - INTERVAL \'1 hour\''
            );

            return {
                status: 'healthy',
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
                metrics: this.metrics,
                activeRequests: this.activeRequests.size,
                isShuttingDown: this.isShuttingDown
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: error.message,
                metrics: this.metrics
            };
        }
    }
}

// Global error handlers
process.on('uncaughtException', (err) => {
    logger.error('CRITICAL ERROR: Uncaught Exception:', err);
    logger.error(err.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('CRITICAL ERROR: Unhandled Rejection:', promise);
    logger.error('Reason:', reason);
    process.exit(1);
});

module.exports = DashboardFetcher;
