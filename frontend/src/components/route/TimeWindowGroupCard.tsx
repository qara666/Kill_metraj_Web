import clsx from 'clsx';
import {
    ClockIcon,
    ChevronDownIcon,
    CheckBadgeIcon,
    ExclamationTriangleIcon,
    ArrowPathIcon,
    RocketLaunchIcon
} from '@heroicons/react/24/outline';
import { memo, useState, useMemo } from 'react';
import { type TimeWindowGroup, formatTimeLabel } from '../../utils/route/routeCalculationHelpers';
import { getPlannedTime } from '../../utils/data/timeUtils';
import { haversineDistance } from '../../utils/routes/routeOptimizationHelpers';

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

    // Conflict Detection (SOTA innovation)
    const geoConflict = useMemo(() => {
        if (group.orders.length < 2) return null;
        const ordersWithCoords = group.orders.filter(o => o.coords);
        if (ordersWithCoords.length < 2) return null;

        for (let i = 0; i < ordersWithCoords.length; i++) {
            for (let j = i + 1; j < ordersWithCoords.length; j++) {
                const o1 = ordersWithCoords[i];
                const o2 = ordersWithCoords[j];
                const dist = haversineDistance(
                    o1.coords!.lat, o1.coords!.lng,
                    o2.coords!.lat, o2.coords!.lng
                );
                if (dist > 5) return { type: 'distance', value: dist };
            }
        }
        return null;
    }, [group.orders]);

    // Calculate readiness status
    const assembledOrders = group.orders.filter(o => o.status === 'Собран' || o.status === 'Исполнен');
    const preparingOrders = group.orders.filter(o => o.status !== 'Собран' && o.status !== 'Исполнен');

    const getReadinessStatus = () => {
        if (assembledOrders.length === group.orders.length) return 'ready';
        if (assembledOrders.length > 0) return 'partial';
        return 'preparing';
    };

    const readinessStatus = getReadinessStatus();
    const hasTime = group.windowStart > 0;
    const assemblyProgress = (assembledOrders.length / group.orders.length) * 100;

    // Urgency Detection (Phase 5.1/SOTA v2.0)
    const urgency = useMemo(() => {
        if (!group.windowStart) return 'normal';
        const now = Date.now();
        const diffMin = (group.windowStart - now) / 60000;
        if (diffMin < 0) return 'overdue';
        if (diffMin < 30) return 'critical';
        if (diffMin < 60) return 'high';
        return 'normal';
    }, [group.windowStart]);

    const theme = useMemo(() => {
        const isReady = readinessStatus === 'ready';
        if (isReady) return {
            border: isDark ? 'border-emerald-500/40' : 'border-emerald-300',
            glow: 'shadow-[0_0_30px_rgba(16,185,129,0.15)]',
            mesh: 'from-emerald-500/10 via-transparent to-transparent',
            accent: 'text-emerald-500'
        };

        switch (urgency) {
            case 'overdue':
                return {
                    border: 'border-rose-500/50',
                    glow: 'shadow-[0_0_20px_rgba(244,63,94,0.15)]',
                    mesh: 'from-rose-500/10 via-transparent to-transparent',
                    accent: 'text-rose-500'
                };
            case 'critical':
                return {
                    border: 'border-orange-500/50',
                    glow: 'shadow-[0_0_15px_rgba(245,158,11,0.15)]',
                    mesh: 'from-orange-500/10 via-transparent to-transparent',
                    accent: 'text-orange-500'
                };
            case 'high':
                return {
                    border: 'border-amber-500/40',
                    glow: 'shadow-[0_0_15px_rgba(217,119,6,0.05)]',
                    mesh: 'from-amber-500/5 via-transparent to-transparent',
                    accent: 'text-amber-500'
                };
            default:
                return {
                    border: isDark ? 'border-white/10' : 'border-slate-200',
                    glow: 'shadow-sm',
                    mesh: 'from-blue-500/5 via-transparent to-transparent',
                    accent: 'text-blue-500'
                };
        }
    }, [readinessStatus, urgency, isDark]);

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
                    console.log('[DND] Target Group:', group.id, 'Received ID:', orderId);

                    if (orderId && onOrderMoved) {
                        onOrderMoved(orderId, group);
                    } else {
                        console.warn('[DND] Missing orderId in drop event');
                    }
                }
            }}
            className={clsx(
                'rounded-[1.25rem] border backdrop-blur-2xl transition-all duration-300 relative overflow-hidden group/card',
                theme.border,
                theme.glow,
                isDark ? 'bg-slate-900/80 shadow-black/20' : 'bg-white/80 shadow-slate-200/50',
                isDragOver && (isDark ? 'ring-2 ring-blue-500 bg-blue-900/30 font-bold' : 'ring-2 ring-blue-400 bg-blue-50/80 font-bold')
            )}
        >
            {/* Mesh Gradient Background Layer */}
            <div className={clsx(
                'absolute inset-0 bg-gradient-to-br opacity-40 pointer-events-none transition-opacity duration-700',
                theme.mesh
            )} />

            {/* Header - Simplified and Clean */}
            <div
                className={clsx(
                    'relative p-3.5 cursor-pointer transition-colors duration-200',
                    isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-slate-50/60'
                )}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        {/* Time Badge */}
                        <div className={clsx(
                            'px-4 py-2 rounded-2xl flex items-center gap-2.5 text-xs font-black tracking-tighter tabular-nums border shadow-sm transition-all duration-700',
                            hasTime
                                ? (isDark ? 'bg-blue-600/10 text-blue-400 border-blue-500/20' : 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20')
                                : (isDark ? 'bg-slate-800 text-slate-500 border-slate-700' : 'bg-slate-100 text-slate-400 border-slate-200')
                        )}>
                            <ClockIcon className={clsx("w-4 h-4", urgency !== 'normal' && 'animate-pulse')} />
                            <span>{group.windowLabel}</span>
                        </div>
                    </div>

                    <div className={clsx(
                        'p-2 rounded-xl transition-all duration-500',
                        isDark ? 'bg-white/5' : 'bg-slate-100',
                        isExpanded && (isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-500 text-white')
                    )}>
                        <ChevronDownIcon className={clsx('w-4 h-4 transition-transform duration-500', isExpanded ? 'rotate-180' : 'rotate-0')} />
                    </div>
                </div>

                {/* Status Bar */}
                <div className="mt-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shadow-sm">
                            <CheckBadgeIcon className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-[10px] font-black text-emerald-500">{assembledOrders.length}</span>
                        </div>
                        {preparingOrders.length > 0 && (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 shadow-sm">
                                <ArrowPathIcon className="w-3.5 h-3.5 text-amber-500 animate-spin-slow" />
                                <span className="text-[10px] font-black text-amber-500">{preparingOrders.length}</span>
                            </div>
                        )}
                        {geoConflict && (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 group/hint relative shadow-sm">
                                <ExclamationTriangleIcon className="w-4 h-4 text-rose-500 animate-pulse" />
                                <div className="absolute left-0 bottom-full mb-3 px-2 py-1.5 rounded-xl bg-slate-900/95 backdrop-blur-md text-[9px] font-black text-white whitespace-nowrap opacity-0 group-hover/hint:opacity-100 transition-all duration-300 pointer-events-none z-50 shadow-2xl border border-white/10">
                                    РАССТОЯНИЕ: {geoConflict.value.toFixed(1)} км
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Compact Order Counter (Simplified) */}
                    <div className="text-[10px] font-black opacity-30 uppercase tracking-widest">
                        {group.orders.length} {getOrdersEnding(group.orders.length)}
                    </div>
                </div>

                {/* Ultra-Thin Global Progress Bar */}
                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-slate-200 dark:bg-slate-800">
                    <div
                        className={clsx(
                            'h-full transition-all duration-1000 shadow-[0_0_8px]',
                            'bg-emerald-500 shadow-emerald-500/50'
                        )}
                        style={{ width: `${assemblyProgress}%` }}
                    />
                </div>
            </div>

            {/* Expanded List - Professional Layout */}
            {isExpanded && (
                <div className={clsx(
                    'border-t border-dashed transition-all duration-500 animate-in fade-in slide-in-from-top-2',
                    isDark ? 'border-white/5' : 'border-slate-200'
                )}>
                    <div className="p-1.5 max-h-[300px] overflow-y-auto custom-scrollbar space-y-1.5">
                        {group.orders.map((order, idx) => {
                            const orderStatus = order.status || 'Новый';
                            const isReady = orderStatus === 'Собран' || orderStatus === 'Исполнен';

                            return (
                                <div
                                    key={order.id || idx}
                                    draggable
                                    onDragStart={(e) => {
                                        const ordId = String(order.id || order.orderNumber);
                                        console.log('[DND] Drag Start:', ordId);
                                        e.dataTransfer.setData('orderId', ordId);
                                        e.dataTransfer.setData('text/plain', ordId); // Fallback
                                        e.dataTransfer.effectAllowed = 'move';
                                    }}
                                    className={clsx(
                                        'px-3 py-2.5 relative rounded-xl flex flex-col gap-1.5 transition-all duration-200 cursor-grab active:cursor-grabbing border border-transparent hover:shadow-md',
                                        isDark
                                            ? 'bg-slate-800/40 hover:bg-slate-800/70 hover:border-white/10'
                                            : 'bg-white hover:bg-slate-50 shadow-sm border-slate-100',
                                        isReady && (isDark ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50/80 border-emerald-100')
                                    )}
                                >
                                    {/* TOP ROW: ID & TIME & STATUS */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className={clsx(
                                                'text-[10px] font-black tracking-widest tabular-nums',
                                                isReady ? 'text-emerald-500' : 'text-blue-500'
                                            )}>
                                                #{order.orderNumber}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <div className={clsx(
                                                'px-1.5 py-0.5 rounded-md text-[9px] font-black tabular-nums border transition-all duration-500',
                                                isDark ? 'bg-white/5 border-white/5 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-500'
                                            )}>
                                                {formatTimeLabel(getPlannedTime(order) || 0)}
                                            </div>
                                            {isReady ? (
                                                <div className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                                                    <CheckBadgeIcon className="w-3 h-3 text-emerald-500" />
                                                </div>
                                            ) : (
                                                <div className="w-5 h-5 rounded-md bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                                                    <ClockIcon className="w-3 h-3 text-blue-500" />
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* BOTTOM ROW: FULL ADDRESS (SOTA FIX - NO TRUNCATION) */}
                                    <div className={clsx(
                                        'text-[10px] font-bold leading-snug break-words whitespace-normal border-l-2 pl-2.5 py-0.5 transition-all duration-500',
                                        isDark ? 'text-slate-300 border-white/10' : 'text-slate-600 border-blue-100'
                                    )}>
                                        {order.address}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="p-2.5">
                        <button
                            disabled={isCalculating}
                            onClick={() => onCalculateRoute && onCalculateRoute(group)}
                            className={clsx(
                                'w-full py-2 rounded-xl flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] transition-all duration-300 active:scale-[0.97] border shadow-lg',
                                isDark
                                    ? 'bg-blue-600 text-white border-blue-500 hover:bg-blue-500 shadow-blue-900/40'
                                    : 'bg-slate-900 text-white border-slate-800 hover:bg-slate-800 shadow-slate-200'
                            )}
                        >
                            {isCalculating ? (
                                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <RocketLaunchIcon className="w-3.5 h-3.5" />
                            )}
                            В маршрут
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
})

function getOrdersEnding(count: number): string {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;
    if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return 'заказов';
    if (lastDigit === 1) return 'заказ';
    if (lastDigit >= 2 && lastDigit <= 4) return 'заказа';
    return 'заказов';
}


