import clsx from 'clsx';
import { memo, useMemo } from 'react';
import { SparklesIcon } from '@heroicons/react/24/outline';
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
    onCalculateAllRoutes?: () => void;
}

export const CourierTimeWindows = memo(({
    courierId,
    courierName,
    orders,
    isDark = false,
    isCalculating = false,
    calculatingGroupId = null,
    onOrderMoved,
    onCreateCustomGroup,
    onCalculateRoute,
    onCalculateAllRoutes,
}: CourierTimeWindowsProps) => {
    const timeGroups = useMemo(() => {
        return groupOrdersByTimeWindow(orders, courierId, courierName);
    }, [orders, courierId, courierName]);

    if (!timeGroups || timeGroups.length === 0) {
        return (
            <div className={clsx(
                'text-center py-6 rounded-2xl border-2 border-dashed transition-all',
                isDark ? 'border-slate-800 bg-slate-900/40 text-slate-500' : 'border-slate-200 bg-slate-50 text-slate-400'
            )}>
                <SparklesIcon className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Нет доступных временных окон</p>
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
            <div className="flex items-center justify-between mb-2 px-2">
                <div className="flex items-center gap-2">
                    <span className={clsx("text-xs font-black uppercase tracking-widest", isDark ? "text-slate-400" : "text-slate-500")}>
                        {timeGroups.length} маршрута
                    </span>
                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                    <span className={clsx("text-xs font-black opacity-40", isDark ? "text-slate-500" : "text-slate-400")}>
                        {orders.length} заказов
                    </span>
                </div>

                {onCalculateAllRoutes && (
                    <button
                        onClick={onCalculateAllRoutes}
                        disabled={isCalculating}
                        className={clsx(
                            "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                            isDark
                                ? "bg-blue-600/20 text-blue-400 hover:bg-blue-600/30"
                                : "bg-blue-50 text-blue-600 hover:bg-blue-100 shadow-sm"
                        )}
                    >
                        В маршрут все
                    </button>
                )}
            </div>

            {/* Strict Grid for performance */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {timeGroups.map((group) => (
                    <TimeWindowGroupCard
                        key={group.id}
                        group={group}
                        isDark={isDark}
                        isCalculating={isCalculating && calculatingGroupId === group.id}
                        onOrderMoved={onOrderMoved}
                        onCalculateRoute={onCalculateRoute}
                    />
                ))}
            </div>
        </div>
    );
});

export default CourierTimeWindows;
