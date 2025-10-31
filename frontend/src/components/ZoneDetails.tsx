import React, { useState } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import clsx from 'clsx'
import { 
  MapPinIcon, 
  UserIcon, 
  CurrencyDollarIcon,
  PhoneIcon,
  TruckIcon,
  SparklesIcon,
  CheckCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline'

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
  confidence: number // Уровень уверенности в определении зоны
  kitchenTime?: number // Время на кухне в минутах
  deliveryTime?: string // Плановое время доставки
  courierType?: 'car' | 'motorcycle' // Рекомендуемый тип курьера
  routeId?: string // ID маршрута, если заказ уже в маршруте
}

interface ZoneDetailsProps {
  zone: {
    id: string
    name: string
    center: { lat: number; lng: number }
    radius: number
    orders: ZoneOrder[]
    couriers: string[]
    totalAmount: number
    averageTime: number
  }
  onClose: () => void
  onCreateRoute: (orders: ZoneOrder[], courier: string) => void
}

export const ZoneDetails: React.FC<ZoneDetailsProps> = ({ 
  zone, 
  onClose, 
  onCreateRoute 
}) => {
  const { isDark } = useTheme()
  const [selectedOrders, setSelectedOrders] = useState<string[]>([])
  const [selectedCourier, setSelectedCourier] = useState<string>('')
  const [showOptimization, setShowOptimization] = useState(false)

  // Безопасная обработка данных зоны
  const safeZone = zone || {
    id: '',
    name: 'Неизвестная зона',
    center: { lat: 0, lng: 0 },
    radius: 0,
    orders: [],
    couriers: [],
    totalAmount: 0,
    averageTime: 0
  }

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrders(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    )
  }

  const selectAllOrders = () => {
    setSelectedOrders((safeZone.orders || []).map(order => order.id))
  }

  const clearSelection = () => {
    setSelectedOrders([])
  }

  const getSelectedOrdersData = () => {
    return (safeZone.orders || []).filter(order => selectedOrders.includes(order.id))
  }

  const calculateRouteStats = () => {
    const selected = getSelectedOrdersData()
    const totalAmount = selected.reduce((sum, order) => sum + order.amount, 0)
    const estimatedTime = selected.length * 15 + selected.length * 5 // 15 мин на заказ + 5 мин на дорогу
    const efficiency = totalAmount / estimatedTime

    return {
      totalAmount,
      estimatedTime,
      efficiency,
      orderCount: selected.length
    }
  }

  const stats = calculateRouteStats()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
      
      <div className={clsx(
        'relative w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-xl shadow-2xl',
        isDark ? 'bg-gray-800' : 'bg-white'
      )}>
        {/* Header */}
        <div className={clsx(
          'flex items-center justify-between p-6 border-b',
          isDark ? 'border-gray-700' : 'border-gray-200'
        )}>
          <div className="flex items-center space-x-3">
            <MapPinIcon className="h-6 w-6 text-blue-500" />
            <div>
              <h2 className={clsx(
                'text-xl font-bold',
                isDark ? 'text-gray-100' : 'text-gray-900'
              )}>
                {safeZone.name}
              </h2>
              <p className={clsx(
                'text-sm',
                isDark ? 'text-gray-400' : 'text-gray-600'
              )}>
                {safeZone.orders?.length || 0} заказов • {safeZone.couriers?.length || 0} курьеров
              </p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className={clsx(
              'p-2 rounded-lg transition-colors',
              isDark ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            )}
          >
            <XCircleIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="flex h-[calc(90vh-120px)]">
          {/* Left Panel - Orders */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className={clsx(
                'text-lg font-semibold',
                isDark ? 'text-gray-100' : 'text-gray-900'
              )}>
                Заказы в зоне
              </h3>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={selectAllOrders}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Выбрать все
                </button>
                <button
                  onClick={clearSelection}
                  className="px-3 py-1 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Очистить
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {(safeZone.orders || []).map((order) => (
                <div
                  key={order.id}
                  onClick={() => toggleOrderSelection(order.id)}
                  className={clsx(
                    'p-4 rounded-lg border cursor-pointer transition-all duration-200',
                    selectedOrders.includes(order.id)
                      ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20 border-blue-300'
                      : isDark 
                        ? 'bg-gray-700 border-gray-600 hover:bg-gray-600' 
                        : 'bg-white border-gray-200 hover:bg-gray-50'
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className={clsx(
                          'font-semibold',
                          isDark ? 'text-gray-100' : 'text-gray-900'
                        )}>
                          #{order.orderNumber}
                        </span>
                        <span className={clsx(
                          'px-2 py-1 rounded-full text-xs font-medium',
                          order.paymentMethod === 'Готівка' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-blue-100 text-blue-800'
                        )}>
                          {order.paymentMethod}
                        </span>
                      </div>
                      
                      <p className={clsx(
                        'text-sm mb-2',
                        isDark ? 'text-gray-300' : 'text-gray-700'
                      )}>
                        {order.address}
                      </p>
                      
                      <div className="flex items-center space-x-4 text-sm">
                        <div className="flex items-center space-x-1">
                          <UserIcon className="h-4 w-4 text-gray-400" />
                          <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>
                            {order.customerName || 'Без имени'}
                          </span>
                        </div>
                        
                        <div className="flex items-center space-x-1">
                          <PhoneIcon className="h-4 w-4 text-gray-400" />
                          <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>
                            {order.phone}
                          </span>
                        </div>
                        
                        <div className="flex items-center space-x-1">
                          <CurrencyDollarIcon className="h-4 w-4 text-gray-400" />
                          <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>
                            {order.amount} ₴
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="ml-4">
                      {selectedOrders.includes(order.id) ? (
                        <CheckCircleIcon className="h-6 w-6 text-blue-500" />
                      ) : (
                        <div className="h-6 w-6 border-2 border-gray-300 rounded-full" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Panel - Route Creation */}
          <div className={clsx(
            'w-80 p-6 border-l',
            isDark ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'
          )}>
            <h3 className={clsx(
              'text-lg font-semibold mb-4',
              isDark ? 'text-gray-100' : 'text-gray-900'
            )}>
              Создание маршрута
            </h3>

            {/* Courier Selection */}
            <div className="mb-4">
              <label className={clsx(
                'block text-sm font-medium mb-2',
                isDark ? 'text-gray-300' : 'text-gray-700'
              )}>
                Курьер
              </label>
              <select
                value={selectedCourier}
                onChange={(e) => setSelectedCourier(e.target.value)}
                className={clsx(
                  'w-full px-3 py-2 border rounded-lg text-sm',
                  isDark 
                    ? 'bg-gray-700 border-gray-600 text-gray-100' 
                    : 'bg-white border-gray-300 text-gray-900'
                )}
              >
                <option value="">Выберите курьера</option>
                {(safeZone.couriers || []).map((courier) => (
                  <option key={courier} value={courier}>
                    {courier}
                  </option>
                ))}
                <option value="Автоматический">Автоматический</option>
              </select>
            </div>

            {/* Route Stats */}
            {selectedOrders.length > 0 && (
              <div className={clsx(
                'p-4 rounded-lg mb-4',
                isDark ? 'bg-gray-700' : 'bg-white border border-gray-200'
              )}>
                <h4 className={clsx(
                  'font-semibold mb-3',
                  isDark ? 'text-gray-100' : 'text-gray-900'
                )}>
                  Статистика маршрута
                </h4>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>
                      Заказов:
                    </span>
                    <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>
                      {stats.orderCount}
                    </span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>
                      Общая сумма:
                    </span>
                    <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>
                      {stats.totalAmount.toLocaleString()} ₴
                    </span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>
                      Время:
                    </span>
                    <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>
                      ~{stats.estimatedTime} мин
                    </span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>
                      Эффективность:
                    </span>
                    <span className={clsx(
                      'font-semibold',
                      stats.efficiency > 50 ? 'text-green-600' : 'text-yellow-600'
                    )}>
                      {stats.efficiency.toFixed(1)} ₴/мин
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Optimization Toggle */}
            <div className="mb-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOptimization}
                  onChange={(e) => setShowOptimization(e.target.checked)}
                  className="rounded"
                />
                <div className="flex items-center space-x-2">
                  <SparklesIcon className="h-4 w-4 text-blue-500" />
                  <span className={clsx(
                    'text-sm font-medium',
                    isDark ? 'text-gray-300' : 'text-gray-700'
                  )}>
                    Автоматическая оптимизация
                  </span>
                </div>
              </label>
            </div>

            {/* Create Route Button */}
            <button
              onClick={() => {
                const orders = getSelectedOrdersData()
                onCreateRoute(orders, selectedCourier || 'Автоматический')
                onClose()
              }}
              disabled={selectedOrders.length === 0 || !selectedCourier}
              className={clsx(
                'w-full px-4 py-3 rounded-lg font-medium transition-colors',
                selectedOrders.length > 0 && selectedCourier
                  ? 'bg-gradient-to-r from-blue-600 to-pink-500 text-white hover:from-blue-700 hover:to-pink-600'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              )}
            >
              <div className="flex items-center justify-center space-x-2">
                <TruckIcon className="h-5 w-5" />
                <span>Создать маршрут</span>
              </div>
            </button>

            {/* Quick Actions */}
            <div className="mt-4 space-y-2">
              <button
                onClick={() => {
                  // Автоматически выбрать оптимальные заказы
                  const optimalOrders = (safeZone.orders || [])
                    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
                    .slice(0, 5)
                    .map(o => o.id)
                  setSelectedOrders(optimalOrders)
                }}
                className="w-full px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Выбрать оптимальные (5)
              </button>
              
              <button
                onClick={() => {
                  // Выбрать заказы с высокой суммой
                  const highValueOrders = (safeZone.orders || [])
                    .filter(o => (o.amount || 0) > 1000)
                    .map(o => o.id)
                  setSelectedOrders(highValueOrders)
                }}
                className="w-full px-3 py-2 text-sm bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
              >
                Высокая стоимость
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
































