import React from 'react'
import { TruckIcon, CheckCircleIcon, MapIcon, BellIcon, ExclamationTriangleIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import { clsx } from 'clsx'
import { MonitoringStats } from '../../types'

interface MonitoringStatsProps {
    isDark: boolean
    stats: MonitoringStats
}

export const MonitoringStatsView: React.FC<MonitoringStatsProps> = ({ isDark, stats }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <StatCard
                isDark={isDark}
                icon={<TruckIcon className="h-8 w-8 text-blue-600" />}
                value={stats.totalCouriers}
                label="Всего курьеров"
            />
            <StatCard
                isDark={isDark}
                icon={<CheckCircleIcon className="h-8 w-8 text-green-600" />}
                value={stats.onlineCouriers}
                label="Онлайн"
            />
            <StatCard
                isDark={isDark}
                icon={<MapIcon className="h-8 w-8 text-purple-600" />}
                value={stats.activeRoutes}
                label="Активных маршрутов"
            />
            <StatCard
                isDark={isDark}
                icon={<BellIcon className="h-8 w-8 text-orange-600" />}
                value={stats.totalAlerts}
                label="Всего алертов"
            />
            <StatCard
                isDark={isDark}
                icon={<ExclamationTriangleIcon className="h-8 w-8 text-red-600" />}
                value={stats.unreadAlerts}
                label="Непрочитанных"
            />
            <StatCard
                isDark={isDark}
                icon={<ShieldCheckIcon className="h-8 w-8 text-yellow-600" />}
                value={stats.geofenceViolations}
                label="Нарушений"
            />
        </div>
    )
}

interface StatCardProps {
    isDark: boolean
    icon: React.ReactNode
    value: number
    label: string
}

const StatCard: React.FC<StatCardProps> = ({ isDark, icon, value, label }) => (
    <div className={clsx(
        'rounded-lg shadow-sm border p-4 text-center',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
    )}>
        <div className="flex justify-center mb-2">{icon}</div>
        <p className={clsx(
            'text-2xl font-bold',
            isDark ? 'text-white' : 'text-gray-900'
        )}>
            {value}
        </p>
        <p className={clsx(
            'text-sm',
            isDark ? 'text-gray-400' : 'text-gray-600'
        )}>
            {label}
        </p>
    </div>
)
