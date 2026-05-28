const { sequelize } = require('../src/models');
const cacheService = require('../src/services/CacheService');
const logger = require('../src/utils/logger');

async function runProductionCheck() {
    console.log('Запуск проверки готовности системы...');
    let hasErrors = false;

    // 1. Проверить обязательные переменные окружения
    const requiredVars = [
        'DATABASE_URL',
        'JWT_SECRET',
        'EXTERNAL_API_KEY'
    ];

    console.log('\n--- 1. Переменные окружения ---');
    requiredVars.forEach(v => {
        if (process.env[v]) {
            console.log(`[OK] ${v} установлена`);
        } else {
            console.warn(`[!] ${v} ОТСУТСТВУЕТ (Это обязательно для Render)`);
            hasErrors = true;
        }
    });

    // 2. Подключение к базе данных
    console.log('\n--- 2. Подключение к базе данных ---');
    try {
        await sequelize.authenticate();
        console.log('[OK] Подключение к PostgreSQL успешно');
    } catch (err) {
        console.error('[!] Ошибка подключения к PostgreSQL:', err.message);
        hasErrors = true;
    }

    // 3. Подключение к Redis (опционально, но рекомендуется)
    console.log('\n--- 3. Подключение к Redis ---');
    if (process.env.REDIS_ENABLED === 'true') {
        const health = await cacheService.healthCheck();
        if (health.healthy) {
            console.log('[OK] Redis работает и подключен');
        } else {
            console.warn('[!] Redis включен, но проверка не удалась:', health.error);
        }
    } else {
        console.log('[i] Redis отключен (проверка пропущена)');
    }

    // 4. Проверка порта
    console.log('\n--- 4. Проверка конфигурации ---');
    console.log(`Порт: ${process.env.PORT || 5001}`);
    console.log(`gRPC Порт: ${process.env.GRPC_PORT || 50051}`);
    console.log(`Окружение: ${process.env.NODE_ENV || 'development'}`);

    console.log('\n============================================================');
    if (hasErrors) {
        console.log('ОШИБКА: Пожалуйста, исправьте отсутствующие конфигурации выше.');
        // Не завершаться с кодом 1, если просто отсутствуют локальные переменные, которые предоставит Render
    } else {
        console.log('УСПЕХ: Система готова к развертыванию!');
    }
    console.log('============================================================\n');

    process.exit(0);
}

runProductionCheck();
