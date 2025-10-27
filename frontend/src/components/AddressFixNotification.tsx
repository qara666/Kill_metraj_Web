import React from 'react'
import { 
  CheckCircleIcon, 
  ExclamationTriangleIcon, 
  XCircleIcon
} from '@heroicons/react/24/outline'
import { clsx } from 'clsx'
import { AddressFixResult } from '../services/addressAutoFix'

interface AddressFixNotificationProps {
  fixResults: Map<string, AddressFixResult>
  isVisible: boolean
  onClose: () => void
  isDark?: boolean
}

export const AddressFixNotification: React.FC<AddressFixNotificationProps> = ({
  fixResults,
  isVisible,
  onClose,
  isDark = false
}) => {
  if (!isVisible || fixResults.size === 0) return null

  const results = Array.from(fixResults.values())
  const fixedCount = results.filter(r => r.confidence >= 0.7).length
  const errorCount = results.filter(r => r.errors.length > 0).length
  const warningCount = results.filter(r => r.warnings.length > 0).length

  return (
    <div className={clsx(
      'fixed top-4 right-4 z-50 max-w-md',
      'transform transition-all duration-300 ease-in-out',
      isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
    )}>
      <div className={clsx(
        'rounded-lg shadow-lg border-l-4 p-4',
        isDark ? 'bg-gray-800 border-blue-500' : 'bg-white border-blue-500'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <CheckCircleIcon className={clsx(
              'h-5 w-5',
              isDark ? 'text-green-400' : 'text-green-600'
            )} />
            <h3 className={clsx(
              'font-semibold text-sm',
              isDark ? 'text-gray-100' : 'text-gray-900'
            )}>
              Автоматическое исправление адресов
            </h3>
          </div>
          <button
            onClick={onClose}
            className={clsx(
              'p-1 rounded transition-colors',
              isDark 
                ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' 
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            )}
          >
            <XCircleIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Summary */}
        <div className="space-y-2 mb-3">
          <div className={clsx(
            'text-sm',
            isDark ? 'text-gray-300' : 'text-gray-700'
          )}>
            ✅ <strong>Исправлено:</strong> {fixedCount} адресов
          </div>
          
          {warningCount > 0 && (
            <div className={clsx(
              'text-sm',
              isDark ? 'text-yellow-300' : 'text-yellow-700'
            )}>
              ⚠️ <strong>Предупреждения:</strong> {warningCount} адресов
            </div>
          )}
          
          {errorCount > 0 && (
            <div className={clsx(
              'text-sm',
              isDark ? 'text-red-300' : 'text-red-700'
            )}>
              ❌ <strong>Ошибки:</strong> {errorCount} адресов требуют ручного исправления
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {results.map((result, index) => {
            if (result.confidence < 0.7 && result.errors.length === 0) return null

            return (
              <div key={index} className={clsx(
                'p-2 rounded text-xs',
                isDark ? 'bg-gray-700/50' : 'bg-gray-50'
              )}>
                <div className="flex items-start space-x-2">
                  {result.confidence >= 0.7 ? (
                    <CheckCircleIcon className={clsx(
                      'h-4 w-4 mt-0.5 flex-shrink-0',
                      isDark ? 'text-green-400' : 'text-green-600'
                    )} />
                  ) : result.errors.length > 0 ? (
                    <XCircleIcon className={clsx(
                      'h-4 w-4 mt-0.5 flex-shrink-0',
                      isDark ? 'text-red-400' : 'text-red-600'
                    )} />
                  ) : (
                    <ExclamationTriangleIcon className={clsx(
                      'h-4 w-4 mt-0.5 flex-shrink-0',
                      isDark ? 'text-yellow-400' : 'text-yellow-600'
                    )} />
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className={clsx(
                      'font-medium truncate',
                      isDark ? 'text-gray-200' : 'text-gray-800'
                    )}>
                      {result.originalAddress}
                    </div>
                    
                    {result.confidence >= 0.7 && result.fixedAddress !== result.originalAddress && (
                      <div className={clsx(
                        'text-xs mt-1',
                        isDark ? 'text-green-300' : 'text-green-600'
                      )}>
                        → {result.fixedAddress}
                      </div>
                    )}
                    
                    {result.warnings.length > 0 && (
                      <div className={clsx(
                        'text-xs mt-1',
                        isDark ? 'text-yellow-300' : 'text-yellow-600'
                      )}>
                        {result.warnings[0]}
                      </div>
                    )}
                    
                    {result.errors.length > 0 && (
                      <div className={clsx(
                        'text-xs mt-1',
                        isDark ? 'text-red-300' : 'text-red-600'
                      )}>
                        {result.errors[0]}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Actions */}
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
          <div className={clsx(
            'text-xs',
            isDark ? 'text-gray-400' : 'text-gray-500'
          )}>
            💡 Адреса с низкой уверенностью можно исправить вручную, нажав на карандаш
          </div>
        </div>
      </div>
    </div>
  )
}
