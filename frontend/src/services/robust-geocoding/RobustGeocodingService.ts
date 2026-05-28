/**
 * RobustGeocodingService — v3.1 (Direct-First Architecture)
 *
 * TWO clear modes:
 *  🟢 TURBO (fast):  Direct address → Photon + Nominatim + Geoapify in parallel.
 *   FULL (deep):   VariantExpander + all providers + fallbacks.
 */

import { PhotonService } from '../photonService'
import { NominatimService } from '../nominatimService'
import { localStorageUtils } from '../../utils/ui/localStorage'
import { 
  cleanAddressForSearch, 
  slavicNormalize,
  extractParentheticalStreetName 
} from '../../utils/address/addressNormalization'
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
  const locRaw = r.geometry?.location || r.location || { lat: r.lat, lng: r.lon || r.lng };
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
      location_type: r.geometry?.location_type ||
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
  
  // v17.18: STRICT CONCURRENCY MANAGEMENT
  // v17.32: Optimized for High-Quality Robot (Increased from 1 to 4)
  private static readonly MAX_CONCURRENT_REQUESTS = 4; 
  private activeRequestCount = 0;
  private requestQueue: Array<() => void> = [];
  
  // v16.7: Absolute Persistence Cache
  private static permanentGeocache = new Map<string, { lat: number, lng: number, score?: number }>();
  private static isCacheLoaded = false;

  private disabledProviders = new Map<string, number>();
  private providerLastRequest = new Map<string, number>();
  private static readonly PROVIDER_MIN_DELAY: Record<string, number> = {
    Nominatim: 1100,
    Photon: 150,
  };

  private pendingRequests = new Map<string, Promise<RobustGeocodeResult>>();

  static _slavicNormalize(s: string): string {
    return slavicNormalize(s)
  }

  constructor() {
    this.autoSync()
    this.loadPersistentCache()
    this._loadPermanentCache()
    if (typeof window !== 'undefined') {
      (window as any).km_permanent_geocache_v2 = Object.fromEntries(RobustGeocodingService.permanentGeocache.entries());
      window.addEventListener('km-settings-updated', () => {
        this.autoSync()
        this.l1Cache.clear()
      })
    }
  }

  private _loadPermanentCache(): void {
    if (RobustGeocodingService.isCacheLoaded || typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('km_permanent_geocache_v2');
      if (raw) {
        const data = JSON.parse(raw);
        Object.entries(data).forEach(([addr, coords]: [string, any]) => {
          RobustGeocodingService.permanentGeocache.set(addr.toLowerCase().trim(), coords);
        });
        (window as any).km_permanent_geocache_v2 = data;
      }
      RobustGeocodingService.isCacheLoaded = true;
      console.log(`[Persistence] Loaded ${RobustGeocodingService.permanentGeocache.size} addresses from permanent storage.`);
    } catch (e) {
      console.warn('[Persistence] Error loading cache:', e);
    }
  }

  static saveToPermanentCache(address: string, lat: number, lng: number, score?: number): void {
    if (typeof window === 'undefined') return;
    const key = address.toLowerCase().trim();
    RobustGeocodingService.permanentGeocache.set(key, { lat, lng, score });
    
    // Throttled persist to localStorage
    const data: Record<string, any> = {};
    RobustGeocodingService.permanentGeocache.forEach((v, k) => {
      data[k] = v;
    });
    (window as any).km_permanent_geocache_v2 = data;
    localStorage.setItem('km_permanent_geocache_v2', JSON.stringify(data));
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
      console.warn('[Cache] Error loading L1 cache:', e);
    }
  }

  private savePersistentCache(): void {
    if (typeof window === 'undefined') return;
    try {
      const entries = Array.from(this.l1Cache.entries()).slice(-600);
      const data = Object.fromEntries(entries);
      localStorage.setItem(this.PERSISTENT_CACHE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[Cache] Error saving L1 cache:', e);
    }
  }

  clearPersistentCache(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.PERSISTENT_CACHE_KEY);
    localStorage.removeItem('km_permanent_geocache_v2');
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
      if (settings.cityBias) this.cityBias = settings.cityBias
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
      console.warn('[Геокодинг] Sync error:', e)
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
    timeoutMs: number,
    silent?: boolean
  ): Promise<{ scored: ScoredCandidate[]; perfect?: ScoredCandidate }> {
    if ((service as any)._disabled) return { scored: [] };
    const disabledUntil = this.disabledProviders.get(name);
    if (disabledUntil && Date.now() < disabledUntil) return { scored: [] };

    try {
      const activePolygons = this.ctx?.activePolygons?.length ? this.ctx.activePolygons : undefined;
      const raw = await Promise.race([
        this._withSemaphore(() => service.geocode(query, city || undefined, activePolygons), name),
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
    rawAddress: string,
    cleanQuery: string,
    city: string,
    scoringOpts: any,
    expectedHouse: string | null,
    silent?: boolean
  ): Promise<{ scored: ScoredCandidate[]; perfect?: ScoredCandidate }> {
    // v5.150: Also query top-3 primary variants in Turbo mode (catches renames on fast pass)
    const { primary } = expandVariants(rawAddress, city);
    const turboVariants = [...new Set([cleanQuery, ...primary.slice(0, 3)])].slice(0, 4);

    // Pre-import Geoapify so we can use it inside the synchronous map callback
    const { GeoapifyService: GeoapifyTurbo } = await import('../geoapifyService');

    const queryResults = await Promise.all(
      turboVariants.map(query => Promise.all([
        this._queryProvider('Photon', PhotonService, query, city, scoringOpts, expectedHouse, 6000),
        this._queryProvider('Nominatim', NominatimService, query, city, scoringOpts, expectedHouse, 8000),
        query === cleanQuery
          ? this._queryProvider('Geoapify', GeoapifyTurbo, query, city, scoringOpts, expectedHouse, 6000)
          : Promise.resolve<{ scored: ScoredCandidate[]; perfect?: ScoredCandidate }>({ scored: [] }),
      ]))
    );

    const allScored: ScoredCandidate[] = [];
    let perfect: ScoredCandidate | undefined;

    for (const variantResults of queryResults) {
      for (const providerResult of variantResults) {
        allScored.push(...providerResult.scored);
        const pr = providerResult as { scored: ScoredCandidate[]; perfect?: ScoredCandidate };
        if (!perfect && pr.perfect) perfect = pr.perfect;
      }
    }
    
    if (perfect) return { scored: allScored, perfect };
    
    const best = pickBest(dedupeByCoord(allScored));
    if (best && best.score > -5000000) {
      return { scored: allScored, perfect: best };
    }

    return { scored: allScored };
  }

  private async _geocodeFull(
    rawAddress: string,
    _cleanQuery: string,
    city: string,
    scoringOpts: any,
    expectedHouse: string | null,
    silent?: boolean
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
      return [ph, nm].flatMap(r => r.scored);
    });

    const variantResults = await Promise.allSettled(variantPromises);
    allCandidates.push(...variantResults.filter(r => r.status === 'fulfilled').flatMap(r => (r as any).value));

    let perfect = pickBest(dedupeByCoord(allCandidates));
    if (perfect && isPerfectHit(perfect, expectedHouse)) {
        RobustGeocodingService.saveToPermanentCache(rawAddress, perfect.lat, perfect.lng, perfect.score);
        return { scored: allCandidates, perfect };
    }

    // v5.150: Always try Geoapify as fallback — FREE key is built-in, no user key required
    try {
      const { GeoapifyService } = await import('../geoapifyService');
      const geoRaw = await GeoapifyService.geocode(_cleanQuery, city);
      if (Array.isArray(geoRaw)) {
        allCandidates.push(...geoRaw.map((c: any) => scoreCandidate(normaliseRaw(c), scoringOpts)));
      }
    } catch {}

    if (expectedHouse) {
      const streetOnly = _cleanQuery.replace(/\b\d+[а-яієґa-z]*\b/gi, '').trim();
      if (streetOnly && streetOnly !== _cleanQuery) {
        const ph2 = await this._queryProvider('Photon', PhotonService, `${streetOnly}, ${city}`, city, scoringOpts, null, 3000);
        allCandidates.push(...ph2.scored.map(s => { s.score -= 3000; return s; }));
      }
    }

    perfect = pickBest(dedupeByCoord(allCandidates));

    // v5.150: Last Resort — try Geoapify WITHOUT city bias (catches addresses with wrong city prefix)
    if (!perfect || perfect.score < -13000000) {
      try {
        const { GeoapifyService } = await import('../geoapifyService');
        const geoRawNoBias = await GeoapifyService.geocode(_cleanQuery);
        if (Array.isArray(geoRawNoBias) && geoRawNoBias.length > 0) {
          const noBiasScored = geoRawNoBias.map((c: any) => scoreCandidate(normaliseRaw(c), scoringOpts));
          allCandidates.push(...noBiasScored);
          const noBiasBest = pickBest(dedupeByCoord(noBiasScored));
          if (noBiasBest && (!perfect || noBiasBest.score > perfect.score)) {
            perfect = noBiasBest;
          }
        }
      } catch {}
    }

    return { scored: allCandidates, perfect: perfect || undefined };
  }

  private _parseAddressGeo(geoStr: string): { lat: number; lng: number; address?: string; city?: string } | null {
    try {
      const latMatch = geoStr.match(/(?:Lat|Latitude)=["']?([\d.]+)["']?/i);
      const lngMatch = geoStr.match(/(?:Long|Longitude|Lon)=["']?([\d.]+)["']?/i);
      const addrMatch = geoStr.match(/AddressStr=["']?([^"']+)["']?/i);
      if (latMatch && lngMatch) {
        return { lat: parseFloat(latMatch[1]), lng: parseFloat(lngMatch[1]), address: addrMatch ? addrMatch[1] : undefined };
      }
    } catch {}
    return null;
  }

  /**
   * v5.151: Suburb city detector.
   * Extracts the real city from the address string if it mentions a known suburb.
   * This is the correct fix for addresses like "Бровари, вул. Садова, 5" being
   * geocoded against Kyiv and landing outside the KML zone.
   * Instead of loosening zone checks, we geocode against the RIGHT city.
   */
  private _detectAddressCity(rawAddress: string): string | null {
    const lower = rawAddress.toLowerCase();
    // Ordered by specificity — check longer names first to avoid partial matches
    const SUBURBS: Array<[RegExp, string]> = [
      [/\bбориспіль|\bборисполь|\bboryspil/i, 'Бориспіль'],
      [/\bбровари|\bбровары|\bbrovary/i, 'Бровари'],
      [/\bірпінь|\bирпень|\birpin/i, 'Ірпінь'],
      [/\bбуча|\bbucha/i, 'Буча'],
      [/\bвишневе|\bвишневое|\bvyshneveʼ/i, 'Вишневе'],
      [/\bвасильків|\bвасильков|\bvasylkiv/i, 'Васильків'],
      [/\bобухів|\bобухов|\bobukhiv/i, 'Обухів'],
      [/\bфастів|\bфастов|\bfastiv/i, 'Фастів'],
      [/\bбіла\s+церква|\bбелая\s+церковь/i, 'Біла Церква'],
      [/\bвишгород|\bvyshhorod/i, 'Вишгород'],
      [/\bбровари|\bbrovary/i, 'Бровари'],
    ];
    for (const [regex, city] of SUBURBS) {
      if (regex.test(lower)) return city;
    }
    return null;
  }



  async geocode(
    rawAddress: string,
    options: RobustGeocodeOptions = {}
  ): Promise<RobustGeocodeResult> {
    const {
      cityBias: optCityBias = this.cityBias,
      turbo = false,
    } = options

    const normalizedAddress = rawAddress.replace(/[ʼ`]/g, "'");

    // v5.151: Detect suburb city BEFORE cleaning the address.
    // If the raw address mentions Бровари/Бориспіль/Ірпінь etc., geocode against
    // THAT city — not Kyiv. This ensures the result lands inside the correct KML
    // zone without loosening zone boundary penalties. KML zones remain the filter.
    const detectedCity = this._detectAddressCity(rawAddress);
    const cityBias = detectedCity || optCityBias;

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
                    hasGeoErrors: false,
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
      const { scored, perfect } = await this._geocodeTurbo(rawAddress, cleanQuery, cityBias, scoringOpts, expectedHouse);
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

  async batchGeocode(requests: Array<{ address: string; options?: RobustGeocodeOptions }>, globalOptions: RobustGeocodeOptions = {}): Promise<Map<string, RobustGeocodeResult>> {
    const results = new Map<string, RobustGeocodeResult>();
    const { turbo = false } = globalOptions;
    
    const uniqueReqs = new Map<string, { address: string; options?: RobustGeocodeOptions }>();
    requests.forEach(req => {
        const addr = req.address || '';
        const key = addr.trim().toLowerCase();
        if (!uniqueReqs.has(key)) uniqueReqs.set(key, req);
    });

    const reqArray = Array.from(uniqueReqs.values());
    
    await Promise.all(reqArray.map(async (req) => {
        const addr = req.address || '';
        const key = addr.trim().toLowerCase();
        const combinedOptions = { ...globalOptions, ...(req.options || {}), turbo: turbo || req.options?.turbo };
        const result = await this.geocode(req.address, combinedOptions);
        results.set(key, result);
    }));
    
    const finalMap = new Map<string, RobustGeocodeResult>();
    requests.forEach(req => {
        const addr = req.address || '';
        const key = addr.trim().toLowerCase();
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
