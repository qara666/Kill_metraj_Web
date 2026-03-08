/**
 * Service for Geoapify Geocoding API
 * Docs: https://www.geoapify.com/geocoding-api
 */
import { localStorageUtils } from '../utils/ui/localStorage'

export class GeoapifyService {
    private static getApiKey(): string {
        const settings = localStorageUtils.getAllSettings()
        return settings.geoapifyApiKey || ''
    }

    /**
     * Geocode an address
     */
    static async geocode(address: string): Promise<any[]> {
        const apiKey = this.getApiKey()
        if (!apiKey) {
            console.warn('Geoapify API Key not set')
            return []
        }

        try {
            const url = new URL('https://api.geoapify.com/v1/geocode/search')
            url.searchParams.append('text', address)
            url.searchParams.append('apiKey', apiKey)
            url.searchParams.append('limit', '5')
            url.searchParams.append('format', 'json')

            const response = await fetch(url.toString())
            if (!response.ok) {
                throw new Error(`Geoapify error: ${response.status}`)
            }

            const data = await response.json()
            const results = data.results || []

            return results.map((r: any) => ({
                success: true,
                formattedAddress: r.formatted,
                latitude: r.lat,
                longitude: r.lon,
                placeId: r.place_id,
                locationType: r.rank?.confidence > 0.9 ? 'ROOFTOP' : 'APPROXIMATE',
                types: [r.result_type],
                raw: r
            }))
        } catch (error) {
            console.error('Geoapify geocode failed:', error)
            return []
        }
    }

    /**
     * Reverse geocode
     */
    static async reverse(lat: number, lng: number): Promise<any | null> {
        const apiKey = this.getApiKey()
        if (!apiKey) return null

        try {
            const url = new URL('https://api.geoapify.com/v1/geocode/reverse')
            url.searchParams.append('lat', String(lat))
            url.searchParams.append('lon', String(lng))
            url.searchParams.append('apiKey', apiKey)
            url.searchParams.append('format', 'json')

            const response = await fetch(url.toString())
            if (!response.ok) {
                throw new Error(`Geoapify error: ${response.status}`)
            }

            const data = await response.json()
            const r = data.results?.[0]
            if (!r) return null

            return {
                success: true,
                formattedAddress: r.formatted,
                latitude: r.lat,
                longitude: r.lon,
                placeId: r.place_id,
                locationType: 'ROOFTOP',
                types: [r.result_type],
                raw: r
            }
        } catch (error) {
            console.error('Geoapify reverse failed:', error)
            return null
        }
    }
}
