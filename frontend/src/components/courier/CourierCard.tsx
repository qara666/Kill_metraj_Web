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
      'group rounded-3xl flex flex-col transition-all cursor-default border overflow-hidden h-full min-h-[300px]',
      isDark
        ? 'bg-[#151b2b] border-white/5 hover:border-white/10'
        : 'bg-white border-slate-200 hover:border-blue-200 shadow-sm hover:shadow-md'
    )}>
      {/* Top Banner indicating status visually */}
      <div className={clsx(
        "h-1 w-full",
        !courier.isActive ? "bg-red-500 opacity-50" : (isFullyCalculated ? "bg-emerald-500" : "bg-blue-500")
      )} />

      <div className="p-5 relative flex-1 flex flex-col">
        {courier.hasErrors && (
          <div className="absolute top-4 right-4 text-red-500 bg-red-50 p-1.5 rounded-lg border border-red-100 dark:bg-red-500/10 dark:border-red-500/20" title="Потребує уточнення адреси для замовлень">
            <ExclamationTriangleIcon className="w-4 h-4" />
          </div>
        )}

        <div className="flex items-center gap-3 mb-5 pr-8">
          <button
            onClick={() => onToggleVehicle(courier.id)}
            className={clsx(
              "w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95",
              isDark ? "bg-white/5 text-gray-300" : "bg-slate-50 border border-slate-100 text-slate-600"
            )}
            title="Змінити тип транспорту"
          >
             <TruckIcon className="w-6 h-6" />
          </button>
          
          <div className="min-w-0 flex-1">
            <h3 className={clsx(
              "text-[15px] font-black leading-tight truncate tracking-tight",
              isDark ? "text-white" : "text-slate-900"
            )} title={courier.name}>
              {courier.name}
            </h3>
            <div className="flex items-center gap-2 mt-1.5">
              <button
                onClick={() => onToggleStatus(courier.id)}
                className={clsx(
                  "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md flex items-center gap-1.5 transition-colors",
                  courier.isActive 
                    ? (isDark ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100")
                    : (isDark ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-red-50 text-red-700 hover:bg-red-100")
                )}
              >
                <div className={clsx("w-1.5 h-1.5 rounded-full", courier.isActive ? "bg-emerald-500" : "bg-red-500")} />
                {courier.isActive ? 'Активний' : 'Вимкнений'}
              </button>
            </div>
          </div>
        </div>

        {/* Calculation Status Bar - Light version */}
        <div className="mb-6 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <BoltIcon className={clsx(
                "w-3.5 h-3.5",
                isFullyCalculated ? "text-emerald-500" : "text-blue-500"
              )} />
              <span className={clsx(
                "text-[10px] font-bold uppercase tracking-widest",
                isDark ? "text-gray-400" : "text-gray-500"
              )}>
                {isFullyCalculated ? 'Розраховано' : 'В процесі'}
              </span>
            </div>
            <span className={clsx("text-xs font-black", isDark ? "text-white" : "text-slate-900")}>
              {calculatedCount} <span className="opacity-40 font-bold mx-0.5">/</span> {totalCount}
            </span>
          </div>
          <div className={clsx("h-1.5 w-full rounded-full overflow-hidden", isDark ? "bg-white/5" : "bg-slate-100")}>
            <div 
              className={clsx("h-full rounded-full transition-all", isFullyCalculated ? "bg-emerald-500" : "bg-blue-500")}
              style={{ width: `${Math.min(100, Math.max(0, calculationProgress))}%` }}
            />
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-4">
          {/* Action icons row (Edit / Delete) - visible on hover if no events, or always if space allows */}
          <div className="flex justify-between items-center h-6">
            {((courier.cancelledCount ?? 0) > 0 || (courier.reassignedOutCount ?? 0) > 0 || (courier.reassignedInCount ?? 0) > 0) ? (
              <div className="flex gap-1.5">
                {(courier.cancelledCount ?? 0) > 0 && <span className={clsx("text-[9px] font-black uppercase px-1.5 py-0.5 rounded", isDark ? "bg-red-500/10 text-red-500" : "bg-red-50 text-red-600")} title="Скасовано">❌ {courier.cancelledCount}</span>}
                {(courier.reassignedOutCount ?? 0) > 0 && <span className={clsx("text-[9px] font-black uppercase px-1.5 py-0.5 rounded", isDark ? "bg-amber-500/10 text-amber-500" : "bg-amber-50 text-amber-600")} title="Передано іншому">↗ {courier.reassignedOutCount}</span>}
                {(courier.reassignedInCount ?? 0) > 0 && <span className={clsx("text-[9px] font-black uppercase px-1.5 py-0.5 rounded", isDark ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-600")} title="Прийнято від іншого">↘ {courier.reassignedInCount}</span>}
              </div>
            ) : <div />}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
               <button onClick={() => onEdit(courier)} className="p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-500/10">
                 <PencilIcon className="w-4 h-4" />
               </button>
               <button onClick={() => onDelete(courier.id)} className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-500/10">
                 <TrashIcon className="w-4 h-4" />
               </button>
            </div>
          </div>

          {/* Stats Grid - Solid and clean */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onDistanceClick(courier)}
              className={clsx(
                "rounded-2xl p-4 flex flex-col items-center justify-center transition-colors active:scale-95",
                isDark ? "bg-white/[0.02] hover:bg-white/[0.06]" : "bg-slate-50/70 border border-slate-100 hover:bg-blue-50/50"
              )}
            >
              <div className={clsx("text-2xl font-black leading-none mb-1", isDark ? "text-white" : "text-slate-900")}>
                {(distanceDetails?.totalDistance || 0).toFixed(1)}
              </div>
              <div className={clsx("text-[9px] font-bold uppercase tracking-widest", isDark ? "text-gray-500" : "text-gray-400")}>
                КМ Пробіг
              </div>
            </button>
            <div className={clsx(
              "rounded-2xl p-4 flex flex-col items-center justify-center",
              isDark ? "bg-white/[0.02]" : "bg-slate-50/70 border border-slate-100"
            )}>
              <div className={clsx("text-2xl font-black leading-none mb-1", isDark ? "text-white" : "text-slate-900")}>
                {totalCount}
              </div>
              <div className={clsx("text-[9px] font-bold uppercase tracking-widest", isDark ? "text-gray-500" : "text-gray-400")}>
                {getOrdersUkSuffix(totalCount)}
              </div>
            </div>
          </div>

          <button
            onClick={() => window.dispatchEvent(new CustomEvent('km-force-auto-routing', { detail: { courierName: courier.name } }))}
            disabled={isFullyCalculated || hasNoOrders}
            className={clsx(
              "w-full py-4 mt-1 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-colors flex items-center justify-center gap-2",
              (isFullyCalculated || hasNoOrders)
                ? (isDark ? 'bg-white/5 text-gray-500' : 'bg-slate-100 text-gray-400')
                : 'bg-blue-600 hover:bg-blue-700 text-white active:bg-blue-800'
            )}
          >
            <PlayIcon className="w-4 h-4" />
            Запустити розрахунок
          </button>
        </div>
      </div>
    </div>
  );
});

CourierCard.displayName = 'CourierCard';
