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
  LinkIcon,
  ChevronDownIcon,
  TruckIcon,
  ShoppingCartIcon,
  XCircleIcon,
  BanknotesIcon
} from '@heroicons/react/24/outline'
import { LoadingSpinner } from '../shared/LoadingSpinner'
import { clsx } from 'clsx'
import { useTheme } from '../../contexts/ThemeContext'
import { processHtmlUrl, isValidUrl, processHtmlFile } from '../../utils/data/htmlProcessor'

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
  const [showHtmlUpload, setShowHtmlUpload] = useState<boolean>(false)
  const [isExpanded, setIsExpanded] = useState<boolean>(false)
  const [selectedStat, setSelectedStat] = useState<any | null>(null)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)

  const processLocalHtmlFile = useCallback(async (file: File) => {
    if (!onHtmlDataLoad) {
      toast.error('Обработка HTML недоступна')
      return
    }
    setIsProcessingHtml(true)
    try {
      const data = await processHtmlFile(file)
      onHtmlDataLoad(data)
      toast.success(`Успешно загружено ${data.orders?.length || 0} заказов из HTML`)
      setHtmlUrl('')
    } catch (error: any) {
      console.error('Ошибка обработки HTML файла:', error)
      toast.error(error?.message || 'Ошибка при обработке HTML файла')
    } finally {
      setIsProcessingHtml(false)
    }
  }, [onHtmlDataLoad])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    const isExcel = /(\.xlsx|\.xls)$/i.test(file.name) || [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ].includes(file.type)
    const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv'

    if (!isExcel && !isCsv) {
      toast.error('Пожалуйста, выберите Excel (.xlsx, .xls) или CSV (.csv). Для HTML файлов используйте зону ниже.')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Размер файла не должен превышать 10MB')
      return
    }

    onFileSelect(file)
    toast.success(`Файл "${file.name}" выбран для обработки`)
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

  // Отдельный dropzone для HTML файлов
  const { getRootProps: getHtmlRootProps, getInputProps: getHtmlInputProps, isDragActive: isHtmlDragActive } = useDropzone({
    onDrop: useCallback((acceptedFiles: File[]) => {
      const file = acceptedFiles[0]
      if (!file) return

      const isHtml = /\.html?$/i.test(file.name) || file.type === 'text/html'

      if (!isHtml) {
        toast.error('Пожалуйста, выберите HTML файл (.html, .htm)')
        return
      }

      if (file.size > 10 * 1024 * 1024) {
        toast.error('Размер файла не должен превышать 10MB')
        return
      }

      void processLocalHtmlFile(file)
    }, [processLocalHtmlFile]),
    accept: {
      'text/html': ['.html', '.htm']
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

    const trimmed = htmlUrl.trim()

    // file:// блокируется браузером: предлагаем перетащить файл
    if (trimmed.startsWith('file://')) {
      toast.error('Перетащите HTML-файл в зону загрузки или в поле ниже — file:// блокируется браузером.')
      return
    }

    if (!isValidUrl(trimmed)) {
      toast.error('Неверный формат URL. Используйте http:// или https://')
      return
    }

    setIsProcessingHtml(true)
    try {
      const data = await processHtmlUrl(trimmed)
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
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className={clsx(
          'rounded-3xl p-6 shadow-sm border overflow-hidden relative cursor-pointer transition-all hover:bg-gray-50/50 dark:hover:bg-white/5',
          isDark
            ? 'bg-gray-900/20 border-gray-800 opacity-60 hover:opacity-100'
            : 'bg-white border-gray-100 opacity-60 hover:opacity-100'
        )}
      >
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={clsx(
                'p-3 rounded-xl',
                isDark
                  ? 'bg-gray-800 text-gray-400'
                  : 'bg-gray-100 text-gray-500'
              )}>
                <DocumentArrowUpIcon className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <h2 className={clsx(
                    'text-xl font-bold',
                    isDark ? 'text-gray-300' : 'text-gray-700'
                  )}>
                    Загрузка Excel файлов
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-gray-500/10 text-gray-500 text-[10px] font-black uppercase tracking-widest border border-gray-500/20">
                    Устарело
                  </span>
                </div>
                <p className={clsx('text-xs', isDark ? 'text-gray-500' : 'text-gray-500')}>
                  Для ручной загрузки (рекомендуется использовать FastOperator Sync выше)
                </p>
              </div>
            </div>
            <ChevronDownIcon className={clsx(
              'w-8 h-8 transition-transform duration-300',
              isDark ? 'text-gray-400' : 'text-gray-600',
              isExpanded ? 'rotate-180' : ''
            )} />
          </div>
        </div>
      </div>

      {/* Область загрузки файла (Спойлер) */}
      <div className={clsx(
        'transition-all duration-500 overflow-hidden',
        isExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
      )}>
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
                    Поддерживаются Excel (.xlsx, .xls) и CSV (.csv)
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Секция для HTML загрузки под спойлером */}
          <div className="mt-6">
            <button
              onClick={() => setShowHtmlUpload(!showHtmlUpload)}
              className={clsx(
                'flex items-center space-x-2 text-sm font-medium transition-colors mb-2',
                isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'
              )}
            >
              <ChevronDownIcon className={clsx(
                'h-4 w-4 transition-transform duration-200',
                showHtmlUpload ? 'rotate-180' : ''
              )} />
              <span>Или использовать HTML выгрузку ФастОператора</span>
            </button>

            {showHtmlUpload && (
              <div className={clsx(
                'p-4 rounded-lg border animate-in fade-in slide-in-from-top-2 duration-200',
                isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'
              )}>
                <div className="flex items-center gap-2 mb-3">
                  <LinkIcon className={clsx('h-5 w-5', isDark ? 'text-blue-400' : 'text-blue-600')} />
                  <label className={clsx(
                    'text-sm font-medium',
                    isDark ? 'text-gray-200' : 'text-gray-700'
                  )}>
                    Вставь ссылку на HTML страницу
                  </label>
                </div>

                {/* Отдельная зона drag and drop для HTML */}
                <div
                  {...getHtmlRootProps()}
                  className={clsx(
                    'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors mb-4',
                    isHtmlDragActive
                      ? isDark
                        ? 'border-blue-400 bg-blue-900/20'
                        : 'border-blue-400 bg-blue-50'
                      : isDark
                        ? 'border-gray-600 hover:border-gray-500'
                        : 'border-gray-300 hover:border-gray-400'
                  )}
                >
                  <input {...getHtmlInputProps()} />
                  <div className="space-y-2">
                    <DocumentTextIcon className={clsx('h-8 w-8 mx-auto', isDark ? 'text-blue-400' : 'text-blue-600')} />
                    <p className={clsx(
                      'text-sm font-medium',
                      isDark ? 'text-gray-200' : 'text-gray-700'
                    )}>
                      {isHtmlDragActive ? 'Отпустите HTML файл здесь' : 'Перетащите HTML файл сюда или нажмите для выбора'}
                    </p>
                    <p className={clsx(
                      'text-xs',
                      isDark ? 'text-gray-400' : 'text-gray-500'
                    )}>
                      Поддерживаются файлы .html и .htm
                    </p>
                  </div>
                </div>

                {/* Поле для URL */}
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
            )}
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
      </div>

      {/* Результаты обработки */}
      {
        processedData && (
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className={clsx(
                'p-5 rounded-2xl border transition-all duration-300 shadow-sm',
                isDark ? 'bg-blue-500/10 border-blue-500/20 shadow-blue-500/5' : 'bg-blue-50 border-blue-200 shadow-blue-500/5'
              )}>
                <div className="flex items-center gap-4">
                  <div className={clsx("p-3 rounded-xl", isDark ? "bg-blue-500/20" : "bg-white")}>
                    <DocumentTextIcon className={clsx('h-6 w-6', isDark ? 'text-blue-400' : 'text-blue-600')} />
                  </div>
                  <div>
                    <p className={clsx('text-[11px] font-black uppercase tracking-widest opacity-60 mb-0.5', isDark ? 'text-blue-300' : 'text-blue-800')}>Заказов всего</p>
                    <p className={clsx('text-2xl font-black tabular-nums', isDark ? 'text-blue-200' : 'text-blue-900')}>
                      {processedData.orders?.length || 0}
                    </p>
                  </div>
                </div>
              </div>

              <div className={clsx(
                'p-5 rounded-2xl border transition-all duration-300 shadow-sm',
                isDark ? 'bg-green-500/10 border-green-500/20 shadow-green-500/5' : 'bg-green-50 border-green-200 shadow-green-500/5'
              )}>
                <div className="flex items-center gap-4">
                  <div className={clsx("p-3 rounded-xl", isDark ? "bg-green-500/20" : "bg-white")}>
                    <UserGroupIcon className={clsx('h-6 w-6', isDark ? 'text-green-400' : 'text-green-600')} />
                  </div>
                  <div>
                    <p className={clsx('text-[11px] font-black uppercase tracking-widest opacity-60 mb-0.5', isDark ? 'text-green-300' : 'text-green-800')}>Курьеры</p>
                    <p className={clsx('text-2xl font-black tabular-nums', isDark ? 'text-green-200' : 'text-green-900')}>
                      {processedData.couriers?.length || 0}
                    </p>
                  </div>
                </div>
              </div>

              <div className={clsx(
                'p-5 rounded-2xl border transition-all duration-300 shadow-sm',
                isDark ? 'bg-purple-500/10 border-purple-500/20 shadow-purple-500/5' : 'bg-purple-50 border-purple-200 shadow-purple-500/5'
              )}>
                <div className="flex items-center gap-4">
                  <div className={clsx("p-3 rounded-xl", isDark ? "bg-purple-500/20" : "bg-white")}>
                    <CreditCardIcon className={clsx('h-6 w-6', isDark ? 'text-purple-400' : 'text-purple-600')} />
                  </div>
                  <div>
                    <p className={clsx('text-[11px] font-black uppercase tracking-widest opacity-60 mb-0.5', isDark ? 'text-purple-300' : 'text-purple-800')}>Оплата</p>
                    <p className={clsx('text-2xl font-black tabular-nums', isDark ? 'text-purple-200' : 'text-purple-900')}>
                      {processedData.paymentMethods?.length || 0}
                    </p>
                  </div>
                </div>
              </div>

              <div className={clsx(
                'p-5 rounded-2xl border transition-all duration-300 shadow-sm',
                isDark ? 'bg-amber-500/10 border-amber-500/20 shadow-amber-500/5' : 'bg-amber-50 border-amber-200 shadow-amber-500/5'
              )}>
                <div className="flex items-center gap-4">
                  <div className={clsx("p-3 rounded-xl", isDark ? "bg-amber-500/20" : "bg-white")}>
                    <ExclamationTriangleIcon className={clsx('h-6 w-6', isDark ? 'text-amber-400' : 'text-amber-600')} />
                  </div>
                  <div>
                    <p className={clsx('text-[11px] font-black uppercase tracking-widest opacity-60 mb-0.5', isDark ? 'text-amber-300' : 'text-amber-800')}>Ошибки</p>
                    <p className={clsx('text-2xl font-black tabular-nums', isDark ? 'text-amber-200' : 'text-amber-900')}>
                      {processedData.errors?.length || 0}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* v42 Premium Analytics Dashboard */}
            <div className={clsx(
              "p-8 rounded-[32px] border-2 mb-4 relative overflow-hidden",
              isDark ? "bg-slate-900/40 border-slate-800 shadow-2xl" : "bg-white border-slate-100 shadow-xl shadow-slate-200/50"
            )}>
              {/* Decorative accent */}
              <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500" />
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div>
                  <h3 className={clsx("text-xl font-black tracking-tight mb-1", isDark ? "text-white" : "text-slate-900")}>
                    Аналитика результатов
                  </h3>
                  <p className={clsx("text-sm font-medium opacity-50", isDark ? "text-slate-400" : "text-slate-500")}>
                    Детальная статистика загруженных заказов за сегодня
                  </p>
                </div>
                
                <div className={clsx(
                  "px-4 py-2 rounded-xl border font-black text-xs uppercase tracking-widest",
                  isDark ? "bg-slate-800 border-slate-700 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-500"
                )}>
                  Сегодня: {new Date().toLocaleDateString('ru-RU')}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                {[
                  {
                    type: 'delivery',
                    label: 'Доставка',
                    value: processedData.orders?.filter((o: any) => {
                      const type = String(o.orderType || o['тип заказа'] || o.type || '').toLowerCase();
                      const addr = String(o.address || '').toLowerCase();
                      const isPickup = type.includes('самовывоз') || type.includes('самовивіз') || type.includes('вынос') ||
                                     addr.includes('самовывоз') || addr.includes('самовивіз') || addr.includes('вынос');
                      return !isPickup;
                    }).length || 0,
                    color: 'emerald',
                    icon: TruckIcon,
                    detail: `Все заказы за исключением самовывозов и выносов`
                  },
                  {
                    type: 'pickup',
                    label: 'Самовывоз',
                    value: processedData.orders?.filter((o: any) => {
                      const type = String(o.orderType || o['тип заказа'] || o.type || '').toLowerCase();
                      const addr = String(o.address || '').toLowerCase();
                      return type.includes('самовывоз') || type.includes('самовивіз') || type.includes('вынос') ||
                             addr.includes('самовывоз') || addr.includes('самовивіз') || addr.includes('вынос');
                    }).length || 0,
                    color: 'violet',
                    icon: ShoppingCartIcon,
                    detail: `Заказы с пометкой "Самовывоз", "Винос" или "Самовивіз"`
                  },
                  {
                    type: 'cancelled',
                    label: 'Отказы',
                    value: processedData.orders?.filter((o: any) => 
                      o.status?.toLowerCase().includes('отказ') || 
                      o.status?.toLowerCase().includes('отменен') ||
                      o.status?.toLowerCase().includes('відмова')
                    ).length || 0,
                    color: 'red',
                    icon: XCircleIcon,
                    detail: `Заказы со статусом "Отказ", "Отменен" или "Відмова"`
                  },
                  {
                    type: 'success',
                    label: 'Без отказов',
                    value: (processedData.orders?.length || 0) - (processedData.orders?.filter((o: any) => 
                      o.status?.toLowerCase().includes('отказ') || 
                      o.status?.toLowerCase().includes('отменен') ||
                      o.status?.toLowerCase().includes('відмова')
                    ).length || 0),
                    color: 'green',
                    icon: CheckCircleIcon,
                    detail: `Успешно выполненные заказы без учета отмен`
                  },
                  {
                    type: 'amount',
                    label: 'Сумма',
                    value: `${Math.round(processedData.orders?.filter((o: any) => {
                      const status = String(o.status || '').toLowerCase();
                      return !status.includes('отказ') && !status.includes('отменен') && !status.includes('відмова');
                    }).reduce((sum: number, o: any) => sum + (Number(o.amount) || 0), 0) || 0).toLocaleString()} ₴`,
                    color: 'indigo',
                    icon: BanknotesIcon,
                    detail: `Общая сумма выручки по способам оплаты`,
                    isClickable: true
                  }
                ].map((stat, idx) => (
                  <div key={idx} className="flex flex-col">
                    <div 
                      onClick={() => { if (stat.isClickable) { setSelectedStat(stat); setIsModalOpen(true); } }}
                      className={clsx(
                        "w-10 h-10 rounded-xl flex items-center justify-center mb-3 shadow-sm border transition-all duration-300",
                        stat.isClickable ? "cursor-pointer active:scale-95 hover:bg-opacity-80" : "cursor-default",
                        isDark ? `bg-${stat.color}-500/10 border-${stat.color}-500/20 text-${stat.color}-400` : `bg-${stat.color}-50 border-${stat.color}-100 text-${stat.color}-600`
                      )}
                    >
                      <stat.icon className="w-5 h-5" />
                    </div>
                    <p className={clsx("text-[10px] font-black uppercase tracking-widest opacity-50 mb-1", isDark ? "text-slate-400" : "text-slate-500")}>
                      {stat.label}
                    </p>
                    <p className={clsx("text-lg font-black tracking-tight", isDark ? "text-white" : "text-slate-900")}>
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      }
      {/* Simplified Analytics Modal - Payment Breakdown Only */}
      {isModalOpen && selectedStat && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
          />
          <div className={clsx(
            "relative w-full max-w-sm overflow-hidden rounded-2xl border shadow-xl animate-in fade-in zoom-in-95 duration-200",
            isDark ? "bg-gray-900 border-gray-800 text-white" : "bg-white border-gray-100 text-gray-900"
          )}>
            <div className="p-5 border-b border-gray-100/10 flex items-center justify-between bg-gray-50/30 dark:bg-white/5">
              <h3 className="text-sm font-black uppercase tracking-widest opacity-70">
                Детализация оплаты
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {[
                { label: 'Нал' },
                { label: 'Безнал' }
              ].map(methodObj => {
                const totalByMethod = (processedData.orders || []).filter((o: any) => {
                  const status = String(o.status || '').toLowerCase();
                  const m = String(o.paymentMethod || o['способ оплаты'] || o.payment_method || '').toLowerCase();
                  
                  const isRefused = m.includes('отказ') || status.includes('отказ') || status.includes('отменен') || status.includes('відмова');
                  if (isRefused) return false;
                  
                  // 🔑 STRICT CASH IDENTIFICATION
                  const isCash = (
                    m.includes('нал') || 
                    m.includes('готівка') || 
                    m === '' || 
                    m === 'cash'
                  ) && !m.includes('безготів');
                  
                  return methodObj.label === 'Нал' ? isCash : !isCash;
                }).reduce((sum: number, o: any) => sum + (Number(o.amount) || 0), 0) || 0;

                return (
                  <div key={methodObj.label} className={clsx(
                    "flex items-center justify-between p-3 rounded-xl border",
                    isDark ? "bg-white/5 border-white/5" : "bg-gray-50 border-gray-100"
                  )}>
                    <span className="text-xs font-bold opacity-60 uppercase tracking-widest">{methodObj.label}</span>
                    <span className="text-base font-black tabular-nums">{totalByMethod.toLocaleString()} ₴</span>
                  </div>
                );
              })}
            </div>

            <div className="p-5 border-t border-gray-100/10">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-blue-500/20"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}























