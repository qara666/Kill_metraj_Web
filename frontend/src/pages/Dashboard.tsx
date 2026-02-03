import React, { useState, useEffect, Suspense, lazy, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { LoadingSpinner } from '../components/shared/LoadingSpinner'
import { ApiKeyNotification } from '../components/modals/ApiKeyNotification'
import { ExcelUploadSection } from '../components/excel/ExcelUploadSection'
import { DashboardApiSection } from '../components/autoplanner/DashboardApiSection'
import { ExcelResultsDisplay } from '../components/excel/ExcelResultsDisplay'
import { useExcelData } from '../contexts/ExcelDataContext'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'

import { clsx } from 'clsx'
import * as api from '../services/api'
import { mergeExcelData } from '../utils/data/dataMerging'
const ExcelDebugLogs = lazy(() => import('../components/excel/ExcelDebugLogs').then(module => ({ default: module.ExcelDebugLogs })))
const ExcelDataPreview = lazy(() => import('../components/excel/ExcelDataPreview').then(module => ({ default: module.ExcelDataPreview })))

export const Dashboard: React.FC = () => {
  const { excelData, setExcelData, clearExcelData } = useExcelData()
  const { isDark } = useTheme()
  const { user } = useAuth()

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [excelLogs, setExcelLogs] = useState<any[]>([])
  const [showExcelLogs, setShowExcelLogs] = useState(false)
  const [showDataPreview, setShowDataPreview] = useState(false)
  const [previewData, setPreviewData] = useState<any>(null)
  const queryClient = useQueryClient()

  const log = useCallback((message: string) => {
    const entry = `${new Date().toLocaleTimeString()} — ${message}`
    setLogs(prev => [entry, ...prev].slice(0, 200))
  }, [])




  useEffect(() => {
    try {
      const storedLogs = localStorage.getItem('km_dashboard_logs')
      if (storedLogs) {
        const parsed = JSON.parse(storedLogs)
        if (Array.isArray(parsed)) {
          setLogs(parsed)
        }
      }


      const storedExcelLogs = localStorage.getItem('km_dashboard_excel_logs')
      if (storedExcelLogs) {
        const parsed = JSON.parse(storedExcelLogs)
        if (Array.isArray(parsed)) {
          setExcelLogs(parsed)
        }
      }
    } catch (error) {
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('km_dashboard_logs', JSON.stringify(logs))
    } catch { }
  }, [logs])


  useEffect(() => {
    try {
      if (excelLogs.length > 0) {
        localStorage.setItem('km_dashboard_excel_logs', JSON.stringify(excelLogs))
      }
    } catch { }
  }, [excelLogs])


  const processFileMutation = useMutation({
    mutationFn: api.uploadApi.uploadExcelFile,
    onSuccess: (resp: any) => {
      const data: any = resp?.data || {}
      const orders = Array.isArray((data as any).orders) ? (data as any).orders : []
      const couriers = Array.isArray((data as any).couriers) ? (data as any).couriers : []
      const paymentMethods = Array.isArray((data as any).paymentMethods) ? (data as any).paymentMethods : []
      const routes = Array.isArray((data as any).routes) ? (data as any).routes : []
      const errorsArr = Array.isArray((data as any).errors) ? (data as any).errors : []
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

      let mergedData: any
      try {
        mergedData = mergeExcelData(newData, excelData || null)
        if (mergedData && excelData?.routes && excelData.routes.length > 0 && (!mergedData.routes || mergedData.routes.length === 0)) {
          mergedData.routes = [...excelData.routes]
        }

        if (!mergedData.orders) mergedData.orders = []
        if (!mergedData.couriers) mergedData.couriers = []
        if (!mergedData.paymentMethods) mergedData.paymentMethods = []
        if (!mergedData.routes) mergedData.routes = []
        if (!mergedData.errors) mergedData.errors = []

        setExcelData(mergedData)

        try {
          const saved = localStorage.getItem('km_dashboard_processed_data')
          if (saved) {
            const parsed = JSON.parse(saved)
            log(`Данные сохранены в localStorage: ${parsed?.orders?.length || 0} заказов, ${parsed?.couriers?.length || 0} курьеров`)
          } else {
            log(`Предупреждение: Данные не сохранились в localStorage!`)
          }
        } catch (e) {
        }
        const existingOrdersCount = excelData?.orders?.length || 0
        const newOrdersCount = (orders as any[]).length
        const finalOrdersCount = mergedData.orders.length

        log(`Файл обработан: заказов=${newOrdersCount}, геокодировано=${newData.summary.successfulGeocoding}, ошибок=${(newData.summary.errors as any[]).length}.`)
        log(`Объединение: было=${existingOrdersCount}, новых=${newOrdersCount}, стало=${finalOrdersCount} заказов.`)

        if (finalOrdersCount === existingOrdersCount && newOrdersCount > 0) {
          log(`ВНИМАНИЕ: Новые заказы не добавились! Возможно, все заказы считаются дубликатами.`)
        }

      } catch (error) {
        if (newData && excelData?.routes && excelData.routes.length > 0 && (!newData.routes || newData.routes.length === 0)) {
          newData.routes = [...excelData.routes]
        }

        if (!newData.orders) newData.orders = []
        if (!newData.couriers) newData.couriers = []
        if (!newData.paymentMethods) newData.paymentMethods = []
        if (!newData.routes) newData.routes = []
        if (!newData.errors) newData.errors = []

        setExcelData(newData)
        mergedData = newData
        log(`Ошибка объединения данных, используются только новые данные`)
      }

      queryClient.invalidateQueries({ queryKey: ['routes'] })
      const responseData = resp as any;
      if (responseData?.data?.debug?.logs) {
        setExcelLogs(responseData.data.debug.logs);
        log(`Excel логи получены: ${responseData.data.debug.logs.length} записей`);
      }

      setPreviewData(data);
      setShowDataPreview(true);
      queryClient.invalidateQueries({ queryKey: ['routes'] })
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.error || error?.message || 'Не удалось обработать файл'
      toast.error(msg)
      log(`Ошибка обработки файла: ${msg}`)
    },
  })




  const handleExcelFileSelect = useCallback((file: File) => {
    setSelectedFile(file)
    log(`Выбран Excel файл: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`)
  }, [log])

  const handleExcelProcessFile = useCallback(() => {
    if (selectedFile) {
      log(`Начинаем обработку файла: ${selectedFile.name}`)
      processFileMutation.mutate(selectedFile)
    }
  }, [selectedFile, processFileMutation, log])

  const handleClearExcelResults = useCallback(() => {
    clearExcelData()
    setSelectedFile(null)
    setPreviewData(null)
    setShowDataPreview(false)
    setExcelLogs([])

    try {
      localStorage.removeItem('km_dashboard_excel_logs')
    } catch (error) {
    }

    log('Результаты Excel обработки очищены (можно загрузить новые файлы)')
  }, [clearExcelData, log])

  const handleHtmlDataLoad = useCallback((data: any) => {
    try {
      const orders = Array.isArray(data.orders) ? data.orders : []
      const couriers = Array.isArray(data.couriers) ? data.couriers : []
      const paymentMethods = Array.isArray(data.paymentMethods) ? data.paymentMethods : []
      const routes = Array.isArray(data.routes) ? data.routes : []
      const errorsArr = Array.isArray(data.errors) ? data.errors : []

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

      let mergedData: any
      const newOrdersCount = orders.length
      const existingOrdersCount = excelData?.orders?.length || 0

      try {
        mergedData = mergeExcelData(newData, excelData || null)
        if (mergedData && excelData?.routes && excelData.routes.length > 0 && (!mergedData.routes || mergedData.routes.length === 0)) {
          mergedData.routes = [...excelData.routes]
        }

        if (!mergedData.orders) mergedData.orders = []
        if (!mergedData.couriers) mergedData.couriers = []
        if (!mergedData.paymentMethods) mergedData.paymentMethods = []
        if (!mergedData.routes) mergedData.routes = []
        if (!mergedData.errors) mergedData.errors = []

        setExcelData(mergedData)

        const finalOrdersCount = mergedData.orders.length

        log(`HTML файл обработан: заказов=${newOrdersCount}, курьеров=${couriers.length}, ошибок=${errorsAsStrings.length}`)
        log(`Объединение: было=${existingOrdersCount}, новых=${newOrdersCount}, стало=${finalOrdersCount} заказов`)

        if (finalOrdersCount === existingOrdersCount && newOrdersCount > 0) {
          log(`ВНИМАНИЕ: Новые заказы не добавились! Возможно, все заказы считаются дубликатами.`)
        }

        setPreviewData(data)
        setShowDataPreview(true)

        queryClient.invalidateQueries({ queryKey: ['routes'] })

        toast.success(`Успешно загружено ${newOrdersCount} заказов из HTML файла`)
      } catch (error) {
        if (newData && excelData?.routes && excelData.routes.length > 0 && (!newData.routes || newData.routes.length === 0)) {
          newData.routes = [...excelData.routes]
        }

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
      toast.error(`Ошибка обработки HTML данных: ${error.message || 'Неизвестная ошибка'}`)
      log(`Ошибка обработки HTML данных: ${error.message || 'Неизвестная ошибка'}`)
    }
  }, [excelData, setExcelData, queryClient, log])

  const handleConfirmPreview = useCallback(() => {
    setShowDataPreview(false)
    toast.success('Данные успешно сохранены!')
    log('Пользователь подтвердил сохранение данных из Excel')
  }, [log])

  return (
    <div className={clsx(
      'space-y-6 transition-colors duration-300',
      isDark ? 'text-gray-100' : 'text-gray-900'
    )}>
      <ApiKeyNotification />

      <div className="space-y-8">
        <DashboardApiSection />

        <ExcelUploadSection
          onFileSelect={handleExcelFileSelect}
          onProcessFile={handleExcelProcessFile}
          selectedFile={selectedFile}
          isProcessing={processFileMutation.isPending}
          processedData={excelData}
          onClearResults={handleClearExcelResults}
          onHtmlDataLoad={handleHtmlDataLoad}
        />
      </div>

      {excelData && (
        <ExcelResultsDisplay
          data={excelData}
          summary={excelData.summary}
        />
      )}


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {user?.role === 'admin' && (
          <div className="lg:col-span-2">
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className={clsx(
                  'text-lg font-semibold',
                  isDark ? 'text-gray-100' : 'text-gray-900'
                )}>Логи (только для админа)</h2>
                <div className="space-x-2">
                  {excelLogs.length > 0 && (
                    <button
                      onClick={() => setShowExcelLogs(true)}
                      className="btn-primary text-sm"
                      title="Показать детальные логи Excel обработки"
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
                          } catch { }
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
        )}

        <div className="lg:col-span-2">
        </div>
      </div>

      <Suspense fallback={<LoadingSpinner />}>
        <ExcelDebugLogs
          logs={excelLogs}
          isVisible={showExcelLogs}
          onClose={() => setShowExcelLogs(false)}
        />
      </Suspense>

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





























