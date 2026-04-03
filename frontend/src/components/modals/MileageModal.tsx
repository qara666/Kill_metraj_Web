import { useMemo, memo, useCallback, useEffect, useState } from 'react';
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
  ChevronDownIcon
} from '@heroicons/react/24/outline';
import { exportToGoogleMaps, exportToValhalla } from '../../utils/routes/routeExport';
import { needsAddressClarification } from '../../utils/data/addressUtils';

interface OrderRecordProps {
  order: any;
  orderIndex: number;
  route: any;
  isDark: boolean;
  onEditAddress: (order: any, routeId: string) => void;
}

const OrderRecord = memo(({ order, orderIndex, route, isDark, onEditAddress }: OrderRecordProps) => {
  const meta = route.geoMeta?.waypoints?.[orderIndex];
  const hasCoords = !!((order.lat || order.coords?.lat) && (order.lng || order.coords?.lng));
  
  // If order has coordinates but no locType, it means it came from FastOperator with native coordinates (we trust this as ROOFTOP)
  const locType = meta?.locationType || order.locationType || (hasCoords ? 'ROOFTOP' : undefined);
  const streetMatched = meta?.streetNumberMatched ?? order.streetNumberMatched ?? (hasCoords ? true : undefined);
  
  const opZone = meta?.zoneName || order.deliveryZone;
  const kmlZone = order.kmlZone || order.locationMeta?.kmlZone;
  const hub = order.kmlHub || meta?.hubName || order.locationMeta?.hubName;
  const hasZones = opZone || kmlZone;

  return (
    <div className={clsx(
      "flex items-center justify-between p-3 rounded-2xl",
      isDark ? "bg-white/[0.03] hover:bg-white/10" : "bg-slate-50 hover:bg-slate-100"
    )}>
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className={clsx(
          "w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black",
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
                "p-1.5 rounded-lg active:scale-95",
                isDark ? "hover:bg-white/5 text-blue-400" : "hover:bg-blue-50 text-blue-600"
              )}
              title="Редагувати адресу"
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
                ТОЧНИЙ АДРЕС
              </div>
            )}

            {order.isLocked && (
              <div className={clsx(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6",
                isDark ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-green-50 border-green-200 text-green-700"
              )}>
                <CheckBadgeIcon className="w-3.5 h-3.5" />
                ПЕРЕВІРЕНО
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
                <span className="opacity-60 mr-0.5">ВУЛИЦЯ:</span>
                {locType !== 'APPROXIMATE' ? 'ТАК' : 'НІ'}
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
                <span className="opacity-60 mr-0.5">БУДИНОК:</span>
                {streetMatched && locType !== 'APPROXIMATE' ? 'ТАК' : 'НІ'}
              </div>
            )}

            {!hasCoords && (
              <div className={clsx(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 shadow-sm",
                isDark ? "bg-amber-500/10 border-amber-500/30 text-amber-500" : "bg-amber-50 border-amber-200 text-amber-700 shadow-amber-500/10"
              )}>
                 <ExclamationCircleIcon className="w-3.5 h-3.5" />
                 УТОЧНИТИ АДРЕСУ
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="text-sm font-black opacity-30 px-3 uppercase tracking-widest hidden sm:block">
        +0.5 км
      </div>
    </div>
  );
});
OrderRecord.displayName = 'OrderRecord';

interface RouteSummaryCardProps {
  route: any;
  index: number;
  isDark: boolean;
  onEditAddress: (order: any, routeId: string) => void;
  onDeleteRoute: (id: string) => void;
}

const RouteSummaryCard = memo(({ route, index, isDark, onEditAddress, onDeleteRoute }: RouteSummaryCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const ordersCount = route.orders?.length || 0;
  
  const metrics = useMemo(() => {
    const baseDist = route.isOptimized && route.totalDistance ? route.totalDistance : 1.0;
    let addDist = 0;
    if (route.orders) {
      let lastAddr = "";
      route.orders.forEach((o: any) => {
        const currentAddr = (o.address || "").trim().toLowerCase();
        if (currentAddr !== lastAddr) {
          addDist += 0.5;
          lastAddr = currentAddr;
        }
      });
    }
    return {
      base: baseDist,
      additional: addDist,
      total: baseDist + addDist
    };
  }, [route]);

  const problematicOrders = useMemo(() => {
    return route.orders?.filter((order: any, idx: number) => {
      const meta = route.geoMeta?.waypoints?.[idx];
      return needsAddressClarification({
        locationType: meta?.locationType || order.locationType,
        streetNumberMatched: meta?.streetNumberMatched ?? order.streetNumberMatched,
        hasCoords: !!(order.coords?.lat || meta?.location?.lat)
      });
    }) || [];
  }, [route]);

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    return hours > 0 ? `${hours}г ${mins}хв` : `${mins}хв`;
  };

  // Compose title from order numbers instead of just "Маршрут #X"
  const routeTitle = useMemo(() => {
    if (!route.orders || route.orders.length === 0) return `Маршрут #${index + 1}`;
    const numbers = route.orders.map((o: any) => o.orderNumber).filter(Boolean);
    if (numbers.length === 0) return `Маршрут #${index + 1}`;
    return `Маршрут #${numbers.join(' #')}`;
  }, [route.orders, index]);

  return (
    <div className="relative group p-1" data-route-card="true">
      <div className={clsx(
        "absolute -left-[1.375rem] top-4 w-4 h-4 rounded-full border-4 z-10 transition-transform group-hover:scale-125",
        isDark ? "bg-[#1e1e1e] border-blue-500" : "bg-white border-blue-500"
      )} />

      <div className={clsx(
        "rounded-[2rem] border transition-colors",
        isDark ? "bg-white/5 border-white/5 hover:bg-white/[0.08]" : "bg-white border-slate-100 hover:border-blue-100 hover:shadow-xl"
      )}>
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
              <p className="text-xs font-bold opacity-40 uppercase tracking-widest mt-0.5">{ordersCount} замовлень</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); window.open(exportToGoogleMaps({ route, orders: route.orders || [], startAddress: route.startAddress || '', endAddress: route.endAddress || '', startCoords: route.startCoords || route.route_data?.startCoords, endCoords: route.endCoords || route.route_data?.endCoords }), '_blank'); }}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors",
                isDark ? "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20" : "bg-blue-50 text-blue-600 hover:bg-blue-100"
              )}
            >
              <MapIcon className="w-4 h-4" /> Google
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); window.open(exportToValhalla({ route, orders: route.orders || [], startAddress: route.startAddress || '', endAddress: route.endAddress || '', startCoords: route.startCoords || route.route_data?.startCoords, endCoords: route.endCoords || route.route_data?.endCoords }), '_blank'); }}
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
                  <h4 className="text-sm font-black uppercase tracking-widest">Потребує уточнення адреси</h4>
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
                      )}>Уточнити</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-6 space-y-3">
              {route.orders?.map((order: any, orderIndex: number) => (
                <OrderRecord 
                  key={order.id || orderIndex} 
                  order={order} 
                  orderIndex={orderIndex} 
                  route={route} 
                  isDark={isDark} 
                  onEditAddress={onEditAddress}
                />
              ))}
            </div>
          </>
        )}

        <div className={clsx(
          "px-6 py-4 rounded-b-[2rem] flex flex-wrap gap-4 items-center justify-between",
          isDark ? "bg-white/[0.02]" : "bg-slate-50/50"
        )}>
          <div className="flex gap-6">
            <div className="flex flex-col">
              <span className="text-[8px] font-bold uppercase tracking-widest opacity-30">Разом</span>
              <span className="text-sm font-black">{metrics.total.toFixed(1)} км</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] font-bold uppercase tracking-widest opacity-30">База</span>
              <span className="text-sm font-black opacity-60">{metrics.base.toFixed(1)} км</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] font-bold uppercase tracking-widest opacity-30">Час</span>
              <span className="text-sm font-black opacity-60">{route.totalDuration ? formatDuration(route.totalDuration) : '—'}</span>
            </div>
          </div>
          {!route.isOptimized && (
            <div className={clsx(
              "flex items-center gap-2 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest",
              route.hasGeoErrors ? (isDark ? "bg-red-500/20 text-red-500" : "bg-red-50 text-red-600") : (isDark ? "bg-amber-500/10 text-amber-500" : "bg-amber-50 text-amber-700")
            )}>
              {route.hasGeoErrors ? 'ПОМИЛКА (АДРЕСА)' : 'Потребує уточнення'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
RouteSummaryCard.displayName = 'RouteSummaryCard';

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
  const distanceStats = useMemo(() => getCourierStats(courier.name), [courier.name, getCourierStats]);
  const courierRoutes = useMemo(() => getCourierRoutes(courier.name), [courier.name, getCourierRoutes]);

  // Escape key support
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* NO backdrop-blur here for performance */}
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
              <p className="text-xs font-bold uppercase tracking-widest opacity-50">Детальна інформація про пробіг</p>
            </div>
          </div>
          <button onClick={onClose} className={clsx("p-3 rounded-2xl transition-transform hover:scale-110", isDark ? "bg-white/5 text-gray-400 hover:text-white" : "bg-gray-100 text-gray-500 hover:text-gray-900")}>
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 overscroll-contain">
          <div className="space-y-10">
            <div className={clsx("grid grid-cols-1 md:grid-cols-2 gap-8 rounded-[2.5rem] p-8 border", isDark ? "bg-white/5 border-white/5" : "bg-slate-50 border-slate-100")}>
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center", isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-600")}><MapIcon className="w-5 h-5" /></div>
                  <h3 className="text-sm font-black uppercase tracking-[0.2em] opacity-50">Метрики пробігу</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-wider opacity-30 mb-1">Загальний</span><div className="text-3xl font-black tabular-nums">{distanceStats.totalDistance.toFixed(1)} <span className="text-sm opacity-30">км</span></div></div>
                  <div className="flex flex-col sm:border-l sm:border-white/10 sm:pl-4"><span className="text-[10px] font-black uppercase tracking-wider opacity-30 mb-1">База</span><div className="text-3xl font-black tabular-nums opacity-60">{distanceStats.baseDistance.toFixed(1)} <span className="text-sm opacity-30">км</span></div></div>
                  <div className="flex flex-col sm:border-l sm:border-white/10 sm:pl-4"><span className="text-[10px] font-black uppercase tracking-wider opacity-30 mb-1">Додана</span><div className="text-3xl font-black tabular-nums opacity-60">{distanceStats.additionalDistance.toFixed(1)} <span className="text-sm opacity-30">км</span></div></div>
                </div>
              </div>
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                   <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center", isDark ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-100 text-emerald-600")}><BoltIcon className="w-5 h-5" /></div>
                   <h3 className="text-sm font-black uppercase tracking-[0.2em] opacity-50">Статус розрахунку</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-wider opacity-30 mb-1">Всього</span><div className="text-3xl font-black tabular-nums text-blue-500">{distanceStats.totalOrders}</div></div>
                  <div className="flex flex-col sm:border-l sm:border-white/10 sm:pl-4"><span className="text-[10px] font-black uppercase tracking-wider opacity-30 mb-1">Розраховано</span><div className={clsx("text-3xl font-black tabular-nums", distanceStats.ordersInRoutes === distanceStats.totalOrders ? "text-emerald-500" : "text-blue-400")}>{distanceStats.ordersInRoutes}</div></div>
                  <div className="flex flex-col sm:border-l sm:border-white/10 sm:pl-4"><span className="text-[10px] font-black uppercase tracking-wider opacity-30 mb-1">Залишилось</span><div className={clsx("text-3xl font-black tabular-nums", (distanceStats.totalOrders - distanceStats.ordersInRoutes) > 0 ? "text-orange-500" : "text-gray-400 opacity-30")}>{distanceStats.totalOrders - distanceStats.ordersInRoutes}</div></div>
                </div>
                <div className="mt-4"><div className={clsx("h-1.5 w-full rounded-full overflow-hidden", isDark ? "bg-white/5" : "bg-gray-100")}><div className={clsx("h-full transition-all duration-1000", distanceStats.ordersInRoutes === distanceStats.totalOrders ? "bg-emerald-500" : "bg-blue-500")} style={{ width: `${(distanceStats.ordersInRoutes / Math.max(1, distanceStats.totalOrders)) * 100}%` }} /></div></div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="flex items-center gap-4">
                <h3 className="text-sm font-black uppercase tracking-[0.2em] opacity-50 shrink-0">Історія маршрутів ({courierRoutes.length})</h3>
                <div className="flex-1 h-px bg-white/5" />
              </div>
              {courierRoutes.length > 0 ? (
                <div className="space-y-12 relative pl-8">
                  <div className={clsx("absolute left-[1.125rem] top-2 bottom-2 w-0.5", isDark ? "bg-white/5" : "bg-slate-200")} />
                  {courierRoutes.map((route, idx) => (
                    <RouteSummaryCard 
                      key={route.id || idx} 
                      route={route} 
                      index={idx} 
                      isDark={isDark} 
                      onEditAddress={onEditAddress} 
                      onDeleteRoute={onDeleteRoute} 
                    />
                  ))}
                </div>
              ) : (
                <div className={clsx("flex flex-col items-center justify-center p-20 rounded-[3rem] border-2 border-dashed", isDark ? "bg-white/5 border-white/5" : "bg-slate-50 border-slate-100")}>
                  <div className={clsx("w-20 h-20 rounded-full flex items-center justify-center mb-6", isDark ? "bg-white/5 text-gray-700" : "bg-white text-gray-200")}><MapIcon className="w-10 h-10" /></div>
                  <p className="font-bold opacity-30 uppercase tracking-[0.2em] text-center">У цього кур'єра<br/>ще немає маршрутів</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={clsx("p-8 border-t flex justify-end shrink-0", isDark ? "border-white/5 bg-[#1e1e1e]" : "border-slate-100 bg-white")}>
          <button onClick={onClose} className="px-8 py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] bg-blue-600 text-white hover:bg-blue-700 active:scale-95 shadow-lg shadow-blue-500/10">Закрити</button>
        </div>
      </div>
    </div>,
    document.body
  );
};
