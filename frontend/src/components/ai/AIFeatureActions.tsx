import React from 'react'
import { ClockIcon, BoltIcon, ArrowTrendingUpIcon, FireIcon } from '@heroicons/react/24/outline'
import { clsx } from 'clsx'

interface AIFeatureActionsProps {
    isDark: boolean
    isAnalyzing: boolean
    onPredictTime: () => void
    onOptimizeRoutes: () => void
    onAnalyzeEfficiency: () => void
    onForecastDemand: () => void
}

export const AIFeatureActions: React.FC<AIFeatureActionsProps> = ({
    isDark,
    isAnalyzing,
    onPredictTime,
    onOptimizeRoutes,
    onAnalyzeEfficiency,
    onForecastDemand
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
                    ИИ функции
                </h3>

                <div className="flex space-x-2">
                    <button
                        onClick={onPredictTime}
                        disabled={isAnalyzing}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                        <ClockIcon className="h-4 w-4 mr-2 inline" />
                        Предсказать время
                    </button>

                    <button
                        onClick={onOptimizeRoutes}
                        disabled={isAnalyzing}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                        <BoltIcon className="h-4 w-4 mr-2 inline" />
                        Оптимизировать
                    </button>

                    <button
                        onClick={onAnalyzeEfficiency}
                        disabled={isAnalyzing}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
                    >
                        <ArrowTrendingUpIcon className="h-4 w-4 mr-2 inline" />
                        Анализ эффективности
                    </button>

                    <button
                        onClick={onForecastDemand}
                        disabled={isAnalyzing}
                        className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
                    >
                        <FireIcon className="h-4 w-4 mr-2 inline" />
                        Прогноз спроса
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <FeatureInfoCard
                    title="Предсказание времени доставки"
                    description="ИИ анализирует исторические данные, пробки и погоду для точного прогноза времени доставки"
                    accuracy="89.2%"
                    bgColor="bg-blue-50 dark:bg-blue-900/20"
                    textColor="text-blue-600"
                />
                <FeatureInfoCard
                    title="Оптимизация маршрутов"
                    description="Машинное обучение для создания оптимальных маршрутов с учетом множества факторов"
                    accuracy="92.1%"
                    bgColor="bg-green-50 dark:bg-green-900/20"
                    textColor="text-green-600"
                />
                <FeatureInfoCard
                    title="Анализ эффективности"
                    description="ИИ оценивает эффективность курьеров и предлагает способы улучшения"
                    accuracy="87.5%"
                    bgColor="bg-purple-50 dark:bg-purple-900/20"
                    textColor="text-purple-600"
                />
                <FeatureInfoCard
                    title="Прогнозирование спроса"
                    description="Предсказание спроса на основе исторических данных, сезонности и внешних факторов"
                    accuracy="84.3%"
                    bgColor="bg-orange-50 dark:bg-orange-900/20"
                    textColor="text-orange-600"
                />
            </div>
        </div>
    )
}

interface FeatureInfoCardProps {
    title: string
    description: string
    accuracy: string
    bgColor: string
    textColor: string
}

const FeatureInfoCard: React.FC<FeatureInfoCardProps> = ({ title, description, accuracy, bgColor, textColor }) => (
    <div className={clsx('p-4 rounded-lg', bgColor)}>
        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">{title}</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{description}</p>
        <div className={clsx('text-xs font-medium', textColor)}>
            Точность: {accuracy}
        </div>
    </div>
)
