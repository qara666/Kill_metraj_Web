import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense, useDeferredValue } from 'react'
import { localStorageUtils } from '../../utils/ui/localStorage'
import {
  UserIcon,
  TruckIcon,
  MapPinIcon,
  QuestionMarkCircleIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  PlayIcon,
  ExclamationTriangleIcon,
  BoltIcon,
  PencilIcon
} from '@heroicons/react/24/outline'
import {
  CheckBadgeIcon,
  HomeIcon,
  MapIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/solid'
import { clsx } from 'clsx'
import { CourierCard } from './CourierCard'
import { useExcelData } from '../../contexts/ExcelDataContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useRouteGeocoding } from '../../hooks/useRouteGeocoding'
import { Route } from '../../types/route'

import { toast } from 'react-hot-toast'
import { Tooltip } from '../shared/Tooltip'

import { normalizeCourierName } from '../../utils/data/courierName'
import { exportToGoogleMaps, exportToValhalla } from '../../utils/routes/routeExport'
import { useKmlData } from '../../hooks/useKmlData'
import { cleanAddress, needsAddressClarification } from '../../utils/data/addressUtils'

// Ленивая загрузка тяжелых компонентов
const HelpModalCouriers = lazy(() => import('../modals/HelpModalCouriers').then(m => ({ default: m.HelpModalCouriers })))
const HelpTour = lazy(() => import('../features/HelpTour').then(m => ({ default: m.HelpTour })))
const AddressEditModal = lazy(() => import('../modals/AddressEditModal').then(m => ({ default: m.AddressEditModal })))

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
}

interface CourierManagementProps {
  excelData?: any
}

export const CourierManagement: React.FC<CourierManagementProps> = ({ excelData: propExcelData }) => {
  const { excelData: contextExcelData, updateExcelData, updateRouteData } = useExcelData()
  const excelData = propExcelData || contextExcelData
  const contextData = excelData // Alias for compatibility with existing logic

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

    // 1. Update order in master list
    updateExcelData((prev: any) => ({
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
      routes: (prev?.routes || []).map((r: any) => {
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
          return { ...r, orders: updatedOrders, isOptimized: false } // Mark as needing recalculation
        }
        return r
      })
    }))

    // 3. Trigger recalculation
    const targetRoute = contextData?.routes?.find((r: any) => r.id === addressEditRouteId)
    if (targetRoute) {
      // Create a temporary route object with the new address for immediate calculation
      const tempRoute = {
        ...targetRoute,
        orders: targetRoute.orders.map((o: any) => 
          o.id === addressEditOrder.id 
            ? { ...o, address: newAddress, lat: coords?.lat || o.lat, lng: coords?.lng || o.lng, coords: coords || o.coords }
            : o
        )
      }
      
      toast.promise(calculateRouteDistance(tempRoute), {
        loading: 'Перерахунок дистанції...',
        success: 'Дистанцію оновлено',
        error: 'Помилка перерахунку'
      })
    }

    setAddressEditOrder(null)
    setAddressEditRouteId(null)
  }


  const [hasSeenHelp, setHasSeenHelp] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('km_couriers_has_seen_help') === 'true'
    }
    return false
  })
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [showHelpTour, setShowHelpTour] = useState(false)

  // Оптимизированный расчет статистики всех курьеров (O(N + M))
  // --- Helpers ---
  
  const getCourierName = useCallback((c: any): string => {
    if (!c) return ''
    if (typeof c === 'string') return c
    if (typeof c === 'object') return (c.name || c._id || c.id || '')
    return String(c)
  }, [])

  const courierStatsMap = useMemo(() => {
    const stats = new Map<string, {
      ordersInRoutes: number,
      totalOrders: number,
      baseDistance: number,
      additionalDistance: number,
      totalDistance: number,
      uniqueOrderIds: Set<string>,
      allAssignedOrderIds: Set<string>
    }>()

    // 1. Сначала считаем ВСЕ заказы, назначенные курьеру (из общего списка заказов)
    if (excelData?.orders && Array.isArray(excelData.orders)) {
      excelData.orders.forEach((o: any) => {
        const courierName = normalizeCourierName(getCourierName(o.courier))
        if (!courierName || courierName === 'Не назначено' || courierName === 'ID:0') return

        if (!stats.has(courierName)) {
          stats.set(courierName, {
            ordersInRoutes: 0,
            totalOrders: 0,
            baseDistance: 0,
            additionalDistance: 0,
            totalDistance: 0,
            uniqueOrderIds: new Set<string>(),
            allAssignedOrderIds: new Set<string>()
          })
        }

        const current = stats.get(courierName)!
        const oid = String(o.id || o.orderNumber)
        if (!current.allAssignedOrderIds.has(oid)) {
          current.allAssignedOrderIds.add(oid)
          current.totalOrders++
        }
      })
    }

    // 2. Затем считаем только те, что в активных маршрутах + дистанцию
    if (contextData?.routes && Array.isArray(contextData.routes)) {
      contextData.routes.forEach((route: any) => {
        const courierName = normalizeCourierName(getCourierName(route.courier))
        if (!courierName) return

        if (!stats.has(courierName)) {
          stats.set(courierName, {
            ordersInRoutes: 0,
            totalOrders: 0,
            baseDistance: 0,
            additionalDistance: 0,
            totalDistance: 0,
            uniqueOrderIds: new Set<string>(),
            allAssignedOrderIds: new Set<string>()
          })
        }

        const current = stats.get(courierName)!
        const routeOrders = route.orders || []
        let uniqueStopsInRoute = 0
        let lastAddrInRoute = ""

        routeOrders.forEach((o: any) => {
          const oid = String(o.id || o.orderNumber || o._id || `gen_${Math.random()}`)
          
          if (!current.uniqueOrderIds.has(oid)) {
            current.uniqueOrderIds.add(oid)
            current.ordersInRoutes++
            
            // v35.13: Use unique address logic for distance estimation
            const currentAddr = (o.address || "").trim().toLowerCase();
            if (currentAddr !== lastAddrInRoute) {
              uniqueStopsInRoute++
              lastAddrInRoute = currentAddr
            }
          }

          // v35.9.28: If order is in a route, it MUST be counted in totalOrders even if the master list is empty
          if (!current.allAssignedOrderIds.has(oid)) {
            current.allAssignedOrderIds.add(oid)
            current.totalOrders++
          }

          // v36.0: If all routes are calculated, ensure the progress bar shows 100%
          // We count an order as 'processed' if it has been touched by the router OR if it's geocoded
          if (!!o.coords?.lat && !current.uniqueOrderIds.has(oid)) {
             current.uniqueOrderIds.add(oid)
             current.ordersInRoutes++
             
             // v35.13: Double check address uniqueness here too
             const currentAddr = (o.address || "").trim().toLowerCase();
             if (currentAddr !== lastAddrInRoute) {
               uniqueStopsInRoute++
               lastAddrInRoute = currentAddr
             }
          }
        })

        if (route.isOptimized && route.totalDistance) {
          current.totalDistance += route.totalDistance + (uniqueStopsInRoute * 0.5)
          current.baseDistance += route.totalDistance
          current.additionalDistance += (uniqueStopsInRoute * 0.5)
        } else {
          // Базовая оценка для неоптимизированных/ручных маршрутов (1км + 0.5км/заказ)
          const baseDist = 1.0
          const addDist = uniqueStopsInRoute * 0.5
          current.totalDistance += baseDist + addDist
          current.baseDistance += baseDist
          current.additionalDistance += addDist
        }

        stats.set(courierName, current)
      })
    }

    // 3. Добавляем оценку для еще не распределенных по маршрутам заказов
    stats.forEach((current, name) => {
      const ordersInRoutesIds = current.uniqueOrderIds
      const unroutedOrderIds = Array.from(current.allAssignedOrderIds).filter(id => !ordersInRoutesIds.has(id))
      
      if (unroutedOrderIds.length > 0) {
        // База 1км + по 0.5км за каждый еще не распределенный заказ
        const estimate = 1.0 + (unroutedOrderIds.length * 0.5)
        current.totalDistance += estimate
        current.additionalDistance += estimate
      }

      // 4. Добавляем УЖЕ выполненный километр (из истории)
      if (excelData?.fulfilledDistance && excelData.fulfilledDistance[name]) {
        current.totalDistance += (excelData.fulfilledDistance[name] || 0)
        current.baseDistance += (excelData.fulfilledDistance[name] || 0)
      }
    })

    return stats
  }, [excelData?.orders, excelData?.fulfilledDistance, contextData?.routes])

  const getCourierStats = (courierName: string) => {
    const normalized = normalizeCourierName(courierName)
    if (!normalized) return { ordersInRoutes: 0, totalOrders: 0, baseDistance: 0, additionalDistance: 0, totalDistance: 0 }
    return courierStatsMap.get(normalized) || {
      ordersInRoutes: 0,
      totalOrders: 0,
      baseDistance: 0,
      additionalDistance: 0,
      totalDistance: 0
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
          orders: stats.totalOrders, // Показываем ОБЩЕЕ кол-во заказов курьера за день
          ordersInRoutes: stats.ordersInRoutes, // Для справки (в маршрутах)
          totalDistance: stats.totalDistance,
          totalAmount: excelInfo?.totalAmount || 0,
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
  // Identical to RouteManagement.tsx listener to ensure button works in both views.
  useEffect(() => {
    const handler = async () => {
      const routes: Route[] = contextData?.routes || [];
      const incomplete = routes.filter(r =>
        !r.totalDistance ||
        r.totalDistance === 0 ||
        r.orders.some((o: any) => !o.coords?.lat)
      );

      if (incomplete.length === 0) {
        toast('✅ Все маршруты уже рассчитаны', { icon: '⚡' });
        return;
      }

      toast(`🔄 Запускаю расчёт ${incomplete.length} маршрут(ов)...`);
      for (const route of incomplete) {
        await calculateRouteDistance(route);
        await new Promise(r => setTimeout(r, 50)); // yield to UI
      }
      toast.success(`✅ Расчёт завершён`);
    };

    window.addEventListener('km-force-auto-routing', handler);
    return () => window.removeEventListener('km-force-auto-routing', handler);
  }, [contextData?.routes, calculateRouteDistance]);

  const getCourierRoutes = (courierName: string) => {
    if (!contextData?.routes) return []
    return contextData.routes.filter((r: any) => normalizeCourierName(getCourierName(r.courier)) === normalizeCourierName(courierName))
  }

  const openRouteInGoogleMaps = (route: any) => {
    if (!route) return
    const url = exportToGoogleMaps({
      route,
      orders: route.orders || [],
      startAddress: route.startAddress || '',
      endAddress: route.endAddress || ''
    })
    if (url) window.open(url, '_blank')
  }

  const openRouteInValhalla = (route: any) => {
    if (!route) return
    const url = exportToValhalla({
      route,
      orders: route.orders || [],
      startAddress: route.startAddress || '',
      endAddress: route.endAddress || ''
    })
    if (url) window.open(url, '_blank')
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

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = Math.floor(minutes % 60)
    return hours > 0 ? `${hours}ч ${mins}мін` : `${mins}мін`
  }

  const handleDistanceClick = (courier: Courier) => {
    setSelectedCourierForDistance(courier)
    setShowDistanceModal(true)
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
                <UserIcon className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className={clsx(
                  'text-3xl font-bold mb-1 bg-gradient-to-r bg-clip-text text-transparent',
                  isDark
                    ? 'from-blue-400 to-purple-400'
                    : 'from-blue-600 to-indigo-600'
                )}>
                  Керування кур'єрами
                </h1>
                <p className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>
                  Керуйте інформацією про кур'єрів та їх замовлення
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
                      {couriers.filter(c => c.isActive).length} активних
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
                      {couriers.length} всього
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Tooltip
                content="Відкрити довідку та інструкції з керування кур'єрами"
                position="left"
              >
                <button
                  onClick={() => {
                    setShowHelpModal(true)
                    if (!hasSeenHelp) {
                      localStorage.setItem('km_couriers_has_seen_help', 'true')
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
              <button
                onClick={() => setShowAddModal(true)}
                className={clsx(
                  'px-6 py-3 rounded-xl font-medium transition-all duration-200 transform hover:scale-105 shadow-lg',
                  'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800',
                  'text-white flex items-center space-x-2'
                )}
              >
                <PlusIcon className="h-5 w-5" />
                <span>Додати кур'єра</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className={clsx(
        'rounded-3xl shadow-xl border p-6 backdrop-blur-md transition-all duration-300',
        isDark ? 'bg-gray-800/60 border-gray-700/50' : 'bg-white/80 border-gray-200'
      )}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0 lg:space-x-6">
          {/* Filter Buttons */}
          <div className="flex flex-wrap gap-2" data-tour="filters">
            {[
              { id: 'all', label: 'Усі кур\'єри', icon: UserIcon, count: couriers.length, activeClass: 'from-blue-600 to-indigo-600' },
              { id: 'car', label: 'Авто', icon: TruckIcon, count: couriers.filter(c => c.vehicleType === 'car').length, activeClass: 'from-emerald-600 to-teal-600' },
              { id: 'motorcycle', label: 'Мото', icon: TruckIcon, count: couriers.filter(c => c.vehicleType === 'motorcycle').length, activeClass: 'from-orange-600 to-amber-600' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as any)}
                className={clsx(
                  'px-6 py-2.5 rounded-2xl text-sm font-bold transition-all duration-300 flex items-center gap-2 border-2',
                  filter === f.id
                    ? `bg-gradient-to-r ${f.activeClass} text-white border-transparent shadow-lg shadow-blue-500/20 scale-105`
                    : isDark
                      ? 'bg-gray-900/40 text-gray-400 border-gray-800 hover:border-gray-700 hover:text-gray-200'
                      : 'bg-gray-50 text-gray-500 border-gray-100 hover:border-gray-200 hover:text-gray-900'
                )}
              >
                <f.icon className="w-4 h-4" />
                <span>{f.label}</span>
                <span className={clsx(
                  'px-2 py-0.5 rounded-lg text-[10px] font-black',
                  filter === f.id ? 'bg-white/20' : isDark ? 'bg-gray-800' : 'bg-white border'
                )}>
                  {f.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search Field */}
          <div className="flex-1 max-w-md relative group" data-tour="search">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-transform group-focus-within:scale-110">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-500 group-focus-within:text-blue-500" />
            </div>
            <input
              type="text"
              placeholder="Пошук кур'єра..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={clsx(
                'w-full pl-12 pr-12 py-3 rounded-2xl border-2 text-sm font-medium transition-all duration-300 outline-none',
                isDark
                  ? 'bg-gray-900/40 border-gray-800 text-gray-100 placeholder-gray-600 focus:border-blue-500/50 focus:bg-gray-900/60'
                  : 'bg-white border-gray-100 text-gray-900 placeholder-gray-400 focus:border-blue-500/50 focus:shadow-blue-500/5'
              )}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-blue-500 transition-colors"
                title="Очистити пошук"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Couriers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8" data-tour="courier-list">
        {filteredCouriers.length > 0 ? (
          filteredCouriers.map((courier, index) => (
            <div
              key={`${courier.id}-${index}`}
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

      {/* Модальное окно с подробной информацией о пробеге - REDESIGNED v40 */}
      {showDistanceModal && selectedCourierForDistance && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity"
            onClick={() => setShowDistanceModal(false)}
          />
          
          <div className={clsx(
            "relative w-full max-w-4xl overflow-hidden rounded-[2.5rem] border-2 shadow-2xl transition-all flex flex-col max-h-[90vh]",
            isDark 
              ? "bg-[#1e1e1e]/90 border-white/10 text-white" 
              : "bg-white/90 border-blue-100 text-gray-900"
          )}>
            {/* Header */}
            <div className={clsx(
              "flex items-center justify-between p-8 border-b transition-colors",
              isDark ? "border-white/5" : "border-slate-100"
            )}>
              <div className="flex items-center gap-4">
                <div className={clsx(
                  "p-3 rounded-2xl",
                  selectedCourierForDistance.vehicleType === 'car'
                    ? "bg-blue-500/10 text-blue-400"
                    : "bg-orange-500/10 text-orange-400"
                )}>
                  <TruckIcon className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-black tracking-tight leading-tight">
                    {selectedCourierForDistance.name}
                  </h2>
                  <p className={clsx(
                    "text-xs font-bold uppercase tracking-widest opacity-50",
                    isDark ? "text-gray-400" : "text-gray-500"
                  )}>Детальна інформація про пробіг</p>
                </div>
              </div>
              
              <button
                onClick={() => setShowDistanceModal(false)}
                className={clsx(
                  "p-3 rounded-2xl transition-all hover:rotate-90 hover:scale-110",
                  isDark ? "bg-white/5 text-gray-400 hover:text-white" : "bg-gray-100 text-gray-500 hover:text-gray-900"
                )}
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            {/* Content Scroll Area */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              {(() => {
                const distanceStats = getCourierStats(selectedCourierForDistance.name)
                const courierRoutes = getCourierRoutes(selectedCourierForDistance.name)

                return (
                  <div className="space-y-10">
                    {/* Hero Stats Card - Enhanced v40 */}
                    <div className={clsx(
                      "grid grid-cols-1 md:grid-cols-2 gap-8 rounded-[2.5rem] p-8 border relative overflow-hidden",
                      isDark ? "bg-white/5 border-white/5" : "bg-slate-50 border-slate-100"
                    )}>
                      {/* Distance Section */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-3">
                          <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center", isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-600")}>
                            <MapIcon className="w-5 h-5" />
                          </div>
                          <h3 className="text-sm font-black uppercase tracking-[0.2em] opacity-50">Метрики пробігу</h3>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-wider opacity-30 mb-1">Загальний</span>
                            <div className="text-3xl font-black tabular-nums">
                              {distanceStats.totalDistance.toFixed(1)} <span className="text-sm opacity-30">км</span>
                            </div>
                          </div>
                          <div className="flex flex-col border-l border-white/10 pl-4">
                            <span className="text-[10px] font-black uppercase tracking-wider opacity-30 mb-1">База</span>
                            <div className="text-3xl font-black tabular-nums opacity-60">
                              {distanceStats.baseDistance.toFixed(1)} <span className="text-sm opacity-30">км</span>
                            </div>
                          </div>
                          <div className="flex flex-col border-l border-white/10 pl-4">
                            <span className="text-[10px] font-black uppercase tracking-wider opacity-30 mb-1">Додана</span>
                            <div className="text-3xl font-black tabular-nums opacity-60">
                              {distanceStats.additionalDistance.toFixed(1)} <span className="text-sm opacity-30">км</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Orders Calculation Progress Section - NEW v40 */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-3">
                          <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center", isDark ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-100 text-emerald-600")}>
                            <BoltIcon className="w-5 h-5" />
                          </div>
                          <h3 className="text-sm font-black uppercase tracking-[0.2em] opacity-50">Статус розрахунку</h3>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-wider opacity-30 mb-1">Всього</span>
                            <div className="text-3xl font-black tabular-nums text-blue-500">
                              {distanceStats.totalOrders}
                            </div>
                          </div>
                          <div className="flex flex-col border-l border-white/10 pl-4">
                            <span className="text-[10px] font-black uppercase tracking-wider opacity-30 mb-1">Розраховано</span>
                            <div className={clsx(
                              "text-3xl font-black tabular-nums",
                              distanceStats.ordersInRoutes === distanceStats.totalOrders ? "text-emerald-500" : "text-blue-400"
                            )}>
                              {distanceStats.ordersInRoutes}
                            </div>
                          </div>
                          <div className="flex flex-col border-l border-white/10 pl-4">
                            <span className="text-[10px] font-black uppercase tracking-wider opacity-30 mb-1">Залишилось</span>
                            <div className={clsx(
                              "text-3xl font-black tabular-nums",
                              (distanceStats.totalOrders - distanceStats.ordersInRoutes) > 0 ? "text-orange-500" : "text-gray-400 opacity-30"
                            )}>
                              {distanceStats.totalOrders - distanceStats.ordersInRoutes}
                            </div>
                          </div>
                        </div>
                        
                        {/* Progress Bar in Detail */}
                        <div className="mt-4">
                           <div className={clsx("h-1.5 w-full rounded-full overflow-hidden", isDark ? "bg-white/5" : "bg-gray-100")}>
                              <div 
                                className={clsx(
                                  "h-full transition-all duration-1000",
                                  distanceStats.ordersInRoutes === distanceStats.totalOrders ? "bg-emerald-500" : "bg-blue-500"
                                )}
                                style={{ width: `${(distanceStats.ordersInRoutes / distanceStats.totalOrders) * 100}%` }}
                              />
                           </div>
                        </div>
                      </div>
                    </div>

                    {/* Timeline of Routes */}
                    <div className="space-y-8">
                      <div className="flex items-center gap-4">
                        <h3 className="text-sm font-black uppercase tracking-[0.2em] opacity-50">Історія маршрутів ({courierRoutes.length})</h3>
                        <div className="flex-1 h-px bg-white/5"></div>
                      </div>

                      {courierRoutes.length > 0 ? (
                        <div className="space-y-12 relative pl-8">
                          {/* Vertical timeline line */}
                          <div className={clsx(
                            "absolute left-[1.125rem] top-2 bottom-2 w-0.5",
                            isDark ? "bg-white/5" : "bg-slate-200"
                          )} />

                          {courierRoutes.map((route: any, index: number) => {
                            const ordersCount = route.orders?.length || 0
                            const routeBaseDistance = route.isOptimized && route.totalDistance
                              ? route.totalDistance
                              : 1.0
                            
                            // v35.13: Correct distance calculation logic
                            // Only add 0.5km for DIFFERENT addresses to avoid "nonsense" duplicates
                            let routeAdditionalDistance = 0;
                            if (route.orders && route.orders.length > 0) {
                              let lastAddr = "";
                              route.orders.forEach((o: any) => {
                                const currentAddr = (o.address || "").trim().toLowerCase();
                                if (currentAddr !== lastAddr) {
                                  routeAdditionalDistance += 0.5;
                                  lastAddr = currentAddr;
                                }
                              });
                            }
                            
                            const routeTotalDistance = routeBaseDistance + routeAdditionalDistance

                            return (
                              <div key={`${route.id || 'route'}-${index}`} className="relative group">
                                {/* Timeline Dot */}
                                <div className={clsx(
                                  "absolute -left-[1.625rem] top-4 w-4 h-4 rounded-full border-4 z-10 transition-transform group-hover:scale-125",
                                  isDark ? "bg-[#1e1e1e] border-blue-500" : "bg-white border-blue-500"
                                )} />

                                <div className={clsx(
                                  "rounded-[2rem] border transition-all duration-300",
                                  isDark ? "bg-white/5 border-white/5 hover:bg-white/[0.08]" : "bg-white border-slate-100 hover:shadow-xl"
                                )}>
                                  {/* Route Header */}
                                  <div className="flex items-center justify-between p-6 pb-4 border-b border-white/5">
                                    <div className="flex items-center gap-4">
                                      <div className={clsx(
                                        "w-10 h-10 rounded-xl flex items-center justify-center",
                                        isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-50 text-blue-600"
                                      )}>
                                        <TruckIcon className="w-5 h-5" />
                                      </div>
                                      <div>
                                        <h4 className="font-black text-lg">Маршрут #{index + 1}</h4>
                                        <p className="text-xs font-bold opacity-40 uppercase tracking-widest">{ordersCount} замовлень</p>
                                      </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => openRouteInGoogleMaps(route)}
                                        className={clsx(
                                          "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                                          isDark ? "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20" : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                                        )}
                                      >
                                        <MapIcon className="w-4 h-4" />
                                        Google
                                      </button>
                                      <button
                                        onClick={() => openRouteInValhalla(route)}
                                        className={clsx(
                                          "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                                          isDark ? "bg-green-500/10 text-green-400 hover:bg-green-500/20" : "bg-green-50 text-green-600 hover:bg-green-100"
                                        )}
                                      >
                                        <PlayIcon className="w-4 h-4" />
                                        Valhalla
                                      </button>
                                      <button
                                        onClick={() => deleteRoute(route.id)}
                                        className={clsx(
                                          "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                                          isDark ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-red-50 text-red-600 hover:bg-red-100"
                                        )}
                                        title="Видалити маршрут"
                                      >
                                        <TrashIcon className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Address Clarification Warning Block v40 */}
                                  {(() => {
                                    const problematicOrders = route.orders?.filter((order: any) => {
                                      const meta = (route as any).geoMeta?.waypoints?.[route.orders.indexOf(order)]
                                      const locType = meta?.locationType || order.locationType
                                      const streetMatched = meta?.streetNumberMatched ?? order.streetNumberMatched
                                      
                                      // v40.1: Precision logic to avoid "nearly every order" warnings
                                      return needsAddressClarification({
                                         locationType: locType,
                                         streetNumberMatched: streetMatched,
                                         hasCoords: !!(order.coords?.lat || meta?.location?.lat)
                                      })
                                    }) || []

                                    if (problematicOrders.length === 0) return null

                                    return (
                                      <div className={clsx(
                                        "mx-6 mb-6 p-6 rounded-[2rem] border-2 animate-pulse-slow",
                                        isDark 
                                          ? "bg-red-500/10 border-red-500/30 text-red-400" 
                                          : "bg-red-50 border-red-100 text-red-600"
                                      )}>
                                        <div className="flex items-center gap-4 mb-4">
                                          <div className={clsx(
                                            "p-2 rounded-xl",
                                            isDark ? "bg-red-500/20" : "bg-red-100"
                                          )}>
                                            <ExclamationTriangleIcon className="w-6 h-6" />
                                          </div>
                                          <h4 className="text-sm font-black uppercase tracking-widest">
                                            Требує уточнення адреси
                                          </h4>
                                        </div>

                                        <div className="space-y-3">
                                          {problematicOrders.map((order: any, pIdx: number) => (
                                            <div 
                                              key={`problem-${order.id || pIdx}`}
                                              className={clsx(
                                                "flex items-center justify-between p-3 rounded-xl border border-dashed transition-all",
                                                isDark ? "border-red-500/20 bg-red-500/5 hover:bg-red-500/10" : "border-red-200 bg-white hover:bg-red-50/50"
                                              )}
                                            >
                                              <div className="flex items-center gap-3 min-w-0">
                                                <span className="font-black text-xs">#{order.orderNumber}</span>
                                                <span className="text-xs truncate opacity-70">{order.address}</span>
                                              </div>
                                              <button
                                                onClick={() => {
                                                  setAddressEditOrder(order)
                                                  setAddressEditRouteId(route.id)
                                                }}
                                                className={clsx(
                                                  "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95",
                                                  isDark 
                                                    ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" 
                                                    : "bg-red-600 text-white hover:bg-red-700 shadow-red-500/20"
                                                )}
                                              >
                                                Уточнити
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )
                                  })()}

                                  {/* Route Orders List */}
                                  <div className="p-6 space-y-3">
                                    {route.orders?.map((order: any, orderIndex: number) => {
                                      const meta = (route as any).geoMeta?.waypoints?.[orderIndex]
                                      const locType = meta?.locationType || order.locationType
                                      const streetMatched = meta?.streetNumberMatched ?? order.streetNumberMatched
                                      const opZone = meta?.zoneName || order.deliveryZone
                                      const kmlZone = order.kmlZone || (order as any).locationMeta?.kmlZone
                                      const hub = order.kmlHub || meta?.hubName || (order as any).locationMeta?.hubName
                                      const hasZones = opZone || kmlZone

                                      return (
                                        <div 
                                          key={`${order.id || 'order'}-${orderIndex}`}
                                          className={clsx(
                                            "flex items-center justify-between p-3 rounded-2xl transition-all",
                                            isDark ? "bg-white/[0.03] hover:bg-white/10" : "bg-slate-50 hover:bg-slate-100"
                                          )}
                                        >
                                          <div className="flex items-center gap-4 flex-1 min-w-0">
                                            <div className={clsx(
                                              "w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black",
                                              isDark ? "bg-white/5 text-gray-400" : "bg-white text-gray-500 border border-slate-100"
                                            )}>
                                              {orderIndex + 1}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <div className="flex items-center justify-between gap-2 mb-0.5">
                                                <div className="flex items-center gap-2 min-w-0">
                                                  <span className="font-black text-sm">#{order.orderNumber}</span>
                                                  <span className="text-[12px] opacity-40 truncate">{order.address}</span>
                                                </div>
                                                <button
                                                  onClick={() => {
                                                    setAddressEditOrder(order)
                                                    setAddressEditRouteId(route.id)
                                                  }}
                                                  className={clsx(
                                                    "p-1.5 rounded-lg transition-all active:scale-95",
                                                    isDark ? "hover:bg-white/5 text-blue-400" : "hover:bg-blue-50 text-blue-600"
                                                  )}
                                                  title="Редагувати адресу"
                                                >
                                                  <PencilIcon className="w-3.5 h-3.5" />
                                                </button>
                                              </div>
                                              
                                              {/* Unified Badges v42.1 - Premium "Cool" Labels (Synced with RouteCard) */}
                                              <div className="mt-2 flex items-center flex-wrap gap-1.5">
                                                {/* Verified Status v42.1 */}
                                                {(locType === 'ROOFTOP') && (
                                                  <div className={clsx(
                                                    "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                                                    isDark ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-700"
                                                  )}>
                                                    <CheckBadgeIcon className="w-3.5 h-3.5" />
                                                    ТОЧНИЙ АДРЕС
                                                  </div>
                                                )}

                                                {/* Locked/Verified Status v42.1 */}
                                                {order.isLocked && (
                                                  <div className={clsx(
                                                    "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                                                    isDark ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-green-50 border-green-200 text-green-700"
                                                  )}>
                                                    <CheckBadgeIcon className="w-3.5 h-3.5" />
                                                    ПЕРЕВІРЕНО
                                                  </div>
                                                )}

                                                {/* Sector / KML v42.3 (Smart Deduplication) */}
                                                {(() => {
                                                  const kmlFull = kmlZone ? `${hub ? hub + ' - ' : ''}${kmlZone}` : null;
                                                  const same = opZone && kmlFull && opZone.trim().toLowerCase() === kmlFull.trim().toLowerCase();

                                                  return hasZones && (
                                                    <div className={clsx(
                                                      "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                                                      ((String(opZone || '').includes('ID:0') || String(kmlZone || '').includes('ID:0')) && !same)
                                                        ? (isDark ? "bg-red-500/20 border-red-500/40 text-red-400 animate-pulse" : "bg-red-50 border-red-200 text-red-600 shadow-red-500/10")
                                                        : (isDark ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300" : "bg-indigo-50 border-indigo-100 text-indigo-700")
                                                    )}>
                                                      <MapIcon className="w-3.5 h-3.5 opacity-70" />
                                                      <span className="opacity-60 mr-0.5">СЕКТОР:</span>
                                                      {(() => {
                                                        if (same) return `FO/KML:${opZone.trim()}`.toUpperCase();

                                                        const zones = [
                                                          opZone ? `FO:${opZone}` : null,
                                                          kmlFull ? `KML:${kmlFull}` : null
                                                        ].filter(Boolean).join(' | ').toUpperCase();
                                                        return zones || '—';
                                                      })()}
                                                    </div>
                                                  );
                                                })()}

                                                {/* Street Match v42.1 */}
                                                {locType && (
                                                  <div className={clsx(
                                                    "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                                                    locType !== 'APPROXIMATE'
                                                      ? (isDark ? "bg-teal-500/10 border-teal-500/30 text-teal-400" : "bg-teal-50 border-teal-100 text-teal-700")
                                                      : (isDark ? "bg-rose-500/10 border-rose-500/30 text-rose-400" : "bg-rose-50 border-rose-200 text-rose-700")
                                                  )}>
                                                    <MapIcon className="w-3.5 h-3.5 opacity-70" />
                                                    <span className="opacity-60 mr-0.5">ВУЛИЦЯ:</span>
                                                    {locType !== 'APPROXIMATE' ? 'ТАК' : 'НІ'}
                                                  </div>
                                                )}

                                                {/* House Match v42.1 */}
                                                {streetMatched !== undefined && (
                                                  <div className={clsx(
                                                    "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                                                    streetMatched 
                                                      ? (isDark ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400" : "bg-cyan-50 border-cyan-100 text-cyan-700")
                                                      : (isDark ? "bg-orange-500/10 border-orange-500/30 text-orange-400" : "bg-orange-50 border-orange-200 text-orange-700")
                                                  )}>
                                                    <HomeIcon className="w-3.5 h-3.5 opacity-70" />
                                                    <span className="opacity-60 mr-0.5">БУДИНОК:</span>
                                                    {streetMatched ? 'ТАК' : 'НІ'}
                                                  </div>
                                                )}

                                                {/* Interpolated fallback info */}

                                                {/* Unverified Warning - Only if coordinates are missing */}
                                                {(!(order.lat || (order as any).coords?.lat) || !(order.lng || (order as any).coords?.lng)) && (
                                                  <div className={clsx(
                                                    "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 animate-pulse shadow-sm",
                                                    isDark ? "bg-amber-500/10 border-amber-500/30 text-amber-500" : "bg-amber-50 border-amber-200 text-amber-700 shadow-amber-500/10"
                                                  )}>
                                                     <ExclamationCircleIcon className="w-3.5 h-3.5" />
                                                     УТОЧНИТИ АДРЕСУ
                                                  </div>
                                                )}

                                              </div>
                                            </div>
                                          </div>
                                          <div className="text-sm font-black opacity-30 px-3 uppercase tracking-widest hidden sm:block">
                                            +0.5 км
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>

                                  {/* Route Metrics Summary (Footer within Route) */}
                                  <div className={clsx(
                                    "px-6 py-4 rounded-b-[2rem] flex items-center justify-between",
                                    isDark ? "bg-white/[0.02]" : "bg-slate-50/50"
                                  )}>
                                    <div className="flex gap-6">
                                      <div className="flex flex-col">
                                        <span className="text-[8px] font-bold uppercase tracking-widest opacity-30">Разом</span>
                                        <span className="text-sm font-black">{routeTotalDistance.toFixed(1)} км</span>
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-[8px] font-bold uppercase tracking-widest opacity-30">База</span>
                                        <span className="text-sm font-black opacity-60">{routeBaseDistance.toFixed(1)} км</span>
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-[8px] font-bold uppercase tracking-widest opacity-30">Час</span>
                                        <span className="text-sm font-black opacity-60">
                                          {route.totalDuration ? formatDuration(route.totalDuration) : '—'}
                                        </span>
                                      </div>
                                    </div>
                                    {!route.isOptimized && (
                                      <div className={clsx(
                                        "flex items-center gap-2 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest",
                                        route.hasGeoErrors 
                                          ? (isDark ? "bg-red-500/20 text-red-500" : "bg-red-50 text-red-600")
                                          : (isDark ? "bg-amber-500/10 text-amber-500" : "bg-amber-50 text-amber-700")
                                      )}>
                                        {route.hasGeoErrors ? <ExclamationTriangleIcon className="w-3 h-3" /> : <ExclamationCircleIcon className="w-3 h-3" />}
                                        {route.hasGeoErrors ? 'ПОМИЛКА (АДРЕСА)' : 'Потребує уточнення'}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className={clsx(
                          "flex flex-col items-center justify-center p-20 rounded-[3rem] border-2 border-dashed",
                          isDark ? "bg-white/5 border-white/5" : "bg-slate-50 border-slate-100"
                        )}>
                          <div className={clsx(
                            "w-20 h-20 rounded-full flex items-center justify-center mb-6",
                            isDark ? "bg-white/5 text-gray-700" : "bg-white text-gray-200"
                          )}>
                            <MapPinIcon className="w-10 h-10" />
                          </div>
                          <p className="font-bold opacity-30 uppercase tracking-[0.2em] text-center">У цього кур'єра<br/>ще немає маршрутів</p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Footer */}
            <div className={clsx(
              "p-8 border-t bg-black/5 flex justify-end",
              isDark ? "border-white/5" : "border-slate-100"
            )}>
              <button
                onClick={() => setShowDistanceModal(false)}
                className={clsx(
                  "px-8 py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] transition-all transform active:scale-95 shadow-lg shadow-blue-500/10",
                  isDark ? "bg-blue-600 text-white hover:bg-blue-500" : "bg-blue-600 text-white hover:bg-blue-700"
                )}
              >
                Закрити
              </button>
            </div>
          </div>
        </div>
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