/**
 * Настройки и профили оптимизации маршрутов
 */

import type { OptimizationOptions } from './advancedRouteOptimization'
import type { TrafficAwareOptions } from './trafficAwareOptimization'
import type { BatchingOptions } from './trafficAwareOptimization'

export type OptimizationProfile = 'fast' | 'balanced' | 'best' | 'custom'

export interface ProfileSettings {
  profile: OptimizationProfile
  name: string
  description: string
  optimizationOptions: OptimizationOptions
  trafficAwareOptions: Partial<TrafficAwareOptions>
  batchingOptions: BatchingOptions
  algorithms: Array<'nearestNeighbor' | 'genetic' | 'simulatedAnnealing' | 'twoOpt' | 'threeOpt' | 'antColony'>
  maxIterations?: number
  timeout?: number // таймаут в миллисекундах
}

/**
 * Предустановленные профили оптимизации
 */
export const DEFAULT_PROFILES: Record<OptimizationProfile, ProfileSettings> = {
  fast: {
    profile: 'fast',
    name: 'Быстрая оптимизация',
    description: 'Быстрое планирование для срочных случаев. Использует простые алгоритмы.',
    optimizationOptions: {
      maxIterations: 10,
      populationSize: 20,
      mutationRate: 0.2,
      crossoverRate: 0.7,
      coolingRate: 0.95,
      initialTemperature: 500,
      ants: 10
    },
    trafficAwareOptions: {
      trafficWeight: 0.3,
      avoidCongestion: false
    },
    batchingOptions: {
      batchSize: 8,
      timeWindowMinutes: 45,
      prioritizeDeadlines: true,
      maxBatchDuration: 90
    },
    algorithms: ['nearestNeighbor', 'twoOpt'],
    maxIterations: 10,
    timeout: 5000 // 5 секунд
  },

  balanced: {
    profile: 'balanced',
    name: 'Сбалансированная оптимизация',
    description: 'Оптимальный баланс между скоростью и качеством. Рекомендуется для ежедневного использования.',
    optimizationOptions: {
      maxIterations: 50,
      populationSize: 50,
      mutationRate: 0.1,
      crossoverRate: 0.8,
      coolingRate: 0.99,
      initialTemperature: 1000,
      alpha: 1.0,
      beta: 2.0,
      evaporationRate: 0.1,
      ants: 20
    },
    trafficAwareOptions: {
      trafficWeight: 0.5,
      avoidCongestion: true
    },
    batchingOptions: {
      batchSize: 10,
      timeWindowMinutes: 60,
      prioritizeDeadlines: true,
      maxBatchDuration: 120
    },
    algorithms: ['nearestNeighbor', 'genetic', 'simulatedAnnealing', 'twoOpt'],
    maxIterations: 50,
    timeout: 15000 // 15 секунд
  },

  best: {
    profile: 'best',
    name: 'Лучшая оптимизация',
    description: 'Максимальное качество планирования. Использует все доступные алгоритмы и больше итераций.',
    optimizationOptions: {
      maxIterations: 100,
      populationSize: 100,
      mutationRate: 0.08,
      crossoverRate: 0.85,
      coolingRate: 0.995,
      initialTemperature: 2000,
      alpha: 1.5,
      beta: 3.0,
      evaporationRate: 0.05,
      ants: 50
    },
    trafficAwareOptions: {
      trafficWeight: 0.7,
      avoidCongestion: true
    },
    batchingOptions: {
      batchSize: 12,
      timeWindowMinutes: 75,
      prioritizeDeadlines: true,
      maxBatchDuration: 150
    },
    algorithms: ['nearestNeighbor', 'genetic', 'simulatedAnnealing', 'twoOpt', 'threeOpt', 'antColony'],
    maxIterations: 100,
    timeout: 30000 // 30 секунд
  },

  custom: {
    profile: 'custom',
    name: 'Пользовательский профиль',
    description: 'Настройки, сохраненные пользователем',
    optimizationOptions: {
      maxIterations: 50,
      populationSize: 50,
      mutationRate: 0.1,
      crossoverRate: 0.8,
      coolingRate: 0.99,
      initialTemperature: 1000,
      alpha: 1.0,
      beta: 2.0,
      evaporationRate: 0.1,
      ants: 20
    },
    trafficAwareOptions: {
      trafficWeight: 0.5,
      avoidCongestion: true
    },
    batchingOptions: {
      batchSize: 10,
      timeWindowMinutes: 60,
      prioritizeDeadlines: true,
      maxBatchDuration: 120
    },
    algorithms: ['nearestNeighbor', 'genetic', 'simulatedAnnealing', 'twoOpt'],
    maxIterations: 50,
    timeout: 15000
  }
}

/**
 * Управление профилями оптимизации
 */
class OptimizationProfileManager {
  private profiles: Map<string, ProfileSettings> = new Map()
  private currentProfile: OptimizationProfile = 'balanced'

  constructor() {
    // Загружаем предустановленные профили
    for (const [key, profile] of Object.entries(DEFAULT_PROFILES)) {
      this.profiles.set(key, profile)
    }

    // Загружаем сохраненные профили из localStorage
    this.loadSavedProfiles()
  }

  /**
   * Получить текущий профиль
   */
  getCurrentProfile(): ProfileSettings {
    return this.profiles.get(this.currentProfile) || DEFAULT_PROFILES.balanced
  }

  /**
   * Установить текущий профиль
   */
  setCurrentProfile(profile: OptimizationProfile | string): void {
    if (this.profiles.has(profile)) {
      this.currentProfile = profile as OptimizationProfile
      this.saveCurrentProfile()
    }
  }

  /**
   * Получить профиль по имени
   */
  getProfile(name: string): ProfileSettings | undefined {
    return this.profiles.get(name)
  }

  /**
   * Получить все доступные профили
   */
  getAllProfiles(): ProfileSettings[] {
    return Array.from(this.profiles.values())
  }

  /**
   * Сохранить пользовательский профиль
   */
  saveCustomProfile(profile: ProfileSettings): void {
    this.profiles.set('custom', profile)
    this.saveProfilesToStorage()
  }

  /**
   * Сохранить новый профиль
   */
  saveProfile(name: string, profile: ProfileSettings): void {
    this.profiles.set(name, profile)
    this.saveProfilesToStorage()
  }

  /**
   * Удалить профиль
   */
  deleteProfile(name: string): boolean {
    // Нельзя удалить предустановленные профили
    if (['fast', 'balanced', 'best'].includes(name)) {
      return false
    }

    if (this.profiles.has(name)) {
      this.profiles.delete(name)
      this.saveProfilesToStorage()
      return true
    }

    return false
  }

  /**
   * Сохранить профили в localStorage
   */
  private saveProfilesToStorage(): void {
    try {
      const customProfiles: Record<string, ProfileSettings> = {}
      
      for (const [key, profile] of this.profiles.entries()) {
        // Сохраняем только пользовательские профили (не предустановленные)
        if (!['fast', 'balanced', 'best'].includes(key)) {
          customProfiles[key] = profile
        }
      }

      localStorage.setItem('optimization_profiles', JSON.stringify(customProfiles))
    } catch (error) {
      console.error('Ошибка сохранения профилей:', error)
    }
  }

  /**
   * Загрузить сохраненные профили из localStorage
   */
  private loadSavedProfiles(): void {
    try {
      const saved = localStorage.getItem('optimization_profiles')
      if (saved) {
        const customProfiles: Record<string, ProfileSettings> = JSON.parse(saved)
        
        for (const [key, profile] of Object.entries(customProfiles)) {
          this.profiles.set(key, profile)
        }
      }

      // Загружаем текущий профиль
      const current = localStorage.getItem('current_optimization_profile')
      if (current && this.profiles.has(current)) {
        this.currentProfile = current as OptimizationProfile
      }
    } catch (error) {
      console.error('Ошибка загрузки профилей:', error)
    }
  }

  /**
   * Сохранить текущий профиль
   */
  private saveCurrentProfile(): void {
    try {
      localStorage.setItem('current_optimization_profile', this.currentProfile)
    } catch (error) {
      console.error('Ошибка сохранения текущего профиля:', error)
    }
  }
}

// Экспортируем синглтон
export const profileManager = new OptimizationProfileManager()

/**
 * Получить настройки оптимизации для текущего профиля
 */
export function getOptimizationSettings(): ProfileSettings {
  return profileManager.getCurrentProfile()
}

/**
 * Создать пользовательский профиль
 */
export function createCustomProfile(
  name: string,
  baseProfile: OptimizationProfile = 'balanced',
  overrides: Partial<ProfileSettings>
): ProfileSettings {
  const base = DEFAULT_PROFILES[baseProfile]

  const customProfile: ProfileSettings = {
    ...base,
    profile: 'custom',
    name,
    description: overrides.description || `Пользовательский профиль на основе ${base.name}`,
    ...overrides,
    optimizationOptions: {
      ...base.optimizationOptions,
      ...overrides.optimizationOptions
    },
    trafficAwareOptions: {
      ...base.trafficAwareOptions,
      ...overrides.trafficAwareOptions
    },
    batchingOptions: {
      ...base.batchingOptions,
      ...overrides.batchingOptions
    },
    algorithms: overrides.algorithms || base.algorithms
  }

  return customProfile
}

/**
 * Сравнить производительность профилей
 */
export interface ProfileComparison {
  profile: string
  executionTime: number
  quality: number
  distance: number
  score: number
}

export async function compareProfiles(
  orders: any[],
  profiles: ProfileSettings[]
): Promise<ProfileComparison[]> {
  const results: ProfileComparison[] = []

  for (const profile of profiles) {
    const startTime = Date.now()

    try {
      // Здесь должен быть вызов оптимизации, но для примера используем заглушку
      // В реальности нужно вызвать multiAlgorithmOptimization с настройками профиля
      const estimatedQuality = profile.maxIterations || 50
      const estimatedDistance = orders.length * 5 // примерная оценка

      const executionTime = Date.now() - startTime

      results.push({
        profile: profile.name,
        executionTime,
        quality: estimatedQuality,
        distance: estimatedDistance,
        score: (estimatedQuality * 100) / executionTime // примерная оценка качества/времени
      })
    } catch (error) {
      console.error(`Ошибка сравнения профиля ${profile.name}:`, error)
    }
  }

  return results.sort((a, b) => b.score - a.score)
}

