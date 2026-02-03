const { User } = require('../models');
const logger = require('../utils/logger');

/**
 * ListCouriersQuery
 * Fetches the list of couriers with optional filtering.
 */
class ListCouriersQuery {
    /**
     * Execute the query
     * @param {Object} params
     * @param {string} [params.role='courier'] - Filter by role
     * @param {string} [params.divisionId] - Filter by division
     * @returns {Promise<Array>} List of couriers
     */
    async execute({ role = 'courier', divisionId } = {}) {
        try {
            const where = { role };
            if (divisionId) {
                where.divisionId = divisionId;
            }

            const couriers = await User.findAll({
                where,
                attributes: ['id', 'username', 'role', 'divisionId', 'isActive'],
                order: [['username', 'ASC']]
            });

            return couriers;
        } catch (error) {
            logger.error('CQRS: Ошибка выполнения ListCouriersQuery:', error);
            throw error;
        }
    }
}

module.exports = new ListCouriersQuery();
