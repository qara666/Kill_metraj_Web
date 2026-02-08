const logger = require('../utils/logger');
const cacheService = require('../services/CacheService');
const { sequelize } = require('../models');

/**
 * GetDashboardDataQuery
 * Encapsulates the logic for fetching dashboard data (orders and couriers).
 * Implements cache-aside pattern and filtering by division.
 */
class GetDashboardDataQuery {
    /**
     * Execute the query
     * @param {Object} params
     * @param {string} params.divisionId - Division ID for filtering (or 'all' for admin)
     * @param {Object} params.user - User object from request for additional context
     * @param {string} [params.date] - Optional target date (YYYY-MM-DD)
     * @returns {Promise<Object>} Dashboard data
     */
    /**
     * Helper to retry DB queries on connection failures
     */
    async withRetry(queryFn, maxRetries = 2) {
        let lastError;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await queryFn();
            } catch (error) {
                lastError = error;
                const isConnectionError = error.name === 'SequelizeConnectionError' ||
                    error.name === 'SequelizeConnectionAcquireTimeoutError' ||
                    error.message.includes('Connection terminated') ||
                    error.message.includes('terminating connection');

                if (isConnectionError && attempt < maxRetries) {
                    const delay = 1000 * (attempt + 1);
                    logger.warn(`CQRS: Сбой подключения, попытка ${attempt + 1}/${maxRetries} через ${delay}мс...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                throw error;
            }
        }
        throw lastError;
    }

    async execute({ divisionId, user, date }) {
        try {
            // Standardize targetDate to DD.MM.YYYY for DB lookup consistency
            let targetDate = date;
            if (!targetDate) {
                const now = new Date();
                const day = String(now.getDate()).padStart(2, '0');
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const year = now.getFullYear();
                targetDate = `${day}.${month}.${year}`;
            }

            logger.info(`CQRS Execute: divisionId=${divisionId}, date=${targetDate}, user=${user?.username}`);

            // 1. Try Cache First (for non-admin or specific division)
            if (!date && divisionId !== 'all') {
                try {
                    const cached = await cacheService.getDashboardData(divisionId);
                    if (cached) {
                        logger.info(`CQRS: Cache Hit for ${divisionId}`);
                        return { ...cached, cached: true };
                    }
                } catch (cacheErr) {
                    logger.error('CQRS: Cache Read Error', { error: cacheErr.message });
                }
            }

            // 2. Admin Logic: Merge all departments
            if (divisionId === 'all') {
                logger.info('CQRS: Admin request - merging all departments');

                // Get unique divisions
                const divisions = await sequelize.query(
                    'SELECT DISTINCT division_id FROM api_dashboard_cache WHERE status_code = 200 AND target_date = :targetDate',
                    { replacements: { targetDate }, type: sequelize.QueryTypes.SELECT }
                );

                if (divisions.length === 0) {
                    logger.warn(`CQRS: No data for any department on ${targetDate}`);
                    return null;
                }

                const mergedPayload = {
                    orders: [],
                    couriers: [],
                    paymentMethods: [],
                    addresses: [],
                    routes: [],
                    errors: [],
                    warnings: [],
                    statistics: {
                        totalOrders: 0,
                        totalAmount: 0,
                        averageAmount: 0,
                        deliveryCount: 0,
                        pickupCount: 0
                    },
                    summary: {
                        totalRows: 0,
                        orders: 0,
                        couriers: 0,
                        paymentMethods: 0,
                        errors: [],
                        successfulGeocoding: 0,
                        failedGeocoding: 0
                    }
                };

                let latestTotalTimestamp = 0;

                for (const divRow of divisions) {
                    const divId = divRow.division_id;
                    const result = await sequelize.query(
                        `SELECT * FROM api_dashboard_cache 
                         WHERE status_code = 200 
                         AND target_date = :targetDate 
                         AND division_id = :divId
                         ORDER BY created_at DESC LIMIT 1`,
                        { replacements: { targetDate, divId }, type: sequelize.QueryTypes.SELECT }
                    );

                    if (result.length > 0) {
                        const row = result[0];
                        const payload = row.payload || {};

                        // Merge data arrays
                        if (Array.isArray(payload.orders)) mergedPayload.orders.push(...payload.orders);
                        if (Array.isArray(payload.couriers)) mergedPayload.couriers.push(...payload.couriers);
                        if (Array.isArray(payload.paymentMethods)) mergedPayload.paymentMethods.push(...payload.paymentMethods);
                        if (Array.isArray(payload.addresses)) mergedPayload.addresses.push(...payload.addresses);
                        if (Array.isArray(payload.routes)) mergedPayload.routes.push(...payload.routes);
                        if (Array.isArray(payload.errors)) mergedPayload.errors.push(...payload.errors);
                        if (Array.isArray(payload.warnings)) mergedPayload.warnings.push(...payload.warnings);

                        // Accumulate stats if they exist in source payload
                        if (payload.statistics) {
                            mergedPayload.statistics.totalOrders += (payload.statistics.totalOrders || 0);
                            mergedPayload.statistics.totalAmount += (payload.statistics.totalAmount || 0);
                            mergedPayload.statistics.deliveryCount += (payload.statistics.deliveryCount || 0);
                            mergedPayload.statistics.pickupCount += (payload.statistics.pickupCount || 0);
                        } else if (payload.orders) {
                            // Fallback if statistics missing
                            mergedPayload.statistics.totalOrders += payload.orders.length;
                            mergedPayload.statistics.totalAmount += payload.orders.reduce((sum, o) => sum + (o.amount || 0), 0);
                        }

                        const ts = new Date(row.created_at).getTime();
                        if (ts > latestTotalTimestamp) latestTotalTimestamp = ts;
                    }
                }

                // Finalize statistics
                if (mergedPayload.statistics.totalOrders > 0) {
                    mergedPayload.statistics.averageAmount = mergedPayload.statistics.totalAmount / mergedPayload.statistics.totalOrders;
                }

                // Finalize summary
                mergedPayload.summary = {
                    totalRows: mergedPayload.orders.length + mergedPayload.couriers.length,
                    orders: mergedPayload.orders.length,
                    couriers: mergedPayload.couriers.length,
                    paymentMethods: mergedPayload.paymentMethods.length,
                    errors: mergedPayload.errors,
                    successfulGeocoding: mergedPayload.orders.filter(o => o.geocoded).length,
                    failedGeocoding: mergedPayload.orders.filter(o => !o.geocoded).length
                };

                logger.info(`CQRS: Merged ${mergedPayload.orders.length} orders from ${divisions.length} departments`);

                return {
                    payload: mergedPayload,
                    created_at: new Date(latestTotalTimestamp).toISOString(),
                    cached: false,
                    status_code: 200
                };
            }

            // 3. Division Logic: Single department query
            const results = await this.withRetry(() => sequelize.query(
                `SELECT * FROM api_dashboard_cache 
                 WHERE status_code = 200 
                 AND target_date = :targetDate 
                 AND division_id = :divisionId
                 ORDER BY created_at DESC LIMIT 1`,
                {
                    replacements: { targetDate, divisionId: String(divisionId) },
                    type: sequelize.QueryTypes.SELECT
                }
            ));

            if (results.length === 0) {
                logger.warn(`CQRS: No data for department ${divisionId} on ${targetDate}`);
                return null;
            }

            return await this.processPayload(results[0], user, divisionId);

        } catch (error) {
            logger.error('CQRS CRITICAL ERROR:', {
                message: error.message,
                stack: error.stack,
                divisionId,
                date
            });
            throw error;
        }
    }

    /**
     * Internal helper to process payload (filtering and caching)
     */
    async processPayload(row, user, divisionId) {
        let payload = row.payload;
        const createdAt = row.created_at;

        // Ensure data is structured
        if (!payload) payload = { orders: [], couriers: [] };

        // 1. Filter by divisionId if not admin (Extra layer of security)
        if (user.role !== 'admin' && user.divisionId) {
            payload = {
                ...payload,
                orders: (payload.orders || []).filter(o => String(o.departmentId || o.divisionId) === String(user.divisionId)),
                couriers: (payload.couriers || []).filter(c => String(c.departmentId || c.divisionId) === String(user.divisionId))
            };
        }

        // 2. Store filtered data in cache for future requests
        if (divisionId !== 'all') {
            await cacheService.setDashboardData(divisionId, {
                payload: payload,
                created_at: createdAt
            }).catch(err => logger.error('Cache Store Error:', err.message));
        }

        return {
            payload: payload,
            created_at: createdAt,
            cached: false,
            status_code: row.status_code
        };
    }
}

module.exports = new GetDashboardDataQuery();
