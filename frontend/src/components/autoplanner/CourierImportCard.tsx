import React from 'react';
import { clsx } from 'clsx';
import {
    TruckIcon,
    ArrowPathIcon
} from '@heroicons/react/24/outline';

interface CourierImportStats {
    name: string;
    ordersCount: number;
    totalSum: number;
    avgCheck: number;
    vehicleType: string;
    routesCount: number;
    loadPerRoute: number;
}

interface CourierImportCardProps {
    stats: CourierImportStats;
    isDark: boolean;
}

export const CourierImportCard: React.FC<CourierImportCardProps> = ({ stats, isDark }) => {
    const isHighLoad = stats.ordersCount > 20;

    return (
        <div className={clsx(
            'p-6 rounded-3xl border-2 transition-all duration-300 hover:shadow-xl',
            isDark
                ? 'bg-slate-900/40 border-slate-800 hover:border-blue-500/30'
                : 'bg-white border-slate-100 hover:border-blue-200 shadow-sm'
        )}>
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className={clsx(
                    'p-2.5 rounded-xl',
                    isDark ? 'bg-emerald-500/10 text-emerald-500' : 'bg-emerald-50 text-emerald-600'
                )}>
                    <TruckIcon className="w-5 h-5" />
                </div>
                <h3 className={clsx('text-lg font-black tracking-tight', isDark ? 'text-white' : 'text-slate-900')}>
                    {stats.name || 'Неизвестный'}
                </h3>
            </div>

            {/* Stats Grid */}
            <div className="space-y-3.5">
                <div className="flex justify-between items-center group">
                    <span className={clsx('text-xs font-bold uppercase tracking-widest opacity-40', isDark ? 'text-slate-400' : 'text-slate-500')}>
                        Заказов:
                    </span>
                    <span className={clsx('text-sm font-black', isDark ? 'text-white' : 'text-slate-900')}>
                        {stats.ordersCount}
                    </span>
                </div>

                <div className="flex justify-between items-center group">
                    <span className={clsx('text-xs font-bold uppercase tracking-widest opacity-40', isDark ? 'text-slate-400' : 'text-slate-500')}>
                        Общая сумма:
                    </span>
                    <span className={clsx('text-sm font-black text-emerald-500')}>
                        {Math.round(stats.totalSum).toLocaleString()} грн
                    </span>
                </div>

                <div className="flex justify-between items-center group">
                    <span className={clsx('text-xs font-bold uppercase tracking-widest opacity-40', isDark ? 'text-slate-400' : 'text-slate-500')}>
                        Средний чек:
                    </span>
                    <span className={clsx('text-sm font-black opacity-80', isDark ? 'text-slate-200' : 'text-slate-700')}>
                        {Math.round(stats.avgCheck).toLocaleString()} грн
                    </span>
                </div>

                <div className="flex justify-between items-center group">
                    <span className={clsx('text-xs font-bold uppercase tracking-widest opacity-40', isDark ? 'text-slate-400' : 'text-slate-500')}>
                        Транспорт:
                    </span>
                    <span className={clsx('text-sm font-black opacity-80', isDark ? 'text-slate-200' : 'text-slate-700')}>
                        {stats.vehicleType}
                    </span>
                </div>

                <div className="flex justify-between items-center group">
                    <span className={clsx('text-xs font-bold uppercase tracking-widest opacity-40', isDark ? 'text-slate-400' : 'text-slate-500')}>
                        Маршрутов:
                    </span>
                    <span className={clsx('text-sm font-black opacity-80', isDark ? 'text-slate-200' : 'text-slate-700')}>
                        {stats.routesCount}
                    </span>
                </div>

                <div className="flex justify-between items-center group">
                    <span className={clsx('text-xs font-bold uppercase tracking-widest opacity-40', isDark ? 'text-slate-400' : 'text-slate-500')}>
                        Загрузка (заказов/маршрут):
                    </span>
                    <div className="flex items-center gap-2">
                        <div className={clsx('h-1 w-12 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 p-[1px]')}>
                            <div
                                className={clsx('h-full rounded-full bg-blue-500')}
                                style={{ width: `${Math.min(100, (stats.loadPerRoute / 10) * 100)}%` }}
                            />
                        </div>
                        <span className={clsx('text-[10px] font-black', isDark ? 'text-blue-400' : 'text-blue-600')}>
                            {stats.loadPerRoute.toFixed(1)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Load Badge */}
            <div className="mt-6 pt-6 border-t border-slate-400/10">
                <div className={clsx(
                    'w-full py-2.5 rounded-2xl flex items-center justify-center gap-2 transition-all duration-500',
                    isHighLoad
                        ? (isDark ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-red-50 border border-red-100 text-red-600')
                        : (isDark ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400' : 'bg-blue-50 border border-blue-100 text-blue-600')
                )}>
                    {isHighLoad ? (
                        <ArrowPathIcon className="w-3.5 h-3.5 animate-spin-slow" />
                    ) : (
                        <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    )}
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                        {isHighLoad ? 'ВЫСОКАЯ НАГРУЗКА' : 'ПЛАНОВАЯ ЗАГРУЗКА'} ({stats.ordersCount})
                    </span>
                </div>
            </div>
        </div>
    );
};
