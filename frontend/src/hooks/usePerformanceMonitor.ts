import { useEffect, useCallback, useRef } from 'react';

interface PerformanceMetrics {
    name: string;
    duration: number;
    timestamp: number;
    metadata?: Record<string, any>;
}

/**
 * Hook для мониторинга производительности операций
 */
export const usePerformanceMonitor = () => {
    const metricsRef = useRef<PerformanceMetrics[]>([]);

    /**
     * Начать измерение производительности
     */
    const startMeasure = useCallback((name: string) => {
        performance.mark(`${name}-start`);
        return name;
    }, []);

    /**
     * Завершить измерение и сохранить метрику
     */
    const endMeasure = useCallback((name: string, metadata?: Record<string, any>) => {
        performance.mark(`${name}-end`);
        try {
            performance.measure(name, `${name}-start`, `${name}-end`);
            const measure = performance.getEntriesByName(name)[0] as PerformanceEntry;

            const metric: PerformanceMetrics = {
                name,
                duration: measure.duration,
                timestamp: Date.now(),
                metadata,
            };

            metricsRef.current.push(metric);

            // Логирование в консоль (только в dev режиме)
            if (import.meta.env.DEV) {
            }

            // Очистка меток
            performance.clearMarks(`${name}-start`);
            performance.clearMarks(`${name}-end`);
            performance.clearMeasures(name);

            return metric;
        } catch (error) {
            console.warn(`Failed to measure performance for ${name}:`, error);
            return null;
        }
    }, []);

    /**
     * Измерить асинхронную операцию
     */
    const measureAsync = useCallback(async <T,>(
        name: string,
        fn: () => Promise<T>,
        metadata?: Record<string, any>
    ): Promise<T> => {
        startMeasure(name);
        try {
            const result = await fn();
            endMeasure(name, { ...metadata, success: true });
            return result;
        } catch (error) {
            endMeasure(name, { ...metadata, success: false, error: String(error) });
            throw error;
        }
    }, [startMeasure, endMeasure]);

    /**
     * Получить все собранные метрики
     */
    const getMetrics = useCallback(() => {
        return [...metricsRef.current];
    }, []);

    /**
     * Получить статистику по метрикам
     */
    const getStats = useCallback((metricName?: string) => {
        const metrics = metricName
            ? metricsRef.current.filter(m => m.name === metricName)
            : metricsRef.current;

        if (metrics.length === 0) {
            return null;
        }

        const durations = metrics.map(m => m.duration);
        const sum = durations.reduce((a, b) => a + b, 0);
        const avg = sum / durations.length;
        const min = Math.min(...durations);
        const max = Math.max(...durations);

        return {
            count: metrics.length,
            avg,
            min,
            max,
            total: sum,
        };
    }, []);

    /**
     * Очистить все метрики
     */
    const clearMetrics = useCallback(() => {
        metricsRef.current = [];
    }, []);

    /**
     * Экспортировать метрики в JSON
     */
    const exportMetrics = useCallback(() => {
        return JSON.stringify(metricsRef.current, null, 2);
    }, []);

    return {
        startMeasure,
        endMeasure,
        measureAsync,
        getMetrics,
        getStats,
        clearMetrics,
        exportMetrics,
    };
};

/**
 * Hook для автоматического логирования времени рендера компонента
 */
export const useRenderPerformance = (componentName: string) => {
    const renderCount = useRef(0);
    const lastRenderTime = useRef(Date.now());

    useEffect(() => {
        renderCount.current += 1;
        const now = Date.now();
        const timeSinceLastRender = now - lastRenderTime.current;
        lastRenderTime.current = now;

        if (import.meta.env.DEV && renderCount.current > 1) {
            console.log(
                `[Render] ${componentName} (${renderCount.current}): ${timeSinceLastRender}ms since last render`
            );
        }
    });

    return renderCount.current;
};

/**
 * Глобальный performance reporter
 */
export class PerformanceReporter {
    private static metrics: PerformanceMetrics[] = [];

    static record(metric: PerformanceMetrics) {
        this.metrics.push(metric);

        // Отправка в аналитику (опционально)
        if (import.meta.env.PROD) {
            // TODO: Отправка в сервис аналитики
            // analytics.track('performance', metric);
        }
    }

    static getReport() {
        const grouped = this.metrics.reduce((acc, metric) => {
            if (!acc[metric.name]) {
                acc[metric.name] = [];
            }
            acc[metric.name].push(metric.duration);
            return acc;
        }, {} as Record<string, number[]>);

        return Object.entries(grouped).map(([name, durations]) => ({
            name,
            count: durations.length,
            avg: durations.reduce((a, b) => a + b, 0) / durations.length,
            min: Math.min(...durations),
            max: Math.max(...durations),
        }));
    }

    static clear() {
        this.metrics = [];
    }
}
