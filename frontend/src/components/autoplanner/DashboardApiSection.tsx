import React, { useState } from 'react';
import { clsx } from 'clsx';
import {
    CloudArrowDownIcon,
    ChevronDownIcon,
    ClockIcon,
    ArrowPathIcon,
    CheckCircleIcon,
    ExclamationCircleIcon
} from '@heroicons/react/24/outline';
import { useAutoPlannerStore } from '../../stores/useAutoPlannerStore';
import { useTheme } from '../../contexts/ThemeContext';

export const DashboardApiSection: React.FC = () => {
    const { isDark } = useTheme();
    const [isExpanded, setIsExpanded] = useState<boolean>(false);

    // Store connection
    const {
        apiAutoRefreshEnabled,
        setApiAutoRefreshEnabled,
        apiTimeDeliveryBeg,
        setApiTimeDeliveryBeg,
        apiTimeDeliveryEnd,
        setApiTimeDeliveryEnd,
        apiSyncStatus,
        apiLastSyncTime,
        triggerApiManualSync
    } = useAutoPlannerStore();

    const formatTimeAgo = (timestamp: number | null) => {
        if (!timestamp) return 'Никогда';
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return `${seconds} сек назад`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes} мин назад`;
        const hours = Math.floor(minutes / 60);
        return `${hours} ч назад`;
    };

    const getStatusIcon = () => {
        switch (apiSyncStatus) {
            case 'syncing':
                return <ArrowPathIcon className="w-5 h-5 animate-spin text-blue-500" />;
            case 'error':
                return <ExclamationCircleIcon className="w-5 h-5 text-red-500" />;
            case 'idle':
                return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            {/* Header Section (Collapsible) */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className={clsx(
                    'rounded-3xl p-8 shadow-2xl border-2 overflow-hidden relative cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]',
                    isDark
                        ? 'bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 border-gray-700'
                        : 'bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 border-cyan-200'
                )}
            >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-600/10 via-teal-600/10 to-blue-600/10 opacity-50"></div>
                <div className="relative z-10">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className={clsx(
                                'p-4 rounded-2xl shadow-lg',
                                isDark
                                    ? 'bg-gradient-to-br from-cyan-600 to-blue-600'
                                    : 'bg-gradient-to-br from-cyan-500 to-blue-600'
                            )}>
                                <CloudArrowDownIcon className="w-8 h-8 text-white" />
                            </div>
                            <div>
                                <h2 className={clsx(
                                    'text-3xl font-bold mb-1 bg-gradient-to-r bg-clip-text text-transparent',
                                    isDark
                                        ? 'from-cyan-400 to-blue-400'
                                        : 'from-cyan-600 to-blue-600'
                                )}>
                                    Автообновление с фаста (API Dashboard)
                                </h2>
                                <p className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>
                                    {apiAutoRefreshEnabled
                                        ? `Включено. ${apiSyncStatus === 'idle' ? `Обновлено: ${formatTimeAgo(apiLastSyncTime)}` : 'Синхронизация...'}`
                                        : 'Автообновление выключено'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            {/* Status Pill */}
                            {apiAutoRefreshEnabled && (
                                <div className={clsx(
                                    'flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border',
                                    isDark ? 'bg-gray-900/50 border-gray-600' : 'bg-white/50 border-cyan-200'
                                )}>
                                    {getStatusIcon()}
                                    <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                                        {apiSyncStatus === 'syncing' && 'Синхронизация...'}
                                        {apiSyncStatus === 'error' && 'Ошибка'}
                                        {apiSyncStatus === 'idle' && 'Активно'}
                                    </span>
                                </div>
                            )}
                            <ChevronDownIcon className={clsx(
                                'w-8 h-8 transition-transform duration-300',
                                isDark ? 'text-gray-400' : 'text-gray-600',
                                isExpanded ? 'rotate-180' : ''
                            )} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Expanded Content */}
            <div className={clsx(
                'transition-all duration-500 overflow-hidden',
                isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
            )}>
                <div className={clsx(
                    'rounded-lg shadow-sm border p-6 space-y-6',
                    isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                )}>
                    {/* Enable Toggle */}
                    <div className={clsx(
                        'flex items-center justify-between p-4 rounded-xl border',
                        isDark ? 'bg-gray-900/30 border-gray-700' : 'bg-gray-50 border-gray-100'
                    )}>
                        <div className="flex items-center gap-3">
                            <div className={clsx(
                                "w-10 h-6 rounded-full cursor-pointer transition-colors relative",
                                apiAutoRefreshEnabled ? "bg-blue-600" : (isDark ? "bg-gray-600" : "bg-gray-300")
                            )} onClick={() => setApiAutoRefreshEnabled(!apiAutoRefreshEnabled)}>
                                <div className={clsx(
                                    "absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform",
                                    apiAutoRefreshEnabled ? "translate-x-4" : "translate-x-0"
                                )}></div>
                            </div>
                            <span className={clsx('font-medium', isDark ? 'text-gray-200' : 'text-gray-800')}>
                                Включить автообновление
                            </span>
                        </div>

                        <button
                            onClick={() => triggerApiManualSync()}
                            disabled={apiSyncStatus === 'syncing'}
                            className={clsx(
                                'text-sm px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-2',
                                isDark
                                    ? 'border-gray-600 hover:bg-gray-700 text-gray-300'
                                    : 'border-gray-300 hover:bg-gray-50 text-gray-700'
                            )}
                        >
                            <ArrowPathIcon className={clsx("w-4 h-4", apiSyncStatus === 'syncing' && "animate-spin")} />
                            Обновить сейчас
                        </button>
                    </div>

                    {/* Time Window Inputs */}
                    <div>
                        <h3 className={clsx('text-sm font-semibold mb-3 uppercase tracking-wider', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            Время доставки (окно)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Start Time */}
                            <div>
                                <label className={clsx('block text-xs font-medium mb-1.5', isDark ? 'text-gray-400' : 'text-gray-600')}>
                                    <ClockIcon className="w-3 h-3 inline mr-1" />
                                    Начало
                                </label>
                                <input
                                    type="datetime-local"
                                    value={apiTimeDeliveryBeg}
                                    onChange={(e) => setApiTimeDeliveryBeg(e.target.value)}
                                    className={clsx(
                                        'w-full px-4 py-2.5 rounded-xl border transition-all',
                                        isDark
                                            ? 'bg-gray-900 border-gray-600 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                                            : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                                    )}
                                />
                                <p className={clsx('mt-1 text-xs', isDark ? 'text-gray-500' : 'text-gray-400')}>
                                    Оставьте пустым, чтобы не ограничивать начало
                                </p>
                            </div>

                            {/* End Time */}
                            <div>
                                <label className={clsx('block text-xs font-medium mb-1.5', isDark ? 'text-gray-400' : 'text-gray-600')}>
                                    <ClockIcon className="w-3 h-3 inline mr-1" />
                                    Конец
                                </label>
                                <input
                                    type="datetime-local"
                                    value={apiTimeDeliveryEnd}
                                    onChange={(e) => setApiTimeDeliveryEnd(e.target.value)}
                                    className={clsx(
                                        'w-full px-4 py-2.5 rounded-xl border transition-all',
                                        isDark
                                            ? 'bg-gray-900 border-gray-600 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                                            : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                                    )}
                                />
                                <p className={clsx('mt-1 text-xs', isDark ? 'text-gray-500' : 'text-gray-400')}>
                                    Оставьте пустым, чтобы не ограничивать конец
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
