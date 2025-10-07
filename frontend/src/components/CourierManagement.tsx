import React, { useState, useEffect, useMemo } from 'react'
import { 
  PlusIcon, 
  PencilIcon, 
  TrashIcon,
  UserIcon,
  TruckIcon,
  MapPinIcon,
  XMarkIcon,
  MapIcon,
  ClockIcon
} from '@heroicons/react/24/outline'
import { useExcelData } from '../contexts/ExcelDataContext'

interface Courier {
  id: string
  name: string
  phone: string
  email: string
  vehicleType: 'car' | 'motorcycle'
  location: string
  isActive: boolean
  orders: number
  totalAmount: number
  totalDistance: number
}

interface CourierManagementProps {
  excelData?: any
}

export const CourierManagement: React.FC<CourierManagementProps> = ({ excelData }) => {
  const { excelData: contextData } = useExcelData()
  const [couriers, setCouriers] = useState<Courier[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingCourier, setEditingCourier] = useState<Courier | null>(null)
  const [filter, setFilter] = useState<'all' | 'car' | 'motorcycle'>('all')
  const [selectedCourierForRoutes, setSelectedCourierForRoutes] = useState<Courier | null>(null)

  // Рассчитываем расстояние для каждого курьера на основе маршрутов
  const calculateCourierDistance = useMemo(() => {
    return (courierName: string) => {
      if (!contextData?.routes || !Array.isArray(contextData.routes)) {
        return 0
      }

      const courierRoutes = contextData.routes.filter((route: any) => route.courier === courierName)
      let totalDistance = 0

      courierRoutes.forEach((route: any) => {
        if (route.isOptimized && route.totalDistance) {
          totalDistance += route.totalDistance
        } else {
          // Если маршрут не оптимизирован, считаем 500м за каждый заказ
          totalDistance += (route.orders?.length || 0) * 0.5
        }
      })

      return totalDistance
    }
  }, [contextData?.routes])

  // Создаем курьеров из данных Excel при загрузке
  useEffect(() => {
    if (excelData?.couriers && Array.isArray(excelData.couriers)) {
      const couriersFromExcel = excelData.couriers.map((courier: any, index: number) => {
        const courierName = courier.name || 'Неизвестный курьер'
        return {
          id: `excel_${index}`,
          name: courierName,
          phone: '',
          email: '',
          vehicleType: 'car' as const,
          location: 'Киев',
          isActive: true,
          orders: courier.orders || 0,
          totalAmount: courier.totalAmount || 0,
          totalDistance: calculateCourierDistance(courierName)
        }
      })
      setCouriers(couriersFromExcel)
    }
  }, [excelData, calculateCourierDistance])

  // Обновляем расстояния курьеров при изменении маршрутов
  useEffect(() => {
    setCouriers(prev => prev.map(courier => ({
      ...courier,
      totalDistance: calculateCourierDistance(courier.name)
    })))
  }, [calculateCourierDistance])

  const filteredCouriers = couriers
    .filter(courier => {
      if (filter === 'all') return true
      return courier.vehicleType === filter
    })
    .sort((a, b) => {
      // Сначала активные курьеры, потом неактивные
      if (a.isActive && !b.isActive) return -1
      if (!a.isActive && b.isActive) return 1
      return 0
    })

  const handleAddCourier = (courierData: Omit<Courier, 'id' | 'totalDistance'>) => {
    const newCourier: Courier = {
      ...courierData,
      id: `courier_${Date.now()}`,
      totalDistance: calculateCourierDistance(courierData.name)
    }
    setCouriers(prev => [...prev, newCourier])
    setShowAddModal(false)
  }

  const handleEditCourier = (courierData: Courier) => {
    const updatedCourier = {
      ...courierData,
      totalDistance: calculateCourierDistance(courierData.name)
    }
    setCouriers(prev => prev.map(courier => 
      courier.id === courierData.id ? updatedCourier : courier
    ))
    setEditingCourier(null)
  }

  const handleDeleteCourier = (id: string) => {
    if (window.confirm('Вы уверены, что хотите удалить этого курьера?')) {
      setCouriers(prev => prev.filter(courier => courier.id !== id))
    }
  }

  const toggleCourierStatus = (id: string) => {
    setCouriers(prev => prev.map(courier => 
      courier.id === id ? { ...courier, isActive: !courier.isActive } : courier
    ))
  }

  const getCourierRoutes = (courierName: string) => {
    if (!contextData?.routes || !Array.isArray(contextData.routes)) {
      return []
    }
    return contextData.routes.filter((route: any) => route.courier === courierName)
  }

  const handleCourierClick = (courier: Courier) => {
    const routes = getCourierRoutes(courier.name)
    if (routes.length > 0) {
      setSelectedCourierForRoutes(courier)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Управление курьерами</h1>
            <p className="mt-1 text-sm text-gray-600">
              Управляйте информацией о курьерах и их заказах
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary flex items-center space-x-2"
          >
            <PlusIcon className="h-5 w-5" />
            <span>Добавить курьера</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex space-x-4">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              filter === 'all' 
                ? 'bg-blue-100 text-blue-800' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Все курьеры ({couriers.length})
          </button>
          <button
            onClick={() => setFilter('car')}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center space-x-2 ${
              filter === 'car' 
                ? 'bg-green-100 text-green-800' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <TruckIcon className="h-4 w-4" />
            <span>Авто курьеры ({couriers.filter(c => c.vehicleType === 'car').length})</span>
          </button>
          <button
            onClick={() => setFilter('motorcycle')}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center space-x-2 ${
              filter === 'motorcycle' 
                ? 'bg-orange-100 text-orange-800' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <TruckIcon className="h-4 w-4" />
            <span>Мото курьеры ({couriers.filter(c => c.vehicleType === 'motorcycle').length})</span>
          </button>
        </div>
      </div>

      {/* Couriers Grid */}
      {filteredCouriers.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
          <div className="text-center">
            <UserIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Нет курьеров</h3>
            <p className="mt-1 text-sm text-gray-500">
              {filter === 'all' 
                ? 'Добавьте курьеров или загрузите Excel файл с данными'
                : `Нет курьеров типа ${filter === 'car' ? 'авто' : 'мото'}`
              }
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCouriers.map((courier) => {
            const courierRoutes = getCourierRoutes(courier.name)
            const hasRoutes = courierRoutes.length > 0
            
            return (
            <div 
              key={courier.id} 
              className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 transition-all ${
                !courier.isActive 
                  ? 'opacity-60 bg-gray-50' 
                  : hasRoutes 
                    ? 'cursor-pointer hover:shadow-md hover:border-blue-300' 
                    : ''
              }`}
              onClick={() => hasRoutes && courier.isActive && handleCourierClick(courier)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
                      courier.vehicleType === 'car' ? 'bg-green-100' : 'bg-orange-100'
                    }`}>
                      {courier.vehicleType === 'car' ? (
                        <TruckIcon className="h-6 w-6 text-green-600" />
                      ) : (
                        <TruckIcon className="h-6 w-6 text-orange-600" />
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-medium text-gray-900 truncate">
                      {courier.name}
                    </h3>
                    <p className="text-sm text-gray-500 flex items-center">
                      <MapPinIcon className="h-4 w-4 mr-1" />
                      {courier.location}
                    </p>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        courier.isActive 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {courier.isActive ? 'Активен' : 'Неактивен'}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        courier.vehicleType === 'car' 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-orange-100 text-orange-800'
                      }`}>
                        {courier.vehicleType === 'car' ? 'Авто' : 'Мото'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex space-x-1">
                  <button
                    onClick={() => setEditingCourier(courier)}
                    className="p-1 text-gray-400 hover:text-blue-600"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteCourier(courier.id)}
                    className="p-1 text-gray-400 hover:text-red-600"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="flex items-center justify-center space-x-1">
                    <TruckIcon className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">Заказов</span>
                  </div>
                  <p className="text-lg font-semibold text-gray-900">
                    {courier.orders}
                  </p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center space-x-1">
                    <MapPinIcon className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">Километры</span>
                  </div>
                  <p className="text-lg font-semibold text-gray-900">
                    {courier.totalDistance.toFixed(1)} км
                  </p>
                </div>
              </div>

              {hasRoutes && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-center text-sm text-blue-600">
                    <MapPinIcon className="h-4 w-4 mr-1" />
                    <span>Кликните для просмотра маршрутов ({courierRoutes.length})</span>
                  </div>
                </div>
              )}

              <div className="mt-4 flex space-x-2">
                <button
                  onClick={() => toggleCourierStatus(courier.id)}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg ${
                    courier.isActive
                      ? 'bg-red-100 text-red-800 hover:bg-red-200'
                      : 'bg-green-100 text-green-800 hover:bg-green-200'
                  }`}
                >
                  {courier.isActive ? 'Деактивировать' : 'Активировать'}
                </button>
                <button
                  onClick={() => setEditingCourier(courier)}
                  className="flex-1 px-3 py-2 text-sm font-medium text-blue-800 bg-blue-100 hover:bg-blue-200 rounded-lg"
                >
                  Редактировать
                </button>
              </div>
            </div>
            )
          })}
        </div>
      )}

      {/* Routes Modal */}
      {selectedCourierForRoutes && (
        <CourierRoutesModal
          courier={selectedCourierForRoutes}
          routes={getCourierRoutes(selectedCourierForRoutes.name)}
          onClose={() => setSelectedCourierForRoutes(null)}
        />
      )}

      {/* Add/Edit Modal */}
      {(showAddModal || editingCourier) && (
        <CourierModal
          courier={editingCourier}
          onSave={editingCourier ? handleEditCourier : handleAddCourier}
          onClose={() => {
            setShowAddModal(false)
            setEditingCourier(null)
          }}
        />
      )}
    </div>
  )
}

// Modal component for adding/editing couriers
interface CourierModalProps {
  courier?: Courier | null
  onSave: (courier: Courier) => void
  onClose: () => void
}

const CourierModal: React.FC<CourierModalProps> = ({ courier, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    name: courier?.name || '',
    phone: courier?.phone || '',
    email: courier?.email || '',
    vehicleType: courier?.vehicleType || 'car' as const,
    location: courier?.location || 'Киев',
    isActive: courier?.isActive ?? true
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      ...formData,
      id: courier?.id || '',
      orders: courier?.orders || 0,
      totalAmount: courier?.totalAmount || 0,
      totalDistance: courier?.totalDistance || 0
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            {courier ? 'Редактировать курьера' : 'Добавить курьера'}
          </h3>
        </div>
        
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Имя курьера
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Телефон
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Тип транспорта
            </label>
            <select
              value={formData.vehicleType}
              onChange={(e) => setFormData(prev => ({ ...prev, vehicleType: e.target.value as 'car' | 'motorcycle' }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="car">Автомобиль</option>
              <option value="motorcycle">Мотоцикл</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Локация
            </label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
              Активен
            </label>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500"
            >
              {courier ? 'Сохранить' : 'Добавить'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 focus:ring-2 focus:ring-gray-500"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Modal component for displaying courier routes
interface CourierRoutesModalProps {
  courier: Courier
  routes: any[]
  onClose: () => void
}

const CourierRoutesModal: React.FC<CourierRoutesModalProps> = ({ courier, routes, onClose }) => {
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = Math.floor(minutes % 60)
    return hours > 0 ? `${hours}ч ${mins}мин` : `${mins}мин`
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">
              Маршруты курьера: {courier.name}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {routes.length === 0 ? (
            <div className="text-center py-8">
              <MapIcon className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-sm text-gray-500">У этого курьера нет маршрутов</p>
            </div>
          ) : (
            <div className="space-y-4">
              {routes.map((route, index) => (
                <div key={route.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-medium text-gray-900">Маршрут #{index + 1}</h4>
                      <p className="text-sm text-gray-500">
                        {route.orders?.length || 0} заказов
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      {route.isOptimized && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          Оптимизирован
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    {route.orders?.map((order: any, orderIndex: number) => (
                      <div key={order.id} className="flex items-center space-x-2 text-sm">
                        <span className="w-6 h-6 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-xs font-medium">
                          {orderIndex + 1}
                        </span>
                        <span className="text-gray-600">#{order.orderNumber}</span>
                        <span className="text-gray-500 truncate">{order.address}</span>
                      </div>
                    ))}
                  </div>

                  {route.isOptimized && (
                    <div className="pt-3 border-t border-gray-200">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center space-x-1">
                          <MapPinIcon className="h-4 w-4 text-gray-400" />
                          <span className="text-gray-600">Расстояние</span>
                          <span className="font-medium text-gray-900">
                            {route.totalDistance?.toFixed(1) || 0} км
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <ClockIcon className="h-4 w-4 text-gray-400" />
                          <span className="text-gray-600">Время</span>
                          <span className="font-medium text-gray-900">
                            {route.totalDuration ? formatDuration(route.totalDuration) : 'N/A'}
                          </span>
                        </div>
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
  )
}
