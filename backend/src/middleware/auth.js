const jwt = require('jsonwebtoken');
const { User, AuditLog } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '16h'; // Доступ к тоекену 
const REFRESH_TOKEN_EXPIRES_IN = '7d'; //  Обновить ток неделя

// Generate access token
function generateAccessToken(user) {
    return jwt.sign(
        {
            userId: user.id,
            username: user.username,
            role: user.role
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

// Middleware to authenticate token
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized',
            message: 'Access token required'
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Check if it's a refresh token (not allowed for regular requests)
        if (decoded.type === 'refresh') {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized',
                message: 'Invalid token type'
            });
        }

        // Fetch user from database (Sequelize)
        const user = await User.findByPk(decoded.userId);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized',
                message: 'User not found'
            });
        }

        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'Account is deactivated'
            });
        }

        // Attach user to request
        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'TokenExpired',
                message: 'Access token expired'
            });
        }

        return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'Invalid token'
        });
    }
}

// Middleware to require specific role
function requireRole(role) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized',
                message: 'Authentication required'
            });
        }

        if (req.user.role !== role) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: `${role} role required`
            });
        }

        next();
    };
}

// Middleware to log actions
function auditLog(action) {
    return async (req, res, next) => {
        // Skip logging for admins as requested by user ("логи админа не вести")
        // Also skip if no user (should rely on authenticateToken, but for safety)
        if (req.user && req.user.role === 'admin') {
            return next();
        }

        // Store original send function
        const originalSend = res.send;

        // Override send function to log after response
        res.send = function (data) {
            // Only log successful requests (2xx status codes)
            if (res.statusCode >= 200 && res.statusCode < 300) {
                // Log asynchronously (don't wait)
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
                        console.error('Audit log error:', error);
                    }
                });
            }

            // Call original send
            originalSend.call(this, data);
        };

        next();
    };
}

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    authenticateToken,
    requireRole,
    auditLog,
    JWT_SECRET
};
