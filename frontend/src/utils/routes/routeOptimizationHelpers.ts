/**
 * Вспомогательные функции для оптимизации маршрутов
 */

import { routeOptimizationCache } from './routeOptimizationCache'
import { Order, Coordinates, TrafficSnapshot } from '../../types'

export type { Order, Coordinates, TrafficSnapshot }

/**
 * Вычисляет расстояние Haversine между двумя точками
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371 // радиус Земли в км
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Вычисляет расстояние с использованием кэша
 */
export function getCachedDistance(
  coords1: Coordinates,
  coords2: Coordinates
): number {
  const cacheKey = routeOptimizationCache.generateDistanceKey(coords1, coords2)
  const cached = routeOptimizationCache.getDistance(cacheKey)

  if (cached !== null) {
    return cached
  }

  const distance = haversineDistance(coords1.lat, coords1.lng, coords2.lat, coords2.lng)
  routeOptimizationCache.setDistance(cacheKey, distance)

  return distance
}

/**
 * Находит кластеры заказов по близости
 */
export function findClusters(
  orders: Order[],
  radiusKm: number
): Order[][] {
  const clusters: Order[][] = []
  const used = new Set<number>()

  // Фильтруем заказы с координатами
  const ordersWithCoords = orders
    .map((o, idx) => ({ order: o, idx }))
    .filter(({ order }) => order.coords)

  for (const { order, idx } of ordersWithCoords) {
    if (used.has(idx)) continue

    const cluster: Order[] = [order]
    used.add(idx)

    // Ищем близкие заказы
    for (const { order: other, idx: otherIdx } of ordersWithCoords) {
      if (used.has(otherIdx)) continue
      if (!order.coords || !other.coords) continue

      const distance = getCachedDistance(order.coords, other.coords)
      if (distance <= radiusKm) {
        cluster.push(other)
        used.add(otherIdx)
      }
    }

    clusters.push(cluster)
  }

  // Добавляем заказы без координат как отдельные кластеры
  orders.forEach((order, idx) => {
    if (!order.coords && !used.has(idx)) {
      clusters.push([order])
      used.add(idx)
    }
  })

  return clusters
}

/**
 * Находит кластеры заказов с использованием иерархической кластеризации (Single Linkage)
 * Группирует заказы так, чтобы внутри кластера расстояние между любыми двумя ближайшими точками не превышало radiusKm
 */
export function findClustersHierarchical(
  orders: Order[],
  radiusKm: number
): Order[][] {
  const ordersWithCoords = orders.filter(o => o.coords)
  if (ordersWithCoords.length === 0) return orders.map(o => [o])

  let clusters: Order[][] = ordersWithCoords.map(o => [o])
  let merged = true

  while (merged) {
    merged = false
    let bestPair: [number, number] | null = null
    let minDistance = Infinity

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        // Находим минимальное расстояние между двумя кластерами (Single Linkage)
        for (const o1 of clusters[i]) {
          if (!o1.coords) continue
          for (const o2 of clusters[j]) {
            if (!o2.coords) continue
            const dist = getCachedDistance(o1.coords, o2.coords)
            if (dist < minDistance) {
              minDistance = dist
              bestPair = [i, j]
            }
          }
        }
      }
    }

    if (bestPair && minDistance <= radiusKm) {
      const [i, j] = bestPair
      clusters[i].push(...clusters[j])
      clusters.splice(j, 1)
      merged = true
    }
  }

  // Добавляем заказы без координат
  const withoutCoords = orders.filter(o => !o.coords)
  return [...clusters, ...withoutCoords.map(o => [o])]
}


/**
 * Группирует заказы по зонам доставки
 */
export function groupOrdersByZone(orders: Order[]): Map<string, Order[]> {
  const zoneMap = new Map<string, Order[]>()

  orders.forEach(order => {
    const zone = order.deliveryZone || 'без зоны'
    if (!zoneMap.has(zone)) {
      zoneMap.set(zone, [])
    }
    zoneMap.get(zone)!.push(order)
  })

  return zoneMap
}

/**
 * Вычисляет эффективность маршрута
 */
export function calculateRouteEfficiency(
  chain: Order[],
  totalDistanceM: number,
  totalDurationS: number,
  idleTimeS: number = 0
): number {
  if (chain.length < 2 || totalDistanceM === 0) return 0

  // Прямое расстояние от первого до последнего заказа
  let directDistanceM = 0
  if (chain[0].coords && chain[chain.length - 1].coords) {
    const directKm = getCachedDistance(
      chain[0].coords!,
      chain[chain.length - 1].coords!
    )
    directDistanceM = directKm * 1000
  }

  // Эффективность по расстоянию: directDistance / totalDistance
  // Чем ближе к 1, тем эффективнее
  const distanceEfficiency = directDistanceM > 0
    ? directDistanceM / totalDistanceM
    : 0.5 // Если нет координат, средняя оценка

  // Эффективность по времени: учитываем простои
  const totalTimeS = totalDurationS + idleTimeS
  const timeEfficiency = totalTimeS > 0
    ? (totalDurationS / totalTimeS)
    : 0.5

  // Комбинированная эффективность
  return (distanceEfficiency * 0.6 + timeEfficiency * 0.4)
}

/**
 * Проверяет совместимость заказа по времени готовности с существующим маршрутом
 * ВАЖНО: Использует readyAtSource (время на кухню без упаковки), а не readyAt (с упаковкой)
 */
export function isReadyTimeCompatible(
  candidate: Order,
  existingRoute: Order[],
  maxDifferenceMinutes: number
): boolean {
  if (maxDifferenceMinutes <= 0) return true

  const maxDiffMs = maxDifferenceMinutes * 60 * 1000

  // Получаем все времена готовности (используем readyAtSource, если доступно)
  const readyTimes: number[] = []

  existingRoute.forEach(order => {
    const readyAt = order.readyAtSource || order.readyAt || Date.now()
    readyTimes.push(readyAt)
  })

  const candidateReadyAt = candidate.readyAtSource || candidate.readyAt || Date.now()
  readyTimes.push(candidateReadyAt)

  if (readyTimes.length < 2) return true

  const minReady = Math.min(...readyTimes)
  const maxReady = Math.max(...readyTimes)
  const diff = maxReady - minReady

  return diff <= maxDiffMs
}

/**
 * Фильтрует кандидатов по совместимости времени готовности
 */
export function filterByReadyTimeCompatibility(
  candidates: Order[],
  existingRoute: Order[],
  maxDifferenceMinutes: number
): Order[] {
  if (maxDifferenceMinutes <= 0 || existingRoute.length === 0) {
    return candidates
  }

  return candidates.filter(candidate =>
    isReadyTimeCompatible(candidate, existingRoute, maxDifferenceMinutes)
  )
}

/**
 * Улучшенная проверка совместимости по времени готовности с учетом времени в пути
 */
export function isReadyTimeCompatibleV2(
  candidate: Order,
  existingRoute: Order[],
  maxDifferenceMinutes: number,
  travelTimeMinutes: number = 0 // Время в пути до кандидата
): boolean {
  if (maxDifferenceMinutes <= 0) return true

  const candidateReady = candidate.readyAtSource || candidate.readyAt || Date.now()
  const routeReadyTimes = existingRoute.map(o => o.readyAtSource || o.readyAt || Date.now())

  if (routeReadyTimes.length === 0) return true

  // Учитываем время в пути - курьер должен успеть доехать до кандидата
  const adjustedCandidateReady = candidateReady - (travelTimeMinutes * 60 * 1000)

  // Проверяем, что кандидат готов в окне готовности маршрута
  const minRouteReady = Math.min(...routeReadyTimes)
  const maxRouteReady = Math.max(...routeReadyTimes)
  const maxDiffMs = maxDifferenceMinutes * 60 * 1000

  // Кандидат совместим, если его время готовности (с учетом пути) попадает в окно маршрута
  const candidateInWindow = adjustedCandidateReady >= minRouteReady - maxDiffMs &&
    adjustedCandidateReady <= maxRouteReady + maxDiffMs

  return candidateInWindow
}

/**
 * Группирует заказы по окнам готовности для приоритизации отправки
 */
export function groupOrdersByReadyTimeWindows(
  orders: Order[],
  windowSizeMinutes: number = 30
): Order[][] {
  const windows: Order[][] = []
  const processed = new Set<Order>()

  // Сортируем заказы по времени готовности
  const sortedOrders = [...orders].sort((a, b) => {
    const aReady = a.readyAtSource || a.readyAt || Date.now()
    const bReady = b.readyAtSource || b.readyAt || Date.now()
    return aReady - bReady
  })

  for (const order of sortedOrders) {
    if (processed.has(order)) continue

    const orderReady = order.readyAtSource || order.readyAt || Date.now()
    const windowStart = orderReady - (windowSizeMinutes * 60 * 1000)
    const windowEnd = orderReady + (windowSizeMinutes * 60 * 1000)

    // Находим все заказы в этом окне
    const windowOrders: Order[] = [order]
    processed.add(order)

    for (const other of sortedOrders) {
      if (processed.has(other)) continue

      const otherReady = other.readyAtSource || other.readyAt || Date.now()
      if (otherReady >= windowStart && otherReady <= windowEnd) {
        windowOrders.push(other)
        processed.add(other)
      }
    }

    windows.push(windowOrders)
  }

  // Сортируем окна по времени (раньше = выше приоритет)
  windows.sort((a, b) => {
    const aReady = (a[0].readyAtSource || a[0].readyAt || Date.now())
    const bReady = (b[0].readyAtSource || b[0].readyAt || Date.now())
    return aReady - bReady
  })

  return windows
}

/**
 * Парсит время готовности из строки "время на кухню"
 */
export function parseKitchenTime(kitchenTime: string | number | null | undefined): number | null {
  if (!kitchenTime) return null

  const str = String(kitchenTime).trim().toLowerCase()

  // Число минут
  const minutesMatch = str.match(/(\d+)\s*(?:мин|min|минут|minutes?)/)
  if (minutesMatch) {
    return parseInt(minutesMatch[1], 10)
  }

  // Число часов
  const hoursMatch = str.match(/(\d+)\s*(?:час|hour|часов|hours?)/)
  if (hoursMatch) {
    return parseInt(hoursMatch[1], 10) * 60
  }

  // Просто число (предполагаем минуты)
  const numberMatch = str.match(/^\d+$/)
  if (numberMatch) {
    return parseInt(numberMatch[0], 10)
  }

  return null
}

/**
 * Оценивает готовность заказа на основе "время на кухню"
 * ВАЖНО: Использует readyAtSource (время на кухню без упаковки), а не readyAt (с упаковкой)
 */
export function estimateReadyAt(order: Order): number {
  // Приоритет: readyAtSource > readyAt > вычисление из raw данных
  if (order.readyAtSource) {
    return order.readyAtSource
  }

  if (order.readyAt) {
    return order.readyAt
  }

  const kitchenTime = order.raw?.['время на кухню'] ||
    order.raw?.['время_на_кухню'] ||
    order['время на кухню'] ||
    order.kitchenTime ||
    order.kitchen_time

  if (kitchenTime) {
    const minutes = parseKitchenTime(kitchenTime)
    if (minutes !== null) {
      return Date.now() + minutes * 60 * 1000
    }
  }

  // По умолчанию считаем готовым сейчас
  return Date.now()
}

/**
 * Вычисляет плотность заказов в районе (cluster bonus)
 */
export function calculateClusterDensity(
  candidate: Order,
  allOrders: Order[],
  radiusKm: number = 2
): number {
  if (!candidate.coords) return 0

  let nearbyCount = 0
  allOrders.forEach(order => {
    if (order === candidate || !order.coords) return

    const distance = getCachedDistance(candidate.coords!, order.coords!)
    if (distance <= radiusKm) {
      nearbyCount++
    }
  })

  // Нормализуем до 0-1 (максимум 10 близких заказов = 1.0)
  return Math.min(nearbyCount / 10, 1.0)
}

/**
 * Вычисляет среднее время готовности для маршрута
 */
export function getAverageReadyTime(route: Order[]): number {
  if (route.length === 0) return Date.now()

  const readyTimes = route
    .map(o => estimateReadyAt(o))
    .filter(t => t > 0)

  if (readyTimes.length === 0) return Date.now()

  return readyTimes.reduce((sum, t) => sum + t, 0) / readyTimes.length
}

/**
 * Вычисляет разброс времени готовности в маршруте
 */
export function getReadyTimeSpread(route: Order[]): number {
  if (route.length < 2) return 0

  const readyTimes = route
    .map(o => estimateReadyAt(o))
    .filter(t => t > 0)

  if (readyTimes.length < 2) return 0

  const min = Math.min(...readyTimes)
  const max = Math.max(...readyTimes)

  return max - min
}

/**
 * Извлекает зону доставки из адреса
 */
export function extractZoneFromAddress(address: string): string {
  if (!address) return 'unknown'

  const patterns = [
    /район\s+(\w+)/i,
    /(\w+)\s+район/i,
    /м\.\s*(\w+)/i,
    /микрорайон\s+(\w+)/i,
    /(\w+)\s+микрорайон/i,
    /пос\.\s*(\w+)/i,
    /поселок\s+(\w+)/i,
  ]

  for (const pattern of patterns) {
    const match = address.match(pattern)
    if (match && match[1]) {
      return match[1].toLowerCase().trim()
    }
  }

  return 'unknown'
}

/**
 * Группирует заказы по зонам доставки с объединением близких зон
 */
export function groupOrdersByDeliveryZones(orders: Order[]): Order[][] {
  const zones: Map<string, Order[]> = new Map()

  // 1. Группировка по явной зоне доставки или извлечение из адреса
  for (const order of orders) {
    const zone = order.deliveryZone || extractZoneFromAddress(order.address) || 'unknown'
    if (!zones.has(zone)) {
      zones.set(zone, [])
    }
    zones.get(zone)!.push(order)
  }

  // 2. Объединение близких зон (если есть координаты)
  const mergedZones: Order[][] = []
  const processed = new Set<string>()

  for (const [zone, zoneOrders] of zones.entries()) {
    if (processed.has(zone)) continue

    const merged = [...zoneOrders]
    processed.add(zone)

    // Ищем близкие зоны для объединения
    for (const [otherZone, otherOrders] of zones.entries()) {
      if (processed.has(otherZone)) continue

      // Вычисляем среднее расстояние между зонами
      const avgDistance = calculateAverageDistanceBetweenZones(zoneOrders, otherOrders)
      if (avgDistance < 3 && avgDistance > 0) { // Объединяем зоны ближе 3 км
        merged.push(...otherOrders)
        processed.add(otherZone)
      }
    }

    mergedZones.push(merged)
  }

  return mergedZones
}

/**
 * Вычисляет среднее расстояние между двумя группами заказов
 */
function calculateAverageDistanceBetweenZones(orders1: Order[], orders2: Order[]): number {
  const orders1WithCoords = orders1.filter(o => o.coords)
  const orders2WithCoords = orders2.filter(o => o.coords)

  if (orders1WithCoords.length === 0 || orders2WithCoords.length === 0) {
    return -1 // Нет координат для сравнения
  }

  let totalDistance = 0
  let count = 0

  for (const order1 of orders1WithCoords) {
    for (const order2 of orders2WithCoords) {
      if (!order1.coords || !order2.coords) continue
      const distance = getCachedDistance(order1.coords, order2.coords)
      totalDistance += distance
      count++
    }
  }

  return count > 0 ? totalDistance / count : -1
}

/**
 * Проверяет, является ли заказ срочным
 */
export function isUrgent(order: Order, thresholdMinutes: number = 30): boolean {
  if (!order.deadlineAt) return false
  const minutesUntilDeadline = (order.deadlineAt - Date.now()) / (1000 * 60)
  return minutesUntilDeadline < thresholdMinutes && minutesUntilDeadline > 0
}

/**
 * Вычисляет приоритет заказа с учетом множества факторов
 */
export function calculateOrderPriority(
  order: Order,
  context: {
    currentTime: number
    availableCouriers: number
    avgRouteLoad: number
    allOrders?: Order[]
  }
): number {
  let priority = 0

  // 1. Срочность дедлайна (0-100)
  if (order.deadlineAt) {
    const hoursUntilDeadline = (order.deadlineAt - context.currentTime) / (1000 * 60 * 60)
    if (hoursUntilDeadline < 1) priority += 100
    else if (hoursUntilDeadline < 2) priority += 80
    else if (hoursUntilDeadline < 4) priority += 60
    else priority += 40
  }

  // 2. Готовность заказа (0-50)
  const readyAt = order.readyAtSource || order.readyAt
  if (readyAt) {
    const minutesUntilReady = (readyAt - context.currentTime) / (1000 * 60)
    if (minutesUntilReady <= 0) priority += 50
    else if (minutesUntilReady <= 15) priority += 40
    else if (minutesUntilReady <= 30) priority += 30
    else priority += 20
  } else {
    priority += 50 // Готов сразу
  }

  // 3. Нагрузка на систему (0-30)
  // Если курьеров мало, повышаем приоритет
  if (context.availableCouriers < 2) priority += 30
  else if (context.availableCouriers < 4) priority += 20
  else priority += 10

  // 4. Изоляция заказа (0-20)
  // Заказы в отдаленных зонах получают бонус
  if (context.allOrders) {
    const isolation = calculateIsolation(order, context.allOrders)
    priority += isolation * 20
  }

  return priority
}

/**
 * Вычисляет изоляцию заказа (0-1): насколько далеко от других заказов
 */
function calculateIsolation(order: Order, allOrders: Order[]): number {
  if (!order.coords) return 0.5 // Средняя изоляция если нет координат

  let minDistance = Infinity
  let nearbyCount = 0

  for (const other of allOrders) {
    if (other === order || !other.coords) continue

    const distance = getCachedDistance(order.coords, other.coords)
    if (distance < minDistance) {
      minDistance = distance
    }
    if (distance < 5) { // В радиусе 5 км
      nearbyCount++
    }
  }

  // Изоляция: чем дальше ближайший заказ и меньше соседей, тем выше изоляция
  const distanceScore = Math.min(minDistance / 10, 1.0) // Нормализуем до 0-1
  const densityScore = Math.max(0, 1 - nearbyCount / 5) // Меньше соседей = выше изоляция

  return (distanceScore * 0.6 + densityScore * 0.4)
}

/**
 * Вычисляет плотность заказов вокруг точки
 */
export function calculateOrderDensity(orders: Order[], radiusKm: number = 2): Map<string, number> {
  const density = new Map<string, number>()

  for (const order of orders) {
    if (!order.coords) {
      density.set(order.orderNumber?.toString() || '', 0)
      continue
    }

    let count = 0
    for (const other of orders) {
      if (!other.coords || order === other) continue

      const distance = getCachedDistance(order.coords, other.coords)
      if (distance <= radiusKm) {
        count++
      }
    }

    density.set(order.orderNumber?.toString() || '', count)
  }

  return density
}

/**
 * Приоритизирует заказы с учетом плотности кластеров
 */
export function prioritizeDenseClusters(orders: Order[]): Order[] {
  const density = calculateOrderDensity(orders)

  return orders.sort((a, b) => {
    const aDensity = density.get(a.orderNumber?.toString() || '') || 0
    const bDensity = density.get(b.orderNumber?.toString() || '') || 0

    // Сначала обрабатываем плотные кластеры
    if (aDensity !== bDensity) return bDensity - aDensity

    // Затем по готовности и дедлайну
    const aReady = a.readyAtSource || a.readyAt || Date.now()
    const bReady = b.readyAtSource || b.readyAt || Date.now()
    if (aReady !== bReady) return aReady - bReady

    if (a.deadlineAt && b.deadlineAt) {
      return a.deadlineAt - b.deadlineAt
    } else if (a.deadlineAt) return -1
    else if (b.deadlineAt) return 1

    return 0
  })
}

/**
 * Предварительное распределение заказов по маршрутам с балансировкой
 */
export function preallocateOrdersToRoutes(
  orders: Order[],
  maxRoutes: number,
  zones?: Order[][]
): Order[][] {
  const routes: Order[][] = []
  const routeLoads: number[] = []

  // Если зоны не предоставлены, группируем по зонам доставки
  const orderZones = zones || groupOrdersByDeliveryZones(orders)

  // Сортируем зоны по приоритету (количество срочных заказов, размер зоны)
  orderZones.sort((a, b) => {
    const aUrgent = a.filter(o => isUrgent(o)).length
    const bUrgent = b.filter(o => isUrgent(o)).length
    if (aUrgent !== bUrgent) return bUrgent - aUrgent
    return b.length - a.length
  })

  // Распределяем заказы с балансировкой
  for (const zone of orderZones) {
    // Находим маршрут с наименьшей нагрузкой
    let targetRoute = 0
    let minLoad = routeLoads[0] || 0

    for (let i = 0; i < maxRoutes; i++) {
      const load = routeLoads[i] || 0
      if (load < minLoad) {
        minLoad = load
        targetRoute = i
      }
    }

    if (!routes[targetRoute]) {
      routes[targetRoute] = []
    }

    routes[targetRoute].push(...zone)
    routeLoads[targetRoute] = (routeLoads[targetRoute] || 0) + zone.length
  }

  // Удаляем пустые маршруты
  return routes.filter(r => r.length > 0)
}

/**
 * Оценка времени совместимости кандидата с маршрутом
 */
export function calculateTimeCompatibility(
  candidate: Order,
  currentRoute: Order[]
): number {
  if (currentRoute.length === 0) return 1.0

  const candidateReady = candidate.readyAtSource || candidate.readyAt || Date.now()
  const routeReadyTimes = currentRoute
    .map(o => o.readyAtSource || o.readyAt || Date.now())
    .filter(t => t > 0)

  if (routeReadyTimes.length === 0) return 1.0

  const avgRouteReady = routeReadyTimes.reduce((sum, t) => sum + t, 0) / routeReadyTimes.length
  const diff = Math.abs(candidateReady - avgRouteReady)
  const diffHours = diff / (1000 * 60 * 60)

  // Совместимость: чем меньше разница, тем лучше (0-1)
  return Math.max(0, 1 - diffHours / 4) // Полная совместимость если разница < 4 часов
}

/**
 * Улучшенная оценка кандидата для добавления в маршрут
 */
export interface CandidateScore {
  score: number
  distance: number
  timeCompatibility: number
  zoneMatch: boolean
  deadlineUrgency: number
}

export function enhancedCandidateEvaluation(
  candidate: Order,
  currentRoute: Order[],
  context: {
    lastOrderCoords?: Coordinates | null
    allOrders?: Order[]
  }
): CandidateScore {
  let score = 0

  // 1. Расстояние (0-40 баллов)
  let distance = 0
  if (context.lastOrderCoords && candidate.coords) {
    distance = getCachedDistance(context.lastOrderCoords, candidate.coords)
    const distanceScore = Math.max(0, 40 - (distance / 5) * 10) // Чем ближе, тем лучше
    score += distanceScore
  } else {
    score += 20 // Средняя оценка если нет координат
  }

  // 2. Временная совместимость (0-30 баллов)
  const timeCompatibility = calculateTimeCompatibility(candidate, currentRoute)
  score += timeCompatibility * 30

  // 3. Зона доставки (0-20 баллов)
  const zoneMatch = currentRoute.length > 0 &&
    (currentRoute.some(o =>
      (o.deliveryZone || extractZoneFromAddress(o.address)) ===
      (candidate.deliveryZone || extractZoneFromAddress(candidate.address))
    ))
  if (zoneMatch) score += 20

  // 4. Дедлайн (0-10 баллов)
  let deadlineUrgency = 0
  if (candidate.deadlineAt) {
    const hoursLeft = (candidate.deadlineAt - Date.now()) / (1000 * 60 * 60)
    if (hoursLeft < 2) {
      deadlineUrgency = 1.0
      score += 10
    } else if (hoursLeft < 4) {
      deadlineUrgency = 0.5
      score += 5
    }
  }

  return { score, distance, timeCompatibility, zoneMatch, deadlineUrgency }
}

/**
 * Интерфейс для маршрута при ребалансировке
 */
export interface RouteForRebalancing {
  orders: Order[]
  totalDistance?: number
  totalDuration?: number
  [key: string]: any
}

/**
 * Находит лучший заказ для перемещения между маршрутами
 */
function findBestOrderToMove(
  fromRoute: RouteForRebalancing,
  toRoutes: RouteForRebalancing[]
): { order: Order; targetRoute: RouteForRebalancing } | null {
  let bestMove: { order: Order; targetRoute: RouteForRebalancing; score: number } | null = null

  for (const order of fromRoute.orders) {
    for (const targetRoute of toRoutes) {
      // Проверяем совместимость заказа с целевым маршрутом
      const compatibility = calculateTimeCompatibility(order, targetRoute.orders)
      const zoneMatch = targetRoute.orders.some(o =>
        (o.deliveryZone || extractZoneFromAddress(o.address)) ===
        (order.deliveryZone || extractZoneFromAddress(order.address))
      )

      const score = compatibility * 0.7 + (zoneMatch ? 0.3 : 0)

      if (!bestMove || score > bestMove.score) {
        bestMove = { order, targetRoute, score }
      }
    }
  }

  return bestMove ? { order: bestMove.order, targetRoute: bestMove.targetRoute } : null
}

/**
 * Перемещает заказ между маршрутами
 */
function moveOrderBetweenRoutes(
  order: Order,
  fromRoute: RouteForRebalancing,
  toRoute: RouteForRebalancing
): void {
  const index = fromRoute.orders.indexOf(order)
  if (index !== -1) {
    fromRoute.orders.splice(index, 1)
    toRoute.orders.push(order)
  }
}

/**
 * Проверяет, можно ли объединить два маршрута
 */
function canMergeRoutes(
  route1: RouteForRebalancing,
  route2: RouteForRebalancing,
  maxStopsPerRoute: number = 4
): boolean {
  const totalOrders = route1.orders.length + route2.orders.length
  if (totalOrders > maxStopsPerRoute) return false

  // Проверяем временную совместимость
  const route1ReadyTimes = route1.orders
    .map(o => o.readyAtSource || o.readyAt || Date.now())
    .filter(t => t > 0)
  const route2ReadyTimes = route2.orders
    .map(o => o.readyAtSource || o.readyAt || Date.now())
    .filter(t => t > 0)

  if (route1ReadyTimes.length === 0 || route2ReadyTimes.length === 0) return true

  const avg1 = route1ReadyTimes.reduce((sum, t) => sum + t, 0) / route1ReadyTimes.length
  const avg2 = route2ReadyTimes.reduce((sum, t) => sum + t, 0) / route2ReadyTimes.length
  const diff = Math.abs(avg1 - avg2) / (1000 * 60 * 60) // Разница в часах

  return diff < 2 // Объединяем если разница < 2 часов
}

/**
 * Объединяет два маршрута
 */
function mergeRoutes(
  route1: RouteForRebalancing,
  route2: RouteForRebalancing
): RouteForRebalancing {
  route1.orders.push(...route2.orders)
  return route1
}

/**
 * Ребалансирует маршруты для более равномерного распределения нагрузки
 */
export function rebalanceRoutes(
  routes: RouteForRebalancing[],
  maxStopsPerRoute: number = 4
): RouteForRebalancing[] {
  if (routes.length < 2) return routes

  // 1. Находим перегруженные и недогруженные маршруты
  const avgLoad = routes.reduce((sum, r) => sum + r.orders.length, 0) / routes.length

  const overloaded = routes.filter(r => r.orders.length > avgLoad * 1.5)
  const underloaded = routes.filter(r => r.orders.length < avgLoad * 0.7)

  // 2. Перераспределяем заказы
  for (const overloadedRoute of overloaded) {
    const excess = Math.floor(overloadedRoute.orders.length - avgLoad)

    for (let i = 0; i < excess && underloaded.length > 0; i++) {
      // Находим заказ, который лучше подходит другому маршруту
      const move = findBestOrderToMove(overloadedRoute, underloaded)

      if (move) {
        moveOrderBetweenRoutes(move.order, overloadedRoute, move.targetRoute)

        // Обновляем списки если маршрут больше не недогружен
        if (move.targetRoute.orders.length >= avgLoad * 0.7) {
          const index = underloaded.indexOf(move.targetRoute)
          if (index !== -1) {
            underloaded.splice(index, 1)
          }
        }
      } else {
        break // Не можем найти подходящий заказ для перемещения
      }
    }
  }

  // 3. Объединяем слишком короткие маршруты
  const shortRoutes = routes.filter(r => r.orders.length <= 2)
  const merged: RouteForRebalancing[] = []
  const processed = new Set<RouteForRebalancing>()

  // Сначала обрабатываем короткие маршруты
  for (let i = 0; i < shortRoutes.length; i++) {
    if (processed.has(shortRoutes[i])) continue

    let mergedRoute = { ...shortRoutes[i], orders: [...shortRoutes[i].orders] }
    processed.add(shortRoutes[i])

    // Ищем другие короткие маршруты для объединения
    for (let j = i + 1; j < shortRoutes.length; j++) {
      if (processed.has(shortRoutes[j])) continue

      if (canMergeRoutes(mergedRoute, shortRoutes[j], maxStopsPerRoute)) {
        mergedRoute = mergeRoutes(mergedRoute, shortRoutes[j])
        processed.add(shortRoutes[j])
      }
    }

    merged.push(mergedRoute)
  }

  // Добавляем маршруты, которые не были объединены (не короткие или не обработанные)
  for (const route of routes) {
    if (!processed.has(route)) {
      merged.push(route)
    }
  }

  return merged
}

/**
 * Оценивает максимальное количество маршрутов на основе количества заказов
 */
export function estimateMaxRoutes(orders: Order[], maxStopsPerRoute: number = 4): number {
  const minRoutes = Math.ceil(orders.length / maxStopsPerRoute)
  const maxRoutes = Math.min(orders.length, Math.ceil(orders.length / 2))
  return Math.max(minRoutes, Math.min(maxRoutes, 10)) // Ограничиваем максимум 10 маршрутами
}

// ============================================================================
// УЛУЧШЕНИЕ 1: Оптимизация производительности - кэширование маршрутов
// ============================================================================

/**
 * Кэш для результатов проверки маршрутов (checkChainFeasible)
 */
const routeFeasibilityCache = new Map<string, {
  feasible: boolean
  legs?: any[]
  totalDuration?: number
  totalDistance?: number
  timestamp: number
}>()

const ROUTE_CACHE_TTL = 30 * 60 * 1000 // 30 минут

/**
 * Генерирует ключ кэша для маршрута
 */
function generateRouteCacheKey(chain: Order[]): string {
  return chain.map(o =>
    `${o.orderNumber || ''}_${o.address || ''}_${o.coords?.lat || ''}_${o.coords?.lng || ''}`
  ).join('|')
}

/**
 * Получает результат проверки маршрута из кэша
 */
export function getCachedRouteFeasibility(chain: Order[]): {
  feasible: boolean
  legs?: any[]
  totalDuration?: number
  totalDistance?: number
} | null {
  const key = generateRouteCacheKey(chain)
  const cached = routeFeasibilityCache.get(key)
  if (!cached) return null

  const now = Date.now()
  if (now - cached.timestamp > ROUTE_CACHE_TTL) {
    routeFeasibilityCache.delete(key)
    return null
  }

  return {
    feasible: cached.feasible,
    legs: cached.legs,
    totalDuration: cached.totalDuration,
    totalDistance: cached.totalDistance
  }
}

/**
 * Сохраняет результат проверки маршрута в кэш
 */
export function cacheRouteFeasibility(
  chain: Order[],
  result: {
    feasible: boolean
    legs?: any[]
    totalDuration?: number
    totalDistance?: number
  }
): void {
  const key = generateRouteCacheKey(chain)
  routeFeasibilityCache.set(key, {
    ...result,
    timestamp: Date.now()
  })

  // Очищаем старые записи если кэш слишком большой
  if (routeFeasibilityCache.size > 1000) {
    const now = Date.now()
    for (const [k, v] of routeFeasibilityCache.entries()) {
      if (now - v.timestamp > ROUTE_CACHE_TTL) {
        routeFeasibilityCache.delete(k)
      }
    }
  }
}

/**
 * Предварительная фильтрация кандидатов по расстоянию Haversine
 * (быстрее чем Google API, используется для раннего исключения)
 */
export function prefilterCandidatesByDistance(
  candidates: Order[],
  lastOrderCoords: Coordinates | null,
  maxDistanceKm: number | null
): Order[] {
  if (!maxDistanceKm || !lastOrderCoords) return candidates

  return candidates.filter(candidate => {
    if (!candidate.coords) return true // Оставляем если нет координат

    const distance = getCachedDistance(lastOrderCoords, candidate.coords)
    return distance <= maxDistanceKm * 1.2 // Небольшой запас для погрешности Haversine
  })
}

// ============================================================================
// УЛУЧШЕНИЕ 2: Улучшенная оценка кандидатов с учетом обратного пути
// ============================================================================

/**
 * Вычисляет расстояние обратного пути к базе
 */
export function calculateReturnDistance(
  lastOrderCoords: Coordinates | null,
  baseCoords: Coordinates | null
): number {
  if (!lastOrderCoords || !baseCoords) return 0
  return getCachedDistance(lastOrderCoords, baseCoords)
}

/**
 * Улучшенная оценка кандидата с учетом позиции в маршруте и обратного пути
 */
export interface EnhancedCandidateScore extends CandidateScore {
  returnDistance: number
  routePositionScore: number
  routeDisruptionScore: number
}

export function enhancedCandidateEvaluationV2(
  candidate: Order,
  currentRoute: Order[],
  context: {
    lastOrderCoords?: Coordinates | null
    allOrders?: Order[]
    baseCoords?: Coordinates | null
    routePosition?: number // Позиция в маршруте (0 = начало, 1 = конец)
  }
): EnhancedCandidateScore {
  // Базовая оценка
  const baseScore = enhancedCandidateEvaluation(candidate, currentRoute, context)

  let score = baseScore.score
  let returnDistance = 0
  let routePositionScore = 1.0
  let routeDisruptionScore = 1.0

  // 1. Учет обратного пути к базе
  if (context.baseCoords && context.lastOrderCoords && candidate.coords) {
    // Расстояние от кандидата до базы
    const candidateToBase = getCachedDistance(candidate.coords, context.baseCoords)
    // Расстояние от последнего заказа до базы
    const lastToBase = getCachedDistance(context.lastOrderCoords, context.baseCoords)

    returnDistance = candidateToBase

    // Бонус если кандидат ближе к базе
    if (candidateToBase < lastToBase) {
      const bonus = Math.min((lastToBase - candidateToBase) / 5, 20) // Макс 20 баллов
      score += bonus
    } else {
      // Штраф если кандидат дальше от базы
      const penalty = Math.min((candidateToBase - lastToBase) / 5, 10) // Макс 10 баллов штрафа
      score -= penalty
    }
  }

  // 2. Учет позиции в маршруте
  const position = context.routePosition ?? (currentRoute.length / Math.max(1, currentRoute.length + 1))
  if (position < 0.3) {
    // Начало маршрута - приоритет готовности и близости
    routePositionScore = 1.2
    const readyAt = candidate.readyAtSource || candidate.readyAt
    if (readyAt && readyAt <= Date.now() + 15 * 60 * 1000) {
      score += 15 // Бонус за готовность в начале маршрута
    }
  } else if (position > 0.7) {
    // Конец маршрута - приоритет близости к базе
    routePositionScore = 1.1
    if (returnDistance < 5) {
      score += 10 // Бонус за близость к базе в конце маршрута
    }
  }

  // 3. Оценка "разрушения" маршрута + СТРАТЕГИЧЕСКИЕ ОГРАНИЧЕНИЯ (Phase 2.1)
  if (currentRoute.length >= 1) {
    const allOrders = [...currentRoute, candidate];

    // --- Phase 2.1: SLA Constraint (Max 60m delivery span) ---
    const deadlines = allOrders.map(o => o.deadlineAt).filter((t): t is number => !!t);
    if (deadlines.length > 1) {
      const span = Math.max(...deadlines) - Math.min(...deadlines);
      if (span > 60 * 60 * 1000) {
        return {
          ...baseScore,
          score: -1,
          routeDisruptionScore: 0,
          returnDistance: 0,
          routePositionScore: 0
        }; // INFEASIBLE: SLA violation
      }
    }

    // --- Phase 2.1: Kitchen Constraint (Max 30m ready gap) ---
    const readyTimes = allOrders.map(o => o.readyAtSource || o.readyAt || Date.now());
    const readyGap = Math.max(...readyTimes) - Math.min(...readyTimes);
    if (readyGap > 30 * 60 * 1000) {
      return {
        ...baseScore,
        score: -1,
        routeDisruptionScore: 0,
        returnDistance: 0,
        routePositionScore: 0
      }; // INFEASIBLE: Kitchen gap too wide
    }

    // --- Phase 2.3: District Constraint ---
    const candidateZone = candidate.deliveryZone || extractZoneFromAddress(candidate.address);
    const hasDifferentZone = currentRoute.some(o => {
      const zone = o.deliveryZone || extractZoneFromAddress(o.address);
      return zone && candidateZone && zone !== candidateZone;
    });
    if (hasDifferentZone) {
      score -= 40; // Тяжелый штраф за разные районы
    }

    const timeSpread = getReadyTimeSpread(allOrders);
    const originalSpread = getReadyTimeSpread(currentRoute);

    if (timeSpread > originalSpread * 1.5) {
      routeDisruptionScore = 0.7;
      score *= 0.7;
    } else if (timeSpread < originalSpread) {
      routeDisruptionScore = 1.2;
      score *= 1.2;
    }
  }

  // 4. БОЛЬШОЙ бонус за готовность к немедленной отправке
  const now = Date.now()
  const candidateReady = candidate.readyAtSource || candidate.readyAt || now
  const routeReadyTimes = currentRoute.map(o => o.readyAtSource || o.readyAt || now)

  // Если все заказы в маршруте готовы (или будут готовы в ближайшие 10 минут)
  const allReadySoon = [...routeReadyTimes, candidateReady].every(ready => {
    const minutesUntilReady = (ready - now) / (1000 * 60)
    return minutesUntilReady <= 10
  })

  if (allReadySoon) {
    // БОЛЬШОЙ бонус за возможность отправить маршрут прямо сейчас
    score += 50
    routePositionScore *= 1.3 // Дополнительный множитель
  }

  // УЛУЧШЕНИЕ 1: Учет кластерной плотности
  if (context.allOrders && candidate.coords) {
    const candidateCoords = candidate.coords
    const nearbyOrders = context.allOrders.filter(o => {
      if (!o.coords || o === candidate) return false
      const dist = getCachedDistance(candidateCoords, o.coords)
      return dist <= 2 // В радиусе 2 км
    }).length

    // Бонус за заказы в плотных кластерах (больше заказов рядом = лучше)
    if (nearbyOrders >= 3) {
      score += 25 // Большой бонус за плотный кластер
    } else if (nearbyOrders >= 2) {
      score += 15 // Средний бонус
    } else if (nearbyOrders >= 1) {
      score += 5 // Небольшой бонус
    }
  }

  // УЛУЧШЕНИЕ 2: Учет направления движения маршрута (УСИЛЕНО)
  if (currentRoute.length >= 1 && context.lastOrderCoords && candidate.coords && context.baseCoords) {
    // Вычисляем bearing (азимут) для направления движения
    const toRadians = (deg: number) => deg * (Math.PI / 180)
    const toDegrees = (rad: number) => rad * (180 / Math.PI)

    const bearingBetween = (from: Coordinates, to: Coordinates): number => {
      const lat1 = toRadians(from.lat)
      const lat2 = toRadians(to.lat)
      const dLon = toRadians(to.lng - from.lng)

      const y = Math.sin(dLon) * Math.cos(lat2)
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)

      let bearing = toDegrees(Math.atan2(y, x))
      return (bearing + 360) % 360
    }

    const normalizeAngle = (angle: number): number => {
      while (angle < 0) angle += 360
      while (angle >= 360) angle -= 360
      return angle
    }

    const angularDifference = (a1: number, a2: number): number => {
      const diff = Math.abs(normalizeAngle(a1) - normalizeAngle(a2))
      return Math.min(diff, 360 - diff)
    }

    // Направление от базы к первому заказу (если есть)
    let primaryDirection: number | null = null
    if (currentRoute.length > 0 && currentRoute[0].coords) {
      primaryDirection = bearingBetween(context.baseCoords, currentRoute[0].coords)
    } else if (context.lastOrderCoords) {
      primaryDirection = bearingBetween(context.baseCoords, context.lastOrderCoords)
    }

    // Направление от последнего заказа к кандидату
    const candidateDirection = bearingBetween(context.lastOrderCoords, candidate.coords)

    // Направление от кандидата к базе (для проверки возврата)
    const returnDirection = bearingBetween(candidate.coords, context.baseCoords)

    if (primaryDirection !== null) {
      // Проверяем, насколько кандидат соответствует основному направлению
      const directionDiff = angularDifference(primaryDirection, candidateDirection)

      // СТРОГИЙ ШТРАФ за развороты (отклонение более 90 градусов)
      if (directionDiff > 90) {
        // Большой штраф за разворот
        score -= 40
      } else if (directionDiff > 60) {
        // Средний штраф за значительное отклонение
        score -= 20
      } else if (directionDiff <= 30) {
        // БОЛЬШОЙ бонус за движение в том же направлении
        score += 35
      } else if (directionDiff <= 45) {
        // Средний бонус
        score += 20
      }

      // Дополнительный бонус, если кандидат находится в направлении к базе (удобный возврат)
      const returnDiff = angularDifference(primaryDirection, returnDirection)
      if (returnDiff <= 45) {
        score += 15 // Бонус за удобный возврат
      }
    }

    // Проверка на "зигзаг" - если маршрут уже делает зигзаг, штрафуем еще больше
    // Векторная Гравитация (Dijkstra-lite): Тянем маршрут к его "центру тяжести"
    if (currentRoute.length >= 2) {
      const avgLat = currentRoute.reduce((s, o) => s + (o.coords?.lat || 0), 0) / currentRoute.length
      const avgLng = currentRoute.reduce((s, o) => s + (o.coords?.lng || 0), 0) / currentRoute.length
      const distToCentroid = getCachedDistance(candidate.coords, { lat: avgLat, lng: avgLng })

      // Бонус если кандидат не "улетает" далеко от центра группы
      if (distToCentroid < 3) score += 15

      const prevOrder = currentRoute[currentRoute.length - 2]
      if (prevOrder.coords) {
        const prevToLast = bearingBetween(prevOrder.coords, context.lastOrderCoords)
        const lastToCandidate = candidateDirection
        const zigzagAngle = angularDifference(prevToLast, lastToCandidate)

        if (zigzagAngle > 120) {
          // КРИТИЧЕСКИЙ штраф за зигзаг (разворот на 180 градусов)
          score -= 50
        } else if (zigzagAngle > 90) {
          // Большой штраф за значительный зигзаг
          score -= 30
        }
      }
    }
  }

  // УЛУЧШЕНИЕ 3: Учет эффективности маршрута
  if (currentRoute.length > 0 && context.lastOrderCoords && candidate.coords) {
    // Вычисляем, насколько добавление кандидата улучшает общую эффективность
    const routeStart = currentRoute[0].coords || context.baseCoords
    if (routeStart) {
      const directDistance = getCachedDistance(routeStart, candidate.coords)
      const routeDistance = currentRoute.reduce((sum, o, idx) => {
        if (idx === 0) return sum
        const prev = currentRoute[idx - 1].coords || routeStart
        const curr = o.coords
        if (prev && curr) return sum + getCachedDistance(prev, curr)
        return sum
      }, 0) + getCachedDistance(context.lastOrderCoords, candidate.coords)

      if (routeDistance > 0) {
        const efficiency = directDistance / routeDistance
        // Бонус за высокую эффективность (близко к 1.0)
        if (efficiency > 0.7) {
          score += 20 * efficiency
        } else if (efficiency < 0.3) {
          // Штраф за низкую эффективность (много лишних километров)
          score -= 15
        }
      }
    }
  }

  // УЛУЧШЕНИЕ 4: Учет временных окон доставки (УСИЛЕНО - проверка реальной возможности доставки вовремя)
  if (candidate.deadlineAt) {
    const now = Date.now()
    const candidateDeadline = candidate.deadlineAt
    const candidateReady = candidate.readyAtSource || candidate.readyAt || now

    // Оцениваем время доставки кандидата
    let estimatedDeliveryTime = now
    if (context.lastOrderCoords && candidate.coords) {
      // Время в пути от последнего заказа до кандидата (примерно 2 минуты на км в городе)
      const distanceKm = getCachedDistance(context.lastOrderCoords, candidate.coords) / 1000
      const travelTimeMinutes = distanceKm * 2 // Примерно 2 минуты на км
      estimatedDeliveryTime = now + travelTimeMinutes * 60 * 1000
    }

    // Время готовности кандидата
    const readyTime = Math.max(candidateReady, estimatedDeliveryTime)

    // Проверяем, успеем ли доставить вовремя
    const timeUntilDeadline = candidateDeadline - readyTime
    const minutesUntilDeadline = timeUntilDeadline / (1000 * 60)

    // КРИТИЧЕСКИЙ штраф за заказы, которые невозможно доставить вовремя
    if (minutesUntilDeadline < 0) {
      score -= 100 // Очень большой штраф - заказ уже просрочен
    } else if (minutesUntilDeadline < 15) {
      score -= 50 // Большой штраф - очень мало времени
    } else if (minutesUntilDeadline < 30) {
      score -= 20 // Средний штраф - мало времени
    } else if (minutesUntilDeadline >= 60) {
      // Бонус за достаточный запас времени
      score += 20
    }

    // Проверка совместимости с другими заказами в маршруте
    if (currentRoute.length > 0) {
      const routeDeadlines = currentRoute
        .filter(o => o.deadlineAt)
        .map(o => o.deadlineAt!)
        .sort((a, b) => a - b)

      if (routeDeadlines.length > 0) {
        const avgDeadline = routeDeadlines.reduce((sum, d) => sum + d, 0) / routeDeadlines.length
        const deadlineDiff = Math.abs(candidateDeadline - avgDeadline)
        const hoursDiff = deadlineDiff / (1000 * 60 * 60)

        // Бонус за заказы с похожими дедлайнами (в пределах 1.5 часов)
        if (hoursDiff <= 1.5) {
          score += 20 * (1 - hoursDiff / 1.5)
        } else if (hoursDiff > 3) {
          // Штраф за заказы с сильно отличающимися дедлайнами
          score -= 15
        }

        // Дополнительная проверка: не нарушит ли добавление кандидата сроки других заказов
        const sortedDeadlines = [...routeDeadlines, candidateDeadline].sort((a, b) => a - b)
        const candidateIndex = sortedDeadlines.indexOf(candidateDeadline)

        // Если кандидат имеет более ранний дедлайн, чем некоторые заказы в маршруте,
        // но находится дальше, это может создать проблему
        if (candidateIndex < routeDeadlines.length) {
          // Кандидат должен быть доставлен раньше некоторых заказов в маршруте
          // Проверяем, не создаст ли это проблему с логистикой
          const earlierDeadlines = routeDeadlines.filter(d => d < candidateDeadline)
          if (earlierDeadlines.length > 0) {
            // Есть заказы с более ранними дедлайнами - это нормально
            score += 10
          } else {
            // Кандидат имеет самый ранний дедлайн - проверяем, не слишком ли он далеко
            if (context.lastOrderCoords && candidate.coords) {
              const distanceToCandidate = getCachedDistance(context.lastOrderCoords, candidate.coords)
              const avgDistanceInRoute = currentRoute.length > 1 ?
                currentRoute.slice(1).reduce((sum, o, idx) => {
                  const prev = currentRoute[idx].coords
                  const curr = o.coords
                  if (prev && curr) return sum + getCachedDistance(prev, curr)
                  return sum
                }, 0) / (currentRoute.length - 1) : 5000

              if (distanceToCandidate > avgDistanceInRoute * 1.5) {
                // Кандидат слишком далеко для срочного заказа
                score -= 25
              }
            }
          }
        }
      }
    }
  }

  // УЛУЧШЕНИЕ 5: Учет типа оплаты и других характеристик
  const candidatePayment = candidate.raw?.paymentMethod || candidate.raw?.['Способ оплаты'] || ''
  if (currentRoute.length > 0) {
    const routePayments = currentRoute
      .map(o => o.raw?.paymentMethod || o.raw?.['Способ оплаты'] || '')
      .filter(p => p)

    // Бонус за одинаковый способ оплаты (удобнее для курьера)
    if (candidatePayment && routePayments.includes(candidatePayment)) {
      score += 10
    }
  }

  return {
    ...baseScore,
    score: Math.max(0, score),
    returnDistance,
    routePositionScore,
    routeDisruptionScore
  }
}

// ============================================================================
// УЛУЧШЕНИЕ 3: Улучшенная ребалансировка с учетом реальных расстояний
// ============================================================================

/**
 * Интерфейс для улучшенной ребалансировки
 */
export interface RebalanceContext {
  getRouteDistance?: (orders: Order[]) => Promise<number>
  getRouteDuration?: (orders: Order[]) => Promise<number>
  trafficImpactLevel?: 'low' | 'medium' | 'high'
  lateDeliveryPenalty?: number
  trafficSnapshot?: TrafficSnapshot | null
}

/**
 * Вычисляет метрики маршрута для ребалансировки
 */
export async function calculateRouteMetrics(
  route: RouteForRebalancing,
  context?: RebalanceContext
): Promise<{
  distance: number
  duration: number
  load: number
  efficiency: number
}> {
  const load = route.orders.length

  let distance = route.totalDistance || 0
  let duration = route.totalDuration || 0

  // Если есть функция для вычисления расстояния, используем её
  if (context?.getRouteDistance && route.orders.length > 0) {
    distance = await context.getRouteDistance(route.orders)
  }

  if (context?.getRouteDuration && route.orders.length > 0) {
    duration = await context.getRouteDuration(route.orders)
  }

  // Учет уровня пробок
  if (context?.trafficImpactLevel) {
    const impactFactor = context.trafficImpactLevel === 'high' ? 1.3 : context.trafficImpactLevel === 'medium' ? 1.15 : 1.0
    duration *= impactFactor
  }

  // Расчет штрафов за опоздание (более точный)
  let penaltyScore = 0
  if (context?.lateDeliveryPenalty && context.lateDeliveryPenalty > 0) {
    const now = Date.now()
    const stopCount = route.orders.length
    route.orders.forEach((o, idx) => {
      if (o.deadlineAt) {
        // Оценка времени прибытия для конкретной точки (пропорционально позиции)
        const travelProgress = (idx + 1) / stopCount
        const estimatedArrival = now + (duration * travelProgress * 60 * 1000)

        if (estimatedArrival > o.deadlineAt) {
          const delayMinutes = (estimatedArrival - o.deadlineAt) / (60 * 1000)
          // Штраф растет с увеличением задержки
          penaltyScore += context.lateDeliveryPenalty! * Math.min(1 + delayMinutes / 30, 3)
        }
      }
    })
  }

  // Штраф за пробки на основе trafficSnapshot (если есть)
  let trafficPenalty = 0
  if (context?.trafficSnapshot && route.orders.length > 0) {
    const stats = context.trafficSnapshot.stats
    // Если в городе много критических пробок или средняя скорость низкая
    if (stats.criticalCount > 5 || stats.avgSpeed < 20) {
      trafficPenalty += 100 // Базовый штраф за плохую ситуацию
    }

    // Дополнительный штраф за "медленную долю"
    if (stats.slowSharePercent && stats.slowSharePercent > 40) {
      trafficPenalty += stats.slowSharePercent * 2
    }
  }

  // Эффективность: меньше расстояние на заказ = лучше, но штрафы ее ухудшают
  // Базовая эффективность (км/заказ)
  let baseEfficiency = load > 0 ? distance / load : 0

  // Добавляем все штрафы к "стоимости" (делаем маршрут "дороже")
  const efficiency = baseEfficiency + (penaltyScore / (load || 1)) + (trafficPenalty / (load || 1))

  return { distance, duration, load, efficiency }
}

/**
 * Улучшенная ребалансировка с учетом реальных метрик
 */
export async function rebalanceRoutesV2(
  routes: RouteForRebalancing[],
  maxStopsPerRoute: number = 4,
  context?: RebalanceContext
): Promise<RouteForRebalancing[]> {
  if (routes.length < 2) return routes

  // Вычисляем метрики для всех маршрутов
  const routeMetrics = await Promise.all(
    routes.map(route => calculateRouteMetrics(route, context))
  )

  // Средние значения
  const avgLoad = routeMetrics.reduce((sum, m) => sum + m.load, 0) / routeMetrics.length
  const avgEfficiency = routeMetrics.reduce((sum, m) => sum + m.efficiency, 0) / routeMetrics.length

  // Находим перегруженные и недогруженные маршруты
  const overloaded = routes
    .map((route, idx) => ({ route, idx, metrics: routeMetrics[idx] }))
    .filter(({ metrics }) => metrics.load > avgLoad * 1.3 || metrics.efficiency > avgEfficiency * 1.5)

  const underloaded = routes
    .map((route, idx) => ({ route, idx, metrics: routeMetrics[idx] }))
    .filter(({ metrics }) => metrics.load < avgLoad * 0.7 || metrics.efficiency < avgEfficiency * 0.8)

  // Перераспределяем заказы
  for (const { route: overloadedRoute, metrics: overloadedMetrics } of overloaded) {
    const excess = Math.floor(overloadedMetrics.load - avgLoad)

    for (let i = 0; i < excess && underloaded.length > 0; i++) {
      // Находим заказ, который лучше подходит другому маршруту
      const targetRoutes = underloaded.map(({ route }) => route)
      const move = findBestOrderToMove(overloadedRoute, targetRoutes)

      if (move) {
        moveOrderBetweenRoutes(move.order, overloadedRoute, move.targetRoute)

        // Обновляем метрики
        const targetIdx = routes.indexOf(move.targetRoute)
        if (targetIdx !== -1 && context) {
          const newMetrics = await calculateRouteMetrics(move.targetRoute, context)
          routeMetrics[targetIdx] = newMetrics

          // Обновляем списки если маршрут больше не недогружен
          if (newMetrics.load >= avgLoad * 0.7) {
            const index = underloaded.findIndex(({ route }) => route === move.targetRoute)
            if (index !== -1) {
              underloaded.splice(index, 1)
            }
          }
        }
      } else {
        break
      }
    }
  }

  // Объединяем слишком короткие маршруты (как в оригинале)
  const shortRoutes = routes.filter(r => r.orders.length <= 2)
  const merged: RouteForRebalancing[] = []
  const processed = new Set<RouteForRebalancing>()

  for (let i = 0; i < shortRoutes.length; i++) {
    if (processed.has(shortRoutes[i])) continue

    let mergedRoute = { ...shortRoutes[i], orders: [...shortRoutes[i].orders] }
    processed.add(shortRoutes[i])

    for (let j = i + 1; j < shortRoutes.length; j++) {
      if (processed.has(shortRoutes[j])) continue

      if (canMergeRoutes(mergedRoute, shortRoutes[j], maxStopsPerRoute)) {
        mergedRoute = mergeRoutes(mergedRoute, shortRoutes[j])
        processed.add(shortRoutes[j])
      }
    }

    merged.push(mergedRoute)
  }

  // Добавляем маршруты, которые не были объединены
  for (const route of routes) {
    if (!processed.has(route)) {
      merged.push(route)
    }
  }

  return merged
}

// ============================================================================
// ГЛОБАЛЬНАЯ ОПТИМИЗАЦИЯ: Перемещение заказов между маршрутами и перестановка внутри
// ============================================================================

export interface GlobalOptimizationContext {
  checkChainFeasible: (orders: Order[]) => Promise<{ feasible: boolean; legs?: any[]; totalDuration?: number; totalDistance?: number; }>
  maxStopsPerRoute: number
  maxRouteDurationMin: number
  maxRouteDistanceKm: number
  maxReadyTimeDifferenceMinutes: number
  maxWaitPerStopMin: number
  trafficImpactLevel?: 'low' | 'medium' | 'high'
  lateDeliveryPenalty?: number
}

/**
 * Глобальная оптимизация всех маршрутов
 * Пытается улучшить общую эффективность, перемещая заказы между маршрутами
 */
export async function globalRouteOptimization(
  routes: RouteForRebalancing[],
  context: GlobalOptimizationContext
): Promise<RouteForRebalancing[]> {
  if (routes.length < 2) return routes

  console.log(`🌐 Глобальная оптимизация: ${routes.length} маршрутов`)

  let improved = true
  let iterations = 0
  const maxIterations = 3

  while (improved && iterations < maxIterations) {
    improved = false
    iterations++

    // 1. Попытка переместить заказы между маршрутами
    for (let i = 0; i < routes.length; i++) {
      const sourceRoute = routes[i]
      if (sourceRoute.orders.length === 0) continue

      // Пробуем переместить каждый заказ из этого маршрута
      for (let orderIdx = sourceRoute.orders.length - 1; orderIdx >= 0; orderIdx--) {
        const order = sourceRoute.orders[orderIdx]

        // Ищем лучший целевой маршрут
        let bestTargetRoute: RouteForRebalancing | null = null
        let bestImprovement = 0

        for (let j = 0; j < routes.length; j++) {
          if (i === j) continue // Не перемещаем в тот же маршрут

          const targetRoute = routes[j]

          // Проверяем, можно ли добавить заказ в целевой маршрут
          if (targetRoute.orders.length >= context.maxStopsPerRoute) continue

          // Проверяем временную совместимость
          if (!isReadyTimeCompatible(order, targetRoute.orders, context.maxReadyTimeDifferenceMinutes)) {
            continue
          }

          // Проверяем feasibility нового маршрута
          const testRoute = [...targetRoute.orders, order]
          const check = await context.checkChainFeasible(testRoute)

          if (!check.feasible) continue

          // Вычисляем улучшение с учетом новых параметров
          const metricContext: RebalanceContext = {
            getRouteDistance: async (orders) => (await context.checkChainFeasible(orders)).totalDistance! / 1000,
            getRouteDuration: async (orders) => (await context.checkChainFeasible(orders)).totalDuration!,
            trafficImpactLevel: context.trafficImpactLevel,
            lateDeliveryPenalty: context.lateDeliveryPenalty
          }

          const sourceMetrics = await calculateRouteMetrics(sourceRoute, metricContext)
          const targetMetrics = await calculateRouteMetrics(targetRoute, metricContext)
          // Оценка целевого состояния (после перемещения)
          const newTargetMetrics = await calculateRouteMetrics({ ...targetRoute, orders: testRoute }, metricContext)

          // Исходная эффективность (сумма эффективности двух маршрутов)
          // Используем взвешенную сумму, где важнее уменьшить неэффективность худшего
          const currentTotalEfficiency = sourceMetrics.efficiency + targetMetrics.efficiency

          // Новая эффективность (источник без заказа + цель с заказом)
          // Приблизительно оцениваем источник: эффективность вырастет, так как расстояние уменьшится больше чем на 1/N
          const newSourceMetricsEstimate = {
            ...sourceMetrics,
            efficiency: sourceMetrics.efficiency * 0.9 // Эвристика: источник станет эффективнее
          }

          const newTotalEfficiency = newSourceMetricsEstimate.efficiency + newTargetMetrics.efficiency

          const improvement = currentTotalEfficiency - newTotalEfficiency

          if (improvement > bestImprovement && improvement > 0.05) { // Минимальный порог улучшения
            bestImprovement = improvement
            bestTargetRoute = targetRoute
          }
        }

        // Если нашли улучшение - применяем его
        if (bestTargetRoute && bestImprovement > 0) {
          moveOrderBetweenRoutes(order, sourceRoute, bestTargetRoute)
          improved = true
          break // Переходим к следующему маршруту-источнику
        }
      }
    }

    // 2. Попытка переставить заказы внутри маршрутов (2-opt)
    for (const route of routes) {
      if (route.orders.length < 3) continue

      let routeImproved = true
      let routeIterations = 0
      const maxRouteIterations = 2

      while (routeImproved && routeIterations < maxRouteIterations) {
        routeImproved = false
        routeIterations++

        for (let i = 0; i < route.orders.length - 1; i++) {
          for (let j = i + 2; j < route.orders.length; j++) {
            const testRoute = [...route.orders]
            const [removed] = testRoute.splice(i, 1)
            testRoute.splice(j, 0, removed)

            // Проверяем временную совместимость
            if (!isReadyTimeCompatible(testRoute[i], testRoute, context.maxReadyTimeDifferenceMinutes)) {
              continue
            }

            const check = await context.checkChainFeasible(testRoute)
            if (!check.feasible) continue

            const oldCheck = await context.checkChainFeasible(route.orders)
            const oldDistance = (oldCheck.totalDistance || 0) / 1000
            const newDistance = (check.totalDistance || 0) / 1000

            if (newDistance < oldDistance * 0.95) { // Улучшение минимум на 5%
              route.orders = testRoute
              routeImproved = true
              improved = true
              console.log(`✅ Глобальная оптимизация: переставлены заказы внутри маршрута (${oldDistance.toFixed(1)} → ${newDistance.toFixed(1)} км)`)
              break
            }
          }
          if (routeImproved) break
        }
      }
    }
  }

  console.log(`✅ Глобальная оптимизация завершена (итераций: ${iterations})`)
  return routes
}


// ============================================================================
// УЛУЧШЕННАЯ РЕБАЛАНСИРОВКА С УЧЕТОМ ВРЕМЕНИ
// ============================================================================

/**
 * Улучшенная ребалансировка с учетом временных окон готовности и дедлайнов
 */
export async function rebalanceRoutesV3(
  routes: RouteForRebalancing[],
  maxStopsPerRoute: number = 4,
  context?: RebalanceContext & {
    checkChainFeasible?: (orders: Order[]) => Promise<{ feasible: boolean; legs?: any[]; totalDuration?: number; totalDistance?: number; }>
    maxReadyTimeDifferenceMinutes?: number
    maxWaitPerStopMin?: number
  }
): Promise<RouteForRebalancing[]> {
  if (routes.length < 2) return routes

  console.log(`⚖️ Улучшенная ребалансировка с учетом времени: ${routes.length} маршрутов`)

  const maxReadyTimeDiff = context?.maxReadyTimeDifferenceMinutes || 60
  const maxWait = context?.maxWaitPerStopMin || 15

  // Вычисляем метрики для всех маршрутов
  const routeMetrics = await Promise.all(
    routes.map(route => calculateRouteMetrics(route, context))
  )

  // Средние значения
  const avgLoad = routeMetrics.reduce((sum, m) => sum + m.load, 0) / routeMetrics.length
  const avgEfficiency = routeMetrics.reduce((sum, m) => sum + m.efficiency, 0) / routeMetrics.length

  // Находим перегруженные и недогруженные маршруты
  const overloaded = routes
    .map((route, idx) => ({ route, idx, metrics: routeMetrics[idx] }))
    .filter(({ metrics }) => metrics.load > avgLoad * 1.3 || metrics.efficiency > avgEfficiency * 1.5)

  const underloaded = routes
    .map((route, idx) => ({ route, idx, metrics: routeMetrics[idx] }))
    .filter(({ metrics }) => metrics.load < avgLoad * 0.7 || metrics.efficiency < avgEfficiency * 0.8)

  // Перераспределяем заказы с учетом времени
  for (const { route: overloadedRoute, metrics: overloadedMetrics } of overloaded) {
    const excess = Math.floor(overloadedMetrics.load - avgLoad)

    for (let i = 0; i < excess && underloaded.length > 0; i++) {
      // Находим заказ, который лучше подходит другому маршруту
      // Приоритет: временная совместимость > зона > расстояние
      let bestMove: { order: Order; targetRoute: RouteForRebalancing; score: number } | null = null

      for (const order of overloadedRoute.orders) {
        for (const { route: targetRoute } of underloaded) {
          if (targetRoute.orders.length >= maxStopsPerRoute) continue

          // 1. Проверяем временную совместимость
          if (!isReadyTimeCompatible(order, targetRoute.orders, maxReadyTimeDiff)) {
            continue
          }

          // 2. Проверяем feasibility через Google API (если доступно)
          if (context?.checkChainFeasible) {
            const testRoute = [...targetRoute.orders, order]
            const check = await context.checkChainFeasible(testRoute)
            if (!check.feasible) continue

            // 3. Проверяем дедлайны и время ожидания
            const readyTimes = testRoute.map(o => o.readyAtSource || o.readyAt || Date.now())
            const deadlines = testRoute.map(o => o.deadlineAt).filter(d => d !== null && d !== undefined) as number[]

            // Проверяем, что все заказы могут быть доставлены в срок
            let allDeadlinesOk = true
            if (deadlines.length > 0 && check.legs) {
              let currentTime = Math.min(...readyTimes)
              for (let j = 0; j < testRoute.length && j < check.legs.length - 1; j++) {
                const leg = check.legs[j]
                const travelTime = (leg.duration_in_traffic?.value || leg.duration?.value || 0) * 1000
                currentTime += travelTime

                const order = testRoute[j]
                const readyAt = order.readyAtSource || order.readyAt
                if (readyAt && currentTime < readyAt) {
                  const wait = readyAt - currentTime
                  if (wait / 60000 > maxWait) {
                    allDeadlinesOk = false
                    break
                  }
                  currentTime = readyAt
                }

                currentTime += 5 * 60 * 1000 // Время на отдачу

                if (order.deadlineAt) {
                  const deadlineWithForceMajeure = order.deadlineAt + 9 * 60 * 1000
                  if (currentTime > deadlineWithForceMajeure) {
                    allDeadlinesOk = false
                    break
                  }
                }
              }
            }

            if (!allDeadlinesOk) continue
          }

          // 4. Вычисляем оценку совместимости
          const timeCompatibility = calculateTimeCompatibility(order, targetRoute.orders)
          const zoneMatch = targetRoute.orders.some(o =>
            (o.deliveryZone || extractZoneFromAddress(o.address)) ===
            (order.deliveryZone || extractZoneFromAddress(order.address))
          )

          const score = timeCompatibility * 0.6 + (zoneMatch ? 0.3 : 0) + 0.1

          if (!bestMove || score > bestMove.score) {
            bestMove = { order, targetRoute, score }
          }
        }
      }

      if (bestMove) {
        moveOrderBetweenRoutes(bestMove.order, overloadedRoute, bestMove.targetRoute)

        // Обновляем метрики
        const targetIdx = routes.indexOf(bestMove.targetRoute)
        if (targetIdx !== -1 && context) {
          const newMetrics = await calculateRouteMetrics(bestMove.targetRoute, context)
          routeMetrics[targetIdx] = newMetrics

          // Обновляем списки если маршрут больше не недогружен
          if (newMetrics.load >= avgLoad * 0.7) {
            const index = underloaded.findIndex(({ route }) => route === bestMove.targetRoute)
            if (index !== -1) {
              underloaded.splice(index, 1)
            }
          }
        }

        console.log(`✅ Ребалансировка: перемещен заказ (оценка совместимости: ${bestMove.score.toFixed(2)})`)
      } else {
        break
      }
    }
  }

  // Объединяем слишком короткие маршруты с учетом времени
  const shortRoutes = routes.filter(r => r.orders.length <= 2)
  const merged: RouteForRebalancing[] = []
  const processed = new Set<RouteForRebalancing>()

  for (let i = 0; i < shortRoutes.length; i++) {
    if (processed.has(shortRoutes[i])) continue

    let mergedRoute = { ...shortRoutes[i], orders: [...shortRoutes[i].orders] }
    processed.add(shortRoutes[i])

    for (let j = i + 1; j < shortRoutes.length; j++) {
      if (processed.has(shortRoutes[j])) continue

      // Улучшенная проверка совместимости с учетом времени
      if (canMergeRoutesWithTime(mergedRoute, shortRoutes[j], maxStopsPerRoute, maxReadyTimeDiff)) {
        mergedRoute = mergeRoutes(mergedRoute, shortRoutes[j])
        processed.add(shortRoutes[j])
      }
    }

    merged.push(mergedRoute)
  }

  // Добавляем маршруты, которые не были объединены
  for (const route of routes) {
    if (!processed.has(route)) {
      merged.push(route)
    }
  }

  console.log(`✅ Улучшенная ребалансировка завершена: ${routes.length} → ${merged.length} маршрутов`)
  return merged
}

/**
 * Проверяет, можно ли объединить два маршрута с учетом времени
 */
function canMergeRoutesWithTime(
  route1: RouteForRebalancing,
  route2: RouteForRebalancing,
  maxStopsPerRoute: number = 4,
  maxReadyTimeDifferenceMinutes: number = 60
): boolean {
  const totalOrders = route1.orders.length + route2.orders.length
  if (totalOrders > maxStopsPerRoute) return false

  // Проверяем временную совместимость всех заказов
  return isReadyTimeCompatible(route1.orders[0], route2.orders, maxReadyTimeDifferenceMinutes) &&
    isReadyTimeCompatible(route2.orders[0], route1.orders, maxReadyTimeDifferenceMinutes)
}

// ============================================================================
// УЛУЧШЕНИЕ 4: Адаптивная приоритизация с учетом времени суток и кластеров
// ============================================================================

/**
 * Вычисляет адаптивные веса для приоритизации в зависимости от времени суток
 */
export function getAdaptivePriorityWeights(currentTime: number): {
  deadlineWeight: number
  readyWeight: number
  loadWeight: number
  isolationWeight: number
} {
  const hour = new Date(currentTime).getHours()

  // Утро (6-10): приоритет готовности
  if (hour >= 6 && hour < 10) {
    return {
      deadlineWeight: 0.8,
      readyWeight: 1.2,
      loadWeight: 1.0,
      isolationWeight: 0.8
    }
  }

  // Обед (10-14): приоритет дедлайнов
  if (hour >= 10 && hour < 14) {
    return {
      deadlineWeight: 1.3,
      readyWeight: 1.0,
      loadWeight: 1.1,
      isolationWeight: 0.9
    }
  }

  // Вечер (14-18): баланс
  if (hour >= 14 && hour < 18) {
    return {
      deadlineWeight: 1.1,
      readyWeight: 1.1,
      loadWeight: 1.0,
      isolationWeight: 1.0
    }
  }

  // Ночь (18-6): приоритет изоляции (меньше курьеров)
  return {
    deadlineWeight: 1.0,
    readyWeight: 0.9,
    loadWeight: 1.2,
    isolationWeight: 1.3
  }
}

/**
 * Вычисляет приоритет заказа с учетом кластеров
 */
export function calculateClusterPriority(
  order: Order,
  allOrders: Order[],
  radiusKm: number = 2
): number {
  if (!order.coords) return 0.5

  let clusterSize = 0
  let clusterUrgency = 0

  for (const other of allOrders) {
    if (other === order || !other.coords) continue

    const distance = getCachedDistance(order.coords, other.coords)
    if (distance <= radiusKm) {
      clusterSize++

      // Учитываем срочность других заказов в кластере
      if (other.deadlineAt) {
        const hoursLeft = (other.deadlineAt - Date.now()) / (1000 * 60 * 60)
        if (hoursLeft < 2) clusterUrgency += 1
        else if (hoursLeft < 4) clusterUrgency += 0.5
      }
    }
  }

  // Больше заказов в кластере = выше приоритет
  // Больше срочных заказов = выше приоритет
  const sizeScore = Math.min(clusterSize / 5, 1.0) // Нормализуем до 0-1
  const urgencyScore = Math.min(clusterUrgency / 3, 1.0)

  return (sizeScore * 0.6 + urgencyScore * 0.4)
}

/**
 * Улучшенная приоритизация с адаптивными весами и учетом кластеров
 */
export function calculateOrderPriorityV2(
  order: Order,
  context: {
    currentTime: number
    availableCouriers: number
    avgRouteLoad: number
    allOrders?: Order[]
  }
): number {
  // Получаем адаптивные веса
  const weights = getAdaptivePriorityWeights(context.currentTime)

  let priority = 0

  // 1. Срочность дедлайна (Экспоненциальный штраф - НОВОЕ)
  if (order.deadlineAt) {
    const hoursUntilDeadline = (order.deadlineAt - context.currentTime) / (1000 * 60 * 60)

    // Экспоненциальная функция: приоритет растет взрывообразно при < 1 часа
    // max(0, 100 * (2 ^ (1 - hoursUntilDeadline)))
    let deadlineScore = Math.min(250, 100 * Math.pow(2, 1 - hoursUntilDeadline))

    // Если дедлайн уже прошел, даем максимальный приоритет
    if (hoursUntilDeadline <= 0) deadlineScore = 250

    priority += deadlineScore * weights.deadlineWeight
  }

  // 2. Готовность заказа (0-50) с адаптивным весом
  const readyAt = order.readyAtSource || order.readyAt
  if (readyAt) {
    const minutesUntilReady = (readyAt - context.currentTime) / (1000 * 60)
    let readyScore = 0
    if (minutesUntilReady <= 0) readyScore = 50
    else if (minutesUntilReady <= 15) readyScore = 40
    else if (minutesUntilReady <= 30) readyScore = 30
    else readyScore = 20

    priority += readyScore * weights.readyWeight
  } else {
    priority += 50 * weights.readyWeight // Готов сразу
  }

  // 3. Нагрузка на систему (0-30) с адаптивным весом
  let loadScore = 0
  if (context.availableCouriers < 2) loadScore = 30
  else if (context.availableCouriers < 4) loadScore = 20
  else loadScore = 10

  priority += loadScore * weights.loadWeight

  // 4. Изоляция заказа (0-20) с адаптивным весом
  let isolationScore = 0
  if (context.allOrders) {
    const isolation = calculateIsolation(order, context.allOrders)
    isolationScore = isolation * 20
  }
  priority += isolationScore * weights.isolationWeight

  // 5. Приоритет кластера (0-30) - НОВОЕ
  if (context.allOrders) {
    const clusterPriority = calculateClusterPriority(order, context.allOrders)
    priority += clusterPriority * 30
  }

  return priority
}

