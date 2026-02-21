import { memo } from 'react';
import clsx from 'clsx';
import { CheckBadgeIcon, ClockIcon } from '@heroicons/react/24/outline';
import type { Order } from '../../types';
import { getPlannedTime } from '../../utils/data/timeUtils';
import { formatTimeLabel } from '../../utils/route/routeCalculationHelpers';
import { getStatusBadgeProps } from '../../utils/data/statusBadgeHelper';
import { getPaymentMethodBadgeProps } from '../../utils/data/paymentMethodHelper';

export const GridOrderCard = memo(({ order, isDark, isSelected, onSelect }: { order: Order, isDark: boolean, isSelected: boolean, onSelect: (id: string) => void }) => {
    const timeLabel = formatTimeLabel(getPlannedTime(order) || 0);

    return (
        <div
            onClick={() => onSelect(order.id)}
            className={clsx(
                "p-5 rounded-2xl border-2 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 relative overflow-hidden flex flex-col h-full",
                isSelected
                    ? (isDark ? "bg-blue-500/10 border-blue-500 shadow-blue-500/20" : "bg-blue-50 border-blue-500 shadow-blue-500/10")
                    : (isDark ? "bg-gray-800/60 border-gray-700/50 hover:bg-gray-800" : "bg-white border-gray-100 hover:border-blue-100")
            )}
        >
            {isSelected && (
                <div className="absolute top-0 right-0 p-3 pt-4 pr-4">
                    <CheckBadgeIcon className="w-6 h-6 text-blue-500" />
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2 mb-3 pr-6">
                <span className={clsx("font-black text-sm", isDark ? "text-gray-300" : "text-gray-700")}>#{order.orderNumber}</span>

                {timeLabel !== '00:00 - 00:00' && (
                    <span className={clsx(
                        "flex items-center gap-1 text-[9px] font-black tracking-widest px-2 py-0.5 rounded-lg",
                        isDark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"
                    )}>
                        <ClockIcon className="w-3 h-3" />
                        {timeLabel}
                    </span>
                )}

                {order.status && (() => {
                    const statusProps = getStatusBadgeProps(order.status, isDark);
                    return (
                        <span className={clsx(
                            "text-[9px] font-black uppercase px-2 py-0.5 rounded-lg tracking-widest",
                            statusProps.bgColorClass,
                            statusProps.textColorClass
                        )}>
                            {statusProps.text}
                        </span>
                    );
                })()}

                {order.paymentMethod && (() => {
                    const badgeProps = getPaymentMethodBadgeProps(order.paymentMethod, isDark);
                    return (
                        <span className={clsx(
                            "px-2 py-0.5 rounded-lg font-black uppercase text-[9px] tracking-widest",
                            badgeProps.bgColorClass,
                            badgeProps.textColorClass
                        )}>
                            {badgeProps.text}
                        </span>
                    );
                })()}
            </div>

            <p className={clsx("text-sm font-bold mb-4 line-clamp-2 leading-tight flex-1", isDark ? "text-gray-100" : "text-gray-900")} title={order.address}>
                {order.address}
            </p>

            <div className="flex items-end justify-between mt-auto">
                <p className={clsx("text-lg font-black tracking-tight", isDark ? "text-white" : "text-gray-900")}>
                    {order.amount} ₴
                </p>
            </div>
        </div>
    )
})
