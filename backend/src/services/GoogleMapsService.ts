import axios from 'axios';

export interface GeocodingResult {
  formattedAddress: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  placeId?: string;
  types?: string[];
}

export interface RouteResult {
  distance: string;
  duration: string;
  polyline: string;
  legs: Array<{
    distance: { text: string; value: number };
    duration: { text: string; value: number };
    startAddress: string;
    endAddress: string;
  }>;
}

export interface GeocodingResponse {
  status: string;
  results: Array<{
    formatted_address: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
    place_id: string;
    types: string[];
  }>;
}

export interface DirectionsResponse {
  status: string;
  routes: Array<{
    legs: Array<{
      distance: { text: string; value: number };
      duration: { text: string; value: number };
      start_address: string;
      end_address: string;
    }>;
    overview_polyline: {
      points: string;
    };
  }>;
}

export class GoogleMapsService {
  private apiKey: string;
  private baseURL = 'https://maps.googleapis.com/maps/api';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Geocode an address to get coordinates and formatted address
   */
  async geocodeAddress(address: string): Promise<GeocodingResult | null> {
    try {
      if (!this.apiKey) {
        throw new Error('Google Maps API key is not configured');
      }

      const response = await axios.get<GeocodingResponse>(
        `${this.baseURL}/geocode/json`,
        {
          params: {
            address: address.trim(),
            key: this.apiKey,
            region: 'ua', // Ukraine region bias
            language: 'uk' // Ukrainian language preference
          },
          timeout: 10000 // 10 second timeout
        }
      );

      if (response.data.status === 'OK' && response.data.results.length > 0) {
        const result = response.data.results[0];
        return {
          formattedAddress: result.formatted_address,
          geometry: {
            location: {
              lat: result.geometry.location.lat,
              lng: result.geometry.location.lng
            }
          },
          placeId: result.place_id,
          types: result.types
        };
      }

      console.warn(`Geocoding failed for address: ${address}. Status: ${response.data.status}`);
      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 403) {
          throw new Error('Google Maps API key is invalid or quota exceeded');
        } else if (error.response?.status === 429) {
          throw new Error('Google Maps API rate limit exceeded');
        }
      }
      throw new Error('Failed to geocode address');
    }
  }

  /**
   * Get route between origin and destination with optional waypoints
   */
  async getRoute(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    waypoints: { lat: number; lng: number }[] = []
  ): Promise<RouteResult | null> {
    try {
      if (!this.apiKey) {
        throw new Error('Google Maps API key is not configured');
      }

      const params: any = {
        origin: `${origin.lat},${origin.lng}`,
        destination: `${destination.lat},${destination.lng}`,
        key: this.apiKey,
        mode: 'driving',
        language: 'uk',
        units: 'metric'
      };

      if (waypoints.length > 0) {
        const waypointStrings = waypoints.map(wp => `${wp.lat},${wp.lng}`);
        params.waypoints = waypointStrings.join('|');
        params.optimize = true; // Optimize waypoint order
      }

      const response = await axios.get<DirectionsResponse>(
        `${this.baseURL}/directions/json`,
        { 
          params,
          timeout: 15000 // 15 second timeout for routing
        }
      );

      if (response.data.status === 'OK' && response.data.routes.length > 0) {
        const route = response.data.routes[0];
        
        // Calculate total distance and duration
        let totalDistance = 0;
        let totalDuration = 0;
        
        const legs = route.legs.map((leg: any) => {
          totalDistance += leg.distance.value;
          totalDuration += leg.duration.value;
          
          return {
            distance: leg.distance,
            duration: leg.duration,
            startAddress: leg.start_address,
            endAddress: leg.end_address
          };
        });

        return {
          distance: this.formatDistance(totalDistance),
          duration: this.formatDuration(totalDuration),
          polyline: route.overview_polyline.points,
          legs
        };
      }

      console.warn(`Routing failed. Status: ${response.data.status}`);
      return null;
    } catch (error) {
      console.error('Routing error:', error);
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 403) {
          throw new Error('Google Maps API key is invalid or quota exceeded');
        } else if (error.response?.status === 429) {
          throw new Error('Google Maps API rate limit exceeded');
        }
      }
      throw new Error('Failed to calculate route');
    }
  }

  /**
   * Batch geocode multiple addresses with rate limiting
   */
  async batchGeocodeAddresses(
    addresses: string[],
    delayMs: number = 100
  ): Promise<Array<{ address: string; result: GeocodingResult | null; error?: string }>> {
    const results: Array<{ address: string; result: GeocodingResult | null; error?: string }> = [];
    
    for (let i = 0; i < addresses.length; i++) {
      const address = addresses[i];
      
      try {
        const result = await this.geocodeAddress(address);
        results.push({ address, result });
        
        // Add delay between requests to respect rate limits
        if (i < addresses.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        results.push({ 
          address, 
          result: null, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }
    
    return results;
  }

  /**
   * Validate if coordinates are within Ukraine bounds
   */
  isWithinUkraine(lat: number, lng: number): boolean {
    // Ukraine approximate bounds
    const ukraineBounds = {
      north: 52.5,
      south: 44.3,
      east: 40.2,
      west: 22.1
    };
    
    return lat >= ukraineBounds.south && 
           lat <= ukraineBounds.north && 
           lng >= ukraineBounds.west && 
           lng <= ukraineBounds.east;
  }

  /**
   * Calculate distance between two points in kilometers
   */
  calculateDistance(
    point1: { lat: number; lng: number },
    point2: { lat: number; lng: number }
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(point2.lat - point1.lat);
    const dLng = this.toRadians(point2.lng - point1.lng);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(point1.lat)) * Math.cos(this.toRadians(point2.lat)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private formatDistance(meters: number): string {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${meters} m`;
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours} год ${minutes} хв`;
    }
    return `${minutes} хв`;
  }

  /**
   * Test API key validity
   */
  async testApiKey(): Promise<boolean> {
    try {
      const result = await this.geocodeAddress('Київ, Україна');
      return result !== null;
    } catch (error) {
      return false;
    }
  }
}
