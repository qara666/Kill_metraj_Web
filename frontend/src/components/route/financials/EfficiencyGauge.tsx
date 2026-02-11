import { clsx } from 'clsx';
import { BoltIcon } from '@heroicons/react/24/outline';

interface EfficiencyGaugeProps {
    completed: number;
    total: number;
    isDark?: boolean;
}

export function EfficiencyGauge({ completed, total, isDark }: EfficiencyGaugeProps) {
    const percentage = total > 0 ? Math.min(100, Math.max(0, Math.round((completed / total) * 100))) : 0;

    // Calculate stroke dasharray for the gauge (semi-circle)
    // Radius = 40, Circumference = 2 * PI * 40 ≈ 251.2
    // Semi-circle = 125.6
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const halfCircumference = circumference / 2;
    const strokeDashoffset = halfCircumference - (percentage / 100) * halfCircumference;

    // Determine color based on percentage
    const getColor = (p: number) => {
        if (p >= 90) return '#10b981'; // emerald-500
        if (p >= 70) return '#3b82f6'; // blue-500
        if (p >= 50) return '#f59e0b'; // amber-500
        return '#ef4444'; // red-500
    };

    const color = getColor(percentage);

    return (
        <div className={clsx(
            'relative overflow-hidden rounded-3xl border p-5 transition-all duration-300 group',
            isDark ? 'bg-gray-800/40 border-gray-700' : 'bg-white border-gray-100 shadow-sm hover:shadow-md'
        )}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4 relative z-10">
                <h4 className={clsx(
                    'text-xs font-black uppercase tracking-widest opacity-60',
                    isDark ? 'text-gray-400' : 'text-gray-500'
                )}>
                    Эффективность
                </h4>
                <div className={clsx(
                    'p-2 rounded-xl transition-colors',
                    isDark ? 'bg-purple-500/10 text-purple-400' : 'bg-purple-50 text-purple-600'
                )}>
                    <BoltIcon className="w-4 h-4" />
                </div>
            </div>

            {/* Gauge Graphic */}
            <div className="relative flex flex-col items-center justify-center py-2 z-10">
                <div className="relative w-48 h-24 overflow-hidden">
                    <svg className="w-full h-full transform translate-y-1" viewBox="0 0 100 50">
                        {/* Background Arc */}
                        <path
                            d="M 10 50 A 40 40 0 0 1 90 50"
                            fill="none"
                            stroke={isDark ? '#374151' : '#e5e7eb'}
                            strokeWidth="8"
                            strokeLinecap="round"
                        />
                        {/* Progress Arc */}
                        <path
                            d="M 10 50 A 40 40 0 0 1 90 50"
                            fill="none"
                            stroke={color}
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray={halfCircumference}
                            strokeDashoffset={strokeDashoffset}
                            className="transition-all duration-1000 ease-out"
                        />
                    </svg>

                    {/* Center Value */}
                    <div className="absolute inset-x-0 bottom-0 text-center flex flex-col items-center justify-end h-full pb-2">
                        <span className={clsx(
                            'text-3xl font-black tracking-tighter leading-none',
                            isDark ? 'text-white' : 'text-gray-900'
                        )}>
                            {percentage}%
                        </span>
                        <span className={clsx(
                            'text-[10px] font-bold uppercase tracking-wide opacity-50 mt-1',
                            isDark ? 'text-gray-400' : 'text-gray-500'
                        )}>
                            {completed} из {total}
                        </span>
                    </div>
                </div>
            </div>

            {/* Footer Message */}
            <div className="mt-2 text-center relative z-10">
                <p className={clsx(
                    'text-xs font-bold',
                    isDark ? 'text-gray-400' : 'text-gray-600'
                )}>
                    {percentage === 100 ? 'Идеальная работа! 🔥' :
                        percentage >= 80 ? 'Отличный темп 🚀' :
                            percentage >= 50 ? 'Нормальный полет ✈️' : 'Нужно ускориться 🐢'}
                </p>
            </div>

            {/* Background Gradient Effect */}
            <div className={clsx(
                'absolute -bottom-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none',
                percentage >= 90 ? 'bg-emerald-500' :
                    percentage >= 70 ? 'bg-blue-500' :
                        percentage >= 50 ? 'bg-amber-500' : 'bg-red-500'
            )} />
        </div>
    );
}
