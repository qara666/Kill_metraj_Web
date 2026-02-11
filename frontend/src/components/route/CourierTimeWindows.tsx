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
    onCreateCustomGroup?: (orderId: string) => void;
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
    onCreateCustomGroup,
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
        <div
            className="space-y-4"
            onDragOver={(e) => {
                if (onCreateCustomGroup) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                }
            }}
            onDrop={(e) => {
                if (onCreateCustomGroup) {
                    const orderId = e.dataTransfer.getData('orderId');
                    if (orderId) {
                        onCreateCustomGroup(orderId);
                    }
                }
            }}
        >
            {/* Enhanced Header - More Subtle and Premium */}
            <div className={clsx(
                'flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all duration-300',
                isDark
                    ? 'bg-gray-800/30 border-white/5 hover:bg-gray-800/50'
                    : 'bg-white/40 border-gray-200/50 hover:bg-white/60 shadow-sm'
            )} style={{ backdropFilter: 'blur(10px)' }}>
                <div className={clsx(
                    'p-2 rounded-xl transition-colors duration-300',
                    isDark ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'
                )}>
                    <ClockIcon className="w-5 h-5" />
                </div>
                <div>
                    <h3 className={clsx('text-[11px] font-black uppercase tracking-[0.2em] opacity-80', isDark ? 'text-gray-300' : 'text-gray-500')}>
                        Группировка по времени
                    </h3>
                    <p className={clsx('text-xs font-bold mt-0.5', isDark ? 'text-white' : 'text-gray-900')}>
                        {timeGroups.length} {timeGroups.length === 1 ? 'активная группа' : timeGroups.length < 5 ? 'активные группы' : 'активных групп'}
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
