const logger = require('../utils/logger');
const { ApiError } = require('../utils/errors');

function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    logger.warn(`${err.name}: ${err.message}`, {
      statusCode: err.statusCode,
      details: err.details,
      path: req.path
    });
    return res.status(err.statusCode).json({
      success: false,
      error: err.name,
      message: err.message,
      ...(err.details && process.env.NODE_ENV !== 'production' ? { details: err.details } : {})
    });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'InvalidJSON',
      message: 'Неверный формат JSON'
    });
  }

  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'CSRF token validation failed'
    });
  }

  if (err.status === 429 || err.statusCode === 429) {
    return res.status(429).json({
      success: false,
      error: 'RateLimitExceeded',
      message: err.message || 'Слишком много запросов'
    });
  }

  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  res.status(500).json({
    success: false,
    error: 'InternalServerError',
    message: process.env.NODE_ENV === 'production'
      ? 'Внутренняя ошибка сервера'
      : err.message
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: 'NotFound',
    message: `Ресурс ${req.method} ${req.path} не найден`
  });
}

module.exports = { errorHandler, notFoundHandler };
