const express = require('express');
const router = express.Router();
const { sequelize } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * PATCH /api/v1/orders/:orderNumber/payment-method
 * Upsert a manual payment method override for an order
 */
router.patch('/:orderNumber/payment-method', authenticateToken, async (req, res) => {
    try {
        const { orderNumber } = req.params;
        const { paymentMethod } = req.body;

        if (!paymentMethod) {
            return res.status(400).json({ success: false, error: 'Payment method is required' });
        }

        logger.info(`Manual override: Setting order #${orderNumber} to ${paymentMethod}`);

        await sequelize.query(`
            INSERT INTO manual_order_overrides (order_number, payment_method, updated_at)
            VALUES (:orderNumber, :paymentMethod, NOW())
            ON CONFLICT (order_number) 
            DO UPDATE SET payment_method = EXCLUDED.payment_method, updated_at = NOW()
        `, {
            replacements: { orderNumber, paymentMethod }
        });

        // Invalidate cache to reflect changes immediately
        const cacheService = require('../services/CacheService');
        await cacheService.invalidateAll();

        res.json({
            success: true,
            message: `Способ оплаты для заказа #${orderNumber} изменен на ${paymentMethod}`
        });

    } catch (error) {
        logger.error('Error updating payment method override:', error);
        res.status(500).json({ success: false, error: 'Внутренняя ошибка сервера' });
    }
});

module.exports = router;
