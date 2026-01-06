import React from 'react'
import { MapIcon, EyeIcon, XCircleIcon } from '@heroicons/react/24/outline'
import { clsx } from 'clsx'
import { Geofence } from '../../types'

interface MonitoringGeofencesProps {
    isDark: boolean
    geofences: Geofence[]
    onCreateGeofence: () => void
    onDeleteGeofence: (id: string) => void
    onSelectGeofence: (id: string) => void
}

export const MonitoringGeofences: React.FC<MonitoringGeofencesProps> = ({
    isDark,
    geofences,
    onCreateGeofence,
    onDeleteGeofence,
    onSelectGeofence
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
                    Геозоны
                </h3>

                <button
                    onClick={onCreateGeofence}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                    <MapIcon className="h-4 w-4 mr-2 inline" />
                    Добавить зону
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {geofences.map((geofence) => (
                    <div key={geofence.id} className={clsx(
                        'p-4 rounded-lg border',
                        isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
                    )}>
                        <div className="flex items-center justify-between mb-2">
                            <h4 className={clsx(
                                'font-medium',
                                isDark ? 'text-white' : 'text-gray-900'
                            )}>
                                {geofence.name}
                            </h4>

                            <div className="flex items-center space-x-2">
                                <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: geofence.color }}
                                ></div>
                                <span className={clsx(
                                    'text-xs px-2 py-1 rounded-full',
                                    geofence.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                )}>
                                    {geofence.isActive ? 'Активна' : 'Неактивна'}
                                </span>
                            </div>
                        </div>

                        <p className={clsx(
                            'text-sm mb-2',
                            isDark ? 'text-gray-400' : 'text-gray-600'
                        )}>
                            Тип: {getGeofenceTypeLabel(geofence.type)}
                        </p>

                        <p className={clsx(
                            'text-sm mb-3',
                            isDark ? 'text-gray-400' : 'text-gray-600'
                        )}>
                            Радиус: {geofence.radius} км
                        </p>

                        <div className="flex space-x-2">
                            <button
                                onClick={() => onSelectGeofence(geofence.id)}
                                className="flex-1 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors"
                            >
                                <EyeIcon className="h-3 w-3 mr-1 inline" />
                                Просмотр
                            </button>

                            <button
                                onClick={() => onDeleteGeofence(geofence.id)}
                                className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition-colors"
                            >
                                <XCircleIcon className="h-3 w-3" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

const getGeofenceTypeLabel = (type: string) => {
    switch (type) {
        case 'delivery_zone': return 'Зона доставки'
        case 'restricted_area': return 'Ограниченная зона'
        case 'depot': return 'Склад'
        default: return 'Пользовательская'
    }
}
