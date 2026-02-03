const { User } = require('../models');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');

/**
 * CreateCourierCommand
 * Handles the creation of a new courier user.
 */
class CreateCourierCommand {
    /**
     * Execute the command
     * @param {Object} data - Courier data
     * @param {Object} context - Execution context (e.g., performing user)
     * @returns {Promise<Object>} Created courier
     */
    async execute(data, context) {
        try {
            const { username, password, divisionId } = data;

            // Validation
            if (!username || !password) {
                throw new Error('Имя пользователя и пароль обязательны');
            }

            // Check if exists
            const existing = await User.findOne({ where: { username } });
            if (existing) {
                throw new Error('Курьер с таким именем пользователя уже существует');
            }

            // Hash password
            const passwordHash = await bcrypt.hash(password, 10);

            // Create user
            const courier = await User.create({
                username,
                passwordHash,
                divisionId,
                role: 'courier',
                isActive: true
            });

            logger.info(`CQRS: Курьер создан: ${username} пользователем ${context.user.username}`);

            // Return without password hash
            const result = courier.toJSON();
            delete result.passwordHash;
            return result;
        } catch (error) {
            logger.error('CQRS: Ошибка выполнения CreateCourierCommand:', error);
            throw error;
        }
    }
}

module.exports = new CreateCourierCommand();
