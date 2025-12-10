import React, { useState, useMemo } from 'react'
import { 
  ChartBarIcon, 
  TruckIcon, 
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  FireIcon,
  BoltIcon
} from '@heroicons/react/24/outline'
import { useExcelData } from '../contexts/ExcelDataContext'
import { useTheme } from '../contexts/ThemeContext'
import { clsx } from 'clsx'

interface AnalyticsData {
  courierStats: any[]
  vehicleTypeStats: any
  zoneStats: any
  timeStats: any
  topCouriers: any[]
  routeStats: any
  totalOrders: number
  totalAmount: number
  averageOrderValue: number
  predictions: any
  efficiencyAnalysis: any
  loadBalancing: any
}

export const AnalyticsDashboard: React.FC = () => {
  const { excelData } = useExcelData()
  const { isDark } = useTheme()
  const [selectedPeriod, setSelectedPeriod] = useState<'day' | 'week' | 'month'>('week')
  const [selectedMetric, setSelectedMetric] = useState<'efficiency' | 'distance' | 'orders'>('efficiency')

  // Расширенная аналитика с ИИ функциями
  const enhancedAnalytics = useMemo((): AnalyticsData | null => {
    if (!excelData) return null

    const orders = excelData.orders || []
    const couriers = excelData.couriers || []
    const routes = excelData.routes || []

    // Анализ курьеров с расширенными метриками
    const courierStats = Array.isArray(couriers) ? couriers.map((courier: any) => {
      const courierOrders = Array.isArray(orders) ? orders.filter((order: any) => order.courier === courier.name) : []
      const courierRoutes = Array.isArray(routes) ? routes.filter((route: any) => route.courier === courier.name) : []
      
      // Расчет эффективности
      const totalDistance = courierRoutes.reduce((sum: number, route: any) => {
        const ordersCount = route.orders?.length || 0
        if (route.isOptimized && route.totalDistance) {
          return sum + route.totalDistance + (ordersCount * 0.5)
        } else {
          return sum + 1.0 + (ordersCount * 0.5)
        }
      }, 0)

      const efficiency = courierOrders.length > 0 ? courierOrders.length / Math.max(totalDistance, 1) : 0
      const avgDeliveryTime = courierRoutes.length > 0 ? 
        courierRoutes.reduce((sum: number, route: any) => sum + (route.totalDuration || 0), 0) / courierRoutes.length : 0

      return {
        name: courier.name,
        vehicleType: courier.vehicleType || 'car',
        totalOrders: courierOrders.length,
        totalAmount: courierOrders.reduce((sum: number, order: any) => sum + (order.amount || 0), 0),
        totalDistance,
        routesCount: courierRoutes.length,
        averageOrderValue: courierOrders.length > 0 ? 
          courierOrders.reduce((sum: number, order: any) => sum + (order.amount || 0), 0) / courierOrders.length : 0,
        efficiency,
        avgDeliveryTime,
        utilizationRate: courierOrders.length / Math.max(courierRoutes.length * 5, 1), // Предполагаем 5 заказов на маршрут
        performanceScore: calculatePerformanceScore(courierOrders.length, totalDistance, avgDeliveryTime)
      }
    }) : []

    // Топ курьеры по эффективности
    const topCouriers = [...courierStats]
      .sort((a: any, b: any) => b.efficiency - a.efficiency)
      .slice(0, 10)

    // Анализ загруженности маршрутов
    // const loadAnalysis = analyzeRouteLoad(routes)

    // Прогнозы на основе истории
    const predictions = generatePredictions(orders)

    // Анализ эффективности
    const efficiencyAnalysis = analyzeEfficiency(courierStats, routes)

    // Балансировка нагрузки
    const loadBalancing = analyzeLoadBalancing(courierStats)

    // Анализ по типам транспорта
    const vehicleTypeStats = {
      car: courierStats.filter((c: any) => c.vehicleType === 'car'),
      motorcycle: courierStats.filter((c: any) => c.vehicleType === 'motorcycle')
    }

    // Анализ по зонам доставки
    const zoneStats = Array.isArray(orders) ? orders.reduce((zones: any, order: any) => {
      const zone = order.zone || 'Неизвестно'
      if (!zones[zone]) {
        zones[zone] = { count: 0, amount: 0, avgDistance: 0 }
      }
      zones[zone].count++
      zones[zone].amount += order.amount || 0
      return zones
    }, {}) : {}

    // Анализ по времени
    const timeStats = Array.isArray(orders) ? orders.reduce((stats: any, order: any) => {
      const hour = new Date(order.created || Date.now()).getHours()
      const timeSlot = hour < 12 ? 'Утро' : hour < 18 ? 'День' : 'Вечер'
      
      if (!stats[timeSlot]) {
        stats[timeSlot] = { count: 0, amount: 0, efficiency: 0 }
      }
      stats[timeSlot].count++
      stats[timeSlot].amount += order.amount || 0
      return stats
    }, {}) : {}

    // Статистика маршрутов
    const routeStats = {
      totalRoutes: Array.isArray(routes) ? routes.length : 0,
      optimizedRoutes: Array.isArray(routes) ? routes.filter((route: any) => route.isOptimized).length : 0,
      totalDistance: Array.isArray(routes) ? routes.reduce((sum: number, route: any) => sum + (route.totalDistance || 0), 0) : 0,
      averageRouteDistance: Array.isArray(routes) && routes.length > 0 ? 
        routes.reduce((sum: number, route: any) => sum + (route.totalDistance || 0), 0) / routes.length : 0,
      avgOrdersPerRoute: Array.isArray(routes) && routes.length > 0 ?
        routes.reduce((sum: number, route: any) => sum + (route.orders?.length || 0), 0) / routes.length : 0
    }

    return {
      courierStats,
      vehicleTypeStats,
      zoneStats,
      timeStats,
      topCouriers,
      routeStats,
      totalOrders: Array.isArray(orders) ? orders.length : 0,
      totalAmount: Array.isArray(orders) ? orders.reduce((sum: number, order: any) => sum + (order.amount || 0), 0) : 0,
      averageOrderValue: Array.isArray(orders) && orders.length > 0 ? 
        orders.reduce((sum: number, order: any) => sum + (order.amount || 0), 0) / orders.length : 0,
      predictions,
      efficiencyAnalysis,
      loadBalancing
    }
  }, [excelData, selectedPeriod])

  // Функции для расчетов
  function calculatePerformanceScore(orders: number, distance: number, avgTime: number): number {
    const orderScore = Math.min(orders * 10, 100)
    const distanceScore = Math.max(0, 100 - (distance * 2))
    const timeScore = Math.max(0, 100 - (avgTime / 60 * 10))
    return (orderScore + distanceScore + timeScore) / 3
  }

  // function analyzeRouteLoad(routes: any[]): any {
  //   const routeLoads = routes.map((route: any) => ({
  //     id: route.id,
  //     courier: route.courier,
  //     ordersCount: route.orders?.length || 0,
  //     distance: route.totalDistance || 0,
  //     duration: route.totalDuration || 0,
  //     loadFactor: (route.orders?.length || 0) / 5, // Предполагаем оптимальную нагрузку 5 заказов
  //     efficiency: route.isOptimized ? 1 : 0.7
  //   }))

  //   const avgLoad = routeLoads.reduce((sum, route) => sum + route.loadFactor, 0) / routeLoads.length
  //   const overloadedRoutes = routeLoads.filter(route => route.loadFactor > 1.2)
  //   const underloadedRoutes = routeLoads.filter(route => route.loadFactor < 0.8)

  //   return {
  //     avgLoad,
  //     overloadedRoutes,
  //     underloadedRoutes,
  //     totalRoutes: routeLoads.length,
  //     efficiency: routeLoads.reduce((sum, route) => sum + route.efficiency, 0) / routeLoads.length
  //   }
  // }

  function generatePredictions(orders: any[]): any {
    // Простые прогнозы на основе трендов
    const recentOrders = orders.slice(-50) // Последние 50 заказов
    const avgOrdersPerDay = recentOrders.length / 7 // Предполагаем недельный период
    
    const predictions = {
      nextWeekOrders: Math.round(avgOrdersPerDay * 7),
      nextWeekRevenue: Math.round(avgOrdersPerDay * 7 * (orders.reduce((sum, order) => sum + (order.amount || 0), 0) / orders.length)),
      optimalCourierCount: Math.ceil(avgOrdersPerDay / 15), // Предполагаем 15 заказов на курьера в день
      peakHours: ['10:00-12:00', '14:00-16:00', '18:00-20:00'],
      efficiencyTrend: 'up', // Простое определение тренда
      demandForecast: {
        high: ['Понедельник', 'Среда', 'Пятница'],
        medium: ['Вторник', 'Четверг'],
        low: ['Суббота', 'Воскресенье']
      }
    }

    return predictions
  }

  function analyzeEfficiency(courierStats: any[], routes: any[]): any {
    const avgEfficiency = courierStats.reduce((sum, courier) => sum + courier.efficiency, 0) / courierStats.length
    const topPerformers = courierStats.filter(c => c.efficiency > avgEfficiency * 1.2)
    const underPerformers = courierStats.filter(c => c.efficiency < avgEfficiency * 0.8)

    return {
      avgEfficiency,
      topPerformers,
      underPerformers,
      improvementSuggestions: generateImprovementSuggestions(courierStats, routes)
    }
  }

  function analyzeLoadBalancing(courierStats: any[]): any {
    const avgLoad = courierStats.reduce((sum, courier) => sum + courier.totalOrders, 0) / courierStats.length
    const overloadedCouriers = courierStats.filter(c => c.totalOrders > avgLoad * 1.3)
    const underloadedCouriers = courierStats.filter(c => c.totalOrders < avgLoad * 0.7)

    return {
      avgLoad,
      overloadedCouriers,
      underloadedCouriers,
      balanceScore: calculateBalanceScore(courierStats),
      recommendations: generateLoadBalancingRecommendations(courierStats)
    }
  }

  function calculateBalanceScore(courierStats: any[]): number {
    const loads = courierStats.map(c => c.totalOrders)
    const avg = loads.reduce((sum, load) => sum + load, 0) / loads.length
    const variance = loads.reduce((sum, load) => sum + Math.pow(load - avg, 2), 0) / loads.length
    const stdDev = Math.sqrt(variance)
    return Math.max(0, 100 - (stdDev / avg * 100))
  }

  function generateImprovementSuggestions(courierStats: any[], routes: any[]): string[] {
    const suggestions = []
    
    const avgEfficiency = courierStats.reduce((sum, courier) => sum + courier.efficiency, 0) / courierStats.length
    const lowEfficiencyCouriers = courierStats.filter(c => c.efficiency < avgEfficiency * 0.8)
    
    if (lowEfficiencyCouriers.length > 0) {
      suggestions.push(`Обучить ${lowEfficiencyCouriers.length} курьеров оптимизации маршрутов`)
    }
    
    const unoptimizedRoutes = routes.filter(r => !r.isOptimized)
    if (unoptimizedRoutes.length > 0) {
      suggestions.push(`Оптимизировать ${unoptimizedRoutes.length} неоптимизированных маршрутов`)
    }
    
    const avgDistance = courierStats.reduce((sum, courier) => sum + courier.totalDistance, 0) / courierStats.length
    const highDistanceCouriers = courierStats.filter(c => c.totalDistance > avgDistance * 1.5)
    if (highDistanceCouriers.length > 0) {
      suggestions.push(`Пересмотреть зоны доставки для ${highDistanceCouriers.length} курьеров`)
    }
    
    return suggestions
  }

  function generateLoadBalancingRecommendations(courierStats: any[]): string[] {
    const recommendations = []
    
    const avgLoad = courierStats.reduce((sum, courier) => sum + courier.totalOrders, 0) / courierStats.length
    const overloadedCouriers = courierStats.filter(c => c.totalOrders > avgLoad * 1.3)
    const underloadedCouriers = courierStats.filter(c => c.totalOrders < avgLoad * 0.7)
    
    if (overloadedCouriers.length > 0 && underloadedCouriers.length > 0) {
      recommendations.push(`Перераспределить заказы между ${overloadedCouriers.length} перегруженными и ${underloadedCouriers.length} недогруженными курьерами`)
    }
    
    if (overloadedCouriers.length > 0) {
      recommendations.push(`Рассмотреть найм дополнительных курьеров для зон с высокой нагрузкой`)
    }
    
    return recommendations
  }

  if (!enhancedAnalytics) {
    return (
      <div className={clsx(
        'flex items-center justify-center h-64',
        isDark ? 'text-gray-400' : 'text-gray-600'
      )}>
        <div className="text-center">
          <ChartBarIcon className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-4">Загрузите Excel файл для просмотра аналитики</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header с фильтрами */}
      <div className={clsx(
        'rounded-lg shadow-sm border p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className={clsx(
              'text-2xl font-bold',
              isDark ? 'text-white' : 'text-gray-900'
            )}>
              Дашборд аналитики
            </h1>
            <p className={clsx(
              'mt-1 text-sm',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              Анализ эффективности курьеров и маршрутов
            </p>
          </div>
          <div className="flex space-x-2">
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value as any)}
              className={clsx(
                'px-3 py-2 rounded-lg border text-sm',
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white' 
                  : 'bg-white border-gray-300 text-gray-900'
              )}
            >
              <option value="day">День</option>
              <option value="week">Неделя</option>
              <option value="month">Месяц</option>
            </select>
            <select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value as any)}
              className={clsx(
                'px-3 py-2 rounded-lg border text-sm',
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white' 
                  : 'bg-white border-gray-300 text-gray-900'
              )}
            >
              <option value="efficiency">Эффективность</option>
              <option value="distance">Расстояние</option>
              <option value="orders">Заказы</option>
            </select>
          </div>
        </div>
      </div>

      {/* Основные метрики */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className={clsx(
          'rounded-lg shadow-sm border p-6 transition-all duration-200 hover:shadow-md',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <TruckIcon className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-4">
              <h3 className={clsx(
                'text-sm font-medium',
                isDark ? 'text-gray-400' : 'text-gray-600'
              )}>
                Всего заказов
              </h3>
              <p className={clsx(
                'text-2xl font-bold',
                isDark ? 'text-white' : 'text-gray-900'
              )}>
                {enhancedAnalytics.totalOrders || 0}
              </p>
            </div>
          </div>
        </div>
        
        <div className={clsx(
          'rounded-lg shadow-sm border p-6 transition-all duration-200 hover:shadow-md',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CurrencyDollarIcon className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-4">
              <h3 className={clsx(
                'text-sm font-medium',
                isDark ? 'text-gray-400' : 'text-gray-600'
              )}>
                Общая сумма
              </h3>
              <p className={clsx(
                'text-2xl font-bold',
                isDark ? 'text-white' : 'text-gray-900'
              )}>
                {(enhancedAnalytics.totalAmount || 0).toFixed(0)} грн
              </p>
            </div>
          </div>
        </div>
        
        <div className={clsx(
          'rounded-lg shadow-sm border p-6 transition-all duration-200 hover:shadow-md',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ArrowTrendingUpIcon className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-4">
              <h3 className={clsx(
                'text-sm font-medium',
                isDark ? 'text-gray-400' : 'text-gray-600'
              )}>
                Средняя эффективность
              </h3>
              <p className={clsx(
                'text-2xl font-bold',
                isDark ? 'text-white' : 'text-gray-900'
              )}>
                {(enhancedAnalytics.efficiencyAnalysis?.avgEfficiency || 0).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
        
        <div className={clsx(
          'rounded-lg shadow-sm border p-6 transition-all duration-200 hover:shadow-md',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <BoltIcon className="h-8 w-8 text-orange-600" />
            </div>
            <div className="ml-4">
              <h3 className={clsx(
                'text-sm font-medium',
                isDark ? 'text-gray-400' : 'text-gray-600'
              )}>
                Баланс нагрузки
              </h3>
              <p className={clsx(
                'text-2xl font-bold',
                isDark ? 'text-white' : 'text-gray-900'
              )}>
                {(enhancedAnalytics.loadBalancing?.balanceScore || 0).toFixed(0)}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Топ курьеров по эффективности */}
      <div className={clsx(
        'rounded-lg shadow-sm border p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <div className="flex items-center justify-between mb-6">
          <h3 className={clsx(
            'text-lg font-medium',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            Топ курьеров по эффективности
          </h3>
          <div className="flex items-center space-x-2">
            <FireIcon className="h-5 w-5 text-red-500" />
            <span className={clsx(
              'text-sm font-medium',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              Рейтинг производительности
            </span>
          </div>
        </div>
        
        <div className="space-y-4">
          {enhancedAnalytics.topCouriers.slice(0, 5).map((courier: any, index: number) => (
            <div key={courier.name} className={clsx(
              'flex items-center justify-between p-4 rounded-lg transition-all duration-200 hover:shadow-md',
              isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'
            )}>
              <div className="flex items-center space-x-4">
                <div className={clsx(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
                  index === 0 ? 'bg-yellow-100 text-yellow-800' :
                  index === 1 ? 'bg-gray-100 text-gray-800' :
                  index === 2 ? 'bg-orange-100 text-orange-800' :
                  'bg-blue-100 text-blue-800'
                )}>
                  {index + 1}
                </div>
                <div>
                  <h4 className={clsx(
                    'font-medium',
                    isDark ? 'text-white' : 'text-gray-900'
                  )}>
                    {courier.name}
                  </h4>
                  <p className={clsx(
                    'text-sm',
                    isDark ? 'text-gray-400' : 'text-gray-600'
                  )}>
                    {courier.vehicleType === 'car' ? 'Автомобиль' : 'Мотоцикл'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-6">
                <div className="text-center">
                  <p className={clsx(
                    'text-sm font-medium',
                    isDark ? 'text-gray-400' : 'text-gray-600'
                  )}>
                    Заказов
                  </p>
                  <p className={clsx(
                    'text-lg font-bold',
                    isDark ? 'text-white' : 'text-gray-900'
                  )}>
                    {courier.totalOrders}
                  </p>
                </div>
                
                <div className="text-center">
                  <p className={clsx(
                    'text-sm font-medium',
                    isDark ? 'text-gray-400' : 'text-gray-600'
                  )}>
                    Эффективность
                  </p>
                  <p className="text-lg font-bold text-green-600">
                    {courier.efficiency.toFixed(2)}
                  </p>
                </div>
                
                <div className="text-center">
                  <p className={clsx(
                    'text-sm font-medium',
                    isDark ? 'text-gray-400' : 'text-gray-600'
                  )}>
                    Оценка
                  </p>
                  <p className="text-lg font-bold text-blue-600">
                    {courier.performanceScore.toFixed(0)}%
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
































