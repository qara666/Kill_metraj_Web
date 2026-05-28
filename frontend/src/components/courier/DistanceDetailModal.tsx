import React, { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  XMarkIcon,
  MapIcon,
  ChevronDownIcon,
  ArrowRightIcon,
  CloudArrowDownIcon,
  BoltIcon,
  MapPinIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  CircleStackIcon,
  VariableIcon,
  FireIcon,
  PlusIcon,
  ScaleIcon,
  CpuChipIcon,
  RectangleGroupIcon,
  ListBulletIcon,
  EyeIcon,
  WrenchIcon,
  ArrowTrendingUpIcon,
  MagnifyingGlassIcon,
  LightBulbIcon,
  AdjustmentsHorizontalIcon,
  Square3Stack3DIcon,
  ArchiveBoxIcon,
  FunnelIcon,
  CommandLineIcon,
  ArrowsPointingOutIcon,
  CpuChipIcon as CpuChipIconSolid,
  RocketLaunchIcon,
  PlayIcon,
  PauseIcon,
  Square2StackIcon,
  Squares2X2Icon,
  TagIcon,
  PhotoIcon,
  ChevronUpIcon,
  MapIcon as MapIconSolid,
  DocumentArrowDownIcon
} from '@heroicons/react/24/outline'
import { clsx } from 'clsx'
import { LeafletCourierMap } from './LeafletCourierMap'
import { YapikoOSRMService } from '../../services/YapikoOSRMService'
import { localStorageUtils } from '../../utils/ui/localStorage'
import { toast } from 'react-hot-toast'
import { API_URL } from '../../config/apiConfig'
import { useRouteCalculationStore } from '../../stores/useRouteCalculationStore'

const LOW_PERF_MODE = (() => {
  const stored = localStorage.getItem('low_perf_mode');
  if (stored !== null) return stored === 'true';
  if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
    return navigator.hardwareConcurrency <= 2;
  }
  return false;
})();

const PREFERS_REDUCED_MOTION = (() => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
})();

const enableAnimations = !LOW_PERF_MODE && !PREFERS_REDUCED_MOTION;

const animClass = (classes: string) => enableAnimations ? classes : '';
const animStyle = (duration = 500) => ({ animationDuration: enableAnimations ? `${duration}ms` : '0ms' });

interface DistanceDetailModalProps {
  isOpen: boolean
  onClose: () => void
  courierName: string
  distanceDetails: any
  onEditAddress?: (order: any, routeId: string) => void
  onUpdateRoutes?: (routes: any[]) => void
}

type TabType = 'management' | 'map' | 'history';

const MiniSparkline = ({ color = 'blue' }: { color?: string }) => (
  <div className="flex items-end gap-0.5 h-6 w-16">
    {LOW_PERF_MODE ? (
      <div className={clsx("w-full rounded-t-sm bg-slate-300")} style={{ height: '60%' }} />
    ) : (
      [30, 70, 45, 90, 60, 85, 40].map((h, i) => (
        <div 
          key={i} 
          className={clsx("w-full rounded-t-sm animate-in slide-in-from-bottom duration-500", `bg-${color}-500/40`)} 
          style={{ height: `${h}%`, animationDelay: `${i * 50}ms` }} 
        />
      ))
    )}
  </div>
);

const RouteOrderRow = memo(({ order, idx, routeId, onEditAddress, isDragging }: any) => {
  const c = order.coords || (order.lat ? { lat: order.lat, lng: order.lng } : null);
  const isGeoError = !c || !c.lat || !c.lng || c.lat === 0 || c.lng === 0 || c.lat < -90 || c.lat > 90;
  
  return (
    <div 
      className={clsx(
        "p-4 rounded-2xl border flex items-center justify-between transition-all group/order cursor-grab active:cursor-grabbing font-sans gap-3",
        isDragging ? "opacity-30 scale-95 border-blue-400 bg-blue-50" : "bg-white border-slate-100 hover:border-blue-200 hover:shadow-md",
        isGeoError && "border-rose-200 bg-rose-50/10"
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={clsx("w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shadow-sm border shrink-0", isGeoError ? "bg-rose-500 text-white border-rose-400" : "bg-slate-50 border-slate-100 text-slate-400")}>
          {isGeoError ? <ExclamationTriangleIcon className="w-3.5 h-3.5" /> : idx + 1}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-bold text-slate-800 uppercase flex items-center gap-2 leading-none">
            #{order.orderNumber}
            {isGeoError && <span className="text-[8px] font-black bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded uppercase">Ошибка</span>}
          </div>
          <div className="text-[11px] font-normal text-slate-500 capitalize truncate mt-0.5">{order.address}</div>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 opacity-0 group-hover/order:opacity-100 transition-opacity">
        <button 
          onClick={(e) => { e.stopPropagation(); onEditAddress?.(order, routeId); }} 
          className={clsx("text-[9px] font-bold uppercase px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap", isGeoError ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-blue-50 text-blue-600 hover:bg-blue-100")}
        >
          {isGeoError ? 'Исправить' : 'Править'}
        </button>
      </div>
    </div>
  )
})

const RouteSummaryCard = memo(({ 
  route, 
  index, 
  onEditAddress, 
  onDeleteRoute,
  onDragStart,
  onDragEnd,
  onDrop,
  draggingOrderId,
  draggingFromRouteId
}: any) => {
  const [isExpanded, setIsExpanded] = useState(false)
  
  const uniqueOrders = useMemo(() => {
    const seen = new Set();
    return (route.orders || []).filter((o: any) => {
      const id = o.id || o.orderNumber;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [route.orders]);

  const orderNumbersString = useMemo(() => {
    return uniqueOrders.map((o: any) => `#${o.orderNumber}`).join(', ');
  }, [uniqueOrders]);

  const handleGoogleMapsOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const presets = localStorageUtils.getAllSettings();
    const defaultStart = (presets.defaultStartLat && presets.defaultStartLng)
        ? { lat: presets.defaultStartLat, lng: presets.defaultStartLng }
        : (presets.selectedHubs?.[0]?.lat ? { lat: Number(presets.selectedHubs[0].lat), lng: Number(presets.selectedHubs[0].lng) } : null)
        || { lat: 49.9935, lng: 36.2304 };
    const defaultEnd = (presets.defaultEndLat && presets.defaultEndLng)
        ? { lat: presets.defaultEndLat, lng: presets.defaultEndLng }
        : null;
    const start = route.startCoords || route.route_data?.startCoords || defaultStart;
    const end = route.endCoords || route.route_data?.endCoords || route.geoMeta?.destination || defaultEnd || start;
    const waypoints = uniqueOrders.map((o: any) => `${(o.coords || { lat: o.lat, lng: o.lng }).lat},${(o.coords || { lat: o.lat, lng: o.lng }).lng}`).join('|');
    const url = `https://www.google.com/maps/dir/?api=1&origin=${start.lat},${start.lng}&destination=${end.lat},${end.lng}&waypoints=${waypoints}&travelmode=driving`;
    window.open(url, '_blank');
  };

  const handleGraphHopperOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const presets = localStorageUtils.getAllSettings();
    const defaultStart = (presets.defaultStartLat && presets.defaultStartLng)
        ? { lat: presets.defaultStartLat, lng: presets.defaultStartLng }
        : (presets.selectedHubs?.[0]?.lat ? { lat: Number(presets.selectedHubs[0].lat), lng: Number(presets.selectedHubs[0].lng) } : null)
        || { lat: 49.9935, lng: 36.2304 };
    const defaultEnd = (presets.defaultEndLat && presets.defaultEndLng)
        ? { lat: presets.defaultEndLat, lng: presets.defaultEndLng }
        : null;
    const start = route.startCoords || route.route_data?.startCoords || defaultStart;
    const end = route.endCoords || route.route_data?.endCoords || route.geoMeta?.destination || defaultEnd || start;
    const points = [start, ...uniqueOrders.map((o: any) => o.coords || { lat: o.lat, lng: o.lng }), end];
    const pointString = points.map(p => `point=${p.lat},${p.lng}`).join('&');
    const url = `https://graphhopper.com/maps/?${pointString}&vehicle=car&locale=ru&elevation=true`;
    window.open(url, '_blank');
  };

  return (
    <div 
      className={clsx(
        "rounded-[2.5rem] border transition-all overflow-hidden font-sans",
        isExpanded ? "bg-[#f8fafc] border-blue-200 shadow-xl" : "bg-white border-slate-100 hover:border-blue-100 shadow-sm"
      )}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
      onDrop={(e) => onDrop(e, String(route.id))}
    >
      <div className="p-7 flex items-center justify-between cursor-pointer group" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center gap-7">
          <div className="w-14 h-14 rounded-3xl bg-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-xl group-hover:scale-105 transition-transform">
            {index + 1}
          </div>
          <div>
<div className="flex items-center gap-3 min-w-0">
                <h4 className="font-bold text-[13px] text-slate-800 uppercase tracking-tight truncate">{orderNumbersString}</h4>
                <ChevronDownIcon className={clsx("w-4 h-4 text-slate-300 transition-transform duration-500 shrink-0", isExpanded ? "rotate-180" : "")} />
             </div>
            <div className="flex items-center gap-4 mt-2">
               <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-lg">{(route.totalDistance || 0).toFixed(1)} км</span>
               <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-lg">{Math.round((route.totalDistance || 0) * 1.8)} мин</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleGoogleMapsOpen} className="p-3.5 rounded-2xl bg-white border border-slate-100 text-slate-400 hover:text-emerald-600 hover:border-emerald-100 transition-all active:scale-90 shadow-sm" title="Google Карты">
            <MapPinIcon className="w-6 h-6" />
          </button>
          <button onClick={handleGraphHopperOpen} className="p-3.5 rounded-2xl bg-white border border-slate-100 text-slate-400 hover:text-blue-600 hover:border-blue-100 transition-all active:scale-90 shadow-sm" title="GraphHopper">
            <GlobeAltIcon className="w-6 h-6" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDeleteRoute(route.id); }} className="p-3.5 rounded-2xl bg-white border border-slate-100 text-slate-400 hover:text-rose-600 hover:border-rose-100 transition-all active:scale-90 shadow-sm">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className={clsx("px-7 pb-7 space-y-3", enableAnimations ? "animate-in fade-in slide-in-from-top-4 duration-500" : "")}>
          <div className="grid grid-cols-1 gap-2">
            {uniqueOrders.map((order: any, idx: number) => (
              <div key={order.id || order.orderNumber || idx} draggable onDragStart={(e) => onDragStart(e, order.id || order.orderNumber, String(route.id))} onDragEnd={onDragEnd}>
                <RouteOrderRow order={order} idx={idx} routeId={route.id} onEditAddress={onEditAddress} isDragging={draggingOrderId === (order.id || order.orderNumber)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})

export const DistanceDetailModal: React.FC<DistanceDetailModalProps> = ({ isOpen, onClose, courierName, distanceDetails, onEditAddress, onUpdateRoutes }) => {
  const navigate = useNavigate();
  const { markModified } = useRouteCalculationStore();
  const [activeTab, setActiveTab] = useState<TabType>(() => (localStorage.getItem('courier_modal_tab') as TabType) || 'management');
  const [localRoutes, setLocalRoutes] = useState<any[]>([]);
  const [mapFilter, setMapFilter] = useState<'all' | number>('all');
  const [showZones, setShowZones] = useState(false);
  const [showKmlSectors, setShowKmlSectors] = useState(false);
  const [kmlPolygons, setKmlPolygons] = useState<any[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [isSatellite, setIsSatellite] = useState(false);
  const [isMgmtExpanded, setIsMgmtExpanded] = useState(false);
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [hasManualChanges, setHasManualChanges] = useState(false);
  const [enhancedMapRoutes, setEnhancedMapRoutes] = useState<any[] | null>(null);
  const manualRoutesRef = useRef<any[]>([]);
  
  useEffect(() => {
    localStorage.setItem('courier_modal_tab', activeTab);
  }, [activeTab]);

  const initializedRef = useRef(false);
  const geoLoadedRef = useRef(false);
  useEffect(() => {
    if (isOpen && distanceDetails?.routes && !initializedRef.current) {
        setLocalRoutes(JSON.parse(JSON.stringify(distanceDetails.routes)));
        manualRoutesRef.current = JSON.parse(JSON.stringify(distanceDetails.routes));
        initializedRef.current = true;
    }
    if (!isOpen) {
        initializedRef.current = false;
    }
  }, [isOpen, distanceDetails?.routes]);

  useEffect(() => {
    if (!showKmlSectors) {
      setKmlPolygons([]);
      setKmlLoadingError(null);
      return;
    }
    setKmlLoadingError(null);
    const fetchKml = async () => {
      try {
        const { API_URL } = await import('../../config/apiConfig');
        const baseUrl = API_URL.replace(/\/api$/, '');
        const hResponse = await fetch(`${baseUrl}/api/geocache/hubs`);
        const hData = await hResponse.json();
        if (!hData.success) {
          setKmlLoadingError('Failed to load hubs');
          return;
        }
        const activeHubs = hData.hubs.filter((h: any) => h.isActive === true || h.isActive === 1 || h.isActive === 'true');
        const allHubs = hData.hubs;
        const hubsToUse = activeHubs.length > 0 ? activeHubs : allHubs;
        if (hubsToUse.length === 0) {
          setKmlLoadingError('No hubs found');
          return;
        }
        const zonesPromises = hubsToUse.map(async (hub: any) => {
          const zRes = await fetch(`${baseUrl}/api/geocache/hubs/${hub.id}/zones`);
          const zData = await zRes.json();
          return zData.success ? zData.zones.map((z: any) => {
            const raw = z.boundary?.coordinates?.[0]
              || z.boundaries?.[0]?.coordinates
              || z.geometry?.coordinates?.[0]
              || z.coords
              || [];
            const path = Array.isArray(raw)
              ? raw.map((c: any) => Array.isArray(c) ? { lat: Number(c[1]??c[0]), lng: Number(c[0]??c[1]) } : { lat: Number(c.lat), lng: Number(c.lng) })
              : [];
            return { ...z, hubName: hub.name, path };
          }) : [];
        });
        const allZones = (await Promise.all(zonesPromises)).flat();
        const withPath = allZones.filter((z: any) => z.path?.length > 0);
        setKmlPolygons(withPath);
        if (!withPath.length) toast.error('KML сектора не найдены или имеют неверный формат');
      } catch (e) { 
        setKmlLoadingError(String(e));
        toast.error('Ошибка загрузки KML: ' + String(e));
      }
    };
    fetchKml();
  }, [showKmlSectors]);

  const [draggingOrderId, setDraggingOrderId] = useState<string | null>(null);
  const [draggingFromRouteId, setDraggingFromRouteId] = useState<string | null>(null);
  const [kmlLoadingError, setKmlLoadingError] = useState<string | null>(null);
  const dragDataRef = useRef<{ orderId: string; fromRouteId: string } | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, orderId: string, fromRouteId: string) => {
    dragDataRef.current = { orderId, fromRouteId };
    setDraggingOrderId(orderId);
    setDraggingFromRouteId(fromRouteId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingOrderId(null);
    setDraggingFromRouteId(null);
  }, []);

  const handleDropToNew = useCallback((orderId: string, fromRouteId: string) => {
    const snapshot = JSON.parse(JSON.stringify(manualRoutesRef.current));
    const fIdx = snapshot.findIndex((r: any) => String(r.id) === fromRouteId);
    if (fIdx === -1) return;

    const oIdx = (snapshot[fIdx].orders || []).findIndex((o: any) => String(o.id || o.orderNumber) === String(orderId));
    if (oIdx === -1) return;

    const [movedOrder] = snapshot[fIdx].orders.splice(oIdx, 1);
    
    const newId = `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newRoute = {
      id: newId,
      courierName: courierName,
      courier: courierName,
      orders: [movedOrder],
      totalDistance: 0,
      ordersCount: 1,
      orders_count: 1,
      isManuallyAdjusted: true,
    };
    
    snapshot.push(newRoute);
    setLocalRoutes(snapshot);
    manualRoutesRef.current = snapshot;
    setHasManualChanges(true);
    toast.loading('Пересчет...', { id: 'dnd-recalc' });

    const presets = localStorageUtils.getAllSettings();
    const osrmUrl = presets.osrmUrl || 'http://116.204.153.171:5050';

    const calc = async (r: any) => {
      if (!r.orders?.length) return { ...r, totalDistance: 0, geometry: undefined };
      const start = r.startCoords || r.route_data?.startCoords
        || (presets.defaultStartLat ? { lat: presets.defaultStartLat, lng: presets.defaultStartLng } : null)
        || { lat: 49.9935, lng: 36.2304 };
      const end = r.endCoords || r.route_data?.endCoords || r.geoMeta?.destination
        || (presets.defaultEndLat ? { lat: presets.defaultEndLat, lng: presets.defaultEndLng } : null)
        || start;
      const validOrders = (r.orders || []).filter((o: any) => {
        const c = o.coords || { lat: o.lat, lng: o.lng };
        return c?.lat && c?.lng && c.lat !== 0;
      });
      if (!validOrders.length) return { ...r, totalDistance: 0, geometry: undefined };
      const waypoints = validOrders.map((o: any) => o.coords || { lat: o.lat, lng: o.lng });
      const locs = [start, ...waypoints, end];
      const res = await YapikoOSRMService.calculateRoute(locs, osrmUrl);
      const geoMeta = { origin: { lat: start.lat, lng: start.lng }, destination: { lat: end.lat, lng: end.lng }, waypoints };
      return { ...r, totalDistance: (res.feasible && res.totalDistance != null) ? res.totalDistance / 1000 : 0, geometry: res.geometry, geoMeta };
    };

    (async () => {
      try {
        const currentSnapshot = [...snapshot];
        const fIdxNew = currentSnapshot.findIndex((r: any) => String(r.id) === fromRouteId);
        const tIdxNew = currentSnapshot.findIndex((r: any) => String(r.id) === newId);
        
        if (fIdxNew === -1 || tIdxNew === -1) return;
        
        const [nF, nT] = await Promise.all([calc(currentSnapshot[fIdxNew]), calc(currentSnapshot[tIdxNew])]);
        currentSnapshot[fIdxNew] = nF;
        currentSnapshot[tIdxNew] = nT;

        const token = localStorage.getItem('km_access_token') || localStorage.getItem('token');
        await Promise.all(
          [nF, nT].filter((r: any) => r.id && !String(r.id).startsWith('route_')).map(async (r: any) => {
            const res = await fetch(`${API_URL}/api/routes/save`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ ...r, courier_id: r.courier_id || r.courier || courierName, _manualModified: true })
            });
            if (!res.ok) throw new Error(`Save failed: ${res.status}`);
          })
        );
        setLocalRoutes(currentSnapshot);
        manualRoutesRef.current = currentSnapshot;
        if (onUpdateRoutes) onUpdateRoutes(currentSnapshot);
        toast.success('Создан новый маршрут с заказом ' + (movedOrder.orderNumber || movedOrder.id), { icon: '' });
      } catch (err) {
        toast.error('Ошибка пересчета');
      } finally {
        toast.remove('dnd-recalc');
      }
    })();
  }, [courierName, onUpdateRoutes]);

const handleDrop = useCallback((e: React.DragEvent, toRouteId: string) => {
    e.preventDefault();
    if (!dragDataRef.current) return;
    const { orderId, fromRouteId } = dragDataRef.current;
    if (fromRouteId === toRouteId) return;

    setHasManualChanges(true);

    const snapshot = JSON.parse(JSON.stringify(manualRoutesRef.current));
    const fIdx = snapshot.findIndex((r: any) => String(r.id) === fromRouteId);
    const tIdx = snapshot.findIndex((r: any) => String(r.id) === toRouteId);
    if (fIdx === -1 || tIdx === -1) return;

    const oIdx = (snapshot[fIdx].orders || []).findIndex((o: any) => String(o.id || o.orderNumber) === String(orderId));
    if (oIdx === -1) return;

    const [movedOrder] = snapshot[fIdx].orders.splice(oIdx, 1);
    snapshot[tIdx].orders.push(movedOrder);

    setLocalRoutes(snapshot);
    manualRoutesRef.current = snapshot;
    toast.loading('Пересчет...', { id: 'dnd-recalc' });

    (async () => {
      try {
        const presets = localStorageUtils.getAllSettings();
        const osrmUrl = presets.osrmUrl || 'http://116.204.153.171:5050';

        const calc = async (r: any) => {
          if (!r.orders?.length) return { ...r, totalDistance: 0, geometry: undefined };
          const start = r.startCoords || r.route_data?.startCoords
            || (presets.defaultStartLat ? { lat: presets.defaultStartLat, lng: presets.defaultStartLng } : null)
            || { lat: 49.9935, lng: 36.2304 };
          const end = r.endCoords || r.route_data?.endCoords || r.geoMeta?.destination
            || (presets.defaultEndLat ? { lat: presets.defaultEndLat, lng: presets.defaultEndLng } : null)
            || start;
          const validOrders = (r.orders || []).filter((o: any) => {
            const c = o.coords || { lat: o.lat, lng: o.lng };
            return c?.lat && c?.lng && c.lat !== 0;
          });
          if (!validOrders.length) return { ...r, totalDistance: 0, geometry: undefined };
          const waypoints = validOrders.map((o: any) => o.coords || { lat: o.lat, lng: o.lng });
          const locs = [start, ...waypoints, end];
          const res = await YapikoOSRMService.calculateRoute(locs, osrmUrl);
          const geoMeta = { origin: { lat: start.lat, lng: start.lng }, destination: { lat: end.lat, lng: end.lng }, waypoints };
          return { ...r, totalDistance: (res.feasible && res.totalDistance != null) ? res.totalDistance / 1000 : 0, geometry: res.geometry, geoMeta };
        };

        const [nF, nT] = await Promise.all([calc(snapshot[fIdx]), calc(snapshot[tIdx])]);
        snapshot[fIdx] = nF;
        snapshot[tIdx] = nT;

        const token = localStorage.getItem('km_access_token') || localStorage.getItem('token');
        await Promise.all(
          [nF, nT].filter((r: any) => r.id && !String(r.id).startsWith('route_')).map(async (r: any) => {
            const res = await fetch(`${API_URL}/api/routes/save`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ ...r, courier_id: r.courier_id || r.courier || courierName, _manualModified: true })
            });
            if (!res.ok) throw new Error(`Save failed: ${res.status}`);
          })
        );
        setLocalRoutes(snapshot);
        manualRoutesRef.current = snapshot;
        markModified(courierName);
        if (onUpdateRoutes) onUpdateRoutes(snapshot);
        toast.success('Пересчитано', { id: 'dnd-recalc' });
      } catch (err) {
        toast.error('Ошибка пересчета', { id: 'dnd-recalc' });
      }
    })();
  }, [courierName, onUpdateRoutes]);

const handleManualRecalcAll = useCallback(async () => {
     try {
        const snapshot = JSON.parse(JSON.stringify(manualRoutesRef.current));
        if (!snapshot?.length) { toast.error('Нет маршрутов'); return; }

        toast.loading('Пересчет...', { id: 'recalc-all' });
        const presets = localStorageUtils.getAllSettings();
        const osrmUrl = presets.osrmUrl || 'http://116.204.153.171:5050';

        const calc = async (r: any) => {
          if (!r.orders?.length) return { ...r, totalDistance: 0, geometry: undefined };
          const start = r.startCoords || r.route_data?.startCoords
            || (presets.defaultStartLat ? { lat: presets.defaultStartLat, lng: presets.defaultStartLng } : null)
            || { lat: 49.9935, lng: 36.2304 };
          const end = r.endCoords || r.route_data?.endCoords || r.geoMeta?.destination
            || (presets.defaultEndLat ? { lat: presets.defaultEndLat, lng: presets.defaultEndLng } : null)
            || start;
          const validOrders = (r.orders || []).filter((o: any) => {
            const c = o.coords || { lat: o.lat, lng: o.lng };
            return c?.lat && c?.lng && c.lat !== 0;
          });
          if (!validOrders.length) return { ...r, totalDistance: 0, geometry: undefined };
          const waypoints = validOrders.map((o: any) => o.coords || { lat: o.lat, lng: o.lng });
          const locs = [start, ...waypoints, end];
          const res = await YapikoOSRMService.calculateRoute(locs, osrmUrl);
          const geoMeta = { origin: { lat: start.lat, lng: start.lng }, destination: { lat: end.lat, lng: end.lng }, waypoints };
          return { ...r, totalDistance: (res.feasible && res.totalDistance != null) ? res.totalDistance / 1000 : 0, geometry: res.geometry, geoMeta };
        };

        const final = await Promise.all(snapshot.map((r: any) => calc(r)));

        const token = localStorage.getItem('km_access_token') || localStorage.getItem('token');
        const toSave = final.filter((r: any) => r.id && !String(r.id).startsWith('route_'));
        await Promise.all(toSave.map(async (r: any) => {
          const body = { ...r, courier_id: r.courier_id || r.courier || courierName, _manualModified: true };
          const res = await fetch(`${API_URL}/api/routes/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body)
          });
          if (!res.ok) throw new Error(`Save failed: ${res.status}`);
        }));
        setLocalRoutes(final);
        manualRoutesRef.current = final;
        markModified(courierName);
        if (onUpdateRoutes) onUpdateRoutes(final);
        setHasManualChanges(false);
        toast.success(`Пересчитано: ${final.reduce((s, r) => s + (r.totalDistance || 0), 0).toFixed(1)} км`, { id: 'recalc-all' });
     } catch (err) {
        toast.error('Ошибка пересчета', { id: 'recalc-all' });
     }
    }, [courierName, onUpdateRoutes]);

  const handleManualSave = useCallback(async () => {
     try {
         toast.loading('Сохранение изменений...', { id: 'manual-save' });
         const routesToSave = localRoutes.filter(r => !String(r.id).startsWith('route_'));
         
          await Promise.all(routesToSave.map(async r => {
              const res = await fetch(`${API_URL}/api/routes/save`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('km_access_token') || localStorage.getItem('token')}`
                  },
                  body: JSON.stringify(r)
              });
              if (!res.ok) throw new Error(`Save failed: ${res.status}`);
          }));
         
         setHasManualChanges(false);
         toast.success('Все изменения сохранены в БД', { id: 'manual-save' });
     } catch (err) {
         toast.error('Ошибка при сохранении', { id: 'manual-save' });
     }
  }, [localRoutes]);

  const allOrders = useMemo(() => {
    const orders: any[] = [];
    localRoutes.forEach(r => orders.push(...(r.orders || [])));
    return orders;
  }, [localRoutes]);

  const geoErrors = useMemo(() => allOrders.filter(o => {
    const c = o.coords || (o.lat ? { lat: o.lat, lng: o.lng } : null);
    return !c || !c.lat || !c.lng || c.lat === 0 || c.lng === 0;
  }), [allOrders]);

  const filteredRoutesForMap = useMemo(() => {
    if (mapFilter === 'all') return localRoutes;
    const r = localRoutes[mapFilter];
    return r ? [r] : localRoutes;
  }, [localRoutes, mapFilter]);

  useEffect(() => {
    if (activeTab !== 'map') return;
    const routes = filteredRoutesForMap;
    if (!routes.length) return;

    const allHaveGeo = routes.every(r => r.geometry || r.geometryPoints);
    if (allHaveGeo) {
      setEnhancedMapRoutes(routes);
      if (!geoLoadedRef.current) { geoLoadedRef.current = true; setFocusTrigger(p => p + 1); }
      return;
    }

    geoLoadedRef.current = false;
    let cancelled = false;
    const presets = localStorageUtils.getAllSettings();
    const osrmUrl = presets.osrmUrl || 'http://116.204.153.171:5050';

    (async () => {
      const results = await Promise.all(routes.map(async (r) => {
        if (r.geometry || r.geometryPoints) return r;
        const start = r.startCoords || r.route_data?.startCoords || r.geoMeta?.origin
          || (presets.defaultStartLat ? { lat: presets.defaultStartLat, lng: presets.defaultStartLng } : null)
          || { lat: 49.9935, lng: 36.2304 };
        const end = r.endCoords || r.route_data?.endCoords || r.geoMeta?.destination
          || (presets.defaultEndLat ? { lat: presets.defaultEndLat, lng: presets.defaultEndLng } : null)
          || start;
        const validOrders = (r.orders || []).filter((o: any) => {
          const c = o.coords || { lat: o.lat, lng: o.lng };
          return c?.lat && c?.lng && c.lat !== 0 && c.lng !== 0;
        });
        if (!validOrders.length && start.lat === end.lat && start.lng === end.lng) return r;
        const locs = [start, ...validOrders.map((o: any) => o.coords || { lat: o.lat, lng: o.lng }), end];
        try {
          const res = await YapikoOSRMService.calculateRoute(locs, osrmUrl);
          if (res.feasible && res.geometry) {
            return { ...r, geometry: res.geometry, totalDistance: res.totalDistance != null ? res.totalDistance / 1000 : r.totalDistance };
          }
        } catch (e) {}
        return r;
      }));
      if (!cancelled) { setEnhancedMapRoutes(results); setFocusTrigger(p => p + 1); geoLoadedRef.current = true; }
    })();
    return () => { cancelled = true; };
  }, [activeTab, filteredRoutesForMap]);

  const mapStats = useMemo(() => {
    const r = filteredRoutesForMap;
    const dist = r.reduce((s, x) => s + (x.totalDistance || 0), 0);
    const ords = r.reduce((s, x) => s + (x.orders?.length || 0), 0);
    return { dist, ords };
  }, [filteredRoutesForMap]);

  const stats = useMemo(() => {
    const rawDist = localRoutes.reduce((sum, r) => sum + (r.totalDistance || 0), 0);
    const bonus = (distanceDetails?.ordersInRoutes || 0) * 0.5;
    const total = rawDist + bonus;
    const avgSpeed = rawDist > 0 ? (rawDist / (rawDist * 1.8 / 60)).toFixed(1) : '0';
    return { total, bonus, rawDist, avgSpeed };
  }, [localRoutes, distanceDetails]);

  if (!isOpen) return null

  const renderManagement = () => (
    <div className={clsx("space-y-12", enableAnimations ? "animate-in fade-in duration-500" : "")}>
       <div className="w-full">
          <div className="p-10 rounded-[4rem] bg-[#0c0f16] text-white relative overflow-hidden shadow-2xl w-full">
             <div className="relative z-10">
                <div className="text-[11px] font-black uppercase tracking-[0.4em] text-blue-500 mb-8">Итого за смену</div>
                <div className="text-7xl font-black tracking-tighter leading-none">{Math.floor(stats.total)}<span className="text-2xl text-white/20">.{Math.round((stats.total % 1) * 10)}</span> <span className="text-xl text-white/10 uppercase ml-2">км</span></div>
                <div className="mt-10 flex gap-4">
                   <div className="flex-1 p-5 rounded-[2.5rem] bg-white/5 border border-white/[0.03]">
                      <div className="text-[9px] font-bold text-white/30 uppercase mb-2">Доп. пробег</div>
                      <div className="text-xl font-black text-emerald-400">+{stats.bonus.toFixed(1)} км</div>
                   </div>
                   <div className="flex-1 p-5 rounded-[2.5rem] bg-white/5 border border-white/[0.03]">
                      <div className="text-[9px] font-bold text-white/30 uppercase mb-2">Заказов</div>
                      <div className="text-xl font-black text-blue-400">{allOrders.length} зак</div>
                   </div>
                </div>
             </div>
             <div className="absolute -top-10 -right-10 w-80 h-80 bg-blue-600/10 rounded-full" />
          </div>
       </div>

<div className="space-y-8">
<div className="flex items-center justify-between ml-6">
                <div className="text-[12px] font-black uppercase tracking-[0.5em] text-slate-300 flex items-center gap-4">
                   <div className="w-8 h-px bg-slate-200" /> Маршруты кура
                </div>
                <button onClick={handleManualRecalcAll} className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all flex items-center gap-2">
                   <ArrowPathIcon className="w-4 h-4" />
                   СИНХРОНИЗИРОВАТЬ И ПЕРЕСЧИТАТЬ ВСЁ
                </button>
             </div>

              {/* Зона перетаскивания для создания нового маршрута */}
             <div 
               className={clsx(
                 "ml-6 mr-6 py-4 px-4 border-2 border-dashed rounded-2xl transition-all cursor-pointer",
                 draggingOrderId 
                   ? "border-green-500 bg-green-500/20"
                   : "border-slate-200/50 hover:border-blue-300"
               )}
               onDragOver={(e) => { if (draggingOrderId) e.preventDefault(); }}
               onDrop={(e) => {
                 e.preventDefault();
                 const { orderId, fromRouteId } = dragDataRef.current || {};
                 if (orderId && fromRouteId) {
                   handleDropToNew(orderId, fromRouteId);
                 }
                 setDraggingOrderId(null);
                 setDraggingFromRouteId(null);
                 dragDataRef.current = null;
               }}
             >
               <div className="flex items-center justify-center gap-3">
                 <div className={clsx("w-8 h-8 rounded-full border-2 flex items-center justify-center",
                   draggingOrderId 
                     ? "border-green-500 bg-green-500/20 text-green-500"
                      : "border-slate-300 text-slate-400"
                  )}>
                    <PlusIcon className="w-5 h-5" />
                  </div>
                  <div className="text-center">
                    <p className={clsx("text-[11px] font-bold uppercase tracking-[0.1em]",
                      draggingOrderId ? "text-green-600" : "text-slate-400"
                    )}>
                      {draggingOrderId ? 'Отпустите здесь → новый маршрут' : 'Перетащите заказ сюда для нового маршрута'}
                    </p>
                  </div>
                </div>
              </div>

            <div className="space-y-6">
             {localRoutes.map((r, idx) => (
               <RouteSummaryCard 
                 key={r.id || idx} 
                 route={r} 
                 index={idx} 
                 onEditAddress={onEditAddress} 
                 onDeleteRoute={(id: any) => { setLocalRoutes(p => p.filter(x => x.id !== id)); setHasManualChanges(true); }} 
                 onDragStart={handleDragStart} 
                 onDragEnd={handleDragEnd} 
                 onDrop={handleDrop} 
                 draggingOrderId={draggingOrderId} 
                 draggingFromRouteId={draggingFromRouteId} 
               />
             ))}
          </div>
          
          {hasManualChanges && enableAnimations && (
              <div className="pt-10 flex justify-center animate-in zoom-in duration-300">
                <button 
                  onClick={handleManualSave}
                  className="px-12 py-6 rounded-[2rem] bg-emerald-600 text-white font-black text-xs uppercase tracking-[0.3em] shadow-2xl shadow-emerald-500/40 hover:scale-105 active:scale-95 transition-all flex items-center gap-4"
                >
                  <ShieldCheckIcon className="w-6 h-6" />
                  Подтвердить и Сохранить изменения
                </button>
              </div>
)}
        </div>
    </div>
  );

  const renderMapTab = () => (
    <div className="h-full flex flex-col gap-0 overflow-hidden relative">
       
       <div className="w-full shrink-0 z-[1000] sticky top-0">
          <div className="bg-white border-b border-slate-100 shadow-xl overflow-hidden transition-all duration-500">
             <div 
               className="px-10 py-5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
               onClick={() => setIsMgmtExpanded(!isMgmtExpanded)}
             >
                <div className="flex items-center gap-6">
                   <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg">
                      <AdjustmentsHorizontalIcon className="w-6 h-6" />
                   </div>
                   <div>
                      <h4 className="text-[12px] font-black uppercase tracking-[0.3em] text-slate-900">УПРАВЛЕНИЕ КАРТОЙ</h4>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Тактика и фильтрация</p>
                   </div>
                </div>
                <div className="flex items-center gap-6">
                   <div className="flex items-center gap-2">
                      <div className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-[9px] font-black">{mapStats.dist.toFixed(1)} КМ</div>
                      <div className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-[9px] font-black">{mapStats.ords} ЗАК</div>
                   </div>
                   {isMgmtExpanded ? <ChevronUpIcon className="w-5 h-5 text-slate-300" /> : <ChevronDownIcon className="w-5 h-5 text-slate-300" />}
                </div>
             </div>

             {isMgmtExpanded && (
                <div className={clsx("p-8 grid grid-cols-1 md:grid-cols-4 gap-8 border-t border-slate-50", enableAnimations ? "animate-in fade-in slide-in-from-top-4 duration-500" : "")}>
                   <div className="col-span-2 space-y-4">
                      <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-3">
                         <FunnelIcon className="w-4 h-4 text-blue-600" /> Маршруты
                      </div>
                        <div className="grid grid-cols-3 gap-2">
                           <button 
                             onClick={() => setMapFilter('all')}
                             className={clsx(
                                "col-span-3 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                mapFilter === 'all' ? "bg-blue-600 text-white shadow-lg" : "bg-slate-50 text-slate-400"
                             )}
                           >
                              ВЕСЬ ГОРОД
                           </button>
                           {localRoutes.map((r, i) => (
                               <button 
                                 key={i}
                                 onClick={() => { setMapFilter(i); setFocusTrigger(p => p + 1); }}
                                 className={clsx(
                                    "py-2.5 rounded-xl text-[9px] font-bold transition-all border flex flex-col items-center gap-0.5",
                                    mapFilter === i ? "bg-white border-blue-600 text-blue-600 shadow-lg" : "bg-slate-50 border-transparent text-slate-400"
                                 )}
                               >
                                  <span className="truncate w-full px-1 text-[8px]">{(r.orders || []).map((o: any) => '#' + o.orderNumber).join(', ')}</span>
                                  <span className="text-[7px] opacity-60">{r.orders?.length} зак · {(r.totalDistance || 0).toFixed(1)} км</span>
                               </button>
                           ))}
                        </div>
                   </div>

                   <div className="space-y-4">
                      <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-3">
                         <CommandLineIcon className="w-4 h-4 text-blue-600" /> Режимы
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                         <button onClick={() => setIsAnimating(!isAnimating)} className={clsx("p-3 rounded-xl border transition-all flex items-center gap-2", isAnimating ? "bg-emerald-600 text-white" : "bg-slate-50 text-slate-400")}>
                            <PlayIcon className="w-4 h-4" /> <span className="text-[8px] font-black uppercase">Реплей</span>
                         </button>
                         <button onClick={() => setShowZones(!showZones)} className={clsx("p-3 rounded-xl border transition-all flex items-center gap-2", showZones ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-400")}>
                            <Square2StackIcon className="w-4 h-4" /> <span className="text-[8px] font-black uppercase">Зоны</span>
                         </button>
                         <button onClick={() => setShowKmlSectors(!showKmlSectors)} className={clsx("p-3 rounded-xl border transition-all flex items-center gap-2", showKmlSectors ? "bg-violet-600 text-white" : "bg-slate-50 text-slate-400")}>
                            <MapIconSolid className="w-4 h-4" /> <span className="text-[8px] font-black uppercase">KML</span>
                         </button>
                         <button onClick={() => setIsSatellite(!isSatellite)} className={clsx("p-3 rounded-xl border transition-all flex items-center gap-2", isSatellite ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-400")}>
                            <PhotoIcon className="w-4 h-4" /> <span className="text-[8px] font-black uppercase">Спутник</span>
                         </button>
                         <button onClick={() => setShowLabels(!showLabels)} className={clsx("p-3 rounded-xl border transition-all flex items-center gap-2", showLabels ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-400")}>
                            <TagIcon className="w-4 h-4" /> <span className="text-[8px] font-black uppercase">Метки</span>
                         </button>
                      </div>
                   </div>

                   <div className="space-y-4">
                      <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-3">
                         <CpuChipIconSolid className="w-4 h-4 text-blue-600" /> Действия
                      </div>
                      <button 
                        onClick={() => { setFocusTrigger(p => p + 1); toast.success('Фокусировка...'); }} 
                        className="w-full py-4 rounded-xl bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl"
                      >
                         <ArrowsPointingOutIcon className="w-4 h-4" /> Авто-Масштаб
                      </button>
                   </div>
                </div>
             )}
          </div>
       </div>

       <div className="flex-1 relative overflow-hidden flex min-h-0 bg-slate-50">
          <div className="flex-1 h-full relative z-0">
             <LeafletCourierMap 
                routes={enhancedMapRoutes ?? filteredRoutesForMap} 
                isDark={false} 
                isAnimating={isAnimating} 
                showZones={showZones} 
                showLabels={showLabels}
                isSatellite={isSatellite}
                focusTrigger={focusTrigger}
                lowPerfMode={LOW_PERF_MODE}
                kmlPolygons={showKmlSectors ? kmlPolygons : []}
                onRouteSelect={(i) => { setMapFilter(i === null ? 'all' : i); if (i !== null) setFocusTrigger(p => p + 1); }}
              />
           </div>
        </div>
    </div>
  );



  const renderTimeline = () => (
    <div className={clsx("space-y-10", enableAnimations ? "animate-in slide-in-from-bottom-10 duration-500" : "")}>
       <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-2xl relative overflow-hidden">
          <div className="text-sm font-black text-slate-800 uppercase tracking-[0.3em] mb-12 flex items-center gap-4">
             <ClockIcon className="w-7 h-7 text-blue-600" /> Операционная хронология
          </div>
          <div className="space-y-12 relative">
             <div className="absolute left-6 top-0 bottom-0 w-1 bg-slate-50 rounded-full" />
             {allOrders.slice(0, 10).map((o, i) => (
                <div key={i} className="relative pl-16 group">
                   <div className={clsx("absolute left-4 top-1.5 w-5 h-5 rounded-full bg-white border-4 transition-all group-hover:scale-125", i === 0 ? "border-blue-600" : "border-slate-200")} />
                   <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{(i + 1) * 20} мин назад</div>
                   <div className="p-7 rounded-[2rem] bg-slate-50/50 border border-slate-50 group-hover:bg-white group-hover:border-blue-100 group-hover:shadow-xl transition-all">
                      <div className="text-xs font-black text-slate-800 uppercase">Доставка заказа #{o.orderNumber}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase mt-2">{o.address}</div>
                   </div>
                </div>
             ))}
          </div>
       </div>
    </div>
  );

  const TABS = [
    { id: 'management', label: 'Управление', icon: RocketLaunchIcon },
    { id: 'map', label: 'Карта', icon: MapIcon },
    { id: 'history', label: 'История', icon: ClockIcon },
  ] as const;

  const modalContent = (
    <div className={clsx("fixed inset-0 z-[9999] flex items-center justify-center bg-[#0a0c16]/90 p-4 md:p-8 font-sans", enableAnimations ? "animate-in fade-in duration-300" : "")} onClick={onClose}>
      <div className="bg-white rounded-[4.5rem] shadow-2xl overflow-hidden border border-slate-100 w-full max-w-7xl h-full max-h-[96vh] flex flex-col scale-in-center relative" onClick={(e) => e.stopPropagation()}>
        
        <div className="flex items-center justify-between px-12 py-8 border-b border-slate-50 shrink-0 bg-white sticky top-0 z-30">
          <div className="flex items-center gap-8 w-full">
            <div className="w-5 h-5 rounded-full bg-blue-600 shadow-[0_0_30px_rgba(37,99,235,0.7)] animate-pulse shrink-0" />
            <div className="flex bg-[#f1f5f9] p-1.5 rounded-[2rem] border border-slate-200/50 relative overflow-hidden w-full max-w-4xl">
               {TABS.map(({ id: tab, label, icon: Icon }) => (
                  <button 
                    key={tab}
                    onClick={() => setActiveTab(tab as TabType)}
                    className={clsx(
                       "flex-1 relative z-10 py-3 rounded-[1.75rem] text-[11px] font-bold uppercase tracking-widest transition-all flex justify-center items-center gap-2",
                       activeTab === tab ? "text-blue-600" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                    )}
                  >
                     <Icon className={clsx("w-4 h-4", activeTab === tab ? "text-blue-600" : "text-slate-400")} />
                     {label}
                  </button>
               ))}
                <div 
                  className="absolute top-1.5 bottom-1.5 rounded-[1.75rem] bg-white shadow-md border border-slate-100 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-0" 
                  style={{ 
                    left: `calc(0.375rem + ${TABS.findIndex(t => t.id === activeTab) * (100 / 3)}%)`, 
                    width: `calc(${100 / 3}% - 0.75rem)` 
                  }} 
                />
            </div>
          </div>
          <button onClick={onClose} className="p-4 rounded-[1.75rem] bg-slate-50 text-slate-400 hover:text-slate-900 transition-all border border-slate-100 shadow-sm hover:bg-white hover:shadow-md shrink-0 ml-8">
            <XMarkIcon className="w-8 h-8" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col bg-[#f8fafc]/20 relative">
          
          <div className={clsx("flex-1 overflow-y-auto custom-scrollbar p-12", activeTab === 'map' ? "hidden" : "block")}>
             <div className="mb-12">
                <h3 className="text-4xl font-black tracking-tighter text-slate-900 uppercase leading-none">{courierName}</h3>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.4em] mt-5">Подробности курьера</p>
             </div>

            {activeTab === 'management' && renderManagement()}
            {activeTab === 'history' && renderTimeline()}
          </div>

          <div style={activeTab === 'map' ? { flex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column' } : { position: 'absolute', top: '-9999px', left: '-9999px', width: '100%', height: '100%', opacity: 0, pointerEvents: 'none' }}>
            {renderMapTab()}
          </div>
        </div>

        <div className="px-12 py-10 border-t border-slate-100 bg-white flex justify-between items-center shrink-0 relative z-20 shadow-2xl">
          <button onClick={onClose} className="px-14 py-6 rounded-[2.5rem] bg-white border border-slate-200 text-slate-400 font-bold uppercase tracking-[0.3em] text-[12px] hover:text-slate-900 transition-all">Закрыть</button>
          <div className="flex gap-4">
             <div className="px-8 py-5 rounded-[2rem] bg-slate-50 border border-slate-100 flex items-center gap-4">
                <ShieldCheckIcon className="w-6 h-6 text-emerald-500" />
                <span className="text-[10px] font-black uppercase text-slate-600 tracking-widest">Протокол 2.0 Активен</span>
             </div>
             <button onClick={() => { onClose(); navigate('/routes'); }} className="px-20 py-6 rounded-[2.5rem] bg-blue-600 text-white font-black uppercase tracking-[0.3em] text-[12px] hover:bg-blue-700 shadow-2xl shadow-blue-500/40 transition-all flex items-center justify-center gap-6 active:scale-95">
               Перейти к маршрутам <ArrowRightIcon className="w-7 h-7" />
             </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default memo(DistanceDetailModal)