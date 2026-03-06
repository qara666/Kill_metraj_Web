/**
 * Service for Generoute.io Trip/Routing API
 * Docs: https://generoute.io/documentation
 */

export interface GenerouteLocation {
    coordinates: [number, number] // [longitude, latitude]
    title?: string
    data?: any
}

export interface GenerouteTripResponse {
    total_distance: number // meters
    total_duration: number // seconds
    geometry?: any // polylines or GeoJSON
    segments?: any[]
}

export class GenerouteService {
    private static readonly BASE_URL = 'https://api.generoute.io/v1'

    /**
     * Calculate a trip/route between multiple points.
     * @param locations List of points. Coordinates should be {lat, lng}
     * @param apiKey Generoute API Key
     * @param region Region code (e.g., 'UA')
     */
    static async calculateTrip(
        locations: { lat: number; lng: number; title?: string }[],
        apiKey: string,
        region: string = 'UA'
    ): Promise<GenerouteTripResponse | null> {
        if (!apiKey) {
            throw new Error('Generoute API Key is required')
        }

        // Convert to [lng, lat] format required by Generoute
        const formattedLocations: GenerouteLocation[] = locations.map((loc, index) => ({
            coordinates: [loc.lng, loc.lat],
            title: loc.title || `Point ${index + 1}`,
            data: { id: `point_${index}` }
        }))

        try {
            const response = await fetch(`${this.BASE_URL}/trip`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    region: region,
                    locations: formattedLocations,
                    // Optimization settings can be added here if needed
                    metrics: ['distance', 'duration']
                })
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(errorData.message || `Generoute API error: ${response.status}`)
            }

            const data = await response.json()

            return {
                total_distance: data.total_distance || 0,
                total_duration: data.total_duration || 0,
                geometry: data.geometry,
                segments: data.segments
            }
        } catch (error) {
            console.error('Generoute request failed:', error)
            return null
        }
    }
}
