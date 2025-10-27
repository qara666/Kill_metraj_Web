export interface LocalStorageData {
  key: string
  value: any
  timestamp: number
}

export const localStorageUtils = {
  /**
   * Сохраняет данные в localStorage с временной меткой
   */
  setItem: (key: string, value: any): void => {
    try {
      const data: LocalStorageData = {
        key,
        value,
        timestamp: Date.now()
      }
      localStorage.setItem(key, JSON.stringify(data))
    } catch (error) {
      console.error(`Ошибка сохранения в localStorage для ключа ${key}:`, error)
    }
  },

  /**
   * Получает данные из localStorage
   */
  getItem: <T = any>(key: string): T | null => {
    try {
      const item = localStorage.getItem(key)
      if (!item) return null
      
      const data: LocalStorageData = JSON.parse(item)
      return data.value
    } catch (error) {
      console.error(`Ошибка чтения из localStorage для ключа ${key}:`, error)
      return null
    }
  },

  /**
   * Удаляет данные из localStorage
   */
  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key)
    } catch (error) {
      console.error(`Ошибка удаления из localStorage для ключа ${key}:`, error)
    }
  },

  /**
   * Очищает все данные приложения из localStorage
   */
  clearAppData: (): void => {
    try {
      const keys = Object.keys(localStorage)
      keys.forEach(key => {
        if (key.startsWith('km_') || key.startsWith('google_maps_')) {
          localStorage.removeItem(key)
        }
      })
    } catch (error) {
      console.error('Ошибка очистки данных приложения:', error)
    }
  },

  /**
   * Проверяет, существует ли ключ в localStorage
   */
  hasItem: (key: string): boolean => {
    return localStorage.getItem(key) !== null
  },

  /**
   * Получает размер данных в localStorage
   */
  getStorageSize: (): number => {
    try {
      let total = 0
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          total += localStorage[key].length + key.length
        }
      }
      return total
    } catch (error) {
      console.error('Ошибка получения размера localStorage:', error)
      return 0
    }
  },

  /**
   * Получает все ключи приложения
   */
  getAppKeys: (): string[] => {
    try {
      return Object.keys(localStorage).filter(key => 
        key.startsWith('km_') || key.startsWith('google_maps_')
      )
    } catch (error) {
      console.error('Ошибка получения ключей приложения:', error)
      return []
    }
  },

  /**
   * Получает все настройки приложения
   */
  getAllSettings: (): Record<string, any> => {
    try {
      const settings: Record<string, any> = {}
      const keys = localStorageUtils.getAppKeys()
      
      keys.forEach(key => {
        const value = localStorageUtils.getItem(key)
        if (value !== null) {
          settings[key] = value
        }
      })
      
      return settings
    } catch (error) {
      console.error('Ошибка получения всех настроек:', error)
      return {}
    }
  },

  /**
   * Сохраняет все настройки приложения
   */
  setAllSettings: (settings: Record<string, any>): void => {
    try {
      Object.entries(settings).forEach(([key, value]) => {
        localStorageUtils.setItem(key, value)
      })
    } catch (error) {
      console.error('Ошибка сохранения всех настроек:', error)
    }
  },

  /**
   * Получает API ключ Google Maps
   */
  getApiKey: (): string | null => {
    return localStorageUtils.getItem<string>('google_maps_api_key')
  },

  /**
   * Сохраняет API ключ Google Maps
   */
  setApiKey: (apiKey: string): void => {
    localStorageUtils.setItem('google_maps_api_key', apiKey)
  },

  /**
   * Очищает все настройки приложения
   */
  clearAllSettings: (): void => {
    try {
      const keys = localStorageUtils.getAppKeys()
      keys.forEach(key => {
        localStorage.removeItem(key)
      })
    } catch (error) {
      console.error('Ошибка очистки всех настроек:', error)
    }
  }
}
