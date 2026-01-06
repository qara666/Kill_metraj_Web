import React from 'react';
import { clsx } from 'clsx';
import { getKitchenTime, getPlannedTime } from '../../utils/data/timeUtils';

interface OrderDetailsModalProps {
    isDark: boolean;
    selectedOrder: any;
    onClose: () => void;
}

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = React.memo(({
    isDark,
    selectedOrder,
    onClose
}) => {
    if (!selectedOrder) return null;

    const readyAt = selectedOrder.readyAtSource || getKitchenTime(selectedOrder);
    const deadlineAt = selectedOrder.deadlineAtSource || selectedOrder.deadlineAt || getPlannedTime(selectedOrder);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
            onClick={onClose}
        >
            <div
                className={clsx(
                    'relative w-full max-w-md mx-4 rounded-xl shadow-2xl',
                    isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
                )}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Заголовок */}
                <div className={clsx(
                    'px-6 py-4 border-b flex items-center justify-between',
                    isDark ? 'border-gray-700' : 'border-gray-200'
                )}>
                    <h3 className={clsx('text-lg font-semibold', isDark ? 'text-white' : 'text-gray-900')}>
                        Заказ {selectedOrder?.orderNumber || selectedOrder?.raw?.orderNumber || '#'}
                    </h3>
                    <button
                        onClick={onClose}
                        className={clsx(
                            'text-2xl leading-none hover:opacity-70 transition-opacity',
                            isDark ? 'text-gray-400' : 'text-gray-600'
                        )}
                    >
                        ×
                    </button>
                </div>

                {/* Содержимое */}
                <div className="p-6 space-y-4">
                    {/* Адрес */}
                    <div>
                        <div className={clsx('text-xs font-medium mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            Адрес доставки
                        </div>
                        <div className={clsx('text-sm', isDark ? 'text-gray-200' : 'text-gray-700')}>
                            {selectedOrder?.address || 'Не указан'}
                        </div>
                    </div>

                    {/* Время на кухню */}
                    <div>
                        <div className={clsx('text-xs font-medium mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            Время на кухню (готовность)
                        </div>
                        {readyAt ? (
                            <div className={clsx('text-sm font-medium', isDark ? 'text-blue-400' : 'text-blue-600')}>
                                {new Date(readyAt).toLocaleString('ru-RU', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </div>
                        ) : (
                            <div className={clsx('text-sm italic', isDark ? 'text-gray-500' : 'text-gray-400')}>
                                Не указано
                            </div>
                        )}
                    </div>

                    {/* Плановое время доставки */}
                    <div>
                        <div className={clsx('text-xs font-medium mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            Плановое время доставки (дедлайн)
                        </div>
                        {deadlineAt ? (
                            <div className={clsx('text-sm font-medium', isDark ? 'text-red-400' : 'text-red-600')}>
                                {new Date(deadlineAt).toLocaleString('ru-RU', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </div>
                        ) : (
                            <div className={clsx('text-sm italic', isDark ? 'text-gray-500' : 'text-gray-400')}>
                                Не указано
                            </div>
                        )}
                    </div>

                    {/* Дополнительная информация */}
                    {selectedOrder?.raw && Object.keys(selectedOrder.raw).length > 0 && (
                        <div className={clsx('pt-4 border-t', isDark ? 'border-gray-700' : 'border-gray-200')}>
                            {(selectedOrder.raw?.clientName || selectedOrder.raw?.['Имя клиента']) && (
                                <div className="mb-2">
                                    <div className={clsx('text-xs font-medium mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                        Клиент
                                    </div>
                                    <div className={clsx('text-sm', isDark ? 'text-gray-200' : 'text-gray-700')}>
                                        {selectedOrder.raw?.clientName || selectedOrder.raw?.['Имя клиента'] || 'Не указан'}
                                    </div>
                                </div>
                            )}
                            {(selectedOrder.raw?.orderSum || selectedOrder.raw?.['Сумма заказа']) && (
                                <div>
                                    <div className={clsx('text-xs font-medium mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                        Сумма заказа
                                    </div>
                                    <div className={clsx('text-sm font-medium', isDark ? 'text-green-400' : 'text-green-600')}>
                                        {selectedOrder.raw?.orderSum || selectedOrder.raw?.['Сумма заказа'] || '0'} ₴
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Кнопка закрытия */}
                <div className={clsx(
                    'px-6 py-4 border-t flex justify-end',
                    isDark ? 'border-gray-700' : 'border-gray-200'
                )}>
                    <button
                        onClick={onClose}
                        className={clsx(
                            'px-4 py-2 rounded-lg font-medium transition-colors',
                            isDark
                                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                        )}
                    >
                        Закрыть
                    </button>
                </div>
            </div>
        </div>
    );
});
