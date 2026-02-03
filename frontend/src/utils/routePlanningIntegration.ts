/**
 * Интеграция многоалгоритмной оптимизации, батчинга и анализа покрытия
 */

import type { Order } from './routes/routeOptimization'
import type { ProfileSettings } from './optimizationProfiles'
import type { OrderBatch } from './routes/trafficAwareOptimization'
import type { CoverageAnalysis } from './processing/coverageAnalysis'

import { multiAlgorithmOptimization } from './routes/advancedRouteOptimization'
import { optimizeWithTraffic, batchOrdersByTime } from './routes/trafficAwareOptimization'
import { createWorkloadHeatmap } from './processing/coverageAnalysis'
import { getOptimizationSettings } from './optimizationProfiles'

export interface EnhancedRoutePlan {
  routes: Array<{
    routeChain: Order[]
    startAddress: string
    endAddress: string
    totalDistance: number
    totalDuration: number
    algorithm: string
    optimizationDetails?: any
  }>
  batches?: OrderBatch[]
  coverageAnalysis?: CoverageAnalysis
  workloadHeatmap?: Array<{
    location: { lat: number; lng: number }
    orderCount: number
    workload: 'low' | 'medium' | 'high' | 'critical'
  }>
  statistics?: {
    totalOrders: number
    totalRoutes: number
    averageRouteDistance: number
    averageRouteDuration: number
    totalDistance: number
    totalDuration: number
  }
}

export interface PlanningOptions {
  profile?: ProfileSettings
  enableBatching?: boolean
  enableCoverageAnalysis?: boolean
  enableWorkloadHeatmap?: boolean
  trafficData?: Array<{
    location: { lat: number; lng: number }
    severity: 'low' | 'medium' | 'high' | 'critical'
    delayMinutes: number
  }>
  deliveryZone?: {
    polygon?: Array<{ lat: number; lng: number }>
    bounds?: {
      north: number
      south: number
      east: number
      west: number
    }
  }
}

/**
 * Расширенное планирование маршрутов с использованием новых функций
 */
export async function planEnhancedRoutes(
  orders: Order[],
  startAddress: string,
  endAddress: string,
  options: PlanningOptions = {}
): Promise<EnhancedRoutePlan> {
  const {
    profile = getOptimizationSettings(),
    enableBatching = true,
    enableCoverageAnalysis = true,
    enableWorkloadHeatmap = true,
    trafficData = [],
    deliveryZone
  } = options

  (/* debug */ console.log)(` Начало расширенного планирования с профилем: ${profile.name}`)
  (/* debug */ console.log)(` Заказов для планирования: ${orders.length}`)

  // 1. Батчинг заказов (если включен)
  let batches: OrderBatch[] | undefined
  if (enableBatching && orders.length > 0) {
    (/* debug */ console.log)(' Создаю батчи заказов...')
    batches = batchOrdersByTime(orders, profile.batchingOptions)
    (/* debug */ console.log)(` Создано ${batches.length} батчей`)
  }

  // 2. Оптимизация маршрутов для каждого батча или всех заказов
  const routes: EnhancedRoutePlan['routes'] = []
  
  if (batches && batches.length > 0) {
    // Планируем маршруты для каждого батча
    for (const batch of batches) {
      if (batch.orders.length === 0) continue

      (/* debug */ console.log)(` Оптимизация маршрута для батча ${batch.batchNumber} (${batch.orders.length} заказов)...`)

      // Применяем многоалгоритмную оптимизацию
      const optimizedRoute = await optimizeWithTraffic(
        batch.orders,
        async (orders, opts) => multiAlgorithmOptimization(orders, {
          ...profile.optimizationOptions,
          ...opts
        }, profile.algorithms),
        {
          ...profile.trafficAwareOptions,
          congestionAreas: trafficData.map(t => ({
            location: t.location,
            radius: 2, // 2 км радиус для пробки
            severity: t.severity,
            delayFactor: t.severity === 'critical' ? 2.5 : 
                        t.severity === 'high' ? 2.0 :
                        t.severity === 'medium' ? 1.5 : 1.2
          }))
        }
      )

      routes.push({
        routeChain: optimizedRoute.orders,
        startAddress,
        endAddress,
        totalDistance: optimizedRoute.totalDistance,
        totalDuration: optimizedRoute.totalDuration,
        algorithm: optimizedRoute.algorithm,
        optimizationDetails: {
          iterations: optimizedRoute.iterations,
          score: optimizedRoute.score
        }
      })

      (/* debug */ console.log)(` Батч ${batch.batchNumber} оптимизирован: ${optimizedRoute.algorithm}, расстояние: ${optimizedRoute.totalDistance.toFixed(1)} км`)
    }
  } else {
    // Если батчинг не используется, оптимизируем все заказы вместе
    (/* debug */ console.log)(' Оптимизация единого маршрута...')

    const optimizedRoute = await optimizeWithTraffic(
      orders,
      async (orders, opts) => multiAlgorithmOptimization(orders, {
        ...profile.optimizationOptions,
        ...opts
      }, profile.algorithms),
      {
        ...profile.trafficAwareOptions,
        congestionAreas: trafficData.map(t => ({
          location: t.location,
          radius: 2,
          severity: t.severity,
          delayFactor: t.severity === 'critical' ? 2.5 : 
                      t.severity === 'high' ? 2.0 :
                      t.severity === 'medium' ? 1.5 : 1.2
        }))
      }
    )

    routes.push({
      routeChain: optimizedRoute.orders,
      startAddress,
      endAddress,
      totalDistance: optimizedRoute.totalDistance,
      totalDuration: optimizedRoute.totalDuration,
      algorithm: optimizedRoute.algorithm,
      optimizationDetails: {
        iterations: optimizedRoute.iterations,
        score: optimizedRoute.score
      }
    })

    (/* debug */ console.log)(` Маршрут оптимизирован: ${optimizedRoute.algorithm}, расстояние: ${optimizedRoute.totalDistance.toFixed(1)} км`)
  }

  // 3. Анализ покрытия зоны доставки
  let coverageAnalysis: CoverageAnalysis | undefined
  if (enableCoverageAnalysis && deliveryZone) {
    (/* debug */ console.log)(' Анализ покрытия зоны доставки...')
    
    const { analyzeCoverage } = await import('./processing/coverageAnalysis')
    
    if (deliveryZone.polygon) {
      coverageAnalysis = analyzeCoverage(orders, {
        id: 'main',
        name: 'Основная зона',
        polygon: deliveryZone.polygon,
        center: {
          lat: deliveryZone.polygon.reduce((sum, p) => sum + p.lat, 0) / deliveryZone.polygon.length,
          lng: deliveryZone.polygon.reduce((sum, p) => sum + p.lng, 0) / deliveryZone.polygon.length
        }
      })
    } else if (deliveryZone.bounds) {
      coverageAnalysis = analyzeCoverage(orders, {
        bounds: deliveryZone.bounds,
        center: {
          lat: (deliveryZone.bounds.north + deliveryZone.bounds.south) / 2,
          lng: (deliveryZone.bounds.east + deliveryZone.bounds.west) / 2
        }
      })
    }

    if (coverageAnalysis) {
      (/* debug */ console.log)(` Покрытие зоны: ${coverageAnalysis.coveragePercentage.toFixed(1)}%`)
      (/* debug */ console.log)(`   Покрыто: ${coverageAnalysis.coveredOrders}, Не покрыто: ${coverageAnalysis.uncoveredOrders}`)
      (/* debug */ console.log)(`   Пробелов: ${coverageAnalysis.coverageGaps.length}`)
    }
  }

  // 4. Тепловая карта загруженности
  let workloadHeatmap: EnhancedRoutePlan['workloadHeatmap'] | undefined
  if (enableWorkloadHeatmap && orders.length > 0) {
    (/* debug */ console.log)(' Создание тепловой карты загруженности...')
    
    const heatmapData = createWorkloadHeatmap(orders, 20)
    workloadHeatmap = heatmapData.map(d => ({
      location: d.location,
      orderCount: d.orderCount,
      workload: d.workload
    }))

    const criticalZones = workloadHeatmap.filter(z => z.workload === 'critical').length
    const highZones = workloadHeatmap.filter(z => z.workload === 'high').length

    (/* debug */ console.log)(` Тепловая карта создана: ${heatmapData.length} точек`)
    (/* debug */ console.log)(`   Критических зон: ${criticalZones}, Высокой загрузки: ${highZones}`)
  }

  // 5. Статистика
  const statistics = {
    totalOrders: orders.length,
    totalRoutes: routes.length,
    averageRouteDistance: routes.length > 0 
      ? routes.reduce((sum, r) => sum + r.totalDistance, 0) / routes.length 
      : 0,
    averageRouteDuration: routes.length > 0
      ? routes.reduce((sum, r) => sum + r.totalDuration, 0) / routes.length
      : 0,
    totalDistance: routes.reduce((sum, r) => sum + r.totalDistance, 0),
    totalDuration: routes.reduce((sum, r) => sum + r.totalDuration, 0)
  }

  (/* debug */ console.log)(' Статистика планирования:')
  (/* debug */ console.log)(`   Всего маршрутов: ${statistics.totalRoutes}`)
  (/* debug */ console.log)(`   Среднее расстояние: ${statistics.averageRouteDistance.toFixed(1)} км`)
  (/* debug */ console.log)(`   Среднее время: ${statistics.averageRouteDuration.toFixed(0)} мин`)
  (/* debug */ console.log)(`   Общее расстояние: ${statistics.totalDistance.toFixed(1)} км`)
  (/* debug */ console.log)(`   Общее время: ${statistics.totalDuration.toFixed(0)} мин`)

  return {
    routes,
    batches,
    coverageAnalysis,
    workloadHeatmap,
    statistics
  }
}

/**
 * Быстрое планирование с использованием выбранного профиля
 */
export async function quickPlanRoutes(
  orders: Order[],
  startAddress: string,
  endAddress: string
): Promise<EnhancedRoutePlan> {
  const profile = getOptimizationSettings()
  
  return planEnhancedRoutes(orders, startAddress, endAddress, {
    profile,
    enableBatching: true,
    enableCoverageAnalysis: false,
    enableWorkloadHeatmap: false
  })
}

