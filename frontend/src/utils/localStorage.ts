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
    try {
      const settingsJson = localStorage.getItem('km_settings')
      return settingsJson ? JSON.parse(settingsJson) : {
        googleMapsApiKey: localStorage.getItem('google_maps_api_key') || '',
        defaultStartAddress: localStorage.getItem('km_default_start_address') || 'Макеевская 7, Киев, Украина',
        defaultEndAddress: localStorage.getItem('km_default_end_address') || 'Макеевская 7, Киев, Украина'
      }
    } catch (error) {
      console.error('Error reading settings:', error)
      return {
        googleMapsApiKey: localStorage.getItem('google_maps_api_key') || '',
        defaultStartAddress: localStorage.getItem('km_default_start_address') || 'Макеевская 7, Киев, Украина',
        defaultEndAddress: localStorage.getItem('km_default_end_address') || 'Макеевская 7, Киев, Украина'
      }
    }
  },

  setAllSettings: (settings: any): void => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem('km_settings', JSON.stringify(settings))
      if (settings.googleMapsApiKey) {
        localStorage.setItem('google_maps_api_key', settings.googleMapsApiKey)
      }
      if (settings.defaultStartAddress) {
        localStorage.setItem('km_default_start_address', settings.defaultStartAddress)
      }
      if (settings.defaultEndAddress) {
        localStorage.setItem('km_default_end_address', settings.defaultEndAddress)
      }
    } catch (error) {
      console.error('Error saving settings:', error)
    }
  },

  clearAllSettings: (): void => {
    if (typeof window === 'undefined') return
    const keysToRemove = [
      'km_settings',
      'km_dashboard_logs',
      'km_dashboard_processed_data',
      'km_dashboard_excel_logs',
      'km_default_start_address',
      'km_default_end_address',
      'km_routes',
      'km_excel_data',
      'km_sync_data'
    ]
    keysToRemove.forEach(key => localStorage.removeItem(key))
  }
}

