import { useMemo, memo, useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { 
  XMarkIcon, 
  TruckIcon, 
  MapIcon, 
  BoltIcon, 
  TrashIcon, 
  PlayIcon, 
  PencilIcon,
  ExclamationTriangleIcon,
  CheckBadgeIcon,
  HomeIcon,
  ExclamationCircleIcon,
  ChevronDownIcon,
  ArrowsUpDownIcon
} from '@heroicons/react/24/outline';
import { exportToGoogleMaps, exportToValhalla } from '../../utils/routes/routeExport';
import { needsAddressClarification } from '../../utils/data/addressUtils';
import { toast } from 'react-hot-toast';
import { localStorageUtils } from '../../utils/ui/localStorage';
import { YapikoOSRMService } from '../../services/YapikoOSRMService';
import { useDashboardStore } from '../../stores/useDashboardStore';

// v8.0: MileageModal with Deduplication + Drag-and-Drop between routes

// ─── Order Record ──────────────────────────────────────────────────────────────

interface OrderRecordProps {
  order: any;
  orderIndex: number;
  route: any;
  isDark: boolean;
  onEditAddress: (order: any, routeId: string) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, orderId: string, fromRouteId: string) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  isDragging?: boolean;
}

const OrderRecord = memo(({ order, orderIndex, route, isDark, onEditAddress, draggable, onDragStart, onDragEnd, isDragging }: OrderRecordProps) => {
  const meta = route.geoMeta?.waypoints?.[orderIndex];
  const hasCoords = !!((order.lat || order.coords?.lat) && (order.lng || order.coords?.lng));
  
  const locType = meta?.locationType || order.locationType || (hasCoords ? 'ROOFTOP' : undefined);
  const streetMatched = meta?.streetNumberMatched ?? order.streetNumberMatched ?? (hasCoords ? true : undefined);
  
  const opZone = meta?.zoneName || order.deliveryZone;
  const kmlZone = order.kmlZone || order.locationMeta?.kmlZone;
  const hub = order.kmlHub || meta?.hubName || order.locationMeta?.hubName;
  const hasZones = opZone || kmlZone;

  return (
    <div
      className={clsx(
        "flex items-center justify-between p-3 rounded-2xl transition-all border",
        isDragging ? "opacity-40 scale-95" : "",
        draggable ? "cursor-grab active:cursor-grabbing" : "",
        isDark
          ? `bg-white/[0.03] hover:bg-white/10 ${isDragging ? 'border-blue-500/50' : 'border-transparent'}`
          : `bg-slate-50 hover:bg-slate-100 ${isDragging ? 'border-blue-300' : 'border-transparent'}`
      )}
      draggable={draggable}
      onDragStart={onDragStart ? (e) => onDragStart(e, String(order.orderNumber || order.id), String(route.id)) : undefined}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {draggable && (
          <div className="shrink-0 opacity-30 hover:opacity-70 transition-opacity">
            <ArrowsUpDownIcon className="w-4 h-4" />
          </div>
        )}
        <div className={clsx(
          "w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0",
          isDark ? "bg-white/5 text-gray-400" : "bg-white text-gray-500 border border-slate-100"
        )}>
          {orderIndex + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-black text-sm">#{order.orderNumber}</span>
              <span className="text-[12px] opacity-40 truncate">{order.address}</span>
            </div>
            <button
              onClick={() => onEditAddress(order, route.id)}
              className={clsx(
                "p-1.5 rounded-lg active:scale-95 shrink-0",
                isDark ? "hover:bg-white/5 text-blue-400" : "hover:bg-blue-50 text-blue-600"
              )}
              title="Редактировать адрес"
            >
              <PencilIcon className="w-3.5 h-3.5" />
            </button>
          </div>
          
          <div className="mt-2 flex items-center flex-wrap gap-1.5">
            {locType === 'ROOFTOP' && (
              <div className={clsx(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6",
                isDark ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-700"
              )}>
                <CheckBadgeIcon className="w-3.5 h-3.5" />
                ТОЧНЫЙ АДРЕС
              </div>
            )}

            {order.isLocked && (
              <div className={clsx(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6",
                isDark ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-green-50 border-green-200 text-green-700"
              )}>
                <CheckBadgeIcon className="w-3.5 h-3.5" />
                ПРОВЕРЕНО
              </div>
            )}

            {hasZones && (
              <div className={clsx(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6",
                ((String(opZone || '').includes('ID:0') || String(kmlZone || '').includes('ID:0')))
                  ? (isDark ? "bg-red-500/20 border-red-500/40 text-red-400" : "bg-red-50 border-red-200 text-red-600 shadow-red-500/10")
                  : (isDark ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300" : "bg-indigo-50 border-indigo-100 text-indigo-700")
              )}>
                <MapIcon className="w-3.5 h-3.5 opacity-70" />
                <span className="opacity-60 mr-0.5">СЕКТОР:</span>
                {(() => {
                  const kmlFull = kmlZone ? `${hub ? hub + ' - ' : ''}${kmlZone}` : null;
                  if (opZone && kmlFull && opZone.trim().toLowerCase() === kmlFull.trim().toLowerCase()) {
                    return `FO/KML:${opZone.trim()}`.toUpperCase();
                  }
                  return [
                    opZone ? `FO:${opZone}` : null,
                    kmlFull ? `KML:${kmlFull}` : null
                  ].filter(Boolean).join(' | ').toUpperCase() || '—';
                })()}
              </div>
            )}

            {locType && (
              <div className={clsx(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6",
                locType !== 'APPROXIMATE'
                  ? (isDark ? "bg-teal-500/10 border-teal-500/30 text-teal-400" : "bg-teal-50 border-teal-100 text-teal-700")
                  : (isDark ? "bg-rose-500/10 border-rose-500/30 text-rose-400" : "bg-rose-50 border-rose-200 text-rose-700")
              )}>
                <MapIcon className="w-3.5 h-3.5 opacity-70" />
                <span className="opacity-60 mr-0.5">УЛИЦА:</span>
                {locType !== 'APPROXIMATE' ? 'ДА' : 'НЕТ'}
              </div>
            )}

            {streetMatched !== undefined && (
              <div className={clsx(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6",
                streetMatched && locType !== 'APPROXIMATE'
                  ? (isDark ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400" : "bg-cyan-50 border-cyan-100 text-cyan-700")
                  : (isDark ? "bg-orange-500/10 border-orange-500/30 text-orange-400" : "bg-orange-50 border-orange-200 text-orange-700")
              )}>
                <HomeIcon className="w-3.5 h-3.5 opacity-70" />
                <span className="opacity-60 mr-0.5">ДОМ:</span>
                {streetMatched && locType !== 'APPROXIMATE' ? 'ДА' : 'НЕТ'}
              </div>
            )}

            {!hasCoords && (
              <button 
                onClick={(e) => { e.stopPropagation(); onEditAddress(order, route.id); }}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-1 rounded-xl border text-[9px] font-black tracking-widest leading-none h-7 shadow-sm transition-all hover:scale-105 active:scale-95 group/btn",
                  isDark ? "bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20" : "bg-red-50 border-red-200 text-red-700 shadow-red-500/10"
                )}
              >
                 <ExclamationCircleIcon className="w-4 h-4 animate-pulse group-hover/btn:animate-none" />
                 УТОЧНИТЬ АДРЕС
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
OrderRecord.displayName = 'OrderRecord';

// ─── Route Summary Card ────────────────────────────────────────────────────────

interface RouteSummaryCardProps {
  route: any;
  index: number;
  isDark: boolean;
  onEditAddress: (order: any, routeId: string) => void;
  onDeleteRoute: (id: string) => void;
  // Drag-and-drop
  onDragStart: (e: React.DragEvent, orderId: string, fromRouteId: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, toRouteId: string) => void;
  draggingOrderId: string | null;
  draggingFromRouteId: string | null;
}

const RouteSummaryCard = memo(({ route, index, isDark, onEditAddress, onDeleteRoute, onDragStart, onDragEnd, onDrop, draggingOrderId, draggingFromRouteId }: RouteSummaryCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // v8.0: Deduplicate orders by orderNumber to avoid showing the same order twice
  const uniqueOrders = useMemo(() => {
    const seen = new Set<string>();
    return (route.orders || []).filter((o: any) => {
      const key = String(o.orderNumber || o.id || '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [route.orders]);

  const ordersCount = uniqueOrders.length;
  
  const metrics = useMemo(() => {
    const rawDist = Number(route.totalDistance || route.totalDistanceKm || route.route_data?.totalDistance || 0);
    const rawDur = Number(route.totalDuration || route.totalDurationMin || route.route_data?.totalDuration || 0);
    
    const isActuallyOptimized = route.isOptimized === true || (route.isOptimized !== false && (rawDist > 0 || rawDur > 0));

    const baseDist = isActuallyOptimized ? rawDist : 0;
    const stopsBonus = ordersCount * 0.5;
    
    return {
      total: baseDist + stopsBonus,
      physical: baseDist,
      bonus: stopsBonus,
      isOptimized: isActuallyOptimized,
      duration: rawDur
    };
  }, [route, ordersCount]);

  const problematicOrders = useMemo(() => {
    return uniqueOrders.filter((order: any, idx: number) => {
      const meta = route.geoMeta?.waypoints?.[idx];
      return needsAddressClarification({
        locationType: meta?.locationType || order.locationType,
        streetNumberMatched: meta?.streetNumberMatched ?? order.streetNumberMatched,
        hasCoords: !!(order.lat || order.coords?.lat || meta?.location?.lat)
      });
    });
  }, [uniqueOrders, route]);

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    return hours > 0 ? `${hours}ч ${mins}мин` : `${mins}мин`;
  };

  const pluralizeOrders = (count: number) => {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;
    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return `${count} заказов`;
    if (lastDigit === 1) return `${count} заказ`;
    if (lastDigit >= 2 && lastDigit <= 4) return `${count} заказа`;
    return `${count} заказов`;
  };

  const routeTitle = useMemo(() => {
    if (!uniqueOrders || uniqueOrders.length === 0) return `Маршрут #${index + 1}`;
    const numbers = uniqueOrders.map((o: any) => o.orderNumber).filter(Boolean);
    if (numbers.length === 0) return `Маршрут #${index + 1}`;
    if (numbers.length <= 3) return `Маршрут #${numbers.join(' #')}`;
    return `Маршрут #${numbers[0]} ... #${numbers[numbers.length - 1]} (${numbers.length})`;
  }, [uniqueOrders, index]);

  const isDropTarget = draggingOrderId !== null && draggingFromRouteId !== String(route.id);

  return (
    <div
      className={clsx(
        "relative group p-1 transition-all",
        isDragOver && isDropTarget ? "scale-[1.01]" : ""
      )}
      data-route-card="true"
      onDragOver={(e) => {
        if (!isDropTarget) return;
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        setIsDragOver(false);
        if (isDropTarget) onDrop(e, String(route.id));
      }}
    >
      <div className={clsx(
        "absolute -left-[1.375rem] top-4 w-4 h-4 rounded-full border-4 z-10 transition-transform group-hover:scale-125",
        isDark ? "bg-[#1e1e1e] border-blue-500" : "bg-white border-blue-500"
      )} />

      <div className={clsx(
        "rounded-[2rem] border transition-all",
        isDragOver && isDropTarget
          ? (isDark ? "bg-blue-500/10 border-blue-500/50 shadow-lg shadow-blue-500/10" : "bg-blue-50 border-blue-300 shadow-lg shadow-blue-100")
          : (isDark ? "bg-white/5 border-white/5 hover:bg-white/[0.08]" : "bg-white border-slate-100 hover:border-blue-100 hover:shadow-xl")
      )}>
        {isDragOver && isDropTarget && (
          <div className={clsx(
            "text-center py-2 text-[10px] font-black uppercase tracking-widest",
            isDark ? "text-blue-400" : "text-blue-600"
          )}>
            ↓ ПЕРЕНЕСТИ ЗАКАЗ СЮДА
          </div>
        )}

        <div 
          className="flex items-start md:items-center justify-between p-6 pb-4 border-b border-white/5 flex-col md:flex-row gap-4 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-4 flex-1">
            <div className={clsx(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
              isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-50 text-blue-600"
            )}>
              <TruckIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-black text-[15px] leading-tight break-all">{routeTitle}</h4>
                <ChevronDownIcon className={clsx("w-5 h-5 opacity-40 transition-transform duration-300", isExpanded ? "rotate-180" : "")} />
              </div>
              <p className="text-xs font-bold opacity-40 uppercase tracking-widest mt-0.5">{pluralizeOrders(ordersCount)}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); window.open(exportToGoogleMaps({ route, orders: uniqueOrders, startAddress: route.startAddress || '', endAddress: route.endAddress || '', startCoords: route.startCoords || route.route_data?.startCoords, endCoords: route.endCoords || route.route_data?.endCoords }), '_blank'); }}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors",
                isDark ? "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20" : "bg-blue-50 text-blue-600 hover:bg-blue-100"
              )}
            >
              <MapIcon className="w-4 h-4" /> Google
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); window.open(exportToValhalla({ route, orders: uniqueOrders, startAddress: route.startAddress || '', endAddress: route.endAddress || '', startCoords: route.startCoords || route.route_data?.startCoords, endCoords: route.endCoords || route.route_data?.endCoords }), '_blank'); }}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors",
                isDark ? "bg-green-500/10 text-green-400 hover:bg-green-500/20" : "bg-green-50 text-green-600 hover:bg-green-100"
              )}
            >
              <PlayIcon className="w-4 h-4" /> Valhalla
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteRoute(route.id); }}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors",
                isDark ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-red-50 text-red-600 hover:bg-red-100"
              )}
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isExpanded && (
          <>
            {problematicOrders.length > 0 && (
              <div className={clsx(
                "mx-6 mb-6 mt-4 p-6 rounded-[2rem] border-2",
                isDark ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-red-50 border-red-100 text-red-600"
              )}>
                <div className="flex items-center gap-4 mb-4">
                  <ExclamationTriangleIcon className="w-6 h-6" />
                  <h4 className="text-sm font-black uppercase tracking-widest">Требуется уточнение адреса</h4>
                </div>
                <div className="space-y-3">
                  {problematicOrders.map((order: any, pIdx: number) => (
                    <div key={order.id || pIdx} className={clsx(
                      "flex items-center justify-between p-3 rounded-xl border border-dashed",
                      isDark ? "border-red-500/20 bg-red-500/5" : "border-red-200 bg-white"
                    )}>
                      <span className="font-black text-xs">#{order.orderNumber} <span className="font-normal opacity-70 ml-2">{order.address}</span></span>
                      <button onClick={() => onEditAddress(order, route.id)} className={clsx(
                        "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                        isDark ? "bg-red-500/20 text-red-400" : "bg-red-600 text-white"
                      )}>Уточнить</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Drag tip */}
            <div className={clsx(
              "mx-6 mt-4 mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest opacity-40"
            )}>
              <ArrowsUpDownIcon className="w-3.5 h-3.5" />
              Перетащите заказ в другой маршрут
            </div>

            <div className="p-6 space-y-3">
              {uniqueOrders.map((order: any, orderIndex: number) => (
                <OrderRecord 
                  key={`${order.orderNumber || order.id}-${orderIndex}`} 
                  order={order} 
                  orderIndex={orderIndex} 
                  route={route} 
                  isDark={isDark} 
                  onEditAddress={onEditAddress}
                  draggable={true}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  isDragging={draggingOrderId === String(order.orderNumber || order.id)}
                />
              ))}
            </div>
          </>
        )}

        <div className={clsx(
          "px-6 py-4 rounded-b-[2rem] flex flex-wrap gap-4 items-center justify-between transition-all",
          isDark ? "bg-white/[0.04] backdrop-blur-md" : "bg-slate-50/80 backdrop-blur-sm"
        )}>
          <div className="grid grid-cols-3 gap-6 min-w-[280px]">
            <div className="flex flex-col group/metric">
              <span className="text-[8px] font-black uppercase tracking-[0.2em] opacity-30 group-hover/metric:opacity-60 transition-opacity">Итого</span>
              <span className="text-sm font-black text-blue-500">{metrics.total.toFixed(1)} км</span>
            </div>

            <div className="flex flex-col border-l pl-4 border-black/5 dark:border-white/5 group/metric">
              <span className="text-[8px] font-black uppercase tracking-[0.2em] opacity-30 group-hover/metric:opacity-60 transition-opacity">Пробег + Доп</span>
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-sm font-black opacity-60">{metrics.physical.toFixed(1)}</span>
                <span className="text-[10px] text-blue-400 font-black">+{metrics.bonus.toFixed(1)}</span>
                {metrics.physical === 0 && metrics.bonus > 0 && (
                   <span className="ml-1 px-1.5 py-0.5 rounded-[4px] bg-blue-500/10 text-blue-400 text-[6px] font-black uppercase whitespace-nowrap">Bonus</span>
                )}
              </div>
            </div>

            <div className="flex flex-col border-l pl-4 border-black/5 dark:border-white/5 group/metric">
              <span className="text-[8px] font-black uppercase tracking-[0.2em] opacity-30 group-hover/metric:opacity-60 transition-opacity">Время</span>
              <div className="pt-0.5">
                {(!metrics.isOptimized && !metrics.duration) ? (
                   <div className="flex items-center gap-1 text-[10px] font-black text-blue-500 animate-pulse">
                     <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                     <span>РАСЧЁТ...</span>
                   </div>
                ) : (
                  <span className="text-sm font-black opacity-60">
                    {(() => {
                      const val = metrics.duration;
                      if (!val || val > 960) return '—';
                      return formatDuration(val);
                    })()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {!metrics.isOptimized && (
            <div className={clsx(
              "flex items-center gap-2 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm",
              problematicOrders.length > 0 
                ? (isDark ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-red-50 text-red-600 border border-red-100") 
                : (isDark ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "bg-blue-50 text-blue-600 border border-blue-100")
            )}>
              <div className={clsx("w-2 h-2 rounded-full", problematicOrders.length > 0 ? "bg-red-500" : "bg-blue-500 animate-pulse")} />
              {problematicOrders.length > 0 ? 'ТРЕБУЕТ УТОЧНЕНИЯ' : 'ОБРАБОТКА...'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
RouteSummaryCard.displayName = 'RouteSummaryCard';

// ─── Main Modal ────────────────────────────────────────────────────────────────

interface MileageModalProps {
  courier: any;
  isDark: boolean;
  onClose: () => void;
  getCourierStats: (name: string) => any;
  getCourierRoutes: (name: string) => any[];
  onEditAddress: (order: any, routeId: string) => void;
  onDeleteRoute: (id: string) => void;
}

export const MileageModal = ({ courier, isDark, onClose, getCourierStats, getCourierRoutes, onEditAddress, onDeleteRoute }: MileageModalProps) => {
  const presets = localStorageUtils.getAllSettings();
  const distanceStats = useMemo(() => getCourierStats(courier.name), [courier.name, getCourierStats]);
  const baseRoutes = useMemo(() => getCourierRoutes(courier.name), [courier.name, getCourierRoutes]);

  // Local mutable state — allows drag-and-drop without mutating global store
  const [localRoutes, setLocalRoutes] = useState<any[]>(baseRoutes);
  // Re-sync when base data changes (e.g. WebSocket push)
  useEffect(() => { setLocalRoutes(baseRoutes); }, [baseRoutes]);

  // Drag-and-drop state
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
    const { orderId, fromRouteId } = dragDataRef.current || {};
    if (!orderId || !fromRouteId || fromRouteId === toRouteId) return;

    setLocalRoutes(prev => {
      const next = prev.map(r => ({ ...r, orders: [...(r.orders || [])] }));
      const fromRoute = next.find(r => String(r.id) === fromRouteId);
      const toRoute = next.find(r => String(r.id) === toRouteId);
      if (!fromRoute || !toRoute) return prev;

      const orderIdx = fromRoute.orders.findIndex((o: any) => String(o.orderNumber || o.id) === orderId);
      if (orderIdx === -1) return prev;

      const [movedOrder] = fromRoute.orders.splice(orderIdx, 1);
      toRoute.orders.push(movedOrder);

      // Estimate the physical distance contribution per order
      const fromOriginalCount = fromRoute.orders.length + 1; // It just lost one
      const toOriginalCount = toRoute.orders.length - 1;     // It just gained one
      const avgPhysicalPerOrder = fromOriginalCount > 0 ? (fromRoute.totalDistance || 0) / fromOriginalCount : 1.5;

      const recalcOptimisticDistance = (route: any, isProvider: boolean) => {
        const cnt = route.orders.length;
        if (cnt === 0) return { ...route, totalDistance: 0, ordersCount: 0, orders_count: 0 };
        
        // v7.2: Smarter optimistic recalc. 
        // We use a baseline of 5km + 2km per order as a very rough 'safe' estimate 
        // until the real OSRM (async) returns. This avoids 37km flash.
        const estimate = 5 + (cnt * 2);

        return {
          ...route,
          totalDistance: Number(estimate.toFixed(2)),
          isManuallyAdjusted: true,
          ordersCount: cnt,
          orders_count: cnt,
        };
      };

      const finalNext = next.map(r => {
        if (String(r.id) === fromRouteId) return recalcOptimisticDistance(r, true);
        if (String(r.id) === toRouteId) return recalcOptimisticDistance(r, false);
        return r;
      });

      // --- ASYNC EXACT OSRM RECALCULATION (SOTA) ---
      // We do this AFTER state set to keep UI responsive
      setTimeout(async () => {
         try {
             // We need to fetch true distance using coordinates
             const hubLat = Number(presets.defaultStartLat) || 50.4501;
             const hubLng = Number(presets.defaultStartLng) || 30.5234;
             const osrmUrl = presets.osrmUrl || 'http://osrm.yapiko.kh.ua:5050';

             const calcTrueDistance = async (route: any) => {
                 if (!route || route.orders.length === 0) return { ...route, totalDistance: 0 };
                 
                 const startPt = route.startCoords || route.route_data?.startCoords || { lat: Number(presets.defaultStartLat) || 50.4501, lng: Number(presets.defaultStartLng) || 30.5234 };
                 const endPt = route.endCoords || route.route_data?.endCoords || startPt;
                 const locs = [
                     { lat: Number(startPt.lat), lng: Number(startPt.lng) },
                     ...route.orders.map((o: any) => ({
                         lat: Number(o.coords?.lat || o.lat || 0),
                         lng: Number(o.coords?.lng || o.lng || 0)
                     })).filter((l: any) => l.lat > 0 && l.lng > 0),
                     { lat: Number(endPt.lat), lng: Number(endPt.lng) }
                 ];
                 
                 if (locs.length <= 2) return route; // No valid coords
                 
                 const res = await YapikoOSRMService.calculateRoute(locs, osrmUrl);
                 if (res.feasible && res.totalDistance !== undefined) {
                     return {
                         ...route,
                         totalDistance: Number((res.totalDistance / 1000).toFixed(2)),
                         totalDuration: Math.round(res.totalDuration! / 60),
                         isOptimized: true
                     };
                 }
                 return route;
             };

             const [trueFrom, trueTo] = await Promise.all([
                 calcTrueDistance(finalNext.find(r => String(r.id) === fromRouteId)),
                 calcTrueDistance(finalNext.find(r => String(r.id) === toRouteId))
             ]);

             // Update state with TRUE values
             setLocalRoutes(currentRoutes => currentRoutes.map(r => {
                 if (String(r.id) === fromRouteId) return trueFrom;
                 if (String(r.id) === toRouteId) return trueTo;
                 return r;
             }));
         } catch (err) {
             console.warn('Real-time OSRM Drag-and-Drop update failed:', err);
         }
      }, 50);

      return finalNext;
    });

    toast.success(`Заказ #${orderId} перемещён в другой маршрут`, { icon: '🔄' });
    dragDataRef.current = null;
  }, []);

  const autoRoutingStatus = useDashboardStore(s => s.autoRoutingStatus);
  const isCalculating = autoRoutingStatus.isActive && 
    (autoRoutingStatus.currentCourier === courier.name || autoRoutingStatus.currentCourier === 'СБОР ДАННЫХ...') &&
    (Date.now() - (autoRoutingStatus.lastUpdate || 0) < 120000);

  // Recalculated totals
  const recalcStats = useMemo(() => {
    let totalPhysical = 0;
    let totalBonus = 0;
    let totalOrders = 0;
    let ordersInRoutes = 0;

    localRoutes.forEach(r => {
      const seen = new Set<string>();
      const unique = (r.orders || []).filter((o: any) => {
        const k = String(o.orderNumber || o.id || '');
        if (!k || seen.has(k)) return false;
        seen.add(k); return true;
      });
      const physical = Number(r.totalDistance || 0);
      totalPhysical += physical;
      totalBonus += unique.length * 0.5;
      ordersInRoutes += unique.length;
    });

    (distanceStats?.totalOrders != null) && (totalOrders = distanceStats.totalOrders);

    return {
      totalDistance: totalPhysical + totalBonus,
      effectivePhysicalKm: totalPhysical,
      bonusDistance: totalBonus,
      robotDistance: totalPhysical,
      totalOrders: totalOrders || ordersInRoutes,
      ordersInRoutes,
    };
  }, [localRoutes, distanceStats?.totalOrders]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 transition-opacity" onClick={onClose} />
      
      <div className={clsx(
        "relative w-full max-w-4xl overflow-hidden rounded-[2.5rem] border-2 shadow-2xl flex flex-col max-h-[90vh]",
        isDark ? "bg-[#1e1e1e] border-white/10 text-white" : "bg-white border-blue-100 text-gray-900"
      )}>
        <div className={clsx("flex items-center justify-between p-8 border-b", isDark ? "border-white/5" : "border-slate-100")}>
          <div className="flex items-center gap-4">
            <div className={clsx("p-3 rounded-2xl", courier.vehicleType === 'car' ? "bg-blue-500/10 text-blue-400" : "bg-orange-500/10 text-orange-400")}>
              <TruckIcon className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight leading-tight shrink-0">{courier.name}</h2>
              <p className="text-xs font-bold uppercase tracking-widest opacity-50">Подробная информация о пробеге</p>
            </div>
          </div>
          <button onClick={onClose} className={clsx("p-3 rounded-2xl transition-transform hover:scale-110", isDark ? "bg-white/5 text-gray-400 hover:text-white" : "bg-gray-100 text-gray-500 hover:text-gray-900")}>
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 overscroll-contain">
          <div className="space-y-10">
            <div className={clsx("rounded-[2.5rem] border overflow-hidden", isDark ? "bg-[#1a1c24] border-white/5" : "bg-white border-slate-200 shadow-sm")}>
              <div className={clsx("p-8 border-b grid grid-cols-1 md:grid-cols-3 gap-8", isDark ? "border-white/5 bg-white/[0.02]" : "border-slate-100 bg-slate-50/50")}>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 opacity-40">
                    <MapIcon className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Пробег (км)</span>
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black tabular-nums">{(recalcStats.totalDistance || 0).toFixed(1)}</span>
                      <span className="text-[10px] font-black opacity-30 uppercase tracking-[0.2em]">ИТОГО</span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black opacity-40 uppercase tracking-widest leading-none mb-1 text-nowrap">Основной пробег</span>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-black tabular-nums">{(recalcStats.effectivePhysicalKm || 0).toFixed(1)}</span>
                          {(recalcStats.robotDistance || 0) > 0 && (
                            <div className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-[7px] font-black text-emerald-500 border border-emerald-500/20">ROBOT OK</div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col border-l border-white/5 pl-4">
                        <span className="text-[9px] font-black opacity-40 uppercase tracking-widest leading-none mb-1 text-nowrap text-blue-500">Доп (заказы)</span>
                        <span className="text-lg font-black tabular-nums text-blue-500">+{(recalcStats.bonusDistance || 0).toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 md:border-l md:pl-8 border-white/5">
                  <div className="flex items-center gap-2 opacity-40">
                    <BoltIcon className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Обработка</span>
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black tabular-nums text-blue-500">{recalcStats.ordersInRoutes || 0}</span>
                      <span className="text-xl font-black opacity-30 text-blue-500">/ {recalcStats.totalOrders || 0}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                       <div className={clsx("flex-1 h-1.5 rounded-full overflow-hidden", isDark ? "bg-white/5" : "bg-gray-100")}>
                         <div className={clsx("h-full transition-all duration-1000", (recalcStats.ordersInRoutes || 0) >= (recalcStats.totalOrders || 0) ? "bg-emerald-500" : "bg-blue-500")} style={{ width: `${((recalcStats.ordersInRoutes || 0) / Math.max(1, recalcStats.totalOrders || 0)) * 100}%` }} />
                       </div>
                       <span className="text-[10px] font-black opacity-40">{Math.round(((recalcStats.ordersInRoutes || 0) / Math.max(1, recalcStats.totalOrders || 0)) * 100)}%</span>
                    </div>
                    {(recalcStats.ordersInRoutes || 0) < (recalcStats.totalOrders || 0) && (
                      <p className={clsx("mt-3 text-[9px] font-bold uppercase tracking-widest", isCalculating ? "text-blue-500/60 animate-pulse" : "text-red-500/60")}>
                        {isCalculating ? "РАСЧЕТ В ПРОЦЕССЕ..." : "ОШИБКА: НУЖНО УТОЧНЕНИЕ!"}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-4 md:border-l md:pl-8 border-white/5">
                   <div className="flex items-center gap-2 opacity-40">
                    <ExclamationTriangleIcon className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Ошибки гео</span>
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-baseline gap-2">
                       <span className={clsx("text-4xl font-black tabular-nums", courier.geoErrorCount > 0 ? "text-red-500" : "opacity-20")}>{courier.geoErrorCount || 0}</span>
                       <span className="text-xs font-black opacity-30 uppercase">Alerts</span>
                    </div>
                    {courier.geoErrorCount > 0 && (
                      <p className="mt-2 text-[9px] font-bold text-red-500/60 uppercase tracking-widest animate-pulse">Требуется уточнение адресов</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="flex items-center gap-4">
                <h3 className="text-sm font-black uppercase tracking-[0.2em] opacity-50 shrink-0">История маршрутов ({localRoutes.length})</h3>
                <div className="flex-1 h-px bg-white/5" />
              </div>
              {localRoutes.length > 0 ? (
                <div className="space-y-12 relative pl-8">
                  <div className={clsx("absolute left-[1.125rem] top-2 bottom-2 w-0.5", isDark ? "bg-white/5" : "bg-slate-200")} />
                  {localRoutes.map((route, idx) => (
                    <RouteSummaryCard
                      key={route.id || idx}
                      route={route}
                      index={idx}
                      isDark={isDark}
                      onEditAddress={onEditAddress}
                      onDeleteRoute={onDeleteRoute}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDrop={handleDrop}
                      draggingOrderId={draggingOrderId}
                      draggingFromRouteId={draggingFromRouteId}
                    />
                  ))}
                </div>
              ) : (
                <div className={clsx("flex flex-col items-center justify-center p-20 rounded-[3rem] border-2 border-dashed", isDark ? "bg-white/5 border-white/5" : "bg-slate-50 border-slate-100")}>
                  <div className={clsx("w-20 h-20 rounded-full flex items-center justify-center mb-6", isDark ? "bg-white/5 text-gray-700" : "bg-white text-gray-200")}><MapIcon className="w-10 h-10" /></div>
                  <p className="font-bold opacity-30 uppercase tracking-[0.2em] text-center">У этого курьера<br/>еще нет маршрутов</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={clsx("p-8 border-t flex justify-end shrink-0", isDark ? "border-white/5 bg-[#1e1e1e]" : "border-slate-100 bg-white")}>
          <button onClick={onClose} className="px-8 py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] bg-blue-600 text-white hover:bg-blue-700 active:scale-95 shadow-lg shadow-blue-500/10">Закрыть</button>
        </div>
      </div>
    </div>,
    document.body
  );
};
