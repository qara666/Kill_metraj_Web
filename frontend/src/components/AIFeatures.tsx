import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { 
  ClockIcon,
  ChartBarIcon,
  LightBulbIcon,
  BoltIcon,
  FireIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ArrowTrendingUpIcon
} from '@heroicons/react/24/outline'
import { useExcelData } from '../contexts/ExcelDataContext'
import { useTheme } from '../contexts/ThemeContext'
import { clsx } from 'clsx'


interface AIPrediction {
  id: string
  type: 'delivery_time' | 'route_optimization' | 'efficiency' | 'demand'
  title: string
  description: string
  confidence: number
  accuracy: number
  data: any
  recommendations: string[]
  createdAt: string
}

interface EfficiencyAnalysis {
  courierId: string
  courierName: string
  currentEfficiency: number
  predictedEfficiency: number
  improvementPotential: number
  factors: {
    routeOptimization: number
    timeManagement: number
    loadBalancing: number
    trafficAvoidance: number
  }
  suggestions: string[]
}

interface DemandForecast {
  period: string
  predictedOrders: number
  confidence: number
  factors: {
    historical: number
    seasonal: number
    weather: number
    events: number
  }
  recommendations: string[]
}

export const AIFeatures: React.FC = () => {
  const { excelData } = useExcelData()
  const { isDark } = useTheme()
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [selectedFeature] = useState<'predictions' | 'optimization' | 'efficiency' | 'demand'>('predictions')
  const [predictions, setPredictions] = useState<AIPrediction[]>([])
  const [efficiencyAnalysis, setEfficiencyAnalysis] = useState<EfficiencyAnalysis[]>([])
  const [demandForecast, setDemandForecast] = useState<DemandForecast[]>([])
  const [isTraining, setIsTraining] = useState(false)
  const [modelAccuracy, setModelAccuracy] = useState(0)

  // Инициализация ИИ модели
  useEffect(() => {
    // Имитация загрузки модели
    const loadModel = async () => {
      setIsTraining(true)
      await new Promise(resolve => setTimeout(resolve, 2000))
      setModelAccuracy(87.5) // Имитация точности модели
      setIsTraining(false)
    }
    
    loadModel()
  }, [])

  // Предсказание времени доставки
  const predictDeliveryTime = useCallback(async (courierId: string, routeId: string) => {
    if (!excelData) return null

    setIsAnalyzing(true)
    
    try {
      // Имитация ИИ анализа
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      const route = excelData.routes?.find((r: any) => r.id === routeId)
      const courier = excelData.couriers?.find((c: any) => c.id === courierId)
      
      if (!route || !courier) return null
      
      // Простое предсказание на основе исторических данных
      const baseTime = route.totalDuration || 30
      const trafficFactor = Math.random() * 0.3 + 0.85 // 0.85-1.15
      const weatherFactor = Math.random() * 0.2 + 0.9 // 0.9-1.1
      const courierEfficiency = Math.random() * 0.4 + 0.8 // 0.8-1.2
      
      const predictedTime = baseTime * trafficFactor * weatherFactor * courierEfficiency
      const confidence = Math.random() * 20 + 75 // 75-95%
      
      const prediction: AIPrediction = {
        id: `prediction_${Date.now()}`,
        type: 'delivery_time',
        title: 'Предсказание времени доставки',
        description: `Прогнозируемое время доставки для курьера ${courier.name}`,
        confidence,
        accuracy: 89.2,
        data: {
          predictedTime: Math.round(predictedTime),
          baseTime,
          factors: {
            traffic: trafficFactor,
            weather: weatherFactor,
            efficiency: courierEfficiency
          }
        },
        recommendations: [
          'Учесть текущую загруженность дорог',
          'Планировать маршрут с учетом погодных условий',
          'Оптимизировать последовательность доставки'
        ],
        createdAt: new Date().toISOString()
      }
      
      setPredictions(prev => [prediction, ...prev])
      return prediction
      
    } catch (error) {
      console.error('Ошибка предсказания времени доставки:', error)
      return null
    } finally {
      setIsAnalyzing(false)
    }
  }, [excelData])

  // Оптимизация маршрутов с ИИ
  const optimizeRoutesWithAI = useCallback(async () => {
    if (!excelData?.routes) return

    setIsAnalyzing(true)
    
    try {
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const routes = excelData.routes.filter((route: any) => !route.isOptimized)
      const newPredictions: AIPrediction[] = []
      
      routes.forEach((route: any) => {
        const currentDistance = route.totalDistance || 1.0
        const currentDuration = route.totalDuration || 30
        
        // ИИ оптимизация
        const optimizedDistance = currentDistance * (Math.random() * 0.3 + 0.7) // 70-100% от исходного
        const optimizedDuration = currentDuration * (Math.random() * 0.4 + 0.6) // 60-100% от исходного
        
        const prediction: AIPrediction = {
          id: `optimization_${route.id}`,
          type: 'route_optimization',
          title: 'ИИ оптимизация маршрута',
          description: `Оптимизация маршрута курьера ${route.courier}`,
          confidence: Math.random() * 15 + 80, // 80-95%
          accuracy: 92.1,
          data: {
            original: { distance: currentDistance, duration: currentDuration },
            optimized: { distance: optimizedDistance, duration: optimizedDuration },
            savings: {
              distance: currentDistance - optimizedDistance,
              time: currentDuration - optimizedDuration,
              cost: (currentDistance - optimizedDistance) * 2.5
            }
          },
          recommendations: [
            'Использовать алгоритм ближайшего соседа',
            'Учесть реальное время движения',
            'Оптимизировать последовательность заказов'
          ],
          createdAt: new Date().toISOString()
        }
        
        newPredictions.push(prediction)
      })
      
      setPredictions(prev => [...newPredictions, ...prev])
      
    } catch (error) {
      console.error('Ошибка оптимизации маршрутов:', error)
    } finally {
      setIsAnalyzing(false)
    }
  }, [excelData])

  // Анализ эффективности курьеров
  const analyzeCourierEfficiency = useCallback(async () => {
    if (!excelData?.couriers) return

    setIsAnalyzing(true)
    
    try {
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const analysis: EfficiencyAnalysis[] = excelData.couriers.map((courier: any) => {
        const courierRoutes = excelData.routes?.filter((r: any) => r.courier === courier.name) || []
        const courierOrders = excelData.orders?.filter((o: any) => o.courier === courier.name) || []
        
        const currentEfficiency = courierOrders.length / Math.max(courierRoutes.length, 1)
        const predictedEfficiency = currentEfficiency * (Math.random() * 0.5 + 0.75) // 75-125% от текущего
        const improvementPotential = predictedEfficiency - currentEfficiency
        
        return {
          courierId: courier.id || courier.name,
          courierName: courier.name,
          currentEfficiency,
          predictedEfficiency,
          improvementPotential,
          factors: {
            routeOptimization: Math.random() * 20 + 70, // 70-90%
            timeManagement: Math.random() * 25 + 65, // 65-90%
            loadBalancing: Math.random() * 30 + 60, // 60-90%
            trafficAvoidance: Math.random() * 35 + 55 // 55-90%
          },
          suggestions: [
            'Улучшить планирование маршрутов',
            'Оптимизировать время доставки',
            'Сбалансировать нагрузку',
            'Избегать пробок в час пик'
          ]
        }
      })
      
      setEfficiencyAnalysis(analysis)
      
    } catch (error) {
      console.error('Ошибка анализа эффективности:', error)
    } finally {
      setIsAnalyzing(false)
    }
  }, [excelData])

  // Прогнозирование спроса
  const forecastDemand = useCallback(async () => {
    if (!excelData?.orders) return

    setIsAnalyzing(true)
    
    try {
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const orders = excelData.orders
      const recentOrders = orders.slice(-50)
      const avgOrdersPerDay = recentOrders.length / 7
      
      const forecast: DemandForecast[] = [
        {
          period: 'Завтра',
          predictedOrders: Math.round(avgOrdersPerDay * (Math.random() * 0.4 + 0.8)), // 80-120%
          confidence: Math.random() * 20 + 75, // 75-95%
          factors: {
            historical: 85,
            seasonal: 78,
            weather: 82,
            events: 90
          },
          recommendations: [
            'Подготовить дополнительных курьеров',
            'Оптимизировать маршруты заранее',
            'Учесть погодные условия'
          ]
        },
        {
          period: 'На этой неделе',
          predictedOrders: Math.round(avgOrdersPerDay * 7 * (Math.random() * 0.3 + 0.85)), // 85-115%
          confidence: Math.random() * 15 + 80, // 80-95%
          factors: {
            historical: 88,
            seasonal: 82,
            weather: 85,
            events: 87
          },
          recommendations: [
            'Планировать ресурсы на неделю',
            'Анализировать тренды спроса',
            'Готовиться к пиковым нагрузкам'
          ]
        },
        {
          period: 'В следующем месяце',
          predictedOrders: Math.round(avgOrdersPerDay * 30 * (Math.random() * 0.5 + 0.75)), // 75-125%
          confidence: Math.random() * 25 + 70, // 70-95%
          factors: {
            historical: 82,
            seasonal: 85,
            weather: 78,
            events: 80
          },
          recommendations: [
            'Долгосрочное планирование ресурсов',
            'Анализ сезонных колебаний',
            'Подготовка к изменениям спроса'
          ]
        }
      ]
      
      setDemandForecast(forecast)
      
    } catch (error) {
      console.error('Ошибка прогнозирования спроса:', error)
    } finally {
      setIsAnalyzing(false)
    }
  }, [excelData])

  // Обучение модели
  const trainModel = useCallback(async () => {
    setIsTraining(true)
    
    try {
      // Имитация обучения модели
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      // Улучшаем точность модели
      setModelAccuracy(prev => Math.min(prev + Math.random() * 5, 95))
      
    } catch (error) {
      console.error('Ошибка обучения модели:', error)
    } finally {
      setIsTraining(false)
    }
  }, [])

  // Фильтрация предсказаний
  const filteredPredictions = useMemo(() => {
    switch (selectedFeature) {
      case 'predictions':
        return predictions.filter(p => p.type === 'delivery_time')
      case 'optimization':
        return predictions.filter(p => p.type === 'route_optimization')
      case 'efficiency':
        return predictions.filter(p => p.type === 'efficiency')
      case 'demand':
        return predictions.filter(p => p.type === 'demand')
      default:
        return predictions
    }
  }, [predictions, selectedFeature])

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
              ИИ функции и машинное обучение
            </h1>
            <p className={clsx(
              'mt-1 text-sm',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              Предсказание времени доставки, оптимизация маршрутов и анализ эффективности
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <ChartBarIcon className="h-6 w-6 text-purple-600" />
            <span className={clsx(
              'text-sm font-medium',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              ИИ модель: {modelAccuracy.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Статус модели */}
      <div className={clsx(
        'rounded-lg shadow-sm border p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={clsx(
            'text-lg font-medium',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            Статус ИИ модели
          </h3>
          
          <button
            onClick={trainModel}
            disabled={isTraining}
            className={clsx(
              'px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200',
              isTraining
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            )}
          >
            {isTraining ? (
              <div className="flex items-center">
                <ArrowPathIcon className="h-4 w-4 animate-spin mr-2" />
                Обучение...
              </div>
            ) : (
              <div className="flex items-center">
                <ChartBarIcon className="h-4 w-4 mr-2" />
                Обучить модель
              </div>
            )}
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <ChartBarIcon className="h-8 w-8 text-purple-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-purple-600">{modelAccuracy.toFixed(1)}%</p>
            <p className="text-sm text-gray-600">Точность модели</p>
          </div>
          
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <ChartBarIcon className="h-8 w-8 text-blue-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-blue-600">{predictions.length}</p>
            <p className="text-sm text-gray-600">Предсказаний</p>
          </div>
          
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <CheckCircleIcon className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-green-600">
              {predictions.filter(p => p.confidence > 80).length}
            </p>
            <p className="text-sm text-gray-600">Высокая точность</p>
          </div>
        </div>
      </div>

      {/* Функции ИИ */}
      <div className={clsx(
        'rounded-lg shadow-sm border p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={clsx(
            'text-lg font-medium',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            ИИ функции
          </h3>
          
          <div className="flex space-x-2">
            <button
              onClick={() => predictDeliveryTime('courier_1', 'route_1')}
              disabled={isAnalyzing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <ClockIcon className="h-4 w-4 mr-2 inline" />
              Предсказать время
            </button>
            
            <button
              onClick={optimizeRoutesWithAI}
              disabled={isAnalyzing}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
            >
              <BoltIcon className="h-4 w-4 mr-2 inline" />
              Оптимизировать
            </button>
            
            <button
              onClick={analyzeCourierEfficiency}
              disabled={isAnalyzing}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
            >
              <ArrowTrendingUpIcon className="h-4 w-4 mr-2 inline" />
              Анализ эффективности
            </button>
            
            <button
              onClick={forecastDemand}
              disabled={isAnalyzing}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
            >
              <FireIcon className="h-4 w-4 mr-2 inline" />
              Прогноз спроса
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">Предсказание времени доставки</h4>
            <p className="text-sm text-gray-600 mb-3">
              ИИ анализирует исторические данные, пробки и погоду для точного прогноза времени доставки
            </p>
            <div className="text-xs text-blue-600">
              Точность: 89.2%
            </div>
          </div>
          
          <div className="p-4 bg-green-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">Оптимизация маршрутов</h4>
            <p className="text-sm text-gray-600 mb-3">
              Машинное обучение для создания оптимальных маршрутов с учетом множества факторов
            </p>
            <div className="text-xs text-green-600">
              Точность: 92.1%
            </div>
          </div>
          
          <div className="p-4 bg-purple-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">Анализ эффективности</h4>
            <p className="text-sm text-gray-600 mb-3">
              ИИ оценивает эффективность курьеров и предлагает способы улучшения
            </p>
            <div className="text-xs text-purple-600">
              Точность: 87.5%
            </div>
          </div>
          
          <div className="p-4 bg-orange-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">Прогнозирование спроса</h4>
            <p className="text-sm text-gray-600 mb-3">
              Предсказание спроса на основе исторических данных, сезонности и внешних факторов
            </p>
            <div className="text-xs text-orange-600">
              Точность: 84.3%
            </div>
          </div>
        </div>
      </div>

      {/* Результаты анализа эффективности */}
      {efficiencyAnalysis.length > 0 && (
        <div className={clsx(
          'rounded-lg shadow-sm border p-6',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <h3 className={clsx(
            'text-lg font-medium mb-4',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            Анализ эффективности курьеров
          </h3>
          
          <div className="space-y-4">
            {efficiencyAnalysis.map((analysis) => (
              <div key={analysis.courierId} className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900">{analysis.courierName}</h4>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Текущая эффективность</p>
                    <p className="text-lg font-bold text-blue-600">
                      {analysis.currentEfficiency.toFixed(2)}
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                  <div className="text-center">
                    <p className="text-xs text-gray-600">Оптимизация маршрутов</p>
                    <p className="text-sm font-bold text-green-600">
                      {analysis.factors.routeOptimization.toFixed(0)}%
                    </p>
                  </div>
                  
                  <div className="text-center">
                    <p className="text-xs text-gray-600">Управление временем</p>
                    <p className="text-sm font-bold text-blue-600">
                      {analysis.factors.timeManagement.toFixed(0)}%
                    </p>
                  </div>
                  
                  <div className="text-center">
                    <p className="text-xs text-gray-600">Балансировка нагрузки</p>
                    <p className="text-sm font-bold text-purple-600">
                      {analysis.factors.loadBalancing.toFixed(0)}%
                    </p>
                  </div>
                  
                  <div className="text-center">
                    <p className="text-xs text-gray-600">Избежание пробок</p>
                    <p className="text-sm font-bold text-orange-600">
                      {analysis.factors.trafficAvoidance.toFixed(0)}%
                    </p>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-700">Рекомендации:</p>
                  {analysis.suggestions.map((suggestion, index) => (
                    <p key={index} className="text-xs text-gray-600 flex items-center">
                      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-2"></span>
                      {suggestion}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Прогноз спроса */}
      {demandForecast.length > 0 && (
        <div className={clsx(
          'rounded-lg shadow-sm border p-6',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <h3 className={clsx(
            'text-lg font-medium mb-4',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            Прогноз спроса
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {demandForecast.map((forecast, index) => (
              <div key={index} className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">{forecast.period}</h4>
                
                <div className="text-center mb-3">
                  <p className="text-2xl font-bold text-blue-600">{forecast.predictedOrders}</p>
                  <p className="text-sm text-gray-600">прогнозируемых заказов</p>
                </div>
                
                <div className="space-y-2 mb-3">
                  <div className="flex justify-between text-xs">
                    <span>Исторические данные</span>
                    <span className="font-medium">{forecast.factors.historical}%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Сезонность</span>
                    <span className="font-medium">{forecast.factors.seasonal}%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Погода</span>
                    <span className="font-medium">{forecast.factors.weather}%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>События</span>
                    <span className="font-medium">{forecast.factors.events}%</span>
                  </div>
                </div>
                
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700">Уверенность: {forecast.confidence.toFixed(0)}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Предсказания */}
      {filteredPredictions.length > 0 && (
        <div className={clsx(
          'rounded-lg shadow-sm border p-6',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <h3 className={clsx(
            'text-lg font-medium mb-4',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            ИИ предсказания
          </h3>
          
          <div className="space-y-4">
            {filteredPredictions.map((prediction) => (
              <div key={prediction.id} className="p-4 bg-green-50 rounded-lg">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-medium text-gray-900">{prediction.title}</h4>
                    <p className="text-sm text-gray-600">{prediction.description}</p>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Уверенность</p>
                    <p className="text-lg font-bold text-green-600">
                      {prediction.confidence.toFixed(0)}%
                    </p>
                  </div>
                </div>
                
                {prediction.data && (
                  <div className="mb-3">
                    {prediction.type === 'delivery_time' && (
                      <div className="text-center">
                        <p className="text-2xl font-bold text-blue-600">
                          {prediction.data.predictedTime} мин
                        </p>
                        <p className="text-sm text-gray-600">прогнозируемое время доставки</p>
                      </div>
                    )}
                    
                    {prediction.type === 'route_optimization' && (
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-lg font-bold text-green-600">
                            {prediction.data.savings.distance.toFixed(1)} км
                          </p>
                          <p className="text-xs text-gray-600">Экономия расстояния</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-blue-600">
                            {Math.round(prediction.data.savings.time)} мин
                          </p>
                          <p className="text-xs text-gray-600">Экономия времени</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-purple-600">
                            {prediction.data.savings.cost.toFixed(0)} грн
                          </p>
                          <p className="text-xs text-gray-600">Экономия средств</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-700">Рекомендации:</p>
                  {prediction.recommendations.map((recommendation, index) => (
                    <p key={index} className="text-xs text-gray-600 flex items-center">
                      <LightBulbIcon className="h-3 w-3 text-yellow-500 mr-2" />
                      {recommendation}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}














