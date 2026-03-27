import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { ArrowPathIcon, CalendarIcon, CpuChipIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { useTheme } from '../../contexts/ThemeContext';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useExcelData } from '../../contexts/ExcelDataContext';

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

    // Initial selectedDate state removal, use apiDateShift instead
    const selectedDate = apiDateShift;
    const setSelectedDate = setApiDateShift;

    const [timeLeft, setTimeLeft] = useState<string>('--:--');

    // v5.96: New Day Detection - only auto-set today on first run of the day
    React.useEffect(() => {
        const today = format(new Date(), 'yyyy-MM-dd');
        // Only set Today if it's a new day OR no date is set yet
        if (apiLastVisitDate !== today) {
            setApiDateShift(today);
            setApiLastVisitDate(today);
            console.log(`📅 Новая сессия: установлена дата ${today}`);
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
            'glass-panel p-6 shadow-[0_20px_50px_rgba(0,0,0,0.3)] relative overflow-hidden group mb-6 border-2 transition-all duration-500',
            isDark
                ? 'bg-gradient-to-br from-gray-900/80 via-blue-900/20 to-gray-900/80 border-blue-500/20 hover:border-blue-500/40'
                : 'bg-gradient-to-br from-white/80 via-blue-50/50 to-white/80 border-blue-200 hover:border-blue-400'
        )}>
            {/* Dynamic Light Accents - More pronounced */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-600/10 blur-[100px] pointer-events-none group-hover:bg-blue-500/30 transition-all duration-700 animate-pulse" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-500/10 blur-[100px] pointer-events-none group-hover:bg-indigo-500/30 transition-all duration-700" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-gradient-to-tr from-transparent via-blue-400/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />

            <div className="flex flex-col lg:flex-row items-center justify-between gap-4 relative z-10">
                <div className="flex items-center gap-3">
                    <div className={clsx(
                        'p-3 rounded-2xl shadow-inner transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3',
                        isDark ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600'
                    )}>
                        <ArrowPathIcon className={clsx("w-6 h-6", (apiSyncStatus === 'syncing') && "animate-spin")} />
                    </div>
                    <div>
                        <h3 className={clsx(
                            'font-bold text-lg tracking-tight',
                            isDark ? 'text-white' : 'text-gray-900'
                        )}>
                            Загрузка данных с ФастОператора
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                            <p className={clsx(
                                'text-xs font-semibold uppercase tracking-wider',
                                isDark ? 'text-gray-400' : 'text-gray-500'
                            )}>
                                {apiLastSyncTime ? `Обновлено: ${format(apiLastSyncTime, 'HH:mm:ss')}` : 'Ожидание первого обновления...'}
                            </p>
                            {apiAutoRefreshEnabled && apiNextSyncTime && (
                                <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-500/5 dark:bg-blue-400/10 border border-blue-500/20 dark:border-blue-400/20 shadow-sm transition-all hover:border-blue-500/40">
                                    <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold tabular-nums tracking-tight">
                                        След: {timeLeft}
                                    </span>
                                    <div className="w-px h-3 bg-blue-500/20 dark:bg-blue-400/20 mx-0.5" />
                                    <button
                                        onClick={handleQuickRefresh}
                                        disabled={apiSyncStatus === 'syncing'}
                                        className={clsx(
                                            "hover:scale-110 active:rotate-180 transition-all duration-300 p-0.5 rounded-full hover:bg-blue-500/10",
                                            apiSyncStatus === 'syncing' && "cursor-not-allowed opacity-50"
                                        )}
                                        title="Обновить сейчас"
                                    >
                                        <ArrowPathIcon className={clsx("w-3 h-3 text-blue-500 dark:text-blue-400", (apiSyncStatus === 'syncing') && "animate-spin")} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 justify-center w-full lg:w-auto">
                    {/* Переключатель автообновления */}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-2xl border border-dashed border-gray-300 dark:border-white/10 bg-gray-50/30 dark:bg-white/5 backdrop-blur-md transition-colors hover:border-blue-400/50">
                        <div className="flex items-center gap-2">
                            <div className={clsx(
                                "w-2 h-2 rounded-full",
                                apiAutoRefreshEnabled ? "bg-green-500 animate-pulse" : "bg-gray-400"
                            )} />
                            <span className={clsx(
                                'text-sm font-bold',
                                isDark ? 'text-gray-200' : 'text-gray-700'
                            )}>
                                Автообновление
                            </span>
                        </div>
                        <button
                            onClick={handleToggleAutoUpdate}
                            className={clsx(
                                'relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
                                apiAutoRefreshEnabled ? 'bg-blue-600 shadow-lg shadow-blue-600/30' : 'bg-gray-300 dark:bg-gray-700'
                            )}
                        >
                            <span
                                className={clsx(
                                    'inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-all duration-300',
                                    apiAutoRefreshEnabled ? 'translate-x-[24px]' : 'translate-x-1'
                                )}
                            />
                        </button>
                    </div>

                    <div className="relative flex-1 sm:flex-initial">
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
                                'input pl-10 w-full sm:w-48 rounded-2xl font-bold transition-all duration-300',
                                apiAutoRefreshEnabled && 'opacity-60 cursor-not-allowed',
                                isDark ? 'bg-gray-800/40 border-white/5 text-white hover:bg-gray-800/60 focus:bg-gray-800/80 outline-none' : 'bg-white border-gray-200 text-gray-900 hover:border-blue-300'
                            )}
                        />
                    </div>
                </div>
            </div>

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
                            <p className={clsx(
                                'text-xs font-semibold uppercase tracking-wider',
                                isDark ? 'text-gray-400' : 'text-gray-500'
                            )}>
                                {autoRoutingStatus.isActive
                                    ? (
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <span>АКТИВЕН • Заказы: {autoRoutingStatus.processedCount}/{autoRoutingStatus.totalCount} • Курьеры: {autoRoutingStatus.processedCouriers}/{autoRoutingStatus.totalCouriers}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-[10px] text-gray-500 font-medium">
                                                {autoRoutingStatus.skippedInRoutes > 0 && <span className="text-emerald-600/70">В маршрутах: {autoRoutingStatus.skippedInRoutes}</span>}
                                                {autoRoutingStatus.skippedGeocoding > 0 && <span className="text-red-500/70">Ошибка гео: {autoRoutingStatus.skippedGeocoding}</span>}
                                                {autoRoutingStatus.skippedNoCourier > 0 && <span className="text-orange-500/70">Без курьера: {autoRoutingStatus.skippedNoCourier}</span>}
                                            </div>
                                        </div>
                                    )
                                    : 'Режим ожидания'}
                            </p>
                            {autoRoutingStatus.lastUpdate && (
                                <span className="text-[10px] text-gray-400 ml-1">
                                    • {format(autoRoutingStatus.lastUpdate, 'HH:mm:ss')}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setAutoRoutingStatus({ isActive: !autoRoutingStatus.isActive })}
                        className={clsx(
                            'btn flex items-center gap-2 px-6 py-2.5 rounded-2xl font-bold transform transition-all duration-200 active:scale-95 shadow-lg',
                            autoRoutingStatus.isActive
                                ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/30'
                        )}
                    >
                        {autoRoutingStatus.isActive ? (
                            <>
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>Остановить считать этого гения  </span>
                            </>
                        ) : (
                            <>
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                <span>Запустить </span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
