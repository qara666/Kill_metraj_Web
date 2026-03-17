import React, { memo } from 'react';
import { 
  TruckIcon, 
  MapIcon, 
  CheckBadgeIcon, 
  TrashIcon, 
  PencilIcon, 
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  PlayIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { Route, Order } from '../../types/route';
import { getPaymentMethodBadgeProps } from '../../utils/data/paymentMethodHelper';
import { isOrderCompleted } from '../../utils/data/orderStatus';

interface RouteCardProps {
  route: Route;
  isDark: boolean;
  courierVehicle: string;
  anomalyCheck: any;
  formatDistance: (dist: number) => string;
  formatDuration: (dur: number) => string;
  translateLocationType: (type: string) => string;
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
  translateLocationType,
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
      isDark
        ? 'bg-gray-800/40 border-gray-700 hover:border-blue-500/50 hover:bg-gray-800/80 shadow-black/20'
        : 'bg-white border-blue-50 shadow-blue-500/5 hover:shadow-2xl hover:border-blue-400'
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
              {route.orders.every(o => isOrderCompleted(o.status)) && (
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

      <div className="space-y-4">
        {route.orders.map((order: Order, index: number) => {
          const meta = (route as any).geoMeta?.waypoints?.[index]
          const metaBadge = (meta || order.kmlZone) ? (
            <div className="mt-2 flex items-center flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
              {(meta?.locationType) && (
                <span className={clsx(
                  'px-2 py-0.5 rounded-lg border',
                  meta.locationType === 'ROOFTOP'
                    ? (isDark ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-green-50 text-green-700 border-green-200')
                    : meta.locationType === 'RANGE_INTERPOLATED'
                      ? (isDark ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 'bg-yellow-50 text-yellow-700 border-yellow-200')
                      : (isDark ? 'bg-gray-700 text-gray-400 border-gray-600' : 'bg-gray-50 text-gray-600 border-gray-200')
                )}>{translateLocationType(meta.locationType)}</span>
              )}
              {(typeof meta?.streetNumberMatched === 'boolean' || typeof order.streetNumberMatched === 'boolean') && (
                <span className={clsx(
                  'px-2 py-0.5 rounded-lg border',
                  (meta?.streetNumberMatched ?? order.streetNumberMatched)
                    ? (isDark ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-blue-50 text-blue-700 border-blue-200')
                    : (isDark ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-red-50 text-red-700 border-red-200')
                )}>
                  {(meta?.streetNumberMatched ?? order.streetNumberMatched) ? ' Найден номер дома' : ' Не нашел номера дома'}
                </span>
              )}
              {(meta?.zoneName || order.kmlZone) && (
                <span className={clsx(
                  'px-2 py-0.5 rounded-lg border shadow-sm flex items-center gap-1',
                  isDark ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                )}>
                  <MapIcon className="w-3 h-3" />
                  {order.kmlZone || meta?.zoneName}{(order.kmlHub || meta?.hubName) ? ` / ${order.kmlHub || meta?.hubName}` : ''}
                </span>
              )}
            </div>
          ) : null

          const hasAddressIssues = anomalyCheck?.errors.some((error: string) =>
            error.includes('адрес') || error.includes('адресов')
          )

          return (
            <div
              key={order.id}
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
                    )}>#{order.orderNumber}</span>
                    {order.plannedTime && order.plannedTime !== '00:00' && order.plannedTime !== '00:00:00' && order.plannedTime !== 'Без времени' && (
                      <span className={clsx(
                        'px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider',
                        isDark ? 'bg-purple-600/20 text-purple-300' : 'bg-purple-50 text-purple-700 border border-purple-100'
                      )}>
                        {order.plannedTime}
                      </span>
                    )}
                    {order.paymentMethod && (() => {
                      const badgeProps = getPaymentMethodBadgeProps(order.paymentMethod, isDark)
                      return (
                        <span className={clsx('px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider', badgeProps.bgColorClass, badgeProps.textColorClass)}>
                          {badgeProps.text}
                        </span>
                      )
                    })()}
                  </div>
                  <div className={clsx(
                    'truncate text-sm font-medium',
                    isDark ? 'text-gray-400' : 'text-gray-600',
                    hasAddressIssues && 'text-red-500'
                  )} title={order.address}>{order.address}</div>
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
              <span className="text-sm font-black tracking-tight">{formatDistance(Number(route.totalDistance || 0))}</span>
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
            <span>Расстояние не рассчитано</span>
          </div>
        )}
      </div>
    </div>
  );
});
