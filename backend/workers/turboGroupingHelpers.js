const logger = require('../src/utils/logger');

// ============================================================
// CONSTANTS — Synced with frontend routeCalculationHelpers.ts
// ============================================================
const PROXIMITY_MINUTES = 30;           // Must match frontend PROXIMITY_MINUTES
const MAX_DELIVERY_SPAN_MINUTES = 60;   // Must match frontend MAX_DELIVERY_SPAN_MINUTES

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash;
}

function normalizeCourierName(name) {
    if (!name) return 'НЕ НАЗНАЧЕНО';
    if (typeof name !== 'string') return 'НЕ НАЗНАЧЕНО';
    const n = name.trim().toUpperCase();
    if (n === '' || n === 'НЕ НАЗНАЧЕНО' || n === 'UNDEFINED' || n === 'NULL' || n === 'UNASSIGNED') return 'НЕ НАЗНАЧЕНО';
    return n;
}

// ============================================================
// TIME PARSING — Exact mirror of frontend src/utils/data/timeUtils.ts
// ============================================================

/**
 * Parses a time value from string, number (Excel serial), or Date.
 * Mirrors frontend parseTime() including Excel serial number support.
 */
const parseTimeRobust = (val, baseDate) => {
    if (!val && val !== 0) return null;
    const s = String(val).trim();
    if (!s || s.includes('#')) return null;

    const strVal = s.toLowerCase();
    // Skip durations
    if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour')) {
        return null;
    }

    // 1. Excel serial number (number or numeric string)
    const excelTime = typeof val === 'number' ? val : parseFloat(s);
    if (!isNaN(excelTime) && excelTime > 0) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        if (excelTime >= 25569) { // Date + Time
            const days = Math.floor(excelTime);
            const timeFraction = excelTime - days;
            const date = new Date(excelEpoch.getTime() + days * 86400 * 1000);
            const totalHours = timeFraction * 24;
            const hours = Math.floor(totalHours);
            const minutes = Math.floor((totalHours - hours) * 60);
            const seconds = Math.round(((totalHours - hours) * 60 - minutes) * 60);
            date.setUTCHours(hours, minutes, seconds, 0);
            return date.getTime();
        } else if (excelTime >= 0 && excelTime < 1) { // Time only
            const totalHours = excelTime * 24;
            const hours = Math.floor(totalHours);
            const minutes = Math.floor((totalHours - hours) * 60);
            const seconds = Math.round(((totalHours - hours) * 60 - minutes) * 60);
            const base = baseDate ? new Date(baseDate) : new Date();
            base.setHours(hours, minutes, seconds, 0);
            return base.getTime();
        }
    }

    // 2. DD.MM.YYYY HH:MM:SS
    const dotMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (dotMatch) {
        const d = parseInt(dotMatch[1], 10);
        const m = parseInt(dotMatch[2], 10) - 1;
        const y = parseInt(dotMatch[3], 10);
        const hh = dotMatch[4] ? parseInt(dotMatch[4], 10) : 0;
        const mm = dotMatch[5] ? parseInt(dotMatch[5], 10) : 0;
        const ss = dotMatch[6] ? parseInt(dotMatch[6], 10) : 0;
        return new Date(y, m, d, hh, mm, ss).getTime();
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

    // 4. HH:mm:ss or HH:mm
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
        const base = baseDate ? new Date(baseDate) : new Date();
        base.setHours(hour, minute, second, 0);
        return base.getTime();
    }

    const d = new Date(s);
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return d.getTime();

    return null;
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
    'timeDeliveryEnd', 'time_delivery_end', 'TimeDeliveryEnd'
];

// NOTE: Matches frontend exactly — does NOT include 'arrival' or 'time' (too generic)
const ARRIVAL_TIME_FIELDS = [
    'создания', 'создание', 'creation', 'createdAt', 'Дата.создания',
    'дата.создания', 'Дата создания', 'дата создания', 'CreatedAt'
];

const EXECUTION_TIME_FIELDS = [
    'executionTime', 'Время выполнения', 'handoverAt', 'completedAt', 'deliveringAt'
];

const getFirstAvailableField = (o, fields) => {
    if (!o) return null;
    for (const field of fields) {
        if (o[field] !== undefined && o[field] !== null) return o[field];
        if (o.raw && o.raw[field] !== undefined && o.raw[field] !== null) return o.raw[field];
    }
    return null;
};

/**
 * Mirrors frontend getKitchenTime exactly.
 * CRITICAL: accepts baseDate to correctly parse HH:MM against the target date (not today).
 */
const getKitchenTime = (o, baseDate) => {
    if (!o) return null;
    if (o.readyAtSource && typeof o.readyAtSource === 'number') return o.readyAtSource;

    for (const field of KITCHEN_TIME_FIELDS) {
        const val = o[field] ?? o.raw?.[field];
        if (val !== undefined && val !== null) {
            const parsed = parseTimeRobust(val, baseDate);
            if (parsed) return parsed;
        }
    }
    return null;
};

const getPlannedTime = (o, baseDate) => {
    if (!o) return null;

    if (o.deadlineAt && typeof o.deadlineAt === 'number') {
        const date = new Date(o.deadlineAt);
        if (date.getHours() !== 0 || date.getMinutes() !== 0) return o.deadlineAt;
    }

    for (const field of PLANNED_TIME_FIELDS) {
        const val = o[field] ?? o.raw?.[field];
        if (val !== undefined && val !== null) {
            if (typeof val === 'string' && (val === '00:00' || val === '00:00:00')) continue;
            const parsed = parseTimeRobust(val, baseDate);
            if (parsed) return parsed;
        }
    }
    return null;
};

const getArrivalTime = (o, baseDate) => {
    if (!o) return null;
    const status = String(o.status || o.deliveryStatus || '').trim().toLowerCase();
    const isDelivering = status.includes('доставля') || status.includes('в пути') ||
                         status.includes('маршру') || status.includes('исполнен') ||
                         status.includes('виконан') || status.includes('завер');

    if (isDelivering) {
        if (o.statusTimings?.deliveringAt) {
            const dt = parseTimeRobust(o.statusTimings.deliveringAt, baseDate);
            if (dt) return dt;
        }
        if (o.handoverAt && typeof o.handoverAt === 'number') return o.handoverAt;
    }

    if (status.includes('собран') || status.includes('зібран')) {
        if (o.statusTimings?.assembledAt) {
            const at = parseTimeRobust(o.statusTimings.assembledAt, baseDate);
            if (at) return at;
        }
    }

    if (o.createdAt && typeof o.createdAt === 'number' && o.createdAt > 1000000000000) return o.createdAt;
    if (o.creationDate && typeof o.creationDate === 'number' && o.creationDate > 1000000000000) return o.creationDate;

    for (const field of ARRIVAL_TIME_FIELDS) {
        const val = o[field] ?? o.raw?.[field];
        if (val !== undefined && val !== null) {
            const parsed = parseTimeRobust(val, baseDate);
            if (parsed) return parsed;
        }
    }

    return null;
};

const getExecutionTime = (o) => {
    if (!o) return null;
    const status = String(o.status || '').trim().toLowerCase();
    const isExecuted = status.includes('исполнен') || status.includes('выполнен') || status.includes('доставлен') ||
                       status.includes('виконан') || status.includes('заверш');
    if (!isExecuted) return null;

    if (o.statusTimings?.completedAt) {
        const t = typeof o.statusTimings.completedAt === 'number'
            ? o.statusTimings.completedAt
            : parseTimeRobust(o.statusTimings.completedAt);
        if (t) return t;
    }
    if (o.statusTimings?.deliveringAt) {
        const t = parseTimeRobust(o.statusTimings.deliveringAt);
        if (t) return t;
    }
    if (o.handoverAt && typeof o.handoverAt === 'number') return o.handoverAt;

    return null;
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
        const time = getPlannedTime(o, null) || 0;
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
/**
 * v5.139: Stable order ID based on orderNumber, numeric ID, or address hash.
 * Matches frontend getStableOrderId logic.
 */
function getStableOrderId(order) {
    if (!order) return '';
    
    // v6.32: Physical delivery prioritization - use orderNumber as primary ID (Synced with frontend)
    if (order.orderNumber) return String(order.orderNumber);

    // Treat "ID:0" as an invalid/placeholder ID to avoid collisions
    const rawId = order.id;
    const isInvalidId = rawId === undefined || rawId === null || rawId === 0 ||
        (typeof rawId === 'string' && String(rawId).toUpperCase().includes('ID:0'));

    const idVal = !isInvalidId ? String(rawId) : null;
    
    // v42.6: Final Strict Logic - Include excel_index to prevent collision of duplicate rows
    const indexSuffix = (order.excel_index !== undefined) ? `_r${order.excel_index}` : '';
    
    // Use _id as secondary fallback, otherwise hash the address
    const fallback = String(order._id || `gen_${Math.abs(hashString(order.address || ''))}${indexSuffix}`);
    
    return idVal || fallback;
}

function groupOrdersByTimeWindow(orders, courierId, courierName, baseDate) {
    if (!orders || orders.length === 0) return [];

    // STEP 0: Deduplicate orders by stable ID BEFORE processing
    const seenIds = new Set();
    const uniqueOrders = [];
    for (const order of orders) {
        const sid = getStableOrderId(order);
        if (!sid) {
            uniqueOrders.push(order);
        } else if (!seenIds.has(sid)) {
            seenIds.add(sid);
            uniqueOrders.push(order);
        }
    }
    if (uniqueOrders.length < orders.length) {
        logger.warn(`[groupOrdersByTimeWindow] ⚠️ Removed ${orders.length - uniqueOrders.length} duplicate orders`);
    }

    const noTimeOrders = [];
    const ordersWithData = [];
    const bDate = baseDate ? new Date(baseDate) : null;
    uniqueOrders.forEach(order => {
        let plannedTime = getPlannedTime(order, bDate);
        const kitchenTime = getKitchenTime(order, bDate);
        let arrivalTime = getArrivalTime(order, bDate);
        const executionTime = getExecutionTime(order, bDate);

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
        const plannedTimes = mOrders.map(o => getPlannedTime(o, bDate)).filter(t => !!t);
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
            arrivalStart: mOrders.length > 0 && getArrivalTime(mOrders[0], bDate) ? Math.min(...mOrders.map(o => getArrivalTime(o, bDate)).filter(Boolean)) : undefined,
            arrivalEnd: mOrders.length > 0 && getArrivalTime(mOrders[0], bDate) ? Math.max(...mOrders.map(o => getArrivalTime(o, bDate)).filter(Boolean)) : undefined,
            manualGroupId: mgId
        });
    });

    const isAssignedCourier = courierId && 
        courierId !== 'unassigned' && 
        courierId !== 'unassigned_auto' && 
        courierId !== 'Неизвестный курьер' && 
        courierId !== 'НЕ НАЗНАЧЕНО' && 
        courierId !== 'ПО';
    let currentGroup = null;

    const WINDOW_MS = PROXIMITY_MINUTES * 60 * 1000; 
    const DELIVERY_SPAN_MS = MAX_DELIVERY_SPAN_MINUTES * 60 * 1000;

    ordersForAuto.forEach(({ order, planned, arrival, kitchen, anchorTime }) => {
        
        if (!currentGroup) {
            // Начинаем новую группу с первым заказом
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
            currentGroup.firstCoords = order.coords || null;
            currentGroup.firstZone = order.deliveryZone || '';
        } else {
            // Проверяем 5 условий для добавления заказа в текущую группу
            const firstAnchor = currentGroup.firstAnchor;
            const firstOrder = currentGroup.orders[0];
            
            // Условие 1: Time proximity (anchor time within 30 min of first anchor)
            const timeDiff = anchorTime - firstAnchor;
            const timeWithinProximity = timeDiff >= 0 && timeDiff <= WINDOW_MS;
            
            // Условие 2: SLA / delivery span (total planned time span <= 60 min)
            const minPlannedInGroup = currentGroup.windowStart;
            const maxPlannedInGroup = currentGroup.windowEnd;
            const deliverySpan = Math.max(maxPlannedInGroup, planned) - Math.min(minPlannedInGroup, planned);
            const deliverySpanFits = deliverySpan <= DELIVERY_SPAN_MS;
            
            // Условие 3: Geography (distance <= 15km from first order in group)
            let distanceOk = true;
            let distanceToFirst = 0;
            if (order.coords && currentGroup.firstCoords) {
                distanceToFirst = haversineDistance(
                    order.coords.lat, order.coords.lng,
                    currentGroup.firstCoords.lat, currentGroup.firstCoords.lng
                );
                distanceOk = distanceToFirst <= 15;
            }
            
            // Условие 4: Zone (delivery zone must match first order)
            let zoneOk = true;
            const orderZone = order.deliveryZone || '';
            const groupZone = currentGroup.firstZone || '';
            if (orderZone && groupZone && orderZone !== groupZone) {
                zoneOk = false;
            }
            
            // Условие 5: Kitchen readiness gap (<= 30 min for unassigned couriers)
            let kitchenGapOk = true;
            if (!isAssignedCourier && kitchen && currentGroup.lastKitchen) {
                const kitchenDiff = Math.abs(kitchen - currentGroup.lastKitchen);
                kitchenGapOk = kitchenDiff <= (30 * 60 * 1000);
            }
            
            // Определяем причину разбиения (приоритет: время, SLA, гео, район, готовность)
            let newSplitReason = '';
            if (!timeWithinProximity) {
                newSplitReason = `Время (${Math.round(timeDiff / 60000)} мин > ${PROXIMITY_MINUTES})`;
            } else if (!deliverySpanFits) {
                newSplitReason = `SLA (${Math.round(deliverySpan / 60000)} мин > ${MAX_DELIVERY_SPAN_MINUTES})`;
            } else if (!distanceOk) {
                newSplitReason = `Гео (>${Math.round(distanceToFirst)}км > 15км)`;
            } else if (!zoneOk) {
                newSplitReason = `Район (${orderZone} ≠ ${groupZone})`;
            } else if (!isAssignedCourier && !kitchenGapOk) {
                newSplitReason = `Готовность (>30м)`;
            }
            
            if (newSplitReason === '') {
                // Все условия выполнены - добавляем заказ в текущую группу
                currentGroup.orders.push(order);
                currentGroup.windowStart = Math.min(currentGroup.windowStart, planned);
                currentGroup.windowEnd = Math.max(currentGroup.windowEnd, planned);
                currentGroup.windowLabel = formatTimeRange(currentGroup.windowStart, currentGroup.windowEnd);
                currentGroup.arrivalEnd = Math.max(currentGroup.arrivalEnd || 0, arrival);
                if (kitchen) currentGroup.lastKitchen = kitchen;
            } else {
                // Условие не выполнено - закрываем текущую группу и начинаем новую
                logger.info(`[TurboGrouping] ✂️ Split group for ${courierName}: order ${order.orderNumber || order.id} - ${newSplitReason}`);
                
                const oldGroup = currentGroup;

                // Проверяем, все ли заказы в группе завершены
                const isAllCompleted = oldGroup.orders.every(o => {
                   const s = String(o.status || '').toLowerCase();
                   return ['завершен', 'добавлен в завершенные', 'завершено', 'доставлен', 'выполнен', 'виконано', 'completed'].includes(s);
                });
                if (isAllCompleted && isAssignedCourier) oldGroup.splitReason = 'Завершён';

                groups.push(oldGroup);
                
                // Начинаем новую группу
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
                currentGroup.firstCoords = order.coords || null;
                currentGroup.firstZone = order.deliveryZone || '';
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
            const timeA = getPlannedTime(a, bDate) || a.plannedTime || 0;
            const timeB = getPlannedTime(b, bDate) || b.plannedTime || 0;
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
function groupAllOrdersByTimeWindow(orders, baseDate) {
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
        const groups = groupOrdersByTimeWindow(info.orders, normName, info.rawName, baseDate);
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
    getStableOrderId,
    haversineDistance
};
