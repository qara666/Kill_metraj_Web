import React, { useMemo } from 'react';
import { clsx } from 'clsx';

interface ChartData {
    label: string;
    value: number;
    color: string;
    icon: React.ComponentType<{ className?: string }>;
}

interface PaymentDistributionChartProps {
    data: ChartData[];
    total: number;
    isDark?: boolean;
}

export function PaymentDistributionChart({ data, total, isDark }: PaymentDistributionChartProps) {
    const { segments, legendData } = useMemo(() => {
        let cumulativePercent = 0;

        const segments = data.map((item) => {
            const percent = total > 0 ? item.value / total : 0;
            const startAngle = cumulativePercent * 360;
            const endAngle = (cumulativePercent + percent) * 360;

            // Calculate large arc flag
            const largeArcFlag = percent > 0.5 ? 1 : 0;

            // Calculate coordinates
            const startX = 50 + 40 * Math.cos((startAngle - 90) * (Math.PI / 180));
            const startY = 50 + 40 * Math.sin((startAngle - 90) * (Math.PI / 180));
            const endX = 50 + 40 * Math.cos((endAngle - 90) * (Math.PI / 180));
            const endY = 50 + 40 * Math.sin((endAngle - 90) * (Math.PI / 180));

            cumulativePercent += percent;

            return {
                d: percent === 1
                    ? "M 50 10 a 40 40 0 1 0 0.0001 0" // Full circle
                    : `M 50 50 L ${startX} ${startY} A 40 40 0 ${largeArcFlag} 1 ${endX} ${endY} Z`,
                color: item.color,
                percent: Math.round(percent * 100),
                label: item.label,
                value: item.value
            };
        });

        // Filter out zero segments for legend but keep color mapping consistent
        const legendData = data.filter(d => d.value > 0);

        return { segments, legendData };
    }, [data, total]);

    if (total === 0) {
        return (
            <div className={clsx(
                'flex flex-col items-center justify-center py-12 px-4 rounded-3xl border opacity-50',
                isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'
            )}>
                <div className="w-24 h-24 rounded-full border-4 border-dashed border-gray-300 dark:border-gray-600 mb-4 animate-pulse"></div>
                <p className="text-sm font-bold uppercase tracking-widest text-center">Нет данных для графика</p>
            </div>
        );
    }

    return (
        <div className={clsx(
            'p-6 rounded-3xl border shadow-lg glass-panel relative overflow-hidden transition-all duration-300 hover:shadow-xl',
            isDark ? 'shadow-black/20 border-white/5 bg-gray-900/40' : 'shadow-blue-500/5 border-white/60 bg-white/60'
        )}>
            <div className="flex flex-col md:flex-row items-center gap-8 justify-around">
                {/* Donut Chart SVG */}
                <div className="relative w-48 h-48 md:w-56 md:h-56 flex-shrink-0">
                    <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                        {segments.map((segment, index) => (
                            <path
                                key={index}
                                d={segment.d}
                                fill={segment.color}
                                stroke={isDark ? '#1f2937' : '#ffffff'}
                                strokeWidth="2"
                                className="transition-all duration-500 hover:opacity-80 cursor-pointer"
                            />
                        ))}
                    </svg>
                    {/* Inner Circle for Donut Effect */}
                    <div className={clsx(
                        'absolute inset-0 m-auto w-[60%] h-[60%] rounded-full flex flex-col items-center justify-center shadow-inner pointer-events-none',
                        isDark ? 'bg-gray-900' : 'bg-white'
                    )}>
                        <p className={clsx('text-[10px] font-bold uppercase tracking-widest opacity-50 mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>Всего</p>
                        <p className={clsx('text-lg font-black', isDark ? 'text-white' : 'text-gray-900')}>
                            {new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH', minimumFractionDigits: 0 }).format(total)}
                        </p>
                    </div>
                </div>

                {/* Legend */}
                <div className="flex flex-col gap-4 w-full max-w-xs">
                    <h3 className={clsx('text-xs font-black uppercase tracking-widest mb-2 opacity-50', isDark ? 'text-gray-400' : 'text-gray-500')}>
                        Распределение оплат
                    </h3>
                    {legendData.map((item, index) => (
                        <div key={index} className="flex items-center justify-between group">
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-3 h-3 rounded-full shadow-sm ring-2 ring-opacity-50 ring-offset-2 ring-offset-transparent transition-all group-hover:scale-125"
                                    style={{ backgroundColor: item.color, '--tw-ring-color': item.color } as React.CSSProperties}
                                />
                                <span className={clsx('text-sm font-bold', isDark ? 'text-gray-200' : 'text-gray-700')}>
                                    {item.label}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className={clsx('text-xs font-black opacity-40', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                    {Math.round((item.value / total) * 100)}%
                                </span>
                                <span className={clsx('text-sm font-black tabular-nums', isDark ? 'text-white' : 'text-gray-900')}>
                                    {new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH', minimumFractionDigits: 0 }).format(item.value)}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
