const axios = require('axios');
const Joi = require('joi');
const logger = require('../utils/logger');
const { ApiError, ValidationError, FastopertorError } = require('../utils/errors');
const { formatApiUrl, transformFastopertorData } = require('../utils/fastopertorHelpers');

// Простой in-memory кэш для API ответов
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

class FastopertorController {
    /**
     * Схемы валидации
     */
    static schemas = {
        fetch: Joi.object({
            apiUrl: Joi.string().uri().required(),
            apiKey: Joi.string().required(),
            endpoint: Joi.string().allow('', null),
            useCache: Joi.boolean().default(true)
        }),
        validate: Joi.object({
            apiUrl: Joi.string().uri().required(),
            apiKey: Joi.string().required()
        })
    };

    /**
     * Получить данные из Fastopertor API
     */
    async fetchData(req, res, next) {
        const startTime = Date.now();
        try {
            // 1. Валидация входных параметров
            const { error, value } = FastopertorController.schemas.fetch.validate(req.body);
            if (error) {
                throw new ValidationError('Ошибка валидации параметров', error.details);
            }

            const { apiUrl, apiKey, endpoint, useCache } = value;
            const fullUrl = formatApiUrl(apiUrl, endpoint);

            // 2. Проверка кэша
            const cacheKey = `${fullUrl}_${apiKey}`;
            if (useCache && cache.has(cacheKey)) {
                const cached = cache.get(cacheKey);
                if (Date.now() - cached.timestamp < CACHE_TTL) {
                    logger.info('FastopertorController: Возврат данных из кэша', { url: fullUrl });
                    return res.json({
                        success: true,
                        data: cached.data,
                        fromCache: true,
                        cachedAt: new Date(cached.timestamp).toISOString()
                    });
                }
            }

            logger.info('FastopertorController: Выполнение запроса к API', { url: fullUrl });

            // 3. Выполнение запроса
            const response = await axios.get(fullUrl, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'application/json'
                },
                timeout: 30000
            });

            const duration = Date.now() - startTime;
            const dataSize = JSON.stringify(response.data).length;

            logger.info('FastopertorController: Ответ получен', { duration, size: dataSize });

            // 4. Трансформация данных
            const transformedData = transformFastopertorData(response.data);

            // 5. Сохранение в кэш
            if (useCache) {
                cache.set(cacheKey, {
                    data: transformedData,
                    timestamp: Date.now()
                });
            }

            res.json({
                success: true,
                data: transformedData,
                performance: {
                    durationMs: duration,
                    dataSizeBytes: dataSize
                }
            });

        } catch (error) {
            next(this._mapError(error));
        }
    }

    /**
     * Валидация API подключения
     */
    async validateApi(req, res, next) {
        try {
            const { error, value } = FastopertorController.schemas.validate.validate(req.body);
            if (error) {
                throw new ValidationError('Ошибка валидации параметров', error.details);
            }

            const { apiUrl, apiKey } = value;
            const testUrl = formatApiUrl(apiUrl, '/health');

            logger.info('FastopertorController: Валидация API', { testUrl });

            try {
                const response = await axios.get(testUrl, {
                    headers: { 'Authorization': `Bearer ${apiKey}` },
                    timeout: 10000
                });

                res.json({
                    success: true,
                    valid: response.status === 200,
                    message: 'API подключение успешно подтверждено'
                });
            } catch (err) {
                // Если /health не существует, пробуем основной URL
                const mainUrl = formatApiUrl(apiUrl);
                const response = await axios.get(mainUrl, {
                    headers: { 'Authorization': `Bearer ${apiKey}` },
                    timeout: 10000
                });

                res.json({
                    success: true,
                    valid: response.status === 200,
                    message: 'API подключение успешно подтверждено (через основной URL)'
                });
            }
        } catch (error) {
            next(this._mapError(error));
        }
    }

    /**
     * Маппинг ошибок в custom Error классы
     */
    _mapError(error) {
        if (error instanceof ApiError) return error;

        if (error.response) {
            return new FastopertorError(
                `Fastopertor API вернул ошибку: ${error.response.status}`,
                error.response.status,
                error.response.data
            );
        } else if (error.request) {
            return new FastopertorError('Не удалось получить ответ от Fastopertor API (Timeout)', 504);
        }

        return error;
    }
}

module.exports = { FastopertorController };

