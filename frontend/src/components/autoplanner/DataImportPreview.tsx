import React, { useMemo } from 'react';
import { clsx } from 'clsx';
import {
    ClipboardDocumentListIcon,
    UsersIcon,
    ArrowLeftIcon,
    CheckIcon
} from '@heroicons/react/24/outline';
import { ProcessedExcelData } from '../../types';
import { CourierImportCard } from './CourierImportCard';

interface DataImportPreviewProps {
    data: ProcessedExcelData;
    isDark: boolean;
    onBack: () => void;
    onConfirm: () => void;
}

export const DataImportPreview: React.FC<DataImportPreviewProps> = ({ data, isDark, onBack, onConfirm }) => {
    const [sortBy, setSortBy] = React.useState<'name' | 'orders'>('orders');

    const courierStats = useMemo(() => {
        const statsMap = new Map<string, any>();

        // Initialize stats for each courier
        data.couriers.forEach(c => {
            statsMap.set(c.name, {
                name: c.name,
                ordersCount: 0,
                totalSum: 0,
                vehicleType: c.vehicleType === 'motorcycle' ? 'Мото' : 'Авто',
                routesCount: 0,
                orders: []
            });
        });

        // Add "Unknown" / "Unassigned" if needed? 
        // For Dashboard API, usually everything is assigned if it comes from the dashboard, 
        // but we should handle orders that might not match a courier name exactly.

        data.orders.forEach(order => {
            const courierName = order.courierName || order.raw?.courierName || 'Не назначено';
            if (!statsMap.has(courierName)) {
                statsMap.set(courierName, {
                    name: courierName,
                    ordersCount: 0,
                    totalSum: 0,
                    vehicleType: '?',
                    routesCount: 0,
                    orders: []
                });
            }

            const stats = statsMap.get(courierName);
            stats.ordersCount++;

            // Extract price/sum. Usually 'totalPrice' or similar in raw data.
            const orderSum = parseFloat(order.totalPrice || order.raw?.totalPrice || order.raw?.['Сумма'] || 0);
            stats.totalSum += orderSum;
            stats.orders.push(order);
        });

        const result = Array.from(statsMap.values()).map(stats => ({
            ...stats,
            avgCheck: stats.ordersCount > 0 ? stats.totalSum / stats.ordersCount : 0,
            loadPerRoute: stats.routesCount > 0 ? stats.ordersCount / stats.routesCount : stats.ordersCount // fallback if routes not calculated yet
        }));

        if (sortBy === 'name') {
            return result.sort((a, b) => a.name.localeCompare(b.name));
        } else {
            return result.sort((a, b) => b.ordersCount - a.ordersCount);
        }
    }, [data, sortBy]);

    return (
        <div className="flex flex-col h-full space-y-6">
            {/* Orders Summary Section */}
            <div className={clsx(
                'p-5 rounded-3xl border transition-all flex items-center justify-between',
                isDark ? 'bg-slate-900/60 border-white/5 shadow-xl' : 'bg-white border-blue-50 shadow-sm'
            )}>
                <div className="flex items-center gap-4">
                    <ClipboardDocumentListIcon className={clsx('w-5 h-5', isDark ? 'text-blue-400' : 'text-blue-600')} />
                    <h2 className={clsx('text-lg font-black tracking-tight', isDark ? 'text-white' : 'text-slate-900')}>
                        Заказы ({data.orders.length})
                    </h2>
                </div>
                <div className="opacity-20">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                </div>
            </div>

            {/* Couriers Grid Section */}
            <div className={clsx(
                'flex-1 flex flex-col p-8 rounded-[2.5rem] border overflow-hidden relative',
                isDark ? 'bg-slate-900/60 border-white/5' : 'bg-gray-50/50 border-blue-50'
            )}>
                {/* Section Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <UsersIcon className={clsx('w-6 h-6', isDark ? 'text-emerald-400' : 'text-emerald-600')} />
                        <h2 className={clsx('text-xl font-black tracking-tight', isDark ? 'text-white' : 'text-slate-900')}>
                            Курьеры ({courierStats.length})
                        </h2>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className={clsx(
                            'flex p-1 rounded-xl',
                            isDark ? 'bg-slate-800' : 'bg-white shadow-sm border border-slate-100'
                        )}>
                            <button
                                onClick={() => setSortBy('name')}
                                className={clsx(
                                    'px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all',
                                    sortBy === 'name'
                                        ? (isDark ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white')
                                        : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')
                                )}
                            >
                                По имени
                            </button>
                            <button
                                onClick={() => setSortBy('orders')}
                                className={clsx(
                                    'px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1',
                                    sortBy === 'orders'
                                        ? (isDark ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white')
                                        : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')
                                )}
                            >
                                По заказам
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-y-auto px-1 -mx-1 custom-scrollbar pb-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {courierStats.map((stats, idx) => (
                            <CourierImportCard
                                key={idx}
                                stats={stats}
                                isDark={isDark}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className={clsx(
                'pt-6 border-t flex items-center justify-between gap-4 mt-auto',
                isDark ? 'border-slate-800' : 'border-slate-100'
            )}>
                <button
                    onClick={onBack}
                    className={clsx(
                        'flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all active:scale-95',
                        isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    )}
                >
                    <ArrowLeftIcon className="w-4 h-4" />
                    Назад
                </button>

                <button
                    onClick={onConfirm}
                    className={clsx(
                        'flex items-center gap-2 px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-xl',
                        isDark ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-900/20' : 'bg-slate-900 text-white hover:bg-slate-800 shadow-slate-200'
                    )}
                >
                    <CheckIcon className="w-4 h-4" />
                    Подтвердить и загрузить
                </button>
            </div>
        </div>
    );
};
