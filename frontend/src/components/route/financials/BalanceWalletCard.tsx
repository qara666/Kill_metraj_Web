import { clsx } from 'clsx';
import { ExclamationCircleIcon, CheckCircleIcon, SparklesIcon } from '@heroicons/react/24/outline';

interface BalanceWalletCardProps {
    expected: number;
    received: number;
    difference: number;
    isDark?: boolean;
    onClick?: () => void;
}

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('uk-UA', {
        style: 'currency',
        currency: 'UAH',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
};

export function BalanceWalletCard({ expected, received, difference, isDark, onClick }: BalanceWalletCardProps) {
    const isDebt = difference < 0;
    const isBonus = difference > 0;
    const isClean = difference === 0;

    const absDiff = Math.abs(difference);
    const maxValue = Math.max(expected, received) || 1;
    const expectedPercent = (expected / maxValue) * 100;
    const receivedPercent = (received / maxValue) * 100;

    return (
        <div
            onClick={onClick}
            className={clsx(
                'relative overflow-hidden rounded-3xl border p-6 transition-all duration-500 group cursor-pointer',
                isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100 shadow-xl shadow-blue-500/5',
                'hover:shadow-2xl hover:-translate-y-1'
            )}
        >
            {/* Glassmorphic Background Layer */}
            <div className={clsx(
                'absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none',
                isDark ? 'bg-gradient-to-br from-white/5 to-transparent' : 'bg-gradient-to-br from-blue-500/5 to-transparent'
            )} />

            {/* Header */}
            <div className="flex items-center justify-between mb-8 relative z-10">
                <div className="flex items-center gap-4">
                    <div className={clsx(
                        'p-3 rounded-2xl transition-all duration-300 shadow-lg',
                        isDebt ? (isDark ? 'bg-red-500/20 text-red-500 shadow-red-500/20' : 'bg-red-50 text-red-600 shadow-red-500/10') :
                            isBonus ? (isDark ? 'bg-emerald-500/20 text-emerald-500 shadow-emerald-500/20' : 'bg-emerald-50 text-emerald-600 shadow-emerald-500/10') :
                                (isDark ? 'bg-blue-500/20 text-blue-500 shadow-blue-500/20' : 'bg-blue-50 text-blue-600 shadow-blue-500/10')
                    )}>
                        {isDebt ? <ExclamationCircleIcon className="w-6 h-6 animate-pulse" /> :
                            isBonus ? <SparklesIcon className="w-6 h-6 animate-bounce-slow" /> :
                                <CheckCircleIcon className="w-6 h-6" />}
                    </div>
                    <div>
                        <h4 className={clsx(
                            'text-[10px] font-black uppercase tracking-widest opacity-60 mb-1',
                            isDark ? 'text-gray-400' : 'text-gray-500'
                        )}>
                            Финансовый баланс
                        </h4>
                        <div className={clsx(
                            'text-2xl font-black tracking-tighter flex items-center gap-2',
                            isDark ? 'text-white' : 'text-gray-900'
                        )}>
                            {isClean ? 'Баланс чист' :
                                isDebt ? 'Долг курьера' : 'Переплата'}
                        </div>
                    </div>
                </div>

                {!isClean && (
                    <div className={clsx(
                        'px-4 py-2 rounded-xl text-lg font-black tracking-tight border shadow-inner',
                        isDebt ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    )}>
                        {formatCurrency(absDiff)}
                    </div>
                )}
            </div>

            {/* Liquid Progress Bars */}
            <div className="space-y-6 relative z-10">
                {/* Expected Bar */}
                <div className="group/bar">
                    <div className="flex justify-between text-[11px] font-bold uppercase tracking-wide opacity-60 mb-2">
                        <span>Ожидается</span>
                        <span className="group-hover/bar:text-blue-500 transition-colors">{formatCurrency(expected)}</span>
                    </div>
                    <div className={clsx("h-3 w-full rounded-full overflow-hidden shadow-inner", isDark ? 'bg-gray-800' : 'bg-gray-100')}>
                        <div
                            className="h-full bg-blue-500 rounded-full relative overflow-hidden transition-all duration-1000 ease-out"
                            style={{ width: `${Math.max(5, expectedPercent)}%` }}
                        >
                            {/* Shimmer Effect */}
                            <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite] skew-x-12" />
                        </div>
                    </div>
                </div>

                {/* Received Bar */}
                <div className="group/bar">
                    <div className="flex justify-between text-[11px] font-bold uppercase tracking-wide opacity-60 mb-2">
                        <span>Собрано (Факт)</span>
                        <span className={clsx(
                            "transition-colors",
                            isDebt ? 'group-hover/bar:text-red-500' : 'group-hover/bar:text-emerald-500'
                        )}>
                            {formatCurrency(received)}
                        </span>
                    </div>
                    <div className={clsx("h-3 w-full rounded-full overflow-hidden shadow-inner", isDark ? 'bg-gray-800' : 'bg-gray-100')}>
                        <div
                            className={clsx(
                                "h-full rounded-full relative overflow-hidden transition-all duration-1000 ease-out",
                                isDebt ? 'bg-red-500' : 'bg-emerald-500'
                            )}
                            style={{ width: `${Math.max(5, receivedPercent)}%` }}
                        >
                            {/* Liquid/Striped Animation */}
                            <div className="absolute inset-0 w-full h-full"
                                style={{
                                    backgroundImage: 'linear-gradient(45deg,rgba(255,255,255,.15) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.15) 50%,rgba(255,255,255,.15) 75%,transparent 75%,transparent)',
                                    backgroundSize: '1rem 1rem',
                                    animation: 'progress-stripes 1s linear infinite'
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Hint */}
            <div className={clsx(
                'mt-6 text-[10px] font-bold uppercase tracking-widest text-center transition-opacity duration-300',
                isDark ? 'text-gray-600 group-hover:text-gray-400' : 'text-gray-400 group-hover:text-gray-600'
            )}>
                Нажмите для детализации
            </div>

            <style>{`
                @keyframes progress-stripes {
                    from { background-position: 1rem 0; }
                    to { background-position: 0 0; }
                }
            `}</style>
        </div>
    );
}
