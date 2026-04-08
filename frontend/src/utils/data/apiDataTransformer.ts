import { ProcessedExcelData, Order } from '../../types';
import { DashboardOrderResponse, DashboardApiResponse } from '../../types/DashboardApiTypes';
import { asNonEmptyString, isId0CourierName, normalizeCourierName } from './courierName';

/**
 * Преобразование данных Dashboard API в формат ProcessedExcelData
 */
export const transformDashboardData = (
    apiData: DashboardApiResponse,
    baseDate: string,
    fallbackDate?: string // format dd.mm.yyyy or YYYY-MM-DD HH:mm:ss
): ProcessedExcelData => {
    console.log(`[transformDashboardData] Incoming raw orders: ${apiData.orders?.length || 0}`);
    
    // Truncate function to get only dd.mm.yyyy
    const getOnlyDate = (s: string) => s.split(' ')[0].split('T')[0];

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

    const orders: Order[] = [];
    const couriers: any[] = [];
    const errors: any[] = [];

    // Преобразование курьеров
    (apiData.couriers || []).forEach((apiCourier: any) => {
        const courierName = asNonEmptyString(apiCourier?.name);

        // Пропускаем "ID:0", так как это техническое обозначение неназначенного заказа в API
        if (isId0CourierName(courierName)) return;

        // Определяем тип транспорта из API или по умолчанию 'car'
        let vehicleType: 'car' | 'motorcycle' = 'car';
        if (apiCourier.vehicleType) {
            const apiType = String(apiCourier.vehicleType).toLowerCase();
            if (apiType === 'motorcycle' || apiType === 'мото' || apiType === 'мотоцикл') {
                vehicleType = 'motorcycle';
            }
        }

        couriers.push({
            name: courierName,
            isActive: apiCourier.isActive,
            vehicleType: vehicleType,
            distanceKm: apiCourier.distanceKm || 0,
            calculatedOrders: apiCourier.calculatedOrders || 0
        });
    });

    console.log(`[dashboardTransformer] Total orders to process: ${apiData.orders?.length || 0}`);

    // Преобразование заказов
    (apiData.orders || []).forEach((apiOrder, index) => {
        try {
            const order = transformDashboardOrder(apiOrder, effectiveDate, index);
            orders.push(order);
        } catch (error) {
            errors.push({
                row: index + 1,
                message: `Ошибка обработки заказа ${apiOrder.orderNumber}: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
                data: apiOrder,
            });
        }
    });

    console.log(`[dashboardTransformer] Successfully transformed: ${orders.length}/${apiData.orders?.length || 0}`);

    // Sync couriers with orders: Ensure all couriers mentioned in orders exist in the couriers list
    const existingCourierNames = new Set(couriers.map(c => c.name));
    orders.forEach(order => {
        if (order.courier &&
            order.courier !== 'Не назначено' &&
            order.courier !== 'ID:0' && 
            !existingCourierNames.has(order.courier)) {

            let vehicleType: 'car' | 'motorcycle' = 'car';
            const courierNameLower = order.courier.toLowerCase();

            if (courierNameLower.includes('мото') || courierNameLower.includes('moto')) {
                vehicleType = 'motorcycle';
            }

            couriers.push({
                name: order.courier,
                isActive: true,
                vehicleType: vehicleType
            });
            existingCourierNames.add(order.courier);
        }
    });

    // v5.204: Enrich routes and normalize courier names
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
const transformDashboardOrder = (apiOrder: DashboardOrderResponse, baseDate: string, index: number): Order => {
    // Вспомогательная функция для проверки на "пустое" или "нулевое" время
    const isTimeEmpty = (t?: string) => {
        if (!t) return true;
        const trimmed = t.trim();
        // Treat any variant of zero time as empty
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

    return {
        idx: index,
        address: apiOrder.address,
        orderNumber: apiOrder.orderNumber,
        readyAtSource,
        deadlineAt,
        handoverAt, // Добавлено (Phase 4.4)
        plannedTime: deadlineStr || 'Без времени',
        courier: (apiOrder.courier && isId0CourierName(apiOrder.courier)) ? 'Не назначено' : asNonEmptyString(apiOrder.courier),
        reassignedToCourier: (apiOrder as any).reassignedToCourier ? asNonEmptyString((apiOrder as any).reassignedToCourier) : null,
        amount: apiOrder.amount,
        paymentMethod: apiOrder.paymentMethod,
        status: apiOrder.status,
        orderComment: apiOrder.orderComment,
        orderType: apiOrder.orderType,
        creationDate: (() => {
            if (!apiOrder.creationDate) return Date.now();
            // Safe parse DD.MM.YYYY
            if (/^\d{2}\.\d{2}\.\d{4}/.test(apiOrder.creationDate)) {
                const [d, m, y] = apiOrder.creationDate.split(' ')[0].split('.').map(Number);
                return new Date(y, m - 1, d).getTime();
            }
            const d = new Date(apiOrder.creationDate).getTime();
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
    return `${dateStr} ${hours}:${minutes}:00`;
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