/**
 * routingService.ts — v5.117 Centralised Routing with OSRM-First Fallback
 *
 * Priority chain:
 *  1. YapikoOSRM  — local/custom OSRM server (fastest, configured by admin)
 *  2. Valhalla    — public FOSSGIS, free, real roads
 *
 * All call sites should use `calculateRouteWithFallback` instead of calling
 * individual services directly to ensure consistent behaviour and logging.
 */

import { localStorageUtils } from '../utils/ui/localStorage';
import { calculateDistance } from '../utils/geoUtils';

export interface RoutingResult {
  feasible: boolean;
  totalDistance?: number; // meters
  totalDuration?: number; // seconds
  usedEngine?: 'yapiko_osrm' | 'valhalla' | 'generoute';
  legs?: any[];
  geoMeta?: {
    origin: { lat: number; lng: number } | null;
    waypoints: { lat: number; lng: number }[];
    destination: { lat: number; lng: number } | null;
  };
}

/**
 * v5.118: TURBO RACE MODE
 * Fires all available engines in parallel and returns the fastest successful result.
 */
export async function calculateTurboRace(
  points: { lat: number; lng: number }[],
  options: {
    yapikoOsrmUrl?: string;
    generouteApiKey?: string;
    maxDistanceKm?: number;
    verbose?: boolean;
  } = {}
): Promise<RoutingResult> {
  const startTime = Date.now();
  if (points.length < 2) return { feasible: false };

  const osrmUrl = options.yapikoOsrmUrl?.trim();
  const genKey = options.generouteApiKey?.trim();

  const race = Promise.allSettled([
    // 1. Yapiko OSRM (Direct/Proxy)
    osrmUrl ? (async () => {
      const { YapikoOSRMService } = await import('./YapikoOSRMService');
      const r = await YapikoOSRMService.calculateRoute(points, osrmUrl);
      if (r.feasible && (r.totalDistance ?? 0) > 0) return { ...r, usedEngine: 'yapiko_osrm' as const };
      throw new Error('Yapiko empty');
    })() : Promise.reject('No URL'),

    // 2. Valhalla (Public)
    (async () => {
      const { ValhallaService } = await import('./valhallaService');
      const r = await ValhallaService.calculateRoute(points);
      if (r.feasible && (r.totalDistance ?? 0) > 0) return { ...r, usedEngine: 'valhalla' as const };
      throw new Error('Valhalla empty');
    })(),

    // 3. Generoute (Fallback)
    genKey ? (async () => {
      const { GenerouteService } = await import('./generouteService');
      const r = await GenerouteService.calculateRoute(points, genKey);
      if (r.feasible && (r.totalDistance ?? 0) > 0) return { ...r, usedEngine: 'generoute' as const };
      throw new Error('Generoute empty');
    })() : Promise.reject('No key'),
  ]);

  const results = await race;
  const winner = results.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<any> | undefined;

  if (winner) {
    const r = winner.value;
    const distKm = (r.totalDistance || 0) / 1000;

    // Считаем 직선 (haversine) дистанцию через все точки для проверки на адекватность
    // v5.128: SINGLE LEG ANOMALY SHIELD
    // If any single leg is > 35km straight-line, it's definitely a geocoding error (Makariv vs Kyiv)
    let maxSingleLegStraightKm = 0;
    let straightLineKm = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const d = calculateDistance(points[i], points[i+1]) / 1000;
        straightLineKm += d;
        if (d > maxSingleLegStraightKm) maxSingleLegStraightKm = d;
    }

    if (maxSingleLegStraightKm > 35) {
        console.error(`[TurboRace] 🛑 КРИТИЧЕСКАЯ АНОМАЛИЯ: Сегмент ${maxSingleLegStraightKm.toFixed(1)} км (>35км). ОТКЛОНЕНО.`);
        return { feasible: false };
    }

    // v5.129: ANOMALY SHIELD — ratio restored to x3.5 (city hub routes regularly exceed x2.5)
    const maxDist = options.maxDistanceKm || 100;
    const dynamicMaxDist = Math.max(maxDist, straightLineKm * 3.5 + 5); 
    
    if (distKm > maxDist * 1.5 || distKm > dynamicMaxDist) {
      console.warn(`[TurboRace] 🛡️ АНОМАЛИЯ ОТКЛОНЕНА: Длина ${distKm.toFixed(1)} км (прямая ~${straightLineKm.toFixed(1)} км). Лимиты: ${maxDist}/${dynamicMaxDist.toFixed(1)} км.`);
      return { feasible: false };
    }

    if (options.verbose !== false) {
      console.log(`[TurboRace] 🏎️ WINNER: ${r.usedEngine} in ${Date.now() - startTime}ms (${distKm.toFixed(1)} km)`);
    }
    return {
      feasible: true,
      totalDistance: r.totalDistance,
      totalDuration: r.totalDuration,
      usedEngine: r.usedEngine,
      legs: r.legs,
    };
  }

  return { feasible: false };
}

/**
 * Calculate a route, trying YapikoOSRM first (if configured),
 * then falling back to Valhalla.
 */
export async function calculateRouteWithFallback(
  points: { lat: number; lng: number }[],
  options: {
    yapikoOsrmUrl?: string;
    maxDistanceKm?: number;
    verbose?: boolean;
  } = {}
): Promise<RoutingResult> {
  if (points.length < 2) return { feasible: false };

  const settings = options.yapikoOsrmUrl !== undefined
    ? { yapikoOsrmUrl: options.yapikoOsrmUrl }
    : localStorageUtils.getAllSettings();

  const osrmUrl = (settings.yapikoOsrmUrl || '').trim();

  // ────────────────────────────────────────────────────────────────────────
  // 1. YapikoOSRM (Primary)
  // ────────────────────────────────────────────────────────────────────────
  if (osrmUrl) {
    try {
      const { YapikoOSRMService } = await import('./YapikoOSRMService');
      const r = await YapikoOSRMService.calculateRoute(points, osrmUrl);
      if (r.feasible && r.totalDistance != null) {
        const distKm = r.totalDistance / 1000;
        
        // Хаверсин для fallback
        // v5.128: SINGLE LEG ANOMALY SHIELD
        let maxStepStraightKm = 0;
        let slKm = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const d = calculateDistance(points[i], points[i+1]) / 1000;
            slKm += d;
            if (d > maxStepStraightKm) maxStepStraightKm = d;
        }
        if (maxStepStraightKm > 35) {
          console.error(`[Fallback] 🛑 КРИТИЧЕСКАЯ АНОМАЛИЯ: Сегмент ${maxStepStraightKm.toFixed(1)} км (>35км).`);
          return { feasible: false };
        }

        const maxDist = options.maxDistanceKm || 100;
        const dynMax = Math.max(maxDist, slKm * 3.5 + 5);

        if (distKm > maxDist * 1.5 || distKm > dynMax) {
          console.warn(`[Fallback] 🛡️ Yapiko OSRM АНОМАЛИЯ: ${distKm.toFixed(1)} км отклонено (прямая ~${slKm.toFixed(1)} км).`);
          return { feasible: false };
        } else {
          if (options.verbose !== false) {
            console.log(`[Маршрут] ✅ YapikoOSRM: ${distKm.toFixed(1)} km / ${Math.round((r.totalDuration || 0) / 60)} min`);
          }
          return {
            feasible: true,
            totalDistance: r.totalDistance,
            totalDuration: r.totalDuration,
            usedEngine: 'yapiko_osrm',
            legs: r.legs,
          };
        }
      }
      console.warn('[Маршрут] ⚠️ YapikoOSRM вернул пустой результат или аномалию — переключаюсь на Valhalla');
    } catch (e) {
      console.warn('[Маршрут] ⚠️ YapikoOSRM ошибка — переключаюсь на Valhalla:', e);
    }
  } else {
    console.log('[Маршрут] ℹ️ YapikoOSRM URL не настроен — используется Valhalla');
  }

  // ────────────────────────────────────────────────────────────────────────
  // 2. Valhalla (Fallback)
  // ────────────────────────────────────────────────────────────────────────
  try {
    const { ValhallaService } = await import('./valhallaService');
    const r = await ValhallaService.calculateRoute(points);
    if (r.feasible && r.totalDistance != null) {
      const distKm = r.totalDistance / 1000;
      const maxDist = options.maxDistanceKm || 100;
      if (distKm > maxDist * 1.5) {
         console.warn(`[Fallback] 🛡️ Valhalla АНОМАЛИЯ: ${distKm.toFixed(1)} км отклонено.`);
      } else {
        if (options.verbose !== false) {
          console.log(`[Маршрут] ✅ Valhalla: ${distKm.toFixed(1)} km / ${Math.round((r.totalDuration || 0) / 60)} min`);
        }
        return {
          feasible: true,
          totalDistance: r.totalDistance,  // meters
          totalDuration: r.totalDuration,  // seconds
          usedEngine: 'valhalla',
          legs: r.legs,
        };
      }
    }
    console.warn('[Маршрут] ⚠️ Valhalla вернул пустой результат или аномалию');
  } catch (e) {
    console.warn('[Маршрут] ⚠️ Valhalla ошибка:', e);
  }

  return { feasible: false };
}
