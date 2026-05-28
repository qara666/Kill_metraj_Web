import React, { useState, useCallback, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { useTheme } from '../../contexts/ThemeContext';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../config/apiConfig';
import { ArrowPathIcon, CalendarIcon, TrashIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

export const DashboardApiSection: React.FC = () => {
    const { isDark } = useTheme();

    const apiSyncStatus = useDashboardStore(s => s.apiSyncStatus);
    const apiDateShift = useDashboardStore(s => s.apiDateShift);
    const setApiDateShift = useDashboardStore(s => s.setApiDateShift);
    const apiAutoRefreshEnabled = useDashboardStore(s => s.apiAutoRefreshEnabled);
    const setApiAutoRefreshEnabled = useDashboardStore(s => s.setApiAutoRefreshEnabled);
    const apiLastSyncTime = useDashboardStore(s => s.apiLastSyncTime);
    const apiNextSyncTime = useDashboardStore(s => s.apiNextSyncTime);
    const triggerApiManualSync = useDashboardStore(s => s.triggerApiManualSync);
    const setAutoRoutingStatus = useDashboardStore(s => s.setAutoRoutingStatus);

    const divisionId = useDashboardStore(s => s.divisionId);
    const { user } = useAuth();
    const { clearExcelData } = useExcelData();
    const setSelectedDate = setApiDateShift;

    const normalizeToISO = (dateValue: any): string => {
        if (!dateValue) return format(new Date(), 'yyyy-MM-dd');
        const d = typeof dateValue === 'string' ? dateValue : String(dateValue);
        if (d.includes('.')) {
            const [day, mon, year] = d.split('.');
            return `${year}-${mon}-${day}`;
        }
        return d;
    };

    const selectedDateISO = normalizeToISO(apiDateShift);
    const todayISO = format(new Date(), 'yyyy-MM-dd');
    const [todayStatus, setTodayStatus] = React.useState<{ ready: boolean | null; date: string } | null>({ ready: null, date: todayISO });
    
    const fetchTodayStatus = useCallback(async () => {
      try {
        const token = localStorage.getItem('km_access_token');
        if (!token) return;
        const res = await fetch(`${API_URL}/api/turbo/status_today`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.success) {
            setTodayStatus({ ready: data.ready, date: data.date || todayISO });
          }
        }
      } catch { /* ignore */ }
    }, [todayISO]);

    const isToday = selectedDateISO === todayISO;
    const isAdmin = user?.role === 'admin';
    const [timeLeft, setTimeLeft] = useState<string>('--:--');
    const [isSyncing, setIsSyncing] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    useEffect(() => {
      fetchTodayStatus();
      const t = setInterval(fetchTodayStatus, 30000);
      return () => clearInterval(t);
    }, [fetchTodayStatus]);

    useEffect(() => {
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

    const triggerServerCalculation = useCallback(async (dateISO: string) => {
        try {
            const token = localStorage.getItem('km_access_token');
            if (!token) return false;
            const res = await fetch(`${API_URL}/api/turbo/priority`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ divisionId, date: dateISO, force: true, priority: true })
            });
            return res.ok;
        } catch { return false; }
    }, [divisionId]);

    const handleSync = async () => {
        setIsSyncing(true);
        localStorage.removeItem('km_dashboard_processed_data_v4');
        localStorage.removeItem('km_routes');
        setApiAutoRefreshEnabled(isToday);
        setAutoRoutingStatus({ isActive: true, userStopped: false, lastUpdate: Date.now() });
        triggerApiManualSync();
        setTimeout(async () => {
            await triggerServerCalculation(selectedDateISO);
            triggerApiManualSync();
            setIsSyncing(false);
        }, 1200);
    };

    const handleDateChange = (date: string) => {
        setSelectedDate(date);
        clearExcelData();
        localStorage.removeItem('km_routes');
        if (date !== todayISO && apiAutoRefreshEnabled) setApiAutoRefreshEnabled(false);
        setAutoRoutingStatus({ totalCount: 0, processedCount: 0, isActive: true, lastUpdate: Date.now() });
        setTimeout(() => {
            triggerApiManualSync();
            setTimeout(async () => { await triggerServerCalculation(date); triggerApiManualSync(); }, 2000);
        }, 100);
    };

    const resetStaleRoutes = useCallback(async () => {
        setIsResetting(true);
        try {
            const token = localStorage.getItem('km_access_token');
            const res = await fetch(`${API_URL}/api/turbo/reset-stale-routes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ divisionId })
            });
            const data = await res.json();
            if (data?.success) {
                toast.success('Маршруты сброшены');
                setTimeout(() => handleSync(), 800);
            }
        } catch { /* ignore */ } finally { setIsResetting(false); }
    }, [divisionId]);

    const isWorking = isSyncing || apiSyncStatus === 'syncing';

    return (
        <div style={{ 
            background: isDark ? '#1C1C1E' : '#FFFFFF', 
            borderRadius: '20px',
            padding: '16px 24px',
            fontFamily: "system-ui, -apple-system, sans-serif",
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 20px rgba(0,0,0,0.06)',
            border: isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.03)',
            marginBottom: '24px'
        }}>
            
            {/* System Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '11px', fontWeight: 500, color: isDark ? '#8E8E93' : '#8E8E93', textTransform: 'uppercase' }}>Последнее обновление</span>
                        <span style={{ fontSize: '15px', fontWeight: 600, color: isDark ? '#EBEBF5' : '#1C1C1E', fontVariantNumeric: 'tabular-nums' }}>
                            {apiLastSyncTime ? format(apiLastSyncTime, 'HH:mm:ss') : '--:--:--'}
                        </span>
                    </div>

                    {apiAutoRefreshEnabled && (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '11px', fontWeight: 500, color: isDark ? '#8E8E93' : '#8E8E93', textTransform: 'uppercase' }}>След. обновление через</span>
                            <span style={{ fontSize: '15px', fontWeight: 600, color: isDark ? '#0A84FF' : '#007AFF', fontVariantNumeric: 'tabular-nums' }}>{timeLeft}</span>
                        </div>
                    )}
                </div>
            </div>

<<<<<<< Updated upstream
            {/* Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ 
                    display: 'flex', alignItems: 'center', gap: '10px', 
                    background: isDark ? '#2C2C2E' : '#F2F2F7', 
                    padding: '10px 16px', borderRadius: '12px',
                    transition: 'all 0.2s'
                }}>
                    <CalendarIcon width={18} color={isDark ? '#8E8E93' : '#8E8E93'} />
                    <input
                        type="date"
                        value={selectedDateISO}
                        onChange={(e) => handleDateChange(e.target.value)}
                        style={{ 
                            background: 'transparent', border: 'none', outline: 'none', 
                            color: isDark ? '#FFFFFF' : '#000000', fontSize: '15px', fontWeight: 600,
                            cursor: 'pointer', padding: 0
                        }}
                    />
=======
            {/* v5.8: Robot Control Center (Centralized) */}
            <div className={clsx(
                'mt-6 pt-6 border-t-2 flex flex-col lg:flex-row items-center justify-between gap-4 relative z-10',
                isDark ? 'border-blue-500/10' : 'border-blue-100'
            )}>
                <div className="flex items-center gap-3">
                    <div className={clsx(
                        'p-3.5 rounded-2xl shadow-lg transition-all duration-500 group-hover:scale-105',
                        autoRoutingStatus.isActive 
                            ? (isDark ? 'bg-blue-600 shadow-blue-500/20 text-white' : 'bg-blue-600 shadow-blue-500/30 text-white')
                            : (isDark ? 'bg-indigo-900/20 text-indigo-400' : 'bg-indigo-50 text-indigo-600')
                    )}>
                        <CpuChipIcon className={clsx("w-6 h-6", autoRoutingStatus.isActive && "animate-pulse")} />
                    </div>
                    <div>
                        <h3 className={clsx(
                            'font-bold text-lg tracking-tight',
                            isDark ? 'text-white' : 'text-gray-900'
                        )}>
                            Фоновый расчет заказов
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                            <div className={clsx(
                                "w-2 h-2 rounded-full",
                                autoRoutingStatus.isActive ? "bg-green-500 animate-pulse" : "bg-gray-400"
                            )} />
                            <div className={clsx(
                                'text-xs font-semibold uppercase tracking-wider',
                                isDark ? 'text-gray-400' : 'text-gray-500'
                            )}>
                                {autoRoutingStatus.isActive
                                    ? (
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    <span>
                                                        {autoRoutingStatus.statusMessage || `АКТИВЕН • Заказы: ${autoRoutingStatus.processedCount}/${autoRoutingStatus.totalCount} • Курьеры: ${autoRoutingStatus.processedCouriers}/${autoRoutingStatus.totalCouriers}`}
                                                    </span>
                                                </div>
                                            <div className="flex items-center gap-3 text-[10px] text-gray-500 font-medium">
                                                {autoRoutingStatus.skippedInRoutes > 0 && <span className="text-emerald-600/70">В маршрутах: {autoRoutingStatus.skippedInRoutes}</span>}
                                                {autoRoutingStatus.skippedGeocoding > 0 && <span className="text-red-500/70">Ошибка гео: {autoRoutingStatus.skippedGeocoding}</span>}
                                                {autoRoutingStatus.skippedNoCourier > 0 && <span className="text-orange-500/70">Без курьера: {autoRoutingStatus.skippedNoCourier}</span>}
                                            </div>
                                        </div>
                                    )
                                    : 'Режим ожидания'}
                            </div>
                            {autoRoutingStatus.lastUpdate && (
                                <span className="text-[10px] text-gray-400 ml-1">
                                    • {format(autoRoutingStatus.lastUpdate, 'HH:mm:ss')}
                                </span>
                            )}
                        </div>
                    </div>
>>>>>>> Stashed changes
                </div>

                {isAdmin && (
                    <button
                        onClick={resetStaleRoutes}
                        disabled={isResetting}
                        style={{ 
                            background: isDark ? '#2C2C2E' : '#F2F2F7', border: 'none',
                            color: isDark ? '#FF453A' : '#FF3B30', padding: '12px', borderRadius: '12px',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.2s'
                        }}
                        title="Сброс маршрутов"
                    >
                        {isResetting ? <ArrowPathIcon width={20} className="animate-spin" /> : <TrashIcon width={20} />}
                    </button>
                )}

                <button
                    onClick={handleSync}
                    disabled={isWorking}
                    style={{ 
                        background: isDark ? '#0A84FF' : '#007AFF', color: '#FFFFFF', border: 'none',
                        fontSize: '15px', fontWeight: 600, letterSpacing: '-0.01em',
                        padding: '10px 24px', borderRadius: '12px', cursor: isWorking ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: '8px',
                        boxShadow: isDark ? '0 4px 14px rgba(10,132,255,0.3)' : '0 4px 14px rgba(0,122,255,0.3)',
                        transition: 'all 0.2s'
                    }}
                >
                    {isWorking ? <ArrowPathIcon width={18} className="animate-spin" /> : null}
                    Обновить данные
                </button>
            </div>
        </div>
    );
};
