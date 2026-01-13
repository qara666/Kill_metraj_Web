import clsx from 'clsx';
import { ClockIcon, MapPinIcon, ChevronDownIcon, ChevronUpIcon, RocketLaunchIcon, CheckBadgeIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
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
                'rounded-2xl border-2 transition-all relative overflow-hidden',
                isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-blue-50 shadow-sm',
                isDragOver && (isDark ? 'border-blue-500 bg-blue-900/20 shadow-blue-900/20' : 'border-blue-400 bg-blue-50 shadow-md transform scale-[1.02]')
            )}
        >
            {/* Header / Clickable area */}
            <div
                className={clsx(
                    'p-4 cursor-pointer transition-colors',
                    isDark ? 'hover:bg-gray-700/50' : 'hover:bg-blue-50/50'
                )}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        {/* Time Badge */}
                        <div className={clsx(
                            'px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-black uppercase tracking-widest',
                            hasTime
                                ? (isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-50 text-blue-700')
                                : (isDark ? 'bg-gray-700 text-gray-500' : 'bg-gray-100 text-gray-400')
                        )}>
                            <ClockIcon className="w-3.5 h-3.5" />
                            {group.windowLabel}
                        </div>

                        {/* Status / Departure */}
                        {group.predictedDepartureAt && (
                            <div className={clsx(
                                'px-3 py-1.5 rounded-xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest border',
                                depStatus === 'overdue'
                                    ? 'bg-green-500/10 border-green-500/20 text-green-500'
                                    : depStatus === 'soon'
                                        ? 'bg-orange-500/10 border-orange-500/20 text-orange-500'
                                        : 'bg-blue-500/10 border-blue-500/20 text-blue-500'
                            )}>
                                {depStatus === 'overdue' ? <CheckBadgeIcon className="w-3.5 h-3.5" /> : <RocketLaunchIcon className="w-3.5 h-3.5" />}
                                {depStatus === 'overdue' ? 'Готов' : formatTimeLabel(group.predictedDepartureAt)}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {onJumpToGroup && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onJumpToGroup(group);
                                }}
                                className={clsx(
                                    'p-2 rounded-xl transition-all hover:scale-110 active:scale-90',
                                    isDark ? 'bg-gray-700 text-gray-400 hover:text-blue-400' : 'bg-gray-50 text-gray-400 hover:text-blue-600'
                                )}
                                title="Перейти к заказам"
                            >
                                <MapPinIcon className="w-5 h-5" />
                            </button>
                        )}
                        {isExpanded ? <ChevronUpIcon className="w-5 h-5 opacity-30" /> : <ChevronDownIcon className="w-5 h-5 opacity-30" />}
                    </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                    <span className={clsx('text-xs font-black opacity-40 uppercase tracking-widest')}>
                        {group.orders.length} заказ{getOrdersEnding(group.orders.length)}
                    </span>
                    {group.splitReason && (
                        <div className="flex items-center gap-1.5 text-[9px] font-bold text-blue-500 uppercase tracking-tight">
                            <QuestionMarkCircleIcon className="w-3 h-3" />
                            {group.splitReason}
                        </div>
                    )}
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div className={clsx('border-t-2', isDark ? 'border-gray-700 bg-gray-900/20' : 'border-blue-50 bg-gray-50/30')}>
                    <div className="p-4 space-y-2 max-h-[300px] overflow-y-auto scrollbar-hide">
                        {group.orders.map((order, idx) => (
                            <div
                                key={order.id || idx}
                                draggable
                                onDragStart={(e) => {
                                    e.dataTransfer.setData('orderId', order.id);
                                    e.dataTransfer.effectAllowed = 'move';
                                }}
                                className={clsx(
                                    'p-3 rounded-2xl border-2 flex flex-col gap-2 transition-all cursor-grab active:cursor-grabbing',
                                    isDark ? 'bg-gray-800/80 border-gray-700' : 'bg-white border-white shadow-sm'
                                )}
                            >
                                <div className="flex items-center justify-between font-black text-[10px] tracking-widest uppercase">
                                    <span className={isDark ? 'text-blue-400' : 'text-blue-600'}>#{order.orderNumber}</span>
                                    {order.plannedTime && !isNaN(order.plannedTime) && <span className="opacity-40">{formatTimeLabel(order.plannedTime)}</span>}
                                </div>
                                <p className="text-xs font-medium opacity-60 leading-relaxed line-clamp-2">{order.address}</p>
                            </div>
                        ))}
                    </div>

                    <div className="p-4 pt-0">
                        <button
                            disabled={isCalculating}
                            onClick={() => onCalculateRoute && onCalculateRoute(group)}
                            className={clsx(
                                'w-full py-4 rounded-2xl flex items-center justify-center gap-3 text-xs font-black uppercase tracking-widest transition-all active:scale-[0.98] shadow-xl',
                                isDark
                                    ? 'bg-blue-600 text-white shadow-blue-900/40 hover:bg-blue-500'
                                    : 'bg-blue-600 text-white shadow-blue-500/30 hover:bg-blue-700'
                            )}
                        >
                            {isCalculating ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <RocketLaunchIcon className="w-4 h-4" />
                            )}
                            В МАРШРУТ
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
