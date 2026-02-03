const { User } = require('../models');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');

/**
 * UpdateCourierCommand
 * Handles updating courier details.
 */
class UpdateCourierCommand {
    /**
     * Execute the command
     * @param {string} id - Courier ID
     * @param {Object} data - Update data
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Updated courier
     */
    async execute(id, data, context) {
        try {
            const courier = await User.findByPk(id);
            if (!courier) {
                throw new Error('Курьер не найден');
            }

            const { username, password, divisionId, isActive } = data;

            // Update fields
            if (username) courier.username = username;
            if (divisionId !== undefined) courier.divisionId = divisionId;
            if (isActive !== undefined) courier.isActive = isActive;

            // Hash password if provided
            if (password) {
                courier.passwordHash = await bcrypt.hash(password, 10);
            }

            await courier.save();

            logger.info(`CQRS: Курьер обновлен: ${courier.username} (ID: ${id}) пользователем ${context.user.username}`);

            // Return without password hash
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
