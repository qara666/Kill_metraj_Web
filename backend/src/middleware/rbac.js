const logger = require('../utils/logger');

/**
 * Модель прав доступа RBAC
 * Определяет, какие права есть у каждой роли.
 * Символ '*' дает все права.
 */
const roles = {
    admin: ['*'],
    manager: [
        'dashboard:read',
        'courier:list',
        'courier:read',
        'courier:create',
        'courier:update',
        'users:read',
        'logs:read',
        'presets:read',
        'presets:write',
        'analytics:read'
    ],
    user: [
        'dashboard:read',
        'presets:read',
        'presets:write',
        'profile:update',
        'analytics:read'
    ],
    courier: [
        'dashboard:read', // Фильтрация по подразделению обрабатывается в запросах
        'courier:stats',
        'profile:update'
    ]
};

/**
 * Middleware авторизации
 * Проверяет наличие необходимых прав у пользователя.
 * @param {string} permission - Требуемое право (например, 'dashboard:read')
 */
const authorize = (permission) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized',
                message: 'Требуется аутентификация'
            });
        }

        const userRole = req.user.role;
        const userPermissions = roles[userRole] || [];

        // 1. Проверка на полные права (админ)
        if (userPermissions.includes('*')) {
            return next();
        }

        // 2. Проверка на точное совпадение прав
        if (userPermissions.includes(permission)) {
            return next();
        }

        // 3. Проверка по паттерну (например, 'presets:*' подходит для 'presets:read')
        const hasPatternMatch = userPermissions.some(p => {
            if (p.endsWith(':*')) {
                const prefix = p.split(':*')[0];
                return permission.startsWith(prefix + ':');
            }
            return false;
        });

        if (hasPatternMatch) {
            return next();
        }

        // 4. Доступ запрещен
        logger.warn(`RBAC: Доступ запрещен для пользователя ${req.user.username} (Роль: ${userRole}). Требуемое право: ${permission}`);

        return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: `У вас недостаточно прав для выполнения этого действия (${permission})`
        });
    };
};

module.exports = {
    roles,
    authorize
};
