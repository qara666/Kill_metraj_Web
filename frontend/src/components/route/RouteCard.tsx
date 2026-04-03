import React, { memo } from 'react';
import {
  TruckIcon,
  PencilIcon,
  TrashIcon,
  ClockIcon,
  PlayIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import {
  ExclamationTriangleIcon,
  CheckBadgeIcon,
  HomeIcon,
  MapIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/solid';
import { clsx } from 'clsx';
import { Route, Order } from '../../types/route';
import { isOrderCompleted } from '../../utils/data/orderStatus';

interface RouteCardProps {
  route: Route;
  isDark: boolean;
  courierVehicle: string;
  anomalyCheck: any;
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
  anomalyCheck,
  formatDistance,
  formatDuration,
  onOpenGoogleMaps,
  onOpenValhalla,
  onRecalculate,
  onDelete,
  onEditAddress,
  isCalculating
}) => {
  return (
    <div className={clsx(
      'group rounded-[2.5rem] border-2 p-8 transition-all duration-200 relative overflow-hidden',
      route.isVirtual ? 'animate-pulse-slow shadow-blue-500/10' : '',
      isDark
        ? clsx('bg-gray-800/40 border-gray-700 hover:border-blue-500/50 hover:bg-gray-800/80 shadow-black/20', route.isVirtual && 'border-blue-500/40 bg-blue-500/5')
        : clsx('bg-white border-blue-50 shadow-blue-500/5 hover:shadow-2xl hover:border-blue-400', route.isVirtual && 'border-blue-200 bg-blue-50/30')
    )}>
      {/* Линия-акцент */}
      <div className={clsx(
        "absolute top-0 left-0 w-2 h-full transition-all duration-200",
        courierVehicle === 'car' ? "bg-green-500/50" : "bg-orange-500/50",
        "group-hover:w-4"
      )}></div>

      <div className="flex flex-col lg:flex-row items-start justify-between gap-8 mb-8">
        <div className="flex items-center gap-6">
          <div className={clsx(
            'w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110',
            courierVehicle === 'car'
              ? (isDark ? 'bg-green-600/20 text-green-400' : 'bg-green-600 text-white')
              : (isDark ? 'bg-orange-600/20 text-orange-400' : 'bg-orange-600 text-white')
          )}>
            <TruckIcon className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h3 className={clsx(
                'text-2xl font-black tracking-tight',
                isDark ? 'text-gray-100' : 'text-gray-900'
              )}>{String(route.courier)}</h3>
              <span className={clsx(
                'text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-widest',
                courierVehicle === 'car'
                  ? (isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700')
                  : (isDark ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-700')
              )}>
                {courierVehicle === 'car' ? 'Авто' : 'Мото'}
              </span>
              {route.isVirtual && (
                <span className={clsx(
                  "text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-widest animate-pulse",
                  isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                )}>
                  НОВИЙ БЛОК
                </span>
              )}
              {route.orders.every(o => isOrderCompleted(o.status)) && !route.isVirtual && (
                <span className="bg-green-500 text-white text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-widest flex items-center gap-1">
                  <CheckBadgeIcon className="w-3 h-3" />
                  ГОТОВ
                </span>
              )}
            </div>
            <p className={clsx(
              'text-sm font-bold opacity-50 uppercase tracking-widest',
              isDark ? 'text-gray-400' : 'text-gray-500'
            )}>
              {route.orders.length} заказов в списке
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 self-center lg:self-start">
          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/30 p-2 rounded-2xl">
              <button
                onClick={() => onOpenGoogleMaps(route)}
                disabled={isCalculating}
                className={clsx(
                  'p-3 rounded-xl transition-all hover:scale-110 active:scale-90',
                  isDark ? 'text-blue-400 hover:bg-blue-900/20' : 'text-blue-600 hover:bg-blue-50'
                )}
                title={route.isOptimized ? "Открыть в Google Maps" : "Рассчитать"}
              >
                <MapIcon className="h-6 w-6" />
              </button>
              <button
                onClick={() => onOpenValhalla(route)}
                disabled={isCalculating || !route.isOptimized}
                className={clsx(
                  'p-3 rounded-xl transition-all hover:scale-110 active:scale-90',
                  isDark ? 'text-green-400 hover:bg-green-900/20' : 'text-green-600 hover:bg-blue-50',
                  !route.isOptimized && 'opacity-30 grayscale cursor-not-allowed'
                )}
                title="Открыть в Valhalla"
              >
                <PlayIcon className="h-6 w-6 transform rotate-90" />
              </button>
              <button
                onClick={() => onRecalculate(route)}
                disabled={isCalculating}
                className={clsx(
                  'p-3 rounded-xl transition-all hover:scale-110 active:scale-90',
                  isDark ? 'text-green-400 hover:bg-green-900/20' : 'text-green-600 hover:bg-blue-50'
                )}
                title="Пересчитать"
              >
                <ArrowPathIcon className="h-6 w-6" />
              </button>
              <div className="w-px h-6 bg-gray-200 dark:bg-gray-600 mx-1"></div>
              <button
                onClick={() => onDelete(route.id || '')}
                className={clsx(
                  'p-3 rounded-xl transition-all hover:scale-110 active:scale-90',
                  isDark ? 'text-red-400 hover:bg-red-900/20' : 'text-red-600 hover:bg-red-50'
                )}
                title="Удалить"
              >
                <TrashIcon className="h-6 w-6" />
              </button>
          </div>
        </div>
      </div>

      {/* Prominent Address Warning Block v41 */}
      {(() => {
        const missingCoordsOrders = route.orders.filter(o => !o.coords?.lat || !o.coords?.lng);
        if (missingCoordsOrders.length === 0) return null;

        return (
          <div className={clsx(
            "mb-8 p-6 rounded-[2rem] border-2 animate-pulse-slow transition-all duration-300",
            isDark 
              ? "bg-red-500/10 border-red-500/30 text-red-400 shadow-[0_8px_32px_rgba(239,68,68,0.1)]" 
              : "bg-red-50 border-red-100 text-red-600 shadow-[0_8px_32px_rgba(239,68,68,0.05)]"
          )}>
            <div className="flex items-center gap-4 mb-4">
              <div className={clsx(
                "p-2 rounded-xl",
                isDark ? "bg-red-500/20" : "bg-red-100"
              )}>
                <ExclamationTriangleIcon className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-black uppercase tracking-[0.15em] leading-tight">
                  Потребує уточнення адреси
                </h4>
                <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest mt-0.5">
                  Відсутні координати для {missingCoordsOrders.length} {missingCoordsOrders.length === 1 ? 'замовлення' : 'замовлень'}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {missingCoordsOrders.map((order, pIdx) => (
                <div 
                  key={`missing-coords-${order.id || pIdx}`}
                  className={clsx(
                    "flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border border-dashed transition-all group/item",
                    isDark ? "border-red-500/20 bg-red-500/5 hover:bg-red-500/10" : "border-red-200 bg-white hover:bg-red-50/50"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 mb-3 sm:mb-0">
                    <div className={clsx(
                      "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-black",
                      isDark ? "bg-red-500/20" : "bg-red-50"
                    )}>
                      {pIdx + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                         <span className="font-black text-sm">#{order.orderNumber || 'N/A'}</span>
                      </div>
                      <p className="text-xs truncate opacity-70 leading-tight mt-0.5" title={order.address || 'Адрес не указан'}>{order.address || 'Адрес не указан'}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onEditAddress(order)}
                    className={clsx(
                      "group flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-[0.1em] transition-all transform active:scale-95 shadow-md",
                      isDark 
                        ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" 
                        : "bg-red-600 text-white hover:bg-red-700 shadow-red-500/20"
                    )}
                  >
                    <PencilIcon className="w-4 h-4" />
                    УТОЧНИТИ
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="space-y-4">
        {route.orders.map((order: Order, index: number) => {
          const raw = (order as any).raw || {};
          const coords = (order as any).coords || {};
          const meta = (order as any).locationMeta || {};

          const routeMeta = (route as any).geoMeta?.waypoints?.[index];
          const locType = routeMeta?.locationType || order.locationType || coords.locationType || raw.locationType;
          const isRooftop = locType === 'ROOFTOP';
          const isInterpolated = locType === 'RANGE_INTERPOLATED';
          
          const streetMatched = routeMeta?.streetNumberMatched ?? (order as any)?.masterOrder?.streetNumberMatched ?? order.streetNumberMatched ?? raw.streetNumberMatched ?? coords.streetNumberMatched;

          const opZone = routeMeta?.zoneName || order.deliveryZone || raw.deliveryZone;
          const kmlZone = order.kmlZone || meta.kmlZone || coords.kmlZone;
          const hub = order.kmlHub || meta.hubName || coords.kmlHub;
          
          const metaBadge = (
            <div className="mt-2 flex items-center flex-wrap gap-1">
              {/* Verified Status v42.1 */}
              {(isRooftop) && (
                <div className={clsx(
                  "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                  isDark ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-700"
                )}>
                  <CheckBadgeIcon className="w-3.5 h-3.5" />
                  ТОЧНИЙ АДРЕС
                </div>
              )}

              {/* Locked/Verified Status v42.1 */}
              {(order as any).isLocked && (
                <div className={clsx(
                  "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                  isDark ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-green-50 border-green-200 text-green-700"
                )}>
                  <CheckBadgeIcon className="w-3.5 h-3.5" />
                  ПЕРЕВІРЕНО
                </div>
              )}

              {(() => {
                const kmlFull = kmlZone ? `${hub ? hub + ' - ' : ''}${kmlZone}` : null;
                const same = opZone && kmlFull && opZone.trim().toLowerCase() === kmlFull.trim().toLowerCase();
                
                return (
                  <div className={clsx(
                    "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                    ((String(opZone || '').includes('ID:0') || String(kmlZone || '').includes('ID:0')) && !same)
                      ? (isDark ? "bg-red-500/20 border-red-500/40 text-red-400 animate-pulse" : "bg-red-50 border-red-200 text-red-600 shadow-red-500/10")
                      : (isDark ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300" : "bg-indigo-50 border-indigo-100 text-indigo-700")
                  )}>
                    <MapIcon className="w-3.5 h-3.5 opacity-70" />
                    <span className="opacity-60 mr-0.5">СЕКТОР:</span>
                    {(() => {
                      if (same) return `FO/KML:${opZone.trim()}`.toUpperCase();
                      
                      const zones = [
                        opZone ? `FO:${opZone}` : null,
                        kmlFull ? `KML:${kmlFull}` : null
                      ].filter(Boolean).join(' | ').toUpperCase();
                      return zones || '—';
                    })()}
                  </div>
                );
              })()}

              {/* Street Match v42.1 */}
              <div className={clsx(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                locType && locType !== 'APPROXIMATE' && !isInterpolated
                  ? (isDark ? "bg-teal-500/10 border-teal-500/30 text-teal-400" : "bg-teal-50 border-teal-100 text-teal-700")
                  : (isDark ? "bg-rose-500/10 border-rose-500/30 text-rose-400" : "bg-rose-50 border-rose-200 text-rose-700")
              )}>
                <MapIcon className="w-3.5 h-3.5 opacity-70" />
                <span className="opacity-60 mr-0.5">ВУЛИЦЯ:</span>
                {locType && locType !== 'APPROXIMATE' && !isInterpolated ? 'ТАК' : 'НІ'}
              </div>

              {/* House Match v42.1 */}
              {(() => {
                const houseMatched = streetMatched || isInterpolated || isRooftop;
                return (
                  <div className={clsx(
                    "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                    houseMatched
                      ? (isDark ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400" : "bg-cyan-50 border-cyan-100 text-cyan-700")
                      : (isDark ? "bg-orange-500/10 border-orange-500/30 text-orange-400" : "bg-orange-50 border-orange-200 text-orange-700")
                  )}>
                    <HomeIcon className="w-3.5 h-3.5 opacity-70" />
                    <span className="opacity-60 mr-0.5">БУДИНОК:</span>
                    {houseMatched ? 'ТАК' : 'НІ'}
                  </div>
                );
              })()}

              {(!(order.lat || (order as any).coords?.lat) || !(order.lng || (order as any).coords?.lng)) && (
                <div className={clsx(
                  "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 animate-pulse shadow-sm",
                  isDark ? "bg-amber-500/10 border-amber-500/30 text-amber-500" : "bg-amber-50 border-amber-200 text-amber-700 shadow-amber-500/10"
                )}>
                   <ExclamationCircleIcon className="w-3.5 h-3.5" />
                   УТОЧНИТИ АДРЕСУ
                </div>
              )}
            </div>
          );


          const hasAddressIssues = anomalyCheck?.errors.some((error: string) =>
            error.includes('адрес') || error.includes('адресов')
          )

          return (
            <div
              key={`${order.id || order.orderNumber || 'order'}-${index}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('orderId', order.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              className={clsx(
                "flex items-start justify-between p-4 rounded-2xl transition-all duration-200",
                isDark ? "hover:bg-gray-700/30" : "hover:bg-gray-50",
                "cursor-grab active:cursor-grabbing"
              )}
            >
              <div className="flex items-start gap-4 flex-1">
                <span className={clsx(
                  'w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shadow-inner flex-shrink-0',
                  isDark
                    ? 'bg-gray-700 text-blue-400'
                    : 'bg-white text-blue-600 border border-blue-100'
                )}>
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center flex-wrap gap-2 mb-1">
                    <span className={clsx(
                      'font-black text-sm tracking-tight',
                      isDark ? 'text-gray-100' : 'text-gray-900'
                    )}>#{order.orderNumber || 'N/A'}</span>
                    {order.plannedTime && order.plannedTime !== '00:00' && order.plannedTime !== '00:00:00' && order.plannedTime !== 'Без времени' && (
                      <span className={clsx(
                        'flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider',
                        isDark ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'bg-purple-50 text-purple-700 border border-purple-200 shadow-sm'
                      )}>
                        <ClockIcon className="w-3.5 h-3.5 opacity-70" />
                        {order.plannedTime}
                      </span>
                    )}
                  </div>
                  <div className={clsx(
                    'truncate text-sm font-medium',
                    isDark ? 'text-gray-400' : 'text-gray-600',
                    hasAddressIssues && 'text-red-500'
                  )} title={order.address || 'Адрес не указан'}>{order.address || 'Адрес не указан'}</div>
                  {metaBadge}
                </div>
              </div>
              <div className="flex items-center gap-2 pl-4">
                <button
                  onClick={() => onEditAddress(order)}
                  className={clsx(
                    'p-2 rounded-xl transition-all hover:scale-110 active:scale-90',
                    isDark
                      ? 'text-gray-400 hover:text-blue-400 hover:bg-blue-900/20'
                      : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'
                  )}
                  title="Редактировать адрес"
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
                {hasAddressIssues && (
                  <ExclamationTriangleIcon className="h-5 w-5 text-red-500 animate-bounce" title="Проблемы с адресом" />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Метрики маршрута */}
      <div className="mt-8 pt-8 border-t border-gray-100 dark:border-gray-700/50">
        {(route.totalDistance || route.totalDuration) ? (
          <div className="flex flex-wrap items-center gap-6">
            <div className={clsx(
              "flex items-center gap-3 px-4 py-2 rounded-2xl",
              isDark ? "bg-blue-500/10 text-blue-300" : "bg-blue-50 text-blue-700"
            )}>
              <MapIcon className="w-5 h-5" />
              <span className="text-sm font-black tracking-tight">{formatDistance(Number(route.totalDistance || 0))} км</span>
            </div>
            <div className={clsx(
              "flex items-center gap-3 px-4 py-2 rounded-2xl",
              isDark ? "bg-purple-500/10 text-purple-300" : "bg-purple-50 text-purple-700"
            )}>
              <ClockIcon className="w-5 h-5" />
              <span className="text-sm font-black tracking-tight">{formatDuration(Number(route.totalDuration || 0))}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm font-bold opacity-30 uppercase tracking-widest px-4">
            <ExclamationCircleIcon className="w-5 h-5" />
            <span>{route.isVirtual ? 'Потрібен розрахунок' : 'Расстояние не рассчитано'}</span>
          </div>
        )}
      </div>
    </div>
  );
});
