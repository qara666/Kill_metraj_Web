const { User } = require('../models');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');

/**
 * UpdateCourierCommand
 * Обрабатывает обновление данных курьера.
 */
class UpdateCourierCommand {
    /**
     * Выполнить команду
     * @param {string} id - ID курьера
     * @param {Object} data - Данные для обновления
     * @param {Object} context - Контекст выполнения
     * @returns {Promise<Object>} Обновленный курьер
     */
    async execute(id, data, context) {
        try {
            const courier = await User.findByPk(id);
            if (!courier) {
                throw new Error('Курьер не найден');
            }

            const { username, password, divisionId, isActive } = data;

            // Обновление fields
            if (username) courier.username = username;
            if (divisionId !== undefined) courier.divisionId = divisionId;
            if (isActive !== undefined) courier.isActive = isActive;

            // Хеширование пароля, если предоставлен
            if (password) {
                courier.passwordHash = await bcrypt.hash(password, 10);
            }

            await courier.save();

            logger.info(`CQRS: Курьер обновлен: ${courier.username} (ID: ${id}) пользователем ${context.user.username}`);

            // Возврат без хеша пароля
            const result = courier.toJSON();
            delete result.passwordHash;
            return result;
        } catch (error) {
            logger.error('CQRS: Ошибка выполнения UpdateCourierCommand:', error);
            throw error;
        }
    }
}

module.exports = new UpdateCourierCommand();
