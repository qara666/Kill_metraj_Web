/**
 * Candidate Scoring
 *
 * Deterministic, pure scoring logic for geocoding candidates.
 * Higher score = better candidate. No side effects.
 */
import type { RawGeoCandidate, ScoredCandidate, KmlZoneContext } from './types'
import {
  extractLatLng,
  findZonesForLoc,
  isPolygonActive,
} from './kmlZoneChecker'
import { getCityBounds } from './cityBounds'
import { slavicNormalize } from '../../utils/address/addressNormalization'

// ─── Score constants ───────────────────────────────────────────────────────────

export const SCORE = {
  ROOFTOP: 100,
  RANGE_INTERPOLATED: 50,
  GEOMETRIC_CENTER: 10,
  APPROXIMATE: 0,

  // Zone bonuses (v44: MASSIVE BOOST to guarantee points inside KML zones always win)
  INSIDE_DELIVERY_ZONE: 5000000,  
  INSIDE_ACTIVE_ZONE: 3000000,    

  // Technical zone kills
  TECHNICAL_ZONE_PENALTY: -99999,
  DISABLED_ZONE_PENALTY: -10000,
  OUT_OF_ZONE_PENALTY: -20000,
  CITY_MISMATCH_PENALTY: -2000000,     // Total Kill (v35.9.8)
  OUT_OF_BBOX_PENALTY: -1000000,       // Severe
  CITY_RADIUS_VIOLATION: -2000000,    // Fatal Kill (v35.9.8)
  CITY_RADIUS_QUARANTINE: -600000,     // Severe (>20km)
  CITY_EXACT_MATCH_BONUS: 1000000,    // Stay in City Priority!
  SUSPICIOUS_DISTANCE: -200000,       // Distance > 15km (v35.9.10)

  // String match bonuses for KML names
  HUB_NAME_MATCH: 300,
  ZONE_NAME_MATCH: 500,

  // Name match criticality
  STREET_NAME_MATCH: 5000,
  STREET_NAME_MISMATCH: -2000000, // Absolute kill

  // House number match
  HOUSE_MATCH_EXACT: 2000,

  // IRON DOME PENALTIES - RESTORED & TUNED FOR FAIRNESS (v5.118 Lockdown)
  DELIVERY_ZONE_MATCH: 15000,         
  WRONG_ZONE_FATAL_PENALTY: -5000000,  
  OUT_OF_ZONE_FATAL_PENALTY: -2000000, 
  MAX_DISTANCE_QUARANTINE: -10000000,  // Fatal
  LOGICAL_CONTINUITY_GAP: -600000,      // Fatal for Iron Dome (-500k)
  HARD_ZONE_EXCLUSION: -100000,        
  STRICT_CITY_LOCKDOWN: -15000000,     // v5.118: Fatal kill for 35km+ anomalies
  OUT_OF_ZONE_FATAL: -15000000,        // v5.128: Hard KML enforcement

  // Proximity to hint point (Chain Logic - MASSIVE WEIGHT)
  PROXIMITY_500M: 2000, // Now stronger than ROOFTOP difference
  PROXIMITY_1KM: 1000,
  PROXIMITY_2KM: 500,
  PROXIMITY_5KM: 200,

  // Jump Penalties
  PENALTY_DIST_15KM: -10000,
  PENALTY_DIST_30KM: -20000,
  PENALTY_DIST_50KM: -40000,

  // Hub proximity bias
  HUB_BIAS_2KM: 300,
  HUB_BIAS_5KM: 150,

  // Ukraine city bias
  CITY_CONFIRMED: 5000, // Boosted from 2000

  // Fallback address components
  HAS_STREET_NUMBER: 100,
  FUZZY_HOUSE_MATCH: 150,

  // CONSENSUS & BUILDING BIAS
  MULTI_PROVIDER_CONSENSUS: 10000,
  BUILDING_CLASS_BONUS: 3000,
} as const

// ── Haversine distance ────────────────────────────────────────────────────────

export function distanceBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  try {
    const R = 6371000
    const dLat = ((b.lat - a.lat) * Math.PI) / 180
    const dLng = ((b.lng - a.lng) * Math.PI) / 180
    const sinDLat = Math.sin(dLat / 2)
    const sinDLng = Math.sin(dLng / 2)
    const chord = sinDLat * sinDLat + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinDLng * sinDLng
    return R * 2 * Math.atan2(Math.sqrt(chord), Math.sqrt(1 - chord))
  } catch { return Infinity }
}

// ── Main scoring function ────────────────────────────────────────────────────

export interface ScoringOptions {
  ctx: KmlZoneContext
  expectedHouse?: string | null
  hintPoint?: { lat: number; lng: number } | null
  cityBias?: string
  expectedDeliveryZone?: string | null
  requestedStreetNames?: string[]
  turbo?: boolean
}

export function scoreCandidate(raw: RawGeoCandidate, opts: ScoringOptions): ScoredCandidate {
  let score = 0
  const coords = extractLatLng(raw.geometry.location)
  if (!coords) {
    return { raw, lat: 0, lng: 0, score: -Infinity, kmlZone: null, kmlHub: null, isTechnicalZone: false, isInsideZone: false, locationType: raw.geometry?.location_type }
  }
  const { lat, lng } = coords

  // 1. Location type
  const locType = raw.geometry.location_type
  if (locType === 'ROOFTOP') score += SCORE.ROOFTOP
  else if (locType === 'RANGE_INTERPOLATED') score += SCORE.RANGE_INTERPOLATED
  else if (locType === 'GEOMETRIC_CENTER') score += SCORE.GEOMETRIC_CENTER

  if (locType === 'APPROXIMATE' && opts.expectedHouse) {
    score -= 30000
  }

  // 2. Zone checks
  let kmlZone: string | null = null
  let kmlHub: string | null = null
  let isTech = false
  let isInside = false

  const cityBiasLower = (opts.cityBias || '').toLowerCase();
  if (cityBiasLower === 'київ' || cityBiasLower === 'киев' || cityBiasLower === 'kyiv') {
    const KYIV_LAT = 50.4501; const KYIV_LNG = 30.5234;
    const dLat = (lat - KYIV_LAT) * Math.PI / 180; const dLng = (lng - KYIV_LNG) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(KYIV_LAT * Math.PI/180) * Math.cos(lat * Math.PI/180) * Math.sin(dLng/2)**2;
    const distFromKyivKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    if (distFromKyivKm > 65) {
      const belongsInZone = opts.ctx.allPolygons.length > 0 && findZonesForLoc({ lat, lng }, opts.ctx.allPolygons, 0.01).some(m => !m.isTechnical && isPolygonActive(m.polygon, opts.ctx));
      if (!belongsInZone) {
        score += SCORE.STRICT_CITY_LOCKDOWN;
        (raw as any)._rejectReason = `Hard city radius: ${distFromKyivKm.toFixed(1)}km from Kyiv center (>65km limit)`;
      }
    }
  }

  const strictTolerance = 0.001; const wideTolerance = 0.01;
  const locForZones = { lat, lng }
  
  if (opts.ctx.allPolygons.length > 0) {
    const strictMatches = findZonesForLoc(locForZones, opts.ctx.allPolygons, strictTolerance)
    const wideMatches = findZonesForLoc(locForZones, opts.ctx.allPolygons, wideTolerance)
    const activeMatch = strictMatches.find(m => !m.isTechnical && isPolygonActive(m.polygon, opts.ctx))
    const techMatch = strictMatches.find(m => m.isTechnical)

    if (activeMatch) {
      kmlZone = activeMatch.polygon.name; kmlHub = activeMatch.polygon.folderName;
      score += SCORE.INSIDE_DELIVERY_ZONE + SCORE.INSIDE_ACTIVE_ZONE; isInside = true;
    } else if (techMatch) {
      kmlZone = techMatch.polygon.name; kmlHub = techMatch.polygon.folderName;
      isTech = true; score += SCORE.TECHNICAL_ZONE_PENALTY;
    } else {
      const nearDisabledMatch = wideMatches.find(m => !m.isTechnical && !isPolygonActive(m.polygon, opts.ctx))
      if (nearDisabledMatch && opts.ctx.activePolygons.length > 0) { score += SCORE.DISABLED_ZONE_PENALTY }
      const nearActiveMatch = wideMatches.find(m => !m.isTechnical && isPolygonActive(m.polygon, opts.ctx))
      if (nearActiveMatch) {
        kmlZone = nearActiveMatch.polygon.name; kmlHub = nearActiveMatch.polygon.folderName;
        score += SCORE.INSIDE_DELIVERY_ZONE - 300; isInside = true;
      } else if (opts.ctx.activePolygons.length > 0) {
        score += SCORE.OUT_OF_ZONE_FATAL;
      } else { isInside = true; }
    }
  } else { isInside = true; }

  if (opts.expectedDeliveryZone) {
    const normalizeLookalikes = (s: string) => s.replace(/[ABCEHKMOPTXYa-zA-Z]/g, (match) => ({
      'A': 'А', 'B': 'В', 'C': 'С', 'E': 'Е', 'H': 'Н', 'K': 'К', 'M': 'М', 'O': 'О', 'P': 'Р', 'T': 'Т', 'X': 'Х', 'Y': 'У',
      'a': 'а', 'b': 'в', 'c': 'с', 'e': 'е', 'h': 'н', 'k': 'к', 'm': 'м', 'o': 'о', 'p': 'р', 't': 'т', 'x': 'х', 'y': 'у'
    }[match] || match)).replace(/['"«»‘’“”""ʼ`\s\.\,\-]/g, '').toLowerCase();
    const rawExpected = normalizeLookalikes(opts.expectedDeliveryZone);
    const eParts = rawExpected.replace(/зона/g, '').split(/[:\-]/).map(p => p.trim()).filter(Boolean);
    if (kmlZone) {
      const kName = normalizeLookalikes(kmlZone).replace(/зона/g, '').trim();
      const kHub = kmlHub ? normalizeLookalikes(kmlHub) : '';
      const isMatch = eParts.some(p => kName === p || kName.includes(p) || p.includes(kName)) || (kHub && eParts.some(p => kHub === p || kHub.includes(p) || p.includes(kHub)));
      if (isMatch) score += SCORE.DELIVERY_ZONE_MATCH;
      else if (isInside && !isTech) score += -5000;
      else score += SCORE.OUT_OF_ZONE_PENALTY;
    } else {
      score += opts.ctx.activePolygons.length > 0 ? SCORE.OUT_OF_ZONE_FATAL : -20000;
    }
  }

  const cityKey = opts.cityBias || 'київ'; const cityData = getCityBounds(cityKey); const cityCenter = cityData?.center;
  if (cityCenter && !isInside) {
    const cLat = cityCenter[1]; const cLng = cityCenter[0];
    const distToCity = distanceBetween({ lat, lng }, { lat: cLat, lng: cLng });
    if (distToCity > 65000) {
      score += SCORE.STRICT_CITY_LOCKDOWN;
      (raw as any)._rejectReason = `Fatal anomaly: ${(distToCity/1000).toFixed(1)}km from Kyiv metro area`;
    } else if (distToCity > 20000) {
      score += SCORE.CITY_RADIUS_VIOLATION;
    }
  }

  const fullAddr = (raw.formatted_address || '').toLowerCase()
  if (opts.ctx.activePolygons.length > 0) {
    for (const poly of opts.ctx.activePolygons) {
      if (fullAddr.includes(poly.name.toLowerCase())) score += SCORE.ZONE_NAME_MATCH
      if (fullAddr.includes(poly.folderName.toLowerCase())) score += SCORE.HUB_NAME_MATCH
    }
  }

  if (opts.expectedHouse) {
    const streetNum = (raw.address_components || []).find(c => c.types.includes('street_number'))?.long_name
    if (streetNum) {
      const sNum = streetNum.toLowerCase().replace(/[^a-z0-9а-яієґ]/g, '')
      const eHouse = opts.expectedHouse.toLowerCase().replace(/[^a-z0-9а-яієґ]/g, '')
      if (sNum === eHouse) score += SCORE.HOUSE_MATCH_EXACT
      else if (sNum.includes(eHouse) || eHouse.includes(sNum)) score += SCORE.FUZZY_HOUSE_MATCH
    }
  }

  if (opts.requestedStreetNames && opts.requestedStreetNames.length > 0) {
    const matchesRequested = opts.requestedStreetNames.some(req => slavicNormalize((raw.formatted_address || '').toLowerCase()).includes(slavicNormalize(req.toLowerCase())));
    if (matchesRequested) score += SCORE.STREET_NAME_MATCH;
    else {
        if (opts.turbo) score -= 1000;
        else score += SCORE.STREET_NAME_MISMATCH;
    }
  }

  if (opts.hintPoint) {
    const dist = distanceBetween({ lat, lng }, opts.hintPoint)
    if (dist < 1000) score += SCORE.PROXIMITY_1KM + SCORE.PROXIMITY_2KM + SCORE.PROXIMITY_5KM
    else if (dist < 2000) score += SCORE.PROXIMITY_2KM + SCORE.PROXIMITY_5KM
    else if (dist < 15000) score += SCORE.PROXIMITY_5KM
    if (dist > 50000) score += SCORE.PENALTY_DIST_50KM * 20;
    else if (dist > 30000) score += SCORE.PENALTY_DIST_30KM * 20;
    else if (dist > 15000) score += SCORE.PENALTY_DIST_15KM * 20;
  }

  if (opts.cityBias) {
    const city = opts.cityBias.toLowerCase()
    if (fullAddr.includes(city) || (city === 'киев' && fullAddr.includes('київ')) || (city === 'київ' && fullAddr.includes('киев'))) {
      score += SCORE.CITY_CONFIRMED + SCORE.CITY_EXACT_MATCH_BONUS
    }
  }

  return { raw, lat, lng, score, kmlZone, kmlHub, isTechnicalZone: isTech, isInsideZone: isInside, streetNumberMatched: score >= SCORE.HOUSE_MATCH_EXACT, locationType: raw.geometry?.location_type }
}

export function isPerfectHit(candidate: ScoredCandidate, expectedHouse: string | null, requestedStreetNames?: string[]): boolean {
  const locType = candidate.raw.geometry.location_type
  if (locType !== 'ROOFTOP' && locType !== 'RANGE_INTERPOLATED') return false
  if (!candidate.isInsideZone) return false
  if (candidate.isTechnicalZone) return false
  if (requestedStreetNames && requestedStreetNames.length > 0) {
    const full = slavicNormalize((candidate.raw.formatted_address || '').toLowerCase())
    if (!requestedStreetNames.some(req => full.includes(slavicNormalize(req.toLowerCase())))) return false
  }
  if (expectedHouse) {
    const streetNum = (candidate.raw.address_components || []).find(c => c.types.includes('street_number'))?.long_name
    if (!streetNum) return false
    if (streetNum.toLowerCase().replace(/[^a-z0-9а-яієґ]/g, '') !== expectedHouse.toLowerCase().replace(/[^a-z0-9а-яієґ]/g, '')) return false
  }
  return true
}

export function pickBest(candidates: ScoredCandidate[]): ScoredCandidate | null {
  if (candidates.length === 0) return null
  const hasInZoneMatch = candidates.some(c => c.score >= 10000)
  if (hasInZoneMatch) {
      candidates.forEach(c => { if (c.score < 10000) c.score += SCORE.HARD_ZONE_EXCLUSION })
  }
  return candidates.reduce((best, c) => (c.score > best.score ? c : best), candidates[0])
}
