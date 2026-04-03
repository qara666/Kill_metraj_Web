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

/**
 * v5.164: Robust date normalization to YYYY-MM-DD
 */
function normalizeDateISO(dateStr) {
    if (!dateStr) return null;
    if (typeof dateStr !== 'string') return dateStr;
    
    // Handle DD-MM-YYYY or DD.MM.YYYY
    const sep = dateStr.includes('-') ? '-' : (dateStr.includes('.') ? '.' : null);
    if (sep) {
        const parts = dateStr.split(sep);
        if (parts[0].length === 2 && parts[2].length === 4) {
             return `${parts[2]}-${parts[1]}-${parts[0]}`; // Convert to YYYY-MM-DD
        }
    }
    
    // Already YYYY-MM-DD?
    if (dateStr.includes('-') && dateStr.split('-')[0].length === 4) {
        return dateStr;
    }
    
    return dateStr;
}

class OrderCalculator {
    constructor() {
        this.isRunning = false;
        this.interval = 15000;
        this.timer = null;
        this.isProcessing = false;
        this.io = null;

        // Settings
        this.osrmUrl = process.env.YAPIKO_OSRM_URL || process.env.OSRM_URL || 'http://116.204.153.171:5050';

        // v23.1: Persistent Geocache
        this.geocache = new Map();
        this.addressUtils = require('../src/utils/addressUtils');

        // Per-division state
        this.divisionStates = new Map();
        this.processedHashes = new Map();
        this.priorityQueue = [];
        this.currentPriority = null;

        // v5.170: NO auto-start — robot ONLY runs when user clicks "Запустить"
        this.activeDivisionId = null;
        this.activeDivisionDate = null;

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
        // v5.170: DO NOT auto-load division states from DB — robot starts OFF by default
        // this.loadAllDivisionStatesFromDB(); // REMOVED — only trigger on explicit start
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

        await new Promise(resolve => setTimeout(resolve, 1000));

        logger.info(`[TurboCalculator] 🚀 v5.170 INITIALIZED — Robot is OFF. Waiting for explicit start command.`);

        try {
            const models = require('../src/models');
            logger.info(`[OrderCalculator] ✅ Models loaded: ${Object.keys(models).filter(k => k !== 'sequelize' && k !== 'syncDatabase').join(', ')}`);
        } catch (error) {
            logger.error('[OrderCalculator] ❌ Failed to load models:', error.message);
        }

        // v5.170: DO NOT auto-resume any divisions. Robot stays OFF until user clicks "Запустить".
        // The tick() will only be called from trigger() (manual start button).
        logger.info(`[TurboCalculator] ⏸️ Robot in STANDBY mode. No divisions active.`);
    }

    scheduleNextTick() {
        if (this.timer) clearTimeout(this.timer);

        // v5.170: Only schedule next tick if there are active divisions
        const hasActiveDivision = Array.from(this.divisionStates.values()).some(s => s.isActive);
        if (!hasActiveDivision) {
            logger.info('[TurboCalculator] ⏸️ No active divisions — stopping tick loop');
            return;
        }

        this.timer = setTimeout(() => this.tick(), this.interval);
    }

    /**
     * Trigger calculation for a division - supports multi-division (memory only)
     * @param {string} divisionId - Division to start
     * @param {string} date - Date to process
     * @param {string} userId - User initiating trigger
     */
    trigger(divisionId, date = null, userId = null) {
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

        // v5.170: ALWAYS clear hash on manual trigger to force recalculation
        this.processedHashes.delete(cacheKey);
        logger.info(`[TurboCalculator] 💥 Manual trigger: Cleared processedHash for ${cacheKey}`);

        let state = this.divisionStates.get(divisionId);
        if (!state) {
            state = { users: new Set(), date: targetDate, priorityQueue: [], currentPriority: null, isActive: true };
            this.divisionStates.set(divisionId, state);
        } else {
            // v5.170: Reactivate if was stopped
            state.isActive = true;
            state.date = targetDate;
        }
        if (userId) state.users.add(userId);

        // Persist activation to DB
        try {
            const DashboardDivisionState = this.getModel('DashboardDivisionState');
            if (DashboardDivisionState && userId) {
                const uid = Number(userId);
                DashboardDivisionState.upsert({
                    user_id: uid,
                    division_id: String(divisionId),
                    date: targetDate,
                    is_active: true,
                    data: {}
                }).catch(err => logger.warn('[TurboCalculator] Failed to persist division state:', err.message));
            }
        } catch (e) { /* ignore */ }

        // Trigger calculation
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
        // v5.170: Clear the timer IMMEDIATELY to prevent any further ticks
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        if (divisionId) {
            const state = this.divisionStates.get(String(divisionId));
            if (state) {
                state.isActive = false;
            }
            this.divisionStates.delete(String(divisionId));
            this.processedHashes.delete(`${divisionId}_${state?.date || ''}`);

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

            // Emit stopped status
            if (this.io) {
                this.io.emit('robot_status', {
                    divisionId,
                    isActive: false,
                    message: 'Robot stopped by user',
                    totalCount: 0,
                    processedCount: 0
                });
            }

            logger.info(`[TurboCalculator] ⏹️ Background calculation stopped for ${divisionId}`);
        } else {
            // v5.170: Stop ALL divisions completely
            this.activeDivisionId = null;
            this.activeDivisionDate = null;
            this.priorityQueue = [];
            this.divisionStates.clear();
            this.processedHashes.clear();

            // Persist stop across all divisions
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

            // Emit stopped status
            if (this.io) {
                this.io.emit('robot_status', {
                    isActive: false,
                    message: 'Robot stopped globally',
                    totalCount: 0,
                    processedCount: 0
                });
            }

            logger.info(`[TurboCalculator] ⏹️ Background calculation stopped globally — ALL divisions cleared, timer removed`);
        }
    }

    async tick() {
        if (this.isProcessing) return;

        const hasActiveDivision = Array.from(this.divisionStates.values()).some(s => s.isActive);
        if (!hasActiveDivision) {
            logger.info('[TurboCalculator] ⏸️ No active divisions — tick skipped');
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;
        this.needsReRun = false;

        try {
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

            const tasks = [];
            for (const [divId, state] of this.divisionStates.entries()) {
                if (!state.isActive) continue;

                let targetDate = state.date;
                logger.info(`[TurboCalculator] ⚙️ Starting tick for ${divId} on ${targetDate}`);
                tasks.push(this.processDay(targetDate, divId));
            }
            await Promise.all(tasks);
        } catch (err) {
            logger.error('[OrderCalculator] ❌ Robot Tick critical failure:', err);
            // v5.170: Emit error status so frontend knows something went wrong
            if (this.io) {
                this.io.emit('robot_status', {
                    isActive: false,
                    lastUpdate: Date.now(),
                    message: `Error: ${err.message}`,
                    totalCount: 0,
                    processedCount: 0
                });
            }
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
            logger.info(`[TurboCalculator] 📅 processDay called: date=${dateISO}, division=${priorityDivisionId || 'all'}`);

            const DashboardCache = this.getModel('DashboardCache');
            if (!DashboardCache) {
                logger.error('[TurboCalculator] ❌ DashboardCache model not found — cannot process');
                return;
            }

            let caches;
            if (priorityDivisionId && priorityDivisionId !== 'all') {
                caches = await DashboardCache.findAll({
                    where: { target_date: dateISO, division_id: String(priorityDivisionId) }
                });
            } else {
                caches = await DashboardCache.findAll({ where: { target_date: dateISO } });
            }

            logger.info(`[TurboCalculator] 📊 Found ${caches?.length || 0} DashboardCache records for ${dateISO}`);

            if (!caches || caches.length === 0) {
                logger.warn(`[TurboCalculator] ⚠️ No DashboardCache found for date ${dateISO} (division: ${priorityDivisionId || 'all'})`);
                if (this.io) {
                    this.io.emit('robot_status', {
                        divisionId: priorityDivisionId,
                        date: dateISO,
                        isActive: false,
                        currentPhase: 'error',
                        message: `Нет данных за ${dateISO}. Проверьте Dashboard Fetcher.`,
                        totalCount: 0,
                        processedCount: 0
                    });
                }
                return;
            }

            if (caches.length === 0) {
                logger.info(`[TurboCalculator] ⚠️ No data found for ${priorityDivisionId || 'all'} on ${dateISO}`);
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

            // v28.0: If processing 'all', emit aggregated status
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

            // v5.145: Process only ONE cache per division/date — the largest one
            const primaryCache = caches.reduce((best, c) => {
                const currentCount = c.payload?.orders?.length || 0;
                const bestCount = best?.payload?.orders?.length || 0;
                return currentCount > bestCount ? c : best;
            }, null);

            if (caches.length > 1) {
                logger.warn(`[TurboCalculator] ⚠️ Found ${caches.length} caches for ${priorityDivisionId} on ${dateISO}, using the largest one (${primaryCache?.payload?.orders?.length} orders)`);
            }

            if (primaryCache) {
                logger.info(`[TurboCalculator] 🔄 Processing cache: id=${primaryCache.id}, orders=${primaryCache.payload?.orders?.length || 0}, division=${primaryCache.division_id}`);
                await this.processCache(primaryCache);
            } else {
                logger.error('[TurboCalculator] ❌ primaryCache is null after reduce!');
            }
        } catch (err) {
            logger.error(`[OrderCalculator] ❌ processDay error (${dateISO}):`, err);
        }
    }

    async processCache(cache) {
        try {
            const data = cache.payload;
            const targetDateNorm = normalizeDateISO(cache.target_date);
            
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

            // v5.170: Deep Stable Deduplication - Ignore transient fields like statusTimings/updated_at
            // v5.157: REMOVED status from hash - it changes constantly and shouldn't trigger re-calculation
            // v5.170: Hash includes courier assignment so NEW orders on existing couriers trigger recalc
            const crypto = require('crypto');
            const stablePayload = (data.orders || []).map(o => ({
                id: o.id || o._id,
                n: o.orderNumber,
                c: String(o.courier || o.courierName || o.courierId || '').toUpperCase(),
                a: String(o.address || o.addressGeo || '').toLowerCase(),
                ll: o.coords ? `${o.coords.lat},${o.coords.lng}` : null,
                t: o.deliverBy || o.plannedTime || o.deliveryTime,
                arr: o.arrivedAt || o.createdAt || null
            }));

            const dataHash = crypto.createHash('sha256').update(JSON.stringify(stablePayload)).digest('hex');
            const cacheKey = `${cache.division_id}_${cache.target_date}`;

            const existingHash = this.processedHashes.get(cacheKey);
            logger.info(`[TurboCalculator] 🤖 Data Hash [${cacheKey}]: ${dataHash.substring(0, 12)}... (Previous: ${existingHash ? existingHash.substring(0, 12) + '...' : 'none'})`);

            if (existingHash === dataHash) {
                logger.info(`[TurboCalculator] ⏩ Data for ${cacheKey} unchanged, skipping calculation`);
                if (this.io) {
                    this.io.emit('robot_status', {
                        divisionId: cache.division_id,
                        date: cache.target_date,
                        isActive: false,
                        currentPhase: 'complete',
                        message: 'Data up-to-date (no changes)',
                        totalCount: data.orders.length
                    });
                }
                return;
            }

            // v5.170: Data HAS changed — log what changed
            if (existingHash) {
                logger.info(`[TurboCalculator] 🔄 Data changed for ${cacheKey} — recalculating routes`);
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

            // v5.163: Calculate true "Assigned" count for accurate progress tracking
            const assignedOrdersCount = data.orders.filter(o => {
                const n = normalizeCourierName(o.courier);
                return n && n !== 'НЕ НАЗНАЧЕНО';
            }).length;
            const unassignedCount = data.orders.length - assignedOrdersCount;

            const stats = {
                isActive: true,
                lastUpdate: Date.now(),
                totalCount: assignedOrdersCount, 
                unassignedCount: unassignedCount,
                processedCount: 0,
                totalCouriers: deliveryWindows.size, 
                processedCouriers: 0,
                skippedGeocoding: 0,
                skippedInRoutes: 0,
                message: `Analyzing ${assignedOrdersCount} orders across ${deliveryWindows.size} couriers...`
            };
            
            if (unassignedCount > 0) {
                stats.message += ` (${unassignedCount} unassigned orders skipped)`;
                logger.info(`[TurboCalculator] ⏩ Skipping ${unassignedCount} unassigned orders in ${cache.division_id}`);
            }
            
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
            logger.info(`[TurboCalculator] 📊 Starting: ${stats.totalCount} orders, ${stats.totalCouriers} couriers for ${cache.division_id} on ${targetDateNorm}`);

            // v25.0: Selective Geocoding Strategy
            // Only geocode orders that are in "доставляется" status and lack coordinates.
            // This happens inside the routing loop below to ensure we only spend resources on 
            // orders that are actually part of a delivery queue.
            stats.processedCount = 0;
            stats.currentPhase = 'processing';
            stats.message = 'Analyzing delivery queues...';
            emitStatus();
            logger.info(`[TurboCalculator] 🧭 Starting selective geocoding and routing for ${stats.totalCount} orders`);
            
            // v5.170: Parallel geocoding pre-pass for ALL orders in this cache
            // CRITICAL: Only geocode addresses that are NOT already in GeoCache DB
            // This prevents re-geocoding the same addresses on every tick
            const GeoCache = this.getModel('GeoCache');
            const allOrdersNeedsGeo = data.orders.filter(o => {
                if (o.coords?.lat) return false; // Already has coords
                return true;
            });

            if (allOrdersNeedsGeo.length > 0) {
                // v5.170: Pre-check GeoCache DB to skip already-geocoded addresses
                const addressesToGeocode = [];
                const dbCachedAddresses = new Map();

                // Batch check GeoCache for all unique addresses
                const uniqueAddresses = new Set(allOrdersNeedsGeo.map(o => (o.address || o.addressGeo || '').toLowerCase().trim()));
                if (GeoCache && uniqueAddresses.size > 0) {
                    try {
                        const cached = await GeoCache.findAll({
                            where: {
                                address_key: Array.from(uniqueAddresses),
                                is_success: true
                            }
                        });
                        cached.forEach(c => {
                            dbCachedAddresses.set(c.address_key, { latitude: c.lat, longitude: c.lng });
                        });
                        logger.info(`[TurboCalculator] 📦 GeoCache DB hit: ${dbCachedAddresses.size}/${uniqueAddresses.size} addresses already cached`);
                    } catch (e) {
                        logger.warn(`[TurboCalculator] ⚠️ GeoCache DB check failed: ${e.message}`);
                    }
                }

                // Filter out addresses already in DB cache
                const trulyNeedsGeo = allOrdersNeedsGeo.filter(o => {
                    const addrKey = (o.address || o.addressGeo || '').toLowerCase().trim();
                    if (dbCachedAddresses.has(addrKey)) {
                        const cached = dbCachedAddresses.get(addrKey);
                        o.coords = { lat: cached.latitude, lng: cached.longitude };
                        this.geocache.set(addrKey, cached);
                        return false;
                    }
                    // Also check session cache
                    if (this.geocache.has(addrKey)) {
                        const cached = this.geocache.get(addrKey);
                        if (cached) o.coords = { lat: cached.latitude, lng: cached.longitude };
                        return false;
                    }
                    return !!addrKey;
                });

                if (trulyNeedsGeo.length > 0) {
                    stats.currentPhase = 'geocoding';
                    stats.message = `Geocoding ${trulyNeedsGeo.length} new addresses...`;
                    emitStatus();
                    logger.info(`[TurboCalculator] 🧭 Batch geocoding: ${trulyNeedsGeo.length} truly new addresses (skipped ${allOrdersNeedsGeo.length - trulyNeedsGeo.length} cached)`);

                    // Process in chunks of 10
                    for (let i = 0; i < trulyNeedsGeo.length; i += 10) {
                        const chunk = trulyNeedsGeo.slice(i, i + 10);
                        const currentCount = i + chunk.length;
                        stats.message = `Geocoding ${currentCount} / ${trulyNeedsGeo.length} new addresses...`;

                        await Promise.all(chunk.map(async o => {
                            try {
                                const cacheKey2 = (o.address || o.addressGeo || '').toLowerCase().trim();

                                // Double-check session cache (might have been populated by another chunk)
                                if (this.geocache.has(cacheKey2)) {
                                    const cached = this.geocache.get(cacheKey2);
                                    if (cached) o.coords = { lat: cached.latitude, lng: cached.longitude };
                                    return;
                                }

                                const coords = await this.getRobustGeocode(o.address || o.addressGeo, cityBias);
                                if (coords) {
                                    o.coords = { lat: coords.latitude, lng: coords.longitude };
                                    this.geocache.set(cacheKey2, coords);
                                } else {
                                    this.geocache.set(cacheKey2, null);
                                }
                            } catch (err) {
                                // ignore
                            }
                        }));

                        stats.processedCount = currentCount;
                        emitStatus();
                    }
                } else {
                    logger.info(`[TurboCalculator] ✅ All addresses already cached — skipping geocoding phase`);
                }
            }

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
                stats.processedCouriers++;
                emitStatus();

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
                        // v5.170: Geocoding only orders still missing coords
                        // CRITICAL: Check session cache AND DB cache before calling API
                        const needsGeocoding = dedupedOrders.filter(o => {
                            const s = String(o.status || '').toLowerCase().trim();
                            if (s.includes('отказ') || s.includes('отменен') || s.includes('відмова')) return false;
                            if (o.coords?.lat) return false; // Already has coords

                            // Check session cache
                            const addrKey = (o.address || o.addressGeo || '').toLowerCase().trim();
                            if (this.geocache.has(addrKey)) {
                                const cached = this.geocache.get(addrKey);
                                if (cached) o.coords = { lat: cached.latitude, lng: cached.longitude };
                                return false;
                            }
                            return true;
                        });

                        if (needsGeocoding.length > 0) {
                            logger.info(`[TurboCalculator] 🧭 Need geocoding: ${needsGeocoding.length} orders for ${normName}`);

                            // v29.0: Parallel geocoding with in-memory session cache
                            await Promise.all(needsGeocoding.map(async o => {
                                try {
                                    const cacheKey2 = (o.address || o.addressGeo || '').toLowerCase().trim();
                                    if (!cacheKey2) return;

                                    // Double-check (might have been cached by another parallel call)
                                    if (this.geocache.has(cacheKey2)) {
                                        const cached = this.geocache.get(cacheKey2);
                                        if (cached) o.coords = { lat: cached.latitude, lng: cached.longitude };
                                        return;
                                    }

                                    const coords = await this.getRobustGeocode(o.address || o.addressGeo, cityBias);
                                    if (coords) {
                                        o.coords = { lat: coords.latitude, lng: coords.longitude };
                                        this.geocache.set(cacheKey2, coords);
                                    } else {
                                        this.geocache.set(cacheKey2, null);
                                    }
                                } catch (err) {
                                    // ignore
                                }
                            }));
                        }
                        
                        // v5.162: CRITICAL - Increment processedCount AFTER the window's geocoding is handled
                        // This applies to ALL orders in this window, even if they were already in cache.
                        stats.processedCount += dedupedOrders.length;
                        emitStatus();

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
                                    // v5.170: CRITICAL - address can be empty, fallback to addressGeo
                                    address: o.address || o.addressGeo || o.raw?.address || 'Адрес не указан',
                                    coords: o.coords,
                                    deliveryTime: o.deliverBy || o.plannedTime || o.deliveryTime,
                                    // v5.170: Pass through geocoding metadata for badge display
                                    locationType: o.locationType || o.coords?.locationType,
                                    streetNumberMatched: o.streetNumberMatched,
                                    kmlZone: o.kmlZone || o.deliveryZone,
                                    kmlHub: o.kmlHub,
                                    plannedTime: o.plannedTime || o.deliverBy,
                                    deliveryZone: o.deliveryZone
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
                                    target_date: targetDateNorm, // v5.164: Save as YYYY-MM-DD
                                    division_id: cache.division_id,
                                    courier: normName,
                                    deliveryWindow: timeBlockLabel,
                                    timeBlocks: timeBlockLabel,
                                    windowStart: timeGroup.windowStart,
                                    startAddress: presets?.defaultStartAddress || null,
                                    endAddress: presets?.defaultEndAddress || null,
                                    startCoords: startPoint, // v5.165: Save exact coordinates
                                    endCoords: endPoint,
                                    geoMeta: { // v5.166: Save geoMeta for routeExport compatibility
                                        origin: startPoint,
                                        destination: endPoint,
                                        waypoints: uniqueRouteOrders.map(o => o.coords).filter(Boolean)
                                    },
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

        // Check local cache first (fastest) - v30.3: Check ANY record (even failures)
        try {
            const cached = await GeoCache.findOne({
                where: { address_key: normalized }
            });
            if (cached) {
                if (!cached.is_success) return null; // Avoid re-trying known failures
                return { latitude: cached.lat, longitude: cached.lng, locationType: 'CACHED' };
            }
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

        // v5.160: Try primary geocoding with fallback strategies
        const tryGeocode = async (query, provider, timeout) => {
            const googleKey = process.env.GOOGLE_GEOCODE_API_KEY;
            
            if (provider === 'google' && googleKey) {
                try {
                    const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${googleKey}&language=uk`;
                    const googleRes = await axios.get(googleUrl, { timeout });
                    if (googleRes.data?.status === 'OK' && googleRes.data.results?.[0]) {
                        const r = googleRes.data.results[0];
                        return {
                            latitude: r.geometry.location.lat,
                            longitude: r.geometry.location.lng,
                            locationType: r.geometry.location_type || 'ROOFTOP'
                        };
                    }
                } catch (e) { /* continue */ }
            }
            
            if (provider === 'photon') {
                const PHOTON_URL = process.env.PHOTON_URL || 'http://localhost:2322';
                try {
                    const photonRes = await axios.get(`${PHOTON_URL}/api?q=${encodeURIComponent(query)}&limit=1&lang=uk`, { timeout });
                    if (photonRes.data?.features?.length > 0) {
                        const f = photonRes.data.features[0];
                        return {
                            latitude: f.geometry.coordinates[1],
                            longitude: f.geometry.coordinates[0],
                            locationType: f.properties?.type || 'PHOTON'
                        };
                    }
                } catch (e) { /* continue */ }
            }
            
            if (provider === 'komoot') {
                try {
                    const photon2Res = await axios.get(`https://photon.komoot.io/api?q=${encodeURIComponent(query)}&limit=1&lang=uk`, { timeout });
                    if (photon2Res.data?.features?.length > 0) {
                        const f = photon2Res.data.features[0];
                        return {
                            latitude: f.geometry.coordinates[1],
                            longitude: f.geometry.coordinates[0],
                            locationType: f.properties?.type || 'PHOTON'
                        };
                    }
                } catch (e) { /* continue */ }
            }
            
            if (provider === 'nominatim') {
                try {
                    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1&accept-language=uk`;
                    const nomRes = await axios.get(nomUrl, { 
                        timeout,
                        headers: { 'User-Agent': 'KillMetraj/1.0' }
                    });
                    if (Array.isArray(nomRes.data) && nomRes.data.length > 0) {
                        const r = nomRes.data[0];
                        return {
                            latitude: parseFloat(r.lat),
                            longitude: parseFloat(r.lon),
                            locationType: r.type || 'NOMINATIM'
                        };
                    }
                } catch (e) { /* continue */ }
            }
            
            return null;
        };

        const cacheResult = async (result, provider) => {
            if (!result) return;
            try {
                await GeoCache.create({
                    address_key: normalized,
                    lat: result.latitude,
                    lng: result.longitude,
                    is_success: true,
                    provider
                });
            } catch (e) { /* ignore */ }
        };

        // Primary attempt with full address
        const primaryQuery = cleaned + ', ' + city;
        for (const provider of ['google', 'photon', 'komoot', 'nominatim']) {
            const result = await tryGeocode(primaryQuery, provider, 5000);
            if (result) {
                await cacheResult(result, provider);
                return result;
            }
        }

        // v5.160: Enhanced fallback strategies
        logger.info(`[TurboCalculator] 🔄 Primary geocoding failed for "${address}", trying fallback strategies...`);

        // Strategy 1: Remove house number (just street)
        const noHouse = cleaned.replace(/\b\d+[а-яА-Яa-zA-ZіІєЄґґ]*(?:[\/\-]\d*)?\b/g, '').trim();
        if (noHouse && noHouse !== cleaned) {
            const fallbackQuery1 = noHouse + ', ' + city;
            logger.info(`[TurboCalculator]   Strategy 1 (no house): "${fallbackQuery1}"`);
            for (const provider of ['google', 'photon', 'komoot']) {
                const result = await tryGeocode(fallbackQuery1, provider, 4000);
                if (result) {
                    logger.info(`[TurboCalculator]   ✅ Fallback success (no-house) via ${provider}`);
                    await cacheResult(result, provider);
                    return result;
                }
            }
        }

        // Strategy 2: Simplified address (remove apt, floor, entrance, etc.)
        const simplified = cleaned
            .replace(/(?:под\.?|подъезд|п)\s*\d+/gi, '')
            .replace(/(?:кв\.?|квартира)\s*\d+/gi, '')
            .replace(/(?:эт\.?|этаж)\s*\d+/gi, '')
            .replace(/(?:оф\.?|офис)\s*\w+/gi, '')
            .replace(/д\/ф\s*\w*/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (simplified && simplified !== cleaned) {
            const fallbackQuery2 = simplified + ', ' + city;
            logger.info(`[TurboCalculator]   Strategy 2 (simplified): "${fallbackQuery2}"`);
            for (const provider of ['google', 'photon', 'komoot']) {
                const result = await tryGeocode(fallbackQuery2, provider, 4000);
                if (result) {
                    logger.info(`[TurboCalculator]   ✅ Fallback success (simplified) via ${provider}`);
                    await cacheResult(result, provider);
                    return result;
                }
            }
        }

        // Strategy 3: Just city + street name
        const streetMatch = cleaned.match(/((?:вул\.?|просп\.?|пр-т|пров\.?|пер\.?|бульвар)\s*[\w\s'-]+)/i);
        if (streetMatch) {
            const cityMatch = cleaned.match(/(Київ|Киев|Дніпро|Одеса|Харків|Львів)/i);
            const minimalQuery = cityMatch ? `${cityMatch[1]}, ${streetMatch[1]}` : streetMatch[1];
            logger.info(`[TurboCalculator]   Strategy 3 (street-only): "${minimalQuery}"`);
            for (const provider of ['google', 'photon', 'komoot', 'nominatim']) {
                const result = await tryGeocode(minimalQuery, provider, 4000);
                if (result) {
                    logger.info(`[TurboCalculator]   ✅ Fallback success (street-only) via ${provider}`);
                    await cacheResult(result, provider);
                    return result;
                }
            }
        }

        logger.warn(`[TurboCalculator] ❌ All geocoding strategies failed for: ${address}`);
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
