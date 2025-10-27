import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { 
  MapIcon, 
  BellIcon, 
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  TruckIcon,
  EyeIcon,
  ShieldCheckIcon,
  PlayIcon,
  StopIcon
} from '@heroicons/react/24/outline'
import { useExcelData } from '../contexts/ExcelDataContext'
import { useTheme } from '../contexts/ThemeContext'
import { clsx } from 'clsx'

interface Geofence {
  id: string
  name: string
  type: 'delivery_zone' | 'restricted_area' | 'depot' | 'custom'
  center: { lat: number; lng: number }
  radius: number
  color: string
  isActive: boolean
  alerts: GeofenceAlert[]
}

interface GeofenceAlert {
  id: string
  type: 'entry' | 'exit' | 'violation' | 'delay'
  courier: string
  message: string
  timestamp: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  isRead: boolean
  location: { lat: number; lng: number }
}

interface CourierLocation {
  courierId: string
  courierName: string
  currentLocation: { lat: number; lng: number }
  lastUpdate: string
  status: 'online' | 'offline' | 'busy' | 'idle'
  currentRoute?: string
  speed: number
  heading: number
}

interface MonitoringStats {
  totalCouriers: number
  onlineCouriers: number
  activeRoutes: number
  totalAlerts: number
  unreadAlerts: number
  geofenceViolations: number
}

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
      {
        id: 'depot_1',
        name: 'Главный склад',
        type: 'depot',
        center: { lat: 50.4501, lng: 30.5234 },
        radius: 0.5,
        color: '#3B82F6',
        isActive: true,
        alerts: []
      },
      {
        id: 'zone_center',
        name: 'Центральная зона доставки',
        type: 'delivery_zone',
        center: { lat: 50.4501, lng: 30.5234 },
        radius: 5.0,
        color: '#10B981',
        isActive: true,
        alerts: []
      },
      {
        id: 'restricted_area',
        name: 'Ограниченная зона',
        type: 'restricted_area',
        center: { lat: 50.4601, lng: 30.5334 },
        radius: 2.0,
        color: '#EF4444',
        isActive: true,
        alerts: []
      }
    ]
    
    setGeofences(initialGeofences)
  }, [])

  // Инициализация курьеров
  useEffect(() => {
    if (excelData?.couriers) {
      const initialLocations: CourierLocation[] = excelData.couriers.map((courier: any) => ({
        courierId: courier.id || courier.name,
        courierName: courier.name,
        currentLocation: {
          lat: 50.4501 + (Math.random() - 0.5) * 0.1,
          lng: 30.5234 + (Math.random() - 0.5) * 0.1
        },
        lastUpdate: new Date().toISOString(),
        status: Math.random() > 0.3 ? 'online' : 'offline',
        speed: Math.random() * 60,
        heading: Math.random() * 360
      }))
      
      setCourierLocations(initialLocations)
    }
  }, [excelData?.couriers])

  // Статистика мониторинга
  const monitoringStats = useMemo((): MonitoringStats => {
    return {
      totalCouriers: courierLocations.length,
      onlineCouriers: courierLocations.filter(c => c.status === 'online').length,
      activeRoutes: excelData?.routes?.filter((route: any) => route.isActive).length || 0,
      totalAlerts: alerts.length,
      unreadAlerts: alerts.filter(a => !a.isRead).length,
      geofenceViolations: alerts.filter(a => a.type === 'violation').length
    }
  }, [courierLocations, alerts, excelData?.routes])

  // Запуск мониторинга
  const startMonitoring = useCallback(() => {
    setIsMonitoring(true)
    
    // Имитация обновления местоположения курьеров
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
      
      // Проверка геозон
      checkGeofences()
      
    }, 5000)
    
    return () => clearInterval(interval)
  }, [])

  // Остановка мониторинга
  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false)
  }, [])

  // Проверка геозон
  const checkGeofences = useCallback(() => {
    const newAlerts: GeofenceAlert[] = []
    
    courierLocations.forEach(courier => {
      geofences.forEach(geofence => {
        if (!geofence.isActive) return
        
        const distance = calculateDistance(
          courier.currentLocation,
          geofence.center
        )
        
        // Проверка входа в зону
        if (distance <= geofence.radius) {
          if (geofence.type === 'restricted_area') {
            newAlerts.push({
              id: `alert_${Date.now()}_${courier.courierId}`,
              type: 'violation',
              courier: courier.courierName,
              message: `Курьер ${courier.courierName} вошел в ограниченную зону "${geofence.name}"`,
              timestamp: new Date().toISOString(),
              severity: 'high',
              isRead: false,
              location: courier.currentLocation
            })
          } else {
            newAlerts.push({
              id: `alert_${Date.now()}_${courier.courierId}`,
              type: 'entry',
              courier: courier.courierName,
              message: `Курьер ${courier.courierName} вошел в зону "${geofence.name}"`,
              timestamp: new Date().toISOString(),
              severity: 'low',
              isRead: false,
              location: courier.currentLocation
            })
          }
        }
      })
    })
    
    if (newAlerts.length > 0) {
      setAlerts(prev => [...prev, ...newAlerts])
    }
  }, [courierLocations, geofences])

  // Расчет расстояния между точками
  const calculateDistance = (point1: { lat: number; lng: number }, point2: { lat: number; lng: number }): number => {
    const R = 6371 // Радиус Земли в км
    const dLat = (point2.lat - point1.lat) * Math.PI / 180
    const dLng = (point2.lng - point1.lng) * Math.PI / 180
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    return R * c
  }

  // Отметка алерта как прочитанного
  const markAlertAsRead = useCallback((alertId: string) => {
    setAlerts(prev => prev.map(alert => 
      alert.id === alertId ? { ...alert, isRead: true } : alert
    ))
  }, [])

  // Отметка всех алертов как прочитанных
  const markAllAlertsAsRead = useCallback(() => {
    setAlerts(prev => prev.map(alert => ({ ...alert, isRead: true })))
  }, [])

  // Фильтрация алертов
  const filteredAlerts = useMemo(() => {
    switch (alertFilter) {
      case 'unread':
        return alerts.filter(alert => !alert.isRead)
      case 'critical':
        return alerts.filter(alert => alert.severity === 'critical' || alert.severity === 'high')
      default:
        return alerts
    }
  }, [alerts, alertFilter])

  // Создание новой геозоны
  const createGeofence = useCallback((geofence: Omit<Geofence, 'id' | 'alerts'>) => {
    const newGeofence: Geofence = {
      ...geofence,
      id: `geofence_${Date.now()}`,
      alerts: []
    }
    
    setGeofences(prev => [...prev, newGeofence])
  }, [])

  // Удаление геозоны
  const deleteGeofence = useCallback((geofenceId: string) => {
    setGeofences(prev => prev.filter(g => g.id !== geofenceId))
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={clsx(
        'rounded-lg shadow-sm border p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className={clsx(
              'text-2xl font-bold',
              isDark ? 'text-white' : 'text-gray-900'
            )}>
              Система мониторинга
            </h1>
            <p className={clsx(
              'mt-1 text-sm',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              Геозоны, алерты и отслеживание курьеров в реальном времени
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <div className={clsx(
              'flex items-center space-x-2 px-3 py-1 rounded-full text-sm',
              isMonitoring ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            )}>
              <div className={clsx(
                'w-2 h-2 rounded-full',
                isMonitoring ? 'bg-green-500' : 'bg-gray-400'
              )}></div>
              <span>{isMonitoring ? 'Активен' : 'Неактивен'}</span>
            </div>
            
            <div className="flex space-x-2">
              {!isMonitoring ? (
                <button
                  onClick={startMonitoring}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                >
                  <PlayIcon className="h-4 w-4 mr-2 inline" />
                  Запустить
                </button>
              ) : (
                <button
                  onClick={stopMonitoring}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                >
                  <StopIcon className="h-4 w-4 mr-2 inline" />
                  Остановить
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Статистика мониторинга */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className={clsx(
          'rounded-lg shadow-sm border p-4 text-center',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <TruckIcon className="h-8 w-8 text-blue-600 mx-auto mb-2" />
          <p className={clsx(
            'text-2xl font-bold',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            {monitoringStats.totalCouriers}
          </p>
          <p className={clsx(
            'text-sm',
            isDark ? 'text-gray-400' : 'text-gray-600'
          )}>
            Всего курьеров
          </p>
        </div>
        
        <div className={clsx(
          'rounded-lg shadow-sm border p-4 text-center',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <CheckCircleIcon className="h-8 w-8 text-green-600 mx-auto mb-2" />
          <p className={clsx(
            'text-2xl font-bold',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            {monitoringStats.onlineCouriers}
          </p>
          <p className={clsx(
            'text-sm',
            isDark ? 'text-gray-400' : 'text-gray-600'
          )}>
            Онлайн
          </p>
        </div>
        
        <div className={clsx(
          'rounded-lg shadow-sm border p-4 text-center',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <MapIcon className="h-8 w-8 text-purple-600 mx-auto mb-2" />
          <p className={clsx(
            'text-2xl font-bold',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            {monitoringStats.activeRoutes}
          </p>
          <p className={clsx(
            'text-sm',
            isDark ? 'text-gray-400' : 'text-gray-600'
          )}>
            Активных маршрутов
          </p>
        </div>
        
        <div className={clsx(
          'rounded-lg shadow-sm border p-4 text-center',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <BellIcon className="h-8 w-8 text-orange-600 mx-auto mb-2" />
          <p className={clsx(
            'text-2xl font-bold',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            {monitoringStats.totalAlerts}
          </p>
          <p className={clsx(
            'text-sm',
            isDark ? 'text-gray-400' : 'text-gray-600'
          )}>
            Всего алертов
          </p>
        </div>
        
        <div className={clsx(
          'rounded-lg shadow-sm border p-4 text-center',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <ExclamationTriangleIcon className="h-8 w-8 text-red-600 mx-auto mb-2" />
          <p className={clsx(
            'text-2xl font-bold',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            {monitoringStats.unreadAlerts}
          </p>
          <p className={clsx(
            'text-sm',
            isDark ? 'text-gray-400' : 'text-gray-600'
          )}>
            Непрочитанных
          </p>
        </div>
        
        <div className={clsx(
          'rounded-lg shadow-sm border p-4 text-center',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <ShieldCheckIcon className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
          <p className={clsx(
            'text-2xl font-bold',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            {monitoringStats.geofenceViolations}
          </p>
          <p className={clsx(
            'text-sm',
            isDark ? 'text-gray-400' : 'text-gray-600'
          )}>
            Нарушений
          </p>
        </div>
      </div>

      {/* Геозоны */}
      <div className={clsx(
        'rounded-lg shadow-sm border p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={clsx(
            'text-lg font-medium',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            Геозоны
          </h3>
          
          <button
            onClick={() => {
              const newGeofence = {
                name: `Новая зона ${geofences.length + 1}`,
                type: 'custom' as const,
                center: { lat: 50.4501, lng: 30.5234 },
                radius: 1.0,
                color: '#8B5CF6',
                isActive: true
              }
              createGeofence(newGeofence)
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <MapIcon className="h-4 w-4 mr-2 inline" />
            Добавить зону
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {geofences.map((geofence) => (
            <div key={geofence.id} className={clsx(
              'p-4 rounded-lg border',
              isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
            )}>
              <div className="flex items-center justify-between mb-2">
                <h4 className={clsx(
                  'font-medium',
                  isDark ? 'text-white' : 'text-gray-900'
                )}>
                  {geofence.name}
                </h4>
                
                <div className="flex items-center space-x-2">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: geofence.color }}
                  ></div>
                  <span className={clsx(
                    'text-xs px-2 py-1 rounded-full',
                    geofence.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  )}>
                    {geofence.isActive ? 'Активна' : 'Неактивна'}
                  </span>
                </div>
              </div>
              
              <p className={clsx(
                'text-sm mb-2',
                isDark ? 'text-gray-400' : 'text-gray-600'
              )}>
                Тип: {geofence.type === 'delivery_zone' ? 'Зона доставки' :
                      geofence.type === 'restricted_area' ? 'Ограниченная зона' :
                      geofence.type === 'depot' ? 'Склад' : 'Пользовательская'}
              </p>
              
              <p className={clsx(
                'text-sm mb-3',
                isDark ? 'text-gray-400' : 'text-gray-600'
              )}>
                Радиус: {geofence.radius} км
              </p>
              
              <div className="flex space-x-2">
                <button
                  onClick={() => setSelectedGeofence(geofence.id)}
                  className="flex-1 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors"
                >
                  <EyeIcon className="h-3 w-3 mr-1 inline" />
                  Просмотр
                </button>
                
                <button
                  onClick={() => deleteGeofence(geofence.id)}
                  className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition-colors"
                >
                  <XCircleIcon className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Алерты */}
      <div className={clsx(
        'rounded-lg shadow-sm border p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={clsx(
            'text-lg font-medium',
            isDark ? 'text-white' : 'text-gray-900'
          )}>
            Алерты
          </h3>
          
          <div className="flex items-center space-x-2">
            <select
              value={alertFilter}
              onChange={(e) => setAlertFilter(e.target.value as any)}
              className={clsx(
                'px-3 py-2 rounded-lg border text-sm',
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white' 
                  : 'bg-white border-gray-300 text-gray-900'
              )}
            >
              <option value="all">Все</option>
              <option value="unread">Непрочитанные</option>
              <option value="critical">Критические</option>
            </select>
            
            <button
              onClick={markAllAlertsAsRead}
              className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
            >
              Отметить все
            </button>
          </div>
        </div>
        
        <div className="space-y-3">
          {filteredAlerts.length === 0 ? (
            <div className="text-center py-8">
              <BellIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className={clsx(
                'text-sm',
                isDark ? 'text-gray-400' : 'text-gray-600'
              )}>
                Нет алертов для отображения
              </p>
            </div>
          ) : (
            filteredAlerts.map((alert) => (
              <div key={alert.id} className={clsx(
                'p-4 rounded-lg border transition-all duration-200',
                alert.isRead 
                  ? (isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200')
                  : (isDark ? 'bg-blue-900 border-blue-700' : 'bg-blue-50 border-blue-200'),
                alert.severity === 'critical' ? 'border-red-300 bg-red-50' :
                alert.severity === 'high' ? 'border-orange-300 bg-orange-50' :
                alert.severity === 'medium' ? 'border-yellow-300 bg-yellow-50' :
                'border-green-300 bg-green-50'
              )}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <ExclamationTriangleIcon className={clsx(
                        'h-5 w-5',
                        alert.severity === 'critical' ? 'text-red-600' :
                        alert.severity === 'high' ? 'text-orange-600' :
                        alert.severity === 'medium' ? 'text-yellow-600' :
                        'text-green-600'
                      )} />
                      
                      <h4 className={clsx(
                        'font-medium',
                        isDark ? 'text-white' : 'text-gray-900'
                      )}>
                        {alert.type === 'entry' ? 'Вход в зону' :
                         alert.type === 'exit' ? 'Выход из зоны' :
                         alert.type === 'violation' ? 'Нарушение геозоны' :
                         'Задержка доставки'}
                      </h4>
                      
                      <span className={clsx(
                        'px-2 py-1 text-xs rounded-full',
                        alert.severity === 'critical' ? 'bg-red-100 text-red-800' :
                        alert.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                        alert.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      )}>
                        {alert.severity === 'critical' ? 'Критический' :
                         alert.severity === 'high' ? 'Высокий' :
                         alert.severity === 'medium' ? 'Средний' : 'Низкий'}
                      </span>
                    </div>
                    
                    <p className={clsx(
                      'text-sm mb-2',
                      isDark ? 'text-gray-400' : 'text-gray-600'
                    )}>
                      {alert.message}
                    </p>
                    
                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      <span>Курьер: {alert.courier}</span>
                      <span>Время: {new Date(alert.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                  
                  {!alert.isRead && (
                    <button
                      onClick={() => markAlertAsRead(alert.id)}
                      className="ml-4 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors"
                    >
                      Прочитано
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Отслеживание курьеров */}
      <div className={clsx(
        'rounded-lg shadow-sm border p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <h3 className={clsx(
          'text-lg font-medium mb-4',
          isDark ? 'text-white' : 'text-gray-900'
        )}>
          Отслеживание курьеров
        </h3>
        
        <div className="space-y-3">
          {courierLocations.map((courier) => (
            <div key={courier.courierId} className={clsx(
              'flex items-center justify-between p-4 rounded-lg border',
              isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
            )}>
              <div className="flex items-center space-x-4">
                <div className={clsx(
                  'w-3 h-3 rounded-full',
                  courier.status === 'online' ? 'bg-green-500' :
                  courier.status === 'busy' ? 'bg-yellow-500' :
                  courier.status === 'idle' ? 'bg-blue-500' : 'bg-gray-400'
                )}></div>
                
                <div>
                  <h4 className={clsx(
                    'font-medium',
                    isDark ? 'text-white' : 'text-gray-900'
                  )}>
                    {courier.courierName}
                  </h4>
                  <p className={clsx(
                    'text-sm',
                    isDark ? 'text-gray-400' : 'text-gray-600'
                  )}>
                    Статус: {courier.status === 'online' ? 'Онлайн' :
                            courier.status === 'busy' ? 'Занят' :
                            courier.status === 'idle' ? 'Свободен' : 'Офлайн'}
                  </p>
                </div>
              </div>
              
              <div className="text-right">
                <p className={clsx(
                  'text-sm font-medium',
                  isDark ? 'text-white' : 'text-gray-900'
                )}>
                  {courier.speed.toFixed(0)} км/ч
                </p>
                <p className={clsx(
                  'text-xs',
                  isDark ? 'text-gray-400' : 'text-gray-600'
                )}>
                  Обновлено: {new Date(courier.lastUpdate).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}






