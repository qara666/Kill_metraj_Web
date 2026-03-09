const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { UserPreset } = require('../models');
const { authenticateToken, requireRole, auditLog } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// GET /api/presets/:userId - Get user presets
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // Users can only view their own presets, admins can view any
        if (req.user.role !== 'admin' && req.user.id !== parseInt(userId)) {
            return res.status(403).json({
                success: false,
                error: 'ДоступЗапрещен',
                message: 'Вы можете просматривать только свои пресеты'
            });
        }

        let preset = await UserPreset.findOne({ where: { userId } });

        // Create default preset if not exists
        if (!preset) {
            preset = await UserPreset.create({
                userId,
                settings: {
                    cityBias: '',
                    googleMapsApiKey: '',
                    theme: 'light',
                    fastopertorApiKey: '',
                    courierTransportType: 'car'
                },
                updatedBy: req.user.id
            });
        }

        res.json({
            success: true,
            data: preset
        });
    } catch (error) {
        logger.error('Ошибка получения пресетов', { error: error.message, userId: req.params.userId });
        res.status(500).json({
            success: false,
            error: 'ВнутренняяОшибкаСервера',
            message: 'Не удалось получить пресеты'
        });
    }
});

// PUT /api/presets/:userId - Update user presets
router.put('/:userId', authenticateToken, auditLog('preset_update'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { settings } = req.body;

        if (!settings) {
            return res.status(400).json({
                success: false,
                error: 'ОшибкаВалидации',
                message: 'Настройки обязательны'
            });
        }

        // Проверка прав доступа
        const isOwnPreset = req.user.id === parseInt(userId);
        const isAdmin = req.user.role === 'admin';

        if (!isOwnPreset && !isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'ДоступЗапрещен',
                message: 'Вы можете обновлять только свои пресеты'
            });
        }

        // Если пользователь сам меняет настройки, проверяем разрешено ли это ему
        if (isOwnPreset && !isAdmin) {
            const { User } = require('../models');
            const user = await User.findByPk(userId);
            if (!user || !user.canModifySettings) {
                // Если запрещено, разрешаем менять только некритичные настройки и KML
                const allowedKeys = [
                    'theme', 
                    'courierTransportType',
                    'kmlData',
                    'kmlSourceUrl',
                    'selectedHubs',
                    'selectedZones',
                    'lastKmlSync',
                    'autoSyncKml'
                ];
                
                const allowedUpdates = {};
                allowedKeys.forEach(key => {
                    if (settings[key] !== undefined) {
                        allowedUpdates[key] = settings[key];
                    }
                });

                let preset = await UserPreset.findOne({ where: { userId } });
                if (preset) {
                    preset.settings = { ...preset.settings, ...allowedUpdates };
                    preset.updatedBy = req.user.id;
                    await preset.save();
                    return res.json({ 
                        success: true, 
                        data: preset,
                        message: 'Настройки обновлены (ограниченный доступ: только тема и KML)' 
                    });
                } else {
                    return res.status(403).json({
                        success: false,
                        error: 'ДоступЗапрещен',
                        message: 'Вам не разрешено изменять свои основные настройки'
                    });
                }
            }
        }

        let preset = await UserPreset.findOne({ where: { userId } });

        if (!preset) {
            // Create new preset
            preset = await UserPreset.create({
                userId,
                settings: settings, // Сохраняем все пришедшие настройки
                updatedBy: req.user.id
            });
        } else {
            // Update existing preset
            // Сливаем настройки. Важно: если это админ или пользователь с правами, разрешаем полный перезатор
            preset.settings = { ...preset.settings, ...settings };
            preset.updatedBy = req.user.id;

            // Явно помечаем поле как измененное для Sequelize
            preset.changed('settings', true);
            await preset.save();
        }

        res.json({
            success: true,
            data: preset
        });
    } catch (error) {
        logger.error('Ошибка обновления пресетов', { error: error.message, userId: req.params.userId });
        res.status(500).json({
            success: false,
            error: 'ВнутренняяОшибкаСервера',
            message: 'Не удалось обновить пресеты'
        });
    }
});

// POST /api/presets/sync-all - Apply settings to all users (admin only)
router.post('/sync-all', requireRole('admin'), auditLog('preset_sync_all'), async (req, res) => {
    try {
        const { settings } = req.body;

        if (!settings) {
            return res.status(400).json({
                success: false,
                error: 'ОшибкаВалидации',
                message: 'Настройки обязательны'
            });
        }

        const { User } = require('../models');
        const users = await User.findAll({ where: { isActive: true } });

        let updatedCount = 0;
        for (const user of users) {
            let [preset] = await UserPreset.findOrCreate({
                where: { userId: user.id },
                defaults: {
                    userId: user.id,
                    settings: settings,
                    updatedBy: req.user.id
                }
            });

            if (preset) {
                // Merge settings: prioritizing the incoming global settings
                preset.settings = { ...preset.settings, ...settings };
                preset.updatedBy = req.user.id;
                preset.changed('settings', true);
                await preset.save();
                updatedCount++;
            }
        }

        res.json({
            success: true,
            message: `Настройки успешно применены к ${updatedCount} пользователям`,
            data: { updatedCount }
        });
    } catch (error) {
        logger.error('Ошибка глобальной синхронизации пресетов', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'ВнутренняяОшибкаСервера',
            message: 'Не удалось синхронизировать пресеты'
        });
    }
});

module.exports = router;
