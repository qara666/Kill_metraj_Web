export interface StoredData {
  orders: any[]
  couriers: any[]
}

export const localStorageUtils = {
  hasApiKey: (): boolean => {
    if (typeof window === 'undefined') return false
    const apiKey = localStorage.getItem('google_maps_api_key')
    return !!apiKey
  },

  getApiKey: (): string | null => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('google_maps_api_key')
  },

  setApiKey: (key: string): void => {
    if (typeof window === 'undefined') return
    localStorage.setItem('google_maps_api_key', key)
  },

  removeApiKey: (): void => {
    if (typeof window === 'undefined') return
    localStorage.removeItem('google_maps_api_key')
  },

  getData: (key: string): any | null => {
    if (typeof window === 'undefined') return null
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : null
    } catch (error) {
      console.error('Error reading from localStorage:', error)
      return null
    }
  },

  setData: (key: string, data: any): void => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(key, JSON.stringify(data))
    } catch (error) {
      console.error('Error writing to localStorage:', error)
    }
  },

  removeData: (key: string): void => {
    if (typeof window === 'undefined') return
    localStorage.removeItem(key)
  },

  clear: (): void => {
    if (typeof window === 'undefined') return
    localStorage.clear()
  },

  getAllSettings: (): any => {
    if (typeof window === 'undefined') return {}
    const settings: any = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) {
        settings[key] = localStorage.getItem(key)
      }
    }
    return settings
  },

  setAllSettings: (settings: any): void => {
    if (typeof window === 'undefined') return
    Object.entries(settings).forEach(([key, value]) => {
      localStorage.setItem(key, String(value))
    })
  },

  clearAllSettings: (): void => {
    if (typeof window === 'undefined') return
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.includes('settings')) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
  }
}

