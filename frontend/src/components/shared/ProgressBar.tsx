import React from 'react'
import { clsx } from 'clsx'

interface ProgressBarProps {
  progress: number
  total?: number
  label?: string
  showPercentage?: boolean
  variant?: 'default' | 'success' | 'warning' | 'error' | 'gradient'
  size?: 'sm' | 'md' | 'lg'
  animated?: boolean
  className?: string
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  total = 100,
  label,
  showPercentage = true,
  variant = 'default',
  size = 'md',
  animated = true,
  className
}) => {
  const percentage = total > 0 ? Math.min(100, Math.max(0, (progress / total) * 100)) : 0

  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3'
  }

  const variantClasses = {
    default: 'bg-blue-600',
    success: 'bg-green-600',
    warning: 'bg-yellow-600',
    error: 'bg-red-600',
    gradient: 'bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500'
  }

  return (
    <div className={clsx('w-full', className)}>
      {(label || showPercentage) && (
        <div className="flex items-center justify-between mb-2">
          {label && (
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {label}
            </span>
          )}
          {showPercentage && (
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}
      <div className={clsx(
        'w-full rounded-full overflow-hidden',
        sizeClasses[size],
        'bg-gray-200 dark:bg-gray-700'
      )}>
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-500',
            variantClasses[variant],
            animated && 'shadow-lg'
          )}
          style={{
            width: `${percentage}%`,
            transition: animated ? 'width 0.5s ease-out' : 'none'
          }}
        />
      </div>
      {total > 0 && (
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {progress} / {total}
        </div>
      )}
    </div>
  )
}

