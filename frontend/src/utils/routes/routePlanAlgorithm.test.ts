
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runRoutePlanningAlgorithm, RoutePlanningContext } from './routePlanAlgorithm';
import { GoogleAPIManager } from '../api/googleAPIManager';
import * as routeOptimizationHelpers from './routeOptimizationHelpers';

// Мок зависимостей
vi.mock('../api/googleAPIManager');
vi.mock('./routeOptimizationHelpers', async () => {
    const actual = await vi.importActual('./routeOptimizationHelpers');
    return {
        ...actual,
        enhancedCandidateEvaluationV2: vi.fn(),
        findClustersHierarchical: vi.fn((orders) => orders.map(o => [o])), // замокано для возврата простых кластеров
        prefilterCandidatesByDistance: vi.fn((candidates) => candidates),
        // специфичные моки для хелперов, используемых в runRoutePlanningAlgorithm
        groupOrdersByReadyTimeWindows: vi.fn((orders) => [orders]),
        calculateOrderPriorityV2: vi.fn(() => 0),
    };
});

vi.mock('./optimization2Opt', () => ({
    optimizeRouteOrder2Opt: (route: any) => route,
}));

// Мок кэша
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
        // Реализация мока по умолчанию
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
            { id: '2', orderNumber: '2', address: 'B', coords: { lat: 1, lng: 2 } }, // Высокий балл, невыполнимый
            { id: '3', orderNumber: '3', address: 'C', coords: { lat: 1, lng: 3 } }, // Низкий балл, выполнимый
        ] as any[];

        // Настройка кластеризации для возврата всех доступных заказов
        vi.mocked(routeOptimizationHelpers.findClustersHierarchical).mockReturnValue([orders]);

        // Мок оценок
        vi.mocked(routeOptimizationHelpers.enhancedCandidateEvaluationV2).mockImplementation((candidate: any) => {
            if (candidate.id === '2') return { score: 100, distance: 10 } as any;
            if (candidate.id === '3') return { score: 50, distance: 20 } as any;
            return { score: 10, distance: 30 } as any;
        });

        // Мок проверки API
        // Принудительно проверяем заказ 2 (провал) и заказ 3 (успех)
        const mockCheck = async (chain: any[]) => {
            const last = chain[chain.length - 1];

            // Первичная проверка для начального заказа (1 или 2)
            if (chain.length === 1) return { feasible: true, totalDistance: 0 };

            if (last.id === '2') {
                return { feasible: false };
            }
            // Если проверка [1, 3, 2] -> провал
            if (chain.some(o => o.id === '2' && chain.length > 1)) {
                return { feasible: false };
            }

            if (last.id === '3') {
                return { feasible: true, totalDistance: 100, totalDuration: 100, legs: [] };
            }
            return { feasible: true };
        };

        mockApiManager.checkRouteWithTraffic.mockImplementation(mockCheck);
        mockApiManager.checkRoute.mockImplementation(mockCheck); // Согласованность для ребалансировки


        const routes = await runRoutePlanningAlgorithm(orders, context);

        // Верификация
        // 1. Должен быть выбран начальный заказ (скорее всего 1, так как он идет первым)
        // На самом деле сортировка по приоритету может изменить порядок. 
        // Предположим, что заказ 1 — начальный.

        // 2. Кандидаты 2 и 3 должны быть оценены. 
        // 3. Оценки: 2 (100), 3 (50).
        // 4. Параллельные проверки: check([1, 2]), check([1, 3]).
        // 5. Результат: 2 провален, 3 успешен.
        // 6. 3 подходит. Маршрут: [1, 3]

        expect(routes.length).toBeGreaterThan(0);
        const route = routes[0];

        // Проверка, что маршрут содержит 1 и 3, но не 2
        const ids = route.routeChainFull.map((o: any) => o.id);
        expect(ids).toContain('1');
        expect(ids).toContain('3');
        expect(ids).not.toContain('2');

        // Убеждаемся, что мы действительно пытались проверить заказ 2
        // Можем проверить вызовы checkRouteWithTraffic
        const calls = mockApiManager.checkRouteWithTraffic.mock.calls;

        // Фильтруем вызовы, которые заканчивались на 2
        const check2 = calls.some((args: any) => {
            const chain = args[0];
            return chain[chain.length - 1].id === '2';
        });
        expect(check2).toBe(true);

        // Фильтруем вызовы, которые заканчивались на 3
        const check3 = calls.some((args: any) => {
            const chain = args[0];
            return chain[chain.length - 1].id === '3';
        });
        expect(check3).toBe(true);
    });
});
