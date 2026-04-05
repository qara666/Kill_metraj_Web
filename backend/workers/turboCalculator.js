// v22.0: Optimized for Sequelize Model Registry. No more require circularity!
const logger = require('../src/utils/logger');
const axios = require('axios');
const { Op } = require('sequelize');
const { sequelize } = require('../src/config/database');
const { cleanAddress, generateVariants } = require('../src/utils/addressUtils');
const { groupAllOrdersByTimeWindow, normalizeCourierName, getExecutionTime } = require('./turboGroupingHelpers');
const QuickLRU = require('quick-lru').default;
const pRetry = require('p-retry').default;
const pLimit = require('p-limit').default;
const leven = require('leven').default;


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
        this.geocache = new QuickLRU({ maxSize: 5000, maxAge: 24 * 60 * 60 * 1000 }); // 5000 entries, 24h TTL
        this.addressUtils = require('../src/utils/addressUtils');

        // v5.172: KML Zone Spatial Grid Index for O(1) lookup
        this.kmlZones = []; // All active KML zones
        this.kmlGridIndex = new Map(); // Spatial grid: "lat,lng" -> [zones]
        this.GRID_SIZE = 0.01; // ~1.1km at equator

        // v5.180: Route calculation concurrency limit
        this.routeLimit = pLimit(3); // Max 3 concurrent route calculations

        // v5.180: GeoCache fuzzy match threshold
        this.FUZZY_THRESHOLD = 3; // Max Levenshtein distance for fuzzy match

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

        // v5.172: Pre-load KML zones on construction
        this.preloadKmlZones();

        // v5.170: Restore saved division states on restart
        this.loadSavedState();
        this.loadAllDivisionStatesFromDB();
    }

    // v5.172: Pre-load all KML zones into memory with spatial grid index
    async preloadKmlZones() {
        try {
            const KmlZone = this.getModel('KmlZone');
            if (!KmlZone) {
                logger.warn('[TurboCalculator] KmlZone model not available');
                return;
            }

            // Load all active zones
            this.kmlZones = await KmlZone.findAll({
                where: { is_active: true }
            });

            // Build spatial grid index
            this.buildKmlSpatialGrid();

            logger.info(`[TurboCalculator] 📦 Pre-loaded ${this.kmlZones.length} KML zones with spatial grid index`);
        } catch (e) {
            logger.warn('[TurboCalculator] Failed to preload KML zones:', e.message);
        }
    }

    // v5.172: Build spatial grid index for fast O(1) zone lookup
    buildKmlSpatialGrid() {
        this.kmlGridIndex.clear();

        for (const zone of this.kmlZones) {
            if (!zone.bounds) continue;

            const b = zone.bounds;
            const swLat = b.south;
            const swLng = b.west;
            const neLat = b.north;
            const neLng = b.east;

            // Skip invalid bounds
            if (swLat === undefined || neLat === undefined) continue;

            // Add zone to all grid cells it intersects
            for (let lat = Math.floor(swLat / this.GRID_SIZE); lat <= Math.floor(neLat / this.GRID_SIZE); lat++) {
                for (let lng = Math.floor(swLng / this.GRID_SIZE); lng <= Math.floor(neLng / this.GRID_SIZE); lng++) {
                    const key = `${lat},${lng}`;
                    if (!this.kmlGridIndex.has(key)) {
                        this.kmlGridIndex.set(key, []);
                    }
                    this.kmlGridIndex.get(key).push(zone);
                }
            }
        }

        logger.info(`[TurboCalculator] 📊 KML Grid Index built: ${this.kmlGridIndex.size} cells`);
    }

    // v5.172: Fast O(1) zone lookup using spatial grid + point-in-polygon
    findZonesForPoint(lat, lng, tolerance = 0.01) {
        if (!lat || !lng || this.kmlZones.length === 0) return [];

        // Step 1: Get candidate zones from grid (O(1) lookup)
        const gridKey = `${Math.floor(lat / this.GRID_SIZE)},${Math.floor(lng / this.GRID_SIZE)}`;
        const candidateZones = this.kmlGridIndex.get(gridKey) || [];

        if (candidateZones.length === 0) return [];

        // Step 2: Precise point-in-polygon check for candidates only
        const matches = [];
        const KmlService = require('../src/services/KmlService');

        for (const zone of candidateZones) {
            if (zone.boundary && zone.boundary.coordinates && zone.boundary.coordinates[0]) {
                const isInside = KmlService._isPointInPolygon(lat, lng, zone.boundary.coordinates[0], tolerance);
                if (isInside) {
                    matches.push({
                        id: zone.id,
                        name: zone.name,
                        hub_id: zone.hub_id,
                        is_technical: zone.is_technical
                    });
                }
            }
        }

        // Sort: delivery zones first, then technical
        matches.sort((a, b) => {
            if (a.is_technical !== b.is_technical) return a.is_technical ? 1 : -1;
            return 0;
        });

        return matches;
    }

    // v5.172: Find best (non-technical) zone for a point
    findBestZoneForPoint(lat, lng) {
        const zones = this.findZonesForPoint(lat, lng);
        // Return first non-technical zone
        return zones.find(z => !z.is_technical) || zones[0] || null;
    }

    // v5.172: Check if point is inside expected KML zone (with fallback to other active zones)
    validatePointInZone(lat, lng, expectedZoneName, allowFallback = true) {
        if (!expectedZoneName) return { valid: true, zone: null };

        const zones = this.findZonesForPoint(lat, lng);

        if (zones.length === 0) {
            return { valid: false, zone: null, reason: 'outside_all_zones' };
        }

        // Check if point is in expected zone
        const expectedNormalized = expectedZoneName.replace(/FO\/KML:\s*/i, '').trim().toLowerCase();
        const matchingZone = zones.find(z => z.name.toLowerCase().includes(expectedNormalized));

        if (matchingZone) {
            return { valid: true, zone: matchingZone };
        }

        // If not in expected zone but in another active zone, and fallback is allowed
        if (allowFallback && zones[0]) {
            return { valid: true, zone: zones[0], fallback: true };
        }

        return { valid: false, zone: zones[0], reason: 'not_in_expected_zone' };
    }

    // v5.180: Find nearest zone within distance threshold (fallback when point is outside all zones)
    findNearestZone(lat, lng, maxDistanceMeters = 500) {
        if (!lat || !lng || this.kmlZones.length === 0) return null;

        let nearestZone = null;
        let nearestDistance = Infinity;

        for (const zone of this.kmlZones) {
            if (!zone.bounds) continue;

            const b = zone.bounds;
            // Quick bounding box check
            if (lat < b.south - 0.01 || lat > b.north + 0.01 || lng < b.west - 0.01 || lng > b.east + 0.01) {
                continue;
            }

            // Find closest point on polygon boundary
            if (zone.boundary && zone.boundary.coordinates && zone.boundary.coordinates[0]) {
                const coords = zone.boundary.coordinates[0];
                let minDist = Infinity;
                for (let i = 0; i < coords.length - 1; i++) {
                    const dist = this.pointToSegmentDistance(lat, lng, coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
                    if (dist < minDist) minDist = dist;
                }

                if (minDist < nearestDistance && minDist <= maxDistanceMeters) {
                    nearestDistance = minDist;
                    nearestZone = {
                        id: zone.id,
                        name: zone.name,
                        hub_id: zone.hub_id,
                        is_technical: zone.is_technical,
                        distanceMeters: Math.round(minDist)
                    };
                }
            }
        }

        return nearestZone;
    }

    // v5.180: Calculate distance from point to line segment
    pointToSegmentDistance(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSq = dx * dx + dy * dy;

        if (lengthSq === 0) return this.haversineDistance(px, py, x1, y1);

        let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
        t = Math.max(0, Math.min(1, t));

        const projX = x1 + t * dx;
        const projY = y1 + t * dy;

        return this.haversineDistance(px, py, projX, projY);
    }

    // v5.180: Haversine distance in meters
    haversineDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // v5.180: Fuzzy cache lookup using Levenshtein distance
    fuzzyCacheLookup(addressKey, threshold = null) {
        const maxDist = threshold || this.FUZZY_THRESHOLD;
        const normalizedKey = addressKey.toLowerCase().trim();

        // Check exact match first
        if (this.geocache.has(normalizedKey)) {
            return { match: this.geocache.get(normalizedKey), type: 'exact' };
        }

        // Fuzzy match against cache keys
        let bestMatch = null;
        let bestDistance = Infinity;

        for (const [key, value] of this.geocache) {
            const dist = leven(normalizedKey, key.toLowerCase());
            if (dist <= maxDist && dist < bestDistance) {
                bestDistance = dist;
                bestMatch = { key, value, distance: dist };
            }
        }

        if (bestMatch) {
            logger.info(`[TurboCalculator] 🔍 Fuzzy cache hit: "${addressKey}" -> "${bestMatch.key}" (dist: ${bestMatch.distance})`);
            return { match: bestMatch.value, type: 'fuzzy', distance: bestMatch.distance };
        }

        return null;
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
        // v5.170: INITIALIZED — Robot is OFF.
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
     * @param {boolean} forceFull - If true, recalculate ALL orders (not incremental)
     */
    trigger(divisionId, date = null, userId = null, forceFull = false) {
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

        // v5.172: ALWAYS clear hash on manual trigger to force recalculation
        this.processedHashes.delete(cacheKey);
        logger.info(`[TurboCalculator] 💥 Manual trigger: Cleared processedHash for ${cacheKey}${forceFull ? ' (FULL recalculation)' : ''}`);

        let state = this.divisionStates.get(divisionId);
        if (!state) {
            state = { users: new Set(), date: targetDate, priorityQueue: [], currentPriority: null, isActive: true, forceFull };
            this.divisionStates.set(divisionId, state);
        } else {
            // v5.170: Reactivate if was stopped and UPDATE the date!
            state.isActive = true;
            if (targetDate !== state.date) {
                logger.info(`[TurboCalculator] 📅 Date changed for ${divisionId}: ${state.date} -> ${targetDate}. Clearing cache hash.`);
                this.processedHashes.delete(cacheKey); // Clear old date hash
                this.processedHashes.delete(`${divisionId}_${state.date}`); // Clear explicit previous date hash
            }
            state.date = targetDate;
            state.forceFull = forceFull; // Store force flag in state
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
                    data: { forceFull }
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

            // v5.171: INCREMENTAL ROUTING — fetch existing routes to know which orders are already routed
            // This prevents recalculating everything and only processes NEW orders
            const existingRoutedOrderNumbers = new Set();
            const existingRoutedOrderIds = new Set();
            let existingRoutes = [];

            // v5.172: Check if this is a FULL recalculation (manual trigger with forceFull flag)
            const state = this.divisionStates.get(String(cache.division_id));
            const forceFull = state?.forceFull === true;

            if (Route) {
                try {
                    existingRoutes = await Route.findAll({
                        where: {
                            division_id: cache.division_id,
                            [Op.and]: sequelize.where(
                                sequelize.literal("route_data->>'target_date'"),
                                targetDateNorm || cache.target_date
                            )
                        },
                        order: [['calculated_at', 'ASC']] // Keep existing order
                    });

                    existingRoutes.forEach(r => {
                        const orders = r.route_data?.orders || [];
                        orders.forEach(o => {
                            if (o.orderNumber) existingRoutedOrderNumbers.add(String(o.orderNumber));
                            if (o.id) existingRoutedOrderIds.add(String(o.id));
                        });
                    });

                    if (existingRoutes.length > 0) {
                        logger.info(`[TurboCalculator] 📦 Found ${existingRoutes.length} existing routes with ${existingRoutedOrderNumbers.size} already-routed orders`);
                    }
                } catch (e) {
                    logger.warn(`[TurboCalculator] ⚠️ Failed to fetch existing routes: ${e.message}`);
                }
            }

            // v5.172: If forceFull is true, delete existing routes for a clean recalculation
            if (forceFull && existingRoutes.length > 0 && Route) {
                try {
                    const deletedCount = await Route.destroy({
                        where: {
                            division_id: cache.division_id,
                            [Op.and]: sequelize.where(
                                sequelize.literal("route_data->>'target_date'"),
                                targetDateNorm || cache.target_date
                            )
                        }
                    });
                    logger.info(`[TurboCalculator] 🗑️ FULL recalculation: Deleted ${deletedCount} existing routes`);
                    existingRoutes = [];
                    existingRoutedOrderNumbers.clear();
                    existingRoutedOrderIds.clear();
                } catch (e) {
                    logger.warn(`[TurboCalculator] ⚠️ Failed to delete existing routes: ${e.message}`);
                }
            }

            // v5.171: Filter out already-routed orders BEFORE grouping
            // This ensures grouping only creates windows for NEW orders (unless forceFull)

            // v31.1: Fetch all KML zones once per cache processing
            let allKmlZones = [];
            try {
                const KmlZone = this.getModel('KmlZone');
                if (KmlZone) allKmlZones = await KmlZone.findAll();
            } catch (e) {
                logger.warn(`[TurboCalculator] ⚠️ Failed to fetch KmlZones: ${e.message}`);
            }

            // v33: In-Memory cache for partial renders to skip DB O(N^2) hits!
            let inMemoryFrontendRoutes = existingRoutes.map(r => ({
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

            // v33: Pre-fetch Presets ONCE for entire cache processing
            const presets = await this.getDivisionPresets(cache.division_id);
            const cityBias = presets?.cityBias || 'Київ';
            const globalStartPoint = presets?.defaultStartLat && presets?.defaultStartLng ?
                { lat: parseFloat(presets.defaultStartLat), lng: parseFloat(presets.defaultStartLng) } : null;
            const globalEndPoint = presets?.defaultEndLat && presets?.defaultEndLng ?
                { lat: parseFloat(presets.defaultEndLat), lng: parseFloat(presets.defaultEndLng) } : null;

            const newOrders = (data.orders || []).filter(o => {

                const orderNum = String(o.orderNumber || '');
                const orderId = String(o.id || '');
                // Skip if already routed (by orderNumber or ID)
                if (orderNum && existingRoutedOrderNumbers.has(orderNum)) return false;
                if (orderId && existingRoutedOrderIds.has(orderId)) return false;
                return true;
            });

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

            // If hash unchanged AND no new orders, skip entirely
            if (existingHash === dataHash && newOrders.length === 0) {
                logger.info(`[TurboCalculator] ⏩ Data for ${cacheKey} unchanged, no new orders — skipping calculation`);
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

            // v5.171: INCREMENTAL — if hash changed but all orders are already routed, skip
            if (newOrders.length === 0 && existingRoutedOrderNumbers.size > 0) {
                logger.info(`[TurboCalculator] ⏩ All ${data.orders.length} orders already routed — no new orders to process`);
                // Still emit existing routes to frontend so UI stays in sync
                if (this.io && existingRoutes.length > 0) {
                    const routeDataForFrontend = existingRoutes.map(r => ({
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

                    this.io.emit('routes_update', {
                        divisionId: cache.division_id,
                        date: cache.target_date,
                        routes: routeDataForFrontend
                    });
                }
                this.processedHashes.set(cacheKey, dataHash);
                // v5.172: Reset forceFull flag after processing
                if (state) state.forceFull = false;
                return;
            }

            // v5.171: Data HAS changed and there are new orders — log what changed
            if (existingHash) {
                logger.info(`[TurboCalculator] 🔄 Data changed for ${cacheKey}: ${newOrders.length} new orders out of ${data.orders.length} total — calculating incremental routes`);
            }

            // v5.171: DO NOT delete existing routes — we're doing incremental routing
            // Only new routes will be appended to the database
            if (newOrders.length > 0) {
                logger.info(`[TurboCalculator] ➕ Processing ${newOrders.length} new orders (existing ${existingRoutedOrderNumbers.size} orders remain untouched)`);
            }

            // v5.171: Group ONLY new orders (not all orders) for incremental routing
            const ordersToGroup = newOrders.length > 0 ? newOrders : data.orders;

            // v28.9: Frontload coordinate extraction from all possible sources (including addressGeo)
            // This ensures grouping and validOrders filters have accurate GPS data immediately.
            ordersToGroup.forEach(o => {
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

            // v33: Massive BATCH GEOCODING! Geocode all missing addresses upfront across ALL couriers!
            const globalNeedsGeocoding = ordersToGroup.filter(o => {
                // v33.1: Only batch geocode if order is definitely ACTIVE and ASSIGNED to a courier
                const courierNameRaw = o.courier || o.courierName || o.courierId;
                const normC = courierNameRaw ? normalizeCourierName(courierNameRaw) : 'НЕ НАЗНАЧЕНО';
                if (!normC || normC === 'НЕ НАЗНАЧЕНО' || normC === 'UNASSIGNED') return false;

                const s = String(o.status || '').toLowerCase().trim();
                // We'll skip canceled orders, orders in draft/registration/assembly, and orders that already have lat/lng
                if (s.includes('отказ') || s.includes('отменен') || s.includes('відмова') ||
                    s.includes('оформление') || s.includes('собран') || s.includes('в работе')) {
                    return false;
                }
                if (o.coords?.lat) return false;

                const addrKey = (o.address || o.addressGeo || '').toLowerCase().trim();
                if (this.geocache.has(addrKey)) {
                    const cached = this.geocache.get(addrKey);
                    if (cached) o.coords = { lat: cached.latitude, lng: cached.longitude };
                    return false;
                }
                return true;
            });

            if (globalNeedsGeocoding.length > 0) {
                logger.info(`[TurboCalculator] 🚀 BATCH GEOCODING: Processing ${globalNeedsGeocoding.length} orders in parallel chunks...`);
                // Process in chunks of 50 to maximize throughput without bottlenecking memory/event loop
                const chunkSize = 50;
                for (let i = 0; i < globalNeedsGeocoding.length; i += chunkSize) {
                    const chunk = globalNeedsGeocoding.slice(i, i + chunkSize);
                    await Promise.all(chunk.map(async o => {
                        try {
                            const cacheKey2 = (o.address || o.addressGeo || '').toLowerCase().trim();
                            if (!cacheKey2) return;

                            // Double check if cached during parallel step
                            if (this.geocache.has(cacheKey2)) {
                                const cached = this.geocache.get(cacheKey2);
                                if (cached) o.coords = { lat: cached.latitude, lng: cached.longitude };
                                return;
                            }

                            const expectedZone = String(o.deliveryZone || o.kmlZone || o.sector || o.zone || '').trim();
                            const coords = await this.getRobustGeocode(o.address || o.addressGeo, cityBias, expectedZone, allKmlZones);

                            if (coords) {
                                o.coords = { lat: coords.latitude, lng: coords.longitude };
                                this.geocache.set(cacheKey2, coords);
                            } else {
                                this.geocache.set(cacheKey2, null);
                            }
                        } catch (err) { }
                    }));
                }
                logger.info(`[TurboCalculator] ✅ BATCH GEOCODING DONE.`);
            }

            // v28.8: Use the new frontend-like grouping by arrivedAt -> 30min windows
            let deliveryWindows = new Map();
            let totalBlocksCount = 0;
            try {
                const { groupAllOrdersByTimeWindow } = require('./turboGroupingHelpers');
                // v5.150: Use groupAllOrdersByTimeWindow to process per-courier correctly
                // This is CRITICAL for the "bulk import" detection to work exactly like frontend
                deliveryWindows = groupAllOrdersByTimeWindow(ordersToGroup);

                // Log block summary
                const blockSummary = {};
                deliveryWindows.forEach((windows, courier) => {
                    totalBlocksCount += windows.length;
                    blockSummary[courier] = windows.map(w => `${w.windowLabel}(${w.orders.length})`);
                });

                logger.info(`[TurboCalculator] 📦 Grouped ${ordersToGroup.length} orders into ${totalBlocksCount} blocks across ${deliveryWindows.size} couriers`);
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
                    message: `Grouping ${ordersToGroup.length} new orders into 30m blocks...`,
                    totalCount: ordersToGroup.length
                });
            }

            // v5.163: Calculate true "Assigned" count for accurate progress tracking
            const assignedOrdersCount = ordersToGroup.filter(o => {
                const n = normalizeCourierName(o.courier);
                return n && n !== 'НЕ НАЗНАЧЕНО';
            }).length;
            const unassignedCount = data.orders.length - (assignedOrdersCount + existingRoutedOrderNumbers.size);

            const stats = {
                isActive: true,
                lastUpdate: Date.now(),
                totalCount: data.orders.length,
                unassignedCount: unassignedCount,
                processedCount: existingRoutedOrderNumbers.size + unassignedCount,
                totalCouriers: deliveryWindows.size,
                processedCouriers: 0,
                skippedGeocoding: 0,
                skippedInRoutes: existingRoutedOrderNumbers.size,
                skippedNoCourier: unassignedCount,
                message: `Analyzing ${assignedOrdersCount} new orders across ${deliveryWindows.size} couriers...`
            };

            if (unassignedCount > 0) {
                stats.message += ` (${unassignedCount} unassigned orders skipped)`;
                logger.info(`[TurboCalculator] ⏩ Skipping ${unassignedCount} unassigned orders in ${cache.division_id}`);
            }


            // Initialize per-division courier stats for distance tracking
            stats.courierStats = {};
            const processedCourierNames = new Set();

            // v35.1: Pre-detect courier types from orders (Car/Moto)
            const courierTypeMap = new Map();
            ordersToGroup.forEach(o => {
                const n = normalizeCourierName(o.courier);
                if (!n || n === 'НЕ НАЗНАЧЕНО') return;

                // Try to detect type from various fields
                let type = o.type || o.courierType || o.raw?.courierType;
                if (!type && o.courier) {
                    const lower = String(o.courier).toLowerCase();
                    if (lower.includes('мото') || lower.includes('moto')) type = 'Moto';
                    else if (lower.includes('авто') || lower.includes('car')) type = 'Car';
                }
                if (type) courierTypeMap.set(n, type);
            });

            deliveryWindows.forEach((windows, normName) => {
                const totalOrdersInWindows = windows.reduce((acc, w) => acc + w.orders.length, 0);
                stats.courierStats[normName] = {
                    name: normName,
                    orders: totalOrdersInWindows,
                    distanceKm: 0,
                    type: courierTypeMap.get(normName) || 'Car' // Default to Car
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
                        couriers: couriersList,
                        skippedGeocoding: stats.skippedGeocoding || 0,
                        skippedInRoutes: stats.skippedInRoutes || 0,
                        skippedNoCourier: stats.skippedNoCourier || stats.unassignedCount || 0
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

            // v5.171: Only geocode orders that need it (from ordersToGroup, not all orders)
            const GeoCache = this.getModel('GeoCache');
            const allOrdersNeedsGeo = ordersToGroup.filter(o => {
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

                        // Progress notification for long geocoding
                        const remaining = trulyNeedsGeo.length - currentCount;
                        const estSec = Math.ceil(remaining / 5); // Rough estimate
                        stats.message = `Geocoding: ${currentCount}/${trulyNeedsGeo.length} done. ${remaining > 0 ? `(~${estSec}s left)` : 'Finishing...'}`;
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

            // v31.2: Instant UI updates! Extract route emit logic into a helper
            // so we can broadcast intermediate calculations strictly for partial rendering.
            const emitCurrentRoutes = async () => {
                if (this.io) {
                    const allWindowLabels = Array.from(new Set(
                        Array.from(deliveryWindows.values()).flat().map(w => w.windowLabel)
                    ));

                    const enrichedCouriers = Object.values(stats.courierStats || {}).map((cs) => ({
                        name: cs.name,
                        courierName: cs.name,
                        distanceKm: Number((cs.distanceKm || 0).toFixed(2)),
                        calculatedOrders: cs.orders || 0,
                    })).filter(c => {
                        // v34: Exclusive - skip 'НЕ НАЗНАЧЕНО' as it's not a real courier for analytics
                        const norm = (c.name || '').toUpperCase().trim();
                        if (norm === 'НЕ НАЗНАЧЕНО' || norm === 'UNASSIGNED') return false;
                        return c.distanceKm > 0 || c.calculatedOrders > 0;
                    });

                    this.io.emit('routes_update', {
                        divisionId: cache.division_id,
                        date: cache.target_date,
                        couriers: enrichedCouriers,
                        timeBlocks: allWindowLabels,
                        routes: inMemoryFrontendRoutes // v33: Instant memory pull, NO O(N^2) DB CALLS
                    });
                }
            };


            // Process each courier and their time windows

            // v5.140: Courier names are now normalized in groupOrdersByTimeWindowFrontend
            for (const [courierName, windows] of deliveryWindows.entries()) {
                const normName = courierName;
                if (!windows || windows.length === 0) continue;

                logger.info(`[TurboCalculator] 🚚 Processing courier ${normName}: ${windows.length} time windows`);

                // v29.0: Presets fetched ONCE at top-level globally!

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

                            // v5.180: Parallel geocoding with concurrency limit to prevent overwhelming APIs
                            const geoLimit = pLimit(5); // Max 5 concurrent geocoding requests
                            await Promise.all(needsGeocoding.map(o => geoLimit(async () => {
                                try {
                                    const cacheKey2 = (o.address || o.addressGeo || '').toLowerCase().trim();
                                    if (!cacheKey2) return;

                                    // Double-check (might have been cached by another parallel call)
                                    if (this.geocache.has(cacheKey2)) {
                                        const cached = this.geocache.get(cacheKey2);
                                        if (cached) o.coords = { lat: cached.latitude, lng: cached.longitude };
                                        return;
                                    }

                                    // Pass extracted delivery zone down for strict KML bounding validation
                                    const expectedZone = String(o.deliveryZone || o.kmlZone || o.sector || o.zone || '').trim();
                                    const coords = await this.getRobustGeocode(o.address || o.addressGeo, cityBias, expectedZone, allKmlZones);

                                    if (coords) {
                                        o.coords = { lat: coords.latitude, lng: coords.longitude };
                                        this.geocache.set(cacheKey2, coords);
                                    } else {
                                        this.geocache.set(cacheKey2, null);
                                    }
                                } catch (err) {
                                    // ignore
                                }
                            })));
                        }

                        // v5.162: CRITICAL - Increment processedCount AFTER the window's geocoding is handled
                        // This applies to ALL orders in this window, even if they were already in cache.
                        stats.processedCount += dedupedOrders.length;
                        emitStatus();

                        // Use all valid orders (with coords OR a valid address for routing)
                        // Use deduplicated orders from this block
                        let validOrders = dedupedOrders.filter(o => {
                            const s = String(o.status || o.deliveryStatus || '').toLowerCase().trim();
                            if (s.includes('отказ') || s.includes('отменен') || s.includes('відмова')) {
                                stats.skippedOther = (stats.skippedOther || 0) + 1;
                                return false;
                            }
                            const hasCoords = (o.coords?.lat && o.coords?.lng) ||
                                (o.lat && o.lng) ||
                                (o.latitude && o.longitude);
                            const isValid = hasCoords;
                            if (!isValid) stats.skippedGeocoding++;
                            return isValid;
                        });

                        // v31.0: Sort orders by ACTUAL execution time (Исполнен) first, then planned delivery time.
                        // This makes the calculated km reflect the real courier route (order they were completed).
                        const getOrderSortKey = (o) => {
                            let timestampToParse = null;

                            // Priority 1: If the order is executed, use its actual completion time
                            const execTime = getExecutionTime(o);
                            if (execTime) timestampToParse = execTime;
                            // Priority 2: Delivery/handover timestamp (order was in transit)
                            else if (o.handoverAt && typeof o.handoverAt === 'number') timestampToParse = o.handoverAt;
                            else if (o.statusTimings?.deliveringAt) timestampToParse = o.statusTimings.deliveringAt;

                            // If we have a full Unix timestamp, convert it to minutes of the day (matching the time window context)
                            if (timestampToParse) {
                                const d = new Date(timestampToParse);
                                return d.getHours() * 60 + d.getMinutes();
                            }

                            // Priority 3: Planned time (for orders not yet delivered, or missing execution traces)
                            const time = o.deliverBy || o.plannedTime || o.deliveryTime;
                            if (!time || time === '00:00') return 9999;
                            const parts = String(time).split(':');
                            const minutesOfDay = parseInt(parts[0]) * 60 + parseInt(parts[1] || '0');
                            return minutesOfDay;
                        };

                        validOrders = validOrders.sort((a, b) => getOrderSortKey(a) - getOrderSortKey(b));

                        // Log sort mode for this window
                        const executedInWindow = validOrders.filter(o => getExecutionTime(o)).length;
                        if (executedInWindow > 0) {
                            logger.info(`[TurboCalculator] ✅ [${windowKey}] ${executedInWindow}/${validOrders.length} orders sorted by execution time`);
                        }

                        if (validOrders.length < 1) {
                            logger.info(`[TurboCalculator] ⚠️ No valid orders for ${normName} in block ${windowKey}`);
                            continue;
                        }

                        if (this.io) {
                            const firstAddr = (validOrders[0].address || 'Unknown').split(',')[0];
                            stats.message = `Calculating: ${normName} → ${firstAddr} (${validOrders.length} orders)`;

                            // Let standard emitStatus handle it to ensure all fields are sent
                            emitStatus();
                        }

                        let routeResult = null;
                        try {
                            routeResult = await this.calculateRoute(validOrders, cache.division_id, globalStartPoint, globalEndPoint);
                        } catch (routeErr) {
                            logger.warn(`[TurboCalculator] ⚠️ calculateRoute failed for ${normName}: ${routeErr.message}`);
                        }

                        // v5.180: Apply 2-opt optimization if route was calculated and has enough points
                        if (routeResult && validOrders.length >= 4) {
                            try {
                                const routePoints = validOrders
                                    .filter(o => o.coords?.lat && o.coords?.lng)
                                    .map(o => ({ lat: o.coords.lat, lng: o.coords.lng }));

                                if (globalStartPoint) {
                                    routePoints.unshift({ lat: Number(globalStartPoint.lat), lng: Number(globalStartPoint.lng) });
                                }
                                if (globalEndPoint) {
                                    routePoints.push({ lat: Number(globalEndPoint.lat), lng: Number(globalEndPoint.lng) });
                                }

                                const optimized = this.optimizeRoute2Opt(routePoints, 50);
                                if (optimized.improved && optimized.savingsPct > 1) {
                                    // Recalculate route with optimized order
                                    const optimizedResult = await this.calculateRoute(
                                        validOrders,
                                        cache.division_id,
                                        globalStartPoint,
                                        globalEndPoint
                                    );
                                    if (optimizedResult && optimizedResult.distance < routeResult.distance) {
                                        logger.info(`[TurboCalculator] ✅ 2-opt improved route: ${(routeResult.distance / 1000).toFixed(2)}km -> ${(optimizedResult.distance / 1000).toFixed(2)}km`);
                                        routeResult = optimizedResult;
                                    }
                                }
                            } catch (optErr) {
                                logger.warn(`[TurboCalculator] ⚠️ 2-opt optimization failed: ${optErr.message}`);
                            }
                        }

                        if (routeResult) {
                            const timeBlockLabel = timeGroup.windowLabel;
                            const distanceKm = Math.round((routeResult.distance / 1000) * 100) / 100;

                            // v36.0: CRITICAL SANITY CHECK
                            // If a single route in a 15-30m block is > 100km, it's almost certainly 
                            // a geocoding error (wrong city) or routing loop. REJECT IT.
                            if (distanceKm > 100) {
                                logger.error(`[TurboCalculator] ❌ REJECTED HUGE ROUTE: ${normName} [${timeBlockLabel}] shows ${distanceKm}km. Likely geocoding error.`);
                                continue;
                            }


                            // v5.149: CRITICAL FIX - Deduplicate by orderNumber FIRST (primary key)
                            // The same order may have different IDs from different sources
                            const seenOrderNumbers = new Set();
                            const seenIds = new Set();
                            const uniqueRouteOrders = [];

                            // 🚀 v36.0 FIX: Keep ALL orders in the route block, even if geocoding failed!
                            // calculateRoute used validOrders, but the DB representation must contain ALL orders in the block.
                            const nonCancelledOrders = dedupedOrders.filter(o => {
                                const s = String(o.status || o.deliveryStatus || '').toLowerCase().trim();
                                return !(s.includes('отказ') || s.includes('отменен') || s.includes('відмова'));
                            });

                            nonCancelledOrders.forEach(o => {
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
                                    // v5.170: Add lat/lng at top level for frontend compatibility
                                    lat: o.coords?.lat || o.lat,
                                    lng: o.coords?.lng || o.lng,
                                    deliveryTime: o.deliverBy || o.plannedTime || o.deliveryTime,
                                    // v5.170: Pass through geocoding metadata for badge display
                                    locationType: o.locationType || o.coords?.locationType,
                                    streetNumberMatched: o.streetNumberMatched || o.coords?.streetNumberMatched,
                                    isAddressLocked: o.isAddressLocked || !!o.coords?.lat,
                                    kmlZone: o.kmlZone || o.deliveryZone,
                                    kmlHub: o.kmlHub,
                                    plannedTime: o.plannedTime || o.deliverBy,
                                    deliveryZone: o.deliveryZone,
                                    // v31.0: Execution time tracking for accurate km calculation
                                    status: o.status || null,
                                    executionTime: getExecutionTime(o) || null,
                                    handoverAt: o.handoverAt || null,
                                    manualGroupId: o.manualGroupId,
                                    readyAtPreview: o.readyAtPreview || o.kitchen || o.readyAtSource,
                                    statusTimings: o.statusTimings || null,
                                });
                            });

                            if (uniqueRouteOrders.length < nonCancelledOrders.length) {
                                logger.warn(`[TurboCalculator] ⚠️ Route deduplication: ${nonCancelledOrders.length} -> ${uniqueRouteOrders.length} orders`);
                                // Log which orderNumbers were duplicates
                                const orderNums = nonCancelledOrders.map(o => o.orderNumber).filter(Boolean);
                                const dupNums = orderNums.filter((n, i) => orderNums.indexOf(n) !== i);
                                if (dupNums.length > 0) {
                                    logger.warn(`[TurboCalculator] ⚠️ Duplicate orderNumbers: ${[...new Set(dupNums)].join(', ')}`);
                                }
                            }

                            const createdRoute = await Route.create({
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
                                    startCoords: globalStartPoint, // v5.165: Save exact coordinates
                                    endCoords: globalEndPoint,
                                    geoMeta: { // v5.166: Save geoMeta for routeExport compatibility
                                        origin: globalStartPoint,
                                        destination: globalEndPoint,
                                        waypoints: uniqueRouteOrders.map(o => o.coords).filter(Boolean)
                                    },
                                    orders: uniqueRouteOrders,
                                    geometry: routeResult.geometry
                                }
                            });

                            // v33: Push into memory cache immediately!
                            inMemoryFrontendRoutes.push({
                                id: createdRoute.id,
                                courier: createdRoute.courier_id,
                                totalDistance: parseFloat(createdRoute.total_distance || 0),
                                totalDuration: createdRoute.total_duration,
                                ordersCount: createdRoute.orders_count,
                                timeBlock: createdRoute.route_data?.deliveryWindow || createdRoute.route_data?.timeBlocks,
                                startAddress: createdRoute.route_data?.startAddress,
                                endAddress: createdRoute.route_data?.endAddress,
                                orders: createdRoute.route_data?.orders || [],
                                geometry: createdRoute.route_data?.geometry || null,
                                isCalculated: true // v5.175: Force UI to treat this as solid data
                            });

                            courierRoutesCreated++;
                            stats.skippedInRoutes += uniqueRouteOrders.length; // v5.170: Track in-route count for real-time stats
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

                if (!processedCourierNames.has(normName)) {
                    processedCourierNames.add(normName);
                    stats.processedCouriers = processedCourierNames.size;
                    stats.message = `Courier ${normName} completed`; // Update message so it doesn't get stuck
                    emitStatus(); // Push fresh status after each courier is done
                    await emitCurrentRoutes(); // v31.2: EMIT RIGHT NOW to refresh UI!
                }
            } // End of courier loop

            // Update processedCount to match total processed orders
            stats.processedCount = stats.totalCount;

            // v5.171: Fetch ALL routes (existing + newly created) for frontend
            // Final comprehensive emit across all couriers just in case
            await emitCurrentRoutes();


            // v29.0: Cache Enrichment - write calculated distances back to api_dashboard_cache
            // Match courier names by both normalized (uppercase) and raw for maximum coverage
            if (data && Array.isArray(data.orders)) {
                try {
                    if (data.couriers && Array.isArray(data.couriers)) {
                        // v34.2: Stripping 'НЕ НАЗНАЧЕНО' from the final DATA object sent to frontend
                        // This fixes the medals (Leader of Volume, Speed Demon) and summary cards!
                        data.couriers = data.couriers.filter(c => {
                            const rawName = c.courierName || c.name || c.courier;
                            const norm = (rawName || '').toString().toUpperCase().trim();
                            return norm !== 'НЕ НАЗНАЧЕНО' && norm !== 'UNASSIGNED';
                        });

                        // v35.2: Weekly Analytics - Calculate Active Days & Normalized Efficiency
                        const DashboardCache = this.getModel('DashboardCache');
                        let weeklyActivity = {}; // normName -> Set of dates

                        if (DashboardCache) {
                            try {
                                const oneWeekAgo = new Date(new Date(cache.target_date) - 7 * 24 * 60 * 60 * 1000);
                                const last7Days = await DashboardCache.findAll({
                                    where: {
                                        division_id: cache.division_id,
                                        target_date: { [Op.gte]: oneWeekAgo.toISOString().split('T')[0] }
                                    },
                                    attributes: ['target_date', 'payload']
                                });

                                last7Days.forEach(day => {
                                    const dayPayload = day.payload;
                                    if (dayPayload && Array.isArray(dayPayload.orders)) {
                                        dayPayload.orders.forEach(o => {
                                            const n = normalizeCourierName(o.courier);
                                            if (!n || n === 'НЕ НАЗНАЧЕНО') return;
                                            if (!weeklyActivity[n]) weeklyActivity[n] = new Set();
                                            weeklyActivity[n].add(day.target_date);
                                        });
                                    }
                                });
                            } catch (e) {
                                logger.warn(`[TurboCalculator] ⚠️ Failed weekly activity calc: ${e.message}`);
                            }
                        }

                        data.couriers.forEach(c => {
                            const rawName = c.courierName || c.name || c.courier;
                            const upperName = (rawName || '').toString().toUpperCase().trim();
                            const normName2 = rawName ? normalizeCourierName(rawName) : null;

                            // Try all key variants
                            const calc = stats.courierStats[upperName] ||
                                stats.courierStats[normName2] ||
                                stats.courierStats[rawName];

                            if (calc) {
                                c.distanceKm = Number((calc.distanceKm || 0).toFixed(2));
                                c.calculatedOrders = calc.orders || 0;
                                c.courierType = calc.type || 'Car';

                                // v35.2: Enrichment with Weekly Stats
                                const activeDays = weeklyActivity[normName2 || upperName]?.size || 1;
                                c.activeDaysWeek = activeDays;

                                // Efficiency: Weighted orders by active days to compare people fairly
                                // Intensity = Total Orders / Active Days
                                c.weeklyIntensity = Number((c.calculatedOrders / activeDays).toFixed(2));

                                logger.info(`[TurboCalculator] 📏 Courier ${rawName}: ${c.distanceKm} km, Type: ${c.courierType}, ActiveDays/Week: ${activeDays}`);
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
            const newRoutesCount = totalRoutesCreated - existingRoutes.length;
            stats.message = `Complete! ${totalRoutesCreated} total routes (${newRoutesCount > 0 ? `${newRoutesCount} new, ` : ''}${existingRoutes.length} existing)`;
            stats.isActive = false;
            emitStatus();
            logger.info(`[TurboCalculator] ✅ DONE: ${totalRoutesCreated} total routes (${newRoutesCount} new + ${existingRoutes.length} existing), ${stats.processedCouriers} couriers processed`);

        } catch (err) {
            logger.error(`[OrderCalculator] ❌ processCache fatal: ${err.message}`);
        }
    }

    async getRobustGeocode(address, city = 'Київ', expectedZoneName = null, allZones = []) {
        if (!address) return null;

        const GeoCache = this.getModel('GeoCache');
        if (!GeoCache) return null;

        const cleaned = cleanAddress(address);
        const normalized = cleaned.toLowerCase();

        // v31.1: KML validation core
        let targetZoneName = null;
        if (expectedZoneName) {
            targetZoneName = expectedZoneName.replace(/FO\/KML:\s*/i, '').trim();
        }

        const KmlService = require('../src/services/KmlService');

        // v5.172: Use spatial grid index for fast validation + multi-zone fallback
        const validateCandidate = (lat, lng) => {
            if (!lat || !lng) return false;

            // If no expected zone, accept any point
            if (!targetZoneName) return true;

            // Use pre-loaded spatial grid for O(1) lookup
            const validation = this.validatePointInZone(lat, lng, targetZoneName, true);

            if (validation.valid) {
                if (validation.fallback) {
                    logger.info(`[TurboCalculator] ℹ️ Point ${lat},${lng} in zone "${validation.zone.name}" (fallback from "${targetZoneName}")`);
                }
                return true;
            } else {
                logger.warn(`[TurboCalculator] 🚫 Rejected: Point ${lat},${lng} is ${validation.reason || 'outside expected KML zone'}!`);
                return false;
            }
        };

        // Check local cache first (fastest)
        try {
            const cached = await GeoCache.findOne({
                where: { address_key: normalized }
            });
            if (cached) {
                if (!cached.is_success) return null;
                if (validateCandidate(cached.lat, cached.lng)) {
                    return { latitude: cached.lat, longitude: cached.lng, locationType: 'CACHED' };
                } else {
                    logger.warn(`[TurboCalculator] 🗑️ Ignored DB cache for ${normalized} (fell outside KML)`);
                }
            }
        } catch (e) { /* ignore */ }

        // v5.180: Check in-memory LRU cache with fuzzy matching
        const fuzzyResult = this.fuzzyCacheLookup(normalized);
        if (fuzzyResult && fuzzyResult.match) {
            const cached = fuzzyResult.match;
            if (cached && validateCandidate(cached.latitude, cached.longitude)) {
                logger.info(`[TurboCalculator] ✅ LRU cache hit (${fuzzyResult.type}): ${normalized}`);
                return { latitude: cached.latitude, longitude: cached.longitude, locationType: 'CACHED_LRU' };
            }
        }

        // Try all variants from cache
        const variants = generateVariants(address, city, 10).map(v => v.toLowerCase());
        for (const variant of variants) {
            if (variant === normalized) continue;
            try {
                const cached = await GeoCache.findOne({
                    where: { address_key: variant, is_success: true }
                });
                if (cached && validateCandidate(cached.lat, cached.lng)) {
                    // v5.180: Also populate LRU cache
                    this.geocache.set(normalized, { latitude: cached.lat, longitude: cached.lng });
                    return { latitude: cached.lat, longitude: cached.lng, locationType: 'CACHED' };
                }
            } catch (e) { /* ignore */ }
        }

        // v5.180: Enhanced validateCandidate with distance fallback
        const validateCandidateWithFallback = (lat, lng) => {
            if (!lat || !lng) return { valid: false, reason: 'no_coords' };

            if (!targetZoneName) return { valid: true };

            const validation = this.validatePointInZone(lat, lng, targetZoneName, true);

            if (validation.valid) {
                return { valid: true, zone: validation.zone, fallback: validation.fallback };
            }

            // v5.180: Distance fallback - find nearest zone within 500m
            const nearestZone = this.findNearestZone(lat, lng, 500);
            if (nearestZone) {
                logger.info(`[TurboCalculator] 📍 Distance fallback: ${lat},${lng} is ${nearestZone.distanceMeters}m from zone "${nearestZone.name}"`);
                return { valid: true, zone: nearestZone, distanceFallback: true };
            }

            return { valid: false, reason: validation.reason || 'outside_all_zones' };
        };

        // v5.170: Parallel provider race — fastest provider wins!
        const tryGeocode = async (query, provider, timeout) => {
            const googleKey = process.env.GOOGLE_GEOCODE_API_KEY;

            if (provider === 'google' && googleKey) {
                const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${googleKey}&language=uk`;
                const googleRes = await axios.get(googleUrl, { timeout });
                if (googleRes.data?.status === 'OK' && googleRes.data.results?.[0]) {
                    const r = googleRes.data.results[0];
                    const lat = r.geometry.location.lat;
                    const lng = r.geometry.location.lng;
                    const validation = validateCandidateWithFallback(lat, lng);
                    if (validation.valid) {
                        return { latitude: lat, longitude: lng, locationType: r.geometry.location_type || 'ROOFTOP', provider: 'google', kmlZone: validation.zone, distanceFallback: validation.distanceFallback };
                    }
                    throw new Error(`google candidate outside KML zone`);
                }
                throw new Error(`${provider} failed or empty`);
            }

            if (provider === 'photon') {
                const PHOTON_URL = process.env.PHOTON_URL || 'http://localhost:2322';
                const photonRes = await axios.get(`${PHOTON_URL}/api?q=${encodeURIComponent(query)}&limit=1&lang=uk`, { timeout });
                if (photonRes.data?.features?.length > 0) {
                    const f = photonRes.data.features[0];
                    const lat = f.geometry.coordinates[1];
                    const lng = f.geometry.coordinates[0];
                    const validation = validateCandidateWithFallback(lat, lng);
                    if (validation.valid) {
                        return { latitude: lat, longitude: lng, locationType: f.properties?.type || 'PHOTON', provider: 'photon', kmlZone: validation.zone, distanceFallback: validation.distanceFallback };
                    }
                    throw new Error(`photon candidate outside KML zone`);
                }
                throw new Error(`${provider} failed or empty`);
            }

            if (provider === 'komoot') {
                const photon2Res = await axios.get(`https://photon.komoot.io/api?q=${encodeURIComponent(query)}&limit=1&lang=uk`, { timeout });
                if (photon2Res.data?.features?.length > 0) {
                    const f = photon2Res.data.features[0];
                    const lat = f.geometry.coordinates[1];
                    const lng = f.geometry.coordinates[0];
                    const validation = validateCandidateWithFallback(lat, lng);
                    if (validation.valid) {
                        return { latitude: lat, longitude: lng, locationType: f.properties?.type || 'PHOTON', provider: 'komoot', kmlZone: validation.zone, distanceFallback: validation.distanceFallback };
                    }
                    throw new Error(`komoot candidate outside KML zone`);
                }
                throw new Error(`${provider} failed or empty`);
            }

            if (provider === 'nominatim') {
                const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1&accept-language=uk`;
                const nomRes = await axios.get(nomUrl, {
                    timeout,
                    headers: { 'User-Agent': 'KillMetraj/1.0' }
                });
                if (Array.isArray(nomRes.data) && nomRes.data.length > 0) {
                    const r = nomRes.data[0];
                    const lat = parseFloat(r.lat);
                    const lng = parseFloat(r.lon);
                    const validation = validateCandidateWithFallback(lat, lng);
                    if (validation.valid) {
                        return { latitude: lat, longitude: lng, locationType: r.type || 'NOMINATIM', provider: 'nominatim', kmlZone: validation.zone, distanceFallback: validation.distanceFallback };
                    }
                    throw new Error(`nominatim candidate outside KML zone`);
                }
                throw new Error(`${provider} failed or empty`);
            }

            throw new Error(`${provider} failed`);
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

        // v5.180: Primary attempt — parallel race with retry + exponential backoff
        const primaryQuery = cleaned + ', ' + city;
        const primaryProviders = ['google', 'photon', 'komoot', 'nominatim'].filter(p => {
            if (p === 'google') return !!process.env.GOOGLE_GEOCODE_API_KEY;
            return true;
        });

        // v5.180: Retry wrapper with exponential backoff
        const tryGeocodeWithRetry = async (query, provider, timeout) => {
            return pRetry(() => tryGeocode(query, provider, timeout), {
                retries: 2,
                minTimeout: 1000,
                maxTimeout: 3000,
                factor: 2,
                onFailedAttempt: error => {
                    logger.warn(`[TurboCalculator] 🔄 ${provider} attempt ${error.attemptNumber} failed: ${error.message}`);
                }
            });
        };

        try {
            const result = await Promise.any(
                primaryProviders.map(p => tryGeocodeWithRetry(primaryQuery, p, 5000))
            );
            await cacheResult(result, result.provider);
            // v5.180: Store in LRU cache
            this.geocache.set(normalized, { latitude: result.latitude, longitude: result.longitude });
            return result;
        } catch (e) {
            // All primary providers failed — try fallback strategies
        }

        logger.info(`[TurboCalculator] 🔄 Primary geocoding failed for "${address}", trying fallback strategies...`);

        // v5.170: Fallback strategies — also parallel
        const fallbackStrategies = [];

        // Strategy 1: Remove house number
        const noHouse = cleaned.replace(/\b\d+[а-яА-Яa-zA-ZіІєЄґґ]*(?:[\/\-]\d*)?\b/g, '').trim();
        if (noHouse && noHouse !== cleaned) {
            fallbackStrategies.push({ query: noHouse + ', ' + city, strategy: 'no-house' });
        }

        // Strategy 2: Simplified address
        const simplified = cleaned
            .replace(/(?:под\.?|подъезд|п)\s*\d+/gi, '')
            .replace(/(?:кв\.?|квартира)\s*\d+/gi, '')
            .replace(/(?:эт\.?|этаж)\s*\d+/gi, '')
            .replace(/(?:оф\.?|офис)\s*\w+/gi, '')
            .replace(/д\/ф\s*\w*/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (simplified && simplified !== cleaned) {
            fallbackStrategies.push({ query: simplified + ', ' + city, strategy: 'simplified' });
        }

        // Strategy 3: Just city + street name
        const streetMatch = cleaned.match(/((?:вул\.?|просп\.?|пр-т|пров\.?|пер\.?|бульвар)\s*[\w\s'-]+)/i);
        if (streetMatch) {
            const cityMatch = cleaned.match(/(Київ|Киев|Дніпро|Одеса|Харків|Львів)/i);
            const minimalQuery = cityMatch ? `${cityMatch[1]}, ${streetMatch[1]}` : streetMatch[1];
            fallbackStrategies.push({ query: minimalQuery, strategy: 'street-only' });
        }

        // Strategy 4: Deep Recovery - Everything before the first comma (often the pure street + house)
        const beforeComma = cleaned.split(',')[0].trim();
        // Remove common fast-food comments that might be before the comma
        const cleanedBeforeComma = beforeComma.replace(/(?:кв|квартира|под|подъезд|эт|этаж|п|оф|офис)\s*\d*.*/gi, '').trim();
        if (cleanedBeforeComma && cleanedBeforeComma !== cleaned && cleanedBeforeComma !== simplified) {
            fallbackStrategies.push({ query: cleanedBeforeComma + ', ' + city, strategy: 'before-comma' });
        }

        // Strategy 5: Deep Recovery - First two words + first number (e.g. "Леся курбаса 5")
        const words = cleaned.split(/[\s,]+/);
        const textWords = words.filter(w => /[a-zA-Zа-яА-ЯіІєЄїЇ]/.test(w) && w.length > 2 && !/^(вул|просп|пр-т|пров|пер|бульвар)$/i.test(w)).slice(0, 2).join(' ');
        const firstNumMatch = cleaned.match(/\b\d+[а-яА-Яa-zA-ZіІєЄїЇ]{0,2}\b/);
        const firstNum = firstNumMatch ? firstNumMatch[0] : '';
        const desperateQuery = `${textWords} ${firstNum}, ${city}`.trim();
        if (textWords && desperateQuery !== cleaned && desperateQuery !== (cleanedBeforeComma + ', ' + city)) {
            fallbackStrategies.push({ query: desperateQuery, strategy: 'desperate-text-num' });
        }

        // Strategy 6: Deep Recovery - Relaxed search using just the first significant word and city (e.g., "Соборная, Киев")
        const firstLongWord = words.find(w => /[a-zA-Zа-яА-ЯіІєЄїЇ]/.test(w) && w.length > 4);
        if (firstLongWord) {
            fallbackStrategies.push({ query: `${firstLongWord}, ${city}`, strategy: 'first-long-word' });
        }


        for (const fb of fallbackStrategies) {
            logger.info(`[TurboCalculator]   Strategy ${fb.strategy}: "${fb.query}"`);
            try {
                const result = await Promise.any(
                    primaryProviders.map(p => tryGeocode(fb.query, p, 4000))
                );
                logger.info(`[TurboCalculator]   ✅ Fallback success (${fb.strategy}) via ${result.provider}`);
                await cacheResult(result, result.provider);
                return result;
            } catch (e) {
                // This strategy failed, try next
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
                logger.warn(`[TurboCalculator] ⚠️ Base-to-Base distance is huge (${(distHaversine / 1000).toFixed(1)}km). Check settings!`);
            }
        }

        // v2.2: Multi-engine race - Yapiko OSRM is PRIORITY, others as fallback
        // v5.180: Added retry with exponential backoff to each engine
        const engines = [
            {
                name: 'yapiko-osrm',
                priority: 1,
                calculate: async () => {
                    const baseUrl = (customOsrmUrl || this.osrmUrl).trim().replace(/\/+$/, '');
                    const url = `${baseUrl}/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
                    const response = await pRetry(
                        () => axios.get(url, { timeout: 8000 }),
                        { retries: 2, minTimeout: 1000, factor: 2 }
                    );
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
                    const response = await pRetry(
                        () => axios.post(`${vUrl}/route`, request, {
                            timeout: 10000,
                            headers: { 'Content-Type': 'application/json' }
                        }),
                        { retries: 2, minTimeout: 1000, factor: 2 }
                    );
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
                    const response = await pRetry(
                        () => axios.get(url, { timeout: 10000 }),
                        { retries: 2, minTimeout: 1000, factor: 2 }
                    );
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
                    const response = await pRetry(
                        () => axios.get(url, { timeout: 10000 }),
                        { retries: 2, minTimeout: 1000, factor: 2 }
                    );
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
     * v5.180: 2-opt local search for route optimization
     * Improves route order by iteratively swapping segments to reduce total distance
     * Best for 10-50 stops, O(n²) but fast enough for delivery routes
     */
    optimizeRoute2Opt(points, maxIterations = 100) {
        if (points.length <= 3) return { points, improved: false, savingsPct: 0 };

        // Clone points to avoid mutating original
        let route = points.map(p => ({ ...p }));

        // Calculate initial total distance
        const calcTotalDistance = (r) => {
            let total = 0;
            for (let i = 0; i < r.length - 1; i++) {
                total += this.haversineDistance(r[i].lat, r[i].lng, r[i + 1].lat, r[i + 1].lng);
            }
            return total;
        };

        let bestDistance = calcTotalDistance(route);
        let improved = false;

        for (let iter = 0; iter < maxIterations; iter++) {
            let iterationImproved = false;

            for (let i = 1; i < route.length - 2; i++) {
                for (let j = i + 1; j < route.length - 1; j++) {
                    // Create new route with segment i..j reversed
                    const newRoute = [
                        ...route.slice(0, i),
                        ...route.slice(i, j + 1).reverse(),
                        ...route.slice(j + 1)
                    ];

                    const newDistance = calcTotalDistance(newRoute);
                    if (newDistance < bestDistance) {
                        route = newRoute;
                        bestDistance = newDistance;
                        iterationImproved = true;
                        improved = true;
                    }
                }
            }

            // If no improvement in this iteration, we've converged
            if (!iterationImproved) break;
        }

        const initialDistance = calcTotalDistance(points);
        const savingsPct = initialDistance > 0 ? ((initialDistance - bestDistance) / initialDistance * 100) : 0;

        if (improved) {
            logger.info(`[TurboCalculator] 🔄 2-opt: ${initialDistance.toFixed(0)}m -> ${bestDistance.toFixed(0)}m (${savingsPct.toFixed(1)}% savings)`);
        }

        return { points: route, improved, savingsPct };
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
