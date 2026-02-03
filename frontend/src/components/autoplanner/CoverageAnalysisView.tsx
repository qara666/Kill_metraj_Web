import React from 'react';
import { clsx } from 'clsx';
import type { CoverageAnalysis } from '../../utils/processing/coverageAnalysis';

interface CoverageAnalysisViewProps {
    analysis: CoverageAnalysis | null;
    isDark: boolean;
}

export const CoverageAnalysisView: React.FC<CoverageAnalysisViewProps> = ({
    analysis,
    isDark
}) => {
    if (!analysis) return null;

    return (
        <div className={clsx(
            'mt-6 rounded-xl p-4 border transition-all',
            isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-gray-50'
        )}>
            <div className={clsx('text-sm font-semibold mb-3 flex items-center gap-2', isDark ? 'text-white' : 'text-gray-900')}>
                <span></span>
                <span>Анализ покрытия зоны доставки</span>
            </div>

            <div className={clsx('space-y-3 text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}>
                <div className="flex items-center justify-between">
                    <span>Общее покрытие:</span>
                    <span className={clsx(
                        'font-bold px-2 py-0.5 rounded-lg',
                        analysis.coveragePercentage >= 80
                            ? (isDark ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700')
                            : analysis.coveragePercentage >= 50
                                ? (isDark ? 'bg-yellow-900/30 text-yellow-400' : 'bg-yellow-100 text-yellow-700')
                                : (isDark ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-700')
                    )}>
                        {analysis.coveragePercentage.toFixed(1)}%
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className={clsx('p-3 rounded-xl border', isDark ? 'border-gray-700 bg-gray-900/20' : 'border-gray-100 bg-white')}>
                        <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1">Покрыто</div>
                        <div className="text-lg font-bold">{analysis.coveredOrders} / {analysis.totalOrders}</div>
                    </div>
                    <div className={clsx('p-3 rounded-xl border', isDark ? 'border-gray-700 bg-gray-900/20' : 'border-gray-100 bg-white')}>
                        <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1">Пропущено</div>
                        <div className="text-lg font-bold text-red-500">{analysis.uncoveredOrders}</div>
                    </div>
                </div>

                {analysis.coverageGaps.length > 0 && (
                    <div className={clsx('p-3 rounded-xl border', isDark ? 'border-red-900/20 border-red-900/30' : 'border-red-100 bg-red-50/30')}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-xs">Пробелы в покрытии:</span>
                            <span className="text-xs font-bold">{analysis.coverageGaps.length}</span>
                        </div>
                        {analysis.coverageGaps.filter(g => g.severity === 'high').length > 0 && (
                            <div className="text-[10px] text-red-500 font-bold uppercase">
                                ️ Внимание: {analysis.coverageGaps.filter(g => g.severity === 'high').length} критических пробелов
                            </div>
                        )}
                    </div>
                )}

                {analysis.recommendations.length > 0 && (
                    <div className={clsx('mt-3 p-3 rounded-lg', isDark ? 'bg-gray-900/50 text-gray-400' : 'bg-gray-100 text-gray-600')}>
                        <div className="text-xs font-bold mb-2 uppercase tracking-tight">Рекомендации:</div>
                        <ul className="space-y-1.5 text-xs">
                            {analysis.recommendations.map((rec, idx) => (
                                <li key={idx} className="flex items-start gap-2">
                                    <span className="text-blue-500">•</span>
                                    <span>{rec}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
};
