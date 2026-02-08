import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { dashboardApiService } from '../../utils/api/dashboardApiService';
import { format } from 'date-fns';
import { ArrowPathIcon, CalendarIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { useTheme } from '../../contexts/ThemeContext';

export const DashboardApiSection: React.FC = () => {
    const { isDark } = useTheme();
    const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
    const [isLoading, setIsLoading] = useState(false);

    const handleFetchData = async () => {
        if (!selectedDate) {
            toast.error('Выберите дату');
            return;
        }

        setIsLoading(true);
        const dateInApiFormat = dashboardApiService.convertDateToApiFormat(selectedDate);
        const toastId = toast.loading(`Загрузка данных за ${dateInApiFormat}...`);

        try {
            console.log(`🚀 Запрос данных дашборда за ${dateInApiFormat}`);
            const response = await dashboardApiService.fetchDataForDate({
                date: dateInApiFormat
            });

            if (response.success && response.data) {
                const ordersCount = response.data.orders?.length || 0;
                toast.success(`Успешно загружено ${ordersCount} заказов!`, { id: toastId });

                // Перезагрузка страницы для отображения новых данных (простой способ)
                // В идеале стоит использовать React Query invalidation
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } else {
                throw new Error(response.error || 'Неизвестная ошибка API');
            }
        } catch (error: any) {
            console.error('❌ Ошибка загрузки дашборда:', error);
            const errorMessage = error.response?.data?.error || error.message || 'Ошибка загрузки';
            const errorDetails = error.response?.data?.details;

            toast.error(
                <div>
                    <p className="font-bold">{errorMessage}</p>
                    {errorDetails && <p className="text-xs mt-1 opacity-80">{JSON.stringify(errorDetails)}</p>}
                </div>,
                { id: toastId, duration: 5000 }
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={clsx(
            'card p-6 border',
            isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
        )}>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
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
                            Принудительное обновление данных за выбранную дату
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-initial">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <CalendarIcon className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className={clsx(
                                'input pl-10 w-full sm:w-48',
                                isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                            )}
                        />
                    </div>

                    <button
                        onClick={handleFetchData}
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
