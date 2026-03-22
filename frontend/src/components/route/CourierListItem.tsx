import { memo, useState, useEffect } from 'react';
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
  isDark: boolean;
}

export const CourierListItem = memo(({
  courierName,
  vehicleType,
  isSelected,
  onSelect,
  deliveredOrdersCount,
  totalOrdersCount,
  calculatedCount = 0,
  isDark
}: CourierListItemProps) => {

  const isUnassigned = courierName === 'Не назначено' || isId0CourierName(courierName)
  const progress = totalOrdersCount > 0 ? (deliveredOrdersCount / totalOrdersCount) * 100 : 0
  const isFinished = totalOrdersCount > 0 && deliveredOrdersCount === totalOrdersCount
  const remainingTasks = totalOrdersCount - deliveredOrdersCount

  const [isExpanded, setIsExpanded] = useState(isSelected);

  useEffect(() => {
    setIsExpanded(isSelected);
  }, [isSelected]);



  if (isUnassigned) {
    return (
      <div className="group/item relative">
        <button
          onClick={() => onSelect(courierName)}
          className={clsx(
            'w-full text-left p-4 rounded-2xl border-2 transition-all duration-300 transform',
            'relative overflow-hidden',
            isSelected
              ? (isDark
                ? 'bg-gradient-to-br from-indigo-600/20 to-blue-600/20 border-indigo-500 shadow-xl shadow-indigo-500/20'
                : 'bg-gradient-to-br from-indigo-50/90 to-blue-50/90 border-indigo-500 shadow-xl shadow-indigo-500/10')
              : (isDark
                ? 'bg-indigo-500/5 border-indigo-500/10 hover:border-indigo-500/40 hover:bg-indigo-500/10'
                : 'bg-indigo-50/20 border-indigo-100 hover:border-indigo-300 hover:bg-white')
          )}
        >
          {/* Decorative background shape */}
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl group-hover/item:bg-indigo-500/20 transition-all" />

          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-4">
              <div className={clsx(
                'w-12 h-12 rounded-xl flex flex-shrink-0 items-center justify-center transition-all duration-300',
                isSelected
                  ? 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-lg shadow-indigo-500/30 rotate-3'
                  : (isDark ? 'bg-indigo-500/20 text-indigo-400 group-hover/item:rotate-6' : 'bg-indigo-100 text-indigo-600 group-hover/item:rotate-6')
              )}>
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className={clsx(
                  'text-base font-black tracking-tight uppercase',
                  isSelected
                    ? (isDark ? 'text-white' : 'text-indigo-900')
                    : (isDark ? 'text-indigo-300' : 'text-indigo-700')
                )}>
                  Не назначенные заказы
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={clsx(
                    'text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md',
                    isDark ? 'bg-indigo-900/40 text-indigo-400/80' : 'bg-indigo-100 text-indigo-600/80'
                  )}>
                    {totalOrdersCount} доступно
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
            </div>
          </div>
        </button>
      </div>
    )
  }

  return (
    <div className="group/item relative">
      <div
        onClick={() => {
          onSelect(courierName);
          if (isSelected) {
            setIsExpanded(!isExpanded);
          }
        }}
        className={clsx(
          'cursor-pointer w-full text-left p-4 rounded-2xl border-2 transition-all duration-300 transform',
          'relative overflow-hidden group/card',
          isSelected
            ? (isDark
              ? 'bg-blue-600/10 border-blue-500 shadow-2xl shadow-blue-500/20'
              : 'bg-white border-blue-500 shadow-2xl shadow-blue-500/10')
            : (isDark
              ? 'bg-gray-900/40 border-white/5 hover:border-blue-500/40 hover:bg-gray-800/60'
              : 'bg-white border-gray-100 shadow-sm hover:border-blue-300 hover:shadow-md')
        )}
      >
        {/* Progress Background Accent */}
        <div
          className={clsx(
            "absolute inset-0 pointer-events-none transition-all duration-1000 origin-left opacity-[0.03]",
            isFinished ? "bg-green-500" : "bg-blue-500"
          )}
          style={{ transform: `scaleX(${progress / 100})` }}
        />

        <div className="flex flex-col gap-3 relative z-10">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={clsx(
                'w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 shrink-0 shadow-inner',
                isSelected
                  ? 'bg-blue-600 text-white shadow-lg'
                  : vehicleType === 'car'
                    ? (isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-600')
                    : (isDark ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-600')
              )}>
                <TruckIcon className={clsx("w-6 h-6", isSelected && "animate-pulse")} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className={clsx(
                    'text-md font-black truncate leading-tight tracking-tight',
                    isSelected
                      ? (isDark ? 'text-white' : 'text-blue-900')
                      : (isDark ? 'text-gray-100' : 'text-gray-800')
                  )}>
                    {courierName}
                  </h4>
                  {vehicleType !== 'car' && (
                    <span className={clsx(
                      'px-1.5 py-0.5 text-[8px] rounded-md font-black uppercase tracking-wider',
                      isDark ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-600'
                    )}>МОТО</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={clsx(
                    "text-[10px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1.5",
                    isFinished
                      ? (isDark ? "bg-green-500/20 text-green-400" : "bg-green-100 text-green-700")
                      : (isDark ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-600")
                  )}>
                    <span className={clsx("w-1.5 h-1.5 rounded-full", isFinished ? "bg-green-500" : "bg-blue-500 animate-pulse")} />
                    {isFinished ? 'Завершено' : remainingTasks > 0 ? 'Доставляет' : 'На маршруте'}
                  </span>
                </div>

                {!isExpanded && (
                  <div className="mt-2.5 w-full h-1 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={clsx(
                        'h-full rounded-full transition-all duration-700 ease-out',
                        isFinished ? 'bg-green-500' : 'bg-gradient-to-r from-blue-600 to-blue-400'
                      )}
                      style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {isExpanded && (
            <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className={clsx(
                'grid grid-cols-3 gap-2 p-2.5 rounded-xl border border-dashed transition-colors',
                isDark ? 'bg-black/20 border-white/5' : 'bg-gray-50/50 border-gray-200'
              )}>
                <div className="flex flex-col items-center justify-center">
                  <span className={clsx("text-[9px] font-bold uppercase tracking-widest opacity-50", isDark ? "text-gray-400" : "text-gray-500")}>ВСЕГО</span>
                  <span className={clsx("text-sm font-black mt-0.5", isDark ? "text-white" : "text-gray-900")}>{totalOrdersCount}</span>
                </div>
                <div className="flex flex-col items-center justify-center border-x border-dashed border-gray-300 dark:border-white/10">
                  <span className={clsx("text-[9px] font-bold uppercase tracking-widest opacity-50", isDark ? "text-gray-400" : "text-gray-500")}>В ПУТИ</span>
                  <span className={clsx("text-sm font-black mt-0.5", isDark ? "text-blue-400" : "text-blue-600")}>{calculatedCount}</span>
                </div>
                <div className="flex flex-col items-center justify-center">
                  <span className={clsx("text-[9px] font-bold uppercase tracking-widest opacity-50", isDark ? "text-gray-400" : "text-gray-500")}>ОСТАЛОСЬ</span>
                  <span className={clsx("text-sm font-black mt-0.5", remainingTasks > 0 ? (isDark ? "text-orange-400" : "text-orange-600") : (isDark ? "text-gray-500" : "text-gray-400"))}>
                    {remainingTasks}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 px-0.5">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-tighter">
                  <span className={isDark ? "text-gray-500" : "text-gray-400"}>Прогресс доставки</span>
                  <span className={isDark ? "text-gray-300" : "text-gray-700"}>{Math.round(progress)}%</span>
                </div>
                <div className={clsx(
                  'w-full h-1.5 rounded-full overflow-hidden p-[1px] shadow-inner',
                  isDark ? 'bg-white/5' : 'bg-gray-100'
                )}>
                  <div
                    className={clsx(
                      'h-full rounded-full transition-all duration-700 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]',
                      isFinished ? 'bg-green-500' : 'bg-gradient-to-r from-blue-600 to-blue-400'
                    )}
                    style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                  />
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
})
