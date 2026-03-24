import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { clsx } from 'clsx';
import { useTheme } from '../../contexts/ThemeContext';
import { localStorageUtils } from '../../utils/ui/localStorage';
import { RobustGeocodingService } from '../../services/robust-geocoding/RobustGeocodingService';
import { getCityBounds } from '../../services/robust-geocoding/cityBounds';

// Fix Leaflet marker icons
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface LeafletRouteMapProps {
    route: any;
    onMarkerClick?: (order: any) => void;
}

// Helper component to auto-fit bounds
const BoundsUpdater: React.FC<{ points: L.LatLngExpression[] }> = ({ points }) => {
    const map = useMap();
    useEffect(() => {
        if (points.length >= 2) {
            const bounds = L.latLngBounds(points);
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [points, map]);
    return null;
};

export const LeafletRouteMap: React.FC<LeafletRouteMapProps> = React.memo(({ route, onMarkerClick }) => {
    const { isDark } = useTheme();
    const [points, setPoints] = useState<[number, number][]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadRoute = async () => {
            if (!route) return;
            setIsLoading(true);
            try {
                const cityBias = localStorageUtils.getAllSettings().cityBias || 'Київ';
                const geocoder = new RobustGeocodingService();
                geocoder.setCityBias(cityBias);

                const coords: [number, number][] = [];
                
                // 1. Geocode Start
                const startRes = await geocoder.geocode(route.startAddress);
                if (startRes.best) coords.push([startRes.best.lat, startRes.best.lng]);

                // 2. Geocode Waypoints
                const orderAddresses = route.routeChain || route.waypoints?.map((w: any) => w.address) || [];
                for (const addr of orderAddresses) {
                    const res = await geocoder.geocode(addr);
                    if (res.best) coords.push([res.best.lat, res.best.lng]);
                    // Add small delay for OSM rate limits if needed, though Robust handles it
                }

                // 3. Geocode End
                const endRes = await geocoder.geocode(route.endAddress);
                if (endRes.best) coords.push([endRes.best.lat, endRes.best.lng]);

                setPoints(coords);
            } catch (error) {
                console.error('[LeafletRouteMap] Error loading route:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadRoute();
    }, [route]);

    const markerIcon = (index: number) => new L.DivIcon({
        html: `<div class="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center border-2 border-white font-bold text-[10px] shadow-md">${index}</div>`,
        className: '',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    return (
        <div className="mt-4" onClick={(e) => e.stopPropagation()}>
            <div className={clsx('text-xs font-medium mb-2', isDark ? 'text-gray-200' : 'text-gray-700')}>
                Визуализация маршрута (Leaflet/OSM):
            </div>
            <div
                className="w-full h-64 rounded-lg border overflow-hidden flex items-center justify-center bg-gray-50 bg-opacity-50 relative z-0"
                style={{ minHeight: '256px' }}
                onClick={(e) => e.stopPropagation()}
            >
                {isLoading ? (
                    <div className={clsx('text-xs text-center p-4', isDark ? 'text-gray-400' : 'text-gray-500')}>
                        Загрузка геоданных и карты...
                    </div>
                ) : (
                    <MapContainer
                        center={(() => {
                            if (points.length > 0) return points[0];
                            const cityBias = localStorageUtils.getAllSettings().cityBias || '';
                            if (cityBias) {
                                const bounds = getCityBounds(cityBias);
                                if (bounds && bounds.center) {
                                    return [bounds.center[1], bounds.center[0]] as [number, number];
                                }
                            }
                            return [50.4501, 30.5234]; // Kyiv default
                        })()}
                        zoom={points.length > 0 ? 13 : 11}
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
                        
                        {points.length > 0 && (
                            <>
                                <Polyline positions={points} color="#2563eb" weight={4} opacity={0.7} dashArray="5, 8" />
                                {points.map((pos, idx) => (
                                    <Marker 
                                        key={idx} 
                                        position={pos} 
                                        icon={markerIcon(idx)}
                                        eventHandlers={{
                                            click: () => {
                                                if (onMarkerClick && idx > 0 && idx < points.length - 1) {
                                                    const orderIdx = idx - 1;
                                                    const fullOrder = (route.routeChainFull || [])[orderIdx];
                                                    if (fullOrder) onMarkerClick(fullOrder);
                                                }
                                            }
                                        }}
                                    >
                                        <Popup>
                                            <div className="text-xs">
                                                {idx === 0 ? 'Начало' : idx === points.length - 1 ? 'Конец' : `Заказ ${idx}`}
                                            </div>
                                        </Popup>
                                    </Marker>
                                ))}
                                <BoundsUpdater points={points} />
                            </>
                        )}

                        {points.length === 0 && !isLoading && (
                             <div className="absolute inset-x-0 bottom-4 z-[1000] flex justify-center pointer-events-none">
                                <div className={clsx(
                                    "px-4 py-2 rounded-xl text-xs font-bold shadow-lg backdrop-blur-md border",
                                    isDark ? "bg-gray-800/90 border-gray-700 text-gray-400" : "bg-white/90 border-gray-200 text-gray-500"
                                )}>
                                    Ожидание данных маршрута...
                                </div>
                             </div>
                        )}
                    </MapContainer>
                )}
            </div>
        </div>
    );
});
