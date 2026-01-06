import React from 'react'
import { LightBulbIcon } from '@heroicons/react/24/outline'
import { clsx } from 'clsx'
import { AIPrediction } from '../../types'

interface AIPredictionsListProps {
    isDark: boolean
    predictions: AIPrediction[]
}

export const AIPredictionsList: React.FC<AIPredictionsListProps> = ({ isDark, predictions }) => {
    if (predictions.length === 0) return null

    return (
        <div className={clsx(
            'rounded-lg shadow-sm border p-6',
            isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
            <h3 className={clsx(
                'text-lg font-medium mb-4',
                isDark ? 'text-white' : 'text-gray-900'
            )}>
                ИИ предсказания
            </h3>

            <div className="space-y-4">
                {predictions.map((prediction) => (
                    <div key={prediction.id} className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <h4 className="font-medium text-gray-900 dark:text-gray-100">{prediction.title}</h4>
                                <p className="text-sm text-gray-600 dark:text-gray-400">{prediction.description}</p>
                            </div>

                            <div className="text-right">
                                <p className="text-sm text-gray-600 dark:text-gray-400">Уверенность</p>
                                <p className="text-lg font-bold text-green-600 dark:text-green-400">
                                    {prediction.confidence.toFixed(0)}%
                                </p>
                            </div>
                        </div>

                        {prediction.data && (
                            <div className="mb-3">
                                {prediction.type === 'delivery_time' && (
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                            {prediction.data.predictedTime} мин
                                        </p>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">прогнозируемое время доставки</p>
                                    </div>
                                )}

                                {prediction.type === 'route_optimization' && (
                                    <div className="grid grid-cols-3 gap-4 text-center">
                                        <StatBox
                                            label="Экономия расстояния"
                                            value={`${prediction.data.savings.distance.toFixed(1)} км`}
                                            color="text-green-600 dark:text-green-400"
                                        />
                                        <StatBox
                                            label="Экономия времени"
                                            value={`${Math.round(prediction.data.savings.time)} мин`}
                                            color="text-blue-600 dark:text-blue-400"
                                        />
                                        <StatBox
                                            label="Экономия средств"
                                            value={`${prediction.data.savings.cost.toFixed(0)} грн`}
                                            color="text-purple-600 dark:text-purple-400"
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="space-y-1">
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Рекомендации:</p>
                            {prediction.recommendations.map((recommendation, index) => (
                                <p key={index} className="text-xs text-gray-600 dark:text-gray-400 flex items-center">
                                    <LightBulbIcon className="h-3 w-3 text-yellow-500 mr-2" />
                                    {recommendation}
                                </p>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

const StatBox: React.FC<{ label: string, value: string, color: string }> = ({ label, value, color }) => (
    <div>
        <p className={clsx('text-lg font-bold', color)}>{value}</p>
        <p className="text-xs text-gray-600 dark:text-gray-400">{label}</p>
    </div>
)
