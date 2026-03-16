import { API_URL } from '../config/apiConfig'

/**
 * GeoapifyService — Secondary Geocoding Provider
 * Highly reliable for outskirts and fuzzy queries.
 */

const GEOAPIFY_KEY = 'e57726487e4d41e7807a00508007a6ec' // FREE key shared across apps

export class GeoapifyService {
    static async geocode(address: string, cityBias?: string): Promise<any[]> {
        try {
            const query = cityBias ? `${address}, ${cityBias}, Ukraine` : `${address}, Ukraine`
            const url = new URL('https://api.geoapify.com/v1/geocode/search')
            url.searchParams.append('text', query)
            url.searchParams.append('apiKey', GEOAPIFY_KEY)
            url.searchParams.append('limit', '5')
            url.searchParams.append('lang', 'uk')

            const proxyUrl = `${API_URL}/api/proxy/geocoding?url=${encodeURIComponent(url.toString())}`
            
            const response = await fetch(proxyUrl)
            if (!response.ok) throw new Error(`Geoapify status: ${response.status}`)

            const data = await response.json()
            const features = data.features || []

            return features.map((f: any) => {
                const props = f.properties || {}
                const geom = f.geometry || {}
                
                const components: any[] = []
                if (props.housenumber) components.push({ long_name: props.housenumber, short_name: props.housenumber, types: ['street_number'] })
                if (props.street) components.push({ long_name: props.street, short_name: props.street, types: ['route'] })
                if (props.city) components.push({ long_name: props.city, short_name: props.city, types: ['locality'] })

                return {
                    formatted_address: props.formatted || '',
                    geometry: {
                        location: {
                            lat: geom.coordinates[1],
                            lng: geom.coordinates[0]
                        },
                        location_type: props.housenumber ? 'ROOFTOP' : 'RANGE_INTERPOLATED'
                    },
                    address_components: components,
                    place_id: `geoapify_${props.place_id}`,
                    types: [props.result_type],
                    _source: 'geoapify'
                }
            })
        } catch (error: any) {
            console.warn('[Geoapify] failed:', error.message)
            return []
        }
    }

    static async reverse(lat: number, lng: number): Promise<any> {
        try {
            const url = new URL('https://api.geoapify.com/v1/geocode/reverse')
            url.searchParams.append('lat', lat.toString())
            url.searchParams.append('lon', lng.toString())
            url.searchParams.append('apiKey', GEOAPIFY_KEY)

            const proxyUrl = `${API_URL}/api/proxy/geocoding?url=${encodeURIComponent(url.toString())}`
            const response = await fetch(proxyUrl)
            if (!response.ok) return null

            const data = await response.json()
            const feature = data.features?.[0]
            if (!feature) return null

            const props = feature.properties
            return {
                success: true,
                formattedAddress: props.formatted || '',
                latitude: lat,
                longitude: lng
            }
        } catch {
            return null
        }
    }
}
