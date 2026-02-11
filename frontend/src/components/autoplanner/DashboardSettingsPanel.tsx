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
import toast from 'react-hot-toast';
import { useAutoPlannerStore } from '../../stores/useAutoPlannerStore';

import { useAuth } from '../../contexts/AuthContext';
import { localStorageUtils } from '../../utils/ui/localStorage';

interface DashboardSettingsPanelProps {
    isDark: boolean;
    onManualSync?: () => void;
    // New props for Controlled Mode (Admin Presets)
    initialSettings?: Record<string, any>;
    onSettingsChange?: (newSettings: Record<string, any>) => void;
}

export const DashboardSettingsPanel: React.FC<DashboardSettingsPanelProps> = ({
    isDark,
    onManualSync,
    initialSettings,
    onSettingsChange
}) => {
    const { isAdmin, user } = useAuth();

    // --- Stable Store Selectors ---
    const storeApiKey = useAutoPlannerStore(s => s.apiKey);
    const storeApiDepartmentId = useAutoPlannerStore(s => s.apiDepartmentId);
    const storeApiAutoRefreshEnabled = useAutoPlannerStore(s => s.apiAutoRefreshEnabled);
    const storeApiDateShift = useAutoPlannerStore(s => s.apiDateShift);
    const storeApiDateShiftFilterEnabled = useAutoPlannerStore(s => s.apiDateShiftFilterEnabled);
    const storeApiTimeDeliveryBeg = useAutoPlannerStore(s => s.apiTimeDeliveryBeg);
    const storeApiTimeDeliveryEnd = useAutoPlannerStore(s => s.apiTimeDeliveryEnd);
    const storeApiTimeFilterEnabled = useAutoPlannerStore(s => s.apiTimeFilterEnabled);
    const storeApiSyncStatus = useAutoPlannerStore(s => s.apiSyncStatus);
    const storeApiLastSyncTime = useAutoPlannerStore(s => s.apiLastSyncTime);
    const storeApiNextSyncTime = useAutoPlannerStore(s => s.apiNextSyncTime);

    // Actions
    const setApiKey = useAutoPlannerStore(s => s.setApiKey);
    const setApiDepartmentId = useAutoPlannerStore(s => s.setApiDepartmentId);
    const setApiAutoRefreshEnabled = useAutoPlannerStore(s => s.setApiAutoRefreshEnabled);
    const setApiDateShift = useAutoPlannerStore(s => s.setApiDateShift);
    const setApiDateShiftFilterEnabled = useAutoPlannerStore(s => s.setApiDateShiftFilterEnabled);
    const setApiTimeDeliveryBeg = useAutoPlannerStore(s => s.setApiTimeDeliveryBeg);
    const setApiTimeDeliveryEnd = useAutoPlannerStore(s => s.setApiTimeDeliveryEnd);
    const setApiTimeFilterEnabled = useAutoPlannerStore(s => s.setApiTimeFilterEnabled);
    const triggerApiManualSync = useAutoPlannerStore(s => s.triggerApiManualSync);

    // --- State Logic: Controlled vs Uncontrolled ---
    const isControlled = !!onSettingsChange;

    // Local state for controlled mode
    const [localState, setLocalState] = useState({
        apiKey: initialSettings?.fastopertorApiKey || '',
        departmentId: initialSettings?.fastopertorDepartmentId ? String(initialSettings.fastopertorDepartmentId) : '',
        autoRefresh: initialSettings?.apiAutoRefreshEnabled || false,
        dateShift: initialSettings?.apiDateShift || '',
        dateShiftEnabled: initialSettings?.apiDateShiftFilterEnabled !== false, // Default true
        timeDeliveryBeg: initialSettings?.apiTimeDeliveryBeg || (() => {
            const now = new Date();
            now.setHours(11, 0, 0, 0);
            return formatDateTimeForInput(now);
        })(),
        timeDeliveryEnd: initialSettings?.apiTimeDeliveryEnd || (() => {
            const now = new Date();
            now.setHours(23, 0, 0, 0);
            return formatDateTimeForInput(now);
        })(),
        timeFilterEnabled: initialSettings?.apiTimeFilterEnabled || false
    });

    // Helper to format date for input
    function formatDateTimeForInput(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    // Effect to update local state when initialSettings change (in controlled mode)
    React.useEffect(() => {
        if (isControlled && initialSettings) {
            setLocalState({
                apiKey: initialSettings.fastopertorApiKey || '',
                departmentId: initialSettings.fastopertorDepartmentId ? String(initialSettings.fastopertorDepartmentId) : '',
                autoRefresh: initialSettings.apiAutoRefreshEnabled || false,
                dateShift: initialSettings.apiDateShift || '',
                dateShiftEnabled: initialSettings.apiDateShiftFilterEnabled !== false,
                timeDeliveryBeg: initialSettings.apiTimeDeliveryBeg || localState.timeDeliveryBeg,
                timeDeliveryEnd: initialSettings.apiTimeDeliveryEnd || localState.timeDeliveryEnd,
                timeFilterEnabled: initialSettings.apiTimeFilterEnabled || false
            });
        }
    }, [initialSettings, isControlled]);


    // Accessors based on mode
    const apiKey = isControlled ? localState.apiKey : storeApiKey;
    const apiDepartmentId = isControlled ? (localState.departmentId ? parseInt(localState.departmentId) : null) : storeApiDepartmentId;
    const apiAutoRefreshEnabled = isControlled ? localState.autoRefresh : storeApiAutoRefreshEnabled;
    const apiDateShift = isControlled ? localState.dateShift : storeApiDateShift;
    const apiDateShiftFilterEnabled = isControlled ? localState.dateShiftEnabled : storeApiDateShiftFilterEnabled;
    const apiTimeDeliveryBeg = isControlled ? localState.timeDeliveryBeg : storeApiTimeDeliveryBeg;
    const apiTimeDeliveryEnd = isControlled ? localState.timeDeliveryEnd : storeApiTimeDeliveryEnd;
    const apiTimeFilterEnabled = isControlled ? localState.timeFilterEnabled : storeApiTimeFilterEnabled;
    const apiSyncStatus = isControlled ? 'idle' : storeApiSyncStatus; // Admin mode doesn't sync real status
    const apiLastSyncTime = isControlled ? null : storeApiLastSyncTime;
    const apiNextSyncTime = isControlled ? null : storeApiNextSyncTime;


    // --- Local editing state (for inputs) ---
    const [editApiKey, setEditApiKey] = useState(apiKey || '');
    const [editDepartmentId, setEditDepartmentId] = useState<string>(apiDepartmentId?.toString() || '');

    // Sync edit state when actual values change
    React.useEffect(() => {
        setEditApiKey(apiKey || '');
    }, [apiKey]);

    React.useEffect(() => {
        setEditDepartmentId(apiDepartmentId?.toString() || '');
    }, [apiDepartmentId]);


    // Handlers
    const handleSaveSettings = useCallback(() => {
        const newDepartmentId = editDepartmentId ? parseInt(editDepartmentId, 10) : null;

        if (isControlled && onSettingsChange) {
            // Propagate changes to parent
            onSettingsChange({
                ...initialSettings,
                fastopertorApiKey: editApiKey.trim(),
                fastopertorDepartmentId: newDepartmentId,
                // Also save these inferred settings if they changed via other handlers, but for now just saving keys
            });
            // Note: For controlled mode, other fields update immediately via their specific handlers below
        } else {
            // Global store update
            setApiKey(editApiKey.trim());
            setApiDepartmentId(newDepartmentId);
        }
    }, [editApiKey, editDepartmentId, isControlled, onSettingsChange, initialSettings, setApiKey, setApiDepartmentId]);

    const handleToggleAutoRefresh = useCallback(() => {
        const newValue = !apiAutoRefreshEnabled;
        if (isControlled && onSettingsChange) {
            onSettingsChange({ ...initialSettings, apiAutoRefreshEnabled: newValue });
            setLocalState(prev => ({ ...prev, autoRefresh: newValue }));
        } else {
            if (!newValue && editApiKey.trim()) {
                handleSaveSettings();
            }
            setApiAutoRefreshEnabled(newValue);
        }
    }, [apiAutoRefreshEnabled, isControlled, onSettingsChange, initialSettings, setApiAutoRefreshEnabled, editApiKey, handleSaveSettings]);

    // Updated handler to sync times immediately when Date Shift changes
    const handleDateShiftChange = (value: string) => {
        let updates: any = { apiDateShift: value };
        let newLocalState: any = { dateShift: value };

        // Logic to sync times with new date
        if (value && apiTimeDeliveryBeg && apiTimeDeliveryEnd) {
            const replaceDate = (datetime: string, newDate: string) => {
                if (!datetime) return '';
                const parts = datetime.split('T');
                if (parts.length < 2) return datetime;
                return `${newDate}T${parts[1]}`;
            };

            const newStart = replaceDate(apiTimeDeliveryBeg, value);
            const newEnd = replaceDate(apiTimeDeliveryEnd, value);

            if (newStart !== apiTimeDeliveryBeg) {
                updates.apiTimeDeliveryBeg = newStart;
                newLocalState.timeDeliveryBeg = newStart;
            }
            if (newEnd !== apiTimeDeliveryEnd) {
                updates.apiTimeDeliveryEnd = newEnd;
                newLocalState.timeDeliveryEnd = newEnd;
            }
        }

        if (isControlled && onSettingsChange) {
            onSettingsChange({ ...initialSettings, ...updates });
            setLocalState(prev => ({ ...prev, ...newLocalState }));
        } else {
            setApiDateShift(value);
            // Note: Global store additional syncs might be needed if we want same behavior,
            // but for now focusing on fixing the Admin Presets loop.
            if (updates.apiTimeDeliveryBeg) setApiTimeDeliveryBeg(updates.apiTimeDeliveryBeg);
            if (updates.apiTimeDeliveryEnd) setApiTimeDeliveryEnd(updates.apiTimeDeliveryEnd);
        }
    };

    const handleDateShiftFilterToggle = (checked: boolean) => {
        if (isControlled && onSettingsChange) {
            onSettingsChange({ ...initialSettings, apiDateShiftFilterEnabled: checked });
            setLocalState(prev => ({ ...prev, dateShiftEnabled: checked }));
        } else {
            setApiDateShiftFilterEnabled(checked);
        }
    };

    const handleTimeFilterToggle = (checked: boolean) => {
        if (isControlled && onSettingsChange) {
            onSettingsChange({ ...initialSettings, apiTimeFilterEnabled: checked });
            setLocalState(prev => ({ ...prev, timeFilterEnabled: checked }));
        } else {
            setApiTimeFilterEnabled(checked);
        }
    };

    const handleTimeBegChange = (value: string) => {
        if (isControlled && onSettingsChange) {
            onSettingsChange({ ...initialSettings, apiTimeDeliveryBeg: value });
            setLocalState(prev => ({ ...prev, timeDeliveryBeg: value }));
        } else {
            setApiTimeDeliveryBeg(value);
        }
    };

    const handleTimeEndChange = (value: string) => {
        if (isControlled && onSettingsChange) {
            onSettingsChange({ ...initialSettings, apiTimeDeliveryEnd: value });
            setLocalState(prev => ({ ...prev, timeDeliveryEnd: value }));
        } else {
            setApiTimeDeliveryEnd(value);
        }
    };


    // Validation Logic remains similar but uses accessors
    // Uncontrolled logic regarding user profile sync is SKIPPED in controlled mode
    // because Admin sets explicit values.

    React.useEffect(() => {
        if (isControlled) return; // Skip for admin mode

        const settings = localStorageUtils.getAllSettings();

        // 1. Sync API Key from Presets
        if (settings.fastopertorApiKey && settings.fastopertorApiKey !== storeApiKey) {
            setApiKey(settings.fastopertorApiKey);
        }

        // 2. Sync Department ID
        const profileDeptId = user?.divisionId ? parseInt(user.divisionId, 10) : null;
        const storedDeptId = settings.fastopertorDepartmentId ? parseInt(settings.fastopertorDepartmentId, 10) : null;
        let targetDeptId = storeApiDepartmentId;

        if (!isAdmin && profileDeptId !== null) {
            targetDeptId = profileDeptId;
        } else if (isAdmin) {
            targetDeptId = storedDeptId ?? profileDeptId ?? storeApiDepartmentId;
        } else if (profileDeptId !== null) {
            targetDeptId = profileDeptId;
        }

        if (targetDeptId !== null && targetDeptId !== storeApiDepartmentId) {
            setApiDepartmentId(targetDeptId);
        }
    }, [isControlled, isAdmin, user?.divisionId, storeApiKey, storeApiDepartmentId, setApiKey, setApiDepartmentId]);


    const handleManualSync = useCallback(() => {
        handleSaveSettings();
        if (!isControlled) {
            triggerApiManualSync();
        } else {
            toast.success('Настройки сохранены (режим администратора)');
        }
        if (onManualSync) onManualSync();
    }, [handleSaveSettings, isControlled, triggerApiManualSync, onManualSync]);

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
            <style>{`
                .glass-panel-settings {
                    background: rgba(255, 255, 255, 0.6);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    border: 1px solid rgba(255, 255, 255, 0.3);
                }
                .dark .glass-panel-settings {
                    background: rgba(17, 24, 39, 0.6);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                }
            `}</style>

            <div className={clsx(
                'p-4 rounded-2xl glass-panel-settings transition-all hover:shadow-lg',
                isDark ? 'shadow-black/20' : 'shadow-blue-900/5'
            )}>
                <p className={clsx('text-xs mb-3 font-medium', isDark ? 'text-gray-300' : 'text-gray-600')}>
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

                {/* Status Bar - Hide in Admin Presets Mode if no sync status available */}
                {!isControlled && (
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
                )}

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
                            value={editApiKey}
                            onChange={(e) => isAdmin && setEditApiKey(e.target.value)}
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
                                        onChange={(e) => handleDateShiftFilterToggle(e.target.checked)}
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
                            onChange={(e) => handleDateShiftChange(e.target.value)}
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
                                        onChange={(e) => handleTimeFilterToggle(e.target.checked)}
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
                                    onChange={(e) => handleTimeBegChange(e.target.value)}
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
                                    onChange={(e) => handleTimeEndChange(e.target.value)}
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
                            value={editDepartmentId}
                            onChange={(e) => isAdmin && setEditDepartmentId(e.target.value)}
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
                            {isControlled ? 'Сохранить параметры' : 'Сохранить настройки API'}
                        </button>
                        <button
                            onClick={handleManualSync}
                            disabled={apiSyncStatus === 'syncing' || !editApiKey.trim()}
                            className={clsx(
                                'flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1',
                                apiSyncStatus === 'syncing' || !editApiKey.trim()
                                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                    : isDark
                                        ? 'bg-green-600 hover:bg-green-700 text-white'
                                        : 'bg-green-500 hover:bg-green-600 text-white'
                            )}
                        >
                            <ArrowPathIcon className={clsx('w-3 h-3', apiSyncStatus === 'syncing' && 'animate-spin')} />
                            {isControlled ? 'Проверить синхронизацию' : 'Синхронизировать сейчас'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
