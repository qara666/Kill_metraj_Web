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

        // Внутреннее хранилище для случая, если Redis отключен
        this.memoryCache = new Map();

        if (this.isEnabled) {
            this.connect();
        } else {
            logger.info('Кэш Redis отключен. Используется In-Memory кэш.');
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
        const key = `dashboard:${divisionId}`;

        // Try Redis first if enabled
        if (this.isEnabled && this.redis) {
            try {
                const cached = await this.redis.get(key);
                if (cached) {
                    trackCacheOperation('get', 'hit');
                    return JSON.parse(cached);
                }
            } catch (error) {
                logger.error('Ошибка получения из Redis:', error);
            }
        }

        // Fallback to Memory Cache
        const cached = this.memoryCache.get(key);
        if (cached && (Date.now() - cached.timestamp < (cached.ttl || this.defaultTTL) * 1000)) {
            trackCacheOperation('get', 'hit');
            return cached.data;
        }

        trackCacheOperation('get', 'miss');
        return null;
    }

    /**
     * Запись данных дашборда в кэш
     */
    async setDashboardData(divisionId = 'all', data, ttl = null) {
        const key = `dashboard:${divisionId}`;
        const expiry = ttl || this.defaultTTL;

        // Save to Redis if enabled
        if (this.isEnabled && this.redis) {
            try {
                await this.redis.setex(key, expiry, JSON.stringify(data));
                trackCacheOperation('set', 'success');
            } catch (error) {
                logger.error('Ошибка записи в Redis:', error);
            }
        }

        // Save to Memory Cache (L1 cache) with safety checks
        try {
            const dataStr = JSON.stringify(data);
            const sizeMB = dataStr.length / (1024 * 1024);

            // Если данные больше 2МБ, не кэшируем в памяти для предотвращения OOM на Render
            if (sizeMB > 2) {
                logger.debug(`Cache: Пропуск In-Memory для ${key} (Размер: ${sizeMB.toFixed(2)} MB слишком велик)`);
                return true;
            }

            // Ограничиваем количество элементов в памяти (простая реализация FIFO)
            if (this.memoryCache.size >= 10) {
                const firstKey = this.memoryCache.keys().next().value;
                this.memoryCache.delete(firstKey);
            }

            this.memoryCache.set(key, {
                data,
                timestamp: Date.now(),
                ttl: expiry
            });
        } catch (err) {
            logger.error('Cache: Ошибка при записи в In-Memory кэш', { error: err.message });
        }

        return true;
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
