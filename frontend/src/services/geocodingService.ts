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
  locationType?: string
  types?: string[]
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
    if (typeof window !== 'undefined' && window.google && window.google.maps && window.google.maps.Geocoder) {
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
   * Геокодирование адреса с возвратом нескольких кандидатов
   */
  static async geocodeAddressMulti(
    address: string,
    options: GeocodingOptions = {}
  ): Promise<GeocodingResult[]> {
    if (!this.geocoder) {
      this.initialize()
      if (!this.geocoder) {
        return [{
          success: false,
          formattedAddress: address,
          error: 'Google Maps API не инициализирован'
        }]
      }
    }

    return new Promise((resolve) => {
      const request: any = {
        address: address,
        region: options.region || 'ua',
        ...options
      }

      if (options.bounds && !(options.bounds instanceof (window as any).google.maps.LatLngBounds)) {
        try {
          const b = options.bounds;
          request.bounds = new (window as any).google.maps.LatLngBounds(
            new (window as any).google.maps.LatLng(b.south, b.west),
            new (window as any).google.maps.LatLng(b.north, b.east)
          );
        } catch (e) {
          console.warn('Failed to parse bounds in GeocodingService', e);
        }
      }

      this.geocoder!.geocode(request, (results: any, status: any) => {
        if (status === 'OK' && results && results.length > 0) {
          const mappedResults: GeocodingResult[] = results.map((result: any) => {
            const geocodingResult: GeocodingResult = {
              success: true,
              formattedAddress: result.formatted_address,
              latitude: result.geometry.location.lat(),
              longitude: result.geometry.location.lng(),
              placeId: result.place_id,
              locationType: result.geometry.location_type,
              types: result.types,
              warnings: []
            }

            if (result.geometry.location_type === 'APPROXIMATE') {
              geocodingResult.warnings?.push('Адрес найден приблизительно')
            } else if (result.geometry.location_type === 'GEOMETRIC_CENTER') {
              geocodingResult.warnings?.push('Адрес найден как геометрический центр')
            }

            return geocodingResult
          })
          resolve(mappedResults)
        } else {
          const errorMessage = this.getErrorMessage(status)
          resolve([{
            success: false,
            formattedAddress: address,
            error: errorMessage
          }])
        }
      })
    })
  }

  /**
   * Геокодирование адреса
   */
  static async geocodeAddress(
    address: string,
    options: GeocodingOptions = {}
  ): Promise<GeocodingResult> {
    const results = await this.geocodeAddressMulti(address, options)
    return results[0]
  }

  /**
   * Геокодирование с учетом географического контекста (координат существующих заказов или зон)
   */
  static async geocodeWithContext(
    address: string,
    contextCoords: { lat: number; lng: number }[],
    options: GeocodingOptions = {}
  ): Promise<GeocodingResult> {
    if (contextCoords.length > 0 && typeof window !== 'undefined' && (window as any).google) {
      try {
        const bounds = new (window as any).google.maps.LatLngBounds()
        contextCoords.forEach(c => bounds.extend(new (window as any).google.maps.LatLng(c.lat, c.lng)))

        // Используем bounds для bias (смещения) поиска в сторону существующего маршрута
        options.bounds = bounds
      } catch (e) {
        console.warn('Error creating bounds for geocoding context', e)
      }
    }

    return this.geocodeAndCleanAddress(address, options)
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
            placeId: result.place_id,
            locationType: result.geometry.location_type,
            types: result.types
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

    // Если результат найден, но это ОБЛАСТЬ (регион), а не точный адрес - считаем это ошибкой (раздутие километража)
    const isRegionCenter = result.success && (
      (result.locationType === 'APPROXIMATE' || result.locationType === 'GEOMETRIC_CENTER') &&
      result.types?.includes('administrative_area_level_1') // Киевская область
    );

    if (result.success && !isRegionCenter) {
      return result
    }

    // Если не получилось или это центр области, пробуем очищенный адрес
    let cleanedAddress = address
      .replace(/(?:,|\s)\s*(под\.|подъезд|д\/ф|эт|этаж|эт\.|под|кв|квартира|оф|офис|вход|дом|корп|секция|литера).*$/i, '')
      .replace(/(?:,|\s)\s*\d+\s*(под\.|подъезд|д\/ф|эт|этаж|эт\.|под|кв|квартира|оф|офис|вход|дом|корп|секция|литера).*$/i, '')
      // Удаляем почтовые индексы (5 цифр)
      .replace(/\b\d{5}\b/g, '')
      .trim()

    // Удаляем "Киевская область" и другие вариации, которые могут сбивать поиск в центр области
    cleanedAddress = cleanedAddress
      .replace(/киевская область|kyiv oblast|kiev oblast/gi, '')
      .replace(/,\s*,/g, ',') // fix double commas
      .trim();

    // Убираем лишние запятые после удаления
    cleanedAddress = cleanedAddress.replace(/,\s*,/g, ',').replace(/,$/, '').trim()

    // Если нет упоминания Киева, добавляем (приоритет Киева)
    // Но если есть пригород (Вишневое и т.д.), то не добавляем Киев, а добавляем Украину
    const hasKyiv = /киев|kyiv|kiev/i.test(cleanedAddress);

    // Список городов-спутников (KML зон), чтобы не добавлять "Киев" к "Вишневое"
    const hasSatelliteCity = /вишневое|vishneve|вышгород|vyshhorod|ирпень|irpin|буча|bucha|бровары|brovary|бортничи|bortnychi|коцюбинское|kotsiubynske|софиевская борщаговка|sofiyivska borshchahivka/i.test(cleanedAddress);

    if (!hasKyiv && !hasSatelliteCity) {
      cleanedAddress += ', Киев, Украина'
    } else {
      if (!/украина|ukraine|україна/i.test(cleanedAddress)) {
        cleanedAddress += ', Украина'
      }
    }

    if (cleanedAddress !== address) {
      // console.log(`Geocoding with cleaned address: "${cleanedAddress}"`)
      result = await this.geocodeAddress(cleanedAddress, options)

      // Если и очищенный адрес вернул регион, пробуем жестко добавить Киев (если это не спутник)
      const isCleanedRegionCenter = result.success && (
        (result.locationType === 'APPROXIMATE' || result.locationType === 'GEOMETRIC_CENTER') &&
        result.types?.includes('administrative_area_level_1')
      );

      if (isCleanedRegionCenter && !hasKyiv && !hasSatelliteCity) {
        cleanedAddress = address.replace(/киевская область|kyiv oblast|kiev oblast/gi, '').trim(); // Reset to almost original
        cleanedAddress += ', Киев, Украина'; // Force Kiev
        result = await this.geocodeAddress(cleanedAddress, options);
      }

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
