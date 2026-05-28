/**
 * Расчет ETA курьера (предполагаемое время возвращения на базу).
 *
 * Уровни точности:
 *   high   → использует legDurations Google Maps, сохраненные в маршруте
 *   medium → использует геокодированные координаты + расстояние по гаверсинусу + скорость
 *   rough  → использует количество заказов + эвристику скорости
 */

import { robustGeocodingService } from '../../services/robust-geocoding/RobustGeocodingService'
import { GeoPoint } from '../maps/geocodeCache'
import { isOrderCompleted } from '../data/orderStatus'

//  Типы 

export type ETAAccuracy = 'high' | 'medium' | 'rough'

export interface ETAResult {
    time: string
    isRough: boolean
    statusLabel: string
    accuracy: ETAAccuracy
}

// Минимальные формы маршрута/заказа — не зависят от состояния React
export interface ETAOrder {
    address: string
    status?: string
    coords?: GeoPoint
    statusTimings?: { completedAt?: number }
}

export interface ETARoute {
    courier: string
    orders: ETAOrder[]
    totalDuration?: number
    legDurations?: number[]
}

//  Конфигурация скорости 

/** км/ч по типу транспорта */
export function getCourierSpeed(vehicleType: string): number {
    return vehicleType === 'moto' ? 30 : 60
}

//  Расстояние по гаверсинусу 

export function haversineKm(
    p1: GeoPoint,
    p2: GeoPoint
): number {
    const R = 6371
    const dLat = ((p2.lat - p1.lat) * Math.PI) / 180
    const dLon = ((p2.lng - p1.lng) * Math.PI) / 180
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((p1.lat * Math.PI) / 180) *
        Math.cos((p2.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

//  Вспомогательные функции форматирования ETA 

function minToTimeStr(mins: number, refTime?: number): string {
    if (refTime && refTime > 0) {
        const ts = refTime + mins * 60 * 1000
        return new Date(ts).toLocaleTimeString('uk-UA', {
            hour: '2-digit',
            minute: '2-digit',
        })
    }
    const roundedMins = Math.round(mins)
    if (roundedMins < 1) return `Скоро`
    if (roundedMins < 60) return `~ ${roundedMins} мин`
    const h = Math.floor(roundedMins / 60)
    const m = roundedMins % 60
    return `~ ${h} ч ${m} мин`
}

//  Основная функция ETA 

/**
 * Рассчитывает ETA возврата для одного маршрута.
 *
 * @param route  Объект маршрута с заказами и опциональными legDurations
 * @param speed  Средняя скорость в км/ч (по умолчанию 60)
 * @returns      ETAResult или null, если недостаточно данных
 */
export function getReturnETA(
    route: ETARoute,
    speed = 60
): ETAResult | null {
    const orders = route.orders
    if (!orders || orders.length === 0) return null

    let lastCompletedTime = 0
    let lastCompletedIndex = -1
    let lastCoord: GeoPoint | null = null

    orders.forEach((o, i) => {
        const done = isOrderCompleted(o.status)
        if (!done) return

        if (o.statusTimings?.completedAt) {
            if (o.statusTimings.completedAt > lastCompletedTime) {
                lastCompletedTime = o.statusTimings.completedAt
                lastCompletedIndex = i
            }
        } else if (i > lastCompletedIndex) {
            lastCompletedIndex = i
        }

        if (o.coords) lastCoord = o.coords
    })

    let remainingDuration = 0
    let accuracy: ETAAccuracy = 'rough'

    // Уровень 1 — длительность участков Google Maps
    if (route.legDurations && route.legDurations.length > 0) {
        remainingDuration = route.legDurations
            .slice(lastCompletedIndex + 1)
            .reduce((s, d) => s + d, 0)
        accuracy = 'high'
    } else {
        // Уровень 2 — эвристика по координатам
        const remaining = orders.slice(lastCompletedIndex + 1)
        let dist = 0
        let cur: GeoPoint | null = lastCoord
        let hasCoords = !!cur

        for (const order of remaining) {
            if (order.coords && cur) {
                dist += haversineKm(cur, order.coords)
                cur = order.coords
            } else {
                hasCoords = false
                break
            }
        }

        if (hasCoords && dist > 0) {
            // время в пути + 7 мин остановки на заказ
            remainingDuration = (dist / speed) * 60 + remaining.length * 7
            accuracy = 'medium'
        } else if (route.totalDuration && route.totalDuration > 0) {
            // Уровень 3a — линейно от totalDuration
            const ratio = (lastCompletedIndex + 1) / (orders.length + 1)
            remainingDuration = route.totalDuration * (1 - ratio)
            accuracy = 'rough'
        } else {
            // Уровень 3b — чистая эвристика (~2 км на заказ при заданной скорости)
            const remCount = orders.length - (lastCompletedIndex + 1)
            remainingDuration = (remCount * 2 / speed) * 60 + 15
            accuracy = 'rough'
        }
    }

    if (remainingDuration <= 0) return null

    const time = minToTimeStr(remainingDuration, lastCompletedTime)
    const isRough = accuracy !== 'high'
    const statusLabel =
        accuracy === 'high' ? 'МАРШРУТ' : accuracy === 'medium' ? 'БАЗОВЫЙ' : 'ПРИМЕРНО'

    return { time, isRough, statusLabel, accuracy }
}

/**
 * Улучшенная точность по запросу: упрощено до базового ETA, так как Google удален.
 */
export async function getAccurateReturnETA(
    route: ETARoute,
    _defaultBase?: string
): Promise<ETAResult | null> {
    // Логика Google Maps удалена. Используем надежный ETA на основе координат.
    return getReturnETA(route)
}

//  Пакетное геокодирование для возвращающихся курьеров 

/**
 * Для списка маршрутов пакетно геокодирует все некэшированные адреса заказов
 * и возвращает обновленный список маршрутов с заполненными `coords` для каждого заказа.
 *
 * Геокодирует только адреса, которых еще нет в кэше геокодирования или в заказе.
 * Использует batchGeocode(), соблюдающий ограничения скорости.
 */
export async function enrichRoutesWithCoords(
    routes: ETARoute[]
): Promise<ETARoute[]> {
    // Собираем все уникальные адреса, требующие геокодирования
    const needGeocode: string[] = []
    for (const route of routes) {
        for (const order of route.orders) {
            if (!order.coords && order.address) {
                needGeocode.push(order.address)
            }
        }
    }

    if (needGeocode.length === 0) return routes

    const geocodeRequests = needGeocode.map(address => ({ 
        address, 
        options: { silent: true } 
    }));
    
    const coordMap = await robustGeocodingService.batchGeocode(geocodeRequests);
    
    // Применяем результаты к заказам (иммутабельно)
    return routes.map((route) => ({
        ...route,
        orders: route.orders.map((order) => {
            if (order.coords || !order.address) return order
            const key = order.address.trim().toLowerCase();
            const res = coordMap.get(key)
            if (res && res.best) {
                return { 
                    ...order, 
                    coords: { lat: res.best.lat, lng: res.best.lng } 
                }
            }
            return order;
        }),
    }))
}
