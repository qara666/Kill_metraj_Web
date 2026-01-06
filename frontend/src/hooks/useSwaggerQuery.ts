import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fastopertorApi } from '../services/fastopertorApi';
import { SwaggerApiParams } from '../types/SwaggerApiTypes';
import { ProcessedExcelData } from '../types';

/**
 * Query keys для React Query
 */
export const swaggerQueryKeys = {
    all: ['swagger'] as const,
    orders: (params: SwaggerApiParams) => ['swagger', 'orders', params] as const,
    health: () => ['swagger', 'health'] as const,
};

/**
 * Hook для загрузки заказов из Swagger API с кешированием
 */
export const useSwaggerOrders = (params: SwaggerApiParams, enabled: boolean = true) => {
    return useQuery(
        swaggerQueryKeys.orders(params),
        async () => {
            const result = await fastopertorApi.fetchOrdersFromSwagger(params);
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
 * Hook для проверки здоровья Swagger API
 */
export const useSwaggerHealth = () => {
    return useQuery(
        swaggerQueryKeys.health(),
        async () => {
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/swagger/health`);
            if (!response.ok) {
                throw new Error('Swagger API unavailable');
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
export const useSwaggerOrdersMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (params: SwaggerApiParams) => {
            const result = await fastopertorApi.fetchOrdersFromSwagger(params);
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch orders');
            }
            return result.data!;
        },
        onSuccess: (data, variables) => {
            // Обновляем кеш для этих параметров
            queryClient.setQueryData(swaggerQueryKeys.orders(variables), data);

            // Инвалидируем все запросы заказов (опционально)
            // queryClient.invalidateQueries({ queryKey: swaggerQueryKeys.all });
        },
    });
};

/**
 * Hook для предзагрузки данных (prefetch)
 */
export const usePrefetchSwaggerOrders = () => {
    const queryClient = useQueryClient();

    return async (params: SwaggerApiParams) => {
        await queryClient.prefetchQuery({
            queryKey: swaggerQueryKeys.orders(params),
            queryFn: async () => {
                const result = await fastopertorApi.fetchOrdersFromSwagger(params);
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
export const useSwaggerOrdersCache = (params: SwaggerApiParams): ProcessedExcelData | undefined => {
    const queryClient = useQueryClient();
    return queryClient.getQueryData(swaggerQueryKeys.orders(params));
};

/**
 * Hook для очистки кеша Swagger данных
 */
export const useClearSwaggerCache = () => {
    const queryClient = useQueryClient();

    return () => {
        queryClient.removeQueries({ queryKey: swaggerQueryKeys.all });
    };
};
