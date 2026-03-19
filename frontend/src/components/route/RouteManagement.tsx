import React, { useState, useEffect, useMemo, useCallback, useDeferredValue, useTransition, lazy, Suspense, memo } from 'react'
import { FixedSizeList as List } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
const AutoSizerAny = AutoSizer as any
import { OrderList } from './OrderList'
import { RouteCard } from './RouteCard'
import {
  TruckIcon,
  MapIcon,
  QuestionMarkCircleIcon,
  InboxIcon,
  ClockIcon,
  ArrowPathIcon,
  PlusIcon,
  TrashIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline'
import { localStorageUtils } from '../../utils/ui/localStorage'
import { cleanAddress, } from '../../utils/data/addressUtils'
import { googleMapsLoader } from '../../utils/maps/googleMapsLoader'
import { useExcelData } from '../../contexts/ExcelDataContext'
import { useTheme } from '../../contexts/ThemeContext'
import { clsx } from 'clsx'
import { DisambiguationModal } from './DisambiguationModal'
import { CalculationOverlay } from '../common/CalculationOverlay'
import { useCalculationProgress } from '../../store/calculationProgressStore'
import { AddressValidationService, RouteAnomalyCheck } from '../../services/addressValidation'
import { toast } from 'react-hot-toast'
import { Tooltip } from '../shared/Tooltip'
import { CourierTimeWindows } from './CourierTimeWindows'
import { GridOrderCard } from './GridOrderCard'
import { type TimeWindowGroup, groupOrdersByTimeWindow, formatTimeLabel } from '../../utils/route/routeCalculationHelpers'
import { isId0CourierName, normalizeCourierName } from '../../utils/data/courierName'
import { getReturnETA, getAccurateReturnETA, getCourierSpeed, enrichRoutesWithCoords } from '../../utils/routes/courierETA'
import { calculateDistance } from '../../utils/geoUtils'
import { isOrderCompleted } from '../../utils/data/orderStatus'

// --- Hooks ---

// Ленивая загрузка тяжелых компонентов
const HelpModalRoutes = lazy(() => import('../modals/HelpModalRoutes').then(m => ({ default: m.HelpModalRoutes })))
const HelpTour = lazy(() => import('../features/HelpTour').then(m => ({ default: m.HelpTour })))
const AddressEditModal = lazy(() => import('../modals/AddressEditModal').then(m => ({ default: m.AddressEditModal })))
const ReturningCouriersModal = lazy(() => import('./modals/ReturningCouriersModal').then(m => ({ default: m.ReturningCouriersModal })))
const TransitCouriersModal = lazy(() => import('./modals/TransitCouriersModal').then(m => ({ default: m.TransitCouriersModal })))

// Google Maps types
declare global {
  interface Window {
    google: any
    googleMapsLoaded: boolean
    initGoogleMaps: () => void
  }
}

import { Route, Order } from '../../types/route'
import { useRouteGeocoding, hashString } from '../../hooks/useRouteGeocoding'
import { useKmlData } from '../../hooks/useKmlData'
import { exportToGoogleMaps, exportToValhalla } from '../../utils/routes/routeExport'

interface RouteManagementProps {
  excelData?: any
}


import { CourierListItem } from './CourierListItem'

export const RouteManagement: React.FC<RouteManagementProps> = () => {
  const { excelData, updateExcelData, saveManualOverrides } = useExcelData()
  const { isDark } = useTheme()
  // v5.50: Cache localStorage settings to avoid sync I/O in render loop
  const localSettings = useMemo(() => localStorageUtils.getAllSettings(), [])

  const [selectedCourier, setSelectedCourier] = useState<string | null>(null)
  const [startAddress] = useState<string>(() => localSettings.defaultStartAddress || '')
  const [endAddress] = useState<string>(() => localSettings.defaultEndAddress || '')
  const [orderSearchTerm, setOrderSearchTerm] = useState('')
  const [courierSearchTerm, setCourierSearchTerm] = useState('')
  
  const [courierSortType, setCourierSortType] = useState<'alpha' | 'load'>('alpha')
  const [googleMapsReady, setGoogleMapsReady] = useState(false)
  const [, startTransition] = useTransition()

  // v5.41: Robust Normalization - trim all inputs to prevent mismatch
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
    if (localSettings.courierVehicleMap) {
      // Ищем в карте с приведением ключей к нижнему регистру
      const mappedEntry = Object.entries(localSettings.courierVehicleMap).find(([name]) =>
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
    const city = (localSettings.cityBias || '') as '' | 'Киев' | 'Харьков' | 'Полтава' | 'Одесса'
    return { city, country: 'Украина', region: 'UA' }
  }, [localSettings.cityBias])

  // Простая очистка адреса + добавление выбранного города/страны
  // Улучшенная очистка адреса (v38: Noisy String Stripper)
  const getStableOrderId = useCallback((order: any): string => {
    const idVal = order.id !== undefined && order.id !== null && order.id !== 0 ? String(order.id) : null;
    const fallback = String(order.orderNumber || order._id || `gen_${Math.abs(hashString(order.address || ''))}`);
    return idVal || fallback;
  }, []);

  const cleanAddressForRoute = useCallback((raw: string): string => {
    if (!raw) return '';
    // v38: Aggressive stripping of noisy substrings like "эт.2, кв.76", "под.3", "д/ф Домофон"
    let base = raw
      .replace(/(?:под\.|подъезд|п\.)\s*\d+/gi, '')
      .replace(/(?:эт\.|этаж|эт)\s*\d+/gi, '')
      .replace(/(?:кв\.|квартира|кв)\s*\d+/gi, '')
      .replace(/(?:д\/ф|домофон)\s*[^,]*/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    base = cleanAddress(base).trim();
    if (!base) return base;
    
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

  // SOTA 5.46: useRouteGeocoding encapsulates all complex logic
  const {
    calculateRouteDistance,
    isCalculating,
    setIsCalculating,
    disambModal,
    setDisambModal,
    disambResolver,
    processDisambQueue: _processDisambQueue,
    batchGeocode
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

    console.log(`[RouteManagement] Grouping: Processing ${excelData.orders.length} orders total`);
    
    excelData.orders.forEach((order: any, idx: number) => {
      if (order.address) {
        // Advanced courier name extraction
        const c = order?.courier;
        const rawName = (typeof c === 'object' && c !== null) 
          ? (c.name || c._id || c.id || '') 
          : (typeof c === 'string' ? c : '');
        
        const courierName = normalizeCourierName(rawName || order.courierName) || 'Не назначено'

        if (!grouped[courierName]) {
          grouped[courierName] = []
        }

        const stableId = getStableOrderId(order);
        
        // Debug: Log first 5 orders and their assigned courier/id
        if (idx < 5) {
           console.log(`[RouteManagement] Grouping: Order #${order.orderNumber} -> Courier: "${courierName}", ID: "${stableId}"`);
        }

        grouped[courierName].push({
          id: stableId,
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
          const sid = getStableOrderId(order);
          set.add(sid);
          
          // Debug: Log first few orders in existing routes
          if (set.size < 5) {
             console.log(`[RouteManagement] Set: Order #${order.orderNumber} in Route "${route.courier}" -> ID: "${sid}"`);
          }
        })
      })
    return set
  }, [excelData?.routes, getStableOrderId])

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
        if (isOrderCompleted(order.status)) {
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
    
    // Ensure Google Maps is loaded before calculating accurate ETA
    const loadAndEnrich = async () => {
      try {
        if (localStorageUtils.hasApiKey()) {
          await googleMapsLoader.load()
          setGoogleMapsReady(true)
        }
        
        const enriched = await enrichRoutesWithCoords(returningRoutes)
        const processed = await Promise.all(enriched.map(async (r) => {
          const accurate = await getAccurateReturnETA(r as any, startAddress)
          return { ...r, accurateETA: accurate }
        }))
        setEnrichedRoutes(processed as unknown as Route[])
      } catch (err) {
        console.error('[enrichRoutesWithCoords] failed:', err)
      } finally {
        setIsGeocodingETA(false)
      }
    }

    loadAndEnrich()
  }, [showReturningModal, excelData, courierOrders, courierMetricsMap, startAddress, googleMapsReady])

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

  // --- Оптимизированная фильтрация заказов ---
  const { availableOrders, ordersInRoutes } = useMemo(() => {
    if (!selectedCourier) {
      console.log(`[RouteManagement] Filter: No courier selected (Current state: ${selectedCourier})`);
      return { availableOrders: [], ordersInRoutes: [] }
    }

    // 1. Collect orders for selected courier
    const selectedCourierRawOrders = courierOrders[selectedCourier] || []
    console.log(`[RouteManagement] Filter: Courier "${selectedCourier}" has ${selectedCourierRawOrders.length} raw orders`);

    // 2. For non-"Не назначено" couriers: also include all truly unassigned orders
    //    so admin can drag them into a route for the current courier.
    const unassignedOrders: Order[] = []
    if (!isId0CourierName(selectedCourier) && selectedCourier !== 'Не назначено') {
      Object.entries(courierOrders).forEach(([courierName, orders]) => {
        if (isId0CourierName(courierName) || courierName === 'Не назначено') {
          // Include unassigned orders that are not already in a route
          orders.forEach(o => {
            if (!ordersInRoutesSet.has(o.id) && !isOrderCompleted(o.status)) {
              unassignedOrders.push(o)
            }
          })
        }
      })
    }

    const rawOrders = selectedCourierRawOrders

    if (rawOrders.length === 0 && unassignedOrders.length === 0) {
      return { availableOrders: [], ordersInRoutes: [] }
    }

    const ordersWithSearch = searchOrders(rawOrders)
    const sortedAndDeduplicated = sortOrdersByTime(ordersWithSearch).filter((o, idx, self) =>
      self.findIndex(t => t.id === o.id) === idx
    )

    // 3. Split selected courier's orders into available and in-routes
    const available: Order[] = []
    const inRoutes: Order[] = []

    sortedAndDeduplicated.forEach(order => {
      if (ordersInRoutesSet.has(order.id)) {
        inRoutes.push(order)
      } else {
        available.push(order)
      }
    })

    // 4. Merge unassigned orders into "available" (deduplication by id)
    const seenIds = new Set(available.map(o => o.id))
    unassignedOrders.forEach(o => {
      if (!seenIds.has(o.id)) {
        seenIds.add(o.id)
        available.push(o)
      }
    })

    console.log(`[RouteManagement] Filter Success: ${available.length} available (${unassignedOrders.length} unassigned), ${inRoutes.length} in routes`);
    return { availableOrders: available, ordersInRoutes: inRoutes }
  }, [selectedCourier, courierOrders, searchOrders, sortOrdersByTime, ordersInRoutesSet])


  // v37: Defer the list to prevent main-thread blocking on selection
  const deferredAvailableOrders = useDeferredValue(availableOrders)

  // Debug State
  useEffect(() => {
    console.log(`[RouteManagement] Render State:`, {
      selectedCourier,
      availableCount: availableOrders.length,
      deferredCount: deferredAvailableOrders.length,
      ordersInRoutesCount: ordersInRoutes.length
    });
  }, [selectedCourier, availableOrders, deferredAvailableOrders, ordersInRoutes]);

  // Сортировка и пагинация маршрутов
  const allRoutes = (excelData?.routes || []) as Route[]
  const { totalRoutePages, paginatedRoutes } = useMemo(() => {
    const sorted = sortRoutesByNewest
      ? [...allRoutes].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      : allRoutes
    const total = Math.ceil((sorted.length ?? 0) / routesPerPage || 0)
    const paginated = sorted.slice(
      routePage * routesPerPage,
      (routePage + 1) * routesPerPage
    )
    return { totalRoutePages: total, paginatedRoutes: paginated }
  }, [allRoutes, sortRoutesByNewest, routePage, routesPerPage])


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

  // v5.5: Optimized row renderers to prevent full list re-mounts
  const CourierRow = useMemo(() => ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const courierName = filteredCouriers[index]
    if (!courierName) return null;
    
    // Use component-level memoized state/helpers to avoid re-renders
    const metric = getCourierMetrics(courierName)
    const vehicleType = getCourierVehicleType(courierName)
    
    return (
      <div style={style}>
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
      </div>
    )
  }, [filteredCouriers, selectedCourier, handleCourierSelect, getCourierMetrics, getCourierVehicleType, isDark]);

  // v5.6: Row renderer for orders grid using itemData for consistent column count
  const AvailableOrdersGridRow = memo(({ index, style, data }: { index: number; style: React.CSSProperties; data: any }) => {
    const { orders, columns, isDark, selectedOrders, handleOrderSelect } = data;
    const startIdx = index * columns;
    const rowOrders = orders.slice(startIdx, startIdx + columns);
    
    return (
      <div style={{ ...style, display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: '1rem', paddingBottom: '1rem' }}>
        {rowOrders.map((order: Order) => (
          <GridOrderCard
            key={order.id}
            order={order}
            isDark={isDark}
            isSelected={selectedOrders.has(order.id)}
            onSelect={(id) => handleOrderSelect(id, false)}
          />
        ))}
      </div>
    );
  });


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

    // Пробуем загрузить Google Maps API в фоновом режиме, если он еще не готов
    if (!googleMapsReady) {
      googleMapsLoader.load()
        .then(() => setGoogleMapsReady(true))
        .catch(() => { /* Silent failure - providers will handle fallbacks */ })
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

    // Выполняем пересчет
    await calculateRouteDistance(route)
  }

  const clearAllRoutes = () => {
    if (window.confirm('Вы уверены, что хотите удалить все маршруты?')) {
      updateExcelData({ ...(excelData || { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: undefined }), routes: [] }, true)
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
        return !r.orders.every((o: any) => isOrderCompleted(o.status));
      });
      if (activeRoutes.length === routes.length) {
        toast.error('Нет завершенных маршрутов для очистки');
        return prev;
      }
      toast.success(`Очищено маршрутов: ${routes.length - activeRoutes.length}`);
      return { ...prev, routes: activeRoutes };
    }, true);
  }

  const openRouteInGoogleMaps = (route: Route) => {
    if (!route) return
    const url = exportToGoogleMaps({
      route,
      orders: route.orders || [],
      startAddress: startAddress || '',
      endAddress: endAddress || ''
    })
    if (url) window.open(url, '_blank')
  }

  const openRouteInValhalla = (route: Route) => {
    if (!route) return
    const url = exportToValhalla({
      route,
      orders: route.orders || [],
      startAddress: startAddress || '',
      endAddress: endAddress || ''
    })
    if (url) window.open(url, '_blank')
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

  // Обработчик разрешения неоднозначности (выбор варианта) (v38.5: Stable callback)
  const handleDisambiguationResolve = useCallback((choice: any | null) => {
    if (disambResolver.current) {
      disambResolver.current(choice)
      disambResolver.current = undefined
    }
    setDisambModal(null)
  }, [setDisambModal]);

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = Math.floor(minutes % 60)
    return hours > 0 ? `${hours}ч ${mins}мин` : `${mins}мин`
  }

  const formatDistance = (distanceKm: number) => {
    const rounded = Math.round(distanceKm * 10) / 10
    return rounded.toFixed(1).replace('.', ',')
  }

  const translateLocationType = (locationType: string): string => {
    const translations: Record<string, string> = {
      'ROOFTOP': 'Точный адрес до метра',
      'RANGE_INTERPOLATED': 'Интерполированный',
      'GEOMETRIC_CENTER': 'Геометрический центр улицы',
      'APPROXIMATE': 'Приблизительный',
      'UNKNOWN': 'Неизвестный'
    }
    return translations[locationType] || locationType
  }



  return (
    <div className="space-y-6 relative">
      {/* SOTA 5.68: Loading Overlay (Zero-Re-Render UI) */}
      {isCalculating && (
        <CalculationOverlay isDark={isDark} />
      )}

      {/* Header */}
      <div className={clsx(
        'rounded-3xl p-8 shadow-lg border-2 overflow-hidden relative',
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
                        onChange={(e) => {
                          const val = e.target.value;
                          startTransition(() => {
                            setCourierSearchTerm(val);
                          });
                        }}
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

                <div className="flex-1 min-h-[400px]">
                  {filteredCouriers.length === 0 ? (
                    <div className="text-center py-10 h-full flex flex-col items-center justify-center">
                      <TruckIcon className="w-10 h-10 mx-auto text-gray-300 mb-2 opacity-50" />
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-widest px-4">Список пуст</p>
                    </div>
                  ) : (
                    <div className="h-[600px] w-full">
                      <List
                        height={600}
                        itemCount={filteredCouriers.length}
                        itemSize={72}
                        width="100%"
                        className="custom-scrollbar"
                      >
                        {CourierRow}
                      </List>
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
                  <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full -mr-32 -mt-32 opacity-20 lg:visible invisible"></div>

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
                        orders={deferredAvailableOrders}
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

                            // Step 1: Create all basic route objects
                            groups.forEach((group, index) => {
                              const groupOrders = group.orders as Order[];
                              const newRoute: Route = {
                                // v35.9.35: Stronger unique ID to avoid collisions
                                id: `route_${Date.now()}_idx${index}_rnd${Math.floor(Math.random() * 10000)}`,
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

                            setSelectedOrders(new Set());
                            setSelectedOrdersOrder([]);

                            // v35.9.35: Giant Batch Geocoding + Parallel Calculation (Quantum Mode)
                            setIsCalculating(true)
                            useCalculationProgress.getState().setProgress(5)

                            // 1. Collect ALL unique addresses from all groups
                            const allOrdersInAllGroups = groups.flatMap(g => g.orders as Order[]);
                            const uniqueAddresses = new Set<string>();
                            allOrdersInAllGroups.forEach(o => uniqueAddresses.add(cleanAddressForRoute(o.address)));
                            
                            // Also include start/end addresses if they need geocoding
                            if (startAddress) uniqueAddresses.add(cleanAddressForRoute(startAddress));
                            if (endAddress) uniqueAddresses.add(cleanAddressForRoute(endAddress));

                            console.log(`[Quantum] Starting Giant Batch Geocode for ${uniqueAddresses.size} unique addresses...`);
                            
                            // 2. Execute one giant batch geocode for everything
                            const addrCache = await batchGeocode(
                                Array.from(uniqueAddresses).map(addr => ({
                                    address: addr,
                                    options: { turbo: true, silent: true }
                                }))
                            );

                            useCalculationProgress.getState().setProgress(30);
                            console.log(`[Quantum] Giant Geocode complete. Calculating ${newRoutes.length} routes in parallel...`);

                            // 3. Sequential chunking calculation with shared cache (Phase 7 Extreme Optimization)
                            // By processing sequentially with a setTimeout yield, we completely unblock
                            // the main thread, allowing the progress bar to render smoothly and preventing crashes.
                            let completedRoutes = 0;
                            const calculatedRoutes: (Route | null)[] = [];

                            for (const route of newRoutes) {
                                try {
                                    // Yield main thread to browser to paint UI
                                    await new Promise(r => setTimeout(r, 10));

                                    const result = await calculateRouteDistance(route, true, addrCache);
                                    calculatedRoutes.push(result);
                                } catch (e) {
                                    console.error(`[Quantum] Ошибка маршрута:`, e);
                                    calculatedRoutes.push(null);
                                } finally {
                                    completedRoutes++;
                                    const progressPct = Math.round(30 + ((completedRoutes / newRoutes.length) * 65));
                                    
                                    // Phase 7: Zero Re-Render UI Update directly to store
                                    if (progressPct === 95 || (Date.now() - (window as any)._lastProgressUpdate > 200)) {
                                        useCalculationProgress.getState().setProgress(progressPct);
                                        (window as any)._lastProgressUpdate = Date.now();
                                    }
                                }
                            }

                            useCalculationProgress.getState().setProgress(95)

                            // Single atomic state commit for all calculated routes
                            updateExcelData((prev: any) => {
                                const updatedRouteMap = new Map<string, Route>();
                                calculatedRoutes.forEach(r => { if (r) updatedRouteMap.set(r.id, r); });

                                const currentOrders = prev?.orders || [];
                                // Merge all geocoded order data from calculated routes
                                const allRouteOrderUpdates = new Map<string, any>();
                                calculatedRoutes.forEach(r => {
                                    if (r?.orders) {
                                        r.orders.forEach((o: any) => allRouteOrderUpdates.set(String(o.id), o));
                                    }
                                });
                                const updatedOrders = currentOrders.map((order: any) => {
                                    const geocodedOrder = allRouteOrderUpdates.get(String(order.id));
                                    if (geocodedOrder) return { ...order, ...geocodedOrder, courier };
                                    if (allOrderIdsToUpdate.has(String(order.id))) return { ...order, courier };
                                    return order;
                                });

                                const existingRoutes = (prev?.routes || []).filter(
                                    (r: Route) => !newRoutes.some(nr => nr.id === r.id)
                                );
                                const finalRoutes = [
                                    ...existingRoutes,
                                    // Use calculated route if available, else use base uncalculated route
                                    ...newRoutes.map(r => updatedRouteMap.get(r.id) || r)
                                ];

                                console.log(`[Батч] Финальный коммит: ${finalRoutes.length} маршрутов, ${updatedOrders.filter((o: any) => allOrderIdsToUpdate.has(String(o.id))).length} обновленных заказов`);

                                return {
                                    ...(prev || { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: undefined }),
                                    routes: finalRoutes,
                                    orders: updatedOrders
                                };
                            }, true /* force: true to ensure new routes are NOT dropped by protectData */);

                            const successCount = calculatedRoutes.filter(Boolean).length;
                            if (successCount > 0) {
                                toast.success(`Расчитано ${successCount} маршрутов`);
                            } else {
                                toast.error('Не удалось рассчитать маршруты. Проверьте консоль.');
                            }
                          } catch (err) {
                            console.error('Batch route creation error:', err);
                            toast.error('Ошибка при создании группы маршрутов');
                          } finally {
                            setIsCalculating(false)
                            setTimeout(() => useCalculationProgress.getState().setProgress(0), 1000)
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
                              disabled={deferredAvailableOrders.length === 0 || isCalculating || selectedOrders.size === 0 || isId0CourierName(selectedCourier)}
                              title={isId0CourierName(selectedCourier) ? 'Выберите курьера для создания маршрута' : undefined}
                              className={clsx(
                                "px-6 py-3 rounded-2xl font-black text-sm transition-all shadow-lg flex items-center gap-2 shrink-0 uppercase tracking-widest",
                                selectedOrders.size > 0 && !isId0CourierName(selectedCourier)
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

                        <div className="h-[600px] w-full pr-2 custom-scrollbar" data-tour="order-list">
                          {/* SOTA Debug Log in JSX to catch render-time values */}
                          {(() => { console.log(`[RouteManagement] JSX Check: deferred=${deferredAvailableOrders.length}, raw=${availableOrders.length}, courier=${selectedCourier}`); return null; })()}
                          
                          {/* Temporary debug indicator for the user */}
                          {availableOrders.length > 0 && deferredAvailableOrders.length === 0 && (
                            <div className="text-[10px] text-amber-500 font-bold mb-2 animate-pulse">
                              ⏳ Синхронизация списка ({availableOrders.length} заказов)...
                            </div>
                          )}

                          {deferredAvailableOrders.length > 0 ? (
                            <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: '600px' }}>
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-4">
                                {deferredAvailableOrders.map((order) => (
                                  <GridOrderCard
                                    key={order.id}
                                    order={order}
                                    isDark={isDark}
                                    isSelected={selectedOrders.has(order.id)}
                                    onSelect={handleOrderSelect}
                                    isUnassigned={isId0CourierName(order.courier) || order.courier === 'Не назначено'}
                                  />
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-20 opacity-30 italic">Список пуст</div>
                          )}


                          {ordersInRoutes.length > 0 && (
                            <div 
                              className="mt-12 pt-12 border-t-4 border-dotted border-gray-100 dark:border-gray-700/50 opacity-60 grayscale scale-[0.98] origin-top transition-all hover:grayscale-0 hover:opacity-100"
                              style={{ contentVisibility: 'auto', containIntrinsicSize: '0 300px' }}
                            >
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
                  {paginatedRoutes.map(route => (
                    <RouteCard
                      key={route.id}
                      route={route}
                      isDark={isDark}
                      courierVehicle={getCourierVehicleType(route.courier)}
                      anomalyCheck={routeAnomalies.get(route.id)}
                      formatDistance={formatDistance}
                      formatDuration={formatDuration}
                      translateLocationType={translateLocationType}
                      onOpenGoogleMaps={openRouteInGoogleMaps}
                      onOpenValhalla={openRouteInValhalla}
                      onRecalculate={recalculateRoute}
                      onDelete={deleteRoute}
                      onEditAddress={handleEditAddress}
                      isCalculating={isCalculating}
                    />
                  ))}
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
                            key={`page-${i}`}
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
                          <span key={`dots-${i}`} className="px-2 opacity-30 text-xs font-black">...</span>
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
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-300">
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


        {/* SOTA 5.0: Disambiguation Modal Implementation (v38.5: External component for performance) */}
        <DisambiguationModal
          open={!!(disambModal && disambModal.open)}
          title={disambModal?.title || ''}
          options={disambModal?.options || []}
          isDark={isDark}
          onResolve={handleDisambiguationResolve}
        />
      </>
    </div>
  );
};
