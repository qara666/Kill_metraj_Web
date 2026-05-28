const express = require('express');
const router = express.Router();
const { sequelize } = require('../config/database');
const { authenticateToken, requireRole, auditLog } = require('../middleware/auth');
const logger = require('../utils/logger');
const cacheService = require('../services/CacheService');

// Все маршруты требуют аутентификации и роли админа
router.use(authenticateToken);
router.use(requireRole('admin'));

/**
 * POST /api/maintenance/cleanup
 * Очистить весь кэш API дашборда и историю статусов.
 * Сохраняет пользователей и пресеты.
 */
router.post('/cleanup', auditLog('maintenance_db_cleanup'), async (req, res) => {
    const t = await sequelize.transaction();

    try {
        logger.warn(`[Maintenance] Database cleanup initiated by user ${req.user.username}`);

        // 1. Очистить таблицу кэша API
        await sequelize.query('TRUNCATE TABLE api_dashboard_cache RESTART IDENTITY', { transaction: t });

        // 2. Очистить таблицу истории статусов
        await sequelize.query('TRUNCATE TABLE api_dashboard_status_history RESTART IDENTITY', { transaction: t });

        // 3. Очистить состояния дашборда (результаты обработки Excel)
        await sequelize.query('TRUNCATE TABLE dashboard_states RESTART IDENTITY', { transaction: t });

        await t.commit();

        // 4. Очистить кэш в памяти/Redis если применимо
        await cacheService.invalidateAll();

        logger.info(`[Maintenance] Database cleanup completed successfully`);

        res.json({
            success: true,
            message: 'Кэш API, история статусов и результаты обработки Excel успешно очищены.',
            details: {
                tables_cleared: ['api_dashboard_cache', 'api_dashboard_status_history', 'dashboard_states']
            }
        });

    } catch (error) {
        if (t) await t.rollback();
        logger.error('[Maintenance] Cleanup failed', { error: error.message });

        res.status(500).json({
            success: false,
            error: 'DatabaseError',
            message: 'Не удалось выполнить очистку базы данных: ' + error.message
        });
    }
});

/**
 * GET /api/maintenance/stats
 * Получить текущее количество строк в таблицах для очистки.
 */
router.get('/stats', async (req, res) => {
    try {
        const [cacheCount] = await sequelize.query('SELECT COUNT(*) as count FROM api_dashboard_cache');
        const [historyCount] = await sequelize.query('SELECT COUNT(*) as count FROM api_dashboard_status_history');

        // Проверка безопасности если таблицы еще не существуют
        const safeCount = (result) => result && result[0] ? parseInt(result[0].count) : 0;

        res.json({
            success: true,
            stats: {
                api_dashboard_cache: safeCount(cacheCount),
                api_dashboard_status_history: safeCount(historyCount)
            }
        });
    } catch (error) {
        logger.error('[Maintenance] Failed to get stats', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'StatsError',
            message: 'Не удалось получить статистику: ' + error.message
        });
    }
});

module.exports = router;
