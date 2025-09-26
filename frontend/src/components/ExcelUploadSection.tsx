import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { toast } from 'react-hot-toast'
import { 
  DocumentArrowUpIcon, 
  DocumentTextIcon,
  CloudArrowUpIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import { LoadingSpinner } from './LoadingSpinner'

interface ExcelUploadSectionProps {
  onFileSelect: (file: File) => void
  onProcessFile: () => void
  selectedFile: File | null
  isProcessing: boolean
  processedData: any
  onClearResults: () => void
}

export const ExcelUploadSection: React.FC<ExcelUploadSectionProps> = ({
  onFileSelect,
  onProcessFile,
  selectedFile,
  isProcessing,
  processedData,
  onClearResults
}) => {
  const [showInstructions, setShowInstructions] = useState(false)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (file) {
      // Проверяем тип файла
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'text/csv' // .csv
      ]
      
      if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
        toast.error('Пожалуйста, выберите файл Excel (.xlsx, .xls) или CSV')
        return
      }
      
      // Проверяем размер файла (максимум 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Размер файла не должен превышать 10MB')
        return
      }
      
      onFileSelect(file)
      toast.success(`Файл "${file.name}" выбран для обработки`)
    }
  }, [onFileSelect])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv']
    },
    multiple: false
  })

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getFileIcon = (fileName: string) => {
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      return <DocumentTextIcon className="h-8 w-8 text-green-600" />
    } else if (fileName.endsWith('.csv')) {
      return <DocumentTextIcon className="h-8 w-8 text-blue-600" />
    }
    return <DocumentTextIcon className="h-8 w-8 text-gray-600" />
  }

  return (
    <div className="space-y-6">
      {/* Заголовок секции */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 flex items-center">
              <DocumentArrowUpIcon className="h-6 w-6 mr-3 text-blue-600" />
              Загрузка Excel файлов
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Загрузите Excel файл с заказами для автоматической обработки и создания маршрутов
            </p>
          </div>
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="btn-outline flex items-center"
          >
            <InformationCircleIcon className="h-4 w-4 mr-2" />
            Инструкции
          </button>
        </div>
      </div>

      {/* Инструкции */}
      {showInstructions && (
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-medium text-blue-900 mb-4">
                Как подготовить Excel файл
              </h3>
              <div className="text-sm text-blue-800 space-y-3">
                <div>
                  <h4 className="font-medium">Обязательные колонки:</h4>
                  <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                    <li><strong>Адрес</strong> - адрес доставки (обязательно)</li>
                    <li><strong>Номер заказа</strong> - уникальный номер заказа</li>
                    <li><strong>Курьер</strong> - имя курьера</li>
                    <li><strong>Способ оплаты</strong> - наличные, карта, безнал</li>
                    <li><strong>Сумма</strong> - сумма заказа</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium">Дополнительные колонки:</h4>
                  <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                    <li><strong>Телефон</strong> - телефон клиента</li>
                    <li><strong>Имя клиента</strong> - имя заказчика</li>
                    <li><strong>Комментарий</strong> - комментарий к заказу</li>
                    <li><strong>Зона доставки</strong> - зона доставки</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium">Поддерживаемые форматы:</h4>
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li>Excel файлы (.xlsx, .xls)</li>
                    <li>CSV файлы (.csv)</li>
                    <li>Максимальный размер: 10MB</li>
                  </ul>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowInstructions(false)}
              className="ml-4 text-blue-400 hover:text-blue-600"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Область загрузки файла */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-blue-400 bg-blue-50'
              : selectedFile
              ? 'border-green-400 bg-green-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <input {...getInputProps()} />
          
          {selectedFile ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                {getFileIcon(selectedFile.name)}
              </div>
              <div>
                <p className="text-lg font-medium text-gray-900">{selectedFile.name}</p>
                <p className="text-sm text-gray-500">{formatFileSize(selectedFile.size)}</p>
              </div>
              <div className="flex items-center justify-center text-green-600">
                <CheckCircleIcon className="h-5 w-5 mr-2" />
                <span className="text-sm font-medium">Файл выбран</span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                <CloudArrowUpIcon className="h-12 w-12 text-gray-400" />
              </div>
              <div>
                <p className="text-lg font-medium text-gray-900">
                  {isDragActive ? 'Отпустите файл здесь' : 'Перетащите файл сюда или нажмите для выбора'}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Поддерживаются файлы Excel (.xlsx, .xls) и CSV (.csv)
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Кнопки действий */}
        {selectedFile && (
          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={onProcessFile}
                disabled={isProcessing}
                className="btn-primary flex items-center"
              >
                {isProcessing ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span className="ml-2">Обработка...</span>
                  </>
                ) : (
                  <>
                    <DocumentArrowUpIcon className="h-4 w-4 mr-2" />
                    Обработать файл
                  </>
                )}
              </button>
              
              <button
                onClick={() => {
                  onFileSelect(null as any)
                  onClearResults()
                }}
                className="btn-outline"
              >
                <XMarkIcon className="h-4 w-4 mr-2" />
                Очистить
              </button>
            </div>
            
            <div className="text-sm text-gray-500">
              Готов к обработке
            </div>
          </div>
        )}
      </div>

      {/* Результаты обработки */}
      {processedData && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <CheckCircleIcon className="h-5 w-5 mr-2 text-green-600" />
              Результаты обработки
            </h3>
            <button
              onClick={onClearResults}
              className="text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center">
                <DocumentTextIcon className="h-5 w-5 text-blue-600 mr-2" />
                <div>
                  <p className="text-sm font-medium text-blue-800">Заказы</p>
                  <p className="text-2xl font-bold text-blue-900">
                    {processedData.orders?.length || 0}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <div className="flex items-center">
                <UserGroupIcon className="h-5 w-5 text-green-600 mr-2" />
                <div>
                  <p className="text-sm font-medium text-green-800">Курьеры</p>
                  <p className="text-2xl font-bold text-green-900">
                    {processedData.couriers?.length || 0}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <div className="flex items-center">
                <CreditCardIcon className="h-5 w-5 text-purple-600 mr-2" />
                <div>
                  <p className="text-sm font-medium text-purple-800">Способы оплаты</p>
                  <p className="text-2xl font-bold text-purple-900">
                    {processedData.paymentMethods?.length || 0}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
              <div className="flex items-center">
                <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 mr-2" />
                <div>
                  <p className="text-sm font-medium text-yellow-800">Ошибки</p>
                  <p className="text-2xl font-bold text-yellow-900">
                    {processedData.errors?.length || 0}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Импорты для иконок
import { UserGroupIcon, CreditCardIcon } from '@heroicons/react/24/outline'
