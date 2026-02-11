import { useState, useEffect, useMemo, useCallback } from 'react';
import { clsx } from 'clsx';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { toast } from 'react-hot-toast';
import {
    BanknotesIcon,
    GlobeAltIcon,
    ClockIcon,
    ArrowsRightLeftIcon,
    ArrowTrendingUpIcon,
    ScaleIcon,
    ExclamationCircleIcon,
    PrinterIcon
} from '@heroicons/react/24/outline';
import type { Order } from '../../types';
import { SettlementModal } from './modals/SettlementModal';
import { PaymentDistributionChart } from './financials/PaymentDistributionChart';
import { FinancialMetricCard } from './financials/FinancialMetricCard';

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
    // Memoized result to avoid re-calculating on every UI ripple
    const localSummary = useMemo((): FinancialSummary | null => {
        if (!excelData?.orders) return null;

        const courierOrders = excelData.orders.filter((o: any) => {
            const c = o.courier;
            const cId = typeof c === 'object' ? (c.id || c._id || c.name) : c;
            return String(cId) === String(courierId) || String(o.courierName) === String(courierId);
        });

        if (courierOrders.length === 0 && !excelData.couriers.find((c: any) => c.name === courierName)) {
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

        const summary: FinancialSummary = {
            courierId,
            courierName,
            targetDate: targetDate || new Date().toISOString().split('T')[0],
            currentShift: {
                startTime: new Date().toISOString(),
                totalOrders: courierOrders.length,
                completedOrders: courierOrders.filter((o: any) =>
                    o.status === 'Исполнен' || o.status === 'Доставлен' || o.status === 'Доставляется'
                ).length,
                cashOrders: { count: 0, totalAmount: 0, orders: [] },
                cardOrders: { count: 0, totalAmount: 0, orders: [] },
                onlineOrders: { count: 0, totalAmount: 0, orders: [] },
                totalExpected: 0
            },
            historyOrders: []
        };

        courierOrders.forEach((order: any) => {
            // Only consider valid statuses for financials
            const isValidForFinancials = order.status !== 'Отменен' && order.status !== 'Возврат';

            // For history, we only care about settled orders from today or past
            if (order.settledDate) {
                // If it's settled today, we still count it towards today's stats? 
                // Usually history is ONLY for past settled. 
                // Let's keep existing logic: if settled -> history.
                summary.historyOrders.push({
                    ...order,
                    id: order.id || order.orderNumber,
                    amount: parseFloat(order.amount || order.totalAmount || 0)
                });
                return;
            }

            if (!isValidForFinancials) return;

            const amount = parseFloat(order.amount || order.totalAmount || 0);
            const changeAmount = parseFloat(order.changeAmount || 0);
            const paymentMethod = (order.paymentMethod || '').toLowerCase();
            const isCash = paymentMethod.includes('готівка') ||
                paymentMethod.includes('наличные') ||
                paymentMethod === 'cash' ||
                paymentMethod === '';

            // If cash, the courier might have collected MORE than the order amount if they needed to give change (but didn't?) 
            // Wait, changeAmount is "Сдача с...". So if order is 500, changeAmount is 1000, client gave 1000.
            // Courier collects 1000? NO. Courier collects 500. 
            // The "Change" logic in previous code was: effectiveAmount = Math.max(amount, changeAmount). 
            // This implies changeAmount is "Total Cash Handed Over"? 
            // Let's stick to the previous logic to be safe, but usually "changeAmount" means "Amount to give back".
            // Re-reading logic: `effectiveAmount = isCash ? Math.max(amount, changeAmount) : amount;`
            // If amount=500, changeAmount=1000 (client pays with 1000). 
            // Then effective = 1000. Courier has 1000 cash. 
            // Debt = 500 (order cost). He owes 500 to store? Or 1000? 
            // If he brings 1000 back, 500 is for order, 500 change? 
            // IF the store provides the change, then courier takes 500 + 500 change from store => delivers => gets 1000. Net change 0.
            // Let's assume the previous logic was correct for this specific business: `changeAmount` is likely "Received Check" or similar.
            const effectiveAmount = isCash ? Math.max(amount, changeAmount) : amount;

            const orderData: Order = {
                ...order,
                id: order.id || order.orderNumber,
                amount,
                changeAmount,
                effectiveAmount
            };

            if (isCash) {
                summary.currentShift.cashOrders.count++;
                summary.currentShift.cashOrders.totalAmount += effectiveAmount;
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
    }, [excelData, courierId, courierName, targetDate]);


    const fetchFinancialSummary = useCallback(async () => {
        setLoading(true);
        setError(null);

        // 1. Try Local Calculation First
        if (excelData && excelData.orders.length > 0) {
            console.log('загрузка с екселя');
            if (localSummary) {
                setSummary(localSummary);
                setLoading(false);
                return;
            }
        }

        // 2. Fallback to API
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

            if (!sanitizedToken) {
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
    }, [courierId, divisionId, targetDate, excelData, localSummary]);

    const fetchDebtSummary = useCallback(async () => {
        try {
            const token = localStorage.getItem('km_access_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/settlements/statistics-summary?divisionId=${divisionId}`, {
                headers: { 'Authorization': `Bearer ${token ? token.trim() : ''}` }
            });
            if (!response.ok) throw new Error('Failed to fetch debt summary');
            const result = await response.json();
            const courierData = result.data.find((d: any) => String(d.courierId) === String(courierId));
            setDebtSummary(courierData || null);
        } catch (err) {
            console.error('Error fetching debt summary:', err);
        }
    }, [courierId, divisionId]);

    useEffect(() => {
        fetchFinancialSummary();
        fetchDebtSummary();
    }, [fetchFinancialSummary, fetchDebtSummary]);

    // Memoize the active orders list
    const activeOrders = useMemo(() => {
        if (!summary) return [];
        const { currentShift, historyOrders } = summary;

        switch (activeTab) {
            case 'cash':
                return currentShift.cashOrders.orders;
            case 'online':
                return currentShift.onlineOrders.orders;
            case 'history':
                return historyOrders;
            default:
                return [];
        }
    }, [summary, activeTab]);


    const handleSwitchPaymentMethod = async (orderNumber: string, currentMethod: string) => {
        const newMethod = currentMethod.toLowerCase().includes('налич') || currentMethod.toLowerCase().includes('cash') ? 'Онлайн' : 'Наличные';

        setSwitchingOrderId(orderNumber);
        try {
            updateOrderPaymentMethod(orderNumber, newMethod);
            await fetchFinancialSummary();
        } catch (err) {
            console.error('Error switching payment method:', err);
            toast.error('Ошибка при смене способа оплаты');
        } finally {
            setSwitchingOrderId(null);
        }
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

    // Calculate Net Payable including debts (for future use or display if needed)
    // const deptAmount = debtSummary ? Math.abs(debtSummary.totalDifference) : 0;
    // const isDebtPositive = debtSummary ? debtSummary.totalDifference < 0 : false;
    // const netPayable = cashToCollect + (isDebtPositive ? deptAmount : -deptAmount);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-2">
                <div>
                    <h2 className={clsx('text-3xl font-black tracking-tight mb-1', isDark ? 'text-white' : 'text-gray-900')}>
                        {courierName}
                    </h2>
                    <div className="flex items-center gap-2">
                        <div className={clsx('w-2 h-2 rounded-full animate-pulse', currentShift.completedOrders > 0 ? 'bg-green-500' : 'bg-gray-400')}></div>
                        <p className={clsx('text-sm font-medium opacity-60', isDark ? 'text-gray-300' : 'text-gray-500')}>
                            Смена открыта • {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => window.print()}
                        className={clsx(
                            'p-3 rounded-xl transition-all shadow-sm border no-print',
                            isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-400' : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-500 hover:text-gray-900'
                        )}
                        title="Распечатать отчет"
                    >
                        <PrinterIcon className="w-5 h-5" />
                    </button>

                    <button
                        onClick={() => setShowSettlementModal(true)}
                        disabled={cashToCollect === 0}
                        className={clsx(
                            'px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg transition-all transform hover:-translate-y-1 active:scale-95 border border-transparent no-print',
                            cashToCollect > 0
                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-blue-500/30 hover:shadow-blue-500/50'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
                        )}
                    >
                        {cashToCollect > 0 ? 'Рассчитать курьера' : 'Нет средств'}
                    </button>
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <FinancialMetricCard
                    title="К сдаче (Нал)"
                    value={formatCurrency(cashToCollect)}
                    icon={BanknotesIcon}
                    color="green"
                    isDark={isDark}
                    trend={cashToCollect > 0 ? 100 : 0}
                    trendLabel="от выручки"
                />

                <FinancialMetricCard
                    title="Всего выручка"
                    value={formatCurrency(currentShift.totalExpected)}
                    icon={ScaleIcon}
                    color="blue"
                    isDark={isDark}
                    subValue={`${currentShift.totalOrders} заказов`}
                />

                <FinancialMetricCard
                    title="Долг / Баланс"
                    value={debtSummary ? formatCurrency(Math.abs(debtSummary.totalDifference)) : '₴0'}
                    icon={ExclamationCircleIcon}
                    color={!debtSummary ? 'gray' : debtSummary.totalDifference < 0 ? 'red' : 'green'}
                    isDark={isDark}
                    trend={debtSummary?.totalDifference ? (debtSummary.totalDifference < 0 ? -1 : 1) : 0}
                    trendLabel={debtSummary?.totalDifference < 0 ? 'Должен курьер' : 'Переплата'}
                    onClick={() => setShowDebts(!showDebts)}
                />

                <FinancialMetricCard
                    title="Эффективность"
                    value={`${currentShift.totalOrders > 0 ? Math.round((currentShift.completedOrders / currentShift.totalOrders) * 100) : 0}%`}
                    icon={ArrowTrendingUpIcon}
                    color="purple"
                    isDark={isDark}
                    subValue={`${currentShift.completedOrders} выполнено`}
                />
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left Column: Charts & Stats */}
                <div className="space-y-6 lg:col-span-1">
                    <PaymentDistributionChart
                        data={[
                            { label: 'Наличные', value: currentShift.cashOrders.totalAmount, color: '#10b981', icon: BanknotesIcon },
                            { label: 'Онлайн', value: currentShift.onlineOrders.totalAmount, color: '#8b5cf6', icon: GlobeAltIcon },
                            //{ label: 'Карта', value: currentShift.cardOrders.totalAmount, color: '#3b82f6', icon: CreditCardIcon }
                        ]}
                        total={currentShift.totalExpected}
                        isDark={isDark}
                    />

                    {/* Detailed Debt Info (Expandable) */}
                    {showDebts && debtSummary && (
                        <div className={clsx(
                            'p-6 rounded-3xl border transition-all animate-in slide-in-from-top-4',
                            isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-100 shadow-sm'
                        )}>
                            <h3 className={clsx('text-sm font-bold uppercase tracking-wider mb-4 opacity-70', isDark ? 'text-gray-300' : 'text-gray-600')}>
                                Детали балланса
                            </h3>
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="opacity-60">Сдано всего:</span>
                                    <span className="font-bold">{formatCurrency(debtSummary.totalReceived)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="opacity-60">Ожидалось:</span>
                                    <span className="font-bold">{formatCurrency(debtSummary.totalExpected)}</span>
                                </div>
                                <div className="pt-3 border-t border-dashed border-gray-200 dark:border-gray-700 mt-2">
                                    <div className="flex justify-between text-sm font-black">
                                        <span className={debtSummary.totalDifference < 0 ? 'text-red-500' : 'text-green-500'}>
                                            {debtSummary.totalDifference < 0 ? 'ДОЛГ' : 'ПЕРЕПЛАТА'}
                                        </span>
                                        <span className={debtSummary.totalDifference < 0 ? 'text-red-500' : 'text-green-500'}>
                                            {formatCurrency(Math.abs(debtSummary.totalDifference))}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: Order List */}
                <div className="lg:col-span-2">
                    <div className={clsx(
                        'rounded-3xl border overflow-hidden flex flex-col h-full min-h-[500px] glass-panel transition-all',
                        isDark ? 'shadow-black/20 border-white/5 bg-gray-900/40' : 'shadow-blue-500/5 border-white/60 bg-white/60'
                    )}>
                        {/* Tabs */}
                        <div className="flex items-center p-2 gap-2 border-b border-gray-100 dark:border-gray-800">
                            <button
                                onClick={() => setActiveTab('cash')}
                                className={clsx(
                                    'flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all relative overflow-hidden',
                                    activeTab === 'cash'
                                        ? (isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-50 text-green-700')
                                        : 'opacity-50 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-800'
                                )}
                            >
                                Наличные <span className="opacity-60 ml-1">({currentShift.cashOrders.count})</span>
                                {activeTab === 'cash' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-green-500" />}
                            </button>
                            <button
                                onClick={() => setActiveTab('online')}
                                className={clsx(
                                    'flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all relative overflow-hidden',
                                    activeTab === 'online'
                                        ? (isDark ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-50 text-purple-700')
                                        : 'opacity-50 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-800'
                                )}
                            >
                                Онлайн <span className="opacity-60 ml-1">({currentShift.onlineOrders.count})</span>
                                {activeTab === 'online' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-purple-500" />}
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={clsx(
                                    'flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all relative overflow-hidden',
                                    activeTab === 'history'
                                        ? (isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-50 text-blue-700')
                                        : 'opacity-50 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-800'
                                )}
                            >
                                История <span className="opacity-60 ml-1">({summary.historyOrders.length})</span>
                                {activeTab === 'history' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-500" />}
                            </button>
                        </div>

                        {/* List Content */}
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
                            {activeOrders.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center opacity-40">
                                    <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4 flex items-center justify-center">
                                        <ClockIcon className="w-8 h-8" />
                                    </div>
                                    <p className="text-sm font-bold uppercase tracking-widest">Нет заказов</p>
                                </div>
                            ) : (
                                activeOrders.map((order, idx) => (
                                    <div
                                        key={order.id || idx}
                                        className={clsx(
                                            'p-4 rounded-2xl border flex items-center justify-between transition-all group',
                                            isDark ? 'bg-gray-800/30 border-gray-700 hover:bg-gray-800/50' : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-md'
                                        )}
                                    >
                                        <div className="flex-1 min-w-0 mr-4">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={clsx(
                                                    "text-[10px] font-black px-1.5 py-0.5 rounded",
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
                                            <p className={clsx('text-sm truncate font-bold', isDark ? 'text-gray-300' : 'text-gray-700')} title={order.address}>
                                                {order.address}
                                            </p>

                                            <div className="flex items-center gap-3 mt-1.5">
                                                {order.changeAmount > order.amount && (
                                                    <div className={clsx(
                                                        "flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border",
                                                        isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-50 text-amber-700 border-amber-100"
                                                    )}>
                                                        <span>Сдача: {formatCurrency(order.changeAmount - order.amount)}</span>
                                                    </div>
                                                )}
                                                <span className="text-[10px] font-medium opacity-50 flex items-center gap-1">
                                                    <ClockIcon className="w-3 h-3" />
                                                    {order.plannedTime || '—'}
                                                </span>
                                            </div>
                                            {activeTab === 'history' && (order as any).settlementNote && (
                                                <div className="mt-2 text-xs italic opacity-60 bg-black/5 dark:bg-white/5 p-2 rounded-lg border border-black/5 dark:border-white/5">
                                                    {(order as any).settlementNote}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <p className={clsx('text-lg font-black tracking-tight',
                                                    activeTab === 'cash' ? (isDark ? 'text-green-400' : 'text-green-600') :
                                                        activeTab === 'online' ? (isDark ? 'text-purple-400' : 'text-purple-600') :
                                                            (isDark ? 'text-blue-400' : 'text-blue-600')
                                                )}>
                                                    {formatCurrency((order as any).settledAmount || (order as any).effectiveAmount || order.amount)}
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
                                                        'p-2 rounded-xl transition-all opacity-0 group-hover:opacity-100 shadow-sm border no-print',
                                                        isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-400' : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-500'
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
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

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
