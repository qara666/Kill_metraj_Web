/**
 * KML Zone Checker
 *
 * Pure functions (no React, no Google globals required at import time).
 * All Google Maps API calls are guarded by runtime checks.
 */
import type { KmlPolygonData, KmlZoneContext } from './types'

// ─── Technical zone detection ─────────────────────────────────────────────────

const TECHNICAL_ZONE_PATTERN =
  /авторозвантаження|технічна|авторазгрузка|авто.?розвантаж|technical/i

export function isTechnicalZone(polygon: KmlPolygonData): boolean {
  return (
    TECHNICAL_ZONE_PATTERN.test(polygon.name) ||
    TECHNICAL_ZONE_PATTERN.test(polygon.folderName)
  )
}

/**
 * Returns true if the polygon is currently active (part of an active hub and selected by the user).
 */
export function isPolygonActive(polygon: KmlPolygonData, ctx: KmlZoneContext): boolean {
  // 1. Must be in the activePolygons list (this list usually contains polygons from active hubs)
  const isFromActiveHub = ctx.activePolygons.some(p => p.key === polygon.key)
  if (!isFromActiveHub) return false

  // 2. If the user has a specific subset of zones selected, it must be in that list
  if (ctx.selectedZoneKeys.length > 0) {
    return ctx.selectedZoneKeys.includes(polygon.key)
  }

  return true
}

// ─── Point-in-polygon ─────────────────────────────────────────────────────────

/**
 * Returns true if `loc` is inside or on the edge of `polygon`.
 * Requires `window.google.maps.geometry` to be loaded.
 */
export function containsLocation(loc: any, polygon: KmlPolygonData): boolean {
  if (typeof window === 'undefined' || !window.google?.maps?.geometry) return false
  try {
    // Fast AABB rejection
    if (polygon.bounds && !polygon.bounds.contains(loc)) return false

    const poly =
      polygon.googlePoly ||
      new window.google.maps.Polygon({ paths: polygon.path || [] })

    return (
      window.google.maps.geometry.poly.containsLocation(loc, poly) ||
      window.google.maps.geometry.poly.isLocationOnEdge(loc, poly, 0.001)
    )
  } catch {
    return false
  }
}

// ─── Zone finder ──────────────────────────────────────────────────────────────

export interface ZoneMatch {
  polygon: KmlPolygonData
  isTechnical: boolean
}

/**
 * Find all zones that contain `loc`, from a list of polygons.
 * Returns them sorted: delivery zones first, then technical.
 */
export function findZonesForLoc(
  loc: any,
  polygons: KmlPolygonData[]
): ZoneMatch[] {
  const matches: ZoneMatch[] = []

  for (const poly of polygons) {
    if (containsLocation(loc, poly)) {
      matches.push({ polygon: poly, isTechnical: isTechnicalZone(poly) })
    }
  }

  // Delivery zones first
  matches.sort((a, b) => (a.isTechnical ? 1 : 0) - (b.isTechnical ? 1 : 0))
  return matches
}

/**
 * Find the best (single) zone for `loc`, respecting active zone selection.
 * Prefers delivery zones over technical zones.
 */
export function findBestZone(
  loc: any,
  ctx: KmlZoneContext
): ZoneMatch | null {
  // 1. Try active/selected polygons first
  const activeMatches = findZonesForLoc(loc, ctx.activePolygons)
  if (activeMatches.length > 0) return activeMatches[0]

  // 2. Fall back to all polygons
  const allMatches = findZonesForLoc(loc, ctx.allPolygons)
  return allMatches[0] || null
}

/**
 * Returns true if `loc` is inside ANY active delivery polygon (non-technical).
 */
export function isInsideDeliveryZone(loc: any, ctx: KmlZoneContext): boolean {
  const match = findBestZone(loc, ctx)
  return match !== null && !match.isTechnical
}

/**
 * Returns true if `loc` falls in a technical / auto-unload zone.
 */
export function isInsideTechnicalZone(loc: any, ctx: KmlZoneContext): boolean {
  const matches = findZonesForLoc(loc, ctx.allPolygons)
  return matches.some(m => m.isTechnical)
}

/**
 * Normalise a Google Maps LatLng-like value to a plain LatLng object.
 * Handles both function-style (Google Maps SDK) and plain object styles.
 */
export function toLatLng(loc: any): any {
  if (!loc) return null
  if (typeof loc.lat === 'function') return loc
  try {
    const lat = Number(
      typeof loc.lat === 'function' ? (loc.lat as () => number)() : loc.lat
    )
    const lng = Number(
      typeof loc.lng === 'function' ? (loc.lng as () => number)() : loc.lng
    )
    if (isNaN(lat) || isNaN(lng)) return null
    return new window.google.maps.LatLng(lat, lng)
  } catch {
    return null
  }
}

/**
 * Extract normalised lat/lng numbers from any Google-LatLng-like value.
 */
export function extractLatLng(loc: any): { lat: number; lng: number } | null {
  if (!loc) return null
  try {
    const lat = typeof loc.lat === 'function' ? loc.lat() : Number(loc.lat)
    const lng = typeof loc.lng === 'function' ? loc.lng() : Number(loc.lng)
    if (isNaN(lat) || isNaN(lng)) return null
    return { lat, lng }
  } catch {
    return null
  }
}
