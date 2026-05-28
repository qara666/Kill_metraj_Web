import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { clsx } from 'clsx';
import { CheckCircleIcon, XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import { getPaymentMethodBadgeProps } from '../../../utils/data/paymentMethodHelper';

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('uk-UA', {
        style: 'currency',
        currency: 'UAH',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value).replace('UAH', '₴');
};

interface OrderItemProps {
    order: any;
    isSelected: boolean;
    isDark: boolean;
    isUntaken: boolean;
    amountValue: string;
    onToggleOrder: (id: string) => void;
    onToggleUntakenChange: (id: string, e: React.MouseEvent) => void;
    onAmountChange: (id: string, value: string) => void;
}

const OrderItem = React.memo(function OrderItem({
    order,
    isSelected,
    isDark,
    isUntaken,
    amountValue,
    onToggleOrder,
    onToggleUntakenChange,
    onAmountChange
}: OrderItemProps) {
    const orderId = String(order.id || order.orderNumber);

    return (
        <div
            onClick={() => onToggleOrder(orderId)}
            className={clsx(
                'group flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 rounded-[1.25rem] border transition-all cursor-pointer transform-gpu',
                isSelected
                    ? (isDark ? 'bg-[#263145] border-blue-500/30' : 'bg-blue-50 border-blue-200')
                    : (isDark ? 'bg-[#2C2C2E] border-transparent hover:bg-[#3A3A3C]' : 'bg-gray-50 border-transparent hover:bg-gray-100')
            )}
        >
            <div className="flex items-center gap-3.5 min-w-0 flex-1 w-full sm:w-auto">
                <div className={clsx(
                    'w-6 h-6 shrink-0 rounded-full border flex items-center justify-center transition-all',
                    isSelected 
                        ? 'bg-blue-500 border-blue-500 text-white' 
                        : (isDark ? 'border-gray-500 bg-[#1C1C1E]' : 'border-gray-300 bg-white')
                )}>
                    <CheckCircleIcon className={clsx("w-4 h-4 transition-transform", isSelected ? "scale-100" : "scale-0")} />
                </div>
                <div className="min-w-0 flex-1 flex flex-col justify-center">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        <span className={clsx("text-[15px] font-semibold tracking-tight", isDark ? "text-white" : "text-gray-900")}>
                            #{order.orderNumber}
                        </span>
                        {parseFloat(order.changeAmount || 0) > 0 && (
                            <button
                                onClick={(e) => onToggleUntakenChange(orderId, e)}
                                title={isUntaken ? "Сдача возвращена в расчет" : "Сдачу не брал (вычесть из суммы)"}
                                className={clsx(
                                    "px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-all",
                                    isUntaken
                                        ? (isDark ? "bg-red-500/20 text-red-400" : "bg-red-100 text-red-700")
                                        : (isDark ? "bg-amber-500/20 text-amber-400" : "bg-amber-100 text-amber-700")
                                )}
                            >
                                {isUntaken 
                                    ? "Без сдачи" 
                                    : `Сдача: ${Math.round((parseFloat(order.changeAmount || 0) - parseFloat(order.amount || 0)) * 100) / 100}₴`}
                            </button>
                        )}
                        {order.paymentMethod && order.paymentMethod.toLowerCase().includes('отказ') && (() => {
                            const badgeProps = getPaymentMethodBadgeProps(order.paymentMethod, !!isDark);
                            return (
                                <span className={clsx(
                                    "px-2 py-0.5 rounded-lg text-[11px] font-semibold border-transparent",
                                    badgeProps.bgColorClass,
                                    badgeProps.textColorClass
                                )}>
                                    {badgeProps.text}
                                </span>
                            );
                        })()}
                    </div>
                    <p className={clsx("text-[13px] font-medium line-clamp-1 mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                        {order.address}
                    </p>
                </div>
            </div>

            <div className="shrink-0 w-full sm:w-auto mt-2 sm:mt-0 sm:ml-4 flex justify-end" onClick={e => e.stopPropagation()}>
                <div className="flex items-center px-1">
                    <input
                        type="text"
                        disabled={!isSelected}
                        value={amountValue}
                        onChange={(e) => onAmountChange(orderId, e.target.value)}
                        className={clsx(
                            'w-16 text-right text-[15px] font-semibold bg-transparent outline-none transition-colors',
                            isSelected ? (isDark ? 'text-blue-400' : 'text-blue-600') : 'text-gray-400'
                        )}
                    />
                    <span className={clsx("ml-1 text-[13px] font-medium", isDark ? "text-gray-500" : "text-gray-400")}>₴</span>
                </div>
            </div>
        </div>
    );
});

interface SettlementModalProps {
    courierName: string;
    orders?: any[];
    isDark?: boolean;
    onClose: () => void;
    updateExcelData: (callback: (prev: any) => any) => void;
    setShowSettlementModal: (show: boolean) => void;
    saveManualOverrides: (orders: any[]) => void;
}

export function SettlementModal({
    courierName,
    orders = [],
    isDark,
    onClose,
    updateExcelData,
    saveManualOverrides,
    setShowSettlementModal
}: SettlementModalProps) {
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(
        new Set(orders.map((o: any) => String(o.id || o.orderNumber)))
    );

    // Search state
    const [searchQuery, setSearchQuery] = useState('');

    // Track per-order manual amounts
    const [orderAmounts, setOrderAmounts] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {};
        orders.forEach((o: any) => {
            const id = String(o.id || o.orderNumber);
            const amount = parseFloat(o.amount || o.totalAmount || 0);
            const changeAmount = parseFloat(o.changeAmount || 0);
            const expectedReturn = changeAmount > amount ? changeAmount : amount;
            
            const isRefused = o.effectiveAmount === 0 || o.effectiveAmount === '0';
            initial[id] = String(isRefused ? 0 : expectedReturn);
        });
        return initial;
    });

    // Track "Untaken Change" (сдачу не брал) state per order
    const [untakenChanges, setUntakenChanges] = useState<Set<string>>(new Set());

    // Manual TOTAL amount state
    const [manualTotal, setManualTotal] = useState<string>('0');
    const [isManualTotalOverride, setIsManualTotalOverride] = useState(false);

    const expectedSumBySelection = useMemo(() => {
        return orders
            .filter((o: any) => selectedOrderIds.has(String(o.id || o.orderNumber)))
            .reduce((sum: number, o: any) => {
                const id = String(o.id || o.orderNumber);
                const baseAmount = parseFloat(orderAmounts[id] || '0');
                return sum + (isNaN(baseAmount) ? 0 : baseAmount);
            }, 0);
    }, [orders, selectedOrderIds, orderAmounts]);

    // STRICT Expected sum calculation (Ignoring "Без сдачи" toggles for the expected total)
    const currentExpectedSum = useMemo(() => {
        let total = 0;
        orders.forEach((o: any) => {
            const id = String(o.id || o.orderNumber);
            if (!selectedOrderIds.has(id)) return;

            const amount = parseFloat(o.amount || o.totalAmount || 0);
            const changeAmount = parseFloat(o.changeAmount || 0);
            const expectedReturn = changeAmount > amount ? changeAmount : amount;
            const isRefused = o.effectiveAmount === 0 || o.effectiveAmount === '0';
            
            total += isRefused ? 0 : expectedReturn;
        });
        return total;
    }, [orders, selectedOrderIds]);

    // RECEIVED sum calculation (Respecting "Без сдачи" toggles from orderAmounts)
    const autoReceivedSum = useMemo(() => {
        let total = 0;
        orders.forEach((o: any) => {
            const id = String(o.id || o.orderNumber);
            if (!selectedOrderIds.has(id)) return;

            const val = parseFloat(orderAmounts[id] || '0');
            total += isNaN(val) ? 0 : val;
        });
        return total;
    }, [orders, selectedOrderIds, orderAmounts]);

    const toggleUntakenChange = useCallback((id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const order = orders.find((o: any) => String(o.id || o.orderNumber) === id);
        if (!order) return;

        const newSet = new Set(untakenChanges);
        let isUntakenNow = false;
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
            isUntakenNow = true;
        }
        setUntakenChanges(newSet);

        // Update the orderAmounts[id]!
        const amount = parseFloat(order.amount || order.totalAmount || 0);
        const changeAmount = parseFloat(order.changeAmount || 0);
        const expectedReturn = changeAmount > amount ? changeAmount : amount;

        setOrderAmounts(prev => ({
            ...prev,
            [id]: String(isUntakenNow ? amount : expectedReturn)
        }));
    }, [orders, untakenChanges]);

    useEffect(() => {
        if (!isManualTotalOverride) {
            setManualTotal(autoReceivedSum.toString());
        }
    }, [autoReceivedSum, isManualTotalOverride]);

    const filteredOrders = useMemo(() => {
        if (!searchQuery) return orders;
        const q = searchQuery.toLowerCase();
        return orders.filter((o: any) =>
            String(o.orderNumber).toLowerCase().includes(q) ||
            (o.address || '').toLowerCase().includes(q)
        );
    }, [orders, searchQuery]);

    const handleExactCash = useCallback(() => {
        setIsManualTotalOverride(false);
        setManualTotal(autoReceivedSum.toString());
    }, [autoReceivedSum]);

    const toggleOrder = useCallback((id: string) => {
        setSelectedOrderIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    }, []);

    const toggleAll = useCallback(() => {
        setSelectedOrderIds(prev => {
            if (prev.size === orders.length) {
                return new Set();
            } else {
                return new Set(orders.map(o => String(o.id || o.orderNumber)));
            }
        });
    }, [orders]);

    const handleOrderAmountChange = useCallback((id: string, value: string) => {
        setOrderAmounts(prev => ({ ...prev, [id]: value }));
    }, []);

    const difference = (parseFloat(manualTotal) || 0) - currentExpectedSum;

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
            const selectedOrders = Array.from(selectedOrderIds);

            if (selectedOrders.length === 0) {
                throw new Error('Выберите хотя бы один заказ');
            }

            updateExcelData((prev: any) => {
                const sessionId = `settle-${Date.now()}`;
                const totalExpected = currentExpectedSum;
                const totalReceived = cashReceived;
                const totalDifference = difference;

                const updatedOrders = prev.orders.map((order: any) => {
                    const orderId = String(order.id || order.orderNumber);
                    if (selectedOrderIds.has(orderId)) {
                        const isUntaken = untakenChanges.has(orderId);
                        const baseNote = isUntaken ? 'СДАЧУ НЕ БРАЛ. ' : '';

                        return {
                            ...order,
                            status: 'Исполнен',
                            settlementNote: baseNote + notes,
                            settledAmount: orderAmounts[orderId],
                            settledDate: new Date().toISOString(),
                            settlementSessionId: sessionId,
                            sessionTotalReceived: totalReceived,
                            sessionTotalDifference: totalDifference,
                            sessionTotalExpected: totalExpected,
                            untakenChange: isUntaken,
                            originalChangeAmount: order.changeAmount
                        };
                    }
                    return order;
                });
                const next = { ...prev, orders: updatedOrders };
                
                saveManualOverrides(next.orders);
                return next;
            });

            toast.success(`Расчет выполнен!`, { duration: 3000 });
            setShowSettlementModal(false);
        } catch (err: any) {
            setError(err.message || 'Ошибка при расчете');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 sm:p-6">
            <div className={clsx(
                'w-full max-w-5xl mx-auto rounded-[2rem] shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[92vh] transition-all',
                isDark ? 'bg-[#1C1C1E] border border-white/10' : 'bg-white border border-black/5'
            )}>
                {/* LEFT PANE: Orders List */}
                <div className={clsx(
                    "flex-[1.3] flex flex-col border-b md:border-b-0 md:border-r z-10 shadow-[2px_0_10px_rgba(0,0,0,0.02)]",
                    isDark ? "border-white/5 bg-[#1C1C1E]" : "border-black/5 bg-white"
                )}>
                    {/* Header */}
                    <div className="px-6 pt-6 pb-4 flex items-center justify-between">
                        <div>
                            <h3 className={clsx("text-2xl font-semibold tracking-tight", isDark ? "text-white" : "text-gray-900")}>
                                Расчет с курьером
                            </h3>
                            <p className="text-[14px] font-medium text-gray-500 mt-0.5">{courierName}</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={toggleAll}
                                className="text-[14px] font-medium text-blue-500 hover:text-blue-600 active:scale-95 transition-all"
                            >
                                {selectedOrderIds.size === orders.length ? 'Сбросить' : 'Выбрать все'}
                            </button>
                            <button onClick={onClose} className={clsx("p-2 rounded-full transition-colors", isDark ? "bg-[#2C2C2E] hover:bg-[#3A3A3C]" : "bg-gray-100 hover:bg-gray-200")}>
                                <XMarkIcon className={clsx("w-5 h-5", isDark ? "text-gray-300" : "text-gray-600")} />
                            </button>
                        </div>
                    </div>

                    {/* Search Bar */}
                    <div className="px-6 pb-4">
                        <div className={clsx(
                            "flex items-center gap-2 px-3 py-2.5 rounded-[1rem] transition-all",
                            isDark ? "bg-[#2C2C2E]" : "bg-gray-100/80"
                        )}>
                            <MagnifyingGlassIcon className="w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Поиск заказа..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className={clsx(
                                    "bg-transparent border-none outline-none text-[15px] w-full font-medium placeholder:text-gray-400",
                                    isDark ? "text-white" : "text-gray-900"
                                )}
                            />
                        </div>
                    </div>

                    {/* Scrollable Orders List */}
                    <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar relative">
                        {filteredOrders.length === 0 ? (
                            <div className="py-12 text-center text-gray-400 text-sm font-medium">Список пуст</div>
                        ) : (
                            <div className="flex flex-col gap-2.5">
                                {filteredOrders.map((order: any) => {
                                    const orderId = String(order.id || order.orderNumber);
                                    return (
                                        <OrderItem
                                            key={orderId}
                                            order={order}
                                            isSelected={selectedOrderIds.has(orderId)}
                                            isDark={!!isDark}
                                            isUntaken={untakenChanges.has(orderId)}
                                            amountValue={orderAmounts[orderId] || '0'}
                                            onToggleOrder={toggleOrder}
                                            onToggleUntakenChange={toggleUntakenChange}
                                            onAmountChange={handleOrderAmountChange}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT PANE: Summary & Payment */}
                <div className={clsx(
                    "flex-1 flex flex-col p-6 sm:p-8",
                    isDark ? "bg-[#141415]" : "bg-[#FBFBFB]"
                )}>
                    <div className="flex-1 flex flex-col justify-center space-y-8 max-w-[360px] mx-auto w-full relative">
                        
                        {/* Cash Input */}
                        <div className="flex flex-col items-center">
                            <div className="flex items-center justify-between w-full mb-3">
                                <span className={clsx("text-[14px] font-semibold", isDark ? "text-gray-400" : "text-gray-500")}>
                                    Сдал курьер
                                </span>
                                {isManualTotalOverride && (
                                    <button
                                        onClick={handleExactCash}
                                        className="text-[13px] font-semibold text-blue-500 hover:text-blue-600 transition-colors"
                                    >
                                        Авторасчет
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center justify-center gap-1 group w-full border-b-2 border-transparent focus-within:border-blue-500/30 transition-colors pb-2">
                                <input
                                    type="text"
                                    value={manualTotal}
                                    onChange={(e) => {
                                        setManualTotal(e.target.value);
                                        setIsManualTotalOverride(true);
                                    }}
                                    className={clsx(
                                        'w-full text-center text-[64px] leading-none font-semibold tracking-tighter bg-transparent outline-none transition-all',
                                        isDark ? 'text-white' : 'text-gray-900'
                                    )}
                                    style={{ fontFeatureSettings: '"tnum"' }}
                                />
                                <span className={clsx("text-4xl font-medium mt-2", isDark ? "text-gray-600" : "text-gray-300")}>₴</span>
                            </div>
                        </div>

                        {/* Status Card (Difference) */}
                        <div className={clsx(
                            "p-5 rounded-3xl flex items-center justify-between transition-all",
                            difference > 0 ? (isDark ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-50 border border-emerald-100 text-emerald-600") :
                            difference < 0 ? (isDark ? "bg-red-500/20 text-red-400" : "bg-red-50 border border-red-100 text-red-600") :
                            (isDark ? "bg-[#2C2C2E] text-gray-300" : "bg-white border border-gray-100 text-gray-600 shadow-[0_2px_8px_rgba(0,0,0,0.02)]")
                        )}>
                            <div className="flex flex-col">
                                <span className="text-[14px] font-medium opacity-80">
                                    {difference > 0 ? 'Переплата' : difference < 0 ? 'Долг' : 'Разница'}
                                </span>
                                <span className="text-[12px] font-medium opacity-60 mt-0.5">
                                    {isManualTotalOverride ? 'Ручной ввод' : 'По чекам'}
                                </span>
                            </div>
                            <div className="text-2xl font-semibold tracking-tight" style={{ fontFeatureSettings: '"tnum"' }}>
                                {difference > 0 ? '+' : ''}{formatCurrency(difference)}
                            </div>
                        </div>

                        {/* Info Rows */}
                        <div className={clsx(
                            "p-5 rounded-3xl space-y-4 transition-all",
                            isDark ? "bg-[#2C2C2E]" : "bg-white border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)]"
                        )}>
                            <div className="flex justify-between items-center">
                                <span className={clsx("text-[14px] font-medium", isDark ? "text-gray-400" : "text-gray-500")}>
                                    Ожидается к сдаче
                                </span>
                                <span className={clsx("text-[15px] font-semibold", isDark ? "text-white" : "text-gray-900")}>
                                    {formatCurrency(currentExpectedSum)}
                                </span>
                            </div>
                            <div className="h-px w-full bg-gray-200 dark:bg-white/5" />
                            <div className="flex justify-between items-center">
                                <span className={clsx("text-[14px] font-medium", isDark ? "text-gray-400" : "text-gray-500")}>
                                    Выбрано заказов
                                </span>
                                <span className={clsx("text-[15px] font-semibold", isDark ? "text-white" : "text-gray-900")}>
                                    {selectedOrderIds.size}
                                </span>
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="flex flex-col gap-2">
                            <span className={clsx("text-[13px] font-medium ml-1", isDark ? "text-gray-500" : "text-gray-400")}>Примечание</span>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={2}
                                className={clsx(
                                    'w-full bg-transparent border p-4 rounded-3xl text-[15px] font-medium outline-none transition-all resize-none',
                                    isDark ? 'border-white/10 focus:border-blue-500/50 bg-[#2C2C2E] placeholder:text-gray-600' : 'border-gray-200 focus:border-blue-300 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)] placeholder:text-gray-300'
                                )}
                                placeholder="Оставьте комментарий..."
                            />
                        </div>

                    </div>

                    {/* Error Msg */}
                    {error && (
                        <div className="mt-4 p-3 rounded-2xl bg-red-500/10 text-red-500 text-[14px] font-medium text-center max-w-[360px] mx-auto w-full">
                            {error}
                        </div>
                    )}

                    {/* Bottom Actions */}
                    <div className="mt-8 grid grid-cols-2 gap-3 max-w-[360px] mx-auto w-full shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className={clsx(
                                'h-14 rounded-2xl text-[15px] font-semibold transition-all',
                                isDark ? 'bg-[#2C2C2E] text-white hover:bg-[#3A3A3C]' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                            )}
                        >
                            Отмена
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={loading || selectedOrderIds.size === 0}
                            className="h-14 rounded-2xl font-semibold text-white text-[15px] transition-all bg-blue-600 hover:bg-blue-500 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none shadow-[0_4px_14px_rgba(37,99,235,0.3)]"
                        >
                            {loading ? 'Секунду...' : 'Подтвердить'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
