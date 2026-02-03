const Redis = require('ioredis');
const logger = require('../utils/logger');
const { trackCacheOperation } = require('../middleware/metrics');

/**
 * Сервис кэширования Redis
 * Реализует паттерн кэширования для данных дашборда
 */
class CacheService {
    constructor() {
        this.redis = null;
        this.isEnabled = process.env.REDIS_ENABLED === 'true';
        this.defaultTTL = parseInt(process.env.REDIS_TTL || '300'); // 5 минут по умолчанию

        if (this.isEnabled) {
            this.connect();
        } else {
            logger.info('Кэш Redis отключен. Установите REDIS_ENABLED=true для включения.');
        }
    }

    /**
     * Подключение к Redis
     */
    connect() {
        try {
            const redisOptions = {
                retryStrategy: (times) => {
                    const delay = Math.min(times * 50, 2000);
                    logger.warn(`Повторная попытка подключения к Redis ${times}, задержка: ${delay}мс`);
                    return delay;
                },
                maxRetriesPerRequest: 3
            };

            if (process.env.REDIS_URL) {
                this.redis = new Redis(process.env.REDIS_URL, redisOptions);
            } else {
                this.redis = new Redis({
                    host: process.env.REDIS_HOST || 'localhost',
                    port: parseInt(process.env.REDIS_PORT || '6379'),
                    password: process.env.REDIS_PASSWORD,
                    ...redisOptions
                });
            }

            this.redis.on('connect', () => {
                logger.info('Redis успешно подключен');
            });

            this.redis.on('error', (err) => {
                logger.error('Ошибка Redis:', err);
            });

            this.redis.on('close', () => {
                logger.warn('Соединение с Redis закрыто');
            });

        } catch (error) {
            logger.error('Не удалось инициализировать Redis:', error);
            this.isEnabled = false;
        }
    }

    /**
     * Получение данных дашборда из кэша
     */
    async getDashboardData(divisionId = 'all') {
        if (!this.isEnabled || !this.redis) {
            trackCacheOperation('get', 'disabled');
            return null;
        }

        try {
            const key = `dashboard:${divisionId}`;
            const cached = await this.redis.get(key);

            if (cached) {
                trackCacheOperation('get', 'hit');
                logger.debug(`Попадание в кэш для ${key}`);
                return JSON.parse(cached);
            }

            trackCacheOperation('get', 'miss');
            logger.debug(`Промах кэша для ${key}`);
            return null;
        } catch (error) {
            logger.error('Ошибка получения из кэша:', error);
            trackCacheOperation('get', 'error');
            return null;
        }
    }

    /**
     * Запись данных дашборда в кэш
     */
    async setDashboardData(divisionId = 'all', data, ttl = null) {
        if (!this.isEnabled || !this.redis) {
            return false;
        }

        try {
            const key = `dashboard:${divisionId}`;
            const value = JSON.stringify(data);
            const expiry = ttl || this.defaultTTL;

            await this.redis.setex(key, expiry, value);
            trackCacheOperation('set', 'success');
            logger.debug(`Данные записаны в кэш для ${key} (TTL: ${expiry}с)`);
            return true;
        } catch (error) {
            logger.error('Ошибка записи в кэш:', error);
            trackCacheOperation('set', 'error');
            return false;
        }
    }

    /**
     * Сброс кэша для конкретного подразделения
     */
    async invalidate(divisionId = 'all') {
        if (!this.isEnabled || !this.redis) {
            return false;
        }

        try {
            const key = `dashboard:${divisionId}`;
            await this.redis.del(key);
            trackCacheOperation('invalidate', 'success');
            logger.debug(`Кэш для ${key} сброшен`);
            return true;
        } catch (error) {
            logger.error('Ошибка сброса кэша:', error);
            trackCacheOperation('invalidate', 'error');
            return false;
        }
    }

    /**
     * Сброс всего кэша дашбордов
     */
    async invalidateAll() {
        if (!this.isEnabled || !this.redis) {
            return false;
        }

        try {
            const keys = await this.redis.keys('dashboard:*');
            if (keys.length > 0) {
                await this.redis.del(...keys);
                trackCacheOperation('invalidate_all', 'success');
                logger.info(`Весь кэш сброшен (${keys.length} ключей)`);
            }
            return true;
        } catch (error) {
            logger.error('Ошибка полного сброса кэша:', error);
            trackCacheOperation('invalidate_all', 'error');
            return false;
        }
    }

    /**
     * Получение статистики кэша
     */
    async getStats() {
        if (!this.isEnabled || !this.redis) {
            return { enabled: false };
        }

        try {
            const info = await this.redis.info('stats');
            const keys = await this.redis.keys('dashboard:*');

            return {
                enabled: true,
                connected: this.redis.status === 'ready',
                keys: keys.length,
                info: info
            };
        } catch (error) {
            logger.error('Ошибка получения статистики кэша:', error);
            return { enabled: true, error: error.message };
        }
    }

    /**
     * Проверка работоспособности Redis
     */
    async healthCheck() {
        if (!this.isEnabled) {
            return { healthy: true, message: 'Redis отключен' };
        }

        if (!this.redis) {
            return { healthy: false, error: 'Redis не инициализирован' };
        }

        try {
            await this.redis.ping();
            return {
                healthy: true,
                status: this.redis.status,
                responseTime: 0
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message
            };
        }
    }

    /**
     * Закрытие соединения с Redis
     */
    async close() {
        if (this.redis) {
            await this.redis.quit();
            logger.info('Соединение с Redis закрыто');
        }
    }
}

// Singleton instance
const cacheService = new CacheService();

module.exports = cacheService;
