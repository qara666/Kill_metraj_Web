import React, { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react'
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
import { googleMapsLoader } from '../utils/googleMapsLoader'
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

// Мемоизированный компонент для заказа
const OrderItem = memo(({ 
  order, 
  isSelected, 
  selectionOrder, 
  onSelect, 
  onMoveUp, 
  onMoveDown, 
  isInRoute,
  isDark = false
}: {
  order: Order
  isSelected: boolean
  selectionOrder: number
  onSelect: (id: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  isInRoute: boolean
  isDark?: boolean
}) => {
  return (
    <div
      onClick={() => onSelect(order.id)}
      className={clsx(
        'p-3 rounded-lg border transition-all duration-200 ease-in-out transform hover:scale-[1.01]',
        isSelected
          ? isDark 
            ? 'bg-blue-600/20 border-blue-500 ring-2 ring-blue-500 cursor-pointer shadow-md' 
            : 'bg-blue-50 border-blue-200 ring-2 ring-blue-500 cursor-pointer shadow-md'
          : isInRoute
          ? isDark 
            ? 'bg-yellow-600/20 border-yellow-500 cursor-not-allowed opacity-60' 
            : 'bg-yellow-50 border-yellow-200 cursor-not-allowed opacity-60'
          : isDark 
            ? 'bg-gray-700 border-gray-600 hover:bg-gray-600 cursor-pointer hover:shadow-sm' 
            : 'bg-gray-50 border-gray-200 hover:bg-gray-100 cursor-pointer hover:shadow-sm'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2">
            <span className={clsx(
              'font-medium',
              isDark ? 'text-gray-100' : 'text-gray-900'
            )}>
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
                      onMoveUp(order.id)
                    }}
                    disabled={selectionOrder === 1}
                    className={clsx(
                      'p-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
                      isDark 
                        ? 'text-blue-400 hover:text-blue-300' 
                        : 'text-blue-600 hover:text-blue-800'
                    )}
                    title="Переместить вверх"
                  >
                    <ChevronUpIcon className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onMoveDown(order.id)
                    }}
                    disabled={selectionOrder === 0}
                    className={clsx(
                      'p-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
                      isDark 
                        ? 'text-blue-400 hover:text-blue-300' 
                        : 'text-blue-600 hover:text-blue-800'
                    )}
                    title="Переместить вниз"
                  >
                    <ChevronDownIcon className="h-3 w-3" />
                  </button>
                </div>
                <CheckCircleIcon className={clsx(
                  'h-4 w-4',
                  isDark ? 'text-blue-400' : 'text-blue-600'
                )} />
              </div>
            )}
            {isInRoute && (
              <span className={clsx(
                'text-xs px-2 py-1 rounded',
                isDark 
                  ? 'bg-yellow-600/20 text-yellow-300' 
                  : 'bg-yellow-100 text-yellow-800'
              )}>
                В маршруте
              </span>
            )}
          </div>
          <p className={clsx(
            'text-sm mt-1',
            isDark ? 'text-gray-300' : 'text-gray-600'
          )}>{order.address}</p>
          <div className={clsx(
            'flex items-center space-x-4 mt-2 text-xs',
            isDark ? 'text-gray-400' : 'text-gray-500'
          )}>
            <span>{order.customerName}</span>
            <span>{order.phone}</span>
            <span>{order.amount} грн</span>
            {order.plannedTime && (
              <span className={clsx(
                'font-medium',
                isDark ? 'text-blue-400' : 'text-blue-600'
              )}>
                {order.plannedTime}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

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
  const [visibleOrdersCount, setVisibleOrdersCount] = useState(20) // Начальное количество видимых заказов
  const [orderSearchTerm, setOrderSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [timeFilter, setTimeFilter] = useState<string>('all') // all, morning, afternoon, evening
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [routeToDelete, setRouteToDelete] = useState<Route | null>(null)
  // const placeIdCacheRef = useRef<Map<string, string>>(new Map()) // Не используется
  // const geocodeCacheRef = useRef<Map<string, { placeId: string; formattedAddress: string }>>(new Map()) // Не используется
  // const regionBiasRef = useRef<{ country?: string; locality?: string; bounds?: google.maps.LatLngBounds | null }>({}) // Не используется

  // Дебаунсинг для поиска
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(orderSearchTerm)
    }, 300)
    return () => clearTimeout(timer)
  }, [orderSearchTerm])

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
    const initGoogleMaps = async () => {
      try {
        // Проверяем, есть ли API ключ в настройках
        if (!localStorageUtils.hasApiKey()) {
          console.warn('Google Maps API ключ не найден в настройках')
          setGoogleMapsReady(false)
          return
        }

        await googleMapsLoader.load()
        setGoogleMapsReady(true)
      } catch (error) {
        console.error('Ошибка загрузки Google Maps API:', error)
        setGoogleMapsReady(false)
      }
    }

    initGoogleMaps()
  }, [])

  // Сохраняем маршруты в localStorage
  useEffect(() => {
    try {
      localStorage.setItem('km_routes', JSON.stringify(routes))
    } catch (error) {
      console.warn('Ошибка сохранения маршрутов в localStorage:', error)
    }
  }, [routes])

  // Обновляем данные о маршрутах в контексте (только при создании новых маршрутов)
  const prevRoutesRef = useRef(routes)
  useEffect(() => {
    // Проверяем, действительно ли изменились маршруты
    if (routes.length !== prevRoutesRef.current.length || 
        JSON.stringify(routes) !== JSON.stringify(prevRoutesRef.current)) {
      if (routes.length > 0) {
        updateRouteData(routes)
      }
      prevRoutesRef.current = routes
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
          id: order.id || `order_${order.orderNumber || Math.random()}`,
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

  const handleCourierSelect = useCallback((courierName: string) => {
    setSelectedCourier(courierName)
    // При смене курьера сбрасываем выбор и порядок, чтобы избежать артефактов
    setSelectedOrders(new Set())
    setSelectedOrdersOrder([])
  }, [])

  // Функция для фильтрации заказов по времени
  const filterOrdersByTime = useCallback((orders: Order[]) => {
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
  }, [timeFilter])

  // Функция для поиска заказов по номеру
  const searchOrders = useCallback((orders: Order[]) => {
    if (!debouncedSearchTerm.trim()) return orders
    
    const searchTerm = debouncedSearchTerm.toLowerCase().trim()
    return orders.filter(order => 
      order.orderNumber.toLowerCase().includes(searchTerm) ||
      order.customerName.toLowerCase().includes(searchTerm) ||
      order.address.toLowerCase().includes(searchTerm)
    )
  }, [debouncedSearchTerm])

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

  const handleOrderSelect = useCallback((orderId: string) => {
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
        setSelectedOrdersOrder(prevOrder => {
          const next = [...prevOrder, orderId]
          // Дедупликация с сохранением первого вхождения
          const seen = new Set<string>()
          return next.filter(id => (seen.has(id) ? false : (seen.add(id), true)))
        })
      }
      return newSet
    })
  }, [selectedCourier, isOrderInExistingRoute])

  // Функции для изменения порядка выбранных заказов
  const moveOrderUp = useCallback((orderId: string) => {
    const currentIndex = selectedOrdersOrder.indexOf(orderId)
    if (currentIndex > 0) {
      const newOrder = [...selectedOrdersOrder]
      ;[newOrder[currentIndex - 1], newOrder[currentIndex]] = [newOrder[currentIndex], newOrder[currentIndex - 1]]
      // На всякий случай устраняем дубликаты
      const seen = new Set<string>()
      setSelectedOrdersOrder(newOrder.filter(id => (seen.has(id) ? false : (seen.add(id), true))) )
    }
  }, [selectedOrdersOrder])

  const moveOrderDown = useCallback((orderId: string) => {
    const currentIndex = selectedOrdersOrder.indexOf(orderId)
    if (currentIndex < selectedOrdersOrder.length - 1) {
      const newOrder = [...selectedOrdersOrder]
      ;[newOrder[currentIndex], newOrder[currentIndex + 1]] = [newOrder[currentIndex + 1], newOrder[currentIndex]]
      const seen = new Set<string>()
      setSelectedOrdersOrder(newOrder.filter(id => (seen.has(id) ? false : (seen.add(id), true))) )
    }
  }, [selectedOrdersOrder])

  // Функция для загрузки большего количества заказов
  const loadMoreOrders = useCallback(() => {
    setVisibleOrdersCount(prev => prev + 20)
  }, [])

  const createRoute = async () => {
    if (!selectedCourier) return

    // Создаем список заказов в порядке их выбора
    // Формируем уникальный список выбранных заказов в текущем порядке
    const seen = new Set<string>()
    const uniqueOrderIds = selectedOrdersOrder.filter(id => (seen.has(id) ? false : (seen.add(id), true)))
    const selectedOrdersList = uniqueOrderIds
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

    // Проверяем готовность Google Maps API
    if (!googleMapsReady) {
      // Проверяем, есть ли API ключ в настройках
      if (!localStorageUtils.hasApiKey()) {
        alert('Google Maps API ключ не найден в настройках. Пожалуйста, добавьте ключ в настройках.')
        return
      }
      
      try {
        await googleMapsLoader.load()
        setGoogleMapsReady(true)
      } catch (error) {
        alert('Ошибка загрузки Google Maps API. Проверьте настройки API ключа.')
        return
      }
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

  // Простая очистка адреса без сложного геокодирования
  const cleanAddressForRoute = useCallback((raw: string): string => {
    return cleanAddress(raw).trim()
  }, [])


  const calculateRouteDistance = async (route: Route) => {
    if (!googleMapsReady) {
      // Проверяем, есть ли API ключ в настройках
      if (!localStorageUtils.hasApiKey()) {
        alert('Google Maps API ключ не найден в настройках. Пожалуйста, добавьте ключ в настройках.')
        return
      }
      
      // Пытаемся загрузить Google Maps API если он не готов
      try {
        await googleMapsLoader.load()
        setGoogleMapsReady(true)
      } catch (error) {
        alert('Ошибка загрузки Google Maps API. Проверьте настройки API ключа.')
        return
      }
    }

    setIsCalculating(true)

    try {
      const directionsService = new window.google.maps.DirectionsService()

      // Используем прямые адреса без геокодирования
      const waypoints = route.orders.map(order => ({
        location: cleanAddressForRoute(order.address),
        stopover: true
      }))

      const request = {
        origin: cleanAddressForRoute(route.startAddress),
        destination: cleanAddressForRoute(route.endAddress),
        waypoints: waypoints,
        travelMode: window.google.maps.TravelMode.DRIVING,
        // Важно: сохраняем порядок точек как в UI, ничего не оптимизируем
        optimizeWaypoints: false,
        unitSystem: window.google.maps.UnitSystem.METRIC,
        // Дополнительные параметры для точности
        avoidHighways: false,
        avoidTolls: false,
        avoidFerries: false,
        // Используем текущее время для учета пробок
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: window.google.maps.TrafficModel.BEST_GUESS
        }
      }

      directionsService.route(request, (result: any, status: any) => {
        if (status === window.google.maps.DirectionsStatus.OK && result) {
          // Используем точное расстояние из Google Maps API
          const totalDistance = result.routes[0].legs.reduce((total: number, leg: any) => total + leg.distance.value, 0)
          const totalDuration = result.routes[0].legs.reduce((total: number, leg: any) => total + leg.duration.value, 0)

          // Конвертируем в километры с высокой точностью
          const distanceKm = totalDistance / 1000
          
          // Проверяем, что маршрут не превышает 100км (возможная ошибка в адресе)
          if (distanceKm > 100) {
            console.warn(`Маршрут превышает 100км (${distanceKm.toFixed(1)}км). Возможна ошибка в адресе.`)
            alert(`Внимание: Маршрут превышает 100км (${distanceKm.toFixed(1)}км). Проверьте корректность адресов.`)
          }

          // Логируем для отладки и сравнения с Google Maps UI
          console.log('Google Maps API Distance Calculation:', {
            totalDistanceMeters: totalDistance,
            distanceKm: distanceKm,
            distanceKmRounded: Math.round(distanceKm * 10) / 10, // Округление как в Google Maps UI
            legs: result.routes[0].legs.map((leg: any, index: number) => ({
              legIndex: index,
              distance: leg.distance,
              duration: leg.duration,
              startAddress: leg.start_address,
              endAddress: leg.end_address
            })),
            routeSummary: result.routes[0].summary,
            warnings: result.routes[0].warnings || []
          })

          setRoutes(prev => prev.map(r => 
            r.id === route.id 
              ? { 
                  ...r, 
                  totalDistance: distanceKm, // Сохраняем точное значение без округления
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
    const route = routes.find(r => r.id === routeId)
    if (route) {
      setRouteToDelete(route)
      setShowDeleteModal(true)
    }
  }

  const confirmDeleteRoute = () => {
    if (routeToDelete) {
      setRoutes(prev => prev.filter(route => route.id !== routeToDelete.id))
      setShowDeleteModal(false)
      setRouteToDelete(null)
    }
  }

  const cancelDeleteRoute = () => {
    setShowDeleteModal(false)
    setRouteToDelete(null)
  }

  const clearAllRoutes = () => {
    console.log('Clear all routes clicked, current routes count:', routes.length)
    if (window.confirm('Вы уверены, что хотите удалить все маршруты?')) {
      console.log('User confirmed, clearing all routes')
      setRoutes([])
      // Также очищаем из localStorage
      try {
        localStorage.removeItem('km_routes')
        console.log('Routes cleared from localStorage')
      } catch (error) {
        console.error('Error clearing routes from localStorage:', error)
      }
    }
  }

  const openRouteInGoogleMaps = async (route: Route) => {
    if (route.orders.length === 0) {
      alert('Нет точек для маршрута')
      return
    }

    try {
      // Используем прямые адреса без геокодирования
      const base = 'https://www.google.com/maps/dir/?api=1'
      const origin = `origin=${encodeURIComponent(cleanAddressForRoute(route.startAddress))}`
      const destination = `destination=${encodeURIComponent(cleanAddressForRoute(route.endAddress))}`
      const waypointAddresses = route.orders.map(order => cleanAddressForRoute(order.address))
      const waypoints = waypointAddresses.length > 0
        ? `waypoints=${encodeURIComponent(waypointAddresses.join('|'))}`
        : ''
      const travelmode = 'travelmode=driving'

      const parts = [origin, destination, travelmode]
      if (waypoints) parts.push(waypoints)
      const url = `${base}&${parts.join('&')}`
      window.open(url, '_blank')
    } catch (err) {
      console.error('Ошибка открытия маршрута в Google Maps:', err)
      alert('Не удалось открыть маршрут в Google Maps')
    }
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = Math.floor(minutes % 60)
    return hours > 0 ? `${hours}ч ${mins}мин` : `${mins}мин`
  }

  // Форматирование расстояния как в Google Maps
  const formatDistance = (distanceKm: number) => {
    // Округляем до 1 знака после запятой, как в Google Maps UI
    const rounded = Math.round(distanceKm * 10) / 10
    return rounded.toFixed(1).replace('.', ',')
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

      {/* Верхняя часть: Курьеры и заказы */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Курьеры */}
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
                  className={clsx(
                    'px-3 py-1 text-xs rounded-full transition-colors',
                    courierFilter === 'all'
                      ? isDark 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-blue-100 text-blue-800'
                      : isDark 
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  Все
                </button>
                <button
                  onClick={() => setCourierFilter('car')}
                  className={clsx(
                    'px-3 py-1 text-xs rounded-full flex items-center space-x-1 transition-colors',
                    courierFilter === 'car'
                      ? isDark 
                        ? 'bg-green-600 text-white' 
                        : 'bg-green-100 text-green-800'
                      : isDark 
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  <TruckIcon className="h-3 w-3" />
                  <span>Авто</span>
                </button>
                <button
                  onClick={() => setCourierFilter('motorcycle')}
                  className={clsx(
                    'px-3 py-1 text-xs rounded-full flex items-center space-x-1 transition-colors',
                    courierFilter === 'motorcycle'
                      ? isDark 
                        ? 'bg-orange-600 text-white' 
                        : 'bg-orange-100 text-orange-800'
                      : isDark 
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  <TruckIcon className="h-3 w-3" />
                  <span>Мото</span>
                </button>
              </div>
            </div>
            
            {paginatedCouriers.length === 0 ? (
              <div className="text-center py-8">
                <TruckIcon className={clsx(
                  'mx-auto h-12 w-12',
                  isDark ? 'text-gray-500' : 'text-gray-400'
                )} />
                <p className={clsx(
                  'mt-2 text-sm',
                  isDark ? 'text-gray-400' : 'text-gray-500'
                )}>
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
                      className={clsx(
                        'w-full text-left p-3 rounded-lg border transition-all duration-200 ease-in-out transform hover:scale-[1.02]',
                        selectedCourier === courierName
                          ? isDark 
                            ? 'bg-blue-600/20 border-blue-500 text-blue-100 shadow-md' 
                            : 'bg-blue-50 border-blue-200 text-blue-900 shadow-md'
                          : isDark 
                            ? 'bg-gray-700 border-gray-600 hover:bg-gray-600 hover:shadow-sm text-gray-200' 
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100 hover:shadow-sm text-gray-900'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <TruckIcon className={clsx(
                            'h-5 w-5',
                            vehicleType === 'car' 
                              ? isDark ? 'text-green-400' : 'text-green-600' 
                              : isDark ? 'text-orange-400' : 'text-orange-600'
                          )} />
                          <span className="font-medium">{courierName}</span>
                          <span className={clsx(
                            'text-xs px-2 py-1 rounded-full',
                            vehicleType === 'car' 
                              ? isDark 
                                ? 'bg-green-600/20 text-green-300' 
                                : 'bg-green-100 text-green-800'
                              : isDark 
                                ? 'bg-orange-600/20 text-orange-300' 
                                : 'bg-orange-100 text-orange-800'
                          )}>
                            {vehicleType === 'car' ? 'Авто' : 'Мото'}
                          </span>
                        </div>
                        <span className={clsx(
                          'text-sm',
                          isDark ? 'text-gray-400' : 'text-gray-500'
                        )}>
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
                  className={clsx(
                    'px-3 py-1 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                    isDark 
                      ? 'text-gray-300 hover:text-white disabled:text-gray-500' 
                      : 'text-gray-600 hover:text-gray-800 disabled:text-gray-400'
                  )}
                >
                  ← Назад
                </button>
                <span className={clsx(
                  'text-sm',
                  isDark ? 'text-gray-400' : 'text-gray-500'
                )}>
                  Страница {courierPage + 1} из {totalCourierPages}
                </span>
                <button
                  onClick={() => setCourierPage(Math.min(totalCourierPages - 1, courierPage + 1))}
                  disabled={courierPage >= totalCourierPages - 1}
                  className={clsx(
                    'px-3 py-1 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                    isDark 
                      ? 'text-gray-300 hover:text-white disabled:text-gray-500' 
                      : 'text-gray-600 hover:text-gray-800 disabled:text-gray-400'
                  )}
                >
                  Вперед →
                </button>
              </div>
            )}
          </div>

        </div>

        {/* Заказы выбранного курьера */}
        <div className="space-y-4">
          {selectedCourier && (
            <div className={clsx(
              'rounded-lg shadow-sm border p-6',
              isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            )}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={clsx(
                  'text-lg font-semibold',
                  isDark ? 'text-gray-100' : 'text-gray-900'
                )}>
                  Заказы: {selectedCourier}
                </h3>
                <button
                  onClick={createRoute}
                  disabled={selectedOrders.size === 0 || isRouteDuplicate(selectedCourier, selectedOrders) || !googleMapsReady}
                  className={clsx(
                    'flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors',
                    selectedOrders.size === 0 || isRouteDuplicate(selectedCourier, selectedOrders) || !googleMapsReady
                      ? isDark 
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : isDark 
                        ? 'bg-blue-600 text-white hover:bg-blue-700' 
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                  )}
                >
                  <PlusIcon className="h-4 w-4" />
                  <span>
                    {!googleMapsReady
                      ? 'Google Maps API не настроен'
                      : isRouteDuplicate(selectedCourier, selectedOrders) 
                        ? 'Маршрут уже существует' 
                        : `Создать маршрут (${selectedOrders.size})`
                    }
                  </span>
                  {selectedOrders.size > 0 && !isRouteDuplicate(selectedCourier, selectedOrders) && googleMapsReady && (
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
                  <label className={clsx(
                    'block text-sm font-medium mb-1',
                    isDark ? 'text-gray-300' : 'text-gray-700'
                  )}>
                    Поиск заказа
                  </label>
                  <input
                    type="text"
                    placeholder="Номер заказа, имя клиента или адрес..."
                    value={orderSearchTerm}
                    onChange={(e) => setOrderSearchTerm(e.target.value)}
                    className={clsx(
                      'w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors',
                      isDark 
                        ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    )}
                  />
                </div>

                {/* Фильтр по времени */}
                <div>
                  <label className={clsx(
                    'block text-sm font-medium mb-1',
                    isDark ? 'text-gray-300' : 'text-gray-700'
                  )}>
                    Время доставки
                  </label>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setTimeFilter('all')}
                      className={clsx(
                        'px-3 py-1 text-xs rounded-full transition-colors',
                        timeFilter === 'all'
                          ? isDark 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-blue-100 text-blue-800'
                          : isDark 
                            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      )}
                    >
                      Все
                    </button>
                    <button
                      onClick={() => setTimeFilter('morning')}
                      className={clsx(
                        'px-3 py-1 text-xs rounded-full transition-colors',
                        timeFilter === 'morning'
                          ? isDark 
                            ? 'bg-yellow-600 text-white' 
                            : 'bg-yellow-100 text-yellow-800'
                          : isDark 
                            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      )}
                    >
                      Утро (6-12)
                    </button>
                    <button
                      onClick={() => setTimeFilter('afternoon')}
                      className={clsx(
                        'px-3 py-1 text-xs rounded-full transition-colors',
                        timeFilter === 'afternoon'
                          ? isDark 
                            ? 'bg-orange-600 text-white' 
                            : 'bg-orange-100 text-orange-800'
                          : isDark 
                            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      )}
                    >
                      День (12-18)
                    </button>
                    <button
                      onClick={() => setTimeFilter('evening')}
                      className={clsx(
                        'px-3 py-1 text-xs rounded-full transition-colors',
                        timeFilter === 'evening'
                          ? isDark 
                            ? 'bg-purple-600 text-white' 
                            : 'bg-purple-100 text-purple-800'
                          : isDark 
                            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      )}
                    >
                      Вечер (18+)
                    </button>
                  </div>
                </div>
              </div>

              <div className={clsx(
                'max-h-96 overflow-y-auto scrollbar-thin',
                isDark 
                  ? 'scrollbar-thumb-gray-600 scrollbar-track-gray-800' 
                  : 'scrollbar-thumb-gray-300 scrollbar-track-gray-100'
              )}>
                {(() => {
    let allOrders = sortOrdersByTime(
      searchOrders(
        filterOrdersByTime(courierOrders[selectedCourier] || [])
      )
    )
    // Дедупликация на случай дублей данных из источника
    const seenOrders = new Set<string>()
    allOrders = allOrders.filter(o => (seenOrders.has(o.id) ? false : (seenOrders.add(o.id), true)))
                  const availableOrders = allOrders.filter(order => !isOrderInExistingRoute(order.id))
                  const ordersInRoutes = allOrders.filter(order => isOrderInExistingRoute(order.id))
                  
                  return (
                    <div className="space-y-4">
                      {/* Доступные заказы */}
                      {availableOrders.length > 0 && (
                        <div>
                          <div className="flex items-center space-x-2 mb-2">
                            <CheckCircleIcon className={clsx(
                              'h-4 w-4',
                              isDark ? 'text-green-400' : 'text-green-600'
                            )} />
                            <span className={clsx(
                              'text-sm font-medium',
                              isDark ? 'text-green-300' : 'text-green-800'
                            )}>
                              Доступные заказы ({availableOrders.length})
                            </span>
                          </div>
                          <div className="space-y-2">
                            {availableOrders.slice(0, visibleOrdersCount).map(order => {
                              const isSelected = selectedOrders.has(order.id)
                              const selectionOrder = selectedOrdersOrder.indexOf(order.id) + 1
                              return (
                                <OrderItem
                                  key={order.id}
                                  order={order}
                                  isSelected={isSelected}
                                  selectionOrder={selectionOrder}
                                  onSelect={handleOrderSelect}
                                  onMoveUp={moveOrderUp}
                                  onMoveDown={moveOrderDown}
                                  isInRoute={false}
                                  isDark={isDark}
                                />
                              )
                            })}
                            {availableOrders.length > visibleOrdersCount && (
                              <div className="text-center py-4">
                                <button
                                  onClick={loadMoreOrders}
                                  className={clsx(
                                    'px-4 py-2 rounded-lg transition-colors duration-200',
                                    isDark 
                                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                  )}
                                >
                                  Показать еще {Math.min(20, availableOrders.length - visibleOrdersCount)} заказов
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Заказы в маршрутах */}
                      {ordersInRoutes.length > 0 && (
                        <div>
                          <div className="flex items-center space-x-2 mb-2">
                            <ClockIcon className={clsx(
                              'h-4 w-4',
                              isDark ? 'text-yellow-400' : 'text-yellow-600'
                            )} />
                            <span className={clsx(
                              'text-sm font-medium',
                              isDark ? 'text-yellow-300' : 'text-yellow-800'
                            )}>
                              Заказы в маршрутах ({ordersInRoutes.length})
                            </span>
                          </div>
                          <div className="space-y-2">
                            {ordersInRoutes.map(order => (
                              <OrderItem
                                key={order.id}
                                order={order}
                                isSelected={false}
                                selectionOrder={0}
                                onSelect={() => {}}
                                onMoveUp={() => {}}
                                onMoveDown={() => {}}
                                isInRoute={true}
                                isDark={isDark}
                              />
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

      {/* Нижняя часть: Созданные маршруты */}
      <div className="mt-6">
        <div className={clsx(
          'rounded-lg shadow-sm border p-6',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={clsx(
              'text-lg font-semibold',
              isDark ? 'text-gray-100' : 'text-gray-900'
            )}>Созданные маршруты</h2>
            {routes.length > 0 && (
              <button
                onClick={clearAllRoutes}
                className={clsx(
                  'text-sm font-medium transition-colors',
                  isDark 
                    ? 'text-red-400 hover:text-red-300' 
                    : 'text-red-600 hover:text-red-800'
                )}
              >
                Очистить все
              </button>
            )}
          </div>
            
          {routes.length === 0 ? (
            <div className="text-center py-8">
              <MapIcon className={clsx(
                'mx-auto h-12 w-12',
                isDark ? 'text-gray-500' : 'text-gray-400'
              )} />
              <p className={clsx(
                'mt-2 text-sm',
                isDark ? 'text-gray-400' : 'text-gray-500'
              )}>Создайте маршруты для курьеров</p>
            </div>
          ) : (
            <div className="space-y-4">
                {paginatedRoutes.map(route => (
                  <div key={route.id} className={clsx(
                    'border rounded-lg p-4 transition-all duration-200 ease-in-out hover:shadow-md hover:scale-[1.01]',
                    isDark ? 'border-gray-600 bg-gray-700' : 'border-gray-200 bg-white'
                  )}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <TruckIcon className={clsx(
                        'h-5 w-5',
                        getCourierVehicleType(route.courier) === 'car' 
                          ? isDark ? 'text-green-400' : 'text-green-600' 
                          : isDark ? 'text-orange-400' : 'text-orange-600'
                      )} />
                      <div>
                        <h3 className={clsx(
                          'font-medium',
                          isDark ? 'text-gray-100' : 'text-gray-900'
                        )}>{route.courier}</h3>
                        <p className={clsx(
                          'text-sm',
                          isDark ? 'text-gray-400' : 'text-gray-500'
                        )}>
                          {route.orders.length} заказов
                        </p>
                      </div>
                      <span className={clsx(
                        'text-xs px-2 py-1 rounded-full',
                        getCourierVehicleType(route.courier) === 'car' 
                          ? isDark 
                            ? 'bg-green-600/20 text-green-300' 
                            : 'bg-green-100 text-green-800'
                          : isDark 
                            ? 'bg-orange-600/20 text-orange-300' 
                            : 'bg-orange-100 text-orange-800'
                      )}>
                        {getCourierVehicleType(route.courier) === 'car' ? 'Авто' : 'Мото'}
                      </span>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => route.isOptimized ? openRouteInGoogleMaps(route) : calculateRouteDistance(route)}
                        disabled={isCalculating}
                        className={clsx(
                          'p-1 transition-colors disabled:opacity-50',
                          isDark 
                            ? 'text-gray-400 hover:text-blue-400' 
                            : 'text-gray-400 hover:text-blue-600'
                        )}
                        title={route.isOptimized ? "Открыть маршрут в Google Maps" : "Рассчитать расстояние"}
                      >
                        <MapIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteRoute(route.id)}
                        className={clsx(
                          'p-2 rounded-lg transition-all duration-200 ease-in-out transform hover:scale-110',
                          isDark 
                            ? 'text-gray-400 hover:text-red-400 hover:bg-red-900/20' 
                            : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                        )}
                        title="Удалить маршрут"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {route.orders.map((order, index) => (
                      <div key={order.id} className="flex items-center space-x-2 text-sm">
                        <span className={clsx(
                          'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium',
                          isDark 
                            ? 'bg-blue-600/20 text-blue-300' 
                            : 'bg-blue-100 text-blue-800'
                        )}>
                          {index + 1}
                        </span>
                        <span className={clsx(
                          isDark ? 'text-gray-300' : 'text-gray-600'
                        )}>#{order.orderNumber}</span>
                        <span className={clsx(
                          'truncate',
                          isDark ? 'text-gray-400' : 'text-gray-500'
                        )}>{order.address}</span>
                      </div>
                    ))}
                  </div>

                  <div className={clsx(
                    'mt-3 pt-3 border-t',
                    isDark ? 'border-gray-600' : 'border-gray-200'
                  )}>
                    {route.isOptimized ? (
                      <>
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center space-x-1">
                            <MapPinIcon className={clsx(
                              'h-4 w-4',
                              isDark ? 'text-gray-500' : 'text-gray-400'
                            )} />
                            <span className={clsx(
                              isDark ? 'text-gray-300' : 'text-gray-600'
                            )}>Расстояние</span>
                          </div>
                          <span className={clsx(
                            'font-medium',
                            isDark ? 'text-gray-100' : 'text-gray-900'
                          )}>
                            {formatDistance(route.totalDistance)} км
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm mt-1">
                          <div className="flex items-center space-x-1">
                            <ClockIcon className={clsx(
                              'h-4 w-4',
                              isDark ? 'text-gray-500' : 'text-gray-400'
                            )} />
                            <span className={clsx(
                              isDark ? 'text-gray-300' : 'text-gray-600'
                            )}>Время</span>
                          </div>
                          <span className={clsx(
                            'font-medium',
                            isDark ? 'text-gray-100' : 'text-gray-900'
                          )}>
                            {formatDuration(route.totalDuration)}
                          </span>
                        </div>
                        <div className={clsx(
                          'text-xs mt-1',
                          isDark ? 'text-green-400' : 'text-green-600'
                        )}>
                          ✓ Маршрут создан
                        </div>
                      </>
                    ) : (
                      <div className={clsx(
                        'text-sm',
                        isDark ? 'text-gray-400' : 'text-gray-500'
                      )}>
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
                className={clsx(
                  'px-3 py-1 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                  isDark 
                    ? 'text-gray-300 hover:text-white disabled:text-gray-500' 
                    : 'text-gray-600 hover:text-gray-800 disabled:text-gray-400'
                )}
              >
                ← Назад
              </button>
              <span className={clsx(
                'text-sm',
                isDark ? 'text-gray-400' : 'text-gray-500'
              )}>
                Страница {routePage + 1} из {totalRoutePages}
              </span>
              <button
                onClick={() => setRoutePage(Math.min(totalRoutePages - 1, routePage + 1))}
                disabled={routePage >= totalRoutePages - 1}
                className={clsx(
                  'px-3 py-1 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                  isDark 
                    ? 'text-gray-300 hover:text-white disabled:text-gray-500' 
                    : 'text-gray-600 hover:text-gray-800 disabled:text-gray-400'
                )}
              >
                Вперед →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Модальное окно подтверждения удаления маршрута */}
      {showDeleteModal && routeToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center space-x-3 mb-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <TrashIcon className="w-6 h-6 text-red-600" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  Удалить маршрут
                </h3>
                <p className="text-sm text-gray-500">
                  Это действие нельзя отменить
                </p>
              </div>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-700 mb-2">
                Вы уверены, что хотите удалить маршрут для курьера <strong>{routeToDelete.courier}</strong>?
              </p>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">
                  <strong>Заказов в маршруте:</strong> {routeToDelete.orders.length}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Расстояние:</strong> {routeToDelete.isOptimized ? `${routeToDelete.totalDistance.toFixed(1)} км` : 'Не рассчитано'}
                </p>
                {routeToDelete.orders.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">Заказы:</p>
                    <div className="flex flex-wrap gap-1">
                      {routeToDelete.orders.slice(0, 3).map((order) => (
                        <span key={order.id} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          #{order.orderNumber}
                        </span>
                      ))}
                      {routeToDelete.orders.length > 3 && (
                        <span className="text-xs text-gray-500">
                          +{routeToDelete.orders.length - 3} еще
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={cancelDeleteRoute}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={confirmDeleteRoute}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
