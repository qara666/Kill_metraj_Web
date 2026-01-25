import React, { useMemo, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { VariableSizeList as List } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { TruckIcon } from '@heroicons/react/24/outline';
import { RouteCard } from './RouteCard';
import { calculateRouteEfficiencyMetrics, suggestRouteImprovements } from '../../utils/routes/routeEfficiency';

interface RouteResultsViewProps {
    plannedRoutes: any[];
    isDark: boolean;
    selectedRoute: any | null;
    setSelectedRoute: (route: any | null) => void;
    setSelectedOrder: (order: any) => void;
    enableNotifications: boolean;
    onExpandRoute: (route: any) => void;
}

export const RouteResultsView: React.FC<RouteResultsViewProps> = React.memo(({
    plannedRoutes,
    isDark,
    selectedRoute,
    setSelectedRoute,
    setSelectedOrder,
    enableNotifications,
    onExpandRoute
}) => {
    const listRef = useRef<any>(null);
    const routeEfficiencyMetrics = useMemo(() => calculateRouteEfficiencyMetrics(plannedRoutes), [plannedRoutes]);
    const efficiencySuggestions = useMemo(() => suggestRouteImprovements(routeEfficiencyMetrics), [routeEfficiencyMetrics]);

    // Sort routes: "Не назначен" first, then others
    const sortedRoutes = useMemo(() => {
        return [...plannedRoutes].sort((a, b) => {
            if (a.name === 'Не назначен') return -1;
            if (b.name === 'Не назначен') return 1;
            return 0; // Keep original order for others
        });
    }, [plannedRoutes]);

    // Group routes into pairs for 2-column layout
    const rows = useMemo(() => {
        const chunks = [];
        for (let i = 0; i < sortedRoutes.length; i += 2) {
            chunks.push(sortedRoutes.slice(i, i + 2));
        }
        return chunks;
    }, [sortedRoutes]);

    // Recalculate heights when selectedRoute changes
    useEffect(() => {
        if (listRef.current) {
            listRef.current.resetAfterIndex(0);
        }
    }, [selectedRoute, rows]);

    const getRowHeight = (index: number) => {
        const row = rows[index];
        const isSomeSelected = row.some(r => r.id === selectedRoute?.id);
        return isSomeSelected ? 700 : 280; // Heights based on RouteCard collapse/expand
    };

    if (plannedRoutes.length === 0) return null;

    const Row = React.memo(({ index, style }: { index: number, style: React.CSSProperties }) => {
        const row = rows[index];
        return (
            <div style={style} className="px-1 overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    {row.map((r: any) => (
                        <RouteCard
                            key={r.id}
                            route={r}
                            isDark={isDark}
                            isSelected={selectedRoute?.id === r.id}
                            onSelect={setSelectedRoute}
                            onOrderClick={setSelectedOrder}
                            enableNotifications={enableNotifications}
                            onExpand={() => onExpandRoute(r)}
                        />
                    ))}
                    {row.length === 1 && <div className="hidden lg:block" />}
                </div>
            </div>
        );
    });

    return (
        <div className="mt-8 flex flex-col h-[800px]">
            <div className="flex items-center justify-between mb-6 shrink-0">
                <h3 className={clsx('text-2xl font-bold flex items-center gap-3', isDark ? 'text-white' : 'text-gray-900')}>
                    <div className="p-2 rounded-xl bg-blue-500/10">
                        <TruckIcon className="w-6 h-6 text-blue-500" />
                    </div>
                    Оптимизированные маршруты
                </h3>
                <div className={clsx('px-4 py-2 rounded-xl text-sm font-medium border', isDark ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-200 text-gray-600')}>
                    Найдено <span className="text-blue-500">{plannedRoutes.length}</span> маршрутов
                </div>
            </div>

            {routeEfficiencyMetrics && (
                <div className={clsx('mb-8 p-6 rounded-2xl border-2 shrink-0', isDark ? 'border-teal-700/50 bg-teal-900/20' : 'border-teal-200 bg-teal-50/50')}>
                    <div className={clsx('text-lg font-semibold mb-4 flex items-center gap-2', isDark ? 'text-teal-300' : 'text-teal-700')}>
                        ⚡ Эффективность распределения
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
                        <MetricSummary label="Баланс нагрузки" value={`${((routeEfficiencyMetrics.balanceScore || 0) * 100).toFixed(0)}%`} isDark={isDark} />
                        <MetricSummary label="Использование" value={`${((routeEfficiencyMetrics.routeUtilization || 0) * 100).toFixed(0)}%`} isDark={isDark} />
                        <MetricSummary label="Средняя дистанция" value={`${(routeEfficiencyMetrics.avgDistancePerOrder / 1000).toFixed(1)} км`} isDark={isDark} />
                        <MetricSummary label="Общая эффективность" value={`${((routeEfficiencyMetrics.efficiencyScore || 0) * 100).toFixed(0)}%`} isDark={isDark} />
                    </div>
                    {efficiencySuggestions.length > 0 && (
                        <div className={clsx('p-4 rounded-xl', isDark ? 'bg-yellow-900/30 border border-yellow-700/50' : 'bg-yellow-50 border border-yellow-200')}>
                            <div className={clsx('text-sm font-semibold mb-2', isDark ? 'text-yellow-300' : 'text-yellow-700')}>💡 Предложения по улучшению:</div>
                            <ul className="space-y-1.5">
                                {efficiencySuggestions.map((suggestion: string, idx: number) => (
                                    <li key={idx} className={clsx('text-sm', isDark ? 'text-yellow-200' : 'text-yellow-800')}>
                                        • {suggestion}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            <div className="flex-1 min-h-0">
                <AutoSizer renderProp={({ height, width }: { height: number | undefined; width: number | undefined }) => (
                    <List
                        ref={listRef}
                        height={height ?? 0}
                        itemCount={rows.length}
                        itemSize={getRowHeight}
                        width={width ?? 0}
                        className="no-scrollbar"
                    >
                        {Row}
                    </List>
                )} />
            </div>
        </div>
    );
});

const MetricSummary = ({ label, value, isDark }: { label: string; value: string; isDark: boolean }) => (
    <div>
        <div className={clsx('text-xs opacity-70 mb-1', isDark ? 'text-gray-400' : 'text-gray-600')}>{label}</div>
        <div className={clsx('text-xl font-bold', isDark ? 'text-white' : 'text-gray-900')}>{value}</div>
    </div>
);
