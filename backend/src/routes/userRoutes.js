const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { User, UserPreset } = require('../models');
const { authenticateToken, requireRole, auditLog } = require('../middleware/auth');
const { Op } = require('sequelize');

// All routes require authentication and admin role
router.use(authenticateToken);
router.use(requireRole('admin'));

// GET /api/users - Get all users with pagination
router.get('/', async (req, res) => {
    const startTime = Date.now();
    try {
        const { search, role, isActive, limit = 50, offset = 0 } = req.query;
        const where = {};

        if (search) {
            where[Op.or] = [
                { username: { [Op.iLike]: `%${search}%` } },
                { email: { [Op.iLike]: `%${search}%` } },
                { divisionId: { [Op.iLike]: `%${search}%` } }
            ];
        }

        if (role) {
            where.role = role;
        }

        if (isActive !== undefined) {
            where.isActive = isActive === 'true';
        }

        logger.info('Users Route: Querying database...', { where, limit, offset });

        const { count, rows } = await Promise.race([
            User.findAndCountAll({
                where,
                order: [['createdAt', 'DESC']],
                limit: parseInt(limit),
                offset: parseInt(offset),
                attributes: { exclude: ['passwordHash'] }
            }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Users list DB timeout')), 10000)
            )
        ]);

        const dbTime = Date.now() - startTime;
        logger.info('Users Route: Query successful', { count, duration: dbTime });

        logger.info('Users Route: Serializing response...');
        const plainRows = rows.map(row => row.get({ plain: true }));

        res.json({
            success: true,
            data: plainRows,
            pagination: {
                total: count,
                limit: parseInt(limit),
                offset: parseInt(offset),
                pages: Math.ceil(count / parseInt(limit))
            }
        });
        logger.info('Users Route: Response sent successfully');
    } catch (error) {
        logger.error('Users Route ERROR:', {
            message: error.message,
            duration: Date.now() - startTime
        });
        res.status(500).json({
            success: false,
            error: 'ВнутренняяОшибкаСервера',
            message: 'Не удалось получить список пользователей: ' + error.message
        });
    }
});

// POST /api/users - Create new user
router.post('/', auditLog('user_create'), async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { username, email, password, role, divisionId, canModifySettings } = req.body;

        if (!username || !password) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                error: 'ОшибкаВалидации',
                message: 'Имя пользователя и пароль обязательны'
            });
        }

        const existingUser = await User.findOne({
            where: {
                [Op.or]: [
                    { username },
                    ...(email ? [{ email }] : [])
                ]
            },
            transaction: t
        });

        if (existingUser) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                error: 'ПользовательСуществует',
                message: 'Пользователь с таким именем или email уже существует'
            });
        }

        // Create user and preset in ONE TRANSACTION to reduce latency
        const user = await User.create({
            username,
            email: email || null,
            passwordHash: password,
            role: role || 'user',
            divisionId: divisionId || null,
            canModifySettings: canModifySettings !== undefined ? canModifySettings : true,
            preset: {
                settings: {}, // Uses model defaults
                updatedBy: req.user.id
            }
        }, {
            include: [{ model: UserPreset, as: 'preset' }],
            transaction: t
        });

        await t.commit();

        res.status(201).json({
            success: true,
            data: user.toJSON()
        });
    } catch (error) {
        if (t) await t.rollback();
        logger.error('Ошибка создания пользователя', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'ВнутренняяОшибкаСервера',
            message: 'Не удалось создать пользователя: ' + error.message
        });
    }
});

// GET /api/users/:id - Get user by ID
router.get('/:id', auditLog('user_view'), async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'НеНайдено',
                message: 'Пользователь не найден'
            });
        }

        res.json({
            success: true,
            data: user.toJSON()
        });
    } catch (error) {
        logger.error('Ошибка получения пользователя', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'ВнутренняяОшибкаСервера',
            message: 'Не удалось получить данные пользователя'
        });
    }
});

// PUT /api/users/:id - Update user
router.put('/:id', auditLog('user_update'), async (req, res) => {
    try {
        const { email, role, isActive, divisionId, password } = req.body;

        const user = await User.findByPk(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'НеНайдено',
                message: 'Пользователь не найден'
            });
        }

        // Update fields
        if (email !== undefined) user.email = email || null; // Ensure empty string becomes null
        if (role) user.role = role;
        if (isActive !== undefined) user.isActive = isActive;
        if (divisionId !== undefined) user.divisionId = divisionId;
        if (password) user.passwordHash = password; // Hashed via hook

        await user.save();

        res.json({
            success: true,
            data: user.toJSON()
        });
    } catch (error) {
        logger.error('Ошибка обновления пользователя', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'ВнутренняяОшибкаСервера',
            message: 'Не удалось обновить пользователя'
        });
    }
});

// DELETE /api/users/:id - Delete user
router.delete('/:id', auditLog('user_delete'), async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'НеНайдено',
                message: 'Пользователь не найден'
            });
        }

        // Prevent deleting yourself
        if (user.id === req.user.id) {
            return res.status(400).json({
                success: false,
                error: 'ОшибкаВалидации',
                message: 'Нельзя удалить собственный аккаунт'
            });
        }

        await user.destroy();

        res.json({
            success: true,
            message: 'Пользователь успешно удален'
        });
    } catch (error) {
        logger.error('Ошибка удаления пользователя', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'ВнутренняяОшибкаСервера',
            message: 'Не удалось удалить пользователя',
            details: error.parent ? error.parent.message : error.message
        });
    }
});

// PUT /api/users/:id/toggle-active - Toggle user active status
router.put('/:id/toggle-active', auditLog('user_toggle_active'), async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'НеНайдено',
                message: 'Пользователь не найден'
            });
        }

        // Prevent deactivating yourself
        if (user.id === req.user.id) {
            return res.status(400).json({
                success: false,
                error: 'ОшибкаВалидации',
                message: 'Нельзя деактивировать собственный аккаунт'
            });
        }

        user.isActive = !user.isActive;
        await user.save();

        res.json({
            success: true,
            data: user.toJSON()
        });
    } catch (error) {
        logger.error('Ошибка переключения статуса пользователя', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'ВнутренняяОшибкаСервера',
            message: 'Не удалось изменить статус пользователя'
        });
    }
});

// PUT /api/users/:id/change-password - Change user password (admin only)
router.put('/:id/change-password', auditLog('user_password_change'), async (req, res) => {
    try {
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 4) {
            return res.status(400).json({
                success: false,
                error: 'ОшибкаВалидации',
                message: 'Пароль должен содержать минимум 4 символа'
            });
        }

        const user = await User.findByPk(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'НеНайдено',
                message: 'Пользователь не найден'
            });
        }

        user.passwordHash = newPassword; // Will be hashed by beforeUpdate hook
        await user.save();

        res.json({
            success: true,
            message: 'Пароль успешно изменен'
        });
    } catch (error) {
        logger.error('Ошибка смены пароля', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'ВнутренняяОшибкаСервера',
            message: 'Не удалось сменить пароль'
        });
    }
});

module.exports = router;
