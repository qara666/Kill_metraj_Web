const { User } = require('../models');
const logger = require('../utils/logger');

/**
 * GetCourierQuery
 * Fetches a single courier by ID.
 */
class GetCourierQuery {
    /**
     * Execute the query
     * @param {string} id - Courier ID
     * @returns {Promise<Object>} Courier details
     */
    async execute(id) {
        try {
            const courier = await User.findByPk(id, {
                attributes: ['id', 'username', 'role', 'divisionId', 'isActive']
            });

            if (!courier) {
                throw new Error('Courier not found');
            }

            return courier;
        } catch (error) {
            logger.error(`CQRS: Error executing GetCourierQuery for ID ${id}:`, error);
            throw error;
        }
    }
}

module.exports = new GetCourierQuery();
