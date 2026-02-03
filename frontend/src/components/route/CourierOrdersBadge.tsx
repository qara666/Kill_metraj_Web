import clsx from 'clsx';
import { BoltIcon, ClockIcon } from '@heroicons/react/24/outline';
import type { CourierRouteStatus, RouteCalculationMode } from '../../types';
import {
    calculateProgressToAutoTrigger,
    getCalculationStatusMessage,
} from '../../utils/route/routeCalculationHelpers';

interface CourierOrdersBadgeProps {
    status: CourierRouteStatus;
    calculationMode: RouteCalculationMode;
    isCalculating?: boolean;
    isDark?: boolean;
    onManualCalculate?: () => void;
}

export function CourierOrdersBadge({
    status,
    calculationMode,
    isCalculating = false,
    isDark = false,
    onManualCalculate,
}: CourierOrdersBadgeProps) {
    const isAutoMode = calculationMode.mode === 'automatic';
    const progress = calculateProgressToAutoTrigger(
        status.ordersCount,
        calculationMode.autoTriggerThreshold
    );
    const statusMessage = getCalculationStatusMessage(status, calculationMode);

    const shouldShowAutoIndicator =
        isAutoMode && status.ordersCount >= calculationMode.autoTriggerThreshold;

    return (
        <div
            className={clsx(
                'rounded-lg border p-3 space-y-2',
                isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
            )}
        >
            {/* Orders Count */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                    <span className={clsx('text-sm font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>
                        Заказы:
                    </span>
                    <span
                        className={clsx(
                            'text-lg font-bold',
                            status.ordersCount > 0
                                ? isDark
                                    ? 'text-blue-400'
                                    : 'text-blue-600'
                                : isDark
                                    ? 'text-gray-500'
                                    : 'text-gray-400'
                        )}
                    >
                        {status.ordersCount}
                        {isAutoMode && (
                            <span className="text-sm font-normal text-gray-500">
                                /{calculationMode.autoTriggerThreshold}
                            </span>
                        )}
                    </span>
                </div>

                {/* Mode Indicator */}
                {isAutoMode && (
                    <div
                        className={clsx(
                            'flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium',
                            shouldShowAutoIndicator
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                        )}
                    >
                        <BoltIcon className="h-3 w-3" />
                        <span>Авто</span>
                    </div>
                )}
            </div>

            {/* Progress Bar (Auto Mode) */}
            {isAutoMode && status.ordersCount > 0 && (
                <div className="space-y-1">
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                        <div
                            className={clsx(
                                'h-full rounded-full transition-all duration-300',
                                progress >= 100
                                    ? 'bg-green-500'
                                    : progress >= 66
                                        ? 'bg-blue-500'
                                        : progress >= 33
                                            ? 'bg-yellow-500'
                                            : 'bg-gray-400'
                            )}
                            style={{ width: `${Math.min(progress, 100)}%` }}
                        />
                    </div>
                    <div className="flex items-center space-x-1">
                        {shouldShowAutoIndicator ? (
                            <>
                                <BoltIcon className="h-3 w-3 text-green-600 dark:text-green-400" />
                                <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                                    Готово к автоматическому расчету
                                </span>
                            </>
                        ) : (
                            <span className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>
                                {statusMessage}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Calculating Indicator */}
            {isCalculating && (
                <div className="flex items-center space-x-2 text-sm">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
                    <span className={clsx('font-medium', isDark ? 'text-blue-400' : 'text-blue-600')}>
                        Расчет маршрута...
                    </span>
                </div>
            )}

            {/* Last Calculated */}
            {status.lastCalculated && !isCalculating && (
                <div className="flex items-center space-x-1 text-xs text-gray-500">
                    <ClockIcon className="h-3 w-3" />
                    <span>Последний расчет: {formatLastCalculated(status.lastCalculated)}</span>
                </div>
            )}

            {/* Manual Calculate Button (Manual Mode or as backup) */}
            {!isCalculating && status.ordersCount > 0 && onManualCalculate && (
                <button
                    onClick={onManualCalculate}
                    className={clsx(
                        'w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                        isAutoMode
                            ? isDark
                                ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                            : isDark
                                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                    )}
                >
                    {isAutoMode ? 'Рассчитать вручную' : 'Создать маршрут'}
                </button>
            )}

            {/* Needs Recalculation Indicator */}
            {status.hasActiveRoute && status.needsRecalculation && !isCalculating && (
                <div
                    className={clsx(
                        'text-xs px-2 py-1 rounded',
                        isDark
                            ? 'bg-yellow-900/30 text-yellow-300 border border-yellow-700'
                            : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                    )}
                >
                    ️ Требуется пересчет маршрута
                </div>
            )}
        </div>
    );
}

function formatLastCalculated(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days} дн. назад`;
    }
    if (hours > 0) {
        return `${hours} ч. назад`;
    }
    if (minutes > 0) {
        return `${minutes} мин. назад`;
    }
    return 'только что';
}
