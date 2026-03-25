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
import { isInCityBounds, normalizeCityKey, getCityBounds } from './cityBounds'
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
  STREET_NAME_MISMATCH: -2000000, // Absolute kill

  // House number match
  HOUSE_MATCH_EXACT: 2000,

  // IRON DOME PENALTIES - RESTORED & TUNED FOR FAIRNESS (v35.18 Lockdown)
  DELIVERY_ZONE_MATCH: 15000,         
  WRONG_ZONE_FATAL_PENALTY: -5000000,  
  OUT_OF_ZONE_FATAL_PENALTY: -2000000, 
  MAX_DISTANCE_QUARANTINE: -10000000,  // Fatal
  LOGICAL_CONTINUITY_GAP: -600000,      // Fatal for Iron Dome (-500k)
  HARD_ZONE_EXCLUSION: -100000,        

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

// ─── Haversine distance ────────────────────────────────────────────────────────

export function distanceBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  try {
    // Haversine method (metres) - De-Googled
    const R = 6371000
    const dLat = ((b.lat - a.lat) * Math.PI) / 180
    const dLng = ((b.lng - a.lng) * Math.PI) / 180
    const sinDLat = Math.sin(dLat / 2)
    const sinDLng = Math.sin(dLng / 2)
    const chord =
      sinDLat * sinDLat +
      Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLng *
      sinDLng
    return R * 2 * Math.atan2(Math.sqrt(chord), Math.sqrt(1 - chord))
  } catch {
    return Infinity
  }
}

// ─── Main scoring function ────────────────────────────────────────────────────

export interface ScoringOptions {
  ctx: KmlZoneContext
  expectedHouse?: string | null
  hintPoint?: { lat: number; lng: number } | null
  cityBias?: string
  expectedDeliveryZone?: string | null
  requestedStreetNames?: string[]
}


export function scoreCandidate(
  raw: RawGeoCandidate,
  opts: ScoringOptions
): ScoredCandidate {
  let score = 0
  const coords = extractLatLng(raw.geometry.location)
  if (!coords) {
    return {
      raw,
      lat: 0,
      lng: 0,
      score: -Infinity,
      kmlZone: null,
      kmlHub: null,
      isTechnicalZone: false,
      isInsideZone: false,
      locationType: raw.geometry?.location_type
    }
  }

  const { lat, lng } = coords

  // 1. Location type
  const locType = raw.geometry.location_type
  if (locType === 'ROOFTOP') score += SCORE.ROOFTOP
  else if (locType === 'RANGE_INTERPOLATED') score += SCORE.RANGE_INTERPOLATED
  else if (locType === 'GEOMETRIC_CENTER') score += SCORE.GEOMETRIC_CENTER

  // ★ FATAL REJECTION:
  // If the user provided a house number, but API returned a "city center" match (Approximate),
  // we MUST reject it. Approximate matches for a house search cause 20-50km errors.
  if (locType === 'APPROXIMATE' && opts.expectedHouse) {
    score -= 100000; // Drastic increase to prevent "House" jumping to center 40km away
  }

  // Same for matching a city that is too far or wrong city entirely
  if (locType === 'APPROXIMATE' && !opts.expectedHouse) {
    // Even if no house, city center from a variant is suspicious if it's very low quality
    score -= 5000;
  }


  // 2. Zone checks
  let kmlZone: string | null = null
  let kmlHub: string | null = null
  let isTech = false
  let isInside = false

  // Strict check (for bonuses)
  const strictTolerance = 0.001 
  // Wide check (for detection of disabled zones and near-misses)
  // Increased to ~2.7km (0.025) as per user request to allow "small fallout"
  const wideTolerance = 0.025 

  const locForZones = { lat, lng }
  
  if (opts.ctx.allPolygons.length > 0) {
    const strictMatches = findZonesForLoc(locForZones, opts.ctx.allPolygons, strictTolerance)
    const wideMatches = findZonesForLoc(locForZones, opts.ctx.allPolygons, wideTolerance)

    // B: Check for ACTIVE zones (Strict check first)
    const activeMatch = strictMatches.find(m => !m.isTechnical && isPolygonActive(m.polygon, opts.ctx))
    const techMatch = strictMatches.find(m => m.isTechnical)

    if (activeMatch) {
      kmlZone = activeMatch.polygon.name
      kmlHub = activeMatch.polygon.folderName
      score += SCORE.INSIDE_DELIVERY_ZONE + SCORE.INSIDE_ACTIVE_ZONE
      isInside = true
      // If we are INSIDE an active zone, we don't care about nearby disabled ones
    } else if (techMatch) {
      kmlZone = techMatch.polygon.name
      kmlHub = techMatch.polygon.folderName
      isTech = true
      score += SCORE.TECHNICAL_ZONE_PENALTY
    } else {
      // A: Check for any DISABLED zones nearby (Wide check)
      // Only penalize if we actually have active zones (not in free roam)
      const nearDisabledMatch = wideMatches.find(m => !m.isTechnical && !isPolygonActive(m.polygon, opts.ctx))
      if (nearDisabledMatch && opts.ctx.activePolygons.length > 0) {
        score += SCORE.DISABLED_ZONE_PENALTY 
      }

      // C: Hard fallout check? Check Wide matches for active zones
      const nearActiveMatch = wideMatches.find(m => !m.isTechnical && isPolygonActive(m.polygon, opts.ctx))
      if (nearActiveMatch) {
        kmlZone = nearActiveMatch.polygon.name
        kmlHub = nearActiveMatch.polygon.folderName
        // Small distance penalty instead of fatal OUT_OF_ZONE
        score += SCORE.INSIDE_DELIVERY_ZONE - 300 
        isInside = true 
      } else if (opts.ctx.activePolygons.length > 0) {
        // TRULY OUT OF ALL ZONES
        score += SCORE.OUT_OF_ZONE_PENALTY
      } else {
        // Free roam (no active polygons)
        isInside = true
      }
    }
  } else {
    // No polygons at all -> everything is "inside"
    isInside = true
  }

  // 2.2 Expected Delivery Zone Match (IRON DOME LOGIC)
  if (opts.expectedDeliveryZone) {
    // Helper for Latin-Cyrillic visual lookalikes and punctuation stripping
    const normalizeLookalikes = (s: string) => {
      return s.replace(/[ABCEHKMOPTXYa-zA-Z]/g, (match) => {
        const map: any = {
          'A': 'А', 'B': 'В', 'C': 'С', 'E': 'Е', 'H': 'Н', 'K': 'К', 'M': 'М', 'O': 'О', 'P': 'Р', 'T': 'Т', 'X': 'Х', 'Y': 'У',
          'a': 'а', 'b': 'в', 'c': 'с', 'e': 'е', 'h': 'н', 'k': 'к', 'm': 'м', 'o': 'о', 'p': 'р', 't': 'т', 'x': 'х', 'y': 'у'
        };
        return map[match] || match;
      }).replace(/['"«»‘’“”""ʼ`\s\.\,\-]/g, '').toLowerCase(); // Strip ALL punctuation and spaces
    };

    const rawExpected = normalizeLookalikes(opts.expectedDeliveryZone);
    const eParts = rawExpected.replace(/зона/g, '').split(/[:\-]/).map(p => p.trim()).filter(Boolean);
    
    if (kmlZone) {
      const kName = normalizeLookalikes(kmlZone).replace(/зона/g, '').trim();
      const kHub = kmlHub ? normalizeLookalikes(kmlHub) : '';
      
      const isMatch = eParts.some(p => kName === p || kName.includes(p) || p.includes(kName)) ||
                      (kHub && eParts.some(p => kHub === p || kHub.includes(p) || p.includes(kHub)));
      
      if (isMatch) {
        score += SCORE.DELIVERY_ZONE_MATCH
      } else if (isInside && !isTech) {
        // Point is in a DIFFERENT active delivery zone
        // v42: Replaced fatal penalty with a minor penalty to allow cross-zone matches
        score += -5000 
      } else {
         // In technical or disabled zone near expected zone
         score += SCORE.OUT_OF_ZONE_PENALTY
      }
    } else {
      // No KML zone found for this candidate, but we have an expected zone!
      // v42: Changed from FATAL to strong penalty. We MUST find it if it's anywhere inside!
      score += -20000
    }

    }

    // ─── Global Distance Quarantine (40km Lockdown) ───
    // v35.9.13: CITY LOCKDOWN. Distance check for rejection MUST be against the city center,
    // not the hintPoint (user-provided or previous), to prevent "sticky" incorrect results.
    const cityKey = opts.cityBias || 'київ';
    const cityData = getCityBounds(cityKey);
    const cityCenter = cityData?.center;
    
    // v45: If the candidate actually landed inside our active delivery zone, 
    // we NEVER reject it for being far from center! Suburbs exist.
    if (cityCenter && !isInside) {
      const cLat = cityCenter[1];
      const cLng = cityCenter[0];
      const distToCity = distanceBetween({ lat, lng }, { lat: cLat, lng: cLng });
      
      // v40: Tightened distance violation
      if (distToCity > 20000) { 
        score += SCORE.CITY_RADIUS_VIOLATION; 
        (raw as any)._rejectReason = `Fatal distance: ${(distToCity/1000).toFixed(1)}km from city center (v40)`;
      } else if (distToCity > 12000) {
        // v40: Severe penalty for suspicious distance if expected zone present
        score += (opts.expectedDeliveryZone ? SCORE.SUSPICIOUS_DISTANCE * 5 : SCORE.SUSPICIOUS_DISTANCE);
      }
    }

    // Still use hintPoint for proximity BONUSES, but not for REJECTIONS.
    if (opts.hintPoint) {
      // ... hint logic handled below in section 4
    }

  // 2.5 String match checks for KML Hub/Zone names
  // If the formatted address contains the name of one of the active polygons/folders, reward it
  const fullAddr = (raw.formatted_address || '').toLowerCase()
  if (opts.ctx.activePolygons.length > 0) {
    for (const poly of opts.ctx.activePolygons) {
      if (fullAddr.includes(poly.name.toLowerCase())) {
        score += SCORE.ZONE_NAME_MATCH
      }
      if (fullAddr.includes(poly.folderName.toLowerCase())) {
        score += SCORE.HUB_NAME_MATCH
      }
    }
  }

  // 2.8 Building Class Bias
  const typeStr = (raw.types || []).join(',').toLowerCase();
  const buildingTypes = ['house', 'building', 'apartments', 'residential', 'premise', 'subpremise'];
  if (buildingTypes.some(t => typeStr.includes(t))) {
    score += SCORE.BUILDING_CLASS_BONUS;
  }

  // 3. House number match
  if (opts.expectedHouse) {
    const streetNum = (raw.address_components || []).find(c =>
      c.types.includes('street_number')
    )?.long_name

    if (streetNum) {
      const sNum = streetNum.toLowerCase().replace(/[^a-z0-9а-яієґ]/g, '')
      const eHouse = opts.expectedHouse.toLowerCase().replace(/[^a-z0-9а-яієґ]/g, '')

      if (sNum === eHouse) {
        score += SCORE.HOUSE_MATCH_EXACT
      } else if (sNum.includes(eHouse) || eHouse.includes(sNum)) {
        score += SCORE.FUZZY_HOUSE_MATCH
      } else {
        score += SCORE.HAS_STREET_NUMBER
      }
    }
  }

  // 4. Proximity & Hub Bias
  if (opts.ctx.activePolygons.length > 0) {
    // Check distance to center of each active polygon (as a proxy for hub proximity)
    let minHubDist = Infinity
    for (const poly of opts.ctx.activePolygons) {
      const path = poly.path
      if (path && path.length > 0) {
        // Simple centroid of the path points for hub bias
        const center = path.reduce((acc, p) => ({ 
            lat: acc.lat + p.lat / path.length, 
            lng: acc.lng + p.lng / path.length 
        }), { lat: 0, lng: 0 })
        
        const d = distanceBetween({ lat, lng }, center)
        if (d < minHubDist) minHubDist = d
      }
    }

    if (minHubDist < 2000) score += SCORE.HUB_BIAS_2KM
    else if (minHubDist < 5000) score += SCORE.HUB_BIAS_5KM
  }

  if (opts.hintPoint) {
    const dist = distanceBetween({ lat, lng }, opts.hintPoint)
    if (dist < 1000) score += SCORE.PROXIMITY_1KM + SCORE.PROXIMITY_2KM + SCORE.PROXIMITY_5KM
    else if (dist < 2000) score += SCORE.PROXIMITY_2KM + SCORE.PROXIMITY_5KM
    else if (dist < 5000) score += SCORE.PROXIMITY_5KM

    // ─── Massive Jump Penalties (v35.9.14: Iron Curtain) ───
    // We multiply these by 20 to ensure they override minor provider score variations.
    if (dist > 50000) score += SCORE.PENALTY_DIST_50KM * 20;
    else if (dist > 30000) score += SCORE.PENALTY_DIST_30KM * 20;
    else if (dist > 15000) score += SCORE.PENALTY_DIST_15KM * 20;
  }

  // 6. City mismatch and Bounding Box check
  if (opts.cityBias) {
    const addr = (raw.formatted_address || '').toLowerCase()
    const city = opts.cityBias.toLowerCase()

    // First check strict geospatial bounds
    const isOut = !isInCityBounds(lat, lng, city, 0.05) 
    
    if (isOut && normalizeCityKey(city) !== null) {
      score += SCORE.OUT_OF_BBOX_PENALTY
    } else {
      // Bonus for selected city (both spellings)
      const isDirectMatch = addr.includes(city) || (city === 'киев' && addr.includes('київ')) || (city === 'київ' && addr.includes('киев'))
      if (isDirectMatch) {
        score += SCORE.CITY_CONFIRMED + SCORE.CITY_EXACT_MATCH_BONUS
      } else {
        // Check if the address contains a DIFFERENT city/suburb name than our bias
        // Suburbs like Brovary, Boryspil etc. should be penalized if looking for Kyiv
        // Check if the address contains a DIFFERENT city/suburb name than our bias
        // Suburbs like Brovary, Boryspil etc. should be penalized if looking for Kyiv

        const KYIV_SUBURBS = [
          'софіївська', 'софиевская', 'борщагівка', 'борщаговка', 'вишневе', 'вишневое', 
          'петропавлівська', 'петропавловская', 'чайки', 'крюківщина', 'крюковщина', 
          'гатне', 'гатное', 'квітневе', 'квітневий', 'бровари', 'бровары', 'вишгород', 'вишгород',
          'коцюбинське', 'коцюбинское', 'хотів', 'хотов', 'лісники', 'лесники',
          'білогородка', 'белогородка', 'гореничі', 'гореничи', 'стоянка', 'тарасівка', 'тарасовка',
          'святопетрівське', 'святопетровское', 'юрівка', 'юрьевка', 'ходосівка', 'ходосовка'
        ]
        const isKyivBias = city === 'киев' || city === 'київ'
        const matchesSuburb = isKyivBias && KYIV_SUBURBS.some(s => addr.includes(s))
        
        // v35.9.26: Dynamic City Lockdown with Active KML Trust
        const cityData = getCityBounds(city)
        const validCityNames = cityData ? cityData.names : [city]
        
        // Deep check: formatted string + address components
        const cityInString = validCityNames.some(cn => addr.includes(cn))
        const cityInComponents = (raw.address_components || []).some(comp => {
          const l = (comp.long_name || '').toLowerCase()
          const s = (comp.short_name || '').toLowerCase()
          return validCityNames.some(cn => l.includes(cn) || s.includes(cn))
        })
        const hasCurrentCity = cityInString || cityInComponents

        if (matchesSuburb) {
           score += SCORE.CITY_CONFIRMED + SCORE.CITY_EXACT_MATCH_BONUS;
        }

        // ABSOLUTE CITY LOCKDOWN
        // v35.9.26: 3KM PROXIMITY TRUST
        // If the point is outside an active zone, check if it's within 3km of ANY active zone.
        let distToNearestActiveZone = Infinity
        if (opts.ctx?.activePolygons) {
           for (const p of opts.ctx.activePolygons) {
             const center = (p as any)._center || (p.bounds ? { lat: (p.bounds.south + p.bounds.north) / 2, lng: (p.bounds.west + p.bounds.east) / 2 } : null)
             if (center) {
               const d = distanceBetween({ lat, lng }, center)
               if (d < distToNearestActiveZone) distToNearestActiveZone = d
             }
           }
        }
        const isNearActiveZone = distToNearestActiveZone < 3000 // 3km limit per user request

        // Lockdown logic
        if (!hasCurrentCity && !matchesSuburb && !isInside && !isNearActiveZone) {
           score += SCORE.CITY_MISMATCH_PENALTY;
           (raw as any)._rejectReason = `Lockdown: Not in ${city} or known suburb, and >3km from active zones. (v35.9.26)`;
        } else if ((isInside || isNearActiveZone) && !hasCurrentCity) {
           // Soften the penalty for proximity but don't kill the candidate
           if (!isInside) {
             score -= 50000 
             console.log(`[Геокодинг] SOFT LOCKDOWN: точка в 3км от зоны (дистанция=${Math.round(distToNearestActiveZone)}м). Уменьшаем штраф.`)
           } else {
             console.log(`[Геокодинг] LOCKDOWN BYPASS: точка в активной зоне "${kmlZone}". Полное доверие.`)
           }
        }
      }
    }
  }

  // 7. Street Name Validation (v35.9.5: Triple-Pass Slavic Sniper)
  const candidateFull = (raw.formatted_address || '').toLowerCase()
  // candidateRoute and candidateNormal unused after v35.9.11 word-boundary refactor

  if (opts.requestedStreetNames && opts.requestedStreetNames.length > 0) {
    let matchedRoot: string | null = null
    const candidateTokens = candidateFull.replace(/[ʼ`]/g, "'").split(/[\s,.'ʼ`"\-]+/).map(t => slavicNormalize(t)).filter(t => t.length > 0)

    for (const req of opts.requestedStreetNames) {
        const reqNormal = slavicNormalize(req)
        if (reqNormal.length < 3) continue 
        
        // Pass 1: Word-Boundary Match (v35.9.11)
        if (candidateTokens.includes(reqNormal)) {
            const hasExtraOrdinal = candidateFull.match(/\b\d+[\s\-]*(?:та|ша|га|ій|ий|ка)\b/i) && !req.match(/\d+(?:та|ша|га|ій|ий|ка)/i)
            
            if (hasExtraOrdinal) {
                console.warn(`[RobustGeocode v35.9.14] ORDINAL COLLISION: "${candidateFull}" contains ordinal not in "${req}"`)
                continue 
            }

            matchedRoot = req
            break
        }
    }

    if (!matchedRoot) {
      // v35.9.26: PREZUMPTION OF CORRECTNESS
      // If the address is inside an ACTIVE user-drawn zone, we treat street mismatch as a minor warning, NOT a kill.
      // This allows coordinates in custom zones to survive even if the street name in metadata is slightly different.
      if (isInside) {
        score -= 200000 // Was 50000, but -2M was too aggressive. -200k is a safe middle ground for in-zone.
        console.warn(`[Геокодинг] SOFT STREET MISMATCH: точка в активной зоне "${kmlZone}", но улица "${candidateFull}" не совпала с корнем.`)
      } else {
        score += SCORE.STREET_NAME_MISMATCH
        const missing = opts.requestedStreetNames.join('|')
        ;(raw as any)._rejectReason = `Street mismatch. Expected one of [${missing}]`
        console.error(`[RobustGeocode v35.9.13] FAIL: "${candidateFull}" vs Roots: [${missing}]`)
      }
    } else {
      // v35.9.38: Silent mode for PASS logs to improve performance and clarity
      // console.log(`[RobustGeocode v35.9.14] PASS: "${candidateFull}" (Root: "${matchedRoot}")`)
    }
  } else if (opts.expectedHouse) {
      score -= 400000 
      console.warn(`[RobustGeocode v35.9.5] WARN: Roots empty for "${candidateFull}"`)
  }

  const expectedHouseNormal = opts.expectedHouse?.toLowerCase().replace(/[^a-z0-9а-яієґ]/g, '')
  const streetNumNormal = (raw.address_components || []).find(c => c.types.includes('street_number'))?.long_name?.toLowerCase().replace(/[^a-z0-9а-яієґ]/g, '')
  const streetNumberMatched = !!expectedHouseNormal && streetNumNormal === expectedHouseNormal

  return { raw, lat, lng, score, kmlZone, kmlHub, isTechnicalZone: isTech, isInsideZone: isInside, streetNumberMatched, locationType: raw.geometry?.location_type }
}

// ─── Perfect hit detection ────────────────────────────────────────────────────

/**
 * A "perfect hit" means we can stop all further API calls immediately.
 * Conditions: ROOFTOP or RANGE_INTERPOLATED + inside delivery zone + house match.
 */
export function isPerfectHit(
  candidate: ScoredCandidate,
  expectedHouse: string | null,
  requestedStreetNames?: string[]
): boolean {
  const locType = candidate.raw.geometry.location_type
  if (locType !== 'ROOFTOP' && locType !== 'RANGE_INTERPOLATED') return false
  if (!candidate.isInsideZone) return false
  if (candidate.isTechnicalZone) return false
  
  // v35.9.5: Enhanced street match for "Perfect Hit"
  if (requestedStreetNames && requestedStreetNames.length > 0) {
    const candidateFull = (candidate.raw.formatted_address || '').toLowerCase().replace(/[ʼ`]/g, "'")
    const candidateRoute = (candidate.raw.address_components || []).find(comp => (comp.types || []).includes('route'))?.long_name?.toLowerCase()
    
    const candNormFull = slavicNormalize(candidateFull)
    const candNormRoute = candidateRoute ? slavicNormalize(candidateRoute) : null

    const isMatched = requestedStreetNames.some(req => {
        const reqNorm = slavicNormalize(req)
        if (reqNorm.length < 3) return false
        return candNormFull.includes(reqNorm) || (candNormRoute && candNormRoute.includes(reqNorm))
    })
    if (!isMatched) return false
  }

  if (expectedHouse) {
    const streetNum = (candidate.raw.address_components || []).find(c =>
      c.types.includes('street_number')
    )?.long_name
    
    if (!streetNum) return false
    
    const sNum = streetNum.toLowerCase().replace(/[^a-z0-9а-яієґ]/g, '')
    const eHouse = expectedHouse.toLowerCase().replace(/[^a-z0-9а-яієґ]/g, '')
    
    if (sNum !== eHouse) return false
  }
  return true
}

// ─── Best candidate picker ────────────────────────────────────────────────────

export function pickBest(candidates: ScoredCandidate[]): ScoredCandidate | null {
  if (candidates.length === 0) return null

  // IRON DOME: Hard Zone Exclusion
  // If we have ANY candidates with DELIVERY_ZONE_MATCH bonus (score > 10000),
  // we suppress ALL candidates that don't have it by applying an extra penalty.
  const hasInZoneMatch = candidates.some(c => c.score >= 10000)
  if (hasInZoneMatch) {
      candidates.forEach(c => {
          if (c.score < 10000) {
              c.score += SCORE.HARD_ZONE_EXCLUSION
          }
      })
  }

  return candidates.reduce((best, c) => (c.score > best.score ? c : best), candidates[0])
}
