import React, { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { clsx } from 'clsx';
import { Cog6ToothIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

interface RouteSettingsPanelProps {
    maxRouteDurationMin: number;
    setMaxRouteDurationMin: (v: number) => void;
    maxRouteDistanceKm: number;
    setMaxRouteDistanceKm: (v: number) => void;
    maxWaitPerStopMin: number;
    setMaxWaitPerStopMin: (v: number) => void;
    maxStopsPerRoute: number;
    setMaxStopsPerRoute: (v: number) => void;
    routePlanningSettings: any;
    updatePlanningSettings: (updates: any) => void;
    selectedCourierType: string;
    setSelectedCourierType: (v: any) => void;
    enableScheduleFiltering: boolean;
    setEnableScheduleFiltering: (v: boolean) => void;
    courierSchedulesCount: number;
    onManageSchedules: () => void;
    onUploadSchedules: (file: File) => void;
    vehicleLimits: any;
}

export const RouteSettingsPanel: React.FC<RouteSettingsPanelProps> = React.memo(({
    maxRouteDurationMin,
    setMaxRouteDurationMin,
    maxRouteDistanceKm,
    setMaxRouteDistanceKm,
    maxWaitPerStopMin,
    setMaxWaitPerStopMin,
    maxStopsPerRoute,
    setMaxStopsPerRoute,
    routePlanningSettings,
    updatePlanningSettings,
    selectedCourierType,
    setSelectedCourierType,
    enableScheduleFiltering,
    setEnableScheduleFiltering,
    courierSchedulesCount,
    onManageSchedules,
    onUploadSchedules,
    vehicleLimits
}) => {
    const { isDark } = useTheme();
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="space-y-4">
            {/* Основные фильтры */}
            <div className={clsx(
                'rounded-xl p-4 border-2 transition-all hover:shadow-lg',
                isDark
                    ? 'border-purple-700/50 bg-gradient-to-br from-gray-800/50 to-gray-900/50'
                    : 'border-purple-200 bg-gradient-to-br from-purple-50/50 to-pink-50/50'
            )}>
                <div className="flex items-center gap-2 mb-3">
                    <div className={clsx('p-1.5 rounded-lg', isDark ? 'bg-purple-600/20' : 'bg-purple-100')}>
                        <Cog6ToothIcon className={clsx('w-5 h-5', isDark ? 'text-purple-400' : 'text-purple-600')} />
                    </div>
                    <div className={clsx('text-sm font-semibold', isDark ? 'text-white' : 'text-gray-900')}>
                        Фильтры маршрута
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                    <label className="flex items-center justify-between gap-2 text-xs col-span-2">
                        <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Длительность (мин)</span>
                        <input
                            type="number"
                            value={maxRouteDurationMin}
                            onChange={(e) => setMaxRouteDurationMin(Number(e.target.value))}
                            className={clsx('w-20 rounded-lg p-1.5 text-right text-xs', isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300')}
                        />
                    </label>
                    <label className="flex items-center justify-between gap-2 text-xs">
                        <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Дистанция (км)</span>
                        <input
                            type="number"
                            value={maxRouteDistanceKm}
                            onChange={(e) => setMaxRouteDistanceKm(Number(e.target.value))}
                            className={clsx('w-20 rounded-lg p-1.5 text-right text-xs', isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300')}
                        />
                    </label>
                    <label className="flex items-center justify-between gap-2 text-xs">
                        <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Макс. точек</span>
                        <input
                            type="number"
                            value={maxStopsPerRoute}
                            onChange={(e) => setMaxStopsPerRoute(Number(e.target.value))}
                            className={clsx('w-20 rounded-lg p-1.5 text-right text-xs', isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300')}
                        />
                    </label>
                    <label className="flex items-center justify-between gap-2 text-xs col-span-2">
                        <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Ожидание (мин)</span>
                        <input
                            type="number"
                            value={maxWaitPerStopMin}
                            onChange={(e) => setMaxWaitPerStopMin(Number(e.target.value))}
                            className={clsx('w-20 rounded-lg p-1.5 text-right text-xs', isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300')}
                        />
                    </label>
                </div>
            </div>

            {/* Коллапсируемые настройки */}
            <div className={clsx('rounded-xl border', isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-gray-50')}>
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-black/5 rounded-t-xl"
                >
                    <div className={clsx('text-sm font-semibold flex items-center gap-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
                        <Cog6ToothIcon className="w-5 h-5" />
                        <span>Настройки построения</span>
                    </div>
                    <ChevronDownIcon className={clsx('w-5 h-5 transition-transform', isExpanded && 'rotate-180')} />
                </button>
                {isExpanded && (
                    <div className="p-4 space-y-4 border-t border-gray-700/50">
                        {/* Optimization Goal */}
                        <div>
                            <label className="block text-xs font-semibold mb-1">Цель оптимизации</label>
                            <select
                                value={routePlanningSettings.optimizationGoal}
                                onChange={(e) => updatePlanningSettings({ optimizationGoal: e.target.value })}
                                className={clsx('w-full rounded-lg p-1.5 text-xs', isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300')}
                            >
                                <option value="balance">Баланс (рекомендуется)</option>
                                <option value="distance">Минимум расстояния</option>
                                <option value="time">Минимум времени</option>
                            </select>
                        </div>

                        {/* Courier Type */}
                        <div>
                            <label className="block text-xs font-semibold mb-1">Тип курьера</label>
                            <select
                                value={selectedCourierType}
                                onChange={(e) => setSelectedCourierType(e.target.value)}
                                className={clsx('w-full rounded-lg p-1.5 text-xs', isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300')}
                            >
                                <option value="all">Все типы</option>
                                <option value="car">Авто (все зоны)</option>
                                <option value="motorcycle">Мото (до {vehicleLimits.motorcycle.maxDistanceKm} км)</option>
                            </select>
                        </div>

                        {/* Schedule */}
                        <div className="pt-2 border-t border-gray-700/50">
                            <label className="flex items-center gap-2 text-xs cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={enableScheduleFiltering}
                                    onChange={(e) => setEnableScheduleFiltering(e.target.checked)}
                                    className="rounded"
                                    disabled={courierSchedulesCount === 0}
                                />
                                <span className={clsx(courierSchedulesCount === 0 && 'opacity-50')}>Учитывать график работы ({courierSchedulesCount})</span>
                            </label>
                            <div className="flex gap-2 mt-2">
                                <button onClick={onManageSchedules} className="flex-1 px-2 py-1 text-[10px] bg-blue-600 text-white rounded">Управление</button>
                                <label className="flex-1 px-2 py-1 text-[10px] bg-green-600 text-white rounded text-center cursor-pointer">
                                    Загрузить Excel
                                    <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && onUploadSchedules(e.target.files[0])} />
                                </label>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});
