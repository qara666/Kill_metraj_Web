// v22.0: Оптимизировано для Sequelize Model Registry. Больше никакой циклической зависимости require!
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
    getStableOrderId,
    haversineDistance
} = require('./turboGroupingHelpers');
const { batchEnhancedGeocode, checkAnomalyDistance, deepCleanAddress, resetAllGeoProviders } = require('./turboGeoEnhanced');
const { enhanceAllOrderCoords, buildZoneCentroids, calculateTotalRouteDistance, haversineKm } = require('./turboCoordValidator');
const selfHostRoutingHealth = require('../src/services/selfHostRoutingHealth');
const KmlService = require('../src/services/KmlService');

// v36.9: CommonJS-безопасные локальные реализации основных утилит (ноль зависимостей)
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
            if (err.name === 'AbortError') throw err;
            if (i === retries) throw err;
            await new Promise(r => setTimeout(r, minTimeout * Math.pow(2, i)));
        }
    }
};
pRetry.AbortError = class AbortError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AbortError';
    }
};

const yieldToEventLoop = () => new Promise(resolve => setImmediate(resolve));

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
    delete(key) { return this.cache.delete(key); }
}

// Хелпер удален — используйте импортированную версию из turboGroupingHelpers

/**
 * v5.164: Надежная нормализация даты в YYYY-MM-DD
 */
function normalizeDateISO(dateStr) {
    if (!dateStr) return null;
    if (dateStr instanceof Date) {
        return dateStr.toISOString().split('T')[0];
    }
    if (typeof dateStr !== 'string') {
        const asDate = new Date(dateStr);
        if (!isNaN(asDate.getTime())) {
            return asDate.toISOString().split('T')[0];
        }
        return String(dateStr);
    }

    // Обработка DD-MM-YYYY or DD.MM.YYYY
    const sep = dateStr.includes('-') ? '-' : (dateStr.includes('.') ? '.' : null);
    if (sep) {
        const parts = dateStr.split(sep);
        if (parts[0].length === 2 && parts[2].length === 4) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`; // Конвертация в YYYY-MM-DD
        }
    }

    // Уже YYYY-MM-DD?
    if (dateStr.includes('-') && dateStr.split('-')[0].length === 4) {
        return dateStr.split('T')[0].split(' ')[0];
    }

    return dateStr;
}

class OrderCalculator {
    constructor() {
        this.isRunning = false;
        // v7.1: Тик простоя каждые 5 минут — notifyNewFOData() пробуждает дивизионы немедленно при реальных изменениях
        this.interval = 5 * 60 * 1000; // 5 минут
        // v7.1: Переохлаждение на дивизион: минимальное время перед повторным запуском даже с новыми данными
        this.MIN_CALC_INTERVAL_MS = 90 * 1000; // минимум 90 секунд между пересчётами
        // v6.11: Отслеживать временную метку последнего завершённого расчёта по дивизиону
        this.lastCalculatedAt = new Map();
        // v6.11: Отслеживать, изменились ли данные FO после последнего расчёта (чтобы немедленно проснуться)
        this.newFODataPending = new Map(); // divisionId -> true/false
        this.timer = null;
        this.isProcessing = false;
        this.io = null;
        this._stateTrackerLogCount = 0;
        this.MAX_DIVISIONS_PER_TICK = 3; // Prevent OOM: process at most 3 divisions per tick

        // v7.5: YAPIKO OSRM ВСЕГДА первый приоритет, затем self-host, затем удалённый/публичный
        const yapikoEnv = process.env.YAPIKO_OSRM_URL || '';
        const osrmEnv = process.env.OSRM_URL || '';
        const valEnv = process.env.VALHALLA_URL || '';

        this.yapikoOsrmUrl = yapikoEnv ? yapikoEnv.replace(/\/+$/, '') : (process.env.OSRM_URL || 'http://116.204.153.171:5050').replace(/\/+$/, '');
        this.useDualOsrm = process.env.DISABLE_SELF_HOST_ROUTING !== '1' && process.env.DISABLE_SELF_HOST_ROUTING !== 'true';
        this.osrmSingleUrl = null;

        this.selfOsrmUrl = (process.env.SELF_HOST_OSRM_URL || 'http://127.0.0.1:5050').replace(/\/+$/, '');
        this.remoteOsrmUrl = (process.env.REMOTE_OSRM_URL || osrmEnv || 'http://116.204.153.171:5050').replace(/\/+$/, '');

        this.useDualValhalla = process.env.DISABLE_SELF_HOST_ROUTING !== '1' && process.env.DISABLE_SELF_HOST_ROUTING !== 'true';
        this.valhallaSingleUrl = null;

        this.selfValhallaUrl = (process.env.SELF_HOST_VALHALLA_URL || 'http://127.0.0.1:8002').replace(/\/+$/, '');
        this.remoteValhallaUrl = (process.env.REMOTE_VALHALLA_URL || valEnv || 'http://116.204.153.171:8002').replace(/\/+$/, '');

        this.osrmUrl = this.osrmSingleUrl || this.remoteOsrmUrl;

        // v23.1: Постоянный геокэш (LRU без зависимостей)
        this.geocache = new SimpleLRU({ maxSize: 5000, maxAge: 24 * 60 * 60 * 1000 });
        this.addressUtils = require('../src/utils/addressUtils');

        // v5.172: Пространственный сеточный индекс KML-зон для поиска за O(1)
        this.kmlZones = []; // Все активные KML зоны
        this.kmlGridIndex = new Map(); // Пространственная сетка: "lat,lng" -> [zones]
        this.GRID_SIZE = 0.01; // ~1.1км на экваторе

        // v5.180: Лимит параллельности расчёта маршрутов (v6.10: увеличено для более быстрой обработки)
        this.routeLimit = pLimit(10); // Макс. 10 одновременных расчетов маршрутов

        // v5.180: Порог нечёткого совпадения GeoCache
        this.FUZZY_THRESHOLD = 3; // Макс. расстояние Левенштейна для нечеткого совпадения

        // Состояние УПРАВЛЕНИЯ для каждого отдела (управляет расписанием тиков и ручными переопределениями)
        this.divisionStates = new Map(); // divisionId -> { date, isActive, forceFull, targetCourier, ... }
        this.processedHashes = new Map();
        this.priorityQueue = [];
        this.currentPriority = null;

        // Хранилище СТАТУСА для каждого отдела (последний отправленный payload для UI/админа)
        this.divisionStatus = new Map(); // ключ `${divisionId}_${date}` -> payload
        this.lastEmitTimeByKey = new Map(); // ключ -> epoch ms (троттлинг на division+date)

        // v5.170: БЕЗ автозапуска — робот работает ТОЛЬКО когда пользователь нажимает "Запустить"
        this.activeDivisionId = null;
        this.activeDivisionDate = null;

        this.enginePresets = {
            yapikoOSRM: {
                label: 'Yapiko OSRM',
                url: process.env.YAPIKO_OSRM_URL || 'http://116.204.153.171:5050'
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
        // Автоматический выключатель движка маршрутов: пропускать постоянно сбоящие движки на короткий период.
        this.engineFailures = new Map(); // engineName -> { failures, blockedUntil }
        this.ENGINE_BLOCK_MS = 10 * 60 * 1000; // 10 минут
        this.ENGINE_FAIL_THRESHOLD = 3;
        // Легковесные счетчики здоровья движков для диагностики/UI
        this.routingHealth = new Map(); // engineName -> { ok, fail, lastError, lastStatus, lastMs }

        // v5.185: Расстояние по гаверсинусу в метрах
        // (пустышка; оставлено намеренно пустым — инициализация уже выполнена выше)

        // v5.185: Предварительно загрузить KML-зоны при создании
        this.preloadKmlZones();
    }

    // v5.172: Предзагрузка всех KML зон в память с пространственным сеточным индексом
    async preloadKmlZones() {
        try {
            const KmlZone = this.getModel('KmlZone');
            if (!KmlZone) {
                logger.warn('[TurboCalculator] KmlZone model not available');
                return;
            }

            const KmlHub = this.getModel('KmlHub');

            // Загрузка all active zones
            this.kmlZones = await KmlZone.findAll({
                where: { is_active: true },
                include: [{ model: KmlHub, as: 'hub' }]
            });

            // Построить пространственный сеточный индекс
            this.buildKmlSpatialGrid();
            
            // v7.1: Предварительное вычисление центроидов зон для быстрой валидации координат
            this.zoneCentroids = buildZoneCentroids(this.kmlZones);

            logger.info(`[TurboCalculator]  Предзагружено ${this.kmlZones.length} KML зон с пространственной сеткой и центроидами`);
        } catch (e) {
            logger.warn('[TurboCalculator] Failed to preload KML zones:', e.message);
        }
    }

    // v5.172: Построение пространственного сеточного индекса для быстрого O(1) поиска зон
    buildKmlSpatialGrid() {
        this.kmlGridIndex.clear();

        for (const zone of this.kmlZones) {
            if (!zone.bounds) continue;

            const b = zone.bounds;
            const swLat = b.south;
            const swLng = b.west;
            const neLat = b.north;
            const neLng = b.east;

            // Пропуск невалидных границ
            if (swLat === undefined || neLat === undefined) continue;

            // Добавление зоны во все ячейки сетки, которые она пересекает
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

        logger.info(`[TurboCalculator]  Сетка KML построена: ${this.kmlGridIndex.size} ячеек`);
    }

    // v5.172: Быстрый O(1) поиск зоны с использованием пространственной сетки + point-in-polygon
    findZonesForPoint(lat, lng, tolerance = 0.01) {
        if (!lat || !lng || this.kmlZones.length === 0) return [];

        // Шаг 1: Получение кандидатов зон из сетки (O(1) поиск)
        const gridKey = `${Math.floor(lat / this.GRID_SIZE)},${Math.floor(lng / this.GRID_SIZE)}`;
        const candidateZones = this.kmlGridIndex.get(gridKey) || [];

        if (candidateZones.length === 0) return [];

        // Шаг 2: Точная проверка point-in-polygon только для кандидатов
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

        // Сортировка: сначала зоны доставки, потом технические
        matches.sort((a, b) => {
            if (a.is_technical !== b.is_technical) return a.is_technical ? 1 : -1;

            return 0;
        });

        return matches;
    }

    // v5.172: Поиск лучшей (нетехнической) зоны для точки
    findBestZoneForPoint(lat, lng) {
        const zones = this.findZonesForPoint(lat, lng);
        // Возвращаем первую нетехническую зону
        return zones.find(z => !z.is_technical) || zones[0] || null;
    }

    // v5.172: Проверка, находится ли точка в ожидаемой KML зоне (с запасным вариантом к другим активным зонам)
    // v6.11 ИСПРАВЛЕНИЕ: Запасной вариант теперь СТРОГИЙ — принимаются только соседние зоны, не любая зона в городе
    validatePointInZone(lat, lng, expectedZoneName, allowFallback = true) {
        if (!expectedZoneName) return { valid: true, zone: null };

        const zones = this.findZonesForPoint(lat, lng);

        if (zones.length === 0) {
            return { valid: false, zone: null, reason: 'outside_all_zones' };
        }

        // Проверка point is in expected zone
        const expectedNormalized = expectedZoneName.replace(/FO\/KML:\s*/i, '').trim().toLowerCase();
        const matchingZone = zones.find(z => z.name.toLowerCase().includes(expectedNormalized));

        if (matchingZone) {
            return { valid: true, zone: matchingZone };
        }

        // v6.11 СТРОГИЙ ЗАПАСНОЙ ВАРИАНТ: Принимаем запасной вариант только если запасная зона рядом с ожидаемой.
        // "Рядом" означает, что точка (которая В запасной зоне) находится в пределах 5км от границы ожидаемой зоны.
        if (allowFallback && zones[0]) {
            // Поиск ожидаемой зоны для вычисления расстояния до неё
            const expectedZoneObj = this.kmlZones.find(z => z.name.toLowerCase().includes(expectedNormalized));
            if (!expectedZoneObj || !expectedZoneObj.bounds) {
                // Невозможно проверить расстояние — отклоняем запасной вариант для безопасности
                logger.warn(`[TurboCalculator]  Strict fallback: expected zone "${expectedZoneName}" not found in KML index — rejecting point ${lat},${lng}`);
                return { valid: false, zone: zones[0], reason: 'expected_zone_not_found' };
            }
            // Вычисление расстояния от точки до центра ожидаемой зоны (центроид ограничивающего прямоугольника)
            const zoneCenterLat = (expectedZoneObj.bounds.north + expectedZoneObj.bounds.south) / 2;
            const zoneCenterLng = (expectedZoneObj.bounds.east + expectedZoneObj.bounds.west) / 2;
            const distMeters = this.haversineDistance(lat, lng, zoneCenterLat, zoneCenterLng);
            const MAX_FALLBACK_DIST_M = 5000; // 5км — соседняя зона подходит, межгородская — нет
            if (distMeters <= MAX_FALLBACK_DIST_M) {
                logger.info(`[TurboCalculator] ℹ Accepted nearby fallback zone "${zones[0].name}" (${(distMeters/1000).toFixed(1)}km from expected "${expectedZoneName}")`);
                return { valid: true, zone: zones[0], fallback: true };
            } else {
                logger.warn(`[TurboCalculator]  REJECTED cross-city fallback: point ${lat},${lng} is in zone "${zones[0].name}" but ${(distMeters/1000).toFixed(1)}km from expected "${expectedZoneName}"`);
                return { valid: false, zone: zones[0], reason: 'fallback_too_far' };
            }
        }

        return { valid: false, zone: zones[0], reason: 'not_in_expected_zone' };
    }


    // v5.180: Поиск ближайшей зоны в пределах допустимого расстояния (запасной вариант, если точка вне всех зон)
    findNearestZone(lat, lng, maxDistanceMeters = 500) {
        if (!lat || !lng || this.kmlZones.length === 0) return null;

        let nearestZone = null;
        let nearestDistance = Infinity;

        for (const zone of this.kmlZones) {
            if (!zone.bounds) continue;

            const b = zone.bounds;
            // Быстрая проверка ограничивающего прямоугольника
            if (lat < b.south - 0.01 || lat > b.north + 0.01 || lng < b.west - 0.01 || lng > b.east + 0.01) {
                continue;
            }

            // Поиск ближайшей точки на границе полигона
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

    // v5.180: Вычисление расстояния от точки до отрезка (метры)
    // ИСПРАВЛЕНИЕ: Проекция в локальное метрическое пространство с усреднением широты, чтобы избежать
    // прямого смешивания градусов широты/долготы (которое искажает параметр t).
    pointToSegmentDistance(px, py, x1, y1, x2, y2) {
        const avgLat = (px + x1 + x2) / 3;
        const mPerDegLat = 111320;
        const mPerDegLng = 111320 * Math.cos(avgLat * Math.PI / 180);

        const dx = (x2 - x1) * mPerDegLng;
        const dy = (y2 - y1) * mPerDegLat;
        const lengthSq = dx * dx + dy * dy;

        if (lengthSq === 0) return this.haversineDistance(px, py, x1, y1);

        const qx = (px - x1) * mPerDegLng;
        const qy = (py - y1) * mPerDegLat;

        let t = (qx * dx + qy * dy) / lengthSq;
        t = Math.max(0, Math.min(1, t));

        const projX = x1 + t * (x2 - x1);
        const projY = y1 + t * (y2 - y1);

        return this.haversineDistance(px, py, projX, projY);
    }

    // v5.180: Расстояние по формуле гаверсинусов в метрах
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

    // v5.180: Нечёткий поиск в кэше с использованием расстояния Левенштейна
    fuzzyCacheLookup(addressKey, threshold = null) {
        const maxDist = threshold || this.FUZZY_THRESHOLD;
        const normalizedKey = addressKey.toLowerCase().trim();

        // Проверка exact match first
        if (this.geocache.has(normalizedKey)) {
            return { match: this.geocache.get(normalizedKey), type: 'exact' };
        }

        // Нечёткое совпадение по ключам кэша
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
            logger.info(`[TurboCalculator]  Fuzzy cache hit: "${addressKey}" -> "${bestMatch.key}" (dist: ${bestMatch.distance})`);
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
            const results = await sequelize.query(
                "SELECT data FROM dashboard_states WHERE data->>'activeDivisionId' IS NOT NULL",
                { type: sequelize.QueryTypes.SELECT }
            );
            if (results && results.length > 0) {
                logger.info(`[TurboCalculator]  Found ${results.length} saved user states to restore`);
                for (const row of results) {
                    if (row.data) {
                        const divId = String(row.data.activeDivisionId);
                        const date = row.data.activeDivisionDate || new Date().toISOString().split('T')[0];
                        
                        if (!this.divisionStates.has(divId)) {
                            this.divisionStates.set(divId, {
                                users: new Set(),
                                date: date,
                                priorityQueue: [],
                                currentPriority: null,
                                isActive: false, // Остаётся false до обнаружения или уведомления notify
                            });
                            logger.info(`[TurboCalculator]  Restored division ${divId} from user state (${date})`);
                        }
                    }
                }
            }
        } catch (error) {
            logger.warn('[TurboCalculator]  Could not load saved state:', error.message);
        }
    }

    async loadAllDivisionStatesFromDB() {
        logger.info('[TurboCalculator]  Attempting to load division states from DB...');
        try {
            const DivisionState = this.getModel('DashboardDivisionState');
            if (!DivisionState) {
                logger.warn('[TurboCalculator]  DashboardDivisionState model not found - skipping DB load');
                return;
            }
            const today = new Date().toISOString().split('T')[0];
            const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];
            const rows = await DivisionState.findAll();
            for (const r of rows) {
                const userId = r.user_id;
                const divId = r.division_id;
                const date = r.date;
                const isActive = r.is_active;
                if (divId) {
                    let state = this.divisionStates.get(divId);
                    if (!state) {
                        // Skip stale divisions (>2 days old) to prevent OOM on restart
                        const isStale = date && date < twoDaysAgo;
                        if (isStale) {
                            if (this._stateTrackerLogCount < 20) {
                                logger.info(`[TurboCalculator]  Skipping stale division ${divId} (date ${date} < ${twoDaysAgo})`);
                                this._stateTrackerLogCount++;
                            }
                            continue;
                        }
                        state = { 
                            users: new Set(), 
                            date: date || today, 
                            priorityQueue: [], 
                            currentPriority: null, 
                            // v38.2: АВТО-ВОЗОБНОВЛЕНИЕ включено для стабильности
                            isActive: !!isActive 
                        };
                        this.divisionStates.set(divId, state);
                    }
                    
                    if (!state.users || typeof state.users.add !== 'function') {
                        state.users = new Set();
                    }
                    
                    if (userId) {
                        state.users.add(userId);
                    }
                    // Only update date if it's recent (prevents stale rows from overwriting already-loaded recent dates)
                    if (date && date >= twoDaysAgo) state.date = date;
                    
                    // v38.2: Если был активен в БД, должен быть активен и в воркере
                    if (!!isActive && date >= twoDaysAgo) state.isActive = true;

                    if (state.isActive) {
                        logger.info(`[TurboCalculator]  Auto-resumed division: ${divId} for date ${state.date}`);
                        this.newFODataPending.set(divId, true);
                    } else {
                        logger.info(`[TurboCalculator]  Loaded division ${divId} (inactive)`);
                    }

                }
            }
            logger.info('[TurboCalculator]  Loaded division states from DB into memory');

            // v6.10: НЕ запускать автоматически при старте сервера — только когда пользователь явно нажимает "Запустить расчёт"
            // Removed: if (this.isRunning && !this.isProcessing) { this.tick(); }
        } catch (err) {
            logger.warn('[TurboCalculator]  Could not load division states from DB:', err.message);
        }
    }

    /**
     * Centralized Model Resolver
     * Directly import from models/index.js to ensure models are loaded
     */
    getModel(name) {
        try {
            // Прямой импорт для гарантии регистрации моделей
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
        this.isRunning = true;

        logger.info('[TurboCalculator]  Starting initialization...');

        try {
            await this.loadSavedState();
        } catch (e) {
            logger.warn('[TurboCalculator]  loadSavedState failed:', e.message);
        }

        try {
            await this.loadAllDivisionStatesFromDB();
        } catch (e) {
            logger.warn('[TurboCalculator]  loadAllDivisionStatesFromDB failed:', e.message);
        }

        try {
            await selfHostRoutingHealth.probeAll();
        } catch (e) { /* non-fatal */ }

        // v39.1: Перезагрузка KML зон СЕЙЧАС — модели полностью готовы.
        // Вызов preloadKmlZones() в конструкторе гоняется с инициализацией БД на Render и обычно получает 0 зон.
        try {
            await this.preloadKmlZones();
            logger.info(`[TurboCalculator]  KML zones loaded in start(): ${this.kmlZones?.length || 0} zones`);
        } catch (e) {
            logger.warn('[TurboCalculator]  KML preload in start() failed:', e.message);
        }

        logger.info(`[TurboCalculator]  v39.1 SERVER-READY — Auto-starting tick loop.`);
        this.tick();
    }

    /**
     * v38.2: Discover divisions that have data in the cache for today
     * This ensures the robot starts working immediately on restart even if state was not saved.
     */
    async discoverDivisions() {
        try {
            const DashboardCache = this.getModel('DashboardCache');
            const DivisionState = this.getModel('DashboardDivisionState');
            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            const dayBefore = new Date(Date.now() - 172800000).toISOString().split('T')[0];
            
            // v39.2: Поиск данных за последние 3 дня для обработки ночных пользователей
            const activeCaches = await DashboardCache.findAll({
                where: { target_date: [today, yesterday, dayBefore] },
                attributes: ['division_id', 'target_date'],
                order: [['updated_at', 'DESC']]
            });

            // Также проверка филиалов, отмеченных активными в таблице постоянного состояния
            let persistedActive = [];
            if (DivisionState) {
                persistedActive = await DivisionState.findAll({ where: { is_active: true } });
            }

            const discovered = new Set();
            
            // Приоритет 1: Постоянное состояние (активные филиалы)
            persistedActive.forEach(p => discovered.add({ id: String(p.division_id), date: p.date || today }));
            
            // Приоритет 2: Свежие данные кэша
            activeCaches.forEach(c => discovered.add({ id: String(c.division_id), date: c.target_date }));

            discovered.forEach(item => {
                const id = item.id;
                if (!this.divisionStates.has(id)) {
                    this.divisionStates.set(id, { 
                        isActive: true, 
                        date: item.date,
                        lastNotify: Date.now() 
                    });
                    logger.info(`[TurboCalculator]  Discovered/Resumed active division ${id} for ${item.date}`);
                    this.newFODataPending.set(id, true);
                } else if (!this.divisionStates.get(id).isActive) {
                    // Пробуждение, если был в простое, но есть свежие данные
                    this.divisionStates.get(id).isActive = true;
                    this.newFODataPending.set(id, true);
                }
            });
        } catch (e) {
            logger.warn('[TurboCalculator]  Division discovery failed:', e.message);
        }
    }

    /**
     * v38.2: Wake up all discovered divisions
     */
    async triggerAll() {
        logger.info('[TurboCalculator]  Global wake up triggered');
        await this.discoverDivisions();
        for (const [id, state] of this.divisionStates.entries()) {
            state.isActive = true;
            this.newFODataPending.set(id, true);
        }
        this.tick();
    }

    scheduleNextTick(forceInitial = false, customInterval = null) {
        if (this.timer) clearTimeout(this.timer);

        // v7.0: СЕРВЕР-ПЕРВЫЙ — всегда держать цикл тиков активным.
        // Больше не останавливается, когда нет "активных" запущенных пользователем филиалов.
        const interval = customInterval || this.interval;
        this.timer = setTimeout(() => this.tick(), interval);
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

        // v5.172: ВСЕГДА очищать хэш при ручном запуске для принудительного пересчёта
        this.processedHashes.delete(cacheKey);
        logger.info(`[TurboCalculator]  Manual trigger: Cleared processedHash for ${cacheKey}${forceFull ? ' (FULL recalculation)' : ''}`);

        if (this.io) {
            const divIdStr = String(divisionId);
            
            // v7.5: Попытка получить totalCount из текущего кэша, чтобы избежать "мигания 0" в UI
            const DashboardCache = this.getModel('DashboardCache');
            const emitInitial = (count = 0, totalAll = 0) => {
                const initStatus = {
                    divisionId: divIdStr,
                    date: targetDate,
                    isActive: true,
                    currentPhase: 'initializing',
                    message: 'Preparing data for analysis...',
                    totalCount: count,
                    totalOrdersAll: totalAll,
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
                        let count = 0;
                        let totalAll = 0;
                        if (c && c.payload && Array.isArray(c.payload.orders)) {
                            totalAll = c.payload.orders.length;
                            count = c.payload.orders.filter(o => {
                                const courier = String(o.courier || o.courierName || o.courierId || '').toUpperCase().trim();
                                const status = String(o.status || o.deliveryStatus || '').toLowerCase().trim();
                                if (!courier || courier === 'НЕ НАЗНАЧЕНО' || courier === 'UNASSIGNED' || courier === 'ПО' || courier === 'ID:0') return false;
                                if (status.includes('отказ') || status.includes('отменен') || status.includes('відмова')) return false;
                                if (status.includes('самовывоз') || status.includes('на месте')) return false;
                                return true;
                            }).length;
                        }
                        emitInitial(count, totalAll);
                    }).catch(() => emitInitial(0, 0));
            } else {
                emitInitial(0, 0);
            }
            
            logger.info(`[TurboCalculator]  Emitted initial status for division ${divIdStr}${targetCourier ? ` (Target: ${targetCourier})` : ''}`);
        }

        let state = this.divisionStates.get(divisionId);
        if (!state) {
            state = { users: new Set(), date: targetDate, priorityQueue: [], currentPriority: null, isActive: true, forceFull, targetCourier };
            this.divisionStates.set(divisionId, state);
        } else {
            // v5.170: Реактивировать, если был остановлен, и ОБНОВИТЬ дату!
            state.isActive = true;
            if (targetDate !== state.date) {
                logger.info(`[TurboCalculator]  Date changed for ${divisionId}: ${state.date} -> ${targetDate}. Clearing cache hash.`);
                this.processedHashes.delete(cacheKey); // Очистка старого хэша даты
                this.processedHashes.delete(`${divisionId}_${state.date}`); // Очистка явного предыдущего хэша даты
            }
            state.date = targetDate;
            state.forceFull = forceFull; // Сохранение флага принудительного пересчёта в состоянии
            state.targetCourier = targetCourier; // v37.1: Опциональный целевой курьер
        }
        if (userId) {
            if (!state.users || typeof state.users.add !== 'function') {
                state.users = new Set();
            }
            state.users.add(userId);
        }

        // Сохранение активации в БД
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

        // v6.10: ЗАПУСК НЕМЕДЛЕННО — не ждать следующего цикла тиков
        logger.info(`[TurboCalculator]  Starting immediate processing for ${divisionId} on ${targetDate}`);
        
        // Обеспечение немедленного запуска тика
        if (!this.isProcessing) {
            setImmediate(() => this.tick());
        } else {
            this.needsReRun = true;
        }
    }

    /**
     * Stop background calculation and clear active division
     */
    async stop(divisionId = null) {
        // v5.170: Очистка таймера НЕМЕДЛЕННО для предотвращения дальнейших тиков
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        // Always clear needsReRun to prevent ghost restarts
        this.needsReRun = false;

        if (divisionId) {
            const state = this.divisionStates.get(String(divisionId));
            if (state) {
                state.isActive = false;
            }
            this.divisionStates.delete(String(divisionId));
            this.processedHashes.delete(`${divisionId}_${state?.date || ''}`);

            // Сохранение состояния остановки в БД
            try {
                const DashboardDivisionState = this.getModel('DashboardDivisionState');
                if (DashboardDivisionState) {
                    await DashboardDivisionState.update(
                        { is_active: false, last_updated: new Date() },
                        { where: { division_id: String(divisionId) } }
                    );
                }
            } catch (e) {
                logger.error(`[TurboCalculator]  Failed to persist stop state for ${divisionId}: ${e.message}`);
            }

            // Отправка статуса остановки
            if (this.io) {
                this.io.emit('robot_status', {
                    divisionId,
                    isActive: false,
                    message: 'Robot stopped by user',
                    totalCount: 0,
                    processedCount: 0
                });
            }

            logger.info(`[TurboCalculator] ⏹ Background calculation stopped for ${divisionId}`);
        } else {
            // v5.170: Полная остановка ВСЕХ филиалов
            this.activeDivisionId = null;
            this.activeDivisionDate = null;
            this.priorityQueue = [];
            this.divisionStates.clear();
            this.processedHashes.clear();

            // Сохранение остановки для всех филиалов
            try {
                const DashboardDivisionState = this.getModel('DashboardDivisionState');
                if (DashboardDivisionState) {
                    await DashboardDivisionState.update(
                        { is_active: false, last_updated: new Date() },
                        { where: {} }
                    );
                }
            } catch (e) {
                logger.error(`[TurboCalculator]  Failed to persist global stop state: ${e.message}`);
            }

            // Отправка статуса остановки
            if (this.io) {
                this.io.emit('robot_status', {
                    isActive: false,
                    message: 'Robot stopped globally',
                    totalCount: 0,
                    processedCount: 0
                });
            }

            logger.info(`[TurboCalculator] ⏹ Background calculation stopped globally — ALL divisions cleared, timer removed`);
        }
    }

    async tick() {
        // Watchdog FIRST — check before the early return so it can actually fire
        if (this.isProcessing) {
            const runDuration = Date.now() - (this.lastRunStartedAt || 0);
            if (runDuration > 900000) { // 15 minutes
                logger.warn(`[TurboCalculator]  Run has been active for ${Math.round(runDuration/1000)}s. Force-clearing isProcessing flag.`);
                this.isProcessing = false;
            } else {
                return;
            }
        }

        // Set flag BEFORE any await to prevent concurrent tick() execution (race condition)
        this.isProcessing = true;
        this.lastRunStartedAt = Date.now();
        this.needsReRun = false;
        this._divisionsProcessedInTick = 0;

        try {
            const pendingDivs = Array.from(this.newFODataPending.keys());
            const activeDivs = Array.from(this.divisionStates.entries())
                .filter(([id, s]) => s.isActive || this.newFODataPending.has(id))
                .map(([id]) => id);

            logger.info(`[TurboCalculator]  tick() — active: [${activeDivs.join(', ')}], pending: [${pendingDivs.join(', ')}]`);

            if (activeDivs.length === 0) {
                // v38.2 Запасной вариант: попробовать найти филиалы ещё раз перед завершением
                await this.discoverDivisions();
                const recheck = Array.from(this.divisionStates.keys());
                if (recheck.length === 0) {
                    logger.info('[TurboCalculator]  All divisions idle, no pending FO data — tick skipped, timer rescheduled');
                    this.scheduleNextTick();
                    return;
                }
            }
            for (const [divId, state] of this.divisionStates.entries()) {
                const hasPendingFOData = this.newFODataPending.get(divId) === true;

                // v7.1: Обработка только если: (a) isActive И прошло время ожидания, ИЛИ (b) пришли новые данные FO
                const lastCalc = this.lastCalculatedAt.get(divId);
                const timeSinceLastCalc = lastCalc ? Date.now() - lastCalc : Infinity;
                const cooldownOk = timeSinceLastCalc >= this.MIN_CALC_INTERVAL_MS;

                // v7.2: Пропуск ожидания, если forceFull=true (ручной запуск пользователем)
                const isForceFull = state.forceFull === true;
                if (!hasPendingFOData && (!state.isActive || (!cooldownOk && !isForceFull))) {
                    if (!cooldownOk && !isForceFull) {
                        const waitSec = Math.ceil((this.MIN_CALC_INTERVAL_MS - timeSinceLastCalc) / 1000);
                        logger.info(`[TurboCalculator] ⏸ ${divId}: Cooldown (${waitSec}s left), no new FO data — skip`);
                    }
                    continue;
                }

                // Очистка флага ожидания перед обработкой
                if (hasPendingFOData) {
                    this.newFODataPending.delete(divId);
                    // Реактивация, если был в простое
                    if (!state.isActive) {
                        state.isActive = true;
                        logger.info(`[TurboCalculator]  ${divId}: Reactivated by new FO data`);
                    }
                }

                let targetDate = state.date || new Date().toISOString().split('T')[0];
                // v7.5: Всегда использовать сегодняшнюю дату, если сохранённая дата в прошлом
                const today = new Date().toISOString().split('T')[0];
                if (targetDate < today) {
                    const daysOld = (Date.now() - new Date(targetDate).getTime()) / 86400000;
                    if (daysOld > 3) {
                        logger.info(`[TurboCalculator]  ${divId}: Stale date ${targetDate} (${Math.round(daysOld)}d old) — deactivating, skipping processing`);
                        state.isActive = false;
                        continue;
                    }
                    logger.info(`[TurboCalculator]  ${divId}: Обновление устаревшей даты ${targetDate} → ${today}`);
                    // v7.8 ИСПРАВЛЕНИЕ: Очистка старого хэша даты перед обновлением — иначе старый ключ хэша
                    // становится осиротевшим, а новый ключ не имеет хэша → всегда вызывает пересчёт
                    const oldKey = `${divId}_${targetDate}`;
                    this.processedHashes.delete(oldKey);
                    targetDate = today;
                    state.date = today;
                }

                // Limit divisions per tick to prevent OOM on startup with many active divisions
                if (this._divisionsProcessedInTick >= this.MAX_DIVISIONS_PER_TICK) {
                    logger.info(`[TurboCalculator]  ${divId}: Reached max ${this.MAX_DIVISIONS_PER_TICK} divs per tick, deferring to next tick`);
                    // Re-flag for next tick
                    this.newFODataPending.set(divId, true);
                    continue;
                }

                logger.info(`[TurboCalculator]  Запуск расчета для ${divId} on ${targetDate}`);
                this._divisionsProcessedInTick++;
                await this.processDay(targetDate, divId);
                await yieldToEventLoop(); // Yield event loop so health check can respond
            }
        } catch (err) {
            logger.error('[TurboCalculator]  Robot Tick critical failure:', err);
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
            // If we hit the per-tick limit, schedule next tick much sooner
            // to continue processing remaining divisions
            const pendingDivsAfter = Array.from(this.newFODataPending.entries())
                .filter(([k, v]) => v === true && this.divisionStates.get(k)?.isActive);
            if (pendingDivsAfter.length > 0) {
                const fastInterval = Math.min(5000, this.interval);
                this.scheduleNextTick(true, fastInterval || 10000);
            } else {
                this.scheduleNextTick();
            }
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
                    logger.info(`[TurboCalculator]  Global trigger: Woke up ${uniqueDivs.size} divisions from DB.`);
                    this.trigger(); 
                }).catch(err => {
                    logger.error(`[TurboCalculator] Failed to wake up divisions: ${err.message}`);
                });
            }
            return;
        }

        // v7.0: ВСЕГДА активировать этот филиал — проверка isActive больше не нужна
        // v7.9: Дебаунс уведомлений для предотвращения дрожания при массовых синхронизациях
        const now = Date.now();
        const lastNotify = this.lastNotificationTime?.get(divIdStr) || 0;
        if (now - lastNotify < 3000 && this.newFODataPending.get(divIdStr)) {
            // Already recently notified AND still pending — hash already cleared, just ensure trigger
            if (this.isProcessing) {
                this.needsReRun = true;
            }
            return;
        }
        if (!this.lastNotificationTime) this.lastNotificationTime = new Map();
        this.lastNotificationTime.set(divIdStr, now);

        let state = this.divisionStates.get(divIdStr);
        if (!state) {
            state = { users: new Set(), date: targetDate, priorityQueue: [], currentPriority: null, isActive: true, forceFull: false };
            this.divisionStates.set(divIdStr, state);
        } else {
            state.isActive = true;
            state.date = targetDate;
        }

        // Отметка, что новые данные FO доступны для этого филиала
        this.newFODataPending.set(divIdStr, true);
        
        // Очистка устаревшего хэша, чтобы processCache обнаружил изменение
        // v7.9: Очищаем только если НЕ обрабатывается этот же филиал прямо сейчас, чтобы избежать "дрожания"
        this.processedHashes.delete(`${divIdStr}_${targetDate}`);

        logger.info(`[TurboCalculator]  Новые данные ФО для подразделения ${divIdStr} (${targetDate}) — ЗАПУЩЕН ПЕРЕРАСЧЕТ`);

        // v7.3: Уменьшение задержки для мгновенного отклика (500мс)
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
            logger.info(`[TurboCalculator]  вызван processDay: дата=${dateISO}, division=${priorityDivisionId || 'all'}`);

            const DashboardCache = this.getModel('DashboardCache');
            if (!DashboardCache) {
                logger.error('[TurboCalculator]  DashboardCache model not found — cannot process');
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

            logger.info(`[TurboCalculator]  Найдено ${caches?.length || 0} записей DashboardCache для ${dateISO}`);

            if (!caches || caches.length === 0) {
                logger.warn(`[TurboCalculator]  No DashboardCache found for date ${dateISO} (division: ${priorityDivisionId || 'all'})`);
                // Заполнение пустого кэша, чтобы UI сразу отобразил 0 результатов
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
                        logger.info(`[TurboCalculator]  Seeded empty DashboardCache for ${priorityDivisionId || 'all'} on ${dateISO}`);
                        // Обновление today-diagnostics cache/status
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
                logger.info(`[TurboCalculator]  No data found for ${priorityDivisionId || 'all'} on ${dateISO}`);
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

            // v6.2: Глобальная статистика для режима 'all', чтобы предотвратить мерцание/сброс индикатора прогресса
            if (priorityDivisionId === 'all') {
                let totalOrdersGlobal = 0;
                caches.forEach(c => {
                    totalOrdersGlobal += (c.payload?.orders?.length || 0);
                });

                // v6.12: Сохранение глобального счётчика прогресса для предотвращения мерцания
                const globalStatus = global.divisionStatusStore ? global.divisionStatusStore['all_global'] : null;
                const currentGlobalProcessed = globalStatus ? (globalStatus.processedCount || 0) : 0;

                // v7.9: Фильтрация глобального счётчика тоже для согласованности
                const totalRouteableGlobal = caches.reduce((sum, c) => {
                    return sum + (c.payload?.orders || []).filter(o => {
                        const s = String(o.status || o.deliveryStatus || '').toLowerCase();
                        if (s.includes('отказ') || s.includes('отменен') || s.includes('відмова')) return false;
                        if (s.includes('самовывоз') || s.includes('на месте')) return false;
                        return true;
                    }).length;
                }, 0);

                this.globalStats = {
                    divisionId: 'all',
                    date: dateISO,
                    isActive: true,
                    totalCount: totalRouteableGlobal,
                    processedCount: currentGlobalProcessed,
                    skippedInRoutes: globalStatus ? (globalStatus.skippedInRoutes || 0) : 0,
                    skippedGeocoding: globalStatus ? (globalStatus.skippedGeocoding || 0) : 0,
                    message: `Расчет по всем филиалам (${totalRouteableGlobal} заказов)...`
                };

                if (this.io) {
                    this.io.emit('robot_status', this.globalStats);
                }
            }

            // v7.9: Использовать ТОЛЬКО маршрутизируемые заказы для начального счётчика статуса, чтобы предотвратить скачок 368 -> 265 в UI
            const initialOrders = caches[0]?.payload?.orders || [];
            const initialRouteableCount = initialOrders.filter(o => {
                const c = String(o.courier || o.courierName || o.courierId || '').toUpperCase().trim();
                const s = String(o.status || o.deliveryStatus || '').toLowerCase().trim();
                if (!c || c === 'НЕ НАЗНАЧЕНО' || c === 'UNASSIGNED' || c === 'ПО' || c === 'ID:0') return false;
                if (s.includes('отказ') || s.includes('отменен') || s.includes('відмова')) return false;
                if (s.includes('самовывоз') || s.includes('на месте')) return false;
                return true;
            }).length;

            if (priorityDivisionId !== 'all') {
                this.globalStats = null;
                if (this.io && priorityDivisionId) {
                    this.io.emit('robot_status', {
                        divisionId: priorityDivisionId,
                        date: dateISO,
                        isActive: true,
                        totalCount: initialRouteableCount,
                        processedCount: 0,
                        currentPhase: 'initializing',
                        message: 'Подготовка к расчету...'
                    });
                }
            }

            // v5.198: Обработка всех кэшей для филиала 'all', иначе выбор основного
            const cachesToProcess = (priorityDivisionId === 'all') ? caches : [caches.reduce((best, c) => {
                const currentCount = c.payload?.orders?.length || 0;
                const bestCount = best?.payload?.orders?.length || 0;
                return currentCount > bestCount ? c : best;
            }, null)].filter(c => !!c);

            if (cachesToProcess.length > 1 && priorityDivisionId !== 'all') {
                logger.warn(`[TurboCalculator]  Found ${caches.length} caches for ${priorityDivisionId} on ${dateISO}, using the largest one only`);
            }

            for (const cache of cachesToProcess) {
                logger.info(`[TurboCalculator]  Обработка кэша: id=${cache.id}, orders=${cache.payload?.orders?.length || 0}, division=${cache.division_id}`);
                await this.processCache(cache);
                await yieldToEventLoop(); // Yield for health check between caches
            }
        } catch (err) {
            logger.error(`[OrderCalculator]  processDay error (${dateISO}):`, err);
        }
    }

    async processCache(cache) {
        // Reset preserved manual routes at the start to prevent stale data from failed previous runs
        this._preservedManualRoutes = [];
        try {
            const data = cache.payload;
            const targetDateNorm = normalizeDateISO(cache.target_date);
            const Route = this.getModel('Route');
            const divIdStr = String(cache.division_id);
            const dateStr = String(targetDateNorm || cache.target_date || '');
            const statusKey = `${divIdStr}_${dateStr}`;

            // v7.2: Использовать ТОЛЬКО маршрутизируемые заказы для счётчика статуса, чтобы идеально соответствовать таблице результатов Frontend
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

            // v36.9: Инициализация глобальной статистики сразу в начале функции
            const stats = {
                isActive: true,
                lastUpdate: Date.now(),
                totalCount: cacheTotalCount,
                totalOrdersAll: data?.orders?.length || 0,
                processedCount: 0,
                totalCouriers: 0,
                processedCouriers: 0,
                skippedGeocoding: 0,
                geoErrors: [], 
                skippedInRoutes: 0,
                skippedNoCourier: 0,
                uncalculatedOrders: [],
                message: 'Initializing...',
                currentPhase: 'initializing',
                courierStats: {},
                couriersSummary: {}, // v37.0: Стабильный источник истины KPI для Frontend
                totalRoutesCreated: 0, // v7.x: Отслеживание созданных маршрутов
                diagnostics: {
                    geocoding: { providers: Object.create(null) },
                }
            };

            // v37.0: Определение надёжного emitStatus в верхней области видимости для немедленного использования
            const emitStatus = (force = false) => {
                if (!this.io) return;
                const now = Date.now();
                const lastEmit = this.lastEmitTimeByKey?.get(statusKey) || 0;
                if (!force && lastEmit && (now - lastEmit < 1000)) return;
                if (this.lastEmitTimeByKey) this.lastEmitTimeByKey.set(statusKey, now);

                // Построение couriersSummary (источник истины для EliteCourierCard)
                const summary = {};
                Object.values(stats.courierStats || {}).forEach(cs => {
                    const bonusDist = (cs.ordersInRoutes || 0) * 0.5;
                    summary[cs.name] = {
                        distanceKm: Number((cs.distanceKm || 0).toFixed(2)),
                        bonusDistance: Number(bonusDist.toFixed(2)),
                        totalDistance: Number(((cs.distanceKm || 0) + bonusDist).toFixed(2)),
                        ordersCount: cs.ordersInRoutes || cs.orders || 0,
                    };
                });
                stats.couriersSummary = summary;

                const payload = {
                    divisionId: divIdStr,
                    date: dateStr,
                    ...stats,
                    lastUpdate: now,
                    // v37.1: Обратная совместимость для DivisionStatusPanel (вкладка Real-time)
                    couriers: Object.values(stats.courierStats || {}).map(cs => {
                        const bonusDist = (cs.ordersInRoutes || 0) * 0.5;
                        return {
                        name: cs.name,
                        orders: cs.ordersInRoutes || cs.orders || 0,
                        distanceKm: Number((cs.distanceKm || 0).toFixed(1)),
                        bonusDistance: Number(bonusDist.toFixed(1)),
                        totalDistance: Number(((cs.distanceKm || 0) + bonusDist).toFixed(1))
                    };
                    })
                };

                // Диагностика и здоровье
                try {
                    if (this.routingHealth) {
                        payload.diagnostics.routing = {
                            engines: Object.fromEntries(Array.from(this.routingHealth.entries())),
                            selfHost: selfHostRoutingHealth.getState()
                        };
                    }
                } catch (e) {}

                if (this.divisionStatus) this.divisionStatus.set(statusKey, payload);
                if (global.divisionStatusStore) global.divisionStatusStore[statusKey] = payload;

                this.io.emit('robot_status', payload);
                this.io.emit('division_status_update', payload);
            };

            // v37.0: НЕМЕДЛЕННЫЙ ВЫПУСК для пробуждения UI
            emitStatus(true);

            // Быстрый путь: нет заказов для этого филиала/даты
            if (!data || !Array.isArray(data.orders) || data.orders.length === 0) {
                stats.isActive = false;
                stats.message = 'No orders for this division/date';
                stats.currentPhase = 'complete';
                emitStatus(true);
                return;
            }

            // v7.5: Проверка доступности KML зон для пространственной валидации
            if (!this.kmlZones || this.kmlZones.length === 0) {
                await this.preloadKmlZones();
            }
            const allKmlZones = this.kmlZones || [];

            // v5.144: РАДИКАЛЬНАЯ дедупликация с использованием И ID, И хэша содержимого
            // Это ловит: один и тот же заказ с разными ID, заказы из нескольких источников
            const seenIds = new Set();
            const seenHashes = new Set();
            const uniqueOrders = [];
            let duplicateById = 0;
            let duplicateByHash = 0;

            data.orders.forEach(o => {
                const allIds = getAllOrderIds(o);
                const orderHash = getOrderHash(o);

                // Проверка, был ли уже замечен ЛЮБОЙ из ID этого заказа
                let isDuplicateById = false;
                for (const id of allIds) {
                    if (seenIds.has(id)) {
                        isDuplicateById = true;
                        duplicateById++;
                        break;
                    }
                }

                // Проверка, был ли уже замечен хэш содержимого (ловит дубликаты с разными ID)
                let isDuplicateByHash = seenHashes.has(orderHash);
                if (isDuplicateByHash) {
                    duplicateByHash++;
                }

                // Пропуск, если дубликат по любому из методов
                if (isDuplicateById || isDuplicateByHash) {
                    return;
                }

                // Добавление всех ID и хэша в наборы просмотренных
                for (const id of allIds) {
                    seenIds.add(id);
                }
                seenHashes.add(orderHash);
                uniqueOrders.push(o);
            });

            data.orders = uniqueOrders;
            if (duplicateById > 0 || duplicateByHash > 0) {
                logger.warn(`[TurboCalculator]  Дедуплицировано: ${duplicateById} по ID + ${duplicateByHash} по контенту, оставлено ${data.orders.length}`);
            }

            // v5.150: Отладка — логирование временных полей для первых 5 заказов ПОНОМАРЕНКО ЄВГЕНІЙ
            const ponomarenkoOrders = data.orders.filter(o => {
                const courier = String(o.courier || '').toUpperCase();
                return courier.includes('ПОНОМАРЕНКО');
            });
            if (ponomarenkoOrders.length > 0) {
                logger.info(`[TurboCalculator]  ПОНОМАРЕНКО ЄВГЕНІЙ: ${ponomarenkoOrders.length} orders`);
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

            // v5.195: Перенос вычисления хэша данных в самое начало для предотвращения избыточных обращений к БД
            const crypto = require('crypto');
            const stablePayload = (data.orders || []).map(o => {
                const s = String(o.status || o.deliveryStatus || '').toLowerCase().trim();
                const isCancelled = s.includes('отказ') || s.includes('отменен') || s.includes('відмова');
                const isPickup = s.includes('самовывоз') || s.includes('на месте');
                const parsedTime = getPlannedTime(o, null) || 0;
                const timeBucket = Math.floor(parsedTime / (15 * 60000)); // 15-минутные корзины
                return {
                    id: o.id || o._id,
                    n: o.orderNumber,
                    c: String(o.courier || o.courierName || o.courierId || '').toUpperCase().trim(),
                    s: isCancelled ? 'CX' : (isPickup ? 'PU' : 'ACTIVE'),
                    a: String(o.address || o.addressGeo || '').toLowerCase(),
                    t: timeBucket,
                };
            });

            const dataHash = crypto.createHash('sha256').update(JSON.stringify(stablePayload)).digest('hex');
            const cacheKey = `${cache.division_id}_${targetDateNorm || cache.target_date}`;

            const existingHash = this.processedHashes.get(cacheKey);

            // Если хэш не изменился — перевести филиал в СПЯЩИЙ режим, пробуждать только при новых данных FO
            const divState = this.divisionStates.get(String(cache.division_id));
            if (existingHash === dataHash && !divState?.forceFull) {
                if (divState) divState.isActive = false;
                stats.isActive = false;
                stats.currentPhase = 'complete';
                stats.message = 'Расчёт завершён. Ожидание новых данных...';
                emitStatus(true);
                return;
            }


            logger.info(`[TurboCalculator]  ${cacheKey}: ${existingHash === dataHash ? 'forceFull=true bypassed hash skip' : 'Data changed'} — triggering recalculation`);
            // v37.2: КРИТИЧНО — извлечение флагов ДО очистки divState, чтобы они были доступны в цикле курьеров
            const forceFull = !!divState?.forceFull;
            // v7.8 ИСПРАВЛЕНИЕ: Перезагрузка KML зон при forceFull (было не в том месте выше — divState ещё не был объявлен)
            if (forceFull && this.kmlZones && this.kmlZones.length > 0) {
                await this.preloadKmlZones();
            }
            const targetCourier = divState?.targetCourier || null;
            
            // v7.2: Сброс флагов, чтобы будущие тики работали нормально (обход только один раз за ручной запуск)
            if (divState?.forceFull) {
                divState.forceFull = false;
                logger.info(`[TurboCalculator]  ${cache.division_id}: Cleared forceFull flag after manual trigger`);
            }
            if (divState?.targetCourier) {
                divState.targetCourier = null;
                logger.info(`[TurboCalculator]  ${cache.division_id}: Cleared targetCourier flag (was: ${targetCourier})`);
            }

            // v37.9.2: УЛУЧШЕННАЯ ОЧИСТКА — использование Op.iLike и trim для гарантированного удаления старых маршрутов targetCourier.
            // vXX.X: НО сохранять маршруты с _manualModified=true!
            if (targetCourier && Route) {
                try {
                    const normTarget = normalizeCourierName(targetCourier);
                    // Сначала поиск ручных маршрутов для сохранения
                    const manualRoutes = await Route.findAll({
                        where: {
                            division_id: cache.division_id,
                            [Op.or]: [
                                { courier_id: normTarget },
                                { courier_id: { [Op.iLike]: `%${normTarget}%` } }
                            ],
                            [Op.and]: sequelize.where(
                                sequelize.literal("route_data->>'_manualModified'"),
                                'true'
                            ),
                            [Op.and]: sequelize.where(
                                sequelize.literal("route_data->>'target_date'"),
                                targetDateNorm || cache.target_date
                            )
                        }
                    });
                    const manualRouteIds = manualRoutes.map(r => r.id);
                    
                    const delWhere = {
                        division_id: cache.division_id,
                        [Op.or]: [
                            { courier_id: normTarget },
                            { courier_id: { [Op.iLike]: `%${normTarget}%` } }
                        ],
                        [Op.and]: sequelize.where(
                            sequelize.literal("route_data->>'target_date'"),
                            targetDateNorm || cache.target_date
                        )
                    };
                    if (manualRouteIds.length > 0) {
                        delWhere.id = { [Op.notIn]: manualRouteIds };
                    }
                    const delCount = await Route.destroy({
                        where: delWhere
                    });
                    logger.info(`[TurboCalculator]  Wiped ${delCount} old routes for targetCourier ${normTarget} (iLike lookup)`);
                } catch(e) {
                    logger.warn(`[TurboCalculator] Failed to wipe old routes for ${targetCourier}: ${e.message}`);
                }
            }

            const existingRoutedOrderNumbers = new Set();
            const existingRoutedOrderIds = new Set();
            let existingRoutes = [];
            
            // Map для хранения сигнатур существующих маршрутов для ИДЕАЛЬНОГО инкрементального построения без разрушения групп
            const existingRouteMap = new Map();
            const getHash = (str) => crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);

            const getBlockSignature = (orders) => {
                if (!Array.isArray(orders)) {
                    logger.warn(`[TurboCalculator]  getBlockSignature called with non-array: ${typeof orders}`, orders);
                    return '';
                }

                // v39.2: Стабильная сигнатура на основе сортированных (ID + 4 знака после запятой координат)
                // Это сохраняет ручные перестановки (из-за сортировки), но обнаруживает уточнение адреса.
                const sigParts = orders.map(o => {
                    const id = o.orderNumber || o.id || '';
                    const lat = o.coords?.lat || o.lat || 0;
                    const lng = o.coords?.lng || o.lng || 0;
                    // Точность до 4 знаков (~11м) для обнаружения реальных перемещений, но игнорирования шума плавающей точки
                    return `${id}:${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
                }).sort();
                
                return sigParts.join('|');
            };

            if (Route) {
                try {
                    logger.info(`[TurboCalculator]  Получение существующих маршрутов для ${cache.division_id} on ${targetDateNorm || cache.target_date}...`);
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
                    logger.info(`[TurboCalculator]  Найдено ${existingRoutes.length} существующих маршрутов`);


                    existingRoutes.forEach(r => {
                        const orders = r.route_data?.orders || [];
                        const isManual = r.route_data?._manualModified === true;
                        
                        if (isManual && orders.length > 0) {
                            // vXX.X: Сохранение ручных маршрутов — добавление заказов в наборы маршрутизированных И прямая отправка маршрута
                            orders.forEach(o => {
                                if (o.orderNumber) existingRoutedOrderNumbers.add(String(o.orderNumber));
                                if (o.id) existingRoutedOrderIds.add(String(o.id));
                            });
                            // Сохранение ручных маршрутов для последующей отправки на frontend
                            if (!this._preservedManualRoutes) this._preservedManualRoutes = [];
                            this._preservedManualRoutes.push(r);
                            logger.info(`[TurboCalculator]  Preserving manual route ${r.id} for ${r.courier_id} (${orders.length} orders)`);
                            return;
                        }
                        
                        orders.forEach(o => {
                            if (o.orderNumber) existingRoutedOrderNumbers.add(String(o.orderNumber));
                            if (o.id) existingRoutedOrderIds.add(String(o.id));
                        });
                        
                        // v5.195: Построение карты сигнатур для инкрементального пропуска
                        if (orders.length > 0) {
                            const sig = getBlockSignature(orders);
                            existingRouteMap.set(sig, r);
                        }
                    });

                    if (existingRoutes.length > 0) {
                        logger.info(`[TurboCalculator]  Найдено ${existingRoutes.length} существующих маршрутов по сигнатурам`);
                    }
                } catch (e) {
                    logger.warn(`[TurboCalculator]  Failed to fetch existing routes: ${e.message}`);
                }
            }

            // v7.5: allKmlZones уже предварительно загружены и определены в начале processCache


            // v33: Кэш в памяти для частичной отрисовки, чтобы избежать обращений к БД O(N^2)!
            let inMemoryFrontendRoutes = [];

            // v33: Предварительная загрузка пресетов ОДИН РАЗ для всей обработки кэша
            const presets = await this.getDivisionPresets(cache.division_id);
            const processedCourierNames = new Set();
            // Динамическое извлечение города из полей верхнего уровня пакета или addressGeo
            let dynamicCity = null;
            for (const o of (data.orders || [])) {
                dynamicCity = o.city || o.CityName || o.cityName || o.divisionName;
                if (!dynamicCity && o.addressGeo) {
                    const cityMatch = o.addressGeo.match(/CityName\s*=\s*"([^"]+)"/);
                    if (cityMatch) dynamicCity = cityMatch[1];
                }
                if (dynamicCity) break;
            }
            dynamicCity = dynamicCity || 'Харків';
            const cityBias = presets?.cityBias || dynamicCity;
            const parsePresetParam = (val) => {
                if (!val) return null;
                const parsed = parseFloat(String(val).replace(',', '.'));
                return isNaN(parsed) ? null : parsed;
            };
            let globalStartPoint = presets?.defaultStartLat && presets?.defaultStartLng ?
                { lat: parsePresetParam(presets.defaultStartLat), lng: parsePresetParam(presets.defaultStartLng) } : null;
            let globalEndPoint = presets?.defaultEndLat && presets?.defaultEndLng ?
                { lat: parsePresetParam(presets.defaultEndLat), lng: parsePresetParam(presets.defaultEndLng) } : null;

            // v42.1: Real solution: if coords are missing but address is in settings, geocode the hub!
            if (!globalStartPoint && presets?.defaultStartAddress) {
                logger.info(`[TurboCalculator] Hub Start coordinates missing, geocoding defaultStartAddress: ${presets.defaultStartAddress}`);
                try {
                    const geo = await this.getRobustGeocode(presets.defaultStartAddress, cityBias, null, [], true);
                    if (geo && geo.latitude && geo.longitude) {
                        globalStartPoint = { lat: geo.latitude, lng: geo.longitude };
                        logger.info(`[TurboCalculator] Geocoded Hub Start: ${geo.latitude}, ${geo.longitude}`);
                    }
                } catch (e) {
                    logger.warn(`[TurboCalculator] Failed to geocode Hub Start address: ${e.message}`);
                }
            }

            if (!globalEndPoint && presets?.defaultEndAddress) {
                logger.info(`[TurboCalculator] Hub End coordinates missing, geocoding defaultEndAddress: ${presets.defaultEndAddress}`);
                try {
                    const geo = await this.getRobustGeocode(presets.defaultEndAddress, cityBias, null, [], true);
                    if (geo && geo.latitude && geo.longitude) {
                        globalEndPoint = { lat: geo.latitude, lng: geo.longitude };
                        logger.info(`[TurboCalculator] Geocoded Hub End: ${geo.latitude}, ${geo.longitude}`);
                    }
                } catch (e) {
                    logger.warn(`[TurboCalculator] Failed to geocode Hub End address: ${e.message}`);
                }
            }

            // v39.2: Построение activeKmlFeatures ЗАРАНЕЕ для валидации входящих GPS координат Poster
            const divisionActiveZones = presets?.selectedZones || [];
            let activeKmlFeatures = [];
            
            if (allKmlZones && allKmlZones.length > 0) {
                activeKmlFeatures = allKmlZones.filter(z => {
                    const folderName = z.hub?.name || z.properties?.folderName || '';
                    const name = z.name || z.properties?.name || '';
                    const zoneKey = `${folderName.trim()}:${name.trim()}`;
                    return divisionActiveZones.includes(zoneKey);
                });
            } else if (presets?.kmlData?.polygons) {
                presets.kmlData.polygons.forEach(p => {
                    const zoneKey = `${(p.folderName || '').trim()}:${(p.name || '').trim()}`;
                    if (divisionActiveZones.includes(zoneKey)) {
                        const coords = (p.path || []).map(pt => [pt.lng, pt.lat]);
                        if (coords.length > 0) {
                            activeKmlFeatures.push({
                                id: `preset_${p.name}`,
                                name: p.name,
                                coordinates: coords,
                                properties: { folderName: p.folderName, name: p.name }
                            });
                        }
                    }
                });
            }

            // v44: МЯГКАЯ KML ВАЛИДАЦИЯ ДЛЯ GPS КООРДИНАТ (с толерантностью 2.5km к центроиду зоны)
            // Вместо жёсткого удаления любых координат не попавших в полигон, проверяем расстояние до
            // центроидов. GPS из FO addressGeo очень точный — не стоит его выбрасывать из-за кривых полигонов.
            if (activeKmlFeatures.length > 0) {
                // Предварительное построение центроидов зон для быстрой проверки tolerance
                const zoneCentroidsForValidation = activeKmlFeatures.map(zone => {
                    const polygon = zone.boundary?.coordinates?.[0] || zone.coordinates;
                    if (!polygon || polygon.length === 0) return null;
                    // Формат: [lng, lat] в GeoJSON
                    let sumLat = 0, sumLng = 0;
                    for (const pt of polygon) {
                        sumLat += (typeof pt[1] === 'number' ? pt[1] : 0);
                        sumLng += (typeof pt[0] === 'number' ? pt[0] : 0);
                    }
                    return { lat: sumLat / polygon.length, lng: sumLng / polygon.length };
                }).filter(Boolean);

                const haversineKm = (lat1, lng1, lat2, lng2) => {
                    const R = 6371;
                    const dLat = (lat2 - lat1) * Math.PI / 180;
                    const dLng = (lng2 - lng1) * Math.PI / 180;
                    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
                    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                };

                const GEO_TOLERANCE_KM = 2.5; // Принимаем GPS точку если она ≤ 2.5 км от центроида любой зоны
                let strippedCount = 0;
                let keptByToleranceCount = 0;

                for (const o of (data.orders || [])) {
                    const lat = o.coords?.lat || o.lat || o.latitude;
                    const lng = o.coords?.lng || o.lng || o.longitude;
                    if (!lat || !lng) continue;

                    // 1. Строгая проверка: точка внутри полигона
                    let isInside = false;
                    for (const zone of activeKmlFeatures) {
                        const polygon = zone.boundary?.coordinates?.[0] || zone.coordinates;
                        if (polygon && KmlService._isPointInPolygon(lat, lng, polygon)) {
                            isInside = true;
                            break;
                        }
                    }

                    if (isInside) continue; // OK — строго внутри

                    // 2. Мягкая проверка: ≤ tolerance от центроида любой зоны
                    // GPS из FO может быть идеально точным, но полигон нарисован неточно
                    let minDistKm = Infinity;
                    for (const c of zoneCentroidsForValidation) {
                        const d = haversineKm(lat, lng, c.lat, c.lng);
                        if (d < minDistKm) minDistKm = d;
                    }

                    if (minDistKm <= GEO_TOLERANCE_KM) {
                        // Принимаем — точка близка к зоне (вероятно, кривой полигон)
                        keptByToleranceCount++;
                        logger.debug(`[TurboCalculator] GPS kept by tolerance (${minDistKm.toFixed(2)}km from centroid): #${o.orderNumber} addr="${(o.address||'').substring(0,40)}"`);
                    } else {
                        // Отбрасываем — точка реально далеко от всех зон
                        strippedCount++;
                        delete o.coords;
                        delete o.lat;
                        delete o.lng;
                        delete o.latitude;
                        delete o.longitude;
                        o._geoFailed = true;
                    }
                }

                if (strippedCount > 0) {
                    logger.warn(`[TurboCalculator] Stripped ${strippedCount} GPS coords (truly outside zones). Kept ${keptByToleranceCount} by 2.5km tolerance.`);
                }
            }

            // Убедиться, что ordersToGroup содержит ВСЕ валидные заказы

            // v5.190: Группировка ВСЕХ валидных заказов вместо только newOrders, для сохранения правильных временных окон
            // v5.195: КРИТИЧНО — фильтрация отменённых заказов и самовывоза ПОЛНОСТЬЮ ЗАРАНЕЕ
            const ordersToGroup = data.orders.filter(o => {
                const c = String(o.courier || o.courierName || o.courierId || '').toUpperCase().trim();
                const s = String(o.status || o.deliveryStatus || '').toLowerCase().trim();
                
                if (!c || c === 'НЕ НАЗНАЧЕНО' || c === 'UNASSIGNED' || c === 'ПО' || c === 'ID:0') return false;
                
                // Не маршрутизировать отменённые заказы или самовывоз
                if (s.includes('отказ') || s.includes('отменен') || s.includes('відмова')) return false;
                if (s.includes('самовывоз') || s.includes('на месте')) return false;
                
                return true;
            });

            // v41: Диагностика конвейера — отслеживание, ГДЕ теряются заказы
            const preFilterCount = data.orders.length;
            const postFilterCount = ordersToGroup.length;
            if (preFilterCount !== postFilterCount) {
                const skippedNoCourier = preFilterCount - postFilterCount;
                stats.skippedNoCourier = skippedNoCourier;
                logger.warn(`[TurboCalculator]  ФИЛЬТР: ${preFilterCount} всего → ${postFilterCount} маршрутизируемых (${skippedNoCourier} filtered: no courier/cancelled/pickup)`);
                // Логирование отфильтрованных заказов для отладки
                const filteredOut = data.orders.filter(o => {
                    const c = String(o.courier || o.courierName || o.courierId || '').toUpperCase().trim();
                    const s = String(o.status || o.deliveryStatus || '').toLowerCase().trim();
                    if (!c || c === 'НЕ НАЗНАЧЕНО' || c === 'UNASSIGNED' || c === 'ПО' || c === 'ID:0') return true;
                    if (s.includes('отказ') || s.includes('отменен') || s.includes('відмова')) return true;
                    if (s.includes('самовывоз') || s.includes('на месте')) return true;
                    return false;
                });
                filteredOut.slice(0, 15).forEach(o => {
                    const c = String(o.courier || o.courierName || o.courierId || '');
                    const s = String(o.status || o.deliveryStatus || '');
                    logger.info(`[TurboCalculator]   ОТФИЛЬТРОВАН: #${o.orderNumber || o.id} courier="${c}" status="${s}" addr="${(o.address || '').substring(0, 50)}"`);
                });
            }

            // v7.6 КРИТИЧНО: Предварительная загрузка ручных исправлений из GeoCache
            // Это гарантирует, что ручные исправления учитываются ДО FO GPS или других источников
            const GeoCache = this.getModel('GeoCache');
            if (GeoCache && Array.isArray(data.orders)) {
                try {
                    const addressesToLookup = data.orders.map(o => {
                        const addr = o.address || o.addressGeo || '';
                        return addr ? deepCleanAddress(addr).toLowerCase().trim() : null;
                    }).filter(Boolean);
                    
                    if (addressesToLookup.length > 0) {
                        const uniqueKeys = Array.from(new Set(addressesToLookup));
                        logger.info(`[TurboCalculator]  Поиск ${uniqueKeys.length} адресов в GeoCache...`);
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
                                // v7.6: Если это ручная или высококачественная запись геокодирования, предустановить её
                                // чтобы resolveOrderCoords видел её как 'Уже геокодировано' (P3)
                                o.coords = { 
                                    lat: hit.lat, 
                                    lng: hit.lng, 
                                    provider: hit.provider,
                                    locationType: hit.location_type || 'CACHED'
                                };
                            }
                        });
                        logger.info(`[TurboCalculator]  Предзагружено ${cachedCoords.length} координат из GeoCache (including manual fixes)`);
                    }
                } catch (cacheErr) {
                    logger.warn(`[TurboCalculator]  Failed pre-loading GeoCache: ${cacheErr.message}`);
                }
            }

            // v7.1 SOTA: Умный разрешитель и валидатор координат
            const kmlIndex = { findBestZoneForPoint: (lat, lng) => this.findBestZoneForPoint(lat, lng) };
            if (!this.zoneCentroids || divState?.forceFull) {
                this.zoneCentroids = buildZoneCentroids(this.kmlZones);
            }
            
            const { enhanced, fromGPS, fromGeocoder, lowConfidence } = enhanceAllOrderCoords(data.orders, kmlIndex, this.zoneCentroids);
            logger.info(`[TurboCalculator]  Координатор: проверено ${enhanced} orders (${fromGPS} GPS, ${fromGeocoder} DB, ${lowConfidence} low-conf)`);

            // v7.8 ПРИМЕЧАНИЕ: dashboard:update во время геокодирования удалён — это вызывало мерцание адресов в UI.
            // Финальная рассылка routes_update в конце processCache является единственным источником истины.

            // v5.197: Стандартизация статистики для отслеживания в реальном времени в UI
            const totalCount = data.orders.length;
            const ordersWithRealCourier = ordersToGroup.length;
            const alreadyRouted = existingRoutedOrderNumbers.size;

            // v7.2: Начинаем с заказов, уже находящихся в маршрутах
            stats.skippedInRoutes = alreadyRouted;
            stats.processedCount = alreadyRouted; // Реальное количество: только уже завершённые заказы
            stats.unassignedCount = Math.max(0, totalCount - ordersWithRealCourier);
            stats.totalOrdersAll = totalCount;
            stats.currentPhase = 'processing';
            stats.message = 'Analyzing delivery queues...';
            emitStatus(true);

            const routedOrderIds = new Set();
            const markOrdersAsRouted = (ordersArr = []) => {
                for (const ro of (ordersArr || [])) {
                    const sid = getStableOrderId(ro);
                    if (sid) routedOrderIds.add(sid);
                }
                stats.skippedInRoutes = routedOrderIds.size;
            };

            // Предварительное извлечение встроенных GPS координат из поля FO "addressGeo" теперь происходит
            // внутри enhanceAllOrderCoords (разрешитель координат), который был вызван выше.
            // Он также проверяет координаты на аномалии (например, выбросы более чем на 25 км)
            // ДО фильтрации allOrdersNeedsGeo. Таким образом, некорректные GPS координаты из FO
            // будут проигнорированы и отправлены в геокодер.
            // v7.5: Геокодирование ВСЕХ заказов (назначенных и неназначенных), чтобы они сразу имели координаты
            let allOrdersNeedsGeo = data.orders.filter(o =>{
                const s = String(o.status || o.deliveryStatus || '').toLowerCase().trim();
                if (s.includes('отказ') || s.includes('отменен') || s.includes('відмова')) return false;
                if (s.includes('самовывоз') || s.includes('на месте')) return false;
                return !o.coords?.lat;
            });
            
            if (targetCourier) {
                const normTarget = normalizeCourierName(targetCourier);
                allOrdersNeedsGeo = allOrdersNeedsGeo.filter(o => normalizeCourierName(o.courier) === normTarget);
                logger.info(`[TurboCalculator]  targetCourier override: Only geocoding ${allOrdersNeedsGeo.length} unassigned coordinates for ${targetCourier}`);
            }

            if (allOrdersNeedsGeo.length > 0) {
                const totalToGeo = allOrdersNeedsGeo.length;
                const startTime = Date.now();

                logger.info(`[TurboCalculator]  Улучшенный геокодинг: ${totalToGeo} addresses (6-level SOTA engine)...`);

                if (this.io) {
                    stats.currentPhase = 'geocoding';
                    stats.message = `Геокодирование: ${totalToGeo} адресов...`;
                    emitStatus(true);
                }

                if (activeKmlFeatures.length > 0) {
                    logger.info(`[TurboCalculator]  Ограничение границ геокодинга: ${activeKmlFeatures.length} active KML zones (critical priority)`);
                }

                // v7.9: Сброс всех устаревших блокировок провайдеров перед началом нового пакета геокодирования
                resetAllGeoProviders();

                // v50 TWO-SPEED PIPELINE: Run geocoding in background to not block routing of clean orders!
                const runGeocoding = async (ordersList) => {
                    await batchEnhancedGeocode(ordersList, cityBias, activeKmlFeatures, {
                        photonUrl: process.env.PHOTON_URL || 'https://photon.komoot.io',
                        geoCacheDb: GeoCache,
                        hubAnchor: globalStartPoint || null,
                        gcacheLRU: this.geocache,
                        onProviderEvent: (evt) => {
                            try {
                                const p = String(evt?.provider || 'unknown');
                                const cur = stats.diagnostics.geocoding.providers[p] || { ok: 0, fail: 0, lastError: null, lastMs: null };
                                if (evt?.ok) cur.ok += 1;
                                else cur.fail += 1;
                                if (evt?.error) cur.lastError = String(evt.error);
                                if (typeof evt?.ms === 'number') cur.lastMs = evt.ms;
                                stats.diagnostics.geocoding.providers[p] = cur;
                            } catch (e) {}
                        },
                        onProgress: (done, total, pass) => {
                            const pct = Math.round((done / total) * 100);
                            const elapsed = (Date.now() - startTime) / 1000;
                            const eta = done > 0 ? Math.ceil((elapsed / done) * (total - done)) : 0;

                            if (this.io && targetCourier) {
                                stats.currentPhase = 'geocoding';
                                stats.processedCount = Math.round((done / total) * stats.totalCount * 0.40); 
                                stats.message = `Геокодирование ${pass === 'pass2' ? '(точный поиск) ' : ''}${pct}% (${done}/${total})${eta > 0 ? ` ~${eta}с` : ''}`;
                                emitStatus(true);
                            }
                        }
                    });

                    // Сбор оставшихся ошибок геокодирования
                    ordersList.forEach(o => {
                        if (!o.coords?.lat) {
                            const errorType = o._kmlRejected ? 'kml_rejected' : 'not_found';
                            stats.geoErrors.push({
                                orderNumber: o.orderNumber || o.id || 'unknown',
                                address: o.address || o.addressGeo || 'no address',
                                courier: o.courier || o.courierName || '',
                                errorType,
                                reason: o._kmlRejectedReason || o._geoFailedReason || errorType,
                                kmlRejectedCoords: o._kmlRejectedCoords || null,
                            });
                            stats.skippedGeocoding++;
                        }
                    });

                    const succeeded = ordersList.filter(o => o.coords?.lat).length;
                    logger.info(`[TurboCalculator]  Geocoding complete: ${succeeded}/${totalToGeo} success, ${stats.geoErrors.length} errors (${(Date.now() - startTime) / 1000}s)`);

                    // v50: РЕАКТИВНЫЙ RERUN (Моментальный отклик)
                    // Если мы в фоновом режиме нашли новые координаты, очищаем кэш хэшей
                    // и сразу триггерим перерасчет, не дожидаясь планировщика (5 мин)
                    if (succeeded > 0 && !targetCourier) {
                        logger.info(`[TurboCalculator]  Reactive Rerun: ${succeeded} coords resolved. Triggering immediate recalculation!`);
                        this.processedHashes.clear();
                        this.trigger(cache.division_id, targetDateNorm || cache.target_date, true);
                    }
                };

                // ВАЖНО: Если это ручной пересчет по конкретному курьеру (targetCourier) - ждем точных координат
                // Если фоновый процесс - запускаем асинхронно, чтобы валидные курьеры прогрузились МГНОВЕННО
                if (targetCourier) {
                    logger.info(`[TurboCalculator]  Two-Speed Pipeline: Manual Target Courier. BLOCKING to await geocoding.`);
                    await runGeocoding(allOrdersNeedsGeo);
                } else {
                    logger.info(`[TurboCalculator]  Двухскоростной конвейер: Фоновый такт. АСИНХРОННЫЙ ЗАПУСК геокодинга.`);
                    // Клонируем объекты, чтобы избежать состояния гонки, так как основной поток сразу перейдет к фоллбэку на центроиды
                    const clonedOrdersForGeo = allOrdersNeedsGeo.map(o => ({ ...o, coords: null }));
                    runGeocoding(clonedOrdersForGeo).catch(e => logger.error(`[TurboCalculator] Async geocoding failed: ${e.message}`));
                }
            }

            // v41: ЗАПАСНОЙ ВАРИАНТ ЦЕНТРОИДОВ ЗОН — для заказов, у которых всё ещё нет координат после геокодирования,
            // используем FO deliveryZone, сопоставленную с центроидами KML зон, как последнее средство.
            // Это гарантирует, что ВСЕ заказы с валидным курьером получат маршрут (даже приблизительный).
            let centroidFallbackCount = 0;
            const ordersInGroup = new Set(
                ordersToGroup.map(o => o.id || o.orderNumber || o._id).filter(Boolean)
            );
            for (const o of data.orders) {
                if (o.coords?.lat) continue;
                if (!ordersInGroup.has(o.id || o.orderNumber || o._id)) continue;
                
                const foZone = String(o.deliveryZone || '').trim();
                if (!foZone || !this.zoneCentroids) continue;
                
                const normZone = foZone.toLowerCase()
                    .replace(/fo\/kml:\s*/i, '')
                    .replace(/[^а-яіієєґa-z0-9\s]/gi, '')
                    .trim();
                
                let centroid = this.zoneCentroids.get(normZone);
                if (!centroid) {
                    const shortKey = normZone.split(/\s+/).slice(0, 2).join(' ');
                    centroid = this.zoneCentroids.get(shortKey);
                }
                // Нечёткое совпадение по номеру зоны
                if (!centroid) {
                    const zoneNum = foZone.match(/\d+/)?.[0];
                    if (zoneNum) {
                        for (const [key, val] of this.zoneCentroids.entries()) {
                            if (key.includes(zoneNum)) { centroid = val; break; }
                        }
                    }
                }

                // 100% FAIL-SAFE: Если зона не найдена, кидаем на ХАБ, чтобы курьер не потерял заказ из маршрута!
                if (!centroid && globalStartPoint) {
                    centroid = globalStartPoint;
                }
                
                if (centroid) {
                    o.coords = { lat: centroid.lat, lng: centroid.lng, provider: 'ZONE_CENTROID', locationType: 'APPROXIMATE' };
                    o.kmlZone = foZone;
                    o._coordConfidence = 0.2;
                    centroidFallbackCount++;
                }
            }
            if (centroidFallbackCount > 0) {
                logger.info(`[TurboCalculator]  Резерв центроидов: ${centroidFallbackCount} заказов получили примерные координаты to guarantee 100% inclusion`);
            }


            // v28.8: Группировка происходит ПОСЛЕ геокодирования, чтобы географическое разделение работало!
            // v7.x: Передача времени вычисления для проверки TTL
            let deliveryWindows = new Map();
            let totalBlocksCount = 0;
            try {
                const bDate = targetDateNorm || cache.target_date;
                const calcTime = Date.now(); // v7.x: Использование текущего времени для TTL (архивы используют дату, а не время)
                
                // === Новая схема Автомаршрута ===
                if (presets && presets.enableAutoRoute) {
                    const autoRoutedOrders = [];
                    const regularOrders = [];
                    
                    ordersToGroup.forEach(o => {
                        if (o.route_id) {
                            autoRoutedOrders.push(o);
                        } else {
                            regularOrders.push(o);
                        }
                    });
                    
                    deliveryWindows = groupAllOrdersByTimeWindow(regularOrders, bDate, calcTime, presets);
                    
                    const autoGroups = new Map();
                    autoRoutedOrders.forEach(o => {
                        if (!autoGroups.has(o.route_id)) {
                            autoGroups.set(o.route_id, []);
                        }
                        autoGroups.get(o.route_id).push(o);
                    });
                    
                    autoGroups.forEach((ordersInRoute, routeId) => {
                        let courierRaw = ordersInRoute[0].courier;
                        if (typeof courierRaw === 'object' && courierRaw !== null) {
                            courierRaw = courierRaw.name || courierRaw._id || courierRaw.id;
                        }
                        let normName = normalizeCourierName(courierRaw);
                        if (normName === 'НЕ НАЗНАЧЕНО' || !normName) {
                            normName = `Автомаршрут #${String(routeId).substring(0, 5)}`;
                        }
                        
                        ordersInRoute.sort((a, b) => (a.route_position || 0) - (b.route_position || 0));
                        
                        const block = {
                            id: `auto-${routeId}`,
                            orders: ordersInRoute,
                            windowStart: Math.min(...ordersInRoute.map(o => getPlannedTime(o, bDate) || Infinity).filter(t => t !== Infinity)),
                            windowEnd: Math.max(...ordersInRoute.map(o => getPlannedTime(o, bDate) || 0)),
                            _isAutoRoute: true
                        };
                        
                        if (block.windowStart === Infinity) block.windowStart = calcTime;
                        if (block.windowEnd === 0) block.windowEnd = calcTime + 3600000;
                        
                        const startDt = new Date(block.windowStart);
                        const endDt = new Date(block.windowEnd);
                        const pad = n => n.toString().padStart(2, '0');
                        block.windowLabel = `${pad(startDt.getHours())}:${pad(startDt.getMinutes())} - ${pad(endDt.getHours())}:${pad(endDt.getMinutes())}`;
                        
                        if (!deliveryWindows.has(normName)) {
                            deliveryWindows.set(normName, []);
                        }
                        deliveryWindows.get(normName).push(block);
                    });
                } else {
                    deliveryWindows = groupAllOrdersByTimeWindow(ordersToGroup, bDate, calcTime, presets);
                }

                deliveryWindows.forEach((windows, courierName) => { 
                    totalBlocksCount += windows.length; 
                    // v7.6: Инициализация статистики курьеров для записи расстояний/количества
                    if (!stats.courierStats[courierName]) {
                        stats.courierStats[courierName] = {
                            name: courierName,
                            orders: windows.reduce((sum, w) => sum + (w.orders?.length || 0), 0),
                            distanceKm: 0,
                            ordersInRoutes: 0, 
                            geoErrors: 0, // v7.2: Отслеживание ошибок геокодирования на курьера
                            type: windows[0]?.orders?.[0]?.courierType || 'Car'
                        };
                    }
                });
                stats.totalCouriers = deliveryWindows.size; // Обновление stats
                logger.info(`[TurboCalculator]  Сгруппировано ${ordersToGroup.length} заказов в ${totalBlocksCount} блоков среди ${deliveryWindows.size} курьеров`);
                
                // v6.0: Немедленный выпуск статуса после завершения группировки
                if (this.io) {
                    stats.currentPhase = 'grouping';
                    stats.processedCount = Math.max(stats.processedCount, Math.round(stats.totalCount * 0.35));
                    stats.message = `Grouped ${ordersToGroup.length} orders into ${totalBlocksCount} blocks...`;
                    emitStatus(true);
                }
            } catch (err) {
                logger.error('[TurboCalculator] Backend grouping failed', err);
                deliveryWindows = new Map();
            }



            // v5.145: Маршруты теперь удаляются ОДИН РАЗ в processDay, а не здесь

            // v31.2: Мгновенные обновления UI! Извлечение логии отправки маршрутов во вспомогательную функцию
            // v36.9: Добавлен троттлинг для частичных отправок маршрутов
            let lastRouteEmitTime = 0;
            const emitCurrentRoutes = async (force = false) => {
                if (!this.io) return;
                
                const now = Date.now();
                if (!force && now - lastRouteEmitTime < 2000) return; // 2с троттлинг для частичных
                lastRouteEmitTime = now;

                try {
                    const allWindowLabels = Array.from(new Set(
                        Array.from(deliveryWindows.values()).flat().map(w => w.windowLabel)
                    ));

                    // v40: Построение карты ошибок геокодирования по курьерам для диагностики бейджей
                    const courierGeoErrorMap = {};
                    (stats.geoErrors || []).forEach(e => {
                        const cn = normalizeCourierName(e.courier || '');
                        if (!cn) return;
                        if (!courierGeoErrorMap[cn]) courierGeoErrorMap[cn] = [];
                        courierGeoErrorMap[cn].push({
                            orderNumber: e.orderNumber,
                            address: e.address,
                            errorType: e.errorType || 'not_found',
                            reason: e.reason || '',
                            kmlRejectedCoords: e.kmlRejectedCoords || null,
                        });
                    });

                    const enrichedCouriers = Object.values(stats.courierStats || {}).map((cs) => {
                        const rawName = cs.name || '';
                        const normName = normalizeCourierName(rawName);
                        const bonusDist = (cs.ordersInRoutes || 0) * 0.5;
                        return {
                            name: normName,
                            courierName: normName,
                            distanceKm: Number((cs.distanceKm || 0).toFixed(2)),
                            bonusDistance: Number(bonusDist.toFixed(2)),
                            totalDistance: Number(((cs.distanceKm || 0) + bonusDist).toFixed(2)),
                            ordersInRoutes: cs.ordersInRoutes || 0,
                            geoErrors: cs.geoErrors || 0,
                            geoErrorOrders: courierGeoErrorMap[normName] || [],
                        };
                    }).filter(c => {
                        const norm = (c.name || '').toUpperCase().trim();
                        if (norm === 'НЕ НАЗНАЧЕНО' || norm === 'UNASSIGNED' || norm === 'ПО') return false;
                        return c.distanceKm > 0 || c.ordersInRoutes > 0;
                    });

                    this.io.emit('routes_update', {
                        divisionId: cache.division_id,
                        date: targetDateNorm || cache.target_date,
                        couriers: enrichedCouriers,
                        timeBlocks: allWindowLabels,
                        routes: inMemoryFrontendRoutes,
                        geoErrorOrders: stats.geoErrors || [],
                        // v41: Полная диагностика конвейера для frontend
                        uncalculatedOrders: stats.uncalculatedOrders || [],
                        skippedNoCourier: stats.skippedNoCourier || 0,
                        skippedGeocoding: stats.skippedGeocoding || 0,
                        centroidFallbackCount: centroidFallbackCount || 0,
                    });
                } catch (e) {
                    logger.error('[TurboCalculator]  Failed emitting routes:', e);
                }
            };
            
            const matchedExistingRouteIds = new Set();
            let finalRoutesToKeep = [];

            // v50: ПАРАЛЛЕЛЬНОЕ ВЫПОЛНЕНИЕ ЗАДАЧ МАРШРУТИЗАЦИИ (с лимитом)
            const routingTasks = [];

            // Обработка each courier and their time windows
            for (const [courierName, windows] of deliveryWindows.entries()) {
                const normName = courierName;
                if (!windows || windows.length === 0) continue;

                // v38: Пропуск курьеров, не являющихся целевыми, когда запрошен конкретный курьер
                if (targetCourier && normalizeCourierName(normName) !== normalizeCourierName(targetCourier)) {
                    continue;
                }

                // v36.5: Обновление текущего курьера и прогресса (учитывая параллельность, это индикация очереди)
                stats.currentCourier = normName;
                stats.message = `Queuing: ${normName}...`;
                emitStatus(true); 

                // Обеспечение записи статистики
                if (!stats.courierStats[normName]) {
                    const totalOrdersInWindows = windows.reduce((acc, w) => acc + w.orders.length, 0);
                    stats.courierStats[normName] = {
                        name: normName,
                        orders: totalOrdersInWindows,
                        distanceKm: 0,
                        ordersInRoutes: 0,
                        type: 'Car'
                    };
                }

                logger.info(`[TurboCalculator]  Очередь курьера ${normName}: ${windows.length} временных окон для параллельного выполнения`);

                for (const timeGroup of windows) {
                    routingTasks.push(this.routeLimit(async () => {
                        let courierRoutesCreated = 0; // Local counter for the current block
                        const windowKey = timeGroup.windowLabel;
                        const orders = timeGroup.orders;
                        if (!orders || orders.length === 0) return;

                    // v5.144: Дедупликация заказов с помощью вспомогательной функции
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
                        logger.warn(`[TurboCalculator]  Found ${localDupCount} duplicates in window ${windowKey}`);
                    }
                    logger.info(`[TurboCalculator]  [${windowKey}] Обработка ${normName} с ${dedupedOrders.length} orders`);

                    // v5.195: ИНКРЕМЕНТАЛЬНАЯ ЛОГИКА МАРШРУТИЗАЦИИ — сохранение блока, если существует старый расчёт
                    // v37.1: Пропуск кэша, если forceFull=true ИЛИ это целевой курьер
                    // vXX.X: Пропуск маршрутов с _manualModified=true для сохранения ручных изменений
                    const blockSignature = getBlockSignature(dedupedOrders);
                    const isTarget = targetCourier && (normalizeCourierName(normName) === normalizeCourierName(targetCourier));

                    if (existingRouteMap.has(blockSignature) && !forceFull && !isTarget) {
                        const existingR = existingRouteMap.get(blockSignature);
                        const existingKm = parseFloat(existingR?.total_distance || 0);
                        const existingHasGeometry = !!(existingR?.route_data?.geometry);
                        const existingOrdersCount = Number(existingR?.orders_count || 0);
                        const wasManuallyModified = existingR?.route_data?._manualModified === true;

                        // Если ранее кэшированный маршрут имеет 0 км / отсутствует геометрия, это, вероятно, устаревший плохой расчёт.
                        // Пересчитываем вместо бесконечного пропуска.
                        const shouldRecalcLegacyZero = !existingR || existingKm <= 0.01 || !existingHasGeometry || existingOrdersCount <= 0;
                        if (shouldRecalcLegacyZero) {
                            // Устаревший ноль км — пересчёт
                            logger.warn(`[TurboCalculator]  Перерасчет маршрута для ${normName} (${windowKey}): нулевой пробег в базе`);
                        } else {
                            // vXX.X: Если изменён вручную, СОХРАНЯЕМ его (просто логируем, не пересчитываем)
                            if (wasManuallyModified) {
                                logger.info(`[TurboCalculator]  PRESERVING manual route for ${normName} (${windowKey})`);
                            }
                            // Провал к обычному пути "пропуск пересчёта" ниже
                        matchedExistingRouteIds.add(existingR.id);
                        
                        // v36.5: Агрессивное добавление в статистику для мгновенной обратной связи
                        if (stats.courierStats[normName]) {
                            stats.courierStats[normName].distanceKm += existingKm;
                            stats.courierStats[normName].ordersInRoutes += existingR.orders_count;
                        }
                        markOrdersAsRouted(existingR.route_data?.orders || dedupedOrders);
                        stats.processedCount += dedupedOrders.length;
                        stats.message = `Skipping ${normName} (${windowKey}) — already calculated`;
                        emitStatus(true);
                        inMemoryFrontendRoutes.push({
                            id: existingR.id,
                            courier: existingR.courier_id,
                            courier_id: existingR.courier_id,
                            totalDistance: existingKm,
                            totalDuration: existingR.total_duration,
                            ordersCount: existingR.orders_count,
                            timeBlock: existingR.route_data?.deliveryWindow || existingR.route_data?.timeBlocks,
                            startAddress: existingR.route_data?.startAddress,
                            endAddress: existingR.route_data?.endAddress,
                            isOptimized: true, // v37.3: Критически важно для фильтрации CourierManagement
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
                                ttlEnd: o.ttlEnd || null,
                            }))
                        });
                        
                        logger.info(`[TurboCalculator] ⏩ Пропущен геокод и маршрутизация: найдено точное совпадение блока (${windowKey})`);
                        return; // Пропуск остатка блока! Никакого геокодирования, никакого OSRM
                        }
                    }

                    // v7.2: Больше нет внутреннего цикла геокодирования. Всё геокодируется заранее через batchEnhancedGeocode.
                    // Мы просто увеличиваем processedCount для этого блока и переходим к маршрутизации.
                    stats.processedCount += dedupedOrders.length;
                    emitStatus(true);

                    try {
                        // Использование всех валидных заказов (с координатами ИЛИ валидным адресом для маршрутизации)
                        // Использование дедуплицированных заказов из этого блока
                        let validOrders = dedupedOrders.filter(o => {
                            const s = String(o.status || o.deliveryStatus || '').toLowerCase().trim();
                            if (s.includes('отказ') || s.includes('отменен') || s.includes('відмова')) {
                                stats.skippedOther = (stats.skippedOther || 0) + 1;
                                return false;
                            }
                            const hasCoords = (o.coords?.lat && o.coords?.lng) ||
                                (o.lat && o.lng) ||
                                (o.latitude && o.longitude);
                            if (!hasCoords) {
                                if (stats.courierStats[normName]) stats.courierStats[normName].geoErrors++;
                                stats.uncalculatedOrders.push({
                                    orderNumber: o.orderNumber || o.id || '?',
                                    address: (o.address || o.addressGeo || 'no address').substring(0, 80),
                                    courier: o.courier || o.courierName || '',
                                    errorType: o._kmlRejected ? 'kml_rejected' : (o._geoFailed ? 'geo_stripped' : 'no_coords'),
                                    reason: o._kmlRejectedReason || o._geoFailedReason || 'Адрес не найден геокодером',
                                    kmlRejectedCoords: o._kmlRejectedCoords || null,
                                    windowKey: windowKey,
                                });
                                logger.warn(`[TurboCalculator]  NO COORDS: #${o.orderNumber || o.id} "${(o.address || '').substring(0, 50)}" courier=${o.courier || o.courierName} window=${windowKey}`);
                                return false;
                            }

                            if (allKmlZones.length > 0 && o._coordSource !== 'manual' && !o._isManual) {
                                const lat = o.coords?.lat || o.lat || o.latitude;
                                const lng = o.coords?.lng || o.lng || o.longitude;
                                const zone = this.findBestZoneForPoint(lat, lng);
                                if (!zone) {
                                    if (stats.courierStats[normName]) stats.courierStats[normName].geoErrors++;
                                    o._kmlRejected = true;
                                    o._kmlRejectedCoords = { lat, lng };
                                    o._kmlRejectedReason = `Coord (${lat.toFixed(4)},${lng.toFixed(4)}) is outside all active KML sectors — excluded from routing`;
                                    stats.uncalculatedOrders.push({
                                        orderNumber: o.orderNumber || o.id || '?',
                                        address: (o.address || o.addressGeo || 'no address').substring(0, 80),
                                        courier: o.courier || o.courierName || '',
                                        errorType: 'kml_rejected',
                                        reason: o._kmlRejectedReason,
                                        kmlRejectedCoords: { lat, lng },
                                        windowKey: windowKey,
                                    });
                                    logger.warn(`[TurboCalculator]  ZONE REJECT: #${o.orderNumber || o.id} (${lat.toFixed(4)},${lng.toFixed(4)}) outside all active sectors — excluded from route`);
                                    return false;
                                }
                            }

                            return true;
                        });
                        
                        logger.info(`[TurboCalculator-DIAGNOSTICS]  Блок ${windowKey} для ${normName}: дедуплицировано=${dedupedOrders.length}, валидных_заказов=${validOrders.length}`);

                        // v31.0: Сортировка заказов сначала по ФАКТИЧЕСКОМУ времени выполнения (Исполнен), затем по плановому времени доставки.
                        // Это делает рассчитанный км отражением реального маршрута курьера (порядок выполнения).
                        const getOrderSortKey = (o) => {
                            let timestampToParse = null;

                            // Приоритет 1: Если заказ выполнен, используем фактическое время завершения
                            const execTime = getExecutionTime(o);
                            if (execTime) timestampToParse = execTime;
                            // Приоритет 2: Временная метка передачи/доставки (заказ был в пути)
                            else if (o.handoverAt && typeof o.handoverAt === 'number') timestampToParse = o.handoverAt;
                            else if (o.statusTimings?.deliveringAt) timestampToParse = o.statusTimings.deliveringAt;

                            // Если у нас есть полная Unix-метка, конвертируем в минуты дня (соответствует контексту временного окна)
                            if (timestampToParse) {
                                const d = new Date(timestampToParse);
                                return d.getHours() * 60 + d.getMinutes();
                            }

                            // Приоритет 3: Плановое время (для ещё не доставленных заказов или при отсутствии отметок выполнения)
                            const time = o.deliverBy || o.plannedTime || o.deliveryTime;
                            if (!time || time === '00:00') return 9999;
                            const parts = String(time).split(':');
                            const minutesOfDay = parseInt(parts[0]) * 60 + parseInt(parts[1] || '0');
                            return minutesOfDay;
                        };

                        validOrders = validOrders.sort((a, b) => getOrderSortKey(a) - getOrderSortKey(b));

                        // Логирование режима сортировки для этого окна
                        const executedInWindow = validOrders.filter(o => getExecutionTime(o)).length;
                        if (executedInWindow > 0) {
                            logger.info(`[TurboCalculator]  [${windowKey}] ${executedInWindow}/${validOrders.length} orders sorted by execution time`);
                        }

                        if (validOrders.length < 1) {
                            logger.info(`[TurboCalculator]  No valid orders for ${normName} in block ${windowKey}`);
                            return;
                        }

                        if (this.io) {
                            const firstAddr = (validOrders[0].address || 'Unknown').split(',')[0];
                            stats.message = `Calculating: ${normName} → ${firstAddr} (${validOrders.length} orders)`;

                            // Принудительная отправка, чтобы троттлинг не скрывал км/прогресс во время быстрой маршрутизации
                            emitStatus(true);
                        }

                        let routeResult = null;
                        try {
                            routeResult = await this.calculateRoute(validOrders, cache.division_id, globalStartPoint, globalEndPoint);
                        } catch (routeErr) {
                            logger.warn(`[TurboCalculator]  calculateRoute failed for ${normName}: ${routeErr.message}`);
                        }

                        // v5.180: Применение 2-opt оптимизации, если маршрут рассчитан и имеет достаточно точек
                        // v7.0: Также включение неявного кругового старта/конца (когда склад не настроен)
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
                                    // v7.1: ПЕРЕУПОРЯДОЧЕНИЕ validOrders на основе оптимизированных индексов
                                    // optimized.points содержит { lat, lng, index }
                                    // Индексы 0..N соответствуют routePoints, которые соответствуют validOrders (смещение, если есть Start)
                                    const offset = globalStartPoint ? 1 : 0;
                                    const newOrders = [];
                                    
                                    // Извлечение заказов из оптимизированных точек (пропуская точки Start/End)
                                    optimized.points.forEach(p => {
                                        if (p.origIndex !== undefined) {
                                            // Точка была заказом
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
                                            logger.info(`[TurboCalculator]  2-opt improved route: ${(routeResult.distance / 1000).toFixed(2)}km -> ${(optimizedResult.distance / 1000).toFixed(2)}km`);
                                            routeResult = optimizedResult;
                                            validOrders = newOrders; // Обновление orders for storage
                                        }
                                    }
                                }
                            } catch (optErr) {
                                logger.warn(`[TurboCalculator]  2-opt optimization failed: ${optErr.message}`);
                            }
                        }

                        // 100% FAIL-SAFE: Если маршрутизатор полностью упал, создаем прямую линию, чтобы не потерять заказы!
                        if (!routeResult && validOrders.length > 0) {
                            logger.warn(`[TurboCalculator] OSRM fully failed for ${normName}. Synthesizing straight-line route to guarantee 100% inclusion.`);
                            let totalDist = 0;
                            const pts = [];
                            if (globalStartPoint) pts.push(globalStartPoint);
                            validOrders.forEach(o => { if (o.coords?.lat) pts.push(o.coords); });
                            if (globalEndPoint) pts.push(globalEndPoint);
                            
                            for (let i = 0; i < pts.length - 1; i++) {
                                totalDist += haversineDistance(pts[i].lat, pts[i].lng, pts[i+1].lat, pts[i+1].lng) * 1000;
                            }
                            // Добавим 30% штрафа за кривизну дорог
                            totalDist *= 1.3;
                            
                            routeResult = {
                                distance: totalDist,
                                duration: (totalDist / 1000) * 3, // ~3 мин на км
                                geometry: null,
                                engine: 'fallback_straightline',
                                waypoints: []
                            };
                        }

                        if (routeResult) {
                            logger.info(`[TurboCalculator-DIAGNOSTICS]  Результат маршрута найден для ${normName}. distance=${routeResult.distance}, валидных_заказов=${validOrders.length}`);
                            const timeBlockLabel = timeGroup.windowLabel;
                            const distanceKm = Math.round((routeResult.distance / 1000) * 100) / 100;

                            // v6.12: РАССЛАБЛЕННАЯ ПРОВЕРКА ЗДРАВОСТИ для городской доставки
                            // Если маршрут чрезвычайно длинный (>100км), это, вероятно, ошибка геокодирования (например, Харьков-Киев).
                            // Мы ИЗВЛЕКАЕМ плохой кэш, но НЕ отбрасываем маршрут! Мы хотим, чтобы пользователь видел 1100км
                            // в UI, чтобы визуально заметить ошибку и вручную исправить координаты.
                            const suspiciousKm = 100;
                            if (distanceKm > suspiciousKm) {
                                logger.error(`[TurboCalculator]  SUSPICIOUS ROUTE: ${normName} [${timeBlockLabel}] ${distanceKm}km for ${validOrders.length} order(s). Evicting cache to force re-geocode next run.`);
                                // Инвалидация записей геокэша для заказов этого блока, чтобы они были перегеокодированы в следующий раз
                                validOrders.forEach(o => {
                                    const addrKey = (o.address || o.addressGeo || '').toLowerCase().trim();
                                    if (addrKey) {
                                        this.geocache.delete(addrKey);
                                        const GeoCache2 = this.getModel('GeoCache');
                                        if (GeoCache2) GeoCache2.destroy({ where: { address_key: addrKey } }).catch(() => {});
                                    }
                                });
                                // Мы БОЛЬШЕ НЕ делаем `continue` здесь! Мы позволяем огромному маршруту быть добавленным в divisionRoutes, чтобы пользователь его видел!
                            }

                            // v6.11+: ДОПОЛНИТЕЛЬНАЯ ЗАЩИТА — проверка расстояния до стартовой точки для ВСЕХ заказов в блоке
                            if (globalStartPoint) {
                                for (const o of validOrders) {
                                    if (o.coords?.lat && o.coords?.lng) {
                                        const distToStart = haversineDistance(
                                            globalStartPoint.lat, globalStartPoint.lng,
                                            o.coords.lat, o.coords.lng
                                        );
                                        // v6.12: РАССЛАБЛЕННАЯ проверка расстояния до хаба
                                        // 40км по прямой покрывает всю агломерацию Киева включая пригороды
                                        if (distToStart > 40) {
                                            logger.error(`[TurboCalculator]  REJECTED: Order ${o.orderNumber} is ${distToStart.toFixed(1)}km straight-line from hub. Too far! Invalidating.`);
                                            const addrKey = (o.address || o.addressGeo || '').toLowerCase().trim();
                                            if (addrKey) {
                                                this.geocache.delete(addrKey);
                                                const GeoCache2 = this.getModel('GeoCache');
                                                if (GeoCache2) GeoCache2.destroy({ where: { address_key: addrKey } }).catch(() => {});
                                            }
                                            
                                            // ВМЕСТО ПРОПУСКА БЛОКА, МЫ ВОССТАНАВЛИВАЕМ КООРДИНАТУ НА ЦЕНТРОИД ЗОНЫ!
                                            // Это гарантирует, что "абсолютно все заказы" отображаются в маршруте
                                            // и не вызывают перепробег на 100 км.
                                            const foZone = o.kmlZone || o.deliveryZone || o.zone;
                                            if (foZone && this.zoneCentroids && this.zoneCentroids[foZone]) {
                                                o.coords = {
                                                    lat: this.zoneCentroids[foZone].lat,
                                                    lng: this.zoneCentroids[foZone].lng
                                                };
                                                logger.info(`[TurboCalculator]  Recovered absurd point for order ${o.orderNumber} using zone centroid ${foZone}`);
                                            } else {
                                                // Фоллбэк на хаб
                                                o.coords = { lat: globalStartPoint.lat, lng: globalStartPoint.lng };
                                                logger.info(`[TurboCalculator]  Recovered absurd point for order ${o.orderNumber} using HUB`);
                                            }
                                        }
                                    }
                                }
                            }
                            
                            logger.info(`[TurboCalculator-DIAGNOSTICS]  Пройдена проверка адекватности точек для ${normName}. Переход к очистке отмененных заказов`);


                            // v5.149+: Стабильная дедупликация по ID (для поддержки разделённых заказов)
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
                                    logger.warn(`[TurboCalculator]  Skipping duplicate ID: ${orderId}`);
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
                                    ttlEnd: o.ttlEnd || null,
                                });
                            });

                            if (uniqueRouteOrders.length < nonCancelledOrders.length) {
                                logger.warn(`[TurboCalculator]  Route deduplication: ${nonCancelledOrders.length} -> ${uniqueRouteOrders.length} orders`);
                                // Логирование номеров заказов-дубликатов
                                const orderNums = nonCancelledOrders.map(o => o.orderNumber).filter(Boolean);
                                const dupNums = orderNums.filter((n, i) => orderNums.indexOf(n) !== i);
                                if (dupNums.length > 0) {
                                    logger.warn(`[TurboCalculator]  Duplicate orderNumbers: ${[...new Set(dupNums)].join(', ')}`);
                                }
                            }

                            // v38.1: Стабильный ключ time_block = target_date + округлённый windowStart
                            // Это гарантирует, что ON CONFLICT правильно идентифицирует один и тот же маршрут между пересчётами
                            // даже если windowLabel изменится (например, "11:20 - 11:49" vs "11:20 - 11:50")
                            const PROXIMITY_MS = 45 * 60 * 1000; // v8.1: соответствует PROXIMITY_MINUTES в turboGroupingHelpers
                            const stableWindowKey = timeGroup.windowStart
                                ? Math.floor(timeGroup.windowStart / PROXIMITY_MS) * PROXIMITY_MS
                                : 0;
                            const stableTimeBlock = `${targetDateNorm || cache.target_date}_${normName}_${stableWindowKey}`;

                            const routeDataObj = {
                                target_date: targetDateNorm,
                                division_id: cache.division_id,
                                courier: normName,
                                deliveryWindow: timeBlockLabel,
                                timeBlocks: timeBlockLabel,
                                time_block: stableTimeBlock, // v38.1: STABLE KEY for ON CONFLICT matching
                                windowStart: timeGroup.windowStart,
                                startAddress: presets?.defaultStartAddress || null,
                                endAddress: presets?.defaultEndAddress || null,
                                startCoords: globalStartPoint,
                                endCoords: globalEndPoint || globalStartPoint,
                                isCircularRoute: !globalStartPoint && !globalEndPoint && uniqueRouteOrders.length > 0, 
                                geoMeta: { 
                                    origin: globalStartPoint,
                                    destination: globalEndPoint || globalStartPoint,
                                    waypoints: uniqueRouteOrders.map(o => o.coords).filter(Boolean)
                                },
                                orders: uniqueRouteOrders,
                                geometry: routeResult.geometry
                            };

                            const routeRepl = {
                                courier_id: normName,
                                division_id: String(cache.division_id),
                                total_distance: distanceKm,
                                total_duration: Math.round(routeResult.duration),
                                engine_used: routeResult.engine,
                                orders_count: uniqueRouteOrders.length,
                                calculated_at: new Date(),
                                route_data: JSON.stringify(routeDataObj),
                                time_block: stableTimeBlock
                            };

                            // Безопасный upsert, не зависящий от уникального индекса выражения БД.
                            let upsertResult = await sequelize.query(`
                                UPDATE calculated_routes
                                SET total_distance = :total_distance,
                                    total_duration = :total_duration,
                                    engine_used = :engine_used,
                                    orders_count = :orders_count,
                                    calculated_at = :calculated_at,
                                    route_data = :route_data,
                                    updated_at = NOW()
                                WHERE division_id = :division_id
                                  AND courier_id = :courier_id
                                  AND route_data->>'time_block' = :time_block
                                RETURNING *
                            `, {
                                replacements: routeRepl,
                                type: sequelize.QueryTypes.SELECT
                            });

                            if (!Array.isArray(upsertResult) || upsertResult.length === 0) {
                                upsertResult = await sequelize.query(`
                                    INSERT INTO calculated_routes 
                                    (courier_id, division_id, total_distance, total_duration, engine_used, orders_count, calculated_at, created_at, route_data)
                                    VALUES 
                                    (:courier_id, :division_id, :total_distance, :total_duration, :engine_used, :orders_count, :calculated_at, :calculated_at, :route_data)
                                    RETURNING *
                                `, {
                                    replacements: routeRepl,
                                    type: sequelize.QueryTypes.SELECT
                                });
                            }

                            // Sequelize может возвращать разные формы в зависимости от диалекта/QueryType:
                            // [row], [[row]], или сам объект row.
                            let createdRoute = upsertResult;
                            if (Array.isArray(createdRoute) && createdRoute.length > 0) {
                                createdRoute = createdRoute[0];
                                if (Array.isArray(createdRoute) && createdRoute.length > 0) {
                                    createdRoute = createdRoute[0];
                                }
                            }
                            if (!createdRoute || !createdRoute.id) {
                                throw new Error('Route upsert did not return created row');
                            }

                            // Ensure route_data is parsed (raw SQL may return string for JSONB in some pg driver versions)
                            let rd = createdRoute.route_data;
                            if (typeof rd === 'string') {
                                try { rd = JSON.parse(rd); } catch (e) { rd = {}; }
                            }

                            // v33: Немедленная вставка в кэш памяти!
                            matchedExistingRouteIds.add(createdRoute.id);
                            logger.info(`[TurboCalculator-DIAGNOSTICS]  Добавление маршрута ID ${createdRoute.id} в кэш фронтенда`);
                            inMemoryFrontendRoutes.push({
                                id: createdRoute.id,
                                courier: createdRoute.courier_id,
                                courier_id: createdRoute.courier_id,
                                totalDistance: parseFloat(createdRoute.total_distance || 0),
                                totalDuration: createdRoute.total_duration,
                                ordersCount: createdRoute.orders_count,
                                timeBlock: rd?.deliveryWindow || rd?.timeBlocks,
                                startAddress: rd?.startAddress,
                                endAddress: rd?.endAddress,
                                orders: (rd?.orders || []).map(o => ({
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
                                    ttlEnd: o.ttlEnd || null,
                                })),
                                isCalculated: true 
                            });

                            courierRoutesCreated++;
                            stats.totalRoutesCreated++;
                            markOrdersAsRouted(uniqueRouteOrders);
                            logger.info(`[TurboCalculator]  Создан маршрут для ${normName}: ${uniqueRouteOrders.length} orders, ${(routeResult.distance / 1000).toFixed(2)}km`);

                            // v6.7: Восстановление накопления расстояния + отправка статистики!
                            if (stats.courierStats[normName]) {
                                stats.courierStats[normName].distanceKm += (routeResult.distance || 0) / 1000;
                                stats.courierStats[normName].ordersInRoutes =
                                    (stats.courierStats[normName].ordersInRoutes || 0) + uniqueRouteOrders.length;
                            }
                            emitStatus(true);
                        }
                    } catch (e) {
                        logger.warn(`[TurboCalculator]  Routing error for ${normName} [${windowKey}]: ${e.message}`);
                        stats.skippedOther += orders.length;
                    }
                    })); // Конец push в routingTasks
                } // Конец цикла окон
            } // Конец цикла курьеров

            // v50: ПАРАЛЛЕЛЬНОЕ ВЫПОЛНЕНИЕ ВСЕХ ЗАДАЧ МАРШРУТИЗАЦИИ
            logger.info(`[TurboCalculator]  Ожидание ${routingTasks.length} параллельных задач маршрутизации...`);
            await Promise.all(routingTasks);
            logger.info(`[TurboCalculator]  Parallel routing complete.`);
            await yieldToEventLoop(); // Yield for health check

            // После завершения всех задач параллельно, обновляем глобальные статусы курьеров
            for (const normName of deliveryWindows.keys()) {
                if (targetCourier && normalizeCourierName(normName) !== normalizeCourierName(targetCourier)) {
                    continue;
                }
                if (!processedCourierNames.has(normName)) {
                    processedCourierNames.add(normName);
                }
            }
            stats.processedCouriers = processedCourierNames.size;
            stats.message = 'All active couriers calculated';
            emitStatus(true);
            await emitCurrentRoutes(true);

            // v36.9: По завершении processedCount ДОЛЖЕН достичь totalCount
            // Это гарантирует, что индикатор прогресса надёжно достигает 100% по окончании
            stats.processedCount = stats.totalCount;
            stats.isActive = false;
            stats.currentPhase = 'complete';
            stats.message = 'Calculation complete!';
            emitStatus(true); // v36.5: ПРИНУДИТЕЛЬНЫЙ финальный статус для сброса троттлинга

            // v38.2: Очистка устаревших маршрутов после каждого пересчёта
            // v38.3: Когда установлен targetCourier, очищаем только маршруты ЭТОГО курьера (не все)
            if (Route && cache.division_id) {
                try {
                    const cleanWhere = {
                        [Op.and]: sequelize.where(
                            sequelize.literal("route_data->>'target_date'"),
                            targetDateNorm || cache.target_date
                        )
                    };

                    if (targetCourier) {
                        const normTarget = normalizeCourierName(targetCourier);
                        cleanWhere['division_id'] = cache.division_id;
                        cleanWhere[Op.or] = [
                            { courier_id: normTarget },
                            { courier_id: { [Op.iLike]: `%${normTarget}%` } }
                        ];
                    } else {
                        cleanWhere['division_id'] = cache.division_id;
                    }

                    let deletedCount = 0;
                    if (matchedExistingRouteIds.size > 0 && !targetCourier) {
                        deletedCount = await Route.destroy({
                            where: {
                                division_id: cache.division_id,
                                id: { [Op.notIn]: Array.from(matchedExistingRouteIds) },
                                [Op.and]: sequelize.where(
                                    sequelize.literal("route_data->>'target_date'"),
                                    targetDateNorm || cache.target_date
                                )
                            }
                        });
                    } else {
                        deletedCount = await Route.destroy({ where: cleanWhere });
                    }
                    if (deletedCount > 0) {
                        logger.info(`[TurboCalculator]  Cleaned up ${deletedCount} stale routes for ${cache.division_id} on ${targetDateNorm}`);
                    }
                } catch (cleanErr) {
                    logger.warn(`[TurboCalculator]  Failed cleaning up stale routes: ${cleanErr.message}`);
                }
            }

            // v5.171: Получение ВСЕХ маршрутов (существующих + новых) для frontend
            // v7.5: Одноразовая отправка в конце, чтобы избежать потопа запросов
            // v36.9: Реактивные частичные обновления теперь включены — эта финальная отправка обеспечивает согласованность
            await emitCurrentRoutes(true); 


            // v29.0: Обогащение кэша — запись рассчитанных расстояний обратно в api_dashboard_cache
            // Сопоставление имён курьеров как по нормализованным (заглавные), так и по сырым для максимального охвата
            if (data && Array.isArray(data.orders)) {
                try {
                    if (data.couriers && Array.isArray(data.couriers)) {
                        // v34.2: Удаление 'НЕ НАЗНАЧЕНО' и 'ПО' из финального объекта DATA, отправляемого на frontend
                        // v5.180: Нормализация имён курьеров для ТОЧНОГО соответствия группировке frontend
                        data.couriers = data.couriers.map(c => {
                            const rawName = c.courierName || c.name || c.courier;
                            const norm = normalizeCourierName(rawName);
                            return {
                                ...c,
                                courierName: norm, // v5.180: Нормализованное имя, соответствующее frontend
                                name: norm,
                                courier: norm,
                            };
                        }).filter(c => {
                            const norm = (c.courierName || '').toUpperCase().trim();
                            return norm !== 'НЕ НАЗНАЧЕНО' && norm !== 'UNASSIGNED' && norm !== 'ПО' && norm !== '';
                        });

                        // v35.2: Еженедельная аналитика — расчёт активных дней и нормализованной эффективности
                        const DashboardCache = this.getModel('DashboardCache');
                        // v5.185: Использование null prototype для предотвращения коллизий с toString и т.д.
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
                                logger.warn(`[TurboCalculator]  Failed weekly activity calc: ${e.message}`);
                            }
                        }

                        data.couriers.forEach(c => {
                            const rawName = c.courierName || c.name || c.courier;
                            const upperName = (rawName || '').toString().toUpperCase().trim();
                            const normName2 = rawName ? normalizeCourierName(rawName) : null;

                            // Попытка всех вариантов ключей
                            const calc = stats.courierStats[upperName] ||
                                stats.courierStats[normName2] ||
                                stats.courierStats[rawName];

                            if (calc) {
                                c.distanceKm = Number((calc.distanceKm || 0).toFixed(2));
                                c.ordersInRoutes = calc.ordersInRoutes || 0; // Синхронизировано с EliteCourierCard
                                c.calculatedOrders = calc.orders || 0;       // Сохранение для интенсивности
                                c.courierType = calc.type || 'Car';

                                // v35.2: Обогащение еженедельной статистикой
                                const activeDays = weeklyActivity[normName2 || upperName]?.size || 1;
                                c.activeDaysWeek = activeDays;

                                // Эффективность: взвешенные заказы по активным дням для справедливого сравнения людей
                                // Интенсивность = Всего заказов / Активные дни
                                c.weeklyIntensity = Number((c.calculatedOrders / activeDays).toFixed(2));

                                logger.info(`[TurboCalculator]  Курьер ${rawName}: ${c.distanceKm} км, Тип: ${c.courierType}, Дней/Нед: ${activeDays}, Маршрутов: ${c.ordersInRoutes}/${c.calculatedOrders}`);
                            }
                        });
                        await yieldToEventLoop(); // Yield for health check
                    }

                    // v7.6 КРИТИЧНО: Синхронизация маршрутов и статистики обратно в payload дашборда ПЕРЕД сохранением
                    // vXX.X: Внедрение сохранённых ручных маршрутов
                    if (this._preservedManualRoutes && this._preservedManualRoutes.length > 0) {
                        for (const mr of this._preservedManualRoutes) {
                            const existingIdx = inMemoryFrontendRoutes.findIndex(r => String(r.id) === String(mr.id));
                            if (existingIdx === -1) {
                                inMemoryFrontendRoutes.push({
                                    id: mr.id,
                                    courier: mr.courier_id,
                                    courier_id: mr.courier_id,
                                    totalDistance: parseFloat(mr.total_distance || 0),
                                    totalDuration: mr.total_duration,
                                    ordersCount: mr.orders_count,
                                    orders: (mr.route_data?.orders || []).map(o => ({
                                        id: o.id,
                                        orderNumber: o.orderNumber,
                                        address: o.address || 'Адрес не указан',
                                        courier: o.courier || mr.courier_id,
                                        coords: o.coords || (o.lat && o.lng ? { lat: o.lat, lng: o.lng } : null),
                                        lat: o.lat || o.coords?.lat,
                                        lng: o.lng || o.coords?.lng
                                    })),
                                    route_data: mr.route_data,
                                    geometry: mr.route_data?.geometry,
                                    isOptimized: true,
                                    isTurboRoute: true,
                                    isManuallyAdjusted: true,
                                    _manualModified: true
                                });
                                logger.info(`[TurboCalculator]  Injected preserved manual route ${mr.id} for ${mr.courier_id}`);
                            }
                        }
                        this._preservedManualRoutes = [];
                    }
                    data.routes = inMemoryFrontendRoutes || [];
                    
                    if (!data.statistics) data.statistics = {};
                    data.statistics.totalOrders = data.orders.length;
                    data.statistics.deliveryCount = data.orders.length;
                    data.statistics.totalAmount = data.orders.reduce((sum, o) => sum + (o.amount || 0), 0);
                    data.statistics.successfulGeocoding = (data.orders || []).filter(o => o.coords?.lat).length;
                    data.statistics.failedGeocoding = (data.orders || []).filter(o => !o.coords?.lat).length;
                    data.statistics.totalRoutes = (inMemoryFrontendRoutes || []).length;
                    data.statistics.ordersInRoutes = (inMemoryFrontendRoutes || []).reduce((acc, r) => acc + (r.orders_count || 0), 0);

                    data.lastModified = Date.now();
                    data.source = 'turbo_robot';
                    await yieldToEventLoop(); // Yield for health check before DB update

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
                    logger.info(`[TurboCalculator]  Кэш обогащен: ${cacheKey}, ${stats.processedCouriers} couriers, ${stats.totalRoutesCreated} routes`);

                    // v37.0: Финальный сигнал завершения
                    stats.isActive = false;
                    stats.currentPhase = 'complete';
                    stats.message = 'Calculation complete';
                    stats.processedCount = stats.totalCount;
                    emitStatus(true);

                    // v7.5: ФИНАЛЬНАЯ ОТПРАВКА после того, как всё сохранено и стабильно
                    await emitCurrentRoutes();
                } catch (saveErr) {
                    logger.error(`[TurboCalculator]  Failed to enrich cache: ${saveErr.message}`);
                }
            }

            // Финальная отправка статуса — маршрутизация завершена!
            stats.currentPhase = 'complete';
            // v36.9: Принудительно 100% — processedCount должен равняться totalCount
            stats.processedCount = stats.totalCount;
            const totalResultCount = inMemoryFrontendRoutes.length;
            const existingCount = matchedExistingRouteIds.size;
            const newlyCreated = stats.totalRoutesCreated;
            stats.message = `Complete! ${totalResultCount} routes (${newlyCreated > 0 ? `${newlyCreated} new, ` : ''}${existingCount} cached)`;
            stats.isActive = false;
            emitStatus(true);
            logger.info(`[TurboCalculator]  DONE: ${totalResultCount} total routes (${newlyCreated} new + ${existingCount} cached), ${stats.processedCouriers} couriers`);

            // v6.11: Запись временной метки завершения для логики ожидания
            this.lastCalculatedAt.set(String(cache.division_id), Date.now());
            logger.info(`[TurboCalculator] ⏱ Division ${cache.division_id} запущена пауза — следующий перерасчет через 3 minutes (или при поступлении новых данных)`);

        } catch (err) {
            logger.error(`[OrderCalculator]  processCache fatal: ${err.message}`);
            // v7.9: Остановка ожидания UI даже при фатальной ошибке
            if (typeof stats !== 'undefined') {
                stats.isActive = false;
                stats.message = `Fatal error: ${err.message}`;
                if (typeof emitStatus === 'function') emitStatus(true);
            }
        }
    }


    async getRobustGeocode(address, city = 'Київ', expectedZoneName = null, allZones = [], deepRecovery = false) {
        if (!address) return null;

        const GeoCache = this.getModel('GeoCache');
        if (!GeoCache) return null;

        const cleaned = cleanAddress(address);
        const normalized = cleaned.toLowerCase();

        // v31.1: Ядро валидации KML
        let targetZoneName = null;
        if (expectedZoneName) {
            targetZoneName = expectedZoneName.replace(/FO\/KML:\s*/i, '').trim();
        }

        // v5.172: Использование пространственного сеточного индекса для быстрой валидации + запасной вариант по нескольким зонам
        const validateCandidate = (lat, lng) => {
            if (!lat || !lng) return false;

            // Если ожидаемой зоны нет, принимаем любую точку
            if (!targetZoneName) return true;

            // Использование предварительно загруженной пространственной сетки для поиска за O(1)
            const validation = this.validatePointInZone(lat, lng, targetZoneName, true);

            if (validation.valid) {
                if (validation.fallback) {
                    logger.info(`[TurboCalculator] ℹ Point ${lat},${lng} in zone "${validation.zone.name}" (fallback from "${targetZoneName}")`);
                }
                return true;
            } else {
                logger.warn(`[TurboCalculator]  Rejected: Point ${lat},${lng} is ${validation.reason || 'outside expected KML zone'}!`);
                return false;
            }
        };

        // Проверка local cache first (fastest)
        try {
            const cached = await GeoCache.findOne({
                where: { address_key: normalized }
            });
            if (cached) {
                if (!cached.is_success) return null;
                if (validateCandidate(cached.lat, cached.lng)) {
                    return { latitude: cached.lat, longitude: cached.lng, locationType: 'CACHED' };
                } else {
                    logger.warn(`[TurboCalculator]  Ignored DB cache for ${normalized} (fell outside KML)`);
                }
            }
        } catch (e) { /* ignore */ }

        // v5.180: Проверка кэша LRU в памяти с нечётким совпадением
        const fuzzyResult = this.fuzzyCacheLookup(normalized);
        if (fuzzyResult && fuzzyResult.match) {
            const cached = fuzzyResult.match;
            if (cached && validateCandidate(cached.latitude, cached.longitude)) {
                logger.info(`[TurboCalculator]  LRU cache hit (${fuzzyResult.type}): ${normalized}`);
                return { latitude: cached.latitude, longitude: cached.longitude, locationType: 'CACHED_LRU' };
            }
        }

        // Попытка всех вариантов из кэша
        const variants = generateVariants(address, city, 10).map(v => v.toLowerCase());
        for (const variant of variants) {
            if (variant === normalized) continue;
            try {
                const cached = await GeoCache.findOne({
                    where: { address_key: variant, is_success: true }
                });
                if (cached && validateCandidate(cached.lat, cached.lng)) {
                    // v5.180: Также заполнение LRU кэша
                    this.geocache.set(normalized, { latitude: cached.lat, longitude: cached.lng });
                    return { latitude: cached.lat, longitude: cached.lng, locationType: 'CACHED' };
                }
            } catch (e) { /* ignore */ }
        }

        // v5.180: Улучшенный validateCandidate с запасным вариантом расстояния
        const validateCandidateWithFallback = (lat, lng) => {
            if (!lat || !lng) return { valid: false, reason: 'no_coords' };

            if (!targetZoneName) return { valid: true };

            const validation = this.validatePointInZone(lat, lng, targetZoneName, true);

            if (validation.valid) {
                return { valid: true, zone: validation.zone, fallback: validation.fallback };
            }

            // v5.180: Запасной вариант по расстоянию — поиск ближайшей зоны в пределах 500м
            const nearestZone = this.findNearestZone(lat, lng, 500);
            if (nearestZone) {
                logger.info(`[TurboCalculator]  Distance fallback: ${lat},${lng} is ${nearestZone.distanceMeters}m from zone "${nearestZone.name}"`);
                return { valid: true, zone: nearestZone, distanceFallback: true };
            }

            return { valid: false, reason: validation.reason || 'outside_all_zones' };
        };

        // v5.170: Параллельная гонка провайдеров — быстрейший провайдер побеждает!
        const tryGeocode = async (query, provider, timeout) => {
            const googleKey = process.env.GOOGLE_GEOCODE_API_KEY;

            if (provider === 'google' && googleKey) {
                const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${googleKey}&language=uk`;
                const googleRes = await axios.get(googleUrl, { timeout, proxy: false });
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
                const photonRes = await axios.get(`${PHOTON_URL}/api?q=${encodeURIComponent(query)}&limit=1&lang=uk`, { timeout, proxy: false });
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
                const photon2Res = await axios.get(`https://photon.komoot.io/api?q=${encodeURIComponent(query)}&limit=1&lang=uk`, { timeout, proxy: false });
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
                    proxy: false,
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

        // v36.7: Google строго запрещён по запросу пользователя. Используем только OSM-провайдеров.
        const primaryProviders = ['photon', 'komoot', 'nominatim'];

        // v5.180: Обёртка повторных попыток с экспоненциальной задержкой
        const tryGeocodeWithRetry = async (query, provider, timeout) => {
            return pRetry(() => tryGeocode(query, provider, timeout), {
                retries: 2,
                minTimeout: 1000,
                maxTimeout: 3000,
                factor: 2,
                onFailedAttempt: error => {
                    // logger.warn(`[TurboCalculator]  ${provider} attempt ${error.attemptNumber} failed: ${error.message}`);
                }
            });
        };

        // v5.186: НОВОЕ ШИРОКОСПЕКТРАЛЬНОЕ ГЕОКОДИРОВАНИЕ v2.0
        // Instead of one query, we try the prioritized variants from our addressUtils
        const apiVariants = generateVariants(address, city, 5); 
        
        // v6.13: Многоступенчатая логика: если deepRecovery false, пробуем ТОЛЬКО первый (самый чистый) вариант.
        // Это предотвращает массовые запросы к API для свежих филиалов.
        const variantsToTry = deepRecovery ? apiVariants : [apiVariants[0]];
        logger.info(`[TurboCalculator]  Geocoding "${address}" with ${variantsToTry.length} variants (deep: ${deepRecovery})...`);

        for (let i = 0; i < variantsToTry.length; i++) {
            const query = variantsToTry[i];
            try {
                // Попытка текущего варианта на всех провайдерах параллельно
                const result = await Promise.any(
                    primaryProviders.map(p => tryGeocodeWithRetry(query, p, 5000))
                );
                
                if (result) {
                    logger.info(`[TurboCalculator]    Success for variant "${query}" via ${result.provider}`);
                    await cacheResult(result, result.provider);
                    this.geocache.set(normalized, { latitude: result.latitude, longitude: result.longitude });
                    return result;
                }
            } catch (err) {
                // Этот вариант не удался на всех провайдерах, пробуем следующий
            }
        }

        // v6.12: УСТАРЕВШИЕ ЗАПАСНЫЕ СТРАТЕГИИ (если все основные варианты не удались)
        // Запускать только если deepRecovery активен
        if (deepRecovery) {
            const fallbackStrategies = [];

            // Стратегия 1: Удаление номера дома (если ещё не пробовано generateVariants)
            const noHouse = cleaned.replace(/\b\d+[а-яА-Яa-zA-ZіІєЄґґ]*(?:[\/\-]\d*)?\b/g, '').trim();
            if (noHouse && !variantsToTry.includes(noHouse + ', ' + city)) {
                fallbackStrategies.push({ query: noHouse + ', ' + city, strategy: 'no-house' });
            }

            // Стратегия 2: Глубокое упрощение (всё до запятой/общих комментариев)
            const splitByComma = cleaned.split(',')[0].trim();
            if (splitByComma && splitByComma.length > 5 && !variantsToTry.includes(splitByComma + ', ' + city)) {
                 fallbackStrategies.push({ query: splitByComma + ', ' + city, strategy: 'before-comma' });
            }

            for (const fb of fallbackStrategies) {
                try {
                    const result = await Promise.any(
                        primaryProviders.map(p => tryGeocode(fb.query, p, 4000))
                    );
                    logger.info(`[TurboCalculator]    Fallback success (${fb.strategy}) via ${result.provider}`);
                    await cacheResult(result, result.provider);
                    return result;
                } catch (e) { }
            }
        }

        logger.warn(`[TurboCalculator]  All geocoding strategies failed for: ${address}`);
        return null;
    }

    parseAddressGeo(addressGeo) {
        if (!addressGeo) return null;
        try {
            const latMatch = addressGeo.match(/Lat\s*=\s*"?([^"\s]+)"?/);
            const lngMatch = addressGeo.match(/Long\s*=\s*"?([^"\s]+)"?/);
            const cityMatch = addressGeo.match(/CityName\s*=\s*"([^"]+)"/);
            if (latMatch && lngMatch) {
                const lat = parseFloat(latMatch[1]);
                const lng = parseFloat(lngMatch[1]);
                if (!isNaN(lat) && !isNaN(lng) && lat > 0 && lng > 0) {
                    const result = { lat, lng };
                    if (cityMatch) result.city = cityMatch[1];
                    return result;
                }
            }
        } catch (e) {
            // ignore parse errors
        }
        return null;
    }

    /**
     * Haversine chain (start → orders → end) with road-ish factor when graph routing cannot build ≥2 points.
     */
    estimateRouteChainMeters(orders, startPoint = null, endPoint = null) {
        const pts = [];
        if (startPoint && startPoint.lat != null && startPoint.lng != null) {
            pts.push({ lat: Number(startPoint.lat), lng: Number(startPoint.lng) });
        }
        (orders || []).forEach(o => {
            const lat = Number(o.coords?.lat || o.lat);
            const lng = Number(o.coords?.lng || o.lng);
            if (lat && lng) pts.push({ lat, lng });
        });
        if (endPoint && endPoint.lat != null && endPoint.lng != null) {
            const elat = Number(endPoint.lat);
            const elng = Number(endPoint.lng);
            const last = pts[pts.length - 1];
            if (!last || last.lat !== elat || last.lng !== elng) {
                pts.push({ lat: elat, lng: elng });
            }
        }
        if (pts.length < 2) return 0;
        let total = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            total += this.calculateDistance(pts[i], pts[i + 1]);
        }
        const factor = total > 5000 ? 1.4 : 1.3;
        return total * factor;
    }

    async calculateRoute(orders, divisionId = null, startPoint = null, endPoint = null) {
        if (orders.length < 1) {
            return null;
        }

        // v25.0: Загрузка пресетов, специфичных для филиала
        const presets = divisionId ? await this.getDivisionPresets(divisionId) : null;
        const customOsrmUrl = presets?.osrmUrl || presets?.yapikoOsrmUrl;
        const customValhallaUrl = presets?.valhallaUrl || presets?.vhvUrl;
        const customPhotonUrl = presets?.photonUrl;

        // Построение массива точек: старт -> адреса заказов -> конец
        const points = [];

        // v7.0: ИСПРАВЛЕНИЕ КРУГОВОГО МАРШРУТА — когда склад (start/end) не настроен, но есть
        // несколько остановок, используем адрес первого заказа как НЕЯВНЫЙ старт/конец для формирования
        // кругового маршрута: first_stop → all_stops → first_stop.
        // Это стандартный логистический подход, когда склад не определён, и даёт
        // гораздо более реалистичное общее расстояние, чем просто измерение A→B между остановками.
        // v7.2: Согласованность склада — если указана только одна точка склада, используем её и для старта, и для конца
        // чтобы гарантировать расчёт кругового маршрута от базы при установке единственной координаты хаба.
        const hasDepot = !!(startPoint || endPoint);
        let effectiveStart = startPoint;
        let effectiveEnd = endPoint;

        if (startPoint && !endPoint) effectiveEnd = startPoint;
        if (!startPoint && endPoint) effectiveStart = endPoint;

        if (!hasDepot && orders.length >= 1) {
            let batchCityName = null;
            for (const o of orders) {
                batchCityName = o.city || o.CityName || o.cityName || o.divisionName;
                if (!batchCityName && o.addressGeo) {
                    const match = o.addressGeo.match(/CityName\s*=\s*"([^"]+)"/);
                    if (match) batchCityName = match[1];
                }
                if (batchCityName) break;
            }
            const cityName = presets?.cityBias || batchCityName || 'Харків';
            const cityCentroid = this.getCityCentroid(cityName);

            const firstWithCoords = orders.find(o =>
                (o.coords?.lat && o.coords?.lng) || (o.lat && o.lng)
            );

            // v42.3: Fix 0km bug! If there is ONLY ONE ORDER, using the order as its own start/end creates a 0km route!
            // We MUST use the city centroid to approximate travel from base.
            // If > 1 orders, we preserve the legacy "circular route via first stop" behavior if desired,
            // OR we can just use cityCentroid. Let's use cityCentroid for 1 order, and firstWithCoords for >1.
            if (orders.length > 1 && firstWithCoords) {
                const implLat = Number(firstWithCoords.coords?.lat || firstWithCoords.lat);
                const implLng = Number(firstWithCoords.coords?.lng || firstWithCoords.lng);
                effectiveStart = { lat: implLat, lng: implLng, isImplicit: true };
                effectiveEnd   = { lat: implLat, lng: implLng, isImplicit: true };
                logger.info(`[TurboCalculator]  No depot — circular route via first stop (${implLat.toFixed(5)}, ${implLng.toFixed(5)})`);
            } else if (cityCentroid) {
                effectiveStart = { lat: cityCentroid.lat, lng: cityCentroid.lng, isVirtual: true };
                effectiveEnd   = { lat: cityCentroid.lat, lng: cityCentroid.lng, isVirtual: true };
                logger.info(`[TurboCalculator]  No depot (1 order) — using virtual city hub for ${cityName} (${cityCentroid.lat.toFixed(5)}, ${cityCentroid.lng.toFixed(5)})`);
            }
        }

        // Добавление стартовой точки, если указана (реальный склад ИЛИ неявный)
        if (effectiveStart) {
            points.push({ lat: Number(effectiveStart.lat), lng: Number(effectiveStart.lng), type: effectiveStart.isImplicit ? 'implicit-start' : 'start' });
        }

        // Добавление каждой остановки заказа по порядку. НЕ дедуплицировать последовательные одинаковые координаты:
        // дедупликация схлопнула маршруты с несколькими доставками в одно здание до одной точки и дала 0 км в UI.
        orders.forEach(o => {
            const lat = Number(o.coords?.lat || o.lat);
            const lng = Number(o.coords?.lng || o.lng);
            if (lat && lng) {
                points.push({ lat, lng, type: 'order' });
            }
        });

        // Добавление конечной точки, если указана (реальный склад ИЛИ неявный) и не совпадает с последней точкой
        let lastCoordKey = points.length
            ? `${Number(points[points.length - 1].lat).toFixed(5)},${Number(points[points.length - 1].lng).toFixed(5)}`
            : null;
        if (effectiveEnd) {
            const lat = Number(effectiveEnd.lat);
            const lng = Number(effectiveEnd.lng);
            const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
            if (key !== lastCoordKey) {
                points.push({ lat, lng, type: effectiveEnd.isImplicit ? 'implicit-end' : 'end' });
            }
        }

        // Нужно как минимум 2 точки для OSRM/Valhalla; иначе оцениваем цепочечное расстояние (склад + остановки)
        if (points.length < 2) {
            const chainM = this.estimateRouteChainMeters(orders, startPoint, endPoint);
            if (chainM > 0) {
                const avgSpeedKmH = chainM > 10000 ? 35 : 25;
                return {
                    distance: chainM,
                    duration: (chainM / 1000) / avgSpeedKmH * 3600,
                    geometry: '',
                    feasible: true,
                    engine: 'straight-line-fallback'
                };
            }
            return {
                distance: 0,
                duration: 0,
                geometry: '',
                feasible: true,
                engine: 'implicit'
            };
        }

        const coordsStr = points.map(p => `${p.lng.toFixed(7)},${p.lat.toFixed(7)}`).join(';');
        const routeModeStr = (effectiveStart?.isImplicit || effectiveEnd?.isImplicit) ? ' circular/no-depot' : ' depot';
        logger.info(`[TurboCalculator]  [${routeModeStr}] Маршрут: ${points.length} точек, заказов: ${orders.length}, путь: ${coordsStr.slice(0, 60)}...`);

        // Предупреждение об огромном расстоянии база-база только если используются РЕАЛЬНЫЕ (не неявные) точки склада
        if (effectiveStart && effectiveEnd && !effectiveStart.isImplicit && !effectiveEnd.isImplicit) {
            const distHaversine = haversineKm(effectiveStart.lat, effectiveStart.lng, effectiveEnd.lat, effectiveEnd.lng);
            if (distHaversine > 100) { // Проверка > 100km
                logger.warn(`[TurboCalculator]  Base-to-Base distance is huge (${distHaversine.toFixed(1)}km). Check settings!`);
            }
        }

        const isEngineBlocked = (name) => {
            const s = this.engineFailures.get(name);
            return !!(s && s.blockedUntil && Date.now() < s.blockedUntil);
        };
        const markEngineSuccess = (name) => {
            this.engineFailures.delete(name);
            const prev = this.routingHealth.get(name) || { ok: 0, fail: 0, lastError: null, lastStatus: null, lastMs: null };
            prev.ok += 1;
            prev.lastError = null;
            this.routingHealth.set(name, prev);
        };
        const markEngineFailure = (name, err) => {
            const prev = this.engineFailures.get(name) || { failures: 0, blockedUntil: 0 };
            const failures = (prev.failures || 0) + 1;
            const status = Number(err?.response?.status || 0);
            let blockedUntil = prev.blockedUntil || 0;
            if (status === 401 || status === 403 || status === 404 || failures >= this.ENGINE_FAIL_THRESHOLD) {
                blockedUntil = Date.now() + this.ENGINE_BLOCK_MS;
            }
            this.engineFailures.set(name, { failures, blockedUntil });

            const h = this.routingHealth.get(name) || { ok: 0, fail: 0, lastError: null, lastStatus: null, lastMs: null };
            h.fail += 1;
            h.lastStatus = status || null;
            h.lastError = err?.code || err?.message || 'ERR';
            this.routingHealth.set(name, h);
        };

        // v2.2: Multi-engine — self-host OSRM/Valhalla when probe says healthy, then remote/public (soft fallback)
        const hProbe = selfHostRoutingHealth.getState();
        const remoteOsrmBase = (customOsrmUrl || this.remoteOsrmUrl || this.osrmUrl).trim().replace(/\/+$/, '');
        const remoteValhallaBase = (customValhallaUrl || this.remoteValhallaUrl).trim().replace(/\/+$/, '');

        const useSelfOsrm = this.useDualOsrm && !customOsrmUrl && hProbe.osrmLocal === true;
        const useSelfValhalla = this.useDualValhalla && !customValhallaUrl && hProbe.valhallaLocal === true;

        const engines = [];

        const checkFastFail = (err) => {
            if (err.code && ['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET'].includes(err.code)) {
                throw new pRetry.AbortError(err);
            }
            if (err.message && err.message.includes('timeout')) {
                throw new pRetry.AbortError(err);
            }
            throw err;
        };

        const osrmEngine = (name, baseUrl, engineTag, priority) => ({
            name,
            priority,
            calculate: async () => {
                const baseUrlT = String(baseUrl || '').trim().replace(/\/+$/, '');
                const url = `${baseUrlT}/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
                const response = await pRetry(
                    () => axios.get(url, { 
                        timeout: 4000, 
                        proxy: false,
                        headers: {
                            'User-Agent': 'KillMetraj_DeliveryApp/2.0 (contact@killmetraj.ua)',
                            'Referer': 'https://killmetraj.ua/'
                        }
                    }).catch(checkFastFail),
                    { retries: 1, minTimeout: 500, factor: 2 }
                );
                if (response.data?.routes?.[0]) {
                    const r = response.data.routes[0];
                    if (r.distance > 5000000) return null;
                    return {
                        distance: r.distance,
                        duration: r.duration,
                        geometry: r.geometry,
                        engine: engineTag
                    };
                }
                return null;
            }
        });

        const valhallaEngine = (name, vUrl, engineTag, priority) => ({
            name,
            priority,
            calculate: async () => {
                const base = String(vUrl || '').trim().replace(/\/+$/, '');
                const request = {
                    locations: points.map(p => ({ lat: p.lat, lon: p.lng })),
                    costing: 'auto',
                    directions_options: { units: 'kilometers' }
                };
                const response = await pRetry(
                    () => axios.post(`${base}/route`, request, {
                        timeout: 5000,
                        proxy: false,
                        headers: { 
                            'Content-Type': 'application/json',
                            'User-Agent': 'KillMetraj_DeliveryApp/2.0 (contact@killmetraj.ua)',
                            'Referer': 'https://killmetraj.ua/'
                        }
                    }).catch(checkFastFail),
                    { retries: 1, minTimeout: 500, factor: 2 }
                );
                if (response.data?.trip?.summary) {
                    const trip = response.data.trip;
                    const totalDistanceMeters = trip.summary.length * 1000;
                    const totalDurationSeconds = trip.summary.time;
                    if (totalDistanceMeters > 5000000) return null;
                    logger.info(`[TurboCalculator]  Valhalla result: ${trip.summary.length.toFixed(2)} km, ${totalDurationSeconds} sec`);
                    return {
                        distance: totalDistanceMeters,
                        duration: totalDurationSeconds,
                        geometry: this.decodeValhallaPath(trip.legs),
                        engine: engineTag
                    };
                }
                return null;
            }
        });

        // v7.5: Порядок приоритета — Yapiko OSRM ВСЕГДА ПЕРВЫЙ, затем self-osrm, затем remote, затем Valhalla, Photon, public
        if (customOsrmUrl) {
            engines.push(osrmEngine('yapiko-osrm', customOsrmUrl, 'yapiko-osrm', 0));
        } else {
            engines.push(osrmEngine('yapiko-osrm', this.yapikoOsrmUrl, 'yapiko-osrm', 0));
        }

        if (useSelfOsrm && !customOsrmUrl) {
            engines.push(osrmEngine('self-osrm', this.selfOsrmUrl, 'self-osrm', 1));
        }

        if (!customOsrmUrl) {
            engines.push(osrmEngine('remote-osrm', remoteOsrmBase, 'remote-osrm', 2));
        }

        if (this.valhallaSingleUrl && !customValhallaUrl) {
            engines.push(valhallaEngine('valhalla', this.valhallaSingleUrl, 'valhalla', 2));
        } else if (customValhallaUrl) {
            engines.push(valhallaEngine('valhalla', customValhallaUrl, 'valhalla', 2));
        } else if (useSelfValhalla) {
            engines.push(valhallaEngine('self-valhalla', this.selfValhallaUrl, 'self-valhalla', 2));
            engines.push(valhallaEngine('valhalla', remoteValhallaBase, 'valhalla', 3));
        } else {
            engines.push(valhallaEngine('valhalla', remoteValhallaBase, 'valhalla', 2));
        }

        engines.push(
            osrmEngine('osrm-public', 'https://router.project-osrm.org', 'osrm-public', 5),
            osrmEngine('osrm-de', 'https://routing.openstreetmap.de/routed-car', 'osrm-de', 6),
            osrmEngine('osrm-ch', 'https://routing.infomaniak.com/osrm', 'osrm-ch', 7),
            osrmEngine('osrm-kumi', 'https://osrm.kumi.systems', 'osrm-kumi', 8),
            osrmEngine('osrm-fr', 'https://router.openstreetmap.fr', 'osrm-fr', 9)
        );

        engines.sort((a, b) => a.priority - b.priority);

        // Попытка движков по порядку, возврат первого успешного
        for (const engine of engines) {
            if (isEngineBlocked(engine.name)) {
                continue;
            }
            try {
                const t0 = Date.now();
                const result = await engine.calculate();
                if (result && result.distance > 0) {
                    markEngineSuccess(engine.name);
                    const h = this.routingHealth.get(engine.name);
                    if (h) {
                        h.lastMs = Date.now() - t0;
                        this.routingHealth.set(engine.name, h);
                    }
                    logger.info(`[OrderCalculator]  Маршрут рассчитан через ${engine.name}: ${(result.distance / 1000).toFixed(2)} km, ${Math.round(result.duration / 60)} min`);
                    return result;
                }
            } catch (err) {
                markEngineFailure(engine.name, err);
                logger.warn(`[OrderCalculator]  ${engine.name} failed: ${err.message}`);
            }
        }

        // Попытка Google Routes API как дополнительный запасной вариант
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
                    proxy: false,
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
                logger.warn(`[OrderCalculator]  Google Routes failed: ${e.message}`);
            }
        }

        // Запасной вариант: умное расстояние по прямой с лучшей оценкой
        logger.warn(`[OrderCalculator]  All engines failed, using smart fallback`);
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
     * v7.2: Utility to get the center of a city if no depot is configured.
     * Prevents 0.0 km routes for single-order windows.
     */
    getCityCentroid(cityName) {
        if (!cityName) return null;
        const norm = cityName.toLowerCase().trim();
        
        const CITY_BOUNDS = {
            'харків': { lat: 49.98, lng: 36.27 },
            'харьков': { lat: 49.98, lng: 36.27 },
            'київ': { lat: 50.45, lng: 30.52 },
            'киев': { lat: 50.45, lng: 30.52 },
            'дніпро': { lat: 48.46, lng: 35.04 },
            'днепр': { lat: 48.46, lng: 35.04 },
            'одеса': { lat: 46.48, lng: 30.72 },
            'одесса': { lat: 46.48, lng: 30.72 },
            'львів': { lat: 49.84, lng: 24.02 },
            'полтава': { lat: 49.58, lng: 34.55 }
        };
        
        // Попытка точного совпадения или частичного (для названий филиалов типа "Київ - Правий")
        for (const [key, center] of Object.entries(CITY_BOUNDS)) {
            if (norm.includes(key)) return center;
        }
        return null;
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

            let isGlobalFallback = false;
            let user = await User.findOne({ where: { divisionId: String(divisionId), role: 'admin' } })
                || await User.findOne({ where: { divisionId: String(divisionId) } });

            if (!user) {
                isGlobalFallback = true;
                // v42.2: Ensure we pick the REAL global admin (username 'admin' or division 'all') instead of an empty admin profile
                user = await User.findOne({ where: { role: 'admin', username: 'admin' } })
                    || await User.findOne({ where: { role: 'admin', divisionId: 'all' } })
                    || await User.findOne({ where: { role: 'admin' }, order: [['id', 'DESC']] });
            }

            if (!user) return null;

            const preset = await UserPreset.findOne({ where: { userId: user.id } });
            if (!preset) return null;

            // v42.4: SPATIAL ISOLATION RESTORED!
            // When falling back to the global admin, DO NOT inherit the global admin's spatial data (Kyiv hub/zones)
            // for regional divisions. Otherwise, Odessa orders get routed from Kyiv (900+ km)!
            if (isGlobalFallback && preset.settings) {
                const safeSettings = { ...preset.settings };
                delete safeSettings.selectedZones;
                delete safeSettings.kmlData;
                delete safeSettings.defaultStartLat;
                delete safeSettings.defaultStartLng;
                delete safeSettings.defaultEndLat;
                delete safeSettings.defaultEndLng;
                delete safeSettings.defaultStartAddress;
                delete safeSettings.defaultEndAddress;
                delete safeSettings.cityBias;
                return safeSettings;
            }

            return preset.settings;
        } catch (error) {
            logger.warn(`[OrderCalculator]  Failed to fetch presets for division ${divisionId}:`, error.message);
            return null;
        }
    }

    /**
     * Calculate distance between two points (Haversine formula)
     */
    calculateDistance(p1, p2) {
        const R = 6371000; // Радиус Земли в метрах
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

        // Клонирование точек для избежания мутации оригинала
        let route = points.map(p => ({ ...p }));

        // Вычисление initial total distance
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
                    // Создание new route with segment i..j reversed
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

            // Если в этой итерации нет улучшений, мы сошлись
            if (!iterationImproved) break;
        }

        const initialDistance = calcTotalDistance(points);
        const savingsPct = initialDistance > 0 ? ((initialDistance - bestDistance) / initialDistance * 100) : 0;

        if (improved) {
            logger.info(`[TurboCalculator]  2-opt: ${initialDistance.toFixed(0)}m -> ${bestDistance.toFixed(0)}m (${savingsPct.toFixed(1)}% savings)`);
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
            logger.warn(`[TurboCalculator]  Failed to decode Valhalla path`, e.message);
        }
        return null;
    }
}

// v28.5: Экспорт экземпляра для simple_server.js / start_turbo.js
module.exports = new OrderCalculator();
