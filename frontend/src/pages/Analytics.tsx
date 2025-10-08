import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { 
  ChartBarIcon, 
  TruckIcon, 
  MapPinIcon, 
  ClockIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon
} from '@heroicons/react/24/outline'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { useExcelData } from '../contexts/ExcelDataContext'
import * as api from '../services/api'

export const Analytics: React.FC = () => {
  const { excelData } = useExcelData()
  const { isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => api.analyticsApi.getDashboardAnalytics(),
  })

  if (isLoading) {
    return <LoadingSpinner />
  }

  // Используем данные из Excel если они есть, иначе из API
  // const analytics = excelData?.statistics || analyticsData?.data

  // Расширенная аналитика на основе данных Excel
  const enhancedAnalytics = useMemo(() => {
    if (!excelData) return null

    const { orders, couriers, routes } = excelData

    // Анализ курьеров
    const courierStats = couriers?.map((courier: any) => {
      const courierOrders = orders?.filter((order: any) => order.courier === courier.name) || []
      const courierRoutes = routes?.filter((route: any) => route.courier === courier.name) || []
      
      return {
        name: courier.name,
        vehicleType: courier.vehicleType || 'car',
        totalOrders: courierOrders.length,
        totalAmount: courierOrders.reduce((sum: number, order: any) => sum + (order.amount || 0), 0),
        totalDistance: courier.totalDistance || 0,
        routesCount: courierRoutes.length,
        averageOrderValue: courierOrders.length > 0 ? 
          courierOrders.reduce((sum: number, order: any) => sum + (order.amount || 0), 0) / courierOrders.length : 0,
        efficiency: courierRoutes.length > 0 ? 
          courierOrders.length / courierRoutes.length : 0
      }
    }) || []

    // Анализ по типам транспорта
    const vehicleTypeStats = {
      car: courierStats.filter((c: any) => c.vehicleType === 'car'),
      motorcycle: courierStats.filter((c: any) => c.vehicleType === 'motorcycle')
    }

    // Анализ по зонам доставки
    const zoneStats = orders?.reduce((zones: any, order: any) => {
      const zone = order.zone || 'Неизвестно'
      if (!zones[zone]) {
        zones[zone] = { count: 0, amount: 0 }
      }
      zones[zone].count++
      zones[zone].amount += order.amount || 0
      return zones
    }, {}) || {}

    // Анализ по времени
    const timeStats = orders?.reduce((stats: any, order: any) => {
      const hour = new Date(order.created || Date.now()).getHours()
      const timeSlot = hour < 12 ? 'Утро' : hour < 18 ? 'День' : 'Вечер'
      
      if (!stats[timeSlot]) {
        stats[timeSlot] = { count: 0, amount: 0 }
      }
      stats[timeSlot].count++
      stats[timeSlot].amount += order.amount || 0
      return stats
    }, {}) || {}

    // Топ курьеры по эффективности
    const topCouriers = [...courierStats]
      .sort((a: any, b: any) => b.efficiency - a.efficiency)
      .slice(0, 5)

    // Анализ маршрутов
    const routeStats = {
      totalRoutes: routes?.length || 0,
      optimizedRoutes: routes?.filter((route: any) => route.isOptimized).length || 0,
      totalDistance: routes?.reduce((sum: number, route: any) => sum + (route.totalDistance || 0), 0) || 0,
      averageRouteDistance: routes?.length > 0 ? 
        routes.reduce((sum: number, route: any) => sum + (route.totalDistance || 0), 0) / routes.length : 0
    }

    return {
      courierStats,
      vehicleTypeStats,
      zoneStats,
      timeStats,
      topCouriers,
      routeStats,
      totalOrders: orders?.length || 0,
      totalAmount: orders?.reduce((sum: number, order: any) => sum + (order.amount || 0), 0) || 0,
      averageOrderValue: orders?.length > 0 ? 
        orders.reduce((sum: number, order: any) => sum + (order.amount || 0), 0) / orders.length : 0
    }
  }, [excelData])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="mt-1 text-sm text-gray-600">
              Performance metrics and delivery statistics
            </p>
          </div>
        </div>
      </div>

      {/* Analytics Content */}
      {!enhancedAnalytics ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
          <div className="text-center">
            <ChartBarIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Нет данных для аналитики</h3>
            <p className="mt-1 text-sm text-gray-500">
              Загрузите Excel файл для просмотра аналитики.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Основная статистика */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <TruckIcon className="h-8 w-8 text-blue-600" />
                </div>
                <div className="ml-4">
                  <h3 className="text-sm font-medium text-gray-600">Всего заказов</h3>
                  <p className="text-2xl font-bold text-gray-900">
                    {enhancedAnalytics.totalOrders}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CurrencyDollarIcon className="h-8 w-8 text-green-600" />
                </div>
                <div className="ml-4">
                  <h3 className="text-sm font-medium text-gray-600">Общая сумма</h3>
                  <p className="text-2xl font-bold text-gray-900">
                    {enhancedAnalytics.totalAmount.toFixed(0)} грн
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <MapPinIcon className="h-8 w-8 text-purple-600" />
                </div>
                <div className="ml-4">
                  <h3 className="text-sm font-medium text-gray-600">Маршрутов</h3>
                  <p className="text-2xl font-bold text-gray-900">
                    {enhancedAnalytics.routeStats.totalRoutes}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ClockIcon className="h-8 w-8 text-orange-600" />
                </div>
                <div className="ml-4">
                  <h3 className="text-sm font-medium text-gray-600">Средний чек</h3>
                  <p className="text-2xl font-bold text-gray-900">
                    {enhancedAnalytics.averageOrderValue.toFixed(0)} грн
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Анализ по типам транспорта */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Анализ по типам транспорта</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                  <div className="flex items-center">
                    <TruckIcon className="h-6 w-6 text-green-600 mr-3" />
                    <span className="font-medium text-gray-900">Автомобили</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">{enhancedAnalytics.vehicleTypeStats.car.length} курьеров</p>
                    <p className="text-lg font-bold text-green-600">
                      {enhancedAnalytics.vehicleTypeStats.car.reduce((sum: number, c: any) => sum + c.totalOrders, 0)} заказов
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg">
                  <div className="flex items-center">
                    <TruckIcon className="h-6 w-6 text-orange-600 mr-3" />
                    <span className="font-medium text-gray-900">Мотоциклы</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">{enhancedAnalytics.vehicleTypeStats.motorcycle.length} курьеров</p>
                    <p className="text-lg font-bold text-orange-600">
                      {enhancedAnalytics.vehicleTypeStats.motorcycle.reduce((sum: number, c: any) => sum + c.totalOrders, 0)} заказов
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Топ курьеры */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Топ курьеры по эффективности</h3>
              <div className="space-y-3">
                {enhancedAnalytics.topCouriers.map((courier: any, index: number) => (
                  <div key={courier.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      <span className="w-6 h-6 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-xs font-medium mr-3">
                        {index + 1}
                      </span>
                      <span className="font-medium text-gray-900">{courier.name}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">{courier.totalOrders} заказов</p>
                      <p className="text-sm font-bold text-blue-600">
                        {courier.efficiency.toFixed(1)} зак/маршрут
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Анализ маршрутов */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Анализ маршрутов</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <MapPinIcon className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-blue-600">{enhancedAnalytics.routeStats.totalRoutes}</p>
                <p className="text-sm text-gray-600">Всего маршрутов</p>
              </div>
              
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <ArrowTrendingUpIcon className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-green-600">{enhancedAnalytics.routeStats.optimizedRoutes}</p>
                <p className="text-sm text-gray-600">Оптимизированных</p>
              </div>
              
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <ClockIcon className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-purple-600">
                  {enhancedAnalytics.routeStats.averageRouteDistance.toFixed(1)} км
                </p>
                <p className="text-sm text-gray-600">Среднее расстояние</p>
              </div>
            </div>
          </div>

          {/* Анализ по зонам */}
          {Object.keys(enhancedAnalytics.zoneStats).length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Анализ по зонам доставки</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(enhancedAnalytics.zoneStats).map(([zone, stats]: [string, any]) => (
                  <div key={zone} className="p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-medium text-gray-900">{zone}</h4>
                    <p className="text-sm text-gray-600">{stats.count} заказов</p>
                    <p className="text-lg font-bold text-blue-600">{stats.amount.toFixed(0)} грн</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
