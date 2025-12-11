import React, { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { toast } from 'react-hot-toast'
import { 
  DocumentArrowUpIcon, 
  DocumentTextIcon,
  CloudArrowUpIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  UserGroupIcon,
  CreditCardIcon,
  LinkIcon
} from '@heroicons/react/24/outline'
import { LoadingSpinner } from './LoadingSpinner'
import { clsx } from 'clsx'
import { useTheme } from '../contexts/ThemeContext'
import { processHtmlUrl, isValidUrl } from '../utils/htmlProcessor'

interface ExcelUploadSectionProps {
  onFileSelect: (file: File) => void
  onProcessFile: () => void
  selectedFile: File | null
  isProcessing: boolean
  processedData: any
  onClearResults: () => void
  onHtmlDataLoad?: (data: any) => void
}

export const ExcelUploadSection: React.FC<ExcelUploadSectionProps> = ({
  onFileSelect,
  onProcessFile,
  selectedFile,
  isProcessing,
  processedData,
  onClearResults,
  onHtmlDataLoad
}) => {
  const { isDark } = useTheme()
  const [htmlUrl, setHtmlUrl] = useState<string>('')
  const [isProcessingHtml, setIsProcessingHtml] = useState<boolean>(false)

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
      return <DocumentTextIcon className={clsx('h-8 w-8', isDark ? 'text-green-400' : 'text-green-600')} />
    } else if (fileName.endsWith('.csv')) {
      return <DocumentTextIcon className={clsx('h-8 w-8', isDark ? 'text-blue-400' : 'text-blue-600')} />
    }
    return <DocumentTextIcon className={clsx('h-8 w-8', isDark ? 'text-gray-400' : 'text-gray-600')} />
  }

  const handleProcessHtml = useCallback(async () => {
    if (!htmlUrl.trim()) {
      toast.error('Введите URL HTML страницы')
      return
    }

    if (!isValidUrl(htmlUrl.trim())) {
      toast.error('Неверный формат URL. Используйте http:// или https://')
      return
    }

    setIsProcessingHtml(true)
    try {
      const data = await processHtmlUrl(htmlUrl.trim())
      if (onHtmlDataLoad) {
        onHtmlDataLoad(data)
      }
      toast.success(`Успешно загружено ${data.orders?.length || 0} заказов из HTML`)
      setHtmlUrl('')
    } catch (error: any) {
      console.error('Ошибка обработки HTML:', error)
      toast.error(error.message || 'Ошибка при обработке HTML страницы')
    } finally {
      setIsProcessingHtml(false)
    }
  }, [htmlUrl, onHtmlDataLoad])

  return (
    <div className="space-y-6">
      {/* Заголовок секции */}
      <div className={clsx(
        'rounded-3xl p-8 shadow-2xl border-2 overflow-hidden relative',
        isDark 
          ? 'bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 border-gray-700' 
          : 'bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border-blue-200'
      )}>
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-pink-600/10 opacity-50"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={clsx(
                'p-4 rounded-2xl shadow-lg',
                isDark 
                  ? 'bg-gradient-to-br from-blue-600 to-purple-600' 
                  : 'bg-gradient-to-br from-blue-500 to-indigo-600'
              )}>
                <DocumentArrowUpIcon className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className={clsx(
                  'text-3xl font-bold mb-1 bg-gradient-to-r bg-clip-text text-transparent',
                  isDark 
                    ? 'from-blue-400 to-purple-400' 
                    : 'from-blue-600 to-indigo-600'
                )}>
                  Загрузка Excel файлов
                </h2>
                <p className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>
                  Загрузите Excel файл с заказами для автоматической обработки и создания маршрутов
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Область загрузки файла */}
      <div className={clsx(
        'rounded-lg shadow-sm border p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <div
          {...getRootProps()}
          className={clsx(
            'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
            isDragActive
              ? isDark 
                ? 'border-blue-400 bg-blue-900/20' 
                : 'border-blue-400 bg-blue-50'
              : selectedFile
              ? isDark 
                ? 'border-green-400 bg-green-900/20' 
                : 'border-green-400 bg-green-50'
              : isDark 
                ? 'border-gray-600 hover:border-gray-500' 
                : 'border-gray-300 hover:border-gray-400'
          )}
        >
          <input {...getInputProps()} />
          
          {selectedFile ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                {getFileIcon(selectedFile.name)}
              </div>
              <div>
                <p className={clsx(
                  'text-lg font-medium',
                  isDark ? 'text-gray-100' : 'text-gray-900'
                )}>{selectedFile.name}</p>
                <p className={clsx(
                  'text-sm',
                  isDark ? 'text-gray-400' : 'text-gray-500'
                )}>{formatFileSize(selectedFile.size)}</p>
              </div>
              <div className={clsx(
                'flex items-center justify-center',
                isDark ? 'text-green-400' : 'text-green-600'
              )}>
                <CheckCircleIcon className="h-5 w-5 mr-2" />
                <span className="text-sm font-medium">Файл выбран</span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                <CloudArrowUpIcon className={clsx('h-12 w-12', isDark ? 'text-gray-500' : 'text-gray-400')} />
              </div>
              <div>
                <p className={clsx(
                  'text-lg font-medium',
                  isDark ? 'text-gray-100' : 'text-gray-900'
                )}>
                  {isDragActive ? 'Отпустите файл здесь' : 'Перетащите файл сюда или нажмите для выбора'}
                </p>
                <p className={clsx(
                  'text-sm mt-1',
                  isDark ? 'text-gray-400' : 'text-gray-500'
                )}>
                  Поддерживаются файлы Excel (.xlsx, .xls) и CSV (.csv)
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Поле для HTML ссылки */}
        <div className={clsx(
          'mt-6 p-4 rounded-lg border',
          isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'
        )}>
          <div className="flex items-center gap-2 mb-3">
            <LinkIcon className={clsx('h-5 w-5', isDark ? 'text-blue-400' : 'text-blue-600')} />
            <label className={clsx(
              'text-sm font-medium',
              isDark ? 'text-gray-200' : 'text-gray-700'
            )}>
              Или вставьте ссылку на HTML страницу с таблицей
            </label>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={htmlUrl}
              onChange={(e) => setHtmlUrl(e.target.value)}
              placeholder="https://example.com/data.html"
              className={clsx(
                'flex-1 px-4 py-2 rounded-lg border text-sm',
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
              )}
              disabled={isProcessingHtml || isProcessing}
            />
            <button
              onClick={handleProcessHtml}
              disabled={isProcessingHtml || isProcessing || !htmlUrl.trim()}
              className={clsx(
                'px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2',
                isProcessingHtml || isProcessing || !htmlUrl.trim()
                  ? isDark 
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : isDark 
                    ? 'bg-blue-600 text-white hover:bg-blue-700' 
                    : 'bg-blue-600 text-white hover:bg-blue-700'
              )}
            >
              {isProcessingHtml ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Загрузка...</span>
                </>
              ) : (
                <>
                  <LinkIcon className="h-4 w-4" />
                  <span>Загрузить</span>
                </>
              )}
            </button>
          </div>
          <p className={clsx(
            'text-xs mt-2',
            isDark ? 'text-gray-400' : 'text-gray-500'
          )}>
            HTML страница должна содержать таблицу с данными в том же формате, что и Excel файл
          </p>
        </div>

        {/* Кнопки действий */}
        {selectedFile && (
          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={onProcessFile}
                disabled={isProcessing}
                className={clsx(
                  'flex items-center px-4 py-2 rounded-lg font-medium transition-colors',
                  isProcessing
                    ? isDark 
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : isDark 
                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                )}
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
                className={clsx(
                  'flex items-center px-4 py-2 rounded-lg border font-medium transition-colors',
                  isDark 
                    ? 'border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white' 
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <XMarkIcon className="h-4 w-4 mr-2" />
                Очистить
              </button>
            </div>
            
            <div className={clsx(
              'text-sm',
              isDark ? 'text-gray-400' : 'text-gray-500'
            )}>
              Готов к обработке
            </div>
          </div>
        )}
      </div>

      {/* Результаты обработки */}
      {processedData && (
        <div className={clsx(
          'rounded-lg shadow-sm border p-6',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={clsx(
              'text-lg font-semibold flex items-center',
              isDark ? 'text-gray-100' : 'text-gray-900'
            )}>
              <CheckCircleIcon className={clsx('h-5 w-5 mr-2', isDark ? 'text-green-400' : 'text-green-600')} />
              Результаты обработки
            </h3>
            <button
              onClick={onClearResults}
              className={clsx(
                'transition-colors',
                isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
              )}
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={clsx(
              'p-4 rounded-lg border',
              isDark ? 'bg-blue-900/20 border-blue-500/30' : 'bg-blue-50 border-blue-200'
            )}>
              <div className="flex items-center">
                <DocumentTextIcon className={clsx('h-5 w-5 mr-2', isDark ? 'text-blue-400' : 'text-blue-600')} />
                <div>
                  <p className={clsx('text-sm font-medium', isDark ? 'text-blue-300' : 'text-blue-800')}>Заказы</p>
                  <p className={clsx('text-2xl font-bold', isDark ? 'text-blue-200' : 'text-blue-900')}>
                    {processedData.orders?.length || 0}
                  </p>
                </div>
              </div>
            </div>
            
            <div className={clsx(
              'p-4 rounded-lg border',
              isDark ? 'bg-green-900/20 border-green-500/30' : 'bg-green-50 border-green-200'
            )}>
              <div className="flex items-center">
                <UserGroupIcon className={clsx('h-5 w-5 mr-2', isDark ? 'text-green-400' : 'text-green-600')} />
                <div>
                  <p className={clsx('text-sm font-medium', isDark ? 'text-green-300' : 'text-green-800')}>Курьеры</p>
                  <p className={clsx('text-2xl font-bold', isDark ? 'text-green-200' : 'text-green-900')}>
                    {processedData.couriers?.length || 0}
                  </p>
                </div>
              </div>
            </div>
            
            <div className={clsx(
              'p-4 rounded-lg border',
              isDark ? 'bg-purple-900/20 border-purple-500/30' : 'bg-purple-50 border-purple-200'
            )}>
              <div className="flex items-center">
                <CreditCardIcon className={clsx('h-5 w-5 mr-2', isDark ? 'text-purple-400' : 'text-purple-600')} />
                <div>
                  <p className={clsx('text-sm font-medium', isDark ? 'text-purple-300' : 'text-purple-800')}>Способы оплаты</p>
                  <p className={clsx('text-2xl font-bold', isDark ? 'text-purple-200' : 'text-purple-900')}>
                    {processedData.paymentMethods?.length || 0}
                  </p>
                </div>
              </div>
            </div>
            
            <div className={clsx(
              'p-4 rounded-lg border',
              isDark ? 'bg-yellow-900/20 border-yellow-500/30' : 'bg-yellow-50 border-yellow-200'
            )}>
              <div className="flex items-center">
                <ExclamationTriangleIcon className={clsx('h-5 w-5 mr-2', isDark ? 'text-yellow-400' : 'text-yellow-600')} />
                <div>
                  <p className={clsx('text-sm font-medium', isDark ? 'text-yellow-300' : 'text-yellow-800')}>Ошибки</p>
                  <p className={clsx('text-2xl font-bold', isDark ? 'text-yellow-200' : 'text-yellow-900')}>
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
































