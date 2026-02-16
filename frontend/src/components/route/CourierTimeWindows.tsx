import clsx from 'clsx';
import { memo, useMemo } from 'react';
import { ClockIcon, RocketLaunchIcon, SparklesIcon } from '@heroicons/react/24/outline';
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
    onJumpToGroup,
}: CourierTimeWindowsProps) => {
    // Группируем заказы по временным окнам - Memoized
    const timeGroups = useMemo(() => {
        return groupOrdersByTimeWindow(orders, courierId, courierName);
    }, [orders, courierId, courierName]);

    const stats = useMemo(() => {
        if (!timeGroups || timeGroups.length === 0) return { readyGroups: 0, progress: 0 };
        const readyCount = timeGroups.filter(g => g.orders.every(o => o.status === 'Собран' || o.status === 'Исполнен')).length;
        return {
            readyGroups: readyCount,
            progress: (readyCount / timeGroups.length) * 100
        };
    }, [timeGroups]);

    if (!timeGroups || timeGroups.length === 0) {
        return (
            <div className={clsx(
                'text-center py-12 rounded-2xl border-2 border-dashed transition-all',
                isDark ? 'border-slate-800 bg-slate-900/40 text-slate-500' : 'border-slate-200 bg-slate-50 text-slate-400'
            )}>
                <SparklesIcon className="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-bold uppercase tracking-widest opacity-40">Нет заказов для группировки</p>
            </div>
        );
    }

    return (
        <div
            className="space-y-5"
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
            {/* SOTA Header - Futuristic Status Bar */}
            <div className={clsx(
                'relative flex flex-col lg:flex-row items-center justify-between gap-6 px-6 py-5 rounded-[2rem] border transition-all duration-700 shadow-2xl',
                isDark
                    ? 'bg-slate-900/60 border-white/5 shadow-black/40'
                    : 'bg-white/90 border-blue-50 shadow-blue-500/10'
            )}>
                {/* Visual Accent Layer */}
                <div className="absolute top-0 right-0 w-64 h-full bg-gradient-to-l from-blue-500/5 to-transparent pointer-events-none" />

                <div className="flex items-center gap-5 relative z-10 w-full lg:w-auto">
                    <div className={clsx(
                        'w-14 h-14 rounded-2xl flex items-center justify-center border transition-all duration-700 shadow-xl',
                        isDark ? 'bg-blue-600/20 text-blue-400 border-blue-500/20' : 'bg-blue-600 text-white border-blue-500'
                    )}>
                        <ClockIcon className="w-7 h-7" />
                    </div>
                    <div>
                        <div className="flex items-center gap-3">
                            <span className={clsx('text-[11px] font-black uppercase tracking-[0.3em] opacity-40', isDark ? 'text-blue-400' : 'text-slate-500')}>
                                ГРУППИРОВКА ПО ВРЕМЕНИ
                            </span>
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">SOTA v2.0</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                            <h2 className={clsx('text-2xl font-black tracking-tight', isDark ? 'text-white' : 'text-slate-900')}>
                                {timeGroups.length} {timeGroups.length === 1 ? 'Группа' : (timeGroups.length < 5 ? 'Группы' : 'Групп')}
                            </h2>
                            <div className="h-4 w-[1px] bg-slate-400/20" />
                            <div className="flex items-center gap-2">
                                <SparklesIcon className="w-4 h-4 text-amber-500 opacity-60" />
                                <span className="text-xs font-bold opacity-40 uppercase tracking-wider">
                                    {orders.length} {orders.length === 1 ? 'заказ' : 'заказов'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* SOTA Global Health & Action Hub */}
                <div className="flex items-center gap-6 w-full lg:w-auto">
                    <div className="hidden sm:flex flex-col gap-1.5 w-40">
                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest opacity-30">
                            <span>Готовность</span>
                            <span className="text-blue-500">{Math.round(stats.progress)}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden p-[1px]">
                            <div
                                className="h-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all duration-1000 shadow-[0_0_12px_rgba(59,130,246,0.5)] rounded-full"
                                style={{ width: `${stats.progress}%` }}
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-2.5 relative z-10">
                        <button
                            onClick={() => {
                                timeGroups.forEach(g => onCalculateRoute && onCalculateRoute(g));
                            }}
                            className={clsx(
                                'group px-6 py-3 rounded-xl flex items-center gap-2.5 text-[10px] font-black uppercase tracking-[0.15em] transition-all active:scale-95 shadow-lg border',
                                isDark
                                    ? 'bg-blue-600 border-blue-500 text-white hover:bg-blue-500 hover:shadow-blue-500/20'
                                    : 'bg-slate-900 border-slate-800 text-white hover:bg-slate-800'
                            )}
                        >
                            <RocketLaunchIcon className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                            <span>Маршрут все заказы</span>
                        </button>
                    </div>
                </div>

            </div>

            {/* Time Window Groups - Responsive Futuristic Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in duration-700">
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
})

export default CourierTimeWindows;
