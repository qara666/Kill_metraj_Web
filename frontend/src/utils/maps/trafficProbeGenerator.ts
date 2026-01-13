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
 * Generates an ordered "snake" path of waypoints covering the sector.
 * This is more efficient than random segments as it covers entire roads with few API calls.
 */
export const generateTrafficProbes = (
    sectorPath: LatLng[],
    options: { gridDensity?: number; maxPoints?: number } = {}
): LatLng[] => {
    if (!sectorPath || sectorPath.length < 3) return []

    const { gridDensity = 12, maxPoints = 100 } = options

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

    const points: Array<{ lat: number; lng: number; row: number; col: number }> = []

    // 2. Generate grid points and filter by polygon
    for (let i = 0; i <= gridDensity; i++) {
        for (let j = 0; j <= gridDensity; j++) {
            const lat = minLat + i * latStep
            const lng = minLng + j * lngStep
            const point = { lat, lng }

            if (isPointInPolygon(point, sectorPath)) {
                points.push({ ...point, row: i, col: j })
            }
        }
    }

    // 3. Sort points in a "snake" pattern (alternating column order per row)
    // This creates a continuous path that snoops through the sector
    const sortedPoints = points.sort((a, b) => {
        if (a.row !== b.row) return a.row - b.row
        // Even rows go left-to-right, odd rows go right-to-left
        return a.row % 2 === 0 ? a.col - b.col : b.col - a.col
    })

    // 4. Downsample if needed to stay within limits
    if (sortedPoints.length > maxPoints) {
        const step = Math.floor(sortedPoints.length / maxPoints)
        return sortedPoints
            .filter((_, idx) => idx % step === 0)
            .map(({ lat, lng }) => ({ lat, lng }))
    }

    return sortedPoints.map(({ lat, lng }) => ({ lat, lng }))
}
