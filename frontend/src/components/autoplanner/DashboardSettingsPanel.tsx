import React, { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import {
    KeyIcon,
    ClockIcon,
    BuildingOfficeIcon,
    ArrowPathIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { useAutoPlannerStore } from '../../stores/useAutoPlannerStore';

import { useAuth } from '../../contexts/AuthContext';
import { localStorageUtils } from '../../utils/ui/localStorage';

interface DashboardSettingsPanelProps {
    isDark: boolean;
    onManualSync?: () => void;
}

export const DashboardSettingsPanel: React.FC<DashboardSettingsPanelProps> = ({
    isDark,
    onManualSync
}) => {
    const { isAdmin, user } = useAuth();
    const {
        apiKey,
        apiDepartmentId,
        apiAutoRefreshEnabled,
        apiLastSyncTime,
        apiNextSyncTime,
        apiSyncStatus,
        apiTimeDeliveryBeg,
        apiTimeDeliveryEnd,
        apiDateShift,
        setApiKey,
        setApiDepartmentId,
        setApiAutoRefreshEnabled,
        setApiTimeDeliveryBeg,
        setApiTimeDeliveryEnd,
        setApiDateShift,
        apiDateShiftFilterEnabled,
        setApiDateShiftFilterEnabled,
        apiTimeFilterEnabled,
        setApiTimeFilterEnabled,
        triggerApiManualSync
    } = useAutoPlannerStore();

    // --- Synchronization Logic ---
    React.useEffect(() => {
        const settings = localStorageUtils.getAllSettings();

        // 1. Sync API Key from Presets (source of truth for Admin settings)
        if (settings.fastopertorApiKey && settings.fastopertorApiKey !== apiKey) {
            setApiKey(settings.fastopertorApiKey);
        }

        // 2. Sync Department ID
        const profileDeptId = user?.divisionId ? parseInt(user.divisionId, 10) : null;
        const storedDeptId = settings.fastopertorDepartmentId ? parseInt(settings.fastopertorDepartmentId, 10) : null;

        // SOURCE OF TRUTH: 
        // For regular users: Profile divisionId > Local Stored > Current Store
        // For admins: Local Stored > Profile divisionId > Current Store

        let targetDeptId = apiDepartmentId;

        if (!isAdmin && profileDeptId !== null) {
            // Regular users MUST follow the profile set by Admin
            targetDeptId = profileDeptId;
        } else if (isAdmin) {
            // Admins can use what's in settings, but fallback to profile if empty
            targetDeptId = storedDeptId ?? profileDeptId ?? apiDepartmentId;
        } else if (profileDeptId !== null) {
            // Fallback for any other cases
            targetDeptId = profileDeptId;
        }

        if (targetDeptId !== null && targetDeptId !== apiDepartmentId) {
            setApiDepartmentId(targetDeptId);
        }
    }, [isAdmin, user?.divisionId, apiKey, apiDepartmentId, setApiKey, setApiDepartmentId]);

    const [localApiKey, setLocalApiKey] = useState(apiKey || '');

    // Update local state when store changes (e.g. after sync)
    React.useEffect(() => {
        setLocalApiKey(apiKey || '');
    }, [apiKey]);

    const [localDepartmentId, setLocalDepartmentId] = useState<string>(apiDepartmentId?.toString() || '');

    // Sync local Department ID state when store changes (e.g. from user profile sync)
    React.useEffect(() => {
        if (apiDepartmentId) {
            setLocalDepartmentId(apiDepartmentId.toString());
        }
    }, [apiDepartmentId]);

    const handleSaveSettings = useCallback(() => {
        // Only allow saving API Key if admin, or strictly if it's the one from presets? 
        // Actually, if we disable the input, the user can't change 'localApiKey'.
        // But if they click save, 'localApiKey' is saved to the store.
        // If 'localApiKey' was synced from store, it's fine.
        setApiKey(localApiKey.trim());
        setApiDepartmentId(localDepartmentId ? parseInt(localDepartmentId, 10) : null);
    }, [localApiKey, localDepartmentId, setApiKey, setApiDepartmentId]);

    const handleToggleAutoRefresh = useCallback(() => {
        if (!apiAutoRefreshEnabled && localApiKey.trim()) {
            handleSaveSettings();
        }
        setApiAutoRefreshEnabled(!apiAutoRefreshEnabled);
    }, [apiAutoRefreshEnabled, localApiKey, handleSaveSettings, setApiAutoRefreshEnabled]);

    // Sync Time inputs with Date Shift
    React.useEffect(() => {
        if (apiDateShift && apiTimeDeliveryBeg && apiTimeDeliveryEnd) {
            const datePart = apiDateShift; // YYYY-MM-DD

            // Helper to replace date part of datetime-local string
            const replaceDate = (datetime: string, newDate: string) => {
                if (!datetime) return '';
                const parts = datetime.split('T');
                if (parts.length < 2) return datetime;
                return `${newDate}T${parts[1]}`;
            };

            const newStart = replaceDate(apiTimeDeliveryBeg, datePart);
            const newEnd = replaceDate(apiTimeDeliveryEnd, datePart);

            // Only update if actually different to avoid loops
            if (newStart !== apiTimeDeliveryBeg) setApiTimeDeliveryBeg(newStart);
            if (newEnd !== apiTimeDeliveryEnd) setApiTimeDeliveryEnd(newEnd);
        }
    }, [apiDateShift, apiTimeDeliveryBeg, apiTimeDeliveryEnd, setApiTimeDeliveryBeg, setApiTimeDeliveryEnd]);

    const handleManualSync = useCallback(() => {
        handleSaveSettings(); // Ensure settings are saved before sync
        triggerApiManualSync();
        if (onManualSync) onManualSync();
    }, [handleSaveSettings, triggerApiManualSync, onManualSync]);

    const formatTimeAgo = (timestamp: number | null) => {
        if (!timestamp) return 'Никогда';
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return `${seconds} сек назад`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes} мин назад`;
        const hours = Math.floor(minutes / 60);
        return `${hours} ч назад`;
    };

    const formatTimeUntil = (timestamp: number | null) => {
        if (!timestamp) return '--';
        const seconds = Math.floor((timestamp - Date.now()) / 1000);
        if (seconds < 0) return 'Сейчас';
        if (seconds < 60) return `${seconds} сек`;
        const minutes = Math.floor(seconds / 60);
        return `${minutes} мин`;
    };

    const getStatusIcon = () => {
        switch (apiSyncStatus) {
            case 'syncing':
                return <ArrowPathIcon className="w-4 h-4 animate-spin text-blue-500" />;
            case 'error':
                return <ExclamationCircleIcon className="w-4 h-4 text-red-500" />;
            case 'idle':
                return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
            default:
                return null;
        }
    };

    return (
        <div className="space-y-4">
            <p className={clsx('text-xs mb-3', isDark ? 'text-gray-400' : 'text-gray-500')}>
                Настройка интеграции с Dashboard API для автоматического получения заказов.
                Вы можете использовать ручную выгрузку через Excel, отключив автообновление.
            </p>

            {/* Auto-Refresh Toggle */}
            <div className={clsx(
                'flex items-center justify-between p-3 rounded-xl border transition-all',
                apiAutoRefreshEnabled
                    ? (isDark ? 'bg-blue-900/20 border-blue-700/50' : 'bg-blue-50 border-blue-200')
                    : (isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-200')
            )}>
                <label className="flex items-center gap-3 cursor-pointer flex-1">
                    <div className="relative">
                        <input
                            type="checkbox"
                            checked={apiAutoRefreshEnabled}
                            onChange={handleToggleAutoRefresh}
                            className="sr-only"
                        />
                        <div className={clsx(
                            "w-10 h-6 rounded-full transition-colors",
                            apiAutoRefreshEnabled ? "bg-blue-600" : (isDark ? "bg-gray-600" : "bg-gray-300")
                        )}></div>
                        <div className={clsx(
                            "absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform",
                            apiAutoRefreshEnabled ? "translate-x-4" : "translate-x-0"
                        )}></div>
                    </div>
                    <div>
                        <div className={clsx('font-medium text-sm', isDark ? 'text-gray-200' : 'text-gray-900')}>
                            Автообновление API
                        </div>
                        <div className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            {apiAutoRefreshEnabled
                                ? 'Включено: данные обновляются каждые 5 мин'
                                : 'Выключено: используется только ручной режим или Excel'}
                        </div>
                    </div>
                </label>
            </div>

            {/* Status Bar */}
            <div className={clsx(
                'flex items-center justify-between p-2 rounded-lg text-xs border',
                isDark ? 'bg-gray-900/50 border-gray-700' : 'bg-gray-50 border-gray-100'
            )}>
                <div className="flex items-center gap-2">
                    {getStatusIcon()}
                    <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>
                        {apiSyncStatus === 'syncing' && 'Синхронизация...'}
                        {apiSyncStatus === 'error' && 'Ошибка синхронизации'}
                        {apiSyncStatus === 'idle' && `Последняя: ${formatTimeAgo(apiLastSyncTime)}`}
                    </span>
                </div>
                {apiAutoRefreshEnabled && (
                    <span className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>
                        Следующая: {formatTimeUntil(apiNextSyncTime)}
                    </span>
                )}
            </div>

            {/* Expanded Settings */}
            <div className="space-y-3 pt-2">
                {/* API Key */}
                <div>
                    <label className={clsx('block text-xs font-medium mb-1', isDark ? 'text-gray-300' : 'text-gray-700')}>
                        <KeyIcon className="w-3 h-3 inline mr-1" />
                        API Ключ {isAdmin ? '(Администратор)' : '(Только чтение)'}
                    </label>
                    <input
                        type="password"
                        value={localApiKey}
                        onChange={(e) => isAdmin && setLocalApiKey(e.target.value)}
                        disabled={!isAdmin}
                        placeholder={!isAdmin ? "Ключ задается администратором" : "Введите API ключ"}
                        className={clsx(
                            'w-full px-3 py-1.5 rounded-lg text-xs border transition-colors',
                            !isAdmin && 'opacity-60 cursor-not-allowed',
                            isDark
                                ? 'bg-gray-900 border-gray-700 text-gray-100 placeholder-gray-500 focus:border-blue-500'
                                : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
                        )}
                    />
                </div>

                {/* Date Shift (Explicit Date for Sync) */}
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <label className={clsx('block text-xs font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>
                            <ClockIcon className="w-3 h-3 inline mr-1" />
                            Дата смены (dateShift)
                        </label>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-500">{apiDateShiftFilterEnabled ? 'Вкл' : 'Выкл'}</span>
                            <label className="relative inline-flex items-center cursor-pointer scale-75 origin-right">
                                <input
                                    type="checkbox"
                                    checked={apiDateShiftFilterEnabled}
                                    onChange={(e) => setApiDateShiftFilterEnabled(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-7 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>
                    </div>
                    <input
                        type="date"
                        value={apiDateShift}
                        disabled={!apiDateShiftFilterEnabled}
                        onChange={(e) => setApiDateShift(e.target.value)}
                        placeholder="Оставьте пустым для автоопределения"
                        className={clsx(
                            'w-full px-3 py-1.5 rounded-lg text-xs border transition-colors',
                            !apiDateShiftFilterEnabled && 'opacity-50 cursor-not-allowed',
                            isDark
                                ? 'bg-gray-900 border-gray-700 text-gray-100 focus:border-blue-500'
                                : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
                        )}
                    />
                    <p className={clsx('mt-1 text-[10px]', isDark ? 'text-gray-500' : 'text-gray-500')}>
                        Если не указана, будет использована дата из "Время начала". Оставьте пустым для поиска только по времени.
                    </p>
                </div>

                {/* Time Window */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className={clsx('block text-xs font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>
                            Время доставки (окно)
                        </label>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-500">{apiTimeFilterEnabled ? 'Вкл' : 'Выкл'}</span>
                            <label className="relative inline-flex items-center cursor-pointer scale-75 origin-right">
                                <input
                                    type="checkbox"
                                    checked={apiTimeFilterEnabled}
                                    onChange={(e) => setApiTimeFilterEnabled(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-7 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className={clsx('block text-[10px] uppercase font-semibold mb-1', isDark ? 'text-gray-500' : 'text-gray-400')}>
                                <ClockIcon className="w-3 h-3 inline mr-1" />
                                Начало
                            </label>
                            <input
                                type="datetime-local"
                                value={apiTimeDeliveryBeg}
                                disabled={!apiTimeFilterEnabled}
                                onChange={(e) => setApiTimeDeliveryBeg(e.target.value)}
                                className={clsx(
                                    'w-full px-2 py-1.5 rounded-lg text-xs border transition-colors',
                                    !apiTimeFilterEnabled && 'opacity-50 cursor-not-allowed',
                                    isDark
                                        ? 'bg-gray-900 border-gray-700 text-gray-100 focus:border-blue-500'
                                        : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
                                )}
                            />
                        </div>
                        <div>
                            <label className={clsx('block text-[10px] uppercase font-semibold mb-1', isDark ? 'text-gray-500' : 'text-gray-400')}>
                                <ClockIcon className="w-3 h-3 inline mr-1" />
                                Конец
                            </label>
                            <input
                                type="datetime-local"
                                value={apiTimeDeliveryEnd}
                                disabled={!apiTimeFilterEnabled}
                                onChange={(e) => setApiTimeDeliveryEnd(e.target.value)}
                                className={clsx(
                                    'w-full px-2 py-1.5 rounded-lg text-xs border transition-colors',
                                    !apiTimeFilterEnabled && 'opacity-50 cursor-not-allowed',
                                    isDark
                                        ? 'bg-gray-900 border-gray-700 text-gray-100 focus:border-blue-500'
                                        : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
                                )}
                            />
                        </div>
                    </div>
                </div>

                {/* Department ID */}
                <div>
                    <label className={clsx('block text-xs font-medium mb-1', isDark ? 'text-gray-300' : 'text-gray-700')}>
                        <BuildingOfficeIcon className="w-3 h-3 inline mr-1" />
                        ID Подразделения {isAdmin ? '(Администратор)' : '(Только чтение)'}
                    </label>
                    <input
                        type="number"
                        value={localDepartmentId}
                        onChange={(e) => isAdmin && setLocalDepartmentId(e.target.value)}
                        disabled={!isAdmin}
                        placeholder={!isAdmin ? "ID задается администратором" : "100000052"}
                        className={clsx(
                            'w-full px-3 py-1.5 rounded-lg text-xs border transition-colors',
                            !isAdmin && 'opacity-60 cursor-not-allowed',
                            isDark
                                ? 'bg-gray-900 border-gray-700 text-gray-100 placeholder-gray-500 focus:border-blue-500'
                                : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
                        )}
                    />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                    <button
                        onClick={handleSaveSettings}
                        className={clsx(
                            'flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors',
                            isDark
                                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                : 'bg-blue-500 hover:bg-blue-600 text-white'
                        )}
                    >
                        Сохранить настройки API
                    </button>
                    <button
                        onClick={handleManualSync}
                        disabled={apiSyncStatus === 'syncing' || !localApiKey.trim()}
                        className={clsx(
                            'flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1',
                            apiSyncStatus === 'syncing' || !localApiKey.trim()
                                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                : isDark
                                    ? 'bg-green-600 hover:bg-green-700 text-white'
                                    : 'bg-green-500 hover:bg-green-600 text-white'
                        )}
                    >
                        <ArrowPathIcon className={clsx('w-3 h-3', apiSyncStatus === 'syncing' && 'animate-spin')} />
                        Синхронизировать сейчас
                    </button>
                </div>
            </div>
        </div>
    );
};
