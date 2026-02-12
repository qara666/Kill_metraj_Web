import { clsx } from 'clsx';

interface RevenueProgressBarProps {
    cashAmount: number;
    onlineAmount: number;
    totalAmount: number;
    isDark?: boolean;
}

export function RevenueProgressBar({ cashAmount, onlineAmount, totalAmount, isDark }: RevenueProgressBarProps) {
    const cashPercent = totalAmount > 0 ? (cashAmount / totalAmount) * 100 : 0;
    const onlinePercent = totalAmount > 0 ? (onlineAmount / totalAmount) * 100 : 0;

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('uk-UA', {
            style: 'currency',
            currency: 'UAH',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value).replace('UAH', '₴');
    };

    return (
        <div className="w-full">
            <div className="flex justify-between items-baseline mb-3">
                <h4 className={clsx(
                    "text-[10px] font-black uppercase tracking-widest",
                    isDark ? "text-gray-400" : "text-gray-500"
                )}>
                    Всего выручка
                </h4>
                <span className={clsx(
                    "text-xs font-black",
                    isDark ? "text-white" : "text-gray-900"
                )}>
                    {formatCurrency(totalAmount)}
                </span>
            </div>

            {/* Progress Bar Group */}
            <div className={clsx(
                "h-2 w-full rounded-full overflow-hidden flex",
                isDark ? "bg-gray-800" : "bg-gray-100"
            )}>
                <div
                    className="h-full bg-[#10b981] transition-all duration-1000 ease-out"
                    style={{ width: `${cashPercent}%` }}
                />
                <div
                    className="h-full bg-[#8b5cf6] transition-all duration-1000 ease-out"
                    style={{ width: `${onlinePercent}%` }}
                />
            </div>

            {/* Legend */}
            <div className="flex justify-between mt-3 text-[10px] font-bold">
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-[#10b981]" />
                    <span className={isDark ? "text-gray-400" : "text-gray-500"}>Наличные</span>
                </div>
                <div className="flex items-center gap-1.5 text-right">
                    <span className={isDark ? "text-gray-400" : "text-gray-500"}>Онлайн</span>
                    <div className="w-2 h-2 rounded-full bg-[#8b5cf6]" />
                </div>
            </div>
        </div>
    );
}
