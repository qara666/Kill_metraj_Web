import React, { useState, useEffect } from 'react'
import { 
  ShareIcon, 
  LinkIcon, 
  ClipboardDocumentIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline'
import { clsx } from 'clsx'
import { useTheme } from '../contexts/ThemeContext'
import { useDataSharing } from '../utils/dataSharing'
import { useExcelData } from '../contexts/ExcelDataContext'
import toast from 'react-hot-toast'

interface DataSharingProps {
  className?: string
}

export const DataSharing: React.FC<DataSharingProps> = ({ className }) => {
  const [isSharing, setIsSharing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [importUrl, setImportUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  
  const { isDark } = useTheme()
  const { shareData, importDataFromUrl, copyToClipboard } = useDataSharing()
  const { excelData, updateExcelData, updateRouteData } = useExcelData()
  const safeRoutes = (excelData?.routes || [])

  useEffect(() => {
    const checkForSharedData = () => {
      try {
        const currentUrl = window.location.href
        const sharedData = importDataFromUrl(currentUrl)
        if (sharedData) {
          setShowImportModal(true)
          setImportUrl(currentUrl)
        }
      } catch (error) {
        console.error('Ошибка проверки URL:', error)
      }
    }

    checkForSharedData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleShare = async () => {
    if (!excelData) {
      toast.error('Нет данных для обмена. Загрузите Excel файл.')
      return
    }

    setIsSharing(true)
    try {
      // Добавляем отладочную информацию
      console.log('Начинаем создание ссылки для обмена...')
      console.log('Excel данные:', excelData)
      console.log('Маршруты:', safeRoutes)
      
      // Проверяем данные перед кодированием
      const dataToShare = {
        excelData,
        routes: safeRoutes,
        timestamp: Date.now(),
        version: '1.0.0'
      }
      
      console.log('Данные для обмена:', dataToShare)
      
      const url = shareData(excelData, safeRoutes)
      console.log('Ссылка создана успешно:', url)
      
      setShareUrl(url)
      setShowShareModal(true)
      toast.success('Ссылка для обмена создана!')
    } catch (error: any) {
      console.error('Ошибка создания ссылки:', error)
      console.error('Детали ошибки:', {
        message: error?.message || 'Unknown error',
        stack: error?.stack,
        excelData: excelData,
        routes: safeRoutes
      })
      toast.error(`Ошибка создания ссылки для обмена: ${error?.message || 'Unknown error'}`)
    } finally {
      setIsSharing(false)
    }
  }


  const handleCopyUrl = async () => {
    try {
      const success = await copyToClipboard(shareUrl)
      if (success) {
        setCopied(true)
        toast.success('Ссылка скопирована в буфер обмена!')
        setTimeout(() => setCopied(false), 2000)
      } else {
        toast.error('Не удалось скопировать ссылку')
      }
    } catch (error) {
      console.error('Ошибка копирования:', error)
      toast.error('Ошибка копирования ссылки')
    }
  }

  const handleImport = async () => {
    if (!importUrl.trim()) {
      toast.error('Введите URL для импорта')
      return
    }

    setIsImporting(true)
    try {
      const sharedData = importDataFromUrl(importUrl)
      if (!sharedData) {
        toast.error('Не удалось извлечь данные из URL')
        return
      }

      console.log('Импортируемые данные:', sharedData)
      console.log('Структура данных:', {
        hasExcelData: !!sharedData.excelData,
        hasRoutes: !!sharedData.routes,
        ordersCount: sharedData.excelData?.orders?.length || 0,
        couriersCount: sharedData.excelData?.couriers?.length || 0,
        routesCount: sharedData.routes?.length || 0
      })

      // Обновляем данные в контексте полностью
      let newCombinedData = sharedData.excelData
      if (newCombinedData && !newCombinedData.routes && sharedData.routes) {
          newCombinedData = { ...newCombinedData, routes: sharedData.routes }
      }
      if (newCombinedData && excelData?.routes && excelData.routes.length > 0 && (!newCombinedData.routes || newCombinedData.routes.length === 0)) {
          newCombinedData.routes = [...excelData.routes]
      }
      updateExcelData(newCombinedData)
      console.log('Excel данные обновлены:', {
        orders: newCombinedData.orders?.length || 0,
        couriers: newCombinedData.couriers?.length || 0,
        routes: newCombinedData.routes?.length || 0
      })
      
      // Дополнительно обновляем маршруты если они есть отдельно
      if (sharedData.routes && sharedData.routes.length > 0) {
        updateRouteData(sharedData.routes)
        console.log('Маршруты обновлены отдельно:', sharedData.routes.length)
      }

      // Сохраняем данные в localStorage для синхронизации с другими пользователями
      try {
        // Сохраняем в основной ключ ExcelDataContext
        if (sharedData.excelData) {
          localStorage.setItem('km_dashboard_processed_data', JSON.stringify(sharedData.excelData))
          console.log('Excel данные сохранены в km_dashboard_processed_data')
        }
        
        // Сохраняем маршруты отдельно
        if (sharedData.routes && sharedData.routes.length > 0) {
          localStorage.setItem('km_routes', JSON.stringify(sharedData.routes))
          console.log('Маршруты сохранены в km_routes')
        }
        
        // Сохраняем для синхронизации
        const syncData = {
          ...sharedData,
          syncKey: `import_${Date.now()}_${Math.random().toString(36).substring(2)}`,
          lastModified: Date.now()
        }
        localStorage.setItem('km_sync_data', JSON.stringify(syncData))
        console.log('Данные сохранены для синхронизации')
      } catch (syncError) {
        console.error('Ошибка сохранения для синхронизации:', syncError)
      }

      // Очищаем URL от параметров
      window.history.replaceState({}, document.title, window.location.pathname)
      
      setShowImportModal(false)
      setImportUrl('')
      const ordersCount = newCombinedData?.orders?.length || 0
      const couriersCount = newCombinedData?.couriers?.length || 0
      const routesCount = newCombinedData?.routes?.length || 0
      
      toast.success(`Данные успешно импортированы! Загружено: ${ordersCount} заказов, ${couriersCount} курьеров, ${routesCount} маршрутов.`)
    } catch (error) {
      console.error('Ошибка импорта:', error)
      toast.error('Ошибка импорта данных')
    } finally {
      setIsImporting(false)
    }
  }

  const handleCloseShareModal = () => {
    setShowShareModal(false)
    setShareUrl('')
    setCopied(false)
  }

  const handleCloseImportModal = () => {
    setShowImportModal(false)
    setImportUrl('')
    // Очищаем URL от параметров
    window.history.replaceState({}, document.title, window.location.pathname)
  }

  return (
    <>
      {/* Кнопка обмена данными */}
      <div className={clsx('flex space-x-2', className)}>
        <button
          onClick={handleShare}
          disabled={isSharing || !excelData}
          className={clsx(
            'flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all duration-200',
            isSharing || !excelData
              ? isDark 
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : isDark 
                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                : 'bg-blue-600 text-white hover:bg-blue-700'
          )}
          title="Поделиться данными с коллегами"
        >
          <ShareIcon className="h-4 w-4" />
          <span>{isSharing ? 'Создание...' : 'Поделиться данными'}</span>
        </button>

        <button
          onClick={() => setShowImportModal(true)}
          className={clsx(
            'flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all duration-200',
            isDark 
              ? 'bg-green-600 text-white hover:bg-green-700' 
              : 'bg-green-600 text-white hover:bg-green-700'
          )}
          title="Импортировать данные из ссылки"
        >
          <LinkIcon className="h-4 w-4" />
          <span>Импорт</span>
        </button>

      </div>

      {/* Модальное окно для обмена */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={clsx(
            'bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto',
            isDark ? 'bg-gray-800' : 'bg-white'
          )}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className={clsx(
                  'text-lg font-semibold',
                  isDark ? 'text-gray-100' : 'text-gray-900'
                )}>
                  Поделиться данными
                </h3>
                <button
                  onClick={handleCloseShareModal}
                  className={clsx(
                    'p-2 rounded-lg transition-colors',
                    isDark 
                      ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' 
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  )}
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
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
                        Ссылка для обмена данными
                      </p>
                      <p className={clsx(
                        'text-xs mt-1',
                        isDark ? 'text-blue-400' : 'text-blue-600'
                      )}>
                        Отправьте эту ссылку коллегам, чтобы они могли работать с вашими данными: {excelData?.orders?.length || 0} заказов, {safeRoutes.length} маршрутов
                      </p>
                    </div>
                  </div>
                </div>

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
                      value={shareUrl}
                      readOnly
                      className={clsx(
                        'flex-1 px-3 py-2 border rounded-lg text-sm font-mono',
                        isDark 
                          ? 'bg-gray-700 border-gray-600 text-gray-100' 
                          : 'bg-gray-50 border-gray-300 text-gray-900'
                      )}
                    />
                    <button
                      onClick={handleCopyUrl}
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

                <div className={clsx(
                  'p-3 rounded-lg',
                  isDark ? 'bg-yellow-600/10 border border-yellow-500/30' : 'bg-yellow-50 border border-yellow-200'
                )}>
                  <div className="flex items-start space-x-2">
                    <ExclamationTriangleIcon className={clsx(
                      'h-4 w-4 mt-0.5 flex-shrink-0',
                      isDark ? 'text-yellow-400' : 'text-yellow-600'
                    )} />
                    <p className={clsx(
                      'text-xs',
                      isDark ? 'text-yellow-300' : 'text-yellow-700'
                    )}>
                      <strong>Внимание:</strong> Ссылка содержит все ваши данные. Не передавайте её третьим лицам.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={handleCloseShareModal}
                  className={clsx(
                    'px-4 py-2 rounded-lg font-medium transition-colors',
                    isDark 
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  )}
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно для импорта */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={clsx(
            'bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4',
            isDark ? 'bg-gray-800' : 'bg-white'
          )}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className={clsx(
                  'text-lg font-semibold',
                  isDark ? 'text-gray-100' : 'text-gray-900'
                )}>
                  Импорт данных
                </h3>
                <button
                  onClick={handleCloseImportModal}
                  className={clsx(
                    'p-2 rounded-lg transition-colors',
                    isDark 
                      ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' 
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  )}
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={clsx(
                    'block text-sm font-medium mb-2',
                    isDark ? 'text-gray-300' : 'text-gray-700'
                  )}>
                    URL с данными:
                  </label>
                  <input
                    type="url"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="Вставьте ссылку с данными..."
                    className={clsx(
                      'w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                      isDark 
                        ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    )}
                  />
                </div>

                <div className={clsx(
                  'p-3 rounded-lg',
                  isDark ? 'bg-blue-600/10 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'
                )}>
                  <div className="flex items-start space-x-2">
                    <InformationCircleIcon className={clsx(
                      'h-4 w-4 mt-0.5 flex-shrink-0',
                      isDark ? 'text-blue-400' : 'text-blue-600'
                    )} />
                    <p className={clsx(
                      'text-xs',
                      isDark ? 'text-blue-300' : 'text-blue-700'
                    )}>
                      Импорт заменит текущие данные. Убедитесь, что вы сохранили важную информацию.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={handleCloseImportModal}
                  className={clsx(
                    'px-4 py-2 rounded-lg font-medium transition-colors',
                    isDark 
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  )}
                >
                  Отмена
                </button>
                <button
                  onClick={handleImport}
                  disabled={isImporting || !importUrl.trim()}
                  className={clsx(
                    'px-4 py-2 rounded-lg font-medium transition-colors',
                    isImporting || !importUrl.trim()
                      ? isDark 
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : isDark 
                        ? 'bg-green-600 text-white hover:bg-green-700' 
                        : 'bg-green-600 text-white hover:bg-green-700'
                  )}
                >
                  {isImporting ? 'Импорт...' : 'Импортировать'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </>
  )
}

















