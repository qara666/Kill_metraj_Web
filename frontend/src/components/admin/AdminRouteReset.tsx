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

    // ── Load route stats ──────────────────────────────────────────────────
    const loadStats = useCallback(async () => {
        setLoadingStats(true);
        try {
            // Fetch all routes grouped by date
            const res = await fetch(`${API_URL}/api/routes/calculated?date=${selectedDate}&limit=2000`, {
                headers: { Authorization: `Bearer ${token()}` }
            });
            const data = await res.json();

            // Also fetch stale routes (old label format)
            const staleRes = await fetch(`${API_URL}/api/routes/calculated?date=&limit=5000`, {
                headers: { Authorization: `Bearer ${token()}` }
            });
            const staleData = await staleRes.json();

            const allRoutes: any[] = staleData?.data || [];
            const byDate: Record<string, number> = {};
            let staleCount = 0;
            allRoutes.forEach((r: any) => {
                const dateKey = r.targetDate || 'unknown';
                byDate[dateKey] = (byDate[dateKey] || 0) + 1;
                // Old format: timeBlocks like "11:20 - 11:49"
                const tb = r.timeBlocks || r.timeBlock || '';
                if (typeof tb === 'string' && tb.includes(' - ')) staleCount++;
            });

            setStats({
                total: allRoutes.length,
                byDate,
                stale: staleCount
            });
        } catch (e) {
            console.error('[AdminRouteReset] loadStats error:', e);
        } finally {
            setLoadingStats(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        loadStats();
    }, [loadStats]);

    // ── Clear routes for selected date ───────────────────────────────────
    const clearForDate = async () => {
        if (!window.confirm(`Удалить ВСЕ маршруты за ${selectedDate}? Данные будут пересчитаны при следующем запуске.`)) return;
        setClearing('day');
        try {
            const res = await fetch(`/api/routes/all/calculated?date=${selectedDate}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token()}` }
            });
            const data = await res.json();
            if (data?.success) {
                toast.success(`✅ Удалено ${data.deletedCount || 0} маршрутов за ${selectedDate}`);
                setLastCleared(`Удалено ${data.deletedCount || 0} маршрутов за ${selectedDate}`);
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

    // ── Clear stale routes (old time_block format) ────────────────────────
    const clearStale = async () => {
        if (!window.confirm('Удалить устаревшие маршруты со старым форматом ключа (вида "11:20 - 11:49")?\nЭто устранит дублирование маршрутов.')) return;
        setClearing('stale');
        try {
            const res = await fetch(`${API_URL}/api/turbo/reset-stale-routes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify({})
            });
            const data = await res.json();
            if (data?.success) {
                toast.success(data.message || `Устаревшие маршруты удалены`);
                setLastCleared(data.message || 'Устаревшие маршруты удалены');
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

    // ── UI helpers ───────────────────────────────────────────────────────
    const sortedDates = Object.entries(stats?.byDate || {})
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 10);

    const selectedDateCount = stats?.byDate?.[selectedDate] ?? 0;

    return (
        <div className="space-y-6">
            {/* Stats overview */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                    {
                        label: 'Всего маршрутов в БД',
                        value: loadingStats ? '…' : (stats?.total ?? '—'),
                        color: isDark ? 'text-blue-400' : 'text-blue-600',
                        icon: <ChartBarIcon className="w-5 h-5" />
                    },
                    {
                        label: 'За выбранную дату',
                        value: loadingStats ? '…' : selectedDateCount,
                        color: selectedDateCount > 0
                            ? (isDark ? 'text-amber-400' : 'text-amber-600')
                            : (isDark ? 'text-gray-500' : 'text-gray-400'),
                        icon: <CalendarIcon className="w-5 h-5" />
                    },
                    {
                        label: 'Устаревших (старый формат)',
                        value: loadingStats ? '…' : (stats?.stale ?? '—'),
                        color: (stats?.stale ?? 0) > 0
                            ? (isDark ? 'text-red-400' : 'text-red-600')
                            : (isDark ? 'text-emerald-400' : 'text-emerald-600'),
                        icon: (stats?.stale ?? 0) > 0
                            ? <ExclamationTriangleIcon className="w-5 h-5" />
                            : <CheckCircleIcon className="w-5 h-5" />
                    }
                ].map(({ label, value, color, icon }) => (
                    <div key={label} className={clsx(
                        'rounded-2xl p-4 flex flex-col gap-2 border',
                        isDark ? 'bg-white/[0.03] border-white/5' : 'bg-slate-50 border-slate-100'
                    )}>
                        <div className={clsx('flex items-center gap-2', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            {icon}
                            <span className="text-[11px] font-bold uppercase tracking-widest">{label}</span>
                        </div>
                        <span className={clsx('text-3xl font-black tabular-nums', color)}>{value}</span>
                    </div>
                ))}
            </div>

            {/* Last cleared notice */}
            {lastCleared && (
                <div className={clsx(
                    'flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium',
                    isDark ? 'bg-emerald-900/20 border-emerald-700/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                )}>
                    <CheckCircleIcon className="w-4 h-4 shrink-0" />
                    {lastCleared}
                </div>
            )}

            {/* Stale routes warning */}
            {(stats?.stale ?? 0) > 0 && (
                <div className={clsx(
                    'flex items-start gap-3 px-4 py-3 rounded-xl border',
                    isDark ? 'bg-red-900/20 border-red-700/30 text-red-300' : 'bg-red-50 border-red-200 text-red-700'
                )}>
                    <ExclamationTriangleIcon className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-bold text-sm">Обнаружены устаревшие маршруты ({stats!.stale} шт.)</p>
                        <p className="text-xs opacity-80 mt-0.5">
                            Маршруты со старым форматом ключа ("11:20 - 11:49") мешают корректному расчёту.
                            Удалите их и запустите пересчёт.
                        </p>
                    </div>
                </div>
            )}

            {/* Controls: date picker + action buttons */}
            <div className={clsx(
                'rounded-2xl border p-5 space-y-4',
                isDark ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200'
            )}>
                <h3 className={clsx('text-sm font-black uppercase tracking-widest', isDark ? 'text-gray-300' : 'text-gray-700')}>
                    Управление маршрутами
                </h3>

                {/* Date picker row */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                        <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={e => setSelectedDate(e.target.value)}
                            className={clsx(
                                'pl-9 pr-4 h-10 rounded-xl border text-sm font-semibold outline-none transition-all',
                                isDark
                                    ? 'bg-white/5 border-white/10 text-white focus:border-blue-500/50'
                                    : 'bg-white border-slate-200 text-gray-900 focus:border-blue-400 shadow-sm'
                            )}
                        />
                    </div>
                    <button
                        onClick={() => setSelectedDate(todayISO)}
                        className={clsx(
                            'px-3 h-10 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all',
                            selectedDate === todayISO
                                ? (isDark ? 'bg-blue-600 border-blue-600 text-white' : 'bg-blue-600 border-blue-600 text-white')
                                : (isDark ? 'bg-white/5 border-white/10 text-gray-400 hover:text-white' : 'bg-white border-slate-200 text-gray-500 hover:text-gray-900 shadow-sm')
                        )}
                    >
                        Сегодня
                    </button>
                    <button
                        onClick={loadStats}
                        disabled={loadingStats}
                        className={clsx(
                            'flex items-center gap-2 px-3 h-10 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all',
                            isDark ? 'bg-white/5 border-white/10 text-gray-400 hover:text-white' : 'bg-white border-slate-200 text-gray-500 hover:text-gray-900 shadow-sm'
                        )}
                    >
                        <ArrowPathIcon className={clsx('w-4 h-4', loadingStats && 'animate-spin')} />
                        Обновить
                    </button>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-3">
                    {/* Clear day */}
                    <button
                        onClick={clearForDate}
                        disabled={!!clearing || selectedDateCount === 0}
                        className={clsx(
                            'flex items-center gap-2 px-5 h-10 rounded-xl border font-bold text-[12px] uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed',
                            clearing === 'day'
                                ? (isDark ? 'bg-amber-600/30 border-amber-500/40 text-amber-300' : 'bg-amber-100 border-amber-200 text-amber-700')
                                : (isDark ? 'bg-amber-600/10 border-amber-500/20 text-amber-400 hover:bg-amber-600/20' : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 shadow-sm')
                        )}
                    >
                        <TrashIcon className={clsx('w-4 h-4', clearing === 'day' && 'animate-bounce')} />
                        Очистить {selectedDate}
                        {selectedDateCount > 0 && (
                            <span className={clsx('ml-1 px-1.5 py-0.5 rounded-md text-[10px] font-black',
                                isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-200 text-amber-800'
                            )}>{selectedDateCount}</span>
                        )}
                    </button>

                    {/* Clear stale */}
                    <button
                        onClick={clearStale}
                        disabled={!!clearing || (stats?.stale ?? 0) === 0}
                        className={clsx(
                            'flex items-center gap-2 px-5 h-10 rounded-xl border font-bold text-[12px] uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed',
                            clearing === 'stale'
                                ? (isDark ? 'bg-red-600/30 border-red-500/40 text-red-300' : 'bg-red-100 border-red-200 text-red-700')
                                : (isDark ? 'bg-red-600/10 border-red-500/20 text-red-400 hover:bg-red-600/20' : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100 shadow-sm')
                        )}
                    >
                        <ExclamationTriangleIcon className={clsx('w-4 h-4', clearing === 'stale' && 'animate-bounce')} />
                        Сброс устаревших
                        {(stats?.stale ?? 0) > 0 && (
                            <span className={clsx('ml-1 px-1.5 py-0.5 rounded-md text-[10px] font-black',
                                isDark ? 'bg-red-500/20 text-red-300' : 'bg-red-200 text-red-800'
                            )}>{stats!.stale}</span>
                        )}
                    </button>
                </div>
            </div>

            {/* Routes by date summary */}
            {sortedDates.length > 0 && (
                <div className={clsx(
                    'rounded-2xl border overflow-hidden',
                    isDark ? 'border-white/5' : 'border-slate-200'
                )}>
                    <div className={clsx(
                        'px-4 py-3 border-b text-[11px] font-black uppercase tracking-widest',
                        isDark ? 'bg-white/[0.02] border-white/5 text-gray-400' : 'bg-slate-50 border-slate-200 text-gray-500'
                    )}>
                        Маршруты в базе данных по датам
                    </div>
                    <div className={clsx('divide-y', isDark ? 'divide-white/5' : 'divide-slate-100')}>
                        {sortedDates.map(([date, count]) => (
                            <div
                                key={date}
                                onClick={() => setSelectedDate(date)}
                                className={clsx(
                                    'flex items-center justify-between px-4 py-3 cursor-pointer transition-all',
                                    date === selectedDate
                                        ? (isDark ? 'bg-blue-600/10' : 'bg-blue-50')
                                        : (isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50')
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={clsx(
                                        'w-2 h-2 rounded-full',
                                        date === todayISO ? 'bg-emerald-500' : (isDark ? 'bg-gray-600' : 'bg-gray-300')
                                    )} />
                                    <span className={clsx(
                                        'text-sm font-bold',
                                        date === selectedDate
                                            ? (isDark ? 'text-blue-300' : 'text-blue-700')
                                            : (isDark ? 'text-gray-200' : 'text-gray-800')
                                    )}>
                                        {date}
                                        {date === todayISO && <span className="ml-2 text-[10px] font-black text-emerald-500 uppercase">сегодня</span>}
                                    </span>
                                </div>
                                <span className={clsx(
                                    'px-2.5 py-1 rounded-lg text-xs font-black tabular-nums',
                                    date === selectedDate
                                        ? (isDark ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-700')
                                        : (isDark ? 'bg-white/5 text-gray-400' : 'bg-slate-100 text-gray-600')
                                )}>
                                    {count} маршр.
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
