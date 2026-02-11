import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { toast } from 'react-hot-toast';
import {
    BanknotesIcon,
    GlobeAltIcon,
    ClockIcon,
    ArrowsRightLeftIcon,
    CheckCircleIcon
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
    historyOrders: Order[];
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
    const [activeTab, setActiveTab] = useState<'cash' | 'online' | 'history'>('cash');
    const [switchingOrderId, setSwitchingOrderId] = useState<string | null>(null);
    const [debtSummary, setDebtSummary] = useState<any>(null);
    const [showDebts, setShowDebts] = useState(false);

    const { excelData, updateOrderPaymentMethod, updateExcelData } = useExcelData();

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
                },
                historyOrders: []
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
            },
            historyOrders: []
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

            // If order is already settled, add to history and don't count in active shift totals
            if (order.status === 'Исполнен') {
                summary.historyOrders.push({
                    ...order,
                    id: order.id || order.orderNumber,
                    amount: parseFloat(order.amount || order.totalAmount || 0)
                });
                return;
            }

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

            const url = `${import.meta.env.VITE_API_URL || ''}/api/v1/couriers/${encodedCourierId}/financial-summary?divisionId=${encodedDivisionId}&targetDate=${encodedDate}`;

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
            // Guard against missing properties that might cause .query or other undefined errors
            if (data && typeof data === 'object') {
                setSummary(data);
            } else {
                throw new Error('Получен пустой или некорректный ответ от сервера');
            }
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
        fetchDebtSummary();
    }, [courierId, divisionId, targetDate]);

    const fetchDebtSummary = async () => {
        try {
            const token = localStorage.getItem('km_access_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/settlements/statistics-summary?divisionId=${divisionId}`, {
                headers: { 'Authorization': `Bearer ${token ? token.trim() : ''}` }
            });
            if (!response.ok) throw new Error('Failed to fetch debt summary');
            const result = await response.json();
            // Find current courier in the summary
            const courierData = result.data.find((d: any) => String(d.courierId) === String(courierId));
            setDebtSummary(courierData || null);
        } catch (err) {
            console.error('Error fetching debt summary:', err);
        }
    };


    const handleSwitchPaymentMethod = async (orderNumber: string, currentMethod: string) => {
        const newMethod = currentMethod.toLowerCase().includes('налич') || currentMethod.toLowerCase().includes('cash') ? 'Онлайн' : 'Наличные';

        setSwitchingOrderId(orderNumber);
        try {
            // Use client-side update instead of backend API
            updateOrderPaymentMethod(orderNumber, newMethod);

            // Refresh financial summary to reflect the change
            await fetchFinancialSummary();
        } catch (err) {
            console.error('Error switching payment method:', err);
            toast.error('Ошибка при смене способа оплаты');
        } finally {
            setSwitchingOrderId(null);
        }
    };

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

            {/* Debts & Overages Section */}
            {debtSummary && (
                <div className={clsx(
                    'p-6 rounded-3xl border transition-all hover:shadow-lg glass-panel relative overflow-hidden mb-6',
                    isDark ? 'shadow-black/20' : 'shadow-gray-200'
                )}>
                    {/* Background glow for debt section */}
                    <div className={clsx(
                        'absolute -inset-1 opacity-10 blur-xl pointer-events-none',
                        debtSummary.totalDifference > 0 ? 'bg-red-500' : 'bg-green-500'
                    )} />

                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className={clsx(
                                    'p-2 rounded-xl',
                                    debtSummary.totalDifference > 0 ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'
                                )}>
                                    <BanknotesIcon className="w-5 h-5" />
                                </div>
                                <h3 className={clsx('text-lg font-bold', isDark ? 'text-gray-200' : 'text-gray-800')}>
                                    Состояние счета
                                </h3>
                            </div>
                            <div className={clsx(
                                'text-xl font-black',
                                debtSummary.totalDifference > 0 ? 'text-red-500' : 'text-green-500'
                            )}>
                                {debtSummary.totalDifference > 0 ? '-' : '+'}{formatCurrency(Math.abs(debtSummary.totalDifference))}
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <p className={clsx('text-xs font-bold opacity-60', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                {debtSummary.totalDifference > 0 ? 'Общая задолженность' : 'Переплата (баланс)'}
                            </p>
                            <button
                                onClick={() => setShowDebts(!showDebts)}
                                className="text-xs font-bold text-blue-500 hover:underline"
                            >
                                {showDebts ? 'Скрыть детали' : 'Подробнее'}
                            </button>
                        </div>

                        {showDebts && (
                            <div className="mt-6 space-y-4 animate-in slide-in-from-top-2 duration-300">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 transition-all hover:border-black/10 dark:hover:border-white/10">
                                        <p className="text-[10px] uppercase font-bold opacity-40 mb-1">Сдано всего</p>
                                        <p className="font-black text-lg">{formatCurrency(debtSummary.totalReceived)}</p>
                                    </div>
                                    <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 transition-all hover:border-black/10 dark:hover:border-white/10">
                                        <p className="text-[10px] uppercase font-bold opacity-40 mb-1">Ожидалось</p>
                                        <p className="font-black text-lg">{formatCurrency(debtSummary.totalExpected)}</p>
                                    </div>
                                </div>
                                {debtSummary.allNotes && (
                                    <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
                                        <p className="text-[10px] uppercase font-bold opacity-40 mb-2 font-mono">История заметок</p>
                                        <p className="text-sm leading-relaxed opacity-80 italic font-medium">
                                            {debtSummary.allNotes.split(' | ').slice(-5).join(' • ')}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Orders List */}
            <div className={clsx(
                'p-6 rounded-3xl border transition-all hover:shadow-lg glass-panel',
                isDark ? 'shadow-black/20' : 'shadow-gray-200'
            )}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                    <h3 className={clsx('text-lg font-bold flex items-center gap-3', isDark ? 'text-gray-200' : 'text-gray-800')}>
                        <span>Детализация заказов</span>
                    </h3>

                    <div className="flex p-1 bg-black/5 dark:bg-white/5 rounded-2xl">
                        <button
                            onClick={() => setActiveTab('cash')}
                            className={clsx(
                                'px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all',
                                activeTab === 'cash'
                                    ? (isDark ? 'bg-green-600 text-white shadow-lg' : 'bg-white text-green-600 shadow-sm')
                                    : (isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600')
                            )}
                        >
                            Наличные ({currentShift.cashOrders.count})
                        </button>
                        <button
                            onClick={() => setActiveTab('online')}
                            className={clsx(
                                'px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all',
                                activeTab === 'online'
                                    ? (isDark ? 'bg-purple-600 text-white shadow-lg' : 'bg-white text-purple-600 shadow-sm')
                                    : (isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600')
                            )}
                        >
                            Онлайн ({currentShift.onlineOrders.count})
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={clsx(
                                'px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all',
                                activeTab === 'history'
                                    ? (isDark ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-blue-600 shadow-sm')
                                    : (isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600')
                            )}
                        >
                            История ({summary.historyOrders.length})
                        </button>
                    </div>
                </div>

                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                    {(activeTab === 'cash' ? currentShift.cashOrders.orders : activeTab === 'online' ? currentShift.onlineOrders.orders : summary.historyOrders).map((order, idx) => (
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
                                {activeTab === 'history' && (order as any).settlementNote && (
                                    <div className="mt-2 text-xs italic opacity-60 bg-black/5 dark:bg-white/5 p-2 rounded-lg">
                                        Note: {(order as any).settlementNote}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <p className={clsx('text-lg font-black', activeTab === 'cash' ? (isDark ? 'text-green-400' : 'text-green-600') : activeTab === 'online' ? (isDark ? 'text-purple-400' : 'text-purple-600') : (isDark ? 'text-blue-400' : 'text-blue-600'))}>
                                        {formatCurrency((order as any).settledAmount || order.amount)}
                                    </p>
                                    {activeTab === 'history' && order.amount !== (order as any).settledAmount && (
                                        <p className={clsx('text-[10px] font-bold', (order as any).settledAmount > order.amount ? 'text-green-500' : 'text-red-500')}>
                                            {(order as any).settledAmount > order.amount ? '+' : '-'}{formatCurrency(Math.abs((order as any).settledAmount - order.amount))}
                                        </p>
                                    )}
                                </div>
                                {activeTab !== 'history' && (
                                    <button
                                        onClick={() => handleSwitchPaymentMethod(String(order.orderNumber), String((order as any).paymentMethod || ''))}
                                        disabled={switchingOrderId === String(order.id || order.orderNumber)}
                                        className={clsx(
                                            'p-2 rounded-lg transition-all opacity-0 group-hover:opacity-100',
                                            isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-200 text-gray-500'
                                        )}
                                        title="Сменить способ оплаты"
                                    >
                                        {switchingOrderId === order.orderNumber ? (
                                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <ArrowsRightLeftIcon className="w-4 h-4" />
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    {(activeTab === 'cash' ? currentShift.cashOrders.orders : activeTab === 'online' ? currentShift.onlineOrders.orders : summary.historyOrders).length === 0 && (
                        <div className="py-12 text-center opacity-40 font-bold uppercase tracking-widest text-xs">
                            Нет заказов в этой категории
                        </div>
                    )}
                </div>
            </div>

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
                    courierName={courierName}
                    orders={currentShift.cashOrders.orders}
                    isDark={isDark}
                    onClose={() => setShowSettlementModal(false)}
                    updateExcelData={updateExcelData}
                    setShowSettlementModal={setShowSettlementModal}
                    fetchFinancialSummary={fetchFinancialSummary}
                />
            )}
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

// Settlement Modal Component (Redesigned with Checkboxes, Per-Order Amounts, and Manual Total)
function SettlementModal({
    courierName,
    orders = [],
    isDark,
    onClose,
    updateExcelData,
    setShowSettlementModal,
    fetchFinancialSummary
}: any) {
    const [notes, setNotes] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    // Track which orders are being paid
    const [selectedOrderIds, setSelectedOrderIds] = React.useState<Set<string>>(
        new Set(orders.map((o: any) => String(o.id || o.orderNumber)))
    );

    // Track per-order manual amounts (if they differ from calculated)
    const [orderAmounts, setOrderAmounts] = React.useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {};
        orders.forEach((o: any) => {
            const id = String(o.id || o.orderNumber);
            initial[id] = String(o.amount || 0);
        });
        return initial;
    });

    // Manual TOTAL amount state (the actual cash the courier handed over)
    const [manualTotal, setManualTotal] = React.useState<string>('0');
    const [isManualTotalOverride, setIsManualTotalOverride] = React.useState(false);

    // Sum of currently selected orders (considering their individual overridden amounts)
    const expectedSumBySelection = React.useMemo(() => {
        return orders
            .filter((o: any) => selectedOrderIds.has(String(o.id || o.orderNumber)))
            .reduce((sum: number, o: any) => {
                const id = String(o.id || o.orderNumber);
                const val = parseFloat(orderAmounts[id] || '0');
                return sum + (isNaN(val) ? 0 : val);
            }, 0);
    }, [orders, selectedOrderIds, orderAmounts]);

    // Update manual total when selection or individual amounts change, but only if not manually overridden at the total level
    React.useEffect(() => {
        if (!isManualTotalOverride) {
            setManualTotal(expectedSumBySelection.toString());
        }
    }, [expectedSumBySelection, isManualTotalOverride]);

    const toggleOrder = (id: string) => {
        const newSet = new Set(selectedOrderIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedOrderIds(newSet);
    };

    const handleOrderAmountChange = (id: string, value: string) => {
        setOrderAmounts(prev => ({ ...prev, [id]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const cashReceived = parseFloat(manualTotal);
        if (isNaN(cashReceived)) {
            setError('Введите корректную сумму');
            setLoading(false);
            return;
        }

        try {
            // Client-side settlement: mark selected orders as settled
            const selectedOrders = Array.from(selectedOrderIds);

            if (selectedOrders.length === 0) {
                throw new Error('Выберите хотя бы один заказ');
            }

            // Update order statuses to 'Исполнен' (completed)
            updateExcelData((prev: any) => {
                const updatedOrders = prev.orders.map((order: any) => {
                    const orderId = String(order.id || order.orderNumber);
                    if (selectedOrderIds.has(orderId)) {
                        return {
                            ...order,
                            status: 'Исполнен',
                            settlementNote: notes,
                            settledAmount: orderAmounts[orderId],
                            settledDate: new Date().toISOString()
                        };
                    }
                    return order;
                });
                return { ...prev, orders: updatedOrders };
            });

            // Show success message
            toast.success(`Расчет выполнен! Получено: ${formatCurrency(cashReceived)}`, { duration: 3000 });

            // Close modal and refresh
            setShowSettlementModal(false);
            await fetchFinancialSummary();

        } catch (err: any) {
            console.error('Settlement error:', err);
            setError(err.message || 'Произошла непредвиденная ошибка');
        } finally {
            setLoading(false);
        }
    };

    // Calculate difference (Debt/Overpayment)
    const totalPaid = parseFloat(manualTotal) || 0;
    const difference = totalPaid - expectedSumBySelection;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200 p-4">
            <div className={clsx(
                'p-6 md:p-8 rounded-[2.5rem] max-w-xl w-full mx-auto shadow-2xl transition-all scale-100 flex flex-col max-h-[90vh]',
                isDark ? 'bg-gray-800/95 border border-gray-700' : 'bg-white/95 border border-white/50'
            )} style={{ backdropFilter: 'blur(20px)' }}>

                <div className="flex-shrink-0 flex items-center justify-between mb-8">
                    <div>
                        <h3 className={clsx('text-2xl font-black mb-1', isDark ? 'text-white' : 'text-gray-900')}>
                            Расчет курьера
                        </h3>
                        <p className={clsx('text-sm font-bold opacity-50', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            {courierName}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-3 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        <svg className="w-6 h-6 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto mb-8 pr-2 custom-scrollbar">
                    <div className="flex items-center justify-between mb-4">
                        <label className={clsx('text-xs font-black uppercase tracking-widest opacity-60', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            Выберите оплаченные заказы ({selectedOrderIds.size})
                        </label>
                        <span className="text-[10px] font-bold opacity-40 italic">Отредактируйте сумму если нужно</span>
                    </div>

                    <div className="space-y-3">
                        {orders.map((order: any, idx: number) => {
                            const orderId = String(order.id || order.orderNumber);
                            const isSelected = selectedOrderIds.has(orderId);

                            return (
                                <div
                                    key={idx}
                                    className={clsx(
                                        'flex items-center justify-between p-4 rounded-2xl border transition-all',
                                        isSelected
                                            ? (isDark ? 'bg-blue-500/10 border-blue-500/50' : 'bg-blue-50 border-blue-200')
                                            : (isDark ? 'bg-gray-900/40 border-gray-700 grayscale opacity-40' : 'bg-gray-50 border-gray-100 grayscale opacity-40')
                                    )}
                                >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div
                                            onClick={() => toggleOrder(orderId)}
                                            className={clsx(
                                                'w-6 h-6 flex-shrink-0 rounded-lg border-2 flex items-center justify-center transition-all cursor-pointer',
                                                isSelected
                                                    ? 'bg-blue-500 border-blue-500 text-white'
                                                    : (isDark ? 'border-gray-600' : 'border-gray-300')
                                            )}
                                        >
                                            {isSelected && <CheckCircleIcon className="w-4 h-4" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className={clsx('text-sm font-black truncate', isDark ? 'text-white' : 'text-gray-900')}>
                                                #{order.orderNumber}
                                            </p>
                                            <p className={clsx('text-[10px] font-bold opacity-60 truncate', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                                {order.address}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0 ml-4">
                                        {isSelected ? (
                                            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl px-2 py-1 border border-black/5 dark:border-white/10 shadow-inner">
                                                <input
                                                    type="text"
                                                    value={orderAmounts[orderId]}
                                                    onChange={(e) => handleOrderAmountChange(orderId, e.target.value)}
                                                    className={clsx(
                                                        'w-16 md:w-20 text-right text-sm font-black bg-transparent outline-none transition-all',
                                                        isDark ? 'text-blue-400' : 'text-blue-600'
                                                    )}
                                                />
                                                <span className="ml-1 text-[10px] font-black opacity-30">₴</span>
                                            </div>
                                        ) : (
                                            <p className="text-sm font-black text-gray-400 whitespace-nowrap px-2">
                                                {formatCurrency(parseFloat(order.amount || 0))}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="flex-shrink-0 space-y-6">
                    <div className="p-6 rounded-[2rem] bg-gray-50 dark:bg-gray-900/50 border border-black/5 dark:border-white/5 shadow-inner">
                        <div className="flex items-center justify-between mb-4">
                            <span className={clsx('text-xs font-black uppercase tracking-widest opacity-60', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                Сколько сдал курьер
                            </span>
                            <div className="flex flex-col items-end">
                                <div className="flex items-center">
                                    <input
                                        type="text"
                                        value={manualTotal}
                                        onChange={(e) => {
                                            setManualTotal(e.target.value);
                                            setIsManualTotalOverride(true);
                                        }}
                                        className={clsx(
                                            'w-32 text-right text-3xl font-black bg-transparent border-b-2 outline-none transition-all',
                                            isDark
                                                ? 'text-white border-blue-500/50 focus:border-blue-500'
                                                : 'text-gray-900 border-blue-500/30 focus:border-blue-500'
                                        )}
                                    />
                                    <span className={clsx("ml-2 text-xl font-bold opacity-30", isDark ? "text-white" : "text-gray-900")}>₴</span>
                                </div>
                                {isManualTotalOverride && (
                                    <button
                                        type="button"
                                        onClick={() => setIsManualTotalOverride(false)}
                                        className="text-[10px] font-black text-blue-500 uppercase mt-1 hover:underline"
                                    >
                                        Сбросить (авто: {formatCurrency(expectedSumBySelection)})
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Balance Calculation Result */}
                        <div className={clsx(
                            "flex items-center justify-between py-4 px-5 rounded-2xl mb-4 transition-all duration-300 shadow-sm",
                            difference > 0
                                ? (isDark ? "bg-green-500/10 text-green-400 border border-green-500/30" : "bg-green-50 text-green-700 border border-green-200")
                                : difference < 0
                                    ? (isDark ? "bg-red-500/10 text-red-400 border border-red-500/30" : "bg-red-50 text-red-700 border border-red-200")
                                    : (isDark ? "bg-gray-800 text-gray-400 border border-gray-700" : "bg-gray-100 text-gray-500 border border-gray-200")
                        )}>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase tracking-[0.1em] opacity-60 mb-0.5">
                                    {difference > 0 ? 'Переплата (Лишние)' : difference < 0 ? 'Задолженность (Недодал)' : 'Итого к расчету'}
                                </span>
                                <span className="text-xs font-bold opacity-40">
                                    {isManualTotalOverride ? 'Ручной ввод активен' : 'Авто расчет по заказам'}
                                </span>
                            </div>
                            <span className={clsx(
                                "text-xl font-black tabular-nums",
                                difference !== 0 && "animate-pulse"
                            )}>
                                {difference > 0 ? '+' : ''}{formatCurrency(difference)}
                            </span>
                        </div>

                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={1}
                            className={clsx(
                                'w-full px-4 py-3 rounded-2xl text-sm border-2 transition-all focus:outline-none resize-none',
                                isDark
                                    ? 'bg-gray-900/50 border-gray-700 focus:border-blue-500 text-white'
                                    : 'bg-white border-gray-200 focus:border-blue-500 text-gray-900'
                            )}
                            placeholder="Примечание (необязательно)..."
                        />
                    </div>

                    {error && (
                        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-bold ring-1 ring-red-200 dark:ring-red-800 animate-pulse">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className={clsx(
                                'px-8 py-5 rounded-[1.5rem] font-black text-sm uppercase tracking-widest transition-colors',
                                isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                            )}
                        >
                            ОТМЕНА
                        </button>
                        <button
                            type="submit"
                            disabled={loading || selectedOrderIds.size === 0}
                            className={clsx(
                                'flex-1 py-5 rounded-[1.5rem] font-black text-white text-sm uppercase tracking-[0.2em] shadow-2xl transition-all transform hover:-translate-y-1 active:scale-95 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed',
                                isDark
                                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-blue-900/40'
                                    : 'bg-gradient-to-r from-blue-500 to-indigo-600 shadow-blue-500/30'
                            )}
                        >
                            {loading ? 'Обработка...' : 'ОПЛАТИЛ'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
