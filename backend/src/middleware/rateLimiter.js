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
    // Robust IP identification for Render/Proxy
    keyGenerator: (req) => {
      // Prefer X-Forwarded-For if it exists, otherwise fallback to req.ip
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
      // Disable rate limiting globally as requested
      return true;
    }
  });
};

const generalLimiter = createRateLimiter(
  15 * 60 * 1000,
  50000, // Increased to 50000 to prevent blocking during active usage/polling
  'Слишком много запросов от вашего устройства. Пожалуйста, подождите 15 минут.'
);

const strictLimiter = createRateLimiter(
  15 * 60 * 1000,
  1000, // Increased to 1000 to allow smooth testing 
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

