/**
 * City Bounding Boxes for Geocoding
 *
 * Defines geographic boundaries for all delivery cities + their suburbs.
 * Used to restrict geocoding results to the relevant area.
 *
 * Format: [south, west, north, east] (lat_min, lng_min, lat_max, lng_max)
 */

export interface CityBBox {
  /** [south, west, north, east] — WGS84 degrees */
  bbox: [number, number, number, number]
  /** Nominatim viewbox format: "west,south,east,north" */
  viewbox: string
  /** Nominatim bounded=1 should be used */
  bounded: boolean
  /** City variants for string matching */
  names: string[]
  /** Photon location bias [lng, lat] */
  center: [number, number]
  /** Radius (km) for Photon location bias */
  radiusKm: number
}

/**
 * Bounding boxes include the city + all major suburbs/satellites.
 * Extending ~20–30km from city center to cover all delivery zones.
 */
export const CITY_BOUNDS: Record<string, CityBBox> = {
  // ─── КИЇВ (KYIV) ─────────────────────────────────────────────────────────
  // Covers: Kyiv city + Bucha, Irpin, Hostomel, Boryspil, Vyshhorod,
  //         Vasylkiv, Boyarka, Vyshneveyi, Brovary, Baryshivka
  'київ': {
    bbox: [50.15, 30.15, 50.68, 31.05],
    viewbox: '30.15,50.15,31.05,50.68',
    bounded: true,
    names: ['київ', 'киев', 'kyiv', 'kiev'],
    center: [30.5234, 50.4501],
    radiusKm: 50,
  },

  // ─── ХАРКІВ (KHARKIV) ────────────────────────────────────────────────────
  // Covers: Kharkiv city + Mala Danylivka, Derhachi, Lisopark, Chuhuiv, Merefa
  'харків': {
    bbox: [49.87, 36.09, 50.14, 36.48],
    viewbox: '36.09,49.87,36.48,50.14',
    bounded: true,
    names: ['харків', 'харьков', 'kharkiv', 'kharkov'],
    center: [36.2304, 49.9935],
    radiusKm: 30,
  },

  // ─── ПОЛТАВА (POLTAVA) ───────────────────────────────────────────────────
  // Covers: Poltava city + Machukhivka, Rozkishne, Ivashky, Pidlisnivka
  'полтава': {
    bbox: [49.45, 34.30, 49.75, 34.85],
    viewbox: '34.30,49.45,34.85,49.75',
    bounded: true,
    names: ['полтава', 'poltava'],
    center: [34.5514, 49.5883],
    radiusKm: 30, // Increased radius for Photon bias
  },

  // ─── ОДЕСА (ODESA) ───────────────────────────────────────────────────────
  // Covers: Odesa city + Chornomorsk, Yuzhne, Teplodar, Bilhorod-Dnistrovskyi suburb area
  'одеса': {
    bbox: [46.31, 30.60, 46.56, 30.84],
    viewbox: '30.60,46.31,30.84,46.56',
    bounded: true,
    names: ['одеса', 'одесса', 'odesa', 'odessa'],
    center: [30.7233, 46.4825],
    radiusKm: 25,
  },
}

// ─── Alternate name lookup ─────────────────────────────────────────────────

/** Normalize a city name to a canonical key for CITY_BOUNDS lookup */
export function normalizeCityKey(city: string): string | null {
  if (!city) return null
  const lc = city.trim().toLowerCase()

  for (const [key, bounds] of Object.entries(CITY_BOUNDS)) {
    if (bounds.names.some(n => n === lc || lc.includes(n) || n.includes(lc))) {
      return key
    }
  }
  return null
}

/** Get bbox for a city by name. Returns null if city not found. */
export function getCityBounds(city: string): CityBBox | null {
  const key = normalizeCityKey(city)
  return key ? CITY_BOUNDS[key] ?? null : null
}

/**
 * Check if coordinates are inside a city's bounding box.
 * Optionally extended with a buffer in degrees.
 */
export function isInCityBounds(
  lat: number,
  lng: number,
  city: string,
  bufferDeg = 0
): boolean {
  const bounds = getCityBounds(city)
  if (!bounds) return true // Unknown city — don't filter
  const [south, west, north, east] = bounds.bbox
  return (
    lat >= south - bufferDeg &&
    lat <= north + bufferDeg &&
    lng >= west - bufferDeg &&
    lng <= east + bufferDeg
  )
}
