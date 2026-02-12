import { clsx } from 'clsx';
import { BoltIcon } from '@heroicons/react/24/outline';

interface EfficiencyGaugeProps {
    completed: number;
    total: number;
    isDark?: boolean;
}

export function EfficiencyGauge({ completed, total, isDark }: EfficiencyGaugeProps) {
    const percentage = total > 0 ? Math.min(100, Math.max(0, Math.round((completed / total) * 100))) : 0;

    // SVG Config
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const halfCircumference = circumference / 2;
    const strokeDashoffset = halfCircumference - (percentage / 100) * halfCircumference;

    // Needle Rotation: Map 0-100% to -90deg to +90deg
    const needleRotation = -90 + (percentage / 100) * 180;

    return (
        <div className={clsx(
            'relative overflow-hidden rounded-3xl border p-6 transition-all duration-500 group',
            isDark ? 'bg-gray-900 border-gray-800 shadow-[0_0_40px_-10px_rgba(16,185,129,0.1)]' : 'bg-white border-gray-100 shadow-xl shadow-blue-500/5'
        )}>
            {/* Header with Neon Glow */}
            <div className="flex items-center justify-between mb-6 relative z-10">
                <h4 className={clsx(
                    'text-[10px] font-black uppercase tracking-widest opacity-60',
                    isDark ? 'text-gray-400' : 'text-gray-500'
                )}>
                    Эффективность
                </h4>
                <div className={clsx(
                    'p-2 rounded-xl transition-all duration-500 shadow-lg',
                    isDark ? 'bg-gray-800 text-cyan-400 shadow-cyan-500/20' : 'bg-white text-blue-600 shadow-blue-500/10'
                )}>
                    <BoltIcon className="w-4 h-4" />
                </div>
            </div>

            {/* Gauge Graphic */}
            <div className="relative flex flex-col items-center justify-center py-4 z-10">
                <div className="relative w-56 h-28 overflow-hidden">
                    <svg className="w-full h-full transform translate-y-2" viewBox="0 0 100 50">
                        <defs>
                            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#8b5cf6" /> {/* Purple */}
                                <stop offset="50%" stopColor="#3b82f6" /> {/* Blue */}
                                <stop offset="100%" stopColor="#10b981" /> {/* Emerald */}
                            </linearGradient>
                            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                                <feMerge>
                                    <feMergeNode in="coloredBlur" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                        </defs>

                        {/* Background Track */}
                        <path
                            d="M 10 50 A 40 40 0 0 1 90 50"
                            fill="none"
                            stroke={isDark ? '#1f2937' : '#f3f4f6'}
                            strokeWidth="6"
                            strokeLinecap="round"
                        />

                        {/* Progress Arc with Gradient & Glow */}
                        <path
                            d="M 10 50 A 40 40 0 0 1 90 50"
                            fill="none"
                            stroke="url(#gaugeGradient)"
                            strokeWidth="6"
                            strokeLinecap="round"
                            strokeDasharray={halfCircumference}
                            strokeDashoffset={strokeDashoffset}
                            className="transition-all duration-1000 ease-out"
                            filter="url(#glow)"
                        />

                        {/* Needle */}
                        <g className="transition-transform duration-1000 ease-out origin-bottom" style={{ transformOrigin: '50px 50px', transform: `rotate(${needleRotation}deg)` }}>
                            <path d="M 48 50 L 50 15 L 52 50 Z" fill={isDark ? '#fff' : '#111'} />
                            <circle cx="50" cy="50" r="3" fill={isDark ? '#fff' : '#111'} />
                        </g>
                    </svg>

                    {/* Value Display */}
                    <div className="absolute inset-x-0 bottom-0 text-center flex flex-col items-center justify-end h-full pb-2 pointer-events-none">
                        <div className={clsx(
                            'text-4xl font-black tracking-tighter leading-none mb-1 transition-all duration-300 transform group-hover:scale-110',
                            isDark ? 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500' : 'text-gray-900'
                        )}>
                            {percentage}%
                        </div>
                        <span className={clsx(
                            'text-[10px] font-bold uppercase tracking-widest opacity-40',
                            isDark ? 'text-gray-400' : 'text-gray-500'
                        )}>
                            {completed}/{total} Выполнено
                        </span>
                    </div>
                </div>
            </div>

            {/* Ambient Animated Glow */}
            <div className={clsx(
                'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full blur-[60px] opacity-20 transition-all duration-1000 animate-pulse pointer-events-none',
                percentage >= 80 ? 'bg-emerald-500' :
                    percentage >= 50 ? 'bg-blue-500' : 'bg-purple-500'
            )} />
        </div>
    );
}
