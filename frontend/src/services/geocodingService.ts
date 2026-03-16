/**
 * Сервис геокодирования через Google Maps API
 *
 * v2 COST OPTIMIZATIONS:
 *  - Routes ALL geocoding calls through persistent 30-day localStorage cache
 *  - In-flight deduplication: same address never fires twice simultaneously
 *  - Removed redundant in-memory cache (superseded by persistent cache)
 *  5. All results backed by persistent geocode cache (survives page reloads)
 */
import { NominatimService } from './nominatimService'
import { GeoapifyService } from './geoapifyService'
import { localStorageUtils } from '../utils/ui/localStorage'
import { robustGeocodingService, RobustGeocodeResult } from './robust-geocoding/RobustGeocodingService'

// Google Maps types
declare global {
  interface Window {
    google: any
  }
}

export interface GeocodingResult {
  success: boolean
  formattedAddress: string
  latitude?: number
  longitude?: number
  placeId?: string
  error?: string
  warnings?: string[]
  locationType?: string
  types?: string[]
  _source?: string
}

export interface GeocodingOptions {
  region?: string
  language?: string
  bounds?: any
  componentRestrictions?: any
  provider?: 'google' | 'nominatim'
}

export class GeocodingService {
  /**
   * Get the current geocoding provider from settings
   */
  private static getProvider(): 'google' | 'nominatim' | 'geoapify' {
    const settings = localStorageUtils.getAllSettings()
    // Align with user's preference for free-first
    return settings.geocodingProvider || 'nominatim'
  }

  static isReady(): boolean {
    const provider = this.getProvider()
    if (provider === 'nominatim' || provider === 'geoapify') return true
    return (typeof window !== 'undefined' && !!window.google?.maps?.Geocoder)
  }

  /**
   * Map raw Google Geocoder results to GeocodingResult[]
   */

  /**
   * Geocode an address — returns multiple candidates.
   */
  static async geocodeAddressMulti(
    address: string,
    options: GeocodingOptions = {}
  ): Promise<GeocodingResult[]> {
    const provider = options.provider || this.getProvider()

    // ─── Free Providers (Non-Google) ───
    if (provider === 'nominatim') {
      return NominatimService.geocode(address, options.region || 'ua')
    }

    if (provider === 'geoapify') {
      return GeoapifyService.geocode(address)
    }

    // ─── Google Provider (via Robust engine) ───
    try {
      const res = await robustGeocodingService.geocode(address, {
        cityBias: options.region === 'ua' ? 'Киев' : options.region,
        hintPoint: options.bounds?.getCenter ? (() => {
          const center = options.bounds.getCenter()
          return {
            lat: typeof center.lat === 'function' ? center.lat() : center.lat,
            lng: typeof center.lng === 'function' ? center.lng() : center.lng
          }
        })() : undefined

      })

      return res.allCandidates.map((c: any) => ({
        success: true,
        formattedAddress: c.raw.formatted_address,
        latitude: c.lat,
        longitude: c.lng,
        placeId: c.raw.place_id,
        locationType: c.raw.geometry.location_type,
        types: c.raw.types,
        warnings: c.isTechnicalZone ? ['Адрес находится в технической зоне'] : []
      }))
    } catch {
      return [{ success: false, formattedAddress: address, error: 'Ошибка геокодирования' }]
    }
  }

  static async geocodeAddress(address: string, options: GeocodingOptions = {}): Promise<GeocodingResult> {
    // For ALL providers, we now prefer routing through robustGeocodingService 
    // because it handles variants, zones, and technical fallbacks.
    const res = await robustGeocodingService.geocode(address, {
      cityBias: options.region === 'ua' ? 'Київ' : (options.region || undefined),
    })
    
    if (!res.best) return { success: false, formattedAddress: address, error: 'Адрес не найден или вне зон' }

    return {
      success: true,
      formattedAddress: res.best.raw.formatted_address,
      latitude: res.best.lat,
      longitude: res.best.lng,
      placeId: res.best.raw.place_id,
      locationType: res.best.raw.geometry.location_type,
      types: res.best.raw.types,
      warnings: res.best.isTechnicalZone ? ['Адрес находится в технической зоне'] : []
    }
  }

  /**
   * Geocode with geographic context (bounds bias toward existing orders).
   */
  static async geocodeWithContext(
    address: string,
    contextCoords: { lat: number; lng: number }[],
    options: GeocodingOptions = {}
  ): Promise<GeocodingResult> {
    if (contextCoords.length > 0) {
      // Calculate a simple hint center instead of a Google Bounds object
      let sumLat = 0, sumLng = 0
      contextCoords.forEach(c => { sumLat += c.lat; sumLng += c.lng })
      options.bounds = { 
        getCenter: () => ({ lat: sumLat / contextCoords.length, lng: sumLng / contextCoords.length }) 
      }
    }
    return this.geocodeAndCleanAddress(address, options)
  }

  /**
   * Reverse geocode (coords → address).
   */
  static async reverseGeocode(lat: number, lng: number, options: GeocodingOptions = {}): Promise<GeocodingResult> {
    const provider = options.provider || this.getProvider()

    if (provider === 'nominatim') {
      const result = await NominatimService.reverse(lat, lng)
      return result || { success: false, formattedAddress: '', error: 'Адрес не найден' }
    }

    if (provider === 'geoapify') {
      const result = await GeoapifyService.reverse(lat, lng)
      return result || { success: false, formattedAddress: '', error: 'Адрес не найден' }
    }

    // Google Provider (via Robust engine)
    try {
      const res = await robustGeocodingService.reverseGeocode(lat, lng)
      if (!res) return { success: false, formattedAddress: '', error: 'Адрес не найден' }

      return {
        success: true,
        formattedAddress: res.formattedAddress,
        latitude: lat,
        longitude: lng,
        // Optional: attach zone info to result if needed
      }
    } catch {
      return { success: false, formattedAddress: '', error: 'Ошибка геокодирования' }
    }
  }

  /**
   * Geocode with automatic address cleaning.
   */
  static async geocodeAndCleanAddress(address: string, options: GeocodingOptions = {}): Promise<GeocodingResult> {
    // First attempt: original address
    let result = await this.geocodeAddress(address, options)

    const isRegionCenter = result.success && (
      (result.locationType === 'APPROXIMATE' || result.locationType === 'GEOMETRIC_CENTER') &&
      result.types?.includes('administrative_area_level_1')
    )

    if (result.success && !isRegionCenter) return result

    // Second attempt: cleaned address using our robust utility
    const { cleanAddressForSearch } = await import('../utils/address/addressNormalization')
    const cleanedAddress = cleanAddressForSearch(address)

    if (cleanedAddress !== address && cleanedAddress.length > 3) {
      console.log(`[GeocodingService] Retrying with cleaned address: "${cleanedAddress}" (orig: "${address}")`)
      result = await this.geocodeAddress(cleanedAddress, options)
      if (result.success) result.warnings = [...(result.warnings || []), 'Адрес был автоматически очищен для поиска']
    }

    return result
  }

  /**
   * Batch geocode addresses using the RobustGeocodingService.
   */
  static async geocodeAddresses(
    addresses: string[],
    options: any = {}
  ): Promise<GeocodingResult[]> {
    const resultsMap = await robustGeocodingService.batchGeocode(addresses, options)
    
    return addresses.map(addr => {
      const res = resultsMap.get(addr.trim().toLowerCase())
      if (!res || !res.best) {
        return { success: false, formattedAddress: addr, error: 'Адрес не найден' }
      }
      return {
        success: true,
        formattedAddress: res.best.raw.formatted_address,
        latitude: res.best.lat,
        longitude: res.best.lng,
        placeId: res.best.raw.place_id,
        locationType: res.best.raw.geometry.location_type,
        types: res.best.raw.types
      }
    })
  }

  /**
   * New zone-aware geocoding method.
   */
  static async geocodeWithZones(address: string, options: any = {}): Promise<RobustGeocodeResult> {
    return robustGeocodingService.geocode(address, options)
  }

  // Legacy no-ops (kept for API compatibility)
  static clearCache(): void { /* Removed Google Cache */ }
  static getCacheSize(): number { return 0 }
  static initialize(): void { }
}
