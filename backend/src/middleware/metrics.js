const promClient = require('prom-client');

/**
 * Prometheus Metrics Registry
 */
const register = new promClient.Registry();

// Collect default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({
    register,
    prefix: 'kill_metraj_'
});

/**
 * Custom Metrics
 */

// Длительность HTTP-запросов
const httpRequestDuration = new promClient.Histogram({
    name: 'kill_metraj_http_request_duration_seconds',
    help: 'Длительность HTTP-запросов в секундах',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registers: [register]
});

// Счетчик HTTP-запросов
const httpRequestCounter = new promClient.Counter({
    name: 'kill_metraj_http_requests_total',
    help: 'Общее количество HTTP-запросов',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register]
});

// Счетчик подключений WebSocket
const wsConnectionsGauge = new promClient.Gauge({
    name: 'kill_metraj_websocket_connections',
    help: 'Текущее количество подключений WebSocket',
    labelNames: ['division_id', 'role'],
    registers: [register]
});

// Длительность запросов к БД
const dbQueryDuration = new promClient.Histogram({
    name: 'kill_metraj_db_query_duration_seconds',
    help: 'Длительность запросов к базе данных в секундах',
    labelNames: ['operation', 'table'],
    buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1],
    registers: [register]
});

// Статистика запросов к Dashboard API
const dashboardFetchCounter = new promClient.Counter({
    name: 'kill_metraj_dashboard_fetches_total',
    help: 'Общее количество запросов к дашборду',
    labelNames: ['status'],
    registers: [register]
});

// Статистика операций кэширования
const cacheCounter = new promClient.Counter({
    name: 'kill_metraj_cache_operations_total',
    help: 'Общее количество операций с кэшем',
    labelNames: ['operation', 'result'],
    registers: [register]
});

/**
 * Middleware to track HTTP metrics
 */
const metricsMiddleware = (req, res, next) => {
    const start = Date.now();

    // Track response
    res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        const route = req.route?.path || req.path || 'unknown';
        const labels = {
            method: req.method,
            route: route,
            status_code: res.statusCode
        };

        httpRequestDuration.observe(labels, duration);
        httpRequestCounter.inc(labels);
    });

    next();
};

/**
 * Helper functions for manual metric tracking
 */
const trackWebSocketConnection = (action, divisionId, role) => {
    const value = action === 'connect' ? 1 : -1;
    wsConnectionsGauge.inc({ division_id: divisionId || 'none', role: role || 'unknown' }, value);
};

const trackDatabaseQuery = async (operation, table, queryFn) => {
    const start = Date.now();
    try {
        const result = await queryFn();
        const duration = (Date.now() - start) / 1000;
        dbQueryDuration.observe({ operation, table }, duration);
        return result;
    } catch (error) {
        const duration = (Date.now() - start) / 1000;
        dbQueryDuration.observe({ operation, table }, duration);
        throw error;
    }
};

const trackDashboardFetch = (success) => {
    dashboardFetchCounter.inc({ status: success ? 'success' : 'failure' });
};

const trackCacheOperation = (operation, result) => {
    cacheCounter.inc({ operation, result });
};

module.exports = {
    register,
    metricsMiddleware,
    trackWebSocketConnection,
    trackDatabaseQuery,
    trackDashboardFetch,
    trackCacheOperation,
    // Export individual metrics for direct access if needed
    httpRequestDuration,
    httpRequestCounter,
    wsConnectionsGauge,
    dbQueryDuration,
    dashboardFetchCounter,
    cacheCounter
};
