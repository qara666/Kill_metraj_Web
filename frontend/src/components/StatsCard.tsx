import React from 'react'
import { clsx } from 'clsx'

interface StatsCardProps {
  title: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  color?: 'primary' | 'success' | 'warning' | 'danger'
  change?: string
  className?: string
}

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  icon: Icon,
  color = 'primary',
  change,
  className
}) => {
  const colorClasses = {
    primary: 'bg-primary-50 text-primary-600',
    success: 'bg-success-50 text-success-600',
    warning: 'bg-warning-50 text-warning-600',
    danger: 'bg-danger-50 text-danger-600'
  }

  return (
    <div className={clsx('card p-6', className)}>
      <div className="flex items-center">
        <div className={clsx('flex-shrink-0 p-3 rounded-lg', colorClasses[color])}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="ml-4 flex-1">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
          {change && (
            <p className="text-sm text-gray-500">{change}</p>
          )}
        </div>
      </div>
    </div>
  )
}
