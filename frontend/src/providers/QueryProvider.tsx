import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Создание QueryClient с настройками по умолчанию
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Кеширование на 5 минут
            staleTime: 5 * 60 * 1000,
            // Данные остаются в кеше 10 минут после последнего использования (cacheTime в v4)
            cacheTime: 10 * 60 * 1000,
            // Повторная попытка при ошибке
            retry: 2,
            // Не обновлять при фокусе окна (для Swagger API это избыточно)
            refetchOnWindowFocus: false,
            // Не обновлять при восстановлении соединения
            refetchOnReconnect: false,
        },
    },
});

interface QueryProviderProps {
    children: React.ReactNode;
}

/**
 * Провайдер React Query для всего приложения
 */
export const QueryProvider: React.FC<QueryProviderProps> = ({ children }) => {
    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
};
