/**
 * Persistent geocoding cache with 24h TTL.
 * Stores results in localStorage so they survive page reloads.
 * Deduplicates in-flight requests for the same address.
 */

const STORAGE_KEY = 'geocode_cache_v1'
const TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

// Rate-limit: max concurrent Google API calls
const MAX_CONCURRENT = 5
// Delay between batches (ms)
const BATCH_DELAY_MS = 100

export interface GeoPoint {
    lat: number
    lng: number
}

interface CacheEntry {
    lat: number
    lng: number
    expiresAt: number
}

type PersistentCache = Record<string, CacheEntry>

// In-memory map for fast lookups and in-flight promise deduplication
const memCache = new Map<string, GeoPoint>()
const inFlight = new Map<string, Promise<GeoPoint | null>>()

// ─── Persistence helpers ────────────────────────────────────────────────────

function loadFromStorage(): PersistentCache {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? JSON.parse(raw) : {}
    } catch {
        return {}
    }
}

function saveToStorage(cache: PersistentCache): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
    } catch {
        // localStorage full? silently ignore
    }
}

/**
 * Purge entries older than 24h from localStorage and warm memCache.
 * Called automatically on module load.
 */
export function purgeExpiredGeocodeCache(): void {
    const now = Date.now()
    const stored = loadFromStorage()
    let changed = false

    for (const [key, entry] of Object.entries(stored)) {
        if (entry.expiresAt < now) {
            delete stored[key]
            changed = true
        } else {
            memCache.set(key, { lat: entry.lat, lng: entry.lng })
        }
    }

    if (changed) saveToStorage(stored)
}

function normKey(address: string): string {
    return address.trim().toLowerCase().replace(/\s+/g, ' ')
}

function writeEntry(key: string, point: GeoPoint): void {
    memCache.set(key, point)
    const stored = loadFromStorage()
    stored[key] = { ...point, expiresAt: Date.now() + TTL_MS }
    saveToStorage(stored)
}

// ─── Core geocoding ─────────────────────────────────────────────────────────

function geocodeViaGoogle(address: string): Promise<GeoPoint | null> {
    return new Promise((resolve) => {
        if (
            typeof window === 'undefined' ||
            !window.google?.maps?.Geocoder
        ) {
            resolve(null)
            return
        }

        const geocoder = new window.google.maps.Geocoder()
        geocoder.geocode(
            { address, region: 'ua' },
            (results: any, status: any) => {
                if (status === 'OK' && results?.[0]?.geometry?.location) {
                    const loc = results[0].geometry.location
                    resolve({
                        lat: typeof loc.lat === 'function' ? loc.lat() : loc.lat,
                        lng: typeof loc.lng === 'function' ? loc.lng() : loc.lng,
                    })
                } else {
                    resolve(null)
                }
            }
        )
    })
}

/**
 * Geocode a single address.
 * Returns cached result if available (mem or localStorage),
 * otherwise calls Google Maps API once.
 */
export async function getCachedGeocode(address: string): Promise<GeoPoint | null> {
    const key = normKey(address)

    // 1. Memory cache hit
    if (memCache.has(key)) return memCache.get(key)!

    // 2. De-duplicate in-flight request
    if (inFlight.has(key)) return inFlight.get(key)!

    // 3. Miss → call API
    const promise = geocodeViaGoogle(address).then((point) => {
        inFlight.delete(key)
        if (point) writeEntry(key, point)
        return point
    })

    inFlight.set(key, promise)
    return promise
}

/**
 * Batch geocode multiple addresses.
 * - Deduplicates identical addresses
 * - Skips already cached ones
 * - Enforces MAX_CONCURRENT concurrent API calls with BATCH_DELAY between chunks
 * - Returns a Map<address, GeoPoint> for all successfully geocoded addresses
 */
export async function batchGeocode(
    addresses: string[]
): Promise<Map<string, GeoPoint>> {
    const result = new Map<string, GeoPoint>()
    const unique = [...new Set(addresses.map(normKey))]
    const missing: string[] = []

    // Warm from cache first
    for (const key of unique) {
        if (memCache.has(key)) {
            result.set(key, memCache.get(key)!)
        } else {
            missing.push(key)
        }
    }

    // Chunk and geocode missing addresses with rate limiting
    for (let i = 0; i < missing.length; i += MAX_CONCURRENT) {
        const chunk = missing.slice(i, i + MAX_CONCURRENT)

        const points = await Promise.all(chunk.map(getCachedGeocode))

        chunk.forEach((key, idx) => {
            const point = points[idx]
            if (point) result.set(key, point)
        })

        // Small delay between chunks to avoid rate-limiting
        if (i + MAX_CONCURRENT < missing.length) {
            await new Promise((r) => setTimeout(r, BATCH_DELAY_MS))
        }
    }

    return result
}

// Auto-purge on module load
purgeExpiredGeocodeCache()
