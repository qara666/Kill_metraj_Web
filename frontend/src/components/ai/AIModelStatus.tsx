import React from 'react'
import { ChartBarIcon, ArrowPathIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { clsx } from 'clsx'

interface AIModelStatusProps {
    isDark: boolean
    isTraining: boolean
    modelAccuracy: number
    predictionCount: number
    highConfidenceCount: number
    onTrainModel: () => void
}

export const AIModelStatus: React.FC<AIModelStatusProps> = ({
    isDark,
    isTraining,
    modelAccuracy,
    predictionCount,
    highConfidenceCount,
    onTrainModel
}) => {
    return (
        <div className={clsx(
            'rounded-lg shadow-sm border p-6',
            isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
            <div className="flex items-center justify-between mb-4">
                <h3 className={clsx(
                    'text-lg font-medium',
                    isDark ? 'text-white' : 'text-gray-900'
                )}>
                    Статус ИИ модели
                </h3>

                <button
                    onClick={onTrainModel}
                    disabled={isTraining}
                    className={clsx(
                        'px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200',
                        isTraining
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-purple-600 text-white hover:bg-purple-700'
                    )}
                >
                    {isTraining ? (
                        <div className="flex items-center">
                            <ArrowPathIcon className="h-4 w-4 animate-spin mr-2" />
                            Обучение...
                        </div>
                    ) : (
                        <div className="flex items-center">
                            <ChartBarIcon className="h-4 w-4 mr-2" />
                            Обучить модель
                        </div>
                    )}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                    <ChartBarIcon className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-purple-600">{modelAccuracy.toFixed(1)}%</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Точность модели</p>
                </div>

                <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <ChartBarIcon className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-blue-600">{predictionCount}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Предсказаний</p>
                </div>

                <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <CheckCircleIcon className="h-8 w-8 text-green-600 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-green-600">{highConfidenceCount}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Высокая точность</p>
                </div>
            </div>
        </div>
    )
}
