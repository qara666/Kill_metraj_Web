// v22.0: Optimized for Sequelize Model Registry. No more require circularity!
const logger = require('../src/utils/logger');
const axios = require('axios');
const { Op } = require('sequelize');
const { sequelize } = require('../src/config/database');
const { cleanAddress, generateVariants } = require('../src/utils/addressUtils');
const { groupAllOrdersByTimeWindow, normalizeCourierName } = require('./turboGroupingHelpers');

// v5.144: Helper to create a stable hash from order for deduplication
// This catches cases where orders have different IDs but represent the same order
function getOrderHash(o) {
    const parts = [
        String(o.courier || '').toUpperCase().trim(),
        String(o.address || '').toLowerCase().trim(),
        String(o.deliverBy || o.plannedTime || o.deliveryTime || ''),
        String(o.orderNumber || '')
    ];
    return parts.join('|');
}

// v5.144: Get all IDs from an order
function getAllOrderIds(o) {
    const ids = new Set();
    if (o.id) ids.add(String(o.id));
    if (o.orderNumber) ids.add(String(o.orderNumber));
    if (o._id) ids.add(String(o._id));
    if (o.raw?.id) ids.add(String(o.raw.id));
    return ids;
}

class OrderCalculator {
    constructor() {
        this.isRunning = false;
        this.interval = 15000; // 15s poll as fallback
        this.timer = null;
        this.isProcessing = false;
        this.io = null; // Socket.io instance

        // Settings
        // v20.1: Prioritize Yapiko OSRM for maximum speed and quality. 
        this.osrmUrl = process.env.YAPIKO_OSRM_URL || process.env.OSRM_URL || 'http://116.204.153.171:5050';

        // v23.1: Persistent Geocache to avoid redundant API calls
        this.geocache = new Map();
        this.addressUtils = require('../src/utils/addressUtils');

        // Per-division state: divisionId -> { users:Set<string>, date, priorityQueue, currentPriority, isActive }
        this.divisionStates = new Map();
        this.processedHashes = new Map(); // v28.1: Track processed data hashes to avoid redundant runs
        this.priorityQueue = []; // legacy fallback, kept for compatibility
        this.currentPriority = null;

        // v24.0: Active division for background calculation (set when user clicks "Start")
        this.activeDivisionId = null;
        this.activeDivisionDate = null;


        // v24.0: Engine presets for distance calculations (OSRM Yapiko as default, then Photon, then VHV)
        this.enginePresets = {
            yapikoOSRM: {
                label: 'Yapiko OSRM',
                url: process.env.YAPIKO_OSRM_URL || 'http://osrm.yapiko.kh.ua'
            },
            photon: {
                label: 'Photon',
                url: process.env.PHOTON_URL || 'http://photon.example'
            },
            hvv: {
                label: 'VHV',
                url: process.env.VHV_URL || 'http://hvv.example'
            }
        };
        // v24.0: Load all division states from DB into memory
        this.loadAllDivisionStatesFromDB();
    }

    /**
     * Load saved active division from database
     */
    async loadSavedState() {
        try {
            const { sequelize } = require('../src/config/database');
            const result = await sequelize.query(
                "SELECT data FROM dashboard_states WHERE data->>'activeDivisionId' IS NOT NULL LIMIT 1",
                { type: sequelize.QueryTypes.SELECT }
            );
            if (result && result[0]?.data) {
                this.activeDivisionId = result[0].data.activeDivisionId;
                this.activeDivisionDate = result[0].data.activeDivisionDate || new Date().toISOString().split('T')[0];
                logger.info(`[TurboCalculator] 💾 Restored active division: ${this.activeDivisionId}, date: ${this.activeDivisionDate}`);
            }
        } catch (error) {
            logger.warn('[TurboCalculator] ⚠️ Could not load saved state:', error.message);
        }
    }

    async loadAllDivisionStatesFromDB() {
        try {
            const DivisionState = this.getModel('DashboardDivisionState');
            if (!DivisionState) return;
            const rows = await DivisionState.findAll();
            for (const r of rows) {
                const userId = r.user_id;
                const divId = r.division_id;
                const date = r.date;
                const isActive = r.is_active;
                if (!divId) continue;
                let state = this.divisionStates.get(divId);
                if (!state) {
                    state = { users: new Set(), date: date || new Date().toISOString().split('T')[0], priorityQueue: [], currentPriority: null, isActive: !!isActive };
                    this.divisionStates.set(divId, state);
                }
                if (userId) state.users.add(userId);
                if (date) state.date = date;
                state.isActive = !!isActive;

                // v25.0: If division is active, ensure it's processed in the next tick
                if (state.isActive) {
                    logger.info(`[TurboCalculator] 🔄 Auto-resuming division: ${divId} for date ${state.date}`);
                }
            }
            logger.info('[TurboCalculator] ✅ Loaded division states from DB into memory');

            // Initial trigger for all active divisions
            if (this.isRunning && !this.isProcessing) {
                this.tick();
            }
        } catch (err) {
            logger.warn('[TurboCalculator] ⚠️ Could not load division states from DB:', err.message);
        }
    }

    /**
     * Centralized Model Resolver
     * Directly import from models/index.js to ensure models are loaded
     */
    getModel(name) {
        try {
            // Direct import to ensure models are registered
            const models = require('../src/models');
            const model = models[name];
            if (model && typeof model.findAll === 'function') {
                return model;
            }
            logger.warn(`[OrderCalculator] Model ${name} not found or not a Sequelize model`);
            return null;
        } catch (error) {
            logger.error(`[OrderCalculator] Failed to load model ${name}:`, error.message);
            return null;
        }
    }

    async start(io = null) {
        if (this.isRunning) return;
        this.isRunning = true;
        this.io = io || this.io;

        // v28.2: Small delay to ensure Sequelize models are fully registered in the index
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.loadSavedState();

        logger.info(`[TurboCalculator] 🚀 v22.4 (THE FORCE) INITIALIZING... Engine: ${this.osrmUrl}`);

        // v23.0: Direct model loading - no more waiting
        try {
            const models = require('../src/models');
            logger.info(`[OrderCalculator] ✅ Models loaded: ${Object.keys(models).filter(k => k !== 'sequelize' && k !== 'syncDatabase').join(', ')}`);
        } catch (error) {
            logger.error('[OrderCalculator] ❌ Failed to load models:', error.message);
        }

        // Restoring state if any division is active
        if (global && global.divisionStatusStore) {
            logger.info(`[TurboCalculator] 🔍 Checking for active divisions in global store...`);
            for (const [key, status] of Object.entries(global.divisionStatusStore)) {
                if (status && status.isActive) {
                    const parts = key.split('_');
                    if (parts.length >= 2) {
                        const divId = parts[0];
                        const date = parts[1];
                        
                        this.activeDivisionId = divId;
                        this.activeDivisionDate = date;
                        
                        // Sync to local states Map
                        this.divisionStates.set(divId, {
                            isActive: true,
                            date: date,
                            users: new Set(),
                            priorityQueue: []
                        });
                        logger.info(`[TurboCalculator] 💾 Restored active division: ${divId} for date ${date}`);
                    }
                }
            }
        }

        // Delay initial run to ensure models are ready
        setTimeout(() => {
            logger.info(`[TurboCalculator] 🚀 Running initial check for ${this.divisionStates.size} active divisions`);
            if (this.divisionStates.size > 0) {
                this.tick();
            } else {
                this.scheduleNextTick();
            }
        }, 5000);
    }

    scheduleNextTick() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.tick(), this.interval);
    }

    /**
     * Trigger calculation for a division - supports multi-division (memory only)
     * @param {string} divisionId - Division to start
     * @param {string} date - Date to process
     * @param {string} userId - User initiating trigger
     */
    trigger(divisionId, date = null, userId = null) {
        // If called without divisionId, just ensure tick is running
        if (!divisionId) {
            if (!this.isProcessing) this.tick();
            return;
        }

        let normalizedDate = date;
        if (date && date.includes('.')) {
            const parts = date.split('.');
            if (parts.length === 3) {
                normalizedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
        }

        const targetDate = normalizedDate || new Date().toISOString().split('T')[0];
        const cacheKey = `${divisionId}_${targetDate}`;

        // ALWAYS clear hash on manual trigger to force recalculation!
        this.processedHashes.delete(cacheKey);
        logger.info(`[TurboCalculator] 💥 Manual bypass: Cleared processedHash for ${cacheKey}`);

        let state = this.divisionStates.get(divisionId);
        if (!state) {
            state = { users: new Set(), date: targetDate, priorityQueue: [], currentPriority: null, isActive: true };
            this.divisionStates.set(divisionId, state);
        }
        if (userId) state.users.add(userId);
        state.isActive = true;
        state.date = targetDate;

        // Persist activation in memory DB (best effort)
        try {
            const DashboardDivisionState = this.getModel('DashboardDivisionState');
            if (DashboardDivisionState && userId) {
                // upsert: user_id, division_id, date, is_active, data
                return DashboardDivisionState.upsert({ user_id: Number(userId), division_id: String(divisionId), date: targetDate, is_active: true, data: {} })
                    .then(() => {
                        // ok
                    }).catch(() => {
                        // ignore persistence error in in-memory mode
                    });
            }
        } catch (e) {
            // ignore persistence errors in in-memory mode
        }

        // Persist activation to DB for persistence across restarts (best effort, non-blocking)
        try {
            const DashboardDivisionState = this.getModel('DashboardDivisionState');
            if (DashboardDivisionState && userId) {
                const uid = Number(userId);
                DashboardDivisionState.findOrCreate({ where: { user_id: uid, division_id: String(divisionId) }, defaults: { date: targetDate, is_active: true, data: {} } })
                    .then(() => DashboardDivisionState.update({ date: targetDate, is_active: true, last_updated: new Date() }, { where: { user_id: uid, division_id: String(divisionId) } }))
                    .catch(err => logger.warn('[TurboCalculator] Failed to persist division state:', err.message));
            }
        } catch (e) {
            // swallow persistence errors to avoid breaking in-memory flow
        }

        // Trigger global tick to process all active divisions
        if (!this.isProcessing) {
            this.tick();
        } else {
            this.needsReRun = true;
        }
        logger.info(`[TurboCalculator] 🎯 Active divisions: ${Array.from(this.divisionStates.keys()).join(', ')}`);
    }

    /**
     * Stop background calculation and clear active division
     */
    async stop(divisionId = null) {
        if (divisionId) {
            this.divisionStates.delete(String(divisionId));
            
            // Persist stop state to DB
            try {
                const DashboardDivisionState = this.getModel('DashboardDivisionState');
                if (DashboardDivisionState) {
                    await DashboardDivisionState.update(
                        { is_active: false, last_updated: new Date() },
                        { where: { division_id: String(divisionId) } }
                    );
                }
            } catch (e) {
                logger.error(`[TurboCalculator] ❌ Failed to persist stop state for ${divisionId}: ${e.message}`);
            }
            logger.info(`[TurboCalculator] ⏹️ Background calculation stopped for ${divisionId}`);
        } else {
            this.activeDivisionId = null;
            this.activeDivisionDate = null;
            this.priorityQueue = [];
            this.divisionStates.clear();
            
            // Persist stop across all divisions globally
            try {
                const DashboardDivisionState = this.getModel('DashboardDivisionState');
                if (DashboardDivisionState) {
                    await DashboardDivisionState.update(
                        { is_active: false, last_updated: new Date() },
                        { where: {} }
                    );
                }
            } catch (e) {
                logger.error(`[TurboCalculator] ❌ Failed to persist global stop state: ${e.message}`);
            }
            logger.info(`[TurboCalculator] ⏹️ Background calculation stopped globally, all active divisions cleared`);
        }
    }

    async tick() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        this.needsReRun = false;

        try {
            // Emit initial global status
            if (this.io) {
                this.io.emit('robot_status', {
                    isActive: true,
                    lastUpdate: Date.now(),
                    totalCount: 0,
                    processedCount: 0,
                    totalCouriers: 0,
                    processedCouriers: 0,
                    message: 'Initializing background robot...'
                });
            }

            // Process all active divisions for this tick
            const tasks = [];
            for (const [divId, state] of this.divisionStates.entries()) {
                if (!state.isActive) continue;

                let targetDate = state.date;
                let isPriority = false;

                // Priority queue handling
                if (state.priorityQueue && state.priorityQueue.length > 0) {
                    const priorityItem = state.priorityQueue.shift();
                    targetDate = priorityItem.date;
                    state.currentPriority = priorityItem;
                    isPriority = true;
                }

                logger.info(`[TurboCalculator] ⚙️ Starting tick for ${divId} on ${targetDate}`);
                tasks.push(this.processDay(targetDate, divId));
            }
            await Promise.all(tasks);
        } catch (err) {
            logger.error('[OrderCalculator] ❌ Robot Tick critical failure:', err.message);
        } finally {
            this.isProcessing = false;
            this.scheduleNextTick();
            if (this.needsReRun) {
                this.trigger();
            }
        }
    }

    async processDay(dateISO, priorityDivisionId = null) {
        try {
            const DashboardCache = this.getModel('DashboardCache');
            if (!DashboardCache) return;

            let caches;
            if (priorityDivisionId && priorityDivisionId !== 'all') {
                caches = await DashboardCache.findAll({
                    where: { target_date: dateISO, division_id: String(priorityDivisionId) }
                });
            } else {
                caches = await DashboardCache.findAll({ where: { target_date: dateISO } });
            }

            if (caches.length === 0) {
                logger.info(`[TurboCalculator] ⚠️ No data found for ${priorityDivisionId || 'all'} on ${dateISO}`);
                // Emit final "No data" status so UI doesn't spin
                if (this.io && priorityDivisionId) {
                    const noDataPayload = {
                        divisionId: priorityDivisionId,
                        date: dateISO,
                        isActive: false,
                        totalCount: 0,
                        message: 'No data for this date'
                    };
                    this.io.emit('robot_status', noDataPayload);
                    this.io.emit('division_status_update', noDataPayload);
                }
                return;
            }

            // v28.0: If processing 'all', we need to emit an aggregated status to move the top bar!
            if (priorityDivisionId === 'all') {
                let totalOrdersGlobal = 0;
                caches.forEach(c => {
                   totalOrdersGlobal += (c.order_count || c.payload?.orders?.length || 0);
                });
                
                if (this.io) {
                    this.io.emit('robot_status', {
                        divisionId: 'all',
                        date: dateISO,
                        isActive: true,
                        totalCount: totalOrdersGlobal,
                        processedCount: 0,
                        message: `Processing ${caches.length} divisions (${totalOrdersGlobal} orders)...`
                    });
                }
            }

            // v5.145: CRITICAL FIX - Only process ONE cache per division/date
            // If multiple caches exist, use the one with the most orders
            const primaryCache = caches.reduce((best, c) => {
                const currentCount = c.payload?.orders?.length || 0;
                const bestCount = best?.payload?.orders?.length || 0;
                return currentCount > bestCount ? c : best;
            }, null);

            if (caches.length > 1) {
                logger.warn(`[TurboCalculator] ⚠️ Found ${caches.length} caches for ${priorityDivisionId} on ${dateISO}, using the largest one (${primaryCache?.payload?.orders?.length} orders)`);
            }

            if (primaryCache) {
                await this.processCache(primaryCache);
            }
        } catch (err) {
            logger.error(`[OrderCalculator] ❌ processDay error (${dateISO}): ${err.message}`);
        }
    }

    async processCache(cache) {
        try {
            const data = cache.payload;
            // v30.0 CRITICAL FIX: Route must be declared inside processCache.
            // Previously it was ONLY declared in processDay (different scope),
            // causing every Route.create() call to throw "Route is not defined".
            // Op and sequelize are fine — they're declared at module scope (lines 4-5).
            const Route = this.getModel('Route');
            // Fast path: no orders for this division/date yet -> emit 0 state to UI and skip processing
            if (!data || !Array.isArray(data.orders) || data.orders.length === 0) {
                const stats = {
                    isActive: true,
                    lastUpdate: Date.now(),
                    totalCount: 0,
                    processedCount: 0,
                    totalCouriers: 0,
                    processedCouriers: 0,
                    currentPhase: 'routing',
                    message: 'No orders for this division/date'
                };
                const emitStatus = () => {
                    if (this.io) {
                        this.io.emit('robot_status', {
                            divisionId: cache.division_id,
                            date: cache.target_date,
                            ...stats,
                            couriers: []
                        });
                        this.io.emit('division_status_update', {
                            divisionId: cache.division_id,
                            date: cache.target_date,
                            totalCount: 0,
                            totalCouriers: 0,
                            couriers: []
                        });
                    }
                };
                emitStatus();
                logger.info('[TurboCalculator] 🔔 No orders for division/date, skipping processing for this cache');
                return;
            }
            if (!data || !data.orders) return;
            
            // v5.144: RADICAL De-duplication using BOTH IDs AND content hash
            // This catches: same order with different IDs, orders from multiple sources
            const seenIds = new Set();
            const seenHashes = new Set();
            const uniqueOrders = [];
            let duplicateById = 0;
            let duplicateByHash = 0;
            
            data.orders.forEach(o => {
                const allIds = getAllOrderIds(o);
                const orderHash = getOrderHash(o);
                
                // Check if ANY of this order's IDs was already seen
                let isDuplicateById = false;
                for (const id of allIds) {
                    if (seenIds.has(id)) {
                        isDuplicateById = true;
                        duplicateById++;
                        break;
                    }
                }
                
                // Check if content hash was already seen (catches different-ID duplicates)
                let isDuplicateByHash = seenHashes.has(orderHash);
                if (isDuplicateByHash) {
                    duplicateByHash++;
                }
                
                // Skip if duplicate by either method
                if (isDuplicateById || isDuplicateByHash) {
                    return;
                }
                
                // Add all IDs and hash to seen sets
                for (const id of allIds) {
                    seenIds.add(id);
                }
                seenHashes.add(orderHash);
                uniqueOrders.push(o);
            });
            
            data.orders = uniqueOrders;
            if (duplicateById > 0 || duplicateByHash > 0) {
                logger.warn(`[TurboCalculator] 🧊 De-duplicated: ${duplicateById} by ID + ${duplicateByHash} by content, kept ${data.orders.length}`);
            }
            
            // v5.150: Debug - log time fields for first 5 orders of ПОНОМАРЕНКО ЄВГЕНІЙ
            const ponomarenkoOrders = data.orders.filter(o => {
                const courier = String(o.courier || '').toUpperCase();
                return courier.includes('ПОНОМАРЕНКО');
            });
            if (ponomarenkoOrders.length > 0) {
                logger.info(`[TurboCalculator] 🕐 ПОНОМАРЕНКО ЄВГЕНІЙ: ${ponomarenkoOrders.length} orders`);
                ponomarenkoOrders.slice(0, 5).forEach(o => {
                    logger.info(`[TurboCalculator]   Order ${o.orderNumber || o.id}:`, {
                        arrivedAt: o.arrivedAt,
                        arrivalTime: o.arrivalTime,
                        deliverBy: o.deliverBy,
                        plannedTime: o.plannedTime,
                        deliveryTime: o.deliveryTime,
                        createdAt: o.createdAt
                    });
                });
            }

            // v28.9: Frontload coordinate extraction from all possible sources (including addressGeo)
            // This ensures grouping and validOrders filters have accurate GPS data immediately.
            data.orders.forEach(o => {
                if (o.coords?.lat) return; 
                
                // 1. Try addressGeo (Common in user's 347 orders)
                if (o.addressGeo) {
                    const parsed = this.parseAddressGeo(o.addressGeo);
                    if (parsed) {
                        o.coords = parsed;
                        return;
                    }
                }
                
                // 2. Try lat/lng fields directly
                if (o.lat && o.lng) {
                    const lat = parseFloat(o.lat);
                    const lng = parseFloat(o.lng);
                    if (!isNaN(lat) && !isNaN(lng)) {
                        o.coords = { lat, lng };
                        return;
                    }
                }

                // 3. Try geocoded field
                if (o.geocoded && o.lat && o.lng) {
                    o.coords = { lat: parseFloat(o.lat), lng: parseFloat(o.lng) };
                }
            });
            
            // v28.8: Use the new frontend-like grouping by arrivedAt -> 30min windows
            let deliveryWindows = new Map();
            let totalBlocksCount = 0;
            try {
              const { groupAllOrdersByTimeWindow } = require('./turboGroupingHelpers');
              // v5.150: Use groupAllOrdersByTimeWindow to process per-courier correctly
              // This is CRITICAL for the "bulk import" detection to work exactly like frontend
              deliveryWindows = groupAllOrdersByTimeWindow(data.orders);
              
              // Log block summary
              const blockSummary = {};
              deliveryWindows.forEach((windows, courier) => {
                totalBlocksCount += windows.length;
                blockSummary[courier] = windows.map(w => `${w.windowLabel}(${w.orders.length})`);
              });
              
              logger.info(`[TurboCalculator] 📦 Grouped into ${totalBlocksCount} blocks across ${deliveryWindows.size} couriers`);
              Object.entries(blockSummary).forEach(([courier, blks]) => {
                logger.info(`[TurboCalculator]   ${courier}: ${blks.length} blocks - ${blks.join(', ')}`);
              });
            } catch (err) {
              logger.error('[TurboCalculator] Backend grouping failed', err);
              deliveryWindows = new Map();
            }
            
            if (this.io) {
                this.io.emit('robot_status', {
                    divisionId: cache.division_id,
                    date: cache.target_date,
                    isActive: true,
                    currentPhase: 'grouping',
                    message: `Grouping ${data.orders.length} orders into 30m blocks...`,
                    totalCount: data.orders.length
                });
            }

            // v28.1 & v5.146: Deep Stable Deduplication - Ignore transient fields like statusTimings/updated_at
            // By building a stable hash ONLY from routing-relevant fields, we prevent the robot from firing constantly
            const crypto = require('crypto');
            const stablePayload = (data.orders || []).map(o => ({
                id: o.id || o._id,
                n: o.orderNumber,
                s: String(o.status || '').toUpperCase(),
                c: String(o.courier || o.courierName || o.courierId || '').toUpperCase(),
                a: String(o.address || o.addressGeo || '').toLowerCase(),
                ll: o.coords ? `${o.coords.lat},${o.coords.lng}` : null,
                t: o.deliverBy || o.plannedTime || o.deliveryTime,
                arr: o.arrivedAt || o.createdAt || null
            }));
            
            const dataHash = crypto.createHash('sha256').update(JSON.stringify(stablePayload)).digest('hex');
            const cacheKey = `${cache.division_id}_${cache.target_date}`;
            if (this.processedHashes.get(cacheKey) === dataHash) {
                logger.info(`[TurboCalculator] ⏩ Data for ${cacheKey} unchanged (${dataHash}), skipping heavy calculation`);
                // Still emit status to say we are ready
                if (this.io) {
                    this.io.emit('robot_status', {
                        divisionId: cache.division_id,
                        date: cache.target_date,
                        isActive: false,
                        currentPhase: 'complete',
                        message: 'Data up-to-date (cached)',
                        totalCount: data.orders.length
                    });
                }
                return;
            }

            // v5.145 FLICKER FIX: Now that we know data HAS changed, delete old routes
            if (Route) {
                const deletedCount = await Route.destroy({
                    where: {
                        division_id: cache.division_id,
                        [Op.and]: sequelize.where(
                            sequelize.literal("route_data->>'target_date'"),
                            cache.target_date
                        )
                    }
                });
                logger.info(`[TurboCalculator] 🗑️ Batch deleted ${deletedCount} old routes for ${cache.division_id} on ${cache.target_date} after confirming changes`);
            }

            // v28.8: Initialize stats using the SAME grouping logic as the calculation loop
            // This ensures all counts (orders, couriers) match exactly what is being processed
            const stats = {
                isActive: true,
                lastUpdate: Date.now(),
                totalCount: data.orders.length,
                processedCount: 0,
                totalCouriers: deliveryWindows.size, 
                processedCouriers: 0,
                skippedGeocoding: 0,
                skippedInRoutes: 0,
                skippedNoCourier: 0,
                skippedOther: 0,
                currentPhase: 'grouping',
                message: `Initializing: ${deliveryWindows.size} couriers...`
            };
            
            // Initialize per-division courier stats for distance tracking
            stats.courierStats = {};
            const processedCourierNames = new Set();
            deliveryWindows.forEach((windows, normName) => {
                const totalOrdersInWindows = windows.reduce((acc, w) => acc + w.orders.length, 0);
                stats.courierStats[normName] = { 
                    name: normName, 
                    orders: totalOrdersInWindows, 
                    distanceKm: 0 
                };
            });
            
            this.io.emit('robot_status', {
                divisionId: cache.division_id,
                date: cache.target_date,
                ...stats
            });

            const emitStatus = () => {
                if (this.io) {
                    const couriersList = Object.values(stats.courierStats || {});
                    const payload = {
                        divisionId: cache.division_id,
                        date: cache.target_date,
                        totalCount: stats.totalCount,
                        totalCouriers: stats.totalCouriers,
                        processedCount: stats.processedCount,
                        processedCouriers: stats.processedCouriers,
                        currentPhase: stats.currentPhase,
                        message: stats.message,
                        isActive: stats.isActive,
                        couriers: couriersList
                    };

                    this.io.emit('robot_status', payload);
                    
                    // Also emit per-division status for UI (test panel)
                    this.io.emit('division_status_update', payload);

                    // v28.2: Store status in global hub for initial hydration
                    if (global && typeof global === 'object') {
                        if (!global.divisionStatusStore) global.divisionStatusStore = {};
                        const key = `${cache.division_id}_${cache.target_date}`;
                        global.divisionStatusStore[key] = payload;
                    }
                }
            };

            // Initial status push - show immediately!
            emitStatus();
            logger.info(`[TurboCalculator] 📊 Starting: ${stats.totalCount} orders, ${stats.totalCouriers} couriers`);

            // v25.0: Selective Geocoding Strategy
            // Only geocode orders that are in "доставляется" status and lack coordinates.
            // This happens inside the routing loop below to ensure we only spend resources on 
            // orders that are actually part of a delivery queue.
            stats.processedCount = 0;
            stats.currentPhase = 'processing';
            stats.message = 'Analyzing delivery queues...';
            emitStatus();
            logger.info(`[TurboCalculator] 🧭 Starting selective geocoding and routing for ${stats.totalCount} orders`);

            // v27.0: Match frontend's groupOrdersByTimeWindow() logic EXACTLY
            // Already calculated at the start of processCache as 'deliveryWindows'
            
            let totalWindowsCount = 0;
            const uniqueCouriers = new Set();
            deliveryWindows.forEach((windows, courier) => {
                uniqueCouriers.add(courier);
                totalWindowsCount += windows.length;
            });
            const courierCount = uniqueCouriers.size;

            logger.info(`[TurboCalculator] 📅 ${totalWindowsCount} time windows across ${courierCount} couriers`);

            // Use unique courier count
            stats.totalCouriers = courierCount;
            emitStatus();

            // v5.145: Routes are now deleted ONCE in processDay, not here

            // Process each courier and their time windows
            // v5.140: Courier names are now normalized in groupOrdersByTimeWindowFrontend
            for (const [courierName, windows] of deliveryWindows.entries()) {
                const normName = courierName;
                if (!windows || windows.length === 0) continue;

                logger.info(`[TurboCalculator] 🚚 Processing courier ${normName}: ${windows.length} time windows`);

                // v29.0: Fetch presets ONCE per courier, not per time-window (huge performance win!)
                const presets = await this.getDivisionPresets(cache.division_id);
                const cityBias = presets?.cityBias || 'Київ';
                const startPoint = presets?.defaultStartLat && presets?.defaultStartLng ?
                    { lat: parseFloat(presets.defaultStartLat), lng: parseFloat(presets.defaultStartLng) } : null;
                const endPoint = presets?.defaultEndLat && presets?.defaultEndLng ?
                    { lat: parseFloat(presets.defaultEndLat), lng: parseFloat(presets.defaultEndLng) } : null;

                let courierRoutesCreated = 0;

                for (const timeGroup of windows) {
                    const windowKey = timeGroup.windowLabel;
                    const orders = timeGroup.orders;
                    if (!orders || orders.length === 0) continue;
                    
                    // v5.144: Deduplicate orders using helper function
                    const seenIds = new Set();
                    const dedupedOrders = [];
                    let localDupCount = 0;
                    
                    orders.forEach(o => {
                        const allIds = getAllOrderIds(o);
                        
                        let isDuplicate = false;
                        for (const id of allIds) {
                            if (seenIds.has(id)) {
                                isDuplicate = true;
                                localDupCount++;
                                break;
                            }
                        }
                        if (isDuplicate) return;
                        
                        for (const id of allIds) {
                            seenIds.add(id);
                        }
                        dedupedOrders.push(o);
                    });
                    
                    if (localDupCount > 0) {
                        logger.warn(`[TurboCalculator] ⚠️ Found ${localDupCount} duplicates in window ${windowKey}`);
                    }
                    logger.info(`[TurboCalculator] 🚚 [${windowKey}] Processing ${normName} with ${dedupedOrders.length} orders`);

                    try {
                        // v28.9: Geocoding only orders still missing coords (addressGeo already handled above)
                        const needsGeocoding = dedupedOrders.filter(o => {
                            const s = String(o.status || '').toLowerCase().trim();
                            if (s.includes('отказ') || s.includes('отменен') || s.includes('відмова')) return false;
                            return !o.coords?.lat;
                        });

                        if (needsGeocoding.length > 0) {
                            logger.info(`[TurboCalculator] 🧭 Need geocoding: ${needsGeocoding.length} orders for ${normName}`);
                        }

                        // v29.0: Parallel geocoding with in-memory session cache
                        await Promise.all(needsGeocoding.map(async o => {
                            // Check session geocache first (fastest, no DB hit)
                            const cacheKey2 = (o.address || '').toLowerCase().trim();
                            if (this.geocache.has(cacheKey2)) {
                                const cached = this.geocache.get(cacheKey2);
                                if (cached) o.coords = { lat: cached.latitude, lng: cached.longitude };
                                return;
                            }
                            const coords = await this.getRobustGeocode(o.address, cityBias);
                            if (coords) {
                                o.coords = { lat: coords.latitude, lng: coords.longitude };
                                this.geocache.set(cacheKey2, coords); // Cache for reuse
                                stats.processedCount++;
                            } else {
                                this.geocache.set(cacheKey2, null); // Cache miss to avoid re-trying
                            }
                        }));

                        // Use all valid orders (with coords OR a valid address for routing)
                        // Use deduplicated orders from this block
                        let validOrders = dedupedOrders.filter(o => {
                            const s = String(o.status || o.deliveryStatus || '').toLowerCase().trim();
                            if (s.includes('отказ') || s.includes('отменен') || s.includes('відмова')) return false;
                            const hasCoords = (o.coords?.lat && o.coords?.lng) ||
                                             (o.lat && o.lng) ||
                                             (o.latitude && o.longitude);
                            return hasCoords || (o.address && o.address.length > 5);
                        });

                        // Sort orders by delivery time for optimal route
                        const getDeliveryMinutes = (o) => {
                            const time = o.deliverBy || o.plannedTime || o.deliveryTime;
                            if (!time || time === '00:00') return 9999;
                            const parts = String(time).split(':');
                            return parseInt(parts[0]) * 60 + parseInt(parts[1] || '0');
                        };
                        validOrders = validOrders.sort((a, b) => getDeliveryMinutes(a) - getDeliveryMinutes(b));

                        if (validOrders.length < 1) {
                            logger.info(`[TurboCalculator] ⚠️ No valid orders for ${normName} in block ${windowKey}`);
                            continue;
                        }

                        if (this.io) {
                            const firstAddr = (validOrders[0].address || 'Unknown').split(',')[0];
                            this.io.emit('robot_status', {
                                divisionId: cache.division_id,
                                date: cache.target_date,
                                message: `Calculating: ${normName} → ${firstAddr} (${validOrders.length} orders)`,
                                processedCouriers: stats.processedCouriers,
                                totalCouriers: stats.totalCouriers,
                            });
                        }

                        let routeResult = null;
                        try {
                            routeResult = await this.calculateRoute(validOrders, cache.division_id, startPoint, endPoint);
                        } catch (routeErr) {
                            logger.warn(`[TurboCalculator] ⚠️ calculateRoute failed for ${normName}: ${routeErr.message}`);
                        }

                        if (routeResult) {
                            const timeBlockLabel = timeGroup.windowLabel;
                            const distanceKm = Math.round((routeResult.distance / 1000) * 100) / 100;

                            // v5.149: CRITICAL FIX - Deduplicate by orderNumber FIRST (primary key)
                            // The same order may have different IDs from different sources
                            const seenOrderNumbers = new Set();
                            const seenIds = new Set();
                            const uniqueRouteOrders = [];
                            
                            validOrders.forEach(o => {
                                const orderNum = String(o.orderNumber || '');
                                const orderId = String(o.id || '');
                                
                                // Skip if we've seen this orderNumber before
                                if (orderNum && seenOrderNumbers.has(orderNum)) {
                                    logger.warn(`[TurboCalculator] ⚠️ Skipping duplicate orderNumber: ${orderNum}`);
                                    return;
                                }
                                
                                // Also skip if we've seen this id before
                                if (orderId && seenIds.has(orderId)) {
                                    logger.warn(`[TurboCalculator] ⚠️ Skipping duplicate id: ${orderId}`);
                                    return;
                                }
                                
                                // Mark as seen
                                if (orderNum) seenOrderNumbers.add(orderNum);
                                if (orderId) seenIds.add(orderId);
                                
                                uniqueRouteOrders.push({
                                    id: o.id,
                                    orderNumber: o.orderNumber,
                                    address: o.address,
                                    coords: o.coords,
                                    deliveryTime: o.deliverBy || o.plannedTime || o.deliveryTime
                                });
                            });

                            if (uniqueRouteOrders.length < validOrders.length) {
                                logger.warn(`[TurboCalculator] ⚠️ Route deduplication: ${validOrders.length} -> ${uniqueRouteOrders.length} orders`);
                                // Log which orderNumbers were duplicates
                                const orderNums = validOrders.map(o => o.orderNumber).filter(Boolean);
                                const dupNums = orderNums.filter((n, i) => orderNums.indexOf(n) !== i);
                                if (dupNums.length > 0) {
                                    logger.warn(`[TurboCalculator] ⚠️ Duplicate orderNumbers: ${[...new Set(dupNums)].join(', ')}`);
                                }
                            }

                            await Route.create({
                                courier_id: normName,
                                division_id: cache.division_id,
                                total_distance: distanceKm,
                                total_duration: Math.round(routeResult.duration),
                                engine_used: routeResult.engine,
                                orders_count: uniqueRouteOrders.length,
                                calculated_at: new Date(),
                                route_data: {
                                    target_date: cache.target_date,
                                    deliveryWindow: timeBlockLabel,
                                    timeBlocks: timeBlockLabel,
                                    windowStart: timeGroup.windowStart,
                                    startAddress: presets?.defaultStartAddress || null,
                                    endAddress: presets?.defaultEndAddress || null,
                                    orders: uniqueRouteOrders,
                                    geometry: routeResult.geometry
                                }
                            });

                            courierRoutesCreated++;
                            logger.info(`[TurboCalculator] ✅ Created route for ${normName}: ${uniqueRouteOrders.length} orders, ${(routeResult.distance / 1000).toFixed(2)}km`);

                            // v29.0: Update per-courier stats - use normName as key (consistent)
                            if (stats.courierStats[normName]) {
                                stats.courierStats[normName].distanceKm += (routeResult.distance || 0) / 1000;
                            }
                        }
                    } catch (e) {
                        logger.warn(`[TurboCalculator] ⚠️ Routing error for ${normName} [${windowKey}]: ${e.message}`);
                        stats.skippedOther += orders.length;
                    }
                } // End of windows loop

                logger.info(`[TurboCalculator] ✅ Courier ${normName}: created ${courierRoutesCreated} routes`);

                // v28.9: Increment processedCouriers once per courier (outside window loop)
                if (!processedCourierNames.has(normName)) {
                    processedCourierNames.add(normName);
                    stats.processedCouriers = processedCourierNames.size;
                    emitStatus(); // Push fresh status after each courier is done
                }
            } // End of courier loop

            // Update processedCount to match total processed orders
            stats.processedCount = stats.totalCount;

            // v29.0: Fetch created routes for frontend (use JSON filter for compatibility with old rows)
            let routeDataForFrontend = [];
            let totalRoutesCreated = 0;

            if (Route) {
                try {
                    const recentRoutes = await Route.findAll({
                        where: {
                            [Op.and]: [
                                sequelize.where(
                                    sequelize.literal("route_data->>'target_date'"),
                                    cache.target_date
                                ),
                                sequelize.where(
                                    sequelize.literal("route_data->>'target_date'"),
                                    { [Op.not]: null }
                                )
                            ]
                        },
                        order: [['calculated_at', 'DESC']],
                        limit: 200
                    });

                    // Filter to only this division
                    const divisionRoutes = recentRoutes.filter(r =>
                        r.division_id === cache.division_id ||
                        r.route_data?.divisionId === cache.division_id ||
                        !r.division_id // legacy rows without division_id
                    );

                    totalRoutesCreated = divisionRoutes.length;
                    routeDataForFrontend = divisionRoutes.map(r => ({
                        id: r.id,
                        courier: r.courier_id,
                        totalDistance: parseFloat(r.total_distance || 0),
                        totalDuration: r.total_duration,
                        ordersCount: r.orders_count,
                        timeBlock: r.route_data?.deliveryWindow || r.route_data?.timeBlocks,
                        startAddress: r.route_data?.startAddress,
                        endAddress: r.route_data?.endAddress,
                        orders: r.route_data?.orders || [],
                        geometry: r.route_data?.geometry || null
                    }));
                    logger.info(`[OrderCalculator] 📦 Fetched ${routeDataForFrontend.length} routes for frontend`);
                } catch (e) {
                    logger.warn(`[OrderCalculator] ⚠️ Failed to fetch routes: ${e.message}`);
                }
            }

            // Always emit routes update when processing is done
            if (this.io) {
                // Extract unique window labels for the frontend
                const allWindowLabels = Array.from(new Set(
                    Array.from(deliveryWindows.values()).flat().map(w => w.windowLabel)
                ));

                // v5.153: Build enriched couriers array with distanceKm and ordersCount
                // This lets the Couriers tab update immediately without waiting for dashboard:update
                const enrichedCouriers = Object.values(stats.courierStats || {}).map((cs) => ({
                    name: cs.name,
                    courierName: cs.name,
                    distanceKm: Number((cs.distanceKm || 0).toFixed(2)),
                    calculatedOrders: cs.orders || 0,
                })).filter(c => c.distanceKm > 0 || c.calculatedOrders > 0);

                logger.info(`[TurboCalculator] 🚀 Emitting routes_update with ${routeDataForFrontend.length} routes, ${enrichedCouriers.length} enriched couriers`);
                this.io.emit('routes_update', {
                    divisionId: cache.division_id,
                    date: cache.target_date,
                    couriers: enrichedCouriers,
                    timeBlocks: allWindowLabels,
                    routes: routeDataForFrontend
                });
            }

            // v29.0: Cache Enrichment - write calculated distances back to api_dashboard_cache
            // Match courier names by both normalized (uppercase) and raw for maximum coverage
            if (data && Array.isArray(data.orders)) {
                try {
                    if (data.couriers && Array.isArray(data.couriers)) {
                        data.couriers.forEach(c => {
                            const rawName = c.courierName || c.name || c.courier;
                            const upperName = (rawName || '').toString().toUpperCase().trim();
                            const normName2 = rawName ? normalizeCourierName(rawName) : null;

                            // Try all key variants
                            const calc = stats.courierStats[upperName] ||
                                         stats.courierStats[normName2] ||
                                         stats.courierStats[rawName];
                            if (calc && calc.distanceKm > 0) {
                                c.distanceKm = Number((calc.distanceKm).toFixed(2));
                                c.calculatedOrders = calc.orders || 0;
                                logger.info(`[TurboCalculator] 📏 Courier ${rawName}: ${c.distanceKm} km`);
                            }
                        });
                    }

                    data.lastModified = Date.now();
                    data.source = 'turbo_robot';

                    if (typeof cache.update === 'function') {
                        await cache.update({ payload: data, updated_at: new Date() });
                    } else {
                        const DashboardCache = this.getModel('DashboardCache');
                        if (DashboardCache) {
                            await DashboardCache.update(
                                { payload: data, updated_at: new Date() },
                                { where: { id: cache.id } }
                            );
                        }
                    }

                    this.processedHashes.set(cacheKey, dataHash);
                    logger.info(`[TurboCalculator] 💾 Cache enriched: ${cacheKey}, ${stats.processedCouriers} couriers, ${totalRoutesCreated} routes`);

                    if (this.io) {
                        this.io.emit('dashboard:update', {
                            divisionId: cache.division_id,
                            date: cache.target_date,
                            data: data,
                            source: 'turbo_calculator_enrichment'
                        });
                    }
                } catch (saveErr) {
                    logger.error(`[TurboCalculator] ❌ Failed to enrich cache: ${saveErr.message}`);
                }
            }

            // Final status push - routing complete!
            stats.currentPhase = 'complete';
            stats.message = `Complete! ${totalRoutesCreated} routes calculated`;
            stats.isActive = false;
            emitStatus();
            logger.info(`[TurboCalculator] ✅ DONE: ${totalRoutesCreated} routes, ${stats.processedCouriers} couriers processed`);

        } catch (err) {
            logger.error(`[OrderCalculator] ❌ processCache fatal: ${err.message}`);
        }
    }

    async getRobustGeocode(address, city = 'Київ') {
        if (!address) return null;
        
        const GeoCache = this.getModel('GeoCache');
        if (!GeoCache) return null;

        const cleaned = cleanAddress(address);
        const normalized = cleaned.toLowerCase();

        // Check local cache first (fastest)
        try {
            const cached = await GeoCache.findOne({
                where: { address_key: normalized, is_success: true }
            });
            if (cached) return { latitude: cached.lat, longitude: cached.lng, locationType: 'CACHED' };
        } catch (e) { /* ignore cache errors */ }

        // Try all variants from cache
        const variants = generateVariants(address, city, 10).map(v => v.toLowerCase());
        for (const variant of variants) {
            if (variant === normalized) continue;
            try {
                const cached = await GeoCache.findOne({
                    where: { address_key: variant, is_success: true }
                });
                if (cached) return { latitude: cached.lat, longitude: cached.lng, locationType: 'CACHED' };
            } catch (e) { /* ignore */ }
        }

        // Try Google Geocoding first (most accurate)
        const googleKey = process.env.GOOGLE_GEOCODE_API_KEY;
        if (googleKey) {
            try {
                const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cleaned + ', ' + city)}&key=${googleKey}&language=uk`;
                const googleRes = await axios.get(googleUrl, { timeout: 5000 });
                if (googleRes.data?.status === 'OK' && googleRes.data.results?.[0]) {
                    const r = googleRes.data.results[0];
                    const result = {
                        latitude: r.geometry.location.lat,
                        longitude: r.geometry.location.lng,
                        locationType: r.geometry.location_type || 'ROOFTOP'
                    };
                    // Cache this result
                    try {
                        await GeoCache.create({
                            address_key: normalized,
                            lat: result.latitude,
                            lng: result.longitude,
                            is_success: true,
                            provider: 'google'
                        });
                    } catch (e) { /* ignore cache write errors */ }
                    return result;
                }
            } catch (e) {
                logger.warn(`[TurboCalculator] ⚠️ Google geocoding failed: ${e.message}`);
            }
        }

        // Try local Photon first
        const PHOTON_URL = process.env.PHOTON_URL || 'http://localhost:2322';
        try {
            const photonRes = await axios.get(`${PHOTON_URL}/api?q=${encodeURIComponent(cleaned + ', ' + city)}&limit=1&lang=uk`, { timeout: 3000 });
            if (photonRes.data?.features?.length > 0) {
                const f = photonRes.data.features[0];
                const result = {
                    latitude: f.geometry.coordinates[1],
                    longitude: f.geometry.coordinates[0],
                    locationType: f.properties?.type || 'PHOTON'
                };
                // Cache it
                try {
                    await GeoCache.create({
                        address_key: normalized,
                        lat: result.latitude,
                        lng: result.longitude,
                        is_success: true,
                        provider: 'photon'
                    });
                } catch (e) { /* ignore */ }
                return result;
            }
        } catch (photonErr) {
            logger.warn(`[TurboCalculator] ⚠️ Photon failed: ${photonErr.message}`);
        }

        // Try Komoot Photon
        try {
            const photon2Res = await axios.get(`https://photon.komoot.io/api?q=${encodeURIComponent(cleaned + ', ' + city)}&limit=1&lang=uk`, { timeout: 4000 });
            if (photon2Res.data?.features?.length > 0) {
                const f = photon2Res.data.features[0];
                const result = {
                    latitude: f.geometry.coordinates[1],
                    longitude: f.geometry.coordinates[0],
                    locationType: f.properties?.type || 'PHOTON'
                };
                try {
                    await GeoCache.create({
                        address_key: normalized,
                        lat: result.latitude,
                        lng: result.longitude,
                        is_success: true,
                        provider: 'komoot'
                    });
                } catch (e) { /* ignore */ }
                return result;
            }
        } catch (e) { /* ignore */ }

        // Try Nominatim
        try {
            const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleaned + ', ' + city)}&limit=1&addressdetails=1&accept-language=uk`;
            const nomRes = await axios.get(nomUrl, { 
                timeout: 5000,
                headers: { 'User-Agent': 'KillMetraj/1.0' }
            });
            if (Array.isArray(nomRes.data) && nomRes.data.length > 0) {
                const r = nomRes.data[0];
                const result = {
                    latitude: parseFloat(r.lat),
                    longitude: parseFloat(r.lon),
                    locationType: r.type || 'NOMINATIM'
                };
                try {
                    await GeoCache.create({
                        address_key: normalized,
                        lat: result.latitude,
                        lng: result.longitude,
                        is_success: true,
                        provider: 'nominatim'
                    });
                } catch (e) { /* ignore */ }
                return result;
            }
        } catch (e) {
            logger.warn(`[TurboCalculator] ⚠️ Nominatim failed: ${e.message}`);
        }

        return null;
    }

    parseAddressGeo(addressGeo) {
        if (!addressGeo) return null;
        try {
            const latMatch = addressGeo.match(/Lat\s*=\s*"?([^"\s]+)"?/);
            const lngMatch = addressGeo.match(/Long\s*=\s*"?([^"\s]+)"?/);
            if (latMatch && lngMatch) {
                const lat = parseFloat(latMatch[1]);
                const lng = parseFloat(lngMatch[1]);
                if (!isNaN(lat) && !isNaN(lng) && lat > 0 && lng > 0) {
                    return { lat, lng };
                }
            }
        } catch (e) {
            // ignore parse errors
        }
        return null;
    }

    extractCoordsFromOrders(orders) {
        for (const o of orders) {
            // Already have coords
            if (o.coords?.lat) continue;
            
            // Try lat/lng direct fields
            if (o.lat && o.lng) {
                o.coords = { lat: Number(o.lat), lng: Number(o.lng) };
                continue;
            }
            
            // Try addressGeo field (legacy format)
            if (o.addressGeo) {
                const parsed = this.parseAddressGeo(o.addressGeo);
                if (parsed) {
                    o.coords = parsed;
                    continue;
                }
            }
            
            // Try geocoded field
            if (o.geocoded && o.lat && o.lng) {
                o.coords = { lat: Number(o.lat), lng: Number(o.lng) };
                continue;
            }
            
            // Try raw API data
            if (o.raw?.lat && o.raw?.lng) {
                o.coords = { lat: Number(o.raw.lat), lng: Number(o.raw.lng) };
                continue;
            }
        }
        return orders;
    }

    groupOrdersByCourier(orders) {
        // First extract coords from addressGeo
        this.extractCoordsFromOrders(orders);

        const groups = {};
        for (const o of orders) {
            const rawName = o.courierName || o.courier;
            if (!rawName) continue; // no courier assigned
            const cName = String(rawName).trim();
            // Skip unassigned or dummy IDs
            const cNameUpper = cName.toUpperCase();
            if (cName === 'Не назначено' || cNameUpper === 'НЕ НАЗНАЧЕНО' || cName === 'ID:0' || cName === 'по' || cName.startsWith('ID:')) {
                continue;
            }
            if (!groups[cName]) groups[cName] = [];
            groups[cName].push(o);
        }
        // Ensure we don't expose a group for unassigned orders
        delete groups['Не назначено'];
        delete groups['НЕ НАЗНАЧЕНО'];
        return groups;
    }

    /**
     * Group orders by time blocks (e.g., 13:00-13:30, 13:30-14:00, etc.)
     * Uses 'deliverBy' or 'plannedTime' field for grouping
     */
    groupOrdersByTimeBlocks(orders, blockDurationMinutes = 30) {
        const blocks = {};

        orders.forEach(o => {
            // Get delivery time from available fields
            const deliveryTime = o.deliverBy || o.plannedTime || o.deliveryTime;
            if (!deliveryTime) {
                // If no time, put in 'no-time' block
                if (!blocks['no-time']) blocks['no-time'] = [];
                blocks['no-time'].push(o);
                return;
            }

            // Parse time (format "HH:MM" or "HH:MM:SS")
            let hours, minutes;
            if (typeof deliveryTime === 'string') {
                const timeParts = deliveryTime.split(':');
                hours = parseInt(timeParts[0], 10);
                minutes = parseInt(timeParts[1], 10);
            } else {
                // If deliveryTime is not a string, try to parse as number (minutes from midnight)
                hours = Math.floor(deliveryTime / 60);
                minutes = deliveryTime % 60;
            }

            if (isNaN(hours) || isNaN(minutes)) {
                if (!blocks['invalid-time']) blocks['invalid-time'] = [];
                blocks['invalid-time'].push(o);
                return;
            }

            // Calculate block start time (rounded down to nearest blockDurationMinutes)
            const totalMinutes = hours * 60 + minutes;
            const blockStartMinutes = Math.floor(totalMinutes / blockDurationMinutes) * blockDurationMinutes;
            const blockEndMinutes = blockStartMinutes + blockDurationMinutes;

            // Format block key (e.g., "13:00-13:30")
            const blockStartHours = Math.floor(blockStartMinutes / 60);
            const blockStartMins = blockStartMinutes % 60;
            const blockEndHours = Math.floor(blockEndMinutes / 60);
            const blockEndMins = blockEndMinutes % 60;

            const blockKey = `${String(blockStartHours).padStart(2, '0')}:${String(blockStartMins).padStart(2, '0')}-${String(blockEndHours).padStart(2, '0')}:${String(blockEndMins).padStart(2, '0')}`;

            if (!blocks[blockKey]) blocks[blockKey] = [];
            blocks[blockKey].push(o);
        });

        // Sort blocks by time
        const sortedBlocks = {};
        Object.keys(blocks)
            .sort((a, b) => {
                if (a === 'no-time' || a === 'invalid-time') return 1;
                if (b === 'no-time' || b === 'invalid-time') return -1;
                return a.localeCompare(b);
            })
            .forEach(key => {
                sortedBlocks[key] = blocks[key];
            });

        return sortedBlocks;
    }

    /**
     * Group orders by planned delivery time windows (15 min blocks)
     * Like frontend's groupOrdersByTimeWindow - strict 15-min window from first order
     * Returns structure: { "14:00": { "Courier1": [orders], "Courier2": [orders] }, ... }
     * Orders without delivery time are SKIPPED
     */
    groupOrdersByTimeWindowLikeFrontend(orders, windowMinutes = 15) {
        this.extractCoordsFromOrders(orders);

        // Group by courier first
        const courierGroups = this.groupOrdersByCourier(orders);

        const result = {};

        Object.entries(courierGroups).forEach(([courier, courierOrders]) => {
            // Get orders with deliverBy or plannedTime (not 00:00)
            const ordersWithData = [];

            courierOrders.forEach(o => {
                // Get planned/delivery time
                let plannedTime = o.deliverBy || o.plannedTime || o.deliveryTime;

                // Get arrival time (when order was created/assigned)
                let arrivalTime = o.creationTime || o.createdAt || o.assignTime || o.receivedTime;

                if (!plannedTime || plannedTime === '00:00') {
                    // No delivery time - SKIP this order (don't create routes for it)
                    return;
                }

                // Parse planned time to minutes
                let plannedMinutes;
                if (typeof plannedTime === 'string') {
                    const parts = plannedTime.split(':');
                    plannedMinutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);
                } else if (typeof plannedTime === 'number') {
                    plannedMinutes = plannedTime;
                } else {
                    ordersNoTime.push(o);
                    return;
                }

                if (isNaN(plannedMinutes)) {
                    ordersNoTime.push(o);
                    return;
                }

                // Parse arrival time to timestamp (for bulk detection)
                let arrivalTs;
                if (typeof arrivalTime === 'string') {
                    arrivalTs = new Date(arrivalTime).getTime();
                } else if (typeof arrivalTime === 'number') {
                    arrivalTs = arrivalTime;
                } else {
                    arrivalTs = Date.now();
                }

                ordersWithData.push({
                    order: o,
                    planned: plannedMinutes,
                    arrival: arrivalTs
                });
            });

            // Store orders without time
            if (ordersNoTime.length > 0) {
                if (!noTimeOrders[courier]) noTimeOrders[courier] = [];
                noTimeOrders[courier].push(...ordersNoTime);
            }

            if (ordersWithData.length === 0) return;

            // Determine if bulk import (all orders arrive within 5 minutes)
            let isBulkImport = false;
            if (ordersWithData.length > 2) {
                const arrivalTimes = ordersWithData.map(o => o.arrival);
                const maxArrival = Math.max(...arrivalTimes);
                const minArrival = Math.min(...arrivalTimes);
                if (maxArrival - minArrival < 5 * 60 * 1000) {
                    isBulkImport = true;
                }
            }

            // Set anchor time: planned for bulk, arrival otherwise (like frontend)
            ordersWithData.forEach(o => {
                o.anchorTime = isBulkImport ? o.planned : o.arrival;
            });

            // Sort by anchor time first, then by planned
            ordersWithData.sort((a, b) => {
                if (a.anchorTime !== b.anchorTime) return a.anchorTime - b.anchorTime;
                return a.planned - b.planned;
            });

            // Group by strict 15-min window from FIRST order's planned time (like frontend)
            if (ordersWithData.length > 0) {
                let windowStart = ordersWithData[0].planned;
                let windowOrders = [ordersWithData[0].order];

                for (let i = 1; i < ordersWithData.length; i++) {
                    const orderPlanned = ordersWithData[i].planned;

                    // Strict: if within windowMinutes from window START, add to current group
                    if (orderPlanned - windowStart < windowMinutes) {
                        windowOrders.push(ordersWithData[i].order);
                    } else {
                        // Close current window
                        const windowKey = this.formatMinutesToTime(windowStart);
                        if (!result[windowKey]) result[windowKey] = {};
                        if (!result[windowKey][courier]) result[windowKey][courier] = [];
                        result[windowKey][courier].push(...windowOrders);

                        // Start new window from this order's planned time
                        windowStart = orderPlanned;
                        windowOrders = [ordersWithData[i].order];
                    }
                }

                // Don't forget last window
                const windowKey = this.formatMinutesToTime(windowStart);
                if (!result[windowKey]) result[windowKey] = {};
                if (!result[windowKey][courier]) result[windowKey][courier] = [];
                result[windowKey][courier].push(...windowOrders);
            }
        });

        // Orders without time are SKIPPED - they don't get routes
        // (no-time orders should not be part of Turbo Robot routes)

        return result;
    }

    /**
     * Group by arrival/creation time (like frontend uses)
     */
    groupOrdersByArrivalTime(orders, windowMinutes = 15) {
        this.extractCoordsFromOrders(orders);

        // Group by courier first
        const courierGroups = this.groupOrdersByCourier(orders);

        const result = {};

        Object.entries(courierGroups).forEach(([courier, courierOrders]) => {
            // Get orders with deliverBy (not 00:00)
            const ordersWithTime = courierOrders.filter(o => o.deliverBy && o.deliverBy !== '00:00');

            if (ordersWithTime.length === 0) return;

            // Sort by deliverBy
            ordersWithTime.sort((a, b) => {
                const timeA = a.deliverBy || '00:00';
                const timeB = b.deliverBy || '00:00';
                return timeA.localeCompare(timeB);
            });

            // Convert to minutes
            const ordersWithMinutes = ordersWithTime.map(o => {
                const time = o.deliverBy;
                const parts = time.split(':');
                const minutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);
                return { ...o, _minutes: minutes };
            });

            // Group by 15-min STRICT window from first order (like frontend)
            if (ordersWithMinutes.length > 0) {
                let windowStart = ordersWithMinutes[0]._minutes;
                let windowOrders = [ordersWithMinutes[0]];

                for (let i = 1; i < ordersWithMinutes.length; i++) {
                    const orderMinutes = ordersWithMinutes[i]._minutes;

                    // Strict: if within 15 min from window START, add to current group
                    if (orderMinutes - windowStart < windowMinutes) {
                        windowOrders.push(ordersWithMinutes[i]);
                    } else {
                        // Close current window
                        const windowKey = this.formatMinutesToTime(windowStart);
                        if (!result[windowKey]) result[windowKey] = {};
                        result[windowKey][courier] = windowOrders;

                        // Start new window
                        windowStart = orderMinutes;
                        windowOrders = [ordersWithMinutes[i]];
                    }
                }

                // Don't forget last window
                const windowKey = this.formatMinutesToTime(windowStart);
                if (!result[windowKey]) result[windowKey] = {};
                result[windowKey][courier] = windowOrders;
            }
        });

        return result;
    }

    /**
     * Legacy function - unused now
     */
    groupOrdersByDeliverByTime(orders, windowMinutes = 15) {
        this.extractCoordsFromOrders(orders);

        // Get orders with a courier assigned AND have plannedTime/deliverBy
        const ordersWithTime = orders.filter(o => {
            const rawName = o.courierName || o.courier;
            const cName = String(rawName || '').trim();
            // Skip unassigned
            if (!cName || cName === 'Не назначено' || cName === 'ID:0' || cName === 'по' || cName.startsWith('ID:')) {
                return false;
            }
            return o.plannedTime || o.deliverBy;
        });

        // Sort by plannedTime (primary) or deliverBy
        ordersWithTime.sort((a, b) => {
            const timeA = a.plannedTime || a.deliverBy || '00:00';
            const timeB = b.plannedTime || b.deliverBy || '00:00';
            return timeA.localeCompare(timeB);
        });

        const result = {};

        ordersWithTime.forEach(order => {
            const rawName = order.courierName || order.courier;
            const cName = String(rawName || '').trim();
            if (!cName || cName === 'Не назначено' || cName === 'ID:0' || cName === 'по' || cName.startsWith('ID:')) {
                return;
            }

            // Use plannedTime if available, else deliverBy
            const plannedTime = order.plannedTime || order.deliverBy;
            if (!plannedTime || plannedTime === '00:00') return;

            let orderMinutes;
            if (typeof plannedTime === 'string') {
                const parts = plannedTime.split(':');
                orderMinutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);
            } else {
                return;
            }

            if (isNaN(orderMinutes)) return;

            if (!result[cName]) result[cName] = [];
            result[cName].push({ ...order, _deliverMinutes: orderMinutes });
        });

        // Group by SLIDING 15-min windows (like frontend)
        const finalResult = {};
        Object.entries(result).forEach(([courier, courierOrders]) => {
            const sorted = courierOrders.sort((a, b) => a._deliverMinutes - b._deliverMinutes);

            if (sorted.length === 0) return;

            // First order defines the window start
            let windowStart = sorted[0]._deliverMinutes;
            let windowOrders = [sorted[0]];

            for (let i = 1; i < sorted.length; i++) {
                const orderMinutes = sorted[i]._deliverMinutes;

                // If within windowMinutes from window START, add to current group
                // This is the key: sliding window from first order, not from last
                if (orderMinutes - windowStart < windowMinutes * 2) {
                    // Within 30 mins from start = same route
                    windowOrders.push(sorted[i]);
                } else {
                    // Close current window and start new one
                    const windowKey = this.formatMinutesToTime(windowStart);
                    if (!finalResult[windowKey]) finalResult[windowKey] = {};
                    if (!finalResult[windowKey][courier]) finalResult[windowKey][courier] = [];
                    finalResult[windowKey][courier].push(...windowOrders);

                    // Start new window from this order
                    windowStart = orderMinutes;
                    windowOrders = [sorted[i]];
                }
            }

            // Don't forget the last window
            const windowKey = this.formatMinutesToTime(windowStart);
            if (!finalResult[windowKey]) finalResult[windowKey] = {};
            if (!finalResult[windowKey][courier]) finalResult[windowKey][courier] = [];
            finalResult[windowKey][courier].push(...windowOrders);
        });

        return finalResult;
    }

    formatMinutesToTime(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    /**
     * Group orders by time blocks AND courier
     * Returns structure: { "13:00-13:30": { "Courier1": [orders], "Courier2": [orders] }, ... }
     */
    groupOrdersByTimeBlocksAndCourier(orders, blockDurationMinutes = 30) {
        // First extract coords from all orders
        this.extractCoordsFromOrders(orders);
        const timeBlocks = this.groupOrdersByTimeBlocks(orders, blockDurationMinutes);
        const result = {};

        Object.entries(timeBlocks).forEach(([blockKey, blockOrders]) => {
            const courierGroups = this.groupOrdersByCourier(blockOrders);
            // Include time blocks even if they have 0 couriers (for debugging)
            if (Object.keys(courierGroups).length > 0 || blockOrders.length > 0) {
                result[blockKey] = courierGroups;
            }
        });

        return result;
    }

    calculateRouteHash(orders, courierName) {
        const ids = orders.map(o => o.id || o.number).sort().join(',');
        const coords = orders.map(o => `${o.coords.lat},${o.coords.lng}`).sort().join('|');
        return `${courierName}|${ids}|${coords}`;
    }

    async calculateRoute(orders, divisionId = null, startPoint = null, endPoint = null) {
        if (orders.length < 1) {
            return null;
        }

        // v25.0: Load division-specific presets
        const presets = divisionId ? await this.getDivisionPresets(divisionId) : null;
        const customOsrmUrl = presets?.osrmUrl || presets?.yapikoOsrmUrl;
        const customValhallaUrl = presets?.valhallaUrl || presets?.vhvUrl;
        const customPhotonUrl = presets?.photonUrl;

        // Build points array: start -> order addresses -> end
        const points = [];

        // Add start point if provided
        if (startPoint) {
            points.push({ lat: Number(startPoint.lat), lng: Number(startPoint.lng), type: 'start' });
        }

        // Add order addresses - v28.7: Deduplicate consecutive same-coordinates to optimize OSRM
        let lastCoordKey = startPoint ? `${Number(startPoint.lat).toFixed(5)},${Number(startPoint.lng).toFixed(5)}` : null;
        
        orders.forEach(o => {
            const lat = Number(o.coords?.lat || o.lat);
            const lng = Number(o.coords?.lng || o.lng);
            if (lat && lng) {
                const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
                if (key !== lastCoordKey) {
                    points.push({ lat, lng, type: 'order' });
                    lastCoordKey = key;
                }
            }
        });

        // Add end point if provided and not same as last point
        if (endPoint) {
            const lat = Number(endPoint.lat);
            const lng = Number(endPoint.lng);
            const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
            if (key !== lastCoordKey) {
                points.push({ lat, lng, type: 'end' });
            }
        }

        // Need at least 2 points for a route
        if (points.length < 2) {
            logger.warn(`[TurboCalculator] ⚠️ Not enough points for route: ${points.length}`);
            return null;
        }

        const coordsStr = points.map(p => `${p.lng.toFixed(7)},${p.lat.toFixed(7)}`).join(';');
        logger.info(`[TurboCalculator] 🛣️ Calculating route: ${points.length} pts, orders: ${orders.length}, path: ${coordsStr.slice(0, 50)}...`);

        if (startPoint && endPoint) {
            const distHaversine = this.calculateDistance(startPoint, endPoint);
            if (distHaversine > 100000) { // Check > 100km 
                 logger.warn(`[TurboCalculator] ⚠️ Base-to-Base distance is huge (${(distHaversine/1000).toFixed(1)}km). Check settings!`);
            }
        }

        // v2.2: Multi-engine race - Yapiko OSRM is PRIORITY, others as fallback
        const engines = [
            {
                name: 'yapiko-osrm',
                priority: 1,
                calculate: async () => {
                    const baseUrl = (customOsrmUrl || this.osrmUrl).trim().replace(/\/+$/, '');
                    const url = `${baseUrl}/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
                    const response = await axios.get(url, { timeout: 8000 });
                    if (response.data?.routes?.[0]) {
                        const r = response.data.routes[0];
                        if (r.distance > 500000) return null; // Sanity check: > 500km is likely error
                        return {
                            distance: r.distance,
                            duration: r.duration,
                            geometry: r.geometry,
                            engine: 'yapiko-osrm'
                        };
                    }
                    return null;
                }
            },
            {
                name: 'valhalla',
                priority: 2,
                calculate: async () => {
                    const vUrl = (customValhallaUrl || process.env.VALHALLA_URL || 'http://valhalla.yapiko.kh.ua').trim().replace(/\/+$/, '');
                    const request = {
                        locations: points.map(p => ({ lat: p.lat, lon: p.lng })),
                        costing: 'auto',
                        directions_options: { units: 'kilometers' }
                    };
                    const response = await axios.post(`${vUrl}/route`, request, {
                        timeout: 10000,
                        headers: { 'Content-Type': 'application/json' }
                    });
                    if (response.data?.trip?.summary) {
                        const trip = response.data.trip;
                        const totalDistanceMeters = trip.summary.length * 1000;
                        const totalDurationSeconds = trip.summary.time;
                        
                        if (totalDistanceMeters > 500000) return null;
                        
                        logger.info(`[TurboCalculator] 🏁 Valhalla result: ${trip.summary.length.toFixed(2)} km, ${totalDurationSeconds} sec`);
                        
                        return {
                            distance: totalDistanceMeters,
                            duration: totalDurationSeconds,
                            geometry: this.decodeValhallaPath(trip.legs),
                            engine: 'valhalla'
                        };
                    }
                    return null;
                }
            },
            {
                name: 'photon-osrm',
                priority: 3,
                calculate: async () => {
                    const pUrl = (customPhotonUrl || process.env.PHOTON_URL || 'https://photon.komoot.io').trim().replace(/\/+$/, '');
                    const url = `${pUrl}/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
                    const response = await axios.get(url, { timeout: 10000 });
                    if (response.data?.routes?.[0]) {
                        const r = response.data.routes[0];
                        if (r.distance > 500000) return null;
                        return {
                            distance: r.distance,
                            duration: r.duration,
                            geometry: r.geometry,
                            engine: 'photon-osrm'
                        };
                    }
                    return null;
                }
            },
            {
                name: 'osrm-public',
                priority: 4,
                calculate: async () => {
                    const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
                    const response = await axios.get(url, { timeout: 10000 });
                    if (response.data?.routes?.[0]) {
                        const r = response.data.routes[0];
                        if (r.distance > 500000) return null;
                        return {
                            distance: r.distance,
                            duration: r.duration,
                            geometry: r.geometry,
                            engine: 'osrm-public'
                        };
                    }
                    return null;
                }
            }
        ];

        // Sort by priority (Yapiko first)
        engines.sort((a, b) => a.priority - b.priority);

        // Try engines in order, return first success
        for (const engine of engines) {
            try {
                const result = await engine.calculate();
                if (result && result.distance > 0) {
                    logger.info(`[OrderCalculator] ✅ Route calculated with ${engine.name}: ${(result.distance / 1000).toFixed(2)} km, ${Math.round(result.duration / 60)} min`);
                    return result;
                }
            } catch (err) {
                logger.warn(`[OrderCalculator] ⚠️ ${engine.name} failed: ${err.message}`);
            }
        }

        // Try Google Routes API as additional fallback
        const googleKey = process.env.GOOGLE_ROUTES_API_KEY;
        if (googleKey && points.length <= 25) {
            try {
                const waypoints = points.map(p => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } }));
                const googleUrl = `https://routes.googleapis.com/v1:computeRoutes?key=${googleKey}`;
                const googleBody = {
                    origin: waypoints[0],
                    destination: waypoints[waypoints.length - 1],
                    intermediates: waypoints.slice(1, -1),
                    travelMode: 'DRIVE',
                    routingPreference: 'TRAFFIC_AWARE',
                    computeBestOrder: false,
                    returnRoutes: true
                };
                const googleRes = await axios.post(googleUrl, googleBody, {
                    timeout: 10000,
                    headers: { 'Content-Type': 'application/json' }
                });
                if (googleRes.data?.routes?.[0]) {
                    const r = googleRes.data.routes[0];
                    return {
                        distance: r.distanceMeters || 0,
                        duration: (r.duration?.seconds || 0),
                        geometry: r.polyline?.encodedPolyline ? { type: 'LineString', coordinates: [] } : null,
                        engine: 'google-routes'
                    };
                }
            } catch (e) {
                logger.warn(`[OrderCalculator] ⚠️ Google Routes failed: ${e.message}`);
            }
        }

        // Fallback: Smart straight-line distance with better estimation
        logger.warn(`[OrderCalculator] ⚠️ All engines failed, using smart fallback`);
        let totalDistance = 0;
        
        for (let i = 0; i < points.length - 1; i++) {
            const dist = this.calculateDistance(points[i], points[i + 1]);
            const factor = dist > 5000 ? 1.4 : 1.3;
            totalDistance += dist * factor;
        }

        const avgSpeedKmH = totalDistance > 10000 ? 35 : 25;
        
        return {
            distance: totalDistance,
            duration: (totalDistance / 1000) / avgSpeedKmH * 3600,
            engine: 'smart-fallback'
        };
    }

    /**
     * Fetch presets for a specific division to get custom engine URLs
     */
    async getDivisionPresets(divisionId) {
        try {
            if (!divisionId) return null;
            const User = this.getModel('User');
            const UserPreset = this.getModel('UserPreset');
            if (!User || !UserPreset) return null;

            const user = await User.findOne({ where: { divisionId: String(divisionId), role: 'admin' } })
                || await User.findOne({ where: { divisionId: String(divisionId) } });

            if (!user) return null;

            const preset = await UserPreset.findOne({ where: { userId: user.id } });
            return preset ? preset.settings : null;
        } catch (error) {
            logger.warn(`[OrderCalculator] ⚠️ Failed to fetch presets for division ${divisionId}:`, error.message);
            return null;
        }
    }

    /**
     * Calculate distance between two points (Haversine formula)
     */
    calculateDistance(p1, p2) {
        const R = 6371000; // Earth radius in meters
        const lat1 = p1.lat * Math.PI / 180;
        const lat2 = p2.lat * Math.PI / 180;
        const deltaLat = (p2.lat - p1.lat) * Math.PI / 180;
        const deltaLng = (p2.lng - p1.lng) * Math.PI / 180;

        const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }
    /**
     * Decode Valhalla legs into GeoJSON/Simple path for the UI
     */
    decodeValhallaPath(legs) {
        if (!legs || !Array.isArray(legs)) return null;
        try {
            const shapes = legs.map(leg => leg.shape).filter(Boolean);
            if (shapes.length > 0) {
                return shapes[0];
            }
        } catch (e) {
            logger.warn(`[TurboCalculator] ⚠️ Failed to decode Valhalla path`, e.message);
        }
        return null;
    }
}

// v28.5: Export instance for simple_server.js / start_turbo.js
module.exports = new OrderCalculator();
