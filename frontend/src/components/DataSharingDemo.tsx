import React, { useState } from 'react'
import { 
  ShareIcon, 
  LinkIcon, 
  ClipboardDocumentIcon,
  CheckIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import { clsx } from 'clsx'
import { useTheme } from '../contexts/ThemeContext'
import { useDataSharing } from '../utils/dataSharing'
import { useExcelData } from '../contexts/ExcelDataContext'
import toast from 'react-hot-toast'

export const DataSharingDemo: React.FC = () => {
  const [demoUrl, setDemoUrl] = useState('')
  const [copied, setCopied] = useState(false)
  
  const { isDark } = useTheme()
  const { shareData, copyToClipboard } = useDataSharing()
  const { excelData, routes } = useExcelData()
  
  // Безопасные значения по умолчанию
  const safeRoutes = routes || []

  const generateDemoData = () => {
    const demoExcelData = {
      orders: [
        {
          id: 'demo_1',
          orderNumber: '12345',
          address: 'Киев, ул. Крещатик, 1',
          courier: 'Иван Петров',
          amount: 150,
          phone: '+380501234567',
          customerName: 'Анна Сидорова',
          plannedTime: '10:00'
        },
        {
          id: 'demo_2',
          orderNumber: '12346',
          address: 'Киев, ул. Хрещатик, 2',
          courier: 'Мария Козлова',
          amount: 200,
          phone: '+380501234568',
          customerName: 'Петр Иванов',
          plannedTime: '11:00'
        }
      ],
      couriers: [
        { name: 'Иван Петров', vehicle: 'car' },
        { name: 'Мария Козлова', vehicle: 'motorcycle' }
      ],
      paymentMethods: ['Наличные', 'Карта'],
      addresses: [],
      routes: [],
      errors: [],
      warnings: [],
      statistics: { totalOrders: 2, totalAmount: 350 },
      summary: { processed: 2, errors: 0 }
    }

    const demoRoutes = [
      {
        id: 'demo_route_1',
        courier: 'Иван Петров',
        orders: [demoExcelData.orders[0]],
        totalDistance: 5.2,
        totalDuration: 15,
        startAddress: 'Склад, ул. Складская, 1',
        endAddress: 'Киев, ул. Крещатик, 1',
        isOptimized: true
      },
      {
        id: 'demo_route_2',
        courier: 'Мария Козлова',
        orders: [demoExcelData.orders[1]],
        totalDistance: 3.8,
        totalDuration: 12,
        startAddress: 'Склад, ул. Складская, 1',
        endAddress: 'Киев, ул. Хрещатик, 2',
        isOptimized: true
      }
    ]

    return { demoExcelData, demoRoutes }
  }

  const handleGenerateDemo = () => {
    try {
      const { demoExcelData, demoRoutes } = generateDemoData()
      const url = shareData(demoExcelData, demoRoutes)
      setDemoUrl(url)
      toast.success('Демо-ссылка создана!')
    } catch (error) {
      console.error('Ошибка создания демо-ссылки:', error)
      toast.error('Ошибка создания демо-ссылки')
    }
  }

  const handleCopyDemo = async () => {
    try {
      const success = await copyToClipboard(demoUrl)
      if (success) {
        setCopied(true)
        toast.success('Демо-ссылка скопирована!')
        setTimeout(() => setCopied(false), 2000)
      } else {
        toast.error('Не удалось скопировать ссылку')
      }
    } catch (error) {
      console.error('Ошибка копирования:', error)
      toast.error('Ошибка копирования ссылки')
    }
  }

  const hasData = excelData && safeRoutes.length > 0

  return (
    <div className={clsx(
      'rounded-lg border p-6',
      isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
    )}>
      <div className="flex items-center space-x-2 mb-4">
        <ShareIcon className={clsx(
          'h-5 w-5',
          isDark ? 'text-blue-400' : 'text-blue-600'
        )} />
        <h3 className={clsx(
          'text-lg font-semibold',
          isDark ? 'text-gray-100' : 'text-gray-900'
        )}>
          Демонстрация обмена данными
        </h3>
      </div>

      <div className="space-y-4">
        {/* Информация о текущих данных */}
        <div className={clsx(
          'p-4 rounded-lg border',
          isDark ? 'bg-blue-600/10 border-blue-500/30' : 'bg-blue-50 border-blue-200'
        )}>
          <div className="flex items-start space-x-3">
            <InformationCircleIcon className={clsx(
              'h-5 w-5 mt-0.5 flex-shrink-0',
              isDark ? 'text-blue-400' : 'text-blue-600'
            )} />
            <div>
              <p className={clsx(
                'text-sm font-medium',
                isDark ? 'text-blue-300' : 'text-blue-800'
              )}>
                Текущие данные
              </p>
              <p className={clsx(
                'text-xs mt-1',
                isDark ? 'text-blue-400' : 'text-blue-600'
              )}>
                {hasData 
                  ? `Загружено: ${excelData?.orders?.length || 0} заказов, ${safeRoutes.length} маршрутов`
                  : 'Нет данных для обмена. Загрузите Excel файл и создайте маршруты.'
                }
              </p>
            </div>
          </div>
        </div>

        {/* Кнопки действий */}
        <div className="flex space-x-3">
          <button
            onClick={handleGenerateDemo}
            className={clsx(
              'flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors',
              isDark 
                ? 'bg-green-600 text-white hover:bg-green-700' 
                : 'bg-green-600 text-white hover:bg-green-700'
            )}
          >
            <LinkIcon className="h-4 w-4" />
            <span>Создать демо-ссылку</span>
          </button>

          {hasData && (
            <button
              onClick={() => {
                if (excelData && safeRoutes.length > 0) {
                  const url = shareData(excelData, safeRoutes)
                  setDemoUrl(url)
                  toast.success('Ссылка с вашими данными создана!')
                }
              }}
              className={clsx(
                'flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors',
                isDark 
                  ? 'bg-blue-600 text-white hover:bg-blue-700' 
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              )}
            >
              <ShareIcon className="h-4 w-4" />
              <span>Создать ссылку с моими данными</span>
            </button>
          )}
        </div>

        {/* Демо-ссылка */}
        {demoUrl && (
          <div>
            <label className={clsx(
              'block text-sm font-medium mb-2',
              isDark ? 'text-gray-300' : 'text-gray-700'
            )}>
              Ссылка для обмена:
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={demoUrl}
                readOnly
                className={clsx(
                  'flex-1 px-3 py-2 border rounded-lg text-sm font-mono',
                  isDark 
                    ? 'bg-gray-700 border-gray-600 text-gray-100' 
                    : 'bg-gray-50 border-gray-300 text-gray-900'
                )}
              />
              <button
                onClick={handleCopyDemo}
                className={clsx(
                  'px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2',
                  copied
                    ? isDark 
                      ? 'bg-green-600 text-white' 
                      : 'bg-green-600 text-white'
                    : isDark 
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                )}
              >
                {copied ? (
                  <>
                    <CheckIcon className="h-4 w-4" />
                    <span>Скопировано</span>
                  </>
                ) : (
                  <>
                    <ClipboardDocumentIcon className="h-4 w-4" />
                    <span>Копировать</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Инструкции */}
        <div className={clsx(
          'p-4 rounded-lg border',
          isDark ? 'bg-yellow-600/10 border-yellow-500/30' : 'bg-yellow-50 border-yellow-200'
        )}>
          <div className="flex items-start space-x-3">
            <ExclamationTriangleIcon className={clsx(
              'h-5 w-5 mt-0.5 flex-shrink-0',
              isDark ? 'text-yellow-400' : 'text-yellow-600'
            )} />
            <div>
              <p className={clsx(
                'text-sm font-medium',
                isDark ? 'text-yellow-300' : 'text-yellow-800'
              )}>
                Как использовать:
              </p>
              <ul className={clsx(
                'text-xs mt-2 space-y-1 list-disc list-inside',
                isDark ? 'text-yellow-400' : 'text-yellow-700'
              )}>
                <li>Создайте демо-ссылку или ссылку с вашими данными</li>
                <li>Скопируйте ссылку и отправьте коллеге</li>
                <li>Коллега нажимает "Импорт" и вставляет ссылку</li>
                <li>Данные автоматически загрузятся и синхронизируются</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}














