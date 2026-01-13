import React, { useState, useEffect, useMemo, useCallback, memo, useRef, useLayoutEffect } from 'react'
import { VariableSizeList as List, areEqual } from 'react-window'
import {
  MapIcon,
  TruckIcon,
  InboxIcon,
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
  ExclamationCircleIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline'
import { localStorageUtils } from '../../utils/ui/localStorage'
import { googleMapsLoader } from '../../utils/maps/googleMapsLoader'
import { useExcelData } from '../../contexts/ExcelDataContext'
import { useTheme } from '../../contexts/ThemeContext'
import { clsx } from 'clsx'
import { AddressEditModal } from '../modals/AddressEditModal'
import { AddressValidationService, RouteAnomalyCheck } from '../../services/addressValidation'
import { getPaymentMethodBadgeProps } from '../../utils/data/paymentMethodHelper'
import { toast } from 'react-hot-toast'
import { Tooltip } from '../shared/Tooltip'
import { googleApiCache } from '../../services/googleApiCache'
import { lazy, Suspense } from 'react'
import { useDashboardAutoRefresh } from '../../hooks/useDashboardAutoRefresh'
import { useAutoPlannerStore } from '../../stores/useAutoPlannerStore'
import { mergeExcelData } from '../../utils/data/dataMerging'
import { logger } from '../../utils/ui/logger'
import { ProcessedExcelData } from '../../types'
import { CourierTimeWindows } from './CourierTimeWindows'
import { type TimeWindowGroup } from '../../utils/route/routeCalculationHelpers'

// Ленивая загрузка тяжелых компонентов
const HelpModalRoutes = lazy(() => import('../modals/HelpModalRoutes').then(m => ({ default: m.HelpModalRoutes })))
const HelpTour = lazy(() => import('../features/HelpTour').then(m => ({ default: m.HelpTour })))

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
  manualGroupId?: string // Phase 4.7
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
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('orderId', order.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={clsx(
        'p-4 rounded-2xl border-2 transition-all duration-300 ease-in-out transform',
        'hover:shadow-lg active:scale-[0.98]',
        isSelected
          ? isDark
            ? 'bg-blue-500/10 border-blue-500 shadow-blue-500/20 cursor-pointer'
            : 'bg-blue-50 border-blue-500 shadow-blue-500/10 cursor-pointer'
          : isInRoute
            ? isDark
              ? 'bg-gray-800/40 border-gray-700/50 cursor-not-allowed grayscale opacity-60'
              : 'bg-gray-50 border-gray-100 cursor-not-allowed grayscale opacity-60'
            : isDark
              ? 'bg-gray-800/60 border-gray-700 hover:bg-gray-700/80 hover:border-gray-500 cursor-pointer'
              : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-blue-200 cursor-pointer shadow-sm hover:shadow-md'
      )}
    >
      <div className="flex items-start gap-4">
        {/* Selection Index */}
        {(isSelected || isInRoute) && (
          <div className={clsx(
            'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-black transition-all',
            isSelected
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
              : 'bg-gray-500/20 text-gray-500'
          )}>
            {isSelected ? selectionOrder : <CheckCircleIcon className="w-5 h-5" />}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className={clsx(
              'font-extrabold text-base tracking-tight',
              isDark ? 'text-white' : 'text-gray-900'
            )}>
              #{order.orderNumber}
            </span>
            <div className="flex items-center gap-1">
              {isSelected && (
                <div className="flex items-center bg-blue-100 dark:bg-blue-900/40 rounded-lg p-0.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); onMoveUp(order.id); }}
                    disabled={selectionOrder === 1}
                    className="p-1 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-md transition-colors disabled:opacity-30"
                  >
                    <ChevronUpIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onMoveDown(order.id); }}
                    disabled={selectionOrder === 0}
                    className="p-1 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-md transition-colors disabled:opacity-30"
                  >
                    <ChevronDownIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <p className={clsx(
            'text-sm leading-snug mb-3 line-clamp-2 font-medium',
            isDark ? 'text-gray-300' : 'text-gray-600'
          )}>
            {order.address}
          </p>

          <div className="flex flex-wrap gap-2 items-center">
            {order.customerName && (
              <span className={clsx(
                'px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider',
                isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
              )}>
                {order.customerName}
              </span>
            )}
            {typeof order.amount === 'number' && (
              <span className={clsx(
                'px-2.5 py-1 rounded-lg text-[11px] font-black',
                isDark ? 'bg-green-500/10 text-green-400' : 'bg-green-100 text-green-700'
              )}>
                {order.amount} ₴
              </span>
            )}
            {order.plannedTime && (
              <span className={clsx(
                'flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold',
                isDark ? 'bg-purple-500/10 text-purple-400' : 'bg-purple-100 text-purple-700'
              )}>
                <ClockIcon className="w-3 h-3" />
                {order.plannedTime}
              </span>
            )}
            {order.paymentMethod && (() => {
              const b = getPaymentMethodBadgeProps(order.paymentMethod, isDark)
              return (
                <span className={clsx('px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase', b.bgColorClass, b.textColorClass)}>
                  {b.text}
                </span>
              )
            })()}
          </div>
        </div>
      </div>
    </div >
  )
}, areEqual)

const CourierListItem = memo(({
  courierName,
  vehicleType,
  isSelected,
  onSelect,
  availableOrdersCount,
  isDark
}: {
  courierName: string
  vehicleType: string
  isSelected: boolean
  onSelect: (name: string) => void
  availableOrdersCount: number
  isDark: boolean
}) => {
  const isUnassigned = courierName === 'Не назначен'

  return (
    <button
      onClick={() => onSelect(courierName)}
      className={clsx(
        'w-full text-left p-4 rounded-2xl border-2 transition-all duration-300 ease-in-out transform mb-2',
        'group relative overflow-hidden',
        isSelected || isUnassigned
          ? isDark
            ? (isUnassigned
              ? 'bg-yellow-600/10 border-yellow-500 shadow-lg shadow-yellow-500/10'
              : 'bg-blue-600/10 border-blue-500 shadow-lg shadow-blue-500/10')
            : (isUnassigned
              ? 'bg-yellow-50 border-yellow-400 shadow-md ring-1 ring-yellow-400'
              : 'bg-blue-50 border-blue-500 shadow-md ring-1 ring-blue-500')
          : isDark
            ? 'bg-gray-800/40 border-gray-700 hover:border-gray-500 hover:bg-gray-700/60'
            : 'bg-white border-gray-100 hover:border-blue-200 hover:bg-gray-50 shadow-sm'
      )}
    >
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-4">
          <div className={clsx(
            'p-3 rounded-xl transition-all duration-300',
            isSelected || isUnassigned
              ? isUnassigned ? 'bg-yellow-500 text-white' : 'bg-blue-600 text-white'
              : isDark ? 'bg-gray-700 text-gray-500' : 'bg-gray-100 text-gray-400',
            'group-hover:scale-110 group-hover:rotate-3'
          )}>
            {isUnassigned ? (
              <InboxIcon className="h-6 w-6" />
            ) : vehicleType === 'car' ? (
              <TruckIcon className="h-6 w-6" />
            ) : (
              <TruckIcon className="h-6 w-6" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className={clsx(
                "font-black text-base tracking-tight transition-colors",
                isSelected || isUnassigned
                  ? isDark ? 'text-white' : 'text-gray-900'
                  : isDark ? 'text-gray-400' : 'text-gray-600'
              )}>
                {courierName}
              </span>
              {!isUnassigned && (
                <span className={clsx(
                  'text-[10px] px-1.5 py-0.5 rounded font-black tracking-widest uppercase',
                  vehicleType === 'car'
                    ? (isDark ? 'bg-green-500/10 text-green-400' : 'bg-green-100 text-green-700')
                    : (isDark ? 'bg-orange-500/10 text-orange-400' : 'bg-orange-100 text-orange-700')
                )}>
                  {vehicleType === 'car' ? 'Авто' : 'Мото'}
                </span>
              )}
            </div>
            <div className={clsx(
              'text-[13px] font-bold transition-colors',
              isSelected
                ? isDark ? 'text-blue-400' : 'text-blue-600'
                : isDark ? 'text-gray-600' : 'text-gray-400'
            )}>
              {availableOrdersCount} заказов
            </div>
          </div>
        </div>
      </div>

      {/* Decorative accent for selected state */}
      {isSelected && (
        <div className={clsx(
          'absolute top-0 right-0 w-16 h-16 -mr-8 -mt-8 rounded-full blur-xl opacity-20',
          isUnassigned ? 'bg-yellow-500' : 'bg-blue-500'
        )} />
      )}
    </button>
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
  const [routePage, setRoutePage] = useState(0)
  const [routesPerPage] = useState(5) // Количество маршрутов на странице
  const [sortRoutesByNewest] = useState(true)
  const [orderSearchTerm, setOrderSearchTerm] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [routeToDelete, setRouteToDelete] = useState<Route | null>(null)
  const [showAddressEditModal, setShowAddressEditModal] = useState(false)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [routeAnomalies, setRouteAnomalies] = useState<Map<string, RouteAnomalyCheck>>(new Map())
  // Disambiguation modal state for choosing among multiple in-sector candidates
  const [disambModal, setDisambModal] = useState<{ open: boolean; title: string; options: Array<{ label: string; distanceMeters?: number; res: any }> } | null>(null)
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

  // --- Auto Refresh Logic ---
  // Get time window from store
  const { apiTimeDeliveryBeg, apiTimeDeliveryEnd } = useAutoPlannerStore();

  // Обработчик загрузки данных из Dashboard API с использованием mergeExcelData
  const handleDashboardDataLoaded = useCallback(async (data: ProcessedExcelData) => {
    // ВАЖНО: Используем updateExcelData с функцией обратного вызова или mergeExcelData напрямую с текущим состоянием,
    // но так как updateExcelData уже имеет доступ к prev state, лучше использовать функциональное обновление.
    // Однако, excelData доступен в замыкании.
    // Используем безопасное объединение, чтобы не потерять маршруты.

    // Но так как у нас есть доступ к updateExcelData, мы можем сделать так:
    updateExcelData((prevData: any) => {
      const merged = mergeExcelData(data, prevData);
      logger.info(`✅ Данные обновлены (RouteManagement): ${merged.orders.length} заказов, ${merged.routes.length} сохраненных маршрутов`);
      return merged;
    });
  }, [updateExcelData]);

  // Auto-refresh hook - automatically syncs data every 5 minutes
  // Включаем на этой странице тоже, чтобы данные не устаревали
  useDashboardAutoRefresh({
    dateTimeDeliveryBeg: apiTimeDeliveryBeg,
    dateTimeDeliveryEnd: apiTimeDeliveryEnd,
    onDataLoaded: handleDashboardDataLoaded,
    enabled: true,
  });


  // Показываем помощь новым пользователям через 2 секунды после загрузки
  useEffect(() => {
    if (!hasSeenHelp && typeof window !== 'undefined') {
      const timer = setTimeout(() => {
        setShowHelpModal(true)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [hasSeenHelp])

  // Дебаунсинг удален для мгновенного поиска
  // useEffect(() => {
  //   const timer = setTimeout(() => {
  //     setDebouncedSearchTerm(orderSearchTerm)
  //   }, 300)
  //   return () => clearTimeout(timer)
  // }, [orderSearchTerm])

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
          manualGroupId: order.manualGroupId,      // Phase 4.7
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
      ; (excelData?.routes || []).forEach((route: Route) => {
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
    .sort((a, b) => {
      // Сортировка: "Не назначен" всегда сверху
      if (a === 'Не назначен') return -1;
      if (b === 'Не назначен') return 1;
      return a.localeCompare(b, 'ru');
    })

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
    if (!orderSearchTerm.trim()) return orders

    const searchTerm = orderSearchTerm.toLowerCase().trim()
    return orders.filter(order =>
      String(order.orderNumber).toLowerCase().includes(searchTerm) ||
      (order.customerName || '').toLowerCase().includes(searchTerm) ||
      (order.address || '').toLowerCase().includes(searchTerm)
    )
  }, [orderSearchTerm])

  // Сортируем заказы: сначала доступные по времени, потом заказы в маршрутах
  const sortOrdersByTime = (orders: Order[]) => {
    return [...orders].sort((a, b) => {
      const aInRoute = isOrderInExistingRoute(a.id)
      const bInRoute = isOrderInExistingRoute(b.id)

      // Сначала сортируем по статусу: доступные заказы сверху, в маршрутах снизу
      if (aInRoute && !bInRoute) return 1
      if (!aInRoute && bInRoute) return -1

      if (!a.plannedTime && !b.plannedTime) return 0
      if (!a.plannedTime) return 1
      if (!b.plannedTime) return -1

      const timeA = String(a.plannedTime || '');
      const timeB = String(b.plannedTime || '');
      return timeA.localeCompare(timeB)
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
  const availableSizeMap = useRef<Record<string, number>>({})
  const inRouteSizeMap = useRef<Record<string, number>>({})
  const ROW_GAP = 8 // расстояние между элементами

  const setAvailableSize = useCallback((id: string, index: number, size: number) => {
    const next = size + ROW_GAP
    if (availableSizeMap.current[id] !== next) {
      availableSizeMap.current[id] = next
      availableListRef.current?.resetAfterIndex(index)
    }
  }, [])

  const availableOrders = useMemo(() => {
    if (!selectedCourier) return []
    let all = sortOrdersByTime(searchOrders(courierOrders[selectedCourier] || []))
    // Дедупликация на случай дублей данных из источника
    const seen = new Set<string>()
    all = all.filter(o => (seen.has(o.id) ? false : (seen.add(o.id), true)))
    return all.filter(order => !isOrderInExistingRoute(order.id))
  }, [selectedCourier, courierOrders, orderSearchTerm, excelData?.routes])

  const ordersInRoutes = useMemo(() => {
    if (!selectedCourier) return []
    let all = sortOrdersByTime(searchOrders(courierOrders[selectedCourier] || []))
    // Дедупликация
    const seen = new Set<string>()
    all = all.filter(o => (seen.has(o.id) ? false : (seen.add(o.id), true)))
    return all.filter(order => isOrderInExistingRoute(order.id))
  }, [selectedCourier, courierOrders, orderSearchTerm, excelData?.routes])

  const getAvailableSize = useCallback((index: number) => {
    const order = availableOrders[index]
    return (order && availableSizeMap.current[order.id]) || 120
  }, [availableOrders])

  const setInRouteSize = useCallback((id: string, index: number, size: number) => {
    const next = size + ROW_GAP
    if (inRouteSizeMap.current[id] !== next) {
      inRouteSizeMap.current[id] = next
      inRouteListRef.current?.resetAfterIndex(index)
    }
  }, [])

  const getInRouteSize = useCallback((index: number) => {
    const order = ordersInRoutes[index]
    return (order && inRouteSizeMap.current[order.id]) || 120
  }, [ordersInRoutes])

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
    setSize: (id: string, index: number, size: number) => void
  }> = ({ index, style, order, isSelected, selectionOrder, isInRoute, onSelect, onMoveUp, onMoveDown, setSize }) => {
    const rowRef = useRef<HTMLDivElement>(null)

    useLayoutEffect(() => {
      if (!rowRef.current) return
      const el = rowRef.current
      const measure = () => setSize(order.id, index, el.getBoundingClientRect().height)
      measure()
      const ro = new ResizeObserver(measure)
      ro.observe(el)
      return () => ro.disconnect()
    }, [index, order.id, setSize])

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

    // Если выбирали через поиск — очищаем строку немедленно
    if (orderSearchTerm) {
      setOrderSearchTerm('')
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
  }, [selectedCourier, isOrderInExistingRoute, orderSearchTerm])

  // Функции для изменения порядка выбранных заказов
  const moveOrderUp = useCallback((orderId: string) => {
    const currentIndex = selectedOrdersOrder.indexOf(orderId)
    if (currentIndex > 0) {
      const newOrder = [...selectedOrdersOrder]
        ;[newOrder[currentIndex - 1], newOrder[currentIndex]] = [newOrder[currentIndex], newOrder[currentIndex - 1]]
      // На всякий случай устраняем дубликаты
      const seen = new Set<string>()
      setSelectedOrdersOrder(newOrder.filter(id => (seen.has(id) ? false : (seen.add(id), true))))
    }
  }, [selectedOrdersOrder])

  const moveOrderDown = useCallback((orderId: string) => {
    const currentIndex = selectedOrdersOrder.indexOf(orderId)
    if (currentIndex < selectedOrdersOrder.length - 1) {
      const newOrder = [...selectedOrdersOrder]
        ;[newOrder[currentIndex], newOrder[currentIndex + 1]] = [newOrder[currentIndex + 1], newOrder[currentIndex]]
      const seen = new Set<string>()
      setSelectedOrdersOrder(newOrder.filter(id => (seen.has(id) ? false : (seen.add(id), true))))
    }
  }, [selectedOrdersOrder])

  // При виртуализации ручная подгрузка не требуется; функция удалена

  const createRoute = async (ordersOverride?: Order[] | any, courierOverride?: string) => {
    // Если вызвано из onClick, первый аргумент - объект события
    const isEvent = ordersOverride && (ordersOverride.nativeEvent || ordersOverride._reactName);
    const actualOrders = isEvent ? undefined : (ordersOverride as Order[]);

    const courier = courierOverride || selectedCourier;
    if (!courier || courier === 'Не назначен') return

    // Требуем выбранный город в настройках
    {
      const settings = localStorageUtils.getAllSettings()
      const cityBias = settings.cityBias || ''
      if (!cityBias) {
        alert('Выберите город во вкладке Настройки (Город для маршрутов). Без выбранного города создание маршрута запрещено.')
        return
      }
    }

    // Создаем список заказов
    let selectedOrdersList: Order[] = []
    let ordersToDuplicateCheck: Set<string>

    if (actualOrders) {
      selectedOrdersList = actualOrders;
      ordersToDuplicateCheck = new Set(actualOrders.map(o => String(o.id)));
    } else {
      // Формируем уникальный список выбранных заказов в текущем порядке (из стейта)
      const seen = new Set<string>()
      const uniqueOrderIds = selectedOrdersOrder.filter(id => (seen.has(id) ? false : (seen.add(id), true)))
      selectedOrdersList = uniqueOrderIds
        .map(orderId => courierOrders[courier].find(order => order.id === orderId))
        .filter(order => order !== undefined) as Order[]
      ordersToDuplicateCheck = selectedOrders;
    }

    if (selectedOrdersList.length === 0) {
      alert('Выберите заказы для создания маршрута')
      return
    }

    // Проверяем на дубликаты
    if (isRouteDuplicate(courier, ordersToDuplicateCheck)) {
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
      courier: courier,
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
      routes: [...(prev?.routes || []), newRoute],
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
          try { variants.add(replaceTokens(base, from, to)) } catch { }
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
          } catch { }
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
            try { if (refPoint) d = window.google.maps.geometry.spherical.computeDistanceBetween(r.geometry.location, refPoint) } catch { }
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
              const prev = i === 0 ? (originRes?.geometry?.location || null) : (waypointResList[i - 1]?.geometry?.location || null)
              const fix = await geocodeInsideOnly(route.orders[i].address, prev)
              if (fix) waypointResList[i] = fix
            }
          }
          // destination
          if (destinationRes && !isInside(destinationRes.geometry.location)) {
            const prev = waypointResList.length > 0 ? (waypointResList[waypointResList.length - 1]?.geometry?.location || null) : (originRes?.geometry?.location || null)
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


  // Функция для открытия модального окна редактирования адреса
  const handleEditAddress = (order: Order) => {
    setEditingOrder(order)
    setShowAddressEditModal(true)
  }

  // Функция для перехода к группе заказов
  const handleJumpToGroup = (group: TimeWindowGroup) => {
    if (!availableListRef.current) return
    const firstOrderId = group.orders[0]?.id
    if (!firstOrderId) return

    const index = availableOrders.findIndex(o => o.id === firstOrderId)
    if (index !== -1) {
      availableListRef.current.scrollToItem(index, 'start')
      // Визуальная подсветка или тост (опционально)
      toast.success(`Переход к группе: ${group.windowLabel}`, {
        icon: '🎯',
        duration: 2000
      })
    }
  }


  // Функция для перемещения заказа в другую временную группу ( Phase 4.7 )
  const handleMoveOrderToGroup = (orderId: string, targetGroup: TimeWindowGroup) => {
    updateExcelData((prev: any) => {
      if (!prev) return prev;

      // 1. Обновляем метаданные в списке всех заказов
      const updatedAllOrders = (prev.orders || []).map((order: any) => {
        if (order.id === orderId) {
          return {
            ...order,
            manualGroupId: targetGroup.id,
            plannedTime: targetGroup.windowStart,
            courier: targetGroup.courierName
          };
        }
        return order;
      });

      // 2. Если заказ был в каком-то маршруте, удаляем его оттуда
      const updatedRoutes = (prev.routes || []).map((route: any) => {
        const hasOrder = route.orders.some((o: any) => o.id === orderId);
        if (!hasOrder) return route;

        return {
          ...route,
          orders: route.orders.filter((o: any) => o.id !== orderId),
          isOptimized: false,
          totalDistance: 0,
          totalDuration: 0
        };
      }).filter((route: any) => route.orders.length > 0);

      return {
        ...prev,
        orders: updatedAllOrders,
        routes: updatedRoutes
      };
    });

    toast.success(`Заказ перемещен в ${targetGroup.windowLabel}`, { icon: '🚚' });
  }

  // Функция для сохранения измененного адреса
  const handleAddressUpdate = (newAddress: string) => {
    if (!editingOrder) return

    // Обновляем только маршруты, содержащие этот заказ
    updateExcelData({
      ...(excelData || { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: undefined }),
      routes: (excelData?.routes || []).map((route: Route) => {
        const orderIndex = route.orders.findIndex((order: Order) => order.id === editingOrder.id)
        if (orderIndex !== -1) {
          const updatedRouteOrders = [...route.orders]
          updatedRouteOrders[orderIndex] = { ...editingOrder, address: newAddress }
          return {
            ...route,
            orders: updatedRouteOrders,
            isOptimized: false,
            totalDistance: 0,
            totalDuration: 0
          }
        }
        return route
      }),
      orders: (excelData?.orders || []).map((order: any) =>
        order.id === editingOrder.id ? { ...order, address: newAddress } : order
      )
    })

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
      'ROOFTOP': 'Точный адрес до метра',
      'RANGE_INTERPOLATED': 'Интерполированный',
      'GEOMETRIC_CENTER': 'Геометрический центр улицы',
      'APPROXIMATE': 'Приблизительный',
      'UNKNOWN': 'Неизвестный, взят по соседней'
    }
    return translations[locationType] || locationType
  }




  const handleDeleteRoute = () => {
    if (routeToDelete) {
      updateExcelData(prev => ({
        ...prev,
        routes: (prev.routes || []).filter(r => r.id !== routeToDelete.id)
      }))
      setRouteToDelete(null)
      setShowDeleteModal(false)
    }
  }


  // Обработчик разрешения неоднозначности (выбор варианта)
  const handleDisambiguationResolve = (choice: any | null) => {
    if (disambResolver.current) {
      disambResolver.current(choice)
      disambResolver.current = undefined
    }
    setDisambModal(null)
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

      {/* Основная рабочая область: Сайдбар + Дашборд */}
      <div className="flex flex-col lg:flex-row gap-8 items-start mb-12 relative min-h-[100px]">
        {/* Левая панель: Выбор курьера */}
        <div className="w-full lg:w-[420px] lg:sticky lg:top-8 animate-in slide-in-from-left-8 duration-700" data-tour="courier-select">
          <div className={clsx(
            'rounded-3xl shadow-xl border-2 p-6 overflow-hidden relative',
            isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100 shadow-blue-500/5'
          )}>
            {/* Декоративный фон для сайдбара */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -mr-16 -mt-16 blur-2xl opacity-50"></div>

            <div className="relative z-10 flex flex-col h-full">
              <div className="flex items-center justify-between mb-6">
                <h2 className={clsx(
                  'text-xl font-black tracking-tight',
                  isDark ? 'text-gray-100' : 'text-gray-900'
                )}>Курьеры</h2>
                <div className="flex bg-gray-100 dark:bg-gray-700/50 p-1 rounded-xl">
                  {['all', 'car', 'moto'].map((f) => (
                    <button
                      key={f}
                      onClick={() => setCourierFilter(f as any)}
                      className={clsx(
                        'px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all',
                        courierFilter === f
                          ? (isDark ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-white text-blue-600 shadow-md')
                          : (isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-800')
                      )}
                    >
                      {f === 'all' ? 'Все' : f === 'car' ? 'Авто' : 'Мото'}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="space-y-1 pr-2 max-h-[70vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700"
                data-tour="courier-select"
              >
                {filteredCouriers.length === 0 ? (
                  <div className="text-center py-10">
                    <TruckIcon className="w-10 h-10 mx-auto text-gray-300 mb-2 opacity-50" />
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Нет курьеров</p>
                  </div>
                ) : (
                  filteredCouriers.map((name) => (
                    <CourierListItem
                      key={name}
                      courierName={name}
                      vehicleType={getCourierVehicleType(name)}
                      isSelected={selectedCourier === name}
                      onSelect={handleCourierSelect}
                      availableOrdersCount={getAvailableOrdersCount(name)}
                      isDark={isDark}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Основной контент (Дашборд заказов) */}
        <div className="flex-1 min-w-0 w-full">
          {!selectedCourier ? (
            <div className={clsx(
              "flex flex-col items-center justify-center p-12 lg:p-24 rounded-[3rem] border-4 border-dashed transition-colors duration-500",
              isDark ? "bg-gray-800/20 border-gray-700/50" : "bg-gray-50 border-gray-200"
            )}>
              <div className={clsx(
                "w-24 h-24 rounded-3xl flex items-center justify-center mb-6",
                isDark ? "bg-gray-800 shadow-inner" : "bg-white shadow-xl"
              )}>
                <TruckIcon className={clsx("w-12 h-12", isDark ? "text-gray-600" : "text-gray-300")} />
              </div>
              <h3 className={clsx("text-2xl font-black mb-2", isDark ? "text-gray-600" : "text-gray-400")}>
                Выберите курьера
              </h3>
              <p className={clsx("text-sm max-w-xs text-center font-medium", isDark ? "text-gray-700" : "text-gray-500")}>
                Нажмите на курьера слева, чтобы начать распределение заказов и формирование маршрута
              </p>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

              {/* Хедер выбранного курьера */}
              <div className={clsx(
                'rounded-3xl p-8 border-2 shadow-2xl relative overflow-hidden',
                isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-blue-100 shadow-blue-500/5'
              )}>
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full -mr-32 -mt-32 blur-3xl opacity-50 lg:visible invisible"></div>

                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  <div className="flex items-center gap-6">
                    <div className={clsx(
                      "w-20 h-20 rounded-2xl flex items-center justify-center shadow-xl transition-transform hover:scale-110",
                      isDark ? "bg-blue-600/20 text-blue-400 shadow-blue-900/20" : "bg-blue-600 text-white shadow-blue-500/30"
                    )}>
                      <InboxIcon className="w-10 h-10" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h2 className={clsx('text-3xl font-black tracking-tight', isDark ? 'text-white' : 'text-gray-900')}>
                          {selectedCourier}
                        </h2>
                        <div className={clsx(
                          "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1",
                          isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700"
                        )}>
                          {getCourierVehicleType(selectedCourier) === 'moto' ? (
                            <TruckIcon className="w-3 h-3" />
                          ) : (
                            <TruckIcon className="w-3 h-3" />
                          )}
                          <span>{getCourierVehicleType(selectedCourier) === 'moto' ? 'MOTO' : 'AUTO'}</span>
                        </div>
                      </div>
                      <p className={clsx('text-lg font-bold opacity-60', isDark ? 'text-gray-400' : 'text-gray-500')}>
                        {availableOrders.length} заказов доступно для распределения
                      </p>
                    </div>
                  </div>

                </div>

              </div>

              {/* Смарт-группы и Список ручного выбора */}
              <div className="space-y-6">
                {/* Смарт-группы в виде горизонтальной ленты */}
                <div className={clsx(
                  "rounded-3xl p-6 border-2 transition-all",
                  isDark ? "bg-gray-800/40 border-gray-700 hover:border-gray-600" : "bg-white shadow-blue-500/5 border-blue-50 hover:border-blue-100"
                )}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={clsx("p-2 rounded-xl", isDark ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-600")}>
                      <ClockIcon className="w-5 h-5" />
                    </div>
                    <h4 className={clsx("text-sm font-black uppercase tracking-widest", isDark ? "text-gray-300" : "text-gray-700")}>
                      Сгруппировано по времени
                    </h4>
                  </div>

                  <CourierTimeWindows
                    courierId={selectedCourier}
                    courierName={selectedCourier}
                    orders={availableOrders}
                    isDark={isDark}
                    onJumpToGroup={handleJumpToGroup}
                    onOrderMoved={handleMoveOrderToGroup}
                    onCalculateRoute={async (group) => {
                      const groupOrderIds = group.orders.map(o => o.id);
                      setSelectedOrders(new Set(groupOrderIds));
                      setSelectedOrdersOrder(groupOrderIds);
                      // Автоматически создаем маршрут сразу без уведомления
                      createRoute();
                    }}
                  />
                </div>

                {/* Список ручного выбора (на всю ширину) */}
                <div className="flex flex-col gap-6" data-tour="order-select">
                  <div className={clsx(
                    "rounded-[3rem] p-10 border-2 shadow-2xl relative overflow-hidden",
                    isDark ? "bg-gray-800 border-gray-700 shadow-black/40" : "bg-white border-blue-50 shadow-blue-500/5"
                  )}>
                    {/* Декоративный фон для списка заказов */}
                    <div className="absolute top-0 left-0 w-64 h-64 bg-blue-500/5 rounded-full -ml-32 -mt-32 blur-3xl opacity-30"></div>

                    <div className="relative z-10">
                      <div className="flex flex-col gap-6 mb-10">
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col gap-1">
                            <h4 className={clsx('text-3xl font-black mb-1 tracking-tight', isDark ? 'text-white' : 'text-gray-900')}>
                              Доступные заказы
                            </h4>
                            <p className={clsx('text-sm font-bold opacity-40 uppercase tracking-[0.2em]', isDark ? 'text-gray-400' : 'text-gray-500')}>
                              Нажмите на заказ для выбора в маршрут
                            </p>
                          </div>

                          <button
                            onClick={() => createRoute()}
                            disabled={availableOrders.length === 0 || isCalculating || selectedOrders.size === 0}
                            className={clsx(
                              "px-6 py-3 rounded-2xl font-black text-sm transition-all shadow-lg flex items-center gap-2 shrink-0 uppercase tracking-widest",
                              selectedOrders.size > 0
                                ? (isDark ? "bg-blue-600 text-white shadow-blue-900/40 hover:bg-blue-500" : "bg-blue-600 text-white shadow-blue-500/30 hover:bg-blue-700")
                                : (isDark ? "bg-gray-700 text-gray-500 cursor-not-allowed" : "bg-gray-100 text-gray-400 cursor-not-allowed")
                            )}
                          >
                            {isCalculating ? (
                              <ArrowPathIcon className="h-5 w-5 animate-spin" />
                            ) : (
                              <PlusIcon className="h-5 w-5" />
                            )}
                            <span>Маршрут {selectedOrders.size > 0 && `(${selectedOrders.size})`}</span>
                          </button>
                        </div>

                        {/* Поиск на всю ширину */}
                        <div className="relative group">
                          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <InboxIcon className={clsx("h-5 w-5 transition-colors", isDark ? "text-gray-600 group-focus-within:text-blue-400" : "text-gray-300 group-focus-within:text-blue-500")} />
                          </div>
                          <input
                            type="text"
                            placeholder="Поиск по номеру, адресу или имени..."
                            value={orderSearchTerm}
                            onChange={(e) => setOrderSearchTerm(e.target.value)}
                            className={clsx(
                              "block w-full pl-12 pr-4 py-4 rounded-2xl text-base font-medium transition-all outline-none border-2",
                              isDark
                                ? "bg-gray-900 border-gray-700 focus:border-blue-500 text-white placeholder-gray-600"
                                : "bg-gray-50 border-gray-100 focus:border-blue-400 text-gray-900 placeholder-gray-300 shadow-inner"
                            )}
                          />
                        </div>
                      </div>

                      <div className="h-[600px] w-full" data-tour="order-list">
                        {availableOrders.length > 0 ? (
                          <div className="animate-in fade-in duration-700">
                            <div style={{ height: 600 }}>
                              <List
                                ref={availableListRef as any}
                                height={600}
                                itemCount={availableOrders.length}
                                itemSize={getAvailableSize}
                                width={'100%'}
                                className="scrollbar-hide"
                              >
                                {({ index, style }) => {
                                  const order = availableOrders[index]
                                  const selectionOrder = selectedOrdersOrder.indexOf(order.id) + 1
                                  return (
                                    <MeasuredRow
                                      index={index}
                                      style={style}
                                      order={order}
                                      isSelected={selectedOrders.has(order.id)}
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
                        ) : (
                          <div className="text-center py-20 opacity-30 italic">Список пуст</div>
                        )}

                        {ordersInRoutes.length > 0 && (
                          <div className="mt-12 pt-12 border-t-4 border-dotted border-gray-100 dark:border-gray-700/50 opacity-60 grayscale scale-[0.98] origin-top transition-all hover:grayscale-0 hover:opacity-100">
                            <div className="flex items-center gap-3 mb-8 px-4">
                              <ClockIcon className="w-6 h-6 text-yellow-500" />
                              <span className={clsx("text-lg font-black uppercase tracking-widest", isDark ? "text-gray-400" : "text-gray-500")}>
                                Уже в маршрутах ({ordersInRoutes.length})
                              </span>
                            </div>
                            <div style={{ height: 300 }}>
                              <List
                                ref={inRouteListRef as any}
                                height={300}
                                itemCount={ordersInRoutes.length}
                                itemSize={getInRouteSize}
                                width={'100%'}
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
                                      onSelect={() => { }}
                                      onMoveUp={() => { }}
                                      onMoveDown={() => { }}
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
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Нижняя часть: Созданные маршруты */}
      <div className="mt-12 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
        <div className={clsx(
          'rounded-[3rem] shadow-2xl border-2 p-10 overflow-hidden relative',
          isDark ? 'bg-gray-800 border-gray-700 shadow-black/40' : 'bg-white border-blue-50 shadow-blue-500/5'
        )}>
          {/* Декоративный фон */}
          <div className="absolute top-0 left-0 w-96 h-96 bg-purple-500/5 rounded-full -ml-48 -mt-48 blur-3xl opacity-50"></div>

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-4">
                <div className={clsx(
                  "p-4 rounded-2xl flex items-center justify-center shadow-xl",
                  isDark ? "bg-purple-600/20 text-purple-400" : "bg-purple-600 text-white shadow-purple-500/30"
                )}>
                  <MapIcon className="w-8 h-8" />
                </div>
                <div>
                  <h2 className={clsx(
                    'text-3xl font-black tracking-tight',
                    isDark ? 'text-gray-100' : 'text-gray-900'
                  )}>Созданные маршруты</h2>
                  <p className={clsx('text-sm font-bold opacity-40 uppercase tracking-[0.2em]', isDark ? 'text-gray-400' : 'text-gray-500')}>
                    История и возможность редачить маршруты
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {(excelData?.routes?.length ?? 0) > 0 && (
                  <button
                    onClick={clearAllRoutes}
                    className={clsx(
                      'px-6 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-all border-2',
                      isDark
                        ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                        : 'border-red-100 text-red-600 hover:bg-red-50 hover:border-red-200 shadow-sm'
                    )}
                  >
                    Очистить все
                  </button>
                )}
              </div>
            </div>

            {(excelData?.routes?.length ?? 0) === 0 ? (
              <div className={clsx(
                "flex flex-col items-center justify-center py-20 rounded-[2rem] border-4 border-dotted",
                isDark ? "bg-gray-900/40 border-gray-700/50" : "bg-gray-50 border-gray-100"
              )}>
                <MapIcon className={clsx(
                  'h-20 w-20 mb-6 opacity-10',
                  isDark ? 'text-white' : 'text-black'
                )} />
                <p className={clsx(
                  'text-xl font-bold opacity-30',
                  isDark ? 'text-gray-400' : 'text-gray-500'
                )}>Маршруты еще не созданы</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-8" data-tour="route-list">
                {paginatedRoutes.map(route => {
                  const courierVehicle = getCourierVehicleType(route.courier);
                  const anomalyCheck = routeAnomalies.get(route.id);

                  return (
                    <div key={route.id} className={clsx(
                      'group rounded-[2.5rem] border-2 p-8 transition-all duration-500 relative overflow-hidden',
                      isDark
                        ? 'bg-gray-800/40 border-gray-700 hover:border-blue-500/50 hover:bg-gray-800/80 shadow-black/20'
                        : 'bg-white border-blue-50 shadow-blue-500/5 hover:shadow-2xl hover:border-blue-400'
                    )}>
                      {/* Линия-акцент */}
                      <div className={clsx(
                        "absolute top-0 left-0 w-2 h-full transition-all duration-500",
                        courierVehicle === 'car' ? "bg-green-500/50" : "bg-orange-500/50",
                        "group-hover:w-4"
                      )}></div>

                      <div className="flex flex-col lg:flex-row items-start justify-between gap-8 mb-8">
                        <div className="flex items-center gap-6">
                          <div className={clsx(
                            'w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110',
                            courierVehicle === 'car'
                              ? (isDark ? 'bg-green-600/20 text-green-400' : 'bg-green-600 text-white')
                              : (isDark ? 'bg-orange-600/20 text-orange-400' : 'bg-orange-600 text-white')
                          )}>
                            {courierVehicle === 'car' ? <TruckIcon className="w-8 h-8" /> : <TruckIcon className="w-8 h-8" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-3 mb-1">
                              <h3 className={clsx(
                                'text-2xl font-black tracking-tight',
                                isDark ? 'text-gray-100' : 'text-gray-900'
                              )}>{route.courier}</h3>
                              <span className={clsx(
                                'text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-widest',
                                courierVehicle === 'car'
                                  ? (isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700')
                                  : (isDark ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-700')
                              )}>
                                {courierVehicle === 'car' ? 'Car' : 'Moto'}
                              </span>
                            </div>
                            <p className={clsx(
                              'text-sm font-bold opacity-50 uppercase tracking-widest',
                              isDark ? 'text-gray-400' : 'text-gray-500'
                            )}>
                              {route.orders.length} заказов в списке
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 self-center lg:self-start">
                          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/30 p-2 rounded-2xl">
                            <button
                              onClick={() => route.isOptimized ? openRouteInGoogleMaps(route) : calculateRouteDistance(route)}
                              disabled={isCalculating}
                              className={clsx(
                                'p-3 rounded-xl transition-all hover:scale-110 active:scale-90',
                                isDark ? 'text-blue-400 hover:bg-blue-900/20' : 'text-blue-600 hover:bg-blue-50'
                              )}
                              title={route.isOptimized ? "Открыть в Google Maps" : "Рассчитать"}
                            >
                              <MapIcon className="h-6 w-6" />
                            </button>
                            <button
                              onClick={() => recalculateRoute(route)}
                              disabled={isCalculating}
                              className={clsx(
                                'p-3 rounded-xl transition-all hover:scale-110 active:scale-90',
                                isDark ? 'text-green-400 hover:bg-green-900/20' : 'text-green-600 hover:bg-green-50'
                              )}
                              title="Пересчитать"
                            >
                              <ArrowPathIcon className="h-6 w-6" />
                            </button>
                            <div className="w-px h-6 bg-gray-200 dark:bg-gray-600 mx-1"></div>
                            <button
                              onClick={() => deleteRoute(route.id)}
                              className={clsx(
                                'p-3 rounded-xl transition-all hover:scale-110 active:scale-90',
                                isDark ? 'text-red-400 hover:bg-red-900/20' : 'text-red-600 hover:bg-red-50'
                              )}
                              title="Удалить"
                            >
                              <TrashIcon className="h-6 w-6" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {route.orders.map((order: Order, index: number) => {
                          const meta = (route as any).geoMeta?.waypoints?.[index]
                          const metaBadge = meta ? (
                            <div className="mt-2 flex items-center flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
                              <span className={clsx(
                                'px-2 py-0.5 rounded-lg border',
                                meta.locationType === 'ROOFTOP'
                                  ? (isDark ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-green-50 text-green-700 border-green-200')
                                  : meta.locationType === 'RANGE_INTERPOLATED'
                                    ? (isDark ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 'bg-yellow-50 text-yellow-700 border-yellow-200')
                                    : (isDark ? 'bg-gray-700 text-gray-400 border-gray-600' : 'bg-gray-50 text-gray-600 border-gray-200')
                              )}>{translateLocationType(meta.locationType)}</span>
                              {typeof meta.streetNumberMatched === 'boolean' && (
                                <span className={clsx(
                                  'px-2 py-0.5 rounded-lg border',
                                  meta.streetNumberMatched
                                    ? (isDark ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-blue-50 text-blue-700 border-blue-200')
                                    : (isDark ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-red-50 text-red-700 border-red-200')
                                )}>
                                  {meta.streetNumberMatched ? '✓ Найден номер дома' : '✗ Не нашел номера дома'}
                                </span>
                              )}
                            </div>
                          ) : null

                          const hasAddressIssues = anomalyCheck?.errors.some(error =>
                            error.includes('адрес') || error.includes('адресов')
                          )

                          return (
                            <div
                              key={order.id}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData('orderId', order.id);
                                e.dataTransfer.effectAllowed = 'move';
                              }}
                              className={clsx(
                                "flex items-start justify-between p-4 rounded-2xl transition-all duration-300",
                                isDark ? "hover:bg-gray-700/30" : "hover:bg-gray-50",
                                "cursor-grab active:cursor-grabbing"
                              )}
                            >
                              <div className="flex items-start gap-4 flex-1">
                                <span className={clsx(
                                  'w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shadow-inner flex-shrink-0',
                                  isDark
                                    ? 'bg-gray-700 text-blue-400'
                                    : 'bg-white text-blue-600 border border-blue-100'
                                )}>
                                  {index + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center flex-wrap gap-2 mb-1">
                                    <span className={clsx(
                                      'font-black text-sm tracking-tight',
                                      isDark ? 'text-gray-100' : 'text-gray-900'
                                    )}>#{order.orderNumber}</span>
                                    {order.plannedTime && (
                                      <span className={clsx(
                                        'px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider',
                                        isDark ? 'bg-purple-600/20 text-purple-300' : 'bg-purple-50 text-purple-700 border border-purple-100'
                                      )}>
                                        {order.plannedTime}
                                      </span>
                                    )}
                                    {order.paymentMethod && (() => {
                                      const badgeProps = getPaymentMethodBadgeProps(order.paymentMethod, isDark)
                                      return (
                                        <span className={clsx('px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider', badgeProps.bgColorClass, badgeProps.textColorClass)}>
                                          {badgeProps.text}
                                        </span>
                                      )
                                    })()}
                                  </div>
                                  <div className={clsx(
                                    'truncate text-sm font-medium',
                                    isDark ? 'text-gray-400' : 'text-gray-600',
                                    hasAddressIssues && 'text-red-500 animate-pulse'
                                  )} title={order.address}>{order.address}</div>
                                  {metaBadge}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 pl-4">
                                <button
                                  onClick={() => handleEditAddress(order)}
                                  className={clsx(
                                    'p-2 rounded-xl transition-all hover:scale-110 active:scale-90',
                                    isDark
                                      ? 'text-gray-400 hover:text-blue-400 hover:bg-blue-900/20'
                                      : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'
                                  )}
                                  title="Редактировать адрес"
                                >
                                  <PencilIcon className="h-4 w-4" />
                                </button>
                                {hasAddressIssues && (
                                  <ExclamationTriangleIcon className="h-5 w-5 text-red-500 animate-bounce" title="Проблемы с адресом" />
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Метрики маршрута */}
                      <div className="mt-8 pt-8 border-t border-gray-100 dark:border-gray-700/50">
                        {route.totalDistance || route.totalDuration ? (
                          <div className="flex flex-wrap items-center gap-6">
                            <div className={clsx(
                              "flex items-center gap-3 px-4 py-2 rounded-2xl",
                              isDark ? "bg-blue-500/10 text-blue-300" : "bg-blue-50 text-blue-700"
                            )}>
                              <MapIcon className="w-5 h-5" />
                              <span className="text-sm font-black tracking-tight">{formatDistance(route.totalDistance || 0)}</span>
                            </div>
                            <div className={clsx(
                              "flex items-center gap-3 px-4 py-2 rounded-2xl",
                              isDark ? "bg-purple-500/10 text-purple-300" : "bg-purple-50 text-purple-700"
                            )}>
                              <ClockIcon className="w-5 h-5" />
                              <span className="text-sm font-black tracking-tight">{formatDuration(route.totalDuration || 0)}</span>
                            </div>
                            {route.isOptimized && (
                              <div className={clsx(
                                "flex items-center gap-2 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest",
                                isDark ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-green-50 text-green-700 border border-green-100 shadow-sm"
                              )}>
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                                Оптимизирован
                              </div>
                            )}

                            {anomalyCheck && (
                              <div className="flex flex-wrap gap-2 ml-auto">
                                {anomalyCheck.errors.length > 0 && (
                                  <div className={clsx(
                                    "flex items-center gap-2 px-4 py-2 rounded-2xl bg-red-500/10 text-red-500 border border-red-500/20"
                                  )}>
                                    <ExclamationCircleIcon className="w-4 h-4" />
                                    <span className="text-xs font-black uppercase tracking-wider">{anomalyCheck.errors.length} Ошибок</span>
                                  </div>
                                )}
                                {anomalyCheck.warnings.length > 0 && (
                                  <div className={clsx(
                                    "flex items-center gap-2 px-4 py-2 rounded-2xl bg-yellow-500/10 text-yellow-500 border border-yellow-500/20"
                                  )}>
                                    <ExclamationTriangleIcon className="w-4 h-4" />
                                    <span className="text-xs font-black uppercase tracking-wider">{anomalyCheck.warnings.length} Предупр.</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className={clsx(
                            'text-sm font-bold opacity-30 italic flex items-center gap-2',
                            isDark ? 'text-gray-400' : 'text-gray-500'
                          )}>
                            <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                            {isCalculating ? 'Расчет расстояния...' : 'Расстояние не рассчитано'}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Пагинация */}
            {totalRoutePages > 1 && (
              <div className="mt-8 flex items-center justify-between px-4">
                <button
                  onClick={() => setRoutePage(Math.max(0, routePage - 1))}
                  disabled={routePage === 0}
                  className={clsx(
                    'px-6 py-2 rounded-xl text-sm font-black uppercase tracking-widest transition-all disabled:opacity-30',
                    isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  )}
                >
                  ← Назад
                </button>
                <span className={clsx(
                  'text-sm font-black uppercase tracking-[0.2em]',
                  isDark ? 'text-gray-500' : 'text-gray-400'
                )}>
                  {routePage + 1} / {totalRoutePages}
                </span>
                <button
                  onClick={() => setRoutePage(Math.min(totalRoutePages - 1, routePage + 1))}
                  disabled={routePage >= totalRoutePages - 1}
                  className={clsx(
                    'px-6 py-2 rounded-xl text-sm font-black uppercase tracking-widest transition-all disabled:opacity-30',
                    isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  )}
                >
                  Вперед →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Модальные окна */}
      {
        showDeleteModal && routeToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className={clsx(
              'w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl transform animate-in zoom-in-95 duration-300',
              isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white'
            )}>
              <div className="text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-red-100 dark:bg-red-900/20 mb-6 shadow-inner">
                  <TrashIcon className="h-10 w-10 text-red-600" />
                </div>
                <h3 className={clsx("text-2xl font-black mb-2 tracking-tight", isDark ? "text-white" : "text-gray-900")}>
                  Удалить маршрут?
                </h3>
                <p className={clsx("text-sm mb-8 font-medium", isDark ? "text-gray-400" : "text-gray-500")}>
                  Это действие безвозвратно удалит маршрут. Заказы станут снова доступны для распределения.
                </p>
                <div className="flex gap-4">
                  <button
                    type="button"
                    className={clsx(
                      "flex-1 px-6 py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all",
                      isDark ? "bg-gray-700 text-gray-300 hover:bg-gray-600" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    )}
                    onClick={() => setShowDeleteModal(false)}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="flex-1 px-6 py-4 rounded-2xl text-sm font-black uppercase tracking-widest bg-red-600 text-white hover:bg-red-700 transition-all shadow-xl shadow-red-600/30 active:scale-95"
                    onClick={handleDeleteRoute}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {
        showAddressEditModal && editingOrder && (
          <AddressEditModal
            isOpen={showAddressEditModal}
            onClose={() => {
              setShowAddressEditModal(false)
              setEditingOrder(null)
            }}
            onSave={(newAddress) => handleAddressUpdate(newAddress)}
            currentAddress={editingOrder.address}
            orderNumber={editingOrder.orderNumber}
            customerName={editingOrder.customerName}
            isDark={isDark}
          />
        )
      }

      {
        disambModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className={clsx(
              'w-full max-w-lg rounded-[2.5rem] p-10 shadow-2xl transform animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto',
              isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white'
            )}>
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-2xl">
                  <MapPinIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className={clsx("text-2xl font-black tracking-tight", isDark ? "text-white" : "text-gray-900")}>
                    Уточните адрес
                  </h3>
                  <p className={clsx("text-sm font-bold opacity-50 uppercase tracking-widest", isDark ? "text-gray-400" : "text-gray-500")}>
                    Найдены неоднозначности
                  </p>
                </div>
              </div>

              <p className={clsx("text-sm mb-6 leading-relaxed", isDark ? "text-gray-400" : "text-gray-600")}>
                {disambModal.title}
              </p>

              <div className="space-y-3 mb-8">
                {disambModal.options.map((option, idx) => (
                  <button
                    key={idx}
                    className={clsx(
                      "w-full text-left p-5 rounded-3xl border-2 transition-all hover:scale-[1.02] shadow-sm hover:shadow-md",
                      isDark
                        ? "bg-gray-700/50 border-gray-600 hover:border-blue-500/50 hover:bg-gray-700 text-gray-200"
                        : "bg-gray-50 border-gray-100 hover:bg-blue-50 hover:border-blue-300 text-gray-800 shadow-blue-500/5"
                    )}
                    onClick={() => handleDisambiguationResolve(option.res)}
                  >
                    <div className="font-black text-lg mb-1">{option.label}</div>
                    {option.distanceMeters !== undefined && (
                      <div className={clsx("text-xs font-bold opacity-60 uppercase", isDark ? "text-blue-400" : "text-blue-600")}>
                        Дистанция: {Math.round(option.distanceMeters)} м
                      </div>
                    )}
                  </button>
                ))}
                <button
                  className={clsx(
                    "w-full text-center p-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all mt-4",
                    isDark ? "text-gray-500 hover:text-white" : "text-gray-400 hover:text-gray-900"
                  )}
                  onClick={() => handleDisambiguationResolve(null)}
                >
                  Пропустить / Не использовать
                </button>
              </div>
            </div>
          </div>
        )
      }

      {
        showHelpModal && (
          <Suspense fallback={null}>
            <HelpModalRoutes
              isOpen={showHelpModal}
              onClose={() => {
                setShowHelpModal(false)
                localStorage.setItem('km_routes_has_seen_help', 'true')
                setHasSeenHelp(true)
              }}
              onStartTour={() => {
                setShowHelpModal(false)
                setTimeout(() => setShowHelpTour(true), 300)
              }}
            />
          </Suspense>
        )
      }

      {
        showHelpTour && (
          <Suspense fallback={null}>
            <HelpTour
              isOpen={showHelpTour}
              onClose={() => {
                setShowHelpTour(false)
                localStorage.setItem('km_routes_has_seen_help', 'true')
                setHasSeenHelp(true)
              }}
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
⚠️ Заказы, уже находящиеся в других маршрутах, нельзя выбрать.`,
                  target: '[data-tour="order-select"]',
                  position: 'left'
                },
                {
                  id: 'create-route',
                  title: '🚀 Создание маршрута',
                  content: `🚀 После выбора заказов нажмите кнопку "Создать маршрут".
⚙️ Что происходит:
1. Система создает новый маршрут
2. Автоматически рассчитывает расстояние
3. Маршрут появляется в списке внизу`,
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
🗑️ Удалить - удалить маршрут`,
                  target: '[data-tour="route-list"]',
                  position: 'top'
                }
              ]}
            />
          </Suspense>
        )
      }


    </div >
  )
}
