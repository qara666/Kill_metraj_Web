import React, { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import { ClockIcon, BuildingOfficeIcon, KeyIcon } from '@heroicons/react/24/outline';
import { dashboardApi } from '../../services/dashboardApi';
import { useAutoPlannerStore } from '../../stores/useAutoPlannerStore';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { ProcessedExcelData } from '../../types';
import { formatDateForApi, formatDateTimeForApi } from '../../utils/data/apiDataTransformer';

interface DashboardImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onDataLoaded: (data: ProcessedExcelData) => void;
    isDark: boolean;
}

// Форматирование даты для input type="datetime-local" (yyyy-MM-ddTHH:mm)
const formatDateTimeForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
};

// Парсинг datetime-local в Date объект
const parseDateTimeFromInput = (dateTimeString: string): Date => {
    return new Date(dateTimeString);
};

export const DashboardImportModal: React.FC<DashboardImportModalProps> = ({
    isOpen,
    onClose,
    onDataLoaded,
    isDark,
}) => {
    const {
        apiKey,
        apiDepartmentId,
        setApiKey,
        setApiDepartmentId,
        apiTimeFilterEnabled,
        setApiTimeFilterEnabled
    } = useDashboardStore();

    const { setLastApiImport } = useAutoPlannerStore();

    const [localApiKey, setLocalApiKey] = useState(apiKey);
    const [localDepartmentId, setLocalDepartmentId] = useState<string>(apiDepartmentId?.toString() || '');

    // Инициализация с текущей датой и временем
    const [dateTimeDeliveryBeg, setDateTimeDeliveryBeg] = useState(() => {
        const now = new Date();
        now.setHours(11, 0, 0, 0);
        return formatDateTimeForInput(now);
    });

    const [dateTimeDeliveryEnd, setDateTimeDeliveryEnd] = useState(() => {
        const now = new Date();
        now.setHours(23, 0, 0, 0);
        return formatDateTimeForInput(now);
    });

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleImport = useCallback(async () => {
        // API Key теперь опционален на фронтенде, так как сервер использует EXTERNAL_API_KEY из окружения
        const effectiveApiKey = localApiKey.trim() || 'server_managed';

        setIsLoading(true);
        setError(null);

        try {
            // Парсинг datetime из input
            const deliveryStart = parseDateTimeFromInput(dateTimeDeliveryBeg);
            const deliveryEnd = parseDateTimeFromInput(dateTimeDeliveryEnd);

            // Получение dateShift из начальной даты
            const dateShift = formatDateForApi(deliveryStart);

            const params: any = {
                apiKey: effectiveApiKey,
                dateShift,
                departmentId: localDepartmentId ? parseInt(localDepartmentId, 10) : undefined,
                top: 1000,
            };

            if (apiTimeFilterEnabled) {
                Object.assign(params, {
                    timeDeliveryBeg: formatDateTimeForApi(deliveryStart),
                    timeDeliveryEnd: formatDateTimeForApi(deliveryEnd),
                });
            }

            console.log(' Отправка запроса к Dashboard API:', params);
            const startTime = performance.now();

            const result = await dashboardApi.fetchOrdersFromDashboard(params);

            const endTime = performance.now();
            const duration = endTime - startTime;
            console.log(`️ Загрузка из Dashboard API заняла ${duration.toFixed(2)}ms`);

            if (result.success && result.data) {
                // Сохранение настроек
                setApiKey(localApiKey.trim());
                setApiDepartmentId(params.departmentId || null);
                setLastApiImport({
                    dateShift: params.dateShift,
                    timeDeliveryBeg: params.timeDeliveryBeg || '',
                    timeDeliveryEnd: params.timeDeliveryEnd || '',
                });

                console.log(` Загружено ${result.data.orders.length} заказов и ${result.data.couriers.length} курьеров`);
                onDataLoaded(result.data);
                onClose();
            } else {
                setError(result.error || 'Неизвестная ошибка при загрузке данных');
            }
        } catch (err) {
            console.error(' Ошибка загрузки из Dashboard API:', err);
            setError(err instanceof Error ? err.message : 'Произошла ошибка');
        } finally {
            setIsLoading(false);
        }
    }, [localApiKey, dateTimeDeliveryBeg, dateTimeDeliveryEnd, localDepartmentId, setApiKey, setApiDepartmentId, setLastApiImport, onDataLoaded, onClose, apiTimeFilterEnabled]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className={clsx(
                'relative w-full max-w-lg mx-4 rounded-2xl shadow-2xl border-2 overflow-hidden',
                isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            )}>
                {/* Header */}
                <div className={clsx(
                    'px-6 py-4 border-b',
                    isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
                )}>
                    <h3 className={clsx('text-lg font-bold', isDark ? 'text-white' : 'text-gray-900')}>
                        Загрузка из Dashboard API
                    </h3>
                    <p className={clsx('text-sm mt-1', isDark ? 'text-gray-400' : 'text-gray-600')}>
                        Настройте параметры для получения заказов через API
                    </p>
                </div>

                {/* Body */}
                <div className="px-6 py-4 space-y-4">
                    {/* API Key */}
                    <div>
                        <label className={clsx('block text-sm font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
                            <KeyIcon className="w-4 h-4 inline mr-1" />
                            API Ключ
                        </label>
                        <input
                            type="password"
                            value={localApiKey}
                            onChange={(e) => setLocalApiKey(e.target.value)}
                            placeholder="Введите API ключ"
                            className={clsx(
                                'w-full px-3 py-2 rounded-lg border transition-colors',
                                isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500'
                            )}
                        />
                    </div>

                    {/* DateTime Delivery Begin */}
                    <div>
                        <label className={clsx('block text-sm font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
                            <ClockIcon className="w-4 h-4 inline mr-1" />
                            Начало окна доставки
                        </label>
                        <input
                            type="datetime-local"
                            disabled={!apiTimeFilterEnabled}
                            value={dateTimeDeliveryBeg}
                            onChange={(e) => setDateTimeDeliveryBeg(e.target.value)}
                            className={clsx(
                                'w-full px-3 py-2 rounded-lg border transition-colors',
                                isDark ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-500' : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
                            )}
                        />
                        <p className={clsx('text-xs mt-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            Формат: {formatDateTimeForApi(parseDateTimeFromInput(dateTimeDeliveryBeg))}
                        </p>
                    </div>

                    {/* Time Filter Toggle */}
                    <div className="flex items-center gap-3 py-2">
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={apiTimeFilterEnabled}
                                onChange={(e) => setApiTimeFilterEnabled(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className={clsx(
                                "w-11 h-6 rounded-full peer transition-all duration-200",
                                isDark ? "bg-gray-700" : "bg-gray-200",
                                "peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white"
                            )}></div>
                        </label>
                        <span className={clsx('text-sm font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>
                            Фильтр по времени доставки (может замедлить запрос)
                        </span>
                    </div>

                    {/* DateTime Delivery End */}
                    <div className={clsx(!apiTimeFilterEnabled && 'opacity-50 pointer-events-none')}>
                        <label className={clsx('block text-sm font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
                            <ClockIcon className="w-4 h-4 inline mr-1" />
                            Конец окна доставки
                        </label>
                        <input
                            type="datetime-local"
                            value={dateTimeDeliveryEnd}
                            onChange={(e) => setDateTimeDeliveryEnd(e.target.value)}
                            className={clsx(
                                'w-full px-3 py-2 rounded-lg border transition-colors',
                                isDark ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-500' : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
                            )}
                        />
                        <p className={clsx('text-xs mt-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            Формат: {formatDateTimeForApi(parseDateTimeFromInput(dateTimeDeliveryEnd))}
                        </p>
                    </div>

                    {/* Department ID */}
                    <div>
                        <label className={clsx('block text-sm font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
                            <BuildingOfficeIcon className="w-4 h-4 inline mr-1" />
                            ID Подразделения (опционально)
                        </label>
                        <input
                            type="number"
                            value={localDepartmentId}
                            onChange={(e) => setLocalDepartmentId(e.target.value)}
                            placeholder="Например, 100000052"
                            className={clsx(
                                'w-full px-3 py-2 rounded-lg border transition-colors',
                                isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500'
                            )}
                        />
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className={clsx(
                            'p-3 rounded-lg text-sm',
                            isDark ? 'bg-red-900/30 text-red-200 border border-red-700/50' : 'bg-red-50 text-red-700 border border-red-200'
                        )}>
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className={clsx(
                    'px-6 py-4 border-t flex justify-end gap-3',
                    isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
                )}>
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className={clsx(
                            'px-4 py-2 rounded-lg font-medium transition-all',
                            isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                        )}
                    >
                        Отмена
                    </button>
                    <button
                        onClick={handleImport}
                        disabled={isLoading}
                        className={clsx(
                            'px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2',
                            isDark ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white',
                            isLoading && 'opacity-50 cursor-not-allowed'
                        )}
                    >
                        {isLoading ? (
                            <>
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Загрузка...
                            </>
                        ) : (
                            'Загрузить'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
