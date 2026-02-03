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
    async execute({ divisionId, user, date }) {
        try {
            // Use provided date or default to today's date in local time
            const targetDate = date || new Date().toISOString().split('T')[0];

            logger.debug(`CQRS: Получение данных за ${targetDate} для подразделения ${divisionId}`);

            // 1. Fetch from database with target_date filter
            const results = await sequelize.query(
                `SELECT * FROM api_dashboard_cache 
                 WHERE status_code = 200 AND target_date = :targetDate
                 ORDER BY created_at DESC LIMIT 1`,
                {
                    replacements: { targetDate },
                    type: sequelize.QueryTypes.SELECT
                }
            );

            if (results.length === 0) {
                // If no record for specific date, fall back to any latest record if no date was specified
                if (!date) {
                    const fallbackResults = await sequelize.query(
                        'SELECT * FROM api_dashboard_cache WHERE status_code = 200 ORDER BY created_at DESC LIMIT 1',
                        { type: sequelize.QueryTypes.SELECT }
                    );
                    if (fallbackResults.length === 0) return null;
                    return await this.processPayload(fallbackResults[0], user, divisionId);
                }
                return null;
            }

            return await this.processPayload(results[0], user, divisionId);
        } catch (error) {
            logger.error('CQRS: Ошибка выполнения GetDashboardDataQuery:', {
                error: error.message,
                stack: error.stack,
                divisionId
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

        // 1. Filter by divisionId if not admin
        if (user.role !== 'admin' && user.divisionId) {
            payload = {
                ...payload,
                orders: (payload.orders || []).filter(o => String(o.departmentId) === String(user.divisionId)),
                couriers: (payload.couriers || []).filter(c => String(c.departmentId) === String(user.divisionId))
            };
        }

        // 2. Store filtered data in Redis cache for future requests
        // Note: We use divisionId as part of the key in CacheService
        await cacheService.setDashboardData(divisionId, {
            payload: payload,
            created_at: createdAt
        }).catch(err => logger.error('Cache Store Error:', err.message));

        return {
            payload: payload,
            created_at: createdAt,
            cached: false,
            status_code: row.status_code
        };
    }
}

module.exports = new GetDashboardDataQuery();
