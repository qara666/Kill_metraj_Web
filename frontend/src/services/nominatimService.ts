import { API_URL } from '../config/apiConfig'
/**
 * NominatimService — v2.0
 *
 * Improved OpenStreetMap/Nominatim Geocoding for Ukrainian addresses.
 *
 * Improvements:
 *  ✔ Proper location_type mapping (ROOFTOP / RANGE_INTERPOLATED / GEOMETRIC_CENTER)
 *  ✔ Ukrainian abbreviation normalization (вул. → вулиця, просп. → проспект)
 *  ✔ City-biased search (countrycodes + city in query)
 *  ✔ Rate limiting handled SERVER-SIDE (v36.9)
 *  ✔ Multiple query strategies: expanded + street-only fallback
 *  ✔ address_components compatible with RawGeoCandidate format
 */

// ─── Proxy fetch — v36.9: Rate limiting now handled entirely by server ────────
// Client throws immediately on 429 so RobustGeocodingService falls through to Geoapify
async function rateLimitedFetch(url: string): Promise<Response> {
    const proxyUrl = `${API_URL}/api/proxy/geocoding?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl, {
        headers: { 'Accept-Language': 'uk,ru,en' }
    });
    if (response.status === 429) {
        throw Object.assign(new Error('Nominatim 429'), { status: 429 });
    }
    return response;
}


const UA_ABBREV: Array<[string, string]> = [
    ['вул\\.', 'вулиця'],
    ['ул\\.', 'вулиця'],
    ['просп\\.', 'проспект'],
    ['пр-т\\.', 'проспект'],
    ['пр-т ', 'проспект '],
    ['бул\\.', 'бульвар'],
    ['пл\\.', 'площа'],
    ['пров\\.', 'провулок'],
    ['шос\\.', 'шосе'],
    ['наб\\.', 'набережна'],
]

function expandUkrAbbrev(address: string): string {
    let result = address
    for (const [abbrev, full] of UA_ABBREV) {
        result = result.replace(new RegExp(abbrev, 'gi'), `${full} `)
    }
    return result.replace(/\s+/g, ' ').trim()
}

// ─── Map OSM type to our location_type ───────────────────────────────────────
function mapLocationType(r: NominatimResult): 'ROOFTOP' | 'RANGE_INTERPOLATED' | 'GEOMETRIC_CENTER' | 'APPROXIMATE' {
    const { type, class: cls, address } = r
    // Has house number in address → strongly exact
    if (address?.house_number) return 'ROOFTOP'
    // Building/amenity types
    if (['house', 'apartments', 'residential', 'building', 'yes'].includes(type)) return 'ROOFTOP'
    if (cls === 'building') return 'ROOFTOP'
    // Street-level interpolation
    if (type === 'street' || type === 'road') return 'RANGE_INTERPOLATED'
    if (cls === 'highway') return 'RANGE_INTERPOLATED'
    // Neighborhood/district/city → geometric center
    return 'GEOMETRIC_CENTER'
}

// ─── Convert Nominatim result to RawGeoCandidate-compatible format ────────────
function toRawCandidate(r: NominatimResult): any {
    const locationType = mapLocationType(r)
    // Build address_components array compatible with Google Maps format
    const addressComponents: Array<{ types: string[]; long_name: string; short_name: string }> = []
    if (r.address?.house_number) {
        addressComponents.push({ types: ['street_number'], long_name: r.address.house_number, short_name: r.address.house_number })
    }
    if (r.address?.road) {
        addressComponents.push({ types: ['route'], long_name: r.address.road, short_name: r.address.road })
    }
    const city = r.address?.city || r.address?.town || ''
    if (city) {
        addressComponents.push({ types: ['locality'], long_name: city, short_name: city })
    }
    if (r.address?.postcode) {
        addressComponents.push({ types: ['postal_code'], long_name: r.address.postcode, short_name: r.address.postcode })
    }
    if (r.address?.country) {
        addressComponents.push({ types: ['country'], long_name: r.address.country, short_name: (r.address.country_code || '').toUpperCase() })
    }

    return {
        formatted_address: r.display_name,
        geometry: {
            location: {
                lat: parseFloat(r.lat),
                lng: parseFloat(r.lon),
            },
            location_type: locationType,
        },
        address_components: addressComponents,
        place_id: `nominatim_${r.place_id}`,
        types: [r.type],
        _source: 'nominatim',
    }
}

// ─── Types ────────────────────────────────────────────────────────────────────

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
        town?: string
        state?: string
        postcode?: string
        country?: string
        country_code?: string
    }
}

// ─── Service ──────────────────────────────────────────────────────────────────

import { getCityBounds } from './robust-geocoding/cityBounds'

export class NominatimService {
    private static readonly BASE_URL = 'https://nominatim.openstreetmap.org/search'
    private static readonly REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse'

    /**
     * Geocode an address with fallback strategies.
     * Returns results in a format compatible with RawGeoCandidate.
     */
    static async geocode(address: string, cityBias?: string): Promise<any[]> {
        const expanded = expandUkrAbbrev(address)
        const city = cityBias || 'Київ'
        
        const bounds = getCityBounds(city)
        // Nominatim expects left,top,right,bottom (west, north, east, south)
        let viewbox: string | undefined
        let bounded = false
        if (bounds) {
            const [south, west, north, east] = bounds.bbox
            viewbox = `${west},${north},${east},${south}`
            bounded = bounds.bounded
        }

        const lowerExpanded = expanded.toLowerCase()
        const hasCity = lowerExpanded.includes(city.toLowerCase()) || 
                      (city.toLowerCase() === 'київ' && lowerExpanded.includes('киев')) ||
                      (city.toLowerCase() === 'киев' && lowerExpanded.includes('київ'))
        const hasCountry = lowerExpanded.includes('україна') || lowerExpanded.includes('украина') || lowerExpanded.includes('ukraine')

        let query = expanded
        if (!hasCity) query = `${expanded}, ${city}`
        if (!hasCountry) {
            const country = (city === 'Киев' || city === 'Київ' || lowerExpanded.includes('киев') || lowerExpanded.includes('київ')) ? 'Україна' : 'Україна'
            query = `${query}, ${country}`
        }

        const results = await this._query(query, viewbox, bounded)
        if (results.length > 0) return results

        // Strategy 2: street-only (strip apartment/floor info)
        const streetOnly = expanded.split(',')[0].trim();
        if (streetOnly.length > 5 && streetOnly !== expanded) {
            const q2 = `${streetOnly}, ${city}, Україна`;
            const results2 = await this._query(q2, viewbox, bounded);
            if (results2.length > 0) return results2;
        }

        return []
    }

    /**
     * Internal query function with error handling.
     */
    private static async _query(q: string, viewbox?: string, bounded?: boolean): Promise<any[]> {
        try {
            const url = new URL(this.BASE_URL)
            url.searchParams.append('q', q)
            url.searchParams.append('format', 'jsonv2')
            url.searchParams.append('addressdetails', '1')
            url.searchParams.append('countrycodes', 'ua')
            url.searchParams.append('limit', '5')
            
            if (viewbox) {
                url.searchParams.append('viewbox', viewbox)
                if (bounded) {
                    url.searchParams.append('bounded', '1')
                }
            }

            const response = await rateLimitedFetch(url.toString())
            if (!response.ok) throw new Error(`Nominatim ${response.status}`)

            const items: NominatimResult[] = await response.json()
            return items
                .sort((a, b) => b.importance - a.importance)
                .map(toRawCandidate)
        } catch (error: any) {
            console.warn('[Геокодинг] Ошибка Nominatim:', error.message)
            throw error // Re-throw to allow Geoapify fallback in RobustGeocodingService
        }
    }

    /**
     * Reverse geocode lat/lng to address.
     */
    static async reverse(lat: number, lng: number): Promise<any | null> {
        try {
            const url = new URL(this.REVERSE_URL)
            url.searchParams.append('lat', String(lat))
            url.searchParams.append('lon', String(lng))
            url.searchParams.append('format', 'jsonv2')
            url.searchParams.append('addressdetails', '1')

            const response = await rateLimitedFetch(url.toString())
            if (!response.ok) throw new Error(`Nominatim reverse ${response.status}`)

            const r: NominatimResult = await response.json()
            return toRawCandidate(r)
        } catch (error) {
            console.error('[Геокодинг] Ошибка обратного геокодирования:', error)
            return null
        }
    }
}
