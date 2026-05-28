import { useEffect, useCallback, useRef } from 'react';
import type { Order, Courier, Route } from '../types';
import { useRouteCalculationStore } from '../stores/useRouteCalculationStore';
import {
    groupOrdersByCourier,
    createCourierStatus,
    shouldTriggerCalculation,
} from '../utils/route/routeCalculationHelpers';
import { logger } from '../utils/ui/logger';

interface UseAutoRouteCalculationProps {
    couriers: Courier[];
    orders: Order[];
    routes: Route[];
    onCalculateRoute: (courierId: string, orders: Order[]) => Promise<void>;
    enabled?: boolean;
}

/**
 * Хук для автоматического расчета маршрутов при добавлении заказов
 */
export function useAutoRouteCalculation({
    couriers,
    orders,
    routes,
    onCalculateRoute,
    enabled = true,
}: UseAutoRouteCalculationProps) {
    const {
        calculationMode,
        courierStatuses,
        isCalculating,
        updateCourierStatus,
        getCourierStatus,
        setCalculating,
        shouldAutoCalculate,
    } = useRouteCalculationStore();

    // Храним предыдущее состояние для отслеживания изменений
    const previousOrdersRef = useRef<Map<string, number>>(new Map());
    const calculationQueueRef = useRef<Set<string>>(new Set());

    /**
     * Обновляет статусы всех курьеров
     */
    const updateAllCourierStatuses = useCallback(() => {
        if (!enabled || !couriers || !orders) return;

        const groupedOrders = groupOrdersByCourier(orders);

        couriers.forEach((courier) => {
            const courierId = courier._id;
            if (!courierId) return;

            const courierOrders = groupedOrders.get(courierId) || [];
            const previousStatus = getCourierStatus(courierId);

            const newStatus = createCourierStatus(
                courierId,
                courier.name,
                courierOrders,
                routes,
                previousStatus
            );

            updateCourierStatus(newStatus);
        });
    }, [enabled, couriers, orders, routes, getCourierStatus, updateCourierStatus]);

    /**
     * Проверяет и запускает автоматический расчет для курьера
     */
    const checkAndTriggerCalculation = useCallback(
        async (courierId: string) => {
            if (!enabled || isCalculating || calculationQueueRef.current.has(courierId)) {
                return;
            }

            const status = getCourierStatus(courierId);
            if (!status) return;

            if (shouldTriggerCalculation(status, calculationMode)) {
                try {
                    calculationQueueRef.current.add(courierId);
                    setCalculating(true, courierId);

                    logger.info(
                        `[AutoRouteCalculation] Запуск автоматического расчета для курьера ${status.courierName} (${status.ordersCount} заказов)`
                    );

                    const groupedOrders = groupOrdersByCourier(orders);
                    const courierOrders = groupedOrders.get(courierId) || [];

                    await onCalculateRoute(courierId, courierOrders);

                    // Обновляем статус после успешного расчета
                    updateCourierStatus({
                        ...status,
                        needsRecalculation: false,
                        lastCalculated: Date.now(),
                    });

                    logger.info(
                        `[AutoRouteCalculation] Маршрут успешно рассчитан для ${status.courierName}`
                    );
                } catch (error) {
                    logger.error(
                        `[AutoRouteCalculation] Ошибка при расчете маршрута для ${status.courierName}:`,
                        error
                    );
                } finally {
                    calculationQueueRef.current.delete(courierId);
                    setCalculating(false);
                }
            }
        },
        [
            enabled,
            isCalculating,
            calculationMode,
            orders,
            getCourierStatus,
            setCalculating,
            updateCourierStatus,
            onCalculateRoute,
        ]
    );

    /**
     * Отслеживает изменения в заказах и запускает расчет при необходимости
     */
    useEffect(() => {
        if (!enabled || calculationMode.mode !== 'automatic') return;

        updateAllCourierStatuses();

        // Проверяем изменения количества заказов для каждого курьера
        const groupedOrders = groupOrdersByCourier(orders);
        const currentOrderCounts = new Map<string, number>();

        groupedOrders.forEach((courierOrders, courierId) => {
            currentOrderCounts.set(courierId, courierOrders.length);
        });

        // Находим курьеров с изменившимся количеством заказов
        const changedCouriers: string[] = [];

        currentOrderCounts.forEach((count, courierId) => {
            const previousCount = previousOrdersRef.current.get(courierId) || 0;
            if (count !== previousCount) {
                changedCouriers.push(courierId);
            }
        });

        // Обновляем референс
        previousOrdersRef.current = currentOrderCounts;

        // Запускаем расчет для курьеров с изменениями
        if (changedCouriers.length > 0 && !isCalculating) {
            // Запускаем расчет для первого курьера в очереди
            const courierId = changedCouriers[0];
            if (shouldAutoCalculate(courierId)) {
                checkAndTriggerCalculation(courierId);
            }
        }
    }, [
        enabled,
        orders,
        calculationMode.mode,
        isCalculating,
        updateAllCourierStatuses,
        checkAndTriggerCalculation,
        shouldAutoCalculate,
    ]);

    /**
     * Обновляем статусы при изменении маршрутов
     */
    useEffect(() => {
        if (!enabled) return;
        updateAllCourierStatuses();
    }, [enabled, routes, updateAllCourierStatuses]);

    return {
        courierStatuses,
        isCalculating,
        calculationMode,
        updateAllCourierStatuses,
        checkAndTriggerCalculation,
    };
}
