/**
 * Утилиты для оптимизации производительности
 */

import React from 'react'

/**
 * Debounce функция - откладывает выполнение функции до тех пор, 
 * пока не пройдет указанное время с момента последнего вызова
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null
      func(...args)
    }

    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(later, wait)
  }
}

/**
 * Throttle функция - ограничивает частоту вызова функции
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => {
        inThrottle = false
      }, limit)
    }
  }
}

/**
 * Батчинг запросов - группирует вызовы функций и выполняет их батчами
 */
export class RequestBatcher<T> {
  private batch: Array<{ args: any[]; resolve: (value: T) => void; reject: (error: any) => void }> = []
  private timeout: NodeJS.Timeout | null = null
  private readonly batchSize: number
  private readonly batchDelay: number
  private readonly batchFn: (args: any[][]) => Promise<T[]>

  constructor(
    batchFn: (args: any[][]) => Promise<T[]>,
    options: { batchSize?: number; batchDelay?: number } = {}
  ) {
    this.batchFn = batchFn
    this.batchSize = options.batchSize || 10
    this.batchDelay = options.batchDelay || 100
  }

  async add(...args: any[]): Promise<T> {
    return new Promise((resolve, reject) => {
      this.batch.push({ args, resolve, reject })

      if (this.batch.length >= this.batchSize) {
        this.flush()
      } else if (!this.timeout) {
        this.timeout = setTimeout(() => this.flush(), this.batchDelay)
      }
    })
  }

  private async flush() {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }

    if (this.batch.length === 0) return

    const currentBatch = this.batch.splice(0, this.batchSize)
    const argsList = currentBatch.map(item => item.args)

    try {
      const results = await this.batchFn(argsList)
      currentBatch.forEach((item, index) => {
        item.resolve(results[index])
      })
    } catch (error) {
      currentBatch.forEach(item => {
        item.reject(error)
      })
    }
  }
}

/**
 * Мемоизация с TTL (Time To Live)
 */
export function memoizeWithTTL<T extends (...args: any[]) => any>(
  fn: T,
  ttl: number = 60000 // 1 минута по умолчанию
): T {
  const cache = new Map<string, { value: ReturnType<T>; expiry: number }>()

  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = JSON.stringify(args)
    const cached = cache.get(key)

    if (cached && cached.expiry > Date.now()) {
      return cached.value
    }

    const value = fn(...args)
    cache.set(key, {
      value,
      expiry: Date.now() + ttl
    })

    // Очистка устаревших записей
    if (cache.size > 1000) {
      const now = Date.now()
      for (const [k, v] of cache.entries()) {
        if (v.expiry <= now) {
          cache.delete(k)
        }
      }
    }

    return value
  }) as T
}

/**
 * Ленивая загрузка компонента
 */
export function lazyLoad<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(importFn)
}

/**
 * Оптимизация для больших списков - виртуализация
 */
export interface VirtualListOptions {
  itemHeight: number
  containerHeight: number
  overscan?: number
}

export function useVirtualization<T>(
  items: T[],
  options: VirtualListOptions
): {
  visibleItems: T[]
  startIndex: number
  endIndex: number
  totalHeight: number
  offsetY: number
} {
  const { itemHeight, containerHeight, overscan = 5 } = options

  const [scrollTop, setScrollTop] = React.useState(0)

  const totalHeight = items.length * itemHeight
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  )

  const visibleItems = items.slice(startIndex, endIndex + 1)
  const offsetY = startIndex * itemHeight

  return {
    visibleItems,
    startIndex,
    endIndex,
    totalHeight,
    offsetY
  }
}

