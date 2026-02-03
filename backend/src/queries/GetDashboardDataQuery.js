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
     * @returns {Promise<Object>} Dashboard data
     */
    async execute({ divisionId, user }) {
        try {
            // 1. Try cache first
            const cachedData = await cacheService.getDashboardData(divisionId);
            if (cachedData) {
                logger.debug(`CQRS: Кэш ПОПАДАНИЕ для подразделения ${divisionId}`);
                return {
                    payload: cachedData.payload,
                    created_at: cachedData.created_at,
                    cached: true
                };
            }

            // 2. Cache miss - fetch from database
            logger.debug(`CQRS: Кэш ПРОМАХ для подразделения ${divisionId} - получение из БД`);
            const results = await sequelize.query(
                'SELECT * FROM api_dashboard_cache WHERE status_code = 200 ORDER BY created_at DESC LIMIT 1',
                { type: sequelize.QueryTypes.SELECT }
            );

            if (results.length === 0) {
                return null;
            }

            let payload = results[0].payload;
            const createdAt = results[0].created_at;

            // 3. Filter by divisionId if not admin
            if (user.role !== 'admin' && user.divisionId) {
                payload = {
                    ...payload,
                    orders: (payload.orders || []).filter(o => String(o.departmentId) === String(user.divisionId)),
                    couriers: (payload.couriers || []).filter(c => String(c.departmentId) === String(user.divisionId))
                };
            }

            // 4. Store filtered data in cache for future requests
            await cacheService.setDashboardData(divisionId, {
                payload: payload,
                created_at: createdAt
            });

            return {
                payload: payload,
                created_at: createdAt,
                cached: false,
                status_code: results[0].status_code
            };
        } catch (error) {
            logger.error('CQRS: Ошибка выполнения GetDashboardDataQuery:', error);
            throw error;
        }
    }
}

module.exports = new GetDashboardDataQuery();
