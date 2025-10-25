const axios = require('axios');

class GoogleMapsService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://maps.googleapis.com/maps/api';
  }

  /**
   * Geocode an address to get coordinates
   */
  async geocodeAddress(address) {
    try {
      const response = await axios.get(`${this.baseUrl}/geocode/json`, {
        params: {
          address: address,
          key: this.apiKey
        }
      });

      if (response.data.status === 'OK' && response.data.results.length > 0) {
        return response.data.results[0];
      }

      return null;
    } catch (error) {
      console.error('Geocoding error:', error.message);
      return null;
    }
  }

  /**
   * Get optimized route with waypoints
   */
  async getOptimizedRoute(startPoint, endPoint, waypoints) {
    try {
      const response = await axios.get(`${this.baseUrl}/directions/json`, {
        params: {
          origin: `${startPoint.latitude},${startPoint.longitude}`,
          destination: `${endPoint.latitude},${endPoint.longitude}`,
          waypoints: waypoints.map(wp => `${wp.lat},${wp.lng}`).join('|'),
          optimize: true,
          key: this.apiKey
        }
      });

      if (response.data.status === 'OK' && response.data.routes.length > 0) {
        const route = response.data.routes[0];
        const leg = route.legs[0];

        return {
          totalDistance: leg.distance.text,
          totalDuration: leg.duration.text,
          polyline: route.overview_polyline.points,
          waypoints: waypoints
        };
      }

      return {
        totalDistance: '0 км',
        totalDuration: '0 мин',
        polyline: '',
        waypoints: waypoints
      };
    } catch (error) {
      console.error('Route optimization error:', error.message);
      return {
        totalDistance: '0 км',
        totalDuration: '0 мин',
        polyline: '',
        waypoints: waypoints
      };
    }
  }

  /**
   * Get distance between two points
   */
  async getDistance(origin, destination) {
    try {
      const response = await axios.get(`${this.baseUrl}/distancematrix/json`, {
        params: {
          origins: `${origin.latitude},${origin.longitude}`,
          destinations: `${destination.latitude},${destination.longitude}`,
          key: this.apiKey
        }
      });

      if (response.data.status === 'OK' && response.data.rows.length > 0) {
        const element = response.data.rows[0].elements[0];
        if (element.status === 'OK') {
          return {
            distance: element.distance.text,
            duration: element.duration.text
          };
        }
      }

      return null;
    } catch (error) {
      console.error('Distance calculation error:', error.message);
      return null;
    }
  }
}

module.exports = { GoogleMapsService };







