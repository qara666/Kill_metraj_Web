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
        console.warn(`️ Данные для ключа "${key}" слишком большие: ${(size / 1024 / 1024).toFixed(2)}MB`)
      }

      localStorage.setItem(key, serialized)
    } catch (error: any) {
      if (error.name === 'QuotaExceededError' || error.message?.includes('quota')) {
        console.warn(`️ localStorage переполнен для ключа "${key}". Попытка очистки...`)
        // Пробуем очистить старые данные
        try {
          // Удаляем старые данные (кроме критически важных)
          const criticalKeys = ['google_maps_api_key', 'km_settings', 'km_courier_vehicle_map']
          const allKeys = Object.keys(localStorage)
          allKeys.forEach(k => {
            if (!criticalKeys.includes(k) && k.startsWith('km_')) {
              try {
                localStorage.removeItem(k)
              } catch { }
            }
          })
          // Пробуем сохранить снова
          localStorage.setItem(key, JSON.stringify(data))
        } catch (retryError) {
          console.error(` Не удалось сохранить данные для ключа "${key}":`, retryError)
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
      const defaultSettings = {
        googleMapsApiKey: localStorage.getItem('google_maps_api_key') || '',
        mapboxToken: localStorage.getItem('km_mapbox_token') || '',
        defaultStartAddress: localStorage.getItem('km_default_start_address') || '',
        defaultEndAddress: localStorage.getItem('km_default_end_address') || '',
        cityBias: localStorage.getItem('km_city_bias') || '',
        mapStyle: localStorage.getItem('km_map_style') || 'standard',
        courierVehicleMap: persistentMap,
        maxCriticalRouteDistanceKm: maxCriticalRouteDistanceKm ? parseFloat(maxCriticalRouteDistanceKm) : 120,
        kmlData: localStorage.getItem('km_kml_data') ? JSON.parse(localStorage.getItem('km_kml_data')!) : null,
        kmlSourceUrl: localStorage.getItem('km_kml_source_url') || '',
        lastKmlSync: localStorage.getItem('km_last_kml_sync') || null,
        autoSyncKml: localStorage.getItem('km_auto_sync_kml') === 'true',
        fastopertorApiKey: localStorage.getItem('km_fastopertor_api_key') || '',
        fastopertorDepartmentId: localStorage.getItem('km_fastopertor_department_id') || ''
      }

      return settingsJson ? {
        ...JSON.parse(settingsJson),
        mapStyle: localStorage.getItem('km_map_style') || 'standard',
        courierVehicleMap: persistentMap,
        maxCriticalRouteDistanceKm: maxCriticalRouteDistanceKm ? parseFloat(maxCriticalRouteDistanceKm) : 120,
        kmlData: localStorage.getItem('km_kml_data') ? JSON.parse(localStorage.getItem('km_kml_data')!) : null,
        kmlSourceUrl: localStorage.getItem('km_kml_source_url') || '',
        lastKmlSync: localStorage.getItem('km_last_kml_sync') || null,
        autoSyncKml: localStorage.getItem('km_auto_sync_kml') === 'true',
        selectedHubs: localStorage.getItem('km_selected_hubs') ? JSON.parse(localStorage.getItem('km_selected_hubs')!) : [],
        selectedZones: localStorage.getItem('km_selected_zones') ? JSON.parse(localStorage.getItem('km_selected_zones')!) : [],
        fastopertorApiKey: localStorage.getItem('km_fastopertor_api_key') || '',
        fastopertorDepartmentId: localStorage.getItem('km_fastopertor_department_id') || ''
      } : defaultSettings
    } catch (error) {
      console.error('Error reading settings:', error)
      return {
        googleMapsApiKey: localStorage.getItem('google_maps_api_key') || '',
        mapboxToken: localStorage.getItem('km_mapbox_token') || '',
        defaultStartAddress: localStorage.getItem('km_default_start_address') || '',
        defaultEndAddress: localStorage.getItem('km_default_end_address') || '',
        cityBias: localStorage.getItem('km_city_bias') || '',
        mapStyle: localStorage.getItem('km_map_style') || 'standard',
        courierVehicleMap: localStorageUtils.getCourierVehicleMap(),
        maxCriticalRouteDistanceKm: localStorage.getItem('km_max_critical_route_distance_km') ? parseFloat(localStorage.getItem('km_max_critical_route_distance_km')!) : 120,
        kmlData: localStorage.getItem('km_kml_data') ? JSON.parse(localStorage.getItem('km_kml_data')!) : null,
        kmlSourceUrl: localStorage.getItem('km_kml_source_url') || '',
        lastKmlSync: localStorage.getItem('km_last_kml_sync') || null,
        autoSyncKml: localStorage.getItem('km_auto_sync_kml') === 'true',
        fastopertorApiKey: localStorage.getItem('km_fastopertor_api_key') || '',
        fastopertorDepartmentId: localStorage.getItem('km_fastopertor_department_id') || ''
      }
    }
  },

  setAllSettings: (settings: any): void => {
    if (typeof window === 'undefined') return
    try {
      const { courierVehicleMap, ...restSettings } = settings
      localStorage.setItem('km_settings', JSON.stringify(restSettings))
      if (settings.mapStyle) {
        localStorage.setItem('km_map_style', settings.mapStyle)
      }
      if (settings.googleMapsApiKey !== undefined) {
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
      if (settings.kmlData !== undefined) {
        localStorage.setItem('km_kml_data', JSON.stringify(settings.kmlData))
      }
      if (settings.kmlSourceUrl !== undefined) {
        localStorage.setItem('km_kml_source_url', settings.kmlSourceUrl)
      }
      if (settings.lastKmlSync !== undefined) {
        localStorage.setItem('km_last_kml_sync', settings.lastKmlSync || '')
      }
      if (settings.autoSyncKml !== undefined) {
        localStorage.setItem('km_auto_sync_kml', settings.autoSyncKml ? 'true' : 'false')
      }
      if (settings.selectedHubs !== undefined) {
        localStorage.setItem('km_selected_hubs', JSON.stringify(settings.selectedHubs || []))
      }
      if (settings.selectedZones !== undefined) {
        localStorage.setItem('km_selected_zones', JSON.stringify(settings.selectedZones || []))
      }
      if (settings.fastopertorApiKey !== undefined) {
        localStorage.setItem('km_fastopertor_api_key', settings.fastopertorApiKey)
      }
      if (settings.fastopertorDepartmentId !== undefined) {
        localStorage.setItem('km_fastopertor_department_id', settings.fastopertorDepartmentId.toString())
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

  clearDynamicData: (): void => {
    if (typeof window === 'undefined') return

    const keysToRemove = [
      'km_dashboard_logs',
      'km_dashboard_processed_data',
      'km_dashboard_excel_logs',
      'km_routes',
      'km_excel_data',
      'km_sync_data',
      'km_city_sectors'
    ]
    keysToRemove.forEach(key => localStorage.removeItem(key))

    // Also clear Zustand store for dynamic data if needed, but handled in UI
  },

  clearAllSettings: (): void => {
    if (typeof window === 'undefined') return
    // Keep courier vehicle map in separate storage - IT SURVIVES CLEAR ALL DATA
    // Also preserve API keys for convenience
    const googleApiKey = localStorage.getItem('google_maps_api_key')
    const mapboxToken = localStorage.getItem('km_mapbox_token')
    const fastopertorApiKey = localStorage.getItem('km_fastopertor_api_key')
    const fastopertorDeptId = localStorage.getItem('km_fastopertor_department_id')

    const keysToRemove = [
      'km_settings',
      'km_default_start_address',
      'km_default_end_address',
      'km_kml_data',
      'km_kml_source_url',
      'km_last_kml_sync',
      'km_auto_sync_kml',
      'km_selected_hub',
      'km_selected_hubs',
      'km_selected_zones',
      'km_city_bias',
      'km_map_style',
      'km_max_critical_route_distance_km',
      'km_fastopertor_api_key',
      'km_fastopertor_department_id'
    ]
    keysToRemove.forEach(key => localStorage.removeItem(key))

    // Restore API keys
    if (googleApiKey) {
      localStorage.setItem('google_maps_api_key', googleApiKey)
    }
    if (mapboxToken) {
      localStorage.setItem('km_mapbox_token', mapboxToken)
    }
    if (fastopertorApiKey) {
      localStorage.setItem('km_fastopertor_api_key', fastopertorApiKey)
    }
    if (fastopertorDeptId) {
      localStorage.setItem('km_fastopertor_department_id', fastopertorDeptId)
    }
  }
}

