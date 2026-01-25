const express = require('express');
const router = express.Router();
const { AuditLog } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { Op } = require('sequelize');

// All routes require authentication and admin role
router.use(authenticateToken);
router.use(requireRole('admin'));

// DELETE /api/logs/clear - Clear all logs
router.delete('/clear', async (req, res) => {
    try {
        console.log('Admin clearing all logs...');
        await AuditLog.destroy({ where: {}, truncate: false });
        res.json({ success: true, message: 'Все логи очищены' });
    } catch (error) {
        console.error('Clear logs error:', error);
        res.status(500).json({ success: false, error: 'Ошибка при очистке логов' });
    }
});

// GET /api/logs - Get audit logs with filtering
router.get('/', async (req, res) => {
    try {
        const { userId, action, startDate, endDate, limit = 50, offset = 0 } = req.query;

        const where = {};

        if (userId) {
            where.userId = userId;
        }

        if (action) {
            where.action = action;
        }

        if (startDate || endDate) {
            where.timestamp = {};
            if (startDate) {
                where.timestamp[Op.gte] = new Date(startDate);
            }
            if (endDate) {
                where.timestamp[Op.lte] = new Date(endDate);
            }
        }

        const { count, rows } = await AuditLog.findAndCountAll({
            where,
            order: [['timestamp', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            success: true,
            data: {
                logs: rows,
                total: count
            }
        });
    } catch (error) {
        console.error('Get logs error:', error);
        res.status(500).json({
            success: false,
            error: 'InternalServerError',
            message: 'Failed to fetch logs'
        });
    }
});

// GET /api/logs/user/:userId - Get logs for specific user
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 50, offset = 0 } = req.query;

        const { count, rows } = await AuditLog.findAndCountAll({
            where: { userId },
            order: [['timestamp', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            success: true,
            data: {
                logs: rows,
                total: count
            }
        });
    } catch (error) {
        console.error('Get user logs error:', error);
        res.status(500).json({
            success: false,
            error: 'InternalServerError',
            message: 'Failed to fetch user logs'
        });
    }
});


module.exports = router;
