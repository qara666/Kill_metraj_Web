const { Sequelize } = require('sequelize');
require('dotenv').config();
const logger = require('../utils/logger');

const isProduction = process.env.NODE_ENV === 'production';

// Определяем тип процесса для оптимизации пула
// Это предотвращает исчерпание соединений на Render (лимит 25)
const isWorker = process.argv[1]?.includes('worker') || process.argv[1]?.includes('fetcher');

const poolConfig = {
    max: isWorker ? 2 : 10,   // Sufficient headroom for API concurrent requests
    min: 0,
    acquire: 20000,          // 20s to give more time for slow connection establishment
    idle: 5000,              // Keep short idle to release connections fast
    evict: 5000
};

const sequelize = process.env.DATABASE_URL
    ? new Sequelize(process.env.DATABASE_URL, {
        dialect: 'postgres',
        logging: false,
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false // Требуется для Render и других облачных БД
            }
        },
        pool: poolConfig
    })
    : new Sequelize({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'kill_metraj',
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        dialect: 'postgres',
        logging: false,
        pool: poolConfig
    });

const { rlsContextStore } = require('../utils/context');

// Проверка подключения
async function testConnection() {
    try {
        await sequelize.authenticate();
        logger.info(`PostgreSQL подключен (Пул: ${poolConfig.max}, Тип: ${isWorker ? 'Воркер' : 'API'})`);
    } catch (error) {
        logger.error('Нет подключения к PostgreSQL:', error);
    }
}

// Хук контекста RLS
// Устанавливает переменные сессии для Row-Level Security
sequelize.addHook('beforeQuery', async (options, query) => {
    const context = rlsContextStore.getStore();
    if (!context) return;

    // Предотвращаем рекурсию (sequelize.query в этом хуке снова вызовет этот хук)
    if (options._isRlsSetting) return;

    try {
        // Оптимизация: проверяем, не установлен ли уже этот контекст для текущего соединения
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

        // Оптимизированная установка контекста через один запрос
        // Используем set_config для безопасной и атомарной установки переменных сессии
        await sequelize.query(`
            SELECT 
                set_config('app.user_id', ${sequelize.escape(String(context.userId))}, true),
                set_config('app.division_id', ${sequelize.escape(String(context.divisionId || ''))}, true),
                set_config('app.user_role', ${sequelize.escape(String(context.role))}, true);
        `, {
            logging: false,
            raw: true,
            hooks: false,
            transaction: options.transaction,
            _isRlsSetting: true // Помечаем запрос как технический, чтобы избежать рекурсии
        });
    } catch (err) {
        logger.error('Ошибка установки контекста RLS:', { error: err.message });
    }
});

module.exports = { sequelize, testConnection };
