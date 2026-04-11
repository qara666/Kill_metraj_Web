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

// ============================================================
// ROAD FACTOR CONSTANTS
// Road distance is typically 1.2–1.4× straight-line for urban routes.
// By zone type we refine this factor:
// ============================================================
const ROAD_FACTOR = {
    urban: 1.25,       // City center, dense streets
    suburban: 1.35,    // Suburbs, less dense
    rural: 1.50,       // Villages, detours
    default: 1.30,
};

// Max sane delivery distances (km) — reject clearly wrong results
const MAX_ROUTE_KM = {
    single_order: 30,
    multi_order: 60,
    per_stop: 15,       // Each individual stop should be ≤15km from previous
};

// ============================================================
// COORDINATE VALIDATION PIPELINE
// ============================================================

/**
 * Smart coordinate resolver — uses ALL available data sources.
 * Returns enhanced coordinate object with confidence score.
 *
 * @param {object} order - Order object from FO
 * @param {object} kmlIndex - { zones: [], gridIndex: Map, findZonesForPoint: fn }
 * @param {Map}    zoneCentroids - Precomputed zone centroids map (zoneName → {lat, lng})
 * @returns {{ lat, lng, confidence, source, kmlZone } | null}
 */
function resolveOrderCoords(order, kmlIndex, zoneCentroids) {
    // P1: FO API GPS — highest priority, most accurate
    if (order.addressGeo) {
        const gpsCoords = parseAddressGeo(order.addressGeo);
        if (gpsCoords && isValidUkraineCoord(gpsCoords.lat, gpsCoords.lng)) {
            const kmlZone = findZoneForPoint(gpsCoords.lat, gpsCoords.lng, kmlIndex);
            return {
                lat: gpsCoords.lat,
                lng: gpsCoords.lng,
                confidence: 1.0,
                source: 'FO_GPS',
                kmlZone: kmlZone?.name || order.deliveryZone || null
            };
        }
    }

    // P2: Direct lat/lng fields from FO
    if (order.lat && order.lng) {
        const lat = parseFloat(order.lat);
        const lng = parseFloat(order.lng);
        if (!isNaN(lat) && !isNaN(lng) && isValidUkraineCoord(lat, lng)) {
            const kmlZone = findZoneForPoint(lat, lng, kmlIndex);
            return {
                lat, lng,
                confidence: 1.0,
                source: 'FO_DIRECT',
                kmlZone: kmlZone?.name || order.deliveryZone || null
            };
        }
    }

    // P3: Already geocoded (coords.lat/lng set by geocoder)
    if (order.coords?.lat && order.coords?.lng) {
        const { lat, lng } = order.coords;
        const kmlZone = findZoneForPoint(lat, lng, kmlIndex);
        const foZone = String(order.deliveryZone || '').trim();

        // Cross-validate: does geocoded point match the FO delivery zone?
        let confidence = 0.8;
        if (foZone && kmlZone) {
            const zoneMatch = zonesMatch(foZone, kmlZone.name);
            if (zoneMatch) {
                confidence = 0.95; // Geocoded AND zone matches FO
            } else {
                // Check if point is near expected zone centroid
                const expectedCentroid = zoneCentroids.get(normalizeZoneName(foZone));
                if (expectedCentroid) {
                    const dist = haversineKm(lat, lng, expectedCentroid.lat, expectedCentroid.lng);
                    if (dist <= 3) {
                        confidence = 0.85; // Within 3km of expected zone centroid — acceptable
                    } else if (dist > 15) {
                        confidence = 0.3; // Suspicious — very far from expected zone
                        logger.warn(`[CoordValidator] ⚠️ Geocoded coord (${lat.toFixed(4)},${lng.toFixed(4)}) is ${dist.toFixed(1)}km from FO zone "${foZone}" centroid — LOW CONFIDENCE`);
                    }
                }
            }
        }

        return { lat, lng, confidence, source: 'GEOCODED', kmlZone: kmlZone?.name || foZone || null };
    }

    // P4: Zone centroid as last resort hint (not usable for distance calculation, only for grouping)
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

    return null;
}

// ============================================================
// BATCH COORDINATE ENHANCEMENT
// Validates and enriches ALL orders' coords in one pass, no API calls.
// ============================================================

/**
 * Enhance all orders in-place using available data sources.
 * Updates order.coords, order.kmlZone, order._coordSource, order._coordConfidence.
 *
 * @param {object[]} orders
 * @param {object}   kmlIndex  - from turboCalculator spatial grid
 * @param {Map}      zoneCentroids
 * @returns {{ enhanced: number, fromGPS: number, fromGeocoder: number, lowConfidence: number }}
 */
function enhanceAllOrderCoords(orders, kmlIndex, zoneCentroids) {
    let enhanced = 0, fromGPS = 0, fromGeocoder = 0, lowConfidence = 0;

    orders.forEach(order => {
        const resolved = resolveOrderCoords(order, kmlIndex, zoneCentroids);
        if (!resolved) return;

        // Update order in-place
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
// ZONE CENTROID PRECOMPUTE
// Compute centroid of each KML zone once at startup.
// Used as fast reference point for validation and grouping.
// ============================================================

/**
 * Precompute centroids for all KML zones.
 * Returns Map<normalizedZoneName, { lat, lng, area, zone }>
 */
function buildZoneCentroids(kmlZones) {
    const centroids = new Map();
    if (!kmlZones?.length) return centroids;

    for (const zone of kmlZones) {
        if (!zone.name) continue;

        let lat = null, lng = null;

        // Method 1: Polygon centroid
        if (zone.boundary?.coordinates?.[0]) {
            const coords = zone.boundary.coordinates[0];
            if (coords.length > 0) {
                const sumLat = coords.reduce((s, c) => s + c[1], 0);
                const sumLng = coords.reduce((s, c) => s + c[0], 0);
                lat = sumLat / coords.length;
                lng = sumLng / coords.length;
            }
        }

        // Method 2: Bounding box centroid (fallback)
        if ((!lat || !lng) && zone.bounds) {
            lat = (zone.bounds.north + zone.bounds.south) / 2;
            lng = (zone.bounds.east + zone.bounds.west) / 2;
        }

        if (lat && lng) {
            const key = normalizeZoneName(zone.name);
            centroids.set(key, { lat, lng, zone });

            // Also index by partial name for fuzzy matching
            const shortKey = key.split(/\s+/).slice(0, 2).join(' ');
            if (shortKey !== key && !centroids.has(shortKey)) {
                centroids.set(shortKey, { lat, lng, zone });
            }
        }
    }

    logger.info(`[CoordValidator] 📐 Built ${centroids.size} zone centroids`);
    return centroids;
}

// ============================================================
// DISTANCE CALCULATION
// ============================================================

/**
 * Calculate road distance between two points using OSRM.
 * Falls back to haversine × road factor if OSRM is unavailable.
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

    // Try OSRM first
    if (osrmUrl) {
        try {
            const coordsStr = `${from.lng.toFixed(7)},${from.lat.toFixed(7)};${to.lng.toFixed(7)},${to.lat.toFixed(7)}`;
            const url = `${osrmUrl.trim().replace(/\/+$/, '')}/route/v1/driving/${coordsStr}?overview=false`;
            const res = await axios.get(url, { timeout: 3000 });
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

    // Fallback: haversine × road factor
    const factor = ROAD_FACTOR[roadType] || ROAD_FACTOR.default;
    const distKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
    return { distanceM: distKm * 1000 * factor, source: 'haversine', durationS: null };
}

/**
 * Calculate TOTAL route distance for a list of stops.
 * Uses OSRM for real road distances (batch single call is most efficient).
 * Falls back to haversine with road factor per segment.
 *
 * @param {object[]} stops - Array of { lat, lng } or order objects with coords
 * @param {object}   startPoint - { lat, lng } depot start (optional)
 * @param {object}   endPoint   - { lat, lng } depot end (optional)
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
    }));

    if (validStops.length === 0) return { totalDistanceM: 0, segments: [], source: 'zero' };

    // Build full waypoints list
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

    // Try OSRM batch route (single API call for all waypoints)
    if (osrmUrl && waypoints.length >= 2) {
        try {
            const coordsStr = waypoints.map(p => `${p.lng.toFixed(7)},${p.lat.toFixed(7)}`).join(';');
            const url = `${osrmUrl.trim().replace(/\/+$/, '')}/route/v1/driving/${coordsStr}?overview=false`;
            const res = await axios.get(url, { timeout: 8000 });
            const route = res.data?.routes?.[0];
            if (route?.distance > 0) {
                // Extract per-leg distances
                const legs = route.legs || [];
                const segments = legs.map(l => l.distance || 0);
                return {
                    totalDistanceM: route.distance,
                    totalDurationS: route.duration,
                    segments,
                    source: 'osrm'
                };
            }
        } catch (e) {
            logger.warn(`[CoordValidator] OSRM batch failed: ${e.message} — falling back to haversine`);
        }
    }

    // Fallback: sum of per-segment haversine distances with road factor
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
// SANITY CHECKS — per-route and per-segment
// ============================================================

/**
 * Validate route distance for sanity.
 * Returns { valid, reason, distanceKm }
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
 * Check per-stop anomaly: if any consecutive stop-pair > MAX per_stop km, flag it.
 * Returns array of anomalous stop indices.
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
// ZONE MATCHING
// ============================================================

/**
 * Match FO deliveryZone string against KML zone name.
 * Handles partial matches, ignores case, handles "Зона 1", "Zone 1" patterns.
 */
function zonesMatch(foZone, kmlZoneName) {
    if (!foZone || !kmlZoneName) return false;
    const fo = normalizeZoneName(foZone);
    const kml = normalizeZoneName(kmlZoneName);
    if (fo === kml) return true;
    if (fo.includes(kml) || kml.includes(fo)) return true;
    // Extract zone number
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
// HELPERS
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
    // Ukraine approximate bounds with generous margins
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
// SNAP-TO-ROAD (optional — only for low-confidence coords)
// ============================================================

/**
 * Snap a coordinate to the nearest road using OSRM nearest endpoint.
 * Only call for low-confidence coords (geocoder fallbacks, centroids).
 * Returns snapped { lat, lng } or original if snap fails.
 */
async function snapToRoad(lat, lng, osrmUrl) {
    if (!osrmUrl || !lat || !lng) return { lat, lng };
    try {
        const url = `${osrmUrl.trim().replace(/\/+$/, '')}/nearest/v1/driving/${lng.toFixed(7)},${lat.toFixed(7)}?number=1`;
        const res = await axios.get(url, { timeout: 2000 });
        const waypoint = res.data?.waypoints?.[0];
        if (waypoint?.location) {
            const snappedLng = waypoint.location[0];
            const snappedLat = waypoint.location[1];
            // Reject if snap moved the point more than 500m (bad snap = missing road data)
            const dist = haversineKm(lat, lng, snappedLat, snappedLng) * 1000;
            if (dist < 500) {
                return { lat: snappedLat, lng: snappedLng, snapped: true, snapDistM: Math.round(dist) };
            }
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

    logger.info(`[CoordValidator] 🛣️ Snapping ${toSnap.length} low-confidence coords to road...`);

    await Promise.all(toSnap.map(async (order) => {
        const snapped = await snapToRoad(order.coords.lat, order.coords.lng, osrmUrl);
        if (snapped.snapped) {
            order.coords = { lat: snapped.lat, lng: snapped.lng };
            order._coordConfidence = Math.min(1, (order._coordConfidence || 0.5) + 0.2);
            logger.debug(`[CoordValidator] 📌 Snapped order ${order.orderNumber}: ${snapped.snapDistM}m`);
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
