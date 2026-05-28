const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: { 
      success: false,
      error: 'RateLimitExceeded',
      message: message 
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Надежная идентификация IP для Render/Proxy
    keyGenerator: (req) => {
      // Предпочитаем X-Forwarded-For если существует, иначе req.ip
      const forwarded = req.headers['x-forwarded-for'];
      if (forwarded) {
        return forwarded.split(',')[0].trim();
      }
      return req.ip || req.connection.remoteAddress;
    },
    handler: (req, res) => {
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;
      logger.warn(`Rate limit exceeded for IP: ${clientIp}, Path: ${req.path}`);
      res.status(429).json({
        success: false,
        error: 'RateLimitExceeded',
        message: message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    },
    skip: (req) => {
      // Отключаем ограничение в разработке, включаем в продакшене
      return process.env.NODE_ENV !== 'production';
    }
  });
};

const generalLimiter = createRateLimiter(
  15 * 60 * 1000,
  50000, // Увеличено до 50000 для предотвращения блокировки при активном использовании/опросе
  'Слишком много запросов от вашего устройства. Пожалуйста, подождите 15 минут.'
);

const strictLimiter = createRateLimiter(
  15 * 60 * 1000,
  1000, // Увеличено до 1000 для плавного тестирования 
  'Слишком много попыток входа. В целях безопасности подождите 15 минут.'
);

const telegramLimiter = createRateLimiter(
  60 * 1000,
  100,
  'Превышен лимит запросов к Telegram API. Подождите минуту.'
);

const uploadLimiter = createRateLimiter(
  60 * 60 * 1000,
  50,
  'Превышен лимит загрузки файлов. Подождите час.'
);

module.exports = {
  generalLimiter,
  strictLimiter,
  telegramLimiter,
  uploadLimiter
};

