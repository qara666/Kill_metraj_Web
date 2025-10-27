import React from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface ExcelDataPreviewProps {
  data: any
  isVisible: boolean
  onClose: () => void
  onConfirm: () => void
}

export const ExcelDataPreview: React.FC<ExcelDataPreviewProps> = ({
  data,
  isVisible,
  onClose,
  onConfirm
}) => {
  if (!isVisible) return null

  const getDataSummary = () => {
    if (!data) return { orders: 0, couriers: 0, routes: 0 }
    
    return {
      orders: data.orders?.length || 0,
      couriers: data.couriers?.length || 0,
      routes: data.routes?.length || 0
    }
  }

  const summary = getDataSummary()

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Предварительный просмотр данных
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
        
        <div className="space-y-4">
          {/* Сводка данных */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {summary.orders}
              </div>
              <div className="text-sm text-blue-800 dark:text-blue-300">
                Заказы
              </div>
            </div>
            
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {summary.couriers}
              </div>
              <div className="text-sm text-green-800 dark:text-green-300">
                Курьеры
              </div>
            </div>
            
            <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {summary.routes}
              </div>
              <div className="text-sm text-purple-800 dark:text-purple-300">
                Маршруты
              </div>
            </div>
          </div>

          {/* Детали данных */}
          {data && (
            <div className="max-h-60 overflow-y-auto">
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                Детали данных:
              </h4>
              <pre className="bg-gray-100 dark:bg-gray-700 p-3 rounded text-sm overflow-x-auto">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Кнопки действий */}
        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Подтвердить импорт
          </button>
        </div>
      </div>
    </div>
  )
}
