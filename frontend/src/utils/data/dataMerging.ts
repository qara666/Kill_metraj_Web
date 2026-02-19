import { ProcessedExcelData } from '../../types';
import { normalizeCourierName } from './courierName';

/**
 * Объединяет новые данные Excel/Dashboard API с существующими, избегая дубликатов.
 * @param newData Новые данные для объединения
 * @param existingData Существующие данные
 * @returns Объединенные данные
 */
export const mergeExcelData = (newData: any, existingData: any): ProcessedExcelData => {
    if (!existingData || !newData) {
        return (newData || existingData || { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [] }) as ProcessedExcelData;
    }

    const existingOrders = Array.isArray(existingData.orders) ? existingData.orders : [];
    const newOrders = Array.isArray(newData.orders) ? newData.orders : [];

    // Создаем Map новых заказов для быстрого поиска
    const newOrdersMap = new Map();
    newOrders.forEach((order: any) => {
        // Генерация ID если нет
        if (!order.id) {
            order.id = `order_${order.orderNumber || Math.random()}`;
        }
        if (order.orderNumber) {
            newOrdersMap.set(order.orderNumber, order);
        }
    });

    // 1. Обновляем существующие заказы (Merge Strategy)
    const mergedOrders = existingOrders.map((existingOrder: any) => {
        const newOrder = newOrdersMap.get(existingOrder.orderNumber);

        if (newOrder) {
            // Если заказ есть в новых данных, обновляем его поля (статус, курьер и т.д.)
            const mergedOrder = {
                ...existingOrder, // Берем существующие поля (включая UI state)
                ...newOrder,      // Перезаписываем новыми данными с сервера

                // ЯВНО ВОССТАНАВЛИВАЕМ Важные локальные состояния:
                id: existingOrder.id,                  // ID не должен меняться
                isSelected: existingOrder.isSelected,  // Сохраняем выделение
                isInRoute: existingOrder.isInRoute,    // Сохраняем принадлежность маршруту
                handoverAt: existingOrder.handoverAt,  // Сохраняем уже записанное время
                manualGroupId: existingOrder.manualGroupId, // Сохраняем ручную группу
                deadlineAt: existingOrder.deadlineAt,       // Сохраняем дедлайн
                plannedTime: existingOrder.plannedTime,     // Сохраняем плановое время

                // Финансовые состояния (Phase 5)
                settledDate: existingOrder.settledDate,
                settledAmount: existingOrder.settledAmount,
                settlementNote: existingOrder.settlementNote,

                // Геокоординаты сохраняем, если адрес не изменился (чтобы не мигало/не пересчитывало)
                coords: (existingOrder.address === newOrder.address && existingOrder.coords)
                    ? existingOrder.coords
                    : newOrder.coords,
            };

            // Phase 4.4: Отслеживаем переход в статус "Доставляется"
            if (newOrder.status === 'Доставляется' && (!mergedOrder.handoverAt || (existingOrder.status !== 'Доставляется'))) {
                mergedOrder.handoverAt = mergedOrder.handoverAt || Date.now();
            }

            return mergedOrder;
        }
        return existingOrder; // Если заказа нет в новом ответе, сохраняем старый
    });

    let addedOrders = 0;

    // 2. Добавляем новые заказы
    newOrders.forEach((newOrder: any) => {
        const isDuplicate = existingOrders.some((existingOrder: any) =>
            existingOrder.orderNumber === newOrder.orderNumber
        );

        if (!isDuplicate) {
            // Phase 4.4: Если новый заказ уже в статусе Доставляется
            if (newOrder.status === 'Доставляется' && !newOrder.handoverAt) {
                newOrder.handoverAt = Date.now();
            }
            mergedOrders.push(newOrder);
            addedOrders++;
        }
    });

    const existingCouriers = Array.isArray(existingData.couriers) ? existingData.couriers : [];
    const newCouriers = Array.isArray(newData.couriers) ? newData.couriers : [];

    const newCouriersMap = new Map();
    newCouriers.forEach((c: any) => {
        const key = normalizeCourierName(c.name).toLowerCase();
        if (key) newCouriersMap.set(key, c);
    });

    // 1. Обновляем и сохраняем существующие
    const mergedCouriers = existingCouriers.map((existingCourier: any) => {
        const key = normalizeCourierName(existingCourier.name).toLowerCase();
        const newCourier = key ? newCouriersMap.get(key) : null;
        if (newCourier) {
            // Merge updates
            return {
                ...existingCourier,
                ...newCourier,
                // Preserve sensitive local state if any exists (currently couriers are simple objects)
            };
        }
        return existingCourier;
    });

    let addedCouriers = 0;

    // 2. Добавляем новые
    newCouriers.forEach((newCourier: any) => {
        const normalizedNewName = normalizeCourierName(newCourier.name);
        const isDuplicate = existingCouriers.some((existingCourier: any) =>
            normalizeCourierName(existingCourier.name).toLowerCase() === normalizedNewName.toLowerCase()
        );

        if (!isDuplicate && normalizedNewName) {
            mergedCouriers.push({
                ...newCourier,
                name: normalizedNewName
            });
            addedCouriers++;
        }
    });

    const existingPaymentMethods = Array.isArray(existingData.paymentMethods) ? existingData.paymentMethods : [];
    const newPaymentMethods = Array.isArray(newData.paymentMethods) ? newData.paymentMethods : [];
    const mergedPaymentMethods = [...existingPaymentMethods];

    let addedPaymentMethods = 0;
    let duplicatePaymentMethods = 0;

    newPaymentMethods.forEach((newPaymentMethod: any) => {
        const isDuplicate = existingPaymentMethods.some((existingPaymentMethod: any) =>
            existingPaymentMethod.name === newPaymentMethod.name
        );

        if (!isDuplicate) {
            mergedPaymentMethods.push(newPaymentMethod);
            addedPaymentMethods++;
        } else {
            duplicatePaymentMethods++;
        }
    });

    const existingRoutes = Array.isArray(existingData.routes) ? existingData.routes : [];
    const newRoutes = Array.isArray(newData.routes) ? newData.routes : [];
    const mergedRoutes = [...existingRoutes];

    let addedRoutes = 0;
    let duplicateRoutes = 0;

    newRoutes.forEach((newRoute: any) => {
        const isDuplicate = existingRoutes.some((existingRoute: any) =>
            existingRoute.id === newRoute.id
        );

        if (!isDuplicate) {
            mergedRoutes.push(newRoute);
            addedRoutes++;
        } else {
            duplicateRoutes++;
        }
    });

    const existingErrors = Array.isArray(existingData.errors) ? existingData.errors : [];
    const newErrors = Array.isArray(newData.errors) ? newData.errors : [];

    const existingErrorsAsStrings = existingErrors.map((error: any) =>
        typeof error === 'string' ? error : `Строка ${error.row || 'N/A'}: ${error.message || 'Неизвестная ошибка'}`
    );

    const newErrorsAsStrings = newErrors.map((error: any) =>
        typeof error === 'string' ? error : `Строка ${error.row || 'N/A'}: ${error.message || 'Неизвестная ошибка'}`
    );

    const mergedErrors = [...existingErrorsAsStrings, ...newErrorsAsStrings];

    // Logging for debugging (optional, can be removed or replaced with logger)
    console.log(`Merge Stats: +${addedOrders} orders, +${addedCouriers} couriers`);

    return {
        orders: mergedOrders,
        couriers: mergedCouriers,
        paymentMethods: mergedPaymentMethods,
        routes: mergedRoutes,
        errors: mergedErrors,
        summary: {
            totalRows: mergedOrders.length + mergedCouriers.length + mergedPaymentMethods.length + mergedRoutes.length,
            successfulGeocoding: 0,
            failedGeocoding: 0,
            orders: mergedOrders.length,
            couriers: mergedCouriers.length,
            paymentMethods: mergedPaymentMethods.length,
            errors: mergedErrors
        }
    };
};
/**
 * Синхронизирует данные из Dashboard API (Заменяет старые заказы новыми, сохраняя локальное состояние)
 */
export const syncDashboardData = (newData: any, existingData: any): ProcessedExcelData => {
    if (!newData) return existingData;
    if (!existingData) return newData;

    const newOrders = Array.isArray(newData.orders) ? newData.orders : [];


    // В отличие от mergeExcelData, здесь мы ПРИНИМАЕМ новый список заказов как основу
    // Мы не добавляем к старому списку, а ЗАМЕНЯЕМ его.

    // Но мы должны восстановить UI состояние для тех заказов, которые остались в списке
    const existingOrdersMap = new Map();
    (existingData.orders || []).forEach((o: any) => existingOrdersMap.set(o.orderNumber, o));

    const syncedOrders = newOrders.map((newOrder: any) => {
        const existing = existingOrdersMap.get(newOrder.orderNumber);
        if (existing) {
            const isNowCompleted = (newOrder.status === 'Исполнен' || newOrder.status === 'Доставлено');
            const wasCompleted = (existing.status === 'Исполнен' || existing.status === 'Доставлено');

            const statusTimings = {
                ...(existing.statusTimings || {}),
                ...(newOrder.statusTimings || {})
            };

            if (isNowCompleted && !wasCompleted && !statusTimings.completedAt) {
                statusTimings.completedAt = Date.now();
            }

            return {
                ...existing,
                ...newOrder,
                id: existing.id,
                isSelected: existing.isSelected,
                isInRoute: existing.isInRoute,
                manualGroupId: existing.manualGroupId,
                deadlineAt: existing.deadlineAt,
                plannedTime: existing.plannedTime,
                statusTimings,
                // Финансовые состояния
                settledDate: existing.settledDate,
                settledAmount: existing.settledAmount,
                settlementNote: existing.settlementNote,
                // Сохраняем координаты чтобы не мигало
                coords: (existing.address === newOrder.address && existing.coords) ? existing.coords : newOrder.coords
            };
        }
        return newOrder;
    });

    console.log(`[syncDashboardData] Synced: ${syncedOrders.length} orders (Replaced previous ${existingData.orders?.length || 0})`);

    // Дедупликация курьеров при синхронизации
    const uniqueCouriersMap = new Map();
    (newData.couriers || []).forEach((c: any) => {
        const name = normalizeCourierName(c.name);
        const key = name.toLowerCase();
        if (name && !uniqueCouriersMap.has(key)) {
            uniqueCouriersMap.set(key, { ...c, name });
        }
    });

    // ОБНОВЛЯЕМ ЗАКАЗЫ ВНУТРИ МАРШРУТОВ
    // (Это критично для корректного расчета ETA возврата)
    const syncedOrdersMap = new Map();
    syncedOrders.forEach((o: any) => syncedOrdersMap.set(o.orderNumber, o));

    const existingRoutes = (existingData.routes || []).map((route: any) => {
        const updatedRouteOrders = (route.orders || []).map((ro: any) => {
            const synced = syncedOrdersMap.get(ro.orderNumber);
            return synced ? { ...ro, ...synced } : ro;
        });

        return {
            ...route,
            orders: updatedRouteOrders
        };
    });

    return {
        ...newData,
        orders: syncedOrders,
        routes: existingRoutes, // Обновленные маршруты
        couriers: Array.from(uniqueCouriersMap.values()),
    };
};
