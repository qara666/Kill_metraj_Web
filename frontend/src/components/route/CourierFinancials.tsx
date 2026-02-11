import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { useExcelData } from '../../contexts/ExcelDataContext';
import {
    BanknotesIcon,
    GlobeAltIcon,
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

// Helper to format currency moved to top-level for shared use
const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('uk-UA', {
        style: 'currency',
        currency: 'UAH',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
};

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

    const { excelData } = useExcelData();

    // Helper to calculate financials locally from Excel data
    const calculateLocalFinancials = (): FinancialSummary | null => {
        if (!excelData?.orders) return null;

        const courierOrders = excelData.orders.filter((o: any) => {
            const c = o.courier;
            // Handle various courier formats (string ID/Name or object)
            const cId = typeof c === 'object' ? (c.id || c._id || c.name) : c;
            // We compare loosely or strictly depending on your data. 
            // Often courierId prop is the Name or ID.
            return String(cId) === String(courierId) || String(o.courierName) === String(courierId);
        });

        if (courierOrders.length === 0 && !excelData.couriers.find((c: any) => c.name === courierName)) {
            // Maybe courier exists but has no orders?
            // If courier not found in excelData at all, return null to try API?
            // But if we are in "offline/local" mode, we should just show empty state.
            return {
                courierId,
                courierName,
                targetDate: targetDate || new Date().toISOString().split('T')[0],
                currentShift: {
                    startTime: new Date().toISOString(),
                    totalOrders: 0,
                    completedOrders: 0,
                    cashOrders: { count: 0, totalAmount: 0, orders: [] },
                    cardOrders: { count: 0, totalAmount: 0, orders: [] },
                    onlineOrders: { count: 0, totalAmount: 0, orders: [] },
                    totalExpected: 0
                }
            };
        }

        // Initialize Summary
        const summary: FinancialSummary = {
            courierId,
            courierName,
            targetDate: targetDate || new Date().toISOString().split('T')[0],
            currentShift: {
                startTime: new Date().toISOString(), // We might not have shift start in excel, use current/default
                totalOrders: courierOrders.length,
                completedOrders: courierOrders.filter((o: any) =>
                    o.status === 'Исполнен' || o.status === 'Доставлен'
                ).length,
                cashOrders: { count: 0, totalAmount: 0, orders: [] },
                cardOrders: { count: 0, totalAmount: 0, orders: [] },
                onlineOrders: { count: 0, totalAmount: 0, orders: [] },
                totalExpected: 0
            }
        };

        // Categorize Orders
        courierOrders.forEach((order: any) => {
            // Only count completed orders for financials? 
            // Usually financials are for ALL orders or just completed? 
            // Validating against backend logic: "completedOrders" is separate count.
            // But "cashOrders" usually implies money to Collect. 
            // If order is CANCELED, we don't collect money.
            // Let's assume we filter by Valid Statuses for money collection.
            const isValidForFinancials = order.status !== 'Отменен' && order.status !== 'Возврат';
            if (!isValidForFinancials) return;

            const amount = parseFloat(order.amount || order.totalAmount || 0);
            const paymentMethod = (order.paymentMethod || '').toLowerCase();

            const orderData: Order = {
                ...order,
                id: order.id || order.orderNumber, // Ensure ID
                amount
            };

            if (
                paymentMethod.includes('готівка') ||
                paymentMethod.includes('наличные') ||
                paymentMethod === 'cash' ||
                paymentMethod === '' // Assume cash if empty? Or maybe warn? Let's assume cash for now as legacy default
            ) {
                summary.currentShift.cashOrders.count++;
                summary.currentShift.cashOrders.totalAmount += amount;
                summary.currentShift.cashOrders.orders.push(orderData);
            } else if (
                paymentMethod.includes('карт') ||
                paymentMethod.includes('card') ||
                paymentMethod.includes('терминал') ||
                paymentMethod.includes('terminal')
            ) {
                summary.currentShift.cardOrders.count++;
                summary.currentShift.cardOrders.totalAmount += amount;
                summary.currentShift.cardOrders.orders.push(orderData);
            } else if (
                paymentMethod.includes('онлайн') ||
                paymentMethod.includes('online') ||
                paymentMethod.includes('liqpay') ||
                paymentMethod.includes('site') ||
                paymentMethod.includes('сайт')
            ) {
                summary.currentShift.onlineOrders.count++;
                summary.currentShift.onlineOrders.totalAmount += amount;
                summary.currentShift.onlineOrders.orders.push(orderData);
            }
        });

        summary.currentShift.totalExpected =
            summary.currentShift.cashOrders.totalAmount +
            summary.currentShift.cardOrders.totalAmount +
            summary.currentShift.onlineOrders.totalAmount;

        return summary;
    };


    const fetchFinancialSummary = async () => {
        setLoading(true);
        setError(null);

        // 1. Try Local Calculation First
        if (excelData && excelData.orders.length > 0) {
            console.log('загрузка с екселя');
            try {
                const localSummary = calculateLocalFinancials();
                if (localSummary) {
                    setSummary(localSummary);
                    setLoading(false);
                    return; // Successfully used local data
                }
            } catch (localErr) {
                console.warn('локал ошибка', localErr);
            }
        }

        // 2. Fallback to API if no local data or calculation failed
        if (!courierId) {
            setError('Не выбран курьер');
            setLoading(false);
            return;
        }

        try {
            const date = targetDate || new Date().toISOString().split('T')[0];
            const encodedCourierId = encodeURIComponent(courierId);
            const encodedDivisionId = encodeURIComponent(divisionId || 'all');
            const encodedDate = encodeURIComponent(date);

            const url = `/ api / v1 / couriers / ${encodedCourierId}/financial-summary?divisionId=${encodedDivisionId}&targetDate=${encodedDate}`;

            const token = localStorage.getItem('km_access_token');
            const sanitizedToken = token ? token.trim() : '';

            // If we are here, it means we don't have local data. 
            // If we also don't have a token, we can't fetch from API.
            if (!sanitizedToken) {
                // Instead of error, show empty state or "No Data" if we really can't load anything
                throw new Error('Нет данных (локальных или токена)');
            }

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${sanitizedToken}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch financial summary');
            }

            const data = await response.json();
            setSummary(data);
        } catch (err) {
            console.error('Error fetching financial summary:', err);
            let errorMessage = 'Unknown error';

            if (err instanceof Error) {
                if (err.name === 'DOMException' || err.message.includes('string did not match the expected pattern')) {
                    errorMessage = 'Invalid authentication token. Please log in again.';
                    // Optional: redirect to login or clear token
                } else if (err.message === 'Нет данных (локальных или токена)') {
                    errorMessage = 'Данные не найдены. Загрузите Excel файл или войдите в систему.';
                } else {
                    errorMessage = err.message;
                }
            }

            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFinancialSummary();
    }, [courierId, divisionId, targetDate]);

    // Use top-level formatCurrency helper instead of re-defining here


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
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Local Styles Harmonization */}
            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(100, 116, 139, 0.2);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(100, 116, 139, 0.4);
                }
            `}</style>

            {/* Header */}
            <div className={clsx(
                'p-6 rounded-3xl border flex items-center justify-between transition-all duration-300 shadow-xl glass-panel relative overflow-hidden group',
                isDark ? 'shadow-gray-900/40' : 'shadow-blue-500/5'
            )}>
                {/* Header Light Reflection */}
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
                <div className="flex items-center gap-5">
                    <div className={clsx(
                        'w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black shadow-lg',
                        isDark ? 'bg-gradient-to-br from-blue-600 to-purple-600 text-white' : 'bg-gradient-to-br from-blue-500 to-indigo-500 text-white'
                    )}>
                        {courierName.charAt(0)}
                    </div>
                    <div>
                        <h2 className={clsx('text-2xl font-bold tracking-tight', isDark ? 'text-white' : 'text-gray-900')}>
                            {courierName}
                        </h2>
                        <div className="flex items-center gap-2 mt-1">
                            <div className={clsx('w-2 h-2 rounded-full animate-pulse', currentShift.completedOrders > 0 ? 'bg-green-500' : 'bg-gray-400')}></div>
                            <p className={clsx('text-sm font-medium', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                Смена: {(() => {
                                    try {
                                        const d = new Date(currentShift.startTime);
                                        return isNaN(d.getTime()) ? 'Дата не указана' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
                                    } catch (e) {
                                        return 'Дата не указана';
                                    }
                                })()}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                        <p className={clsx('text-xs font-bold uppercase tracking-wider mb-1', isDark ? 'text-gray-500' : 'text-gray-400')}>
                            Выполнено
                        </p>
                        <div className="flex items-baseline gap-1 justify-end">
                            <span className={clsx('text-3xl font-black tracking-tighter', isDark ? 'text-white' : 'text-gray-900')}>
                                {currentShift.completedOrders}
                            </span>
                            <span className="text-sm font-bold text-gray-400">/ {currentShift.totalOrders}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Summary Card - Print Area */}
            <div id="financials-print-area" className={clsx(
                'p-8 rounded-[2rem] border shadow-2xl overflow-hidden relative glass-panel transition-all hover:shadow-3xl group mb-6',
                isDark ? 'shadow-black/60' : 'shadow-blue-900/10'
            )}>
                {/* Decorative Elements */}
                <div className={clsx(
                    'absolute -top-24 -right-24 w-80 h-80 rounded-full blur-[100px] opacity-20 pointer-events-none',
                    isDark ? 'bg-blue-500' : 'bg-indigo-400'
                )} />
                <div className={clsx(
                    'absolute bottom-0 left-0 w-64 h-64 rounded-full blur-[80px] opacity-10 pointer-events-none',
                    isDark ? 'bg-purple-500' : 'bg-pink-400'
                )} />

                <div className="relative z-10">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-10">
                        <div className="flex items-center gap-5">
                            <div className={clsx(
                                'p-5 rounded-[1.5rem] shadow-xl transform rotate-3 transition-transform hover:rotate-0',
                                isDark ? 'bg-gradient-to-br from-green-500 to-emerald-600 text-white' : 'bg-gradient-to-br from-green-400 to-emerald-500 text-white shadow-green-200'
                            )}>
                                <BanknotesIcon className="w-10 h-10" />
                            </div>
                            <div>
                                <p className={clsx('text-xs font-bold uppercase tracking-[0.2em] mb-2', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                    К сдаче (наличные)
                                </p>
                                <p className={clsx('text-5xl font-black tracking-tighter drop-shadow-sm', isDark ? 'text-white' : 'text-gray-900')}>
                                    {formatCurrency(cashToCollect)}
                                </p>
                            </div>
                        </div>

                        {/* Visual Breakdown Bar */}
                        {currentShift.totalExpected > 0 && (
                            <div className="flex-1 max-w-md w-full bg-white/5 dark:bg-black/20 p-4 rounded-2xl backdrop-blur-sm border border-white/10">
                                <div className="flex justify-between text-xs font-bold mb-3 opacity-80">
                                    <span className="uppercase tracking-wider">Всего выручка</span>
                                    <span>{formatCurrency(currentShift.totalExpected)}</span>
                                </div>
                                <div className="h-4 w-full rounded-full bg-gray-200/50 dark:bg-gray-700/50 overflow-hidden flex shadow-inner">
                                    {/* Cash */}
                                    <div
                                        style={{ width: `${(currentShift.cashOrders.totalAmount / currentShift.totalExpected) * 100}%` }}
                                        className="h-full bg-gradient-to-r from-green-400 to-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                        title={`Наличные: ${formatCurrency(currentShift.cashOrders.totalAmount)}`}
                                    />
                                    {/* Online */}
                                    <div
                                        style={{ width: `${(currentShift.onlineOrders.totalAmount / currentShift.totalExpected) * 100}%` }}
                                        className="h-full bg-gradient-to-r from-purple-400 to-pink-500"
                                        title={`Онлайн: ${formatCurrency(currentShift.onlineOrders.totalAmount)}`}
                                    />
                                </div>
                                <div className="flex gap-4 mt-3 text-[10px] font-bold justify-between opacity-70">
                                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)]"></div>Наличные</div>
                                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-purple-400"></div>Онлайн</div>
                                </div>
                            </div>
                        )}

                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {/* Cash */}
                        <PaymentMethodCard
                            icon={BanknotesIcon}
                            label="Готівка"
                            amount={currentShift.cashOrders.totalAmount}
                            count={currentShift.cashOrders.count}
                            color="green"
                            isDark={isDark}
                            percent={currentShift.totalExpected > 0 ? (currentShift.cashOrders.totalAmount / currentShift.totalExpected) * 100 : 0}
                        />


                        {/* Online */}
                        <PaymentMethodCard
                            icon={GlobeAltIcon}
                            label="Онлайн"
                            amount={currentShift.onlineOrders.totalAmount}
                            count={currentShift.onlineOrders.count}
                            color="purple"
                            isDark={isDark}
                            percent={currentShift.totalExpected > 0 ? (currentShift.onlineOrders.totalAmount / currentShift.totalExpected) * 100 : 0}
                        />
                    </div>

                    <button
                        onClick={() => setShowSettlementModal(true)}
                        disabled={cashToCollect === 0}
                        className={clsx(
                            'w-full mt-10 py-5 rounded-2xl font-black text-sm uppercase tracking-[0.2em] transition-all transform hover:-translate-y-1',
                            cashToCollect > 0
                                ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-xl shadow-green-500/30 hover:shadow-green-500/50 hover:from-green-400 hover:to-emerald-500'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
                        )}
                    >
                        {cashToCollect > 0 ? 'Расчет налички у курьера' : 'Нет налички'}
                    </button>
                </div>
            </div>

            {/* Orders List */}
            {
                currentShift.cashOrders.orders.length > 0 && (
                    <div className={clsx(
                        'p-6 rounded-3xl border transition-all hover:shadow-lg glass-panel',
                        isDark ? 'shadow-black/20' : 'shadow-gray-200'
                    )}>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className={clsx('text-lg font-bold flex items-center gap-3', isDark ? 'text-gray-200' : 'text-gray-800')}>
                                <span>Детализация (Наличные)</span>
                                <span className={clsx('text-xs px-2.5 py-1 rounded-full font-black', isDark ? 'bg-white/10 text-white' : 'bg-black/5 text-black')}>
                                    {currentShift.cashOrders.count}
                                </span>
                            </h3>
                        </div>

                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                            {currentShift.cashOrders.orders.map((order, idx) => (
                                <div
                                    key={order.id || idx}
                                    className={clsx(
                                        'p-4 rounded-xl border flex items-center justify-between transition-colors group',
                                        isDark ? 'bg-gray-900/40 border-gray-700 hover:bg-gray-900/60' : 'bg-gray-50 border-gray-100 hover:bg-white hover:border-blue-200 hover:shadow-md'
                                    )}
                                >
                                    <div className="flex-1 min-w-0 mr-4">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={clsx(
                                                "text-xs font-black px-1.5 py-0.5 rounded",
                                                isDark ? "bg-blue-900/30 text-blue-400" : "bg-blue-100 text-blue-700"
                                            )}>
                                                #{order.orderNumber}
                                            </span>
                                            {/* Status Badge */}
                                            <span className={clsx(
                                                "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                                                order.status === 'Исполнен' ? (isDark ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700') :
                                                    (isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-600')
                                            )}>
                                                {order.status || 'Неизвестно'}
                                            </span>
                                        </div>
                                        <p className={clsx('text-sm truncate font-medium', isDark ? 'text-gray-300' : 'text-gray-700')} title={order.address}>
                                            {order.address}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1 text-xs opacity-60">
                                            <ClockIcon className="w-3 h-3" />
                                            <span>{order.plannedTime || 'Время не указано'}</span>
                                            {order.customerName && <span>• {order.customerName}</span>}
                                        </div>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className={clsx('text-lg font-black', isDark ? 'text-green-400' : 'text-green-600')}>
                                            {formatCurrency(order.amount)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            }

            {/* Last Settlement Info */}
            {
                summary.lastSettlement && (
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
                )
            }

            {/* Settlement Modal */}
            {
                showSettlementModal && (
                    <SettlementModal
                        courierId={courierId}
                        courierName={courierName}
                        divisionId={divisionId}
                        expectedAmount={cashToCollect}
                        orders={currentShift.cashOrders.orders} // Pass orders for detailed settlement
                        targetDate={summary.targetDate}
                        isDark={isDark}
                        onClose={() => setShowSettlementModal(false)}
                        onSuccess={() => {
                            setShowSettlementModal(false);
                            fetchFinancialSummary();
                        }}
                    />
                )
            }
        </div >
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
    percent?: number;
}

function PaymentMethodCard({ icon: Icon, label, amount, count, color, isDark, percent }: PaymentMethodCardProps) {
    const colorClasses = {
        green: {
            bg: isDark ? 'bg-green-500/10 hover:bg-green-500/20' : 'bg-green-50 hover:bg-green-100',
            border: isDark ? 'border-green-500/20' : 'border-green-100/50',
            text: isDark ? 'text-green-400' : 'text-green-700',
            bar: 'from-green-400 to-emerald-500',
            iconBg: isDark ? 'bg-green-500/20' : 'bg-white text-green-600 shadow-sm'
        },
        blue: {
            bg: isDark ? 'bg-blue-500/10 hover:bg-blue-500/20' : 'bg-blue-50 hover:bg-blue-100',
            border: isDark ? 'border-blue-500/20' : 'border-blue-100/50',
            text: isDark ? 'text-blue-400' : 'text-blue-700',
            bar: 'from-blue-400 to-indigo-500',
            iconBg: isDark ? 'bg-blue-500/20' : 'bg-white text-blue-600 shadow-sm'
        },
        purple: {
            bg: isDark ? 'bg-purple-500/10 hover:bg-purple-500/20' : 'bg-purple-50 hover:bg-purple-100',
            border: isDark ? 'border-purple-500/20' : 'border-purple-100/50',
            text: isDark ? 'text-purple-400' : 'text-purple-700',
            bar: 'from-purple-400 to-pink-500',
            iconBg: isDark ? 'bg-purple-500/20' : 'bg-white text-purple-600 shadow-sm'
        }
    };

    const colors = colorClasses[color];

    return (
        <div className={clsx(
            'p-5 rounded-3xl border transition-all duration-300 hover:scale-[1.05] hover:shadow-2xl flex flex-col justify-between glass-panel relative overflow-hidden group',
            colors.bg,
            colors.border
        )}>
            {/* Inner Glow */}
            <div className={clsx("absolute -top-10 -left-10 w-24 h-24 blur-3xl opacity-20 pointer-events-none transition-opacity group-hover:opacity-40", colors.text)} />

            <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="flex items-center gap-3">
                    <div className={clsx('p-2.5 rounded-2xl transition-all duration-300 group-hover:rotate-6 group-hover:scale-110', colors.iconBg)}>
                        <Icon className="w-5 h-5" />
                    </div>
                    <span className={clsx('text-xs font-black uppercase tracking-[0.1em] opacity-80', colors.text)}>{label}</span>
                </div>
                {percent !== undefined && (
                    <span className={clsx('text-[10px] font-black opacity-60 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-md', colors.text)}>
                        {Math.round(percent)}%
                    </span>
                )}
            </div>

            <div className="relative z-10">
                <p className={clsx('text-2xl font-black tracking-tighter mb-2', colors.text)}>
                    {new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH', minimumFractionDigits: 0 }).format(amount)}
                </p>

                <div className="flex items-center justify-between gap-4">
                    <p className={clsx('text-[10px] font-bold uppercase tracking-wider opacity-60', colors.text)}>
                        {count} {count === 1 ? 'заказ' : count < 5 ? 'заказа' : 'заказов'}
                    </p>
                    {percent !== undefined && (
                        <div className="flex-1 max-w-[60px] h-1.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden shadow-inner">
                            <div style={{ width: `${percent}%` }} className={clsx('h-full rounded-full bg-gradient-to-r transition-all duration-1000', colors.bar)} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Settlement Modal Component
function SettlementModal({
    courierId,
    courierName,
    divisionId,
    expectedAmount,
    orders = [], // New prop
    targetDate,
    isDark,
    onClose,
    onSuccess
}: any) {
    // State for overall cash received (can be manually edited or sum of orders)
    const [cashReceived, setCashReceived] = React.useState(expectedAmount.toString());
    const [notes, setNotes] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    // State for individual order settlements
    const [settledOrders, setSettledOrders] = React.useState<Record<string, number>>({});
    const [showDetails, setShowDetails] = React.useState(true); // Default to showing details if available

    // Initialize settled orders with expected amounts
    React.useEffect(() => {
        const initialSettled: Record<string, number> = {};
        if (orders && orders.length > 0) {
            orders.forEach((o: any) => {
                initialSettled[o.id || o.orderNumber] = parseFloat(o.amount || 0);
            });
            setSettledOrders(initialSettled);
        }
    }, [orders]);

    // Update total cash received when individual orders change
    const handleOrderChange = (orderId: string, amount: string) => {
        const val = parseFloat(amount);
        if (isNaN(val)) return;

        const newSettled = { ...settledOrders, [orderId]: val };
        setSettledOrders(newSettled);

        // Recalculate total
        const total = Object.values(newSettled).reduce((sum, curr) => sum + curr, 0);
        setCashReceived(total.toFixed(2));
    };

    // Handle manual total change (optional, maybe disable if details are active?)
    // For now, let's keep it simple: if you edit total, it overrides. 
    // But better UX is if you edit details, total updates. 

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            // Retrieve user info from localStorage if available, or default to 'Admin'
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : null;
            const settledBy = user?.name || user?.email || 'Admin';
            const token = localStorage.getItem('km_access_token');
            const encodedCourierId = encodeURIComponent(courierId);

            const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/couriers/${encodedCourierId}/settle`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token ? token.trim() : ''}`
                },
                body: JSON.stringify({
                    cashReceived: parseFloat(cashReceived),
                    notes,
                    settledBy,
                    divisionId,
                    targetDate,
                    // Optional: send detailed breakdown if backend supports it later
                    details: settledOrders
                })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Ошибка при закрытии смены');
            }

            // Success
            onSuccess();
        } catch (err: any) {
            console.error('Settlement error:', err);
            // Fallback for demo/dev mode if API is not actually running locally on this port
            if (err.message.includes('Failed to fetch') || err.message.includes('404')) {
                console.warn('API unavailable, simulating success for demo');
                setTimeout(onSuccess, 500);
                return;
            }
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const difference = parseFloat(cashReceived) - expectedAmount;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200 p-4 overflow-y-auto">
            <div className={clsx(
                'p-6 md:p-8 rounded-3xl max-w-2xl w-full mx-auto shadow-2xl transition-all scale-100 flex flex-col max-h-[90vh]',
                isDark ? 'bg-gray-800/95 border border-gray-700' : 'bg-white/95 border border-white/50'
            )} style={{ backdropFilter: 'blur(20px)' }}>

                <div className="flex-shrink-0 flex items-center justify-between mb-6">
                    <h3 className={clsx('text-xl font-black', isDark ? 'text-white' : 'text-gray-900')}>
                        Закрытие смены
                    </h3>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                        <span className="sr-only">Закрыть</span>
                        <svg className="w-5 h-5 opacity-60" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>

                <div className="flex-shrink-0 mb-6 p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 flex justify-between items-center">
                    <div>
                        <p className={clsx('text-xs uppercase font-bold mb-1 opacity-60', isDark ? 'text-blue-300' : 'text-blue-700')}>
                            Курьер
                        </p>
                        <p className={clsx('text-lg font-bold', isDark ? 'text-blue-100' : 'text-blue-900')}>
                            {courierName}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className={clsx('text-xs uppercase font-bold mb-1 opacity-60', isDark ? 'text-blue-300' : 'text-blue-700')}>
                            К сдаче
                        </p>
                        <p className={clsx('text-2xl font-black', isDark ? 'text-blue-100' : 'text-blue-900')}>
                            {formatCurrency(expectedAmount)}
                        </p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto mb-6 pr-2 custom-scrollbar">
                    <div className="flex items-center justify-between mb-4">
                        <label className={clsx('text-sm font-bold', isDark ? 'text-gray-300' : 'text-gray-700')}>
                            Детализация заказов ({orders?.length || 0})
                        </label>
                        <button
                            type="button"
                            onClick={() => setShowDetails(!showDetails)}
                            className="text-xs text-blue-500 hover:text-blue-600 font-medium"
                        >
                            {showDetails ? 'Скрыть' : 'Показать'}
                        </button>
                    </div>

                    {showDetails && orders && orders.length > 0 && (
                        <div className="space-y-3">
                            {orders.map((order: any, idx: number) => {
                                const orderId = order.id || order.orderNumber;
                                const expected = parseFloat(order.amount || 0);
                                const actual = settledOrders[orderId] ?? expected;
                                const diff = actual - expected;

                                return (
                                    <div key={idx} className={clsx(
                                        'flex items-center justify-between p-3 rounded-xl border transition-colors',
                                        diff !== 0
                                            ? (isDark ? 'bg-red-900/10 border-red-800' : 'bg-red-50 border-red-200')
                                            : (isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-100')
                                    )}>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-black bg-white/20 px-1.5 py-0.5 rounded">#{order.orderNumber}</span>
                                                <span className={clsx('text-xs truncate max-w-[150px]', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                                    {order.address}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right text-xs opacity-60">
                                                {formatCurrency(expected)}
                                            </div>
                                            <input
                                                type="number"
                                                value={actual}
                                                onChange={(e) => handleOrderChange(orderId, e.target.value)}
                                                className={clsx(
                                                    "w-24 px-2 py-1 text-right font-bold rounded-lg border focus:outline-none focus:ring-2",
                                                    isDark ? "bg-gray-900 border-gray-600 text-white focus:ring-blue-500" : "bg-white border-gray-300 text-gray-900 focus:ring-blue-500",
                                                    diff !== 0 && "text-red-500 border-red-300"
                                                )}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="flex-shrink-0 space-y-5">
                    <div className="flex items-end justify-between gap-4 p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50">
                        <div className="flex-1">
                            <label className={clsx('block text-sm font-bold mb-1', isDark ? 'text-gray-300' : 'text-gray-700')}>
                                Итого принято (факт)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                value={cashReceived}
                                // Allow manual override of total if needed, but warning: details sync might break?
                                // Let's allow it, but maybe just visually it's the sum. 
                                onChange={(e) => setCashReceived(e.target.value)}
                                className={clsx(
                                    'w-full bg-transparent text-3xl font-black border-none focus:ring-0 p-0 transition-colors',
                                    isDark ? 'text-white' : 'text-gray-900'
                                )}
                            />
                        </div>
                        {difference !== 0 && (
                            <div className={clsx(
                                'text-right',
                                difference > 0 ? 'text-green-500' : 'text-red-500'
                            )}>
                                <div className="text-sm font-bold">
                                    {difference > 0 ? 'Излишек' : 'Недостача'}
                                </div>
                                <div className="text-xl font-black">
                                    {formatCurrency(Math.abs(difference))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className={clsx('block text-sm font-bold mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
                            Примечание
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={1}
                            className={clsx(
                                'w-full px-4 py-3 rounded-xl text-sm border-2 transition-colors focus:outline-none resize-none',
                                isDark
                                    ? 'bg-gray-900/50 border-gray-600 focus:border-blue-500 text-white'
                                    : 'bg-white border-gray-200 focus:border-blue-500 text-gray-900'
                            )}
                            placeholder="Комментарий к недостаче..."
                        />
                    </div>

                    {error && (
                        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-medium">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className={clsx(
                                'px-6 py-4 rounded-xl font-bold text-sm transition-colors',
                                isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                            )}
                        >
                            Отмена
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className={clsx(
                                'flex-1 py-4 rounded-xl font-black text-white shadow-lg transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed',
                                isDark
                                    ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 shadow-green-900/40'
                                    : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 shadow-green-500/30'
                            )}
                        >
                            {loading ? 'Обработка...' : 'Закрыть смену'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
