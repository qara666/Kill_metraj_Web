import React from 'react'
import { clsx } from 'clsx'
import { DemandForecast } from '../../types'

interface AIDemandForecastProps {
    isDark: boolean
    data: DemandForecast[]
}

export const AIDemandForecast: React.FC<AIDemandForecastProps> = ({ isDark, data }) => {
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
                Прогноз спроса
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {data.map((forecast, index) => (
                    <div key={index} className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">{forecast.period}</h4>

                        <div className="text-center mb-3">
                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{forecast.predictedOrders}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">прогнозируемых заказов</p>
                        </div>

                        <div className="space-y-2 mb-3">
                            <ForecastFactor label="Исторические данные" value={forecast.factors.historical} />
                            <ForecastFactor label="Сезонность" value={forecast.factors.seasonal} />
                            <ForecastFactor label="Погода" value={forecast.factors.weather} />
                            <ForecastFactor label="События" value={forecast.factors.events} />
                        </div>

                        <div className="text-center pt-2 border-t border-blue-100 dark:border-blue-800">
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Уверенность: {forecast.confidence.toFixed(0)}%
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

const ForecastFactor: React.FC<{ label: string, value: number }> = ({ label, value }) => (
    <div className="flex justify-between text-xs">
        <span className="text-gray-600 dark:text-gray-400">{label}</span>
        <span className="font-medium text-gray-900 dark:text-gray-200">{value}%</span>
    </div>
)
