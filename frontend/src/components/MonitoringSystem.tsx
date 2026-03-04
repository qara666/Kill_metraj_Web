import React, { useState, useMemo, useEffect } from 'react'
import { useExcelData } from '../contexts/ExcelDataContext'
import { useTheme } from '../contexts/ThemeContext'
import { CourierLocation } from '../types'
import { MonitoringHeader } from './monitoring/MonitoringHeader'
import { MonitoringCourierTracking } from './monitoring/MonitoringCourierTracking'

export const MonitoringSystem: React.FC = () => {
  const { excelData } = useExcelData()
  const { isDark } = useTheme()
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [courierLocations, setCourierLocations] = useState<CourierLocation[]>([])

  // Инициализация курьеров
  useEffect(() => {
    if (excelData?.couriers) {
      const initialLocations: CourierLocation[] = excelData.couriers.map((courier: any) => ({
        courierId: courier.id || courier.name,
        courierName: courier.name,
        currentLocation: { lat: 50.4501 + (Math.random() - 0.5) * 0.1, lng: 30.5234 + (Math.random() - 0.5) * 0.1 },
        lastUpdate: new Date().toISOString(),
        status: Math.random() > 0.3 ? 'online' : 'offline',
        speed: Math.random() * 60,
        heading: Math.random() * 360
      }))
      setCourierLocations(initialLocations)
    }
  }, [excelData?.couriers])

  // Упрощенная статистика мониторинга
  const monitoringStats = useMemo(() => ({
    totalCouriers: courierLocations.length,
    onlineCouriers: courierLocations.filter(c => c.status === 'online').length,
    activeRoutes: excelData?.routes?.filter((route: any) => route.isActive).length || 0,
  }), [courierLocations, excelData?.routes])

  // Запуск мониторинга
  const startMonitoring = () => {
    setIsMonitoring(true)
    const interval = setInterval(() => {
      setCourierLocations(prev => prev.map(courier => ({
        ...courier,
        currentLocation: {
          lat: courier.currentLocation.lat + (Math.random() - 0.5) * 0.001,
          lng: courier.currentLocation.lng + (Math.random() - 0.5) * 0.001
        },
        lastUpdate: new Date().toISOString(),
        speed: Math.random() * 60,
        heading: Math.random() * 360
      })))
    }, 5000)
    return () => clearInterval(interval)
  }

  // Остановка мониторинга
  const stopMonitoring = () => setIsMonitoring(false)

  return (
    <div className="space-y-6">
      <MonitoringHeader
        isDark={isDark}
        isMonitoring={isMonitoring}
        onStartMonitoring={startMonitoring}
        onStopMonitoring={stopMonitoring}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border bg-white dark:bg-gray-800 dark:border-gray-700">
          <span className="text-xs text-gray-400 uppercase">Курьеров</span>
          <div className="text-2xl font-bold">{monitoringStats.totalCouriers}</div>
        </div>
        <div className="p-4 rounded-xl border bg-white dark:bg-gray-800 dark:border-gray-700">
          <span className="text-xs text-gray-400 uppercase">В сети</span>
          <div className="text-2xl font-bold text-green-500">{monitoringStats.onlineCouriers}</div>
        </div>
        <div className="p-4 rounded-xl border bg-white dark:bg-gray-800 dark:border-gray-700">
          <span className="text-xs text-gray-400 uppercase">Активных маршрутов</span>
          <div className="text-2xl font-bold text-blue-500">{monitoringStats.activeRoutes}</div>
        </div>
      </div>

      <MonitoringCourierTracking isDark={isDark} locations={courierLocations} />
    </div>
  )
}
