const express = require('express');
const router = express.Router();
const DeliveryZone = require('../models/DeliveryZone');
const { authenticateToken } = require('../middleware/auth');

/**
 * GET /api/delivery-zones/:divisionId
 * Получить все зоны доставки для подразделения
 */
router.get('/:divisionId', authenticateToken, async (req, res) => {
    try {
        const { divisionId } = req.params;

        const zones = await DeliveryZone.find({ divisionId }).sort({ name: 1 });

        res.json({
            success: true,
            zones: zones.map(zone => ({
                id: zone._id,
                name: zone.name,
                polygon: zone.polygon,
                hub: zone.hub,
                divisionId: zone.divisionId,
                isActive: zone.isActive,
                createdAt: zone.createdAt,
                updatedAt: zone.updatedAt
            }))
        });
    } catch (error) {
        console.error('[DeliveryZones] Error fetching zones:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка при получении зон доставки',
            error: error.message
        });
    }
});

/**
 * POST /api/delivery-zones
 * Создать новую зону доставки
 */
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { name, polygon, hub, divisionId } = req.body;

        // Валидация
        if (!name || !polygon || !Array.isArray(polygon) || polygon.length < 3) {
            return res.status(400).json({
                success: false,
                message: 'Некорректные данные зоны (требуется название и полигон с минимум 3 точками)'
            });
        }

        const zone = new DeliveryZone({
            name,
            polygon,
            hub,
            divisionId: divisionId || 'default',
            isActive: true
        });

        await zone.save();

        res.status(201).json({
            success: true,
            zone: {
                id: zone._id,
                name: zone.name,
                polygon: zone.polygon,
                hub: zone.hub,
                divisionId: zone.divisionId,
                isActive: zone.isActive
            }
        });
    } catch (error) {
        console.error('[DeliveryZones] Error creating zone:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка при создании зоны доставки',
            error: error.message
        });
    }
});

/**
 * PUT /api/delivery-zones/:zoneId
 * Обновить зону доставки
 */
router.put('/:zoneId', authenticateToken, async (req, res) => {
    try {
        const { zoneId } = req.params;
        const { name, polygon, hub, isActive } = req.body;

        const zone = await DeliveryZone.findById(zoneId);
        if (!zone) {
            return res.status(404).json({
                success: false,
                message: 'Зона доставки не найдена'
            });
        }

        if (name) zone.name = name;
        if (polygon) zone.polygon = polygon;
        if (hub) zone.hub = hub;
        if (typeof isActive === 'boolean') zone.isActive = isActive;

        await zone.save();

        res.json({
            success: true,
            zone: {
                id: zone._id,
                name: zone.name,
                polygon: zone.polygon,
                hub: zone.hub,
                divisionId: zone.divisionId,
                isActive: zone.isActive
            }
        });
    } catch (error) {
        console.error('[DeliveryZones] Error updating zone:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка при обновлении зоны доставки',
            error: error.message
        });
    }
});

/**
 * DELETE /api/delivery-zones/:zoneId
 * Удалить зону доставки
 */
router.delete('/:zoneId', authenticateToken, async (req, res) => {
    try {
        const { zoneId } = req.params;

        const zone = await DeliveryZone.findByIdAndDelete(zoneId);
        if (!zone) {
            return res.status(404).json({
                success: false,
                message: 'Зона доставки не найдена'
            });
        }

        res.json({
            success: true,
            message: 'Зона доставки успешно удалена'
        });
    } catch (error) {
        console.error('[DeliveryZones] Error deleting zone:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка при удалении зоны доставки',
            error: error.message
        });
    }
});

/**
 * POST /api/delivery-zones/validate
 * Валидировать адрес относительно зон доставки
 */
router.post('/validate', authenticateToken, async (req, res) => {
    try {
        const { coords, divisionId } = req.body;

        if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
            return res.status(400).json({
                success: false,
                message: 'Некорректные координаты'
            });
        }

        const zones = await DeliveryZone.find({
            divisionId: divisionId || 'default',
            isActive: true
        });

        // Проверяем, попадает ли точка в какую-либо зону (упрощенная версия)
        // В продакшене здесь будет полноценный point-in-polygon алгоритм
        const matchedZone = zones.find(zone => {
            // Простая проверка по bounding box для демонстрации
            // TODO: Реализовать полноценный ray-casting алгоритм
            return true; // Заглушка
        });

        res.json({
            success: true,
            isValid: !!matchedZone,
            matchedZone: matchedZone ? {
                id: matchedZone._id,
                name: matchedZone.name
            } : null
        });
    } catch (error) {
        console.error('[DeliveryZones] Error validating address:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка при валидации адреса',
            error: error.message
        });
    }
});

module.exports = router;
