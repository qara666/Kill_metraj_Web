import { useState, useEffect } from 'react';
import clsx from 'clsx';
import {
    BanknotesIcon,
    CreditCardIcon,
    GlobeAltIcon,
    CheckCircleIcon,
    ClockIcon
} from '@heroicons/react/24/outline';
import type { Order } from '../../types';

interface CourierFinancialsProps {
    courierId: string;
    courierName: string;
    divisionId: string;
    targetDate?: string;
    isDark?: boolean;
}

interface FinancialSummary {
    courierId: string;
    courierName: string;
    targetDate: string;
    currentShift: {
        startTime: string;
        totalOrders: number;
        completedOrders: number;
        cashOrders: {
            count: number;
            totalAmount: number;
            orders: Order[];
        };
        cardOrders: {
            count: number;
            totalAmount: number;
            orders: Order[];
        };
        onlineOrders: {
            count: number;
            totalAmount: number;
            orders: Order[];
        };
        totalExpected: number;
    };
    lastSettlement?: {
        date: string;
        cashReceived: number;
        status: string;
    };
}

export function CourierFinancials({
    courierId,
    courierName,
    divisionId,
    targetDate,
    isDark = false
}: CourierFinancialsProps) {
    const [summary, setSummary] = useState<FinancialSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showSettlementModal, setShowSettlementModal] = useState(false);

    const fetchFinancialSummary = async () => {
        if (!courierId) {
            setError('Не выбран курьер');
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError(null);
            const date = targetDate || new Date().toISOString().split('T')[0];

            // Безопасно кодируем параметры URL
            const encodedCourierId = encodeURIComponent(courierId);
            const encodedDivisionId = encodeURIComponent(divisionId || 'all');
            const encodedDate = encodeURIComponent(date);

            const url = `/api/v1/couriers/${encodedCourierId}/financial-summary?divisionId=${encodedDivisionId}&targetDate=${encodedDate}`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('km_access_token')}`
                }
            }
            );

            if (!response.ok) {
                throw new Error('Failed to fetch financial summary');
            }

            const data = await response.json();
            setSummary(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFinancialSummary();
    }, [courierId, divisionId, targetDate]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('uk-UA', {
            style: 'currency',
            currency: 'UAH',
            minimumFractionDigits: 2
        }).format(amount);
    };

    if (loading) {
        return (
            <div className={clsx(
                'flex items-center justify-center p-12 rounded-lg',
                isDark ? 'bg-gray-800' : 'bg-gray-50'
            )}>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (error || !summary) {
        return (
            <div className={clsx(
                'p-6 rounded-lg border-2',
                isDark ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200'
            )}>
                <p className="text-red-600 font-medium">Ошибка загрузки данных: {error}</p>
            </div>
        );
    }

    const { currentShift } = summary;
    const cashToCollect = currentShift.cashOrders.totalAmount;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className={clsx(
                'p-4 rounded-lg border',
                isDark ? 'bg-gray-800 border-gray-700' : 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200'
            )}>
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className={clsx('text-lg font-bold', isDark ? 'text-gray-200' : 'text-gray-800')}>
                            {courierName}
                        </h2>
                        <p className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>
                            Смена: {(() => {
                                try {
                                    const d = new Date(currentShift.startTime);
                                    return isNaN(d.getTime()) ? 'Дата не указана' : d.toLocaleDateString('ru-RU');
                                } catch (e) {
                                    return 'Дата не указана';
                                }
                            })()}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className={clsx('text-xs font-medium', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            Заказов выполнено
                        </p>
                        <p className={clsx('text-2xl font-bold', isDark ? 'text-green-400' : 'text-green-600')}>
                            {currentShift.completedOrders} / {currentShift.totalOrders}
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Summary Card */}
            <div className={clsx(
                'p-6 rounded-xl border-2 shadow-lg',
                isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-green-200'
            )}>
                <div className="flex items-center gap-3 mb-4">
                    <div className={clsx(
                        'p-3 rounded-lg',
                        isDark ? 'bg-green-500/20' : 'bg-green-100'
                    )}>
                        <BanknotesIcon className={clsx('w-6 h-6', isDark ? 'text-green-400' : 'text-green-600')} />
                    </div>
                    <div>
                        <p className={clsx('text-sm font-medium', isDark ? 'text-gray-400' : 'text-gray-600')}>
                            Всего к сдаче (готівка)
                        </p>
                        <p className={clsx('text-3xl font-bold', isDark ? 'text-green-400' : 'text-green-600')}>
                            {formatCurrency(cashToCollect)}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-4">
                    {/* Cash */}
                    <PaymentMethodCard
                        icon={BanknotesIcon}
                        label="Готівка"
                        amount={currentShift.cashOrders.totalAmount}
                        count={currentShift.cashOrders.count}
                        color="green"
                        isDark={isDark}
                    />

                    {/* Card */}
                    <PaymentMethodCard
                        icon={CreditCardIcon}
                        label="Карта"
                        amount={currentShift.cardOrders.totalAmount}
                        count={currentShift.cardOrders.count}
                        color="blue"
                        isDark={isDark}
                    />

                    {/* Online */}
                    <PaymentMethodCard
                        icon={GlobeAltIcon}
                        label="Онлайн"
                        amount={currentShift.onlineOrders.totalAmount}
                        count={currentShift.onlineOrders.count}
                        color="purple"
                        isDark={isDark}
                    />
                </div>

                <button
                    onClick={() => setShowSettlementModal(true)}
                    disabled={cashToCollect === 0}
                    className={clsx(
                        'w-full mt-6 py-3 rounded-xl font-bold text-sm uppercase tracking-wide transition-all',
                        cashToCollect > 0
                            ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 shadow-md active:scale-[0.98]'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    )}
                >
                    {cashToCollect > 0 ? 'Закрыть смену' : 'Нет наличных для сдачи'}
                </button>
            </div>

            {/* Orders List */}
            {currentShift.cashOrders.orders.length > 0 && (
                <div className={clsx(
                    'p-4 rounded-lg border',
                    isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                )}>
                    <h3 className={clsx('text-sm font-bold mb-3', isDark ? 'text-gray-200' : 'text-gray-800')}>
                        Заказы с оплатой наличными ({currentShift.cashOrders.count})
                    </h3>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {currentShift.cashOrders.orders.map((order, idx) => (
                            <div
                                key={order.id || idx}
                                className={clsx(
                                    'p-3 rounded-lg border flex items-center justify-between',
                                    isDark ? 'bg-gray-900/50 border-gray-700' : 'bg-gray-50 border-gray-200'
                                )}
                            >
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-bold text-blue-600">
                                            #{order.orderNumber}
                                        </span>
                                        {order.status === 'Исполнен' && (
                                            <CheckCircleIcon className="w-4 h-4 text-green-500" />
                                        )}
                                    </div>
                                    <p className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>
                                        {order.address}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className={clsx('text-sm font-bold', isDark ? 'text-green-400' : 'text-green-600')}>
                                        {formatCurrency(order.amount)}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Last Settlement Info */}
            {summary.lastSettlement && (
                <div className={clsx(
                    'p-4 rounded-lg border',
                    isDark ? 'bg-gray-800 border-gray-700' : 'bg-blue-50 border-blue-200'
                )}>
                    <div className="flex items-center gap-2">
                        <ClockIcon className={clsx('w-5 h-5', isDark ? 'text-blue-400' : 'text-blue-600')} />
                        <div>
                            <p className={clsx('text-xs font-medium', isDark ? 'text-gray-400' : 'text-gray-600')}>
                                Последняя сдача
                            </p>
                            <p className={clsx('text-sm font-bold', isDark ? 'text-gray-200' : 'text-gray-800')}>
                                {(() => {
                                    try {
                                        const d = new Date(summary.lastSettlement.date);
                                        return isNaN(d.getTime()) ? 'Дата не указана' : d.toLocaleDateString('ru-RU');
                                    } catch (e) {
                                        return 'Дата не указана';
                                    }
                                })()} - {formatCurrency(summary.lastSettlement.cashReceived)}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Settlement Modal */}
            {showSettlementModal && (
                <SettlementModal
                    courierId={courierId}
                    courierName={courierName}
                    divisionId={divisionId}
                    expectedAmount={cashToCollect}
                    targetDate={summary.targetDate}
                    isDark={isDark}
                    onClose={() => setShowSettlementModal(false)}
                    onSuccess={() => {
                        setShowSettlementModal(false);
                        fetchFinancialSummary();
                    }}
                />
            )}
        </div>
    );
}

// Payment Method Card Component
interface PaymentMethodCardProps {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    amount: number;
    count: number;
    color: 'green' | 'blue' | 'purple';
    isDark?: boolean;
}

function PaymentMethodCard({ icon: Icon, label, amount, count, color, isDark }: PaymentMethodCardProps) {
    const colorClasses = {
        green: {
            bg: isDark ? 'bg-green-500/20' : 'bg-green-50',
            border: isDark ? 'border-green-500/30' : 'border-green-200',
            text: isDark ? 'text-green-400' : 'text-green-600'
        },
        blue: {
            bg: isDark ? 'bg-blue-500/20' : 'bg-blue-50',
            border: isDark ? 'border-blue-500/30' : 'border-blue-200',
            text: isDark ? 'text-blue-400' : 'text-blue-600'
        },
        purple: {
            bg: isDark ? 'bg-purple-500/20' : 'bg-purple-50',
            border: isDark ? 'border-purple-500/30' : 'border-purple-200',
            text: isDark ? 'text-purple-400' : 'text-purple-600'
        }
    };

    const colors = colorClasses[color];

    return (
        <div className={clsx('p-3 rounded-lg border', colors.bg, colors.border)}>
            <div className="flex items-center gap-2 mb-2">
                <Icon className={clsx('w-4 h-4', colors.text)} />
                <span className={clsx('text-xs font-bold', colors.text)}>{label}</span>
            </div>
            <p className={clsx('text-lg font-bold', colors.text)}>
                {new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH', minimumFractionDigits: 0 }).format(amount)}
            </p>
            <p className={clsx('text-[10px] font-medium opacity-60', colors.text)}>
                {count} {count === 1 ? 'заказ' : count < 5 ? 'заказа' : 'заказов'}
            </p>
        </div>
    );
}

// Settlement Modal Component (placeholder - will be implemented separately)
function SettlementModal({ isDark, onClose }: any) {
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className={clsx(
                'p-6 rounded-xl max-w-md w-full mx-4',
                isDark ? 'bg-gray-800' : 'bg-white'
            )}>
                <h3 className={clsx('text-lg font-bold mb-4', isDark ? 'text-gray-200' : 'text-gray-800')}>
                    Закрытие смены
                </h3>
                <p className={clsx('text-sm mb-4', isDark ? 'text-gray-400' : 'text-gray-600')}>
                    Функция в разработке
                </p>
                <button
                    onClick={onClose}
                    className="w-full py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                >
                    Закрыть
                </button>
            </div>
        </div>
    );
}
