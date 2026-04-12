const logger = require('../src/utils/logger');

// ============================================================
// CONSTANTS & HELPERS — Sync with frontend routeCalculationHelpers.ts
// ============================================================
const PROXIMITY_MINUTES = 30;           // v5.151: Synced with frontend SOTA
const MAX_DELIVERY_SPAN_MINUTES = 60;   // v5.151: Synced with frontend SOTA
const GEO_SNAP_KM = 0.5;               
const KITCHEN_BATCH_MS = 10 * 60 * 1000; 

/**
 * Normalizes courier names for consistent grouping.
 */
function normalizeCourierName(name) {
    if (!name) return 'НЕ НАЗНАЧЕНО';
    if (typeof name !== 'string') return 'НЕ НАЗНАЧЕНО';
    const n = name.trim().toUpperCase();
    if (n === '' || n === 'НЕ НАЗНАЧЕНО' || n === 'UNDEFINED' || n === 'NULL') return 'НЕ НАЗНАЧЕНО';
    return n;
}

const parseTimeRobust = (t) => {
    if (!t) return null;
    // If it's already a number (timestamp), return it
    if (typeof t === 'number') return t;
    
    // If it's a "HH:MM" or "HH:MM:SS" string without a date
    if (typeof t === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(t.trim())) {
        const parts = t.trim().split(':');
        const hour = parseInt(parts[0], 10);
        const minute = parseInt(parts[1], 10);
        const second = parts[2] ? parseInt(parts[2], 10) : 0;
        
        // Match frontend's logic: use current date (or baseDate) and set hours/minutes
        const base = new Date();
        base.setHours(hour, minute, second, 0);
        return base.getTime();
    }
    
    // Try to handle DD.MM.YYYY HH:MM:SS format
    if (typeof t === 'string') {
        const dotMatch = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
        if (dotMatch) {
            const d = parseInt(dotMatch[1], 10);
            const m = parseInt(dotMatch[2], 10) - 1;
            const y = parseInt(dotMatch[3], 10);
            const hh = dotMatch[4] ? parseInt(dotMatch[4], 10) : 0;
            const mm = dotMatch[5] ? parseInt(dotMatch[5], 10) : 0;
            const ss = dotMatch[6] ? parseInt(dotMatch[6], 10) : 0;
            return new Date(y, m, d, hh, mm, ss).getTime();
        }
    }

    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d.getTime();
};

const KITCHEN_TIME_FIELDS = [
    'время на кухню', 'время_на_кухню', 'Время на кухню', 'Время_на_кухню', 'ВРЕМЯ НА КУХНЮ',
    'час на кухню', 'час_на_кухню', 'час на кухні', 'час_на_кухні',
    'kitchen_time', 'kitchenTime', 'KitchenTime', 'KITCHEN_TIME',
    'kitchen', 'Kitchen', 'KITCHEN',
    'Время готовности', 'время готовности', 'Готовность', 'готовность',
    'готовність', 'час готовності', 'readyAtSource'
];

const PLANNED_TIME_FIELDS = [
    'плановое время', 'плановое_время', 'Плановое время', 'Плановое_время', 'ПЛАНОВОЕ ВРЕМЯ',
    'plannedTime', 'planned_time', 'PlannedTime', 'PLANNED_TIME',
    'Дедлайн', 'дедлайн', 'ДЕДЛАЙН', 'deadline', 'Deadline', 'DEADLINE',
    'deadlineAt', 'deadline_at', 'DeadlineAt',
    'deliverBy', 'deliver_by', 'DeliverBy',
    'Время доставки', 'время доставки', 'ВРЕМЯ ДОСТАВКИ',
    'доставить к', 'доставить_к', 'Доставить к',
    'timeDeliveryEnd', 'time_delivery_end', 'TimeDeliveryEnd', 'planned'
];

const ARRIVAL_TIME_FIELDS = [
    'создания', 'создание', 'creation', 'createdAt', 'Дата.создания',
    'дата.создания', 'Дата создания', 'дата создания', 'CreatedAt',
    'creationDate', 'arrival', 'time'
];

const EXECUTION_TIME_FIELDS = [
    'executionTime', 'Время выполнения', 'execution', 'handoverAt', 'completedAt', 'deliveringAt'
];

const getFirstAvailableField = (o, fields) => {
    if (!o) return null;
    for (const field of fields) {
        if (o[field] !== undefined && o[field] !== null) return String(o[field]);
        if (o.raw && o.raw[field] !== undefined && o.raw[field] !== null) return String(o.raw[field]);
    }
    return null;
}

const getExecutionTime = (o) => {
    if (o.statusTimings && o.statusTimings.completedAt) return parseTimeRobust(o.statusTimings.completedAt);
    if (o.statusTimings && o.statusTimings.deliveringAt) return parseTimeRobust(o.statusTimings.deliveringAt);
    const t = getFirstAvailableField(o, EXECUTION_TIME_FIELDS);
    return parseTimeRobust(t);
};

const getPlannedTime = (o) => {
    // If deadlineAt is already a timestamp from frontend
    if (o.deadlineAt && typeof o.deadlineAt === 'number') {
        const d = new Date(o.deadlineAt);
        if (d.getHours() !== 0 || d.getMinutes() !== 0) return o.deadlineAt;
    }
    const t = getFirstAvailableField(o, PLANNED_TIME_FIELDS);
    return parseTimeRobust(t);
};

const getArrivalTime = (o) => {
    if (o.statusTimings && o.statusTimings.assembledAt) return parseTimeRobust(o.statusTimings.assembledAt);
    if (o.createdAt && typeof o.createdAt === 'number' && o.createdAt > 1000000000000) return o.createdAt;
    const t = getFirstAvailableField(o, ARRIVAL_TIME_FIELDS);
    return parseTimeRobust(t);
};

const getKitchenTime = (o) => {
    const t = getFirstAvailableField(o, KITCHEN_TIME_FIELDS);
    return parseTimeRobust(t);
};

/**
 * Returns all possible IDs for an order to prevent duplicates.
 */
function getAllOrderIds(o) {
    if (!o) return [];
    if (Array.isArray(o)) return o.flatMap(sub => getAllOrderIds(sub));
    const ids = new Set();
    if (o.id) ids.add(String(o.id));
    if (o._id) ids.add(String(o._id));
    if (o.orderNumber) ids.add(String(o.orderNumber));
    if (o.externalId) ids.add(String(o.externalId));
    return Array.from(ids);
}

/**
 * Generates a content-based hash for an order or group of orders.
 */
function getOrderHash(input) {
    const orders = Array.isArray(input) ? input : [input];
    return orders.map(o => {
        const id = String(o.id || o._id || '');
        if (id) return id;
        const addr = (o.address || o.addressGeo || '').toLowerCase().trim();
        const time = getPlannedTime(o) || 0;
        return `${addr}_${time}`;
    }).sort().join('_');
}

/**
 * Basic haversine distance in KM.
 */
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

function formatTimeRange(start, end) {
    if (!start) return '00:00 - 00:00';
    const s = new Date(start);
    const e = new Date(end || start);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(s.getHours())}:${pad(s.getMinutes())} - ${pad(e.getHours())}:${pad(e.getMinutes())}`;
}

// ============================================================
// CORE GROUPING LOGIC — SOTA v7.5 (STABLE FORMATION)
// ============================================================

/**
 * Groups orders for a SINGLE courier.
 * EXACT mirror of frontend groupOrdersByTimeWindow() logic.
 */
function getStableOrderId(order) {
    if (!order) return '';
    if (order.orderNumber) return String(order.orderNumber);
    const rawId = order.id;
    const isInvalidId = rawId === undefined || rawId === null || rawId === 0 ||
        String(rawId).trim() === '' || String(rawId) === 'ID:0';
    const idVal = isInvalidId ? '' : String(rawId);
    const indexSuffix = (order.excel_index !== undefined) ? `_r${order.excel_index}` : '';
    // simplified fallback hash
    const addr = (order.address || '').toLowerCase().trim();
    let hash = 0;
    for (let i = 0; i < addr.length; i++) {
        hash = Math.imul(31, hash) + addr.charCodeAt(i) | 0;
    }
    const fallback = String(order._id || `gen_${Math.abs(hash)}${indexSuffix}`);
    return idVal || fallback;
}

function groupOrdersByTimeWindow(orders, courierId, courierName) {
    if (!orders || orders.length === 0) return [];

    // STEP 0: Deduplicate orders by stable ID BEFORE processing (v5.139 fix)
    // Use getStableOrderId which handles _id, orderNumber, and address hash
    const seenIds = new Set();
    const uniqueOrders = [];
    for (const order of orders) {
        const sid = getStableOrderId(order);
        if (!sid) {
            // Orders without any ID - keep them (edge case)
            uniqueOrders.push(order);
        } else if (!seenIds.has(sid)) {
            seenIds.add(sid);
            uniqueOrders.push(order);
        }
    }
    
    // Debug: log if duplicates were found
    if (uniqueOrders.length < orders.length) {
        logger.warn(`[groupOrdersByTimeWindow] ⚠️ Removed ${orders.length - uniqueOrders.length} duplicate orders`);
    }

    const noTimeOrders = [];
    const ordersWithData = [];

    uniqueOrders.forEach(order => {
        let plannedTime = getPlannedTime(order);
        const kitchenTime = getKitchenTime(order);
        let arrivalTime = getArrivalTime(order);
        const executionTime = getExecutionTime(order);

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
            arrivalStart: mOrders.length > 0 && getArrivalTime(mOrders[0]) ? Math.min(...mOrders.map(o => getArrivalTime(o)).filter(Boolean)) : undefined,
            arrivalEnd: mOrders.length > 0 && getArrivalTime(mOrders[0]) ? Math.max(...mOrders.map(o => getArrivalTime(o)).filter(Boolean)) : undefined,
            manualGroupId: mgId
        });
    });

    const isAssignedCourier = courierId && courierId !== 'unassigned' && courierId !== 'unassigned_auto' && courierId !== 'Неизвестный курьер' && courierId !== 'НЕ НАЗНАЧЕНО';
    let currentGroup = null;

    const WINDOW_MS = PROXIMITY_MINUTES * 60 * 1000; 

    ordersForAuto.forEach(({ order, planned, arrival, kitchen, anchorTime }) => {
        const deliverySpanMs = MAX_DELIVERY_SPAN_MINUTES * 60 * 1000;
        
        if (!currentGroup) {
            currentGroup = {
                id: `group-${courierId}-${order.id}-${planned}`,
                courierId, 
                courierName,
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
            const orderZone = order.deliveryZone || '';
            const groupZone = currentGroup.orders[0].deliveryZone || '';
            if (orderZone && groupZone && orderZone !== groupZone) {
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
                const oldGroup = currentGroup;
                const isAllCompleted = oldGroup.orders.every(o => {
                   const s = String(o.status || '').toLowerCase();
                   return ['завершен', 'добавлен в завершенные', 'завершено', 'доставлен', 'выполнен', 'виконано', 'completed'].includes(s);
                });
                if (isAllCompleted && isAssignedCourier) oldGroup.splitReason = 'Завершён';

                groups.push(oldGroup);
                currentGroup = {
                    id: `group-${courierId}-${order.id}-${planned}`,
                    courierId,
                    courierName,
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
        const finalGroup = currentGroup;
        const isAllCompleted = finalGroup.orders.every(o => {
            const s = String(o.status || '').toLowerCase();
            return ['завершен', 'добавлен в завершенные', 'завершено', 'доставлен', 'выполнен', 'виконано', 'completed'].includes(s);
         });
        if (isAllCompleted && isAssignedCourier) finalGroup.splitReason = 'Завершён';
        groups.push(finalGroup);
    }

    if (noTimeOrders.length > 0) {
        groups.push({
            id: `${courierId}-no-time`,
            courierId,
            courierName,
            windowStart: 0,
            windowEnd: 0,
            windowLabel: 'Без времени',
            orders: noTimeOrders,
            isReadyForCalculation: false
        });
    }

    groups.forEach(group => {
        group.orders.sort((a, b) => {
            const timeA = getPlannedTime(a) || a.plannedTime || 0;
            const timeB = getPlannedTime(b) || b.plannedTime || 0;
            const tsA = typeof timeA === 'number' ? timeA : new Date(timeA).getTime();
            const tsB = typeof timeB === 'number' ? timeB : new Date(timeB).getTime();
            return tsA - tsB;
        });
    });

    return groups.sort((a, b) => a.windowStart - b.windowStart);
}

/**
 * Groups ALL orders for ALL couriers.
 */
function groupAllOrdersByTimeWindow(orders) {
    if (!orders || !Array.isArray(orders)) return new Map();

    const courierGroups = new Map();
    orders.forEach(order => {
        let courierRaw = order.courier;
        if (typeof courierRaw === 'object' && courierRaw !== null) {
            courierRaw = courierRaw.name || courierRaw._id || courierRaw.id;
        }
        if (!courierRaw) return;

        const normName = normalizeCourierName(courierRaw);
        if (normName === 'НЕ НАЗНАЧЕНО') return; 
        
        if (!courierGroups.has(normName)) {
            courierGroups.set(normName, { rawName: String(courierRaw), orders: [] });
        }
        courierGroups.get(normName).orders.push(order);
    });

    const result = new Map();
    courierGroups.forEach((info, normName) => {
        const groups = groupOrdersByTimeWindow(info.orders, normName, info.rawName);
        result.set(normName, groups);
    });

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
