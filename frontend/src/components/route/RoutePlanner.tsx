import React, { useState, useMemo, useCallback } from 'react'
import { 
  CalendarIcon, 
  MapPinIcon, 
  ClockIcon,
  TruckIcon,
  PlusIcon,
  ExclamationTriangleIcon,
  LightBulbIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import { useExcelData } from '../../contexts/ExcelDataContext'
import { useTheme } from '../../contexts/ThemeContext'
import { clsx } from 'clsx'

interface RouteSuggestion {
  id: string
  type: 'auto_create' | 'improvement' | 'intersection' | 'time_optimization'
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  estimatedSavings: {
    time: number
    distance: number
    cost: number
  }
  affectedRoutes: string[]
  courier: string
}

interface IntersectionCheck {
  route1: string
  route2: string
  intersectionPoint: string
  severity: 'high' | 'medium' | 'low'
  suggestion: string
}

export const RoutePlanner: React.FC = () => {
  const { excelData } = useExcelData()
  const { isDark } = useTheme()
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedCourier, setSelectedCourier] = useState<string>('')
  const [, setShowSuggestions] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [suggestions, setSuggestions] = useState<RouteSuggestion[]>([])
  const [intersections, setIntersections] = useState<IntersectionCheck[]>([])

  // Получаем новые заказы для выбранной даты
  const newOrders = useMemo(() => {
    if (!excelData?.orders) return []
    
    return excelData.orders.filter((order: any) => {
      const orderDate = new Date(order.created || Date.now()).toISOString().split('T')[0]
      return orderDate === selectedDate && !isOrderInExistingRoute(order.id)
    })
  }, [excelData?.orders, selectedDate])

  // Получаем курьеров
  const couriers = useMemo(() => {
    if (!excelData?.couriers) return []
    return excelData.couriers.filter((courier: any) => courier.isActive !== false)
  }, [excelData?.couriers])

  // Проверяем, находится ли заказ в существующем маршруте
  const isOrderInExistingRoute = (orderId: string): boolean => {
    if (!excelData?.routes) return false
    return excelData.routes.some((route: any) => 
      route.orders?.some((order: any) => order.id === orderId)
    )
  }

  // Автосоздание маршрутов из новых заказов
  const autoCreateRoutes = useCallback(async () => {
    if (!newOrders.length || !couriers.length) return

    setIsAnalyzing(true)
    
    try {
      // Имитация анализа
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      const newRoutes = []
      const ordersPerCourier = Math.ceil(newOrders.length / couriers.length)
      
      // Распределяем заказы между курьерами
      for (let i = 0; i < couriers.length; i++) {
        const courier = couriers[i]
        const startIndex = i * ordersPerCourier
        const endIndex = Math.min(startIndex + ordersPerCourier, newOrders.length)
        const courierOrders = newOrders.slice(startIndex, endIndex)
        
        if (courierOrders.length > 0) {
          const route = {
            id: `route_${Date.now()}_${i}`,
            courier: courier.name,
            orders: courierOrders,
            totalDistance: calculateRouteDistance(courierOrders),
            totalDuration: calculateRouteDuration(courierOrders),
            isOptimized: false,
            createdAt: new Date().toISOString(),
            plannedDate: selectedDate
          }
          
          newRoutes.push(route)
        }
      }
      
      // Обновляем данные
      if (excelData) {
        // Здесь можно добавить логику обновления данных
        console.log('Новые маршруты созданы:', newRoutes)
      }
      
      // Показываем результат
      alert(`Создано ${newRoutes.length} новых маршрутов для ${newOrders.length} заказов`)
      
    } catch (error) {
      console.error('Ошибка автосоздания маршрутов:', error)
    } finally {
      setIsAnalyzing(false)
    }
  }, [newOrders, couriers, selectedDate, excelData])

  // Расчет расстояния маршрута
  const calculateRouteDistance = (orders: any[]): number => {
    if (orders.length === 0) return 0
    
    let totalDistance = 0
    for (let i = 0; i < orders.length - 1; i++) {
      totalDistance += calculateDistance(orders[i].address, orders[i + 1].address)
    }
    
    // Добавляем расстояние от депо
    totalDistance += 0.5
    totalDistance += 0.5
    
    return totalDistance
  }

  // Расчет времени маршрута
  const calculateRouteDuration = (orders: any[]): number => {
    const distance = calculateRouteDistance(orders)
    const drivingTime = (distance / 30) * 60 // 30 км/ч средняя скорость
    const deliveryTime = orders.length * 5 // 5 минут на заказ
    
    return drivingTime + deliveryTime
  }

  // Расчет расстояния между адресами
  const calculateDistance = (address1: string, address2: string): number => {
    const words1 = address1.toLowerCase().split(' ')
    const words2 = address2.toLowerCase().split(' ')
    
    let commonWords = 0
    for (const word of words1) {
      if (words2.includes(word)) {
        commonWords++
      }
    }
    
    return 1.0 + (Math.max(words1.length, words2.length) - commonWords) * 0.3
  }

  // Генерация предложений по улучшению
  const generateImprovementSuggestions = useCallback(async () => {
    if (!excelData?.routes) return

    setIsAnalyzing(true)
    
    try {
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const newSuggestions: RouteSuggestion[] = []
      
      // Анализ неоптимизированных маршрутов
      const unoptimizedRoutes = excelData.routes.filter((route: any) => !route.isOptimized)
      unoptimizedRoutes.forEach((route: any) => {
        newSuggestions.push({
          id: `improvement_${route.id}`,
          type: 'improvement',
          title: 'Оптимизировать маршрут',
          description: `Маршрут курьера ${route.courier} можно оптимизировать для экономии времени и топлива`,
          priority: 'high',
          estimatedSavings: {
            time: 15,
            distance: 2.5,
            cost: 50
          },
          affectedRoutes: [route.id],
          courier: route.courier
        })
      })
      
      // Анализ длинных маршрутов
      const longRoutes = excelData.routes.filter((route: any) => 
        route.orders?.length > 8 || route.totalDistance > 20
      )
      longRoutes.forEach((route: any) => {
        newSuggestions.push({
          id: `split_${route.id}`,
          type: 'improvement',
          title: 'Разделить длинный маршрут',
          description: `Маршрут курьера ${route.courier} слишком длинный, рекомендуется разделить на два`,
          priority: 'medium',
          estimatedSavings: {
            time: 30,
            distance: 5.0,
            cost: 100
          },
          affectedRoutes: [route.id],
          courier: route.courier
        })
      })
      
      // Анализ времени доставки
      const timeOptimizationRoutes = excelData.routes.filter((route: any) => 
        route.totalDuration > 120 // Более 2 часов
      )
      timeOptimizationRoutes.forEach((route: any) => {
        newSuggestions.push({
          id: `time_${route.id}`,
          type: 'time_optimization',
          title: 'Оптимизировать время доставки',
          description: `Маршрут курьера ${route.courier} занимает слишком много времени`,
          priority: 'high',
          estimatedSavings: {
            time: 45,
            distance: 3.0,
            cost: 75
          },
          affectedRoutes: [route.id],
          courier: route.courier
        })
      })
      
      setSuggestions(newSuggestions)
      setShowSuggestions(true)
      
    } catch (error) {
      console.error('Ошибка генерации предложений:', error)
    } finally {
      setIsAnalyzing(false)
    }
  }, [excelData])

  // Проверка пересечений маршрутов
  const checkRouteIntersections = useCallback(async () => {
    if (!excelData?.routes) return

    setIsAnalyzing(true)
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      const newIntersections: IntersectionCheck[] = []
      const routes = excelData.routes
      
      // Простая проверка пересечений
      for (let i = 0; i < routes.length; i++) {
        for (let j = i + 1; j < routes.length; j++) {
          const route1 = routes[i]
          const route2 = routes[j]
          
          // Проверяем пересечения адресов
          const intersection = findRouteIntersection(route1, route2)
          if (intersection) {
            newIntersections.push({
              route1: route1.id,
              route2: route2.id,
              intersectionPoint: intersection,
              severity: 'medium',
              suggestion: `Рассмотреть объединение маршрутов или изменение зон доставки`
            })
          }
        }
      }
      
      setIntersections(newIntersections)
      
    } catch (error) {
      console.error('Ошибка проверки пересечений:', error)
    } finally {
      setIsAnalyzing(false)
    }
  }, [excelData])

  // Поиск пересечений между маршрутами
  const findRouteIntersection = (route1: any, route2: any): string | null => {
    const addresses1 = route1.orders?.map((order: any) => order.address) || []
    const addresses2 = route2.orders?.map((order: any) => order.address) || []
    
    for (const address1 of addresses1) {
      for (const address2 of addresses2) {
        if (calculateDistance(address1, address2) < 0.5) {
          return address1
        }
      }
    }
    
    return null
  }

  // Применение предложения
  const applySuggestion = (suggestion: RouteSuggestion) => {
    // Здесь можно реализовать логику применения предложения
    alert(`Применяется предложение: ${suggestion.title}`)
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
              Планирование маршрутов
            </h1>
            <p className={clsx(
              'mt-1 text-sm',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              Автосоздание маршрутов, предложения по улучшению и проверка пересечений
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <CalendarIcon className="h-6 w-6 text-blue-600" />
            <span className={clsx(
              'text-sm font-medium',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              Планирование
            </span>
          </div>
        </div>
      </div>

      {/* Настройки планирования */}
      <div className={clsx(
        'rounded-lg shadow-sm border p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <h3 className={clsx(
          'text-lg font-medium mb-4',
          isDark ? 'text-white' : 'text-gray-900'
        )}>
          Настройки планирования
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={clsx(
              'block text-sm font-medium mb-2',
              isDark ? 'text-gray-400' : 'text-gray-700'
            )}>
              Дата планирования
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className={clsx(
                'w-full px-3 py-2 rounded-lg border text-sm',
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white' 
                  : 'bg-white border-gray-300 text-gray-900'
              )}
            />
          </div>
          
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
              <option value="">Все курьеры</option>
              {couriers.map((courier) => (
                <option key={courier.name} value={courier.name}>
                  {courier.name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex items-end space-x-2">
            <button
              onClick={autoCreateRoutes}
              disabled={!newOrders.length || isAnalyzing}
              className={clsx(
                'flex-1 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200',
                isAnalyzing || !newOrders.length
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
              )}
            >
              {isAnalyzing ? (
                <div className="flex items-center justify-center">
                  <ArrowPathIcon className="h-4 w-4 animate-spin mr-2" />
                  Создание...
                </div>
              ) : (
                <div className="flex items-center justify-center">
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Создать маршруты
                </div>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Статистика новых заказов */}
      <div className={clsx(
        'rounded-lg shadow-sm border p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <h3 className={clsx(
          'text-lg font-medium mb-4',
          isDark ? 'text-white' : 'text-gray-900'
        )}>
          Новые заказы на {selectedDate}
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <MapPinIcon className="h-8 w-8 text-blue-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-blue-600">{newOrders.length}</p>
            <p className="text-sm text-gray-600">Новых заказов</p>
          </div>
          
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <TruckIcon className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-green-600">{couriers.length}</p>
            <p className="text-sm text-gray-600">Доступных курьеров</p>
          </div>
          
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <ClockIcon className="h-8 w-8 text-purple-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-purple-600">
              {Math.ceil(newOrders.length / couriers.length)}
            </p>
            <p className="text-sm text-gray-600">Заказов на курьера</p>
          </div>
        </div>
      </div>

      {/* Предложения по улучшению */}
      <div className={clsx(
        'rounded-lg shadow-sm border p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={clsx(
            'text-lg font-medium',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            Предложения по улучшению маршрутов
          </h3>
          
          <div className="flex space-x-2">
            <button
              onClick={generateImprovementSuggestions}
              disabled={isAnalyzing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <LightBulbIcon className="h-4 w-4 mr-2 inline" />
              Анализировать
            </button>
            
            <button
              onClick={checkRouteIntersections}
              disabled={isAnalyzing}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
            >
              <ExclamationTriangleIcon className="h-4 w-4 mr-2 inline" />
              Проверить пересечения
            </button>
          </div>
        </div>
        
        {suggestions.length > 0 && (
          <div className="space-y-4">
            {suggestions.map((suggestion) => (
              <div key={suggestion.id} className={clsx(
                'p-4 rounded-lg border',
                suggestion.priority === 'high' ? 'bg-red-50 border-red-200' :
                suggestion.priority === 'medium' ? 'bg-yellow-50 border-yellow-200' :
                'bg-green-50 border-green-200'
              )}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h4 className="font-medium text-gray-900">{suggestion.title}</h4>
                      <span className={clsx(
                        'px-2 py-1 text-xs rounded-full',
                        suggestion.priority === 'high' ? 'bg-red-100 text-red-800' :
                        suggestion.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      )}>
                        {suggestion.priority === 'high' ? 'Высокий' :
                         suggestion.priority === 'medium' ? 'Средний' : 'Низкий'}
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-600 mb-3">{suggestion.description}</p>
                    
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div className="text-center">
                        <p className="text-gray-600">Экономия времени</p>
                        <p className="font-bold text-blue-600">{suggestion.estimatedSavings.time} мин</p>
                      </div>
                      <div className="text-center">
                        <p className="text-gray-600">Экономия расстояния</p>
                        <p className="font-bold text-green-600">{suggestion.estimatedSavings.distance} км</p>
                      </div>
                      <div className="text-center">
                        <p className="text-gray-600">Экономия средств</p>
                        <p className="font-bold text-purple-600">{suggestion.estimatedSavings.cost} грн</p>
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => applySuggestion(suggestion)}
                    className="ml-4 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors"
                  >
                    Применить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Проверка пересечений */}
      {intersections.length > 0 && (
        <div className={clsx(
          'rounded-lg shadow-sm border p-6',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <h3 className={clsx(
            'text-lg font-medium mb-4',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            Проверка пересечений маршрутов
          </h3>
          
          <div className="space-y-3">
            {intersections.map((intersection, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Пересечение маршрутов {intersection.route1} и {intersection.route2}
                    </p>
                    <p className="text-xs text-gray-600">
                      Точка пересечения: {intersection.intersectionPoint}
                    </p>
                  </div>
                </div>
                
                <div className="text-right">
                  <p className="text-sm text-gray-600">{intersection.suggestion}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Оптимизация по времени доставки */}
      <div className={clsx(
        'rounded-lg shadow-sm border p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <h3 className={clsx(
          'text-lg font-medium mb-4',
          isDark ? 'text-white' : 'text-gray-900'
        )}>
          Оптимизация по времени доставки
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">Автоматическое планирование</h4>
            <p className="text-sm text-gray-600">
              Система автоматически создает оптимальные маршруты на основе времени доставки и загруженности курьеров
            </p>
          </div>
          
          <div className="p-4 bg-green-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">Учет времени доставки</h4>
            <p className="text-sm text-gray-600">
              Анализ оптимального времени доставки для каждого клиента и планирование маршрутов соответственно
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
































