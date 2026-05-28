import React, { useMemo, useState, useEffect, useRef, memo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, ZoomControl, useMap, Circle, Polygon, Tooltip } from 'react-leaflet';
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

// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

const bearing = (from: [number, number], to: [number, number]): number => {
    const dLng = to[1] - from[1];
    const dLat = to[0] - from[0];
    const angle = Math.atan2(dLng, dLat) * (180 / Math.PI);
    return (angle + 360) % 360;
};

const arrowIcon = (angle: number, color: string) => new L.DivIcon({
    html: `<div style="
        width:0;height:0;
        border-left:6px solid transparent;
        border-right:6px solid transparent;
        border-bottom:12px solid ${color};
        filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5));
        transform:rotate(${angle}deg);
    "></div>`,
    className: '',
    iconSize: [0, 0],
    iconAnchor: [0, 0]
});

const HUB_ICON = new L.DivIcon({
    html: `<div style="
        background:linear-gradient(135deg,#1d4ed8,#3b82f6);
        border:3px solid rgba(255,255,255,0.9);
        border-radius:10px;
        width:42px;height:42px;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 4px 20px rgba(29,78,216,0.6),0 0 0 4px rgba(29,78,216,0.15);
        font-size:10px;font-weight:900;color:#fff;letter-spacing:0.05em;
    ">ХАБ</div>`,
    className: '',
    iconSize: [42, 42],
    iconAnchor: [21, 21]
});

const distanceBadgeIcon = (dist: string, color: string) => new L.DivIcon({
    html: `<div style="
        background:${color};
        color:white;
        padding:3px 10px;
        border-radius:20px;
        font-size:10px;
        font-weight:900;
        font-family:system-ui,sans-serif;
        letter-spacing:0.05em;
        white-space:nowrap;
        box-shadow:0 2px 8px rgba(0,0,0,0.3);
        border:2px solid rgba(255,255,255,0.85);
    ">${dist}</div>`,
    className: '',
    iconSize: [0, 0],
    iconAnchor: [0, 0]
});

const endDotIcon = (color: string) => new L.DivIcon({
    html: `<div style="
        width:16px;height:16px;
        border-radius:50%;
        background:${color};
        border:3px solid white;
        box-shadow:0 2px 8px rgba(0,0,0,0.35);
    "></div>`,
    className: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
});

interface LeafletCourierMapProps {
    routes: any[];
    isDark: boolean;
    isAnimating?: boolean;
    showZones?: boolean;
    showLabels?: boolean;
    isSatellite?: boolean;
    focusTrigger?: number;
    lowPerfMode?: boolean;
    kmlPolygons?: any[];
    onRouteSelect?: (index: number | null) => void;
}

const BoundsUpdater = memo(({ routes, focusTrigger }: { routes: any[]; focusTrigger?: number }) => {
    const map = useMap();
    const routesRef = useRef(routes);
    routesRef.current = routes;
    const prevTrigger = useRef(0);
    useEffect(() => {
        if (!focusTrigger && !prevTrigger.current) return;
        if (focusTrigger === prevTrigger.current) return;
        prevTrigger.current = focusTrigger ?? 0;
        const allPoints: L.LatLngExpression[] = [];
        routesRef.current.forEach(r => {
            const start = r.startCoords || r.route_data?.startCoords || r.geoMeta?.origin;
            if (start?.lat && start?.lng) allPoints.push([Number(start.lat), Number(start.lng)]);
            const end = r.endCoords || r.route_data?.endCoords || r.geoMeta?.destination;
            if (end?.lat && end?.lng) allPoints.push([Number(end.lat), Number(end.lng)]);
            (r.orders || []).forEach((o: any) => {
                const c = o.coords || { lat: o.lat, lng: o.lng };
                if (c?.lat && c?.lng) allPoints.push([Number(c.lat), Number(c.lng)]);
            });
        });
        if (allPoints.length > 0) {
            try { map.fitBounds(L.latLngBounds(allPoints), { padding: [60, 60], animate: true, duration: 0.5 }); }
            catch (e) {}
        }
    }, [focusTrigger, map]);
    return null;
});

const HubMarker = memo(({ routes }: { routes: any[] }) => {
    const hubPos = useMemo(() => {
        if (!routes.length) return null;
        const r = routes[0];
        const start = r.startCoords || r.route_data?.startCoords || r.geoMeta?.origin;
        if (start?.lat && start?.lng) return [Number(start.lat), Number(start.lng)] as [number, number];
        const presets = localStorageUtils.getAllSettings();
        if (presets.defaultStartLat && presets.defaultStartLng) return [Number(presets.defaultStartLat), Number(presets.defaultStartLng)] as [number, number];
        return null;
    }, [routes]);
    if (!hubPos) return null;
    return (
        <Marker position={hubPos as L.LatLngExpression} icon={HUB_ICON}>
            <Popup>
                <div style={{ fontFamily: 'system-ui,sans-serif', padding: '2px 0' }}>
                    <b style={{ fontSize: 12 }}>ХАБ / Старт</b>
                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>
                        {hubPos[0].toFixed(5)}, {hubPos[1].toFixed(5)}
                    </div>
                    <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>{routes.length} маршрутов</div>
                </div>
            </Popup>
        </Marker>
    );
});

const ArrowMarkers = memo(({ points, color }: { points: [number, number][]; color: string }) => {
    const arrowPositions = useMemo(() => {
        if (points.length < 3) return [];
        const positions: { pos: [number, number]; angle: number }[] = [];
        const totalLen = points.length;
        const fractions = totalLen > 12 ? [0.2, 0.4, 0.6, 0.8] : totalLen > 6 ? [0.25, 0.5, 0.75] : [0.33, 0.66];
        for (const frac of fractions) {
            const idx = Math.floor(frac * (totalLen - 1));
            const p1 = points[Math.max(0, idx)];
            const p2 = points[Math.min(totalLen - 1, idx + 1)];
            if (p1 && p2) {
                const mid: [number, number] = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
                const angle = bearing(p1, p2);
                positions.push({ pos: mid, angle });
            }
        }
        return positions;
    }, [points]);

    return (
        <>
            {arrowPositions.map((ap, i) => (
                <Marker key={i} position={ap.pos} icon={arrowIcon(ap.angle, color)} interactive={false} />
            ))}
        </>
    );
});

const RouteDistanceLabel = memo(({ points, distance, color }: { points: [number, number][]; distance: number; color: string }) => {
    const pos = useMemo(() => {
        if (!points.length) return null;
        const idx = Math.floor(points.length * 0.15);
        return points[Math.min(idx, points.length - 1)];
    }, [points]);
    if (!pos || distance <= 0) return null;
    return (
        <Marker position={pos} icon={distanceBadgeIcon(`${distance.toFixed(1)} км`, color)} interactive={false} />
    );
});

const RouteLayer = memo(({ route, color, index, isAnimating, showLabels }: { route: any; color: string; index: number; isAnimating?: boolean; showLabels?: boolean }) => {
    const [geometry, setGeometry] = useState<[number, number][]>([]);
    const [visiblePoints, setVisiblePoints] = useState<[number, number][]>([]);
    const [animationProgress, setAnimationProgress] = useState(0);

    useEffect(() => {
        if (route.geometry) { setGeometry(decodePolyline(route.geometry) as [number, number][]); return; }
        if (route.geometryPoints) { setGeometry(route.geometryPoints as [number, number][]); return; }
        const fetchGeo = async () => {
            try {
                const presets = localStorageUtils.getAllSettings();
                const osrmUrl = presets.osrmUrl || 'http://116.204.153.171:5050';
                const start = route.startCoords || route.route_data?.startCoords || route.geoMeta?.origin || { lat: 50.4501, lng: 30.5234 };
                const end = route.endCoords || route.route_data?.endCoords || route.geoMeta?.destination || start;
                const validOrders = (route.orders || []).filter((o: any) => {
                    const c = o.coords || { lat: o.lat, lng: o.lng };
                    return c?.lat && c?.lng && c.lat !== 0 && c.lng !== 0;
                });
                if (!validOrders.length && start.lat === end.lat && start.lng === end.lng) return;
                const locs = [start, ...validOrders.map((o: any) => o.coords || { lat: o.lat, lng: o.lng }), end];
                const res = await YapikoOSRMService.calculateRoute(locs, osrmUrl);
                if (res.feasible && res.geometry) setGeometry(decodePolyline(res.geometry) as [number, number][]);
            } catch (e) { }
        };
        fetchGeo();
    }, [route.id, route.orders?.length]);

    const points = useMemo((): [number, number][] => {
        if (geometry.length > 0) return geometry;
        const coords: [number, number][] = [];
        const start = route.startCoords || route.route_data?.startCoords || route.geoMeta?.origin;
        if (start?.lat && start?.lng) coords.push([Number(start.lat), Number(start.lng)]);
        (route.orders || []).forEach((o: any) => {
            const c = o.coords || { lat: o.lat, lng: o.lng };
            if (c?.lat && c?.lng) coords.push([Number(c.lat), Number(c.lng)]);
        });
        const end = route.endCoords || route.route_data?.endCoords || route.geoMeta?.destination;
        if (end?.lat && end?.lng) coords.push([Number(end.lat), Number(end.lng)]);
        return coords;
    }, [route, geometry]);

    useEffect(() => {
        if (!isAnimating) { setVisiblePoints(points); setAnimationProgress(100); return; }
        let step = 0;
        const totalSteps = points.length;
        const intervalTime = Math.max(120, 15000 / totalSteps);
        const interval = setInterval(() => {
            step += 1;
            if (step > totalSteps) clearInterval(interval);
            else { setVisiblePoints(points.slice(0, step)); setAnimationProgress((step / totalSteps) * 100); }
        }, intervalTime);
        return () => clearInterval(interval);
    }, [isAnimating, points]);

    const markerIcon = (idx: number, order: any) => new L.DivIcon({
        html: `<div style="
            display:flex;flex-direction:column;align-items:center;justify-content:center;
            width:32px;height:32px;border-radius:50%;
            background:white;border:3px solid ${color};
            font-size:10px;font-weight:900;color:${color};
            box-shadow:0 2px 8px rgba(0,0,0,0.15);
        "><span>${idx}</span>
        ${showLabels ? `<span style="
            position:absolute;top:34px;
            background:rgba(0,0,0,0.8);color:white;
            padding:2px 6px;border-radius:4px;
            font-size:8px;font-weight:700;white-space:nowrap;
            box-shadow:0 1px 4px rgba(0,0,0,0.3);
        ">#${order.orderNumber}</span>` : ''}
        </div>`,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });

    const isAnimatingActive = isAnimating && animationProgress < 100;
    const showEnd = points.length > 2 && !isAnimatingActive;
    const endPos = showEnd ? points[points.length - 1] : null;

    return (
        <>
            <Polyline positions={isAnimatingActive ? points : visiblePoints} color={color} weight={10} opacity={0.12} lineCap="round" lineJoin="round" smoothFactor={1.5} />
            <Polyline positions={visiblePoints} color={color} weight={6} opacity={0.85} lineCap="round" lineJoin="round" smoothFactor={1.5} />
            <Polyline positions={visiblePoints} color="white" weight={2} opacity={0.3} lineCap="round" lineJoin="round" smoothFactor={1.5} />

            {!isAnimatingActive && visiblePoints.length > 2 && <ArrowMarkers points={visiblePoints} color={color} />}
            {!isAnimatingActive && route.totalDistance > 0 && <RouteDistanceLabel points={visiblePoints} distance={route.totalDistance} color={color} />}

            {endPos && <Marker position={endPos} icon={endDotIcon(color)} interactive={false} />}

            {(route.orders || []).map((o: any, idx: number) => {
                const c = o.coords || { lat: o.lat, lng: o.lng };
                if (!c?.lat || !c?.lng) return null;
                const threshold = ((idx + 1) / ((route.orders?.length || 1) + 1)) * 100;
                if (isAnimatingActive && animationProgress < threshold) return null;
                return (
                    <Marker key={`${idx}`} position={[Number(c.lat), Number(c.lng)]} icon={markerIcon(idx + 1, o)}>
                        <Popup>
                            <div style={{ padding: '4px 0', fontFamily: 'system-ui,sans-serif' }}>
                                <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 3 }}>#{o.orderNumber}</div>
                                <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{o.address}</div>
                                {o.deliveryZone ? <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 3 }}>Зона: {o.deliveryZone}</div> : null}
                            </div>
                        </Popup>
                    </Marker>
                );
            })}
        </>
    );
});

const ZoneLayer = memo(({ routes }: { routes: any[] }) => {
    const zones = useMemo(() => {
        const data: Record<string, [number, number][]> = {};
        routes.forEach(r => (r.orders || []).forEach((o: any) => {
            const z = o.deliveryZone || 'Default';
            const c = o.coords || { lat: o.lat, lng: o.lng };
            if (c?.lat && c?.lng) {
                if (!data[z]) data[z] = [];
                data[z].push([Number(c.lat), Number(c.lng)]);
            }
        }));
        return data;
    }, [routes]);

    return (
        <>
            {Object.entries(zones).map(([name, pts], idx) => {
                if (pts.length < 1) return null;
                const center = pts.reduce((a, b) => [a[0] + b[0]/pts.length, a[1] + b[1]/pts.length], [0, 0]);
                const zColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
                return (
                    <React.Fragment key={name}>
                        <Circle center={center as [number, number]} radius={2500}
                            pathOptions={{ fillColor: zColors[idx % 5], fillOpacity: 0.2, color: zColors[idx % 5], weight: 3, dashArray: '15, 15' }}
                        />
                        <Marker position={center as [number, number]} icon={new L.DivIcon({
                            html: `<div style="background:white;padding:4px 12px;border-radius:20px;border:1px solid #e2e8f0;font-size:9px;font-weight:900;text-transform:uppercase;color:#475569;box-shadow:0 2px 6px rgba(0,0,0,0.1);white-space:nowrap;">${name}</div>`,
                            className: '', iconSize: [100, 24], iconAnchor: [50, 12]
                        })} />
                    </React.Fragment>
                );
            })}
        </>
    );
});

const RouteLegend = memo(({ routes, onRouteSelect }: { routes: any[]; onRouteSelect?: (index: number | null) => void }) => {
    if (routes.length <= 1) return null;
    return (
        <div style={{
            position: 'absolute', bottom: 24, right: 20, zIndex: 1000,
            background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
            borderRadius: 16, padding: '12px 16px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)', border: '1px solid rgba(0,0,0,0.06)',
            maxWidth: 220, fontFamily: 'system-ui,sans-serif',
        }}>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', marginBottom: 8 }}>
                Маршруты
            </div>
            {routes.map((r, i) => (
                <div key={i}
                    onClick={() => onRouteSelect?.(i)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 8px', borderRadius: 8,
                        fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#1e293b', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            Маршрут {i + 1}
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {r.orders?.length || 0} зак · {(r.totalDistance || 0).toFixed(1)} км
                        </div>
                    </div>
                </div>
            ))}
            {onRouteSelect && (
                <div
                    onClick={() => onRouteSelect(null)}
                    style={{
                        marginTop: 6, padding: '5px 8px', borderRadius: 8,
                        fontSize: 9, fontWeight: 700, cursor: 'pointer', color: '#3b82f6',
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                        textAlign: 'center',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#eff6ff'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                    Показать все
                </div>
            )}
        </div>
    );
});

export const LeafletCourierMap: React.FC<LeafletCourierMapProps> = memo(({ routes, isDark, isAnimating, showZones, showLabels, isSatellite, focusTrigger, lowPerfMode = false, kmlPolygons = [], onRouteSelect }) => {
    const center = useMemo<[number, number]>(() => [50.4501, 30.5234], []);
    const shouldAnimate = !lowPerfMode && isAnimating;

    return (
        <div className="w-full h-full relative z-0 bg-[#f8fafc]">
            <MapContainer
              center={center} zoom={12}
              style={{ height: '100%', width: '100%' }}
              zoomControl={false} preferCanvas={true}
              wheelPxPerZoomLevel={120} zoomSnap={0.5}
            >
                {isSatellite ? (
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Esri" />
                ) : (
                    <TileLayer url={isDark ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"} />
                )}
                <ZoomControl position="bottomright" />

                {kmlPolygons.map((zone, idx) => {
                    const path = zone.path || [];
                    if (path.length < 3) return null;
                    const color = COLORS[idx % COLORS.length];
                    return (
                        <Polygon key={zone.name || idx} positions={path as [number, number][]}
                            pathOptions={{ color, weight: 2, fillColor: color, fillOpacity: 0.15, dashArray: '5, 5' }}
                        >
                            <Tooltip sticky permanent direction="center" className="bg-white/90 px-2 py-1 rounded text-[8px] font-black uppercase border shadow">
                                {zone.name || `Zone ${idx + 1}`}
                            </Tooltip>
                        </Polygon>
                    );
                })}

                <HubMarker routes={routes} />

                {routes.map((route, idx) => (
                    <RouteLayer key={route.id || idx} route={route} index={idx}
                        color={COLORS[idx % COLORS.length]}
                        isAnimating={shouldAnimate}
                        showLabels={showLabels && !lowPerfMode}
                    />
                ))}

                {showZones && <ZoneLayer routes={routes} />}
                <BoundsUpdater routes={routes} focusTrigger={focusTrigger} />
            </MapContainer>

            {!lowPerfMode && routes.length > 1 && <RouteLegend routes={routes} onRouteSelect={onRouteSelect} />}
        </div>
    );
});
