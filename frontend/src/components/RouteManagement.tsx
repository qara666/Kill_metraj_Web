import React, { useState, useEffect, useMemo } from 'react'
import { 
  MapIcon, 
  TruckIcon, 
  PlusIcon,
  TrashIcon,
  ClockIcon,
  MapPinIcon,
  CheckCircleIcon,
  ChevronUpIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline'
import { localStorageUtils } from '../utils/localStorage'
import { useExcelData } from '../contexts/ExcelDataContext'
import { useTheme } from '../contexts/ThemeContext'
import { clsx } from 'clsx'

// Google Maps types
declare global {
  interface Window {
    google: any
    googleMapsLoaded: boolean
    initGoogleMaps: () => void
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
  plannedTime?: string
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
  const { updateRouteData } = useExcelData()
  const { isDark } = useTheme()
  const [selectedCourier, setSelectedCourier] = useState<string | null>(null)
  const [routes, setRoutes] = useState<Route[]>([])
  const [isCalculating, setIsCalculating] = useState(false)
  const [startAddress, setStartAddress] = useState('')
  const [endAddress, setEndAddress] = useState('')
  const [googleMapsReady, setGoogleMapsReady] = useState(false)
  const [courierFilter, setCourierFilter] = useState<string>('all')
  const [courierPage, setCourierPage] = useState(0)
  const [routePage, setRoutePage] = useState(0)
  const [routesPerPage] = useState(5) // Количество маршрутов на странице
  const [orderSearchTerm, setOrderSearchTerm] = useState('')
  const [timeFilter, setTimeFilter] = useState<string>('all') // all, morning, afternoon, evening

  // Загружаем настройки адресов
  useEffect(() => {
    const settings = localStorageUtils.getAllSettings()
    setStartAddress(settings.defaultStartAddress)
    setEndAddress(settings.defaultEndAddress)
  }, [])

  // Загружаем сохраненные маршруты
  useEffect(() => {
    try {
      const savedRoutes = localStorage.getItem('km_routes')
      if (savedRoutes) {
        const parsedRoutes = JSON.parse(savedRoutes)
        if (Array.isArray(parsedRoutes)) {
          setRoutes(parsedRoutes)
        }
      }
    } catch (error) {
      console.warn('Ошибка загрузки маршрутов из localStorage:', error)
    }
  }, [])

  // Загружаем маршруты из контекста при инициализации
  useEffect(() => {
    if (excelData?.routes && Array.isArray(excelData.routes) && excelData.routes.length > 0) {
      setRoutes(excelData.routes)
    }
  }, [excelData?.routes])

  // Проверяем готовность Google Maps
  useEffect(() => {
    const checkGoogleMaps = () => {
      if (window.googleMapsLoaded && window.google && window.google.maps) {
        setGoogleMapsReady(true)
      } else {
        setTimeout(checkGoogleMaps, 500)
      }
    }
    checkGoogleMaps()
  }, [])

  // Сохраняем маршруты в localStorage
  useEffect(() => {
    try {
      localStorage.setItem('km_routes', JSON.stringify(routes))
    } catch (error) {
      console.warn('Ошибка сохранения маршрутов в localStorage:', error)
    }
  }, [routes])

  // Обновляем данные о маршрутах в контексте
  useEffect(() => {
    if (routes.length > 0) {
      updateRouteData(routes)
    }
  }, [routes, updateRouteData])

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
          plannedTime: order.plannedTime || '',
          isSelected: false
        })
      }
    })

    return grouped
  }, [excelData?.orders])

  // Функция для подсчета доступных заказов (исключая те, что уже в маршрутах)
  const getAvailableOrdersCount = (courierName: string) => {
    const allOrders = courierOrders[courierName] || []
    const ordersInRoutes = new Set()
    
    // Собираем ID всех заказов, которые уже в маршрутах
    routes.forEach(route => {
      if (route.courier === courierName) {
        route.orders.forEach(order => {
          ordersInRoutes.add(order.id)
        })
      }
    })
    
    // Возвращаем количество заказов, которые НЕ в маршрутах
    return allOrders.filter(order => !ordersInRoutes.has(order.id)).length
  }

  const couriers = Object.keys(courierOrders)

  // Определяем тип транспорта курьера
  const getCourierVehicleType = (courierName: string) => {
    if (!excelData?.couriers || !Array.isArray(excelData.couriers)) {
      return 'car'
    }
    const courier = excelData.couriers.find((c: any) => c.name === courierName)
    return courier?.vehicleType || 'car'
  }

  // Фильтруем и сортируем курьеров по типу транспорта и алфавиту
  const filteredCouriers = couriers
    .filter(courierName => {
      if (courierFilter === 'all') return true
      const vehicleType = getCourierVehicleType(courierName)
      return vehicleType === courierFilter
    })
    .sort((a, b) => a.localeCompare(b, 'ru'))

  // Пагинация курьеров (6 на страницу)
  const COURIERS_PER_PAGE = 6
  const totalCourierPages = Math.ceil(filteredCouriers.length / COURIERS_PER_PAGE)
  const paginatedCouriers = filteredCouriers.slice(
    courierPage * COURIERS_PER_PAGE,
    (courierPage + 1) * COURIERS_PER_PAGE
  )

  // Пагинация маршрутов
  const totalRoutePages = Math.ceil(routes.length / routesPerPage)
  const paginatedRoutes = routes.slice(
    routePage * routesPerPage,
    (routePage + 1) * routesPerPage
  )

  const handleCourierSelect = (courierName: string) => {
    setSelectedCourier(courierName)
  }

  // Функция для фильтрации заказов по времени
  const filterOrdersByTime = (orders: Order[]) => {
    if (timeFilter === 'all') return orders
    
    return orders.filter(order => {
      if (!order.plannedTime) return timeFilter === 'all'
      
      const time = order.plannedTime.toLowerCase()
      switch (timeFilter) {
        case 'morning':
          return time.includes('утро') || time.includes('morning') || 
                 (time.includes(':') && parseInt(time.split(':')[0]) >= 6 && parseInt(time.split(':')[0]) < 12)
        case 'afternoon':
          return time.includes('день') || time.includes('afternoon') || 
                 (time.includes(':') && parseInt(time.split(':')[0]) >= 12 && parseInt(time.split(':')[0]) < 18)
        case 'evening':
          return time.includes('вечер') || time.includes('evening') || 
                 (time.includes(':') && parseInt(time.split(':')[0]) >= 18)
        default:
          return true
      }
    })
  }

  // Функция для поиска заказов по номеру
  const searchOrders = (orders: Order[]) => {
    if (!orderSearchTerm.trim()) return orders
    
    const searchTerm = orderSearchTerm.toLowerCase().trim()
    return orders.filter(order => 
      order.orderNumber.toLowerCase().includes(searchTerm) ||
      order.customerName.toLowerCase().includes(searchTerm) ||
      order.address.toLowerCase().includes(searchTerm)
    )
  }

  // Сортируем заказы: сначала доступные по времени, потом заказы в маршрутах
  const sortOrdersByTime = (orders: Order[]) => {
    return [...orders].sort((a, b) => {
      const aInRoute = isOrderInExistingRoute(a.id)
      const bInRoute = isOrderInExistingRoute(b.id)
      
      // Сначала сортируем по статусу: доступные заказы сверху, в маршрутах снизу
      if (aInRoute && !bInRoute) return 1
      if (!aInRoute && bInRoute) return -1
      
      // Если оба в одном статусе, сортируем по времени
      if (!a.plannedTime && !b.plannedTime) return 0
      if (!a.plannedTime) return 1
      if (!b.plannedTime) return -1
      return a.plannedTime.localeCompare(b.plannedTime)
    })
  }

  // Проверяем, существует ли уже маршрут для данного курьера с теми же заказами
  const isRouteDuplicate = (courierName: string, selectedOrderIds: Set<string>) => {
    return routes.some(route => {
      if (route.courier !== courierName) return false
      
      const routeOrderIds = new Set(route.orders.map(order => order.id))
      if (routeOrderIds.size !== selectedOrderIds.size) return false
      
      for (const id of selectedOrderIds) {
        if (!routeOrderIds.has(id)) return false
      }
      
      return true
    })
  }

  // Проверяем, включен ли заказ в существующий маршрут
  const isOrderInExistingRoute = (orderId: string) => {
    return routes.some(route => 
      route.orders.some(order => order.id === orderId)
    )
  }

  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [selectedOrdersOrder, setSelectedOrdersOrder] = useState<string[]>([])

  const handleOrderSelect = (orderId: string) => {
    if (!selectedCourier) return

    // Проверяем, что заказ не находится уже в маршруте
    if (isOrderInExistingRoute(orderId)) {
      return // Не позволяем выбирать заказы, которые уже в маршрутах
    }

    setSelectedOrders(prev => {
      const newSet = new Set(prev)
      if (newSet.has(orderId)) {
        newSet.delete(orderId)
        // Удаляем из порядка выбора
        setSelectedOrdersOrder(prevOrder => prevOrder.filter(id => id !== orderId))
      } else {
        newSet.add(orderId)
        // Добавляем в конец порядка выбора
        setSelectedOrdersOrder(prevOrder => [...prevOrder, orderId])
      }
      return newSet
    })
  }

  // Функции для изменения порядка выбранных заказов
  const moveOrderUp = (orderId: string) => {
    const currentIndex = selectedOrdersOrder.indexOf(orderId)
    if (currentIndex > 0) {
      const newOrder = [...selectedOrdersOrder]
      ;[newOrder[currentIndex - 1], newOrder[currentIndex]] = [newOrder[currentIndex], newOrder[currentIndex - 1]]
      setSelectedOrdersOrder(newOrder)
    }
  }

  const moveOrderDown = (orderId: string) => {
    const currentIndex = selectedOrdersOrder.indexOf(orderId)
    if (currentIndex < selectedOrdersOrder.length - 1) {
      const newOrder = [...selectedOrdersOrder]
      ;[newOrder[currentIndex], newOrder[currentIndex + 1]] = [newOrder[currentIndex + 1], newOrder[currentIndex]]
      setSelectedOrdersOrder(newOrder)
    }
  }

  const createRoute = async () => {
    if (!selectedCourier) return

    // Создаем список заказов в порядке их выбора
    const selectedOrdersList = selectedOrdersOrder
      .map(orderId => courierOrders[selectedCourier].find(order => order.id === orderId))
      .filter(order => order !== undefined) as Order[]

    if (selectedOrdersList.length === 0) {
      alert('Выберите заказы для создания маршрута')
      return
    }

    // Проверяем на дубликаты
    if (isRouteDuplicate(selectedCourier, selectedOrders)) {
      alert('Маршрут с такими же заказами для этого курьера уже существует')
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

    setRoutes(prev => [newRoute, ...prev])
    
    // Сбрасываем выбор заказов и порядок
    setSelectedOrders(new Set())
    setSelectedOrdersOrder([])

    // Автоматически рассчитываем расстояние для нового маршрута
    setTimeout(() => {
      calculateRouteDistance(newRoute)
    }, 100)
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

  const calculateRouteDistance = async (route: Route) => {
    if (!googleMapsReady) {
      alert('Google Maps API загружается... Попробуйте через несколько секунд')
      return
    }

    setIsCalculating(true)

    try {
      const directionsService = new window.google.maps.DirectionsService()
      const waypoints = route.orders.map(order => ({
        location: cleanAddress(order.address),
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
    if (window.confirm('Вы уверены, что хотите удалить этот маршрут?')) {
      setRoutes(prev => prev.filter(route => route.id !== routeId))
    }
  }

  const clearAllRoutes = () => {
    if (window.confirm('Вы уверены, что хотите удалить все маршруты?')) {
      setRoutes([])
    }
  }

  const openRouteInGoogleMaps = (route: Route) => {
    if (!route.isOptimized || route.orders.length === 0) {
      alert('Сначала рассчитайте маршрут')
      return
    }

    // Создаем массив адресов для маршрута
    const addresses = [
      cleanAddress(route.startAddress),
      ...route.orders.map(order => cleanAddress(order.address)),
      cleanAddress(route.endAddress)
    ]
    
    // Кодируем каждый адрес отдельно
    const encodedAddresses = addresses.map(addr => encodeURIComponent(addr))
    
    // Создаем URL для Google Maps с несколькими точками
    const googleMapsUrl = `https://www.google.com/maps/dir/${encodedAddresses.join('/')}`
    window.open(googleMapsUrl, '_blank')
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = Math.floor(minutes % 60)
    return hours > 0 ? `${hours}ч ${mins}мин` : `${mins}мин`
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
            )}>Управление маршрутами</h1>
            <p className={clsx(
              'mt-1 text-sm',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              Создавайте маршруты для курьеров и рассчитывайте расстояния
            </p>
          </div>
          <div className={clsx(
            'flex items-center space-x-4 text-sm',
            isDark ? 'text-gray-400' : 'text-gray-500'
          )}>
            <span>{couriers.length} курьеров, {routes.length} маршрутов</span>
            <div className="flex items-center space-x-1">
              <div className={`w-2 h-2 rounded-full ${googleMapsReady ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
              <span>{googleMapsReady ? 'Google Maps готов' : 'Загрузка Google Maps...'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Маршруты */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Созданные маршруты</h2>
              {routes.length > 0 && (
                <button
                  onClick={clearAllRoutes}
                  className="text-sm text-red-600 hover:text-red-800 font-medium"
                >
                  Очистить все
                </button>
              )}
            </div>
              
              {routes.length === 0 ? (
                <div className="text-center py-8">
                  <MapIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-2 text-sm text-gray-500">Создайте маршруты для курьеров</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {paginatedRoutes.map(route => (
                    <div key={route.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <TruckIcon className={`h-5 w-5 ${
                            getCourierVehicleType(route.courier) === 'car' ? 'text-green-600' : 'text-orange-600'
                          }`} />
                          <div>
                            <h3 className="font-medium text-gray-900">{route.courier}</h3>
                            <p className="text-sm text-gray-500">
                              {route.orders.length} заказов
                            </p>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            getCourierVehicleType(route.courier) === 'car' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-orange-100 text-orange-800'
                          }`}>
                            {getCourierVehicleType(route.courier) === 'car' ? 'Авто' : 'Мото'}
                          </span>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => route.isOptimized ? openRouteInGoogleMaps(route) : calculateRouteDistance(route)}
                            disabled={isCalculating}
                            className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-50"
                            title={route.isOptimized ? "Открыть маршрут в Google Maps" : "Рассчитать расстояние"}
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

                      <div className="mt-3 pt-3 border-t border-gray-200">
                        {route.isOptimized ? (
                          <>
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
                            <div className="text-xs text-green-600 mt-1">
                              ✓ Маршрут создан
                            </div>
                          </>
                        ) : (
                          <div className="text-sm text-gray-500">
                            {isCalculating ? 'Расчет расстояния...' : 'Нажмите на карту для расчета расстояния'}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Пагинация маршрутов */}
              {totalRoutePages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <button
                    onClick={() => setRoutePage(Math.max(0, routePage - 1))}
                    disabled={routePage === 0}
                    className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ← Назад
                  </button>
                  <span className="text-sm text-gray-500">
                    Страница {routePage + 1} из {totalRoutePages}
                  </span>
                  <button
                    onClick={() => setRoutePage(Math.min(totalRoutePages - 1, routePage + 1))}
                    disabled={routePage >= totalRoutePages - 1}
                    className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Вперед →
                  </button>
                </div>
              )}
            </div>
          </div>

        {/* Курьеры и заказы */}
        <div className="space-y-4">
          <div className={clsx(
            'rounded-lg shadow-sm border p-6',
            isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
          )}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={clsx(
                'text-lg font-semibold',
                isDark ? 'text-gray-100' : 'text-gray-900'
              )}>Курьеры</h2>
              <div className="flex space-x-2">
                <button
                  onClick={() => setCourierFilter('all')}
                  className={`px-3 py-1 text-xs rounded-full ${
                    courierFilter === 'all'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  Все
                </button>
                <button
                  onClick={() => setCourierFilter('car')}
                  className={`px-3 py-1 text-xs rounded-full flex items-center space-x-1 ${
                    courierFilter === 'car'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  <TruckIcon className="h-3 w-3" />
                  <span>Авто</span>
                </button>
                <button
                  onClick={() => setCourierFilter('motorcycle')}
                  className={`px-3 py-1 text-xs rounded-full flex items-center space-x-1 ${
                    courierFilter === 'motorcycle'
                      ? 'bg-orange-100 text-orange-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  <TruckIcon className="h-3 w-3" />
                  <span>Мото</span>
                </button>
              </div>
            </div>
            
            {paginatedCouriers.length === 0 ? (
              <div className="text-center py-8">
                <TruckIcon className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-500">
                  {couriers.length === 0 
                    ? 'Загрузите Excel файл для отображения курьеров'
                    : 'Нет курьеров выбранного типа'
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {paginatedCouriers.map(courierName => {
                  const vehicleType = getCourierVehicleType(courierName)
                  return (
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
                          <TruckIcon className={`h-5 w-5 ${
                            vehicleType === 'car' ? 'text-green-600' : 'text-orange-600'
                          }`} />
                          <span className="font-medium">{courierName}</span>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            vehicleType === 'car' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-orange-100 text-orange-800'
                          }`}>
                            {vehicleType === 'car' ? 'Авто' : 'Мото'}
                          </span>
                        </div>
                        <span className="text-sm text-gray-500">
                          {getAvailableOrdersCount(courierName)} заказов
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Пагинация */}
            {totalCourierPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <button
                  onClick={() => setCourierPage(Math.max(0, courierPage - 1))}
                  disabled={courierPage === 0}
                  className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ← Назад
                </button>
                <span className="text-sm text-gray-500">
                  Страница {courierPage + 1} из {totalCourierPages}
                </span>
                <button
                  onClick={() => setCourierPage(Math.min(totalCourierPages - 1, courierPage + 1))}
                  disabled={courierPage >= totalCourierPages - 1}
                  className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Вперед →
                </button>
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
                  disabled={selectedOrders.size === 0 || isRouteDuplicate(selectedCourier, selectedOrders)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium ${
                    selectedOrders.size === 0 || isRouteDuplicate(selectedCourier, selectedOrders)
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  <PlusIcon className="h-4 w-4" />
                  <span>
                    {isRouteDuplicate(selectedCourier, selectedOrders) 
                      ? 'Маршрут уже существует' 
                      : `Создать маршрут (${selectedOrders.size})`
                    }
                  </span>
                  {selectedOrders.size > 0 && !isRouteDuplicate(selectedCourier, selectedOrders) && (
                    <div className="flex items-center space-x-1 ml-2">
                      <span className="text-xs text-blue-200">Порядок:</span>
                      <div className="flex space-x-1">
                        {selectedOrdersOrder.map((orderId, index) => (
                          <span key={orderId} className="bg-blue-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                            {index + 1}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </button>
              </div>

              {/* Фильтры заказов */}
              <div className="mb-4 space-y-3">
                {/* Поиск по номеру заказа */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Поиск заказа
                  </label>
                  <input
                    type="text"
                    placeholder="Номер заказа, имя клиента или адрес..."
                    value={orderSearchTerm}
                    onChange={(e) => setOrderSearchTerm(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Фильтр по времени */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Время доставки
                  </label>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setTimeFilter('all')}
                      className={`px-3 py-1 text-xs rounded-full ${
                        timeFilter === 'all'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Все
                    </button>
                    <button
                      onClick={() => setTimeFilter('morning')}
                      className={`px-3 py-1 text-xs rounded-full ${
                        timeFilter === 'morning'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Утро (6-12)
                    </button>
                    <button
                      onClick={() => setTimeFilter('afternoon')}
                      className={`px-3 py-1 text-xs rounded-full ${
                        timeFilter === 'afternoon'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      День (12-18)
                    </button>
                    <button
                      onClick={() => setTimeFilter('evening')}
                      className={`px-3 py-1 text-xs rounded-full ${
                        timeFilter === 'evening'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Вечер (18+)
                    </button>
                  </div>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto">
                {(() => {
                  const allOrders = sortOrdersByTime(
                    searchOrders(
                      filterOrdersByTime(courierOrders[selectedCourier] || [])
                    )
                  )
                  const availableOrders = allOrders.filter(order => !isOrderInExistingRoute(order.id))
                  const ordersInRoutes = allOrders.filter(order => isOrderInExistingRoute(order.id))
                  
                  return (
                    <div className="space-y-4">
                      {/* Доступные заказы */}
                      {availableOrders.length > 0 && (
                        <div>
                          <div className="flex items-center space-x-2 mb-2">
                            <CheckCircleIcon className="h-4 w-4 text-green-600" />
                            <span className="text-sm font-medium text-green-800">
                              Доступные заказы ({availableOrders.length})
                            </span>
                          </div>
                          <div className="space-y-2">
                            {availableOrders.map(order => {
                              const isSelected = selectedOrders.has(order.id)
                              const selectionOrder = selectedOrdersOrder.indexOf(order.id) + 1
                              return (
                                <div
                                  key={order.id}
                                  onClick={() => handleOrderSelect(order.id)}
                                  className={`p-3 rounded-lg border transition-colors ${
                                    isSelected
                                      ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-500 cursor-pointer'
                                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100 cursor-pointer'
                                  }`}
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-center space-x-2">
                                        <span className="font-medium text-gray-900">
                                          Заказ #{order.orderNumber}
                                        </span>
                                        {isSelected && (
                                          <div className="flex items-center space-x-2">
                                            <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                                              {selectionOrder}
                                            </span>
                                            <div className="flex flex-col space-y-1">
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  moveOrderUp(order.id)
                                                }}
                                                disabled={selectionOrder === 1}
                                                className="p-1 text-blue-600 hover:text-blue-800 disabled:opacity-30 disabled:cursor-not-allowed"
                                                title="Переместить вверх"
                                              >
                                                <ChevronUpIcon className="h-3 w-3" />
                                              </button>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  moveOrderDown(order.id)
                                                }}
                                                disabled={selectionOrder === selectedOrdersOrder.length}
                                                className="p-1 text-blue-600 hover:text-blue-800 disabled:opacity-30 disabled:cursor-not-allowed"
                                                title="Переместить вниз"
                                              >
                                                <ChevronDownIcon className="h-3 w-3" />
                                              </button>
                                            </div>
                                            <CheckCircleIcon className="h-4 w-4 text-blue-600" />
                                          </div>
                                        )}
                                      </div>
                                      <p className="text-sm text-gray-600 mt-1">{order.address}</p>
                                      <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                                        <span>{order.customerName}</span>
                                        <span>{order.phone}</span>
                                        <span>{order.amount} грн</span>
                                        {order.plannedTime && (
                                          <span className="text-blue-600 font-medium">
                                            {order.plannedTime}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      
                      {/* Заказы в маршрутах */}
                      {ordersInRoutes.length > 0 && (
                        <div>
                          <div className="flex items-center space-x-2 mb-2">
                            <ClockIcon className="h-4 w-4 text-yellow-600" />
                            <span className="text-sm font-medium text-yellow-800">
                              Заказы в маршрутах ({ordersInRoutes.length})
                            </span>
                          </div>
                          <div className="space-y-2">
                            {ordersInRoutes.map(order => (
                              <div
                                key={order.id}
                                className="p-3 rounded-lg border bg-yellow-50 border-yellow-200 cursor-not-allowed opacity-60"
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-2">
                                      <span className="font-medium text-gray-900">
                                        Заказ #{order.orderNumber}
                                      </span>
                                      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                                        В маршруте
                                      </span>
                                    </div>
                                    <p className="text-sm text-gray-600 mt-1">{order.address}</p>
                                    <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                                      <span>{order.customerName}</span>
                                      <span>{order.phone}</span>
                                      <span>{order.amount} грн</span>
                                      {order.plannedTime && (
                                        <span className="text-blue-600 font-medium">
                                          {order.plannedTime}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
