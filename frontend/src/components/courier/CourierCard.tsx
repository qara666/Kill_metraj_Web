import { memo } from 'react';
import {
  TruckIcon,
  PencilIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
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
  totalDistance: number;
  totalAmount?: number;
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
  onDistanceClick
}: CourierCardProps) => {
  return (
    <div className={clsx(
      'group relative rounded-[24px] p-5 transition-all duration-300 hover:-translate-y-1',
      isDark
        ? 'bg-[#1e1e1e] border border-white/5 shadow-lg shadow-black/20 hover:shadow-black/40 hover:border-white/10'
        : 'bg-white border border-slate-100 shadow-md shadow-slate-200/50 hover:shadow-xl hover:shadow-blue-900/5 hover:border-blue-100'
    )}>
      {/* Decorative gradient background opacity */}
      <div className={clsx(
        'absolute inset-0 rounded-[24px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none',
        isDark
          ? 'bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5'
          : 'bg-gradient-to-br from-blue-50 via-transparent to-indigo-50'
      )} />

      <div className="relative z-10">
        {/* Header: Avatar, Name, Actions */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={() => onToggleVehicle(courier.id)}
                className={clsx(
                  'w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 relative overflow-hidden group/avatar shadow-sm',
                  courier.vehicleType === 'car'
                    ? isDark ? 'bg-gradient-to-br from-blue-500/20 to-blue-600/10 text-blue-400 border border-blue-500/20' : 'bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 border border-blue-100'
                    : isDark ? 'bg-gradient-to-br from-orange-500/20 to-orange-600/10 text-orange-400 border border-orange-500/20' : 'bg-gradient-to-br from-orange-50 to-orange-100 text-orange-600 border border-orange-100'
                )}
                title="Змінити тип транспорту"
              >
                <TruckIcon className="w-7 h-7 relative z-10 transition-transform group-hover/avatar:scale-110 drop-shadow-sm" />
              </button>
              <div className={clsx(
                'absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full border-[3px] shadow-sm',
                isDark ? 'border-[#1e1e1e]' : 'border-white',
                courier.isActive ? 'bg-emerald-500' : 'bg-red-500'
              )}></div>
            </div>

            <div className="min-w-0">
              <h3 className={clsx(
                'text-[17px] font-black leading-tight truncate transition-colors mb-1.5 tracking-tight',
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

        {/* Stats Grid - 2 columns */}
        <div className="grid grid-cols-2 gap-4">
          {/* Orders Stats */}
          <div className={clsx(
            'rounded-2xl p-4 flex flex-col items-center justify-center border transition-all duration-300',
            isDark
              ? 'bg-white/[0.03] border-white/5 group-hover:bg-blue-500/10 group-hover:border-blue-500/20'
              : 'bg-gray-50/50 border-gray-100 group-hover:bg-blue-50/80 group-hover:border-blue-200'
          )}>
            <div className={clsx(
              'text-2xl font-black leading-none mb-1.5',
              isDark ? 'text-gray-100' : 'text-gray-900'
            )}>
              {courier.orders}
            </div>
            <div className={clsx(
              'text-[10px] font-bold uppercase tracking-widest opacity-60',
              isDark ? 'text-gray-400' : 'text-gray-500'
            )}>
              {getOrdersUkSuffix(courier.orders).split(' ')[1] || 'Зам'}
            </div>
          </div>

          {/* Distance Stats */}
          <button
            onClick={() => onDistanceClick(courier)}
            className={clsx(
              'rounded-2xl p-4 flex flex-col items-center justify-center border transition-all duration-300 cursor-pointer relative overflow-hidden group/stats',
              isDark
                ? 'bg-white/[0.03] border-white/5 hover:bg-emerald-500/10 hover:border-emerald-500/20'
                : 'bg-gray-50/50 border-gray-100 hover:bg-emerald-50/80 hover:border-emerald-200'
            )}
          >
            <div className={clsx(
              'text-2xl font-black leading-none mb-1.5 group-hover/stats:scale-110 transition-transform',
              isDark ? 'text-gray-100' : 'text-gray-900'
            )}>
              {courier.totalDistance.toFixed(1)} <span className="text-[12px] font-bold opacity-40 ml-0.5">км</span>
            </div>
            <div className={clsx(
              'text-[10px] font-bold uppercase tracking-widest opacity-60',
              isDark ? 'text-gray-400' : 'text-gray-500'
            )}>
              Пробіг
            </div>
          </button>
        </div>
      </div>
    </div>
  );
});

CourierCard.displayName = 'CourierCard';
