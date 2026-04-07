/**
 * OSRMService — Secondary Routing Fallback
 *
 * Uses the Project-OSRM public demo server.
 * Note: Free-use, OSM-based.
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

const OSRM_BASE_URL = 'https://router.project-osrm.org'

export class OSRMService {
  /**
   * Calculate a route using OSRM.
   */
  static async calculateRoute(
    locations: { lat: number; lng: number }[]
  ): Promise<OSRMRouteResult> {
    if (locations.length < 2) return { feasible: false }

    const coordsStr = locations.map(l => `${l.lng},${l.lat}`).join(';')
    const url = `${OSRM_BASE_URL}/route/v1/driving/${coordsStr}?overview=false&steps=false`

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!response.ok) return { feasible: false }

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
      console.warn('[Маршрут] Ошибка OSRM:', error)
      return { feasible: false }
    }
  }
}
