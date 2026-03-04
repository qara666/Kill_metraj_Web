/**
 * Централизованный кеш для всех Google Maps API запросов.
 *
 * v2 COST OPTIMIZATIONS:
 *  - Persistent localStorage cache (30-day TTL) — survives page reloads
 *  - In-flight deduplication — same request never fires twice simultaneously
 *  - MAX_CONCURRENT reduced to 5 — prevents billing spikes
 *  - Cache-first: always serve from cache before hitting the API
 * 
 * v3 EFFICIENCY UPGRADES:
 *  - Address Normalization: Treat "ул. Ленина, 5" and "Ленина 5" as the same key.
 *  - Result Minification: Store only essential data (90% size reduction in L1).
 *  - LRU Strategy: Cap L1 to 500 entries to maintain fast startup.
 */

import { localStorageUtils } from '../utils/ui/localStorage'
import { DBGeocache } from './dbGeocache'
import { normalizeAddress } from '../utils/address/addressNormalization'

// ─── Constants ──────────────────────────────────────────────────────────────

const GEO_STORAGE_KEY = 'km_geocache_v2'
const DIR_STORAGE_KEY = 'km_dircache_v2'

const GEO_TTL_MS = 30 * 24 * 60 * 60 * 1000   // 30 days
const DIR_TTL_MS = 60 * 60 * 1000              // 1 hour (directions can change with traffic)

const MAX_GEO_ENTRIES = 500                    // Higher practicality: keep L1 lean
const MAX_DIR_ENTRIES = 100

// ─── Types ───────────────────────────────────────────────────────────────────

interface GeocodeRequest {
  address?: string
  location?: { lat: number; lng: number }
  region?: string
  bounds?: any
  componentRestrictions?: any
}

interface DirectionsRequest {
  origin: any
  destination: any
  waypoints?: any[]
  travelMode?: any
  optimizeWaypoints?: boolean
  unitSystem?: any
  avoidHighways?: boolean
  avoidTolls?: boolean
  avoidFerries?: boolean
  drivingOptions?: any
  region?: string
  provideRouteAlternatives?: boolean
}

interface StoredEntry<T> {
  value: T
  expiresAt: number
  lastUsed?: number
}

// ─── GoogleApiCache class ────────────────────────────────────────────────────

class GoogleApiCache {
  private geocodeCache: Map<string, StoredEntry<any[]>> = new Map()
  private directionsCache: Map<string, StoredEntry<any>> = new Map()

  private geocoderInstance: any = null
  private directionsServiceInstance: any = null

  private inFlightGeocode = new Map<string, Promise<any[]>>()
  private queue: Array<() => void> = []
  private activeCalls = 0
  private readonly MAX_CONCURRENT = 5

  constructor() {
    const geoData = localStorageUtils.getData(GEO_STORAGE_KEY)
    if (geoData) this.geocodeCache = new Map(Object.entries(geoData))

    const dirData = localStorageUtils.getData(DIR_STORAGE_KEY)
    if (dirData) this.directionsCache = new Map(Object.entries(dirData))
  }

  initialize(): void {
    if (typeof window !== 'undefined' && window.google?.maps) {
      if (!this.geocoderInstance && window.google.maps.Geocoder) {
        this.geocoderInstance = new window.google.maps.Geocoder()
      }
      if (!this.directionsServiceInstance && window.google.maps.DirectionsService) {
        this.directionsServiceInstance = new window.google.maps.DirectionsService()
      }
    }
  }

  // ─── Cache key helpers ──────────────────────────────────────────────────────

  private makeGeocodeKey(request: GeocodeRequest): string {
    const parts: string[] = []
    if (request.address) {
      parts.push(`a:${normalizeAddress(request.address)}`)
    }
    if (request.location) {
      const lat = (typeof request.location.lat === 'function' ? (request.location.lat as () => number)() : request.location.lat) as number
      const lng = (typeof request.location.lng === 'function' ? (request.location.lng as () => number)() : request.location.lng) as number
      parts.push(`l:${lat.toFixed(5)},${lng.toFixed(5)}`)
    }
    if (request.region) parts.push(`r:${request.region}`)
    if (request.componentRestrictions) parts.push(`c:${JSON.stringify(request.componentRestrictions)}`)
    return parts.join('|')
  }

  private makeDirectionsKey(request: DirectionsRequest): string {
    const norm: any = {
      o: this.normLoc(request.origin),
      d: this.normLoc(request.destination),
      m: request.travelMode,
    }
    if (request.waypoints?.length) {
      norm.w = request.waypoints.map(w => this.normLoc(w.location || w))
    }
    return JSON.stringify(norm)
  }

  private normLoc(loc: any): any {
    if (!loc) return null
    if (loc.placeId) return { p: loc.placeId }
    if (typeof loc === 'string') return loc.trim().toLowerCase()
    const lat = (typeof loc.lat === 'function' ? (loc.lat as () => number)() : loc.lat) as number | undefined
    const lng = (typeof loc.lng === 'function' ? (loc.lng as () => number)() : loc.lng) as number | undefined
    if (lat !== undefined && lng !== undefined) return `${lat.toFixed(5)},${lng.toFixed(5)}`
    return loc
  }

  // ─── Concurrency control ────────────────────────────────────────────────────

  private async acquireSlot(): Promise<void> {
    if (this.activeCalls < this.MAX_CONCURRENT) {
      this.activeCalls++
      return
    }
    return new Promise(resolve => { this.queue.push(resolve) })
  }

  private releaseSlot(): void {
    this.activeCalls--
    if (this.queue.length > 0) {
      const next = this.queue.shift()!
      this.activeCalls++
      next()
    }
  }

  private async executeWithRetry<T>(
    action: (resolve: (val: T) => void, reject: (err: any) => void) => void,
    name: string
  ): Promise<T> {
    const maxAttempts = 3
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await this.acquireSlot()
        return await new Promise<T>((resolve, reject) => {
          action(
            val => { this.releaseSlot(); resolve(val) },
            err => { this.releaseSlot(); reject(err) }
          )
        })
      } catch (error: any) {
        if (error === 'OVER_QUERY_LIMIT' || error?.status === 'OVER_QUERY_LIMIT') {
          const delay = Math.pow(2, attempt + 1) * 500 + Math.random() * 200
          console.warn(`[GoogleApiCache] ${name} rate limit, retry ${attempt + 1}/${maxAttempts} in ${Math.round(delay)}ms`)
          await new Promise(r => setTimeout(r, delay))
        } else {
          throw error
        }
      }
    }
    throw new Error(`${name} failed after ${maxAttempts} retries`)
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  hasGeocodeCacheSync(address: string): boolean {
    const key = this.makeGeocodeKey({ address })
    return this.geocodeCache.has(key)
  }

  async geocode(request: GeocodeRequest): Promise<any[]> {
    this.initialize()
    if (!this.geocoderInstance) return []

    const key = this.makeGeocodeKey(request)

    // 1. Persistent L1 cache hit
    const cached = this.geocodeCache.get(key)
    if (cached) {
      if (cached.expiresAt > Date.now()) {
        cached.lastUsed = Date.now()
        return cached.value
      }
      this.geocodeCache.delete(key)
    }

    // 2. Persistent L2 cache hit (Shared Postgres DB)
    if (request.address) {
      const normalizedAddr = normalizeAddress(request.address)
      const l2Hits = await DBGeocache.bulkGet([normalizedAddr])
      const l2Hit = l2Hits[normalizedAddr]
      if (l2Hit && l2Hit.success) {
        const mockResult = [{
          formatted_address: l2Hit.formattedAddress,
          geometry: {
            location: {
              lat: () => l2Hit.latitude,
              lng: () => l2Hit.longitude
            },
            location_type: l2Hit.locationType
          },
          place_id: l2Hit.placeId,
          types: l2Hit.types
        }]

        // Store in L1 cache
        const entry: StoredEntry<any[]> = {
          value: mockResult,
          expiresAt: Date.now() + GEO_TTL_MS,
          lastUsed: Date.now()
        }
        this.geocodeCache.set(key, entry)
        this.pruneAndSaveL1()

        return mockResult
      }
    }

    // 3. Deduplicate in-flight requests
    if (this.inFlightGeocode.has(key)) return this.inFlightGeocode.get(key)!

    // 4. Make API call (L3)
    const promise = (async () => {
      try {
        const results = await this.executeWithRetry<any[]>((resolve, reject) => {
          const req: any = {}
          if (request.address) req.address = request.address
          if (request.location) req.location = request.location
          if (request.region) req.region = request.region
          if (request.bounds) req.bounds = request.bounds
          if (request.componentRestrictions) req.componentRestrictions = request.componentRestrictions

          this.geocoderInstance.geocode(req, (results: any, status: any) => {
            if (status === 'OVER_QUERY_LIMIT') return reject('OVER_QUERY_LIMIT')
            resolve(status === 'OK' ? (results || []) : [])
          })
        }, `Geocode[${request.address || 'loc'}]`)

        // 5. Minify results for L1 storage (90% size reduction)
        const minified = results.map((r: any) => ({
          formatted_address: r.formatted_address,
          geometry: {
            location: {
              lat: typeof r.geometry.location.lat === 'function' ? r.geometry.location.lat() : r.geometry.location.lat,
              lng: typeof r.geometry.location.lng === 'function' ? r.geometry.location.lng() : r.geometry.location.lng
            },
            location_type: r.geometry.location_type
          },
          place_id: r.place_id,
          types: r.types
        }))

        // Store in L1 cache
        const entry: StoredEntry<any[]> = {
          value: minified,
          expiresAt: Date.now() + GEO_TTL_MS,
          lastUsed: Date.now()
        }
        this.geocodeCache.set(key, entry)
        this.pruneAndSaveL1()

        // Store in L2 DB Cache (fire and forget)
        if (request.address && results && results.length > 0) {
          const res = results[0]
          DBGeocache.bulkSetAsync([{
            address_key: normalizeAddress(request.address),
            result: {
              success: true,
              formattedAddress: res.formatted_address,
              latitude: typeof res.geometry.location.lat === 'function' ? res.geometry.location.lat() : res.geometry.location.lat,
              longitude: typeof res.geometry.location.lng === 'function' ? res.geometry.location.lng() : res.geometry.location.lng,
              locationType: res.geometry.location_type,
              placeId: res.place_id,
              types: res.types
            }
          }])
        }

        return minified
      } catch {
        const entry: StoredEntry<any[]> = { value: [], expiresAt: Date.now() + 60000 }
        this.geocodeCache.set(key, entry)
        return []
      } finally {
        this.inFlightGeocode.delete(key)
      }
    })()

    this.inFlightGeocode.set(key, promise)
    return promise
  }

  async getDirections(request: DirectionsRequest): Promise<any | null> {
    this.initialize()
    if (!this.directionsServiceInstance) return null

    const key = this.makeDirectionsKey(request)

    const cached = this.directionsCache.get(key)
    if (cached) {
      if (cached.expiresAt > Date.now()) {
        cached.lastUsed = Date.now()
        return cached.value
      }
      this.directionsCache.delete(key)
    }

    try {
      const result = await this.executeWithRetry<any | null>((resolve, reject) => {
        this.directionsServiceInstance.route(request, (result: any, status: any) => {
          if (status === 'OVER_QUERY_LIMIT') return reject('OVER_QUERY_LIMIT')
          if (status === (window as any).google.maps.DirectionsStatus.OK && result) resolve(result)
          else { console.error('Directions API error:', status); resolve(null) }
        })
      }, 'Directions')

      if (result) {
        const entry: StoredEntry<any> = {
          value: result,
          expiresAt: Date.now() + DIR_TTL_MS,
          lastUsed: Date.now()
        }
        this.directionsCache.set(key, entry)
        this.pruneAndSaveL1('directions')
      }
      return result
    } catch {
      return null
    }
  }

  clearGeocodeCache(): void {
    this.geocodeCache.clear()
    localStorageUtils.removeData(GEO_STORAGE_KEY)
  }

  clearDirectionsCache(): void {
    this.directionsCache.clear()
    localStorageUtils.removeData(DIR_STORAGE_KEY)
  }

  clearAll(): void {
    this.clearGeocodeCache()
    this.clearDirectionsCache()
  }

  getStats(): { geocode: number; directions: number; geocodeInFlight: number } {
    return {
      geocode: this.geocodeCache.size,
      directions: this.directionsCache.size,
      geocodeInFlight: this.inFlightGeocode.size,
    }
  }

  private pruneAndSaveL1(type: 'geocode' | 'directions' = 'geocode'): void {
    const isGeo = type === 'geocode';
    const cache = isGeo ? this.geocodeCache : this.directionsCache;
    const key = isGeo ? GEO_STORAGE_KEY : DIR_STORAGE_KEY;
    const max = isGeo ? MAX_GEO_ENTRIES : MAX_DIR_ENTRIES;

    if (cache.size > max) {
      const entries = Array.from(cache.entries())
        .sort((a, b) => (a[1].lastUsed || 0) - (b[1].lastUsed || 0));
      const toRemove = entries.slice(0, entries.length - max);
      toRemove.forEach(([k]) => cache.delete(k));
    }

    localStorageUtils.setData(key, Object.fromEntries(cache));
  }
}

export const googleApiCache = new GoogleApiCache()
