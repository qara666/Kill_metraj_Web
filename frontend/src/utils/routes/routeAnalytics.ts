import { RouteAnalytics, Route, Order, Coordinates } from '../../types'

export const calculateRouteAnalytics = (routes: Route[]): RouteAnalytics => {
  if (!routes || routes.length === 0) {
    return getEmptyAnalytics()
  }

  const totalRoutes = routes.length
  const totalOrders = routes.reduce((sum, r) => sum + (r.stopsCount || r.routeChainFull?.length || 0), 0)
  const totalDistance = routes.reduce((sum, r) => sum + (Number(r.totalDistance) || 0), 0)
  const totalDuration = routes.reduce((sum, r) => sum + (Number(r.totalDuration) || 0), 0)

  const efficiencies = routes
    .map(r => r.routeEfficiency || 0)
    .filter(e => e > 0)

  const avgEfficiency = efficiencies.length > 0
    ? efficiencies.reduce((sum, e) => sum + e, 0) / efficiencies.length
    : 0

  const efficiencyDistribution = {
    excellent: efficiencies.filter(e => e > 0.8).length,
    good: efficiencies.filter(e => e > 0.6 && e <= 0.8).length,
    average: efficiencies.filter(e => e > 0.4 && e <= 0.6).length,
    poor: efficiencies.filter(e => e <= 0.4).length
  }

  let onTime = 0
  let late = 0
  let early = 0
  let noDeadline = 0

  routes.forEach(route => {
    const orders = route.routeChainFull || []
    orders.forEach((order: Order) => {
      if (!order.deadlineAt) {
        noDeadline++
        return
      }

      const now = Date.now()
      const timeUntilDeadline = order.deadlineAt - now
      const minutesUntilDeadline = timeUntilDeadline / (1000 * 60)

      if (minutesUntilDeadline < -15) late++
      else if (minutesUntilDeadline > 30) early++
      else onTime++
    })
  })

  const zoneDistribution: Record<string, number> = {}
  const distancesBetweenStops: number[] = []

  routes.forEach(route => {
    const orders = route.routeChainFull || []
    orders.forEach((order: Order, idx: number) => {
      const zone = order.deliveryZone || order.raw?.deliveryZone || order.raw?.['Зона доставки'] || 'Не указана'
      zoneDistribution[zone] = (zoneDistribution[zone] || 0) + 1

      if (idx > 0 && order.coords && orders[idx - 1]?.coords) {
        const dist = calculateDistance(
          orders[idx - 1].coords!,
          order.coords!
        )
        distancesBetweenStops.push(dist)
      }
    })
  })

  const totalTrafficDelay = routes.reduce((sum, r) => sum + (r.totalTrafficDelay || 0), 0)
  const routesWithTraffic = routes.filter(r => r.totalTrafficDelay && r.totalTrafficDelay > 0).length
  const criticalTrafficRoutes = routes.filter(r => r.hasCriticalTraffic).length

  const ordersPerRoute = routes.map(r => r.stopsCount || r.routeChainFull?.length || 0)
  const minOrders = Math.min(...ordersPerRoute)
  const maxOrders = Math.max(...ordersPerRoute)
  const avgOrders = ordersPerRoute.reduce((sum, n) => sum + n, 0) / ordersPerRoute.length
  const variance = ordersPerRoute.reduce((sum, n) => sum + Math.pow(n - avgOrders, 2), 0) / ordersPerRoute.length
  const stdDev = Math.sqrt(variance)
  const isBalanced = stdDev < 1.5

  const recommendations: string[] = []

  if (avgEfficiency < 0.5) {
    recommendations.push('Низкая эффективность маршрутов. Рекомендуется пересмотреть группировку заказов.')
  }

  if (late > totalOrders * 0.1) {
    recommendations.push(`Много просроченных заказов (${late}). Увеличьте приоритет срочных заказов.`)
  }

  if (!isBalanced) {
    recommendations.push('Неравномерное распределение нагрузки между курьерами. Включите балансировку нагрузки.')
  }

  if (criticalTrafficRoutes > 0) {
    recommendations.push(`${criticalTrafficRoutes} маршрутов с критическими пробками. Рассмотрите возможность перепланирования.`)
  }

  if (Object.keys(zoneDistribution).length > 1 && maxOrders - minOrders > 3) {
    recommendations.push('Большая разница в количестве заказов между маршрутами. Используйте группировку по зонам.')
  }

  return {
    totalRoutes,
    totalOrders,
    totalDistance,
    totalDuration,
    avgDistancePerRoute: totalRoutes > 0 ? (totalDistance / totalRoutes / 1000) : 0,
    avgDurationPerRoute: totalRoutes > 0 ? (totalDuration / totalRoutes / 60) : 0,
    avgOrdersPerRoute: totalRoutes > 0 ? (totalOrders / totalRoutes) : 0,
    avgEfficiency,
    efficiencyDistribution,
    timeWindowCompliance: {
      onTime,
      late,
      early,
      noDeadline
    },
    zoneDistribution,
    avgDistanceBetweenStops: distancesBetweenStops.length > 0
      ? distancesBetweenStops.reduce((sum, d) => sum + d, 0) / distancesBetweenStops.length / 1000
      : 0,
    maxDistanceBetweenStops: distancesBetweenStops.length > 0
      ? Math.max(...distancesBetweenStops) / 1000
      : 0,
    totalTrafficDelay,
    routesWithTraffic,
    criticalTrafficRoutes,
    loadBalance: {
      minOrders,
      maxOrders,
      stdDev,
      isBalanced
    },
    recommendations
  }
}

const getEmptyAnalytics = (): RouteAnalytics => ({
  totalRoutes: 0,
  totalOrders: 0,
  totalDistance: 0,
  totalDuration: 0,
  avgDistancePerRoute: 0,
  avgDurationPerRoute: 0,
  avgOrdersPerRoute: 0,
  avgEfficiency: 0,
  efficiencyDistribution: {
    excellent: 0,
    good: 0,
    average: 0,
    poor: 0
  },
  timeWindowCompliance: {
    onTime: 0,
    late: 0,
    early: 0,
    noDeadline: 0
  },
  zoneDistribution: {},
  avgDistanceBetweenStops: 0,
  maxDistanceBetweenStops: 0,
  totalTrafficDelay: 0,
  routesWithTraffic: 0,
  criticalTrafficRoutes: 0,
  loadBalance: {
    minOrders: 0,
    maxOrders: 0,
    stdDev: 0,
    isBalanced: true
  },
  recommendations: []
})

const calculateDistance = (coord1: Coordinates, coord2: Coordinates): number => {
  const R = 6371000
  const lat1 = coord1.lat * Math.PI / 180
  const lat2 = coord2.lat * Math.PI / 180
  const deltaLat = (coord2.lat - coord1.lat) * Math.PI / 180
  const deltaLng = (coord2.lng - coord1.lng) * Math.PI / 180

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}
