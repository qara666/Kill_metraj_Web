import { ProcessedExcelData } from '../../types';

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
    const mergedOrders = [...existingOrders];

    let addedOrders = 0;
    let duplicateOrders = 0;

    newOrders.forEach((newOrder: any) => {
        // Генерация ID если нет
        if (!newOrder.id) {
            newOrder.id = `order_${newOrder.orderNumber || Math.random()}`;
        }

        let isDuplicate = false;
        if (newOrder.orderNumber) {
            // Поиск дубликатов по номеру заказа
            isDuplicate = existingOrders.some((existingOrder: any) =>
                existingOrder.orderNumber === newOrder.orderNumber
            );
        } else {
            // Эвристический поиск дубликатов
            isDuplicate = existingOrders.some((existingOrder: any) =>
                existingOrder.address === newOrder.address &&
                existingOrder.courierName === newOrder.courierName &&
                existingOrder.plannedTime === newOrder.plannedTime
            );
        }

        if (!isDuplicate) {
            mergedOrders.push(newOrder);
            addedOrders++;
        } else {
            duplicateOrders++;
        }
    });

    const existingCouriers = Array.isArray(existingData.couriers) ? existingData.couriers : [];
    const newCouriers = Array.isArray(newData.couriers) ? newData.couriers : [];
    const mergedCouriers = [...existingCouriers];

    let addedCouriers = 0;
    let duplicateCouriers = 0;

    newCouriers.forEach((newCourier: any) => {
        const isDuplicate = existingCouriers.some((existingCourier: any) =>
            existingCourier.name === newCourier.name
        );

        if (!isDuplicate) {
            mergedCouriers.push(newCourier);
            addedCouriers++;
        } else {
            duplicateCouriers++;
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
