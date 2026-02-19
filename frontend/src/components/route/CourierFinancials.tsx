import { useState, useEffect, useMemo, useCallback } from 'react';
import { clsx } from 'clsx';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { toast } from 'react-hot-toast';
import {
    BanknotesIcon,
    GlobeAltIcon,
    ClockIcon,
    ArrowsRightLeftIcon,
    CheckBadgeIcon,
    ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import type { Order } from '../../types';
import { SettlementModal } from './modals/SettlementModal';
import { RevenueProgressBar } from './financials/RevenueProgressBar';
import { PaymentMethodCard } from './financials/PaymentMethodCard';

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

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('uk-UA', {
        style: 'currency',
        currency: 'UAH',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value).replace('UAH', '₴');
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
    const [notes, setNotes] = useState('');
    const [historySearchTerm, setHistorySearchTerm] = useState('');

    const { excelData, updateOrderPaymentMethod, updateExcelData } = useExcelData();

    useEffect(() => {
        const storageKey = `shift_notes_${courierId}_${targetDate || new Date().toISOString().split('T')[0]}`;
        const saved = localStorage.getItem(storageKey);
        if (saved) setNotes(saved);
    }, [courierId, targetDate]);

    const handleNotesChange = (val: string) => {
        setNotes(val);
        const storageKey = `shift_notes_${courierId}_${targetDate || new Date().toISOString().split('T')[0]}`;
        localStorage.setItem(storageKey, val);
    };

    // Helper to calculate financials locally from Excel data
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
            const isValidForFinancials = order.status !== 'Отменен' && order.status !== 'Возврат';

            if (order.settledDate) {
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

            const effectiveAmount = isCash ? (amount + changeAmount) : amount;

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

        if (excelData && excelData.orders.length > 0) {
            if (localSummary) {
                setSummary(localSummary);
                setLoading(false);
                return;
            }
        }

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
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, [courierId, divisionId, targetDate, excelData, localSummary]);

    useEffect(() => {
        fetchFinancialSummary();
    }, [fetchFinancialSummary]);

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

    const groupedHistory = useMemo(() => {
        if (!summary?.historyOrders) return [];

        const filtered = summary.historyOrders.filter(o =>
            !historySearchTerm ||
            String(o.orderNumber || '').toLowerCase().includes(historySearchTerm.toLowerCase()) ||
            String(o.address || '').toLowerCase().includes(historySearchTerm.toLowerCase())
        );

        // Group by settlementSessionId (primary) or settledDate (fallback)
        const groups: Record<string, { orders: Order[], stats?: any }> = {};
        filtered.forEach(order => {
            const sessionId = (order as any).settlementSessionId || order.settledDate || 'Unknown';
            if (!groups[sessionId]) {
                groups[sessionId] = {
                    orders: [],
                    stats: {
                        received: (order as any).sessionTotalReceived,
                        expected: (order as any).sessionTotalExpected,
                        difference: (order as any).sessionTotalDifference,
                        date: order.settledDate
                    }
                };
            }
            groups[sessionId].orders.push(order);
        });

        return Object.entries(groups).sort((a, b) => {
            const dateA = new Date(a[1].stats?.date || a[0]).getTime();
            const dateB = new Date(b[1].stats?.date || b[0]).getTime();
            return dateB - dateA;
        });
    }, [summary, historySearchTerm]);


    const handleCopyReport = () => {
        if (!summary) return;
        const { currentShift } = summary;
        const report = `📊 Отчет по курьеру: ${courierName}\n` +
            `📅 Дата: ${new Date().toLocaleDateString('ru-RU')}\n` +
            `✅ Выполнено: ${currentShift.completedOrders}/${currentShift.totalOrders}\n` +
            `-------------------\n` +
            `💵 Наличные: ${formatCurrency(currentShift.cashOrders.totalAmount)}\n` +
            `💳 Онлайн: ${formatCurrency(currentShift.onlineOrders.totalAmount)}\n` +
            `💰 Всего выручка: ${formatCurrency(currentShift.totalExpected)}\n` +
            (notes ? `📝 Заметка: ${notes}\n` : '') +
            `-------------------`;

        navigator.clipboard.writeText(report);
        toast.success('Отчет скопирован в буфер обмена');
    };

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
    const courierInitial = courierName.charAt(0).toUpperCase();


    return (
        <div className="space-y-6 animate-in fade-in duration-700 max-w-6xl mx-auto">
            {/* Courier Header Card */}
            <div className={clsx(
                'p-6 rounded-[32px] flex items-center justify-between',
                isDark ? 'bg-gray-900 shadow-black/20' : 'bg-white shadow-sm border border-gray-100'
            )}>
                <div className="flex items-center gap-5">
                    <div className="w-14 h-14 bg-[#5175f0] rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-[#5175f0]/20 transform transition-transform hover:rotate-6">
                        {courierInitial}
                    </div>
                    <div>
                        <h2 className={clsx('text-2xl font-black tracking-tight mb-1', isDark ? 'text-white' : 'text-gray-900')}>
                            {courierName}
                        </h2>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            <p className={clsx('text-[10px] font-bold uppercase tracking-widest opacity-40', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                Смена: {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <button
                        onClick={handleCopyReport}
                        className={clsx(
                            'px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 border no-print',
                            isDark ? 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white' : 'bg-[#f8faff] border-gray-100 text-gray-400 hover:text-blue-600'
                        )}
                    >
                        Копировать отчет
                    </button>
                    <div className="text-right">
                        <p className={clsx('text-[10px] font-black uppercase tracking-widest opacity-30 mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            Выполнено
                        </p>
                        <div className={clsx('text-3xl font-black tracking-tighter', isDark ? 'text-white' : 'text-gray-900')}>
                            {currentShift.completedOrders} <span className="opacity-15 inline-block scale-75 translate-y-[-2px]">/ {currentShift.totalOrders}</span>
                        </div>
                    </div>
                </div>
            </div>


            {/* Financial Overview Main Card */}
            <div className={clsx(
                'p-10 rounded-[48px] shadow-2xl relative overflow-hidden',
                isDark ? 'bg-gray-900 shadow-black/40' : 'bg-white shadow-blue-500/5'
            )}>
                {/* Background Decor */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 blur-[100px] pointer-events-none" />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 mb-12">
                    {/* Left: Cash to Collect */}
                    <div className="flex items-center gap-8">
                        <div className="w-24 h-24 bg-[#10b981] rounded-[32px] flex items-center justify-center text-white shadow-2xl shadow-[#10b981]/30 transform transition-transform hover:scale-110">
                            <BanknotesIcon className="w-12 h-12" />
                        </div>
                        <div>
                            <h4 className={clsx('text-[10px] font-black uppercase tracking-widest opacity-40 mb-3', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                К сдаче (Наличные)
                            </h4>
                            <div className={clsx('text-6xl font-black tracking-tighter leading-none flex items-baseline gap-2', isDark ? 'text-white' : 'text-gray-900')}>
                                {cashToCollect.toLocaleString('ru-RU')} <span className="text-4xl font-bold opacity-20 translate-y-[-4px]">₴</span>
                            </div>
                        </div>
                    </div>

                    {/* Right: Revenue Progress */}
                    <div className="flex items-center">
                        <RevenueProgressBar
                            cashAmount={currentShift.cashOrders.totalAmount}
                            onlineAmount={currentShift.onlineOrders.totalAmount}
                            totalAmount={currentShift.totalExpected}
                            isDark={isDark}
                        />
                    </div>
                </div>

                {/* Sub Cards: Detailed breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                    <PaymentMethodCard
                        label="Готівка"
                        amount={currentShift.cashOrders.totalAmount}
                        orderCount={currentShift.cashOrders.count}
                        percentage={currentShift.totalExpected > 0 ? Math.round((currentShift.cashOrders.totalAmount / currentShift.totalExpected) * 100) : 0}
                        color="green"
                        icon={BanknotesIcon}
                        isDark={isDark}
                    />
                    <PaymentMethodCard
                        label="Онлайн"
                        amount={currentShift.onlineOrders.totalAmount}
                        orderCount={currentShift.onlineOrders.count}
                        percentage={currentShift.totalExpected > 0 ? Math.round((currentShift.onlineOrders.totalAmount / currentShift.totalExpected) * 100) : 0}
                        color="purple"
                        icon={GlobeAltIcon}
                        isDark={isDark}
                    />
                </div>

                {/* Settlement Button */}
                <button
                    onClick={() => setShowSettlementModal(true)}
                    disabled={cashToCollect === 0}
                    className={clsx(
                        'w-full py-8 rounded-[40px] font-black text-sm uppercase tracking-[0.25em] shadow-2xl transition-all transform hover:-translate-y-1 active:scale-[0.99] border border-transparent no-print',
                        cashToCollect > 0
                            ? 'bg-[#10b981] text-white shadow-[#10b981]/40 hover:shadow-[#10b981]/60'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600 shadow-none'
                    )}
                >
                    {cashToCollect > 0 ? 'Расчет налички у курьера' : 'Нет средств для расчета'}
                </button>
            </div>

            {/* Shift Notes Section */}
            <div className={clsx(
                'p-8 rounded-[40px] border transition-all',
                isDark ? 'bg-gray-900/40 border-white/5' : 'bg-white shadow-blue-500/5 border-gray-100'
            )}>
                <h3 className={clsx('text-xs font-black uppercase tracking-widest opacity-40 mb-2', isDark ? 'text-gray-400' : 'text-gray-500')}>
                    Заметки по смене
                </h3>
                <textarea
                    value={notes}
                    onChange={(e) => handleNotesChange(e.target.value)}
                    rows={2}
                    className={clsx(
                        'w-full bg-transparent border-b-2 py-2 text-sm font-bold outline-none transition-all placeholder:opacity-20',
                        isDark ? 'border-white/5 focus:border-blue-500/50 text-white' : 'border-gray-50 focus:border-blue-100 text-gray-900'
                    )}
                    placeholder="Напишите что-то важное о сегодняшней смене..."
                />
            </div>

            {/* Order Details Grid */}
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-4">
                    <h3 className={clsx('text-2xl font-black tracking-tight', isDark ? 'text-white' : 'text-gray-900')}>
                        Детализация заказов
                    </h3>

                    {/* Minimalist Tabs */}
                    <div className={clsx(
                        "p-1.5 rounded-2xl flex gap-1",
                        isDark ? "bg-gray-900" : "bg-white shadow-sm border border-gray-100"
                    )}>
                        {(['cash', 'online', 'history'] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={clsx(
                                    'px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                                    activeTab === tab
                                        ? (isDark ? 'bg-gray-800 text-[#5175f0]' : 'bg-blue-50 text-[#5175f0]')
                                        : 'opacity-40 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'
                                )}
                            >
                                {tab === 'cash' ? `Наличные (${currentShift.cashOrders.count})` :
                                    tab === 'online' ? `Онлайн (${currentShift.onlineOrders.count})` :
                                        `История (${summary.historyOrders.length})`}
                            </button>
                        ))}
                    </div>
                </div>

                {activeTab === 'history' && (
                    <div className="px-4">
                        <div className={clsx(
                            "flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all mb-4",
                            isDark ? "bg-gray-900 border-white/5" : "bg-white border-gray-100 shadow-sm"
                        )}>
                            <svg className="w-4 h-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Поиск в истории (номер заказа, адрес)..."
                                value={historySearchTerm}
                                onChange={(e) => setHistorySearchTerm(e.target.value)}
                                className="bg-transparent border-none outline-none text-xs font-bold w-full placeholder:opacity-30"
                            />
                        </div>
                    </div>
                )}

                <div className={clsx(
                    'rounded-[56px] border overflow-hidden p-8 transition-all min-h-[400px]',
                    isDark ? 'bg-gray-900/60 border-white/5' : 'bg-white shadow-blue-500/5 border-gray-100'
                )}>
                    <div className="space-y-6">
                        {activeTab === 'history' ? (
                            groupedHistory.length === 0 ? (
                                <div className="py-32 flex flex-col items-center justify-center opacity-20">
                                    <ClockIcon className="w-16 h-16 mb-6" />
                                    <p className="text-xs font-black uppercase tracking-widest">История пуста</p>
                                </div>
                            ) : (
                                (groupedHistory as any[]).map(([sessionId, group]: [string, any]) => {
                                    const { orders, stats } = group;
                                    const hasStats = stats && stats.received !== undefined;

                                    return (
                                        <div key={sessionId} className="group/session animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both">
                                            {/* Session Header Stats - REDESIGNED PREMIUM POD */}
                                            <div className={clsx(
                                                "p-8 rounded-[40px] border relative overflow-hidden transition-all duration-200 hover:scale-[1.005] hover:shadow-lg",
                                                isDark ? "bg-white/[0.03] border-white/5 hover:bg-white/[0.05]" : "bg-white border-gray-100 hover:border-blue-100 shadow-sm"
                                            )}>
                                                {/* Discrepancy Indicator bar */}
                                                {hasStats && stats.difference !== 0 && (
                                                    <div className={clsx(
                                                        "absolute top-0 left-10 right-10 h-1 blur-sm rounded-b-full opacity-50",
                                                        stats.difference > 0 ? "bg-emerald-500" : "bg-red-500"
                                                    )} />
                                                )}

                                                <div className="flex flex-col lg:flex-row items-center justify-between gap-10">
                                                    <div className="flex items-center gap-6">
                                                        <div className={clsx(
                                                            "w-16 h-16 rounded-3xl flex items-center justify-center shadow-xl transition-transform group-hover/session:rotate-3",
                                                            isDark ? "bg-blue-600/20 text-blue-400" : "bg-blue-500 text-white shadow-blue-500/20"
                                                        )}>
                                                            <BanknotesIcon className="w-8 h-8" />
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Расчет смены</h4>
                                                                {hasStats && stats.difference === 0 && (
                                                                    <div className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-1">
                                                                        <CheckBadgeIcon className="w-3 h-3 text-emerald-500" />
                                                                        <span className="text-[8px] font-black text-emerald-500 uppercase">Идеально</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <p className="text-xl font-black tracking-tight tabular-nums">
                                                                {stats?.date ? new Date(stats.date).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Неизвестно'}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {hasStats && (
                                                        <div className="flex flex-wrap items-center justify-center lg:justify-end gap-12">
                                                            <div className="text-center lg:text-right">
                                                                <p className="text-[10px] font-black uppercase tracking-widest opacity-30 mb-2">Сдано</p>
                                                                <p className="text-3xl font-black tracking-tighter text-blue-500 tabular-nums">{formatCurrency(stats.received)}</p>
                                                            </div>
                                                            <div className="hidden sm:block w-[1px] h-10 bg-gray-500/10" />
                                                            <div className="text-center lg:text-right">
                                                                <p className="text-[10px] font-black uppercase tracking-widest opacity-30 mb-2">Ожидалось</p>
                                                                <p className="text-xl font-black tracking-tighter opacity-40 tabular-nums">{formatCurrency(stats.expected)}</p>
                                                            </div>
                                                            <div className="hidden sm:block w-[1px] h-10 bg-gray-500/10" />
                                                            <div className="text-center lg:text-right">
                                                                <p className="text-[10px] font-black uppercase tracking-widest opacity-30 mb-2">Расхождение</p>
                                                                <div className={clsx(
                                                                    "text-2xl font-black tracking-tighter flex items-center gap-2 justify-center lg:justify-end tabular-nums",
                                                                    stats.difference > 0 ? "text-emerald-500" : stats.difference < 0 ? "text-red-500" : "opacity-20"
                                                                )}>
                                                                    {stats.difference !== 0 && (
                                                                        stats.difference > 0
                                                                            ? <CheckBadgeIcon className="w-5 h-5" />
                                                                            : <ExclamationTriangleIcon className="w-5 h-5" />
                                                                    )}
                                                                    <span>{stats.difference > 0 ? '+' : ''}{formatCurrency(stats.difference)}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-3 pl-4">
                                                {orders.map((order: Order, idx: number) => (
                                                    <div
                                                        key={order.id || idx}
                                                        className={clsx(
                                                            'p-5 rounded-[28px] border flex items-center justify-between transition-all group',
                                                            isDark ? 'bg-black/20 border-white/5 hover:bg-black/40' : 'bg-[#f8faff] border-gray-100/50 hover:bg-white hover:shadow-xl hover:shadow-blue-500/5'
                                                        )}
                                                    >
                                                        <div className="flex-1 min-w-0 mr-8">
                                                            <div className="flex items-center gap-3 mb-2">
                                                                <span className={clsx(
                                                                    "text-[10px] font-black px-2.5 py-1 rounded-xl opacity-40",
                                                                    isDark ? "bg-gray-800" : "bg-gray-100"
                                                                )}>
                                                                    #{order.orderNumber}
                                                                </span>
                                                                <span className={clsx(
                                                                    "text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-500"
                                                                )}>
                                                                    Оплачено
                                                                </span>
                                                            </div>
                                                            <p className={clsx('text-xs font-bold leading-relaxed opacity-70 truncate', isDark ? 'text-gray-300' : 'text-gray-800')} title={order.address}>
                                                                {order.address}
                                                            </p>
                                                        </div>

                                                        <div className="text-right">
                                                            <p className={clsx('text-lg font-black tracking-tight', isDark ? 'text-white' : 'text-gray-900')}>
                                                                {formatCurrency((order as any).settledAmount || order.amount)}
                                                            </p>
                                                            {order.settlementNote && (
                                                                <p className="text-[9px] font-bold opacity-30 italic mt-0.5 max-w-[150px] truncate">
                                                                    {order.settlementNote}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })
                            )
                        ) : (
                            activeOrders.length === 0 ? (
                                <div className="py-32 flex flex-col items-center justify-center opacity-20">
                                    <ClockIcon className="w-16 h-16 mb-6" />
                                    <p className="text-xs font-black uppercase tracking-widest">Список пуст</p>
                                </div>
                            ) : (
                                activeOrders.map((order, idx) => (
                                    <div
                                        key={order.id || idx}
                                        style={{ animationDelay: `${idx * 50}ms` }}
                                        className={clsx(
                                            'p-6 rounded-[36px] border flex items-center justify-between transition-all group animate-in slide-in-from-bottom-2 duration-300 fill-mode-both',
                                            isDark ? 'bg-black/20 border-white/5 hover:bg-black/40' : 'bg-[#f8faff] border-gray-100/50 hover:bg-white hover:shadow-md hover:shadow-blue-500/5'
                                        )}
                                    >
                                        <div className="flex-1 min-w-0 mr-8">
                                            <div className="flex items-center gap-3 mb-3">
                                                <span className={clsx(
                                                    "text-[10px] font-black px-2.5 py-1 rounded-xl opacity-40",
                                                    isDark ? "bg-gray-800" : "bg-gray-100"
                                                )}>
                                                    #{order.orderNumber}
                                                </span>
                                                <span className={clsx(
                                                    "text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-xl shadow-sm",
                                                    order.status === 'Исполнен' ? 'bg-[#10b981]/10 text-[#10b981]' : 'bg-gray-500/10 text-gray-400'
                                                )}>
                                                    {order.status || 'ВЫПОЛНЯЕТСЯ'}
                                                </span>
                                            </div>
                                            <p className={clsx('text-sm font-bold leading-relaxed', isDark ? 'text-gray-300' : 'text-gray-800')} title={order.address}>
                                                {order.address}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-8">
                                            <div className="text-right">
                                                <p className={clsx('text-xl font-black tracking-tight',
                                                    activeTab === 'cash' ? 'text-[#10b981]' :
                                                        activeTab === 'online' ? 'text-[#8b5cf6]' :
                                                            (isDark ? 'text-white' : 'text-gray-900')
                                                )}>
                                                    {formatCurrency((order as any).settledAmount || (order as any).effectiveAmount || order.amount)}
                                                </p>
                                            </div>

                                            <button
                                                onClick={() => handleSwitchPaymentMethod(String(order.orderNumber), String((order as any).paymentMethod || ''))}
                                                disabled={switchingOrderId === String(order.id || order.orderNumber)}
                                                className={clsx(
                                                    'p-4 rounded-[20px] transition-all opacity-0 group-hover:opacity-100 border no-print relative overflow-hidden',
                                                    isDark ? 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white' : 'bg-white border-gray-100 text-gray-500 hover:text-blue-600 hover:shadow-xl hover:shadow-blue-500/10'
                                                )}
                                                title="Сменить способ оплаты"
                                            >
                                                {switchingOrderId === order.orderNumber ? (
                                                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                    <ArrowsRightLeftIcon className="w-5 h-5" />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )
                        )}
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
        </div>
    );
}
