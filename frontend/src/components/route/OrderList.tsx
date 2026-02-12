import React, { memo, useMemo } from 'react';
import { clsx } from 'clsx';
import {
    TruckIcon,
    InboxIcon,
    CheckCircleIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    ClockIcon
} from '@heroicons/react/24/outline';

// Types
interface Order {
    id: string;
    orderNumber: string;
    address: string;
    courier: string;
    amount: number;
    phone: string;
    customerName: string;
    isSelected?: boolean;
    routeOrder?: number;
    plannedTime?: string;
    paymentMethod?: string;
    manualGroupId?: string;
    status?: string;
    statusTimings?: {
        assembledAt?: number;
        deliveringAt?: number;
        completedAt?: number;
    };
    raw?: any;
}

interface OrderListProps {
    orders: Order[];
    isDark: boolean;
    selectedOrders: Set<string>;
    selectedOrdersOrder?: string[];
    onSelectOrder: (id: string, multi: boolean) => void;
    onMoveUp?: (id: string) => void;
    onMoveDown?: (id: string) => void;
    isInRoute?: boolean;
    listHeight?: number;
    listRef?: any;
    setSize?: (id: string, index: number, size: number) => void;
}

// OrderItem Component
const OrderItem = memo(({
    order,
    isSelected,
    selectionOrder,
    onSelect,
    onMoveUp,
    onMoveDown,
    isInRoute,
    isDark,
    style,
    setSize,
    index
}: {
    order: Order
    isSelected: boolean
    selectionOrder: number
    onSelect: (id: string) => void
    onMoveUp?: (id: string) => void;
    onMoveDown?: (id: string) => void;
    isInRoute: boolean
    isDark: boolean
    style?: React.CSSProperties
    setSize?: (id: string, index: number, size: number) => void;
    index?: number
}) => {
    const rowRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (setSize && index !== undefined && rowRef.current) {
            setSize(order.id, index, rowRef.current.getBoundingClientRect().height + 8); // +8 for margin/padding
        }
    }, [setSize, index, order.address, order.id]);

    return (
        <div style={style} className="pr-1">
            <div
                ref={rowRef}
                onClick={() => onSelect(order.id)}
                draggable
                onDragStart={(e) => {
                    e.dataTransfer.setData('orderId', order.id);
                    e.dataTransfer.effectAllowed = 'move';
                }}
                className={clsx(
                    'p-3 rounded-xl border-2 transition-all duration-300 ease-in-out transform relative overflow-hidden mb-2',
                    'hover:shadow-lg active:scale-[0.98]',
                    isSelected
                        ? isDark
                            ? 'bg-blue-500/10 border-blue-500 shadow-blue-500/20 cursor-pointer'
                            : 'bg-blue-50 border-blue-500 shadow-blue-500/10 cursor-pointer'
                        : isInRoute
                            ? isDark
                                ? 'bg-gray-800/40 border-gray-700/50 cursor-not-allowed grayscale opacity-60'
                                : 'bg-gray-50 border-gray-100 cursor-not-allowed grayscale opacity-60'
                            : isDark
                                ? 'bg-gray-800/60 border-gray-700 hover:bg-gray-700/80 hover:border-gray-500 cursor-pointer'
                                : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-blue-200 cursor-pointer shadow-sm hover:shadow-md'
                )}
            >
                {/* Aging Background */}
                {order.status === 'Собран' && !isInRoute && !isSelected && (() => {
                    const assembledAt = order.raw?.statusTimings?.assembledAt;
                    if (!assembledAt) return null;
                    const waitMs = Date.now() - new Date(assembledAt).getTime();
                    const waitMin = waitMs / 60000;

                    if (waitMin >= 30) return <div className="absolute inset-0 bg-red-500/5 animate-pulse-slow pointer-events-none" />;
                    if (waitMin >= 15) return <div className="absolute inset-0 bg-yellow-500/5 pointer-events-none" />;
                    return null;
                })()}

                <div className="flex items-start gap-4">
                    {/* Selection Index / Status Icon */}
                    {(isSelected || isInRoute || order.status === 'Собран' || order.status === 'Доставляется' || order.status === 'Исполнен') && (
                        <div className={clsx(
                            'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-black transition-all',
                            isSelected
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                : order.status === 'Исполнен'
                                    ? 'bg-green-500 text-white'
                                    : order.status === 'Доставляется'
                                        ? 'bg-orange-500 text-white'
                                        : order.status === 'Собран'
                                            ? 'bg-blue-500 text-white animate-bounce-slow'
                                            : 'bg-gray-500/20 text-gray-500'
                        )}>
                            {isSelected ? selectionOrder : (
                                order.status === 'Исполнен' ? <CheckCircleIcon className="w-5 h-5" /> :
                                    order.status === 'Доставляется' ? <TruckIcon className="w-5 h-5" /> :
                                        order.status === 'Собран' ? <InboxIcon className="w-5 h-5" /> :
                                            <CheckCircleIcon className="w-5 h-5" />
                            )}
                        </div>
                    )}

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <span className={clsx(
                                'font-extrabold text-base tracking-tight',
                                isDark ? 'text-white' : 'text-gray-900'
                            )}>
                                #{order.orderNumber}
                            </span>
                            <div className="flex items-center gap-1">
                                {isSelected && onMoveUp && onMoveDown && (
                                    <div className="flex items-center bg-blue-100 dark:bg-blue-900/40 rounded-lg p-0.5">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onMoveUp(order.id); }}
                                            disabled={selectionOrder === 1}
                                            className="p-1 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-md transition-colors disabled:opacity-30"
                                        >
                                            <ChevronUpIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onMoveDown(order.id); }}
                                            disabled={selectionOrder === 0}
                                            className="p-1 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-md transition-colors disabled:opacity-30"
                                        >
                                            <ChevronDownIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <p className={clsx('text-sm leading-snug mb-2 font-medium', isDark ? 'text-gray-300' : 'text-gray-600')}>
                            {order.address}
                        </p>

                        <div className="flex items-center gap-3 text-xs">
                            <div className={clsx(
                                'font-bold px-2 py-0.5 rounded flex items-center gap-1.5',
                                isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                            )}>
                                <ClockIcon className="w-3.5 h-3.5" />
                                {order.plannedTime || '—'}
                            </div>
                            {order.paymentMethod && (
                                <span className={clsx(
                                    "px-2 py-0.5 rounded font-bold uppercase text-[10px] tracking-wider",
                                    order.paymentMethod.toLowerCase().includes('налич') || order.paymentMethod.toLowerCase().includes('cash')
                                        ? (isDark ? "bg-green-900/30 text-green-400" : "bg-green-100 text-green-700")
                                        : (isDark ? "bg-purple-900/30 text-purple-400" : "bg-purple-100 text-purple-700")
                                )}>
                                    {order.paymentMethod}
                                </span>
                            )}
                            <span className={clsx('font-black ml-auto', isDark ? 'text-white' : 'text-gray-900')}>
                                {order.amount} ₴
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}, (prev, next) => {
    return (
        prev.order.id === next.order.id &&
        prev.isSelected === next.isSelected &&
        prev.selectionOrder === next.selectionOrder &&
        prev.isInRoute === next.isInRoute &&
        prev.isDark === next.isDark &&
        prev.style === next.style &&
        prev.index === next.index &&
        prev.order.status === next.order.status &&
        prev.order.orderNumber === next.order.orderNumber
    );
});

export const OrderList = memo(({
    orders,
    isDark,
    selectedOrders,
    selectedOrdersOrder,
    onSelectOrder,
    onMoveUp,
    onMoveDown,
    isInRoute = false,
    setSize
}: OrderListProps) => {

    const selectionOrderMap = useMemo(() => {
        if (!selectedOrdersOrder) return new Map<string, number>();
        const map = new Map<string, number>();
        selectedOrdersOrder.forEach((id, index) => {
            map.set(id, index + 1);
        });
        return map;
    }, [selectedOrdersOrder]);
    if (orders.length === 0) {
        return (
            <div className={clsx("text-center py-8", isDark ? "text-gray-500" : "text-gray-400")}>
                Нет заказов для отображения
            </div>
        );
    }

    return (
        <div className="space-y-3 p-1">
            {orders.map((order, index) => {
                const isSelected = selectedOrders.has(order.id);
                const selectionIndex = isSelected ? (selectionOrderMap.get(order.id) || 0) : 0;

                return (
                    <OrderItem
                        key={order.id}
                        index={index}
                        order={order}
                        isDark={isDark}
                        isSelected={isSelected}
                        selectionOrder={selectionIndex}
                        onSelect={(id) => onSelectOrder(id, false)}
                        onMoveUp={onMoveUp}
                        onMoveDown={onMoveDown}
                        isInRoute={isInRoute}
                        setSize={setSize}
                    />
                );
            })}
        </div>
    );
});
