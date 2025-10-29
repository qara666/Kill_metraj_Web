import React from 'react'
import { clsx } from 'clsx'
import { useTheme } from '../contexts/ThemeContext'

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
  const { isDark } = useTheme()
  
  const colorClasses = {
    primary: isDark ? 'bg-blue-900/20 text-blue-400' : 'bg-blue-50 text-blue-600',
    success: isDark ? 'bg-green-900/20 text-green-400' : 'bg-green-50 text-green-600',
    warning: isDark ? 'bg-yellow-900/20 text-yellow-400' : 'bg-yellow-50 text-yellow-600',
    danger: isDark ? 'bg-red-900/20 text-red-400' : 'bg-red-50 text-red-600'
  }

  return (
    <div className={clsx(
      'p-6 rounded-lg border shadow-sm',
      isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200',
      className
    )}>
      <div className="flex items-center">
        <div className={clsx('flex-shrink-0 p-3 rounded-lg', colorClasses[color])}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="ml-4 flex-1">
          <p className={clsx('text-sm font-medium', isDark ? 'text-gray-400' : 'text-gray-600')}>{title}</p>
          <p className={clsx('text-2xl font-semibold', isDark ? 'text-gray-100' : 'text-gray-900')}>{value}</p>
          {change && (
            <p className={clsx('text-sm', isDark ? 'text-gray-500' : 'text-gray-500')}>{change}</p>
          )}
        </div>
      </div>
    </div>
  )
}




















