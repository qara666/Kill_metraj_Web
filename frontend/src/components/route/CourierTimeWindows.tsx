import clsx from 'clsx';
import { ClockIcon, MapIcon } from '@heroicons/react/24/outline';
import type { Order } from '../../types';
import { TimeWindowGroupCard } from './TimeWindowGroupCard';
import { groupOrdersByTimeWindow, type TimeWindowGroup } from '../../utils/route/routeCalculationHelpers';

interface CourierTimeWindowsProps {
    courierId: string;
    courierName: string;
    orders: Order[];
    isDark?: boolean;
    isCalculating?: boolean;
    calculatingGroupId?: string | null;
    onOrderMoved?: (orderId: string, targetGroup: TimeWindowGroup) => void;
    onCalculateRoute?: (group: TimeWindowGroup) => void;
    onJumpToGroup?: (group: TimeWindowGroup) => void;
}

export function CourierTimeWindows({
    courierId,
    courierName,
    orders,
    isDark = false,
    isCalculating = false,
    calculatingGroupId = null,
    onOrderMoved,
    onCalculateRoute,
    onJumpToGroup,
}: CourierTimeWindowsProps) {
    // Группируем заказы по 15-минутным окнам
    const timeGroups = groupOrdersByTimeWindow(orders, courierId, courierName);

    if (timeGroups.length === 0) {
        return (
            <div
                className={clsx(
                    'flex flex-col items-center justify-center p-6 rounded-lg border',
                    isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
                )}
            >
                <MapIcon className={clsx('h-8 w-8 mb-2', isDark ? 'text-gray-600' : 'text-gray-400')} />
                <p className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-500')}>
                    Нет заказов для группировки
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            {/* Header / Info Line - Made more subtle */}
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center space-x-2 opacity-50">
                    <ClockIcon className={clsx('h-4 w-4', isDark ? 'text-blue-400' : 'text-blue-600')} />
                    <span className={clsx('text-[10px] font-bold uppercase tracking-wider', isDark ? 'text-gray-400' : 'text-gray-500')}>
                        Временные интервалы
                    </span>
                </div>
                <span className={clsx('text-[10px] font-bold uppercase tracking-wider opacity-50', isDark ? 'text-gray-400' : 'text-gray-500')}>
                    {timeGroups.length} групп{getGroupsEnding(timeGroups.length)}
                </span>
            </div>

            {/* Time Window Groups - Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {timeGroups.map((group) => (
                    <TimeWindowGroupCard
                        key={group.id}
                        group={group}
                        isDark={isDark}
                        isCalculating={isCalculating && calculatingGroupId === group.id}
                        onOrderMoved={onOrderMoved}
                        onCalculateRoute={onCalculateRoute}
                        onJumpToGroup={onJumpToGroup}
                    />
                ))}
            </div>
        </div>
    );
}


function getGroupsEnding(count: number): string {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return '';
    if (lastDigit === 1) return 'а';
    if (lastDigit >= 2 && lastDigit <= 4) return 'ы';
    return '';
}
