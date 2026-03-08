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

// ─── Score constants ───────────────────────────────────────────────────────────

export const SCORE = {
  ROOFTOP: 100,
  RANGE_INTERPOLATED: 50,
  GEOMETRIC_CENTER: 10,
  APPROXIMATE: 0,

  // Zone bonuses
  INSIDE_DELIVERY_ZONE: 200,
  INSIDE_ACTIVE_ZONE: 50, // active selection bonus on top of delivery

  // Technical zone kills
  TECHNICAL_ZONE_PENALTY: -99999, // effectively eliminates the candidate
  DISABLED_ZONE_PENALTY: -5000,    // strongly penalises candidates in disabled zones
  OUT_OF_ZONE_PENALTY: -5000,       // heavily penalise candidates not in any zone

  // House number match
  HOUSE_MATCH_EXACT: 150,

  // Proximity to hint point
  PROXIMITY_5KM: 30,
  PROXIMITY_2KM: 20,
  PROXIMITY_1KM: 10,

  // Ukraine city bias
  CITY_CONFIRMED: 20,

  // Fallback address components
  HAS_STREET_NUMBER: 30,
} as const

// ─── Haversine distance ────────────────────────────────────────────────────────

function distanceBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  try {
    if (typeof window !== 'undefined' && window.google?.maps?.geometry?.spherical) {
      const aLatLng = new window.google.maps.LatLng(a.lat, a.lng)
      const bLatLng = new window.google.maps.LatLng(b.lat, b.lng)
      return window.google.maps.geometry.spherical.computeDistanceBetween(aLatLng, bLatLng)
    }
    // Haversine fallback (metres)
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
}

export function scoreCandidate(
  raw: RawGeoCandidate,
  opts: ScoringOptions
): ScoredCandidate {
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
    }
  }

  const { lat, lng } = coords
  let score = 0

  // 1. Location type
  const locType = raw.geometry.location_type
  if (locType === 'ROOFTOP') score += SCORE.ROOFTOP
  else if (locType === 'RANGE_INTERPOLATED') score += SCORE.RANGE_INTERPOLATED
  else if (locType === 'GEOMETRIC_CENTER') score += SCORE.GEOMETRIC_CENTER

  // Convert to Google LatLng for polygon checks
  let googleLoc: any = null
  try {
    if (typeof window !== 'undefined' && window.google?.maps?.LatLng) {
      googleLoc = new window.google.maps.LatLng(lat, lng)
    }
  } catch { /* Google not loaded */ }

  // 2. Zone checks
  let kmlZone: string | null = null
  let kmlHub: string | null = null
  let isTech = false
  let isInside = false

  const tolerance = 0.05 // ~5.5km tolerance for all candidates to bridge gaps in KML drawings

  if (googleLoc && opts.ctx.allPolygons.length > 0) {
    const zoneMatches = findZonesForLoc(googleLoc, opts.ctx.allPolygons, tolerance)

    if (zoneMatches.length > 0) {
      // Prioritize active zones first, then delivery zones, then technical zones
      const sortedMatches = [...zoneMatches].sort((a, b) => {
        const aActive = isPolygonActive(a.polygon, opts.ctx) ? 1 : 0
        const bActive = isPolygonActive(b.polygon, opts.ctx) ? 1 : 0
        
        if (aActive !== bActive) return bActive - aActive // Active first
        return (a.isTechnical ? 1 : 0) - (b.isTechnical ? 1 : 0) // Delivery first
      })

      const bestMatch = sortedMatches[0]

      kmlZone = bestMatch.polygon.name
      kmlHub = bestMatch.polygon.folderName
      isTech = bestMatch.isTechnical

      if (isTech) {
        score += SCORE.TECHNICAL_ZONE_PENALTY
      } else {
        // ★ CRITICAL FIX: Only give delivery bonus if the zone is ACTIVE
        const isActive = isPolygonActive(bestMatch.polygon, opts.ctx)

        if (isActive) {
          score += SCORE.INSIDE_DELIVERY_ZONE
          isInside = true

          // Active zone bonus (extra nudge for explicitly selected sectors)
          if (opts.ctx.selectedZoneKeys.includes(bestMatch.polygon.key)) {
            score += SCORE.INSIDE_ACTIVE_ZONE
          }
        } else {
          // It's in a delivery zone, but it's DISABLED (hub off or sector unselected)
          score += SCORE.DISABLED_ZONE_PENALTY
          isInside = false
        }
      }
    } else {
      // Not in any zone (active, disabled, or technical)
      score += SCORE.OUT_OF_ZONE_PENALTY
    }
  }

  // 3. House number match
  if (opts.expectedHouse) {
    const streetNum = (raw.address_components || []).find(c =>
      c.types.includes('street_number')
    )?.long_name
    if (streetNum && streetNum.toLowerCase() === opts.expectedHouse.toLowerCase()) {
      score += SCORE.HOUSE_MATCH_EXACT
    } else if ((raw.address_components || []).some(c => c.types.includes('street_number'))) {
      score += SCORE.HAS_STREET_NUMBER
    }
  }

  // 4. Proximity to hint point
  if (opts.hintPoint) {
    const dist = distanceBetween({ lat, lng }, opts.hintPoint)
    if (dist < 1000) score += SCORE.PROXIMITY_1KM + SCORE.PROXIMITY_2KM + SCORE.PROXIMITY_5KM
    else if (dist < 2000) score += SCORE.PROXIMITY_2KM + SCORE.PROXIMITY_5KM
    else if (dist < 5000) score += SCORE.PROXIMITY_5KM
  }

  // 5. City confirmation
  if (opts.cityBias) {
    const addr = (raw.formatted_address || '').toLowerCase()
    if (addr.includes(opts.cityBias.toLowerCase())) {
      score += SCORE.CITY_CONFIRMED
    }
  }

  return { raw, lat, lng, score, kmlZone, kmlHub, isTechnicalZone: isTech, isInsideZone: isInside }
}

// ─── Perfect hit detection ────────────────────────────────────────────────────

/**
 * A "perfect hit" means we can stop all further API calls immediately.
 * Conditions: ROOFTOP or RANGE_INTERPOLATED + inside delivery zone + house match.
 */
export function isPerfectHit(
  candidate: ScoredCandidate,
  expectedHouse: string | null
): boolean {
  const locType = candidate.raw.geometry.location_type
  if (locType !== 'ROOFTOP' && locType !== 'RANGE_INTERPOLATED') return false
  if (!candidate.isInsideZone) return false
  if (candidate.isTechnicalZone) return false
  if (expectedHouse) {
    const streetNum = (candidate.raw.address_components || []).find(c =>
      c.types.includes('street_number')
    )?.long_name
    if (!streetNum || streetNum.toLowerCase() !== expectedHouse.toLowerCase()) return false
  }
  return true
}

// ─── Best candidate picker ────────────────────────────────────────────────────

export function pickBest(candidates: ScoredCandidate[]): ScoredCandidate | null {
  if (candidates.length === 0) return null
  return candidates.reduce((best, c) => (c.score > best.score ? c : best), candidates[0])
}
