const Redis = require('ioredis');
const logger = require('../utils/logger');
const { trackCacheOperation } = require('../middleware/metrics');

/**
 * CacheService V2 — LRU + Stale-While-Revalidate
 * 
 * Улучшения:
 * - LRU вытеснение (по порядку доступа) вместо FIFO
 * - Stale-while-revalidate: отдача устаревших данных во время обновления
 * - Отслеживание лимита памяти на основе размера
 * - Статистика кэша и процент попаданий
 */
class CacheService {
    constructor() {
        this.redis = null;
        this.isEnabled = process.env.REDIS_ENABLED === 'true';
        this.defaultTTL = parseInt(process.env.REDIS_TTL || '300'); // 5 min
        this.staleTTL = parseInt(process.env.REDIS_STALE_TTL || '600'); // 10 min stale window

        // V2: LRU Кэш в памяти
        this.memoryCache = new Map(); // Сохраняет порядок вставки для LRU
        this.maxMemoryEntries = parseInt(process.env.CACHE_MAX_ENTRIES || '20');
        this.maxMemorySizeMB = parseFloat(process.env.CACHE_MAX_SIZE_MB || '8');
        this.currentMemorySizeBytes = 0;

        // V2: Статистика
        this.stats = {
            hits: 0,
            misses: 0,
            staleHits: 0,
            evictions: 0,
            writes: 0,
            totalSizeBytes: 0
        };

        if (this.isEnabled) {
            this.connect();
        } else {
            logger.info('Redis disabled. Using In-Memory LRU cache.');
        }
    }

    connect() {
        try {
            const redisOptions = {
                retryStrategy: (times) => {
                    const delay = Math.min(times * 50, 2000);
                    logger.warn(`Redis reconnect attempt ${times}, delay: ${delay}ms`);
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

            this.redis.on('connect', () => logger.info('Redis connected'));
            this.redis.on('error', (err) => logger.error('Redis error:', err));
            this.redis.on('close', () => logger.warn('Redis connection closed'));
        } catch (error) {
            logger.error('Redis init failed:', error);
            this.isEnabled = false;
        }
    }

    //  LRU Вспомогательные методы 

    /**
     * V2: Переместить запись в конец Map (самая недавно использованная)
     */
    _touchLRU(key) {
        const entry = this.memoryCache.get(key);
        if (entry) {
            this.memoryCache.delete(key);
            this.memoryCache.set(key, entry);
        }
    }

    /**
     * V2: Вытеснять наименее используемые записи до снижения лимитов
     */
    _evictIfNeeded() {
        // Вытеснение по количеству
        while (this.memoryCache.size >= this.maxMemoryEntries) {
            const firstKey = this.memoryCache.keys().next().value;
            const evicted = this.memoryCache.get(firstKey);
            this.currentMemorySizeBytes -= (evicted?.sizeBytes || 0);
            this.memoryCache.delete(firstKey);
            this.stats.evictions++;
        }

        // Вытеснение по общему размеру
        while (this.currentMemorySizeBytes > this.maxMemorySizeMB * 1024 * 1024 && this.memoryCache.size > 0) {
            const firstKey = this.memoryCache.keys().next().value;
            const evicted = this.memoryCache.get(firstKey);
            this.currentMemorySizeBytes -= (evicted?.sizeBytes || 0);
            this.memoryCache.delete(firstKey);
            this.stats.evictions++;
        }
    }

    //  Получение 

    async getDashboardData(divisionId = 'all') {
        const key = `dashboard:${divisionId}`;

        // Сначала пробуем Redis
        if (this.isEnabled && this.redis) {
            try {
                const cached = await this.redis.get(key);
                if (cached) {
                    this.stats.hits++;
                    trackCacheOperation('get', 'hit');
                    return JSON.parse(cached);
                }
            } catch (error) {
                logger.error('Redis get error:', error.message);
            }
        }

        // Откат к LRU в памяти
        const entry = this.memoryCache.get(key);
        if (entry) {
            const ageMs = Date.now() - entry.timestamp;
            const ttlMs = (entry.ttl || this.defaultTTL) * 1000;

            if (ageMs < ttlMs) {
                // Свежее попадание
                this.stats.hits++;
                this._touchLRU(key);
                trackCacheOperation('get', 'hit');
                return entry.data;
            }

            // V2: Stale-while-revalidate (обслуживание устаревшими данными)
            const staleTTLMs = this.staleTTL * 1000;
            if (ageMs < staleTTLMs) {
                this.stats.staleHits++;
                this._touchLRU(key);
                trackCacheOperation('get', 'stale_hit');
                logger.debug(`Cache: Serving stale data for ${key} (age: ${Math.round(ageMs / 1000)}s)`);
                return entry.data;
            }

            // Слишком устарело — вытесняем
            this.currentMemorySizeBytes -= (entry.sizeBytes || 0);
            this.memoryCache.delete(key);
        }

        this.stats.misses++;
        trackCacheOperation('get', 'miss');
        return null;
    }

    //  Сохранение 

    async setDashboardData(divisionId = 'all', data, ttl = null) {
        const key = `dashboard:${divisionId}`;
        const expiry = ttl || this.defaultTTL;

        // Сохранение в Redis
        if (this.isEnabled && this.redis) {
            try {
                await this.redis.setex(key, expiry, JSON.stringify(data));
                trackCacheOperation('set', 'success');
            } catch (error) {
                logger.error('Redis set error:', error.message);
            }
        }

        // Сохранение в LRU память
        try {
            const dataStr = JSON.stringify(data);
            const sizeBytes = Buffer.byteLength(dataStr, 'utf8');
            const sizeMB = sizeBytes / (1024 * 1024);

            // Пропускаем отдельные записи > 3MB
            if (sizeMB > 3) {
                logger.debug(`Cache: Skipping memory cache for ${key} (${sizeMB.toFixed(2)}MB too large)`);
                return true;
            }

            // Удаляем размер старой записи при обновлении
            const existing = this.memoryCache.get(key);
            if (existing) {
                this.currentMemorySizeBytes -= (existing.sizeBytes || 0);
                this.memoryCache.delete(key);
            }

            // Вытесняем при необходимости перед вставкой
            this._evictIfNeeded();

            this.memoryCache.set(key, {
                data,
                timestamp: Date.now(),
                ttl: expiry,
                sizeBytes
            });

            this.currentMemorySizeBytes += sizeBytes;
            this.stats.writes++;
            this.stats.totalSizeBytes = this.currentMemorySizeBytes;
        } catch (err) {
            logger.error('Memory cache write error:', err.message);
        }

        return true;
    }

    //  Инвалидация 

    async invalidate(divisionId = 'all') {
        const key = `dashboard:${divisionId}`;

        // Очистка памяти
        const entry = this.memoryCache.get(key);
        if (entry) {
            this.currentMemorySizeBytes -= (entry.sizeBytes || 0);
            this.memoryCache.delete(key);
        }

        if (!this.isEnabled || !this.redis) return true;

        try {
            await this.redis.del(key);
            trackCacheOperation('invalidate', 'success');
            logger.debug(`Cache invalidated: ${key}`);
            return true;
        } catch (error) {
            logger.error('Cache invalidate error:', error);
            trackCacheOperation('invalidate', 'error');
            return false;
        }
    }

    async invalidateAll() {
        // Очистка всей памяти
        this.memoryCache.clear();
        this.currentMemorySizeBytes = 0;

        if (!this.isEnabled || !this.redis) return true;

        try {
            const keys = await this.redis.keys('dashboard:*');
            if (keys.length > 0) {
                await this.redis.del(...keys);
                trackCacheOperation('invalidate_all', 'success');
                logger.info(`All cache cleared (${keys.length} keys)`);
            }
            return true;
        } catch (error) {
            logger.error('Full cache clear error:', error);
            trackCacheOperation('invalidate_all', 'error');
            return false;
        }
    }

    //  Статистика 

    async getStats() {
        const hitRate = this.stats.hits + this.stats.misses > 0
            ? Math.round(this.stats.hits / (this.stats.hits + this.stats.misses) * 100)
            : 0;

        const base = {
            version: '2.0 (LRU + Stale-While-Revalidate)',
            memoryCache: {
                entries: this.memoryCache.size,
                maxEntries: this.maxMemoryEntries,
                sizeMB: (this.currentMemorySizeBytes / (1024 * 1024)).toFixed(2),
                maxSizeMB: this.maxMemorySizeMB
            },
            stats: {
                ...this.stats,
                hitRate: `${hitRate}%`,
                totalSizeMB: (this.currentMemorySizeBytes / (1024 * 1024)).toFixed(2)
            }
        };

        if (!this.isEnabled || !this.redis) {
            return { ...base, redis: { enabled: false } };
        }

        try {
            const info = await this.redis.info('stats');
            const keys = await this.redis.keys('dashboard:*');
            return {
                ...base,
                redis: {
                    enabled: true,
                    connected: this.redis.status === 'ready',
                    keys: keys.length,
                    info
                }
            };
        } catch (error) {
            return { ...base, redis: { enabled: true, error: error.message } };
        }
    }

    async healthCheck() {
        if (!this.isEnabled) {
            return { healthy: true, message: 'Redis disabled, using LRU memory cache' };
        }

        if (!this.redis) {
            return { healthy: false, error: 'Redis not initialized' };
        }

        try {
            const start = Date.now();
            await this.redis.ping();
            return {
                healthy: true,
                status: this.redis.status,
                responseTime: Date.now() - start
            };
        } catch (error) {
            return { healthy: false, error: error.message };
        }
    }

    async close() {
        if (this.redis) {
            await this.redis.quit();
            logger.info('Redis connection closed');
        }
    }
}

// Синглтон
const cacheService = new CacheService();

module.exports = cacheService;
