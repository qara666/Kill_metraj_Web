import React, { useRef, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { useTheme } from '../../contexts/ThemeContext';
import { localStorageUtils } from '../../utils/ui/localStorage';
import { routeOptimizationCache } from '../../utils/routes/routeOptimizationCache';
import { googleMapsLoader } from '../../utils/maps/googleMapsLoader';

interface RouteMapProps {
    route: any;
    onMarkerClick?: (order: any) => void;
}

export const RouteMap: React.FC<RouteMapProps> = React.memo(({ route, onMarkerClick }) => {
    const { isDark } = useTheme();
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const directionsRendererRef = useRef<any>(null);
    const markersRef = useRef<any[]>([]);
    const [isMapReady, setIsMapReady] = useState(false);

    useEffect(() => {
        // Очищаем предыдущие маркеры
        markersRef.current.forEach(marker => marker.setMap(null));
        markersRef.current = [];
        if (!mapRef.current || !route) return;

        const initMap = async () => {
            try {
                await googleMapsLoader.load();
                const gmaps = (window as any).google?.maps;
                if (!gmaps) return;

                // Создаём карту
                const map = new gmaps.Map(mapRef.current!, {
                    zoom: 12,
                    center: { lat: 50.4501, lng: 30.5234 }, // Киев по умолчанию
                    mapTypeControl: true,
                    streetViewControl: false,
                    fullscreenControl: true,
                });

                mapInstanceRef.current = map;

                // Создаём рендерер маршрутов
                const directionsRenderer = new gmaps.DirectionsRenderer({
                    map,
                    suppressMarkers: true,
                    polylineOptions: {
                        strokeColor: '#2563eb',
                        strokeWeight: 5,
                        strokeOpacity: 0.9,
                    },
                    preserveViewport: true,
                });
                directionsRendererRef.current = directionsRenderer;

                const geocoder = new gmaps.Geocoder();
                const city = localStorageUtils.getAllSettings().cityBias || 'Киев';
                const cityAppend = `, ${city}, Украина`;

                const geocodeAddress = (address: string): Promise<any> => {
                    return new Promise((resolve) => {
                        geocoder.geocode(
                            {
                                address: address.includes(city) ? address : `${address}${cityAppend}`,
                                region: 'ua',
                            },
                            (results: any, status: any) => {
                                if (status === 'OK' && results && results.length > 0) {
                                    resolve(results[0].geometry.location);
                                } else {
                                    resolve(null);
                                }
                            }
                        );
                    });
                };

                const orderAddresses = route.routeChain || route.waypoints?.map((w: any) => w.address) || [];

                const getOrderCoordinates = async (order: any, address: string): Promise<any> => {
                    if (order?.coords && order.coords.lat && order.coords.lng) {
                        return new gmaps.LatLng(order.coords.lat, order.coords.lng);
                    }
                    const cached = routeOptimizationCache.getCoordinates(address);
                    if (cached) {
                        return new gmaps.LatLng(cached.lat, cached.lng);
                    }
                    const loc = await geocodeAddress(address);
                    return loc ? new gmaps.LatLng(loc.lat(), loc.lng()) : null;
                };

                const fullAddresses = [
                    route.startAddress,
                    ...orderAddresses,
                    route.endAddress
                ].filter(Boolean);

                if (fullAddresses.length > 0 && orderAddresses.length > 0) {
                    const allLocations = [];

                    const startLoc = await geocodeAddress(route.startAddress);
                    if (startLoc) allLocations.push(new gmaps.LatLng(startLoc.lat(), startLoc.lng()));

                    const routeChainFull = route.routeChainFull || [];
                    for (let i = 0; i < orderAddresses.length; i++) {
                        const address = orderAddresses[i];
                        const fullOrder = routeChainFull[i];
                        const loc = await getOrderCoordinates(fullOrder, address);
                        if (loc) allLocations.push(loc);
                    }

                    const endLoc = await geocodeAddress(route.endAddress);
                    if (endLoc) allLocations.push(new gmaps.LatLng(endLoc.lat(), endLoc.lng()));

                    if (allLocations.length >= 2) {
                        if (allLocations.length > 1) {
                            map.setCenter(allLocations[1]);
                        }

                        const directionsService = new gmaps.DirectionsService();
                        const origin = allLocations[0];
                        const destination = allLocations[allLocations.length - 1];
                        const waypoints = allLocations.slice(1, -1).map((loc: any) => ({
                            location: loc,
                            stopover: true,
                        }));

                        directionsService.route(
                            {
                                origin,
                                destination,
                                waypoints: waypoints.length > 0 ? waypoints : undefined,
                                travelMode: gmaps.TravelMode.DRIVING,
                                optimizeWaypoints: false,
                                unitSystem: gmaps.UnitSystem.METRIC,
                            },
                            (result: any, status: any) => {
                                if (status === 'OK' && result) {
                                    directionsRenderer.setDirections(result);
                                    const routeData = result.routes[0];
                                    const legs = routeData.legs || [];

                                    for (let idx = 0; idx < routeChainFull.length && idx < legs.length; idx++) {
                                        const leg = legs[idx];
                                        const endLocation = leg.end_location;
                                        const fullOrder = routeChainFull[idx];
                                        const orderAddress = orderAddresses[idx] || '';

                                        const orderNum = fullOrder?.orderNumber || route.orderNumbers?.[idx] || String(idx + 1);
                                        const markerLabel = String(idx + 1);

                                        const marker = new gmaps.Marker({
                                            position: endLocation,
                                            map,
                                            label: {
                                                text: markerLabel,
                                                color: '#ffffff',
                                                fontSize: '14px',
                                                fontWeight: 'bold',
                                            },
                                            icon: {
                                                path: gmaps.SymbolPath.CIRCLE,
                                                scale: 12,
                                                fillColor: '#3b82f6',
                                                fillOpacity: 1,
                                                strokeColor: '#ffffff',
                                                strokeWeight: 3,
                                                labelOrigin: new gmaps.Point(0, 0),
                                            },
                                            title: `Заказ ${orderNum}: ${orderAddress}`,
                                            zIndex: gmaps.Marker.MAX_ZINDEX + idx,
                                        });

                                        if (onMarkerClick && fullOrder) {
                                            marker.addListener('click', () => {
                                                const orderData = {
                                                    ...fullOrder,
                                                    raw: fullOrder.raw || fullOrder,
                                                    readyAt: fullOrder.readyAt,
                                                    deadlineAt: fullOrder.deadlineAt,
                                                    readyAtSource: fullOrder.readyAtSource,
                                                    deadlineAtSource: fullOrder.deadlineAtSource,
                                                    coords: fullOrder.coords,
                                                };
                                                onMarkerClick(orderData);
                                            });
                                        }
                                        markersRef.current.push(marker);
                                    }

                                    if (!isMapReady) {
                                        const bounds = routeData.bounds;
                                        if (bounds) {
                                            map.fitBounds(bounds, {
                                                top: 50,
                                                right: 50,
                                                bottom: 50,
                                                left: 50,
                                            });
                                        }
                                    }
                                    setIsMapReady(true);
                                }
                            }
                        );
                    } else if (allLocations.length === 3 && orderAddresses.length === 1) {
                        map.setCenter(allLocations[1]);
                        map.setZoom(13);
                        setIsMapReady(true);
                    }
                }
            } catch (error) {
                console.error('Ошибка инициализации карты:', error);
            }
        };

        initMap();

        return () => {
            markersRef.current.forEach(marker => marker.setMap(null));
            markersRef.current = [];
            if (directionsRendererRef.current) {
                directionsRendererRef.current.setMap(null);
            }
        };
    }, [route, onMarkerClick, isMapReady]);

    return (
        <div className="mt-4" onClick={(e) => e.stopPropagation()}>
            <div className={clsx('text-xs font-medium mb-2', isDark ? 'text-gray-200' : 'text-gray-700')}>
                Визуализация маршрута:
            </div>
            <div
                ref={mapRef}
                className="w-full h-64 rounded-lg border overflow-hidden"
                style={{ minHeight: '256px' }}
                onClick={(e) => e.stopPropagation()}
            />
            {!isMapReady && (
                <div className={clsx('text-xs mt-2', isDark ? 'text-gray-400' : 'text-gray-500')}>
                    Загрузка карты...
                </div>
            )}
        </div>
    );
});
