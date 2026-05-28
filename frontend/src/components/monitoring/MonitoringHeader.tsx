import React from 'react'
import { PlayIcon, StopIcon } from '@heroicons/react/24/outline'
import { clsx } from 'clsx'

interface MonitoringHeaderProps {
    isDark: boolean
    isMonitoring: boolean
    onStartMonitoring: () => void
    onStopMonitoring: () => void
}

export const MonitoringHeader: React.FC<MonitoringHeaderProps> = ({
    isDark,
    isMonitoring,
    onStartMonitoring,
    onStopMonitoring
}) => {
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
                        Система мониторинга
                    </h1>
                    <p className={clsx(
                        'mt-1 text-sm',
                        isDark ? 'text-gray-400' : 'text-gray-600'
                    )}>
                        Геозоны, алерты и отслеживание курьеров в реальном времени
                    </p>
                </div>
                <div className="flex items-center space-x-2">
                    <div className={clsx(
                        'flex items-center space-x-2 px-3 py-1 rounded-full text-sm',
                        isMonitoring ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    )}>
                        <div className={clsx(
                            'w-2 h-2 rounded-full',
                            isMonitoring ? 'bg-green-500' : 'bg-gray-400'
                        )}></div>
                        <span>{isMonitoring ? 'Активен' : 'Неактивен'}</span>
                    </div>

                    <div className="flex space-x-2">
                        {!isMonitoring ? (
                            <button
                                onClick={onStartMonitoring}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                            >
                                <PlayIcon className="h-4 w-4 mr-2 inline" />
                                Запустить
                            </button>
                        ) : (
                            <button
                                onClick={onStopMonitoring}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                            >
                                <StopIcon className="h-4 w-4 mr-2 inline" />
                                Остановить
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
