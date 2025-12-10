import React, { useState, useEffect, useMemo, useCallback, memo, useRef, useLayoutEffect } from 'react'
import { VariableSizeList as List, areEqual } from 'react-window'
import { 
  MapIcon, 
  TruckIcon, 
  PlusIcon,
  TrashIcon,
  ClockIcon,
  MapPinIcon,
  CheckCircleIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  PencilIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  QuestionMarkCircleIcon
} from '@heroicons/react/24/outline'
import { localStorageUtils } from '../utils/localStorage'
import { googleMapsLoader } from '../utils/googleMapsLoader'
import { useExcelData } from '../contexts/ExcelDataContext'
import { useTheme } from '../contexts/ThemeContext'
import { clsx } from 'clsx'
import { AddressEditModal } from './AddressEditModal'
import { AddressValidationService, RouteAnomalyCheck } from '../services/addressValidation'
import { getPaymentMethodBadgeProps } from '../utils/paymentMethodHelper'
import { Tooltip } from './Tooltip'
import { googleApiCache } from '../services/googleApiCache'
import { lazy, Suspense } from 'react'
import type { TourStep } from './HelpTour'

// Ленивая загрузка тяжелых компонентов
const HelpModalRoutes = lazy(() => import('./HelpModalRoutes').then(m => ({ default: m.HelpModalRoutes })))
const HelpTour = lazy(() => import('./HelpTour').then(m => ({ default: m.HelpTour })))

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
  paymentMethod?: string // Добавляем поле для способа оплаты
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
  geoMeta?: any // геокод-мета для визуальной верификации
  createdAt?: number
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
            'flex items-center flex-wrap gap-2 mt-2 text-xs',
            isDark ? 'text-gray-400' : 'text-gray-500'
          )}>
            {order.customerName && <span>{order.customerName}</span>}
            {/* телефон скрыт */}
            {typeof order.amount === 'number' && <span>{order.amount} грн</span>}
            {order.paymentMethod && (() => {
              const badgeProps = getPaymentMethodBadgeProps(order.paymentMethod, isDark)
              return (
                <span className={clsx('px-2 py-0.5 rounded-full', badgeProps.bgColorClass, badgeProps.textColorClass)}>
                  {badgeProps.text}
                </span>
              )
            })()}
            {order.plannedTime && (
              <span className={clsx(
                'px-2 py-0.5 rounded-full',
                isDark ? 'bg-purple-600/20 text-purple-300' : 'bg-purple-50 text-purple-700'
              )}>{order.plannedTime}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}, areEqual)

export const RouteManagement: React.FC<RouteManagementProps> = () => {
  const { excelData, updateExcelData } = useExcelData()
  const { isDark } = useTheme()
  const [selectedCourier, setSelectedCourier] = useState<string | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)
  const [startAddress, setStartAddress] = useState('')
  const [endAddress, setEndAddress] = useState('')
  const [googleMapsReady, setGoogleMapsReady] = useState(false)
  const [courierFilter, setCourierFilter] = useState<string>('all')
  const [courierPage, setCourierPage] = useState(0)
  const [routePage, setRoutePage] = useState(0)
  const [routesPerPage] = useState(5) // Количество маршрутов на странице
  const [sortRoutesByNewest] = useState(true)
  const [visibleOrdersCount] = useState(2000) // Лимит для виртуализации
  const [orderSearchTerm, setOrderSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [routeToDelete, setRouteToDelete] = useState<Route | null>(null)
  const [showAddressEditModal, setShowAddressEditModal] = useState(false)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [routeAnomalies, setRouteAnomalies] = useState<Map<string, RouteAnomalyCheck>>(new Map())
  // Disambiguation modal state for choosing among multiple in-sector candidates
  const [disambModal, setDisambModal] = useState<{ open: boolean; title: string; options: Array<{label: string; distanceMeters?: number; res: any}> } | null>(null)
  const disambResolver = useRef<(choice: any | null) => void>()

  // Состояния для системы помощи
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [showHelpTour, setShowHelpTour] = useState(false)
  const [hasSeenHelp, setHasSeenHelp] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('km_routes_has_seen_help') === 'true'
    }
    return false
  })

  // Показываем помощь новым пользователям через 2 секунды после загрузки
  useEffect(() => {
    if (!hasSeenHelp && typeof window !== 'undefined') {
      const timer = setTimeout(() => {
        setShowHelpModal(true)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [hasSeenHelp])

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

  // (удалено) Прежний эффект мог вызывать лишние обновления и ошибки типов

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
          paymentMethod: order.paymentMethod || '', // Добавляем способ оплаты
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
  ;(excelData?.routes || []).forEach((route: Route) => {
    if (route.courier === courierName) {
      route.orders.forEach((order: Order) => {
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
    const settings = localStorageUtils.getAllSettings()
    if (settings.courierVehicleMap && settings.courierVehicleMap[courierName]) {
      return settings.courierVehicleMap[courierName]
    }
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

  // Сортировка и пагинация маршрутов
  const allRoutes = (excelData?.routes || []) as Route[]
  const sortedRoutes = sortRoutesByNewest
    ? [...allRoutes].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    : allRoutes
  const totalRoutePages = Math.ceil((sortedRoutes.length ?? 0) / routesPerPage || 0)
  const paginatedRoutes = sortedRoutes.slice(
    routePage * routesPerPage,
    (routePage + 1) * routesPerPage
  )

  const handleCourierSelect = useCallback((courierName: string) => {
    setSelectedCourier(courierName)
    // При смене курьера сбрасываем выбор и порядок, чтобы избежать артефактов
    setSelectedOrders(new Set())
    setSelectedOrdersOrder([])
  }, [])


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
    return excelData?.routes?.some((route: Route) => {
      if (route.courier !== courierName) return false
      
      const routeOrderIds = new Set(route.orders.map((order: Order) => order.id))
      if (routeOrderIds.size !== selectedOrderIds.size) return false
      
      for (const id of selectedOrderIds) {
        if (!routeOrderIds.has(id)) return false
      }
      
      return true
    }) || false
  }

  // Проверяем, включен ли заказ в существующий маршрут
  const isOrderInExistingRoute = (orderId: string) => {
    return excelData?.routes?.some((route: Route) => 
      route.orders.some((order: Order) => order.id === orderId)
    ) || false
  }

  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [selectedOrdersOrder, setSelectedOrdersOrder] = useState<string[]>([])

  // --- Виртуализация с динамической высотой ---
  const availableListRef = useRef<List>(null as any)
  const inRouteListRef = useRef<List>(null as any)
  const availableSizeMap = useRef<Record<number, number>>({})
  const inRouteSizeMap = useRef<Record<number, number>>({})
  const ROW_GAP = 8 // расстояние между элементами

  const setAvailableSize = useCallback((index: number, size: number) => {
    const next = size + ROW_GAP
    if (availableSizeMap.current[index] !== next) {
      availableSizeMap.current[index] = next
      availableListRef.current?.resetAfterIndex(index)
    }
  }, [])

  const getAvailableSize = useCallback((index: number) => {
    return availableSizeMap.current[index] || 110
  }, [])

  const setInRouteSize = useCallback((index: number, size: number) => {
    const next = size + ROW_GAP
    if (inRouteSizeMap.current[index] !== next) {
      inRouteSizeMap.current[index] = next
      inRouteListRef.current?.resetAfterIndex(index)
    }
  }, [])

  const getInRouteSize = useCallback((index: number) => {
    return inRouteSizeMap.current[index] || 96
  }, [])

  const MeasuredRow: React.FC<{
    index: number
    style: React.CSSProperties
    order: Order
    isSelected: boolean
    selectionOrder: number
    isInRoute: boolean
    onSelect: (id: string) => void
    onMoveUp: (id: string) => void
    onMoveDown: (id: string) => void
    setSize: (index: number, size: number) => void
  }> = ({ index, style, order, isSelected, selectionOrder, isInRoute, onSelect, onMoveUp, onMoveDown, setSize }) => {
    const rowRef = useRef<HTMLDivElement>(null)

    useLayoutEffect(() => {
      if (!rowRef.current) return
      const el = rowRef.current
      const measure = () => setSize(index, el.getBoundingClientRect().height)
      measure()
      const ro = new ResizeObserver(measure)
      ro.observe(el)
      return () => ro.disconnect()
    }, [index, setSize])

    return (
      <div style={style}>
        <div ref={rowRef} className="mb-2">
          <OrderItem
            key={order.id}
            order={order}
            isSelected={isSelected}
            selectionOrder={selectionOrder}
            onSelect={onSelect}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            isInRoute={isInRoute}
            isDark={isDark}
          />
        </div>
      </div>
    )
  }

  const handleOrderSelect = useCallback((orderId: string) => {
    if (!selectedCourier) return

    // Проверяем, что заказ не находится уже в маршруте
    if (isOrderInExistingRoute(orderId)) {
      return // Не позволяем выбирать заказы, которые уже в маршрутах
    }

    // Если выбирали через поиск — очищаем строку
    if (orderSearchTerm) setOrderSearchTerm('')

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
  }, [selectedCourier, isOrderInExistingRoute, orderSearchTerm])

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

  // При виртуализации ручная подгрузка не требуется; функция удалена

  const createRoute = async () => {
    if (!selectedCourier) return

    // Требуем выбранный город в настройках
    {
      const settings = localStorageUtils.getAllSettings()
      const cityBias = settings.cityBias || ''
      if (!cityBias) {
        alert('Выберите город во вкладке Настройки (Город для маршрутов). Без выбранного города создание маршрута запрещено.')
        return
      }
    }

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
      isOptimized: false,
      createdAt: Date.now()
    }

    // Добавляем новый маршрут в список маршрутов (функциональный апдейт во избежание гонок состояний)
    updateExcelData((prev: any) => ({
      ...(prev || { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: undefined }),
      routes: [ ...(prev?.routes || []), newRoute ],
      orders: (prev?.orders || [])
    }))
    
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

  // Выбранный город обязателен; используем только его для bias/нормализации
  const getSelectedCity = useCallback((): { city: '' | 'Киев' | 'Харьков' | 'Полтава' | 'Одесса'; country: 'Украина'; region: 'UA' } => {
    const settings = localStorageUtils.getAllSettings()
    const city = (settings.cityBias || '') as '' | 'Киев' | 'Харьков' | 'Полтава' | 'Одесса'
    return { city, country: 'Украина', region: 'UA' }
  }, [])

  // Простая очистка адреса + добавление выбранного города/страны
  const cleanAddressForRoute = useCallback((raw: string): string => {
    const base = cleanAddress(raw).trim()
    if (!base) return base
    const lower = base.toLowerCase()
    const { city, country } = getSelectedCity()
    if (!city) return base
    const hasCity = lower.includes(city.toLowerCase())
    const hasCountry = lower.includes('украина') || lower.includes('україна') || lower.includes('ukraine') || lower.includes(country.toLowerCase())
    if (!hasCity && !hasCountry) return `${base}, ${city}, ${country}`
    if (!hasCountry) return `${base}, ${country}`
    return base
  }, [getSelectedCity])

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

    // Проверяем аномалии перед расчетом
    const anomalyCheck = AddressValidationService.checkRouteAnomalies(route)
    setRouteAnomalies(prev => new Map(prev).set(route.id, anomalyCheck))

    if (anomalyCheck.hasAnomalies && anomalyCheck.errors.length > 0) {
      const errorMessage = `Обнаружены ошибки в маршруте:\n${anomalyCheck.errors.join('\n')}\n\nРасчет невозможен. Исправьте ошибки в адресах.`
      alert(errorMessage)
      return
    }

    // Предупреждения не блокируют расчет — продолжаем автоматически
    if (anomalyCheck.warnings.length > 0) {
      console.warn('Route warnings:', anomalyCheck.warnings)
    }

    setIsCalculating(true)

    try {

      // --- Сектор города и границы для геокодирования ---
      const settings = localStorageUtils.getAllSettings()
      const cityCtx = getSelectedCity()
      const sectorPath = cityCtx.city && settings.citySectors && settings.citySectors[cityCtx.city]
        ? settings.citySectors[cityCtx.city]
        : null

      const toLatLng = (p: { lat: number; lng: number }) => new window.google.maps.LatLng(p.lat, p.lng)

      // Ранее использовали центроид сектора как refPoint; теперь приоритет — предыдущая точка маршрута

      // Границы сектора (bounds) для bias
      const sectorBounds = (() => {
        if (!sectorPath || sectorPath.length < 3) return null
        const b = new window.google.maps.LatLngBounds()
        sectorPath.forEach((pt: any) => b.extend(toLatLng(pt)))
        return b
      })()

      // Полигон сектора для containsLocation
      const sectorPolygon = (() => {
        if (!sectorPath || sectorPath.length < 3 || !window.google?.maps?.geometry?.poly) return null
        return new window.google.maps.Polygon({ paths: sectorPath })
      })()

      // Извлекаем предполагаемый номер дома из исходной строки (латиница/кириллица, буквы суффикса допустимы)
      const extractHouseNumber = (raw: string): string | null => {
        if (!raw) return null
        const m = raw.match(/\b(\d+[\w\-]?)(?=\b|,|\s|$)/u)
        return m ? m[1] : null
      }

      // Извлекаем индекс (UA 5 цифр)
      const extractPostal = (raw: string): string | null => {
        if (!raw) return null
        const m = raw.match(/\b\d{5}\b/)
        return m ? m[0] : null
      }

      // Генерируем альтернативные варианты записи улицы (сокращения/языковые формы/дефисы)
      const generateStreetVariants = (raw: string): string[] => {
        const base = cleanAddressForRoute(raw)
        const variants = new Set<string>()
        variants.add(base)
        const replaceTokens = (
          str: string,
          from: RegExp,
          to: string
        ) => str.replace(from, to)

        const tokenPairs: Array<[RegExp, string]> = [
          [/\bвулиця\b/iu, 'вул.'],
          [/\bвул\.?\b/iu, 'вулиця'],
          [/\bулица\b/iu, 'ул.'],
          [/\bул\.?\b/iu, 'улица'],
          [/\bпровулок\b/iu, 'пров.'],
          [/\bпров\.?\b/iu, 'провулок'],
          [/\bпроспект\b/iu, 'просп.'],
          [/\bпросп\.?\b/iu, 'проспект'],
          [/\bлиния\b/iu, 'лінія'],
          [/\bлінія\b/iu, 'лін.'],
          [/\bлін\.?\b/iu, 'лінія']
        ]
        tokenPairs.forEach(([from, to]) => {
          try { variants.add(replaceTokens(base, from, to)) } catch {}
        })

        // Нормализация номера линии: 1-а ↔ 1а ↔ 1
        const lineForms = [
          base.replace(/\b(\d+)-(а|я)\b/iu, '$1$2'),
          base.replace(/\b(\d+)\s*(а|я)\b/iu, '$1-$2'),
          base.replace(/\b(\d+)-?(а|я)\b/iu, '$1'),
          base.replace(/\bперша\b/iu, '1-а'),
          base.replace(/\bпервая\b/iu, '1-я')
        ]
        lineForms.forEach(v => variants.add(v))

        // Если указано 
        //   "1 лінія" или "1 линия" без префикса типа улицы — добавим префиксы
        if (/\b(лінія|линия)\b/iu.test(base) && !/\b(вулиця|вул\.|улица|ул\.)\b/iu.test(base)) {
          variants.add(`вулиця ${base}`)
          variants.add(`вул. ${base}`)
          variants.add(`улица ${base}`)
          variants.add(`ул. ${base}`)
        }

        return Array.from(variants).filter(v => v && v !== base)
      }

      // Общая оценка кандидата: приоритет внутри сектора, наличие street_number и ROOFTOP
      const scoreCandidate = (candidate: any, opts: { refPoint?: any; expectedHouse?: string | null; expectedPostal?: string | null; inside: boolean }): number => {
        let score = 0
        // внутри сектора весомее всего
        if (opts.inside) score += 1000
        // тип геометрии
        const lt = candidate.geometry?.location_type
        if (lt === 'ROOFTOP') score += 200
        else if (lt === 'RANGE_INTERPOLATED') score += 120
        else if (lt === 'GEOMETRIC_CENTER') score += 80
        else if (lt === 'APPROXIMATE') score += 40

        // наличие точного street_number
        const comps = candidate.address_components || []
        const streetNumComp = comps.find((c: any) => c.types?.includes('street_number'))
        if (streetNumComp) score += 150
        // совпадение номера дома
        if (opts.expectedHouse) {
          const formatted = (candidate.formatted_address || '').toString().toLowerCase()
          if (formatted.includes(opts.expectedHouse.toLowerCase())) score += 120
          if (streetNumComp && streetNumComp.long_name && streetNumComp.long_name.toLowerCase() === opts.expectedHouse.toLowerCase()) score += 100
        }
        // совпадение почтового кода
        if (opts.expectedPostal) {
          const postalComp = comps.find((c: any) => c.types?.includes('postal_code'))
          if (postalComp && postalComp.long_name === opts.expectedPostal) score += 120
          const f = (candidate.formatted_address || '').toString()
          if (f.includes(opts.expectedPostal)) score += 60
        }

        // близость к опорной точке
        if (opts.refPoint) {
          try {
            const d = window.google.maps.geometry.spherical.computeDistanceBetween(candidate.geometry.location, opts.refPoint)
            // чем ближе, тем лучше; конвертируем в баллы
            // до 2км — 100 баллов, 2-5км — 60, 5-10км — 30, дальше — 0..10
            if (d <= 2000) score += 100
            else if (d <= 5000) score += 60
            else if (d <= 10000) score += 30
            else score += Math.max(0, 10 - Math.floor((d - 10000) / 2000))
          } catch {}
        }

        return score
      }

      // Геокодирование адреса с учетом сектора и region/componentRestrictions
      const geocodeWithSector = async (rawAddress: string, hintPoint?: any): Promise<any | null> => {
        const address = cleanAddressForRoute(rawAddress)
        const request: any = {
          address,
          region: cityCtx.region,
          componentRestrictions: { country: 'ua' }
        }
        if (sectorBounds) request.bounds = sectorBounds
        const results: any = await googleApiCache.geocode(request)
        if (!results || results.length === 0) return null
        const expectedHouse = extractHouseNumber(rawAddress)
        const expectedPostal = extractPostal(rawAddress)
        const refPoint = hintPoint || null
        const inside = sectorPolygon
          ? results.filter((r: any) => window.google.maps.geometry.poly.containsLocation(r.geometry.location, sectorPolygon))
          : []
        const pool = (inside.length > 0 ? inside : results)
        let best = pool[0]
        let bestScore = scoreCandidate(best, { refPoint, expectedHouse, expectedPostal, inside: sectorPolygon ? window.google.maps.geometry.poly.containsLocation(best.geometry.location, sectorPolygon) : true })
        for (let i = 1; i < pool.length; i++) {
          const cand = pool[i]
          const candScore = scoreCandidate(cand, { refPoint, expectedHouse, expectedPostal, inside: sectorPolygon ? window.google.maps.geometry.poly.containsLocation(cand.geometry.location, sectorPolygon) : true })
          if (candScore > bestScore) { best = cand; bestScore = candScore }
        }
        // если мы выбрали снаружи, а есть варианты внутри, попробуем лучшего внутри
        if (sectorPolygon && inside.length > 0 && !window.google.maps.geometry.poly.containsLocation(best.geometry.location, sectorPolygon)) {
          let bestIn = inside[0]
          let bestInScore = scoreCandidate(bestIn, { refPoint, expectedHouse, expectedPostal, inside: true })
          for (let i = 1; i < inside.length; i++) {
            const s = scoreCandidate(inside[i], { refPoint, expectedHouse, expectedPostal, inside: true })
            if (s > bestInScore) { bestIn = inside[i]; bestInScore = s }
          }
          best = bestIn
        }

        // Если нет ROOFTOP, попробуем уточнить корпус/секцию и повторить строго внутри сектора
        const tryRefine = () => {
          const m = rawAddress.match(/\b(корп(?:ус)?|к|секция|литера)\s*([\w-]+)/i)
          if (!m) return null
          const refined = `${address}, ${m[1]} ${m[2]}`
          return refined
        }
        if (best?.geometry?.location_type !== 'ROOFTOP') {
          const refinedAddr = tryRefine()
          if (refinedAddr) {
            const fix = await geocodeInsideOnly(refinedAddr, refPoint)
            if (fix && fix.geometry?.location_type === 'ROOFTOP') best = fix
          }
        }
        return best
      }

      // Повторная попытка: возвращает ЛУЧШЕГО кандидата ТОЛЬКО внутри полигона (если нет — null)
      const geocodeInsideOnly = async (rawAddress: string, hintPoint?: any): Promise<any | null> => {
        if (!sectorPolygon) return null
        const address = cleanAddressForRoute(rawAddress)
        const request: any = {
          address,
          region: cityCtx.region,
          componentRestrictions: { country: 'ua' }
        }
        if (sectorBounds) request.bounds = sectorBounds
        const results: any = await googleApiCache.geocode(request)
        let gathered = results
        if (!gathered || gathered.length === 0) gathered = []
        let inside = gathered.filter((r: any) => window.google.maps.geometry.poly.containsLocation(r.geometry.location, sectorPolygon))
        // Если внутри сектора кандидатов нет — пробуем альтернативные формы улицы
        if (inside.length === 0) {
          const alts = generateStreetVariants(rawAddress)
          for (const alt of alts) {
            // eslint-disable-next-line no-await-in-loop
            const altRes: any = await googleApiCache.geocode({ ...request, address: alt })
            if (altRes && altRes.length > 0) {
              const insideAlt = altRes.filter((r: any) => window.google.maps.geometry.poly.containsLocation(r.geometry.location, sectorPolygon))
              if (insideAlt.length > 0) { inside = insideAlt; break }
            }
          }
        }
        // Если всё ещё нет — при наличии подсказки (предыдущая точка) получаем sublocality и пробуем с ней
        if (inside.length === 0 && hintPoint) {
          const rev: any = await googleApiCache.geocode({ location: hintPoint })
          if (rev && rev.length > 0) {
            const sub = (() => {
              for (const r of rev) {
                const comp = (r.address_components || []).find((c: any) => c.types?.includes('sublocality') || c.types?.includes('neighborhood'))
                if (comp?.long_name) return comp.long_name
              }
              return null
            })()
            if (sub) {
              const withSub = `${address}, ${sub}`
              const subRes: any = await googleApiCache.geocode({ ...request, address: withSub })
              if (subRes && subRes.length > 0) {
                const insideSub = subRes.filter((r: any) => window.google.maps.geometry.poly.containsLocation(r.geometry.location, sectorPolygon))
                if (insideSub.length > 0) inside = insideSub
              }
            }
          }
        }
        if (inside.length === 0) return null
        const refPoint = hintPoint || null
        const expectedHouse = extractHouseNumber(rawAddress)
        const expectedPostal = extractPostal(rawAddress)
        let best = inside[0]
        let bestScore = scoreCandidate(best, { refPoint, expectedHouse, expectedPostal, inside: true })
        for (let i = 1; i < inside.length; i++) {
          const cand = inside[i]
          const candScore = scoreCandidate(cand, { refPoint, expectedHouse, expectedPostal, inside: true })
          if (candScore > bestScore) { best = cand; bestScore = candScore }
        }
        // If multiple viable options exist and no strong winner, ask the user
        if (inside.length > 1) {
          const withDistances = inside.map((r: any) => {
            let d
            try { if (refPoint) d = window.google.maps.geometry.spherical.computeDistanceBetween(r.geometry.location, refPoint) } catch {}
            return { label: r.formatted_address || 'Кандидат', distanceMeters: d, res: r }
          })
          const choice: any = await new Promise(resolve => {
            setDisambModal({ open: true, title: 'Выберите точный адрес', options: withDistances })
            disambResolver.current = resolve
          })
          setDisambModal(null)
          if (choice) return choice
        }
        return best
      }

      // Разрешаем координаты для всех точек маршрута
      let originRes = await geocodeWithSector(route.startAddress)
      const waypointResList: Array<any | null> = []
      let prevPoint = originRes?.geometry?.location || null
      for (const order of route.orders) {
        // подсказка: тянуть к центроиду сектора
        // теперь используем предыдущую точку маршрута для приоритета близости
        // eslint-disable-next-line no-await-in-loop
        const res = await geocodeWithSector(order.address, prevPoint)
        waypointResList.push(res)
        if (res?.geometry?.location) prevPoint = res.geometry.location
      }
      let destinationRes = await geocodeWithSector(route.endAddress, prevPoint)
      // Подготовим метаинформацию для визуальной верификации
      const buildMeta = (res: any, raw: string) => {
        if (!res) return null
        const comps = res.address_components || []
        const house = extractHouseNumber(raw)
        const postal = extractPostal(raw)
        const streetNumComp = comps.find((c: any) => c.types?.includes('street_number'))
        const postalComp = comps.find((c: any) => c.types?.includes('postal_code'))
        return {
          locationType: res.geometry?.location_type || 'UNKNOWN',
          placeId: res.place_id || null,
          streetNumberMatched: !!house && ((res.formatted_address || '').toLowerCase().includes(house.toLowerCase()) || (streetNumComp?.long_name || '').toLowerCase() === house.toLowerCase()),
          postalMatched: !!postal && (postalComp?.long_name === postal || (res.formatted_address || '').includes(postal)),
          formatted: res.formatted_address || '',
          lat: res.geometry?.location?.lat ? res.geometry.location.lat() : undefined,
          lng: res.geometry?.location?.lng ? res.geometry.location.lng() : undefined
        }
      }
      const routeGeoMeta: any = {
        origin: buildMeta(originRes, route.startAddress),
        destination: buildMeta(destinationRes, route.endAddress),
        waypoints: route.orders.map((o, i) => buildMeta(waypointResList[i], o.address))
      }


      // Валидация
      const unresolved: string[] = []
      if (!originRes) unresolved.push('стартовый адрес')
      waypointResList.forEach((r, idx) => { if (!r) unresolved.push(`точка #${idx + 1}`) })
      if (!destinationRes) unresolved.push('финишный адрес')
      if (unresolved.length > 0) {
        alert(`Не удалось однозначно определить: ${unresolved.join(', ')}. Уточните адреса или границы сектора.`)
        setIsCalculating(false)
        return
      }

      // Проверка попадания в сектор (если есть) + повторная попытка для внешних точек
      if (sectorPolygon) {
        const isInside = (loc: any) => window.google.maps.geometry.poly.containsLocation(loc, sectorPolygon)
        const all = [originRes, ...waypointResList, destinationRes]

        let anyOutside = false
        all.forEach((r: any) => { if (r && !isInside(r.geometry.location)) anyOutside = true })

        if (anyOutside) {
          // Пробуем переразрешить только внешние точки строго внутри полигона
          // origin
          if (originRes && !isInside(originRes.geometry.location)) {
            const fix = await geocodeInsideOnly(route.startAddress, null)
            if (fix) originRes = fix
          }
          // waypoints
          for (let i = 0; i < waypointResList.length; i++) {
            const r = waypointResList[i]
            if (r && !isInside(r.geometry.location)) {
              // eslint-disable-next-line no-await-in-loop
              const prev = i === 0 ? (originRes?.geometry?.location || null) : (waypointResList[i-1]?.geometry?.location || null)
              const fix = await geocodeInsideOnly(route.orders[i].address, prev)
              if (fix) waypointResList[i] = fix
            }
          }
          // destination
          if (destinationRes && !isInside(destinationRes.geometry.location)) {
            const prev = waypointResList.length > 0 ? (waypointResList[waypointResList.length-1]?.geometry?.location || null) : (originRes?.geometry?.location || null)
            const fix = await geocodeInsideOnly(route.endAddress, prev)
            if (fix) destinationRes = fix
          }

          // Повторная валидация
          const allPoints2 = [originRes!.geometry.location, ...waypointResList.map(r => r!.geometry.location), destinationRes!.geometry.location]
          const stillOutside = allPoints2.some((pt: any) => !isInside(pt))
          if (stillOutside) {
            alert('Некоторые точки маршрута находятся вне заданного сектора города. Проверьте адреса или границы сектора в Настройках.')
            setIsCalculating(false)
            return
          }
        }
      }

      // Формируем запрос: приоритет placeId, иначе formatted_address
      const originLocation = originRes?.place_id
        ? { placeId: originRes.place_id }
        : (originRes?.formatted_address || cleanAddressForRoute(route.startAddress))
      const destinationLocation = destinationRes?.place_id
        ? { placeId: destinationRes.place_id }
        : (destinationRes?.formatted_address || cleanAddressForRoute(route.endAddress))
      const waypointsLocations = waypointResList.map(r => ({
        location: r?.place_id ? { placeId: r.place_id } : (r?.formatted_address || ''),
        stopover: true
      }))
      const request = {
        origin: originLocation,
        destination: destinationLocation,
        waypoints: waypointsLocations,
        travelMode: window.google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
        unitSystem: window.google.maps.UnitSystem.METRIC,
        avoidHighways: false,
        avoidTolls: false,
        avoidFerries: false,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: window.google.maps.TrafficModel.BEST_GUESS
        },
        region: cityCtx.region,
        provideRouteAlternatives: false
      }

      const result = await googleApiCache.getDirections(request)
      if (result) {
          // Если задан сектор (полигон) для города — проверяем попадание всех точек
          const settings = localStorageUtils.getAllSettings()
          const city = cityCtx.city
          if (city && settings.citySectors && settings.citySectors[city] && settings.citySectors[city].length >= 3 && window.google?.maps?.geometry?.poly) {
            try {
              const sectorPath = settings.citySectors[city]
              const polygon = new window.google.maps.Polygon({ paths: sectorPath })
              const legs = result.routes[0].legs
              const points: any[] = []
              if (legs.length > 0) {
                points.push(legs[0].start_location)
                legs.forEach((leg: any) => points.push(leg.end_location))
              }
              const outside = points.some((pt: any) => !window.google.maps.geometry.poly.containsLocation(pt, polygon))
              if (outside) {
                console.warn('Некоторые точки вне сектора города — маршрут помечен как ложный, расчет отклонен')
                alert('Точки маршрута находятся вне заданного сектора города. Проверьте адреса или границы сектора в Настройках.')
                setIsCalculating(false)
                return
              }
            } catch (e) {
              // Если вдруг нет geometry, продолжаем без проверки
            }
          }

          // Используем точное расстояние из Google Maps API
          const totalDistance = result.routes[0].legs.reduce((total: number, leg: any) => total + leg.distance.value, 0)
          const totalDuration = result.routes[0].legs.reduce((total: number, leg: any) => total + leg.duration.value, 0)

          // Конвертируем в километры с высокой точностью
          const distanceKm = totalDistance / 1000
          // Критическая отсечка аномалий (из настроек, по умолчанию 120км)
          const maxKm = settings?.maxCriticalRouteDistanceKm ?? 120
          if (distanceKm > maxKm) {
            console.warn(`Аномальное расстояние: ${distanceKm.toFixed(1)} км > ${maxKm} км. Повторяем расчет с принудительным городом/страной.`)
            // Повторная попытка с жестким добавлением города/страны
            const forcedRequest = request
            const result2 = await googleApiCache.getDirections(forcedRequest)
            if (result2) {
              const totalDistance2 = result2.routes[0].legs.reduce((total: number, leg: any) => total + leg.distance.value, 0)
              const totalDuration2 = result2.routes[0].legs.reduce((total: number, leg: any) => total + leg.duration.value, 0)
              const distanceKm2 = totalDistance2 / 1000
              console.log('Retry Distance Calculation (forced city/country):', {
                distanceKm2,
                legs: result2.routes[0].legs.map((leg: any, i: number) => ({
                  i,
                  startAddress: leg.start_address,
                  endAddress: leg.end_address,
                  distance: leg.distance,
                  duration: leg.duration
                }))
              })
              updateExcelData((prev: any) => ({
                ...(prev || { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: undefined }),
                routes: (prev?.routes || []).map((r: Route) =>
                  r.id === route.id
                    ? {
                        ...r,
                        totalDistance: distanceKm2,
                        totalDuration: totalDuration2 / 60,
                        isOptimized: true,
                        geoMeta: routeGeoMeta
                      }
                    : r
                )
              }))
            } else {
              console.error('Ошибка повторного расчета маршрута')
            }
            setIsCalculating(false)
            return
          }
          
          // Проверяем, что маршрут не превышает 100км (возможная ошибка в адресе)
          if (distanceKm > 100) {
            console.warn(`Маршрут превышает 100км (${distanceKm.toFixed(1)}км). Возможна ошибка в адресе.`)
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

          updateExcelData((prev: any) => ({
            ...(prev || { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: undefined }),
            routes: (prev?.routes || []).map((r: Route) =>
              r.id === route.id
                ? {
                    ...r,
                    totalDistance: distanceKm,
                    totalDuration: totalDuration / 60,
                    isOptimized: true,
                    geoMeta: routeGeoMeta
                  }
                : r
            )
          }))
        } else {
          console.error('Ошибка расчета маршрута')
        }
        
        setIsCalculating(false)
      } catch (error: any) {
        console.error('Ошибка при расчете маршрута:', error)
        alert(`Ошибка при расчете маршрута: ${error.message || 'Неизвестная ошибка'}`)
        setIsCalculating(false)
      }
  }

  const deleteRoute = (routeId: string) => {
    const route = excelData?.routes?.find(r => r.id === routeId)
    if (route) {
      setRouteToDelete(route)
      setShowDeleteModal(true)
    }
  }

  const confirmDeleteRoute = () => {
    if (routeToDelete) {
      updateExcelData({ ...(excelData || { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: undefined }), routes: (excelData?.routes || []).filter(route => route.id !== routeToDelete.id) })
      setShowDeleteModal(false)
      setRouteToDelete(null)
    }
  }

  const cancelDeleteRoute = () => {
    setShowDeleteModal(false)
    setRouteToDelete(null)
  }

  // Функция для открытия модального окна редактирования адреса
  const handleEditAddress = (order: Order) => {
    setEditingOrder(order)
    setShowAddressEditModal(true)
  }

  // Функция для сохранения измененного адреса
  const handleSaveAddress = (newAddress: string) => {
    if (!editingOrder) return

    // Обновляем адрес в заказе
    const updatedOrder = { ...editingOrder, address: newAddress }
    
    // Обновляем только маршруты, содержащие этот заказ
    updateExcelData({ ...(excelData || { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: undefined }), routes: (excelData?.routes || []).map((route: Route) => {
      const orderIndex = route.orders.findIndex((order: Order) => order.id === editingOrder.id)
      if (orderIndex !== -1) {
        const updatedRouteOrders = [...route.orders]
        updatedRouteOrders[orderIndex] = updatedOrder
        return {
          ...route,
          orders: updatedRouteOrders,
          isOptimized: false,
          totalDistance: 0,
          totalDuration: 0
        }
      }
      return route
    }), orders: ((excelData?.orders || []).map((order: any) =>
      order.id === editingOrder.id ? { ...order, address: newAddress } : order
    )) })

    // Сохраняем в localStorage
    try {
      localStorage.setItem('km_routes', JSON.stringify(excelData?.routes))
    } catch (error) {
      console.error('Ошибка сохранения маршрутов:', error)
    }

    setShowAddressEditModal(false)
    setEditingOrder(null)
  }

  // Функция для пересчета конкретного маршрута
  const recalculateRoute = async (route: Route) => {
    // Проверяем аномалии перед пересчетом
    const anomalyCheck = AddressValidationService.checkRouteAnomalies(route)
    setRouteAnomalies(prev => new Map(prev).set(route.id, anomalyCheck))

    if (anomalyCheck.hasAnomalies && anomalyCheck.errors.length > 0) {
      const errorMessage = `Обнаружены ошибки в маршруте:\n${anomalyCheck.errors.join('\n')}\n\nПересчет невозможен. Исправьте ошибки в адресах.`
      alert(errorMessage)
      return
    }

    // Предупреждения не блокируют пересчет — продолжаем автоматически
    if (anomalyCheck.warnings.length > 0) {
      console.warn('Route warnings (recalc):', anomalyCheck.warnings)
    }

    // Выполняем пересчет
    await calculateRouteDistance(route)
  }


  const clearAllRoutes = () => {
    console.log('Clear all routes clicked, current routes count:', (excelData?.routes?.length ?? 0))
    if (window.confirm('Вы уверены, что хотите удалить все маршруты?')) {
      console.log('User confirmed, clearing all routes')
      updateExcelData({ ...(excelData || { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: undefined }), routes: [] })
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
      // Предпочитаем placeId/форматированные адреса из geoMeta, чтобы совпадать с расчетом/сектором
      const base = 'https://www.google.com/maps/dir/?api=1'
      const meta: any = (route as any).geoMeta || {}
      const hasFullCoords = (m: any) => typeof m?.lat === 'number' && typeof m?.lng === 'number'
      const waypointsMeta: any[] = (meta.waypoints && Array.isArray(meta.waypoints)) ? meta.waypoints : []
      const missingCoords = !hasFullCoords(meta.origin) || !hasFullCoords(meta.destination) || waypointsMeta.some((w: any) => !hasFullCoords(w)) || waypointsMeta.length !== route.orders.length
      if (missingCoords) {
        alert('Чтобы открыть маршрут в Google Maps без искажений, сначала пересчитайте маршрут (получим координаты точек).')
        return
      }
      const originStr = `${meta.origin.lat},${meta.origin.lng}`
      const destinationStr = `${meta.destination.lat},${meta.destination.lng}`
      const wpList = waypointsMeta.map((w: any) => `${w.lat},${w.lng}`)
      const origin = `origin=${encodeURIComponent(originStr)}`
      const destination = `destination=${encodeURIComponent(destinationStr)}`
      const waypoints = wpList.length > 0 ? `waypoints=${encodeURIComponent(wpList.join('|'))}` : ''
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

  // Функция для перевода состояний геокодирования на русский
  const translateLocationType = (locationType: string): string => {
    const translations: Record<string, string> = {
      'ROOFTOP': 'Точный адрес',
      'RANGE_INTERPOLATED': 'Интерполированный',
      'GEOMETRIC_CENTER': 'Геометрический центр',
      'APPROXIMATE': 'Приблизительный',
      'UNKNOWN': 'Неизвестно'
    }
    return translations[locationType] || locationType
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={clsx(
        'rounded-3xl p-8 shadow-2xl border-2 overflow-hidden relative',
        isDark 
          ? 'bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 border-gray-700' 
          : 'bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border-blue-200'
      )}>
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-pink-600/10 opacity-50"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={clsx(
                'p-4 rounded-2xl shadow-lg',
                isDark 
                  ? 'bg-gradient-to-br from-blue-600 to-purple-600' 
                  : 'bg-gradient-to-br from-blue-500 to-indigo-600'
              )}>
                <MapIcon className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className={clsx(
                  'text-3xl font-bold mb-1 bg-gradient-to-r bg-clip-text text-transparent',
                  isDark 
                    ? 'from-blue-400 to-purple-400' 
                    : 'from-blue-600 to-indigo-600'
                )}>
                  Управление маршрутами
                </h1>
                <p className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>
                  Создавайте маршруты для курьеров и рассчитывайте расстояния
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className={clsx(
                'flex items-center space-x-4 text-sm',
                isDark ? 'text-gray-400' : 'text-gray-500'
              )}>
                <span>{couriers.length} курьеров, {(excelData?.routes?.length ?? 0)} маршрутов</span>
              </div>
              <Tooltip
                content="Открыть справку и инструкции по управлению маршрутами"
                position="left"
              >
                <button
                  onClick={() => {
                    setShowHelpModal(true)
                    if (!hasSeenHelp) {
                      localStorage.setItem('km_routes_has_seen_help', 'true')
                      setHasSeenHelp(true)
                    }
                  }}
                  className={clsx(
                    'p-3 rounded-xl transition-all hover:scale-105',
                    isDark 
                      ? 'bg-gray-700 hover:bg-gray-600 text-blue-400' 
                      : 'bg-white hover:bg-blue-50 text-blue-600 shadow-lg'
                  )}
                >
                  <QuestionMarkCircleIcon className="w-6 h-6" />
                </button>
              </Tooltip>
              <div className="flex items-center space-x-1">
                <div className={`w-2 h-2 rounded-full ${googleMapsReady ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                <span>{googleMapsReady ? 'Google Maps готов' : 'Загрузка Google Maps...'}</span>
              </div>
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
              <div className="space-y-2" data-tour="courier-select">
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
                  disabled={selectedOrders.size === 0 || isRouteDuplicate(selectedCourier, selectedOrders)}
                  data-tour="create-route"
                  className={clsx(
                    'flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors',
                    selectedOrders.size === 0 || isRouteDuplicate(selectedCourier, selectedOrders)
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
                    {isRouteDuplicate(selectedCourier, selectedOrders) 
                      ? 'Маршрут уже существует' 
                      : `Создать маршрут (${selectedOrders.size})`}
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

              </div>

              <div 
                className={clsx(
                  'max-h-96 overflow-y-auto scrollbar-thin',
                  isDark 
                    ? 'scrollbar-thumb-gray-600 scrollbar-track-gray-800' 
                    : 'scrollbar-thumb-gray-300 scrollbar-track-gray-100'
                )}
                data-tour="order-select"
              >
                {(() => {
    let allOrders = sortOrdersByTime(
      searchOrders(courierOrders[selectedCourier] || [])
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
                          <div style={{ height: 400 }}>
                            <List
                              ref={availableListRef as any}
                              height={400}
                              itemCount={Math.min(availableOrders.length, visibleOrdersCount)}
                              itemSize={getAvailableSize}
                              width={'100%'}
                              className="space-y-2"
                            >
                              {({ index, style }) => {
                                const order = availableOrders[index]
                                const isSelected = selectedOrders.has(order.id)
                                const selectionOrder = selectedOrdersOrder.indexOf(order.id) + 1
                                return (
                                  <MeasuredRow
                                    index={index}
                                    style={style}
                                    order={order}
                                    isSelected={isSelected}
                                    selectionOrder={selectionOrder}
                                    onSelect={handleOrderSelect}
                                    onMoveUp={moveOrderUp}
                                    onMoveDown={moveOrderDown}
                                    isInRoute={false}
                                    setSize={setAvailableSize}
                                  />
                                )
                              }}
                            </List>
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
                          <div style={{ height: 300 }}>
                            <List
                              ref={inRouteListRef as any}
                              height={300}
                              itemCount={ordersInRoutes.length}
                              itemSize={getInRouteSize}
                              width={'100%'}
                              className="space-y-2"
                            >
                              {({ index, style }) => {
                                const order = ordersInRoutes[index]
                                return (
                                  <MeasuredRow
                                    index={index}
                                    style={style}
                                    order={order}
                                    isSelected={false}
                                    selectionOrder={0}
                                    onSelect={() => {}}
                                    onMoveUp={() => {}}
                                    onMoveDown={() => {}}
                                    isInRoute={true}
                                    setSize={setInRouteSize}
                                  />
                                )
                              }}
                            </List>
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
            {(excelData?.routes?.length ?? 0) > 0 && (
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
            
          {(excelData?.routes?.length ?? 0) === 0 ? (
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
            <div className="space-y-4" data-tour="route-list">
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
                        onClick={() => recalculateRoute(route)}
                        disabled={isCalculating}
                        className={clsx(
                          'p-1 transition-colors disabled:opacity-50',
                          isDark 
                            ? 'text-gray-400 hover:text-green-400' 
                            : 'text-gray-400 hover:text-green-600'
                        )}
                        title="Пересчитать маршрут"
                      >
                        <ArrowPathIcon className="h-4 w-4" />
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
                      {route.orders.map((order: Order, index: number) => {
                      const anomalyCheck = routeAnomalies.get(route.id)
                      const meta = (route as any).geoMeta?.waypoints?.[index]
                      const metaBadge = meta ? (
                        <div className="mt-1 flex items-center flex-wrap gap-1 text-[10px]">
                          <span className={clsx(
                            'px-1.5 py-0.5 rounded',
                            meta.locationType === 'ROOFTOP'
                              ? (isDark ? 'bg-green-900/30 text-green-300' : 'bg-green-100 text-green-800')
                              : meta.locationType === 'RANGE_INTERPOLATED'
                                ? (isDark ? 'bg-yellow-900/30 text-yellow-300' : 'bg-yellow-100 text-yellow-800')
                                : (isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700')
                          )}>{translateLocationType(meta.locationType)}</span>
                          {typeof meta.streetNumberMatched === 'boolean' && (
                            <span className={clsx(
                              'px-1.5 py-0.5 rounded',
                              meta.streetNumberMatched
                                ? (isDark ? 'bg-green-900/30 text-green-300' : 'bg-green-100 text-green-800')
                                : (isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-100 text-red-700')
                            )}>№ {meta.streetNumberMatched ? '✓' : '✗'}</span>
                          )}
                          {/* ZIP badge removed by user request */}
                        </div>
                      ) : null
                      const hasAddressIssues = anomalyCheck?.errors.some(error => 
                        error.includes('адрес') || error.includes('адресов')
                      )
                      
                      return (
                        <div key={order.id} className="flex items-start justify-between text-sm group py-3">
                          <div className="flex items-start space-x-3 flex-1">
                            <span className={clsx(
                              'mt-1 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold',
                              isDark 
                                ? 'bg-blue-600/20 text-blue-300' 
                                : 'bg-blue-100 text-blue-800'
                            )}>
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center space-x-2">
                                <span className={clsx(
                                  'font-medium',
                                  isDark ? 'text-gray-300' : 'text-gray-700'
                                )}>Заказ #{order.orderNumber}</span>
                                {order.plannedTime && (
                                  <span className={clsx(
                                    'px-2 py-0.5 rounded-full text-xs',
                                    isDark ? 'bg-purple-600/20 text-purple-300' : 'bg-purple-50 text-purple-700'
                                  )}>
                                    {order.plannedTime}
                                  </span>
                                )}
                                {order.paymentMethod && (() => {
                                  const badgeProps = getPaymentMethodBadgeProps(order.paymentMethod, isDark)
                                  return (
                                    <span className={clsx('px-2 py-0.5 rounded-full text-xs', badgeProps.bgColorClass, badgeProps.textColorClass)}>
                                      {badgeProps.text}
                                    </span>
                                  )
                                })()}
                              </div>
                              <div className={clsx(
                                'truncate',
                                isDark ? 'text-gray-400' : 'text-gray-600',
                                hasAddressIssues && 'text-red-500'
                              )}>{order.address}</div>
                              {metaBadge}
                              <div className={clsx(
                                'mt-1 text-xs',
                                isDark ? 'text-gray-500' : 'text-gray-400'
                              )}>
                                {/* Телефон скрыт по требованию */}
                                {typeof order.amount === 'number' && (
                                  <span className="mr-2">{order.amount} грн</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 pl-2">
                            <button
                              onClick={() => handleEditAddress(order)}
                              className={clsx(
                                'p-1.5 rounded',
                                isDark 
                                  ? 'text-gray-400 hover:text-blue-400 hover:bg-blue-900/20' 
                                  : 'text-gray-500 hover:text-blue-600 hover:bg-blue-100'
                              )}
                              title="Редактировать адрес"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                            {hasAddressIssues && (
                              <ExclamationTriangleIcon className="h-4 w-4 text-red-500" title="Проблемы с адресом" />
                            )}
                          </div>
                        </div>
                      )
                    })}
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
                        
                        {/* Отображение аномалий маршрута */}
                        {(() => {
                          const anomalyCheck = routeAnomalies.get(route.id)
                          if (!anomalyCheck || (!anomalyCheck.hasAnomalies && anomalyCheck.warnings.length === 0)) {
                            return null
                          }
                          
                          return (
                            <div className="mt-2 space-y-1">
                              {anomalyCheck.errors.length > 0 && (
                                <div className={clsx(
                                  'text-xs p-2 rounded',
                                  isDark ? 'bg-red-900/20 text-red-300' : 'bg-red-50 text-red-700'
                                )}>
                                  <div className="flex items-center space-x-1">
                                    <ExclamationTriangleIcon className="h-3 w-3" />
                                    <span className="font-medium">Ошибки:</span>
                                  </div>
                                  <ul className="ml-4 mt-1">
                                    {anomalyCheck.errors.map((error, index) => (
                                      <li key={index}>• {error}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              
                              {anomalyCheck.warnings.length > 0 && (
                                <div className={clsx(
                                  'text-xs p-2 rounded',
                                  isDark ? 'bg-yellow-900/20 text-yellow-300' : 'bg-yellow-50 text-yellow-700'
                                )}>
                                  <div className="flex items-center space-x-1">
                                    <ExclamationTriangleIcon className="h-3 w-3" />
                                    <span className="font-medium">Предупреждения:</span>
                                  </div>
                                  <ul className="ml-4 mt-1">
                                    {anomalyCheck.warnings.map((warning, index) => (
                                      <li key={index}>• {warning}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )
                        })()}
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

      {/* Модальное окно редактирования адреса */}
      {showAddressEditModal && editingOrder && (
        <AddressEditModal
          isOpen={showAddressEditModal}
          onClose={() => {
            setShowAddressEditModal(false)
            setEditingOrder(null)
          }}
          onSave={handleSaveAddress}
          currentAddress={editingOrder.address}
          orderNumber={editingOrder.orderNumber}
          customerName={editingOrder.customerName}
          isDark={isDark}
        />
      )}

      {/* Модальное окно выбора адреса при неоднозначности геокодирования */}
      {disambModal?.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className={clsx('rounded-lg p-6 w-full max-w-xl', isDark ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-900')}>
            <h3 className="text-lg font-semibold mb-3">{disambModal.title}</h3>
            <p className={clsx('text-sm mb-3', isDark ? 'text-gray-300' : 'text-gray-600')}>В секторе найдено несколько подходящих вариантов. Выберите правильный адрес.</p>
            <div className="max-h-80 overflow-y-auto divide-y">
              {disambModal.options.map((opt, idx) => (
                <button
                  key={idx}
                  className={clsx('w-full text-left py-3 px-2 hover:bg-blue-50 rounded', isDark && 'hover:bg-gray-700')}
                  onClick={() => {
                    const resolver = disambResolver.current
                    if (resolver) resolver(opt.res)
                  }}
                >
                  <div className="font-medium truncate">{opt.label}</div>
                  {typeof opt.distanceMeters === 'number' && (
                    <div className={clsx('text-xs mt-0.5', isDark ? 'text-gray-400' : 'text-gray-500')}>
                      ~{(opt.distanceMeters / 1000).toFixed(2)} км от предыдущей точки
                    </div>
                  )}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end space-x-2">
              <button
                className={clsx('px-4 py-2 rounded', isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700')}
                onClick={() => { const r = disambResolver.current; if (r) r(null) }}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Система помощи */}
      {showHelpModal && (
        <Suspense fallback={null}>
          <HelpModalRoutes
            isOpen={showHelpModal}
            onClose={() => setShowHelpModal(false)}
            onStartTour={() => {
              setShowHelpModal(false)
              setTimeout(() => setShowHelpTour(true), 300)
            }}
          />
        </Suspense>
      )}

      {/* Интерактивный тур */}
      {showHelpTour && (
        <Suspense fallback={null}>
          <HelpTour
            isOpen={showHelpTour}
            onClose={() => setShowHelpTour(false)}
            onComplete={() => {
              setShowHelpTour(false)
              localStorage.setItem('km_routes_has_seen_help', 'true')
              setHasSeenHelp(true)
            }}
            steps={[
          {
            id: 'courier-select',
            title: '👤 Выбор курьера',
            content: `📋 Начните с выбора курьера из списка слева.

🎯 Что делать:
1. Найдите нужного курьера в списке
2. Кликните на карточку курьера
3. После выбора вы увидите доступные заказы справа

💡 Подсказка: Используйте фильтры "Все", "Авто" или "Мото" для быстрого поиска нужного типа курьера.`,
            target: '[data-tour="courier-select"]',
            position: 'right'
          },
          {
            id: 'order-select',
            title: '📦 Выбор заказов',
            content: `🖱️ Кликните на заказы, чтобы добавить их в маршрут.

📊 Как это работает:
• Порядок выбора = порядок доставки
• Выбранные заказы подсвечиваются синим
• Используйте кнопки ↑ и ↓ для изменения порядка

✅ Пример:
1. Кликните на заказ #001 → он станет первым
2. Кликните на заказ #002 → он станет вторым
3. Используйте стрелки для изменения порядка

⚠️ Заказы, уже находящиеся в других маршрутах, нельзя выбрать.`,
            target: '[data-tour="order-select"]',
            position: 'left'
          },
          {
            id: 'create-route',
            title: '✨ Создание маршрута',
            content: `🚀 После выбора заказов нажмите кнопку "Создать маршрут".

⚙️ Что происходит:
1. Система создает новый маршрут
2. Автоматически рассчитывает расстояние
3. Маршрут появляется в списке внизу

📋 Требования:
• Должен быть выбран курьер
• Должен быть выбран хотя бы один заказ

💡 После создания маршрут автоматически рассчитывается через Google Maps API.`,
            target: '[data-tour="create-route"]',
            position: 'top'
          },
          {
            id: 'route-list',
            title: '🗺️ Список маршрутов',
            content: `📋 Здесь отображаются все созданные маршруты.

🎯 Доступные действия:
🗺️ Открыть в Google Maps - просмотр маршрута
🔄 Пересчитать - обновить расстояние и время
🗑️ Удалить - удалить маршрут

📊 Информация о маршруте:
• Количество заказов
• Общее расстояние (км)
• Время в пути (минуты)
• Статус оптимизации`,
            target: '[data-tour="route-list"]',
            position: 'top'
          }
        ] as TourStep[]}
          />
        </Suspense>
      )}
    </div>
  )
}










































