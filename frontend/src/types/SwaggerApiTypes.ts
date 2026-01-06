// Swagger API Type Definitions for Order Management

export interface SwaggerOrderResponse {
    orderNumber: string;          // Номер заказа
    address: string;               // Адрес доставки
    status: string;                // Статус
    courier: string;               // Курьер
    amount: number;                // Сумма
    paymentMethod: string;         // Способ оплаты
    kitchenTime: string;           // Время выдачи с кухни (формат "HH:MM")
    deliverBy: string;             // Точное время доставки (формат "HH:MM")
    plannedTime: string;           // Плановое время (формат "HH:MM")
    deliveryZone: string;          // Зона доставки
    deliveryTime: string;          // Время доставки (например "42мин.")
    changeAmount: number;          // Сдача
    orderComment: string;          // Комментарий
    orderType: string;             // Тип заказа (Доставка, Самовывоз и т.д.)
    creationDate: string;          // Дата создания (формат "dd.mm.yyyy HH:MM")
    totalTime: string;             // Общее время (например "1ч. 12мин.")
}

export interface SwaggerCourierResponse {
    name: string;                  // Имя курьера
    isActive: boolean;             // Активен
    vehicleType?: 'car' | 'motorcycle' | 'pedestrian';  // Тип транспорта
}

export interface SwaggerApiParams {
    top?: number;                  // Максимальное количество записей (1-2000)
    dateShift?: string;            // Дата смены в формате dd.mm.yyyy (теперь опционально)
    timeDeliveryBeg?: string;      // Начало окна доставки (формат "dd.mm.yyyy HH:MM:SS")
    timeDeliveryEnd?: string;      // Конец окна доставки (формат "dd.mm.yyyy HH:MM:SS")
    departmentId?: number;         // ID подразделения
    apiKey: string;                // API ключ (передается в заголовке x-api-key)
}

export interface SwaggerApiResponse {
    orders: SwaggerOrderResponse[];
    couriers: SwaggerCourierResponse[];
}

export interface SwaggerApiError {
    success: false;
    error: string;
    details?: any;
}

export type SwaggerApiResult =
    | { success: true; data: SwaggerApiResponse }
    | SwaggerApiError;
