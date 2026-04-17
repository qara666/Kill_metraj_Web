import type { Order, CourierRouteStatus, RouteCalculationMode } from '../../types';
import { isOrderCompleted } from '../data/orderStatus';
import { getPlannedTime, getArrivalTime, getKitchenTime, getExecutionTime } from '../data/timeUtils';
import { haversineDistance } from '../routes/routeOptimizationHelpers';
import { normalizeCourierName } from '../data/courierName';
import { getStableOrderId } from '../data/orderId';

// v7.x: Geo helper functions for center-based distance calculation
function calculateGroupCenter(orders: Order[]): { lat: number; lng: number } | null {
    if (!orders || orders.length === 0) return null;
    const ordersWithCoords = orders.filter(o => o.coords && o.coords.lat && o.coords.lng);
    if (ordersWithCoords.length === 0) return null;
    
    const sumLat = ordersWithCoords.reduce((sum, o) => sum + o.coords.lat, 0);
    const sumLng = ordersWithCoords.reduce((sum, o) => sum + o.coords.lng, 0);
    
    return {
        lat: sumLat / ordersWithCoords.length,
        lng: sumLng / ordersWithCoords.length
    };
}

function calculateMaxDistanceFromCenter(orders: Order[], center: { lat: number; lng: number }): number {
    if (!orders || orders.length === 0 || !center) return 0;
    let maxDist = 0;
    orders.forEach(o => {
        if (o.coords && o.coords.lat && o.coords.lng) {
            const dist = haversineDistance(center.lat, center.lng, o.coords.lat, o.coords.lng);
            if (dist > maxDist) maxDist = dist;
        }
    });
    return maxDist;
}

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

const DEFAULT_WINDOW_MINUTES = 30; // display label only, grouping uses PROXIMITY_MINUTES below

// v7.x: Updated to match backend - 20 minutes window
const PROXIMITY_MINUTES = 20;           // v7.x: Sliding window per-step — synced with backend turboGroupingHelpers.js
const MAX_DELIVERY_SPAN_MINUTES = 90;   // v8.1: Max delivery span in one route group — synced with backend

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

// Constants removed - now at top of file

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
    const kitchen = getKitchenTime(order);
    const anchorTime = getExecutionTime(order) || planned;
    
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
        splitReason,
        // Сохраняем якорь первой точки для проверки условий
        predictedDepartureAt: kitchen ? kitchen + 5 * 60 * 1000 : undefined
    };

    // Сохраняем firstAnchor, firstCoords, firstZone для проверки условий разбиения
    (group as any).firstAnchor = anchorTime;
    (group as any).firstCoords = order.coords || null;
    (group as any).firstZone = order.deliveryZone || '';
    (group as any).lastKitchen = kitchen || undefined;

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

    // STEP 0: Deduplicate orders by stable ID BEFORE processing (v5.139 fix)
    // Use getStableOrderId which handles _id, orderNumber, and address hash
    const seenIds = new Set<string>();
    const uniqueOrders: Order[] = [];
    for (const order of orders) {
        const sid = getStableOrderId(order);
        if (!sid) {
            // Orders without any ID - keep them (edge case)
            uniqueOrders.push(order);
        } else if (!seenIds.has(sid)) {
            seenIds.add(sid);
            uniqueOrders.push(order);
        }
    }
    
    // Debug: log if duplicates were found
    if (uniqueOrders.length < orders.length) {
        console.warn(`[groupOrdersByTimeWindow] ⚠️ Removed ${orders.length - uniqueOrders.length} duplicate orders`);
    }

    const noTimeOrders: Order[] = [];
    const ordersWithData: Array<{ order: Order; planned: number; arrival: number; kitchen?: number; execution?: number }> = [];

    // Разделяем заказы
    uniqueOrders.forEach(order => {
        // Пробуем получить плановое время из разных источников
        let plannedTime = getPlannedTime(order);

        // Время готовности на кухне - важный фактор для FO
        const kitchenTime = getKitchenTime(order);

        // Пробуем получить время поступления (создания)
        let arrivalTime = getArrivalTime(order);
        
        // v5.182: Время исполнения для завершенных заказов
        const executionTime = getExecutionTime(order);

        // ВАЖНО: Если время поступления отсутствует, используем плановое время или время кухни как прокси
        if (!arrivalTime) {
            arrivalTime = plannedTime || kitchenTime;
        }

        if (!plannedTime) {
            // Если дедлайна нет, пробуем использовать время кухни + 60 мин как дедлайн
            if (kitchenTime) {
                plannedTime = kitchenTime + 60 * 60 * 1000;
            } else if (arrivalTime) {
                // v5.127: Final fallback: arrival + 30 mins
                plannedTime = arrivalTime + 30 * 60 * 1000;
            } else {
                console.warn(`[Grouping] Order #${order.orderNumber} (ID: ${order.id}) lacks ANY time anchor (planned/kitchen/arrival/completion). Status: ${order.status}. Falling to 'no time' group.`);
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
            kitchen: kitchenTime || undefined,
            execution: executionTime || undefined
        });
    });

    // v5.182: Use executionTime (for completed) or planned as anchor — NOT arrival/createdAt
    // This matches the backend turboGroupingHelpers behavior
    const ordersWithAnchor = ordersWithData.map(item => ({
        ...item,
        anchorTime: item.execution || item.planned
    }));

    // Сортируем по опорному времени (anchorTime)
    ordersWithAnchor.sort((a, b) => {
        if (a.anchorTime !== b.anchorTime) return a.anchorTime - b.anchorTime;
        return (a.kitchen || 0) - (b.kitchen || 0);
    });

    const groups: TimeWindowGroup[] = [];
    const manualGroupsMap = new Map<string, Order[]>();
    const ordersForAuto: Array<{ order: Order; planned: number; arrival: number; kitchen?: number; anchorTime: number }> = [];

    // НОВАЯ ЛОГИКА: Разделяем только ручные и остальные
    ordersWithAnchor.forEach(item => {
        if (item.order.manualGroupId) {
            if (!manualGroupsMap.has(item.order.manualGroupId)) {
                manualGroupsMap.set(item.order.manualGroupId, []);
            }
            manualGroupsMap.get(item.order.manualGroupId)!.push(item.order);
        } else {
            ordersForAuto.push(item);
        }
    });

    // 1. Создаем группы для ручных заказов
    manualGroupsMap.forEach((mOrders, mgId) => {
        groups.push(createManualGroup(courierId, courierName, mOrders, mgId));
    });

    // Определение типа курьера (назначенный или нет)
    const isAssignedCourier = courierId && courierId !== 'unassigned' && courierId !== 'unassigned_auto' && courierId !== 'Неизвестный курьер' && courierId !== 'НЕ НАЗНАЧЕНО' && courierId !== 'ПО';
    let currentGroup: TimeWindowGroup | null = null;

    // 2. Группируем автоматические заказы
    const WINDOW_MS = arrivalProximityMinutes * 60 * 1000; // жесткое окно от первого заказа

    ordersForAuto.forEach(({ order, planned, arrival, kitchen, anchorTime }) => {
        const deliverySpanMs = maxDeliverySpanMinutes * 60 * 1000;
        
        if (!currentGroup) {
            // Создаем новую группу для первого заказа
            currentGroup = createNewGroup(courierId, courierName, order, planned, arrival, groups.length, '');
            if (kitchen) (currentGroup as any).lastKitchen = kitchen;
            (currentGroup as any).firstAnchor = anchorTime;
            (currentGroup as any).lastAnchor = anchorTime; // v8.1: sliding window
        } else {
            // v8.1: 5 conditions, sliding window from lastAnchor (mirrors backend v8.1)
            const lastAnchor = (currentGroup as any).lastAnchor || (currentGroup as any).firstAnchor;
            const firstOrder = currentGroup.orders[0];
            
            // Условие 1: Time proximity — SLIDING from last added order (not first)
            const anchorDiff = anchorTime - lastAnchor;
            const timeWithinProximity = anchorDiff >= 0 && anchorDiff <= WINDOW_MS;
            
            // Условие 2: SLA / delivery span <= MAX_DELIVERY_SPAN_MINUTES
            const minDelivery = Math.min(currentGroup.windowStart, planned);
            const maxDelivery = Math.max(currentGroup.windowEnd, planned);
            const deliverySpan = maxDelivery - minDelivery;
            const deliveryFits = deliverySpan <= deliverySpanMs;
            
            // Условие 3: Geography - v7.x: Center-based distance calculation
            let distanceOk = true;
            let distanceToFirst = 0;
            let distanceFromCenter = 0;
            if (order.coords && firstOrder.coords) {
                // Distance from first order (original logic)
                distanceToFirst = haversineDistance(
                    order.coords.lat, order.coords.lng,
                    firstOrder.coords.lat, firstOrder.coords.lng
                );
                
                // v7.x: Calculate center of group + max distance from center (more flexible)
                const allOrdersForCenter = [...currentGroup.orders, order];
                const center = calculateGroupCenter(allOrdersForCenter);
                
                if (center) {
                    distanceFromCenter = haversineDistance(
                        center.lat, center.lng,
                        order.coords.lat, order.coords.lng
                    );
                    
                    // Calculate max distance from center for ALL orders in group
                    const maxDistFromCenter = calculateMaxDistanceFromCenter(allOrdersForCenter, center);
                    
                    // v7.x: Use the MORE PERMISSIVE of the two strategies
                    const MAX_CENTER_DISTANCE = 30; // km
                    const MAX_FIRST_DISTANCE = 25; // km (slightly increased from 20)
                    
                    const centerBasedOk = maxDistFromCenter <= MAX_CENTER_DISTANCE;
                    const firstBasedOk = distanceToFirst <= MAX_FIRST_DISTANCE;
                    
                    distanceOk = centerBasedOk || firstBasedOk;
                } else {
                    // No center calculable, use original logic
                    distanceOk = distanceToFirst <= 25;
                }
            }
            
            // Условие 4: Zone — SOFT for assigned couriers (they cover multiple zones)
            let districtOk = true;
            const orderZone = order.deliveryZone || '';
            const groupZone = firstOrder.deliveryZone || '';
            if (!isAssignedCourier && orderZone && groupZone && orderZone !== groupZone) {
                districtOk = false;
            }
            
            // Условие 5: Kitchen readiness gap (<= 45 min for unassigned)
            let kitchenGapOk = true;
            if (!isAssignedCourier && kitchen) {
                const prevKitchen = (currentGroup as any).lastKitchen;
                if (prevKitchen) {
                    const kitchenDiff = Math.abs(kitchen - prevKitchen);
                    kitchenGapOk = kitchenDiff <= (45 * 60 * 1000);
                }
            }
            
            // Определяем причину разбиения (приоритет: время, SLA, гео, район, готовность)
            // v7.x: Updated geo split reason with new center-based logic
            let newSplitReason = '';
            if (!timeWithinProximity) newSplitReason = `Время (${Math.round(anchorDiff / 60000)} мин > ${PROXIMITY_MINUTES})`;
            else if (!deliveryFits) newSplitReason = `SLA (${Math.round(deliverySpan / 60000)} мин > ${MAX_DELIVERY_SPAN_MINUTES})`;
            else if (!distanceOk) newSplitReason = `Гео (от центра >30км или от первого >25км)`;
            else if (!districtOk) newSplitReason = `Район (${orderZone} ≠ ${groupZone})`;
            else if (!isAssignedCourier && !kitchenGapOk) newSplitReason = 'Готовность (>45м)';

            if (newSplitReason === '') {
                // Заказ подходит
                currentGroup.orders.push(order);
                currentGroup.windowStart = Math.min(currentGroup.windowStart, planned);
                currentGroup.windowEnd = Math.max(currentGroup.windowEnd, planned);
                currentGroup.windowLabel = formatTimeRange(currentGroup.windowStart, currentGroup.windowEnd);
                
                currentGroup.arrivalEnd = Math.max(currentGroup.arrivalEnd || 0, arrival);
                (currentGroup as any).lastAnchor = anchorTime; // v8.1: advance sliding window
                if (kitchen) (currentGroup as any).lastKitchen = kitchen;
                updatePredictedDeparture(currentGroup);
            } else {
                // Заказ не подходит - закрываем текущую группу и начинаем новую
                const oldGroup = currentGroup as TimeWindowGroup;
                const isAllCompleted = oldGroup.orders.every((o: Order) => isOrderCompleted(o.status));
                if (isAllCompleted && isAssignedCourier) oldGroup.splitReason = 'Завершён';

                groups.push(oldGroup);
                currentGroup = createNewGroup(
                    courierId,
                    courierName,
                    order,
                    planned,
                    arrival,
                    groups.length,
                    newSplitReason
                );
                // firstCoords и firstZone уже устанавливаются в createNewGroup
            }
        }
    });

    if (currentGroup) {
        const finalGroup = currentGroup as TimeWindowGroup;
        const isAllCompleted = finalGroup.orders.every((o: Order) => isOrderCompleted(o.status));
        if (isAllCompleted && isAssignedCourier) finalGroup.splitReason = 'Завершён';
        groups.push(finalGroup);
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
        // Robust matching: find by ID or normalized name
        const courier = couriers.find(c => 
            String(c._id || c.id) === String(rawId) ||
            normalizeCourierName(c.name || c.id) === normalizedName
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
        // v5.133: Use normalized name as key instead of numeric/object ID 
        // to ensure the UI (which uses names) can find the orders.
        result.set(normalizeCourierName(info.name), timeGroups);
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
