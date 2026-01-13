import React from 'react'
import { CheckCircleIcon, XCircleIcon, UsersIcon, ClipboardDocumentListIcon, BanknotesIcon, ShieldCheckIcon, ArrowDownCircleIcon } from '@heroicons/react/24/outline'
import { clsx } from 'clsx'

interface ExcelDataPreviewProps {
  data: any
  isVisible: boolean
  onClose: () => void
  onConfirm: () => void
  isDark?: boolean
}

export const ExcelDataPreview: React.FC<ExcelDataPreviewProps> = ({ data, isVisible, onClose, onConfirm, isDark = false }) => {
  if (!isVisible) return null

  const orders = data?.data?.orders || data?.orders || []
  const couriers = data?.data?.couriers || data?.couriers || []
  const paymentMethods = data?.data?.paymentMethods || data?.paymentMethods || []
  const errors = data?.data?.errors || data?.errors || []
  const summary = data?.data?.summary || data?.summary || {}

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
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Orders */}
            <div className={clsx(
              'rounded-lg p-4 border',
              orders.length > 0
                ? (isDark ? 'bg-blue-900/20 border-blue-700' : 'bg-blue-50 border-blue-200')
                : (isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-100 border-gray-200')
            )}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <ClipboardDocumentListIcon className={clsx('h-6 w-6', isDark ? 'text-blue-400' : 'text-blue-600')} />
                  <h3 className={clsx('font-semibold', isDark ? 'text-gray-100' : 'text-gray-900')}>
                    Заказы
                  </h3>
                </div>
                <ShieldCheckIcon className={clsx('h-5 w-5', isDark ? 'text-blue-300' : 'text-blue-500')} title="Проверено" />
              </div>
              <p className={clsx('text-3xl font-bold', isDark ? 'text-gray-100' : 'text-gray-900')}>
                {orders.length}
              </p>
              {summary.totalRows && (
                <p className={clsx('mt-1 text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>Строк обработано: {summary.totalRows}</p>
              )}
            </div>

            {/* Couriers */}
            <div className={clsx(
              'rounded-lg p-4 border',
              couriers.length > 0
                ? (isDark ? 'bg-green-900/20 border-green-700' : 'bg-green-50 border-green-200')
                : (isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-100 border-gray-200')
            )}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <UsersIcon className={clsx('h-6 w-6', isDark ? 'text-green-400' : 'text-green-600')} />
                  <h3 className={clsx('font-semibold', isDark ? 'text-gray-100' : 'text-gray-900')}>
                    Курьеры
                  </h3>
                </div>
                <ShieldCheckIcon className={clsx('h-5 w-5', isDark ? 'text-green-300' : 'text-green-500')} />
              </div>
              <p className={clsx('text-3xl font-bold', isDark ? 'text-gray-100' : 'text-gray-900')}>
                {couriers.length}
              </p>
            </div>

            {/* Payment Methods */}
            <div className={clsx(
              'rounded-lg p-4 border',
              paymentMethods.length > 0
                ? (isDark ? 'bg-purple-900/20 border-purple-700' : 'bg-purple-50 border-purple-200')
                : (isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-100 border-gray-200')
            )}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <BanknotesIcon className={clsx('h-6 w-6', isDark ? 'text-purple-400' : 'text-purple-600')} />
                  <h3 className={clsx('font-semibold', isDark ? 'text-gray-100' : 'text-gray-900')}>
                    Способы оплаты
                  </h3>
                </div>
                <ShieldCheckIcon className={clsx('h-5 w-5', isDark ? 'text-purple-300' : 'text-purple-500')} />
              </div>
              <p className={clsx('text-3xl font-bold', isDark ? 'text-gray-100' : 'text-gray-900')}>
                {paymentMethods.length}
              </p>
            </div>

            {/* Errors */}
            <div className={clsx(
              'rounded-lg p-4 border',
              errors.length > 0
                ? (isDark ? 'bg-red-900/20 border-red-700' : 'bg-red-50 border-red-200')
                : (isDark ? 'bg-green-900/20 border-green-700' : 'bg-green-50 border-green-200')
            )}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  {errors.length > 0 ? (
                    <XCircleIcon className={clsx('h-6 w-6', isDark ? 'text-red-400' : 'text-red-600')} />
                  ) : (
                    <CheckCircleIcon className={clsx('h-6 w-6', isDark ? 'text-green-400' : 'text-green-600')} />
                  )}
                  <h3 className={clsx('font-semibold', isDark ? 'text-gray-100' : 'text-gray-900')}>
                    Ошибок
                  </h3>
                </div>
                <ShieldCheckIcon className={clsx('h-5 w-5', isDark ? 'text-green-300' : 'text-green-500')} />
              </div>
              <p className={clsx('text-3xl font-bold', isDark ? 'text-gray-100' : 'text-gray-900')}>
                {errors.length}
              </p>
            </div>
          </div>

          {/* Total Rows */}
          {summary.totalRows > 0 && (
            <div className={clsx(
              'rounded-lg p-4 border',
              isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
            )}>
              <p className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>
                Всего обработано строк: <span className="font-bold">{summary.totalRows}</span>
              </p>
            </div>
          )}

          {/* Errors List */}
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
                      Строка {typeof error.row === 'object' ? JSON.stringify(error.row) : (error.row || 'N/A')}: {typeof error.message === 'object' ? JSON.stringify(error.message) : (error.message || 'Неизвестная ошибка')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA helpers */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className={clsx('p-3 rounded-lg flex items-center space-x-3', isDark ? 'bg-gray-800' : 'bg-gray-50')}>
              <ArrowDownCircleIcon className={clsx('h-5 w-5', isDark ? 'text-gray-400' : 'text-gray-500')} />
              <span className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>Данные будут сохранены локально и доступны в «Курьеры/Маршруты»</span>
            </div>
            <div className={clsx('p-3 rounded-lg flex items-center space-x-3', isDark ? 'bg-gray-800' : 'bg-gray-50')}>
              <ShieldCheckIcon className={clsx('h-5 w-5', isDark ? 'text-gray-400' : 'text-gray-500')} />
              <span className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>Адреса проходят базовую проверку на аномалии</span>
            </div>
            <div className={clsx('p-3 rounded-lg flex items-center space-x-3', isDark ? 'bg-gray-800' : 'bg-gray-50')}>
              <BanknotesIcon className={clsx('h-5 w-5', isDark ? 'text-gray-400' : 'text-gray-500')} />
              <span className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>Методы оплаты автоматически агрегируются в отчете</span>
            </div>
          </div>
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

