import React, { memo, useState } from 'react';
import {
  TruckIcon,
  PencilIcon,
  TrashIcon,
  ClockIcon,
  PlayIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/outline';
import {
  ExclamationTriangleIcon,
  MapIcon as MapIconSolid
} from '@heroicons/react/24/solid';
import { clsx } from 'clsx';
import { Route, Order } from '../../types/route';

interface RouteCardProps {
  route: Route;
  isDark: boolean;
  courierVehicle: string;
  formatDistance: (dist: number) => string;
  formatDuration: (dur: number) => string;
  onOpenGoogleMaps: (route: Route) => void;
  onOpenValhalla: (route: Route) => void;
  onRecalculate: (route: Route) => void;
  onDelete: (routeId: string) => void;
  onEditAddress: (order: Order) => void;
  isCalculating: boolean;
}

export const RouteCard: React.FC<RouteCardProps> = memo(({
  route,
  isDark,
  courierVehicle,
  formatDistance,
  formatDuration,
  onOpenGoogleMaps,
  onOpenValhalla,
  onRecalculate,
  onDelete,
  onEditAddress,
  isCalculating
}) => {
  const [isExpanded, setIsExpanded] = useState(true); // v6.12: expanded by default so orders/addresses/badges are immediately visible
  return (
    <div className={clsx(
      'group rounded-[2rem] border-2 p-6 transition-all duration-300 relative overflow-hidden',
      route.isVirtual ? 'animate-pulse-slow shadow-blue-500/10' : '',
      isDark
        ? clsx('bg-gray-800/20 border-white/5 hover:border-blue-500/30 hover:bg-gray-800/40 shadow-black/20', route.isVirtual && 'border-blue-500/40 bg-blue-500/5')
        : clsx('bg-white border-slate-100 shadow-blue-500/5 hover:shadow-2xl hover:border-blue-400', route.isVirtual && 'border-blue-200 bg-blue-50/30')
    )}>
      {/* Линия-акцент */}
      <div className={clsx(
        "absolute top-0 left-0 w-1.5 h-full transition-all duration-300",
        courierVehicle === 'car' ? "bg-emerald-500/50" : "bg-orange-500/50",
        "group-hover:w-2"
      )}></div>

      <div className="flex flex-col lg:flex-row items-center justify-between gap-6 mb-8 relative z-10">
        <div className="flex items-center gap-5">
          <div className={clsx(
            'w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-105',
            courierVehicle === 'car'
              ? (isDark ? 'bg-emerald-600/20 text-emerald-400' : 'bg-emerald-600 text-white')
              : (isDark ? 'bg-orange-600/20 text-orange-400' : 'bg-orange-600 text-white')
          )}>
            <TruckIcon className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h3 className={clsx(
                'text-lg font-black tracking-tight leading-none uppercase',
                isDark ? 'text-white' : 'text-slate-900'
              )}>{String(route.courier)}</h3>
              <span className={clsx(
                'text-[8px] px-2 py-0.5 rounded-lg font-black uppercase tracking-[0.15em]',
                courierVehicle === 'car'
                  ? (isDark ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border border-emerald-100')
                  : (isDark ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-orange-50 text-orange-700 border border-orange-100')
              )}>
                {courierVehicle === 'car' ? 'Авто' : 'Мото'}
              </span>
              {route.isVirtual && (
                <span className={clsx(
                  "text-[8px] px-2 py-0.5 rounded-lg font-black uppercase tracking-[0.15em] animate-pulse",
                  isDark ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "bg-blue-600 text-white shadow-lg"
                )}>
                  НОВИЙ БЛОК
                </span>
              )}
              {route.isCircularRoute && (
                <span className={clsx(
                  "text-[8px] px-2 py-0.5 rounded-lg font-black uppercase tracking-[0.15em] flex items-center gap-1",
                  isDark ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" : "bg-purple-50 text-purple-700 border border-purple-200"
                )} title="Маршрут замкнут кольцом (без базы)">
                  <ArrowPathIcon className="w-2.5 h-2.5" />
                  КРУГОВОЙ
                </span>
              )}
            </div>
            <p className="text-[10px] font-black opacity-30 uppercase tracking-[0.2em]">
              {route.orders.length} ЗАКАЗОВ В СПИСКЕ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-white/5 border border-white/5">
              <button
                onClick={() => onOpenGoogleMaps(route)}
                disabled={isCalculating}
                className={clsx(
                  'p-2.5 rounded-xl transition-all hover:scale-110 active:scale-95',
                  isDark ? 'text-blue-400 hover:bg-blue-500/10' : 'text-blue-600 hover:bg-blue-50'
                )}
                title="Google Maps"
              >
                <MapIconSolid className="h-5 w-5" />
              </button>
              <button
                onClick={() => onOpenValhalla(route)}
                disabled={isCalculating || !route.isOptimized}
                className={clsx(
                  'p-2.5 rounded-xl transition-all hover:scale-110 active:scale-95',
                  isDark ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-emerald-600 hover:bg-blue-50',
                  !route.isOptimized && 'opacity-20 grayscale cursor-not-allowed'
                )}
                title="Valhalla"
              >
                <PlayIcon className="h-5 w-5 transform rotate-90" />
              </button>
              <button
                onClick={() => onRecalculate(route)}
                disabled={isCalculating}
                className={clsx(
                  'p-2.5 rounded-xl transition-all hover:scale-110 active:scale-95',
                  isDark ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-emerald-600 hover:bg-blue-50'
                )}
                title="Пересчитать"
              >
                <ArrowPathIcon className="h-5 w-5" />
              </button>
              <div className="w-px h-5 bg-white/10 mx-1"></div>
              <button
                onClick={() => onDelete(route.id || '')}
                className={clsx(
                  'p-2.5 rounded-xl transition-all hover:scale-110 active:scale-95',
                  isDark ? 'text-red-400 hover:bg-red-500/10' : 'text-red-600 hover:bg-red-50'
                )}
                title="Удалить"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
              <div className="w-px h-5 bg-white/10 mx-1"></div>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={clsx(
                  'p-2.5 rounded-xl transition-all hover:scale-110 active:scale-95',
                  isDark ? 'text-gray-400 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100'
                )}
                title={isExpanded ? "Свернуть" : "Развернуть"}
              >
                {isExpanded ? <ChevronUpIcon className="h-5 w-5" /> : <ChevronDownIcon className="h-5 w-5" />}
              </button>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-500">

      {/* Address Warning Block v42.1 */}
      {(() => {
        const missingCoordsOrders = route.orders.filter(o => !o.coords?.lat && !(o as any).lat);
        if (missingCoordsOrders.length === 0) return null;

        return (
          <div className={clsx(
            "mb-6 p-5 rounded-3xl border-2 animate-pulse-slow relative z-10",
            isDark 
              ? "bg-red-500/5 border-red-500/20 text-red-400" 
              : "bg-red-50 border-red-100 text-red-600"
          )}>
            <div className="flex items-center gap-3 mb-4">
              <ExclamationTriangleIcon className="w-5 h-5" />
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-[0.15em]">Потребує уточнення адреси</h4>
                <p className="text-[8px] font-bold opacity-60 uppercase mt-0.5">Відсутні координати для {missingCoordsOrders.length} замовлень</p>
              </div>
            </div>

            <div className="space-y-2">
              {missingCoordsOrders.map((order, pIdx) => {
                 const dispId = order.orderNumber || (order as any).id || (order as any)._id || 'N/A';
                 const dispAddr = order.address || (order as any).raw?.address || (order as any).raw?.full_address || 'Адрес не указан';
                 
                 return (
                  <div key={`missing-${order.id || pIdx}`} className={clsx("flex items-center justify-between p-3 rounded-2xl border border-dashed", isDark ? "border-red-500/20 bg-black/20" : "border-red-200 bg-white")}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="text-[10px] font-black opacity-30">{pIdx+1}</div>
                      <div className="min-w-0">
                        <div className="text-[11px] font-black">#{dispId}</div>
                        <div className="text-[9px] truncate opacity-60 font-medium">{dispAddr}</div>
                      </div>
                    </div>
                    <button onClick={() => onEditAddress(order)} className="px-4 py-1.5 rounded-lg bg-red-500 text-white text-[9px] font-black uppercase tracking-widest hover:bg-red-600 transition-colors">УТОЧНИТИ</button>
                  </div>
                 );
              })}
            </div>
          </div>
        );
      })()}

      <div className="space-y-2 relative z-10">
        {route.orders.map((order: Order, index: number) => {
          const raw = (order as any).raw || {};
          const coords = (order as any).coords || {};
          const meta = (order as any).locationMeta || {};
          const routeMeta = (route as any).geoMeta?.waypoints?.[index];
          
          // v5.260: Comprehensive Zone Extraction (Matching OrderList logic)
          const opZone = (order as any).deliveryZone || raw.deliveryZone || raw?.['Зона доставки'] || raw?.['Зона'] || routeMeta?.zoneName;
          const kmlZone = order.kmlZone || meta.kmlZone || coords.kmlZone;
          const hubName = order.kmlHub || meta.hubName || coords.kmlHub;

          const dispId = order.orderNumber || (order as any).id || (order as any)._id || 'N/A';
          const dispAddr = order.address || raw.address || raw.full_address || raw.fullAddress || 'Адрес не указан';

          return (
            <div
              key={`${order.id || index}-${index}`}
              className={clsx(
                "group/order flex items-start justify-between p-3 rounded-2xl transition-all border border-transparent",
                isDark ? "hover:bg-white/[0.03] hover:border-white/5" : "hover:bg-slate-50 hover:border-slate-100"
              )}
            >
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <span className={clsx(
                  'w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 transition-colors',
                  isDark ? 'bg-white/5 text-blue-400 group-hover/order:bg-blue-500/20' : 'bg-slate-100 text-blue-600 group-hover/order:bg-blue-100'
                )}>{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={clsx('font-black text-[13px] tracking-tight', isDark ? 'text-white' : 'text-slate-900')}>#{dispId}</span>
                    {order.plannedTime && order.plannedTime !== '00:00' && (
                      <span className={clsx('flex items-center gap-1 text-[9px] font-black uppercase opacity-60', isDark ? 'text-purple-400' : 'text-purple-600')}>
                        <ClockIcon className="w-3" />
                        {order.plannedTime}
                      </span>
                    )}
                  </div>
                  <div className={clsx('text-[12px] font-medium truncate opacity-60', isDark ? 'text-gray-300' : 'text-slate-600')}>{dispAddr}</div>
                  
                  {/* ELITE BADGES v5.260: Optimized & Direct */}
                  <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                    {/* Operational Status */}
                    <div className={clsx(
                      "flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[8px] font-black uppercase tracking-widest transition-all",
                      order.status === 'исполнен' ? (isDark ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-emerald-50 border-emerald-100 text-emerald-700") :
                      order.status === 'доставляется' ? (isDark ? "bg-blue-500/10 border-blue-500/20 text-blue-400" : "bg-blue-50 border-blue-100 text-blue-700") :
                      order.status === 'собран' ? (isDark ? "bg-amber-500/10 border-amber-500/20 text-amber-400" : "bg-amber-50 border-amber-100 text-amber-700") :
                      (isDark ? "bg-gray-500/10 border-white/5 text-gray-400" : "bg-gray-50 border-gray-100 text-gray-500")
                    )}>
                      {String(order.status || 'В ОБРАБОТКЕ').toUpperCase()}
                    </div>

                    {/* Sector / Zone (v5.260 Combined Logic) */}
                    {(opZone || kmlZone) && (
                      <div className={clsx(
                        "flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[8px] font-black uppercase tracking-widest",
                        isDark ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400" : "bg-indigo-50 border-indigo-100 text-indigo-700"
                      )}>
                        <MapIconSolid className="w-3.5 h-3.5 opacity-40" />
                        <span>
                          {opZone && kmlZone && String(opZone).trim().toUpperCase() === String(kmlZone).trim().toUpperCase()
                            ? `FO/KML: ${opZone}`
                            : `${opZone ? `FO: ${opZone}` : ''}${opZone && kmlZone ? ' | ' : ''}${kmlZone ? `KML: ${hubName ? hubName + ' - ' : ''}${kmlZone}` : ''}`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onEditAddress(order);
                }} 
                className="p-2 text-slate-400 hover:text-blue-500 transition-all opacity-0 group-hover/order:opacity-100 hover:scale-110 active:scale-90"
              >
                <PencilIcon className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  )}

      {/* Footer statistics (Simplified - Only visible when collapsed) */}
      {!isExpanded && (
        <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-4 opacity-60">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-black uppercase tracking-widest">
              <MapIconSolid className="w-3.5 h-3.5" />
              {formatDistance(Number(route.totalDistance || 0))}
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px] font-black uppercase tracking-widest">
              <ClockIcon className="w-3.5 h-3.5" />
              {formatDuration(Number(route.totalDuration || 0))}
            </div>
        </div>
      )}
    </div>
  );
});

RouteCard.displayName = 'RouteCard';
