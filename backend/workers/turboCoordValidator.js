'use strict';

/**
 * turboCoordValidator.js — v1.0 SMART COORDINATE VALIDATOR + DISTANCE OPTIMIZER
 *
 * Uses all available data sources in priority order:
 *   P1. FO API addressGeo (Lat/Long from FO server — most accurate, free, instant)
 *   P2. FO API deliveryZone → matched against KML zones (zone centroid as hint)
 *   P3. KML point-in-polygon validation (O(1) with spatial grid)
 *   P4. Cross-order consistency check (anomaly detection via delivery zone centroid)
 *   P5. OSRM snap-to-road (fixes coords that are on pedestrian areas, inside buildings etc.)
 *
 * Distance calculation strategy (most accurate → fastest):
 *   1. OSRM real road distance (via Yapiko OSRM) — most accurate
 *   2. Haversine × road factor — fast, no API cost
 *
 * NO EXTRA API CALLS for already-geocoded coords with valid zone matching.
 */

const axios = require('axios');
const logger = require('../src/utils/logger');
const crypto = require('crypto');

// ============================================================
// INCREMENTAL CACHE TREES — v2.0 REDIS WRITE-THROUGH (улучшение I)
// Sync in-memory Map для hot-path (0 мс), Redis для персистентности между рестартами.
// При рестарте сервера кэш прогревается из Redis — никаких повторных OSRM запросов.
// ============================================================
const segmentCacheLocal = new Map();
const SEGMENT_CACHE_MAX = 10000;     // Максимум записей в памяти
const SEGMENT_CACHE_TTL_S = 7 * 24 * 3600; // 7 дней в Redis
const SEGMENT_CACHE_PREFIX = 'route:seg:v1:';

let _segRedis = null;
let _segRedisReady = false;

function _initSegRedis() {
    if (process.env.REDIS_ENABLED !== 'true') return null;
    try {
        const Redis = require('ioredis');
        const r = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD || undefined,
            retryStrategy: (t) => Math.min(t * 200, 5000),
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            lazyConnect: false,
        });
        r.on('ready', () => {
            _segRedisReady = true;
            logger.info('[SegCache] Redis connected — segment cache persistent');
        });
        r.on('error', () => { _segRedisReady = false; });
        return r;
    } catch { return null; }
}

function _getSegRedis() {
    if (!_segRedis) _segRedis = _initSegRedis();
    return _segRedisReady ? _segRedis : null;
}

// Write-through адаптер: sync API (как Map) + async Redis персистентность
const segmentCache = {
    has(key) { return segmentCacheLocal.has(key); },
    get(key) { return segmentCacheLocal.get(key); },
    set(key, value) {
        // LRU eviction при переполнении
        if (segmentCacheLocal.size >= SEGMENT_CACHE_MAX) {
            segmentCacheLocal.delete(segmentCacheLocal.keys().next().value);
        }
        segmentCacheLocal.set(key, value);
        // Fire-and-forget Redis write
        const r = _getSegRedis();
        if (r) r.setex(SEGMENT_CACHE_PREFIX + key, SEGMENT_CACHE_TTL_S, JSON.stringify(value)).catch(() => {});
    }
};

// Прогрев in-memory кэша из Redis при старте (async, non-blocking)
async function warmSegmentCacheFromRedis() {
    // Ждём пока Redis поднимется (до 3 сек)
    for (let i = 0; i < 15; i++) {
        if (_segRedisReady) break;
        await new Promise(r => setTimeout(r, 200));
    }
    const r = _getSegRedis();
    if (!r) return;
    try {
        const keys = await r.keys(SEGMENT_CACHE_PREFIX + '*');
        if (!keys.length) return;
        const batchSize = 200;
        let loaded = 0;
        for (let i = 0; i < keys.length; i += batchSize) {
            const batch = keys.slice(i, i + batchSize);
            const vals = await r.mget(...batch);
            for (let j = 0; j < batch.length; j++) {
                if (!vals[j]) continue;
                const shortKey = batch[j].slice(SEGMENT_CACHE_PREFIX.length);
                try { segmentCacheLocal.set(shortKey, JSON.parse(vals[j])); loaded++; } catch {}
            }
        }
        logger.info(`[SegCache]  Warmed ${loaded}/${keys.length} route segments from Redis`);
    } catch (e) {
        logger.warn(`[SegCache] Redis warmup failed: ${e.message}`);
    }
}

// Запускаем прогрев после загрузки модуля (non-blocking)
setImmediate(() => warmSegmentCacheFromRedis().catch(() => {}));

function getSegmentCacheKey(lat1, lng1, lat2, lng2) {
    return `${Number(lat1).toFixed(5)},${Number(lng1).toFixed(5)}|${Number(lat2).toFixed(5)},${Number(lng2).toFixed(5)}`;
}

// ============================================================
// КОНСТАНТЫ ДОРОЖНОГО КОЭФФИЦИЕНТА
// Дорожное расстояние обычно в 1.2–1.4 раза больше прямолинейного для городских маршрутов.
// По типу зоны мы уточняем этот коэффициент:
// ============================================================
const ROAD_FACTOR = {
    urban: 1.25,       // City center, dense streets
    suburban: 1.35,    // Suburbs, less dense
    rural: 1.50,       // Villages, detours
    default: 1.30,
};

// Максимальные разумные расстояния доставки (км) — отклонять явно неверные результаты
const MAX_ROUTE_KM = {
    single_order: 30,
    multi_order: 60,
    per_stop: 15,       // Each individual stop should be ≤15km from previous
};

// ============================================================
// КОНВЕЙЕР ВАЛИДАЦИИ КООРДИНАТ
// ============================================================

/**
 * Умный резолвер координат — использует ВСЕ доступные источники данных.
 * Возвращает улучшенный объект координат с оценкой уверенности.
 *
 * @param {object} order - Объект заказа из FO
 * @param {object} kmlIndex - { zones: [], gridIndex: Map, findZonesForPoint: fn }
 * @param {Map}    zoneCentroids - Предварительно вычисленная карта центроидов зон (zoneName → {lat, lng})
 * @returns {{ lat, lng, confidence, source, kmlZone } | null}
 */
function resolveOrderCoords(order, kmlIndex, zoneCentroids) {
    const rawGeo = order.addressGeo || order.AddressGeo || order.raw?.addressGeo || order.raw?.AddressGeo || '';
    
    // Вспомогательная функция для кросс-валидации координат из FO против KML центроида
    const validateFoCoord = (lat, lng, sourceName) => {
        if (!isValidUkraineCoord(lat, lng)) return null;
        
        const kmlZone = findZoneForPoint(lat, lng, kmlIndex);
        const foZone = String(order.deliveryZone || '').trim();
        
        // v7.10 КРИТИЧНО: Защита от аномальных KML-зон (выбросы на 100+ км)
        // Если точка получена из грязных FO данных, проверяем расстояние до хаба/сектора
        if (foZone && zoneCentroids) {
            const expectedCentroid = zoneCentroids.get(normalizeZoneName(foZone));
            if (expectedCentroid) {
                const dist = haversineKm(lat, lng, expectedCentroid.lat, expectedCentroid.lng);
                // Если координата дальше 25 км от центра своей зоны — это мусор,
                // отклоняем её, чтобы включился SOTA геокодер и нашел правильный адрес
                if (dist > 25) {
                    logger.warn(`[CoordValidator]  REJECTED ${sourceName} for order ${order.orderNumber || order.id}: anomaly distance ${dist.toFixed(1)}km from expected zone "${foZone}" centroid`);
                    return null;
                }
            }
        }
        
        return {
            lat,
            lng,
            confidence: 1.0,
            source: sourceName,
            kmlZone: kmlZone?.name || foZone || null
        };
    };

    // P1: GPS из FO API — наивысший приоритет, наиболее точный (ЕСЛИ ПРОШЕЛ ПРОВЕРКУ АНОМАЛИЙ)
    if (rawGeo) {
        const gpsCoords = parseAddressGeo(rawGeo);
        if (gpsCoords) {
            const validated = validateFoCoord(gpsCoords.lat, gpsCoords.lng, 'FO_GPS');
            if (validated) {
                if (gpsCoords.city) order.CityName = gpsCoords.city; // Сохраняем извлеченный город
                return validated;
            }
        }
    }

    // P2: Прямые поля lat/lng из FO
    if (order.lat && order.lng) {
        const lat = parseFloat(order.lat);
        const lng = parseFloat(order.lng);
        if (!isNaN(lat) && !isNaN(lng)) {
            const validated = validateFoCoord(lat, lng, 'FO_DIRECT');
            if (validated) return validated;
        }
    }

    // P3: Уже геокодировано (coords.lat/lng установлены геокодером)
    if (order.coords?.lat && order.coords?.lng) {
        const { lat, lng } = order.coords;
        const kmlZone = findZoneForPoint(lat, lng, kmlIndex);
        const foZone = String(order.deliveryZone || '').trim();

        // Кросс-валидация: соответствует ли геокодированная точка зоне доставки FO?
        let confidence = 0.8;
        if (foZone && kmlZone) {
            const zoneMatch = zonesMatch(foZone, kmlZone.name);
            if (zoneMatch) {
                confidence = 0.95; // Geocoded AND zone matches FO
            } else {
                // Проверка point is near expected zone centroid
                const expectedCentroid = zoneCentroids.get(normalizeZoneName(foZone));
                if (expectedCentroid) {
                    const dist = haversineKm(lat, lng, expectedCentroid.lat, expectedCentroid.lng);
                    if (dist <= 3) {
                        confidence = 0.85; // Within 3km of expected zone centroid — acceptable
                    } else if (dist > 15) {
                        confidence = 0.3; // Suspicious — very far from expected zone
                        logger.warn(`[CoordValidator]  Geocoded coord (${lat.toFixed(4)},${lng.toFixed(4)}) is ${dist.toFixed(1)}km from FO zone "${foZone}" centroid — LOW CONFIDENCE`);
                    }
                }
            }
        }

        return { lat, lng, confidence, source: 'GEOCODED', kmlZone: kmlZone?.name || foZone || null };
    }

    // P4: Подсказка центроида зоны удалена из предварительной проверки — пусть batchEnhancedGeocode обработает это как запасной вариант
    // чтобы мы не пропускали API-запросы для заказов, у которых есть зона, но адрес ещё не геокодирован.
    /*
    const foZone = String(order.deliveryZone || '').trim();
    if (foZone && zoneCentroids.size > 0) {
        const centroid = zoneCentroids.get(normalizeZoneName(foZone));
        if (centroid) {
            return {
                lat: centroid.lat,
                lng: centroid.lng,
                confidence: 0.1, // Very low — zone centroid only
                source: 'ZONE_CENTROID',
                kmlZone: foZone,
                isCentroidFallback: true
            };
        }
    }
    */

    return null;
}

// ============================================================
// ПАКЕТНОЕ УЛУЧШЕНИЕ КООРДИНАТ
// Валидирует и обогащает координаты ВСЕХ заказов за один проход, без вызовов API.
// ============================================================

/**
 * Улучшить все заказы на месте, используя доступные источники данных.
 * Обновляет order.coords, order.kmlZone, order._coordSource, order._coordConfidence.
 *
 * @param {object[]} orders
 * @param {object}   kmlIndex  - из пространственной сетки turboCalculator
 * @param {Map}      zoneCentroids
 * @returns {{ enhanced: number, fromGPS: number, fromGeocoder: number, lowConfidence: number }}
 */
function enhanceAllOrderCoords(orders, kmlIndex, zoneCentroids) {
    let enhanced = 0, fromGPS = 0, fromGeocoder = 0, lowConfidence = 0;

    orders.forEach(order => {
        const resolved = resolveOrderCoords(order, kmlIndex, zoneCentroids);
        if (!resolved) return;

        // Обновление order in-place
        order.coords = { lat: resolved.lat, lng: resolved.lng };
        order.kmlZone = resolved.kmlZone;
        order._coordSource = resolved.source;
        order._coordConfidence = resolved.confidence;
        order._isCentroidFallback = !!resolved.isCentroidFallback;

        enhanced++;
        if (resolved.source === 'FO_GPS' || resolved.source === 'FO_DIRECT') fromGPS++;
        if (resolved.source === 'GEOCODED') fromGeocoder++;
        if (resolved.confidence < 0.5) lowConfidence++;
    });

    return { enhanced, fromGPS, fromGeocoder, lowConfidence };
}

// ============================================================
// ПРЕДВЫЧИСЛЕНИЕ ЦЕНТРОИДОВ ЗОН
// Вычислить центроид каждой KML-зоны один раз при запуске.
// Используется как быстрая точка отсчёта для валидации и группировки.
// ============================================================

/**
 * Предвычислить центроиды для всех KML-зон.
 * Возвращает Map<normalizedZoneName, { lat, lng, area, zone }>
 */
function buildZoneCentroids(kmlZones) {
    const centroids = new Map();
    if (!kmlZones?.length) return centroids;

    for (const zone of kmlZones) {
        if (!zone.name) continue;

        let lat = null, lng = null;

        // Метод 0: Предварительно вычисленный центроид из БД (синхронизация KML)
        if (zone.centroid && typeof zone.centroid.lat === 'number') {
            lat = zone.centroid.lat;
            lng = zone.centroid.lng;
        }
        // Метод 1: Центроид полигона (вычисление)
        else if (zone.boundary?.coordinates?.[0]) {
            const coords = zone.boundary.coordinates[0];
            if (coords.length > 0) {
                const sumLat = coords.reduce((s, c) => s + c[1], 0);
                const sumLng = coords.reduce((s, c) => s + c[0], 0);
                lat = sumLat / coords.length;
                lng = sumLng / coords.length;
            }
        }

        // Метод 2: Центроид ограничивающего прямоугольника (запасной вариант)
        if ((!lat || !lng) && zone.bounds) {
            lat = (zone.bounds.north + zone.bounds.south) / 2;
            lng = (zone.bounds.east + zone.bounds.west) / 2;
        }

        if (lat && lng) {
            const key = normalizeZoneName(zone.name);
            centroids.set(key, { lat, lng, zone });

            // Также индексировать по частичному имени для нечёткого поиска
            const shortKey = key.split(/\s+/).slice(0, 2).join(' ');
            if (shortKey !== key && !centroids.has(shortKey)) {
                centroids.set(shortKey, { lat, lng, zone });
            }
        }
    }

    logger.info(`[CoordValidator]  Built ${centroids.size} zone centroids`);
    return centroids;
}

// ============================================================
// ВЫЧИСЛЕНИЕ РАССТОЯНИЯ
// ============================================================

/**
 * Вычислить дорожное расстояние между двумя точками через OSRM.
 * Откатывается к гаверсинусу × дорожный коэффициент, если OSRM недоступен.
 *
 * @param {{ lat, lng }} from
 * @param {{ lat, lng }} to
 * @param {string} osrmUrl
 * @param {string} roadType - 'urban' | 'suburban' | 'rural'
 * @returns {Promise<{ distanceM: number, source: 'osrm'|'haversine', durationS?: number }>}
 */
async function getSegmentDistance(from, to, osrmUrl, roadType = 'urban') {
    if (!from?.lat || !from?.lng || !to?.lat || !to?.lng) {
        return { distanceM: 0, source: 'zero', durationS: 0 };
    }

    // Сначала попробовать OSRM
    if (osrmUrl) {
        try {
            const coordsStr = `${from.lng.toFixed(7)},${from.lat.toFixed(7)};${to.lng.toFixed(7)},${to.lat.toFixed(7)}`;
            const url = `${osrmUrl.trim().replace(/\/+$/, '')}/route/v1/driving/${coordsStr}?overview=false`;
            const res = await axios.get(url, { timeout: 3000, proxy: false });
            const route = res.data?.routes?.[0];
            if (route) {
                return {
                    distanceM: route.distance,
                    durationS: route.duration,
                    source: 'osrm'
                };
            }
        } catch (e) { /* OSRM unavailable — fall through */ }
    }

    // Запасной вариант: гаверсинус × дорожный коэффициент
    const factor = ROAD_FACTOR[roadType] || ROAD_FACTOR.default;
    const distKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
    return { distanceM: distKm * 1000 * factor, source: 'haversine', durationS: null };
}

/**
 * K: Deadline-Aware Nearest-Neighbor TSP + 2-opt
 * @param {number[][]} dist       - N×N матрица расстояний (метры)
 * @param {(number|null)[]} deadlines - Unix ms deadline для каждой точки (null = без дедлайна)
 * @param {number} startIdx       - индекс фиксированной стартовой точки (депо)
 * @returns {number[]} - оптимальный порядок индексов
 */
function deadlineAwareTSP(dist, deadlines, startIdx = 0) {
    const n = dist.length;
    if (n <= 2) return Array.from({ length: n }, (_, i) => i);
    const now = Date.now();
    const visited = new Array(n).fill(false);
    const route = [startIdx];
    visited[startIdx] = true;

    // Nearest-Neighbor с deadline penalty
    while (route.length < n) {
        const cur = route[route.length - 1];
        let bestScore = Infinity;
        let bestNext = -1;
        for (let j = 0; j < n; j++) {
            if (visited[j]) continue;
            const d = dist[cur]?.[j] ?? Infinity;
            // Срочность: меньше времени → ниже score → выше приоритет
            let urgency = 1.0;
            if (deadlines[j] !== null && deadlines[j] !== undefined) {
                const minsLeft = (deadlines[j] - now) / 60000;
                if (minsLeft < 20)       urgency = 0.2; // очень срочно
                else if (minsLeft < 40)  urgency = 0.4;
                else if (minsLeft < 60)  urgency = 0.6;
                else if (minsLeft < 120) urgency = 0.8;
            }
            const score = d * urgency;
            if (score < bestScore) { bestScore = score; bestNext = j; }
        }
        if (bestNext < 0) break; // защита от -1
        visited[bestNext] = true;
        route.push(bestNext);
    }

    // 2-opt улучшение (не трогаем startIdx)
    let improved = true;
    while (improved) {
        improved = false;
        for (let i = 1; i < route.length - 2; i++) {
            for (let j = i + 1; j < route.length - 1; j++) {
                const before = (dist[route[i-1]]?.[route[i]] ?? 0) + (dist[route[j]]?.[route[j+1]] ?? 0);
                const after  = (dist[route[i-1]]?.[route[j]] ?? 0) + (dist[route[i]]?.[route[j+1]] ?? 0);
                if (after < before - 1) {
                    route.splice(i, j - i + 1, ...route.slice(i, j + 1).reverse());
                    improved = true;
                }
            }
        }
    }
    return route;
}

/**
 * Вычислить ОБЩЕЕ расстояние маршрута для списка остановок.
 * v50 K: OSRM /table → deadline-aware TSP → /route (вместо /trip чёрного ящика)
 *
 * @param {object[]} stops - Массив { lat, lng } или объектов заказа с coords
 * @param {object}   startPoint - { lat, lng } начало от депо (опционально)
 * @param {object}   endPoint   - { lat, lng } конец у депо (опционально)
 * @param {string}   osrmUrl
 * @returns {Promise<{ totalDistanceM: number, segments: number[], source: string }>}
 */
async function calculateTotalRouteDistance(stops, startPoint, endPoint, osrmUrl) {
    const validStops = stops.filter(s => {
        const lat = s.lat || s.coords?.lat;
        const lng = s.lng || s.coords?.lng;
        return lat && lng;
    }).map(s => ({
        lat: parseFloat(s.lat || s.coords?.lat),
        lng: parseFloat(s.lng || s.coords?.lng),
        // K: сохраняем deadline для приоритетной TSP-сортировки
        deadlineMs: (() => {
            const raw = s.deliveryTime || s.deadline || s.plannedTime || s.expectedTime || null;
            if (!raw) return null;
            const t = new Date(raw).getTime();
            return isNaN(t) ? null : t;
        })(),
    }));

    if (validStops.length === 0) return { totalDistanceM: 0, segments: [], source: 'zero' };

    // Построить полный список путевых точек
    const waypoints = [];
    if (startPoint?.lat && startPoint?.lng) waypoints.push({ lat: Number(startPoint.lat), lng: Number(startPoint.lng) });
    waypoints.push(...validStops);
    if (endPoint?.lat && endPoint?.lng) {
        const last = waypoints[waypoints.length - 1];
        const endLat = Number(endPoint.lat), endLng = Number(endPoint.lng);
        if (last.lat.toFixed(5) !== endLat.toFixed(5) || last.lng.toFixed(5) !== endLng.toFixed(5)) {
            waypoints.push({ lat: endLat, lng: endLng });
        }
    }

    if (waypoints.length < 2) return { totalDistanceM: 0, segments: [], source: 'zero' };

    // Попробовать пакетный маршрут OSRM (один вызов API для всех путевых точек)
    if (osrmUrl && waypoints.length >= 2) {
        try {
            const isValhalla = osrmUrl.includes('valhalla');
            let resolvedWaypoints = waypoints; // может быть переупорядочен TSP
            let tspApplied = false;

            // ===== K: OSRM /table → deadline-aware TSP → /route (не для Valhalla) =====
            if (!isValhalla && waypoints.length >= 3) {
                try {
                    const tableCoords = waypoints.map(p => `${p.lng.toFixed(7)},${p.lat.toFixed(7)}`).join(';');
                    const tableUrl = `${osrmUrl.trim().replace(/\/+$/, '')}/table/v1/driving/${tableCoords}?annotations=distance,duration`;
                    const tableRes = await axios.get(tableUrl, { timeout: 5000, proxy: false });
                    const distMatrix = tableRes.data?.distances;

                    if (distMatrix && distMatrix.length === waypoints.length) {
                        const deadlines = waypoints.map(wp => wp.deadlineMs || null);
                        const sortedIdx = deadlineAwareTSP(distMatrix, deadlines, 0);
                        const reordered = sortedIdx.map(i => waypoints[i]);

                        // Проверяем кэш для TSP-оптимизированного порядка
                        let allCached = true, cDistM = 0, cDurS = 0;
                        const cSegs = [];
                        for (let i = 0; i < reordered.length - 1; i++) {
                            const key = getSegmentCacheKey(reordered[i].lat, reordered[i].lng, reordered[i+1].lat, reordered[i+1].lng);
                            if (segmentCache.has(key)) {
                                const c = segmentCache.get(key);
                                cSegs.push(c); cDistM += c.segDist; cDurS += c.segDur;
                            } else { allCached = false; break; }
                        }
                        if (allCached && cSegs.length > 0) {
                            return { totalDistanceM: cDistM, totalDurationS: cDurS, segments: cSegs.map(s => s.segDist), source: 'table-tsp-cache-0ms', tspOrder: sortedIdx };
                        }

                        resolvedWaypoints = reordered;
                        tspApplied = true;
                        logger.info(`[CoordValidator] K: TSP reordered ${waypoints.length} stops via /table (deadline-aware)`);
                    }
                } catch (tableErr) {
                    logger.debug(`[CoordValidator] K: /table failed, falling back to /trip: ${tableErr.message}`);
                }
            }

            // Инкрементальный кэш — проверяем resolvedWaypoints (в TSP-порядке или оригинальном)
            {
                let allCached = true, totalDistanceM = 0, totalDurationS = 0;
                const segments = [];
                for (let i = 0; i < resolvedWaypoints.length - 1; i++) {
                    const key = getSegmentCacheKey(resolvedWaypoints[i].lat, resolvedWaypoints[i].lng, resolvedWaypoints[i+1].lat, resolvedWaypoints[i+1].lng);
                    if (segmentCache.has(key)) {
                        const cached = segmentCache.get(key);
                        segments.push(cached); totalDistanceM += cached.segDist; totalDurationS += cached.segDur;
                    } else { allCached = false; break; }
                }
                if (allCached && segments.length > 0) {
                    return { totalDistanceM, totalDurationS, segments: segments.map(s => s.segDist), source: 'incremental-cache-0ms' };
                }
            }

            // Иначе обращаемся к API (OSRM /route с TSP-порядком, или /trip как fallback, или Valhalla)
            let route;
            if (isValhalla) {
                const valhallaReq = {
                    locations: resolvedWaypoints.map(p => ({ lat: p.lat, lon: p.lng })),
                    costing: "auto",
                    costing_options: { auto: { use_highways: 0.5, use_tolls: 0, surface_penalty: 1.5, elevation_penalty: 1.2 } },
                    directions_options: { units: "kilometers" }
                };
                const res = await axios.post(`${osrmUrl.trim().replace(/\/+$/, '')}/route`, valhallaReq, { timeout: 8000 });
                route = res.data?.trip?.legs ? { distance: res.data.trip.summary.length * 1000, legs: res.data.trip.legs } : null;
            } else {
                const coordsStr = resolvedWaypoints.map(p => `${p.lng.toFixed(7)},${p.lat.toFixed(7)}`).join(';');
                if (tspApplied) {
                    // K: TSP уже оптимизировал порядок — просто вызываем /route
                    const url = `${osrmUrl.trim().replace(/\/+$/, '')}/route/v1/driving/${coordsStr}?overview=false`;
                    const res = await axios.get(url, { timeout: 8000, proxy: false });
                    route = res.data?.routes?.[0];
                } else {
                    // Fallback: /trip как раньше (если /table был недоступен)
                    const url = `${osrmUrl.trim().replace(/\/+$/, '')}/trip/v1/driving/${coordsStr}?overview=false&source=first&roundtrip=false`;
                    const res = await axios.get(url, { timeout: 8000, proxy: false });
                    route = res.data?.trips?.[0];
                }
            }

            if (route?.distance > 0) {
                const legs = route.legs || [];
                let totalDistanceM = 0;
                let totalDurationS = 0;
                let hybridSource = tspApplied ? 'osrm-table-tsp' : 'osrm';

                const resolvedSegments = await Promise.all(legs.map(async (l, i) => {
                    let segDist = l.distance || 0;
                    let segDur = l.duration || 0;

                    const from = resolvedWaypoints[i];
                    const to = resolvedWaypoints[i + 1];
                    const havKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
                    const expectedDistM = havKm * 1000 * ROAD_FACTOR.urban;

                    // Detour detection: OSRM > 3× haversine → Geoapify fallback
                    if (segDist > expectedDistM * 3 && (segDist - expectedDistM) > 1000) {
                        try {
                            const apiKey = process.env.GEOAPIFY_KEY || 'eab92d24660e4eb0a66d5bda95cc3fc2';
                            const url = `https://api.geoapify.com/v1/routing?waypoints=${from.lat},${from.lng}|${to.lat},${to.lng}&mode=drive&apiKey=${apiKey}`;
                            const geoRes = await axios.get(url, { timeout: 4000 });
                            const geoRoute = geoRes.data?.features?.[0]?.properties;
                            if (geoRoute && geoRoute.distance) {
                                segDist = geoRoute.distance;
                                segDur = geoRoute.time;
                                hybridSource = 'hybrid-geoapify-enterprise';
                            }
                        } catch (err) {
                            logger.warn(`[CoordValidator] Geoapify Routing fallback failed: ${err.message}. Using Haversine Pruning.`);
                            segDist = expectedDistM;
                            segDur = (expectedDistM / 1000) / 25 * 3600;
                            hybridSource = 'hybrid-pruned';
                        }
                    }

                    // Сохраняем в persistent segment cache (Redis write-through)
                    const cacheKey = getSegmentCacheKey(from.lat, from.lng, to.lat, to.lng);
                    segmentCache.set(cacheKey, { segDist, segDur });
                    return { segDist, segDur };
                }));

                for (const s of resolvedSegments) { totalDistanceM += s.segDist; totalDurationS += s.segDur; }
                return { totalDistanceM, totalDurationS, segments: resolvedSegments.map(s => s.segDist), source: hybridSource };
            }
        } catch (e) {
            logger.warn(`[CoordValidator] OSRM batch failed: ${e.message} — falling back to haversine`);
        }
    }

    // Запасной вариант: сумма расстояний гаверсинуса на сегмент с дорожным коэффициентом
    let totalDistanceM = 0;
    const segments = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
        const from = waypoints[i];
        const to = waypoints[i + 1];
        const distKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
        const factor = ROAD_FACTOR.urban;
        const segDistM = distKm * 1000 * factor;
        segments.push(segDistM);
        totalDistanceM += segDistM;
    }

    return { totalDistanceM, segments, source: 'haversine' };
}

// ============================================================
// ПРОВЕРКИ КОРРЕКТНОСТИ — на маршрут и на сегмент
// ============================================================

/**
 * Проверить расстояние маршрута на корректность.
 * Возвращает { valid, reason, distanceKm }
 */
function validateRouteDistance(distanceM, orderCount) {
    const distanceKm = distanceM / 1000;

    if (distanceKm > MAX_ROUTE_KM.multi_order) {
        return {
            valid: false,
            reason: `Total route ${distanceKm.toFixed(1)}km exceeds maximum ${MAX_ROUTE_KM.multi_order}km for ${orderCount} orders`,
            distanceKm
        };
    }

    if (orderCount === 1 && distanceKm > MAX_ROUTE_KM.single_order) {
        return {
            valid: false,
            reason: `Single-order route ${distanceKm.toFixed(1)}km exceeds ${MAX_ROUTE_KM.single_order}km`,
            distanceKm
        };
    }

    return { valid: true, distanceKm };
}

/**
 * Проверить аномалию между остановками: если любая пара последовательных остановок > MAX per_stop км, отметить её.
 * Возвращает массив индексов аномальных остановок.
 */
function detectStopAnomalies(stops) {
    const anomalies = [];
    for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i];
        const b = stops[i + 1];
        const lat1 = a.lat || a.coords?.lat;
        const lng1 = a.lng || a.coords?.lng;
        const lat2 = b.lat || b.coords?.lat;
        const lng2 = b.lng || b.coords?.lng;
        if (!lat1 || !lat2) continue;
        const dist = haversineKm(lat1, lng1, lat2, lng2);
        if (dist > MAX_ROUTE_KM.per_stop) {
            anomalies.push({
                fromIndex: i,
                toIndex: i + 1,
                distanceKm: dist,
                from: `${a.address || a.orderNumber || i}`,
                to: `${b.address || b.orderNumber || (i + 1)}`
            });
        }
    }
    return anomalies;
}

// ============================================================
// СОПОСТАВЛЕНИЕ ЗОН
// ============================================================

/**
 * Сопоставить строку зоны доставки FO с именем KML-зоны.
 * Обрабатывает частичные совпадения, игнорирует регистр, обрабатывает шаблоны "Зона 1", "Zone 1".
 */
function zonesMatch(foZone, kmlZoneName) {
    if (!foZone || !kmlZoneName) return false;
    const fo = normalizeZoneName(foZone);
    const kml = normalizeZoneName(kmlZoneName);
    if (fo === kml) return true;
    if (fo.includes(kml) || kml.includes(fo)) return true;
    // Извлечь номер зоны
    const foNum = fo.match(/\d+/)?.[0];
    const kmlNum = kml.match(/\d+/)?.[0];
    if (foNum && kmlNum && foNum === kmlNum) return true;
    return false;
}

function normalizeZoneName(name) {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/fo\/kml:\s*/i, '')
        .replace(/[^а-яіієєґa-z0-9\s]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

function parseAddressGeo(geoStr) {
    if (!geoStr) return null;
    try {
        const latMatch = geoStr.match(/Lat\s*=\s*"?([\d.]+)"?/i);
        const lngMatch = geoStr.match(/Long\s*=\s*"?([\d.]+)"?/i);
        if (latMatch && lngMatch) {
            const lat = parseFloat(latMatch[1]);
            const lng = parseFloat(lngMatch[1]);
            if (!isNaN(lat) && !isNaN(lng) && lat > 0 && lng > 0) {
                return { lat, lng };
            }
        }
    } catch (e) { /* ignore */ }
    return null;
}

function isValidUkraineCoord(lat, lng) {
    // Приблизительные границы Украины с запасом
    return lat >= 44.0 && lat <= 52.5 && lng >= 22.0 && lng <= 40.5;
}

function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findZoneForPoint(lat, lng, kmlIndex) {
    if (!kmlIndex?.findBestZoneForPoint) return null;
    try {
        return kmlIndex.findBestZoneForPoint(lat, lng);
    } catch { return null; }
}

// ============================================================
// ПРИВЯЗКА К ДОРОГЕ (опционально — только для низкоуверенных координат)
// ============================================================

/**
 * v49: Multi-Candidate Snap Gate (улучшение L)
 * Запрашивает 3 ближайших точки привязки к дороге через OSRM nearest.
 * Фильтрует автомагистрали/трассы по имени дороги — курьер едет по городским улицам.
 * Выбирает лучший кандидат: минимальное расстояние привязки среди городских дорог.
 */
async function snapToRoad(lat, lng, osrmUrl) {
    if (!osrmUrl || !lat || !lng) return { lat, lng };
    try {
        // number=3: получаем 3 кандидата вместо 1 — можем фильтровать автострады
        const url = `${osrmUrl.trim().replace(/\/+$/, '')}/nearest/v1/driving/${lng.toFixed(7)},${lat.toFixed(7)}?number=3`;
        const res = await axios.get(url, { timeout: 2000 });
        const waypoints = (res.data?.waypoints || []).filter(wp => wp?.location && (wp.distance || 999) < 500);

        if (!waypoints.length) return { lat, lng, snapped: false };

        // Паттерны автомагистралей/трасс (украинские + международные)
        const HIGHWAY_RE = /\b(м-\d|р-\d|е-\d|трас[са]|автодорог|highway|motorway|autobahn|autopista|автострад)\b/i;

        // Предпочитаем городские улицы; fallback — ближайшая из всех
        const cityRoads = waypoints.filter(wp => !HIGHWAY_RE.test(wp.name || ''));
        const candidates = cityRoads.length > 0 ? cityRoads : waypoints;

        // Выбираем кандидата с минимальным расстоянием snap
        const best = candidates.sort((a, b) => (a.distance || 999) - (b.distance || 999))[0];
        const snappedLat = best.location[1];
        const snappedLng = best.location[0];
        const dist = best.distance || haversineKm(lat, lng, snappedLat, snappedLng) * 1000;

        if (dist < 500) {
            const filtered = cityRoads.length > 0 && !HIGHWAY_RE.test(best.name || '');
            logger.debug(`[SnapToRoad] ${dist.toFixed(0)}m snap → "${best.name || 'unnamed'}" (${filtered ? 'city-road' : 'highway-fallback'})`);
            return { lat: snappedLat, lng: snappedLng, snapped: true, snapDistM: Math.round(dist), snapRoad: best.name || '' };
        }
    } catch (e) { /* silent */ }
    return { lat, lng, snapped: false };
}

/**
 * Snap low-confidence order coords to road in batch.
 * Only processes orders with confidence < threshold.
 */
async function snapLowConfidenceToRoad(orders, osrmUrl, confidenceThreshold = 0.6) {
    const toSnap = orders.filter(o =>
        o.coords?.lat && o.coords?.lng &&
        (o._coordConfidence || 1) < confidenceThreshold &&
        !o._isCentroidFallback // Don't snap centroid fallbacks — they're wrong anyway
    );

    if (!toSnap.length || !osrmUrl) return;

    logger.info(`[CoordValidator]  Snapping ${toSnap.length} low-confidence coords to road...`);

    await Promise.all(toSnap.map(async (order) => {
        const snapped = await snapToRoad(order.coords.lat, order.coords.lng, osrmUrl);
        if (snapped.snapped) {
            order.coords = { lat: snapped.lat, lng: snapped.lng };
            order._coordConfidence = Math.min(1, (order._coordConfidence || 0.5) + 0.2);
            logger.debug(`[CoordValidator]  Snapped order ${order.orderNumber}: ${snapped.snapDistM}m`);
        }
    }));
}

module.exports = {
    resolveOrderCoords,
    enhanceAllOrderCoords,
    buildZoneCentroids,
    calculateTotalRouteDistance,
    getSegmentDistance,
    validateRouteDistance,
    detectStopAnomalies,
    snapToRoad,
    snapLowConfidenceToRoad,
    zonesMatch,
    normalizeZoneName,
    parseAddressGeo,
    isValidUkraineCoord,
    haversineKm,
    ROAD_FACTOR,
    MAX_ROUTE_KM,
};
