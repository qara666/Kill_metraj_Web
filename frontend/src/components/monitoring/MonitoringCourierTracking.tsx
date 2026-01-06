import React from 'react'
import { clsx } from 'clsx'
import { CourierLocation } from '../../types'

interface MonitoringCourierTrackingProps {
    isDark: boolean
    locations: CourierLocation[]
}

export const MonitoringCourierTracking: React.FC<MonitoringCourierTrackingProps> = ({ isDark, locations }) => {
    return (
        <div className={clsx(
            'rounded-lg shadow-sm border p-6',
            isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
            <h3 className={clsx(
                'text-lg font-medium mb-4',
                isDark ? 'text-white' : 'text-gray-900'
            )}>
                Отслеживание курьеров
            </h3>

            <div className="space-y-3">
                {locations.map((courier) => (
                    <div key={courier.courierId} className={clsx(
                        'flex items-center justify-between p-4 rounded-lg border',
                        isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
                    )}>
                        <div className="flex items-center space-x-4">
                            <div className={clsx(
                                'w-3 h-3 rounded-full',
                                courier.status === 'online' ? 'bg-green-500' :
                                    courier.status === 'busy' ? 'bg-yellow-500' :
                                        courier.status === 'idle' ? 'bg-blue-500' : 'bg-gray-400'
                            )}></div>

                            <div>
                                <h4 className={clsx(
                                    'font-medium',
                                    isDark ? 'text-white' : 'text-gray-900'
                                )}>
                                    {courier.courierName}
                                </h4>
                                <p className={clsx(
                                    'text-sm',
                                    isDark ? 'text-gray-400' : 'text-gray-600'
                                )}>
                                    Статус: {getStatusLabel(courier.status)}
                                </p>
                            </div>
                        </div>

                        <div className="text-right">
                            <p className={clsx(
                                'text-sm font-medium',
                                isDark ? 'text-white' : 'text-gray-900'
                            )}>
                                {courier.speed.toFixed(0)} км/ч
                            </p>
                            <p className={clsx(
                                'text-xs',
                                isDark ? 'text-gray-400' : 'text-gray-600'
                            )}>
                                Обновлено: {new Date(courier.lastUpdate).toLocaleTimeString()}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

const getStatusLabel = (status: string) => {
    switch (status) {
        case 'online': return 'Онлайн'
        case 'busy': return 'Занят'
        case 'idle': return 'Свободен'
        default: return 'Офлайн'
    }
}
