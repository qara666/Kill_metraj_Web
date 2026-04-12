import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { ArrowPathIcon, CalendarIcon, CpuChipIcon, CheckCircleIcon, TrashIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { useTheme } from '../../contexts/ThemeContext';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../config/apiConfig';

// v7.0: SERVER-FIRST design.
// No more user-controlled start/stop.
// Server auto-calculates when FO data arrives.
// User only clicks "Синхронизировать" to pull fresh results.

export const DashboardApiSection: React.FC = () => {
    const { isDark } = useTheme();

    const apiSyncStatus = useDashboardStore(s => s.apiSyncStatus);
    const apiDateShift = useDashboardStore(s => s.apiDateShift);
    const setApiDateShift = useDashboardStore(s => s.setApiDateShift);
    const apiAutoRefreshEnabled = useDashboardStore(s => s.apiAutoRefreshEnabled);
    const setApiAutoRefreshEnabled = useDashboardStore(s => s.setApiAutoRefreshEnabled);
    const apiLastSyncTime = useDashboardStore(s => s.apiLastSyncTime);
    const apiNextSyncTime = useDashboardStore(s => s.apiNextSyncTime);
    const apiLastVisitDate = useDashboardStore(s => s.apiLastVisitDate);
    const setApiLastVisitDate = useDashboardStore(s => s.setApiLastVisitDate);
    const triggerApiManualSync = useDashboardStore(s => s.triggerApiManualSync);
    const setAutoRoutingStatus = useDashboardStore(s => s.setAutoRoutingStatus);

    const divisionId = useDashboardStore(s => s.divisionId);
    const { user } = useAuth();
    // v7.2: isGlobalView should be TRUE only for admins viewing 'all' divisions
    // Regular users ALWAYS read their own autoRoutingStatus (not the aggregate that's always empty)
    const isAdminGlobalView = user?.role === 'admin' && (divisionId === 'all' || !divisionId);
    const isGlobalView = isAdminGlobalView;

    const autoRoutingStatusObj = useDashboardStore(s => s.autoRoutingStatus);
    const aggregateStatusObj = useDashboardStore(s => s.aggregateRoutingStatus);
    // For regular users: always use autoRoutingStatusObj (gets specific division robot updates)
    // For admins in global view: use aggregateStatusObj
    const autoRoutingStatus = isGlobalView ? aggregateStatusObj : autoRoutingStatusObj;

    const { excelData, clearExcelData } = useExcelData();

    const selectedDate = apiDateShift;
    const setSelectedDate = setApiDateShift;

    // v7.2: Normalize any date format to YYYY-MM-DD for logic and <input type="date">
    const normalizeToISO = (dateValue: any): string => {
        if (!dateValue) return format(new Date(), 'yyyy-MM-dd');
        const d = typeof dateValue === 'string' ? dateValue : String(dateValue);
        if (d.includes('.')) {
            const [day, mon, year] = d.split('.');
            return `${year}-${mon}-${day}`;
        }
        return d;
    };

    const selectedDateISO = normalizeToISO(selectedDate);
    const todayISO = format(new Date(), 'yyyy-MM-dd');
    const [todayStatus, setTodayStatus] = React.useState<{ ready: boolean | null; date: string } | null>({ ready: null, date: todayISO });
    const fetchTodayStatus = React.useCallback(async () => {
      try {
        const token = localStorage.getItem('km_access_token');
        if (!token) return;
        const res = await fetch('/api/turbo/status_today', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.success) {
            setTodayStatus({ ready: data.ready, date: data.date || todayISO });
          }
        }
      } catch {
        // ignore
      }
    }, []);
    const isToday = selectedDateISO === todayISO;

    const isAdmin = user?.role === 'admin';
    const [timeLeft, setTimeLeft] = useState<string>('--:--');
    const [isSyncing, setIsSyncing] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    // v38.2: Reset stale routes (old label-format time_block) — admin only
    const resetStaleRoutes = React.useCallback(async () => {
        setIsResetting(true);
        try {
            const token = localStorage.getItem('km_access_token');
            const res = await fetch('/api/turbo/reset-stale-routes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ divisionId })
            });
            const data = await res.json();
            if (data?.success) {
                toast.success(data.message || `Сброс выполнен`);
                // Auto-trigger recalculation after clearing
                setTimeout(() => handleSync(), 800);
            } else {
                toast.error('Ошибка сброса: ' + (data?.error || 'Unknown'));
            }
        } catch (e: any) {
            toast.error('Ошибка: ' + e?.message);
        } finally {
            setIsResetting(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [divisionId]);

    // Auto-trigger calculation for today on first load (no date change)
    React.useEffect(() => {
        const todayISO = format(new Date(), 'yyyy-MM-dd');
        // If current view is today and NO data is loaded, perform an automatic sync
        const hasDataLoad = excelData && excelData.orders && excelData.orders.length > 0;
        if (!hasDataLoad && (selectedDate?.toString?.() === todayISO || selectedDateISO === todayISO)) {
            // Delay slightly to ensure the UI has mounted
            const t = setTimeout(() => {
                handleSync();
            }, 500);
            return () => clearTimeout(t);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // v7.0: Listen for real-time robot status updates
    React.useEffect(() => {
        const handleStatus = (e: any) => {
            const data = e.detail;
            if (data && typeof setAutoRoutingStatus === 'function') {
                setAutoRoutingStatus(data);
            }
        };
        window.addEventListener('km:robot:status', handleStatus);
        return () => window.removeEventListener('km:robot:status', handleStatus);
    }, [setAutoRoutingStatus]);

    // Periodically refresh today's status for UI indicator
    React.useEffect(() => {
      fetchTodayStatus();
      const t = setInterval(fetchTodayStatus, 30000);
      return () => clearInterval(t);
    }, [fetchTodayStatus]);

    // New Day Detection
    React.useEffect(() => {
        if (apiLastVisitDate !== todayISO) {
            setApiDateShift(todayISO);
            setApiLastVisitDate(todayISO);
        }
    }, [apiLastVisitDate, todayISO, setApiDateShift, setApiLastVisitDate]);

    // Countdown logic
    React.useEffect(() => {
        if (!apiAutoRefreshEnabled || !apiNextSyncTime) {
            setTimeLeft('--:--');
            return;
        }

        const updateTimer = () => {
            const now = Date.now();
            const diff = apiNextSyncTime - now;
            if (diff <= 0) { setTimeLeft('00:00'); return; }
            const minutes = Math.floor(diff / 1000 / 60);
            const seconds = Math.floor((diff / 1000) % 60);
            setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [apiNextSyncTime, apiAutoRefreshEnabled]);

    // v7.3: Helper to trigger server-side calculation after data is fetched
    const triggerServerCalculation = React.useCallback(async (dateISO: string) => {
        try {
            const token = localStorage.getItem('km_access_token');
            if (!token) {
                console.warn('[DashboardApiSection] No token - cannot trigger calculation');
                return;
            }

            const body = { 
                divisionId, 
                date: dateISO, 
                force: true,
                // v7.3: Priority flag to move this division to the front of the queue
                priority: true 
            };
            console.log('[DashboardApiSection] 📤 Sending turbo/priority request:', body);
            
            const res = await fetch('/api/turbo/priority', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body)
            });
            
            if (!res.ok) {
                let errMsg = 'Unknown error';
                let errData: any = null;
                try {
                    errData = await res.json();
                    errMsg = errData.error || errData.message || errData.details || `Status: ${res.status}`;
                } catch (e) {
                    errMsg = `Status: ${res.status}`;
                }
                
                // Robust handling for initialization-in-progress (503)
                if (res.status === 503) {
                    // Poll readiness for up to ~30s, then retry once if ready
                    let ready = false;
                    try {
                        for (let i = 0; i < 30; i++) {
                            const readyRes = await fetch('/api/turbo/ready', {
                                method: 'GET',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
                            });
                            if (readyRes.ok) {
                                const readyData = await readyRes.json();
                                ready = !!readyData?.ready;
                                if (ready) break;
                            }
                            await new Promise(r => setTimeout(r, 1000));
                        }
                    } catch {
                        // ignore readiness fetch errors, fall back to showing error below
                    }

                    if (ready) {
                        try {
                            const retryRes = await fetch('/api/turbo/priority', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                body: JSON.stringify(body)
                            });
                            if (retryRes.ok) {
                                const result = await retryRes.json();
                                console.log('[DashboardApiSection] ✅ turbo/priority retried successfully for', dateISO, '- result:', result);
                                toast.success('Расчет запущен!');
                                return;
                            } else {
                                try {
                                    const retryErr = await retryRes.json();
                                    errMsg = retryErr.error || retryErr.message || retryErr.details || `Status: ${retryRes.status}`;
                                } catch {
                                    errMsg = `Status: ${retryRes.status}`;
                                }
                            }
                        } catch (retryErr) {
                            errMsg = retryErr?.message || String(retryErr);
                        }
                    } else {
                        // Still not ready
                        toast.error('TurboCalculator ещё инициализируется, повторите позже');
                        return;
                    }
                }
                
                console.warn('[DashboardApiSection] turbo/priority error:', errMsg);
                toast.error('Ошибка запуска расчета: ' + errMsg);
            } else {
                const result = await res.json();
                console.log('[DashboardApiSection] ✅ turbo/priority triggered for', dateISO, '- result:', result);
                toast.success('Расчет запущен!');
            }
        } catch (e: any) {
            console.warn('[DashboardApiSection] Could not trigger server calculation:', e);
            toast.error('Ошибка: ' + (e?.message || e?.toString() || 'Unknown'));
        }
    }, [divisionId]);

    // v7.0: Main sync action — pull data, then trigger server calculation
    const handleSync = async () => {
        setIsSyncing(true);

        // v7.1: Clear local cache to ensure fresh state
        localStorage.removeItem('km_dashboard_processed_data_v3');
        localStorage.removeItem('km_dashboard_processed_data');
        localStorage.removeItem('km_routes');

        // Sync logic for current day or archive
        if (isToday) {
            setApiAutoRefreshEnabled(true);
        } else {
            setApiAutoRefreshEnabled(false);
        }

        // v5.205: Update robot status for fresh calculation - preserve existing counts to avoid flicker
        setAutoRoutingStatus({
            isActive: true,
            userStopped: false,
            lastUpdate: Date.now()
        });

        // v7.2: Pull fresh data from FO API IMMEDIATELY
        triggerApiManualSync();
        
        // v7.3: Trigger server calculation with a SHORTER delay
        setTimeout(async () => {
            console.log('[DashboardApiSection] 🚀 Calling triggerServerCalculation for:', selectedDateISO);
            await triggerServerCalculation(selectedDateISO);
            setIsSyncing(false);
        }, 1200);

        toast.success(isToday
            ? 'Синхронізація поточних замовлень та запуск розрахунку...'
            : `Завантаження архіву за ${selectedDateISO} та перерахунок...`
        );
    };

    const handleDateChange = (date: string) => {
        setSelectedDate(date);
        clearExcelData();
        // v5.205: Clear both localStorage versions
        localStorage.removeItem('km_dashboard_processed_data');
        localStorage.removeItem('km_dashboard_processed_data_v3');
        localStorage.removeItem('km_routes');
        
        const today = format(new Date(), 'yyyy-MM-dd');
        if (date !== today && apiAutoRefreshEnabled) {
            setApiAutoRefreshEnabled(false);
        }
        
        // Reset robot stats so it doesn't show the previous date's numbers!
        setAutoRoutingStatus({
            totalCount: 0,
            processedCount: 0,
            skippedInRoutes: 0,
            skippedGeocoding: 0,
            isActive: true, // Show loading activity
            lastUpdate: Date.now()
        });

        // Auto-trigger sync so archive data loads immediately
        setTimeout(async () => {
            triggerApiManualSync();
            // v5.206: Wait for data to load then trigger calculation
            setTimeout(async () => {
                await triggerServerCalculation(date);
            }, 2000);
        }, 100);
        
        toast.success(`Перехід на дату: ${date}`);
    };

    const lastRobotUpdate = autoRoutingStatus.lastUpdate || 0;
    const now = Date.now();
    // v7.2: isCalcActive is true if robot is active AND recent, OR if we just triggered a sync manually
    const isCalcActive = (autoRoutingStatus.isActive && (now - lastRobotUpdate < 120000)) || isSyncing;
    const calcDone = !isCalcActive && (autoRoutingStatus.processedCount || 0) > 0 && (autoRoutingStatus.processedCount || 0) >= (autoRoutingStatus.totalCount || 1) && (autoRoutingStatus.totalCount || 0) > 0;
    
    // v7.2: Fallback totalCount from excelData if robot reports 0 (warming up)
    const displayTotalCount = (autoRoutingStatus.totalCount || 0) > 0 ? autoRoutingStatus.totalCount : (excelData?.orders?.length || 0);
    const calcProgress = displayTotalCount > 0 ? Math.min(100, Math.round(((autoRoutingStatus.processedCount || 0) / displayTotalCount) * 100)) : 0;

    return (
        <div className={clsx(
            'p-6 mb-6 rounded-[2rem] border transition-all duration-300 flex flex-col gap-6',
            isDark
                ? 'bg-[#151b2b] border-white/5 shadow-sm'
                : 'bg-white border-slate-200 shadow-sm'
        )}>
            {/* Main Row */}
            <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
                {/* Left: Icon + Status */}
                <div className="flex items-center gap-4 flex-1">
                    <div className={clsx(
                        'w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-all relative',
                        isCalcActive
                            ? (isDark ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)]' : 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.2)]')
                            : (isDark ? 'bg-white/5 text-blue-400' : 'bg-slate-50 border border-slate-100 text-blue-600')
                    )}>
                        {apiSyncStatus === 'syncing' || isSyncing ? (
                            <ArrowPathIcon className="w-6 h-6 animate-spin" />
                        ) : isCalcActive ? (
                            <>
                                <CpuChipIcon className="w-6 h-6 animate-pulse" />
                                <div className="absolute inset-0 rounded-2xl border-2 border-white/20 animate-ping" />
                            </>
                        ) : calcDone ? (
                            <CheckCircleIcon className="w-6 h-6 text-emerald-400" />
                        ) : (
                            <ArrowPathIcon className="w-6 h-6" />
                        )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <div>
                            <h3 className={clsx(
                                'font-black text-lg tracking-tight leading-none',
                                isDark ? 'text-white' : 'text-slate-900'
                            )}>
                                {isCalcActive
                                    ? (autoRoutingStatus.currentCourier
                                        ? `Расчёт: ${autoRoutingStatus.currentCourier}`
                                        : 'Сервер рассчитывает маршруты...')
                                    : calcDone
                                        ? 'Маршруты готовы'
                                        : 'Синхронизация с сервером'}
                            </h3>
                            {todayStatus && todayStatus.ready !== null && (
                              <span className="ml-2 text-xs text-gray-500 inline-block align-middle">Расчёт сегодня: {todayStatus.ready ? 'готов' : 'идёт'}</span>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                                <div className={clsx(
                                    "w-1.5 h-1.5 rounded-full",
                                    isCalcActive ? "bg-blue-500 animate-pulse" : calcDone ? "bg-emerald-500" : "bg-gray-400"
                                )} />
                                <span className={clsx(
                                    'text-[10px] font-bold uppercase tracking-widest',
                                    isDark ? 'text-gray-400' : 'text-gray-500'
                                )}>
                                    {apiLastSyncTime
                                        ? `Обновлено: ${format(apiLastSyncTime, 'HH:mm:ss')}`
                                        : 'Ожидание первой синхронизации'}
                                    {apiAutoRefreshEnabled && apiNextSyncTime && (
                                        <span className="ml-2 opacity-50">· Авто след: {timeLeft}</span>
                                    )}
                                </span>
                            </div>
                        </div>

                        {/* Server Calculation Progress Bar */}
                        {(isCalcActive || calcDone) && (displayTotalCount > 0) && (
                            <div className="flex items-center gap-3 mt-1">
                                <div className="w-36 h-1.5 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                                    <div
                                        className={clsx(
                                            "h-full transition-all duration-700 ease-out rounded-full",
                                            calcDone ? "bg-emerald-500" : "bg-blue-500"
                                        )}
                                        style={{ width: `${calcProgress}%` }}
                                    />
                                </div>
                                <span className="text-[10px] font-black opacity-50 tabular-nums">
                                    {autoRoutingStatus.processedCount || 0}/{autoRoutingStatus.totalCount || 0}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Controls */}
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                    {/* MAIN SYNC BUTTON */}
                    <button
                        onClick={handleSync}
                        disabled={isSyncing || apiSyncStatus === 'syncing'}
                        className={clsx(
                            "flex items-center gap-3 px-5 h-10 rounded-[1.2rem] border font-bold text-[12px] uppercase tracking-widest transition-all duration-300 active:scale-95 group shrink-0 disabled:opacity-50 disabled:cursor-not-allowed",
                            isSyncing || apiSyncStatus === 'syncing'
                                ? (isDark ? 'bg-blue-600/20 border-blue-500/30 text-blue-400' : 'bg-blue-100 border-blue-200 text-blue-600')
                                : (isDark
                                    ? "bg-blue-600/10 border-blue-500/20 text-blue-400 hover:bg-blue-600/20"
                                    : "bg-blue-50 border-blue-100 text-blue-700 hover:bg-blue-100 shadow-sm")
                        )}
                    >
                        <ArrowPathIcon className={clsx("w-4 h-4 transition-transform", (isSyncing || apiSyncStatus === 'syncing') && "animate-spin")} />
                        <span>{isSyncing || apiSyncStatus === 'syncing' ? 'Загрузка...' : (selectedDateISO !== todayISO ? 'Загрузить архив' : 'Синхронизировать')}</span>
                    </button>

                    {/* Back to Today (only if archive) */}
                    {selectedDateISO !== todayISO && (
                        <button
                            onClick={() => {
                                setApiDateShift(todayISO);
                                setApiAutoRefreshEnabled(true);
                                clearExcelData();
                                setTimeout(() => triggerApiManualSync(), 100);
                                toast.success('Возврат к сегодняшним данным');
                            }}
                            className={clsx(
                                "flex items-center justify-center p-2.5 rounded-xl border transition-all hover:scale-105",
                                isDark ? "bg-white/5 border-white/5 text-gray-400 hover:text-white" : "bg-white border-slate-200 text-gray-500 shadow-sm"
                            )}
                            title="Вернуться к сегодня"
                        >
                            <ArrowPathIcon className="w-5 h-5" />
                        </button>
                    )}

                    {/* Admin: Reset stale routes button */}
                    {isAdmin && (
                        <button
                            onClick={resetStaleRoutes}
                            disabled={isResetting || isSyncing}
                            title="Удалить накопленные старые маршруты и пересчитать (только для администратора)"
                            className={clsx(
                                "flex items-center gap-2 px-4 h-10 rounded-[1.2rem] border font-bold text-[11px] uppercase tracking-widest transition-all duration-300 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed",
                                isResetting
                                    ? (isDark ? 'bg-red-600/20 border-red-500/30 text-red-400' : 'bg-red-50 border-red-200 text-red-600')
                                    : (isDark
                                        ? 'bg-red-600/10 border-red-500/20 text-red-400 hover:bg-red-600/20'
                                        : 'bg-red-50 border-red-100 text-red-600 hover:bg-red-100 shadow-sm')
                            )}
                        >
                            <TrashIcon className={clsx('w-4 h-4', isResetting && 'animate-spin')} />
                            <span>{isResetting ? 'Сброс...' : 'Сброс маршрутов'}</span>
                        </button>
                    )}

                    {/* Date Picker */}
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <CalendarIcon className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="date"
                            value={selectedDateISO}
                            onChange={(e) => handleDateChange(e.target.value)}
                            className={clsx(
                                'pl-10 h-10 w-full sm:w-44 rounded-xl font-bold transition-all border outline-none',
                                isDark ? 'bg-white/5 border-white/5 text-white focus:border-blue-500/50' : 'bg-slate-50 border-slate-200 text-gray-900 focus:border-blue-400'
                            )}
                        />
                    </div>
                </div>
            </div>

            {/* Real-time Stats Row (read-only, server-driven) */}
            {((autoRoutingStatus.processedCount || 0) > 0 || isCalcActive) && (
                <div className={clsx(
                    'pt-5 border-t grid grid-cols-2 md:grid-cols-4 gap-4',
                    isDark ? 'border-white/5' : 'border-slate-100'
                )}>
                    {[
                        { label: 'Всего заказов', value: autoRoutingStatus.totalCount || 0, color: isDark ? 'text-white' : 'text-gray-900' },
                        { label: 'Обработано', value: autoRoutingStatus.processedCount || 0, color: isDark ? 'text-emerald-400' : 'text-emerald-600' },
                        { label: 'В маршрутах', value: autoRoutingStatus.skippedInRoutes || 0, color: isDark ? 'text-blue-400' : 'text-blue-600' },
                        { label: 'Ошибки гео', value: autoRoutingStatus.skippedGeocoding || 0, color: (autoRoutingStatus.skippedGeocoding || 0) > 0 ? (isDark ? 'text-red-400' : 'text-red-500') : (isDark ? 'text-gray-500' : 'text-gray-400') },
                    ].map(({ label, value, color }) => (
                        <div key={label} className={clsx("p-4 rounded-2xl flex flex-col justify-center", isDark ? "bg-white/[0.02]" : "bg-slate-50")}>
                            <div className={clsx('text-[10px] font-bold uppercase tracking-widest mb-1.5', isDark ? 'text-gray-500' : 'text-gray-400')}>
                                {label}
                            </div>
                            <div className={clsx('text-2xl font-black leading-none tabular-nums', color)}>
                                {value}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
