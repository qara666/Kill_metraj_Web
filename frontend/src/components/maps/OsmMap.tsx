import React, { useRef, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { useTheme } from '../../contexts/ThemeContext';
import { loadLeaflet } from '../../utils/maps/leafletLoader';
import { GeocodingService } from '../../services/geocodingService';
import { routeOptimizationCache } from '../../utils/routes/routeOptimizationCache';

interface OsmMapProps {
    route: any;
    onMarkerClick?: (order: any) => void;
}

export const OsmMap: React.FC<OsmMapProps> = React.memo(({ route, onMarkerClick }) => {
    const { isDark } = useTheme();
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const markersRef = useRef<any[]>([]);
    const polylineRef = useRef<any>(null);
    const [isMapReady, setIsMapReady] = useState(false);

    useEffect(() => {
        if (!mapContainerRef.current || !route) return;

        const initMap = async () => {
            try {
                const L = await loadLeaflet();
                if (!mapContainerRef.current) return;

                // Create map instance if not exists
                if (!mapInstanceRef.current) {
                    const map = L.map(mapContainerRef.current).setView([50.4501, 30.5234], 12);
                    mapInstanceRef.current = map;
                }

                const map = mapInstanceRef.current;

                // Clear previous layers
                markersRef.current.forEach(m => m.remove());
                markersRef.current = [];
                if (polylineRef.current) {
                    polylineRef.current.remove();
                    polylineRef.current = null;
                }

                // Add tile layer
                const tileUrl = isDark 
                    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
                
                const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
                
                L.tileLayer(tileUrl, { attribution }).addTo(map);

                // Helper to create circle marker
                const createMarker = (latlng: [number, number], label: string, title: string, color: string = '#3b82f6') => {
                    const icon = L.divIcon({
                        className: 'custom-div-icon',
                        html: `<div style="background-color: ${color}; color: white; border: 2px solid white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${label}</div>`,
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    });

                    const marker = L.marker(latlng, { icon, title }).addTo(map);
                    markersRef.current.push(marker);
                    return marker;
                };

                // Helper to get coordinates for an address
                const getCoords = async (address: string, order?: any): Promise<[number, number] | null> => {
                    if (order?.coords?.lat && order?.coords?.lng) {
                        return [Number(order.coords.lat), Number(order.coords.lng)];
                    }
                    const cached = routeOptimizationCache.getCoordinates(address);
                    if (cached && typeof cached.lat === 'number' && typeof cached.lng === 'number') {
                        return [cached.lat, cached.lng];
                    }

                    const results = await GeocodingService.geocodeAddressMulti(address);
                    if (results.length > 0 && results[0].success && 
                        typeof results[0].latitude === 'number' && 
                        typeof results[0].longitude === 'number') {
                        return [results[0].latitude, results[0].longitude];
                    }
                    return null;
                };

                const orderAddresses = route.routeChain || route.waypoints?.map((w: any) => w.address) || [];
                const routeChainFull = route.routeChainFull || [];

                const polylineCoords: [number, number][] = [];

                // Start point
                if (route.startAddress) {
                    const startCoords = await getCoords(route.startAddress);
                    if (startCoords) {
                        polylineCoords.push(startCoords);
                        createMarker(startCoords, 'S', 'Старт', '#10b981');
                    }
                }

                // Orders
                for (let i = 0; i < orderAddresses.length; i++) {
                    const addr = orderAddresses[i];
                    const fullOrder = routeChainFull[i];
                    const coords = await getCoords(addr, fullOrder);
                    
                    if (coords) {
                        polylineCoords.push(coords);
                        const markerLabel = String(i + 1);
                        const orderNum = fullOrder?.orderNumber || (route.orderNumbers && route.orderNumbers[i]) || markerLabel;
                        const marker = createMarker(coords, markerLabel, `Заказ ${orderNum}: ${addr}`);
                        
                        if (onMarkerClick && fullOrder) {
                            marker.on('click', () => onMarkerClick(fullOrder));
                        }
                    }
                }

                // End point
                if (route.endAddress) {
                    const endCoords = await getCoords(route.endAddress);
                    if (endCoords) {
                        polylineCoords.push(endCoords);
                        createMarker(endCoords, 'E', 'Финиш', '#ef4444');
                    }
                }

                // Draw polyline
                if (polylineCoords.length >= 2) {
                    const polyline = L.polyline(polylineCoords, {
                        color: '#3b82f6',
                        weight: 4,
                        opacity: 0.8,
                        smoothFactor: 1
                    }).addTo(map);
                    polylineRef.current = polyline;

                    // Fit bounds
                    map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
                }

                setIsMapReady(true);
            } catch (error) {
                console.error('OSM Map initialization failed:', error);
            }
        };

        initMap();

        return () => {
            // Cleanup markers safely
            markersRef.current.forEach(m => m.remove());
            markersRef.current = [];
            if (polylineRef.current) {
                polylineRef.current.remove();
                polylineRef.current = null;
            }
        };
    }, [route, isDark, onMarkerClick]);

    return (
        <div className="mt-4" onClick={(e) => e.stopPropagation()}>
            <div className={clsx('text-xs font-medium mb-2', isDark ? 'text-gray-200' : 'text-gray-700')}>
                Визуализация маршрута (OpenStreetMap):
            </div>
            <div
                ref={mapContainerRef}
                className="w-full h-64 rounded-lg border overflow-hidden"
                style={{ minHeight: '256px', background: isDark ? '#1a1a1a' : '#f0f0f0' }}
                onClick={(e) => e.stopPropagation()}
            />
            {!isMapReady && (
                <div className={clsx('text-xs mt-2', isDark ? 'text-gray-400' : 'text-gray-500')}>
                    Загрузка карты (OSM)...
                </div>
            )}
        </div>
    );
});
