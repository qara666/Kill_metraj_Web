// Утилиты для улучшения эффективности распределения маршрутов

import type { Order } from './routeOptimizationHelpers'

export interface RouteEfficiencyMetrics {
  totalDistance: number
  totalDuration: number
  avgDistancePerOrder: number
  avgDurationPerOrder: number
  routeUtilization: number // Использование маршрута (0-1)
  balanceScore: number // Баланс нагрузки между маршрутами (0-1)
  efficiencyScore: number // Общая эффективность (0-1)
}

/**
 * Рассчитывает метрики эффективности для маршрутов
 */
export const calculateRouteEfficiencyMetrics = (routes: any[]): RouteEfficiencyMetrics => {
  if (!routes || routes.length === 0) {
    return {
      totalDistance: 0,
      totalDuration: 0,
      avgDistancePerOrder: 0,
      avgDurationPerOrder: 0,
      routeUtilization: 0,
      balanceScore: 0,
      efficiencyScore: 0
    }
  }

  const totalDistance = routes.reduce((sum, r) => sum + (r.totalDistance || 0), 0)
  const totalDuration = routes.reduce((sum, r) => sum + (r.totalDuration || 0), 0)
  const totalOrders = routes.reduce((sum, r) => sum + (r.stopsCount || 0), 0)

  const avgDistancePerOrder = totalOrders > 0 ? totalDistance / totalOrders : 0
  const avgDurationPerOrder = totalOrders > 0 ? totalDuration / totalOrders : 0

  // Использование маршрута (сколько заказов на маршрут в среднем)
  const avgOrdersPerRoute = totalOrders / routes.length
  const maxOrdersPerRoute = Math.max(...routes.map(r => r.stopsCount || 0))
  const routeUtilization = maxOrdersPerRoute > 0 ? avgOrdersPerRoute / maxOrdersPerRoute : 0

  // Баланс нагрузки (чем меньше разница между маршрутами, тем лучше)
  const ordersPerRoute = routes.map(r => r.stopsCount || 0)
  const avgOrders = ordersPerRoute.reduce((sum, n) => sum + n, 0) / ordersPerRoute.length
  const variance = ordersPerRoute.reduce((sum, n) => sum + Math.pow(n - avgOrders, 2), 0) / ordersPerRoute.length
  const stdDev = Math.sqrt(variance)
  const balanceScore = Math.max(0, 1 - (stdDev / Math.max(avgOrders, 1)))

  // Общая эффективность (комбинация всех факторов)
  const distanceEfficiency = totalDistance > 0 ? Math.min(1, 10000 / totalDistance) : 0 // Нормализуем
  const durationEfficiency = totalDuration > 0 ? Math.min(1, 3600 / (totalDuration / 60)) : 0 // Нормализуем
  const efficiencyScore = (routeUtilization * 0.3 + balanceScore * 0.3 + distanceEfficiency * 0.2 + durationEfficiency * 0.2)

  return {
    totalDistance,
    totalDuration,
    avgDistancePerOrder,
    avgDurationPerOrder,
    routeUtilization,
    balanceScore,
    efficiencyScore
  }
}

/**
 * Улучшает распределение заказов между маршрутами
 */
export const improveRouteDistribution = async (
  routes: any[],
  checkRoute: (orders: Order[]) => Promise<{ feasible: boolean; totalDistance?: number; totalDuration?: number }>
): Promise<any[]> => {
  if (!routes || routes.length <= 1) return routes

  // Сортируем маршруты по количеству заказов (от большего к меньшему)
  const sortedRoutes = [...routes].sort((a, b) => (b.stopsCount || 0) - (a.stopsCount || 0))
  
  // Находим маршруты с перегрузкой и недогрузкой
  const avgOrders = sortedRoutes.reduce((sum, r) => sum + (r.stopsCount || 0), 0) / sortedRoutes.length
  const overloadedRoutes = sortedRoutes.filter(r => (r.stopsCount || 0) > avgOrders * 1.2)
  const underloadedRoutes = sortedRoutes.filter(r => (r.stopsCount || 0) < avgOrders * 0.8)

  if (overloadedRoutes.length === 0 || underloadedRoutes.length === 0) {
    return routes // Нет необходимости в перераспределении
  }

  const improvedRoutes = [...routes]

  // Пытаемся перераспределить заказы
  for (const overloadedRoute of overloadedRoutes) {
    const orders = overloadedRoute.routeChainFull || []
    if (orders.length <= 1) continue

    // Берем последние заказы из перегруженного маршрута
    const ordersToMove = orders.slice(Math.floor(orders.length / 2))
    const remainingOrders = orders.slice(0, Math.floor(orders.length / 2))

    // Проверяем, можно ли оставить оставшиеся заказы
    const remainingCheck = await checkRoute(remainingOrders)
    if (!remainingCheck.feasible) continue

    // Ищем подходящий недогруженный маршрут
    for (const underloadedRoute of underloadedRoutes) {
      const targetOrders = [...(underloadedRoute.routeChainFull || []), ...ordersToMove]
      
      const targetCheck = await checkRoute(targetOrders)
      if (targetCheck.feasible) {
        // Перераспределяем заказы
        const overloadedIndex = improvedRoutes.findIndex(r => r.id === overloadedRoute.id)
        const underloadedIndex = improvedRoutes.findIndex(r => r.id === underloadedRoute.id)

        if (overloadedIndex !== -1 && underloadedIndex !== -1) {
          // Обновляем перегруженный маршрут
          improvedRoutes[overloadedIndex] = {
            ...overloadedRoute,
            routeChainFull: remainingOrders,
            routeChain: remainingOrders.map((o: any) => o.address),
            orderNumbers: remainingOrders.map((o: any, idx: number) => o.orderNumber || o.raw?.orderNumber || `#${idx + 1}`),
            stopsCount: remainingOrders.length,
            totalDistance: remainingCheck.totalDistance || overloadedRoute.totalDistance || 0,
            totalDuration: remainingCheck.totalDuration || overloadedRoute.totalDuration || 0,
            totalDistanceKm: remainingCheck.totalDistance ? (remainingCheck.totalDistance / 1000).toFixed(1) : overloadedRoute.totalDistanceKm,
            totalDurationMin: remainingCheck.totalDuration ? (remainingCheck.totalDuration / 60).toFixed(1) : overloadedRoute.totalDurationMin,
            waypoints: remainingOrders.map((o: any) => ({ address: o.address }))
          }

          // Обновляем недогруженный маршрут
          improvedRoutes[underloadedIndex] = {
            ...underloadedRoute,
            routeChainFull: targetOrders,
            routeChain: targetOrders.map((o: any) => o.address),
            orderNumbers: targetOrders.map((o: any, idx: number) => o.orderNumber || o.raw?.orderNumber || `#${idx + 1}`),
            stopsCount: targetOrders.length,
            totalDistance: targetCheck.totalDistance || underloadedRoute.totalDistance || 0,
            totalDuration: targetCheck.totalDuration || underloadedRoute.totalDuration || 0,
            totalDistanceKm: targetCheck.totalDistance ? (targetCheck.totalDistance / 1000).toFixed(1) : underloadedRoute.totalDistanceKm,
            totalDurationMin: targetCheck.totalDuration ? (targetCheck.totalDuration / 60).toFixed(1) : underloadedRoute.totalDurationMin,
            waypoints: targetOrders.map((o: any) => ({ address: o.address }))
          }

          break // Перешли к следующему перегруженному маршруту
        }
      }
    }
  }

  return improvedRoutes
}

/**
 * Оптимизирует порядок заказов в маршруте для уменьшения расстояния
 */
export const optimizeRouteOrder = async (
  orders: Order[],
  checkRoute: (orders: Order[]) => Promise<{ feasible: boolean; totalDistance?: number; totalDuration?: number; legs?: any[] }>
): Promise<Order[]> => {
  if (orders.length <= 2) return orders

  let bestOrder = [...orders]
  let bestDistance = Infinity

  // Проверяем текущий порядок
  const currentCheck = await checkRoute(orders)
  if (currentCheck.feasible && currentCheck.totalDistance) {
    bestDistance = currentCheck.totalDistance
  }

  // Пробуем переставить соседние заказы (2-opt)
  for (let i = 0; i < orders.length - 1; i++) {
    for (let j = i + 2; j < orders.length; j++) {
      const testOrder = [...orders]
      // Переворачиваем сегмент между i и j
      const segment = testOrder.slice(i, j).reverse()
      testOrder.splice(i, j - i, ...segment)

      const testCheck = await checkRoute(testOrder)
      if (testCheck.feasible && testCheck.totalDistance && testCheck.totalDistance < bestDistance) {
        bestOrder = testOrder
        bestDistance = testCheck.totalDistance
      }
    }
  }

  return bestOrder
}

/**
 * Группирует заказы по зонам для более эффективного распределения
 */
export const groupOrdersByZones = (orders: Order[]): Map<string, Order[]> => {
  const zoneMap = new Map<string, Order[]>()
  
  orders.forEach(order => {
    const zone = order.deliveryZone || order.raw?.deliveryZone || order.raw?.['Зона доставки'] || 'Не указана'
    if (!zoneMap.has(zone)) {
      zoneMap.set(zone, [])
    }
    zoneMap.get(zone)!.push(order)
  })

  return zoneMap
}

/**
 * Предлагает улучшения для маршрутов на основе метрик
 */
export const suggestRouteImprovements = (metrics: RouteEfficiencyMetrics): string[] => {
  const suggestions: string[] = []

  if (metrics.balanceScore < 0.7) {
    suggestions.push('Неравномерное распределение нагрузки между маршрутами. Рекомендуется перераспределение заказов.')
  }

  if (metrics.routeUtilization < 0.6) {
    suggestions.push('Низкое использование маршрутов. Рассмотрите возможность объединения коротких маршрутов.')
  }

  if (metrics.avgDistancePerOrder > 15000) { // > 15 км на заказ
    suggestions.push('Высокая средняя дистанция на заказ. Проверьте группировку заказов по зонам.')
  }

  if (metrics.avgDurationPerOrder > 1800000) { // > 30 минут на заказ
    suggestions.push('Высокая средняя длительность на заказ. Оптимизируйте порядок доставки.')
  }

  if (metrics.efficiencyScore < 0.5) {
    suggestions.push('Общая эффективность маршрутов низкая. Рекомендуется перепланирование с другими параметрами.')
  }

  return suggestions
}

