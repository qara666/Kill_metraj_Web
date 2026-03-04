import { memo } from 'react'
import { TruckIcon } from '@heroicons/react/24/outline'
import { clsx } from 'clsx'
import { isId0CourierName } from '../../utils/data/courierName'

interface CourierListItemProps {
    courierName: string
    vehicleType: string
    isSelected: boolean
    onSelect: (name: string) => void
    availableOrdersCount: number
    deliveredOrdersCount: number
    totalOrdersCount: number
    isDark: boolean
}

export const CourierListItem = memo(({
    courierName,
    vehicleType,
    isSelected,
    onSelect,
    availableOrdersCount,
    deliveredOrdersCount,
    totalOrdersCount,
    isDark
}: CourierListItemProps) => {
    const isUnassigned = courierName === 'Не назначено' || isId0CourierName(courierName)
    const progress = totalOrdersCount > 0 ? (deliveredOrdersCount / totalOrdersCount) * 100 : 0
    const isFinished = totalOrdersCount > 0 && deliveredOrdersCount === totalOrdersCount
    const remaining = totalOrdersCount - deliveredOrdersCount
    const isReturning = totalOrdersCount > 0 && deliveredOrdersCount > 0 && remaining > 0 && remaining <= 2
    const isOnRoute = totalOrdersCount > 0 && (deliveredOrdersCount === 0 || remaining > 2) && deliveredOrdersCount < totalOrdersCount

    if (isUnassigned) {
        return (
            <div className="group/item relative mb-2">
                <button
                    onClick={() => onSelect(courierName)}
                    className={clsx(
                        'w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 transform',
                        'relative overflow-hidden',
                        isSelected
                            ? (isDark
                                ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-500/10'
                                : 'bg-blue-50/80 border-blue-500 shadow-md shadow-blue-500/5')
                            : (isDark
                                ? 'bg-blue-500/5 border-blue-500/20 hover:border-blue-500/40'
                                : 'bg-blue-50/30 border-blue-100 hover:border-blue-300')
                    )}
                >
                    <div className="flex items-center gap-4 relative z-10">
                        <div className={clsx(
                            'w-12 h-12 rounded-xl flex flex-shrink-0 items-center justify-center transition-colors',
                            isSelected
                                ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
                                : (isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600')
                        )}>
                            <TruckIcon className="w-6 h-6" />
                        </div>
                        <div className="flex flex-col">
                            <span className={clsx(
                                'text-base font-black',
                                isSelected
                                    ? (isDark ? 'text-white' : 'text-blue-900')
                                    : (isDark ? 'text-blue-300' : 'text-blue-700')
                            )}>
                                Не назначено
                            </span>
                            <span className={clsx(
                                'text-[11px] font-bold mt-0.5',
                                isDark ? 'text-blue-400/60' : 'text-blue-600/60'
                            )}>
                                {totalOrdersCount} заказов
                            </span>
                        </div>
                    </div>
                </button>
            </div>
        )
    }

    return (
        <div className="group/item relative">
            <button
                onClick={() => onSelect(courierName)}
                className={clsx(
                    'w-full text-left p-3 rounded-xl border-2 transition-all duration-200 transform mb-2',
                    'relative overflow-hidden',
                    isSelected
                        ? (isDark
                            ? 'bg-blue-600/10 border-blue-500 shadow-lg shadow-blue-500/10'
                            : 'bg-[#f0f7ff] border-blue-500 shadow-md shadow-blue-500/5')
                        : isReturning
                            ? (isDark
                                ? 'bg-purple-500/10 border-purple-500/30 shadow-lg shadow-purple-500/5'
                                : 'bg-purple-50 border-purple-200 shadow-md shadow-purple-500/5')
                            : isUnassigned
                                ? (isDark
                                    ? 'bg-amber-500/10 border-amber-500/30'
                                    : 'bg-amber-50 border-amber-200')
                                : (isDark
                                    ? 'bg-black/20 border-white/[0.03] hover:border-white/10 opacity-70 hover:opacity-100'
                                    : 'bg-white border-gray-100/80 hover:border-blue-200 shadow-sm opacity-60 hover:opacity-100')
                )}
            >
                <div className="flex items-center gap-3.5 relative z-10">
                    <div className="relative shrink-0">
                        <div className={clsx(
                            'w-10 h-10 rounded-xl flex items-center justify-center transition-colors',
                            isSelected
                                ? 'bg-blue-600 text-white'
                                : isUnassigned
                                    ? (isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-600')
                                    : vehicleType === 'car'
                                        ? (isDark ? 'bg-green-600/20 text-green-400' : 'bg-green-100 text-green-600')
                                        : (isDark ? 'bg-orange-600/20 text-orange-400' : 'bg-orange-100 text-orange-600')
                        )}>
                            <TruckIcon className="w-5 h-5" />
                        </div>
                        {(isOnRoute || isReturning || isFinished) && (
                            <div className={clsx(
                                'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2',
                                isDark ? 'border-gray-800' : 'border-white',
                                isFinished ? 'bg-green-500' : isReturning ? 'bg-purple-500' : 'bg-blue-500'
                            )} />
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <h4 className={clsx(
                                        'text-sm font-black truncate leading-tight',
                                        isSelected
                                            ? (isDark ? 'text-blue-100' : 'text-blue-700')
                                            : isUnassigned
                                                ? (isDark ? 'text-amber-200' : 'text-amber-700')
                                                : (isDark ? 'text-gray-200' : 'text-gray-800')
                                    )}>
                                        {courierName}
                                    </h4>
                                    {vehicleType !== 'car' && !isUnassigned && (
                                        <span className={clsx(
                                            'px-1.5 py-0.5 text-[7px] rounded-md font-black uppercase tracking-widest',
                                            isDark ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-600'
                                        )}>МОТО</span>
                                    )}
                                </div>

                                <div className={clsx(
                                    'text-[10px] font-bold mt-0.5 flex items-center gap-2',
                                    isDark ? 'text-gray-400' : 'text-gray-500'
                                )}>
                                    <span className={clsx(totalOrdersCount > 0 ? (isDark ? 'text-blue-400/80' : 'text-blue-600/80') : '')}>
                                        {totalOrdersCount > 0
                                            ? `${deliveredOrdersCount}/${totalOrdersCount} доставлено`
                                            : `${availableOrdersCount} заказов`}
                                    </span>
                                </div>
                            </div>

                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                                <div className="text-right">
                                    <div className={clsx(
                                        'text-[11px] font-black leading-none',
                                        isSelected
                                            ? (isDark ? 'text-blue-200' : 'text-blue-700')
                                            : (isDark ? 'text-gray-200' : 'text-gray-700')
                                    )}>
                                        {Math.round(progress)}%
                                    </div>
                                    <div className={clsx(
                                        'text-[8px] font-bold uppercase tracking-tighter opacity-50 mt-0.5',
                                        isDark ? 'text-gray-400' : 'text-gray-500'
                                    )}>
                                        {isFinished ? 'Готов' : isOnRoute ? 'В пути' : 'Свободен'}
                                    </div>
                                </div>

                                <div className={clsx(
                                    'w-12 h-1 rounded-full overflow-hidden p-[1px]',
                                    isDark ? 'bg-white/5' : 'bg-gray-100'
                                )}>
                                    <div
                                        className={clsx(
                                            'h-full rounded-full transition-all duration-300',
                                            isFinished ? 'bg-green-500' : isOnRoute ? 'bg-blue-500' : 'bg-gray-300/50'
                                        )}
                                        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </button>

            {/* Background glow */}
            {isSelected && (
                <div className={clsx(
                    'absolute inset-0 opacity-10 pointer-events-none transition-opacity duration-300',
                    isDark ? 'bg-gradient-to-br from-blue-500 to-transparent' : 'bg-gradient-to-br from-blue-100 to-transparent'
                )} />
            )}
        </div>
    )
})
