import clsx from 'clsx';
import { ClockIcon, MapPinIcon, ChevronDownIcon, ChevronUpIcon, RocketLaunchIcon, CheckBadgeIcon, InboxArrowDownIcon, FireIcon } from '@heroicons/react/24/outline';
import { useState, useEffect } from 'react';
import { type TimeWindowGroup } from '../../utils/route/routeCalculationHelpers';

interface TimeWindowGroupCardProps {
    group: TimeWindowGroup;
    isDark?: boolean;
    isCalculating?: boolean;
    onOrderMoved?: (orderId: string, targetGroup: TimeWindowGroup) => void;
    onCalculateRoute?: (group: TimeWindowGroup) => void;
    onJumpToGroup?: (group: TimeWindowGroup) => void;
}

export function TimeWindowGroupCard({
    group,
    isDark = false,
    isCalculating = false,
    onOrderMoved,
    onCalculateRoute,
    onJumpToGroup,
}: TimeWindowGroupCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);

    // Departure Timer Logic
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(timer);
    }, []);

    const getDepartureStatus = () => {
        if (!group.predictedDepartureAt) return null;
        const diff = group.predictedDepartureAt - now;
        if (diff < 0) return 'overdue';
        if (diff < 15 * 60 * 1000) return 'soon';
        return 'ok';
    };

    // Calculate readiness status
    const getReadinessStatus = () => {
        const assembledCount = group.orders.filter(o => o.status === 'Собран' || o.status === 'Исполнен').length;
        const total = group.orders.length;
        if (assembledCount === total) return 'ready';
        if (assembledCount > 0) return 'partial';
        return 'preparing';
    };

    const depStatus = getDepartureStatus();
    const readinessStatus = getReadinessStatus();
    const hasTime = group.windowStart > 0;

    // Get status color - NOW SUBTLE ACCENTS
    const getStatusColor = () => {
        if (readinessStatus === 'ready') return isDark ? 'border-green-500/30 ring-1 ring-green-500/10' : 'border-green-200 ring-1 ring-green-100/50';
        if (readinessStatus === 'partial') return isDark ? 'border-yellow-500/30' : 'border-yellow-200';
        if (depStatus === 'soon') return isDark ? 'border-orange-500/30' : 'border-orange-200';
        return isDark ? 'border-white/5' : 'border-gray-200';
    };

    // Card background
    const getCardBackground = () => {
        return isDark ? 'bg-[#151B2C]/40 backdrop-blur-md' : 'bg-white/60 backdrop-blur-md';
    };

    return (
        <div
            onDragOver={(e) => {
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
                    const orderId = e.dataTransfer.getData('orderId');
                    if (orderId) {
                        onOrderMoved(orderId, group);
                    }
                }
            }}
            className={clsx(
                'rounded-2xl border transition-all duration-500 relative overflow-hidden group',
                getStatusColor(),
                getCardBackground(),
                isDragOver && (isDark ? 'border-blue-500 bg-blue-900/10 shadow-[0_0_20px_rgba(59,130,246,0.2)]' : 'border-blue-400 bg-blue-50/50 shadow-lg')
            )}
        >
            {/* Left Status Accent - NEW SUBTLE UI */}
            <div className={clsx(
                'absolute top-0 left-0 bottom-0 w-1.5 transition-all duration-500 group-hover:w-2',
                readinessStatus === 'ready' && 'bg-gradient-to-b from-green-500 to-emerald-500',
                readinessStatus === 'partial' && 'bg-gradient-to-b from-yellow-500 to-orange-500',
                readinessStatus === 'preparing' && 'bg-gradient-to-b from-blue-500 to-indigo-500'
            )} />

            {/* Subtle glow on hover */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />

            {/* Header Area */}
            <div
                className={clsx(
                    'p-3 pt-4 cursor-pointer transition-colors',
                    isDark ? 'hover:bg-gray-700/20' : 'hover:bg-blue-50/20'
                )}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-start justify-between">
                    <div className="flex flex-col gap-2.5 flex-1">
                        {/* Time Badge with Status Icon */}
                        <div className="flex items-center gap-2">
                            <div className={clsx(
                                'px-2.5 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold tracking-tight shadow-sm',
                                hasTime
                                    ? (isDark ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-blue-50 text-blue-700 border border-blue-200')
                                    : (isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500')
                            )}>
                                <ClockIcon className="w-4 h-4" />
                                <span className="font-mono">{group.windowLabel}</span>
                            </div>

                            {/* Readiness Badge */}
                            {readinessStatus === 'ready' && (
                                <div className="p-1 px-1.5 rounded-md bg-green-500/20 text-green-600 dark:text-green-400 text-[10px] font-bold flex items-center gap-1 shadow-sm border border-green-500/20" title="Все заказы собраны">
                                    <CheckBadgeIcon className="w-3.5 h-3.5" />
                                </div>
                            )}
                            {readinessStatus === 'partial' && (
                                <div className="p-1 px-1.5 rounded-md bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 text-[10px] font-bold shadow-sm border border-yellow-500/20" title="Частично собрано">
                                    <ClockIcon className="w-3.5 h-3.5" />
                                </div>
                            )}
                        </div>

                        {/* Timeline Visualization - НОВОЕ */}
                        {hasTime && (
                            <div className="flex items-center gap-2 text-[10px] font-medium opacity-60">
                                {group.arrivalStart && (
                                    <div className="flex items-center gap-1">
                                        <InboxArrowDownIcon className="w-3 h-3" />
                                        <span>{formatTimeLabel(group.arrivalStart)}</span>
                                    </div>
                                )}
                                <div className="flex-1 h-px bg-current opacity-20" />
                                {group.predictedDepartureAt && (
                                    <div className={clsx(
                                        'flex items-center gap-1 px-1.5 py-0.5 rounded',
                                        depStatus === 'overdue' ? 'bg-green-500/20 text-green-600' :
                                            depStatus === 'soon' ? 'bg-orange-500/20 text-orange-600' :
                                                'bg-blue-500/10 text-blue-600'
                                    )}>
                                        {depStatus === 'overdue' ? (
                                            <CheckBadgeIcon className="w-3 h-3" />
                                        ) : depStatus === 'soon' ? (
                                            <FireIcon className="w-3 h-3" />
                                        ) : (
                                            <RocketLaunchIcon className="w-3 h-3" />
                                        )}
                                        <span className="font-mono">{formatTimeLabel(group.predictedDepartureAt)}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Order Count and Split Reason */}
                        <div className="flex items-center gap-2">
                            <span className={clsx('text-[11px] font-semibold', isDark ? 'text-gray-400' : 'text-gray-600')}>
                                {group.orders.length} заказ{getOrdersEnding(group.orders.length)}
                            </span>
                            {group.splitReason && (
                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold border border-blue-500/20">
                                    {group.splitReason}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-1">
                        {onJumpToGroup && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onJumpToGroup(group);
                                }}
                                className={clsx(
                                    'p-2 rounded-lg transition-all',
                                    isDark ? 'text-gray-500 hover:text-blue-400 hover:bg-gray-700' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'
                                )}
                                title="Показать на карте"
                            >
                                <MapPinIcon className="w-4 h-4" />
                            </button>
                        )}
                        <div className="p-1 opacity-30">
                            {isExpanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                        </div>
                    </div>
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div className={clsx('border-t', isDark ? 'border-gray-700 bg-gray-900/20' : 'border-gray-100 bg-gray-50/30')}>
                    <div className="p-2 space-y-1.5 max-h-[280px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
                        {group.orders.map((order, idx) => {
                            const orderStatus = order.status || 'Новый';
                            const isReady = orderStatus === 'Собран' || orderStatus === 'Исполнен';

                            return (
                                <div
                                    key={order.id || idx}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('orderId', order.id);
                                        e.dataTransfer.effectAllowed = 'move';
                                    }}
                                    className={clsx(
                                        'p-2.5 rounded-lg border transition-all cursor-grab active:cursor-grabbing hover:shadow-md',
                                        isDark ? 'bg-gray-800/80 border-gray-700 hover:border-gray-600' : 'bg-white border-gray-200 hover:border-blue-300',
                                        isReady && 'border-l-4 border-l-green-500'
                                    )}
                                >
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-2">
                                            <span className={clsx('text-[11px] font-bold tracking-tight', isReady ? 'text-green-600' : 'text-blue-600')}>
                                                #{order.orderNumber}
                                            </span>
                                            <span className={clsx(
                                                'text-[9px] px-1.5 py-0.5 rounded-full font-bold',
                                                isReady ? 'bg-green-500/20 text-green-700 dark:text-green-400' : 'bg-gray-500/20 text-gray-600 dark:text-gray-400'
                                            )}>
                                                {orderStatus}
                                            </span>
                                        </div>
                                        {order.plannedTime && !isNaN(order.plannedTime as any) && (
                                            <span className="text-[10px] font-mono font-medium opacity-50">
                                                {formatTimeLabel(order.plannedTime as any)}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[11px] font-medium opacity-70 leading-tight line-clamp-1">
                                        {order.address}
                                    </p>
                                </div>
                            );
                        })}
                    </div>

                    <div className="p-3 pt-2">
                        <button
                            disabled={isCalculating}
                            onClick={() => onCalculateRoute && onCalculateRoute(group)}
                            className={clsx(
                                'w-full py-3.5 rounded-2xl flex items-center justify-center gap-2.5 text-[11px] font-black uppercase tracking-widest transition-all active:scale-[0.98] shadow-xl relative overflow-hidden group/btn',
                                isDark
                                    ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-900/20'
                                    : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
                            )}
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover/btn:animate-[shimmer_2s_infinite]" />
                            {isCalculating ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <RocketLaunchIcon className="w-4 h-4 transition-transform group-hover/btn:-translate-y-1 group-hover/btn:translate-x-1" />
                            )}
                            Построить маршрут
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function getOrdersEnding(count: number): string {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;
    if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return 'ов';
    if (lastDigit === 1) return '';
    if (lastDigit >= 2 && lastDigit <= 4) return 'а';
    return 'ов';
}

function formatTimeLabel(timestamp: number): string {
    if (!timestamp || isNaN(timestamp) || timestamp <= 0) return '--:--';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '--:--';
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}
