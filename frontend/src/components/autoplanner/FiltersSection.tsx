import React from 'react';
import { clsx } from 'clsx';
import { OrderFilters } from '../../hooks/useOrderFiltering';

interface FiltersSectionProps {
    isDark: boolean;
    ordersCount: number;
    filteredOrdersCount: number;
    isFiltersExpanded: boolean;
    setIsFiltersExpanded: (val: boolean) => void;
    orderFilters: OrderFilters;
    setOrderFilters: (filters: OrderFilters) => void;
    availableFilters: {
        paymentMethods: string[];
        deliveryZones: string[];
        statuses: string[];
        orderTypes: string[];
    };
}

export const FiltersSection: React.FC<FiltersSectionProps> = React.memo(({
    isDark,
    ordersCount,
    filteredOrdersCount,
    isFiltersExpanded,
    setIsFiltersExpanded,
    orderFilters,
    setOrderFilters,
    availableFilters
}) => {
    return (
        <div className={clsx('mt-6 rounded-xl border', isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-white')}>
            <button
                onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
                className={clsx(
                    'w-full px-4 py-3 flex items-center justify-between transition-colors',
                    isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'
                )}
            >
                <div className={clsx('text-sm font-medium flex items-center gap-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
                    <span>{isFiltersExpanded ? '▼' : '▶'}</span>
                    <span> Фильтры заказов</span>
                    {orderFilters.enabled && (
                        <span className={clsx('text-xs px-2 py-1 rounded', isDark ? 'bg-blue-700 text-blue-200' : 'bg-blue-100 text-blue-700')}>
                            Активны
                        </span>
                    )}
                </div>
            </button>
            {isFiltersExpanded && (
                <div className="p-4 space-y-4">
                    <label className="flex items-center gap-3 text-sm">
                        <input
                            type="checkbox"
                            checked={orderFilters.enabled}
                            onChange={(e) => setOrderFilters({ ...orderFilters, enabled: e.target.checked })}
                            className="rounded"
                        />
                        <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Включить фильтры</span>
                    </label>

                    {orderFilters.enabled && (
                        <>
                            {/* Статистика */}
                            <div className={clsx('text-xs p-2 rounded', isDark ? 'bg-gray-900/50 text-gray-400' : 'bg-gray-100 text-gray-600')}>
                                Всего заказов: {ordersCount} |
                                После фильтрации: {filteredOrdersCount} |
                                Исключено: {ordersCount - filteredOrdersCount}
                            </div>

                            {/* Способ оплаты */}
                            {availableFilters.paymentMethods.length > 0 && (
                                <div>
                                    <div className={clsx('text-xs font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>Способ оплаты:</div>
                                    <div className="flex flex-wrap gap-2">
                                        {availableFilters.paymentMethods.map((pm) => (
                                            <label key={pm} className="flex items-center gap-1 text-xs cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={orderFilters.paymentMethods.includes(pm)}
                                                    onChange={(e) => {
                                                        const newMethods = e.target.checked
                                                            ? [...orderFilters.paymentMethods, pm]
                                                            : orderFilters.paymentMethods.filter(m => m !== pm);
                                                        setOrderFilters({ ...orderFilters, paymentMethods: newMethods });
                                                    }}
                                                    className="rounded"
                                                />
                                                <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>{pm}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Зона доставки */}
                            {availableFilters.deliveryZones.length > 0 && (
                                <div>
                                    <div className={clsx('text-xs font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>Зона доставки:</div>
                                    <div className="flex flex-wrap gap-2">
                                        {availableFilters.deliveryZones.map((zone) => (
                                            <label key={zone} className="flex items-center gap-1 text-xs cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={orderFilters.deliveryZones.includes(zone)}
                                                    onChange={(e) => {
                                                        const newZones = e.target.checked
                                                            ? [...orderFilters.deliveryZones, zone]
                                                            : orderFilters.deliveryZones.filter(z => z !== zone);
                                                        setOrderFilters({ ...orderFilters, deliveryZones: newZones });
                                                    }}
                                                    className="rounded"
                                                />
                                                <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>{zone}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Статус */}
                            {availableFilters.statuses.length > 0 && (
                                <div>
                                    <div className={clsx('text-xs font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>Статус:</div>
                                    <div className="flex flex-wrap gap-2">
                                        {availableFilters.statuses.map((status) => (
                                            <label key={status} className="flex items-center gap-1 text-xs cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={orderFilters.statuses.includes(status)}
                                                    onChange={(e) => {
                                                        const newStatuses = e.target.checked
                                                            ? [...orderFilters.statuses, status]
                                                            : orderFilters.statuses.filter(s => s !== status);
                                                        setOrderFilters({ ...orderFilters, statuses: newStatuses });
                                                    }}
                                                    className="rounded"
                                                />
                                                <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>{status}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Тип заказа */}
                            {availableFilters.orderTypes.length > 0 && (
                                <div>
                                    <div className={clsx('text-xs font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>Тип заказа:</div>
                                    <div className="flex flex-wrap gap-2">
                                        {availableFilters.orderTypes.map((type) => (
                                            <label key={type} className="flex items-center gap-1 text-xs cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={orderFilters.orderTypes.includes(type)}
                                                    onChange={(e) => {
                                                        const newTypes = e.target.checked
                                                            ? [...orderFilters.orderTypes, type]
                                                            : orderFilters.orderTypes.filter(t => t !== type);
                                                        setOrderFilters({ ...orderFilters, orderTypes: newTypes });
                                                    }}
                                                    className="rounded"
                                                />
                                                <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>{type}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Дополнительные фильтры */}
                            <div className="space-y-2 pt-2 border-t border-gray-600">
                                <label className="flex items-center gap-3 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={orderFilters.excludeCompleted}
                                        onChange={(e) => setOrderFilters({ ...orderFilters, excludeCompleted: e.target.checked })}
                                        className="rounded"
                                    />
                                    <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Исключить исполненные заказы</span>
                                </label>
                            </div>

                            {/* Кнопка сброса фильтров */}
                            <button
                                onClick={() => setOrderFilters({
                                    enabled: false,
                                    paymentMethods: [],
                                    deliveryZones: [],
                                    statuses: [],
                                    orderTypes: [],
                                    excludeCompleted: true,
                                    timeRange: { start: null, end: null }
                                })}
                                className={clsx(
                                    'w-full px-3 py-2 text-xs rounded-lg transition-colors',
                                    isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                )}
                            >
                                Сбросить все фильтры
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
});
