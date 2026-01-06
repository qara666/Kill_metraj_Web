import React, { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import { RouteMap } from './RouteMap';
import {
    MapIcon,
    ListBulletIcon,
    ChevronRightIcon,
    MapPinIcon,
    ClockIcon,
    TruckIcon
} from '@heroicons/react/24/outline';
import type { Route } from '../../types';

interface MapSectionProps {
    routes: Route[];
    selectedRoute: Route | null;
    onRouteSelect: (route: Route) => void;
    onOrderClick?: (order: any) => void;
    isDark: boolean;
    className?: string;
}

export const MapSection: React.FC<MapSectionProps> = ({
    routes,
    selectedRoute,
    onRouteSelect,
    onOrderClick,
    isDark,
    className
}) => {
    const [viewMode, setViewMode] = useState<'map' | 'list'>('map');

    const activeRouteForMap = useMemo(() => {
        if (selectedRoute) return selectedRoute;
        return routes.length > 0 ? routes[0] : null;
    }, [selectedRoute, routes]);

    return (
        <div className={clsx(
            'flex flex-col rounded-3xl overflow-hidden border-2 shadow-xl h-[600px]',
            isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-blue-100',
            className
        )}>
            {/* Header / Tabs */}
            <div className={clsx(
                'flex items-center justify-between px-6 py-4 border-b',
                isDark ? 'border-gray-700 bg-gray-800/50' : 'border-blue-50 bg-blue-50/30'
            )}>
                <div className="flex items-center gap-3">
                    <div className={clsx(
                        'p-2 rounded-xl',
                        isDark ? 'bg-blue-500/20' : 'bg-blue-100'
                    )}>
                        {viewMode === 'map' ? (
                            <MapIcon className="w-5 h-5 text-blue-500" />
                        ) : (
                            <ListBulletIcon className="w-5 h-5 text-blue-500" />
                        )}
                    </div>
                    <h3 className={clsx('font-bold', isDark ? 'text-white' : 'text-gray-900')}>
                        {viewMode === 'map' ? 'Визуализация маршрута' : 'Список маршрутов'}
                    </h3>
                </div>

                <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-xl">
                    <button
                        onClick={() => setViewMode('map')}
                        aria-label="Переключить на вид карты"
                        aria-pressed={viewMode === 'map'}
                        className={clsx(
                            'flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
                            viewMode === 'map'
                                ? 'bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-400'
                                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                        )}
                    >
                        Карта
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        aria-label="Переключить на вид списка"
                        aria-pressed={viewMode === 'list'}
                        className={clsx(
                            'flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
                            viewMode === 'list'
                                ? 'bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-400'
                                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                        )}
                    >
                        Список
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 relative overflow-hidden">
                {viewMode === 'map' ? (
                    <div className="h-full w-full">
                        {activeRouteForMap ? (
                            <RouteMap
                                route={activeRouteForMap}
                                onMarkerClick={onOrderClick}
                            />
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-500 p-8 text-center">
                                <MapIcon className="w-16 h-16 mb-4 opacity-20" />
                                <p>Нет маршрутов для отображения на карте</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="h-full overflow-y-auto p-4 space-y-3">
                        {routes.length > 0 ? (
                            routes.map((route) => (
                                <button
                                    key={route._id}
                                    onClick={() => onRouteSelect(route)}
                                    aria-label={`Выбрать маршрут ${route._id.slice(-6)}`}
                                    aria-selected={selectedRoute?._id === route._id}
                                    className={clsx(
                                        'w-full text-left p-4 rounded-2xl border-2 transition-all group',
                                        selectedRoute?._id === route._id
                                            ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20'
                                            : 'border-transparent bg-gray-50 dark:bg-gray-700/50 hover:border-gray-200 dark:hover:border-gray-600'
                                    )}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            <TruckIcon className="w-4 h-4 text-blue-500" />
                                            <span className={clsx('font-bold text-sm', isDark ? 'text-white' : 'text-gray-900')}>
                                                Маршрут #{route._id.slice(-6)}
                                            </span>
                                        </div>
                                        <ChevronRightIcon className={clsx(
                                            'w-4 h-4 transition-transform group-hover:translate-x-0.5',
                                            selectedRoute?._id === route._id ? 'text-blue-500' : 'text-gray-400'
                                        )} />
                                    </div>

                                    <div className="grid grid-cols-2 gap-y-2">
                                        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                                            <MapPinIcon className="w-3.5 h-3.5" />
                                            <span>{route.stopsCount} остановок</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                                            <ClockIcon className="w-3.5 h-3.5" />
                                            <span>{(Number(route.totalDuration) / 60).toFixed(0)} мин</span>
                                        </div>
                                        <div className="col-span-2 text-xs text-gray-400 dark:text-gray-500 truncate">
                                            {(route.startAddress || '').split(',')[1] || route.startAddress || ''} → {(route.endAddress || '').split(',')[1] || route.endAddress || ''}
                                        </div>
                                    </div>
                                </button>
                            ))
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-500 p-8 text-center">
                                <ListBulletIcon className="w-16 h-16 mb-4 opacity-20" />
                                <p>Список маршрутов пуст</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
