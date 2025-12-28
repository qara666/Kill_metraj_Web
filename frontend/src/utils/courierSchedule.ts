/**
 * Утилиты для работы с графиком курьеров и расчетом отправок
 */

export interface CourierSchedule {
  courierId: string
  courierName: string
  vehicleType: 'car' | 'motorcycle'
  workDays: WorkDay[]
  maxDistanceKm?: number // Максимальное расстояние для мото курьеров
  isActive: boolean
}

export interface WorkDay {
  dayOfWeek: number // 0 = воскресенье, 1 = понедельник, ..., 6 = суббота
  startTime: string // Формат "HH:MM" - время начала работы (важно для формирования маршрутов)
  // endTime убран - все работают до закрытия
}

// Интерфейсы Break и DispatchWindow удалены - больше не используются

export interface RouteAssignment {
  routeId: string
  courierId: string
  courierName: string
  vehicleType: 'car' | 'motorcycle'
  dispatchTime: number // timestamp
  estimatedStartTime: number // timestamp
  estimatedEndTime: number // timestamp
  orders: any[]
  totalDistanceKm: number
  isFeasible: boolean
  reason?: string // Причина, если маршрут не подходит
}

// Ограничения по типу транспорта
export const VEHICLE_LIMITS = {
  car: {
    maxDistanceKm: Infinity, // Авто может возить все зоны
    maxOrdersPerRoute: 10,
    averageSpeedKmh: 40,
  },
  motorcycle: {
    maxDistanceKm: 15, // Мото ограничено 15 км (можно настроить)
    maxOrdersPerRoute: 6,
    averageSpeedKmh: 35,
  },
}

/**
 * Получает время начала работы курьера в указанный день
 * Возвращает null, если курьер не работает в этот день
 */
export function getCourierStartTime(
  schedule: CourierSchedule,
  timestamp: number
): string | null {
  if (!schedule.isActive) return null

  const date = new Date(timestamp)
  const dayOfWeek = date.getDay()

  // Находим рабочий день
  const workDay = schedule.workDays.find(wd => wd.dayOfWeek === dayOfWeek)
  if (!workDay) return null

  return workDay.startTime
}

/**
 * Проверяет, доступен ли курьер в указанное время (работает ли он в этот день)
 * Учитывается только время начала работы (все работают до закрытия)
 */
export function isCourierAvailable(
  schedule: CourierSchedule,
  timestamp: number
): boolean {
  if (!schedule.isActive) return false

  const date = new Date(timestamp)
  const dayOfWeek = date.getDay()
  const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

  // Находим рабочий день
  const workDay = schedule.workDays.find(wd => wd.dayOfWeek === dayOfWeek)
  if (!workDay) return false

  // Проверяем, что текущее время не раньше времени начала работы
  const startTime = parseTime(workDay.startTime)
  const currentTime = parseTime(timeStr)

  // Курьер доступен, если уже начал работу (все работают до закрытия)
  return currentTime >= startTime
}

/**
 * Парсит время в формате "HH:MM" в минуты от начала дня
 */
function parseTime(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * Получает время начала работы для каждого курьера в указанный день
 * Используется для определения, когда курьер может начать маршрут
 */
export function getCourierStartTimesForDay(
  schedules: CourierSchedule[],
  date: Date
): Array<{ courierId: string; courierName: string; startTime: string }> {
  const dayOfWeek = date.getDay()
  const startTimes: Array<{ courierId: string; courierName: string; startTime: string }> = []

  for (const schedule of schedules) {
    if (!schedule.isActive) continue

    const workDay = schedule.workDays.find(wd => wd.dayOfWeek === dayOfWeek)
    if (workDay) {
      startTimes.push({
        courierId: schedule.courierId,
        courierName: schedule.courierName,
        startTime: workDay.startTime,
      })
    }
  }

  return startTimes.sort((a, b) => a.startTime.localeCompare(b.startTime))
}

/**
 * Подсчитывает количество доступных курьеров в указанное время
 */
export function countAvailableCouriers(
  schedules: CourierSchedule[],
  timestamp: number
): number {
  let count = 0
  for (const schedule of schedules) {
    if (isCourierAvailable(schedule, timestamp)) {
      count++
    }
  }
  return count
}

/**
 * Назначает маршрут курьеру с учетом времени начала работы и ограничений
 * Учитывается количество доступных курьеров в плановое время заказа
 * Если курьеров мало, маршрут начинается раньше, чтобы заказы не опоздали
 */
export function assignRouteToCourier(
  route: {
    orders: any[]
    totalDistanceKm: number
    estimatedDurationMinutes: number
    readyAt?: number // timestamp готовности первого заказа
  },
  schedules: CourierSchedule[],
  preferredDispatchTime?: number // timestamp предпочтительного времени отправки
): RouteAssignment | null {
  // Фильтруем активных курьеров
  const activeSchedules = schedules.filter(s => s.isActive)

  if (activeSchedules.length === 0) {
    return null
  }

  // Находим самый ранний дедлайн среди заказов в маршруте
  const deadlines = route.orders
    .map(o => o.deadlineAt)
    .filter((d): d is number => d !== undefined && d !== null && typeof d === 'number')
    .sort((a, b) => a - b)
  
  const earliestDeadline = deadlines.length > 0 ? deadlines[0] : null

  // Определяем минимальное время отправки (готовность первого заказа или сейчас)
  const minDispatchTime = route.readyAt
    ? Math.max(route.readyAt, Date.now())
    : Date.now()

  // Рассчитываем время начала и окончания маршрута
  let estimatedStartTime = preferredDispatchTime || minDispatchTime
  let estimatedEndTime = estimatedStartTime + route.estimatedDurationMinutes * 60 * 1000

  // Если есть дедлайн, проверяем, успеем ли доставить
  if (earliestDeadline) {
    // Если маршрут не успеет до дедлайна, нужно начать раньше
    if (estimatedEndTime > earliestDeadline) {
      // Вычисляем, на сколько раньше нужно начать
      const delayMs = estimatedEndTime - earliestDeadline
      estimatedStartTime = Math.max(minDispatchTime, estimatedStartTime - delayMs)
      estimatedEndTime = estimatedStartTime + route.estimatedDurationMinutes * 60 * 1000
    }

    // Проверяем количество доступных курьеров в плановое время (дедлайн)
    const availableAtDeadline = countAvailableCouriers(activeSchedules, earliestDeadline)
    
    // Если курьеров мало (меньше 2), приоритизируем раннее начало маршрута
    if (availableAtDeadline < 2) {
    }
  }

  // Находим подходящих курьеров
  const suitableCouriers: Array<{
    schedule: CourierSchedule
    startTime: string | null
    actualStartTime: number
    score: number
  }> = []

  for (const schedule of activeSchedules) {
    // Проверяем ограничение по расстоянию
    const vehicleLimit = VEHICLE_LIMITS[schedule.vehicleType]
    if (route.totalDistanceKm > vehicleLimit.maxDistanceKm) {
      continue
    }

    // Проверяем ограничение по количеству заказов
    if (route.orders.length > vehicleLimit.maxOrdersPerRoute) {
      continue
    }

    // Получаем время начала работы курьера в этот день
    const courierStartTime = getCourierStartTime(schedule, estimatedStartTime)
    if (!courierStartTime) {
      continue // Курьер не работает в этот день
    }

    // Вычисляем время начала работы курьера в этот день
    const dispatchDate = new Date(estimatedStartTime)
    const [startHours, startMinutes] = courierStartTime.split(':').map(Number)
    const courierStartTimestamp = new Date(
      dispatchDate.getFullYear(),
      dispatchDate.getMonth(),
      dispatchDate.getDate(),
      startHours,
      startMinutes,
      0,
      0
    ).getTime()

    // Вычисляем фактическое время начала маршрута
    // Если курьер уже доступен, можем начать сразу (если маршрут готов)
    // Если курьер еще не начал работу, ждем его начала
    let actualStartTime: number
    if (isCourierAvailable(schedule, estimatedStartTime)) {
      // Курьер уже доступен, начинаем как можно раньше (но не раньше готовности заказа)
      actualStartTime = estimatedStartTime
    } else {
      // Курьер еще не начал работу, ждем его начала
      actualStartTime = Math.max(estimatedStartTime, courierStartTimestamp)
    }

    // Проверяем, что маршрут успеет до дедлайна (если есть)
    const actualEndTime = actualStartTime + route.estimatedDurationMinutes * 60 * 1000
    if (earliestDeadline && actualEndTime > earliestDeadline) {
      // Маршрут не успеет до дедлайна с этим курьером
      continue
    }

    // Рассчитываем "оценку" курьера (чем выше, тем лучше)
    let score = 100

    // Бонус за тип транспорта (мото предпочтительнее для коротких маршрутов)
    if (schedule.vehicleType === 'motorcycle' && route.totalDistanceKm < 10) {
      score += 20
    } else if (schedule.vehicleType === 'car' && route.totalDistanceKm > 20) {
      score += 10
    }

    // Бонус за раннее начало (если курьер уже доступен)
    if (isCourierAvailable(schedule, estimatedStartTime)) {
      score += 30 // Приоритет курьерам, которые уже работают
    }

    // Штраф за ожидание (если маршрут готов, но курьер приходит позже)
    if (route.readyAt && actualStartTime > route.readyAt) {
      const waitMinutes = (actualStartTime - route.readyAt) / (60 * 1000)
      score -= waitMinutes * 2
    }

    // Бонус за раннее завершение относительно дедлайна
    if (earliestDeadline) {
      const timeBeforeDeadline = (earliestDeadline - actualEndTime) / (60 * 1000)
      if (timeBeforeDeadline > 0) {
        score += Math.min(timeBeforeDeadline / 10, 20) // До 20 баллов за запас времени
      } else {
        score -= 50 // Большой штраф за опоздание
      }
    }

    suitableCouriers.push({ 
      schedule, 
      startTime: courierStartTime, 
      actualStartTime,
      score 
    })
  }

  if (suitableCouriers.length === 0) {
    return {
      routeId: '',
      courierId: '',
      courierName: 'Не назначен',
      vehicleType: 'car',
      dispatchTime: estimatedStartTime,
      estimatedStartTime,
      estimatedEndTime,
      orders: route.orders,
      totalDistanceKm: route.totalDistanceKm,
      isFeasible: false,
      reason: earliestDeadline 
        ? `Нет доступных курьеров для доставки до дедлайна ${new Date(earliestDeadline).toLocaleString()}`
        : 'Нет доступных курьеров для данного маршрута',
    }
  }

  // Выбираем лучшего курьера (с наивысшей оценкой)
  suitableCouriers.sort((a, b) => b.score - a.score)
  const bestCourier = suitableCouriers[0]

  const finalStartTime = bestCourier.actualStartTime
  const finalEndTime = finalStartTime + route.estimatedDurationMinutes * 60 * 1000

  return {
    routeId: `route_${Date.now()}`,
    courierId: bestCourier.schedule.courierId,
    courierName: bestCourier.schedule.courierName,
    vehicleType: bestCourier.schedule.vehicleType,
    dispatchTime: finalStartTime,
    estimatedStartTime: finalStartTime,
    estimatedEndTime: finalEndTime,
    orders: route.orders,
    totalDistanceKm: route.totalDistanceKm,
    isFeasible: true,
  }
}

/**
 * Фильтрует маршруты по типу курьера и ограничениям
 */
export function filterRoutesByCourierType(
  routes: any[],
  courierType: 'car' | 'motorcycle' | 'all',
  schedules?: CourierSchedule[]
): any[] {
  return routes.filter(route => {
    // Если выбран "все", возвращаем все маршруты
    if (courierType === 'all') return true

    // Получаем ограничения для типа транспорта
    const vehicleLimit = VEHICLE_LIMITS[courierType]

    // Проверяем расстояние
    const routeDistance = route.totalDistanceKm || route.totalDistance || 0
    if (routeDistance > vehicleLimit.maxDistanceKm) {
      return false
    }

    // Проверяем количество заказов
    const ordersCount = route.orders?.length || route.stopsCount || 0
    if (ordersCount > vehicleLimit.maxOrdersPerRoute) {
      return false
    }

    // Если есть графики, проверяем доступность курьеров этого типа
    if (schedules) {
      const availableCouriers = schedules.filter(
        s => s.isActive && s.vehicleType === courierType
      )
      if (availableCouriers.length === 0) {
        return false
      }
    }

    return true
  })
}

/**
 * Создает стандартный график работы (пн-пт, 9:00-18:00)
 */
export function createDefaultSchedule(
  courierId: string,
  courierName: string,
  vehicleType: 'car' | 'motorcycle',
  isActive: boolean = true
): CourierSchedule {
  const workDays: WorkDay[] = []
  
  // Понедельник - Пятница (1-5)
  for (let day = 1; day <= 5; day++) {
    workDays.push({
      dayOfWeek: day,
      startTime: '09:00',
    })
  }

  return {
    courierId,
    courierName,
    vehicleType,
    workDays,
    maxDistanceKm: vehicleType === 'motorcycle' ? VEHICLE_LIMITS.motorcycle.maxDistanceKm : undefined,
    isActive,
  }
}

/**
 * Парсит время из формата Excel (например, "13" или "13,3")
 * "13" -> "13:00"
 * "13,3" -> "13:30"
 * "10,15" -> "10:15"
 * "вечер" -> null (специальное значение, обрабатывается отдельно)
 */
function parseTimeFromExcel(value: any): string | null {
  if (!value && value !== 0) return null
  
  const str = String(value).trim().replace(/\s/g, '').toLowerCase()
  if (!str || str === '' || str === '-') return null
  
  // Специальные значения
  if (str.includes('вечер') || str.includes('evening')) {
    return null // Обрабатывается отдельно
  }
  
  // Формат "13" или "13,3" или "13.3" или "13,15"
  const match = str.match(/^(\d+)[,.](\d+)$/)
  if (match) {
    const hours = parseInt(match[1], 10)
    const minutesStr = match[2]
    
    // Если minutesStr содержит одну цифру (например, "3"), это означает 30 минут
    // Если две цифры (например, "15"), это означает 15 минут
    let minutes = 0
    if (minutesStr.length === 1) {
      minutes = parseInt(minutesStr, 10) * 10 // "3" -> 30
    } else if (minutesStr.length === 2) {
      minutes = parseInt(minutesStr, 10) // "15" -> 15
    } else {
      minutes = parseInt(minutesStr.substring(0, 2), 10) // Берем первые 2 цифры
    }
    
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes < 60) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    }
  }
  
  // Формат только часы "13"
  const hoursOnlyMatch = str.match(/^(\d+)$/)
  if (hoursOnlyMatch) {
    const hours = parseInt(hoursOnlyMatch[1], 10)
    if (hours >= 0 && hours <= 23) {
      return `${String(hours).padStart(2, '0')}:00`
    }
  }
  
  return null
}

/**
 * Парсит график курьеров из Excel таблицы
 * Формат: строки - курьеры, столбцы - дни недели (ПН, ВТ, СР, ЧТ, ПТ, СБ, НД)
 * В ячейках: "13" = 13:00, "13,3" = 13:30, пусто = не работает
 * Все работают до закрытия, учитывается только время начала работы
 */
export function parseCourierScheduleFromExcel(
  excelData: any[][]
): CourierSchedule[] {
  const schedules: CourierSchedule[] = []
  
  if (!excelData || excelData.length < 2) {
    
    return schedules
  }
  
  // Определяем тип транспорта из заголовка таблицы (первая строка, первая ячейка)
  let defaultVehicleType: 'car' | 'motorcycle' = 'car'
  if (excelData.length > 0 && excelData[0] && excelData[0][0]) {
    const headerFirstCell = String(excelData[0][0] || '').toLowerCase().trim()
    if (headerFirstCell.includes('мото') || headerFirstCell.includes('motorcycle')) {
      defaultVehicleType = 'motorcycle'
      
    } else if (headerFirstCell.includes('авто') || headerFirstCell.includes('auto') || headerFirstCell.includes('car')) {
      defaultVehicleType = 'car'
      
    }
  }
  
  // Ищем строку с днями недели (ПН, ВТ, СР, ЧТ, ПТ, СБ, НД)
  let headerRowIndex = -1
  const dayNamesMap: { [key: string]: number } = {
    'пн': 1, 'понедельник': 1, 'mon': 1, 'monday': 1,
    'вт': 2, 'вторник': 2, 'tue': 2, 'tuesday': 2,
    'ср': 3, 'среда': 3, 'wed': 3, 'wednesday': 3,
    'чт': 4, 'четверг': 4, 'thu': 4, 'thursday': 4,
    'пт': 5, 'пятница': 5, 'fri': 5, 'friday': 5,
    'сб': 6, 'суббота': 6, 'sat': 6, 'saturday': 6,
    'нд': 0, 'воскресенье': 0, 'sun': 0, 'sunday': 0,
  }
  
  // Ищем строку с заголовками дней
  for (let i = 0; i < Math.min(5, excelData.length); i++) {
    const row = excelData[i] as any[]
    const rowStr = row.map(c => String(c || '').toLowerCase().trim()).join('|')
    
    // Проверяем наличие дней недели
    const hasDays = Object.keys(dayNamesMap).some(day => rowStr.includes(day))
    if (hasDays) {
      headerRowIndex = i
      
      break
    }
  }
  
  if (headerRowIndex === -1) {
    
    return schedules
  }
  
  const headerRow = excelData[headerRowIndex] as any[]
  
  // Определяем индексы столбцов для каждого дня недели
  const dayColumnIndices: { dayOfWeek: number; columnIndex: number }[] = []
  
  for (let col = 0; col < headerRow.length; col++) {
    const cellValue = String(headerRow[col] || '').toLowerCase().trim()
    
    // Проверяем все варианты названий дней
    for (const [dayName, dayOfWeek] of Object.entries(dayNamesMap)) {
      if (cellValue.includes(dayName)) {
        dayColumnIndices.push({ dayOfWeek, columnIndex: col })
        break
      }
    }
  }
  
  if (dayColumnIndices.length === 0) {
    
    return schedules
  }
  
  // Парсим строки с курьерами (начинаем со строки после заголовка)
  for (let rowIndex = headerRowIndex + 1; rowIndex < excelData.length; rowIndex++) {
    const row = excelData[rowIndex] as any[]
    if (!row || row.length === 0) continue
    
    // Первая ячейка содержит имя курьера (может быть с дополнительной информацией)
    const firstCell = String(row[0] || '').trim()
    if (!firstCell || firstCell.toLowerCase() === 'итого' || firstCell.toLowerCase() === 'total') {
      continue // Пропускаем строки с итогами
    }
    
    // Извлекаем имя курьера (до первого "/" или до конца, если "/" нет)
    const courierName = firstCell.split('/')[0].trim()
    if (!courierName) continue
    
    // Определяем тип транспорта (используем значение из заголовка таблицы по умолчанию)
    let vehicleType: 'car' | 'motorcycle' = defaultVehicleType
    const firstCellLower = firstCell.toLowerCase()
    
    // Также проверяем в самой ячейке курьера (может быть переопределение)
    if (firstCellLower.includes('мото') || firstCellLower.includes('motorcycle')) {
      vehicleType = 'motorcycle'
    } else if (firstCellLower.includes('авто') || firstCellLower.includes('auto') || firstCellLower.includes('car')) {
      vehicleType = 'car'
    }
    
    // Парсим рабочие дни
    const workDays: WorkDay[] = []
    
    for (const { dayOfWeek, columnIndex } of dayColumnIndices) {
      const timeValue = row[columnIndex]
      const timeStr = String(timeValue || '').trim().toLowerCase()
      
      // Проверяем специальные значения
      let startTime: string | null = null
      
      if (timeStr.includes('вечер') || timeStr.includes('evening')) {
        // Вечерняя смена: обычно с 18:00
        startTime = '18:00'
      } else {
        startTime = parseTimeFromExcel(timeValue)
      }
      
      if (startTime) {
        workDays.push({
          dayOfWeek,
          startTime,
        })
      }
    }
    
    // Создаем график только если есть хотя бы один рабочий день
    if (workDays.length > 0) {
      const schedule: CourierSchedule = {
        courierId: `excel_${rowIndex}_${Date.now()}`,
        courierName,
        vehicleType,
        workDays,
        maxDistanceKm: vehicleType === 'motorcycle' ? VEHICLE_LIMITS.motorcycle.maxDistanceKm : undefined,
        isActive: true,
      }
      
      schedules.push(schedule)
      
    }
  }

  return schedules
}

