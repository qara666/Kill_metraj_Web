import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { useExcelData } from '../contexts/ExcelDataContext'
import { useTheme } from '../contexts/ThemeContext'

import { Geofence, GeofenceAlert, CourierLocation, MonitoringStats } from '../types'
import { MonitoringHeader } from './monitoring/MonitoringHeader'
import { MonitoringStatsView } from './monitoring/MonitoringStatsView'
import { MonitoringGeofences } from './monitoring/MonitoringGeofences'
import { MonitoringAlerts } from './monitoring/MonitoringAlerts'
import { MonitoringCourierTracking } from './monitoring/MonitoringCourierTracking'

export const MonitoringSystem: React.FC = () => {
  const { excelData } = useExcelData()
  const { isDark } = useTheme()
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [, setSelectedGeofence] = useState<string>('')
  const [alertFilter, setAlertFilter] = useState<'all' | 'unread' | 'critical'>('all')
  const [courierLocations, setCourierLocations] = useState<CourierLocation[]>([])
  const [geofences, setGeofences] = useState<Geofence[]>([])
  const [alerts, setAlerts] = useState<GeofenceAlert[]>([])

  // Инициализация геозон
  useEffect(() => {
    const initialGeofences: Geofence[] = [
      { id: 'depot_1', name: 'Главный склад', type: 'depot', center: { lat: 50.4501, lng: 30.5234 }, radius: 0.5, color: '#3B82F6', isActive: true, alerts: [] },
      { id: 'zone_center', name: 'Центральная зона доставки', type: 'delivery_zone', center: { lat: 50.4501, lng: 30.5234 }, radius: 5.0, color: '#10B981', isActive: true, alerts: [] },
      { id: 'restricted_area', name: 'Ограниченная зона', type: 'restricted_area', center: { lat: 50.4601, lng: 30.5334 }, radius: 2.0, color: '#EF4444', isActive: true, alerts: [] }
    ]
    setGeofences(initialGeofences)
  }, [])

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

  // Статистика мониторинга
  const monitoringStats = useMemo((): MonitoringStats => ({
    totalCouriers: courierLocations.length,
    onlineCouriers: courierLocations.filter(c => c.status === 'online').length,
    activeRoutes: excelData?.routes?.filter((route: any) => route.isActive).length || 0,
    totalAlerts: alerts.length,
    unreadAlerts: alerts.filter(a => !a.isRead).length,
    geofenceViolations: alerts.filter(a => a.type === 'violation').length
  }), [courierLocations, alerts, excelData?.routes])

  // Расчет расстояния между точками
  const calculateDistance = (point1: { lat: number; lng: number }, point2: { lat: number; lng: number }): number => {
    const R = 6371
    const dLat = (point2.lat - point1.lat) * Math.PI / 180
    const dLng = (point2.lng - point1.lng) * Math.PI / 180
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  // Проверка геозон
  const checkGeofences = useCallback(() => {
    const newAlerts: GeofenceAlert[] = []
    courierLocations.forEach(courier => {
      geofences.forEach(geofence => {
        if (!geofence.isActive) return
        const distance = calculateDistance(courier.currentLocation, geofence.center)
        if (distance <= geofence.radius) {
          newAlerts.push({
            id: `alert_${Date.now()}_${courier.courierId}`,
            type: geofence.type === 'restricted_area' ? 'violation' : 'entry',
            courier: courier.courierName,
            message: `Курьер ${courier.courierName} вошел в ${geofence.type === 'restricted_area' ? 'ограниченную ' : ''}зону "${geofence.name}"`,
            timestamp: new Date().toISOString(),
            severity: geofence.type === 'restricted_area' ? 'high' : 'low',
            isRead: false,
            location: courier.currentLocation
          })
        }
      })
    })
    if (newAlerts.length > 0) setAlerts(prev => [...prev, ...newAlerts])
  }, [courierLocations, geofences])

  // Запуск мониторинга
  const startMonitoring = useCallback(() => {
    setIsMonitoring(true)
    const interval = setInterval(() => {
      setCourierLocations(prev => prev.map(courier => ({
        ...courier,
        currentLocation: { lat: courier.currentLocation.lat + (Math.random() - 0.5) * 0.001, lng: courier.currentLocation.lng + (Math.random() - 0.5) * 0.001 },
        lastUpdate: new Date().toISOString(),
        speed: Math.random() * 60,
        heading: Math.random() * 360
      })))
      checkGeofences()
    }, 5000)
    return () => clearInterval(interval)
  }, [checkGeofences])

  // Остановка мониторинга
  const stopMonitoring = useCallback(() => setIsMonitoring(false), [])

  // Фильтрация алертов
  const filteredAlerts = useMemo(() => {
    switch (alertFilter) {
      case 'unread': return alerts.filter(alert => !alert.isRead)
      case 'critical': return alerts.filter(alert => alert.severity === 'critical' || alert.severity === 'high')
      default: return alerts
    }
  }, [alerts, alertFilter])

  return (
    <div className="space-y-6">
      <MonitoringHeader
        isDark={isDark}
        isMonitoring={isMonitoring}
        onStartMonitoring={startMonitoring}
        onStopMonitoring={stopMonitoring}
      />

      <MonitoringStatsView isDark={isDark} stats={monitoringStats} />

      <MonitoringGeofences
        isDark={isDark}
        geofences={geofences}
        onCreateGeofence={() => setGeofences(prev => [...prev, { id: `geofence_${Date.now()}`, name: `Новая зона ${prev.length + 1}`, type: 'custom', center: { lat: 50.4501, lng: 30.5234 }, radius: 1.0, color: '#8B5CF6', isActive: true, alerts: [] }])}
        onDeleteGeofence={(id) => setGeofences(prev => prev.filter(g => g.id !== id))}
        onSelectGeofence={setSelectedGeofence}
      />

      <MonitoringAlerts
        isDark={isDark}
        alerts={filteredAlerts}
        filter={alertFilter}
        onFilterChange={setAlertFilter}
        onMarkAsRead={(id) => setAlerts(prev => prev.map(a => a.id === id ? { ...a, isRead: true } : a))}
        onMarkAllAsRead={() => setAlerts(prev => prev.map(a => ({ ...a, isRead: true })))}
      />

      <MonitoringCourierTracking isDark={isDark} locations={courierLocations} />
    </div>
  )
}

































