import React from 'react'
import { clsx } from 'clsx'
import { useTheme } from '../../contexts/ThemeContext'
import { LoadingSpinner } from './LoadingSpinner'
import { ProgressBar } from './ProgressBar'

interface LoadingStateProps {
  isLoading: boolean
  progress?: number
  total?: number
  message?: string
  variant?: 'spinner' | 'progress' | 'skeleton'
  size?: 'sm' | 'md' | 'lg'
  fullScreen?: boolean
  className?: string
  children?: React.ReactNode
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  isLoading,
  progress,
  total,
  message = 'Загрузка...',
  variant = 'spinner',
  size = 'md',
  fullScreen = false,
  className,
  children
}) => {
  const { isDark } = useTheme()
  if (!isLoading) {
    return <>{children}</>
  }

  if (variant === 'skeleton') {
    return (
      <div className={clsx('animate-pulse space-y-4', className)}>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
      </div>
    )
  }

  const content = (
    <div className={clsx('flex flex-col items-center justify-center gap-4 p-6', className)}>
      {variant === 'spinner' && (
        <>
          <LoadingSpinner size={size} />
          {message && <p className={clsx('text-sm font-medium', isDark ? 'text-gray-300' : 'text-gray-600')}>{message}</p>}
        </>
      )}
      {variant === 'progress' && (
        <>
          <LoadingSpinner size={size} />
          <ProgressBar
            progress={progress || 0}
            total={total}
            label={message}
            showPercentage
            variant="gradient"
            size="md"
          />
        </>
      )}
    </div>
  )

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
        {content}
      </div>
    )
  }

  return content
}

