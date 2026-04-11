// v22.0: Optimized for Sequelize Model Registry. No more require circularity!
const logger = require('../src/utils/logger');
const axios = require('axios');
const { Op } = require('sequelize');
const { sequelize } = require('../src/config/database');
const { cleanAddress, generateVariants } = require('../src/utils/addressUtils');
const { 
    groupAllOrdersByTimeWindow, 
    normalizeCourierName, 
    getExecutionTime,
    getPlannedTime,
    getArrivalTime,
    getKitchenTime,
    getAllOrderIds,
    getOrderHash,
    haversineDistance
} = require('./turboGroupingHelpers');
const { batchEnhancedGeocode, checkAnomalyDistance, deepCleanAddress } = require('./turboGeoEnhanced');
const { enhanceAllOrderCoords, buildZoneCentroids, calculateTotalRouteDistance, haversineKm } = require('./turboCoordValidator');

// v36.9: CommonJS-safe local implementations of essential utilities (zero-dependency)
const pLimit = (concurrency) => {
    const queue = [];
    let activeCount = 0;
    const next = () => {
        activeCount--;
        if (queue.length > 0) queue.shift()();
    };
    return (fn) => new Promise((resolve, reject) => {
        const run = () => {
            activeCount++;
            fn().then(resolve, reject).finally(next);
        };
        if (activeCount < concurrency) run();
        else queue.push(run);
    });
};

const pRetry = async (fn, options = {}) => {
    const { retries = 3, minTimeout = 1000 } = options;
    for (let i = 0; i <= retries; i++) {
        try { return await fn(); } catch (err) {
            if (i === retries) throw err;
            await new Promise(r => setTimeout(r, minTimeout * Math.pow(2, i)));
        }
    }
};

const leven = (a, b) => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
            else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
        }
    }
    return matrix[b.length][a.length];
};

class SimpleLRU {
    constructor({ maxSize }) { this.maxSize = maxSize; this.cache = new Map(); }
    get(key) {
        if (!this.cache.has(key)) return undefined;
        const val = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, val);
        return val;
    }
    set(key, val) {
        if (this.cache.has(key)) this.cache.delete(key);
        else if (this.cache.size >= this.maxSize) this.cache.delete(this.cache.keys().next().value);
        this.cache.set(key, val);
    }
    has(key) { return this.cache.has(key); }
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
        // v7.1: Idle tick every 5 minutes — notifyNewFOData() wakes divisions immediately on real changes
        this.interval = 5 * 60 * 1000; // 5 minutes
        // v7.1: Per-division cooldown: minimum time before re-running even with new data
        this.MIN_CALC_INTERVAL_MS = 90 * 1000; // 90 seconds minimum between recalculations
        // v6.11: Track timestamp of last completed calculation per division
        this.lastCalculatedAt = new Map();
        // v6.11: Track if FO data changed since last calc (to wake up immediately)
        this.newFODataPending = new Map(); // divisionId -> true
        this.timer = null;
        this.isProcessing = false;
        this.io = null;

        // Settings
        this.osrmUrl = process.env.YAPIKO_OSRM_URL || process.env.OSRM_URL || 'http://116.204.153.171:5050';

        // v23.1: Persistent Geocache (Zero-dependency LRU)
        this.geocache = new SimpleLRU({ maxSize: 5000, maxAge: 24 * 60 * 60 * 1000 });
        this.addressUtils = require('../src/utils/addressUtils');

        // v5.172: KML Zone Spatial Grid Index for O(1) lookup
        this.kmlZones = []; // All active KML zones
        this.kmlGridIndex = new Map(); // Spatial grid: "lat,lng" -> [zones]
        this.GRID_SIZE = 0.01; // ~1.1km at equator

        // v5.180: Route calculation concurrency limit (v6.10: increased for faster processing)
        this.routeLimit = pLimit(10); // Max 10 concurrent route calculations

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

        // v5.185: Haversine distance in meters
        this.FUZZY_THRESHOLD = 3; // Max Levenshtein distance for fuzzy match

        // Per-division state
        this.divisionStates = new Map();
        this.processedHashes = new Map();
        this.priorityQueue = [];
        this.currentPriority = null;

        // v5.185: Pre-load KML zones on construction
        this.preloadKmlZones();
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
            
            // v7.1: Precompute zone centroids for fast coordinate validation
            this.zoneCentroids = buildZoneCentroids(this.kmlZones);

            logger.info(`[TurboCalculator] 📦 Pre-loaded ${this.kmlZones.length} KML zones with spatial grid index and centroids`);
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
    // v6.11 FIX: Fallback is now STRICT — only adjacent zones accepted, not any zone in the city
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

        // v6.11 STRICT FALLBACK: Only accept a fallback if the fallback zone is near the expected zone.
        // "Near" means the point (which IS in the fallback zone) is within 5km of the expected zone's boundary.
        if (allowFallback && zones[0]) {
            // Find the expected zone to compute distance to it
            const expectedZoneObj = this.kmlZones.find(z => z.name.toLowerCase().includes(expectedNormalized));
            if (!expectedZoneObj || !expectedZoneObj.bounds) {
                // Can't validate distance — reject the fallback to be safe
                logger.warn(`[TurboCalculator] 🚫 Strict fallback: expected zone "${expectedZoneName}" not found in KML index — rejecting point ${lat},${lng}`);
                return { valid: false, zone: zones[0], reason: 'expected_zone_not_found' };
            }
            // Compute distance from point to the expected zone's center (bounding box centroid)
            const zoneCenterLat = (expectedZoneObj.bounds.north + expectedZoneObj.bounds.south) / 2;
            const zoneCenterLng = (expectedZoneObj.bounds.east + expectedZoneObj.bounds.west) / 2;
            const distMeters = this.haversineDistance(lat, lng, zoneCenterLat, zoneCenterLng);
            const MAX_FALLBACK_DIST_M = 5000; // 5km — adjacent zone is ok, cross-city is not
            if (distMeters <= MAX_FALLBACK_DIST_M) {
                logger.info(`[TurboCalculator] ℹ️ Accepted nearby fallback zone "${zones[0].name}" (${(distMeters/1000).toFixed(1)}km from expected "${expectedZoneName}")`);
                return { valid: true, zone: zones[0], fallback: true };
            } else {
                logger.warn(`[TurboCalculator] 🚫 REJECTED cross-city fallback: point ${lat},${lng} is in zone "${zones[0].name}" but ${(distMeters/1000).toFixed(1)}km from expected "${expectedZoneName}"`);
                return { valid: false, zone: zones[0], reason: 'fallback_too_far' };
            }
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
                
                // v5.197: Ensure legacy active division is also in divisionStates map so it ticks
                if (this.activeDivisionId) {
                    const divId = String(this.activeDivisionId);
                    if (!this.divisionStates.has(divId)) {
                        this.divisionStates.set(divId, {
                            users: new Set(),
                            date: this.activeDivisionDate,
                            priorityQueue: [],
                            currentPriority: null,
                            isActive: false, // v6.11 FIX: Do NOT auto-resume legacy divisions, they cause infinite high-load loops for old dates
                        });
                    }
                }
            }
        } catch (error) {
            logger.warn('[TurboCalculator] ⚠️ Could not load saved state:', error.message);
        }
    }

    async loadAllDivisionStatesFromDB() {
        logger.info('[TurboCalculator] 📂 Attempting to load division states from DB...');
        try {
            const DivisionState = this.getModel('DashboardDivisionState');
            if (!DivisionState) {
                logger.warn('[TurboCalculator] ⚠️ DashboardDivisionState model not found - skipping DB load');
                return;
            }
            const rows = await DivisionState.findAll();
            for (const r of rows) {
                const userId = r.user_id;
                const divId = r.division_id;
                const date = r.date;
                const isActive = r.is_active;
                if (divId) {
                    let state = this.divisionStates.get(divId);
                    if (!state) {
                        state = { 
                            users: new Set(), 
                            date: date || new Date().toISOString().split('T')[0], 
                            priorityQueue: [], 
                            currentPriority: null, 
                            // v6.10: DO NOT auto-resume from DB - only start when user clicks "Запустить расчёт"
                            isActive: false 
                        };
                        this.divisionStates.set(divId, state);
                    }
                    
                    // v5.185: Re-initialize users if missing (Sequelize JSON hydration safety)
                    if (!state.users || typeof state.users.add !== 'function') {
                        state.users = new Set();
                    }
                    
                    if (userId) {
                        state.users.add(userId);
                    }
                    if (date) state.date = date;
                    // v6.10: Keep isActive as false when loading from DB - wait for user trigger
                    // state.isActive = !!isActive; // REMOVED - don't auto-resume

                    if (state.isActive) {
                        logger.info(`[TurboCalculator] 🔄 Auto-resuming division: ${divId} for date ${state.date}`);
                    } else {
                        logger.info(`[TurboCalculator] 📥 Loaded division ${divId} (inactive - waiting for user trigger)`);
                    }
                }
            }
            logger.info('[TurboCalculator] ✅ Loaded division states from DB into memory');

            // v6.10: DO NOT auto-trigger on server start - only trigger when user explicitly clicks "Запустить расчёт"
            // Removed: if (this.isRunning && !this.isProcessing) { this.tick(); }
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
            logger.warn(`[OrderCalculator] Model ${name} not found or not a Sequelize model. Available: [${Object.keys(models).join(', ')}]`);
            return null;
        } catch (error) {
            logger.error(`[OrderCalculator] Failed to load model ${name}:`, error.message);
            return null;
        }
    }

    async start(io = null) {
        this.io = io || this.io;
        if (this.isRunning) return;
        // v5.185: INTITIALIZING
        this.isRunning = true;
        this.io = io || this.io;

        // v5.185: Restore saved division states on restart
        // This MUST happen after isRunning=true so that tick() can be triggered
        await this.loadSavedState();
        await this.loadAllDivisionStatesFromDB();

        logger.info(`[TurboCalculator] 🚀 v7.0 SERVER-FIRST — Initialized. Auto-starting tick loop.`);

        // v7.0: SERVER-FIRST — always auto-start the tick loop.
        // Calculations run automatically when FO data arrives.
        this.scheduleNextTick(true);
    }

    scheduleNextTick(forceInitial = false) {
        if (this.timer) clearTimeout(this.timer);

        // v7.0: SERVER-FIRST — always keep the tick loop running.
        // No longer stops when there are no "active" user-started divisions.
        this.timer = setTimeout(() => this.tick(), this.interval);
    }
    /**
     * Trigger calculation for a division - supports multi-division (memory only)
     * @param {string} divisionId - Division to start
     * @param {string} date - Date to process
     * @param {string} userId - User initiating trigger
     * @param {boolean} forceFull - If true, recalculate ALL orders (not incremental)
     * @param {string|number} targetCourier - Optional courier ID to filter
     */
    trigger(divisionId, date = null, userId = null, forceFull = false, targetCourier = null) {
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

        if (this.io) {
            const divIdStr = String(divisionId);
            
            // v7.5: Try to get totalCount from current cache to avoid "flashing 0" in UI
            const DashboardCache = this.getModel('DashboardCache');
            const emitInitial = (count = 0) => {
                const initStatus = {
                    divisionId: divIdStr,
                    date: targetDate,
                    isActive: true,
                    currentPhase: 'initializing',
                    message: 'Preparing data for analysis...',
                    totalCount: count,
                    processedCount: 0
                };
                if (this.io) this.io.emit('robot_status', initStatus);
                if (global.divisionStatusStore) {
                    global.divisionStatusStore[`${divIdStr}_${targetDate}`] = initStatus;
                }
            };

            if (DashboardCache) {
                 DashboardCache.findOne({ where: { division_id: divIdStr, target_date: targetDate } })
                    .then(c => {
                        const count = (c && c.payload && Array.isArray(c.payload.orders)) ? c.payload.orders.length : 0;
                        emitInitial(count);
                    }).catch(() => emitInitial(0));
            } else {
                emitInitial(0);
            }
            
            logger.info(`[TurboCalculator] 📡 Emitted initial status for division ${divIdStr}${targetCourier ? ` (Target: ${targetCourier})` : ''}`);
        }

        let state = this.divisionStates.get(divisionId);
        if (!state) {
            state = { users: new Set(), date: targetDate, priorityQueue: [], currentPriority: null, isActive: true, forceFull, targetCourier };
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
            state.targetCourier = targetCourier; // v37.1: Optional target courier
        }
        if (userId) {
            if (!state.users || typeof state.users.add !== 'function') {
                state.users = new Set();
            }
            state.users.add(userId);
        }

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
                    last_triggered_at: new Date()
                });
            }
        } catch (e) { /* ignore DB persistence errors */ }

        // v6.10: START IMMEDIATELY - don't wait for next tick cycle
        logger.info(`[TurboCalculator] 🚀 Starting immediate processing for ${divisionId} on ${targetDate}`);
        if (!this.isProcessing) {
            this.tick();
        } else {
            this.needsReRun = true;
        }
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

        const pendingDivs = Array.from(this.newFODataPending.keys());
        const activeDivs = Array.from(this.divisionStates.entries())
            .filter(([id, s]) => s.isActive || this.newFODataPending.has(id))
            .map(([id]) => id);

        logger.info(`[TurboCalculator] 🔄 tick() — active: [${activeDivs.join(', ')}], pending: [${pendingDivs.join(', ')}]`);

        if (activeDivs.length === 0) {
            logger.info('[TurboCalculator] 💤 All divisions idle, no pending FO data — tick skipped, timer rescheduled');
            this.scheduleNextTick();
            return;
        }

        this.isProcessing = true;
        this.needsReRun = false;

        try {
            const tasks = [];
            for (const [divId, state] of this.divisionStates.entries()) {
                const hasPendingFOData = this.newFODataPending.get(divId) === true;

                // v7.1: Only process if: (a) isActive AND cooldown passed, OR (b) new FO data arrived
                const lastCalc = this.lastCalculatedAt.get(divId);
                const timeSinceLastCalc = lastCalc ? Date.now() - lastCalc : Infinity;
                const cooldownOk = timeSinceLastCalc >= this.MIN_CALC_INTERVAL_MS;

                // v7.2: Bypass cooldown if forceFull=true (manual trigger from user)
                const isForceFull = state.forceFull === true;
                if (!hasPendingFOData && (!state.isActive || (!cooldownOk && !isForceFull))) {
                    if (!cooldownOk && !isForceFull) {
                        const waitSec = Math.ceil((this.MIN_CALC_INTERVAL_MS - timeSinceLastCalc) / 1000);
                        logger.info(`[TurboCalculator] ⏸️ ${divId}: Cooldown (${waitSec}s left), no new FO data — skip`);
                    }
                    continue;
                }

                // Clear pending flag before processing
                if (hasPendingFOData) {
                    this.newFODataPending.delete(divId);
                    // Reactivate if it was idle
                    if (!state.isActive) {
                        state.isActive = true;
                        logger.info(`[TurboCalculator] 🔔 ${divId}: Reactivated by new FO data`);
                    }
                }

                let targetDate = state.date || new Date().toISOString().split('T')[0];
                logger.info(`[TurboCalculator] ⚙️ Starting calculation for ${divId} on ${targetDate}`);
                tasks.push(this.processDay(targetDate, divId));
            }
            await Promise.all(tasks);
        } catch (err) {
            logger.error('[TurboCalculator] ❌ Robot Tick critical failure:', err);
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
            if (this.needsReRun) this.trigger();
        }
    }

    /**
     * v7.0: SERVER-FIRST — called by server when fresh FO data arrives.
     * NOW ALWAYS activates calculation for this division, regardless of user action.
     * The server is self-sufficient: no user action needed to start calculations.
     */
    notifyNewFOData(divisionId, date) {
        if (!divisionId) return;
        const divIdStr = String(divisionId);
        const targetDate = date || new Date().toISOString().split('T')[0];

        if (divIdStr === 'all') {
            const DashboardCache = this.getModel('DashboardCache');
            if (DashboardCache) {
                DashboardCache.findAll({
                    where: { target_date: targetDate },
                    attributes: ['division_id']
                }).then(caches => {
                    const uniqueDivs = new Set(caches.map(c => String(c.division_id)));
                    uniqueDivs.forEach(divId => {
                        let st = this.divisionStates.get(divId);
                        if (!st) {
                            st = { users: new Set(), date: targetDate, priorityQueue: [], currentPriority: null, isActive: true, forceFull: false };
                            this.divisionStates.set(divId, st);
                        } else {
                            st.isActive = true;
                            st.date = targetDate;
                        }
                        this.newFODataPending.set(divId, true);
                        this.processedHashes.delete(`${divId}_${targetDate}`);
                    });
                    logger.info(`[TurboCalculator] 🔔 Global trigger: Woke up ${uniqueDivs.size} divisions from DB.`);
                    this.trigger(); 
                }).catch(err => {
                    logger.error(`[TurboCalculator] Failed to wake up divisions: ${err.message}`);
                });
            }
            return;
        }

        // v7.0: ALWAYS activate this division — no isActive check anymore
        let state = this.divisionStates.get(divIdStr);
        if (!state) {
            state = { users: new Set(), date: targetDate, priorityQueue: [], currentPriority: null, isActive: true, forceFull: false };
            this.divisionStates.set(divIdStr, state);
        } else {
            state.isActive = true;
            state.date = targetDate;
        }

        // Mark that new FO data is available for this division
        this.newFODataPending.set(divIdStr, true);
        
        // Clear the stale hash so processCache detects the change
        this.processedHashes.delete(`${divIdStr}_${targetDate}`);

        logger.info(`[TurboCalculator] 🔔 New FO data for division ${divIdStr} (${targetDate}) — AUTO-ACTIVATING calculation`);

        // v7.3: Reduce delay for instant-feel (500ms)
        if (this.isProcessing) {
            this.needsReRun = true;
        } else if (this.timer) {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.tick(), 500); 
        } else {
            this.timer = setTimeout(() => this.tick(), 500);
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
                // Seed empty cache so UI can display 0 results immediately
                try {
                    const DashboardCache = this.getModel('DashboardCache');
                    if (DashboardCache) {
                        await DashboardCache.upsert({
                          division_id: String(priorityDivisionId || 'all'),
                          target_date: dateISO,
                          payload: { orders: [], routes: [], couriers: [] },
                          data_hash: 'empty',
                          created_at: new Date(),
                          updated_at: new Date()
                        });
                        logger.info(`[TurboCalculator] 🔄 Seeded empty DashboardCache for ${priorityDivisionId || 'all'} on ${dateISO}`);
                        // Update today-diagnostics cache/status
                        global.turboTodayCacheExists = true;
                        global.turboTodayLastCalc = Date.now();
                      }
                    } catch (seedErr) {
                      logger.warn('[TurboCalculator] Failed to seed empty DashboardCache:', seedErr.message);
                    }
                if (this.io) {
                    this.io.emit('robot_status', {
                        divisionId: priorityDivisionId,
                        date: dateISO,
                        isActive: false,
                        currentPhase: 'no_data',
                        message: `Нет данных за ${dateISO}. Фоновый расчет пропущен`,
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

            // v6.2: Global statistics for 'all' mode to prevent progress bar flickering/resets
            if (priorityDivisionId === 'all') {
                let totalOrdersGlobal = 0;
                caches.forEach(c => {
                    totalOrdersGlobal += (c.payload?.orders?.length || 0);
                });

                // v6.12: Preserve global progress count to avoid flickering
                const globalStatus = global.divisionStatusStore ? global.divisionStatusStore['all_global'] : null;
                const currentGlobalProcessed = globalStatus ? (globalStatus.processedCount || 0) : 0;

                this.globalStats = {
                    divisionId: 'all',
                    date: dateISO,
                    isActive: true,
                    totalCount: totalOrdersGlobal,
                    processedCount: currentGlobalProcessed,
                    skippedInRoutes: globalStatus ? (globalStatus.skippedInRoutes || 0) : 0,
                    skippedGeocoding: globalStatus ? (globalStatus.skippedGeocoding || 0) : 0,
                    message: `Processing all divisions (${totalOrdersGlobal} orders)...`
                };

                if (this.io) {
                    this.io.emit('robot_status', this.globalStats);
                }
            } else {
                this.globalStats = null;
                // v7.7: Emit immediate 'starting' status for specific division to wake up UI
                if (this.io && priorityDivisionId) {
                    this.io.emit('robot_status', {
                        divisionId: priorityDivisionId,
                        date: dateISO,
                        isActive: true,
                        totalCount: caches[0]?.payload?.orders?.length || 0,
                        processedCount: 0,
                        currentPhase: 'initializing',
                        message: 'Подготовка к расчету...'
                    });
                }
            }

            // v5.198: Process all caches for 'all' division, otherwise pick primary
            const cachesToProcess = (priorityDivisionId === 'all') ? caches : [caches.reduce((best, c) => {
                const currentCount = c.payload?.orders?.length || 0;
                const bestCount = best?.payload?.orders?.length || 0;
                return currentCount > bestCount ? c : best;
            }, null)].filter(c => !!c);

            if (cachesToProcess.length > 1 && priorityDivisionId !== 'all') {
                logger.warn(`[TurboCalculator] ⚠️ Found ${caches.length} caches for ${priorityDivisionId} on ${dateISO}, using the largest one only`);
            }

            for (const cache of cachesToProcess) {
                logger.info(`[TurboCalculator] 🔄 Processing cache: id=${cache.id}, orders=${cache.payload?.orders?.length || 0}, division=${cache.division_id}`);
                await this.processCache(cache);
            }
        } catch (err) {
            logger.error(`[OrderCalculator] ❌ processDay error (${dateISO}):`, err);
        }
    }

    async processCache(cache) {
        try {
            const data = cache.payload;
            const targetDateNorm = normalizeDateISO(cache.target_date);
            let totalRoutesCreated = 0;

            // v30.0 CRITICAL FIX: Route must be declared inside processCache.
            // Previously it was ONLY declared in processDay (different scope),
            // causing every Route.create() call to throw "Route is not defined".
            // Op and sequelize are fine — they're declared at module scope (lines 4-5).
            const Route = this.getModel('Route');
            // v5.196: Get real totalCount immediately as possible to avoid 'zeros' in UI
            // v7.2: Use ONLY routeable orders for the status count to perfectly match the Frontend Results table
            let cacheTotalCount = 0;
            if (data?.orders) {
                cacheTotalCount = data.orders.filter(o => {
                    const c = String(o.courier || o.courierName || o.courierId || '').toUpperCase().trim();
                    const s = String(o.status || o.deliveryStatus || '').toLowerCase().trim();
                    if (!c || c === 'НЕ НАЗНАЧЕНО' || c === 'UNASSIGNED' || c === 'ПО' || c === 'ID:0') return false;
                    if (s.includes('отказ') || s.includes('отменен') || s.includes('відмова')) return false;
                    if (s.includes('самовывоз') || s.includes('на месте')) return false;
                    return true;
                }).length;
            }
            if (this.io && cacheTotalCount > 0) {
                // v6.12: Don't jump to 0 if we already have progress in the global store
                const divStatusKey = `${cache.division_id}_${targetDateNorm}`;
                const existingStatus = global.divisionStatusStore ? global.divisionStatusStore[divStatusKey] : null;
                const currentProcessed = existingStatus ? (existingStatus.processedCount || 0) : 0;

                this.io.emit('robot_status', {
                    divisionId: cache.division_id,
                    date: cache.target_date,
                    isActive: true,
                    totalCount: cacheTotalCount,
                    processedCount: currentProcessed, // Keep current progress
                    currentPhase: 'initializing',
                    message: `Analyzing data (${currentProcessed}/${cacheTotalCount})...`
                });
            }

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

            // v5.195: Move Data Hash computation to the very beginning to prevent redundant DB hits
            const crypto = require('crypto');
            const stablePayload = (data.orders || []).map(o => ({
                id: o.id || o._id,
                n: o.orderNumber,
                c: String(o.courier || o.courierName || o.courierId || '').toUpperCase().trim(),
                s: o.status || o.deliveryStatus,
                a: String(o.address || o.addressGeo || '').toLowerCase(),
                t: o.deliverBy || o.plannedTime || o.deliveryTime || o.handoverAt,
            }));

            const dataHash = crypto.createHash('sha256').update(JSON.stringify(stablePayload)).digest('hex');
            const cacheKey = `${cache.division_id}_${targetDateNorm || cache.target_date}`;

            const existingHash = this.processedHashes.get(cacheKey);

            // If hash unchanged — put division to SLEEP, wake only on new FO data
            // v7.2: If forceFull=true (manual trigger), SKIP the hash check and always recalculate
            const divState = this.divisionStates.get(String(cache.division_id));
            if (existingHash === dataHash && !divState?.forceFull) {
                // v7.1: Deactivate division — tick will skip it until notifyNewFOData() reactivates
                if (divState) {
                    divState.isActive = false;
                    logger.info(`[TurboCalculator] 💤 ${cache.division_id}: Data unchanged — DEACTIVATED. Will reactivate on new FO data.`);
                }

                // Fetch last known status for accurate UI display
                const divStatusKey = `${cache.division_id}_${targetDateNorm}`;
                const lastStatus = global.divisionStatusStore?.[divStatusKey] || {};

                if (this.io) {
                    this.io.emit('robot_status', {
                        divisionId: cache.division_id,
                        date: targetDateNorm || cache.target_date,
                        isActive: false,
                        currentPhase: 'complete',
                        message: `Расчёт завершён. Ожидание новых данных...`,
                        totalCount: cacheTotalCount,
                        processedCount: lastStatus.processedCount || cacheTotalCount,
                        skippedInRoutes: lastStatus.skippedInRoutes || 0,
                        skippedGeocoding: lastStatus.skippedGeocoding || 0
                    });
                }
                return;
            }


            logger.info(`[TurboCalculator] 🔄 ${cacheKey}: ${existingHash === dataHash ? 'forceFull=true bypassed hash skip' : 'Data changed'} — triggering recalculation`);
            // v37.2: CRITICAL — Extract flags BEFORE clearing divState so they are available in the courier loop
            const forceFull = !!divState?.forceFull;
            const targetCourier = divState?.targetCourier || null;
            
            // v7.2: Reset flags so future ticks run normally (only bypass once per manual trigger)
            if (divState?.forceFull) {
                divState.forceFull = false;
                logger.info(`[TurboCalculator] 🔓 ${cache.division_id}: Cleared forceFull flag after manual trigger`);
            }
            if (divState?.targetCourier) {
                divState.targetCourier = null;
                logger.info(`[TurboCalculator] 🎯 ${cache.division_id}: Cleared targetCourier flag (was: ${targetCourier})`);
            }

            // v37.9: Explicitly delete TARGET COURIER'S old routes BEFORE recalculation to prevent dupes!
            if (targetCourier && Route) {
                try {
                    const normTarget = normalizeCourierName(targetCourier);
                    const delCount = await Route.destroy({
                        where: {
                            division_id: cache.division_id,
                            courier_id: normTarget,
                            [Op.and]: sequelize.where(
                                sequelize.literal("route_data->>'target_date'"),
                                targetDateNorm || cache.target_date
                            )
                        }
                    });
                    logger.info(`[TurboCalculator] 🗑️ Wiped ${delCount} old routes for targetCourier ${normTarget} to prevent dupes!`);
                } catch(e) {
                    logger.warn(`[TurboCalculator] Failed to wipe old routes for ${targetCourier}: ${e.message}`);
                }
            }

            const existingRoutedOrderNumbers = new Set();
            const existingRoutedOrderIds = new Set();
            let existingRoutes = [];
            
            // Map to store existing route signatures for PERFECT incremental routing without breaking groups
            const existingRouteMap = new Map();
            const getBlockSignature = (orders) => orders.map(o => String(o.orderNumber || o.id)).sort().join('_');

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
                        order: [['calculated_at', 'ASC']]
                    });

                    existingRoutes.forEach(r => {
                        const orders = r.route_data?.orders || [];
                        orders.forEach(o => {
                            if (o.orderNumber) existingRoutedOrderNumbers.add(String(o.orderNumber));
                            if (o.id) existingRoutedOrderIds.add(String(o.id));
                        });
                        
                        // v5.195: Build signature map for incremental skipping
                        if (orders.length > 0) {
                            const sig = getBlockSignature(orders);
                            existingRouteMap.set(sig, r);
                        }
                    });

                    if (existingRoutes.length > 0) {
                        logger.info(`[TurboCalculator] 📦 Found ${existingRoutes.length} existing routes mapped by signature`);
                    }
                } catch (e) {
                    logger.warn(`[TurboCalculator] ⚠️ Failed to fetch existing routes: ${e.message}`);
                }
            }

            // v31.1: Fetch all KML zones once per cache processing
            let allKmlZones = [];
            try {
                const KmlZone = this.getModel('KmlZone');
                if (KmlZone) allKmlZones = await KmlZone.findAll();
            } catch (e) {
                logger.warn(`[TurboCalculator] ⚠️ Failed to fetch KmlZones: ${e.message}`);
            }

            // v33: In-Memory cache for partial renders to skip DB O(N^2) hits!
            let inMemoryFrontendRoutes = [];

            // v33: Pre-fetch Presets ONCE for entire cache processing
            const presets = await this.getDivisionPresets(cache.division_id);
            const processedCourierNames = new Set();
            const cityBias = presets?.cityBias || 'Київ';
            const parsePresetParam = (val) => {
                if (!val) return null;
                const parsed = parseFloat(String(val).replace(',', '.'));
                return isNaN(parsed) ? null : parsed;
            };
            const globalStartPoint = presets?.defaultStartLat && presets?.defaultStartLng ?
                { lat: parsePresetParam(presets.defaultStartLat), lng: parsePresetParam(presets.defaultStartLng) } : null;
            const globalEndPoint = presets?.defaultEndLat && presets?.defaultEndLng ?
                { lat: parsePresetParam(presets.defaultEndLat), lng: parsePresetParam(presets.defaultEndLng) } : null;

            // Ensure ordersToGroup contains ALL valid orders

            // v5.190: Group ALL valid orders instead of just newOrders, to preserve proper time windows
            // v5.195: CRITICAL - Filter out cancelled and self-pickup orders totally UPFRONT
            const ordersToGroup = data.orders.filter(o => {
                const c = String(o.courier || o.courierName || o.courierId || '').toUpperCase().trim();
                const s = String(o.status || o.deliveryStatus || '').toLowerCase().trim();
                
                if (!c || c === 'НЕ НАЗНАЧЕНО' || c === 'UNASSIGNED' || c === 'ПО' || c === 'ID:0') return false;
                
                // Do not route cancelled or self-pickup orders
                if (s.includes('отказ') || s.includes('отменен') || s.includes('відмова')) return false;
                if (s.includes('самовывоз') || s.includes('на месте')) return false;
                
                return true;
            });

            // v7.6 CRITICAL: Frontload Manual Corrections from GeoCache
            // This ensures manual fixes are respected BEFORE FO GPS or other sources
            const GeoCache = this.getModel('GeoCache');
            if (GeoCache) {
                try {
                    const addressesToLookup = data.orders.map(o => {
                        const addr = o.address || o.addressGeo || '';
                        return addr ? deepCleanAddress(addr).toLowerCase().trim() : null;
                    }).filter(Boolean);
                    
                    if (addressesToLookup.length > 0) {
                        const uniqueKeys = Array.from(new Set(addressesToLookup));
                        const cachedCoords = await GeoCache.findAll({
                            where: { address_key: { [Op.in]: uniqueKeys }, is_success: true }
                        });
                        
                        const coordMap = new Map();
                        cachedCoords.forEach(c => coordMap.set(c.address_key, c));
                        
                        data.orders.forEach(o => {
                            const addr = o.address || o.addressGeo || '';
                            if (!addr) return;
                            const key = deepCleanAddress(addr).toLowerCase().trim();
                            const hit = coordMap.get(key);
                            if (hit) {
                                // v7.6: If it's a manual or high-quality geocoded entry, pre-set it
                                // so resolveOrderCoords sees it as 'Already geocoded' (P3)
                                o.coords = { 
                                    lat: hit.lat, 
                                    lng: hit.lng, 
                                    provider: hit.provider,
                                    locationType: hit.location_type || 'CACHED'
                                };
                            }
                        });
                        logger.info(`[TurboCalculator] 🧠 Pre-loaded ${cachedCoords.length} coordinates from GeoCache (including manual fixes)`);
                    }
                } catch (cacheErr) {
                    logger.warn(`[TurboCalculator] ⚠️ Failed pre-loading GeoCache: ${cacheErr.message}`);
                }
            }

            // v7.1 SOTA: Smart Coordinate Resolver & Validator
            const kmlIndex = { findBestZoneForPoint: (lat, lng) => this.findBestZoneForPoint(lat, lng) };
            if (!this.zoneCentroids) this.zoneCentroids = buildZoneCentroids(this.allKmlZones || allKmlZones);
            
            const { enhanced, fromGPS, fromGeocoder, lowConfidence } = enhanceAllOrderCoords(data.orders, kmlIndex, this.zoneCentroids);
            logger.info(`[TurboCalculator] 📍 Coord resolver: validated ${enhanced} orders (${fromGPS} GPS, ${fromGeocoder} DB, ${lowConfidence} low-conf)`);

            // v7.8: Immediate emission after geocoding to update map and initial counters
            if (this.io && enhanced > 0) {
                this.io.emit('dashboard:update', {
                    divisionId: cache.division_id,
                    date: targetDateNorm || cache.target_date,
                    source: 'turbo_calculator_geocoding',
                    data: { ...data, orders: data.orders }
                });
            }

            // v5.197: Standardize stats for real-time UI tracking
            const totalCount = data.orders.length;
            const ordersWithRealCourier = ordersToGroup.length;
            const alreadyRouted = existingRoutedOrderNumbers.size;

            // v7.2: Start with orders already in routes to prevent "jump back to 0"
            // If geocoding just finished, we might already have high progress in the UI.
            // We should pick the LARGEST of (alreadyRouted, current processedCount).
            const initialProcessed = Math.max(alreadyRouted, Math.round(cacheTotalCount * 0.35));

            const stats = {
                isActive: true,
                lastUpdate: Date.now(),
                totalCount: totalCount,
                unassignedCount: Math.max(0, totalCount - ordersWithRealCourier - alreadyRouted),
                processedCount: initialProcessed, 
                totalCouriers: 0, // Will be set after grouping
                processedCouriers: 0,
                skippedGeocoding: 0,
                geoErrors: [], // v6.9: Track failed addresses with order numbers
                skippedInRoutes: alreadyRouted,
                skippedNoCourier: totalCount - ordersWithRealCourier - alreadyRouted,
                message: `Analyzing delivery queues...`,
                currentPhase: 'processing',
                courierStats: {}
            };

            // v7.1 SOTA: ENHANCED GEOCODING — 6-level cascaded engine with Ukrainian specialization
            // NOTE: GeoCache already declared above at line ~1314 — reuse it here
            
            // v7.5: Geocode ALL orders (assigned and unassigned) so they have coordinates immediately
            let allOrdersNeedsGeo = data.orders.filter(o => {
                const s = String(o.status || o.deliveryStatus || '').toLowerCase().trim();
                if (s.includes('отказ') || s.includes('отменен') || s.includes('відмова')) return false;
                if (s.includes('самовывоз') || s.includes('на месте')) return false;
                return !o.coords?.lat;
            });
            
            if (targetCourier) {
                const normTarget = normalizeCourierName(targetCourier);
                allOrdersNeedsGeo = allOrdersNeedsGeo.filter(o => normalizeCourierName(o.courier) === normTarget);
                logger.info(`[TurboCalculator] 🎯 targetCourier override: Only geocoding ${allOrdersNeedsGeo.length} unassigned coordinates for ${targetCourier}`);
            }

            if (allOrdersNeedsGeo.length > 0) {
                const totalToGeo = allOrdersNeedsGeo.length;
                const startTime = Date.now();

                logger.info(`[TurboCalculator] 🌍 Enhanced geocoding: ${totalToGeo} addresses (6-level SOTA engine)...`);

                if (this.io) {
                    this.io.emit('robot_status', {
                        divisionId: cache.division_id,
                        date: cache.target_date,
                        isActive: true,
                        totalCount: totalCount,
                        processedCount: Math.round(totalCount * 0.05),
                        currentPhase: 'geocoding',
                        message: `Геокодирование: ${totalToGeo} адресов...`
                    });
                }

                await batchEnhancedGeocode(allOrdersNeedsGeo, cityBias, allKmlZones, {
                    photonUrl: process.env.PHOTON_URL || this.osrmUrl?.replace(':5050', ':2322') || 'http://localhost:2322',
                    geoCacheDb: GeoCache,
                    gcacheLRU: this.geocache,
                    onProgress: (done, total, pass) => {
                        const pct = Math.round((done / total) * 100);
                        const elapsed = (Date.now() - startTime) / 1000;
                        const eta = done > 0 ? Math.ceil((elapsed / done) * (total - done)) : 0;

                        if (this.io) {
                            this.io.emit('robot_status', {
                                divisionId: cache.division_id,
                                date: cache.target_date,
                                isActive: true,
                                totalCount: totalCount,
                                processedCount: Math.round((done / total) * totalCount * 0.40),
                                currentPhase: 'geocoding',
                                message: `Геокодирование ${pass === 'pass2' ? '(точный поиск) ' : ''}${pct}% (${done}/${total})${eta > 0 ? ` ~${eta}с` : ''}`
                            });
                        }
                    }
                });

                // Collect remaining geo errors for stats
                allOrdersNeedsGeo.forEach(o => {
                    if (!o.coords?.lat) {
                        stats.geoErrors.push({
                            orderNumber: o.orderNumber || o.id || 'unknown',
                            address: o.address || o.addressGeo || 'no address',
                            courier: o.courier || o.courierName || ''
                        });
                        stats.skippedGeocoding++;
                    }
                });

                const succeeded = allOrdersNeedsGeo.filter(o => o.coords?.lat).length;
                logger.info(`[TurboCalculator] ✅ Geocoding complete: ${succeeded}/${totalToGeo} success, ${stats.geoErrors.length} errors (${(Date.now() - startTime) / 1000}s)`);
            }


            // v28.8: Grouping happens AFTER geocoding so geographic splitting works!
            let deliveryWindows = new Map();
            let totalBlocksCount = 0;
            try {
                deliveryWindows = groupAllOrdersByTimeWindow(ordersToGroup);
                deliveryWindows.forEach((windows) => { totalBlocksCount += windows.length; });
                stats.totalCouriers = deliveryWindows.size; // Update stats
                logger.info(`[TurboCalculator] 📦 Grouped ${ordersToGroup.length} orders into ${totalBlocksCount} blocks across ${deliveryWindows.size} couriers`);
                
                // v6.0: Emit status immediately after grouping completes
                if (this.io) {
                    this.io.emit('robot_status', {
                        divisionId: cache.division_id,
                        date: cache.target_date,
                        isActive: true,
                        totalCount: totalCount,
                        processedCount: Math.max(stats.processedCount, Math.round(totalCount * 0.35)),
                        currentPhase: 'grouping',
                        message: `Grouped ${ordersToGroup.length} orders into ${totalBlocksCount} blocks...`
                    });
                }
            } catch (err) {
                logger.error('[TurboCalculator] Backend grouping failed', err);
                deliveryWindows = new Map();
            }

            const emitStatus = (force = false) => {
                if (!this.io) return;
                
                const now = Date.now();
                // Throttle: don't emit more than once per 500ms unless forced
                if (!force && this.lastEmitTime && (now - this.lastEmitTime < 500)) return;
                this.lastEmitTime = now;

                const couriersList = Object.values(stats.courierStats || {});
                const payload = {
                    divisionId: String(cache.division_id),
                    date: cache.target_date,
                    totalCount: stats.totalCount,
                    totalCouriers: stats.totalCouriers,
                    processedCount: stats.processedCount,
                    processedCouriers: stats.processedCouriers,
                    currentPhase: stats.currentPhase,
                    message: stats.message,
                    isActive: stats.isActive,
                    couriers: couriersList,
                    currentCourier: stats.currentCourier || null,
                    skippedGeocoding: stats.skippedGeocoding || 0,
                    geoErrors: stats.geoErrors || [], 
                    skippedInRoutes: stats.skippedInRoutes || 0,
                    skippedNoCourier: stats.skippedNoCourier || stats.unassignedCount || 0,
                    lastUpdate: now
                };
                
                this.divisionStates.set(String(cache.division_id), payload);
                this.io.emit('robot_status', payload);
                this.io.emit('division_status_update', payload);

                // Global aggregation
                if (this.globalStats) {
                    try {
                        const dateISO = cache.target_date;
                        let totalProcessed = 0;
                        let totalInRoutes = 0;
                        let totalErrors = 0;

                        for (const [key, state] of this.divisionStates.entries()) {
                            if (state.date === dateISO) {
                                totalProcessed += (state.processedCount || 0);
                                totalInRoutes += (state.skippedInRoutes || 0);
                                totalErrors += (state.skippedGeocoding || 0);
                            }
                        }

                        const globalPayload = {
                            ...this.globalStats,
                            processedCount: totalProcessed,
                            skippedInRoutes: totalInRoutes,
                            skippedGeocoding: totalErrors,
                            message: `Processing branch ${cache.division_id}: ${stats.message}`
                        };
                        this.io.emit('robot_status', globalPayload);
                    } catch (e) {
                         // silently ignore
                    }
                }
                
                if (global.divisionStatusStore) {
                    global.divisionStatusStore[`${payload.divisionId}_${payload.date}`] = payload;
                }
            };

            // v5.145: Routes are now deleted ONCE in processDay, not here

            // v31.2: Instant UI updates! Extract route emit logic into a helper
            const emitCurrentRoutes = async () => {
                if (this.io) {
                    const allWindowLabels = Array.from(new Set(
                        Array.from(deliveryWindows.values()).flat().map(w => w.windowLabel)
                    ));

                    const enrichedCouriers = Object.values(stats.courierStats || {}).map((cs) => {
                        const rawName = cs.name || '';
                        const normName = normalizeCourierName(rawName);
                        return {
                            name: normName,
                            courierName: normName,
                            distanceKm: Number((cs.distanceKm || 0).toFixed(2)),
                            calculatedOrders: cs.orders || 0,
                        };
                    }).filter(c => {
                        const norm = (c.name || '').toUpperCase().trim();
                        if (norm === 'НЕ НАЗНАЧЕНО' || norm === 'UNASSIGNED' || norm === 'ПО') return false;
                        return c.distanceKm > 0 || c.calculatedOrders > 0;
                    });

                    this.io.emit('routes_update', {
                        divisionId: cache.division_id,
                        date: cache.target_date,
                        couriers: enrichedCouriers,
                        timeBlocks: allWindowLabels,
                        routes: inMemoryFrontendRoutes
                    });
                }
            };
            
            const matchedExistingRouteIds = new Set();
            let finalRoutesToKeep = [];


            // Process each courier and their time windows
            for (const [courierName, windows] of deliveryWindows.entries()) {
                const normName = courierName;
                if (!windows || windows.length === 0) continue;

                // v36.5: Refresh current courier and progress
                stats.currentCourier = normName;
                stats.message = `Processing: ${normName}...`;
                emitStatus(true); 

                // Ensure stat entry
                if (!stats.courierStats[normName]) {
                    const totalOrdersInWindows = windows.reduce((acc, w) => acc + w.orders.length, 0);
                    stats.courierStats[normName] = {
                        name: normName,
                        orders: totalOrdersInWindows,
                        distanceKm: 0,
                        calculatedOrders: 0,
                        type: 'Car'
                    };
                }

                logger.info(`[TurboCalculator] 🚚 Processing courier ${normName}: ${windows.length} time windows`);
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

                    // v5.195: INCREMENTAL ROUTING LOGIC - Keep block if existing calculation exists
                    // v37.1: Bypass cache if forceFull is true OR this is the target courier
                    const blockSignature = getBlockSignature(dedupedOrders);
                    const isTarget = targetCourier && (normalizeCourierName(normName) === normalizeCourierName(targetCourier));
                    
                    if (existingRouteMap.has(blockSignature) && !forceFull && !isTarget) {
                        const existingR = existingRouteMap.get(blockSignature);
                        matchedExistingRouteIds.add(existingR.id);
                        
                        // v36.5: Aggressive addition to stats for immediate feedback
                        if (stats.courierStats[normName]) {
                            stats.courierStats[normName].distanceKm += parseFloat(existingR.total_distance || 0);
                            stats.courierStats[normName].calculatedOrders += existingR.orders_count;
                        }
                        stats.processedCount += dedupedOrders.length;
                        stats.message = `Skipping ${normName} (${windowKey}) — already calculated`;
                        emitStatus(); 
                        inMemoryFrontendRoutes.push({
                            id: existingR.id,
                            courier: existingR.courier_id,
                            courier_id: existingR.courier_id,
                            totalDistance: parseFloat(existingR.total_distance || 0),
                            totalDuration: existingR.total_duration,
                            ordersCount: existingR.orders_count,
                            timeBlock: existingR.route_data?.deliveryWindow || existingR.route_data?.timeBlocks,
                            startAddress: existingR.route_data?.startAddress,
                            endAddress: existingR.route_data?.endAddress,
                            isOptimized: true, // v37.3: Critical for CourierManagement filtering
                            isTurboRoute: true,
                            orders: (existingR.route_data?.orders || []).map(o => ({
                                id: o.id,
                                orderNumber: o.orderNumber,
                                address: o.address || 'Адрес не указан',
                                courier: normalizeCourierName(o.courier || existingR.courier_id),
                                coords: o.coords || (o.lat && o.lng ? { lat: o.lat, lng: o.lng } : null),
                                lat: o.lat || o.coords?.lat,
                                lng: o.lng || o.coords?.lng,
                                plannedTime: o.plannedTime || o.deliveryTime || o.deliverBy,
                                status: o.status,
                                statusTimings: o.statusTimings,
                                kmlZone: o.kmlZone || o.deliveryZone,
                                kmlHub: o.kmlHub,
                                deliveryZone: o.deliveryZone,
                                locationType: o.locationType,
                                streetNumberMatched: o.streetNumberMatched,
                                manualGroupId: o.manualGroupId,
                                handoverAt: o.handoverAt,
                                executionTime: o.executionTime,
                            }))
                        });
                        
                        logger.info(`[TurboCalculator] ⏩ Skipped geocode & routing: exact block match found (${windowKey})`);
                        continue; // Skip the rest of the loop! No geocoding, no OSRM hit
                    }

                    // v7.2: No more inner geocoding loop. Everything is geocoded upfront by batchEnhancedGeocode.
                    // We simply increment the processedCount for this block and proceed to routing.
                    stats.processedCount += dedupedOrders.length;
                    emitStatus();

                    try {
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
                        // v7.0: Also include implicit circular start/end (when no depot configured)
                        if (routeResult && validOrders.length >= 4) {
                            try {
                                const routePoints = validOrders
                                    .filter(o => o.coords?.lat && o.coords?.lng)
                                    .map((o, idx) => ({ lat: o.coords.lat, lng: o.coords.lng, origIndex: idx }));

                                if (globalStartPoint) {
                                    routePoints.unshift({ lat: Number(globalStartPoint.lat), lng: Number(globalStartPoint.lng) });
                                } else if (!globalEndPoint && routePoints.length > 1) {
                                    routePoints.unshift({ lat: routePoints[0].lat, lng: routePoints[0].lng });
                                }

                                if (globalEndPoint) {
                                    routePoints.push({ lat: Number(globalEndPoint.lat), lng: Number(globalEndPoint.lng) });
                                } else if (!globalStartPoint && routePoints.length > 2) {
                                    routePoints.push({ lat: routePoints[1].lat, lng: routePoints[1].lng }); 
                                }

                                const optimized = this.optimizeRoute2Opt(routePoints, 50);
                                if (optimized.improved && optimized.savingsPct > 1) {
                                    // v7.1: REORDER validOrders based on optimized indices
                                    // optimized.points contains { lat, lng, index }
                                    // Indices 0..N match routePoints, which matches validOrders (offset by Start if present)
                                    const offset = globalStartPoint ? 1 : 0;
                                    const newOrders = [];
                                    
                                    // Extract orders from optimized points (skipping Start/End points)
                                    optimized.points.forEach(p => {
                                        if (p.origIndex !== undefined) {
                                            // The point was an order
                                            newOrders.push(validOrders[p.origIndex]);
                                        }
                                    });

                                    if (newOrders.length === validOrders.length) {
                                        const optimizedResult = await this.calculateRoute(
                                            newOrders,
                                            cache.division_id,
                                            globalStartPoint,
                                            globalEndPoint
                                        );
                                        if (optimizedResult && optimizedResult.distance < routeResult.distance) {
                                            logger.info(`[TurboCalculator] ✅ 2-opt improved route: ${(routeResult.distance / 1000).toFixed(2)}km -> ${(optimizedResult.distance / 1000).toFixed(2)}km`);
                                            routeResult = optimizedResult;
                                            validOrders = newOrders; // Update orders for storage
                                        }
                                    }
                                }
                            } catch (optErr) {
                                logger.warn(`[TurboCalculator] ⚠️ 2-opt optimization failed: ${optErr.message}`);
                            }
                        }

                        if (routeResult) {
                            const timeBlockLabel = timeGroup.windowLabel;
                            const distanceKm = Math.round((routeResult.distance / 1000) * 100) / 100;

                            // v6.11: STRICT SANITY CHECK — tightened thresholds
                            // Single-order route > 30km is almost certainly a geocoding error
                            // Multi-order route > 50km is very suspicious for urban delivery
                            const maxAllowedKm = validOrders.length === 1 ? 30 : 50;
                            if (distanceKm > maxAllowedKm) {
                                logger.error(`[TurboCalculator] ❌ REJECTED ROUTE: ${normName} [${timeBlockLabel}] ${distanceKm}km for ${validOrders.length} order(s) (limit: ${maxAllowedKm}km). Likely geocoding error — invalidating cache.`);
                                // Invalidate geocache entries for orders in this block so they get re-geocoded next run
                                validOrders.forEach(o => {
                                    const addrKey = (o.address || o.addressGeo || '').toLowerCase().trim();
                                    if (addrKey) {
                                        this.geocache.delete(addrKey);
                                        logger.warn(`[TurboCalculator] 🗑️ Evicted bad geocache entry: "${addrKey}"`);
                                        // Also try to delete from DB cache
                                        const GeoCache2 = this.getModel('GeoCache');
                                        if (GeoCache2) GeoCache2.destroy({ where: { address_key: addrKey } }).catch(() => {});
                                    }
                                });
                                continue;
                            }

                            // v6.11: Extra guard — if only 1 order and start point defined, check distance to start
                            if (validOrders.length === 1 && globalStartPoint) {
                                const o1 = validOrders[0];
                                if (o1.coords?.lat && o1.coords?.lng) {
                                    // v37.3: Fix method call + unit (haversineDistance returns KM)
                                    const distToStart = haversineDistance(
                                        globalStartPoint.lat, globalStartPoint.lng,
                                        o1.coords.lat, o1.coords.lng
                                    );
                                    if (distToStart > 25) {
                                        logger.error(`[TurboCalculator] ❌ REJECTED: Order ${o1.orderNumber} is ${distToStart.toFixed(1)}km from hub — coordinates are wrong. Invalidating.`);
                                        const addrKey = (o1.address || o1.addressGeo || '').toLowerCase().trim();
                                        if (addrKey) {
                                            this.geocache.delete(addrKey);
                                            const GeoCache2 = this.getModel('GeoCache');
                                            if (GeoCache2) GeoCache2.destroy({ where: { address_key: addrKey } }).catch(() => {});
                                        }
                                        continue;
                                    }
                                }
                            }

                            // v5.149+: Stable deduplication by ID (to support split orders)
                            const seenIds = new Set();
                            const uniqueRouteOrders = [];

                            const nonCancelledOrders = dedupedOrders.filter(o => {
                                const s = String(o.status || o.deliveryStatus || '').toLowerCase().trim();
                                return !(s.includes('отказ') || s.includes('отменен') || s.includes('відмова'));
                            });

                            nonCancelledOrders.forEach(o => {
                                const orderId = String(o.id || o._id || o.orderNumber || '');
                                if (!orderId) {
                                    uniqueRouteOrders.push({
                                        id: o.id,
                                        orderNumber: o.orderNumber,
                                        address: o.address || o.addressGeo || o.fullAddress || o.full_address || o.raw?.address || o.raw?.fullAddress || 'Адрес не указан',
                                        coords: o.coords,
                                        lat: o.coords?.lat || o.lat,
                                        lng: o.coords?.lng || o.lng,
                                        deliveryTime: o.deliverBy || o.plannedTime || o.deliveryTime,
                                        locationType: o.locationType || o.coords?.locationType,
                                        streetNumberMatched: o.streetNumberMatched || o.coords?.streetNumberMatched,
                                        isAddressLocked: o.isAddressLocked || !!o.coords?.lat,
                                        kmlZone: o.kmlZone || o.deliveryZone,
                                        kmlHub: o.kmlHub,
                                        plannedTime: o.plannedTime || o.deliverBy,
                                        deliveryZone: o.deliveryZone,
                                        status: o.status || null,
                                        executionTime: getExecutionTime(o) || null,
                                        handoverAt: o.handoverAt || null,
                                        manualGroupId: o.manualGroupId,
                                        readyAtPreview: o.readyAtPreview || o.kitchen || o.readyAtSource,
                                        statusTimings: o.statusTimings || null,
                                    });
                                    return;
                                }

                                if (seenIds.has(orderId)) {
                                    logger.warn(`[TurboCalculator] ⚠️ Skipping duplicate ID: ${orderId}`);
                                    return;
                                }

                                seenIds.add(orderId);

                                uniqueRouteOrders.push({
                                    id: o.id,
                                    orderNumber: o.orderNumber,
                                    address: o.address || o.addressGeo || o.fullAddress || o.full_address || o.raw?.address || o.raw?.fullAddress || 'Адрес не указан',
                                    coords: o.coords,
                                    lat: o.coords?.lat || o.lat,
                                    lng: o.coords?.lng || o.lng,
                                    deliveryTime: o.deliverBy || o.plannedTime || o.deliveryTime,
                                    locationType: o.locationType || o.coords?.locationType,
                                    streetNumberMatched: o.streetNumberMatched || o.coords?.streetNumberMatched,
                                    isAddressLocked: o.isAddressLocked || !!o.coords?.lat,
                                    kmlZone: o.kmlZone || o.deliveryZone,
                                    kmlHub: o.kmlHub,
                                    plannedTime: o.plannedTime || o.deliverBy,
                                    deliveryZone: o.deliveryZone,
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
                                    startCoords: globalStartPoint,
                                    endCoords: globalEndPoint || globalStartPoint, // Circular fallback
                                    isCircularRoute: !globalStartPoint && !globalEndPoint && uniqueRouteOrders.length > 0, 
                                    geoMeta: { 
                                        origin: globalStartPoint,
                                        destination: globalEndPoint || globalStartPoint,
                                        waypoints: uniqueRouteOrders.map(o => o.coords).filter(Boolean)
                                    },
                                    orders: uniqueRouteOrders,
                                    geometry: routeResult.geometry
                                }
                            });

                            // v33: Push into memory cache immediately!
                            // v5.180: FRONTEND COMPATIBILITY — match frontend order structure EXACTLY
                            matchedExistingRouteIds.add(createdRoute.id);
                            inMemoryFrontendRoutes.push({
                                id: createdRoute.id,
                                courier: createdRoute.courier_id,
                                courier_id: createdRoute.courier_id,
                                totalDistance: parseFloat(createdRoute.total_distance || 0),
                                totalDuration: createdRoute.total_duration,
                                ordersCount: createdRoute.orders_count,
                                timeBlock: createdRoute.route_data?.deliveryWindow || createdRoute.route_data?.timeBlocks,
                                startAddress: createdRoute.route_data?.startAddress,
                                endAddress: createdRoute.route_data?.endAddress,
                                orders: (createdRoute.route_data?.orders || []).map(o => ({
                                    id: o.id,
                                    orderNumber: o.orderNumber,
                                    address: o.address || 'Адрес не указан',
                                    courier: normalizeCourierName(o.courier || createdRoute.courier_id),
                                    coords: o.coords || (o.lat && o.lng ? { lat: o.lat, lng: o.lng } : null),
                                    lat: o.lat || o.coords?.lat,
                                    lng: o.lng || o.coords?.lng,
                                    plannedTime: o.plannedTime || o.deliveryTime || o.deliverBy,
                                    status: o.status,
                                    statusTimings: o.statusTimings,
                                    kmlZone: o.kmlZone || o.deliveryZone,
                                    kmlHub: o.kmlHub,
                                    deliveryZone: o.deliveryZone,
                                    locationType: o.locationType,
                                    streetNumberMatched: o.streetNumberMatched,
                                    manualGroupId: o.manualGroupId,
                                    handoverAt: o.handoverAt,
                                    executionTime: o.executionTime,
                                })),
                                isCalculated: true // v5.175: Force UI to treat this as solid data
                            });

                            courierRoutesCreated++;
                            totalRoutesCreated++;
                            stats.skippedInRoutes += uniqueRouteOrders.length; // v5.170: Track in-route count for real-time stats
                            logger.info(`[TurboCalculator] ✅ Created route for ${normName}: ${uniqueRouteOrders.length} orders, ${(routeResult.distance / 1000).toFixed(2)}km`);

                            // v6.7: Restore distance accumulation + emit stats!
                            if (stats.courierStats[normName]) {
                                stats.courierStats[normName].distanceKm += (routeResult.distance || 0) / 1000;
                            }
                            emitStatus();
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
                    
                    // v33.2: EMIT ROUTES PARTIALLY AFTER EACH COURIER
                    // This fixed the "didn't pick up routes" feel, as user can see them appearing cow-by-cow!
                    await emitCurrentRoutes(); 
                }
            } // End of courier loop

            // Update processedCount to match total processed orders
            // v5.180: processedCount should reflect: already-routed + newly-routed + unassigned
            stats.processedCount = stats.totalCount;
            stats.currentPhase = 'complete';
            stats.message = 'Calculation complete!';
            emitStatus(true); // v36.5: FORCE final status to clear throttles

            // v5.195: Clean up obsolete routes that didn't match any of the calculated valid block signatures
            if (matchedExistingRouteIds.size > 0 && Route && cache.division_id) {
                try {
                    const deletedCount = await Route.destroy({
                        where: {
                            division_id: cache.division_id,
                            id: { [Op.notIn]: Array.from(matchedExistingRouteIds) },
                            [Op.and]: sequelize.where(
                                sequelize.literal("route_data->>'target_date'"),
                                targetDateNorm || cache.target_date
                            )
                        }
                    });
                    if (deletedCount > 0) {
                        logger.info(`[TurboCalculator] 🗑️ Cleaned up ${deletedCount} obsolete incremental routes`);
                    }
                } catch (cleanErr) {
                    logger.warn(`[TurboCalculator] ⚠️ Failed cleaning up obsolete routes: ${cleanErr.message}`);
                }
            } else if (matchedExistingRouteIds.size === 0 && Route && cache.division_id) {
                // If NO routes were matched (all empty), destroy ALL routes for the day + division
                try {
                    await Route.destroy({
                        where: {
                            division_id: cache.division_id,
                            [Op.and]: sequelize.where(
                                sequelize.literal("route_data->>'target_date'"),
                                targetDateNorm || cache.target_date
                            )
                        }
                    });
                } catch (e) {}
            }

            // v5.171: Fetch ALL routes (existing + newly created) for frontend
            // Final comprehensive emit across all couriers just in case
            await emitCurrentRoutes();


            // v29.0: Cache Enrichment - write calculated distances back to api_dashboard_cache
            // Match courier names by both normalized (uppercase) and raw for maximum coverage
            if (data && Array.isArray(data.orders)) {
                try {
                    if (data.couriers && Array.isArray(data.couriers)) {
                        // v34.2: Stripping 'НЕ НАЗНАЧЕНО' and 'ПО' from the final DATA object sent to frontend
                        // v5.180: Normalize courier names to match frontend grouping EXACTLY
                        data.couriers = data.couriers.map(c => {
                            const rawName = c.courierName || c.name || c.courier;
                            const norm = normalizeCourierName(rawName);
                            return {
                                ...c,
                                courierName: norm, // v5.180: Normalized name matching frontend
                                name: norm,
                                courier: norm,
                            };
                        }).filter(c => {
                            const norm = (c.courierName || '').toUpperCase().trim();
                            return norm !== 'НЕ НАЗНАЧЕНО' && norm !== 'UNASSIGNED' && norm !== 'ПО' && norm !== '';
                        });

                        // v35.2: Weekly Analytics - Calculate Active Days & Normalized Efficiency
                        const DashboardCache = this.getModel('DashboardCache');
                        // v5.185: Use null prototype to avoid collisions with toString, etc.
                        let weeklyActivity = Object.create(null); 

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
            stats.processedCount = totalCount; // Ensure reached 100% for UI
            const totalResultCount = inMemoryFrontendRoutes.length;
            const existingCount = matchedExistingRouteIds.size;
            const newlyCreated = totalRoutesCreated;
            stats.message = `Complete! ${totalResultCount} routes (${newlyCreated > 0 ? `${newlyCreated} new, ` : ''}${existingCount} cached)`;
            stats.isActive = false;
            emitStatus(true);
            logger.info(`[TurboCalculator] ✅ DONE: ${totalResultCount} total routes (${newlyCreated} new + ${existingCount} cached), ${stats.processedCouriers} couriers`);

            // v6.11: Record completion timestamp for cooldown logic
            this.lastCalculatedAt.set(String(cache.division_id), Date.now());
            logger.info(`[TurboCalculator] ⏱️ Division ${cache.division_id} cooldown started — next recalc in 3 minutes (or when new FO data arrives)`);

        } catch (err) {
            logger.error(`[OrderCalculator] ❌ processCache fatal: ${err.message}`);
        }
    }


    async getRobustGeocode(address, city = 'Київ', expectedZoneName = null, allZones = [], deepRecovery = false) {
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

        // v36.7: Google is strictly forbidden per user request. Use OSM-based providers only.
        const primaryProviders = ['photon', 'komoot', 'nominatim'];

        // v5.180: Retry wrapper with exponential backoff
        const tryGeocodeWithRetry = async (query, provider, timeout) => {
            return pRetry(() => tryGeocode(query, provider, timeout), {
                retries: 2,
                minTimeout: 1000,
                maxTimeout: 3000,
                factor: 2,
                onFailedAttempt: error => {
                    // logger.warn(`[TurboCalculator] 🔄 ${provider} attempt ${error.attemptNumber} failed: ${error.message}`);
                }
            });
        };

        // v5.186: NEW BROAD-SPECTRUM GEOCODING v2.0
        // Instead of one query, we try the prioritized variants from our addressUtils
        const apiVariants = generateVariants(address, city, 5); 
        
        // v6.13: Multi-stage logic: if deepRecovery is false, try ONLY the first (cleanest) variant.
        // This stops massive API floods for fresh divisions.
        const variantsToTry = deepRecovery ? apiVariants : [apiVariants[0]];
        logger.info(`[TurboCalculator] 🧭 Geocoding "${address}" with ${variantsToTry.length} variants (deep: ${deepRecovery})...`);

        for (let i = 0; i < variantsToTry.length; i++) {
            const query = variantsToTry[i];
            try {
                // Try current variant against all providers in parallel
                const result = await Promise.any(
                    primaryProviders.map(p => tryGeocodeWithRetry(query, p, 5000))
                );
                
                if (result) {
                    logger.info(`[TurboCalculator]   ✅ Success for variant "${query}" via ${result.provider}`);
                    await cacheResult(result, result.provider);
                    this.geocache.set(normalized, { latitude: result.latitude, longitude: result.longitude });
                    return result;
                }
            } catch (err) {
                // This variant failed on all providers, try next one
            }
        }

        // v6.12: LEGACY FALLBACK STRATEGIES (if all primary variants failed)
        // Only run these if deepRecovery is active
        if (deepRecovery) {
            const fallbackStrategies = [];

            // Strategy 1: Remove house number (if not already tried by generateVariants)
            const noHouse = cleaned.replace(/\b\d+[а-яА-Яa-zA-ZіІєЄґґ]*(?:[\/\-]\d*)?\b/g, '').trim();
            if (noHouse && !variantsToTry.includes(noHouse + ', ' + city)) {
                fallbackStrategies.push({ query: noHouse + ', ' + city, strategy: 'no-house' });
            }

            // Strategy 2: Deep simplified (everything before commas/common comments)
            const splitByComma = cleaned.split(',')[0].trim();
            if (splitByComma && splitByComma.length > 5 && !variantsToTry.includes(splitByComma + ', ' + city)) {
                 fallbackStrategies.push({ query: splitByComma + ', ' + city, strategy: 'before-comma' });
            }

            for (const fb of fallbackStrategies) {
                try {
                    const result = await Promise.any(
                        primaryProviders.map(p => tryGeocode(fb.query, p, 4000))
                    );
                    logger.info(`[TurboCalculator]   ✅ Fallback success (${fb.strategy}) via ${result.provider}`);
                    await cacheResult(result, result.provider);
                    return result;
                } catch (e) { }
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

        // v7.0: CIRCULAR ROUTE FIX — When no depot (start/end) is configured but there are
        // multiple stops, use the first order address as an IMPLICIT start/end to form a
        // circular route: first_stop → all_stops → first_stop.
        // This is the industry-standard logistics approach when no depot is defined and gives
        // a much more realistic total distance than simply measuring A→B between stops.
        // v7.2: Depot consistency — If only one depot point is provided, use it for both start and end
        // to ensure a circular route from base is calculated whenever a single hub coordinate is set.
        const hasDepot = !!(startPoint || endPoint);
        let effectiveStart = startPoint;
        let effectiveEnd = endPoint;

        if (startPoint && !endPoint) effectiveEnd = startPoint;
        if (!startPoint && endPoint) effectiveStart = endPoint;

        if (!hasDepot && orders.length > 1) {
            const firstWithCoords = orders.find(o =>
                (o.coords?.lat && o.coords?.lng) || (o.lat && o.lng)
            );
            if (firstWithCoords) {
                const implLat = Number(firstWithCoords.coords?.lat || firstWithCoords.lat);
                const implLng = Number(firstWithCoords.coords?.lng || firstWithCoords.lng);
                effectiveStart = { lat: implLat, lng: implLng, isImplicit: true };
                effectiveEnd   = { lat: implLat, lng: implLng, isImplicit: true };
                logger.info(`[TurboCalculator] 🔄 No depot — circular route via first stop (${implLat.toFixed(5)}, ${implLng.toFixed(5)})`);
            }
        }

        // Add start point if provided (real depot OR implicit)
        if (effectiveStart) {
            points.push({ lat: Number(effectiveStart.lat), lng: Number(effectiveStart.lng), type: effectiveStart.isImplicit ? 'implicit-start' : 'start' });
        }

        // Add order addresses - v28.7: Deduplicate consecutive same-coordinates to optimize OSRM
        let lastCoordKey = effectiveStart ? `${Number(effectiveStart.lat).toFixed(5)},${Number(effectiveStart.lng).toFixed(5)}` : null;

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

        // Add end point if provided (real depot OR implicit) and not same as last point
        if (effectiveEnd) {
            const lat = Number(effectiveEnd.lat);
            const lng = Number(effectiveEnd.lng);
            const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
            if (key !== lastCoordKey) {
                points.push({ lat, lng, type: effectiveEnd.isImplicit ? 'implicit-end' : 'end' });
            }
        }

        // Need at least 2 points for a route
        if (points.length < 2) {
            return {
                distance: 0,
                duration: 0,
                geometry: '',
                feasible: true,
                engine: 'implicit'
            };
        }

        const coordsStr = points.map(p => `${p.lng.toFixed(7)},${p.lat.toFixed(7)}`).join(';');
        const routeModeStr = (effectiveStart?.isImplicit || effectiveEnd?.isImplicit) ? '🔄 circular/no-depot' : '📍 depot';
        logger.info(`[TurboCalculator] 🛣️ [${routeModeStr}] Route: ${points.length} pts, orders: ${orders.length}, path: ${coordsStr.slice(0, 60)}...`);

        // Only warn about huge base-to-base if using REAL (non-implicit) depot points
        if (effectiveStart && effectiveEnd && !effectiveStart.isImplicit && !effectiveEnd.isImplicit) {
            const distHaversine = haversineKm(effectiveStart.lat, effectiveStart.lng, effectiveEnd.lat, effectiveEnd.lng);
            if (distHaversine > 100) { // Check > 100km
                logger.warn(`[TurboCalculator] ⚠️ Base-to-Base distance is huge (${distHaversine.toFixed(1)}km). Check settings!`);
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
