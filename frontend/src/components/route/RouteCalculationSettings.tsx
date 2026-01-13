import { Switch } from '@headlessui/react';
import {
    CogIcon,
    BoltIcon,
    HandRaisedIcon,
    BellIcon,
    ArrowPathIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { useRouteCalculationStore } from '../../stores/useRouteCalculationStore';

interface RouteCalculationSettingsProps {
    isDark?: boolean;
}

export function RouteCalculationSettings({ isDark = false }: RouteCalculationSettingsProps) {
    const { calculationMode, setCalculationMode } = useRouteCalculationStore();

    const isAutomatic = calculationMode.mode === 'automatic';

    return (
        <div
            className={clsx(
                'rounded-lg border p-4 space-y-4',
                isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            )}
        >
            {/* Header */}
            <div className="flex items-center space-x-2">
                <CogIcon className={clsx('h-5 w-5', isDark ? 'text-gray-300' : 'text-gray-700')} />
                <h3 className={clsx('font-semibold', isDark ? 'text-gray-100' : 'text-gray-900')}>
                    Режим расчета маршрутов
                </h3>
            </div>

            {/* Mode Toggle */}
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

            {/* Automatic Mode Settings */}
            {isAutomatic && (
                <div className="space-y-4 pt-2 border-t border-gray-200 dark:border-gray-700">
                    {/* Threshold Slider */}
                    <div className="space-y-2">
                        <label
                            className={clsx('text-sm font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}
                        >
                            Автоматический расчет при:{' '}
                            <span className="text-blue-600 font-bold">
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
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <div className="flex justify-between text-xs text-gray-500">
                            <span>1</span>
                            <span>5</span>
                            <span>10</span>
                        </div>
                    </div>

                    {/* Recalculation Options */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                                <ArrowPathIcon className="h-4 w-4 text-gray-500" />
                                <label
                                    className={clsx('text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}
                                    htmlFor="recalc-add"
                                >
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
                                        'inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
                                        calculationMode.recalculateOnAdd ? 'translate-x-5' : 'translate-x-1'
                                    )}
                                />
                            </Switch>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                                <ArrowPathIcon className="h-4 w-4 text-gray-500" />
                                <label
                                    className={clsx('text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}
                                    htmlFor="recalc-remove"
                                >
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
                                        'inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
                                        calculationMode.recalculateOnRemove ? 'translate-x-5' : 'translate-x-1'
                                    )}
                                />
                            </Switch>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                                <BellIcon className="h-4 w-4 text-gray-500" />
                                <label
                                    className={clsx('text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}
                                    htmlFor="notify"
                                >
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
                                        'inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
                                        calculationMode.notifyOnCalculation ? 'translate-x-5' : 'translate-x-1'
                                    )}
                                />
                            </Switch>
                        </div>
                    </div>
                </div>
            )}
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
