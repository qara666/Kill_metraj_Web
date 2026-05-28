
import { Order } from './src/types';
import { groupOrdersByTimeWindow } from './src/utils/route/routeCalculationHelpers';

// Генератор тестовых данных
const createOrder = (id: string, lat: number, lng: number, ready: string, deliver: string, zone: string = 'CENTER'): Order => ({
    id,
    address: `Address ${id}`,
    orderNumber: id,
    coords: { lat, lng },
    raw: {
        kitchenTime: ready,
        plannedTime: deliver,
        deliveryZone: zone
    },
    readyAtSource: 1736592000000 + (parseInt(ready.split(':')[0]) * 60 + parseInt(ready.split(':')[1])) * 60000,
    deadlineAt: 1736592000000 + (parseInt(deliver.split(':')[0]) * 60 + parseInt(deliver.split(':')[1])) * 60000,
    deliveryZone: zone,
    plannedTime: deliver
} as any);

// СЦЕНАРИЙ 1: Заказы прибыли близко, но разброс доставки > 60 мин -> НУЖНО РАЗДЕЛИТЬ
const ordersS1 = [
    createOrder('1', 50.4501, 30.5234, '12:00', '13:00'),
    createOrder('2', 50.4502, 30.5235, '12:10', '14:30'), // +1h30m gap
];

// СЦЕНАРИЙ 2: Разрыв времени готовности > 30 мин -> НУЖНО РАЗДЕЛИТЬ
const ordersS2 = [
    createOrder('3', 50.4501, 30.5234, '12:00', '13:00'),
    createOrder('4', 50.4502, 30.5235, '12:40', '13:20'), // +40m gap
];

// СЦЕНАРИЙ 3: Расстояние > 5 км -> НУЖНО РАЗДЕЛИТЬ
const ordersS3 = [
    createOrder('5', 50.4501, 30.5234, '12:00', '13:00'),
    createOrder('6', 50.5501, 30.6234, '12:05', '13:10'), // ~12km away
];

// СЦЕНАРИЙ 4: Разные зоны -> НУЖНО РАЗДЕЛИТЬ
const ordersS4 = [
    createOrder('7', 50.4501, 30.5234, '12:00', '13:00', 'ZONE_A'),
    createOrder('8', 50.4502, 30.5235, '12:05', '13:10', 'ZONE_B'),
];

console.log('--- Running Routing Logic Verification ---');

const verify = (name: string, orders: Order[]) => {
    const groups = groupOrdersByTimeWindow('courier-1', 'Courier Name', orders, 20, 60);
    console.log(`${name}: Groups created = ${groups.length}`);
    if (groups.length >= 2) {
        console.log(` Success: Split correctly into ${groups.length} groups.`);
    } else {
        console.log(` Failure: Groups were incorrectly merged.`);
    }
};

// Примечание: В реальной среде нужен ts-node или аналог.
// Пока это служит документацией логики.
// verify('SLA Constraint', ordersS1);
// verify('Kitchen Gap Constraint', ordersS2);
// verify('Geographic Constraint', ordersS3);
// verify('District Constraint', ordersS4);
