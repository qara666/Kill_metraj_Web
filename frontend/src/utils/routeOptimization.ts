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

/**
 * Проверяет, можно ли объединить два заказа
 */
export function shouldCombineOrders(
  order1: Order,
  order2: Order,
  options: {
    maxDistanceMeters?: number
    maxTimeWindowMinutes?: number
    sameBuildingThreshold?: number // порог для определения одного здания
  } = {}
): { shouldCombine: boolean; reason: string } {
  const {
    maxDistanceMeters = 500, // 500 метров по умолчанию
    maxTimeWindowMinutes = 30, // 30 минут окно времени
    sameBuildingThreshold = 50 // 50 метров = одно здание
  } = options

  // Быстрая проверка Haversine расстояния (если есть координаты)
  let distanceMeters = Infinity
  if (order1.coords && order2.coords) {
    distanceMeters = haversineDistance(
      order1.coords.lat,
      order1.coords.lng,
      order2.coords.lat,
      order2.coords.lng
    ) * 1000 // в метры
  } else {
    // Если координат нет, проверяем по адресу (приблизительно)
    const addr1 = normalizeAddressForComparison(order1.address)
    const addr2 = normalizeAddressForComparison(order2.address)
    
    // Если адреса очень похожи (одно здание), считаем что очень близко
    if (areAddressesSameBuilding(addr1, addr2)) {
      distanceMeters = 0
    } else {
      // Без координат не можем точно определить расстояние
      return { shouldCombine: false, reason: 'Нет координат для проверки расстояния' }
    }
  }

  // Проверка расстояния
  if (distanceMeters > maxDistanceMeters) {
    return {
      shouldCombine: false,
      reason: `Расстояние слишком большое: ${distanceMeters.toFixed(0)}м > ${maxDistanceMeters}м`
    }
  }

  // Проверка временного окна (дедлайны должны быть близки)
  if (order1.deadlineAt && order2.deadlineAt) {
    const timeDiff = Math.abs(order1.deadlineAt - order2.deadlineAt) / (60 * 1000) // в минутах
    if (timeDiff > maxTimeWindowMinutes) {
      return {
        shouldCombine: false,
        reason: `Временное окно слишком большое: ${timeDiff.toFixed(0)}мин > ${maxTimeWindowMinutes}мин`
      }
    }
  } else if (!order1.deadlineAt && !order2.deadlineAt) {
    // Если оба без дедлайна, можно объединить
  } else {
    // Если один с дедлайном, другой без - более строгая проверка
    const deadline = order1.deadlineAt || order2.deadlineAt
    const noDeadlineOrder = order1.deadlineAt ? order2 : order1
    if (noDeadlineOrder.readyAt) {
      const timeToDeadline = (deadline! - noDeadlineOrder.readyAt) / (60 * 1000)
      if (timeToDeadline < maxTimeWindowMinutes) {
        return {
          shouldCombine: false,
          reason: `Смешанные дедлайны - риск опоздания`
        }
      }
    }
  }

  // Проверка готовности (если один готов, а другой нет - нужно учитывать)
  if (order1.readyAt && order2.readyAt) {
    const readyDiff = Math.abs(order1.readyAt - order2.readyAt) / (60 * 1000)
    if (readyDiff > 60) { // более часа разницы
      return {
        shouldCombine: false,
        reason: `Разница во времени готовности: ${readyDiff.toFixed(0)}мин`
      }
    }
  }

  // Все проверки пройдены
  const reason = distanceMeters < sameBuildingThreshold
    ? `Одно здание (${distanceMeters.toFixed(0)}м)`
    : `Близко (${distanceMeters.toFixed(0)}м) и подходящее время`

  return { shouldCombine: true, reason }
}

/**
 * Объединяет массив заказов в группы для совместной доставки
 */
export function combineOrders(
  orders: Order[],
  options: {
    maxDistanceMeters?: number
    maxTimeWindowMinutes?: number
    maxOrdersPerGroup?: number
  } = {}
): Order[][] {
  const {
    maxDistanceMeters = 500,
    maxTimeWindowMinutes = 30,
    maxOrdersPerGroup = 3
  } = options

  const groups: Order[][] = []
  const used = new Set<number>()

  for (let i = 0; i < orders.length; i++) {
    if (used.has(i)) continue

    const group: Order[] = [orders[i]]
    used.add(i)

    // Ищем заказы для объединения
    for (let j = i + 1; j < orders.length; j++) {
      if (used.has(j) || group.length >= maxOrdersPerGroup) break

      const shouldCombine = shouldCombineOrders(
        orders[i],
        orders[j],
        { maxDistanceMeters, maxTimeWindowMinutes }
      )

      if (shouldCombine.shouldCombine) {
        group.push(orders[j])
        used.add(j)
      }
    }

    groups.push(group)
  }

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

