import React from 'react';
import { clsx } from 'clsx';
import { NotificationPreferences } from '../../types';

interface ExtraSettingsPanelProps {
    isDark: boolean;
    enableOrderCombining: boolean;
    combineMaxDistanceMeters: number;
    combineMaxTimeWindowMinutes: number;
    enableNotifications: boolean;
    notificationPreferences: NotificationPreferences;
    trafficImpactLevel: 'low' | 'medium' | 'high';
    lateDeliveryPenalty: number;
    updatePlanningSettings: (updates: any) => void;
    setEnableNotifications: (val: boolean) => void;
    setNotificationPreferences: (val: NotificationPreferences) => void;
}

export const ExtraSettingsPanel: React.FC<ExtraSettingsPanelProps> = React.memo(({
    isDark,
    enableOrderCombining,
    combineMaxDistanceMeters,
    combineMaxTimeWindowMinutes,
    enableNotifications,
    notificationPreferences,
    trafficImpactLevel,
    lateDeliveryPenalty,
    updatePlanningSettings,
    setEnableNotifications,
    setNotificationPreferences,
}) => {
    return (
        <div className="space-y-4">
            {/* Объединение заказов - компактная версия */}
            <div className={clsx(
                'rounded-xl p-4 border space-y-2',
                isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-gray-50'
            )}>
                <div className="text-xs font-semibold">Объединение заказов</div>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                        type="checkbox"
                        checked={enableOrderCombining}
                        onChange={(e) => updatePlanningSettings({ enableOrderCombining: e.target.checked })}
                        className="rounded w-3.5 h-3.5"
                    />
                    <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Автоматически объединять</span>
                </label>
                {enableOrderCombining && (
                    <div className="space-y-2 pl-5">
                        <label className="flex items-center justify-between gap-2 text-xs">
                            <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Расстояние (м)</span>
                            <input
                                type="number"
                                min={100}
                                max={2000}
                                step={50}
                                value={combineMaxDistanceMeters}
                                onChange={(e) => updatePlanningSettings({ combineMaxDistanceMeters: Math.max(100, Math.min(2000, Number(e.target.value) || 500)) })}
                                className={clsx('w-20 rounded-lg p-1.5 text-right text-xs', isDark ? 'bg-gray-800 text-gray-100 border border-gray-700' : 'bg-white text-gray-900 border border-gray-300')}
                            />
                        </label>
                        <label className="flex items-center justify-between gap-2 text-xs">
                            <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Окно (мин)</span>
                            <input
                                type="number"
                                min={5}
                                max={120}
                                step={5}
                                value={combineMaxTimeWindowMinutes}
                                onChange={(e) => updatePlanningSettings({ combineMaxTimeWindowMinutes: Math.max(5, Math.min(120, Number(e.target.value) || 30)) })}
                                className={clsx('w-20 rounded-lg p-1.5 text-right text-xs', isDark ? 'bg-gray-800 text-gray-100 border border-gray-700' : 'bg-white text-gray-900 border border-gray-300')}
                            />
                        </label>
                    </div>
                )}
            </div>

            {/* Предупреждения - компактная версия */}
            <div className={clsx(
                'rounded-xl p-4 border space-y-2',
                isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-gray-50'
            )}>
                <div className="text-xs font-semibold">Предупреждения</div>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                        type="checkbox"
                        checked={enableNotifications}
                        onChange={(e) => setEnableNotifications(e.target.checked)}
                        className="rounded w-3.5 h-3.5"
                    />
                    <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Включить предупреждения</span>
                </label>
                {enableNotifications && (
                    <div className="space-y-1.5 pl-5">
                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                                type="checkbox"
                                checked={notificationPreferences.enableWarnings}
                                onChange={(e) => setNotificationPreferences({ ...notificationPreferences, enableWarnings: e.target.checked })}
                                className="rounded w-3.5 h-3.5"
                            />
                            <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Риски опоздания</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                                type="checkbox"
                                checked={notificationPreferences.enableTrafficWarnings}
                                onChange={(e) => setNotificationPreferences({ ...notificationPreferences, enableTrafficWarnings: e.target.checked })}
                                className="rounded w-3.5 h-3.5"
                            />
                            <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Пробки</span>
                        </label>
                    </div>
                )}
            </div>
            {/* Продвинутая оптимизация */}
            <div className={clsx(
                'rounded-xl p-4 border space-y-3',
                isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-gray-50'
            )}>
                <div className="text-xs font-semibold flex items-center gap-2">
                    <span>⚙️</span> Продвинутая оптимизация
                </div>

                <div className="space-y-3">
                    <label className="block space-y-1.5">
                        <div className="flex justify-between items-center text-[10px] uppercase tracking-wider opacity-60">
                            <span>Учет пробок</span>
                            <span className="font-bold">{trafficImpactLevel === 'low' ? 'Слабый' : trafficImpactLevel === 'medium' ? 'Средний' : 'Сильный'}</span>
                        </div>
                        <select
                            value={trafficImpactLevel}
                            onChange={(e) => updatePlanningSettings({ trafficImpactLevel: e.target.value })}
                            className={clsx(
                                'w-full rounded-lg p-2 text-xs border transition-all',
                                isDark ? 'bg-gray-800 text-white border-gray-700 focus:border-blue-500' : 'bg-white text-gray-900 border-gray-300 focus:border-blue-500'
                            )}
                        >
                            <option value="low">Слабый (быстрые маршруты)</option>
                            <option value="medium">Средний (баланс)</option>
                            <option value="high">Сильный (макс. надежность)</option>
                        </select>
                    </label>

                    <label className="block space-y-1.5">
                        <div className="flex justify-between items-center text-[10px] uppercase tracking-wider opacity-60">
                            <span>Штраф за опоздание</span>
                            <span className="font-bold">{lateDeliveryPenalty}%</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            step="10"
                            value={lateDeliveryPenalty}
                            onChange={(e) => updatePlanningSettings({ lateDeliveryPenalty: Number(e.target.value) })}
                            className="w-full h-1.5 bg-blue-500/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <div className="flex justify-between text-[8px] opacity-40 px-1">
                            <span>Скорость</span>
                            <span>Точность</span>
                        </div>
                    </label>
                </div>
            </div>
        </div>
    );
});
