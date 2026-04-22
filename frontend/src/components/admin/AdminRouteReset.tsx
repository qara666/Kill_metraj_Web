import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { useTheme } from '../../contexts/ThemeContext';
import { clsx } from 'clsx';
import { API_URL } from '../../config/apiConfig';
import {
    TrashIcon,
    CalendarIcon,
    ArrowPathIcon,
    ExclamationTriangleIcon,
    CheckCircleIcon,
    ChartBarIcon,
} from '@heroicons/react/24/outline';

interface RouteStats {
    total: number;
    byDate: Record<string, number>;
    stale: number;
}

export const AdminRouteReset: React.FC = () => {
    const { isDark } = useTheme();
    const todayISO = format(new Date(), 'yyyy-MM-dd');

    const [selectedDate, setSelectedDate] = useState(todayISO);
    const [stats, setStats] = useState<RouteStats | null>(null);
    const [loadingStats, setLoadingStats] = useState(false);
    const [clearing, setClearing] = useState<'day' | 'stale' | 'all' | null>(null);
    const [lastCleared, setLastCleared] = useState<string | null>(null);

    const token = () => localStorage.getItem('km_access_token') || '';

    const loadStats = useCallback(async () => {
        setLoadingStats(true);
        try {
            const allRes = await fetch(`${API_URL}/api/routes/calculated?limit=10000`, {
                headers: { Authorization: `Bearer ${token()}` }
            });
            const allData = await allRes.json();
            
            const allRoutes: any[] = allData?.data || [];
            const byDate: Record<string, number> = {};
            let staleCount = 0;
            
            allRoutes.forEach((r: any) => {
                const routeData = r.route_data || {};
                const dateKey = routeData?.target_date || routeData?.date || 'unknown';
                if (dateKey && dateKey !== 'unknown') {
                    byDate[dateKey] = (byDate[dateKey] || 0) + 1;
                }
                const tb = routeData?.deliveryWindow || routeData?.timeBlocks || routeData?.timeBlock || '';
                if (typeof tb === 'string' && tb.includes(' - ')) staleCount++;
            });

            setStats({
                total: allRoutes.length,
                byDate,
                stale: staleCount
            });
            console.log('[AdminRouteReset] Loaded', allRoutes.length, 'routes');
        } catch (e) {
            console.error('[AdminRouteReset] loadStats error:', e);
            setStats({ total: 0, byDate: {}, stale: 0 });
        } finally {
            setLoadingStats(false);
        }
    }, []);

    useEffect(() => {
        loadStats();
    }, [loadStats]);

    const clearForDate = async () => {
        if (!window.confirm(`Удалить ВСЕ маршруты за ${selectedDate}? Данные будут пересчитаны при следующем запуске.`)) return;
        setClearing('day');
        try {
            const res = await fetch(`${API_URL}/api/routes/all/calculated?date=${selectedDate}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token()}` }
            });
            const data = await res.json();
            if (data?.success) {
                toast.success(`Удалено ${data.deletedCount || 0} маршрутов`);
                await loadStats();
            } else {
                toast.error('Ошибка: ' + (data?.error || 'Unknown'));
            }
        } catch (e: any) {
            toast.error('Ошибка: ' + e?.message);
        } finally {
            setClearing(null);
        }
    };

    const clearStale = async () => {
        if (!window.confirm('Удалить устаревшие маршруты со старым форматом ключа?')) return;
        setClearing('stale');
        try {
            const res = await fetch(`${API_URL}/api/turbo/reset-stale-routes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify({})
            });
            const data = await res.json();
            if (data?.success) {
                toast.success(data.message || 'Устаревшие маршруты удалены');
                await loadStats();
            } else {
                toast.error('Ошибка: ' + (data?.error || 'Unknown'));
            }
        } catch (e: any) {
            toast.error('Ошибка: ' + e?.message);
        } finally {
            setClearing(null);
        }
    };

    const sortedDates = Object.entries(stats?.byDate || {})
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 10);

    const selectedDateCount = stats?.byDate?.[selectedDate] ?? 0;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                    { label: 'Всего маршрутов', value: loadingStats ? '...' : (stats?.total ?? 0), color: isDark ? 'text-blue-400' : 'text-blue-600' },
                    { label: 'За дату', value: loadingStats ? '...' : selectedDateCount, color: selectedDateCount > 0 ? (isDark ? 'text-amber-400' : 'text-amber-600') : (isDark ? 'text-gray-500' : 'text-gray-400') },
                    { label: 'Устаревших', value: loadingStats ? '...' : (stats?.stale ?? 0), color: (stats?.stale ?? 0) > 0 ? (isDark ? 'text-red-400' : 'text-red-600') : (isDark ? 'text-emerald-400' : 'text-emerald-600') }
                ].map(item => (
                    <div key={item.label} className={clsx('rounded-2xl p-4 flex flex-col gap-2 border', isDark ? 'bg-white/[0.03] border-white/5' : 'bg-slate-50 border-slate-100')}>
                        <div className={clsx('flex items-center gap-2', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            <span className="text-[11px] font-bold uppercase tracking-widest">{item.label}</span>
                        </div>
                        <span className={clsx('text-3xl font-black tabular-nums', item.color)}>{item.value}</span>
                    </div>
                ))}
            </div>

            {lastCleared && (
                <div className={clsx('flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium', isDark ? 'bg-emerald-900/20 border-emerald-700/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700')}>
                    <CheckCircleIcon className="w-4 h-4 shrink-0" />
                    {lastCleared}
                </div>
            )}

            <div className={clsx('rounded-2xl border p-5 space-y-4', isDark ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200')}>
                <h3 className={clsx('text-sm font-black uppercase tracking-widest', isDark ? 'text-gray-300' : 'text-gray-700')}>
                    Управление маршрутами
                </h3>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                        <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={e => setSelectedDate(e.target.value)}
                            className={clsx('pl-9 pr-4 h-10 rounded-xl border text-sm font-semibold outline-none', isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-slate-200')}
                        />
                    </div>
                    <button onClick={() => setSelectedDate(todayISO)} className={clsx('px-3 h-10 rounded-xl border text-xs font-bold', isDark ? 'border-white/10 text-gray-400' : 'border-slate-200 text-gray-500')}>
                        Сегодня
                    </button>
                    <button onClick={loadStats} disabled={loadingStats} className={clsx('flex items-center gap-2 px-3 h-10 rounded-xl border text-xs font-bold', isDark ? 'border-white/10 text-gray-400' : 'border-slate-200 text-gray-500')}>
                        <ArrowPathIcon className={clsx('w-4 h-4', loadingStats && 'animate-spin')} />
                        Обновить
                    </button>
                </div>

                <div className="flex flex-wrap gap-3">
                    <button onClick={clearForDate} disabled={!!clearing} className={clsx('flex items-center gap-2 px-5 h-10 rounded-xl border font-bold text-[12px] uppercase', clearing === 'day' ? 'bg-amber-600/30 border-amber-500/40' : 'bg-amber-600/10 border-amber-500/20 text-amber-400')}>
                        <TrashIcon className="w-4 h-4" />
                        Очистить {selectedDate} ({selectedDateCount})
                    </button>
                    <button onClick={clearStale} disabled={!!clearing || (stats?.stale ?? 0) === 0} className={clsx('flex items-center gap-2 px-5 h-10 rounded-xl border font-bold text-[12px] uppercase', clearing === 'stale' ? 'bg-red-600/30 border-red-500/40' : 'bg-red-600/10 border-red-500/20 text-red-400')}>
                        <ExclamationTriangleIcon className="w-4 h-4" />
                        Сброс устаревших ({(stats?.stale ?? 0)})
                    </button>
                </div>
            </div>

            {sortedDates.length > 0 && (
                <div className={clsx('rounded-2xl border overflow-hidden', isDark ? 'border-white/5' : 'border-slate-200')}>
                    <div className={clsx('px-4 py-3 border-b text-[11px] font-black uppercase tracking-widest', isDark ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50')}>
                        Маршруты по датам
                    </div>
                    <div className={clsx('divide-y', isDark ? 'divide-white/5' : 'divide-slate-100')}>
                        {sortedDates.map(([date, count]) => (
                            <div key={date} onClick={() => setSelectedDate(date)} className={clsx('flex items-center justify-between px-4 py-3 cursor-pointer', date === selectedDate ? (isDark ? 'bg-blue-600/10' : 'bg-blue-50') : (isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50'))}>
                                <span className={clsx('text-sm font-bold', date === selectedDate ? (isDark ? 'text-blue-300' : 'text-blue-700') : (isDark ? 'text-gray-200' : 'text-gray-800'))}>
                                    {date} {date === todayISO && <span className="ml-2 text-[10px] text-emerald-500">сегодня</span>}
                                </span>
                                <span className="text-xs font-black">{count} маршр.</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};