const { sequelize } = require('../models');
const logger = require('../utils/logger');

class AnalyticsService {
    async getLogisticsOverview(startDate, endDate, divisionId = 'all') {
        try {
            const currentCache = await this._getCacheForRange(startDate, endDate, divisionId);
            
            const start = new Date(startDate);
            const end = new Date(endDate);
            const diff = end.getTime() - start.getTime();
            const prevEnd = new Date(start.getTime() - 86400000); 
            const prevStart = new Date(prevEnd.getTime() - (diff + 86400000));
            const prevCache = await this._getCacheForRange(
                prevStart.toISOString().split('T')[0], 
                prevEnd.toISOString().split('T')[0], 
                divisionId
            );

            const calculateStats = (entries) => {
                const metrics = {
                    totalOrders: 0,
                    completedOrders: 0,
                    onTimeCount: 0,
                    failedOrders: 0,
                    totalDistance: 0,
                    totalDeliveryTime: 0, 
                    timedOrdersCount: 0,
                    totalAmount: 0,
                    couriersMap: {},
                    zonesMap: {},
                    hourly: Array(24).fill(0),
                    heatmap: Array(7).fill(0).map(() => Array(24).fill(0)),
                    dayOfWeek: ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'].map(d => ({ name: d, orders: 0, dist: 0, amount: 0 })),
                    statusDist: {},
                    sla: { fast: 0, medium: 0, slow: 0, critical: 0 },
                    clients: {},
                    days: new Set()
                };

                const parseDateTime = (val, baseDateStr) => {
                    if (!val) return null;
                    let d = new Date(val);
                    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return d;
                    
                    if (typeof val === 'string') {
                        const ddmmSlash = val.match(/(\d{2})[./](\d{2})[./](\d{4})\s+(\d{1,2}):(\d{2})/);
                        if (ddmmSlash) {
                            const [_, dd, mm, yyyy, h, m] = ddmmSlash;
                            return new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd), parseInt(h), parseInt(m), 0, 0);
                        }
                        const match = val.match(/(\d{1,2}):(\d{2}):?(\d{2})?/);
                        if (match) {
                            const [_, h, m, s] = match;
                            const final = new Date(baseDateStr);
                            final.setHours(parseInt(h), parseInt(m), parseInt(s || '0'), 0);
                            return final;
                        }
                    }
                    return null;
                };

                entries.forEach(entry => {
                    const payload = typeof entry.payload === 'string' ? JSON.parse(entry.payload) : entry.payload;
                    if (!payload) return;

                    const dateStr = entry.target_date;
                    const dateObj = new Date(dateStr);
                    const dow = isNaN(dateObj.getTime()) ? 1 : dateObj.getDay();
                    metrics.days.add(dateStr);
                    
                    const orders = payload.orders || [];
                    const couriers = payload.couriers || [];

                    orders.forEach(o => {
                        metrics.totalOrders++;
                        metrics.dayOfWeek[dow].orders++;
                        const amt = parseFloat(o.amount || o.totalAmount || o.orderSum || 0);
                        metrics.totalAmount += amt;
                        metrics.dayOfWeek[dow].amount += amt;
                        
                        const client = o.clientName || o.phone || 'Anonymous';
                        metrics.clients[client] = (metrics.clients[client] || 0) + 1;

                        // 🔍 UPDATED ZONE EXTRACTION (Prioritizing 'deliveryZone' as requested)
                        // v8.1: Cleaned up the fallback to prioritize specific FO sector/zone fields over general addresses/areas
                        let zoneRaw = (o.deliveryZone || o.deliveryZoneName || o.zoneName || o.sector || o.zone || o.area || 'БЕЗ ЗОНЫ').toString().trim();
                        
                        if (zoneRaw === '0' || o.deliveryZoneId === 0 || o.deliveryZoneId === '0' || o.orderType === 'Самовывоз') {
                            zoneRaw = 'САМОВЫВОЗ';
                        }
                        
                        const zone = zoneRaw.toUpperCase();

                        if (!metrics.zonesMap[zone]) {
                            metrics.zonesMap[zone] = { 
                                name: zone, orders: 0, onTime: 0, deliveryTime: 0, timed: 0, amount: 0, 
                                hourly: Array(24).fill(0), 
                                topCouriers: {} 
                            };
                        }
                        metrics.zonesMap[zone].orders++;
                        metrics.zonesMap[zone].amount += amt;

                        const s = o.status || 'Unknown';
                        metrics.statusDist[s] = (metrics.statusDist[s] || 0) + 1;

                        const created = parseDateTime(o.creationDate || o.orderTime || o.order_time || o.createdAt || o.created || o.time || o.kitchenTime, dateStr);
                        if (created) {
                            const hour = created.getHours();
                            metrics.hourly[hour]++;
                            metrics.heatmap[dow][hour]++;
                            metrics.zonesMap[zone].hourly[hour]++;
                        }

                        if (s === 'Исполнен' || s === 'Выполнен' || s === 'Доставлен') {
                            metrics.completedOrders++;
                            const settled = parseDateTime(o.settledDate || o.updatedAt || o.settledTime || o.deliveredTime || o.delivered_at || o.deliveredAt, dateStr);
                            
                            if (created && settled && settled > created) {
                                const mins = (settled.getTime() - created.getTime()) / 60000;
                                if (mins < 300) {
                                    metrics.totalDeliveryTime += mins;
                                    metrics.timedOrdersCount++;
                                    metrics.zonesMap[zone].deliveryTime += mins;
                                    metrics.zonesMap[zone].timed++;

                                    if (mins <= 45) metrics.sla.fast++;
                                    else if (mins <= 75) metrics.sla.medium++;
                                    else if (mins <= 120) metrics.sla.slow++;
                                    else metrics.sla.critical++;
                                }
                            }
                        } else if (s === 'Отменен' || s === 'Удален') {
                            metrics.failedOrders++;
                        }

                        const cRaw = (o.courier || '').toString().trim().toUpperCase();
                        const cName = (cRaw === 'ID:0' || cRaw === '0') ? 'НЕ НАЗНАЧЕНО' : cRaw;
                        
                        if (cName) {
                            if (!metrics.couriersMap[cName]) {
                                metrics.couriersMap[cName] = { name: (cName === 'НЕ НАЗНАЧЕНО' ? 'Не назначено' : o.courier), orders: 0, distance: 0, days: new Set(), success: 0, amount: 0 };
                            }
                            metrics.couriersMap[cName].orders++;
                            metrics.couriersMap[cName].amount += amt;
                            metrics.couriersMap[cName].days.add(dateStr);
                            if (s === 'Исполнен' || s === 'Выполнен') metrics.couriersMap[cName].success++;
                            metrics.zonesMap[zone].topCouriers[cName] = (metrics.zonesMap[zone].topCouriers[cName] || 0) + 1;
                        }
                    });

                    couriers.forEach(c => {
                        const cName = (c.name || c.courierName || '').toString().trim().toUpperCase();
                        if (cName && metrics.couriersMap[cName]) {
                            const dist = parseFloat(c.distanceKm || c.distance_km || 0);
                            metrics.couriersMap[cName].distance += dist;
                            metrics.totalDistance += dist;
                            metrics.dayOfWeek[dow].dist += dist;
                        }
                    });
                });

                return metrics;
            };

            const current = calculateStats(currentCache);
            const previous = calculateStats(prevCache);

            const totalDays = current.days.size || 1;
            const avgDeliveryTime = current.timedOrdersCount > 0 ? (current.totalDeliveryTime / current.timedOrdersCount).toFixed(1) : 0;
            const avgOrderValue = current.totalOrders > 0 ? (current.totalAmount / current.totalOrders).toFixed(0) : 0;
            
            const revenuePerKm = current.totalDistance > 0 ? (current.totalAmount / current.totalDistance).toFixed(1) : 0;
            const getChange = (curr, prev) => (prev > 0 ? (((curr - prev) / prev) * 100).toFixed(1) : 0);

            return {
                summary: {
                    totalOrders: current.totalOrders,
                    completedOrders: current.completedOrders,
                    onTimeRate: current.completedOrders > 0 ? ((current.onTimeCount / current.completedOrders) * 100).toFixed(1) : 100,
                    failedRate: current.totalOrders > 0 ? ((current.failedOrders / current.totalOrders) * 100).toFixed(1) : 0,
                    avgDeliveryTime,
                    totalDistance: current.totalDistance.toFixed(1),
                    avgEfficiency: current.totalDistance > 0 ? (current.totalOrders / current.totalDistance).toFixed(2) : 0,
                    activeCouriers: Object.keys(current.couriersMap).length,
                    totalAmount: current.totalAmount.toFixed(0),
                    revenuePerKm,
                    avgOrderValue,
                    totalDays
                },
                wow: {
                    ordersChange: getChange(current.totalOrders, previous.totalOrders),
                    revenueChange: getChange(current.totalAmount, previous.totalAmount),
                    efficiencyChange: getChange(current.totalDistance > 0 ? (current.totalOrders / current.totalDistance) : 0, previous.totalDistance > 0 ? (previous.totalOrders / previous.totalDistance) : 0),
                    timeChange: getChange(parseFloat(avgDeliveryTime), previous.timedOrdersCount > 0 ? (previous.totalDeliveryTime / previous.timedOrdersCount) : 0)
                },
                slaDistribution: [
                    { name: '45м (Экспресс)', value: current.sla.fast, color: '#10b981' },
                    { name: '75м (Норма)', value: current.sla.medium, color: '#3b82f6' },
                    { name: '120м (Задержка)', value: current.sla.slow, color: '#f59e0b' },
                    { name: '>120м (Критично)', value: current.sla.critical, color: '#ef4444' }
                ],
                zones: Object.values(current.zonesMap).map(z => ({
                    ...z,
                    onTime: z.orders > 0 ? ((z.onTime / z.orders) * 100).toFixed(1) : 100,
                    avgTime: z.timed > 0 ? (z.deliveryTime / z.timed).toFixed(1) : 0,
                    revenue: z.amount.toFixed(0),
                    topCouriers: Object.entries(z.topCouriers).sort((a,b) => b[1] - a[1]).slice(0, 3).map(([name, count]) => ({ name, count }))
                })).sort((a,b) => b.orders - a.orders),
                dayOfWeek: current.dayOfWeek.map(d => ({ ...d, efficiency: d.dist > 0 ? (d.orders / d.dist).toFixed(2) : 0, amount: d.amount.toFixed(0) })),
                heatmap: current.heatmap,
                couriers: Object.values(current.couriersMap).map(c => ({
                    name: c.name,
                    totalOrders: c.orders,
                    totalDistance: c.distance.toFixed(1),
                    efficiency: c.distance > 0 ? (c.orders / c.distance).toFixed(2) : 0,
                    successRate: c.orders > 0 ? ((c.success / c.orders) * 100).toFixed(1) : 0,
                    revenue: parseInt(c.amount).toFixed(0), // Fix for long numbers
                    revPerKm: c.distance > 0 ? (c.amount / c.distance).toFixed(1) : 0
                })).sort((a,b) => b.totalOrders - a.totalOrders),
                hourly: current.hourly.map((count, hour) => ({ hour: String(hour).padStart(2, '0'), count })),
                statusDistribution: Object.keys(current.statusDist).map(s => ({ name: s, value: current.statusDist[s] })),
                trends: await this._getDailyTrendData(currentCache)
            };

        } catch (error) {
            logger.error('[AnalyticsService] Error:', error.message);
            throw error;
        }
    }

    async _getDailyTrendData(entries) {
        const trends = {};
        entries.forEach(e => {
            const p = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload;
            const date = e.target_date;
            if (!trends[date]) trends[date] = { date, orders: 0, distance: 0, amount: 0 };
            trends[date].orders += (p.orders || []).length;
            (p.orders || []).forEach(o => trends[date].amount += (parseFloat(o.amount || o.totalAmount || o.orderSum) || 0));
            (p.couriers || []).forEach(c => trends[date].distance += (parseFloat(c.distanceKm || c.distance_km || 0)));
        });
        return Object.values(trends).map(t => ({
            ...t,
            efficiency: t.distance > 0 ? (t.orders / t.distance).toFixed(2) : 0,
            revenue: t.amount.toFixed(0)
        }));
    }

    async _getCacheForRange(start, end, divId) {
        const whereClause = divId === 'all' 
            ? 'target_date BETWEEN :start AND :end'
            : 'target_date BETWEEN :start AND :end AND division_id = :divId';
        
        return sequelize.query(
            `SELECT target_date, payload FROM api_dashboard_cache WHERE ${whereClause} ORDER BY target_date ASC`,
            { replacements: { start, end, divId: String(divId) }, type: sequelize.QueryTypes.SELECT }
        );
    }
}

module.exports = new AnalyticsService();
