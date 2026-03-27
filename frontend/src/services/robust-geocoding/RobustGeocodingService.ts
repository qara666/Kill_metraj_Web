/**
 * RobustGeocodingService — v3.0 (Direct-First Architecture)
 *
 * TWO clear modes:
 *  🟢 TURBO (fast):  Direct address → Photon + Nominatim in parallel. No variants. No filters.
 *                     Used for first-pass batch geocoding. Target: <2s per address.
 *  🔵 FULL (deep):   VariantExpander + all providers + fallbacks.
 *                     Used ONLY for refinement pass (addresses that need clarification).
 *
 *  ✔ KML zone validation & prioritisation
 *  ✔ ROOFTOP / RANGE_INTERPOLATED priority
 *  ✔ House number exact-match bonus
 *  ✔ In-flight deduplication (same address → 1 call)
 *  ✔ L1 / L2 / L3 cache (memory + localStorage)
 */

import { PhotonService } from '../photonService'
import { NominatimService } from '../nominatimService'
import { localStorageUtils } from '../../utils/ui/localStorage'
import { cleanAddressForSearch, slavicNormalize } from '../../utils/address/addressNormalization'
import type {
  KmlZoneContext,
  RobustGeocodeOptions,
  RobustGeocodeResult,
  RawGeoCandidate,
  ScoredCandidate,
} from './types';
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
      location_type: r.geometry.location_type ||
        (components.some((c: any) => c.types?.includes('street_number')) ? 'RANGE_INTERPOLATED' : 'APPROXIMATE'),
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
  
  private readonly PERSISTENT_CACHE_KEY = 'km_geocache_v40';
  private l1Cache = new Map<string, RobustGeocodeResult>();

  // Provider cooldown (ProviderName -> ExpiryTimestamp)
  private disabledProviders = new Map<string, number>();
  private providerLastRequest = new Map<string, number>();
  private static readonly PROVIDER_MIN_DELAY: Record<string, number> = {
    Nominatim: 1100,
    Photon: 200,
  };

  private activeRequestCount = 0;
  private static readonly MAX_CONCURRENT_REQUESTS = 8;
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
      console.warn('[Cache] Ошибка загрузки кэша:', e);
    }
  }

  private savePersistentCache(): void {
    if (typeof window === 'undefined') return;
    try {
      const entries = Array.from(this.l1Cache.entries()).slice(-600);
      const data = Object.fromEntries(entries);
      localStorage.setItem(this.PERSISTENT_CACHE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[Cache] Ошибка сохранения кэша:', e);
    }
  }

  clearPersistentCache(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.PERSISTENT_CACHE_KEY);
  }

  private async _withSemaphore<T>(fn: () => Promise<T>, providerName?: string): Promise<T> {
      while (this.activeRequestCount >= RobustGeocodingService.MAX_CONCURRENT_REQUESTS) {
          await new Promise<void>(resolve => this.requestQueue.push(resolve));
      }
      this.activeRequestCount++;

      if (providerName) {
          const minDelay = RobustGeocodingService.PROVIDER_MIN_DELAY[providerName] ?? 0;
          if (minDelay > 0) {
              const lastReq = this.providerLastRequest.get(providerName) ?? 0;
              const elapsed = Date.now() - lastReq;
              if (elapsed < minDelay) {
                  await new Promise<void>(resolve => setTimeout(resolve, minDelay - elapsed));
              }
              this.providerLastRequest.set(providerName, Date.now());
          }
      }
      
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

  // ─── TURBO: Direct query to a single provider, no filtering ──────────────────
  private async _queryProvider(
    name: string,
    service: any,
    query: string,
    city: string,
    scoringOpts: any,
    expectedHouse: string | null,
    timeoutMs: number
  ): Promise<{ scored: ScoredCandidate[]; perfect?: ScoredCandidate }> {
    if ((service as any)._disabled) return { scored: [] };
    
    const disabledUntil = this.disabledProviders.get(name);
    if (disabledUntil && Date.now() < disabledUntil) return { scored: [] };

    try {
      const raw = await Promise.race([
        this._withSemaphore(() => service.geocode(query, city || undefined), name),
        new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs))
      ]);

      if (!Array.isArray(raw) || raw.length === 0) return { scored: [] };

      const norm = raw.map((v: any) => normaliseRaw({ ...v, _source: name.toLowerCase() }));
      const scored = norm.map((c: any) => scoreCandidate(c, scoringOpts));
      const perfect = scored.find((c: any) => isPerfectHit(c, expectedHouse, []));
      
      if (perfect) {
        console.log(`[${name}] ✅ Точное попадание: "${query}" → ${perfect.score} баллов`);
        return { scored, perfect };
      }
      return { scored };
    } catch (e: any) {
      if (e.message === 'TIMEOUT') {
        // silent timeout
      } else if (e.status === 429 || e.message?.includes('429')) {
        console.warn(`[${name}] Rate Limited. Пауза 2 мин.`);
        this.disabledProviders.set(name, Date.now() + 120000);
      } else if (e.status === 401 || e.message?.includes('401')) {
        (service as any)._disabled = true;
      } else {
        console.warn(`[${name}] Ошибка: ${e.message}`);
      }
      return { scored: [] };
    }
  }

  // ─── TURBO geocode: Fast, direct, no VariantExpander ─────────────────────────
  private async _geocodeTurbo(
    cleanQuery: string,
    city: string,
    scoringOpts: any,
    expectedHouse: string | null,
  ): Promise<{ scored: ScoredCandidate[]; perfect?: ScoredCandidate }> {
    // Run Photon + Nominatim in strict parallel
    const [photonResult, nominatimResult] = await Promise.all([
      this._queryProvider('Photon', PhotonService, cleanQuery, city, scoringOpts, expectedHouse, 2000),
      this._queryProvider('Nominatim', NominatimService, cleanQuery, city, scoringOpts, expectedHouse, 3500),
    ]);

    const allScored = [...photonResult.scored, ...nominatimResult.scored];
    const perfect = photonResult.perfect || nominatimResult.perfect;
    
    if (perfect) return { scored: allScored, perfect };
    
    // Accept best candidate if it's not a total catastrophe (no KML context = everything valid)
    const best = pickBest(dedupeByCoord(allScored));
    if (best && best.score > -100000) {
      return { scored: allScored, perfect: best };
    }

    return { scored: allScored };

  }

  // ─── FULL geocode: VariantExpander + all providers ────────────────────────────
  private async _geocodeFull(
    rawAddress: string,
    cleanQuery: string,
    city: string,
    scoringOpts: any,
    expectedHouse: string | null,
  ): Promise<{ scored: ScoredCandidate[]; perfect?: ScoredCandidate }> {
    const allCandidates: ScoredCandidate[] = [];
    const settings = localStorageUtils.getAllSettings();

    // Generate variants via VariantExpander
    const { primary, secondary } = expandVariants(rawAddress, city);
    const variants = [...primary.slice(0, 5), ...secondary.slice(0, 3)];

    // Run all variants in parallel against both free providers
    const variantPromises = variants.map(async (variant) => {
      const [ph, nm] = await Promise.all([
        this._queryProvider('Photon', PhotonService, variant, city, scoringOpts, expectedHouse, 3000),
        this._queryProvider('Nominatim', NominatimService, variant, city, scoringOpts, expectedHouse, 5000),
      ]);
      return [...ph.scored, ...nm.scored];
    });

    const variantResults = await Promise.allSettled(variantPromises);
    for (const r of variantResults) {
      if (r.status === 'fulfilled') allCandidates.push(...r.value);
    }

    // Check for early perfect hit
    let perfect = pickBest(dedupeByCoord(allCandidates));
    if (perfect && (perfect.isInsideZone || perfect.score > 5000)) {
      return { scored: allCandidates, perfect };
    }

    // Geoapify fallback
    if (settings.geoapifyApiKey) {
      try {
        const { GeoapifyService } = await import('../geoapifyService');
        const geoRaw = await Promise.race([
          GeoapifyService.geocode(cleanQuery, city),
          new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 4000))
        ]);
        if (Array.isArray(geoRaw) && geoRaw.length > 0) {
          const geoScored = geoRaw.map((c: any) => {
            const s = scoreCandidate(normaliseRaw(c), scoringOpts);
            return s;
          });
          allCandidates.push(...geoScored);
        }
      } catch {}
    }

    // Street-only fallback (if house number is unknown to OSM)
    if (expectedHouse) {
      const streetOnly = cleanQuery.replace(/\b\d+[а-яієґa-z]*\b/gi, '').trim();
      if (streetOnly && streetOnly !== cleanQuery) {
        const [ph2] = await Promise.all([
          this._queryProvider('Photon', PhotonService, `${streetOnly}, ${city}`, city, scoringOpts, null, 3000),
        ]);
        allCandidates.push(...ph2.scored.map(s => { s.score -= 3000; return s; }));
      }
    }

    perfect = pickBest(dedupeByCoord(allCandidates));
    return { scored: allCandidates, perfect: perfect || undefined };
  }

  private _parseAddressGeo(geoStr: string): { lat: number; lng: number; address?: string; city?: string } | null {
    try {
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
      cityBias = this.cityBias,
      turbo = false,
    } = options

    const normalizedAddress = rawAddress.replace(/[ʼ`]/g, "'");
    const cleanQuery = cleanAddressForSearch(normalizedAddress);
    const expectedHouse = extractHouseNumber(rawAddress);
    
    // L1 Cache Lookup
    const cacheKey = `${cleanQuery.toLowerCase()}:${cityBias.toLowerCase()}:${turbo ? 'T' : 'F'}`;
    if (this.l1Cache.has(cacheKey)) {
        return { ...this.l1Cache.get(cacheKey)!, fromCache: true };
    }

    // addressGeo DIRECT BYPASS — use coordinates embedded in address string
    const geoStr = options.addressGeoStr || (rawAddress.includes('Lat=') ? rawAddress : null);
    if (geoStr) {
        const extracted = this._parseAddressGeo(geoStr);
        if (extracted && extracted.lat && extracted.lng) {
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

    // Zone Gravity Hint
    let gravityHint = options.hintPoint ?? null;
    if (!gravityHint && options.expectedDeliveryZone && this.ctx.allPolygons.length > 0) {
      const eZoneName = options.expectedDeliveryZone.toLowerCase().replace(/зона\s*/g, '').trim();
      const targetPoly = this.ctx.allPolygons.find(p => p.name.toLowerCase().includes(eZoneName));
      if (targetPoly?.bounds) {
        try {
          const b = targetPoly.bounds;
          let centerLat: number, centerLng: number;
          if (typeof b.getCenter === 'function') {
            const c = b.getCenter();
            centerLat = Number(typeof c.lat === 'function' ? c.lat() : c.lat);
            centerLng = Number(typeof c.lng === 'function' ? c.lng() : c.lng);
          } else {
            const s = Number(b.south ?? 0), n = Number(b.north ?? 0), w = Number(b.west ?? 0), e = Number(b.east ?? 0);
            centerLat = (s + n) / 2;
            centerLng = (w + e) / 2;
          }
          gravityHint = { lat: centerLat, lng: centerLng };
        } catch {}
      }
    }

    const scoringOpts = {
      ctx: this.ctx,
      expectedHouse,
      hintPoint: gravityHint,
      cityBias,
      expectedDeliveryZone: options.expectedDeliveryZone || null,
      // IMPORTANT: Do NOT pass requestedStreetNames at all in turbo mode.
      // candidateScoring penalizes -400k when requestedStreetNames=[] but expectedHouse is set.
      // By omitting it (undefined), scoring falls through to standard checks without penalty.
    };

    let allCandidates: ScoredCandidate[] = [];
    let bestResult: ScoredCandidate | null = null;

    if (turbo) {
      // ── TURBO MODE: Fast, direct, parallel Photon+Nominatim ──────────────────
      const { scored, perfect } = await this._geocodeTurbo(cleanQuery, cityBias, scoringOpts, expectedHouse);
      allCandidates = scored;
      bestResult = perfect || pickBest(dedupeByCoord(scored)) || null;
    } else {
      // ── FULL MODE: VariantExpander + all providers (refinement only) ──────────
      const { scored, perfect } = await this._geocodeFull(rawAddress, cleanQuery, cityBias, scoringOpts, expectedHouse);
      allCandidates = scored;
      bestResult = perfect || pickBest(dedupeByCoord(scored)) || null;
    }

    // Iron Dome: reject obvious anomalies
    if (bestResult && bestResult.score < -900000) {
      console.warn(`[Геокодинг] ОТКЛОНЕНО (аномалия): ${bestResult.raw.formatted_address} | Score: ${bestResult.score}`);
      bestResult = null;
    }

    const finalCandidates = dedupeByCoord(allCandidates);
    const finalResult: RobustGeocodeResult = {
      best: bestResult,
      allCandidates: finalCandidates,
      resolvedVariant: null,
      fromCache: false,
    };

    if (bestResult) {
      this.l1Cache.set(cacheKey, finalResult);
      // Save periodically (not on every call to avoid blocking)
      if (this.l1Cache.size % 10 === 0) this.savePersistentCache();
    }

    return finalResult;
  }

  async batchGeocode(
    requests: Array<{ address: string; options?: RobustGeocodeOptions }>, 
    globalOptions: RobustGeocodeOptions = {}
  ): Promise<Map<string, RobustGeocodeResult>> {
    const results = new Map<string, RobustGeocodeResult>();
    const { turbo = false } = globalOptions;
    
    // Deduplicate addresses
    const uniqueReqs = new Map<string, { address: string; options?: RobustGeocodeOptions }>();
    requests.forEach(req => {
        const key = req.address.trim().toLowerCase();
        if (!uniqueReqs.has(key)) uniqueReqs.set(key, req);
    });

    const reqArray = Array.from(uniqueReqs.values());
    
    await Promise.all(reqArray.map(async (req) => {
        const key = req.address.trim().toLowerCase();
        
        const cacheKey = `${cleanAddressForSearch(req.address).toLowerCase()}:${(globalOptions.cityBias || this.cityBias).toLowerCase()}:${turbo ? 'T' : 'F'}`;
        if (this.l1Cache.has(cacheKey)) {
            results.set(key, { ...this.l1Cache.get(cacheKey)!, fromCache: true });
            return;
        }

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
    }));
    
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
