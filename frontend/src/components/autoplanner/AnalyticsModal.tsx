import React from 'react';
import { clsx } from 'clsx';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import { RouteAnalytics } from '../../types';

interface AnalyticsModalProps {
    isOpen: boolean;
    onClose: () => void;
    isDark: boolean;
    routeAnalytics: RouteAnalytics | null;
}

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({
    isOpen,
    onClose,
    isDark,
    routeAnalytics
}) => {
    if (!isOpen || !routeAnalytics) return null;

    return (
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className={clsx(
                    'relative w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col mx-4',
                    isDark ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border-2 border-gray-700' : 'bg-gradient-to-br from-white via-gray-50 to-white border-2 border-gray-200'
                )}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={clsx('px-8 py-6 border-b flex items-center justify-between', isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50/50')}>
                    <h2 className={clsx('text-2xl font-bold flex items-center gap-3', isDark ? 'text-white' : 'text-gray-900')}>
                        <ChartBarIcon className="w-8 h-8" />
                        <span>Аналитика маршрутов</span>
                    </h2>
                    <button
                        onClick={onClose}
                        className={clsx('p-3 rounded-xl hover:opacity-70 transition-all', isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700')}
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-8">
                    <div className="space-y-6">
                        {/* Общая статистика */}
                        <div className={clsx('grid grid-cols-2 md:grid-cols-4 gap-4', isDark ? 'text-gray-200' : 'text-gray-800')}>
                            <div className={clsx('p-4 rounded-xl border-2', isDark ? 'border-blue-600/30 bg-blue-900/20' : 'border-blue-200 bg-blue-50/50')}>
                                <div className="text-xs font-medium mb-1 opacity-70">Маршрутов</div>
                                <div className="text-2xl font-bold">{routeAnalytics.totalRoutes}</div>
                            </div>
                            <div className={clsx('p-4 rounded-xl border-2', isDark ? 'border-green-600/30 bg-green-900/20' : 'border-green-200 bg-green-50/50')}>
                                <div className="text-xs font-medium mb-1 opacity-70">Заказов</div>
                                <div className="text-2xl font-bold">{routeAnalytics.totalOrders}</div>
                            </div>
                            <div className={clsx('p-4 rounded-xl border-2', isDark ? 'border-orange-600/30 bg-orange-900/20' : 'border-orange-200 bg-orange-50/50')}>
                                <div className="text-xs font-medium mb-1 opacity-70">Расстояние</div>
                                <div className="text-2xl font-bold">{routeAnalytics.totalDistance.toFixed(1)} <span className="text-sm font-normal">км</span></div>
                            </div>
                            <div className={clsx('p-4 rounded-xl border-2', isDark ? 'border-purple-600/30 bg-purple-900/20' : 'border-purple-200 bg-purple-50/50')}>
                                <div className="text-xs font-medium mb-1 opacity-70">Время</div>
                                <div className="text-2xl font-bold">{routeAnalytics.totalDuration.toFixed(0)} <span className="text-sm font-normal">мин</span></div>
                            </div>
                        </div>

                        {/* Анализ эффективности и времени */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className={clsx('p-6 rounded-xl border-2', isDark ? 'border-indigo-600/30 bg-indigo-900/20' : 'border-indigo-200 bg-indigo-50')}>
                                <h3 className={clsx('text-lg font-bold mb-4', isDark ? 'text-indigo-300' : 'text-indigo-700')}>Распределение эффективности</h3>
                                <div className="space-y-4">
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm opacity-70">Средняя эффективность:</span>
                                            <span className="font-bold">{((routeAnalytics.avgEfficiency || 0) * 100).toFixed(1)}%</span>
                                        </div>
                                        <div className="w-full bg-gray-700 rounded-full h-2.5 overflow-hidden">
                                            <div
                                                className="bg-indigo-500 h-2.5 rounded-full transition-all duration-1000"
                                                style={{ width: `${(routeAnalytics.avgEfficiency || 0) * 100}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                        <div className={clsx('p-2 rounded', isDark ? 'bg-green-900/30' : 'bg-green-50')}>
                                            <div className="font-bold">Высокая</div>
                                            <div>{routeAnalytics.efficiencyDistribution.good}</div>
                                        </div>
                                        <div className={clsx('p-2 rounded', isDark ? 'bg-yellow-900/30' : 'bg-yellow-50')}>
                                            <div className="font-bold">Средняя</div>
                                            <div>{routeAnalytics.efficiencyDistribution.average}</div>
                                        </div>
                                        <div className={clsx('p-2 rounded', isDark ? 'bg-red-900/30' : 'bg-red-50')}>
                                            <div className="font-bold">Низкая</div>
                                            <div>{routeAnalytics.efficiencyDistribution.poor}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className={clsx('p-6 rounded-xl border-2', isDark ? 'border-blue-600/30 bg-blue-900/20' : 'border-blue-200 bg-blue-50')}>
                                <h3 className={clsx('text-lg font-bold mb-4', isDark ? 'text-blue-300' : 'text-blue-700')}>Распределение времени</h3>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="opacity-70">Среднее время маршрута:</span>
                                        <span className="font-bold">
                                            {(routeAnalytics.totalDuration / routeAnalytics.totalRoutes).toFixed(0)} мин
                                        </span>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-xs">
                                            <div className="w-16 opacity-70">&lt; 60 мин</div>
                                            <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                                                <div className="bg-green-500 h-full" style={{ width: '45%' }}></div>
                                            </div>
                                            <div className="w-8 text-right font-mono">45%</div>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs">
                                            <div className="w-16 opacity-70">60-90 мин</div>
                                            <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                                                <div className="bg-yellow-500 h-full" style={{ width: '35%' }}></div>
                                            </div>
                                            <div className="w-8 text-right font-mono">35%</div>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs">
                                            <div className="w-16 opacity-70">&gt; 90 мин</div>
                                            <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                                                <div className="bg-red-500 h-full" style={{ width: '20%' }}></div>
                                            </div>
                                            <div className="w-8 text-right font-mono">20%</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Временные метрики */}
                        <div className={clsx('p-6 rounded-xl border-2', isDark ? 'border-orange-600/30 bg-orange-900/20' : 'border-orange-200 bg-orange-50')}>
                            <h3 className={clsx('text-lg font-bold mb-4', isDark ? 'text-orange-300' : 'text-orange-700')}>Соблюдение дедлайнов</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className={clsx('p-3 rounded-lg', isDark ? 'bg-green-900/30' : 'bg-green-50')}>
                                    <div className="text-xs opacity-70">Вовремя</div>
                                    <div className="text-xl font-bold">{routeAnalytics.timeWindowCompliance.onTime}</div>
                                </div>
                                <div className={clsx('p-3 rounded-lg', isDark ? 'bg-red-900/30' : 'bg-red-50')}>
                                    <div className="text-xs opacity-70">Просрочено</div>
                                    <div className="text-xl font-bold">{routeAnalytics.timeWindowCompliance.late}</div>
                                </div>
                                <div className={clsx('p-3 rounded-lg', isDark ? 'bg-yellow-900/30' : 'bg-yellow-50')}>
                                    <div className="text-xs opacity-70">Раньше срока</div>
                                    <div className="text-xl font-bold">{routeAnalytics.timeWindowCompliance.early}</div>
                                </div>
                                <div className={clsx('p-3 rounded-lg', isDark ? 'bg-gray-700/30' : 'bg-gray-50')}>
                                    <div className="text-xs opacity-70">Без дедлайна</div>
                                    <div className="text-xl font-bold">{routeAnalytics.timeWindowCompliance.noDeadline}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
