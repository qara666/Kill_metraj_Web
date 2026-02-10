const { pool } = require('../config/database');

/**
 * CourierSettlement Model
 * Handles courier cash settlements and payment tracking
 */
class CourierSettlement {
    /**
     * Create a new settlement record
     */
    static async create(data) {
        const {
            courierId,
            courierName,
            divisionId,
            settlementDate,
            shiftStart,
            shiftEnd,
            totalCashExpected,
            totalCashReceived,
            totalCardAmount,
            totalOnlineAmount,
            ordersCount,
            orderIds,
            status = 'pending',
            settledBy = null,
            notes = null
        } = data;

        const query = `
            INSERT INTO courier_settlements (
                courier_id, courier_name, division_id, settlement_date,
                shift_start, shift_end, total_cash_expected, total_cash_received,
                total_card_amount, total_online_amount, orders_count, order_ids,
                status, settled_by, notes, settled_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING *
        `;

        const values = [
            courierId, courierName, divisionId, settlementDate,
            shiftStart, shiftEnd, totalCashExpected, totalCashReceived,
            totalCardAmount, totalOnlineAmount, ordersCount, orderIds,
            status, settledBy, notes,
            status === 'settled' ? new Date() : null
        ];

        const result = await pool.query(query, values);
        return result.rows[0];
    }

    /**
     * Get settlement by ID
     */
    static async findById(id) {
        const query = 'SELECT * FROM courier_settlements WHERE id = $1';
        const result = await pool.query(query, [id]);
        return result.rows[0];
    }

    /**
     * Get settlements for a courier
     */
    static async findByCourier(courierId, options = {}) {
        const { startDate, endDate, status, limit = 50, offset = 0 } = options;

        let query = 'SELECT * FROM courier_settlements WHERE courier_id = $1';
        const values = [courierId];
        let paramIndex = 2;

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

        if (status) {
            query += ` AND status = $${paramIndex}`;
            values.push(status);
            paramIndex++;
        }

        query += ` ORDER BY settlement_date DESC, created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        return result.rows;
    }

    /**
     * Get current shift for courier (today's pending settlement)
     */
    static async getCurrentShift(courierId, divisionId) {
        const today = new Date().toISOString().split('T')[0];
        const query = `
            SELECT * FROM courier_settlements 
            WHERE courier_id = $1 
            AND division_id = $2
            AND settlement_date = $3 
            AND status = 'pending'
            ORDER BY created_at DESC
            LIMIT 1
        `;
        const result = await pool.query(query, [courierId, divisionId, today]);
        return result.rows[0];
    }

    /**
     * Update settlement (for closing shift)
     */
    static async update(id, data) {
        const {
            totalCashReceived,
            status,
            settledBy,
            notes
        } = data;

        const query = `
            UPDATE courier_settlements 
            SET 
                total_cash_received = COALESCE($1, total_cash_received),
                status = COALESCE($2, status),
                settled_by = COALESCE($3, settled_by),
                notes = COALESCE($4, notes),
                settled_at = CASE WHEN $2 = 'settled' THEN NOW() ELSE settled_at END,
                updated_at = NOW()
            WHERE id = $5
            RETURNING *
        `;

        const values = [totalCashReceived, status, settledBy, notes, id];
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    /**
     * Get settlement history with filters
     */
    static async getHistory(filters = {}) {
        const {
            courierId,
            divisionId,
            startDate,
            endDate,
            status,
            limit = 100,
            offset = 0
        } = filters;

        let query = 'SELECT * FROM courier_settlements WHERE 1=1';
        const values = [];
        let paramIndex = 1;

        if (courierId) {
            query += ` AND courier_id = $${paramIndex}`;
            values.push(courierId);
            paramIndex++;
        }

        if (divisionId) {
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

        if (status) {
            query += ` AND status = $${paramIndex}`;
            values.push(status);
            paramIndex++;
        }

        query += ` ORDER BY settlement_date DESC, created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        return result.rows;
    }

    /**
     * Get statistics for a courier
     */
    static async getStatistics(courierId, startDate, endDate) {
        const query = `
            SELECT 
                COUNT(*) as total_settlements,
                SUM(total_cash_expected) as total_expected,
                SUM(total_cash_received) as total_received,
                SUM(total_cash_expected - total_cash_received) as total_difference,
                SUM(orders_count) as total_orders
            FROM courier_settlements
            WHERE courier_id = $1
            AND settlement_date BETWEEN $2 AND $3
            AND status = 'settled'
        `;

        const result = await pool.query(query, [courierId, startDate, endDate]);
        return result.rows[0];
    }
}

module.exports = CourierSettlement;
