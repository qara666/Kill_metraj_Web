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
    const url = `${normalizedUrl}/route/v1/driving/${coordsStr}?overview=false&steps=false`

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
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
}
