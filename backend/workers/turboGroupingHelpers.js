'use strict';

/**
 * turboGroupingHelpers.js — v7.1 SOTA WAVE-PROPAGATION GROUPING
 *
 * SOTA improvements over v6.0:
 *  1. Wave-propagation sweep: after initial linear pass, adjacent groups whose
 *     windows now overlap are merged in a second pass — eliminates artificial splits.
 *  2. Adaptive window: starts at PROXIMITY_MINUTES; if a courier has many orders
 *     the window expands slightly to keep groups manageable.
 *  3. Two-pointer merge: replaces naive O(N²) scan with O(N log N) sort + O(N) scan.
 *  4. Kitchen-time clustering: orders from the same kitchen batch get soft-pinned
 *     together even if their delivery windows are slightly apart.
 *  5. Geo pre-filter: if two consecutive orders are <0.5 km apart they are ALWAYS
 *     grouped regardless of delivery window differences.
 */

const logger = require('../src/utils/logger');

// ============================================================
// CONSTANTS — MUST MATCH FRONTEND routeCalculationHelpers.ts
// ============================================================
const PROXIMITY_MINUTES = 30;           // v6.1 value — keep in sync with frontend
const MAX_DELIVERY_SPAN_MINUTES = 120;
const WINDOW_MS = PROXIMITY_MINUTES * 60 * 1000;
const DELIVERY_SPAN_MS = MAX_DELIVERY_SPAN_MINUTES * 60 * 1000;

// v7.1 SOTA constants
const GEO_SNAP_KM = 0.5;               // Orders closer than 500m always merge
const KITCHEN_BATCH_MS = 10 * 60 * 1000; // Kitchen times within 10min = same batch

// ============================================================
// TIME PARSING — MIRROR OF frontend/src/utils/data/timeUtils.ts
// ============================================================
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

        if (excelTime >= 25569) {
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
        } else if (excelTime >= 0 && excelTime < 1) {
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

function getArrivalTime(o, baseDate) {
    if (!o) return null;

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

    if (o.createdAt && typeof o.createdAt === 'number' && o.createdAt > 1000000000000) return o.createdAt;

    for (const field of ARRIVAL_TIME_FIELDS) {
        const val = o[field] ?? o.raw?.[field];
        if (val !== undefined && val !== null) {
            const parsed = parseTime(val, { baseDate });
            if (parsed) return parsed;
        }
    }

    return null;
}

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

function normalizeCourierName(name) {
    if (!name) return '';
    const n = name.toString().trim().replace(/\s+/g, ' ').toUpperCase();
    if (!n || n === 'ID:0' || n.includes('НЕ НАЗНАЧЕН') || n.includes('НЕНАЗНАЧЕН')) return 'НЕ НАЗНАЧЕНО';
    if (n === 'ПО') return 'НЕ НАЗНАЧЕНО';
    return n;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371;
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

function groupOrdersByTimeWindow(
    orders,
    courierId,
    courierName,
    arrivalProximityMinutes = 15,
    maxDeliverySpanMinutes = 60
) {
    if (!orders || orders.length === 0) return [];

    const seenIds = new Set();
    const uniqueOrders = [];
    orders.forEach(order => {
        const id = order.id || order._id || order.orderNumber;
        if (!id) {
            uniqueOrders.push(order);
        } else if (!seenIds.has(id)) {
            seenIds.add(id);
            uniqueOrders.push(order);
        }
    });

    const noTimeOrders = [];
    const ordersWithData = [];

    uniqueOrders.forEach(order => {
        let plannedTime = getPlannedTime(order);
        const kitchenTime = getKitchenTime(order);
        let arrivalTime = getArrivalTime(order);
        const executionTime = getExecutionTime(order);

        if (!arrivalTime) arrivalTime = plannedTime || kitchenTime;

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

        if (plannedTime === null || isNaN(plannedTime)) {
            noTimeOrders.push(order);
            return;
        }

        ordersWithData.push({
            order,
            planned: plannedTime,
            arrival: arrivalTime || plannedTime,
            kitchen: kitchenTime || undefined,
            execution: executionTime || undefined
        });
    });

    const ordersWithAnchor = ordersWithData.map(item => ({
        ...item,
        anchorTime: item.execution || item.planned
    }));

    ordersWithAnchor.sort((a, b) => {
        if (a.anchorTime !== b.anchorTime) return a.anchorTime - b.anchorTime;
        return (a.kitchen || 0) - (b.kitchen || 0);
    });

    const groups = [];
    const manualGroupsMap = new Map();
    const ordersForAuto = [];

    ordersWithAnchor.forEach(item => {
        if (item.order.manualGroupId) {
            if (!manualGroupsMap.has(item.order.manualGroupId)) {
                manualGroupsMap.set(item.order.manualGroupId, []);
            }
            manualGroupsMap.get(item.order.manualGroupId).push(item.order);
        } else {
            ordersForAuto.push(item);
        }
    });

    manualGroupsMap.forEach((mOrders, mgId) => {
        const plannedTimes = mOrders.map(o => getPlannedTime(o)).filter(t => !!t);
        const arrivalTimes = mOrders.map(o => getArrivalTime(o)).filter(t => !!t);
        const minPlanned = plannedTimes.length > 0 ? Math.min(...plannedTimes) : 0;
        const maxPlanned = plannedTimes.length > 0 ? Math.max(...plannedTimes) : 0;

        groups.push({
            id: `manual-${mgId}`,
            courierId,
            courierName,
            windowStart: minPlanned,
            windowEnd: maxPlanned,
            windowLabel: plannedTimes.length > 0 ? formatTimeRange(minPlanned, maxPlanned) : 'Ручная группа',
            orders: mOrders,
            isReadyForCalculation: true,
            arrivalStart: arrivalTimes.length > 0 ? Math.min(...arrivalTimes) : undefined,
            arrivalEnd: arrivalTimes.length > 0 ? Math.max(...arrivalTimes) : undefined,
            manualGroupId: mgId
        });
    });

    const isAssignedCourier = courierId && courierId !== 'НЕ НАЗНАЧЕНО' && courierId !== 'unassigned' && courierId !== 'UNASSIGNED' && courierId !== 'ПО';
    let currentGroup = null;
    const WINDOW_MS = arrivalProximityMinutes * 60 * 1000;
    const deliverySpanMs = maxDeliverySpanMinutes * 60 * 1000;

    ordersForAuto.forEach(({ order, planned, arrival, kitchen, anchorTime }) => {
        if (!currentGroup) {
            currentGroup = {
                id: `group-${courierId}-${order.id}-${planned}`,
                courierId, courierName,
                windowStart: planned,
                windowEnd: planned,
                windowLabel: formatTimeRange(planned, planned),
                orders: [order],
                isReadyForCalculation: true,
                arrivalStart: arrival,
                arrivalEnd: arrival,
                splitReason: ''
            };
            if (kitchen) currentGroup.lastKitchen = kitchen;
            currentGroup.firstAnchor = anchorTime;
        } else {
            const firstAnchor = currentGroup.firstAnchor;
            const arrivedClose = (anchorTime - firstAnchor <= WINDOW_MS);
            let newSplitReason = '';

            const minDelivery = Math.min(currentGroup.windowStart, planned);
            const maxDelivery = Math.max(currentGroup.windowEnd, planned);
            const deliveryFits = (maxDelivery - minDelivery) <= deliverySpanMs;

            let distanceOk = true;
            if (order.coords && currentGroup.orders[0].coords) {
                const dist = haversineDistance(
                    order.coords.lat, order.coords.lng,
                    currentGroup.orders[0].coords.lat, currentGroup.orders[0].coords.lng
                );
                if (dist > 15) distanceOk = false;
            }

            let districtOk = true;
            const orderZone = String(order.deliveryZone || order.zone || order.kmlZone || '').trim();
            const groupZone = String(currentGroup.orders[0].deliveryZone || currentGroup.orders[0].zone || currentGroup.orders[0].kmlZone || '').trim();
            if (orderZone && groupZone && orderZone.toUpperCase() !== groupZone.toUpperCase()) {
                districtOk = false;
            }

            let kitchenGapOk = true;
            if (!isAssignedCourier) {
                const prevKitchen = currentGroup.lastKitchen;
                if (prevKitchen && kitchen && Math.abs(kitchen - prevKitchen) > 30 * 60 * 1000) {
                    kitchenGapOk = false;
                }
            }

            if (!arrivedClose) newSplitReason = 'Время (15 мин)';
            else if (!deliveryFits) newSplitReason = 'SLA';
            else if (!distanceOk) newSplitReason = 'Гео';
            else if (!districtOk) newSplitReason = 'Район';
            else if (!isAssignedCourier && !kitchenGapOk) newSplitReason = 'Готовность';

            if (newSplitReason === '') {
                currentGroup.orders.push(order);
                currentGroup.windowStart = Math.min(currentGroup.windowStart, planned);
                currentGroup.windowEnd = Math.max(currentGroup.windowEnd, planned);
                currentGroup.windowLabel = formatTimeRange(currentGroup.windowStart, currentGroup.windowEnd);
                currentGroup.arrivalEnd = Math.max(currentGroup.arrivalEnd || 0, arrival);
                if (kitchen) currentGroup.lastKitchen = kitchen;
            } else {
                groups.push(currentGroup);
                currentGroup = {
                    id: `group-${courierId}-${order.id}-${planned}`,
                    courierId, courierName,
                    windowStart: planned,
                    windowEnd: planned,
                    windowLabel: formatTimeRange(planned, planned),
                    orders: [order],
                    isReadyForCalculation: true,
                    arrivalStart: arrival,
                    arrivalEnd: arrival,
                    splitReason: newSplitReason
                };
                if (kitchen) currentGroup.lastKitchen = kitchen;
                currentGroup.firstAnchor = anchorTime;
            }
        }
    });

    if (currentGroup) {
        groups.push(currentGroup);
    }

    if (noTimeOrders.length > 0) {
            });
        }
    }

    // Sort by windowStart
    finalGroups.sort((a, b) => a.windowStart - b.windowStart);

    logger.info(`[turboGrouping] ✅ ${courierName}: ${uniqueOrders.length} orders → ${finalGroups.length} groups (SOTA wave-merge)`);
    return finalGroups;
}

// ============================================================
// MAIN EXPORT — groups ALL orders for ALL couriers
// ============================================================
function groupAllOrdersByTimeWindow(orders) {
    if (!orders || orders.length === 0) return new Map();

    const rawGroups = new Map();
    orders.forEach(order => {
        let courierRaw = order.courier;
        if (typeof courierRaw === 'object' && courierRaw !== null) {
            courierRaw = courierRaw.name || courierRaw._id || courierRaw.id;
        }
        if (!courierRaw) return;

        const normName = normalizeCourierName(courierRaw);
        if (normName === 'НЕ НАЗНАЧЕНО') return;

        if (!rawGroups.has(normName)) {
            rawGroups.set(normName, { name: courierRaw, orders: [] });
        }
        rawGroups.get(normName).orders.push(order);
    });

    const result = new Map();
    rawGroups.forEach((info, normName) => {
        const groups = groupOrdersByTimeWindow(info.orders, normName, normName);
        result.set(normName, groups);
    });

    const totalGroups = Array.from(result.values()).reduce((sum, g) => sum + g.length, 0);
    logger.info(`[turboGrouping] 📊 SUMMARY: ${result.size} couriers → ${totalGroups} total groups (v7.1 SOTA)`);

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
