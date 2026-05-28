import React from 'react';
import { clsx } from 'clsx';
import { ClockIcon } from '@heroicons/react/24/outline';
import { routeHistory, type RouteHistoryEntry } from '../../utils/routes/routeHistory';

interface HistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    isDark: boolean;
    routeHistoryEntries: RouteHistoryEntry[];
    setRouteHistoryEntries: (entries: RouteHistoryEntry[]) => void;
    setPlannedRoutes: (routes: any[]) => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
    isOpen,
    onClose,
    isDark,
    routeHistoryEntries,
    setRouteHistoryEntries,
    setPlannedRoutes
}) => {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80"
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
                        <ClockIcon className="w-8 h-8" />
                        <span>История оптимизаций</span>
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
                    {routeHistoryEntries.length === 0 ? (
                        <div className={clsx('text-center py-12', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            <p className="text-lg mb-2">История пуста</p>
                            <p className="text-sm">История оптимизаций будет сохраняться автоматически</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {routeHistoryEntries.map((entry) => (
                                <div
                                    key={entry.id}
                                    className={clsx(
                                        'p-6 rounded-xl border-2 transition-all hover:scale-[1.02] cursor-pointer',
                                        isDark ? 'border-gray-700 bg-gray-800/50 hover:border-gray-600' : 'border-gray-200 bg-white hover:border-gray-300'
                                    )}
                                    onClick={() => {
                                        setPlannedRoutes(entry.routes);
                                        onClose();
                                    }}
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <div className={clsx('font-bold text-lg mb-1', isDark ? 'text-white' : 'text-gray-900')}>
                                                {entry.name || `Оптимизация от ${new Date(entry.timestamp).toLocaleString('ru-RU')}`}
                                            </div>
                                            {entry.description && (
                                                <div className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>
                                                    {entry.description}
                                                </div>
                                            )}
                                        </div>
                                        <div className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                            {new Date(entry.timestamp).toLocaleString('ru-RU')}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                        <div className={clsx('p-3 rounded-lg', isDark ? 'bg-blue-900/30' : 'bg-blue-50')}>
                                            <div className="text-xs opacity-70 mb-1">Маршрутов</div>
                                            <div className="text-lg font-bold">{entry.stats.totalRoutes}</div>
                                        </div>
                                        <div className={clsx('p-3 rounded-lg', isDark ? 'bg-green-900/30' : 'bg-green-50')}>
                                            <div className="text-xs opacity-70 mb-1">Заказов</div>
                                            <div className="text-lg font-bold">{entry.stats.totalOrders}</div>
                                        </div>
                                        <div className={clsx('p-3 rounded-lg', isDark ? 'bg-orange-900/30' : 'bg-orange-50')}>
                                            <div className="text-xs opacity-70 mb-1">Расстояние</div>
                                            <div className="text-lg font-bold">{entry.stats.totalDistance.toFixed(1)}</div>
                                            <div className="text-xs opacity-70">км</div>
                                        </div>
                                        <div className={clsx('p-3 rounded-lg', isDark ? 'bg-purple-900/30' : 'bg-purple-50')}>
                                            <div className="text-xs opacity-70 mb-1">Время</div>
                                            <div className="text-lg font-bold">{entry.stats.totalDuration.toFixed(0)}</div>
                                            <div className="text-xs opacity-70">мин</div>
                                        </div>
                                        <div className={clsx('p-3 rounded-lg', isDark ? 'bg-indigo-900/30' : 'bg-indigo-50')}>
                                            <div className="text-xs opacity-70 mb-1">Эффективность</div>
                                            <div className="text-lg font-bold">{((entry.stats.avgEfficiency || 0) * 100).toFixed(0)}%</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            routeHistory.delete(entry.id);
                                            setRouteHistoryEntries(routeHistory.getAll());
                                        }}
                                        className={clsx(
                                            'mt-3 px-3 py-1 text-xs rounded-lg transition-colors',
                                            isDark ? 'bg-red-900/50 hover:bg-red-900/70 text-red-200' : 'bg-red-100 hover:bg-red-200 text-red-700'
                                        )}
                                    >
                                        Удалить
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
