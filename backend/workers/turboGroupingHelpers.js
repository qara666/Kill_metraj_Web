const logger = require('../src/utils/logger');

// v5.151: CRITICAL - Sync with frontend grouping logic EXACTLY (15 minutes + Geo Split)
// Constants aligned with frontend routeCalculationHelpers.ts
const PROXIMITY_MINUTES = 15;            // v5.151: Strict adherence to 15-minute wait time (not 30)
const MAX_DELIVERY_SPAN_MINUTES = 60;   
const WINDOW_MS = PROXIMITY_MINUTES * 60 * 1000; // 15 minutes in ms
const DELIVERY_SPAN_MS = MAX_DELIVERY_SPAN_MINUTES * 60 * 1000; // 60 minutes in ms

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

// Time getters - MATCH frontend exactly
function getPlannedTime(o) {
    if (o.deadlineAt && typeof o.deadlineAt === 'number') {
        const date = new Date(o.deadlineAt);
        if (date.getHours() !== 0 || date.getMinutes() !== 0) {
            return o.deadlineAt;
        }
    }
    const t = o.deliverBy || o.plannedTime || o.deliveryTime;
    return parseTimeRobust(t);
}

function parseTimeRobust(t) {
    if (!t) return null;
    if (typeof t === 'number') return t;
    if (typeof t === 'string' && t.includes(':') && !t.includes('-') && !t.includes('T')) {
        const parts = t.split(':');
        const d = new Date();
        d.setHours(parseInt(parts[0], 10), parseInt(parts[1]||'0', 10), 0, 0);
        return d.getTime();
    }
    if (typeof t === 'string') {
        const tt = new Date(t).getTime();
        return isNaN(tt) ? null : tt;
    }
    return null;
}

function getArrivalTime(o) {
    if (!o) return null;

    const status = (o.status || '').toString().trim();

    if (status === 'Доставляется' || status === 'В пути' || status === 'Исполнен') {
        if (o.statusTimings?.deliveringAt) {
            const dt = parseTimeRobust(o.statusTimings.deliveringAt);
            if (dt) return dt;
        }
        if (o.handoverAt) return o.handoverAt;
    }

    if (status === 'Собран') {
        if (o.statusTimings?.assembledAt) {
            const at = parseTimeRobust(o.statusTimings.assembledAt);
            if (at) return at;
        }
    }

    // Default fallback
    const t = o.arrivedAt || o.arrivalTime || o.creationDate || o.createdAt || o.receivedTime;
    return parseTimeRobust(t);
}

function getKitchenTime(o) {
    const t = o.kitchenTime || o.readyAt || o.cooking_time;
    if (!t) return null;
    if (typeof t === 'number') return t;
    // Handle time strings like "12:30"
    if (typeof t === 'string' && t.includes(':') && !t.includes('-') && !t.includes('T')) {
        const parts = t.split(':');
        const d = new Date();
        d.setHours(parseInt(parts[0], 10), parseInt(parts[1]||'0', 10), 0, 0);
        return d.getTime();
    }
    // Handle full date strings
    if (typeof t === 'string') {
        const tt = new Date(t).getTime();
        return isNaN(tt) ? null : tt;
    }
    return null;
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

    const WINDOW_MS = windowMinutes * 60 * 1000;
    const DELIVERY_SPAN_MS = 60 * 60 * 1000; // SLA remains 60 min for now

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
    // anchorTime is STRICTLY arrival (assignment time), ensuring 15-min stopwatch
    const ordersWithAnchor = ordersWithData.map(item => ({
        ...item,
        anchorTime: item.arrival
    }));
    
    logger.info(`[turboGroupingHelpers] 🕐 Order times (total ${ordersWithAnchor.length}):`);
    ordersWithAnchor.slice(0, 10).forEach((item, idx) => {
        const pTime = new Date(item.planned);
        const aTime = new Date(item.arrival);
        const anchor = new Date(item.anchorTime);
        logger.info(`[turboGroupingHelpers]   ${idx + 1}. ${item.order.orderNumber || item.order.id}: planned=${pTime.toISOString()}, arrival=${aTime.toISOString()}, anchor=${anchor.toISOString()}, valid=${!isNaN(item.anchorTime)}`);
    });
    if (ordersWithAnchor.length > 10) {
        logger.info(`[turboGroupingHelpers]   ... and ${ordersWithAnchor.length - 10} more orders`);
    }

    // STEP 3: Sort by anchorTime, then kitchen
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
            // Log anchor times for all orders in this courier
            logger.info(`[turboGroupingHelpers] 🔍 Order ${idx + 1}: orderNum=${item.order.orderNumber}, anchor=${new Date(item.anchorTime).toISOString()}, planned=${new Date(item.planned).toISOString()}, arrival=${new Date(item.arrival).toISOString()}`);
            
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
                const arrivedClose = diffMs <= WINDOW_MS;
                // Calculate SLA Delivery Window
                const minDelivery = Math.min(currentGroup.windowStart, item.planned);
                const maxDelivery = Math.max(currentGroup.windowEnd, item.planned);
                const deliveryFits = (maxDelivery - minDelivery) <= DELIVERY_SPAN_MS;

                // Check distance
                let distanceOk = true;
                if (item.order.coords && currentGroup.orders[0].coords) {
                    const dist = haversineDistance(
                        item.order.coords.lat, item.order.coords.lng,
                        currentGroup.orders[0].coords.lat, currentGroup.orders[0].coords.lng
                    );
                    if (dist > 15) distanceOk = false; // >15km split
                }

                // Check district
                let districtOk = true;
                const orderZone = item.order.deliveryZone || '';
                const groupZone = currentGroup.orders[0].deliveryZone || '';
                if (orderZone && groupZone && orderZone !== groupZone) {
                    districtOk = false; // separate district split
                }

                // Main split cascade logic exactly as frontend
                let isSplit = false;
                let splitReason = '';

                if (!arrivedClose) { isSplit = true; splitReason = 'Время'; }
                else if (!deliveryFits) { isSplit = true; splitReason = 'SLA'; }
                else if (!distanceOk) { isSplit = true; splitReason = 'Гео'; }
                else if (!districtOk) { isSplit = true; splitReason = 'Район'; }
                
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
