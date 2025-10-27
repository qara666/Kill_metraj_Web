import React, { useState } from 'react'
import { XMarkIcon, KeyIcon } from '@heroicons/react/24/outline'
import { useApiKey } from '../hooks/useApiKey'
import { Link } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import { clsx } from 'clsx'

export const ApiKeyNotification: React.FC = () => {
  const { hasApiKey } = useApiKey()
  const { isDark } = useTheme()
  const [isDismissed, setIsDismissed] = useState(false)

  // Don't show if API key is configured or notification is dismissed
  if (hasApiKey() || isDismissed) {
    return null
  }

  return (
    <div className={clsx(
      'border rounded-lg p-4 mb-6',
      isDark 
        ? 'bg-orange-900/20 border-orange-700' 
        : 'bg-orange-50 border-orange-200'
    )}>
      <div className="flex items-start">
        <KeyIcon className={clsx(
          'h-5 w-5 mt-0.5 mr-3 flex-shrink-0',
          isDark ? 'text-orange-400' : 'text-orange-600'
        )} />
        <div className="flex-1">
          <h3 className={clsx(
            'text-sm font-medium',
            isDark ? 'text-orange-200' : 'text-orange-800'
          )}>
            Требуется Google Maps API ключ
          </h3>
          <p className={clsx(
            'mt-1 text-sm',
            isDark ? 'text-orange-300' : 'text-orange-700'
          )}>
            Для использования функций геокодирования и оптимизации маршрутов, пожалуйста, настройте ваш Google Maps API ключ.
          </p>
          <div className="mt-3 flex space-x-3">
            <Link
              to="/settings"
              className={clsx(
                'inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md transition-colors',
                isDark
                  ? 'text-orange-200 bg-orange-800/30 hover:bg-orange-700/40'
                  : 'text-orange-700 bg-orange-100 hover:bg-orange-200'
              )}
            >
              Настроить API ключ
            </Link>
            <button
              onClick={() => setIsDismissed(true)}
              className={clsx(
                'inline-flex items-center px-3 py-2 border text-sm leading-4 font-medium rounded-md transition-colors',
                isDark
                  ? 'border-orange-600 text-orange-200 bg-orange-900/30 hover:bg-orange-800/40'
                  : 'border-orange-300 text-orange-700 bg-white hover:bg-orange-50'
              )}
            >
              Закрыть
            </button>
          </div>
        </div>
        <button
          onClick={() => setIsDismissed(true)}
          className={clsx(
            'ml-4 flex-shrink-0 p-1 rounded-md transition-colors',
            isDark 
              ? 'text-orange-400 hover:text-orange-300 hover:bg-orange-800/30'
              : 'text-orange-400 hover:text-orange-500 hover:bg-orange-100'
          )}
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

export default ApiKeyNotification




