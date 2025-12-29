/**
 * Динамическая оптимизация с учетом трафика и батчинг заказов
 */

import type { Order } from './routeOptimization'
import type { OptimizedRoute, OptimizationOptions } from './advancedRouteOptimization'

export interface TrafficData {
  location: { lat: number; lng: number }
  severity: 'low' | 'medium' | 'high' | 'critical'
  delayMinutes: number
  averageSpeed: number
}

export interface CongestionArea {
  location: { lat: number; lng: number }
  radius: number // в км
  severity: 'low' | 'medium' | 'high' | 'critical'
  delayFactor: number // множитель задержки (1.0 = нет задержки, 2.0 = двойное время)
}

export interface TrafficAwareOptions extends OptimizationOptions {
  trafficData?: TrafficData[]
  congestionAreas?: CongestionArea[]
  avoidCongestion?: boolean
  trafficWeight?: number // вес влияния трафика (0-1)
}

export interface OrderBatch {
  orders: Order[]
  batchNumber: number
  earliestReadyAt: number | null
  latestDeadlineAt: number | null
  estimatedStartTime: number
  estimatedEndTime: number
}

/**
 * Вычисляет расстояние между двумя точками
 */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Проверяет, попадает ли точка в зону пробки
 */
function isInCongestionArea(
  location: { lat: number; lng: number },
  congestionAreas: CongestionArea[]
): CongestionArea | null {
  for (const area of congestionAreas) {
    const distance = haversineDistance(
      location.lat,
      location.lng,
      area.location.lat,
      area.location.lng
    )

    if (distance <= area.radius) {
      return area
    }
  }

  return null
}

/**
 * Вычисляет влияние трафика на время пути
 */
function calculateTrafficDelay(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  congestionAreas: CongestionArea[],
  baseDurationMinutes: number
): number {
  let delayMinutes = 0

  // Проверяем начальную точку
  const fromCongestion = isInCongestionArea(from, congestionAreas)
  if (fromCongestion) {
    delayMinutes += baseDurationMinutes * (fromCongestion.delayFactor - 1) * 0.3
  }

  // Проверяем конечную точку
  const toCongestion = isInCongestionArea(to, congestionAreas)
  if (toCongestion) {
    delayMinutes += baseDurationMinutes * (toCongestion.delayFactor - 1) * 0.3
  }

  // Проверяем среднюю точку (приближенная оценка)
  const midPoint = {
    lat: (from.lat + to.lat) / 2,
    lng: (from.lng + to.lng) / 2
  }
  const midCongestion = isInCongestionArea(midPoint, congestionAreas)
  if (midCongestion) {
    delayMinutes += baseDurationMinutes * (midCongestion.delayFactor - 1) * 0.4
  }

  return delayMinutes
}

/**
 * Обновляет время маршрута с учетом трафика
 */
function adjustRouteForTraffic(
  route: OptimizedRoute,
  congestionAreas: CongestionArea[],
  trafficWeight: number = 0.5
): OptimizedRoute {
  if (!congestionAreas || congestionAreas.length === 0) {
    return route
  }

  let totalDelay = 0
  let adjustedDistance = route.totalDistance

  // Вычисляем задержки для каждого сегмента
  for (let i = 0; i < route.orders.length - 1; i++) {
    const from = route.orders[i]
    const to = route.orders[i + 1]

    if (from.coords && to.coords) {
      const baseDuration = (route.totalDuration / route.orders.length) || 2
      const delay = calculateTrafficDelay(
        from.coords,
        to.coords,
        congestionAreas,
        baseDuration
      )

      totalDelay += delay

      // Увеличиваем расстояние при сильных пробках (замедление = увеличенное расстояние)
      const congestion = isInCongestionArea(to.coords, congestionAreas)
      if (congestion && congestion.delayFactor > 1.5) {
        adjustedDistance += route.totalDistance * 0.1 * (congestion.delayFactor - 1)
      }
    }
  }

  const adjustedDuration = route.totalDuration + totalDelay * trafficWeight
  const adjustedScore = route.score + totalDelay * 10 * trafficWeight // штраф за задержки

  return {
    ...route,
    totalDuration: adjustedDuration,
    totalDistance: adjustedDistance,
    score: adjustedScore
  }
}

/**
 * Избегает зон пробок, пересчитывая маршрут
 */
function avoidCongestionAreas(
  orders: Order[],
  congestionAreas: CongestionArea[]
): Order[] {
  if (!congestionAreas || congestionAreas.length === 0) {
    return orders
  }

  const reordered: Order[] = []
  const remaining = [...orders]
  const criticalAreas = congestionAreas.filter(a => a.severity === 'critical' || a.severity === 'high')

  // Сначала размещаем заказы вне критических зон
  const outsideCritical: Order[] = []
  const inCritical: Order[] = []

  for (const order of remaining) {
    if (order.coords) {
      const inCriticalArea = criticalAreas.some(area => {
        const distance = haversineDistance(
          order.coords!.lat,
          order.coords!.lng,
          area.location.lat,
          area.location.lng
        )
        return distance <= area.radius
      })

      if (inCriticalArea) {
        inCritical.push(order)
      } else {
        outsideCritical.push(order)
      }
    } else {
      outsideCritical.push(order)
    }
  }

  // Строим маршрут: сначала вне критических зон, потом в них
  reordered.push(...outsideCritical)
  reordered.push(...inCritical)

  return reordered.length > 0 ? reordered : orders
}

/**
 * Динамическая оптимизация с учетом трафика
 */
export async function optimizeWithTraffic(
  orders: Order[],
  optimizeFn: (orders: Order[], options?: OptimizationOptions) => Promise<OptimizedRoute>,
  options: TrafficAwareOptions = {}
): Promise<OptimizedRoute> {
  const {
    congestionAreas = [],
    avoidCongestion = false,
    trafficWeight = 0.5
  } = options

  // Если нужно избегать пробок, переупорядочиваем заказы
  let optimizedOrders = orders
  if (avoidCongestion && congestionAreas.length > 0) {
    optimizedOrders = avoidCongestionAreas(orders, congestionAreas)
  }

  // Оптимизируем маршрут
  const optimizedRoute = await optimizeFn(optimizedOrders, options)

  // Корректируем с учетом трафика
  if (congestionAreas.length > 0) {
    return adjustRouteForTraffic(optimizedRoute, congestionAreas, trafficWeight)
  }

  return optimizedRoute
}

/**
 * Прогнозирует пробки на момент доставки
 */
export function predictCongestion(
  arrivalTime: number,
  location: { lat: number; lng: number },
  historicalData?: Array<{
    time: number
    location: { lat: number; lng: number }
    congestionLevel: 'low' | 'medium' | 'high' | 'critical'
  }>
): 'low' | 'medium' | 'high' | 'critical' {
  // Базовый прогноз на основе времени суток
  const date = new Date(arrivalTime)
  const hour = date.getHours()

  // Утренний и вечерний пик (7-9, 17-19)
  if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
    return Math.random() > 0.3 ? 'high' : 'medium'
  }

  // Обеденное время (12-14) - средний трафик
  if (hour >= 12 && hour <= 14) {
    return 'medium'
  }

  // Ночь (22-6) - низкий трафик
  if (hour >= 22 || hour <= 6) {
    return 'low'
  }

  // Если есть исторические данные, используем их
  if (historicalData && historicalData.length > 0) {
    const similarTimeData = historicalData.filter(d => {
      const dHour = new Date(d.time).getHours()
      return Math.abs(dHour - hour) <= 1
    })
    
    const nearbyData = similarTimeData.filter(d => {
      const latDiff = Math.abs(d.location.lat - location.lat)
      const lngDiff = Math.abs(d.location.lng - location.lng)
      return latDiff <= 0.1 && lngDiff <= 0.1
    })
    
    const relevantData = nearbyData.length > 0 ? nearbyData : similarTimeData

    if (relevantData.length > 0) {
      const avgSeverity = relevantData.reduce((sum, d) => {
        const severity = d.congestionLevel
        const weight = severity === 'critical' ? 4 : severity === 'high' ? 3 : severity === 'medium' ? 2 : 1
        return sum + weight
      }, 0) / relevantData.length

      if (avgSeverity >= 3.5) return 'critical'
      if (avgSeverity >= 2.5) return 'high'
      if (avgSeverity >= 1.5) return 'medium'
      return 'low'
    }
  }

  return 'low'
}

/**
 * Батчинг заказов - группировка по временным окнам
 */
export interface BatchingOptions {
  batchSize?: number // Максимальное количество заказов в батче
  timeWindowMinutes?: number // Временное окно для батча (минуты)
  prioritizeDeadlines?: boolean // Приоритизировать заказы с дедлайнами
  maxBatchDuration?: number // Максимальная длительность батча (минуты)
}

export function batchOrdersByTime(
  orders: Order[],
  options: BatchingOptions = {}
): OrderBatch[] {
  const {
    batchSize = 10,
    timeWindowMinutes = 60,
    prioritizeDeadlines = true,
    maxBatchDuration = 120
  } = options

  if (orders.length === 0) return []

  // Сортируем заказы по приоритету
  const sortedOrders = [...orders].sort((a, b) => {
    if (prioritizeDeadlines) {
      // Сначала заказы с дедлайнами (по времени дедлайна)
      if (a.deadlineAt && b.deadlineAt) {
        return a.deadlineAt - b.deadlineAt
      }
      if (a.deadlineAt) return -1
      if (b.deadlineAt) return 1
    }

    // Затем по времени готовности
    if (a.readyAt && b.readyAt) {
      return a.readyAt - b.readyAt
    }
    if (a.readyAt) return -1
    if (b.readyAt) return 1

    return 0
  })

  const batches: OrderBatch[] = []
  const used = new Set<number | string>()
  let batchNumber = 1

  for (const order of sortedOrders) {
    if (used.has(order.orderNumber)) continue

    const batch: Order[] = [order]
    used.add(order.orderNumber)

    const orderReadyTime = order.readyAt || Date.now()
    const orderDeadline = order.deadlineAt

    // Ищем заказы для того же батча
    for (const candidate of sortedOrders) {
      if (used.has(candidate.orderNumber) || batch.length >= batchSize) break

      const candidateReadyTime = candidate.readyAt || Date.now()
      const candidateDeadline = candidate.deadlineAt

      // Проверяем временное окно
      const readyTimeDiff = Math.abs(candidateReadyTime - orderReadyTime) / (60 * 1000)
      
      if (readyTimeDiff <= timeWindowMinutes) {
        // Проверяем совместимость дедлайнов
        let compatible = true

        if (orderDeadline && candidateDeadline) {
          const deadlineDiff = Math.abs(candidateDeadline - orderDeadline) / (60 * 1000)
          if (deadlineDiff > timeWindowMinutes * 2) {
            compatible = false
          }
        }

        if (compatible) {
          batch.push(candidate)
          used.add(candidate.orderNumber)
        }
      }
    }

    // Вычисляем временные параметры батча
    const readyTimes = batch.map(o => o.readyAt).filter(Boolean) as number[]
    const deadlineTimes = batch.map(o => o.deadlineAt).filter(Boolean) as number[]

    const earliestReady = readyTimes.length > 0 ? Math.min(...readyTimes) : Date.now()
    const latestDeadline = deadlineTimes.length > 0 ? Math.max(...deadlineTimes) : null

    // Оцениваем время выполнения батча (приблизительно)
    const estimatedDuration = batch.length * 15 + (batch.length - 1) * 10 // 15 мин на заказ + 10 мин между
    const estimatedStartTime = earliestReady
    const estimatedEndTime = estimatedStartTime + estimatedDuration * 60 * 1000

    // Проверяем ограничение по длительности
    if (!maxBatchDuration || estimatedDuration <= maxBatchDuration) {
      batches.push({
        orders: batch,
        batchNumber: batchNumber++,
        earliestReadyAt: readyTimes.length > 0 ? earliestReady : null,
        latestDeadlineAt: latestDeadline,
        estimatedStartTime,
        estimatedEndTime
      })
    } else {
      // Если батч слишком большой, разбиваем его
      const subBatches = splitLargeBatch(batch, maxBatchDuration)
      for (const subBatch of subBatches) {
        const subReadyTimes = subBatch.map(o => o.readyAt).filter(Boolean) as number[]
        const subDeadlineTimes = subBatch.map(o => o.deadlineAt).filter(Boolean) as number[]
        const subEarliestReady = subReadyTimes.length > 0 ? Math.min(...subReadyTimes) : Date.now()
        const subLatestDeadline = subDeadlineTimes.length > 0 ? Math.max(...subDeadlineTimes) : null
        const subDuration = subBatch.length * 15 + (subBatch.length - 1) * 10
        const subStartTime = subEarliestReady
        const subEndTime = subStartTime + subDuration * 60 * 1000

        batches.push({
          orders: subBatch,
          batchNumber: batchNumber++,
          earliestReadyAt: subReadyTimes.length > 0 ? subEarliestReady : null,
          latestDeadlineAt: subLatestDeadline,
          estimatedStartTime: subStartTime,
          estimatedEndTime: subEndTime
        })
      }
    }
  }

  return batches
}

/**
 * Разбивает большой батч на несколько меньших
 */
function splitLargeBatch(
  orders: Order[],
  maxDuration: number
): Order[][] {
  const maxOrdersPerBatch = Math.floor(maxDuration / 15) // 15 минут на заказ
  
  if (orders.length <= maxOrdersPerBatch) {
    return [orders]
  }

  const batches: Order[][] = []
  for (let i = 0; i < orders.length; i += maxOrdersPerBatch) {
    batches.push(orders.slice(i, i + maxOrdersPerBatch))
  }

  return batches
}

/**
 * Создает оптимальные батчи с учетом ограничений
 */
export function createOptimalBatches(
  orders: Order[],
  constraints: {
    maxBatchSize?: number
    maxBatchDuration?: number
    timeWindow?: number
    courierCapacity?: number
  }
): OrderBatch[] {
  return batchOrdersByTime(orders, {
    batchSize: constraints.maxBatchSize || 10,
    maxBatchDuration: constraints.maxBatchDuration || 120,
    timeWindowMinutes: constraints.timeWindow || 60,
    prioritizeDeadlines: true
  })
}

