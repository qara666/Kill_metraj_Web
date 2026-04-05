import clsx from 'clsx';
import { ClockIcon, ChevronDownIcon, CheckBadgeIcon, ArrowPathIcon, RocketLaunchIcon } from '@heroicons/react/24/outline';
import { getStatusBadgeProps } from '../../utils/data/statusBadgeHelper';
import { memo, useState, useMemo } from 'react';
import { formatTimeLabel, type TimeWindowGroup } from '../../utils/route/routeCalculationHelpers';
import { getPlannedTime } from '../../utils/data/timeUtils';

interface TimeWindowGroupCardProps {
    group: TimeWindowGroup;
    isDark?: boolean;
    isCalculating?: boolean;
    ordersInRoutesSet?: Set<string>;
    onOrderMoved?: (orderId: string, targetGroup: TimeWindowGroup) => void;
    onCalculateRoute?: (group: TimeWindowGroup) => void;
}

export const TimeWindowGroupCard = memo(({
    group,
    isDark = false,
    isCalculating = false,
    ordersInRoutesSet = new Set(),
    onOrderMoved,
    onCalculateRoute
}: TimeWindowGroupCardProps) => {
    // v5.47: Expanded by default as per user request
    const [isExpanded, setIsExpanded] = useState(true);
    const [isDragOver, setIsDragOver] = useState(false);

    // Calculate routed orders for display v5.170
    const routedOrdersCount = group.orders.filter(o => ordersInRoutesSet.has(String(o.id || o.orderNumber))).length;
    const isReady = routedOrdersCount === group.orders.length;
    const isPartial = routedOrdersCount > 0 && !isReady;

    const theme = useMemo(() => {
        if (isReady) return {
            border: isDark ? 'border-emerald-500/30' : 'border-emerald-500/50',
            bg: isDark ? 'bg-slate-900/60' : 'bg-white/80',
            badgeBg: isDark ? 'bg-emerald-500/20' : 'bg-emerald-50',
            badgeText: 'text-emerald-500',
            glow: isDark ? 'shadow-[0_0_20px_rgba(16,185,129,0.1)]' : 'shadow-[0_0_15px_rgba(16,185,129,0.1)]'
        };

        if (isPartial) return {
            border: isDark ? 'border-amber-500/30' : 'border-amber-500/50',
            bg: isDark ? 'bg-slate-900/60' : 'bg-white/80',
            badgeBg: isDark ? 'bg-amber-500/20' : 'bg-amber-50',
            badgeText: 'text-amber-500',
            glow: isDark ? 'shadow-[0_0_20px_rgba(245,158,11,0.1)]' : 'shadow-[0_0_15px_rgba(245,158,11,0.1)]'
        };

        return {
            border: isDark ? 'border-slate-700/50' : 'border-slate-200',
            bg: isDark ? 'bg-slate-900/60' : 'bg-white/80',
            badgeBg: isDark ? 'bg-slate-500/10' : 'bg-slate-50',
            badgeText: isDark ? 'text-slate-400' : 'text-slate-500',
            glow: ''
        };

    }, [isReady, isPartial, isDark]);

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
                'rounded-3xl border transition-colors duration-200 relative overflow-hidden flex flex-col',
                'backdrop-blur-none', // Phase 7: Remove backdrop-blur for fps
                theme.border,
                theme.bg,
                theme.glow,
                'hover:scale-[1.01] hover:shadow-xl active:scale-[0.99]', // v5.48: slightly reduced shadow on hover
                'will-change-transform', // v5.48: GPU hint
                isDragOver && (isDark ? 'ring-2 ring-blue-500 bg-blue-900/30' : 'ring-2 ring-blue-400 bg-blue-50/80')
            )}
        >
            {/* Header */}
            <div
                className={clsx(
                    'relative p-4 pb-2.5 cursor-pointer transition-colors select-none', // v5.48: compact padding
                    isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'
                )}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center justify-between mb-3">
                    <div className={clsx(
                        'px-3.5 py-1 rounded-full flex items-center gap-2 text-[10px] font-black tracking-widest shadow-md', // v5.48: smaller header badge
                        isDark ? 'bg-blue-600/90 text-white' : 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white'
                    )}>
                        <ClockIcon className="w-3.5 h-3.5" />
                        <span>{group.windowLabel}</span>
                    </div>

                    <div className={clsx(
                        'w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300', // v5.48: smaller icon
                        isDark ? 'bg-slate-800' : 'bg-slate-100',
                        isExpanded ? 'rotate-180 bg-blue-500/10' : ''
                    )}>
                        <ChevronDownIcon className={clsx('w-3.5 h-3.5 text-slate-400')} />
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <div className={clsx(
                        'px-2 py-0.5 rounded-lg text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-sm',
                        theme.badgeBg, theme.badgeText
                    )}>
                        {isReady ? <CheckBadgeIcon className="w-3.5 h-3.5" /> : <ClockIcon className="w-3.5 h-3.5 opacity-50" />}
                        <span className="tabular-nums">РОЗРАХОВАНО {routedOrdersCount} / {group.orders.length}</span>
                    </div>

                    {group.splitReason && (
                        <span className={clsx(
                            "text-[8px] font-black uppercase tracking-tighter px-1.2 py-0.2 rounded border",
                            isDark ? "text-amber-400/60 border-amber-900/30 bg-amber-900/10" : "text-amber-500 border-amber-100 bg-amber-50"
                        )}>
                            {group.splitReason}
                        </span>
                    )}
                </div>
            </div>

            {/* Separator */}
            <div className={clsx("h-[1px] w-full", isDark ? "bg-slate-800" : "bg-slate-100")} />

            {/* Expanded Content */}
            <div className={clsx(
                'flex flex-col transition-all duration-500 ease-in-out overflow-hidden',
                isExpanded ? 'max-h-[800px] opacity-100 flex-1' : 'max-h-0 opacity-0'
            )}>
                <div className="p-2 flex-1 overflow-y-auto max-h-[350px] custom-scrollbar space-y-1.5">
                    {group.orders.map((order: any, idx: number) => {
                        const statusProps = getStatusBadgeProps(order.status || '', isDark);
                        const isReady = statusProps.text === 'СОБРАН' || statusProps.text === 'ИСПОЛНЕН';
                        const isRouted = ordersInRoutesSet.has(String(order.id || order.orderNumber));

                        return (
                            <div
                                key={order.id || idx}
                                draggable={!isRouted}
                                onDragStart={(e) => {
                                    if (isRouted) {
                                      e.preventDefault();
                                      return;
                                    }
                                    const ordId = String(order.id || order.orderNumber);
                                    e.dataTransfer.setData('orderId', ordId);
                                    e.dataTransfer.setData('text/plain', ordId);
                                    e.dataTransfer.effectAllowed = 'move';
                                }}
                                className={clsx(
                                    'p-3 rounded-xl flex flex-col gap-1.5 border-2 transition-colors relative overflow-hidden',
                                    'contain-content',
                                    isRouted 
                                        ? (isDark ? 'opacity-40 cursor-not-allowed bg-gray-900 border-gray-800' : 'opacity-50 cursor-not-allowed bg-gray-100 border-gray-200')
                                        : (isDark 
                                            ? 'cursor-grab active:cursor-grabbing bg-slate-800/40 border-slate-700/30 hover:bg-slate-800/60 hover:border-slate-600'
                                            : 'cursor-grab active:cursor-grabbing bg-white border-slate-50 hover:border-blue-100 shadow-sm')
                                )}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className={clsx(
                                            'text-[11px] font-black tracking-widest',
                                            isReady ? 'text-emerald-500' :
                                                statusProps.text === 'ДОСТАВЛЯЕТСЯ' ? 'text-blue-500' :
                                                    statusProps.text === 'В РАБОТЕ' ? 'text-amber-500' :
                                                        'text-slate-400'
                                        )}>
                                            #{order.orderNumber}
                                        </span>
                                        {isRouted && (
                                            <span className={clsx(
                                                "px-1.5 py-0.5 rounded-lg border text-[8px] font-black tracking-widest leading-none shadow-sm",
                                                isDark ? "bg-purple-500/20 border-purple-500/30 text-purple-300" : "bg-purple-50 border-purple-200 text-purple-700"
                                            )}>
                                                В МАРШРУТЕ
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                        <div className={clsx(
                                            'px-1.5 py-0.5 rounded-md text-[9px] font-black tabular-nums',
                                            isDark ? 'bg-slate-800 text-slate-400 border border-slate-700' : 'bg-slate-50 text-slate-600 border border-slate-100'
                                        )}>
                                            {formatTimeLabel(getPlannedTime(order) || 0)}
                                        </div>
                                    </div>
                                </div>
                                <div className={clsx(
                                    'text-[10px] font-bold leading-normal truncate px-0.5',
                                    isDark ? 'text-slate-300' : 'text-slate-600'
                                )}>
                                    {order.address}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className={clsx("p-3 mt-auto border-t", isDark ? "border-slate-800/50 bg-slate-900/30" : "border-slate-50 bg-slate-50/20")}>
                    <button
                        disabled={isCalculating || group.orders.every(o => ordersInRoutesSet.has(String(o.id || o.orderNumber)))}
                        onClick={(e) => { e.stopPropagation(); onCalculateRoute && onCalculateRoute(group); }}
                        className={clsx(
                            'w-full py-2.5 rounded-xl flex items-center justify-center gap-2.5 text-[10px] font-black uppercase tracking-[0.1em] transition-all',
                            'active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group shadow-lg',
                            isDark
                                ? 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white hover:from-blue-500 hover:to-indigo-600 shadow-blue-500/10'
                                : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/20'
                        )}
                    >
                        {isCalculating ? (
                            <ArrowPathIcon className="w-4 h-4 animate-spin" />
                        ) : (
                            <RocketLaunchIcon className="w-4 h-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                        )}
                        <span>В МАРШРУТ</span>
                    </button>
                </div>
            </div>
        </div>
    );
});



