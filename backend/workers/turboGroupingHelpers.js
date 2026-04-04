const logger = require('../src/utils/logger');

// v5.170: CRITICAL - Sync with frontend grouping logic EXACTLY
// Constants MUST match frontend routeCalculationHelpers.ts
const PROXIMITY_MINUTES = 15;            // Strict 15-minute window from first order arrival
const MAX_DELIVERY_SPAN_MINUTES = 60;    // v5.170: Match frontend — 60 min (NOT 120!)
const WINDOW_MS = PROXIMITY_MINUTES * 60 * 1000;
const DELIVERY_SPAN_MS = MAX_DELIVERY_SPAN_MINUTES * 60 * 1000;

// v5.151: Add haversineDistance for Geographic splitting matching frontend
function haversineDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}
// v5.142: Helper to extract ALL possible IDs from an order for deduplication
function getAllOrderIds(order) {
    const ids = new Set();
    if (order.id) ids.add(String(order.id));
    if (order.orderNumber) ids.add(String(order.orderNumber));
    if (order._id) ids.add(String(order._id));
    if (order.raw?.id) ids.add(String(order.raw.id));
    return ids;
}

// v5.144: Create content hash for order (catches same order with different IDs)
function getOrderHash(o) {
    const parts = [
        String(o.courier || '').toUpperCase().trim(),
        String(o.address || '').toLowerCase().trim(),
        String(o.deliverBy || o.plannedTime || o.deliveryTime || ''),
        String(o.orderNumber || '')
    ];
    return parts.join('|');
}

// v5.148: Fixed to match frontend - use "НЕ НАЗНАЧЕНО" (uppercase)
function normalizeCourierName(name) {
    if (!name) return '';
    const n = name.toString().trim().replace(/\s+/g, ' ').toUpperCase();
    if (!n || n === 'ID:0' || n.includes('НЕ НАЗНАЧЕН') || n.includes('НЕНАЗНАЧЕН')) return 'НЕ НАЗНАЧЕНО';
    return n;
}

// v5.170: getPlannedTime, getArrivalTime, getKitchenTime — match frontend timeUtils.ts EXACTLY

function parseTime(val, options = {}) {
    if (!val && val !== 0) return null;
    const s = String(val).trim();
    if (!s || s.includes('#')) return null;

    const strVal = s.toLowerCase();
    if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour')) {
        return null;
    }

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

    const d = new Date(s);
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
        return d.getTime();
    }

    return null;
}

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
            if (typeof val === 'string' && (val === '00:00' || val === '00:00:00')) {
                continue;
            }
            const parsed = parseTime(val, { baseDate });
            if (parsed) return parsed;
        }
    }
    return null;
}

function getArrivalTime(o, baseDate) {
    if (!o) return null;

    const status = (o.status || '').toString().trim();
    if (status === 'Доставляется' || status === 'В пути' || status === 'Исполнен') {
        if (o.statusTimings?.deliveringAt) {
            const dt = parseTime(o.statusTimings.deliveringAt, { baseDate });
            if (dt) return dt;
        }
        if (o.handoverAt) return o.handoverAt;
    }

    if (status === 'Собран') {
        if (o.statusTimings?.assembledAt) {
            const at = parseTime(o.statusTimings.assembledAt, { baseDate });
            if (at) return at;
        }
    }

    if (o.createdAt && typeof o.createdAt === 'number') return o.createdAt;

    for (const field of ARRIVAL_TIME_FIELDS) {
        const val = o[field] ?? o.raw?.[field];
        if (val !== undefined && val !== null) {
            const parsed = parseTime(val, { baseDate });
            if (parsed) return parsed;
        }
    }

    return getKitchenTime(o, baseDate);
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

/**
 * CRITICAL v5.146: Rewrite grouping to match frontend EXACTLY
 * Uses arrival time for window grouping, not planned time
 */
// v5.153: Changed to 15 minutes as per user strict requirement
function groupOrdersByTimeWindowFrontend(orders, windowMinutes = 15) {
    if (!orders || orders.length === 0) return [];

    const LOCAL_WINDOW_MS = windowMinutes * 60 * 1000;
    const LOCAL_DELIVERY_SPAN_MS = 60 * 60 * 1000; // Match frontend EXACTLY: 60 min delivery window (not 120!)

    // STEP 0: Global deduplication (v5.149 - CRITICAL: orderNumber as PRIMARY key)
    // Same orderNumber = same order, regardless of ID
    const seenOrderNumbers = new Set();
    const seenIds = new Set();
    const uniqueOrders = [];
    let dupByOrderNum = 0, dupById = 0;
    
    for (const o of orders) {
        const orderNum = String(o.orderNumber || '');
        const allIds = getAllOrderIds(o);
        
        let isDuplicate = false;
        
        // PRIMARY: Check orderNumber first (most reliable)
        if (orderNum && seenOrderNumbers.has(orderNum)) {
            isDuplicate = true;
            dupByOrderNum++;
        }
        
        // SECONDARY: Check IDs
        if (!isDuplicate) {
            for (const id of allIds) {
                if (id && seenIds.has(id)) {
                    isDuplicate = true;
                    dupById++;
                    break;
                }
            }
        }
        
        if (isDuplicate) continue;
        
        // Mark as seen
        if (orderNum) seenOrderNumbers.add(orderNum);
        for (const id of allIds) {
            if (id) seenIds.add(id);
        }
        uniqueOrders.push(o);
    }
    
    if (dupByOrderNum > 0 || dupById > 0) {
        logger.info(`[turboGroupingHelpers] 🧊 Dedup: ${dupByOrderNum} by orderNumber + ${dupById} by ID, kept ${uniqueOrders.length}`);
    }

    const noTimeOrders = [];
    const ordersWithData = [];

    // Parse times for all orders
    uniqueOrders.forEach(order => {
        let plannedTime = getPlannedTime(order);
        const kitchenTime = getKitchenTime(order);
        let arrivalTime = getArrivalTime(order);

        // If no arrival time, use planned or kitchen time
        if (!arrivalTime) {
            arrivalTime = plannedTime || kitchenTime;
        }

        // If no planned time, use kitchen + 60 min or arrival + 30 min
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
            kitchen: kitchenTime || undefined
        });
    });

    // STEP 1: Add anchorTime (MATCHES FRONTEND EXACTLY)
    // Frontend ALWAYS uses item.arrival as anchorTime (line 269-271 of routeCalculationHelpers.ts)
    // NO bulk import detection at this level - the frontend doesn't do it
    const ordersWithAnchor = ordersWithData.map(item => ({
        ...item,
        anchorTime: item.arrival
    }));
    
    logger.info(`[turboGroupingHelpers] 🕐 Order times (total ${ordersWithAnchor.length})`);

    // STEP 2: Sort by anchorTime, then kitchen
    ordersWithAnchor.sort((a, b) => {
        if (a.anchorTime !== b.anchorTime) return a.anchorTime - b.anchorTime;
        return (a.kitchen || 0) - (b.kitchen || 0);
    });

    // STEP 4: Group by courier (SKIP "Не назначено" / "НЕНАЗНАЧЕННЫЕ")
    const courierGroups = new Map();
    ordersWithAnchor.forEach(item => {
        let courierRaw = (item.order.courier || '').toString().trim();
        if (!courierRaw) courierRaw = 'Не назначено';
        const courier = normalizeCourierName(courierRaw);
        
        // CRITICAL: Skip unassigned - they are containers, not real couriers
        if (courier === 'НЕ НАЗНАЧЕНО') return;
        
        if (!courierGroups.has(courier)) courierGroups.set(courier, []);
        courierGroups.get(courier).push(item);
    });

    // STEP 5: Create blocks for each courier
    const blocks = [];

    courierGroups.forEach((list, courierName) => {
        if (list.length === 0) return;
        
        logger.info(`[turboGroupingHelpers] 📦 Courier ${courierName}: ${list.length} orders to group`);
        if (list.length <= 5) {
            list.forEach((item, idx) => {
                logger.info(`[turboGroupingHelpers]   Order ${idx + 1}: planned=${new Date(item.planned).toLocaleTimeString()}, arrival=${new Date(item.arrival).toLocaleTimeString()}, anchor=${new Date(item.anchorTime).toLocaleTimeString()}`);
            });
        } else {
            logger.info(`[turboGroupingHelpers]   First: planned=${new Date(list[0].planned).toLocaleTimeString()}, anchor=${new Date(list[0].anchorTime).toLocaleTimeString()}`);
            logger.info(`[turboGroupingHelpers]   Last: planned=${new Date(list[list.length-1].planned).toLocaleTimeString()}, anchor=${new Date(list[list.length-1].anchorTime).toLocaleTimeString()}`);
        }

        let currentGroup = null;
        let groupIndex = 0;

        list.forEach((item, idx) => {
            if (!currentGroup) {
                // Create first group
                currentGroup = {
                    courierName,
                    orders: [item.order],
                    windowStart: item.planned,
                    windowEnd: item.planned,
                    arrivalEnd: item.arrival,
                    firstAnchor: item.anchorTime,
                    lastKitchen: item.kitchen
                };
                logger.info(`[turboGroupingHelpers] 🆕 Starting block 1 with first order anchor=${new Date(item.anchorTime).toISOString()}`);
            } else {
                // Check if order fits in current group (by anchorTime)
                const firstAnchor = currentGroup.firstAnchor || currentGroup.windowStart;
                const diffMs = item.anchorTime - firstAnchor;
                const diffMin = Math.round(diffMs / 1000 / 60);
                const arrivedClose = diffMs <= LOCAL_WINDOW_MS;

                // Calculate SLA Delivery Window
                const minDelivery = Math.min(currentGroup.windowStart, item.planned);
                const maxDelivery = Math.max(currentGroup.windowEnd, item.planned);
                const deliveryFits = (maxDelivery - minDelivery) <= LOCAL_DELIVERY_SPAN_MS;

                // Check distance (15km threshold)
                let distanceOk = true;
                if (item.order.coords && currentGroup.orders[0].coords) {
                    const dist = haversineDistance(
                        item.order.coords.lat, item.order.coords.lng,
                        currentGroup.orders[0].coords.lat, currentGroup.orders[0].coords.lng
                    );
                    if (dist > 15) distanceOk = false;
                }

                // Check district
                let districtOk = true;
                const orderZone = item.order.deliveryZone || '';
                const groupZone = currentGroup.orders[0].deliveryZone || '';
                if (orderZone && groupZone && orderZone !== groupZone) {
                    districtOk = false;
                }

                // v5.170: Kitchen gap check — only for unassigned couriers (matching frontend)
                let kitchenGapOk = true;
                if (courierName === 'НЕ НАЗНАЧЕНО') {
                    const prevKitchen = currentGroup.lastKitchen;
                    if (prevKitchen && item.kitchen && Math.abs(item.kitchen - prevKitchen) > 30 * 60 * 1000) {
                        kitchenGapOk = false;
                    }
                }

                // Main split cascade: Время -> SLA -> Гео -> Район -> Готовность
                let isSplit = false;
                let splitReason = '';

                if (!arrivedClose) { isSplit = true; splitReason = 'Время'; }
                else if (!deliveryFits) { isSplit = true; splitReason = 'SLA'; }
                else if (!distanceOk) { isSplit = true; splitReason = 'Гео'; }
                else if (!districtOk) { isSplit = true; splitReason = 'Район'; }
                else if (courierName === 'НЕ НАЗНАЧЕНО' && !kitchenGapOk) { isSplit = true; splitReason = 'Готовность'; }
                
                logger.info(`[turboGroupingHelpers] 📊 Order ${idx + 1}: diff=${diffMin}min, split=${isSplit}, reason=${splitReason}`);

                if (!isSplit) {
                    // Add to current group
                    currentGroup.orders.push(item.order);
                    currentGroup.windowStart = Math.min(currentGroup.windowStart, item.planned);
                    currentGroup.windowEnd = Math.max(currentGroup.windowEnd, item.planned);
                    currentGroup.arrivalEnd = Math.max(currentGroup.arrivalEnd || 0, item.arrival);
                    if (item.kitchen) currentGroup.lastKitchen = item.kitchen;
                } else {
                    // Flush current group and start new one
                    const label = formatTimeRange(currentGroup.windowStart, currentGroup.windowEnd);
                    logger.info(`[turboGroupingHelpers] 🚀 Block ${blocks.length + 1} for ${courierName}: ${currentGroup.orders.length} orders (${label})`);
                    blocks.push({
                        courierName,
                        windowStart: currentGroup.windowStart,
                        windowEnd: currentGroup.windowEnd,
                        windowLabel: label,
                        orders: [...currentGroup.orders]
                    });
                    
                    // Start new group
                    currentGroup = {
                        courierName,
                        orders: [item.order],
                        windowStart: item.planned,
                        windowEnd: item.planned,
                        arrivalEnd: item.arrival,
                        firstAnchor: item.anchorTime,
                        lastKitchen: item.kitchen
                    };
                    logger.info(`[turboGroupingHelpers] 🆕 Starting new block with anchor=${new Date(item.anchorTime).toLocaleTimeString()}`);
                    groupIndex++;
                }
            }
        });

        // Flush last group
        if (currentGroup && currentGroup.orders.length > 0) {
            const label = formatTimeRange(currentGroup.windowStart, currentGroup.windowEnd);
            logger.info(`[turboGroupingHelpers] 🚀 Final block for ${courierName}: ${currentGroup.orders.length} orders (${label})`);
            blocks.push({
                courierName,
                windowStart: currentGroup.windowStart,
                windowEnd: currentGroup.windowEnd,
                windowLabel: label,
                orders: currentGroup.orders
            });
        }
        
        logger.info(`[turboGroupingHelpers] ✅ Total blocks for ${courierName}: ${blocks.filter(b => b.courierName === courierName).length}`);
    });

    // Add no-time orders as separate block
    if (noTimeOrders.length > 0) {
        blocks.push({
            courierName: 'NO_TIME',
            windowStart: 0,
            windowEnd: 0,
            windowLabel: 'Без времени',
            orders: noTimeOrders
        });
    }

    logger.info(`[turboGroupingHelpers] 📊 SUMMARY: ${blocks.length} total blocks created`);
    blocks.slice(0, 10).forEach((b, i) => {
        logger.info(`[turboGroupingHelpers]   Block ${i + 1}: ${b.courierName} - ${b.orders.length} orders (${b.windowLabel})`);
    });
    if (blocks.length > 10) {
        logger.info(`[turboGroupingHelpers]   ... and ${blocks.length - 10} more blocks`);
    }

    return blocks;
}

function dedupeOrders(orders) {
    // v5.149: orderNumber as PRIMARY deduplication key
    const seenOrderNumbers = new Set();
    const seenIds = new Set();
    const out = [];
    for (const o of orders) {
        const orderNum = String(o.orderNumber || '');
        const allIds = getAllOrderIds(o);
        
        // Check orderNumber first (primary key)
        if (orderNum && seenOrderNumbers.has(orderNum)) continue;
        
        // Check IDs
        let isDuplicate = false;
        for (const id of allIds) {
            if (id && seenIds.has(id)) {
                isDuplicate = true;
                break;
            }
        }
        if (isDuplicate) continue;
        
        if (orderNum) seenOrderNumbers.add(orderNum);
        for (const id of allIds) {
            if (id) seenIds.add(id);
        }
        out.push(o);
    }
    return out;
}

function groupAllOrdersByTimeWindow(orders) {
    const rawGroups = new Map();

    orders.forEach(order => {
        let courierName = order.courier;
        if (typeof courierName === 'object' && courierName !== null) {
            courierName = courierName.name || courierName._id || courierName.id;
        }
        
        const normName = normalizeCourierName(courierName);
        if (normName === 'НЕ НАЗНАЧЕНО') return; // Skip unassigned
        
        if (!rawGroups.has(normName)) rawGroups.set(normName, { name: courierName, orders: [] });
        rawGroups.get(normName).orders.push(order);
    });

    const result = new Map();
    rawGroups.forEach((info, normName) => {
        const timeGroups = groupOrdersByTimeWindowFrontend(info.orders, 15);
        result.set(normName, timeGroups);
    });

    return result;
}

module.exports = { groupAllOrdersByTimeWindow, groupOrdersByTimeWindowFrontend, normalizeCourierName };
