/**
 * RobustGeocodingService — v1.0
 *
 * Production-grade geocoding with:
 *  ✔ KML zone validation & prioritisation
 *  ✔ Technical zone rejection (автор-розвантаження)
 *  ✔ Street rename expansion (both directions)
 *  ✔ Token swap variants (вул. ↔ вулиця)
 *  ✔ ROOFTOP / RANGE_INTERPOLATED priority
 *  ✔ House number exact-match bonus
 *  ✔ Proximity hint scoring
 *  ✔ Early-exit on perfect hit (≤ 1 API call for cached / warm routes)
 *  ✔ In-flight deduplication (same address → 1 call)
 *  ✔ L1 / L2 / L3 cache via googleApiCache
 *  ✔ MAX_CONCURRENT = 5 rate limiting (built into googleApiCache)
 *  ✔ Exponential back-off on OVER_QUERY_LIMIT
 *  ✔ Batch geocoding with address dedup
 *  ✔ Reverse geocoding
 *  ✔ Silent mode (background distance calculations)
 */

import { googleApiCache } from '../googleApiCache'
import { NominatimService } from '../nominatimService'
import { GeoapifyService } from '../geoapifyService'
import { localStorageUtils } from '../../utils/ui/localStorage'
import type {
  KmlZoneContext,
  RobustGeocodeOptions,
  RobustGeocodeResult,
  RawGeoCandidate,
  ScoredCandidate,
} from './types'
import {
  findBestZone,
  isTechnicalZone as isTechZone,
  clearSpatialCache,
} from './kmlZoneChecker'
import {
  scoreCandidate,
  isPerfectHit,
  pickBest,
} from './candidateScoring'
import {
  expandVariants,
  extractHouseNumber,
  cleanAddress,
} from './variantExpander'

// ─── Default zone context (empty — overwritten at app startup) ────────────────

const EMPTY_CONTEXT: KmlZoneContext = {
  allPolygons: [],
  activePolygons: [],
  selectedZoneKeys: [],
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function normaliseRaw(r: any): RawGeoCandidate {
  const locRaw = r.geometry.location
  return {
    formatted_address: r.formatted_address || '',
    geometry: {
      location: {
        lat: typeof locRaw.lat === 'function' ? locRaw.lat() : Number(locRaw.lat),
        lng: typeof locRaw.lng === 'function' ? locRaw.lng() : Number(locRaw.lng),
      },
      location_type: r.geometry.location_type || 'APPROXIMATE',
    },
    address_components: r.address_components,
    place_id: r.place_id,
    types: r.types,
  }
}

function dedupeByCoord(candidates: ScoredCandidate[]): ScoredCandidate[] {
  const seen = new Set<string>()
  return candidates.filter(c => {
    const key = `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ─── Service ─────────────────────────────────────────────────────────────────

class RobustGeocodingService {
  private ctx: KmlZoneContext = EMPTY_CONTEXT
  private cityBias = 'Киев'

  // ─── Zone context injection ───────────────────────────────────────────────

  /**
   * Call this once KML data is loaded (e.g. in ExcelDataContext or useKmlData hook).
   */
  setZoneContext(ctx: KmlZoneContext): void {
    this.ctx = ctx
    clearSpatialCache()
  }

  /**
   * Update the default city bias (e.g. from settings.cityBias).
   */
  setCityBias(city: string): void {
    this.cityBias = city || 'Киев'
  }

  getZoneContext(): KmlZoneContext {
    return this.ctx
  }

  /**
   * Get the current geocoding provider from localStorage settings.
   */
  private getProvider(): 'google' | 'nominatim' | 'geoapify' {
    try {
      const settings = localStorageUtils.getAllSettings()
      return (settings.geocodingProvider as any) || 'google'
    } catch {
      return 'google'
    }
  }

  /**
   * Free-mode geocoding chain: Nominatim → Geoapify fallback.
   * Returns raw candidate arrays compatible with normaliseRaw.
   */
  private async _geocodeWithFreeProvider(address: string, cityBias: string): Promise<any[]> {
    // 1. Try Nominatim (OSM)
    const nominatimResults = await NominatimService.geocode(address, cityBias)
    if (nominatimResults.length > 0) return nominatimResults

    // 2. Fallback to Geoapify if Nominatim returned nothing
    const geoapifyResults = await GeoapifyService.geocode(address)
    if (geoapifyResults.length > 0) {
      // Map Geoapify format to our RawGeoCandidate format
      return geoapifyResults.map((r: any) => ({
        formatted_address: r.formattedAddress || r.formatted || address,
        geometry: {
          location: { lat: r.latitude || r.lat, lng: r.longitude || r.lon },
          location_type: r.locationType || 'GEOMETRIC_CENTER',
        },
        address_components: [],
        place_id: r.placeId || `geoapify_${Date.now()}`,
        types: r.types || [],
        _source: 'geoapify',
      }))
    }

    return []
  }

  // ─── Core geocoding ───────────────────────────────────────────────────────

  /**
   * Geocode a single raw address string with full zone validation.
   *
   * @param rawAddress  The address as received from the data source (may contain
   *                    apartment numbers, typos, old names, etc.)
   * @param options     Optional tuning parameters.
   */
  async geocode(
    rawAddress: string,
    options: RobustGeocodeOptions = {}
  ): Promise<RobustGeocodeResult> {
    const {
      hintPoint,
      cityBias = this.cityBias,
      maxVariants,
      skipExhaustiveIfGoodHit = true,
    } = options

    const expectedHouse = extractHouseNumber(rawAddress)
    const scoringOpts = { ctx: this.ctx, expectedHouse, hintPoint: hintPoint ?? null, cityBias }

    const allCandidates: ScoredCandidate[] = []
    let resolvedVariant: string | null = null
    let fromCache = false

    // ── Build ordered variant list ──
    const { primary, secondary } = expandVariants(rawAddress, cityBias)
    const ordered = [...primary, ...secondary]
    const variants = maxVariants ? ordered.slice(0, maxVariants) : ordered

    // Determine which provider to use (read fresh from settings each call)
    const provider = this.getProvider()
    const isFreeMode = provider !== 'google'

    // ── Try variants until a perfect hit is found ──
    for (const variant of variants) {
      let apiResults: any[] = []
      let hitCache = false

      try {
        if (isFreeMode) {
          // Free mode: Nominatim + Geoapify chain (no Google API needed)
          apiResults = await this._geocodeWithFreeProvider(variant, cityBias)
        } else {
          // Paid mode: Google Maps via googleApiCache (L1 → L2 → L3)
          const cacheKey = { address: variant, region: 'UA', componentRestrictions: { country: 'UA' } }
          hitCache = googleApiCache.hasGeocodeCacheSync(variant)
          apiResults = await googleApiCache.geocode(cacheKey)
          if (hitCache && apiResults.length > 0) fromCache = true
        }
      } catch (e) {
        console.error(`[RobustGeocodingService] geocode error for "${variant}":`, e)
        continue
      }

      if (!apiResults || apiResults.length === 0) continue

      const scored = apiResults
        .map((r: any) => scoreCandidate(normaliseRaw(r), scoringOpts))

      allCandidates.push(...scored)

      // ★ Early-exit: perfect hit found
      const perfect = scored.find(c => isPerfectHit(c, expectedHouse))
      if (perfect) {
        resolvedVariant = variant
        return {
          best: perfect,
          allCandidates: dedupeByCoord(allCandidates),
          resolvedVariant,
          fromCache: hitCache,
        }
      }

      // Good-enough hit: ROOFTOP or RANGE_INTERPOLATED inside zone → stop if skipExhaustive
      if (skipExhaustiveIfGoodHit) {
        const goodEnough = scored.find(
          c =>
            (c.raw.geometry.location_type === 'ROOFTOP' ||
              c.raw.geometry.location_type === 'RANGE_INTERPOLATED') &&
            c.isInsideZone &&
            !c.isTechnicalZone
        )
        if (goodEnough) {
          resolvedVariant = variant
          break
        }
      }
    }

    // ── Exhaustive fallback (Google-mode only): try a minimal cleaned address ──
    const hasZoneHit = allCandidates.some(c => c.isInsideZone && !c.isTechnicalZone)
    if (!hasZoneHit && allCandidates.length === 0 && !isFreeMode) {
      // Last resort Google fallback: cleaned address with city
      try {
        const stripped = cleanAddress(rawAddress)
        const fallback = await googleApiCache.geocode({
          address: `${stripped}, ${cityBias}, Украина`,
          region: 'UA',
        })
        if (fallback && fallback.length > 0) {
          const scored = fallback.map((r: any) => scoreCandidate(normaliseRaw(r), scoringOpts))
          allCandidates.push(...scored)
        }
      } catch { /* ignore */ }
    }

    // ── Free-mode additional fallback: try original address if all variants missed ──
    const hasZoneHitAfterMain = allCandidates.some(c => c.isInsideZone && !c.isTechnicalZone)
    if (!hasZoneHitAfterMain && allCandidates.length === 0 && isFreeMode) {
      try {
        const stripped = cleanAddress(rawAddress)
        const fallback = await this._geocodeWithFreeProvider(`${stripped}, ${cityBias}, Україна`, cityBias)
        if (fallback.length > 0) {
          const scored = fallback.map((r: any) => scoreCandidate(normaliseRaw(r), scoringOpts))
          allCandidates.push(...scored)
        }
      } catch { /* ignore */ }
    }

    const deduped = dedupeByCoord(allCandidates)
    const best = pickBest(deduped)

    return { best, allCandidates: deduped, resolvedVariant, fromCache }
  }

  // ─── Batch geocoding ──────────────────────────────────────────────────────

  /**
   * Geocode multiple addresses efficiently:
   * - Deduplicates identical addresses (one API call per unique address)
   * - Preserves order of results matching input
   */
  async batchGeocode(
    rawAddresses: string[],
    options: RobustGeocodeOptions = {}
  ): Promise<Map<string, RobustGeocodeResult>> {
    const results = new Map<string, RobustGeocodeResult>()
    const inFlight = new Map<string, Promise<RobustGeocodeResult>>()

    await Promise.all(
      rawAddresses.map(async addr => {
        const key = addr.trim().toLowerCase()
        if (results.has(key)) return

        // Dedup concurrent requests for same address
        if (!inFlight.has(key)) {
          inFlight.set(key, this.geocode(addr, options))
        }

        const result = await inFlight.get(key)!
        results.set(key, result)
      })
    )

    return results
  }

  // ─── Reverse geocoding ────────────────────────────────────────────────────

  /**
   * Reverse geocode a lat/lng pair to a formatted address.
   * Uses the same cache as forward geocoding.
   */
  async reverseGeocode(
    lat: number,
    lng: number
  ): Promise<{ formattedAddress: string; kmlZone: string | null; kmlHub: string | null } | null> {
    try {
      const results = await googleApiCache.geocode({ location: { lat, lng } })
      if (!results || results.length === 0) return null

      const raw = normaliseRaw(results[0])
      const scored = scoreCandidate(raw, { ctx: this.ctx })

      return {
        formattedAddress: raw.formatted_address,
        kmlZone: scored.kmlZone,
        kmlHub: scored.kmlHub,
      }
    } catch {
      return null
    }
  }

  // ─── Coordinate-to-LatLng helper (public convenience) ────────────────────

  /**
   * Given a RobustGeocodeResult, return a Google Maps LatLng object (or null).
   */
  toGoogleLatLng(result: RobustGeocodeResult): any {
    if (!result.best) return null
    try {
      if (typeof window !== 'undefined' && window.google?.maps?.LatLng) {
        return new window.google.maps.LatLng(result.best.lat, result.best.lng)
      }
    } catch { }
    return null
  }

  /**
   * Quick check: is a given lat/lng inside any active delivery zone?
   */
  isInsideDeliveryZone(lat: number, lng: number): boolean {
    if (this.ctx.allPolygons.length === 0) return true // no context loaded → assume valid
    try {
      if (typeof window !== 'undefined' && window.google?.maps?.LatLng) {
        const loc = new window.google.maps.LatLng(lat, lng)
        const zone = findBestZone(loc, this.ctx)
        return zone !== null && !isTechZone(zone.polygon)
      }
    } catch { }
    return false
  }

  /**
   * Find the KML zone name for a given coordinate pair.
   */
  findZoneForCoords(lat: number, lng: number): { zoneName: string; hubName: string } | null {
    if (this.ctx.allPolygons.length === 0) return null
    try {
      if (typeof window !== 'undefined' && window.google?.maps?.LatLng) {
        const loc = new window.google.maps.LatLng(lat, lng)
        const match = findBestZone(loc, this.ctx)
        if (!match) return null
        return {
          zoneName: match.polygon.name,
          hubName: match.polygon.folderName,
        }
      }
    } catch { }
    return null
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const robustGeocodingService = new RobustGeocodingService()

// Re-export types for consumers
export type {
  KmlZoneContext,
  KmlPolygonData,
  RobustGeocodeOptions,
  RobustGeocodeResult,
  ScoredCandidate,
} from './types'
