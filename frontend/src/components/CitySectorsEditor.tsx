import React, { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { googleMapsLoader } from '../utils/googleMapsLoader'

type CityName = '' | 'Киев' | 'Харьков' | 'Полтава' | 'Одесса'

export interface CitySectors {
  [city: string]: Array<{ lat: number; lng: number }>
}

export const CitySectorsEditor: React.FC<{
  isDark: boolean
  city: CityName
  value: CitySectors
  onChange: (next: CitySectors) => void
}> = ({ isDark, city, value, onChange }) => {
  const mapRef = useRef<HTMLDivElement>(null)
  const [polygon, setPolygon] = useState<any>(null)

  useEffect(() => {
    const init = async () => {
      try {
        await googleMapsLoader.load()
        if (!mapRef.current) return

        const centerByCity: Record<string, { lat: number; lng: number; zoom: number }> = {
          'Киев': { lat: 50.4501, lng: 30.5234, zoom: 11 },
          'Харьков': { lat: 49.9935, lng: 36.2304, zoom: 11 },
          'Полтава': { lat: 49.5883, lng: 34.5514, zoom: 12 },
          'Одесса': { lat: 46.4825, lng: 30.7233, zoom: 11 }
        }

        const center = centerByCity[city || 'Киев'] || centerByCity['Киев']
        const m = new window.google.maps.Map(mapRef.current, {
          center: { lat: center.lat, lng: center.lng },
          zoom: center.zoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false
        })

        // Инициализируем текущий полигон, если сохранён
        if (city && value && value[city] && value[city].length >= 3) {
          const poly = new window.google.maps.Polygon({
            paths: value[city],
            strokeColor: '#2563eb',
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: '#3b82f6',
            fillOpacity: 0.15,
            editable: true
          })
          poly.setMap(m)
          setPolygon(poly)
          const bounds = new window.google.maps.LatLngBounds()
          value[city].forEach((p: any) => bounds.extend(p))
          m.fitBounds(bounds)
          window.google.maps.event.addListener(poly.getPath(), 'set_at', () => persist(poly))
          window.google.maps.event.addListener(poly.getPath(), 'insert_at', () => persist(poly))
        }

        // Drawing Manager для создания/обновления полигона
        const dm = new window.google.maps.drawing.DrawingManager({
          drawingMode: null,
          drawingControl: true,
          drawingControlOptions: {
            position: window.google.maps.ControlPosition.TOP_CENTER,
            drawingModes: ['polygon']
          },
          polygonOptions: {
            strokeColor: '#2563eb',
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: '#3b82f6',
            fillOpacity: 0.15,
            editable: true
          }
        })
        dm.setMap(m)

        window.google.maps.event.addListener(dm, 'polygoncomplete', (poly: any) => {
          if (polygon) polygon.setMap(null)
          setPolygon(poly)
          persist(poly)
          dm.setDrawingMode(null)
          const path = poly.getPath()
          window.google.maps.event.addListener(path, 'set_at', () => persist(poly))
          window.google.maps.event.addListener(path, 'insert_at', () => persist(poly))
        })
      } catch (e) {
        // ignore
      }
    }
    if (city) init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city])

  const persist = (poly: any) => {
    const path = poly.getPath()
    const coords = [] as Array<{ lat: number; lng: number }>
    for (let i = 0; i < path.getLength(); i++) {
      const p = path.getAt(i)
      coords.push({ lat: p.lat(), lng: p.lng() })
    }
    const next = { ...(value || {}) }
    if (city) next[city] = coords
    onChange(next)
  }

  return (
    <div>
      {!city && (
        <p className={clsx('text-sm mb-2', isDark ? 'text-gray-400' : 'text-gray-600')}>
          Сначала выберите город выше, затем настройте сектор на карте.
        </p>
      )}
      <div ref={mapRef} className="w-full h-80 rounded-lg border" style={{ borderColor: isDark ? '#374151' : '#e5e7eb' }} />
      {city && (
        <div className={clsx('mt-2 text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>
          Нарисуйте полигон (многоугольник), ограничивающий допустимую зону адресов для города {city}. Редактировать можно перетаскиванием точек.
        </div>
      )}
    </div>
  )
}


