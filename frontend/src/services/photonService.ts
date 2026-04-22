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
    ['пр\\.', 'проспект'],
    ['бул\\.', 'бульвар'],
    ['пл\\.', 'площа'],
    ['пров\\.', 'провулок'],
    ['пер\\.', 'провулок'],
    ['шос\\.', 'шосе'],
    ['наб\\.', 'набережна'],
    ['м-н', 'майдан'],
    ['ал\\.', 'алея'],
    ['узв\\.', 'узвіз'],
]

// City-specific normalizations for all major Ukrainian cities
const CITY_SPECIFIC: Record<string, Array<[RegExp, string]>> = {
    'харків': [
        [/\bм\s+Героїв\s+Харкова\b/gi, 'майдан Героїв Харкова'],
        [/\bм\s+Героев\s+Харькова\b/gi, 'майдан Героїв Харкова'],
        [/\bпл\s+Свободи\b/gi, 'майдан Свободи'],
        [/\bпл\s+Свободы\b/gi, 'майдан Свободи'],
        [/\bСумська\b/gi, 'Сумська'],
        [/\bСумская\b/gi, 'Сумська'],
        [/\bПолтавський\s+Шлях\b/gi, 'Полтавський Шлях'],
        [/\bПолтавский\s+Шлях\b/gi, 'Полтавський Шлях'],
        [/\bГероїв\s+Праці\b/gi, 'Героїв Праці'],
        [/\bГероев\s+Труда\b/gi, 'Героїв Праці'],
        [/\bМосковський\s+просп\b/gi, 'проспект Героїв Харкова'],
        [/\bМосковский\s+просп\b/gi, 'проспект Героїв Харкова'],
    ],
    'одеса': [
        [/\bДерибасівська\b/gi, 'Дерибасівська'],
        [/\bДерибасовская\b/gi, 'Дерибасівська'],
        [/\bДерибаївська\b/gi, 'Дерибасівська'],
        [/\bГрецька\b/gi, 'Грецька'],
        [/\bГреческая\b/gi, 'Грецька'],
        [/\bРішельєвська\b/gi, 'Рішельєвська'],
        [/\bРишельевская\b/gi, 'Рішельєвська'],
        [/\bПреображенська\b/gi, 'Преображенська'],
        [/\bПреображенская\b/gi, 'Преображенська'],
        [/\bКанатна\b/gi, 'Канатна'],
        [/\bКанатная\b/gi, 'Канатна'],
        [/\bФранцузький\s+бул\b/gi, 'Французький бульвар'],
        [/\bФранцузский\s+бул\b/gi, 'Французький бульвар'],
        [/\bпросп\s+Шевченка\b/gi, 'проспект Шевченка'],
        [/\bпросп\s+Шевченко\b/gi, 'проспект Шевченка'],
        [/\bпросп\s+Добровольського\b/gi, 'проспект Добровольського'],
        [/\bпросп\s+Добровольского\b/gi, 'проспект Добровольського'],
    ],
    'дніпро': [
        [/\bпросп\s+Дмитра\s+Яворницького\b/gi, 'проспект Дмитра Яворницького'],
        [/\bпросп\s+Дмитрия\s+Яворницкого\b/gi, 'проспект Дмитра Яворницького'],
        [/\bпр\s+Яворницького\b/gi, 'проспект Дмитра Яворницького'],
        [/\bпр\s+Яворницкого\b/gi, 'проспект Дмитра Яворницького'],
        [/\bпр\s+Карла\s+Маркса\b/gi, 'проспект Дмитра Яворницького'],
        [/\bпр\s+Карла\s+Маркса\b/gi, 'проспект Дмитра Яворницького'],
        [/\bНабережна\s+Перемоги\b/gi, 'набережна Перемоги'],
        [/\bНабережная\s+Победы\b/gi, 'набережна Перемоги'],
        [/\bНабережна\s+Заводська\b/gi, 'набережна Заводська'],
        [/\bНабережная\s+Заводская\b/gi, 'набережна Заводська'],
        [/\bвул\s+Січеславська\b/gi, 'вулиця Січеславська'],
        [/\bвул\s+Сичеславская\b/gi, 'вулиця Січеславська'],
        [/\bвул\s+Володимира\s+Мономаха\b/gi, 'вулиця Володимира Мономаха'],
        [/\bвул\s+Владимира\s+Мономаха\b/gi, 'вулиця Володимира Мономаха'],
        [/\bвул\s+Князя\s+Володимира\s+Великого\b/gi, 'вулиця Князя Володимира Великого'],
        [/\bвул\s+Князя\s+Владимира\s+Великого\b/gi, 'вулиця Князя Володимира Великого'],
        [/\bвул\s+Академіка\s+Лазаряна\b/gi, 'вулиця Академіка Лазаряна'],
        [/\bвул\s+Академика\s+Лазаряна\b/gi, 'вулиця Академіка Лазаряна'],
        [/\bвул\s+Святого\s+Андрія\b/gi, 'вулиця Святого Андрія'],
        [/\bвул\s+Святого\s+Андрея\b/gi, 'вулиця Святого Андрія'],
    ],
    'полтава': [
        [/\bвул\s+Європейська\b/gi, 'вулиця Європейська'],
        [/\bвул\s+Европейская\b/gi, 'вулиця Європейська'],
        [/\bКругова\b/gi, 'Кругова'],
        [/\bвул\s+Незалежності\s+України\b/gi, 'вулиця Незалежності України'],
        [/\bвул\s+Независимости\s+Украины\b/gi, 'вулиця Незалежності України'],
        [/\bвул\s+Соборності\b/gi, 'вулиця Соборності'],
        [/\bвул\s+Соборности\b/gi, 'вулиця Соборності'],
        [/\bвул\s+Шевченка\b/gi, 'вулиця Шевченка'],
        [/\bвул\s+Шевченко\b/gi, 'вулиця Шевченка'],
        [/\bпросп\s+Богдана\s+Хмельницького\b/gi, 'проспект Богдана Хмельницького'],
        [/\bпросп\s+Богдана\s+Хмельницкого\b/gi, 'проспект Богдана Хмельницького'],
    ],
    'київ': [
        [/\bХрещатик\b/gi, 'Хрещатик'],
        [/\bКрещатик\b/gi, 'Хрещатик'],
        [/\bМайдан\s+Незалежності\b/gi, 'майдан Незалежності'],
        [/\bМайдан\s+Независимости\b/gi, 'майдан Незалежності'],
        [/\bпросп\s+Перемоги\b/gi, 'проспект Перемоги'],
        [/\bпросп\s+Победы\b/gi, 'проспект Перемоги'],
        [/\bпросп\s+Берестейський\b/gi, 'проспект Берестейський'],
        [/\bпросп\s+Берестейский\b/gi, 'проспект Берестейський'],
        [/\bпросп\s+Повітрофлотський\b/gi, 'проспект Повітрофлотський'],
        [/\bпросп\s+Повітрофлотский\b/gi, 'проспект Повітрофлотський'],
        [/\bпросп\s+Степана\s+Бандери\b/gi, 'проспект Степана Бандери'],
        [/\bпросп\s+Степана\s+Бандеры\b/gi, 'проспект Степана Бандери'],
        [/\bпросп\s+Валерія\s+Лобановського\b/gi, 'проспект Валерія Лобановського'],
        [/\bпросп\s+Валерия\s+Лобановского\b/gi, 'проспект Валерія Лобановського'],
        [/\bпросп\s+Глушкова\b/gi, 'проспект Глушкова'],
        [/\bпросп\s+Академіка\s+Глушкова\b/gi, 'проспект Академіка Глушкова'],
    ],
}

function normalizeCityKey(city: string): string {
    const lc = city.toLowerCase().trim()
    if (lc.includes('харк') || lc.includes('харь')) return 'харків'
    if (lc.includes('одес')) return 'одеса'
    if (lc.includes('дніп') || lc.includes('днеп')) return 'дніпро'
    if (lc.includes('полтав')) return 'полтава'
    if (lc.includes('київ') || lc.includes('киев') || lc.includes('kyiv') || lc.includes('kiev')) return 'київ'
    return 'київ' // default
}

function expandUkrAbbrev(address: string, cityBias?: string): string {
    let result = address
    for (const [abbrev, full] of UA_ABBREV) {
        result = result.replace(new RegExp(abbrev, 'gi'), `${full} `)
    }
    
    // Apply city-specific normalizations
    if (cityBias) {
        const cityKey = normalizeCityKey(cityBias)
        const specific = CITY_SPECIFIC[cityKey]
        if (specific) {
            for (const [pattern, replacement] of specific) {
                result = result.replace(pattern, replacement)
            }
        }
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

import { getCityBounds, getActiveZoneBounds } from './robust-geocoding/cityBounds'

export class PhotonService {
    private static readonly BASE_URL = 'https://photon.komoot.io/api/'

    static async geocode(address: string, cityBias?: string, activePolygons?: any[]): Promise<any[]> {
        const expanded = expandUkrAbbrev(address, cityBias)
        const city = cityBias || 'Київ'
        
        const zoneBounds = activePolygons?.length ? getActiveZoneBounds(activePolygons) : null;
        const bounds = zoneBounds || getCityBounds(city)
        const bboxParams = bounds 
            ? `${bounds.bbox[1]},${bounds.bbox[0]},${bounds.bbox[3]},${bounds.bbox[2]}` 
            : '22.13,44.38,40.22,52.37'; // Fallback to Ukraine (roughly)
        
        // Strategy: clean the address and ensure city/country are present but not duplicated
        const lowerExpanded = expanded.toLowerCase()
        const cityLower = city.toLowerCase()
        
        const hasCity = lowerExpanded.includes(cityLower) || 
                      (cityLower === 'київ' && lowerExpanded.includes('киев')) ||
                      (cityLower === 'киев' && lowerExpanded.includes('київ')) ||
                      (cityLower === 'харків' && lowerExpanded.includes('харьков')) ||
                      (cityLower === 'харьков' && lowerExpanded.includes('харків')) ||
                      (cityLower === 'одеса' && lowerExpanded.includes('одесса')) ||
                      (cityLower === 'одесса' && lowerExpanded.includes('одеса')) ||
                      (cityLower === 'дніпро' && (lowerExpanded.includes('днепр') || lowerExpanded.includes('дніпропетровськ'))) ||
                      (cityLower === 'днепр' && (lowerExpanded.includes('дніпро') || lowerExpanded.includes('днепропетровск')))
        const hasCountry = lowerExpanded.includes('україна') || lowerExpanded.includes('украина') || lowerExpanded.includes('ukraine')

        let query = expanded
        if (!hasCity) query = `${expanded}, ${city}`
        if (!hasCountry) {
            query = `${query}, Україна`
        }

        const results = await this._query(query, bboxParams, bounds?.center)
        return results
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
             const statusStr = error.message.includes('Photon') ? error.message : `Photon Error: ${error.message}`;
             console.warn(`[Геокодинг] Ошибка Photon: – "${statusStr}"`);
             throw error // Re-throw to allow Nominatim fallback
        }
    }
}
