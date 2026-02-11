import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { dashboardApiService } from '../../utils/api/dashboardApiService';
import { format } from 'date-fns';
import { ArrowPathIcon, CalendarIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { useTheme } from '../../contexts/ThemeContext';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useAutoPlannerStore } from '../../stores/useAutoPlannerStore'; // Import Store

export const DashboardApiSection: React.FC = () => {
    const { isDark } = useTheme();
    const { setExcelData } = useExcelData();
    const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
    const [isLoading, setIsLoading] = useState(false);

    // Use global store for auto-update state
    const apiAutoRefreshEnabled = useAutoPlannerStore(s => s.apiAutoRefreshEnabled);
    const setApiAutoRefreshEnabled = useAutoPlannerStore(s => s.setApiAutoRefreshEnabled);
    const apiLastSyncTime = useAutoPlannerStore(s => s.apiLastSyncTime);
    const apiNextSyncTime = useAutoPlannerStore(s => s.apiNextSyncTime);
    const apiSyncStatus = useAutoPlannerStore(s => s.apiSyncStatus);

    const [timeLeft, setTimeLeft] = useState<string>('--:--');

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

    const handleFetchData = async (isSilent = false, forceRefresh = false) => {
        if (!selectedDate) {
            if (!isSilent) toast.error('Выберите дату');
            return;
        }

        if (!isSilent) setIsLoading(true);
        const dateInApiFormat = dashboardApiService.convertDateToApiFormat(selectedDate);
        let toastId: string | undefined;

        if (!isSilent) {
            toastId = toast.loading(`Загрузка данных за ${dateInApiFormat}...`);
        }

        try {
            console.log(`🚀 ${isSilent ? 'Авто-запрос' : 'Запрос'} данных дашборда за ${dateInApiFormat}`);
            const response = await dashboardApiService.fetchDataForDate({
                date: dateInApiFormat,
                force: forceRefresh
            });

            if (response.success && response.data) {
                const ordersCount = response.data.orders?.length || 0;

                // Update context directly
                setExcelData(response.data);

                if (!isSilent) {
                    toast.success(`Успешно загружено ${ordersCount} заказов!`, { id: toastId });
                } else {
                    console.log(`✅ Автообновление успешно: ${ordersCount} заказов`);
                }
            } else {
                throw new Error(response.error || 'Неизвестная ошибка API');
            }
        } catch (error: any) {

            console.error('❌ Ошибка загрузки дашборда:', error);
            if (!isSilent) {
                const errorMessage = error.response?.data?.error || error.message || 'Ошибка загрузки';
                const errorDetails = error.response?.data?.details;

                toast.error(
                    <div>
                        <p className="font-bold">{errorMessage}</p>
                        {errorDetails && <p className="text-xs mt-1 opacity-80">{JSON.stringify(errorDetails)}</p>}
                    </div>,
                    { id: toastId, duration: 5000 }
                );
            }
        } finally {
            if (!isSilent) setIsLoading(false);
        }
    };

    // Toggle handler
    const handleToggleAutoUpdate = () => {
        const today = format(new Date(), 'yyyy-MM-dd');
        if (selectedDate !== today && !apiAutoRefreshEnabled) {
            toast.error('Автообновление доступно только за сегодня');
            return;
        }
        setApiAutoRefreshEnabled(!apiAutoRefreshEnabled);
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
                        <ArrowPathIcon className={clsx("w-6 h-6", (isLoading || apiSyncStatus === 'syncing') && "animate-spin")} />
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
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 group/timer">
                                    <span className="text-[10px] text-blue-500 font-bold tabular-nums">
                                        След: {timeLeft}
                                    </span>
                                    <button
                                        onClick={() => handleFetchData(false, true)}
                                        disabled={isLoading || apiSyncStatus === 'syncing'}
                                        className="hover:scale-110 active:rotate-180 transition-all duration-300"
                                        title="Обновить сейчас"
                                    >
                                        <ArrowPathIcon className={clsx("w-3 h-3 text-blue-400", (isLoading || apiSyncStatus === 'syncing') && "animate-spin")} />
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
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className={clsx(
                                'input pl-10 w-full sm:w-48 rounded-2xl font-bold transition-all duration-300',
                                isDark ? 'bg-gray-800/40 border-white/5 text-white hover:bg-gray-800/60 focus:bg-gray-800/80 outline-none' : 'bg-white border-gray-200 text-gray-900 hover:border-blue-300'
                            )}
                        />
                    </div>

                    <button
                        onClick={() => handleFetchData(false, true)}
                        disabled={isLoading || apiSyncStatus === 'syncing'}
                        className={clsx(
                            'btn btn-primary flex items-center gap-2 whitespace-nowrap min-w-[140px] justify-center px-6 py-2.5 rounded-2xl font-bold transform transition-all duration-200 active:scale-95 shadow-xl',
                            (isLoading || apiSyncStatus === 'syncing') && 'opacity-70 cursor-not-allowed grayscale'
                        )}
                    >
                        {isLoading || apiSyncStatus === 'syncing' ? (
                            <>
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>Синхрон...</span>
                            </>
                        ) : (
                            <>
                                <ArrowPathIcon className="h-5 w-5" />
                                <span>Загрузить</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
