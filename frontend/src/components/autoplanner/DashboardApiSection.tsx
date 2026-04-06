import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { ArrowPathIcon, CalendarIcon, CpuChipIcon, BoltIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { useTheme } from '../../contexts/ThemeContext';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../config/apiConfig';

export const DashboardApiSection: React.FC = () => {
    const { isDark } = useTheme();

    // Store values
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
    const autoRoutingStatus = useDashboardStore(s => s.autoRoutingStatus);
    const setAutoRoutingStatus = useDashboardStore(s => s.setAutoRoutingStatus);

    const { clearExcelData } = useExcelData();
    const { user } = useAuth();

    // Initial selectedDate state removal, use apiDateShift instead
    const selectedDate = apiDateShift;
    const setSelectedDate = setApiDateShift;

    const [timeLeft, setTimeLeft] = useState<string>('--:--');
    const [isTriggeringPriority, setIsTriggeringPriority] = useState(false);

    // Function to trigger priority calculation
    const triggerPriorityCalculation = async () => {
        if (!user?.divisionId) {
            toast.error('Division ID not found. Please login again.');
            return;
        }

        setIsTriggeringPriority(true);
        try {
                                    const token = localStorage.getItem('km_access_token') || localStorage.getItem('accessToken');
                                    if (!token || token === 'null' || token === 'undefined') {
                                        toast.error('Вы не авторизованы. Пожалуйста войдите в систему.');
                                        window.location.href = '/login';
                                        return;
                                    }
            const response = await fetch(`${API_URL}/api/turbo/priority`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    divisionId: user.divisionId,
                    date: selectedDate,
                    userId: user.id
                })
            });


            if (response.status === 401 || response.status === 403) {
                // Session might be expired or token invalid. Do not force navigation.
                toast.error('Сессия истекла или неверный токен. Обновите токен и повторите попытку.');
                // User can log in again via UI without automatic redirect.
                return;
            }

            const data = await response.json();
            
            if (data.success) {
                toast.success(`Priority calculation started for division ${user.divisionId}`);
                // Update local state to show it's active
                setAutoRoutingStatus({ isActive: true });
            } else {
                toast.error(data.error || 'Failed to start priority calculation');
            }
        } catch (error) {
            console.error('Error triggering priority calculation:', error);
            toast.error('Failed to trigger priority calculation');
        } finally {
            setIsTriggeringPriority(false);
        }
    };

    // v5.159: Hydrate status from server on mount
    React.useEffect(() => {
        const hydrateStatus = async () => {
            if (!user?.divisionId) return;
            try {
                const token = localStorage.getItem('km_access_token') || localStorage.getItem('accessToken');
                const res = await fetch(`${API_URL}/api/turbo/statuses`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const json = await res.json();
                if (json.success && json.data) {
                    const key = `${user.divisionId}_${selectedDate}`;
                    const status = json.data[key];
                    if (status) {
                        setAutoRoutingStatus(status);
                    }
                }
            } catch (err) {
                console.warn('[DashboardApiSection] Hydration failed:', err);
            }
        };

        hydrateStatus();
        // Also poll every 30s as fallback if socket misses
        const interval = setInterval(hydrateStatus, 30000);
        return () => clearInterval(interval);
    }, [user?.divisionId, selectedDate, setAutoRoutingStatus]);

    // v5.96: New Day Detection - only auto-set today on first run of the day
    React.useEffect(() => {
        const today = format(new Date(), 'yyyy-MM-dd');
        // Only set Today if it's a new day OR no date is set yet
        if (apiLastVisitDate !== today) {
            setApiDateShift(today);
            setApiLastVisitDate(today);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run ONCE on component mount

    // Countdown logic
    React.useEffect(() => {
        if (!apiAutoRefreshEnabled || !apiNextSyncTime) {
            setTimeLeft('--:--');
            return;
        }

        const updateTimer = () => {
            const now = Date.now();
            const diff = apiNextSyncTime - now;

            if (diff <= 0) {
                setTimeLeft('00:00');
                return;
            }

            const minutes = Math.floor(diff / 1000 / 60);
            const seconds = Math.floor((diff / 1000) % 60);
            setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [apiNextSyncTime, apiAutoRefreshEnabled]);

    // v5.94: Special handler for quick refresh that skips date warnings
    const handleQuickRefresh = (e: React.MouseEvent) => {
        e.stopPropagation();
        triggerApiManualSync();
        toast.success('Запрос на обновление отправлен');
    };

    // Toggle handler
    const handleToggleAutoUpdate = () => {
        const today = format(new Date(), 'yyyy-MM-dd');
        const willBeEnabled = !apiAutoRefreshEnabled;
        
        if (willBeEnabled) {
            // Включаем автообновление: ставим сегодняшнюю дату и сразу синхронизируем
            setApiDateShift(today);
            setApiAutoRefreshEnabled(true);
            setTimeout(() => triggerApiManualSync(), 100);
            toast.success('Автообновление включено');
        } else {
            // Выключаем автообновление
            setApiAutoRefreshEnabled(false);
            toast.success('Автообновление выключено');
        }
    };

    const handleDateChange = (date: string) => {
        setSelectedDate(date);
        
        // v5.109: User requested immediate visual clear of old data while fetching new date
        // Note: Using clearExcelData with a flag to prevent full localStorage wipe might be safer, 
        // but for now we wipe everything so the UI correctly resets to "0 orders"
        clearExcelData(); 

        // Сразу загружаем данные при смене даты
        setTimeout(() => triggerApiManualSync(), 100);
        toast.success(`Загрузка данных за ${date}...`);
    };

    return (
        <div className={clsx(
            'p-6 mb-6 rounded-[2rem] border transition-all duration-300 flex flex-col gap-6',
            isDark
                ? 'bg-[#151b2b] border-white/5 shadow-sm'
                : 'bg-white border-slate-200 shadow-sm'
        )}>
            {/* Top Row: System Sync */}
            <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className={clsx(
                        'w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-transform cursor-default',
                        isDark ? 'bg-white/5 text-blue-400' : 'bg-slate-50 border border-slate-100 text-blue-600'
                    )}>
                        <ArrowPathIcon className={clsx("w-6 h-6", (apiSyncStatus === 'syncing') && "animate-spin")} />
                    </div>
                    <div>
                        <h3 className={clsx(
                            'font-black text-lg tracking-tight mb-1',
                            isDark ? 'text-white' : 'text-slate-900'
                        )}>
                            Загрузка данных с ФастОператора
                        </h3>
                        <div className="flex items-center gap-3">
                            <span className={clsx(
                                'text-[10px] font-bold uppercase tracking-widest',
                                isDark ? 'text-gray-400' : 'text-gray-500'
                            )}>
                                {apiLastSyncTime ? `Обновлено: ${format(apiLastSyncTime, 'HH:mm:ss')}` : 'Ожидание первого обновления'}
                            </span>
                            
                            {apiAutoRefreshEnabled && apiNextSyncTime && (
                                <div className={clsx(
                                    "flex items-center gap-2 px-2 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-colors",
                                    isDark ? "bg-blue-500/10 border-blue-500/20 text-blue-400" : "bg-blue-50 border-blue-100 text-blue-600"
                                )}>
                                    <span>След: {timeLeft}</span>
                                    <div className={clsx("w-px h-3", isDark ? "bg-blue-500/20" : "bg-blue-200")} />
                                    <button
                                        onClick={handleQuickRefresh}
                                        disabled={apiSyncStatus === 'syncing'}
                                        className={clsx(
                                            "rounded-md p-0.5 transition-colors hover:bg-blue-200 dark:hover:bg-blue-500/30",
                                            apiSyncStatus === 'syncing' && "opacity-50"
                                        )}
                                        title="Обновить сейчас"
                                    >
                                        <ArrowPathIcon className={clsx("w-3 h-3", apiSyncStatus === 'syncing' && "animate-spin")} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                    {/* Auto Update Toggle */}
                    <div className={clsx(
                        "flex items-center gap-3 px-4 py-2 rounded-xl border transition-colors",
                        isDark ? "bg-white/5 border-white/5 hover:border-white/10" : "bg-slate-50 border-slate-100 hover:border-slate-200"
                    )}>
                        <div className="flex items-center gap-2">
                            <div className={clsx(
                                "w-2 h-2 rounded-full",
                                apiAutoRefreshEnabled ? "bg-green-500" : "bg-gray-400"
                            )} />
                            <span className={clsx(
                                "text-[11px] uppercase tracking-wider font-bold",
                                isDark ? "text-gray-300" : "text-gray-700"
                            )}>
                                Автообновление
                            </span>
                        </div>
                        <button
                            onClick={handleToggleAutoUpdate}
                            className={clsx(
                                'relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 focus:outline-none',
                                apiAutoRefreshEnabled ? 'bg-blue-600' : (isDark ? 'bg-gray-700' : 'bg-gray-300')
                            )}
                        >
                            <span
                                className={clsx(
                                    'inline-block h-4 w-4 transform rounded-full bg-white transition-all duration-300',
                                    apiAutoRefreshEnabled ? 'translate-x-[24px]' : 'translate-x-1'
                                )}
                            />
                        </button>
                    </div>

                    {/* Date Picker */}
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <CalendarIcon className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="date"
                            value={selectedDate}
                            disabled={apiAutoRefreshEnabled}
                            onChange={(e) => handleDateChange(e.target.value)}
                            title={apiAutoRefreshEnabled ? "Отключите автообновление для выбора другой даты" : ""}
                            className={clsx(
                                'pl-10 h-10 w-full sm:w-44 rounded-xl font-bold transition-all border outline-none',
                                apiAutoRefreshEnabled && 'opacity-60 cursor-not-allowed',
                                isDark ? 'bg-white/5 border-white/5 text-white focus:border-blue-500/50' : 'bg-slate-50 border-slate-200 text-gray-900 focus:border-blue-400'
                            )}
                        />
                    </div>
                </div>
            </div>

            <div className={clsx("h-px w-full", isDark ? "bg-white/5" : "bg-slate-100")} />

            {/* Robot Control Row */}
            <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className={clsx(
                        'w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-transform',
                        autoRoutingStatus.isActive 
                            ? (isDark ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white')
                            : (isDark ? 'bg-white/5 text-gray-400' : 'bg-slate-50 border border-slate-100 text-gray-500')
                    )}>
                        <CpuChipIcon className={clsx("w-6 h-6", autoRoutingStatus.isActive && "animate-pulse")} />
                    </div>
                    <div>
                        <h3 className={clsx(
                            'font-black text-lg tracking-tight mb-1',
                            isDark ? 'text-white' : 'text-slate-900'
                        )}>
                            Фоновый расчет заказов
                        </h3>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className={clsx(
                                "w-1.5 h-1.5 rounded-full",
                                autoRoutingStatus.isActive ? "bg-green-500" : "bg-gray-400"
                            )} />
                            <span className={clsx(
                                'text-[10px] font-bold uppercase tracking-widest flex items-center gap-1',
                                isDark ? 'text-gray-400' : 'text-gray-500'
                            )}>
                                {autoRoutingStatus.isActive ? 'Активен' : 'Режим ожидания'}
                                {autoRoutingStatus.lastUpdate && (
                                    <span className="opacity-50 tracking-normal lowercase">
                                         • {format(autoRoutingStatus.lastUpdate, 'HH:mm:ss')}
                                    </span>
                                )}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col lg:flex-row items-center gap-3 w-full lg:w-auto">
                    <button
                        onClick={async () => {
                            if (!user?.divisionId) return;
                            try {
                                const token = localStorage.getItem('km_access_token') || localStorage.getItem('accessToken');
                                const res = await fetch(`${API_URL}/api/turbo/clear`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${token}`
                                    },
                                    body: JSON.stringify({ divisionId: user.divisionId, date: selectedDate })
                                });
                                const data = await res.json();
                                if (data.success) {
                                    toast.success(data.message || 'Очистка завершена');
                                    // v5.195: WIPE FRONTEND CACHES DEAD
                                    localStorage.removeItem('km_routes');
                                    setAutoRoutingStatus({ isActive: false, processedCount: 0, totalCount: 0, skippedGeocoding: 0, skippedInRoutes: 0 });
                                    try {
                                        if (typeof window !== 'undefined') {
                                            window.dispatchEvent(new CustomEvent('km:turbo:routes_update', {
                                                detail: { routes: [], couriers: [] }
                                            }));
                                        }
                                    } catch(e) {}
                                    triggerApiManualSync();
                                } else {
                                    toast.error(data.error || 'Ошибка очистки');
                                }
                            } catch(e) {
                                toast.error('Ошибка сервера при очистке');
                            }
                        }}
                        disabled={isTriggeringPriority || autoRoutingStatus.isActive}
                        className={clsx(
                            'flex items-center justify-center gap-2 px-6 h-10 rounded-xl font-bold text-[12px] uppercase tracking-widest transition-all active:scale-[0.98] outline-none',
                            isDark ? 'bg-white/5 hover:bg-white/10 text-red-400' : 'bg-slate-50 hover:bg-red-50 text-red-500 border border-slate-200',
                            (isTriggeringPriority || autoRoutingStatus.isActive) && 'opacity-50 cursor-not-allowed'
                        )}
                        title="Очистить и сбросить маршруты Турбо-робота"
                    >
                         Очистить
                    </button>
                    <button
                        onClick={async () => {
                            if (autoRoutingStatus.isActive) {
                                try {
                                    const token = localStorage.getItem('km_access_token') || localStorage.getItem('accessToken');
                                    if (token && token !== 'null' && token !== 'undefined') {
                                        await fetch(`${API_URL}/api/turbo/stop`, {
                                            method: 'POST',
                                            headers: { 'Authorization': `Bearer ${token}` }
                                        });
                                    }
                                } catch (e) {
                                    console.error('Error stopping calculation:', e);
                                }
                                setAutoRoutingStatus({ isActive: false });
                            } else {
                                triggerPriorityCalculation();
                            }
                        }}
                        disabled={isTriggeringPriority}
                        className={clsx(
                            'flex items-center justify-center gap-2 px-8 h-10 rounded-xl font-bold text-[12px] uppercase tracking-widest transition-all active:scale-[0.98] w-full lg:w-auto outline-none focus:outline-none',
                            autoRoutingStatus.isActive
                                ? (isDark ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' : 'bg-red-50 text-red-600 hover:bg-red-100')
                                : (isDark ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'),
                            isTriggeringPriority && 'opacity-50 cursor-not-allowed'
                        )}
                    >
                        {isTriggeringPriority ? (
                            <>
                                <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                <span>Запуск...</span>
                            </>
                        ) : autoRoutingStatus.isActive ? (
                            <>
                                <span>Остановить расчет</span>
                            </>
                        ) : (
                            <>
                                <BoltIcon className="w-4 h-4" />
                                <span>Запустить расчёт</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Real-time Stats */}
            {(autoRoutingStatus.isActive || (autoRoutingStatus.processedCount || 0) > 0) && (
                <div className={clsx(
                    'mt-2 pt-6 border-t flex flex-col gap-5',
                    isDark ? 'border-white/5' : 'border-slate-100'
                )}>
                    <div className="flex items-center gap-2">
                        <BoltIcon className="w-4 h-4 text-amber-500" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                            Статистика в реальном времени
                        </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className={clsx("p-5 rounded-2xl flex flex-col justify-center", isDark ? "bg-white/[0.02]" : "bg-slate-50")}>
                            <div className={clsx('text-[10px] font-bold uppercase tracking-widest mb-1.5', isDark ? 'text-gray-500' : 'text-gray-400')}>
                                Всего заказов
                            </div>
                            <div className={clsx('text-3xl font-black', isDark ? 'text-white' : 'text-gray-900')}>
                                {autoRoutingStatus.totalCount || 0}
                            </div>
                        </div>

                        <div className={clsx("p-5 rounded-2xl flex flex-col justify-center", isDark ? "bg-white/[0.02]" : "bg-slate-50")}>
                            <div className={clsx('text-[10px] font-bold uppercase tracking-widest mb-1.5', isDark ? 'text-emerald-500/70' : 'text-emerald-600/70')}>
                                Обработано
                            </div>
                            <div className={clsx('text-3xl font-black text-emerald-500')}>
                                {autoRoutingStatus.processedCount || 0}
                            </div>
                        </div>

                        <div className={clsx("p-5 rounded-2xl flex flex-col justify-center", isDark ? "bg-white/[0.02]" : "bg-slate-50")}>
                            <div className={clsx('text-[10px] font-bold uppercase tracking-widest mb-1.5', isDark ? 'text-blue-400/70' : 'text-blue-500/70')}>
                                В маршрутах
                            </div>
                            <div className={clsx('text-3xl font-black', isDark ? 'text-blue-400' : 'text-blue-600')}>
                                {autoRoutingStatus.skippedInRoutes || 0}
                            </div>
                        </div>

                        <div className={clsx("p-5 rounded-2xl flex flex-col justify-center", isDark ? "bg-white/[0.02]" : "bg-slate-50")}>
                            <div className={clsx('text-[10px] font-bold uppercase tracking-widest mb-1.5', isDark ? 'text-red-400/70' : 'text-red-500/70')}>
                                Ошибки гео
                            </div>
                            <div className={clsx('text-3xl font-black', autoRoutingStatus.skippedGeocoding > 0 ? (isDark ? 'text-red-400' : 'text-red-500') : (isDark ? 'text-gray-500' : 'text-gray-400'))}>
                                {autoRoutingStatus.skippedGeocoding || 0}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
