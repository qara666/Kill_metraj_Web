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
  
  // v36.8: Quantum Persistent Cache Key
  private readonly PERSISTENT_CACHE_KEY = 'km_quantum_cache_v36';
  
  // v35.9.37: GEODASH - L1 Session Memory Cache
  private l1Cache = new Map<string, RobustGeocodeResult>();
  
  // v35.9.37: GEODASH - Global Request Semaphore
  private activeRequestCount = 0;
  private static readonly MAX_CONCURRENT_REQUESTS = 20 // v36.8: Boosted for Quantum speed
;
  private requestQueue: Array<() => void> = [];

  static _slavicNormalize(s: string): string {
    return slavicNormalize(s)
  }

  constructor() {
    this.autoSync()
    this.loadPersistentCache()
    if (typeof window !== 'undefined') {
      window.addEventListener('km-settings-updated', () => {
        this.autoSync()
        // Only clear L1 memory cache. Don't wipe persistent cache on every presetSync event.
        this.l1Cache.clear()
      })
    }
  }

  private loadPersistentCache(): void {
    if (typeof window === 'undefined') return;
    try {
      const data = localStorage.getItem(this.PERSISTENT_CACHE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        Object.entries(parsed).forEach(([key, val]) => {
          this.l1Cache.set(key, val as RobustGeocodeResult);
        });
        console.log(`[Quantum Cache] Загружено ${this.l1Cache.size} адресов из хранилища.`);
      }
    } catch (e) {
      console.warn('[Quantum Cache] Ошибка загрузки кэша:', e);
    }
  }

  private savePersistentCache(): void {
    if (typeof window === 'undefined') return;
    try {
      // Keep only last 500 entries to avoid localStorage bloat
      const entries = Array.from(this.l1Cache.entries()).slice(-500);
      const data = Object.fromEntries(entries);
      localStorage.setItem(this.PERSISTENT_CACHE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[Quantum Cache] Ошибка сохранения кэша:', e);
    }
  }

  clearPersistentCache(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.PERSISTENT_CACHE_KEY);
  }

  // v36: Enhanced Rate-Limit Protection (Jittered Batch)
  private async _withSemaphore<T>(fn: () => Promise<T>): Promise<T> {
      while (this.activeRequestCount >= RobustGeocodingService.MAX_CONCURRENT_REQUESTS) {
          await new Promise<void>(resolve => this.requestQueue.push(resolve));
      }
      this.activeRequestCount++;
      
      try {
          return await fn();
      } finally {
          this.activeRequestCount--;
          const next = this.requestQueue.shift();
          if (next) next();
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
    this.l1Cache.clear()
  }

  setCityBias(city: string): void {
    this.cityBias = city || 'Київ'
    this.l1Cache.clear()
  }

  getZoneContext(): KmlZoneContext {
    return this.ctx
  }

  private async _evaluateProvidersEarlyExit(
    query: string, 
    city: string | null, 
    scoringOpts: any, 
    expectedHouse: string | null
  ): Promise<{scored: ScoredCandidate[], perfect?: ScoredCandidate}> {
      
      const results: ScoredCandidate[] = [];
      const requestedStreets: string[] = scoringOpts.requestedStreetNames || [];

      // v36: Lightning Fallback Chain (Photon → Nominatim → Geoapify)
      // If one is busy/fails, we immediately move to the next.
      
      const tryProvider = async (name: string, service: any, timeoutMs: number = 3000) => {
          if ((service as any)._disabled) return null;
          try {
              const raw = await Promise.race([
                  this._withSemaphore(() => service.geocode(query, city || undefined)),
                  new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs))
              ]);

              if (Array.isArray(raw) && raw.length > 0) {
                  const norm = raw.map((v: any) => normaliseRaw({...v, _source: name.toLowerCase()}));
                  const filtered = requestedStreets.length > 0
                    ? norm.filter((c: any) => {
                        const addr = (c.formatted_address || '').toLowerCase();
                        return requestedStreets.some(root => addr.includes(root.toLowerCase()));
                      })
                    : norm;

                  const scored = filtered.map((c: any) => scoreCandidate(c, scoringOpts));
                  results.push(...scored);
                  
                  const p = scored.find((c: any) => isPerfectHit(c, expectedHouse, requestedStreets));
                  if (p) {
                      console.log(`[${name}] Найдено идеальное совпадение: ${p.score} баллов.`);
                  }
                  return p || null;
              }
          } catch (e: any) {
              if (e.message === 'TIMEOUT') {
                  console.warn(`[${name}] Пропуск по таймауту (${timeoutMs}мс)`);
              } else {
                  console.warn(`[${name}] Ошибка: ${e.message}`);
              }
              if (e.message?.includes('401') || e.status === 401) {
                  (service as any)._disabled = true;
              }
          }
          return null;
      };

      // v36.5 Racing Transformer: Parallel Provider Launch
      // Launch Photon and Nominatim AT THE SAME TIME. First one success is preferred.
      // v36.9 FIX: Increased timeouts: Photon 3000ms, Nominatim 5000ms
      const [photonPerfect, nominatimPerfect] = await Promise.all([
          tryProvider('Photon', PhotonService, 3000),
          tryProvider('Nominatim', NominatimService, 5000)
      ]);

      const perfect = photonPerfect || nominatimPerfect;
      if (perfect) return { scored: results, perfect };

      // v36.4: Fast-Match Short-circuit (Legacy logic, now mostly covered by parallel race)
      const strongHit = results.find(r => r.score > 2500 && r.isInsideZone);
      if (strongHit) return { scored: results, perfect: strongHit };

      // 3. Geoapify (Premium Fallback - stay sequential as it is expensive/limited)
      const settings = localStorageUtils.getAllSettings();
      if (settings.geoapifyApiKey) {
          try {
              const { GeoapifyService } = await import('../geoapifyService');
              const geoapifyPerfect = await tryProvider('Geoapify', GeoapifyService, 3000);
              if (geoapifyPerfect) return { scored: results, perfect: geoapifyPerfect };
          } catch {}
      }

      return { scored: results };
  }

  async geocode(
    rawAddress: string,
    options: RobustGeocodeOptions = {}
  ): Promise<RobustGeocodeResult> {
    const {
      hintPoint,
      cityBias = this.cityBias,
      maxVariants
    } = options

    const normalizedAddress = rawAddress.replace(/[ʼ`]/g, "'");
    const cleanQuery = cleanAddressForSearch(normalizedAddress);
    const expectedHouse = extractHouseNumber(rawAddress)
    
    // v35.9.37: GEODASH - L1 Cache Lookup
    const cacheKey = `${cleanQuery.toLowerCase()}:${cityBias.toLowerCase()}`
    if (this.l1Cache.has(cacheKey)) {
        console.log(`[Геокодинг] L1 Cache HIT: "${rawAddress}"`);
        return { ...this.l1Cache.get(cacheKey)!, fromCache: true };
    }

    // v36: addressGeo Quick-Bypass (Lightning Transformer)
    if (options.addressGeoStr) {
        const { parseAddressGeo } = await import('../../utils/data/excelProcessor');
        const extracted = parseAddressGeo(options.addressGeoStr);
        if (extracted.lat && extracted.lng) {
            console.log(`[Геокодинг] DIRECT BYPASS (addressGeo): "${rawAddress}"`);
            const res: RobustGeocodeResult = {
                best: {
                    lat: extracted.lat,
                    lng: extracted.lng,
                    score: 2000000, // Trusted score
                    isInsideZone: true,
                    isTechnicalZone: false,
                    streetNumberMatched: true,
                    kmlZone: null,
                    kmlHub: null,
                    raw: {
                        formatted_address: extracted.address || rawAddress,
                        geometry: {
                            location: { lat: extracted.lat, lng: extracted.lng },
                            location_type: 'ROOFTOP'
                        },
                        _source: 'addressgeo'
                    }
                },
                allCandidates: [],
                resolvedVariant: null,
                fromCache: false,
                isLocked: true
            };
            this.l1Cache.set(cacheKey, res);
            return res;
        }
    }

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
      // v36.1: Unified apostrophe splitter
      const words = v.toLowerCase().replace(/[ʼ`]/g, "'").split(/[\s,.'"\-]+/)
      words.forEach(w => {
        const cleanW = w.replace(/[^a-z0-9а-яёіїєґ]/gi, '')
        const isNumeric = /^\d+$/.test(cleanW)
        if (cleanW.length > 2 && !forbidden.has(cleanW) && !isNumeric) {
          requestedStreetNames.add(cleanW)
        }
      })
    })

    const expandedRoots = new Set(requestedStreetNames)
    const allRenames = [...STREET_RENAMES]
    
    requestedStreetNames.forEach(root => {
        const rootN = slavicNormalize(root)
        if (rootN.length < 3) return
        
        allRenames.forEach(([oldN, newN]) => {
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
    
    // v35.9.40: AddressGeo Fast-Path Bypass
    if (options.addressGeoStr) {
        try {
            console.log(`[Геокодинг] ПРЯМОЙ ОБХОД (AddressGeo): "${options.addressGeoStr}"`);
            const { scored, perfect } = await this._evaluateProvidersEarlyExit(options.addressGeoStr, cityBias, scoringOpts, expectedHouse);
            
            if (perfect || scored.length > 0) {
                const best = perfect || pickBest(scored);
                if (best && best.score > -500000) { // Safety check for anomalies
                    console.log(`[Геокодинг] AddressGeo УСПЕХ [${best.raw._source}]:`, best.raw.formatted_address);
                    const res = { best, allCandidates: scored, resolvedVariant: options.addressGeoStr, fromCache: false };
                    this.l1Cache.set(cacheKey, res);
                    return res;
                }
            }
        } catch (e) {
            console.warn(`[Геокодинг] Ошибка AddressGeo Fast-Path, переход к расширению:`, e);
        }
    }

    const candidatesBatch = maxVariants ? primary.slice(0, maxVariants) : primary.slice(0, 3)

    // v35.9.38: Short-Circuiting Parallel Sweeps
    // We launch all variants, but we return as soon as ONE returns a perfect hit.
    let bestPerfect: ScoredCandidate | undefined = undefined;
    
    // We don't use Promise.all because we want to exit early.
    // Instead, we use a manual counter and a resolver.
    const result = await new Promise<{scored: ScoredCandidate[], perfect?: ScoredCandidate}>(resolve => {
        let completed = 0;
        const allScored: ScoredCandidate[] = [];
        let found = false;

        candidatesBatch.forEach(async (variant) => {
            try {
                const variantRes = await this._evaluateProvidersEarlyExit(variant, cityBias, scoringOpts, expectedHouse);
                if (found) return; // Already resolved by another variant

                allScored.push(...variantRes.scored);
                
                if (variantRes.perfect) {
                    found = true;
                    resolve({ scored: allScored, perfect: variantRes.perfect });
                    return;
                }
            } catch (e) {
                console.warn(`[Variant Fail] "${variant}":`, e);
            } finally {
                completed++;
                if (completed === candidatesBatch.length && !found) {
                    resolve({ scored: allScored });
                }
            }
        });
    });

    const { scored: finalScored, perfect } = result;
    allCandidates.push(...finalScored);
    bestPerfect = perfect;

    if (bestPerfect) {
        console.log(`[Геокодинг] ТОЧНОЕ СОВПАДЕНИЕ [${bestPerfect.raw._source}]:`, bestPerfect.raw.formatted_address);
        const res = { best: bestPerfect, allCandidates, resolvedVariant: null, fromCache: false };
        this.l1Cache.set(cacheKey, res);
        return res;
    }

    // LEVEL 2: Street-Only Fallback
    const hasAnyInZoneResult = allCandidates.some(c => c.isInsideZone && c.score > 2000)
    if (!hasAnyInZoneResult && expectedHouse) {
      const streetOnly = cleanQuery.replace(/\b\d+[а-яієґa-z]*\b/gi, '').trim()
      if (streetOnly && streetOnly !== cleanQuery) {
        const svars = expandVariants(streetOnly, cityBias).primary.slice(0, 2)
        for (const sv of svars) {
          try {
            const { scored, perfect } = await this._evaluateProvidersEarlyExit(sv, cityBias, { ...scoringOpts, expectedHouse: null }, null)
            const penalized = scored.map(s => {
                s.score -= 5000
                return s
            })
            allCandidates.push(...penalized)
            // If we found the street perfectly in zone, we can break out of fallback variants
            if (perfect) break
          } catch {}
        }
      }
    }

    // LEVEL 3: Global Exhaustion — only when we have NO candidates at all
    const hasCandidates = allCandidates.length > 0
    if (!hasCandidates) {
      try {
        console.log(`[Геокодинг] Уровень 3: Экстренный поиск для "${cleanQuery}" (нет кандидатов)`)
        const { scored } = await this._evaluateProvidersEarlyExit(cleanQuery, null, { ...scoringOpts, expectedDeliveryZone: null }, expectedHouse)
        const penalized = scored.map(s => {
            s.score -= 50000 
            return s
        })
        allCandidates.push(...penalized)
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
      console.log(`[Геокодинг v35.9.37] УСПЕХ [${best.raw._source || 'неизвестно'}]:`, best.raw.formatted_address, `Баллы: ${best.score}`, `Широта: ${best.lat}, Долгота: ${best.lng}`)
    } else if (deduped.length > 0) {
       console.log('[Геокодинг v35.9.37] Лучший кандидат не найден, топ совпадений:', deduped.slice(0,3).map(c => ({ 
           addr: c.raw.formatted_address, 
           score: c.score,
           reason: (c.raw as any)._rejectReason || (c.score < -500000 ? 'Аномалия' : 'Низкий балл')
       })))
    }

    const finalResult = { best, allCandidates: deduped, resolvedVariant: null, fromCache: false };
    // 5. Save to L1 Cache & Persistence
    this.l1Cache.set(cacheKey, finalResult);
    this.savePersistentCache();

    return finalResult;
  }

  async batchGeocode(
    requests: Array<{ address: string; options?: RobustGeocodeOptions }>, 
    globalOptions: RobustGeocodeOptions = {}
  ): Promise<Map<string, RobustGeocodeResult>> {
    const results = new Map<string, RobustGeocodeResult>()
    
    // Deduplicate requests by address (normalized)
    const uniqueReqs = new Map<string, { address: string; options?: RobustGeocodeOptions }>();
    requests.forEach(req => {
        const key = req.address.trim().toLowerCase();
        if (!uniqueReqs.has(key)) {
            uniqueReqs.set(key, req);
        }
    });
    
    const promises = Array.from(uniqueReqs.values()).map(async (req) => {
        const key = req.address.trim().toLowerCase();
        try {
            const combinedOptions = { ...globalOptions, ...(req.options || {}) };
            const result = await this.geocode(req.address, combinedOptions);
            results.set(key, result);
        } catch (e) {
            console.error(`[BatchGeocode] Failed for ${req.address}`, e);
        }
    });

    await Promise.all(promises);
    
    // Map back to the original input (preserving duplicates with results)
    const finalMap = new Map<string, RobustGeocodeResult>();
    requests.forEach(req => {
        const key = req.address.trim().toLowerCase();
        const res = results.get(key);
        if (res) finalMap.set(key, res);
    });

    return finalMap;
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
