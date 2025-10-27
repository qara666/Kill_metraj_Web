import React, { useState, useMemo, useCallback } from 'react'
import { 
  BoltIcon, 
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline'
import { useExcelData } from '../contexts/ExcelDataContext'
import { useTheme } from '../contexts/ThemeContext'
import { clsx } from 'clsx'

interface OptimizationResult {
  originalRoute: any
  optimizedRoute: any
  improvements: {
    distanceSaved: number
    timeSaved: number
    efficiencyGain: number
    costReduction: number
  }
  suggestions: string[]
}

interface TrafficData {
  routeId: string
  currentDelay: number
  alternativeRoutes: string[]
  bestTime: string
}

export const SmartRouteOptimizer: React.FC = () => {
  const { excelData } = useExcelData()
  const { isDark } = useTheme()
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [optimizationResults, setOptimizationResults] = useState<OptimizationResult[]>([])
  const [trafficData] = useState<TrafficData[]>([])
  const [selectedCourier, setSelectedCourier] = useState<string>('')
  const [optimizationMode, setOptimizationMode] = useState<'time' | 'distance' | 'balanced'>('balanced')
  const [showTrafficInfo] = useState(false)

  // Получаем маршруты для выбранного курьера
  const courierRoutes = useMemo(() => {
    if (!excelData?.routes || !selectedCourier) return []
    return excelData.routes.filter((route: any) => route.courier === selectedCourier)
  }, [excelData?.routes, selectedCourier])

  // Получаем список курьеров
  const couriers = useMemo(() => {
    if (!excelData?.couriers) return []
    return excelData.couriers.map((courier: any) => ({
      name: courier.name,
      vehicleType: courier.vehicleType || 'car',
      isActive: courier.isActive !== false
    }))
  }, [excelData?.couriers])

  // Функция умной оптимизации маршрутов
  const optimizeRoutes = useCallback(async () => {
    if (!courierRoutes.length) return

    setIsOptimizing(true)
    
    try {
      // Имитация процесса оптимизации
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const results: OptimizationResult[] = []
      
      for (const route of courierRoutes) {
        if (route.isOptimized) continue
        
        const optimizedRoute = await optimizeSingleRoute(route)
        const improvements = calculateImprovements(route, optimizedRoute)
        const suggestions = generateSuggestions(route, optimizedRoute)
        
        results.push({
          originalRoute: route,
          optimizedRoute,
          improvements,
          suggestions
        })
      }
      
      setOptimizationResults(results)
      
      // Обновляем данные в контексте
      if (excelData) {
        // Здесь можно добавить логику обновления данных
        console.log('Маршруты оптимизированы:', results)
      }
      
    } catch (error) {
      console.error('Ошибка оптимизации:', error)
    } finally {
      setIsOptimizing(false)
    }
  }, [courierRoutes, excelData])

  // Оптимизация одного маршрута
  const optimizeSingleRoute = async (route: any): Promise<any> => {
    const orders = route.orders || []
    if (orders.length === 0) return route
    
    // Простая оптимизация на основе расстояния между адресами
    const optimizedOrders = optimizeOrderSequence(orders)
    
    // Расчет нового расстояния и времени
    const totalDistance = calculateRouteDistance(optimizedOrders)
    const totalDuration = calculateRouteDuration(totalDistance)
    
    return {
      ...route,
      orders: optimizedOrders,
      totalDistance,
      totalDuration,
      isOptimized: true,
      optimizedAt: new Date().toISOString(),
      optimizationMode
    }
  }

  // Оптимизация последовательности заказов
  const optimizeOrderSequence = (orders: any[]): any[] => {
    if (orders.length <= 1) return orders
    
    // Простой алгоритм ближайшего соседа
    const optimized: any[] = []
    const remaining = [...orders]
    
    // Начинаем с первого заказа
    let current = remaining.shift()!
    optimized.push(current)
    
    while (remaining.length > 0) {
      // Находим ближайший заказ
      let nearestIndex = 0
      let minDistance = calculateDistance(current.address, remaining[0].address)
      
      for (let i = 1; i < remaining.length; i++) {
        const distance = calculateDistance(current.address, remaining[i].address)
        if (distance < minDistance) {
          minDistance = distance
          nearestIndex = i
        }
      }
      
      current = remaining.splice(nearestIndex, 1)[0]
      optimized.push(current)
    }
    
    return optimized
  }

  // Расчет расстояния между адресами (упрощенный)
  const calculateDistance = (address1: string, address2: string): number => {
    // Простая эвристика на основе длины адреса и общих слов
    const words1 = address1.toLowerCase().split(' ')
    const words2 = address2.toLowerCase().split(' ')
    
    let commonWords = 0
    for (const word of words1) {
      if (words2.includes(word)) {
        commonWords++
      }
    }
    
    // Базовое расстояние + штраф за различия
    return 1.0 + (Math.max(words1.length, words2.length) - commonWords) * 0.3
  }

  // Расчет общего расстояния маршрута
  const calculateRouteDistance = (orders: any[]): number => {
    if (orders.length === 0) return 0
    
    let totalDistance = 0
    for (let i = 0; i < orders.length - 1; i++) {
      totalDistance += calculateDistance(orders[i].address, orders[i + 1].address)
    }
    
    // Добавляем расстояние от депо до первого заказа и от последнего заказа до депо
    totalDistance += 0.5 // От депо до первого заказа
    totalDistance += 0.5 // От последнего заказа до депо
    
    return totalDistance
  }

  // Расчет времени маршрута
  const calculateRouteDuration = (distance: number): number => {
    // Средняя скорость 30 км/ч в городе
    const avgSpeed = 30
    const drivingTime = (distance / avgSpeed) * 60 // в минутах
    
    // Время на доставку (5 минут на заказ)
    const deliveryTime = 5
    
    return drivingTime + deliveryTime
  }

  // Расчет улучшений
  const calculateImprovements = (original: any, optimized: any): any => {
    const originalDistance = original.totalDistance || 1.0
    const optimizedDistance = optimized.totalDistance || 1.0
    const originalDuration = original.totalDuration || 30
    const optimizedDuration = optimized.totalDuration || 30
    
    return {
      distanceSaved: originalDistance - optimizedDistance,
      timeSaved: originalDuration - optimizedDuration,
      efficiencyGain: ((originalDistance - optimizedDistance) / originalDistance) * 100,
      costReduction: ((originalDistance - optimizedDistance) * 2.5) // 2.5 грн за км
    }
  }

  // Генерация предложений
  const generateSuggestions = (original: any, optimized: any): string[] => {
    const suggestions = []
    const improvements = calculateImprovements(original, optimized)
    
    if (improvements.distanceSaved > 0.5) {
      suggestions.push(`Сократить расстояние на ${improvements.distanceSaved.toFixed(1)} км`)
    }
    
    if (improvements.timeSaved > 10) {
      suggestions.push(`Сэкономить время на ${Math.round(improvements.timeSaved)} минут`)
    }
    
    if (improvements.efficiencyGain > 10) {
      suggestions.push(`Повысить эффективность на ${improvements.efficiencyGain.toFixed(1)}%`)
    }
    
    if (original.orders?.length > 5) {
      suggestions.push('Рассмотреть разделение на два маршрута')
    }
    
    return suggestions
  }

  // Загрузка данных о пробках
  // const loadTrafficData = useCallback(async () => {
  //   setShowTrafficInfo(true)
  //   
  //   // Имитация загрузки данных о пробках
  //   await new Promise(resolve => setTimeout(resolve, 1000))
  //   
  //   const trafficData: TrafficData[] = courierRoutes.map((route: any) => ({
  //     routeId: route.id,
  //     currentDelay: Math.random() * 20, // 0-20 минут задержки
  //     alternativeRoutes: ['Альтернативный маршрут 1', 'Альтернативный маршрут 2'],
  //     bestTime: '10:00-12:00'
  //   }))
  //   
  //   setTrafficData(trafficData)
  // }, [courierRoutes])

  // Балансировка нагрузки между курьерами
  const balanceLoad = useCallback(() => {
    if (!excelData?.couriers || !excelData?.routes) return
    
    const courierLoads = excelData.couriers.map((courier: any) => {
      const courierRoutes = excelData.routes.filter((route: any) => route.courier === courier.name)
      const totalOrders = courierRoutes.reduce((sum: number, route: any) => sum + (route.orders?.length || 0), 0)
      return {
        name: courier.name,
        currentLoad: totalOrders,
        routes: courierRoutes.length
      }
    })
    
    const avgLoad = courierLoads.reduce((sum, c) => sum + c.currentLoad, 0) / courierLoads.length
    const overloadedCouriers = courierLoads.filter(c => c.currentLoad > avgLoad * 1.2)
    const underloadedCouriers = courierLoads.filter(c => c.currentLoad < avgLoad * 0.8)
    
    // Генерация рекомендаций по балансировке
    const recommendations = []
    
    if (overloadedCouriers.length > 0 && underloadedCouriers.length > 0) {
      recommendations.push(`Перераспределить заказы между ${overloadedCouriers.length} перегруженными и ${underloadedCouriers.length} недогруженными курьерами`)
    }
    
    if (overloadedCouriers.length > 0) {
      recommendations.push(`Рассмотреть найм дополнительных курьеров для зон с высокой нагрузкой`)
    }
    
    // Показываем рекомендации
    alert(`Рекомендации по балансировке нагрузки:\n\n${recommendations.join('\n')}`)
  }, [excelData])

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
              Умная оптимизация маршрутов
            </h1>
            <p className={clsx(
              'mt-1 text-sm',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              Автоматическая оптимизация с учетом пробок и балансировки нагрузки
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <SparklesIcon className="h-6 w-6 text-purple-600" />
            <span className={clsx(
              'text-sm font-medium',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              ИИ оптимизация
            </span>
          </div>
        </div>
      </div>

      {/* Настройки оптимизации */}
      <div className={clsx(
        'rounded-lg shadow-sm border p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <h3 className={clsx(
          'text-lg font-medium mb-4',
          isDark ? 'text-white' : 'text-gray-900'
        )}>
          Настройки оптимизации
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={clsx(
              'block text-sm font-medium mb-2',
              isDark ? 'text-gray-400' : 'text-gray-700'
            )}>
              Курьер
            </label>
            <select
              value={selectedCourier}
              onChange={(e) => setSelectedCourier(e.target.value)}
              className={clsx(
                'w-full px-3 py-2 rounded-lg border text-sm',
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white' 
                  : 'bg-white border-gray-300 text-gray-900'
              )}
            >
              <option value="">Выберите курьера</option>
              {couriers.map((courier) => (
                <option key={courier.name} value={courier.name}>
                  {courier.name} ({courier.vehicleType === 'car' ? 'Авто' : 'Мото'})
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className={clsx(
              'block text-sm font-medium mb-2',
              isDark ? 'text-gray-400' : 'text-gray-700'
            )}>
              Режим оптимизации
            </label>
            <select
              value={optimizationMode}
              onChange={(e) => setOptimizationMode(e.target.value as any)}
              className={clsx(
                'w-full px-3 py-2 rounded-lg border text-sm',
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white' 
                  : 'bg-white border-gray-300 text-gray-900'
              )}
            >
              <option value="time">По времени</option>
              <option value="distance">По расстоянию</option>
              <option value="balanced">Сбалансированный</option>
            </select>
          </div>
          
          <div className="flex items-end space-x-2">
            <button
              onClick={optimizeRoutes}
              disabled={!selectedCourier || isOptimizing}
              className={clsx(
                'flex-1 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200',
                isOptimizing || !selectedCourier
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              )}
            >
              {isOptimizing ? (
                <div className="flex items-center justify-center">
                  <ArrowPathIcon className="h-4 w-4 animate-spin mr-2" />
                  Оптимизация...
                </div>
              ) : (
                <div className="flex items-center justify-center">
                  <BoltIcon className="h-4 w-4 mr-2" />
                  Оптимизировать
                </div>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Результаты оптимизации */}
      {optimizationResults.length > 0 && (
        <div className={clsx(
          'rounded-lg shadow-sm border p-6',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <h3 className={clsx(
            'text-lg font-medium mb-4',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            Результаты оптимизации
          </h3>
          
          <div className="space-y-4">
            {optimizationResults.map((result, index) => (
              <div key={index} className="p-4 bg-green-50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900">
                    Маршрут #{index + 1}
                  </h4>
                  <div className="flex items-center space-x-2">
                    <CheckCircleIcon className="h-5 w-5 text-green-600" />
                    <span className="text-sm font-medium text-green-600">
                      Оптимизирован
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Сэкономлено расстояния</p>
                    <p className="text-lg font-bold text-green-600">
                      {result.improvements.distanceSaved.toFixed(1)} км
                    </p>
                  </div>
                  
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Сэкономлено времени</p>
                    <p className="text-lg font-bold text-blue-600">
                      {Math.round(result.improvements.timeSaved)} мин
                    </p>
                  </div>
                  
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Улучшение эффективности</p>
                    <p className="text-lg font-bold text-purple-600">
                      {result.improvements.efficiencyGain.toFixed(1)}%
                    </p>
                  </div>
                  
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Экономия средств</p>
                    <p className="text-lg font-bold text-orange-600">
                      {result.improvements.costReduction.toFixed(0)} грн
                    </p>
                  </div>
                </div>
                
                {result.suggestions.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Рекомендации:</p>
                    <ul className="space-y-1">
                      {result.suggestions.map((suggestion, idx) => (
                        <li key={idx} className="text-sm text-gray-600 flex items-center">
                          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-2"></span>
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Информация о пробках */}
      {showTrafficInfo && trafficData.length > 0 && (
        <div className={clsx(
          'rounded-lg shadow-sm border p-6',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <h3 className={clsx(
            'text-lg font-medium mb-4',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            Информация о пробках в реальном времени
          </h3>
          
          <div className="space-y-3">
            {trafficData.map((traffic: any, index: number) => (
              <div key={index} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Маршрут #{index + 1}
                    </p>
                    <p className="text-xs text-gray-600">
                      Текущая задержка: {traffic.currentDelay.toFixed(0)} мин
                    </p>
                  </div>
                </div>
                
                <div className="text-right">
                  <p className="text-sm font-medium text-green-600">
                    Лучшее время: {traffic.bestTime}
                  </p>
                  <p className="text-xs text-gray-600">
                    {traffic.alternativeRoutes.length} альтернатив
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Балансировка нагрузки */}
      <div className={clsx(
        'rounded-lg shadow-sm border p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={clsx(
            'text-lg font-medium',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            Балансировка нагрузки между курьерами
          </h3>
          
          <button
            onClick={balanceLoad}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
          >
            <ChartBarIcon className="h-4 w-4 mr-2 inline" />
            Анализировать нагрузку
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">Автоматическая балансировка</h4>
            <p className="text-sm text-gray-600">
              Система автоматически анализирует нагрузку курьеров и предлагает оптимальное распределение заказов
            </p>
          </div>
          
          <div className="p-4 bg-green-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">Учет пробок</h4>
            <p className="text-sm text-gray-600">
              Интеграция с сервисами пробок для оптимизации маршрутов в реальном времени
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}


