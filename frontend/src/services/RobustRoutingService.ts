/**
 * RobustRoutingService - Frontend Multi-Engine Routing Chain (v16.3)
 * 
 * This service implements an "Omnipresent Routing" strategy by chaining 
 * multiple routing engines with automatic fail-over. 
 * High parity with backend/workers/orderCalculator.js.
 */

import { YapikoOSRMService } from './YapikoOSRMService';
import { ValhallaService } from './valhallaService';
import { OSRMService } from './osrmService';
import { localStorageUtils } from '../utils/ui/localStorage';

export interface RoutingPoint {
    lat: number;
    lng: number;
}

export interface RobustRouteResult {
    feasible: boolean;
    totalDistance: number; // METERS
    totalDuration: number; // SECONDS
    engine: string;
    geoMeta?: {
        origin: RoutingPoint;
        waypoints: RoutingPoint[];
        destination: RoutingPoint;
    };
    error?: string;
}

// v17.1: In-memory route cache to skip re-requesting identical routes
const _robustRouteCache = new Map<string, RobustRouteResult>();
const ROBUST_CACHE_TTL = 30 * 60 * 1000; // 30 min
const _robustCacheTimestamps = new Map<string, number>();

// v18.3: Operational area constants (Kyiv)
const KYIV_CENTER = { lat: 50.4501, lng: 30.5234 };
const MAX_OP_RADIUS_KM = 200; // Total operational limit

function _isPointInOperationalArea(p: RoutingPoint): boolean {
    if (!p || isNaN(p.lat) || isNaN(p.lng)) return false;
    // Fast Euclidean distance check (good enough for 200km @ 50N)
    const dLat = (p.lat - KYIV_CENTER.lat) * 111; // 1 deg lat ~ 111km
    const dLng = (p.lng - KYIV_CENTER.lng) * 71;  // 1 deg lng ~ 71km @ 50N
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    return dist <= MAX_OP_RADIUS_KM;
}

function _makeRobustCacheKey(points: RoutingPoint[]): string {
    return points.map(p => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');
}

export class RobustRoutingService {
    /**
     * Sanitizes points for the operational area and removes duplicates.
     */
    private static _sanitizePoints(points: RoutingPoint[]): RoutingPoint[] {
        // 1. Remove points way outside Kyiv (garbage/wrong geocoding)
        const validGeoPoints = points.filter(p => _isPointInOperationalArea(p));
        
        // 2. Deduplicate identical adjacent points
        return validGeoPoints.filter((loc, idx, self) => 
            idx === 0 || !(Math.abs(loc.lat - self[idx-1].lat) < 0.0001 && Math.abs(loc.lng - self[idx-1].lng) < 0.0001)
        );
    }

    /**
     * v18.1: Calculate an OPTIMIZED route (TSP) with reordering points.
     */
    static async calculateOptimizedRoute(points: RoutingPoint[]): Promise<RobustRouteResult & { orderedPoints?: RoutingPoint[] }> {
        const cleanPoints = this._sanitizePoints(points);
        if (cleanPoints.length < 2) return { feasible: true, totalDistance: 0, totalDuration: 0, engine: 'none', orderedPoints: cleanPoints };
        
        const settings = localStorageUtils.getAllSettings();
        const osrmUrl = settings.yapikoOsrmUrl;

        // Try Optimization engine first
        if (osrmUrl) {
            try {
                const res = await YapikoOSRMService.calculateOptimizedRoute(cleanPoints, osrmUrl);
                if (res.feasible && res.totalDistance !== undefined) {
                    return {
                        feasible: true,
                        totalDistance: res.totalDistance,
                        totalDuration: res.totalDuration || 0,
                        engine: 'yapiko_osrm_optimized',
                        orderedPoints: res.waypoints ? res.waypoints.map(w => ({ lat: w.lat, lng: w.lng })) : cleanPoints
                    };
                }
            } catch {}
        }

        // Fallback to sequential route if optimization server fails or doesn't support TSP
        const seqResult = await this.calculateRoute(cleanPoints);
        return { ...seqResult, orderedPoints: cleanPoints };
    }

    /**
     * Calculate route with automatic fail-over chain:
     * Yapiko -> Valhalla -> Public OSRM -> Straight Line 
     */
    static async calculateRoute(points: RoutingPoint[]): Promise<RobustRouteResult> {
        const cleanPoints = this._sanitizePoints(points);
        if (cleanPoints.length < 2) {
            return { feasible: true, totalDistance: 0, totalDuration: 0, engine: 'none' };
        }

        // v17.1: Check in-memory cache first for instant response
        const cacheKey = _makeRobustCacheKey(cleanPoints);
        const cached = _robustRouteCache.get(cacheKey);
        if (cached) {
            const age = Date.now() - (_robustCacheTimestamps.get(cacheKey) || 0);
            if (age < ROBUST_CACHE_TTL) {
                return cached;
            }
        }

        const startTime = Date.now();
        const settings = localStorageUtils.getAllSettings();
        const osrmUrl = settings.yapikoOsrmUrl;

        const getGeoMeta = (): RobustRouteResult['geoMeta'] => ({
            origin: cleanPoints[0],
            waypoints: cleanPoints.slice(1, -1),
            destination: cleanPoints[cleanPoints.length - 1]
        });

        const cacheAndReturn = (result: RobustRouteResult): RobustRouteResult => {
            if (result.feasible) {
                result.geoMeta = getGeoMeta();
                _robustRouteCache.set(cacheKey, result);
                _robustCacheTimestamps.set(cacheKey, Date.now());
            }
            return result;
        };

        // v17.2.2: SEQUENTIAL CHAIN 
        // 1. Yapiko (Priority #1)
        if (osrmUrl) {
            try {
                const res = await YapikoOSRMService.calculateRoute(cleanPoints, osrmUrl);
                if (res.feasible && res.totalDistance !== undefined) {
                    return cacheAndReturn({
                        feasible: true,
                        totalDistance: res.totalDistance,
                        totalDuration: res.totalDuration || 0,
                        engine: 'yapiko_osrm'
                    });
                }
            } catch (e) {}
        }

        // 2. Valhalla (Fallback #1)
        try {
            const res = await ValhallaService.calculateRoute(cleanPoints);
            if (res.feasible && res.totalDistance !== undefined) {
                return cacheAndReturn({
                    feasible: true,
                    totalDistance: res.totalDistance,
                    totalDuration: res.totalDuration || 0,
                    engine: 'valhalla'
                });
            }
        } catch (e) {}

        // 3. Public OSRM (Fallback #2)
        try {
            const res = await OSRMService.calculateRoute(cleanPoints);
            if (res.feasible && res.totalDistance !== undefined) {
                return cacheAndReturn({
                    feasible: true,
                    totalDistance: res.totalDistance,
                    totalDuration: res.totalDuration || 0,
                    engine: 'osrm_public'
                });
            }
        } catch (e) {}

        // 4. Ultimate Fallback: Straight Line
        console.warn(`[RobustRouting] ❌ All engines failed in ${Date.now() - startTime}ms. Using Straight Line (Sanitized: ${cleanPoints.length} pts).`);
        const straightDistance = this._calculateStraightLineDistance(cleanPoints);
        return cacheAndReturn({
            feasible: true, 
            totalDistance: straightDistance,
            totalDuration: (straightDistance / 10) * 1.5,
            engine: 'straight_line_fallback'
        });
    }

    private static _calculateStraightLineDistance(points: RoutingPoint[]): number {
        let total = 0;
        const R = 6371e3;
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            const φ1 = p1.lat * Math.PI / 180;
            const φ2 = p2.lat * Math.PI / 180;
            const Δφ = (p2.lat - p1.lat) * Math.PI / 180;
            const Δλ = (p2.lng - p1.lng) * Math.PI / 180;
            const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            total += R * c;
        }
        return total;
    }
}

