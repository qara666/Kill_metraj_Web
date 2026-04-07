import { memo, useCallback } from 'react';
import {
  TruckIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { PlayIcon } from '@heroicons/react/24/solid';
import { clsx } from 'clsx';

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
  geoErrorCount?: number;
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

// v6.17: BUSINESS PRO - Clean, professional, corporate design
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
  // Pre-compute values
  const calculatedCount = courier.ordersInRoutes || 0;
  const totalCount = courier.orders || 0;
  const dist = distanceDetails?.totalDistance || 0;
  const additionalDist = distanceDetails?.additionalDistance || 0;
  const progressPercent = totalCount > 0 ? Math.round((calculatedCount / totalCount) * 100) : 0;
  const isFullyCalculated = dist > 0 || (totalCount > 0 && calculatedCount >= totalCount);
  const isCalculating = !isFullyCalculated && totalCount > 0 && courier.isActive;

  // Status classes
  const statusActive = courier.isActive;
  const isCalculated = isFullyCalculated;
  
  // Memoized handlers
  const handleCalculate = useCallback(() => {
    window.dispatchEvent(new CustomEvent('km-force-auto-routing', { detail: { courierName: courier.name } }));
  }, [courier.name]);

  const handleDistanceClick = useCallback(() => onDistanceClick(courier), [courier, onDistanceClick]);
  const handleEdit = useCallback(() => onEdit(courier), [courier, onEdit]);
  const handleDelete = useCallback(() => onDelete(courier.id), [courier.id, onDelete]);
  const handleToggleStatus = useCallback(() => onToggleStatus(courier.id), [courier.id, onToggleStatus]);
  const handleToggleVehicle = useCallback(() => onToggleVehicle(courier.id), [courier.id, onToggleVehicle]);

  return (
    <div 
      className={clsx(
        'relative flex flex-col h-full min-h-[320px] rounded-xl border transition-all duration-200',
        isDark
          ? 'bg-[#0c0f14] border-white/[0.08] hover:border-white/[0.12]'
          : 'bg-white border-slate-200 hover:border-slate-300'
      )}
      style={{ contain: 'layout paint' }}
    >
      {/* Header */}
      <div className={clsx(
        "flex items-center justify-between px-4 py-3 border-b",
        isDark ? "border-white/[0.06]" : "border-slate-100"
      )}>
        <div className="flex items-center gap-2">
          <div className={clsx(
            "w-2 h-2 rounded-full",
            statusActive ? "bg-emerald-500" : "bg-slate-400"
          )} />
          <span className={clsx(
            "text-[10px] font-semibold uppercase tracking-wide",
            statusActive ? "text-emerald-500" : "text-slate-500"
          )}>
            {statusActive ? 'Активний' : 'Неактивний'}
          </span>
        </div>
        <span className={clsx(
          "text-[9px] font-medium uppercase tracking-wider px-2 py-0.5 rounded",
          courier.vehicleType === 'car' 
            ? (isDark ? "bg-white/5 text-slate-400" : "bg-slate-100 text-slate-600")
            : (isDark ? "bg-white/5 text-slate-400" : "bg-slate-100 text-slate-600")
        )}>
          {courier.vehicleType === 'car' ? 'АВТО' : 'МОТО'}
        </span>
      </div>

      {/* Courier Info */}
      <div className="px-4 pt-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className={clsx(
              "text-base font-bold uppercase tracking-wide",
              isDark ? "text-white" : "text-slate-900"
            )}>
              {courier.name}
            </h3>
            <span className={clsx("text-[9px] font-medium", isDark ? "text-slate-500" : "text-slate-400")}>
              ID: {courier.id.slice(-6).toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="flex-1 px-4 py-3">
        <div className="grid grid-cols-2 gap-3">
          {/* Distance */}
          <button
            onClick={handleDistanceClick}
            className={clsx(
              "p-3 rounded-lg border text-center transition-colors",
              isCalculated
                ? (isDark ? "bg-emerald-500/5 border-emerald-500/20" : "bg-emerald-50 border-emerald-200")
                : (isDark ? "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]" : "bg-slate-50 border-slate-200 hover:bg-slate-100")
            )}
          >
            <div className={clsx(
              "text-2xl font-bold",
              isCalculated 
                ? (isDark ? "text-emerald-400" : "text-emerald-600")
                : (isDark ? "text-white" : "text-slate-900")
            )}>
              {Math.floor(dist)}
              <span className="text-sm opacity-40">.{Math.round((dist % 1) * 10)}</span>
            </div>
            <div className={clsx("text-[8px] font-semibold uppercase mt-1", isDark ? "text-slate-500" : "text-slate-400")}>
              км
            </div>
            {/* Show additional only when calculated */}
            {isCalculated && additionalDist > 0 && (
              <div className={clsx("text-[8px] font-medium mt-1", isDark ? "text-emerald-500/70" : "text-emerald-600")}>
                +{additionalDist.toFixed(1)} дод
              </div>
            )}
          </button>

          {/* Orders */}
          <div className={clsx(
            "p-3 rounded-lg border",
            isDark ? "bg-white/[0.02] border-white/[0.06]" : "bg-slate-50 border-slate-200"
          )}>
            <div className={clsx(
              "text-2xl font-bold",
              isDark ? "text-white" : "text-slate-900"
            )}>
              {calculatedCount}
              <span className="text-sm opacity-40">/{totalCount}</span>
            </div>
            <div className={clsx("text-[8px] font-semibold uppercase mt-1", isDark ? "text-slate-500" : "text-slate-400")}>
              замовлень
            </div>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="px-4 pb-3">
        <div className="flex justify-between items-center mb-1.5">
          <span className={clsx("text-[8px] font-semibold uppercase tracking-wide", isDark ? "text-slate-500" : "text-slate-400")}>
            Прогрес
          </span>
          <span className={clsx("text-[10px] font-bold", isDark ? "text-white/80" : "text-slate-700")}>
            {progressPercent}%
          </span>
        </div>
        <div className={clsx("h-1.5 rounded-full overflow-hidden", isDark ? "bg-white/10" : "bg-slate-200")}>
          <div 
            className={clsx(
              "h-full rounded-full transition-all duration-300",
              isCalculated ? "bg-emerald-500" : "bg-blue-500"
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 mt-auto">
        <div className="flex gap-2">
          <button
            onClick={handleCalculate}
            disabled={courier.orders === 0}
            className={clsx(
              "flex-1 h-9 rounded-lg text-[10px] font-semibold uppercase tracking-wide transition-colors flex items-center justify-center gap-1.5",
              isCalculated 
                ? (isDark ? "bg-white/10 text-white/80 hover:bg-white/15" : "bg-slate-100 text-slate-600 hover:bg-slate-200")
                : courier.orders === 0 
                  ? (isDark ? "bg-white/5 text-white/30" : "bg-slate-100 text-slate-400")
                  : (isDark ? "bg-blue-600 text-white hover:bg-blue-500" : "bg-blue-600 text-white hover:bg-blue-700")
            )}
          >
            {isCalculating ? (
              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <PlayIcon className="w-3.5 h-3.5" />
            )}
            <span>{isCalculated ? 'Перерах' : 'Рахувати'}</span>
          </button>

          <button
            onClick={handleToggleVehicle}
            className={clsx(
              "w-9 h-9 rounded-lg flex items-center justify-center border transition-colors",
              isDark ? "bg-white/5 border-white/[0.06] text-slate-400" : "bg-slate-50 border-slate-200 text-slate-600"
            )}
          >
            <TruckIcon className={clsx("w-4 h-4", courier.vehicleType === 'car' ? "text-emerald-500" : "text-orange-500")} />
          </button>

          <button
            onClick={handleToggleStatus}
            className={clsx(
              "w-9 h-9 rounded-lg flex items-center justify-center border transition-colors",
              statusActive 
                ? (isDark ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-emerald-50 border-emerald-200 text-emerald-600")
                : (isDark ? "bg-white/5 border-white/[0.06] text-slate-500" : "bg-slate-50 border-slate-200 text-slate-400")
            )}
          >
            <PlayIcon className={clsx("w-4 h-4", statusActive ? "" : "rotate-90 opacity-50")} />
          </button>

          <button
            onClick={handleEdit}
            className={clsx(
              "w-9 h-9 rounded-lg flex items-center justify-center border transition-colors",
              isDark ? "bg-white/5 border-white/[0.06] text-slate-500 hover:text-blue-400" : "bg-slate-50 border-slate-200 text-slate-400 hover:text-blue-600"
            )}
          >
            <PencilIcon className="w-4 h-4" />
          </button>

          <button
            onClick={handleDelete}
            className={clsx(
              "w-9 h-9 rounded-lg flex items-center justify-center border transition-colors",
              isDark ? "bg-white/5 border-white/[0.06] text-slate-500 hover:text-red-400" : "bg-slate-50 border-slate-200 text-slate-400 hover:text-red-600"
            )}
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error Badge */}
      {(courier.geoErrorCount || 0) > 0 && (
        <div className={clsx(
          "absolute top-14 right-3 px-2 py-0.5 rounded text-[8px] font-semibold uppercase z-10",
          isDark ? "bg-red-500/80 text-white" : "bg-red-500 text-white"
        )}>
          {courier.geoErrorCount} помил
        </div>
      )}
    </div>
  );
});

CourierCard.displayName = 'CourierCard';