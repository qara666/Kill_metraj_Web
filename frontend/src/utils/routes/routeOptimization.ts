/**
 * Утилиты для автоматического объединения и разделения заказов
 */

export interface Order {
  idx?: number
  address: string
  raw: any
  orderNumber: string | number
  readyAt: number | null
  deadlineAt: number | null
  [key: string]: any
}

export interface CombinedOrder {
  orders: Order[]
  combinedAddress: string
  earliestReadyAt: number | null
  latestDeadlineAt: number | null
  totalAmount: number
}

// Кеш для приоритетов заказов (обновляется каждую минуту)
const priorityCache = new Map<Order, { priority: number; timestamp: number }>()
const PRIORITY_CACHE_TTL = 60 * 1000 // 1 минута

/**
 * Вычисляет приоритет заказа для быстрой доставки клиентам
 * Чем выше значение, тем выше приоритет
 * Результаты кешируются на 1 минуту для оптимизации производительности
 */
export function calculateOrderPriority(order: Order): number {
  const now = Date.now()
  
  // Проверяем кеш
  const cached = priorityCache.get(order)
  if (cached && (now - cached.timestamp) < PRIORITY_CACHE_TTL) {
    return cached.priority
  }
  
  let priority = 0

  // 1. Срочность по дедлайну (самый важный фактор для клиентов)
  if (order.deadlineAt) {
    const minutesToDeadline = (order.deadlineAt - now) / (60 * 1000)
    if (minutesToDeadline < 30) {
      priority += 1000 - minutesToDeadline * 10 // Очень срочные заказы
    } else if (minutesToDeadline < 60) {
      priority += 500 - minutesToDeadline * 5 // Срочные заказы
    } else {
      priority += Math.max(0, 200 - minutesToDeadline * 2) // Обычные заказы
    }
  }

  // 2. Готовность заказа (готовые заказы имеют приоритет)
  if (order.readyAt) {
    const minutesSinceReady = (now - order.readyAt) / (60 * 1000)
    if (minutesSinceReady > 0) {
      // Заказ готов - чем дольше ждет, тем выше приоритет
      priority += Math.min(300, minutesSinceReady * 10)
    } else {
      // Заказ еще не готов - чем ближе к готовности, тем выше приоритет
      const minutesUntilReady = -minutesSinceReady
      if (minutesUntilReady <= 10) {
        priority += 200 - minutesUntilReady * 10
      }
    }
  } else {
    // Нет времени готовности - считаем готовым сейчас
    priority += 100
  }

  // 3. Бонус за наличие координат (можно сразу планировать)
  if (order.coords) {
    priority += 50
  }

  // Сохраняем в кеш
  priorityCache.set(order, { priority, timestamp: now })
  
  // Очищаем старые записи из кеша (если кеш слишком большой)
  if (priorityCache.size > 1000) {
    const entries = Array.from(priorityCache.entries())
    entries.forEach(([order, data]) => {
      if (now - data.timestamp > PRIORITY_CACHE_TTL) {
        priorityCache.delete(order)
      }
    })
  }

  return priority
}

/**
 * Вычисляет оценку эффективности группировки для курьера
 * Учитывает расстояние, время и количество заказов
 */
export function calculateGroupingEfficiency(
  orders: Order[],
  options: {
    estimatedDistanceKm?: number
    estimatedDurationMin?: number
  } = {}
): number {
  if (orders.length === 0) return 0
  if (orders.length === 1) return 50 // Одиночный заказ - базовая эффективность

  let efficiency = 100 // Базовая эффективность группы

  // Бонус за количество заказов (больше заказов = выше эффективность)
  efficiency += orders.length * 20

  // Штраф за расстояние (если указано)
  if (options.estimatedDistanceKm) {
    const avgDistancePerOrder = options.estimatedDistanceKm / orders.length
    if (avgDistancePerOrder < 2) {
      efficiency += 50 // Очень близкие заказы
    } else if (avgDistancePerOrder < 5) {
      efficiency += 20 // Близкие заказы
    } else {
      efficiency -= (avgDistancePerOrder - 5) * 10 // Штраф за большие расстояния
    }
  }

  // Штраф за время (если указано)
  if (options.estimatedDurationMin) {
    const avgDurationPerOrder = options.estimatedDurationMin / orders.length
    if (avgDurationPerOrder < 15) {
      efficiency += 30 // Быстрая доставка
    } else if (avgDurationPerOrder < 30) {
      efficiency += 10 // Нормальная доставка
    } else {
      efficiency -= (avgDurationPerOrder - 30) * 5 // Штраф за долгое время
    }
  }

  // Бонус за совместимость времени готовности
  const readyTimes = orders
    .map(o => o.readyAt || Date.now())
    .filter(t => t > 0)
  
  if (readyTimes.length > 1) {
    const minReady = Math.min(...readyTimes)
    const maxReady = Math.max(...readyTimes)
    const spread = (maxReady - minReady) / (60 * 1000) // в минутах
    
    if (spread < 15) {
      efficiency += 40 // Заказы готовы одновременно
    } else if (spread < 30) {
      efficiency += 20 // Заказы готовы в близкое время
    } else if (spread > 60) {
      efficiency -= 30 // Большой разброс времени готовности
    }
  }

  return Math.max(0, efficiency)
}

/**
 * Проверяет, можно ли объединить два заказа
 * Улучшенная версия с учетом приоритетов клиентов и эффективности курьеров
 */
export function shouldCombineOrders(
  order1: Order,
  order2: Order,
  options: {
    maxDistanceMeters?: number
    maxTimeWindowMinutes?: number
    sameBuildingThreshold?: number
    prioritizeUrgent?: boolean // Приоритет срочных заказов
    minEfficiencyScore?: number // Минимальная оценка эффективности для группировки
  } = {}
): { shouldCombine: boolean; reason: string; efficiencyScore?: number } {
  const {
    maxDistanceMeters = 500,
    maxTimeWindowMinutes = 30,
    sameBuildingThreshold = 50,
    prioritizeUrgent = true,
    minEfficiencyScore = 70
  } = options

  // Вычисляем приоритеты заказов
  const priority1 = calculateOrderPriority(order1)
  const priority2 = calculateOrderPriority(order2)

  // Если включен приоритет срочных заказов и один из заказов очень срочный
  if (prioritizeUrgent) {
    const isUrgent1 = priority1 > 800
    const isUrgent2 = priority2 > 800
    
    // Очень срочные заказы лучше доставлять отдельно для максимальной скорости
    if (isUrgent1 && !isUrgent2) {
      return {
        shouldCombine: false,
        reason: 'Срочный заказ лучше доставить отдельно для максимальной скорости',
        efficiencyScore: 0
      }
    }
    if (isUrgent2 && !isUrgent1) {
      return {
        shouldCombine: false,
        reason: 'Срочный заказ лучше доставить отдельно для максимальной скорости',
        efficiencyScore: 0
      }
    }
  }

  // Быстрая проверка Haversine расстояния (с использованием кеша)
  let distanceMeters = Infinity
  if (order1.coords && order2.coords) {
    // Используем кешированное расстояние из routeOptimizationCache
    const distanceKm = haversineDistance(
      order1.coords.lat,
      order1.coords.lng,
      order2.coords.lat,
      order2.coords.lng
    )
    distanceMeters = distanceKm * 1000
  } else {
    const addr1 = normalizeAddressForComparison(order1.address)
    const addr2 = normalizeAddressForComparison(order2.address)
    
    if (areAddressesSameBuilding(addr1, addr2)) {
      distanceMeters = 0
    } else {
      return { 
        shouldCombine: false, 
        reason: 'Нет координат для проверки расстояния',
        efficiencyScore: 0
      }
    }
  }

  // Проверка расстояния (более гибкая для близких заказов)
  const distanceScore = distanceMeters < sameBuildingThreshold 
    ? 100 
    : Math.max(0, 100 - (distanceMeters / maxDistanceMeters) * 50)

  if (distanceMeters > maxDistanceMeters * 1.5) {
    return {
      shouldCombine: false,
      reason: `Расстояние слишком большое: ${distanceMeters.toFixed(0)}м`,
      efficiencyScore: 0
    }
  }

  // Улучшенная проверка временного окна
  let timeCompatibility = 100
  let timeReason = ''

  if (order1.deadlineAt && order2.deadlineAt) {
    const deadlineDiff = Math.abs(order1.deadlineAt - order2.deadlineAt) / (60 * 1000)
    if (deadlineDiff > maxTimeWindowMinutes * 1.5) {
      return {
        shouldCombine: false,
        reason: `Временное окно слишком большое: ${deadlineDiff.toFixed(0)}мин`,
        efficiencyScore: 0
      }
    }
    timeCompatibility = Math.max(0, 100 - (deadlineDiff / maxTimeWindowMinutes) * 50)
    timeReason = `Дедлайны близки (${deadlineDiff.toFixed(0)}мин)`
  } else if (!order1.deadlineAt && !order2.deadlineAt) {
    timeCompatibility = 80 // Оба без дедлайна - можно объединить
    timeReason = 'Оба без дедлайна'
  } else {
    // Смешанные дедлайны - более строгая проверка
    const deadline = order1.deadlineAt || order2.deadlineAt
    const timeToDeadline = (deadline! - Date.now()) / (60 * 1000)
    
    if (timeToDeadline < maxTimeWindowMinutes) {
      return {
        shouldCombine: false,
        reason: 'Смешанные дедлайны - риск опоздания',
        efficiencyScore: 0
      }
    }
    timeCompatibility = 60
    timeReason = 'Смешанные дедлайны'
  }

  // Проверка готовности (улучшенная)
  let readyCompatibility = 100
  if (order1.readyAt && order2.readyAt) {
    const readyDiff = Math.abs(order1.readyAt - order2.readyAt) / (60 * 1000)
    if (readyDiff > 90) {
      return {
        shouldCombine: false,
        reason: `Разница во времени готовности слишком большая: ${readyDiff.toFixed(0)}мин`,
        efficiencyScore: 0
      }
    }
    readyCompatibility = Math.max(0, 100 - (readyDiff / 60) * 50)
  } else if (order1.readyAt || order2.readyAt) {
    // Один готов, другой нет - проверяем, не будет ли задержки
    const readyOrder = order1.readyAt ? order1 : order2
    const notReadyOrder = order1.readyAt ? order2 : order1
    const readyTime = readyOrder.readyAt!
    const notReadyTime = notReadyOrder.readyAt || Date.now() + 30 * 60 * 1000 // Предполагаем 30 мин если нет времени
    
    if (notReadyTime > readyTime + 30 * 60 * 1000) {
      // Заказ не готов еще 30+ минут - лучше не объединять
      return {
        shouldCombine: false,
        reason: 'Один заказ готов, другой будет готов слишком поздно',
        efficiencyScore: 0
      }
    }
    readyCompatibility = 70
  }

  // Вычисляем общую оценку эффективности
  const efficiencyScore = (
    distanceScore * 0.4 +      // 40% - расстояние
    timeCompatibility * 0.3 +  // 30% - совместимость времени
    readyCompatibility * 0.3   // 30% - совместимость готовности
  )

  if (efficiencyScore < minEfficiencyScore) {
    return {
      shouldCombine: false,
      reason: `Низкая эффективность группировки: ${efficiencyScore.toFixed(0)}%`,
      efficiencyScore
    }
  }

  // Все проверки пройдены
  const reason = distanceMeters < sameBuildingThreshold
    ? `Одно здание (${distanceMeters.toFixed(0)}м) - эффективность ${efficiencyScore.toFixed(0)}%`
    : `Близко (${distanceMeters.toFixed(0)}м), ${timeReason} - эффективность ${efficiencyScore.toFixed(0)}%`

  return { 
    shouldCombine: true, 
    reason,
    efficiencyScore
  }
}

/**
 * Объединяет массив заказов в группы для совместной доставки
 * Улучшенный алгоритм с учетом приоритетов клиентов и эффективности курьеров
 */
export function combineOrders(
  orders: Order[],
  options: {
    maxDistanceMeters?: number
    maxTimeWindowMinutes?: number
    maxOrdersPerGroup?: number
    prioritizeUrgent?: boolean
    minEfficiencyScore?: number
  } = {}
): Order[][] {
  const {
    maxDistanceMeters = 500,
    maxTimeWindowMinutes = 30,
    maxOrdersPerGroup = 3,
    prioritizeUrgent = true,
    minEfficiencyScore = 70
  } = options

  if (orders.length === 0) return []
  if (orders.length === 1) return [[orders[0]]]

  // 1. Предварительно вычисляем приоритеты для всех заказов (один раз)
  const orderPriorities = new Map<Order, number>()
  orders.forEach(order => {
    orderPriorities.set(order, calculateOrderPriority(order))
  })

  // Сортируем заказы по приоритету (срочные первыми)
  const ordersWithPriority = orders.map(order => ({
    order,
    priority: orderPriorities.get(order)!
  })).sort((a, b) => b.priority - a.priority) // Сначала самые приоритетные

  const groups: Order[][] = []
  const used = new Set<number>()
  const orderToIndex = new Map<Order, number>()
  
  // Создаем маппинг для быстрого поиска индексов
  orders.forEach((o, idx) => orderToIndex.set(o, idx))

  // 2. Обрабатываем заказы по приоритету
  for (const { order: currentOrder, priority } of ordersWithPriority) {
    const currentIdx = orderToIndex.get(currentOrder)!
    if (used.has(currentIdx)) continue

    // Очень срочные заказы (приоритет > 800) доставляем отдельно для максимальной скорости
    if (prioritizeUrgent && priority > 800) {
      groups.push([currentOrder])
      used.add(currentIdx)
      continue
    }

    // 3. Ищем лучших кандидатов для объединения
    const group: Order[] = [currentOrder]
    used.add(currentIdx)

    // Собираем всех потенциальных кандидатов с оценками
    const candidates: Array<{
      order: Order
      index: number
      efficiencyScore: number
      reason: string
      priority: number
    }> = []

    for (let i = 0; i < orders.length; i++) {
      if (used.has(i) || i === currentIdx) continue
      
      const candidate = orders[i]
      const candidatePriority = orderPriorities.get(candidate)!
      
      // Пропускаем очень срочные заказы (они должны быть отдельно)
      if (prioritizeUrgent && candidatePriority > 800) continue

      const combineResult = shouldCombineOrders(
        currentOrder,
        candidate,
        {
          maxDistanceMeters,
          maxTimeWindowMinutes,
          prioritizeUrgent,
          minEfficiencyScore
        }
      )

      if (combineResult.shouldCombine && combineResult.efficiencyScore) {
        candidates.push({
          order: candidate,
          index: i,
          efficiencyScore: combineResult.efficiencyScore,
          reason: combineResult.reason,
          priority: candidatePriority
        })
      }
    }

    // 4. Сортируем кандидатов по эффективности и приоритету
    candidates.sort((a, b) => {
      // Сначала по эффективности (выше = лучше)
      if (Math.abs(a.efficiencyScore - b.efficiencyScore) > 10) {
        return b.efficiencyScore - a.efficiencyScore
      }
      // Затем по приоритету (выше = лучше) - используем уже вычисленный приоритет
      return b.priority - a.priority
    })

    // 5. Добавляем лучших кандидатов в группу
    for (const candidate of candidates) {
      if (group.length >= maxOrdersPerGroup) break
      if (used.has(candidate.index)) continue

      // Проверяем совместимость со всей группой
      let compatibleWithGroup = true
      for (const existingOrder of group) {
        const checkResult = shouldCombineOrders(
          existingOrder,
          candidate.order,
          {
            maxDistanceMeters,
            maxTimeWindowMinutes,
            prioritizeUrgent,
            minEfficiencyScore
          }
        )
        
        if (!checkResult.shouldCombine) {
          compatibleWithGroup = false
          break
        }
      }

      if (compatibleWithGroup) {
        group.push(candidate.order)
        used.add(candidate.index)
      }
    }

    // 6. Оптимизируем порядок заказов в группе для минимизации времени доставки
    if (group.length > 1) {
      group.sort((a, b) => {
        // Сначала по времени готовности
        const aReady = a.readyAt || Date.now()
        const bReady = b.readyAt || Date.now()
        if (Math.abs(aReady - bReady) > 5 * 60 * 1000) {
          return aReady - bReady
        }
        
        // Затем по дедлайну
        if (a.deadlineAt && b.deadlineAt) {
          return a.deadlineAt - b.deadlineAt
        }
        if (a.deadlineAt) return -1
        if (b.deadlineAt) return 1
        
        // Затем по приоритету (используем уже вычисленный)
        return (orderPriorities.get(b) || 0) - (orderPriorities.get(a) || 0)
      })
    }

    groups.push(group)
  }

  // 7. Сортируем группы по приоритету (группы с более приоритетными заказами первыми)
  groups.sort((a, b) => {
    const aMaxPriority = Math.max(...a.map(o => orderPriorities.get(o) || 0))
    const bMaxPriority = Math.max(...b.map(o => orderPriorities.get(o) || 0))
    return bMaxPriority - aMaxPriority
  })

  return groups
}

/**
 * Разделяет слишком большой маршрут на несколько меньших
 */
export function splitLargeRoute(
  route: {
    routeChain: Order[]
    maxStopsPerRoute: number
    maxRouteDurationMin: number
    maxRouteDistanceKm: number
  },
  options: {
    checkFeasibility?: (chain: Order[]) => Promise<{
      feasible: boolean
      totalDuration?: number
      totalDistance?: number
    }>
  } = {}
): Order[][] {
  const { routeChain, maxStopsPerRoute } = route
  const { checkFeasibility } = options

  // Если маршрут уже соответствует лимитам, возвращаем как есть
  if (routeChain.length <= maxStopsPerRoute) {
    return [routeChain]
  }

  const result: Order[][] = []
  let remaining = [...routeChain]

  // Сортируем заказы по приоритету (как в основном планировщике)
  const sortByPriority = (a: Order, b: Order) => {
    const now = Date.now()
    
    // Готовность
    const aReady = a.readyAt ? (a.readyAt <= now ? 1 : 0) : 1
    const bReady = b.readyAt ? (b.readyAt <= now ? 1 : 0) : 1
    if (aReady !== bReady) return bReady - aReady

    // Дедлайн
    if (a.deadlineAt && b.deadlineAt) {
      return a.deadlineAt - b.deadlineAt
    } else if (a.deadlineAt) return -1
    else if (b.deadlineAt) return 1

    return 0
  }

  remaining.sort(sortByPriority)

  // Разбиваем на подмаршруты
  while (remaining.length > 0) {
    const subRoute: Order[] = []
    
    // Берем заказы до лимита или пока не превышаем ограничения
    for (let i = 0; i < remaining.length && subRoute.length < maxStopsPerRoute; i++) {
      const candidate = remaining[i]
      // testChain используется для будущих проверок feasibility
      // const testChain = [...subRoute, candidate]

      // Если есть проверка, используем её
      if (checkFeasibility) {
        // Для быстрого разделения проверяем только лимит по количеству
        // Детальная проверка будет позже при формировании маршрута
      }

      subRoute.push(candidate)
    }

    // Удаляем использованные заказы
    for (const order of subRoute) {
      const index = remaining.findIndex(
        o => o.address === order.address &&
        (o.orderNumber === order.orderNumber || o.raw?.orderNumber === order.raw?.orderNumber)
      )
      if (index !== -1) {
        remaining.splice(index, 1)
      }
    }

    if (subRoute.length > 0) {
      result.push(subRoute)
    }
  }

  return result
}

/**
 * Геокластеризация заказов (группировка близких заказов)
 */
export function clusterOrdersByLocation(
  orders: Order[],
  maxClusters: number = 10,
  maxDistanceKm: number = 5
): Order[][] {
  if (orders.length === 0) return []
  if (orders.length <= maxClusters) return orders.map(o => [o])

  // Простая кластеризация на основе координат
  const clusters: Order[][] = []
  const used = new Set<number>()

  // Для кластеризации нужны координаты
  const ordersWithCoords = orders.filter(o => o.coords)
  const ordersWithoutCoords = orders.filter(o => !o.coords)

  // Обрабатываем заказы с координатами
  for (let i = 0; i < ordersWithCoords.length && clusters.length < maxClusters; i++) {
    if (used.has(i)) continue

    const cluster: Order[] = [ordersWithCoords[i]]
    used.add(i)

    // Ищем близкие заказы
    for (let j = i + 1; j < ordersWithCoords.length; j++) {
      if (used.has(j)) continue

      const distance = haversineDistance(
        ordersWithCoords[i].coords!.lat,
        ordersWithCoords[i].coords!.lng,
        ordersWithCoords[j].coords!.lat,
        ordersWithCoords[j].coords!.lng
      )

      if (distance <= maxDistanceKm) {
        cluster.push(ordersWithCoords[j])
        used.add(j)
      }
    }

    clusters.push(cluster)
  }

  // Добавляем неиспользованные заказы с координатами
  for (let i = 0; i < ordersWithCoords.length; i++) {
    if (!used.has(i)) {
      clusters.push([ordersWithCoords[i]])
    }
  }

  // Добавляем заказы без координат отдельно
  ordersWithoutCoords.forEach(order => {
    clusters.push([order])
  })

  return clusters
}

// ========== Вспомогательные функции ==========

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371 // радиус Земли в км
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function normalizeAddressForComparison(address: string): string {
  return address
    .toLowerCase()
    .replace(/[.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function areAddressesSameBuilding(addr1: string, addr2: string): boolean {
  const normalized1 = normalizeAddressForComparison(addr1)
  const normalized2 = normalizeAddressForComparison(addr2)

  // Извлекаем основные части адреса (улица + номер дома)
  const extractMainAddress = (addr: string) => {
    // Паттерн: "улица номер_дома" или "ул. номер_дома"
    const match = addr.match(/(?:вул|улица|ул|проспект|просп|провулок|пров|бульвар|бул)\s*\.?\s*([а-яёіїє\w\s]+?)\s+(\d+[а-я]?)/i)
    if (match) {
      return `${match[2]} ${match[3]}`.toLowerCase() // "название_улицы номер"
    }
    return addr
  }

  const main1 = extractMainAddress(normalized1)
  const main2 = extractMainAddress(normalized2)

  // Проверяем совпадение основной части
  if (main1 === main2) return true

  // Проверяем похожесть (Levenshtein distance < 3)
  const similarity = calculateSimilarity(main1, main2)
  return similarity > 0.85
}

function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1
  
  if (longer.length === 0) return 1.0
  
  const distance = levenshteinDistance(longer, shorter)
  return (longer.length - distance) / longer.length
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = []
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  
  return matrix[str2.length][str1.length]
}

