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
      'group relative rounded-[20px] p-5 transition-all duration-300 hover:scale-[1.01] hover:shadow-lg',
      isDark
        ? 'bg-[#1e1e1e] border border-white/5 hover:bg-[#252525]'
        : 'bg-white border border-gray-100 hover:border-gray-200 shadow-sm'
    )}>

      <div className="relative z-10">
        {/* Header: Avatar, Name, Actions */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={() => onToggleVehicle(courier.id)}
                className={clsx(
                  'w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 relative overflow-hidden group/avatar',
                  courier.vehicleType === 'car'
                    ? isDark ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'
                    : isDark ? 'bg-orange-500/10 text-orange-400' : 'bg-orange-50 text-orange-600'
                )}
                title="Змінити тип транспорту"
              >
                <TruckIcon className="w-6 h-6 relative z-10 transition-transform group-hover/avatar:scale-110" />
              </button>
              <div className={clsx(
                'absolute -top-1 -right-1 w-3 h-3 rounded-full border-2',
                isDark ? 'border-[#1e1e1e]' : 'border-white',
                courier.isActive ? 'bg-emerald-500' : 'bg-red-500'
              )}></div>
            </div>

            <div className="min-w-0">
              <h3 className={clsx(
                'text-base font-bold leading-tight truncate transition-colors mb-1',
                isDark ? 'text-gray-100 group-hover:text-blue-400' : 'text-gray-900 group-hover:text-blue-600'
              )}>
                {courier.name}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onToggleStatus(courier.id)}
                  className={clsx(
                    'text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border transition-all',
                    courier.isActive
                      ? isDark ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100'
                      : isDark ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20' : 'bg-red-50 text-red-700 border-red-100 hover:bg-red-100'
                  )}
                >
                  {courier.isActive ? 'Активний' : 'Неактивний'}
                </button>
                <div className={clsx(
                  'text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border',
                  isDark ? 'bg-white/5 text-gray-400 border-white/5' : 'bg-gray-50 text-gray-500 border-gray-100'
                )}>
                  {courier.vehicleType === 'car' ? 'Авто' : 'Мото'}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onEdit(courier)}
              className={clsx(
                'p-2 rounded-lg transition-colors',
                isDark ? 'hover:bg-white/10 text-gray-500 hover:text-gray-300' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
              )}
            >
              <PencilIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(courier.id)}
              className={clsx(
                'p-2 rounded-lg transition-colors',
                isDark ? 'hover:bg-red-500/20 text-gray-500 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-500'
              )}
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stats Grid - 2 columns */}
        <div className="grid grid-cols-2 gap-3">
          {/* Orders Stats */}
          <div className={clsx(
            'rounded-xl p-3 flex flex-col items-center justify-center border transition-colors',
            isDark
              ? 'bg-white/[0.02] border-white/5 group-hover:bg-blue-500/5 group-hover:border-blue-500/10'
              : 'bg-gray-50 border-gray-100 group-hover:bg-blue-50 group-hover:border-blue-100'
          )}>
            <div className={clsx(
              'text-lg font-black leading-none mb-1',
              isDark ? 'text-gray-200' : 'text-gray-900'
            )}>
              {courier.orders}
            </div>
            <div className={clsx(
              'text-[9px] font-bold uppercase tracking-wider',
              isDark ? 'text-gray-500' : 'text-gray-400'
            )}>
              {getOrdersUkSuffix(courier.orders).split(' ')[1] || 'Зам'}
            </div>
          </div>

          {/* Distance Stats */}
          <button
            onClick={() => onDistanceClick(courier)}
            className={clsx(
              'rounded-xl p-3 flex flex-col items-center justify-center border transition-all cursor-pointer relative overflow-hidden',
              isDark
                ? 'bg-white/[0.02] border-white/5 hover:bg-emerald-500/5 hover:border-emerald-500/10'
                : 'bg-gray-50 border-gray-100 hover:bg-emerald-50 hover:border-emerald-100'
            )}
          >
            <div className={clsx(
              'text-lg font-black leading-none mb-1',
              isDark ? 'text-gray-200' : 'text-gray-900'
            )}>
              {courier.totalDistance.toFixed(0)} <span className="text-[10px] font-bold opacity-40">км</span>
            </div>
            <div className={clsx(
              'text-[9px] font-bold uppercase tracking-wider',
              isDark ? 'text-gray-500' : 'text-gray-400'
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
