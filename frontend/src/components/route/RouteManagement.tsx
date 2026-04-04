import React, { useState, useEffect, useMemo, useCallback, useDeferredValue, useTransition, lazy, Suspense, useRef } from 'react'
import { FixedSizeList as List } from 'react-window'
import { OrderList } from './OrderList'
import { RouteCard } from './RouteCard'
import {
  TruckIcon,
  MapIcon,
  QuestionMarkCircleIcon,
  InboxIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ArrowPathIcon,
  TrashIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  UserIcon
} from '@heroicons/react/24/outline'
import { localStorageUtils } from '../../utils/ui/localStorage'
import { cleanAddress, } from '../../utils/data/addressUtils'
import { googleMapsLoader } from '../../utils/maps/googleMapsLoader'
import { useExcelData } from '../../contexts/ExcelDataContext'
import { getStableOrderId } from '../../utils/data/orderId';
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
import { CourierIdResolver } from '../../utils/data/courierIdMap'
import { getReturnETA, getAccurateReturnETA, getCourierSpeed, enrichRoutesWithCoords } from '../../utils/routes/courierETA'
import { calculateDistance } from '../../utils/geoUtils'
import { isOrderCompleted, isOrderCancelled } from '../../utils/data/orderStatus'

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
import { useRouteGeocoding } from '../../hooks/useRouteGeocoding'
import { robustGeocodingService } from '../../services/robust-geocoding/RobustGeocodingService'
import { useKmlData } from '../../hooks/useKmlData'
import { exportToGoogleMaps, exportToValhalla } from '../../utils/routes/routeExport'
import { CourierListItem } from './CourierListItem'
import { ServiceStatusDashboard } from './ServiceStatusDashboard'
import { useDashboardStore } from '../../stores/useDashboardStore'
import { socketService } from '../../services/socketService'


interface RouteManagementProps {
  excelData?: any
}




export const RouteManagement: React.FC<RouteManagementProps> = ({ excelData: propExcelData }) => {
  const { excelData: contextExcelData, updateExcelData, saveManualOverrides } = useExcelData()
  const excelData = propExcelData || contextExcelData

  // Data loaded — no verbose debug logging in production path
  useEffect(() => {
    if (!excelData) {
      console.warn('[RouteManagement] No excelData available');
    }
  }, [excelData]);
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
  const [unassignedStatusFilter, setUnassignedStatusFilter] = useState<'all' | 'оформление' | 'в работе' | 'другое'>('all')
  const [isGroupedExpanded, setIsGroupedExpanded] = useState(true)
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
  
  // --- Сайдбар: Пагинация курьеров ---
  const [courierPage, setCourierPage] = useState(1);
  const couriersPerPage = 7;

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
      if (mappedEntry) return String(mappedEntry[1]).toLowerCase().trim()
    }

    // 2. Проверяем в списке курьеров (уже нормализованных в ExcelDataContext)
    if (excelData?.couriers && Array.isArray(excelData.couriers)) {
      const courier = excelData.couriers.find((c: any) =>
        normalizeCourierName(c.name).toLowerCase() === normName
      )
      if (courier?.vehicleType) return String(courier.vehicleType).toLowerCase().trim()
    }

    return 'car'
  }, [localSettings.courierVehicleMap, excelData?.couriers])

  // Выбранный город обязателен; используем только его для bias/нормализации
  const getSelectedCity = useCallback((): { city: '' | 'Киев' | 'Харьков' | 'Полтава' | 'Одесса'; country: 'Украина'; region: 'UA' } => {
    const city = (localSettings.cityBias || '') as '' | 'Киев' | 'Харьков' | 'Полтава' | 'Одесса'
    return { city, country: 'Украина', region: 'UA' }
  }, [localSettings.cityBias])

  // Простая очистка адреса + добавление выбранного города/страны
  // Улучшенная очистка адреса (v38: Noisy String Stripper)
  // Stable ID utility is now imported from ../../utils/data/orderId

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

    // v5.134: Build ID→name map first so ObjectId courier refs are resolved to names
    const courierIdToNameMap = new Map<string, string>();
    (excelData?.couriers || []).forEach((c: any) => {
      const cId = String(c._id || c.id || '');
      const cName = normalizeCourierName(String(c.name || ''));
      if (cId && cName) courierIdToNameMap.set(cId, cName);
    });

    const grouped: { [courier: string]: Order[] } = {}

    excelData.orders.forEach((order: any) => {
      if (order.address) {
        // Advanced courier name extraction
        let c = order?.courier;

        // v5.134: Resolve ObjectId (24-char hex) to courier name
        if (typeof c === 'string' && /^[0-9a-f]{24}$/i.test(c)) {
          const resolvedName = courierIdToNameMap.get(c) || CourierIdResolver.resolve(c);
          if (resolvedName) c = resolvedName;
        }

        const rawName = (typeof c === 'object' && c !== null)
          ? (c.name || c._id || c.id || '')
          : (typeof c === 'string' ? c : '');

        // If still an ObjectId after resolution — skip, don't pollute the map
        if (typeof rawName === 'string' && /^[0-9a-f]{24}$/i.test(rawName)) {
          return;
        }

        const courierName = normalizeCourierName(rawName || order.courierName) || 'Не назначено'

        // v35.15: Global Exclusion of "ПО" (trash)
        if (courierName.toLowerCase() === 'по') {
          return;
        }

        if (!grouped[courierName]) {
          grouped[courierName] = []
        }

        const stableId = getStableOrderId(order);

        // v5.160: Prevent duplication by orderNumber FIRST (primary), then by ID
        const orderNum = String(order.orderNumber || '');
        if (orderNum && grouped[courierName].some(o => String(o.orderNumber) === orderNum)) {
          return;
        }
        if (grouped[courierName].some(o => o.id === stableId)) {
          return;
        }

        const kz = order.kmlZone || order.deliveryZone;
        const kh = order.kmlHub;
        const lat = order.lat || order.coords?.lat;
        const lng = order.lng || order.coords?.lng;

        // v38.2: Lazy KML zone lookup if missing but coords present
        let finalKmlZone = kz;
        let finalKmlHub = kh;
        if (!finalKmlZone && lat && lng) {
          const zoneMatch = robustGeocodingService.findZoneForCoords(lat, lng);
          if (zoneMatch) {
            finalKmlZone = zoneMatch.zoneName;
            finalKmlHub = zoneMatch.hubName;
          }
        }

        grouped[courierName].push({
          id: stableId,
          orderNumber: order.orderNumber || 'N/A',
          address: order.address || 'Адрес не указан',
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
          kmlZone: finalKmlZone,
          kmlHub: finalKmlHub,
          lat: lat,
          lng: lng,
          coords: order.coords || (lat && lng ? { lat, lng } : undefined),
          locationType: order.locationType,
          deliveryZone: order.deliveryZone || finalKmlZone,
          streetNumberMatched: order.streetNumberMatched,
          raw: order,
          isSelected: false
        })
      }
    })

    // v5.135: CRITICAL — Supplement courierOrders from route data.
    // Problem: FastOperator API often sends orders with courier=null.
    // These orders end up in "Не назначено" even though routes are created.
    // Solution: For each route, find its orders in excelData.orders (for fresh status)
    // and add them to the correct courier's group if not already there.
    const orderByStableId = new Map<string, any>();
    excelData.orders.forEach((order: any) => {
      orderByStableId.set(getStableOrderId(order), order);
    });

    (excelData?.routes || []).forEach((route: any) => {
      if (!route?.orders?.length) return;

      // v5.132: Resolve courier name from ID if needed
      const rawCourier = route.courier || route.courierId || route.courierName || '';
      const routeCourierName = CourierIdResolver.resolve(rawCourier) || normalizeCourierName(rawCourier);
      
      if (!routeCourierName || isId0CourierName(routeCourierName) || routeCourierName.toLowerCase() === 'по') return;

      if (!grouped[routeCourierName]) grouped[routeCourierName] = [];

      route.orders.forEach((routeOrder: any) => {
        const sid = getStableOrderId(routeOrder);
        if (!sid) return;

        // v5.160: Check by orderNumber FIRST (primary dedup key)
        const routeOrderNum = String(routeOrder.orderNumber || '');
        if (routeOrderNum && grouped[routeCourierName].some((o: any) => String(o.orderNumber) === routeOrderNum)) return;
        // Already in this courier's group — skip duplication
        if (grouped[routeCourierName].some((o: any) => o.id === sid)) return;

        // Prefer the fresh version of the order from excelData.orders (has latest status from API)
        const freshOrder = orderByStableId.get(sid);
        const orderSource = freshOrder || routeOrder;

        const lat = orderSource.lat || orderSource.coords?.lat;
        const lng = orderSource.lng || orderSource.coords?.lng;

        grouped[routeCourierName].push({
          id: sid,
          orderNumber: orderSource.orderNumber || routeOrder.orderNumber || 'N/A',
          address: orderSource.address || routeOrder.address || 'Адрес не указан',
          courier: routeCourierName,          // corrected courier name from route
          amount: orderSource.amount || 0,
          phone: orderSource.phone || '',
          customerName: orderSource.customerName || '',
          plannedTime: orderSource.plannedTime || '',
          paymentMethod: orderSource.paymentMethod || '',
          manualGroupId: orderSource.manualGroupId,
          deadlineAt: orderSource.deadlineAt,
          handoverAt: orderSource.handoverAt,
          status: orderSource.status,
          statusTimings: orderSource.statusTimings,
          kmlZone: orderSource.kmlZone || orderSource.deliveryZone,
          kmlHub: orderSource.kmlHub,
          lat,
          lng,
          coords: orderSource.coords || (lat && lng ? { lat, lng } : undefined),
          locationType: orderSource.locationType,
          deliveryZone: orderSource.deliveryZone,
          streetNumberMatched: orderSource.streetNumberMatched,
          raw: orderSource,
          isSelected: false,
        });
      });
    });

    return grouped
  }, [excelData?.orders, excelData?.couriers, excelData?.routes])

  // Precompute set of orders in routes for O(1) lookups
  const ordersInRoutesSet = useMemo(() => {
    const set = new Set<string>()
      ; (excelData?.routes || []).forEach((route: Route) => {
        route.orders.forEach((order: Order) => {
          const sid = getStableOrderId(order);
          set.add(sid);
          // v5.160: Also track by orderNumber
          if (order.orderNumber) set.add(`num_${order.orderNumber}`);
        })
      })
    return set
  }, [excelData?.routes])

  // Функция для получения метрик курьера (Optimized with Memoization)
  const courierMetricsMap = useMemo(() => {
    // Build lookup: normalized-uppercase-name -> orders[]
    // Keys in courierOrders are UPPERCASE (normalizeCourierName output)
    // We build a secondary index: normalized-uppercase -> orders
    const nameToOrders = new Map<string, any[]>();
    Object.entries(courierOrders).forEach(([k, v]) => {
      nameToOrders.set(normalizeCourierName(k), v);
    });

    const map = new Map<string, { available: number; delivered: number; total: number; activeInRoute: number; unassigned: number; distanceKm: number }>()

    const allCouriers = new Set([
      ...Object.keys(courierOrders),
      ...(excelData?.couriers?.map((c: any) => c.name) || [])
    ].filter(name => normalizeCourierName(name).toLowerCase() !== 'по'))

    allCouriers.forEach(name => {
      if (!name) return
      const normUpperKey = normalizeCourierName(name); // UPPERCASE normalized
      // Skip if already processed this courier (dedup)
      if (map.has(normUpperKey)) return;

      // v5.134: Look up via UPPERCASE key (matches courierOrders keys)
      const orders = nameToOrders.get(normUpperKey) || []

      let available = 0
      let delivered = 0
      let activeInRoute = 0

      for (const order of orders) {
        const sid = getStableOrderId(order);
        const inRoute = ordersInRoutesSet.has(sid);
        const completed = isOrderCompleted(order.status);
        const isCancelled = isOrderCancelled(order.status);
        
        // v5.114: Only count orders as 'available' if they are NOT in a route AND (Active or not completed/cancelled)
        const isActionable = !completed && !isCancelled;

        if (!inRoute && isActionable) {
          available++
        }
        if (completed) {
          delivered++
        }
        if (inRoute && !completed) {
          activeInRoute++
        }
      }

      // v5.153: Get distance metrics from the couriers array state
      const courierState = (excelData?.couriers || []).find((c: any) => normalizeCourierName(c.name) === normUpperKey);
      const distanceKm = courierState?.distanceKm || 0;

      map.set(normUpperKey, { 
        available, 
        delivered, 
        // v5.114: Use filtered total for actionable orders ONLY if it's the unassigned pool
        // to keep the badge accurate, otherwise use physical total.
        total: (normUpperKey === 'НЕ НАЗНАЧЕНО' || isId0CourierName(name)) ? available : orders.length, 
        activeInRoute,
        unassigned: available,
        distanceKm
      })
    })

    return map
  }, [courierOrders, ordersInRoutesSet, excelData?.couriers])

  const getCourierMetrics = useCallback((courierName: string) => {
    // v5.134: Always look up by UPPERCASE-normalized key to match courierMetricsMap storage
    const normKey = normalizeCourierName(courierName);
    return courierMetricsMap.get(normKey) || { available: 0, delivered: 0, total: 0, activeInRoute: 0, unassigned: 0, distanceKm: 0 }
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

  // ─── Wire "ЗАПУСТИТЬ РАСЧЕТ" button from CourierCard ──────────────────────
  // v5.153: Properly triggers the background Turbo Robot via REST API.
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const token = localStorage.getItem('km_access_token');
      if (!token) {
        toast.error('❌ Не авторизован');
        return;
      }

      const { user } = await import('../../contexts/AuthContext').then(() => ({ user: (window as any).__user || null }));
      const divisionId = user?.divisionId || (excelData as any)?.divisionId || (excelData as any)?.orders?.[0]?.departmentId || null;

      const { useDashboardStore } = await import('../../stores/useDashboardStore');
      const apiDateShift = useDashboardStore.getState().apiDateShift;
      const today = new Date().toISOString().split('T')[0];
      let targetDate = today;
      if (apiDateShift) {
        if (/^\d{2}\.\d{2}\.\d{4}$/.test(apiDateShift)) {
          const p = apiDateShift.split('.');
          targetDate = `${p[2]}-${p[1]}-${p[0]}`;
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(apiDateShift)) {
          targetDate = apiDateShift;
        }
      }

      const courierName = detail?.courierName || null;
      const loadingToast = toast.loading(`🤖 Запускаю фоновый расчёт${courierName ? ` для ${courierName}` : ''}...`);

      try {
        const res = await fetch('/api/turbo/priority', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ divisionId, date: targetDate, courierFilter: courierName })
        });
        const json = await res.json();
        if (json.success) {
          toast.dismiss(loadingToast);
          toast.success(`🤖 Фоновый робот запущен! Результаты появятся через 30-60 секунд.`);
        } else {
          toast.dismiss(loadingToast);
          toast.error(`❌ Ошибка: ${json.error || 'Неизвестная ошибка'}`);
        }
      } catch (err: any) {
        toast.dismiss(loadingToast);
        toast.error(`❌ Сетевая ошибка: ${err.message}`);
      }
    };

    window.addEventListener('km-force-auto-routing', handler);
    return () => window.removeEventListener('km-force-auto-routing', handler);
  }, [excelData]);

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

        // v42.1: Tracking calculated vs total
        const routeOrdersCount = (excelData?.routes || [])
          .filter((r: any) => normalizeCourierName(r.courier) === name)
          .reduce((sum: number, r: any) => sum + (r.orders?.length || 0), 0);
        
        const m = courierMetricsMap.get(name) || { available: 0, delivered: 0, total: 0 }
        const remaining = m.total - m.delivered;

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
          calculatedCount: routeOrdersCount,
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
      
      // Get calculated count (orders in routes) across ALL routes for this courier
      const calculatedCount = (excelData?.routes || [])
        .filter((r: any) => normalizeCourierName(r.courier) === name)
        .reduce((sum: number, r: any) => sum + (r.orders?.length || 0), 0);

      // Refined: "In Transit" if started but > 2 left, or haven't started yet
      if (m.total > 0 && (m.delivered === 0 || (m.delivered > 0 && remaining > 2))) {
        list.push({
          name,
          delivered: m.delivered,
          total: m.total,
          calculatedCount: calculatedCount,
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

    // Всегда добавляем "Не назначено" как базовый пул
    courierMap.set('не назначено', 'Не назначено')

    // Из уже сгруппированных по заказам
    Object.keys(courierOrders).forEach(name => {
      const norm = normalizeCourierName(name)
      const key = norm.toLowerCase()
      // v35.15: Skip "ПО"
      if (key && key !== 'по' && !courierMap.has(key)) {
        courierMap.set(key, norm)
      }
    })

    // Из основного списка курьеров в excelData (чтобы видеть даже тех, у кого нет заказов)
    if (excelData?.couriers && Array.isArray(excelData.couriers)) {
      excelData.couriers.forEach((c: any) => {
        if (!c?.name) return;
        const norm = normalizeCourierName(c.name)
        const key = norm.toLowerCase()
        // v35.15: Skip "ПО"
        if (key && key !== 'по' && !courierMap.has(key)) {
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

    // Filter by type or status
    if (courierFilter !== 'all') {
      result = result.filter(courierName => {
        if (courierFilter === 'car' || courierFilter === 'moto') {
          const vehicleType = getCourierVehicleType(courierName)
          return vehicleType === courierFilter
        }
        if (courierFilter === 'delivering') {
          const metrics = getCourierMetrics(courierName)
          return metrics.total > 0 && metrics.delivered < metrics.total
        }
        if (courierFilter === 'completed') {
          const metrics = getCourierMetrics(courierName)
          return metrics.total > 0 && metrics.delivered === metrics.total
        }
        return true
      })
    }

    // Filter by search (deferred)
    if (deferredCourierSearchTerm) {
      const term = deferredCourierSearchTerm.toLowerCase()
      result = result.filter(name => name.toLowerCase().includes(term))
    }

    // Sort
    const sorted = result.sort((a, b) => {
      // "Не назначен" always top (though we'll filter it out of scrolling list soon)
      if (a === 'Не назначено' || a === 'ID:0') return -1;
      if (b === 'Не назначено' || b === 'ID:0') return 1;

      if (courierSortType === 'load') {
        const metricsA = getCourierMetrics(a)
        const metricsB = getCourierMetrics(b)
        const remA = metricsA.total - metricsA.delivered
        const remB = metricsB.total - metricsB.delivered
        // Sort descending by remaining (active tasks) first
        if (remA !== remB) return remB - remA;
        
        // If remaining is same, sort by total descending
        if (metricsA.total !== metricsB.total) return metricsB.total - metricsA.total;
      }

      return a.localeCompare(b, 'ru');
    })

    // Separate "Не назначено" from the rest for pinning logic
    return sorted.filter(c => c !== 'Не назначено' && !isId0CourierName(c));
  }, [couriers, courierFilter, deferredCourierSearchTerm, courierSortType, getCourierMetrics, getCourierVehicleType])

  // v5.72: Auto-select 'Не назначено' on mount to show initial orders
  useEffect(() => {
    if (!selectedCourier) {
      // Пул "Не назначено" всегда в приоритете при первом входе
      const hasUnassigned = couriers.some(c => c === 'Не назначено' || isId0CourierName(c));
      if (hasUnassigned) {
        setSelectedCourier('Не назначено');
      } else if (filteredCouriers.length > 0) {
        setSelectedCourier(filteredCouriers[0]);
      }
    }
  }, [selectedCourier, couriers, filteredCouriers]);

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
  const filteredData = useMemo(() => {
    if (!selectedCourier) {
      return { availableOrders: [], courierAvailableOrders: [], unassignedPool: [], ordersInRoutes: [] }
    }

    // 1. Collect orders for selected courier
    // v5.134: courierOrders keys are UPPERCASE-normalized, selectedCourier may be any case
    const normSelected = normalizeCourierName(selectedCourier);
    let selectedCourierRawOrders: Order[] = courierOrders[normSelected] || [];

    // Fallback: if selected is an ObjectId, resolve it to a name and try again
    if (selectedCourierRawOrders.length === 0 && /^[0-9a-f]{24}$/i.test(String(selectedCourier))) {
        const resolved = CourierIdResolver.resolve(String(selectedCourier));
        if (resolved) {
            selectedCourierRawOrders = courierOrders[normalizeCourierName(resolved)] || [];
        }
    }

    // 2. Aggregate unassigned orders ONLY if viewing the unassigned pool
    // v5.139: Deduplicate orders that may exist in both 'ID:0' AND 'Не назначено' groups
    const unassignedSeenIds = new Set<string>();
    const unassignedOrders: Order[] = []
    
    // Only if searching in "Не назначено" or if admin wants to see "ID:0"
    const isUnassignedSelected = isId0CourierName(selectedCourier) || selectedCourier === 'Не назначено';
    
    if (isUnassignedSelected) {
      Object.entries(courierOrders).forEach(([courierName, orders]) => {
        if (isId0CourierName(courierName) || courierName === 'Не назначено') {
          orders.forEach(o => {
            const sid = getStableOrderId(o);
            if (!sid) return; // Skip orders without ID
            
            // v5.139: Skip if already added (deduplicate across both groups)
            if (unassignedSeenIds.has(sid)) {
              console.warn(`[RouteManagement] ⚠️ Duplicate order ${sid} in unassigned pool (exists in both ID:0 and Не назначено)`);
              return;
            }
            unassignedSeenIds.add(sid);
            
            const s = (o.status || '').toLowerCase().trim();
            const isInProgress = s === 'доставляется' || s === 'в пути';
            const isCompleted = isOrderCompleted(o.status);
            const isCancelled = isOrderCancelled(o.status);
            
            // v5.114: Exclude already delivering, completed, and canceled orders from unassigned pool
            if (!isCompleted && !isCancelled && !isInProgress) {
              unassignedOrders.push(o)
            }
          })
        }
      })
    }

    const rawOrders = selectedCourierRawOrders

    if (rawOrders.length === 0 && unassignedOrders.length === 0) {
      return {
        availableOrders: [],
        courierAvailableOrders: [],
        unassignedPool: [],
        ordersInRoutes: []
      }
    }

    const ordersWithSearch = searchOrders(rawOrders)
    const sortedAndDeduplicated = sortOrdersByTime(ordersWithSearch).filter((o, index, self) => {
      const sid = getStableOrderId(o);
      return self.findIndex(t => getStableOrderId(t) === sid) === index;
    })

    // 3. Split selected courier's orders into available and in-routes
    const courierAvailable: Order[] = []
    const inRoutes: Order[] = []

    sortedAndDeduplicated.forEach(order => {
      const sid = getStableOrderId(order);
      if (ordersInRoutesSet.has(sid)) {
        inRoutes.push(order)
      }
      courierAvailable.push(order)
    })

    // 4. Truly unassigned orders (for the "pool")
    let availablePool = [...unassignedOrders]

    // v35.12: Filter unassigned orders by specific business status
    if (unassignedStatusFilter !== 'all') {
      availablePool = availablePool.filter(o => {
        const s = (o.status || '').toLowerCase().trim();
        if (unassignedStatusFilter === 'оформление') {
          // Broad variants for "Оформление"
          return s.includes('оформлен') || s.includes('оформление') || s.includes('сформирован') || s.includes('формируется') || s.includes('новый') || s.includes('new') || s.includes('draft');
        }
        if (unassignedStatusFilter === 'в работе') {
          // Broad variants for "В работе"
          return s.includes('в работе') || s.includes('собирается') || s.includes('собран') || s.includes('в сборке') || s.includes('уточнение') || s.includes('work') || s.includes('processing');
        }
        if (unassignedStatusFilter === 'другое') {
          const isDraft = s.includes('оформлен') || s.includes('оформление') || s.includes('сформирован') || s.includes('формируется') || s.includes('новый') || s.includes('new') || s.includes('draft');
          const isInProgress = s.includes('в работе') || s.includes('собирается') || s.includes('собран') || s.includes('в сборке') || s.includes('уточнение') || s.includes('work') || s.includes('processing');
          return !isDraft && !isInProgress;
        }
        return true;
      });
    }

    // RESTRICTED: Real couriers should see ONLY their own orders.
    // The "unassigned pool" orders are only visible when "Не назначено" is selected.
    const totalAvailable = (isId0CourierName(selectedCourier) || selectedCourier === 'Не назначено')
      ? availablePool
      : courierAvailable;

    return {
      availableOrders: totalAvailable,
      courierAvailableOrders: courierAvailable,
      unassignedPool: availablePool,
      ordersInRoutesSet: ordersInRoutesSet,
      ordersInRoutes: inRoutes
    }
  }, [selectedCourier, courierOrders, searchOrders, sortOrdersByTime, ordersInRoutesSet, unassignedStatusFilter]);

  const { availableOrders, courierAvailableOrders, unassignedPool, ordersInRoutes } = filteredData;

  // v35.14: Auto-collapse grouped orders if everything is already in routes (assigned/calculated)
  useEffect(() => {
    if (availableOrders.length > 0) {
      const allCalculated = availableOrders.every(o => ordersInRoutesSet.has(getStableOrderId(o)));
      if (allCalculated) {
        setIsGroupedExpanded(false);
      }
    }
  }, [availableOrders, ordersInRoutesSet]);


  // v37: Defer the lists to prevent main-thread blocking on selection
  const deferredAvailableOrders = useDeferredValue(availableOrders)
  const deferredCourierAvailableOrders = useDeferredValue(courierAvailableOrders)
  const deferredUnassignedPool = useDeferredValue(unassignedPool)

  // v35.13: Auto-collapse grouped orders if none available to route
  const ordersForGroupingCount = (isId0CourierName(selectedCourier) || selectedCourier === 'Не назначено')
    ? (deferredUnassignedPool?.length || 0)
    : (deferredCourierAvailableOrders?.length || 0);

  useEffect(() => {
    if (ordersForGroupingCount === 0) {
      setIsGroupedExpanded(false);
    } else {
      setIsGroupedExpanded(true);
    }
  }, [ordersForGroupingCount, selectedCourier]);

  // Сортировка и пагинация маршрутов (v40: Enriched with master data for badges)
  const allRoutes = useMemo(() => {
    const rawRoutes = (excelData?.routes || []) as Route[];
    const allOrdersList = (excelData?.orders || []) as Order[];
    const masterOrdersMap = new Map(allOrdersList.map(o => [String(o.id), o]));

    // Helper to enrich sequence of orders (v5.71: Deduplicating by Number + ID)
    const enrichOrders = (ordersToEnrich: any[]) => {
      const seen = new Set();
      // v5.170: Also create lookup by orderNumber for backend routes
      const masterOrdersByNumber = new Map(allOrdersList.map(o => [String(o.orderNumber), o]));

      return (ordersToEnrich || [])
        .filter(order => {
          // Use orderNumber as primary unique key if available, fallback to id
          const key = order.orderNumber ? `num_${order.orderNumber}` : `id_${order.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map(order => {
          // v5.170: Try lookup by id first, then by orderNumber
          const masterOrder = masterOrdersMap.get(String(order.id)) || masterOrdersByNumber.get(String(order.orderNumber));
          const lat = masterOrder?.lat || order.lat || order.coords?.lat;
          const lng = masterOrder?.lng || order.lng || order.coords?.lng;

          const locType = masterOrder?.locationType || order.locationType || (order as any).coords?.locationType;
          const streetMatch = (masterOrder as any)?.streetNumberMatched ?? order.streetNumberMatched;

          let finalKmlZone = masterOrder?.kmlZone || order.kmlZone || masterOrder?.deliveryZone || order.deliveryZone;
          let finalKmlHub = masterOrder?.kmlHub || order.kmlHub;

          if (!finalKmlZone && lat && lng) {
            const zoneMatch = robustGeocodingService.findZoneForCoords(lat, lng);
            if (zoneMatch) {
              finalKmlZone = zoneMatch.zoneName;
              finalKmlHub = zoneMatch.hubName;
            }
          }

          return {
            ...order,
            ...masterOrder,
            // v5.170: CRITICAL — address must come from master if order.address is empty
            address: order.address || masterOrder?.address || 'Адрес не указан',
            orderNumber: order.orderNumber || masterOrder?.orderNumber || 'N/A',
            kmlZone: finalKmlZone,
            kmlHub: finalKmlHub,
            deliveryZone: masterOrder?.deliveryZone || order.deliveryZone || finalKmlZone,
            lat,
            lng,
            locationType: locType,
            streetNumberMatched: streetMatch,
            coords: order.coords || (lat && lng ? { lat, lng, locationType: locType } : undefined)
          };
        });
    };

    // 1. Process existing calculated routes
    const processedRoutes = rawRoutes.map(route => {
      // v5.170: Backend stores orders in route_data.orders, not route.orders
      const routeOrders = route.orders || (route as any).route_data?.orders || [];
      return {
        ...route,
        orders: enrichOrders(routeOrders)
      };
    });

    // 2. Identify "Orphaned" orders (assigned to courier but not in any route)
    const ordersInCalculatedRoutes = new Set();
    rawRoutes.forEach(r => r.orders?.forEach(o => {
      if (o.id) ordersInCalculatedRoutes.add(`id_${o.id}`);
      if (o.orderNumber) ordersInCalculatedRoutes.add(`num_${o.orderNumber}`);
    }));

    const orphanedOrdersByCourier = new Map<string, Order[]>();
    allOrdersList.forEach((order) => {
      const courierId = (order as any).deliveryCourier || (order as any).courier;
      const isAlreadyInRoute = ordersInCalculatedRoutes.has(`id_${order.id}`) || 
                               (order.orderNumber && ordersInCalculatedRoutes.has(`num_${order.orderNumber}`));

      const status = (order.status || '').toLowerCase().trim();
      const isInProgress = status === 'доставляется' || status === 'в пути';
      const isUnassigned = !courierId || isId0CourierName(courierId) || courierId === 'Не назначено';

      // v5.112: Include delivering orders in orphans even if courier is ID:0 / Unassigned
      // This ensures they stay visible on the dashboard in a special block block.
      if (courierId && (!isUnassigned || isInProgress) && !isAlreadyInRoute) {
        const effectiveCourier = isUnassigned ? 'НЕИЗВЕСТНЫЙ (В ПУТИ)' : String(courierId);
        if (!orphanedOrdersByCourier.has(effectiveCourier)) {
          orphanedOrdersByCourier.set(effectiveCourier, []);
        }
        orphanedOrdersByCourier.get(effectiveCourier)?.push(order);
      }
    });

    // 3. Create "Virtual Routes" for orphans
    const virtualRoutes: Route[] = [];
    orphanedOrdersByCourier.forEach((orders, courierId) => {
      virtualRoutes.push({
        id: `virtual_${courierId}_${Date.now()}_${Math.random()}`,
        courier: courierId,
        orders: enrichOrders(orders),
        totalDistance: 0,
        totalDuration: 0,
        startAddress,
        endAddress,
        isVirtual: true, // Special flag for UI
        title: 'Новий блок (потрібно розрахувати)'
      } as any);
    });

    return [...processedRoutes, ...virtualRoutes];
  }, [excelData?.routes, excelData?.orders, startAddress, endAddress]);

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

  // --- v5.7: Виртуализированный список с поддержкой сетки (Grid) ---
  // Перенесен наружу для стабильности ссылок
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
    const route = excelData?.routes?.find((r: any) => r.id === routeId)
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
  const handleAddressUpdate = (newAddress: string, coords?: { lat: number; lng: number }) => {
    if (!editingOrder) return

    const affectedRouteIds: string[] = [];

    // 1. Calculate next orders state
    const nextOrders = (excelData?.orders || []).map((order: any) =>
      order.id === editingOrder.id ? { 
        ...order, 
        address: newAddress,
        // v35.9.28: Save coordinates if provided manually
        lat: coords?.lat ?? order.lat,
        lng: coords?.lng ?? order.lng,
        coords: coords ?? order.coords,
        isAddressLocked: !!coords,
        locationType: coords ? 'ROOFTOP' : order.locationType
      } : order
    );

    // 2. Calculate next routes state and track affected ones
    const nextRoutes = (excelData?.routes || []).map((route: Route) => {
      const orderId = editingOrder.id;
      const orderIndex = route.orders.findIndex((o: Order) => o.id === orderId);
      
      if (orderIndex !== -1) {
        affectedRouteIds.push(route.id);
        const updatedRouteOrders = [...route.orders];
        const updatedOrder = { 
          ...editingOrder, 
          address: newAddress,
          lat: coords?.lat ?? editingOrder.lat,
          lng: coords?.lng ?? editingOrder.lng,
          coords: coords ?? editingOrder.coords,
          isAddressLocked: !!coords,
          locationType: coords ? 'ROOFTOP' : editingOrder.locationType
        };
        updatedRouteOrders[orderIndex] = updatedOrder;
        
        return {
          ...route,
          orders: updatedRouteOrders,
          isOptimized: false,
          totalDistance: 0,
          totalDuration: 0
        };
      }
      return route;
    });

    const nextState = {
      ...(excelData || { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: undefined }),
      routes: nextRoutes,
      orders: nextOrders
    };

    // 3. Save and Update
    updateExcelData(nextState);
    saveManualOverrides(nextOrders); // Ensure persistence after refresh

    // 4. Trigger auto-recalculation for affected routes
    affectedRouteIds.forEach(routeId => {
      const updatedRoute = nextRoutes.find((r: any) => r.id === routeId);
      if (updatedRoute) {
        recalculateRoute(updatedRoute);
      }
    });

    setShowAddressEditModal(false);
    setEditingOrder(null);
  };

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

  const clearAllRoutes = async () => {
    if (window.confirm('Вы уверены, что хотите удалить все маршруты?')) {
      const store = useDashboardStore.getState();
      const divisionId = store.divisionId || 'all';
      const date = store.apiDateShift;

      // v5.160: Clear ALL route-related localStorage keys
      try {
        localStorage.removeItem('km_routes');
        localStorage.removeItem('km_routes_last_updated');
        localStorage.removeItem('km_dashboard_processed_data');
      } catch (error) {
        console.error('Error clearing routes from localStorage:', error);
      }

      // API Call to clear the backend Calculated Routes
      try {
        const token = localStorage.getItem('km_access_token');
        if (token) {
          await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/routes/all/calculated?divisionId=${divisionId}&date=${date}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
        }
      } catch (err) {
        console.error('Error clearing remote routes:', err);
      }

      // v5.160: Force update with empty routes
      updateExcelData({
        ...(excelData || { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: undefined }),
        routes: []
      }, true /* force: true */);

      // Force socket robot update to stop if it's running for this division
      const socket = socketService.getSocket();
      if (socket) {
        socket.emit('robot_control', {
            action: 'stop',
            divisionId: divisionId
        });
      }

      toast.success('Все маршруты очищены');
    }
  }

  const clearEmptyRoutes = () => {
    updateExcelData((prev: any) => {
      const routes = prev?.routes || [];
      const nonEmptyRoutes = routes.filter((r: Route) => {
        return r.orders && r.orders.length > 0;
      });

      if (nonEmptyRoutes.length === routes.length) {
        toast.error('Нет пустых маршрутов для удаления');
        return prev;
      }
      toast.success(`Удалено пустых маршрутов: ${routes.length - nonEmptyRoutes.length}`);
      return {
        ...prev,
        routes: nonEmptyRoutes
      };
    }, true);
  }

  const openRouteInGoogleMaps = (route: Route) => {
    if (!route) return
    const url = exportToGoogleMaps({
      route,
      orders: route.orders || [],
      startAddress: startAddress || '',
      endAddress: endAddress || '',
      startCoords: (localSettings.defaultStartLat && localSettings.defaultStartLng) ? { lat: localSettings.defaultStartLat, lng: localSettings.defaultStartLng } : undefined,
      endCoords: (localSettings.defaultEndLat && localSettings.defaultEndLng) ? { lat: localSettings.defaultEndLat, lng: localSettings.defaultEndLng } : undefined
    })
    if (url) window.open(url, '_blank')
  }

  const openRouteInValhalla = (route: Route) => {
    if (!route) return
    const url = exportToValhalla({
      route,
      orders: route.orders || [],
      startAddress: startAddress || '',
      endAddress: endAddress || '',
      startCoords: (localSettings.defaultStartLat && localSettings.defaultStartLng) ? { lat: localSettings.defaultStartLat, lng: localSettings.defaultStartLng } : undefined,
      endCoords: (localSettings.defaultEndLat && localSettings.defaultEndLng) ? { lat: localSettings.defaultEndLat, lng: localSettings.defaultEndLng } : undefined
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
                <span>{fleetStats.total} курьеров, {(excelData?.routes?.length ?? 0)} маршрутов</span>
              </div>
              <Tooltip
                content="Обновить маршруты из базы данных"
                position="left"
              >
                <button
                  onClick={() => {
                    const refreshFn = (window as any).__refreshTurboRoutes;
                    if (refreshFn) {
                      refreshFn();
                      toast.success('Обновляю маршруты...', { duration: 1500 });
                    }
                  }}
                  className={clsx(
                    'p-3 rounded-xl transition-all hover:scale-105',
                    isDark
                      ? 'bg-gray-700 hover:bg-gray-600 text-green-400'
                      : 'bg-white hover:bg-green-50 text-green-600 shadow-lg'
                  )}
                >
                  <ArrowPathIcon className="w-6 h-6" />
                </button>
              </Tooltip>
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
              <div className="flex items-center gap-4">
                <ServiceStatusDashboard />
              </div>
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
                  {/* SOTA 5.9: Harmonious Header Layout (v35.12: Prevent overlapping) */}
                  <div className="flex items-center justify-between">
                    <h2 className={clsx(
                      'text-xl font-black tracking-tight',
                      isDark ? 'text-gray-100' : 'text-gray-900'
                    )}>Курьеры</h2>
                    
                    <div className="flex items-center gap-1.5">
                      {/* Sort/Toggle can go here if needed */}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 bg-gray-100 dark:bg-black/40 p-1 rounded-xl border dark:border-white/5 shadow-inner overflow-x-auto no-scrollbar scroll-smooth">
                    {['all', 'delivering', 'completed', 'car', 'moto'].map((f) => (
                      <button
                        key={f}
                        onClick={() => setCourierFilter(f as any)}
                        className={clsx(
                          'px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all whitespace-nowrap flex-shrink-0',
                          courierFilter === f
                            ? (isDark ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-white text-blue-600 shadow-md')
                            : (isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-800')
                        )}
                      >
                        {f === 'all' ? 'Все' : f === 'delivering' ? 'Доставл' : f === 'completed' ? 'Завершил' : f === 'car' ? 'Авто' : 'Мото'}
                      </button>
                    ))}
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
                      <MagnifyingGlassIcon className="w-3.5 h-3.5 opacity-30" />
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

                <div className="flex-1 min-h-[400px] flex flex-col gap-2 overflow-y-auto pr-2 custom-scrollbar">
                  {/* Pinned "Не назначено" Pool */}
                  <div className="flex-shrink-0 sticky top-0 z-10 bg-white dark:bg-slate-900 pb-1">
                    <CourierListItem
                      courierName="Не назначено"
                      vehicleType="car"
                      isSelected={selectedCourier === 'Не назначено' || isId0CourierName(selectedCourier)}
                      onSelect={(name) => handleCourierSelect(name)}
                      deliveredOrdersCount={getCourierMetrics('Не назначено').delivered}
                      totalOrdersCount={getCourierMetrics('Не назначено').total}
                      calculatedCount={getCourierMetrics('Не назначено').activeInRoute}
                      unassignedCount={getCourierMetrics('Не назначено').unassigned}
                      isDark={isDark}
                    />
                    <div className="h-px bg-gray-200 dark:bg-white/5 mt-2" />
                  </div>

                  <div className="h-px bg-gray-200 dark:bg-white/5 my-1 mx-2" />

                  {filteredCouriers.length === 0 ? (
                    <div className="text-center py-10 h-full flex flex-col items-center justify-center">
                      <TruckIcon className="w-10 h-10 mx-auto text-gray-300 mb-2 opacity-50" />
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-widest px-4">Курьеры не найдены</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 pb-8">
                      {(() => {
                        const totalPages = Math.ceil(filteredCouriers.length / couriersPerPage);
                        const safePage = Math.min(Math.max(1, courierPage), Math.max(1, totalPages));
                        const startIndex = (safePage - 1) * couriersPerPage;
                        const visibleCouriers = filteredCouriers.slice(startIndex, startIndex + couriersPerPage);
                        
                        return (
                          <>
                            {visibleCouriers.map((name) => {
                              const metric = getCourierMetrics(name);
                              const vehicleType = getCourierVehicleType(name);
                              return (
                                <div
                                  key={name}
                                  style={{ contain: 'content', contentVisibility: 'auto', containIntrinsicSize: '0 80px' }}
                                >
                                  <CourierListItem
                                    courierName={name}
                                    vehicleType={vehicleType}
                                    isSelected={selectedCourier === name}
                                    onSelect={handleCourierSelect}
                                    deliveredOrdersCount={metric.delivered}
                                    totalOrdersCount={metric.total}
                                    calculatedCount={metric.activeInRoute}
                                    unassignedCount={metric.unassigned}
                                    distanceKm={metric.distanceKm}
                                    isDark={isDark}
                                  />
                                </div>
                              );
                            })}
                            
                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                              <div className={clsx(
                                "flex items-center justify-between p-2 mt-2 rounded-xl border transition-colors",
                                isDark ? "bg-gray-800/50 border-gray-700" : "bg-gray-50 border-gray-200"
                              )}>
                                <button
                                  onClick={() => setCourierPage(p => Math.max(1, p - 1))}
                                  disabled={safePage === 1}
                                  className={clsx(
                                    "px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                                    safePage === 1
                                      ? "opacity-30 cursor-not-allowed"
                                      : isDark ? "hover:bg-gray-700 bg-gray-800" : "hover:bg-white bg-gray-100"
                                  )}
                                >
                                  Назад
                                </button>
                                <span className="text-[10px] font-black opacity-50">
                                  {safePage} из {totalPages}
                                </span>
                                <button
                                  onClick={() => setCourierPage(p => Math.min(totalPages, p + 1))}
                                  disabled={safePage === totalPages}
                                  className={clsx(
                                    "px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                                    safePage === totalPages
                                      ? "opacity-30 cursor-not-allowed"
                                      : isDark ? "hover:bg-gray-700 bg-gray-800" : "hover:bg-white bg-gray-100"
                                  )}
                                >
                                  Далее
                                </button>
                              </div>
                            )}
                          </>
                        );
                      })()}
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
                        "w-20 h-20 rounded-[2rem] flex items-center justify-center shadow-2xl relative overflow-hidden group transition-all",
                        isDark 
                          ? "bg-gradient-to-br from-blue-600 to-indigo-700 shadow-blue-500/20" 
                          : "bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/20"
                      )}>
                        <div className="absolute inset-0 bg-white/10 group-hover:bg-transparent transition-colors" />
                        <UserIcon className="w-10 h-10 text-white relative z-10" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                          <h2 className={clsx('text-3xl font-black tracking-tight uppercase', isDark ? 'text-white' : 'text-gray-900')}>
                            {isId0CourierName(selectedCourier) || selectedCourier === 'Не назначено' ? 'НЕ НАЗНАЧЕННЫЕ ЗАКАЗЫ' : selectedCourier}
                          </h2>
                          <div className={clsx(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2",
                            isDark ? "bg-white/10 text-blue-400" : "bg-blue-50 text-blue-600"
                          )}>
                            <div className={clsx("w-1.5 h-1.5 rounded-full animate-pulse", isDark ? "bg-blue-400" : "bg-blue-600")} />
                            <span>{getCourierVehicleType(selectedCourier) !== 'car' ? 'МОТО' : 'АВТО'}</span>
                          </div>
                        </div>
                        <p className={clsx('text-sm font-bold opacity-60 uppercase tracking-widest', isDark ? 'text-gray-400' : 'text-gray-500')}>
                          {isId0CourierName(selectedCourier) || selectedCourier === 'Не назначено'
                            ? `Доступно ${availableOrders.length} заказов`
                            : `Заказы курьера`}
                        </p>
                      </div>
                    </div>

                    {/* v35.12: Status Filtering for Unassigned Pool */}
                    {(isId0CourierName(selectedCourier) || selectedCourier === 'Не назначено') && (
                      <div className="flex items-center gap-1.5 bg-gray-100/50 dark:bg-black/40 p-1 rounded-2xl border dark:border-white/5 shadow-inner">
                        {([
                          { id: 'all', label: 'ВСЕ' },
                          { id: 'оформление', label: 'ОФОРМЛЕНИЕ' },
                          { id: 'в работе', label: 'В РАБОТЕ' },
                          { id: 'другое', label: 'ПРОЧИЕ' }
                        ] as const).map((filter) => (
                          <button
                            key={filter.id}
                            onClick={() => setUnassignedStatusFilter(filter.id as any)}
                            className={clsx(
                              "px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all whitespace-nowrap",
                              unassignedStatusFilter === filter.id
                                ? (isDark ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "bg-white text-blue-600 shadow-md")
                                : (isDark ? "text-gray-500 hover:text-gray-300" : "text-gray-400 hover:text-gray-600")
                            )}
                          >
                            {filter.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {!isId0CourierName(selectedCourier) && selectedCourier !== 'Не назначено' && (
                      <div className="flex items-center gap-4">
                         {/* Stats Box: Calculated / Total / Remaining */}
                        <div className={clsx(
                          "flex items-center gap-1 p-1 rounded-2xl border shadow-sm",
                          isDark ? "bg-black/40 border-white/5" : "bg-white border-blue-50"
                        )}>
                          <div className={clsx(
                            "px-4 py-2 rounded-xl flex flex-col items-center justify-center min-w-[70px]",
                            isDark ? "bg-white/5" : "bg-gray-50"
                          )}>
                            <span className="text-lg font-black leading-none mb-1">
                              {getCourierMetrics(selectedCourier).total}
                            </span>
                            <span className="text-[7px] font-black uppercase tracking-widest opacity-40">Всего</span>
                          </div>

                          <div className={clsx(
                            "px-4 py-2 rounded-xl flex flex-col items-center justify-center min-w-[70px]",
                            isDark ? "bg-emerald-500/10" : "bg-emerald-50"
                          )}>
                            <span className={clsx("text-lg font-black leading-none mb-1", isDark ? "text-emerald-400" : "text-emerald-600")}>
                                {getCourierMetrics(selectedCourier).activeInRoute}
                            </span>
                            <span className={clsx("text-[7px] font-black uppercase tracking-widest opacity-60", isDark ? "text-emerald-400/50" : "text-emerald-600/50")}>В пути</span>
                          </div>

                          <div className={clsx(
                            "px-4 py-2 rounded-xl flex flex-col items-center justify-center min-w-[70px]",
                            isDark ? "bg-orange-500/10" : "bg-orange-50"
                          )}>
                            <span className={clsx("text-lg font-black leading-none mb-1", isDark ? "text-orange-400" : "text-orange-600")}>
                                {getCourierMetrics(selectedCourier).total - getCourierMetrics(selectedCourier).delivered}
                            </span>
                            <span className={clsx("text-[7px] font-black uppercase tracking-widest opacity-60", isDark ? "text-orange-400/50" : "text-orange-600/50")}>Осталось</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3">
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
                        
                        <button
                          onClick={() => setIsGroupedExpanded(!isGroupedExpanded)}
                          className={clsx(
                            "p-1.5 rounded-lg transition-all",
                            isDark ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-500"
                          )}
                        >
                          <ChevronLeftIcon className={clsx("w-4 h-4 transition-transform duration-300", isGroupedExpanded ? "-rotate-90" : "rotate-0")} />
                        </button>

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

                      <div className={clsx(
                        "transition-all duration-500 overflow-hidden",
                        isGroupedExpanded ? "max-h-[8000px] opacity-100 mt-6" : "max-h-0 opacity-0 mt-0"
                      )}>
                        <CourierTimeWindows
                        courierId={String(selectedCourier || '')}
                        courierName={isId0CourierName(selectedCourier) ? 'Не назначено' : (String(selectedCourier) || '')}
                        orders={(isId0CourierName(selectedCourier) || selectedCourier === 'Не назначено') ? deferredUnassignedPool : deferredCourierAvailableOrders}
                        isDark={isDark}
                        ordersInRoutesSet={ordersInRoutesSet}
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

                            // 2. Execute one giant batch geocode for everything
                            // v5.152: Improved geocoding with high accuracy options
                            const addrCache = await batchGeocode(
                              Array.from(uniqueAddresses).map(addr => ({
                                address: addr,
                                options: { 
                                  turbo: true, 
                                  silent: true,
                                  strictZoneFallback: false,  // Don't ask for clarifications
                                  maxResults: 1,               // Return best match only
                                  timeout: 5000                // 5 second timeout per address
                                }
                              }))
                            );
                            
                            // v5.152: Retry failed addresses with fallback providers
                            const failedAddresses = Array.from(uniqueAddresses).filter(addr => {
                              const key = addr.trim().toLowerCase();
                              return !addrCache.has(key);
                            });
                            
                            if (failedAddresses.length > 0) {
                              const retryResults = await batchGeocode(
                                failedAddresses.map(addr => ({
                                  address: addr,
                                  options: { 
                                    turbo: false,  // Use slower but more accurate providers
                                    silent: true,
                                    strictZoneFallback: false,
                                    maxResults: 1
                                  }
                                }))
                              );
                              retryResults.forEach((val, key) => addrCache.set(key, val));
                            }

                            // v5.160: Enhanced fallback - try simplified addresses for remaining failures
                            const stillFailed = Array.from(uniqueAddresses).filter(addr => {
                              const key = addr.trim().toLowerCase();
                              return !addrCache.has(key);
                            });
                            
                            if (stillFailed.length > 0) {
                              useCalculationProgress.getState().setMessage(`Уточнение ${stillFailed.length} адресов...`);
                              
                              const enhancedFallbacks = stillFailed.flatMap(addr => {
                                const fallbacks: { address: string; original: string; strategy: string }[] = [];
                                
                                // Strategy 1: Remove house number
                                const noHouse = addr.replace(/\b\d+[а-яА-Яa-zA-ZіІєЄґґ]*(?:[\/\-]\d*)?\b/g, '').trim();
                                if (noHouse && noHouse !== addr) {
                                  fallbacks.push({ address: noHouse, original: addr, strategy: 'no-house' });
                                }
                                
                                // Strategy 2: Remove apartment/entrance/floor details
                                const simplified = addr
                                  .replace(/(?:под\.?|подъезд|п)\s*\d+/gi, '')
                                  .replace(/(?:кв\.?|квартира)\s*\d+/gi, '')
                                  .replace(/(?:эт\.?|этаж)\s*\d+/gi, '')
                                  .replace(/(?:оф\.?|офис)\s*\w+/gi, '')
                                  .replace(/д\/ф\s*\w*/gi, '')
                                  .replace(/\s+/g, ' ')
                                  .trim();
                                if (simplified && simplified !== addr) {
                                  fallbacks.push({ address: simplified, original: addr, strategy: 'simplified' });
                                }
                                
                                // Strategy 3: Extract just street name
                                const streetMatch = addr.match(/((?:вул\.?|просп\.?|пр-т|пров\.?|пер\.?|бульвар)\s*[\w\s'-]+)/i);
                                if (streetMatch) {
                                  const cityMatch = addr.match(/(Київ|Киев|Дніпро|Одеса|Харків|Львів)/i);
                                  const minimal = cityMatch ? `${cityMatch[1]}, ${streetMatch[1]}` : streetMatch[1];
                                  fallbacks.push({ address: minimal, original: addr, strategy: 'street-only' });
                                }
                                
                                return fallbacks;
                              });
                              
                              if (enhancedFallbacks.length > 0) {
                                const fallbackResults = await batchGeocode(
                                  enhancedFallbacks.map(fb => ({
                                    address: fb.address,
                                    options: { turbo: true, silent: true, strictZoneFallback: false, maxResults: 1 }
                                  }))
                                );
                                
                                // Map results back to original addresses
                                enhancedFallbacks.forEach((fb) => {
                                  const result = fallbackResults.get(fb.address.toLowerCase());
                                  if (result?.best) {
                                    const originalKey = fb.original.trim().toLowerCase();
                                    if (!addrCache.has(originalKey)) {
                                      addrCache.set(originalKey, result);
                                    }
                                  }
                                });
                              }
                            }

                            useCalculationProgress.getState().setProgress(30);

                            // v5.170: Parallel route calculation with concurrency limit (max 3 at a time)
                            // This is MUCH faster than sequential while not overwhelming the browser
                            let completedRoutes = 0;
                            const calculatedRoutes: (Route | null)[] = new Array(newRoutes.length).fill(null);
                            const CONCURRENCY = 3; // Max parallel route calculations

                            const calculateRouteWithProgress = async (route: any, index: number) => {
                              try {
                                const windowLabel = route.orders.length > 0 ?
                                  `(${(route.orders[0] as any).deliverBy || route.orders[0].plannedTime || ''})` : '';
                                useCalculationProgress.getState().setMessage(
                                  `Маршрут ${index + 1}/${newRoutes.length} ${windowLabel}`
                                );

                                const result = await calculateRouteDistance(route, true, addrCache);
                                calculatedRoutes[index] = result;

                                if (result) {
                                } else {
                                  console.warn(`[Quantum] ⚠️ Route ${index + 1} failed`);
                                }
                              } catch (e) {
                                console.error(`[Quantum] Ошибка маршрута ${index + 1}:`, e);
                                calculatedRoutes[index] = null;
                              } finally {
                                completedRoutes++;
                                const progressPct = Math.round(30 + ((completedRoutes / newRoutes.length) * 65));
                                if (progressPct === 95 || (Date.now() - (window as any)._lastProgressUpdate > 100)) {
                                  useCalculationProgress.getState().setProgress(progressPct);
                                  (window as any)._lastProgressUpdate = Date.now();
                                }
                              }
                            };

                            // Process routes in batches of CONCURRENCY
                            for (let i = 0; i < newRoutes.length; i += CONCURRENCY) {
                              const batch = newRoutes.slice(i, i + CONCURRENCY);
                              const batchIndices = Array.from({ length: batch.length }, (_, j) => i + j);
                              await Promise.all(batch.map((route, j) => calculateRouteWithProgress(route, batchIndices[j])));
                              // Yield to browser between batches
                              await new Promise(r => setTimeout(r, 5));
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

                              // v5.152: Atomically replace all routes for the selected courier
                              // This prevents duplicates across all tabs and ensures 100% parity with robot behavior.
                              const courierToClear = String(selectedCourier || '').toUpperCase();
                              const existingRoutes = (prev?.routes || []).filter(
                                (r: Route) => normalizeCourierName(r.courier).toUpperCase() !== courierToClear && 
                                              !newRoutes.some(nr => nr.id === r.id)
                              );
                              const finalRoutes = [
                                ...existingRoutes,
                                // Use calculated route if available, else use base uncalculated route
                                ...newRoutes.map(r => updatedRouteMap.get(r.id) || r)
                              ];


                              return {
                                ...(prev || { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: undefined }),
                                routes: finalRoutes,
                                orders: updatedOrders
                              };
                            }, true /* force: true to ensure new routes are NOT dropped by protectData */);

                            const successCount = calculatedRoutes.filter(Boolean).length;
                            const failCount = calculatedRoutes.length - successCount;
                            if (successCount > 0) {
                              if (failCount > 0) {
                                toast.success(`Расчитано ${successCount} маршрутов (${failCount} не удалось)`);
                              } else {
                                toast.success(`Расчитано ${successCount} маршрутов`);
                              }
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


                          <div id="available-orders-list-container" className="h-[600px] w-full">
                            <AvailableOrdersList
                              orders={deferredAvailableOrders}
                              isDark={isDark}
                              selectedOrders={selectedOrders}
                              onSelectOrder={handleOrderSelect}
                              selectedCourier={selectedCourier}
                              ordersInRoutesSet={ordersInRoutesSet}
                            />
                          </div>


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
                        onClick={clearEmptyRoutes}
                        className={clsx(
                          'px-6 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-all border-2',
                          isDark
                            ? 'border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10'
                            : 'border-yellow-100 text-yellow-600 hover:bg-yellow-50 hover:border-yellow-200 shadow-sm'
                        )}
                      >
                        Удалить пустые
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
                  {paginatedRoutes.map((route, index) => (
                    <RouteCard
                      key={`${route.id}-${index}`}
                      route={route}
                      isDark={isDark}
                      courierVehicle={getCourierVehicleType(route.courier)}
                      anomalyCheck={routeAnomalies.get(route.id)}
                      formatDistance={formatDistance}
                      formatDuration={formatDuration}
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
              onSave={(newAddress, coords) => handleAddressUpdate(newAddress, coords)}
              currentAddress={editingOrder.address}
              orderNumber={editingOrder.orderNumber}
              customerName={editingOrder.customerName}
              cityContext={localSettings.cityBias}
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
// --- Helper Components for Virtualization ---

const AvailableOrdersList = React.memo(({ orders, isDark, selectedOrders, onSelectOrder, selectedCourier, ordersInRoutesSet }: {
  orders: Order[],
  isDark: boolean,
  selectedOrders: Set<string>,
  onSelectOrder: (id: string) => void,
  selectedCourier: string | null,
  ordersInRoutesSet: Set<string>
}) => {
  const listRef = useRef<any>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const container = document.getElementById('available-orders-list-container');
    if (!container) return;

    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  const columnCount = useMemo(() => {
    if (containerWidth < 640) return 1;
    if (containerWidth < 1024) return 2;
    return 3;
  }, [containerWidth]);

  const rowCount = Math.ceil(orders.length / columnCount);

  const Row = ({ index, style }: { index: number, style: React.CSSProperties }) => {
    const rowOrders = orders.slice(index * columnCount, (index + 1) * columnCount);

    return (
      <div
        style={{
          ...style,
          display: 'grid',
          gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
          paddingBottom: '16px',
          height: 'auto'
        }}
        className="grid gap-4"
      >
        {rowOrders.map(order => (
          <div key={order.id} className="h-full">
            <GridOrderCard
              order={order}
              isDark={isDark}
              isSelected={selectedOrders.has(order.id)}
              onSelect={onSelectOrder}
              isUnassigned={!isId0CourierName(selectedCourier) && (isId0CourierName(order.courier) || order.courier === 'Не назначено')}
              isRouted={ordersInRoutesSet.has(getStableOrderId(order))}
            />
          </div>
        ))}
      </div>
    );
  };

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <TruckIcon className="w-16 h-16 mb-4 opacity-20" />
        <p className="text-sm font-medium">Нет доступных заказов для выбора</p>
      </div>
    );
  }

  if (containerWidth === 0) return <div className="animate-pulse bg-gray-100 dark:bg-gray-800 rounded-xl h-full w-full" />;

  return (
    <List
      height={500}
      itemCount={rowCount}
      itemSize={240}
      width={containerWidth}
      ref={listRef}
      className="custom-scrollbar"
    >
      {Row}
    </List>
  );
});
