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
  const [searchTerm, setSearchTerm] = useState('')

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

  // Функция для поиска курьеров
  const searchCouriers = (courier: Courier) => {
    if (!searchTerm.trim()) return true
    const searchLower = searchTerm.toLowerCase()
    return courier.name.toLowerCase().includes(searchLower) ||
           courier.phone.includes(searchTerm) ||
           courier.email.toLowerCase().includes(searchLower)
  }

  const filteredCouriers = couriers
    .filter(courier => {
      if (filter === 'all') return true
      return courier.vehicleType === filter
    })
    .filter(searchCouriers)

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


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={clsx(
        'rounded-xl shadow-lg border p-8 relative overflow-hidden',
        isDark ? 'bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700' : 'bg-gradient-to-br from-white to-gray-50 border-gray-200'
      )}>
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-32 h-32 opacity-10">
          <div className={clsx(
            'w-full h-full rounded-full',
            isDark ? 'bg-blue-500' : 'bg-blue-400'
          )}></div>
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className={clsx(
                'p-3 rounded-xl',
                isDark ? 'bg-blue-900/50' : 'bg-blue-100'
              )}>
                <UserIcon className={clsx(
                  'h-8 w-8',
                  isDark ? 'text-blue-400' : 'text-blue-600'
                )} />
              </div>
              <div>
                <h1 className={clsx(
                  'text-3xl font-bold bg-gradient-to-r bg-clip-text text-transparent',
                  isDark ? 'from-gray-100 to-gray-300' : 'from-gray-900 to-gray-700'
                )}>
                  Управление курьерами
                </h1>
                <p className={clsx(
                  'mt-2 text-base',
                  isDark ? 'text-gray-300' : 'text-gray-600'
                )}>
                  Управляйте информацией о курьерах и их заказах
                </p>
                <div className="flex items-center space-x-4 mt-3">
                  <div className="flex items-center space-x-2">
                    <div className={clsx(
                      'w-2 h-2 rounded-full',
                      isDark ? 'bg-green-400' : 'bg-green-500'
                    )}></div>
                    <span className={clsx(
                      'text-sm font-medium',
                      isDark ? 'text-gray-300' : 'text-gray-600'
                    )}>
                      {couriers.filter(c => c.isActive).length} активных
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={clsx(
                      'w-2 h-2 rounded-full',
                      isDark ? 'bg-blue-400' : 'bg-blue-500'
                    )}></div>
                    <span className={clsx(
                      'text-sm font-medium',
                      isDark ? 'text-gray-300' : 'text-gray-600'
                    )}>
                      {couriers.length} всего
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className={clsx(
                'px-6 py-3 rounded-xl font-medium transition-all duration-200 transform hover:scale-105 shadow-lg',
                'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800',
                'text-white flex items-center space-x-2'
              )}
            >
              <PlusIcon className="h-5 w-5" />
              <span>Добавить курьера</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className={clsx(
        'rounded-xl shadow-lg border p-6',
        isDark ? 'bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700' : 'bg-gradient-to-br from-white to-gray-50 border-gray-200'
      )}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0 lg:space-x-6">
          {/* Filter Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setFilter('all')}
              className={clsx(
                'px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200 transform hover:scale-105 shadow-md',
                filter === 'all' 
                  ? isDark 
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg' 
                    : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg'
                  : isDark
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100 hover:text-gray-900 border border-gray-200'
              )}
            >
              <div className="flex items-center space-x-2">
                <UserIcon className="h-4 w-4" />
                <span>Все курьеры</span>
                <span className={clsx(
                  'px-2 py-1 rounded-full text-xs font-bold',
                  filter === 'all' ? 'bg-white/20' : isDark ? 'bg-gray-600' : 'bg-gray-200'
                )}>
                  {couriers.length}
                </span>
              </div>
            </button>
            <button
              onClick={() => setFilter('car')}
              className={clsx(
                'px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200 transform hover:scale-105 shadow-md flex items-center space-x-2',
                filter === 'car' 
                  ? isDark
                    ? 'bg-gradient-to-r from-green-600 to-green-700 text-white shadow-lg'
                    : 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg'
                  : isDark
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100 hover:text-gray-900 border border-gray-200'
              )}
            >
              <TruckIcon className="h-4 w-4" />
              <span>Авто курьеры</span>
              <span className={clsx(
                'px-2 py-1 rounded-full text-xs font-bold',
                filter === 'car' ? 'bg-white/20' : isDark ? 'bg-gray-600' : 'bg-gray-200'
              )}>
                {couriers.filter(c => c.vehicleType === 'car').length}
              </span>
            </button>
            <button
              onClick={() => setFilter('motorcycle')}
              className={clsx(
                'px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200 transform hover:scale-105 shadow-md flex items-center space-x-2',
                filter === 'motorcycle' 
                  ? isDark
                    ? 'bg-gradient-to-r from-orange-600 to-orange-700 text-white shadow-lg'
                    : 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg'
                  : isDark
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100 hover:text-gray-900 border border-gray-200'
              )}
            >
              <TruckIcon className="h-4 w-4" />
              <span>Мото курьеры</span>
              <span className={clsx(
                'px-2 py-1 rounded-full text-xs font-bold',
                filter === 'motorcycle' ? 'bg-white/20' : isDark ? 'bg-gray-600' : 'bg-gray-200'
              )}>
                {couriers.filter(c => c.vehicleType === 'motorcycle').length}
              </span>
            </button>
          </div>
          
          {/* Search Field */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <input
                type="text"
                placeholder="Поиск по имени, телефону или email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={clsx(
                  'w-full px-4 py-3 pl-12 rounded-xl border text-sm transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                  isDark 
                    ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400 focus:bg-gray-600' 
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white shadow-md'
                )}
              />
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center hover:bg-gray-100 rounded-r-xl transition-colors"
                >
                  <XMarkIcon className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Couriers Grid */}
      {filteredCouriers.length === 0 ? (
        <div className={clsx(
          'rounded-xl shadow-lg border p-16 text-center relative overflow-hidden',
          isDark 
            ? 'bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700' 
            : 'bg-gradient-to-br from-white to-gray-50 border-gray-200'
        )}>
          {/* Background decoration */}
          <div className="absolute top-0 right-0 w-24 h-24 opacity-5">
            <div className={clsx(
              'w-full h-full rounded-full',
              isDark ? 'bg-blue-500' : 'bg-blue-400'
            )}></div>
          </div>
          
          <div className="relative z-10">
            <div className={clsx(
              'mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-6',
              isDark ? 'bg-gray-700' : 'bg-gray-100'
            )}>
              <UserIcon className={clsx(
                'h-10 w-10',
                isDark ? 'text-gray-400' : 'text-gray-500'
              )} />
            </div>
            <h3 className={clsx(
              'text-xl font-bold mb-2',
              isDark ? 'text-gray-200' : 'text-gray-900'
            )}>
              {filter === 'all' ? 'Нет курьеров' : `Нет ${filter === 'car' ? 'авто' : 'мото'} курьеров`}
            </h3>
            <p className={clsx(
              'text-base mb-6 max-w-md mx-auto',
              isDark ? 'text-gray-400' : 'text-gray-500'
            )}>
              {filter === 'all' 
                ? 'Добавьте курьеров или загрузите Excel файл с данными для начала работы'
                : `В данный момент нет курьеров с типом транспорта "${filter === 'car' ? 'автомобиль' : 'мотоцикл'}"`
              }
            </p>
            {filter === 'all' && (
              <button
                onClick={() => setShowAddModal(true)}
                className={clsx(
                  'px-6 py-3 rounded-xl font-medium transition-all duration-200 transform hover:scale-105 shadow-lg',
                  'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800',
                  'text-white flex items-center space-x-2 mx-auto'
                )}
              >
                <PlusIcon className="h-5 w-5" />
                <span>Добавить первого курьера</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Простые заголовки без сортировки */}
          <div className={clsx(
            'grid grid-cols-4 gap-4 p-4 rounded-lg',
            isDark ? 'bg-gray-700' : 'bg-gray-100'
          )}>
            <div className="text-left font-medium text-sm">
              <span className={clsx(
                isDark ? 'text-gray-200' : 'text-gray-700'
              )}>Имя курьера</span>
            </div>
            <div className="text-left font-medium text-sm">
              <span className={clsx(
                isDark ? 'text-gray-200' : 'text-gray-700'
              )}>Заказы</span>
            </div>
            <div className="text-left font-medium text-sm">
              <span className={clsx(
                isDark ? 'text-gray-200' : 'text-gray-700'
              )}>Километры</span>
            </div>
            <div className="text-left font-medium text-sm">
              <span className={clsx(
                isDark ? 'text-gray-200' : 'text-gray-700'
              )}>Статус</span>
            </div>
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
                'group rounded-xl shadow-lg border p-6 transition-all duration-300 transform hover:scale-105 hover:shadow-xl',
                isDark 
                  ? 'bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700 hover:from-gray-700 hover:to-gray-800' 
                  : 'bg-gradient-to-br from-white to-gray-50 border-gray-200 hover:from-gray-50 hover:to-white',
                !courier.isActive && isDark ? 'opacity-60' : '',
                !courier.isActive && !isDark ? 'opacity-60' : ''
              )}
            >
              {/* Header with avatar and actions */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleCourierVehicleType(courier.id)
                      }}
                      className={clsx(
                        'h-16 w-16 rounded-2xl flex items-center justify-center transition-all duration-200 hover:scale-110 shadow-lg',
                        courier.vehicleType === 'car' 
                          ? isDark 
                            ? 'bg-gradient-to-br from-green-600 to-green-700 hover:from-green-700 hover:to-green-800' 
                            : 'bg-gradient-to-br from-green-500 to-green-600 hover:from-green-600 hover:to-green-700'
                          : isDark
                            ? 'bg-gradient-to-br from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800'
                            : 'bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700'
                      )}
                      title={`Переключить на ${courier.vehicleType === 'car' ? 'мотоцикл' : 'автомобиль'}`}
                    >
                      {courier.vehicleType === 'car' ? (
                        <TruckIcon className="h-8 w-8 text-white" />
                      ) : (
                        <TruckIcon className="h-8 w-8 text-white" />
                      )}
                    </button>
                    {/* Status indicator */}
                    <div className={clsx(
                      'absolute -top-1 -right-1 w-4 h-4 rounded-full border-2',
                      courier.isActive 
                        ? 'bg-green-500 border-white' 
                        : 'bg-red-500 border-white'
                    )}></div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={clsx(
                      'text-xl font-bold truncate',
                      isDark ? 'text-gray-100' : 'text-gray-900'
                    )}>
                      {courier.name}
                    </h3>
                    <p className={clsx(
                      'text-sm flex items-center mt-1',
                      isDark ? 'text-gray-400' : 'text-gray-500'
                    )}>
                      <MapPinIcon className="h-4 w-4 mr-2" />
                      {courier.location}
                    </p>
                    <div className="flex items-center space-x-2 mt-2">
                      <span className={clsx(
                        'inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold',
                        courier.isActive 
                          ? isDark
                            ? 'bg-green-900/50 text-green-300 border border-green-700'
                            : 'bg-green-100 text-green-800 border border-green-200'
                          : isDark
                            ? 'bg-red-900/50 text-red-300 border border-red-700'
                            : 'bg-red-100 text-red-800 border border-red-200'
                      )}>
                        {courier.isActive ? 'Активен' : 'Неактивен'}
                      </span>
                      <span className={clsx(
                        'inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold',
                        courier.vehicleType === 'car' 
                          ? isDark
                            ? 'bg-blue-900/50 text-blue-300 border border-blue-700'
                            : 'bg-blue-100 text-blue-800 border border-blue-200'
                          : isDark
                            ? 'bg-orange-900/50 text-orange-300 border border-orange-700'
                            : 'bg-orange-100 text-orange-800 border border-orange-200'
                      )}>
                        {courier.vehicleType === 'car' ? 'Авто' : 'Мото'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setEditingCourier(courier)}
                    className={clsx(
                      'p-2 rounded-lg transition-all duration-200 hover:scale-110',
                      isDark 
                        ? 'text-gray-400 hover:text-blue-400 hover:bg-blue-900/20' 
                        : 'text-gray-400 hover:text-blue-600 hover:bg-blue-100'
                    )}
                    title="Редактировать курьера"
                  >
                    <PencilIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleDeleteCourier(courier.id)}
                    className={clsx(
                      'p-2 rounded-lg transition-all duration-200 hover:scale-110',
                      isDark 
                        ? 'text-gray-400 hover:text-red-400 hover:bg-red-900/20' 
                        : 'text-gray-400 hover:text-red-600 hover:bg-red-100'
                    )}
                    title="Удалить курьера"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-2 gap-4 mt-6">
                {/* Заказы */}
                <div className={clsx(
                  'rounded-xl p-4 text-center transition-all duration-200 hover:scale-105',
                  isDark 
                    ? 'bg-gradient-to-br from-blue-900/30 to-blue-800/20 border border-blue-700/50' 
                    : 'bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200'
                )}>
                  <div className="flex items-center justify-center space-x-2 mb-2">
                    <div className={clsx(
                      'p-2 rounded-lg',
                      isDark ? 'bg-blue-800/50' : 'bg-blue-200'
                    )}>
                      <TruckIcon className={clsx(
                        'h-5 w-5',
                        isDark ? 'text-blue-300' : 'text-blue-600'
                      )} />
                    </div>
                    <span className={clsx(
                      'text-sm font-semibold',
                      isDark ? 'text-blue-200' : 'text-blue-800'
                    )}>Заказы</span>
                  </div>
                  <div className="text-center">
                    <p className={clsx(
                      'text-xs mb-1',
                      isDark ? 'text-blue-300/70' : 'text-blue-600/70'
                    )}>В маршрутах</p>
                    <p className={clsx(
                      'text-2xl font-bold',
                      isDark ? 'text-blue-300' : 'text-blue-700'
                    )}>
                      {calculateCourierOrdersInRoutes(courier.name)}
                    </p>
                  </div>
                </div>

                {/* Километры */}
                <div className={clsx(
                  'rounded-xl p-4 text-center transition-all duration-200 hover:scale-105',
                  isDark 
                    ? 'bg-gradient-to-br from-green-900/30 to-green-800/20 border border-green-700/50' 
                    : 'bg-gradient-to-br from-green-50 to-green-100 border border-green-200'
                )}>
                  <div className="flex items-center justify-center space-x-2 mb-2">
                    <div className={clsx(
                      'p-2 rounded-lg',
                      isDark ? 'bg-green-800/50' : 'bg-green-200'
                    )}>
                      <MapPinIcon className={clsx(
                        'h-5 w-5',
                        isDark ? 'text-green-300' : 'text-green-600'
                      )} />
                    </div>
                    <span className={clsx(
                      'text-sm font-semibold',
                      isDark ? 'text-green-200' : 'text-green-800'
                    )}>Пробег</span>
                  </div>
                  {(() => {
                    const distanceDetails = calculateCourierDistanceDetails(courier.name)
                    return (
                      <div className="text-center">
                        <p className={clsx(
                          'text-xs mb-1',
                          isDark ? 'text-green-300/70' : 'text-green-600/70'
                        )}>Общий пробег</p>
                        <p className={clsx(
                          'text-2xl font-bold',
                          isDark ? 'text-green-300' : 'text-green-700'
                        )}>
                          {distanceDetails.totalDistance.toFixed(1)} км
                        </p>
                        {distanceDetails.ordersInRoutes > 0 && (
                          <p className={clsx(
                            'text-xs mt-1',
                            isDark ? 'text-green-300/60' : 'text-green-600/60'
                          )}>
                            +{distanceDetails.ordersInRoutes} заказов
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
