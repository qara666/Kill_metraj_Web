const express = require('express');
const router = express.Router();
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
    try {
        const { username, password } = req.body;

        // Validate input
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: 'ValidationError',
                message: 'Username and password are required'
            });
        }

        // Find user (Sequelize)
        const user = await User.findOne({ where: { username } });
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'InvalidCredentials',
                message: 'Invalid username or password'
            });
        }

        // Check if account is active
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                error: 'AccountDeactivated',
                message: 'Your account has been deactivated'
            });
        }

        // Verify password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                error: 'InvalidCredentials',
                message: 'Invalid username or password'
            });
        }

        // Update last login
        user.lastLoginAt = new Date();
        user.lastLoginIp = req.ip || req.connection.remoteAddress;
        await user.save();

        // Generate tokens
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        // Log login
        await AuditLog.create({
            userId: user.id,
            username: user.username,
            action: 'login',
            details: { method: 'password' },
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent') || '',
            timestamp: new Date()
        });

        res.json({
            success: true,
            data: {
                user: user.toJSON(),
                accessToken,
                refreshToken
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'InternalServerError',
            message: 'An error occurred during login'
        });
    }
});

// POST /api/auth/logout - User logout
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        // Log logout
        await AuditLog.create({
            userId: req.user.id,
            username: req.user.username,
            action: 'logout',
            details: {},
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent') || '',
            timestamp: new Date()
        });

        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'InternalServerError',
            message: 'An error occurred during logout'
        });
    }
});

// GET /api/auth/me - Get current user
router.get('/me', authenticateToken, async (req, res) => {
    try {
        res.json({
            success: true,
            data: req.user.toJSON()
        });
    } catch (error) {
        console.error('Get current user error:', error);
        res.status(500).json({
            success: false,
            error: 'InternalServerError',
            message: 'An error occurred'
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
                error: 'ValidationError',
                message: 'Refresh token is required'
            });
        }

        // Verify refresh token
        const decoded = jwt.verify(refreshToken, JWT_SECRET);

        if (decoded.type !== 'refresh') {
            return res.status(401).json({
                success: false,
                error: 'InvalidToken',
                message: 'Invalid token type'
            });
        }

        // Find user (Sequelize)
        const user = await User.findByPk(decoded.userId);
        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized',
                message: 'User not found or inactive'
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
                error: 'TokenExpired',
                message: 'Refresh token expired'
            });
        }

        console.error('Refresh token error:', error);
        res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'Invalid refresh token'
        });
    }
});

module.exports = router;
