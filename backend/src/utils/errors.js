/**
 * Базовый класс для ошибок API
 */
class ApiError extends Error {
    constructor(statusCode, message, details = null) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Ошибка валидации входящих данных
 */
class ValidationError extends ApiError {
    constructor(message, details = null) {
        super(400, message, details);
    }
}

/**
 * Ошибка при работе с Fastopertor API
 */
class FastopertorError extends ApiError {
    constructor(message, statusCode = 502, details = null) {
        super(statusCode, message, details);
    }
}

module.exports = {
    ApiError,
    ValidationError,
    FastopertorError
};
