/**
 * Service for Nominatim (OpenStreetMap) Geocoding API
 * Docs: https://nominatim.org/release-docs/latest/api/Search/
 */

export interface NominatimResult {
    place_id: number
    licence: string
    osm_type: string
    osm_id: number
    boundingbox: string[]
    lat: string
    lon: string
    display_name: string
    class: string
    type: string
    importance: number
    address?: {
        house_number?: string
        road?: string
        city?: string
        state?: string
        postcode?: string
        country?: string
    }
}

export class NominatimService {
    private static readonly BASE_URL = 'https://nominatim.openstreetmap.org/search'
    private static readonly REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse'
    private static readonly USER_AGENT = 'KillMetraj_App/1.0' // Nominatim requires a User-Agent

    /**
     * Geocode an address
     */
    static async geocode(address: string, region: string = 'ua'): Promise<any[]> {
        try {
            const url = new URL(this.BASE_URL)
            url.searchParams.append('q', address)
            url.searchParams.append('format', 'json')
            url.searchParams.append('addressdetails', '1')
            url.searchParams.append('countrycodes', region)
            url.searchParams.append('limit', '5')

            const response = await fetch(url.toString(), {
                headers: {
                    'Accept-Language': 'ru,uk,en',
                    'User-Agent': this.USER_AGENT
                }
            })

            if (!response.ok) {
                throw new Error(`Nominatim error: ${response.status}`)
            }

            const results: NominatimResult[] = await response.json()

            // Map to a format consistent with our GeocodingResult
            return results.map(r => ({
                success: true,
                formattedAddress: r.display_name,
                latitude: parseFloat(r.lat),
                longitude: parseFloat(r.lon),
                placeId: String(r.place_id),
                locationType: r.importance > 0.6 ? 'ROOFTOP' : 'APPROXIMATE',
                types: [r.type],
                raw: r
            }))
        } catch (error) {
            console.error('Nominatim geocode failed:', error)
            return []
        }
    }

    /**
     * Reverse geocode
     */
    static async reverse(lat: number, lng: number): Promise<any | null> {
        try {
            const url = new URL(this.REVERSE_URL)
            url.searchParams.append('lat', String(lat))
            url.searchParams.append('lon', String(lng))
            url.searchParams.append('format', 'json')
            url.searchParams.append('addressdetails', '1')

            const response = await fetch(url.toString(), {
                headers: {
                    'Accept-Language': 'ru,uk,en',
                    'User-Agent': this.USER_AGENT
                }
            })

            if (!response.ok) {
                throw new Error(`Nominatim error: ${response.status}`)
            }

            const r = await response.json()

            return {
                success: true,
                formattedAddress: r.display_name,
                latitude: parseFloat(r.lat),
                longitude: parseFloat(r.lon),
                placeId: String(r.place_id),
                locationType: 'ROOFTOP',
                types: [r.type],
                raw: r
            }
        } catch (error) {
            console.error('Nominatim reverse failed:', error)
            return null
        }
    }
}
