
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runRoutePlanningAlgorithm, RoutePlanningContext } from './routePlanAlgorithm';
import { GoogleAPIManager } from '../api/googleAPIManager';
import * as routeOptimizationHelpers from './routeOptimizationHelpers';

// Mock dependencies
vi.mock('../api/googleAPIManager');
vi.mock('./routeOptimizationHelpers', async () => {
    const actual = await vi.importActual('./routeOptimizationHelpers');
    return {
        ...actual,
        enhancedCandidateEvaluationV2: vi.fn(),
        findClustersHierarchical: vi.fn((orders) => orders.map(o => [o])), // mocked to return simple clusters
        prefilterCandidatesByDistance: vi.fn((candidates) => candidates),
        // specific mocks for helpers used in runRoutePlanningAlgorithm
        groupOrdersByReadyTimeWindows: vi.fn((orders) => [orders]),
        calculateOrderPriorityV2: vi.fn(() => 0),
    };
});

vi.mock('./optimization2Opt', () => ({
    optimizeRouteOrder2Opt: (route: any) => route,
}));

// Mock cache
vi.mock('./routeOptimizationCache', () => ({
    routeOptimizationCache: {
        getCoordinates: () => ({ lat: 0, lng: 0 }),
    }
}));


describe('Parallel Route Planning', () => {
    let mockApiManager: any;
    let context: RoutePlanningContext;

    beforeEach(() => {
        vi.clearAllMocks();

        mockApiManager = new GoogleAPIManager({} as any);
        // Default mock implementation
        mockApiManager.checkRouteWithTraffic = vi.fn().mockResolvedValue({ feasible: true });
        mockApiManager.checkRoute = vi.fn().mockResolvedValue({ feasible: true, totalDistance: 100, totalDuration: 100, legs: [] });

        context = {
            apiManager: mockApiManager,
            runtimeMaxStopsPerRoute: 5,
            runtimeMaxRouteDurationMin: 120,
            runtimeMaxRouteDistanceKm: 100,
            optimizedSettings: {
                maxDistanceBetweenOrdersKm: 10,
                maxReadyTimeDifferenceMinutes: 60,
                maxRoutes: 1
            },
            trafficSnapshot: null,
            depotCoords: { lat: 0, lng: 0 },
            defaultStartAddress: 'Depot',
            defaultEndAddress: 'Depot',
            setOptimizationProgress: vi.fn(),
        } as any;
    });

    it('should check candidates in parallel and pick the best feasible one when top candidate fails', async () => {
        const orders = [
            { id: '1', orderNumber: '1', address: 'A', coords: { lat: 1, lng: 1 } },
            { id: '2', orderNumber: '2', address: 'B', coords: { lat: 1, lng: 2 } }, // High score, infeasible
            { id: '3', orderNumber: '3', address: 'C', coords: { lat: 1, lng: 3 } }, // Lower score, feasible
        ] as any[];

        // Setup clustering to return all orders available
        vi.mocked(routeOptimizationHelpers.findClustersHierarchical).mockReturnValue([orders]);

        // Mock evaluations
        vi.mocked(routeOptimizationHelpers.enhancedCandidateEvaluationV2).mockImplementation((candidate: any) => {
            if (candidate.id === '2') return { score: 100, distance: 10 } as any;
            if (candidate.id === '3') return { score: 50, distance: 20 } as any;
            return { score: 10, distance: 30 } as any;
        });

        // Mock API feasibility
        // We want to force a check on order 2 (fail) and order 3 (pass)
        const mockCheck = async (chain: any[]) => {
            const last = chain[chain.length - 1];

            // Initial check for seed (order 1 or 2)
            if (chain.length === 1) return { feasible: true, totalDistance: 0 };

            if (last.id === '2') {
                return { feasible: false };
            }
            // If checking [1, 3, 2] -> fail
            if (chain.some(o => o.id === '2' && chain.length > 1)) {
                return { feasible: false };
            }

            if (last.id === '3') {
                return { feasible: true, totalDistance: 100, totalDuration: 100, legs: [] };
            }
            return { feasible: true };
        };

        mockApiManager.checkRouteWithTraffic.mockImplementation(mockCheck);
        mockApiManager.checkRoute.mockImplementation(mockCheck); // Consistency for rebalance


        const routes = await runRoutePlanningAlgorithm(orders, context);

        // Verification
        // 1. Seed should be selected (likely order 1 as it appears first and logic usually picks first available if priorities equal/default)
        // Actually priority sort might change order. 
        // Let's assume order 1 is seed.

        // 2. Candidates 2 and 3 should be evaluated. 
        // 3. Evaluations: 2 (100), 3 (50).
        // 4. Parallel checks: check([1, 2]), check([1, 3]).
        // 5. Result: 2 fails, 3 succeeds.
        // 6. 3 matches. Route: [1, 3]

        expect(routes.length).toBeGreaterThan(0);
        const route = routes[0];

        // Check that route contains 1 and 3, but not 2
        const ids = route.routeChainFull.map((o: any) => o.id);
        expect(ids).toContain('1');
        expect(ids).toContain('3');
        expect(ids).not.toContain('2');

        // Ensure that we actually tried to check order 2
        // We can check calls to checkRouteWithTraffic
        const calls = mockApiManager.checkRouteWithTraffic.mock.calls;

        // Filter calls that ended with 2
        const check2 = calls.some((args: any) => {
            const chain = args[0];
            return chain[chain.length - 1].id === '2';
        });
        expect(check2).toBe(true);

        // Filter calls that ended with 3
        const check3 = calls.some((args: any) => {
            const chain = args[0];
            return chain[chain.length - 1].id === '3';
        });
        expect(check3).toBe(true);
    });
});
