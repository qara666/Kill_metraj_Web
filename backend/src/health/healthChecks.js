const logger = require('../utils/logger');
const cacheService = require('../services/CacheService');

async function checkDatabase(sequelize) {
  const start = Date.now();
  try {
    await sequelize.query('SELECT 1');
    return {
      name: 'postgresql',
      healthy: true,
      responseTime: Date.now() - start
    };
  } catch (error) {
    return {
      name: 'postgresql',
      healthy: false,
      error: error.message,
      responseTime: Date.now() - start
    };
  }
}

async function checkRedis() {
  if (!cacheService.isEnabled) {
    return {
      name: 'redis',
      healthy: true,
      message: 'Redis disabled, using LRU memory cache'
    };
  }
  try {
    return await cacheService.healthCheck();
  } catch (error) {
    return {
      name: 'redis',
      healthy: false,
      error: error.message
    };
  }
}

async function checkKafka() {
  if (process.env.CDC_ENABLED !== 'true') {
    return {
      name: 'kafka',
      healthy: true,
      message: 'CDC/Kafka disabled'
    };
  }
  try {
    const { Kafka } = require('kafkajs');
    const kafka = new Kafka({
      brokers: (process.env.KAFKA_BROKER || 'localhost:9092').split(',')
    });
    const admin = kafka.admin();
    await admin.connect();
    await admin.disconnect();
    return {
      name: 'kafka',
      healthy: true
    };
  } catch (error) {
    return {
      name: 'kafka',
      healthy: false,
      error: error.message
    };
  }
}

const livenessProbe = (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    memory: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
    }
  });
};

const readinessProbe = (sequelize) => {
  return async (req, res) => {
    try {
      const [dbCheck, redisCheck, kafkaCheck] = await Promise.all([
        checkDatabase(sequelize),
        checkRedis(),
        checkKafka()
      ]);

      const checks = [dbCheck, redisCheck, kafkaCheck];
      const allHealthy = checks.every(c => c.healthy);
      const status = allHealthy ? 'ready' : 'degraded';
      const httpStatus = allHealthy ? 200 : 503;

      res.status(httpStatus).json({
        status,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        checks
      });
    } catch (error) {
      logger.error('Readiness probe failed:', error);
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  };
};

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
          checks: [dbCheck]
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
