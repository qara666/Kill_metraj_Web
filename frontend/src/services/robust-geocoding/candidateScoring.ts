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

//  Score constants 

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
  
  // String match bonuses for KML names
  HUB_NAME_MATCH: 300,
  ZONE_NAME_MATCH: 500,

  // Name match criticality
  STREET_NAME_MATCH: 5000,
  STREET_NAME_MISMATCH: -2000000, // Absolute kill

  // House number match
  HOUSE_MATCH_EXACT: 5000000, // v17.36: MASSIVE BOOST to force acceptance if house is found

  // IRON DOME PENALTIES - RESTORED & TUNED FOR FAIRNESS (v5.118 Lockdown)
  DELIVERY_ZONE_MATCH: 15000,         
  WRONG_ZONE_FATAL_PENALTY: -5000000,  
  OUT_OF_ZONE_FATAL_PENALTY: -2000000, 
  MAX_DISTANCE_QUARANTINE: -10000000,  // Fatal
  LOGICAL_CONTINUITY_GAP: -600000,      // Fatal for Iron Dome (-500k)
  HARD_ZONE_EXCLUSION: -100000,        
  STRICT_CITY_LOCKDOWN: -15000000,     // v5.118: Fatal kill for 35km+ anomalies
  OUT_OF_ZONE_FATAL: -15000000,        // v17.14: Fully Fatal to prevent "Massive Distance" jumps
  SUSPICIOUS_DISTANCE: -2000000,       // Distance > 35km (v17.31 Restoration)

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

<<<<<<< Updated upstream
//  Haversine distance 
=======
const SCORE_STRICT_CITY_LOCKDOWN_RADIUS = 55000; // v17.36: Increased to 55km for Kyiv suburbs

// ─── Haversine distance ────────────────────────────────────────────────────────
>>>>>>> Stashed changes

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

//  Main scoring function 

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
<<<<<<< Updated upstream
    return { raw, lat: 0, lng: 0, score: -Infinity, kmlZone: null, kmlHub: null, isTechnicalZone: false, isInsideZone: false, locationType: raw.geometry?.location_type }
=======
    return {
      raw,
      lat: 0,
      lng: 0,
      score: -Infinity,
      kmlZone: null,
      kmlHub: null,
      isTechnicalZone: false,
      isInsideZone: false,
      hasGeoErrors: true, 
      locationType: raw.geometry?.location_type
    }
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
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
=======
  // v17.2.2: GLOBAL CITY RADIUS PRE-GUARD (Regional Shield)
  // Catches macroscopic jumps (e.g. 700km to another oblast) before expensive checks.
  const activeCityData = getCityBounds(opts.cityBias || '');
  let distFromCenterKm = 0;
  let belongsInAnyZone = false;
  let cityMatch = false;
  let isCertain = false;

  if (activeCityData) {
    const [cLng, cLat] = activeCityData.center;
    distFromCenterKm = distanceBetween({ lat, lng }, { lat: cLat, lng: cLng }) / 1000;
    
    // v17.2.2: TRUST THE USER'S KML. If the candidate is in ANY defined KML zone 
    // (even if currently unselected), it is NOT a mutant. This allows suburb planning.
    belongsInAnyZone = opts.ctx.allPolygons.length > 0 && 
      findZonesForLoc({ lat, lng }, opts.ctx.allPolygons, 0.01).length > 0;
    
    // Also trust if the address explicitly mentions the biased city
    const addrLC = (raw.formatted_address || '').toLowerCase();
    cityMatch = activeCityData.names.some(n => addrLC.includes(n));
    
    // Also trust perfect hits (exact street number) up to 200km
    isCertain = !!((raw.geometry?.location_type === 'ROOFTOP' || 
                       raw.address_components?.some((c: any) => c.types?.includes('street_number'))) && 
                       distFromCenterKm < 200);
    
    // v17.2.2: Widened to 120km to prevent killing suburbs like Fastiv/Bila Tserkva
    const maxRadius = activeCityData.lockdownRadiusKm || 120;
    
    if (distFromCenterKm > maxRadius) {
      if (!belongsInAnyZone && !cityMatch && !isCertain) {
        // FATAL LOCKDOWN: Truly in the wrong city or 200km+ deep anomaly
        score += SCORE.STRICT_CITY_LOCKDOWN; // -15,000,000
        (raw as any)._rejectReason = `Lockdown: ${distFromCenterKm.toFixed(1)}km from center (No KML/City Match)`;
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
=======
    // v45: If the candidate actually landed inside ANY KML zone or explicitly matched the city,
    // we NEVER reject it for being far from center! Suburbs exist.
    if (activeCityData && !isInside && !belongsInAnyZone && !cityMatch && !isCertain) {
      const distToCity = distFromCenterKm * 1000; // back to meters
      
      // v17.2.2: Hard Regional Lockdown (Prevent >120km anomalies)
      const lockdownLimit = (activeCityData.lockdownRadiusKm || 120) * 1000;
      if (distToCity > lockdownLimit) {
        score += SCORE.STRICT_CITY_LOCKDOWN;
        (raw as any)._rejectReason = `Fatal anomaly: ${(distToCity/1000).toFixed(1)}km from ${opts.cityBias || 'center'} (Lockdown)`;
      } else if (distToCity > 60000) { 
        // Penalize but don't kill addresses between 60km and 120km if no KML matches
        score += SCORE.CITY_RADIUS_VIOLATION; 
        (raw as any)._rejectReason = `Severe distance: ${(distToCity/1000).toFixed(1)}km from center`;
      } else if (distToCity > 30000) {
        // Suspicious distance (30km+)
        score += (opts.expectedDeliveryZone ? SCORE.SUSPICIOUS_DISTANCE * 5 : SCORE.SUSPICIOUS_DISTANCE);
      }
    }

    // Still use hintPoint for proximity BONUSES, but not for REJECTIONS.
    if (opts.hintPoint) {
      // ... hint logic handled below in section 4
    }

  // 2.5 String match checks for KML Hub/Zone names
  // If the formatted address contains the name of one of the active polygons/folders, reward it
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
      if (sNum === eHouse) score += SCORE.HOUSE_MATCH_EXACT
      else if (sNum.includes(eHouse) || eHouse.includes(sNum)) score += SCORE.FUZZY_HOUSE_MATCH
=======

      // v5.150: Handle suffixes like 15г vs 15-г or 15 Г
      if (sNum === eHouse) {
        score += SCORE.HOUSE_MATCH_EXACT
      } else if (sNum.replace(/[а-яієґ]/g, '') === eHouse.replace(/[а-яієґ]/g, '')) {
        // Same number, different or missing letter suffix
        score += SCORE.HOUSE_MATCH_EXACT / 2
      } else if (sNum.includes(eHouse) || eHouse.includes(sNum)) {
        score += SCORE.FUZZY_HOUSE_MATCH
      } else {
        score += SCORE.HAS_STREET_NUMBER
      }
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
    if (fullAddr.includes(city) || (city === 'киев' && fullAddr.includes('київ')) || (city === 'київ' && fullAddr.includes('киев'))) {
      score += SCORE.CITY_CONFIRMED + SCORE.CITY_EXACT_MATCH_BONUS
    }
  }

  return { raw, lat, lng, score, kmlZone, kmlHub, isTechnicalZone: isTech, isInsideZone: isInside, streetNumberMatched: score >= SCORE.HOUSE_MATCH_EXACT, locationType: raw.geometry?.location_type }
=======

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
          'гатне', 'гатное', 'квітневе', 'квітневий', 'бровари', 'бровары', 'вишгород', 'вышгород',
          'коцюбинське', 'коцюбинское', 'хотів', 'хотов', 'лісники', 'лесники',
          'білогородка', 'белогородка', 'гореничі', 'гореничи', 'стоянка', 'тарасівка', 'тарасовка',
          'святопетрівське', 'святопетровское', 'юрівка', 'юрьевка', 'ходосівка', 'ходосовка',
          'обухів', 'обухов', 'українка', 'украинка', 'ірпінь', 'ирпень', 'буча', 'ворзель', 'гостомель',
          'бориспіль', 'борисполь', 'щасливе', 'счастливое', 'проліски', 'пролески', 'чубинське', 'чубинское'
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
      // v2.3: Slavic Language Fallback (SLF) —
      // If house number matches perfectly and it's in the correct city,
      // we allow street mismatch to pass as a "soft" warning instead of a kill.
      const expectedHouse = opts.expectedHouse?.toLowerCase().replace(/[^a-z0-9а-яієґ]/g, '')
      const streetNum = (raw.address_components || []).find(c => c.types.includes('street_number'))?.long_name?.toLowerCase().replace(/[^a-z0-9а-яієґ]/g, '')
      
      const houseMatch = expectedHouse && streetNum === expectedHouse

      if (isInside || houseMatch) {
        score -= 150000 // v2.3: Reduced from -2.0M to allow candidate survival if house matches
        console.warn(`[Геокодинг] SOFT STREET MISMATCH: точка в активной зоне или дом совпал (${streetNum}), но улица "${candidateFull}" не совпала с корнем. Это нормально для EN/UA перевода.`)
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
  } else if (opts.requestedStreetNames && opts.expectedHouse) {
      // v2.3: Silent log for Turbo mode
      // console.log(`[RobustGeocode v35.9.5] INFO: Roots empty for "${candidateFull}"`)
  }

  const expectedHouseNormal = opts.expectedHouse?.toLowerCase().replace(/[^a-z0-9а-яієґ]/g, '')
  const streetNumNormal = (raw.address_components || []).find(c => c.types.includes('street_number'))?.long_name?.toLowerCase().replace(/[^a-z0-9а-яієґ]/g, '')
  
  // v5.129: Also check formatted_address for the house number —
  // Photon/Nominatim often omit address_components.street_number even when
  // they return the correct address. A regex match against the display string
  // prevents false "needs clarification" flags for most urban addresses.
  let streetNumberMatched = !!expectedHouseNormal && streetNumNormal === expectedHouseNormal
  if (!streetNumberMatched && expectedHouseNormal && raw.formatted_address) {
    const addrLower = raw.formatted_address.toLowerCase()
    // v17.27: HYPER-ROBUST HOUSE REGEX - Matches "13/14", "15а", "15-б", "15Б"
    const escapedHouse = expectedHouseNormal.replace(/[\/\-\.]/g, '\\$&')
    const houseRegex = new RegExp(`\\b${escapedHouse}[а-яієґa-z\\/\\-]*\\b`)
      if (houseRegex.test(addrLower)) {
        streetNumberMatched = true
      }
    }

    // v17.36: Restore Fatal Distance Penalty (Iron Dome) with 55km radius
    const distFromSearch = (raw as any)._dist || 0;
    if (distFromSearch > SCORE_STRICT_CITY_LOCKDOWN_RADIUS) { 
      score += SCORE.STRICT_CITY_LOCKDOWN;
      console.error(`[Scoring] FATAL: Result too far from center (${(distFromSearch/1000).toFixed(1)}km). Rejecting.`);
    }

    // v17.36: MASSIVE TRUST - If score is boosted by HOUSE_MATCH, we don't flag as error
    const hasGeoErrors = score < -1000000 || (!isInside && distFromSearch > 5000 && score < 1000000);

    return { 
      raw, lat, lng, score, kmlZone, kmlHub, 
      isTechnicalZone: isTech, 
      isInsideZone: isInside, 
      hasGeoErrors,
      streetNumberMatched, 
      locationType: raw.geometry?.location_type 
    }
>>>>>>> Stashed changes
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
