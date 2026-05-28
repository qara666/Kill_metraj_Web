/**
 * YapikoOSRMService — Кастомный OSRM-провайдер маршрутизации
 * 
 * Использует Yapiko OSRM-сервер из настроек.
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
  geometry?: string
}

import { API_URL } from '../config/apiConfig';

export class YapikoOSRMService {
  /**
   * Построение базового URL бэкенда.
   */
  private static getBackendBaseUrl(): string | null {
    return API_URL;
  }

  private static getMaybeProxiedUrl(targetUrl: string): string {
    const backendBase = this.getBackendBaseUrl();
    if (backendBase) {
      // Очищаем backendBase чтобы избежать двойных слешей
      const cleanBase = backendBase.replace(/\/+$/, '');
      return `${cleanBase}/api/proxy/osrm?url=${encodeURIComponent(targetUrl)}`;
    }
    return targetUrl;
  }

  /**
   * Расчёт маршрута через кастомный OSRM-сервер.
   */
  static async calculateRoute(
    locations: { lat: number; lng: number }[],
    baseUrl: string,
    profileType: string = 'driving'
  ): Promise<OSRMRouteResult> {
    // v18.3: Deduplicate identical points to prevent OSRM 400 errors
    const uniqueLocations = locations.filter((loc, idx, self) => 
      idx === 0 || !(Math.abs(loc.lat - self[idx-1].lat) < 0.00001 && Math.abs(loc.lng - self[idx-1].lng) < 0.00001)
    );

    if (uniqueLocations.length < 2) {
      // If only 1 unique point (e.g. Hub -> Hub), distance is 0.
      return { feasible: true, totalDistance: 0, totalDuration: 0, legs: [] };
    }

    if (!baseUrl) {
        console.warn('[YapikoOSRM] URL не задан');
        return { feasible: false };
    }

    const normalizedUrl = baseUrl.trim().replace(/\/+$/, '');
    const profile = profileType === 'car' ? 'driving' : (profileType || 'driving');
    
    // Используем toFixed(7) для максимальной точности координат в OSRM
    const coordsStr = locations.map(l => `${Number(l.lng).toFixed(7)},${Number(l.lat).toFixed(7)}`).join(';');
    
    // Пробуем несколько профилей если нужно, но основной — запрошенный
    const tryProfiles = [profile];
    if (profile !== 'driving') tryProfiles.push('driving');
    
    let lastError = '';

    for (const p of tryProfiles) {
        const targetUrl = `${normalizedUrl}/route/v1/${p}/${coordsStr}?overview=full&steps=true&annotations=true`;
        const finalUrl = this.getMaybeProxiedUrl(targetUrl);

        try {
          // v10.5: Увеличен таймаут до 20с для сложных маршрутных матриц через прокси
          const response = await fetch(finalUrl, { signal: AbortSignal.timeout(20000) });
          
          if (!response.ok) {
              const errText = await response.text().catch(() => '');
              lastError = `HTTP ${response.status}: ${errText}`;
              console.warn(`[YapikoOSRM]  Ошибка (${p}): ${lastError}`);
              continue;
          }

          const data = await response.json();
          if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
            lastError = `OSRMR_CODE: ${data.code}`;
            console.warn(`[YapikoOSRM]  Невалидный ответ (${p}):`, data.code);
            continue;
          }

          const route = data.routes[0];
          

          const legs: OSRMLeg[] = (route.legs || []).map((leg: any, idx: number) => ({
            distance: { 
              value: leg.distance, 
              text: leg.distance >= 1000 ? `${(leg.distance / 1000).toFixed(1)} км` : `${leg.distance.toFixed(0)} м` 
            },
            duration: { 
              value: leg.duration, 
              text: `${Math.round(leg.duration / 60)} мин` 
            },
            start_location: uniqueLocations[idx],
            end_location: uniqueLocations[idx + 1]
          }));

          return {
            feasible: true,
            legs,
            totalDistance: route.distance,
            totalDuration: route.duration,
            geometry: route.geometry
          };
        } catch (error: any) {
          console.error(`[YapikoOSRM] Ошибка (${p}):`, error);
          lastError = String(error);
        }
    }

    return { feasible: false };
  }

  /**
   * Расчёт матрицы расстояний/времени для набора точек.
   */
  static async getMatrix(
    sources: { lat: number; lng: number }[],
    targets: { lat: number; lng: number }[],
    baseUrl: string
  ): Promise<any[][] | null> {
    if (sources.length === 0 || targets.length === 0 || !baseUrl) return null;

    const normalizedUrl = baseUrl.trim().replace(/\/+$/, '');
    const allPoints = [...sources, ...targets];
    const sourceIndices = sources.map((_, i) => i).join(';');
    const targetIndices = targets.map((_, i) => sources.length + i).join(';');
    const coordsStr = allPoints.map(p => `${Number(p.lng).toFixed(7)},${Number(p.lat).toFixed(7)}`).join(';');

    const targetUrl = `${normalizedUrl}/table/v1/driving/${coordsStr}?sources=${sourceIndices}&destinations=${targetIndices}&annotations=duration,distance`;
    const finalUrl = this.getMaybeProxiedUrl(targetUrl);

    try {
      const response = await fetch(finalUrl, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return null;
      
      const data = await response.json();
      if (data.code !== 'Ok' || !data.distances) return null;

      return data.distances.map((row: number[], i: number) => 
        row.map((dist: number, j: number) => ({
          distance: dist,
          duration: data.durations ? data.durations[i][j] : 0
        }))
      );
    } catch {
      return null;
    }
  }

  /**
   * v18.1: Calculate an OPTIMIZED route (TSP - Travel Salesman Problem)
   */
  static async calculateOptimizedRoute(
    locations: { lat: number; lng: number }[],
    baseUrl: string,
    profileType: string = 'driving'
  ): Promise<OSRMRouteResult & { waypoints?: any[] }> {
    // v18.3: Deduplicate to avoid 400 errors for identical points
    const uniqueLocations = locations.filter((loc, idx, self) => 
        idx === 0 || !(Math.abs(loc.lat - self[idx-1].lat) < 0.00001 && Math.abs(loc.lng - self[idx-1].lng) < 0.00001)
    );

    if (uniqueLocations.length < 2) {
      return { feasible: true, totalDistance: 0, totalDuration: 0, waypoints: [] };
    }

    // v18.3: OSRM TRIP API with only 2 points can return 400 if roundtrip=false and source=first.
    // Optimization is pointless for 2 locations (just A -> B).
    if (uniqueLocations.length === 2) {
        return this.calculateRoute(uniqueLocations, baseUrl, profileType);
    }

    if (!baseUrl) return { feasible: false };

    const normalizedUrl = baseUrl.trim().replace(/\/+$/, '');
    const profile = profileType === 'car' ? 'driving' : (profileType || 'driving');
    const coordsStr = uniqueLocations.map(l => `${Number(l.lng).toFixed(7)},${Number(l.lat).toFixed(7)}`).join(';');

    // v18.1: OSRM Trip API with source=first and roundtrip=false to keep starting hub fixed
    const targetUrl = `${normalizedUrl}/trip/v1/${profile}/${coordsStr}?overview=full&steps=true&source=first&roundtrip=false`;
    const finalUrl = this.getMaybeProxiedUrl(targetUrl);

    try {
      const response = await fetch(finalUrl, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
           console.warn(`[YapikoOSRM] TRIP 400 - Falling back to standard route`);
           return this.calculateRoute(uniqueLocations, baseUrl, profileType);
      }

      const data = await response.json();
      if (data.code !== 'Ok' || !data.trips || data.trips.length === 0) {
          return this.calculateRoute(uniqueLocations, baseUrl, profileType);
      }

      const trip = data.trips[0];
      const waypoints = data.waypoints || [];

      const legs: OSRMLeg[] = (trip.legs || []).map((leg: any, idx: number) => ({
        distance: { 
          value: leg.distance, 
          text: leg.distance >= 1000 ? `${(leg.distance / 1000).toFixed(1)} км` : `${leg.distance.toFixed(0)} м` 
        },
        duration: { 
          value: leg.duration, 
          text: `${Math.round(leg.duration / 60)} мин` 
        },
        start_location: { lat: waypoints[idx].location[1], lng: waypoints[idx].location[0] },
        end_location: { lat: waypoints[idx + 1].location[1], lng: waypoints[idx + 1].location[0] }
      }));

      return {
        feasible: true,
        legs,
        totalDistance: trip.distance,
        totalDuration: trip.duration,
        waypoints: waypoints.map((w: any) => ({ lat: w.location[1], lng: w.location[0], originalIndex: w.waypoint_index }))
      };
    } catch (e) {
      console.error('[YapikoOSRM] Optimization Error:', e);
      return this.calculateRoute(uniqueLocations, baseUrl, profileType);
    }
  }
}
