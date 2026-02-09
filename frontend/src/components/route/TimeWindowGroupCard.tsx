import clsx from 'clsx';
import { ClockIcon, MapPinIcon, ChevronDownIcon, ChevronUpIcon, RocketLaunchIcon, CheckBadgeIcon } from '@heroicons/react/24/outline';
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

    // Phase 4.2: Departure Timer Logic
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

    const depStatus = getDepartureStatus();
    const hasTime = group.windowStart > 0;

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
                    setIsDragOver(false);
                    const orderId = e.dataTransfer.getData('orderId');
                    if (orderId) {
                        onOrderMoved(orderId, group);
                    }
                }
            }}
            className={clsx(
                'rounded-xl border-2 transition-all relative overflow-hidden',
                isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-blue-50/50 shadow-sm',
                isDragOver && (isDark ? 'border-blue-500 bg-blue-900/10' : 'border-blue-400 bg-blue-50/50 shadow-md')
            )}
        >
            {/* Header Area */}
            <div
                className={clsx(
                    'p-3 cursor-pointer transition-colors',
                    isDark ? 'hover:bg-gray-700/30' : 'hover:bg-blue-50/30'
                )}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-start justify-between">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            {/* Simple Time Badge */}
                            <div className={clsx(
                                'px-2 py-1 rounded-lg flex items-center gap-1.5 text-[11px] font-bold tracking-tight',
                                hasTime
                                    ? (isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-50 text-blue-600')
                                    : (isDark ? 'bg-gray-700 text-gray-500' : 'bg-gray-100 text-gray-400')
                            )}>
                                <ClockIcon className="w-3.5 h-3.5 opacity-70" />
                                {group.windowLabel}
                            </div>

                            {/* Subdued Departure Status */}
                            {group.predictedDepartureAt && (
                                <div className={clsx(
                                    'text-[10px] font-bold tracking-tight opacity-70 flex items-center gap-1',
                                    depStatus === 'overdue' ? 'text-green-500' : 'text-gray-400'
                                )}>
                                    {depStatus === 'overdue' ? (
                                        <CheckBadgeIcon className="w-3 h-3" />
                                    ) : (
                                        <div className="w-1 h-1 rounded-full bg-current opacity-40" />
                                    )}
                                    {depStatus === 'overdue' ? 'Готов' : formatTimeLabel(group.predictedDepartureAt)}
                                </div>
                            )}
                        </div>

                        {/* Combined Order Count and Split Reason */}
                        <div className="flex items-center gap-2">
                            <span className={clsx('text-[11px] font-medium opacity-50')}>
                                {group.orders.length} заказ{getOrdersEnding(group.orders.length)}
                            </span>
                            {group.splitReason && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/5 text-blue-500/60 font-bold border border-blue-500/10">
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
                        <div className="p-1 opacity-20">
                            {isExpanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                        </div>
                    </div>
                </div>

                {/* Readiness Indicator Line (Anti-Mess) */}
                {(() => {
                    const allAssembled = group.orders.length > 0 && group.orders.every(o => o.status === 'Собран' || o.status === 'Исполнен');
                    if (allAssembled) {
                        return (
                            <div className="mt-2 h-1 w-full bg-green-500/20 rounded-full overflow-hidden">
                                <div className="h-full bg-green-500 w-full animate-pulse" />
                            </div>
                        );
                    }
                    return null;
                })()}
            </div>

            {/* Expanded Content with cleaner items */}
            {isExpanded && (
                <div className={clsx('border-t', isDark ? 'border-gray-700 bg-gray-900/10' : 'border-blue-50/50 bg-gray-50/20')}>
                    <div className="p-2 space-y-1.5 max-h-[260px] overflow-y-auto scrollbar-hide">
                        {group.orders.map((order, idx) => (
                            <div
                                key={order.id || idx}
                                draggable
                                onDragStart={(e) => {
                                    e.dataTransfer.setData('orderId', order.id);
                                    e.dataTransfer.effectAllowed = 'move';
                                }}
                                className={clsx(
                                    'p-2.5 rounded-lg border-2 transition-all cursor-grab active:cursor-grabbing',
                                    isDark ? 'bg-gray-800/80 border-gray-700' : 'bg-white border-transparent shadow-sm'
                                )}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className={clsx('text-[10px] font-bold text-blue-600/80 tracking-tight')}>#{order.orderNumber}</span>
                                    {order.plannedTime && !isNaN(order.plannedTime as any) && (
                                        <span className="text-[9px] font-medium opacity-40">{formatTimeLabel(order.plannedTime as any)}</span>
                                    )}
                                </div>
                                <p className="text-[11px] font-medium opacity-60 leading-tight line-clamp-1">{order.address}</p>
                            </div>
                        ))}
                    </div>

                    <div className="p-3 pt-1">
                        <button
                            disabled={isCalculating}
                            onClick={() => onCalculateRoute && onCalculateRoute(group)}
                            className={clsx(
                                'w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-wide transition-all active:scale-[0.98]',
                                isDark
                                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                                    : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                            )}
                        >
                            {isCalculating ? (
                                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <RocketLaunchIcon className="w-3.5 h-3.5" />
                            )}
                            В Маршрут
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
