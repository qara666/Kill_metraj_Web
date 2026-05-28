import React from 'react';
import { clsx } from 'clsx';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

interface OptimizationProgress {
    current: number;
    total: number;
    message: string;
    substep?: string;
}

interface OptimizationProgressViewProps {
    progress: OptimizationProgress | null;
    isDark: boolean;
}

export const OptimizationProgressView: React.FC<OptimizationProgressViewProps> = React.memo(({
    progress,
    isDark
}) => {
    if (!progress) return null;

    const percentage = Math.round((progress.current / Math.max(progress.total, 1)) * 100);

    return (
        <div className={clsx(
            'mb-6 rounded-2xl p-6 border-2 shadow-lg transition-all',
            isDark
                ? 'border-blue-600/50 bg-gradient-to-br from-blue-900/30 to-indigo-900/30'
                : 'border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50'
        )}>
            <div className="flex items-center gap-3 mb-4">
                <div className={clsx(
                    'p-2 rounded-lg',
                    isDark ? 'bg-blue-600/20' : 'bg-blue-100'
                )}>
                    <ArrowPathIcon className={clsx('w-5 h-5 animate-spin', isDark ? 'text-blue-400' : 'text-blue-600')} />
                </div>
                <div className={clsx('flex flex-col flex-1')}>
                    <div className={clsx('text-sm font-bold', isDark ? 'text-white' : 'text-blue-900')}>
                        {progress.message}
                    </div>
                    {progress.substep && (
                        <div className={clsx('text-xs opacity-70', isDark ? 'text-blue-300' : 'text-blue-600')}>
                            {progress.substep}
                        </div>
                    )}
                </div>
            </div>

            <div className={clsx(
                'w-full rounded-full h-4 overflow-hidden shadow-inner',
                isDark ? 'bg-gray-700/50' : 'bg-gray-200'
            )}>
                <div
                    className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"
                    style={{ width: `${percentage}%` }}
                />
            </div>

            <div className={clsx('text-xs mt-3 flex items-center justify-between', isDark ? 'text-blue-300' : 'text-blue-600')}>
                <span>Прогресс выполнения</span>
                <span className="font-bold">
                    {progress.current} / {progress.total} ({percentage}%)
                </span>
            </div>
        </div>
    );
});
