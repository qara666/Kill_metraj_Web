/**
 * YapikoOSRMService — Custom OSRM Routing Provider
 * 
 * Uses the Yapiko OSRM server specified in settings.
 */

export interface OSRMLeg {
  distance: { text: string; value: number }
  duration: { text: string; value: number }
  start_location?: { lat: number; lng: number }
  end_location?: { lat: number; lng: number }
}

export interface OSRMRouteResult {
  feasible: boolean
  legs?: OSRMLeg[]
  totalDuration?: number
  totalDistance?: number
}

export class YapikoOSRMService {
  /**
   * Build the backend base URL directly from window.location — NO imports required.
   * Works on Render (onrender.com) to route OSRM calls through backend proxy,
   * avoiding Mixed Content blocks. Zero risk of circular ESM dependencies.
   */
  private static getBackendBaseUrl(): string | null {
    if (typeof window === 'undefined') return null;
    const hostname = window.location.hostname;
    if (!hostname.includes('onrender.com')) return null;

    // Match the backend hostname used in apiConfig.ts runtime logic
    if (hostname === 'yapiko-auto-km-frontend-live.onrender.com') {
      return 'https://yapiko-auto-km-backend.onrender.com';
    }
    if (hostname.includes('frontend')) {
      return `https://${hostname.replace('frontend', 'backend')}`;
    }
    return null;
  }

  private static getMaybeProxiedUrl(targetUrl: string): string {
    const backendBase = this.getBackendBaseUrl();
    if (backendBase) {
      return `${backendBase}/api/proxy/osrm?url=${encodeURIComponent(targetUrl)}`;
    }
    return targetUrl;
  }

  /**
   * Calculate a route using a custom OSRM server.
   */
  static async calculateRoute(
    locations: { lat: number; lng: number }[],
    baseUrl: string
  ): Promise<OSRMRouteResult> {
    if (locations.length < 2) return { feasible: false }
    if (!baseUrl) {
        console.warn('[Маршрут] Yapiko OSRM URL не задан в настройках');
        return { feasible: false };
    }

    // Ensure baseUrl doesn't have trailing slash
    const normalizedUrl = baseUrl.replace(/\/$/, '');
    
    // OSRM expects coordinates in lng,lat format joined by ';'
    const coordsStr = locations.map(l => `${l.lng},${l.lat}`).join(';')
    
    // v5.106: Try 'driving' first, then 'car' if needed
    const profiles = ['driving', 'car'];
    let lastError = '';

    for (const profile of profiles) {
        const targetUrl = `${normalizedUrl}/route/v1/${profile}/${coordsStr}?overview=false&steps=false`
        const finalUrl = this.getMaybeProxiedUrl(targetUrl);

        try {
          const response = await fetch(finalUrl, { signal: AbortSignal.timeout(10000) })
          if (!response.ok) {
              lastError = `HTTP ${response.status} ${response.statusText}`;
              if (response.status === 404) continue; // Profile might not exist, try next
              console.error(`[Маршрут] Yapiko OSRM error (${profile}): ${lastError}`);
              return { feasible: false };
          }

          const data = await response.json()
          if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
            lastError = `Code: ${data.code}`;
            console.error(`[Маршрут] Yapiko OSRM invalid data (${profile}):`, data);
            continue;
          }

          const route = data.routes[0]
          const legs: OSRMLeg[] = (route.legs || []).map((leg: any, idx: number) => ({
            distance: { 
              value: leg.distance, 
              text: leg.distance >= 1000 ? `${(leg.distance / 1000).toFixed(1)} км` : `${leg.distance.toFixed(0)} м` 
            },
            duration: { 
              value: leg.duration, 
              text: `${Math.round(leg.duration / 60)} мин` 
            },
            start_location: locations[idx],
            end_location: locations[idx + 1]
          }))

          return {
            feasible: true,
            legs,
            totalDistance: route.distance,
            totalDuration: route.duration
          }
        } catch (error) {
          console.error(`[Маршрут] Ошибка Yapiko OSRM (${profile}):`, error)
          lastError = String(error);
        }
    }

    if (lastError) {
        console.warn(`[Маршрут] Yapiko OSRM не удалось рассчитать ни по одному профилю. Последняя ошибка: ${lastError}`);
    }
    return { feasible: false }
  }

  /**
   * Calculate a distance/duration matrix for a set of points.
   */
  static async getMatrix(
    sources: { lat: number; lng: number }[],
    targets: { lat: number; lng: number }[],
    baseUrl: string
  ): Promise<{ distance: number; duration: number }[][] | null> {
    if (sources.length === 0 || targets.length === 0 || !baseUrl) return null

    const normalizedUrl = baseUrl.replace(/\/$/, '')
    const allPoints = [...sources, ...targets]
    const sourceIndices = sources.map((_, i) => i).join(';')
    const targetIndices = targets.map((_, i) => sources.length + i).join(';')
    const coordsStr = allPoints.map(p => `${p.lng},${p.lat}`).join(';')

    const targetUrl = `${normalizedUrl}/table/v1/driving/${coordsStr}?sources=${sourceIndices}&destinations=${targetIndices}&annotations=duration,distance`
    const finalUrl = this.getMaybeProxiedUrl(targetUrl);

    try {
      const response = await fetch(finalUrl, { signal: AbortSignal.timeout(10000) })
      if (!response.ok) return null
      
      const data = await response.json()
      if (data.code !== 'Ok' || !data.distances) return null

      return data.distances.map((row: number[], i: number) => 
        row.map((dist: number, j: number) => ({
          distance: dist,
          duration: data.durations ? data.durations[i][j] : 0
        }))
      )
    } catch {
      return null
    }
  }
  /**
   * Quick point-to-point distance estimate using matrix (single leg).
   */
  static async getPointDistance(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    baseUrl: string
  ): Promise<{ distanceM: number; durationS: number } | null> {
    const result = await this.calculateRoute([from, to], baseUrl)
    if (!result.feasible || result.totalDistance === undefined) return null
    return { distanceM: result.totalDistance, durationS: result.totalDuration ?? 0 }
  }
}
