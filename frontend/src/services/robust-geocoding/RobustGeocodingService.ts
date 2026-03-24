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
import { cleanAddressForSearch, slavicNormalize, extractParentheticalStreetName } from '../../utils/address/addressNormalization'
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
        console.log(`[Кэш] Загружено ${this.l1Cache.size} адресов из локального хранилища.`);
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
    expectedHouse: string | null,
    turbo: boolean = false
  ): Promise<{scored: ScoredCandidate[], perfect?: ScoredCandidate}> {
      
      const results: ScoredCandidate[] = [];
      const requestedStreets: string[] = scoringOpts.requestedStreetNames || [];

      // v37: Turbo Timeouts (1.5s/2.5s) vs Standard (3s/5s)
      const pTimeout = turbo ? 1500 : 3000;
      const nTimeout = turbo ? 2500 : 5000;
      
      const tryProvider = async (name: string, service: any, timeoutMs: number) => {
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
                        const addrN = RobustGeocodingService._slavicNormalize(c.formatted_address || '');
                        return requestedStreets.some(root => addrN.includes(RobustGeocodingService._slavicNormalize(root)));
                      })
                    : norm;

                  const scored = filtered.map((c: any) => scoreCandidate(c, scoringOpts));
                  results.push(...scored);
                  
                  const p = scored.find((c: any) => isPerfectHit(c, expectedHouse, requestedStreets));
                  // v37: In Turbo mode, any match inside zone with > 10000 points is "perfect enough"
                  const isGoodEnough = turbo && !p && scored.find((c: any) => c.isInsideZone && c.score > 10000);
                  
                  if (p || isGoodEnough) {
                      const hit = p || isGoodEnough;
                      if (hit) {
                        console.log(`[${name}] ${turbo ? 'УСКОРЕННЫЙ ' : ''}УСПЕХ: ${hit.score} баллов.`);
                        return hit;
                      }
                  }
                  return null;
              }
          } catch (e: any) {
              if (e.message !== 'TIMEOUT') {
                  console.warn(`[${name}] Ошибка: ${e.message}`);
              }
              if (e.message?.includes('401') || e.status === 401) {
                  (service as any)._disabled = true;
              }
          }
          return null;
      };

      // v37: Parallel race with turbo logic
      const [photonPerfect, nominatimPerfect] = await Promise.all([
          tryProvider('Photon', PhotonService, pTimeout),
          tryProvider('Nominatim', NominatimService, nTimeout)
      ]);

      const perfect = photonPerfect || nominatimPerfect;
      if (perfect) return { scored: results, perfect };

      // v36.4: Fast-Match Short-circuit
      const strongHit = results.find(r => r.score > 2500 && r.isInsideZone);
      if (strongHit) return { scored: results, perfect: strongHit };

      // v37: Skip expensive fallbacks in TURBO mode
      if (turbo) return { scored: results };

      // 3. Geoapify (Premium Fallback)
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

  private _parseAddressGeo(geoStr: string): { lat: number; lng: number; address?: string; city?: string } | null {
    try {
      // Robust regex for Lat="...", Long="...", AddressStr="...", CityName="..."
      const latMatch = geoStr.match(/Lat=["']?([\d.]+)["']?/i);
      const lngMatch = geoStr.match(/Long=["']?([\d.]+)["']?/i);
      const addrMatch = geoStr.match(/AddressStr=["']?([^"']+)["']?/i);
      const cityMatch = geoStr.match(/CityName=["']?([^"']+)["']?/i);

      if (latMatch && lngMatch) {
        return {
          lat: parseFloat(latMatch[1]),
          lng: parseFloat(lngMatch[1]),
          address: addrMatch ? addrMatch[1] : undefined,
          city: cityMatch ? cityMatch[1] : undefined
        };
      }
    } catch (e) {
      console.warn('[RobustGeocode] Failed to parse addressGeo:', e);
    }
    return null;
  }

  async geocode(
    rawAddress: string,
    options: RobustGeocodeOptions = {}
  ): Promise<RobustGeocodeResult> {
    const {
      hintPoint,
      cityBias = this.cityBias,
      maxVariants,
      turbo = false,
      skipNormalization = false
    } = options

    const normalizedAddress = rawAddress.replace(/[ʼ`]/g, "'");
    const cleanQuery = skipNormalization ? rawAddress : cleanAddressForSearch(normalizedAddress);
    const expectedHouse = extractHouseNumber(rawAddress)
    
    // v35.9.37: GEODASH - L1 Cache Lookup
    const cacheKey = `${cleanQuery.toLowerCase()}:${cityBias.toLowerCase()}`
    if (this.l1Cache.has(cacheKey)) {
        return { ...this.l1Cache.get(cacheKey)!, fromCache: true };
    }

    // v37: addressGeo DIRECT BYPASS (Instant Mode)
    // We check both the options string and the raw address for embedded coordinates
    const geoStr = options.addressGeoStr || (rawAddress.includes('Lat=') ? rawAddress : null);
    if (geoStr) {
        const extracted = this._parseAddressGeo(geoStr);
        if (extracted && extracted.lat && extracted.lng) {
            console.log(`[Геокодинг] ИСПОЛЬЗУЮТСЯ КООРДИНАТЫ ИЗ БД: "${rawAddress}"`);
            
            // v38.1: Perform zone lookup even for bypass to ensure badges show in UI
            const zoneInfo = this.findZoneForCoords(extracted.lat, extracted.lng);
            
            const res: RobustGeocodeResult = {
                best: {
                    lat: extracted.lat,
                    lng: extracted.lng,
                    score: 2000000, 
                    isInsideZone: true,
                    isTechnicalZone: false,
                    streetNumberMatched: true,
                    kmlZone: zoneInfo?.zoneName || null,
                    kmlHub: zoneInfo?.hubName || null,
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
    // v39: Increased to 5 variants (was 3) to ensure alt-name variants from parens are tried
    const variantCount = turbo ? (maxVariants || 1) : (maxVariants || 5);
    // PASS rawAddress to expandVariants so it can parse parens!
    const { primary, all } = expandVariants(rawAddress, cityBias)
    const variantsToTry = primary.slice(0, variantCount);
    
    // v38.5 FIX: Allow the smartest variant generated by expandVariants instead of blindly forcing cleanQuery
    const finalVariants = turbo ? [variantsToTry[0] || cleanQuery] : variantsToTry;

    // Extract base street names for validation
    const requestedStreetNames = new Set<string>()
    const searchStrings = turbo ? finalVariants : all;
    
    const forbidden = new Set([
        'київ', 'киев', 'kyiv', 'kiev', 'україна', 'украина', 'ukraine', 'ua', 
        'вул', 'вулиця', 'ул', 'улица', 'пров', 'провулок', 'переулок', 'просп', 'проспект', 'пр', 'пр-т',
        'бул', 'бульвар', 'шосе', 'шоссе', 'набережна', 'набережная', 'пл', 'площа', 'площадь',
        'street', 'st', 'avenue', 'ave', 'road', 'rd', 'square', 'sq', 'lane', 'ln',
        'под', 'подъезд', 'під', 'підʼїзд', 'эт', 'этаж', 'кв', 'квартира', 'корп', 'корпус', 'секция', 'вход', 'вхід',
        'києва', 'київа', 'киевская', 'київська', 'область', 'район', 'рн', 'village', 'town', 'city'
    ])
    
    const searchCity = (cityBias || 'Київ').toLowerCase()
    forbidden.add(searchCity)
    if (searchCity === 'київ') forbidden.add('киев')
    
    searchStrings.forEach(v => {
      const words = v.toLowerCase().replace(/[ʼ`]/g, "'").split(/[\s,.'"\-]+/)
      words.forEach(w => {
        const cleanW = w.replace(/[^a-z0-9а-яёіїєґ]/gi, '')
        if (cleanW.length > 2 && !forbidden.has(cleanW) && !/^\d+$/.test(cleanW)) {
          requestedStreetNames.add(cleanW)
        }
      })
    })
    
    // v39: Also add the parenthetical alt name words explicitly to prevent filter rejection
    // e.g. for "Йорданська (Гавро)" → add "гавро" so OSM results for "Гавро" aren't killed
    const altStreetName = extractParentheticalStreetName(rawAddress);
    if (altStreetName) {
        altStreetName.toLowerCase().split(/[\s,.'"\-]+/).forEach(w => {
            const cw = w.replace(/[^a-z0-9а-яёіїєґ]/gi, '');
            if (cw.length > 2 && !forbidden.has(cw)) requestedStreetNames.add(cw);
        });
    }

    const expandedRoots = new Set(requestedStreetNames)
    if (!turbo) {
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
    }

    const scoringOpts = { ...baseScoringOpts, requestedStreetNames: Array.from(expandedRoots) }
    
    // v35.9.40: AddressGeo Fast-Path Bypass
    if (options.addressGeoStr) {
        try {
            const { scored, perfect } = await this._evaluateProvidersEarlyExit(options.addressGeoStr, cityBias, scoringOpts, expectedHouse, turbo);
            if (perfect || scored.length > 0) {
                const best = perfect || pickBest(scored);
                if (best && best.score > -500000) {
                    const res = { best, allCandidates: scored, resolvedVariant: options.addressGeoStr, fromCache: false };
                    this.l1Cache.set(cacheKey, res);
                    return res;
                }
            }
        } catch {}
    }

    // v35.9.38: Short-Circuiting Parallel Sweeps
    const result = await new Promise<{scored: ScoredCandidate[], perfect?: ScoredCandidate}>(resolve => {
        let completed = 0;
        const allScored: ScoredCandidate[] = [];
        let found = false;

        finalVariants.forEach(async (variant) => {
            try {
                const variantRes = await this._evaluateProvidersEarlyExit(variant, cityBias, scoringOpts, expectedHouse, turbo);
                if (found) return;

                allScored.push(...variantRes.scored);
                if (variantRes.perfect) {
                    found = true;
                    resolve({ scored: allScored, perfect: variantRes.perfect });
                    return;
                }
            } catch (e) {
            } finally {
                completed++;
                if (completed === finalVariants.length && !found) {
                    resolve({ scored: allScored });
                }
            }
        });
    });

    const { scored: finalScored, perfect } = result;
    allCandidates.push(...finalScored);

    if (perfect) {
        const res = { best: perfect, allCandidates, resolvedVariant: null, fromCache: false };
        this.l1Cache.set(cacheKey, res);
        return res;
    }

    // v38.6 Phase 6: Turbo Rename Fallback
    // If turbo mode found no strong candidates, retry with rename / paren variants
    // (high-priority secondary variants from expandVariants). This prevents permanent
    // failures for addresses with renamed streets, even in fast/batch mode.
    if (turbo) {
        const currentBest = pickBest(dedupeByCoord(allCandidates));
        const needsFallback = !currentBest || currentBest.score < 2000;
        
        if (needsFallback) {
            // Grab the rename-resolved secondary variants that were skipped in turbo
            const { primary, secondary } = expandVariants(rawAddress, cityBias);
            // Try up to 2 most promising fallback variants (rename-resolved ones)
            const fallbackVariants = [...primary.slice(1), ...secondary].slice(0, 2);
            
            for (const variant of fallbackVariants) {
                if (variant === finalVariants[0]) continue; // skip already tried
                try {
                    const { scored, perfect } = await this._evaluateProvidersEarlyExit(
                        variant, cityBias, scoringOpts, expectedHouse, true
                    );
                    allCandidates.push(...scored);
                    if (perfect) {
                        console.log(`[Резервный Поиск] УСПЕХ: "${variant}" → ${perfect.score} баллов`);
                        const res = { best: perfect, allCandidates: dedupeByCoord(allCandidates), resolvedVariant: variant, fromCache: false };
                        this.l1Cache.set(cacheKey, res);
                        return res;
                    }
                } catch {}
            }
        }
        
        const best = pickBest(dedupeByCoord(allCandidates));
        const finalResult = { best, allCandidates: dedupeByCoord(allCandidates), resolvedVariant: null, fromCache: false };
        if (best) this.l1Cache.set(cacheKey, finalResult);
        return finalResult;
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
            allCandidates.push(...scored.map(s => { s.score -= 5000; return s; }))
            if (perfect) break
          } catch {}
        }
      }
    }

    // LEVEL 3: Global Exhaustion
    if (allCandidates.length === 0) {
      try {
        const { scored } = await this._evaluateProvidersEarlyExit(cleanQuery, null, { ...scoringOpts, expectedDeliveryZone: null }, expectedHouse)
        allCandidates.push(...scored.map(s => { s.score -= 50000; return s; }))
      } catch {}
    }

    // LEVEL 4: Premium Fallbacks
    if (allCandidates.length === 0 || allCandidates.every(c => c.score < -100000)) {
      try {
        const settings = localStorageUtils.getAllSettings();
        if (settings.geoapifyApiKey) {
            const { GeoapifyService } = await import('../geoapifyService')
            const geoResults = await GeoapifyService.geocode(cleanQuery, cityBias)
            allCandidates.push(...geoResults.map((c: any) => {
              const s = scoreCandidate(normaliseRaw(c), scoringOpts)
              s.score -= 15000
              return s
                        }))
        }
      } catch {}
    }

    const deduped = dedupeByCoord(allCandidates);
    let best = pickBest(deduped);

    // v38.3: Zone-Hinted Fallback (Final Effort)
    // If we 100% know it's in a zone but geocoding fails, append zone name to search
    if ((!best || best.score < 2000) && options.expectedDeliveryZone && !turbo) {
        const zoneHint = options.expectedDeliveryZone.toLowerCase().replace(/зона\s*/g, '').trim();
        const hintedQuery = `${cleanQuery}, ${zoneHint}`;
        console.log(`[Геокодинг] ПОВТОРНЫЙ ПОИСК (с учетом зон): "${hintedQuery}"`);
        
        try {
            const { scored, perfect: hintedPerfect } = await this._evaluateProvidersEarlyExit(
                hintedQuery, 
                cityBias, 
                { ...scoringOpts, expectedHouse: expectedHouse || null }, 
                expectedHouse || null
            );
            
            const picked = pickBest(scored);
            if (hintedPerfect || (picked && picked.score > 2000)) {
                const hintedBest = hintedPerfect || picked!;

                // Merge candidates
                const mergedCandidates = dedupeByCoord([...deduped, ...scored]);
                const res = { 
                    best: hintedBest, 
                    allCandidates: mergedCandidates, 
                    resolvedVariant: hintedQuery, 
                    fromCache: false 
                };
                this.l1Cache.set(cacheKey, res);
                return res;
            }
        } catch (e) {
            console.warn(`[Геокодинг] Fallback failed:`, e);
        }
    }

    // v35.9.37: IRON DOME (Anomaly Protection)
    if (best && best.score < -900000) {
      console.warn(`[Геокодинг] ОТКЛОНЕНО (Аномалия):`, best.raw.formatted_address, 'Score:', best.score);
      best = null;
    }

    const finalResult = { best, allCandidates: deduped, resolvedVariant: null, fromCache: false };
    this.l1Cache.set(cacheKey, finalResult);
    this.savePersistentCache();

    return finalResult;
  }

  async batchGeocode(
    requests: Array<{ address: string; options?: RobustGeocodeOptions }>, 
    globalOptions: RobustGeocodeOptions = {}
  ): Promise<Map<string, RobustGeocodeResult>> {
    const results = new Map<string, RobustGeocodeResult>()
    const { turbo = false } = globalOptions;
    
    // v37: Bulk Performance - Deduplicate and run in parallel
    const uniqueReqs = new Map<string, { address: string; options?: RobustGeocodeOptions }>();
    requests.forEach(req => {
        const key = req.address.trim().toLowerCase();
        if (!uniqueReqs.has(key)) uniqueReqs.set(key, req);
    });
    
    // v37: Turbo - Use a larger concurrency pool or just fire all (with semaphore safety)
    const promises = Array.from(uniqueReqs.values()).map(async (req) => {
        const key = req.address.trim().toLowerCase();
        try {
            const combinedOptions = { 
                ...globalOptions, 
                ...(req.options || {}),
                turbo: turbo || req.options?.turbo
            };
            const result = await this.geocode(req.address, combinedOptions);
            results.set(key, result);
        } catch (e) {
            console.error(`[BatchGeocode] Failed for ${req.address}`, e);
        }
    });

    await Promise.all(promises);
    
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
