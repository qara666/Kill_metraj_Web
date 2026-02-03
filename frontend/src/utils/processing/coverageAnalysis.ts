/**
 * Анализ покрытия зоны доставки и тепловая карта загруженности районов
 */

import type { Order } from '../routes/routeOptimization'

export interface Sector {
  bounds: {
    north: number
    south: number
    east: number
    west: number
  }
  center: { lat: number; lng: number }
  name?: string
}

export interface DeliveryZone {
  id: string
  name: string
  polygon: Array<{ lat: number; lng: number }>
  center: { lat: number; lng: number }
  area?: number // в км²
}

export interface CoverageAnalysis {
  totalOrders: number
  coveredOrders: number
  uncoveredOrders: number
  coveragePercentage: number
  coverageGaps: CoverageGap[]
  recommendations: string[]
}

export interface CoverageGap {
  location: { lat: number; lng: number }
  radius: number // в км
  orderCount: number
  severity: 'low' | 'medium' | 'high'
  description: string
}

export interface WorkloadHeatmapData {
  location: { lat: number; lng: number }
  orderCount: number
  workload: 'low' | 'medium' | 'high' | 'critical'
  averageDistance: number
  estimatedDuration: number
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
 * Проверяет, находится ли точка внутри полигона
 */
function isPointInPolygon(
  point: { lat: number; lng: number },
  polygon: Array<{ lat: number; lng: number }>
): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat
    const yi = polygon[i].lng
    const xj = polygon[j].lat
    const yj = polygon[j].lng

    const intersect = ((yi > point.lat) !== (yj > point.lat)) &&
      (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi)

    if (intersect) inside = !inside
  }

  return inside
}

/**
 * Проверяет, находится ли точка в зоне доставки
 */
function isPointInSector(
  point: { lat: number; lng: number },
  sector: Sector
): boolean {
  const { bounds } = sector
  return point.lat >= bounds.south &&
         point.lat <= bounds.north &&
         point.lng >= bounds.west &&
         point.lng <= bounds.east
}

/**
 * Анализирует покрытие зоны доставки заказами
 */
export function analyzeCoverage(
  orders: Order[],
  deliveryZone: DeliveryZone | Sector
): CoverageAnalysis {
  const ordersWithCoords = orders.filter(o => o.coords)
  const ordersWithoutCoords = orders.filter(o => !o.coords)

  let coveredCount = 0
  const uncoveredOrders: Order[] = []

  // Проверяем покрытие для заказов с координатами
  for (const order of ordersWithCoords) {
    if (!order.coords) continue

    let isCovered = false

    if ('polygon' in deliveryZone) {
      // DeliveryZone с полигоном
      isCovered = isPointInPolygon(order.coords, deliveryZone.polygon)
    } else {
      // Sector с границами
      isCovered = isPointInSector(order.coords, deliveryZone as Sector)
    }

    if (isCovered) {
      coveredCount++
    } else {
      uncoveredOrders.push(order)
    }
  }

  // Заказы без координат считаем непокрытыми (не можем проверить)
  uncoveredOrders.push(...ordersWithoutCoords)

  const totalOrders = orders.length
  const coveredOrders = coveredCount
  const uncoveredOrdersCount = uncoveredOrders.length
  const coveragePercentage = totalOrders > 0 ? (coveredOrders / totalOrders) * 100 : 0

  // Находим пробелы в покрытии
  const coverageGaps = identifyCoverageGaps(uncoveredOrders)

  // Генерируем рекомендации
  const recommendations = generateRecommendations(
    coveragePercentage,
    coverageGaps,
    uncoveredOrders.length
  )

  return {
    totalOrders,
    coveredOrders,
    uncoveredOrders: uncoveredOrdersCount,
    coveragePercentage,
    coverageGaps,
    recommendations
  }
}

/**
 * Идентифицирует пробелы в покрытии
 */
function identifyCoverageGaps(
  uncoveredOrders: Order[]
): CoverageGap[] {
  const gaps: CoverageGap[] = []

  if (uncoveredOrders.length === 0) return gaps

  // Группируем непокрытые заказы по близости
  const clusters: Array<{ orders: Order[]; center: { lat: number; lng: number } }> = []
  const used = new Set<number | string>()

  for (const order of uncoveredOrders) {
    if (used.has(order.orderNumber) || !order.coords) continue

    const cluster: Order[] = [order]
    used.add(order.orderNumber)

    // Ищем близкие непокрытые заказы
    for (const candidate of uncoveredOrders) {
      if (used.has(candidate.orderNumber) || !candidate.coords) continue

      const distance = haversineDistance(
        order.coords.lat,
        order.coords.lng,
        candidate.coords.lat,
        candidate.coords.lng
      )

      if (distance <= 2) { // в радиусе 2 км
        cluster.push(candidate)
        used.add(candidate.orderNumber)
      }
    }

    // Вычисляем центр кластера
    const center = {
      lat: cluster.reduce((sum, o) => sum + (o.coords?.lat || 0), 0) / cluster.length,
      lng: cluster.reduce((sum, o) => sum + (o.coords?.lng || 0), 0) / cluster.length
    }

    clusters.push({ orders: cluster, center })
  }

  // Преобразуем кластеры в пробелы
  for (const cluster of clusters) {
    const orderCount = cluster.orders.length
    let severity: 'low' | 'medium' | 'high' = 'low'

    if (orderCount >= 5) severity = 'high'
    else if (orderCount >= 3) severity = 'medium'

    // Вычисляем радиус (максимальное расстояние от центра до заказа)
    let maxRadius = 0
    for (const order of cluster.orders) {
      if (order.coords) {
        const distance = haversineDistance(
          cluster.center.lat,
          cluster.center.lng,
          order.coords.lat,
          order.coords.lng
        )
        maxRadius = Math.max(maxRadius, distance)
      }
    }

    gaps.push({
      location: cluster.center,
      radius: Math.max(maxRadius, 1), // минимум 1 км
      orderCount,
      severity,
      description: `${orderCount} заказ${orderCount > 1 ? 'ов' : ''} вне зоны доставки`
    })
  }

  return gaps
}

/**
 * Генерирует рекомендации на основе анализа покрытия
 */
function generateRecommendations(
  coveragePercentage: number,
  gaps: CoverageGap[],
  uncoveredCount: number
): string[] {
  const recommendations: string[] = []

  if (coveragePercentage < 50) {
    recommendations.push('️ Низкое покрытие зоны доставки. Рассмотрите расширение зоны или изменение стратегии.')
  } else if (coveragePercentage < 80) {
    recommendations.push('️ Покрытие зоны может быть улучшено.')
  } else if (coveragePercentage >= 95) {
    recommendations.push(' Отличное покрытие зоны доставки!')
  }

  if (gaps.length > 0) {
    const highSeverityGaps = gaps.filter(g => g.severity === 'high')
    if (highSeverityGaps.length > 0) {
      recommendations.push(` Обнаружено ${highSeverityGaps.length} критических пробелов в покрытии с ${highSeverityGaps.reduce((sum, g) => sum + g.orderCount, 0)} заказами.`)
    }

    recommendations.push(` Рекомендуется проверить ${gaps.length} район${gaps.length > 1 ? 'ов' : ''} с непокрытыми заказами.`)
  }

  if (uncoveredCount > 0) {
    recommendations.push(` ${uncoveredCount} заказ${uncoveredCount > 1 ? 'ов' : ''} находятся вне зоны доставки. Рассмотрите возможность расширения зоны или перераспределения заказов.`)
  }

  return recommendations
}

/**
 * Создает тепловую карту загруженности районов
 */
export function createWorkloadHeatmap(
  orders: Order[],
  gridSize: number = 20 // размер сетки для анализа
): WorkloadHeatmapData[] {
  if (orders.length === 0) return []

  const ordersWithCoords = orders.filter(o => o.coords)

  if (ordersWithCoords.length === 0) return []

  // Вычисляем границы области
  const latitudes = ordersWithCoords.map(o => o.coords!.lat)
  const longitudes = ordersWithCoords.map(o => o.coords!.lng)

  const minLat = Math.min(...latitudes)
  const maxLat = Math.max(...latitudes)
  const minLng = Math.min(...longitudes)
  const maxLng = Math.max(...longitudes)

  // Создаем сетку точек
  const latStep = (maxLat - minLat) / gridSize
  const lngStep = (maxLng - minLng) / gridSize
  const searchRadius = Math.max(latStep * 111, lngStep * 111) * 0.5 // примерно 50% от шага сетки

  const heatmapData: WorkloadHeatmapData[] = []

  for (let i = 0; i <= gridSize; i++) {
    for (let j = 0; j <= gridSize; j++) {
      const centerLat = minLat + i * latStep
      const centerLng = minLng + j * lngStep

      // Находим заказы в радиусе
      const nearbyOrders = ordersWithCoords.filter(order => {
        if (!order.coords) return false
        const distance = haversineDistance(
          centerLat,
          centerLng,
          order.coords.lat,
          order.coords.lng
        )
        return distance <= searchRadius / 111 // конвертируем в градусы приблизительно
      })

      if (nearbyOrders.length > 0) {
        // Вычисляем метрики для этой точки
        const orderCount = nearbyOrders.length

        // Среднее расстояние от центра
        let totalDistance = 0
        let validDistances = 0

        for (const order of nearbyOrders) {
          if (order.coords) {
            const distance = haversineDistance(
              centerLat,
              centerLng,
              order.coords.lat,
              order.coords.lng
            )
            totalDistance += distance
            validDistances++
          }
        }

        const averageDistance = validDistances > 0 ? totalDistance / validDistances : 0
        const estimatedDuration = orderCount * 15 // примерная оценка: 15 минут на заказ

        // Определяем уровень загруженности
        let workload: 'low' | 'medium' | 'high' | 'critical'

        if (orderCount >= 10) workload = 'critical'
        else if (orderCount >= 6) workload = 'high'
        else if (orderCount >= 3) workload = 'medium'
        else workload = 'low'

        heatmapData.push({
          location: { lat: centerLat, lng: centerLng },
          orderCount,
          workload,
          averageDistance,
          estimatedDuration
        })
      }
    }
  }

  return heatmapData
}

/**
 * Анализирует покрытие зоны по маршрутам
 */
export function analyzeCoverageByRoutes(
  routes: Array<{ routeChain: Order[] }>,
  deliveryZone: DeliveryZone | Sector
): CoverageAnalysis {
  // Собираем все заказы из маршрутов
  const allOrders: Order[] = []
  for (const route of routes) {
    allOrders.push(...route.routeChain)
  }

  return analyzeCoverage(allOrders, deliveryZone)
}

/**
 * Генерирует отчет о покрытии зоны
 */
export function generateCoverageReport(
  analysis: CoverageAnalysis
): {
  summary: string
  details: string[]
  gaps: Array<{
    location: string
    description: string
    recommendation: string
  }>
} {
  const summary = `Покрытие зоны доставки: ${analysis.coveragePercentage.toFixed(1)}% (${analysis.coveredOrders} из ${analysis.totalOrders} заказов покрыто)`

  const details = [
    ` Покрыто: ${analysis.coveredOrders} заказов`,
    ` Не покрыто: ${analysis.uncoveredOrders} заказов`,
    ...analysis.recommendations
  ]

  const gaps = analysis.coverageGaps.map(gap => ({
    location: `${gap.location.lat.toFixed(4)}, ${gap.location.lng.toFixed(4)}`,
    description: gap.description,
    recommendation: gap.severity === 'high'
      ? 'Критический пробел. Необходимо расширить зону или перераспределить заказы.'
      : gap.severity === 'medium'
      ? 'Средний пробел. Рекомендуется проверить возможность доставки в этот район.'
      : 'Небольшой пробел. Возможно оптимизация маршрута решит проблему.'
  }))

  return { summary, details, gaps }
}

