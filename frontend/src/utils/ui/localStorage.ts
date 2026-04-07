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

  // Courier performance settings (Target KM per order, etc.)
  getCourierSettings: (): Record<string, { targetKmPerOrder?: number, kpiHudEnabled?: boolean, comparisonEnabled?: boolean }> => {
    if (typeof window === 'undefined') return {}
    try {
      const existing = localStorage.getItem('km_courier_settings')
      return existing ? JSON.parse(existing) : {}
    } catch {
      return {}
    }
  },

  setCourierSettings: (settings: Record<string, { targetKmPerOrder?: number, kpiHudEnabled?: boolean, comparisonEnabled?: boolean }>): void => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem('km_courier_settings', JSON.stringify(settings))
    } catch (error) {
      console.error('Error saving courier settings:', error)
    }
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
        // Пробуем очистить старые данные (v23.0 Smart Headroom)
        try {
          const criticalKeys = ['google_maps_api_key', 'km_settings', 'km_courier_vehicle_map']
          const allKeys = Object.keys(localStorage)
          
          // v23.0: Only clear enough to make room, keep most recent data
          const kmKeys = allKeys.filter(k => k.startsWith('km_') && !criticalKeys.includes(k))
          
          let removedCount = 0;
          for (const k of kmKeys) {
            try {
              localStorage.removeItem(k)
              removedCount++;
              if (removedCount >= 15) break; // Enough headroom cleared
            } catch { }
          }
          
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
      


      const parsedSettings = settingsJson ? JSON.parse(settingsJson) : {}
      
      return {
        ...parsedSettings,
        // Overrides from individual keys (sources of truth)
        googleMapsApiKey: localStorage.getItem('google_maps_api_key') || parsedSettings.googleMapsApiKey || '',
        mapboxToken: localStorage.getItem('km_mapbox_token') || parsedSettings.mapboxToken || '',
        defaultStartAddress: localStorage.getItem('km_default_start_address') || parsedSettings.defaultStartAddress || '',
        defaultStartLat: localStorage.getItem('km_default_start_lat') ? parseFloat(localStorage.getItem('km_default_start_lat')!) : (parsedSettings.defaultStartLat || null),
        defaultStartLng: localStorage.getItem('km_default_start_lng') ? parseFloat(localStorage.getItem('km_default_start_lng')!) : (parsedSettings.defaultStartLng || null),
        defaultEndAddress: localStorage.getItem('km_default_end_address') || parsedSettings.defaultEndAddress || '',
        defaultEndLat: localStorage.getItem('km_default_end_lat') ? parseFloat(localStorage.getItem('km_default_end_lat')!) : (parsedSettings.defaultEndLat || null),
        defaultEndLng: localStorage.getItem('km_default_end_lng') ? parseFloat(localStorage.getItem('km_default_end_lng')!) : (parsedSettings.defaultEndLng || null),
        kmlData: localStorage.getItem('km_kml_data') ? JSON.parse(localStorage.getItem('km_kml_data')!) : (parsedSettings.kmlData || null),
        kmlSourceUrl: localStorage.getItem('km_kml_source_url') || parsedSettings.kmlSourceUrl || '',
        routingProvider: localStorage.getItem('km_routing_provider') || parsedSettings.routingProvider || 'turbo_instant',
        vehicleType: (localStorage.getItem('km_vehicle_type') as any) || parsedSettings.vehicleType || 'auto',
        geocodingProvider: localStorage.getItem('km_geocoding_provider') || parsedSettings.geocodingProvider || 'nominatim',
        fastopertorApiKey: localStorage.getItem('km_fastopertor_api_key') || parsedSettings.fastopertorApiKey || '',
        generouteApiKey: localStorage.getItem('km_generoute_api_key') || parsedSettings.generouteApiKey || '',
        geoapifyApiKey: localStorage.getItem('km_geoapify_api_key') || parsedSettings.geoapifyApiKey || '',
        mapStyle: localStorage.getItem('km_map_style') || parsedSettings.mapStyle || 'standard',
        courierVehicleMap: persistentMap,
        maxCriticalRouteDistanceKm: maxCriticalRouteDistanceKm ? parseFloat(maxCriticalRouteDistanceKm) : (parsedSettings.maxCriticalRouteDistanceKm || 120),
        selectedHubs: localStorage.getItem('km_selected_hubs') ? JSON.parse(localStorage.getItem('km_selected_hubs')!) : (parsedSettings.selectedHubs || []),
        selectedZones: localStorage.getItem('km_selected_zones') ? JSON.parse(localStorage.getItem('km_selected_zones')!) : (parsedSettings.selectedZones || []),
        distanceMatrixEnabled: localStorage.getItem('km_distance_matrix_enabled') !== 'false',
        distanceMatrixProvider: localStorage.getItem('km_distance_matrix_provider') || parsedSettings.distanceMatrixProvider || 'yapiko_osrm',
        yapikoOsrmUrl: localStorage.getItem('km_yapiko_osrm_url') || parsedSettings.yapikoOsrmUrl || ''
      }
    } catch (error) {
      console.error('Error reading settings:', error)
      return {
        googleMapsApiKey: localStorage.getItem('google_maps_api_key') || '',
        mapboxToken: localStorage.getItem('km_mapbox_token') || '',
        defaultStartAddress: localStorage.getItem('km_default_start_address') || '',
        defaultStartLat: localStorage.getItem('km_default_start_lat') ? parseFloat(localStorage.getItem('km_default_start_lat')!) : null,
        defaultStartLng: localStorage.getItem('km_default_start_lng') ? parseFloat(localStorage.getItem('km_default_start_lng')!) : null,
        defaultEndAddress: localStorage.getItem('km_default_end_address') || '',
        defaultEndLat: localStorage.getItem('km_default_end_lat') ? parseFloat(localStorage.getItem('km_default_end_lat')!) : null,
        defaultEndLng: localStorage.getItem('km_default_end_lng') ? parseFloat(localStorage.getItem('km_default_end_lng')!) : null,
        cityBias: localStorage.getItem('km_city_bias') || '',
        mapStyle: localStorage.getItem('km_map_style') || 'standard',
        courierVehicleMap: localStorageUtils.getCourierVehicleMap(),
        maxCriticalRouteDistanceKm: localStorage.getItem('km_max_critical_route_distance_km') ? parseFloat(localStorage.getItem('km_max_critical_route_distance_km')!) : 120,
        kmlData: localStorage.getItem('km_kml_data') ? JSON.parse(localStorage.getItem('km_kml_data')!) : null,
        kmlSourceUrl: localStorage.getItem('km_kml_source_url') || '',
        lastKmlSync: localStorage.getItem('km_last_kml_sync') || null,
        autoSyncKml: localStorage.getItem('km_auto_sync_kml') === 'true',
        fastopertorApiKey: localStorage.getItem('km_fastopertor_api_key') || '',
        fastopertorDepartmentId: localStorage.getItem('km_fastopertor_department_id') || '',
        routingProvider: localStorage.getItem('km_routing_provider') || 'turbo_instant',
        vehicleType: (localStorage.getItem('km_vehicle_type') as any) || 'auto',
        geocodingProvider: localStorage.getItem('km_geocoding_provider') || 'nominatim',
        generouteApiKey: localStorage.getItem('km_generoute_api_key') || '',
        geoapifyApiKey: localStorage.getItem('km_geoapify_api_key') || '',
        anomalyFilterEnabled: localStorage.getItem('km_anomaly_filter_enabled') !== 'false',
        anomalyMaxLegDistanceKm: localStorage.getItem('km_anomaly_max_leg_distance') ? parseFloat(localStorage.getItem('km_anomaly_max_leg_distance')!) : 10,
        anomalyMaxTotalDistanceKm: localStorage.getItem('km_anomaly_max_total_distance') ? parseFloat(localStorage.getItem('km_anomaly_max_total_distance')!) : 35,
        anomalyMaxAvgPerOrderKm: localStorage.getItem('km_anomaly_max_avg_per_order') ? parseFloat(localStorage.getItem('km_anomaly_max_avg_per_order')!) : 25,
        distanceMatrixEnabled: localStorage.getItem('km_distance_matrix_enabled') !== 'false',
        distanceMatrixProvider: localStorage.getItem('km_distance_matrix_provider') || 'yapiko_osrm',
        yapikoOsrmUrl: localStorage.getItem('km_yapiko_osrm_url') || ''
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
      if (settings.fastopertorDepartmentId !== undefined && settings.fastopertorDepartmentId !== null) {
        localStorage.setItem('km_fastopertor_department_id', settings.fastopertorDepartmentId.toString())
      }
      if (settings.routingProvider !== undefined) {
        localStorage.setItem('km_routing_provider', settings.routingProvider)
      }
      if (settings.geocodingProvider !== undefined) {
        localStorage.setItem('km_geocoding_provider', settings.geocodingProvider)
      }
      if (settings.vehicleType !== undefined) {
        localStorage.setItem('km_vehicle_type', settings.vehicleType)
      }
      if (settings.generouteApiKey !== undefined) {
        localStorage.setItem('km_generoute_api_key', settings.generouteApiKey)
      }
      if (settings.geoapifyApiKey !== undefined) {
        localStorage.setItem('km_geoapify_api_key', settings.geoapifyApiKey)
      }
      if (settings.yapikoOsrmUrl !== undefined) {
        localStorage.setItem('km_yapiko_osrm_url', settings.yapikoOsrmUrl)
      }
      if (settings.anomalyFilterEnabled !== undefined) {
        localStorage.setItem('km_anomaly_filter_enabled', settings.anomalyFilterEnabled ? 'true' : 'false')
      }
      if (settings.anomalyMaxLegDistanceKm !== undefined) {
        localStorage.setItem('km_anomaly_max_leg_distance', settings.anomalyMaxLegDistanceKm.toString())
      }
      if (settings.anomalyMaxTotalDistanceKm !== undefined) {
        localStorage.setItem('km_anomaly_max_total_distance', settings.anomalyMaxTotalDistanceKm.toString())
      }
      if (settings.anomalyMaxAvgPerOrderKm !== undefined) {
        localStorage.setItem('km_anomaly_max_avg_per_order', settings.anomalyMaxAvgPerOrderKm.toString())
      }
      if (settings.distanceMatrixEnabled !== undefined) {
        localStorage.setItem('km_dm_enabled', settings.distanceMatrixEnabled ? 'true' : 'false')
      }
      if (settings.distanceMatrixProvider !== undefined) {
        localStorage.setItem('km_dm_provider', settings.distanceMatrixProvider)
      }
      // Save courier vehicle map separately
      if (courierVehicleMap && typeof courierVehicleMap === 'object') {
        localStorageUtils.setCourierVehicleMap(courierVehicleMap)
      }
      if (settings.defaultStartLat !== undefined) {
        localStorage.setItem('km_default_start_lat', settings.defaultStartLat !== null ? settings.defaultStartLat.toString() : '')
      }
      if (settings.defaultStartLng !== undefined) {
        localStorage.setItem('km_default_start_lng', settings.defaultStartLng !== null ? settings.defaultStartLng.toString() : '')
      }
      if (settings.defaultEndLat !== undefined) {
        localStorage.setItem('km_default_end_lat', settings.defaultEndLat !== null ? settings.defaultEndLat.toString() : '')
      }
      if (settings.defaultEndLng !== undefined) {
        localStorage.setItem('km_default_end_lng', settings.defaultEndLng !== null ? settings.defaultEndLng.toString() : '')
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
      'km_fastopertor_department_id',
      'km_yapiko_osrm_url'
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
