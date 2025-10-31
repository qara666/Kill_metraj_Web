import React, { useState, useMemo, useCallback } from 'react'
import { 
  ChartBarIcon, 
  MapIcon, 
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  EyeIcon,
  PlayIcon,
  PauseIcon,
  ArrowPathIcon,
  SparklesIcon,
  LightBulbIcon,
  FireIcon,
  BoltIcon
} from '@heroicons/react/24/outline'
import { useExcelData } from '../contexts/ExcelDataContext'
import { useTheme } from '../contexts/ThemeContext'
import { clsx } from 'clsx'

interface ChartData {
  labels: string[]
  datasets: {
    label: string
    data: number[]
    backgroundColor: string
    borderColor: string
    borderWidth: number
  }[]
}

interface MapMarker {
  id: string
  position: { lat: number; lng: number }
  type: 'courier' | 'order' | 'depot' | 'zone'
  title: string
  description: string
  color: string
  isActive: boolean
}

interface AnimationConfig {
  isPlaying: boolean
  speed: number
  currentFrame: number
  totalFrames: number
}

export const VisualizationDashboard: React.FC = () => {
  const { excelData } = useExcelData()
  const { isDark } = useTheme()
  const [selectedChart, setSelectedChart] = useState<'efficiency' | 'distance' | 'time' | 'revenue'>('efficiency')
  const [selectedPeriod, setSelectedPeriod] = useState<'day' | 'week' | 'month'>('week')
  const [mapView, setMapView] = useState<'routes' | 'couriers' | 'zones'>('routes')
  const [animationConfig, setAnimationConfig] = useState<AnimationConfig>({
    isPlaying: false,
    speed: 1,
    currentFrame: 0,
    totalFrames: 100
  })
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [, ] = useState<string>('')

  // Данные для графиков
  const chartData = useMemo((): ChartData => {
    if (!excelData) return { labels: [], datasets: [] }

    const couriers = excelData.couriers || []
    const routes = excelData.routes || []
    const orders = excelData.orders || []

    const courierNames = couriers.map((c: any) => c.name)
    
    let data: number[] = []
    let label = ''
    
    switch (selectedChart) {
      case 'efficiency':
        data = courierNames.map(name => {
          const courierRoutes = routes.filter((r: any) => r.courier === name)
          const courierOrders = orders.filter((o: any) => o.courier === name)
          return courierRoutes.length > 0 ? courierOrders.length / courierRoutes.length : 0
        })
        label = 'Эффективность (заказов/маршрут)'
        break
        
      case 'distance':
        data = courierNames.map(name => {
          const courierRoutes = routes.filter((r: any) => r.courier === name)
          return courierRoutes.reduce((sum: number, route: any) => sum + (route.totalDistance || 0), 0)
        })
        label = 'Общее расстояние (км)'
        break
        
      case 'time':
        data = courierNames.map(name => {
          const courierRoutes = routes.filter((r: any) => r.courier === name)
          return courierRoutes.reduce((sum: number, route: any) => sum + (route.totalDuration || 0), 0)
        })
        label = 'Общее время (мин)'
        break
        
      case 'revenue':
        data = courierNames.map(name => {
          const courierOrders = orders.filter((o: any) => o.courier === name)
          return courierOrders.reduce((sum: number, order: any) => sum + (order.amount || 0), 0)
        })
        label = 'Выручка (грн)'
        break
    }

    return {
      labels: courierNames,
      datasets: [{
        label,
        data,
        backgroundColor: isDark ? 'rgba(59, 130, 246, 0.5)' : 'rgba(59, 130, 246, 0.3)',
        borderColor: '#3B82F6',
        borderWidth: 2
      }]
    }
  }, [excelData, selectedChart, isDark])

  // Маркеры для карты
  const mapMarkers = useMemo((): MapMarker[] => {
    if (!excelData) return []

    const markers: MapMarker[] = []
    
    // Добавляем курьеров
    if (mapView === 'couriers' || mapView === 'routes') {
      const couriers = excelData.couriers || []
      couriers.forEach((courier: any) => {
        markers.push({
          id: `courier_${courier.name}`,
          position: {
            lat: 50.4501 + (Math.random() - 0.5) * 0.1,
            lng: 30.5234 + (Math.random() - 0.5) * 0.1
          },
          type: 'courier',
          title: courier.name,
          description: `${courier.vehicleType === 'car' ? 'Автомобиль' : 'Мотоцикл'}`,
          color: courier.vehicleType === 'car' ? '#10B981' : '#F59E0B',
          isActive: courier.isActive !== false
        })
      })
    }
    
    // Добавляем заказы
    if (mapView === 'routes') {
      const orders = excelData.orders || []
      orders.slice(0, 20).forEach((order: any) => {
        markers.push({
          id: `order_${order.id}`,
          position: {
            lat: 50.4501 + (Math.random() - 0.5) * 0.2,
            lng: 30.5234 + (Math.random() - 0.5) * 0.2
          },
          type: 'order',
          title: `Заказ #${order.orderNumber}`,
          description: order.address,
          color: '#3B82F6',
          isActive: true
        })
      })
    }
    
    // Добавляем зоны
    if (mapView === 'zones') {
      const zones = ['Центр', 'Оболонь', 'Печерск', 'Подол', 'Шевченковский']
      zones.forEach((zone, _index) => {
        markers.push({
          id: `zone_${zone}`,
          position: {
            lat: 50.4501 + (Math.random() - 0.5) * 0.3,
            lng: 30.5234 + (Math.random() - 0.5) * 0.3
          },
          type: 'zone',
          title: zone,
          description: `Зона доставки ${zone}`,
          color: '#8B5CF6',
          isActive: true
        })
      })
    }
    
    return markers
  }, [excelData, mapView])

  // Тренды и аналитика
  const trends = useMemo(() => {
    if (!excelData) return null

    const orders = excelData.orders || []
    const routes = excelData.routes || []
    
    // Простой анализ трендов
    const recentOrders = orders.slice(-20)
    const olderOrders = orders.slice(-40, -20)
    
    const recentAvg = recentOrders.reduce((sum: number, order: any) => sum + (order.amount || 0), 0) / recentOrders.length
    const olderAvg = olderOrders.reduce((sum: number, order: any) => sum + (order.amount || 0), 0) / olderOrders.length
    
    const revenueTrend = recentAvg > olderAvg ? 'up' : 'down'
    const efficiencyTrend = routes.filter((r: any) => r.isOptimized).length > routes.length / 2 ? 'up' : 'down'
    
    return {
      revenue: {
        trend: revenueTrend,
        change: Math.abs(((recentAvg - olderAvg) / olderAvg) * 100),
        current: recentAvg,
        previous: olderAvg
      },
      efficiency: {
        trend: efficiencyTrend,
        change: Math.abs(((recentOrders.length - olderOrders.length) / olderOrders.length) * 100),
        current: recentOrders.length,
        previous: olderOrders.length
      }
    }
  }, [excelData])

  // Запуск анимации
  const startAnimation = useCallback(() => {
    setAnimationConfig(prev => ({ ...prev, isPlaying: true }))
    
    const interval = setInterval(() => {
      setAnimationConfig(prev => {
        if (prev.currentFrame >= prev.totalFrames) {
          return { ...prev, isPlaying: false, currentFrame: 0 }
        }
        return { ...prev, currentFrame: prev.currentFrame + 1 }
      })
    }, 1000 / animationConfig.speed)
    
    return () => clearInterval(interval)
  }, [animationConfig.speed])

  // Остановка анимации
  const stopAnimation = useCallback(() => {
    setAnimationConfig(prev => ({ ...prev, isPlaying: false }))
  }, [])

  // Сброс анимации
  const resetAnimation = useCallback(() => {
    setAnimationConfig(prev => ({ ...prev, currentFrame: 0, isPlaying: false }))
  }, [])

  // Простой компонент графика
  const SimpleChart: React.FC<{ data: ChartData }> = ({ data }) => {
    const maxValue = Math.max(...data.datasets[0]?.data || [0])
    
    return (
      <div className="h-64 flex items-end justify-between space-x-2">
        {data.labels.map((label, index) => {
          const value = data.datasets[0]?.data[index] || 0
          const height = (value / maxValue) * 100
          
          return (
            <div key={label} className="flex-1 flex flex-col items-center">
              <div className="w-full bg-gray-200 rounded-t" style={{ height: '200px' }}>
                <div 
                  className="bg-blue-500 rounded-t transition-all duration-500 ease-out"
                  style={{ height: `${height}%` }}
                ></div>
              </div>
              <div className="mt-2 text-xs text-gray-600 text-center">
                {label.length > 8 ? label.substring(0, 8) + '...' : label}
              </div>
              <div className="text-xs font-medium text-gray-900">
                {value.toFixed(1)}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // Компонент карты
  const SimpleMap: React.FC<{ markers: MapMarker[] }> = ({ markers }) => {
    return (
      <div className="relative h-96 bg-gray-100 rounded-lg overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-100 to-green-100">
          {/* Имитация карты */}
          <div className="absolute inset-0 opacity-20">
            <div className="grid grid-cols-10 grid-rows-10 h-full">
              {Array.from({ length: 100 }).map((_, i) => (
                <div key={i} className="border border-gray-300"></div>
              ))}
            </div>
          </div>
          
          {/* Маркеры */}
          {markers.map((marker) => (
            <div
              key={marker.id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300 hover:scale-110"
              style={{
                left: `${30 + (marker.position.lng - 30.5234) * 1000}%`,
                top: `${30 + (marker.position.lat - 50.4501) * 1000}%`
              }}
            >
              <div
                className="w-4 h-4 rounded-full border-2 border-white shadow-lg cursor-pointer"
                style={{ backgroundColor: marker.color }}
                title={`${marker.title}: ${marker.description}`}
              ></div>
            </div>
          ))}
        </div>
        
        {/* Легенда */}
        <div className="absolute top-4 left-4 bg-white bg-opacity-90 rounded-lg p-3">
          <h4 className="font-medium text-gray-900 mb-2">Легенда</h4>
          <div className="space-y-1 text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span>Курьеры (авто)</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <span>Курьеры (мото)</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span>Заказы</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
              <span>Зоны</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={clsx(
        'rounded-lg shadow-sm border p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className={clsx(
              'text-2xl font-bold',
              isDark ? 'text-white' : 'text-gray-900'
            )}>
              Визуализация данных
            </h1>
            <p className={clsx(
              'mt-1 text-sm',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              Интерактивные карты, графики и анимации
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <SparklesIcon className="h-6 w-6 text-purple-600" />
            <span className={clsx(
              'text-sm font-medium',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              Визуализация
            </span>
          </div>
        </div>
      </div>

      {/* Контролы */}
      <div className={clsx(
        'rounded-lg shadow-sm border p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className={clsx(
              'block text-sm font-medium mb-2',
              isDark ? 'text-gray-400' : 'text-gray-700'
            )}>
              Тип графика
            </label>
            <select
              value={selectedChart}
              onChange={(e) => setSelectedChart(e.target.value as any)}
              className={clsx(
                'w-full px-3 py-2 rounded-lg border text-sm',
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white' 
                  : 'bg-white border-gray-300 text-gray-900'
              )}
            >
              <option value="efficiency">Эффективность</option>
              <option value="distance">Расстояние</option>
              <option value="time">Время</option>
              <option value="revenue">Выручка</option>
            </select>
          </div>
          
          <div>
            <label className={clsx(
              'block text-sm font-medium mb-2',
              isDark ? 'text-gray-400' : 'text-gray-700'
            )}>
              Период
            </label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value as any)}
              className={clsx(
                'w-full px-3 py-2 rounded-lg border text-sm',
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white' 
                  : 'bg-white border-gray-300 text-gray-900'
              )}
            >
              <option value="day">День</option>
              <option value="week">Неделя</option>
              <option value="month">Месяц</option>
            </select>
          </div>
          
          <div>
            <label className={clsx(
              'block text-sm font-medium mb-2',
              isDark ? 'text-gray-400' : 'text-gray-700'
            )}>
              Вид карты
            </label>
            <select
              value={mapView}
              onChange={(e) => setMapView(e.target.value as any)}
              className={clsx(
                'w-full px-3 py-2 rounded-lg border text-sm',
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white' 
                  : 'bg-white border-gray-300 text-gray-900'
              )}
            >
              <option value="routes">Маршруты</option>
              <option value="couriers">Курьеры</option>
              <option value="zones">Зоны</option>
            </select>
          </div>
          
          <div className="flex items-end space-x-2">
            <button
              onClick={showHeatmap ? () => setShowHeatmap(false) : () => setShowHeatmap(true)}
              className={clsx(
                'flex-1 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200',
                showHeatmap 
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              )}
            >
              {showHeatmap ? 'Скрыть' : 'Показать'} тепловую карту
            </button>
          </div>
        </div>
      </div>

      {/* Графики */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={clsx(
          'rounded-lg shadow-sm border p-6',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={clsx(
              'text-lg font-medium',
              isDark ? 'text-white' : 'text-gray-900'
            )}>
              График {selectedChart === 'efficiency' ? 'эффективности' :
                      selectedChart === 'distance' ? 'расстояния' :
                      selectedChart === 'time' ? 'времени' : 'выручки'}
            </h3>
            
            <div className="flex items-center space-x-2">
              <ChartBarIcon className="h-5 w-5 text-blue-600" />
              <span className="text-sm text-gray-600">Интерактивный</span>
            </div>
          </div>
          
          <SimpleChart data={chartData} />
        </div>

        {/* Тренды */}
        <div className={clsx(
          'rounded-lg shadow-sm border p-6',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <h3 className={clsx(
            'text-lg font-medium mb-4',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            Тренды и аналитика
          </h3>
          
          {trends && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Выручка</p>
                    <p className="text-xs text-gray-600">Изменение за период</p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center space-x-1">
                      {trends.revenue.trend === 'up' ? (
                        <ArrowTrendingUpIcon className="h-4 w-4 text-green-600" />
                      ) : (
                        <ArrowTrendingDownIcon className="h-4 w-4 text-red-600" />
                      )}
                      <span className={clsx(
                        'text-sm font-bold',
                        trends.revenue.trend === 'up' ? 'text-green-600' : 'text-red-600'
                      )}>
                        {trends.revenue.change.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">
                      {trends.revenue.current.toFixed(0)} грн
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Эффективность</p>
                    <p className="text-xs text-gray-600">Количество заказов</p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center space-x-1">
                      {trends.efficiency.trend === 'up' ? (
                        <ArrowTrendingUpIcon className="h-4 w-4 text-green-600" />
                      ) : (
                        <ArrowTrendingDownIcon className="h-4 w-4 text-red-600" />
                      )}
                      <span className={clsx(
                        'text-sm font-bold',
                        trends.efficiency.trend === 'up' ? 'text-green-600' : 'text-red-600'
                      )}>
                        {trends.efficiency.change.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">
                      {trends.efficiency.current} заказов
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Интерактивная карта */}
      <div className={clsx(
        'rounded-lg shadow-sm border p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={clsx(
            'text-lg font-medium',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            Интерактивная карта
          </h3>
          
          <div className="flex items-center space-x-2">
            <MapIcon className="h-5 w-5 text-green-600" />
            <span className="text-sm text-gray-600">
              {mapMarkers.length} маркеров
            </span>
          </div>
        </div>
        
        <SimpleMap markers={mapMarkers} />
      </div>

      {/* Анимации */}
      <div className={clsx(
        'rounded-lg shadow-sm border p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={clsx(
            'text-lg font-medium',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            Анимации переходов
          </h3>
          
          <div className="flex items-center space-x-2">
            <BoltIcon className="h-5 w-5 text-yellow-600" />
            <span className="text-sm text-gray-600">Анимированная визуализация</span>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg text-white">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium">Прогресс анимации</h4>
              <span className="text-sm">
                {animationConfig.currentFrame}/{animationConfig.totalFrames}
              </span>
            </div>
            
            <div className="w-full bg-white bg-opacity-20 rounded-full h-2 mb-4">
              <div 
                className="bg-white rounded-full h-2 transition-all duration-300"
                style={{ width: `${(animationConfig.currentFrame / animationConfig.totalFrames) * 100}%` }}
              ></div>
            </div>
            
            <div className="flex space-x-2">
              {!animationConfig.isPlaying ? (
                <button
                  onClick={startAnimation}
                  className="px-3 py-1 bg-white bg-opacity-20 rounded text-sm hover:bg-opacity-30 transition-colors"
                >
                  <PlayIcon className="h-4 w-4 mr-1 inline" />
                  Запустить
                </button>
              ) : (
                <button
                  onClick={stopAnimation}
                  className="px-3 py-1 bg-white bg-opacity-20 rounded text-sm hover:bg-opacity-30 transition-colors"
                >
                  <PauseIcon className="h-4 w-4 mr-1 inline" />
                  Пауза
                </button>
              )}
              
              <button
                onClick={resetAnimation}
                className="px-3 py-1 bg-white bg-opacity-20 rounded text-sm hover:bg-opacity-30 transition-colors"
              >
                <ArrowPathIcon className="h-4 w-4 mr-1 inline" />
                Сброс
              </button>
            </div>
          </div>
          
          <div className="p-4 bg-gradient-to-r from-green-500 to-blue-600 rounded-lg text-white">
            <h4 className="font-medium mb-2">Тепловая карта</h4>
            <p className="text-sm opacity-90 mb-4">
              {showHeatmap ? 'Активна' : 'Неактивна'}
            </p>
            
            <div className="grid grid-cols-3 gap-1">
              {Array.from({ length: 9 }).map((_, _i) => (
                <div
                  key={_i}
                  className={clsx(
                    'h-8 rounded transition-all duration-500',
                    showHeatmap 
                      ? 'bg-red-500 opacity-80' 
                      : 'bg-white bg-opacity-20'
                  )}
                  style={{
                    animationDelay: `${_i * 0.1}s`,
                    animation: showHeatmap ? 'pulse 2s infinite' : 'none'
                  }}
                ></div>
              ))}
            </div>
          </div>
          
          <div className="p-4 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg text-white">
            <h4 className="font-medium mb-2">Эффекты переходов</h4>
            <p className="text-sm opacity-90 mb-4">
              Плавные анимации
            </p>
            
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                <span className="text-xs">Hover эффекты</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                <span className="text-xs">Анимация загрузки</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-white rounded-full animate-spin"></div>
                <span className="text-xs">Вращающиеся элементы</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Дополнительные визуализации */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={clsx(
          'rounded-lg shadow-sm border p-6',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <h3 className={clsx(
            'text-lg font-medium mb-4',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            Цветовая индикация статусов
          </h3>
          
          <div className="space-y-3">
            <div className="flex items-center space-x-3 p-3 bg-green-50 rounded-lg">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-sm text-gray-700">Онлайн курьеры</span>
            </div>
            
            <div className="flex items-center space-x-3 p-3 bg-yellow-50 rounded-lg">
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <span className="text-sm text-gray-700">Занятые курьеры</span>
            </div>
            
            <div className="flex items-center space-x-3 p-3 bg-red-50 rounded-lg">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span className="text-sm text-gray-700">Офлайн курьеры</span>
            </div>
            
            <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span className="text-sm text-gray-700">Активные маршруты</span>
            </div>
          </div>
        </div>

        <div className={clsx(
          'rounded-lg shadow-sm border p-6',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <h3 className={clsx(
            'text-lg font-medium mb-4',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            Интерактивные элементы
          </h3>
          
          <div className="space-y-3">
            <button className="w-full p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-200 transform hover:scale-105">
              <div className="flex items-center justify-center space-x-2">
                <EyeIcon className="h-4 w-4" />
                <span>Просмотр деталей</span>
              </div>
            </button>
            
            <button className="w-full p-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all duration-200 transform hover:scale-105">
              <div className="flex items-center justify-center space-x-2">
                <LightBulbIcon className="h-4 w-4" />
                <span>Предложения</span>
              </div>
            </button>
            
            <button className="w-full p-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all duration-200 transform hover:scale-105">
              <div className="flex items-center justify-center space-x-2">
                <FireIcon className="h-4 w-4" />
                <span>Аналитика</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
































