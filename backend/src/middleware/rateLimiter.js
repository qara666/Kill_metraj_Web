const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
      res.status(429).json({
        error: message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    },
    skip: (req) => {
      // Skip rate limiting in development for localhost (both IPv4 and IPv6)
      if (process.env.NODE_ENV === 'development') {
        const ip = req.ip;
        return ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1';
      }
      return false;
    }
  });
};

const generalLimiter = createRateLimiter(
  15 * 60 * 1000,
  300,
  'Слишком много запросов. Попробуйте позже.'
);

const strictLimiter = createRateLimiter(
  15 * 60 * 1000,
  20,
  'Превышен лимит запросов. Подождите 15 минут.'
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

