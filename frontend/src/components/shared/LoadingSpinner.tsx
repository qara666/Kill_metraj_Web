import React from 'react'
import { clsx } from 'clsx'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error'
  text?: string
  fullScreen?: boolean
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md', 
  className = '',
  variant = 'default',
  text,
  fullScreen = false
}) => {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-2',
    lg: 'h-12 w-12 border-3',
    xl: 'h-16 w-16 border-4'
  }

  const variantClasses = {
    default: 'border-blue-600 border-t-transparent',
    primary: 'border-blue-600 border-t-transparent',
    success: 'border-green-600 border-t-transparent',
    warning: 'border-yellow-600 border-t-transparent',
    error: 'border-red-600 border-t-transparent'
  }

  const spinner = (
    <div className={clsx('flex flex-col items-center justify-center gap-3', className)}>
      <div className={clsx(
        'animate-spin rounded-full',
        sizeClasses[size],
        variantClasses[variant]
      )} />
      {text && (
        <p className="text-sm text-gray-600 dark:text-gray-400 animate-pulse">
          {text}
        </p>
      )}
    </div>
  )

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
        {spinner}
      </div>
    )
  }

  return spinner
}
