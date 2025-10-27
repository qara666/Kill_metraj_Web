/**
 * Сервис для валидации адресов и обнаружения аномалий в маршрутах
 */

export interface AddressValidationResult {
  isValid: boolean
  warnings: string[]
  errors: string[]
  suggestions: string[]
}

export interface RouteAnomalyCheck {
  hasAnomalies: boolean
  warnings: string[]
  errors: string[]
  suggestions: string[]
  totalDistance: number
  averageDistancePerOrder: number
  maxDistanceBetweenPoints: number
}

export class AddressValidationService {
  /**
   * Валидация адреса перед расчетом маршрута
   */
  static validateAddress(address: string): AddressValidationResult {
    const result: AddressValidationResult = {
      isValid: true,
      warnings: [],
      errors: [],
      suggestions: []
    }

    if (!address || typeof address !== 'string') {
      result.isValid = false
      result.errors.push('Адрес не может быть пустым')
      return result
    }

    const trimmedAddress = address.trim()

    // Проверка длины адреса
    if (trimmedAddress.length > 200) {
      result.isValid = false
      result.errors.push('Адрес слишком длинный (более 200 символов)')
    }

    // Проверка на подозрительные паттерны
    const suspiciousPatterns = [
      /[<>{}[\]\\|`~]/g, // Специальные символы
      /(.)\1{10,}/g, // Повторяющиеся символы более 10 раз
      /[^\x20-\x7E\u00A0-\u00FF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF]/g, // Небезопасные символы
      /\b(test|example|sample|demo|fake)\b/i, // Тестовые слова
      /\b\d{10,}\b/g // Очень длинные числа (возможно ошибка)
    ]

    suspiciousPatterns.forEach((pattern) => {
      if (pattern.test(trimmedAddress)) {
        result.warnings.push(`Обнаружены подозрительные символы или паттерны в адресе`)
        result.suggestions.push('Проверьте корректность адреса')
      }
    })

    // Проверка на минимальную длину
    if (trimmedAddress.length < 5) {
      result.warnings.push('Адрес слишком короткий')
      result.suggestions.push('Убедитесь, что адрес содержит достаточно информации')
    }

    // Проверка на наличие города
    const cityPatterns = [
      /\b(Киев|Київ|Kiev)\b/i,
      /\b(Харьков|Харків|Kharkiv)\b/i,
      /\b(Одесса|Одеса|Odessa)\b/i,
      /\b(Днепр|Дніпро|Dnipro)\b/i,
      /\b(Львов|Львів|Lviv)\b/i
    ]

    const hasCity = cityPatterns.some(pattern => pattern.test(trimmedAddress))
    if (!hasCity) {
      result.warnings.push('Не указан город')
      result.suggestions.push('Добавьте название города для более точного расчета')
    }

    // Проверка на наличие улицы
    const streetPatterns = [
      /\b(ул\.|улица|вул\.|вулиця|street|st\.)\b/i,
      /\b(пр\.|проспект|проспект|avenue|ave\.)\b/i,
      /\b(пер\.|переулок|провулок|lane)\b/i,
      /\b(бул\.|бульвар|boulevard|blvd\.)\b/i
    ]

    const hasStreet = streetPatterns.some(pattern => pattern.test(trimmedAddress))
    if (!hasStreet) {
      result.warnings.push('Не указана улица')
      result.suggestions.push('Добавьте название улицы')
    }

    // Проверка на наличие номера дома
    const houseNumberPattern = /\b\d+[а-я]?\b/i
    if (!houseNumberPattern.test(trimmedAddress)) {
      result.warnings.push('Не указан номер дома')
      result.suggestions.push('Добавьте номер дома')
    }

    return result
  }

  /**
   * Проверка маршрута на аномалии
   */
  static checkRouteAnomalies(route: {
    orders: Array<{ address: string }>
    totalDistance?: number
    startAddress: string
    endAddress: string
  }): RouteAnomalyCheck {
    const result: RouteAnomalyCheck = {
      hasAnomalies: false,
      warnings: [],
      errors: [],
      suggestions: [],
      totalDistance: route.totalDistance || 0,
      averageDistancePerOrder: 0,
      maxDistanceBetweenPoints: 0
    }

    const ordersCount = route.orders.length

    if (ordersCount === 0) {
      result.hasAnomalies = true
      result.errors.push('В маршруте нет заказов')
      return result
    }

    // Проверка общего расстояния маршрута
    if (route.totalDistance) {
      result.totalDistance = route.totalDistance
      result.averageDistancePerOrder = route.totalDistance / ordersCount

      // Проверка на слишком большое общее расстояние
      if (route.totalDistance > 50) {
        result.hasAnomalies = true
        result.warnings.push(`Маршрут превышает 50км (${route.totalDistance.toFixed(1)}км)`)
        result.suggestions.push('Проверьте корректность адресов заказов')
      }

      // Проверка среднего расстояния на заказ
      if (result.averageDistancePerOrder > 15) {
        result.hasAnomalies = true
        result.warnings.push(`Среднее расстояние на заказ слишком большое (${result.averageDistancePerOrder.toFixed(1)}км)`)
        result.suggestions.push('Возможно, есть ошибки в адресах заказов')
      }

      // Проверка на слишком маленькое расстояние
      if (route.totalDistance < 0.5) {
        result.warnings.push('Маршрут слишком короткий')
        result.suggestions.push('Проверьте, что адреса заказов не совпадают')
      }
    }

    // Валидация адресов заказов
    const addressValidationResults = route.orders.map(order => 
      this.validateAddress(order.address)
    )

    const invalidAddresses = addressValidationResults.filter(result => !result.isValid)
    const addressesWithWarnings = addressValidationResults.filter(result => result.warnings.length > 0)

    if (invalidAddresses.length > 0) {
      result.hasAnomalies = true
      result.errors.push(`${invalidAddresses.length} адресов содержат ошибки`)
      result.suggestions.push('Исправьте некорректные адреса перед расчетом маршрута')
    }

    if (addressesWithWarnings.length > 0) {
      result.warnings.push(`${addressesWithWarnings.length} адресов содержат предупреждения`)
    }

    // Проверка на дублирующиеся адреса
    const addresses = route.orders.map(order => order.address.toLowerCase().trim())
    const uniqueAddresses = new Set(addresses)
    
    if (addresses.length !== uniqueAddresses.size) {
      result.hasAnomalies = true
      result.warnings.push('Обнаружены дублирующиеся адреса в маршруте')
      result.suggestions.push('Удалите дублирующиеся заказы или проверьте адреса')
    }

    // Проверка стартового и конечного адресов
    const startValidation = this.validateAddress(route.startAddress)
    const endValidation = this.validateAddress(route.endAddress)

    if (!startValidation.isValid) {
      result.hasAnomalies = true
      result.errors.push('Некорректный стартовый адрес')
    }

    if (!endValidation.isValid) {
      result.hasAnomalies = true
      result.errors.push('Некорректный конечный адрес')
    }

    return result
  }

  /**
   * Очистка адреса от лишней информации
   */
  static cleanAddress(address: string): string {
    if (!address) return address

    return address
      .replace(/,\s*(под\.|подъезд|д\/ф|эт|этаж|эт\.|под|кв|квартира|оф|офис).*$/i, '')
      .replace(/,\s*\d+\s*(под\.|подъезд|д\/ф|эт|этаж|эт\.|под|кв|квартира|оф|офис).*$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Проверка, является ли адрес подозрительным
   */
  static isSuspiciousAddress(address: string): boolean {
    const validation = this.validateAddress(address)
    return !validation.isValid || validation.warnings.length > 2
  }

  /**
   * Получение рекомендаций по улучшению адреса
   */
  static getAddressSuggestions(address: string): string[] {
    const validation = this.validateAddress(address)
    return validation.suggestions
  }
}
