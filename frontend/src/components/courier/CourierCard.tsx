import { memo } from 'react';
import {
  TruckIcon,
  PencilIcon,
  TrashIcon,
  BoltIcon
} from '@heroicons/react/24/outline';
import { ExclamationTriangleIcon, PlayIcon } from '@heroicons/react/24/solid';
import { clsx } from 'clsx';
import { getOrdersUkSuffix } from '../../utils/route/routeCalculationHelpers';

interface Courier {
  id: string;
  name: string;
  phone: string;
  email: string;
  vehicleType: 'car' | 'motorcycle';
  location: string;
  isActive: boolean;
  orders: number;
  ordersInRoutes?: number;
  totalDistance: number;
  totalAmount?: number;
  hasErrors?: boolean;
  // Event tracking
  cancelledCount?: number;
  reassignedOutCount?: number;
  reassignedInCount?: number;
}

interface CourierCardProps {
  courier: Courier;
  isDark: boolean;
  onEdit: (courier: Courier) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string) => void;
  onToggleVehicle: (id: string) => void;
  onDistanceClick: (courier: Courier) => void;
  distanceDetails: {
    baseDistance: number;
    additionalDistance: number;
    totalDistance: number;
  };
}

export const CourierCard = memo(({
  courier,
  isDark,
  onEdit,
  onDelete,
  onToggleStatus,
  onToggleVehicle,
  onDistanceClick,
  distanceDetails
}: CourierCardProps) => {
  const calculatedCount = courier.ordersInRoutes || 0;
  const totalCount = courier.orders || 0;
  const calculationProgress = totalCount > 0 ? (calculatedCount / totalCount) * 100 : 0;
  
  // v5.153: isFullyCalculated: true when robot has calculated distance OR all orders are in routes
  const hasRobotCalculated = (distanceDetails?.totalDistance || 0) > 0;
  const isFullyCalculated = hasRobotCalculated || (totalCount > 0 && calculatedCount >= totalCount);
  const hasNoOrders = totalCount === 0;


  return (
    <div className={clsx(
      'group relative rounded-[32px] p-6 transition-all duration-300 hover:-translate-y-1',
      isDark
        ? 'bg-[#1e1e1e] border border-white/5 shadow-lg shadow-black/20 hover:shadow-black/40 hover:border-white/10'
        : 'bg-white border border-slate-100 shadow-md shadow-slate-200/50 hover:shadow-xl hover:shadow-blue-900/5 hover:border-blue-100'
    )}>
      {/* Decorative gradient background opacity */}
      <div className={clsx(
        'absolute inset-0 rounded-[32px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none',
        isDark
          ? 'bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5'
          : 'bg-gradient-to-br from-blue-50 via-transparent to-indigo-50'
      )} />

      <div className="relative z-10">
        {/* Error Badge v40.2 - Premium Warning Tab */}
        {courier.hasErrors && (
          <div className="absolute -top-2 -right-2 z-20 group" title="Потребує уточнення адреси для замовлень">
            <div className={clsx(
              "relative p-2.5 rounded-tr-[32px] rounded-bl-[24px] border-l border-b backdrop-blur-xl transition-all duration-500 ease-out overflow-hidden shadow-2xl",
              isDark
                ? "bg-amber-500/15 border-amber-500/30 group-hover:bg-amber-500/25"
                : "bg-amber-50/90 border-amber-200 group-hover:bg-amber-100/95"
            )}>
              {/* Premium Glass Highlights */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
              <div className="absolute -inset-full bg-gradient-to-r from-transparent via-white/10 to-transparent group-hover:animate-shine pointer-events-none" />

              {/* Internal Aura */}
              <div className={clsx(
                "absolute inset-0 opacity-20 blur-sm",
                isDark ? "bg-amber-400" : "bg-amber-300"
              )} />

              <div className="relative flex items-center justify-center">
                <ExclamationTriangleIcon className={clsx(
                  "w-6 h-6 transform transition-all duration-500 group-hover:scale-125 group-hover:rotate-12",
                  "text-amber-500 drop-shadow-[0_0_12px_rgba(245,158,11,0.8)]",
                  "animate-pulse"
                )} />

                {/* Ring animation */}
                <div className="absolute inset-0 w-full h-full border-2 border-amber-400/50 rounded-full animate-ping opacity-0 group-hover:opacity-100" />
              </div>
            </div>
          </div>
        )}

        {/* Header: Avatar, Name, Actions */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={() => onToggleVehicle(courier.id)}
                className={clsx(
                  'w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 relative overflow-hidden group/avatar shadow-sm',
                  courier.vehicleType === 'car'
                    ? isDark ? 'bg-gradient-to-br from-blue-500/20 to-blue-600/10 text-blue-400 border border-blue-500/20' : 'bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 border border-blue-100'
                    : isDark ? 'bg-gradient-to-br from-orange-500/20 to-orange-600/10 text-orange-400 border border-orange-500/20' : 'bg-gradient-to-br from-orange-50 to-orange-100 text-orange-600 border border-orange-100'
                )}
                title="Змінити тип транспорту"
              >
                <TruckIcon className="w-8 h-8 relative z-10 transition-transform group-hover/avatar:scale-110 drop-shadow-sm" />
              </button>
              <div className={clsx(
                'absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full border-[3px] shadow-sm',
                isDark ? 'border-[#1e1e1e]' : 'border-white',
                courier.isActive ? 'bg-green-500' : 'bg-red-500'
              )}></div>
            </div>

            <div className="min-w-0">
              <h3 className={clsx(
                'text-[18px] font-black leading-tight truncate transition-colors mb-1.5 tracking-tight',
                isDark ? 'text-gray-100 group-hover:text-blue-400' : 'text-gray-900 group-hover:text-blue-600'
              )}>
                {courier.name}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onToggleStatus(courier.id)}
                  className={clsx(
                    'text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border transition-all shadow-sm',
                    courier.isActive
                      ? isDark ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100'
                      : isDark ? 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20' : 'bg-red-50 text-red-700 border-red-100 hover:bg-red-100'
                  )}
                >
                  {courier.isActive ? 'Активний' : 'Неактивний'}
                </button>
                <div className={clsx(
                  'text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border',
                  isDark ? 'bg-white/5 text-gray-400 border-white/5' : 'bg-gray-50 text-gray-500 border-gray-100'
                )}>
                  {courier.vehicleType === 'car' ? 'Авто' : 'Мото'}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0">
            <button
              onClick={() => onEdit(courier)}
              className={clsx(
                'p-2.5 rounded-xl transition-all active:scale-95',
                isDark ? 'hover:bg-white/10 text-gray-500 hover:text-white' : 'hover:bg-blue-50 text-gray-400 hover:text-blue-600'
              )}
            >
              <PencilIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(courier.id)}
              className={clsx(
                'p-2.5 rounded-xl transition-all active:scale-95',
                isDark ? 'hover:bg-red-500/20 text-gray-500 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-500'
              )}
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Calculation Status Bar - Premium Design */}
        <div className="mb-6 space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <BoltIcon className={clsx(
                'w-3.5 h-3.5',
                isFullyCalculated ? 'text-green-500' : 'text-blue-500 animate-pulse'
              )} />
              <span className={clsx(
                'text-[11px] font-black uppercase tracking-wider',
                isDark ? 'text-gray-400' : 'text-gray-500'
              )}>
                {isFullyCalculated ? 'Розраховано' : 'В процесі...'}
              </span>
            </div>
            <span className={clsx(
              'text-[11px] font-black tabular-nums',
              isDark ? 'text-blue-400' : 'text-blue-600'
            )}>
              {calculatedCount} {getOrdersUkSuffix(calculatedCount).split(' ')[1]}
            </span>
          </div>
          <div className={clsx(
            'h-2.5 w-full rounded-full p-[2px] overflow-hidden',
            isDark ? 'bg-white/5 shadow-inner' : 'bg-gray-100 shadow-inner'
          )}>
            <div
              className={clsx(
                'h-full rounded-full transition-all duration-1000 ease-out relative',
                isFullyCalculated
                  ? 'bg-gradient-to-r from-emerald-500 to-green-400'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-500'
              )}
              style={{ width: `${Math.min(100, Math.max(5, calculationProgress))}%` }}
            >
              {/* Animated highlight */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
            </div>
          </div>
        </div>

        {/* Stats Grid - 2 columns */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Distance Stats */}
          <button
            onClick={() => onDistanceClick(courier)}
            className={clsx(
              'rounded-2xl p-4 flex flex-col items-center justify-center border transition-all duration-300 cursor-pointer relative overflow-hidden group/stats shadow-sm',
              isDark
                ? 'bg-white/[0.03] border-white/5 hover:bg-emerald-500/10 hover:border-emerald-500/20'
                : 'bg-gray-50/50 border-gray-100 hover:bg-emerald-50/80 hover:border-emerald-200 shadow-sm'
            )}
          >
            <div className={clsx(
              'text-2xl font-black leading-none mb-1.5 group-hover/stats:scale-110 transition-transform',
              isDark ? 'text-gray-100' : 'text-gray-900'
            )}>
              {(distanceDetails?.totalDistance || 0).toFixed(1)} <span className="text-[12px] font-bold opacity-40 ml-0.5">км</span>
            </div>
            <div className={clsx(
              'text-[10px] font-bold uppercase tracking-widest opacity-60',
              isDark ? 'text-gray-400' : 'text-gray-500'
            )}>
              Пробіг
            </div>
          </button>

          {/* Orders Stats */}
          <div className={clsx(
            'rounded-2xl p-4 flex flex-col items-center justify-center border transition-all duration-300',
            isDark
              ? 'bg-white/[0.03] border-white/5'
              : 'bg-gray-50/50 border-gray-100'
          )}>
            <div className={clsx(
              'text-2xl font-black leading-none mb-1.5',
              isDark ? 'text-gray-100' : 'text-gray-900'
            )}>
              {calculatedCount}
            </div>
            <div className={clsx(
              'text-[10px] font-bold uppercase tracking-widest opacity-60',
              isDark ? 'text-gray-400' : 'text-gray-500'
            )}>
              {getOrdersUkSuffix(calculatedCount).split(' ')[1] || 'Заказов'}
            </div>
          </div>
        </div>
        {/* Event Badges: Cancelled / Reassigned out / Reassigned in */}
        {((courier.cancelledCount ?? 0) > 0 || (courier.reassignedOutCount ?? 0) > 0 || (courier.reassignedInCount ?? 0) > 0) && (
          <div className="flex flex-wrap gap-2 mb-4">
            {(courier.cancelledCount ?? 0) > 0 && (
              <div className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest',
                isDark
                  ? 'bg-red-500/10 border-red-500/20 text-red-400'
                  : 'bg-red-50 border-red-200 text-red-600'
              )}>
                <span>❌</span>
                <span>Скас.: {courier.cancelledCount}</span>
              </div>
            )}
            {(courier.reassignedOutCount ?? 0) > 0 && (
              <div className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest',
                isDark
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              )}>
                <span>↗️</span>
                <span>Перед.: {courier.reassignedOutCount}</span>
              </div>
            )}
            {(courier.reassignedInCount ?? 0) > 0 && (
              <div className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest',
                isDark
                  ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                  : 'bg-blue-50 border-blue-200 text-blue-700'
              )}>
                <span>↘️</span>
                <span>Принял: {courier.reassignedInCount}</span>
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => window.dispatchEvent(new CustomEvent('km-force-auto-routing', { detail: { courierName: courier.name } }))}
          disabled={isFullyCalculated || hasNoOrders}
          className={clsx(
            'w-full py-4 rounded-2xl font-black text-[13px] uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-3 active:scale-[0.98]',
            (isFullyCalculated || hasNoOrders)
              ? (isDark ? 'bg-gray-800 text-gray-500 cursor-default grayscale' : 'bg-gray-100 text-gray-400 cursor-default grayscale')
              : (isDark
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                : 'bg-blue-500 hover:bg-blue-600 text-white shadow-xl shadow-blue-500/20')
          )}
        >
          <PlayIcon className="w-5 h-5 shadow-sm" />
          <span>ЗАПУСТИТЬ РАСЧЕТ</span>
        </button>
      </div>
    </div>
  );
});

CourierCard.displayName = 'CourierCard';
