const { User } = require('../models');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');

/**
 * CreateCourierCommand
 * Обрабатывает создание нового пользователя-курьера.
 */
class CreateCourierCommand {
    /**
     * Выполнить команду
     * @param {Object} data - Данные курьера
     * @param {Object} context - Контекст выполнения (например, выполняющий пользователь)
     * @returns {Promise<Object>} Созданный курьер
     */
    async execute(data, context) {
        try {
            const { username, password, divisionId } = data;

            // Валидация
            if (!username || !password) {
                throw new Error('Имя пользователя и пароль обязательны');
            }

            // Проверка exists
            const existing = await User.findOne({ where: { username } });
            if (existing) {
                throw new Error('Курьер с таким именем пользователя уже существует');
            }

            // Хеширование пароля
            const passwordHash = await bcrypt.hash(password, 10);

            // Создание user
            const courier = await User.create({
                username,
                passwordHash,
                divisionId,
                role: 'courier',
                isActive: true
            });

            logger.info(`CQRS: Курьер создан: ${username} пользователем ${context.user.username}`);

            // Возврат без хеша пароля
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
