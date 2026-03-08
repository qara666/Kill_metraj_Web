/**
 * Robust Geocoding Service — Shared Types
 *
 * All interfaces used across the robust-geocoding module.
 */

// ─── Raw Google Maps result shape ────────────────────────────────────────────

export interface RawGeoCandidate {
  formatted_address: string
  geometry: {
    location: {
      lat: number | (() => number)
      lng: number | (() => number)
    }
    location_type: 'ROOFTOP' | 'RANGE_INTERPOLATED' | 'GEOMETRIC_CENTER' | 'APPROXIMATE'
  }
  address_components?: Array<{ long_name: string; short_name: string; types: string[] }>
  place_id?: string
  types?: string[]
}

// ─── Scored geocoding candidate ──────────────────────────────────────────────

export interface ScoredCandidate {
  raw: RawGeoCandidate
  /** Normalised latitude */
  lat: number
  /** Normalised longitude */
  lng: number
  /** Composite quality score (higher = better) */
  score: number
  /** Name of the KML delivery zone this point falls in (or null) */
  kmlZone: string | null
  /** Folder / hub name of the KML zone */
  kmlHub: string | null
  /** Whether this point is inside a *technical* auto-unload zone */
  isTechnicalZone: boolean
  /** Whether this point is inside any active delivery zone */
  isInsideZone: boolean
}

// ─── KML Zone context ─────────────────────────────────────────────────────────

export interface KmlPolygonData {
  /** Internal key: "folderName:name" */
  key: string
  name: string
  folderName: string
  /** Pre-built Google maps Polygon object, set by the zone loader */
  googlePoly?: any
  /** Pre-built LatLngBounds for quick AABB rejection */
  bounds?: any
  /** Raw path array (fallback if googlePoly not available) */
  path?: Array<{ lat: number; lng: number }>
}

/** Injected by the app context once KML data is loaded */
export interface KmlZoneContext {
  /** ALL polygons (delivery + technical) */
  allPolygons: KmlPolygonData[]
  /** Only the polygons that are active/selected in the current planning session */
  activePolygons: KmlPolygonData[]
  /** Zone keys that are currently selected */
  selectedZoneKeys: string[]
}

// ─── Options and Results ──────────────────────────────────────────────────────

export interface RobustGeocodeOptions {
  /**
   * If true, skips the disambiguation modal and auto-picks the best candidate.
   * Use for background/distance calculations.
   */
  silent?: boolean

  /**
   * Hint coordinate to bias scoring (e.g. centre of the route).
   */
  hintPoint?: { lat: number; lng: number }

  /**
   * City string to append when normalising variants (e.g. "Киев").
   * Defaults to the value in settings.cityBias.
   */
  cityBias?: string

  /**
   * Max number of street-variant expansions to try before falling back.
   * Defaults to all variants.
   */
  maxVariants?: number

  /**
   * Skip exhaustive research when a reasonable candidate is already found.
   * Default: true (saves API calls).
   */
  skipExhaustiveIfGoodHit?: boolean
}

export interface RobustGeocodeResult {
  /** Best candidate after scoring, or null if nothing found */
  best: ScoredCandidate | null
  /** All candidates collected during the search */
  allCandidates: ScoredCandidate[]
  /** Address string that ultimately produced the best hit */
  resolvedVariant: string | null
  /** Whether the result came from cache */
  fromCache: boolean
}
