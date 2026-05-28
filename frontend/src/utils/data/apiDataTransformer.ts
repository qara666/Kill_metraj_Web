import { ProcessedExcelData, Order } from '../../types';
import { DashboardOrderResponse, DashboardApiResponse } from '../../types/DashboardApiTypes';
import { asNonEmptyString, isId0CourierName, normalizeCourierName } from './courierName';

/**
 * Преобразование данных Dashboard API в формат ProcessedExcelData
 */
export const transformDashboardData = (
    apiData: DashboardApiResponse,
    baseDate: string,
    fallbackDate?: string // формат dd.mm.yyyy или YYYY-MM-DD HH:mm:ss
): ProcessedExcelData => {
    // Функция обрезки для получения только dd.mm.yyyy
    const getOnlyDate = (s: any): string => {
        if (!s || typeof s !== 'string') return '';
        try {
            // v9.92: Надежное разделение с проверкой на null
            const parts = s.split(' ');
            if (!parts || parts.length === 0) return '';
            const datePart = parts[0];
            return datePart.includes('T') ? datePart.split('T')[0] : datePart;
        } catch (e) {
            return '';
        }
    };

    let effectiveDate = baseDate ? getOnlyDate(baseDate) : '';

    if (!effectiveDate && fallbackDate) {
        const dPart = getOnlyDate(fallbackDate);
        if (dPart.includes('-')) {
            const [y, m, d] = dPart.split('-');
            effectiveDate = `${d}.${m}.${y}`;
        } else {
            effectiveDate = dPart;
        }
    }

    const couriers: any[] = [];
    const errors: any[] = [];
    const orders: any[] = [];

    // 1. Создаем карту курьеров для быстрого поиска типа транспорта
    const courierVehicleMap = new Map<string, 'car' | 'foot'>();
    (apiData.couriers || []).forEach((apiCourier: any) => {
        const name = asNonEmptyString(apiCourier?.name);
        if (isId0CourierName(name)) return;

        let vType: 'car' | 'foot' = 'car';
        if (apiCourier.vehicleType) {
            const apiType = String(apiCourier.vehicleType).toLowerCase();
            if (apiType === 'foot' || apiType === 'pedestrian' || apiType === 'пеший' || apiType === 'піший' || 
                apiType === 'motorcycle' || apiType === 'мото' || apiType === 'мотоцикл' || apiType === 'скутер') {
                vType = 'foot';
            }
        }
        courierVehicleMap.set(name, vType);

        couriers.push({
            name: name,
            isActive: apiCourier.isActive,
            vehicleType: vType,
            distanceKm: apiCourier.distanceKm || 0,
            calculatedOrders: apiCourier.calculatedOrders || 0
        });
    });



    // 2. Преобразование заказов с учетом типа транспорта курьера
    (apiData.orders || []).forEach((apiOrder, index) => {
        try {
            const order = transformDashboardOrder(apiOrder, effectiveDate, index, courierVehicleMap);
            orders.push(order);
        } catch (error) {
            errors.push({
                row: index + 1,
                message: `Ошибка обработки заказа ${apiOrder.orderNumber}: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
                data: apiOrder,
            });
        }
    });


    // Синхронизация курьеров с заказами: все курьеры из заказов должны быть в списке
    const existingCourierNames = new Set(couriers.map(c => c.name));
    orders.forEach(order => {
        if (order.courier &&
            order.courier !== 'Не назначено' &&
            order.courier !== 'ID:0' && 
            !existingCourierNames.has(order.courier)) {

            let vehicleType: 'car' | 'foot' = 'car';
            const courierNameLower = order.courier.toLowerCase();

            if (courierNameLower.includes('мото') || courierNameLower.includes('moto') || 
                courierNameLower.includes('пеш') || courierNameLower.includes('foot') || 
                courierNameLower.includes('піш') || courierNameLower.includes('скутер')) {
                vehicleType = 'foot';
            }

            couriers.push({
                name: order.courier,
                isActive: true,
                vehicleType: vehicleType
            });
            existingCourierNames.add(order.courier);
        }
    });

    // v5.204: Обогащение маршрутов и нормализация имен курьеров
    const enrichedRoutes = (apiData.routes || []).map((r: any) => ({
        ...r,
        courier: normalizeCourierName(r.courier || r.courier_id) || r.courier
    }));

    return {
        orders,
        couriers,
        paymentMethods: [],
        routes: enrichedRoutes,
        errors,
        lastModified: apiData.lastModified ? Number(apiData.lastModified) : Date.now(),
        creationDate: effectiveDate || (() => {
            if (orders.length > 0 && orders[0].creationDate) {
                const d = new Date(Number(orders[0].creationDate));
                if (!isNaN(d.getTime())) {
                    const dd = String(d.getDate()).padStart(2, '0');
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const yyyy = d.getFullYear();
                    return `${dd}.${mm}.${yyyy}`;
                }
            }
            return '';
        })(),
        summary: {
            totalRows: apiData.orders?.length || 0,
            successfulGeocoding: 0, 
            failedGeocoding: 0,
            orders: orders.length,
            couriers: couriers.length,
            paymentMethods: 0,
            errors: errors.map((e: any) => e.message),
        },
    };
};

/**
 * Преобразование одного заказа из формата API в внутренний формат
 */
const transformDashboardOrder = (
    apiOrder: DashboardOrderResponse, 
    baseDate: string, 
    index: number,
    courierVehicleMap?: Map<string, 'car' | 'foot'>
): Order => {
    // Вспомогательная функция для проверки на "пустое" или "нулевое" время
    const isTimeEmpty = (t?: string) => {
        if (!t) return true;
        const trimmed = t.trim();
        // Считаем любой вариант нулевого времени пустым
        return /^0?0:00(:00)?$/.test(trimmed) || trimmed === '';
    };

    // Парсинг времени готовности на кухне
    const readyAtSource = parseTimeToTimestamp(baseDate, apiOrder.kitchenTime);

    // Парсинг дедлайна доставки. 
    // Приоритет: plannedTime, затем deliverBy (SLA). Игнорируем 00:00.
    let deadlineAt = null;
    let deadlineStr = '';

    if (!isTimeEmpty(apiOrder.plannedTime)) {
        deadlineAt = parseTimeToTimestamp(baseDate, apiOrder.plannedTime);
        deadlineStr = apiOrder.plannedTime;
    } else if (!isTimeEmpty(apiOrder.deliverBy)) {
        deadlineAt = parseTimeToTimestamp(baseDate, apiOrder.deliverBy);
        deadlineStr = apiOrder.deliverBy;
    }

    // Если все еще пусто — пробуем получить хоть что-то (даже 00:00) или вычисляем дефолт
    if (!deadlineAt && readyAtSource) {
        deadlineAt = readyAtSource + 60 * 60 * 1000; // Дефолт: +1 час от кухни
        const d = new Date(deadlineAt);
        deadlineStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    // FINAL FAIL-SAFE: Якщо в результаті вийшло нульове або порожнє час — замінюємо
    if (!deadlineStr || /^0?0:00(:00)?$/.test(deadlineStr.trim())) {
        deadlineStr = 'Без времени';
        deadlineAt = null;
    }

    // Извлечение времени перехода в доставку (Phase 4.4)
    let handoverAt = null;
    if (apiOrder.statusTimings?.deliveringAt) {
        handoverAt = new Date(apiOrder.statusTimings.deliveringAt).getTime();
    }

    const courierName = (apiOrder.courier && isId0CourierName(apiOrder.courier)) ? 'Не назначено' : asNonEmptyString(apiOrder.courier);
    
    // Определяем тип транспорта курьера для этого заказа
    let vehicleType: 'car' | 'foot' = 'car';
    if (courierName !== 'Не назначено' && courierVehicleMap) {
        vehicleType = courierVehicleMap.get(courierName) || 'car';
    }

    return {
        idx: index,
        address: apiOrder.address,
        orderNumber: apiOrder.orderNumber,
        readyAtSource,
        deadlineAt,
        handoverAt, 
        plannedTime: deadlineStr || 'Без времени',
        courier: courierName,
        vehicleType,
        reassignedToCourier: (apiOrder as any).reassignedToCourier ? asNonEmptyString((apiOrder as any).reassignedToCourier) : null,
        amount: Number((apiOrder as any).effectiveAmount ?? apiOrder.amount ?? (apiOrder as any).totalAmount ?? (apiOrder as any).sum ?? (apiOrder as any).summa ?? (apiOrder as any).totalSum ?? (apiOrder as any).сума ?? (apiOrder as any).сумма ?? (apiOrder as any).price ?? 0),
        totalAmount: Number((apiOrder as any).totalAmount ?? apiOrder.amount ?? (apiOrder as any).totalSum ?? 0),
        paymentMethod: apiOrder.paymentMethod || (apiOrder as any).payment_method || (apiOrder as any).оплата || '',
        status: apiOrder.status,
        orderComment: apiOrder.orderComment,
        orderType: apiOrder.orderType,
        creationDate: (() => {
            if (!apiOrder.creationDate) return Date.now();
            const dateStr = String(apiOrder.creationDate);
            // Безопасный парсинг DD.MM.YYYY
            if (/^\d{2}\.\d{2}\.\d{4}/.test(dateStr)) {
                const [d, m, y] = dateStr.split(' ')[0].split('.').map(Number);
                return new Date(y, m - 1, d).getTime();
            }
            const d = new Date(dateStr).getTime();
            return isNaN(d) ? Date.now() : d;
        })(),
        deliveryTime: apiOrder.deliveryTime,
        changeAmount: apiOrder.changeAmount,
        totalTime: apiOrder.totalTime,
        zone: (apiOrder.deliveryZone || (apiOrder as any).zoneName || (apiOrder as any).zone || 'БЕЗ ЗОНЫ').toString().trim().toUpperCase(),
        coords: (apiOrder as any).coords || ((apiOrder as any).lat && (apiOrder as any).lng ? { lat: Number((apiOrder as any).lat), lng: Number((apiOrder as any).lng) } : null),
        isSelected: false,
        isInRoute: false,
        raw: apiOrder,
    };
};

/**
 * Парсинг времени из строки формата "HH:MM" в timestamp
 * @param baseDate Базовая дата в формате "dd.mm.yyyy"
 * @param timeString Время в формате "HH:MM"
 * @returns Timestamp в миллисекундах или null
 */
const parseTimeToTimestamp = (baseDate: string, timeString: string): number | null => {
    if (!timeString || !baseDate) return null;

    try {
        // Убеждаемся, что берем только дату, даже если пришла строка с временем
        const datePart = baseDate.split(' ')[0].split('T')[0];

        let day, month, year;

        if (datePart.includes('.')) {
            [day, month, year] = datePart.split('.').map(Number);
        } else if (datePart.includes('-')) {
            [year, month, day] = datePart.split('-').map(Number);
        } else {
            return null;
        }

        // Парсинг времени (HH:MM)
        const [hours, minutes] = timeString.split(':').map(Number);

        if (isNaN(day) || isNaN(month) || isNaN(year) || isNaN(hours) || isNaN(minutes)) {
            return null;
        }

        // Создание Date объекта
        const date = new Date(year, month - 1, day, hours, minutes, 0, 0);

        return date.getTime();
    } catch (error) {
        console.warn(`Ошибка парсинга времени: baseDate=${baseDate}, timeString=${timeString}`, error);
        return null;
    }
};

/**
 * Форматирование даты для Dashboard API (dd.mm.yyyy)
 */
export const formatDateForApi = (date: Date): string => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
};

/**
 * Форматирование даты и времени для Dashboard API (dd.mm.yyyy HH:MM:SS)
 */
export const formatDateTimeForApi = (date: Date): string => {
    const dateStr = formatDateForApi(date);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${dateStr} ${hours}:${minutes}:${seconds}`;
};

/**
 * Геокодирование заказов из Dashboard API
 * @param orders Массив заказов для геокодирования
 * @param geocodingService Сервис геокодирования
 * @returns Обновленные заказы с координатами
 */
export const geocodeDashboardOrders = async (
    orders: Order[],
    geocodingService: any
): Promise<{ orders: Order[]; successCount: number; failCount: number }> => {
    let successCount = 0;
    let failCount = 0;

    const geocodedOrders = await Promise.all(
        orders.map(async (order) => {
            try {
                // SOTA 4.0: Используем geocodeAndCleanAddress для лучшей очистки и привязки к региону
                const result = await geocodingService.geocodeAndCleanAddress(order.address);

                if (result.success && result.latitude && result.longitude) {
                    successCount++;
                    return {
                        ...order,
                        coords: { lat: result.latitude, lng: result.longitude },
                    };
                } else {
                    failCount++;
                    console.warn(`Не удалось геокодировать адрес: ${order.address}`, result.error);
                    return order;
                }
            } catch (error) {
                failCount++;
                console.error(`Ошибка геокодирования адреса ${order.address}:`, error);
                return order;
            }
        })
    );

    return {
        orders: geocodedOrders,
        successCount,
        failCount,
    };
};