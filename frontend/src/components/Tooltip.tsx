// Компонент подсказок для элементов интерфейса

import React, { useState, useRef, useEffect } from 'react'
import { clsx } from 'clsx'
import { useTheme } from '../contexts/ThemeContext'
import { InformationCircleIcon } from '@heroicons/react/24/outline'

interface TooltipProps {
  content: string | React.ReactNode
  children: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
  className?: string
  showIcon?: boolean
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  delay = 300,
  className,
  showIcon = false
}) => {
  const { isDark } = useTheme()
  const [isVisible, setIsVisible] = useState(false)
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({})
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  const showTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
      updateTooltipPosition()
    }, delay)
  }

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setIsVisible(false)
  }

  const updateTooltipPosition = () => {
    if (!triggerRef.current || !tooltipRef.current) return

    const triggerRect = triggerRef.current.getBoundingClientRect()
    const tooltipRect = tooltipRef.current.getBoundingClientRect()
    const scrollY = window.scrollY
    const scrollX = window.scrollX

    let top = 0
    let left = 0

    switch (position) {
      case 'top':
        top = triggerRect.top + scrollY - tooltipRect.height - 8
        left = triggerRect.left + scrollX + triggerRect.width / 2
        break
      case 'bottom':
        top = triggerRect.bottom + scrollY + 8
        left = triggerRect.left + scrollX + triggerRect.width / 2
        break
      case 'left':
        top = triggerRect.top + scrollY + triggerRect.height / 2
        left = triggerRect.left + scrollX - tooltipRect.width - 8
        break
      case 'right':
        top = triggerRect.top + scrollY + triggerRect.height / 2
        left = triggerRect.right + scrollX + 8
        break
    }

    // Корректировка для предотвращения выхода за границы экрана
    const padding = 8
    if (left < padding) left = padding
    if (left + tooltipRect.width > window.innerWidth - padding) {
      left = window.innerWidth - tooltipRect.width - padding
    }
    if (top < padding) {
      top = triggerRect.bottom + scrollY + 8
    }
    if (top + tooltipRect.height > window.innerHeight + scrollY - padding) {
      top = triggerRect.top + scrollY - tooltipRect.height - 8
    }

    setTooltipStyle({
      top: `${top}px`,
      left: `${left}px`,
      transform: position === 'top' || position === 'bottom' ? 'translateX(-50%)' : 'translateY(-50%)'
    })
  }

  useEffect(() => {
    if (isVisible) {
      updateTooltipPosition()
      window.addEventListener('scroll', updateTooltipPosition)
      window.addEventListener('resize', updateTooltipPosition)
      return () => {
        window.removeEventListener('scroll', updateTooltipPosition)
        window.removeEventListener('resize', updateTooltipPosition)
      }
    }
  }, [isVisible])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        className={className}
      >
        {showIcon && (
          <div className="inline-flex items-center gap-1">
            {children}
            <InformationCircleIcon className={clsx(
              'w-4 h-4',
              isDark ? 'text-gray-400' : 'text-gray-500'
            )} />
          </div>
        )}
        {!showIcon && children}
      </div>

      {isVisible && (
        <div
          ref={tooltipRef}
          className={clsx(
            'fixed z-[10002] px-3 py-2 rounded-lg shadow-lg text-sm max-w-xs pointer-events-none transition-opacity',
            isDark ? 'bg-gray-800 text-gray-100 border border-gray-700' : 'bg-gray-900 text-white',
            isVisible ? 'opacity-100' : 'opacity-0'
          )}
          style={tooltipStyle}
        >
          {typeof content === 'string' ? (
            <div className="whitespace-pre-wrap">{content}</div>
          ) : (
            content
          )}
          {/* Стрелка */}
          <div
            className={clsx(
              'absolute w-2 h-2 rotate-45',
              position === 'top' && 'bottom-[-4px] left-1/2 -translate-x-1/2',
              position === 'bottom' && 'top-[-4px] left-1/2 -translate-x-1/2',
              position === 'left' && 'right-[-4px] top-1/2 -translate-y-1/2',
              position === 'right' && 'left-[-4px] top-1/2 -translate-y-1/2',
              isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-900'
            )}
          />
        </div>
      )}
    </>
  )
}

