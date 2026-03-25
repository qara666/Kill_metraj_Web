import React, { useState, useEffect, useMemo } from 'react';
import { clsx } from 'clsx';
import { CheckCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
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
            initial[id] = String(o.effectiveAmount ?? o.amount ?? 0);
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

                return sum + (isNaN(baseAmount) ? 0 : baseAmount) + (untakenChanges.has(id) ? 0 : 0);
                // Wait, orderAmounts[id] already includes changeAmount in initial state. 
                // Let's refine: orderAmounts should probably be just the BASE amount, 
                // but currently it's initialized with effectiveAmount.
            }, 0);
    }, [orders, selectedOrderIds, orderAmounts, untakenChanges]);

    // STRICT Extected sum calculation (Ignoring "Без сдачи" toggles for the expected total)
    const currentExpectedSum = useMemo(() => {
        let total = 0;
        orders.forEach((o: any) => {
            const id = String(o.id || o.orderNumber);
            if (!selectedOrderIds.has(id)) return;

            // Use the original effective amount or amount, ignoring manual subtractions so the "Expected" stays static
            const val = o.effectiveAmount ?? o.amount ?? 0;
            total += parseFloat(String(val)) || 0;
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

    const toggleUntakenChange = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const order = orders.find((o: any) => String(o.id || o.orderNumber) === id);
        if (!order) return;

        const billVal = parseFloat(order.changeAmount || 0);     // e.g. 700
        const orderVal = parseFloat(order.amount || order.totalAmount || 0); // e.g. 652
        
        const advance = billVal - orderVal; // e.g. 1000 - 751 = 249 UAH
        if (advance <= 0) return;

        const newSet = new Set(untakenChanges);
        const isNowUntaken = !newSet.has(id);

        if (isNowUntaken) {
            newSet.add(id);
            // v5.111: If customer didn't take change, courier has MORE money (bill size 1000 instead of price 751)
            setOrderAmounts(prev => ({
                ...prev,
                [id]: (parseFloat(prev[id] || '0') + advance).toString()
            }));
        } else {
            newSet.delete(id);
            // Revert advance addition
            setOrderAmounts(prev => ({
                ...prev,
                [id]: (parseFloat(prev[id] || '0') - advance).toString()
            }));
        }
        setUntakenChanges(newSet);
    };

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

    const handleExactCash = () => {
        setIsManualTotalOverride(false);
        setManualTotal(autoReceivedSum.toString());
    };

    const toggleOrder = (id: string) => {
        const newSet = new Set(selectedOrderIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedOrderIds(newSet);
    };

    const toggleAll = () => {
        if (selectedOrderIds.size === orders.length) {
            setSelectedOrderIds(new Set());
        } else {
            setSelectedOrderIds(new Set(orders.map(o => String(o.id || o.orderNumber))));
        }
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
                
                // v35.10: Use passed persistence function instead of window hack
                saveManualOverrides(next.orders);
                
                return next;
            });

            toast.success(`Расчет выполнен!`, { duration: 3000 });
            setShowSettlementModal(false);
            // v5.103: Deleted redundant fetchFinancialSummary() that uses stale context state.
            // parent will re-render naturally from updateExcelData context changes.
        } catch (err: any) {
            setError(err.message || 'Ошибка при расчете');
        } finally {
            setLoading(false);
        }
    };

    const difference = (parseFloat(manualTotal) || 0) - currentExpectedSum;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
            <div className={clsx(
                'rounded-[2.5rem] max-w-5xl w-full mx-auto shadow-[0_32px_128px_-16px_rgba(0,0,0,0.3)] transition-all flex flex-col max-h-[92vh] border overflow-hidden',
                isDark ? 'bg-[#1a1c1e] border-white/5 text-white' : 'bg-white border-gray-100 text-gray-900'
            )}>

                {/* Main Content Area: Split Pane */}
                <div className="flex flex-1 overflow-hidden">

                    {/* LEFT COLUMN: Orders List */}
                    <div className="flex-[1.4] flex flex-col border-r border-white/5 overflow-hidden">
                        {/* Compact Header */}
                        <div className="px-6 pt-6 pb-2 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-black tracking-tight">Расчет с курьером</h3>
                                <p className="text-[9px] font-bold opacity-30 uppercase tracking-[0.2em]">{courierName}</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={toggleAll}
                                    className="text-[9px] font-black uppercase tracking-widest text-blue-500 hover:scale-105 active:scale-95 transition-transform"
                                >
                                    {selectedOrderIds.size === orders.length ? 'Сбросить все' : 'Выбрать все'}
                                </button>
                                <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-white/5 opacity-40 hover:opacity-100 transition-all">
                                    <XMarkIcon className="w-5 h-5 " />
                                </button>
                            </div>
                        </div>

                        {/* Search Bar */}
                        <div className="px-6 py-4">
                            <div className={clsx(
                                "flex items-center gap-3 px-4 py-2 rounded-2xl border transition-all",
                                isDark ? "bg-black/20 border-white/5 focus-within:border-blue-500/30" : "bg-gray-50 border-gray-100 focus-within:border-blue-200"
                            )}>
                                <svg className="w-4 h-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Поиск заказа..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="bg-transparent border-none outline-none text-xs font-bold w-full placeholder:opacity-30"
                                />
                            </div>
                        </div>

                        {/* Scrollable Orders List */}
                        <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {filteredOrders.length === 0 ? (
                                    <div className="col-span-full py-20 text-center opacity-20">
                                        <p className="text-[10px] font-black uppercase tracking-widest">Список пуст</p>
                                    </div>
                                ) : filteredOrders.map((order: any, idx: number) => {
                                    const orderId = String(order.id || order.orderNumber);
                                    const isSelected = selectedOrderIds.has(orderId);

                                    return (
                                        <div
                                            key={idx}
                                            onClick={() => toggleOrder(orderId)}
                                            className={clsx(
                                                'flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 rounded-[1.25rem] border-2 transition-all cursor-pointer group gap-3',
                                                isSelected
                                                    ? (isDark ? 'bg-blue-500/10 border-blue-500/30' : 'bg-[#f0f7ff] border-blue-100')
                                                    : (isDark ? 'bg-black/10 border-white/5 opacity-40 hover:opacity-100' : 'bg-[#fcfdff] border-gray-50 opacity-40 hover:opacity-100')
                                            )}
                                        >
                                            <div className="flex items-center gap-3 min-w-0 flex-1 w-full sm:w-auto">
                                                <div className={clsx(
                                                    'w-7 h-7 shrink-0 rounded-lg border-2 flex items-center justify-center transition-all',
                                                    isSelected ? 'bg-blue-500 border-blue-500 text-white' : (isDark ? 'border-gray-700' : 'border-gray-200')
                                                )}>
                                                    <CheckCircleIcon className={clsx("w-4 h-4 transition-transform", isSelected ? "scale-100" : "scale-0")} />
                                                </div>
                                                <div className="min-w-0 flex-1 flex flex-col justify-center">
                                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                                        <p className="text-xs font-black tracking-tight break-words">
                                                            #{order.orderNumber}
                                                        </p>
                                                        {parseFloat(order.changeAmount || 0) > 0 && (
                                                            <button
                                                                onClick={(e) => toggleUntakenChange(orderId, e)}
                                                                title={untakenChanges.has(orderId) ? "Сдача возвращена в расчет" : "Сдачу не брал (вычесть из суммы)"}
                                                                className={clsx(
                                                                    "px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all whitespace-normal break-words text-left leading-tight",
                                                                    untakenChanges.has(orderId)
                                                                        ? "bg-red-500 text-white border-red-500"
                                                                        : "bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20"
                                                                )}
                                                            >
                                                                {untakenChanges.has(orderId) 
                                                                    ? "БЕЗ СДАЧИ" 
                                                                    : `Сдача: ${Math.round((parseFloat(order.changeAmount || 0) - parseFloat(order.amount || 0)) * 100) / 100}₴`}
                                                            </button>
                                                        )}
                                                        {order.paymentMethod && (() => {
                                                            const badgeProps = getPaymentMethodBadgeProps(order.paymentMethod, !!isDark);
                                                            // Only show if it's a refusal for this modal's context, or show all if needed
                                                            // Keep original logic: show only if it contains 'отказ'
                                                            if (!order.paymentMethod.toLowerCase().includes('отказ')) return null;
                                                            return (
                                                                <span className={clsx(
                                                                    "px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all",
                                                                    badgeProps.bgColorClass,
                                                                    badgeProps.textColorClass,
                                                                    "border-transparent"
                                                                )}>
                                                                    {badgeProps.text}
                                                                </span>
                                                            );
                                                        })()}
                                                    </div>
                                                    <p className="text-[9px] font-bold opacity-60 uppercase tracking-widest leading-relaxed whitespace-normal break-words">
                                                        {order.address}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="shrink-0 w-full sm:w-auto sm:ml-3 flex justify-end" onClick={e => e.stopPropagation()}>
                                                <div className={clsx(
                                                    "flex items-center rounded-lg px-2 py-1 border transition-all",
                                                    isSelected
                                                        ? (isDark ? 'bg-gray-950 border-white/5' : 'bg-white border-blue-50')
                                                        : 'border-transparent'
                                                )}>
                                                    <input
                                                        type="text"
                                                        disabled={!isSelected}
                                                        value={orderAmounts[orderId]}
                                                        onChange={(e) => handleOrderAmountChange(orderId, e.target.value)}
                                                        className={clsx(
                                                            'w-14 text-right text-[11px] font-black bg-transparent outline-none',
                                                            isSelected ? 'text-blue-500' : 'text-gray-400'
                                                        )}
                                                    />
                                                    <span className="ml-[2px] text-[8px] font-black opacity-20">₴</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Summary & Payment */}
                    <div className={clsx(
                        "flex-1 p-8 flex flex-col",
                        isDark ? "bg-[#141618]/50" : "bg-gray-50/50"
                    )}>
                        <div className="flex-1 space-y-6">
                            {/* Manual Input Area */}
                            <div className={clsx(
                                "p-6 rounded-3xl border shadow-xl relative overflow-hidden",
                                isDark ? "bg-[#1a1c1e] border-white/5" : "bg-white border-gray-100"
                            )}>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40">
                                        СДАЛ КУРЬЕР
                                    </span>
                                    {isManualTotalOverride && (
                                        <button
                                            onClick={handleExactCash}
                                            className="text-[8px] font-black uppercase tracking-widest text-blue-500 hover:scale-105 transition-transform"
                                        >
                                            Сброс авто
                                        </button>
                                    )}
                                </div>
                                <div className="flex items-center justify-end gap-2 group/input mb-4">
                                    <input
                                        type="text"
                                        value={manualTotal}
                                        onChange={(e) => {
                                            setManualTotal(e.target.value);
                                            setIsManualTotalOverride(true);
                                        }}
                                        className={clsx(
                                            'w-full text-right text-5xl font-black bg-transparent outline-none transition-all',
                                            isDark ? 'text-white' : 'text-gray-900'
                                        )}
                                    />
                                    <span className="text-3xl font-black opacity-10">₴</span>
                                </div>

                                {/* Status Card */}
                                <div className={clsx(
                                    "p-4 rounded-2xl flex items-center justify-between",
                                    difference > 0 ? (isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600") :
                                        difference < 0 ? (isDark ? "bg-red-500/10 text-red-500" : "bg-red-50 text-red-600") :
                                            (isDark ? "bg-white/5 text-gray-500" : "bg-gray-100 text-gray-400")
                                )}>
                                    <div className="flex flex-col">
                                        <span className="text-[8px] font-black uppercase tracking-widest opacity-60">
                                            {difference > 0 ? 'Переплата' : difference < 0 ? 'Долг' : 'Итог'}
                                        </span>
                                        <span className="text-[7px] font-bold opacity-40 uppercase tracking-widest">
                                            {isManualTotalOverride ? 'Ручной ввод' : 'Авторасчет'}
                                        </span>
                                    </div>
                                    <div className="text-xl font-black tracking-tight italic">
                                        {difference > 0 ? '+' : ''}{formatCurrency(difference)}
                                    </div>
                                </div>
                            </div>

                            {/* Info Rows */}
                            <div className="px-2 space-y-3">
                                <div className="flex justify-between items-center opacity-40">
                                    <span className="text-[9px] font-bold uppercase tracking-widest">Всего выбрано</span>
                                    <span className="text-xs font-black">{formatCurrency(expectedSumBySelection)}</span>
                                </div>
                                <div className="flex justify-between items-center opacity-40">
                                    <span className="text-[9px] font-bold uppercase tracking-widest">Заказов</span>
                                    <span className="text-xs font-black">{selectedOrderIds.size}</span>
                                </div>
                            </div>

                            {/* Notes */}
                            <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-widest opacity-30 ml-2">Примечание</label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    rows={3}
                                    className={clsx(
                                        'w-full bg-transparent border-2 p-4 rounded-2xl text-xs font-bold outline-none transition-all placeholder:opacity-20',
                                        isDark ? 'border-white/5 focus:border-blue-500/20' : 'border-gray-100 focus:border-blue-100'
                                    )}
                                    placeholder="Важный комментарий к расчету..."
                                />
                            </div>
                        </div>

                        {/* Error Msg */}
                        {error && (
                            <div className="mb-4 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-[9px] font-black uppercase tracking-widest text-center">
                                {error}
                            </div>
                        )}

                        {/* Bottom Actions */}
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                type="button"
                                onClick={onClose}
                                className={clsx(
                                    'py-4 rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] transition-all border border-transparent',
                                    isDark ? 'text-gray-500 hover:bg-white/5' : 'text-gray-400 hover:bg-gray-100'
                                )}
                            >
                                ОТМЕНА
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={loading || selectedOrderIds.size === 0}
                                className={clsx(
                                    'py-4 rounded-2xl font-black text-white text-[10px] uppercase tracking-[0.2em] shadow-xl transition-all transform hover:-translate-y-1 active:scale-95 disabled:opacity-20 disabled:grayscale disabled:pointer-events-none bg-[#5175f0] shadow-blue-500/30'
                                )}
                            >
                                {loading ? '...' : 'ОПЛАТИЛ'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div >
    );
}
