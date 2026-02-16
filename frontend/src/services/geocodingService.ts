/**
 * Сервис геокодирования через Google Maps API
 */

// Google Maps types
declare global {
  interface Window {
    google: any
  }
}

export interface GeocodingResult {
  success: boolean
  formattedAddress: string
  latitude?: number
  longitude?: number
  placeId?: string
  error?: string
  warnings?: string[]
}

export interface GeocodingOptions {
  region?: string
  language?: string
  bounds?: any
  componentRestrictions?: any
}

export class GeocodingService {
  private static geocoder: any = null
  private static cache = new Map<string, GeocodingResult>()

  /**
   * Инициализация геокодера
   */
  static initialize(): void {
    if (typeof window !== 'undefined' && window.google && window.google.maps) {
      this.geocoder = new window.google.maps.Geocoder()
    }
  }

  /**
   * Проверка готовности геокодера
   */
  static isReady(): boolean {
    return this.geocoder !== null
  }

  /**
   * Геокодирование адреса
   */
  static async geocodeAddress(
    address: string,
    options: GeocodingOptions = {}
  ): Promise<GeocodingResult> {
    if (!this.geocoder) {
      this.initialize()
      if (!this.geocoder) {
        return {
          success: false,
          formattedAddress: address,
          error: 'Google Maps API не инициализирован'
        }
      }
    }

    // Проверяем кэш
    const cacheKey = `${address}_${JSON.stringify(options)}`
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }

    return new Promise((resolve) => {
      const request: any = {
        address: address,
        region: 'ua', // Force Ukraine region bias
        ...options
      }

      this.geocoder!.geocode(request, (results: any, status: any) => {
        if (status === 'OK' && results && results.length > 0) {
          const result = results[0]
          const geocodingResult: GeocodingResult = {
            success: true,
            formattedAddress: result.formatted_address,
            latitude: result.geometry.location.lat(),
            longitude: result.geometry.location.lng(),
            placeId: result.place_id,
            warnings: []
          }

          // Проверяем точность результата
          const locationType = result.geometry.location_type
          if (locationType === 'APPROXIMATE') {
            geocodingResult.warnings?.push('Адрес найден приблизительно')
          } else if (locationType === 'GEOMETRIC_CENTER') {
            geocodingResult.warnings?.push('Адрес найден как геометрический центр')
          }

          // Кэшируем результат
          this.cache.set(cacheKey, geocodingResult)
          resolve(geocodingResult)
        } else {
          const errorMessage = this.getErrorMessage(status)
          const geocodingResult: GeocodingResult = {
            success: false,
            formattedAddress: address,
            error: errorMessage
          }

          // Кэшируем ошибку на короткое время
          this.cache.set(cacheKey, geocodingResult)
          setTimeout(() => this.cache.delete(cacheKey), 60000) // Удаляем через минуту

          resolve(geocodingResult)
        }
      })
    })
  }

  /**
   * Обратное геокодирование (координаты -> адрес)
   */
  static async reverseGeocode(
    lat: number,
    lng: number,
    options: GeocodingOptions = {}
  ): Promise<GeocodingResult> {
    if (!this.geocoder) {
      this.initialize()
      if (!this.geocoder) {
        return {
          success: false,
          formattedAddress: '',
          error: 'Google Maps API не инициализирован'
        }
      }
    }

    const cacheKey = `reverse_${lat}_${lng}_${JSON.stringify(options)}`
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }

    return new Promise((resolve) => {
      const latlng = new (window as any).google.maps.LatLng(lat, lng)
      const request: any = {
        location: latlng,
        ...options
      }

      this.geocoder!.geocode(request, (results: any, status: any) => {
        if (status === 'OK' && results && results.length > 0) {
          const result = results[0]
          const geocodingResult: GeocodingResult = {
            success: true,
            formattedAddress: result.formatted_address,
            latitude: lat,
            longitude: lng,
            placeId: result.place_id
          }

          this.cache.set(cacheKey, geocodingResult)
          resolve(geocodingResult)
        } else {
          const errorMessage = this.getErrorMessage(status)
          const geocodingResult: GeocodingResult = {
            success: false,
            formattedAddress: '',
            error: errorMessage
          }

          this.cache.set(cacheKey, geocodingResult)
          setTimeout(() => this.cache.delete(cacheKey), 60000)

          resolve(geocodingResult)
        }
      })
    })
  }

  /**
   * Получение сообщения об ошибке
   */
  private static getErrorMessage(status: string): string {
    switch (status) {
      case 'ZERO_RESULTS':
        return 'Адрес не найден'
      case 'OVER_QUERY_LIMIT':
        return 'Превышен лимит запросов к Google Maps API'
      case 'REQUEST_DENIED':
        return 'Запрос отклонен. Проверьте API ключ'
      case 'INVALID_REQUEST':
        return 'Некорректный запрос'
      case 'UNKNOWN_ERROR':
        return 'Неизвестная ошибка'
      default:
        return 'Ошибка геокодирования'
    }
  }

  /**
   * Очистка кэша
   */
  static clearCache(): void {
    this.cache.clear()
  }

  /**
   * Получение размера кэша
   */
  static getCacheSize(): number {
    return this.cache.size
  }

  /**
   * Геокодирование с автоматической очисткой адреса
   */
  static async geocodeAndCleanAddress(address: string, options: GeocodingOptions = {}): Promise<GeocodingResult> {
    // Сначала пытаемся геокодировать исходный адрес
    let result = await this.geocodeAddress(address, options)

    if (result.success) {
      return result
    }

    // Если не получилось, пробуем очищенный адрес
    let cleanedAddress = address
      .replace(/,\s*(под\.|подъезд|д\/ф|эт|этаж|эт\.|под|кв|квартира|оф|офис).*$/i, '')
      .replace(/,\s*\d+\s*(под\.|подъезд|д\/ф|эт|этаж|эт\.|под|кв|квартира|оф|офис).*$/i, '')
      // Удаляем почтовые индексы (5 цифр), так как они часто путают геокодер если устарели
      .replace(/\b\d{5}\b/g, '')
      .trim()

    // Убираем лишние запятые после удаления
    cleanedAddress = cleanedAddress.replace(/,\s*,/g, ',').replace(/,$/, '').trim()

    // Если нет упоминания Киева, добавляем его (так как проект для Киева)
    if (!/киев|kyiv|kiev/i.test(cleanedAddress)) {
      cleanedAddress += ', Киев'
    }

    if (cleanedAddress !== address) {
      // console.log(`Geocoding with cleaned address: "${cleanedAddress}"`)
      result = await this.geocodeAddress(cleanedAddress, options)
      if (result.success) {
        result.warnings = [...(result.warnings || []), 'Адрес был автоматически очищен для поиска']
      }
    }

    return result
  }

  /**
   * Пакетное геокодирование нескольких адресов
   */
  static async geocodeAddresses(
    addresses: string[],
    options: GeocodingOptions = {},
    delayMs: number = 100
  ): Promise<GeocodingResult[]> {
    const results: GeocodingResult[] = []

    for (let i = 0; i < addresses.length; i++) {
      const result = await this.geocodeAddress(addresses[i], options)
      results.push(result)

      // Добавляем задержку между запросами для избежания превышения лимитов
      if (i < addresses.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }

    return results
  }
}
