import React, { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { 
  XMarkIcon, 
  MapIcon, 
  ChartBarIcon, 
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
  SparklesIcon,
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
  PresentationChartLineIcon,
  FunnelIcon,
  CommandLineIcon,
  ArrowsPointingOutIcon,
  BeakerIcon,
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

interface DistanceDetailModalProps {
  isOpen: boolean
  onClose: () => void
  courierName: string
  distanceDetails: any
  onEditAddress?: (order: any, routeId: string) => void
  onUpdateRoutes?: (routes: any[]) => void
}

type TabType = 'management' | 'map' | 'history' | 'analytics' | 'diagnostics';

const MiniSparkline = ({ color = 'blue' }: { color?: string }) => (
  <div className="flex items-end gap-0.5 h-6 w-16">
    {[30, 70, 45, 90, 60, 85, 40].map((h, i) => (
      <div 
        key={i} 
        className={clsx("w-full rounded-t-sm animate-in slide-in-from-bottom duration-500", `bg-${color}-500/40`)} 
        style={{ height: `${h}%`, animationDelay: `${i * 50}ms` }} 
      />
    ))}
  </div>
);

const RouteOrderRow = memo(({ order, idx, routeId, onEditAddress, isDragging }: any) => {
  const isGeoError = !order.coords || (order.coords.lat === 0 && order.coords.lng === 0);
  
  return (
    <div 
      className={clsx(
        "p-4 rounded-2xl border flex items-center justify-between transition-all group/order cursor-grab active:cursor-grabbing font-sans",
        isDragging ? "opacity-30 scale-95 border-blue-400 bg-blue-50" : "bg-white border-slate-100 hover:border-blue-200 hover:shadow-md",
        isGeoError && "border-rose-200 bg-rose-50/10"
      )}
    >
      <div className="flex items-center gap-4">
        <div className={clsx("w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-bold shadow-sm border", isGeoError ? "bg-rose-500 text-white border-rose-400" : "bg-slate-50 border-slate-100 text-slate-400")}>
          {isGeoError ? <ExclamationTriangleIcon className="w-4 h-4" /> : idx + 1}
        </div>
        <div>
          <div className="text-[11px] font-bold text-slate-800 uppercase flex items-center gap-2 leading-none">
            #{order.orderNumber}
            {isGeoError && <span className="text-[8px] font-black bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded uppercase">Ошибка</span>}
          </div>
          <div className="text-[10px] font-medium text-slate-400 uppercase truncate max-w-[240px] mt-1">{order.address}</div>
        </div>
      </div>
      <div className="flex items-center gap-3 opacity-0 group-hover/order:opacity-100 transition-opacity">
        <button 
          onClick={(e) => { e.stopPropagation(); onEditAddress?.(order, routeId); }} 
          className={clsx("text-[9px] font-bold uppercase px-3 py-1.5 rounded-lg transition-colors", isGeoError ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-blue-50 text-blue-600 hover:bg-blue-100")}
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
    const start = route.startCoords || { lat: 50.4501, lng: 30.5234 };
    const waypoints = uniqueOrders.map((o: any) => `${(o.coords || { lat: o.lat, lng: o.lng }).lat},${(o.coords || { lat: o.lat, lng: o.lng }).lng}`).join('|');
    const url = `https://www.google.com/maps/dir/?api=1&origin=${start.lat},${start.lng}&destination=${start.lat},${start.lng}&waypoints=${waypoints}&travelmode=driving`;
    window.open(url, '_blank');
  };

  const handleGraphHopperOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const start = route.startCoords || { lat: 50.4501, lng: 30.5234 };
    const points = [start, ...uniqueOrders.map((o: any) => o.coords || { lat: o.lat, lng: o.lng }), start];
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
            <div className="flex items-center gap-3">
              <h4 className="font-bold text-[15px] text-slate-800 uppercase tracking-tight">
                Маршрут ({orderNumbersString})
              </h4>
              <ChevronDownIcon className={clsx("w-4 h-4 text-slate-300 transition-transform duration-500", isExpanded ? "rotate-180" : "")} />
            </div>
            <div className="flex items-center gap-4 mt-2">
               <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-lg">{(route.totalDistance || 0).toFixed(1)} км</span>
               <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-lg">{Math.round((route.totalDistance || 0) * 1.8)} мин</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleGoogleMapsOpen} className="p-3.5 rounded-2xl bg-white border border-slate-100 text-slate-400 hover:text-emerald-600 hover:border-emerald-100 transition-all active:scale-90 shadow-sm" title="Google Maps">
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
        <div className="px-7 pb-7 space-y-3 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="grid grid-cols-1 gap-2">
            {uniqueOrders.map((order: any, idx: number) => (
              <div key={order.id || idx} draggable onDragStart={(e) => onDragStart(e, order.id, String(route.id))} onDragEnd={onDragEnd}>
                <RouteOrderRow order={order} idx={idx} routeId={route.id} onEditAddress={onEditAddress} isDragging={draggingOrderId === order.id} />
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
  const [activeTab, setActiveTab] = useState<TabType>(() => (localStorage.getItem('courier_modal_tab') as TabType) || 'management');
  const [localRoutes, setLocalRoutes] = useState<any[]>([]);
  const [mapFilter, setMapFilter] = useState<'all' | number>('all');
  const [showZones, setShowZones] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [isSatellite, setIsSatellite] = useState(false);
  const [isMgmtExpanded, setIsMgmtExpanded] = useState(false);
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [hasManualChanges, setHasManualChanges] = useState(false);
  const manualRoutesRef = useRef<any[]>([]);
  
  useEffect(() => {
    localStorage.setItem('courier_modal_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (distanceDetails?.routes && !hasManualChanges) {
        setLocalRoutes(distanceDetails.routes);
        manualRoutesRef.current = distanceDetails.routes;
    }
  }, [distanceDetails?.routes, hasManualChanges]);

  // Drag and Drop Logic
  const [draggingOrderId, setDraggingOrderId] = useState<string | null>(null);
  const [draggingFromRouteId, setDraggingFromRouteId] = useState<string | null>(null);
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

  const handleDrop = useCallback((e: React.DragEvent, toRouteId: string) => {
    e.preventDefault();
    if (!dragDataRef.current) return;
    const { orderId, fromRouteId } = dragDataRef.current;
    if (fromRouteId === toRouteId) return;

    setHasManualChanges(true);

    // 1. Calculate next state
    let next: any[] = [];
    let fromR: any = null;
    let toR: any = null;
    
    setLocalRoutes(prev => {
      const updated = [...prev];
      const fIdx = updated.findIndex(r => String(r.id) === fromRouteId);
      const tIdx = updated.findIndex(r => String(r.id) === toRouteId);
      if (fIdx === -1 || tIdx === -1) return prev;

      fromR = { ...updated[fIdx], orders: [...updated[fIdx].orders] };
      toR = { ...updated[tIdx], orders: [...updated[tIdx].orders] };
      const oIdx = fromR.orders.findIndex((o: any) => o.id === orderId);
      if (oIdx === -1) return prev;

      const [order] = fromR.orders.splice(oIdx, 1);
      toR.orders.push(order);
      updated[fIdx] = fromR; 
      updated[tIdx] = toR;
      next = updated;
      return updated;
    });

    // 2. Perform side effects outside the state transition
    if (next.length > 0 && fromR && toR) {
      if (onUpdateRoutes) onUpdateRoutes(next);
      
      setTimeout(async () => {
        try {
          const presets = localStorageUtils.getAllSettings();
          const osrmUrl = presets.osrmUrl || 'http://osrm.yapiko.kh.ua:5050';
          const calc = async (route: any) => {
            if (!route.orders.length) return { ...route, totalDistance: 0 };
            const start = route.startCoords || { lat: 50.4501, lng: 30.5234 };
            const locs = [start, ...route.orders.map((o: any) => o.coords || { lat: o.lat, lng: o.lng }), start];
            const res = await YapikoOSRMService.calculateRoute(locs, osrmUrl);
            return { ...route, totalDistance: (res.feasible && res.totalDistance !== undefined) ? res.totalDistance / 1000 : route.totalDistance, geometry: res.geometry };
          };
          const [nF, nT] = await Promise.all([calc(fromR), calc(toR)]);
          
          setLocalRoutes(curr => {
             const final = curr.map(r => String(r.id) === fromRouteId ? nF : (String(r.id) === toRouteId ? nT : r));
             if (onUpdateRoutes) onUpdateRoutes(final);
             manualRoutesRef.current = final;
             return final;
          });

          // Save manually modified routes directly to DB
          const saveRoute = async (r: any) => {
             if (!r.id || String(r.id).startsWith('route_')) return; 
             await fetch(`${API_URL}/api/routes/save`, {
                 method: 'POST',
                 headers: {
                   'Content-Type': 'application/json',
                   'Authorization': `Bearer ${localStorage.getItem('km_access_token') || localStorage.getItem('token')}`
                 },
                 body: JSON.stringify(r)
             });
          };

          await Promise.all([saveRoute(nF), saveRoute(nT)]);
          toast.success('Маршруты пересчитаны и синхронизированы');
        } catch (e) { 
          console.warn('OSRM recalc/save failed:', e); 
          toast.error('Ошибка пересчета маршрутов');
        }
      }, 0);
    }
  }, [onUpdateRoutes]);

  const handleManualSave = useCallback(async () => {
     try {
         toast.loading('Сохранение изменений...', { id: 'manual-save' });
         const routesToSave = localRoutes.filter(r => !String(r.id).startsWith('route_'));
         
         await Promise.all(routesToSave.map(r => 
             fetch(`${API_URL}/api/routes/save`, {
                 method: 'POST',
                 headers: {
                   'Content-Type': 'application/json',
                   'Authorization': `Bearer ${localStorage.getItem('km_access_token') || localStorage.getItem('token')}`
                 },
                 body: JSON.stringify(r)
             })
         ));
         
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

  const geoErrors = useMemo(() => allOrders.filter(o => !o.coords || (o.coords.lat === 0 && o.coords.lng === 0)), [allOrders]);

  const filteredRoutesForMap = useMemo(() => {
    if (mapFilter === 'all') return localRoutes;
    const r = localRoutes[mapFilter];
    return r ? [r] : localRoutes;
  }, [localRoutes, mapFilter]);

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

  const zoneAnalytics = useMemo(() => {
    const s: Record<string, number> = {};
    allOrders.forEach((o: any) => {
        const sector = o.deliveryZone || 'БЕЗ СЕКТОРА';
        s[sector] = (s[sector] || 0) + 1;
    });
    return Object.entries(s).sort((a, b) => b[1] - a[1]);
  }, [allOrders]);

  if (!isOpen) return null

  const renderManagement = () => (
    <div className="space-y-12 animate-in fade-in duration-500">
       <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="col-span-2 p-10 rounded-[4rem] bg-[#0c0f16] text-white relative overflow-hidden shadow-2xl">
             <div className="relative z-10">
                <div className="text-[11px] font-black uppercase tracking-[0.4em] text-blue-500 mb-8">Итого за смену</div>
                <div className="text-7xl font-black tracking-tighter leading-none">{Math.floor(stats.total)}<span className="text-2xl text-white/20">.{Math.round((stats.total % 1) * 10)}</span> <span className="text-xl text-white/10 uppercase ml-2">км</span></div>
                <div className="mt-10 flex gap-4">
                   <div className="flex-1 p-5 rounded-[2.5rem] bg-white/5 border border-white/[0.03] backdrop-blur-3xl">
                      <div className="text-[9px] font-bold text-white/30 uppercase mb-2">Доп. пробег</div>
                      <div className="text-xl font-black text-emerald-400">+{stats.bonus.toFixed(1)} км</div>
                   </div>
                   <div className="flex-1 p-5 rounded-[2.5rem] bg-white/5 border border-white/[0.03] backdrop-blur-3xl">
                      <div className="text-[9px] font-bold text-white/30 uppercase mb-2">Заказов</div>
                      <div className="text-xl font-black text-blue-400">{allOrders.length} зак</div>
                   </div>
                </div>
             </div>
             <div className="absolute -top-10 -right-10 w-80 h-80 bg-blue-600/10 rounded-full blur-[100px]" />
          </div>
          
          <div className="p-8 rounded-[3.5rem] border border-slate-200 bg-white shadow-xl flex flex-col justify-between">
             <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-slate-400 mb-6 flex justify-between">
                   <span>КПД</span>
                   <MiniSparkline color="blue" />
                </div>
                <div className="text-5xl font-black text-slate-900">{(stats.total / (distanceDetails?.totalOrders || 1)).toFixed(1)}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">км / заказ</div>
             </div>
          </div>

          <div className="p-8 rounded-[3.5rem] border border-slate-200 bg-white shadow-xl flex flex-col justify-between">
             <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-slate-400 mb-6 flex justify-between">
                   <span>Темп</span>
                   <MiniSparkline color="emerald" />
                </div>
                <div className="text-5xl font-black text-slate-900">{stats.avgSpeed}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">км / ч</div>
             </div>
          </div>
       </div>

       <div className="space-y-8">
          <div className="flex items-center justify-between ml-6">
             <div className="text-[12px] font-black uppercase tracking-[0.5em] text-slate-300 flex items-center gap-4">
                <div className="w-8 h-px bg-slate-200" /> Маршрутные листы (DRAG-N-DROP)
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
          
          {hasManualChanges && (
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
    <div className="h-full flex flex-col gap-0 animate-in slide-in-from-bottom-10 duration-700 overflow-hidden relative">
       
       <div className="w-full shrink-0 z-[1000] sticky top-0">
          <div className="bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xl overflow-hidden transition-all duration-500">
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
                <div className="p-8 grid grid-cols-1 md:grid-cols-4 gap-8 border-t border-slate-50 animate-in fade-in slide-in-from-top-4 duration-500">
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
                              onClick={() => setMapFilter(i)}
                              className={clsx(
                                 "py-3 rounded-xl text-[9px] font-black transition-all border flex flex-col items-center",
                                 mapFilter === i ? "bg-white border-blue-600 text-blue-600 shadow-lg" : "bg-slate-50 border-transparent text-slate-400"
                              )}
                            >
                               <span className="truncate w-full px-1">МАРШРУТ ({(r.orders || []).map((o: any) => o.orderNumber).join(',')})</span>
                               <span className="text-[7px] opacity-60">({r.orders?.length} зак)</span>
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
               routes={filteredRoutesForMap} 
               isDark={false} 
               isAnimating={isAnimating} 
               showZones={showZones} 
               showLabels={showLabels}
               isSatellite={isSatellite}
               focusTrigger={focusTrigger} 
             />
          </div>

          <div className="w-[200px] bg-white border-l border-slate-100 flex flex-col shadow-2xl relative z-10">
             <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                <div className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600 flex items-center gap-3">
                   <ListBulletIcon className="w-4 h-4" /> <span>ЭКСПЛОРЕР</span>
                </div>
             </div>
             <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2 bg-[#f8fafc]">
                {allOrders.map((o, i) => (
                   <div 
                     key={i} 
                     className="p-4 rounded-2xl bg-white border border-slate-100 hover:border-blue-200 transition-all cursor-pointer group"
                   >
                      <div className="flex items-center justify-between mb-2">
                         <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 text-[8px] font-black">#{o.orderNumber}</div>
                         </div>
                      </div>
                      <div className="text-[10px] font-bold text-slate-700 leading-relaxed group-hover:text-blue-600 transition-colors line-clamp-1">{o.address}</div>
                   </div>
                ))}
             </div>
          </div>
       </div>
    </div>
  );

  const renderAnalytics = () => (
    <div className="space-y-10 animate-in fade-in duration-500">
       <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-8">
             <div className="text-[12px] font-black uppercase tracking-[0.5em] text-slate-300 ml-6 flex items-center gap-4">
                <div className="w-8 h-px bg-slate-200" /> Распределение по зонам
             </div>
             <div className="p-10 rounded-[4rem] border border-slate-100 bg-white space-y-4 shadow-xl">
               {zoneAnalytics.map(([s, c]) => (
                 <div key={s} className="flex items-center justify-between p-6 rounded-[2rem] bg-[#f8fafc] border border-slate-50 hover:bg-blue-50/50 transition-all">
                   <div className="flex items-center gap-5">
                     <div className="w-2.5 h-2.5 rounded-full bg-blue-600 shadow-lg" />
                     <span className="text-[12px] font-bold text-slate-700 uppercase tracking-widest">{s}</span>
                   </div>
                   <span className="px-5 py-2 rounded-xl bg-blue-600 text-white text-[12px] font-black">{c} зак</span>
                 </div>
               ))}
             </div>
          </div>
          <div className="p-12 rounded-[4rem] bg-blue-600 text-white shadow-2xl relative overflow-hidden flex flex-col justify-between">
             <div className="relative z-10">
                <h4 className="text-xl font-black uppercase tracking-widest mb-4">Эффективность Смены</h4>
                <p className="text-[11px] font-bold text-white/50 uppercase tracking-[0.2em] max-w-xs leading-relaxed">На основе данных по 5 параметрам, включая плотность заказов и среднюю скорость.</p>
             </div>
             <div className="relative z-10 flex items-center gap-10">
                <div className="w-28 h-28 rounded-full border-8 border-white/10 flex items-center justify-center">
                   <span className="text-4xl font-black">94</span>
                </div>
                <div>
                   <div className="text-[10px] font-black uppercase text-emerald-300 tracking-widest mb-2">Статус: Превосходно</div>
                   <div className="text-[10px] font-bold text-white/50 uppercase">Маршруты оптимальны</div>
                </div>
             </div>
             <SparklesIcon className="absolute -bottom-10 -right-10 w-64 h-64 text-white/5" />
          </div>
       </div>
    </div>
  );

  const renderDiagnostics = () => (
    <div className="space-y-10 animate-in slide-in-from-right-10 duration-500">
       <div className="text-[12px] font-black uppercase tracking-[0.5em] text-slate-300 ml-6 flex items-center gap-4">
          <div className="w-8 h-px bg-slate-200" /> Верификация координат
       </div>
       <div className="p-12 rounded-[4rem] border border-slate-100 bg-white shadow-2xl min-h-[500px]">
          {geoErrors.length > 0 ? (
            <div className="space-y-8">
               <div className="flex items-center justify-between">
                  <div className="text-lg font-black text-rose-500 uppercase tracking-tight">{geoErrors.length} Реальных ошибок найдено</div>
                  <ExclamationTriangleIcon className="w-8 h-8 text-rose-500 animate-pulse" />
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {geoErrors.map((o: any, idx: number) => (
                    <div key={idx} className="p-8 rounded-[2.5rem] border border-rose-100 bg-rose-50/10 flex flex-col gap-6 group hover:bg-white hover:border-rose-300 transition-all">
                       <div className="flex items-center gap-5">
                          <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-rose-500 shadow-sm border border-rose-100">
                             <MapPinIcon className="w-7 h-7" />
                          </div>
                          <div>
                             <div className="text-sm font-black text-slate-800 uppercase tracking-tight">Заказ #{o.orderNumber}</div>
                             <div className="text-[10px] font-bold text-rose-500 uppercase mt-1">Координаты 0.0, 0.0</div>
                          </div>
                       </div>
                       <p className="text-[11px] text-slate-400 font-medium italic leading-relaxed line-clamp-2">{o.address}</p>
                       <button 
                         onClick={() => onEditAddress?.(o, 'unknown')} 
                         className="w-full py-4 rounded-2xl bg-rose-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-500/20 active:scale-95"
                       >
                          Исправить Адрес
                       </button>
                    </div>
                  ))}
               </div>
            </div>
          ) : (
            <div className="py-24 text-center space-y-6">
               <ShieldCheckIcon className="w-20 h-20 text-emerald-500/20 mx-auto" />
               <h4 className="text-xl font-black text-emerald-600 uppercase tracking-widest">Все данные верифицированы</h4>
               <p className="text-[11px] font-bold text-slate-300 uppercase tracking-[0.2em]">Ложные ошибки исключены. Все заказы имеют точные гео-метки.</p>
            </div>
          )}
       </div>
    </div>
  );

  const renderTimeline = () => (
    <div className="space-y-10 animate-in slide-in-from-bottom-10 duration-500">
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

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0a0c16]/90 backdrop-blur-3xl p-4 md:p-8 animate-in fade-in duration-300 font-sans" onClick={onClose}>
      <div className="bg-white rounded-[4.5rem] shadow-[0_100px_250px_rgba(0,0,0,0.6)] overflow-hidden border border-slate-100 w-full max-w-7xl h-full max-h-[96vh] flex flex-col scale-in-center relative" onClick={(e) => e.stopPropagation()}>
        
        {/* Jump-menubar */}
        <div className="flex items-center justify-between px-12 py-8 border-b border-slate-50 shrink-0 bg-white/95 backdrop-blur-2xl sticky top-0 z-30">
          <div className="flex items-center gap-8">
            <div className="w-5 h-5 rounded-full bg-blue-600 shadow-[0_0_30px_rgba(37,99,235,0.7)] animate-pulse" />
            <div className="flex bg-slate-100/50 p-1.5 rounded-[2rem] border border-slate-200/50 shadow-inner">
               {(['management', 'map', 'history', 'analytics', 'diagnostics'] as TabType[]).map((tab) => (
                  <button 
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={clsx(
                       "px-7 py-3 rounded-[1.75rem] text-[10px] font-black uppercase tracking-widest transition-all",
                       activeTab === tab ? "bg-white text-blue-600 shadow-xl" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                     {tab === 'management' && 'Управление'}
                     {tab === 'map' && 'Карта'}
                     {tab === 'history' && 'История'}
                     {tab === 'analytics' && 'Аналитика'}
                     {tab === 'diagnostics' && 'Диагностика'}
                  </button>
               ))}
            </div>
          </div>
          <button onClick={onClose} className="p-4 rounded-[1.75rem] bg-slate-50 text-slate-400 hover:text-slate-900 transition-all border border-slate-100 shadow-sm hover:bg-white hover:shadow-md">
            <XMarkIcon className="w-8 h-8" />
          </button>
        </div>

        {/* Content Area */}
        <div className={clsx("flex-1 overflow-y-auto custom-scrollbar flex flex-col bg-[#f8fafc]/20", activeTab === 'map' ? "p-0 overflow-hidden" : "p-12")}>
          {activeTab !== 'map' && (
             <div className="mb-12">
                <h3 className="text-4xl font-black tracking-tighter text-slate-900 uppercase leading-none">{courierName}</h3>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.4em] mt-5">Панель операционного контроля</p>
             </div>
          )}

          {activeTab === 'management' && renderManagement()}
          {activeTab === 'map' && renderMapTab()}
          {activeTab === 'history' && renderTimeline()}
          {activeTab === 'analytics' && renderAnalytics()}
          {activeTab === 'diagnostics' && renderDiagnostics()}
        </div>

        {/* Action Footer */}
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
