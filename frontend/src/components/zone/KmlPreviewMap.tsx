import React, { useEffect, useRef } from 'react'
import { clsx } from 'clsx'
import { googleMapsLoader } from '../../utils/maps/googleMapsLoader'
import { KMLData } from '../../utils/maps/kmlParser'

interface KmlPreviewMapProps {
    isDark: boolean
    kmlData: KMLData | null
    selectedHubs: string[]
    selectedZones?: string[]
}

export const KmlPreviewMap: React.FC<KmlPreviewMapProps> = ({ isDark, kmlData, selectedHubs, selectedZones = [] }) => {
    const mapRef = useRef<HTMLDivElement>(null)
    const mapInstance = useRef<any>(null)
    const polygonsRef = useRef<any[]>([])
    const markersRef = useRef<any[]>([])

    useEffect(() => {
        const init = async () => {
            try {
                await googleMapsLoader.load()
                if (!mapRef.current || !kmlData) return

                if (!mapInstance.current) {
                    mapInstance.current = new window.google.maps.Map(mapRef.current, {
                        center: { lat: 50.4501, lng: 30.5234 },
                        zoom: 10,
                        mapTypeControl: false,
                        streetViewControl: false,
                        fullscreenControl: false,
                        styles: isDark ? [
                            { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
                            { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
                            { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] }
                        ] : []
                    })
                }

                const map = mapInstance.current

                // Clear existing
                polygonsRef.current.forEach(p => p.setMap(null))
                markersRef.current.forEach(m => m.setMap(null))
                polygonsRef.current = []
                markersRef.current = []

                const bounds = new window.google.maps.LatLngBounds()
                let hasPoints = false

                // Filter and draw polygons
                const filteredPolygons = kmlData.polygons.filter(p => {
                    const isHubSelected = selectedHubs.length === 0 || selectedHubs.includes(p.folderName)
                    if (!isHubSelected) return false

                    // Если выбраны конкретные зоны, фильтруем по ним
                    if (selectedZones.length > 0) {
                        return selectedZones.includes(`${p.folderName}:${p.name}`)
                    }
                    return true
                })

                filteredPolygons.forEach(p => {
                    const isZoneExplicitlySelected = selectedZones.includes(`${p.folderName}:${p.name}`)
                    const poly = new window.google.maps.Polygon({
                        paths: p.path,
                        strokeColor: isZoneExplicitlySelected ? '#a855f7' : '#6366f1',
                        strokeOpacity: 0.8,
                        strokeWeight: isZoneExplicitlySelected ? 3 : 2,
                        fillColor: isZoneExplicitlySelected ? '#c084fc' : '#818cf8',
                        fillOpacity: isZoneExplicitlySelected ? 0.35 : 0.2,
                        map: map
                    })
                    polygonsRef.current.push(poly)
                    p.path.forEach(pt => {
                        bounds.extend(pt)
                        hasPoints = true
                    })
                })

                // Filter and draw markers
                const filteredMarkers = selectedHubs.length > 0
                    ? kmlData.markers.filter(m => selectedHubs.includes(m.folderName))
                    : kmlData.markers

                filteredMarkers.forEach(m => {
                    const pos = { lat: m.lat, lng: m.lng }
                    const marker = new window.google.maps.Marker({
                        position: pos,
                        title: m.name,
                        label: m.name.charAt(0),
                        map: map
                    })
                    markersRef.current.push(marker)
                    bounds.extend(pos)
                    hasPoints = true
                })

                if (hasPoints) {
                    map.fitBounds(bounds)
                }

            } catch (e) {
                console.error('Error initializing KML Preview Map:', e)
            }
        }

        init()
    }, [kmlData, selectedHubs, selectedZones, isDark])

    return (
        <div className="relative">
            <div
                ref={mapRef}
                className={clsx(
                    "w-full h-96 rounded-2xl border-2 transition-all overflow-hidden",
                    isDark ? "bg-gray-900 border-gray-700 shadow-black/40" : "bg-gray-100 border-gray-200"
                )}
            />
            {!kmlData && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/5 backdrop-blur-[2px] rounded-2xl">
                    <p className={clsx("text-sm font-bold", isDark ? "text-gray-500" : "text-gray-400")}>
                        НЕТ ДАННЫХ ДЛЯ ОТОБРАЖЕНИЯ
                    </p>
                </div>
            )}
        </div>
    )
}
