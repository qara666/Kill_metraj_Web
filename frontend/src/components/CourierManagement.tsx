import React, { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { 
  PlusIcon, 
  PencilIcon, 
  TrashIcon,
  UserIcon,
  TruckIcon,
  MapPinIcon,
  XMarkIcon,
  MapIcon,
  ClockIcon,
  ChevronUpIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline'
import { useExcelData } from '../contexts/ExcelDataContext'
import { useTheme } from '../contexts/ThemeContext'
import { clsx } from 'clsx'

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
  const { excelData: contextData, updateCourierData } = useExcelData()
  const { isDark } = useTheme()
  const [couriers, setCouriers] = useState<Courier[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingCourier, setEditingCourier] = useState<Courier | null>(null)
  const [filter, setFilter] = useState<'all' | 'car' | 'motorcycle'>('all')
  const [selectedCourierForRoutes, setSelectedCourierForRoutes] = useState<Courier | null>(null)
  const [sortField, setSortField] = useState<'name' | 'orders' | 'distance' | 'status'>('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Рассчитываем расстояние для каждого курьера на основе маршрутов
  const calculateCourierDistance = useMemo(() => {
    return (courierName: string) => {
      if (!contextData?.routes || !Array.isArray(contextData.routes)) {
        return 0
      }

      const courierRoutes = contextData.routes.filter((route: any) => route.courier === courierName)
      let totalDistance = 0

      courierRoutes.forEach((route: any) => {
        const ordersCount = route.orders?.length || 0
        
        if (route.isOptimized && route.totalDistance) {
          // Для оптимизированных маршрутов используем рассчитанное расстояние + дополнительные 500м за каждый заказ
          totalDistance += route.totalDistance + (ordersCount * 0.5)
        } else {
          // Для неоптимизированных маршрутов считаем базовое расстояние + 500м за каждый заказ
          const baseDistance = 1.0 // 1км базовое расстояние
          const additionalDistance = ordersCount * 0.5 // 500м за каждый заказ
          totalDistance += baseDistance + additionalDistance
        }
      })

      return totalDistance
    }
  }, [contextData?.routes])


  // Рассчитываем количество заказов курьера в маршрутах
  const calculateCourierOrdersInRoutes = useMemo(() => {
    return (courierName: string) => {
      if (!contextData?.routes || !Array.isArray(contextData.routes)) {
        return 0
      }

      let ordersInRoutes = 0
      const courierRoutes = contextData.routes.filter((route: any) => route.courier === courierName)
      courierRoutes.forEach((route: any) => {
        ordersInRoutes += route.orders?.length || 0
      })

      return ordersInRoutes
    }
  }, [contextData?.routes])

  // Рассчитываем детальную информацию о километрах курьера
  const calculateCourierDistanceDetails = useMemo(() => {
    return (courierName: string) => {
      if (!contextData?.routes || !Array.isArray(contextData.routes)) {
        return { baseDistance: 0, additionalDistance: 0, totalDistance: 0, ordersInRoutes: 0 }
      }

      const courierRoutes = contextData.routes.filter((route: any) => route.courier === courierName)
      let baseDistance = 0
      let additionalDistance = 0
      let totalOrdersInRoutes = 0

      courierRoutes.forEach((route: any) => {
        const ordersCount = route.orders?.length || 0
        totalOrdersInRoutes += ordersCount

        if (route.isOptimized && route.totalDistance) {
          // Для оптимизированных маршрутов используем рассчитанное расстояние как базовое
          baseDistance += route.totalDistance
        } else {
          // Для неоптимизированных маршрутов считаем базовое расстояние
          baseDistance += 1.0 // 1км базовое расстояние за маршрут
        }
        
        // Дополнительные 500м добавляются к каждому заказу независимо от типа маршрута
        additionalDistance += ordersCount * 0.5 // 500м за каждый заказ
      })

      return {
        baseDistance,
        additionalDistance,
        totalDistance: baseDistance + additionalDistance,
        ordersInRoutes: totalOrdersInRoutes
      }
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
          vehicleType: (courier.vehicleType || 'car') as 'car' | 'motorcycle',
          location: 'Киев',
          isActive: true,
          orders: calculateCourierOrdersInRoutes(courierName),
          totalAmount: courier.totalAmount || 0,
          totalDistance: calculateCourierDistance(courierName)
        }
      })
      setCouriers(couriersFromExcel)
    }
  }, [excelData, calculateCourierDistance, calculateCourierOrdersInRoutes])

  // Обновляем расстояния и заказы курьеров при изменении маршрутов
  useEffect(() => {
    setCouriers(prev => prev.map(courier => ({
      ...courier,
      totalDistance: calculateCourierDistance(courier.name),
      orders: calculateCourierOrdersInRoutes(courier.name) // Используем заказы В маршрутах
    })))
  }, [calculateCourierDistance, calculateCourierOrdersInRoutes])

  // Синхронизируем изменения типа курьера из контекста
  useEffect(() => {
    if (contextData?.couriers && Array.isArray(contextData.couriers)) {
      setCouriers(prev => prev.map(courier => {
        const contextCourier = contextData.couriers.find((c: any) => c.name === courier.name)
        if (contextCourier && contextCourier.vehicleType !== courier.vehicleType) {
          return {
            ...courier,
            vehicleType: contextCourier.vehicleType as 'car' | 'motorcycle',
            totalDistance: calculateCourierDistance(courier.name)
          }
        }
        return courier
      }))
    }
  }, [contextData?.couriers, calculateCourierDistance])

  // Функция для сортировки курьеров
  const sortCouriers = (a: Courier, b: Courier) => {
    let aValue: any, bValue: any
    
    switch (sortField) {
      case 'name':
        aValue = a.name.toLowerCase()
        bValue = b.name.toLowerCase()
        break
      case 'orders':
        aValue = calculateCourierOrdersInRoutes(a.name)
        bValue = calculateCourierOrdersInRoutes(b.name)
        break
      case 'distance':
        aValue = calculateCourierDistance(a.name)
        bValue = calculateCourierDistance(b.name)
        break
      case 'status':
        aValue = a.isActive ? 1 : 0
        bValue = b.isActive ? 1 : 0
        break
      default:
        return 0
    }
    
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
    return 0
  }

  const filteredCouriers = couriers
    .filter(courier => {
      if (filter === 'all') return true
      return courier.vehicleType === filter
    })
    .sort(sortCouriers)

  const handleAddCourier = (courierData: Omit<Courier, 'id' | 'totalDistance'>) => {
    const newCourier: Courier = {
      ...courierData,
      id: `courier_${Date.now()}`,
      totalDistance: calculateCourierDistance(courierData.name),
      orders: calculateCourierOrdersInRoutes(courierData.name)
    }
    setCouriers(prev => [...prev, newCourier])
    setShowAddModal(false)
  }

  const handleEditCourier = (courierData: Courier) => {
    const updatedCourier = {
      ...courierData,
      totalDistance: calculateCourierDistance(courierData.name),
      orders: calculateCourierOrdersInRoutes(courierData.name)
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

  const toggleCourierVehicleType = (id: string) => {
    console.log('Переключение типа курьера:', id)
    setCouriers(prev => {
      const updatedCouriers = prev.map(courier => {
        if (courier.id === id) {
          const newVehicleType = courier.vehicleType === 'car' ? 'motorcycle' : 'car'
          console.log(`Курьер ${courier.name}: ${courier.vehicleType} -> ${newVehicleType}`)
          return {
            ...courier,
            vehicleType: newVehicleType as 'car' | 'motorcycle',
            totalDistance: calculateCourierDistance(courier.name)
          }
        }
        return courier
      })
      
      // Сохраняем изменения в контексте
      if (contextData) {
        const updatedContextCouriers = contextData.couriers.map((courier: any) => {
          const localCourier = updatedCouriers.find(c => c.name === courier.name)
          if (localCourier) {
            return {
              ...courier,
              vehicleType: localCourier.vehicleType,
              totalDistance: localCourier.totalDistance
            }
          }
          return courier
        })
        console.log('Обновляем контекст:', updatedContextCouriers)
        updateCourierData(updatedContextCouriers)
      }
      
      return updatedCouriers
    })
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

  const handleSort = (field: 'name' | 'orders' | 'distance' | 'status') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

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
              isDark ? 'text-gray-100' : 'text-gray-900'
            )}>Управление курьерами</h1>
            <p className={clsx(
              'mt-1 text-sm',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
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
      <div className={clsx(
        'rounded-lg shadow-sm border p-4',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <div className="flex space-x-4">
          <button
            onClick={() => setFilter('all')}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium',
              filter === 'all' 
                ? isDark 
                  ? 'bg-blue-900 text-blue-200' 
                  : 'bg-blue-100 text-blue-800'
                : isDark
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            Все курьеры ({couriers.length})
          </button>
          <button
            onClick={() => setFilter('car')}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium flex items-center space-x-2',
              filter === 'car' 
                ? isDark
                  ? 'bg-green-900 text-green-200'
                  : 'bg-green-100 text-green-800'
                : isDark
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            <TruckIcon className="h-4 w-4" />
            <span>Авто курьеры ({couriers.filter(c => c.vehicleType === 'car').length})</span>
          </button>
          <button
            onClick={() => setFilter('motorcycle')}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium flex items-center space-x-2',
              filter === 'motorcycle' 
                ? isDark
                  ? 'bg-orange-900 text-orange-200'
                  : 'bg-orange-100 text-orange-800'
                : isDark
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            <TruckIcon className="h-4 w-4" />
            <span>Мото курьеры ({couriers.filter(c => c.vehicleType === 'motorcycle').length})</span>
          </button>
        </div>
      </div>

      {/* Couriers Grid */}
      {filteredCouriers.length === 0 ? (
        <div className={clsx(
          'rounded-lg shadow-sm border p-12',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <div className="text-center">
            <UserIcon className={clsx(
              'mx-auto h-12 w-12',
              isDark ? 'text-gray-500' : 'text-gray-400'
            )} />
            <h3 className={clsx(
              'mt-2 text-sm font-medium',
              isDark ? 'text-gray-200' : 'text-gray-900'
            )}>Нет курьеров</h3>
            <p className={clsx(
              'mt-1 text-sm',
              isDark ? 'text-gray-400' : 'text-gray-500'
            )}>
              {filter === 'all' 
                ? 'Добавьте курьеров или загрузите Excel файл с данными'
                : `Нет курьеров типа ${filter === 'car' ? 'авто' : 'мото'}`
              }
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Заголовки с сортировкой */}
          <div className={clsx(
            'grid grid-cols-4 gap-4 p-4 rounded-lg',
            isDark ? 'bg-gray-700' : 'bg-gray-100'
          )}>
            <button
              onClick={() => handleSort('name')}
              className="flex items-center space-x-1 text-left font-medium text-sm"
            >
              <span className={clsx(
                isDark ? 'text-gray-200' : 'text-gray-700'
              )}>Имя курьера</span>
              {sortField === 'name' && (
                sortDirection === 'asc' ? 
                  <ChevronUpIcon className="h-4 w-4 text-blue-600" /> : 
                  <ChevronDownIcon className="h-4 w-4 text-blue-600" />
              )}
            </button>
            <button
              onClick={() => handleSort('orders')}
              className="flex items-center space-x-1 text-left font-medium text-sm"
            >
              <span className={clsx(
                isDark ? 'text-gray-200' : 'text-gray-700'
              )}>Заказы</span>
              {sortField === 'orders' && (
                sortDirection === 'asc' ? 
                  <ChevronUpIcon className="h-4 w-4 text-blue-600" /> : 
                  <ChevronDownIcon className="h-4 w-4 text-blue-600" />
              )}
            </button>
            <button
              onClick={() => handleSort('distance')}
              className="flex items-center space-x-1 text-left font-medium text-sm"
            >
              <span className={clsx(
                isDark ? 'text-gray-200' : 'text-gray-700'
              )}>Километры</span>
              {sortField === 'distance' && (
                sortDirection === 'asc' ? 
                  <ChevronUpIcon className="h-4 w-4 text-blue-600" /> : 
                  <ChevronDownIcon className="h-4 w-4 text-blue-600" />
              )}
            </button>
            <button
              onClick={() => handleSort('status')}
              className="flex items-center space-x-1 text-left font-medium text-sm"
            >
              <span className={clsx(
                isDark ? 'text-gray-200' : 'text-gray-700'
              )}>Статус</span>
              {sortField === 'status' && (
                sortDirection === 'asc' ? 
                  <ChevronUpIcon className="h-4 w-4 text-blue-600" /> : 
                  <ChevronDownIcon className="h-4 w-4 text-blue-600" />
              )}
            </button>
          </div>

          {/* Сетка курьеров */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCouriers.map((courier) => {
            const courierRoutes = getCourierRoutes(courier.name)
            const hasRoutes = courierRoutes.length > 0
            
            return (
            <div 
              key={courier.id} 
              className={clsx(
                'rounded-lg shadow-sm border p-6 transition-all',
                isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200',
                !courier.isActive && isDark ? 'opacity-60 bg-gray-900' : '',
                !courier.isActive && !isDark ? 'opacity-60 bg-gray-50' : ''
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleCourierVehicleType(courier.id)
                      }}
                      className={clsx(
                        'h-12 w-12 rounded-full flex items-center justify-center transition-colors hover:scale-105',
                        courier.vehicleType === 'car' 
                          ? isDark 
                            ? 'bg-green-900 hover:bg-green-800' 
                            : 'bg-green-100 hover:bg-green-200'
                          : isDark
                            ? 'bg-orange-900 hover:bg-orange-800'
                            : 'bg-orange-100 hover:bg-orange-200'
                      )}
                      title={`Переключить на ${courier.vehicleType === 'car' ? 'мотоцикл' : 'автомобиль'}`}
                    >
                      {courier.vehicleType === 'car' ? (
                        <TruckIcon className={clsx(
                          'h-6 w-6',
                          isDark ? 'text-green-400' : 'text-green-600'
                        )} />
                      ) : (
                        <TruckIcon className={clsx(
                          'h-6 w-6',
                          isDark ? 'text-orange-400' : 'text-orange-600'
                        )} />
                      )}
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={clsx(
                      'text-lg font-medium truncate',
                      isDark ? 'text-gray-100' : 'text-gray-900'
                    )}>
                      {courier.name}
                    </h3>
                    <p className={clsx(
                      'text-sm flex items-center',
                      isDark ? 'text-gray-400' : 'text-gray-500'
                    )}>
                      <MapPinIcon className="h-4 w-4 mr-1" />
                      {courier.location}
                    </p>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className={clsx(
                        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                        courier.isActive 
                          ? isDark
                            ? 'bg-green-900 text-green-200'
                            : 'bg-green-100 text-green-800'
                          : isDark
                            ? 'bg-red-900 text-red-200'
                            : 'bg-red-100 text-red-800'
                      )}>
                        {courier.isActive ? 'Активен' : 'Неактивен'}
                      </span>
                      <span className={clsx(
                        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                        courier.vehicleType === 'car' 
                          ? isDark
                            ? 'bg-blue-900 text-blue-200'
                            : 'bg-blue-100 text-blue-800'
                          : isDark
                            ? 'bg-orange-900 text-orange-200'
                            : 'bg-orange-100 text-orange-800'
                      )}>
                        {courier.vehicleType === 'car' ? 'Авто' : 'Мото'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex space-x-1">
                  <button
                    onClick={() => setEditingCourier(courier)}
                    className={clsx(
                      'p-1 transition-colors',
                      isDark ? 'text-gray-400 hover:text-blue-400' : 'text-gray-400 hover:text-blue-600'
                    )}
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteCourier(courier.id)}
                    className={clsx(
                      'p-1 transition-colors',
                      isDark ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'
                    )}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {/* Заказы */}
                <div className={clsx(
                  'rounded-lg p-3',
                  isDark ? 'bg-gray-700' : 'bg-gray-50'
                )}>
                  <div className="flex items-center justify-center space-x-1 mb-2">
                    <TruckIcon className={clsx(
                      'h-4 w-4',
                      isDark ? 'text-gray-400' : 'text-gray-400'
                    )} />
                    <span className={clsx(
                      'text-sm font-medium',
                      isDark ? 'text-gray-300' : 'text-gray-700'
                    )}>Заказы</span>
                  </div>
                  <div className="text-center">
                    <p className={clsx(
                      'text-xs',
                      isDark ? 'text-gray-400' : 'text-gray-500'
                    )}>Посчитанных заказов</p>
                    <p className={clsx(
                      'text-lg font-semibold',
                      isDark ? 'text-blue-400' : 'text-blue-600'
                    )}>
                      {calculateCourierOrdersInRoutes(courier.name)}
                    </p>
                  </div>
                </div>

                {/* Километры */}
                <div className={clsx(
                  'rounded-lg p-3',
                  isDark ? 'bg-gray-700' : 'bg-gray-50'
                )}>
                  <div className="flex items-center justify-center space-x-1 mb-2">
                    <MapPinIcon className={clsx(
                      'h-4 w-4',
                      isDark ? 'text-gray-400' : 'text-gray-400'
                    )} />
                    <span className={clsx(
                      'text-sm font-medium',
                      isDark ? 'text-gray-300' : 'text-gray-700'
                    )}>Километры</span>
                  </div>
                  {(() => {
                    const distanceDetails = calculateCourierDistanceDetails(courier.name)
                    return (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-center">
                          <div>
                            <p className={clsx(
                              'text-xs',
                              isDark ? 'text-gray-400' : 'text-gray-500'
                            )}>Основные</p>
                            <p className={clsx(
                              'text-sm font-semibold',
                              isDark ? 'text-gray-200' : 'text-gray-900'
                            )}>
                              {distanceDetails.baseDistance.toFixed(1)} км
                            </p>
                          </div>
                          <div>
                            <p className={clsx(
                              'text-xs',
                              isDark ? 'text-gray-400' : 'text-gray-500'
                            )}>Дополнительные</p>
                            <p className={clsx(
                              'text-sm font-semibold',
                              isDark ? 'text-orange-400' : 'text-orange-600'
                            )}>
                              +{distanceDetails.additionalDistance.toFixed(1)} км
                            </p>
                          </div>
                        </div>
                        <div className={clsx(
                          'border-t pt-2 text-center',
                          isDark ? 'border-gray-600' : 'border-gray-200'
                        )}>
                          <p className={clsx(
                            'text-xs',
                            isDark ? 'text-gray-400' : 'text-gray-500'
                          )}>Общий пробег</p>
                          <p className={clsx(
                            'text-lg font-bold',
                            isDark ? 'text-blue-400' : 'text-blue-600'
                          )}>
                            {distanceDetails.totalDistance.toFixed(1)} км
                          </p>
                        </div>
                        {distanceDetails.ordersInRoutes > 0 && (
                          <p className={clsx(
                            'text-xs text-center',
                            isDark ? 'text-gray-400' : 'text-gray-500'
                          )}>
                            (+500м к каждому из {distanceDetails.ordersInRoutes} заказов)
                          </p>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex space-x-2">
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
                {hasRoutes && (
                  <button
                    onClick={() => handleCourierClick(courier)}
                    className="w-full px-3 py-2 text-sm font-medium text-blue-800 bg-blue-100 hover:bg-blue-200 rounded-lg flex items-center justify-center space-x-2"
                  >
                    <MapPinIcon className="h-4 w-4" />
                    <span>Показать маршруты ({courierRoutes.length})</span>
                  </button>
                )}
              </div>
            </div>
            )
          })}
          </div>
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

  // Функция для очистки адреса от лишней информации
  const cleanAddress = (address: string) => {
    if (!address) return address
    
    // Удаляем информацию после номера дома (подъезд, этаж, подвал и т.д.)
    const cleaned = address
      .replace(/,\s*(под\.|подъезд|д\/ф|эт|этаж|эт\.|под|кв|квартира|оф|офис).*$/i, '')
      .replace(/,\s*\d+\s*(под\.|подъезд|д\/ф|эт|этаж|эт\.|под|кв|квартира|оф|офис).*$/i, '')
      .trim()
    
    return cleaned
  }

  const openRouteInGoogleMaps = (route: any) => {
    if (!route.orders || route.orders.length === 0) return

    // Создаем массив адресов для маршрута
    const addresses = [
      cleanAddress(route.startAddress || ''),
      ...route.orders.map((order: any) => cleanAddress(order.address)),
      cleanAddress(route.endAddress || '')
    ].filter(addr => addr) // Убираем пустые адреса
    
    // Кодируем каждый адрес отдельно
    const encodedAddresses = addresses.map((addr: string) => encodeURIComponent(addr))
    
    // Создаем URL для Google Maps с несколькими точками
    const googleMapsUrl = `https://www.google.com/maps/dir/${encodedAddresses.join('/')}`
    
    window.open(googleMapsUrl, '_blank')
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
                      <button
                        onClick={() => openRouteInGoogleMaps(route)}
                        className="p-1 text-gray-400 hover:text-blue-600"
                        title="Открыть маршрут в Google Maps"
                      >
                        <MapIcon className="h-4 w-4" />
                      </button>
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
