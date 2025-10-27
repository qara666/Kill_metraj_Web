import React from 'react'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import { clsx } from 'clsx'

interface ExcelDataPreviewProps {
  data: any
  isVisible: boolean
  onClose: () => void
  onConfirm: () => void
}

export const ExcelDataPreview: React.FC<ExcelDataPreviewProps> = ({ data, isVisible, onClose, onConfirm }) => {
  if (!isVisible) return null

  const orders = data?.orders || []
  const errors = data?.errors || []
  const summary = data?.summary || {}

  const isDark = false

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={clsx(
        'rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col',
        isDark ? 'bg-gray-800' : 'bg-white'
      )}>
        {/* Header */}
        <div className={clsx(
          'px-6 py-4 border-b flex items-center justify-between',
          isDark ? 'border-gray-700' : 'border-gray-200'
        )}>
          <div className="flex items-center space-x-3">
            <CheckCircleIcon className={clsx('h-8 w-8', isDark ? 'text-green-400' : 'text-green-600')} />
            <h2 className={clsx('text-2xl font-bold', isDark ? 'text-gray-100' : 'text-gray-900')}>
              Результаты обработки файла
            </h2>
          </div>
          <button
            onClick={onClose}
            className={clsx(
              'text-gray-400 hover:text-gray-600',
              isDark ? 'hover:text-gray-300' : ''
            )}
          >
            <XCircleIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Orders */}
            <div className={clsx(
              'rounded-lg p-4 border',
              isDark ? 'bg-blue-900/20 border-blue-700' : 'bg-blue-50 border-blue-200'
            )}>
              <div className="flex items-center space-x-2 mb-2">
                <CheckCircleIcon className={clsx('h-6 w-6', isDark ? 'text-blue-400' : 'text-blue-600')} />
                <h3 className={clsx('font-semibold', isDark ? 'text-gray-100' : 'text-gray-900')}>
                  Заказов
                </h3>
              </div>
              <p className={clsx('text-2xl font-bold', isDark ? 'text-gray-100' : 'text-gray-900')}>
                {summary.orders || 0}
              </p>
            </div>

            {/* Couriers */}
            <div className={clsx(
              'rounded-lg p-4 border',
              isDark ? 'bg-green-900/20 border-green-700' : 'bg-green-50 border-green-200'
            )}>
              <div className="flex items-center space-x-2 mb-2">
                <CheckCircleIcon className={clsx('h-6 w-6', isDark ? 'text-green-400' : 'text-green-600')} />
                <h3 className={clsx('font-semibold', isDark ? 'text-gray-100' : 'text-gray-900')}>
                  Курьеров
                </h3>
              </div>
              <p className={clsx('text-2xl font-bold', isDark ? 'text-gray-100' : 'text-gray-900')}>
                {summary.couriers || 0}
              </p>
            </div>

            {/* Errors */}
            <div className={clsx(
              'rounded-lg p-4 border',
              errors.length > 0
                ? isDark ? 'bg-red-900/20 border-red-700' : 'bg-red-50 border-red-200'
                : isDark ? 'bg-green-900/20 border-green-700' : 'bg-green-50 border-green-200'
            )}>
              <div className="flex items-center space-x-2 mb-2">
                {errors.length > 0 ? (
                  <XCircleIcon className={clsx('h-6 w-6', isDark ? 'text-red-400' : 'text-red-600')} />
                ) : (
                  <CheckCircleIcon className={clsx('h-6 w-6', isDark ? 'text-green-400' : 'text-green-600')} />
                )}
                <h3 className={clsx('font-semibold', isDark ? 'text-gray-100' : 'text-gray-900')}>
                  Ошибок
                </h3>
              </div>
              <p className={clsx('text-2xl font-bold', isDark ? 'text-gray-100' : 'text-gray-900')}>
                {errors.length}
              </p>
            </div>
          </div>

          {/* Preview Data */}
          {orders.length > 0 && (
            <div>
              <h3 className={clsx('font-semibold mb-3', isDark ? 'text-gray-100' : 'text-gray-900')}>
                Пример заказов (первые 5):
              </h3>
              <div className={clsx(
                'rounded-lg overflow-hidden border',
                isDark ? 'border-gray-700' : 'border-gray-200'
              )}>
                <table className="w-full">
                  <thead className={clsx('border-b', isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-100 border-gray-200')}>
                    <tr>
                      <th className={clsx('px-4 py-2 text-left text-sm font-semibold', isDark ? 'text-gray-300' : 'text-gray-700')}>
                        № Заказа
                      </th>
                      <th className={clsx('px-4 py-2 text-left text-sm font-semibold', isDark ? 'text-gray-300' : 'text-gray-700')}>
                        Адрес
                      </th>
                      <th className={clsx('px-4 py-2 text-left text-sm font-semibold', isDark ? 'text-gray-300' : 'text-gray-700')}>
                        Сумма
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.slice(0, 5).map((order: any, index: number) => (
                      <tr key={index} className={clsx('border-b', isDark ? 'border-gray-700' : 'border-gray-100')}>
                        <td className={clsx('px-4 py-2 text-sm', isDark ? 'text-gray-300' : 'text-gray-900')}>
                          {order.orderNumber}
                        </td>
                        <td className={clsx('px-4 py-2 text-sm', isDark ? 'text-gray-300' : 'text-gray-900')}>
                          {order.address}
                        </td>
                        <td className={clsx('px-4 py-2 text-sm', isDark ? 'text-gray-300' : 'text-gray-900')}>
                          {order.amount} ₴
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Errors */}
          {errors.length > 0 && errors.length < 10 && (
            <div>
              <h3 className={clsx('font-semibold mb-3 flex items-center space-x-2', isDark ? 'text-red-400' : 'text-red-600')}>
                <XCircleIcon className="h-5 w-5" />
                <span>Ошибки обработки:</span>
              </h3>
              <div className={clsx(
                'rounded-lg p-4 max-h-48 overflow-y-auto',
                isDark ? 'bg-red-900/20 border border-red-700' : 'bg-red-50 border border-red-200'
              )}>
                {errors.map((error: any, index: number) => (
                  <div key={index} className="mb-2 text-sm">
                    <span className={isDark ? 'text-red-400' : 'text-red-600'}>
                      Строка {error.row}: {error.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={clsx(
          'px-6 py-4 border-t flex items-center justify-end space-x-3',
          isDark ? 'border-gray-700' : 'border-gray-200'
        )}>
          <button
            onClick={onClose}
            className={clsx(
              'px-6 py-2 rounded-lg font-medium transition-colors',
              isDark
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            Закрыть
          </button>
          <button
            onClick={onConfirm}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Сохранить данные
          </button>
        </div>
      </div>
    </div>
  )
}

