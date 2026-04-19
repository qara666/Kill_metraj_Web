import React, { useMemo, useState, useEffect, useRef, memo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, ZoomControl, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { clsx } from 'clsx';
import { localStorageUtils } from '../../utils/ui/localStorage';
import { YapikoOSRMService } from '../../services/YapikoOSRMService';

const decodePolyline = (str: string, precision = 5) => {
    let index = 0, lat = 0, lng = 0, coordinates = [], shift = 0, result = 0, byte = null, lat_change, lng_change, factor = Math.pow(10, precision);
    while (index < str.length) {
        byte = null; shift = 0; result = 0;
        do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
        lat_change = ((result & 1) ? ~(result >> 1) : (result >> 1)); lat += lat_change;
        byte = null; shift = 0; result = 0;
        do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
        lng_change = ((result & 1) ? ~(result >> 1) : (result >> 1)); lng += lng_change;
        coordinates.push([lat / factor, lng / factor]);
    }
    return coordinates;
};

// Fix Leaflet marker icons
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface LeafletCourierMapProps {
    routes: any[];
    isDark: boolean;
    isAnimating?: boolean;
    showZones?: boolean;
    showLabels?: boolean;
    isSatellite?: boolean;
    focusTrigger?: number;
}

const BoundsUpdater = memo(({ routes, focusTrigger }: { routes: any[], focusTrigger?: number }) => {
    const map = useMap();
    useEffect(() => {
        if (!routes.length) return;
        const allPoints: L.LatLngExpression[] = [];
        routes.forEach(r => {
            if (r.geometryPoints) allPoints.push(...r.geometryPoints);
            else if (r.orders) {
                r.orders.forEach((o: any) => {
                    const c = o.coords || { lat: o.lat, lng: o.lng };
                    if (c?.lat && c?.lng) allPoints.push([Number(c.lat), Number(c.lng)]);
                });
            }
            const start = r.startCoords || r.route_data?.startCoords;
            if (start?.lat && start?.lng) allPoints.push([Number(start.lat), Number(start.lng)]);
        });
        if (allPoints.length > 0) {
            const bounds = L.latLngBounds(allPoints);
            const timer = setTimeout(() => {
                map.fitBounds(bounds, { padding: [100, 100], animate: true, duration: 1 });
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [routes, map, focusTrigger]);
    return null;
});

const RouteLayer = memo(({ route, color, index, isAnimating, showLabels }: { route: any; color: string; index: number; isAnimating?: boolean; showLabels?: boolean }) => {
    const [geometry, setGeometry] = useState<[number, number][]>([]);
    const [visiblePoints, setVisiblePoints] = useState<[number, number][]>([]);
    const [animationProgress, setAnimationProgress] = useState(0);

    useEffect(() => {
        const fetchGeo = async () => {
            if (route.geometry) {
                setGeometry(decodePolyline(route.geometry) as [number, number][]);
                return;
            }
            try {
                const presets = localStorageUtils.getAllSettings();
                const osrmUrl = presets.osrmUrl || 'http://osrm.yapiko.kh.ua:5050';
                const start = route.startCoords || route.route_data?.startCoords || { lat: 50.4501, lng: 30.5234 };
                const locs = [start, ...route.orders.map((o: any) => o.coords || { lat: o.lat, lng: o.lng }), start];
                const res = await YapikoOSRMService.calculateRoute(locs, osrmUrl);
                if (res.feasible && res.geometry) {
                    setGeometry(decodePolyline(res.geometry) as [number, number][]);
                }
            } catch (e) { }
        };
        fetchGeo();
    }, [route.id, route.orders?.length]);

    const points = useMemo(() => {
        if (geometry.length > 0) return geometry;
        const coords: [number, number][] = [];
        const start = route.startCoords || route.route_data?.startCoords;
        if (start?.lat && start?.lng) coords.push([Number(start.lat), Number(start.lng)]);
        (route.orders || []).forEach((o: any) => {
            const c = o.coords || { lat: o.lat, lng: o.lng };
            if (c?.lat && c?.lng) coords.push([Number(c.lat), Number(c.lng)]);
        });
        if (start?.lat && start?.lng) coords.push([Number(start.lat), Number(start.lng)]);
        return coords;
    }, [route, geometry]);

    useEffect(() => {
        if (!isAnimating) {
            setVisiblePoints(points);
            setAnimationProgress(100);
            return;
        }
        let step = 0;
        const totalSteps = points.length;
        const intervalTime = Math.max(80, 8000 / totalSteps); 
        const interval = setInterval(() => {
            step += 1;
            if (step > totalSteps) clearInterval(interval);
            else {
                setVisiblePoints(points.slice(0, step));
                setAnimationProgress((step / totalSteps) * 100);
            }
        }, intervalTime);
        return () => clearInterval(interval);
    }, [isAnimating, points]);

    const markerIcon = (idx: number, order: any) => new L.DivIcon({
        html: `<div class="rounded-full flex flex-col items-center justify-center border-2 border-white font-black text-[9px] shadow-lg transition-opacity duration-700 bg-white text-slate-800 border-slate-200 w-8 h-8">
            <span>${idx}</span>
            ${showLabels ? `<span class="absolute top-10 bg-slate-900 text-white px-2 py-0.5 rounded text-[7px] font-black shadow-xl ring-1 ring-white/20">#${order.orderNumber}</span>` : ''}
        </div>`,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });

    return (
        <>
            {isAnimating && <Polyline positions={points} color={color} weight={4} opacity={0.05} lineCap="round" lineJoin="round" smoothFactor={2} />}
            <Polyline positions={visiblePoints} color={color} weight={7} opacity={0.8} lineCap="round" lineJoin="round" smoothFactor={1.5} />
            <Polyline positions={visiblePoints} color="white" weight={2} opacity={0.3} lineCap="round" lineJoin="round" smoothFactor={1.5} />
            
            {(route.orders || []).map((o: any, idx: number) => {
                const c = o.coords || { lat: o.lat, lng: o.lng };
                if (!c?.lat || !c?.lng) return null;
                const orderProgressThreshold = ((idx + 1) / ((route.orders?.length || 1) + 1)) * 100;
                if (isAnimating && animationProgress < orderProgressThreshold) return null;
                return (
                    <Marker key={`${idx}`} position={[Number(c.lat), Number(c.lng)]} icon={markerIcon(idx + 1, o)}>
                        <Popup><div className="p-2 text-[10px] font-bold">#{o.orderNumber}<br/><span className="font-normal opacity-60 uppercase">{o.address}</span></div></Popup>
                    </Marker>
                );
            })}
        </>
    );
});

const ZoneLayer = memo(({ routes }: { routes: any[] }) => {
    const zones = useMemo(() => {
        const data: Record<string, [number, number][]> = {};
        routes.forEach(r => {
            (r.orders || []).forEach((o: any) => {
                const z = o.deliveryZone || 'Default';
                const c = o.coords || { lat: o.lat, lng: o.lng };
                if (c?.lat && c?.lng) {
                    if (!data[z]) data[z] = [];
                    data[z].push([Number(c.lat), Number(c.lng)]);
                }
            });
        });
        return data;
    }, [routes]);

    return (
        <>
            {Object.entries(zones).map(([name, points], idx) => {
                if (points.length < 1) return null;
                const center = points.reduce((a, b) => [a[0] + b[0]/points.length, a[1] + b[1]/points.length], [0, 0]);
                return (
                    <React.Fragment key={name}>
                        <Circle 
                            center={center as [number, number]} 
                            radius={2000} 
                            pathOptions={{ 
                                fillColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'][idx % 4], 
                                fillOpacity: 0.15, 
                                color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'][idx % 4], 
                                weight: 2,
                                dashArray: '10, 10'
                            }} 
                        />
                        <Marker position={center as [number, number]} icon={new L.DivIcon({
                            html: `<div class="bg-white/90 backdrop-blur px-3 py-1 rounded-full border border-slate-200 text-[9px] font-black uppercase text-slate-700 shadow-xl whitespace-nowrap">${name}</div>`,
                            className: '',
                            iconSize: [100, 24],
                            iconAnchor: [50, 12]
                        })} />
                    </React.Fragment>
                );
            })}
        </>
    );
});

export const LeafletCourierMap: React.FC<LeafletCourierMapProps> = memo(({ routes, isDark, isAnimating, showZones, showLabels, isSatellite, focusTrigger }) => {
    const colors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    const center = useMemo<[number, number]>(() => [50.4501, 30.5234], []);

    return (
        <div className="w-full h-full relative z-0 bg-[#f8fafc]">
            <MapContainer 
              center={center} 
              zoom={12} 
              style={{ height: '100%', width: '100%' }} 
              zoomControl={false}
              preferCanvas={true}
              wheelPxPerZoomLevel={120}
              zoomSnap={0.5}
            >
                {isSatellite ? (
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Esri" />
                ) : (
                    <TileLayer url={isDark ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"} />
                )}
                <ZoomControl position="bottomright" />
                {routes.map((route, idx) => <RouteLayer key={route.id || idx} route={route} index={idx} color={colors[idx % colors.length]} isAnimating={isAnimating} showLabels={showLabels} />)}
                {showZones && <ZoneLayer routes={routes} />}
                <BoundsUpdater routes={routes} focusTrigger={focusTrigger} />
            </MapContainer>
        </div>
    );
});
