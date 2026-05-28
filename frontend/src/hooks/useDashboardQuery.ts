import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_URL } from '../config/apiConfig';
import { dashboardApi } from '../services/dashboardApi';
import { DashboardApiParams } from '../types/DashboardApiTypes';
import { ProcessedExcelData } from '../types';

/**
 * Query keys для React Query
 */
export const dashboardQueryKeys = {
    all: ['dashboard'] as const,
    orders: (params: DashboardApiParams) => ['dashboard', 'orders', params] as const,
    health: () => ['dashboard', 'health'] as const,
};

/**
 * Hook для загрузки заказов из Dashboard API с кешированием
 */
export const useDashboardOrders = (params: DashboardApiParams, enabled: boolean = true) => {
    return useQuery(
        dashboardQueryKeys.orders(params),
        async () => {
            const result = await dashboardApi.fetchOrdersFromDashboard(params);
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch orders');
            }
            return result.data!;
        },
        {
            enabled,
            // Данные считаются свежими 5 минут
            staleTime: 5 * 60 * 1000,
            // Кеш хранится 10 минут (cacheTime в v4)
            cacheTime: 10 * 60 * 1000,
        }
    );
};

/**
 * Hook для проверки здоровья Dashboard API
 */
export const useDashboardHealth = () => {
    return useQuery(
        dashboardQueryKeys.health(),
        async () => {
            const response = await fetch(`${API_URL}/api/v1/health`);
            if (!response.ok) {
                throw new Error('Dashboard API unavailable');
            }
            return response.json();
        },
        {
            // Проверять каждые 30 секунд
            refetchInterval: 30 * 1000,
            // Не показывать ошибки в консоли
            retry: false,
        }
    );
};

/**
 * Mutation для загрузки заказов с автоматической инвалидацией кеша
 */
export const useDashboardOrdersMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (params: DashboardApiParams) => {
            const result = await dashboardApi.fetchOrdersFromDashboard(params);
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch orders');
            }
            return result.data!;
        },
        onSuccess: (data, variables) => {
            // Обновляем кеш для этих параметров
            queryClient.setQueryData(dashboardQueryKeys.orders(variables), data);

            // Инвалидируем все запросы заказов (опционально)
            // queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.all });
        },
    });
};

/**
 * Hook для предзагрузки данных (prefetch)
 */
export const usePrefetchDashboardOrders = () => {
    const queryClient = useQueryClient();

    return async (params: DashboardApiParams) => {
        await queryClient.prefetchQuery({
            queryKey: dashboardQueryKeys.orders(params),
            queryFn: async () => {
                const result = await dashboardApi.fetchOrdersFromDashboard(params);
                if (!result.success) {
                    throw new Error(result.error || 'Failed to fetch orders');
                }
                return result.data!;
            },
            staleTime: 5 * 60 * 1000,
        });
    };
};

/**
 * Hook для получения кешированных данных без запроса
 */
export const useDashboardOrdersCache = (params: DashboardApiParams): ProcessedExcelData | undefined => {
    const queryClient = useQueryClient();
    return queryClient.getQueryData(dashboardQueryKeys.orders(params));
};

/**
 * Hook для очистки кеша Dashboard API данных
 */
export const useClearDashboardCache = () => {
    const queryClient = useQueryClient();

    return () => {
        queryClient.removeQueries({ queryKey: dashboardQueryKeys.all });
    };
};
