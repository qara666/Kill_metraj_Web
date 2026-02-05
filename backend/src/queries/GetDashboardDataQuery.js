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
            const targetDate = date || new Date().toISOString().split('T')[0];
            logger.info(`CQRS Execute: divisionId=${divisionId}, date=${targetDate}, user=${user?.username}`);

            // 1. Пытка получить из кэша
            if (!date) {
                try {
                    const cached = await cacheService.getDashboardData(divisionId);
                    if (cached) {
                        logger.info(`CQRS: Каш-хит для ${divisionId}`);
                        return { ...cached, cached: true };
                    }
                } catch (cacheErr) {
                    logger.error('CQRS: Ошибка при чтении кэша', { error: cacheErr.message });
                }
            }

            // 2. Запрос в БД с ретраями
            logger.debug(`CQRS: Запрос к БД за ${targetDate}`);
            const results = await this.withRetry(() => sequelize.query(
                `SELECT * FROM api_dashboard_cache 
                 WHERE status_code = 200 
                 AND target_date = :targetDate 
                 AND (division_id = :divisionId OR :divisionId = 'all')
                 ORDER BY created_at DESC LIMIT 1`,
                {
                    replacements: { targetDate, divisionId: String(divisionId) },
                    type: sequelize.QueryTypes.SELECT
                }
            ));

            if (results.length === 0) {
                if (!date) {
                    logger.debug('CQRS: Записей за дату нет, ищем последнюю доступную');
                    const fallbackResults = await this.withRetry(() => sequelize.query(
                        'SELECT * FROM api_dashboard_cache WHERE status_code = 200 ORDER BY created_at DESC LIMIT 1',
                        { type: sequelize.QueryTypes.SELECT }
                    ));

                    if (fallbackResults.length === 0) {
                        logger.warn('CQRS: В БД нет никаких данных дашборда');
                        return null;
                    }
                    return await this.processPayload(fallbackResults[0], user, divisionId);
                }
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
