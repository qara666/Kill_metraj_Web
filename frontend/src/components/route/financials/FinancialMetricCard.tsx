import React from 'react';
import { clsx } from 'clsx';

interface FinancialMetricCardProps {
    title: string;
    value: string | number;
    subValue?: string;
    icon?: React.ComponentType<{ className?: string }>;
    trend?: number;
    trendLabel?: string;
    color?: 'blue' | 'green' | 'purple' | 'red' | 'amber' | 'gray';
    onClick?: () => void;
    className?: string;
    isDark?: boolean;
}

export function FinancialMetricCard({
    title,
    value,
    subValue,
    icon: Icon,
    trend,
    trendLabel,
    color = 'blue',
    onClick,
    className,
    isDark
}: FinancialMetricCardProps) {
    const colorStyles = {
        blue: {
            bg: isDark ? 'bg-blue-500/10' : 'bg-blue-50',
            text: isDark ? 'text-blue-400' : 'text-blue-600',
            border: isDark ? 'border-blue-500/20' : 'border-blue-100',
            iconBg: isDark ? 'bg-blue-500/20' : 'bg-white text-blue-600 shadow-sm'
        },
        green: {
            bg: isDark ? 'bg-green-500/10' : 'bg-green-50',
            text: isDark ? 'text-green-400' : 'text-green-600',
            border: isDark ? 'border-green-500/20' : 'border-green-100',
            iconBg: isDark ? 'bg-green-500/20' : 'bg-white text-green-600 shadow-sm'
        },
        purple: {
            bg: isDark ? 'bg-purple-500/10' : 'bg-purple-50',
            text: isDark ? 'text-purple-400' : 'text-purple-600',
            border: isDark ? 'border-purple-500/20' : 'border-purple-100',
            iconBg: isDark ? 'bg-purple-500/20' : 'bg-white text-purple-600 shadow-sm'
        },
        red: {
            bg: isDark ? 'bg-red-500/10' : 'bg-red-50',
            text: isDark ? 'text-red-400' : 'text-red-600',
            border: isDark ? 'border-red-500/20' : 'border-red-100',
            iconBg: isDark ? 'bg-red-500/20' : 'bg-white text-red-600 shadow-sm'
        },
        amber: {
            bg: isDark ? 'bg-amber-500/10' : 'bg-amber-50',
            text: isDark ? 'text-amber-400' : 'text-amber-600',
            border: isDark ? 'border-amber-500/20' : 'border-amber-100',
            iconBg: isDark ? 'bg-amber-500/20' : 'bg-white text-amber-600 shadow-sm'
        },
        gray: {
            bg: isDark ? 'bg-gray-800/50' : 'bg-gray-50',
            text: isDark ? 'text-gray-400' : 'text-gray-600',
            border: isDark ? 'border-gray-700' : 'border-gray-200',
            iconBg: isDark ? 'bg-gray-700' : 'bg-white text-gray-500 shadow-sm'
        }
    };

    const styles = colorStyles[color];

    return (
        <div
            onClick={onClick}
            className={clsx(
                'p-5 rounded-2xl border transition-all duration-300 relative group overflow-hidden',
                styles.bg,
                styles.border,
                onClick && 'cursor-pointer hover:shadow-lg hover:scale-[1.02]',
                className
            )}
        >
            {/* Background Glow */}
            <div className={clsx(
                'absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-20 transition-opacity pointer-events-none',
                styles.text.replace('text-', 'bg-')
            )} />

            <div className="flex justify-between items-start mb-4 relative z-10">
                <div>
                    <h4 className={clsx('text-xs font-black uppercase tracking-widest opacity-60 mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                        {title}
                    </h4>
                    <div className={clsx('text-2xl font-black tracking-tight', isDark ? 'text-white' : 'text-gray-900')}>
                        {value}
                    </div>
                </div>
                {Icon && (
                    <div className={clsx('p-2.5 rounded-xl transition-transform group-hover:rotate-12', styles.iconBg)}>
                        <Icon className="w-5 h-5" />
                    </div>
                )}
            </div>

            {(subValue || trend !== undefined) && (
                <div className="flex items-center justify-between text-xs font-bold relative z-10">
                    {subValue && (
                        <span className={clsx('opacity-80', isDark ? 'text-gray-400' : 'text-gray-600')}>
                            {subValue}
                        </span>
                    )}
                    {trend !== undefined && (
                        <div className={clsx(
                            'flex items-center gap-1 px-2 py-0.5 rounded-full',
                            trend > 0
                                ? (isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700')
                                : trend < 0
                                    ? (isDark ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700')
                                    : (isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-600')
                        )}>
                            <span>{trend > 0 ? '↑' : trend < 0 ? '↓' : '•'} {Math.abs(trend)}%</span>
                            {trendLabel && <span className="opacity-60 hidden sm:inline ml-1 lowercase">{trendLabel}</span>}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
