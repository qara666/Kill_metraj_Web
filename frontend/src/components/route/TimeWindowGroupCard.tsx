import clsx from 'clsx';
import { ClockIcon, ChevronDownIcon, CheckBadgeIcon, ArrowPathIcon, RocketLaunchIcon } from '@heroicons/react/24/outline';
import { memo, useState, useMemo } from 'react';
import { formatTimeLabel, type TimeWindowGroup } from '../../utils/route/routeCalculationHelpers';
import { getPlannedTime } from '../../utils/data/timeUtils';

interface TimeWindowGroupCardProps {
    group: TimeWindowGroup;
    isDark?: boolean;
    isCalculating?: boolean;
    onOrderMoved?: (orderId: string, targetGroup: TimeWindowGroup) => void;
    onCalculateRoute?: (group: TimeWindowGroup) => void;
}

export const TimeWindowGroupCard = memo(({
    group,
    isDark = false,
    isCalculating = false,
    onOrderMoved,
    onCalculateRoute
}: TimeWindowGroupCardProps) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);

    // Calculate readiness status
    const assembledOrders = group.orders.filter(o => o.status === 'Собран' || o.status === 'Исполнен');

    const getReadinessStatus = () => {
        if (assembledOrders.length === group.orders.length) return 'ready';
        if (assembledOrders.length > 0) return 'partial';
        return 'preparing';
    };

    const readinessStatus = getReadinessStatus();

    const theme = useMemo(() => {
        const isReady = readinessStatus === 'ready';
        if (isReady) return {
            border: isDark ? 'border-emerald-500/40' : 'border-emerald-500',
            bg: isDark ? 'bg-slate-900' : 'bg-white',
            badgeBg: isDark ? 'bg-emerald-500/20' : 'bg-emerald-50',
            badgeText: 'text-emerald-500',
            headerBg: 'bg-transparent'
        };

        return {
            border: isDark ? 'border-amber-500/40' : 'border-amber-500',
            bg: isDark ? 'bg-slate-900' : 'bg-white',
            badgeBg: isDark ? 'bg-amber-500/20' : 'bg-amber-50',
            badgeText: 'text-amber-500',
            headerBg: 'bg-transparent'
        };

    }, [readinessStatus, isDark]);

    return (
        <div
            onDragOver={(e) => {
                if (onOrderMoved) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setIsDragOver(true);
                }
            }}
            onDragEnter={(e) => {
                if (onOrderMoved) {
                    e.preventDefault();
                    setIsDragOver(true);
                }
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
                if (onOrderMoved) {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOver(false);

                    const orderId = e.dataTransfer.getData('orderId') || e.dataTransfer.getData('text/plain');
                    if (orderId && onOrderMoved) {
                        onOrderMoved(orderId, group);
                    }
                }
            }}
            className={clsx(
                'rounded-3xl border-2 transition-all duration-200 relative overflow-hidden flex flex-col',
                theme.border,
                theme.bg,
                isDragOver && (isDark ? 'ring-2 ring-blue-500 bg-blue-900/30' : 'ring-2 ring-blue-400 bg-blue-50/80')
            )}
        >
            {/* Header - Simple Flex Row */}
            <div
                className={clsx(
                    'relative p-4 pb-2 cursor-pointer transition-colors',
                    isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'
                )}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center justify-between mb-3">
                    <div className={clsx(
                        'px-4 py-1.5 rounded-full flex items-center gap-2 text-xs font-black tracking-widest',
                        isDark ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
                    )}>
                        <ClockIcon className="w-4 h-4" />
                        <span>{group.windowLabel}</span>
                    </div>

                    <div className={clsx(
                        'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                        isDark ? 'bg-slate-800' : 'bg-slate-100'
                    )}>
                        <ChevronDownIcon className={clsx('w-4 h-4 text-slate-400 transition-transform duration-200', isExpanded ? 'rotate-180' : 'rotate-0')} />
                    </div>
                </div>

                {/* Sub-header text row */}
                <div className="flex items-center justify-between">
                    <div className={clsx(
                        'px-2 py-0.5 rounded-md text-[12px] font-black uppercase tracking-widest flex items-center gap-1.5',
                        theme.badgeBg, theme.badgeText
                    )}>
                        <CheckBadgeIcon className="w-4 h-4" />
                        <span className="tabular-nums">{assembledOrders.length}</span>
                    </div>

                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {group.orders.length} {getOrdersEnding(group.orders.length)}
                    </div>
                </div>
            </div>

            {/* Separator Line */}
            <div className={clsx("h-[2px] w-full mt-2", theme.bg)} />
            <div className={clsx("h-[2px] w-full", isDark ? "bg-slate-800" : "bg-slate-100")} />

            {/* Expanded Content Area with flex-1 to push button to bottom if needed */}
            <div className={clsx(
                'flex flex-col transition-all overflow-hidden',
                isExpanded ? 'max-h-[800px] opacity-100 flex-1' : 'max-h-0 opacity-0 border-t-0'
            )}>
                <div className="p-2 flex-1 overflow-y-auto max-h-[300px] custom-scrollbar space-y-1">
                    {group.orders.map((order: any, idx: number) => {
                        const orderStatus = order.status || 'Новый';
                        const isReady = orderStatus === 'Собран' || orderStatus === 'Исполнен';

                        return (
                            <div
                                key={order.id || idx}
                                draggable
                                onDragStart={(e) => {
                                    const ordId = String(order.id || order.orderNumber);
                                    e.dataTransfer.setData('orderId', ordId);
                                    e.dataTransfer.setData('text/plain', ordId);
                                    e.dataTransfer.effectAllowed = 'move';
                                }}
                                className={clsx(
                                    'p-3 rounded-2xl flex flex-col gap-2 cursor-grab active:cursor-grabbing border-2',
                                    isDark ? 'bg-slate-800/50 border-transparent hover:border-slate-700' : 'bg-white border-transparent hover:border-slate-100 shadow-sm'
                                )}
                            >
                                <div className="flex items-center justify-between">
                                    <span className={clsx(
                                        'text-xs font-black tracking-widest',
                                        isReady ? 'text-emerald-500' : 'text-blue-500'
                                    )}>
                                        #{order.orderNumber}
                                    </span>

                                    <div className="flex items-center gap-2">
                                        <div className={clsx(
                                            'px-2 py-0.5 rounded-md text-[10px] font-black',
                                            isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'
                                        )}>
                                            {formatTimeLabel(getPlannedTime(order) || 0)}
                                        </div>
                                        {isReady ? (
                                            <div className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                                                <CheckBadgeIcon className="w-3.5 h-3.5 text-emerald-500" />
                                            </div>
                                        ) : (
                                            <div className="w-5 h-5 rounded-md bg-slate-100 flex items-center justify-center">
                                                <ClockIcon className="w-3 h-3 text-slate-400" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className={clsx(
                                    'text-[11px] font-bold leading-tight',
                                    isDark ? 'text-slate-300' : 'text-slate-700'
                                )}>
                                    {order.address}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className={clsx("p-3 mt-auto", isDark ? "bg-slate-800/30" : "bg-slate-50/50")}>
                    <button
                        disabled={isCalculating}
                        onClick={(e) => { e.stopPropagation(); onCalculateRoute && onCalculateRoute(group); }}
                        className={clsx(
                            'w-full py-3.5 rounded-2xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest transition-all',
                            isDark
                                ? 'bg-slate-800 text-white hover:bg-slate-700'
                                : 'bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-black/10'
                        )}
                    >
                        {isCalculating ? (
                            <ArrowPathIcon className="w-4 h-4 animate-spin" />
                        ) : (
                            <RocketLaunchIcon className="w-4 h-4" />
                        )}
                        В МАРШРУТ
                    </button>
                </div>
            </div>
        </div>
    );
});

function getOrdersEnding(count: number): string {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;
    if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return 'заказов';
    if (lastDigit === 1) return 'заказ';
    if (lastDigit >= 2 && lastDigit <= 4) return 'заказа';
    return 'заказов';
}


