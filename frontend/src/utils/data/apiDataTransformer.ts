import { ProcessedExcelData, Order } from '../../types';
import { DashboardOrderResponse, DashboardApiResponse } from '../../types/DashboardApiTypes';

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
    apiData.couriers.forEach((swaggerCourier) => {
        // Пропускаем "ID:0", так как это техническое обозначение неназначенного заказа в API
        if (swaggerCourier.name === 'ID:0' || swaggerCourier.name.startsWith('ID:0')) return;

        // Если в будущем API добавит дату курьеру, мы сможем фильтровать здесь

        couriers.push({
            name: swaggerCourier.name,
            isActive: swaggerCourier.isActive,
            vehicleType: swaggerCourier.vehicleType || 'car',
        });
    });

    // Если в списке курьеров нет "Не назначен", добавляем его для группировки неназначенных заказов
    // Но фактически мы будем использовать это имя в заказах, и UI сам их сгруппирует


    // Преобразование заказов
    apiData.orders.forEach((swaggerOrder, index) => {
        try {
            // CLIENT-SIDE FAIL-SAFE: Verify date and department if possible
            // 1. Date check
            if (effectiveDate && swaggerOrder.creationDate) {
                // creationDate is "dd.mm.yyyy HH:MM"
                // effectiveDate is "dd.mm.yyyy"
                if (!swaggerOrder.creationDate.includes(effectiveDate)) {
                    // console.log(`[dashboardTransformer] Skipping order ${swaggerOrder.orderNumber}: Date mismatch (${swaggerOrder.creationDate} vs ${effectiveDate})`);
                    return; // Skip wrong date
                }
            }

            const order = transformDashboardOrder(swaggerOrder, effectiveDate, index);
            orders.push(order);
        } catch (error) {
            errors.push({
                row: index + 1,
                message: `Ошибка обработки заказа ${swaggerOrder.orderNumber}: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
                data: swaggerOrder,
            });
        }
    });

    // Sync couriers with orders: Ensure all couriers mentioned in orders exist in the couriers list
    // Sync couriers with orders: Ensure all couriers mentioned in orders exist in the couriers list
    const existingCourierNames = new Set(couriers.map(c => c.name));
    orders.forEach(order => {
        // Only add if it's a REAL courier name (not 'Не назначено', not 'ID:0')
        // The order.courier field has already been transformed in transformDashboardOrder
        // where 'ID:0' becomes 'Не назначено'.
        // So we just need to check if it's valid and not already in the list.
        if (order.courier &&
            order.courier !== 'Не назначено' &&
            order.courier !== 'ID:0' && // Just in case
            !existingCourierNames.has(order.courier)) {

            couriers.push({
                name: order.courier,
                isActive: true,
                vehicleType: 'car'
            });
            existingCourierNames.add(order.courier);
        }
    });

    return {
        orders,
        couriers,
        paymentMethods: [],
        routes: [],
        errors,
        summary: {
            totalRows: apiData.orders.length,
            successfulGeocoding: 0, // Будет обновлено после геокодирования
            failedGeocoding: 0,
            orders: orders.length,
            couriers: couriers.length,
            paymentMethods: 0,
            errors: errors.map((e) => e.message),
        },
    };
};

/**
 * Преобразование одного заказа из формата API в внутренний формат
 */
const transformDashboardOrder = (swaggerOrder: DashboardOrderResponse, baseDate: string, index: number): Order => {
    // Вспомогательная функция для проверки на "пустое" или "нулевое" время
    const isTimeEmpty = (t?: string) => !t || t === '00:00' || t === '00:00:00';

    // Парсинг времени готовности на кухне
    const readyAtSource = parseTimeToTimestamp(baseDate, swaggerOrder.kitchenTime);

    // Парсинг дедлайна доставки. 
    // Приоритет: deliverBy (SLA), затем plannedTime. Игнорируем 00:00.
    let deadlineAt = null;
    let deadlineStr = '';

    if (!isTimeEmpty(swaggerOrder.deliverBy)) {
        deadlineAt = parseTimeToTimestamp(baseDate, swaggerOrder.deliverBy);
        deadlineStr = swaggerOrder.deliverBy;
    } else if (!isTimeEmpty(swaggerOrder.plannedTime)) {
        deadlineAt = parseTimeToTimestamp(baseDate, swaggerOrder.plannedTime);
        deadlineStr = swaggerOrder.plannedTime;
    }

    // Если все еще пусто — пробуем получить хоть что-то (даже 00:00) или вычисляем дефолт
    if (!deadlineAt && readyAtSource) {
        deadlineAt = readyAtSource + 60 * 60 * 1000; // Дефолт: +1 час от кухни
        const d = new Date(deadlineAt);
        deadlineStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    return {
        idx: index,
        address: swaggerOrder.address,
        orderNumber: swaggerOrder.orderNumber,
        readyAtSource,
        deadlineAt,
        plannedTime: deadlineStr || 'Без времени',
        deliveryZone: swaggerOrder.deliveryZone,
        courier: (swaggerOrder.courier && (swaggerOrder.courier === 'ID:0' || swaggerOrder.courier.startsWith('ID:0'))) ? 'Не назначено' : swaggerOrder.courier,
        amount: swaggerOrder.amount,
        paymentMethod: swaggerOrder.paymentMethod,
        status: swaggerOrder.status,
        orderComment: swaggerOrder.orderComment,
        orderType: swaggerOrder.orderType,
        creationDate: swaggerOrder.creationDate,
        deliveryTime: swaggerOrder.deliveryTime,
        changeAmount: swaggerOrder.changeAmount,
        totalTime: swaggerOrder.totalTime,
        coords: null,
        isSelected: false,
        isInRoute: false,
        raw: swaggerOrder,
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
                const result = await geocodingService.geocodeAddress(order.address, {
                    preferredCity: 'Київ', // Можно настроить
                    strictMode: false,
                });

                if (result.success && result.coordinates) {
                    successCount++;
                    return {
                        ...order,
                        coords: result.coordinates,
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
