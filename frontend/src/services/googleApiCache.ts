/**
 * Централизованный кеш для всех Google Maps API запросов
 * Оптимизирует использование API, предотвращая дублирующиеся запросы
 */

interface GeocodeRequest {
  address?: string
  location?: { lat: number; lng: number }
  region?: string
  bounds?: any
  componentRestrictions?: any
}

interface DirectionsRequest {
  origin: any
  destination: any
  waypoints?: any[]
  travelMode?: any
  optimizeWaypoints?: boolean
  unitSystem?: any
  avoidHighways?: boolean
  avoidTolls?: boolean
  avoidFerries?: boolean
  drivingOptions?: any
  region?: string
  provideRouteAlternatives?: boolean
}

class GoogleApiCache {
  private geocodeCache = new Map<string, any[]>()
  private directionsCache = new Map<string, any>()
  private geocoderInstance: any = null
  private directionsServiceInstance: any = null

  /**
   * Инициализация экземпляров сервисов
   */
  initialize(): void {
    if (typeof window !== 'undefined' && window.google && window.google.maps) {
      // SOTA 4.8: Explicit check for constructors to avoid "is not a constructor" race condition
      if (!this.geocoderInstance && window.google.maps.Geocoder) {
        this.geocoderInstance = new window.google.maps.Geocoder()
      }
      if (!this.directionsServiceInstance && window.google.maps.DirectionsService) {
        this.directionsServiceInstance = new window.google.maps.DirectionsService()
      }
    }
  }

  /**
   * Создание ключа кеша для geocode запроса
   */
  private makeGeocodeKey(request: GeocodeRequest): string {
    const parts: string[] = []

    if (request.address) {
      parts.push(`addr:${request.address.trim().toLowerCase()}`)
    }

    if (request.location) {
      const lat = (typeof request.location.lat === 'function'
        ? (request.location.lat as () => number)()
        : request.location.lat) as number | undefined
      const lng = (typeof request.location.lng === 'function'
        ? (request.location.lng as () => number)()
        : request.location.lng) as number | undefined
      if (lat !== undefined && lng !== undefined) {
        parts.push(`loc:${lat.toFixed(5)},${lng.toFixed(5)}`)
      }
    }

    if (request.region) parts.push(`reg:${request.region}`)
    if (request.bounds) parts.push(`bounds:${JSON.stringify(request.bounds.toJSON?.() || request.bounds)}`)
    if (request.componentRestrictions) parts.push(`comp:${JSON.stringify(request.componentRestrictions)}`)

    return parts.join('|')
  }

  /**
   * Создание ключа кеша для directions запроса
   */
  private makeDirectionsKey(request: DirectionsRequest): string {
    const normalized: any = {
      origin: this.normalizeLocation(request.origin),
      destination: this.normalizeLocation(request.destination),
      travelMode: request.travelMode,
      optimizeWaypoints: request.optimizeWaypoints,
      unitSystem: request.unitSystem,
      avoidHighways: request.avoidHighways,
      avoidTolls: request.avoidTolls,
      avoidFerries: request.avoidFerries,
      region: request.region,
      provideRouteAlternatives: request.provideRouteAlternatives
    }

    if (request.waypoints && request.waypoints.length > 0) {
      normalized.waypoints = request.waypoints.map(w => ({
        location: this.normalizeLocation(w.location || w),
        stopover: w.stopover !== undefined ? w.stopover : true
      }))
    }

    if (request.drivingOptions) {
      normalized.drivingOptions = {
        trafficModel: request.drivingOptions.trafficModel
        // departureTime не включаем в ключ, т.к. он меняется, но результат может быть одинаковым
      }
    }

    return JSON.stringify(normalized)
  }

  /**
   * Нормализация location для создания стабильного ключа
   */
  private normalizeLocation(loc: any): any {
    if (!loc) return null

    if (loc.placeId) return { placeId: loc.placeId }
    if (typeof loc === 'string') return loc.trim().toLowerCase()
    if (loc.lat && loc.lng) {
      const lat = (typeof loc.lat === 'function' ? (loc.lat as () => number)() : loc.lat) as number | undefined
      const lng = (typeof loc.lng === 'function' ? (loc.lng as () => number)() : loc.lng) as number | undefined
      if (lat !== undefined && lng !== undefined) {
        return { lat: lat.toFixed(5), lng: lng.toFixed(5) }
      }
    }

    return loc
  }

  private inFlightGeocode = new Map<string, Promise<any[]>>()
  private queue: Array<() => void> = []
  private activeCalls = 0
  private readonly MAX_CONCURRENT_API_CALLS = 8

  /**
   * Управление очередью запросов для максимизации пропускной способности
   */
  private async nextInQueue(): Promise<void> {
    if (this.activeCalls < this.MAX_CONCURRENT_API_CALLS && this.queue.length > 0) {
      const resolve = this.queue.shift()
      if (resolve) {
        this.activeCalls++
        resolve()
      }
    }
  }

  private async acquireSlot(): Promise<void> {
    if (this.activeCalls < this.MAX_CONCURRENT_API_CALLS) {
      this.activeCalls++
      return
    }
    return new Promise(resolve => {
      this.queue.push(resolve)
    })
  }

  private releaseSlot(): void {
    this.activeCalls--
    this.nextInQueue()
  }

  /**
   * Выполнение действия с повторами при OVER_QUERY_LIMIT
   */
  private async executeWithRetry<T>(action: (resolve: (val: T) => void, reject: (err: any) => void) => void, name: string): Promise<T> {
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      try {
        await this.acquireSlot();
        return await new Promise<T>((resolve, reject) => {
          action(
            (val) => {
              this.releaseSlot();
              resolve(val);
            },
            (err) => {
              this.releaseSlot();
              reject(err);
            }
          );
        });
      } catch (error: any) {
        if (error === 'OVER_QUERY_LIMIT' || error?.status === 'OVER_QUERY_LIMIT') {
          attempts++;
          const delay = Math.pow(2, attempts) * 500 + Math.random() * 100;
          console.warn(`[GoogleApiCache] ${name} rate limit hit, retry ${attempts}/${maxAttempts} after ${Math.round(delay)}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw error;
      }
    }
    throw new Error(`${name} failed after ${maxAttempts} retries due to rate limits`);
  }

  /**
   * Геокодирование адреса с кешированием и глобальной очередью
   */
  async geocode(request: GeocodeRequest): Promise<any[]> {
    this.initialize()

    if (!this.geocoderInstance) {
      console.warn('Geocoder not initialized')
      return []
    }

    const cacheKey = this.makeGeocodeKey(request)

    if (this.geocodeCache.has(cacheKey)) {
      return this.geocodeCache.get(cacheKey) || []
    }

    if (this.inFlightGeocode.has(cacheKey)) {
      return this.inFlightGeocode.get(cacheKey)!
    }

    const promise = (async () => {
      try {
        return await this.executeWithRetry<any[]>((resolve) => {
          const apiRequest: any = {}
          if (request.address) apiRequest.address = request.address
          if (request.location) apiRequest.location = request.location
          if (request.region) apiRequest.region = request.region
          if (request.bounds) apiRequest.bounds = request.bounds
          if (request.componentRestrictions) apiRequest.componentRestrictions = request.componentRestrictions

          this.geocoderInstance.geocode(apiRequest, (results: any, status: any) => {
            if (status === 'OVER_QUERY_LIMIT') {
              this.activeCalls--; // Force early release because executeWithRetry will catch it via reject
              return resolve(Promise.reject('OVER_QUERY_LIMIT') as any);
            }
            const res = status === 'OK' ? (results || []) : []
            this.geocodeCache.set(cacheKey, res)
            resolve(res)
          })
        }, `Geocode ${request.address || 'location'}`);
      } catch (e) {
        return [];
      } finally {
        this.inFlightGeocode.delete(cacheKey)
      }
    })()

    this.inFlightGeocode.set(cacheKey, promise)
    return promise
  }

  /**
   * Получение маршрута с кешированием и глобальной очередью
   */
  async getDirections(request: DirectionsRequest): Promise<any | null> {
    this.initialize()

    if (!this.directionsServiceInstance) {
      console.warn('DirectionsService not initialized')
      return null
    }

    const cacheKey = this.makeDirectionsKey(request)

    if (this.directionsCache.has(cacheKey)) {
      return this.directionsCache.get(cacheKey) || null
    }

    try {
      return await this.executeWithRetry<any | null>((resolve) => {
        this.directionsServiceInstance.route(request, (result: any, status: any) => {
          if (status === 'OVER_QUERY_LIMIT') {
            return resolve(Promise.reject('OVER_QUERY_LIMIT') as any);
          }
          if (status === window.google.maps.DirectionsStatus.OK && result) {
            this.directionsCache.set(cacheKey, result)
            resolve(result)
          } else {
            console.error('Directions API error:', status)
            resolve(null)
          }
        })
      }, 'Directions');
    } catch (e) {
      return null;
    }
  }

  /**
   * Очистка кеша geocode
   */
  clearGeocodeCache(): void {
    this.geocodeCache.clear()
  }

  /**
   * Очистка кеша directions
   */
  clearDirectionsCache(): void {
    this.directionsCache.clear()
  }

  /**
   * Очистка всех кешей
   */
  clearAll(): void {
    this.clearGeocodeCache()
    this.clearDirectionsCache()
  }

  /**
   * Получение статистики кеша
   */
  getStats(): { geocode: number; directions: number } {
    return {
      geocode: this.geocodeCache.size,
      directions: this.directionsCache.size
    }
  }

  /**
   * Ограничение размера кеша (удаление старых записей)
   */
  limitCacheSize(maxGeocode: number = 1000, maxDirections: number = 500): void {
    if (this.geocodeCache.size > maxGeocode) {
      const entries = Array.from(this.geocodeCache.entries())
      const toKeep = entries.slice(-maxGeocode)
      this.geocodeCache.clear()
      toKeep.forEach(([key, value]) => this.geocodeCache.set(key, value))
    }

    if (this.directionsCache.size > maxDirections) {
      const entries = Array.from(this.directionsCache.entries())
      const toKeep = entries.slice(-maxDirections)
      this.directionsCache.clear()
      toKeep.forEach(([key, value]) => this.directionsCache.set(key, value))
    }
  }
}

// Экспортируем singleton экземпляр
export const googleApiCache = new GoogleApiCache()

// Автоматически ограничиваем размер кеша каждые 5 минут
if (typeof window !== 'undefined') {
  setInterval(() => {
    googleApiCache.limitCacheSize(1000, 500)
  }, 5 * 60 * 1000)
}


