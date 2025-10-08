import React, { useState, useEffect, useMemo } from 'react'
import { useExcelData } from '../contexts/ExcelDataContext'
import { useTheme } from '../contexts/ThemeContext'
import { clsx } from 'clsx'
import { 
  MapPinIcon, 
  ClockIcon, 
  UserGroupIcon, 
  TruckIcon,
  SparklesIcon,
  AdjustmentsHorizontalIcon,
  EyeIcon,
  EyeSlashIcon,
  DocumentArrowUpIcon
} from '@heroicons/react/24/outline'
import { ZoneDetails } from '../components/ZoneDetails'
import { ZoneStats } from '../components/ZoneStats'
import { ExcelUploadSection } from '../components/ExcelUploadSection'
import { LoadingSpinner } from '../components/LoadingSpinner'

interface ZoneOrder {
  id: string
  orderNumber: string
  address: string
  plannedTime?: string
  courier: string
  amount: number
  paymentMethod: string
  phone: string
  customerName: string
  distance?: number
  priority: number
}

interface Zone {
  id: string
  name: string
  center: { lat: number; lng: number }
  radius: number
  orders: ZoneOrder[]
  couriers: string[]
  totalAmount: number
  averageTime: number
}

export const Zones: React.FC = () => {
  const { excelData } = useExcelData()
  const { isDark } = useTheme()
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  const [showOptimized, setShowOptimized] = useState(true)
  const [timeRange, setTimeRange] = useState<{ start: string; end: string }>({
    start: '08:00',
    end: '20:00'
  })
  const [maxDistance, setMaxDistance] = useState(5) // км
  const [minOrdersPerRoute, setMinOrdersPerRoute] = useState(3)

  // Определяем зоны на основе адресов заказов
  const zones = useMemo(() => {
    try {
      if (!excelData?.orders || !Array.isArray(excelData.orders)) {
        console.log('No orders data available')
        return []
      }

      const orders = excelData.orders.filter((order: any) => {
        try {
          return order && 
            typeof order === 'object' && 
            order.address && 
            typeof order.address === 'string' && 
            order.address.trim() !== ''
        } catch (error) {
          console.warn('Error filtering order:', error, order)
          return false
        }
      })

      console.log(`Processing ${orders.length} orders for zones`)

      // Группируем заказы по районам/зонам
      const zoneGroups: { [key: string]: ZoneOrder[] } = {}
    
    orders.forEach((order: any) => {
      try {
        const address = order.address.toLowerCase()
        let zoneKey = 'Другое'
        
        // Определяем зону по ключевым словам в адресе
        if (address.includes('героїв полку') || address.includes('малиновського')) {
          zoneKey = 'Зона Азов'
        } else if (address.includes('дубровицька') || address.includes('дубровицкая')) {
          zoneKey = 'Зона Дубровицкая'
        } else if (address.includes('новокостянтинівська')) {
          zoneKey = 'Зона Новокостянтиновская'
        } else if (address.includes('кирилівська') || address.includes('фрунзе')) {
          zoneKey = 'Зона Кириловская'
        } else if (address.includes('центр') || address.includes('khreshchatyk')) {
          zoneKey = 'Зона Центр'
        }

        if (!zoneGroups[zoneKey]) {
          zoneGroups[zoneKey] = []
        }

        zoneGroups[zoneKey].push({
          id: order.id || `order_${order.orderNumber || 'unknown'}`,
          orderNumber: order.orderNumber || 'N/A',
          address: order.address,
          plannedTime: order.plannedTime,
          courier: order.courier || 'Не назначен',
          amount: typeof order.amount === 'number' ? order.amount : 0,
          paymentMethod: order.paymentMethod || 'Неизвестно',
          phone: order.phone || '',
          customerName: order.customerName || '',
          priority: Math.random() * 100 // Временный приоритет
        })
      } catch (error) {
        console.warn('Error processing order for zones:', error, order)
      }
    })

    // Создаем объекты зон
    const zonesList: Zone[] = Object.entries(zoneGroups).map(([name, orders], index) => {
      const couriers = [...new Set(orders.map(o => o.courier).filter(c => c !== 'Не назначен'))]
      const totalAmount = orders.reduce((sum, o) => sum + o.amount, 0)
      
      return {
        id: `zone_${index}`,
        name,
        center: getZoneCenter(name),
        radius: 2, // км
        orders: orders.sort((a, b) => (b.priority || 0) - (a.priority || 0)),
        couriers,
        totalAmount,
        averageTime: orders.length * 15 // Примерное время в минутах
      }
    })

    return zonesList
    } catch (error) {
      console.error('Error processing zones:', error)
      return []
    }
  }, [excelData?.orders])

  // Получаем центр зоны по названию
  const getZoneCenter = (zoneName: string): { lat: number; lng: number } => {
    const centers: { [key: string]: { lat: number; lng: number } } = {
      'Зона Азов': { lat: 50.4501, lng: 30.5234 },
      'Зона Дубровицкая': { lat: 50.4501, lng: 30.5234 },
      'Зона Новокостянтиновская': { lat: 50.4501, lng: 30.5234 },
      'Зона Кириловская': { lat: 50.4501, lng: 30.5234 },
      'Зона Центр': { lat: 50.4501, lng: 30.5234 },
      'Другое': { lat: 50.4501, lng: 30.5234 }
    }
    return centers[zoneName] || centers['Другое']
  }

  // Алгоритм оптимизации маршрутов
  const optimizedRoutes = useMemo(() => {
    try {
      if (!showOptimized || zones.length === 0) return []

      const routes: Array<{
        id: string
        courier: string
        zone: string
        orders: ZoneOrder[]
        totalDistance: number
        totalAmount: number
        estimatedTime: number
        efficiency: number
      }> = []

    zones.forEach(zone => {
      if (zone.orders.length < minOrdersPerRoute) return

      // Группируем заказы по курьерам
      const courierGroups: { [key: string]: ZoneOrder[] } = {}
      
      zone.orders.forEach(order => {
        const courier = order.courier === 'Не назначен' ? 'Автоматический' : order.courier
        if (!courierGroups[courier]) {
          courierGroups[courier] = []
        }
        courierGroups[courier].push(order)
      })

      // Создаем маршруты для каждого курьера
      Object.entries(courierGroups).forEach(([courier, orders]) => {
        if (orders.length >= minOrdersPerRoute) {
          const totalAmount = orders.reduce((sum, o) => sum + o.amount, 0)
          const estimatedTime = orders.length * 15 + orders.length * 5 // 15 мин на заказ + 5 мин на дорогу
          const efficiency = totalAmount / estimatedTime // Гривны в минуту

          routes.push({
            id: `route_${zone.id}_${courier}`,
            courier,
            zone: zone.name,
            orders: orders.slice(0, 8), // Максимум 8 заказов на маршрут
            totalDistance: orders.length * 2, // Примерное расстояние
            totalAmount,
            estimatedTime,
            efficiency
          })
        }
      })
    })

      return routes.sort((a, b) => b.efficiency - a.efficiency)
    } catch (error) {
      console.error('Error optimizing routes:', error)
      return []
    }
  }, [zones, showOptimized, minOrdersPerRoute])

  const selectedZoneData = zones.find(z => z.id === selectedZone)

  const handleCreateRoute = (orders: ZoneOrder[], courier: string) => {
    console.log('Creating route:', { orders, courier })
    // Здесь будет логика создания маршрута
    // Можно интегрировать с существующей системой маршрутов
  }

  // Показываем состояние загрузки если нет данных
  if (!excelData) {
    return (
      <div className={clsx(
        'space-y-6 transition-colors duration-300',
        isDark ? 'text-gray-100' : 'text-gray-900'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className={clsx(
              'text-2xl font-bold',
              isDark ? 'text-gray-100' : 'text-gray-900'
            )}>
              Управление зонами
            </h1>
            <p className={clsx(
              'mt-1 text-sm',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              Автоматическая оптимизация маршрутов по зонам доставки
            </p>
          </div>
        </div>

        {/* Excel Upload Section */}
        <div className={clsx(
          'rounded-lg shadow-sm border p-6',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <div className="text-center">
            <DocumentArrowUpIcon className={clsx(
              'mx-auto h-12 w-12 mb-4',
              isDark ? 'text-gray-500' : 'text-gray-400'
            )} />
            <h3 className={clsx(
              'text-lg font-medium mb-2',
              isDark ? 'text-gray-200' : 'text-gray-900'
            )}>
              Загрузите Excel файл для работы с зонами
            </h3>
            <p className={clsx(
              'text-sm mb-6',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              Для создания зон и оптимизации маршрутов необходимо загрузить файл с данными заказов
            </p>
            <ExcelUploadSection />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={clsx(
      'space-y-6 transition-colors duration-300',
      isDark ? 'text-gray-100' : 'text-gray-900'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={clsx(
            'text-2xl font-bold',
            isDark ? 'text-gray-100' : 'text-gray-900'
          )}>
            Управление зонами
          </h1>
          <p className={clsx(
            'mt-1 text-sm',
            isDark ? 'text-gray-400' : 'text-gray-600'
          )}>
            Автоматическая оптимизация маршрутов по зонам доставки
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShowOptimized(!showOptimized)}
            className={clsx(
              'flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-200',
              showOptimized
                ? 'bg-gradient-to-r from-blue-600 to-pink-500 text-white shadow-lg'
                : isDark
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            )}
          >
            <SparklesIcon className="h-5 w-5" />
            <span>{showOptimized ? 'Оптимизация включена' : 'Включить оптимизацию'}</span>
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className={clsx(
        'card p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <div className="flex items-center space-x-2 mb-4">
          <AdjustmentsHorizontalIcon className="h-5 w-5 text-blue-500" />
          <h3 className={clsx(
            'text-lg font-semibold',
            isDark ? 'text-gray-100' : 'text-gray-900'
          )}>
            Настройки оптимизации
          </h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={clsx(
              'block text-sm font-medium mb-2',
              isDark ? 'text-gray-300' : 'text-gray-700'
            )}>
              Временной диапазон
            </label>
            <div className="flex space-x-2">
              <input
                type="time"
                value={timeRange.start}
                onChange={(e) => setTimeRange(prev => ({ ...prev, start: e.target.value }))}
                className={clsx(
                  'px-3 py-2 border rounded-lg text-sm',
                  isDark 
                    ? 'bg-gray-700 border-gray-600 text-gray-100' 
                    : 'bg-white border-gray-300 text-gray-900'
                )}
              />
              <input
                type="time"
                value={timeRange.end}
                onChange={(e) => setTimeRange(prev => ({ ...prev, end: e.target.value }))}
                className={clsx(
                  'px-3 py-2 border rounded-lg text-sm',
                  isDark 
                    ? 'bg-gray-700 border-gray-600 text-gray-100' 
                    : 'bg-white border-gray-300 text-gray-900'
                )}
              />
            </div>
          </div>
          
          <div>
            <label className={clsx(
              'block text-sm font-medium mb-2',
              isDark ? 'text-gray-300' : 'text-gray-700'
            )}>
              Максимальное расстояние (км)
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={maxDistance}
              onChange={(e) => setMaxDistance(Number(e.target.value))}
              className="w-full"
            />
            <div className="text-sm text-gray-500 mt-1">{maxDistance} км</div>
          </div>
          
          <div>
            <label className={clsx(
              'block text-sm font-medium mb-2',
              isDark ? 'text-gray-300' : 'text-gray-700'
            )}>
              Минимум заказов на маршрут
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={minOrdersPerRoute}
              onChange={(e) => setMinOrdersPerRoute(Number(e.target.value))}
              className={clsx(
                'w-full px-3 py-2 border rounded-lg text-sm',
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-gray-100' 
                  : 'bg-white border-gray-300 text-gray-900'
              )}
            />
          </div>
        </div>
      </div>

      {/* Zone Statistics */}
      <ZoneStats zones={zones} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Zones List */}
        <div className="space-y-4">
          <h3 className={clsx(
            'text-lg font-semibold',
            isDark ? 'text-gray-100' : 'text-gray-900'
          )}>
            Зоны доставки ({zones.length})
          </h3>
          
          <div className="space-y-3">
            {zones.map((zone) => (
              <div
                key={zone.id}
                onClick={() => setSelectedZone(zone.id)}
                className={clsx(
                  'card p-4 cursor-pointer transition-all duration-200 hover:shadow-lg',
                  selectedZone === zone.id
                    ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : isDark 
                      ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' 
                      : 'bg-white border-gray-200 hover:bg-gray-50'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <MapPinIcon className="h-5 w-5 text-blue-500" />
                    <div>
                      <h4 className={clsx(
                        'font-semibold',
                        isDark ? 'text-gray-100' : 'text-gray-900'
                      )}>
                        {zone.name}
                      </h4>
                      <p className={clsx(
                        'text-sm',
                        isDark ? 'text-gray-400' : 'text-gray-600'
                      )}>
                        {zone.orders.length} заказов • {zone.couriers.length} курьеров
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className={clsx(
                      'text-sm font-semibold',
                      isDark ? 'text-gray-100' : 'text-gray-900'
                    )}>
                      {zone.totalAmount.toLocaleString()} ₴
                    </div>
                    <div className={clsx(
                      'text-xs',
                      isDark ? 'text-gray-400' : 'text-gray-500'
                    )}>
                      ~{zone.averageTime} мин
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Google Maps */}
        <div className="space-y-4">
          <h3 className={clsx(
            'text-lg font-semibold',
            isDark ? 'text-gray-100' : 'text-gray-900'
          )}>
            Карта зон
          </h3>
          
          <div className="card p-0 overflow-hidden">
            <iframe
              src="https://www.google.com/maps/d/embed?mid=1ylEgzXxEdNkh0zxDAb3iGCBBw2QM3xk&ehbc=2E312F"
              width="100%"
              height="400"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Optimized Routes */}
      {showOptimized && optimizedRoutes.length > 0 && (
        <div className="space-y-4">
          <h3 className={clsx(
            'text-lg font-semibold',
            isDark ? 'text-gray-100' : 'text-gray-900'
          )}>
            Оптимизированные маршруты ({optimizedRoutes.length})
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {optimizedRoutes.map((route) => (
              <div
                key={route.id}
                className={clsx(
                  'card p-4',
                  isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <TruckIcon className="h-5 w-5 text-blue-500" />
                    <span className={clsx(
                      'font-semibold',
                      isDark ? 'text-gray-100' : 'text-gray-900'
                    )}>
                      {route.courier}
                    </span>
                  </div>
                  <div className={clsx(
                    'px-2 py-1 rounded-full text-xs font-medium',
                    route.efficiency > 50 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  )}>
                    {route.efficiency.toFixed(1)} ₴/мин
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>
                      Зона:
                    </span>
                    <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>
                      {route.zone}
                    </span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>
                      Заказов:
                    </span>
                    <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>
                      {route.orders.length}
                    </span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>
                      Сумма:
                    </span>
                    <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>
                      {route.totalAmount.toLocaleString()} ₴
                    </span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>
                      Время:
                    </span>
                    <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>
                      ~{route.estimatedTime} мин
                    </span>
                  </div>
                </div>
                
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <button className={clsx(
                    'w-full px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                    'bg-blue-600 text-white hover:bg-blue-700'
                  )}>
                    Создать маршрут
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Zone Details Modal */}
      {selectedZoneData && (
        <ZoneDetails
          zone={selectedZoneData}
          onClose={() => setSelectedZone(null)}
          onCreateRoute={handleCreateRoute}
        />
      )}
    </div>
  )
}
