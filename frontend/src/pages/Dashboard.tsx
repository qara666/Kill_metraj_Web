import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { 
  UserGroupIcon, 
  MapIcon, 
  TruckIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline'
import { CourierCard } from '../components/CourierCard'
import RouteMap from '../components/RouteMap'
import { StatsCard } from '../components/StatsCard'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { ApiKeyNotification } from '../components/ApiKeyNotification'
import { ExcelUploadSection } from '../components/ExcelUploadSection'
import { ExcelResultsDisplay } from '../components/ExcelResultsDisplay'
import { ExcelDebugLogs } from '../components/ExcelDebugLogs'
import { ExcelDataPreview } from '../components/ExcelDataPreview'
import { useExcelData } from '../contexts/ExcelDataContext'
import * as api from '../services/api'

export const Dashboard: React.FC = () => {
  const { excelData, setExcelData, clearExcelData } = useExcelData()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedCourier, setSelectedCourier] = useState<string | null>(null)
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

      // Восстанавливаем обработанные данные
      const storedData = localStorage.getItem('km_dashboard_processed_data')
      if (storedData) {
        const parsed = JSON.parse(storedData)
        if (parsed && typeof parsed === 'object') {
          setProcessedData(parsed)
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

  // Persist processed data to localStorage whenever it changes
  useEffect(() => {
    try {
      if (processedData) {
        localStorage.setItem('km_dashboard_processed_data', JSON.stringify(processedData))
      }
    } catch {}
  }, [processedData])

  // Persist Excel logs to localStorage whenever they change
  useEffect(() => {
    try {
      if (excelLogs.length > 0) {
        localStorage.setItem('km_dashboard_excel_logs', JSON.stringify(excelLogs))
      }
    } catch {}
  }, [excelLogs])

  // Fetch dashboard data
  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.analyticsApi.getDashboardAnalytics(),
    // Убрали автоматическое обновление каждые 30 секунд
  })

  // Fetch couriers
  const { data: couriersData, isLoading: couriersLoading } = useQuery({
    queryKey: ['couriers'],
    queryFn: () => api.courierApi.getCouriers({ limit: 10 }),
  })

  // Fetch routes
  const { data: routesData, isLoading: routesLoading } = useQuery({
    queryKey: ['routes'],
    queryFn: () => api.routeApi.getRoutes({ limit: 10 }),
  })

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

      const normalized: any = {
        orders,
        couriers,
        paymentMethods,
        routes,
        errors: errorsArr,
        summary: {
          totalRows: orders.length + couriers.length + paymentMethods.length + routes.length,
          successfulGeocoding: 0,
          failedGeocoding: 0,
          orders: orders.length,
          couriers: couriers.length,
          paymentMethods: paymentMethods.length,
          errors: errorsArr
        }
      }

      setExcelData(normalized)
      
      // Extract Excel debug logs if available
      const responseData = resp as any;
      if (responseData?.data?.debug?.logs) {
        setExcelLogs(responseData.data.debug.logs);
        log(`Excel логи отримано: ${responseData.data.debug.logs.length} записів`);
      }
      
      // Показываем предпросмотр данных
      setPreviewData(data);
      setShowDataPreview(true);
      
      const ordersCount = (orders as any[]).length
      log(`Файл оброблено: замовлень=${ordersCount}, геокодовано=${normalized.summary.successfulGeocoding}, помилок=${(normalized.summary.errors as any[]).length}`)
      queryClient.invalidateQueries({ queryKey: ['routes'] })
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.error || 'Не вдалося обробити файл'
      toast.error(msg)
      log(`Помилка обробки файлу: ${msg}`)
    },
  })




  const handleExcelFileSelect = (file: File) => {
    setSelectedFile(file)
    clearExcelData() // Очищаем предыдущие результаты
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
    
    log('Результаты Excel обработки очищены')
  }

  const handleConfirmPreview = () => {
    setShowDataPreview(false)
    toast.success('Данные успешно сохранены!')
    log('Пользователь подтвердил сохранение данных из Excel')
  }

  if (dashboardLoading || couriersLoading || routesLoading) {
    return <LoadingSpinner />
  }

  const stats = dashboardData?.data?.overview
  const couriers = couriersData?.data || []
  const routes = routesData?.data || []

  return (
    <div className="space-y-6">
      {/* API Key Notification */}
      <ApiKeyNotification />
      

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            title="Всього маршрутів"
            value={stats.totalRoutes}
            icon={MapIcon}
            color="primary"
            change={`${stats.activeRoutes} активних`}
          />
          <StatsCard
            title="Всього курєрів"
            value={stats.totalCouriers}
            icon={UserGroupIcon}
            color="success"
            change={`${stats.activeCouriers} активних`}
          />
          <StatsCard
            title="Всього замовлень"
            value={stats.totalOrders}
            icon={TruckIcon}
            color="warning"
            change={`${stats.averageOrdersPerRoute.toFixed(1)} середнє/маршрут`}
          />
          <StatsCard
            title="Відсоток виконання"
            value={`${stats.completionRate.toFixed(1)}%`}
            icon={CheckCircleIcon}
            color="success"
            change={`${stats.completedRoutes} завершено`}
          />
        </div>
      )}

      {/* Excel Upload Section */}
      <ExcelUploadSection
        onFileSelect={handleExcelFileSelect}
        onProcessFile={handleExcelProcessFile}
        selectedFile={selectedFile}
        isProcessing={processFileMutation.isPending}
        processedData={excelData}
        onClearResults={handleClearExcelResults}
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
                  title="Очистити логи"
                >
                  Очистити логи
                </button>
              </div>
            </div>
            {logs.length === 0 ? (
              <p className="text-sm text-gray-500">Поки що немає логів</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2">
                {logs.map((line, idx) => (
                  <div key={idx} className="text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2">
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>


        {/* Main Content */}
        <div className="lg:col-span-2">
          <div className="space-y-6">
            {/* Couriers Section */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Останні курєри ({couriers.length})
              </h2>
              
              {couriers.length === 0 ? (
                <div className="text-center py-8">
                  <UserGroupIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">Немає курєрів</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Завантажте Excel файл для створення курєрів та маршрутів.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {couriers.slice(0, 4).map((courier: any) => (
                    <CourierCard
                      key={courier._id}
                      courier={courier}
                      isSelected={selectedCourier === courier._id}
                      onSelect={() => setSelectedCourier(
                        selectedCourier === courier._id ? null : courier._id
                      )}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Map Section */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Карта маршрутів
              </h2>
              
              <RouteMap 
                routes={routes}
                selectedCourier={selectedCourier || undefined}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Excel Debug Logs Modal */}
      <ExcelDebugLogs 
        logs={excelLogs}
        isVisible={showExcelLogs}
        onClose={() => setShowExcelLogs(false)}
      />

      {/* Excel Data Preview Modal */}
      <ExcelDataPreview 
        data={previewData}
        isVisible={showDataPreview}
        onClose={() => setShowDataPreview(false)}
        onConfirm={handleConfirmPreview}
      />
    </div>
  )
}
