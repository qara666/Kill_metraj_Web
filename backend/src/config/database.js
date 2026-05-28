const { Sequelize } = require('sequelize');
require('dotenv').config();
const logger = require('../utils/logger');

const isProduction = process.env.NODE_ENV === 'production';
const isWorker = process.argv[1]?.includes('worker') || process.argv[1]?.includes('fetcher');

const poolConfig = {
  max: isWorker ? 2 : 10,
  min: isProduction ? 2 : 0,
  acquire: 20000,
  idle: 5000,
  evict: 5000
};

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    pool: poolConfig
  })
  : new Sequelize({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'kill_metraj',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    dialect: 'postgres',
    logging: false,
    pool: poolConfig
  });

const { rlsContextStore } = require('../utils/context');

async function testConnection() {
  try {
    await sequelize.authenticate();
    logger.info(`PostgreSQL connected (Pool: ${poolConfig.max}, Type: ${isWorker ? 'Worker' : 'API'})`);
  } catch (error) {
    logger.error('PostgreSQL connection failed:', error.message);
    throw error;
  }
}

sequelize.addHook('beforeQuery', async (options, query) => {
  const context = rlsContextStore.getStore();
  if (!context) return;

  if (options._isRlsSetting) return;

  try {
    if (options.connection) {
      const currentCtx = options.connection._rlsContext;
      if (currentCtx &&
        currentCtx.userId === context.userId &&
        currentCtx.divisionId === context.divisionId &&
        currentCtx.role === context.role) {
        return;
      }
      options.connection._rlsContext = { ...context };
    }

    await sequelize.query(`
      SELECT 
        set_config('app.user_id', ${sequelize.escape(String(context.userId || ''))}, true),
        set_config('app.division_id', ${sequelize.escape(String(context.divisionId || ''))}, true),
        set_config('app.user_role', ${sequelize.escape(String(context.role || ''))}, true);
    `, {
      logging: false,
      raw: true,
      hooks: false,
      transaction: options.transaction,
      _isRlsSetting: true
    });
  } catch (err) {
    logger.error('RLS context setup error:', { error: err.message });
  }
});

module.exports = { sequelize, testConnection };
