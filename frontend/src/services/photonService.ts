import { API_URL } from '../config/apiConfig'
/**
 * PhotonService — High-speed OSM Geocoding
 * Uses photon.komoot.io for instant geocoding without strict rate limits.
 */

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
function mapLocationType(r: any): 'ROOFTOP' | 'RANGE_INTERPOLATED' | 'GEOMETRIC_CENTER' | 'APPROXIMATE' {
    const props = r.properties || {}
    if (props.housenumber) return 'ROOFTOP'
    if (['house', 'apartments', 'residential', 'building'].includes(props.osm_value)) return 'ROOFTOP'
    if (['street', 'road', 'highway'].includes(props.osm_key) || ['street', 'road', 'highway'].includes(props.osm_value)) return 'RANGE_INTERPOLATED'
    return 'GEOMETRIC_CENTER'
}

// ─── Convert Photon result to RawGeoCandidate-compatible format ────────────
function toRawCandidate(r: any): any {
    const locationType = mapLocationType(r)
    const props = r.properties || {}
    
    const addressComponents: Array<{ types: string[]; long_name: string; short_name: string }> = []
    
    if (props.housenumber) {
        addressComponents.push({ types: ['street_number'], long_name: props.housenumber, short_name: props.housenumber })
    }
    if (props.street || props.name) {
        const road = props.street || props.name
        addressComponents.push({ types: ['route'], long_name: road, short_name: road })
    }
    const city = props.city || props.town || ''
    if (city) {
        addressComponents.push({ types: ['locality'], long_name: city, short_name: city })
    }
    if (props.postcode) {
        addressComponents.push({ types: ['postal_code'], long_name: props.postcode, short_name: props.postcode })
    }
    if (props.country) {
        addressComponents.push({ types: ['country'], long_name: props.country, short_name: props.countrycode || '' })
    }
    
    // Construct a formatted address
    const parts = [props.street || props.name, props.housenumber, city, props.country].filter(Boolean)
    const formattedAddress = parts.join(', ')

    return {
        formatted_address: formattedAddress,
        geometry: {
            location: {
                lat: r.geometry.coordinates[1],
                lng: r.geometry.coordinates[0],
            },
            location_type: locationType,
        },
        address_components: addressComponents,
        place_id: `photon_${props.osm_id}`,
        types: [props.osm_value || props.osm_key],
        _source: 'photon',
    }
}

import { getCityBounds } from './robust-geocoding/cityBounds'

export class PhotonService {
    private static readonly BASE_URL = 'https://photon.komoot.io/api/'

    static async geocode(address: string, cityBias?: string): Promise<any[]> {
        const expanded = expandUkrAbbrev(address)
        const city = cityBias || 'Київ'
        
        const bounds = getCityBounds(city)
        const bboxParams = bounds 
            ? `${bounds.bbox[1]},${bounds.bbox[0]},${bounds.bbox[3]},${bounds.bbox[2]}` 
            : '22.13,44.38,40.22,52.37'; // Fallback to Ukraine (roughly)
        
        // Strategy: clean the address and ensure city/country are present but not duplicated
        const lowerExpanded = expanded.toLowerCase()
        const cityLower = city.toLowerCase()
        
        const hasCity = lowerExpanded.includes(cityLower) || 
                      (cityLower === 'київ' && lowerExpanded.includes('киев')) ||
                      (cityLower === 'киев' && lowerExpanded.includes('київ'))
        const hasCountry = lowerExpanded.includes('україна') || lowerExpanded.includes('украина') || lowerExpanded.includes('ukraine')

        let query = expanded
        if (!hasCity) query = `${expanded}, ${city}`
        if (!hasCountry) {
            const country = (city === 'Киев' || city === 'Київ' || lowerExpanded.includes('киев') || lowerExpanded.includes('київ')) ? 'Україна' : 'Україна'
            query = `${query}, ${country}`
        }

        const results = await this._query(query, bboxParams, bounds?.center)
        if (results.length > 0) return results

        // If no results, try stripping everything but the street and house if it was very long
        if (expanded.split(',').length > 2) {
             const base = expanded.split(',')[0].trim()
             const results2 = await this._query(`${base}, ${city}`, bboxParams, bounds?.center)
             if (results2.length > 0) return results2
        }

        return []
    }

    private static async _query(q: string, bboxParams: string, locationBias?: [number, number]): Promise<any[]> {
        try {
            const url = new URL(this.BASE_URL)
            url.searchParams.append('q', q)
            url.searchParams.append('limit', '5')
            url.searchParams.append('bbox', bboxParams)

            // Add location bias (center of the city) to prioritize center over outskirts if multiple matches
            if (locationBias) {
                // Photon location bias: lon, lat
                url.searchParams.append('lon', locationBias[0].toString())
                url.searchParams.append('lat', locationBias[1].toString())
            }

            const proxyUrl = `${API_URL}/api/proxy/geocoding?url=${encodeURIComponent(url.toString())}`;
            
            const response = await fetch(proxyUrl, {
                headers: {
                    'Accept-Language': 'uk,ru,en'
                }
            })
            
            if (!response.ok) throw new Error(`Photon ${response.status}`)

            const data = await response.json()
            const items = data.features || []
            return items.map(toRawCandidate)
        } catch (error: any) {
             console.warn('[Photon] query failed:', error.message)
             throw error // Re-throw to allow Nominatim fallback
        }
    }
}
