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

export function isPolygonActive(polygon: KmlPolygonData, ctx: KmlZoneContext): boolean {
  if (isTechnicalZone(polygon)) return true

  // STRICT REQUIREMENT: polygon must be exclusively in the user's active selections
  return ctx.selectedZoneKeys.includes(polygon.key)
}

// ─── Spatial Grid Index ───────────────────────────────────────────────────────

/**
 * A simple grid-based spatial index to avoid O(N) polygon checks.
 * Divides the world into small cells (~1km at the equator).
 */
const GRID_SIZE = 0.01 // ~1.1km
const gridIndex = new Map<string, KmlPolygonData[]>()
let lastPolygonsId: string | null = null

function getGridKeys(poly: KmlPolygonData): string[] {
  if (!poly.bounds) return []
  const b = poly.bounds
  const swLat = b.south
  const swLng = b.west
  const neLat = b.north
  const neLng = b.east

  if (swLat === undefined || neLat === undefined) return []

  const keys: string[] = []
  for (let lat = Math.floor(swLat / GRID_SIZE); lat <= Math.floor(neLat / GRID_SIZE); lat++) {
    for (let lng = Math.floor(swLng / GRID_SIZE); lng <= Math.floor(neLng / GRID_SIZE); lng++) {
      keys.push(`${lat},${lng}`)
    }
  }
  return keys
}

function rebuildGrid(polygons: KmlPolygonData[]) {
  const id = polygons.map(p => p.key).join('|').slice(0, 100) + polygons.length
  if (id === lastPolygonsId) return

  gridIndex.clear()
  for (const poly of polygons) {
    const keys = getGridKeys(poly)
    for (const key of keys) {
      if (!gridIndex.has(key)) gridIndex.set(key, [])
      gridIndex.get(key)!.push(poly)
    }
  }
  lastPolygonsId = id
}

function getPolygonsFromGrid(lat: number, lng: number, allPolygons: KmlPolygonData[]): KmlPolygonData[] {
  // If too few polygons, skip grid overhead
  if (allPolygons.length < 20) return allPolygons

  rebuildGrid(allPolygons)
  const key = `${Math.floor(lat / GRID_SIZE)},${Math.floor(lng / GRID_SIZE)}`
  return gridIndex.get(key) || []
}

// ─── Point-in-polygon ─────────────────────────────────────────────────────────

/**
 * Returns true if `loc` is inside or on the edge of `polygon`.
 * Optimized with AABB pre-check and robust Ray-Casting.
 */
export function containsLocation(loc: any, polygon: KmlPolygonData, tolerance: number = 0.005): boolean {
  const coords = extractLatLng(loc)
  if (!coords) return false

  const x = coords.lat
  const y = coords.lng

  // 1. Fast AABB Rejection (Axis-Aligned Bounding Box)
  if (polygon.bounds) {
    const b = polygon.bounds
    // Removed Google Maps API specific checks for bounds
    const s = b.south
    const n = b.north
    const w = b.west
    const e = b.east

    if (x < s - tolerance || x > n + tolerance ||
      y < w - tolerance || y > e + tolerance) return false
  }

  // 2. Google Maps SDK removed (De-Googling)

  // 3. Fallback: Ultra-Fast Ray-Casting with edge support
  const path = polygon.path || []
  if (path.length < 3) return false

  let inside = false
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const xi = path[i].lat, yi = path[i].lng
    const xj = path[j].lat, yj = path[j].lng

    // Core condition for crossing
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi)

    if (intersect) inside = !inside

    // Edge proximity check (Crucial for "no misses")
    const dx = xj - xi
    const dy = yj - yi
    if (Math.abs(dy) < 1e-10) { // Horizontal edge
      if (Math.abs(y - yi) < tolerance && x >= Math.min(xi, xj) - tolerance && x <= Math.max(xi, xj) + tolerance) return true
    } else if (Math.abs(dx) < 1e-10) { // Vertical edge
      if (Math.abs(x - xi) < tolerance && y >= Math.min(yi, yj) - tolerance && y <= Math.max(yi, yj) + tolerance) return true
    } else {
      // General edge distance (point to segment)
      const crossProduct = Math.abs(dy * x - dx * y + xj * yi - yj * xi)
      const distance = crossProduct / Math.sqrt(dx * dx + dy * dy)
      if (distance < tolerance) {
        // Point must be within the segment projection
        if (x >= Math.min(xi, xj) - tolerance && x <= Math.max(xi, xj) + tolerance &&
          y >= Math.min(yi, yj) - tolerance && y <= Math.max(yi, yj) + tolerance) return true
      }
    }
  }

  return inside
}



// ─── Spatial Cache ────────────────────────────────────────────────────────────
/**
 * Global cache to store zone lookup results by coordinate.
 */
const spatialCache = new Map<string, ZoneMatch[]>()

export function clearSpatialCache(): void {
  spatialCache.clear()
  gridIndex.clear()
  lastPolygonsId = null
}

function getCoordKey(loc: any, tolerance: number): string | null {
  const coords = extractLatLng(loc)
  if (!coords) return null
  return `${coords.lat.toFixed(6)},${coords.lng.toFixed(6)},${tolerance}`
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
  polygons: KmlPolygonData[],
  tolerance: number = 0.005
): ZoneMatch[] {
  const coords = extractLatLng(loc)
  if (!coords) return []

  const cacheKey = getCoordKey(loc, tolerance)
  const fullKey = cacheKey ? `${cacheKey}:${polygons.length}` : null

  if (fullKey && spatialCache.has(fullKey)) {
    return spatialCache.get(fullKey)!
  }

  // 1. Grid Filtering
  const candidates = getPolygonsFromGrid(coords.lat, coords.lng, polygons)
  const matches: ZoneMatch[] = []

  // 2. Precise Check
  for (const poly of candidates) {
    if (containsLocation(loc, poly, tolerance)) {
      matches.push({ polygon: poly, isTechnical: isTechnicalZone(poly) })
    }
  }

  // 3. Global sort: delivery zones first, then smaller polygons (more precise)
  matches.sort((a, b) => {
    if (a.isTechnical !== b.isTechnical) return a.isTechnical ? 1 : -1
    // Optional: could sort by area here if we pre-calculate it
    return 0
  })

  if (fullKey) {
    spatialCache.set(fullKey, matches)
  }

  return matches
}

/**
 * Find the best (single) zone for `loc`, respecting active zone selection.
 * Prefers delivery zones over technical zones.
 */
export function findBestZone(
  loc: any,
  ctx: KmlZoneContext,
  tolerance: number = 0.005
): ZoneMatch | null {
  // Use active (hub-scoped) polygons first
  if (ctx.activePolygons.length > 0) {
    const activeMatches = findZonesForLoc(loc, ctx.activePolygons, tolerance)
    if (activeMatches.length > 0) return activeMatches[0]
  }

  // FALLBACK REMOVED: Do NOT return inactive zones as "best".
  // This prevents assigning disabled sectors ("Федорова" etc) to orders.
  return null
}

/**
 * Returns true if `loc` is inside ANY active delivery polygon.
 */
export function isInsideDeliveryZone(loc: any, ctx: KmlZoneContext): boolean {
  const match = findBestZone(loc, ctx)
  return match !== null && !match.isTechnical
}

/**
 * Returns true if `loc` falls in a technical zone.
 */
export function isInsideTechnicalZone(loc: any, ctx: KmlZoneContext): boolean {
  const matches = findZonesForLoc(loc, ctx.allPolygons)
  return matches.some(m => m.isTechnical)
}

/**
 * Normalise to plain LatLng object.
 */
export function toLatLng(loc: any): { lat: number, lng: number } | null {
  if (!loc) return null
  try {
    const lat = Number(typeof loc.lat === 'function' ? loc.lat() : loc.lat)
    const lng = Number(typeof loc.lng === 'function' ? loc.lng() : loc.lng)
    if (isNaN(lat) || isNaN(lng)) return null

    // window.google.maps.LatLng usage removed
    return { lat, lng }
  } catch {
    return null
  }
}

/**
 * Extract lat/lng numbers.
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
