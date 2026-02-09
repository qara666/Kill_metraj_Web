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
            'card p-6 overflow-hidden relative',
            isDark ? 'shadow-blue-900/10' : 'shadow-gray-200/50'
        )}>
            {/* Subtle light effect for premium feel */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-pink-400 to-blue-600 opacity-80" />
            <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className={clsx(
                        'p-2 rounded-lg',
                        isDark ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600'
                    )}>
                        <ArrowPathIcon className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className={clsx(
                            'font-semibold text-lg',
                            isDark ? 'text-gray-100' : 'text-gray-900'
                        )}>
                            Загрузка данных с API
                        </h3>
                        <p className={clsx(
                            'text-sm',
                            isDark ? 'text-gray-400' : 'text-gray-500'
                        )}>
                            Обновление данных за выбранную дату
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 justify-center w-full lg:w-auto">
                    {/* Переключатель автообновления */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
                        <span className={clsx(
                            'text-sm font-medium',
                            isDark ? 'text-gray-300' : 'text-gray-700'
                        )}>
                            Автообновление (WebSocket)
                        </span>
                        <button
                            onClick={handleToggleAutoUpdate}
                            className={clsx(
                                'relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
                                apiAutoRefreshEnabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                            )}
                        >
                            <span
                                className={clsx(
                                    'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200',
                                    apiAutoRefreshEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'
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
                                'input pl-10 w-full sm:w-48 rounded-xl',
                                isDark ? 'bg-gray-800/50 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'
                            )}
                        />
                    </div>

                    <button
                        onClick={() => handleFetchData(false, true)}
                        disabled={isLoading}
                        className={clsx(
                            'btn btn-primary flex items-center gap-2 whitespace-nowrap min-w-[120px] justify-center',
                            isLoading && 'opacity-70 cursor-not-allowed'
                        )}
                    >
                        {isLoading ? (
                            <>
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>Загрузка...</span>
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
