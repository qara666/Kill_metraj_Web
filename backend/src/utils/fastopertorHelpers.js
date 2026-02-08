const logger = require('./logger');

/**
 * Валидация и форматирование URL для Fastopertor
 */
function formatApiUrl(apiUrl, endpoint) {
    try {
        const validatedUrl = new URL(apiUrl);
        const baseUrl = validatedUrl.origin;
        const path = endpoint ? (endpoint.startsWith('/') ? endpoint : `/${endpoint}`) : (validatedUrl.pathname === '/' ? '' : validatedUrl.pathname);
        return `${baseUrl}${path}`;
    } catch (error) {
        throw new Error('Неверный формат API URL');
    }
}

/**
 * Преобразование заказов из формата Fastopertor
 */
function transformOrders(orders) {
    if (!Array.isArray(orders)) return [];

    return orders.map((order, index) => ({
        orderNumber: order.orderNumber || order.order_id || order.id || `ORDER_${index + 1}`,
        address: order.address || order.delivery_address || order.address_full || '',
        phone: order.phone || order.phone_number || order.contact_phone || '',
        customerName: order.customerName || order.customer_name || order.client_name || '',
        amount: order.amount || order.total || order.sum || 0,
        courier: order.courier || order.courier_name || order.driver || '',
        paymentMethod: order.paymentMethod || order.payment_method || order.payment || '',
        deliverBy: order.deliverBy || null,
        plannedTime: order.plannedTime || order.planned_time || order.delivery_time || null,
        readyAt: order.readyAt || order.ready_at || order.ready_time || null,
        deadlineAt: order.deliverBy || order.deadlineAt || order.deadline_at || order.deadline || order.plannedTime || null,
        note: order.note || order.notes || order.comment || '',
        priority: order.priority || 'normal',
        status: order.status || 'pending',
        raw: order
    }));
}

/**
 * Преобразование курьеров из формата Fastopertor
 */
function transformCouriers(couriers) {
    if (!Array.isArray(couriers)) return [];

    return couriers.map((courier, index) => ({
        name: courier.name || courier.driver_name || courier.full_name || `COURIER_${index + 1}`,
        phoneNumber: courier.phoneNumber || courier.phone || courier.phone_number || '',
        email: courier.email || '',
        vehicleType: courier.vehicleType || courier.vehicle_type || 'car',
        isActive: courier.isActive !== undefined ? courier.isActive : (courier.active !== undefined ? courier.active : true),
        location: courier.location || courier.current_location || '',
        raw: courier
    }));
}

/**
 * Главная функция трансформации данных
 */
function transformFastopertorData(data) {
    const transformed = {
        orders: [],
        couriers: [],
        paymentMethods: data.paymentMethods || [],
        routes: data.routes || [],
        errors: [],
        warnings: []
    };

    if (data.orders && data.couriers) {
        transformed.orders = transformOrders(data.orders);
        transformed.couriers = transformCouriers(data.couriers);
    } else if (Array.isArray(data)) {
        transformed.orders = transformOrders(data);
    } else if (data.data && Array.isArray(data.data)) {
        transformed.orders = transformOrders(data.data);
    }

    // Try to find drivers/couriers if not found above
    if (transformed.couriers.length === 0) {
        const drivers = data.couriers || data.drivers || (data.data && data.data.drivers);
        if (drivers) transformed.couriers = transformCouriers(drivers);
    }

    return transformed;
}

module.exports = {
    formatApiUrl,
    transformFastopertorData
};
