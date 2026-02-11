const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { User, AuditLog } = require('../models');
const {
    generateAccessToken,
    generateRefreshToken,
    authenticateToken,
    JWT_SECRET
} = require('../middleware/auth');
const jwt = require('jsonwebtoken');

// POST /api/auth/login - User login
router.post('/login', async (req, res) => {
    const startTime = Date.now();
    try {
        const { username, password } = req.body;

        // Validate input
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: 'ОшибкаВалидации',
                message: 'Имя пользователя и пароль обязательны'
            });
        }

        // Find user (Sequelize)
        const user = await User.findOne({ where: { username } });

        if (!user) {
            logger.warn('Ошибка входа: Пользователь не найден', { username });
            return res.status(401).json({
                success: false,
                error: 'НеверныеУчетныеДанные',
                message: 'Неверное имя пользователя или пароль'
            });
        }

        // Check if account is active
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                error: 'АккаунтДеактивирован',
                message: 'Ваш аккаунт деактивирован'
            });
        }

        // Verify password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            logger.warn('Ошибка входа: Неверный пароль', { username });
            return res.status(401).json({
                success: false,
                error: 'НеверныеУчетныеДанные',
                message: 'Неверное имя пользователя или пароль'
            });
        }

        // Generate tokens
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        // BACKGROUND TASKS: Update stats and log login (non-blocking)
        setImmediate(async () => {
            try {
                // Update last login
                user.lastLoginAt = new Date();
                user.lastLoginIp = req.ip || req.connection.remoteAddress;
                await user.save();

                // Log login (Skip for superadmin)
                if (user.username !== 'maxsun') {
                    await AuditLog.create({
                        userId: user.id,
                        username: user.username,
                        action: 'login',
                        details: { method: 'password' },
                        ipAddress: req.ip || req.connection.remoteAddress,
                        userAgent: req.get('user-agent') || '',
                        timestamp: new Date()
                    });
                }
            } catch (err) {
                logger.error('Ошибка фоновых задач при входе:', err);
            }
        });

        const responseTime = Date.now() - startTime;
        logger.info('Login successful (optimized path)', { username, responseTime });

        res.json({
            success: true,
            data: {
                user: user.toJSON(),
                accessToken,
                refreshToken
            }
        });
    } catch (error) {
        logger.error('Ошибка входа', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'ВнутренняяОшибкаСервера',
            message: 'Произошла ошибка при входе'
        });
    }
});

// POST /api/auth/logout - User logout
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        // Log logout (non-blocking) - Skip for superadmin
        if (req.user && req.user.username !== 'maxsun') {
            setImmediate(async () => {
                try {
                    await AuditLog.create({
                        userId: req.user.id,
                        username: req.user.username,
                        action: 'logout',
                        details: {},
                        ipAddress: req.ip || req.connection.remoteAddress,
                        userAgent: req.get('user-agent') || '',
                        timestamp: new Date()
                    });
                } catch (err) {
                    logger.error('Ошибка логирования при выходе:', err);
                }
            });
        }

        res.json({
            success: true,
            message: 'Успешный выход из системы'
        });
    } catch (error) {
        logger.error('Ошибка выхода', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'ВнутренняяОшибкаСервера',
            message: 'Произошла ошибка при выходе'
        });
    }
});

// GET /api/auth/me - Get current user
router.get('/me', authenticateToken, async (req, res) => {
    try {
        res.json({
            success: true,
            data: req.user
        });
    } catch (error) {
        logger.error('Ошибка получения текущего пользователя', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'ВнутренняяОшибкаСервера',
            message: 'Произошла ошибка'
        });
    }
});

// POST /api/auth/refresh - Refresh access token
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                error: 'ОшибкаВалидации',
                message: 'Токен обновления обязателен'
            });
        }

        // Verify refresh token
        const decoded = jwt.verify(refreshToken, JWT_SECRET);

        if (decoded.type !== 'refresh') {
            return res.status(401).json({
                success: false,
                error: 'НеверныйТокен',
                message: 'Неверный тип токена'
            });
        }

        // Find user (Sequelize)
        const user = await User.findByPk(decoded.userId);
        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                error: 'ОшибкаАутентификации',
                message: 'Пользователь не найден или неактивен'
            });
        }

        // Generate new access token
        const newAccessToken = generateAccessToken(user);

        res.json({
            success: true,
            data: {
                accessToken: newAccessToken
            }
        });
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'ТокенИстек',
                message: 'Токен обновления истек'
            });
        }

        logger.error('Ошибка обновления токена', { error: error.message });
        res.status(403).json({
            success: false,
            error: 'ДоступЗапрещен',
            message: 'Неверный токен обновления'
        });
    }
});

module.exports = router;
