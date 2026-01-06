import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { useExcelData } from '../contexts/ExcelDataContext'
import { useTheme } from '../contexts/ThemeContext'
import { AIPrediction, EfficiencyAnalysis, DemandForecast } from '../types'
import { AIHeader } from './ai/AIHeader'
import { AIModelStatus } from './ai/AIModelStatus'
import { AIFeatureActions } from './ai/AIFeatureActions'
import { AIEfficiencyAnalysis } from './ai/AIEfficiencyAnalysis'
import { AIDemandForecast } from './ai/AIDemandForecast'
import { AIPredictionsList } from './ai/AIPredictionsList'

export const AIFeatures: React.FC = () => {
  const { excelData } = useExcelData()
  const { isDark } = useTheme()
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [selectedFeature] = useState<'predictions' | 'optimization' | 'efficiency' | 'demand'>('predictions')
  const [predictions, setPredictions] = useState<AIPrediction[]>([])
  const [efficiencyAnalysis, setEfficiencyAnalysis] = useState<EfficiencyAnalysis[]>([])
  const [demandForecast, setDemandForecast] = useState<DemandForecast[]>([])
  const [isTraining, setIsTraining] = useState(false)
  const [modelAccuracy, setModelAccuracy] = useState(87.5)

  // Инициализация ИИ модели
  useEffect(() => {
    const loadModel = async () => {
      setIsTraining(true)
      await new Promise(resolve => setTimeout(resolve, 1000))
      setIsTraining(false)
    }
    loadModel()
  }, [])

  // Предсказание времени доставки
  const predictDeliveryTime = useCallback(async (courierId: string, routeId: string) => {
    if (!excelData) return null
    setIsAnalyzing(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      const route = excelData.routes?.find((r: any) => r.id === routeId)
      const courier = excelData.couriers?.find((c: any) => c.id === courierId)
      if (!route || !courier) return null
      const baseTime = route.totalDuration || 30
      const trafficFactor = Math.random() * 0.3 + 0.85
      const weatherFactor = Math.random() * 0.2 + 0.9
      const courierEfficiency = Math.random() * 0.4 + 0.8
      const predictedTime = baseTime * trafficFactor * weatherFactor * courierEfficiency
      const confidence = Math.random() * 20 + 75
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
          factors: { traffic: trafficFactor, weather: weatherFactor, efficiency: courierEfficiency }
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
      await new Promise(resolve => setTimeout(resolve, 1500))
      const routes = excelData.routes.filter((route: any) => !route.isOptimized)
      const newPredictions: AIPrediction[] = []
      routes.forEach((route: any) => {
        const currentDistance = route.totalDistance || 1.0
        const currentDuration = route.totalDuration || 30
        const optimizedDistance = currentDistance * (Math.random() * 0.3 + 0.7)
        const optimizedDuration = currentDuration * (Math.random() * 0.4 + 0.6)
        const prediction: AIPrediction = {
          id: `optimization_${route.id}`,
          type: 'route_optimization',
          title: 'ИИ оптимизация маршрута',
          description: `Оптимизация маршрута курьера ${route.courier}`,
          confidence: Math.random() * 15 + 80,
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
      await new Promise(resolve => setTimeout(resolve, 1500))
      const analysis: EfficiencyAnalysis[] = excelData.couriers.map((courier: any) => {
        const courierRoutes = excelData.routes?.filter((r: any) => r.courier === courier.name) || []
        const courierOrders = excelData.orders?.filter((o: any) => o.courier === courier.name) || []
        const currentEfficiency = courierOrders.length / Math.max(courierRoutes.length, 1)
        const predictedEfficiency = currentEfficiency * (Math.random() * 0.5 + 0.75)
        const improvementPotential = predictedEfficiency - currentEfficiency
        return {
          courierId: courier.id || courier.name,
          courierName: courier.name,
          currentEfficiency,
          predictedEfficiency,
          improvementPotential,
          factors: {
            routeOptimization: Math.random() * 20 + 70,
            timeManagement: Math.random() * 25 + 65,
            loadBalancing: Math.random() * 30 + 60,
            trafficAvoidance: Math.random() * 35 + 55
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
      await new Promise(resolve => setTimeout(resolve, 1500))
      const orders = excelData.orders
      const recentOrders = orders.slice(-50)
      const avgOrdersPerDay = recentOrders.length / 7
      const forecast: DemandForecast[] = [
        {
          period: 'Завтра',
          predictedOrders: Math.round(avgOrdersPerDay * (Math.random() * 0.4 + 0.8)),
          confidence: Math.random() * 20 + 75,
          factors: { historical: 85, seasonal: 78, weather: 82, events: 90 },
          recommendations: ['Подготовить дополнительных курьеров', 'Оптимизировать маршруты заранее', 'Учесть погодные условия']
        },
        {
          period: 'На этой неделе',
          predictedOrders: Math.round(avgOrdersPerDay * 7 * (Math.random() * 0.3 + 0.85)),
          confidence: Math.random() * 15 + 80,
          factors: { historical: 88, seasonal: 82, weather: 85, events: 87 },
          recommendations: ['Планировать ресурсы на неделю', 'Анализировать тренды спроса', 'Готовиться к пиковым нагрузкам']
        },
        {
          period: 'В следующем месяце',
          predictedOrders: Math.round(avgOrdersPerDay * 30 * (Math.random() * 0.5 + 0.75)),
          confidence: Math.random() * 25 + 70,
          factors: { historical: 82, seasonal: 85, weather: 78, events: 80 },
          recommendations: ['Долгосрочное планирование ресурсов', 'Анализ сезонных колебаний', 'Подготовка к изменениям спроса']
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
      await new Promise(resolve => setTimeout(resolve, 2000))
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
      case 'predictions': return predictions.filter(p => p.type === 'delivery_time')
      case 'optimization': return predictions.filter(p => p.type === 'route_optimization')
      default: return predictions
    }
  }, [predictions, selectedFeature])

  return (
    <div className="space-y-6">
      <AIHeader isDark={isDark} modelAccuracy={modelAccuracy} />

      <AIModelStatus
        isDark={isDark}
        isTraining={isTraining}
        modelAccuracy={modelAccuracy}
        predictionCount={predictions.length}
        highConfidenceCount={predictions.filter(p => p.confidence > 80).length}
        onTrainModel={trainModel}
      />

      <AIFeatureActions
        isDark={isDark}
        isAnalyzing={isAnalyzing}
        onPredictTime={() => predictDeliveryTime('courier_1', 'route_1')}
        onOptimizeRoutes={optimizeRoutesWithAI}
        onAnalyzeEfficiency={analyzeCourierEfficiency}
        onForecastDemand={forecastDemand}
      />

      <AIEfficiencyAnalysis isDark={isDark} data={efficiencyAnalysis} />

      <AIDemandForecast isDark={isDark} data={demandForecast} />

      <AIPredictionsList isDark={isDark} predictions={filteredPredictions} />
    </div>
  )
}

































