import React, { useState, useEffect, useMemo, useCallback, memo, useDeferredValue } from 'react'
import { OrderList } from './OrderList'
import {
  TruckIcon,
  MapIcon,
  QuestionMarkCircleIcon,
  InboxIcon,
  ClockIcon,
  ArrowPathIcon,
  PlusIcon,
  CheckBadgeIcon,
  TrashIcon,
  PencilIcon,
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline'
import { localStorageUtils } from '../../utils/ui/localStorage'
import { cleanAddress, } from '../../utils/data/addressUtils'
import { googleMapsLoader } from '../../utils/maps/googleMapsLoader'
import { useExcelData } from '../../contexts/ExcelDataContext'
import { useTheme } from '../../contexts/ThemeContext'
import { clsx } from 'clsx'
import { AddressEditModal } from '../modals/AddressEditModal'
import { AddressValidationService, RouteAnomalyCheck } from '../../services/addressValidation'
import { getPaymentMethodBadgeProps } from '../../utils/data/paymentMethodHelper'
import { toast } from 'react-hot-toast'
import { Tooltip } from '../shared/Tooltip'
import { lazy, Suspense } from 'react'
import { CourierTimeWindows } from './CourierTimeWindows'
import { GridOrderCard } from './GridOrderCard'
import { type TimeWindowGroup, groupOrdersByTimeWindow, formatTimeLabel } from '../../utils/route/routeCalculationHelpers'
import { isId0CourierName, normalizeCourierName } from '../../utils/data/courierName'
import { getReturnETA, getAccurateReturnETA, getCourierSpeed, enrichRoutesWithCoords } from '../../utils/routes/courierETA'
import { ReturningCouriersModal } from './modals/ReturningCouriersModal'
import { TransitCouriersModal } from './modals/TransitCouriersModal'
import { calculateDistance } from '../../utils/geoUtils'

const formatDisplayDistance = (meters?: number) => {
  if (meters === undefined) return undefined;
  if (meters < 1000) return `${Math.round(meters)} м`;
  return `${(meters / 1000).toFixed(1)} км`;
};

// --- Hooks ---

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

import { Route, Order } from '../../types/route'
import { useRouteGeocoding } from '../../hooks/useRouteGeocoding'
import { useBackgroundGeocoder } from '../../hooks/useBackgroundGeocoder'
import { useKmlData } from '../../hooks/useKmlData'

interface RouteManagementProps {
  excelData?: any
}


const CourierListItem = memo(({
  courierName,
  vehicleType,
  isSelected,
  onSelect,
  availableOrdersCount,
  deliveredOrdersCount,
  totalOrdersCount,
  isDark
}: {
  courierName: string
  vehicleType: string
  isSelected: boolean
  onSelect: (name: string) => void
  availableOrdersCount: number
  deliveredOrdersCount: number
  totalOrdersCount: number
  isDark: boolean
}) => {
  const isUnassigned = courierName === 'Не назначено' || isId0CourierName(courierName)
  const progress = totalOrdersCount > 0 ? (deliveredOrdersCount / totalOrdersCount) * 100 : 0
  const isFinished = totalOrdersCount > 0 && deliveredOrdersCount === totalOrdersCount
  const remaining = totalOrdersCount - deliveredOrdersCount
  const isReturning = totalOrdersCount > 0 && deliveredOrdersCount > 0 && remaining > 0 && remaining <= 2
  const isOnRoute = totalOrdersCount > 0 && (deliveredOrdersCount === 0 || remaining > 2) && deliveredOrdersCount < totalOrdersCount

  if (isUnassigned) {
    return (
      <div className="group/item relative mb-2">
        <button
          onClick={() => onSelect(courierName)}
          className={clsx(
            'w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 transform',
            'relative overflow-hidden',
            isSelected
              ? (isDark
                ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-500/10'
                : 'bg-blue-50/80 border-blue-500 shadow-md shadow-blue-500/5')
              : (isDark
                ? 'bg-blue-500/5 border-blue-500/20 hover:border-blue-500/40'
                : 'bg-blue-50/30 border-blue-100 hover:border-blue-300')
          )}
        >
          <div className="flex items-center gap-4 relative z-10">
            <div className={clsx(
              'w-12 h-12 rounded-xl flex flex-shrink-0 items-center justify-center transition-colors',
              isSelected
                ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
                : (isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600')
            )}>
              <TruckIcon className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <span className={clsx(
                'text-base font-black',
                isSelected
                  ? (isDark ? 'text-white' : 'text-blue-900')
                  : (isDark ? 'text-blue-300' : 'text-blue-700')
              )}>
                Не назначено
              </span>
              <span className={clsx(
                'text-[11px] font-bold mt-0.5',
                isDark ? 'text-blue-400/60' : 'text-blue-600/60'
              )}>
                {totalOrdersCount} заказов
              </span>
            </div>
          </div>
        </button>
      </div>
    )
  }

  return (
    <div className="group/item relative">
      <button
        onClick={() => onSelect(courierName)}
        className={clsx(
          'w-full text-left p-3 rounded-xl border-2 transition-all duration-200 transform mb-2',
          'relative overflow-hidden',
          isSelected
            ? (isDark
              ? 'bg-blue-600/10 border-blue-500 shadow-lg shadow-blue-500/10'
              : 'bg-[#f0f7ff] border-blue-500 shadow-md shadow-blue-500/5')
            : isReturning
              ? (isDark
                ? 'bg-purple-500/10 border-purple-500/30 shadow-lg shadow-purple-500/5'
                : 'bg-purple-50 border-purple-200 shadow-md shadow-purple-500/5')
              : isUnassigned
                ? (isDark
                  ? 'bg-amber-500/10 border-amber-500/30'
                  : 'bg-amber-50 border-amber-200')
                : (isDark
                  ? 'bg-black/20 border-white/[0.03] hover:border-white/10 opacity-70 hover:opacity-100'
                  : 'bg-white border-gray-100/80 hover:border-blue-200 shadow-sm opacity-60 hover:opacity-100')
        )}
      >
        <div className="flex items-center gap-3.5 relative z-10">
          <div className="relative shrink-0">
            <div className={clsx(
              'w-10 h-10 rounded-xl flex items-center justify-center transition-colors',
              isSelected
                ? 'bg-blue-600 text-white'
                : isUnassigned
                  ? (isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-600')
                  : vehicleType === 'car'
                    ? (isDark ? 'bg-green-600/20 text-green-400' : 'bg-green-100 text-green-600')
                    : (isDark ? 'bg-orange-600/20 text-orange-400' : 'bg-orange-100 text-orange-600')
            )}>
              <TruckIcon className="w-5 h-5" />
            </div>
            {(isOnRoute || isReturning || isFinished) && (
              <div className={clsx(
                'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2',
                isDark ? 'border-gray-800' : 'border-white',
                isFinished ? 'bg-green-500' : isReturning ? 'bg-purple-500' : 'bg-blue-500'
              )} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className={clsx(
                    'text-sm font-black truncate leading-tight',
                    isSelected
                      ? (isDark ? 'text-blue-100' : 'text-blue-700')
                      : isUnassigned
                        ? (isDark ? 'text-amber-200' : 'text-amber-700')
                        : (isDark ? 'text-gray-200' : 'text-gray-800')
                  )}>
                    {courierName}
                  </h4>
                  {vehicleType !== 'car' && !isUnassigned && (
                    <span className={clsx(
                      'px-1.5 py-0.5 text-[7px] rounded-md font-black uppercase tracking-widest',
                      isDark ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-600'
                    )}>МОТО</span>
                  )}
                </div>

                <div className={clsx(
                  'text-[10px] font-bold mt-0.5 flex items-center gap-2',
                  isDark ? 'text-gray-400' : 'text-gray-500'
                )}>
                  <span className={clsx(totalOrdersCount > 0 ? (isDark ? 'text-blue-400/80' : 'text-blue-600/80') : '')}>
                    {totalOrdersCount > 0
                      ? `${deliveredOrdersCount}/${totalOrdersCount} доставлено`
                      : `${availableOrdersCount} заказов`}
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <div className="text-right">
                  <div className={clsx(
                    'text-[11px] font-black leading-none',
                    isSelected
                      ? (isDark ? 'text-blue-200' : 'text-blue-700')
                      : (isDark ? 'text-gray-200' : 'text-gray-700')
                  )}>
                    {Math.round(progress)}%
                  </div>
                  <div className={clsx(
                    'text-[8px] font-bold uppercase tracking-tighter opacity-50 mt-0.5',
                    isDark ? 'text-gray-400' : 'text-gray-500'
                  )}>
                    {isFinished ? 'Готов' : isOnRoute ? 'В пути' : 'Свободен'}
                  </div>
                </div>

                <div className={clsx(
                  'w-12 h-1 rounded-full overflow-hidden p-[1px]',
                  isDark ? 'bg-white/5' : 'bg-gray-100'
                )}>
                  <div
                    className={clsx(
                      'h-full rounded-full transition-all duration-300',
                      isFinished ? 'bg-green-500' : isOnRoute ? 'bg-blue-500' : 'bg-gray-300/50'
                    )}
                    style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </button>

      {/* Background glow */}
      {isSelected && (
        <div className={clsx(
          'absolute inset-0 opacity-10 pointer-events-none transition-opacity duration-300',
          isDark ? 'bg-gradient-to-br from-blue-500 to-transparent' : 'bg-gradient-to-br from-blue-100 to-transparent'
        )} />
      )}
    </div>
  )
})

export const RouteManagement: React.FC<RouteManagementProps> = () => {
  const { excelData, updateExcelData, saveManualOverrides } = useExcelData()
  const { isDark } = useTheme()
  const [selectedCourier, setSelectedCourier] = useState<string | null>(null)

  const [startAddress] = useState<string>(() => localStorageUtils.getAllSettings().defaultStartAddress || '')
  const [endAddress] = useState<string>(() => localStorageUtils.getAllSettings().defaultEndAddress || '')
  const [orderSearchTerm, setOrderSearchTerm] = useState('')
  const [courierSearchTerm, setCourierSearchTerm] = useState('')
  const [courierSortType, setCourierSortType] = useState<'alpha' | 'load'>('alpha')
  const [googleMapsReady, setGoogleMapsReady] = useState(false)

  // v5.41: Robust Normalization - trim all inputs to prevent mismatch
  const [settings, setSettings] = useState<any>(localStorageUtils.getAllSettings())

  useEffect(() => {
    const handleSettingsUpdate = () => {
      const newSettings = localStorageUtils.getAllSettings()
      setSettings(newSettings)
    }
    window.addEventListener('km-settings-updated', handleSettingsUpdate)
    return () => window.removeEventListener('km-settings-updated', handleSettingsUpdate)
  }, [])
  const [courierFilter, setCourierFilter] = useState<string>('all')
  const [routePage, setRoutePage] = useState(0)
  const [routesPerPage] = useState(5) // Количество маршрутов на странице
  const [sortRoutesByNewest] = useState(true)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [routeToDelete, setRouteToDelete] = useState<Route | null>(null)
  const [showAddressEditModal, setShowAddressEditModal] = useState(false)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [routeAnomalies, setRouteAnomalies] = useState<Map<string, RouteAnomalyCheck>>(new Map())
  const {
    settings,
    selectedHubs,
    selectedZones,
    cachedHubPolygons,
    cachedAllKmlPolygons
  } = useKmlData()

  // Helper for bounding box filtering (performance)
  const buildBounds = (path: any[]) => {
    if (!window.google?.maps?.LatLngBounds) return null
    const bounds = new window.google.maps.LatLngBounds()
    path.forEach(pt => bounds.extend(pt))
    return bounds
  }

    }
  }, [settings.kmlData, selectedHubs, window.google?.maps?.Polygon])

  const [showReturningModal, setShowReturningModal] = useState(false)
  const [showTransitModal, setShowTransitModal] = useState(false)
  // Routes enriched with geocoded order coordinates (populated on modal open)
  const [enrichedRoutes, setEnrichedRoutes] = useState<Route[]>([])
  const [isGeocodingETA, setIsGeocodingETA] = useState(false)

  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [selectedOrdersOrder, setSelectedOrdersOrder] = useState<string[]>([])

  // v5.22: Deferred search terms for concurrent rendering (fluid UI)
  const deferredOrderSearchTerm = useDeferredValue(orderSearchTerm)
  const deferredCourierSearchTerm = useDeferredValue(courierSearchTerm)

  // Состояния для системы помощи
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [showHelpTour, setShowHelpTour] = useState(false)
  const [hasSeenHelp, setHasSeenHelp] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('km_routes_has_seen_help') === 'true'
    }
    return false
  })

  // --- Helper Functions (Moved up to avoid TDZ errors) ---

  // Определяем тип транспорта курьера
  const getCourierVehicleType = useCallback((courierName: string) => {
    const normName = normalizeCourierName(courierName).toLowerCase()

    // 1. Проверяем в настройках (карта имен -> транспорт)
    const settings = localStorageUtils.getAllSettings()
    if (settings.courierVehicleMap) {
      // Ищем в карте с приведением ключей к нижнему регистру
      const mappedEntry = Object.entries(settings.courierVehicleMap).find(([name]) =>
        normalizeCourierName(name).toLowerCase() === normName
      )
      if (mappedEntry) return mappedEntry[1]
    }

    // 2. Проверяем в списке курьеров (уже нормализованных в ExcelDataContext)
    if (excelData?.couriers && Array.isArray(excelData.couriers)) {
      const courier = excelData.couriers.find((c: any) =>
        normalizeCourierName(c.name).toLowerCase() === normName
      )
      if (courier?.vehicleType) return courier.vehicleType
    }

    return 'car'
  }, [excelData?.couriers])

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
    const hasRegion = lower.includes('область') || lower.includes('oblast')
    const hasCountry = lower.includes('украина') || lower.includes('україна') || lower.includes('ukraine') || lower.includes(country.toLowerCase())

    // Для Киева используем "Киев", чтобы обеспечить точность в центре.
    // Спутники (Вишневое и т.д.) будут найдены через geocodeInsideOnly (исчерпывающий поиск).
    const cityOrRegion = city

    if (!hasCity && !hasRegion && !hasCountry) return `${base}, ${cityOrRegion}, ${country}`
    if (!hasCountry) return `${base}, ${country}`
    return base
  }, [getSelectedCity])

  // Проверяем, включен ли заказ в существующий маршрут
  const isOrderInExistingRoute = useCallback((orderId: string) => {
    return excelData?.routes?.some((route: Route) =>
      route.orders.some((order: Order) => order.id === orderId)
    ) || false
  }, [excelData?.routes])

  // Проверяем, существует ли уже маршрут для данного курьера с теми же заказами
  const isRouteDuplicate = useCallback((courierName: string, selectedOrderIds: Set<string>) => {
    return excelData?.routes?.some((route: Route) => {
      if (route.courier !== courierName) return false

      const routeOrderIds = new Set(route.orders.map((order: Order) => order.id))
      if (routeOrderIds.size !== selectedOrderIds.size) return false

      for (const id of selectedOrderIds) {
        if (!routeOrderIds.has(id)) return false
      }

      return true
    }) || false
  }, [excelData?.routes])



  const [confirmAddresses, setConfirmAddresses] = useState<boolean>(() => {
    const saved = localStorage.getItem('confirmAddresses');
    return saved !== null ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('confirmAddresses', JSON.stringify(confirmAddresses));
  }, [confirmAddresses]);

  // Сортируем заказы: сначала доступные по времени, потом заказы в маршрутах
  const sortOrdersByTime = useCallback((orders: Order[]) => {
    return [...orders].sort((a, b) => {
      const aInRoute = isOrderInExistingRoute(a.id)
      const bInRoute = isOrderInExistingRoute(b.id)

      if (aInRoute && !bInRoute) return 1
      if (!aInRoute && bInRoute) return -1

      if (!a.plannedTime && !b.plannedTime) return 0
      if (!a.plannedTime) return 1
      if (!b.plannedTime) return -1

      const timeA = String(a.plannedTime || '');
      const timeB = String(b.plannedTime || '');
      return timeA.localeCompare(timeB)
    })
  }, [isOrderInExistingRoute])

  // --- Custom Hooks ---


  // --- Background Pre-geocoder (L1 + L2 Cache Warming) ---
  const allOrders = useMemo(() => excelData?.orders || [], [excelData?.orders])
  useBackgroundGeocoder(allOrders)

  // SOTA 5.46: useRouteGeocoding encapsulates all complex logic
  const {
    calculateRouteDistance,
    isCalculating,
    disambModal,
    setDisambModal,
    disambResolver,
    processDisambQueue: _processDisambQueue
  } = useRouteGeocoding({
    settings,
    confirmAddresses,
    selectedHubs,
    selectedZones,
    cachedHubPolygons,
    cachedAllKmlPolygons,
    updateExcelData,
    setShowCorrectionModal: () => { },
    setShowBatchPanel: () => { },
    startAddress,
    endAddress,
    cleanAddressForRoute
  })

  // Группируем заказы по курьерам
  const courierOrders = useMemo(() => {
    if (!excelData?.orders || !Array.isArray(excelData.orders)) {
      return {}
    }

    const grouped: { [courier: string]: Order[] } = {}

    excelData.orders.forEach((order: any) => {
      if (order.address) {
        const courierName = normalizeCourierName(order?.courier) || 'Не назначено'

        if (!grouped[courierName]) {
          grouped[courierName] = []
        }

        grouped[courierName].push({
          id: order.id ? String(order.id) : String(order.orderNumber),
          orderNumber: order.orderNumber || 'N/A',
          address: order.address,
          courier: courierName,
          amount: order.amount || 0,
          phone: order.phone || '',
          customerName: order.customerName || '',
          plannedTime: order.plannedTime || '',
          paymentMethod: order.paymentMethod || '',
          manualGroupId: order.manualGroupId,
          deadlineAt: order.deadlineAt,
          handoverAt: order.handoverAt,
          status: order.status,
          statusTimings: order.statusTimings,
          raw: order,
          isSelected: false
        })
      }
    })

    return grouped
  }, [excelData?.orders])

  // Precompute set of orders in routes for O(1) lookups
  const ordersInRoutesSet = useMemo(() => {
    const set = new Set<string>()
      ; (excelData?.routes || []).forEach((route: Route) => {
        route.orders.forEach((order: Order) => {
          set.add(order.id)
        })
      })
    return set
  }, [excelData?.routes])

  // Функция для получения метрик курьера (Optimized with Memoization)
  const courierMetricsMap = useMemo(() => {
    const map = new Map<string, { available: number; delivered: number; total: number }>()

    const allCouriers = new Set([
      ...Object.keys(courierOrders),
      ...(excelData?.couriers?.map((c: any) => c.name) || [])
    ])

    allCouriers.forEach(name => {
      if (!name) return
      const orders = courierOrders[name] || []
      let available = 0
      let delivered = 0

      for (const order of orders) {
        if (!ordersInRoutesSet.has(order.id)) {
          available++
        }
        if (order.status === 'Доставлено' || order.status === 'Исполнен') {
          delivered++
        }
      }

      map.set(name, { available, delivered, total: orders.length })
    })

    return map
  }, [courierOrders, ordersInRoutesSet, excelData?.couriers])

  const getCourierMetrics = useCallback((courierName: string) => {
    return courierMetricsMap.get(courierName) || { available: 0, delivered: 0, total: 0 }
  }, [courierMetricsMap])

  // Aggregate Fleet Stats
  const fleetStats = useMemo(() => {
    const couriersList = Array.from(new Set([
      ...Object.keys(courierOrders).map(n => normalizeCourierName(n)),
      ...(excelData?.couriers?.map((c: any) => normalizeCourierName(c.name)) || [])
    ])).filter(n => n && n !== 'Не назначено' && n !== 'ID:0')

    let inTransitCount = 0
    let returningCount = 0
    let finishedCount = 0
    let totalDelivered = 0
    let totalExpected = 0

    couriersList.forEach(name => {
      const m = courierMetricsMap.get(name) || { available: 0, delivered: 0, total: 0 }
      if (m.total > 0) {
        const remaining = m.total - m.delivered;
        if (m.delivered === m.total) {
          finishedCount++
        } else if (m.delivered > 0 && remaining > 0 && remaining <= 2) {
          returningCount++
        } else {
          inTransitCount++
        }

        totalDelivered += m.delivered
        totalExpected += m.total
      }
    })

    const avgProgress = totalExpected > 0 ? (totalDelivered / totalExpected) * 100 : 0

    return {
      total: couriersList.length,
      inTransit: inTransitCount,
      returning: returningCount,
      finished: finishedCount,
      progress: avgProgress,
      totalExpected,
      totalDelivered
    }
  }, [courierOrders, excelData?.couriers, courierMetricsMap])

  // Trigger on-demand geocoding when the returning modal is opened
  useEffect(() => {
    if (!showReturningModal) return

    const couriersList = Array.from(new Set([
      ...Object.keys(courierOrders).map(n => normalizeCourierName(n)),
      ...(excelData?.couriers?.map((c: any) => normalizeCourierName(c.name)) || [])
    ])).filter(n => n && n !== 'Не назначено' && n !== 'ID:0')

    const returningRoutes: any[] = []

    couriersList.forEach(name => {
      const m = courierMetricsMap.get(name) || { available: 0, delivered: 0, total: 0 }
      const remaining = m.total - m.delivered
      if (m.total > 0 && m.delivered > 0 && remaining > 0 && remaining <= 2) {
        // Find existing route or create virtual
        const lowerName = name.toLowerCase()
        const rawRoute = (excelData?.routes || []).find(
          (r: Route) => normalizeCourierName(r.courier).toLowerCase() === lowerName
        )
        if (rawRoute) {
          returningRoutes.push(rawRoute)
        } else {
          returningRoutes.push({
            id: `virtual-${name}`,
            courier: name,
            orders: courierOrders[name] || []
          })
        }
      }
    })

    if (returningRoutes.length === 0) return

    setIsGeocodingETA(true)
    enrichRoutesWithCoords(returningRoutes)
      .then(async (enriched) => {
        // После геокодирования запрашиваем точный расчет у Google для каждого маршрута
        const processed = await Promise.all(enriched.map(async (r) => {
          const accurate = await getAccurateReturnETA(r as any, startAddress)
          return { ...r, accurateETA: accurate }
        }))
        setEnrichedRoutes(processed as unknown as Route[])
      })
      .catch(console.error)
      .finally(() => setIsGeocodingETA(false))
  }, [showReturningModal, excelData, courierOrders, courierMetricsMap, startAddress])

  // Data for the returning couriers modal
  const returningCouriersData = useMemo(() => {
    const list: any[] = []
    const couriersList = Array.from(new Set([
      ...Object.keys(courierOrders).map(n => normalizeCourierName(n)),
      ...(excelData?.couriers?.map((c: any) => normalizeCourierName(c.name)) || [])
    ])).filter(n => n && n !== 'Не назначено' && n !== 'ID:0')

    // Build a lookup from enrichedRoutes (may have more coords than raw routes)
    const enrichedById = new Map<string, Route>(
      enrichedRoutes.map(r => [r.id, r as Route])
    )

    couriersList.forEach(name => {
      const m = courierMetricsMap.get(name) || { available: 0, delivered: 0, total: 0 }
      const remaining = m.total - m.delivered

      if (m.total > 0 && m.delivered > 0 && remaining > 0 && remaining <= 2) {
        const lowerName = name.toLowerCase()
        const routeIdx = (excelData?.routes || []).findIndex(
          (r: Route) => {
            const rName = normalizeCourierName(r.courier).toLowerCase();
            return rName === lowerName || rName.includes(lowerName) || lowerName.includes(rName);
          }
        )

        const rawRoute: Route | undefined = routeIdx !== -1 ? (excelData as any).routes[routeIdx] : undefined;
        // Prefer enriched (geocoded) version if available.
        // SOTA 3.1: Also check for virtual route ID lookup
        const virtualId = `virtual-${name}`
        const route = rawRoute ? (enrichedById.get(rawRoute.id) ?? rawRoute) : (enrichedById.get(virtualId))

        const vehicleType = getCourierVehicleType(name)
        const speed = getCourierSpeed(vehicleType)

        // If no formal route exists, create a virtual one from active orders
        const finalRoute = route || {
          courier: name,
          orders: courierOrders[name] || []
        };

        // Priority: 1. Accurate Google result, 2. Manual calculation using speed/distance
        const accurateResult = (route as any)?.accurateETA
        const etaInfo = accurateResult || getReturnETA(finalRoute as any, speed)

        list.push({
          name,
          delivered: m.delivered,
          total: m.total,
          eta: etaInfo?.time || `~ ${remaining * (vehicleType === 'moto' ? 45 : 20)} мин`,
          isRough: etaInfo ? etaInfo.isRough : true,
          statusLabel: etaInfo?.statusLabel || 'ПРИМЕРНО',
          routeId: (rawRoute as any)?.id || null,
          progress: (m.delivered / m.total) * 100
        })
      }
    })
    return list.sort((a: any, b: any) => {
      if (!a.eta) return 1
      if (!b.eta) return -1
      return String(a.eta).localeCompare(String(b.eta))
    })
  }, [courierOrders, excelData, courierMetricsMap, enrichedRoutes, getCourierVehicleType])

  // Data for the in-transit couriers modal
  const transitCouriersData = useMemo(() => {
    const list: any[] = []
    const couriersList = Array.from(new Set([
      ...Object.keys(courierOrders).map(n => normalizeCourierName(n)),
      ...(excelData?.couriers?.map((c: any) => normalizeCourierName(c.name)) || [])
    ])).filter(n => n && n !== 'Не назначено' && n !== 'ID:0')

    couriersList.forEach(name => {
      const m = courierMetricsMap.get(name) || { available: 0, delivered: 0, total: 0 }
      const remaining = m.total - m.delivered;
      // Refined: "In Transit" if started but > 2 left, or haven't started yet
      if (m.total > 0 && (m.delivered === 0 || (m.delivered > 0 && remaining > 2))) {
        list.push({
          name,
          delivered: m.delivered,
          total: m.total,
          progress: (m.delivered / m.total) * 100
        })
      }
    })
    return list
  }, [courierOrders, excelData, courierMetricsMap])

  // Объединяем курьеров из всех источников: из заказов и из общего списка курьеров (если есть)
  const couriers = useMemo(() => {
    // Используем Map (lowercase -> original) для дедупликации без учета регистра
    const courierMap = new Map<string, string>()

    // Из уже сгруппированных по заказам
    Object.keys(courierOrders).forEach(name => {
      const norm = normalizeCourierName(name)
      const key = norm.toLowerCase()
      if (key && !courierMap.has(key)) {
        courierMap.set(key, norm)
      }
    })

    // Из основного списка курьеров в excelData (чтобы видеть даже тех, у кого нет заказов)
    if (excelData?.couriers && Array.isArray(excelData.couriers)) {
      excelData.couriers.forEach((c: any) => {
        const norm = normalizeCourierName(c?.name)
        const key = norm.toLowerCase()
        if (key && !courierMap.has(key)) {
          courierMap.set(key, norm)
        }
      })
    }

    return Array.from(courierMap.values())
  }, [courierOrders, excelData?.couriers])

  const handleCourierSelect = useCallback((courierName: string) => {
    setSelectedCourier(courierName)
    // При смене курьера сбрасываем выбор и порядок, чтобы избежать артефактов
    setSelectedOrders(new Set())
    setSelectedOrdersOrder([])
  }, [setSelectedCourier, setSelectedOrders, setSelectedOrdersOrder])

  const filteredCouriers = useMemo(() => {
    let result = couriers

    // Filter by type
    if (courierFilter !== 'all') {
      result = result.filter(courierName => {
        const vehicleType = getCourierVehicleType(courierName)
        return vehicleType === courierFilter
      })
    }

    // Filter by search (deferred)
    if (deferredCourierSearchTerm) {
      const term = deferredCourierSearchTerm.toLowerCase()
      result = result.filter(name => name.toLowerCase().includes(term))
    }

    // Sort
    return result.sort((a, b) => {
      // "Не назначен" always top
      if (a === 'Не назначено' || a === 'ID:0') return -1;
      if (b === 'Не назначено' || b === 'ID:0') return 1;

      if (courierSortType === 'load') {
        const loadA = getCourierMetrics(a).available
        const loadB = getCourierMetrics(b).available
        // Sort descending by load
        if (loadA !== loadB) return loadB - loadA
      }

      return a.localeCompare(b, 'ru');
    })
  }, [couriers, courierFilter, deferredCourierSearchTerm, courierSortType, getCourierMetrics, getCourierVehicleType])




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

  // Функция для поиска заказов по номеру
  const searchOrders = useCallback((orders: Order[]) => {
    if (!deferredOrderSearchTerm.trim()) return orders

    const searchTerm = deferredOrderSearchTerm.toLowerCase().trim()
    return orders.filter(order =>
      String(order.orderNumber).toLowerCase().includes(searchTerm) ||
      (order.customerName || '').toLowerCase().includes(searchTerm) ||
      (order.address || '').toLowerCase().includes(searchTerm)
    )
  }, [deferredOrderSearchTerm])




  // --- Виртуализация с динамической высотой ---



  const availableOrders = useMemo(() => {
    if (!selectedCourier) return []
    let all = sortOrdersByTime(searchOrders(courierOrders[selectedCourier] || []))
    // Дедупликация на случай дублей данных из источника
    const seen = new Set<string>()
    all = all.filter(o => (seen.has(o.id) ? false : (seen.add(o.id), true)))

    return all.filter(order => !isOrderInExistingRoute(order.id))
  }, [selectedCourier, courierOrders, searchOrders, isOrderInExistingRoute, sortOrdersByTime])

  const ordersInRoutes = useMemo(() => {
    if (!selectedCourier) return []
    let all = sortOrdersByTime(searchOrders(courierOrders[selectedCourier] || []))
    // Дедупликация
    const seen = new Set<string>()
    all = all.filter(o => (seen.has(o.id) ? false : (seen.add(o.id), true)))

    return all.filter(order => isOrderInExistingRoute(order.id))
  }, [selectedCourier, courierOrders, searchOrders, isOrderInExistingRoute, sortOrdersByTime])


  const handleOrderSelect = useCallback((orderId: string, _multi?: boolean) => {
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
  // При виртуализации ручная подгрузка не требуется; функция удалена

  const createRoute = async (ordersOverride?: Order[] | any, courierOverride?: string) => {
    // Если вызвано из onClick, первый аргумент - объект события
    const isEvent = ordersOverride && (ordersOverride.nativeEvent || ordersOverride._reactName);
    const actualOrders = isEvent ? undefined : (ordersOverride as Order[]);

    const courier = courierOverride || selectedCourier;
    if (!courier || courier === 'Не назначено') return

    // Требуем выбранный город в настройках
    {
      // `settings` is now a component-level memo
      const cityBias = settings.cityBias || ''
      if (!cityBias) {
        toast.error('Выберите город во вкладке Настройки (Город для маршрутов).')
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
      toast.error('Выберите заказы для создания маршрута')
      return
    }

    // Проверяем на дубликаты
    if (isRouteDuplicate(courier, ordersToDuplicateCheck)) {
      toast.error('Маршрут с такими же заказами для этого курьера уже существует')
      return
    }

    // Проверяем готовность Google Maps API
    if (!googleMapsReady) {
      // Проверяем, есть ли API ключ в настройках
      if (!localStorageUtils.hasApiKey()) {
        toast.error('Google Maps API ключ не найден в настройках. Пожалуйста, добавьте ключ.')
        return
      }

      try {
        await googleMapsLoader.load()
        setGoogleMapsReady(true)
      } catch (error) {
        toast.error('Ошибка загрузки Google Maps API. Проверьте настройки API ключа.')
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

    // v5.22: Set isCalculating early to prevent UI hangs and multiple clicks

    // Добавляем новый маршрут и синхронизируем курьера в списке всех заказов
    updateExcelData((prev: any) => {
      const currentOrders = prev?.orders || []
      const orderIdsToUpdate = new Set(selectedOrdersList.map(so => String(so.id)))

      const updatedOrders = currentOrders.map((order: any) => {
        // Если ID заказа в списке создаваемого маршрута, обновляем его курьера
        if (orderIdsToUpdate.has(String(order.id))) {
          return { ...order, courier: courier }
        }
        return order
      })

      return {
        ...(prev || { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: undefined }),
        routes: [...(prev?.routes || []), newRoute],
        orders: updatedOrders
      }
    })

    // Сбрасываем выбор заказов и порядок
    setSelectedOrders(new Set())
    setSelectedOrdersOrder([])

    // Автоматически рассчитываем расстояние для нового маршрута, возвращаем Promise для секвенциальной обработки
    return calculateRouteDistance(newRoute)
  }





  // calculateRouteDistance moved to useRouteGeocoding (Duplicate instance removed)


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



  // Функция для перемещения заказа в другую временную группу (Force Move / SOTA v2.0)
  const handleMoveOrderToGroup = useCallback(async (orderId: string, targetGroup: TimeWindowGroup) => {
    console.log('[DND] Force Move logic triggered for order:', orderId, 'to group:', targetGroup.id);

    // v5.3: DND is instant — no async geocoding, no modals during drag.
    // Only show a toast warning if coords available and the order is extremely far from the group.
    const currentOrders = excelData?.orders || [];
    const movedOrder = currentOrders.find((o: any) => String(o.id) === String(orderId) || String(o.orderNumber) === String(orderId));

    if (movedOrder?.coords) {
      const groupOrders = (targetGroup.orders || []).filter(o => o.coords);
      if (groupOrders.length > 0) {
        const nearest = groupOrders.reduce((best: any, o: any) => {
          const d = calculateDistance(movedOrder.coords!, o.coords!);
          return d < calculateDistance(movedOrder.coords!, best.coords!) ? o : best;
        });
        const dist = calculateDistance(movedOrder.coords, nearest.coords!);
        const thresholdM = groupOrders.length === 1 ? 30000 : 15000; // 30km alone, 15km multi
        if (dist > thresholdM) {
          toast(() => (
            <div className="flex flex-col gap-1">
              <span className="font-bold text-amber-500">⚠ Далекий адрес!</span>
              <span className="text-xs">#{movedOrder.orderNumber} — {Math.round(dist / 1000)} км от ближайшего заказа в группе.</span>
            </div>
          ), { duration: 5000 });
        }
      }
    }

    updateExcelData((prev: any) => {
      if (!prev) return prev;

      // 1. Определяем стабильный manualGroupId для целевой группы
      // ВАЖНО: Мы должны УБРАТЬ префикс 'manual-', так как он добавляется автоматически в createManualGroup
      let rawManualId = targetGroup.manualGroupId || (String(targetGroup.id).startsWith('manual-') ? targetGroup.id : `${Date.now()}`);

      // Очищаем от префикса, чтобы не было рекурсии manual-manual-...
      if (rawManualId.startsWith('manual-')) {
        rawManualId = rawManualId.replace(/^manual-/, '');
      }

      const targetManualId = rawManualId;

      // 2. Находим полный объект целевого курьера для консистентности данных
      const targetCourierId = targetGroup.courierId;
      const targetCourier = (prev.couriers || []).find((c: any) =>
        String(c._id) === String(targetCourierId) || String(c.id) === String(targetCourierId)
      ) || { _id: targetCourierId, name: targetGroup.courierName };

      // 3. Обновляем список заказов с жестким присвоением свойств
      const updatedOrders = (prev.orders || []).map((order: any) => {
        const oId = String(order.id || '');
        const oNum = String(order.orderNumber || '');

        const targetIdStr = String(orderId);
        // Robust ID matching: handle 'order_' prefix if present in drag data but not in store
        const normalizedTargetId = targetIdStr.replace(/^order_/, '');
        const normalizedOId = oId.replace(/^order_/, '');

        // SOTA 4.9: Support both internal ID and visual Order Number matching
        const isMovedOrder = (oId === targetIdStr) || (oNum === targetIdStr) || (normalizedOId === normalizedTargetId) || (oNum === normalizedTargetId);

        if (isMovedOrder) {
          console.log('[DND] Matched Order:', oId, 'Moving to:', targetManualId);
        }

        // Это заказ, который УЖЕ был в целевой группе?
        // Нам нужно "связать" их вместе новым manualGroupId, чтобы они не разлетелись
        const isExistingGroupMember = (targetGroup.orders || []).some((o: any) => {
          const existingId = String(o.id || '');
          const existingNum = String(o.orderNumber || '');
          const normExistingId = existingId.replace(/^order_/, '');
          return (normExistingId === normalizedOId && normExistingId !== '') || (existingNum !== '' && existingNum === oNum);
        });

        if (isMovedOrder) {
          return {
            ...order,
            // FORCE OVERRIDES / ЖЕСТКОЕ ПРИСВОЕНИЕ
            manualGroupId: targetManualId,
            courierId: targetCourierId,       // Явно меняем курьера
            courier: targetCourier.name || targetGroup.courierName,           // Исправлено: передаем имя как строку
            plannedTime: formatTimeLabel(targetGroup.windowStart), // Синхронизируем время
            deadlineAt: targetGroup.windowStart,
            isInRoute: false,                 // Сбрасываем флаг маршрута
            status: (order.status === 'Доставляется' || order.status === 'Исполнен') ? order.status : 'В работе'
          };
        }

        if (isExistingGroupMember) {
          // Привязываем существующих членов группы к тому же manualGroupId
          return {
            ...order,
            manualGroupId: targetManualId,
            courierId: targetCourierId,
            plannedTime: formatTimeLabel(targetGroup.windowStart),
            deadlineAt: targetGroup.windowStart
          };
        }

        return order;
      });

      // 4. Зачистка: удаляем перемещенный заказ из любых старых маршрутов
      const updatedRoutes = (prev.routes || []).map((route: any) => {
        // Проверяем, есть ли наш заказ в этом маршруте
        const hasMovedOrder = (route.orders || []).some((o: any) => {
          const oId = String(o.id || '');
          const oNum = String(orderId);
          return oId === String(orderId) || oNum === String(orderId);
        });

        if (hasMovedOrder) {
          const filteredOrders = (route.orders || []).filter((o: any) => {
            const oId = String(o.id || '');
            const oNum = String(o.orderNumber || '');
            const targetIdStr = String(orderId);
            const normalizedTargetId = targetIdStr.replace(/^order_/, '');
            const normalizedOId = oId.replace(/^order_/, '');
            return (normalizedOId !== normalizedTargetId) && (oNum !== normalizedTargetId);
          });
          return {
            ...route,
            orders: filteredOrders,
            stopsCount: filteredOrders.length
          };
        }
        return route;
      });

      // Сохраняем изменения (saveManualOverrides вызывается реактивно или требует явного вызова,
      // но обновление manualGroupId в данных уже достаточно для следующего рендера)
      const nextState = {
        ...prev,
        orders: updatedOrders,
        routes: updatedRoutes
      };
      saveManualOverrides(nextState.orders); // Call saveManualOverrides here
      return nextState;
    });

    toast.success(`Заказ перемещен в ${targetGroup.windowLabel}`, { icon: '' });
  }, [updateExcelData])

  // Функция для создания новой кастомной группы ( Phase 4.7 )
  const handleCreateCustomGroup = useCallback((orderId: string) => {
    const newManualId = `manual-${Date.now()}`;
    console.log('[DND] Creating custom group for order:', orderId, 'New Group ID:', newManualId);

    updateExcelData((prev: any) => {
      if (!prev) return prev;

      const updatedOrders = (prev.orders || []).map((order: any) => {
        const oId = String(order.id || '');
        const oNum = String(order.orderNumber || '');
        const targetIdStr = String(orderId);

        // Robust ID matching: handle 'order_' prefix if present in drag data but not in store
        const normalizedTargetId = targetIdStr.replace(/^order_/, '');
        const normalizedOId = oId.replace(/^order_/, '');

        // SOTA 4.9: Support both internal ID and visual Order Number matching
        const isTargetMove = (oId === targetIdStr) || (oNum === targetIdStr) || (normalizedOId === normalizedTargetId) || (oNum === normalizedTargetId);

        if (isTargetMove) {
          // Определяем текущего курьера (если есть selectedCourier - используем его, иначе оставляем как есть)
          // ВАЖНО: Если мы в режиме просмотра конкретного курьера, новая группа должна быть привязана к нему
          let targetCourierId = order.courierId;
          let targetCourier = order.courier;

          if (selectedCourier && selectedCourier !== 'all' && !isId0CourierName(selectedCourier)) {
            targetCourierId = selectedCourier;
            // Пытаемся найти полный объект курьера
            const foundCourier = (prev.couriers || []).find((c: any) =>
              String(c._id) === String(selectedCourier) || String(c.id) === String(selectedCourier)
            );
            if (foundCourier) {
              targetCourier = foundCourier;
            }
          }

          return {
            ...order,
            manualGroupId: newManualId,
            courierId: targetCourierId,
            courier: (targetCourier && typeof targetCourier === 'object') ? (targetCourier.name || targetCourier) : targetCourier, // Исправлено: передаем имя как строку
            plannedTime: order.plannedTime || Date.now(), // Ensure valid time for grouping
            isInRoute: false,
            status: (order.status === 'Доставляется' || order.status === 'Исполнен') ? order.status : 'В работе'
          };
        }
        return order;
      });

      // Remove from existing routes
      const updatedRoutes = (prev.routes || []).map((route: any) => {
        const hasOrder = (route.orders || []).some((o: any) => {
          const oId = String(o.id || '');
          const oNum = String(orderId);
          return (oId === String(orderId) || oNum === String(orderId));
        });

        if (hasOrder) {
          const filteredOrders = (route.orders || []).filter((o: any) => {
            const oId = String(o.id || '');
            const oNum = String(o.orderNumber || '');
            const targetIdStr = String(orderId);
            const normalizedTargetId = targetIdStr.replace(/^order_/, '');
            const normalizedOId = oId.replace(/^order_/, '');
            return (normalizedOId !== normalizedTargetId) && (oNum !== normalizedTargetId);
          });
          return {
            ...route,
            orders: filteredOrders,
            stopsCount: filteredOrders.length
          };
        }
        return route;
      });

      const next = {
        ...prev,
        orders: updatedOrders,
        routes: updatedRoutes
      };
      saveManualOverrides(next.orders);
      return next;
    });

    toast.success('Создана новая группа', { icon: '➕' });
  }, [updateExcelData, selectedCourier])

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
      toast.error(errorMessage)
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
    if (window.confirm('Вы уверены, что хотите удалить все маршруты?')) {
      updateExcelData({ ...(excelData || { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: undefined }), routes: [] })
      // Также очищаем из localStorage
      try {
        localStorage.removeItem('km_routes')
      } catch (error) {
        console.error('Error clearing routes from localStorage:', error)
      }
    }
  }

  const clearFinishedRoutes = () => {
    updateExcelData((prev: any) => {
      const routes = prev?.routes || [];
      const activeRoutes = routes.filter((r: Route) => {
        if (!r.orders || r.orders.length === 0) return true;
        // Маршрут считается завершенным, если ВСЕ его заказы в статусе 'Исполнен'
        return !r.orders.every(o => o.status === 'Исполнен');
      });

      if (activeRoutes.length === routes.length) {
        toast.error('Нет завершенных маршрутов для очистки');
        return prev;
      }

      toast.success(`Очищено маршрутов: ${routes.length - activeRoutes.length}`);
      return { ...prev, routes: activeRoutes };
    });
  }

  const openRouteInGoogleMaps = async (route: Route) => {
    if (route.orders.length === 0) {
      toast.error('Нет точек для маршрута')
      return
    }

    try {
      const base = 'https://www.google.com/maps/dir/?api=1'
      const meta: any = (route as any).geoMeta || {}
      const waypointsMeta: any[] = (meta.waypoints && Array.isArray(meta.waypoints)) ? meta.waypoints : []
      
      const hasCoords = (m: any) => typeof m?.lat === 'number' && typeof m?.lng === 'number'

      // 1. Origin
      let originStr = ''
      if (hasCoords(meta.origin)) {
        originStr = `${meta.origin.lat},${meta.origin.lng}`
      } else {
        originStr = route.startAddress || (settings.defaultStartAddress || '')
      }

      // 2. Destination
      let destinationStr = ''
      if (hasCoords(meta.destination)) {
        destinationStr = `${meta.destination.lat},${meta.destination.lng}`
      } else {
        destinationStr = route.endAddress || route.startAddress || (settings.defaultEndAddress || settings.defaultStartAddress || '')
      }

      // 3. Waypoints
      const wpList = route.orders.map((o: any, i: number) => {
        const wMeta = waypointsMeta[i]
        if (hasCoords(wMeta)) {
          return `${wMeta.lat},${wMeta.lng}`
        }
        return o.address || ''
      })

      const origin = `origin=${encodeURIComponent(originStr)}`
      const destination = `destination=${encodeURIComponent(destinationStr)}`
      const waypoints = wpList.length > 0 ? `waypoints=${encodeURIComponent(wpList.join('|'))}` : ''
      const travelmode = 'travelmode=driving'

      const parts = [origin, destination, travelmode]
      if (waypoints) parts.push(waypoints)
      const url = `${base}&${parts.join('&')}`
      window.open(url, '_blank')
    } catch (err) {
      toast.error('Не удалось открыть маршрут в Google Maps')
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
    <div className="space-y-6 relative">
      {/* v5.22: Universal Loading Overlay */}
      {isCalculating && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm transition-all duration-300">
          <div className={clsx(
            "p-10 rounded-[3rem] shadow-2xl flex flex-col items-center gap-6 animate-in zoom-in-90 duration-300",
            isDark ? "bg-gray-900 border border-white/10" : "bg-white border border-gray-100"
          )}>
            <div className="relative">
              <div className="w-20 h-20 rounded-3xl bg-blue-500/10 flex items-center justify-center">
                <ArrowPathIcon className="w-10 h-10 text-blue-500 animate-spin" />
              </div>
              <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-purple-500 flex items-center justify-center shadow-lg">
                <MapIcon className="w-4 h-4 text-white" />
              </div>
            </div>
            <div className="text-center">
              <h3 className={clsx("text-2xl font-black mb-1", isDark ? "text-white" : "text-gray-900")}>Расчет...</h3>
              <p className={clsx("text-xs font-bold opacity-60 uppercase tracking-widest", isDark ? "text-blue-400" : "text-blue-600")}>
                Оптимизация маршрута
              </p>
            </div>
            <div className="flex gap-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        </div>
      )}

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
      <>
        {/* Основная рабочая область: Сайдбар + Дашборд */}
        <div className="flex flex-col lg:flex-row gap-8 items-start mb-12 relative min-h-[100px]">
          {/* Левая панель: Выбор курьера */}
          <div className="w-full lg:w-[420px] lg:sticky lg:top-8" data-tour="courier-select">
            <div className={clsx(
              'rounded-3xl shadow-xl border-2 p-6 overflow-hidden relative',
              isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100 shadow-blue-500/5'
            )}>
              {/* Декоративный фон для сайдбара */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -mr-16 -mt-16 blur-2xl opacity-50"></div>

              <div className="relative z-10 flex flex-col h-full">
                <div className="flex flex-col gap-4 mb-6">
                  <div className="flex items-center justify-between">
                    <h2 className={clsx(
                      'text-xl font-black tracking-tight',
                      isDark ? 'text-gray-100' : 'text-gray-900'
                    )}>Курьеры</h2>
                    <div className="flex bg-gray-100 dark:bg-black/40 p-1 rounded-xl border dark:border-white/5 shadow-inner">
                      {['all', 'car', 'moto'].map((f) => (
                        <button
                          key={f}
                          onClick={() => setCourierFilter(f as any)}
                          className={clsx(
                            'px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all',
                            courierFilter === f
                              ? (isDark ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-white text-blue-600 shadow-md')
                              : (isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-800')
                          )}
                        >
                          {f === 'all' ? 'Все' : f === 'car' ? 'Авто' : 'Мото'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Fleet Dashboard Mini stats */}
                  <div className="grid grid-cols-4 gap-1.5">
                    <div className={clsx(
                      "p-2.5 rounded-2xl border flex flex-col items-center justify-center transition-all",
                      isDark ? "bg-black/20 border-white/5" : "bg-gray-50 border-gray-100"
                    )}>
                      <span className="text-[13px] font-black leading-none mb-1">{fleetStats.total}</span>
                      <span className="text-[6px] font-black uppercase tracking-widest opacity-30">Всего</span>
                    </div>

                    <button
                      onClick={() => setShowReturningModal(true)}
                      className={clsx(
                        "p-2.5 rounded-2xl border flex flex-col items-center justify-center transition-all hover:scale-105 active:scale-95 relative overflow-hidden group",
                        isDark ? "bg-purple-500/10 border-purple-500/30" : "bg-purple-50 border-purple-100"
                      )}
                    >
                      <div className="absolute inset-0 bg-purple-500/5 group-hover:bg-purple-500/10 transition-colors" />
                      <span className="text-[13px] font-black leading-none mb-1 text-purple-600 relative z-10">{fleetStats.returning}</span>
                      <span className="text-[6px] font-black uppercase tracking-widest text-purple-600/50 relative z-10">Возврат</span>
                    </button>

                    <button
                      onClick={() => setShowTransitModal(true)}
                      className={clsx(
                        "p-2.5 rounded-2xl border flex flex-col items-center justify-center transition-all hover:scale-105 active:scale-95",
                        isDark ? "bg-blue-500/5 border-blue-500/20" : "bg-blue-50 border-blue-100"
                      )}
                    >
                      <span className="text-[13px] font-black leading-none mb-1 text-blue-500">{fleetStats.inTransit}</span>
                      <span className="text-[6px] font-black uppercase tracking-widest text-blue-500/50">В пути</span>
                    </button>

                    <div className={clsx(
                      "p-2.5 rounded-2xl border flex flex-col items-center justify-center transition-all",
                      isDark ? "bg-emerald-500/5 border-emerald-500/20" : "bg-emerald-50 border-emerald-100"
                    )}>
                      <span className="text-[13px] font-black leading-none mb-1 text-emerald-500">{fleetStats.finished}</span>
                      <span className="text-[6px] font-black uppercase tracking-widest text-emerald-500/50">Завершил</span>
                    </div>
                  </div>

                  {/* Search & Sort Row */}
                  <div className="flex items-center gap-2">
                    <div className={clsx(
                      "flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border transition-all",
                      isDark ? "bg-black/20 border-white/5 focus-within:border-blue-500/30" : "bg-gray-50 border-gray-100 focus-within:border-blue-200"
                    )}>
                      <svg className="w-3.5 h-3.5 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <input
                        type="text"
                        placeholder="Поиск..."
                        value={courierSearchTerm}
                        onChange={(e) => setCourierSearchTerm(e.target.value)}
                        className="bg-transparent border-none outline-none text-[10px] font-black w-full placeholder:opacity-30 uppercase tracking-widest"
                      />
                    </div>
                    <button
                      onClick={() => setCourierSortType(prev => prev === 'alpha' ? 'load' : 'alpha')}
                      className={clsx(
                        "p-2 rounded-xl border transition-all group",
                        isDark ? "bg-black/20 border-white/5 hover:border-blue-500/30" : "bg-gray-50 border-gray-100 hover:border-blue-200"
                      )}
                      title={courierSortType === 'alpha' ? 'Сортировка по алфавиту' : 'Сортировка по нагрузке'}
                    >
                      {courierSortType === 'alpha' ? (
                        <svg className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-blue-500 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-h-[400px] overflow-y-auto pr-2 custom-scrollbar" style={{ maxHeight: '600px' }}>
                  {filteredCouriers.length === 0 ? (
                    <div className="text-center py-10 h-full flex flex-col items-center justify-center">
                      <TruckIcon className="w-10 h-10 mx-auto text-gray-300 mb-2 opacity-50" />
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-widest px-4">Список пуст</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredCouriers.map((courierName) => {
                        const metric = getCourierMetrics(courierName)
                        const vehicleType = getCourierVehicleType(courierName)
                        return (
                          <CourierListItem
                            key={courierName}
                            courierName={courierName}
                            vehicleType={vehicleType}
                            isSelected={selectedCourier === courierName}
                            onSelect={handleCourierSelect}
                            availableOrdersCount={metric.available}
                            deliveredOrdersCount={metric.delivered}
                            totalOrdersCount={metric.total}
                            isDark={isDark}
                          />
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Основной контент (Дашборд заказов) */}
          <div className="flex-1 min-w-0 w-full">
            {!selectedCourier ? (
              <div className={clsx(
                "flex flex-col items-center justify-center p-12 lg:p-24 rounded-[3rem] border-4 border-dashed transition-colors duration-200",
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
              <div className="space-y-6">

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
                            {isId0CourierName(selectedCourier) ? 'Не назначено' : selectedCourier}
                          </h2>
                          <div className={clsx(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1",
                            isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700"
                          )}>
                            {getCourierVehicleType(selectedCourier) !== 'car' ? (
                              <TruckIcon className="w-3 h-3" />
                            ) : (
                              <TruckIcon className="w-3 h-3" />
                            )}
                            <span>{getCourierVehicleType(selectedCourier) !== 'car' ? 'МОТО' : 'АВТО'}</span>
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
                  {selectedCourier !== 'Не назначено' && !isId0CourierName(selectedCourier) && (
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
                        <div className="ml-auto flex items-center gap-2">
                          <span className={clsx("text-[10px] font-bold uppercase tracking-tighter", isDark ? "text-gray-500" : "text-gray-400")}>
                            {confirmAddresses ? 'Уточнять адреса' : 'Автовыбор (Silent)'}
                          </span>
                          <button
                            onClick={() => setConfirmAddresses(!confirmAddresses)}
                            className={clsx(
                              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                              confirmAddresses ? (isDark ? "bg-blue-600" : "bg-blue-500") : (isDark ? "bg-gray-700" : "bg-gray-200")
                            )}
                          >
                            <span
                              className={clsx(
                                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                confirmAddresses ? "translate-x-6" : "translate-x-1"
                              )}
                            />
                          </button>
                        </div>
                      </div>

                      <CourierTimeWindows
                        courierId={String(selectedCourier || '')}
                        courierName={isId0CourierName(selectedCourier) ? 'Не назначено' : (String(selectedCourier) || '')}
                        orders={availableOrders}
                        isDark={isDark}
                        onOrderMoved={handleMoveOrderToGroup}
                        onCreateCustomGroup={handleCreateCustomGroup}
                        onCalculateRoute={async (group) => {
                          const groupOrderIds = group.orders.map(o => o.id);
                          setSelectedOrders(new Set(groupOrderIds));
                          setSelectedOrdersOrder(groupOrderIds);
                          // Автоматически создаем маршрут сразу без уведомления
                          createRoute(group.orders);
                        }}
                        onCalculateAllRoutes={async () => {
                          const groups = groupOrdersByTimeWindow(
                            availableOrders,
                            String(selectedCourier || ''),
                            isId0CourierName(selectedCourier) ? 'Не назначено' : (String(selectedCourier) || '')
                          );

                          // v5.34: UNIVERSAL TURBO - Batched State Updates
                          ;
                          try {
                            const courier = String(selectedCourier || '');
                            if (!courier || courier === 'Не назначено') return;

                            const newRoutes: Route[] = [];
                            const allOrderIdsToUpdate = new Set<string>();

                            groups.forEach((group, index) => {
                              const groupOrders = group.orders as Order[]; // Cast to local type to avoid mismatch
                              const newRoute: Route = {
                                id: `route_${Date.now()}_${index}`,
                                courier: courier,
                                orders: groupOrders,
                                totalDistance: 0,
                                totalDuration: 0,
                                startAddress,
                                endAddress,
                                isOptimized: false,
                                createdAt: Date.now()
                              };
                              newRoutes.push(newRoute);
                              groupOrders.forEach(o => allOrderIdsToUpdate.add(String(o.id)));
                            });

                            // Perform a SINGLE state update for all routes and order assignments
                            updateExcelData((prev: any) => {
                              const currentOrders = prev?.orders || [];
                              const updatedOrders = currentOrders.map((order: any) => {
                                if (allOrderIdsToUpdate.has(String(order.id))) {
                                  return { ...order, courier: courier };
                                }
                                return order;
                              });

                              return {
                                ...(prev || { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: undefined }),
                                routes: [...(prev?.routes || []), ...newRoutes],
                                orders: updatedOrders
                              };
                            });

                            // Reset selection once
                            setSelectedOrders(new Set());
                            setSelectedOrdersOrder([]);

                            // Parallel distance calculation for all new routes
                            await Promise.all(newRoutes.map(route => calculateRouteDistance(route)));
                          } catch (err) {
                            console.error('Batch route creation error:', err);
                            toast.error('Ошибка при создании группы маршрутов');
                          } finally {

                          }
                        }}
                      />
                    </div>
                  )}

                  {/* Список ручного выбора (на всю ширину) */}
                  <div className="flex flex-col gap-6" data-tour="order-select">
                    <div className={clsx(
                      "rounded-[3rem] p-10 border-2 shadow-2xl relative overflow-hidden",
                      isDark ? "bg-gray-800 border-gray-700 shadow-black/40" : "bg-white border-blue-50 shadow-blue-500/5"
                    )}>
                      {/* Декоративный фон для списка заказов */}
                      <div className="absolute top-0 left-0 w-64 h-64 bg-blue-500/5 rounded-full -ml-32 -mt-32 blur-2xl opacity-30"></div>

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

                        <div className="h-[600px] w-full overflow-y-auto pr-2 custom-scrollbar" data-tour="order-list">
                          {availableOrders.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 pb-4">
                              {availableOrders.map((order: Order) => (
                                <GridOrderCard
                                  key={order.id}
                                  order={order}
                                  isDark={isDark}
                                  isSelected={selectedOrders.has(order.id)}
                                  onSelect={(id) => handleOrderSelect(id, false)}
                                />
                              ))}
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
                                <OrderList
                                  orders={ordersInRoutes}
                                  isDark={isDark}
                                  selectedOrders={new Set()} // No selection in this list
                                  onSelectOrder={() => { }}
                                  isInRoute={true}
                                />
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
        <div className="mt-12">
          <div className={clsx(
            'rounded-[3rem] shadow-2xl border-2 p-10 overflow-hidden relative',
            isDark ? 'bg-gray-800 border-gray-700 shadow-black/40' : 'bg-white border-blue-50 shadow-blue-500/5'
          )}>
            {/* Декоративный фон */}
            <div className="absolute top-0 left-0 w-96 h-96 bg-purple-500/5 rounded-full -ml-48 -mt-48 blur-2xl opacity-50"></div>

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
                    <div className="flex items-center gap-3">
                      <button
                        onClick={clearFinishedRoutes}
                        className={clsx(
                          'px-6 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-all border-2',
                          isDark
                            ? 'border-green-500/30 text-green-400 hover:bg-green-500/10'
                            : 'border-green-100 text-green-600 hover:bg-green-50 hover:border-green-200 shadow-sm'
                        )}
                      >
                        Очистить завершенные
                      </button>
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
                    </div>
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
                        'group rounded-[2.5rem] border-2 p-8 transition-all duration-200 relative overflow-hidden',
                        isDark
                          ? 'bg-gray-800/40 border-gray-700 hover:border-blue-500/50 hover:bg-gray-800/80 shadow-black/20'
                          : 'bg-white border-blue-50 shadow-blue-500/5 hover:shadow-2xl hover:border-blue-400'
                      )}>
                        {/* Линия-акцент */}
                        <div className={clsx(
                          "absolute top-0 left-0 w-2 h-full transition-all duration-200",
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
                                  {courierVehicle === 'car' ? 'Авто' : 'Мото'}
                                </span>
                                {route.orders.every(o => o.status === 'Исполнен') && (
                                  <span className="bg-green-500 text-white text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-widest flex items-center gap-1">
                                    <CheckBadgeIcon className="w-3 h-3" />
                                    ГОТОВ
                                  </span>
                                )}
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
                            const metaBadge = (meta || order.kmlZone) ? (
                              <div className="mt-2 flex items-center flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
                                {meta?.locationType && (
                                  <span className={clsx(
                                    'px-2 py-0.5 rounded-lg border',
                                    meta.locationType === 'ROOFTOP'
                                      ? (isDark ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-green-50 text-green-700 border-green-200')
                                      : meta.locationType === 'RANGE_INTERPOLATED'
                                        ? (isDark ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 'bg-yellow-50 text-yellow-700 border-yellow-200')
                                        : (isDark ? 'bg-gray-700 text-gray-400 border-gray-600' : 'bg-gray-50 text-gray-600 border-gray-200')
                                  )}>{translateLocationType(meta.locationType)}</span>
                                )}
                                {typeof meta?.streetNumberMatched === 'boolean' && (
                                  <span className={clsx(
                                    'px-2 py-0.5 rounded-lg border',
                                    meta.streetNumberMatched
                                      ? (isDark ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-blue-50 text-blue-700 border-blue-200')
                                      : (isDark ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-red-50 text-red-700 border-red-200')
                                  )}>
                                    {meta.streetNumberMatched ? ' Найден номер дома' : ' Не нашел номера дома'}
                                  </span>
                                )}
                                {(meta?.zoneName || order.kmlZone) && (
                                  <span className={clsx(
                                    'px-2 py-0.5 rounded-lg border shadow-sm flex items-center gap-1',
                                    isDark ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                  )}>
                                    <MapIcon className="w-3 h-3" />
                                    {order.kmlZone || meta?.zoneName}
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
                                  "flex items-start justify-between p-4 rounded-2xl transition-all duration-200",
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
                                      {order.plannedTime && order.plannedTime !== '00:00' && order.plannedTime !== '00:00:00' && order.plannedTime !== 'Без времени' && (
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
                                      hasAddressIssues && 'text-red-500'
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
                              {/* Removed 'Вернется в' and 'Оптимизирован' blocks as they clutter the interface */}

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
                <div className="mt-12 flex items-center justify-center gap-2">
                  <button
                    onClick={() => setRoutePage(Math.max(0, routePage - 1))}
                    disabled={routePage === 0}
                    className={clsx(
                      'w-10 h-10 rounded-xl flex items-center justify-center transition-all disabled:opacity-20',
                      isDark ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    )}
                  >
                    <ChevronLeftIcon className="w-5 h-5" />
                  </button>

                  <div className="flex items-center gap-1 mx-2">
                    {Array.from({ length: totalRoutePages }).map((_, i) => {
                      // Show first, last, current, and pages around current
                      if (
                        i === 0 ||
                        i === totalRoutePages - 1 ||
                        (i >= routePage - 1 && i <= routePage + 1)
                      ) {
                        return (
                          <button
                            key={i}
                            onClick={() => setRoutePage(i)}
                            className={clsx(
                              'w-10 h-10 rounded-xl text-xs font-black transition-all',
                              routePage === i
                                ? (isDark ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-blue-600 text-white shadow-lg shadow-blue-500/30')
                                : (isDark ? 'bg-gray-800 text-gray-400 hover:bg-gray-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')
                            )}
                          >
                            {i + 1}
                          </button>
                        );
                      }
                      if (
                        (i === 1 && routePage > 2) ||
                        (i === totalRoutePages - 2 && routePage < totalRoutePages - 3)
                      ) {
                        return (
                          <span key={i} className="px-2 opacity-30 text-xs font-black">...</span>
                        );
                      }
                      return null;
                    })}
                  </div>

                  <button
                    onClick={() => setRoutePage(Math.min(totalRoutePages - 1, routePage + 1))}
                    disabled={routePage >= totalRoutePages - 1}
                    className={clsx(
                      'w-10 h-10 rounded-xl flex items-center justify-center transition-all disabled:opacity-20',
                      isDark ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    )}
                  >
                    <ChevronRightIcon className="w-5 h-5" />
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
                    title: 'Выбор курьера',
                    content: `Начните с выбора курьера из списка слева.

Что делать:
1) Найдите нужного курьера в списке
2) Кликните на карточку курьера
3) После выбора вы увидите доступные заказы справа

Подсказка: используйте фильтры «Все», «Авто» или «Мото» для быстрого поиска нужного типа курьера.`,
                    target: '[data-tour="courier-select"]',
                    position: 'right'
                  },
                  {
                    id: 'order-select',
                    title: 'Выбор заказов',
                    content: `Кликните на заказы, чтобы добавить их в маршрут.

Как это работает:
• Порядок выбора = порядок доставки
• Выбранные заказы подсвечиваются синим
• Используйте кнопки ↑ и ↓ для изменения порядка

Заказы, уже находящиеся в других маршрутах, нельзя выбрать.`,
                    target: '[data-tour="order-select"]',
                    position: 'left'
                  },
                  {
                    id: 'create-route',
                    title: 'Создание маршрута',
                    content: `После выбора заказов нажмите кнопку «Маршрутизация» для расчета оптимального пути.`,
                    target: '[data-tour="create-route"]',
                    position: 'top'
                  },
                  {
                    id: 'route-list',
                    title: 'Список маршрутов',
                    content: `Здесь отображаются все созданные маршруты.
Доступные действия:
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


        <ReturningCouriersModal
          show={showReturningModal}
          onClose={() => setShowReturningModal(false)}
          isDark={isDark}
          data={returningCouriersData}
          isGeocoding={isGeocodingETA}
          onSelectCourier={(name) => {
            setSelectedCourier(name);
            setShowReturningModal(false);
          }}
        />

        <TransitCouriersModal
          show={showTransitModal}
          onClose={() => setShowTransitModal(false)}
          isDark={isDark}
          data={transitCouriersData}
          onSelectCourier={(name) => {
            setSelectedCourier(name);
            setShowTransitModal(false);
          }}
        />


        {/* SOTA 5.0: Disambiguation Modal Implementation */}
        {
          disambModal && disambModal.open && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md transition-all duration-300 animate-in fade-in">
              <div className={clsx(
                "w-full max-w-xl rounded-2xl shadow-2xl border overflow-hidden animate-in zoom-in-95 duration-300",
                isDark ? "bg-gray-900 border-white/10" : "bg-white border-gray-200"
              )}>
                <div className={clsx("px-6 py-4 flex items-center gap-3 border-b", isDark ? "bg-gray-800/50 border-white/5" : "bg-gray-50 border-gray-100")}>
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <QuestionMarkCircleIcon className="w-6 h-6 text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <h3 className={clsx("text-lg font-black uppercase tracking-tight", isDark ? "text-white" : "text-gray-900")}>Уточнение адреса</h3>
                    <p className={clsx("text-xs font-bold opacity-60", isDark ? "text-gray-400" : "text-gray-500")}>
                      {disambModal.title}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDisambiguationResolve(null)}
                    className={clsx("p-2 rounded-xl transition-colors", isDark ? "hover:bg-white/10 text-gray-400" : "hover:bg-gray-100 text-gray-500")}
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
                  {disambModal.options.map((option, idx) => {
                    const isTechnical = option.res?.zone?.name?.toLowerCase().includes('авторозвантаження') ||
                      option.res?.zone?.name?.toLowerCase().includes('разгрузка');

                    return (
                      <div key={idx} className="group relative">
                        <button
                          onClick={() => handleDisambiguationResolve(option.res)}
                          className={clsx(
                            "w-full p-4 rounded-xl border text-left transition-all relative overflow-hidden",
                            isDark
                              ? "bg-white/5 border-white/10 hover:border-blue-500/50 hover:bg-white/10"
                              : "bg-gray-50 border-gray-100 hover:border-blue-400 hover:bg-white hover:shadow-lg"
                          )}
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={clsx("text-sm font-bold", isDark ? "text-gray-200" : "text-gray-800")}>
                                  {option.label}
                                </span>
                                {isTechnical && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-black uppercase">ТЕХНИЧЕСКИЙ</span>
                                )}
                                {option.zoneName && (
                                  <span className={clsx(
                                    "text-[9px] px-1.5 py-0.5 rounded font-black uppercase",
                                    isTechnical
                                      ? "bg-amber-500/5 text-amber-600/70"
                                      : "bg-blue-500/10 text-blue-500"
                                  )}>
                                    {option.zoneName}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-4 text-[10px] font-bold opacity-50">
                                {option.distanceMeters !== undefined && (
                                  <span>Дистанция: {formatDisplayDistance(option.distanceMeters)}</span>
                                )}
                                {option.res?.geometry?.location_type && (
                                  <span>Тип: {translateLocationType(option.res.geometry.location_type)}</span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {option.res?.geometry?.location && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const lat = typeof option.res.geometry.location.lat === 'function' ? option.res.geometry.location.lat() : option.res.geometry.location.lat;
                                    const lng = typeof option.res.geometry.location.lng === 'function' ? option.res.geometry.location.lng() : option.res.geometry.location.lng;
                                    window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
                                  }}
                                  className={clsx(
                                    "flex items-center justify-center p-2 rounded-xl transition-all",
                                    isDark
                                      ? "bg-white/5 hover:bg-white/15 text-blue-400 border border-white/10"
                                      : "bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-100"
                                  )}
                                  title="Посмотреть на карте"
                                >
                                  <MapIcon className="w-4 h-4" />
                                </button>
                              )}
                              <ChevronRightIcon className="w-5 h-5 text-blue-500 transition-transform group-hover:translate-x-1" />
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className={clsx("px-6 py-4 border-t flex justify-end", isDark ? "bg-gray-800/30 border-white/5" : "bg-gray-50/50 border-gray-100")}>
                  <button
                    onClick={() => handleDisambiguationResolve(null)}
                    className={clsx(
                      "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                      isDark ? "text-gray-400 hover:text-white hover:bg-white/10" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                    )}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            </div>
          )}
      </>
    </div>
  );
};
