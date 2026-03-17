import { findClustersHierarchical, calculateOrderPriorityV2, groupOrdersByReadyTimeWindows, enhancedCandidateEvaluationV2, prefilterCandidatesByDistance } from './routeOptimizationHelpers';
import { type Order, type TrafficSnapshot } from '../../types';
import { routeOptimizationCache } from './routeOptimizationCache';
import { GoogleAPIManager } from '../api/googleAPIManager';
import { optimizeRouteOrder2Opt } from './optimization2Opt';
import { RoutePlanningSettings } from '../../types';
import { getKitchenTime, getPlannedTime } from '../data/orderEnrichment';

export interface RoutePlanningContext {
    apiManager: GoogleAPIManager;
    runtimeMaxStopsPerRoute: number;
    runtimeMaxRouteDurationMin: number;
    runtimeMaxRouteDistanceKm: number;
    optimizedSettings: RoutePlanningSettings;
    trafficSnapshot: TrafficSnapshot | null;
    depotCoords: { lat: number, lng: number } | null;
    endCoords?: { lat: number, lng: number } | null;
    defaultStartAddress: string;
    defaultStartLat?: number | null;
    defaultStartLng?: number | null;
    defaultEndAddress: string;
    defaultEndLat?: number | null;
    defaultEndLng?: number | null;
    setOptimizationProgress: (p: { current: number; total: number; message: string }) => void;
}

export async function runRoutePlanningAlgorithm(
    orders: Order[],
    context: RoutePlanningContext
): Promise<any[]> {
    const {
        apiManager,
        runtimeMaxStopsPerRoute,
        optimizedSettings,
        depotCoords,
        defaultStartAddress,
        defaultEndAddress,
        setOptimizationProgress
    } = context;

    // --- ENRICHMENT --- (NEW)
    const availableCouriersCount = 1; // Simplified for now
    const avgRouteLoad = orders.length / Math.max(1, Math.ceil(orders.length / runtimeMaxStopsPerRoute));

    const enriched = orders.map((order: any) => {
        const ready = getKitchenTime(order);
        const deadline = getPlannedTime(order);
        return {
            ...order,
            readyAt: ready ? ready + 4 * 60 * 1000 : null, // +4 min packing
            readyAtSource: ready,
            deadlineAt: deadline,
            _priority: calculateOrderPriorityV2(order, {
                currentTime: Date.now(),
                availableCouriers: availableCouriersCount,
                avgRouteLoad,
                allOrders: orders
            })
        };
    });

    if (depotCoords) {
        for (const order of enriched) {
            const coords = order.coords || routeOptimizationCache.getCoordinates(order.address);
            if (coords) {
                const bearing = (Math.atan2(coords.lng - depotCoords.lng, coords.lat - depotCoords.lat) * 180) / Math.PI; // Simple bearing
                order._bearingFromBase = bearing;
            }
        }
    }

    // Sort by ready time and priority
    enriched.sort((a, b) => {
        const aReady = a.readyAtSource || a.readyAt || Date.now();
        const bReady = b.readyAtSource || b.readyAt || Date.now();
        const diffA = aReady - Date.now();
        const diffB = bReady - Date.now();
        if (diffA <= 0 && diffB > 0) return -1;
        if (diffA > 0 && diffB <= 0) return 1;
        if (diffA <= 0 && diffB <= 0) return (b._priority || 0) - (a._priority || 0);
        return diffA - diffB;
    });

    const usedOrderIds = new Set<string>();
    const getOrderId = (o: any) => o.id || o.raw?.id || `${o.orderNumber || ''}_${o.address}`;

    // Clustering
    const readyTimeWindows = groupOrdersByReadyTimeWindows(enriched, 30);
    const clusters = findClustersHierarchical(readyTimeWindows.flat(), (optimizedSettings.proximityGroupingRadius || 2000) / 1000);

    // Flatten clusters but keep them sorted by cluster density/priority?
    // For now, let's process clusters one by one or at least use them to guide the sequence.
    let remaining = [...clusters.flat()];

    const routes: any[] = [];
    const filterRemaining = () => { remaining = remaining.filter(o => !usedOrderIds.has(getOrderId(o))) };

    while (remaining.length > 0) {
        setOptimizationProgress({
            current: routes.length,
            total: orders.length,
            message: `Построение маршрута #${routes.length + 1}`
        });

        filterRemaining();
        if (remaining.length === 0) break;

        // Seed selection
        const seed = remaining[0];
        const seedId = getOrderId(seed);
        usedOrderIds.add(seedId);
        let routeChain = [seed];
        let routeReasons: string[] = [];

        routeReasons.push(`Заказ #${seed.orderNumber} выбран как семя маршрута`);

        // Yield to UI thread
        await new Promise(r => setTimeout(r, 0));

        // Candidate search
        while (routeChain.length < runtimeMaxStopsPerRoute) {
            const lastOrder = routeChain[routeChain.length - 1];
            const lastCoords = lastOrder.coords || routeOptimizationCache.getCoordinates(lastOrder.address);
            if (!lastCoords) break;

            const candidates = remaining.filter(c => !usedOrderIds.has(getOrderId(c)));
            if (candidates.length === 0) break;

            const closeCandidates = prefilterCandidatesByDistance(candidates, lastCoords, optimizedSettings.maxDistanceBetweenOrdersKm || 15);

            const evaluations = await Promise.all(closeCandidates.slice(0, 20).map(async candidate => {
                const evalRes = enhancedCandidateEvaluationV2(candidate, routeChain, {
                    lastOrderCoords: lastCoords,
                    allOrders: orders,
                    baseCoords: depotCoords || null,
                    routePosition: routeChain.length / runtimeMaxStopsPerRoute
                });
                return { candidate, score: evalRes.score, distance: evalRes.distance };
            }));

            evaluations.sort((a, b) => b.score - a.score);

            const topCandidate = evaluations.find(e => e.score > 0);

            if (!topCandidate) break;

            // V37 Speedup: Stop calling OSRM for every single candidate stop.
            // Just trust the heuristic score, add it to the chain. 
            // We will only call OSRM once at the very end of the route construction.
            routeChain.push(topCandidate.candidate);
            usedOrderIds.add(getOrderId(topCandidate.candidate));
            routeReasons.push(`Заказ #${topCandidate.candidate.orderNumber} добавлен (оценка: ${topCandidate.score.toFixed(1)})`);

            // Yield periodically in nested loops
            if (routeChain.length % 5 === 0) await new Promise(r => setTimeout(r, 0));
        }

        // --- 2-OPT OPTIMIZATION --- (NEW)
        if (routeChain.length > 2) {
            routeChain = optimizeRouteOrder2Opt(routeChain, {
                startCoords: depotCoords,
                endCoords: depotCoords
            });
            routeReasons.push(`Маршрут оптимизирован методом 2-opt`);
        }

        // Finalize route
        const finalCheck = await apiManager.checkRouteWithTraffic(routeChain, { includeStartEnd: true, priority: 'high' });

        routes.push({
            id: `route-${Date.now()}-${routes.length + 1}`,
            name: `Маршрут ${routes.length + 1}`,
            startAddress: defaultStartAddress,
            endAddress: defaultEndAddress,
            routeChainFull: routeChain,
            routeChain: routeChain.map(n => n.address),
            orderNumbers: routeChain.map((n, i) => n.orderNumber || `#${i + 1}`),
            totalDuration: finalCheck.adjustedDuration || finalCheck.totalDuration || 0,
            totalDistance: finalCheck.totalDistance || 0,
            stopsCount: routeChain.length,
            reasons: routeReasons,
            directionsLegs: finalCheck.legs,
            legDurations: (finalCheck.legs || []).map((leg: any) => (leg.duration_in_traffic?.value || leg.duration?.value || 0) / 60),
            trafficInfo: finalCheck.trafficInfo,
            totalTrafficDelay: finalCheck.totalTrafficDelay,
            hasCriticalTraffic: finalCheck.hasCriticalTraffic
        });
    }

    // --- GLOBAL OPTIMIZATION --- (DISABLED FOR SPEED)
    // Skipped global route optimization and rebalancing to ensure sub-second calculation


    // --- REBALANCING --- (DISABLED FOR SPEED)
    // Skipped rebalancing


    return routes;
}
