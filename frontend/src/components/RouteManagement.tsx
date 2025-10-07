import React, { useState, useEffect, useMemo } from 'react'
import { 
  MapIcon, 
  TruckIcon, 
  PlusIcon,
  TrashIcon,
  ClockIcon,
  MapPinIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline'
import { localStorageUtils } from '../utils/localStorage'

// Google Maps types
declare global {
  interface Window {
    google: any
  }
}

interface Order {
  id: string
  orderNumber: string
  address: string
  courier: string
  amount: number
  phone: string
  customerName: string
  isSelected?: boolean
  routeOrder?: number
}

interface Route {
  id: string
  courier: string
  orders: Order[]
  totalDistance: number
  totalDuration: number
  startAddress: string
  endAddress: string
  isOptimized: boolean
}

interface RouteManagementProps {
  excelData?: any
}

export const RouteManagement: React.FC<RouteManagementProps> = ({ excelData }) => {
  const [selectedCourier, setSelectedCourier] = useState<string | null>(null)
  const [routes, setRoutes] = useState<Route[]>([])
  const [isCalculating, setIsCalculating] = useState(false)
  const [startAddress, setStartAddress] = useState('')
  const [endAddress, setEndAddress] = useState('')

  // Загружаем настройки адресов
  useEffect(() => {
    const settings = localStorageUtils.getAllSettings()
    setStartAddress(settings.defaultStartAddress)
    setEndAddress(settings.defaultEndAddress)
  }, [])

  // Группируем заказы по курьерам
  const courierOrders = useMemo(() => {
    if (!excelData?.orders || !Array.isArray(excelData.orders)) {
      return {}
    }

    const grouped: { [courier: string]: Order[] } = {}
    
    excelData.orders.forEach((order: any) => {
      if (order.courier && order.address) {
        const courierName = order.courier
        if (!grouped[courierName]) {
          grouped[courierName] = []
        }
        
        grouped[courierName].push({
          id: order.id || `order_${Math.random()}`,
          orderNumber: order.orderNumber || 'N/A',
          address: order.address,
          courier: order.courier,
          amount: order.amount || 0,
          phone: order.phone || '',
          customerName: order.customerName || '',
          isSelected: false
        })
      }
    })

    return grouped
  }, [excelData?.orders])

  const couriers = Object.keys(courierOrders)

  const handleCourierSelect = (courierName: string) => {
    setSelectedCourier(courierName)
  }

  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())

  const handleOrderSelect = (orderId: string) => {
    if (!selectedCourier) return

    setSelectedOrders(prev => {
      const newSet = new Set(prev)
      if (newSet.has(orderId)) {
        newSet.delete(orderId)
      } else {
        newSet.add(orderId)
      }
      return newSet
    })
  }

  const createRoute = () => {
    if (!selectedCourier) return

    const selectedOrdersList = courierOrders[selectedCourier].filter(order => selectedOrders.has(order.id))
    if (selectedOrdersList.length === 0) {
      alert('Выберите заказы для создания маршрута')
      return
    }

    const newRoute: Route = {
      id: `route_${Date.now()}`,
      courier: selectedCourier,
      orders: selectedOrdersList,
      totalDistance: 0,
      totalDuration: 0,
      startAddress,
      endAddress,
      isOptimized: false
    }

    setRoutes(prev => [...prev, newRoute])
    
    // Сбрасываем выбор заказов
    setSelectedOrders(new Set())
  }

  const calculateRouteDistance = async (route: Route) => {
    if (!window.google || !window.google.maps) {
      alert('Google Maps API не загружен')
      return
    }

    setIsCalculating(true)

    try {
      const directionsService = new window.google.maps.DirectionsService()
      const waypoints = route.orders.map(order => ({
        location: order.address,
        stopover: true
      }))

      const request = {
        origin: route.startAddress,
        destination: route.endAddress,
        waypoints: waypoints,
        travelMode: window.google.maps.TravelMode.DRIVING,
        optimizeWaypoints: true
      }

      directionsService.route(request, (result: any, status: any) => {
        if (status === window.google.maps.DirectionsStatus.OK && result) {
          const totalDistance = result.routes[0].legs.reduce((total: number, leg: any) => total + leg.distance.value, 0)
          const totalDuration = result.routes[0].legs.reduce((total: number, leg: any) => total + leg.duration.value, 0)

          setRoutes(prev => prev.map(r => 
            r.id === route.id 
              ? { 
                  ...r, 
                  totalDistance: totalDistance / 1000, // конвертируем в км
                  totalDuration: totalDuration / 60, // конвертируем в минуты
                  isOptimized: true
                }
              : r
          ))
        } else {
          console.error('Ошибка расчета маршрута:', status)
          alert('Ошибка расчета маршрута')
        }
        setIsCalculating(false)
      })
    } catch (error) {
      console.error('Ошибка при расчете маршрута:', error)
      alert('Ошибка при расчете маршрута')
      setIsCalculating(false)
    }
  }

  const deleteRoute = (routeId: string) => {
    setRoutes(prev => prev.filter(route => route.id !== routeId))
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = Math.floor(minutes % 60)
    return hours > 0 ? `${hours}ч ${mins}мин` : `${mins}мин`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Управление маршрутами</h1>
            <p className="mt-1 text-sm text-gray-600">
              Создавайте маршруты для курьеров и рассчитывайте расстояния
            </p>
          </div>
          <div className="text-sm text-gray-500">
            {couriers.length} курьеров, {routes.length} маршрутов
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Курьеры и заказы */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Курьеры</h2>
            
            {couriers.length === 0 ? (
              <div className="text-center py-8">
                <TruckIcon className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-500">Загрузите Excel файл для отображения курьеров</p>
              </div>
            ) : (
              <div className="space-y-2">
                {couriers.map(courierName => (
                  <button
                    key={courierName}
                    onClick={() => handleCourierSelect(courierName)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedCourier === courierName
                        ? 'bg-blue-50 border-blue-200 text-blue-900'
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <TruckIcon className="h-5 w-5 text-gray-600" />
                        <span className="font-medium">{courierName}</span>
                      </div>
                      <span className="text-sm text-gray-500">
                        {courierOrders[courierName]?.length || 0} заказов
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Заказы выбранного курьера */}
          {selectedCourier && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Заказы: {selectedCourier}
                </h3>
                <button
                  onClick={createRoute}
                  disabled={selectedOrders.size === 0}
                  className="btn-primary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <PlusIcon className="h-4 w-4" />
                  <span>Создать маршрут ({selectedOrders.size})</span>
                </button>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {courierOrders[selectedCourier]?.map(order => {
                  const isSelected = selectedOrders.has(order.id)
                  return (
                    <div
                      key={order.id}
                      onClick={() => handleOrderSelect(order.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-500'
                          : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-gray-900">
                              Заказ #{order.orderNumber}
                            </span>
                            {isSelected && (
                              <CheckCircleIcon className="h-4 w-4 text-blue-600" />
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">{order.address}</p>
                          <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                            <span>{order.customerName}</span>
                            <span>{order.phone}</span>
                            <span>{order.amount} грн</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Маршруты */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Созданные маршруты</h2>
            
            {routes.length === 0 ? (
              <div className="text-center py-8">
                <MapIcon className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-500">Создайте маршруты для курьеров</p>
              </div>
            ) : (
              <div className="space-y-4">
                {routes.map(route => (
                  <div key={route.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-medium text-gray-900">{route.courier}</h3>
                        <p className="text-sm text-gray-500">
                          {route.orders.length} заказов
                        </p>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => calculateRouteDistance(route)}
                          disabled={isCalculating}
                          className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-50"
                          title="Рассчитать расстояние"
                        >
                          <MapIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteRoute(route.id)}
                          className="p-1 text-gray-400 hover:text-red-600"
                          title="Удалить маршрут"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {route.orders.map((order, index) => (
                        <div key={order.id} className="flex items-center space-x-2 text-sm">
                          <span className="w-6 h-6 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-xs font-medium">
                            {index + 1}
                          </span>
                          <span className="text-gray-600">#{order.orderNumber}</span>
                          <span className="text-gray-500 truncate">{order.address}</span>
                        </div>
                      ))}
                    </div>

                    {route.isOptimized && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center space-x-1">
                            <MapPinIcon className="h-4 w-4 text-gray-400" />
                            <span className="text-gray-600">Расстояние</span>
                          </div>
                          <span className="font-medium text-gray-900">
                            {route.totalDistance.toFixed(1)} км
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm mt-1">
                          <div className="flex items-center space-x-1">
                            <ClockIcon className="h-4 w-4 text-gray-400" />
                            <span className="text-gray-600">Время</span>
                          </div>
                          <span className="font-medium text-gray-900">
                            {formatDuration(route.totalDuration)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
