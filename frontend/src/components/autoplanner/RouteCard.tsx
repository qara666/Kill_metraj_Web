import React, { useMemo } from 'react';
import { clsx } from 'clsx';
import {
    InboxIcon,
    TruckIcon,
    ClockIcon,
    MapPinIcon,
    ChartBarIcon,
    PlayIcon,
    ArrowsPointingOutIcon
} from '@heroicons/react/24/outline';
import { RouteMap } from './RouteMap';
import { getKitchenTime, getPlannedTime } from '../../utils/data/timeUtils';
import { exportToGoogleMaps, exportToWaze, exportToPDF } from '../../utils/routes/routeExport';
import { generateRouteNotifications, formatNotificationForDisplay } from '../../utils/ui/notifications';
import { calculateRouteEfficiencyMetrics } from '../../utils/routes/routeEfficiency';

interface RouteCardProps {
    route: any;
    isDark: boolean;
    isSelected: boolean;
    onSelect: (route: any | null) => void;
    onOrderClick: (order: any) => void;
    enableNotifications: boolean;
    onExpand: () => void;
}

export const RouteCard: React.FC<RouteCardProps> = React.memo(({
    route,
    isDark,
    isSelected,
    onSelect,
    onOrderClick,
    enableNotifications,
    onExpand
}) => {
    const isUnassigned = route.name === 'Не назначено';
    const efficiencyMetrics = useMemo(() => calculateRouteEfficiencyMetrics([route]), [route]);

    const notifications = useMemo(() => {
        if (!enableNotifications) return [];
        // Preferences are hardcoded here for simplicity, or could be passed as prop
        return generateRouteNotifications(route, { enableWarnings: true, enableTrafficWarnings: true });
    }, [route, enableNotifications]);

    return (
        <div
            className={clsx(
                'rounded-3xl p-6 border-2 transition-all duration-200 transform hover:scale-[1.005] relative overflow-hidden',
                isSelected
                    ? (isDark
                        ? (isUnassigned
                            ? 'border-yellow-500 bg-gradient-to-br from-yellow-900/40 via-orange-900/30 to-red-900/40 ring-4 ring-yellow-500/50 shadow-lg'
                            : 'border-blue-500 bg-gradient-to-br from-blue-900/40 via-indigo-900/30 to-purple-900/40 ring-4 ring-blue-500/50 shadow-lg')
                        : (isUnassigned
                            ? 'border-yellow-500 bg-gradient-to-br from-yellow-50 via-orange-50 to-red-50 ring-4 ring-yellow-500/30 shadow-lg'
                            : 'border-blue-500 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 ring-4 ring-blue-500/30 shadow-lg'))
                    : (isDark
                        ? (isUnassigned
                            ? 'border-yellow-700/50 bg-gradient-to-br from-yellow-900/40 to-orange-900/40 hover:border-yellow-600 hover:shadow-md'
                            : 'border-gray-700/50 bg-gradient-to-br from-gray-800/60 to-gray-900/60 hover:border-gray-600 hover:shadow-md')
                        : (isUnassigned
                            ? 'border-yellow-200 bg-gradient-to-br from-yellow-50/50 to-orange-50/50 hover:border-yellow-400 hover:shadow-md'
                            : 'border-gray-200 bg-gradient-to-br from-white to-gray-50/50 hover:border-blue-300 hover:shadow-md'))
            )}
        >
            <div className={clsx(
                'absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20',
                isSelected
                    ? (isUnassigned ? 'bg-gradient-to-br from-yellow-500 to-orange-600' : 'bg-gradient-to-br from-blue-500 to-purple-500')
                    : 'bg-gradient-to-br from-gray-400 to-gray-600'
            )}></div>

            <div className="relative z-10 flex items-start justify-between mb-4">
                <div
                    className="flex-1 cursor-pointer"
                    onClick={() => onSelect(isSelected ? null : route)}
                >
                    <div className="flex items-center gap-3 mb-4">
                        <div className={clsx(
                            'p-3 rounded-2xl shadow-lg',
                            isSelected
                                ? (isDark
                                    ? (isUnassigned ? 'bg-gradient-to-br from-yellow-600 to-orange-600' : 'bg-gradient-to-br from-blue-600 to-indigo-600')
                                    : (isUnassigned ? 'bg-gradient-to-br from-yellow-500 to-orange-500' : 'bg-gradient-to-br from-blue-500 to-indigo-500'))
                                : (isDark ? 'bg-gradient-to-br from-gray-700 to-gray-800' : 'bg-gradient-to-br from-gray-200 to-gray-300')
                        )}>
                            {isUnassigned ? (
                                <InboxIcon className={clsx('w-6 h-6', isSelected ? 'text-white' : (isDark ? 'text-gray-300' : 'text-gray-700'))} />
                            ) : (
                                <TruckIcon className={clsx('w-6 h-6', isSelected ? 'text-white' : (isDark ? 'text-gray-300' : 'text-gray-700'))} />
                            )}
                        </div>
                        <div className="flex-1">
                            <div className={clsx('text-xl font-bold mb-1', isDark ? 'text-white' : 'text-gray-900')}>
                                {route.name}
                            </div>
                            {route.hasCriticalTraffic && (
                                <div className={clsx('inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium', isDark ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-700')}>
                                    <span>️</span>
                                    <span>Критические пробки</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mb-4">
                        <StatsCard icon={<MapPinIcon className="w-4 h-4" />} label="Точек" value={route.stopsCount || (1 + (route.waypoints?.length || 0))} color="blue" isDark={isDark} isSelected={isSelected} />
                        <StatsCard icon={<ClockIcon className="w-4 h-4" />} label="Время" value={route.totalDurationMin || '?'} color="orange" isDark={isDark} isSelected={isSelected} delay={route.totalTrafficDelay} critical={route.hasCriticalTraffic} />
                        <StatsCard icon={<MapPinIcon className="w-4 h-4" />} label="Дистанция" value={route.totalDistanceKm || '?'} color="green" isDark={isDark} isSelected={isSelected} suffix="км" />
                    </div>

                    {route.routeChainFull && route.routeChainFull.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                            {route.routeChainFull.map((fullOrder: any, idx: number) => (
                                <button
                                    key={idx}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onOrderClick({
                                            ...fullOrder,
                                            readyAt: getKitchenTime(fullOrder),
                                            deadlineAt: getPlannedTime(fullOrder),
                                            raw: fullOrder.raw || fullOrder
                                        });
                                    }}
                                    className={clsx(
                                        'px-2 py-1 rounded-md text-[10px] font-medium transition-colors border',
                                        isDark
                                            ? 'bg-gray-700/50 border-gray-600 hover:bg-gray-600 text-gray-300'
                                            : 'bg-gray-100 border-gray-200 hover:bg-gray-200 text-gray-700'
                                    )}
                                >
                                    {fullOrder.orderNumber || fullOrder.raw?.orderNumber || idx + 1}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onExpand();
                        }}
                        className="p-2 rounded-xl hover:bg-blue-500/10 text-blue-400"
                        title="Подробнее"
                    >
                        <ArrowsPointingOutIcon className="w-5 h-5" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); exportToGoogleMaps(route); }} className="p-2 rounded-xl hover:bg-blue-500/10 text-blue-400" title="Google Maps"><PlayIcon className="w-5 h-5" /></button>
                    <button onClick={(e) => { e.stopPropagation(); exportToWaze(route); }} className="p-2 rounded-xl hover:bg-blue-500/10 text-blue-400" title="Waze"></button>
                    <button onClick={(e) => { e.stopPropagation(); exportToPDF(route); }} className="p-2 rounded-xl hover:bg-blue-500/10 text-blue-400" title="PDF"></button>
                </div>
            </div>

            {isSelected && (
                <div className="mt-6 space-y-6 animate-fadeIn">
                    <hr className={isDark ? 'border-gray-700' : 'border-gray-200'} />

                    <div>
                        <h4 className={clsx('text-sm font-bold mb-3 flex items-center gap-2', isDark ? 'text-white' : 'text-gray-900')}>
                            <ChartBarIcon className="w-4 h-4 text-purple-400" />
                            Эффективность маршрута
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                            <MetricCard label="Использование" value={`${(efficiencyMetrics.routeUtilization * 100).toFixed(0)}%`} isDark={isDark} />
                            <MetricCard label="Баланс" value={`${(efficiencyMetrics.balanceScore * 100).toFixed(0)}%`} isDark={isDark} />
                        </div>
                    </div>

                    <RouteMap route={route} onMarkerClick={onOrderClick} />

                    {notifications.length > 0 && (
                        <div className="space-y-2">
                            {notifications.map((n: any, i: number) => {
                                const display = formatNotificationForDisplay(n);
                                return (
                                    <div key={i} className={clsx('p-3 rounded-xl border-l-4 text-xs',
                                        display.color === 'red' ? 'bg-red-500/10 border-red-500 text-red-500' :
                                            display.color === 'orange' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-500' :
                                                'bg-blue-500/10 border-blue-500 text-blue-500')}>
                                        <div className="font-bold flex items-center gap-1 mb-1">
                                            <span>{display.icon}</span>
                                            <span>{display.title}</span>
                                        </div>
                                        <div>{display.message}</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});

const StatsCard = ({ icon, label, value, color, isDark, isSelected, delay, critical, suffix }: any) => {
    const colors = {
        blue: isDark ? 'text-blue-400' : 'text-blue-600',
        orange: isDark ? 'text-orange-400' : 'text-orange-600',
        green: isDark ? 'text-green-400' : 'text-green-600',
    };
    const bgColors = {
        blue: isSelected ? (isDark ? 'border-blue-600/50 bg-blue-900/30' : 'border-blue-300 bg-blue-50/80') : (isDark ? 'border-gray-700/50 bg-gray-800/50' : 'border-gray-200 bg-white/80'),
        orange: isSelected ? (isDark ? 'border-orange-600/50 bg-orange-900/30' : 'border-orange-300 bg-orange-50/80') : (isDark ? 'border-gray-700/50 bg-gray-800/50' : 'border-gray-200 bg-white/80'),
        green: isSelected ? (isDark ? 'border-green-600/50 bg-green-900/30' : 'border-green-300 bg-green-50/80') : (isDark ? 'border-gray-700/50 bg-gray-800/50' : 'border-gray-200 bg-white/80'),
    };

    return (
        <div className={clsx('rounded-xl p-3 border-2 transition-all', bgColors[color as keyof typeof bgColors])}>
            <div className="flex items-center gap-1.5 mb-1.5">
                {React.cloneElement(icon, { className: clsx('w-3.5 h-3.5', colors[color as keyof typeof colors]) })}
                <div className={clsx('text-[10px] font-medium uppercase tracking-wider', isDark ? 'text-gray-400' : 'text-gray-500')}>{label}</div>
            </div>
            <div className={clsx('text-lg font-bold leading-tight', colors[color as keyof typeof colors])}>
                {value}
                {suffix && <span className="text-[10px] ml-0.5 opacity-70">{suffix}</span>}
            </div>
            {delay > 0 && (
                <div className={clsx('text-[10px] mt-0.5 font-medium', critical ? 'text-red-500' : 'text-orange-500')}>
                    +{delay.toFixed(0)}м
                </div>
            )}
        </div>
    );
};

const MetricCard = ({ label, value, isDark }: any) => (
    <div className={clsx('p-3 rounded-xl border', isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200')}>
        <div className={clsx('text-[10px] font-medium mb-1', isDark ? 'text-gray-500' : 'text-gray-500')}>{label}</div>
        <div className={clsx('text-sm font-bold', isDark ? 'text-white' : 'text-gray-900')}>{value}</div>
    </div>
);
