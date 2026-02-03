const { Sequelize } = require('sequelize');
require('dotenv').config();
const logger = require('../utils/logger');

const isProduction = process.env.NODE_ENV === 'production';

// Определяем тип процесса для оптимизации пула
// Это предотвращает исчерпание соединений на Render (лимит 25)
const isWorker = process.argv[1]?.includes('worker') || process.argv[1]?.includes('fetcher');

const poolConfig = {
    max: isWorker ? 5 : 10,  // Основное приложение получает больше соединений
    min: isWorker ? 1 : 2,
    acquire: 60000,          // Увеличиваем время ожидания до 60с для стабильности
    idle: 10000
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

    try {
        // Оптимизация: используем один запрос для установки всех переменных
        await sequelize.query(`
            SET LOCAL app.user_id = '${context.userId}';
            SET LOCAL app.division_id = '${context.divisionId}';
            SET LOCAL app.user_role = '${context.role}';
        `, {
            logging: false,
            raw: true,
            hooks: false, // Важно для предотвращения рекурсии
            transaction: options.transaction
        });
    } catch (err) {
        // Мягкая обработка ошибок RLS, чтобы не прерывать основной запрос
        logger.error('Ошибка установки контекста RLS:', { error: err.message });
    }
});

module.exports = { sequelize, testConnection };
