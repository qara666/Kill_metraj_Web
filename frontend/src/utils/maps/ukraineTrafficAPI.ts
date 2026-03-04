/**
 * Комбинированная утилита для получения данных о трафике в Украине/Киеве
 * Использует Mapbox как основной источник, с fallback на исторические данные
 */

import {
  getMapboxTraffic,
  getTrafficSeverity,
  calculateTrafficDelay
} from './mapboxTrafficAPI'
import type { Order, Coordinates } from '../routes/routeOptimizationHelpers'

export interface UkraineTrafficInfo {
  severity: 'low' | 'medium' | 'high' | 'critical'
  delayMinutes: number
  currentSpeed: number
  freeFlowSpeed: number
  congestion: number // 0-100
  confidence: number // 0-1
  source: 'mapbox' | 'historical' | 'estimated'
  query?: string // Placeholder to prevent undefined errors
}

// Кэш для исторических данных о трафике
const historicalTrafficCache = new Map<string, {
  averageSpeed: number
  typicalCongestion: number
  timestamp: number
}>()

const HISTORICAL_CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 дней

/**
 * Получает исторические данные о трафике для координат
 */
function getHistoricalTraffic(
  lat: number,
  lng: number,
  hour: number,
  dayOfWeek: number
): UkraineTrafficInfo | null {
  // Ключ для кэша: округленные координаты + час + день недели
  const key = `${Math.round(lat * 10)},${Math.round(lng * 10)},${hour},${dayOfWeek}`

  const cached = historicalTrafficCache.get(key)
  if (cached) {
    const now = Date.now()
    if (now - cached.timestamp < HISTORICAL_CACHE_TTL) {
      return {
        severity: getTrafficSeverity(cached.typicalCongestion),
        delayMinutes: (cached.typicalCongestion / 100) * 5, // примерная задержка
        currentSpeed: cached.averageSpeed,
        freeFlowSpeed: 60,
        congestion: cached.typicalCongestion,
        confidence: 0.6,
        source: 'historical'
      }
    }
  }

  return null
}

/**
 * Сохраняет данные о трафике для будущего использования
 */
export function saveTrafficPattern(
  lat: number,
  lng: number,
  timestamp: number,
  congestion: number,
  speed: number
) {
  const date = new Date(timestamp)
  const hour = date.getHours()
  const dayOfWeek = date.getDay()
  const key = `${Math.round(lat * 10)},${Math.round(lng * 10)},${hour},${dayOfWeek}`

  historicalTrafficCache.set(key, {
    averageSpeed: speed,
    typicalCongestion: congestion,
    timestamp: Date.now()
  })

  // Очистка старых записей
  if (historicalTrafficCache.size > 1000) {
    const now = Date.now()
    Array.from(historicalTrafficCache.entries()).forEach(([k, v]) => {
      if (now - v.timestamp > HISTORICAL_CACHE_TTL) {
        historicalTrafficCache.delete(k)
      }
    })
  }
}

/**
 * Получает данные о трафике для маршрута (массив координат)
 */
export async function getUkraineTrafficForRoute(
  coordinates: Array<[number, number]>, // [lng, lat]
  mapboxToken: string,
  options: {
    fallbackToHistorical?: boolean
  } = {}
): Promise<UkraineTrafficInfo[]> {
  const results: UkraineTrafficInfo[] = []

  // Приоритет 1: Mapbox (реальное время)
  try {
    const mapboxData = await getMapboxTraffic(coordinates, mapboxToken)

    if (mapboxData.length > 0) {
      const now = Date.now()

      return mapboxData.map((data) => {
        const severity = getTrafficSeverity(data.congestion)
        const delayMinutes = calculateTrafficDelay(data.congestion, data.duration)

        // Сохраняем данные для исторического анализа
        if (data.coordinates && data.coordinates.length > 0) {
          const midPoint = data.coordinates[Math.floor(data.coordinates.length / 2)]
          if (midPoint) {
            saveTrafficPattern(midPoint[1], midPoint[0], now, data.congestion, data.speed)
          }
        }

        return {
          severity,
          delayMinutes,
          currentSpeed: data.speed,
          freeFlowSpeed: 60,
          congestion: data.congestion,
          confidence: 0.8,
          source: 'mapbox'
        }
      })
    }
  } catch (error) {
    console.warn('Mapbox Traffic failed, trying historical data...', error)
  }

  // Приоритет 2: Исторические данные (fallback)
  if (options.fallbackToHistorical !== false) {
    const now = Date.now()
    const hour = new Date(now).getHours()
    const dayOfWeek = new Date(now).getDay()

    for (let i = 0; i < coordinates.length - 1; i++) {
      const [lng, lat] = coordinates[i]
      const historical = getHistoricalTraffic(lat, lng, hour, dayOfWeek)

      if (historical) {
        results.push(historical)
      } else {
        // Fallback: оценка на основе времени суток
        const estimatedCongestion = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)
          ? 50 // час пик
          : hour >= 22 || hour <= 6
            ? 10 // ночь
            : 30 // обычное время

        results.push({
          severity: getTrafficSeverity(estimatedCongestion),
          delayMinutes: (estimatedCongestion / 100) * 3,
          currentSpeed: 60 - (estimatedCongestion / 100) * 30,
          freeFlowSpeed: 60,
          congestion: estimatedCongestion,
          confidence: 0.4,
          source: 'estimated'
        })
      }
    }
  }

  return results
}

/**
 * Получает данные о трафике для одного сегмента маршрута
 */
export async function getUkraineTrafficForSegment(
  from: Coordinates,
  to: Coordinates,
  mapboxToken: string
): Promise<UkraineTrafficInfo | null> {
  const coordinates: Array<[number, number]> = [
    [from.lng, from.lat],
    [to.lng, to.lat]
  ]

  const results = await getUkraineTrafficForRoute(coordinates, mapboxToken)
  return results.length > 0 ? results[0] : null
}

/**
 * Получает данные о трафике для маршрута из заказов
 */
export async function getUkraineTrafficForOrders(
  orders: Order[],
  mapboxToken: string
): Promise<UkraineTrafficInfo[]> {
  if (!orders || orders.length < 2) {
    return []
  }

  // Фильтруем заказы с координатами
  const ordersWithCoords = orders.filter(o => o.coords)
  if (ordersWithCoords.length < 2) {
    return []
  }

  // Формируем массив координат [lng, lat]
  const coordinates: Array<[number, number]> = ordersWithCoords.map(o => [
    o.coords!.lng,
    o.coords!.lat
  ])

  return await getUkraineTrafficForRoute(coordinates, mapboxToken, {
    fallbackToHistorical: true
  })
}

/**
 * Вычисляет общую задержку маршрута из-за пробок
 */
export function calculateTotalTrafficDelay(trafficInfo: UkraineTrafficInfo[]): number {
  return trafficInfo.reduce((sum, info) => sum + info.delayMinutes, 0)
}

/**
 * Определяет, есть ли критические пробки на маршруте
 */
export function hasCriticalTraffic(trafficInfo: UkraineTrafficInfo[]): boolean {
  return trafficInfo.some(info => info.severity === 'critical' || info.severity === 'high')
}

