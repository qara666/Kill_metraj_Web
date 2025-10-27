// LocalStorage utilities for persisting application settings

export interface AppSettings {
  googleMapsApiKey: string
  defaultStartAddress: string
  defaultEndAddress: string
}

const STORAGE_KEYS = {
  GOOGLE_MAPS_API_KEY: 'googleMapsApiKey',
  DEFAULT_START_ADDRESS: 'defaultStartAddress',
  DEFAULT_END_ADDRESS: 'defaultEndAddress'
} as const

export const localStorageUtils = {
  // Get Google Maps API key
  getApiKey: (): string => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem(STORAGE_KEYS.GOOGLE_MAPS_API_KEY) || ''
  },

  // Set Google Maps API key
  setApiKey: (apiKey: string): void => {
    if (typeof window === 'undefined') return
    localStorage.setItem(STORAGE_KEYS.GOOGLE_MAPS_API_KEY, apiKey)
  },

  // Get default start address
  getDefaultStartAddress: (): string => {
    if (typeof window === 'undefined') return 'Макіївська 7, Київ, Україна'
    return localStorage.getItem(STORAGE_KEYS.DEFAULT_START_ADDRESS) || 'Макіївська 7, Київ, Україна'
  },

  // Set default start address
  setDefaultStartAddress: (address: string): void => {
    if (typeof window === 'undefined') return
    localStorage.setItem(STORAGE_KEYS.DEFAULT_START_ADDRESS, address)
  },

  // Get default end address
  getDefaultEndAddress: (): string => {
    if (typeof window === 'undefined') return 'Макіївська 7, Київ, Україна'
    return localStorage.getItem(STORAGE_KEYS.DEFAULT_END_ADDRESS) || 'Макіївська 7, Київ, Україна'
  },

  // Set default end address
  setDefaultEndAddress: (address: string): void => {
    if (typeof window === 'undefined') return
    localStorage.setItem(STORAGE_KEYS.DEFAULT_END_ADDRESS, address)
  },

  // Get all settings
  getAllSettings: (): AppSettings => {
    return {
      googleMapsApiKey: localStorageUtils.getApiKey(),
      defaultStartAddress: localStorageUtils.getDefaultStartAddress(),
      defaultEndAddress: localStorageUtils.getDefaultEndAddress()
    }
  },

  // Set all settings
  setAllSettings: (settings: Partial<AppSettings>): void => {
    if (typeof window === 'undefined') return
    
    if (settings.googleMapsApiKey !== undefined) {
      localStorageUtils.setApiKey(settings.googleMapsApiKey)
    }
    if (settings.defaultStartAddress !== undefined) {
      localStorageUtils.setDefaultStartAddress(settings.defaultStartAddress)
    }
    if (settings.defaultEndAddress !== undefined) {
      localStorageUtils.setDefaultEndAddress(settings.defaultEndAddress)
    }
  },

  // Clear all settings
  clearAllSettings: (): void => {
    if (typeof window === 'undefined') return
    
    localStorage.removeItem(STORAGE_KEYS.GOOGLE_MAPS_API_KEY)
    localStorage.removeItem(STORAGE_KEYS.DEFAULT_START_ADDRESS)
    localStorage.removeItem(STORAGE_KEYS.DEFAULT_END_ADDRESS)
  },

  // Check if API key exists
  hasApiKey: (): boolean => {
    return localStorageUtils.getApiKey().trim() !== ''
  }
}

export default localStorageUtils



