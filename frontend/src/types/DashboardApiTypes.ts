// Dashboard API Type Definitions for Order Management

export interface DashboardOrderResponse {
    orderNumber: string;          // Номер заказа
    address: string;               // Адрес доставки
    status: string;                // Статус
    courier: string;               // Курьер
    amount: number;                // Сумма
    paymentMethod: string;         // Способ оплаты
    kitchenTime: string;           // Время выдачи с кухни (формат "HH:MM")
    deliverBy: string;             // Точное время доставки (формат "HH:MM")
    plannedTime: string;           // Плановое время (формат "HH:MM")
    deliveryTime: string;          // Время доставки (например "42мин.")
    changeAmount: number;          // Сдача
    orderComment: string;          // Комментарий
    orderType: string;             // Тип заказа (Доставка, Самовывоз и т.д.)
    creationDate: string;          // Дата создания (формат "dd.mm.yyyy HH:MM")
    totalTime: string;             // Общее время (например "1ч. 12мин.")
    statusTimings?: {
        assembledAt?: string;      // ISO string
        deliveringAt?: string;     // ISO string
    };
    // Optional fields that may come from different API sources
    deliveryZone?: string;
    zoneName?: string;
    zone?: string;
    lat?: number;
    lng?: number;
}

export interface DashboardCourierResponse {
    name: string;                  // Имя курьера
    isActive: boolean;             // Активен
    vehicleType?: 'car' | 'motorcycle' | 'pedestrian';  // Тип транспорта
    distanceKm?: number;
    calculatedOrders?: number;
}

export interface DashboardApiParams {
    top?: number;                  // Максимальное количество записей (1-2000)
    dateShift?: string;            // Дата смены в формате dd.mm.yyyy (теперь опционально)
    timeDeliveryBeg?: string;      // Начало окна доставки (формат "dd.mm.yyyy HH:MM:SS")
    timeDeliveryEnd?: string;      // Конец окна доставки (формат "dd.mm.yyyy HH:MM:SS")
    departmentId?: number;         // ID подразделения (departmentId)
    divisionId?: number;           // ID подразделения (divisionId)
    department_id?: number;        // ID подразделения (department_id)
    division_id?: number;          // ID подразделения (division_id)
    apiKey: string;                // API ключ (передается в заголовке x-api-key)
}

export interface DashboardApiResponse {
    orders: DashboardOrderResponse[];
    couriers: DashboardCourierResponse[];
    routes?: any[];
    distanceKm?: Record<string, number>;
    calculatedOrders?: Record<string, number>;
    lastModified?: string | number;
}

export interface DashboardApiError {
    success: false;
    error: string; // Сообщение об ошибке
    details?: any; // Дополнительные детали ошибки
}

export type DashboardApiResult =
    | { success: true; data: DashboardApiResponse }
    | DashboardApiError;
