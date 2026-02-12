import { clsx } from 'clsx';
import React from 'react';

interface PaymentMethodCardProps {
    label: string;
    amount: number;
    orderCount: number;
    percentage: number;
    color: 'green' | 'purple';
    icon: React.ComponentType<{ className?: string }>;
    isDark?: boolean;
}

export function PaymentMethodCard({
    label,
    amount,
    orderCount,
    percentage,
    color,
    icon: Icon,
    isDark
}: PaymentMethodCardProps) {
    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('uk-UA', {
            style: 'currency',
            currency: 'UAH',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value).replace('UAH', '₴');
    };

    const variantStyles = {
        green: {
            bg: isDark ? 'bg-[#10b981]/10' : 'bg-[#f0fdf4]',
            text: 'text-[#10b981]',
            bar: 'bg-[#10b981]',
            iconBg: isDark ? 'bg-[#10b981]/20' : 'bg-white'
        },
        purple: {
            bg: isDark ? 'bg-[#8b5cf6]/10' : 'bg-[#f5f3ff]',
            text: 'text-[#8b5cf6]',
            bar: 'bg-[#8b5cf6]',
            iconBg: isDark ? 'bg-[#8b5cf6]/20' : 'bg-white'
        }
    };

    const styles = variantStyles[color];

    return (
        <div className={clsx(
            "p-5 rounded-2xl flex-1 transition-all duration-300",
            styles.bg
        )}>
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                    <div className={clsx(
                        "p-1.5 rounded-lg shadow-sm flex items-center justify-center",
                        styles.iconBg,
                        styles.text
                    )}>
                        <Icon className="w-4 h-4" />
                    </div>
                    <span className={clsx(
                        "text-[10px] font-black uppercase tracking-widest opacity-60",
                        isDark ? "text-gray-400" : "text-gray-500"
                    )}>
                        {label}
                    </span>
                </div>
                <span className={clsx("text-[10px] font-black opacity-40", isDark ? "text-gray-400" : "text-gray-500")}>
                    {percentage}%
                </span>
            </div>

            <div className="mb-4">
                <div className={clsx("text-2xl font-black tracking-tight mb-0.5", isDark ? "text-white" : "text-gray-900")}>
                    {formatCurrency(amount)}
                </div>
                <div className={clsx("text-[10px] font-bold uppercase tracking-widest opacity-40", isDark ? "text-gray-400" : "text-gray-500")}>
                    {orderCount} ЗАКАЗА
                </div>
            </div>

            {/* Small Progress Bar */}
            <div className={clsx(
                "h-1 w-full rounded-full overflow-hidden",
                isDark ? "bg-gray-800" : "bg-white"
            )}>
                <div
                    className={clsx("h-full transition-all duration-1000", styles.bar)}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}
