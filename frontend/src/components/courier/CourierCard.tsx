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
    bonusDistance: number;
    totalDistance: number;
  };
}

// v6.17: БИЗНЕС ПРО — Чистый, профессиональный, корпоративный дизайн
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
  // Предварительно вычисляемые значения
  const calculatedCount = courier.ordersInRoutes || 0;
  const totalCount = courier.orders || 0;
  const dist = distanceDetails?.totalDistance || 0;
  const bonusDist = distanceDetails?.bonusDistance || 0;
  const progressPercent = totalCount > 0 ? Math.round((calculatedCount / totalCount) * 100) : 0;
  const isFullyCalculated = dist > 0 || (totalCount > 0 && calculatedCount >= totalCount);
  const isCalculating = !isFullyCalculated && totalCount > 0 && courier.isActive;

  // Классы статуса
  const statusActive = courier.isActive;
  const isCalculated = isFullyCalculated;
  
  // Мемоизированные обработчики
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
        'relative flex flex-col h-full min-h-[320px] rounded-xl border',
        isDark
<<<<<<< Updated upstream
          ? 'bg-[#0c0f14] border-white/[0.08] hover:border-white/[0.12]'
          : 'bg-white border-slate-200 hover:border-slate-300'
      )}
      style={{ contain: 'layout paint' }}
    >
      {/* Шапка */}
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
=======
          ? 'bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5'
          : 'bg-gradient-to-br from-blue-50 via-transparent to-indigo-50'
      )} />

      <div className="relative z-10">
        {/* Error Badge v17.37 - Suppressed if fully calculated */}
        {courier.hasErrors && !isFullyCalculated && (
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
>>>>>>> Stashed changes
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

      {/* Информация о курьере */}
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

      {/* Сетка статистики */}
      <div className="flex-1 px-4 py-3">
        <div className="grid grid-cols-2 gap-3">
          {/* Дистанция */}
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
<<<<<<< Updated upstream
              {Math.floor(dist)}
              <span className="text-sm opacity-40">.{Math.round((dist % 1) * 10)}</span>
=======
              {(distanceDetails?.totalDistance || 0).toFixed(1)}
              {distanceDetails?.isOptimized && (
                <div className={clsx(
                  "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[8px] font-black tracking-widest leading-none h-5",
                  isDark ? "bg-blue-500/10 border-blue-500/30 text-blue-400" : "bg-blue-50 border-blue-200 text-blue-700 shadow-sm"
                )}>
                  <BoltIcon className="w-3 h-3" />
                  ОПТИМІЗОВАНО
                </div>
              )}
              <span className="text-[12px] font-bold opacity-40 ml-0.5">км</span>
>>>>>>> Stashed changes
            </div>
            <div className={clsx("text-[8px] font-semibold uppercase mt-1", isDark ? "text-slate-500" : "text-slate-400")}>
              км
            </div>
            {/* Показывать доп. только когда рассчитано */}
            {isCalculated && bonusDist > 0 && (
              <div className={clsx("text-[8px] font-medium mt-1", isDark ? "text-emerald-500/70" : "text-emerald-600")}>
                +{bonusDist.toFixed(1)} дод
              </div>
            )}
          </button>

          {/* Заказы */}
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

      {/* Прогресс */}
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

      {/* Действия */}
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

      {/* Значок ошибки */}
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