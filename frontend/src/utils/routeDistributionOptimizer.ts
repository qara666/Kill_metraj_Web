// Расширенная система оптимизации распределения маршрутов

import type { Order } from './routeOptimizationHelpers'
import { calculateRouteEfficiencyMetrics, type RouteEfficiencyMetrics } from './routeEfficiency'

// ============================================================================
// ИНТЕРФЕЙСЫ И ТИПЫ
// ============================================================================

export interface RouteAnalysis {
  route: any
  orders: Order[]
  loadScore: number // Оценка загрузки (0-1)
  distanceScore: number // Оценка расстояния (0-1)
  timeScore: number // Оценка времени (0-1)
  efficiencyScore: number // Общая оценка эффективности (0-1)
  zoneDistribution: Map<string, number> // Распределение по зонам
  readyTimeSpread: number // Разброс времени готовности (минуты)
  priorityScore: number // Средний приоритет заказов
}

export interface DistributionAnalysis {
  routes: RouteAnalysis[]
  avgLoad: number
  loadVariance: number
  loadStdDev: number
  overloadedRoutes: RouteAnalysis[]
  underloadedRoutes: RouteAnalysis[]
  balancedRoutes: RouteAnalysis[]
  totalEfficiency: number
  improvementPotential: number // Потенциал улучшения (0-1)
}

export interface OptimizationStrategy {
  name: string
  description: string
  apply: (analysis: DistributionAnalysis, checkRoute: RouteChecker) => Promise<OptimizationResult>
  priority: number // Приоритет стратегии (чем выше, тем важнее)
}

export interface OptimizationResult {
  success: boolean
  improvedRoutes: any[]
  metrics: RouteEfficiencyMetrics
  changes: OptimizationChange[]
  improvementScore: number // Насколько улучшилось (0-1)
  message: string
}

export interface OptimizationChange {
  type: 'move' | 'swap' | 'split' | 'merge'
  fromRouteId: string
  toRouteId: string
  ordersMoved: string[] // Номера заказов
  reason: string
  impact: number // Влияние на эффективность (0-1)
}

export type RouteChecker = (orders: Order[]) => Promise<{
  feasible: boolean
  totalDistance?: number
  totalDuration?: number
  legs?: any[]
}>

// ============================================================================
// АНАЛИЗ РАСПРЕДЕЛЕНИЯ
// ============================================================================

/**
 * Анализирует текущее распределение маршрутов
 */
export const analyzeDistribution = (routes: any[]): DistributionAnalysis => {
  if (!routes || routes.length === 0) {
    return {
      routes: [],
      avgLoad: 0,
      loadVariance: 0,
      loadStdDev: 0,
      overloadedRoutes: [],
      underloadedRoutes: [],
      balancedRoutes: [],
      totalEfficiency: 0,
      improvementPotential: 0
    }
  }

  // Анализируем каждый маршрут
  const routeAnalyses: RouteAnalysis[] = routes.map(route => analyzeRoute(route))

  // Вычисляем статистику нагрузки
  const loads = routeAnalyses.map(r => r.orders.length)
  const avgLoad = loads.reduce((sum, l) => sum + l, 0) / loads.length
  const loadVariance = loads.reduce((sum, l) => sum + Math.pow(l - avgLoad, 2), 0) / loads.length
  const loadStdDev = Math.sqrt(loadVariance)

  // Классифицируем маршруты
  const threshold = avgLoad * 0.15 // 15% отклонение
  const overloadedRoutes = routeAnalyses.filter(r => r.orders.length > avgLoad + threshold)
  const underloadedRoutes = routeAnalyses.filter(r => r.orders.length < avgLoad - threshold)
  const balancedRoutes = routeAnalyses.filter(r => 
    r.orders.length >= avgLoad - threshold && r.orders.length <= avgLoad + threshold
  )

  // Вычисляем общую эффективность
  const totalEfficiency = routeAnalyses.reduce((sum, r) => sum + r.efficiencyScore, 0) / routeAnalyses.length

  // Оцениваем потенциал улучшения
  const improvementPotential = Math.min(1, (loadStdDev / Math.max(avgLoad, 1)) * 2)

  return {
    routes: routeAnalyses,
    avgLoad,
    loadVariance,
    loadStdDev,
    overloadedRoutes,
    underloadedRoutes,
    balancedRoutes,
    totalEfficiency,
    improvementPotential
  }
}

/**
 * Анализирует отдельный маршрут
 */
const analyzeRoute = (route: any): RouteAnalysis => {
  const orders = route.routeChainFull || []
  
  // Оценка загрузки (нормализованная)
  const maxExpectedLoad = 15 // Максимальное ожидаемое количество заказов
  const loadScore = Math.min(1, orders.length / maxExpectedLoad)

  // Оценка расстояния
  const totalDistance = route.totalDistance || 0
  const distancePerOrder = orders.length > 0 ? totalDistance / orders.length : 0
  const optimalDistancePerOrder = 10000 // Оптимальное расстояние на заказ (10 км)
  const distanceScore = Math.max(0, 1 - (distancePerOrder - optimalDistancePerOrder) / optimalDistancePerOrder)

  // Оценка времени
  const totalDuration = route.totalDuration || 0
  const durationPerOrder = orders.length > 0 ? totalDuration / orders.length : 0
  const optimalDurationPerOrder = 900000 // Оптимальное время на заказ (15 минут)
  const timeScore = Math.max(0, 1 - (durationPerOrder - optimalDurationPerOrder) / optimalDurationPerOrder)

  // Распределение по зонам
  const zoneDistribution = new Map<string, number>()
  orders.forEach((order: Order) => {
    const zone = order.deliveryZone || order.raw?.deliveryZone || order.raw?.['Зона доставки'] || 'Не указана'
    zoneDistribution.set(zone, (zoneDistribution.get(zone) || 0) + 1)
  })

  // Разброс времени готовности
  const readyTimes = orders
    .map((o: Order) => o.readyAtSource || o.readyAt || Date.now())
    .filter((t: number) => t > 0)
  const readyTimeSpread = readyTimes.length > 1
    ? (Math.max(...readyTimes) - Math.min(...readyTimes)) / (1000 * 60) // в минутах
    : 0

  // Средний приоритет заказов
  const priorities = orders.map((o: Order) => o._priority || 0).filter((p: number) => p > 0)
  const priorityScore = priorities.length > 0
    ? priorities.reduce((sum: number, p: number) => sum + p, 0) / priorities.length / 100
    : 0.5

  // Общая оценка эффективности
  const efficiencyScore = (
    loadScore * 0.25 +
    distanceScore * 0.3 +
    timeScore * 0.25 +
    (1 - Math.min(1, readyTimeSpread / 60)) * 0.1 + // Чем меньше разброс, тем лучше
    priorityScore * 0.1
  )

  return {
    route,
    orders,
    loadScore,
    distanceScore,
    timeScore,
    efficiencyScore,
    zoneDistribution,
    readyTimeSpread,
    priorityScore
  }
}

// ============================================================================
// СТРАТЕГИИ ОПТИМИЗАЦИИ
// ============================================================================

/**
 * Стратегия 1: Перераспределение заказов между перегруженными и недогруженными маршрутами
 */
const rebalanceLoadStrategy: OptimizationStrategy = {
  name: 'Перебалансировка нагрузки',
  description: 'Перемещает заказы из перегруженных маршрутов в недогруженные',
  priority: 10,
  apply: async (analysis, checkRoute) => {
    const changes: OptimizationChange[] = []
    const improvedRoutes = analysis.routes.map(r => ({ ...r.route }))

    // Сортируем перегруженные маршруты по убыванию нагрузки
    const sortedOverloaded = [...analysis.overloadedRoutes].sort((a, b) => 
      b.orders.length - a.orders.length
    )

    // Сортируем недогруженные маршруты по возрастанию нагрузки
    const sortedUnderloaded = [...analysis.underloadedRoutes].sort((a, b) => 
      a.orders.length - b.orders.length
    )

    for (const overloaded of sortedOverloaded) {
      if (sortedUnderloaded.length === 0) break

      const ordersToMove = selectOrdersToMove(overloaded.orders, analysis.avgLoad - overloaded.orders.length)
      if (ordersToMove.length === 0) continue

      // Ищем лучший целевой маршрут
      let bestTarget: RouteAnalysis | null = null
      let bestScore = -Infinity

      for (const underloaded of sortedUnderloaded) {
        const compatibilityScore = calculateCompatibilityScore(
          underloaded.orders,
          ordersToMove,
          analysis.avgLoad
        )

        if (compatibilityScore > bestScore) {
          bestScore = compatibilityScore
          bestTarget = underloaded
        }
      }

      if (bestTarget && bestScore > 0.5) {
        // Проверяем feasibility нового маршрута
        const targetOrders = [...bestTarget.orders, ...ordersToMove]
        const check = await checkRoute(targetOrders)
        
        if (check.feasible) {
          // Обновляем маршруты
          const overloadedIdx = improvedRoutes.findIndex(r => r.id === overloaded.route.id)
          const targetIdx = improvedRoutes.findIndex(r => r.id === bestTarget!.route.id)

          if (overloadedIdx !== -1 && targetIdx !== -1) {
            const remainingOrders = overloaded.orders.filter(o => 
              !ordersToMove.some(m => getOrderId(m) === getOrderId(o))
            )

            // Проверяем feasibility оставшихся заказов
            const remainingCheck = await checkRoute(remainingOrders)
            if (remainingCheck.feasible) {
              // Обновляем перегруженный маршрут
              improvedRoutes[overloadedIdx] = updateRouteFromOrders(
                overloaded.route,
                remainingOrders,
                remainingCheck
              )

              // Обновляем целевой маршрут
              improvedRoutes[targetIdx] = updateRouteFromOrders(
                bestTarget!.route,
                targetOrders,
                check
              )

              changes.push({
                type: 'move',
                fromRouteId: overloaded.route.id,
                toRouteId: bestTarget!.route.id,
                ordersMoved: ordersToMove.map(o => o.orderNumber || o.raw?.orderNumber || '?'),
                reason: `Перебалансировка: перемещено ${ordersToMove.length} заказов из перегруженного маршрута`,
                impact: bestScore
              })

              // Удаляем из списка недогруженных, если стал сбалансированным
              const newLoad = targetOrders.length
              if (newLoad >= analysis.avgLoad - analysis.avgLoad * 0.15) {
                const idx = sortedUnderloaded.findIndex(r => r.route.id === bestTarget!.route.id)
                if (idx !== -1) sortedUnderloaded.splice(idx, 1)
              }
            }
          }
        }
      }
    }

    const metrics = calculateRouteEfficiencyMetrics(improvedRoutes)
    const improvementScore = calculateImprovementScore(analysis, metrics)

    return {
      success: changes.length > 0,
      improvedRoutes,
      metrics,
      changes,
      improvementScore,
      message: changes.length > 0
        ? `Перебалансировано ${changes.length} маршрутов, перемещено ${changes.reduce((sum, c) => sum + c.ordersMoved.length, 0)} заказов`
        : 'Не удалось найти улучшений для перебалансировки'
    }
  }
}

/**
 * Стратегия 2: Оптимизация по зонам доставки
 */
const optimizeByZonesStrategy: OptimizationStrategy = {
  name: 'Оптимизация по зонам',
  description: 'Группирует заказы из одной зоны в один маршрут',
  priority: 8,
  apply: async (analysis, checkRoute) => {
    const changes: OptimizationChange[] = []
    const improvedRoutes = analysis.routes.map(r => ({ ...r.route }))

    // Собираем все заказы по зонам
    const zoneOrders = new Map<string, Order[]>()
    analysis.routes.forEach(routeAnalysis => {
      routeAnalysis.orders.forEach(order => {
        const zone = order.deliveryZone || order.raw?.deliveryZone || order.raw?.['Зона доставки'] || 'Не указана'
        if (!zoneOrders.has(zone)) {
          zoneOrders.set(zone, [])
        }
        zoneOrders.get(zone)!.push(order)
      })
    })

    // Находим зоны, которые разбросаны по нескольким маршрутам
    const fragmentedZones = new Map<string, RouteAnalysis[]>()
    analysis.routes.forEach(routeAnalysis => {
      routeAnalysis.zoneDistribution.forEach((count, zone) => {
        if (count > 0 && count < routeAnalysis.orders.length) {
          // Зона частично представлена в маршруте
          if (!fragmentedZones.has(zone)) {
            fragmentedZones.set(zone, [])
          }
          fragmentedZones.get(zone)!.push(routeAnalysis)
        }
      })
    })

    // Пытаемся консолидировать зоны
    for (const [zone, routesWithZone] of fragmentedZones.entries()) {
      if (routesWithZone.length < 2) continue

      const allZoneOrders = zoneOrders.get(zone) || []
      if (allZoneOrders.length === 0) continue

      // Находим маршрут с наибольшим количеством заказов из этой зоны
      const bestRoute = routesWithZone.reduce((best, current) => {
        const bestCount = best.zoneDistribution.get(zone) || 0
        const currentCount = current.zoneDistribution.get(zone) || 0
        return currentCount > bestCount ? current : best
      })

      // Перемещаем заказы из других маршрутов в лучший
      for (const sourceRoute of routesWithZone) {
        if (sourceRoute.route.id === bestRoute.route.id) continue

        const ordersToMove = sourceRoute.orders.filter(o => {
          const orderZone = o.deliveryZone || o.raw?.deliveryZone || o.raw?.['Зона доставки'] || 'Не указана'
          return orderZone === zone
        })

        if (ordersToMove.length === 0) continue

        const targetOrders = [...bestRoute.orders, ...ordersToMove]
        const check = await checkRoute(targetOrders)

        if (check.feasible) {
          const remainingOrders = sourceRoute.orders.filter(o => 
            !ordersToMove.some(m => getOrderId(m) === getOrderId(o))
          )

          const remainingCheck = await checkRoute(remainingOrders)
          if (remainingCheck.feasible && remainingOrders.length > 0) {
            const sourceIdx = improvedRoutes.findIndex(r => r.id === sourceRoute.route.id)
            const targetIdx = improvedRoutes.findIndex(r => r.id === bestRoute.route.id)

            if (sourceIdx !== -1 && targetIdx !== -1) {
              improvedRoutes[sourceIdx] = updateRouteFromOrders(
                sourceRoute.route,
                remainingOrders,
                remainingCheck
              )

              improvedRoutes[targetIdx] = updateRouteFromOrders(
                bestRoute.route,
                targetOrders,
                check
              )

              changes.push({
                type: 'move',
                fromRouteId: sourceRoute.route.id,
                toRouteId: bestRoute.route.id,
                ordersMoved: ordersToMove.map(o => o.orderNumber || o.raw?.orderNumber || '?'),
                reason: `Консолидация зоны "${zone}": перемещено ${ordersToMove.length} заказов`,
                impact: 0.7
              })
            }
          }
        }
      }
    }

    const metrics = calculateRouteEfficiencyMetrics(improvedRoutes)
    const improvementScore = calculateImprovementScore(analysis, metrics)

    return {
      success: changes.length > 0,
      improvedRoutes,
      metrics,
      changes,
      improvementScore,
      message: changes.length > 0
        ? `Оптимизировано ${changes.length} маршрутов по зонам доставки`
        : 'Не удалось найти улучшений по зонам'
    }
  }
}

/**
 * Стратегия 3: Оптимизация по времени готовности
 */
const optimizeByReadyTimeStrategy: OptimizationStrategy = {
  name: 'Оптимизация по времени готовности',
  description: 'Группирует заказы с близким временем готовности',
  priority: 7,
  apply: async (analysis, checkRoute) => {
    const changes: OptimizationChange[] = []
    const improvedRoutes = analysis.routes.map(r => ({ ...r.route }))

    // Находим маршруты с большим разбросом времени готовности
    const routesWithLargeSpread = analysis.routes.filter(r => r.readyTimeSpread > 60) // > 60 минут

    for (const routeAnalysis of routesWithLargeSpread) {
      // Группируем заказы по окнам готовности (30 минут)
      const timeWindows = groupOrdersByTimeWindows(routeAnalysis.orders, 30)

      if (timeWindows.length < 2) continue

      // Находим самое большое окно (основная группа)
      const mainWindow = timeWindows.reduce((max, current) => 
        current.length > max.length ? current : max
      )

      // Перемещаем заказы из других окон в другие маршруты с похожим временем
      for (const window of timeWindows) {
        if (window === mainWindow) continue

        const windowReadyTime = getAverageReadyTime(window)
        
        // Ищем маршрут с похожим временем готовности
        const compatibleRoute = analysis.routes.find(r => {
          if (r.route.id === routeAnalysis.route.id) return false
          const rReadyTime = getAverageReadyTime(r.orders)
          return Math.abs(rReadyTime - windowReadyTime) < 30 * 60 * 1000 // 30 минут
        })

        if (compatibleRoute) {
          const targetOrders = [...compatibleRoute.orders, ...window]
          const check = await checkRoute(targetOrders)

          if (check.feasible) {
            const remainingOrders = routeAnalysis.orders.filter(o => 
              !window.some(w => getOrderId(w) === getOrderId(o))
            )

            const remainingCheck = await checkRoute(remainingOrders)
            if (remainingCheck.feasible && remainingOrders.length > 0) {
              const sourceIdx = improvedRoutes.findIndex(r => r.id === routeAnalysis.route.id)
              const targetIdx = improvedRoutes.findIndex(r => r.id === compatibleRoute.route.id)

              if (sourceIdx !== -1 && targetIdx !== -1) {
                improvedRoutes[sourceIdx] = updateRouteFromOrders(
                  routeAnalysis.route,
                  remainingOrders,
                  remainingCheck
                )

                improvedRoutes[targetIdx] = updateRouteFromOrders(
                  compatibleRoute.route,
                  targetOrders,
                  check
                )

                changes.push({
                  type: 'move',
                  fromRouteId: routeAnalysis.route.id,
                  toRouteId: compatibleRoute.route.id,
                  ordersMoved: window.map(o => o.orderNumber || o.raw?.orderNumber || '?'),
                  reason: `Оптимизация по времени: перемещено ${window.length} заказов с близким временем готовности`,
                  impact: 0.6
                })
              }
            }
          }
        }
      }
    }

    const metrics = calculateRouteEfficiencyMetrics(improvedRoutes)
    const improvementScore = calculateImprovementScore(analysis, metrics)

    return {
      success: changes.length > 0,
      improvedRoutes,
      metrics,
      changes,
      improvementScore,
      message: changes.length > 0
        ? `Оптимизировано ${changes.length} маршрутов по времени готовности`
        : 'Не удалось найти улучшений по времени готовности'
    }
  }
}

/**
 * Стратегия 4: Обмен заказами между маршрутами для улучшения баланса
 */
const swapOrdersStrategy: OptimizationStrategy = {
  name: 'Обмен заказами',
  description: 'Обменивает заказы между маршрутами для улучшения баланса',
  priority: 6,
  apply: async (analysis, checkRoute) => {
    const changes: OptimizationChange[] = []
    const improvedRoutes = analysis.routes.map(r => ({ ...r.route }))

    // Находим пары маршрутов для обмена
    const pairs: Array<[RouteAnalysis, RouteAnalysis]> = []
    for (let i = 0; i < analysis.routes.length; i++) {
      for (let j = i + 1; j < analysis.routes.length; j++) {
        const loadDiff = Math.abs(analysis.routes[i].orders.length - analysis.routes[j].orders.length)
        if (loadDiff > 2) { // Разница в нагрузке > 2 заказа
          pairs.push([analysis.routes[i], analysis.routes[j]])
        }
      }
    }

    for (const [route1, route2] of pairs) {
      // Пробуем обменять по одному заказу
      for (const order1 of route1.orders.slice(0, 3)) { // Берем первые 3 для оптимизации
        for (const order2 of route2.orders.slice(0, 3)) {
          const newRoute1Orders = [
            ...route1.orders.filter(o => getOrderId(o) !== getOrderId(order1)),
            order2
          ]
          const newRoute2Orders = [
            ...route2.orders.filter(o => getOrderId(o) !== getOrderId(order2)),
            order1
          ]

          const check1 = await checkRoute(newRoute1Orders)
          const check2 = await checkRoute(newRoute2Orders)

          if (check1.feasible && check2.feasible) {
            // Проверяем, улучшилось ли распределение
            const oldLoadDiff = Math.abs(route1.orders.length - route2.orders.length)
            const newLoadDiff = Math.abs(newRoute1Orders.length - newRoute2Orders.length)

            if (newLoadDiff < oldLoadDiff) {
              const route1Idx = improvedRoutes.findIndex(r => r.id === route1.route.id)
              const route2Idx = improvedRoutes.findIndex(r => r.id === route2.route.id)

              if (route1Idx !== -1 && route2Idx !== -1) {
                improvedRoutes[route1Idx] = updateRouteFromOrders(
                  route1.route,
                  newRoute1Orders,
                  check1
                )

                improvedRoutes[route2Idx] = updateRouteFromOrders(
                  route2.route,
                  newRoute2Orders,
                  check2
                )

                changes.push({
                  type: 'swap',
                  fromRouteId: route1.route.id,
                  toRouteId: route2.route.id,
                  ordersMoved: [
                    order1.orderNumber || order1.raw?.orderNumber || '?',
                    order2.orderNumber || order2.raw?.orderNumber || '?'
                  ],
                  reason: `Обмен заказов для улучшения баланса нагрузки`,
                  impact: (oldLoadDiff - newLoadDiff) / Math.max(oldLoadDiff, 1)
                })

                break // Переходим к следующей паре
              }
            }
          }
        }
      }
    }

    const metrics = calculateRouteEfficiencyMetrics(improvedRoutes)
    const improvementScore = calculateImprovementScore(analysis, metrics)

    return {
      success: changes.length > 0,
      improvedRoutes,
      metrics,
      changes,
      improvementScore,
      message: changes.length > 0
        ? `Выполнено ${changes.length} обменов заказов между маршрутами`
        : 'Не удалось найти улучшений через обмен'
    }
  }
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Выбирает заказы для перемещения из маршрута
 */
const selectOrdersToMove = (orders: Order[], targetCount: number): Order[] => {
  if (orders.length <= 1) return []
  if (targetCount <= 0) return []

  // Сортируем заказы по приоритету (сначала менее приоритетные)
  const sorted = [...orders].sort((a, b) => (a._priority || 0) - (b._priority || 0))

  // Берем последние заказы (менее приоритетные)
  const count = Math.min(targetCount, Math.floor(orders.length / 2))
  return sorted.slice(-count)
}

/**
 * Вычисляет оценку совместимости заказов
 */
const calculateCompatibilityScore = (
  existingOrders: Order[],
  newOrders: Order[],
  targetLoad: number
): number => {
  let score = 0

  // Проверка зон доставки
  const existingZones = new Set(
    existingOrders.map(o => o.deliveryZone || o.raw?.deliveryZone || o.raw?.['Зона доставки'] || 'Не указана')
  )
  const newZones = new Set(
    newOrders.map(o => o.deliveryZone || o.raw?.deliveryZone || o.raw?.['Зона доставки'] || 'Не указана')
  )
  const zoneOverlap = [...newZones].filter(z => existingZones.has(z)).length
  score += (zoneOverlap / Math.max(newZones.size, 1)) * 0.4

  // Проверка времени готовности
  const existingAvgTime = getAverageReadyTime(existingOrders)
  const newAvgTime = getAverageReadyTime(newOrders)
  const timeDiff = Math.abs(existingAvgTime - newAvgTime) / (1000 * 60) // в минутах
  score += Math.max(0, 1 - timeDiff / 60) * 0.3 // Чем ближе время, тем лучше

  // Проверка целевой нагрузки
  const newLoad = existingOrders.length + newOrders.length
  const loadDiff = Math.abs(newLoad - targetLoad)
  score += Math.max(0, 1 - loadDiff / targetLoad) * 0.3

  return score
}

/**
 * Группирует заказы по временным окнам
 */
const groupOrdersByTimeWindows = (orders: Order[], windowMinutes: number): Order[][] => {
  const windows: Order[][] = []
  const sorted = [...orders].sort((a, b) => {
    const aTime = a.readyAtSource || a.readyAt || Date.now()
    const bTime = b.readyAtSource || b.readyAt || Date.now()
    return aTime - bTime
  })

  let currentWindow: Order[] = []
  let windowStart: number | null = null

  for (const order of sorted) {
    const orderTime = order.readyAtSource || order.readyAt || Date.now()

    if (windowStart === null || (orderTime - windowStart) / (1000 * 60) <= windowMinutes) {
      currentWindow.push(order)
      if (windowStart === null) windowStart = orderTime
    } else {
      if (currentWindow.length > 0) windows.push(currentWindow)
      currentWindow = [order]
      windowStart = orderTime
    }
  }

  if (currentWindow.length > 0) windows.push(currentWindow)

  return windows
}

/**
 * Получает среднее время готовности заказов
 */
const getAverageReadyTime = (orders: Order[]): number => {
  if (orders.length === 0) return Date.now()
  const times = orders
    .map(o => o.readyAtSource || o.readyAt || Date.now())
    .filter(t => t > 0)
  if (times.length === 0) return Date.now()
  return times.reduce((sum, t) => sum + t, 0) / times.length
}

/**
 * Обновляет маршрут на основе новых заказов
 */
const updateRouteFromOrders = (
  originalRoute: any,
  newOrders: Order[],
  checkResult: { totalDistance?: number; totalDuration?: number }
): any => {
  return {
    ...originalRoute,
    routeChainFull: newOrders,
    routeChain: newOrders.map((o: any) => o.address),
    orderNumbers: newOrders.map((o: any, idx: number) => 
      o.orderNumber || o.raw?.orderNumber || `#${idx + 1}`
    ),
    stopsCount: newOrders.length,
    totalDistance: checkResult.totalDistance || originalRoute.totalDistance || 0,
    totalDuration: checkResult.totalDuration || originalRoute.totalDuration || 0,
    totalDistanceKm: checkResult.totalDistance 
      ? (checkResult.totalDistance / 1000).toFixed(1) 
      : originalRoute.totalDistanceKm,
    totalDurationMin: checkResult.totalDuration 
      ? (checkResult.totalDuration / 60).toFixed(1) 
      : originalRoute.totalDurationMin,
    waypoints: newOrders.map((o: any) => ({ address: o.address }))
  }
}

/**
 * Получает уникальный ID заказа
 */
const getOrderId = (order: Order): string => {
  return order.id || 
    order.raw?.id || 
    `${order.orderNumber || order.raw?.orderNumber || ''}_${order.address || ''}`
}

/**
 * Вычисляет оценку улучшения
 */
const calculateImprovementScore = (
  oldAnalysis: DistributionAnalysis,
  newMetrics: RouteEfficiencyMetrics
): number => {
  const oldEfficiency = oldAnalysis.totalEfficiency
  const newEfficiency = newMetrics.efficiencyScore
  const improvement = newEfficiency - oldEfficiency
  return Math.max(0, Math.min(1, improvement + 0.5)) // Нормализуем к 0-1
}

// ============================================================================
// ГЛАВНАЯ ФУНКЦИЯ ОПТИМИЗАЦИИ
// ============================================================================

/**
 * Улучшает распределение маршрутов используя множественные стратегии
 */
export const improveRouteDistributionAdvanced = async (
  routes: any[],
  checkRoute: RouteChecker,
  options: {
    maxIterations?: number
    minImprovement?: number
    strategies?: string[] // Список стратегий для применения
  } = {}
): Promise<OptimizationResult> => {
  if (!routes || routes.length <= 1) {
    return {
      success: false,
      improvedRoutes: routes,
      metrics: calculateRouteEfficiencyMetrics(routes),
      changes: [],
      improvementScore: 0,
      message: 'Недостаточно маршрутов для оптимизации'
    }
  }

  const maxIterations = options.maxIterations || 3
  const minImprovement = options.minImprovement || 0.05

  // Все доступные стратегии
  const allStrategies: OptimizationStrategy[] = [
    rebalanceLoadStrategy,
    optimizeByZonesStrategy,
    optimizeByReadyTimeStrategy,
    swapOrdersStrategy
  ]

  // Фильтруем стратегии если указаны конкретные
  const strategiesToApply = options.strategies
    ? allStrategies.filter(s => options.strategies!.includes(s.name))
    : allStrategies

  // Сортируем по приоритету
  strategiesToApply.sort((a, b) => b.priority - a.priority)

  let currentRoutes = routes
  let allChanges: OptimizationChange[] = []
  let totalImprovement = 0

  // Анализируем начальное состояние
  let currentAnalysis = analyzeDistribution(currentRoutes)
  console.log('📊 Начальный анализ распределения:', {
    avgLoad: currentAnalysis.avgLoad.toFixed(1),
    loadStdDev: currentAnalysis.loadStdDev.toFixed(1),
    efficiency: currentAnalysis.totalEfficiency.toFixed(2),
    improvementPotential: currentAnalysis.improvementPotential.toFixed(2)
  })

  // Применяем стратегии итеративно
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    console.log(`\n🔄 Итерация ${iteration + 1}/${maxIterations}`)

    let bestResult: OptimizationResult | null = null
    let bestStrategy: OptimizationStrategy | null = null

    // Пробуем каждую стратегию
    for (const strategy of strategiesToApply) {
      console.log(`  ⚙️  Пробуем стратегию: ${strategy.name}`)
      
      try {
        const analysis = analyzeDistribution(currentRoutes)
        const result = await strategy.apply(analysis, checkRoute)

        if (result.success && result.improvementScore > (bestResult?.improvementScore || 0)) {
          bestResult = result
          bestStrategy = strategy
        }
      } catch (error) {
        console.error(`  ❌ Ошибка в стратегии ${strategy.name}:`, error)
      }
    }

    // Применяем лучший результат
    if (bestResult && bestResult.improvementScore >= minImprovement) {
      console.log(`  ✅ Применена стратегия: ${bestStrategy!.name}`)
      console.log(`     Улучшение: ${(bestResult.improvementScore * 100).toFixed(1)}%`)
      console.log(`     Изменений: ${bestResult.changes.length}`)

      currentRoutes = bestResult.improvedRoutes
      allChanges.push(...bestResult.changes)
      totalImprovement += bestResult.improvementScore

      // Обновляем анализ
      currentAnalysis = analyzeDistribution(currentRoutes)
    } else {
      console.log('  ⏹️  Дальнейшие улучшения не найдены')
      break
    }
  }

  const finalMetrics = calculateRouteEfficiencyMetrics(currentRoutes)
  const finalImprovement = calculateImprovementScore(
    analyzeDistribution(routes),
    finalMetrics
  )

  return {
    success: allChanges.length > 0,
    improvedRoutes: currentRoutes,
    metrics: finalMetrics,
    changes: allChanges,
    improvementScore: finalImprovement,
    message: allChanges.length > 0
      ? `Оптимизация завершена: применено ${allChanges.length} изменений, улучшение эффективности на ${(finalImprovement * 100).toFixed(1)}%`
      : 'Не удалось найти значительных улучшений'
  }
}

