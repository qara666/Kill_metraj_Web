/**
 * Многоалгоритмная оптимизация маршрутов
 * Реализует: Nearest Neighbor, Genetic Algorithm, Simulated Annealing, 2-opt/3-opt, Ant Colony Optimization
 */

import type { Order } from './routeOptimization'

export interface Location {
  lat: number
  lng: number
}

export interface RouteSegment {
  from: Location
  to: Location
  distance: number
  duration: number
}

export interface OptimizedRoute {
  orders: Order[]
  totalDistance: number
  totalDuration: number
  score: number
  algorithm: string
  iterations?: number
}

export interface OptimizationOptions {
  maxIterations?: number
  populationSize?: number
  mutationRate?: number
  crossoverRate?: number
  coolingRate?: number
  initialTemperature?: number
  alpha?: number // Важность феромона для ACO
  beta?: number // Важность расстояния для ACO
  evaporationRate?: number // Испарение феромона для ACO
  ants?: number // Количество муравьев для ACO
}

export type OptimizationAlgorithm = 
  | 'nearestNeighbor'
  | 'genetic'
  | 'simulatedAnnealing'
  | 'twoOpt'
  | 'threeOpt'
  | 'antColony'

/**
 * Вычисляет расстояние между двумя точками (Haversine)
 */
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

/**
 * Вычисляет общее расстояние маршрута
 */
function calculateRouteDistance(orders: Order[]): number {
  if (orders.length < 2) return 0

  let totalDistance = 0
  for (let i = 0; i < orders.length - 1; i++) {
    const from = orders[i]
    const to = orders[i + 1]
    
    if (from.coords && to.coords) {
      totalDistance += haversineDistance(
        from.coords.lat,
        from.coords.lng,
        to.coords.lat,
        to.coords.lng
      )
    }
  }

  return totalDistance
}

/**
 * Вычисляет стоимость маршрута (расстояние + штрафы за дедлайны)
 */
function calculateRouteScore(orders: Order[]): number {
  const distance = calculateRouteDistance(orders)
  
  // Штраф за опоздания к дедлайнам
  let deadlinePenalty = 0
  const now = Date.now()
  
  for (let i = 0; i < orders.length; i++) {
    const order = orders[i]
    if (order.deadlineAt) {
      // Примерная оценка времени прибытия
      const estimatedArrival = now + (distance * 2 * 60 * 1000) // 2 минуты на км
      
      if (estimatedArrival > order.deadlineAt) {
        const delay = (estimatedArrival - order.deadlineAt) / (60 * 1000) // в минутах
        deadlinePenalty += delay * 10 // штраф 10 за каждую минуту опоздания
      }
    }
  }

  return distance * 1000 + deadlinePenalty // расстояние в метрах + штрафы
}

/**
 * 1. Nearest Neighbor Algorithm - быстрый базовый алгоритм
 */
export function nearestNeighborOptimization(
  orders: Order[],
  _options: OptimizationOptions = {},
  startLocation?: Location
): OptimizedRoute {
  if (orders.length === 0) {
    return { orders: [], totalDistance: 0, totalDuration: 0, score: 0, algorithm: 'nearestNeighbor' }
  }

  if (orders.length === 1) {
    return {
      orders: [...orders],
      totalDistance: 0,
      totalDuration: 0,
      score: calculateRouteScore(orders),
      algorithm: 'nearestNeighbor'
    }
  }

  const optimized: Order[] = []
  const remaining = [...orders]
  let currentLocation: Location

  // Если нет стартовой точки, используем первый заказ как начальную точку
  if (startLocation) {
    currentLocation = startLocation
  } else if (orders[0]?.coords) {
    currentLocation = orders[0].coords
    optimized.push(orders[0])
    remaining.splice(0, 1)
  } else {
    // Если нет стартовой точки и координат, возвращаем исходный порядок
    return {
      orders: [...orders],
      totalDistance: calculateRouteDistance(orders),
      totalDuration: calculateRouteDistance(orders) * 2, // примерная оценка: 2 мин/км
      score: calculateRouteScore(orders),
      algorithm: 'nearestNeighbor'
    }
  }

  // Находим ближайший заказ на каждой итерации
  while (remaining.length > 0) {
    let nearestIndex = 0
    let nearestDistance = Infinity

    for (let i = 0; i < remaining.length; i++) {
      const order = remaining[i]
      if (!order.coords) continue

        const distance = haversineDistance(
        currentLocation.lat,
        currentLocation.lng,
        order.coords.lat,
        order.coords.lng
      )

      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = i
      }
    }

    const nearest = remaining[nearestIndex]
    optimized.push(nearest)
    if (nearest.coords) {
      currentLocation = nearest.coords
    }
    remaining.splice(nearestIndex, 1)
  }

  const totalDistance = calculateRouteDistance(optimized)
  const totalDuration = totalDistance * 2 // примерная оценка: 2 минуты на км

  return {
    orders: optimized,
    totalDistance,
    totalDuration,
    score: calculateRouteScore(optimized),
    algorithm: 'nearestNeighbor',
    iterations: orders.length
  }
}

/**
 * 2. Genetic Algorithm - для сложных маршрутов
 */
export function geneticAlgorithmOptimization(
  orders: Order[],
  options: OptimizationOptions = {}
): OptimizedRoute {
  const {
    maxIterations = 100,
    populationSize = 50,
    mutationRate = 0.1,
    crossoverRate = 0.8
  } = options

  if (orders.length < 2) {
    return {
      orders: [...orders],
      totalDistance: calculateRouteDistance(orders),
      totalDuration: calculateRouteDistance(orders) * 2,
      score: calculateRouteScore(orders),
      algorithm: 'genetic'
    }
  }

  // Генерация начальной популяции
  function generatePopulation(size: number): Order[][] {
    const population: Order[][] = []
    
    // Первая особь - ближайший сосед
    population.push(nearestNeighborOptimization(orders).orders)

    // Остальные - случайные перестановки
    for (let i = 1; i < size; i++) {
      const shuffled = [...orders].sort(() => Math.random() - 0.5)
      population.push(shuffled)
    }

    return population
  }

  // Функция приспособленности (меньше = лучше)
  function fitness(individual: Order[]): number {
    return calculateRouteScore(individual)
  }

  // Кроссовер (упорядоченный кроссовер для TSP)
  function crossover(parent1: Order[], parent2: Order[]): Order[] {
    if (Math.random() > crossoverRate) {
      return Math.random() > 0.5 ? [...parent1] : [...parent2]
    }

    const start = Math.floor(Math.random() * parent1.length)
    const end = start + Math.floor(Math.random() * (parent1.length - start))

    const child: Order[] = []
    const used = new Set<number | string>()

    // Копируем сегмент из parent1
    for (let i = start; i < end; i++) {
      child.push(parent1[i])
      used.add(parent1[i].orderNumber)
    }

    // Добавляем остальные из parent2 в порядке их следования
    for (const order of parent2) {
      if (!used.has(order.orderNumber)) {
        child.push(order)
      }
    }

    return child
  }

  // Мутация (swap двух случайных заказов)
  function mutate(individual: Order[]): Order[] {
    if (Math.random() > mutationRate) return individual

    const mutated = [...individual]
    const i = Math.floor(Math.random() * mutated.length)
    const j = Math.floor(Math.random() * mutated.length)

    if (i !== j) {
      ;[mutated[i], mutated[j]] = [mutated[j], mutated[i]]
    }

    return mutated
  }

  // Селекция (турнирная)
  function tournamentSelection(population: Order[][], fitnessScores: number[]): Order[] {
    const tournamentSize = 5
    let best = Math.floor(Math.random() * population.length)
    
    for (let i = 1; i < tournamentSize; i++) {
      const candidate = Math.floor(Math.random() * population.length)
      if (fitnessScores[candidate] < fitnessScores[best]) {
        best = candidate
      }
    }

    return population[best]
  }

  // Основной цикл генетического алгоритма
  let population = generatePopulation(populationSize)
  let bestIndividual = population[0]
  let bestFitness = fitness(bestIndividual)

  for (let generation = 0; generation < maxIterations; generation++) {
    // Вычисляем приспособленность
    const fitnessScores = population.map(fitness)

    // Находим лучшего
    const currentBest = population[fitnessScores.indexOf(Math.min(...fitnessScores))]
    const currentBestFitness = Math.min(...fitnessScores)

    if (currentBestFitness < bestFitness) {
      bestFitness = currentBestFitness
      bestIndividual = currentBest
    }

    // Создаем новое поколение
    const newPopulation: Order[][] = []

    // Элитизм - сохраняем 10% лучших
    const eliteCount = Math.floor(populationSize * 0.1)
    const sortedPopulation = population
      .map((ind, idx) => ({ ind, score: fitnessScores[idx] }))
      .sort((a, b) => a.score - b.score)
      .map(item => item.ind)

    newPopulation.push(...sortedPopulation.slice(0, eliteCount))

    // Генерируем потомков
    while (newPopulation.length < populationSize) {
      const parent1 = tournamentSelection(population, fitnessScores)
      const parent2 = tournamentSelection(population, fitnessScores)
      const child = mutate(crossover(parent1, parent2))
      newPopulation.push(child)
    }

    population = newPopulation
  }

  const totalDistance = calculateRouteDistance(bestIndividual)
  const totalDuration = totalDistance * 2

  return {
    orders: bestIndividual,
    totalDistance,
    totalDuration,
    score: bestFitness,
    algorithm: 'genetic',
    iterations: maxIterations
  }
}

/**
 * 3. Simulated Annealing - баланс скорости и качества
 */
export function simulatedAnnealingOptimization(
  orders: Order[],
  options: OptimizationOptions = {}
): OptimizedRoute {
  const {
    maxIterations = 500,
    coolingRate = 0.99,
    initialTemperature = 1000
  } = options

  if (orders.length < 2) {
    return {
      orders: [...orders],
      totalDistance: calculateRouteDistance(orders),
      totalDuration: calculateRouteDistance(orders) * 2,
      score: calculateRouteScore(orders),
      algorithm: 'simulatedAnnealing'
    }
  }

  // Начальное решение (ближайший сосед)
  let currentSolution = nearestNeighborOptimization(orders).orders
  let currentScore = calculateRouteScore(currentSolution)
  
  let bestSolution = [...currentSolution]
  let bestScore = currentScore

  let temperature = initialTemperature

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Генерируем соседнее решение (swap двух случайных заказов)
    const newSolution = [...currentSolution]
    const i = Math.floor(Math.random() * newSolution.length)
    const j = Math.floor(Math.random() * newSolution.length)

    if (i !== j) {
      ;[newSolution[i], newSolution[j]] = [newSolution[j], newSolution[i]]
    }

    const newScore = calculateRouteScore(newSolution)

    // Принимаем новое решение если оно лучше, или с вероятностью по формуле SA
    const delta = newScore - currentScore
    const acceptProbability = delta < 0 ? 1 : Math.exp(-delta / temperature)

    if (Math.random() < acceptProbability) {
      currentSolution = newSolution
      currentScore = newScore

      if (newScore < bestScore) {
        bestSolution = newSolution
        bestScore = newScore
      }
    }

    // Охлаждаем температуру
    temperature *= coolingRate
  }

  const totalDistance = calculateRouteDistance(bestSolution)
  const totalDuration = totalDistance * 2

  return {
    orders: bestSolution,
    totalDistance,
    totalDuration,
    score: bestScore,
    algorithm: 'simulatedAnnealing',
    iterations: maxIterations
  }
}

/**
 * 4. 2-opt улучшение - локальная оптимизация
 */
export function twoOptOptimization(
  orders: Order[],
  options: OptimizationOptions = {}
): OptimizedRoute {
  const { maxIterations = 1000 } = options

  if (orders.length < 4) {
    return {
      orders: [...orders],
      totalDistance: calculateRouteDistance(orders),
      totalDuration: calculateRouteDistance(orders) * 2,
      score: calculateRouteScore(orders),
      algorithm: 'twoOpt'
    }
  }

  let improved = true
  let solution = [...orders]
  let iterations = 0

  while (improved && iterations < maxIterations) {
    improved = false
    iterations++

    for (let i = 1; i < solution.length - 2; i++) {
      for (let j = i + 1; j < solution.length; j++) {
        if (j - i === 1) continue // Пропускаем смежные ребра

        // Создаем новый маршрут, меняя порядок сегмента
        const newSolution = [
          ...solution.slice(0, i),
          ...solution.slice(i, j + 1).reverse(),
          ...solution.slice(j + 1)
        ]

        const currentDistance = calculateRouteDistance(solution)
        const newDistance = calculateRouteDistance(newSolution)

        if (newDistance < currentDistance) {
          solution = newSolution
          improved = true
          break
        }
      }
      if (improved) break
    }
  }

  const totalDistance = calculateRouteDistance(solution)
  const totalDuration = totalDistance * 2

  return {
    orders: solution,
    totalDistance,
    totalDuration,
    score: calculateRouteScore(solution),
    algorithm: 'twoOpt',
    iterations
  }
}

/**
 * 5. 3-opt улучшение - более мощная локальная оптимизация
 */
export function threeOptOptimization(
  orders: Order[],
  options: OptimizationOptions = {}
): OptimizedRoute {
  const { maxIterations = 500 } = options

  if (orders.length < 6) {
    // Для маленьких маршрутов используем 2-opt
    return twoOptOptimization(orders, options)
  }

  let improved = true
  let solution = [...orders]
  let iterations = 0

  while (improved && iterations < maxIterations) {
    improved = false
    iterations++

    for (let i = 1; i < solution.length - 4; i++) {
      for (let j = i + 2; j < solution.length - 2; j++) {
        for (let k = j + 2; k < solution.length; k++) {
          // Тестируем все возможные перестройки сегментов
          const segments = [
            solution.slice(0, i),
            solution.slice(i, j),
            solution.slice(j, k),
            solution.slice(k)
          ]

          const currentDistance = calculateRouteDistance(solution)

          // Вариант 1: Обратить средний сегмент
          const variant1 = [...segments[0], ...segments[2].reverse(), ...segments[1], ...segments[3]]
          const dist1 = calculateRouteDistance(variant1)

          // Вариант 2: Обратить первый и средний
          const variant2 = [...segments[0], ...segments[1].reverse(), ...segments[2].reverse(), ...segments[3]]
          const dist2 = calculateRouteDistance(variant2)

          // Вариант 3: Обратить все сегменты
          const variant3 = [...segments[0], ...segments[2], ...segments[1].reverse(), ...segments[3]]
          const dist3 = calculateRouteDistance(variant3)

          // Вариант 4: Переставить сегменты
          const variant4 = [...segments[0], ...segments[2], ...segments[1], ...segments[3]]
          const dist4 = calculateRouteDistance(variant4)

          const bestVariant = Math.min(dist1, dist2, dist3, dist4)

          if (bestVariant < currentDistance) {
            if (dist1 === bestVariant) solution = variant1
            else if (dist2 === bestVariant) solution = variant2
            else if (dist3 === bestVariant) solution = variant3
            else solution = variant4

            improved = true
            break
          }
        }
        if (improved) break
      }
      if (improved) break
    }
  }

  const totalDistance = calculateRouteDistance(solution)
  const totalDuration = totalDistance * 2

  return {
    orders: solution,
    totalDistance,
    totalDuration,
    score: calculateRouteScore(solution),
    algorithm: 'threeOpt',
    iterations
  }
}

/**
 * 6. Ant Colony Optimization - для больших объемов
 */
export function antColonyOptimization(
  orders: Order[],
  options: OptimizationOptions = {}
): OptimizedRoute {
  const {
    maxIterations = 50,
    ants = 20,
    alpha = 1.0,
    beta = 2.0,
    evaporationRate = 0.1
  } = options

  if (orders.length < 2) {
    return {
      orders: [...orders],
      totalDistance: calculateRouteDistance(orders),
      totalDuration: calculateRouteDistance(orders) * 2,
      score: calculateRouteScore(orders),
      algorithm: 'antColony'
    }
  }

  // Инициализация матрицы феромонов
  const pheromoneMatrix: number[][] = []
  const distanceMatrix: number[][] = []

  for (let i = 0; i < orders.length; i++) {
    pheromoneMatrix[i] = []
    distanceMatrix[i] = []

    for (let j = 0; j < orders.length; j++) {
      if (i === j) {
        pheromoneMatrix[i][j] = 0
        distanceMatrix[i][j] = 0
      } else {
        pheromoneMatrix[i][j] = 1.0 // Начальный уровень феромона

        if (orders[i].coords && orders[j].coords) {
          distanceMatrix[i][j] = haversineDistance(
            orders[i].coords!.lat,
            orders[i].coords!.lng,
            orders[j].coords!.lat,
            orders[j].coords!.lng
          )
        } else {
          distanceMatrix[i][j] = Infinity
        }
      }
    }
  }

  let bestSolution = [...orders]
  let bestDistance = calculateRouteDistance(bestSolution)

  // Основной цикл ACO
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const solutions: Order[][] = []

    // Каждый муравей строит решение
    for (let ant = 0; ant < ants; ant++) {
      const solution: Order[] = []
      const visited = new Set<number>()
      let currentIndex = Math.floor(Math.random() * orders.length)

      solution.push(orders[currentIndex])
      visited.add(currentIndex)

      // Построение решения
      while (visited.size < orders.length) {
        const probabilities: number[] = []
        let totalProbability = 0

        for (let j = 0; j < orders.length; j++) {
          if (visited.has(j)) {
            probabilities[j] = 0
          } else {
            const pheromone = Math.pow(pheromoneMatrix[currentIndex][j], alpha)
            const distance = distanceMatrix[currentIndex][j]
            const attractiveness = distance > 0 ? Math.pow(1 / distance, beta) : 0
            const probability = pheromone * attractiveness
            probabilities[j] = probability
            totalProbability += probability
          }
        }

        // Выбор следующего узла
        if (totalProbability > 0) {
          let random = Math.random() * totalProbability
          let nextIndex = 0

          for (let j = 0; j < orders.length; j++) {
            random -= probabilities[j]
            if (random <= 0) {
              nextIndex = j
              break
            }
          }

          solution.push(orders[nextIndex])
          visited.add(nextIndex)
          currentIndex = nextIndex
        } else {
          // Если нет вероятностей, выбираем случайно
          const remaining = orders.filter((_, idx) => !visited.has(idx))
          if (remaining.length > 0) {
            const nextOrder = remaining[Math.floor(Math.random() * remaining.length)]
            const nextIndex = orders.indexOf(nextOrder)
            solution.push(nextOrder)
            visited.add(nextIndex)
            currentIndex = nextIndex
          }
        }
      }

      solutions.push(solution)

      // Обновляем лучшее решение
      const distance = calculateRouteDistance(solution)
      if (distance < bestDistance) {
        bestDistance = distance
        bestSolution = solution
      }
    }

    // Испарение феромона
    for (let i = 0; i < orders.length; i++) {
      for (let j = 0; j < orders.length; j++) {
        pheromoneMatrix[i][j] *= (1 - evaporationRate)
      }
    }

    // Обновление феромона (только для лучшего решения итерации)
    const bestIterationSolution = solutions.reduce((best, current) => 
      calculateRouteDistance(current) < calculateRouteDistance(best) ? current : best
    )

    const pheromoneDeposit = 1000 / calculateRouteDistance(bestIterationSolution)

    for (let i = 0; i < bestIterationSolution.length - 1; i++) {
      const fromIndex = orders.indexOf(bestIterationSolution[i])
      const toIndex = orders.indexOf(bestIterationSolution[i + 1])
      if (fromIndex !== -1 && toIndex !== -1) {
        pheromoneMatrix[fromIndex][toIndex] += pheromoneDeposit
      }
    }
  }

  const totalDistance = calculateRouteDistance(bestSolution)
  const totalDuration = totalDistance * 2

  return {
    orders: bestSolution,
    totalDistance,
    totalDuration,
    score: calculateRouteScore(bestSolution),
    algorithm: 'antColony',
    iterations: maxIterations
  }
}

/**
 * Многоалгоритмная оптимизация - пробует все алгоритмы и выбирает лучший
 */
export async function multiAlgorithmOptimization(
  orders: Order[],
  options: OptimizationOptions = {},
  algorithms: OptimizationAlgorithm[] = ['nearestNeighbor', 'genetic', 'simulatedAnnealing', 'twoOpt', 'antColony']
): Promise<OptimizedRoute> {
  if (orders.length === 0) {
    return {
      orders: [],
      totalDistance: 0,
      totalDuration: 0,
      score: 0,
      algorithm: 'multi'
    }
  }

  if (orders.length === 1) {
    return {
      orders: [...orders],
      totalDistance: 0,
      totalDuration: 0,
      score: calculateRouteScore(orders),
      algorithm: 'multi'
    }
  }

  const results: OptimizedRoute[] = []

  // Запускаем алгоритмы параллельно
  const promises: Promise<OptimizedRoute>[] = []

  for (const algorithm of algorithms) {
    promises.push(
      new Promise((resolve) => {
        setTimeout(() => {
          let result: OptimizedRoute

          switch (algorithm) {
            case 'nearestNeighbor':
              result = nearestNeighborOptimization(orders, options)
              break
            case 'genetic':
              result = geneticAlgorithmOptimization(orders, options)
              break
            case 'simulatedAnnealing':
              result = simulatedAnnealingOptimization(orders, options)
              break
            case 'twoOpt':
              result = twoOptOptimization(orders, options)
              break
            case 'threeOpt':
              result = threeOptOptimization(orders, options)
              break
            case 'antColony':
              result = antColonyOptimization(orders, options)
              break
            default:
              result = nearestNeighborOptimization(orders, options)
          }

          resolve(result)
        }, 0)
      })
    )
  }

  const algorithmResults = await Promise.all(promises)
  results.push(...algorithmResults)

  // Выбираем лучшее решение по score (меньше = лучше)
  const bestResult = results.reduce((best, current) => 
    current.score < best.score ? current : best
  )

  // Применяем 2-opt как финальное улучшение к лучшему результату
  if (bestResult.algorithm !== 'twoOpt' && orders.length >= 4) {
    const improved = twoOptOptimization(bestResult.orders, { maxIterations: 100 })
    if (improved.score < bestResult.score) {
      return {
        ...improved,
        algorithm: `multi+${improved.algorithm}`
      }
    }
  }

  return {
    ...bestResult,
    algorithm: `multi:${bestResult.algorithm}`
  }
}

