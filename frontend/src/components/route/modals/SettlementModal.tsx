import React, { useState, useEffect, useMemo } from 'react';
import { clsx } from 'clsx';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';

// Helper to format currency moved to top-level for shared use
const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('uk-UA', {
        style: 'currency',
        currency: 'UAH',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
};

interface SettlementModalProps {
    courierName: string;
    orders?: any[];
    isDark?: boolean;
    onClose: () => void;
    updateExcelData: (callback: (prev: any) => any) => void;
    setShowSettlementModal: (show: boolean) => void;
    fetchFinancialSummary: () => Promise<void>;
}

export function SettlementModal({
    courierName,
    orders = [],
    isDark,
    onClose,
    updateExcelData,
    setShowSettlementModal,
    fetchFinancialSummary
}: SettlementModalProps) {
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Track which orders are being paid
    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(
        new Set(orders.map((o: any) => String(o.id || o.orderNumber)))
    );

    // Track per-order manual amounts (if they differ from calculated)
    const [orderAmounts, setOrderAmounts] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {};
        orders.forEach((o: any) => {
            const id = String(o.id || o.orderNumber);
            initial[id] = String(o.effectiveAmount || o.amount || 0);
        });
        return initial;
    });

    // Manual TOTAL amount state (the actual cash the courier handed over)
    const [manualTotal, setManualTotal] = useState<string>('0');
    const [isManualTotalOverride, setIsManualTotalOverride] = useState(false);

    // Sum of currently selected orders (considering their individual overridden amounts)
    const expectedSumBySelection = useMemo(() => {
        return orders
            .filter((o: any) => selectedOrderIds.has(String(o.id || o.orderNumber)))
            .reduce((sum: number, o: any) => {
                const id = String(o.id || o.orderNumber);
                const val = parseFloat(orderAmounts[id] || '0');
                return sum + (isNaN(val) ? 0 : val);
            }, 0);
    }, [orders, selectedOrderIds, orderAmounts]);

    // Update manual total when selection or individual amounts change, but only if not manually overridden at the total level
    useEffect(() => {
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
                            status: order.status === 'Исполнен' ? 'Исполнен' : (order.status || 'Исполнен'),
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
                                            <div className="flex flex-col items-end">
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
                                                {order.changeAmount > order.amount && (
                                                    <span className="text-[9px] font-bold text-amber-500 mt-1">
                                                        Вкл. сдачу: {formatCurrency(order.changeAmount - order.amount)}
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-sm font-black text-gray-400 whitespace-nowrap px-2">
                                                {formatCurrency(parseFloat(order.effectiveAmount || order.amount || 0))}
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
