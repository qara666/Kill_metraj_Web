/**
 * Order Calculator Worker V1.0
 * 
 * Background order calculation service that runs on the backend.
 * This worker:
 * 1. Fetches orders from dashboard cache
 * 2. Groups orders by courier and time window
 * 3. Calculates optimal routes using multiple engines (Yapiko OSRM, Valhalla, OSRM)
 * 4. Stores calculated routes back to database
 * 5. Sends updates to frontend via WebSocket
 */

const axios = require('axios');
const { Pool } = require('pg');
const cron = require('node-cron');
const logger = require('../src/utils/logger');

class OrderCalculator {
    constructor() {
        // Database connection
        const poolConfig = process.env.DATABASE_URL
            ? {
                connectionString: process.env.DATABASE_URL,
                ssl: { require: true, rejectUnauthorized: false },
                max: 5,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 5000
            }
            : {
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT || '5432'),
                database: process.env.DB_NAME || 'yapiko_auto_km',
                user: process.env.DB_USER || 'msun',
                password: process.env.DB_PASSWORD || '1234',
                max: 5,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 5000
            };

        this.pool = new Pool(poolConfig);

        // Configuration
        this.calculationInterval = parseInt(process.env.ORDER_CALC_INTERVAL || '30000'); // 30 seconds
        this.batchSize = parseInt(process.env.ORDER_CALC_BATCH_SIZE || '50'); // Orders per batch
        this.maxConcurrentCalculations = parseInt(process.env.ORDER_CALC_CONCURRENCY || '5');
        
        // Routing engine configuration
        this.yapikoOsrmUrl = process.env.YAPIKO_OSRM_URL || '';
        this.valhallaUrl = process.env.VALHALLA_URL || 'http://localhost:8002';
        this.osrmPublicUrl = process.env.OSRM_PUBLIC_URL || 'https://router.project-osrm.org';
        
        // State
        this.isRunning = false;
        this.currentCalculations = 0;
        this.lastCalculationTime = null;
        this.calculationStats = {
            totalCalculated: 0,
            successful: 0,
            failed: 0,
            lastError: null
        };

        // Circuit breaker for routing engines
        this.engineStatus = {
            yapiko_osrm: { available: true, failures: 0, lastFailure: null },
            valhalla: { available: true, failures: 0, lastFailure: null },
            osrm_public: { available: true, failures: 0, lastFailure: null }
        };
    }

    /**
     * Start the order calculator worker
     */
    start() {
        if (this.isRunning) {
            logger.warn('Order calculator is already running');
            return;
        }

        this.isRunning = true;
        logger.info('Order calculator worker started', {
            interval: this.calculationInterval,
            batchSize: this.batchSize,
            yapikoOsrm: !!this.yapikoOsrmUrl,
            valhalla: !!this.valhallaUrl
        });

        // Start cron job for periodic calculation
        this.cronJob = cron.schedule('*/30 * * * * *', () => { // Every 30 seconds
            this.calculateOrders();
        });

        // Also run immediately
        setTimeout(() => this.calculateOrders(), 5000);
    }

    /**
     * Stop the worker
     */
    stop() {
        this.isRunning = false;
        if (this.cronJob) {
            this.cronJob.stop();
        }
        logger.info('Order calculator worker stopped');
    }

    /**
     * Main calculation method
     */
    async calculateOrders() {
        if (!this.isRunning || this.currentCalculations >= this.maxConcurrentCalculations) {
            return;
        }

        this.currentCalculations++;
        const startTime = Date.now();

        try {
            // 1. Get active orders from dashboard cache
            const orders = await this.getActiveOrders();
            if (orders.length === 0) {
                this.currentCalculations--;
                return;
            }

            logger.info(`Starting order calculation for ${orders.length} orders`);

            // 2. Group orders by courier and time window
            const groupedOrders = this.groupOrders(orders);

            // 3. Calculate routes for each group
            const routeCalculations = [];
            for (const [courierId, courierOrders] of Object.entries(groupedOrders)) {
                if (courierOrders.length >= 2) { // Need at least 2 orders for a route
                    routeCalculations.push(this.calculateCourierRoute(courierId, courierOrders));
                }
            }

            // 4. Wait for all calculations to complete
            const results = await Promise.allSettled(routeCalculations);
            
            // 5. Update statistics
            const successful = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            
            this.calculationStats.totalCalculated += routeCalculations.length;
            this.calculationStats.successful += successful;
            this.calculationStats.failed += failed;
            this.lastCalculationTime = new Date();

            logger.info(`Order calculation completed`, {
                orders: orders.length,
                couriers: Object.keys(groupedOrders).length,
                routesCalculated: routeCalculations.length,
                successful,
                failed,
                duration: Date.now() - startTime
            });

        } catch (error) {
            logger.error('Order calculation failed', { error: error.message });
            this.calculationStats.lastError = error.message;
        } finally {
            this.currentCalculations--;
        }
    }

    /**
     * Get active orders from database
     */
    async getActiveOrders() {
        try {
            // Get latest dashboard data
            const result = await this.pool.query(`
                SELECT payload 
                FROM api_dashboard_cache 
                WHERE target_date = CURRENT_DATE 
                ORDER BY created_at DESC 
                LIMIT 1
            `);

            if (result.rows.length === 0) {
                return [];
            }

            const dashboardData = result.rows[0].payload;
            
            // Extract orders with courier assignment
            const orders = (dashboardData.orders || [])
                .filter(order => {
                    const status = (order.status || '').toLowerCase();
                    const hasCourier = order.courier && order.courier.trim() !== '';
                    
                    // Exclude canceled/deleted orders
                    const isCanceled = ['отменен', 'отмена', 'удален', 'canceled', 'cancelled', 'deleted'].includes(status);
                    
                    return hasCourier && !isCanceled;
                })
                .map(order => ({
                    id: order.id || order._id,
                    address: order.address,
                    courier: order.courier,
                    deliveryTime: order.deliveryTime || order.deadlineAt,
                    status: order.status,
                    coords: order.coords || null,
                    // Add other relevant fields
                }));

            return orders;
        } catch (error) {
            logger.error('Failed to get active orders', { error: error.message });
            return [];
        }
    }

    /**
     * Group orders by courier and time window
     */
    groupOrders(orders) {
        const grouped = {};
        const TIME_WINDOW_MINUTES = 15; // Group orders within 15-minute windows

        orders.forEach(order => {
            const courierId = order.courier;
            if (!courierId) return;

            if (!grouped[courierId]) {
                grouped[courierId] = [];
            }

            // Add time window key for grouping
            const timeKey = this.getTimeWindowKey(order.deliveryTime, TIME_WINDOW_MINUTES);
            order._timeWindow = timeKey;
            
            grouped[courierId].push(order);
        });

        // Sort each courier's orders by delivery time
        Object.keys(grouped).forEach(courierId => {
            grouped[courierId].sort((a, b) => {
                const timeA = a.deliveryTime ? new Date(a.deliveryTime).getTime() : 0;
                const timeB = b.deliveryTime ? new Date(b.deliveryTime).getTime() : 0;
                return timeA - timeB;
            });
        });

        return grouped;
    }

    /**
     * Calculate route for a courier's orders
     */
    async calculateCourierRoute(courierId, orders) {
        try {
            // 1. Check if all orders have coordinates
            const ordersWithCoords = orders.filter(o => o.coords && o.coords.lat && o.coords.lng);
            if (ordersWithCoords.length < 2) {
                logger.debug(`Courier ${courierId}: Not enough orders with coordinates`);
                return null;
            }

            // 2. Prepare route points
            const routePoints = ordersWithCoords.map(order => ({
                lat: parseFloat(order.coords.lat),
                lng: parseFloat(order.coords.lng),
                orderId: order.id,
                address: order.address
            }));

            // 3. Calculate route using multiple engines
            const routeResult = await this.calculateRouteWithEngines(routePoints);

            if (!routeResult.feasible) {
                logger.warn(`Courier ${courierId}: No feasible route found`);
                return null;
            }

            // 4. Create route object
            const route = {
                id: `backend_calc_${Date.now()}_${courierId}`,
                courier: courierId,
                orders: ordersWithCoords,
                totalDistance: routeResult.totalDistance / 1000, // Convert to km
                totalDuration: Math.round(routeResult.totalDuration / 60), // Convert to minutes
                isOptimized: true,
                isAutoGenerated: true,
                calculatedAt: new Date().toISOString(),
                engine: routeResult.usedEngine,
                waypoints: routePoints
            };

            // 5. Store route in database
            await this.storeRoute(courierId, route);

            logger.info(`Route calculated for courier ${courierId}`, {
                orders: ordersWithCoords.length,
                distance: route.totalDistance.toFixed(2) + ' km',
                duration: route.totalDuration + ' min',
                engine: routeResult.usedEngine
            });

            return route;

        } catch (error) {
            logger.error(`Failed to calculate route for courier ${courierId}`, {
                error: error.message,
                orders: orders.length
            });
            throw error;
        }
    }

    /**
     * Calculate route using multiple routing engines
     */
    async calculateRouteWithEngines(points) {
        if (points.length < 2) {
            return { feasible: false, error: 'Not enough points' };
        }

        // Prepare engines in priority order
        const engines = [];

        // 1. Yapiko OSRM (fastest, if configured)
        if (this.yapikoOsrmUrl && this.engineStatus.yapiko_osrm.available) {
            engines.push({
                name: 'yapiko_osrm',
                calculate: () => this.calculateWithYapikoOsrm(points)
            });
        }

        // 2. Valhalla (real roads, Ukraine-optimized)
        if (this.engineStatus.valhalla.available) {
            engines.push({
                name: 'valhalla',
                calculate: () => this.calculateWithValhalla(points)
            });
        }

        // 3. Public OSRM (free fallback)
        if (this.engineStatus.osrm_public.available) {
            engines.push({
                name: 'osrm_public',
                calculate: () => this.calculateWithOsrmPublic(points)
            });
        }

        // Try engines in order, return first success
        for (const engine of engines) {
            try {
                const result = await engine.calculate();
                if (result.feasible) {
                    result.usedEngine = engine.name;
                    return result;
                }
            } catch (error) {
                this.handleEngineError(engine.name, error);
                logger.warn(`Engine ${engine.name} failed:`, error.message);
            }
        }

        // Fallback: Use straight-line distance
        logger.warn('All routing engines failed, using straight-line fallback');
        return this.calculateStraightLineFallback(points);
    }

    /**
     * Calculate route with Yapiko OSRM
     */
    async calculateWithYapikoOsrm(points) {
        const coordsStr = points.map(p => `${p.lng.toFixed(7)},${p.lat.toFixed(7)}`).join(';');
        const url = `${this.yapikoOsrmUrl}/route/v1/driving/${coordsStr}?overview=full&steps=true`;

        const response = await axios.get(url, { timeout: 10000 });
        const data = response.data;

        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
            throw new Error(`Yapiko OSRM returned: ${data.code}`);
        }

        const route = data.routes[0];
        return {
            feasible: true,
            totalDistance: route.distance,
            totalDuration: route.duration,
            geometry: route.geometry
        };
    }

    /**
     * Calculate route with Valhalla
     */
    async calculateWithValhalla(points) {
        const locations = points.map(p => ({ lat: p.lat, lon: p.lng }));
        const request = {
            locations,
            costing: 'auto',
            directions_options: { units: 'kilometers' }
        };

        const response = await axios.post(
            `${this.valhallaUrl}/route`,
            request,
            { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
        );

        const trip = response.data.trip;
        if (!trip || !trip.legs) {
            throw new Error('Valhalla returned no trip data');
        }

        const totalDistance = trip.legs.reduce((sum, leg) => sum + leg.length, 0);
        const totalDuration = trip.legs.reduce((sum, leg) => sum + leg.time, 0);

        return {
            feasible: true,
            totalDistance: totalDistance * 1000, // Convert to meters
            totalDuration,
            legs: trip.legs
        };
    }

    /**
     * Calculate route with public OSRM
     */
    async calculateWithOsrmPublic(points) {
        const coordsStr = points.map(p => `${p.lng.toFixed(7)},${p.lat.toFixed(7)}`).join(';');
        const url = `${this.osrmPublicUrl}/route/v1/driving/${coordsStr}?overview=full`;

        const response = await axios.get(url, { timeout: 10000 });
        const data = response.data;

        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
            throw new Error(`Public OSRM returned: ${data.code}`);
        }

        const route = data.routes[0];
        return {
            feasible: true,
            totalDistance: route.distance,
            totalDuration: route.duration
        };
    }

    /**
     * Fallback to straight-line distance calculation
     */
    calculateStraightLineFallback(points) {
        let totalDistance = 0;
        for (let i = 0; i < points.length - 1; i++) {
            totalDistance += this.calculateDistance(points[i], points[i + 1]);
        }
        
        // Apply road factor (1.4x for urban areas)
        totalDistance *= 1.4;
        
        // Estimate duration (average 30 km/h in city)
        const totalDuration = (totalDistance / 1000) / 30 * 3600; // seconds

        return {
            feasible: true,
            totalDistance,
            totalDuration,
            usedEngine: 'straight_line_fallback'
        };
    }

    /**
     * Calculate distance between two points (Haversine formula)
     */
    calculateDistance(point1, point2) {
        const R = 6371000; // Earth radius in meters
        const lat1 = point1.lat * Math.PI / 180;
        const lat2 = point2.lat * Math.PI / 180;
        const deltaLat = (point2.lat - point1.lat) * Math.PI / 180;
        const deltaLng = (point2.lng - point1.lng) * Math.PI / 180;

        const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
                  Math.cos(lat1) * Math.cos(lat2) *
                  Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distance in meters
    }

    /**
     * Get time window key for grouping
     */
    getTimeWindowKey(timestamp, windowMinutes) {
        if (!timestamp) return 'unknown';
        
        try {
            // Handle different timestamp formats
            let date;
            if (typeof timestamp === 'string') {
                // Try different date formats
                if (timestamp.includes(' ')) {
                    // Format: "27.03.2026 21:58" or "27.03.2026 22:30"
                    const parts = timestamp.split(' ');
                    const dateParts = parts[0].split('.');
                    const timeParts = parts[1] ? parts[1].split(':') : ['00', '00'];
                    
                    date = new Date(
                        parseInt(dateParts[2]), // year
                        parseInt(dateParts[1]) - 1, // month (0-indexed)
                        parseInt(dateParts[0]), // day
                        parseInt(timeParts[0]), // hours
                        parseInt(timeParts[1]) // minutes
                    );
                } else if (timestamp.includes('.')) {
                    // Format: "27.03.2026"
                    const dateParts = timestamp.split('.');
                    date = new Date(
                        parseInt(dateParts[2]),
                        parseInt(dateParts[1]) - 1,
                        parseInt(dateParts[0])
                    );
                } else {
                    // Try standard ISO format
                    date = new Date(timestamp);
                }
            } else {
                date = new Date(timestamp);
            }
            
            if (isNaN(date.getTime())) {
                return 'unknown';
            }
            
            const minutes = date.getHours() * 60 + date.getMinutes();
            const window = Math.floor(minutes / windowMinutes);
            
            return `${date.toISOString().split('T')[0]}_${window}`;
        } catch (error) {
            console.warn('Failed to parse timestamp:', timestamp, error);
            return 'unknown';
        }
    }

    /**
     * Store calculated route in database
     */
    async storeRoute(courierId, route) {
        try {
            // Store in a separate table or update dashboard cache
            // For now, we'll store in a simple JSON field
            await this.pool.query(`
                INSERT INTO calculated_routes (
                    courier_id, 
                    route_data, 
                    calculated_at, 
                    orders_count,
                    total_distance,
                    total_duration
                ) VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (courier_id, calculated_at::date) 
                DO UPDATE SET 
                    route_data = EXCLUDED.route_data,
                    orders_count = EXCLUDED.orders_count,
                    total_distance = EXCLUDED.total_distance,
                    total_duration = EXCLUDED.total_duration
            `, [
                courierId,
                JSON.stringify(route),
                new Date(),
                route.orders.length,
                route.totalDistance,
                route.totalDuration
            ]);

            // Notify frontend via WebSocket (if available)
            this.notifyFrontend(courierId, route);

        } catch (error) {
            logger.error('Failed to store route', { courierId, error: error.message });
        }
    }

    /**
     * Handle routing engine errors
     */
    handleEngineError(engineName, error) {
        const engine = this.engineStatus[engineName];
        if (engine) {
            engine.failures++;
            engine.lastFailure = new Date();
            
            // Disable engine after 5 consecutive failures
            if (engine.failures >= 5) {
                engine.available = false;
                logger.warn(`Engine ${engineName} disabled after 5 failures`);
                
                // Re-enable after 5 minutes
                setTimeout(() => {
                    engine.available = true;
                    engine.failures = 0;
                    logger.info(`Engine ${engineName} re-enabled`);
                }, 5 * 60 * 1000);
            }
        }
    }

    /**
     * Notify frontend about new route calculation
     */
    notifyFrontend(courierId, route) {
        // This would integrate with WebSocket server
        // For now, just log
        logger.debug(`Route calculated for ${courierId}, should notify frontend`);
    }

    /**
     * Get worker statistics
     */
    getStats() {
        return {
            isRunning: this.isRunning,
            currentCalculations: this.currentCalculations,
            lastCalculationTime: this.lastCalculationTime,
            stats: this.calculationStats,
            engineStatus: this.engineStatus
        };
    }
}

// Create and export instance
const orderCalculator = new OrderCalculator();

// Export for use in main server
module.exports = {
    OrderCalculator,
    orderCalculator
};