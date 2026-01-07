import { ProcessedExcelData, Order } from '../../types';
import { SwaggerOrderResponse, SwaggerApiResponse } from '../../types/SwaggerApiTypes';

/**
 * Преобразование данных Swagger API в формат ProcessedExcelData
 */
export const transformSwaggerData = (
    swaggerData: SwaggerApiResponse,
    baseDate: string,
    fallbackDate?: string // format dd.mm.yyyy or YYYY-MM-DD
): ProcessedExcelData => {
    // If baseDate is missing, try to extract date from fallbackDate (which is likely dateTimeDeliveryBeg)
    let effectiveDate = baseDate;
    if (!effectiveDate && fallbackDate) {
        if (fallbackDate.includes('T')) {
            // It's a datetime-local format: YYYY-MM-DDTHH:mm
            const datePart = fallbackDate.split('T')[0];
            const [y, m, d] = datePart.split('-');
            effectiveDate = `${d}.${m}.${y}`;
        } else if (fallbackDate.includes('-')) {
            const [y, m, d] = fallbackDate.split('-');
            effectiveDate = `${d}.${m}.${y}`;
        } else if (fallbackDate.includes('.')) {
            effectiveDate = fallbackDate;
        }
    }

    const orders: Order[] = [];
    const couriers: any[] = [];
    const errors: any[] = [];

    // Преобразование курьеров
    swaggerData.couriers.forEach((swaggerCourier) => {
        // Пропускаем "ID:0", так как это техническое обозначение неназначенного заказа в Swagger
        if (swaggerCourier.name === 'ID:0') return;

        couriers.push({
            name: swaggerCourier.name,
            isActive: swaggerCourier.isActive,
            vehicleType: swaggerCourier.vehicleType || 'car',
        });
    });

    // Если в списке курьеров нет "Не назначен", добавляем его для группировки неназначенных заказов
    // Но фактически мы будем использовать это имя в заказах, и UI сам их сгруппирует


    // Преобразование заказов
    swaggerData.orders.forEach((swaggerOrder, index) => {
        try {
            if (index < 3) {
                console.log(`[swaggerDataTransformer] Raw order ${index}:`, swaggerOrder);
            }
            const order = transformSwaggerOrder(swaggerOrder, effectiveDate, index);
            orders.push(order);
        } catch (error) {
            errors.push({
                row: index + 1,
                message: `Ошибка обработки заказа ${swaggerOrder.orderNumber}: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
                data: swaggerOrder,
            });
        }
    });

    return {
        orders,
        couriers,
        paymentMethods: [],
        routes: [],
        errors,
        summary: {
            totalRows: swaggerData.orders.length,
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
 * Преобразование одного заказа из формата Swagger в внутренний формат
 */
const transformSwaggerOrder = (swaggerOrder: SwaggerOrderResponse, baseDate: string, index: number): Order => {
    // Парсинг времени готовности на кухне
    const readyAtSource = parseTimeToTimestamp(baseDate, swaggerOrder.kitchenTime);

    // Парсинг дедлайна доставки
    const deadlineAt = parseTimeToTimestamp(baseDate, swaggerOrder.deliverBy);

    // Парсинг планового времени - used to be here, now just keeping HH:MM string for compatibility
    // const plannedTime = parseTimeToTimestamp(baseDate, swaggerOrder.plannedTime);

    return {
        idx: index,
        address: swaggerOrder.address,
        orderNumber: swaggerOrder.orderNumber,
        readyAtSource,
        deadlineAt,
        plannedTime: swaggerOrder.plannedTime, // Keep as string (HH:MM) for compatibility with UI sorting/display
        deliveryZone: swaggerOrder.deliveryZone,
        courier: swaggerOrder.courier === 'ID:0' ? 'Не назначен' : swaggerOrder.courier,
        amount: swaggerOrder.amount,
        paymentMethod: swaggerOrder.paymentMethod,
        status: swaggerOrder.status,
        orderComment: swaggerOrder.orderComment,
        orderType: swaggerOrder.orderType,
        creationDate: swaggerOrder.creationDate,
        deliveryTime: swaggerOrder.deliveryTime,
        changeAmount: swaggerOrder.changeAmount,
        totalTime: swaggerOrder.totalTime,
        coords: null, // Будет заполнено геокодированием позже
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
        // Парсинг базовой даты (dd.mm.yyyy)
        const [day, month, year] = baseDate.split('.').map(Number);

        // Парсинг времени (HH:MM)
        const [hours, minutes] = timeString.split(':').map(Number);

        // Создание Date объекта
        const date = new Date(year, month - 1, day, hours, minutes, 0, 0);

        return date.getTime();
    } catch (error) {
        console.warn(`Ошибка парсинга времени: baseDate=${baseDate}, timeString=${timeString}`, error);
        return null;
    }
};

/**
 * Форматирование даты для Swagger API (dd.mm.yyyy)
 */
export const formatDateForSwagger = (date: Date): string => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
};

/**
 * Форматирование даты и времени для Swagger API (dd.mm.yyyy HH:MM:SS)
 */
export const formatDateTimeForSwagger = (date: Date): string => {
    const dateStr = formatDateForSwagger(date);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${dateStr} ${hours}:${minutes}:${seconds}`;
};

/**
 * Геокодирование заказов из Swagger API
 * @param orders Массив заказов для геокодирования
 * @param geocodingService Сервис геокодирования
 * @returns Обновленные заказы с координатами
 */
export const geocodeSwaggerOrders = async (
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
