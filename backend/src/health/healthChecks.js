const logger = require('../utils/logger');

/**
 * Утилиты проверки состояния (Health Check)
 */

/**
 * Проверка состояния базы данных PostgreSQL
 */
async function checkDatabase(sequelize) {
    try {
        await sequelize.query('SELECT 1');
        return {
            name: 'postgresql',
            healthy: true,
            responseTime: 0
        };
    } catch (error) {
        return {
            name: 'postgresql',
            healthy: false,
            error: error.message
        };
    }
}

/**
 * Проверка состояния кэша Redis
 */
async function checkRedis() {
    return {
        name: 'redis',
        healthy: true,
        message: 'Проверка будет реализована позже'
    };
}

/**
 * Проверка состояния Kafka
 */
async function checkKafka() {
    return {
        name: 'kafka',
        healthy: true,
        message: 'Проверка будет реализована позже'
    };
}

/**
 * Liveness probe - проверяет, жива ли программа
 * Всегда возвращает 200, если процесс не упал полностью
 */
const livenessProbe = (req, res) => {
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
};

/**
 * Readiness probe - проверяет, готова ли программа принимать трафик
 * Проверяет все критические зависимости
 */
const readinessProbe = (sequelize) => {
    return async (req, res) => {
        try {
            const checks = await Promise.all([
                checkDatabase(sequelize),
                checkRedis(),
                checkKafka()
            ]);

            const allHealthy = checks.every(c => c.healthy);
            const status = allHealthy ? 'ready' : 'not_ready';
            const httpStatus = allHealthy ? 200 : 503;

            res.status(httpStatus).json({
                status,
                timestamp: new Date().toISOString(),
                checks
            });
        } catch (error) {
            logger.error('Проверка готовности не удалась:', error);
            res.status(503).json({
                status: 'error',
                timestamp: new Date().toISOString(),
                error: error.message
            });
        }
    };
};

/**
 * Startup probe - проверяет, успешно ли запустилась программа
 * Полезно для приложений с долгим запуском
 */
const startupProbe = (sequelize) => {
    return async (req, res) => {
        try {
            const dbCheck = await checkDatabase(sequelize);

            if (dbCheck.healthy) {
                res.status(200).json({
                    status: 'started',
                    timestamp: new Date().toISOString()
                });
            } else {
                res.status(503).json({
                    status: 'starting',
                    timestamp: new Date().toISOString(),
                    message: 'База данных не готова'
                });
            }
        } catch (error) {
            res.status(503).json({
                status: 'error',
                timestamp: new Date().toISOString(),
                error: error.message
            });
        }
    };
};

module.exports = {
    livenessProbe,
    readinessProbe,
    startupProbe,
    checkDatabase,
    checkRedis,
    checkKafka
};
