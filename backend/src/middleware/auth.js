const jwt = require('jsonwebtoken');
const { User, AuditLog } = require('../models');
const { rlsContextStore } = require('../utils/context');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '16h'; // Срок действия токена доступа
const REFRESH_TOKEN_EXPIRES_IN = '7d'; // Срок действия токена обновления (1 неделя)

// Generate access token
function generateAccessToken(user) {
    return jwt.sign(
        {
            userId: user.id,
            username: user.username,
            role: user.role,
            divisionId: user.divisionId || ''
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

// Generate refresh token
function generateRefreshToken(user) {
    return jwt.sign(
        {
            userId: user.id,
            type: 'refresh'
        },
        JWT_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );
}

// Простая кэш-память для пользователей (предотвращает избыточные запросы к БД)
const userCache = new Map();
const CACHE_TTL = 300000; // 5 минут в миллисекундах

// Middleware для аутентификации токена
// OPTIMIZED: No database queries - relies solely on JWT verification
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'ОшибкаАутентификации',
            message: 'Требуется токен доступа'
        });
    }

    try {
        // Verify JWT token only - NO database query
        const decoded = jwt.verify(token, JWT_SECRET);

        // Проверка типа токена (обновление через refresh-токен запрещено для обычных запросов)
        if (decoded.type === 'refresh') {
            logger.warn('Auth: Попытка использовать refresh token для обычного запроса', { userId: decoded.userId });
            return res.status(401).json({
                success: false,
                error: 'ОшибкаАутентификации',
                message: 'Неверный тип токена'
            });
        }

        // Attach user info from JWT payload (no DB lookup needed)
        req.user = {
            id: decoded.userId,
            userId: decoded.userId,
            username: decoded.username,
            role: decoded.role,
            divisionId: decoded.divisionId || '',
            isActive: true  // Assume active - validate in critical routes if needed
        };

        // Propagate RLS context for PostgreSQL
        return rlsContextStore.run({
            userId: decoded.userId,
            divisionId: decoded.divisionId || '',
            role: decoded.role
        }, () => {
            next();
        });
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            logger.debug('Auth: Срок действия токена истек', { userId: jwt.decode(token)?.userId });
            return res.status(401).json({
                success: false,
                error: 'ТокенИстек',
                message: 'Срок действия токена истек'
            });
        }

        logger.error('Auth: Ошибка проверки токена', {
            name: error.name,
            message: error.message
        });

        return res.status(403).json({
            success: false,
            error: 'ДоступЗапрещен',
            message: 'Неверный токен'
        });
    }
}

// Middleware для проверки роли
function requireRole(role) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized',
                message: 'Требуется аутентификация'
            });
        }

        if (req.user.role !== role) {
            return res.status(403).json({
                success: false,
                error: 'ДоступЗапрещен',
                message: `Требуется роль ${role}`
            });
        }

        next();
    };
}

// Middleware для логирования действий
function auditLog(action) {
    return async (req, res, next) => {
        // Пропускаем логирование для админов по запросу пользователя
        if (req.user && req.user.role === 'admin') {
            return next();
        }

        // Перехват функции отправки ответа
        const originalSend = res.send;

        res.send = function (data) {
            // Логируем только успешные запросы
            if (res.statusCode >= 200 && res.statusCode < 300) {
                setImmediate(async () => {
                    try {
                        if (req.user) {
                            await AuditLog.create({
                                userId: req.user.id,
                                username: req.user.username,
                                action,
                                details: {
                                    method: req.method,
                                    path: req.path,
                                    body: req.body,
                                    params: req.params,
                                    query: req.query
                                },
                                ipAddress: req.ip || req.connection.remoteAddress,
                                userAgent: req.get('user-agent') || '',
                                timestamp: new Date()
                            });
                        }
                    } catch (error) {
                        logger.error('Ошибка логирования аудита:', error);
                    }
                });
            }

            originalSend.call(this, data);
        };

        next();
    };
}

const { authorize } = require('./rbac');

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    authenticateToken,
    requireRole,
    authorize,
    auditLog,
    JWT_SECRET
};
