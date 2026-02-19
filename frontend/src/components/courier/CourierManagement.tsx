import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react'
import { localStorageUtils } from '../../utils/ui/localStorage'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  UserIcon,
  TruckIcon,
  MapPinIcon,
  QuestionMarkCircleIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  MapIcon,
  ClockIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import { CourierCard } from './CourierCard'
import { useExcelData } from '../../contexts/ExcelDataContext'
import { useTheme } from '../../contexts/ThemeContext'
import { googleMapsLoader } from '../../utils/maps/googleMapsLoader'
import { clsx } from 'clsx'
import { AddressValidationService } from '../../services/addressValidation'
import { toast } from 'react-hot-toast'
import { AddressEditModal } from '../modals/AddressEditModal'
import { Tooltip } from '../shared/Tooltip'
import { googleApiCache } from '../../services/googleApiCache'
import { GeocodingService } from '../../services/geocodingService'
import { getUkraineTrafficForOrders, calculateTotalTrafficDelay } from '../../utils/maps/ukraineTrafficAPI'
import { normalizeCourierName } from '../../utils/data/courierName'

// Ленивая загрузка тяжелых компонентов
const HelpModalCouriers = lazy(() => import('../modals/HelpModalCouriers').then(m => ({ default: m.HelpModalCouriers })))
const HelpTour = lazy(() => import('../features/HelpTour').then(m => ({ default: m.HelpTour })))

interface Courier {
  id: string
  name: string
  phone: string
  email: string
  vehicleType: 'car' | 'motorcycle'
  location: string
  isActive: boolean
  orders: number
  totalDistance: number
  totalAmount?: number
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
  const [showAddressEditModal, setShowAddressEditModal] = useState(false)
  const [editingOrder, setEditingOrder] = useState<any | null>(null)
  const [recalculatingRouteId, setRecalculatingRouteId] = useState<string | null>(null)

  const [hasSeenHelp, setHasSeenHelp] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('km_couriers_has_seen_help') === 'true'
    }
    return false
  })
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [showHelpTour, setShowHelpTour] = useState(false)

  // Оптимизированный расчет статистики всех курьеров (O(N + M))
  const courierStatsMap = useMemo(() => {
    const stats = new Map<string, {
      ordersInRoutes: number,
      baseDistance: number,
      additionalDistance: number,
      totalDistance: number
    }>()

    if (!contextData?.routes || !Array.isArray(contextData.routes)) {
      return stats
    }

    contextData.routes.forEach((route: any) => {
      const courierName = normalizeCourierName(route.courier)
      if (!courierName) return

      const current = stats.get(courierName) || {
        ordersInRoutes: 0,
        baseDistance: 0,
        additionalDistance: 0,
        totalDistance: 0
      }

      const ordersCount = (route.orders || []).length
      current.ordersInRoutes += ordersCount

      if (route.isOptimized && route.totalDistance) {
        current.totalDistance += route.totalDistance + (ordersCount * 0.5)
        current.baseDistance += route.totalDistance
        current.additionalDistance += (ordersCount * 0.5)
      } else {
        const routeBase = 1.0
        const routeAdd = ordersCount * 0.5
        current.totalDistance += routeBase + routeAdd
        current.baseDistance += routeBase
        current.additionalDistance += routeAdd
      }

      stats.set(courierName, current)
    })

    return stats
  }, [contextData?.routes])

  const getCourierStats = (courierName: string) => {
    const normalized = normalizeCourierName(courierName)
    if (!normalized) return { ordersInRoutes: 0, baseDistance: 0, additionalDistance: 0, totalDistance: 0 }
    return courierStatsMap.get(normalized) || {
      ordersInRoutes: 0,
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
        const name = normalizeCourierName(o.courier)
        if (name) courierNames.add(name)
      })
    }

    const vehicleMap = localStorageUtils.getCourierVehicleMap()
    const list = Array.from(courierNames)
      .filter(name => name && name !== 'Не назначено' && name !== 'ID:0')
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
          orders: stats.ordersInRoutes,
          totalDistance: stats.totalDistance,
          totalAmount: excelInfo?.totalAmount || 0
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

  const searchCouriers = (courier: Courier) => {
    if (!searchTerm.trim()) return true
    const searchLower = searchTerm.toLowerCase()
    return courier.name.toLowerCase().includes(searchLower) ||
      courier.phone.includes(searchTerm) ||
      courier.email.toLowerCase().includes(searchLower)
  }

  const filteredCouriers = useMemo(() => {
    return couriers
      .filter(c => filter === 'all' || c.vehicleType === filter)
      .filter(searchCouriers)
  }, [couriers, filter, searchTerm])

  const getCourierRoutes = (courierName: string) => {
    if (!contextData?.routes) return []
    return contextData.routes.filter((r: any) => normalizeCourierName(r.courier) === normalizeCourierName(courierName))
  }

  const handleEditAddress = (order: any) => {
    setEditingOrder(order)
    setShowAddressEditModal(true)
  }

  const handleSaveAddress = (newAddress: string) => {
    if (!editingOrder) return

    const updatedOrder = { ...editingOrder, address: newAddress }

    if (contextData?.routes) {
      const updatedRoutes = contextData.routes.map((route: any) => {
        const orderIndex = route.orders.findIndex((order: any) => order.id === editingOrder.id)

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
      })

      updateRouteData(updatedRoutes)

      try {
        const savedData = JSON.parse(localStorage.getItem('km_dashboard_processed_data') || '{}')
        if (savedData.routes) {
          savedData.routes = updatedRoutes
          localStorage.setItem('km_dashboard_processed_data', JSON.stringify(savedData))
        }
      } catch (error) {
        console.error('Ошибка сохранения данных:', error)
      }
    }

    setShowAddressEditModal(false)
    setEditingOrder(null)
  }

  const handleRecalculateRoute = async (route: any) => {
    const anomalyCheck = AddressValidationService.checkRouteAnomalies(route)

    if (anomalyCheck.hasAnomalies && anomalyCheck.errors.length > 0) {
      console.error('Route errors:', anomalyCheck.errors)
      return
    }

    if (anomalyCheck.warnings.length > 0) {
      console.warn('Route warnings:', anomalyCheck.warnings)
    }
  }

  const openRouteInGoogleMaps = (route: any) => {
    if (!route || !route.orders || route.orders.length === 0) {
      toast.error('Маршрут пустой')
      return
    }
    const meta = route.geoMeta || {}
    const hasCoords = (m: any) => typeof m?.lat === 'number' && typeof m?.lng === 'number'
    const waypointsMeta: any[] = Array.isArray(meta.waypoints) ? meta.waypoints : []
    const missing = !hasCoords(meta.origin) || !hasCoords(meta.destination) || waypointsMeta.length !== route.orders.length || waypointsMeta.some(w => !hasCoords(w))
    if (missing) {
      toast.error('Щоб відкрити коректний маршрут у Google Maps, спочатку перерахуйте його.')
      return
    }
    const parts: string[] = []
    parts.push(`${meta.origin.lat},${meta.origin.lng}`)
    waypointsMeta.forEach((w: any) => parts.push(`${w.lat},${w.lng}`))
    parts.push(`${meta.destination.lat},${meta.destination.lng}`)
    const googleMapsUrl = `https://www.google.com/maps/dir/${parts.map(encodeURIComponent).join('/')}`
    window.open(googleMapsUrl, '_blank')
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

  const recalculateCourierRoute = async (route: any) => {
    setRecalculatingRouteId(route.id)

    try {
      const anomalyCheck = AddressValidationService.checkRouteAnomalies(route)

      if (anomalyCheck.hasAnomalies && anomalyCheck.errors.length > 0) {
        const errorMessage = `Виявлено помилки у маршруті:\n${anomalyCheck.errors.join('\n')}\n\nПерерахунок неможливий. Виправте помилки в адресах.`
        toast.error(errorMessage)
        return
      }

      if (!window.google || !window.google.maps) {
        try {
          await googleMapsLoader.load()
        } catch (error) {
          toast.error('Помилка завантаження Google Maps API.')
          return
        }
      }

      const waypoints = []

      // Явное геокодирование всех точек маршрута для избежания "центра области"
      for (const order of route.orders) {
        const geoResult = await GeocodingService.geocodeAndCleanAddress(order.address)
        if (geoResult.success && geoResult.latitude && geoResult.longitude) {
          waypoints.push({
            location: { lat: geoResult.latitude, lng: geoResult.longitude },
            stopover: true
          })
        } else {
          // Fallback если геокодинг не сработал (хотя geocodeAndCleanAddress очень старается)
          waypoints.push({
            location: order.address,
            stopover: true
          })
        }
      }

      // Также геокодируем старт и финиш
      let origin: any = route.startAddress
      if (typeof route.startAddress === 'string') {
        const startGeo = await GeocodingService.geocodeAndCleanAddress(route.startAddress)
        if (startGeo.success && startGeo.latitude && startGeo.longitude) {
          origin = { lat: startGeo.latitude, lng: startGeo.longitude }
        }
      }

      let destination: any = route.endAddress
      if (typeof route.endAddress === 'string') {
        const endGeo = await GeocodingService.geocodeAndCleanAddress(route.endAddress)
        if (endGeo.success && endGeo.latitude && endGeo.longitude) {
          destination = { lat: endGeo.latitude, lng: endGeo.longitude }
        }
      }

      const request = {
        origin: origin,
        destination: destination,
        waypoints: waypoints,
        travelMode: window.google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
        unitSystem: window.google.maps.UnitSystem.METRIC,
        avoidHighways: false,
        avoidTolls: false,
        avoidFerries: false,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: window.google.maps.TrafficModel.BEST_GUESS
        }
      }

      const result = await googleApiCache.getDirections(request)
      if (!result) {
        toast.error('Помилка при перерахунку маршруту')
        return
      }

      const totalDistanceMeters = result.routes[0].legs.reduce((sum: number, leg: any) => {
        if (leg.distance && typeof leg.distance.value === 'number') return sum + leg.distance.value;
        return sum;
      }, 0);
      const totalDurationSec = result.routes[0].legs.reduce((sum: number, leg: any) => {
        if (leg.duration && typeof leg.duration.value === 'number') return sum + leg.duration.value;
        return sum;
      }, 0);

      let adjustedDurationSec = totalDurationSec
      let trafficDelayMin = 0
      const settings = localStorageUtils.getAllSettings()
      const mapboxToken = settings.mapboxToken || localStorage.getItem('km_mapbox_token')

      if (mapboxToken && route.orders.length >= 1) {
        try {
          const chainForTraffic = route.orders.map((o: any) => ({
            ...o,
            coords: o.coords || (o.raw?.coords)
          })).filter((o: any) => o.coords)

          if (chainForTraffic.length >= 1) {
            const trafficInfo = await getUkraineTrafficForOrders(chainForTraffic as any, mapboxToken)
            if (trafficInfo.length > 0) {
              trafficDelayMin = calculateTotalTrafficDelay(trafficInfo)

              const courierObj = couriers.find(c => c.name === route.courier)
              if (route.vehicleType === 'motorcycle' || (courierObj && courierObj.vehicleType === 'motorcycle')) {
                trafficDelayMin = trafficDelayMin * 0.5
              }

              adjustedDurationSec += (trafficDelayMin * 60)
            }
          }
        } catch (err) {
          console.warn('Traffic calculation failed:', err)
        }
      }

      const updatedRoute = {
        ...route,
        totalDistance: Math.round(totalDistanceMeters / 1000 * 10) / 10,
        totalDuration: Math.round(adjustedDurationSec / 60),
        isOptimized: true,
        lastCalculated: new Date().toISOString()
      }

      if (contextData?.routes) {
        const updatedRoutes = contextData.routes.map((r: any) => r.id === route.id ? updatedRoute : r)
        updateRouteData(updatedRoutes)
      }

      try {
        const savedData = JSON.parse(localStorage.getItem('km_dashboard_processed_data') || '{}')
        if (savedData.routes) {
          const updatedRoutes = savedData.routes.map((r: any) => r.id === route.id ? updatedRoute : r)
          savedData.routes = updatedRoutes
          localStorage.setItem('km_dashboard_processed_data', JSON.stringify(savedData))
        }
      } catch (error) {
        console.error('Ошибка сохранения маршрута:', error)
      }

      toast.success(`Маршрут кур'єра ${route.courier} перераховано: ${updatedRoute.totalDistance}км, ${updatedRoute.totalDuration}хв`)

    } catch (error) {
      console.error('Ошибка пересчета маршрута:', error)
      toast.error('Помилка при перерахунку маршруту')
    } finally {
      setRecalculatingRouteId(null)
    }
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
          filteredCouriers.map(courier => (
            <CourierCard
              key={courier.id}
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

      {/* Модальное окно с подробной информацией о пробеге */}
      {showDistanceModal && selectedCourierForDistance && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">
                  Детальна інформація про пробіг - {selectedCourierForDistance.name}
                </h3>
                <button
                  onClick={() => setShowDistanceModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="px-6 py-4">
              {(() => {
                const distanceStats = getCourierStats(selectedCourierForDistance.name)
                const courierRoutes = getCourierRoutes(selectedCourierForDistance.name)

                return (
                  <div className="space-y-6">
                    {/* Общая статистика */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center p-4 bg-blue-50 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {distanceStats.totalDistance.toFixed(1)} км
                        </div>
                        <div className="text-sm text-blue-600">Загальний пробіг</div>
                      </div>
                      <div className="text-center p-4 bg-green-50 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">
                          {distanceStats.baseDistance.toFixed(1)} км
                        </div>
                        <div className="text-sm text-green-600">Базова відстань</div>
                      </div>
                      <div className="text-center p-4 bg-orange-50 rounded-lg">
                        <div className="text-2xl font-bold text-orange-600">
                          {distanceStats.additionalDistance.toFixed(1)} км
                        </div>
                        <div className="text-sm text-orange-600">Додаткова відстань</div>
                      </div>
                    </div>

                    {/* Детали по маршрутам */}
                    {courierRoutes.length > 0 ? (
                      <div>
                        <h4 className="text-lg font-medium text-gray-900 mb-4">
                          Деталі по маршрутах ({courierRoutes.length})
                        </h4>
                        <div className="space-y-3">
                          {courierRoutes.map((route: any, index: number) => {
                            const ordersCount = route.orders?.length || 0
                            const routeBaseDistance = route.isOptimized && route.totalDistance
                              ? route.totalDistance
                              : 1.0
                            const routeAdditionalDistance = ordersCount * 0.5
                            const routeTotalDistance = routeBaseDistance + routeAdditionalDistance

                            return (
                              <div key={route.id || index} className="border border-gray-200 rounded-lg p-4">
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex items-center space-x-2">
                                    <TruckIcon className={`h-5 w-5 ${selectedCourierForDistance.vehicleType === 'car' ? 'text-green-600' : 'text-orange-600'
                                      }`} />
                                    <div>
                                      <h5 className="font-medium text-gray-900">
                                        Маршрут #{index + 1}
                                      </h5>
                                      <span className="text-sm text-gray-500">
                                        {ordersCount} замовлень
                                      </span>
                                    </div>
                                    <span className={`text-xs px-2 py-1 rounded-full ${selectedCourierForDistance.vehicleType === 'car'
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-orange-100 text-orange-800'
                                      }`}>
                                      {selectedCourierForDistance.vehicleType === 'car' ? 'Авто' : 'Мото'}
                                    </span>
                                  </div>
                                  <div className="flex space-x-2">
                                    <button
                                      onClick={() => openRouteInGoogleMaps(route)}
                                      disabled={!route.isOptimized}
                                      className={clsx(
                                        'p-2 rounded-lg transition-all duration-200',
                                        route.isOptimized
                                          ? 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                                          : 'text-gray-400 cursor-not-allowed'
                                      )}
                                      title={route.isOptimized ? "Відкрити маршрут у Google Maps" : "Маршрут не розрахований"}
                                    >
                                      <MapIcon className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => recalculateCourierRoute(route)}
                                      disabled={recalculatingRouteId === route.id}
                                      className={clsx(
                                        'p-2 rounded-lg transition-all duration-200',
                                        recalculatingRouteId === route.id
                                          ? 'text-green-600 bg-green-50 cursor-wait'
                                          : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                                      )}
                                      title={recalculatingRouteId === route.id ? "Перераховується..." : "Перерахувати маршрут"}
                                    >
                                      <ArrowPathIcon className={clsx(
                                        'h-4 w-4',
                                        recalculatingRouteId === route.id && 'animate-spin'
                                      )} />
                                    </button>
                                    <button
                                      onClick={() => deleteRoute(route.id)}
                                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
                                      title="Видалити маршрут"
                                    >
                                      <TrashIcon className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-3 gap-3 text-sm">
                                  <div className="text-center">
                                    <div className="font-semibold text-gray-900">
                                      {routeTotalDistance.toFixed(1)} км
                                    </div>
                                    <div className="text-gray-500">Загальний пробіг</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="font-semibold text-gray-900">
                                      {routeBaseDistance.toFixed(1)} км
                                    </div>
                                    <div className="text-gray-500">
                                      {route.isOptimized ? 'Розрахована' : 'Базова'} відстань
                                    </div>
                                  </div>
                                  <div className="text-center">
                                    <div className="font-semibold text-gray-900">
                                      {routeAdditionalDistance.toFixed(1)} км
                                    </div>
                                    <div className="text-gray-500">Додаткова</div>
                                  </div>
                                </div>

                                {/* Заказы в маршруте */}
                                {route.orders && route.orders.length > 0 && (
                                  <div className="mt-4">
                                    <div className="flex items-center justify-between mb-2">
                                      <h6 className="text-sm font-medium text-gray-700">Замовлення у маршруті:</h6>
                                      <button
                                        onClick={() => handleRecalculateRoute(route)}
                                        className="p-1 rounded text-green-600 hover:text-green-800 hover:bg-green-50 transition-colors"
                                        title="Перерахувати маршрут"
                                      >
                                        <ArrowPathIcon className="h-4 w-4" />
                                      </button>
                                    </div>
                                    <div className="space-y-1">
                                      {route.orders.map((order: any, orderIndex: number) => (
                                        <div key={orderIndex} className="flex items-center space-x-2 text-sm group">
                                          <span className="w-6 h-6 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-xs font-medium">
                                            {orderIndex + 1}
                                          </span>
                                          <span className="text-gray-600 font-medium">#{order.orderNumber}</span>
                                          <span className="text-gray-500 truncate flex-1">{order.address}</span>
                                          {order.customerName && (
                                            <span className="text-gray-400 text-xs">({order.customerName})</span>
                                          )}
                                          <button
                                            onClick={() => handleEditAddress(order)}
                                            className="p-1 rounded text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                            title="Редагувати адресу"
                                          >
                                            <PencilIcon className="h-4 w-4" />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {route.isOptimized && (
                                  <div className="mt-3 pt-3 border-t border-gray-200">
                                    <div className="flex items-center justify-center space-x-4 text-sm">
                                      <div className="flex items-center space-x-1">
                                        <MapPinIcon className="h-4 w-4 text-gray-400" />
                                        <span className="text-gray-600">Відстань:</span>
                                        <span className="font-medium text-gray-900">
                                          {route.totalDistance ? `${route.totalDistance.toFixed(1)} км` : 'N/A'}
                                        </span>
                                      </div>
                                      <div className="flex items-center space-x-1">
                                        <ClockIcon className="h-4 w-4 text-gray-400" />
                                        <span className="text-gray-600">Час:</span>
                                        <span className="font-medium text-gray-900">
                                          {route.totalDuration ? formatDuration(route.totalDuration) : 'N/A'}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Отображение аномалий маршрута */}
                                    {(() => {
                                      const anomalyCheck = AddressValidationService.checkRouteAnomalies(route)
                                      if (!anomalyCheck || (!anomalyCheck.hasAnomalies && anomalyCheck.warnings.length === 0)) {
                                        return null
                                      }

                                      return (
                                        <div className="mt-2 space-y-1">
                                          {anomalyCheck.errors.length > 0 && (
                                            <div className="text-xs p-2 rounded bg-red-50 text-red-700 border border-red-200">
                                              <div className="flex items-center space-x-1">
                                                <ExclamationTriangleIcon className="h-3 w-3" />
                                                <span className="font-medium">Помилки:</span>
                                              </div>
                                              <ul className="ml-4 mt-1">
                                                {anomalyCheck.errors.map((error: any, index: number) => (
                                                  <li key={index}>• {error}</li>
                                                ))}
                                              </ul>
                                            </div>
                                          )}

                                          {anomalyCheck.warnings.length > 0 && (
                                            <div className="text-xs p-2 rounded bg-yellow-50 text-yellow-700 border border-yellow-200">
                                              <div className="flex items-center space-x-1">
                                                <ExclamationTriangleIcon className="h-3 w-3" />
                                                <span className="font-medium">Попередження:</span>
                                              </div>
                                              <ul className="ml-4 mt-1">
                                                {anomalyCheck.warnings.map((warning: any, index: number) => (
                                                  <li key={index}>• {warning}</li>
                                                ))}
                                              </ul>
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })()}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <MapPinIcon className="mx-auto h-12 w-12 text-gray-400" />
                        <p className="mt-2 text-sm text-gray-500">У цього кур'єра немає маршрутів</p>
                      </div>
                    )}

                  </div>
                )
              })()}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setShowDistanceModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
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

      {/* Модальное окно редактирования адреса */}
      {showAddressEditModal && editingOrder && (
        <AddressEditModal
          isOpen={showAddressEditModal}
          onClose={() => setShowAddressEditModal(false)}
          onSave={handleSaveAddress}
          currentAddress={editingOrder.address}
          orderNumber={editingOrder.orderNumber}
          customerName={editingOrder.customerName}
          isDark={isDark}
        />
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

      {/* Help Tour */}
      <Suspense fallback={null}>
        <HelpTour
          steps={[]} // Will be populated from a config
          isOpen={showHelpTour}
          onClose={() => setShowHelpTour(false)}
        />
      </Suspense>
    </div>
  )
}