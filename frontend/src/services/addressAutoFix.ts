import { GeocodingService } from './geocodingService'
import { AddressValidationService, AddressValidationResult } from './addressValidation'

interface AutoFixOptions {
  enableGeocoding: boolean
  enableValidation: boolean
  enableSuggestions: boolean
  minConfidence: number // Минимальная уверенность для автоматического применения
  maxSuggestions: number
}

export interface AddressFixResult {
  originalAddress: string
  fixedAddress: string
  confidence: number // 0-1, где 1 = полная уверенность
  fixType: 'geocoding' | 'validation' | 'suggestion' | 'manual'
  suggestions: string[]
  warnings: string[]
  errors: string[]
}

export const AddressAutoFixService = {
  /**
   * Автоматически исправляет некорректный адрес
   * @param address Исходный адрес
   * @param options Настройки автоматического исправления
   * @returns Результат исправления адреса
   */
  async autoFixAddress(
    address: string, 
    options: Partial<AutoFixOptions> = {}
  ): Promise<AddressFixResult> {
    const defaultOptions: AutoFixOptions = {
      enableGeocoding: true,
      enableValidation: true,
      enableSuggestions: true,
      minConfidence: 0.7,
      maxSuggestions: 3
    }

    const opts = { ...defaultOptions, ...options }
    const result: AddressFixResult = {
      originalAddress: address,
      fixedAddress: address,
      confidence: 0,
      fixType: 'manual',
      suggestions: [],
      warnings: [],
      errors: []
    }

    try {
      // Шаг 1: Валидация и очистка адреса
      if (opts.enableValidation) {
        const validation = AddressValidationService.validateAddress(address)
        
        if (validation.isValid) {
          result.fixedAddress = address // Используем исходный адрес, так как он валиден
          result.confidence = 0.8
          result.fixType = 'validation'
          result.warnings = validation.warnings
          return result
        }

        // Если есть ошибки, пытаемся их исправить
        result.fixedAddress = address // Используем исходный адрес
        result.warnings = validation.warnings
        result.errors = validation.errors
      }

      // Шаг 2: Геокодирование для исправления адреса
      if (opts.enableGeocoding && result.errors.length === 0) {
        try {
          const geocodingResult = await GeocodingService.geocodeAndCleanAddress(
            result.fixedAddress,
            {
              region: 'UA',
              language: 'uk'
            }
          )

          if (geocodingResult.success && geocodingResult.formattedAddress) {
            result.fixedAddress = geocodingResult.formattedAddress
            result.confidence = Math.max(result.confidence, 0.9)
            result.fixType = 'geocoding'
            
            if (geocodingResult.warnings) {
              result.warnings.push(...geocodingResult.warnings)
            }
          } else {
            result.errors.push('Не удалось найти адрес на карте')
          }
        } catch (error) {
          result.errors.push('Ошибка геокодирования: ' + (error as Error).message)
        }
      }

      // Шаг 3: Генерация предложений для исправления
      if (opts.enableSuggestions && result.errors.length > 0) {
        result.suggestions = await AddressAutoFixService.generateAddressSuggestions(
          result.fixedAddress,
          opts.maxSuggestions
        )
      }

      // Шаг 4: Определение финальной уверенности
      if (result.errors.length === 0) {
        result.confidence = Math.max(result.confidence, 0.6)
      } else {
        result.confidence = 0.3
      }

      return result

    } catch (error) {
      result.errors.push('Ошибка автоматического исправления: ' + (error as Error).message)
      result.confidence = 0
      return result
    }
  },

  /**
   * Генерирует предложения для исправления адреса
   * @param address Адрес для исправления
   * @param maxSuggestions Максимальное количество предложений
   * @returns Массив предложений
   */
  async generateAddressSuggestions(
    address: string, 
    maxSuggestions: number = 3
  ): Promise<string[]> {
    const suggestions: string[] = []

    try {
      // Убираем лишние символы и нормализуем
      let normalized = address
        .replace(/[^\w\s\u0400-\u04FF]/g, ' ') // Убираем спецсимволы, оставляем буквы и пробелы
        .replace(/\s+/g, ' ')
        .trim()

      // Разбиваем на части
      const parts = normalized.split(' ')
      
      // Генерируем варианты с разными комбинациями
      if (parts.length >= 2) {
        // Вариант 1: Убираем последнее слово (возможно, лишнее)
        suggestions.push(parts.slice(0, -1).join(' '))
        
        // Вариант 2: Убираем первые слова (возможно, лишние)
        if (parts.length > 3) {
          suggestions.push(parts.slice(2).join(' '))
        }
        
        // Вариант 3: Пытаемся исправить очевидные ошибки
        const corrected = normalized
          .replace(/\b(ул|улица|проспект|пр|бульвар|бул|переулок|пер)\b/gi, 'вул')
          .replace(/\b(дом|д)\b/gi, '')
          .replace(/\b(квартира|кв|офис|оф)\b/gi, '')
          .trim()
        
        if (corrected !== normalized) {
          suggestions.push(corrected)
        }
      }

      // Убираем дубликаты и ограничиваем количество
      const uniqueSuggestions = [...new Set(suggestions)]
        .filter(s => s.length > 5) // Минимальная длина
        .slice(0, maxSuggestions)

      return uniqueSuggestions

    } catch (error) {
      console.error('Ошибка генерации предложений:', error)
      return []
    }
  },

  /**
   * Исправляет адреса в маршруте автоматически
   * @param route Маршрут для исправления
   * @param options Настройки исправления
   * @returns Обновленный маршрут с исправленными адресами
   */
  async autoFixRouteAddresses(
    route: any,
    options: Partial<AutoFixOptions> = {}
  ): Promise<{
    fixedRoute: any
    fixResults: Map<string, AddressFixResult>
    hasChanges: boolean
  }> {
    const fixResults = new Map<string, AddressFixResult>()
    let hasChanges = false

    // Исправляем адреса заказов
    const fixedOrders = await Promise.all(
      route.orders.map(async (order: any) => {
        const fixResult = await AddressAutoFixService.autoFixAddress(
          order.address,
          options
        )

        fixResults.set(order.id, fixResult)

        // Если уверенность достаточно высока, применяем исправление
        if (fixResult.confidence >= (options.minConfidence || 0.7)) {
          hasChanges = true
          return {
            ...order,
            address: fixResult.fixedAddress,
            originalAddress: order.address // Сохраняем оригинальный адрес
          }
        }

        return order
      })
    )

    // Исправляем стартовый и конечный адреса
    let fixedStartAddress = route.startAddress
    let fixedEndAddress = route.endAddress

    if (route.startAddress) {
      const startFixResult = await AddressAutoFixService.autoFixAddress(
        route.startAddress,
        options
      )
      fixResults.set('start', startFixResult)

      if (startFixResult.confidence >= (options.minConfidence || 0.7)) {
        fixedStartAddress = startFixResult.fixedAddress
        hasChanges = true
      }
    }

    if (route.endAddress) {
      const endFixResult = await AddressAutoFixService.autoFixAddress(
        route.endAddress,
        options
      )
      fixResults.set('end', endFixResult)

      if (endFixResult.confidence >= (options.minConfidence || 0.7)) {
        fixedEndAddress = endFixResult.fixedAddress
        hasChanges = true
      }
    }

    const fixedRoute = {
      ...route,
      orders: fixedOrders,
      startAddress: fixedStartAddress,
      endAddress: fixedEndAddress,
      // Сбрасываем флаги оптимизации, так как адреса изменились
      isOptimized: false,
      totalDistance: 0,
      totalDuration: 0
    }

    return {
      fixedRoute,
      fixResults,
      hasChanges
    }
  },

  /**
   * Показывает уведомление о результатах автоматического исправления
   * @param fixResults Результаты исправления
   * @param hasChanges Были ли изменения
   */
  showFixNotification(fixResults: Map<string, AddressFixResult>, hasChanges: boolean) {
    if (!hasChanges) {
      return
    }

    const fixedCount = Array.from(fixResults.values()).filter(
      result => result.confidence >= 0.7
    ).length

    const errorCount = Array.from(fixResults.values()).filter(
      result => result.errors.length > 0
    ).length

    let message = `✅ Автоматически исправлено ${fixedCount} адресов`
    
    if (errorCount > 0) {
      message += `\n⚠️ ${errorCount} адресов требуют ручного исправления`
    }

    // Показываем уведомление (можно заменить на toast)
    console.log('Address Auto-Fix:', message)
    
    // Здесь можно добавить toast уведомление
    if (typeof window !== 'undefined' && (window as any).toast) {
      (window as any).toast.success(message)
    }
  }
}
