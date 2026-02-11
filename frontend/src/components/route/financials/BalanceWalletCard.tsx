import { clsx } from 'clsx';
import { WalletIcon, ExclamationCircleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

interface BalanceWalletCardProps {
    expected: number;
    received: number; // This is collected + already settled, usually. Or just collected cash?
    // Based on previous logic: 
    // "Total Expected" = cash + card + online (for the shifting view)
    // "Debt" = Expected - Received. 
    // Here we want to visualize "Balance".
    // If Debt < 0: User OWES the system. Meaning they hold more cash than they should? Or less? 
    // Usually: Courier Collects Cash. System Expects X. 
    // If Courier has 1000 Cash, Expects 1000. Balance 0.
    // If Courier has 1000 Cash, Expects 500. Overpayment 500 (Balance +500).
    // If Courier has 500 Cash, Expects 1000. Dept -500.

    // For this visual:
    // Left side: "MY WALLET" (What I have / Collected)
    // Right side: "SYSTEM" (What I owe / Expected)

    isDark?: boolean;
    onClick?: () => void;
    difference: number; // signed value. < 0 means Debt (Owe to system), > 0 means Overpayment
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
    // Determine status
    const isDebt = difference < 0; // Negative means owe
    const isClean = difference === 0;
    const isBonus = difference > 0; // Positive means overpaid/bonus

    const absDiff = Math.abs(difference);

    // Calculate progress bars
    // We want to compare Expected vs Received.
    // Max value for the scale is the larger of the two.
    const maxValue = Math.max(expected, received) || 1;

    const expectedPercent = (expected / maxValue) * 100;
    const receivedPercent = (received / maxValue) * 100;

    return (
        <div
            onClick={onClick}
            className={clsx(
                'relative overflow-hidden rounded-3xl border p-5 transition-all duration-300 group cursor-pointer',
                isDark ? 'bg-gray-800/40 border-gray-700' : 'bg-white border-gray-100 shadow-sm hover:shadow-md'
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-6 relative z-10">
                <div className="flex items-center gap-3">
                    <div className={clsx(
                        'p-2 rounded-xl transition-colors',
                        isDebt ? (isDark ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600') :
                            isBonus ? (isDark ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-600') :
                                (isDark ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600')
                    )}>
                        {isDebt ? <ExclamationCircleIcon className="w-5 h-5" /> :
                            isBonus ? <WalletIcon className="w-5 h-5" /> :
                                <CheckCircleIcon className="w-5 h-5" />}
                    </div>
                    <div>
                        <h4 className={clsx(
                            'text-xs font-black uppercase tracking-widest opacity-60',
                            isDark ? 'text-gray-400' : 'text-gray-500'
                        )}>
                            Финансовый баланс
                        </h4>
                        <div className={clsx(
                            'text-xl font-black tracking-tight flex items-baseline gap-2',
                            isDark ? 'text-white' : 'text-gray-900'
                        )}>
                            {isClean ? 'Нет долгов' :
                                isDebt ? 'Нужно сдать' : 'Переплата'}

                            {!isClean && (
                                <span className={clsx(
                                    'text-lg',
                                    isDebt ? 'text-red-500' : 'text-green-500'
                                )}>
                                    {formatCurrency(absDiff)}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Visual Bars */}
            <div className="space-y-4 relative z-10">
                {/* Row 1: Expected */}
                <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide opacity-60">
                        <span>Ожидается системой</span>
                        <span>{formatCurrency(expected)}</span>
                    </div>
                    <div className={clsx("h-2 w-full rounded-full overflow-hidden", isDark ? 'bg-gray-700' : 'bg-gray-100')}>
                        <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${expectedPercent}%` }}
                        />
                    </div>
                </div>

                {/* Row 2: Received/Fact */}
                <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide opacity-60">
                        <span>На руках (Факт)</span>
                        <span>{formatCurrency(received)}</span>
                    </div>
                    <div className={clsx("h-2 w-full rounded-full overflow-hidden", isDark ? 'bg-gray-700' : 'bg-gray-100')}>
                        <div
                            className={clsx(
                                "h-full rounded-full transition-all",
                                isDebt ? 'bg-red-500' : 'bg-green-500'
                            )}
                            style={{ width: `${receivedPercent}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Footer hint */}
            <div className="mt-4 pt-3 border-t border-dashed border-gray-200 dark:border-gray-700/50 text-[10px] opacity-50 text-center uppercase tracking-widest">
                Нажмите для деталей
            </div>

            {/* Background Gradient */}
            <div className={clsx(
                'absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none',
                isDebt ? 'bg-red-500' : isBonus ? 'bg-green-500' : 'bg-blue-500'
            )} />
        </div>
    );
}
