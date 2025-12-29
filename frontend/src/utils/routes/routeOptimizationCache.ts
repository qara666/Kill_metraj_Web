/**
 * Кэширование координат и расстояний для оптимизации производительности
 */

export interface Coordinates {
  lat: number
  lng: number
}

export interface CachedDistance {
  distanceKm: number
  timestamp: number
}

class RouteOptimizationCache {
  // Кэш координат: адрес -> { lat, lng }
  private coordinatesCache = new Map<string, Coordinates>()
  
  // Кэш расстояний: "lat1,lng1|lat2,lng2" -> { distanceKm, timestamp }
  private distanceCache = new Map<string, CachedDistance>()
  
  // Время жизни кэша (по умолчанию 1 час)
  private cacheTTL = 60 * 60 * 1000

  /**
   * Получить координаты из кэша или null если нет
   */
  getCoordinates(address: string): Coordinates | null {
    return this.coordinatesCache.get(address) || null
  }

  /**
   * Сохранить координаты в кэш
   */
  setCoordinates(address: string, coords: Coordinates): void {
    this.coordinatesCache.set(address, coords)
  }

  /**
   * Получить расстояние из кэша или null если нет или устарело
   */
  getDistance(key: string): number | null {
    const cached = this.distanceCache.get(key)
    if (!cached) return null
    
    // Проверяем, не устарел ли кэш
    const now = Date.now()
    if (now - cached.timestamp > this.cacheTTL) {
      this.distanceCache.delete(key)
      return null
    }
    
    return cached.distanceKm
  }

  /**
   * Сохранить расстояние в кэш
   */
  setDistance(key: string, distanceKm: number): void {
    this.distanceCache.set(key, {
      distanceKm,
      timestamp: Date.now()
    })
  }

  /**
   * Генерировать ключ для кэша расстояния
   */
  generateDistanceKey(
    coords1: Coordinates,
    coords2: Coordinates
  ): string {
    // Упорядочиваем координаты для консистентности
    const [first, second] = [
      { lat: coords1.lat, lng: coords1.lng },
      { lat: coords2.lat, lng: coords2.lng }
    ].sort((a, b) => {
      if (a.lat !== b.lat) return a.lat - b.lat
      return a.lng - b.lng
    })
    
    return `${first.lat.toFixed(6)},${first.lng.toFixed(6)}|${second.lat.toFixed(6)},${second.lng.toFixed(6)}`
  }

  /**
   * Очистить весь кэш
   */
  clear(): void {
    this.coordinatesCache.clear()
    this.distanceCache.clear()
  }

  /**
   * Очистить устаревшие записи
   */
  clearExpired(): void {
    const now = Date.now()
    for (const [key, value] of this.distanceCache.entries()) {
      if (now - value.timestamp > this.cacheTTL) {
        this.distanceCache.delete(key)
      }
    }
  }

  /**
   * Получить статистику кэша
   */
  getStats(): {
    coordinatesCount: number
    distancesCount: number
    totalSize: number
  } {
    return {
      coordinatesCount: this.coordinatesCache.size,
      distancesCount: this.distanceCache.size,
      totalSize: this.coordinatesCache.size + this.distanceCache.size
    }
  }

  /**
   * Установить время жизни кэша
   */
  setTTL(ttlMs: number): void {
    this.cacheTTL = ttlMs
  }
}

// Глобальный экземпляр кэша
export const routeOptimizationCache = new RouteOptimizationCache()

