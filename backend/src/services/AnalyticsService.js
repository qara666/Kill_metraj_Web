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
                    revenue: parseInt(c.amount).toFixed(0),
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

    // ============================================
    // COURIER EFFICIENCY METHODS
    // ============================================
    
    async _parseHour(dateTimeStr, baseDateStr) {
        if (!dateTimeStr) return null;
        const match = String(dateTimeStr).match(/(\d{1,2}):(\d{2})/);
        if (match) return parseInt(match[1]);
        const d = new Date(dateTimeStr);
        if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return d.getHours();
        return null;
    }

    async getCourierEfficiency(date, courierId = null) {
        const cache = await this._getCacheForRange(date, date, 'all');
        const couriersMap = {};

        for (const entry of cache) {
            const payload = typeof entry.payload === 'string' ? JSON.parse(entry.payload) : entry.payload;
            if (!payload) continue;

            const orders = payload.orders || [];
            const couriers = payload.couriers || [];

            for (const o of orders) {
                const cName = (o.courier || '').toString().trim();
                if (!cName || cName === '0' || cName === 'ID:0') continue;
                if (courierId && cName !== courierId) continue;

                if (!couriersMap[cName]) {
                    couriersMap[cName] = { name: cName, orders: 0, hours: new Set() };
                }
                couriersMap[cName].orders++;

                const hour = await this._parseHour(o.creationDate || o.orderTime, date);
                if (hour !== null) couriersMap[cName].hours.add(hour);
            }

            for (const c of couriers) {
                const cName = (c.name || c.courierName || '').toString().trim();
                if (!cName || !couriersMap[cName]) continue;

                const startHour = await this._parseHour(c.shiftStart || c.startTime, date);
                const endHour = await this._parseHour(c.shiftEnd || c.endTime, date);
                if (startHour !== null && endHour !== null) {
                    for (let h = startHour; h <= endHour; h++) {
                        if (h < 24) couriersMap[cName].hours.add(h);
                    }
                }
            }
        }

        return Object.values(couriersMap).map(c => ({
            name: c.name,
            totalOrders: c.orders,
            hoursWorked: c.hours.size || 1,
            efficiency: (c.orders / (c.hours.size || 1)).toFixed(2)
        }));
    }

    async getHourlyEfficiency(date) {
        const cache = await this._getCacheForRange(date, date, 'all');
        const couriersData = {};

        for (const entry of cache) {
            const payload = typeof entry.payload === 'string' ? JSON.parse(entry.payload) : entry.payload;
            if (!payload) continue;

            const orders = payload.orders || [];

            for (const o of orders) {
                const courierName = (o.courier || '').toString().trim();
                if (!courierName || courierName === '0' || courierName === 'ID:0') continue;

                const hour = await this._parseHour(o.creationDate || o.orderTime || o.order_time || o.createdAt, date);
                if (hour === null) continue;

                if (!couriersData[courierName]) {
                    couriersData[courierName] = {
                        name: courierName,
                        hourlyOrders: Array(24).fill(0),
                        totalOrders: 0,
                        hoursWorked: new Set()
                    };
                }

                couriersData[courierName].hourlyOrders[hour]++;
                couriersData[courierName].totalOrders++;
                couriersData[courierName].hoursWorked.add(hour);
            }
        }

        const result = Object.values(couriersData).map(c => {
            const hoursWorked = c.hourlyOrders.filter(o => o > 0).length || c.hoursWorked.size || 1;
            const ordersPerHour = (c.totalOrders / hoursWorked).toFixed(2);
            
            return {
                name: c.name,
                totalOrders: c.totalOrders,
                hoursWorked,
                avgOrdersPerHour: parseFloat(ordersPerHour),
                efficiency: parseFloat(ordersPerHour),
                hourlyBreakdown: c.hourlyOrders.map((count, hour) => ({ 
                    hour: String(hour).padStart(2, '0'), 
                    orders: count 
                }))
            };
        });

        return {
            date,
            couriers: result.sort((a, b) => b.totalOrders - a.totalOrders),
            totalOrders: result.reduce((sum, c) => sum + c.totalOrders, 0),
            avgEfficiency: result.length > 0 
                ? (result.reduce((sum, c) => sum + c.efficiency, 0) / result.length).toFixed(2)
                : '0'
        };
    }

    async getOrderDynamics(startDate, endDate) {
        const cache = await this._getCacheForRange(startDate, endDate, 'all');
        
        const dailyStats = {};
        const hourlyTotals = Array(24).fill(0);

        for (const entry of cache) {
            const payload = typeof entry.payload === 'string' ? JSON.parse(entry.payload) : entry.payload;
            const date = entry.target_date;
            
            if (!dailyStats[date]) {
                dailyStats[date] = {
                    date,
                    totalOrders: 0,
                    hourlyOrders: Array(24).fill(0),
                    completedOrders: 0,
                    failedOrders: 0
                };
            }

            if (!payload || !payload.orders) continue;

            for (const o of payload.orders) {
                const hour = await this._parseHour(o.creationDate || o.orderTime || o.order_time, date);
                if (hour !== null) {
                    dailyStats[date].hourlyOrders[hour]++;
                    hourlyTotals[hour]++;
                    dailyStats[date].totalOrders++;
                }

                const status = o.status || '';
                if (status === 'Исполнен' || status === 'Выполнен' || status === 'Доставлен') {
                    dailyStats[date].completedOrders++;
                } else if (status === 'Отменен' || status === 'Удален') {
                    dailyStats[date].failedOrders++;
                }
            }
        }

        const sortedDays = Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date));

        const trend = this._calcTrend(sortedDays.map(d => d.totalOrders));

        return {
            period: { startDate, endDate },
            days: sortedDays.map(d => ({
                date: d.date,
                totalOrders: d.totalOrders,
                completedOrders: d.completedOrders,
                failedOrders: d.failedOrders,
                hourlyOrders: d.hourlyOrders.map((count, hour) => ({
                    hour: String(hour).padStart(2, '0'),
                    orders: count
                }))
            })),
            hourlyAverages: hourlyTotals.map((count, hour) => ({
                hour: String(hour).padStart(2, '0'),
                avgOrders: count / Math.max(sortedDays.length, 1)
            })),
            trend,
            summary: {
                totalDays: sortedDays.length,
                totalOrders: sortedDays.reduce((sum, d) => sum + d.totalOrders, 0),
                avgOrdersPerDay: sortedDays.length > 0 
                    ? (sortedDays.reduce((sum, d) => sum + d.totalOrders, 0) / sortedDays.length).toFixed(1)
                    : '0',
                peakHour: this._findPeakHour(hourlyTotals),
                lowestHour: this._findLowestHour(hourlyTotals)
            }
        };
    }

    async getSmartMonitoring(date, options = {}) {
        const {
            minEfficiencyThreshold = 1.5,
            earlyReleaseThreshold = 0.8
        } = options;

        const hourlyEfficiency = await this.getHourlyEfficiency(date);
        const orderDynamics = await this.getOrderDynamics(date, date);

        const lowPerformers = [];
        const optimalSendingHome = [];

        for (const courier of hourlyEfficiency.couriers) {
            const efficiency = courier.efficiency;
            
            if (efficiency < minEfficiencyThreshold) {
                lowPerformers.push({
                    name: courier.name,
                    efficiency,
                    totalOrders: courier.totalOrders,
                    hoursWorked: courier.hoursWorked,
                    recommendation: efficiency < earlyReleaseThreshold 
                        ? 'Отправить домой раньше'
                        : 'Наблюдать'
                });

                if (efficiency < earlyReleaseThreshold && courier.hoursWorked >= 3) {
                    optimalSendingHome.push({
                        name: courier.name,
                        currentHour: new Date().getHours(),
                        suggestedReleaseHour: Math.min(new Date().getHours() + 1, 23),
                        reason: `Эффективность ${efficiency} заказов/час ниже порога ${earlyReleaseThreshold}`,
                        savedHours: Math.max(0, 8 - courier.hoursWorked)
                    });
                }
            }
        }

        const currentHour = new Date().getHours();
        const currentHourData = orderDynamics.days[0]?.hourlyOrders || [];
        const currentHourOrders = currentHourData[currentHour]?.orders || 0;

        // Use hourlyAverages from orderDynamics (not from hourlyEfficiency)
        const remainingHours = Array(24).fill(0).map((_, i) => i > currentHour ? orderDynamics.hourlyAverages[i]?.avgOrders || 0 : 0);
        const predictedRemaining = remainingHours.reduce((a, b) => a + b, 0);

        return {
            timestamp: new Date().toISOString(),
            date,
            currentHour,
            currentHourOrders,
            averageEfficiency: hourlyEfficiency.avgEfficiency,
            couriersCount: hourlyEfficiency.couriers.length,
            lowPerformers,
            recommendations: [],
            optimalSendingHome,
            forecast: {
                predictedOrdersRemaining: predictedRemaining.toFixed(1),
                currentTrend: currentHourOrders > (orderDynamics.hourlyAverages[currentHour]?.avgOrders || 0) ? 'GROWING' : 'DECLINING',
                shouldSendHome: optimalSendingHome.length > 0,
                action: optimalSendingHome.length > 0 
                    ? `${optimalSendingHome.length} курьеров можно отправить домой раньше`
                    : 'Все курьеры работают нормально'
            },
            thresholds: {
                minEfficiency: minEfficiencyThreshold,
                earlyRelease: earlyReleaseThreshold
            }
        };
    }

    _calcTrend(values) {
        if (values.length < 2) return 'STABLE';
        
        const recent = values.slice(-3);
        const older = values.slice(0, -3);
        
        if (recent.length === 0 || older.length === 0) return 'STABLE';
        
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        
        const diff = ((recentAvg - olderAvg) / olderAvg) * 100;
        
        if (diff > 10) return 'GROWING';
        if (diff < -10) return 'DECLINING';
        return 'STABLE';
    }

    _findPeakHour(hourlyTotals) {
        let max = -1;
        let peakHour = 0;
        hourlyTotals.forEach((count, hour) => {
            if (count > max) {
                max = count;
                peakHour = hour;
            }
        });
        return String(peakHour).padStart(2, '0');
    }

    _findLowestHour(hourlyTotals) {
        let min = Infinity;
        let lowestHour = 0;
        hourlyTotals.forEach((count, hour) => {
            if (count < min && count > 0) {
                min = count;
                lowestHour = hour;
            }
        });
        return String(lowestHour).padStart(2, '0');
    }
}

module.exports = new AnalyticsService();
module.exports.AnalyticsService = AnalyticsService;