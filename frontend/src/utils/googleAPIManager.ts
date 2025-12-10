/**
 * Единый менеджер для всех обращений к Google Maps API
 * Включает: кэширование, батчинг, приоритизацию, предварительную фильтрацию
 */

import { Order, getCachedDistance, isReadyTimeCompatible } from './routeOptimizationHelpers'
import type { Coordinates } from './routeOptimizationHelpers'
import { 
  getUkraineTrafficForOrders,
  UkraineTrafficInfo,
  calculateTotalTrafficDelay,
  hasCriticalTraffic
} from './ukraineTrafficAPI'

// ============================================================================
// КЭШИРОВАНИЕ
// ============================================================================

/**
 * Кэш для пар точек (A -> B)
 */
const pointToPointCache = new Map<string, {
  distance: number
  duration: number
  legs?: any[]
  timestamp: number
}>()

/**
 * Кэш для полных маршрутов
 */
const routeFeasibilityCache = new Map<string, {
  feasible: boolean
  legs?: any[]
  totalDuration?: number
  totalDistance?: number
  timestamp: number
}>()

const CACHE_TTL = 30 * 60 * 1000 // 30 минут
const MAX_CACHE_SIZE = 2000

/**
 * Генерирует ключ для пары точек
 */
function generatePointPairKey(from: Coordinates, to: Coordinates): string {
  return `${from.lat.toFixed(6)},${from.lng.toFixed(6)}|${to.lat.toFixed(6)},${to.lng.toFixed(6)}`
}

/**
 * Генерирует ключ для маршрута
 */
function generateRouteKey(chain: Order[]): string {
  return chain.map(o => 
    `${o.orderNumber || ''}_${o.coords?.lat?.toFixed(6) || ''}_${o.coords?.lng?.toFixed(6) || ''}`
  ).join('|')
}

/**
 * Получает кэшированную пару точек (проверяет оба направления)
 */
function getCachedPointPair(from: Coordinates, to: Coordinates): {
  distance: number
  duration: number
  legs?: any[]
} | null {
  const key1 = generatePointPairKey(from, to)
  const key2 = generatePointPairKey(to, from) // Обратное направление
  
  const cached1 = pointToPointCache.get(key1)
  const cached2 = pointToPointCache.get(key2)
  const cached = cached1 || cached2
  
  if (!cached) return null
  
  const now = Date.now()
  if (now - cached.timestamp > CACHE_TTL) {
    pointToPointCache.delete(key1)
    pointToPointCache.delete(key2)
    return null
  }
  
  // Если это обратное направление, переворачиваем legs
  if (cached2 && !cached1) {
    return {
      distance: cached.distance,
      duration: cached.duration,
      legs: cached.legs ? [...cached.legs].reverse() : undefined
    }
  }
  
  return {
    distance: cached.distance,
    duration: cached.duration,
    legs: cached.legs
  }
}

/**
 * Сохраняет пару точек в кэш (сохраняет оба направления)
 */
function cachePointPair(
  from: Coordinates,
  to: Coordinates,
  distance: number,
  duration: number,
  legs?: any[]
): void {
  const key1 = generatePointPairKey(from, to)
  const key2 = generatePointPairKey(to, from)
  const timestamp = Date.now()
  
  const data = { distance, duration, legs, timestamp }
  pointToPointCache.set(key1, data)
  pointToPointCache.set(key2, { ...data, legs: legs ? [...legs].reverse() : undefined })
  
  // Очистка старых записей
  if (pointToPointCache.size > MAX_CACHE_SIZE) {
    const now = Date.now()
    for (const [k, v] of pointToPointCache.entries()) {
      if (now - v.timestamp > CACHE_TTL) {
        pointToPointCache.delete(k)
      }
    }
  }
}

/**
 * Умная проверка кэша: пытается собрать маршрут из сегментов
 */
function smartCacheCheck(chain: Order[]): {
  feasible: boolean
  legs?: any[]
  totalDuration?: number
  totalDistance?: number
} | null {
  if (chain.length === 0) return null
  
  // 1. Проверяем полный маршрут в кэше
  const fullKey = generateRouteKey(chain)
  const fullCached = routeFeasibilityCache.get(fullKey)
  if (fullCached) {
    const now = Date.now()
    if (now - fullCached.timestamp <= CACHE_TTL) {
      return {
        feasible: fullCached.feasible,
        legs: fullCached.legs,
        totalDuration: fullCached.totalDuration,
        totalDistance: fullCached.totalDistance
      }
    } else {
      routeFeasibilityCache.delete(fullKey)
    }
  }
  
  // 2. Пытаемся собрать из сегментов (пар точек)
  if (chain.length >= 2 && chain.every(o => o.coords)) {
    const segments: Array<{ distance: number; duration: number; legs?: any[] }> = []
    let allCached = true
    
    for (let i = 0; i < chain.length - 1; i++) {
      const from = chain[i].coords!
      const to = chain[i + 1].coords!
      const cached = getCachedPointPair(from, to)
      
      if (!cached) {
        allCached = false
        break
      }
      
      segments.push(cached)
    }
    
    if (allCached && segments.length > 0) {
      // Собираем полный маршрут из сегментов
      const totalDistance = segments.reduce((sum, s) => sum + s.distance, 0)
      const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0)
      const legs = segments.flatMap(s => s.legs || [])
      
      const result = {
        feasible: true,
        legs,
        totalDistance,
        totalDuration
      }
      
      // Сохраняем в полный кэш для будущего использования
      routeFeasibilityCache.set(fullKey, {
        ...result,
        timestamp: Date.now()
      })
      
      return result
    }
  }
  
  return null
}

/**
 * Сохраняет результат в кэш
 */
function cacheRouteResult(
  chain: Order[],
  result: {
    feasible: boolean
    legs?: any[]
    totalDuration?: number
    totalDistance?: number
  }
): void {
  const key = generateRouteKey(chain)
  routeFeasibilityCache.set(key, {
    ...result,
    timestamp: Date.now()
  })
  
  // Сохраняем также пары точек для переиспользования
  if (result.feasible && result.legs && chain.length >= 2 && chain.every(o => o.coords)) {
    const legs = result.legs
    for (let i = 0; i < chain.length - 1 && i < legs.length; i++) {
      const from = chain[i].coords!
      const to = chain[i + 1].coords!
      const leg = legs[i]
      
      if (leg) {
        const distance = leg.distance?.value || 0
        const duration = leg.duration_in_traffic?.value || leg.duration?.value || 0
        cachePointPair(from, to, distance, duration, [leg])
      }
    }
  }
  
  // Очистка старых записей
  if (routeFeasibilityCache.size > MAX_CACHE_SIZE) {
    const now = Date.now()
    for (const [k, v] of routeFeasibilityCache.entries()) {
      if (now - v.timestamp > CACHE_TTL) {
        routeFeasibilityCache.delete(k)
      }
    }
  }
}

// ============================================================================
// ПРЕДВАРИТЕЛЬНАЯ ФИЛЬТРАЦИЯ
// ============================================================================

/**
 * Быстрая проверка feasibility без вызова API
 */
export async function quickFeasibilityCheck(
  chain: Order[],
  maxDistanceKm: number | null,
  maxReadyTimeDiffMinutes: number = 60
): Promise<{ feasible: boolean; reason?: string }> {
  if (chain.length === 0) {
    return { feasible: true }
  }
  
  // 1. Проверка координат
  if (!chain.every(o => o.coords)) {
    return { feasible: true, reason: 'Некоторые заказы без координат, нужна проверка API' }
  }
  
  // 2. Проверка Haversine для всех пар
  if (maxDistanceKm) {
    for (let i = 0; i < chain.length - 1; i++) {
      const from = chain[i].coords!
      const to = chain[i + 1].coords!
      const dist = getCachedDistance(from, to)
      
      if (dist > maxDistanceKm * 1.5) {
        return { feasible: false, reason: `Расстояние ${dist.toFixed(1)}км превышает лимит ${maxDistanceKm}км` }
      }
    }
  }
  
  // 3. Проверка временной совместимости
  if (chain.length > 1) {
    // Используем существующую функцию isReadyTimeCompatible для консистентности
    const firstOrder = chain[0]
    const restOrders = chain.slice(1)
    if (!isReadyTimeCompatible(firstOrder, restOrders, maxReadyTimeDiffMinutes)) {
      const readyTimes = chain.map(o => o.readyAtSource || o.readyAt || Date.now())
      const minReady = Math.min(...readyTimes)
      const maxReady = Math.max(...readyTimes)
      const diff = (maxReady - minReady) / (1000 * 60)
      return { feasible: false, reason: `Разница во времени готовности ${diff.toFixed(0)}мин превышает лимит ${maxReadyTimeDiffMinutes}мин` }
    }
  }
  
  return { feasible: true }
}

// ============================================================================
// БАТЧИНГ И ПРИОРИТИЗАЦИЯ
// ============================================================================

interface QueuedRequest {
  chain: Order[]
  includeStartEnd: boolean
  resolve: (result: any) => void
  reject: (error: any) => void
  priority: 'high' | 'low'
}

class GoogleAPIBatchQueue {
  private highPriorityQueue: QueuedRequest[] = []
  private lowPriorityQueue: QueuedRequest[] = []
  private processing = false
  private batchTimeout: ReturnType<typeof setTimeout> | null = null
  private makeAPIRequestFn?: (chain: Order[], includeStartEnd: boolean) => Promise<any>
  
  setMakeAPIRequest(fn: (chain: Order[], includeStartEnd: boolean) => Promise<any>) {
    this.makeAPIRequestFn = fn
  }
  
  async addRequest(
    chain: Order[],
    includeStartEnd: boolean,
    priority: 'high' | 'low' = 'low'
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        chain,
        includeStartEnd,
        resolve,
        reject,
        priority
      }
      
      if (priority === 'high') {
        this.highPriorityQueue.push(request)
      } else {
        this.lowPriorityQueue.push(request)
      }
      
      // Запускаем обработку
      if (this.highPriorityQueue.length >= 5 || (this.lowPriorityQueue.length >= 10 && !this.processing)) {
        this.processBatch()
      } else if (!this.batchTimeout && !this.processing) {
        this.batchTimeout = setTimeout(() => this.processBatch(), 50)
      }
    })
  }
  
  private async processBatch() {
    if (this.processing) return
    
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout)
      this.batchTimeout = null
    }
    
    this.processing = true
    
    try {
      // Сначала обрабатываем высокий приоритет
      while (this.highPriorityQueue.length > 0) {
        const batch = this.highPriorityQueue.splice(0, 5)
        await this.processRequestBatch(batch)
        await this.delay(50) // Небольшая задержка между батчами
      }
      
      // Потом низкий приоритет
      while (this.lowPriorityQueue.length > 0) {
        const batch = this.lowPriorityQueue.splice(0, 10)
        await this.processRequestBatch(batch)
        await this.delay(100) // Большая задержка для низкого приоритета
      }
    } finally {
      this.processing = false
    }
  }
  
  private async processRequestBatch(batch: QueuedRequest[]) {
    if (!this.makeAPIRequestFn) {
      batch.forEach(req => req.reject(new Error('makeAPIRequest не установлен')))
      return
    }
    
    // Обрабатываем параллельно, но с ограничением
    const results = await Promise.allSettled(
      batch.map(req => this.makeAPIRequestFn!(req.chain, req.includeStartEnd))
    )
    
    batch.forEach((req, idx) => {
      const result = results[idx]
      if (result.status === 'fulfilled') {
        req.resolve(result.value)
      } else {
        req.reject(result.reason)
      }
    })
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, ms))
  }
}

// ============================================================================
// ЕДИНЫЙ МЕНЕДЖЕР
// ============================================================================

export interface GoogleAPIManagerConfig {
  checkChainFeasible: (chain: Order[], includeStartEnd: boolean) => Promise<{
    feasible: boolean
    legs?: any[]
    totalDuration?: number
    totalDistance?: number
  }>
  defaultStartAddress?: string
  defaultEndAddress?: string
  maxDistanceKm?: number | null
  maxReadyTimeDiffMinutes?: number
  mapboxToken?: string // Токен Mapbox для отслеживания пробок
}

export class GoogleAPIManager {
  private batchQueue: GoogleAPIBatchQueue
  private config: GoogleAPIManagerConfig
  
  constructor(config: GoogleAPIManagerConfig) {
    this.config = config
    this.batchQueue = new GoogleAPIBatchQueue()
    
    // Устанавливаем функцию для выполнения API запросов
    this.batchQueue.setMakeAPIRequest(async (chain: Order[], includeStartEnd: boolean) => {
      return this.config.checkChainFeasible(chain, includeStartEnd)
    })
  }
  
  /**
   * Основной метод проверки маршрута
   */
  async checkRoute(
    chain: Order[],
    options: {
      includeStartEnd?: boolean
      useCache?: boolean
      priority?: 'high' | 'low'
      prefilter?: boolean
      maxDistanceKm?: number | null
      maxReadyTimeDiffMinutes?: number
    } = {}
  ): Promise<{
    feasible: boolean
    legs?: any[]
    totalDuration?: number
    totalDistance?: number
  }> {
    const includeStartEnd = options.includeStartEnd !== false
    const useCache = options.useCache !== false
    const priority = options.priority || 'low'
    const prefilter = options.prefilter !== false
    const maxDistanceKm = options.maxDistanceKm ?? this.config.maxDistanceKm ?? null
    const maxReadyTimeDiff = options.maxReadyTimeDiffMinutes ?? this.config.maxReadyTimeDiffMinutes ?? 60
    
    // 1. Предварительная фильтрация (быстрая проверка без API)
    if (prefilter) {
      const quickCheck = await quickFeasibilityCheck(chain, maxDistanceKm, maxReadyTimeDiff)
      if (!quickCheck.feasible) {
        return {
          feasible: false,
          totalDuration: 0,
          totalDistance: 0
        }
      }
    }
    
    // 2. Проверка кэша
    if (useCache) {
      const cached = smartCacheCheck(chain)
      if (cached) {
        return cached
      }
    }
    
    // 3. Вызов API через батч-очередь
    const result = await this.batchQueue.addRequest(chain, includeStartEnd, priority)
    
    // 4. Сохраняем в кэш
    if (useCache && result.feasible) {
      cacheRouteResult(chain, result)
    }
    
    return result
  }
  
  /**
   * Проверка маршрута с учетом трафика Mapbox
   */
  async checkRouteWithTraffic(
    chain: Order[],
    options: {
      includeStartEnd?: boolean
      useCache?: boolean
      priority?: 'high' | 'low'
      prefilter?: boolean
      maxDistanceKm?: number | null
      maxReadyTimeDiffMinutes?: number
    } = {}
  ): Promise<{
    feasible: boolean
    legs?: any[]
    totalDuration?: number
    totalDistance?: number
    trafficInfo?: UkraineTrafficInfo[]
    adjustedDuration?: number // с учетом пробок
    totalTrafficDelay?: number // общая задержка в минутах
    hasCriticalTraffic?: boolean
  }> {
    const result = await this.checkRoute(chain, options)
    
    // Если есть токен Mapbox и маршрут feasible, получаем данные о трафике
    if (this.config.mapboxToken && result.feasible && chain.length >= 2 && chain.every(o => o.coords)) {
      try {
        const trafficInfo = await getUkraineTrafficForOrders(chain, this.config.mapboxToken)
        
        if (trafficInfo.length > 0) {
          const totalDelay = calculateTotalTrafficDelay(trafficInfo)
          const adjustedDuration = (result.totalDuration || 0) + (totalDelay * 60) // конвертируем минуты в секунды
          const critical = hasCriticalTraffic(trafficInfo)
          
          return {
            ...result,
            adjustedDuration,
            trafficInfo,
            totalTrafficDelay: totalDelay,
            hasCriticalTraffic: critical
          }
        }
      } catch (error) {
        console.warn('Failed to get Mapbox traffic data:', error)
      }
    }
    
    return result
  }
  
  /**
   * Очистка кэша
   */
  clearCache(): void {
    pointToPointCache.clear()
    routeFeasibilityCache.clear()
  }
  
  /**
   * Получение статистики кэша
   */
  getCacheStats(): {
    pointPairs: number
    routes: number
  } {
    return {
      pointPairs: pointToPointCache.size,
      routes: routeFeasibilityCache.size
    }
  }
}

