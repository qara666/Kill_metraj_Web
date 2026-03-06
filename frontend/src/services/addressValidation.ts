import { STREET_RENAMES } from '../utils/data/addressUtils'

/**
 * Сервис для валидации адресов и обнаружения аномалий в маршрутах
 */

export interface AddressValidationResult {
  isValid: boolean
  warnings: string[]
  errors: string[]
  suggestions: string[]
  qualityScore?: number // 0-100, где 100 - идеальный адрес
  geocodingConfidence?: 'high' | 'medium' | 'low' | 'unknown'
}

export interface RouteAnomalyCheck {
  hasAnomalies: boolean
  warnings: string[]
  errors: string[]
  suggestions: string[]
  totalDistance: number
  averageDistancePerOrder: number
  maxDistanceBetweenPoints: number
  geocodingIssues: number // Количество проблем с геокодированием
  suspiciousAddresses: string[] // Адреса с низким качеством
  routeConfidence: 'high' | 'medium' | 'low' // Общая уверенность в маршруте
}

export class AddressValidationService {
  /**
   * Валидация адреса перед расчетом маршрута с системой оценки качества
   */
  static validateAddress(address: string): AddressValidationResult {
    const result: AddressValidationResult = {
      isValid: true,
      warnings: [],
      errors: [],
      suggestions: [],
      qualityScore: 100,
      geocodingConfidence: 'unknown'
    }

    // Убеждаемся что qualityScore всегда определен
    let qualityScore = 100

    if (!address || typeof address !== 'string') {
      result.isValid = false
      result.errors.push('Адрес не может быть пустым')
      result.qualityScore = 0
      return result
    }

    const trimmedAddress = address.trim()

    // Проверка длины адреса
    if (trimmedAddress.length > 200) {
      result.isValid = false
      result.errors.push('Адрес слишком длинный (более 200 символов)')
      qualityScore -= 30
    }

    // Проверка на подозрительные паттерны
    const suspiciousPatterns = [
      { pattern: /[<>{}[\]\\|`~]/g, penalty: 20, message: 'Специальные символы' },
      { pattern: /(.)\1{10,}/g, penalty: 25, message: 'Повторяющиеся символы' },
      { pattern: /[^\x20-\x7E\u00A0-\u00FF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF]/g, penalty: 15, message: 'Небезопасные символы' },
      { pattern: /\b(test|example|sample|demo|fake)\b/i, penalty: 40, message: 'Тестовые слова' },
      { pattern: /\b\d{10,}\b/g, penalty: 20, message: 'Очень длинные числа' },
      { pattern: /\b(undefined|null|empty)\b/i, penalty: 50, message: 'Системные значения' }
    ]

    suspiciousPatterns.forEach(({ pattern, penalty, message }) => {
      if (pattern.test(trimmedAddress)) {
        result.warnings.push(`Обнаружены подозрительные символы или паттерны: ${message}`)
        result.suggestions.push('Проверьте корректность адреса')
        qualityScore -= penalty
        result.geocodingConfidence = 'low'
      }
    })

    // Проверка на минимальную длину
    if (trimmedAddress.length < 5) {
      result.warnings.push('Адрес слишком короткий')
      result.suggestions.push('Убедитесь, что адрес содержит достаточно информации')
      qualityScore -= 30
      result.geocodingConfidence = 'low'
    }

    // Проверка на наличие города (расширенный список)
    const cityPatterns = [
      /\b(Киев|Київ|Kiev|kyiv)\b/i,
      /\b(Харьков|Харків|Kharkiv|kharkov)\b/i,
      /\b(Одесса|Одеса|Odessa)\b/i,
      /\b(Днепр|Дніпро|Dnipro|dnepr)\b/i,
      /\b(Львов|Львів|Lviv|lvov)\b/i,
      /\b(Запорожье|Запоріжжя|Zaporizhzhia)\b/i,
      /\b(Кривой Рог|Кривий Ріг|Kryvyi Rih)\b/i,
      /\b(Николаев|Миколаїв|Mykolaiv)\b/i,
      /\b(Мариуполь|Маріуполь|Mariupol)\b/i,
      /\b(Луганск|Луганськ|Luhansk)\b/i,
      /\b(Донецк|Донецьк|Donetsk)\b/i
    ]

    const hasCity = cityPatterns.some(pattern => pattern.test(trimmedAddress))
    if (!hasCity) {
      result.warnings.push('Не указан город')
      result.suggestions.push('Добавьте название города для более точного расчета')
      qualityScore -= 25
      result.geocodingConfidence = result.geocodingConfidence === 'unknown' ? 'low' : result.geocodingConfidence
    }

    // Проверка на наличие улицы (расширенные паттерны)
    const streetPatterns = [
      /\b(ул\.|улица|вул\.|вулиця|street|st\.|str\.)\b/i,
      /\b(пр\.|проспект|проспект|avenue|ave\.|prospect)\b/i,
      /\b(пер\.|переулок|провулок|lane|ln\.)\b/i,
      /\b(бул\.|бульвар|boulevard|blvd\.|bulvar)\b/i,
      /\b(наб\.|набережная|набережна|embankment)\b/i,
      /\b(пл\.|площадь|площа|square|sq\.)\b/i,
      /\b(ш\.|шоссе|highway|hwy\.)\b/i
    ]

    const hasStreet = streetPatterns.some(pattern => pattern.test(trimmedAddress))
    if (!hasStreet) {
      result.warnings.push('Не указана улица')
      result.suggestions.push('Добавьте название улицы')
      qualityScore -= 20
      result.geocodingConfidence = result.geocodingConfidence === 'unknown' ? 'low' : result.geocodingConfidence
    }

    // Проверка на наличие номера дома (улучшенная)
    const houseNumberPattern = /\b\d+[а-я]?[\/\\]?\d*[а-я]?\b/i
    const hasHouseNumber = houseNumberPattern.test(trimmedAddress)
    if (!hasHouseNumber) {
      result.warnings.push('Не указан номер дома')
      result.suggestions.push('Добавьте номер дома')
      qualityScore -= 15
      result.geocodingConfidence = result.geocodingConfidence === 'unknown' ? 'low' : result.geocodingConfidence
    }

    // Проверка на наличие индекса
    const postalCodePattern = /\b\d{5}\b/
    const hasPostalCode = postalCodePattern.test(trimmedAddress)
    if (hasPostalCode) {
      qualityScore += 5 // Бонус за индекс
    }

    // Проверка на наличие района/области
    const regionPatterns = [
      /\b(область|обл\.|region)\b/i,
      /\b(район|р-н|district)\b/i,
      /\b(микрорайон|мкр\.|microdistrict)\b/i
    ]
    const hasRegion = regionPatterns.some(pattern => pattern.test(trimmedAddress))
    if (hasRegion) {
      qualityScore += 3 // Бонус за регион
    }

    // Определение уверенности в геокодировании
    if (result.geocodingConfidence === 'unknown') {
      // Geocoding 2.0: Check if using historical rename
      const usesRename = STREET_RENAMES.some(([oldName]) => new RegExp(oldName, 'i').test(trimmedAddress))
      if (usesRename) {
        qualityScore += 10 // Bonus for recognized historical name
        result.suggestions.push('Обнаружено историческое название улицы — Geocoding 2.0 применит автоматическое переименование')
      }

      if (qualityScore >= 80) {
        result.geocodingConfidence = 'high'
      } else if (qualityScore >= 60) {
        result.geocodingConfidence = 'medium'
      } else {
        result.geocodingConfidence = 'low'
      }
    }

    // Ограничиваем качество в пределах 0-100
    result.qualityScore = Math.max(0, Math.min(100, qualityScore))

    return result
  }

  /**
   * Проверка вхождения координат в импортированные KML сектора
   */
  static checkInKmlSectors(lat: number, lng: number, kmlData: any, hubNames?: string[], zoneNames?: string[]): { zoneName: string; hubName: string } | null {
    if (!kmlData || !kmlData.polygons || !Array.isArray(kmlData.polygons)) return null
    if (typeof window === 'undefined' || !window.google || !window.google.maps || !window.google.maps.Polygon || !window.google.maps.geometry) return null

    const point = new window.google.maps.LatLng(lat, lng)
    const results: Array<{ zoneName: string; hubName: string; isTechnical: boolean }> = []

    for (const polyData of kmlData.polygons) {
      // Фильтр по хабам
      if (hubNames && hubNames.length > 0 && !hubNames.includes(polyData.folderName)) continue

      // Фильтр по конкретным зонам (если указаны)
      if (zoneNames && zoneNames.length > 0) {
        const zoneKey = `${polyData.folderName}:${polyData.name}`
        if (!zoneNames.includes(zoneKey)) continue
      }

      const polygon = new window.google.maps.Polygon({ paths: polyData.path })
      if (window.google.maps.geometry.poly.containsLocation(point, polygon)) {
        const isTechnical = /авторозвантаження|технічна|авторазгрузка/i.test(polyData.name) || /авторозвантаження|технічна|авторазгрузка/i.test(polyData.folderName);
        results.push({
          zoneName: polyData.name,
          hubName: polyData.folderName,
          isTechnical
        })
      }
    }

    if (results.length === 0) return null;

    // v5.60: Prioritize delivery zones (non-technical)
    const deliveryZone = results.find(r => !r.isTechnical);
    if (deliveryZone) return { zoneName: deliveryZone.zoneName, hubName: deliveryZone.hubName };

    // Fallback to technical if no delivery zone found
    return { zoneName: results[0].zoneName, hubName: results[0].hubName };
  }

  /**
   * Проверка координат на разумность (для Украины)
   */
  static validateCoordinates(lat: number, lng: number): { isValid: boolean; reason?: string } {
    // Примерные границы Украины
    const UKRAINE_BOUNDS = {
      north: 52.5,
      south: 45.0,
      east: 40.2,
      west: 22.1
    }

    if (lat < UKRAINE_BOUNDS.south || lat > UKRAINE_BOUNDS.north) {
      return { isValid: false, reason: 'Широта вне границ Украины' }
    }

    if (lng < UKRAINE_BOUNDS.west || lng > UKRAINE_BOUNDS.east) {
      return { isValid: false, reason: 'Долгота вне границ Украины' }
    }

    // Проверка на нулевые координаты
    if (lat === 0 && lng === 0) {
      return { isValid: false, reason: 'Координаты равны нулю (возможно ошибка геокодирования)' }
    }

    // Проверка на одинаковые координаты (возможно ошибка)
    if (Math.abs(lat - lng) < 0.0001) {
      return { isValid: false, reason: 'Широта и долгота почти одинаковы (возможно ошибка)' }
    }

    return { isValid: true }
  }

  /**
   * Получение адаптивных порогов на основе статистики маршрутов
   */
  static getAdaptiveThresholds(routeCount: number, avgDistance: number): {
    maxLegKm: number
    maxTotalKm: number
    maxAvgPerOrderKm: number
  } {
    // Базовые пороги
    let maxLegKm = 10
    let maxTotalKm = 35
    let maxAvgPerOrderKm = 25

    // Адаптация на основе количества заказов
    if (routeCount > 20) {
      maxLegKm = 15 // Больше заказов = больше расстояние между точками
      maxTotalKm = 50
      maxAvgPerOrderKm = 30
    } else if (routeCount > 10) {
      maxLegKm = 12
      maxTotalKm = 40
      maxAvgPerOrderKm = 28
    }

    // Адаптация на основе средней дистанции
    if (avgDistance > 30) {
      maxTotalKm = Math.max(maxTotalKm, avgDistance * 1.5)
      maxAvgPerOrderKm = Math.max(maxAvgPerOrderKm, avgDistance / routeCount * 1.3)
    }

    return { maxLegKm, maxTotalKm, maxAvgPerOrderKm }
  }

  /**
   * Проверка маршрута на аномалии с улучшенной системой детекции
   */
  static checkRouteAnomalies(route: {
    orders: Array<{ address: string; latitude?: number; longitude?: number }>
    totalDistance?: number
    startAddress: string
    endAddress: string
  }): RouteAnomalyCheck {
    // Загружаем пользовательские пороги из настроек (localStorage)
    let maxLegKm = 10
    let maxTotalKm = 35
    let maxAvgPerOrderKm = 25
    let filterEnabled = true
    try {
      const settingsRaw = localStorage.getItem('km_settings')
      if (settingsRaw) {
        const s = JSON.parse(settingsRaw)
        if (typeof s.anomalyFilterEnabled === 'boolean') filterEnabled = s.anomalyFilterEnabled
        if (typeof s.anomalyMaxLegDistanceKm === 'number') maxLegKm = s.anomalyMaxLegDistanceKm
        if (typeof s.anomalyMaxTotalDistanceKm === 'number') maxTotalKm = s.anomalyMaxTotalDistanceKm
        if (typeof s.anomalyMaxAvgPerOrderKm === 'number') maxAvgPerOrderKm = s.anomalyMaxAvgPerOrderKm
      }
    } catch { }

    // Получаем адаптивные пороги на основе статистики
    const adaptiveThresholds = this.getAdaptiveThresholds(route.orders.length, route.totalDistance || 0)
    if (filterEnabled) {
      maxLegKm = Math.max(maxLegKm, adaptiveThresholds.maxLegKm)
      maxTotalKm = Math.max(maxTotalKm, adaptiveThresholds.maxTotalKm)
      maxAvgPerOrderKm = Math.max(maxAvgPerOrderKm, adaptiveThresholds.maxAvgPerOrderKm)
    }

    const result: RouteAnomalyCheck = {
      hasAnomalies: false,
      warnings: [],
      errors: [],
      suggestions: [],
      totalDistance: route.totalDistance || 0,
      averageDistancePerOrder: 0,
      maxDistanceBetweenPoints: 0,
      geocodingIssues: 0,
      suspiciousAddresses: [],
      routeConfidence: 'high'
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
      if (filterEnabled && route.totalDistance > maxTotalKm) {
        result.hasAnomalies = true
        result.warnings.push(`Маршрут превышает ${maxTotalKm}км (${route.totalDistance.toFixed(1)}км)`)
        result.suggestions.push('Проверьте корректность адресов заказов')
      }

      // Проверка среднего расстояния на заказ
      if (filterEnabled && result.averageDistancePerOrder > maxAvgPerOrderKm) {
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

    // Валидация адресов заказов с проверкой координат
    const addressValidationResults = route.orders.map(order => {
      const validation = this.validateAddress(order.address)

      // Проверяем координаты если они есть
      if (order.latitude && order.longitude) {
        const coordValidation = this.validateCoordinates(order.latitude, order.longitude)
        if (!coordValidation.isValid) {
          validation.errors.push(`Проблема с координатами: ${coordValidation.reason}`)
          validation.qualityScore = Math.max(0, (validation.qualityScore || 100) - 30)
          validation.geocodingConfidence = 'low'
        }
      } else {
        validation.warnings.push('Отсутствуют координаты (возможно проблема геокодирования)')
        validation.qualityScore = Math.max(0, (validation.qualityScore || 100) - 15)
        validation.geocodingConfidence = 'low'
      }

      return { order, validation }
    })

    const invalidAddresses = addressValidationResults.filter(item => !item.validation.isValid)
    const addressesWithWarnings = addressValidationResults.filter(item => item.validation.warnings.length > 0)
    const lowQualityAddresses = addressValidationResults.filter(item => (item.validation.qualityScore || 0) < 60)
    const geocodingIssues = addressValidationResults.filter(item => item.validation.geocodingConfidence === 'low')

    result.geocodingIssues = geocodingIssues.length
    result.suspiciousAddresses = lowQualityAddresses.map(item => item.order.address)

    if (invalidAddresses.length > 0) {
      result.hasAnomalies = true
      result.errors.push(`${invalidAddresses.length} адресов содержат ошибки`)
      result.suggestions.push('Исправьте некорректные адреса перед расчетом маршрута')
    }

    if (addressesWithWarnings.length > 0) {
      result.warnings.push(`${addressesWithWarnings.length} адресов содержат предупреждения`)
    }

    if (geocodingIssues.length > 0) {
      result.hasAnomalies = true
      result.warnings.push(`${geocodingIssues.length} адресов имеют проблемы с геокодированием`)
      result.suggestions.push('Проверьте качество адресов и пересчитайте маршрут')
    }

    if (lowQualityAddresses.length > ordersCount * 0.3) {
      result.hasAnomalies = true
      result.warnings.push(`Много адресов низкого качества (${lowQualityAddresses.length}/${ordersCount})`)
      result.suggestions.push('Улучшите качество адресов для более точного расчета')
    }

    // Проверка на дублирующиеся адреса
    const addresses = route.orders.map(order => order.address.toLowerCase().trim())
    const uniqueAddresses = new Set(addresses)

    if (addresses.length !== uniqueAddresses.size) {
      result.hasAnomalies = true
      result.warnings.push('Обнаружены дублирующиеся адреса в маршруте')
      result.suggestions.push('Удалите дублирующиеся заказы или проверьте адреса')
    }

    // Эвристика: адреса указывают на разные города — возможны длинные переезды
    const knownCities = ['киев', 'київ', 'kiev', 'харьков', 'харків', 'kharkiv', 'одесса', 'одеса', 'odessa', 'днепр', 'дніпро', 'dnipro', 'львов', 'львів', 'lviv']
    const addressCities = addresses.map(a => knownCities.find(c => a.includes(c)) || null).filter(Boolean)
    const distinctCities = new Set(addressCities)
    if (distinctCities.size > 1) {
      result.hasAnomalies = true
      result.warnings.push('Адреса из разных городов в одном маршруте')
      result.suggestions.push('Разделите заказы по городам для корректного расчета')
      result.maxDistanceBetweenPoints = 11 // >10 км по заданному порогу
    }

    // Эвристика: отсутствие номера дома у большинства адресов
    const withoutHouseNumber = addresses.filter(a => !/\b\d+[а-я]?\b/i.test(a))
    if (withoutHouseNumber.length / ordersCount > 0.6) {
      result.hasAnomalies = true
      result.warnings.push('У большинства адресов отсутствует номер дома')
      result.suggestions.push('Добавьте номера домов для повышения точности')
    }

    // Эвристика: подозрительные ключевые слова (почтоматы/пункты) — возможна неточность координат
    const nonPhysicalPatterns = /(почтомат|постамат|пункт выдачи|отделение|склад|терминал)/i
    const nonPhysicalCount = addresses.filter(a => nonPhysicalPatterns.test(a)).length
    if (nonPhysicalCount > 0) {
      result.warnings.push('В маршруте есть адреса пунктов/отделений — возможна неточность')
    }

    // Порог по максимальному расстоянию между точками (>10км) — используем, если предоставлено внешним расчетом
    if (filterEnabled && result.maxDistanceBetweenPoints > maxLegKm) {
      result.hasAnomalies = true
      result.warnings.push(`Расстояние между некоторыми точками превышает ${maxLegKm}км (${result.maxDistanceBetweenPoints.toFixed(1)}км)`)
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

    // Дополнительно: стартовый и конечный адрес совпадают с одним из заказов → возможный цикл
    const hasLoop = addresses.includes(route.startAddress.toLowerCase().trim()) && addresses.includes(route.endAddress.toLowerCase().trim())
    if (hasLoop) {
      result.warnings.push('Старт/финиш совпадают с адресами заказов — проверьте маршрут на петли')
    }

    // Определение общей уверенности в маршруте
    const totalIssues = result.errors.length + result.warnings.length + result.geocodingIssues
    const qualityRatio = lowQualityAddresses.length / ordersCount

    if (totalIssues === 0 && qualityRatio < 0.1) {
      result.routeConfidence = 'high'
    } else if (totalIssues <= 2 && qualityRatio < 0.3) {
      result.routeConfidence = 'medium'
    } else {
      result.routeConfidence = 'low'
    }

    return result
  }

  /**
   * Очистка адреса от лишней информации
   */
  static cleanAddress(address: string): string {
    if (!address) return address

    return address
      .replace(/(?:,|\s)\s*(под\.|подъезд|д\/ф|эт|этаж|эт\.|под|кв|квартира|оф|офис|вход|дом|корп|секция|литера).*$/i, '')
      .replace(/(?:,|\s)\s*\d+\s*(под\.|подъезд|д\/ф|эт|этаж|эт\.|под|кв|квартира|оф|офис|вход|дом|корп|секция|литера).*$/i, '')
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

  /**
   * Получение оценки качества адреса
   */
  static getAddressQualityScore(address: string): number {
    const validation = this.validateAddress(address)
    return validation.qualityScore || 0
  }

  /**
   * Проверка, является ли адрес высокого качества
   */
  static isHighQualityAddress(address: string): boolean {
    const validation = this.validateAddress(address)
    return (validation.qualityScore || 0) >= 80 && validation.geocodingConfidence !== 'low'
  }

  /**
   * Получение статистики качества адресов в маршруте
   */
  static getRouteQualityStats(route: {
    orders: Array<{ address: string; latitude?: number; longitude?: number }>
  }): {
    highQuality: number
    mediumQuality: number
    lowQuality: number
    averageScore: number
    geocodingIssues: number
  } {
    const validations = route.orders.map(order => {
      const validation = this.validateAddress(order.address)

      // Проверяем координаты если они есть
      if (order.latitude && order.longitude) {
        const coordValidation = this.validateCoordinates(order.latitude, order.longitude)
        if (!coordValidation.isValid) {
          validation.qualityScore = Math.max(0, (validation.qualityScore || 100) - 30)
          validation.geocodingConfidence = 'low'
        }
      } else {
        validation.qualityScore = Math.max(0, (validation.qualityScore || 100) - 15)
        validation.geocodingConfidence = 'low'
      }

      return validation
    })

    const scores = validations.map(v => v.qualityScore || 0)
    const geocodingIssues = validations.filter(v => v.geocodingConfidence === 'low').length

    return {
      highQuality: validations.filter(v => (v.qualityScore || 0) >= 80).length,
      mediumQuality: validations.filter(v => (v.qualityScore || 0) >= 60 && (v.qualityScore || 0) < 80).length,
      lowQuality: validations.filter(v => (v.qualityScore || 0) < 60).length,
      averageScore: scores.reduce((sum, score) => sum + score, 0) / scores.length,
      geocodingIssues
    }
  }

  /**
   * Получение рекомендаций по улучшению маршрута
   */
  static getRouteImprovementSuggestions(route: {
    orders: Array<{ address: string; latitude?: number; longitude?: number }>
  }): string[] {
    const suggestions: string[] = []
    const stats = this.getRouteQualityStats(route)

    if (stats.lowQuality > route.orders.length * 0.3) {
      suggestions.push('Много адресов низкого качества - улучшите формат адресов')
    }

    if (stats.geocodingIssues > 0) {
      suggestions.push('Есть проблемы с геокодированием - проверьте корректность адресов')
    }

    if (stats.averageScore < 70) {
      suggestions.push('Общее качество адресов низкое - добавьте номера домов и улицы')
    }

    return suggestions
  }
}
