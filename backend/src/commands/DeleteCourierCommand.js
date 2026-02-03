const { User } = require('../models');
const logger = require('../utils/logger');

/**
 * DeleteCourierCommand
 * Handles the deletion (or deactivation) of a courier.
 */
class DeleteCourierCommand {
    /**
     * Execute the command
     * @param {string} id - Courier ID to delete
     * @param {Object} context - Execution context
     * @returns {Promise<boolean>} Success status
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

            // We can do hard delete or soft delete (deactivate)
            // Here we do hard delete per original mockup intention
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
