import React, { memo, useMemo } from 'react';
import { clsx } from 'clsx';
import { FixedSizeList as List } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import {
    TruckIcon,
    InboxIcon,
    CheckCircleIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    ClockIcon,
    MapPinIcon
} from '@heroicons/react/24/outline';
import { 
    CheckBadgeIcon as CheckBadgeIconSolid, 
    HomeIcon as HomeIconSolid, 
    MapIcon as MapIconSolid, 
    ExclamationCircleIcon as ExclamationCircleIconSolid
} from '@heroicons/react/24/solid';
import { getStatusBadgeProps } from '../../utils/data/statusBadgeHelper';

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
    lat?: number;
    lng?: number;
    kmlZone?: string;
    kmlHub?: string;
    locationType?: 'ROOFTOP' | 'RANGE_INTERPOLATED' | 'GEOMETRIC_CENTER' | 'APPROXIMATE';
    streetNumberMatched?: boolean;
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
    style
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
}) => {
    const rowRef = React.useRef<HTMLDivElement>(null);

    const raw = (order as any).raw || {};
    const coords = (order as any).coords || {};
    const meta = (order as any).locationMeta || {};

    const locType = order.locationType || coords.locationType || raw.locationType;
    const isRooftop = locType === 'ROOFTOP';
    const isInterpolated = locType === 'RANGE_INTERPOLATED';
    const streetMatched = order.streetNumberMatched ?? raw.streetNumberMatched ?? coords.streetNumberMatched;

    return (
        <div style={style} className="pr-1">
            <div
                ref={rowRef}
                onClick={() => onSelect(order.id)}
                draggable
                onDragStart={(e) => {
                    e.dataTransfer.setData('orderId', order.id);
                    e.dataTransfer.setData('text/plain', order.id);
                    e.dataTransfer.effectAllowed = 'move';
                }}
                className={clsx(
                    'p-3 rounded-xl border-2 transition-colors duration-200 relative overflow-hidden mb-2',
                    'hover:shadow-lg active:scale-[0.98] transform',
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
                    {(isSelected || isInRoute || order.status) && (() => {
                        const statusProps = getStatusBadgeProps(order.status || '', isDark);
                        return (
                            <div className={clsx(
                                'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-black transition-colors',
                                isSelected
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                    : `${statusProps.bgColorClass} ${statusProps.textColorClass}`
                            )}>
                                {isSelected ? selectionOrder : (
                                    statusProps.text === 'ИСПОЛНЕН' ? <CheckCircleIcon className="w-5 h-5" /> :
                                        statusProps.text === 'ДОСТАВЛЯЕТСЯ' ? <TruckIcon className="w-5 h-5" /> :
                                            statusProps.text === 'СОБРАН' ? <InboxIcon className="w-5 h-5" /> :
                                                <CheckCircleIcon className="w-5 h-5" />
                                )}
                            </div>
                        );
                    })()}

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2">
                                <span className={clsx(
                                    'font-extrabold text-base tracking-tight',
                                    isDark ? 'text-white' : 'text-gray-900'
                                )}>
                                    #{order.orderNumber}
                                </span>
                                {order.lat && order.lng && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const coords = `${order.lat},${order.lng}`;
                                            navigator.clipboard.writeText(coords);
                                            import('react-hot-toast').then(({ toast }) => {
                                                toast.success('Координаты скопированы', { id: 'copy-coords', icon: '📍', duration: 1500 });
                                            });
                                        }}
                                        className={clsx(
                                            "p-1 rounded-md transition-all active:scale-90",
                                            isDark ? "hover:bg-white/5 text-gray-400" : "hover:bg-gray-100 text-gray-400"
                                        )}
                                        title={`${order.lat}, ${order.lng}`}
                                    >
                                        <MapPinIcon className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
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

                        <div className="flex flex-wrap items-center gap-1.5 text-xs mb-2">
                            {/* Verified Status v42.1 */}
                            {isRooftop && (
                                <div className={clsx(
                                    "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                                    isDark ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-700"
                                )}>
                                    <CheckBadgeIconSolid className="w-3.5 h-3.5" />
                                    ТОЧНИЙ АДРЕС
                                </div>
                            )}

                            {/* Locked Status v42.1 */}
                            {(order as any).isLocked && (
                                <div className={clsx(
                                    "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                                    isDark ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-green-50 border-green-200 text-green-700"
                                )}>
                                    <CheckBadgeIconSolid className="w-3.5 h-3.5" />
                                    ПЕРЕВІРЕНО
                                </div>
                            )}

                            {/* Sector / KML v42.3 */}
                            {(() => {
                                const opZone = (order as any).deliveryZone || raw.deliveryZone;
                                const kmlZone = order.kmlZone || meta.kmlZone || coords.kmlZone;
                                const hub = order.kmlHub || meta.hubName || coords.kmlHub;
                                
                                const kmlFull = kmlZone ? `${hub ? hub + ' - ' : ''}${kmlZone}` : null;
                                const same = opZone && kmlFull && opZone.trim().toLowerCase() === kmlFull.trim().toLowerCase();

                                return (
                                    <div className={clsx(
                                        "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                                        ((String(opZone || '').includes('ID:0') || String(kmlZone || '').includes('ID:0')) && !same)
                                            ? (isDark ? "bg-red-500/20 border-red-500/40 text-red-400 animate-pulse" : "bg-red-50 border-red-200 text-red-600 shadow-red-500/10")
                                            : (isDark ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300" : "bg-indigo-50 border-indigo-100 text-indigo-700")
                                    )}>
                                        <MapIconSolid className="w-3.5 h-3.5 opacity-70" />
                                        <span className="opacity-60 mr-0.5">СЕКТОР:</span>
                                        {(() => {
                                            if (same) return `FO/KML:${opZone.trim()}`.toUpperCase();
                                            const zones = [
                                                opZone ? `FO:${opZone}` : null,
                                                kmlFull ? `KML:${kmlFull}` : null
                                            ].filter(Boolean).join(' | ').toUpperCase();
                                            return zones || '—';
                                        })()}
                                    </div>
                                );
                            })()}

                            {/* Street Match v42.1 */}
                            <div className={clsx(
                                "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                                locType && !isInterpolated && locType !== 'APPROXIMATE'
                                    ? (isDark ? "bg-teal-500/10 border-teal-500/30 text-teal-400" : "bg-teal-50 border-teal-100 text-teal-700")
                                    : (isDark ? "bg-rose-500/10 border-rose-500/30 text-rose-400" : "bg-rose-50 border-rose-200 text-rose-700")
                            )}>
                                <MapIconSolid className="w-3.5 h-3.5 opacity-70" />
                                <span className="opacity-60 mr-0.5">ВУЛИЦЯ:</span>
                                {locType && !isInterpolated && locType !== 'APPROXIMATE' ? 'ТАК' : 'НІ'}
                            </div>

                            {/* House Match v42.1 */}
                            {(() => {
                                const houseMatched = streetMatched || isInterpolated || isRooftop;
                                return (
                                    <div className={clsx(
                                        "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                                        houseMatched
                                            ? (isDark ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400" : "bg-cyan-50 border-cyan-100 text-cyan-700")
                                            : (isDark ? "bg-orange-500/10 border-orange-500/30 text-orange-400" : "bg-orange-50 border-orange-200 text-orange-700")
                                    )}>
                                        <HomeIconSolid className="w-3.5 h-3.5 opacity-70" />
                                        <span className="opacity-60 mr-0.5">БУДИНОК:</span>
                                        {houseMatched ? 'ТАК' : 'НІ'}
                                    </div>
                                );
                            })()}

                            {/* Unverified Warning */}
                            {(!(order.lat || (order as any).coords?.lat) || !(order.lng || (order as any).coords?.lng)) && (
                                <div className={clsx(
                                    "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 animate-pulse shadow-sm",
                                    isDark ? "bg-amber-500/10 border-amber-500/30 text-amber-500" : "bg-amber-50 border-amber-200 text-amber-700 shadow-amber-500/10"
                                )}>
                                    <ExclamationCircleIconSolid className="w-3.5 h-3.5" />
                                    УТОЧНИТИ АДРЕСУ
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-3 text-xs">
                            {order.plannedTime && order.plannedTime !== '00:00' && order.plannedTime !== '00:00:00' && order.plannedTime !== 'Без времени' && (
                                <div className={clsx(
                                    'font-bold px-2 py-0.5 rounded flex items-center gap-1.5 shadow-sm border',
                                    isDark ? 'bg-gray-700 text-gray-300 border-gray-600' : 'bg-gray-50 text-gray-600 border-gray-100'
                                )}>
                                    <ClockIcon className="w-3.5 h-3.5 opacity-70" />
                                    {order.plannedTime}
                                </div>
                            )}
                            {locType && (
                                <span className={clsx(
                                    "px-2 py-0.5 rounded font-black text-[9px] tracking-wider border shadow-sm",
                                    locType === 'ROOFTOP' ? (isDark ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-green-50 text-green-700 border-green-200") :
                                    locType === 'RANGE_INTERPOLATED' ? (isDark ? "bg-blue-500/20 text-blue-400 border-blue-500/30" : "bg-blue-50 text-blue-700 border-blue-200") :
                                    (isDark ? "bg-yellow-500/20 text-yellow-500 border-yellow-500/30" : "bg-yellow-50 text-yellow-700 border-yellow-200")
                                )}>
                                    {locType === 'ROOFTOP' ? 'ТОЧНО' : 
                                     locType === 'RANGE_INTERPOLATED' ? 'ДОМ' : 'ПРИМЕРНО'}
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
        prev.order.status === next.order.status &&
        prev.order.orderNumber === next.order.orderNumber &&
        prev.order.lat === next.order.lat &&
        prev.order.lng === next.order.lng
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
    isInRoute = false
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

    const AutoSizerAny = AutoSizer as any;

    return (
        <div style={{ width: '100%', height: '100%' }}>
            {AutoSizerAny && (
                <AutoSizerAny>
                    {({ width, height }: { width: number; height: number }) => (
                        <List
                            height={height}
                            itemCount={orders.length}
                            itemSize={110}
                            width={width}
                            className="custom-scrollbar"
                        >
                            {({ index, style }: { index: number; style: React.CSSProperties }) => {
                                const order = orders[index];
                                const isSelected = selectedOrders.has(order.id);
                                const selectionIndex = isSelected ? (selectionOrderMap.get(order.id) || 0) : 0;

                                return (
                                    <OrderItem
                                        key={order.id}
                                        order={order}
                                        isDark={isDark}
                                        isSelected={isSelected}
                                        selectionOrder={selectionIndex}
                                        onSelect={(id: string) => onSelectOrder(id, false)}
                                        onMoveUp={onMoveUp}
                                        onMoveDown={onMoveDown}
                                        isInRoute={isInRoute || false}
                                        style={style}
                                    />
                                );
                            }}
                        </List>
                    )}
                </AutoSizerAny>
            )}
        </div>
    );
});
