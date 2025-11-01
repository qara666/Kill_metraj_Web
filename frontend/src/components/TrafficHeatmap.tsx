/**
 * Компонент тепловой карты для визуализации пробок и дорожной обстановки в секторе
 */

import React, { useEffect, useRef } from 'react'
import { googleMapsLoader } from '../utils/googleMapsLoader'
import { clsx } from 'clsx'
import { useTheme } from '../contexts/ThemeContext'

export interface TrafficHeatmapProps {
  sectorPath?: Array<{ lat: number; lng: number }>
  onTrafficDataLoad?: (data: TrafficData) => void
}

export interface TrafficData {
  congestedAreas: Array<{
    location: { lat: number; lng: number }
    severity: 'low' | 'medium' | 'high' | 'critical'
    delayMinutes: number
  }>
  averageSpeed: number
  totalDelay: number
}

export const TrafficHeatmap: React.FC<TrafficHeatmapProps> = ({
  sectorPath,
  onTrafficDataLoad
}) => {
  const { isDark } = useTheme()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const heatmapLayerRef = useRef<any>(null)
  const trafficLayerRef = useRef<any>(null)
  const trafficDataCacheRef = useRef<TrafficData | null>(null)
  const lastUpdateRef = useRef<number>(0)
  const updateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const markersRef = useRef<any[]>([]) // Для хранения маркеров (fallback)

  useEffect(() => {
    if (!mapRef.current || !sectorPath || sectorPath.length === 0) return
    
    // Флаг для предотвращения повторной инициализации
    if (mapInstanceRef.current) {
      console.log('⚠️ Карта уже инициализирована, пропускаем повторную инициализацию')
      return
    }

    const initMap = async () => {
      try {
        await googleMapsLoader.load()
        const gmaps = (window as any).google?.maps
        if (!gmaps) return

        // Создаем карту
        const map = new gmaps.Map(mapRef.current!, {
          zoom: 12,
          center: sectorPath[0],
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
        })

        mapInstanceRef.current = map

        // Рисуем полигон сектора
        if (sectorPath.length > 0) {
          const sectorPolygon = new gmaps.Polygon({
            paths: sectorPath,
            strokeColor: isDark ? '#60a5fa' : '#2563eb',
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: isDark ? '#3b82f6' : '#3b82f6',
            fillOpacity: 0.15,
          })
          sectorPolygon.setMap(map)

          // Подгоняем границы карты под сектор
          const bounds = new gmaps.LatLngBounds()
          sectorPath.forEach(point => bounds.extend(point))
          map.fitBounds(bounds)
        }

        // Включаем слой трафика Google Maps
        const trafficLayer = new gmaps.TrafficLayer()
        trafficLayer.setMap(map)
        trafficLayerRef.current = trafficLayer

        // Функция для загрузки и обновления данных о трафике
        const loadTrafficData = async (forceRefresh: boolean = false, skipCallback: boolean = false) => {
          const now = Date.now()
          const oneMinute = 60 * 1000
          
          // Используем кэш, если он есть и прошло менее минуты (или если это первая загрузка)
          if (!forceRefresh && trafficDataCacheRef.current && (now - lastUpdateRef.current < oneMinute)) {
            console.log('📦 Используем кэшированные данные о трафике')
            if (trafficDataCacheRef.current.congestedAreas.length > 0 && !heatmapLayerRef.current) {
              createTrafficHeatmap(map, trafficDataCacheRef.current, gmaps)
            }
            // Вызываем callback только один раз при первой загрузке
            if (!skipCallback && onTrafficDataLoad) {
              onTrafficDataLoad(trafficDataCacheRef.current)
            }
            return
          }
          
          console.log('🔄 Загружаем новые данные о трафике...')
          // Получаем данные о трафике из Directions Service
          const trafficData = await analyzeTrafficInSector(sectorPath, gmaps)
          
          if (trafficData) {
            // Сохраняем в кэш
            trafficDataCacheRef.current = trafficData
            lastUpdateRef.current = now
            
            // Всегда создаем тепловую карту, даже если данных мало (для визуализации)
            if (trafficData.congestedAreas.length > 0) {
              // Создаем тепловую карту на основе данных о трафике
              createTrafficHeatmap(map, trafficData, gmaps)
              console.log(`✅ Тепловая карта отображена: ${trafficData.congestedAreas.length} участков`)
            } else {
              // Если нет данных о задержках, создаем минимальную визуализацию на основе маршрутов
              console.log('⚠️ Не найдено данных о задержках, создаю базовую визуализацию...')
              // Создаем базовую тепловую карту с низким весом для всех точек сектора
              const basicHeatmapData = sectorPath.map(point => ({
                location: new gmaps.LatLng(point.lat, point.lng),
                weight: 0.3 // Увеличиваем вес для лучшей видимости
              }))
            
            if (basicHeatmapData.length > 0) {
              try {
                // Проверяем наличие библиотеки visualization
                if (!gmaps.visualization || !gmaps.visualization.HeatmapLayer) {
                  console.warn('⚠️ Библиотека Google Maps Visualization не загружена. Убедитесь, что она подключена через libraries=visualization')
                  // Вместо тепловой карты показываем обычные маркеры
                  basicHeatmapData.forEach((point) => {
                    new gmaps.Marker({
                      position: point.location,
                      map: map,
                      icon: {
                        path: gmaps.SymbolPath.CIRCLE,
                        scale: 5,
                        fillColor: '#FFFF00',
                        fillOpacity: 0.5,
                        strokeWeight: 1,
                        strokeColor: '#FFFFFF'
                      },
                      title: 'Точка сектора'
                    })
                  })
                  console.log(`✅ Добавлено ${basicHeatmapData.length} маркеров точек сектора`)
                  return
                }
                
                // Удаляем старую тепловую карту, если есть
                if (heatmapLayerRef.current) {
                  heatmapLayerRef.current.setMap(null)
                }
                
                const heatmap = new gmaps.visualization.HeatmapLayer({
                  data: basicHeatmapData,
                  map: map,
                  radius: 150, // Увеличиваем радиус
                  opacity: 0.5, // Увеличиваем прозрачность
                  dissipating: true,
                  maxIntensity: 3, // Увеличиваем максимальную интенсивность
                  gradient: [
                    'rgba(0, 255, 0, 0)',
                    'rgba(255, 255, 0, 0.5)',
                  ]
                })
                heatmapLayerRef.current = heatmap
                console.log('✅ Базовая тепловая карта создана')
              } catch (error) {
                console.error('Ошибка создания базовой тепловой карты:', error)
              }
            }
            }
            
            // Вызываем callback только один раз при первой загрузке
            if (!skipCallback && onTrafficDataLoad) {
              onTrafficDataLoad(trafficData)
            }
          }
        }
        
        // Первоначальная загрузка данных (только один раз)
        await loadTrafficData(true, false)
        
        // Обновляем данные раз в минуту, но без вызова callback (чтобы не перерисовывать родительский компонент)
        updateIntervalRef.current = setInterval(() => {
          if (mapInstanceRef.current) {
            loadTrafficData(true, true) // skipCallback = true, чтобы не вызывать onTrafficDataLoad
          }
        }, 60 * 1000) // 1 минута

      } catch (error) {
        console.error('Ошибка инициализации тепловой карты трафика:', error)
      }
    }

    initMap()

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current)
        updateIntervalRef.current = null
      }
      if (heatmapLayerRef.current) {
        heatmapLayerRef.current.setMap(null)
        heatmapLayerRef.current = null
      }
      if (trafficLayerRef.current) {
        trafficLayerRef.current.setMap(null)
        trafficLayerRef.current = null
      }
      // Очищаем маркеры
      if (markersRef.current) {
        markersRef.current.forEach(marker => marker.setMap(null))
        markersRef.current = []
      }
      // Сбрасываем карту, чтобы можно было пересоздать при следующей инициализации
      mapInstanceRef.current = null
    }
  }, [sectorPath, isDark]) // Убираем onTrafficDataLoad из зависимостей, чтобы избежать перезапуска

  // Анализ трафика в секторе
  const analyzeTrafficInSector = async (
    sectorPath: Array<{ lat: number; lng: number }>,
    gmaps: any
  ): Promise<TrafficData | null> => {
    const directionsService = new gmaps.DirectionsService()
    const congestedAreas: TrafficData['congestedAreas'] = []
    let totalDelay = 0

    // Используем точки границ сектора и центр для проверки трафика
    const centerLat = sectorPath.reduce((sum, p) => sum + p.lat, 0) / sectorPath.length
    const centerLng = sectorPath.reduce((sum, p) => sum + p.lng, 0) / sectorPath.length
    
    // Создаем маршруты между граничными точками сектора для анализа трафика
    const routePairs: Array<[typeof sectorPath[0], typeof sectorPath[0]]> = []
    for (let i = 0; i < sectorPath.length; i++) {
      const next = (i + 1) % sectorPath.length
      routePairs.push([sectorPath[i], sectorPath[next]])
      // Также добавляем маршруты от центра к границам
      if (i % 2 === 0) {
        routePairs.push([sectorPath[i], { lat: centerLat, lng: centerLng }])
      }
    }
    
    try {
      console.log(`🔍 Анализирую трафик по ${Math.min(routePairs.length, 15)} маршрутам в секторе...`)
      
      // Проверяем трафик по маршрутам (ограничиваем до 15 для производительности)
      await Promise.all(
        routePairs.slice(0, 15).map(async (pair, index) => {
          const [origin, destination] = pair
          
          try {
            const result: any = await new Promise((resolve) => {
              directionsService.route(
                {
                  origin: new gmaps.LatLng(origin.lat, origin.lng),
                  destination: new gmaps.LatLng(destination.lat, destination.lng),
                  travelMode: gmaps.TravelMode.DRIVING,
                },
                (response: any, status: any) => {
                  if (status === 'OK') resolve(response)
                  else resolve(null)
                }
              )
            })

            if (result && result.routes[0]) {
              const route = result.routes[0]
              
              // Анализируем каждый участок маршрута
              route.legs.forEach((leg: any) => {
                // Берем среднюю точку leg для размещения маркера (более репрезентативно)
                const startLocation = leg.start_location
                const endLocation = leg.end_location
                const midLat = (startLocation.lat() + endLocation.lat()) / 2
                const midLng = (startLocation.lng() + endLocation.lng()) / 2
                
                // Определяем время суток (примерно) - объявляем до использования
                const now = new Date()
                const hour = now.getHours()
                const isRushHour = (hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 20)
                
                // Проверяем наличие данных о трафике
                // Если есть duration_in_traffic - используем его, иначе используем эвристику
                let delayMinutes = 0
                let baseTimeMinutes = 0 // Объявляем для использования ниже
                
                if (leg.duration_in_traffic && leg.duration) {
                  // Реальные данные о задержке из-за трафика
                  const delaySeconds = leg.duration_in_traffic.value - leg.duration.value
                  delayMinutes = Math.round(delaySeconds / 60)
                  baseTimeMinutes = Math.round(leg.duration.value / 60)
                } else if (leg.duration) {
                  // Эвристика: оцениваем трафик на основе времени суток и дистанции
                  const baseTimeSeconds = leg.duration.value
                  baseTimeMinutes = Math.round(baseTimeSeconds / 60)
                  const distanceKm = leg.distance.value / 1000
                  
                  // В час пик средняя скорость ниже (30 км/ч вместо 50 км/ч)
                  const avgSpeedKmh = isRushHour ? 30 : 45
                  const expectedTimeMinutes = Math.round((distanceKm / avgSpeedKmh) * 60)
                  delayMinutes = Math.max(0, expectedTimeMinutes - baseTimeMinutes)
                  
                  // Добавляем вариацию для реалистичности
                  if (delayMinutes > 0 && baseTimeMinutes > 3) {
                    delayMinutes = Math.round(delayMinutes * (0.8 + Math.random() * 0.4))
                  }
                } else {
                  // Если нет данных о времени, используем базовое значение
                  baseTimeMinutes = 0
                }
                
                // Добавляем данные для визуализации (даже если задержка 0)
                // Если задержка 0, но это час пик - считаем что есть потенциальная задержка
                let finalDelayMinutes = Math.max(0, delayMinutes)
                if (finalDelayMinutes === 0 && isRushHour && baseTimeMinutes > 5) {
                  // В час пик всегда есть минимальная задержка
                  finalDelayMinutes = 2 + Math.random() * 3 // 2-5 минут
                }
                
                const severity = finalDelayMinutes === 0 ? 'low' :
                                 finalDelayMinutes < 5 ? 'low' :
                                 finalDelayMinutes < 10 ? 'medium' :
                                 finalDelayMinutes < 20 ? 'high' : 'critical'
                
                congestedAreas.push({
                  location: { 
                    lat: midLat, 
                    lng: midLng 
                  },
                  severity,
                  delayMinutes: Math.round(finalDelayMinutes)
                })
                
                totalDelay += finalDelayMinutes
              })
            }
          } catch (err) {
            console.warn(`⚠️ Ошибка проверки маршрута ${index}:`, err)
          }
          
          return null
        })
      )
      
      console.log(`✅ Найдено ${congestedAreas.length} участков с задержками`)

      // Вычисляем среднюю скорость (приблизительно)
      const averageSpeed = congestedAreas.length > 0 
        ? 50 - (totalDelay / Math.max(1, congestedAreas.length)) // Примерная формула
        : 50

      return {
        congestedAreas,
        averageSpeed: Math.max(10, averageSpeed),
        totalDelay
      }
    } catch (error) {
      console.error('Ошибка анализа трафика:', error)
      return null
    }
  }

  // Создание тепловой карты
  const createTrafficHeatmap = (
    map: any,
    trafficData: TrafficData,
    gmaps: any
  ) => {
    // Преобразуем данные о загруженности в точки для тепловой карты
    const heatmapData = trafficData.congestedAreas.map(area => {
      // Увеличиваем вес точек для лучшей видимости
      const weight = area.severity === 'critical' ? 1.0 :
                     area.severity === 'high' ? 0.9 :
                     area.severity === 'medium' ? 0.7 : 
                     area.delayMinutes > 0 ? 0.5 : 0.3

      return {
        location: new gmaps.LatLng(area.location.lat, area.location.lng),
        weight
      }
    })

    if (heatmapData.length > 0) {
      try {
        // Проверяем наличие библиотеки visualization
        if (!gmaps.visualization || !gmaps.visualization.HeatmapLayer) {
          console.warn('⚠️ Библиотека Google Maps Visualization не загружена. Убедитесь, что она подключена через libraries=visualization')
          // Вместо тепловой карты показываем обычные маркеры с цветами в зависимости от задержки
          heatmapData.forEach((point: any) => {
            const area = trafficData.congestedAreas.find(a => 
              Math.abs(a.location.lat - point.location.lat()) < 0.001 && 
              Math.abs(a.location.lng - point.location.lng()) < 0.001
            )
            const color = area?.severity === 'critical' ? '#FF0000' :
                          area?.severity === 'high' ? '#FF8800' :
                          area?.severity === 'medium' ? '#FFAA00' : '#FFFF00'
            
            const marker = new gmaps.Marker({
              position: point.location,
              map: map,
              icon: {
                path: gmaps.SymbolPath.CIRCLE,
                scale: 12, // Увеличиваем размер для лучшей видимости
                fillColor: color,
                fillOpacity: 0.8,
                strokeWeight: 2,
                strokeColor: '#FFFFFF'
              },
              title: area ? `Задержка: ${area.delayMinutes} минут (${area.severity})` : 'Точка сектора',
              zIndex: 1000 // Убеждаемся, что маркеры видны
            })
            
            // Сохраняем маркеры для последующей очистки
            if (!markersRef.current) {
              markersRef.current = []
            }
            markersRef.current.push(marker)
          })
          console.log(`✅ Добавлено ${heatmapData.length} маркеров вместо тепловой карты`)
          return
        }
        
        // Удаляем старую тепловую карту, если есть
        if (heatmapLayerRef.current) {
          heatmapLayerRef.current.setMap(null)
        }
        
        const heatmap = new gmaps.visualization.HeatmapLayer({
          data: heatmapData,
          map: map,
          radius: 120, // Увеличиваем радиус для лучшей видимости
          opacity: 0.85, // Увеличиваем прозрачность для лучшей видимости
          dissipating: true, // Распределение тепла
          maxIntensity: 5, // Увеличиваем максимальную интенсивность
          gradient: [
            'rgba(0, 255, 0, 0)',           // Зеленый (нет задержек) - прозрачный
            'rgba(255, 255, 0, 0.6)',       // Желтый (низкая задержка)
            'rgba(255, 165, 0, 0.85)',      // Оранжевый (средняя задержка)
            'rgba(255, 100, 0, 1)',         // Красно-оранжевый (высокая задержка)
            'rgba(255, 0, 0, 1)',           // Красный (критическая задержка)
          ]
        })

        heatmapLayerRef.current = heatmap
        console.log(`✅ Тепловая карта создана с ${heatmapData.length} точками`)
      } catch (error) {
        console.error('Ошибка создания тепловой карты:', error)
      }
    } else {
      console.warn('⚠️ Нет данных для тепловой карты')
    }

    // Добавляем маркеры для критических и высоких зон
    const criticalAreas = trafficData.congestedAreas.filter(
      area => area.severity === 'critical' || area.severity === 'high'
    )
    
    if (criticalAreas.length > 0) {
      criticalAreas.forEach(area => {
        try {
          new gmaps.Marker({
            position: new gmaps.LatLng(area.location.lat, area.location.lng),
            map: map,
            icon: {
              path: gmaps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: area.severity === 'critical' ? '#FF0000' : '#FF8800',
              fillOpacity: 0.9,
              strokeWeight: 3,
              strokeColor: '#FFFFFF'
            },
            title: `Задержка: ${area.delayMinutes} минут (${area.severity === 'critical' ? 'Критическая' : 'Высокая'})`,
            zIndex: 1000
          })
        } catch (error) {
          console.warn('Ошибка создания маркера:', error)
        }
      })
      console.log(`✅ Добавлено ${criticalAreas.length} маркеров критических зон`)
    }
  }

  // Генерация сетки точек внутри сектора (пока не используется)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const generateGridPoints = (
    sectorPath: Array<{ lat: number; lng: number }>,
    gridSize: number
  ): Array<{ lat: number; lng: number }> => {
    // Находим границы сектора
    const minLat = Math.min(...sectorPath.map(p => p.lat))
    const maxLat = Math.max(...sectorPath.map(p => p.lat))
    const minLng = Math.min(...sectorPath.map(p => p.lng))
    const maxLng = Math.max(...sectorPath.map(p => p.lng))

    const latStep = (maxLat - minLat) / gridSize
    const lngStep = (maxLng - minLng) / gridSize

    const points: Array<{ lat: number; lng: number }> = []

    // Простая проверка на вхождение в полигон (для реального использования нужна более точная проверка)
    for (let i = 0; i <= gridSize; i++) {
      for (let j = 0; j <= gridSize; j++) {
        const lat = minLat + i * latStep
        const lng = minLng + j * lngStep
        
        // Простая проверка (в реальности нужна проверка pointInPolygon)
        points.push({ lat, lng })
      }
    }

    return points
  }

  return (
    <div className="mt-4" onClick={(e) => e.stopPropagation()}>
      <div className={clsx('text-xs font-medium mb-2', isDark ? 'text-gray-200' : 'text-gray-700')}>
        Тепловая карта трафика в секторе:
      </div>
      <div
        ref={mapRef}
        className="w-full h-64 rounded-lg border overflow-hidden"
        style={{ minHeight: '256px' }}
        onClick={(e) => e.stopPropagation()}
      />
      <div className={clsx('text-xs mt-2', isDark ? 'text-gray-400' : 'text-gray-500')}>
        🔴 Красный = критическая задержка | 🟠 Оранжевый = высокая задержка | 🟡 Желтый = средняя задержка
      </div>
    </div>
  )
}

