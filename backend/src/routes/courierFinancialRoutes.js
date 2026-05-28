const express = require('express');
const router = express.Router();
const CourierSettlement = require('../models/CourierSettlement');
const { pool } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Вспомогательная функция для получения финансовой сводки
 */
async function getSummary(courierId, divisionId, targetDate) {
    if (!divisionId) {
        throw new Error('divisionId is required');
    }

    const dateStr = targetDate || new Date().toISOString().split('T')[0];

    // Получение заказов для курьера из кэша дашборда
    const cacheQuery = `
        SELECT payload FROM api_dashboard_cache 
        WHERE division_id = $1 
        AND target_date = $2 
        LIMIT 1
    `;
    const cacheResult = await pool.query(cacheQuery, [divisionId, dateStr]);

    if (cacheResult.rows.length === 0) {
        throw new Error('No data found for this date');
    }

    const { orders = [], couriers = [] } = cacheResult.rows[0].payload;

    // Поиск информации о курьере
    const courier = couriers.find(c => String(c.id || c._id) === String(courierId));
    const courierName = courier?.name || 'Unknown';

    // Фильтрация заказов для этого курьера
    const courierOrders = orders.filter(o => {
        const orderCourierId = String(o.courierId || o.courier?.id || o.courier?._id || o.courier || '');
        return orderCourierId === String(courierId);
    });

    // Вычисление financial summary
    const summary = {
        courierId,
        courierName,
        targetDate: dateStr,
        currentShift: {
            startTime: dateStr + 'T00:00:00Z',
            totalOrders: courierOrders.length,
            completedOrders: courierOrders.filter(o =>
                o.status === 'Исполнен' || o.status === 'Доставлен'
            ).length,
            cashOrders: {
                count: 0,
                totalAmount: 0,
                orders: []
            },
            cardOrders: {
                count: 0,
                totalAmount: 0,
                orders: []
            },
            onlineOrders: {
                count: 0,
                totalAmount: 0,
                orders: []
            },
            totalExpected: 0
        }
    };

    // Группировка по способу оплаты
    courierOrders.forEach(order => {
        const amount = parseFloat(order.amount || order.totalAmount || 0);
        const paymentMethod = (order.paymentMethod || '').toLowerCase();
        const orderData = {
            id: order.id || order.orderNumber,
            orderNumber: order.orderNumber,
            amount,
            status: order.status,
            address: order.address
        };

        if (paymentMethod.includes('готівка') || paymentMethod.includes('наличные') || paymentMethod === 'cash') {
            summary.currentShift.cashOrders.count++;
            summary.currentShift.cashOrders.totalAmount += amount;
            summary.currentShift.cashOrders.orders.push(orderData);
        } else if (paymentMethod.includes('карт') || paymentMethod === 'card') {
            summary.currentShift.cardOrders.count++;
            summary.currentShift.cardOrders.totalAmount += amount;
            summary.currentShift.cardOrders.orders.push(orderData);
        } else if (paymentMethod.includes('онлайн') || paymentMethod === 'online') {
            summary.currentShift.onlineOrders.count++;
            summary.currentShift.onlineOrders.totalAmount += amount;
            summary.currentShift.onlineOrders.orders.push(orderData);
        }
    });

    summary.currentShift.totalExpected =
        summary.currentShift.cashOrders.totalAmount +
        summary.currentShift.cardOrders.totalAmount +
        summary.currentShift.onlineOrders.totalAmount;

    // Получение последнего расчета
    const lastSettlement = await CourierSettlement.findByCourier(courierId, { limit: 1 });
    if (lastSettlement.length > 0) {
        const last = lastSettlement[0];
        summary.lastSettlement = {
            date: last.settlement_date,
            cashReceived: parseFloat(last.total_cash_received),
            status: last.status
        };
    }

    return summary;
}

/**
 * GET /api/v1/couriers/:courierId/financial-summary
 * Получить текущую финансовую сводку для курьера
 */
router.get('/:courierId/financial-summary', async (req, res) => {
    try {
        const { courierId } = req.params;
        const { divisionId, targetDate } = req.query;

        const summary = await getSummary(courierId, divisionId, targetDate);
        res.json(summary);
    } catch (error) {
        if (error.message === 'divisionId is required') {
            return res.status(400).json({ error: error.message });
        }
        if (error.message === 'No data found for this date') {
            return res.status(404).json({ error: error.message });
        }
        logger.error('Error getting financial summary:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

/**
 * POST /api/v1/couriers/:courierId/settle
 * Закрыть смену и записать расчет
 */
router.post('/:courierId/settle', async (req, res) => {
    try {
        const { courierId } = req.params;
        const { cashReceived, notes, settledBy, divisionId, targetDate, paidOrderIds } = req.body;

        if (cashReceived === undefined || cashReceived === null) {
            return res.status(400).json({ error: 'cashReceived is required' });
        }

        const dateStr = targetDate || new Date().toISOString().split('T')[0];

        // Получение financial summary
        const summary = await getSummary(courierId, divisionId, dateStr);

        // Если предоставлены paidOrderIds, фильтруем ожидаемую сумму только по этим заказам
        let effectiveExpected = summary.currentShift.cashOrders.totalAmount;
        let effectiveOrderIds = summary.currentShift.cashOrders.orders.map(o => o.id || o.orderNumber);

        if (paidOrderIds && Array.isArray(paidOrderIds) && paidOrderIds.length > 0) {
            const paidSet = new Set(paidOrderIds.map(String));
            const filteredOrders = summary.currentShift.cashOrders.orders.filter(o =>
                paidSet.has(String(o.id)) || paidSet.has(String(o.orderNumber))
            );
            effectiveExpected = filteredOrders.reduce((sum, o) => sum + (o.amount || 0), 0);
            effectiveOrderIds = filteredOrders.map(o => o.id || o.orderNumber);
        }

        // Создание записи расчета
        const settlement = await CourierSettlement.create({
            courierId,
            courierName: summary.courierName,
            divisionId,
            settlementDate: dateStr,
            shiftStart: new Date(dateStr + 'T00:00:00Z'),
            shiftEnd: new Date(),
            totalCashExpected: effectiveExpected,
            totalCashReceived: parseFloat(cashReceived),
            totalCardAmount: summary.currentShift.cardOrders.totalAmount, // Примечание: карта/онлайн обычно только для информации при расчёте наличными
            totalOnlineAmount: summary.currentShift.onlineOrders.totalAmount,
            ordersCount: effectiveOrderIds.length,
            orderIds: effectiveOrderIds,
            status: 'settled',
            settledBy,
            notes
        });

        const difference = parseFloat(cashReceived) - effectiveExpected;

        res.json({
            settlementId: settlement.id,
            status: 'settled',
            difference,
            timestamp: settlement.settled_at
        });
    } catch (error) {
        if (error.message === 'divisionId is required') {
            return res.status(400).json({ error: error.message });
        }
        if (error.message === 'No data found for this date') {
            return res.status(404).json({ error: error.message });
        }
        logger.error('Error creating settlement:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});


/**
 * GET /api/v1/settlements/history
 * Получить историю расчетов с фильтрами
 */
router.get('/history', async (req, res) => {
    try {
        const { courierId, divisionId, startDate, endDate, status, limit, offset } = req.query;

        const filters = {
            courierId,
            divisionId,
            startDate,
            endDate,
            status,
            limit: limit ? parseInt(limit) : 100,
            offset: offset ? parseInt(offset) : 0
        };

        const history = await CourierSettlement.getHistory(filters);

        res.json({
            settlements: history,
            count: history.length,
            filters
        });
    } catch (error) {
        logger.error('Error getting settlement history:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

/**
 * GET /api/v1/couriers/:courierId/statistics
 * Получить статистику курьера за период
 */
router.get('/:courierId/statistics', async (req, res) => {
    try {
        const { courierId } = req.params;
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate and endDate are required' });
        }

        const stats = await CourierSettlement.getStatistics(courierId, startDate, endDate);

        res.json({
            courierId,
            period: { startDate, endDate },
            statistics: {
                totalSettlements: parseInt(stats.total_settlements) || 0,
                totalExpected: parseFloat(stats.total_expected) || 0,
                totalReceived: parseFloat(stats.total_received) || 0,
                totalDifference: parseFloat(stats.total_difference) || 0,
                totalOrders: parseInt(stats.total_orders) || 0
            }
        });
    } catch (error) {
        logger.error('Error getting courier statistics:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

/**
 * GET /api/v1/settlements/statistics-summary
 * Получить сводную статистику по всем курьерам, включая разницы (долги)
 */
router.get('/statistics-summary', async (req, res) => {
    try {
        const { divisionId, startDate, endDate } = req.query;

        let query = `
            SELECT 
                courier_id as "courierId",
                courier_name as "courierName",
                COUNT(*) as "totalSettlements",
                SUM(total_cash_expected) as "totalExpected",
                SUM(total_cash_received) as "totalReceived",
                SUM(total_cash_expected - total_cash_received) as "totalDifference",
                MAX(settlement_date) as "lastSettlementDate",
                STRING_AGG(notes, ' | ') as "allNotes"
            FROM courier_settlements
            WHERE status = 'settled'
        `;

        const values = [];
        let paramIndex = 1;

        if (divisionId && divisionId !== 'all') {
            query += ` AND division_id = $${paramIndex}`;
            values.push(divisionId);
            paramIndex++;
        }

        if (startDate) {
            query += ` AND settlement_date >= $${paramIndex}`;
            values.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            query += ` AND settlement_date <= $${paramIndex}`;
            values.push(endDate);
            paramIndex++;
        }

        query += ` GROUP BY courier_id, courier_name ORDER BY "totalDifference" DESC`;

        const result = await pool.query(query, values);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        logger.error('Error getting settlement statistics summary:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

module.exports = router;
