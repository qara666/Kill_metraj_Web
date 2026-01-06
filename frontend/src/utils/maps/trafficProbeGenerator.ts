import { LatLng } from '../../hooks/useTrafficData'

/**
 * Checks if a point is inside a polygon using Rays Casting algorithm
 */
export const isPointInPolygon = (point: LatLng, polygon: LatLng[]): boolean => {
    let inside = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lng
        const yi = polygon[i].lat
        const xj = polygon[j].lng
        const yj = polygon[j].lat
        const intersect = ((yi > point.lat) !== (yj > point.lat)) && (point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi + Number.EPSILON) + xi)
        if (intersect) inside = !inside
    }
    return inside
}

/**
 * Generates a grid of traffic probe segments inside a polygon
 * @param sectorPath Polygon boundaries
 * @param options Density and sampling options
 * @returns Array of segment pairs [from, to]
 */
export const generateTrafficProbes = (
    sectorPath: LatLng[],
    options: { gridDensity?: number; segmentLengthKm?: number } = {}
): Array<[LatLng, LatLng]> => {
    if (!sectorPath || sectorPath.length < 3) return []

    const { gridDensity = 15, segmentLengthKm = 0.8 } = options

    // 1. Find bounding box
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
    sectorPath.forEach(p => {
        minLat = Math.min(minLat, p.lat)
        maxLat = Math.max(maxLat, p.lat)
        minLng = Math.min(minLng, p.lng)
        maxLng = Math.max(maxLng, p.lng)
    })

    const latStep = (maxLat - minLat) / gridDensity
    const lngStep = (maxLng - minLng) / gridDensity

    const probes: Array<[LatLng, LatLng]> = []

    // 2. Generate grid points
    for (let i = 0; i <= gridDensity; i++) {
        for (let j = 0; j <= gridDensity; j++) {
            const lat = minLat + i * latStep
            const lng = minLng + j * lngStep
            const point: LatLng = { lat, lng }

            // 3. Only if point is inside or very close to sector
            if (isPointInPolygon(point, sectorPath)) {
                // Generate a small segment (e.g., horizontal or vertical)
                // We alternating directions to cover more roads
                const isHorizontal = (i + j) % 2 === 0
                const to: LatLng = isHorizontal
                    ? { lat, lng: lng + (segmentLengthKm / 111) } // roughly 1km per 0.01 deg lng at 45deg lat
                    : { lat: lat + (segmentLengthKm / 111), lng }

                probes.push([point, to])
            }
        }
    }

    // Limit to prevent API overload
    return probes.slice(0, 100)
}
