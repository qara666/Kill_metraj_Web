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
  private static getBackendBaseUrl(): string | null {
    if (typeof window === 'undefined') return null;
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}:5001`; // Default dev backend port
    }

    if (hostname.includes('onrender.com')) {
      if (hostname === 'yapiko-auto-km-frontend-live.onrender.com') {
        return 'https://yapiko-auto-km-backend.onrender.com';
      }
      return `https://${hostname.replace('frontend', 'backend')}`;
    }
    return null;
  }

  private static getMaybeProxiedUrl(targetUrl: string): string {
    const backendBase = this.getBackendBaseUrl();
    if (backendBase) {
      return `${backendBase}/api/proxy/routing?url=${encodeURIComponent(targetUrl)}`;
    }
    return targetUrl;
  }

  /**
   * Calculate a route using OSRM.
   */
  static async calculateRoute(
    locations: { lat: number; lng: number }[]
  ): Promise<OSRMRouteResult> {
    if (locations.length < 2) return { feasible: false }

    const coordsStr = locations.map(l => `${l.lng},${l.lat}`).join(';')
    const targetUrl = `${OSRM_BASE_URL}/route/v1/driving/${coordsStr}?overview=false&steps=false`
    const finalUrl = this.getMaybeProxiedUrl(targetUrl);

    try {
      const response = await fetch(finalUrl, { signal: AbortSignal.timeout(5000) })
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
    } catch (error: any) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
         // Silenced for clean console. RobustRoutingService handles the fallback.
      } else {
         console.warn('[Маршрут] Ошибка OSRM:', error?.message ?? error)
      }
      return { feasible: false }
    }
  }
}
