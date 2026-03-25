import type { Order, CourierRouteStatus, RouteCalculationMode } from '../../types';
import { isOrderCompleted } from '../data/orderStatus';
import { getPlannedTime, getArrivalTime, getKitchenTime } from '../data/timeUtils';
import { haversineDistance } from '../routes/routeOptimizationHelpers';
import { normalizeCourierName } from '../data/courierName';

// ============================================
// ТИПЫ ДЛЯ ГРУППИРОВКИ ПО ВРЕМЕННЫМ ОКНАМ
// ============================================

export interface TimeWindowGroup {
    id: string;                 // Уникальный ID группы
    courierId: string;
    courierName: string;
    windowStart: number;        // timestamp начала окна (по доставке)
    windowEnd: number;          // timestamp конца окна (по доставке)
    windowLabel: string;        // Читаемый формат "12:00-12:15"
    orders: Order[];
    isReadyForCalculation: boolean;
    arrivalStart?: number;      // Когда "прилетел" первый заказ
    arrivalEnd?: number;        // Когда "прилетел" последний заказ
    splitReason?: string;       // Причина разделения (Phase 4.1)
    predictedDepartureAt?: number; // Прогноз выезда (Phase 4.2)
    manualGroupId?: string;     // ID ручной группы (Phase 4.7)
}

// ============================================
// ФУНКЦИИ ГРУППИРОВКИ ПО ВРЕМЕННЫМ ОКНАМ
// ============================================

const DEFAULT_WINDOW_MINUTES = 15;

/**
 * Получает ключ временного окна для timestamp
 * Округляет вниз до ближайшего окна (например, 12:07 -> 12:00 для 15-минутного окна)
 */
export function getTimeWindowKey(timestamp: number, windowMinutes: number = DEFAULT_WINDOW_MINUTES): string {
    const date = new Date(timestamp);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const windowStart = Math.floor(minutes / windowMinutes) * windowMinutes;
    return `${hours.toString().padStart(2, '0')}:${windowStart.toString().padStart(2, '0')}`;
}

/**
 * Получает границы временного окна для timestamp
 */
export function getTimeWindowBounds(
    timestamp: number,
    windowMinutes: number = DEFAULT_WINDOW_MINUTES
): { start: number; end: number; label: string } {
    const date = new Date(timestamp);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const windowStartMinutes = Math.floor(minutes / windowMinutes) * windowMinutes;
    const windowEndMinutes = windowStartMinutes + windowMinutes;

    const startDate = new Date(date);
    startDate.setMinutes(windowStartMinutes, 0, 0);

    const endDate = new Date(date);
    endDate.setMinutes(windowEndMinutes, 0, 0);

    const startLabel = `${hours.toString().padStart(2, '0')}:${windowStartMinutes.toString().padStart(2, '0')}`;
    const endHours = windowEndMinutes >= 60 ? hours + 1 : hours;
    const endMins = windowEndMinutes >= 60 ? windowEndMinutes - 60 : windowEndMinutes;
    const endLabel = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;

    return {
        start: startDate.getTime(),
        end: endDate.getTime(),
        label: `${startLabel}-${endLabel}`
    };
}

// Константы для группировки
const PROXIMITY_MINUTES = 15;            // v5.106: Set to 15m as per user requirement
const MAX_DELIVERY_SPAN_MINUTES = 60;   // Максимальный разброс доставки в одной группе

/**
 * Форматирует диапазон времени в читаемый формат
 */
function formatTimeRange(startTime: number, endTime: number): string {
    if (!startTime || !endTime) return 'Без времени';
    const start = new Date(startTime);
    const end = new Date(endTime);
    const startLabel = `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}`;
    const endLabel = `${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;
    return startLabel === endLabel ? startLabel : `${startLabel}-${endLabel}`;
}

/**
 * Создает новую группу для заказа
 */
function createNewGroup(
    courierId: string,
    courierName: string,
    order: Order,
    planned: number,
    arrival: number,
    _index: number,
    splitReason?: string
): TimeWindowGroup {
    const group: TimeWindowGroup = {
        id: `group-${courierId}-${order.id}-${planned}`,
        courierId,
        courierName,
        windowStart: planned,
        windowEnd: planned,
        windowLabel: formatTimeRange(planned, planned),
        orders: [order],
        isReadyForCalculation: true,
        arrivalStart: arrival,
        arrivalEnd: arrival,
        splitReason
    };

    // Initial departure prediction
    const kitchen = getKitchenTime(order);
    if (kitchen) {
        group.predictedDepartureAt = kitchen + 5 * 60 * 1000;
    }

    return group;
}



/**
 * Создает группу для ручного объединения (Phase 4.7)
 */
function createManualGroup(
    courierId: string,
    courierName: string,
    orders: Order[],
    manualGroupId: string
): TimeWindowGroup {
    const plannedTimes = orders.map(o => getPlannedTime(o)).filter((t): t is number => !!t);
    const arrivalTimes = orders.map(o => getArrivalTime(o)).filter((t): t is number => !!t);

    const minPlanned = plannedTimes.length > 0 ? Math.min(...plannedTimes) : 0;
    const maxPlanned = plannedTimes.length > 0 ? Math.max(...plannedTimes) : 0;

    const group: TimeWindowGroup = {
        id: `manual-${manualGroupId}`,
        courierId,
        courierName,
        windowStart: minPlanned,
        windowEnd: maxPlanned,
        windowLabel: plannedTimes.length > 0 ? formatTimeRange(minPlanned, maxPlanned) : 'Ручная группа',
        orders,
        isReadyForCalculation: true,
        arrivalStart: arrivalTimes.length > 0 ? Math.min(...arrivalTimes) : undefined,
        arrivalEnd: arrivalTimes.length > 0 ? Math.max(...arrivalTimes) : undefined,
        manualGroupId
    };

    updatePredictedDeparture(group);
    return group;
}

/**
 * Расчет времени выезда для группы (Phase 4.2)
 * Основан на самом позднем времени готовности заказа + 5 мин на упаковку.
 * Учитываем статус "Собран" — такие заказы уже готовы.
 */
export function updatePredictedDeparture(group: TimeWindowGroup): void {
    const kitchenTimes = group.orders
        .filter(o => o.status !== 'Собран') // Если собран, он уже готов
        .map(o => getKitchenTime(o))
        .filter((t): t is number => !!t);

    if (kitchenTimes.length > 0) {
        const maxKitchen = Math.max(...kitchenTimes);
        group.predictedDepartureAt = maxKitchen + 5 * 60 * 1000;
    } else {
        // Если все заказы "Собран" или нет времени кухни - считаем что можно выезжать прямо сейчас
        group.predictedDepartureAt = Date.now();
    }
}

/**
 * Группирует заказы курьера по гибридной логике:
 * 1. Основной фактор: близость времени поступления (arrival/creation time)
 * 2. Дополнительный фильтр: близость планового времени доставки
 */
export function groupOrdersByTimeWindow(
    orders: Order[],
    courierId: string,
    courierName: string,
    arrivalProximityMinutes: number = PROXIMITY_MINUTES,
    maxDeliverySpanMinutes: number = MAX_DELIVERY_SPAN_MINUTES
): TimeWindowGroup[] {
    if (!orders || orders.length === 0) return [];

    const noTimeOrders: Order[] = [];
    const ordersWithData: Array<{ order: Order; planned: number; arrival: number; kitchen?: number }> = [];

    // Разделяем заказы
    orders.forEach(order => {
        // Пробуем получить плановое время из разных источников
        let plannedTime = getPlannedTime(order);

        // Время готовности на кухне - важный фактор для FO
        const kitchenTime = getKitchenTime(order);

        // Пробуем получить время поступления (создания)
        let arrivalTime = getArrivalTime(order);

        // ВАЖНО: Если время поступления отсутствует, используем плановое время или время кухни как прокси
        if (!arrivalTime) {
            arrivalTime = plannedTime || kitchenTime;
        }

        if (!plannedTime) {
            // Если дедлайна нет, пробуем использовать время кухни + 60 мин как дедлайн
            if (kitchenTime) {
                plannedTime = kitchenTime + 60 * 60 * 1000;
            } else {
                noTimeOrders.push(order);
                return;
            }
        }

        const plannedTs = plannedTime;
        const arrivalTs = arrivalTime || plannedTime;

        if (plannedTs === null || isNaN(plannedTs)) {
            noTimeOrders.push(order);
            return;
        }

        const finalPlannedTs: number = plannedTs;
        const finalArrivalTs: number = arrivalTs || finalPlannedTs;

        ordersWithData.push({
            order,
            planned: finalPlannedTs,
            arrival: finalArrivalTs,
            kitchen: kitchenTime || undefined
        });
    });

    // Сортируем по времени ПРИХОДА (arrival) - это основной фактор
    // Но при равенстве arrival, сортируем по времени кухни
    ordersWithData.sort((a, b) => {
        if (a.arrival !== b.arrival) return a.arrival - b.arrival;
        return (a.kitchen || 0) - (b.kitchen || 0);
    });

    const groups: TimeWindowGroup[] = [];
    const manualGroupsMap = new Map<string, Order[]>();
    const handoverGroupsMap = new Map<string, Order[]>(); // NEW: Handover-based groups
    const ordersForAuto: Array<{ order: Order; planned: number; arrival: number; kitchen?: number }> = [];

    // НОВАЯ ЛОГИКА: Разделяем заказы на ручные, handover-based, и автоматические
    ordersWithData.forEach(item => {
        // 1. Ручные группы (приоритет)
        if (item.order.manualGroupId) {
            if (!manualGroupsMap.has(item.order.manualGroupId)) {
                manualGroupsMap.set(item.order.manualGroupId, []);
            }
            manualGroupsMap.get(item.order.manualGroupId)!.push(item.order);
        }
        // 2. Handover-based группы (SOTA 3.1: консолидация собранных, доставляемых и исполненных)
        else if (item.order.status === 'Доставляется' || item.order.status === 'В пути' || isOrderCompleted(item.order.status) || item.order.status === 'Собран') {
            // Группируем их отдельно, логика ниже
            // Добавляем во временное хранилище для последующей кластеризации
            const key = `temp-handover`;
            if (!handoverGroupsMap.has(key)) {
                handoverGroupsMap.set(key, []);
            }
            handoverGroupsMap.get(key)!.push(item.order);
        }
        // 3. Автоматическая группировка (для остальных)
        else {
            ordersForAuto.push(item);
        }
    });

    // 1. Создаем группы для ручных заказов
    manualGroupsMap.forEach((mOrders, mgId) => {
        groups.push(createManualGroup(courierId, courierName, mOrders, mgId));
    });

    // 2. Создаем группы для handover-based заказов
    // FIX: Separate completed ('Исполнен') from active ('Доставляется', 'Собран', 'В пути')
    // so that a fully-completed block can NEVER absorb new active deliveries.
    const completedHandoverOrders = handoverGroupsMap.get('temp-handover')?.filter(
        o => isOrderCompleted(o.status)
    ) || [];
    const activeHandoverOrders = handoverGroupsMap.get('temp-handover')?.filter(
        o => !isOrderCompleted(o.status)
    ) || [];

    // v5.66: Increased to 30 min for better grouping
    const HANDOVER_WINDOW_MS = 15 * 60 * 1000; // v5.106: Set to 15m

    function clusterHandoverOrders(hOrdersList: Order[], splitReasonLabel: string) {
        if (hOrdersList.length === 0) return;

        // Sort by actual delivery/handover timestamp
        hOrdersList.sort((a, b) => {
            const tA = a.statusTimings?.deliveringAt || a.statusTimings?.assembledAt || a.handoverAt || getPlannedTime(a) || 0;
            const tB = b.statusTimings?.deliveringAt || b.statusTimings?.assembledAt || b.handoverAt || getPlannedTime(b) || 0;
            return tA - tB;
        });

        let currentHandoverGroup: Order[] = [];

        hOrdersList.forEach((order) => {
            const time = getArrivalTime(order) || 0;

            if (currentHandoverGroup.length === 0) {
                currentHandoverGroup.push(order);
            } else {
                // v5.106: Fixed Window - any order within 15min of the FIRST order in group
                // v5.107: Robust fallback to prevent 0-value gaps splitting everything
                const groupStartTime = getArrivalTime(currentHandoverGroup[0]) || getPlannedTime(currentHandoverGroup[0]) || Date.now();
                const diffMs = time - groupStartTime;
                if (diffMs <= HANDOVER_WINDOW_MS) {
                    currentHandoverGroup.push(order);
                } else {
                    createHandoverGroup(currentHandoverGroup, splitReasonLabel);
                    currentHandoverGroup = [order];
                }
            }
        });
        if (currentHandoverGroup.length > 0) {
            createHandoverGroup(currentHandoverGroup, splitReasonLabel);
        }
    }

    // v5.106: Merge completed and active handover orders into a single list
    // This prevents splitting a single delivery trip into separate blocks just because 
    // some orders are already finished.
    const allHandoverOrders = [...completedHandoverOrders, ...activeHandoverOrders];
    clusterHandoverOrders(allHandoverOrders, 'Маршрут');

    function createHandoverGroup(hOrders: Order[], _unusedLabel?: string) {
        const isAllCompleted = hOrders.every(o => isOrderCompleted(o.status));
        const splitReasonLabel = isAllCompleted ? 'Завершён' : 'Маршрут';
        const handoverTimes = hOrders
            .map(o => o.statusTimings?.deliveringAt || o.statusTimings?.assembledAt || o.handoverAt || getPlannedTime(o))
            .filter((t): t is number => !!t);

        if (handoverTimes.length === 0) return;

        const minHandover = Math.min(...handoverTimes);
        const maxHandover = Math.max(...handoverTimes);
        const plannedTimes = hOrders.map(o => getPlannedTime(o)).filter((t): t is number => !!t);
        const minPlanned = plannedTimes.length > 0 ? Math.min(...plannedTimes) : minHandover;
        const maxPlanned = plannedTimes.length > 0 ? Math.max(...plannedTimes) : maxHandover;

        const group: TimeWindowGroup = {
            id: `handover-${courierId}-${hOrders[0].id}`,
            courierId,
            courierName,
            windowStart: minPlanned,
            windowEnd: maxPlanned,
            windowLabel: formatTimeRange(minPlanned, maxPlanned),
            orders: hOrders,
            isReadyForCalculation: true,
            arrivalStart: minHandover,
            arrivalEnd: maxHandover,
            splitReason: splitReasonLabel
        };
        updatePredictedDeparture(group);
        groups.push(group);
    }

    // 3. Группируем автоматические заказы (существующая логика)
    let currentGroup: TimeWindowGroup | null = null;

    ordersForAuto.forEach(({ order, planned, arrival, kitchen }) => {
        const proximityMs = arrivalProximityMinutes * 60 * 1000;
        const deliverySpanMs = maxDeliverySpanMinutes * 60 * 1000;

        if (!currentGroup) {
            currentGroup = createNewGroup(courierId, courierName, order, planned, arrival, groups.length);
            // Сохраняем последнее время кухни в группе для доп. проверки
            (currentGroup as any).lastKitchen = kitchen;
        } else {



            // 1. Прилетели близко друг к другу (v5.106: Fixed Window - 15 min from FIRST order in group)?
            const arrivedClose = (arrival - (currentGroup.arrivalStart || 0) <= proximityMs);

            // 2. Время доставки не слишком сильно разлетается?
            const minDelivery = Math.min(currentGroup.windowStart, planned);
            const maxDelivery = Math.max(currentGroup.windowEnd, planned);
            const deliveryFits = (maxDelivery - minDelivery) <= deliverySpanMs;

            // 3. Доп. проверка: готовность на кухне
            let kitchenGapOk = true;
            const prevKitchen = (currentGroup as any).lastKitchen;
            if (prevKitchen && kitchen && Math.abs(kitchen - prevKitchen) > 30 * 60 * 1000) {
                kitchenGapOk = false;
            }

            // 4. Географическая проверка
            let distanceOk = true;
            if (order.coords && currentGroup.orders[0].coords) {
                const dist = haversineDistance(
                    order.coords.lat, order.coords.lng,
                    currentGroup.orders[0].coords.lat, currentGroup.orders[0].coords.lng
                );
                if (dist > 5) distanceOk = false;
            }

            // 5. Проверка по районам
            let districtOk = true;
            const orderZone = order.deliveryZone || '';
            const groupZone = currentGroup.orders[0].deliveryZone || '';
            if (orderZone && groupZone && orderZone !== groupZone) {
                districtOk = false;
            }


            // ОПРЕДЕЛЕНИЕ ПРИЧИНЫ РАЗДЕЛЕНИЯ (Phase 4.1)
            let newSplitReason = '';
            if (!arrivedClose) newSplitReason = 'Время';
            else if (!deliveryFits) newSplitReason = 'SLA';
            else if (!kitchenGapOk) newSplitReason = 'Готовность';
            else if (!distanceOk) newSplitReason = 'Гео';
            else if (!districtOk) newSplitReason = 'Район';

            if (newSplitReason === '') {
                // Добавляем в текущую группу
                currentGroup.orders.push(order);
                currentGroup.windowStart = minDelivery;
                currentGroup.windowEnd = maxDelivery;
                currentGroup.windowLabel = formatTimeRange(minDelivery, maxDelivery);
                currentGroup.arrivalEnd = Math.max(currentGroup.arrivalEnd || 0, arrival);
                if (kitchen) (currentGroup as any).lastKitchen = kitchen;

                // Обновляем прогноз выезда (Phase 4.2)
                updatePredictedDeparture(currentGroup);
            } else {
                // Создаем новую группу
                groups.push(currentGroup);
                currentGroup = createNewGroup(
                    courierId,
                    courierName,
                    order,
                    planned,
                    arrival,
                    groups.length,
                    newSplitReason
                );
                if (kitchen) (currentGroup as any).lastKitchen = kitchen;
            }
        }
    });

    if (currentGroup) {
        groups.push(currentGroup);
    }

    // Добавляем группу для заказов без времени
    if (noTimeOrders.length > 0) {
        groups.push({
            id: `${courierId}-no-time`,
            courierId,
            courierName,
            windowStart: 0,
            windowEnd: 0,
            windowLabel: 'Без времени',
            orders: noTimeOrders,
            isReadyForCalculation: false
        });
    }

    // Сортируем заказы внутри каждой группы по plannedTime
    groups.forEach(group => {
        group.orders.sort((a, b) => {
            const timeA = getPlannedTime(a) || a.plannedTime || 0;
            const timeB = getPlannedTime(b) || b.plannedTime || 0;
            const tsA = typeof timeA === 'number' ? timeA : new Date(timeA).getTime();
            const tsB = typeof timeB === 'number' ? timeB : new Date(timeB).getTime();
            return tsA - tsB;
        });
    });

    // Сортируем группы по времени начала окна
    return groups.sort((a, b) => a.windowStart - b.windowStart);
}

/**
 * Группирует заказы всех курьеров по временным окнам
 */
export function groupAllOrdersByTimeWindow(
    orders: Order[],
    couriers: any[],
    proximityMinutes: number = PROXIMITY_MINUTES,
    maxDeliverySpan: number = MAX_DELIVERY_SPAN_MINUTES
): Map<string, TimeWindowGroup[]> {
    const result = new Map<string, TimeWindowGroup[]>();

    // 1. Сначала группируем по сырым курьерам (как в Excel)
    const ordersByRawCourier = groupOrdersByCourier(orders);
    
    // 2. Объединяем их по нормализованной личности, чтобы один курьер не получал два маршрута
    interface CourierConsolidation { id: string; name: string; orders: Order[] }
    const consolidatedMap = new Map<string, CourierConsolidation>();
    
    ordersByRawCourier.forEach((courierOrders, rawId) => {
        const normalizedName = normalizeCourierName(rawId);
        const courier = couriers.find(c => 
            normalizeCourierName(c._id || c.id || c.name) === normalizedName
        );
        
        const finalId = courier?._id || courier?.id || rawId;
        const finalName = courier?.name || rawId || 'Неизвестный курьер';
        
        const existing = consolidatedMap.get(finalId) || { id: finalId, name: finalName, orders: [] as Order[] };
        existing.orders.push(...courierOrders);
        consolidatedMap.set(finalId, existing);
    });

    // 3. Для каждого консолидированного курьера группируем по времени
    consolidatedMap.forEach((info) => {
        const timeGroups = groupOrdersByTimeWindow(
            info.orders,
            info.id,
            info.name,
            proximityMinutes,
            maxDeliverySpan
        );
        result.set(info.id, timeGroups);
    });

    return result;
}

/**
 * Форматирует время из timestamp в читаемый формат
 */
export function formatTimeLabel(timestamp: number): string {
    if (!timestamp) return '--:--';
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

// ============================================
// СУЩЕСТВУЮЩИЕ ФУНКЦИИ (ОСТАВЛЕНЫ ДЛЯ СОВМЕСТИМОСТИ)
// ============================================

/**
 * Подсчитывает количество заказов для конкретного курьера
 */
export function countCourierOrders(courierId: string, orders: Order[]): number {
    if (!orders || !courierId) return 0;

    return orders.filter((order) => {
        const orderCourierId =
            order.courier?._id ||
            order.courier?.id ||
            order.courierId ||
            order.courier;

        return orderCourierId === courierId;
    }).length;
}

/**
 * Группирует заказы по курьерам
 */
export function groupOrdersByCourier(orders: Order[]): Map<string, Order[]> {
    const grouped = new Map<string, Order[]>();

    if (!orders) return grouped;

    orders.forEach((order) => {
        const courierId =
            order.courier?._id ||
            order.courier?.id ||
            order.courierId ||
            order.courier;

        if (courierId) {
            const existing = grouped.get(courierId) || [];
            grouped.set(courierId, [...existing, order]);
        }
    });

    return grouped;
}

/**
 * Определяет, нужно ли запускать автоматический расчет
 */
export function shouldTriggerCalculation(
    status: CourierRouteStatus,
    mode: RouteCalculationMode
): boolean {
    if (mode.mode !== 'automatic') return false;
    if (status.ordersCount === 0) return false;

    if (status.ordersCount >= mode.autoTriggerThreshold && status.needsRecalculation) {
        return true;
    }

    if (status.hasActiveRoute && mode.recalculateOnAdd && status.needsRecalculation) {
        return true;
    }

    return false;
}

/**
 * Создает статус курьера на основе данных о заказах и маршрутах
 */
export function createCourierStatus(
    courierId: string,
    courierName: string,
    orders: Order[],
    routes: any[],
    previousStatus?: CourierRouteStatus
): CourierRouteStatus {
    const ordersCount = countCourierOrders(courierId, orders);
    const activeRoute = routes.find(
        (r) => (r.courier?._id || r.courier?.id || r.courier) === courierId && r.isActive
    );

    let needsRecalculation = false;

    if (previousStatus) {
        needsRecalculation = previousStatus.ordersCount !== ordersCount;
    } else {
        needsRecalculation = ordersCount > 0;
    }

    return {
        courierId,
        courierName,
        ordersCount,
        hasActiveRoute: !!activeRoute,
        routeId: activeRoute?._id || activeRoute?.id,
        lastCalculated: previousStatus?.lastCalculated,
        needsRecalculation,
    };
}


/**
 * Возвращает правильное окончание для слова "заказ" (Русский)
 */
export function getOrdersEnding(count: number): string {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
        return 'ов';
    }

    if (lastDigit === 1) {
        return '';
    }

    if (lastDigit >= 2 && lastDigit <= 4) {
        return 'а';
    }

    return 'ов';
}

/**
 * Повертає правильну форму слова "замовлення" (Українська)
 */
export function getOrdersUkSuffix(count: number): string {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
        return 'замовлень';
    }

    if (lastDigit === 1) {
        return 'замовлення';
    }

    if (lastDigit >= 2 && lastDigit <= 4) {
        return 'замовлення';
    }

    return 'замовлень';
}

/**
 * Форматирует сообщение о статусе расчета
 */
export function getCalculationStatusMessage(
    status: CourierRouteStatus,
    mode: RouteCalculationMode
): string {
    if (mode.mode === 'manual') {
        return `${status.ordersCount} заказ${getOrdersEnding(status.ordersCount)}`;
    }

    const remaining = mode.autoTriggerThreshold - status.ordersCount;

    if (remaining > 0) {
        return `Автоматический расчет через ${remaining} заказ${getOrdersEnding(remaining)}`;
    }

    return `Готово к автоматическому расчету`;
}

/**
 * Вычисляет прогресс до автоматического расчета (0-100%)
 */
export function calculateProgressToAutoTrigger(
    ordersCount: number,
    threshold: number
): number {
    if (threshold === 0) return 100;
    return Math.min(100, (ordersCount / threshold) * 100);
}
