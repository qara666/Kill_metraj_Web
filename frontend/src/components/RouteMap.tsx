import React, { useEffect, useRef, useState } from 'react'
import { Loader } from '@googlemaps/js-api-loader'
import { clsx } from 'clsx'
import type { Route } from '../types'

interface RouteMapProps {
  routes: Route[]
  selectedCourier?: string | null
  height?: string
  className?: string
}

export const RouteMap: React.FC<RouteMapProps> = ({
  routes,
  selectedCourier,
  height = '400px',
  className
}) => {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<google.maps.Marker[]>([])
  const polylinesRef = useRef<google.maps.Polyline[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Initialize Google Maps
  useEffect(() => {
    const initMap = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // Check if Google Maps API key is available
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
        if (!apiKey) {
          setError('Google Maps API key not configured')
          setIsLoading(false)
          return
        }

        const loader = new Loader({
          apiKey,
          version: 'weekly',
          libraries: ['geometry']
        })

        const google = await loader.load()

        if (mapRef.current) {
          const map = new google.maps.Map(mapRef.current, {
            center: { lat: 50.4501, lng: 30.5234 }, // Kyiv coordinates
            zoom: 10,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            styles: [
              {
                featureType: 'poi',
                elementType: 'labels',
                stylers: [{ visibility: 'off' }]
              }
            ]
          })

          mapInstanceRef.current = map
          setIsLoading(false)
        }
      } catch (err) {
        console.error('Error loading Google Maps:', err)
        setError('Failed to load Google Maps')
        setIsLoading(false)
      }
    }

    initMap()
  }, [])

  // Update map when routes or selected courier changes
  useEffect(() => {
    if (!mapInstanceRef.current || !routes.length) return

    // Clear existing markers and polylines
    markersRef.current.forEach(marker => marker.setMap(null))
    polylinesRef.current.forEach(polyline => polyline.setMap(null))
    markersRef.current = []
    polylinesRef.current = []

    const map = mapInstanceRef.current
    const bounds = new google.maps.LatLngBounds()
    let hasValidCoordinates = false

    // Filter routes by selected courier
    const filteredRoutes = selectedCourier 
      ? routes.filter(route => 
          typeof route.courier === 'object' 
            ? route.courier._id === selectedCourier
            : route.courier === selectedCourier
        )
      : routes

    filteredRoutes.forEach((route, routeIndex) => {
      const isSelected = selectedCourier && (
        typeof route.courier === 'object' 
          ? route.courier._id === selectedCourier
          : route.courier === selectedCourier
      )

      // Add start point marker
      if (route.startPoint.latitude && route.startPoint.longitude) {
        const startMarker = new google.maps.Marker({
          position: {
            lat: route.startPoint.latitude,
            lng: route.startPoint.longitude
          },
          map,
          title: `Start: ${route.startPoint.formattedAddress}`,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: isSelected ? '#3b82f6' : '#10b981',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
          },
          label: {
            text: 'S',
            color: '#ffffff',
            fontSize: '12px',
            fontWeight: 'bold'
          }
        })
        markersRef.current.push(startMarker)
        bounds.extend(startMarker.getPosition()!)
        hasValidCoordinates = true
      }

      // Add waypoint markers
      route.waypoints.forEach((waypoint, waypointIndex) => {
        if (waypoint.latitude && waypoint.longitude) {
          const waypointMarker = new google.maps.Marker({
            position: {
              lat: waypoint.latitude,
              lng: waypoint.longitude
            },
            map,
            title: `Order ${waypoint.orderNumber}: ${waypoint.formattedAddress}`,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 6,
              fillColor: isSelected ? '#f59e0b' : '#6b7280',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2
            },
            label: {
              text: (waypointIndex + 1).toString(),
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: 'bold'
            }
          })
          markersRef.current.push(waypointMarker)
          bounds.extend(waypointMarker.getPosition()!)
          hasValidCoordinates = true
        }
      })

      // Add end point marker
      if (route.endPoint.latitude && route.endPoint.longitude) {
        const endMarker = new google.maps.Marker({
          position: {
            lat: route.endPoint.latitude,
            lng: route.endPoint.longitude
          },
          map,
          title: `End: ${route.endPoint.formattedAddress}`,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: isSelected ? '#ef4444' : '#8b5cf6',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
          },
          label: {
            text: 'E',
            color: '#ffffff',
            fontSize: '12px',
            fontWeight: 'bold'
          }
        })
        markersRef.current.push(endMarker)
        bounds.extend(endMarker.getPosition()!)
        hasValidCoordinates = true
      }

      // Add route polyline if available
      if (route.polyline) {
        const decodedPath = google.maps.geometry.encoding.decodePath(route.polyline)
        const polyline = new google.maps.Polyline({
          path: decodedPath,
          geodesic: true,
          strokeColor: isSelected ? '#3b82f6' : '#6b7280',
          strokeOpacity: isSelected ? 0.8 : 0.4,
          strokeWeight: isSelected ? 4 : 2,
          map
        })
        polylinesRef.current.push(polyline)
      }
    })

    // Fit map to show all markers
    if (hasValidCoordinates && markersRef.current.length > 0) {
      map.fitBounds(bounds)
    }
  }, [routes, selectedCourier])

  if (error) {
    return (
      <div className={clsx('flex items-center justify-center bg-gray-100 rounded-lg', className)} style={{ height }}>
        <div className="text-center">
          <div className="text-gray-500 mb-2">⚠️</div>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={clsx('relative', className)}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Loading map...</p>
          </div>
        </div>
      )}
      
      <div
        ref={mapRef}
        className="w-full rounded-lg"
        style={{ height }}
      />
      
      {!isLoading && routes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-lg">
          <div className="text-center">
            <div className="text-gray-400 mb-2">🗺️</div>
            <p className="text-sm text-gray-600">No routes to display</p>
            <p className="text-xs text-gray-500 mt-1">
              Upload an Excel file to create routes
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
