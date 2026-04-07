/**
 * ValhallaService — Primary Routing Engine
 *
 * Uses Valhalla (MIT-license, OSM-based) via the public FOSSGIS server.
 * Docs: https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/
 *
 * Features:
 *  ✔ Completely free, no API key needed
 *  ✔ Real road distances (not Haversine)
 *  ✔ Supports auto, motorcycle, motor_scooter costing
 *  ✔ Ukrainian roads (full planet OSM data)
 *  ✔ Returns distances in km → we convert to meters for consistency
 */

import { localStorageUtils } from '../utils/ui/localStorage'

export type ValhallaCostingModel = 'auto' | 'motorcycle' | 'motor_scooter' | 'pedestrian' | 'bicycle'

export interface ValhallaLeg {
  distance: { text: string; value: number }   // value in METERS
  duration: { text: string; value: number }   // value in seconds
  start_location?: { lat: number; lng: number }
  end_location?: { lat: number; lng: number }
}

export interface ValhallaRouteResult {
  feasible: boolean
  legs?: ValhallaLeg[]
  totalDuration?: number    // seconds
  totalDistance?: number    // METERS
  shape?: string            // encoded polyline (precision=6)
}

// ─── Public FOSSGIS server, fair-use policy (same as OSRM/Nominatim) ─────────
const VALHALLA_BASE_URL = 'https://valhalla1.openstreetmap.de'

// ─── In-memory dedup cache (key = ordered lat/lon pairs) ─────────────────────
const _routeCache = new Map<string, ValhallaRouteResult>()
const MAX_CACHE_SIZE = 500
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 min
const _cacheTimestamps = new Map<string, number>()

function _makeCacheKey(locations: { lat: number; lng: number }[], costing: string): string {
  return `${costing}:` + locations.map(l => `${l.lat.toFixed(5)},${l.lng.toFixed(5)}`).join('|')
}

function _clearOldCache(): void {
  if (_routeCache.size < MAX_CACHE_SIZE) return
  const now = Date.now()
  for (const [k, ts] of _cacheTimestamps) {
    if (now - ts > CACHE_TTL_MS) {
      _routeCache.delete(k)
      _cacheTimestamps.delete(k)
    }
  }
}

export class ValhallaService {
  /**
   * Get the vehicle costing model from user settings.
   */
  static getCostingModel(): ValhallaCostingModel {
    try {
      const settings = localStorageUtils.getAllSettings()
      return (settings.vehicleType as ValhallaCostingModel) || 'auto'
    } catch {
      return 'auto'
    }
  }

  /**
   * Calculate a route between an ordered list of waypoints.
   * Returns distances in METERS (to be consistent with the rest of the codebase).
   */
  static async calculateRoute(
    locations: { lat: number; lng: number }[],
    costing?: ValhallaCostingModel
  ): Promise<ValhallaRouteResult> {
    if (locations.length < 2) {
      return { feasible: false }
    }

    const costingModel = costing || this.getCostingModel()
    const cacheKey = _makeCacheKey(locations, costingModel)

    // ── In-memory cache check ────────────────────────────────────────────────
    const cached = _routeCache.get(cacheKey)
    if (cached) {
      const age = Date.now() - (_cacheTimestamps.get(cacheKey) || 0)
      if (age < CACHE_TTL_MS) return cached
    }

    // Filter out any NaN coordinates just in case
    const validLocations = locations.filter(l => !isNaN(l.lat) && !isNaN(l.lng))
    if (validLocations.length < 2) return { feasible: false }

    const valhallaLocations = validLocations.map((loc, idx) => ({
      lat: loc.lat,
      lon: loc.lng,
      // Use 'break' for all points if small route (<5), otherwise 'through' for middle points
      type: (idx === 0 || idx === validLocations.length - 1 || validLocations.length < 5) ? 'break' : 'through'
    }))

    const payload = {
      locations: valhallaLocations,
      costing: costingModel,
      // Metric units — length is km, time is seconds
      units: 'km',
      directions_type: 'none',   // skip verbose turn-by-turn text → faster
    }

    try {
      const response = await fetch(`${VALHALLA_BASE_URL}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000) // 10 second timeout for quality
      })

      if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText)
        console.warn(`[Valhalla] route failed ${response.status}: ${errText}`)
        return { feasible: false }
      }

      const data = await response.json()
      const trip = data.trip

      if (!trip || trip.status !== 0) {
        console.warn('[Маршрут] Проблема с результатом Valhalla:', trip?.status_message)
        return { feasible: false }
      }

      // ── Map legs ────────────────────────────────────────────────────────────
      // Each leg is between two consecutive "break" locations.
      // trip.legs[i].summary.length is in KM (we requested units: 'km')
      // trip.legs[i].summary.time is in seconds.
      const legs: ValhallaLeg[] = (trip.legs || []).map((leg: any, idx: number) => {
        const distanceKm: number = leg.summary?.length ?? 0
        const distanceM = Math.round(distanceKm * 1000)   // → Meters
        const durationS: number = Math.round(leg.summary?.time ?? 0)

        return {
          distance: {
            value: distanceM,
            text: distanceM >= 1000
              ? `${(distanceM / 1000).toFixed(1)} км`
              : `${distanceM} м`
          },
          duration: {
            value: durationS,
            text: durationS >= 3600
              ? `${Math.floor(durationS / 3600)} ч ${Math.round((durationS % 3600) / 60)} мин`
              : `${Math.round(durationS / 60)} мин`
          },
          start_location: locations[idx]
            ? { lat: locations[idx].lat, lng: locations[idx].lng }
            : undefined,
          end_location: locations[idx + 1]
            ? { lat: locations[idx + 1].lat, lng: locations[idx + 1].lng }
            : undefined,
        }
      })

      // Total summary from the trip
      const totalDistanceM = Math.round((trip.summary?.length ?? 0) * 1000)   // km → m
      const totalDurationS = Math.round(trip.summary?.time ?? 0)
      const shape = trip.legs?.[0]?.shape ?? undefined

      const result: ValhallaRouteResult = {
        feasible: true,
        legs,
        totalDistance: totalDistanceM,
        totalDuration: totalDurationS,
        shape,
      }

      // ── Cache the result ────────────────────────────────────────────────────
      _clearOldCache()
      _routeCache.set(cacheKey, result)
      _cacheTimestamps.set(cacheKey, Date.now())

      return result
    } catch (error: any) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        console.warn('[Маршрут] Таймаут Valhalla — переключаюсь на OSRM')
      } else {
        console.warn('[Маршрут] Ошибка Valhalla:', error?.message ?? error)
      }
      return { feasible: false }
    }
  }

  /**
   * Quick point-to-point distance estimate using matrix (single leg).
   * Faster than full routing for simple 2-point checks.
   */
  static async getPointDistance(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    costing?: ValhallaCostingModel
  ): Promise<{ distanceM: number; durationS: number } | null> {
    const result = await this.calculateRoute([from, to], costing)
    if (!result.feasible || !result.totalDistance) return null
    return { distanceM: result.totalDistance, durationS: result.totalDuration ?? 0 }
  }

  /**
   * Valhalla Distance Matrix (Many-to-Many)
   * Uses the /sources_to_targets endpoint.
   * Max points depends on the server, typically 50x50 or 100x100.
   */
  static async getMatrix(
    sources: { lat: number; lng: number }[],
    targets: { lat: number; lng: number }[],
    costing?: ValhallaCostingModel
  ): Promise<{ distance: number; duration: number }[][] | null> {
    const costingModel = costing || this.getCostingModel()

    const payload = {
      sources: sources.map(s => ({ lat: s.lat, lon: s.lng })),
      targets: targets.map(t => ({ lat: t.lat, lon: t.lng })),
      costing: costingModel,
      units: 'km'
    }

    try {
      const response = await fetch(`${VALHALLA_BASE_URL}/sources_to_targets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000)
      })

      if (!response.ok) {
        console.warn(`[Valhalla Matrix] failed: ${response.status}`)
        return null
      }

      const data = await response.json()
      if (!data.sources_to_targets) return null

      // Map the 2D array of results. Valhalla returns distance in KM (since units: 'km')
      return data.sources_to_targets.map((row: any[]) => 
        row.map(cell => ({
          distance: Math.round((cell.distance || 0) * 1000), // m
          duration: Math.round(cell.time || 0)             // s
        }))
      )
    } catch (err) {
      console.warn('[Маршрут] Ошибка матрицы Valhalla:', err)
      return null
    }
  }
}
