/**
 * RobustGeocodingService — v2.0 (Free-First Architecture)
 *
 * Production-grade geocoding with:
 *  ✔ FREE-FIRST Priority (Photon → Nominatim → Geoapify → Google)
 *  ✔ KML zone validation & prioritisation
 *  ✔ Technical zone rejection (автор-розвантаження)
 *  ✔ Street rename expansion (both directions)
 *  ✔ ROOFTOP / RANGE_INTERPOLATED priority
 *  ✔ House number exact-match bonus
 *  ✔ Proximity hint scoring
 *  ✔ In-flight deduplication (same address → 1 call)
 *  ✔ L1 / L2 / L3 cache via googleApiCache
 */

import { PhotonService } from '../photonService'
import { NominatimService } from '../nominatimService'
import { localStorageUtils } from '../../utils/ui/localStorage'
import { cleanAddressForSearch, slavicNormalize } from '../../utils/address/addressNormalization'
import { ALL_STREET_RENAMES as STREET_RENAMES } from '../../utils/data/streetRenamesData'
import type {
  KmlZoneContext,
  RobustGeocodeOptions,
  RobustGeocodeResult,
  RawGeoCandidate,
  ScoredCandidate,
} from './types';

export type {
  KmlZoneContext,
  RobustGeocodeOptions,
  RobustGeocodeResult,
  RawGeoCandidate,
  ScoredCandidate,
};
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
} from './variantExpander'

const EMPTY_CONTEXT: KmlZoneContext = {
  allPolygons: [],
  activePolygons: [],
  selectedZoneKeys: [],
}

function normaliseRaw(r: any): RawGeoCandidate {
  const locRaw = r.geometry.location
  let components = r.address_components || []
  
  if (components.length === 0) {
    const hn = r.housenumber || r.house_number || (r.address && r.address.house_number)
    if (hn) {
      components.push({ long_name: hn, short_name: hn, types: ['street_number'] })
    }
    const st = r.street || (r.address && (r.address.road || r.address.street))
    if (st) {
      components.push({ long_name: st, short_name: st, types: ['route'] })
    }
  }

  return {
    formatted_address: r.formatted_address || r.display_name || '',
    geometry: {
      location: {
        lat: typeof locRaw.lat === 'function' ? locRaw.lat() : Number(locRaw.lat),
        lng: typeof locRaw.lng === 'function' ? locRaw.lng() : Number(locRaw.lng),
      },
      location_type: r.geometry.location_type || 'APPROXIMATE',
    },
    address_components: components,
    place_id: r.place_id || r.osm_id,
    types: r.types || [],
    _source: r._source || 'unknown'
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

export class RobustGeocodingService {
  private ctx: KmlZoneContext = EMPTY_CONTEXT
  private cityBias = 'Київ'

  static _slavicNormalize(s: string): string {
    return slavicNormalize(s)
  }

  constructor() {
    this.autoSync()
    if (typeof window !== 'undefined') {
      window.addEventListener('km-settings-updated', () => {
        this.autoSync()
      })
    }
  }

  autoSync(): void {
    if (typeof window === 'undefined') return
    try {
      const settings = localStorageUtils.getAllSettings()
      if (settings.cityBias) {
        this.cityBias = settings.cityBias
      }
      if (settings.kmlData && settings.selectedZones) {
        this.ctx = {
          allPolygons: settings.kmlData.polygons || [],
          activePolygons: (settings.kmlData.polygons || []).filter((p: any) => {
             const key = `${(p.folderName || '').trim()}:${(p.name || '').trim()}`
             return settings.selectedZones.includes(key)
          }),
          selectedZoneKeys: settings.selectedZones || []
        }
        clearSpatialCache()
      }
      const CACHE_CLEAN_KEY = 'km_cache_v31_cleared'
      localStorage.setItem(CACHE_CLEAN_KEY, 'true')
    } catch (e) {
      console.warn('[Геокодинг] Ошибка синхронизации настроек:', e)
    }
  }

  setZoneContext(ctx: KmlZoneContext): void {
    this.ctx = ctx
    clearSpatialCache()
  }

  setCityBias(city: string): void {
    this.cityBias = city || 'Київ'
  }

  getZoneContext(): KmlZoneContext {
    return this.ctx
  }

  private async _geocodeWithFreeProviders(query: string, city: string | null): Promise<RawGeoCandidate[]> {
    try {
      const probes: Array<Promise<any>> = [
        PhotonService.geocode(query, city || undefined).catch(e => {
            console.warn(`[RobustGeocode] Photon failure:`, e.message);
            return [];
        }),
        NominatimService.geocode(query, city || undefined).catch(e => {
            console.warn(`[RobustGeocode] Nominatim failure:`, e.message);
            return [];
        })
      ];
      
      const probeResults = await Promise.allSettled(probes)
      const combined: RawGeoCandidate[] = []
      probeResults.forEach((pr, idx) => {
        if (pr.status === 'fulfilled' && pr.value) {
          const val = pr.value
          const source = (idx === 0) ? 'photon' : 'nominatim'
          
          if (Array.isArray(val)) {
            combined.push(...val.map(v => ({ ...v, _source: source })))
          } else {
             combined.push({ ...val, _source: source })
          }
        } else if (pr.status === 'rejected') {
            console.error(`[RobustGeocode] Probe ${idx === 0 ? 'Photon' : 'Nominatim'} REJECTED:`, pr.reason);
        }
      })
      return combined.map(v => normaliseRaw(v))
    } catch (err: any) {
      console.error('[RobustGeocode] Critical failure in free providers:', err.message);
      return []
    }
  }

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

    const cleanQuery = cleanAddressForSearch(rawAddress)
    const expectedHouse = extractHouseNumber(rawAddress)

    // Zone Gravity
    let gravityHint = hintPoint ?? null
    if (!gravityHint && options.expectedDeliveryZone && this.ctx.allPolygons.length > 0) {
      const eZoneName = options.expectedDeliveryZone.toLowerCase().replace(/зона\s*/g, '').trim()
      let targetPoly = this.ctx.allPolygons.find(p => p.name.toLowerCase().includes(eZoneName))
      if (targetPoly && targetPoly.bounds) {
        try {
          const b = targetPoly.bounds
          let centerLat: number, centerLng: number
          if (typeof b.getCenter === 'function') {
            const c = b.getCenter()
            centerLat = Number(typeof c.lat === 'function' ? c.lat() : c.lat)
            centerLng = Number(typeof c.lng === 'function' ? c.lng() : c.lng)
          } else {
            const s = Number(b.south ?? 0), n = Number(b.north ?? 0), w = Number(b.west ?? 0), e = Number(b.east ?? 0)
            centerLat = (s + n) / 2
            centerLng = (w + e) / 2
          }
          gravityHint = { lat: centerLat, lng: centerLng }
        } catch {}
      }
    }

    const baseScoringOpts = { ctx: this.ctx, expectedHouse, hintPoint: gravityHint, cityBias, expectedDeliveryZone: options.expectedDeliveryZone || null }
    const allCandidates: ScoredCandidate[] = []

    // LEVEL 1: Primary Variants
    const { primary, all } = expandVariants(cleanQuery, cityBias)
    
    // Extract base street names for validation (NUCLEAR STRIPPING)
    const requestedStreetNames = new Set<string>()
    const searchCity = (cityBias || 'Київ').toLowerCase()
    
    // Comprehensive blacklist of non-street-name tokens
    const forbidden = new Set([
        'київ', 'киев', 'kyiv', 'kiev', 'україна', 'украина', 'ukraine', 'ua', 
        'вул', 'вулиця', 'ул', 'улица', 'пров', 'провулок', 'переулок', 'просп', 'проспект', 'пр', 'пр-т',
        'бул', 'бульвар', 'шосе', 'шоссе', 'набережна', 'набережная', 'пл', 'площа', 'площадь',
        'street', 'st', 'avenue', 'ave', 'road', 'rd', 'square', 'sq', 'lane', 'ln',
        'под', 'подъезд', 'під', 'підʼїзд', 'эт', 'этаж', 'кв', 'квартира', 'корп', 'корпус', 'секция', 'вход', 'вхід',
        'києва', 'київа', 'киевская', 'київська', 'область', 'район', 'рн', 'village', 'town', 'city'
    ])
    // Add dynamic city bias to forbidden
    forbidden.add(searchCity)
    if (searchCity === 'київ') forbidden.add('киев')
    if (searchCity === 'киев') forbidden.add('київ')

    all.forEach(v => {
      const words = v.toLowerCase().split(/[\s,.'"\-]+/)
      words.forEach(w => {
        const cleanW = w.replace(/[^a-z0-9а-яёіїєґ]/gi, '')
        // v35.9.12: Filter out numeric-heavy tokens (house numbers). 
        // Only accept tokens that contain letters and are not purely digits.
        const isNumeric = /^\d+$/.test(cleanW)
        if (cleanW.length > 2 && !forbidden.has(cleanW) && !isNumeric) {
          requestedStreetNames.add(cleanW)
        }
      })
    })

    // v35.9.5: Bridge Expansion with Word-Boundary Slavic Normalization
    const expandedRoots = new Set(requestedStreetNames)
    const allRenames = [...STREET_RENAMES]
    
    requestedStreetNames.forEach(root => {
        const rootN = slavicNormalize(root)
        if (rootN.length < 3) return // ignore tiny roots for renames
        
        allRenames.forEach(([oldN, newN]) => {
            // Check if rootN matches a full word in oldN or newN (slavic normalized)
            const oldWordsN = oldN.split(/[\s,.'"\-]+/).map(w => slavicNormalize(w))
            const newWordsN = newN.split(/[\s,.'"\-]+/).map(w => slavicNormalize(w))
            
            if (oldWordsN.includes(rootN) || newWordsN.includes(rootN)) {
                [...oldN.split(/[\s,.'"\-]+/), ...newN.split(/[\s,.'"\-]+/)].forEach(w => {
                    const cw = w.toLowerCase().replace(/[^a-z0-9а-яёіїєґ]/gi, '')
                    if (cw.length > 2 && !forbidden.has(cw)) expandedRoots.add(cw)
                })
            }
        })
    })

    const scoringOpts = { ...baseScoringOpts, requestedStreetNames: Array.from(expandedRoots) }
    console.log(`[Геокодинг v35.9.14] ОБЯЗАТЕЛЬНЫЕ КОРНИ (Расширенные):`, Array.from(expandedRoots))
    const candidatesBatch = maxVariants ? primary.slice(0, maxVariants) : primary

    for (const variant of candidatesBatch) {
      try {
        const rawResults = await this._geocodeWithFreeProviders(variant, cityBias)
        if (rawResults.length > 0) {
            console.log(`[Геокодинг] Вариант "${variant}" — найдено ${rawResults.length} совпадений от ${rawResults[0]._source}`)
        }
        const scored = rawResults.map(c => scoreCandidate(c, scoringOpts))
        
        allCandidates.push(...scored)
        const perfect = scored.find(c => isPerfectHit(c, expectedHouse, scoringOpts.requestedStreetNames))
        if (perfect) {
            console.log(`[Геокодинг] ТОЧНОЕ СОВПАДЕНИЕ [${perfect.raw._source}]:`, perfect.raw.formatted_address)
            return { best: perfect, allCandidates, resolvedVariant: variant, fromCache: false }
        }

        if (skipExhaustiveIfGoodHit && scored.some(c => (c.raw.geometry.location_type === 'ROOFTOP' || c.raw.geometry.location_type === 'RANGE_INTERPOLATED') && c.isInsideZone)) {
          break
        }
      } catch (e) {
          console.error('[Геокодинг] Ошибка L1:', e)
      }
    }

    // LEVEL 2: Street-Only Fallback
    const hasAnyInZoneResult = allCandidates.some(c => c.isInsideZone && c.score > 2000)
    if (!hasAnyInZoneResult && expectedHouse) {
      const streetOnly = cleanQuery.replace(/\b\d+[а-яієґa-z]*\b/gi, '').trim()
      if (streetOnly && streetOnly !== cleanQuery) {
        const svars = expandVariants(streetOnly, cityBias).primary.slice(0, 2)
        for (const sv of svars) {
          try {
            const raw = await this._geocodeWithFreeProviders(sv, cityBias)
            const scored = raw.map(c => {
                const s = scoreCandidate(c, { ...scoringOpts, expectedHouse: null })
                s.score -= 5000
                return s
            })
            allCandidates.push(...scored)
          } catch {}
        }
      }
    }

    // LEVEL 3: Global Exhaustion + EMERGENCY GOOGLE
    const hasInZoneAtAll = allCandidates.some(c => c.isInsideZone)
    if (!hasInZoneAtAll) {
      try {
        console.log(`[Геокодинг] Уровень 3: Экстренный поиск для "${cleanQuery}" (Полный перебор бесплатных провайдеров)`)
        const raw = await this._geocodeWithFreeProviders(cleanQuery, null)
        const scored = raw.map(c => {
            const s = scoreCandidate(c, { ...scoringOpts, expectedDeliveryZone: null })
            s.score -= 50000 
            return s
        })
        allCandidates.push(...scored)
      } catch {}
    }

    // LEVEL 4: Premium / Secondary Fallbacks (Geoapify & Generoute)
    // If we have literally nothing or everything is terrible (-100k score), we try Geoapify
    if (allCandidates.length === 0 || allCandidates.every(c => c.score < -100000)) {
      try {
        console.log(`[Геокодинг] Уровень 4: Запуск Geoapify fallback для "${cleanQuery}"`)
        const { GeoapifyService } = await import('../geoapifyService')
        const geoResults = await GeoapifyService.geocode(cleanQuery, cityBias)
        
        // Convert Geoapify raw format if needed, but assuming GeoapifyService returns compatible structure
        const scored = geoResults.map((c: any) => {
          const raw = normaliseRaw(c)
          const s = scoreCandidate(raw, scoringOpts)
          s.score -= 15000 // Penalty to ensure free providers win if they have a match
          return s
        })
        allCandidates.push(...scored)
      } catch (e) {
         console.warn(`[Геокодинг] Geoapify fallback провалился:`, e)
      }
    }

    const deduped = dedupeByCoord(allCandidates)
    let best = pickBest(deduped)

    // IRON DOME
    if (best && best.score < -900000) {
      console.warn(`[Геокодинг] ОТКЛОНЕНО (Защита от аномалий):`, best.raw.formatted_address, 'Score:', best.score, 'Loc:', best.raw.geometry.location)
      best = null
    }

    if (best) {
      console.log(`[Геокодинг v35.9.14] УСПЕХ [${best.raw._source || 'неизвестно'}]:`, best.raw.formatted_address, `Баллы: ${best.score}`, `Широта: ${best.lat}, Долгота: ${best.lng}`)
    } else if (deduped.length > 0) {
       console.log('[Геокодинг v35.9.14] Лучший кандидат не найден, топ совпадений:', deduped.slice(0,3).map(c => ({ 
           addr: c.raw.formatted_address, 
           score: c.score,
           reason: (c.raw as any)._rejectReason || (c.score < -500000 ? 'Аномалия' : 'Низкий балл')
       })))
    }

    return { best, allCandidates: deduped, resolvedVariant: null, fromCache: false }
  }

  async batchGeocode(rawAddresses: string[], options: RobustGeocodeOptions = {}): Promise<Map<string, RobustGeocodeResult>> {
    const results = new Map<string, RobustGeocodeResult>()
    const inFlight = new Map<string, Promise<RobustGeocodeResult>>()
    await Promise.all(rawAddresses.map(async addr => {
      const key = addr.trim().toLowerCase()
      if (results.has(key)) return
      if (!inFlight.has(key)) inFlight.set(key, this.geocode(addr, options))
      results.set(key, await inFlight.get(key)!)
    }))
    return results
  }

  async reverseGeocode(lat: number, lng: number): Promise<{ formattedAddress: string; kmlZone: string | null; kmlHub: string | null } | null> {
    try {
      let results: any[] = []
      try {
        const r = await NominatimService.reverse(lat, lng)
        results = r ? [r] : []
      } catch {
        results = []
      }
      if (!results || results.length === 0) return null
      const raw = normaliseRaw(results[0])
      const scored = scoreCandidate(raw, { ctx: this.ctx })
      return { formattedAddress: raw.formatted_address, kmlZone: scored.kmlZone, kmlHub: scored.kmlHub }
    } catch { return null }
  }

  toGoogleLatLng(result: RobustGeocodeResult): { lat: () => number; lng: () => number } | null {
    if (!result.best) return null
    // window.google.maps.LatLng usage removed
    return { lat: () => result.best!.lat, lng: () => result.best!.lng }
  }

  isInsideDeliveryZone(lat: number, lng: number): boolean {
    if (this.ctx.allPolygons.length === 0) return true
    try {
      const match = findBestZone({ lat, lng }, this.ctx)
      return match !== null && !isTechZone(match.polygon)
    } catch {}
    return false
  }

  findZoneForCoords(lat: number, lng: number): { zoneName: string; hubName: string } | null {
    if (this.ctx.allPolygons.length === 0) return null
    try {
      const match = findBestZone({ lat, lng }, this.ctx)
      if (!match) return null
      return { zoneName: match.polygon.name, hubName: match.polygon.folderName }
    } catch {}
    return null
  }
}

export const robustGeocodingService = new RobustGeocodingService()
