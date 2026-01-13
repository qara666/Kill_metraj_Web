import React from 'react';
import { clsx } from 'clsx';
import {
    PlayIcon,
    ArrowPathIcon,
    Cog6ToothIcon
} from '@heroicons/react/24/outline';


interface AutoPlannerControlsProps {
    isPlanning: boolean;
    onPlan: () => void;
    onSettings: () => void;
    hasData: boolean;
    ordersCount: number;
    planButtonLabel: string;
    isDark: boolean;
    trafficAdvisory: 'critical' | 'high' | 'moderate' | null;
    trafficPreset: any;
    lastPlanPreset: any | null;
    planTrafficImpact: any | null;
}

export const AutoPlannerControls: React.FC<AutoPlannerControlsProps> = React.memo(({
    isPlanning,
    onPlan,
    onSettings,
    hasData,
    ordersCount,
    planButtonLabel,
    isDark,
    trafficAdvisory,
    trafficPreset,
    lastPlanPreset,
    planTrafficImpact
}) => {
    return (
        <div className="space-y-4">
            {/* Панель с пресетом трафика (если есть данные) */}
            {trafficPreset && (
                <div className={clsx(
                    'rounded-xl p-4 border transition-all',
                    trafficPreset.mode === 'gridlock'
                        ? (isDark ? 'bg-red-900/20 border-red-800 text-red-100' : 'bg-red-50 border-red-200 text-red-900')
                        : trafficPreset.mode === 'busy'
                            ? (isDark ? 'bg-orange-900/20 border-orange-800 text-orange-100' : 'bg-orange-50 border-orange-200 text-orange-900')
                            : (isDark ? 'bg-green-900/20 border-green-800 text-green-100' : 'bg-green-50 border-green-200 text-green-900')
                )}>
                    {trafficPreset.mode !== 'free' && (
                        <div className="flex items-center gap-2 mb-2 font-bold">
                            {trafficPreset.mode === 'gridlock' && <span>🛑</span>}
                            {trafficPreset.mode === 'busy' && <span>⚠️</span>}
                            <span>
                                {trafficPreset.mode === 'gridlock' ? 'КРИТИЧЕСКИЙ ТРАФИК' : 'ПЛОТНЫЙ ТРАФИК'}
                            </span>
                        </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span>Режим: {trafficPreset.mode === 'gridlock' ? '⚠️ Критический' : trafficPreset.mode === 'busy' ? '⛔ Плотный' : '✅ Умеренный'}</span>
                        <span>Макс. стопов: {trafficPreset.recommendedMaxStops}</span>
                        <span>Лимит дистанции: {trafficPreset.maxDistanceCap} км</span>
                        <span>Буфер: +{trafficPreset.bufferMinutes} мин</span>
                    </div>
                    <div className="text-[11px] font-medium">
                        {trafficPreset.note}
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-3">
                <button
                    onClick={onPlan}
                    disabled={isPlanning || !hasData || ordersCount === 0}
                    className={clsx(
                        'relative w-full px-8 py-5 rounded-3xl font-black text-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-95 shadow-xl',
                        isPlanning || !hasData || ordersCount === 0
                            ? (isDark ? 'bg-gray-700/50 text-gray-400 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed')
                            : trafficAdvisory === 'critical'
                                ? 'bg-gradient-to-r from-red-600 via-red-700 to-red-800 hover:from-red-500 hover:to-red-600 text-white shadow-red-500/40'
                                : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 text-white shadow-blue-500/40'
                    )}
                >
                    <div className="flex items-center justify-center gap-3">
                        {isPlanning ? (
                            <>
                                <ArrowPathIcon className="w-6 h-6 animate-spin" />
                                <span>Планирование маршрутов...</span>
                            </>
                        ) : (
                            <>
                                <PlayIcon className="w-6 h-6" />
                                <span>{planButtonLabel}</span>
                            </>
                        )}
                    </div>
                    {!isPlanning && ordersCount > 0 && (
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-white/20 to-transparent opacity-0 hover:opacity-100 transition-opacity"></div>
                    )}
                </button>

                <div className="flex justify-end">
                    <button
                        onClick={onSettings}
                        className={clsx(
                            "flex items-center gap-2 px-4 py-2 rounded-lg transition-all font-medium text-sm",
                            isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                        )}
                    >
                        <Cog6ToothIcon className="w-4 h-4" />
                        Доп. настройки
                    </button>
                </div>
            </div>

            {lastPlanPreset && (
                <div className={clsx(
                    'mt-3 rounded-lg p-4 border text-xs space-y-1',
                    isDark ? 'border-indigo-800 bg-indigo-900/20 text-indigo-100' : 'border-indigo-200 bg-indigo-50 text-indigo-800'
                )}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="font-semibold text-sm">Применённый режим трафика: {lastPlanPreset.mode === 'gridlock' ? 'Стоим' : lastPlanPreset.mode === 'busy' ? 'Плотный' : 'Свободный'}</span>
                        <span>Буфер +{lastPlanPreset.bufferMinutes} мин</span>
                    </div>
                    <div>Стопов ≤ {lastPlanPreset.recommendedMaxStops} · Дистанция ≤ {lastPlanPreset.maxDistanceCap} км · Время ≤ {lastPlanPreset.maxRouteDurationCap} мин</div>
                    <div>{lastPlanPreset.note}</div>
                </div>
            )}

            {planTrafficImpact && (
                <div className={clsx(
                    'mt-3 rounded-lg p-4 border text-xs space-y-1',
                    isDark ? 'border-amber-800 bg-amber-900/20 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-800'
                )}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="font-semibold text-sm">Влияние пробок на маршруты</span>
                        <span>Режим: {planTrafficImpact.presetMode}</span>
                    </div>
                    <div>Суммарная задержка: {planTrafficImpact.totalDelay.toFixed(1)} мин · Критических маршрутов: {planTrafficImpact.criticalRoutes}</div>
                    <div>Средняя скорость по сегментам: {planTrafficImpact.avgSegmentSpeed} км/ч</div>
                    {planTrafficImpact.slowestRoute && (
                        <div>Самый медленный маршрут: {planTrafficImpact.slowestRoute}</div>
                    )}
                    <div>Запас по буферу: +{planTrafficImpact.bufferMinutes} мин на каждую цепочку.</div>
                </div>
            )}
        </div>
    );
});
