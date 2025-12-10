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

  // Persistent courier vehicle mapping (separate from regular settings)
  getCourierVehicleMap: (): Record<string, 'car' | 'motorcycle'> => {
    if (typeof window === 'undefined') return {}
    try {
      const existing = localStorage.getItem('km_courier_vehicle_map')
      return existing ? JSON.parse(existing) : {}
    } catch {
      return {}
    }
  },

  setCourierVehicleMap: (map: Record<string, 'car' | 'motorcycle'>): void => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem('km_courier_vehicle_map', JSON.stringify(map))
    } catch (error) {
      console.error('Error saving courier vehicle map:', error)
    }
  },

  removeCourierFromMap: (courierName: string): void => {
    if (typeof window === 'undefined') return
    try {
      const existing = localStorage.getItem('km_courier_vehicle_map')
      if (existing) {
        const map = JSON.parse(existing)
        delete map[courierName]
        // If map is now empty, remove the entire key to free up storage
        if (Object.keys(map).length === 0) {
          localStorage.removeItem('km_courier_vehicle_map')
        } else {
          localStorage.setItem('km_courier_vehicle_map', JSON.stringify(map))
        }
      }
    } catch (e) {
      console.error('Error removing courier from map:', e)
    }
  },

  clearCourierVehicleMap: (): void => {
    if (typeof window === 'undefined') return
    localStorage.removeItem('km_courier_vehicle_map')
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
      const serialized = JSON.stringify(data)
      const size = new Blob([serialized]).size
      
      // Предупреждение если данные слишком большие (>2MB)
      if (size > 2 * 1024 * 1024) {
        console.warn(`⚠️ Данные для ключа "${key}" слишком большие: ${(size / 1024 / 1024).toFixed(2)}MB`)
      }
      
      localStorage.setItem(key, serialized)
    } catch (error: any) {
      if (error.name === 'QuotaExceededError' || error.message?.includes('quota')) {
        console.warn(`⚠️ localStorage переполнен для ключа "${key}". Попытка очистки...`)
        // Пробуем очистить старые данные
        try {
          // Удаляем старые данные (кроме критически важных)
          const criticalKeys = ['google_maps_api_key', 'km_settings', 'km_courier_vehicle_map']
          const allKeys = Object.keys(localStorage)
          allKeys.forEach(k => {
            if (!criticalKeys.includes(k) && k.startsWith('km_')) {
              try {
                localStorage.removeItem(k)
              } catch {}
            }
          })
          // Пробуем сохранить снова
          localStorage.setItem(key, JSON.stringify(data))
        } catch (retryError) {
          console.error(`❌ Не удалось сохранить данные для ключа "${key}":`, retryError)
        }
      } else {
        console.error('Error writing to localStorage:', error)
      }
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
      const persistentMap = localStorageUtils.getCourierVehicleMap()
      const maxCriticalRouteDistanceKm = localStorage.getItem('km_max_critical_route_distance_km')
      const citySectors = localStorage.getItem('km_city_sectors')
      return settingsJson ? {
        ...JSON.parse(settingsJson),
        courierVehicleMap: persistentMap,
        maxCriticalRouteDistanceKm: maxCriticalRouteDistanceKm ? parseFloat(maxCriticalRouteDistanceKm) : 120,
        citySectors: citySectors ? JSON.parse(citySectors) : {}
      } : {
        googleMapsApiKey: localStorage.getItem('google_maps_api_key') || '',
        mapboxToken: localStorage.getItem('km_mapbox_token') || 'pk.eyJ1IjoieWFwMDA3NyIsImEiOiJjbWkyN2wzYnIxNHN3MmxzZmpjOThzdmp6In0.KKBxC62q-I4xEXQBCx7JVw',
        defaultStartAddress: localStorage.getItem('km_default_start_address') || 'Макеевская 7, Киев, Украина',
        defaultEndAddress: localStorage.getItem('km_default_end_address') || 'Макеевская 7, Киев, Украина',
        cityBias: localStorage.getItem('km_city_bias') || '',
        courierVehicleMap: persistentMap,
        maxCriticalRouteDistanceKm: maxCriticalRouteDistanceKm ? parseFloat(maxCriticalRouteDistanceKm) : 120,
        citySectors: citySectors ? JSON.parse(citySectors) : {}
      }
    } catch (error) {
      console.error('Error reading settings:', error)
      return {
        googleMapsApiKey: localStorage.getItem('google_maps_api_key') || '',
        mapboxToken: localStorage.getItem('km_mapbox_token') || 'pk.eyJ1IjoieWFwMDA3NyIsImEiOiJjbWkyN2wzYnIxNHN3MmxzZmpjOThzdmp6In0.KKBxC62q-I4xEXQBCx7JVw',
        defaultStartAddress: localStorage.getItem('km_default_start_address') || 'Макеевская 7, Киев, Украина',
        defaultEndAddress: localStorage.getItem('km_default_end_address') || 'Макеевская 7, Киев, Украина',
        cityBias: localStorage.getItem('km_city_bias') || '',
        courierVehicleMap: localStorageUtils.getCourierVehicleMap(),
        maxCriticalRouteDistanceKm: localStorage.getItem('km_max_critical_route_distance_km') ? parseFloat(localStorage.getItem('km_max_critical_route_distance_km')!) : 120,
        citySectors: localStorage.getItem('km_city_sectors') ? JSON.parse(localStorage.getItem('km_city_sectors')!) : {}
      }
    }
  },

  setAllSettings: (settings: any): void => {
    if (typeof window === 'undefined') return
    try {
      const { courierVehicleMap, ...restSettings } = settings
      localStorage.setItem('km_settings', JSON.stringify(restSettings))
      if (settings.googleMapsApiKey) {
        localStorage.setItem('google_maps_api_key', settings.googleMapsApiKey)
      }
      if (settings.mapboxToken !== undefined) {
        localStorage.setItem('km_mapbox_token', settings.mapboxToken)
      }
      if (settings.defaultStartAddress) {
        localStorage.setItem('km_default_start_address', settings.defaultStartAddress)
      }
      if (settings.defaultEndAddress) {
        localStorage.setItem('km_default_end_address', settings.defaultEndAddress)
      }
      if (settings.maxCriticalRouteDistanceKm !== undefined) {
        localStorage.setItem('km_max_critical_route_distance_km', settings.maxCriticalRouteDistanceKm.toString())
      }
      if (settings.cityBias !== undefined) {
        localStorage.setItem('km_city_bias', settings.cityBias)
      }
      if (settings.citySectors !== undefined) {
        localStorage.setItem('km_city_sectors', JSON.stringify(settings.citySectors || {}))
      }
      // Save courier vehicle map separately
      if (courierVehicleMap && typeof courierVehicleMap === 'object') {
        localStorageUtils.setCourierVehicleMap(courierVehicleMap)
      }
      window.dispatchEvent(new CustomEvent('km-settings-updated', { detail: { settings: restSettings } }))
    } catch (error) {
      console.error('Error saving settings:', error)
    }
  },

  clearAllSettings: (): void => {
    if (typeof window === 'undefined') return
    // Keep courier vehicle map in separate storage - IT SURVIVES CLEAR ALL DATA
    // Also preserve API key for convenience
    const apiKey = localStorage.getItem('google_maps_api_key')
    
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
    
    // Restore API key
    if (apiKey) {
      localStorage.setItem('google_maps_api_key', apiKey)
    }
  }
}

