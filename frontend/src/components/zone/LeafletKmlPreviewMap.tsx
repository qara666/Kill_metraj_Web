import React from 'react'
import { MapContainer, TileLayer, Polygon, Marker, Popup, ZoomControl } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { clsx } from 'clsx'
import { KMLData } from '../../utils/maps/kmlParser'

interface LeafletKmlPreviewMapProps {
    isDark: boolean
    kmlData: KMLData | null
    selectedHubs: string[]
    selectedZones?: string[]
}

export const LeafletKmlPreviewMap: React.FC<LeafletKmlPreviewMapProps> = ({ isDark, kmlData, selectedHubs, selectedZones = [] }) => {
    if (!kmlData) {
        return (
            <div className={clsx(
                "w-full h-96 rounded-2xl border-2 flex items-center justify-center",
                isDark ? "bg-gray-900 border-gray-700 text-gray-500" : "bg-gray-100 border-gray-200 text-gray-400"
            )}>
                Данные KML не загружены
            </div>
        )
    }

    // Filter polygons
    const filteredPolygons = kmlData.polygons.filter(p => {
        return selectedHubs.length === 0 || selectedHubs.includes((p.folderName || '').trim())
    })

    // Filter markers
    const filteredMarkers = selectedHubs.length > 0
        ? kmlData.markers.filter(m => selectedHubs.includes((m.folderName || '').trim()))
        : kmlData.markers

    const center: [number, number] = [50.4501, 30.5234]

    return (
        <div className="relative">
            <div
                className={clsx(
                    "w-full h-96 rounded-2xl border-2 transition-all overflow-hidden relative z-0",
                    isDark ? "bg-gray-900 border-gray-700 shadow-black/40" : "bg-gray-100 border-gray-200"
                )}
            >
                <MapContainer
                    center={center}
                    zoom={10}
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={false}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url={isDark 
                            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                            : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        }
                    />
                    <ZoomControl position="bottomright" />

                    {filteredPolygons.map((p, idx) => {
                        const zoneKey = `${(p.folderName || '').trim()}:${(p.name || '').trim()}`
                        const isSelected = selectedZones.length === 0 || selectedZones.includes(zoneKey)
                        
                        return (
                            <Polygon
                                key={`poly-${idx}`}
                                positions={p.path.map(pt => [pt.lat, pt.lng] as [number, number])}
                                pathOptions={{
                                    color: isSelected ? '#a855f7' : '#6366f1',
                                    fillColor: isSelected ? '#c084fc' : '#818cf8',
                                    fillOpacity: isSelected ? 0.35 : 0.1,
                                    weight: isSelected ? 3 : 2,
                                    opacity: isSelected ? 0.8 : 0.3
                                }}
                            >
                                <Popup>
                                    <div className="text-xs font-bold">{p.folderName}</div>
                                    <div className="text-xs">{p.name}</div>
                                </Popup>
                            </Polygon>
                        )
                    })}

                    {filteredMarkers.map((m, idx) => (
                        <Marker 
                            key={`marker-${idx}`} 
                            position={[m.lat, m.lng]}
                            icon={new L.DivIcon({
                                html: `<div class="bg-purple-600 text-white rounded-md px-1 py-0.5 text-[8px] font-bold shadow-sm whitespace-nowrap">${m.name}</div>`,
                                className: '',
                                iconAnchor: [15, 15]
                            })}
                        >
                            <Popup>{m.name}</Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </div>
        </div>
    )
}
