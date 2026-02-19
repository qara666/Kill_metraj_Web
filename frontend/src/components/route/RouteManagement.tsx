import React, { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react'
import { OrderList } from './OrderList'
import {
  MapIcon,
  TruckIcon,
  InboxIcon,
  PlusIcon,
  TrashIcon,
  ClockIcon,
  MapPinIcon,
  CheckBadgeIcon,
  PencilIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  QuestionMarkCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon
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
import { CourierTimeWindows } from './CourierTimeWindows'
import { getUkraineTrafficForOrders, calculateTotalTrafficDelay } from '../../utils/maps/ukraineTrafficAPI'
import { type TimeWindowGroup } from '../../utils/route/routeCalculationHelpers'
import { SmartAddressCorrectionModal } from '../modals/SmartAddressCorrectionModal'
import { BatchAddressCorrectionPanel } from './BatchAddressCorrectionPanel'
import { useSmartAddressCorrection } from '../../hooks/useSmartAddressCorrection'
import { getAddressZoneValidator } from '../../services/addressZoneValidator'
import { isId0CourierName, normalizeCourierName } from '../../utils/data/courierName'

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
  paymentMethod?: string
  coords?: { lat: number; lng: number }
  manualGroupId?: string
  deadlineAt?: number | null
  handoverAt?: number | null
  status?: string
  statusTimings?: {
    assembledAt?: number;
    deliveringAt?: number;
    completedAt?: number;
  };
  raw?: any
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
  const isOnRoute = totalOrdersCount > 0 && deliveredOrdersCount < totalOrdersCount && deliveredOrdersCount > 0

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
            {(isOnRoute || isFinished) && (
              <div className={clsx(
                'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2',
                isDark ? 'border-gray-800' : 'border-white',
                isFinished ? 'bg-green-500' : 'bg-blue-500'
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

  const [isCalculating, setIsCalculating] = useState(false)
  const [startAddress, setStartAddress] = useState('')
  const [endAddress, setEndAddress] = useState('')
  const [orderSearchTerm, setOrderSearchTerm] = useState('')
  const [courierSearchTerm, setCourierSearchTerm] = useState('')
  const [courierSortType, setCourierSortType] = useState<'alpha' | 'load'>('alpha')
  // Debounce hook
  const useDebounce = <T,>(value: T, delay: number): T => {
    const [debouncedValue, setDebouncedValue] = useState<T>(value)
    useEffect(() => {
      const handler = setTimeout(() => {
        setDebouncedValue(value)
      }, delay)
      return () => {
        clearTimeout(handler)
      }
    }, [value, delay])
    return debouncedValue
  }

  const debouncedCourierSearchTerm = useDebounce(courierSearchTerm, 300)
  const debouncedOrderSearchTerm = useDebounce(orderSearchTerm, 300)

  const [googleMapsReady, setGoogleMapsReady] = useState(false)
  const [courierFilter, setCourierFilter] = useState<string>('all')
  const [selectedHubs, setSelectedHubs] = useState<string[]>(localStorageUtils.getAllSettings().selectedHubs || [])
  const [selectedZones, setSelectedZones] = useState<string[]>(localStorageUtils.getAllSettings().selectedZones || [])
  const [routePage, setRoutePage] = useState(0)
  const [routesPerPage] = useState(5) // Количество маршрутов на странице
  const [sortRoutesByNewest] = useState(true)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [routeToDelete, setRouteToDelete] = useState<Route | null>(null)
  const [showAddressEditModal, setShowAddressEditModal] = useState(false)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [routeAnomalies, setRouteAnomalies] = useState<Map<string, RouteAnomalyCheck>>(new Map())
  // Disambiguation modal state for choosing among multiple in-sector candidates
  const [disambModal, setDisambModal] = useState<{ open: boolean; title: string; options: Array<{ label: string; distanceMeters?: number; res: any }> } | null>(null)
  const disambResolver = useRef<(choice: any | null) => void>()

  // Smart Address Correction
  const [showCorrectionModal, setShowCorrectionModal] = useState(false)
  const [showBatchPanel, setShowBatchPanel] = useState(false)
  const [currentProblem, setCurrentProblem] = useState<any>(null)
  const [problemOrders, setProblemOrders] = useState<any[]>([])
  const [routeToRecalculate, setRouteToRecalculate] = useState<Route | null>(null)

  const { validateOrders, applyCorrection, applyBatchCorrections, applyManualEdit } = useSmartAddressCorrection({
    updateExcelData,
    onCorrectionComplete: useCallback(() => {
      // Trigger route recalculation if needed
      if (routeToRecalculate) {
        setTimeout(() => {
          calculateRouteDistance(routeToRecalculate)
          setRouteToRecalculate(null)
        }, 500)
      }

      // If there are more problems in single mode, show next
      if (showCorrectionModal && problemOrders.length > 1 && currentProblem) {
        const remaining = problemOrders.filter(p => p.order.id !== currentProblem.order.id)
        setProblemOrders(remaining)
        if (remaining.length > 0) {
          setCurrentProblem(remaining[0])
          // Modal stays open, content updates
        } else {
          setShowCorrectionModal(false)
          setCurrentProblem(null)
        }
      } else {
        setShowCorrectionModal(false)
        setShowBatchPanel(false)
        setProblemOrders([])
        setCurrentProblem(null)
      }
    }, [routeToRecalculate, problemOrders, currentProblem, showCorrectionModal])
  })

  // Синхронизация AddressZoneValidator с KML данными и фильтрами
  useEffect(() => {
    const settings = localStorageUtils.getAllSettings()
    if (settings.kmlData?.polygons) {
      const v = getAddressZoneValidator()

      let polygonsToSync = settings.kmlData.polygons

      // Если выбраны конкретные хабы или зоны, ограничиваем валидатор ими
      if (selectedHubs.length > 0) {
        polygonsToSync = polygonsToSync.filter((p: any) => selectedHubs.includes(p.folderName))
      }

      if (selectedZones.length > 0) {
        polygonsToSync = polygonsToSync.filter((p: any) => {
          const zoneKey = `${p.folderName}:${p.name}`
          return selectedZones.includes(zoneKey)
        })
      }

      const zones = polygonsToSync.map((p: any) => ({
        id: `${p.folderName}:${p.name}`,
        name: p.name,
        polygon: p.path,
        hub: settings.kmlData.markers?.find((m: any) => m.folderName === p.folderName)
      }))

      v.setZones(zones)
    }
  }, [selectedHubs, selectedZones, googleMapsReady])

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

    // Если есть KML данные и только один хаб, выбираем его по умолчанию
    if (settings.kmlData?.polygons) {
      const hubs = Array.from(new Set(settings.kmlData.polygons.map((p: any) => p.folderName))) as string[]
      if (hubs.length === 1 && selectedHubs.length === 0) {
        setSelectedHubs([hubs[0]])
      }
    }
  }, [])

  // Автоматическая установка адреса старта/финиша при выборе хаба (если в KML есть маркер типа "База")
  useEffect(() => {
    if (selectedHubs.length === 0) return
    const settings = localStorageUtils.getAllSettings()

    // Если пользователь явно задал адреса в настройках, уважаем их и не перетираем данными из KML
    if (settings.defaultStartAddress && settings.defaultStartAddress.trim() !== '') {
      return
    }

    if (!settings.kmlData?.markers) return

    // Берем первый выбранный хаб для определения базы
    const firstHub = selectedHubs[0]
    const hubMarkers = settings.kmlData.markers.filter((m: any) => m.folderName === firstHub)
    if (hubMarkers.length > 0) {
      // Ищем маркер с названием "База", "Base", "Старт" или просто берем первый
      const baseMarker = hubMarkers.find((m: any) =>
        /база|base|старт|hub|склад|центр/i.test(m.name)
      ) || hubMarkers[0]

      if (baseMarker) {
        // Если у маркера есть координаты, используем их
        const addr = baseMarker.name
        setStartAddress(addr)
        setEndAddress(addr)
        // toast.success(`Установлена база локации: ${addr}`, { icon: '', duration: 3000 })
      }
    }
  }, [selectedHubs])

  // Проверяем готовность Google Maps
  useEffect(() => {
    const handleSettingsUpdate = (e: any) => {
      const newSettings = e.detail?.settings
      if (newSettings && newSettings.selectedHubs !== undefined) {
        setSelectedHubs(newSettings.selectedHubs)
      }
      if (newSettings && newSettings.selectedZones !== undefined) {
        setSelectedZones(newSettings.selectedZones)
      }
    }
    window.addEventListener('km-settings-updated', handleSettingsUpdate)
    return () => window.removeEventListener('km-settings-updated', handleSettingsUpdate)
  }, [])

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
      if (order.address) {
        const courierName = normalizeCourierName(order?.courier) || 'Не назначено'

        if (!grouped[courierName]) {
          grouped[courierName] = []
        }

        grouped[courierName].push({
          id: order.id ? String(order.id) : `order_${order.orderNumber || Date.now()}`,
          orderNumber: order.orderNumber || 'N/A',
          address: order.address,
          courier: courierName, // Use the normalized name
          amount: order.amount || 0,
          phone: order.phone || '',
          customerName: order.customerName || '',
          plannedTime: order.plannedTime || '',
          paymentMethod: order.paymentMethod || '', // Добавляем способ оплаты
          manualGroupId: order.manualGroupId,      // Phase 4.7
          deadlineAt: order.deadlineAt,            // IMPORTANT: For grouping logic
          handoverAt: order.handoverAt,            // For grouping logic
          status: order.status,                    // Ensure status is passed
          statusTimings: order.statusTimings,      // Pass status timings
          raw: order,                              // Pass full raw object for access to extra fields
          isSelected: false
        })
      }
    })

    return grouped
  }, [excelData?.orders])

  // Precompute set of orders in routes for O(1) lookups
  const ordersInRoutesSet = useMemo(() => {
    const set = new Set()
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
      ...Object.keys(courierOrders),
      ...(excelData?.couriers?.map((c: any) => c.name) || [])
    ])).filter(n => n && n !== 'Не назначено' && n !== 'ID:0')

    let activeCount = 0
    let finishedCount = 0
    let totalDelivered = 0
    let totalExpected = 0

    couriersList.forEach(name => {
      const m = courierMetricsMap.get(name) || { available: 0, delivered: 0, total: 0 }
      if (m.total > 0) {
        if (m.delivered === m.total) finishedCount++
        else if (m.delivered > 0) activeCount++
        totalDelivered += m.delivered
        totalExpected += m.total
      }
    })

    const avgProgress = totalExpected > 0 ? (totalDelivered / totalExpected) * 100 : 0

    return {
      total: couriersList.length,
      active: activeCount,
      finished: finishedCount,
      progress: avgProgress
    }
  }, [courierOrders, excelData?.couriers, getCourierMetrics])

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

  // Определяем тип транспорта курьера
  const getCourierVehicleType = (courierName: string) => {
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
  }

  const handleCourierSelect = useCallback((courierName: string) => {
    setSelectedCourier(courierName)
    // При смене курьера сбрасываем выбор и порядок, чтобы избежать артефактов
    setSelectedOrders(new Set())
    setSelectedOrdersOrder([])
  }, [])

  const filteredCouriers = useMemo(() => {
    let result = couriers

    // Filter by type
    if (courierFilter !== 'all') {
      result = result.filter(courierName => {
        const vehicleType = getCourierVehicleType(courierName)
        return vehicleType === courierFilter
      })
    }

    // Filter by search (debounced)
    if (debouncedCourierSearchTerm) {
      const term = debouncedCourierSearchTerm.toLowerCase()
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
  }, [couriers, courierFilter, debouncedCourierSearchTerm, courierSortType, getCourierMetrics])




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
    if (!debouncedOrderSearchTerm.trim()) return orders

    const searchTerm = debouncedOrderSearchTerm.toLowerCase().trim()
    return orders.filter(order =>
      String(order.orderNumber).toLowerCase().includes(searchTerm) ||
      (order.customerName || '').toLowerCase().includes(searchTerm) ||
      (order.address || '').toLowerCase().includes(searchTerm)
    )
  }, [debouncedOrderSearchTerm])

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
    if (!courier || courier === 'Не назначено') return

    // Требуем выбранный город в настройках
    {
      const settings = localStorageUtils.getAllSettings()
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

    // Добавляем новый маршрут и синхронизируем курьера в списке всех заказов
    updateExcelData((prev: any) => {
      const currentOrders = prev?.orders || []
      const updatedOrders = currentOrders.map((order: any) => {
        // Если ID заказа в списке создаваемого маршрута, обновляем его курьера
        const isAssignedToThisRoute = selectedOrdersList.some(so => String(so.id) === String(order.id))
        if (isAssignedToThisRoute) {
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

    // Автоматически рассчитываем расстояние для нового маршрута
    setTimeout(() => {
      calculateRouteDistance(newRoute)
    }, 100)
  }

  // Функция для очистки адреса от лишней информации
  const cleanAddress = (address: string) => {
    if (!address) return address

    // Удаляем информацию после номера дома (подъезд, этаж, подвал и т.д.)
    let cleaned = address
      .replace(/,\s*(под\.|подъезд|д\/ф|эт|этаж|эт\.|под|кв|квартира|оф|офис).*$/i, '')
      .replace(/,\s*\d+\s*(под\.|подъезд|д\/ф|эт|этаж|эт\.|под|кв|квартира|оф|офис).*$/i, '')
      .trim()

    // Убираем ведущий "Київ," или "Киев," если он идёт первым токеном —
    // это часто ошибочный префикс из CRM (адрес реально в области).
    // Мы удаляем его только если в адресе нет явного указания на область,
    // чтобы не сломать настоящие киевские адреса.
    // Пример: "Київ, вул. Лесі Українки, 74в" → "вул. Лесі Українки, 74в"
    // (потом cleanAddressForRoute добавит "Київська область, Україна")
    cleaned = cleaned.replace(/^(Київ|Киев|Kyiv|Kiev)\s*,\s*/i, '')

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
    const hasRegion = lower.includes('область') || lower.includes('oblast')
    const hasCountry = lower.includes('украина') || lower.includes('україна') || lower.includes('ukraine') || lower.includes(country.toLowerCase())

    // Для Киева используем "Киев", чтобы обеспечить точность в центре.
    // Спутники (Вишневое и т.д.) будут найдены через geocodeInsideOnly (исчерпывающий поиск).
    const cityOrRegion = city

    if (!hasCity && !hasRegion && !hasCountry) return `${base}, ${cityOrRegion}, ${country}`
    if (!hasCountry) return `${base}, ${country}`
    return base
  }, [getSelectedCity])

  const calculateRouteDistance = async (route: Route) => {
    if (!googleMapsReady) {
      // Проверяем, есть ли API ключ в настройках
      if (!localStorageUtils.hasApiKey()) {
        toast.error('Google Maps API ключ не найден в настройках. Пожалуйста, добавьте ключ.')
        return
      }

      // Пытаемся загрузить Google Maps API если он не готов
      try {
        await googleMapsLoader.load()
        setGoogleMapsReady(true)
      } catch (error) {
        toast.error('Ошибка загрузки Google Maps API. Проверьте настройки API ключа.')
        return
      }
    }

    // Проверяем аномалии перед расчетом
    const anomalyCheck = AddressValidationService.checkRouteAnomalies(route)
    setRouteAnomalies(prev => new Map(prev).set(route.id, anomalyCheck))

    if (anomalyCheck.hasAnomalies && anomalyCheck.errors.length > 0) {
      const errorMessage = `Обнаружены ошибки в маршруте:\n${anomalyCheck.errors.join('\n')}\n\nРасчет невозможен. Исправьте ошибки в адресах.`
      toast.error(errorMessage)
      return
    }

    // Предупреждения не блокируют расчет — продолжаем автоматически
    if (anomalyCheck.warnings.length > 0) {
      console.warn('Route warnings:', anomalyCheck.warnings)
    }

    setIsCalculating(true)

    try {

      const settings = localStorageUtils.getAllSettings()
      const cityCtx = getSelectedCity()

      // Логика секторов: Используем Хабы из KML
      // OPTIMIZATION: Instantiate Polygons ONCE outside the loop to prevent massive GC churn
      // This fixes the "lag/freeze" issue on weak devices
      let cachedHubPolygons: { folderName: string; name: string; googlePoly: any }[] = []
      if (selectedHubs.length > 0 && settings.kmlData?.polygons) {
        const rawPolys = settings.kmlData.polygons.filter((p: any) => selectedHubs.includes(p.folderName))
        cachedHubPolygons = rawPolys.map((p: any) => ({
          ...p,
          googlePoly: new window.google.maps.Polygon({ paths: p.path })
        }))
      }

      // Pre-cache ALL KML polygons for checkAnyKmlZone
      let cachedAllKmlPolygons: { folderName: string; name: string; googlePoly: any }[] = []
      if (settings.kmlData?.polygons) {
        cachedAllKmlPolygons = settings.kmlData.polygons.map((p: any) => ({
          ...p,
          googlePoly: new window.google.maps.Polygon({ paths: p.path })
        }))
      }

      // Для проверки вхождения используем все ПОЛИГОНЫ хаба (с учетом фильтра зон)
      const checkInside = (latLng: any) => {
        if (cachedHubPolygons.length > 0) {
          return cachedHubPolygons.some((p: any) => {
            // Если выбраны конкретные зоны, проверяем только их
            if (selectedZones.length > 0) {
              const zoneKey = `${p.folderName}:${p.name}`
              if (!selectedZones.includes(zoneKey)) return false
            }

            // Use CACHED polygon instance
            return window.google.maps.geometry.poly.containsLocation(latLng, p.googlePoly)
          })
        }
        return true // Если нет КМЛ ограничений — валидно
      }

      // Проверка попадания в ЛЮБУЮ зону KML (для приоритезации при геокодировании)
      const checkAnyKmlZone = (latLng: any) => {
        if (cachedAllKmlPolygons.length === 0) return false
        return cachedAllKmlPolygons.some((p: any) => {
          // Use CACHED polygon instance
          return window.google.maps.geometry.poly.containsLocation(latLng, p.googlePoly)
        })
      }

      // Полигон сектора для containsLocation (используем checkInside вместо прямого полигона)
      const isInsideSector = (loc: any) => checkInside(loc)

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

        // ПРИОРИТЕТ: Попадание в любую зону KML (глобальное исправление для Вишневого и т.д.)
        if (checkAnyKmlZone(candidate.geometry.location)) {
          score += 500 // Сильный бонус для зон KML
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
        const results: any = await googleApiCache.geocode(request)
        if (!results || results.length === 0) return null
        const expectedHouse = extractHouseNumber(rawAddress)
        const expectedPostal = extractPostal(rawAddress)
        const refPoint = hintPoint || null
        const hasRestriction = cachedHubPolygons.length > 0
        const inside = hasRestriction
          ? results.filter((r: any) => isInsideSector(r.geometry.location))
          : []
        const pool = (inside.length > 0 ? inside : results)
        let best = pool[0]
        let bestScore = scoreCandidate(best, { refPoint, expectedHouse, expectedPostal, inside: hasRestriction ? isInsideSector(best.geometry.location) : true })
        for (let i = 1; i < pool.length; i++) {
          const cand = pool[i]
          const candScore = scoreCandidate(cand, { refPoint, expectedHouse, expectedPostal, inside: hasRestriction ? isInsideSector(cand.geometry.location) : true })
          if (candScore > bestScore) { best = cand; bestScore = candScore }
        }
        // если мы выбрали снаружи, а есть варианты внутри, попробуем лучшего внутри
        if (hasRestriction && inside.length > 0 && !isInsideSector(best.geometry.location)) {
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

        // МУЛЬТИ-СТРАТЕГИЯ: если лучший результат не ROOFTOP и не в KML-зоне,
        // пробуем дополнительные стратегии геокодирования
        if (best?.geometry?.location_type !== 'ROOFTOP' && !checkAnyKmlZone(best?.geometry?.location)) {
          // Стратегия 1: добавляем названия населённых пунктов из KML-папок
          const kmlTowns: string[] = []
          if (settings.kmlData?.polygons) {
            settings.kmlData.polygons.forEach((p: any) => {
              if (p.folderName && !kmlTowns.includes(p.folderName)) kmlTowns.push(p.folderName)
              if (p.name && !kmlTowns.includes(p.name)) kmlTowns.push(p.name)
            })
          }
          for (const town of kmlTowns.slice(0, 5)) {
            // Пропускаем если уже содержится в адресе
            if (address.toLowerCase().includes(town.toLowerCase())) continue
            // eslint-disable-next-line no-await-in-loop
            const townRes: any = await googleApiCache.geocode({ ...request, address: `${address}, ${town}` })
            if (townRes && townRes.length > 0) {
              const insideTown = townRes.filter((r: any) => checkAnyKmlZone(r.geometry.location))
              if (insideTown.length > 0) {
                const candidate = insideTown[0]
                // Проверяем что номер дома совпадает
                if (!expectedHouse || (candidate.formatted_address || '').toLowerCase().includes(expectedHouse.toLowerCase())) {
                  best = candidate
                  break
                }
              }
            }
          }
        }

        return best
      }

      // Повторная попытка: возвращает ЛУЧШЕГО кандидата ТОЛЬКО внутри полигона (если нет — null)
      const geocodeInsideOnly = async (rawAddress: string, hintPoint?: any): Promise<any | null> => {
        const hasRestriction = cachedHubPolygons.length > 0
        if (!hasRestriction) return null
        const address = cleanAddressForRoute(rawAddress)
        const request: any = {
          address,
          region: cityCtx.region,
          componentRestrictions: { country: 'ua' }
        }
        const results: any = await googleApiCache.geocode(request)
        let gathered = results
        if (!gathered || gathered.length === 0) gathered = []
        let inside = gathered.filter((r: any) => isInsideSector(r.geometry.location))
        // Если внутри сектора кандидатов нет — пробуем альтернативные формы улицы
        if (inside.length === 0) {
          const alts = generateStreetVariants(rawAddress)
          for (const alt of alts) {
            // eslint-disable-next-line no-await-in-loop
            const altRes: any = await googleApiCache.geocode({ ...request, address: alt })
            if (altRes && altRes.length > 0) {
              const insideAlt = altRes.filter((r: any) => isInsideSector(r.geometry.location))
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
                const insideSub = subRes.filter((r: any) => isInsideSector(r.geometry.location))
                if (insideSub.length > 0) inside = insideSub
              }
            }
          }
        }

        // ═══════════════════════════════════════════════════════════════
        // ИСЧЕРПЫВАЮЩИЙ ПОИСК ПО KML-ЗОНАМ:
        // Если адрес всё ещё не найден внутри сектора, пробуем явно
        // добавить название каждого населённого пункта из KML-папок
        // + варианты с областью. Это решает кейс:
        //   "вул. Лесі Українки, 74в" → ищем с "Вишневе", "Київська область"
        // ═══════════════════════════════════════════════════════════════
        if (inside.length === 0 && settings.kmlData?.polygons) {
          // Собираем уникальные названия населённых пунктов из KML
          const kmlTowns = new Set<string>()
          settings.kmlData.polygons.forEach((p: any) => {
            if (p.folderName) kmlTowns.add(p.folderName)
            if (p.name) kmlTowns.add(p.name)
          })

          // Области для перебора (Київська, Харківська и т.д.)
          const oblastVariants = [
            'Київська область', 'Kyivska oblast',
            'Харківська область', 'Одеська область', 'Полтавська область'
          ]

          // Базовый адрес без города (уже очищен cleanAddress)
          const baseAddr = cleanAddress(rawAddress)

          const searchVariants: string[] = []
          // Вариант 1: адрес + каждый населённый пункт из KML
          kmlTowns.forEach(town => {
            searchVariants.push(`${baseAddr}, ${town}`)
            searchVariants.push(`${baseAddr}, ${town}, Київська область, Україна`)
          })
          // Вариант 2: адрес + область без города
          oblastVariants.forEach(oblast => {
            searchVariants.push(`${baseAddr}, ${oblast}, Україна`)
          })

          for (const variant of searchVariants) {
            // eslint-disable-next-line no-await-in-loop
            const varRes: any = await googleApiCache.geocode({ ...request, address: variant })
            if (varRes && varRes.length > 0) {
              const insideVar = varRes.filter((r: any) => isInsideSector(r.geometry.location))
              if (insideVar.length > 0) {
                inside = insideVar
                break
              }
              // Если не в секторе, но в любой KML-зоне — тоже берём как запасной
              const anyZone = varRes.filter((r: any) => checkAnyKmlZone(r.geometry.location))
              if (anyZone.length > 0 && inside.length === 0) {
                inside = anyZone // запасной вариант, продолжаем искать лучше
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

      // Вспомогательная функция: вычисляем центроид набора точек
      const computeCentroid = (points: any[]): any | null => {
        const valid = points.filter(Boolean)
        if (valid.length === 0) return null
        let sumLat = 0, sumLng = 0
        valid.forEach((p: any) => {
          sumLat += p.lat ? p.lat() : p.lat
          sumLng += p.lng ? p.lng() : p.lng
        })
        return new window.google.maps.LatLng(sumLat / valid.length, sumLng / valid.length)
      }

      // Вспомогательная функция: расстояние между двумя LatLng (метры)
      const distBetween = (a: any, b: any): number => {
        try { return window.google.maps.geometry.spherical.computeDistanceBetween(a, b) } catch { return Infinity }
      }

      // Разрешаем координаты для всех точек маршрута
      let originRes = await geocodeWithSector(route.startAddress)
      const waypointResList: Array<any | null> = []
      let prevPoint = originRes?.geometry?.location || null
      for (const order of route.orders) {
        // Используем предыдущую точку маршрута для приоритета близости
        // eslint-disable-next-line no-await-in-loop
        const res = await geocodeWithSector(order.address, prevPoint)
        waypointResList.push(res)
        if (res?.geometry?.location) prevPoint = res.geometry.location
      }
      let destinationRes = (route.endAddress === route.startAddress)
        ? originRes
        : await geocodeWithSector(route.endAddress, prevPoint)

      // ═══════════════════════════════════════════════════════════════
      // ДЕТЕКТОР ВЫБРОСОВ: если одна точка сильно отличается от остальных
      // — это признак неправильного геокодирования (например, ул. Леси
      // Украинки нашлась в другом городе). Перегеокодируем выброс строго
      // внутри KML-зон.
      // ═══════════════════════════════════════════════════════════════
      const OUTLIER_THRESHOLD_M = 50_000 // 50 км — явный выброс
      const allResolved: Array<{ res: any; label: string; rawAddr: string }> = [
        { res: originRes, label: 'Стартовый адрес', rawAddr: route.startAddress },
        ...waypointResList.map((r, i) => ({ res: r, label: `Заказ #${route.orders[i].orderNumber}`, rawAddr: route.orders[i].address })),
        { res: destinationRes, label: 'Конечный адрес', rawAddr: route.endAddress }
      ]

      const resolvedLocs = allResolved.map(x => x.res?.geometry?.location).filter(Boolean)
      if (resolvedLocs.length >= 3) {
        const centroid = computeCentroid(resolvedLocs)
        if (centroid) {
          for (let i = 0; i < allResolved.length; i++) {
            const item = allResolved[i]
            if (!item.res?.geometry?.location) continue
            const d = distBetween(item.res.geometry.location, centroid)
            if (d > OUTLIER_THRESHOLD_M) {
              // Пересчитываем центроид без этой точки
              const otherLocs = resolvedLocs.filter((_, j) => j !== i)
              const centroidWithout = computeCentroid(otherLocs)
              const dWithout = centroidWithout ? distBetween(item.res.geometry.location, centroidWithout) : d
              if (dWithout > OUTLIER_THRESHOLD_M) {
                // Точка — выброс. Пробуем перегеокодировать строго внутри KML
                // eslint-disable-next-line no-await-in-loop
                const fix = await geocodeInsideOnly(item.rawAddr, centroidWithout)
                if (fix) {
                  toast(`⚠️ Адрес "${item.label}" скорректирован — первоначальный результат был слишком далеко от маршрута.`, { duration: 5000 })
                  if (i === 0) originRes = fix
                  else if (i === allResolved.length - 1) destinationRes = fix
                  else waypointResList[i - 1] = fix
                  // Обновляем локацию в массиве для следующих итераций
                  resolvedLocs[i] = fix.geometry.location
                }
              }
            }
          }
        }
      }
      // Подготовим метаинформацию для визуальной верификации
      const buildMeta = (res: any, raw: string) => {
        if (!res) return null
        const comps = res.address_components || []
        const house = extractHouseNumber(raw)
        const postal = extractPostal(raw)
        const streetNumComp = comps.find((c: any) => c.types?.includes('street_number'))
        const postalComp = comps.find((c: any) => c.types?.includes('postal_code'))
        const lat = res.geometry?.location?.lat ? res.geometry.location.lat() : undefined
        const lng = res.geometry?.location?.lng ? res.geometry.location.lng() : undefined

        let zoneInfo = null
        if (lat !== undefined && lng !== undefined && settings.kmlData) {
          zoneInfo = AddressValidationService.checkInKmlSectors(lat, lng, settings.kmlData, selectedHubs, selectedZones)
        }

        return {
          locationType: res.geometry?.location_type || 'UNKNOWN',
          placeId: res.place_id || null,
          streetNumberMatched: !!house && ((res.formatted_address || '').toLowerCase().includes(house.toLowerCase()) || (streetNumComp?.long_name || '').toLowerCase() === house.toLowerCase()),
          postalMatched: !!postal && (postalComp?.long_name === postal || (res.formatted_address || '').includes(postal)),
          formatted: res.formatted_address || '',
          lat,
          lng,
          zoneName: zoneInfo?.zoneName || null,
          hubName: zoneInfo?.hubName || null
        }
      }
      // Валидация
      const unresolved: string[] = []
      if (!originRes) unresolved.push('стартовый адрес')
      waypointResList.forEach((r, idx) => { if (!r) unresolved.push(`точка #${idx + 1}`) })
      if (!destinationRes) unresolved.push('финишный адрес')
      if (unresolved.length > 0) {
        toast.error(`Не удалось однозначно определить: ${unresolved.join(', ')}. Уточните адреса или границы сектора.`)
        setIsCalculating(false)
        return
      }

      // Проверка попадания в сектор (если есть) + повторная попытка для внешних точек
      if (cachedHubPolygons.length > 0) {
        const all = [originRes, ...waypointResList, destinationRes]

        let anyOutside = false
        all.forEach((r: any) => { if (r && !isInsideSector(r.geometry.location)) anyOutside = true })

        if (anyOutside) {
          // Пробуем переразрешить только внешние точки строго внутри полигона
          // origin
          if (originRes && !isInsideSector(originRes.geometry.location)) {
            const fix = await geocodeInsideOnly(route.startAddress, null)
            if (fix) originRes = fix
          }
          // waypoints
          for (let i = 0; i < waypointResList.length; i++) {
            const r = waypointResList[i]
            if (r && !isInsideSector(r.geometry.location)) {
              // eslint-disable-next-line no-await-in-loop
              const prev = i === 0 ? (originRes?.geometry?.location || null) : (waypointResList[i - 1]?.geometry?.location || null)
              const fix = await geocodeInsideOnly(route.orders[i].address, prev)
              if (fix) waypointResList[i] = fix
            }
          }
          // destination
          if (destinationRes && !isInsideSector(destinationRes.geometry.location)) {
            const prev = waypointResList.length > 0 ? (waypointResList[waypointResList.length - 1]?.geometry?.location || null) : (originRes?.geometry?.location || null)
            const fix = await geocodeInsideOnly(route.endAddress, prev)
            if (fix) destinationRes = fix
          }


          // Final sync for identical addresses to ensure perfect round-trip
          if (route.startAddress === route.endAddress) {
            destinationRes = originRes;
          }

          // Повторная валидация с деталями
          const pointsToCheck = [
            { name: 'Стартовый адрес', addr: route.startAddress, res: originRes },
            ...waypointResList.map((r, i) => ({ name: `Заказ #${route.orders[i].orderNumber}`, addr: route.orders[i].address, res: r })),
            { name: 'Конечный адрес', addr: route.endAddress, res: destinationRes }
          ]

          const outsidePoints = pointsToCheck.filter((p: any) => p.res && !isInsideSector(p.res.geometry.location))

          if (outsidePoints.length > 0) {
            // Smart Address Correction Integration
            const problems = await validateOrders(route.orders)

            if (problems.length > 0) {
              setProblemOrders(problems)
              setRouteToRecalculate(route)

              if (problems.length === 1) {
                setCurrentProblem(problems[0])
                setShowCorrectionModal(true)
              } else {
                setShowBatchPanel(true)
              }
            } else {
              const names = outsidePoints.map(p => p.name).join(', ')
              const hubsDesc = selectedHubs.length > 0 ? ` в хабах: ${selectedHubs.join(', ')}` : ''
              toast.error(`Точки вне зоны${hubsDesc}: ${names}. Проверьте адреса.`, { duration: 5000 })
            }

            setIsCalculating(false)
            return
          }
        }
      }

      // Подготовим метаинформацию для визуальной верификации (после всех коррекций)
      const routeGeoMeta: any = {
        origin: buildMeta(originRes, route.startAddress),
        destination: buildMeta(destinationRes, route.endAddress),
        waypoints: route.orders.map((o, i) => buildMeta(waypointResList[i], o.address))
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
        // Если заданы Хабы или Сектора — проверяем попадание всех точек
        const city = cityCtx.city
        if ((cachedHubPolygons.length > 0 || (city && settings.citySectors && settings.citySectors[city] && settings.citySectors[city].length >= 3)) && window.google?.maps?.geometry?.poly) {
          try {
            const legs = result.routes[0].legs
            const points: any[] = []
            if (legs.length > 0) {
              points.push(legs[0].start_location)
              legs.forEach((leg: any) => points.push(leg.end_location))
            }
            const outside = points.some((pt: any) => !checkInside(pt))
            if (outside) {
              toast.error('Точки маршрута находятся вне выбранного хаба или сектора города. Проверьте адреса.')
              setIsCalculating(false)
              return
            }
          } catch (e) {
            // Если вдруг нет geometry, продолжаем без проверки
          }
        }

        // --- TRAFFIC ENHANCEMENT (NEW) ---
        let adjustedDuration = result.routes[0].legs.reduce((total: number, leg: any) => total + leg.duration.value, 0)
        let trafficDelayMin = 0
        const mapboxToken = settings.mapboxToken || localStorage.getItem('km_mapbox_token')
        const vType = getCourierVehicleType(route.courier)

        if (mapboxToken && route.orders.length >= 1) {
          try {
            // We need coords for traffic API
            const chainForTraffic = route.orders.map((o, i) => ({
              ...o,
              coords: routeGeoMeta.waypoints[i] ? { lat: routeGeoMeta.waypoints[i].lat, lng: routeGeoMeta.waypoints[i].lng } : null
            })).filter(o => o.coords)

            if (chainForTraffic.length >= 1) {
              const trafficInfo = await getUkraineTrafficForOrders(chainForTraffic as any, mapboxToken)
              if (trafficInfo.length > 0) {
                trafficDelayMin = calculateTotalTrafficDelay(trafficInfo)

                // Apply motorcycle reduction factor
                if (vType === 'motorcycle') {
                  trafficDelayMin = trafficDelayMin * 0.5
                }

                adjustedDuration += (trafficDelayMin * 60)
              }
            }
          } catch (err) {
            console.warn('Traffic calculation failed:', err)
          }
        }

        // Используем точное расстояние из Google Maps API
        const totalDistance = result.routes[0].legs.reduce((total: number, leg: any) => total + leg.distance.value, 0)
        const totalDuration = adjustedDuration // Use adjusted duration with traffic

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
            // Retry log removed for production
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
        // Distance calculation log removed for production

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
      toast.error(`Ошибка при расчете маршрута: ${error.message || 'Неизвестная ошибка'}`)
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


  // Функция для перемещения заказа в другую временную группу ( Phase 4.7 )
  // Функция для перемещения заказа в другую временную группу ( Phase 4.7 )
  // Функция для перемещения заказа в другую временную группу (Force Move / SOTA v2.0)
  const handleMoveOrderToGroup = useCallback((orderId: string, targetGroup: TimeWindowGroup) => {
    console.log('[DND] Force Move logic triggered for order:', orderId, 'to group:', targetGroup.id);

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

        // Это перемещаемый заказ?
        const isMovedOrder = (normalizedOId === normalizedTargetId) || (oNum === normalizedTargetId) || (oId === targetIdStr);

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
            plannedTime: targetGroup.windowStart, // Синхронизируем время
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
            plannedTime: targetGroup.windowStart,
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

        const isTargetMove = (normalizedOId === normalizedTargetId) || (oNum === normalizedTargetId) || (oId === targetIdStr);

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
          const oNum = String(o.orderNumber || '');
          const targetIdStr = String(orderId);
          const normalizedTargetId = targetIdStr.replace(/^order_/, '');
          const normalizedOId = oId.replace(/^order_/, '');
          return (normalizedOId === normalizedTargetId) || (oNum === normalizedTargetId);
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
      // Предпочитаем placeId/форматированные адреса из geoMeta, чтобы совпадать с расчетом/сектором
      const base = 'https://www.google.com/maps/dir/?api=1'
      const meta: any = (route as any).geoMeta || {}
      const hasFullCoords = (m: any) => typeof m?.lat === 'number' && typeof m?.lng === 'number'
      const waypointsMeta: any[] = (meta.waypoints && Array.isArray(meta.waypoints)) ? meta.waypoints : []
      const missingCoords = !hasFullCoords(meta.origin) || !hasFullCoords(meta.destination) || waypointsMeta.some((w: any) => !hasFullCoords(w)) || waypointsMeta.length !== route.orders.length
      if (missingCoords) {
        toast.error('Чтобы открыть маршрут в Google Maps без искажений, сначала пересчитайте маршрут.')
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
                  <div className="grid grid-cols-3 gap-2">
                    <div className={clsx(
                      "p-3 rounded-2xl border flex flex-col items-center justify-center transition-all",
                      isDark ? "bg-black/20 border-white/5" : "bg-gray-50 border-gray-100"
                    )}>
                      <span className="text-[14px] font-black leading-none mb-1">{fleetStats.total}</span>
                      <span className="text-[7px] font-black uppercase tracking-widest opacity-30">Всего</span>
                    </div>
                    <div className={clsx(
                      "p-3 rounded-2xl border flex flex-col items-center justify-center transition-all relative overflow-hidden",
                      isDark ? "bg-blue-500/5 border-blue-500/20" : "bg-blue-50 border-blue-100"
                    )}>
                      <span className="text-[14px] font-black leading-none mb-1 text-blue-500">{fleetStats.active}</span>
                      <span className="text-[7px] font-black uppercase tracking-widest text-blue-500/50">В пути</span>
                      <div className="absolute bottom-0 left-0 h-[2px] bg-blue-500 opacity-20 transition-all duration-300" style={{ width: `${fleetStats.progress}%` }} />
                    </div>
                    <div className={clsx(
                      "p-3 rounded-2xl border flex flex-col items-center justify-center transition-all",
                      isDark ? "bg-emerald-500/5 border-emerald-500/20" : "bg-emerald-50 border-emerald-100"
                    )}>
                      <span className="text-[14px] font-black leading-none mb-1 text-emerald-500">{fleetStats.finished}</span>
                      <span className="text-[7px] font-black uppercase tracking-widest text-emerald-500/50">Завершил</span>
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

                        <div className="h-[600px] w-full overflow-y-auto pr-2 custom-scrollbar" data-tour="order-list">
                          {availableOrders.length > 0 ? (
                            <div>
                              <div>
                                <OrderList
                                  orders={availableOrders}
                                  isDark={isDark}
                                  selectedOrders={selectedOrders}
                                  selectedOrdersOrder={selectedOrdersOrder}
                                  onSelectOrder={(id: string, multi: boolean) => handleOrderSelect(id, multi)}
                                  onMoveUp={moveOrderUp}
                                  onMoveDown={moveOrderDown}
                                  isInRoute={false}
                                />
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
                                    {meta.streetNumberMatched ? ' Найден номер дома' : ' Не нашел номера дома'}
                                  </span>
                                )}
                                {meta.zoneName && (
                                  <span className={clsx(
                                    'px-2 py-0.5 rounded-lg border',
                                    isDark ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-purple-50 text-purple-700 border-purple-200'
                                  )}>
                                    Зона: {meta.zoneName}
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
                              {route.isOptimized && (
                                <div className={clsx(
                                  "flex items-center gap-2 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest",
                                  isDark ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-green-50 text-green-700 border border-green-100 shadow-sm"
                                )}>
                                  <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
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

      </>

      {/* Smart Address Correction Modals */}
      {showCorrectionModal && currentProblem && (
        <SmartAddressCorrectionModal
          order={currentProblem.order}
          validationResult={currentProblem.validationResult}
          isDark={isDark}
          onApplyCorrection={(suggestion) => applyCorrection(currentProblem.order, suggestion)}
          onManualEdit={(newAddress) => {
            applyManualEdit(currentProblem.order, newAddress)
          }}
          onSkip={() => setShowCorrectionModal(false)}
          onClose={() => setShowCorrectionModal(false)}
        />
      )}

      {showBatchPanel && problemOrders.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl">
            <BatchAddressCorrectionPanel
              problemOrders={problemOrders}
              isDark={isDark}
              onAutoCorrectAll={applyBatchCorrections}
              onReviewManually={() => {
                if (problemOrders.length > 0) {
                  setCurrentProblem(problemOrders[0])
                  setShowBatchPanel(false)
                  setShowCorrectionModal(true)
                }
              }}
              onClose={() => setShowBatchPanel(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}