/**
 * Сервис геокодирования через Google Maps API
 *
 * v2 COST OPTIMIZATIONS:
 *  - Routes ALL geocoding calls through googleApiCache (persistent 30-day localStorage cache)
 *  - In-flight deduplication: same address never fires twice simultaneously
 *  - Removed redundant in-memory cache (superseded by googleApiCache persistence)
 */
import { googleApiCache } from './googleApiCache'
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
    return settings.geocodingProvider || 'google'
  }

  static isReady(): boolean {
    const provider = this.getProvider()
    if (provider === 'nominatim' || provider === 'geoapify') return true
    return (typeof window !== 'undefined' && !!window.google?.maps?.Geocoder)
  }

  /**
   * Map raw Google Geocoder results to GeocodingResult[]
   */
  private static mapGoogleResults(results: any[], address: string): GeocodingResult[] {
    if (!results || results.length === 0) {
      return [{ success: false, formattedAddress: address, error: 'Адрес не найден' }]
    }
    return results.map((result: any) => {
      const lat = typeof result.geometry.location.lat === 'function'
        ? result.geometry.location.lat()
        : result.geometry.location.lat
      const lng = typeof result.geometry.location.lng === 'function'
        ? result.geometry.location.lng()
        : result.geometry.location.lng
      const geo: GeocodingResult = {
        success: true,
        formattedAddress: result.formatted_address,
        latitude: lat,
        longitude: lng,
        placeId: result.place_id,
        locationType: result.geometry.location_type,
        types: result.types,
        warnings: []
      }
      if (result.geometry.location_type === 'APPROXIMATE') geo.warnings?.push('Адрес найден приблизительно')
      if (result.geometry.location_type === 'GEOMETRIC_CENTER') geo.warnings?.push('Адрес найден как геометрический центр')
      return geo
    })
  }

  /**
   * Geocode an address — returns multiple candidates.
   */
  static async geocodeAddressMulti(
    address: string,
    options: GeocodingOptions = {}
  ): Promise<GeocodingResult[]> {
    const provider = options.provider || this.getProvider()

    if (provider === 'nominatim') {
      return NominatimService.geocode(address, options.region || 'ua')
    }

    if (provider === 'geoapify') {
      return GeoapifyService.geocode(address)
    }

    // Google Provider
    try {
      const req: any = { address, region: options.region || 'ua' }
      if (options.componentRestrictions) req.componentRestrictions = options.componentRestrictions

      // Convert plain bounds object to LatLngBounds if needed
      if (options.bounds && typeof window !== 'undefined' && (window as any).google?.maps) {
        if (options.bounds instanceof (window as any).google.maps.LatLngBounds) {
          req.bounds = options.bounds
        } else {
          try {
            const b = options.bounds
            req.bounds = new (window as any).google.maps.LatLngBounds(
              new (window as any).google.maps.LatLng(b.south, b.west),
              new (window as any).google.maps.LatLng(b.north, b.east)
            )
          } catch { }
        }
      }

      const results = await googleApiCache.geocode(req)
      return this.mapGoogleResults(results, address)
    } catch {
      return [{ success: false, formattedAddress: address, error: 'Ошибка геокодирования' }]
    }
  }

  /**
   * Geocode an address — returns best result.
   */
  static async geocodeAddress(address: string, options: GeocodingOptions = {}): Promise<GeocodingResult> {
    const results = await this.geocodeAddressMulti(address, options)
    return results[0]
  }

  /**
   * Geocode with geographic context (bounds bias toward existing orders).
   */
  static async geocodeWithContext(
    address: string,
    contextCoords: { lat: number; lng: number }[],
    options: GeocodingOptions = {}
  ): Promise<GeocodingResult> {
    if (contextCoords.length > 0 && typeof window !== 'undefined' && (window as any).google?.maps) {
      try {
        const bounds = new (window as any).google.maps.LatLngBounds()
        contextCoords.forEach(c => bounds.extend(new (window as any).google.maps.LatLng(c.lat, c.lng)))
        options.bounds = bounds
      } catch { }
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

    // Google Provider
    try {
      const results = await googleApiCache.geocode({ location: { lat, lng } })
      if (!results || results.length === 0) {
        return { success: false, formattedAddress: '', error: 'Адрес не найден' }
      }
      const result = results[0]
      const resLat = typeof result.geometry.location.lat === 'function' ? result.geometry.location.lat() : result.geometry.location.lat
      const resLng = typeof result.geometry.location.lng === 'function' ? result.geometry.location.lng() : result.geometry.location.lng
      return {
        success: true,
        formattedAddress: result.formatted_address,
        latitude: resLat,
        longitude: resLng,
        placeId: result.place_id,
        locationType: result.geometry.location_type,
        types: result.types
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

    // Second attempt: cleaned address
    let cleanedAddress = address
      .replace(/(?:,|\s)\s*(?:под\.?|подъезд|д\/ф|эт\.?|этаж|под|кв\.?|квартира|оф\.?|офис|вход|дом|корп|секция|литера).*$/i, '')
      .replace(/\b\d{5}\b/g, '')
      .replace(/киевская область|kyiv oblast|kiev oblast/gi, '')
      .replace(/,\s*,/g, ',').replace(/,$/, '')
      .trim()

    const hasKyiv = /киев|kyiv|kiev/i.test(cleanedAddress)
    const hasSatelliteCity = /вишневое|vishneve|вышгород|vyshhorod|ирпень|irpin|буча|bucha|бровары|brovary/i.test(cleanedAddress)

    if (!hasKyiv && !hasSatelliteCity) cleanedAddress += ', Киев, Украина'
    else if (!/украина|ukraine|україна/i.test(cleanedAddress)) cleanedAddress += ', Украина'

    if (cleanedAddress !== address) {
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
  static clearCache(): void { googleApiCache.clearGeocodeCache() }
  static getCacheSize(): number { return googleApiCache.getStats().geocode }
  static initialize(): void { }
}
