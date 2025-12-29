// Утилита для сохранения истории оптимизаций маршрутов

export interface RouteHistoryEntry {
  id: string
  timestamp: number
  routes: any[]
  settings: {
    maxRouteDurationMin: number
    maxRouteDistanceKm: number
    maxStopsPerRoute: number
    trafficMode: string
    [key: string]: any
  }
  stats: {
    totalRoutes: number
    totalOrders: number
    totalDistance: number
    totalDuration: number
    avgEfficiency: number
  }
  name?: string
  description?: string
}

const HISTORY_STORAGE_KEY = 'km_route_history'
const MAX_HISTORY_ENTRIES = 20 // Уменьшено с 50 до 20 для экономии места
const MAX_STORAGE_SIZE = 4 * 1024 * 1024 // 4MB - безопасный лимит для большинства браузеров

// Функция для уменьшения размера маршрутов (убираем лишние данные)
function minimizeRoutes(routes: any[]): any[] {
  return routes.map(route => {
    // Минимизируем routeChainFull - оставляем только необходимые поля
    const minimizedChain = (route.routeChainFull || route.routeChain || []).map((order: any) => {
      if (typeof order === 'string') {
        // Если это просто адрес (строка), оставляем как есть
        return order
      }
      // Если это объект, оставляем только минимальные данные
      const minimized: any = {
        a: order.address || null, // 'a' вместо 'address' для экономии места
      }
      // Добавляем только если есть значение (не null/undefined)
      if (order.orderNumber || order.raw?.orderNumber) {
        minimized.n = order.orderNumber || order.raw?.orderNumber // 'n' вместо 'orderNumber'
      }
      if (order.readyAt) minimized.r = order.readyAt // 'r' вместо 'readyAt'
      if (order.deadlineAt) minimized.d = order.deadlineAt // 'd' вместо 'deadlineAt'
      // Убираем: raw, coords, routeChainFull, reasons, bounds и другие большие поля
      return minimized
    })

    // Минимизируем сам маршрут - используем короткие ключи
    const minimized: any = {
      i: route.id, // 'i' вместо 'id'
      a1: route.startAddress, // 'a1' вместо 'startAddress'
      a2: route.endAddress, // 'a2' вместо 'endAddress'
      c: minimizedChain.map((o: any) => typeof o === 'string' ? o : (o.a || '')), // 'c' вместо 'routeChain'
      d: route.totalDistanceKm || (route.totalDistance ? (route.totalDistance / 1000).toFixed(1) : '0'), // 'd' вместо 'totalDistanceKm'
      t: route.totalDurationMin || (route.totalDuration ? (route.totalDuration / 60).toFixed(1) : '0'), // 't' вместо 'totalDurationMin'
      s: route.stopsCount || minimizedChain.length, // 's' вместо 'stopsCount'
    }
    
    // Добавляем только если есть значение
    if (route.name) minimized.n = route.name // 'n' вместо 'name'
    if (minimizedChain.length > 0) {
      const orderNums = minimizedChain.map((o: any) => typeof o === 'string' ? null : (o.n || null)).filter(Boolean)
      if (orderNums.length > 0) minimized.o = orderNums // 'o' вместо 'orderNumbers'
    }

    return minimized
  })
}

// Проверка размера данных перед сохранением
function checkStorageSize(data: string): boolean {
  try {
    const size = new Blob([data]).size
    return size < MAX_STORAGE_SIZE
  } catch {
    return true // Если не можем проверить, пробуем сохранить
  }
}

export const routeHistory = {
  // Сохранить текущее состояние маршрутов
  save: (routes: any[], settings: any, stats: any, name?: string, description?: string): string => {
    try {
      // Минимизируем размер маршрутов
      const minimizedRoutes = minimizeRoutes(routes)
      
      const entry: RouteHistoryEntry = {
        id: `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        routes: minimizedRoutes,
        settings: { ...settings },
        stats: { ...stats },
        name,
        description
      }

      const history = routeHistory.getAll()
      history.unshift(entry) // Добавляем в начало
      
      // Агрессивная очистка: оставляем только последние записи
      const targetEntries = Math.min(MAX_HISTORY_ENTRIES, 15) // Еще больше уменьшаем при переполнении
      if (history.length > targetEntries) {
        history.splice(targetEntries)
      }

      // Пробуем сохранить
      const dataToSave = JSON.stringify(history)
      
      // Проверяем размер перед сохранением
      if (!checkStorageSize(dataToSave)) {
        console.warn('⚠️ Данные слишком большие, удаляем старые записи...')
        // Удаляем половину старых записей
        const halfSize = Math.floor(history.length / 2)
        history.splice(halfSize)
        const reducedData = JSON.stringify(history)
        
        if (!checkStorageSize(reducedData)) {
          // Если все еще слишком большие, оставляем только последние 5
          history.splice(5)
        }
      }

      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history))
      return entry.id
    } catch (error: any) {
      // Обработка QuotaExceededError
      if (error.name === 'QuotaExceededError' || error.message?.includes('quota')) {
        console.warn('⚠️ localStorage переполнен, очищаем старые записи...')
        
        try {
          const history = routeHistory.getAll()
          // Оставляем только последние 5 записей
          const reducedHistory = history.slice(0, 5)
          localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(reducedHistory))
          
          // Пробуем сохранить текущую запись еще раз
          const minimizedRoutes = minimizeRoutes(routes)
          const entry: RouteHistoryEntry = {
            id: `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            routes: minimizedRoutes,
            settings: { ...settings },
            stats: { ...stats },
            name,
            description
          }
          reducedHistory.unshift(entry)
          reducedHistory.splice(5) // Оставляем максимум 5
          
          localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(reducedHistory))
          console.log('✅ История сохранена после очистки')
          return entry.id
        } catch (retryError) {
          console.error('❌ Не удалось сохранить историю даже после очистки:', retryError)
          // Очищаем всю историю и пробуем сохранить только текущую запись
          try {
            localStorage.removeItem(HISTORY_STORAGE_KEY)
            const minimizedRoutes = minimizeRoutes(routes)
            const entry: RouteHistoryEntry = {
              id: `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              timestamp: Date.now(),
              routes: minimizedRoutes,
              settings: { ...settings },
              stats: { ...stats },
              name,
              description
            }
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([entry]))
            return entry.id
          } catch (finalError) {
            console.error('❌ Критическая ошибка сохранения истории:', finalError)
            // Возвращаем ID, но не сохраняем (чтобы не ломать приложение)
            return `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          }
        }
      } else {
        console.error('❌ Ошибка сохранения истории:', error)
        throw error
      }
    }
  },

  // Восстановление данных из минимизированного формата
  _expandMinimizedRoute: (minimized: any): any => {
    // Если уже развернутый формат (старый), возвращаем как есть
    if (minimized.id && minimized.startAddress) return minimized
    
    // Восстанавливаем из минимизированного формата
    const expanded: any = {
      id: minimized.i,
      startAddress: minimized.a1,
      endAddress: minimized.a2,
      routeChain: minimized.c,
      totalDistanceKm: minimized.d,
      totalDurationMin: minimized.t,
      stopsCount: minimized.s
    }
    
    if (minimized.n) expanded.name = minimized.n
    if (minimized.o) expanded.orderNumbers = minimized.o
    
    // Восстанавливаем routeChainFull из минимизированного формата
    if (minimized.c && Array.isArray(minimized.c)) {
      expanded.routeChainFull = minimized.c.map((item: any) => {
        if (typeof item === 'string') return item
        return {
          address: item.a,
          orderNumber: item.n,
          readyAt: item.r,
          deadlineAt: item.d
        }
      })
    }
    
    return expanded
  },

  // Получить все записи истории
  getAll: (): RouteHistoryEntry[] => {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY)
      if (!stored) return []
      
      const parsed = JSON.parse(stored)
      // Восстанавливаем минимизированные маршруты (если нужно)
      return parsed.map((entry: RouteHistoryEntry) => {
        // Проверяем, нужно ли восстановление (если первый маршрут минимизирован)
        if (entry.routes && entry.routes.length > 0 && entry.routes[0].i) {
          return {
            ...entry,
            routes: entry.routes.map((route: any) => routeHistory._expandMinimizedRoute(route))
          }
        }
        return entry
      })
    } catch {
      return []
    }
  },

  // Получить запись по ID
  get: (id: string): RouteHistoryEntry | null => {
    const history = routeHistory.getAll()
    return history.find(entry => entry.id === id) || null
  },

  // Удалить запись
  delete: (id: string): boolean => {
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY)
      if (!stored) return false
      
      const history = JSON.parse(stored)
      const filtered = history.filter((entry: RouteHistoryEntry) => entry.id !== id)
      if (filtered.length === history.length) return false
      
      // Сохраняем в минимизированном формате
      const minimizedFiltered = filtered.map((entry: RouteHistoryEntry) => ({
        ...entry,
        routes: minimizeRoutes(entry.routes)
      }))
      
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(minimizedFiltered))
      return true
    } catch (error) {
      console.error('Error deleting history entry:', error)
      return false
    }
  },

  // Очистить всю историю
  clear: (): void => {
    localStorage.removeItem(HISTORY_STORAGE_KEY)
  },

  // Сравнить две записи
  compare: (id1: string, id2: string): {
    routesDiff: number
    ordersDiff: number
    distanceDiff: number
    durationDiff: number
    efficiencyDiff: number
  } | null => {
    const entry1 = routeHistory.get(id1)
    const entry2 = routeHistory.get(id2)
    
    if (!entry1 || !entry2) return null

    return {
      routesDiff: entry2.stats.totalRoutes - entry1.stats.totalRoutes,
      ordersDiff: entry2.stats.totalOrders - entry1.stats.totalOrders,
      distanceDiff: entry2.stats.totalDistance - entry1.stats.totalDistance,
      durationDiff: entry2.stats.totalDuration - entry1.stats.totalDuration,
      efficiencyDiff: entry2.stats.avgEfficiency - entry1.stats.avgEfficiency
    }
  }
}

