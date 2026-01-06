import React from 'react'
import { ChartBarIcon } from '@heroicons/react/24/outline'
import { clsx } from 'clsx'

interface AIHeaderProps {
    isDark: boolean
    modelAccuracy: number
}

export const AIHeader: React.FC<AIHeaderProps> = ({ isDark, modelAccuracy }) => {
    return (
        <div className={clsx(
            'rounded-lg shadow-sm border p-6',
            isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
            <div className="flex items-center justify-between">
                <div>
                    <h1 className={clsx(
                        'text-2xl font-bold',
                        isDark ? 'text-white' : 'text-gray-900'
                    )}>
                        ИИ функции и машинное обучение
                    </h1>
                    <p className={clsx(
                        'mt-1 text-sm',
                        isDark ? 'text-gray-400' : 'text-gray-600'
                    )}>
                        Предсказание времени доставки, оптимизация маршрутов и анализ эффективности
                    </p>
                </div>
                <div className="flex items-center space-x-2">
                    <ChartBarIcon className="h-6 w-6 text-purple-600" />
                    <span className={clsx(
                        'text-sm font-medium',
                        isDark ? 'text-gray-400' : 'text-gray-600'
                    )}>
                        ИИ модель: {modelAccuracy.toFixed(1)}%
                    </span>
                </div>
            </div>
        </div>
    )
}
