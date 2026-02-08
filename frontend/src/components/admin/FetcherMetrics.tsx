import React, { useState, useEffect } from 'react';
import { ChartBarIcon, ArrowPathIcon, ClockIcon, ServerIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';
import { useTheme } from '../../contexts/ThemeContext';
import { authService } from '../../utils/auth/authService';

interface MetricsData {
    success: boolean;
    timestamp: string;
    cache: {
        total_entries: number;
        unique_divisions: number;
        unique_dates: number;
        last_update: string;
        oldest_entry: string;
    };
    statusChanges: {
        last24h: {
            total_changes: number;
            unique_orders: number;
            last_change: string;
        };
        topTransitions: Array<{
            old_status: string;
            new_status: string;
            count: number;
        }>;
    };
    systemInfo: {
        nodeVersion: string;
        platform: string;
        uptime: number;
        memoryUsage: {
            rss: number;
            heapTotal: number;
            heapUsed: number;
            external: number;
        };
    };
}

export const FetcherMetrics: React.FC = () => {
    const { isDark } = useTheme();
    const [metrics, setMetrics] = useState<MetricsData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    const fetchMetrics = async () => {
        setIsLoading(true);
        try {
            const token = authService.getAccessToken();
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api/v1'}/dashboard/metrics`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (data.success) {
                setMetrics(data);
                setLastUpdate(new Date());
            } else {
                throw new Error(data.error || 'Ошибка загрузки метрик');
            }
        } catch (error) {
            console.error('Metrics fetch error:', error);
            toast.error(error instanceof Error ? error.message : 'Ошибка загрузки метрик');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchMetrics();
        const interval = setInterval(fetchMetrics, 60000); // Update every minute
        return () => clearInterval(interval);
    }, []);

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    const formatUptime = (seconds: number) => {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${days}д ${hours}ч ${minutes}м`;
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleString('ru-RU', {
            timeZone: 'Europe/Kiev',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (!metrics) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <ChartBarIcon className="w-6 h-6 text-indigo-500" />
                    <div>
                        <h3 className={clsx('font-semibold text-lg', isDark ? 'text-gray-100' : 'text-gray-900')}>
                            Метрики Fetcher
                        </h3>
                        {lastUpdate && (
                            <p className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                Обновлено: {lastUpdate.toLocaleTimeString('ru-RU')}
                            </p>
                        )}
                    </div>
                </div>
                <button
                    onClick={fetchMetrics}
                    disabled={isLoading}
                    className={clsx(
                        'flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors',
                        isDark
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                            : 'bg-indigo-500 hover:bg-indigo-600 text-white',
                        'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                >
                    <ArrowPathIcon className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
                    Обновить
                </button>
            </div>

            {/* Cache Stats */}
            <div className={clsx(
                'p-6 rounded-xl border',
                isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            )}>
                <h4 className={clsx('font-semibold mb-4 flex items-center gap-2', isDark ? 'text-gray-100' : 'text-gray-900')}>
                    <ServerIcon className="w-5 h-5 text-blue-500" />
                    Статистика Кэша
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <div className={clsx('text-xs uppercase font-semibold mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            Всего записей
                        </div>
                        <div className="text-2xl font-bold text-blue-500">
                            {metrics.cache.total_entries}
                        </div>
                    </div>
                    <div>
                        <div className={clsx('text-xs uppercase font-semibold mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            Отделений
                        </div>
                        <div className="text-2xl font-bold text-green-500">
                            {metrics.cache.unique_divisions}
                        </div>
                    </div>
                    <div>
                        <div className={clsx('text-xs uppercase font-semibold mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            Уникальных дат
                        </div>
                        <div className="text-2xl font-bold text-purple-500">
                            {metrics.cache.unique_dates}
                        </div>
                    </div>
                    <div>
                        <div className={clsx('text-xs uppercase font-semibold mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            Последнее обновление
                        </div>
                        <div className={clsx('text-sm font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>
                            {formatDate(metrics.cache.last_update)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Status Changes */}
            <div className={clsx(
                'p-6 rounded-xl border',
                isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            )}>
                <h4 className={clsx('font-semibold mb-4 flex items-center gap-2', isDark ? 'text-gray-100' : 'text-gray-900')}>
                    <ClockIcon className="w-5 h-5 text-orange-500" />
                    Изменения Статусов (24ч)
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                    <div>
                        <div className={clsx('text-xs uppercase font-semibold mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            Всего изменений
                        </div>
                        <div className="text-2xl font-bold text-orange-500">
                            {metrics.statusChanges.last24h.total_changes}
                        </div>
                    </div>
                    <div>
                        <div className={clsx('text-xs uppercase font-semibold mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            Уникальных заказов
                        </div>
                        <div className="text-2xl font-bold text-teal-500">
                            {metrics.statusChanges.last24h.unique_orders}
                        </div>
                    </div>
                    <div>
                        <div className={clsx('text-xs uppercase font-semibold mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            Последнее изменение
                        </div>
                        <div className={clsx('text-sm font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>
                            {formatDate(metrics.statusChanges.last24h.last_change)}
                        </div>
                    </div>
                </div>

                {/* Top Transitions */}
                {metrics.statusChanges.topTransitions.length > 0 && (
                    <div>
                        <div className={clsx('text-sm font-semibold mb-3', isDark ? 'text-gray-300' : 'text-gray-700')}>
                            Топ переходов статусов:
                        </div>
                        <div className="space-y-2">
                            {metrics.statusChanges.topTransitions.map((transition, idx) => (
                                <div
                                    key={idx}
                                    className={clsx(
                                        'flex items-center justify-between p-3 rounded-lg',
                                        isDark ? 'bg-gray-700/50' : 'bg-gray-50'
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className={clsx(
                                            'px-2 py-1 rounded text-xs font-medium',
                                            isDark ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-700'
                                        )}>
                                            {transition.old_status || 'NULL'}
                                        </span>
                                        <span className="text-gray-400">→</span>
                                        <span className={clsx(
                                            'px-2 py-1 rounded text-xs font-medium',
                                            isDark ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700'
                                        )}>
                                            {transition.new_status}
                                        </span>
                                    </div>
                                    <span className={clsx(
                                        'font-bold text-lg',
                                        isDark ? 'text-gray-300' : 'text-gray-700'
                                    )}>
                                        {transition.count}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* System Info */}
            <div className={clsx(
                'p-6 rounded-xl border',
                isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            )}>
                <h4 className={clsx('font-semibold mb-4 flex items-center gap-2', isDark ? 'text-gray-100' : 'text-gray-900')}>
                    <ServerIcon className="w-5 h-5 text-indigo-500" />
                    Системная Информация
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <div className={clsx('text-xs uppercase font-semibold mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            Node.js
                        </div>
                        <div className={clsx('text-sm font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>
                            {metrics.systemInfo.nodeVersion}
                        </div>
                    </div>
                    <div>
                        <div className={clsx('text-xs uppercase font-semibold mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            Uptime
                        </div>
                        <div className={clsx('text-sm font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>
                            {formatUptime(metrics.systemInfo.uptime)}
                        </div>
                    </div>
                    <div>
                        <div className={clsx('text-xs uppercase font-semibold mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            Heap Used
                        </div>
                        <div className={clsx('text-sm font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>
                            {formatBytes(metrics.systemInfo.memoryUsage.heapUsed)}
                        </div>
                    </div>
                    <div>
                        <div className={clsx('text-xs uppercase font-semibold mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            Heap Total
                        </div>
                        <div className={clsx('text-sm font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>
                            {formatBytes(metrics.systemInfo.memoryUsage.heapTotal)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
