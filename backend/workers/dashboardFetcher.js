const axios = require('axios');
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
const logger = require('../src/utils/logger');
const cacheService = require('../src/services/CacheService');
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

        if (this.circuitBreaker.state === 'OPEN') {
            if (now >= this.circuitBreaker.nextAttempt) {
                logger.info('[Circuit Breaker] Transitioning to HALF_OPEN');
                this.circuitBreaker.state = 'HALF_OPEN';
                this.circuitBreaker.successCount = 0;
                return true;
            }
            return false;
        }
        return true;
    }

    /**
     * Group global data by department
     */
    groupDataByDepartment(orders, couriers) {
        const groups = {};

        // 1. Initialize groups with orders and track which couriers are on orders
        const courierToDeptMap = new Map();

        if (orders && Array.isArray(orders)) {
            orders.forEach(o => {
                const deptId = String(o.departmentId || o.divisionId || 'UNKNOWN');
                if (!groups[deptId]) groups[deptId] = { orders: [], couriers: [] };
                groups[deptId].orders.push(o);

                // Track courier assignment from orders
                if (o.courierId || o.courierName) {
                    const cKey = String(o.courierId || o.courierName);
                    if (!courierToDeptMap.has(cKey)) courierToDeptMap.set(cKey, new Set());
                    courierToDeptMap.get(cKey).add(deptId);
                }
            });
        }

        // 2. Group couriers based on explicit deptId or order assignment
        if (couriers && Array.isArray(couriers)) {
            couriers.forEach(c => {
                const explicitDeptId = String(c.departmentId || c.divisionId || '');
                const cKey = String(c.id || c.name || '');

                if (explicitDeptId && groups[explicitDeptId]) {
                    // Always add to explicit department
                    groups[explicitDeptId].couriers.push(c);
                } else if (cKey && courierToDeptMap.has(cKey)) {
                    // Add to departments where courier has orders
                    courierToDeptMap.get(cKey).forEach(deptId => {
                        if (groups[deptId]) groups[deptId].couriers.push(c);
                    });
                }
                // REMOVED the "push to all" fallback that was causing the 144 courier flood
            });
        }

        return groups;
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
        logger.info(`\n[CYCLE] Starting BULK update (Today & Yesterday)`);

        let successCount = 0;
        let failCount = 0;
        let todaySuccess = false;
        let yesterdaySuccess = false;

        try {
            // Perform Global Fetches (Capture Everything)
            todaySuccess = await this.fetchForDepartment(null, 0); // Today Global
            yesterdaySuccess = await this.fetchForDepartment(null, -1); // Yesterday Global

            if (todaySuccess) successCount++; else failCount++;
            if (yesterdaySuccess) successCount++; else failCount++;
        } catch (error) {
            logger.error('[CYCLE] Critical error during bulk update:', error.message || error);
            failCount += 2; // Assume both failed if we caught here
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

        logger.info(`[CYCLE] Finished Global Fetch in ${cycleElapsed}ms. Today: ${todaySuccess ? 'OK' : 'FAIL'}, Yesterday: ${yesterdaySuccess ? 'OK' : 'FAIL'}`);
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
        const isGlobal = (deptId === null || deptId === undefined);
        const logTag = isGlobal ? '[GLOBAL]' : `[Dept: ${deptId}]`;

        // Circuit Breaker Check
        if (!this.canProceed()) {
            logger.warn(`${logTag} Skipped due to Circuit Breaker`);
            return false;
        }

        // Rate Limiting
        await this.consumeToken();

        const startTime = Date.now();
        this.metrics.totalFetches++;

        const targetDate = this.getKyivDate();
        targetDate.setDate(targetDate.getDate() + dateShiftDays);
        const targetDateISO = this.formatDateISO(targetDate);

        // Request Deduplication
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

                    logger.info(`${logTag} Fetching: ${this.apiUrl} with params: ${JSON.stringify(params)}`);

                    const apiStart = Date.now();
                    const response = await axios.get(this.apiUrl, {
                        headers: {
                            'x-api-key': this.apiKey || 'killmetraj_secret_key_2024',
                            'Accept': 'application/json'
                        },
                        params: params,
                        timeout: 25000 // Increased timeout for global fetch
                    });
                    const apiElapsed = Date.now() - apiStart;

                    // Update metrics
                    this.updateResponseTimeMetrics(apiElapsed);
                    this.metrics.avgResponseTime = Math.round(
                        (this.metrics.avgResponseTime * (this.metrics.totalFetches - 1) + apiElapsed) / this.metrics.totalFetches
                    );

                    const responseData = response.data;
                    if (!responseData || !responseData.orders) {
                        logger.warn(`${logTag} Empty response or zero orders received for ${targetDateISO}`);
                        return false;
                    }

                    const receivedCount = responseData.orders.length;
                    if (receivedCount >= params.top) {
                        logger.warn(`${logTag} API response HIT THE LIMIT (${params.top} orders). Data may be truncated!`);
                    }
                    const rawSizeKB = Math.round(JSON.stringify(responseData).length / 1024);
                    logger.info(`${logTag} API Response: ${receivedCount} orders, Size: ${rawSizeKB}KB, Keys: ${Object.keys(responseData).join(', ')}`);

                    // Diagnostics
                    const deptCounts = {};
                    responseData.orders.forEach(o => {
                        const d = String(o.departmentId || o.divisionId || 'UNKNOWN');
                        deptCounts[d] = (deptCounts[d] || 0) + 1;
                    });
                    logger.info(`${logTag} API response breakdown by dept: ${JSON.stringify(deptCounts)}`);

                    const statusCounts = {};
                    responseData.orders.forEach(o => {
                        const s = String(o.status || 'UNKNOWN');
                        statusCounts[s] = (statusCounts[s] || 0) + 1;
                    });
                    logger.info(`${logTag} API response breakdown by status: ${JSON.stringify(statusCounts)}`);

                    const sample = responseData.orders.slice(0, 5).map(o => ({
                        num: o.orderNumber,
                        dept: o.departmentId || o.divisionId,
                        status: o.status
                    }));
                    logger.info(`${logTag} Sample orders: ${JSON.stringify(sample)}`);

                    // GLOBAL MODE: Split and process
                    if (isGlobal) {
                        let allDeptSuccess = true;
                        const departmentalData = this.groupDataByDepartment(responseData.orders, responseData.couriers);
                        const foundDepts = Object.keys(departmentalData);
                        logger.info(`[GLOBAL] Found data for ${foundDepts.length} departments: ${foundDepts.join(', ')}`);

                        for (const dId of foundDepts) {
                            try {
                                await this.processDepartmentData(dId, targetDate, departmentalData[dId]);
                            } catch (err) {
                                logger.error(`[GLOBAL] Error processing dept ${dId}:`, err.message);
                                allDeptSuccess = false;
                            }
                        }
                        if (allDeptSuccess) {
                            this.recordSuccess();
                        } else {
                            this.recordFailure();
                        }
                        return allDeptSuccess;
                    }

                    // SINGLE DEPT MODE: Process normally
                    if (cacheService) {
                        try {
                            await cacheService.invalidate(String(deptId));
                            logger.info(`${logTag} Cache invalidated`);
                        } catch (err) {
                            logger.error(`${logTag} Cache invalidation error:`, err.message);
                        }
                    }
                    await this.processDepartmentData(deptId, targetDate, responseData);
                    this.recordSuccess();
                    return true;

                } catch (error) {
                    this.metrics.failedFetches++;
                    this.recordFailure(); // Circuit Breaker

                    let errorDetail = error.message;
                    if (error.response) {
                        errorDetail = `API Error ${error.response.status}: ${JSON.stringify(error.response.data).substring(0, 100)}...`;
                    } else if (error.code === 'ECONNABORTED') {
                        errorDetail = 'Request timeout';
                    }

                    if (retryAttempt < this.maxRetries) {
                        const backoffTime = this.calculateBackoff(retryAttempt);
                        logger.warn(`${logTag} Attempt ${retryAttempt + 1}/${this.maxRetries} failed: ${errorDetail}`);
                        logger.warn(`Retry in ${backoffTime}ms...`);
                        await new Promise(resolve => setTimeout(resolve, backoffTime));
                        retryAttempt++;
                    } else {
                        logger.error(`${logTag} All attempts exhausted. Error: ${errorDetail}`);
                        throw error;
                    }
                }
            }
        });
    }

    /**
     * Process data for a specific department
     */
    async processDepartmentData(deptId, targetDate, data) {
        const logTag = `[Dept: ${deptId}]`;
        const targetDateISO = this.formatDateISO(targetDate);

        let client = null;
        try {
            client = await this.pool.connect();

            // 1. Get existing data from cache
            const existing = await client.query(
                'SELECT payload, data_hash FROM api_dashboard_cache WHERE division_id = $1 AND target_date = $2 ORDER BY created_at DESC NULLS LAST LIMIT 1',
                [String(deptId), targetDateISO]
            );

            const existingData = existing.rows.length > 0 ? existing.rows[0].payload : { orders: [], couriers: [] };
            const currentHash = this.calculateHash(data);

            // Optimization: If nothing changed, skip DB update
            if (existing.rows.length > 0 && existing.rows[0].data_hash === currentHash) {
                logger.debug(`${logTag} Data unchanged for ${targetDateISO} (Hash: ${currentHash.substring(0, 8)})`);
                return;
            }

            // 2. Merge data
            const mergedOrders = this.mergeOrders(existingData.orders, data.orders);
            const mergedCouriers = this.mergeCouriers(existingData.couriers, data.couriers, mergedOrders);
            const statusChanges = this.detectStatusChanges(existingData.orders, mergedOrders);

            // 3. Track status changes
            if (statusChanges.length > 0) {
                this.metrics.totalStatusChanges += statusChanges.length;
                logger.info(`${logTag} Detected ${statusChanges.length} status changes`);

                for (const change of statusChanges) {
                    await client.query(
                        'INSERT INTO api_dashboard_status_history (order_number, old_status, new_status, created_at) VALUES ($1, $2, $3, NOW())',
                        [change.orderNumber, change.oldStatus, change.newStatus]
                    );
                }
            }

            // 4. Update metrics
            this.metrics.totalOrders = Math.max(this.metrics.totalOrders, mergedOrders.length);

            // 5. Store in DB
            const finalPayload = {
                orders: mergedOrders,
                couriers: mergedCouriers,
                paymentMethods: data.paymentMethods || [],
                addresses: data.addresses || [],
                statistics: data.statistics || {}
            };

            await client.query(
                `INSERT INTO api_dashboard_cache (division_id, target_date, payload, data_hash, status_code, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                [String(deptId), targetDateISO, finalPayload, currentHash, 200]
            );

            // 6. Notify via WebSocket
            await client.query('SELECT pg_notify(\'dashboard_update\', $1)', [JSON.stringify({
                divisionId: deptId,
                targetDate: targetDateISO
            })]);

            logger.info(`${logTag} Successfully updated data for ${targetDateISO} (${mergedOrders.length} orders, ${mergedCouriers.length} couriers)`);

        } catch (error) {
            logger.error(`${logTag} Error processing department data:`, error.message);
            throw error;
        } finally {
            if (client) client.release();
        }
    }

    /**
     * Merge orders with type-safety and consistency
     */
    mergeOrders(existing, incoming) {
        if (!existing || !Array.isArray(existing)) return incoming || [];
        if (!incoming || !Array.isArray(incoming)) return existing || [];

        const merged = new Map();

        // Load existing orders
        existing.forEach(o => {
            const num = String(o.orderNumber || o.num || '');
            if (num) merged.set(num, o);
        });

        // Upsert incoming orders
        incoming.forEach(o => {
            const num = String(o.orderNumber || o.num || '');
            if (num) {
                const existingOrder = merged.get(num) || {};
                merged.set(num, { ...existingOrder, ...o });
            }
        });

        return Array.from(merged.values());
    }

    /**
     * Merge couriers with consistency and scrubbing
     * @param {Array} existing - Existing couriers in DB
     * @param {Array} incoming - Incoming couriers (already filtered by dept)
     * @param {Array} mergedOrders - The finalized orders for this department
     */
    mergeCouriers(existing, incoming, mergedOrders) {
        if (!incoming || !Array.isArray(incoming)) return existing || [];

        const merged = new Map();

        // 1. Get IDs of couriers actively assigned to orders
        const activeCourierIds = new Set();
        if (mergedOrders && Array.isArray(mergedOrders)) {
            mergedOrders.forEach(o => {
                const cid = o.courierId || o.courierName; // Fallback to name if ID missing
                if (cid) activeCourierIds.add(String(cid));
            });
        }

        // 2. Load existing couriers ONLY if they are active on orders
        // This effectively scrubs legacy garbage from the database records
        if (existing && Array.isArray(existing)) {
            existing.forEach(c => {
                const id = String(c.id || c.name || '');
                if (id && activeCourierIds.has(id)) {
                    merged.set(id, c);
                }
            });
        }

        // 3. Upsert incoming couriers (these are already filtered by dept)
        // We ALWAYS keep these as they are fresh from the API for this department
        incoming.forEach(c => {
            const id = String(c.id || c.name || '');
            if (id) {
                const existingCourier = merged.get(id) || {};
                merged.set(id, { ...existingCourier, ...c });
            }
        });

        return Array.from(merged.values());
    }

    /**
     * Detect status changes
     */
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
                changes.push({
                    orderNumber: num,
                    oldStatus,
                    newStatus: n.status
                });
            }
        });

        return changes;
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
