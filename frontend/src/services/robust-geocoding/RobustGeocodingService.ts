/**
 * RobustGeocodingService — v3.1 (Direct-First Architecture)
 *
 * TWO clear modes:
 *  🟢 TURBO (fast):  Direct address → Photon + Nominatim + Geoapify in parallel.
 *  🔵 FULL (deep):   VariantExpander + all providers + fallbacks.
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
  
  private readonly PERSISTENT_CACHE_KEY = 'km_geocache_v91'; // v9.1: Bumped
  private l1Cache = new Map<string, RobustGeocodeResult>();

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
      
      return { scored, perfect };
    } catch (e: any) {
      if (e.message === 'TIMEOUT') {
        // silent
      } else if (e.status === 429 || e.message?.includes('429')) {
        this.disabledProviders.set(name, Date.now() + 120000);
      } else if (e.status === 401 || e.message?.includes('401')) {
        (service as any)._disabled = true;
      }
      return { scored: [] };
    }
  }

  private async _geocodeTurbo(
    cleanQuery: string,
    city: string,
    scoringOpts: any,
    expectedHouse: string | null,
  ): Promise<{ scored: ScoredCandidate[]; perfect?: ScoredCandidate }> {
    const [photonResult, nominatimResult, geoapifyResult] = await Promise.all([
      this._queryProvider('Photon', PhotonService, cleanQuery, city, scoringOpts, expectedHouse, 6000),
      this._queryProvider('Nominatim', NominatimService, cleanQuery, city, scoringOpts, expectedHouse, 8000),
      this._queryProvider('Geoapify', (await import('../geoapifyService')).GeoapifyService, cleanQuery, city, scoringOpts, expectedHouse, 6000),
    ]);

    const allScored = [...photonResult.scored, ...nominatimResult.scored, ...geoapifyResult.scored];
    const perfect = photonResult.perfect || nominatimResult.perfect || geoapifyResult.perfect;
    
    if (perfect) return { scored: allScored, perfect };
    
    const best = pickBest(dedupeByCoord(allScored));
    if (best && best.score > -5000000) {
      return { scored: allScored, perfect: best };
    }

    return { scored: allScored };
  }

  private async _geocodeFull(
    rawAddress: string,
    cleanQuery: string,
    city: string,
    scoringOpts: any,
    expectedHouse: string | null,
  ): Promise<{ scored: ScoredCandidate[]; perfect?: ScoredCandidate }> {
    const allCandidates: ScoredCandidate[] = [];
    const settings = localStorageUtils.getAllSettings();

    const { primary, secondary } = expandVariants(rawAddress, city);
    const variants = [...primary.slice(0, 8), ...secondary.slice(0, 5)];

    const variantPromises = variants.map(async (variant) => {
      const [ph, nm] = await Promise.all([
        this._queryProvider('Photon', PhotonService, variant, city, scoringOpts, expectedHouse, 4000),
        this._queryProvider('Nominatim', NominatimService, variant, city, scoringOpts, expectedHouse, 6000),
      ]);
      return [...ph.scored, ...nm.scored];
    });

    const variantResults = await Promise.allSettled(variantPromises);
    for (const r of variantResults) {
      if (r.status === 'fulfilled') allCandidates.push(...r.value);
    }

    let perfect = pickBest(dedupeByCoord(allCandidates));
    if (perfect && (perfect.isInsideZone || perfect.score > 5000)) {
      return { scored: allCandidates, perfect };
    }

    if (settings.geoapifyApiKey) {
      try {
        const { GeoapifyService } = await import('../geoapifyService');
        const geoRaw = await GeoapifyService.geocode(cleanQuery, city);
        if (Array.isArray(geoRaw)) {
          allCandidates.push(...geoRaw.map((c: any) => scoreCandidate(normaliseRaw(c), scoringOpts)));
        }
      } catch {}
    }

    if (expectedHouse) {
      const streetOnly = cleanQuery.replace(/\b\d+[а-яієґa-z]*\b/gi, '').trim();
      if (streetOnly && streetOnly !== cleanQuery) {
        const ph2 = await this._queryProvider('Photon', PhotonService, `${streetOnly}, ${city}`, city, scoringOpts, null, 3000);
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
    
    const cacheKey = `${cleanQuery.toLowerCase()}:${cityBias.toLowerCase()}:${turbo ? 'T' : 'F'}`;
    if (this.l1Cache.has(cacheKey)) {
        return { ...this.l1Cache.get(cacheKey)!, fromCache: true };
    }

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

    let gravityHint = options.hintPoint ?? null;
    const scoringOpts = {
      ctx: this.ctx,
      expectedHouse,
      hintPoint: gravityHint,
      cityBias,
      expectedDeliveryZone: options.expectedDeliveryZone || null,
    };

    let allCandidates: ScoredCandidate[] = [];
    let bestResult: ScoredCandidate | null = null;

    if (turbo) {
      const { scored, perfect } = await this._geocodeTurbo(cleanQuery, cityBias, scoringOpts, expectedHouse);
      allCandidates = scored;
      bestResult = perfect || pickBest(dedupeByCoord(scored)) || null;
    } else {
      const { scored, perfect } = await this._geocodeFull(rawAddress, cleanQuery, cityBias, scoringOpts, expectedHouse);
      allCandidates = scored;
      bestResult = perfect || pickBest(dedupeByCoord(scored)) || null;
    }

    if (bestResult && bestResult.score < -5000000) {
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
    
    const uniqueReqs = new Map<string, { address: string; options?: RobustGeocodeOptions }>();
    requests.forEach(req => {
        const key = req.address.trim().toLowerCase();
        if (!uniqueReqs.has(key)) uniqueReqs.set(key, req);
    });

    const reqArray = Array.from(uniqueReqs.values());
    
    await Promise.all(reqArray.map(async (req) => {
        const key = req.address.trim().toLowerCase();
        const combinedOptions = { ...globalOptions, ...(req.options || {}), turbo: turbo || req.options?.turbo };
        const result = await this.geocode(req.address, combinedOptions);
        results.set(key, result);
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
      const r = await NominatimService.reverse(lat, lng)
      if (!r) return null
      const raw = normaliseRaw(r)
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
