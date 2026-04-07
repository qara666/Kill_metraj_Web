/**
 * Ultra-fast route result caching to eliminate routing calls for repeated routes
 */

const ROUTE_CACHE_KEY = 'km_route_cache_v2';
const MAX_CACHE_SIZE = 100;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export class RouteCache {
  private static getCache(): { [key: string]: { result: any; timestamp: number } } {
    if (typeof window === 'undefined') return {};
    try {
      const data = localStorage.getItem(ROUTE_CACHE_KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  private static saveCache(cache: { [key: string]: { result: any; timestamp: number } }): void {
    if (typeof window === 'undefined') return;
    try {
      // Trim to max size
      const entries = Object.entries(cache)
        .sort(([, a], [, b]) => b.timestamp - a.timestamp)
        .slice(0, MAX_CACHE_SIZE);
      localStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch (e) {
      console.warn('[RouteCache] Ошибка сохранения кэша:', e);
    }
  }

  static generateKey(locations: { lat: number; lng: number }[], profile: string = 'driving'): string {
    // Create a stable key from sorted coordinates and profile
    const sorted = [...locations]
      .sort((a, b) => a.lat - b.lat || a.lng - b.lng)
      .map(loc => `${loc.lat.toFixed(6)},${loc.lng.toFixed(6)}`)
      .join('|');
    return `${profile}:${sorted}`;
  }

  static get(locations: { lat: number; lng: number }[], profile: string = 'driving'): any | null {
    const key = this.generateKey(locations, profile);
    const cache = this.getCache();
    const entry = cache[key];
    
    if (entry && (Date.now() - entry.timestamp < CACHE_TTL_MS)) {
      return entry.result;
    }
    
    // Remove expired entry
    if (entry && (Date.now() - entry.timestamp >= CACHE_TTL_MS)) {
      delete cache[key];
      this.saveCache(cache);
    }
    
    return null;
  }

  static set(locations: { lat: number; lng: number }[], result: any, profile: string = 'driving'): void {
    const key = this.generateKey(locations, profile);
    const cache = this.getCache();
    cache[key] = { result, timestamp: Date.now() };
    this.saveCache(cache);
  }

  static clear(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(ROUTE_CACHE_KEY);
  }
}