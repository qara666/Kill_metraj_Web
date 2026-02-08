import { findClustersHierarchical, calculateOrderPriorityV2, groupOrdersByReadyTimeWindows, enhancedCandidateEvaluationV2, prefilterCandidatesByDistance, globalRouteOptimization, rebalanceRoutesV3, type RouteForRebalancing, type GlobalOptimizationContext, type RebalanceContext } from './routeOptimizationHelpers';
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
    defaultStartAddress: string;
    defaultEndAddress: string;
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
        trafficSnapshot,
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

            // Parallel check for top N candidates instead of just one
            const topCandidates = evaluations.filter(e => e.score > 0).slice(0, 5);

            if (topCandidates.length === 0) break;

            console.log(`Checking ${topCandidates.length} candidates in parallel for route ${routes.length + 1}`);

            let bestFeasible = null;

            // Check in parallel
            const checks = await Promise.all(topCandidates.map(async (candidateEval) => {
                const trialChain = [...routeChain, candidateEval.candidate];
                const check = await apiManager.checkRouteWithTraffic(trialChain, {
                    includeStartEnd: true,
                    priority: 'high',
                    maxDistanceKm: optimizedSettings.maxDistanceBetweenOrdersKm,
                    maxReadyTimeDiffMinutes: optimizedSettings.maxReadyTimeDifferenceMinutes
                });
                return { candidateEval, check };
            }));

            // Find best feasible (since they were sorted by score, the first feasible is the best)
            for (const { candidateEval, check } of checks) {
                if (check.feasible) {
                    bestFeasible = { candidate: candidateEval.candidate, score: candidateEval.score };
                    break;
                }
            }

            if (bestFeasible) {
                routeChain.push(bestFeasible.candidate);
                usedOrderIds.add(getOrderId(bestFeasible.candidate));
                routeReasons.push(`Заказ #${bestFeasible.candidate.orderNumber} добавлен (оценка: ${bestFeasible.score.toFixed(1)})`);

                // Yield periodically in nested loops
                if (routeChain.length % 3 === 0) await new Promise(r => setTimeout(r, 0));
            } else {
                break;
            }
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
            trafficInfo: finalCheck.trafficInfo,
            totalTrafficDelay: finalCheck.totalTrafficDelay,
            hasCriticalTraffic: finalCheck.hasCriticalTraffic
        });
    }

    // --- GLOBAL OPTIMIZATION --- (NEW)
    if (routes.length > 1) {
        setOptimizationProgress({ current: routes.length, total: routes.length, message: 'Глобальная оптимизация...' });
        const routesForOpt: RouteForRebalancing[] = routes.map(r => ({
            orders: r.routeChainFull, totalDistance: r.totalDistance, totalDuration: r.totalDuration, _originalRoute: r
        }));
        const optContext: GlobalOptimizationContext = {
            checkChainFeasible: async (o) => apiManager.checkRoute(o, { priority: 'low', includeStartEnd: true }),
            maxStopsPerRoute: runtimeMaxStopsPerRoute,
            maxRouteDurationMin: context.runtimeMaxRouteDurationMin,
            maxRouteDistanceKm: context.runtimeMaxRouteDistanceKm,
            maxReadyTimeDifferenceMinutes: optimizedSettings.maxReadyTimeDifferenceMinutes,
            maxWaitPerStopMin: 15, // Default
            trafficImpactLevel: optimizedSettings.trafficImpactLevel || 'medium',
            lateDeliveryPenalty: optimizedSettings.lateDeliveryPenalty || 50
        };
        const optimized = await globalRouteOptimization(routesForOpt, optContext);

        const newFinalRoutes = [];
        for (const optR of optimized) {
            if (optR.orders.length === 0) continue;
            const check = await apiManager.checkRoute(optR.orders, { priority: 'low', includeStartEnd: true });
            if (check.feasible) {
                newFinalRoutes.push({
                    ...((optR as any)._originalRoute || {}),
                    id: `route_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    routeChainFull: optR.orders,
                    routeChain: optR.orders.map(o => o.address),
                    orderNumbers: optR.orders.map((o, i) => o.orderNumber || `#${i + 1}`),
                    totalDuration: check.totalDuration,
                    totalDistance: check.totalDistance,
                    stopsCount: optR.orders.length,
                    directionsLegs: check.legs,
                    reasons: [
                        ...(((optR as any)._originalRoute?.reasons) || []),
                        ` Глобальная оптимизация: Маршрут был улучшен для минимизации общего пробега.`
                    ]
                });
            }
        }
        if (newFinalRoutes.length > 0) routes.splice(0, routes.length, ...newFinalRoutes);
    }

    // --- REBALANCING --- (NEW)
    if (routes.length > 1) {
        setOptimizationProgress({ current: routes.length, total: routes.length, message: 'Ребалансировка...' });
        const routesForRebalance: RouteForRebalancing[] = routes.map(r => ({
            orders: r.routeChainFull, totalDistance: r.totalDistance, totalDuration: r.totalDuration, _originalRoute: r
        }));
        const rebalanceCtx: RebalanceContext = {
            getRouteDistance: async (o) => ((await apiManager.checkRoute(o, { priority: 'low' })).totalDistance || 0) / 1000,
            getRouteDuration: async (o) => (await apiManager.checkRoute(o, { priority: 'low' })).totalDuration || 0,
            trafficImpactLevel: optimizedSettings.trafficImpactLevel || 'medium',
            lateDeliveryPenalty: optimizedSettings.lateDeliveryPenalty || 50,
            trafficSnapshot: trafficSnapshot
        };
        const rebalanced = await rebalanceRoutesV3(routesForRebalance, runtimeMaxStopsPerRoute, rebalanceCtx);

        const newRebalancedRoutes = [];
        for (const rebR of rebalanced) {
            if (rebR.orders.length === 0) continue;
            const check = await apiManager.checkRoute(rebR.orders, { priority: 'low', includeStartEnd: true });
            if (check.feasible) {
                newRebalancedRoutes.push({
                    ...((rebR as any)._originalRoute || {}),
                    id: `route_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    routeChainFull: rebR.orders,
                    stopsCount: rebR.orders.length,
                    totalDuration: check.totalDuration,
                    totalDistance: check.totalDistance,
                    directionsLegs: check.legs,
                    reasons: [...(((rebR as any)._originalRoute?.reasons) || []), 'Ребалансировка']
                });
            }
        }
        if (newRebalancedRoutes.length > 0) routes.splice(0, routes.length, ...newRebalancedRoutes);
    }

    return routes;
}
