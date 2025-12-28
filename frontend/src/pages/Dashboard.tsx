import React, { useState, useEffect, Suspense, lazy } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { ApiKeyNotification } from '../components/ApiKeyNotification'
import { ExcelUploadSection } from '../components/ExcelUploadSection'
import { ExcelResultsDisplay } from '../components/ExcelResultsDisplay'
import { useExcelData } from '../contexts/ExcelDataContext'
import { useTheme } from '../contexts/ThemeContext'
import { clsx } from 'clsx'
import * as api from '../services/api'
import { fastopertorApi } from '../services/fastopertorApi'
import { localStorageUtils } from '../utils/localStorage'
const ExcelDebugLogs = lazy(() => import('../components/ExcelDebugLogs').then(module => ({ default: module.ExcelDebugLogs })))
const ExcelDataPreview = lazy(() => import('../components/ExcelDataPreview').then(module => ({ default: module.ExcelDataPreview })))

export const Dashboard: React.FC = () => {
  const { excelData, setExcelData, clearExcelData } = useExcelData()
  const { isDark } = useTheme()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [excelLogs, setExcelLogs] = useState<any[]>([])
  const [showExcelLogs, setShowExcelLogs] = useState(false)
  const [showDataPreview, setShowDataPreview] = useState(false)
  const [previewData, setPreviewData] = useState<any>(null)
  const queryClient = useQueryClient()

  const log = (message: string) => {
    console.log('[Dashboard]', message)
    const entry = `${new Date().toLocaleTimeString()} — ${message}`
    setLogs(prev => [entry, ...prev].slice(0, 200))
  }

  // Функция для объединения данных с проверкой дубликатов
  const mergeExcelData = (newData: any, existingData: any) => {
    if (!existingData || !newData) {
      return newData || existingData || { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [] }
    }

    // Объединяем заказы, исключая дубликаты по номеру заказа
    const existingOrders = Array.isArray(existingData.orders) ? existingData.orders : []
    const newOrders = Array.isArray(newData.orders) ? newData.orders : []
    const mergedOrders = [...existingOrders]
    
    let addedOrders = 0
    let duplicateOrders = 0
    
    newOrders.forEach((newOrder: any) => {
      // Создаем стабильный ID на основе orderNumber если его нет
      if (!newOrder.id) {
        newOrder.id = `order_${newOrder.orderNumber || Math.random()}`
      }
      
      // Более точная проверка дубликатов - учитываем только orderNumber, если он есть
      let isDuplicate = false
      if (newOrder.orderNumber) {
        isDuplicate = existingOrders.some((existingOrder: any) => 
          existingOrder.orderNumber === newOrder.orderNumber
        )
      } else {
        // Если нет orderNumber, проверяем по адресу и другим полям
        isDuplicate = existingOrders.some((existingOrder: any) => 
          existingOrder.address === newOrder.address &&
          existingOrder.courierName === newOrder.courierName &&
          existingOrder.plannedTime === newOrder.plannedTime
        )
      }
      
      if (!isDuplicate) {
        mergedOrders.push(newOrder)
        addedOrders++
      } else {
        duplicateOrders++
        // Логируем дубликат для отладки
        console.log(`Дубликат заказа: ${newOrder.orderNumber || 'без номера'} - ${newOrder.address}`)
      }
    })

    // Объединяем курьеров, исключая дубликаты по имени
    const existingCouriers = Array.isArray(existingData.couriers) ? existingData.couriers : []
    const newCouriers = Array.isArray(newData.couriers) ? newData.couriers : []
    const mergedCouriers = [...existingCouriers]
    
    let addedCouriers = 0
    let duplicateCouriers = 0
    
    newCouriers.forEach((newCourier: any) => {
      const isDuplicate = existingCouriers.some((existingCourier: any) => 
        existingCourier.name === newCourier.name
      )
      
      if (!isDuplicate) {
        mergedCouriers.push(newCourier)
        addedCouriers++
      } else {
        duplicateCouriers++
      }
    })

    // Объединяем способы оплаты, исключая дубликаты
    const existingPaymentMethods = Array.isArray(existingData.paymentMethods) ? existingData.paymentMethods : []
    const newPaymentMethods = Array.isArray(newData.paymentMethods) ? newData.paymentMethods : []
    const mergedPaymentMethods = [...existingPaymentMethods]
    
    let addedPaymentMethods = 0
    let duplicatePaymentMethods = 0
    
    newPaymentMethods.forEach((newPaymentMethod: any) => {
      const isDuplicate = existingPaymentMethods.some((existingPaymentMethod: any) => 
        existingPaymentMethod.name === newPaymentMethod.name
      )
      
      if (!isDuplicate) {
        mergedPaymentMethods.push(newPaymentMethod)
        addedPaymentMethods++
      } else {
        duplicatePaymentMethods++
      }
    })

    // Объединяем маршруты, исключая дубликаты по ID
    const existingRoutes = Array.isArray(existingData.routes) ? existingData.routes : []
    const newRoutes = Array.isArray(newData.routes) ? newData.routes : []
    const mergedRoutes = [...existingRoutes]
    
    let addedRoutes = 0
    let duplicateRoutes = 0
    
    newRoutes.forEach((newRoute: any) => {
      const isDuplicate = existingRoutes.some((existingRoute: any) => 
        existingRoute.id === newRoute.id
      )
      
      if (!isDuplicate) {
        mergedRoutes.push(newRoute)
        addedRoutes++
      } else {
        duplicateRoutes++
      }
    })

    // Объединяем ошибки, преобразуя объекты в строки
    const existingErrors = Array.isArray(existingData.errors) ? existingData.errors : []
    const newErrors = Array.isArray(newData.errors) ? newData.errors : []
    
    const existingErrorsAsStrings = existingErrors.map((error: any) => 
      typeof error === 'string' ? error : `Строка ${error.row || 'N/A'}: ${error.message || 'Неизвестная ошибка'}`
    )
    
    const newErrorsAsStrings = newErrors.map((error: any) => 
      typeof error === 'string' ? error : `Строка ${error.row || 'N/A'}: ${error.message || 'Неизвестная ошибка'}`
    )
    
    const mergedErrors = [...existingErrorsAsStrings, ...newErrorsAsStrings]

    // Логируем результаты объединения
    log(`Объединение данных: +${addedOrders} заказов (${duplicateOrders} дубликатов), +${addedCouriers} курьеров (${duplicateCouriers} дубликатов), +${addedPaymentMethods} способов оплаты (${duplicatePaymentMethods} дубликатов), +${addedRoutes} маршрутов (${duplicateRoutes} дубликатов)`)
    
    // Дополнительное логирование для отладки заказов
    if (addedOrders > 0) {
      const newOrderNumbers = newOrders.slice(0, 3).map((order: any) => order.orderNumber).join(', ')
      log(`Новые заказы: ${newOrderNumbers}${newOrders.length > 3 ? '...' : ''}`)
    }
    
    // Дополнительная диагностика если заказы не добавились
    if (addedOrders === 0 && newOrders.length > 0) {
      log(`⚠️ ДИАГНОСТИКА: Все ${newOrders.length} заказов считаются дубликатами!`)
      log(`Примеры новых заказов: ${newOrders.slice(0, 2).map((o: any) => `№${o.orderNumber || 'N/A'}`).join(', ')}`)
      log(`Примеры существующих заказов: ${existingOrders.slice(0, 2).map((o: any) => `№${o.orderNumber || 'N/A'}`).join(', ')}`)
    }

    return {
      orders: mergedOrders,
      couriers: mergedCouriers,
      paymentMethods: mergedPaymentMethods,
      routes: mergedRoutes,
      errors: mergedErrors,
      summary: {
        totalRows: mergedOrders.length + mergedCouriers.length + mergedPaymentMethods.length + mergedRoutes.length,
        successfulGeocoding: 0,
        failedGeocoding: 0,
        orders: mergedOrders.length,
        couriers: mergedCouriers.length,
        paymentMethods: mergedPaymentMethods.length,
        errors: mergedErrors
      }
    }
  }

  // Автоматическая загрузка данных из Fastopertor API
  useEffect(() => {
    const loadFastopertorData = async () => {
      const settings = localStorageUtils.getAllSettings()
      
      if (!settings.enableFastopertorApi || !settings.fastopertorApiUrl || !settings.fastopertorApiKey) {
        return
      }

      try {
        log('🔄 Начало загрузки данных из Fastopertor API...')
        
        const result = await fastopertorApi.fetchData({
          apiUrl: settings.fastopertorApiUrl,
          apiKey: settings.fastopertorApiKey,
          endpoint: settings.fastopertorEndpoint || '/api/orders'
        })

        if (result.success && result.data) {
          // Преобразуем данные в формат ExcelData
          const transformedData = {
            orders: result.data.orders || [],
            couriers: result.data.couriers || [],
            paymentMethods: result.data.paymentMethods || [],
            routes: result.data.routes || [],
            errors: result.data.errors || [],
            warnings: result.data.warnings || [],
            summary: {
              totalOrders: result.data.orders?.length || 0,
              totalCouriers: result.data.couriers?.length || 0,
              totalPaymentMethods: result.data.paymentMethods?.length || 0,
              totalRoutes: result.data.routes?.length || 0,
              errors: result.data.errors?.length || 0,
              warnings: result.data.warnings?.length || 0
            }
          }

          // Объединяем с существующими данными
          const mergedData = mergeExcelData(transformedData, excelData)
          setExcelData(mergedData)
          
          log(`✅ Данные из Fastopertor API загружены: ${transformedData.orders.length} заказов, ${transformedData.couriers.length} курьеров`)
          toast.success(`Данные из Fastopertor API загружены: ${transformedData.orders.length} заказов`)
        } else {
          log(`❌ Ошибка загрузки данных из Fastopertor API: ${result.error || 'Неизвестная ошибка'}`)
          toast.error(`Ошибка загрузки из Fastopertor API: ${result.error || 'Неизвестная ошибка'}`)
        }
      } catch (error) {
        log(`❌ Критическая ошибка при загрузке данных из Fastopertor API: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`)
        toast.error(`Ошибка загрузки из Fastopertor API: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`)
      }
    }

    // Загружаем данные при монтировании компонента, если включена опция
    loadFastopertorData()

    // Настраиваем периодическую загрузку каждые 5 минут
    const interval = setInterval(() => {
      loadFastopertorData()
    }, 5 * 60 * 1000) // 5 минут

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Запускаем только при монтировании, mergeExcelData и setExcelData стабильны

  // Hydrate state from localStorage on mount
  useEffect(() => {
    try {
      // Восстанавливаем логи
      const storedLogs = localStorage.getItem('km_dashboard_logs')
      if (storedLogs) {
        const parsed = JSON.parse(storedLogs)
        if (Array.isArray(parsed)) {
          setLogs(parsed)
        }
      }


      // Восстанавливаем Excel логи
      const storedExcelLogs = localStorage.getItem('km_dashboard_excel_logs')
      if (storedExcelLogs) {
        const parsed = JSON.parse(storedExcelLogs)
        if (Array.isArray(parsed)) {
          setExcelLogs(parsed)
        }
      }
    } catch (error) {
      console.warn('Ошибка восстановления состояния из localStorage:', error)
    }
  }, [])

  // Persist logs to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('km_dashboard_logs', JSON.stringify(logs))
    } catch {}
  }, [logs])


  // Persist Excel logs to localStorage whenever they change
  useEffect(() => {
    try {
      if (excelLogs.length > 0) {
        localStorage.setItem('km_dashboard_excel_logs', JSON.stringify(excelLogs))
      }
    } catch {}
  }, [excelLogs])


  // Process Excel file mutation
  const processFileMutation = useMutation({
    mutationFn: api.uploadApi.uploadExcelFile,
    onSuccess: (resp: any) => {
      // Normalize backend response to UI-friendly shape
      const data: any = resp?.data || {}
      const orders = Array.isArray((data as any).orders) ? (data as any).orders : []
      const couriers = Array.isArray((data as any).couriers) ? (data as any).couriers : []
      const paymentMethods = Array.isArray((data as any).paymentMethods) ? (data as any).paymentMethods : []
      const routes = Array.isArray((data as any).routes) ? (data as any).routes : []
      const errorsArr = Array.isArray((data as any).errors) ? (data as any).errors : []
      // Преобразуем объекты ошибок в строки
      const errorsAsStrings = errorsArr.map((error: any) => 
        typeof error === 'string' ? error : `Строка ${error.row || 'N/A'}: ${error.message || 'Неизвестная ошибка'}`
      )

      const newData: any = {
        orders,
        couriers,
        paymentMethods,
        routes,
        errors: errorsAsStrings,
        summary: {
          totalRows: orders.length + couriers.length + paymentMethods.length + routes.length,
          successfulGeocoding: 0,
          failedGeocoding: 0,
          orders: orders.length,
          couriers: couriers.length,
          paymentMethods: paymentMethods.length,
          errors: errorsAsStrings
        }
      }

      // Объединяем новые данные с существующими
      let mergedData: any
      try {
        mergedData = mergeExcelData(newData, excelData || null)
        if (mergedData && excelData?.routes && excelData.routes.length > 0 && (!mergedData.routes || mergedData.routes.length === 0)) {
            mergedData.routes = [...excelData.routes]
        }
        
        // Убеждаемся, что все массивы определены
        if (!mergedData.orders) mergedData.orders = []
        if (!mergedData.couriers) mergedData.couriers = []
        if (!mergedData.paymentMethods) mergedData.paymentMethods = []
        if (!mergedData.routes) mergedData.routes = []
        if (!mergedData.errors) mergedData.errors = []
        
        // Сохраняем данные в контекст (это автоматически сохранит в localStorage)
        setExcelData(mergedData)
        
        // Дополнительно проверяем, что данные сохранились
        try {
          const saved = localStorage.getItem('km_dashboard_processed_data')
          if (saved) {
            const parsed = JSON.parse(saved)
            log(`✅ Данные сохранены в localStorage: ${parsed?.orders?.length || 0} заказов, ${parsed?.couriers?.length || 0} курьеров`)
          } else {
            log(`⚠️ Данные не сохранились в localStorage!`)
          }
        } catch (e) {
          console.warn('Ошибка проверки сохранения:', e)
        }
        
        // Логируем результаты объединения
        const existingOrdersCount = excelData?.orders?.length || 0
        const newOrdersCount = (orders as any[]).length
        const finalOrdersCount = mergedData.orders.length
        
        log(`Файл оброблено: замовлень=${newOrdersCount}, геокодовано=${newData.summary.successfulGeocoding}, помилок=${(newData.summary.errors as any[]).length}.`)
        log(`Объединение: було=${existingOrdersCount}, нових=${newOrdersCount}, стало=${finalOrdersCount} заказов.`)
        
        if (finalOrdersCount === existingOrdersCount && newOrdersCount > 0) {
          log(`⚠️ ВНИМАНИЕ: Новые заказы не добавились! Возможно, все заказы считаются дубликатами.`)
        }
        
      } catch (error) {
        console.error('Ошибка при объединении данных:', error)
        // Если объединение не удалось, просто используем новые данные
        if (newData && excelData?.routes && excelData.routes.length > 0 && (!newData.routes || newData.routes.length === 0)) {
            newData.routes = [...excelData.routes]
        }
        
        // Убеждаемся, что все массивы определены
        if (!newData.orders) newData.orders = []
        if (!newData.couriers) newData.couriers = []
        if (!newData.paymentMethods) newData.paymentMethods = []
        if (!newData.routes) newData.routes = []
        if (!newData.errors) newData.errors = []
        
        setExcelData(newData)
        mergedData = newData
        log(`Ошибка объединения данных, используются только новые данные`)
      }
      
      // Инвалидируем кэш маршрутов для обновления состояния
      queryClient.invalidateQueries({ queryKey: ['routes'] })
      
      // Extract Excel debug logs if available
      const responseData = resp as any;
      if (responseData?.data?.debug?.logs) {
        setExcelLogs(responseData.data.debug.logs);
        log(`Excel логи отримано: ${responseData.data.debug.logs.length} записів`);
      }
      
      // Показываем предпросмотр данных
      setPreviewData(data);
      setShowDataPreview(true);
      queryClient.invalidateQueries({ queryKey: ['routes'] })
    },
    onError: (error: any) => {
      console.error('Ошибка обработки файла:', error)
      const msg = error?.response?.data?.error || error?.message || 'Не вдалося обробити файл'
      toast.error(msg)
      log(`Помилка обробки файлу: ${msg}`)
    },
  })




  const handleExcelFileSelect = (file: File) => {
    setSelectedFile(file)
    // НЕ очищаем предыдущие результаты - будем объединять данные
    log(`Выбран Excel файл: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`)
  }

  const handleExcelProcessFile = () => {
    if (selectedFile) {
      log(`Начинаем обработку файла: ${selectedFile.name}`)
      processFileMutation.mutate(selectedFile)
    }
  }

  const handleClearExcelResults = () => {
    clearExcelData()
    setSelectedFile(null)
    setPreviewData(null)
    setShowDataPreview(false)
    setExcelLogs([])
    
    // Очищаем localStorage
    try {
      localStorage.removeItem('km_dashboard_excel_logs')
    } catch (error) {
      console.warn('Ошибка очистки localStorage:', error)
    }
    
    log('Результаты Excel обработки очищены (можно загрузить новые файлы)')
  }

  // Обработчик для HTML данных
  const handleHtmlDataLoad = (data: any) => {
    try {
      // Нормализуем данные HTML в тот же формат, что и Excel
      const orders = Array.isArray(data.orders) ? data.orders : []
      const couriers = Array.isArray(data.couriers) ? data.couriers : []
      const paymentMethods = Array.isArray(data.paymentMethods) ? data.paymentMethods : []
      const routes = Array.isArray(data.routes) ? data.routes : []
      const errorsArr = Array.isArray(data.errors) ? data.errors : []
      
      // Преобразуем объекты ошибок в строки
      const errorsAsStrings = errorsArr.map((error: any) => 
        typeof error === 'string' ? error : `Строка ${error.row || 'N/A'}: ${error.message || 'Неизвестная ошибка'}`
      )

      const newData: any = {
        orders,
        couriers,
        paymentMethods,
        routes,
        errors: errorsAsStrings,
        summary: {
          totalRows: orders.length + couriers.length + paymentMethods.length + routes.length,
          successfulGeocoding: 0,
          failedGeocoding: 0,
          orders: orders.length,
          couriers: couriers.length,
          paymentMethods: paymentMethods.length,
          errors: errorsAsStrings
        }
      }

      // Объединяем новые данные с существующими
      let mergedData: any
      const newOrdersCount = orders.length
      const existingOrdersCount = excelData?.orders?.length || 0
      
      try {
        mergedData = mergeExcelData(newData, excelData || null)
        if (mergedData && excelData?.routes && excelData.routes.length > 0 && (!mergedData.routes || mergedData.routes.length === 0)) {
          mergedData.routes = [...excelData.routes]
        }
        
        // Убеждаемся, что все массивы определены
        if (!mergedData.orders) mergedData.orders = []
        if (!mergedData.couriers) mergedData.couriers = []
        if (!mergedData.paymentMethods) mergedData.paymentMethods = []
        if (!mergedData.routes) mergedData.routes = []
        if (!mergedData.errors) mergedData.errors = []
        
        // Сохраняем данные в контекст (это автоматически сохранит в localStorage)
        setExcelData(mergedData)
        
        // Логируем результаты объединения
        const finalOrdersCount = mergedData.orders.length
        
        log(`HTML файл обработан: заказов=${newOrdersCount}, курьеров=${couriers.length}, ошибок=${errorsAsStrings.length}`)
        log(`Объединение: было=${existingOrdersCount}, новых=${newOrdersCount}, стало=${finalOrdersCount} заказов`)
        
        if (finalOrdersCount === existingOrdersCount && newOrdersCount > 0) {
          log(`⚠️ ВНИМАНИЕ: Новые заказы не добавились! Возможно, все заказы считаются дубликатами.`)
        }
        
        // Показываем предпросмотр данных
        setPreviewData(data)
        setShowDataPreview(true)
        
        // Инвалидируем кэш маршрутов для обновления состояния
        queryClient.invalidateQueries({ queryKey: ['routes'] })
        
        toast.success(`Успешно загружено ${newOrdersCount} заказов из HTML файла`)
      } catch (error) {
        console.error('Ошибка при объединении HTML данных:', error)
        // Если объединение не удалось, просто используем новые данные
        if (newData && excelData?.routes && excelData.routes.length > 0 && (!newData.routes || newData.routes.length === 0)) {
          newData.routes = [...excelData.routes]
        }
        
        // Убеждаемся, что все массивы определены
        if (!newData.orders) newData.orders = []
        if (!newData.couriers) newData.couriers = []
        if (!newData.paymentMethods) newData.paymentMethods = []
        if (!newData.routes) newData.routes = []
        if (!newData.errors) newData.errors = []
        
        setExcelData(newData)
        setPreviewData(data)
        setShowDataPreview(true)
        queryClient.invalidateQueries({ queryKey: ['routes'] })
        log(`Ошибка объединения HTML данных, используются только новые данные`)
        toast.success(`Успешно загружено ${newOrdersCount} заказов из HTML файла`)
      }
    } catch (error: any) {
      console.error('Ошибка обработки HTML данных:', error)
      toast.error(`Ошибка обработки HTML данных: ${error.message || 'Неизвестная ошибка'}`)
      log(`Ошибка обработки HTML данных: ${error.message || 'Неизвестная ошибка'}`)
    }
  }

  const handleConfirmPreview = () => {
    setShowDataPreview(false)
    toast.success('Данные успешно сохранены!')
    log('Пользователь подтвердил сохранение данных из Excel')
  }

  return (
    <div className={clsx(
      'space-y-6 transition-colors duration-300',
      isDark ? 'text-gray-100' : 'text-gray-900'
    )}>
      {/* API Key Notification */}
      <ApiKeyNotification />

      {/* Excel Upload Section */}
      <ExcelUploadSection
        onFileSelect={handleExcelFileSelect}
        onProcessFile={handleExcelProcessFile}
        selectedFile={selectedFile}
        isProcessing={processFileMutation.isPending}
        processedData={excelData}
        onClearResults={handleClearExcelResults}
        onHtmlDataLoad={handleHtmlDataLoad}
      />


      {/* Excel Results Display */}
      {excelData && (
        <ExcelResultsDisplay 
          data={excelData} 
          summary={excelData.summary} 
        />
      )}


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Logs panel */}
        <div className="lg:col-span-2">
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Логи</h2>
              <div className="space-x-2">
                {excelLogs.length > 0 && (
                  <button
                    onClick={() => setShowExcelLogs(true)}
                    className="btn-primary text-sm"
                    title="Показати детальні логи Excel обробки"
                  >
                    Excel логи ({excelLogs.length})
                  </button>
                )}
                <button
                  onClick={() => setLogs([])}
                  className="btn-outline"
                  title="Очистить логи"
                >
                  Очистить логи
                </button>
                {excelData && (
                  <button
                    onClick={() => {
                      if (window.confirm('Вы уверены, что хотите полностью очистить все данные Excel? Это действие нельзя отменить.')) {
                        clearExcelData()
                        setPreviewData(null)
                        setShowDataPreview(false)
                        setExcelLogs([])
                        try {
                          localStorage.removeItem('km_dashboard_processed_data')
                          localStorage.removeItem('km_dashboard_excel_logs')
                          localStorage.removeItem('km_routes')
                          localStorage.removeItem('km_excel_data')
                        } catch {}
                        log('Все данные Excel полностью очищены')
                        toast.success('Все данные Excel очищены')
                      }
                    }}
                    className="btn-outline text-red-600 border-red-300 hover:bg-red-50"
                    title="Полностью очистить все данные Excel"
                  >
                    Очистить все данные
                  </button>
                )}
              </div>
            </div>
            {logs.length === 0 ? (
              <p className={clsx(
                'text-sm',
                isDark ? 'text-gray-400' : 'text-gray-500'
              )}>Пока что нет логов</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2">
                {logs.map((line, idx) => (
                  <div key={idx} className={clsx(
                    'text-xs font-mono border rounded p-2',
                    isDark 
                      ? 'bg-gray-800 border-gray-700 text-gray-300' 
                      : 'bg-gray-50 border-gray-200 text-gray-800'
                  )}>
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>


        {/* Main Content */}
        <div className="lg:col-span-2">
          {/* Content here */}
        </div>
      </div>

      {/* Excel Debug Logs Modal */}
      <Suspense fallback={<LoadingSpinner />}>
        <ExcelDebugLogs 
          logs={excelLogs}
          isVisible={showExcelLogs}
          onClose={() => setShowExcelLogs(false)}
        />
      </Suspense>

      {/* Excel Data Preview Modal */}
      <Suspense fallback={<LoadingSpinner />}>
        <ExcelDataPreview 
          data={previewData}
          isVisible={showDataPreview}
          onClose={() => setShowDataPreview(false)}
          onConfirm={handleConfirmPreview}
        />
      </Suspense>
    </div>
  )
}





























