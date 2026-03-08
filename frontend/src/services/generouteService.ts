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
    private static readonly DEFAULT_API_KEY = 'wukkif-bixkit-Zabso4'

    /**
     * Calculate a route between multiple points in a fixed order.
     * Maps the response to a format compatible with Google Maps DirectionsLeg.
     */
    static async calculateRoute(
        locations: { lat: number; lng: number }[],
        apiKey?: string,
        region: string = 'UA'
    ): Promise<{
        feasible: boolean
        legs?: any[]
        totalDuration?: number
        totalDistance?: number
    }> {
        const key = apiKey || this.DEFAULT_API_KEY
        
        // Convert to [lng, lat] format required by Generoute
        const formattedLocations = locations.map((loc, index) => ({
            coordinates: [loc.lng, loc.lat],
            title: `Point ${index + 1}`
        }))

        try {
            const response = await fetch(`${this.BASE_URL}/trip`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    region: region,
                    locations: formattedLocations,
                    metrics: ['distance', 'duration'],
                    // Ensure we don't reorder if we are checking a specific chain
                    optimize: false 
                })
            })

            if (!response.ok) {
                return { feasible: false }
            }

            const data = await response.json()
            
            // Map Generoute segments to Google-like legs
            const legs = (data.segments || []).map((seg: any) => ({
                distance: { text: `${(seg.distance / 1000).toFixed(1)} km`, value: seg.distance },
                duration: { text: `${Math.round(seg.duration / 60)} min`, value: seg.duration },
                start_location: { lat: seg.start_location?.[1], lng: seg.start_location?.[0] },
                end_location: { lat: seg.end_location?.[1], lng: seg.end_location?.[0] }
            }))

            return {
                feasible: true,
                legs,
                totalDistance: data.total_distance || 0,
                totalDuration: data.total_duration || 0
            }
        } catch (error) {
            console.error('Generoute route calculation failed:', error)
            return { feasible: false }
        }
    }

    /**
     * Calculate a trip/route between multiple points (TSP optimization).
     * @param locations List of points. Coordinates should be {lat, lng}
     * @param apiKey Generoute API Key
     * @param region Region code (e.g., 'UA')
     */
    static async calculateTrip(
        locations: { lat: number; lng: number; title?: string }[],
        apiKey: string,
        region: string = 'UA'
    ): Promise<GenerouteTripResponse | null> {
        const key = apiKey || this.DEFAULT_API_KEY

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
                    'Authorization': `Bearer ${key}`,
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
