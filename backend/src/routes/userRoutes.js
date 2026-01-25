const express = require('express');
const router = express.Router();
const { User, UserPreset } = require('../models');
const { authenticateToken, requireRole, auditLog } = require('../middleware/auth');
const { Op } = require('sequelize');

// All routes require authentication and admin role
router.use(authenticateToken);
router.use(requireRole('admin'));

// GET /api/users - Get all users
router.get('/', auditLog('user_list'), async (req, res) => {
    try {
        const { search, role, isActive } = req.query;

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

        const users = await User.findAll({
            where,
            order: [['createdAt', 'DESC']]
        });

        res.json({
            success: true,
            data: users.map(u => u.toJSON())
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            success: false,
            error: 'InternalServerError',
            message: 'Failed to fetch users'
        });
    }
});

// POST /api/users - Create new user
router.post('/', auditLog('user_create'), async (req, res) => {
    try {
        const { username, email, password, role, divisionId } = req.body;

        // Validate input
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: 'ValidationError',
                message: 'Username and password are required'
            });
        }

        // Password length validation (min 4 chars)
        if (password.length < 4) {
            return res.status(400).json({
                success: false,
                error: 'ValidationError',
                message: 'Password must be at least 4 characters'
            });
        }

        // Check if user already exists
        const orConditions = [{ username }];
        if (email) {
            orConditions.push({ email });
        }

        const existingUser = await User.findOne({
            where: {
                [Op.or]: orConditions
            }
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'UserExists',
                message: 'User with this username or email already exists'
            });
        }

        // Create user
        const user = await User.create({
            username,
            email: email || null, // Ensure empty string becomes null
            passwordHash: password, // Will be hashed by beforeCreate hook
            role: role || 'user',
            divisionId: divisionId || null
        });

        // Create default preset (uses model defaultValues)
        await UserPreset.create({
            userId: user.id,
            settings: {}, // Let Sequelize apply defaults from model
            updatedBy: req.user.id
        });

        res.status(201).json({
            success: true,
            data: user.toJSON()
        });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({
            success: false,
            error: 'InternalServerError',
            message: 'Failed to create user'
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
                error: 'NotFound',
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: user.toJSON()
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            error: 'InternalServerError',
            message: 'Failed to fetch user'
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
                error: 'NotFound',
                message: 'User not found'
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
        console.error('Update user error:', error);
        res.status(500).json({
            success: false,
            error: 'InternalServerError',
            message: 'Failed to update user'
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
                error: 'NotFound',
                message: 'User not found'
            });
        }

        // Prevent deleting yourself
        if (user.id === req.user.id) {
            return res.status(400).json({
                success: false,
                error: 'ValidationError',
                message: 'Cannot delete your own account'
            });
        }

        await user.destroy();

        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            error: 'InternalServerError',
            message: 'Failed to delete user',
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
                error: 'NotFound',
                message: 'User not found'
            });
        }

        // Prevent deactivating yourself
        if (user.id === req.user.id) {
            return res.status(400).json({
                success: false,
                error: 'ValidationError',
                message: 'Cannot deactivate your own account'
            });
        }

        user.isActive = !user.isActive;
        await user.save();

        res.json({
            success: true,
            data: user.toJSON()
        });
    } catch (error) {
        console.error('Toggle active error:', error);
        res.status(500).json({
            success: false,
            error: 'InternalServerError',
            message: 'Failed to toggle user status'
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
                error: 'ValidationError',
                message: 'Password must be at least 4 characters'
            });
        }

        const user = await User.findByPk(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'NotFound',
                message: 'User not found'
            });
        }

        user.passwordHash = newPassword; // Will be hashed by beforeUpdate hook
        await user.save();

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            error: 'InternalServerError',
            message: 'Failed to change password'
        });
    }
});

module.exports = router;
