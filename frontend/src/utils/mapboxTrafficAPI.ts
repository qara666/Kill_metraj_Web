/**
 * Утилита для работы с Mapbox Traffic API
 * Отслеживание пробок в реальном времени для Украины/Киева
 */

export interface MapboxTrafficData {
  congestion: number // 0-100, где 100 = полная пробка
  speed: number // км/ч
  delay: number // задержка в секундах
  distance: number // расстояние в метрах
  duration: number // время в секундах
  coordinates: Array<[number, number]> // [lng, lat]
}

export interface MapboxRouteResponse {
  routes: Array<{
    distance: number
    duration: number
    geometry: {
      coordinates: Array<[number, number]>
    }
    legs: Array<{
      distance: number
      duration: number
      steps: Array<{
        distance: number
        duration: number
        geometry: {
          coordinates: Array<[number, number]>
        }
        congestion?: number[] // массив значений загруженности для каждого сегмента
        speed?: number
      }>
    }>
  }>
}

/**
 * Получает данные о трафике от Mapbox для маршрута
 */
export async function getMapboxTraffic(
  coordinates: Array<[number, number]>, // [lng, lat]
  accessToken: string
): Promise<MapboxTrafficData[]> {
  if (!coordinates || coordinates.length < 2) {
    return []
  }

  // Mapbox Directions API с учетом трафика (driving-traffic)
  const coordsString = coordinates.map(c => `${c[0]},${c[1]}`).join(';')
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordsString}?access_token=${accessToken}&geometries=geojson&overview=full&steps=true&annotations=congestion,duration,distance,speed`
  
  try {
    const response = await fetch(url)
    if (!response.ok) {
      const errorText = await response.text()
      
      throw new Error(`Mapbox API error: ${response.status}`)
    }
    
    const data: MapboxRouteResponse = await response.json()
    
    if (!data.routes || data.routes.length === 0) {
      
      return []
    }
    
    const route = data.routes[0]
    const trafficData: MapboxTrafficData[] = []
    
    // Извлекаем данные о трафике из каждого сегмента
    if (route.legs && route.legs.length > 0) {
      route.legs.forEach((leg) => {
        if (leg.steps && leg.steps.length > 0) {
          leg.steps.forEach((step) => {
            // Mapbox возвращает congestion как массив значений для каждого сегмента
            const congestionArray = step.congestion || []
            const avgCongestion = congestionArray.length > 0
              ? congestionArray.reduce((sum, c) => sum + c, 0) / congestionArray.length
              : 0
            
            // Конвертируем congestion (0-1) в проценты (0-100)
            const congestionPercent = avgCongestion * 100
            
            // Скорость из аннотаций или вычисляем из расстояния/времени
            const speed = step.speed || (step.distance / step.duration * 3.6) // м/с в км/ч
            const delay = step.duration * (avgCongestion || 0) // примерная задержка
            
            // Координаты сегмента
            const stepCoords = step.geometry?.coordinates || []
            
            trafficData.push({
              congestion: congestionPercent,
              speed: Math.round(speed),
              delay: Math.round(delay),
              distance: step.distance,
              duration: step.duration,
              coordinates: stepCoords
            })
          })
        }
      })
    }

    return trafficData
  } catch (error) {
    
    return []
  }
}

/**
 * Получает данные о трафике для одной точки (сегмента дороги)
 */
export async function getMapboxTrafficForSegment(
  from: [number, number], // [lng, lat]
  to: [number, number], // [lng, lat]
  accessToken: string
): Promise<MapboxTrafficData[]> {
  return getMapboxTraffic([from, to], accessToken)
}

/**
 * Определяет уровень серьезности пробки на основе congestion
 */
export function getTrafficSeverity(congestion: number): 'low' | 'medium' | 'high' | 'critical' {
  if (congestion < 30) return 'low'
  if (congestion < 60) return 'medium'
  if (congestion < 80) return 'high'
  return 'critical'
}

/**
 * Вычисляет задержку в минутах на основе congestion и duration
 */
export function calculateTrafficDelay(
  congestion: number,
  duration: number
): number {
  // Задержка = время * процент загруженности
  return (duration * (congestion / 100)) / 60 // конвертируем в минуты
}

/**
 * Получает цвет для отображения уровня пробки
 */
export function getTrafficColor(severity: 'low' | 'medium' | 'high' | 'critical'): string {
  switch (severity) {
    case 'low':
      return '#4CAF50' // зеленый
    case 'medium':
      return '#FFC107' // желтый
    case 'high':
      return '#FF9800' // оранжевый
    case 'critical':
      return '#F44336' // красный
    default:
      return '#9E9E9E' // серый
  }
}

/**
 * Получает текстовое описание уровня пробки
 */
export function getTrafficDescription(severity: 'low' | 'medium' | 'high' | 'critical'): string {
  switch (severity) {
    case 'low':
      return 'Свободное движение'
    case 'medium':
      return 'Небольшие пробки'
    case 'high':
      return 'Пробки'
    case 'critical':
      return 'Сильные пробки'
    default:
      return 'Неизвестно'
  }
}

