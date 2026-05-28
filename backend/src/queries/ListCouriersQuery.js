const { User } = require('../models');
const logger = require('../utils/logger');

/**
 * ListCouriersQuery
 * Получает список курьеров с опциональной фильтрацией.
 */
class ListCouriersQuery {
    /**
     * Выполнить запрос
     * @param {Object} params
     * @param {string} [params.role='courier'] - Фильтр по роли
     * @param {string} [params.divisionId] - Фильтр по дивизиону
     * @returns {Promise<Array>} Список курьеров
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
