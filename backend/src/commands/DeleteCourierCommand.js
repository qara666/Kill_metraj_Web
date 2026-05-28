const { User } = require('../models');
const logger = require('../utils/logger');

/**
 * DeleteCourierCommand
 * Обрабатывает удаление (или деактивацию) курьера.
 */
class DeleteCourierCommand {
    /**
     * Выполнить команду
     * @param {string} id - ID курьера для удаления
     * @param {Object} context - Контекст выполнения
     * @returns {Promise<boolean>} Статус успеха
     */
    async execute(id, context) {
        try {
            const courier = await User.findByPk(id);
            if (!courier) {
                throw new Error('Курьер не найден');
            }

            if (courier.role === 'admin') {
                throw new Error('Нельзя удалить администратора');
            }

            // Можем сделать жесткое или мягкое удаление (деактивацию)
            // Здесь делаем жесткое удаление согласно изначальному замыслу макета
            await courier.destroy();

            logger.info(`CQRS: Курьер удален: ${courier.username} (ID: ${id}) пользователем ${context.user.username}`);
            return true;
        } catch (error) {
            logger.error('CQRS: Ошибка выполнения DeleteCourierCommand:', error);
            throw error;
        }
    }
}

module.exports = new DeleteCourierCommand();
