import React, { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { loadLeaflet } from '../../utils/maps/leafletLoader'
import { KMLData } from '../../utils/maps/kmlParser'
import { getCityBounds } from '../../services/robust-geocoding/cityBounds'

interface OsmKmlPreviewMapProps {
    isDark: boolean
    kmlData: KMLData | null
    selectedHubs: string[]
    selectedZones?: string[]
    city?: string
}

export const OsmKmlPreviewMap: React.FC<OsmKmlPreviewMapProps> = ({ isDark, kmlData, selectedHubs, selectedZones = [], city }) => {
    const mapRef = useRef<HTMLDivElement>(null)
    const mapInstance = useRef<any>(null)
    const polygonsRef = useRef<any[]>([])
    const markersRef = useRef<any[]>([])
    const [isReady, setIsReady] = useState(false)

    useEffect(() => {
        const init = async () => {
            try {
                const L = await loadLeaflet()
                if (!mapRef.current || !kmlData) return

                if (!mapInstance.current) {
                    let center: [number, number] = [50.4501, 30.5234]; // Kyiv default
                    if (city) {
                        const bounds = getCityBounds(city);
                        if (bounds && bounds.center) {
                            center = [bounds.center[1], bounds.center[0]];
                        }
                    }
                    mapInstance.current = L.map(mapRef.current).setView(center, 10);
                }

                const map = mapInstance.current

                // Clear existing
                polygonsRef.current.forEach(p => p.remove())
                markersRef.current.forEach(m => m.remove())
                polygonsRef.current = []
                markersRef.current = []

                // Add tile layer
                const tileUrl = isDark 
                    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                
                L.tileLayer(tileUrl, {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                }).addTo(map)

                const bounds = L.latLngBounds([])
                let hasPoints = false

                // Filter and draw polygons
                const filteredPolygons = kmlData.polygons.filter(p => {
                    const isHubSelected = selectedHubs.length === 0 || selectedHubs.includes((p.folderName || '').trim())
                    return isHubSelected
                })

                filteredPolygons.forEach(p => {
                    const zoneKey = `${(p.folderName || '').trim()}:${(p.name || '').trim()}`
                    const isZoneExplicitlySelected = selectedZones.length === 0 || selectedZones.includes(zoneKey)
                    const isBackground = !isZoneExplicitlySelected

                    const latlngs = p.path.map((pt: any) => [pt.lat, pt.lng])
                    
                    const poly = L.polygon(latlngs, {
                        color: isZoneExplicitlySelected ? '#a855f7' : '#6366f1',
                        weight: isZoneExplicitlySelected ? 3 : 2,
                        opacity: isBackground ? 0.3 : 0.8,
                        fillColor: isZoneExplicitlySelected ? '#c084fc' : '#818cf8',
                        fillOpacity: isBackground ? 0.1 : 0.35
                    }).addTo(map)
                    
                    polygonsRef.current.push(poly)
                    bounds.extend(poly.getBounds())
                    hasPoints = true
                })

                // Filter and draw markers
                const filteredMarkers = selectedHubs.length > 0
                    ? kmlData.markers.filter(m => selectedHubs.includes((m.folderName || '').trim()))
                    : kmlData.markers

                filteredMarkers.forEach(m => {
                    const icon = L.divIcon({
                        className: 'custom-hub-icon',
                        html: `<div style="background-color: #3b82f6; color: white; border: 2px solid white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold;">${m.name.charAt(0)}</div>`,
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    })

                    const marker = L.marker([m.lat, m.lng], { icon, title: m.name }).addTo(map)
                    markersRef.current.push(marker)
                    bounds.extend([m.lat, m.lng])
                    hasPoints = true
                })

                if (hasPoints && bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [20, 20] })
                }

                setIsReady(true)
            } catch (e) {
                console.error('Error initializing Osm KML Preview Map:', e)
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
                style={{ background: isDark ? '#1a1a1a' : '#f0f0f0' }}
            />
            {!isReady && kmlData && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/5 backdrop-blur-[2px] rounded-2xl">
                    <p className={clsx("text-sm font-bold animate-pulse", isDark ? "text-gray-500" : "text-gray-400")}>
                        ЗАГРУЗКА КАРТЫ...
                    </p>
                </div>
            )}
        </div>
    )
}
