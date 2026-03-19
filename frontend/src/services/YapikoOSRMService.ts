import { API_URL } from '../config/apiConfig';

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
   * Helper to proxy OSRM requests on Render to avoid Mixed Content blocks
   */
  private static getMaybeProxiedUrl(targetUrl: string): string {
    const isRender = typeof window !== 'undefined' && window.location.hostname.includes('onrender.com');
    if (isRender) {
      return `${API_URL}/api/proxy/osrm?url=${encodeURIComponent(targetUrl)}`;
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
    const targetUrl = `${normalizedUrl}/route/v1/driving/${coordsStr}?overview=false&steps=false`
    const finalUrl = this.getMaybeProxiedUrl(targetUrl);

    try {
      const response = await fetch(finalUrl, { signal: AbortSignal.timeout(10000) })
      if (!response.ok) {
          console.error(`[Маршрут] Yapiko OSRM error: ${response.status} ${response.statusText}`);
          return { feasible: false };
      }

      const data = await response.json()
      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        return { feasible: false }
      }

      const route = data.routes[0]
      const legs: OSRMLeg[] = (route.legs || []).map((leg: any, idx: number) => ({
        distance: { 
          value: leg.distance, 
          text: leg.distance >= 1000 ? `${(leg.distance / 1000).toFixed(1)} km` : `${leg.distance.toFixed(0)} m` 
        },
        duration: { 
          value: leg.duration, 
          text: `${Math.round(leg.duration / 60)} min` 
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
      console.warn('[Маршрут] Ошибка Yapiko OSRM:', error)
      return { feasible: false }
    }
  }

  /**
   * Calculate a distance/duration matrix for a set of points using Yapiko OSRM.
   */
  static async getMatrix(
    sources: { lat: number; lng: number }[],
    targets: { lat: number; lng: number }[],
    baseUrl: string
  ): Promise<{ distance: number; duration: number }[][] | null> {
    if (!baseUrl) return null;
    
    const normalizedUrl = baseUrl.replace(/\/$/, '');
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
    } catch (err) {
      console.warn('[Маршрут] Ошибка матрицы Yapiko OSRM:', err)
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
