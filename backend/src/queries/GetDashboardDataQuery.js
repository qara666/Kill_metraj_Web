const logger = require('../utils/logger');
const cacheService = require('../services/CacheService');
const { sequelize } = require('../models');

/**
 * GetDashboardDataQuery V2
 * 
 * Upgrades:
 * - Single query for admin (all divisions) instead of N+1 loop
 * - No ORDER BY/LIMIT needed — UPSERT guarantees 1 row per division/date
 * - Graceful manual_order_overrides handling
 * - Connection retry with classified errors
 */
class GetDashboardDataQuery {

    /**
     * Retry DB queries on transient connection failures
     */
    async withRetry(queryFn, maxRetries = 2) {
        let lastError;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await queryFn();
            } catch (error) {
                lastError = error;
                const isConnectionError = error.name === 'SequelizeConnectionError' ||
                    error.name === 'SequelizeConnectionAcquireTimeoutError' ||
                    error.message.includes('Connection terminated') ||
                    error.message.includes('terminating connection');

                if (isConnectionError && attempt < maxRetries) {
                    const delay = 1000 * (attempt + 1);
                    logger.warn(`CQRS: Connection retry ${attempt + 1}/${maxRetries} in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                throw error;
            }
        }
        throw lastError;
    }

    /**
     * Execute the query
     */
    async execute({ divisionId, user, date }) {
        try {
            // Standardize targetDate
            const todayKyiv = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Kiev' }));
            const dStr = String(todayKyiv.getDate()).padStart(2, '0');
            const mStr = String(todayKyiv.getMonth() + 1).padStart(2, '0');
            const yStr = todayKyiv.getFullYear();

            const kyivTodayLegacy = `${dStr}.${mStr}.${yStr}`;
            const kyivTodayISO = `${yStr}-${mStr}-${dStr}`;

            let targetDate = date;
            let targetDateISO = null;

            if (!targetDate) {
                targetDate = kyivTodayLegacy;
                targetDateISO = kyivTodayISO;
            } else {
                if (/^\d{2}\.\d{2}\.\d{4}$/.test(targetDate)) {
                    const [d, m, y] = targetDate.split('.');
                    targetDateISO = `${y}-${m}-${d}`;
                } else if (/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
                    targetDateISO = targetDate;
                    const [y, m, d] = targetDate.split('-');
                    targetDate = `${d}.${m}.${y}`;
                }
            }

            logger.info(`CQRS V2: divisionId=${divisionId}, date=${targetDate}, ISO=${targetDateISO}, user=${user?.username}`);

            // 1. Try L1/L2 Cache (for non-admin, today only)
            if (!date && divisionId !== 'all') {
                try {
                    const cached = await cacheService.getDashboardData(divisionId);
                    if (cached) {
                        logger.info(`CQRS V2: Cache Hit for ${divisionId}`);
                        return { ...cached, cached: true };
                    }
                } catch (cacheErr) {
                    logger.error('CQRS V2: Cache read error', { error: cacheErr.message });
                }
            }

            const resolvedDateISO = targetDateISO || targetDate;

            // 2. Admin: Single query for ALL divisions
            if (divisionId === 'all') {
                return await this.executeAdminQuery(resolvedDateISO, targetDate);
            }

            // 3. Single division query (simple — exactly 1 row via UPSERT)
            return await this.executeDivisionQuery(divisionId, resolvedDateISO, targetDate, user);

        } catch (error) {
            logger.error('CQRS V2 CRITICAL ERROR:', {
                message: error.message,
                stack: error.stack,
                divisionId,
                date
            });
            throw error;
        }
    }

    /**
     * V2: Single query fetches all divisions for admin
     */
    async executeAdminQuery(targetDateISO, targetDateLegacy) {
        logger.info('CQRS V2: Admin — single query for all divisions');

        // V2: One query gets ALL divisions for the target date
        const results = await this.withRetry(() => sequelize.query(
            `SELECT division_id, payload, order_count, courier_count, created_at, updated_at
             FROM api_dashboard_cache
             WHERE status_code = 200
               AND target_date = :targetDateISO`,
            {
                replacements: { targetDateISO },
                type: sequelize.QueryTypes.SELECT
            }
        ));

        if (results.length === 0) {
            logger.warn(`CQRS V2: No data for any department on ${targetDateLegacy}`);
            return null;
        }

        logger.info(`CQRS V2: Found ${results.length} divisions with data`);

        const mergedPayload = {
            orders: [],
            couriers: [],
            paymentMethods: [],
            addresses: [],
            routes: [],
            errors: [],
            warnings: [],
            statistics: {
                totalOrders: 0,
                totalAmount: 0,
                averageAmount: 0,
                deliveryCount: 0,
                pickupCount: 0
            },
            summary: {
                totalRows: 0,
                orders: 0,
                couriers: 0,
                paymentMethods: 0,
                errors: [],
                successfulGeocoding: 0,
                failedGeocoding: 0
            }
        };

        let latestTimestamp = 0;

        // Process all divisions from the single query result
        for (const row of results) {
            const payload = row.payload || {};

            if (Array.isArray(payload.orders)) mergedPayload.orders.push(...payload.orders);
            if (Array.isArray(payload.couriers)) mergedPayload.couriers.push(...payload.couriers);
            if (Array.isArray(payload.paymentMethods)) mergedPayload.paymentMethods.push(...payload.paymentMethods);
            if (Array.isArray(payload.addresses)) mergedPayload.addresses.push(...payload.addresses);
            if (Array.isArray(payload.routes)) mergedPayload.routes.push(...payload.routes);
            if (Array.isArray(payload.errors)) mergedPayload.errors.push(...payload.errors);
            if (Array.isArray(payload.warnings)) mergedPayload.warnings.push(...payload.warnings);

            if (payload.statistics) {
                mergedPayload.statistics.totalOrders += (payload.statistics.totalOrders || 0);
                mergedPayload.statistics.totalAmount += (payload.statistics.totalAmount || 0);
                mergedPayload.statistics.deliveryCount += (payload.statistics.deliveryCount || 0);
                mergedPayload.statistics.pickupCount += (payload.statistics.pickupCount || 0);
            } else if (payload.orders) {
                mergedPayload.statistics.totalOrders += payload.orders.length;
                mergedPayload.statistics.totalAmount += payload.orders.reduce((sum, o) => sum + (o.amount || 0), 0);
            }

            const ts = new Date(row.updated_at || row.created_at).getTime();
            if (ts > latestTimestamp) latestTimestamp = ts;
        }

        // Finalize statistics
        if (mergedPayload.statistics.totalOrders > 0) {
            mergedPayload.statistics.averageAmount = mergedPayload.statistics.totalAmount / mergedPayload.statistics.totalOrders;
        }

        mergedPayload.summary = {
            totalRows: mergedPayload.orders.length + mergedPayload.couriers.length,
            orders: mergedPayload.orders.length,
            couriers: mergedPayload.couriers.length,
            paymentMethods: mergedPayload.paymentMethods.length,
            errors: mergedPayload.errors,
            successfulGeocoding: mergedPayload.orders.filter(o => o.geocoded).length,
            failedGeocoding: mergedPayload.orders.filter(o => !o.geocoded).length
        };

        logger.info(`CQRS V2: Admin merged ${mergedPayload.orders.length} orders from ${results.length} divisions`);

        return {
            payload: mergedPayload,
            created_at: new Date(latestTimestamp).toISOString(),
            cached: false,
            status_code: 200
        };
    }

    /**
     * V2: Simple single-row query for a division
     */
    async executeDivisionQuery(divisionId, targetDateISO, targetDateLegacy, user) {
        // With UPSERT there's exactly 1 row — no ORDER BY/LIMIT needed
        const results = await this.withRetry(() => sequelize.query(
            `SELECT * FROM api_dashboard_cache 
             WHERE status_code = 200 
               AND target_date = :targetDateISO
               AND division_id = :divisionId`,
            {
                replacements: {
                    targetDateISO,
                    divisionId: String(divisionId)
                },
                type: sequelize.QueryTypes.SELECT
            }
        ));

        if (results.length === 0) {
            logger.warn(`CQRS V2: No data for dept ${divisionId} on ${targetDateLegacy}`);
            return null;
        }

        const record = results[0];
        const orderCount = record.order_count || record.payload?.orders?.length || 0;
        logger.info(`CQRS V2: Found ${orderCount} orders for dept ${divisionId} (updated: ${record.updated_at || record.created_at})`);

        return await this.processPayload(record, user, divisionId);
    }

    /**
     * Process payload — apply overrides and cache
     */
    async processPayload(row, user, divisionId) {
        let payload = row.payload;
        const createdAt = row.updated_at || row.created_at;

        if (!payload) payload = { orders: [], couriers: [] };

        // Apply manual overrides (graceful)
        try {
            payload = await this.applyManualOverrides(payload);
        } catch (overrideErr) {
            logger.error('CQRS V2: Failed to apply overrides', { error: overrideErr.message });
        }

        // Store in L1/L2 cache
        if (divisionId !== 'all') {
            await cacheService.setDashboardData(divisionId, {
                payload: payload,
                created_at: createdAt
            }).catch(err => logger.error('Cache store error:', err.message));
        }

        return {
            payload: payload,
            created_at: createdAt,
            cached: false,
            status_code: row.status_code
        };
    }

    /**
     * Apply manual payment method overrides
     */
    async applyManualOverrides(payload) {
        if (!payload.orders || payload.orders.length === 0) return payload;

        try {
            // V2: Check if table exists before querying
            const tableCheck = await sequelize.query(
                `SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'manual_order_overrides'
                )`,
                { type: sequelize.QueryTypes.SELECT }
            );

            if (!tableCheck[0]?.exists) return payload;

            const overrides = await sequelize.query(
                `SELECT order_number, override_value as payment_method 
                 FROM manual_order_overrides 
                 WHERE field_name = 'paymentMethod'`,
                { type: sequelize.QueryTypes.SELECT }
            );

            if (overrides.length === 0) return payload;

            const overrideMap = new Map();
            overrides.forEach(ov => overrideMap.set(String(ov.order_number), ov.payment_method));

            let hasChanges = false;
            const updatedOrders = payload.orders.map(order => {
                const orderNumStr = String(order.orderNumber);
                if (overrideMap.has(orderNumStr)) {
                    hasChanges = true;
                    return { ...order, paymentMethod: overrideMap.get(orderNumStr) };
                }
                return order;
            });

            if (hasChanges) {
                return { ...payload, orders: updatedOrders };
            }
        } catch (err) {
            logger.error('Error in applyManualOverrides:', err.message);
        }
        return payload;
    }
}

module.exports = new GetDashboardDataQuery();
