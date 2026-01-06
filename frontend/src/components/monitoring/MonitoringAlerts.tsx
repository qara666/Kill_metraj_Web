import React from 'react'
import { BellIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { clsx } from 'clsx'
import { GeofenceAlert } from '../../types'

interface MonitoringAlertsProps {
    isDark: boolean
    alerts: GeofenceAlert[]
    filter: 'all' | 'unread' | 'critical'
    onFilterChange: (filter: 'all' | 'unread' | 'critical') => void
    onMarkAsRead: (id: string) => void
    onMarkAllAsRead: () => void
}

export const MonitoringAlerts: React.FC<MonitoringAlertsProps> = ({
    isDark,
    alerts,
    filter,
    onFilterChange,
    onMarkAsRead,
    onMarkAllAsRead
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
                    Алерты
                </h3>

                <div className="flex items-center space-x-2">
                    <select
                        value={filter}
                        onChange={(e) => onFilterChange(e.target.value as any)}
                        className={clsx(
                            'px-3 py-2 rounded-lg border text-sm',
                            isDark
                                ? 'bg-gray-700 border-gray-600 text-white'
                                : 'bg-white border-gray-300 text-gray-900'
                        )}
                    >
                        <option value="all">Все</option>
                        <option value="unread">Непрочитанные</option>
                        <option value="critical">Критические</option>
                    </select>

                    <button
                        onClick={onMarkAllAsRead}
                        className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
                    >
                        Отметить все
                    </button>
                </div>
            </div>

            <div className="space-y-3">
                {alerts.length === 0 ? (
                    <div className="text-center py-8">
                        <BellIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className={clsx(
                            'text-sm',
                            isDark ? 'text-gray-400' : 'text-gray-600'
                        )}>
                            Нет алертов для отображения
                        </p>
                    </div>
                ) : (
                    alerts.map((alert) => (
                        <AlertItem
                            key={alert.id}
                            alert={alert}
                            isDark={isDark}
                            onMarkAsRead={onMarkAsRead}
                        />
                    ))
                )}
            </div>
        </div>
    )
}

interface AlertItemProps {
    alert: GeofenceAlert
    isDark: boolean
    onMarkAsRead: (id: string) => void
}

const AlertItem: React.FC<AlertItemProps> = ({ alert, isDark, onMarkAsRead }) => {
    const severityClasses = {
        critical: 'border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800',
        high: 'border-orange-300 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800',
        medium: 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800',
        low: 'border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-800'
    }

    const statusBg = alert.isRead
        ? (isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200')
        : (isDark ? 'bg-blue-900/30 border-blue-700' : 'bg-blue-50 border-blue-200')

    return (
        <div className={clsx(
            'p-4 rounded-lg border transition-all duration-200',
            statusBg,
            severityClasses[alert.severity]
        )}>
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                        <ExclamationTriangleIcon className={clsx(
                            'h-5 w-5',
                            alert.severity === 'critical' ? 'text-red-600' :
                                alert.severity === 'high' ? 'text-orange-600' :
                                    alert.severity === 'medium' ? 'text-yellow-600' :
                                        'text-green-600'
                        )} />

                        <h4 className={clsx(
                            'font-medium text-sm',
                            isDark ? 'text-white' : 'text-gray-900'
                        )}>
                            {getAlertTypeLabel(alert.type)}
                        </h4>

                        <span className={clsx(
                            'px-2 py-0.5 text-[10px] uppercase font-bold rounded-full',
                            alert.severity === 'critical' ? 'bg-red-100 text-red-800' :
                                alert.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                                    alert.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-green-100 text-green-800'
                        )}>
                            {getSeverityLabel(alert.severity)}
                        </span>
                    </div>

                    <p className={clsx(
                        'text-sm mb-2',
                        isDark ? 'text-gray-400' : 'text-gray-600'
                    )}>
                        {alert.message}
                    </p>

                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span>Курьер: {alert.courier}</span>
                        <span>Время: {new Date(alert.timestamp).toLocaleString()}</span>
                    </div>
                </div>

                {!alert.isRead && (
                    <button
                        onClick={() => onMarkAsRead(alert.id)}
                        className="ml-4 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors"
                    >
                        Прочитано
                    </button>
                )}
            </div>
        </div>
    )
}

const getAlertTypeLabel = (type: string) => {
    switch (type) {
        case 'entry': return 'Вход в зону'
        case 'exit': return 'Выход из зоны'
        case 'violation': return 'Нарушение геозоны'
        default: return 'Предупреждение'
    }
}

const getSeverityLabel = (severity: string) => {
    switch (severity) {
        case 'critical': return 'КРИТИЧЕСКИЙ'
        case 'high': return 'ВЫСОКИЙ'
        case 'medium': return 'СРЕДНИЙ'
        default: return 'НИЗКИЙ'
    }
}
