const { User } = require('../models');
const logger = require('../utils/logger');

/**
 * GetCourierQuery
 * Получает одного курьера по ID.
 */
class GetCourierQuery {
    /**
     * Выполнить запрос
     * @param {string} id - ID курьера
     * @returns {Promise<Object>} Детали курьера
     */
    async execute(id) {
        try {
            const courier = await User.findByPk(id, {
                attributes: ['id', 'username', 'role', 'divisionId', 'isActive']
            });

            if (!courier) {
                throw new Error('Курьер не найден');
            }

            return courier;
        } catch (error) {
            logger.error(`CQRS: Error executing GetCourierQuery for ID ${id}:`, error);
            throw error;
        }
    }
}

module.exports = new GetCourierQuery();
