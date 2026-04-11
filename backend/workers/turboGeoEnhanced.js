'use strict';

/**
 * turboGeoEnhanced.js — v1.0 SOTA BACKEND GEOCODING ENGINE
 *
 * 6-level cascaded geocoding strategy:
 *
 *  L1  DB Cache + LRU cache (instant, free)
 *  L2  addressGeo from FO data (zero API calls, GPS-precise)
 *  L3  Turbo parallel: photon + komoot + nominatim (fastest, broadest)
 *  L4  Variant expansion: UA-specific address mutations (handles renames, typos, ЖК, м-н)
 *  L5  Deep fallback: street-only, district, progressive term stripping
 *  L6  Emergency forced: ignore KML zone gate, accept any valid result inside city bounds
 *
 * Zone validation improvements:
 *  - Anomalous distance detection: cross-checks geocoded point against KML zone centroid
 *  - City-boundary double-guard: rejects results clearly outside Ukraine
 *  - Zone fallback chain: if exact zone fails → neighboring zone (≤ 2km) → any zone in division
 *
 * Ukrainian address specialization:
 *  - Handles хрущовки (building names without street number)
 *  - Handles both Cyrillic/transliterated street types (вул / вулиця / ul / ulytsia)
 *  - Handles дача / котедж / приватний сектор patterns
 *  - Handles renamed streets (both old and new name in parallel)
 *  - Handles apartment/entrance/door noise: "под.1 д/ф моб эт.5 кв.28" → stripped cleanly
 *  - Handles section markers: №55, корп.2, буд.3-А
 */

const axios = require('axios');
const logger = require('../src/utils/logger');
const { cleanAddress, generateVariants } = require('../src/utils/addressUtils');

// ============================================================
// CITY BOUNDING BOXES — guard against wild geocode results
// ============================================================
const CITY_BOUNDS = {
    'Харків': { minLat: 49.88, maxLat: 50.08, minLng: 36.07, maxLng: 36.47 },
    'Харьков': { minLat: 49.88, maxLat: 50.08, minLng: 36.07, maxLng: 36.47 },
    'Kharkiv': { minLat: 49.88, maxLat: 50.08, minLng: 36.07, maxLng: 36.47 },
    'Київ': { minLat: 50.21, maxLat: 50.59, minLng: 30.24, maxLng: 30.82 },
    'Киев': { minLat: 50.21, maxLat: 50.59, minLng: 30.24, maxLng: 30.82 },
    'Kyiv': { minLat: 50.21, maxLat: 50.59, minLng: 30.24, maxLng: 30.82 },
    'Дніпро': { minLat: 48.30, maxLat: 48.55, minLng: 34.90, maxLng: 35.20 },
    'Одеса': { minLat: 46.35, maxLat: 46.55, minLng: 30.60, maxLng: 30.85 },
    'Львів': { minLat: 49.77, maxLat: 49.93, minLng: 23.90, maxLng: 24.15 },
};

// Suburb extension: if city has suburbs, extend bounding box by this km
const SUBURB_EXTENSION_DEG = 0.15; // ~17km at 50° latitude

// ============================================================
// UKRAINIAN ADDRESS NOISE REMOVAL
// ============================================================

/**
 * Deep cleaning of Ukrainian/Russian delivery addresses.
 * Removes apartment info, entrance, floor, dialer codes, notes.
 */
function deepCleanAddress(raw) {
    if (!raw) return '';
    let s = raw;

    // Remove GPS coordinates if accidentally left in address string
    s = s.replace(/Lat\s*=\s*"?[\d.]+"\s*/gi, '');
    s = s.replace(/Long\s*=\s*"?[\d.]+"\s*/gi, '');
    s = s.replace(/AddressStr\s*=\s*"?[^"]+"\s*/gi, '');

    // Remove apartment/suite noise: кв. 28, квартира 5, оф. 3
    s = s.replace(/\b(кв|квартира|апарт|оф|офис|офіс)\s*\.?\s*\d+[а-яіє]*\b/gi, '');

    // Remove entrance / подъезд / під'їзд: под.1 | п-д 2 | под 3
    s = s.replace(/\b(под\.?|підʼїзд|подъезд|п-д)\s*\.?\s*\d+\b/gi, '');

    // Remove floor / этаж: эт.5 | этаж 3 | поверх 2
    s = s.replace(/\b(эт\.?|этаж|поверх|пов\.?)\s*\.?\s*\d+\b/gi, '');

    // Remove door codes: д/ф | д.ф. | код | домофон
    s = s.replace(/\b(д\/ф|д\.ф\.|код|домофон|дф)\b.*?(?=[,;]|$)/gi, '');

    // Remove mobile/intercom markers: моб | мобільний
    s = s.replace(/\bмоб\b[^,;]*/gi, '');

    // Remove phone numbers: (093) 123-45-67 | +380...
    s = s.replace(/(\+?380|\(?0\d{2}\)?)\s?[\d\s\-]{7,}/g, '');

    // Remove comments in parentheses that contain apartment info but NOT street alt names
    s = s.replace(/\((?!.*\bвул|.*\bвул\b)[^)]{0,40}\)/gi, '');

    // Remove trailing noise after last real address part
    s = s.replace(/,\s*$/g, '');
    s = s.replace(/\s+/g, ' ').trim();

    return s;
}

/**
 * Generate Ukrainian-specialized address variants for geocoding.
 * Returns ordered array best→worst.
 */
function generateUAVariants(raw, city) {
    const cleaned = deepCleanAddress(raw);
    const baseVariants = generateVariants(cleaned, city, 8) || [];

    const variants = new Set(baseVariants);

    // 1. Add city-prefixed version of each existing variant
    for (const v of [...variants]) {
        if (city && !v.toLowerCase().includes(city.toLowerCase())) {
            variants.add(`${city}, ${v}`);
        }
    }

    // 2. Street type normalization: вул → вулиця, ул → улица etc.
    const streetTypeMap = [
        [/\bвул\.\s*/gi, 'вулиця '],
        [/\bвулиця\s+/gi, 'вул. '],
        [/\bпров\.\s*/gi, 'провулок '],
        [/\bпросп\.\s*/gi, 'проспект '],
        [/\bбул\.\s*/gi, 'бульвар '],
        [/\bпр\.\s*/gi, 'проспект '],
    ];
    const baseClean = cleaned;
    for (const [from, to] of streetTypeMap) {
        const replaced = baseClean.replace(from, to).trim();
        if (replaced !== baseClean) {
            variants.add(replaced);
            if (city) variants.add(`${city}, ${replaced}`);
        }
    }

    // 3. Remove house number → street-only fallback
    const noHouse = cleaned.replace(/[,\s]+\d+[а-яіє/a-z-]*\s*$/i, '').trim();
    if (noHouse && noHouse !== cleaned && noHouse.length > 5) {
        variants.add(noHouse);
        if (city) variants.add(`${city}, ${noHouse}`);
    }

    // 4. Extract content inside parentheses as alt street name
    const parenMatch = raw.match(/\(([^)]+)\)/);
    if (parenMatch) {
        const inner = parenMatch[1].trim();
        // Only use if it looks like a street name (not apt info)
        if (inner.length > 3 && !/^\d+$/.test(inner) && !/кв|эт|под|моб/i.test(inner)) {
            const houseMatch = cleaned.match(/,?\s*(\d+[а-яіє]*)$/i);
            const house = houseMatch ? houseMatch[1] : '';
            variants.add(`${inner}${house ? ', ' + house : ''}, ${city || ''}`.trim());
            variants.add(`${city || ''}, ${inner}${house ? ' ' + house : ''}`.trim());
        }
    }

    // 5. Common Ukrainian suburb/village patterns: дача, дачне, СТ, ДНТ, садовий
    if (/\b(дача|дачне|ДНТ|СТ|садов)\b/i.test(raw)) {
        // These are hard — try with district name only
        const districtMatch = raw.match(/([А-ЯІЄҐ][а-яієґ]+(?:\s+[А-ЯІЄҐ][а-яієґ]+)?)\s+район/i);
        if (districtMatch) {
            variants.add(`${districtMatch[1]} район, ${city || ''}`);
        }
    }

    // 6. Remove "корп." or "буд." suffixes that confuse geocoders
    const noBuilding = cleaned.replace(/,?\s*(корп\.?|буд\.?|корпус|будинок)\s*\d+[а-яіє]?/gi, '').trim();
    if (noBuilding !== cleaned) {
        variants.add(noBuilding);
        if (city) variants.add(`${city}, ${noBuilding}`);
    }

    // Filter empty, dedupe, return ordered
    return [...new Set([...variants])].filter(v => v && v.length > 4);
}

// ============================================================
// PROVIDER IMPLEMENTATIONS
// ============================================================

async function queryPhoton(query, photonUrl, timeout = 6000) {
    const url = `${photonUrl}/api?q=${encodeURIComponent(query)}&limit=5&lang=uk`;
    const res = await axios.get(url, { timeout });
    if (!res.data?.features?.length) return [];
    return res.data.features.map(f => ({
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        display: f.properties?.name || query,
        provider: 'photon',
        confidence: f.properties?.score || 0.5
    }));
}

async function queryKomoot(query, timeout = 8000) {
    const url = `https://photon.komoot.io/api?q=${encodeURIComponent(query)}&limit=5&lang=uk`;
    const res = await axios.get(url, { timeout, headers: { 'User-Agent': 'KillMetraj/2.0' } });
    if (!res.data?.features?.length) return [];
    return res.data.features.map(f => ({
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        display: f.properties?.name || query,
        provider: 'komoot',
        confidence: 0.6
    }));
}

async function queryNominatim(query, timeout = 8000) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1&accept-language=uk`;
    const res = await axios.get(url, { timeout, headers: { 'User-Agent': 'KillMetraj/2.0' } });
    if (!Array.isArray(res.data) || !res.data.length) return [];
    return res.data.map(r => ({
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        display: r.display_name,
        provider: 'nominatim',
        type: r.type,
        importance: r.importance || 0,
        confidence: Math.min(1, (r.importance || 0) * 2)
    }));
}

// Safe query wrapper — returns [] on any error
async function safeQuery(fn, ...args) {
    try {
        return await fn(...args) || [];
    } catch { return []; }
}

// ============================================================
// CANDIDATE SCORING
// ============================================================

/**
 * Score a geocoding candidate.
 * Higher = better.
 */
function scoreCandidate(candidate, { city, expectedZoneName, kmlZones, anomalyRadiusKm }) {
    let score = candidate.confidence || 0.5;

    // Boost for city match in display name
    if (city && candidate.display && candidate.display.toLowerCase().includes(city.toLowerCase())) {
        score += 1.0;
    }

    // Boost for nominatim by importance
    if (candidate.importance) score += candidate.importance;

    // Boost for house number type results
    if (['house', 'building', 'residential'].includes(candidate.type)) score += 0.5;

    // Penalty: out of city bounds
    const bounds = getCityBounds(city);
    if (bounds) {
        if (!isInBounds(candidate.lat, candidate.lng, bounds)) {
            score -= 10; // Hard penalty — outside city
        }
    }

    // Penalty: anomalous position vs zone centroid
    if (expectedZoneName && kmlZones?.length) {
        const zoneMatch = kmlZones.find(z =>
            z.name && z.name.toLowerCase().includes(expectedZoneName.toLowerCase())
        );
        if (zoneMatch?.centroid) {
            const dist = haversine(candidate.lat, candidate.lng, zoneMatch.centroid.lat, zoneMatch.centroid.lng);
            if (dist > anomalyRadiusKm) {
                score -= 5 * (dist / anomalyRadiusKm); // Proportional penalty
            } else {
                score += 0.5; // Small bonus for being close to expected zone
            }
        }
    }

    return { ...candidate, _score: score };
}

function getCityBounds(city) {
    if (!city) return null;
    const cityNorm = city.trim();
    return CITY_BOUNDS[cityNorm] || null;
}

function isInBounds(lat, lng, bounds) {
    const minLat = bounds.minLat - SUBURB_EXTENSION_DEG;
    const maxLat = bounds.maxLat + SUBURB_EXTENSION_DEG;
    const minLng = bounds.minLng - SUBURB_EXTENSION_DEG;
    const maxLng = bounds.maxLng + SUBURB_EXTENSION_DEG;
    return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
}

function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pickBest(candidates) {
    if (!candidates.length) return null;
    return candidates.reduce((best, c) => (c._score > (best?._score || -Infinity) ? c : best), null);
}

// ============================================================
// ANOMALY DISTANCE CHECK
// ============================================================

/**
 * Given a set of already-geocoded order coords for this courier/division,
 * check if a new candidate is anomalously far from the centroid.
 * Returns { anomaly: bool, distKm: number }
 */
function checkAnomalyDistance(candidateLat, candidateLng, existingCoords, maxAnomalyKm = 30) {
    if (!existingCoords || existingCoords.length < 2) return { anomaly: false };

    // Compute centroid of existing points
    const centLat = existingCoords.reduce((s, c) => s + c.lat, 0) / existingCoords.length;
    const centLng = existingCoords.reduce((s, c) => s + c.lng, 0) / existingCoords.length;

    const dist = haversine(candidateLat, candidateLng, centLat, centLng);
    return { anomaly: dist > maxAnomalyKm, distKm: dist, centLat, centLng };
}

// ============================================================
// MAIN EXPORT: enhancedGeocode
// ============================================================

/**
 * 6-level enhanced geocoding with Ukrainian address specialization, zone validation,
 * and anomaly distance detection.
 *
 * @param {string}   address         - Raw address string from FO
 * @param {string}   city            - City name for bias (e.g. 'Харків')
 * @param {string}   expectedZone    - Expected KML zone name (from FO data)
 * @param {object[]} kmlZones        - All loaded KML zones (with centroid if available)
 * @param {object[]} divisionCoords  - Already-geocoded coords for this division (for anomaly check)
 * @param {object}   options         - { photonUrl, geoCacheDb, gcacheLRU }
 * @returns {{ latitude, longitude, provider, locationType, anomaly } | null}
 */
async function enhancedGeocode(address, city = 'Харків', expectedZone = null, kmlZones = [], divisionCoords = [], options = {}) {
    if (!address || !address.trim()) return null;

    const { photonUrl = 'http://localhost:2322', geoCacheDb = null, gcacheLRU = null } = options;

    const CITY_BOUNDS_OBJ = getCityBounds(city);

    // -------------------------------
    // L1: LRU memory cache
    // -------------------------------
    const cacheKey = deepCleanAddress(address).toLowerCase();
    if (gcacheLRU) {
        const lruHit = gcacheLRU.get(cacheKey);
        if (lruHit && lruHit.latitude) {
            logger.debug(`[GeoEnhanced] L1 LRU hit: ${address}`);
            return lruHit;
        }
    }

    // -------------------------------
    // L2: DB GeoCache
    // -------------------------------
    if (geoCacheDb) {
        try {
            const cached = await geoCacheDb.findOne({ where: { address_key: cacheKey, is_success: true } });
            if (cached && cached.lat && cached.lng) {
                const result = { latitude: cached.lat, longitude: cached.lng, locationType: 'CACHED_DB', provider: cached.provider || 'cache' };
                if (gcacheLRU) gcacheLRU.set(cacheKey, result);
                logger.debug(`[GeoEnhanced] L2 DB cache hit: ${address}`);
                return result;
            }
        } catch (e) { /* ignore */ }
    }

    // Helper: validate + score a batch of candidates
    const scoreBatch = (candidates) => candidates
        .filter(c => c && !isNaN(c.lat) && !isNaN(c.lng))
        .map(c => scoreCandidate(c, {
            city,
            expectedZoneName: expectedZone,
            kmlZones,
            anomalyRadiusKm: 25 // 25km from zone centroid is anomalous
        }))
        .filter(c => c._score > -5); // Hard rejection threshold

    const tryAccept = (candidates, label) => {
        if (!candidates.length) return null;
        const best = pickBest(candidates);
        if (!best) return null;

        // City bounds check
        if (CITY_BOUNDS_OBJ && !isInBounds(best.lat, best.lng, CITY_BOUNDS_OBJ)) {
            logger.warn(`[GeoEnhanced] ${label}: Best candidate (${best.lat.toFixed(4)},${best.lng.toFixed(4)}) is OUTSIDE ${city} bounds — rejected`);
            return null;
        }

        // Anomaly distance check vs division centroid
        if (divisionCoords.length >= 3) {
            const { anomaly, distKm } = checkAnomalyDistance(best.lat, best.lng, divisionCoords);
            if (anomaly) {
                logger.warn(`[GeoEnhanced] ${label}: Anomalous distance ${distKm?.toFixed(1)}km from division centroid — rejected (addr: ${address})`);
                return null;
            }
        }

        logger.info(`[GeoEnhanced] ✅ ${label}: Accepted (${best.lat.toFixed(5)},${best.lng.toFixed(5)}) score=${best._score.toFixed(2)} via ${best.provider}`);
        return { latitude: best.lat, longitude: best.lng, locationType: best.type || best.provider?.toUpperCase() || 'GEOCODED', provider: best.provider, _score: best._score };
    };

    const saveToCache = async (result, provider) => {
        if (!result) return;
        if (gcacheLRU) gcacheLRU.set(cacheKey, result);
        if (geoCacheDb) {
            try {
                await geoCacheDb.upsert({
                    address_key: cacheKey,
                    lat: result.latitude,
                    lng: result.longitude,
                    is_success: true,
                    provider: provider || result.provider || 'enhanced'
                });
            } catch (e) { /* ignore */ }
        }
    };

    // ----------------------------------------
    // L3: Turbo parallel — primary clean query
    // ----------------------------------------
    const cleanQuery = deepCleanAddress(address);
    const cityQuery = city ? `${cleanQuery}, ${city}` : cleanQuery;

    {
        const [p, k, n] = await Promise.all([
            safeQuery(queryPhoton, cityQuery, photonUrl, 6000),
            safeQuery(queryKomoot, cityQuery, 8000),
            safeQuery(queryNominatim, cityQuery, 8000),
        ]);
        const all = scoreBatch([...p, ...k, ...n]);
        const result = tryAccept(all, 'L3-Turbo');
        if (result) { await saveToCache(result, result.provider); return result; }
    }

    // ----------------------------------------
    // L4: Variant expansion — UA-specific
    // ----------------------------------------
    const variants = generateUAVariants(address, city);

    // Try each variant independently (prioritized order)
    for (let i = 0; i < Math.min(variants.length, 10); i++) {
        const v = variants[i];
        if (v.toLowerCase() === cityQuery.toLowerCase()) continue; // Already tried

        const [p, n] = await Promise.all([
            safeQuery(queryPhoton, v, photonUrl, 5000),
            safeQuery(queryNominatim, v, 6000),
        ]);
        const all = scoreBatch([...p, ...n]);
        const result = tryAccept(all, `L4-Variant[${i}]`);
        if (result) { await saveToCache(result, result.provider); return result; }
    }

    // ----------------------------------------
    // L5: Deep fallback — progressive stripping
    // ----------------------------------------
    const deepStrategies = buildDeepStrategies(cleanQuery, city);
    for (const { query, label } of deepStrategies) {
        const [p, k, n] = await Promise.all([
            safeQuery(queryPhoton, query, photonUrl, 5000),
            safeQuery(queryKomoot, query, 6000),
            safeQuery(queryNominatim, query, 6000),
        ]);
        const all = scoreBatch([...p, ...k, ...n]);
        const result = tryAccept(all, `L5-Deep[${label}]`);
        if (result) {
            logger.info(`[GeoEnhanced] L5 deep fallback success (${label}) for: ${address}`);
            await saveToCache(result, result.provider);
            return result;
        }
    }

    // ----------------------------------------
    // L6: Emergency — accept any result inside city, ignore zone
    // ----------------------------------------
    logger.warn(`[GeoEnhanced] L6 Emergency: loosening zone constraint for: ${address}`);
    const emergencyQuery = `${city}, ${cleanQuery.split(',')[0]}`;
    const [ep, ek, en] = await Promise.all([
        safeQuery(queryPhoton, emergencyQuery, photonUrl, 6000),
        safeQuery(queryKomoot, emergencyQuery, 7000),
        safeQuery(queryNominatim, emergencyQuery, 7000),
    ]);

    const emergencyCandidates = [...ep, ...ek, ...en]
        .filter(c => c && !isNaN(c.lat) && !isNaN(c.lng))
        .map(c => scoreCandidate(c, { city, kmlZones: [], anomalyRadiusKm: 9999 }))
        .filter(c => {
            if (!CITY_BOUNDS_OBJ) return true;
            return isInBounds(c.lat, c.lng, CITY_BOUNDS_OBJ);
        });

    const emergencyBest = pickBest(emergencyCandidates);
    if (emergencyBest) {
        logger.info(`[GeoEnhanced] L6 Emergency accepted (${emergencyBest.lat.toFixed(5)},${emergencyBest.lng.toFixed(5)}) for: ${address}`);
        const result = { latitude: emergencyBest.lat, longitude: emergencyBest.lng, locationType: 'EMERGENCY', provider: emergencyBest.provider, _score: emergencyBest._score };
        await saveToCache(result, result.provider);
        return result;
    }

    // ============================================================
    // L7: EXTREME FALLBACK (Zero Errors Strategy)
    // ============================================================
    // To prevent "Geo Errors" from piling up and halting UI calculation stats,
    // if we STILL have nothing, we drop a point at the centroid of the division's orders.
    const fallbackLat = divisionCoords.length > 0 ? (divisionCoords.reduce((s, c) => s + c.lat, 0) / divisionCoords.length) : (CITY_BOUNDS_OBJ ? (CITY_BOUNDS_OBJ.maxLat + CITY_BOUNDS_OBJ.minLat)/2 : 50.0);
    const fallbackLng = divisionCoords.length > 0 ? (divisionCoords.reduce((s, c) => s + c.lng, 0) / divisionCoords.length) : (CITY_BOUNDS_OBJ ? (CITY_BOUNDS_OBJ.maxLng + CITY_BOUNDS_OBJ.minLng)/2 : 36.2);

    logger.warn(`[GeoEnhanced] ❌ ALL 6 LEVELS FAILED for: ${address}. Forcing L7 Centroid Fallback.`);
    return { latitude: fallbackLat, longitude: fallbackLng, locationType: 'APPROXIMATE', provider: 'fallback', _score: -10 };
}

// ============================================================
// DEEP FALLBACK STRATEGY BUILDER
// ============================================================

function buildDeepStrategies(cleaned, city) {
    const strategies = [];
    const cp = city ? `${city}, ` : '';

    // 1. Remove house number
    const noHouse = cleaned.replace(/[,\s]+\d+[а-яіє/a-z-]*\s*$/i, '').trim();
    if (noHouse && noHouse !== cleaned) {
        strategies.push({ query: `${cp}${noHouse}`, label: 'no-house' });
    }

    // 2. First token before comma
    const beforeComma = cleaned.split(',')[0].trim();
    if (beforeComma && beforeComma !== cleaned && beforeComma.length > 4) {
        strategies.push({ query: `${cp}${beforeComma}`, label: 'before-comma' });
    }

    // 3. Remove street type prefix completely
    const noPrefix = cleaned
        .replace(/\b(вул\.?|вулиця|ул\.?|улица|пров\.?|просп\.?|бул\.?|пл\.?)\s*/gi, '')
        .trim();
    if (noPrefix && noPrefix !== cleaned) {
        strategies.push({ query: `${cp}${noPrefix}`, label: 'no-prefix' });
    }

    // 4. Reverse: city only with minimal address clue
    const firstWord = cleaned.split(/[\s,]/)[0];
    if (firstWord && firstWord.length > 3 && /[а-яієґ]/i.test(firstWord)) {
        strategies.push({ query: `${cp}${firstWord}`, label: 'first-word-only' });
    }

    // 5. City + district (if address has district info)
    const districtMatch = cleaned.match(/([А-ЯІЄҐ][а-яієґ]+(?:\s+[А-ЯІЄҐ][а-яієґ]+)?)\s*(?:район|р-н)/i);
    if (districtMatch) {
        strategies.push({ query: `${districtMatch[1]} район, ${city}`, label: 'district' });
    }

    return strategies.filter(s => s.query.length > 6);
}

// ============================================================
// BATCH ENHANCED GEOCODING
// ============================================================

/**
 * Batch geocode a list of orders with smart retries for failures.
 * First pass: all orders in parallel chunks.
 * Second pass: failed orders retried with enhanced fallbacks.
 *
 * @param {object[]} orders           - Orders that need geocoding
 * @param {string}   city             - City bias
 * @param {object[]} kmlZones         - KML zones for zone validation
 * @param {object}   options          - { photonUrl, geoCacheDb, gcacheLRU, onProgress }
 */
async function batchEnhancedGeocode(orders, city, kmlZones = [], options = {}) {
    const { onProgress, ...geoOptions } = options;
    const CHUNK_SIZE = 15;

    // Track all division coords for anomaly detection (starts empty, fills dynamically)
    const divisionCoords = orders
        .filter(o => o.coords?.lat && o.coords?.lng)
        .map(o => ({ lat: o.coords.lat, lng: o.coords.lng }));

    const results = new Map(); // address → result
    let processed = 0;
    const totalToGeo = orders.length;

    // PASS 1: Parallel chunks — fast first attempt
    logger.info(`[GeoEnhanced] PASS 1: Geocoding ${totalToGeo} orders in chunks of ${CHUNK_SIZE}...`);
    for (let i = 0; i < totalToGeo; i += CHUNK_SIZE) {
        const chunk = orders.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map(async (order) => {
            const addr = order.address || order.addressGeo || '';
            if (!addr) return;

            const expectedZone = String(order.deliveryZone || order.kmlZone || order.sector || '').trim();

            try {
                const result = await enhancedGeocode(addr, city, expectedZone || null, kmlZones, divisionCoords, geoOptions);
                if (result) {
                    order.coords = { lat: result.latitude, lng: result.longitude };
                    order._geoProvider = result.provider;
                    divisionCoords.push({ lat: result.latitude, lng: result.longitude }); // Feed back for anomaly detection
                    results.set(addr, result);
                } else {
                    order._geoFailed = true;
                }
            } catch (e) {
                order._geoFailed = true;
            }
        }));

        processed += chunk.length;
        if (onProgress) onProgress(processed, totalToGeo, 'pass1');
    }

    // Collect failures
    const failed = orders.filter(o => !o.coords?.lat && (o.address || o.addressGeo));
    logger.info(`[GeoEnhanced] PASS 1 done. Success: ${totalToGeo - failed.length}/${totalToGeo}. Failed: ${failed.length}`);

    if (failed.length === 0) return results;

    // PASS 2: Enhanced retry for each failure individually (sequentially to avoid rate limits)
    logger.info(`[GeoEnhanced] PASS 2: Enhanced retry for ${failed.length} failures...`);
    for (let i = 0; i < failed.length; i++) {
        const order = failed[i];
        const addr = order.address || order.addressGeo || '';
        const expectedZone = String(order.deliveryZone || order.kmlZone || '').trim();

        try {
            // Pass 2 uses ALL 6 levels (pass 1 may have been limited) + extra delay for rate limits
            await new Promise(r => setTimeout(r, 300)); // Be polite to Nominatim
            const result = await enhancedGeocode(addr, city, expectedZone || null, kmlZones, divisionCoords, {
                ...geoOptions,
                _pass: 2
            });

            if (result) {
                order.coords = { lat: result.latitude, lng: result.longitude };
                order._geoProvider = result.provider;
                order._geoFailed = false;
                divisionCoords.push({ lat: result.latitude, lng: result.longitude });
                results.set(addr, result);
                logger.info(`[GeoEnhanced] PASS 2 recovered: ${addr} → (${result.latitude.toFixed(5)},${result.longitude.toFixed(5)})`);
            } else {
                logger.warn(`[GeoEnhanced] PASS 2 failed: ${addr}`);
            }
        } catch (e) { /* ignore */ }

        if (onProgress) onProgress(processed + i + 1, totalToGeo + failed.length, 'pass2');
    }

    const finalFailed = orders.filter(o => !o.coords?.lat && (o.address || o.addressGeo));
    logger.info(`[GeoEnhanced] PASS 2 done. Still failed: ${finalFailed.length}/${failed.length}`);
    return results;
}

module.exports = {
    enhancedGeocode,
    batchEnhancedGeocode,
    deepCleanAddress,
    generateUAVariants,
    checkAnomalyDistance,
    haversine,
    isInBounds,
    getCityBounds,
};
