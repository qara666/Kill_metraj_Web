import { Switch } from '@headlessui/react';
import {
    CogIcon,
    BoltIcon,
    HandRaisedIcon,
    BellIcon,
    ArrowPathIcon,
    ClockIcon,
    MapPinIcon,
    TruckIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { useRouteCalculationStore } from '../../stores/useRouteCalculationStore';
import { API_URL } from '../../config/apiConfig';
import { toast } from 'react-hot-toast';

interface RouteCalculationSettingsProps {
    isDark?: boolean;
}

export function RouteCalculationSettings({ isDark = false }: RouteCalculationSettingsProps) {
    const { calculationMode, setCalculationMode, groupingConfig, setGroupingConfig } = useRouteCalculationStore();

    const isAutomatic = calculationMode.mode === 'automatic';

    const handleSaveGroupingToServer = async () => {
        try {
            const token = localStorage.getItem('km_access_token') || localStorage.getItem('token');
            if (!token) {
                toast.error('Не авторизован');
                return;
            }

            const res = await fetch(`${API_URL}/api/presets/sync-all`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    settings: { groupingConfig }
                })
            });

            if (!res.ok) throw new Error(`Server ${res.status}`);
            toast.success('Настройки группировки сохранены на сервере');
        } catch (e: any) {
            toast.error('Ошибка сохранения: ' + e.message);
        }
    };

    const sliderClass = clsx(
        'w-full h-2 rounded-lg appearance-none cursor-pointer accent-blue-600',
        isDark ? 'bg-white/10' : 'bg-gray-200'
    );

    const labelClass = clsx(
        'text-sm font-medium',
        isDark ? 'text-gray-300' : 'text-gray-700'
    );

    const valueClass = 'text-blue-600 font-bold';

    return (
        <div className="space-y-4">
            <div
                className={clsx(
                    'rounded-lg border p-4 space-y-4',
                    isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                )}
            >
                <div className="flex items-center space-x-2">
                    <CogIcon className={clsx('h-5 w-5', isDark ? 'text-gray-300' : 'text-gray-700')} />
                    <h3 className={clsx('font-semibold', isDark ? 'text-gray-100' : 'text-gray-900')}>
                        Режим расчета маршрутов
                    </h3>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                            {isAutomatic ? (
                                <BoltIcon className="h-5 w-5 text-blue-500" />
                            ) : (
                                <HandRaisedIcon className="h-5 w-5 text-gray-500" />
                            )}
                            <span className={clsx('font-medium', isDark ? 'text-gray-200' : 'text-gray-800')}>
                                {isAutomatic ? 'Автоматический' : 'Ручной'}
                            </span>
                        </div>
                        <Switch
                            checked={isAutomatic}
                            onChange={(checked) =>
                                setCalculationMode({ mode: checked ? 'automatic' : 'manual' })
                            }
                            className={clsx(
                                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                                isAutomatic ? 'bg-blue-600' : 'bg-gray-300'
                            )}
                        >
                            <span
                                className={clsx(
                                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                                    isAutomatic ? 'translate-x-6' : 'translate-x-1'
                                )}
                            />
                        </Switch>
                    </div>

                    {isAutomatic && (
                        <p className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>
                            Маршрут будет рассчитываться автоматически при достижении порога заказов
                        </p>
                    )}
                </div>

                {isAutomatic && (
                    <div className="space-y-4 pt-2 border-t border-gray-200 dark:border-gray-700">
                        <div className="space-y-2">
                            <label className={labelClass}>
                                Автоматический расчет при:{' '}
                                <span className={valueClass}>
                                    {calculationMode.autoTriggerThreshold}
                                </span>{' '}
                                {getOrdersWord(calculationMode.autoTriggerThreshold)}
                            </label>
                            <input
                                type="range"
                                min="1"
                                max="10"
                                value={calculationMode.autoTriggerThreshold}
                                onChange={(e) =>
                                    setCalculationMode({ autoTriggerThreshold: parseInt(e.target.value) })
                                }
                                className={sliderClass}
                            />
                            <div className="flex justify-between text-xs text-gray-500">
                                <span>1</span>
                                <span>5</span>
                                <span>10</span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                    <ArrowPathIcon className="h-4 w-4 text-gray-500" />
                                    <label className={labelClass} htmlFor="recalc-add">
                                        Пересчитывать при добавлении
                                    </label>
                                </div>
                                <Switch
                                    id="recalc-add"
                                    checked={calculationMode.recalculateOnAdd}
                                    onChange={(checked) => setCalculationMode({ recalculateOnAdd: checked })}
                                    className={clsx(
                                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                                        calculationMode.recalculateOnAdd ? 'bg-blue-600' : 'bg-gray-300'
                                    )}
                                >
                                    <span
                                        className={clsx(
                                            'inline-block h-3 h-3 transform rounded-full bg-white transition-transform',
                                            calculationMode.recalculateOnAdd ? 'translate-x-5' : 'translate-x-1'
                                        )}
                                    />
                                </Switch>
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                    <ArrowPathIcon className="h-4 w-4 text-gray-500" />
                                    <label className={labelClass} htmlFor="recalc-remove">
                                        Пересчитывать при удалении
                                    </label>
                                </div>
                                <Switch
                                    id="recalc-remove"
                                    checked={calculationMode.recalculateOnRemove}
                                    onChange={(checked) => setCalculationMode({ recalculateOnRemove: checked })}
                                    className={clsx(
                                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                                        calculationMode.recalculateOnRemove ? 'bg-blue-600' : 'bg-gray-300'
                                    )}
                                >
                                    <span
                                        className={clsx(
                                            'inline-block h-3 h-3 transform rounded-full bg-white transition-transform',
                                            calculationMode.recalculateOnRemove ? 'translate-x-5' : 'translate-x-1'
                                        )}
                                    />
                                </Switch>
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                    <BellIcon className="h-4 w-4 text-gray-500" />
                                    <label className={labelClass} htmlFor="notify">
                                        Показывать уведомления
                                    </label>
                                </div>
                                <Switch
                                    id="notify"
                                    checked={calculationMode.notifyOnCalculation}
                                    onChange={(checked) => setCalculationMode({ notifyOnCalculation: checked })}
                                    className={clsx(
                                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                                        calculationMode.notifyOnCalculation ? 'bg-blue-600' : 'bg-gray-300'
                                    )}
                                >
                                    <span
                                        className={clsx(
                                            'inline-block h-3 h-3 transform rounded-full bg-white transition-transform',
                                            calculationMode.notifyOnCalculation ? 'translate-x-5' : 'translate-x-1'
                                        )}
                                    />
                                </Switch>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div
                className={clsx(
                    'rounded-lg border p-4 space-y-4',
                    isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                )}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <TruckIcon className={clsx('h-5 w-5', isDark ? 'text-gray-300' : 'text-gray-700')} />
                        <h3 className={clsx('font-semibold', isDark ? 'text-gray-100' : 'text-gray-900')}>
                            Группировка маршрутов
                        </h3>
                    </div>
                    <button
                        onClick={handleSaveGroupingToServer}
                        className={clsx(
                            'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                            isDark
                                ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                                : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                        )}
                    >
                        Сохранить
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    <SliderSetting
                        icon={<ClockIcon className="w-4 h-4 text-gray-500" />}
                        label="Окно времени (мин)"
                        value={groupingConfig.groupWindowMinutes}
                        min={5}
                        max={30}
                        step={5}
                        onChange={(v) => setGroupingConfig({ groupWindowMinutes: v })}
                        hint="Макс. разрыв между заказами для объединения"
                        isDark={isDark}
                    />

                    <SliderSetting
                        icon={<ClockIcon className="w-4 h-4 text-gray-500" />}
                        label="TTL группы (мин)"
                        value={groupingConfig.ttlMinutes}
                        min={10}
                        max={90}
                        step={5}
                        onChange={(v) => setGroupingConfig({ ttlMinutes: v })}
                        hint="Макс. возраст группы от первого заказа"
                        isDark={isDark}
                    />

                    <SliderSetting
                        icon={<ClockIcon className="w-4 h-4 text-gray-500" />}
                        label="Макс. размах доставок (мин)"
                        value={groupingConfig.maxDeliverySpanMinutes}
                        min={30}
                        max={240}
                        step={15}
                        onChange={(v) => setGroupingConfig({ maxDeliverySpanMinutes: v })}
                        hint="Макс. разница между первой и последней доставкой"
                        isDark={isDark}
                    />

                    <SliderSetting
                        icon={<MapPinIcon className="w-4 h-4 text-gray-500" />}
                        label="Радиус от центра (км)"
                        value={groupingConfig.maxCenterDistanceKm}
                        min={5}
                        max={50}
                        step={5}
                        onChange={(v) => setGroupingConfig({ maxCenterDistanceKm: v })}
                        hint="Макс. расстояние от центра группы"
                        isDark={isDark}
                    />

                    <SliderSetting
                        icon={<MapPinIcon className="w-4 h-4 text-gray-500" />}
                        label="Радиус от первого (км)"
                        value={groupingConfig.maxFirstDistanceKm}
                        min={5}
                        max={30}
                        step={5}
                        onChange={(v) => setGroupingConfig({ maxFirstDistanceKm: v })}
                        hint="Макс. расстояние от первого заказа в группе"
                        isDark={isDark}
                    />

                    <SliderSetting
                        icon={<MapPinIcon className="w-4 h-4 text-gray-500" />}
                        label="Макс. шаг между точками (км)"
                        value={groupingConfig.maxLegDistanceKm}
                        min={5}
                        max={30}
                        step={1}
                        onChange={(v) => setGroupingConfig({ maxLegDistanceKm: v })}
                        hint="Если следующая точка дальше — маршрут разделится"
                        isDark={isDark}
                    />
                </div>

                <div
                    className={clsx(
                        'rounded-md border p-3 space-y-1',
                        isDark ? 'border-gray-600 bg-gray-800/50' : 'border-gray-100 bg-gray-50'
                    )}
                >
                    <p className={clsx('text-[10px] uppercase tracking-widest font-black opacity-40')}>
                        Подсказки
                    </p>
                    <p className={clsx('text-[11px]', isDark ? 'text-gray-400' : 'text-gray-500')}>
                        Увеличьте <b>окно</b> и <b>TTL</b> чтобы объединять больше заказов в один маршрут.
                    </p>
                    <p className={clsx('text-[11px]', isDark ? 'text-gray-400' : 'text-gray-500')}>
                        Увеличьте <b>радиус</b> если заказы далеко друг от друга, но должны быть вместе.
                    </p>
                    <p className={clsx('text-[11px]', isDark ? 'text-gray-400' : 'text-gray-500')}>
                        <b>Шаг между точками</b> — макс. расстояние от предыдущей до следующей точки. Если превышено — маршрут разделится.
                    </p>
                    <p className={clsx('text-[11px]', isDark ? 'text-gray-400' : 'text-gray-500')}>
                        Нажмите <b>Сохранить</b> чтобы применить на сервере (потребуется пересчёт).
                    </p>
                </div>
            </div>
        </div>
    );
}

function SliderSetting({
    icon,
    label,
    value,
    min,
    max,
    step,
    onChange,
    hint,
    isDark,
}: {
    icon: React.ReactNode;
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
    hint: string;
    isDark: boolean;
}) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                    {icon}
                    <label className={clsx('text-sm font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>
                        {label}
                    </label>
                </div>
                <span className="text-blue-600 font-bold text-sm">{value}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseInt(e.target.value))}
                className={clsx(
                    'w-full h-2 rounded-lg appearance-none cursor-pointer accent-blue-600',
                    isDark ? 'bg-white/10' : 'bg-gray-200'
                )}
            />
            <p className={clsx('text-[10px]', isDark ? 'text-gray-500' : 'text-gray-400')}>
                {hint}
            </p>
        </div>
    );
}

function getOrdersWord(count: number): string {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
        return 'заказах';
    }

    if (lastDigit === 1) {
        return 'заказе';
    }

    if (lastDigit >= 2 && lastDigit <= 4) {
        return 'заказах';
    }

    return 'заказах';
}
