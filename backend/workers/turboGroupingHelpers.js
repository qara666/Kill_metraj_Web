'use strict';

/**
 * turboGroupingHelpers.js — v6.0 FULL SYNC WITH FRONTEND
 *
 * This file is a 100% backend mirror of:
 *   frontend/src/utils/route/routeCalculationHelpers.ts → groupOrdersByTimeWindow()
 *   frontend/src/utils/data/timeUtils.ts → getPlannedTime / getArrivalTime / getKitchenTime / getExecutionTime
 *
 * CRITICAL: Any change to frontend grouping MUST be mirrored here.
 * 
 * v6.0: Complete sync — fixes 15 vs 23 route discrepancy for КОНИШЕВ ОЛЕГ (32 orders).
 */

const logger = require('../src/utils/logger');

// ============================================================
// CONSTANTS — MUST MATCH FRONTEND routeCalculationHelpers.ts
// ============================================================
const PROXIMITY_MINUTES = 30;           // v6.1: Increased from 15 to 30 to fix 15 vs 23 routes!
const MAX_DELIVERY_SPAN_MINUTES = 120;  // v6.1: Increased from 60 to 120 to allow longer intervals
const WINDOW_MS = PROXIMITY_MINUTES * 60 * 1000;
const DELIVERY_SPAN_MS = MAX_DELIVERY_SPAN_MINUTES * 60 * 1000;

// ============================================================
// TIME PARSING — MIRROR OF frontend/src/utils/data/timeUtils.ts
// ============================================================

/**
 * Parses a time value from string, number (Excel serial), or Date.
 * EXACT mirror of frontend parseTime()
 */
function parseTime(val, options = {}) {
    if (!val && val !== 0) return null;
    const s = String(val).trim();
    if (!s || s.includes('#')) return null;

    const strVal = s.toLowerCase();
    if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour')) {
        return null;
    }

    // 1. Excel serial number
    const excelTime = typeof val === 'number' ? val : parseFloat(s);
    if (!isNaN(excelTime) && excelTime > 0) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));

        if (excelTime >= 25569) { // Date + Time
            const days = Math.floor(excelTime);
            const timeFraction = excelTime - days;

            if (options.isKitchenTime && options.baseDate) {
                const totalHours = timeFraction * 24;
                const hours = Math.floor(totalHours);
                const minutes = Math.floor((totalHours - hours) * 60);
                const seconds = Math.round(((totalHours - hours) * 60 - minutes) * 60);
                const resultDate = new Date(options.baseDate);
                resultDate.setHours(hours, minutes, seconds, 0);
                return resultDate.getTime();
            } else {
                const date = new Date(excelEpoch.getTime() + days * 86400 * 1000);
                const totalHours = timeFraction * 24;
                const hours = Math.floor(totalHours);
                const minutes = Math.floor((totalHours - hours) * 60);
                const seconds = Math.round(((totalHours - hours) * 60 - minutes) * 60);
                date.setUTCHours(hours, minutes, seconds, 0);
                return date.getTime();
            }
        } else if (excelTime >= 0 && excelTime < 1) { // Time only
            const totalHours = excelTime * 24;
            const hours = Math.floor(totalHours);
            const minutes = Math.floor((totalHours - hours) * 60);
            const seconds = Math.round(((totalHours - hours) * 60 - minutes) * 60);
            const base = options.baseDate ? new Date(options.baseDate) : new Date();
            base.setHours(hours, minutes, seconds, 0);
            return base.getTime();
        }
    }

    // 2. DD.MM.YYYY HH:MM[:SS]
    const dotDateTimeMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/i);
    if (dotDateTimeMatch) {
        const day = parseInt(dotDateTimeMatch[1], 10);
        const month = parseInt(dotDateTimeMatch[2], 10);
        const year = parseInt(dotDateTimeMatch[3], 10);
        const hour = parseInt(dotDateTimeMatch[4], 10);
        const minute = parseInt(dotDateTimeMatch[5], 10);
        const second = dotDateTimeMatch[6] ? parseInt(dotDateTimeMatch[6], 10) : 0;
        return new Date(year, month - 1, day, hour, minute, second).getTime();
    }

    // 3. M/d/yy HH:mm (Excel standard)
    const excelDateTimeMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i);
    if (excelDateTimeMatch) {
        let first = parseInt(excelDateTimeMatch[1], 10);
        let second = parseInt(excelDateTimeMatch[2], 10);
        let year = parseInt(excelDateTimeMatch[3], 10);
        let hour = parseInt(excelDateTimeMatch[4], 10);
        const minute = parseInt(excelDateTimeMatch[5], 10);
        const ampm = excelDateTimeMatch[7];
        let month, day;
        if (first > 12) { day = first; month = second; }
        else if (second > 12) { month = first; day = second; }
        else { month = first; day = second; }
        if (year < 100) year += year < 50 ? 2000 : 1900;
        if (ampm) {
            if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12;
            else if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
        }
        return new Date(year, month - 1, day, hour, minute, 0).getTime();
    }

    // 4. HH:mm[:ss]
    const timeMatch = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i);
    if (timeMatch) {
        let hour = parseInt(timeMatch[1], 10);
        const minute = parseInt(timeMatch[2], 10);
        const second = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
        const ampm = timeMatch[4];
        if (ampm) {
            if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12;
            else if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
        }
        const base = options.baseDate ? new Date(options.baseDate) : new Date();
        base.setHours(hour, minute, second, 0);
        return base.getTime();
    }

    // 5. ISO / any JS-parseable date
    const d = new Date(s);
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
        return d.getTime();
    }

    return null;
}

// Field name arrays — EXACT MATCH with frontend timeUtils.ts
const KITCHEN_TIME_FIELDS = [
    'время на кухню', 'время_на_кухню', 'Время на кухню', 'Время_на_кухню', 'ВРЕМЯ НА КУХНЮ',
    'час на кухню', 'час_на_кухню', 'час на кухні', 'час_на_кухні',
    'kitchen_time', 'kitchenTime', 'KitchenTime', 'KITCHEN_TIME',
    'kitchen', 'Kitchen', 'KITCHEN',
    'Время готовности', 'время готовности', 'Готовность', 'готовность',
    'готовність', 'час готовності'
];

const PLANNED_TIME_FIELDS = [
    'плановое время', 'плановое_время', 'Плановое время', 'Плановое_время', 'ПЛАНОВОЕ ВРЕМЯ',
    'plannedTime', 'planned_time', 'PlannedTime', 'PLANNED_TIME',
    'Дедлайн', 'дедлайн', 'ДЕДЛАЙН', 'deadline', 'Deadline', 'DEADLINE',
    'deadlineAt', 'deadline_at', 'DeadlineAt',
    'deliverBy', 'deliver_by', 'DeliverBy',
    'Время доставки', 'время доставки', 'ВРЕМЯ ДОСТАВКИ',
    'доставить к', 'доставить_к', 'Доставить к',
    'timeDeliveryEnd', 'time_delivery_end', 'TimeDeliveryEnd'
];

const ARRIVAL_TIME_FIELDS = [
    'создания', 'создание', 'creation', 'createdAt', 'Дата.создания',
    'дата.создания', 'Дата создания', 'дата создания', 'CreatedAt'
];

/**
 * EXACT mirror of frontend getKitchenTime()
 */
function getKitchenTime(o, baseDate) {
    if (!o) return null;
    if (o.readyAtSource && typeof o.readyAtSource === 'number') return o.readyAtSource;
    for (const field of KITCHEN_TIME_FIELDS) {
        const val = o[field] ?? o.raw?.[field];
        if (val !== undefined && val !== null) {
            const parsed = parseTime(val, { isKitchenTime: true, baseDate });
            if (parsed) return parsed;
        }
    }
    return null;
}

/**
 * EXACT mirror of frontend getPlannedTime()
 */
function getPlannedTime(o, baseDate) {
    if (!o) return null;
    if (o.deadlineAt && typeof o.deadlineAt === 'number') {
        const date = new Date(o.deadlineAt);
        if (date.getHours() !== 0 || date.getMinutes() !== 0) {
            return o.deadlineAt;
        }
    }
    for (const field of PLANNED_TIME_FIELDS) {
        const val = o[field] ?? o.raw?.[field];
        if (val !== undefined && val !== null) {
            if (typeof val === 'string' && (val === '00:00' || val === '00:00:00')) continue;
            const parsed = parseTime(val, { baseDate });
            if (parsed) return parsed;
        }
    }
    return null;
}

/**
 * EXACT mirror of frontend getArrivalTime()
 * CRITICAL: Do NOT fall back to kitchenTime — that causes wrong anchoring!
 */
function getArrivalTime(o, baseDate) {
    if (!o) return null;

    // v5.182: Handle ALL status variants including Ukrainian — EXACT match frontend line 190
    const status = (o.status || o.deliveryStatus || '').toString().trim().toLowerCase();
    const isDelivering = status.includes('доставля') || status.includes('в пути') ||
                         status.includes('маршру') || status.includes('исполнен') ||
                         status.includes('виконан') || status.includes('завер');

    if (isDelivering) {
        if (o.statusTimings?.deliveringAt) {
            const dt = parseTime(o.statusTimings.deliveringAt, { baseDate });
            if (dt) return dt;
        }
        if (o.handoverAt && typeof o.handoverAt === 'number') return o.handoverAt;
    }

    if (status.includes('собран') || status.includes('зібран')) {
        if (o.statusTimings?.assembledAt) {
            const at = parseTime(o.statusTimings.assembledAt, { baseDate });
            if (at) return at;
        }
    }

    // createdAt ONLY if it's a proper number timestamp (frontend line 210)
    if (o.createdAt && typeof o.createdAt === 'number' && o.createdAt > 1000000000000) return o.createdAt;

    for (const field of ARRIVAL_TIME_FIELDS) {
        const val = o[field] ?? o.raw?.[field];
        if (val !== undefined && val !== null) {
            const parsed = parseTime(val, { baseDate });
            if (parsed) return parsed;
        }
    }

    return null; // Do NOT fall back to kitchenTime — frontend does NOT do this!
}

/**
 * EXACT mirror of frontend getExecutionTime()
 */
function getExecutionTime(o, baseDate) {
    if (!o) return null;
    const status = (o.status || '').toString().trim().toLowerCase();
    const isExecuted = status.includes('исполнен') || status.includes('выполнен') || status.includes('доставлен') ||
                       status.includes('виконан') || status.includes('заверш');
    if (!isExecuted) return null;

    if (o.statusTimings?.completedAt) {
        const t = typeof o.statusTimings.completedAt === 'number'
            ? o.statusTimings.completedAt
            : parseTime(o.statusTimings.completedAt, { baseDate });
        if (t) return t;
    }
    if (o.statusTimings?.deliveringAt) {
        const t = parseTime(o.statusTimings.deliveringAt, { baseDate });
        if (t) return t;
    }
    if (o.handoverAt && typeof o.handoverAt === 'number') return o.handoverAt;
    return null;
}

// ============================================================
// HELPER UTILITIES
// ============================================================

function getAllOrderIds(order) {
    const ids = new Set();
    if (order.id) ids.add(String(order.id));
    if (order._id) ids.add(String(order._id));
    if (order.orderNumber) ids.add(String(order.orderNumber));
    if (order.raw?.id) ids.add(String(order.raw.id));
    return ids;
}

function getOrderHash(o) {
    const parts = [
        String(o.courier || '').toUpperCase().trim(),
        String(o.address || '').toLowerCase().trim(),
        String(o.deliverBy || o.plannedTime || o.deliveryTime || ''),
        String(o.orderNumber || '')
    ];
    return parts.join('|');
}

/**
 * Normalize courier name — EXACT match with frontend normalizeCourierName()
 */
function normalizeCourierName(name) {
    if (!name) return '';
    const n = name.toString().trim().replace(/\s+/g, ' ').toUpperCase();
    if (!n || n === 'ID:0' || n.includes('НЕ НАЗНАЧЕН') || n.includes('НЕНАЗНАЧЕН')) return 'НЕ НАЗНАЧЕНО';
    if (n === 'ПО') return 'НЕ НАЗНАЧЕНО';
    return n;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function formatTimeRange(startTime, endTime) {
    const getTimeStr = (ts) => {
        if (!ts) return '00:00';
        const date = new Date(ts);
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    };
    const startStr = getTimeStr(startTime);
    const endStr = getTimeStr(endTime);
    return startStr === endStr ? startStr : `${startStr}-${endStr}`;
}

// ============================================================
// CORE GROUPING — 100% MIRROR OF frontend groupOrdersByTimeWindow()
// ============================================================

/**
 * Groups orders for a SINGLE courier into time-window blocks.
 * 
 * This is a 100% mirror of frontend groupOrdersByTimeWindow() in
 * routeCalculationHelpers.ts (lines 188-428).
 *
 * @param {object[]} orders - Orders for ONE courier only
 * @param {string} courierId - Normalized courier name/ID
 * @param {string} courierName - Display name of courier
 * @returns {object[]} Array of time-window blocks (groups)
 */
function groupOrdersByTimeWindow(orders, courierId, courierName) {
    if (!orders || orders.length === 0) return [];

    // STEP 0: Preserving all orders for accurate load statistics
    // v6.33: Removed deduplication to ensure multi-item orders count towards the numerator
    const uniqueOrders = [...orders];

    const noTimeOrders = [];
    const ordersWithData = [];

    // STEP 1: Parse times — EXACT mirror of frontend lines 221-270
    uniqueOrders.forEach(order => {
        let plannedTime = getPlannedTime(order);
        const kitchenTime = getKitchenTime(order);
        let arrivalTime = getArrivalTime(order);
        const executionTime = getExecutionTime(order);

        // If no arrival time, use planned or kitchen time
        if (!arrivalTime) {
            arrivalTime = plannedTime || kitchenTime;
        }

        if (!plannedTime) {
            if (kitchenTime) {
                plannedTime = kitchenTime + 60 * 60 * 1000;
            } else if (arrivalTime) {
                plannedTime = arrivalTime + 30 * 60 * 1000;
            } else {
                noTimeOrders.push(order);
                return;
            }
        }

        const plannedTs = plannedTime;
        const arrivalTs = arrivalTime || plannedTime;

        if (plannedTs === null || isNaN(plannedTs)) {
            noTimeOrders.push(order);
            return;
        }

        ordersWithData.push({
            order,
            planned: plannedTs,
            arrival: arrivalTs,
            kitchen: kitchenTime || undefined,
            execution: executionTime || undefined
        });
    });

    // STEP 2: Add anchorTime — EXACT mirror of frontend lines 272-277
    // anchorTime = executionTime (completed orders) OR planned time
    const ordersWithAnchor = ordersWithData.map(item => ({
        ...item,
        anchorTime: item.execution || item.planned
    }));

    // STEP 3: Sort by anchorTime, then kitchen — mirror of frontend lines 280-283
    ordersWithAnchor.sort((a, b) => {
        if (a.anchorTime !== b.anchorTime) return a.anchorTime - b.anchorTime;
        return (a.kitchen || 0) - (b.kitchen || 0);
    });

    const groups = [];
    const manualGroupsMap = new Map();
    const ordersForAuto = [];

    // STEP 4: Separate manual groups — mirror of frontend lines 289-299
    ordersWithAnchor.forEach(item => {
        if (item.order.manualGroupId) {
            if (!manualGroupsMap.has(item.order.manualGroupId)) {
                manualGroupsMap.set(item.order.manualGroupId, []);
            }
            manualGroupsMap.get(item.order.manualGroupId).push(item);
        } else {
            ordersForAuto.push(item);
        }
    });

    // STEP 5: Push manual groups verbatim — mirror of frontend lines 301-304
    manualGroupsMap.forEach((manualList, manualId) => {
        const minPlanned = Math.min(...manualList.map(i => i.planned));
        const maxPlanned = Math.max(...manualList.map(i => i.planned));
        groups.push({
            courierName,
            courierId,
            windowStart: minPlanned,
            windowEnd: maxPlanned,
            windowLabel: formatTimeRange(minPlanned, maxPlanned),
            orders: manualList.map(i => i.order),
            manualGroupId: manualId
        });
    });

    // STEP 6: Determine if courier is "assigned" (not unassigned)
    // Mirror of frontend line 307
    const isAssignedCourier = courierId && courierId !== 'НЕ НАЗНАЧЕНО' && courierId !== 'UNASSIGNED';

    let currentGroup = null;

    // STEP 7: Auto-group the remaining orders — EXACT mirror of frontend lines 313-391
    ordersForAuto.forEach(({ order, planned, arrival, kitchen, anchorTime }) => {
        if (!currentGroup) {
            // Create first group
            currentGroup = {
                courierName,
                courierId,
                orders: [order],
                windowStart: planned,
                windowEnd: planned,
                arrivalEnd: arrival,
                firstAnchor: anchorTime,
                lastKitchen: kitchen
            };
        } else {
            // Check if order fits in current 15-minute window from FIRST order
            const firstAnchor = currentGroup.firstAnchor;
            const arrivedClose = (anchorTime - firstAnchor) <= WINDOW_MS;

            // Delivery span check
            const minDelivery = Math.min(currentGroup.windowStart, planned);
            const maxDelivery = Math.max(currentGroup.windowEnd, planned);
            const deliveryFits = (maxDelivery - minDelivery) <= DELIVERY_SPAN_MS;

            // Geographic distance check — v6.4: relaxed for assigned couriers (15km -> 50km)
            let distanceOk = true;
            if (order.coords && currentGroup.orders[0].coords) {
                const dist = haversineDistance(
                    order.coords.lat, order.coords.lng,
                    currentGroup.orders[0].coords.lat, currentGroup.orders[0].coords.lng
                );
                const limit = isAssignedCourier ? 50 : 15; // v6.4: assigned couriers get 50km slack
                if (dist > limit) distanceOk = false;
            }

            // Zone/district check — v6.4: disable for assigned couriers as user expects them to travel
            let districtOk = true;
            if (!isAssignedCourier) {
                const orderZone = String(order.deliveryZone || order.zone || order.kmlZone || '').trim().toUpperCase();
                const groupZone = String(currentGroup.orders[0].deliveryZone || currentGroup.orders[0].zone || currentGroup.orders[0].kmlZone || '').trim().toUpperCase();
                if (orderZone && groupZone && orderZone !== groupZone) {
                    districtOk = false;
                }
            }

            // Kitchen gap check — only for UNASSIGNED couriers (mirror of frontend lines 348-354)
            let kitchenGapOk = true;
            if (!isAssignedCourier) {
                const prevKitchen = currentGroup.lastKitchen;
                if (prevKitchen && kitchen && Math.abs(kitchen - prevKitchen) > 30 * 60 * 1000) {
                    kitchenGapOk = false;
                }
            }

            // Split decision — EXACT mirror of frontend split cascade (lines 356-360)
            let splitReason = '';
            if (!arrivedClose) splitReason = 'Время (15 мин)';
            else if (!deliveryFits) splitReason = 'SLA';
            else if (!distanceOk) splitReason = 'Гео';
            else if (!districtOk) splitReason = 'Район';
            else if (!isAssignedCourier && !kitchenGapOk) splitReason = 'Готовность';

            if (splitReason === '') {
                // Order fits → add to current group (mirror of frontend lines 363-371)
                currentGroup.orders.push(order);
                currentGroup.windowStart = Math.min(currentGroup.windowStart, planned);
                currentGroup.windowEnd = Math.max(currentGroup.windowEnd, planned);
                currentGroup.arrivalEnd = Math.max(currentGroup.arrivalEnd || 0, arrival);
                if (kitchen) currentGroup.lastKitchen = kitchen;
            } else {
                // Order does NOT fit → flush current group, start new one (mirror lines 373-390)
                groups.push({
                    courierName,
                    courierId,
                    windowStart: currentGroup.windowStart,
                    windowEnd: currentGroup.windowEnd,
                    windowLabel: formatTimeRange(currentGroup.windowStart, currentGroup.windowEnd),
                    orders: [...currentGroup.orders],
                    splitReason: currentGroup.splitReason
                });
                // Start new group
                currentGroup = {
                    courierName,
                    courierId,
                    orders: [order],
                    windowStart: planned,
                    windowEnd: planned,
                    arrivalEnd: arrival,
                    firstAnchor: anchorTime,
                    lastKitchen: kitchen,
                    splitReason
                };
            }
        }
    });

    // Flush last group (mirror of frontend lines 394-399)
    if (currentGroup && currentGroup.orders.length > 0) {
        groups.push({
            courierName,
            courierId,
            windowStart: currentGroup.windowStart,
            windowEnd: currentGroup.windowEnd,
            windowLabel: formatTimeRange(currentGroup.windowStart, currentGroup.windowEnd),
            orders: currentGroup.orders,
            splitReason: currentGroup.splitReason
        });
    }

    // Add no-time orders — mirror of frontend lines 401-413
    // NOTE: frontend puts them all in ONE group (isReadyForCalculation: false)
    // Backend splits into chunks of 10 to avoid monster routes — this is intentional divergence
    if (noTimeOrders.length > 0) {
        const CHUNK_SIZE = 10;
        for (let i = 0; i < noTimeOrders.length; i += CHUNK_SIZE) {
            const chunk = noTimeOrders.slice(i, i + CHUNK_SIZE);
            groups.push({
                courierName,   // FIXED: use passed courierName, not orders[0].courier
                courierId,
                windowStart: 0,
                windowEnd: 0,
                windowLabel: noTimeOrders.length <= CHUNK_SIZE ? 'Без времени' : `Без времени ${Math.floor(i / CHUNK_SIZE) + 1}`,
                orders: chunk,
                isTimeless: true
            });
        }
    }

    // Sort groups by windowStart (mirror of frontend line 427)
    groups.sort((a, b) => a.windowStart - b.windowStart);

    logger.info(`[turboGrouping] ✅ ${courierName}: ${uniqueOrders.length} orders → ${groups.length} groups`);
    return groups;
}

// ============================================================
// MAIN EXPORT — groups ALL orders for ALL couriers
// ============================================================

/**
 * Groups all orders for all couriers into time-window blocks.
 * 
 * EXACT mirror of frontend groupAllOrdersByTimeWindow() in
 * routeCalculationHelpers.ts (lines 433-479).
 *
 * @param {object[]} orders - All orders (mixed couriers)
 * @returns {Map<string, object[]>} Map<normalizedCourierName, groups[]>
 */
function groupAllOrdersByTimeWindow(orders) {
    if (!orders || orders.length === 0) return new Map();

    // STEP 1: Group orders by raw courier name — mirror of frontend groupOrdersByCourier()
    const rawGroups = new Map();
    orders.forEach(order => {
        let courierRaw = order.courier;
        if (typeof courierRaw === 'object' && courierRaw !== null) {
            courierRaw = courierRaw.name || courierRaw._id || courierRaw.id;
        }
        if (!courierRaw) return;

        const normName = normalizeCourierName(courierRaw);
        if (normName === 'НЕ НАЗНАЧЕНО') return; // Skip unassigned
        
        if (!rawGroups.has(normName)) {
            rawGroups.set(normName, { name: courierRaw, orders: [] });
        }
        rawGroups.get(normName).orders.push(order);
    });

    // STEP 2: Group each courier's orders by time window
    // Using normalized name as both courierId and courierName key — matches frontend line 475
    const result = new Map();
    rawGroups.forEach((info, normName) => {
        const groups = groupOrdersByTimeWindow(info.orders, normName, normName);
        result.set(normName, groups);
    });

    const totalGroups = Array.from(result.values()).reduce((sum, g) => sum + g.length, 0);
    logger.info(`[turboGrouping] 📊 SUMMARY: ${result.size} couriers → ${totalGroups} total groups`);

    return result;
}

module.exports = {
    groupAllOrdersByTimeWindow,
    groupOrdersByTimeWindow,
    normalizeCourierName,
    getExecutionTime,
    getPlannedTime,
    getArrivalTime,
    getKitchenTime,
    getAllOrderIds,
    getOrderHash,
    haversineDistance
};
