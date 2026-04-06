import { memo, useEffect } from 'react';
import { clsx } from 'clsx';
import { TruckIcon } from '@heroicons/react/24/outline';
import { isId0CourierName } from '../../utils/data/courierName';

interface CourierListItemProps {
  courierName: string;
  vehicleType: string;
  isSelected: boolean;
  onSelect: (name: string) => void;
  deliveredOrdersCount: number;
  totalOrdersCount: number;
  calculatedCount?: number;
  unassignedCount?: number;
  distanceKm?: number;
  isDark: boolean;
}

export const CourierListItem = memo(({
  courierName,
  vehicleType,
  isSelected,
  onSelect,
  deliveredOrdersCount,
  totalOrdersCount,
  distanceKm = 0,
  isDark
}: CourierListItemProps) => {

  const isUnassigned = courierName === 'Не назначено' || isId0CourierName(courierName)
  const progress = totalOrdersCount > 0 ? (deliveredOrdersCount / totalOrdersCount) * 100 : 0
  const isFinished = totalOrdersCount > 0 && deliveredOrdersCount === totalOrdersCount
  const remainingTasks = totalOrdersCount - deliveredOrdersCount

  useEffect(() => {
    // Sync expanded state with selection
  }, [isSelected]);

  if (isUnassigned) {
    return (
      <div className="group/item relative mb-1">
        <button
          onClick={() => onSelect(courierName)}
          className={clsx(
            'w-full text-left p-2.5 rounded-xl border-2 transition-all duration-300 transform',
            'relative overflow-hidden',
            isSelected
              ? (isDark
                ? 'bg-indigo-600/20 border-indigo-500 shadow-xl shadow-indigo-500/20'
                : 'bg-indigo-50/90 border-indigo-500 shadow-xl shadow-indigo-500/10')
              : (isDark
                ? 'bg-indigo-500/5 border-indigo-500/10 hover:border-indigo-500/40 hover:bg-indigo-500/10'
                : 'bg-indigo-50/20 border-indigo-100 hover:border-indigo-300 hover:bg-white')
          )}
        >
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className={clsx(
                'w-9 h-9 rounded-lg flex flex-shrink-0 items-center justify-center transition-all duration-300',
                isSelected
                  ? 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white rotate-3 shadow-lg'
                  : (isDark ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-100 text-indigo-600')
              )}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className={clsx(
                  'text-xs font-black tracking-tight uppercase',
                  isSelected
                    ? (isDark ? 'text-white' : 'text-indigo-900')
                    : (isDark ? 'text-indigo-300' : 'text-indigo-700')
                )}>
                  ОБЩИЙ ПУЛ ЗАКАЗОВ
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={clsx(
                    'text-[10px] font-black uppercase tracking-widest leading-none px-1.5 py-0.5 rounded-md',
                    isDark ? 'bg-indigo-900/40 text-indigo-400' : 'bg-indigo-100 text-indigo-600'
                  )}>
                    {totalOrdersCount} доступно
                  </span>
                </div>
              </div>
            </div>
          </div>
        </button>
      </div>
    )
  }

  return (
    <div className="group/item relative mb-1">
      <button
        onClick={() => onSelect(courierName)}
        className={clsx(
          'w-full text-left p-2.5 rounded-xl border-2 transition-all duration-300 transform',
          'relative overflow-hidden',
          isSelected
            ? (isDark
              ? 'bg-blue-600/10 border-blue-500 shadow-xl shadow-blue-500/20'
              : 'bg-white border-blue-500 shadow-xl shadow-blue-500/10')
            : (isDark
              ? 'bg-gray-800/40 border-white/5 hover:border-blue-500/40 hover:bg-gray-800/60'
              : 'bg-white border-gray-100 hover:border-blue-200 shadow-sm hover:shadow-md')
        )}
      >
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className={clsx(
              'w-9 h-9 rounded-lg flex flex-shrink-0 items-center justify-center transition-all duration-300 shadow-inner',
              isSelected
                ? 'bg-blue-600 text-white shadow-lg'
                : vehicleType === 'car'
                  ? (isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-600')
                  : (isDark ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-600')
            )}>
              <TruckIcon className="w-5 h-5" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col">
              <span className={clsx(
                'text-[11px] font-black tracking-tight uppercase truncate max-w-[120px]',
                isSelected
                  ? (isDark ? 'text-white' : 'text-gray-900')
                  : (isDark ? 'text-gray-100' : 'text-gray-800')
              )}>
                {courierName}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={clsx(
                  "text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1",
                  isFinished
                    ? (isDark ? "bg-green-500/20 text-green-400" : "bg-green-100 text-green-700")
                    : (isDark ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-600")
                )}>
                  {deliveredOrdersCount}/{totalOrdersCount}
                </span>
                {distanceKm > 0 && (
                  <span className="text-[9px] font-black text-blue-500/80">
                    {distanceKm.toFixed(1)} км
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <div className="w-12 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div 
                className={clsx(
                  "h-full transition-all duration-700 ease-out",
                  isFinished ? "bg-emerald-500" : "bg-blue-500"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
            {remainingTasks > 0 && (
              <span className="text-[8px] font-black uppercase text-orange-500/70">
                +{remainingTasks} ост.
              </span>
            )}
          </div>
        </div>
      </button>
    </div>
  )
})
