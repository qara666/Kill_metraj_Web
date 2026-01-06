import React from 'react'
import { clsx } from 'clsx'
import { EfficiencyAnalysis } from '../../types'

interface AIEfficiencyAnalysisProps {
    isDark: boolean
    data: EfficiencyAnalysis[]
}

export const AIEfficiencyAnalysis: React.FC<AIEfficiencyAnalysisProps> = ({ isDark, data }) => {
    if (data.length === 0) return null

    return (
        <div className={clsx(
            'rounded-lg shadow-sm border p-6',
            isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
            <h3 className={clsx(
                'text-lg font-medium mb-4',
                isDark ? 'text-white' : 'text-gray-900'
            )}>
                Анализ эффективности курьеров
            </h3>

            <div className="space-y-4">
                {data.map((analysis) => (
                    <div key={analysis.courierId} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="font-medium text-gray-900 dark:text-gray-100">{analysis.courierName}</h4>
                            <div className="text-right">
                                <p className="text-sm text-gray-600 dark:text-gray-400">Текущая эффективность</p>
                                <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                                    {analysis.currentEfficiency.toFixed(2)}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                            <FactorStat label="Оптимизация маршрутов" value={analysis.factors.routeOptimization} color="text-green-600" />
                            <FactorStat label="Управление временем" value={analysis.factors.timeManagement} color="text-blue-600" />
                            <FactorStat label="Балансировка нагрузки" value={analysis.factors.loadBalancing} color="text-purple-600" />
                            <FactorStat label="Избежание пробок" value={analysis.factors.trafficAvoidance} color="text-orange-600" />
                        </div>

                        <div className="space-y-1">
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Рекомендации:</p>
                            {analysis.suggestions.map((suggestion, index) => (
                                <p key={index} className="text-xs text-gray-600 dark:text-gray-400 flex items-center">
                                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-2"></span>
                                    {suggestion}
                                </p>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

const FactorStat: React.FC<{ label: string, value: number, color: string }> = ({ label, value, color }) => (
    <div className="text-center">
        <p className="text-xs text-gray-600 dark:text-gray-400">{label}</p>
        <p className={clsx('text-sm font-bold', color)}>
            {value.toFixed(0)}%
        </p>
    </div>
)
