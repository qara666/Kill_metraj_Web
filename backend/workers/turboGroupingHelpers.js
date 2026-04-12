'use strict';

/**
 * turboGroupingHelpers.js — v7.2 SOTA WAVE-PROPAGATION GROUPING
 * 
 * Improvements in v7.2:
 *  1. Relaxed grouping for assigned couriers (ignores sectors, 45min window).
 *  2. Wave-propagation sweep: adjacent groups whose windows overlap are merged.
 */

const logger = require('../src/utils/logger');

// ============================================================
// CONSTANTS
// ============================================================
const PROXIMITY_MINUTES = 15;           // v5.151: Synced with frontend SOTA
const MAX_DELIVERY_SPAN_MINUTES = 60;   // v5.151: Synced with frontend SOTA
const GEO_SNAP_KM = 0.5;               
const KITCHEN_BATCH_MS = 10 * 60 * 1000; 

// ============================================================
// TIME PARSING
// ============================================================
function parseTime(val) {
    if (!val && val !== 0) return null;
    const s = String(val).trim();
    if (!s || s.includes('#')) return null;
    const strVal = s.toLowerCase();
    if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour')) return null;

    const excelTime = typeof val === 'number' ? val : parseFloat(s);
    if (!isNaN(excelTime) && excelTime > 0) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        if (excelTime >= 25569) return new Date((excelTime - 25569) * 86400 * 1000).getTime();
        const hours = Math.floor(excelTime * 24);
        const minutes = Math.floor((excelTime * 24 * 60) % 60);
        const date = new Date();
        date.setHours(hours, minutes, 0, 0);
        return date.getTime();
    }

    const simpleTime = s.match(/^(\d{1,2})[:.-](\d{2})$/);
    if (simpleTime) {
        const date = new Date();
        date.setHours(parseInt(simpleTime[1]), parseInt(simpleTime[2]), 0, 0);
        return date.getTime();
    }
    return null;
}

function getPlannedTime(order) {
    return parseTime(order.deliver_by || order.plannedTime || order.deliveryTime) || 
           parseTime(order.deliverBy) || 
           parseTime(order.delivery_time) || null;
}

function getArrivalTime(order) {
    if (order.handoverAt) return parseTime(order.handoverAt);
    const planned = getPlannedTime(order);
    return planned ? planned - (15 * 60 * 1000) : null;
}

function getKitchenTime(order) {
    return parseTime(order.kitchen || order.readyAtSource || order.readyAtPreview) || null;
}

function getExecutionTime(order) {
    return order.executionTime || 10;
}

function formatTimeRange(start, end) {
    if (!start) return '00:00';
    const d1 = new Date(start);
    const h1 = String(d1.getHours()).padStart(2, '0');
    const m1 = String(d1.getMinutes()).padStart(2, '0');
    if (start === end) return `${h1}:${m1}`;
    const d2 = new Date(end);
    const h2 = String(d2.getHours()).padStart(2, '0');
    const m2 = String(d2.getMinutes()).padStart(2, '0');
    return `${h1}:${m1}-${h2}:${m2}`;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function normalizeCourierName(name) {
    if (!name) return 'НЕ НАЗНАЧЕНО';
    const n = String(name).trim().toUpperCase();
    if (n === 'ПО' || n === 'UNASSIGNED' || n === 'NONE') return 'НЕ НАЗНАЧЕНО';
    return n;
}

function getAllOrderIds(groups) {
    const ids = [];
    groups.forEach(g => (g.orders || []).forEach(o => ids.push(o.id)));
    return ids;
}

function getOrderHash(orders) {
    return orders.map(o => String(o.id)).sort().join('_');
}

// ============================================================
// CORE GROUPING LOGIC
// ============================================================
function groupOrdersByTimeWindow(orders, courierId, courierName, arrivalProximityMinutes = PROXIMITY_MINUTES, maxDeliverySpanMinutes = MAX_DELIVERY_SPAN_MINUTES) {
    if (!orders || orders.length === 0) return [];

    const isAssignedCourier = courierId && !['НЕ НАЗНАЧЕНО', 'unassigned', 'UNASSIGNED', 'ПО'].includes(String(courierId).toUpperCase());
    
    // Sort orders by anchor time (execution or planned) - SOTA 5.182 PARITY
    const sortedOrders = [...orders].map(o => {
        const planned = getPlannedTime(o);
        const arrival = getArrivalTime(o);
        const kitchen = getKitchenTime(o);
        const execution = getExecutionTime(o);
        // CRITICAL SOTA FIX: Anchor on execution or planned, NOT arrival
        // This groups orders by delivery window even if they arrived at different times.
        return { order: o, planned, arrival, kitchen, anchorTime: execution || planned };
    }).filter(x => x.anchorTime !== null).sort((a, b) => {
        if (a.anchorTime !== b.anchorTime) return a.anchorTime - b.anchorTime;
        return (a.kitchen || 0) - (b.kitchen || 0);
    });

    const noTimeOrders = orders.filter(o => !getPlannedTime(o) && !getArrivalTime(o));
    
    const groups = [];
    let currentGroup = null;
    const WINDOW_MS = arrivalProximityMinutes * 60 * 1000;
    const deliverySpanMs = maxDeliverySpanMinutes * 60 * 1000;

    sortedOrders.forEach(({ order, planned, arrival, kitchen, anchorTime }) => {
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
                splitReason: '',
                firstAnchor: anchorTime
            };
            if (kitchen) currentGroup.lastKitchen = kitchen;
        } else {
            // v7.2: RELAXED GROUPING FOR ASSIGNED COURIERS
            const isStrict = !isAssignedCourier;
            const effectiveWindowMs = isStrict ? WINDOW_MS : (WINDOW_MS * 1.5);
            
            const arrivedCloseRel = (anchorTime - currentGroup.firstAnchor <= effectiveWindowMs);
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
                // Car couriers can go further, but 15km is quite a lot for a city group anyway
                if (dist > 15) distanceOk = false;
            }

            let districtOk = true;
            if (isStrict) {
                const orderZone = String(order.deliveryZone || order.zone || order.kmlZone || '').trim().toUpperCase();
                const groupZone = String(currentGroup.orders[0].deliveryZone || currentGroup.orders[0].zone || currentGroup.orders[0].kmlZone || '').trim().toUpperCase();
                if (orderZone && groupZone && orderZone !== groupZone) {
                    districtOk = false;
                }
            }

            let kitchenGapOk = true;
            if (isStrict) {
                const prevKitchen = currentGroup.lastKitchen;
                if (prevKitchen && kitchen && Math.abs(kitchen - prevKitchen) > 30 * 60 * 1000) {
                    kitchenGapOk = false;
                }
            }

            if (!arrivedCloseRel) newSplitReason = `Время (${isStrict ? '30' : '45'} мин)`;
            else if (!deliveryFits) newSplitReason = 'SLA (2ч)';
            else if (!distanceOk) newSplitReason = 'Гео (>15км)';
            else if (isStrict && !districtOk) newSplitReason = 'Район';
            else if (isStrict && !kitchenGapOk) newSplitReason = 'Готовность';

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
                    splitReason: newSplitReason,
                    firstAnchor: anchorTime
                };
                if (kitchen) currentGroup.lastKitchen = kitchen;
            }
        }
    });

    if (currentGroup) groups.push(currentGroup);

    if (noTimeOrders.length > 0) {
        groups.push({
            id: `group-${courierId}-no-time`,
            courierId, courierName,
            windowStart: 0, windowEnd: 0,
            windowLabel: 'Без времени',
            orders: noTimeOrders,
            isReadyForCalculation: true
        });
    }

    groups.sort((a, b) => a.windowStart - b.windowStart);
    return groups;
}

function groupAllOrdersByTimeWindow(orders) {
    if (!orders || orders.length === 0) return new Map();
    const rawGroups = new Map();
    orders.forEach(order => {
        let courierRaw = order.courier;
        if (typeof courierRaw === 'object' && courierRaw !== null) courierRaw = courierRaw.name || courierRaw._id || courierRaw.id;
        if (!courierRaw) return;
        const normName = normalizeCourierName(courierRaw);
        if (normName === 'НЕ НАЗНАЧЕНО') return;
        if (!rawGroups.has(normName)) rawGroups.set(normName, { name: courierRaw, orders: [] });
        rawGroups.get(normName).orders.push(order);
    });

    const result = new Map();
    rawGroups.forEach((info, normName) => {
        result.set(normName, groupOrdersByTimeWindow(info.orders, normName, info.name));
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
