import clsx from 'clsx';
import { ClockIcon } from '@heroicons/react/24/outline';
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
    // Группируем заказы по временным окнам
    const timeGroups = groupOrdersByTimeWindow(orders, courierId, courierName);

    if (!timeGroups || timeGroups.length === 0) {
        return (
            <div className={clsx(
                'text-center py-8 rounded-lg border-2 border-dashed',
                isDark ? 'border-gray-700 text-gray-500' : 'border-gray-200 text-gray-400'
            )}>
                <p className="text-sm font-medium">Нет заказов для группировки</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Enhanced Header */}
            <div className={clsx(
                'flex items-center gap-3 px-4 py-3 rounded-lg border',
                isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100'
            )}>
                <div className={clsx(
                    'p-2 rounded-lg',
                    isDark ? 'bg-blue-500/20' : 'bg-white shadow-sm'
                )}>
                    <ClockIcon className={clsx('w-5 h-5', isDark ? 'text-blue-400' : 'text-blue-600')} />
                </div>
                <div>
                    <h3 className={clsx('text-sm font-bold tracking-tight', isDark ? 'text-gray-200' : 'text-gray-800')}>
                        СГРУППИРОВАНО ПО ВРЕМЕНИ
                    </h3>
                    <p className={clsx('text-xs font-medium', isDark ? 'text-gray-400' : 'text-gray-500')}>
                        {timeGroups.length} {timeGroups.length === 1 ? 'группа' : timeGroups.length < 5 ? 'группы' : 'групп'}
                    </p>
                </div>
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
