import clsx from 'clsx';
import { memo, useMemo } from 'react';
import { SparklesIcon } from '@heroicons/react/24/outline';
import type { Order } from '../../types';
import { TimeWindowGroupCard } from './TimeWindowGroupCard';
import { groupOrdersByTimeWindow, type TimeWindowGroup } from '../../utils/route/routeCalculationHelpers';
import { getStableOrderId } from '../../utils/data/orderId';

interface CourierTimeWindowsProps {
    courierId: string;
    courierName: string;
    orders: Order[];
    isDark?: boolean;
    isCalculating?: boolean;
    calculatingGroupId?: string | null;
    ordersInRoutesSet?: Set<string>;
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
    ordersInRoutesSet = new Set(),
}: CourierTimeWindowsProps) => {
    // v5.139: Deduplicate orders BEFORE any processing
    // This fixes duplicates that may come from multiple sources (routes supplement, etc.)
    const uniqueOrders = useMemo(() => {
        const seenIds = new Set<string>();
        const unique: Order[] = [];
        for (const order of orders) {
            const sid = getStableOrderId(order);
            if (!sid) {
                unique.push(order);
            } else if (!seenIds.has(sid)) {
                seenIds.add(sid);
                unique.push(order);
            }
        }
        
        if (unique.length < orders.length) {
            console.warn(`[CourierTimeWindows] ⚠️ Removed ${orders.length - unique.length} duplicate orders for courier ${courierName}`);
        }
        
        return unique;
    }, [orders, courierName]);

    const timeGroups = useMemo(() => {
        return groupOrdersByTimeWindow(uniqueOrders, courierId, courierName);
    }, [uniqueOrders, courierId, courierName]);

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
                <div className="flex items-center gap-3">
                    <div className={clsx(
                        "px-3 py-1 rounded-lg flex items-center gap-2 text-[10px] font-black uppercase tracking-widest shadow-sm",
                        isDark ? "bg-slate-800 text-slate-400" : "bg-white text-slate-500 border border-slate-100"
                    )}>
                        <span className={isDark ? "text-blue-400" : "text-blue-600"}>{timeGroups.length}</span>
                        <span>Маршрута</span>
                    </div>

                    <div className={clsx(
                        "px-3 py-1 rounded-lg flex items-center gap-2 text-[10px] font-black uppercase tracking-widest shadow-sm",
                        isDark ? "bg-slate-800 text-slate-400" : "bg-white text-slate-500 border border-slate-100"
                    )}>
                        <span className={isDark ? "text-emerald-400" : "text-emerald-600"}>{uniqueOrders.length}</span>
                        <span>Заказов</span>
                    </div>
                </div>

                {onCalculateAllRoutes && (
                    <button
                        onClick={onCalculateAllRoutes}
                        disabled={isCalculating}
                        className={clsx(
                            "px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-lg active:scale-95",
                            isDark
                                ? "bg-blue-600 text-white hover:bg-blue-500 shadow-blue-500/20"
                                : "bg-slate-900 text-white hover:bg-black shadow-slate-900/20"
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
                        ordersInRoutesSet={ordersInRoutesSet}
                        onOrderMoved={onOrderMoved}
                        onCalculateRoute={onCalculateRoute}
                    />
                ))}
            </div>
        </div>
    );
});

export default CourierTimeWindows;
