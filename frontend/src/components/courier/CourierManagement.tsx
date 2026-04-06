import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense, useDeferredValue } from 'react'
import { localStorageUtils } from '../../utils/ui/localStorage'
import {
  UserIcon,
  TruckIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  PlusIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline'
import { clsx } from 'clsx'
import { CourierCard } from './CourierCard'
import { useExcelData } from '../../contexts/ExcelDataContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useRouteGeocoding } from '../../hooks/useRouteGeocoding'
import { toast } from 'react-hot-toast'
import { normalizeCourierName, getCourierName } from '../../utils/data/courierName'
import { useAuth } from '../../contexts/AuthContext'
import { isOrderCancelled } from '../../utils/data/orderStatus'
import { getStableOrderId } from '../../utils/data/orderId'
import { CourierIdResolver } from '../../utils/data/courierIdMap'
import { useKmlData } from '../../hooks/useKmlData'
import { cleanAddress } from '../../utils/data/addressUtils'

// Ленивая загрузка тяжелых компонентов
const HelpModalCouriers = lazy(() => import('../modals/HelpModalCouriers').then(m => ({ default: m.HelpModalCouriers })))
const HelpTour = lazy(() => import('../features/HelpTour').then(m => ({ default: m.HelpTour })))
const AddressEditModal = lazy(() => import('../modals/AddressEditModal').then(m => ({ default: m.AddressEditModal })))
const MileageModal = lazy(() => import('../modals/MileageModal').then(m => ({ default: m.MileageModal })))

interface Courier {
  id: string
  name: string
  phone: string
  email: string
  vehicleType: 'car' | 'motorcycle'
  location: string
  isActive: boolean
  orders: number
  ordersInRoutes?: number
  totalDistance: number
  totalAmount?: number
  hasErrors?: boolean
  // NEW: Cancellation & reassignment counters
  cancelledCount?: number
  reassignedOutCount?: number
  reassignedInCount?: number
}

interface CourierManagementProps {
  excelData?: any
}

export const CourierManagement: React.FC<CourierManagementProps> = ({ excelData: propExcelData }) => {
  const { excelData: contextExcelData, updateExcelData, updateRouteData } = useExcelData()
  const excelData = propExcelData || contextExcelData
  const contextData = excelData // Alias for compatibility with existing logic
  const { user } = useAuth()

  const { isDark } = useTheme()

  const [couriers, setCouriers] = useState<Courier[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingCourier, setEditingCourier] = useState<Courier | null>(null)
  const [filter, setFilter] = useState<'all' | 'car' | 'motorcycle'>('all')
  const [searchTerm, setSearchTerm] = useState('')

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [routeToDelete, setRouteToDelete] = useState<any | null>(null)
  const [showDistanceModal, setShowDistanceModal] = useState(false)
  const [selectedCourierForDistance, setSelectedCourierForDistance] = useState<Courier | null>(null)
  const [addressEditOrder, setAddressEditOrder] = useState<any | null>(null)
  const [addressEditRouteId, setAddressEditRouteId] = useState<string | null>(null)

  // Pagination state: limit to 7 couriers as requested (v35.20)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 7

  // Defer search to avoid blocking keystrokes on slow hardware
  const deferredSearchTerm = useDeferredValue(searchTerm)

  const {
    settings,
    selectedHubs,
    selectedZones,
    cachedHubPolygons,
    cachedAllKmlPolygons
  } = useKmlData()

  const [confirmAddresses] = useState<boolean>(() => {
    const saved = localStorage.getItem('confirmAddresses');
    return saved !== null ? JSON.parse(saved) : false;
  });

  const getSelectedCity = useCallback((): { city: '' | 'Киев' | 'Харьков' | 'Полтава' | 'Одесса'; country: 'Украина'; region: 'UA' } => {
    const city = (settings.cityBias || '') as '' | 'Киев' | 'Харьков' | 'Полтава' | 'Одесса'
    return { city, country: 'Украина', region: 'UA' }
  }, [settings.cityBias])

  const cleanAddressForRoute = useCallback((raw: string): string => {
    if (!raw) return '';
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
    const cityOrRegion = city

    if (!lower.includes(city.toLowerCase()) && !lower.includes('область') && !lower.includes('украина')) {
      return `${base}, ${cityOrRegion}, ${country}`
    }
    return base
  }, [getSelectedCity])

  const { calculateRouteDistance } = useRouteGeocoding({
    settings,
    confirmAddresses,
    selectedHubs,
    selectedZones,
    cachedHubPolygons,
    cachedAllKmlPolygons,
    updateExcelData,
    setShowCorrectionModal: () => { },
    setShowBatchPanel: () => { },
    startAddress: settings.defaultStartAddress || '',
    endAddress: settings.defaultEndAddress || '',
    cleanAddressForRoute
  })

  const handleAddressSave = async (newAddress: string, coords?: { lat: number; lng: number }) => {
    if (!addressEditOrder || !addressEditRouteId) return

    let nextRouteWithNewCoords: any = null;

    // 1. Update order in master list
    updateExcelData((prev: any) => {
      const nextRoutes = (prev?.routes || []).map((r: any) => {
        if (r.id === addressEditRouteId) {
          const updatedOrders = r.orders.map((o: any) =>
            o.id === addressEditOrder.id
              ? {
                  ...o,
                  address: newAddress,
                  lat: coords?.lat ?? o.lat,
                  lng: coords?.lng ?? o.lng,
                  coords: coords ?? o.coords,
                  locationType: coords ? 'ROOFTOP' : o.locationType,
                  isAddressLocked: !!coords
                }
              : o
          )
          const newRoute = { ...r, orders: updatedOrders, isOptimized: false };
          nextRouteWithNewCoords = newRoute;
          return newRoute;
        }
        return r;
      });

      return {
        ...prev,
        orders: (prev?.orders || []).map((o: any) =>
          o.id === addressEditOrder.id
            ? {
                ...o,
                address: newAddress,
                lat: coords?.lat ?? o.lat,
                lng: coords?.lng ?? o.lng,
                coords: coords ?? o.coords,
                locationType: coords ? 'ROOFTOP' : o.locationType,
                isAddressLocked: !!coords // v35.9.28: Avoid background re-geocoding
              }
            : o
        ),
        // 2. Update order within the route
        routes: nextRoutes
      };
    });

    // 3. Trigger recalculation
    setTimeout(() => {
      if (nextRouteWithNewCoords) {
        calculateRouteDistance(nextRouteWithNewCoords);
      }
    }, 50);

    setAddressEditOrder(null)
    setAddressEditRouteId(null)
  }

  const [showHelpModal, setShowHelpModal] = useState(false)
  const [showHelpTour, setShowHelpTour] = useState(false)

  // Оптимизированный расчет статистики всех курьеров (O(N + M))
  // --- Helpers ---

  const courierStatsMap = useMemo(() => {
    const courierIdToNameMap = new Map<string, string>();
    (excelData?.couriers || []).forEach((c: any) => {
      const cId = String(c._id || c.id || '');
      const cName = normalizeCourierName(String(c.name || ''));
      if (cId && cName) courierIdToNameMap.set(cId, cName);
    });

    const stats = new Map<string, {
      ordersInRoutes: number,
      totalOrders: number,
      baseDistance: number,
      additionalDistance: number,
      totalDistance: number,
      uniqueOrderIds: Set<string>,
      allAssignedOrderIds: Set<string>,
      // NEW: tracking counters
      cancelledCount: number,
      reassignedOutCount: number,
      reassignedInCount: number,
      cancelledOrderIds: Set<string>,
      reassignedOutIds: Set<string>,
    }>()

    const ensureEntry = (name: string) => {
      if (!stats.has(name)) {
        stats.set(name, {
          ordersInRoutes: 0, totalOrders: 0,
          baseDistance: 0, additionalDistance: 0, totalDistance: 0,
          uniqueOrderIds: new Set<string>(),
          allAssignedOrderIds: new Set<string>(),
          cancelledCount: 0, reassignedOutCount: 0, reassignedInCount: 0,
          cancelledOrderIds: new Set<string>(),
          reassignedOutIds: new Set<string>(),
        })
      }
      return stats.get(name)!
    }

    // ──────────────────────────────────────────────────────────────────────
    // PASS 1: All orders from FastOperator data
    // ──────────────────────────────────────────────────────────────────────
    if (excelData?.orders && Array.isArray(excelData.orders)) {
      excelData.orders.forEach((o: any) => {
        const originalCourier = normalizeCourierName(getCourierName(o.courier))
        if (!originalCourier || originalCourier === 'Не назначено' || originalCourier === 'ID:0') return

        const current = ensureEntry(originalCourier)
        const oid = getStableOrderId(o)

        // Track cancelled separately — they never count toward totals
        if (isOrderCancelled(o.status)) {
          if (!current.cancelledOrderIds.has(oid)) {
            current.cancelledOrderIds.add(oid)
            current.cancelledCount++
          }
          return // SKIP: cancelled order doesn't affect order count or km
        }

        // Track reassigned-out: order originally on this courier but now on another
        const currentCourier = normalizeCourierName(getCourierName(o.reassignedToCourier || ''))
        if (currentCourier && currentCourier !== originalCourier) {
          // This order was transferred AWAY from originalCourier
          if (!current.reassignedOutIds.has(oid)) {
            current.reassignedOutIds.add(oid)
            current.reassignedOutCount++
          }
          // Credit to the NEW courier
          const newEntry = ensureEntry(currentCourier)
          if (!newEntry.allAssignedOrderIds.has(oid)) {
            newEntry.allAssignedOrderIds.add(oid)
            newEntry.totalOrders++
            newEntry.reassignedInCount++
          }
          return // SKIP from original courier's totals
        }

        if (!current.allAssignedOrderIds.has(oid)) {
          current.allAssignedOrderIds.add(oid)
          current.totalOrders++
        }
      })
    }

    // ──────────────────────────────────────────────────────────────────────
    // PASS 2: Routes — calculate actual km (excluding cancelled stops)
    // Count orders from BOTH calculated (DB) and manual routes, avoiding duplicates
    // ──────────────────────────────────────────────────────────────────────
    
    // First: collect all order IDs from CALCULATED routes (DB/Turbo Robot)
    const calculatedRouteOrderIds = new Set<string>();
    if (contextData?.routes && Array.isArray(contextData.routes)) {
      contextData.routes.forEach((route: any) => {
        if (!route.isOptimized) return; // Only from calculated routes
        (route.orders || []).forEach((o: any) => {
          const oid = getStableOrderId(o);
          if (oid) calculatedRouteOrderIds.add(oid);
        });
      });
    }
    
    // Second: process all routes, counting unique orders
    if (contextData?.routes && Array.isArray(contextData.routes)) {
      contextData.routes.forEach((route: any) => {
        // v5.132: Resolve courier name from ID if needed
        // v5.180: Check both route.courier and route.courier_id
        const rawCourier = getCourierName(route.courier || route.courier_id);
        let routeCourier = courierIdToNameMap.get(rawCourier) || CourierIdResolver.resolve(rawCourier) || normalizeCourierName(rawCourier);
        
        if (!routeCourier || routeCourier === 'Не назначено' || routeCourier === 'НЕ НАЗНАЧЕНО') return;

        const current = ensureEntry(routeCourier)
        const routeOrders = route.orders || []
        let uniqueActiveStops = 0
        let lastActiveAddr = ""

        // v5.149: Also track orderNumbers for deduplication
        const seenOrderNumbers = new Set<string>();
        
        routeOrders.forEach((o: any) => {
          const oid = getStableOrderId(o)
          const orderNum = String(o.orderNumber || '');
          
          // v5.149: CRITICAL - Skip if we've seen this orderNumber before
          // Same order may have different IDs from different sources
          if (orderNum && seenOrderNumbers.has(orderNum)) {
            return; // Skip duplicate orderNumber
          }
          if (orderNum) seenOrderNumbers.add(orderNum);

          // SKIP: cancelled orders don't count as route stops
          if (isOrderCancelled(o.status)) {
            if (!current.cancelledOrderIds.has(oid)) {
              current.cancelledOrderIds.add(oid)
              current.cancelledCount++
            }
            return
          }

          // SKIP: order was reassigned to a different courier
          const reassignedTo = normalizeCourierName(getCourierName(o.reassignedToCourier || ''))
          if (reassignedTo && reassignedTo !== routeCourier) {
            if (!current.reassignedOutIds.has(oid)) {
              current.reassignedOutIds.add(oid)
              current.reassignedOutCount++
            }
            // Add to new courier
            const newEntry = ensureEntry(reassignedTo)
            if (!newEntry.allAssignedOrderIds.has(oid)) {
              newEntry.allAssignedOrderIds.add(oid)
              newEntry.totalOrders++
              newEntry.reassignedInCount++
            }
            return
          }

          // Skip orders that are already in calculated (DB) routes
          // This prevents double counting when user manually routes an order
          if (!route.isOptimized && calculatedRouteOrderIds.has(oid)) {
            return; // Skip - this order is already counted from DB route
          }

          if (!current.uniqueOrderIds.has(oid)) {
            current.uniqueOrderIds.add(oid)
            current.ordersInRoutes++

            const currentAddr = (o.address || "").trim().toLowerCase();
            if (currentAddr !== lastActiveAddr) {
              uniqueActiveStops++
              lastActiveAddr = currentAddr
            }
          }

          if (!current.allAssignedOrderIds.has(oid)) {
            current.allAssignedOrderIds.add(oid)
            current.totalOrders++
          }
        })

        // Km: only for ACTIVE (non-cancelled, non-reassigned-out) stops
        if (route.isOptimized && route.totalDistance) {
          // Scale actual route km by fraction of active stops
          const totalStops = routeOrders.length || 1
          const activeRatio = totalStops > 0 ? Math.max(0, uniqueActiveStops / totalStops) : 1
          const adjustedDist = route.totalDistance * activeRatio + (uniqueActiveStops * 0.5)
          current.totalDistance += adjustedDist
          current.baseDistance += route.totalDistance * activeRatio
          current.additionalDistance += uniqueActiveStops * 0.5
        } else {
          const baseDist = 1.0
          const addDist = uniqueActiveStops * 0.5
          current.totalDistance += baseDist + addDist
          current.baseDistance += baseDist
          current.additionalDistance += addDist
        }

        stats.set(routeCourier, current)
      })
    }

    // ──────────────────────────────────────────────────────────────────────
    // PASS 3: Estimate km for unrouted (but assigned, non-cancelled) orders
    // ──────────────────────────────────────────────────────────────────────
    stats.forEach((current, name) => {
      const unroutedOrderIds = Array.from(current.allAssignedOrderIds)
        .filter(id => !current.uniqueOrderIds.has(id) && !current.cancelledOrderIds.has(id) && !current.reassignedOutIds.has(id))

      if (unroutedOrderIds.length > 0) {
        const estimate = 1.0 + (unroutedOrderIds.length * 0.5)
        current.totalDistance += estimate
        current.additionalDistance += estimate
      }

      // Historical fulfilled distance
      if (excelData?.fulfilledDistance && excelData.fulfilledDistance[name]) {
        current.totalDistance += (excelData.fulfilledDistance[name] || 0)
        current.baseDistance += (excelData.fulfilledDistance[name] || 0)
      }
    })

    // ──────────────────────────────────────────────────────────────────────
    // PASS 4: Override with Turbo Robot enriched distanceKm (highest priority)
    // The robot writes distanceKm directly to excelData.couriers via dashboard:update.
    // This beats any estimate or route-computed value.
    // ──────────────────────────────────────────────────────────────────────
    if (excelData?.couriers && Array.isArray(excelData.couriers)) {
      excelData.couriers.forEach((c: any) => {
        const robotKm = c.distanceKm;
        if (!robotKm || robotKm <= 0) return;
        const nm = normalizeCourierName(c.name || c.courierName || '');
        if (!nm) return;
        const entry = stats.get(nm);
        if (entry) {
          // Robot distance overrides estimated / route-summed distance
          const delta = robotKm - entry.baseDistance;
          entry.totalDistance = robotKm;
          entry.baseDistance = robotKm;
          entry.additionalDistance = Math.max(0, delta);
          
          // v5.153: Also prioritize robot-calculated order counts if available
          if (c.calculatedOrders > 0) {
            entry.ordersInRoutes = c.calculatedOrders;
            // Ensure uniqueOrderIds count matches if possible, or at least respect the total
            if (entry.totalOrders < c.calculatedOrders) {
               entry.totalOrders = c.calculatedOrders;
            }
          }
        } else if (!entry) {
          // Courier only exists in cache (no local orders) — create entry
          stats.set(nm, {
            ordersInRoutes: c.calculatedOrders || 0,
            totalOrders: c.calculatedOrders || 0,
            baseDistance: robotKm,
            additionalDistance: 0,
            totalDistance: robotKm,
            uniqueOrderIds: new Set(),
            allAssignedOrderIds: new Set(),
            cancelledCount: 0, reassignedOutCount: 0, reassignedInCount: 0,
            cancelledOrderIds: new Set(),
            reassignedOutIds: new Set(),
          });
        }
      });
    }

    return stats
  }, [excelData?.orders, excelData?.fulfilledDistance, excelData?.couriers, contextData?.routes])


  const getCourierStats = (courierName: string) => {
    const normalized = normalizeCourierName(courierName)
    if (!normalized) return { ordersInRoutes: 0, totalOrders: 0, baseDistance: 0, additionalDistance: 0, totalDistance: 0, cancelledCount: 0, reassignedOutCount: 0, reassignedInCount: 0 }
    return courierStatsMap.get(normalized) || {
      ordersInRoutes: 0,
      totalOrders: 0,
      baseDistance: 0,
      additionalDistance: 0,
      totalDistance: 0,
      cancelledCount: 0,
      reassignedOutCount: 0,
      reassignedInCount: 0
    }
  }

  // Создаем список курьеров из всех доступных данных
  useEffect(() => {
    const courierNames = new Set<string>()

    if (excelData?.couriers && Array.isArray(excelData.couriers)) {
      excelData.couriers.forEach((c: any) => {
        const name = normalizeCourierName(c.name)
        if (name) courierNames.add(name)
      })
    }

    if (excelData?.orders && Array.isArray(excelData.orders)) {
      excelData.orders.forEach((o: any) => {
        const name = normalizeCourierName(getCourierName(o.courier))
        if (name) courierNames.add(name)
      })
    }

    const vehicleMap = localStorageUtils.getCourierVehicleMap()
    const list = Array.from(courierNames)
      .filter(name => name && name !== 'Не назначено' && name.toLowerCase() !== 'по')
      .map((name, index) => {
        const excelInfo = (excelData?.couriers || []).find((c: any) => normalizeCourierName(c.name) === name)
        const stats = getCourierStats(name)

        return {
          id: excelInfo?.id || `derived_${index}`,
          name,
          phone: excelInfo?.phone || '',
          email: excelInfo?.email || '',
          vehicleType: (vehicleMap[name] || excelInfo?.vehicleType || 'car') as 'car' | 'motorcycle',
          location: excelInfo?.location || 'Київ',
          isActive: excelInfo?.isActive !== false,
          orders: stats.totalOrders,
          ordersInRoutes: stats.ordersInRoutes,
          totalDistance: stats.totalDistance,
          totalAmount: excelInfo?.totalAmount || 0,
          cancelledCount: stats.cancelledCount || 0,
          reassignedOutCount: stats.reassignedOutCount || 0,
          reassignedInCount: stats.reassignedInCount || 0,
          hasErrors: (excelData?.routes || []).some(
            (r: any) => normalizeCourierName(r.courier) === name &&
                       (r.hasGeoErrors || (r.orders?.length > 0 && !r.isOptimized))
          )
        }
      })

    setCouriers(list)
  }, [excelData, courierStatsMap])

  // Синхронизация статусов и типов транспорта
  const toggleCourierStatus = useCallback((id: string) => {
    setCouriers(prev => prev.map(c =>
      c.id === id ? { ...c, isActive: !c.isActive } : c
    ))
  }, [])

  const toggleCourierVehicleType = useCallback((id: string) => {
    setCouriers(prev => {
      let updatedCourierName = ''
      let newType: 'car' | 'motorcycle' = 'car'

      const newList = prev.map(c => {
        if (c.id === id) {
          updatedCourierName = c.name
          newType = c.vehicleType === 'car' ? 'motorcycle' : 'car'
          return { ...c, vehicleType: newType }
        }
        return c
      })

      if (updatedCourierName) {
        const map = localStorageUtils.getCourierVehicleMap()
        map[updatedCourierName] = newType
        localStorageUtils.setCourierVehicleMap(map)

        updateExcelData((prevData: any) => {
          if (!prevData) return prevData
          const updatedCouriers = (prevData.couriers || []).map((c: any) =>
            normalizeCourierName(c.name) === updatedCourierName ? { ...c, vehicleType: newType } : c
          )
          return { ...prevData, couriers: updatedCouriers }
        })
      }
      return newList
    })
  }, [updateExcelData])

  const handleDeleteCourier = useCallback((id: string) => {
    if (window.confirm('Ви впевнені, що хочете видалити цього кур\'єра?')) {
      setCouriers(prev => prev.filter(c => c.id !== id))
    }
  }, [])

  const filteredCouriers = useMemo(() => {
    const searchLower = deferredSearchTerm.toLowerCase();
    return couriers
      .filter(c => filter === 'all' || c.vehicleType === filter)
      .filter(c => !searchLower || c.name.toLowerCase().includes(searchLower) ||
        c.phone.toLowerCase().includes(searchLower) ||
        c.email.toLowerCase().includes(searchLower)
      )
  }, [couriers, filter, deferredSearchTerm])
  // ─── Wire "ЗАПУСТИТЬ РАСЧЕТ" button from CourierCard ──────────────────────
  // v5.153: Properly triggers the background Turbo Robot via REST API.
  // The old logic was broken: it checked local routes and falsely showed 
  // "✅ Все маршруты рассчитаны" even when the robot hadn't run at all.
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail;

      const token = localStorage.getItem('km_access_token');
      if (!token) {
        toast.error('❌ Не авторизован. Войдите в систему.');
        return;
      }

      // Get divisionId: prefer user profile, fallback to excelData metadata
      const divisionId = user?.divisionId ||
        (excelData as any)?.divisionId ||
        (excelData as any)?.orders?.[0]?.departmentId ||
        null;

      // Get target date from store or today
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
          toast.error(`❌ Ошибка запуска: ${json.error || 'Неизвестная ошибка'}`);
        }
      } catch (err: any) {
        toast.dismiss(loadingToast);
        toast.error(`❌ Сетевая ошибка: ${err.message}`);
      }
    };

    window.addEventListener('km-force-auto-routing', handler);
    return () => window.removeEventListener('km-force-auto-routing', handler);
  }, [user, excelData]);

  const getCourierRoutes = (courierName: string) => {
    if (!contextData?.routes) return []
    const normTarget = normalizeCourierName(courierName)
    return contextData.routes.filter((r: any) => {
      // Robot routes use courier_id (UPPERCASE), manual routes use courier
      const routeCourier = r.courier || r.courier_id || ''
      return normalizeCourierName(getCourierName(routeCourier)) === normTarget
    })
  }


  const deleteRoute = (routeId: string) => {
    const route = contextData?.routes?.find((r: any) => r.id === routeId)
    if (route) {
      setRouteToDelete(route)
      setShowDeleteModal(true)
    }
  }

  const confirmDeleteRoute = () => {
    if (routeToDelete && contextData?.routes) {
      const updatedRoutes = contextData.routes.filter((route: any) => route.id !== routeToDelete.id)

      if (contextData) {
        const updatedData = { ...contextData, routes: updatedRoutes }

        try {
          localStorage.setItem('km_excel_data', JSON.stringify(updatedData))
          localStorage.setItem('km_routes', JSON.stringify(updatedRoutes))
        } catch (error) {
          console.error('Ошибка сохранения данных:', error)
        }

        updateRouteData(updatedRoutes)
      }

      setShowDeleteModal(false)
      setRouteToDelete(null)
      toast.success(`Маршрут кур'єра ${routeToDelete.courier} успішно видалено`)
    }
  }

  const cancelDeleteRoute = () => {
    setShowDeleteModal(false)
    setRouteToDelete(null)
  }

  const handleDistanceClick = (courier: Courier) => {
    setSelectedCourierForDistance(courier)
    setShowDistanceModal(true)
  }

  // Pagination logic
  useEffect(() => {
    setCurrentPage(1)
  }, [filter, deferredSearchTerm])

  const paginatedCouriers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filteredCouriers.slice(start, start + itemsPerPage)
  }, [filteredCouriers, currentPage, itemsPerPage])

  const totalPages = Math.ceil(filteredCouriers.length / itemsPerPage)

  return (
    <div className="space-y-6">
      {/* Header Compact v5.234 */}
      <div className={clsx(
        'rounded-3xl p-5 shadow-xl border overflow-hidden relative',
        isDark
          ? 'bg-[#151B2C]/90 border-white/5'
          : 'bg-white border-black/5'
      )}>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 via-fuchsia-600/5 to-pink-600/5 pointer-events-none" />
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={clsx(
                'w-12 h-12 rounded-xl flex items-center justify-center shadow-lg transition-transform hover:rotate-6',
                isDark ? 'bg-blue-600' : 'bg-blue-500'
              )}>
                <UserIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className={clsx(
                  'text-xl font-black uppercase tracking-tight',
                  isDark ? 'text-white' : 'text-gray-900'
                )}>
                  Керування кур'єрами
                </h1>
                <div className="flex items-center gap-3 mt-1 opacity-60">
                   <div className="flex items-center gap-1.5">
                     <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                     <span className="text-[10px] font-bold uppercase">{couriers.filter(c => c.isActive).length} Активних</span>
                   </div>
                   <div className="flex items-center gap-1.5">
                     <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                     <span className="text-[10px] font-bold uppercase">{couriers.length} Всього</span>
                   </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHelpModal(true)}
                className={clsx(
                  'p-2.5 rounded-xl transition-all hover:bg-white/10 border',
                  isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-400'
                )}
              >
                <QuestionMarkCircleIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-5 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest bg-blue-600 hover:bg-blue-700 text-white shadow-lg transition-all active:scale-95 flex items-center gap-2"
              >
                <PlusIcon className="w-4 h-4" />
                <span>Додати</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Search Compact v5.234 */}
      <div className={clsx(
        'rounded-2xl p-4 shadow-lg border transition-all',
        isDark ? 'bg-[#151B2C]/40 border-white/5' : 'bg-gray-50/50 border-gray-200'
      )}>
        <div className="flex flex-col lg:flex-row gap-4 items-center">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all', label: 'Усі', icon: UserIcon, count: couriers.length },
              { id: 'car', label: 'Авто', icon: TruckIcon, count: couriers.filter(c => c.vehicleType === 'car').length },
              { id: 'motorcycle', label: 'Мото', icon: TruckIcon, count: couriers.filter(c => c.vehicleType === 'motorcycle').length }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as any)}
                className={clsx(
                  'px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border',
                  filter === f.id
                    ? 'bg-blue-600 border-transparent text-white shadow-md'
                    : isDark ? 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                )}
              >
                <f.icon className="w-3 h-3" />
                <span>{f.label}</span>
                <span className="opacity-40">{f.count}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 relative group w-full">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-30" />
            <input
              type="text"
              placeholder="ПОШУК КУР'ЄРА..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={clsx(
                'w-full pl-10 pr-10 py-2.5 rounded-xl border outline-none text-[10px] font-black tracking-widest uppercase transition-all',
                isDark 
                  ? 'bg-black/20 border-white/5 focus:border-blue-500/50 text-white' 
                  : 'bg-white border-gray-200 focus:border-blue-400 text-gray-900'
              )}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full transition-all">
                <XMarkIcon className="w-3 h-3 opacity-40" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Couriers Grid v5.228 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6" data-tour="courier-list">
        {paginatedCouriers.length > 0 ? (
          paginatedCouriers.map((courier, index) => (
            <div
              key={`${courier.id}-${index}`}
              className="w-full max-w-[380px] mx-auto"
              style={{ contain: 'content', contentVisibility: 'auto', containIntrinsicSize: '0 280px' }}
            >
              <CourierCard
                courier={courier}
                isDark={isDark}
                onEdit={(c) => {
                  setEditingCourier(c)
                  setShowAddModal(true)
                }}
                onDelete={handleDeleteCourier}
                onToggleStatus={toggleCourierStatus}
                onToggleVehicle={toggleCourierVehicleType}
                onDistanceClick={handleDistanceClick}
                distanceDetails={getCourierStats(courier.name)}
              />
            </div>
          ))
        ) : (
          <div className={clsx(
            'col-span-full py-24 rounded-[3rem] border-2 border-dashed flex flex-col items-center justify-center text-center px-6 transition-all',
            isDark ? 'bg-gray-800/20 border-gray-800' : 'bg-gray-50/50 border-gray-100'
          )}>
            <div className={clsx(
              'w-24 h-24 rounded-full flex items-center justify-center mb-6 relative',
              isDark ? 'bg-gray-800 text-gray-600' : 'bg-white text-gray-300 shadow-sm'
            )}>
              <UserIcon className="w-12 h-12 relative z-10" />
              <div className="absolute inset-0 bg-blue-500/10 rounded-full animate-ping opacity-20"></div>
            </div>
            <h3 className={clsx(
              'text-2xl font-black mb-2 tracking-tight',
              isDark ? 'text-gray-300' : 'text-gray-900'
            )}>
              Кур'єрів не знайдено
            </h3>
            <p className={clsx(
              'max-w-xs mx-auto text-sm font-medium leading-relaxed',
              isDark ? 'text-gray-500' : 'text-gray-400'
            )}>
              {searchTerm
                ? `Ми не знайшли кур'єра за запитом "${searchTerm}". Спробуйте інше ім'я.`
                : 'Поки що немає кур\'єрів у цій категорії.'}
            </p>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="mt-8 px-6 py-2.5 rounded-xl bg-blue-500/10 text-blue-500 font-bold hover:bg-blue-500 hover:text-white transition-all scale-95 hover:scale-100"
              >
                Скинути пошук
              </button>
            )}
          </div>
        )}
      </div>

      {/* Smart Compact Pagination v5.234 */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 py-6">
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className={clsx(
              'px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
              currentPage === 1
                ? 'opacity-20 cursor-not-allowed'
                : isDark ? 'bg-white/5 text-white hover:bg-white/10' : 'bg-white border border-gray-200 text-gray-900 hover:bg-gray-50'
            )}
          >
            ← Попер.
          </button>
          
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-black/5 dark:bg-white/5 border border-white/5">
            {[...Array(totalPages)].map((_, i) => {
              const num = i + 1;
              const isVisible = num === 1 || num === totalPages || Math.abs(num - currentPage) <= 1;
              
              if (!isVisible) {
                if (num === 2 || num === totalPages - 1) return <span key={num} className="text-gray-500 px-1 font-black text-[10px]">...</span>;
                return null;
              }

              return (
                <button
                  key={num}
                  onClick={() => setCurrentPage(num)}
                  className={clsx(
                    'w-8 h-8 rounded-lg text-[10px] font-black transition-all flex items-center justify-center',
                    currentPage === num
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/40 scale-110'
                      : 'text-gray-500 hover:text-white hover:bg-white/10'
                  )}
                >
                  {num}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className={clsx(
              'px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
              currentPage === totalPages
                ? 'opacity-20 cursor-not-allowed'
                : isDark ? 'bg-white/5 text-white hover:bg-white/10' : 'bg-white border border-gray-200 text-gray-900 hover:bg-gray-50'
            )}
          >
            Наст. →
          </button>
        </div>
      )}

      {/* Модальное окно подтверждения удаления маршрута */}
      {showDeleteModal && routeToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center space-x-3 mb-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <TrashIcon className="w-6 h-6 text-red-600" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  Видалити маршрут
                </h3>
                <p className="text-sm text-gray-500">
                  Цю дію не можна скасувати
                </p>
              </div>
            </div>

            <div className="mb-6">
              <p className="text-sm text-gray-600">
                Ви впевнені, що хочете видалити маршрут кур'єра <strong>{routeToDelete.courier}</strong>?
              </p>
              {routeToDelete.orders && routeToDelete.orders.length > 0 && (
                <p className="text-sm text-gray-500 mt-2">
                  У маршруті {routeToDelete.orders.length} замовлень
                </p>
              )}
            </div>

            <div className="flex space-x-3">
              <button
                onClick={cancelDeleteRoute}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Скасувати
              </button>
              <button
                onClick={confirmDeleteRoute}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Видалити
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно с подробной информацией о пробеге - REDESIGNED v40 (Optimized v35.20) */}
      {showDistanceModal && selectedCourierForDistance && (
        <Suspense fallback={null}>
          <MileageModal
            courier={selectedCourierForDistance}
            isDark={isDark}
            onClose={() => setShowDistanceModal(false)}
            getCourierStats={getCourierStats}
            getCourierRoutes={getCourierRoutes}
            onEditAddress={(order, routeId) => {
              setAddressEditOrder(order)
              setAddressEditRouteId(routeId)
            }}
            onDeleteRoute={deleteRoute}
          />
        </Suspense>
      )}

      {/* Add/Edit Modal */}
      {(showAddModal || editingCourier) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                {editingCourier ? 'Редагувати кур\'єра' : 'Додати кур\'єра'}
              </h3>
            </div>

            <div className="px-6 py-4">
              <p className="text-gray-500 text-center py-8">
                Модальне вікно для додавання/редагування кур'єра буде додано пізніше
              </p>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setEditingCourier(null)
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                Закрити
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelpModal && (
        <Suspense fallback={null}>
          <HelpModalCouriers
            isOpen={showHelpModal}
            onClose={() => setShowHelpModal(false)}
            onStartTour={() => {
              setShowHelpModal(false)
              setShowHelpTour(true)
            }}
          />
        </Suspense>
      )}

      {/* Address Edit Modal */}
      {addressEditOrder && (
        <Suspense fallback={null}>
          <AddressEditModal
            isOpen={!!addressEditOrder}
            onClose={() => {
              setAddressEditOrder(null)
              setAddressEditRouteId(null)
            }}
            onSave={handleAddressSave}
            currentAddress={addressEditOrder.address}
            orderNumber={addressEditOrder.orderNumber}
            customerName={addressEditOrder.customerName}
            cityContext={settings.cityBias}
            isDark={isDark}
          />
        </Suspense>
      )}

      {/* Help Tour */}
      {showHelpTour && (
        <Suspense fallback={null}>
          <HelpTour
            steps={[]} // Will be populated from a config
            isOpen={showHelpTour}
            onClose={() => setShowHelpTour(false)}
          />
        </Suspense>
      )}
    </div>
  )
}