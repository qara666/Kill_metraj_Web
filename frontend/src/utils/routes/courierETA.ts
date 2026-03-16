/**
 * Courier ETA (Estimated Time of Arrival back to base) calculation.
 *
 * Accuracy tiers:
 *   high   → uses Google Maps legDurations stored on the route
 *   medium → uses geocoded coordinates + haversine distance + vehicle speed
 *   rough  → uses order count + vehicle speed heuristic
 */

import { batchGeocode, GeoPoint } from '../maps/geocodeCache'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ETAAccuracy = 'high' | 'medium' | 'rough'

export interface ETAResult {
    time: string
    isRough: boolean
    statusLabel: string
    accuracy: ETAAccuracy
}

// Minimal route / order shapes — keep independent of React state
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

// ─── Speed config ─────────────────────────────────────────────────────────────

/** km/h by vehicle type */
export function getCourierSpeed(vehicleType: string): number {
    return vehicleType === 'moto' ? 30 : 60
}

// ─── Haversine distance ───────────────────────────────────────────────────────

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

// ─── ETA formatting helpers ───────────────────────────────────────────────────

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

// ─── Core ETA function ────────────────────────────────────────────────────────

/**
 * Calculate return ETA for a single route.
 *
 * @param route  Route object with orders and optional legDurations
 * @param speed  Average speed in km/h (defaults to 60)
 * @returns      ETAResult or null if not enough data
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
        const done = o.status === 'Исполнен' || o.status === 'Доставлено'
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

    // Tier 1 — Google Maps leg durations
    if (route.legDurations && route.legDurations.length > 0) {
        remainingDuration = route.legDurations
            .slice(lastCompletedIndex + 1)
            .reduce((s, d) => s + d, 0)
        accuracy = 'high'
    } else {
        // Tier 2 — coordinate heuristic
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
            // travel time + 7 min stop per order
            remainingDuration = (dist / speed) * 60 + remaining.length * 7
            accuracy = 'medium'
        } else if (route.totalDuration && route.totalDuration > 0) {
            // Tier 3a — linear from totalDuration
            const ratio = (lastCompletedIndex + 1) / (orders.length + 1)
            remainingDuration = route.totalDuration * (1 - ratio)
            accuracy = 'rough'
        } else {
            // Tier 3b — pure heuristic  (~2 km per order at given speed)
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
 * Enhanced on-demand accuracy: Simplified to use basic ETA as Google is removed.
 */
export async function getAccurateReturnETA(
    route: ETARoute,
    _defaultBase?: string
): Promise<ETAResult | null> {
    // Google Maps logic removed. Falling back to robust coordinate-based ETA.
    return getReturnETA(route)
}

// ─── On-demand batch geocoding for returning couriers ────────────────────────

/**
 * Given a list of routes, geocode all uncached order addresses in batch
 * and return an updated list of routes with `coords` populated on each order.
 *
 * Only geocodes addresses that are not already in the geocode cache or on the order.
 * Uses batchGeocode() which respects rate limits.
 */
export async function enrichRoutesWithCoords(
    routes: ETARoute[]
): Promise<ETARoute[]> {
    // Collect all unique addresses that need geocoding
    const needGeocode: string[] = []
    for (const route of routes) {
        for (const order of route.orders) {
            if (!order.coords && order.address) {
                needGeocode.push(order.address)
            }
        }
    }

    if (needGeocode.length === 0) return routes

    const coordMap = await batchGeocode(needGeocode)

    // Apply results back to orders (immutably)
    return routes.map((route) => ({
        ...route,
        orders: route.orders.map((order) => {
            if (order.coords || !order.address) return order
            const key = order.address.trim().toLowerCase().replace(/\s+/g, ' ')
            const coords = coordMap.get(key)
            return coords ? { ...order, coords } : order
        }),
    }))
}
