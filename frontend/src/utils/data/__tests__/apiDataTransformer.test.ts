import { describe, it, expect } from 'vitest';
import { transformDashboardData, formatDateForApi, formatDateTimeForApi } from '../apiDataTransformer';
import { DashboardApiResponse } from '../../../types/DashboardApiTypes';

describe('apiDataTransformer', () => {
    describe('formatDateForApi', () => {
        it('should format date correctly', () => {
            const date = new Date(2026, 0, 5); // January 5, 2026
            expect(formatDateForApi(date)).toBe('05.01.2026');
        });

        it('should pad single digits', () => {
            const date = new Date(2026, 8, 9); // September 9, 2026
            expect(formatDateForApi(date)).toBe('09.09.2026');
        });
    });

    describe('formatDateTimeForApi', () => {
        it('should format datetime correctly', () => {
            const date = new Date(2026, 0, 5, 14, 30, 45); // January 5, 2026 14:30:45
            expect(formatDateTimeForApi(date)).toBe('05.01.2026 14:30:45');
        });

        it('should pad single digits in time', () => {
            const date = new Date(2026, 0, 5, 9, 5, 3); // January 5, 2026 09:05:03
            expect(formatDateTimeForApi(date)).toBe('05.01.2026 09:05:03');
        });
    });

    describe('transformDashboardData', () => {
        it('should transform valid Dashboard response', () => {
            const apiResponse: DashboardApiResponse = {
                orders: [
                    {
                        orderNumber: '1033851',
                        address: 'вул. Юрія Кондратюка 1',
                        status: 'Собран',
                        courier: 'Куденко Валерія',
                        amount: 679.00,
                        paymentMethod: 'ГЛОВО Го',
                        kitchenTime: '13:00',
                        deliverBy: '14:00',
                        plannedTime: '14:47',
                        deliveryZone: 'Зона 3.5',
                        deliveryTime: '42мин.',
                        changeAmount: 321.00,
                        orderComment: 'GLOVO:10148',
                        orderType: 'Доставка',
                        creationDate: '11.11.2025 13:34',
                        totalTime: '1ч. 12мин.',
                    },
                ],
                couriers: [
                    {
                        name: 'Куденко Валерія',
                        isActive: true,
                        vehicleType: 'car',
                    },
                ],
            };

            const result = transformDashboardData(apiResponse, '05.01.2026');

            expect(result.orders).toHaveLength(1);
            expect(result.couriers).toHaveLength(1);
            expect(result.orders[0].orderNumber).toBe('1033851');
            expect(result.orders[0].address).toBe('вул. Юрія Кондратюка 1');
            expect(result.orders[0].courier).toBe('Куденко Валерія');
            expect(result.couriers[0].name).toBe('Куденко Валерія');
            expect(result.couriers[0].vehicleType).toBe('car');
        });

        it('should parse time correctly', () => {
            const apiResponse: DashboardApiResponse = {
                orders: [
                    {
                        orderNumber: '123',
                        address: 'Test Address',
                        status: 'Готов',
                        courier: 'Test Courier',
                        amount: 100,
                        paymentMethod: 'Наличные',
                        kitchenTime: '13:00',
                        deliverBy: '14:00',
                        plannedTime: '14:30',
                        deliveryZone: 'Зона 1',
                        deliveryTime: '30мин.',
                        changeAmount: 0,
                        orderComment: '',
                        orderType: 'Доставка',
                        creationDate: '05.01.2026 12:00',
                        totalTime: '1ч.',
                    },
                ],
                couriers: [],
            };

            const result = transformDashboardData(apiResponse, '05.01.2026');
            const order = result.orders[0];

            // Проверка что времена были распарсены
            expect(order.readyAtSource).toBeTruthy();
            expect(order.deadlineAt).toBeTruthy();
            expect(order.plannedTime).toBeTruthy();

            // Проверка корректности timestamp (13:00 на 05.01.2026)
            const expectedReadyAt = new Date(2026, 0, 5, 13, 0, 0, 0).getTime();
            expect(order.readyAtSource).toBe(expectedReadyAt);
        });

        it('should handle errors gracefully', () => {
            const apiResponse: DashboardApiResponse = {
                orders: [
                    {
                        orderNumber: '123',
                        address: 'Valid Address',
                        status: 'Готов',
                        courier: 'Test',
                        amount: 100,
                        paymentMethod: 'Cash',
                        kitchenTime: '13:00',
                        deliverBy: '14:00',
                        plannedTime: '14:30',
                        deliveryZone: 'Zone 1',
                        deliveryTime: '30min',
                        changeAmount: 0,
                        orderComment: '',
                        orderType: 'Delivery',
                        creationDate: '05.01.2026 12:00',
                        totalTime: '1h',
                    },
                ],
                couriers: [],
            };

            const result = transformDashboardData(apiResponse, '05.01.2026');

            expect(result.orders).toHaveLength(1);
            expect(result.errors).toHaveLength(0);
            expect(result.summary.orders).toBe(1);
        });

        it('should handle missing optional fields', () => {
            const apiResponse: DashboardApiResponse = {
                orders: [
                    {
                        orderNumber: '123',
                        address: 'Test',
                        status: 'Ready',
                        courier: 'Courier',
                        amount: 100,
                        paymentMethod: 'Cash',
                        kitchenTime: '',
                        deliverBy: '',
                        plannedTime: '',
                        deliveryZone: '',
                        deliveryTime: '',
                        changeAmount: 0,
                        orderComment: '',
                        orderType: 'Delivery',
                        creationDate: '',
                        totalTime: '',
                    },
                ],
                couriers: [],
            };

            const result = transformDashboardData(apiResponse, '05.01.2026');

            expect(result.orders).toHaveLength(1);
            expect(result.orders[0].readyAtSource).toBeNull();
            expect(result.orders[0].deadlineAt).toBeNull();
        });
    });
});
