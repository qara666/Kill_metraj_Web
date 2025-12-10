import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react'
import { clsx } from 'clsx'
import { useTheme } from '../contexts/ThemeContext'
import {
  DocumentArrowUpIcon,
  Cog6ToothIcon,
  ClockIcon,
  MapPinIcon,
  TruckIcon,
  PlayIcon,
  ArrowPathIcon,
  ChartBarIcon,
  QuestionMarkCircleIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline'
import {
  SparklesIcon as SparklesIconSolid
} from '@heroicons/react/24/solid'
import { processExcelFile, ProcessedExcelData } from '../utils/excelProcessor'
import { googleMapsLoader } from '../utils/googleMapsLoader'
import { GoogleAPIManager, GoogleAPIManagerConfig } from '../utils/googleAPIManager'
import { localStorageUtils } from '../utils/localStorage'
import { combineOrders, splitLargeRoute, shouldCombineOrders, type Order as OptimizationOrder } from '../utils/routeOptimization'
import { generateRouteNotifications, formatNotificationForDisplay, type Notification, type NotificationPreferences, type RouteInfo as NotificationRouteInfo } from '../utils/notifications'
import type { CoverageAnalysis } from '../utils/coverageAnalysis'
import { routeOptimizationCache, Coordinates } from '../utils/routeOptimizationCache'
import {
  getCachedDistance,
  findClusters,
  calculateRouteEfficiency,
  isReadyTimeCompatible,
  filterByReadyTimeCompatibility,
  calculateClusterDensity,
  getAverageReadyTime,
  getReadyTimeSpread,
  groupOrdersByDeliveryZones,
  extractZoneFromAddress,
  prioritizeDenseClusters,
  preallocateOrdersToRoutes,
  estimateMaxRoutes,
  enhancedCandidateEvaluationV2,
  calculateOrderPriorityV2,
  rebalanceRoutesV3,
  globalRouteOptimization,
  groupOrdersByReadyTimeWindows,
  prefilterCandidatesByDistance,
  type Order,
  type RouteForRebalancing,
  type RebalanceContext,
  type GlobalOptimizationContext
} from '../utils/routeOptimizationHelpers'
import {
  type CourierSchedule,
  type RouteAssignment,
  VEHICLE_LIMITS,
  assignRouteToCourier,
  filterRoutesByCourierType,
  createDefaultSchedule,
  parseCourierScheduleFromExcel,
} from '../utils/courierSchedule'
import { routeHistory, type RouteHistoryEntry } from '../utils/routeHistory'
import {
  exportToGoogleMaps,
  exportToWaze,
  exportToPDF
} from '../utils/routeExport'
import { calculateRouteAnalytics, type RouteAnalytics } from '../utils/routeAnalytics'
import {
  calculateRouteEfficiencyMetrics,
  suggestRouteImprovements,
  type RouteEfficiencyMetrics
} from '../utils/routeEfficiency'
import { Tooltip } from '../components/Tooltip'
import { googleApiCache } from '../services/googleApiCache'
import { lazy, Suspense } from 'react'
import type { TourStep } from '../components/HelpTour'

// Ленивая загрузка тяжелых компонентов
const HelpModal = lazy(() => import('../components/HelpModal').then(m => ({ default: m.HelpModal })))
const HelpTour = lazy(() => import('../components/HelpTour').then(m => ({ default: m.HelpTour })))
const TrafficHeatmap = lazy(() => import('../components/TrafficHeatmap').then(m => ({ default: m.TrafficHeatmap })))
const WorkloadHeatmap = lazy(() => import('../components/WorkloadHeatmap').then(m => ({ default: m.WorkloadHeatmap })))
const RouteDetailsTabs = lazy(() => import('../components/RouteDetailsTabs').then(m => ({ default: m.RouteDetailsTabs })))

interface TrafficSnapshot {
  timestamp: number
  stats: {
    avgSpeed: number
    medianSpeed?: number
    rawAvgSpeed?: number
    coverageKm?: number
    reliabilityScore?: number
    slowSharePercent?: number
    pressureScore?: number
    totalDelay: number
    criticalCount: number
    highCount: number
    mediumCount: number
    lowCount: number
    totalSegments: number
    topCriticalSegments: Array<{
      key?: string
      congestion: number
      speed: number
      distance: number
      severity?: 'low' | 'medium' | 'high' | 'critical'
      start?: [number, number]
      end?: [number, number]
      coordinates?: Array<[number, number]>
    }>
  }
  severitySummary: {
    critical: number
    high: number
    medium: number
    low: number
  }
  sampleSegments: Array<{
    start: [number, number]
    end: [number, number]
    congestion: number
    speed: number
    severity: 'low' | 'medium' | 'high' | 'critical'
  }>
}

type TrafficPresetMode = 'free' | 'busy' | 'gridlock'

interface TrafficPresetInfo {
  mode: TrafficPresetMode
  note: string
  bufferMinutes: number
  groupingMultiplier: number
  recommendedMaxStops: number
  maxRouteDurationCap: number
  maxDistanceCap: number
  reliability: number
  slowSharePercent: number
}

interface TrafficPlanImpact {
  totalDelay: number
  criticalRoutes: number
  avgSegmentSpeed: number
  slowestRoute?: string
  presetMode: TrafficPresetMode
  bufferMinutes: number
}

const TRAFFIC_MODE_OVERRIDE_KEY = 'km_traffic_mode_override'
const PLANNED_ROUTES_STORAGE_KEY = 'km_planned_routes'
const FILE_NAME_STORAGE_KEY = 'km_file_name'
const SETTINGS_STORAGE_KEY = 'km_planner_settings'
const DIRECTION_INITIAL_TOLERANCE = 70 // градусы допуска, пока маршрут формируется (ужесточено)
const DIRECTION_LOCKED_TOLERANCE = 40 // строгий допуск после фиксации направления (ужесточено)
const DIRECTION_ENFORCE_AFTER_STOPS = 2 // после скольких точек фиксируем направление
const DIRECTION_BUCKET_SIZE = 60 // ширина корзины направлений
const DIRECTION_BUCKET_SLACK = 1 // сколько соседних корзин можно затрагивать на старте

interface RouteDirectionTracker {
  base: Coordinates | null
  bearings: number[]
  primary: number | null
}

const toRadians = (deg: number) => (deg * Math.PI) / 180
const toDegrees = (rad: number) => (rad * 180) / Math.PI
const normalizeAngle = (angle: number) => {
  const normalized = angle % 360
  return normalized < 0 ? normalized + 360 : normalized
}

const bearingBetween = (from: Coordinates | null, to: Coordinates | null): number | null => {
  if (!from || !to) return null
  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(to.lat)
  const dLon = toRadians(to.lng - from.lng)
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  if (x === 0 && y === 0) return null
  return normalizeAngle(toDegrees(Math.atan2(y, x)))
}

const circularAverage = (bearings: number[]): number | null => {
  if (bearings.length === 0) return null
  let sumSin = 0
  let sumCos = 0
  for (const bearing of bearings) {
    const rad = toRadians(bearing)
    sumSin += Math.sin(rad)
    sumCos += Math.cos(rad)
  }
  if (sumSin === 0 && sumCos === 0) return null
  return normalizeAngle(toDegrees(Math.atan2(sumSin, sumCos)))
}

const angularDifference = (a: number, b: number) => {
  const diff = Math.abs(a - b) % 360
  return diff > 180 ? 360 - diff : diff
}

const totalDirectionBuckets = Math.max(1, Math.floor(360 / DIRECTION_BUCKET_SIZE))
const bucketFromBearing = (bearing: number | null): number | null => {
  if (bearing === null || Number.isNaN(bearing)) return null
  const normalized = normalizeAngle(bearing)
  return Math.floor(normalized / DIRECTION_BUCKET_SIZE) % totalDirectionBuckets
}

const bucketDifference = (a: number, b: number): number => {
  const diff = Math.abs(a - b) % totalDirectionBuckets
  return Math.min(diff, totalDirectionBuckets - diff)
}

const updateDirectionTracker = (tracker: RouteDirectionTracker, bearing: number | null) => {
  if (bearing === null) return
  tracker.bearings.push(bearing)
  tracker.primary = circularAverage(tracker.bearings) ?? bearing
}

const isDirectionCompatible = (
  tracker: RouteDirectionTracker,
  candidateBearing: number | null,
  currentStops: number
) => {
  if (!tracker.base || tracker.primary === null || candidateBearing === null) return true
  if (currentStops < DIRECTION_ENFORCE_AFTER_STOPS) return true
  const tolerance = currentStops >= DIRECTION_ENFORCE_AFTER_STOPS + 1
    ? DIRECTION_LOCKED_TOLERANCE
    : DIRECTION_INITIAL_TOLERANCE
  return angularDifference(tracker.primary, candidateBearing) <= tolerance
}

const isBucketCompatible = (
  routeBucket: number | null,
  candidateBucket: number | null,
  currentStops: number
) => {
  if (routeBucket === null || candidateBucket === null) return true
  const allowedSpread = currentStops < DIRECTION_ENFORCE_AFTER_STOPS ? DIRECTION_BUCKET_SLACK : 0
  return bucketDifference(routeBucket, candidateBucket) <= allowedSpread
}

const presetTemplate = (
  mode: TrafficPresetMode,
  defaults: { maxStops: number; maxDuration: number; maxDistance: number }
) => {
  if (mode === 'gridlock') {
    return {
      mode,
      bufferMinutes: 12,
      groupingMultiplier: 0.65,
      recommendedMaxStops: Math.max(2, Math.min(defaults.maxStops, 3)),
      maxRouteDurationCap: Math.min(defaults.maxDuration, 150),
      maxDistanceCap: Math.min(defaults.maxDistance, 80)
    }
  }
  if (mode === 'busy') {
    return {
      mode,
      bufferMinutes: 8,
      groupingMultiplier: 0.8,
      recommendedMaxStops: Math.max(3, Math.min(defaults.maxStops, 4)),
      maxRouteDurationCap: Math.min(defaults.maxDuration, 165),
      maxDistanceCap: Math.min(defaults.maxDistance, 100)
    }
  }
  return {
    mode: 'free' as TrafficPresetMode,
    bufferMinutes: 5,
    groupingMultiplier: 1,
    recommendedMaxStops: defaults.maxStops,
    maxRouteDurationCap: defaults.maxDuration,
    maxDistanceCap: defaults.maxDistance
  }
}

const deriveTrafficPreset = (
  snapshot: TrafficSnapshot | null,
  defaults: { maxStops: number; maxDuration: number; maxDistance: number },
  override: TrafficPresetMode | 'auto' = 'auto'
): TrafficPresetInfo => {
  const baseReliability = snapshot?.stats.reliabilityScore ?? 0
  const baseSlowShare = snapshot?.stats.slowSharePercent ?? 0

  const getAutoMode = (): TrafficPresetMode => {
    if (!snapshot) return 'free'
    const avgSpeed = snapshot.stats.avgSpeed
    const slowShare = snapshot.stats.slowSharePercent ?? 0
    const highCongestion = snapshot.stats.highCount >= 6 || snapshot.stats.criticalCount >= 4
    if (avgSpeed < 18 || snapshot.stats.criticalCount >= 6 || slowShare >= 55) return 'gridlock'
    if (avgSpeed < 28 || slowShare >= 35 || highCongestion) return 'busy'
    return 'free'
  }

  const mode = override === 'auto' ? getAutoMode() : override
  const template = presetTemplate(mode, defaults)
  const note = override !== 'auto'
    ? 'Режим выбран вручную: применяются фиксированные лимиты.'
    : !snapshot
      ? 'Нет свежих данных о трафике — используем базовые лимиты.'
      : mode === 'gridlock'
        ? 'Город стоит: сокращаем маршруты, добавляем запас времени и держим курьеров в зонах.'
        : mode === 'busy'
          ? 'Плотный трафик: сокращаем связки и добавляем небольшой буфер.'
          : 'Движение умеренное: можно использовать стандартные лимиты.'

  return {
    ...template,
    note,
    reliability: baseReliability,
    slowSharePercent: baseSlowShare
  }
}

// Компонент для визуализации маршрута на карте
const RouteMap: React.FC<{ route: any; onMarkerClick?: (order: any) => void }> = ({ route, onMarkerClick }) => {
  const { isDark } = useTheme()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const directionsRendererRef = useRef<any>(null)
  const markersRef = useRef<any[]>([]) // Храним маркеры для очистки
  const [isMapReady, setIsMapReady] = useState(false)

  useEffect(() => {
    // Очищаем предыдущие маркеры
    markersRef.current.forEach(marker => marker.setMap(null))
    markersRef.current = []
    if (!mapRef.current || !route) return

    const initMap = async () => {
      try {
        await googleMapsLoader.load()
        const gmaps = (window as any).google?.maps
        if (!gmaps) return

        // Создаём карту
        const map = new gmaps.Map(mapRef.current!, {
          zoom: 12,
          center: { lat: 50.4501, lng: 30.5234 }, // Киев по умолчанию
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
        })

        mapInstanceRef.current = map

        // Создаём рендерер маршрутов БЕЗ стандартных маркеров для старта и финиша
        // Создадим кастомные маркеры только для заказов
        const directionsRenderer = new gmaps.DirectionsRenderer({
          map,
          suppressMarkers: true, // Отключаем стандартные маркеры A, B, C, D, E
          polylineOptions: {
            strokeColor: '#2563eb', // Яркий синий для лучшей видимости
            strokeWeight: 5, // Толще для четкости
            strokeOpacity: 0.9,
          },
          preserveViewport: true, // Не изменяем вид при обновлении маршрута
        })
        directionsRendererRef.current = directionsRenderer

        // Получаем координаты точек для построения маршрута
        const geocoder = new gmaps.Geocoder()
        const city = localStorageUtils.getAllSettings().cityBias || 'Киев'
        const cityAppend = `, ${city}, Украина`

        const geocodeAddress = (address: string): Promise<any> => {
          return new Promise((resolve) => {
            geocoder.geocode(
              {
                address: address.includes(city) ? address : `${address}${cityAppend}`,
                region: 'ua',
              },
              (results: any, status: any) => {
                if (status === 'OK' && results && results.length > 0) {
                  resolve(results[0].geometry.location)
                } else {
                  resolve(null)
                }
              }
            )
          })
        }

        // Собираем только заказы (без старта и финиша)
        const orderAddresses = route.routeChain || route.waypoints?.map((w: any) => w.address) || []
        
        // Сначала пробуем использовать координаты из routeChainFull (если они были сохранены при планировании)
        // Это гарантирует использование тех же координат, что и при расчете расстояний
        const getOrderCoordinates = async (order: any, address: string): Promise<any> => {
          // Если у заказа есть сохраненные координаты, используем их
          if (order?.coords && order.coords.lat && order.coords.lng) {
            return new gmaps.LatLng(order.coords.lat, order.coords.lng)
          }
          
          // Иначе используем кэш координат из routeOptimizationCache
          const cached = routeOptimizationCache.getCoordinates(address)
          if (cached) {
            return new gmaps.LatLng(cached.lat, cached.lng)
          }
          
          // Если нет в кэше, геокодируем
          const loc = await geocodeAddress(address)
          return loc ? new gmaps.LatLng(loc.lat(), loc.lng()) : null
        }
        
        // Для построения маршрута нужны старт и финиш
        const fullAddresses = [
          route.startAddress,
          ...orderAddresses,
          route.endAddress
        ].filter(Boolean)

        if (fullAddresses.length > 0 && orderAddresses.length > 0) {
          // Получаем координаты для всех точек
          // Используем routeChainFull для получения правильных координат заказов
          const allLocations = []
          
          // Стартовый адрес
          const startLoc = await geocodeAddress(route.startAddress)
          if (startLoc) allLocations.push(new gmaps.LatLng(startLoc.lat(), startLoc.lng()))
          
          // Координаты заказов - используем routeChainFull с сохраненными координатами
          const routeChainFull = route.routeChainFull || []
          for (let i = 0; i < orderAddresses.length; i++) {
            const address = orderAddresses[i]
            const fullOrder = routeChainFull[i]
            const loc = await getOrderCoordinates(fullOrder, address)
            if (loc) allLocations.push(loc)
          }
          
          // Конечный адрес
          const endLoc = await geocodeAddress(route.endAddress)
          if (endLoc) allLocations.push(new gmaps.LatLng(endLoc.lat(), endLoc.lng()))
          
          if (allLocations.length >= 2) {
            // Устанавливаем центр карты на первый заказ
            if (allLocations.length > 1) {
              map.setCenter(allLocations[1]) // первый заказ после старта
            }
            
            // Создаём маршрут через DirectionsService (со стартом и финишем)
            const directionsService = new gmaps.DirectionsService()
            const origin = allLocations[0] // стартовый адрес
            const destination = allLocations[allLocations.length - 1] // конечный адрес
            const waypoints = allLocations.slice(1, -1).map((loc: any) => ({
              location: loc,
              stopover: true,
            }))

            directionsService.route(
              {
                origin,
                destination,
                waypoints: waypoints.length > 0 ? waypoints : undefined,
                travelMode: gmaps.TravelMode.DRIVING,
                optimizeWaypoints: false, // Сохраняем порядок
                unitSystem: gmaps.UnitSystem.METRIC,
              },
              (result: any, status: any) => {
                if (status === 'OK' && result) {
                  directionsRenderer.setDirections(result)
                  
                  // Создаём кастомные маркеры только для заказов (A, B, C, D, E)
                  // НЕ создаём маркеры для старта и финиша
                  const routeData = result.routes[0]
                  const legs = routeData.legs || []
                  
                  // Структура legs: [start->order1, order1->order2, ..., orderN->end]
                  // Для waypoints: waypoint[0] = первый заказ (должен быть в end_location legs[0])
                  //                waypoint[1] = второй заказ (должен быть в end_location legs[1])
                  //                и т.д.
                  
                  // Используем routeChainFull для правильного сопоставления заказов с маркерами
                  const routeChainFull = route.routeChainFull || []
                  
                  // Создаем маркеры для всех заказов из routeChain (не только из orderNumbers)
                  const actualOrderCount = route.routeChain?.length || routeChainFull.length || orderAddresses.length
                  
                  for (let idx = 0; idx < actualOrderCount && idx < legs.length; idx++) {
                    const leg = legs[idx]
                    // Используем координаты из legs (они были вычислены Directions API с нашими координатами)
                    const endLocation = leg.end_location
                    
                    // Получаем данные заказа из routeChainFull
                    const fullOrder = routeChainFull[idx]
                    const orderAddress = orderAddresses[idx] || route.routeChain?.[idx] || ''
                    
                    // Нормальные круглые маркеры с номерами заказов
                    const orderNum = fullOrder?.orderNumber || route.orderNumbers?.[idx] || String(idx + 1)
                    const markerLabel = String(idx + 1) // 1, 2, 3 вместо A, B, C
                      
                      const marker = new gmaps.Marker({
                        position: endLocation,
                        map,
                        label: {
                          text: markerLabel,
                          color: '#ffffff',
                          fontSize: '14px',
                          fontWeight: 'bold',
                        },
                        icon: {
                          path: gmaps.SymbolPath.CIRCLE,
                          scale: 12,
                          fillColor: '#3b82f6',
                          fillOpacity: 1,
                          strokeColor: '#ffffff',
                          strokeWeight: 3,
                          labelOrigin: new gmaps.Point(0, 0),
                        },
                        title: `Заказ ${orderNum}: ${orderAddress}`,
                        zIndex: gmaps.Marker.MAX_ZINDEX + idx,
                      })
                      
                      // Добавляем обработчик клика на маркер для показа информации о заказе
                      if (onMarkerClick && fullOrder) {
                        marker.addListener('click', () => {
                          // Убеждаемся, что передаем полные данные с raw и временем
                          const orderData = {
                            ...fullOrder,
                            // Убеждаемся, что raw содержит все исходные данные
                            raw: fullOrder.raw || fullOrder,
                            // Передаем readyAt и deadlineAt, если они уже вычислены
                            readyAt: fullOrder.readyAt,
                            deadlineAt: fullOrder.deadlineAt,
                            // Также сохраняем исходные значения
                            readyAtSource: fullOrder.readyAtSource,
                            deadlineAtSource: fullOrder.deadlineAtSource,
                            // Сохраняем координаты, если есть
                            coords: fullOrder.coords,
                          }
                          onMarkerClick(orderData)
                        })
                      }
                      
                      markersRef.current.push(marker)
                  }
                  
                  // Подгоняем границы карты под маршрут с отступом (только при первой загрузке)
                  if (!isMapReady) {
                    const bounds = routeData.bounds
                    if (bounds) {
                      map.fitBounds(bounds, {
                        top: 50,
                        right: 50,
                        bottom: 50,
                        left: 50,
                      })
                    }
                  }
                  
                  setIsMapReady(true)
                }
              }
            )
          } else if (allLocations.length === 3 && orderAddresses.length === 1) {
            // Если только один заказ, показываем маршрут от старта до заказа до финиша
            map.setCenter(allLocations[1]) // центр на заказе
            map.setZoom(13)
            setIsMapReady(true)
          }
        }
      } catch (error) {
        console.error('Ошибка инициализации карты:', error)
      }
    }

    initMap()

    return () => {
      // Очищаем маркеры при размонтировании
      markersRef.current.forEach(marker => marker.setMap(null))
      markersRef.current = []
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null)
      }
    }
  }, [route])

  return (
    <div className="mt-4" onClick={(e) => e.stopPropagation()}>
      <div className={clsx('text-xs font-medium mb-2', isDark ? 'text-gray-200' : 'text-gray-700')}>
        Визуализация маршрута:
      </div>
      <div
        ref={mapRef}
        className="w-full h-64 rounded-lg border overflow-hidden"
        style={{ minHeight: '256px' }}
        onClick={(e) => e.stopPropagation()} // Предотвращаем всплытие кликов с карты
      />
      {!isMapReady && (
        <div className={clsx('text-xs mt-2', isDark ? 'text-gray-400' : 'text-gray-500')}>
          Загрузка карты...
        </div>
      )}
    </div>
  )
}

export const AutoPlanner: React.FC = () => {
  const { isDark } = useTheme()
  const [excelData, setExcelData] = useState<ProcessedExcelData | null>(null)
  const [fileName, setFileName] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<any>(null) // Выбранный заказ для модального окна
  const [isProcessing, setIsProcessing] = useState(false)
  const [isPlanning, setIsPlanning] = useState(false)
  const [plannedRoutes, setPlannedRoutes] = useState<any[]>([])
  const [excludedOutsideSector, setExcludedOutsideSector] = useState<number>(0)
  const [maxRouteDurationMin, setMaxRouteDurationMin] = useState<number>(180)
  const [maxRouteDistanceKm, setMaxRouteDistanceKm] = useState<number>(120)
  const [maxWaitPerStopMin, setMaxWaitPerStopMin] = useState<number>(15)
  const [maxStopsPerRoute, setMaxStopsPerRoute] = useState<number>(4)
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [selectedRoute, setSelectedRoute] = useState<any>(null)
  
  // Настройки объединения заказов
  const [enableOrderCombining, setEnableOrderCombining] = useState<boolean>(true)
  const [combineMaxDistanceMeters, setCombineMaxDistanceMeters] = useState<number>(500)
  const [combineMaxTimeWindowMinutes, setCombineMaxTimeWindowMinutes] = useState<number>(30)
  
  // Настройки уведомлений
  const [enableNotifications, setEnableNotifications] = useState<boolean>(true)
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
    enableWarnings: true,
    enableTrafficWarnings: true
  })
  const [routeNotifications, setRouteNotifications] = useState<Map<string, Notification[]>>(new Map())
  
  // Данные о секторе и настройках трафика
  const [sectorPathState, setSectorPathState] = useState<Array<{ lat: number; lng: number }> | null>(null)
  const [sectorCityName, setSectorCityName] = useState<string>('')
  const [mapboxTokenState, setMapboxTokenState] = useState<string | undefined>(undefined)
  const [trafficSnapshot, setTrafficSnapshot] = useState<TrafficSnapshot | null>(null)
  const trafficSnapshotRef = useRef<TrafficSnapshot | null>(null)
  const sectorStorageKey = useMemo(() => sectorCityName?.toLowerCase().replace(/\s+/g, '_') || 'default', [sectorCityName])
  const trafficSnapshotStorageKey = useMemo(() => `km_traffic_snapshot_${sectorStorageKey}`, [sectorStorageKey])
  const [trafficModeOverride, setTrafficModeOverride] = useState<'auto' | TrafficPresetMode>('auto')
  const [lastPlanPreset, setLastPlanPreset] = useState<TrafficPresetInfo | null>(null)
  const [planTrafficImpact, setPlanTrafficImpact] = useState<TrafficPlanImpact | null>(null)

  // Состояния для системы помощи
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [showHelpTour, setShowHelpTour] = useState(false)
  const [hasSeenHelp, setHasSeenHelp] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('km_has_seen_help') === 'true'
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

  const trafficPreset = useMemo(() => deriveTrafficPreset(
    trafficSnapshot,
    {
      maxStops: maxStopsPerRoute,
      maxDuration: maxRouteDurationMin,
      maxDistance: maxRouteDistanceKm
    },
    trafficModeOverride
  ), [trafficSnapshot, maxStopsPerRoute, maxRouteDurationMin, maxRouteDistanceKm, trafficModeOverride])

  // Восстановление состояния при загрузке страницы
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    // Восстанавливаем режим трафика
    const stored = localStorage.getItem(TRAFFIC_MODE_OVERRIDE_KEY)
    if (stored === 'auto' || stored === 'free' || stored === 'busy' || stored === 'gridlock') {
      setTrafficModeOverride(stored)
    }
    
    // Загружаем историю при инициализации
    setRouteHistoryEntries(routeHistory.getAll())
    
        // Восстанавливаем спланированные маршруты
        try {
          const savedRoutes = localStorage.getItem(PLANNED_ROUTES_STORAGE_KEY)
          if (savedRoutes) {
            const routes = JSON.parse(savedRoutes)
            // Проверяем, что данные не слишком старые (не старше 24 часов)
            const routesTimestamp = localStorage.getItem(`${PLANNED_ROUTES_STORAGE_KEY}_timestamp`)
            if (routesTimestamp) {
              const age = Date.now() - parseInt(routesTimestamp, 10)
              if (age < 24 * 60 * 60 * 1000) { // 24 часа
                setPlannedRoutes(routes)
                // Восстанавливаем аналитику для восстановленных маршрутов
                if (routes.length > 0) {
                  const analytics = calculateRouteAnalytics(routes)
                  setRouteAnalytics(analytics)
                }
                console.log(`✅ Восстановлено ${routes.length} маршрутов из сохранения`)
              } else {
                // Удаляем устаревшие данные
                localStorage.removeItem(PLANNED_ROUTES_STORAGE_KEY)
                localStorage.removeItem(`${PLANNED_ROUTES_STORAGE_KEY}_timestamp`)
              }
            } else {
              setPlannedRoutes(routes)
              // Восстанавливаем аналитику и метрики эффективности для восстановленных маршрутов
              if (routes.length > 0) {
                const analytics = calculateRouteAnalytics(routes)
                setRouteAnalytics(analytics)
                const efficiencyMetrics = calculateRouteEfficiencyMetrics(routes)
                setRouteEfficiencyMetrics(efficiencyMetrics)
                const suggestions = suggestRouteImprovements(efficiencyMetrics)
                setEfficiencySuggestions(suggestions)
              }
              console.log(`✅ Восстановлено ${routes.length} маршрутов из сохранения`)
            }
          }
        } catch (error) {
          console.error('Ошибка при восстановлении маршрутов:', error)
        }
    
    // Восстанавливаем настройки планирования
    try {
      const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY)
      if (savedSettings) {
        const settings = JSON.parse(savedSettings)
        if (settings.maxRouteDurationMin) setMaxRouteDurationMin(settings.maxRouteDurationMin)
        if (settings.maxRouteDistanceKm) setMaxRouteDistanceKm(settings.maxRouteDistanceKm)
        if (settings.maxStopsPerRoute) setMaxStopsPerRoute(settings.maxStopsPerRoute)
        if (settings.maxWaitPerStopMin) setMaxWaitPerStopMin(settings.maxWaitPerStopMin)
        if (settings.enableOrderCombining !== undefined) setEnableOrderCombining(settings.enableOrderCombining)
        if (settings.combineMaxDistanceMeters) setCombineMaxDistanceMeters(settings.combineMaxDistanceMeters)
        if (settings.combineMaxTimeWindowMinutes) setCombineMaxTimeWindowMinutes(settings.combineMaxTimeWindowMinutes)
        console.log('✅ Восстановлены настройки планирования')
      }
    } catch (error) {
      console.error('Ошибка при восстановлении настроек:', error)
    }
    
    // Восстанавливаем имя файла
    try {
      const savedFileName = localStorage.getItem(FILE_NAME_STORAGE_KEY)
      if (savedFileName) {
        setFileName(savedFileName)
      }
    } catch (error) {
      console.error('Ошибка при восстановлении имени файла:', error)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(TRAFFIC_MODE_OVERRIDE_KEY, trafficModeOverride)
  }, [trafficModeOverride])
  
  // Сохранение спланированных маршрутов
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (plannedRoutes.length > 0) {
      try {
        localStorage.setItem(PLANNED_ROUTES_STORAGE_KEY, JSON.stringify(plannedRoutes))
        localStorage.setItem(`${PLANNED_ROUTES_STORAGE_KEY}_timestamp`, Date.now().toString())
        console.log(`💾 Сохранено ${plannedRoutes.length} маршрутов`)
      } catch (error) {
        console.error('Ошибка при сохранении маршрутов:', error)
      }
    } else {
      // Удаляем сохранение если маршрутов нет
      localStorage.removeItem(PLANNED_ROUTES_STORAGE_KEY)
      localStorage.removeItem(`${PLANNED_ROUTES_STORAGE_KEY}_timestamp`)
    }
  }, [plannedRoutes])
  
  // Сохранение настроек планирования
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const settings = {
        maxRouteDurationMin,
        maxRouteDistanceKm,
        maxStopsPerRoute,
        maxWaitPerStopMin,
        enableOrderCombining,
        combineMaxDistanceMeters,
        combineMaxTimeWindowMinutes
      }
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
    } catch (error) {
      console.error('Ошибка при сохранении настроек:', error)
    }
  }, [maxRouteDurationMin, maxRouteDistanceKm, maxStopsPerRoute, maxWaitPerStopMin, enableOrderCombining, combineMaxDistanceMeters, combineMaxTimeWindowMinutes])
  
  // Сохранение имени файла
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (fileName) {
      localStorage.setItem(FILE_NAME_STORAGE_KEY, fileName)
    } else {
      localStorage.removeItem(FILE_NAME_STORAGE_KEY)
    }
  }, [fileName])

  const syncSectorSettings = useCallback(() => {
    const settings = localStorageUtils.getAllSettings()
    const city = (settings.cityBias || '') as '' | 'Киев' | 'Харьков' | 'Полтава' | 'Одесса'
    setSectorCityName(city || '')

    if (
      city &&
      settings.citySectors &&
      settings.citySectors[city] &&
      Array.isArray(settings.citySectors[city]) &&
      settings.citySectors[city].length > 0
    ) {
      setSectorPathState(settings.citySectors[city])
      console.log(`✅ Синхронизирован сектор для города ${city}: ${settings.citySectors[city].length} точек`)
    } else {
      setSectorPathState(null)
    }

    if (settings.mapboxToken && settings.mapboxToken.trim()) {
      setMapboxTokenState(settings.mapboxToken.trim())
    } else {
      setMapboxTokenState(undefined)
    }
  }, [])
  
  // Настройки расширенной оптимизации (автоматически включены)
  const [enableCoverageAnalysis, _setEnableCoverageAnalysis] = useState<boolean>(false)
  const [enableWorkloadHeatmap, _setEnableWorkloadHeatmap] = useState<boolean>(false)
  const [coverageAnalysis, _setCoverageAnalysis] = useState<CoverageAnalysis | null>(null)
  const [workloadHeatmapData, setWorkloadHeatmapData] = useState<any[]>([])
  const [isTrafficHeatmapCollapsed, setIsTrafficHeatmapCollapsed] = useState<boolean>(true) // По умолчанию свернута
  const [isWorkloadHeatmapCollapsed, setIsWorkloadHeatmapCollapsed] = useState<boolean>(true) // По умолчанию свернута
  const [expandedRouteModal, setExpandedRouteModal] = useState<any>(null) // Для полноэкранного просмотра маршрута
  
  // Новые функции: история, аналитика, экспорт
  const [routeHistoryEntries, setRouteHistoryEntries] = useState<RouteHistoryEntry[]>([])
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false)
  const [showAnalyticsModal, setShowAnalyticsModal] = useState<boolean>(false)
  const [routeAnalytics, setRouteAnalytics] = useState<RouteAnalytics | null>(null)
  const [showExportMenu, setShowExportMenu] = useState<string | null>(null) // ID маршрута для экспорта
  const [routeEfficiencyMetrics, setRouteEfficiencyMetrics] = useState<RouteEfficiencyMetrics | null>(null)
  const [efficiencySuggestions, setEfficiencySuggestions] = useState<string[]>([])
  const trafficAdvisory = useMemo(() => {
    if (!trafficSnapshot) return null
    if (trafficPreset.mode === 'gridlock') return 'critical'
    if (trafficPreset.mode === 'busy') return 'high'
    return 'moderate'
  }, [trafficSnapshot, trafficPreset.mode])
  
  // Прогресс оптимизации
  const [optimizationProgress, setOptimizationProgress] = useState<{
    current: number
    total: number
    message: string
  } | null>(null)
  
  // Настройки построения маршрутов (только основные, остальные применяются автоматически)
  const [routePlanningSettings, setRoutePlanningSettings] = useState<{
    // Приоритеты заказов
    orderPriority: 'deliveryTime' | 'distance' | 'zone' | 'none' // Приоритет по времени доставки, расстоянию, зоне, или без приоритета
    prioritizeUrgent: boolean // Приоритет срочных заказов
    urgentThresholdMinutes: number // Порог для срочных заказов (минут до времени доставки)
    
    // Распределение нагрузки
    loadBalancing: 'equal' | 'byZone' | 'byDistance' | 'none' // Равномерное, по зонам, по расстоянию, или без балансировки
    maxOrdersPerCourier: number | null // Максимум заказов на курьера
    minOrdersPerRoute: number // Минимум заказов в маршруте
    
    // Группировка заказов
    groupingStrategy: 'proximity' | 'zone' | 'timeWindow' | 'paymentMethod' | 'none' // По близости, зоне, временному окну, способу оплаты, или без группировки
    proximityGroupingRadius: number // Радиус группировки по близости (метры)
    timeWindowGroupingMinutes: number // Окно времени для группировки (минуты)
    
    // Оптимизация маршрута
    optimizationGoal: 'distance' | 'time' | 'balance' | 'turns' // Минимум расстояния, времени, баланс, минимум поворотов
    avoidTraffic: boolean // Избегать пробок
    preferMainRoads: boolean // Предпочитать главные дороги
    
    // Дополнительные настройки
    minRouteEfficiency: number // Минимальная эффективность маршрута (0-1)
    allowRouteSplitting: boolean // Разрешить разделение длинных маршрутов
    preferSingleZoneRoutes: boolean // Предпочитать маршруты в одной зоне
    maxReadyTimeDifferenceMinutes: number // Максимальная разница во времени готовности между заказами в одном маршруте (минуты)
    maxDistanceBetweenOrdersKm: number | null // Максимальное расстояние между соседними заказами в одном маршруте (км). null = без ограничения
  }>({
    orderPriority: 'none',
    prioritizeUrgent: true,
    urgentThresholdMinutes: 30,
    loadBalancing: 'equal',
    maxOrdersPerCourier: null,
    minOrdersPerRoute: 1,
    groupingStrategy: 'proximity',
    proximityGroupingRadius: 1000,
    timeWindowGroupingMinutes: 60,
    optimizationGoal: 'balance',
    avoidTraffic: true,
    preferMainRoads: false,
    minRouteEfficiency: 0.5,
    allowRouteSplitting: true,
    preferSingleZoneRoutes: true,
    maxReadyTimeDifferenceMinutes: 10, // Максимальная разница во времени готовности (10 минут по умолчанию)
    maxDistanceBetweenOrdersKm: 15 // Максимум 15 км между соседними заказами по умолчанию
  })
  
  // Настройки курьеров и графика работы
  const [courierSchedules, setCourierSchedules] = useState<CourierSchedule[]>([])
  const [selectedCourierType, setSelectedCourierType] = useState<'car' | 'motorcycle' | 'all'>('all')
  const [enableScheduleFiltering, setEnableScheduleFiltering] = useState<boolean>(false)
  const [showScheduleModal, setShowScheduleModal] = useState<boolean>(false)
  const [editingSchedule, setEditingSchedule] = useState<CourierSchedule | null>(null)
  
  // Фильтры заказов
  const [orderFilters, setOrderFilters] = useState<{
    enabled: boolean
    paymentMethods: string[] // Список способов оплаты для фильтрации
    deliveryZones: string[] // Список зон доставки
    statuses: string[] // Статусы заказов
    orderTypes: string[] // Типы заказов
    excludeCompleted: boolean // Исключить исполненные
    timeRange: { start: string | null; end: string | null } // Временной диапазон доставки
  }>({
    enabled: false,
    paymentMethods: [],
    deliveryZones: [],
    statuses: [],
    orderTypes: [],
    excludeCompleted: true,
    timeRange: { start: null, end: null }
  })
  const [isFiltersExpanded, setIsFiltersExpanded] = useState<boolean>(false)
  const [isRouteSettingsExpanded, setIsRouteSettingsExpanded] = useState<boolean>(false)

  const ordersCount = useMemo(() => excelData?.orders?.length ?? 0, [excelData])
  
  // Получаем уникальные значения для фильтров из загруженных заказов
  const availableFilters = useMemo(() => {
    if (!excelData?.orders || excelData.orders.length === 0) {
      return {
        paymentMethods: [],
        deliveryZones: [],
        statuses: [],
        orderTypes: []
      }
    }
    
    const paymentMethods = new Set<string>()
    const deliveryZones = new Set<string>()
    const statuses = new Set<string>()
    const orderTypes = new Set<string>()
    
    excelData.orders.forEach((order: any) => {
      if (order.paymentMethod) paymentMethods.add(String(order.paymentMethod).trim())
      if (order.deliveryZone) deliveryZones.add(String(order.deliveryZone).trim())
      if (order.status) statuses.add(String(order.status).trim())
      if (order.orderType) orderTypes.add(String(order.orderType).trim())
    })
    
    return {
      paymentMethods: Array.from(paymentMethods).sort(),
      deliveryZones: Array.from(deliveryZones).sort(),
      statuses: Array.from(statuses).sort(),
      orderTypes: Array.from(orderTypes).sort()
    }
  }, [excelData])
  
  // Применяем фильтры к заказам
  const filteredOrders = useMemo(() => {
    if (!excelData?.orders || !orderFilters.enabled) {
      return excelData?.orders || []
    }
    
    return excelData.orders.filter((order: any) => {
      // Фильтр по способу оплаты
      if (orderFilters.paymentMethods.length > 0) {
        const orderPayment = String(order.paymentMethod || '').trim()
        if (!orderFilters.paymentMethods.some(pm => orderPayment.toLowerCase().includes(pm.toLowerCase()))) {
          return false
        }
      }
      
      // Фильтр по зоне доставки
      if (orderFilters.deliveryZones.length > 0) {
        const orderZone = String(order.deliveryZone || '').trim()
        if (!orderFilters.deliveryZones.some(zone => orderZone.toLowerCase().includes(zone.toLowerCase()))) {
          return false
        }
      }
      
      // Фильтр по статусу
      if (orderFilters.statuses.length > 0) {
        const orderStatus = String(order.status || '').trim()
        if (!orderFilters.statuses.some(status => orderStatus.toLowerCase().includes(status.toLowerCase()))) {
          return false
        }
      }
      
      // Фильтр по типу заказа
      if (orderFilters.orderTypes.length > 0) {
        const orderType = String(order.orderType || '').trim()
        if (!orderFilters.orderTypes.some(ot => orderType.toLowerCase().includes(ot.toLowerCase()))) {
          return false
        }
      }
      
      // Исключить исполненные
      if (orderFilters.excludeCompleted) {
        const status = String(order.status || '').toLowerCase()
        if (status.includes('исполнен') || status.includes('доставлен') || status.includes('выполнен') || status === 'completed') {
          return false
        }
      }
      
      // Фильтр по времени доставки
      if (orderFilters.timeRange.start || orderFilters.timeRange.end) {
        const deliveryTime = order.deliveryTime || order.timeDelivery || ''
        if (deliveryTime) {
          // Простая проверка времени (можно улучшить)
          const timeStr = String(deliveryTime).trim()
          if (orderFilters.timeRange.start && timeStr < orderFilters.timeRange.start) {
            return false
          }
          if (orderFilters.timeRange.end && timeStr > orderFilters.timeRange.end) {
            return false
          }
        }
      }
      
      return true
    })
  }, [excelData, orderFilters])

  const planButtonLabel = useMemo(() => {
    const base = `Автосоздать маршруты${orderFilters.enabled ? ` (${filteredOrders.length} заказов)` : ''}`
    if (!trafficSnapshot) return base
    if (trafficAdvisory === 'critical') return `${base} · критический трафик`
    if (trafficAdvisory === 'high') return `${base} · высокий трафик`
    return base
  }, [filteredOrders.length, orderFilters.enabled, trafficSnapshot, trafficAdvisory])

  // Загружаем сектор и Mapbox токен из настроек при монтировании компонента
  useEffect(() => {
    syncSectorSettings()
  }, [syncSectorSettings])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const loadSnapshot = () => {
      try {
        const stored = localStorage.getItem(trafficSnapshotStorageKey)
        if (stored) {
          const parsed = JSON.parse(stored) as TrafficSnapshot
          setTrafficSnapshot(parsed)
          trafficSnapshotRef.current = parsed
        } else {
          setTrafficSnapshot(null)
          trafficSnapshotRef.current = null
        }
      } catch (err) {
        console.warn('Не удалось загрузить снимок трафика', err)
        setTrafficSnapshot(null)
        trafficSnapshotRef.current = null
      }
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === trafficSnapshotStorageKey) {
        loadSnapshot()
      }
    }

    const handleCustom = (event: Event) => {
      const detailKey = (event as CustomEvent<{ key?: string }>).detail?.key
      if (!detailKey || detailKey === trafficSnapshotStorageKey) {
        loadSnapshot()
      }
    }

    loadSnapshot()
    window.addEventListener('storage', handleStorage)
    window.addEventListener('km-traffic-snapshot-updated', handleCustom as EventListener)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('km-traffic-snapshot-updated', handleCustom as EventListener)
    }
  }, [trafficSnapshotStorageKey])

  useEffect(() => {
    const handleSettingsUpdated = (_event?: Event) => {
      syncSectorSettings()
    }
    const handleStorage = (event: StorageEvent) => {
      if (!event.key) return
      if (['km_settings', 'km_city_sectors', 'km_mapbox_token', 'km_city_bias'].includes(event.key)) {
        syncSectorSettings()
      }
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncSectorSettings()
      }
    }

    window.addEventListener('km-settings-updated', handleSettingsUpdated)
    window.addEventListener('storage', handleStorage)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('km-settings-updated', handleSettingsUpdated)
      window.removeEventListener('storage', handleStorage)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [syncSectorSettings])
  
  // Инициализация графика курьеров из localStorage или создание по умолчанию
  useEffect(() => {
    try {
      const savedSchedules = localStorage.getItem('courier_schedules')
      if (savedSchedules) {
        const parsed = JSON.parse(savedSchedules) as CourierSchedule[]
        setCourierSchedules(parsed)
        console.log(`✅ Загружено ${parsed.length} графиков курьеров из localStorage`)
      } else {
        // Создаем примеры графиков по умолчанию (можно будет настроить в UI)
        console.log('📝 Графики курьеров не найдены, будут созданы при необходимости')
      }
    } catch (error) {
      console.error('Ошибка загрузки графиков курьеров:', error)
    }
  }, [])
  
  // Сохранение графиков курьеров в localStorage
  useEffect(() => {
    if (courierSchedules.length > 0) {
      try {
        localStorage.setItem('courier_schedules', JSON.stringify(courierSchedules))
        console.log(`💾 Сохранено ${courierSchedules.length} графиков курьеров`)
      } catch (error) {
        console.error('Ошибка сохранения графиков курьеров:', error)
      }
    }
  }, [courierSchedules])

  const handleFile = useCallback(async (file: File) => {
    setIsProcessing(true)
    try {
      const data = await processExcelFile(file)
      setExcelData(data)
      setFileName(file.name)
      
      // Пытаемся автоматически распарсить график курьеров из Excel
      try {
        const fileReader = new FileReader()
        fileReader.onload = async (e) => {
          try {
            const arrayBuffer = e.target?.result as ArrayBuffer
            if (arrayBuffer) {
              // Динамический импорт XLSX только когда нужно
              const XLSX = await import('xlsx')
              const workbook = XLSX.read(arrayBuffer, { type: 'array' })
              const firstSheetName = workbook.SheetNames[0]
              const worksheet = workbook.Sheets[firstSheetName]
              const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]
              
              // Парсим график курьеров
              const parsedSchedules = parseCourierScheduleFromExcel(jsonData)
              if (parsedSchedules.length > 0) {
                setCourierSchedules(parsedSchedules)
                console.log(`✅ Автоматически загружено ${parsedSchedules.length} графиков курьеров из Excel`)
                // Показываем уведомление только если графиков больше 0
                if (parsedSchedules.length > 0) {
                  setTimeout(() => {
                    alert(`✅ Автоматически загружено ${parsedSchedules.length} графиков курьеров из Excel файла`)
                  }, 500)
                }
              }
            }
          } catch (error) {
            console.warn('⚠️ Не удалось автоматически распарсить график курьеров:', error)
          }
        }
        fileReader.readAsArrayBuffer(file)
      } catch (error) {
        console.warn('⚠️ Ошибка при попытке парсинга графика курьеров:', error)
      }
    } catch (e) {
      console.error('Excel parse error', e)
      alert('Ошибка чтения Excel файла')
    } finally {
      setIsProcessing(false)
    }
  }, [])

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) void handleFile(f)
  }, [handleFile])

  const planRoutes = useCallback(async () => {
    if (!excelData || (excelData.orders?.length ?? 0) === 0) {
      alert('Сначала загрузите заказы из Excel')
      return
    }
    
    // Используем отфильтрованные заказы, если фильтры включены
    const ordersToUse = orderFilters.enabled ? filteredOrders : (excelData.orders || [])
    setIsPlanning(true)
    setErrorMsg('')
    setPlannedRoutes([])
    setExcludedOutsideSector(0)
    setPlanTrafficImpact(null)
    setLastPlanPreset(null)
    
    try {
      const planningStartTime = Date.now()
      console.log('🚀 Начало автопланирования...')
      
      // Quick check for API key to avoid silent failure
      if (!localStorageUtils.hasApiKey()) {
        const msg = 'Нет Google Maps API ключа. Добавьте ключ в Настройках и попробуйте снова.'
        setErrorMsg(msg)
        console.error('❌', msg)
        setIsPlanning(false)
        return
      }
      
      console.log('✅ API ключ найден, загружаем Google Maps...')
      const mapsLoadStart = Date.now()
      await googleMapsLoader.load()
      console.log(`⏱️ Google Maps загружен за ${((Date.now() - mapsLoadStart) / 1000).toFixed(1)}с`)
      
      const gmaps: any = (window as any).google?.maps
      if (!gmaps) {
        const msg = 'Google Maps не инициализирован. Попробуйте обновить страницу.'
        console.error('❌', msg)
        throw new Error(msg)
      }
      console.log('✅ Google Maps загружен')

      const settings = localStorageUtils.getAllSettings()
      const city = (settings.cityBias || '') as '' | 'Киев' | 'Харьков' | 'Полтава' | 'Одесса'
      const cityAppend = city ? `, ${city}, Украина` : ', Украина'
      const region = 'UA'
      
      // Получаем начальный и конечный адреса из настроек
      const defaultStartAddress = settings.defaultStartAddress || 'Макеевская 7, Киев, Украина'
      const defaultEndAddress = settings.defaultEndAddress || 'Макеевская 7, Киев, Украина'
      
      console.log(`📍 Начальный адрес: ${defaultStartAddress}`)
      console.log(`📍 Конечный адрес: ${defaultEndAddress}`)
      
      // Очистка адреса от лишней информации
      const cleanAddress = (address: string) => {
        if (!address) return address
        return address
          .replace(/,\s*(под\.|подъезд|д\/ф|эт|этаж|эт\.|под|кв|квартира|оф|офис).*$/i, '')
          .replace(/,\s*\d+\s*(под\.|подъезд|д\/ф|эт|этаж|эт\.|под|кв|квартира|оф|офис).*$/i, '')
          .trim()
      }
      
      const normalizeAddr = (a: string) => {
        const base = cleanAddress(a).trim()
        if (!base) return base
        const lower = base.toLowerCase()
        const hasCity = city && lower.includes(city.toLowerCase())
        const hasCountry = lower.includes('украина') || lower.includes('україна') || lower.includes('ukraine')
        if (!hasCity && !hasCountry) return `${base}${cityAppend}`
        if (!hasCountry) return `${base}, Украина`
        return base
      }

      const now = Date.now()
      let orders = ordersToUse.map((o: any) => ({ ...o }))
      
      console.log(`📊 Всего заказов: ${excelData.orders?.length || 0}, после фильтрации: ${orders.length}`)
      
      // Автоматически применяем оптимальные настройки (скрытые от пользователя)
      // Эти настройки оптимизированы для лучших результатов
      const optimizedSettings = {
        ...routePlanningSettings,
        // Приоритеты: всегда приоритизируем срочные заказы
        prioritizeUrgent: true,
        urgentThresholdMinutes: 30,
        // Группировка: всегда по близости для лучшей оптимизации
        groupingStrategy: 'proximity' as const,
        proximityGroupingRadius: 1000,
        // Балансировка: отключена
        loadBalancing: 'none' as const,
        // Оптимизация: используем настройки из routePlanningSettings (avoidTraffic, preferSingleZoneRoutes)
        avoidTraffic: routePlanningSettings.avoidTraffic,
        preferSingleZoneRoutes: true,
        // Ограничения: используем настройки из routePlanningSettings
        maxReadyTimeDifferenceMinutes: routePlanningSettings.maxReadyTimeDifferenceMinutes,
        maxDistanceBetweenOrdersKm: 15,
        minRouteEfficiency: 0.5,
      }
      
      // Применяем оптимизированные настройки
      const activeTrafficSnapshot = trafficSnapshotRef.current
      const runtimePreset = deriveTrafficPreset(activeTrafficSnapshot, {
        maxStops: maxStopsPerRoute,
        maxDuration: maxRouteDurationMin,
        maxDistance: maxRouteDistanceKm
      }, trafficModeOverride)
      setLastPlanPreset(runtimePreset)
      const runtimeMaxStopsPerRoute = runtimePreset.recommendedMaxStops
      const runtimeMaxRouteDurationMin = runtimePreset.maxRouteDurationCap
      const runtimeMaxRouteDistanceKm = runtimePreset.maxDistanceCap
      const runtimeTrafficBufferMinutes = runtimePreset.bufferMinutes

      optimizedSettings.proximityGroupingRadius = Math.max(
        400,
        Math.round(routePlanningSettings.proximityGroupingRadius * runtimePreset.groupingMultiplier)
      )

      if (activeTrafficSnapshot) {
        const criticalShare = activeTrafficSnapshot.stats.totalSegments > 0
          ? activeTrafficSnapshot.stats.criticalCount / activeTrafficSnapshot.stats.totalSegments
          : 0
        optimizedSettings.avoidTraffic = true
        if (runtimePreset.mode !== 'free') {
          optimizedSettings.preferSingleZoneRoutes = true
          optimizedSettings.maxDistanceBetweenOrdersKm = Math.max(
            6,
            Math.min(optimizedSettings.maxDistanceBetweenOrdersKm ?? 15, runtimePreset.mode === 'gridlock' ? 8 : 12)
          )
        }
        if (criticalShare >= 0.2 || runtimePreset.mode !== 'free') {
          optimizedSettings.proximityGroupingRadius = Math.max(500, Math.round(optimizedSettings.proximityGroupingRadius * runtimePreset.groupingMultiplier))
        }
        if (runtimePreset.mode === 'gridlock') {
          optimizedSettings.urgentThresholdMinutes = Math.max(optimizedSettings.urgentThresholdMinutes, 45)
        } else if (runtimePreset.mode === 'busy') {
          optimizedSettings.urgentThresholdMinutes = Math.max(optimizedSettings.urgentThresholdMinutes, 35)
        }
        console.log('📶 Трафик учтён при планировании:', {
          avgSpeed: activeTrafficSnapshot.stats.avgSpeed,
          critical: activeTrafficSnapshot.stats.criticalCount,
          mode: runtimePreset.mode,
          limits: {
            maxStops: runtimeMaxStopsPerRoute,
            maxDurationMin: runtimeMaxRouteDurationMin,
            maxDistanceKm: runtimeMaxRouteDistanceKm,
            bufferMin: runtimeTrafficBufferMinutes
          }
        })
      } else {
        console.log('ℹ️ Трафик: нет актуального снимка, используются базовые лимиты.')
      }
      
      // 1. Приоритизация заказов (всегда включена с приоритетом срочных)
      if (optimizedSettings.prioritizeUrgent) {
        console.log(`🔄 Приоритизация заказов: срочные заказы в приоритете`)
        orders = [...orders].sort((a, b) => {
          // Сначала срочные заказы
          const aTime = a.deliveryTime || a.timeDelivery || ''
          const bTime = b.deliveryTime || b.timeDelivery || ''
          const now = new Date()
          const aUrgent = aTime && isUrgentOrder(aTime, optimizedSettings.urgentThresholdMinutes, now)
          const bUrgent = bTime && isUrgentOrder(bTime, optimizedSettings.urgentThresholdMinutes, now)
          if (aUrgent && !bUrgent) return -1
          if (!aUrgent && bUrgent) return 1
          
          // Затем по готовности и дедлайну (автоматически)
          const aReadyAt = a.readyAtSource || a.readyAt || null
          const bReadyAt = b.readyAtSource || b.readyAt || null
          if (aReadyAt && bReadyAt) {
            const nowMs = Date.now()
            const aReady = aReadyAt <= nowMs
            const bReady = bReadyAt <= nowMs
            if (aReady && !bReady) return -1
            if (!aReady && bReady) return 1
            if (aReadyAt !== bReadyAt) return aReadyAt - bReadyAt
          }
          
          // Затем по дедлайну
          if (a.deadlineAt && b.deadlineAt) {
            return a.deadlineAt - b.deadlineAt
          }
          
          switch (optimizedSettings.orderPriority) {
            case 'deliveryTime':
              const aTime = a.deliveryTime || a.timeDelivery || ''
              const bTime = b.deliveryTime || b.timeDelivery || ''
              return aTime.localeCompare(bTime)
            case 'distance':
              // Сортируем по расстоянию от базового адреса (если есть координаты)
              return 0 // TODO: реализовать при наличии координат
            case 'zone':
              const aZone = String(a.deliveryZone || '').trim()
              const bZone = String(b.deliveryZone || '').trim()
              return aZone.localeCompare(bZone)
            default:
              return 0
          }
        })
      }
      
      // Вспомогательная функция для определения срочных заказов
      function isUrgentOrder(deliveryTime: string, thresholdMinutes: number, now: Date): boolean {
        try {
          const [hours, minutes] = deliveryTime.split(':').map(Number)
          const deliveryDate = new Date(now)
          deliveryDate.setHours(hours, minutes, 0, 0)
          const diffMs = deliveryDate.getTime() - now.getTime()
          const diffMinutes = diffMs / (1000 * 60)
          return diffMinutes > 0 && diffMinutes <= thresholdMinutes
        } catch {
          return false
        }
      }
      
      // 2. Группировка заказов (всегда по близости для оптимальной оптимизации)
      // Группировка по близости будет выполнена позже при создании маршрутов через findClusters
      console.log(`🔗 Группировка заказов: по близости (радиус: ${optimizedSettings.proximityGroupingRadius}м)`)
      
      console.log(`✅ Применены оптимизированные настройки: приоритет срочных заказов, группировка=${optimizedSettings.groupingStrategy}, балансировка=${optimizedSettings.loadBalancing}, избегание пробок=${optimizedSettings.avoidTraffic}`)

      // Build sector polygon and bounds if available
      let sectorPolygon: any = null
      let sectorBounds: any = null
      const sectorPath = city && settings.citySectors && settings.citySectors[city]
        ? settings.citySectors[city]
        : null
      if (sectorPath && window.google?.maps?.Polygon) {
        sectorPolygon = new window.google.maps.Polygon({ paths: sectorPath })
        // Создаём bounds для bias при геокодировании
        if (sectorPath.length >= 3) {
          const b = new window.google.maps.LatLngBounds()
          sectorPath.forEach((pt: any) => b.extend(new window.google.maps.LatLng(pt.lat, pt.lng)))
          sectorBounds = b
        }
        // Сохраняем путь сектора для тепловой карты
        setSectorPathState(sectorPath)
      } else {
        setSectorPathState(null)
      }

      // Генерируем альтернативные варианты записи улицы
      const generateStreetVariants = (raw: string): string[] => {
        const base = normalizeAddr(raw)
        const variants = new Set<string>()
        variants.add(base)
        
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
          try { variants.add(base.replace(from, to)) } catch {}
        })
        
        // Нормализация номера линии
        const lineForms = [
          base.replace(/\b(\d+)-(а|я)\b/iu, '$1$2'),
          base.replace(/\b(\d+)\s*(а|я)\b/iu, '$1-$2'),
          base.replace(/\b(\d+)-?(а|я)\b/iu, '$1'),
          base.replace(/\bперша\b/iu, '1-а'),
          base.replace(/\bпервая\b/iu, '1-я')
        ]
        lineForms.forEach(v => variants.add(v))
        
        // Если "1 лінія" без префикса типа улицы — добавим префиксы
        if (/\b(лінія|линия)\b/iu.test(base) && !/\b(вулиця|вул\.|улица|ул\.)\b/iu.test(base)) {
          variants.add(`вулиця ${base}`)
          variants.add(`вул. ${base}`)
          variants.add(`улица ${base}`)
          variants.add(`ул. ${base}`)
        }
        
        return Array.from(variants).filter(v => v && v !== base)
      }

      // Получаем центр сектора для использования как hintPoint
      const getSectorCenter = (): any => {
        if (!sectorPath || sectorPath.length === 0) return null
        let latSum = 0
        let lngSum = 0
        for (const pt of sectorPath) {
          latSum += pt.lat
          lngSum += pt.lng
        }
        return new window.google.maps.LatLng(latSum / sectorPath.length, lngSum / sectorPath.length)
      }

      // Helper: check address is inside sector polygon with improved geocoding
      const isInsideSector = async (addr: string): Promise<boolean> => {
        if (!sectorPolygon) return true
        
        const address = normalizeAddr(addr)
        
        // Базовый запрос без address для переиспользования
        const baseRequest: any = {
          region,
          componentRestrictions: { country: 'ua' }
        }
        if (sectorBounds) baseRequest.bounds = sectorBounds

        const geocodeAddress = async (addrToGeocode: string) => {
          return await googleApiCache.geocode({ ...baseRequest, address: addrToGeocode })
        }

        const geocodeLocation = async (loc: any) => {
          return await googleApiCache.geocode({ location: loc })
        }

        let results: any = await geocodeAddress(address)
        
        if (!results || results.length === 0) results = []
        
        // Проверяем, есть ли кандидаты внутри сектора
        let inside = results.filter((r: any) => {
          try {
            return window.google.maps.geometry.poly.containsLocation(r.geometry.location, sectorPolygon)
          } catch {
            return false
          }
        })
        
        // Если нет кандидатов внутри — пробуем альтернативные формы улицы
        if (inside.length === 0) {
          const alts = generateStreetVariants(addr)
          for (const alt of alts) {
            // eslint-disable-next-line no-await-in-loop
            const altRes: any = await geocodeAddress(alt)
            if (altRes && altRes.length > 0) {
              const insideAlt = altRes.filter((r: any) => {
                try {
                  return window.google.maps.geometry.poly.containsLocation(r.geometry.location, sectorPolygon)
                } catch {
                  return false
                }
              })
              if (insideAlt.length > 0) {
                inside = insideAlt
                break
              }
            }
          }
        }
        
        // Если всё ещё нет — пробуем reverse geocoding для получения sublocality
        if (inside.length === 0) {
          const sectorCenter = getSectorCenter()
          if (sectorCenter) {
            // Получаем sublocality из центра сектора
            const rev: any = await geocodeLocation(sectorCenter)
            if (rev && rev.length > 0) {
              const sub = (() => {
                for (const r of rev) {
                  const comp = (r.address_components || []).find((c: any) => 
                    c.types?.includes('sublocality') || 
                    c.types?.includes('neighborhood') ||
                    c.types?.includes('sublocality_level_1')
                  )
                  if (comp?.long_name) return comp.long_name
                }
                return null
              })()
              
              if (sub) {
                // Пробуем адрес с sublocality
                const withSub = `${address}, ${sub}`
                const subRes: any = await geocodeAddress(withSub)
                if (subRes && subRes.length > 0) {
                  const insideSub = subRes.filter((r: any) => {
                    try {
                      return window.google.maps.geometry.poly.containsLocation(r.geometry.location, sectorPolygon)
                    } catch {
                      return false
                    }
                  })
                  if (insideSub.length > 0) {
                    inside = insideSub
                  }
                }
              }
            }
          }
        }
        
        // Если всё ещё нет — пробуем упрощенный адрес (без подъездов, этажей, квартир)
        if (inside.length === 0) {
          // Убираем детали типа "под.1", "эт.25", "кв.289", "д/ф моб"
          const simplifiedAddr = address
            .replace(/под\.?\s*\d+/gi, '')
            .replace(/эт\.?\s*\d+/gi, '')
            .replace(/кв\.?\s*\d+/gi, '')
            .replace(/д\/ф\s*\S*/gi, '')
            .replace(/,{2,}/g, ',')
            .replace(/\s+/g, ' ')
            .trim()
          
          if (simplifiedAddr !== address && simplifiedAddr.length > 10) {
            const simpleRes: any = await geocodeAddress(simplifiedAddr)
            if (simpleRes && simpleRes.length > 0) {
              const insideSimple = simpleRes.filter((r: any) => {
                try {
                  return window.google.maps.geometry.poly.containsLocation(r.geometry.location, sectorPolygon)
                } catch {
                  return false
                }
              })
              if (insideSimple.length > 0) {
                console.log(`✅ Адрес найден внутри сектора (упрощенный): "${addr}" → "${simplifiedAddr}"`)
                inside = insideSimple
              }
            }
          }
        }
        
        // Если всё ещё нет — пробуем поиск по только улице и номеру дома
        if (inside.length === 0) {
          // Извлекаем только улицу и номер дома
          const streetMatch = address.match(/((?:вул|вулиця|улица|ул|проспект|просп|провулок|пров|бульвар|бул|площа|площадь|пл)[^,]*,\s*\d+[а-я]?)/i)
          if (streetMatch && streetMatch[1]) {
            const streetOnly = `${streetMatch[1]}, Київ`
            const streetRes: any = await geocodeAddress(streetOnly)
            if (streetRes && streetRes.length > 0) {
              const insideStreet = streetRes.filter((r: any) => {
                try {
                  return window.google.maps.geometry.poly.containsLocation(r.geometry.location, sectorPolygon)
                } catch {
                  return false
                }
              })
              if (insideStreet.length > 0) {
                console.log(`✅ Адрес найден внутри сектора (только улица): "${addr}" → "${streetOnly}"`)
                inside = insideStreet
              }
            }
          }
        }
        
        // Если всё ещё нет — проверяем все результаты геокодирования, возможно они просто не попали в bounds
        if (inside.length === 0 && results.length > 0) {
          // Пробуем геокодировать без bounds, чтобы получить все возможные варианты
          const noBoundsRes: any = await geocodeAddress(address)
          if (noBoundsRes && noBoundsRes.length > 0) {
            const insideNoBounds = noBoundsRes.filter((r: any) => {
              try {
                return window.google.maps.geometry.poly.containsLocation(r.geometry.location, sectorPolygon)
              } catch {
                return false
              }
            })
            if (insideNoBounds.length > 0) {
              console.log(`✅ Адрес найден внутри сектора (без bounds): "${addr}"`)
              inside = insideNoBounds
            }
          }
        }
        
        // Если всё ещё нет — возвращаем false
        if (inside.length === 0) {
          console.warn(`❌ Адрес не найден внутри сектора: "${addr}" → "${address}"`)
          // Показываем первый результат геокодирования для отладки
          if (results.length > 0) {
            console.warn(`   Первый результат геокодирования:`, results[0].formatted_address, results[0].geometry.location.toJSON())
          }
          return false
        }
        
        // Возвращаем true если есть хотя бы один кандидат внутри сектора
        console.log(`✅ Адрес найден внутри сектора: "${addr}"`)
        return true
      }

      // Helpers: parse times
      const parseTime = (val: any): number | null => {
        if (!val && val !== 0) return null
        const s = String(val).trim()
        if (!s) return null
        
        // Обрабатываем некорректные значения Excel (##########)
        // Обычно это означает, что Excel не может отобразить значение (например, отрицательная дата)
        // Пробуем найти исходное числовое значение в raw данных или конвертируем как Excel serial date
        // Но в нашем случае, если есть "##########", это значит значение не было правильно извлечено из Excel
        // Пока что игнорируем такие значения, но можем попытаться восстановить из числового представления
        if (s.includes('#')) {
          // Если это только символы #, возможно, есть числовое представление в других полях
          // Но для простоты пока возвращаем null
          // TODO: Можно попытаться найти исходное числовое значение из Excel
          return null
        }
        
        // Пропускаем значения, которые выглядят как длительность (например, "35мин.")
        const strVal = s.toLowerCase()
        if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour')) {
          return null
        }
        
        // Формат DD.MM.YYYY HH:MM:SS или DD.MM.YYYY HH:MM (например, "10.10.2025 11:02:21")
        const dotDateTimeMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/i)
        if (dotDateTimeMatch) {
          const day = parseInt(dotDateTimeMatch[1], 10)
          const month = parseInt(dotDateTimeMatch[2], 10)
          const year = parseInt(dotDateTimeMatch[3], 10)
          let hour = parseInt(dotDateTimeMatch[4], 10)
          const minute = parseInt(dotDateTimeMatch[5], 10)
          const second = dotDateTimeMatch[6] ? parseInt(dotDateTimeMatch[6], 10) : 0
          
          const date = new Date(year, month - 1, day, hour, minute, second)
          if (!isNaN(date.getTime())) {
            return date.getTime()
          }
        }
        
        // Формат Excel дата+время: "2/11/25 13:06" или "M/d/yy HH:mm" (месяц/день/год)
        // ИЛИ "29/10/25 13:30" или "DD/MM/YY HH:mm" (день/месяц/год) - когда день > 12
        const excelDateTimeMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i)
        if (excelDateTimeMatch) {
          let first = parseInt(excelDateTimeMatch[1], 10)
          let secondNum = parseInt(excelDateTimeMatch[2], 10)
          let year = parseInt(excelDateTimeMatch[3], 10)
          let hour = parseInt(excelDateTimeMatch[4], 10)
          const minute = parseInt(excelDateTimeMatch[5], 10)
          const timeSecond = excelDateTimeMatch[6] ? parseInt(excelDateTimeMatch[6], 10) : 0
          const ampm = excelDateTimeMatch[7]
          
          // Определяем формат: если первое число > 12, это DD/MM/YY (день/месяц/год)
          // Иначе это M/d/yy (месяц/день/год)
          let month, day
          if (first > 12) {
            // Формат DD/MM/YY (день/месяц/год) - например, "29/10/25"
            day = first
            month = secondNum
          } else if (secondNum > 12) {
            // Формат M/d/yy (месяц/день/год) - например, "2/11/25"
            month = first
            day = secondNum
          } else {
            // Неоднозначный случай: оба числа <= 12
            // По умолчанию считаем M/d/yy (месяц/день) - стандартный формат Excel
            month = first
            day = secondNum
          }
          
          // Корректируем год для 2-значного формата
          if (year < 100) {
            year += year < 50 ? 2000 : 1900
          }
          
          // Корректируем час для AM/PM
          if (ampm) {
            if (ampm.toUpperCase() === 'PM' && hour !== 12) {
              hour += 12
            } else if (ampm.toUpperCase() === 'AM' && hour === 12) {
              hour = 0
            }
          }
          
          // Валидация даты
          if (month < 1 || month > 12 || day < 1 || day > 31) {
            return null
          }
          
          const date = new Date(year, month - 1, day, hour, minute, timeSecond)
          if (!isNaN(date.getTime())) {
            return date.getTime()
          }
        }
        
        // Формат только время с секундами: "HH:mm:ss AM/PM" или "HH:mm:ss" (например, "11:48:17", "10:32:21 AM", "13:00:00")
        // ВАЖНО: Этот формат используется для столбца "время на кухню"
        const timeOnlyMatch = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i)
        if (timeOnlyMatch) {
          let hour = parseInt(timeOnlyMatch[1], 10)
          const minute = parseInt(timeOnlyMatch[2], 10)
          const second = timeOnlyMatch[3] ? parseInt(timeOnlyMatch[3], 10) : 0
          const ampm = timeOnlyMatch[4]
          
          // Корректируем час для AM/PM
          if (ampm) {
            if (ampm.toUpperCase() === 'PM' && hour !== 12) {
              hour += 12
            } else if (ampm.toUpperCase() === 'AM' && hour === 12) {
              hour = 0
            }
          }
          
          // Валидация времени
          if (hour < 0 || hour >= 24 || minute < 0 || minute >= 60 || second < 0 || second >= 60) {
            return null
          }
          
          const base = new Date()
          base.setHours(hour, minute, second, 0)
          return base.getTime()
        }
        
        // Формат HH:mm (простой)
        const simpleTimeMatch = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
        if (simpleTimeMatch) {
          const base = new Date()
          base.setHours(parseInt(simpleTimeMatch[1], 10), parseInt(simpleTimeMatch[2], 10), 0, 0)
          return base.getTime()
        }
        
        // Попытка распарсить как Date (для ISO форматов и других стандартных)
        const d = new Date(s)
        if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
          // Проверяем что год разумный (не 1970)
          return d.getTime()
        }
        
        return null
      }
      const getKitchenTime = (o: any): number | null => {
        // ПРИОРИТЕТ 1: Проверяем готовые вычисленные значения
        if (o.readyAtSource !== undefined && o.readyAtSource !== null && typeof o.readyAtSource === 'number') {
          return o.readyAtSource
        }
        
        // ПРИОРИТЕТ 2: Проверяем основные поля объекта (kitchenTime из excelProcessor)
        const directFields = ['kitchenTime', 'kitchen_time', 'KitchenTime', 'KITCHEN_TIME', 'время на кухню']
        for (const field of directFields) {
          const value = o[field]
          if (value !== undefined && value !== null && String(value).trim() !== '') {
            const strVal = String(value).trim().toLowerCase()
            // Пропускаем длительности
            if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour')) {
              continue
            }
            console.log(`🔍 [getKitchenTime] Проверяю o.${field}: "${value}"`)
            const parsed = parseTime(value)
            if (parsed) {
              console.log(`✅ Найдено время на кухню в o.${field}: ${value} → ${new Date(parsed).toLocaleString()}`)
              return parsed
            } else {
              console.log(`❌ [getKitchenTime] o.${field} = "${value}" не распознано как время`)
            }
          }
        }
        
        // ПРИОРИТЕТ 3: Проверяем столбец "время на кухню" - может быть отдельным столбцом или подстолбцом "Дата.время на кухню"
        // Из скриншота: столбец "Дата" (K3-N3) содержит подстолбец "время на кухню" (L4)
        // Формат значения: "13:00:00", "13:30:00", "20:12:24" (только время дня)
        // Excel serial time - это дробная часть дня (0.0 = 00:00:00, 0.5 = 12:00:00, 0.54167 = 13:00:00)
        // Может быть в формате времени (13:00:00) или как число (0.54167)
        // ВАЖНО: при экспорте Excel подстолбцы могут называться просто "время на кухню" (без префикса "Дата.")
        // ВАЖНО: НЕ используем столбец "создания" или "Дата" (который может содержать полную дату) - только "время на кухню"
        if (o.raw) {
          // ВАЖНО: Сначала ищем ПОДСТОЛБЦЫ из "Дата" (они имеют приоритет)
          // Затем ищем отдельный столбец "время на кухню"
          const kitchenTimeKeys = [
            // Подстолбцы из столбца "Дата" (ПРИОРИТЕТ):
            'Дата.время на кухню', 'дата.время на кухню', 'дата_время_на_кухню',
            'Дата.время_на_кухню', 'date.время на кухню', 'date.время_на_кухню',
            'date.kitchen_time', 'Дата время на кухню', 'дата время на кухню',
            // Отдельный столбец "время на кухню":
            'время на кухню', 'время_на_кухню', 'Время на кухню', 
            'kitchenTime', 'kitchen_time'
          ]
          
          // ВАЖНО: Исключаем столбцы, которые НЕ являются "время на кухню"
          const excludeKeys = [
            'создания', 'creation', 'дата', 'date', 'Дата', 'Date',
            'доставить к', 'доставить_к', 'deliver', 'плановое время', 'planned time'
          ]
          
          // Также ищем по всем ключам, которые содержат "время" и "кухню"
          const allRawKeys = Object.keys(o.raw)
          for (const key of allRawKeys) {
            const lowerKey = key.toLowerCase()
            
            // ВАЖНО: Пропускаем столбцы, которые НЕ являются "время на кухню"
            if (excludeKeys.some(exclude => lowerKey.includes(exclude.toLowerCase()) && 
                !lowerKey.includes('время на кухню') && !lowerKey.includes('kitchen'))) {
              continue
            }
            
            // Проверяем точные совпадения
            if (kitchenTimeKeys.some(k => lowerKey === k.toLowerCase())) {
              const value = o.raw[key]
              console.log(`🔍 [getKitchenTime] Проверяю столбец "${key}": значение = "${value}" (тип: ${typeof value})`)
              
              if (value !== undefined && value !== null && String(value).trim() !== '') {
                const strVal = String(value).trim()
                
                // Пропускаем длительности
                if (strVal.toLowerCase().includes('мин.') || strVal.toLowerCase().includes('час')) {
                  console.log(`⏭️ [getKitchenTime] Пропускаем "${key}" (${strVal}): содержит длительность`)
                  continue
                }
                
                // Пробуем парсить как время (например, "13:00:00")
                const timeMatch = strVal.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
                if (timeMatch) {
                  const hours = parseInt(timeMatch[1], 10)
                  const minutes = parseInt(timeMatch[2], 10)
                  const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0
                  if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
                    // ВАЖНО: Используем дату из "доставить к" или "плановое время", если она доступна
                    let targetDate = new Date()
                    if (o.raw) {
                      // Ищем дату в столбцах "доставить к" или "плановое время"
                      const dateKeys = ['доставить к', 'доставить_к', 'плановое время', 'плановое_время', 
                                       'Дата.доставить к', 'Дата.плановое время', 'plannedTime']
                      for (const dateKey of dateKeys) {
                        const dateValue = o.raw[dateKey]
                        if (dateValue !== undefined && dateValue !== null) {
                          const dateStr = String(dateValue).trim()
                          // Пробуем парсить как Excel serial date
                          const excelDate = typeof dateValue === 'number' ? dateValue : parseFloat(dateStr)
                          if (!isNaN(excelDate) && excelDate > 25569) {
                            // ВАЖНО: Используем правильную конвертацию Excel serial date
                            const utcDate = new Date((excelDate - 25569) * 86400 * 1000)
                            const year = utcDate.getUTCFullYear()
                            const month = utcDate.getUTCMonth()
                            const day = utcDate.getUTCDate()
                            targetDate = new Date(year, month, day, 0, 0, 0, 0)
                            if (!isNaN(targetDate.getTime()) && targetDate.getFullYear() > 2000) {
                              console.log(`📅 [getKitchenTime] Используем дату из "${dateKey}": ${targetDate.toLocaleDateString('ru-RU')}`)
                              break
                            }
                          } else {
                            // Пробуем парсить через parseTime
                            const parsed = parseTime(dateValue)
                            if (parsed) {
                              const parsedDate = new Date(parsed)
                              targetDate = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 0, 0, 0, 0)
                              console.log(`📅 [getKitchenTime] Используем дату из "${dateKey}": ${targetDate.toLocaleDateString('ru-RU')}`)
                              break
                            }
                          }
                        }
                      }
                    }
                    
                    targetDate.setHours(hours, minutes, seconds, 0)
                    const result = targetDate.getTime()
                    console.log(`✅ [getKitchenTime] Найдено время на кухню в столбце "${key}" (время ${strVal}): ${new Date(result).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`)
                    return result
                  }
                }
                
                // Пробуем парсить как Excel serial time (число от 0 до 1, или дробная часть от Excel serial date)
                const excelTime = typeof value === 'number' ? value : parseFloat(strVal)
                if (!isNaN(excelTime)) {
                  // Если это число от 0 до 1 - это время дня (Excel serial time)
                  if (excelTime >= 0 && excelTime < 1) {
                    // ВАЖНО: Используем более точный расчет для избежания ошибок округления
                    const totalMinutes = Math.round(excelTime * 24 * 60) // Общее количество минут в дне
                    const hours = Math.floor(totalMinutes / 60)
                    const minutes = totalMinutes % 60
                    const seconds = 0 // Для времени на кухню секунды не важны
                    
                    // ВАЖНО: Используем дату из "доставить к" или "плановое время", если она доступна
                    let targetDate = new Date()
                    if (o.raw) {
                      // Ищем дату в столбцах "доставить к" или "плановое время"
                      const dateKeys = ['доставить к', 'доставить_к', 'плановое время', 'плановое_время', 
                                       'Дата.доставить к', 'Дата.плановое время', 'plannedTime']
                      for (const dateKey of dateKeys) {
                        const dateValue = o.raw[dateKey]
                        if (dateValue !== undefined && dateValue !== null) {
                          const dateStr = String(dateValue).trim()
                          // Пробуем парсить как Excel serial date
                          const excelDate = typeof dateValue === 'number' ? dateValue : parseFloat(dateStr)
                          if (!isNaN(excelDate) && excelDate > 25569) {
                            // ВАЖНО: Используем правильную конвертацию Excel serial date
                            const utcDate = new Date((excelDate - 25569) * 86400 * 1000)
                            const year = utcDate.getUTCFullYear()
                            const month = utcDate.getUTCMonth()
                            const day = utcDate.getUTCDate()
                            targetDate = new Date(year, month, day, 0, 0, 0, 0)
                            if (!isNaN(targetDate.getTime()) && targetDate.getFullYear() > 2000) {
                              console.log(`📅 [getKitchenTime] Используем дату из "${dateKey}": ${targetDate.toLocaleDateString('ru-RU')}`)
                              break
                            }
                          } else {
                            // Пробуем парсить через parseTime
                            const parsed = parseTime(dateValue)
                            if (parsed) {
                              const parsedDate = new Date(parsed)
                              targetDate = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 0, 0, 0, 0)
                              console.log(`📅 [getKitchenTime] Используем дату из "${dateKey}": ${targetDate.toLocaleDateString('ru-RU')}`)
                              break
                            }
                          }
                        }
                      }
                    }
                    
                    targetDate.setHours(hours, minutes, seconds, 0)
                    const result = targetDate.getTime()
                    console.log(`✅ [getKitchenTime] Найдено время на кухню в столбце "${key}" (Excel serial time ${excelTime} = ${hours}:${minutes.toString().padStart(2, '0')}): ${new Date(result).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`)
                    return result
                  }
                  // Если это полный Excel serial date (> 25569) - извлекаем дату и время
                  else if (excelTime > 25569) {
                    // ВАЖНО: Excel serial date конвертируется в UTC, но нам нужно локальное время
                    const utcDate = new Date((excelTime - 25569) * 86400 * 1000)
                    
                    // Извлекаем компоненты даты и времени из UTC
                    const year = utcDate.getUTCFullYear()
                    const month = utcDate.getUTCMonth()
                    const day = utcDate.getUTCDate()
                    const hours = utcDate.getUTCHours()
                    const minutes = utcDate.getUTCMinutes()
                    const seconds = utcDate.getUTCSeconds()
                    
                    // Создаем локальную дату с теми же компонентами
                    const fullDate = new Date(year, month, day, hours, minutes, seconds, 0)
                    
                    if (!isNaN(fullDate.getTime()) && fullDate.getFullYear() > 2000) {
                      const result = fullDate.getTime()
                      console.log(`✅ [getKitchenTime] Найдено время на кухню в столбце "${key}" (Excel serial date ${excelTime}): ${fullDate.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`)
                      return result
                    }
                  }
                }
                
                // Пробуем парсить через parseTime (для форматов даты и времени)
                const parsed = parseTime(value)
                if (parsed) {
                  console.log(`✅ [getKitchenTime] Найдено время на кухню в столбце "${key}": ${strVal} → ${new Date(parsed).toLocaleString()}`)
                  return parsed
                }
              }
            }
          }
          
          // Дополнительный поиск: ключи, которые содержат "время" и "кухню" (или "kitchen")
          for (const key of allRawKeys) {
            const lowerKey = key.toLowerCase()
            if ((lowerKey.includes('время') && lowerKey.includes('кухню')) || 
                (lowerKey.includes('time') && lowerKey.includes('kitchen'))) {
              // Пропускаем, если это не из столбца "Дата" (уже проверили выше)
              if (kitchenTimeKeys.some(k => lowerKey === k.toLowerCase())) {
                continue
              }
              
              const value = o.raw[key]
              if (value !== undefined && value !== null && String(value).trim() !== '') {
                const strVal = String(value).trim()
                
                // Пропускаем длительности
                if (strVal.toLowerCase().includes('мин.') || strVal.toLowerCase().includes('час')) {
                  continue
                }
                
                // Пробуем парсить как время
                const timeMatch = strVal.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
                if (timeMatch) {
                  const hours = parseInt(timeMatch[1], 10)
                  const minutes = parseInt(timeMatch[2], 10)
                  const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0
                  if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
                    const today = new Date()
                    today.setHours(hours, minutes, seconds, 0)
                    const result = today.getTime()
                    console.log(`✅ [getKitchenTime] Найдено время на кухню в столбце "${key}" (поиск по ключевым словам): ${new Date(result).toLocaleString()}`)
                    return result
                  }
                }
                
                const parsed = parseTime(value)
                if (parsed) {
                  console.log(`✅ [getKitchenTime] Найдено время на кухню в столбце "${key}" (поиск по ключевым словам): ${new Date(parsed).toLocaleString()}`)
                  return parsed
                }
              }
            }
          }
        }
        
        // ПРИОРИТЕТ 4: Проверяем raw данные (они содержат оригинальные данные из Excel)
        // ВАЖНО: Проверяем ТОЧНОЕ название столбца из Excel "время на кухню"
        if (o.raw) {
          // Сначала проверяем точные совпадения
          const exactFields = [
            'время на кухню', 'время_на_кухню', 'Время на кухню', 'ВРЕМЯ НА КУХНЮ',
            'kitchenTime', 'kitchen_time', 'KitchenTime', 'KITCHEN_TIME',
            'время готовности', 'время_готовности', 'ready time', 'ready_time'
          ]
          for (const field of exactFields) {
            const value = o.raw[field]
            if (value !== undefined && value !== null && String(value).trim() !== '') {
              const strVal = String(value).trim().toLowerCase()
              if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour')) {
                continue
              }
              console.log(`🔍 [getKitchenTime] Проверяю raw.${field}: "${value}"`)
              const parsed = parseTime(value)
              if (parsed) {
                console.log(`✅ Найдено время на кухню в raw.${field}: ${value} → ${new Date(parsed).toLocaleString()}`)
                return parsed
              }
            }
          }
          
          // Затем проверяем ВСЕ ключи в raw, которые содержат "время", "кухню" или "kitchen"
          const allRawKeys = Object.keys(o.raw)
          for (const key of allRawKeys) {
            const lowerKey = key.toLowerCase().trim()
            const value = o.raw[key]
            
            // Ищем ключи, содержащие "время" И "кухню", или "kitchen" И "time"
            if (value !== undefined && value !== null && String(value).trim() !== '') {
              const strVal = String(value).trim().toLowerCase()
              // Пропускаем длительности
              if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour')) {
                continue
              }
              
              // Широкий поиск: любое поле, содержащее "кухню" и "время", или только "кухню" (но не "плановое")
              const hasKitchen = lowerKey.includes('кухню') || lowerKey.includes('kitchen')
              const hasTime = lowerKey.includes('время') || lowerKey.includes('time')
              const isNotPlanned = !lowerKey.includes('плановое') && !lowerKey.includes('planned')
              const isNotDelivery = !lowerKey.includes('доставить') && !lowerKey.includes('deliver')
              
              if (hasKitchen && isNotPlanned && isNotDelivery && (hasTime || lowerKey.includes('кухню'))) {
                console.log(`🔍 [getKitchenTime] Проверяю raw["${key}"]: "${value}"`)
                
                const parsed = parseTime(value)
                if (parsed) {
                  console.log(`✅ Найдено время на кухню в raw["${key}"]: ${value} → ${new Date(parsed).toLocaleString()}`)
                  return parsed
                } else {
                  console.log(`❌ [getKitchenTime] raw["${key}"] = "${value}" не распознано как время`)
                }
              }
            }
          }
          
          const rawExactFields = [
            'время на кухню', 'время_на_кухню', 'Время на кухню', 'Время_на_кухню', 'ВРЕМЯ НА КУХНЮ',
            'kitchen_time', 'kitchenTime', 'KitchenTime', 'KITCHEN_TIME',
            'kitchen', 'Kitchen', 'KITCHEN',
            'Kitchen Time', 'kitchen time', 'KITCHEN TIME',
            'Время готовности', 'время готовности', 'ВРЕМЯ ГОТОВНОСТИ',
            'Готовность', 'готовность', 'ГОТОВНОСТЬ',
            'kitchenTime' // Из excelProcessor
          ]
          
          for (const field of rawExactFields) {
            const value = o.raw[field]
            if (value !== undefined && value !== null && String(value).trim() !== '') {
              console.log(`🔍 [getKitchenTime] Проверяю raw.${field}: "${value}"`)
              const parsed = parseTime(value)
              if (parsed) {
                console.log(`✅ Найдено время на кухню в raw.${field}: ${value} → ${new Date(parsed).toLocaleString()}`)
                return parsed
              } else {
                console.log(`❌ [getKitchenTime] raw.${field} = "${value}" не распознано как время`)
              }
            }
          }
          
          // Дополнительно: регистронезависимый поиск по всем ключам raw
          const searchPhrases = [
            'время на кухню', 'время_на_кухню', 'времянакухню',
            'kitchen_time', 'kitchentime', 'kitchen time',
            'время готовности', 'время_готовности', 'времязаготовности',
            'готовность'
          ]
          
          for (const key in o.raw) {
            if (!o.raw.hasOwnProperty(key)) continue
            const lowerKey = key.toLowerCase().trim()
            
            for (const phrase of searchPhrases) {
              if (lowerKey === phrase || lowerKey.includes(phrase)) {
                const value = o.raw[key]
                if (value !== undefined && value !== null && String(value).trim() !== '') {
                  console.log(`🔍 [getKitchenTime] Проверяю raw[${key}]: "${value}"`)
                  const parsed = parseTime(value)
                  if (parsed) {
                    console.log(`✅ Найдено время на кухню в raw[${key}]: ${value} → ${new Date(parsed).toLocaleString()}`)
                    return parsed
                  } else {
                    console.log(`❌ [getKitchenTime] raw[${key}] = "${value}" не распознано как время`)
                  }
                }
              }
            }
          }
          
          // Поиск по ключам в raw
          const rawSearchPhrases = [
            'время на кухню', 'время_на_кухню', 'времянакухню',
            'kitchen_time', 'kitchentime', 'kitchen time',
            'время готовности', 'время_готовности', 'времязаготовности',
            'готовность'
          ]
          for (const key in o.raw) {
            const lowerKey = key.toLowerCase().trim()
            for (const phrase of rawSearchPhrases) {
              if (lowerKey === phrase || lowerKey.includes(phrase)) {
                const value = o.raw[key]
                if (value !== undefined && value !== null && String(value).trim() !== '') {
                  const parsed = parseTime(value)
                  if (parsed) {
                    console.log(`✅ Найдено время на кухню в raw.${key}: ${value} → ${new Date(parsed).toLocaleString()}`)
                    return parsed
                  }
                }
              }
            }
          }
        }
        
        // ПРИОРИТЕТ 3: Проверяем основные поля объекта
        const exactFields = [
          'время на кухню', 'время_на_кухню', 'Время на кухню', 'Время_на_кухню', 'ВРЕМЯ НА КУХНЮ',
          'kitchen_time', 'kitchenTime', 'KitchenTime', 'KITCHEN_TIME',
          'kitchen', 'Kitchen', 'KITCHEN',
          'Kitchen Time', 'kitchen time', 'KITCHEN TIME',
          'Время готовности', 'время готовности', 'ВРЕМЯ ГОТОВНОСТИ',
          'Готовность', 'готовность', 'ГОТОВНОСТЬ',
          'kitchenTime' // Из excelProcessor
        ]
        
        for (const field of exactFields) {
          const value = o[field]
          if (value !== undefined && value !== null && String(value).trim() !== '') {
            const parsed = parseTime(value)
            if (parsed) {
              console.log(`✅ Найдено время на кухню в поле "${field}": ${value} → ${new Date(parsed).toLocaleString()}`)
              return parsed
            }
          }
        }
        
        // ПРИОРИТЕТ 4: Поиск по ключам объекта
        const searchPhrases = [
          'время на кухню', 'время_на_кухню', 'времянакухню',
          'kitchen_time', 'kitchentime', 'kitchen time',
          'время готовности', 'время_готовности', 'времязаготовности',
          'готовность'
        ]
        for (const key in o) {
          if (key === 'raw') continue // Уже проверили
          const lowerKey = key.toLowerCase().trim()
          for (const phrase of searchPhrases) {
            if (lowerKey === phrase || lowerKey.includes(phrase)) {
              const value = o[key]
              if (value !== undefined && value !== null && String(value).trim() !== '') {
                const parsed = parseTime(value)
                if (parsed) {
                  console.log(`✅ Найдено время на кухню в поле "${key}": ${value} → ${new Date(parsed).toLocaleString()}`)
                  return parsed
                }
              }
            }
          }
        }
        
        // Логируем проблему с деталями (проверка "Дата" уже была выше)
        console.log(`⚠️ Время на кухню не найдено для заказа ${o.orderNumber || '?'}. Доступные ключи объекта:`, Object.keys(o).slice(0, 10))
        if (o.raw) {
          console.log(`📋 [getKitchenTime] ВСЕ ключи raw для заказа ${o.orderNumber || '?'}:`, Object.keys(o.raw))
          // Выводим ВСЕ значения, которые содержат "время", "кухню", "kitchen", "дата"
          const relevantKeys: string[] = []
          for (const key in o.raw) {
            const lowerKey = key.toLowerCase()
            if (lowerKey.includes('время') || lowerKey.includes('time') || 
                lowerKey.includes('кухню') || lowerKey.includes('kitchen') ||
                lowerKey.includes('дата') || lowerKey.includes('date')) {
              relevantKeys.push(key)
              console.log(`   raw["${key}"] = "${o.raw[key]}" (тип: ${typeof o.raw[key]})`)
            }
          }
          if (relevantKeys.length === 0) {
            console.log(`   ❌ В raw нет ключей, содержащих "время", "кухню", "kitchen" или "дата"`)
          }
        } else {
          console.log(`   ❌ У заказа нет raw данных`)
        }
        return null
      }
      
      const getPlannedTime = (o: any): number | null => {
        // ПРИОРИТЕТ 1: Проверяем готовые вычисленные значения
        if (o.deadlineAt !== undefined && o.deadlineAt !== null && typeof o.deadlineAt === 'number') {
          return o.deadlineAt
        }
        
        // ПРИОРИТЕТ 2: Проверяем основные поля объекта (plannedTime из excelProcessor)
        // Также проверяем поля "доставить к" из Excel, которые могут содержать дедлайн
        const directFields = [
          'plannedTime', 'planned_time', 'PlannedTime', 'PLANNED_TIME',
          'доставить к', 'доставить_к', 'Доставить к', 'ДОСТАВИТЬ К'
        ]
        for (const field of directFields) {
          const value = o[field]
          if (value !== undefined && value !== null && String(value).trim() !== '') {
            const strVal = String(value).trim().toLowerCase()
            // Пропускаем длительности и некорректные значения
            if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour') || strVal.includes('#')) {
              console.log(`⚠️ [getPlannedTime] o.${field} = "${value}" содержит длительность или некорректное значение, пропускаем`)
              continue
            }
            console.log(`🔍 [getPlannedTime] Проверяю o.${field}: "${value}"`)
            const parsed = parseTime(value)
            if (parsed) {
              console.log(`✅ Найдено плановое время в o.${field}: ${value} → ${new Date(parsed).toLocaleString()}`)
              return parsed
            } else {
              console.log(`❌ [getPlannedTime] o.${field} = "${value}" не распознано как время`)
            }
          }
        }
        
        // ПРИОРИТЕТ 3: Проверяем столбцы "плановое время" и "доставить к" - могут быть отдельными или подстолбцами "Дата.плановое время"
        // Из скриншота: столбец "Дата" (K3-N3) содержит подстолбцы:
        //   - "доставить к" (M4) - формат: "29.10.2025 13:30" (дата и время)
        //   - "плановое время" (N4) - формат: "29.10.2025 13:30" (дата и время)
        // Могут быть в формате даты и времени (29.10.2025 13:30:00) или Excel serial date
        // ВАЖНО: при экспорте Excel подстолбцы могут называться просто "доставить к"/"плановое время" (без префикса "Дата.")
        // ВАЖНО: также столбец "Дата" может содержать Excel serial date, который нужно распарсить
        if (o.raw) {
          // Получаем все ключи raw для проверки
          const allRawKeys = Object.keys(o.raw)
          
          // ВАЖНО: Сначала ищем ПОДСТОЛБЦЫ из "Дата" (они имеют приоритет)
          // Затем ищем отдельные столбцы "плановое время" и "доставить к"
          // НЕ используем столбец "Дата" или "создания" - они содержат другую информацию
          const plannedTimeKeys = [
            // Подстолбцы из столбца "Дата" (ПРИОРИТЕТ):
            'Дата.плановое время', 'дата.плановое время', 'дата_плановое_время',
            'Дата.плановое_время', 'date.плановое время', 'date.плановое_время', 'date.planned_time',
            'Дата.доставить к', 'дата.доставить к', 'дата.доставить_к', 'дата.доставитьк',
            'date.доставить к', 'date.доставить_к', 'date.доставитьк',
            'Дата плановое время', 'дата плановое время', 'Дата доставить к', 'дата доставить к',
            // Отдельные столбцы:
            'плановое время', 'плановое_время', 'Плановое время', 
            'plannedTime', 'planned_time',
            'доставить к', 'доставить_к', 'Доставить к', 'доставитьк'
          ]
          
          // ВАЖНО: Исключаем столбцы, которые НЕ являются "плановое время" или "доставить к"
          const excludeKeys = [
            'создания', 'creation', 'дата', 'date', 'Дата', 'Date',
            'время на кухню', 'kitchen', 'время готовности'
          ]
          
          // Проверяем все ключи raw на точные совпадения (allRawKeys уже определен выше)
          for (const key of allRawKeys) {
            const lowerKey = key.toLowerCase()
            
            // ВАЖНО: Пропускаем столбцы, которые НЕ являются "плановое время" или "доставить к"
            if (excludeKeys.some(exclude => lowerKey.includes(exclude.toLowerCase()) && 
                !lowerKey.includes('плановое') && !lowerKey.includes('доставить') && !lowerKey.includes('planned') && !lowerKey.includes('deliver'))) {
              continue
            }
            
            // Проверяем точные совпадения
            if (plannedTimeKeys.some(k => lowerKey === k.toLowerCase())) {
              const value = o.raw[key]
              console.log(`🔍 [getPlannedTime] Проверяю столбец "${key}": значение = "${value}" (тип: ${typeof value})`)
              
              if (value !== undefined && value !== null && String(value).trim() !== '') {
                const strVal = String(value).trim()
                
                // Пропускаем длительности
                if (strVal.toLowerCase().includes('мин.') || strVal.toLowerCase().includes('час')) {
                  console.log(`⏭️ [getPlannedTime] Пропускаем "${key}" (${strVal}): содержит длительность`)
                  continue
                }
                
                // Пробуем парсить через parseTime (для форматов даты и времени типа "29.10.2025 13:30:00")
                const parsed = parseTime(value)
                if (parsed) {
                  const parsedDate = new Date(parsed)
                  console.log(`✅ [getPlannedTime] Найдено плановое время в столбце "${key}": ${strVal} → ${parsedDate.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`)
                  return parsed
                } else {
                  console.log(`❌ [getPlannedTime] Не удалось распарсить "${key}" (${strVal}) через parseTime`)
                }
                
                // Пробуем парсить как Excel serial date (число > 25569)
                const excelDate = typeof value === 'number' ? value : parseFloat(strVal)
                if (!isNaN(excelDate) && excelDate > 25569) {
                  // ВАЖНО: Excel serial date конвертируется в UTC, но нам нужно локальное время
                  // Стандартная формула: (excelDate - 25569) * 86400 * 1000
                  // 25569 = количество дней от 1 января 1900 до 1 января 1970 (Unix epoch)
                  const utcDate = new Date((excelDate - 25569) * 86400 * 1000)
                  
                  // Извлекаем компоненты даты и времени из UTC
                  const year = utcDate.getUTCFullYear()
                  const month = utcDate.getUTCMonth()
                  const day = utcDate.getUTCDate()
                  const hours = utcDate.getUTCHours()
                  const minutes = utcDate.getUTCMinutes()
                  const seconds = utcDate.getUTCSeconds()
                  
                  // Создаем локальную дату с теми же компонентами
                  const jsDate = new Date(year, month, day, hours, minutes, seconds, 0)
                  
                  if (!isNaN(jsDate.getTime()) && jsDate.getFullYear() > 2000) {
                    const result = jsDate.getTime()
                    console.log(`✅ [getPlannedTime] Найдено плановое время в столбце "${key}" (Excel serial date ${excelDate}): ${jsDate.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`)
                    return result
                  }
                }
              }
            }
          }
          
          // Дополнительный поиск: ключи, которые содержат "плановое" и "время" (или "доставить" и "к")
          for (const key of allRawKeys) {
            const lowerKey = key.toLowerCase()
            // Пропускаем, если уже проверили выше
            if (plannedTimeKeys.some(k => lowerKey === k.toLowerCase())) {
              continue
            }
            
            // Ищем ключи с "плановое время" или "доставить к"
            if ((lowerKey.includes('плановое') && lowerKey.includes('время')) ||
                (lowerKey.includes('planned') && lowerKey.includes('time')) ||
                (lowerKey.includes('доставить') && lowerKey.includes('к')) ||
                (lowerKey.includes('deliver'))) {
              const value = o.raw[key]
              if (value !== undefined && value !== null && String(value).trim() !== '') {
                const strVal = String(value).trim()
                
                // Пропускаем длительности
                if (strVal.toLowerCase().includes('мин.') || strVal.toLowerCase().includes('час')) {
                  continue
                }
                
                // Пропускаем, если это похоже на Excel serial date (число > 25000)
                const numVal = parseFloat(strVal)
                if (!isNaN(numVal) && numVal > 25000) {
                  // Это может быть Excel serial date - пробуем распарсить
                  // ВАЖНО: Excel serial date конвертируется в UTC, но нам нужно локальное время
                  const utcDate = new Date((numVal - 25569) * 86400 * 1000)
                  
                  // Извлекаем компоненты даты и времени из UTC
                  const year = utcDate.getUTCFullYear()
                  const month = utcDate.getUTCMonth()
                  const day = utcDate.getUTCDate()
                  const hours = utcDate.getUTCHours()
                  const minutes = utcDate.getUTCMinutes()
                  const seconds = utcDate.getUTCSeconds()
                  
                  // Создаем локальную дату с теми же компонентами
                  const jsDate = new Date(year, month, day, hours, minutes, seconds, 0)
                  
                  if (!isNaN(jsDate.getTime()) && jsDate.getFullYear() > 2000) {
                    const result = jsDate.getTime()
                    console.log(`✅ [getPlannedTime] Найдено плановое время в столбце "${key}" (Excel serial date ${numVal}, поиск по ключевым словам): ${jsDate.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`)
                    return result
                  }
                }
                
                const parsed = parseTime(value)
                if (parsed) {
                  console.log(`✅ [getPlannedTime] Найдено плановое время в столбце "${key}" (поиск по ключевым словам): ${new Date(parsed).toLocaleString()}`)
                  return parsed
                }
              }
            }
          }
        }
        
        // ПРИОРИТЕТ 4: Проверяем raw данные если они есть (raw содержит оригинальные данные из Excel)
        // ВАЖНО: Проверяем ТОЧНОЕ название столбца из Excel "плановое время"
        // ВАЖНО: Столбец "Дата" уже проверен выше (ПРИОРИТЕТ 3), но если там не нашли, продолжаем поиск
        if (o.raw) {
          // Сначала проверяем ВСЕ ключи в raw, которые содержат "плановое", "доставить", "planned" или "deadline"
          // Это нужно, так как название столбца может быть любым (например, "Дата.плановое время")
          const allRawKeys = Object.keys(o.raw)
          for (const key of allRawKeys) {
            const lowerKey = key.toLowerCase().trim()
            const value = o.raw[key]
            
            // Пропускаем столбец "Дата" - уже проверили выше в ПРИОРИТЕТЕ 3
            if (lowerKey === 'дата' || lowerKey === 'date') {
              continue
            }
            
            // Ищем ключи, содержащие "плановое время", "доставить к" или "planned time"
            // ВАЖНО: "доставить к" часто содержит время дедлайна в Excel
            if (value !== undefined && value !== null && String(value).trim() !== '') {
              const strVal = String(value).trim().toLowerCase()
              // Пропускаем длительности и некорректные значения
              if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour') || strVal.includes('#')) {
                continue
              }
              
              if ((lowerKey.includes('плановое') && lowerKey.includes('время')) ||
                  (lowerKey.includes('доставить') && lowerKey.includes('к')) ||
                  (lowerKey.includes('planned') && lowerKey.includes('time')) ||
                  (lowerKey.includes('deadline'))) {
                console.log(`🔍 [getPlannedTime] Проверяю raw["${key}"]: "${value}"`)
                
                const parsed = parseTime(value)
                if (parsed) {
                  console.log(`✅ Найдено плановое время в raw["${key}"]: ${value} → ${new Date(parsed).toLocaleString()}`)
                  return parsed
                } else {
                  console.log(`❌ [getPlannedTime] raw["${key}"] = "${value}" не распознано как время`)
                }
              }
            }
          }
          
          const rawExactFields = [
            'плановое время', 'плановое_время', 'Плановое время', 'Плановое_время', 'ПЛАНОВОЕ ВРЕМЯ',
            'plannedTime', 'planned_time', 'PlannedTime', 'PLANNED_TIME',
            'Planned Time', 'planned time', 'PLANNED TIME',
            'Дедлайн', 'дедлайн', 'ДЕДЛАЙН', 'deadline', 'Deadline', 'DEADLINE',
            'deadlineAt', 'deadline_at',
            // 'Время доставки' - пропускаем, там длительности
            'delivery_time', 'deliveryTime', 'DeliveryTime',
            'доставить к', 'доставить_к', 'Доставить к',
            // 'Дата' - пропускаем, обрабатывается отдельно через Excel serial date выше
            'Дата доставки', 'дата доставки', 'ДАТА ДОСТАВКИ',
            'date_delivery', 'deliveryDate', 'DeliveryDate',
          ]
          
          for (const field of rawExactFields) {
            const value = o.raw[field]
            if (value !== undefined && value !== null && String(value).trim() !== '') {
              const strVal = String(value).trim().toLowerCase()
              // Пропускаем длительности и Excel serial dates (числа > 25000)
              if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour')) {
                continue
              }
              // Пропускаем, если это похоже на Excel serial date (число > 25000)
              const numVal = parseFloat(strVal)
              if (!isNaN(numVal) && numVal > 25000) {
                continue // Это Excel serial date, обрабатывается отдельно
              }
              
              console.log(`🔍 [getPlannedTime] Проверяю raw.${field}: "${value}"`)
              const parsed = parseTime(value)
              if (parsed) {
                console.log(`✅ Найдено плановое время в raw.${field}: ${value} → ${new Date(parsed).toLocaleString()}`)
                return parsed
              } else {
                console.log(`❌ [getPlannedTime] raw.${field} = "${value}" не распознано как время`)
              }
            }
          }
          
          // Дополнительно: регистронезависимый поиск по всем ключам raw (кроме "Дата")
          const searchPhrases = [
            'плановое время', 'плановое_время', 'плановоевремя',
            'planned_time', 'plannedtime', 'planned time',
            'дедлайн', 'deadline',
            // 'время доставки' - пропускаем, там длительности
            'delivery_time', 'deliverytime', 'delivery time',
            'доставить к', 'доставить_к',
            'дата доставки', 'дата_доставки', 'датадоставки',
            'delivery_date', 'deliverydate', 'delivery date',
          ]
          
          for (const key in o.raw) {
            if (!o.raw.hasOwnProperty(key)) continue
            const lowerKey = key.toLowerCase().trim()
            // Пропускаем поля связанные с кухней
            if (lowerKey.includes('кухню') || lowerKey.includes('kitchen')) continue
            // Пропускаем "Дата" - обрабатывается отдельно через Excel serial date
            if (lowerKey === 'дата' || lowerKey === 'date') continue
            
            for (const phrase of searchPhrases) {
              if (lowerKey === phrase || lowerKey.includes(phrase)) {
                const value = o.raw[key]
                if (value !== undefined && value !== null && String(value).trim() !== '') {
                  const strVal = String(value).trim().toLowerCase()
                  // Пропускаем длительности
                  if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour')) {
                    continue
                  }
                  // Пропускаем, если это похоже на Excel serial date
                  const numVal = parseFloat(strVal)
                  if (!isNaN(numVal) && numVal > 25000) {
                    continue
                  }
                  
                  console.log(`🔍 [getPlannedTime] Проверяю raw[${key}]: "${value}"`)
                  const parsed = parseTime(value)
                  if (parsed) {
                    console.log(`✅ Найдено плановое время в raw[${key}]: ${value} → ${new Date(parsed).toLocaleString()}`)
                    return parsed
                  } else {
                    console.log(`❌ [getPlannedTime] raw[${key}] = "${value}" не распознано как время`)
                  }
                }
              }
            }
          }
        }
        
        // Затем проверяем точные совпадения в основном объекте
        const exactFields = [
          'плановое время', 'плановое_время', 'Плановое время', 'Плановое_время', 'ПЛАНОВОЕ ВРЕМЯ',
          'plannedTime', 'planned_time', 'PlannedTime', 'PLANNED_TIME',
          'Planned Time', 'planned time', 'PLANNED TIME',
          'Дедлайн', 'дедлайн', 'ДЕДЛАЙН', 'deadline', 'Deadline', 'DEADLINE',
          'deadlineAt', 'deadline_at',
          'Время доставки', 'время доставки', 'ВРЕМЯ ДОСТАВКИ',
          'delivery_time', 'deliveryTime', 'DeliveryTime',
          'доставить к', 'доставить_к', 'Доставить к', 'ДОСТАВИТЬ К', // ВАЖНО: часто содержит дедлайн в Excel
          'plannedTime' // Из excelProcessor - важно проверить это поле
        ]
        
        for (const field of exactFields) {
          const value = o[field]
          if (value !== undefined && value !== null && String(value).trim() !== '') {
            const strVal = String(value).trim().toLowerCase()
            // Пропускаем длительности
            if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour') || strVal.includes('#')) {
              continue
            }
            console.log(`🔍 [getPlannedTime] Проверяю o["${field}"]: "${value}"`)
            const parsed = parseTime(value)
            if (parsed) {
              console.log(`✅ Найдено плановое время в поле "${field}": ${value} → ${new Date(parsed).toLocaleString()}`)
              return parsed
            } else {
              console.log(`❌ [getPlannedTime] o["${field}"] = "${value}" не распознано как время`)
            }
          }
        }
        
        // Затем проверяем регистронезависимо все ключи объекта на наличие полных фраз (исключая поля связанные с кухней и "Дата")
        const searchPhrases = [
          'плановое время', 'плановое_время', 'плановоевремя',
          'planned_time', 'plannedtime', 'planned time',
          'дедлайн', 'deadline',
          // 'время доставки' - пропускаем, там длительности
          'delivery_time', 'deliverytime', 'delivery time',
          'доставить к', 'доставить_к'
        ]
        for (const key in o) {
          if (key === 'raw') continue // Уже проверили
          const lowerKey = key.toLowerCase().trim()
          // Пропускаем поля связанные с кухней
          if (lowerKey.includes('кухню') || lowerKey.includes('kitchen')) continue
          // Пропускаем "Дата" - обрабатывается отдельно
          if (lowerKey === 'дата' || lowerKey === 'date') continue
          
          // Ищем полные фразы в названии поля
          for (const phrase of searchPhrases) {
            if (lowerKey === phrase || lowerKey.includes(phrase)) {
              const value = o[key]
              if (value !== undefined && value !== null && String(value).trim() !== '') {
                const strVal = String(value).trim().toLowerCase()
                // Пропускаем длительности
                if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour')) {
                  continue
                }
                // Пропускаем, если это похоже на Excel serial date
                const numVal = parseFloat(strVal)
                if (!isNaN(numVal) && numVal > 25000) {
                  continue
                }
                
                const parsed = parseTime(value)
                if (parsed) {
                  console.log(`✅ Найдено плановое время в поле "${key}": ${value} → ${new Date(parsed).toLocaleString()}`)
                  return parsed
                }
              }
            }
          }
        }
        
        // Если не нашли специальные поля, пробуем общее поле "время" или "time" (но не кухня)
        const generalFields = ['время', 'Время', 'ВРЕМЯ', 'time', 'Time', 'TIME']
        for (const field of generalFields) {
          const value = o[field]
          if (value !== undefined && value !== null && String(value).trim() !== '') {
            // Проверяем что это не поле кухни
            if (!o[`${field}_на_кухню`] && !o[`${field} на кухню`] && !o[`kitchen_${field}`]) {
              const parsed = parseTime(value)
              if (parsed) {
                console.log(`✅ Найдено плановое время в общем поле "${field}": ${value} → ${new Date(parsed).toLocaleString()}`)
                return parsed
              }
            }
          }
        }
        
        // Проверяем также raw данные если они есть (кроме "Дата", которая уже обработана)
        if (o.raw) {
          for (const field of exactFields) {
            const lowerField = field.toLowerCase()
            // Пропускаем "Дата" - уже обработана через Excel serial date
            if (lowerField === 'дата' || lowerField === 'date') continue
            
            const value = o.raw[field]
            if (value !== undefined && value !== null && String(value).trim() !== '') {
              const strVal = String(value).trim().toLowerCase()
              // Пропускаем длительности
              if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour')) {
                continue
              }
              // Пропускаем, если это похоже на Excel serial date
              const numVal = parseFloat(strVal)
              if (!isNaN(numVal) && numVal > 25000) {
                continue
              }
              
              const parsed = parseTime(value)
              if (parsed) {
                console.log(`✅ Найдено плановое время в raw.${field}: ${value} → ${new Date(parsed).toLocaleString()}`)
                return parsed
              }
            }
          }
        }
        
        console.log(`⚠️ Плановое время не найдено для заказа ${o.orderNumber || '?'}. Доступные ключи:`, Object.keys(o).slice(0, 10))
        if (o.raw) {
          const allRawKeys = Object.keys(o.raw)
          console.log(`📋 [getPlannedTime] ВСЕ ключи raw для заказа ${o.orderNumber || '?'}:`, allRawKeys)
          // Выводим ВСЕ ключи для отладки
          console.log(`📋 [getPlannedTime] Все ключи raw (детально):`, allRawKeys.map(k => `${k}: "${o.raw[k]}" (тип: ${typeof o.raw[k]})`))
          // Выводим ВСЕ значения, которые содержат "плановое", "время", "доставить", "planned", "deadline", "дата"
          for (const key of allRawKeys) {
            const lowerKey = key.toLowerCase()
            if (lowerKey.includes('плановое') || lowerKey.includes('planned') || 
                lowerKey.includes('доставить') || lowerKey.includes('deadline') ||
                lowerKey.includes('дата') || lowerKey.includes('date') ||
                (lowerKey.includes('время') && (lowerKey.includes('доставки') || lowerKey.includes('delivery')))) {
              console.log(`   raw["${key}"] = "${o.raw[key]}" (тип: ${typeof o.raw[key]})`)
            }
          }
        }
        return null
      }

      // Функция для валидации адреса - проверяем, что это действительно адрес
      const isValidAddress = (str: string): boolean => {
        if (!str || str.trim().length < 5) return false
        
        // Исключаем инструкции, комментарии и ложные адреса
        const invalidPatterns = [
          /зателефонувати|зателефоновать|позвонить|call|звон/i,
          /хвилин|минут|minutes/i,
          /до доставки|перед доставкой|before delivery/i,
          /примітка|примечание|note|комментарий|коментар/i,
          /инструкция|інструкція|instruction/i,
          /упаковка|packaging/i,
          /коментар|комментарий|comment/i,
          /примечание|примітка|note/i,
          /^только|only|тільки/i,
          /^без |без$|without/i
        ]
        
        // Проверяем, что это не инструкция/комментарий
        for (const pattern of invalidPatterns) {
          if (pattern.test(str)) {
            return false
          }
        }
        
        // Адрес должен содержать хотя бы один из маркеров адреса:
        // - название улицы/проспекта/бульвара
        // - номер дома (цифра)
        // - название города
        const addressMarkers = [
          /\b(вул|вулиця|улица|ул\.?|проспект|просп\.?|провулок|пров\.?|бульвар|бул\.?|линия|лінія|лін\.?|площа|площадь|пл\.?)\b/i,
          /\b\d+[а-я]?\b/, // номер дома (например, "14", "14а", "14-а")
          /\b(киев|київ|kiev|kyiv|одесса|одеса|харьков|харків|полтава)\b/i,
          /\b(под\.|подъезд|эт\.|этаж|кв\.|квартира|оф\.|офис)\b/i // части адреса
        ]
        
        // Должен содержать хотя бы один маркер адреса
        const hasAddressMarker = addressMarkers.some(pattern => pattern.test(str))
        
        // Не должен быть только телефоном, email или числом
        const isNotPhone = !/^[\d\+\-\(\)\s]+$/.test(str)
        const isNotEmail = !/^[\w\.-]+@[\w\.-]+\.\w+$/.test(str)
        const isNotOnlyNumber = !/^\d+$/.test(str)
        
        // Должен быть достаточно длинным и содержать кириллицу/латиницу
        const hasText = str.length > 10 && /[а-яА-ЯёЁіІїЇєЄa-zA-Z]/.test(str)
        
        return hasAddressMarker && isNotPhone && isNotEmail && isNotOnlyNumber && hasText
      }

      // Filter orders by sector if polygon defined
      console.log(`📋 Фильтрация ${orders.length} заказов по сектору и валидация адресов...`)
      console.log('📋 Примеры адресов из Excel:', orders.slice(0, 5).map(o => `${o.orderNumber || '?'}: "${o.address}"`))
      
      const filteredOrders: any[] = []
      const excludedAddresses: string[] = []
      let excluded = 0
      
      for (let i = 0; i < orders.length; i++) {
        const o = orders[i]
        // Проверяем все возможные поля с адресом
        const addr = o.address || o['адрес'] || o['address'] || o['адрес_доставки'] || o['address_delivery'] || ''
        
        if (!addr || !String(addr).trim()) {
          excluded++
          excludedAddresses.push(`${i + 1}. (пустой адрес) | orderNumber: ${o.orderNumber || '?'}`)
          console.warn(`⚠️ Заказ ${i + 1}: пустой адрес`)
          continue
        }
        
        const addrStr = String(addr).trim()
        
        // ВАЛИДАЦИЯ АДРЕСА - проверяем, что это действительно адрес, а не инструкция
        if (!isValidAddress(addrStr)) {
          excluded++
          excludedAddresses.push(`${i + 1}. (невалидный адрес: "${addrStr.substring(0, 50)}...") | orderNumber: ${o.orderNumber || '?'}`)
          console.warn(`⚠️ Заказ ${i + 1} (${o.orderNumber || '?'}): невалидный адрес (инструкция/комментарий): "${addrStr.substring(0, 60)}"`)
          continue
        }
        
        // eslint-disable-next-line no-await-in-loop
        const inside = await isInsideSector(addrStr)
        if (inside) {
          filteredOrders.push(o)
        } else {
          excluded++
          excludedAddresses.push(`${i + 1}. ${addrStr}`)
          if (excludedAddresses.length <= 10) {
            console.log(`⚠️ Заказ ${i + 1} (${o.orderNumber || '?'}) вне сектора: "${addrStr}"`)
          }
        }
        
        // Показываем прогресс каждые 50 заказов
        if ((i + 1) % 50 === 0) {
          console.log(`  Проверено ${i + 1}/${orders.length}, прошло: ${filteredOrders.length}, исключено: ${excluded}`)
        }
      }
      
      setExcludedOutsideSector(excluded)
      console.log(`✅ Прошло фильтр: ${filteredOrders.length}, исключено: ${excluded}`)
      
      if (excluded > 0 && excluded <= 20) {
        console.log('📋 Исключённые адреса:', excludedAddresses.slice(0, 20))
        if (excluded > 20) {
          console.log(`  ... и ещё ${excluded - 20} адресов`)
        }
      }
      
      if (filteredOrders.length === 0) {
        const msg = `Нет заказов внутри сектора города. Исключено: ${excluded}${excluded > 0 ? `. Проверьте границы сектора в Настройках и формат адресов.` : ''}`
        setErrorMsg(msg)
        console.warn('⚠️', msg)
        if (excludedAddresses.length > 0) {
          console.log('Первые исключённые адреса:', excludedAddresses.slice(0, 10))
        }
        setIsPlanning(false)
        return
      }

      // Enrich orders with scheduling info
      const enriched = filteredOrders.map((o: any, idx: number) => {
        // ВАЖНО: Сначала создаем rawData, чтобы функции getKitchenTime и getPlannedTime имели к нему доступ
        // Создаем полную копию всех данных из Excel для сохранения в raw
        // ПРОБЛЕМА: столбцы могут быть динамическими и находиться в разных ячейках, но подписаны они всегда одинаково
        // Поэтому нужно искать поля по названию, а не по позиции
        
        // Если у объекта уже есть raw, используем его (он содержит оригинальные данные из Excel)
        // Если нет, создаем из самого объекта, но убеждаемся, что сохраняем ВСЕ поля
        const rawData: any = o.raw ? { ...o.raw } : {}
        
        // ВАЖНО: Убеждаемся, что все оригинальные поля из Excel сохранены в raw
        // Копируем ВСЕ поля из объекта o в rawData, чтобы сохранить оригинальные названия столбцов
        for (const key in o) {
          // Пропускаем служебные поля
          if (key === 'raw' || key === 'idx' || key === 'isSelected' || key === 'isInRoute') {
            continue
          }
          // Если поле еще не сохранено в rawData, сохраняем его
          if (!rawData.hasOwnProperty(key)) {
            rawData[key] = o[key]
          }
        }
        
        // ДОПОЛНИТЕЛЬНО: Явно ищем и сохраняем поля с нужными названиями, даже если они не были найдены автоматически
        // ПРОБЛЕМА: столбцы могут быть динамическими и находиться в разных ячейках, но подписаны они всегда одинаково
        // Поэтому нужно искать поля по названию, а не по позиции
        const searchFields = [
          // Время на кухню
          'время на кухню', 'время_на_кухню', 'Время на кухню',
          'Дата.время на кухню', 'дата.время на кухню', 'Дата.время_на_кухню',
          'kitchenTime', 'kitchen_time', 'KitchenTime',
          // Плановое время и доставить к
          'плановое время', 'плановое_время', 'Плановое время',
          'доставить к', 'доставить_к', 'Доставить к',
          'Дата.плановое время', 'дата.плановое время', 'Дата.плановое_время',
          'Дата.доставить к', 'дата.доставить к', 'Дата.доставить_к',
          'plannedTime', 'planned_time', 'PlannedTime',
          // Дата (может содержать Excel serial date)
          'Дата', 'дата', 'date', 'Date'
        ]
        
        // ВАЖНО: Ищем все поля в объекте o, которые совпадают с нужными названиями (регистронезависимо)
        // Это критично, потому что Excel может экспортировать поля с разным регистром
        for (const key in o) {
          if (key === 'raw' || key === 'idx' || key === 'isSelected' || key === 'isInRoute') {
            continue
          }
          const lowerKey = key.toLowerCase().trim()
          
          // Проверяем, совпадает ли ключ с одним из нужных полей (регистронезависимо)
          for (const searchField of searchFields) {
            const lowerSearchField = searchField.toLowerCase().trim()
            // Проверяем точное совпадение или вхождение подстроки (для "Дата.время на кухню")
            if (lowerKey === lowerSearchField || 
                (lowerSearchField.includes('.') && lowerKey.includes(lowerSearchField.split('.')[1]?.toLowerCase() || ''))) {
              if (o[key] !== undefined && o[key] !== null && String(o[key]).trim() !== '') {
                rawData[key] = o[key] // Сохраняем с оригинальным названием ключа из Excel
                console.log(`✅ [Обогащение] Сохранено поле "${key}" в rawData: "${o[key]}"`)
              }
            }
          }
          
          // Дополнительно: ищем поля, которые содержат ключевые слова (для случаев, когда название немного отличается)
          const hasTime = lowerKey.includes('время') || lowerKey.includes('time')
          const hasKitchen = lowerKey.includes('кухню') || lowerKey.includes('kitchen')
          const hasPlanned = lowerKey.includes('плановое') || lowerKey.includes('planned')
          const hasDeliver = lowerKey.includes('доставить') && lowerKey.includes('к')
          
          if ((hasTime && hasKitchen && !hasPlanned) || // "время на кухню"
              (hasPlanned && hasTime && !hasKitchen) || // "плановое время"
              (hasDeliver && !hasKitchen)) { // "доставить к"
            if (o[key] !== undefined && o[key] !== null && String(o[key]).trim() !== '') {
              rawData[key] = o[key] // Сохраняем с оригинальным названием ключа
              console.log(`✅ [Обогащение] Сохранено поле "${key}" в rawData (по ключевым словам): "${o[key]}"`)
            }
          }
        }
        
        // ВАЖНО: Теперь добавляем raw в объект, чтобы getKitchenTime и getPlannedTime имели к нему доступ
        const oWithRaw = { ...o, raw: rawData }
        
        // Теперь пытаемся извлечь время из всех возможных источников
        // Вызываем функции getKitchenTime и getPlannedTime ПОСЛЕ создания rawData
        const ready = getKitchenTime(oWithRaw)
        const readyWithPack = ready ? ready + 4 * 60 * 1000 : null // +4 мин упаковка
        const deadline = getPlannedTime(oWithRaw)
        
        // Отладочная информация для проблемных заказов
        if (!deadline && (idx < 3 || o.orderNumber === '9323351' || o.orderNumber === '9324097' || o.orderNumber === '9327059')) {
          console.warn(`⚠️ [Обогащение] Для заказа ${o.orderNumber} не найден deadline. Проверяем данные:`)
          console.log(`   o.keys:`, Object.keys(o).slice(0, 20))
          console.log(`   oWithRaw.raw?.keys:`, oWithRaw.raw ? Object.keys(oWithRaw.raw).slice(0, 20) : 'нет raw')
          console.log(`   o.plannedTime:`, o.plannedTime)
          console.log(`   oWithRaw.raw?.["плановое время"]:`, oWithRaw.raw?.["плановое время"])
          console.log(`   oWithRaw.raw?.["доставить к"]:`, oWithRaw.raw?.["доставить к"])
        }
        
        // Отладочная информация для первых 3 заказов и проблемных заказов
        if (idx < 3 || o.orderNumber === '9323351' || o.orderNumber === '9324097' || o.orderNumber === '9327059') {
          // Ищем все ключи, которые могут содержать время
          const allKeys = Object.keys(oWithRaw)
          const timeKeys = allKeys.filter(k => {
            const lower = k.toLowerCase()
            return lower.includes('время') || lower.includes('time') || 
                   lower.includes('кухню') || lower.includes('kitchen') ||
                   lower.includes('плановое') || lower.includes('planned') ||
                   lower.includes('доставить') || lower.includes('deliver')
          })
          
          console.log(`🔍 [Обогащение заказа ${o.orderNumber}]`, {
            address: o.address?.substring(0, 50) || 'нет адреса',
            'ВСЕ ключи объекта': allKeys,
            'Ключи, связанные со временем': timeKeys,
            'Значения ключей времени': timeKeys.reduce((acc, k) => {
              acc[k] = oWithRaw[k]
              return acc
            }, {} as any),
            ready: ready ? new Date(ready).toLocaleString() : null,
            readyWithPack: readyWithPack ? new Date(readyWithPack).toLocaleString() : null,
            deadline: deadline ? new Date(deadline).toLocaleString() : null,
          })
        }
        
        // Отладочная информация для первых 3 заказов и проблемных заказов
        if (idx < 3 || o.orderNumber === '9323351' || o.orderNumber === '9324097' || o.orderNumber === '9327059') {
          console.log(`📦 [Обогащение заказа ${o.orderNumber}] raw содержит ключи:`, Object.keys(rawData))
          console.log(`📦 [Обогащение заказа ${o.orderNumber}] Все ключи с "время":`, Object.keys(rawData).filter(k => k.toLowerCase().includes('время')))
          console.log(`📦 [Обогащение заказа ${o.orderNumber}] Все ключи с "кухню":`, Object.keys(rawData).filter(k => k.toLowerCase().includes('кухню')))
          console.log(`📦 [Обогащение заказа ${o.orderNumber}] Все ключи с "плановое":`, Object.keys(rawData).filter(k => k.toLowerCase().includes('плановое')))
          console.log(`📦 [Обогащение заказа ${o.orderNumber}] Все ключи с "kitchen":`, Object.keys(rawData).filter(k => k.toLowerCase().includes('kitchen')))
          console.log(`📦 [Обогащение заказа ${o.orderNumber}] Все ключи с "planned":`, Object.keys(rawData).filter(k => k.toLowerCase().includes('planned')))
          
          // Показываем значения всех полей, которые могут содержать время
          const timeRelatedKeys = Object.keys(rawData).filter(k => {
            const lower = k.toLowerCase()
            return lower.includes('время') || lower.includes('time') || 
                   lower.includes('кухню') || lower.includes('kitchen') ||
                   lower.includes('плановое') || lower.includes('planned') ||
                   lower.includes('доставить') || lower.includes('deliver')
          })
          timeRelatedKeys.forEach(key => {
            console.log(`   rawData["${key}"] = "${rawData[key]}" (тип: ${typeof rawData[key]})`)
          })
        }
        
        return {
          idx,
          address: o.address || '',
          raw: rawData, // Сохраняем ВСЕ поля из Excel, включая "время на кухню" и "плановое время"
          orderNumber: o.orderNumber || o.raw?.orderNumber || `#${idx + 1}`, // Сохраняем номер заказа
          readyAt: readyWithPack, // earliest pickup
          deadlineAt: deadline,   // must arrive before this
          // Также сохраняем все поля напрямую, чтобы они были доступны везде
          ...o, // Распространяем все поля из исходного объекта
          // Сохраняем также исходные значения для отладки (дублируем для надежности)
          'время на кухню': o['время на кухню'] || o['время_на_кухню'] || rawData['время на кухню'] || rawData['время_на_кухню'] || o.kitchen_time || o.kitchenTime || null,
          'плановое время': o['плановое время'] || o['плановое_время'] || rawData['плановое время'] || rawData['плановое_время'] || o.plannedTime || o.planned_time || null,
          'доставить к': o['доставить к'] || o['доставить_к'] || rawData['доставить к'] || rawData['доставить_к'] || null,
          // Также сохраняем извлеченные значения в формате timestamp
          readyAtSource: ready, // без упаковки
          deadlineAtSource: deadline,
        }
      })
      // Sort primarily by deadline, then by ready time
      enriched.sort((a, b) => {
        const da = a.deadlineAt ?? Number.POSITIVE_INFINITY
        const db = b.deadlineAt ?? Number.POSITIVE_INFINITY
        if (da !== db) return da - db
        const ra = a.readyAt ?? Number.NEGATIVE_INFINITY
        const rb = b.readyAt ?? Number.NEGATIVE_INFINITY
        return ra - rb
      })

      // Получаем координаты для всех заказов (для объединения)
      console.log('📍 Получаю координаты для объединения заказов...')
      const enrichedWithCoords = await Promise.all(enriched.map(async (order) => {
        const geocoder = new gmaps.Geocoder()
        const normalizedAddr = normalizeAddr(order.address)
        const coords: any = await new Promise((resolve) => {
          geocoder.geocode({
            address: normalizedAddr,
            region,
            componentRestrictions: { country: 'ua' }
          }, (res: any, status: any) => {
            if (status === 'OK' && res && res.length > 0) {
              const loc = res[0].geometry.location
              resolve({ lat: loc.lat(), lng: loc.lng() })
            } else {
              resolve(null)
            }
          })
        })
        return { ...order, coords }
      }))

      // Автоматическое объединение заказов (если включено)
      let ordersToPlan: OptimizationOrder[] = enrichedWithCoords.map(o => ({
        idx: o.idx,
        address: o.address,
        raw: o.raw,
        orderNumber: o.orderNumber,
        readyAt: o.readyAt,
        deadlineAt: o.deadlineAt,
        coords: o.coords
      }))

      if (enableOrderCombining && ordersToPlan.length > 1) {
        console.log(`🔗 Объединяю заказы (макс. расстояние: ${combineMaxDistanceMeters}м, окно времени: ${combineMaxTimeWindowMinutes}мин)...`)
        const combinedGroups = combineOrders(ordersToPlan, {
          maxDistanceMeters: combineMaxDistanceMeters,
          maxTimeWindowMinutes: combineMaxTimeWindowMinutes,
          maxOrdersPerGroup: 3, // Максимум 3 заказа в одну группу
          prioritizeUrgent: routePlanningSettings.prioritizeUrgent, // Приоритет срочных заказов
          minEfficiencyScore: 70 // Минимальная эффективность группировки
        })

        // Анализируем результаты группировки
        const singleOrders = combinedGroups.filter(g => g.length === 1).length
        const groupedOrders = combinedGroups.filter(g => g.length > 1)
        const totalGrouped = groupedOrders.reduce((sum, g) => sum + g.length, 0)
        
        if (groupedOrders.length > 0) {
          const avgEfficiency = groupedOrders.reduce((sum, group) => {
            // Вычисляем среднюю эффективность группы
            let groupEfficiency = 0
            for (let i = 0; i < group.length; i++) {
              for (let j = i + 1; j < group.length; j++) {
                const result = shouldCombineOrders(group[i], group[j], {
                  maxDistanceMeters: combineMaxDistanceMeters,
                  maxTimeWindowMinutes: combineMaxTimeWindowMinutes,
                  prioritizeUrgent: routePlanningSettings.prioritizeUrgent
                })
                if (result.efficiencyScore) {
                  groupEfficiency += result.efficiencyScore
                }
              }
            }
            return sum + (groupEfficiency / Math.max(1, group.length * (group.length - 1) / 2))
          }, 0) / groupedOrders.length
          
          console.log(`✅ Группировка завершена:`)
          console.log(`   - Отдельных заказов: ${singleOrders}`)
          console.log(`   - Групп: ${groupedOrders.length} (${totalGrouped} заказов)`)
          console.log(`   - Средняя эффективность группировки: ${avgEfficiency.toFixed(1)}%`)
          console.log(`   - Срочные заказы доставляются отдельно для максимальной скорости`)
        } else {
          console.log(`ℹ️ Группировка не найдена - все заказы будут доставлены отдельно`)
        }

        // Распаковываем группы обратно в массив заказов для планирования
        // (пока не реализуем полное объединение, т.к. это требует изменений в логике планирования)
        ordersToPlan = combinedGroups.flat()
      }

      const directionsService = new gmaps.DirectionsService()

      // Константы для буферов времени (используются во всех расчетах)
      const FORCE_MAJEURE_MINUTES = 9 // Форс-мажор на каждый заказ
      const DELIVERY_TIME_MINUTES = 5 // Время на отдачу заказа курьером
      const KITCHEN_READY_WINDOW_MINUTES = 5 // Окно готовности заказа: ±5 минут от времени на кухню
      const FORCE_MAJEURE_MS = FORCE_MAJEURE_MINUTES * 60 * 1000
      const DELIVERY_TIME_MS = DELIVERY_TIME_MINUTES * 60 * 1000
      const KITCHEN_READY_WINDOW_MS = KITCHEN_READY_WINDOW_MINUTES * 60 * 1000

      // Очистка устаревших записей кэша
      routeOptimizationCache.clearExpired()

      let depotCoords: Coordinates | null = null

      // Получаем координаты адреса (с кэшированием и улучшенной проверкой)
      const getCoordinates = async (address: string): Promise<Coordinates | null> => {
        // Проверяем кэш
        const cached = routeOptimizationCache.getCoordinates(address)
        if (cached) {
          return cached
        }
        
        const geocoder = new gmaps.Geocoder()
        const normalizedAddr = normalizeAddr(address)
        
        // Пробуем сначала с компонентами Украины
        const result: Coordinates | null = await new Promise((resolve) => {
          geocoder.geocode({
            address: normalizedAddr,
            region: 'ua',
            componentRestrictions: { country: 'ua' }
          }, (res: any, status: any) => {
            if (status === 'OK' && res && res.length > 0) {
              // Проверяем, что результат действительно для Украины
              const firstResult = res[0]
              let coords: Coordinates | null = null
              
              // Проверяем, что страна - Украина
              const hasUkraine = firstResult.address_components?.some((comp: any) => 
                comp.types.includes('country') && comp.short_name === 'UA'
              )
              
              if (hasUkraine) {
                const loc = firstResult.geometry.location
                coords = { lat: loc.lat(), lng: loc.lng() }
                
                // Дополнительная проверка: если адрес содержит "Киев" или "Київ", проверяем, что координаты в разумных пределах
                const addrLower = normalizedAddr.toLowerCase()
                if (addrLower.includes('киев') || addrLower.includes('київ') || addrLower.includes('kiev') || addrLower.includes('kyiv')) {
                  // Примерные границы Киева: 50.2-50.6°N, 30.3-30.8°E
                  if (coords.lat < 50.0 || coords.lat > 50.8 || coords.lng < 30.0 || coords.lng > 31.0) {
                    console.warn(`⚠️ Геокодинг для "${address.substring(0, 50)}..." вернул координаты вне границ Киева: ${coords.lat}, ${coords.lng}`)
                    // Все равно возвращаем, но с предупреждением
                  }
                }
                
                // Сохраняем в кэш
                routeOptimizationCache.setCoordinates(address, coords)
                resolve(coords)
              } else {
                console.warn(`⚠️ Геокодинг для "${address.substring(0, 50)}..." вернул результат не для Украины`)
                resolve(null)
              }
            } else {
              // Если не удалось с компонентами, пробуем без них
              if (status === 'ZERO_RESULTS') {
                console.warn(`⚠️ Геокодинг не нашел результат для "${address.substring(0, 50)}..."`)
              }
              resolve(null)
            }
          })
        })
        
        return result
      }

      // ОПТИМИЗАЦИЯ 1: Параллельное предварительное геокодирование всех заказов
      console.log('📍 Предварительное геокодирование заказов (параллельно)...')
      setOptimizationProgress({
        current: 0,
        total: ordersToPlan.length,
        message: 'Геокодирование адресов...'
      })
      
      const geocodeBatchSize = 10 // Размер батча для параллельного геокодирования
      const uniqueAddresses = new Set<string>()
      ordersToPlan.forEach(o => {
        if (o.address) uniqueAddresses.add(o.address)
      })
      const addressesToGeocode = Array.from(uniqueAddresses).filter(addr => 
        !routeOptimizationCache.getCoordinates(addr) // Только адреса без кэша
      )
      
      // Геокодируем батчами параллельно
      for (let i = 0; i < addressesToGeocode.length; i += geocodeBatchSize) {
        const batch = addressesToGeocode.slice(i, i + geocodeBatchSize)
        await Promise.all(batch.map(async (addr) => {
          try {
            await getCoordinates(addr)
          } catch (err) {
            console.warn(`⚠️ Ошибка геокодирования "${addr.substring(0, 50)}...":`, err)
          }
        }))
        setOptimizationProgress({
          current: Math.min(i + geocodeBatchSize, addressesToGeocode.length),
          total: addressesToGeocode.length,
          message: `Геокодирование адресов: ${Math.min(i + geocodeBatchSize, addressesToGeocode.length)}/${addressesToGeocode.length}`
        })
      }
      console.log(`✅ Предварительное геокодирование завершено: ${addressesToGeocode.length} адресов обработано`)

      depotCoords = await getCoordinates(defaultStartAddress)

      // Предварительная оценка кандидата (улучшенная версия с учетом всех факторов)
      const quickEvaluateCandidate = async (
        candidate: Order,
        lastOrderCoords: Coordinates | null,
        currentRoute: Order[],
        allOrders: Order[]
      ): Promise<{ score: number; distanceKm: number; reason: string }> => {
        if (!lastOrderCoords) {
          // Если нет координат последнего заказа, берём стартовый адрес
          const startCoords = await getCoordinates(defaultStartAddress)
          if (!startCoords) return { score: 0, distanceKm: Infinity, reason: 'Не удалось получить координаты старта' }
          lastOrderCoords = startCoords
        }

        const candidateCoords = await getCoordinates(candidate.address)
        if (!candidateCoords) {
          return { score: 0, distanceKm: Infinity, reason: 'Не удалось получить координаты кандидата' }
        }

        // Используем кэшированное расстояние
        const distanceKm = getCachedDistance(lastOrderCoords, candidateCoords)

        // Оценка с приоритетом на своевременную доставку:
        // 1. ПРИОРИТЕТ: Время доставки (готовность + плановое время) - макс 120 баллов
        // 2. СОВМЕСТИМОСТЬ: Совместимость по времени готовности - макс 30 баллов
        // 3. БЛИЗОСТЬ: Расстояние - макс 30 баллов
        // 4. КЛАСТЕР: Плотность заказов в районе - макс 20 баллов
        // 5. ЗОНА: Совпадение зоны доставки - макс 20 баллов
        let score = 0
        const now = Date.now()
        
        // Приоритет 1: Готовность заказа (время на кухню) - УСИЛЕННЫЙ ПРИОРИТЕТ
        // ВАЖНО: Используем readyAtSource (время на кухню без упаковки), а не readyAt (с упаковкой)
        // Если readyAtSource не найден, пробуем readyAt, если и его нет - считаем заказ готовым (сейчас)
        const readyAt = candidate.readyAtSource || candidate.readyAt || null
        if (readyAt) {
          const minutesUntilReady = (readyAt - now) / (1000 * 60) // В минутах, не часах
          if (minutesUntilReady <= 0) {
            // Заказ уже готов - МАКСИМАЛЬНЫЙ приоритет (увеличено с 100 до 200)
            score += 200
          } else if (minutesUntilReady <= 15) {
            // Заказ готов через 0-15 минут - ОЧЕНЬ ВЫСОКИЙ приоритет
            score += 180 - (minutesUntilReady * 2) // 180 для 0 мин, 150 для 15 мин
          } else if (minutesUntilReady <= 30) {
            // Заказ готов через 15-30 минут - ВЫСОКИЙ приоритет
            score += 150 - ((minutesUntilReady - 15) * 2) // 150 для 15 мин, 120 для 30 мин
          } else if (minutesUntilReady <= 60) {
            // Заказ готов через 30-60 минут - СРЕДНИЙ приоритет
            score += 100 - ((minutesUntilReady - 30) * 1) // 100 для 30 мин, 70 для 60 мин
          } else {
            // Заказ готовится долго - низкий приоритет
            score += 50
          }
        } else {
          // Нет информации о готовности - считаем готовым СЕЙЧАС (высокий приоритет)
          score += 150
        }

        // Приоритет 2: Плановое время доставки (дедлайн)
        if (candidate.deadlineAt) {
          const hoursUntilDeadline = (candidate.deadlineAt - now) / (1000 * 60 * 60)
          if (hoursUntilDeadline > 0 && hoursUntilDeadline < 48) {
            // Близкий дедлайн - высокий приоритет
            score += 20 * (1 - Math.min(hoursUntilDeadline, 48) / 48)
          } else if (hoursUntilDeadline <= 0) {
            // Просроченный заказ - критический приоритет
            score += 30
          }
        }

        // Фактор 3: Совместимость по времени готовности
        if (currentRoute.length > 0 && optimizedSettings.maxReadyTimeDifferenceMinutes > 0) {
          if (isReadyTimeCompatible(candidate, currentRoute, optimizedSettings.maxReadyTimeDifferenceMinutes)) {
            // Бонус за совместимость
            const avgReadyTime = getAverageReadyTime(currentRoute)
            const timeDiff = readyAt ? Math.abs(readyAt - avgReadyTime) : 0
            const maxDiff = optimizedSettings.maxReadyTimeDifferenceMinutes * 60 * 1000
            if (maxDiff > 0) {
              const compatibility = 1 - Math.min(timeDiff / maxDiff, 1)
              score += 30 * compatibility
            }
          } else {
            // Штраф за несовместимость
            score -= 50
          }
        }

        // Фактор 4: Близость (расстояние)
        // Если установлен лимит расстояния между заказами, используем его как максимальное расстояние для оценки
        const maxDistKm = optimizedSettings.maxDistanceBetweenOrdersKm !== null && optimizedSettings.maxDistanceBetweenOrdersKm > 0
          ? optimizedSettings.maxDistanceBetweenOrdersKm
          : 30
        const distanceScore = Math.max(0, 30 * (1 - Math.min(distanceKm, maxDistKm) / maxDistKm))
        score += distanceScore
        
        // Дополнительный штраф, если расстояние превышает лимит (для более строгой фильтрации)
        if (optimizedSettings.maxDistanceBetweenOrdersKm !== null && optimizedSettings.maxDistanceBetweenOrdersKm > 0) {
          if (distanceKm > optimizedSettings.maxDistanceBetweenOrdersKm) {
            // Жесткий штраф - такие заказы не должны попадать в маршрут
            score -= 1000
          } else if (distanceKm > optimizedSettings.maxDistanceBetweenOrdersKm * 0.8) {
            // Мягкий штраф за приближение к лимиту
            score -= 20
          }
        }

        // Фактор 5: Плотность заказов (cluster bonus)
        if (candidate.coords) {
          const clusterDensity = calculateClusterDensity(candidate, allOrders, 2)
          score += 20 * clusterDensity
        }

        // Фактор 6: Совпадение зоны доставки
        if (optimizedSettings.preferSingleZoneRoutes && currentRoute.length > 0) {
          const currentZone = currentRoute[0].deliveryZone || 'без зоны'
          const candidateZone = candidate.deliveryZone || 'без зоны'
          if (currentZone === candidateZone) {
            score += 20
          } else {
            score -= 10
          }
        }

        return {
          score,
          distanceKm,
          reason: `Готов: ${readyAt ? new Date(readyAt).toLocaleTimeString() : 'сейчас'}, Дедлайн: ${candidate.deadlineAt ? new Date(candidate.deadlineAt).toLocaleTimeString() : 'нет'}, Расстояние: ${distanceKm.toFixed(1)} км, Оценка: ${score.toFixed(0)}`
        }
      }

      // Check ETA feasibility of a chain using Google durations
      // chain - это массив заказов (без начального и конечного адресов)
      // Функция рассчитывает: startAddress -> заказы -> endAddress
      const checkChainFeasible = async (chain: any[], includeStartEnd: boolean = true): Promise<{ feasible: boolean, legs?: any, totalDuration?: number, totalDistance?: number }> => {
        if (chain.length === 0) {
          // Если нет заказов, считаем путь от старта до финиша
          if (!includeStartEnd) return { feasible: true, totalDuration: 0, totalDistance: 0 }
          const origin = normalizeAddr(defaultStartAddress)
          const destination = normalizeAddr(defaultEndAddress)
          const req: any = {
            origin,
            destination,
            travelMode: gmaps.TravelMode.DRIVING,
            unitSystem: gmaps.UnitSystem.METRIC,
            region
          }
          const res: any = await new Promise((resolve) => {
            directionsService.route(req, (r: any, status: any) => {
              if (status === gmaps.DirectionsStatus.OK) resolve(r); else resolve(null)
            })
          })
        if (!res) return { feasible: false }
        const legs = res.routes?.[0]?.legs || []
        // Используем duration_in_traffic если доступно (учитывает трафик), иначе duration
        const totalDuration = legs.reduce((acc: number, leg: any) => {
          const duration = leg.duration_in_traffic?.value || leg.duration?.value || 0
          return acc + duration
        }, 0)
        const totalDistance = legs.reduce((acc: number, leg: any) => acc + (leg.distance?.value || 0), 0)
        return { feasible: true, legs, totalDuration, totalDistance }
        }
        
        // Формируем полный маршрут: startAddress -> заказы -> endAddress
        const origin = includeStartEnd ? normalizeAddr(defaultStartAddress) : normalizeAddr(chain[0].address)
        const destination = includeStartEnd ? normalizeAddr(defaultEndAddress) : normalizeAddr(chain[chain.length - 1].address)
        const waypoints = includeStartEnd 
          ? chain.map(n => ({ location: normalizeAddr(n.address), stopover: true }))
          : chain.slice(1, chain.length - 1).map(n => ({ location: normalizeAddr(n.address), stopover: true }))
        
        const req: any = {
          origin,
          destination,
          waypoints: waypoints.length > 0 ? waypoints : undefined,
          travelMode: gmaps.TravelMode.DRIVING,
          optimizeWaypoints: false, // Сохраняем порядок заказов как есть
          unitSystem: gmaps.UnitSystem.METRIC,
          region
        }
        const res: any = await new Promise((resolve) => {
          directionsService.route(req, (r: any, status: any) => {
            if (status === gmaps.DirectionsStatus.OK) resolve(r); else resolve(null)
          })
        })
        if (!res) return { feasible: false }
        const legs = res.routes?.[0]?.legs || []
        // Используем duration_in_traffic если доступно (учитывает трафик), иначе duration
        const totalDuration = legs.reduce((acc: number, leg: any) => {
          const duration = leg.duration_in_traffic?.value || leg.duration?.value || 0
          return acc + duration
        }, 0)
        const totalDistance = legs.reduce((acc: number, leg: any) => acc + (leg.distance?.value || 0), 0)
        return { feasible: true, legs, totalDuration, totalDistance }
      }
      
      // Получаем Mapbox токен из настроек
      const appSettings = localStorageUtils.getAllSettings()
      const mapboxToken = appSettings.mapboxToken || 'pk.eyJ1IjoieWFwMDA3NyIsImEiOiJjbWkyN2wzYnIxNHN3MmxzZmpjOThzdmp6In0.KKBxC62q-I4xEXQBCx7JVw'
      
      // Создаем единый менеджер Google API с оптимизациями
      const apiManagerConfig: GoogleAPIManagerConfig = {
        checkChainFeasible,
        defaultStartAddress,
        defaultEndAddress,
        maxDistanceKm: optimizedSettings.maxDistanceBetweenOrdersKm,
        maxReadyTimeDiffMinutes: optimizedSettings.maxReadyTimeDifferenceMinutes,
        mapboxToken // Добавляем токен Mapbox для отслеживания пробок
      }
      const apiManager = new GoogleAPIManager(apiManagerConfig)
      
      console.log('🚀 GoogleAPIManager инициализирован с оптимизациями:')
      console.log('  - Кэширование пар точек и сегментов')
      console.log('  - Батчинг запросов (high: 5, low: 10)')
      console.log('  - Предварительная фильтрация Haversine')
      console.log('  - Приоритизация запросов')
      if (mapboxToken) {
        console.log('  - Mapbox Traffic API: отслеживание пробок в реальном времени')
      }

      console.log(`📊 Начинаем формирование маршрутов из ${ordersToPlan.length} заказов...`)
      
      // Преобразуем ordersToPlan обратно в формат enriched для совместимости
      // ВАЖНО: Проверяем и пересчитываем deadlineAt для каждого заказа, если он отсутствует
      const enrichedForPlanning = ordersToPlan.map(o => {
        // Если deadlineAt отсутствует, пытаемся извлечь его заново из raw данных
        let deadlineAt = o.deadlineAt
        if (!deadlineAt && o.raw) {
          deadlineAt = getPlannedTime(o)
          if (deadlineAt) {
            console.log(`✅ [Планирование] Найден deadlineAt для заказа ${o.orderNumber}: ${new Date(deadlineAt).toLocaleString()}`)
          }
        }
        
        // Сохраняем все поля из o, но перезаписываем deadlineAt если пересчитали
        return {
          ...o, // Все поля из исходного объекта
          deadlineAt: deadlineAt || o.deadlineAt, // Используем пересчитанное значение или исходное
          'время на кухню': o.raw?.['время на кухню'] || o['время на кухню'] || null,
          'плановое время': o.raw?.['плановое время'] || o['плановое время'] || null,
        }
      })
      
      // УЛУЧШЕННАЯ ЛОГИКА: Глобальная оптимизация вместо только greedy
      console.log('🚀 Улучшенное планирование маршрутов с глобальной оптимизацией...')
      
      // 1. Группировка по зонам доставки
      console.log('📍 Группировка заказов по зонам доставки...')
      const zones = groupOrdersByDeliveryZones(enrichedForPlanning as Order[])
      console.log(`  Найдено ${zones.length} зон доставки`)
      
      // 2. Приоритизация с учетом плотности кластеров
      console.log('📊 Приоритизация заказов с учетом плотности...')
      const prioritized = prioritizeDenseClusters(enrichedForPlanning as Order[])
      
      // 3. Вычисление приоритетов заказов с учетом контекста
      const availableCouriers = courierSchedules.filter(s => s.isActive).length || 1
      const avgRouteLoad = enrichedForPlanning.length / Math.max(1, Math.ceil(enrichedForPlanning.length / runtimeMaxStopsPerRoute))
      const currentTime = Date.now()
      
      // УЛУЧШЕНИЕ 4: Используем улучшенную приоритизацию с адаптивными весами
      const ordersWithPriority = prioritized.map((order: any) => ({
        ...order,
        _priority: calculateOrderPriorityV2(order as Order, {
          currentTime,
          availableCouriers,
          avgRouteLoad,
          allOrders: prioritized as Order[]
        })
      }))

      if (depotCoords) {
        for (const order of ordersWithPriority) {
          let coords: Coordinates | null = null
          if (order.coords && Number.isFinite(order.coords.lat) && Number.isFinite(order.coords.lng)) {
            coords = order.coords
          } else if (order.raw?.coords && Number.isFinite(order.raw.coords.lat) && Number.isFinite(order.raw.coords.lng)) {
            coords = order.raw.coords
          } else {
            coords = routeOptimizationCache.getCoordinates(order.address)
          }
          if (!coords && order.raw?.lat && order.raw?.lng) {
            coords = { lat: order.raw.lat, lng: order.raw.lng }
          }
          if (coords) {
            const bearing = bearingBetween(depotCoords, coords)
            order._bearingFromBase = bearing
            order._directionBucket = bucketFromBearing(bearing)
          } else {
            order._bearingFromBase = null
            order._directionBucket = null
          }
        }
      }
      
      // ДОПОЛНИТЕЛЬНАЯ сортировка: сначала готовые сейчас, потом скоро готовые
      // Приоритет: готовые сейчас > скоро готовые > по общему приоритету
      ordersWithPriority.sort((a: any, b: any) => {
        const aReady = a.readyAtSource || a.readyAt || currentTime
        const bReady = b.readyAtSource || b.readyAt || currentTime
        const aMinutesUntilReady = (aReady - currentTime) / (1000 * 60)
        const bMinutesUntilReady = (bReady - currentTime) / (1000 * 60)
        
        // Готовые сейчас (<= 0 минут) - максимальный приоритет
        if (aMinutesUntilReady <= 0 && bMinutesUntilReady > 0) return -1
        if (aMinutesUntilReady > 0 && bMinutesUntilReady <= 0) return 1
        
        // Оба готовые сейчас - сортируем по общему приоритету
        if (aMinutesUntilReady <= 0 && bMinutesUntilReady <= 0) {
          return b._priority - a._priority
        }
        
        // Оба не готовые - сначала те, что готовы раньше (в ближайшие 30 минут)
        if (aMinutesUntilReady <= 30 && bMinutesUntilReady > 30) return -1
        if (aMinutesUntilReady > 30 && bMinutesUntilReady <= 30) return 1
        
        // Оба в ближайшие 30 минут или оба позже - сортируем по времени готовности
        if (aMinutesUntilReady !== bMinutesUntilReady) {
          return aMinutesUntilReady - bMinutesUntilReady
        }
        
        // Если время готовности одинаковое - по общему приоритету
        return b._priority - a._priority
      })
      
      // 4. Предварительное распределение заказов по маршрутам
      const maxRoutes = estimateMaxRoutes(ordersWithPriority as Order[], runtimeMaxStopsPerRoute)
      console.log(`📦 Предварительное распределение на ${maxRoutes} маршрутов...`)
      const preallocatedRoutes = preallocateOrdersToRoutes(ordersWithPriority as Order[], maxRoutes, zones)
      console.log(`  Распределено: ${preallocatedRoutes.map(r => r.length).join(', ')} заказов`)
      
      // 5. КЛАСТЕРИЗАЦИЯ ПО ВРЕМЕНИ ГОТОВНОСТИ
      console.log('⏰ Кластеризация заказов по времени готовности...')
      const readyTimeWindows = groupOrdersByReadyTimeWindows(ordersWithPriority as Order[], 30)
      console.log(`  Найдено ${readyTimeWindows.length} окон готовности`)
      
      // Приоритизируем окна: готовые сейчас > готовые скоро > остальные
      const currentTimeForWindows = Date.now()
      readyTimeWindows.sort((a, b) => {
        const aReady = (a[0].readyAtSource || a[0].readyAt || currentTimeForWindows)
        const bReady = (b[0].readyAtSource || b[0].readyAt || currentTimeForWindows)
        const aMinutesUntilReady = (aReady - currentTimeForWindows) / (1000 * 60)
        const bMinutesUntilReady = (bReady - currentTimeForWindows) / (1000 * 60)
        
        // Готовые сейчас (<= 0 минут) - максимальный приоритет
        if (aMinutesUntilReady <= 0 && bMinutesUntilReady > 0) return -1
        if (aMinutesUntilReady > 0 && bMinutesUntilReady <= 0) return 1
        
        // Оба готовые сейчас - по размеру окна (больше = лучше)
        if (aMinutesUntilReady <= 0 && bMinutesUntilReady <= 0) {
          return b.length - a.length
        }
        
        // Оба не готовые - сначала те, что готовы раньше
        return aMinutesUntilReady - bMinutesUntilReady
      })
      
      // 6. Приоритизация заказов с учетом кластеров (для обратной совместимости)
      console.log(`🔗 Поиск кластеров заказов (радиус: ${optimizedSettings.proximityGroupingRadius / 1000} км)...`)
      let enrichedForPlanningGrouped: any[] = readyTimeWindows.flat()
      const clusters = findClusters(enrichedForPlanningGrouped as Order[], optimizedSettings.proximityGroupingRadius / 1000)
      console.log(`  Найдено ${clusters.length} кластеров`)
      // Сортируем кластеры по размеру и приоритету
      clusters.sort((a, b) => {
        // Большие кластеры первыми
        if (a.length !== b.length) return b.length - a.length
        // Затем по среднему времени готовности
        const aAvgReady = getAverageReadyTime(a)
        const bAvgReady = getAverageReadyTime(b)
        return aAvgReady - bAvgReady
      })
      enrichedForPlanningGrouped = clusters.flat()

      const routes: any[] = []
      let remaining = enrichedForPlanningGrouped.slice()
      
      // ОПТИМИЗАЦИЯ 4: Используем Set для быстрой проверки использованных заказов
      const usedOrderIds = new Set<string>()
      const getOrderId = (order: any): string => {
        return order.id || order.raw?.id || 
          `${order.orderNumber || order.raw?.orderNumber || ''}_${order.address || ''}`
      }
      
      // ОПТИМИЗАЦИЯ 7: Фильтруем remaining от уже использованных заказов
      const filterRemaining = () => {
        remaining = remaining.filter(order => !usedOrderIds.has(getOrderId(order)))
      }

      while (remaining.length > 0) {
        setOptimizationProgress({
          current: routes.length + 1,
          total: enrichedForPlanningGrouped.length,
          message: `Создание маршрута #${routes.length + 1}...`
        })
        // ОПТИМИЗАЦИЯ 7: Фильтруем remaining перед выбором seed
        filterRemaining()
        if (remaining.length === 0) {
          console.log('✅ Все заказы распределены по маршрутам')
          break
        }
        
        // Start route from the highest priority order (готовый + ранний дедлайн)
        const seed = remaining.shift()!
        const seedId = getOrderId(seed)
        usedOrderIds.add(seedId)
        let routeChain = [seed] // routeChain содержит только заказы (без старта и финиша)
        let routeDirectionBucket: number | null = seed._directionBucket ?? null
        console.log(`🔄 Создаём маршрут #${routes.length + 1}, первый заказ: ${seed.address}`)

        // Сохраняем подробную информацию о логике формирования маршрута
        const routeReasons: string[] = []
        
        // Для первого заказа тоже создаем детальный формат reason
        // ВАЖНО: Используем readyAtSource (время на кухню без упаковки), а не readyAt (с упаковкой)
        const seedReadyAt = seed.readyAtSource || seed.readyAt || null
        const seedReadyTime = seedReadyAt 
          ? new Date(seedReadyAt).toLocaleTimeString()
          : 'не указано'
        // Извлекаем зону доставки из разных источников
        const seedZone = seed.deliveryZone || 
                        seed.raw?.deliveryZone || 
                        seed.raw?.['Зона доставки'] ||
                        extractZoneFromAddress(seed.address) ||
                        'не указана'
        const seedDeadlineInfo = seed.deadlineAt 
          ? {
              deadline: new Date(seed.deadlineAt).toLocaleTimeString(),
              ok: true
            }
          : null
        
        // Вычисляем приоритет первого заказа
        const seedPriority = seed._priority || 0
        
        // Находим альтернативные кандидаты для сравнения (топ-3 по приоритету)
        const alternativeCandidates = ordersWithPriority
          .filter(o => o !== seed && o._priority > 0)
          .sort((a, b) => (b._priority || 0) - (a._priority || 0))
          .slice(0, 3)
          .map(o => ({
            orderNumber: o.orderNumber || o.raw?.orderNumber || '?',
            priority: (o._priority || 0).toFixed(0),
            reason: (o._priority || 0) < seedPriority ? 'ниже приоритет' : 'равный приоритет'
          }))
        
        // Вычисляем логику формирования для первого заказа
        const seedReadyTimeDiff = seedReadyAt ? Math.abs(seedReadyAt - Date.now()) / (1000 * 60) : 0
        const seedReadyTimeCompatible = seedReadyTimeDiff <= optimizedSettings.maxReadyTimeDifferenceMinutes
        const seedDeadlineOk = seedDeadlineInfo ? seedDeadlineInfo.ok : true
        
        // Формируем детальный reason для первого заказа
        routeReasons.push(`✅ Заказ #${seed.orderNumber || seed.raw?.orderNumber || '?'} "${seed.address.substring(0, 50)}..." выбран как первый заказ маршрута | 📊 Оценка приоритета: ${seedPriority.toFixed(0)}/100 | ⏰ Время готовности: ${seedReadyTime} | 🏘️ Зона доставки: ${seedZone} | ⏱️ Дедлайн: ${seedDeadlineInfo ? seedDeadlineInfo.deadline : 'не указан'} | 🎯 Почему именно этот заказ: | • Выбран как первый заказ, т.к. имеет наивысший приоритет (готовность + ранний дедлайн) | • Готовность: ${seedReadyAt ? (seedReadyAt <= Date.now() ? 'готов' : `готов через ${Math.round((seedReadyAt - Date.now()) / 60000)} мин`) : 'готов'} | • Приоритет: ${seedPriority.toFixed(0)}/100 (готовность + дедлайн + близость) | 📊 Сравнение с альтернативами: | ${alternativeCandidates.length > 0 ? alternativeCandidates.map(alt => `• Заказ #${alt.orderNumber}: приоритет ${alt.priority}/100 (${alt.reason})`).join(' | ') : '• Альтернативные кандидаты не найдены'} | 💡 Результат: маршрут начат с заказа, готового к немедленной отправке | 🔍 Логика формирования: | • Временная совместимость: ${seedReadyTimeCompatible ? 'совместимо' : 'несовместимо'} (разница ${seedReadyTimeDiff.toFixed(0)} мин, лимит ${optimizedSettings.maxReadyTimeDifferenceMinutes} мин) | • Географическая близость: заказ выбран как стартовая точка маршрута | • Соблюдение дедлайнов: ${seedDeadlineInfo ? (seedDeadlineOk ? 'соблюден' : 'нарушен') + ` (дедлайн ${seedDeadlineInfo.deadline})` : 'не указан'}`)
        
        // Получаем координаты последнего заказа в цепочке для быстрой оценки
        let lastOrderCoords: Coordinates | null = null
        if (routeChain.length > 0) {
          lastOrderCoords = await getCoordinates(routeChain[routeChain.length - 1].address)
          if (routeDirectionBucket === null && depotCoords && lastOrderCoords) {
            const seedBearing = bearingBetween(depotCoords, lastOrderCoords)
            if (seedBearing !== null) {
              routeDirectionBucket = bucketFromBearing(seedBearing)
              routeChain[0]._bearingFromBase = seedBearing
              routeChain[0]._directionBucket = routeDirectionBucket
            }
          }
        }
        
        // Предварительная фильтрация по времени готовности (пункт 3)
        let compatibleCandidates: any[] = remaining
        if (optimizedSettings.maxReadyTimeDifferenceMinutes > 0 && routeChain.length > 0) {
          compatibleCandidates = filterByReadyTimeCompatibility(
            remaining as Order[],
            routeChain as Order[],
            optimizedSettings.maxReadyTimeDifferenceMinutes
          )
          console.log(`🔍 Предварительная фильтрация по времени: ${remaining.length} -> ${compatibleCandidates.length} совместимых кандидатов`)
        }
        
        // УЛУЧШЕНИЕ 1: Предварительная фильтрация по расстоянию Haversine (быстрее чем Google API)
        if (optimizedSettings.maxDistanceBetweenOrdersKm !== null && optimizedSettings.maxDistanceBetweenOrdersKm > 0) {
          const beforeDistanceFilter = compatibleCandidates.length
          compatibleCandidates = prefilterCandidatesByDistance(
            compatibleCandidates as Order[],
            lastOrderCoords,
            optimizedSettings.maxDistanceBetweenOrdersKm
          )
          console.log(`🔍 Предварительная фильтрация по расстоянию: ${beforeDistanceFilter} -> ${compatibleCandidates.length} кандидатов`)
        }
        
        // Динамическое ограничение лимита проверок (пункт 8)
        const baseLimit = 30
        const limit = routeChain.length < 2 ? 50 : baseLimit // Больше проверок для первого заказа
        const hasUrgent = routeChain.some(o => o.deadlineAt && (o.deadlineAt - Date.now()) < 30 * 60 * 1000)
        const adaptiveLimit = hasUrgent ? limit * 2 : limit // Больше проверок если есть срочные заказы
        
        // ОПТИМИЗАЦИЯ 2: Умная фильтрация кандидатов с предварительной оценкой
        // Сначала быстро оцениваем всех кандидатов без API запросов (только Haversine)
        const quickCandidates = compatibleCandidates.map(candidate => {
          let candidateCoords: Coordinates | null = null
          if (candidate.coords && Number.isFinite(candidate.coords.lat) && Number.isFinite(candidate.coords.lng)) {
            candidateCoords = candidate.coords
          } else {
            candidateCoords = routeOptimizationCache.getCoordinates(candidate.address)
          }
          
          if (!candidateCoords || !lastOrderCoords) {
            return { candidate, quickScore: -Infinity, distanceKm: Infinity }
          }
          
          const distanceKm = getCachedDistance(lastOrderCoords, candidateCoords)
          
          // Быстрая оценка на основе расстояния и готовности
          let quickScore = 0
          const readyAt = candidate.readyAtSource || candidate.readyAt || null
          const now = Date.now()
          
          if (readyAt) {
            const minutesUntilReady = (readyAt - now) / (1000 * 60)
            if (minutesUntilReady <= 0) quickScore += 200
            else if (minutesUntilReady <= 15) quickScore += 180 - (minutesUntilReady * 2)
            else if (minutesUntilReady <= 30) quickScore += 150 - ((minutesUntilReady - 15) * 2)
            else quickScore += 100 - ((minutesUntilReady - 30) * 1)
          } else {
            quickScore += 150
          }
          
          // УЛУЧШЕНИЕ: Более строгий штраф за расстояние
          // Максимальное расстояние между соседними заказами - 15 км (реалистичный маршрут)
          const maxDistKm = Math.min(optimizedSettings.maxDistanceBetweenOrdersKm || 15, 15)
          const strictMaxDistKm = 15 // Жесткий лимит для реалистичности
          
          // Сильный штраф за большие расстояния
          if (distanceKm > strictMaxDistKm) {
            quickScore -= 2000 // Очень большой штраф за превышение
          } else if (distanceKm > maxDistKm * 0.8) {
            quickScore -= 500 // Штраф за близость к лимиту
          } else {
            // Бонус за близость (чем ближе, тем лучше)
            quickScore += Math.max(0, 50 * (1 - distanceKm / maxDistKm))
          }
          
          // Дополнительный штраф если превышает лимит
          if (optimizedSettings.maxDistanceBetweenOrdersKm && distanceKm > optimizedSettings.maxDistanceBetweenOrdersKm) {
            quickScore -= 1000
          }
          
          return { candidate, quickScore, distanceKm }
        })
        
        // Сортируем по быстрой оценке и берем топ кандидатов
        quickCandidates.sort((a, b) => b.quickScore - a.quickScore)
        // УЛУЧШЕНИЕ: Более строгая фильтрация - только реалистичные расстояния (макс 15 км)
        const strictMaxDistance = 15 // Жесткий лимит для реалистичности
        const topCandidates = quickCandidates
          .filter(c => c.quickScore > 0 && c.distanceKm <= strictMaxDistance)
          .slice(0, Math.min(20, compatibleCandidates.length)) // Ограничиваем до 20 лучших
        
        const candidatesToEvaluate = topCandidates.map(c => c.candidate)
        console.log(`📊 Быстрая фильтрация: ${compatibleCandidates.length} -> ${candidatesToEvaluate.length} топ-кандидатов`)
        
        setOptimizationProgress({
          current: routes.length + 1,
          total: enrichedForPlanning.length,
          message: `Оценка ${candidatesToEvaluate.length} кандидатов для маршрута #${routes.length + 1}...`
        })
        
        // УЛУЧШЕНИЕ 2: Получаем координаты базы для расчета обратного пути
        const baseCoords = depotCoords || await getCoordinates(defaultStartAddress)
        const directionTracker: RouteDirectionTracker = {
          base: baseCoords,
          bearings: [],
          primary: null
        }
        if (baseCoords && lastOrderCoords) {
          updateDirectionTracker(directionTracker, bearingBetween(baseCoords, lastOrderCoords))
        }
        const routePosition = routeChain.length / Math.max(1, routeChain.length + 1)
        
        // ОПТИМИЗАЦИЯ 5: Предварительно загружаем координаты всех кандидатов параллельно
        const candidateCoordsMap = new Map<any, Coordinates | null>()
        await Promise.all(
          candidatesToEvaluate.map(async (candidate) => {
            let coords: Coordinates | null = null
            if (candidate.coords && Number.isFinite(candidate.coords.lat) && Number.isFinite(candidate.coords.lng)) {
              coords = candidate.coords
            } else {
              coords = routeOptimizationCache.getCoordinates(candidate.address)
              if (!coords) {
                coords = await getCoordinates(candidate.address)
              }
            }
            candidateCoordsMap.set(candidate, coords)
          })
        )
        
        // ОПТИМИЗАЦИЯ 3: Параллельная оценка кандидатов с кэшированием координат
        const candidateEvaluations = await Promise.all(
          candidatesToEvaluate.map(async (candidate, idx) => {
            // ОПТИМИЗАЦИЯ 5: Используем предзагруженные координаты
            const candidateCoords = candidateCoordsMap.get(candidate) || null
            
            // УЛУЧШЕНИЕ 2: Используем улучшенную оценку кандидата V2 с учетом обратного пути
            const enhancedEval = enhancedCandidateEvaluationV2(
              candidate as Order,
              routeChain as Order[],
              {
                lastOrderCoords,
                allOrders: enrichedForPlanning as Order[],
                baseCoords: baseCoords || null,
                routePosition
              }
            )
            
            // Дополнительная оценка для совместимости (используем старую логику как дополнение)
            // ОПТИМИЗАЦИЯ: Используем кэшированные координаты для быстрой оценки
            const basicEval = candidateCoords && lastOrderCoords
              ? {
                  score: enhancedEval.score * 0.8, // Используем больше веса для enhancedEval
                  distanceKm: getCachedDistance(lastOrderCoords, candidateCoords),
                  reason: `Расстояние: ${getCachedDistance(lastOrderCoords, candidateCoords).toFixed(1)} км`
                }
              : await quickEvaluateCandidate(
                  candidate,
                  lastOrderCoords,
                  routeChain,
                  enrichedForPlanning
                )
            
            // Комбинируем оценки: 75% улучшенной V2, 25% базовой (увеличиваем вес V2)
            const combinedScore = enhancedEval.score * 0.75 + basicEval.score * 0.25
            
            return { 
              candidate, 
              originalIndex: idx, 
              score: combinedScore,
              distanceKm: enhancedEval.distance || basicEval.distanceKm || 0,
              timeCompatibility: enhancedEval.timeCompatibility,
              zoneMatch: enhancedEval.zoneMatch,
              deadlineUrgency: enhancedEval.deadlineUrgency,
              returnDistance: enhancedEval.returnDistance,
              routePositionScore: enhancedEval.routePositionScore,
              routeDisruptionScore: enhancedEval.routeDisruptionScore,
              reason: basicEval.reason || `Оценка: ${combinedScore.toFixed(0)}`
            }
          })
        )
        
        // Сортируем по оценке (лучшие первыми) и фильтруем явно неподходящие
        candidateEvaluations.sort((a, b) => b.score - a.score)
        // УЛУЧШЕНИЕ: Строгая фильтрация по расстоянию - не более 15 км между заказами
        const strictMaxDistanceBetweenOrders = 15 // Жесткий лимит для реалистичности
        const promisingCandidates = candidateEvaluations.filter(e => 
          e.score > 0 && 
          e.distanceKm <= strictMaxDistanceBetweenOrders // Строгий лимит расстояния
        )
        
        // УЛУЧШЕНИЕ АЛГОРИТМА 1: Раннее завершение если найден отличный кандидат (score > 300)
        const excellentCandidates = promisingCandidates.filter(e => e.score > 300)
        if (excellentCandidates.length > 0 && routeChain.length < 2) {
          console.log(`⭐ Найдено ${excellentCandidates.length} отличных кандидатов, используем только их`)
          // Используем только отличных кандидатов для первого заказа
          promisingCandidates.splice(0, promisingCandidates.length, ...excellentCandidates.slice(0, 10))
        }
        
          // УЛУЧШЕНИЕ АЛГОРИТМА 2: Улучшенная эвристика - приоритизация по комбинации факторов
        promisingCandidates.sort((a, b) => {
          // Комбинированная оценка: score + бонус за близость + бонус за готовность
          const aBonus = (a.timeCompatibility ? 50 : 0) + (a.zoneMatch ? 30 : 0) + (a.deadlineUrgency || 0)
          const bBonus = (b.timeCompatibility ? 50 : 0) + (b.zoneMatch ? 30 : 0) + (b.deadlineUrgency || 0)
          
          // УЛУЧШЕНИЕ: Бонус за доставку как можно раньше от планового времени
          // Если у кандидата есть дедлайн, даем бонус за возможность доставить раньше
          let aEarlyDeliveryBonus = 0
          let bEarlyDeliveryBonus = 0
          if (a.candidate.deadlineAt) {
            const aDeadline = a.candidate.deadlineAt
            const estimatedDeliveryTime = Date.now() + (a.distanceKm || 0) * 60000 // Примерная оценка
            const minutesBeforeDeadline = (aDeadline - estimatedDeliveryTime) / (1000 * 60)
            if (minutesBeforeDeadline > 30) aEarlyDeliveryBonus = 40 // Большой бонус за раннюю доставку
            else if (minutesBeforeDeadline > 15) aEarlyDeliveryBonus = 20
            else if (minutesBeforeDeadline > 0) aEarlyDeliveryBonus = 10
          }
          if (b.candidate.deadlineAt) {
            const bDeadline = b.candidate.deadlineAt
            const estimatedDeliveryTime = Date.now() + (b.distanceKm || 0) * 60000
            const minutesBeforeDeadline = (bDeadline - estimatedDeliveryTime) / (1000 * 60)
            if (minutesBeforeDeadline > 30) bEarlyDeliveryBonus = 40
            else if (minutesBeforeDeadline > 15) bEarlyDeliveryBonus = 20
            else if (minutesBeforeDeadline > 0) bEarlyDeliveryBonus = 10
          }
          
          // УЛУЧШЕНИЕ АЛГОРИТМА 3: Дополнительные факторы качества
          // Бонус за эффективность маршрута (меньше обратного пути)
          const aReturnBonus = a.returnDistance && a.returnDistance < 5 ? 20 : 0
          const bReturnBonus = b.returnDistance && b.returnDistance < 5 ? 20 : 0
          
          // Бонус за позицию в маршруте (лучше в начале или конце)
          const aPositionBonus = (a.routePositionScore || 1) > 1.1 ? 15 : 0
          const bPositionBonus = (b.routePositionScore || 1) > 1.1 ? 15 : 0
          
          // Бонус за отсутствие разрушения маршрута
          const aDisruptionBonus = (a.routeDisruptionScore || 1) > 1.0 ? 10 : 0
          const bDisruptionBonus = (b.routeDisruptionScore || 1) > 1.0 ? 10 : 0
          
          const aTotal = a.score + aBonus + aEarlyDeliveryBonus + aReturnBonus + aPositionBonus + aDisruptionBonus
          const bTotal = b.score + bBonus + bEarlyDeliveryBonus + bReturnBonus + bPositionBonus + bDisruptionBonus
          
          return bTotal - aTotal
        })
        
        console.log(`📊 Оценено кандидатов: ${candidateEvaluations.length}, перспективных: ${promisingCandidates.length}`)

        // ОПТИМИЗАЦИЯ 6: Параллельная предварительная проверка топ-кандидатов (первые 5)
        const topCandidatesToPreCheck = promisingCandidates.slice(0, Math.min(5, promisingCandidates.length))
        const preCheckResults = await Promise.all(
          topCandidatesToPreCheck.map(async (evalItem) => {
            const candidate = evalItem.candidate
            const trialChain = [...routeChain, candidate]
            try {
              const result = await apiManager.checkRouteWithTraffic(trialChain, {
                includeStartEnd: true,
                useCache: true,
                priority: 'high',
                prefilter: true,
                maxDistanceKm: optimizedSettings.maxDistanceBetweenOrdersKm,
                maxReadyTimeDiffMinutes: optimizedSettings.maxReadyTimeDifferenceMinutes
              })
              return { evalItem, result, candidate }
            } catch (err) {
              return { evalItem, result: { feasible: false }, candidate }
            }
          })
        )
        
        // Создаем Map для быстрого доступа к предпроверенным результатам
        const preCheckMap = new Map<any, any>()
        preCheckResults.forEach(({ evalItem, result }) => {
          if (result.feasible) {
            preCheckMap.set(evalItem.candidate, result)
          }
        })
        
        console.log(`⚡ Предпроверено ${preCheckMap.size} из ${topCandidatesToPreCheck.length} топ-кандидатов`)

        // Greedy add next orders by score (близость + дедлайн)
        // Максимум заказов = maxStopsPerRoute (это МАКСИМАЛЬНОЕ ограничение, не обязательное)
        // Маршрут завершается, когда:
        // 1. Достигнут максимум заказов ИЛИ
        // 2. Не найдено подходящих кандидатов после проверки лимита ИЛИ
        // 3. Добавление следующего заказа не улучшает маршрут (добровольное завершение)
        let processedCount = 0
        let noImprovementCount = 0 // Счетчик последовательных попыток без улучшения
        const maxNoImprovement = 5 // Максимум попыток без улучшения перед завершением маршрута
        
        for (const evalItem of promisingCandidates) {
          if (routeChain.length >= runtimeMaxStopsPerRoute) {
            console.log(`📊 Маршрут достиг максимального количества точек (${runtimeMaxStopsPerRoute})`)
            break
          }
          if (processedCount >= adaptiveLimit) {
            console.log(`📊 Достигнут лимит проверок (${adaptiveLimit})`)
            break
          }
          if (noImprovementCount >= maxNoImprovement && routeChain.length > 1) {
            console.log(`📊 Маршрут завершен: ${noImprovementCount} последовательных попыток без улучшения`)
            break
          }
          
          const candidate = evalItem.candidate
          
          // ОПТИМИЗАЦИЯ 4: Быстрая проверка использованных заказов через Set
          const candidateId = getOrderId(candidate)
          if (usedOrderIds.has(candidateId)) {
            console.log(`⏭️ Заказ ${candidate.orderNumber || candidate.raw?.orderNumber || '?'} уже использован, пропускаем`)
            processedCount++
            continue
          }
          
          // Проверка времени готовности уже сделана в предварительной фильтрации,
          // но дублируем для надежности
          if (!isReadyTimeCompatible(candidate, routeChain, optimizedSettings.maxReadyTimeDifferenceMinutes)) {
            processedCount++
            continue
          }
          
          // УЛУЧШЕНИЕ: Строгая проверка максимального расстояния - не более 15 км между заказами
          const strictMaxDistance = 15 // Жесткий лимит для реалистичности
          const distanceKm = evalItem.distanceKm
          if (distanceKm > strictMaxDistance) {
            console.log(`⏭️ Пропущен заказ "${candidate.address.substring(0, 40)}...": расстояние ${distanceKm.toFixed(1)} км превышает реалистичный лимит ${strictMaxDistance} км`)
            processedCount++
            noImprovementCount++
            continue
          }
          
          // Дополнительная проверка по настройкам (если они еще строже)
          if (optimizedSettings.maxDistanceBetweenOrdersKm !== null && optimizedSettings.maxDistanceBetweenOrdersKm > 0) {
            if (distanceKm > optimizedSettings.maxDistanceBetweenOrdersKm) {
              console.log(`⏭️ Пропущен заказ "${candidate.address.substring(0, 40)}...": предварительное расстояние ${distanceKm.toFixed(1)} км превышает лимит ${optimizedSettings.maxDistanceBetweenOrdersKm} км`)
              processedCount++
              noImprovementCount++
              continue
            }
          }

          const candidateBucket = candidate._directionBucket ?? null
          if (!isBucketCompatible(routeDirectionBucket, candidateBucket, routeChain.length)) {
            console.log(`⏭️ Пропущен заказ "${candidate.address.substring(0, 40)}..." из-за направления (корзина ${candidateBucket ?? '—'} против ${routeDirectionBucket ?? '—'})`)
            processedCount++
            noImprovementCount++
            continue
          }

          // ОПТИМИЗАЦИЯ 5: Используем предзагруженные координаты
          let candidateCoords: Coordinates | null = candidateCoordsMap.get(candidate) || null
          let candidateBearingFromBase: number | null = null
          if (directionTracker.base) {
            if (!candidateCoords) {
              // Если координаты не были предзагружены, получаем их (редкий случай)
              candidateCoords = await getCoordinates(candidate.address)
              candidateCoordsMap.set(candidate, candidateCoords)
            }
            if (candidateCoords) {
              candidateBearingFromBase = bearingBetween(directionTracker.base, candidateCoords)
              candidate._bearingFromBase = candidateBearingFromBase
              if (candidate._directionBucket == null) {
                candidate._directionBucket = bucketFromBearing(candidateBearingFromBase)
              }
            }
            if (!isDirectionCompatible(directionTracker, candidateBearingFromBase, routeChain.length)) {
              const diffText = directionTracker.primary !== null && candidateBearingFromBase !== null
                ? angularDifference(directionTracker.primary, candidateBearingFromBase).toFixed(0)
                : null
              console.log(`⏭️ Пропущен заказ "${candidate.address.substring(0, 40)}..." из-за разворота маршрута${diffText ? ` (отклонение ${diffText}°)` : ''}`)
              processedCount++
              noImprovementCount++
              continue
            }
          }
          
          const trialChain: any[] = [...routeChain, candidate]
          
            try {
            // ОПТИМИЗАЦИЯ 6: Используем предпроверенный результат если доступен
            let result = preCheckMap.get(candidate)
            if (!result) {
              // УЛУЧШЕНИЕ 1: Используем оптимизированный менеджер API с учетом трафика
              result = await apiManager.checkRouteWithTraffic(trialChain, {
                includeStartEnd: true,
                useCache: true,
                priority: 'high', // Высокий приоритет для активного формирования маршрута
                prefilter: true,
                maxDistanceKm: optimizedSettings.maxDistanceBetweenOrdersKm,
                maxReadyTimeDiffMinutes: optimizedSettings.maxReadyTimeDifferenceMinutes
              })
            }
            
            const feasible = result.feasible
            const legs = result.legs
            
            if (!feasible || !legs || legs.length === 0) {
              console.log(`⚠️ Кандидат "${candidate.address.substring(0, 40)}..." не подходит (не удалось построить маршрут)`)
              processedCount++
              continue
            }
            
            // УЛУЧШЕНИЕ: Строгая проверка максимального расстояния между соседними заказами - не более 15 км
            const strictMaxDistanceBetweenOrders = 15 // Жесткий лимит для реалистичности
              let exceedsLimit = false
              // legs структура: [start->order1, order1->order2, ..., orderN->end]
              // Проверяем legs[1] до legs[trialChain.length-1] (расстояния между заказами)
              for (let legIdx = 1; legIdx < trialChain.length; legIdx++) {
                if (legIdx >= legs.length) break // Защита от выхода за границы
                const leg = legs[legIdx]
                const legDistanceKm = (leg.distance?.value || 0) / 1000
                
                // Сначала проверяем жесткий лимит 15 км
                if (legDistanceKm > strictMaxDistanceBetweenOrders) {
                  exceedsLimit = true
                  const order1 = trialChain[legIdx - 1]
                  const order2 = trialChain[legIdx]
                  const order1Addr = order1.address?.substring(0, 40) || '?'
                  const order2Addr = order2.address?.substring(0, 40) || '?'
                  const order1Num = order1.orderNumber || order1.raw?.orderNumber || '?'
                  const order2Num = order2.orderNumber || order2.raw?.orderNumber || '?'
                  console.log(`⏭️ Пропущен маршрут: расстояние ${legDistanceKm.toFixed(1)} км между заказами превышает реалистичный лимит ${strictMaxDistanceBetweenOrders} км`)
                  console.log(`   Заказ ${order1Num} "${order1Addr}..." → Заказ ${order2Num} "${order2Addr}..."`)
                  break
                }
                
                // Дополнительная проверка по настройкам (если они еще строже)
                if (optimizedSettings.maxDistanceBetweenOrdersKm !== null && optimizedSettings.maxDistanceBetweenOrdersKm > 0) {
                  if (legDistanceKm > optimizedSettings.maxDistanceBetweenOrdersKm) {
                    exceedsLimit = true
                    const order1 = trialChain[legIdx - 1]
                    const order2 = trialChain[legIdx]
                    const order1Addr = order1.address?.substring(0, 40) || '?'
                    const order2Addr = order2.address?.substring(0, 40) || '?'
                    const order1Num = order1.orderNumber || order1.raw?.orderNumber || '?'
                    const order2Num = order2.orderNumber || order2.raw?.orderNumber || '?'
                    console.log(`⏭️ Пропущен маршрут: расстояние между заказами ${legDistanceKm.toFixed(1)} км превышает лимит ${optimizedSettings.maxDistanceBetweenOrdersKm} км`)
                    console.log(`   Заказ ${order1Num} "${order1Addr}..." → Заказ ${order2Num} "${order2Addr}..."`)
                    break
                  }
                }
              }
              if (exceedsLimit) {
                processedCount++
                noImprovementCount++
                continue
              }

          // Compute ETAs per stop relative to a start time that respects readyAt
          // Структура legs: [start->order1, order1->order2, ..., orderN->end]
          // Всего legs = количество заказов + 1 (старт->первый заказ) + 1 (последний заказ->финиш)
          // ВАЖНО: Используем readyAtSource (время на кухню без упаковки), а не readyAt (с упаковкой)
          // Заказ может быть готов за 5 минут до или после времени на кухню (окно ±5 минут)
          // Если readyAtSource отсутствует, пробуем readyAt, если и его нет - используем текущее время (заказ готов)
          const firstOrderReadyAt = trialChain[0].readyAtSource || trialChain[0].readyAt || null
          let startTime = now
          if (firstOrderReadyAt) {
            // Окно готовности: заказ может быть готов от (readyAt - 5 мин) до (readyAt + 5 мин)
            const readyWindowStart = firstOrderReadyAt - KITCHEN_READY_WINDOW_MS
            // Стартуем не раньше, чем за 5 минут до готовности первого заказа
            startTime = Math.max(now, readyWindowStart)
          }
          let currentEta = startTime
          let totalWaitMs = 0
          let ok = true
          
          // Проверяем каждый заказ по порядку
          // leg[0] = путь от стартового адреса к первому заказу
          // leg[1..n-1] = пути между заказами
          // leg[n] = путь от последнего заказа к финишу (не проверяем дедлайны для него)
          for (let j = 0; j < trialChain.length; j++) {
            const legIndex = j // leg[j] - путь к заказу j (или от start, или от предыдущего заказа)
            if (legIndex >= legs.length - 1) break // -1 потому что последний leg это путь к финишу
            
            const leg = legs[legIndex]
            // Используем duration_in_traffic если доступно (учитывает трафик), иначе duration
            const travelSeconds = leg.duration_in_traffic?.value || leg.duration?.value || 0
            const travel = travelSeconds * 1000
            currentEta += travel
            
            const node = trialChain[j] // текущий заказ
            // ВАЖНО: Используем readyAtSource (время на кухню без упаковки), а не readyAt (с упаковкой)
            // Заказ может быть готов за 5 минут до или после времени на кухню (окно ±5 минут)
            // If node has readyAtSource in future, we allow waiting (courier can wait), but enforce deadline if present
            const deadline = node.deadlineAt
            const readyAt = node.readyAtSource || node.readyAt || null
            
            // Если readyAt отсутствует, считаем заказ готовым (не ждем)
            if (readyAt) {
              // Окно готовности: заказ может быть готов от (readyAt - 5 мин) до (readyAt + 5 мин)
              const readyWindowStart = readyAt - KITCHEN_READY_WINDOW_MS
              const readyWindowEnd = readyAt + KITCHEN_READY_WINDOW_MS
              
              if (currentEta < readyWindowStart) {
                // Курьер приедет раньше, чем за 5 минут до готовности - нужно ждать
                const wait = readyWindowStart - currentEta
                const waitMin = wait / 60000
                if (waitMin > maxWaitPerStopMin) { 
                  console.log(`⚠️ Заказ ${node.orderNumber || '?'} не может быть добавлен: ожидание ${waitMin.toFixed(1)} мин превышает лимит ${maxWaitPerStopMin} мин`)
                  ok = false
                  break
                }
                totalWaitMs += wait
                currentEta = readyWindowStart // Начинаем с начала окна готовности
              } else if (currentEta > readyWindowEnd) {
                // Курьер приедет позже, чем через 5 минут после готовности - заказ уже готов, не ждем
                // Но логируем для информации
                const delayMin = (currentEta - readyWindowEnd) / 60000
                console.log(`ℹ️ Заказ ${node.orderNumber || '?'} будет забран с задержкой ${delayMin.toFixed(1)} мин после окна готовности (окно: ${new Date(readyWindowStart).toLocaleTimeString()} - ${new Date(readyWindowEnd).toLocaleTimeString()})`)
                // Не добавляем ожидание, т.к. заказ уже готов
              } else {
                // Курьер приедет в окне готовности (±5 минут) - заказ будет готов, не ждем
                // Не добавляем ожидание
              }
            }
            
            // Добавляем время на отдачу заказа (+5 минут) после прибытия
            currentEta += DELIVERY_TIME_MS
            
            // УЛУЧШЕНИЕ: Приоритизация доставки как можно раньше от планового времени
            // Проверяем дедлайн: форс-мажор (+9 минут) расширяет дедлайн (не добавляется к ETA)
            // Плановое время 10:00 -> с форс-мажором дедлайн становится 10:09
            if (deadline) {
              const deadlineWithForceMajeure = deadline + FORCE_MAJEURE_MS
              if (currentEta > deadlineWithForceMajeure) {
                console.log(`⚠️ Заказ ${node.orderNumber || '?'} не может быть добавлен: дедлайн будет нарушен (ETA: ${new Date(currentEta).toLocaleString()}, дедлайн+форс-мажор: ${new Date(deadlineWithForceMajeure).toLocaleString()})`)
                ok = false
                break
              }
              
              // БОНУС: Доставка как можно раньше от планового времени
              // Если можем доставить заказ значительно раньше дедлайна - это хорошо
              const timeBeforeDeadline = (deadline - currentEta) / (1000 * 60) // минуты до дедлайна
              if (timeBeforeDeadline > 30) {
                // Доставляем более чем за 30 минут до дедлайна - отлично
                // Это будет учтено в общей оценке маршрута
                console.log(`✅ Заказ ${node.orderNumber || '?'} будет доставлен за ${timeBeforeDeadline.toFixed(0)} мин до дедлайна - отлично!`)
              } else if (timeBeforeDeadline > 15) {
                // Доставляем за 15-30 минут до дедлайна - хорошо
                console.log(`✅ Заказ ${node.orderNumber || '?'} будет доставлен за ${timeBeforeDeadline.toFixed(0)} мин до дедлайна`)
              } else if (timeBeforeDeadline > 0) {
                // Доставляем менее чем за 15 минут до дедлайна - приемлемо, но не идеально
                console.log(`⚠️ Заказ ${node.orderNumber || '?'} будет доставлен за ${timeBeforeDeadline.toFixed(0)} мин до дедлайна - близко к лимиту`)
              }
            } else {
              // Если дедлайн не найден, это не критично, но логируем для информации
              if (j === 0 || j === trialChain.length - 1) {
                // Логируем только для первого и последнего заказа, чтобы не спамить
                console.log(`ℹ️ Заказ ${node.orderNumber || '?'} не имеет дедлайна (будет доставлен при первой возможности)`)
              }
            }
          }
          // Hard limits by route totals
          // legs включает: [start->order1, order1->order2, ..., orderN->end]
          // При проверке лимитов используем только время до последнего заказа (без возврата)
          // legs.slice(0, trialChain.length) = все legs кроме последнего (пути к финишу)
          const timeToLastOrder = legs.slice(0, trialChain.length).reduce((acc: number, leg: any) => {
            // Используем duration_in_traffic если доступно (учитывает трафик)
            return acc + (leg.duration_in_traffic?.value || leg.duration?.value || 0)
          }, 0)
          const distanceToLastOrder = legs.slice(0, trialChain.length).reduce((acc: number, leg: any) => {
            return acc + (leg.distance?.value || 0)
          }, 0)
          
          // Добавляем только время на отдачу для каждого заказа (форс-мажор расширяет дедлайн, не добавляется к времени)
          const deliveryTimeSeconds = trialChain.length * DELIVERY_TIME_MINUTES * 60
          
          // Проверяем лимиты только по времени/дистанции до последнего заказа (без возврата)
          const totalMin = (timeToLastOrder + totalWaitMs / 1000 + deliveryTimeSeconds) / 60
          const totalKm = distanceToLastOrder / 1000
          const adjustedTotalMin = totalMin + runtimeTrafficBufferMinutes
          
          // Проверка эффективности маршрута (пункт 9)
          const routeEfficiency = calculateRouteEfficiency(
            trialChain,
            distanceToLastOrder,
            timeToLastOrder + deliveryTimeSeconds,
            totalWaitMs / 1000
          )
          
          if (ok && adjustedTotalMin <= runtimeMaxRouteDurationMin && totalKm <= runtimeMaxRouteDistanceKm && 
              routeEfficiency >= optimizedSettings.minRouteEfficiency) {
            
            // Проверяем, что кандидат еще не был добавлен в другой маршрут (защита от дубликатов)
            const candidateId = candidate.id || candidate.raw?.id || 
              `${candidate.orderNumber || candidate.raw?.orderNumber || ''}_${candidate.address || ''}`
            const alreadyInRoute = routeChain.some(existing => {
              const existingId = existing.id || existing.raw?.id || 
                `${existing.orderNumber || existing.raw?.orderNumber || ''}_${existing.address || ''}`
              return existingId === candidateId && existingId !== ''
            })
            
            if (alreadyInRoute) {
              console.warn(`⚠️ Кандидат "${candidate.address.substring(0, 40)}..." уже в маршруте, пропускаем`)
              processedCount++
              noImprovementCount++
              continue
            }
            
            // Проверяем улучшение маршрута: если эффективность очень низкая, пропускаем
            // Но не блокируем добавление, если маршрут еще короткий или эффективность приемлема
            const minAcceptableEfficiency = 0.3 // Минимальная приемлемая эффективность
            if (routeEfficiency < minAcceptableEfficiency && routeChain.length >= 2) {
              console.log(`⏭️ Пропущен заказ: низкая эффективность маршрута (${(routeEfficiency * 100).toFixed(0)}% < ${(minAcceptableEfficiency * 100).toFixed(0)}%)`)
              noImprovementCount++
              processedCount++
              continue
            }
            
            routeChain = trialChain
            usedOrderIds.add(candidateId) // ОПТИМИЗАЦИЯ 4: Отмечаем заказ как использованный
          if (routeDirectionBucket === null && candidate._directionBucket != null) {
            routeDirectionBucket = candidate._directionBucket
          }
            noImprovementCount = 0 // Сбрасываем счетчик при успешном добавлении
            // ОПТИМИЗАЦИЯ 7: Фильтруем remaining более эффективно
            filterRemaining()
            console.log(`🗑️ Заказ ${candidate.orderNumber || candidate.raw?.orderNumber || '?'} добавлен в маршрут (осталось: ${remaining.length})`)
            
            // ОПТИМИЗАЦИЯ 5: Обновляем координаты последнего заказа (уже должны быть в candidateCoordsMap)
            if (!candidateCoords) {
              candidateCoords = candidateCoordsMap.get(candidate) || await getCoordinates(candidate.address)
              if (candidateCoords) {
                candidateCoordsMap.set(candidate, candidateCoords)
              }
            }
            if (candidateCoords) {
              lastOrderCoords = candidateCoords
              if (directionTracker.base) {
                updateDirectionTracker(directionTracker, bearingBetween(directionTracker.base, candidateCoords))
              }
            }
            
            // Формируем детальное описание с метриками и альтернативами
            const candidateReadyAt = candidate.readyAtSource || candidate.readyAt || null
            const candidateReadyTime = candidateReadyAt 
              ? new Date(candidateReadyAt).toLocaleTimeString()
              : 'не указано'
            
            // Вычисляем метрики совместимости
            const routeReadyTimes = routeChain.map(o => o.readyAtSource || o.readyAt || Date.now())
            const minRouteReady = Math.min(...routeReadyTimes)
            const maxRouteReady = Math.max(...routeReadyTimes)
            const readyTimeDiff = candidateReadyAt 
              ? Math.abs(candidateReadyAt - (minRouteReady + maxRouteReady) / 2) / (1000 * 60)
              : 0
            const readyTimeCompatible = readyTimeDiff <= optimizedSettings.maxReadyTimeDifferenceMinutes
            
            const candidateZone = candidate.deliveryZone || extractZoneFromAddress(candidate.address)
            const routeZones = routeChain.map(o => o.deliveryZone || extractZoneFromAddress(o.address))
            const zoneMatch = routeZones.some(z => z === candidateZone)
            
            const deadlineInfo = candidate.deadlineAt 
              ? {
                  deadline: new Date(candidate.deadlineAt).toLocaleTimeString(),
                  arrival: new Date(currentEta).toLocaleTimeString(),
                  margin: Math.round((candidate.deadlineAt - currentEta) / (1000 * 60)),
                  ok: currentEta <= candidate.deadlineAt + 9 * 60 * 1000
                }
              : null
            
            // Вычисляем оценки совместимости по факторам
            const timeCompatibilityScore = readyTimeCompatible 
              ? Math.max(0, 100 - (readyTimeDiff / optimizedSettings.maxReadyTimeDifferenceMinutes) * 100)
              : 0
            const distanceScore = evalItem.distanceKm 
              ? Math.max(0, 100 - (evalItem.distanceKm / (optimizedSettings.maxDistanceBetweenOrdersKm || 10)) * 100)
              : 100
            const zoneScore = zoneMatch ? 100 : 0
            const deadlineScore = deadlineInfo 
              ? (deadlineInfo.ok ? Math.min(100, deadlineInfo.margin * 10) : 0)
              : 50
            const efficiencyScore = routeEfficiency * 100
            
            const overallCompatibility = (
              timeCompatibilityScore * 0.3 +
              distanceScore * 0.25 +
              zoneScore * 0.2 +
              deadlineScore * 0.15 +
              efficiencyScore * 0.1
            )
            
            // Находим альтернативные кандидаты для сравнения
            const alternativeCandidates = candidateEvaluations
              .filter(e => e.candidate !== candidate && e.score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, 3)
              .map(e => ({
                orderNumber: e.candidate.orderNumber || e.candidate.raw?.orderNumber || '?',
                score: e.score.toFixed(0),
                distance: e.distanceKm.toFixed(1),
                reason: e.distanceKm > evalItem.distanceKm ? 'дальше' : 
                       (e.candidate.deliveryZone || extractZoneFromAddress(e.candidate.address)) !== candidateZone ? 'другая зона' :
                       'ниже оценка'
              }))
            
            // Формируем детальное описание (используем | как разделитель для парсинга)
            // Убираем чекбоксы из метрик - они будут в отдельной секции логики
            const reason = `✅ Заказ #${candidate.orderNumber || candidate.raw?.orderNumber || '?'} "${candidate.address.substring(0, 50)}..." объединен с заказами ${routeChain.map((o, idx) => `#${o.orderNumber || o.raw?.orderNumber || idx + 1}`).join(', ')} | 📊 Оценка совместимости: ${overallCompatibility.toFixed(0)}/100 | ⏰ Время готовности: ${candidateReadyTime} (разница с маршрутом: ${readyTimeDiff.toFixed(0)} мин) | 📍 Расстояние: ${evalItem.distanceKm.toFixed(1)} км от предыдущего заказа | 🏘️ Зона доставки: ${candidateZone} | ⏱️ Дедлайн: ${deadlineInfo ? `${deadlineInfo.arrival} → ${deadlineInfo.deadline} (${deadlineInfo.margin > 0 ? '+' : ''}${deadlineInfo.margin} мин запас)` : 'не указан'} | 📈 Эффективность маршрута: ${(routeEfficiency * 100).toFixed(0)}% | 🎯 Почему именно этот заказ: | • Время готовности: разница ${readyTimeDiff.toFixed(0)} мин с маршрутом (лимит: ${optimizedSettings.maxReadyTimeDifferenceMinutes} мин) | • Расстояние от заказа #${routeChain[routeChain.length - 1].orderNumber || routeChain.length}: ${evalItem.distanceKm.toFixed(1)} км (лимит: ${optimizedSettings.maxDistanceBetweenOrdersKm || 'нет'} км) | • Зона доставки: ${candidateZone}${zoneMatch ? ' (совпадает с маршрутом)' : ' (другая зона)'} | • Дедлайн: ${deadlineInfo ? `прибытие ${deadlineInfo.arrival}, дедлайн ${deadlineInfo.deadline}, запас ${deadlineInfo.margin > 0 ? '+' : ''}${deadlineInfo.margin} мин` : 'не указан'} | • Эффективность маршрута: ${(routeEfficiency * 100).toFixed(0)}% (минимум: 30%) | 📊 Сравнение с альтернативами: | ${alternativeCandidates.length > 0 ? alternativeCandidates.map(alt => `• Заказ #${alt.orderNumber}: оценка ${alt.score}/100 (${alt.reason})`).join(' | ') : '• Альтернативные кандидаты не найдены'} | 💡 Результат: маршрут эффективен на ${(routeEfficiency * 100).toFixed(0)}%${routeChain.length > 1 ? ` (добавление заказа ${routeEfficiency >= 0.3 ? 'улучшило' : 'не ухудшило'} маршрут)` : ''} | 🔍 Логика формирования: | • Временная совместимость: ${readyTimeCompatible ? 'совместимо' : 'несовместимо'} (разница ${readyTimeDiff.toFixed(0)} мин, лимит ${optimizedSettings.maxReadyTimeDifferenceMinutes} мин) | • Географическая близость: ${evalItem.distanceKm.toFixed(1)} км от предыдущего заказа${evalItem.distanceKm <= (optimizedSettings.maxDistanceBetweenOrdersKm || 10) ? ' (в пределах лимита)' : ' (превышает лимит)'} | • Соблюдение дедлайнов: ${deadlineInfo ? (deadlineInfo.ok ? 'соблюден' : 'нарушен') + ` (прибытие ${deadlineInfo.arrival}, дедлайн ${deadlineInfo.deadline}, запас ${deadlineInfo.margin > 0 ? '+' : ''}${deadlineInfo.margin} мин)` : 'не указан'}`
            
            routeReasons.push(reason)
            console.log('✅ Создан детальный reason:', {
              orderNumber: candidate.orderNumber || candidate.raw?.orderNumber,
              hasCompatibility: reason.includes('Оценка совместимости'),
              hasWhy: reason.includes('Почему именно этот заказ'),
              hasAlternatives: reason.includes('Сравнение с альтернативами'),
              reasonLength: reason.length,
              reasonPreview: reason.substring(0, 200)
            })
            console.log(`✅ Добавлен заказ в маршрут, точек: ${routeChain.length}`)
            
            // Прерываем цикл, так как нашли подходящий заказ
            break
          } else {
            if (!ok) console.log(`⚠️ Кандидат "${candidate.address.substring(0, 40)}..." не подходит (нарушает дедлайн или лимит ожидания)`)
            else console.log(`⚠️ Кандидат "${candidate.address.substring(0, 40)}..." не подходит (превышает лимиты: ${totalMin.toFixed(1)}мин/${totalKm.toFixed(1)}км)`)
            processedCount++
          }
          } catch (err) {
            console.error(`❌ Ошибка при проверке кандидата:`, err)
            processedCount++
          }
        }

        // Пересчитываем финальный маршрут для получения актуальных данных (с учётом старта и финиша и пробок)
        const finalCheck = await apiManager.checkRouteWithTraffic(routeChain, {
          includeStartEnd: true,
          priority: 'high'
        })
        let finalLegs = finalCheck.legs || []
        // Используем adjustedDuration (с учетом пробок), если доступно, иначе обычное время
        let finalTotalDuration = finalCheck.adjustedDuration ?? finalCheck.totalDuration ?? 0
        let finalTotalDistance = finalCheck.totalDistance ?? 0
        const trafficInfo = finalCheck.trafficInfo
        const totalTrafficDelay = finalCheck.totalTrafficDelay || 0
        const hasCriticalTraffic = finalCheck.hasCriticalTraffic || false
        
        // Улучшенная локальная оптимизация: проверяем все возможные перестановки (пункт 5)
        if (routeChain.length >= 2) {
          console.log(`🔧 Проверяю локальную оптимизацию для ${routeChain.length} заказов...`)
          setOptimizationProgress({
            current: routes.length + 1,
            total: enrichedForPlanning.length,
            message: `Оптимизация маршрута #${routes.length + 1}...`
          })
          
          let improved = true
          let iterations = 0
          const maxIterations = routeChain.length <= 3 ? 5 : 3 // Больше итераций для коротких маршрутов
          
          while (improved && iterations < maxIterations) {
            improved = false
            iterations++
            
            // Пробуем все возможные перестановки (не только соседние)
            // Для производительности ограничиваем количество проверок
            const maxSwaps = Math.min(routeChain.length * (routeChain.length - 1) / 2, 20)
            let swapCount = 0
            
            for (let i = 0; i < routeChain.length && swapCount < maxSwaps; i++) {
              for (let j = i + 2; j < routeChain.length && swapCount < maxSwaps; j++) {
                swapCount++
                const testChain: any[] = [...routeChain]
                // Переставляем заказ i в позицию после j
                const [removed] = testChain.splice(i, 1)
                testChain.splice(j, 0, removed)
                
                // Проверяем разницу во времени готовности
                if (!isReadyTimeCompatible(testChain[Math.min(i, j)], testChain, optimizedSettings.maxReadyTimeDifferenceMinutes)) {
                  continue
                }
                
                const testResult = await apiManager.checkRoute(testChain, {
                  includeStartEnd: true,
                  priority: 'low' // Низкий приоритет для оптимизации
                })
                if (testResult.feasible && testResult.legs) {
                  const testDuration = testResult.totalDuration ?? 0
                  const testDistance = testResult.totalDistance ?? 0
                  
                  // Проверяем, лучше ли новый маршрут и соблюдает ли дедлайны
                  // ВАЖНО: Используем readyAtSource (время на кухню без упаковки), а не readyAt (с упаковкой)
                  // Заказ может быть готов за 5 минут до или после времени на кухню (окно ±5 минут)
                  const firstOrderReadyAt = testChain[0].readyAtSource || testChain[0].readyAt || null
                  let testStartTime = now
                  if (firstOrderReadyAt) {
                    // Окно готовности: заказ может быть готов от (readyAt - 5 мин) до (readyAt + 5 мин)
                    const readyWindowStart = firstOrderReadyAt - KITCHEN_READY_WINDOW_MS
                    // Стартуем не раньше, чем за 5 минут до готовности первого заказа
                    testStartTime = Math.max(now, readyWindowStart)
                  }
                  let testEta = testStartTime
                  let testOk = true
                  
                  for (let k = 0; k < testChain.length && k < testResult.legs.length - 1; k++) {
                    const leg = testResult.legs[k]
                    // Используем duration_in_traffic если доступно (учитывает трафик)
                    const travelSeconds = leg.duration_in_traffic?.value || leg.duration?.value || 0
                    testEta += travelSeconds * 1000
                    
                    const node = testChain[k]
                    
                    // ВАЖНО: Используем readyAtSource (время на кухню без упаковки), а не readyAt (с упаковкой)
                    // Заказ может быть готов за 5 минут до или после времени на кухню (окно ±5 минут)
                    const nodeReadyAt = node.readyAtSource || node.readyAt || null
                    if (nodeReadyAt) {
                      // Окно готовности: заказ может быть готов от (readyAt - 5 мин) до (readyAt + 5 мин)
                      const readyWindowStart = nodeReadyAt - KITCHEN_READY_WINDOW_MS
                      const readyWindowEnd = nodeReadyAt + KITCHEN_READY_WINDOW_MS
                      
                      if (testEta < readyWindowStart) {
                        // Курьер приедет раньше, чем за 5 минут до готовности - нужно ждать
                        const wait = (readyWindowStart - testEta) / 60000
                        if (wait > maxWaitPerStopMin) {
                          testOk = false
                          break
                        }
                        testEta = readyWindowStart // Начинаем с начала окна готовности
                      } else if (testEta > readyWindowEnd) {
                        // Курьер приедет позже, чем через 5 минут после готовности - заказ уже готов, не ждем
                        // Не добавляем ожидание
                      } else {
                        // Курьер приедет в окне готовности (±5 минут) - заказ будет готов, не ждем
                        // Не добавляем ожидание
                      }
                    }
                    
                    // Добавляем время на отдачу заказа (+5 минут)
                    testEta += DELIVERY_TIME_MS
                    
                    // Проверяем дедлайн: форс-мажор (+9 минут) расширяет дедлайн
                    if (node.deadlineAt) {
                      const deadlineWithForceMajeure = node.deadlineAt + FORCE_MAJEURE_MS
                      if (testEta > deadlineWithForceMajeure) {
                        testOk = false
                        break
                      }
                    }
                  }
                  
                  // Если новый маршрут лучше по времени ИЛИ расстоянию (но главное - соблюдает дедлайны)
                  // Приоритет: соблюдение дедлайнов важнее сокращения расстояния
                  const timeBetter = testDuration < finalTotalDuration
                  const distanceBetter = testDistance < finalTotalDistance
                  const timeNotMuchWorse = testDuration <= finalTotalDuration * 1.1
                  
                  // Применяем оптимизацию только если:
                  // 1. Соблюдает дедлайны (testOk)
                  // 2. Лучше по расстоянию ИЛИ времени
                  // 3. Не увеличивает время более чем на 10% (если сокращаем расстояние)
                  if (testOk && (distanceBetter || timeBetter) && timeNotMuchWorse) {
                    const savedDistance = finalTotalDistance - testDistance
                    const savedTime = (finalTotalDuration - testDuration) / 60
                    routeChain = testChain
                    finalLegs = testResult.legs
                    finalTotalDuration = testDuration
                    finalTotalDistance = testDistance
                    improved = true
                    const improvement = []
                    if (savedTime > 0) improvement.push(`время уменьшено на ${savedTime.toFixed(1)} мин`)
                    if (savedDistance > 0) improvement.push(`дистанция уменьшена на ${(savedDistance / 1000).toFixed(1)} км`)
                    routeReasons.push(`🔧 Локальная оптимизация (2-opt): улучшен порядок заказов | ${improvement.join(', ')} | 
                      Все дедлайны соблюдены`)
                    console.log(`✅ Локальная оптимизация улучшила маршрут (итерация ${iterations})`)
                    break // Начнём заново с нового порядка
                  }
                }
              }
            }
          }
        }
        
        // Общее время включает возврат, но это только для информации
        
        // Finalize routeChain into a route object
        // Старт и финиш - это defaultStartAddress и defaultEndAddress
        const waypoints = routeChain.map(n => ({ address: n.address }))
        
        // Сохраняем номера заказов для отображения
        const orderNumbers = routeChain.map((n, idx) => n.orderNumber || n.raw?.orderNumber || `#${idx + 1}`)
        
        routes.push({
          id: `auto-${now}-${routes.length + 1}`,
          name: (() => {
            const orderNums = orderNumbers.slice(0, 5) // Показываем максимум 5 номеров
            const orderNumsStr = orderNums.length > 0 
              ? orderNums.join(', ') + (orderNumbers.length > 5 ? '...' : '')
              : `${routeChain.length} заказов`
            return `Маршрут ${routes.length + 1} (${orderNumsStr})`
          })(),
          startAddress: defaultStartAddress,
          endAddress: defaultEndAddress,
          waypoints,
          createdAt: now,
          // Метаданные маршрута
          routeChain: routeChain.map(n => n.address), // только заказы, без старта и финиша
          routeChainWithNumbers: routeChain.map((n, idx) => ({
            address: n.address,
            orderNumber: n.orderNumber || n.raw?.orderNumber || `#${idx + 1}`
          })),
          routeChainFull: routeChain.map(n => {
            // Убеждаемся, что raw содержит все исходные данные
            const rawData = n.raw || { ...n }
            // Если какие-то поля есть в объекте, но не в raw, добавляем их
            for (const key in n) {
              if (key !== 'raw' && key !== 'idx' && !rawData.hasOwnProperty(key)) {
                rawData[key] = n[key]
              }
            }
            return {
              ...n, // Сохраняем все поля
              raw: rawData, // Убеждаемся, что raw существует и содержит все данные
              // Сохраняем координаты, если они были вычислены
              coords: n.coords || (n.address ? routeOptimizationCache.getCoordinates(n.address) : null),
            }
          }), // Полные данные заказов для показа информации
          orderNumbers, // номера заказов для отображения
          totalDuration: finalTotalDuration,
          totalDistance: finalTotalDistance,
          totalDurationMin: (finalTotalDuration / 60).toFixed(1),
          totalDistanceKm: (finalTotalDistance / 1000).toFixed(1),
          stopsCount: routeChain.length, // количество заказов (точек доставки, БЕЗ старта и финиша)
          totalPointsCount: routeChain.length + 2, // общее количество точек (включая старт и финиш)
          reasons: routeReasons,
          directionsLegs: finalLegs,
          trafficInfo: trafficInfo, // Информация о пробках
          totalTrafficDelay: totalTrafficDelay, // Общая задержка из-за пробок
          hasCriticalTraffic: hasCriticalTraffic // Есть ли критические пробки
        })
        const trafficInfoStr = trafficInfo && trafficInfo.length > 0
          ? `, пробки: ${totalTrafficDelay.toFixed(1)} мин${hasCriticalTraffic ? ' ⚠️' : ''}`
          : ''
        console.log(`✅ Маршрут #${routes.length} создан, точек: ${routeChain.length}, ${(finalTotalDuration / 60).toFixed(1)} мин${trafficInfoStr}, ${(finalTotalDistance / 1000).toFixed(1)} км`)
        
        // ОПТИМИЗАЦИЯ 8: Очистка памяти - удаляем неиспользуемые данные из candidateCoordsMap
        // Оставляем только координаты для заказов в текущем маршруте
        const routeOrderIds = new Set(routeChain.map(o => getOrderId(o)))
        for (const [order] of candidateCoordsMap.entries()) {
          if (!routeOrderIds.has(getOrderId(order))) {
            candidateCoordsMap.delete(order)
          }
        }
      }

      // Автоматическое разделение слишком больших маршрутов (если разрешено)
      let finalRoutes: any[] = []
      for (const route of routes) {
        if (route.stopsCount > runtimeMaxStopsPerRoute && optimizedSettings.allowRouteSplitting) {
          console.log(`✂️ Разделяю маршрут ${route.name} (${route.stopsCount} заказов > ${runtimeMaxStopsPerRoute})`)
          const subRoutes = splitLargeRoute(
            {
              routeChain: route.routeChainFull || [],
              maxStopsPerRoute: runtimeMaxStopsPerRoute,
              maxRouteDurationMin: runtimeMaxRouteDurationMin,
              maxRouteDistanceKm: runtimeMaxRouteDistanceKm
            },
            {
              checkFeasibility: async (chain: any[]) => {
                return await apiManager.checkRoute(chain, {
                  includeStartEnd: true,
                  priority: 'low'
                })
              }
            }
          )

          // Создаем отдельные маршруты из подмаршрутов
          for (let i = 0; i < subRoutes.length; i++) {
            const subChain = subRoutes[i]
            const subCheck = await apiManager.checkRoute(subChain, {
              includeStartEnd: true,
              priority: 'low'
            })
            if (subCheck.feasible && subCheck.legs) {
              const subOrderNumbers = subChain.map((n: any, idx: number) => 
                n.orderNumber || n.raw?.orderNumber || `#${idx + 1}`
              )
              finalRoutes.push({
                id: `${route.id}-split-${i + 1}`,
                name: (() => {
                  const orderNums = subOrderNumbers.slice(0, 5)
                  const orderNumsStr = orderNums.length > 0 
                    ? orderNums.join(', ') + (subOrderNumbers.length > 5 ? '...' : '')
                    : `${subChain.length} заказов`
                  return `Маршрут ${finalRoutes.length + 1} (${orderNumsStr})`
                })(),
                startAddress: route.startAddress,
                endAddress: route.endAddress,
                waypoints: subChain.map((n: any) => ({ address: n.address })),
                createdAt: route.createdAt,
                routeChain: subChain.map((n: any) => n.address),
                routeChainFull: subChain,
                orderNumbers: subOrderNumbers,
                totalDuration: subCheck.totalDuration ?? 0,
                totalDistance: subCheck.totalDistance ?? 0,
                totalDurationMin: ((subCheck.totalDuration ?? 0) / 60).toFixed(1),
                totalDistanceKm: ((subCheck.totalDistance ?? 0) / 1000).toFixed(1),
                stopsCount: subChain.length,
                reasons: [...(route.reasons || []), `Разделен из большого маршрута: ${route.name}`],
                directionsLegs: subCheck.legs
              })
            }
          }
        } else {
          finalRoutes.push(route)
        }
      }

      // ГЛОБАЛЬНАЯ ОПТИМИЗАЦИЯ: Перемещение заказов между маршрутами и перестановка внутри
      if (finalRoutes.length > 1) {
        console.log('🌐 Глобальная оптимизация маршрутов...')
        setOptimizationProgress({
          current: finalRoutes.length,
          total: finalRoutes.length,
          message: 'Глобальная оптимизация маршрутов...'
        })
        
        // Преобразуем маршруты в формат для оптимизации
        const routesForOptimization: RouteForRebalancing[] = finalRoutes.map(route => ({
          orders: route.routeChainFull || [],
          totalDistance: route.totalDistance,
          totalDuration: route.totalDuration,
          _originalRoute: route
        }))
        
        // Глобальная оптимизация
        const globalOptimizationContext: GlobalOptimizationContext = {
          checkChainFeasible: async (orders: Order[]) => {
            return await apiManager.checkRoute(orders, {
              includeStartEnd: true,
              priority: 'low'
            })
          },
          maxStopsPerRoute: runtimeMaxStopsPerRoute,
          maxRouteDurationMin: runtimeMaxRouteDurationMin,
          maxRouteDistanceKm: runtimeMaxRouteDistanceKm,
          maxReadyTimeDifferenceMinutes: optimizedSettings.maxReadyTimeDifferenceMinutes,
          maxWaitPerStopMin
        }
        
        const optimizedRoutes = await globalRouteOptimization(routesForOptimization, globalOptimizationContext)
        
        // Пересоздаем маршруты с оптимизированным распределением
        const newOptimizedRoutes: any[] = []
        for (const optimizedRoute of optimizedRoutes) {
          if (optimizedRoute.orders.length === 0) continue
          
          const check = await apiManager.checkRoute(optimizedRoute.orders, {
            includeStartEnd: true,
            priority: 'low'
          })
          if (check.feasible && check.legs) {
            const orderNumbers = optimizedRoute.orders.map((n: any, idx: number) => 
              n.orderNumber || n.raw?.orderNumber || `#${idx + 1}`
            )
            
            // Сохраняем оригинальные reasons из исходного маршрута
            const originalRoute = (optimizedRoute as any)._originalRoute
            const originalReasons = originalRoute?.reasons || []
            
            newOptimizedRoutes.push({
              id: `route_${Date.now()}_${Math.random()}`,
              name: `Маршрут ${newOptimizedRoutes.length + 1} (${optimizedRoute.orders.length} заказов)`,
              startAddress: defaultStartAddress,
              endAddress: defaultEndAddress,
              waypoints: optimizedRoute.orders.map((n: any) => ({ address: n.address })),
              createdAt: new Date().toISOString(),
              routeChain: optimizedRoute.orders.map((n: any) => n.address),
              routeChainFull: optimizedRoute.orders,
              orderNumbers,
              totalDuration: check.totalDuration ?? 0,
              totalDistance: check.totalDistance ?? 0,
              totalDurationMin: ((check.totalDuration ?? 0) / 60).toFixed(1),
              totalDistanceKm: ((check.totalDistance ?? 0) / 1000).toFixed(1),
              stopsCount: optimizedRoute.orders.length,
              // Сохраняем оригинальные reasons и добавляем информацию об оптимизации
              reasons: [...originalReasons, '🌐 Глобально оптимизированный маршрут'],
              directionsLegs: check.legs
            })
          }
        }
        
        if (newOptimizedRoutes.length > 0) {
          finalRoutes = newOptimizedRoutes
          console.log(`✅ Глобальная оптимизация завершена: ${finalRoutes.length} маршрутов`)
        }
      }
      
      // УЛУЧШЕННАЯ РЕБАЛАНСИРОВКА: Перераспределение заказов между маршрутами с учетом времени
      if (finalRoutes.length > 1) {
        console.log('⚖️ Улучшенная ребалансировка маршрутов с учетом времени...')
        setOptimizationProgress({
          current: finalRoutes.length,
          total: finalRoutes.length,
          message: 'Ребалансировка маршрутов...'
        })
        
        // Преобразуем маршруты в формат для ребалансировки
        const routesForRebalancing: RouteForRebalancing[] = finalRoutes.map(route => ({
          orders: route.routeChainFull || [],
          totalDistance: route.totalDistance,
          totalDuration: route.totalDuration,
          _originalRoute: route // Сохраняем ссылку на оригинальный маршрут
        }))
        
        // УЛУЧШЕНИЕ: Используем улучшенную ребалансировку V3 с учетом времени
        const rebalanceContext: RebalanceContext & {
          checkChainFeasible?: (orders: Order[]) => Promise<{ feasible: boolean; legs?: any[]; totalDuration?: number; totalDistance?: number; }>
          maxReadyTimeDifferenceMinutes?: number
          maxWaitPerStopMin?: number
        } = {
          getRouteDistance: async (orders: Order[]) => {
            const check = await apiManager.checkRoute(orders, {
              includeStartEnd: true,
              priority: 'low'
            })
            return (check.totalDistance || 0) / 1000 // Конвертируем в км
          },
          getRouteDuration: async (orders: Order[]) => {
            const check = await apiManager.checkRoute(orders, {
              includeStartEnd: true,
              priority: 'low'
            })
            return check.totalDuration || 0
          },
          checkChainFeasible: async (orders: Order[]) => {
            return await apiManager.checkRoute(orders, {
              includeStartEnd: true,
              priority: 'low'
            })
          },
          maxReadyTimeDifferenceMinutes: optimizedSettings.maxReadyTimeDifferenceMinutes,
          maxWaitPerStopMin
        }
        
        // Сохраняем метрики до ребалансировки для сравнения
        const beforeMetrics = finalRoutes.map(route => ({
          id: route.id,
          stops: route.stopsCount,
          distance: route.totalDistance || 0,
          duration: route.totalDuration || 0,
          orderNumbers: route.orderNumbers || []
        }))
        
        const rebalanced = await rebalanceRoutesV3(routesForRebalancing, runtimeMaxStopsPerRoute, rebalanceContext)
        
        // Если маршруты изменились, пересчитываем их
        if (rebalanced.length !== finalRoutes.length || 
            rebalanced.some((r, i) => r.orders.length !== routesForRebalancing[i].orders.length)) {
          console.log(`✅ Ребалансировка: ${finalRoutes.length} -> ${rebalanced.length} маршрутов`)
          
          // Вычисляем статистику изменений
          const totalOrdersBefore = beforeMetrics.reduce((sum, m) => sum + m.stops, 0)
          const totalOrdersAfter = rebalanced.reduce((sum, r) => sum + r.orders.length, 0)
          const avgLoadBefore = totalOrdersBefore / Math.max(1, beforeMetrics.length)
          const avgLoadAfter = totalOrdersAfter / Math.max(1, rebalanced.length)
          const loadVarianceBefore = beforeMetrics.reduce((sum, m) => {
            const diff = m.stops - avgLoadBefore
            return sum + (diff * diff)
          }, 0) / Math.max(1, beforeMetrics.length)
          const loadVarianceAfter = rebalanced.reduce((sum, r) => {
            const diff = r.orders.length - avgLoadAfter
            return sum + (diff * diff)
          }, 0) / Math.max(1, rebalanced.length)
          const loadBalanceImprovement = loadVarianceBefore > 0 
            ? ((loadVarianceBefore - loadVarianceAfter) / loadVarianceBefore * 100).toFixed(1)
            : '0'
          
          // Пересоздаем маршруты с новым распределением заказов
          const newFinalRoutes: any[] = []
          for (let idx = 0; idx < rebalanced.length; idx++) {
            const rebalancedRoute = rebalanced[idx]
            if (rebalancedRoute.orders.length === 0) continue
            
            // Проверяем feasibility нового маршрута
            const check = await apiManager.checkRoute(rebalancedRoute.orders, {
              includeStartEnd: true,
              priority: 'low'
            })
            if (check.feasible && check.legs) {
              const orderNumbers = rebalancedRoute.orders.map((n: any, idx: number) => 
                n.orderNumber || n.raw?.orderNumber || `#${idx + 1}`
              )
              
              // Находим соответствующий старый маршрут для сравнения
              const oldRoute = beforeMetrics.find(m => 
                m.orderNumbers.some((num: string) => orderNumbers.includes(num))
              ) || beforeMetrics[idx]
              
              // Находим оригинальный маршрут из finalRoutes для сохранения reasons
              const originalRoute = finalRoutes.find(r => {
                const routeOrderNumbers = (r.orderNumbers || []).map((n: any) => 
                  typeof n === 'string' ? n : (n.orderNumber || n.raw?.orderNumber || '')
                )
                return routeOrderNumbers.some((num: string) => orderNumbers.includes(num))
              }) || finalRoutes[idx]
              
              const stopsChanged = rebalancedRoute.orders.length - (oldRoute?.stops || 0)
              const distanceChanged = ((check.totalDistance || 0) - (oldRoute?.distance || 0)) / 1000
              const durationChanged = ((check.totalDuration || 0) - (oldRoute?.duration || 0)) / 60
              
              // Сохраняем оригинальные reasons из исходного маршрута
              const originalReasons = originalRoute?.reasons || []
              
              // Формируем детальную причину ребалансировки
              const rebalanceReasons: string[] = []
              rebalanceReasons.push(`⚖️ Ребалансированный маршрут`)
              
              if (stopsChanged !== 0) {
                rebalanceReasons.push(`Заказов: ${oldRoute?.stops || 0} → ${rebalancedRoute.orders.length} (${stopsChanged > 0 ? '+' : ''}${stopsChanged})`)
              }
              
              if (Math.abs(distanceChanged) > 0.1) {
                rebalanceReasons.push(`Дистанция: ${((oldRoute?.distance || 0) / 1000).toFixed(1)} → ${((check.totalDistance || 0) / 1000).toFixed(1)} км (${distanceChanged > 0 ? '+' : ''}${distanceChanged.toFixed(1)} км)`)
              }
              
              if (Math.abs(durationChanged) > 0.5) {
                rebalanceReasons.push(`Время: ${((oldRoute?.duration || 0) / 60).toFixed(1)} → ${((check.totalDuration || 0) / 60).toFixed(1)} мин (${durationChanged > 0 ? '+' : ''}${durationChanged.toFixed(1)} мин)`)
              }
              
              if (idx === 0) {
                // Добавляем общую статистику только для первого маршрута
                rebalanceReasons.push(`📊 Общая статистика: ${beforeMetrics.length} → ${rebalanced.length} маршрутов`)
                rebalanceReasons.push(`📊 Балансировка нагрузки улучшена на ${loadBalanceImprovement}%`)
                rebalanceReasons.push(`📊 Средняя нагрузка: ${avgLoadBefore.toFixed(1)} → ${avgLoadAfter.toFixed(1)} заказов/маршрут`)
              }
              
              newFinalRoutes.push({
                id: `route_${Date.now()}_${Math.random()}`,
                name: (() => {
                  const orderNumbers = rebalancedRoute.orders
                    .map((o: any) => o.orderNumber || o.raw?.orderNumber)
                    .filter((n: any) => n)
                    .slice(0, 5) // Показываем максимум 5 номеров
                  const orderNumsStr = orderNumbers.length > 0 
                    ? orderNumbers.join(', ') + (rebalancedRoute.orders.length > 5 ? '...' : '')
                    : `${rebalancedRoute.orders.length} заказов`
                  return `Маршрут ${newFinalRoutes.length + 1} (${orderNumsStr})`
                })(),
                startAddress: defaultStartAddress,
                endAddress: defaultEndAddress,
                waypoints: rebalancedRoute.orders.map((n: any) => ({ address: n.address })),
                createdAt: new Date().toISOString(),
                routeChain: rebalancedRoute.orders.map((n: any) => n.address),
                routeChainFull: rebalancedRoute.orders,
                orderNumbers,
                totalDuration: check.totalDuration ?? 0,
                totalDistance: check.totalDistance ?? 0,
                totalDurationMin: ((check.totalDuration ?? 0) / 60).toFixed(1),
                totalDistanceKm: ((check.totalDistance || 0) / 1000).toFixed(1),
                stopsCount: rebalancedRoute.orders.length,
                // Сохраняем оригинальные reasons и добавляем информацию о ребалансировке
                reasons: [...originalReasons, ...rebalanceReasons],
                directionsLegs: check.legs
              })
            }
          }
          
          if (newFinalRoutes.length > 0) {
            finalRoutes = newFinalRoutes
            console.log(`✅ Ребалансировка завершена: ${finalRoutes.length} маршрутов`)
          }
        } else {
          console.log('ℹ️ Ребалансировка не требуется: маршруты уже сбалансированы')
        }
      }
      
      // Фильтрация маршрутов по типу курьера и ограничениям
      if (selectedCourierType !== 'all') {
        console.log(`🔍 Фильтрация маршрутов по типу курьера: ${selectedCourierType}`)
        const filteredByType = filterRoutesByCourierType(finalRoutes, selectedCourierType, courierSchedules)
        const removedCount = finalRoutes.length - filteredByType.length
        if (removedCount > 0) {
          console.log(`⚠️ Исключено ${removedCount} маршрутов, не подходящих для типа "${selectedCourierType}"`)
        }
        finalRoutes = filteredByType
      }
      
      // Назначение маршрутов курьерам с учетом графика работы (если включено)
      if (enableScheduleFiltering && courierSchedules.length > 0) {
        console.log('📅 Назначение маршрутов курьерам с учетом графика работы...')
        setOptimizationProgress({
          current: finalRoutes.length,
          total: finalRoutes.length,
          message: 'Назначение курьеров...'
        })
        
        // Назначаем маршруты курьерам
        const assignedRoutes: RouteAssignment[] = []
        for (const route of finalRoutes) {
          const routeData = {
            orders: route.routeChainFull || [],
            totalDistanceKm: (route.totalDistance || 0) / 1000,
            estimatedDurationMinutes: (route.totalDuration || 0) / 60,
            readyAt: route.routeChainFull?.[0]?.readyAtSource || route.routeChainFull?.[0]?.readyAt,
          }
          
          // Передаем заказы с дедлайнами для анализа доступности курьеров
          const assignment = assignRouteToCourier(routeData, courierSchedules)
          if (assignment && assignment.isFeasible) {
            assignedRoutes.push(assignment)
            // Добавляем информацию о назначении в маршрут
            route.assignedCourier = assignment.courierName
            route.assignedCourierId = assignment.courierId
            route.vehicleType = assignment.vehicleType
            route.dispatchTime = assignment.dispatchTime
            route.estimatedStartTime = assignment.estimatedStartTime
            route.estimatedEndTime = assignment.estimatedEndTime
          } else if (assignment) {
            console.warn(`⚠️ Маршрут ${route.name} не может быть назначен: ${assignment.reason}`)
            route.assignmentError = assignment.reason
          }
        }
        
        console.log(`✅ Назначено ${assignedRoutes.length} маршрутов из ${finalRoutes.length}`)
      }
      
      // Постобработка: объединение близких коротких маршрутов (пункт 10)
      if (finalRoutes.length > 1) {
        console.log('🔗 Постобработка: проверка возможности объединения маршрутов...')
        setOptimizationProgress({
          current: finalRoutes.length,
          total: enrichedForPlanningGrouped.length,
          message: 'Постобработка маршрутов...'
        })
        
        const shortRoutes = finalRoutes.filter(r => r.stopsCount <= 2 && r.totalDuration / 60 < runtimeMaxRouteDurationMin * 0.7)
        
        for (let i = 0; i < shortRoutes.length - 1; i++) {
          for (let j = i + 1; j < shortRoutes.length; j++) {
            const route1 = shortRoutes[i]
            const route2 = shortRoutes[j]
            
            const orders1 = route1.routeChainFull || []
            const orders2 = route2.routeChainFull || []
            const combinedStops = orders1.length + orders2.length
            
            // Проверяем лимиты
            if (combinedStops > runtimeMaxStopsPerRoute) continue
            
            // Проверяем совместимость по времени готовности
            const allOrders = [...orders1, ...orders2]
            const readySpread = getReadyTimeSpread(allOrders)
            const maxSpread = optimizedSettings.maxReadyTimeDifferenceMinutes * 60 * 1000
            if (readySpread > maxSpread) continue
            
            // Проверяем feasibility объединенного маршрута
            const combinedCheck = await apiManager.checkRoute(allOrders, {
              includeStartEnd: true,
              priority: 'low'
            })
            if (!combinedCheck.feasible) continue
            
            const combinedDuration = (combinedCheck.totalDuration || 0) / 60
            const combinedDistance = (combinedCheck.totalDistance || 0) / 1000
            
            if (combinedDuration <= runtimeMaxRouteDurationMin && combinedDistance <= runtimeMaxRouteDistanceKm) {
              // Объединяем маршруты
              route1.routeChainFull = allOrders
              route1.routeChain = allOrders.map((o: any) => o.address)
              route1.stopsCount = combinedStops
              route1.totalDuration = combinedCheck.totalDuration || 0
              route1.totalDistance = combinedCheck.totalDistance || 0
              route1.totalDurationMin = combinedDuration.toFixed(1)
              route1.totalDistanceKm = combinedDistance.toFixed(1)
              route1.directionsLegs = combinedCheck.legs
              route1.name = `${route1.name} + ${route2.name}`
              
              // Удаляем второй маршрут
              const route2Index = finalRoutes.findIndex(r => r.id === route2.id)
              if (route2Index !== -1) {
                finalRoutes.splice(route2Index, 1)
              }
              
              console.log(`✅ Объединены маршруты: ${route1.name}`)
              break
            }
          }
        }
      }
      
      // Сбрасываем прогресс
      setOptimizationProgress(null)

      // Генерация уведомлений для маршрутов
      const notificationsMap = new Map<string, Notification[]>()
      if (enableNotifications) {
        console.log('🔔 Генерирую уведомления для маршрутов...')
        for (const route of finalRoutes) {
            const routeInfo: NotificationRouteInfo = {
            id: route.id,
            name: route.name,
            routeChain: (route.routeChainFull || []).map((o: any) => ({
              orderNumber: o.orderNumber || o.raw?.orderNumber || '',
              address: o.address,
              customerName: o.raw?.customerName || o.raw?.['Имя клиента'] || '',
              customerPhone: o.raw?.phone || o.raw?.телефон || '',
              readyAt: o.readyAtSource || o.readyAt, // ВАЖНО: Используем readyAtSource (время на кухню без упаковки)
              deadlineAt: o.deadlineAt,
              estimatedArrivalTime: null, // Будет вычислено в generateRouteNotifications
              raw: o.raw
            })),
            startAddress: route.startAddress,
            endAddress: route.endAddress,
            estimatedStartTime: Date.now(),
            directionsLegs: route.directionsLegs
          }
          
          const notifications = generateRouteNotifications(routeInfo, notificationPreferences)
          if (notifications.length > 0) {
            notificationsMap.set(route.id, notifications)
            console.log(`✅ Сгенерировано ${notifications.length} уведомлений для маршрута ${route.name}`)
          }
        }
      }

      // Keep results isolated in this page only
      const planningEndTime = Date.now()
      const totalPlanningTime = (planningEndTime - planningStartTime) / 1000
      console.log(`✅ Автоматическая оптимизация маршрутов завершена. Создано маршрутов: ${finalRoutes.length}`)
      console.log(`⏱️ Общее время планирования: ${totalPlanningTime.toFixed(1)}с`)
      
      // Выводим статистику кэша
      const cacheStats = apiManager.getCacheStats()
      console.log('📊 Статистика оптимизации Google API:')
      console.log(`  - Кэшированных пар точек: ${cacheStats.pointPairs}`)
      console.log(`  - Кэшированных маршрутов: ${cacheStats.routes}`)
      console.log(`  - Экономия запросов: ~${Math.round((cacheStats.pointPairs + cacheStats.routes) * 0.7)}%`)
      
      // ОПТИМИЗАЦИЯ: Выводим метрики производительности
      const totalOrders = ordersToPlan.length
      const avgTimePerOrder = totalOrders > 0 ? (totalPlanningTime / totalOrders).toFixed(2) : '0'
      const avgTimePerRoute = finalRoutes.length > 0 ? (totalPlanningTime / finalRoutes.length).toFixed(2) : '0'
      console.log('📈 Метрики производительности:')
      console.log(`  - Обработано заказов: ${totalOrders}`)
      console.log(`  - Создано маршрутов: ${finalRoutes.length}`)
      console.log(`  - Среднее время на заказ: ${avgTimePerOrder}с`)
      console.log(`  - Среднее время на маршрут: ${avgTimePerRoute}с`)
      console.log(`  - Эффективность: ${totalOrders > 0 ? ((finalRoutes.length / totalOrders) * 100).toFixed(1) : '0'}% заказов в маршрутах`)
      
      setPlannedRoutes(finalRoutes)
      setRouteNotifications(notificationsMap)
      
      // Сохраняем в историю и рассчитываем аналитику
      if (finalRoutes.length > 0) {
        // Расчет статистики для истории
        const totalOrders = finalRoutes.reduce((sum, r) => sum + (r.stopsCount || 0), 0)
        const totalDistance = finalRoutes.reduce((sum, r) => sum + (r.totalDistance || 0), 0) / 1000
        const totalDuration = finalRoutes.reduce((sum, r) => sum + (r.totalDuration || 0), 0) / 60
        const avgEfficiency = finalRoutes.reduce((sum, r) => sum + (r.routeEfficiency || 0), 0) / finalRoutes.length
        
        // Сохраняем в историю (с обработкой ошибок переполнения)
        try {
          const historyId = routeHistory.save(
            finalRoutes,
            {
              maxRouteDurationMin,
              maxRouteDistanceKm,
              maxStopsPerRoute,
              trafficMode: trafficPreset.mode,
              ...routePlanningSettings
            },
            {
              totalRoutes: finalRoutes.length,
              totalOrders,
              totalDistance,
              totalDuration,
              avgEfficiency
            }
          )
          console.log(`📝 Маршруты сохранены в историю: ${historyId}`)
          
          // Обновляем список истории
          setRouteHistoryEntries(routeHistory.getAll())
        } catch (error: any) {
          // Ошибка уже обработана в routeHistory.save, но логируем для информации
          console.warn('⚠️ Не удалось сохранить маршруты в историю:', error.message || error)
          // Продолжаем работу, даже если история не сохранилась
        }
        
        // Рассчитываем аналитику
        const analytics = calculateRouteAnalytics(finalRoutes)
        setRouteAnalytics(analytics)
        console.log('📊 Аналитика рассчитана:', analytics)
        
        // Рассчитываем метрики эффективности
        const efficiencyMetrics = calculateRouteEfficiencyMetrics(finalRoutes)
        setRouteEfficiencyMetrics(efficiencyMetrics)
        
        // Получаем предложения по улучшению
        const suggestions = suggestRouteImprovements(efficiencyMetrics)
        setEfficiencySuggestions(suggestions)
        
        console.log('⚡ Метрики эффективности:', efficiencyMetrics)
        if (suggestions.length > 0) {
          console.log('💡 Предложения по улучшению:', suggestions)
        }
      }
      if (finalRoutes.length > 0) {
        const totalDelay = finalRoutes.reduce((sum, route) => sum + (route.totalTrafficDelay || 0), 0)
        const criticalRoutes = finalRoutes.filter(route => route.hasCriticalTraffic).length
        const speedSamples: number[] = []
        finalRoutes.forEach(route => {
          (route.trafficInfo || []).forEach((info: any) => {
            if (typeof info?.currentSpeed === 'number') {
              speedSamples.push(info.currentSpeed)
            }
          })
        })
        const avgSegmentSpeed = speedSamples.length > 0
          ? Math.round(speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length)
          : trafficSnapshotRef.current?.stats.avgSpeed ?? 0
        const slowestRoute = finalRoutes.reduce((prev, route) => {
          const prevDelay = prev ? (prev.totalTrafficDelay || 0) : -Infinity
          const currentDelay = route.totalTrafficDelay || 0
          return currentDelay > prevDelay ? route : prev
        }, finalRoutes[0])
        setPlanTrafficImpact({
          totalDelay: Number(totalDelay.toFixed(1)),
          criticalRoutes,
          avgSegmentSpeed,
          slowestRoute: slowestRoute?.name,
          presetMode: runtimePreset.mode,
          bufferMinutes: runtimePreset.bufferMinutes
        })
      } else {
        setPlanTrafficImpact(null)
      }
      
      if (finalRoutes.length === 0) {
        const msg = 'Не удалось создать маршруты. Проверьте фильтры и убедитесь, что заказы могут быть объединены.'
        setErrorMsg(msg)
        console.warn('⚠️', msg)
      }
    } catch (e: any) {
      const errorMsg = e?.message || 'Неизвестная ошибка'
      console.error('❌ Ошибка автопланирования:', e)
      setErrorMsg(`Ошибка автопланирования: ${errorMsg}. Проверьте ключ Google Maps и корректность адресов.`)
      setPlannedRoutes([])
    } finally {
      setIsPlanning(false)
      setOptimizationProgress(null)
      console.log('🏁 Планирование завершено (успешно или с ошибкой)')
    }
  }, [excelData, fileName, maxRouteDurationMin, maxRouteDistanceKm, maxWaitPerStopMin, maxStopsPerRoute, enableOrderCombining, combineMaxDistanceMeters, combineMaxTimeWindowMinutes, enableNotifications, notificationPreferences, orderFilters, filteredOrders, routePlanningSettings, selectedCourierType, enableScheduleFiltering, courierSchedules, trafficModeOverride])

  // Callback для загрузки данных о трафике - заглушка для будущего функционала
  // const handleTrafficDataLoad = useCallback((data: { congestedAreas: Array<any>; averageSpeed: number; totalDelay: number }) => {
  //   setTrafficData(data)
  //   console.log('📊 Данные о трафике загружены:', data)
  //   if (data && data.congestedAreas.length > 0) {
  //     console.log(`⚠️ Обнаружено ${data.congestedAreas.length} зон с задержками. Общая задержка: ${data.totalDelay} минут`)
  //     if (data.totalDelay > 30) {
  //       console.warn(`🔴 Высокая общая задержка: ${data.totalDelay} минут`)
  //     }
  //   }
  // }, [])

  return (
    <div className="space-y-6">
      {/* Заголовок с градиентом */}
      <div className={clsx(
        'rounded-3xl p-8 shadow-2xl border-2 overflow-hidden relative',
        isDark 
          ? 'bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 border-gray-700' 
          : 'bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border-blue-200'
      )}>
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-pink-600/10 opacity-50"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className={clsx(
                'p-4 rounded-2xl shadow-lg',
                isDark 
                  ? 'bg-gradient-to-br from-blue-600 to-purple-600' 
                  : 'bg-gradient-to-br from-blue-500 to-indigo-600'
              )}>
                <SparklesIconSolid className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className={clsx(
                  'text-3xl font-bold mb-1 bg-gradient-to-r bg-clip-text text-transparent',
                  isDark 
                    ? 'from-blue-400 to-purple-400' 
                    : 'from-blue-600 to-indigo-600'
                )}>
                  Автоматическая оптимизация маршрутов
                </h2>
                <p className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>
                  Умное планирование маршрутов с учетом трафика и приоритетов
                </p>
              </div>
            </div>
            <Tooltip
              content="Открыть справку и инструкции по использованию системы"
              position="left"
            >
              <button
                onClick={() => {
                  setShowHelpModal(true)
                  if (!hasSeenHelp) {
                    localStorage.setItem('km_has_seen_help', 'true')
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
          </div>
          
          {/* Статистика */}
          {excelData && ordersCount > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
              <div className={clsx(
                'p-4 rounded-xl border backdrop-blur-sm',
                isDark 
                  ? 'bg-gray-800/50 border-gray-700' 
                  : 'bg-white/70 border-blue-200'
              )}>
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    'p-2 rounded-lg',
                    isDark ? 'bg-blue-600/20' : 'bg-blue-100'
                  )}>
                    <DocumentArrowUpIcon className={clsx('w-5 h-5', isDark ? 'text-blue-400' : 'text-blue-600')} />
                  </div>
                  <div>
                    <div className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>Заказов</div>
                    <div className={clsx('text-xl font-bold', isDark ? 'text-white' : 'text-gray-900')}>{ordersCount}</div>
                  </div>
                </div>
              </div>
              
              {plannedRoutes.length > 0 && (
                <>
                  <div className={clsx(
                    'p-4 rounded-xl border backdrop-blur-sm',
                    isDark 
                      ? 'bg-gray-800/50 border-gray-700' 
                      : 'bg-white/70 border-green-200'
                  )}>
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        'p-2 rounded-lg',
                        isDark ? 'bg-green-600/20' : 'bg-green-100'
                      )}>
                        <TruckIcon className={clsx('w-5 h-5', isDark ? 'text-green-400' : 'text-green-600')} />
                      </div>
                      <div>
                        <div className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>Маршрутов</div>
                        <div className={clsx('text-xl font-bold', isDark ? 'text-white' : 'text-gray-900')}>{plannedRoutes.length}</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className={clsx(
                    'p-4 rounded-xl border backdrop-blur-sm',
                    isDark 
                      ? 'bg-gray-800/50 border-gray-700' 
                      : 'bg-white/70 border-purple-200'
                  )}>
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        'p-2 rounded-lg',
                        isDark ? 'bg-purple-600/20' : 'bg-purple-100'
                      )}>
                        <ClockIcon className={clsx('w-5 h-5', isDark ? 'text-purple-400' : 'text-purple-600')} />
                      </div>
                      <div>
                        <div className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>Среднее время</div>
                        <div className={clsx('text-xl font-bold', isDark ? 'text-white' : 'text-gray-900')}>
                          {plannedRoutes.length > 0 
                            ? `${(plannedRoutes.reduce((sum, r) => sum + (parseFloat(r.totalDurationMin) || 0), 0) / plannedRoutes.length).toFixed(0)} мин`
                            : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className={clsx(
                    'p-4 rounded-xl border backdrop-blur-sm',
                    isDark 
                      ? 'bg-gray-800/50 border-gray-700' 
                      : 'bg-white/70 border-orange-200'
                  )}>
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        'p-2 rounded-lg',
                        isDark ? 'bg-orange-600/20' : 'bg-orange-100'
                      )}>
                        <MapPinIcon className={clsx('w-5 h-5', isDark ? 'text-orange-400' : 'text-orange-600')} />
                      </div>
                      <div>
                        <div className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>Средняя дистанция</div>
                        <div className={clsx('text-xl font-bold', isDark ? 'text-white' : 'text-gray-900')}>
                          {plannedRoutes.length > 0 
                            ? `${(plannedRoutes.reduce((sum, r) => sum + (parseFloat(r.totalDistanceKm) || 0), 0) / plannedRoutes.length).toFixed(1)} км`
                            : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Основной контент */}
      <div className={clsx(
        'rounded-3xl p-4 shadow-xl border-2',
        isDark ? 'bg-gray-800/80 border-gray-700 backdrop-blur-sm' : 'bg-white border-gray-200'
      )}>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Загрузка файла */}
          <div className={clsx(
            'rounded-xl p-4 border-2 transition-all hover:shadow-lg',
            isDark 
              ? 'border-blue-700/50 bg-gradient-to-br from-gray-800/50 to-gray-900/50 hover:border-blue-600' 
              : 'border-blue-200 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 hover:border-blue-300'
          )}>
            <div className="flex items-center gap-2 mb-3">
              <div className={clsx(
                'p-1.5 rounded-lg',
                isDark ? 'bg-blue-600/20' : 'bg-blue-100'
              )}>
                <DocumentArrowUpIcon className={clsx('w-5 h-5', isDark ? 'text-blue-400' : 'text-blue-600')} />
              </div>
              <div className={clsx('text-sm font-semibold', isDark ? 'text-white' : 'text-gray-900')}>
                Загрузить Excel
              </div>
            </div>
            <label className={clsx(
              'block w-full p-3 rounded-lg border-2 border-dashed cursor-pointer transition-all',
              isDark 
                ? 'border-gray-600 bg-gray-800/50 hover:border-blue-500 hover:bg-gray-800' 
                : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50'
            )} data-tour="upload">
              <input 
                type="file" 
                accept=".xlsx,.xls" 
                onChange={onFileChange} 
                disabled={isProcessing}
                className="hidden"
              />
              <div className="text-center">
                <DocumentArrowUpIcon className={clsx(
                  'w-6 h-6 mx-auto mb-1',
                  isDark ? 'text-gray-500' : 'text-gray-400'
                )} />
                <div className={clsx('text-xs font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>
                  {isProcessing ? 'Обработка...' : 'Выберите файл'}
                </div>
              </div>
            </label>
            {fileName && (
              <div className={clsx('mt-2 p-2 rounded-lg', isDark ? 'bg-gray-800' : 'bg-gray-50')}>
                <div className={clsx('text-xs font-medium mb-0.5 truncate', isDark ? 'text-white' : 'text-gray-900')}>
                  {fileName}
                </div>
                <div className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>
                  Заказов: <span className="font-semibold">{ordersCount}</span>
                </div>
              </div>
            )}
          </div>

          {/* Фильтры маршрута - компактная версия */}
          <div className={clsx(
            'rounded-xl p-4 border-2 transition-all hover:shadow-lg',
            isDark 
              ? 'border-purple-700/50 bg-gradient-to-br from-gray-800/50 to-gray-900/50 hover:border-purple-600' 
              : 'border-purple-200 bg-gradient-to-br from-purple-50/50 to-pink-50/50 hover:border-purple-300'
          )} data-tour="settings">
            <div className="flex items-center gap-2 mb-3">
              <div className={clsx(
                'p-1.5 rounded-lg',
                isDark ? 'bg-purple-600/20' : 'bg-purple-100'
              )}>
                <Cog6ToothIcon className={clsx('w-5 h-5', isDark ? 'text-purple-400' : 'text-purple-600')} />
              </div>
              <div className={clsx('text-sm font-semibold', isDark ? 'text-white' : 'text-gray-900')}>
                Фильтры маршрута
              </div>
            </div>
            <div className="space-y-2.5">
            <label className="flex items-center justify-between gap-2 text-xs">
              <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Длительность (мин)</span>
              <input
                type="number"
                min={30}
                max={600}
                step={5}
                value={maxRouteDurationMin}
                onChange={(e) => setMaxRouteDurationMin(Math.max(30, Math.min(600, Number(e.target.value) || 0)))}
                className={clsx('w-20 rounded-lg p-1.5 text-right text-xs', isDark ? 'bg-gray-800 text-gray-100 border border-gray-700' : 'bg-white text-gray-900 border border-gray-300')}
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-xs">
              <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Дистанция (км)</span>
              <input
                type="number"
                min={10}
                max={300}
                step={5}
                value={maxRouteDistanceKm}
                onChange={(e) => setMaxRouteDistanceKm(Math.max(10, Math.min(300, Number(e.target.value) || 0)))}
                className={clsx('w-20 rounded-lg p-1.5 text-right text-xs', isDark ? 'bg-gray-800 text-gray-100 border border-gray-700' : 'bg-white text-gray-900 border border-gray-300')}
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-xs">
              <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Ожидание (мин)</span>
              <input
                type="number"
                min={0}
                max={15}
                step={1}
                value={maxWaitPerStopMin}
                onChange={(e) => setMaxWaitPerStopMin(Math.max(0, Math.min(15, Number(e.target.value) || 0)))}
                className={clsx('w-20 rounded-lg p-1.5 text-right text-xs', isDark ? 'bg-gray-800 text-gray-100 border border-gray-700' : 'bg-white text-gray-900 border border-gray-300')}
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-xs">
              <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Макс. точек</span>
              <input
                type="number"
                min={1}
                max={4}
                step={1}
                value={maxStopsPerRoute}
                onChange={(e) => setMaxStopsPerRoute(Math.max(1, Math.min(4, Number(e.target.value) || 1)))}
                className={clsx('w-20 rounded-lg p-1.5 text-right text-xs', isDark ? 'bg-gray-800 text-gray-100 border border-gray-700' : 'bg-white text-gray-900 border border-gray-300')}
              />
            </label>
            </div>
          </div>

          {/* Объединение заказов - компактная версия */}
          <div className={clsx('rounded-xl p-4 border space-y-2', isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-gray-50')}>
            <div className="text-xs font-semibold">Объединение заказов</div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={enableOrderCombining}
                onChange={(e) => setEnableOrderCombining(e.target.checked)}
                className="rounded w-3.5 h-3.5"
              />
              <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Автоматически объединять</span>
            </label>
            {enableOrderCombining && (
              <div className="space-y-2 pl-5">
                <label className="flex items-center justify-between gap-2 text-xs">
                  <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Расстояние (м)</span>
                  <input
                    type="number"
                    min={100}
                    max={2000}
                    step={50}
                    value={combineMaxDistanceMeters}
                    onChange={(e) => setCombineMaxDistanceMeters(Math.max(100, Math.min(2000, Number(e.target.value) || 500)))}
                    className={clsx('w-20 rounded-lg p-1.5 text-right text-xs', isDark ? 'bg-gray-800 text-gray-100 border border-gray-700' : 'bg-white text-gray-900 border border-gray-300')}
                  />
                </label>
                <label className="flex items-center justify-between gap-2 text-xs">
                  <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Окно (мин)</span>
                  <input
                    type="number"
                    min={5}
                    max={120}
                    step={5}
                    value={combineMaxTimeWindowMinutes}
                    onChange={(e) => setCombineMaxTimeWindowMinutes(Math.max(5, Math.min(120, Number(e.target.value) || 30)))}
                    className={clsx('w-20 rounded-lg p-1.5 text-right text-xs', isDark ? 'bg-gray-800 text-gray-100 border border-gray-700' : 'bg-white text-gray-900 border border-gray-300')}
                  />
                </label>
              </div>
            )}
          </div>

          {/* Предупреждения - компактная версия */}
          <div className={clsx('rounded-xl p-4 border space-y-2', isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-gray-50')}>
            <div className="text-xs font-semibold">Предупреждения</div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={enableNotifications}
                onChange={(e) => setEnableNotifications(e.target.checked)}
                className="rounded w-3.5 h-3.5"
              />
              <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Включить предупреждения</span>
            </label>
            {enableNotifications && (
              <div className="space-y-1.5 pl-5">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={notificationPreferences.enableWarnings}
                    onChange={(e) => setNotificationPreferences({ ...notificationPreferences, enableWarnings: e.target.checked })}
                    className="rounded w-3.5 h-3.5"
                  />
                  <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Риски опоздания</span>
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={notificationPreferences.enableTrafficWarnings}
                    onChange={(e) => setNotificationPreferences({ ...notificationPreferences, enableTrafficWarnings: e.target.checked })}
                    className="rounded w-3.5 h-3.5"
                  />
                  <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Пробки</span>
                </label>
              </div>
            )}
          </div>

          {/* Настройки построения маршрутов - коллапсируемая секция */}
          <div className={clsx('lg:col-span-4 mt-4 rounded-xl border', isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-gray-50')}>
            <button
              onClick={() => setIsRouteSettingsExpanded(!isRouteSettingsExpanded)}
              className={clsx(
                'w-full px-4 py-3 flex items-center justify-between transition-colors rounded-t-xl',
                isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-100'
              )}
            >
              <div className={clsx('text-sm font-semibold flex items-center gap-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
                <Cog6ToothIcon className="w-5 h-5" />
                <span>Настройки построения маршрутов</span>
              </div>
              <ChevronDownIcon className={clsx('w-5 h-5 transition-transform', isDark ? 'text-gray-400' : 'text-gray-600', isRouteSettingsExpanded && 'rotate-180')} />
            </button>
            {isRouteSettingsExpanded && (
              <div className="p-4 space-y-3 border-t" style={{ borderColor: isDark ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 1)' }}>
                {/* Оптимизация маршрута */}
                <div>
              <label className="flex items-center justify-between gap-3 text-sm mb-2">
                <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Цель оптимизации:</span>
                <select
                  value={routePlanningSettings.optimizationGoal}
                  onChange={(e) => setRoutePlanningSettings({ ...routePlanningSettings, optimizationGoal: e.target.value as any })}
                  className={clsx('w-40 rounded-lg p-2 text-sm', isDark ? 'bg-gray-800 text-gray-100 border border-gray-700' : 'bg-white text-gray-900 border border-gray-300')}
                >
                  <option value="balance">Баланс (рекомендуется)</option>
                  <option value="distance">Минимум расстояния</option>
                  <option value="time">Минимум времени</option>
                </select>
              </label>
              <div className={clsx('text-xs mt-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                Баланс - оптимальное соотношение времени и расстояния. Минимум расстояния - самый короткий путь. Минимум времени - самый быстрый маршрут.
              </div>
                </div>
                
                {/* Разрешить разделение длинных маршрутов */}
                <div>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={routePlanningSettings.allowRouteSplitting}
                  onChange={(e) => setRoutePlanningSettings({ ...routePlanningSettings, allowRouteSplitting: e.target.checked })}
                  className="rounded"
                />
                <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Разрешить разделение длинных маршрутов</span>
              </label>
              <div className={clsx('text-xs mt-1 ml-6', isDark ? 'text-gray-400' : 'text-gray-500')}>
                Автоматически разделять маршруты, которые превышают максимальное количество точек или длительность
              </div>
                </div>
                
                {/* Макс. разница времени готовности */}
                <div>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Макс. разница времени готовности (мин)</span>
                <input
                  type="number"
                  min={5}
                  max={180}
                  step={5}
                  value={routePlanningSettings.maxReadyTimeDifferenceMinutes}
                  onChange={(e) => setRoutePlanningSettings({ ...routePlanningSettings, maxReadyTimeDifferenceMinutes: Math.max(5, Math.min(180, Number(e.target.value) || 10)) })}
                  className={clsx('w-28 rounded-lg p-2 text-right', isDark ? 'bg-gray-800 text-gray-100 border border-gray-700' : 'bg-white text-gray-900 border border-gray-300')}
                />
              </label>
              <div className={clsx('text-xs mt-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                Не объединять в один маршрут заказы с разницей времени готовности больше указанного значения
              </div>
                </div>
                
                {/* Избегать пробок */}
                <div>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={routePlanningSettings.avoidTraffic}
                  onChange={(e) => setRoutePlanningSettings({ ...routePlanningSettings, avoidTraffic: e.target.checked })}
                  className="rounded"
                />
                <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Избегать пробок</span>
              </label>
              <div className={clsx('text-xs mt-1 ml-6', isDark ? 'text-gray-400' : 'text-gray-500')}>
                Учитывать текущую ситуацию с пробками при построении маршрутов
              </div>
                </div>
                
                {/* Фильтр по типу курьера */}
                <div>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Тип курьера:</span>
                <select
                  value={selectedCourierType}
                  onChange={(e) => setSelectedCourierType(e.target.value as 'car' | 'motorcycle' | 'all')}
                  className={clsx('w-40 rounded-lg p-2 text-sm', isDark ? 'bg-gray-800 text-gray-100 border border-gray-700' : 'bg-white text-gray-900 border border-gray-300')}
                >
                  <option value="all">Все типы</option>
                  <option value="car">Авто (все зоны)</option>
                  <option value="motorcycle">Мото (до {VEHICLE_LIMITS.motorcycle.maxDistanceKm} км)</option>
                </select>
              </label>
              <div className={clsx('text-xs mt-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                {selectedCourierType === 'all' 
                  ? 'Маршруты для всех типов курьеров'
                  : selectedCourierType === 'car'
                  ? 'Только маршруты для авто курьеров (без ограничений по расстоянию)'
                  : `Только маршруты для мото курьеров (максимум ${VEHICLE_LIMITS.motorcycle.maxDistanceKm} км)`}
              </div>
                </div>
                
                {/* Учет графика работы */}
                <div>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-3 text-sm flex-1">
                  <input
                    type="checkbox"
                    checked={enableScheduleFiltering}
                    onChange={(e) => setEnableScheduleFiltering(e.target.checked)}
                    className="rounded"
                    disabled={courierSchedules.length === 0}
                  />
                  <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700', courierSchedules.length === 0 && 'opacity-50')}>
                    Учитывать график работы курьеров
                  </span>
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowScheduleModal(true)}
                    className={clsx(
                      'px-3 py-1 text-xs rounded-lg font-medium transition-colors',
                      isDark 
                        ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    )}
                  >
                    Управление ({courierSchedules.length})
                  </button>
                  <label className={clsx(
                    'px-3 py-1 text-xs rounded-lg font-medium transition-colors cursor-pointer',
                    isDark 
                      ? 'bg-green-600 hover:bg-green-700 text-white' 
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  )}>
                    Загрузить из Excel
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          const fileReader = new FileReader()
                          fileReader.onload = async (event) => {
                            try {
                              const arrayBuffer = event.target?.result as ArrayBuffer
                              if (arrayBuffer) {
                                // Динамический импорт XLSX только когда нужно
                                const XLSX = await import('xlsx')
                                const workbook = XLSX.read(arrayBuffer, { type: 'array' })
                                // Пробуем все листы
                                for (const sheetName of workbook.SheetNames) {
                                  const worksheet = workbook.Sheets[sheetName]
                                  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]
                                  const parsedSchedules = parseCourierScheduleFromExcel(jsonData)
                                  if (parsedSchedules.length > 0) {
                                    setCourierSchedules(parsedSchedules)
                                    console.log(`✅ Загружено ${parsedSchedules.length} графиков из листа "${sheetName}"`)
                                    alert(`Загружено ${parsedSchedules.length} графиков курьеров из Excel`)
                                    return
                                  }
                                }
                                alert('Не удалось найти графики курьеров в файле. Убедитесь, что файл содержит таблицу с днями недели (ПН, ВТ, СР и т.д.) в заголовках.')
                              }
                            } catch (error) {
                              console.error('Ошибка загрузки графика:', error)
                              alert('Ошибка при загрузке графика из Excel')
                            }
                          }
                          fileReader.readAsArrayBuffer(file)
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
              <div className={clsx('text-xs mt-1 ml-6', isDark ? 'text-gray-400' : 'text-gray-500')}>
                {courierSchedules.length === 0 
                  ? 'Добавьте графики курьеров для учета при формировании маршрутов'
                  : enableScheduleFiltering
                    ? `Учитывается график работы ${courierSchedules.length} курьеров (время начала работы, все работают до закрытия)`
                    : `График работы ${courierSchedules.length} курьеров не учитывается`}
              </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Фильтры заказов */}
        {excelData && ordersCount > 0 && (
          <div className={clsx('mt-6 rounded-xl border', isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-white')}>
            <button
              onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
              className={clsx(
                'w-full px-4 py-3 flex items-center justify-between transition-colors',
                isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'
              )}
            >
              <div className={clsx('text-sm font-medium flex items-center gap-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
                <span>{isFiltersExpanded ? '▼' : '▶'}</span>
                <span>🔍 Фильтры заказов</span>
                {orderFilters.enabled && (
                  <span className={clsx('text-xs px-2 py-1 rounded', isDark ? 'bg-blue-700 text-blue-200' : 'bg-blue-100 text-blue-700')}>
                    Активны
                  </span>
                )}
              </div>
            </button>
            {isFiltersExpanded && (
              <div className="p-4 space-y-4">
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={orderFilters.enabled}
                    onChange={(e) => setOrderFilters({ ...orderFilters, enabled: e.target.checked })}
                    className="rounded"
                  />
                  <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Включить фильтры</span>
                </label>
                
                {orderFilters.enabled && (
                  <>
                    {/* Статистика */}
                    <div className={clsx('text-xs p-2 rounded', isDark ? 'bg-gray-900/50 text-gray-400' : 'bg-gray-100 text-gray-600')}>
                      Всего заказов: {ordersCount} | 
                      После фильтрации: {filteredOrders.length} |
                      Исключено: {ordersCount - filteredOrders.length}
                    </div>
                    
                    {/* Способ оплаты */}
                    {availableFilters.paymentMethods.length > 0 && (
                      <div>
                        <div className={clsx('text-xs font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>Способ оплаты:</div>
                        <div className="flex flex-wrap gap-2">
                          {availableFilters.paymentMethods.map((pm) => (
                            <label key={pm} className="flex items-center gap-1 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={orderFilters.paymentMethods.includes(pm)}
                                onChange={(e) => {
                                  const newMethods = e.target.checked
                                    ? [...orderFilters.paymentMethods, pm]
                                    : orderFilters.paymentMethods.filter(m => m !== pm)
                                  setOrderFilters({ ...orderFilters, paymentMethods: newMethods })
                                }}
                                className="rounded"
                              />
                              <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>{pm}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Зона доставки */}
                    {availableFilters.deliveryZones.length > 0 && (
                      <div>
                        <div className={clsx('text-xs font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>Зона доставки:</div>
                        <div className="flex flex-wrap gap-2">
                          {availableFilters.deliveryZones.map((zone) => (
                            <label key={zone} className="flex items-center gap-1 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={orderFilters.deliveryZones.includes(zone)}
                                onChange={(e) => {
                                  const newZones = e.target.checked
                                    ? [...orderFilters.deliveryZones, zone]
                                    : orderFilters.deliveryZones.filter(z => z !== zone)
                                  setOrderFilters({ ...orderFilters, deliveryZones: newZones })
                                }}
                                className="rounded"
                              />
                              <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>{zone}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Статус */}
                    {availableFilters.statuses.length > 0 && (
                      <div>
                        <div className={clsx('text-xs font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>Статус:</div>
                        <div className="flex flex-wrap gap-2">
                          {availableFilters.statuses.map((status) => (
                            <label key={status} className="flex items-center gap-1 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={orderFilters.statuses.includes(status)}
                                onChange={(e) => {
                                  const newStatuses = e.target.checked
                                    ? [...orderFilters.statuses, status]
                                    : orderFilters.statuses.filter(s => s !== status)
                                  setOrderFilters({ ...orderFilters, statuses: newStatuses })
                                }}
                                className="rounded"
                              />
                              <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>{status}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Тип заказа */}
                    {availableFilters.orderTypes.length > 0 && (
                      <div>
                        <div className={clsx('text-xs font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>Тип заказа:</div>
                        <div className="flex flex-wrap gap-2">
                          {availableFilters.orderTypes.map((type) => (
                            <label key={type} className="flex items-center gap-1 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={orderFilters.orderTypes.includes(type)}
                                onChange={(e) => {
                                  const newTypes = e.target.checked
                                    ? [...orderFilters.orderTypes, type]
                                    : orderFilters.orderTypes.filter(t => t !== type)
                                  setOrderFilters({ ...orderFilters, orderTypes: newTypes })
                                }}
                                className="rounded"
                              />
                              <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>{type}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Дополнительные фильтры */}
                    <div className="space-y-2 pt-2 border-t border-gray-600">
                      <label className="flex items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={orderFilters.excludeCompleted}
                          onChange={(e) => setOrderFilters({ ...orderFilters, excludeCompleted: e.target.checked })}
                          className="rounded"
                        />
                        <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Исключить исполненные заказы</span>
                      </label>
                    </div>
                    
                    {/* Кнопка сброса фильтров */}
                    <button
                      onClick={() => setOrderFilters({
                        enabled: false,
                        paymentMethods: [],
                        deliveryZones: [],
                        statuses: [],
                        orderTypes: [],
                        excludeCompleted: true,
                        timeRange: { start: null, end: null }
                      })}
                      className={clsx(
                        'w-full px-3 py-2 text-xs rounded-lg transition-colors',
                        isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                      )}
                    >
                      Сбросить все фильтры
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-6">
          {errorMsg && (
            <div className={clsx('mb-3 rounded-lg px-3 py-2 text-sm', isDark ? 'bg-red-900/40 text-red-200 border border-red-700/50' : 'bg-red-50 text-red-700 border border-red-200')}>
              {errorMsg}
            </div>
          )}
          
          {/* Визуализация прогресса оптимизации (пункт 14) */}
          {optimizationProgress && (
            <div className={clsx(
              'mb-4 rounded-2xl p-6 border-2 shadow-lg',
              isDark 
                ? 'border-blue-600/50 bg-gradient-to-br from-blue-900/30 to-indigo-900/30' 
                : 'border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50'
            )}>
              <div className="flex items-center gap-3 mb-4">
                <div className={clsx(
                  'p-2 rounded-lg',
                  isDark ? 'bg-blue-600/20' : 'bg-blue-100'
                )}>
                  <ArrowPathIcon className={clsx('w-5 h-5 animate-spin', isDark ? 'text-blue-400' : 'text-blue-600')} />
                </div>
                <div className={clsx('text-sm font-semibold flex-1', isDark ? 'text-blue-200' : 'text-blue-800')}>
                  {optimizationProgress.message}
                </div>
              </div>
              <div className={clsx(
                'w-full rounded-full h-4 overflow-hidden',
                isDark ? 'bg-gray-700/50' : 'bg-gray-200'
              )}>
                <div
                  className={clsx(
                    'h-full rounded-full transition-all duration-500 shadow-lg',
                    'bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500'
                  )}
                  style={{
                    width: `${(optimizationProgress.current / Math.max(optimizationProgress.total, 1)) * 100}%`
                  }}
                />
              </div>
              <div className={clsx('text-xs mt-3 flex items-center justify-between', isDark ? 'text-blue-300' : 'text-blue-600')}>
                <span>Прогресс</span>
                <span className="font-bold">
                  {optimizationProgress.current} / {optimizationProgress.total} ({Math.round((optimizationProgress.current / Math.max(optimizationProgress.total, 1)) * 100)}%)
                </span>
              </div>
            </div>
          )}

          {trafficSnapshot && (
            <div
              className={clsx(
                'mb-3 rounded-lg p-4 border text-xs space-y-2',
                trafficAdvisory === 'critical'
                  ? (isDark ? 'border-red-700 bg-red-900/20 text-red-100' : 'border-red-200 bg-red-50 text-red-700')
                  : trafficAdvisory === 'high'
                    ? (isDark ? 'border-yellow-700 bg-yellow-900/20 text-yellow-100' : 'border-yellow-200 bg-yellow-50 text-yellow-800')
                    : (isDark ? 'border-emerald-700 bg-emerald-900/20 text-emerald-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700')
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-sm">Трафик {new Date(trafficSnapshot.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                <span>Средняя скорость: {trafficSnapshot.stats.avgSpeed} км/ч</span>
                <span>Критических: {trafficSnapshot.stats.criticalCount}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <span>Медиана: {trafficSnapshot.stats.medianSpeed ?? trafficSnapshot.stats.avgSpeed} км/ч</span>
                <span>Покрытие: {(trafficSnapshot.stats.coverageKm ?? 0).toFixed(1)} км</span>
                <span>Надежность: {trafficSnapshot.stats.reliabilityScore ?? 0}%</span>
                <span>Доля &lt; 20 км/ч: {trafficSnapshot.stats.slowSharePercent ?? 0}%</span>
              </div>
              {trafficSnapshot.stats.topCriticalSegments.length > 0 && (
                <div className="space-y-1">
                  <div className="uppercase tracking-wide text-[10px] opacity-80">Пробки</div>
                  {trafficSnapshot.stats.topCriticalSegments.slice(0, 2).map((seg, idx) => (
                    <div key={`${seg.congestion}-${idx}`} className="flex justify-between">
                      <span>#{idx + 1} загрузка {seg.congestion.toFixed(0)}%</span>
                      <span>{seg.speed} км/ч</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span>Режим: {trafficPreset.mode === 'gridlock' ? '⚠️ Критический' : trafficPreset.mode === 'busy' ? '⛔ Плотный' : '✅ Умеренный'}</span>
                <span>Макс. стопов: {trafficPreset.recommendedMaxStops}</span>
                <span>Лимит дистанции: {trafficPreset.maxDistanceCap} км</span>
                <span>Буфер: +{trafficPreset.bufferMinutes} мин</span>
              </div>
              <div className="text-[11px] font-medium">
                {trafficPreset.note}
              </div>
            </div>
          )}
          
          <button
            onClick={planRoutes}
            disabled={isPlanning || (ordersCount === 0)}
            className={clsx(
              'relative w-full px-8 py-4 rounded-2xl font-bold text-lg transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg',
              isPlanning || ordersCount === 0
                ? (isDark ? 'bg-gray-700/50 text-gray-400 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed')
                : trafficAdvisory === 'critical'
                  ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white shadow-red-500/50'
                  : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 text-white shadow-blue-500/50'
            )}
          >
            <div className="flex items-center justify-center gap-3">
              {isPlanning ? (
                <>
                  <ArrowPathIcon className="w-6 h-6 animate-spin" />
                  <span>Планирование маршрутов...</span>
                </>
              ) : (
                <>
                  <PlayIcon className="w-6 h-6" />
                  <span>{planButtonLabel}</span>
                </>
              )}
            </div>
            {!isPlanning && ordersCount > 0 && (
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-white/20 to-transparent opacity-0 hover:opacity-100 transition-opacity"></div>
            )}
          </button>

          {lastPlanPreset && (
            <div className={clsx(
              'mt-3 rounded-lg p-4 border text-xs space-y-1',
              isDark ? 'border-indigo-800 bg-indigo-900/20 text-indigo-100' : 'border-indigo-200 bg-indigo-50 text-indigo-800'
            )}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-semibold text-sm">Применённый режим трафика: {lastPlanPreset.mode === 'gridlock' ? 'Стоим' : lastPlanPreset.mode === 'busy' ? 'Плотный' : 'Свободный'}</span>
                <span>Буфер +{lastPlanPreset.bufferMinutes} мин</span>
              </div>
              <div>Стопов ≤ {lastPlanPreset.recommendedMaxStops} · Дистанция ≤ {lastPlanPreset.maxDistanceCap} км · Время ≤ {lastPlanPreset.maxRouteDurationCap} мин</div>
              <div>{lastPlanPreset.note}</div>
            </div>
          )}

          {planTrafficImpact && (
            <div className={clsx(
              'mt-3 rounded-lg p-4 border text-xs space-y-1',
              isDark ? 'border-amber-800 bg-amber-900/20 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-800'
            )}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-semibold text-sm">Влияние пробок на маршруты</span>
                <span>Режим: {planTrafficImpact.presetMode}</span>
              </div>
              <div>Суммарная задержка: {planTrafficImpact.totalDelay.toFixed(1)} мин · Критических маршрутов: {planTrafficImpact.criticalRoutes}</div>
              <div>Средняя скорость по сегментам: {planTrafficImpact.avgSegmentSpeed} км/ч</div>
              {planTrafficImpact.slowestRoute && (
                <div>Самый медленный маршрут: {planTrafficImpact.slowestRoute}</div>
              )}
              <div>Запас по буферу: +{planTrafficImpact.bufferMinutes} мин на каждую цепочку.</div>
            </div>
          )}
        </div>

        {/* Тепловая карта трафика (Mapbox) */}
        {sectorPathState && sectorPathState.length > 0 && (
          <div className={clsx('mt-6 rounded-xl border', isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-white')}>
            <button
              onClick={() => setIsTrafficHeatmapCollapsed(!isTrafficHeatmapCollapsed)}
              className={clsx(
                'w-full px-4 py-3 flex items-center justify-between transition-colors',
                isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'
              )}
            >
              <div className={clsx('text-sm font-medium flex items-center gap-2', isDark ? 'text-gray-300' : 'text-gray-800')}>
                <span>{isTrafficHeatmapCollapsed ? '▶' : '▼'}</span>
                <span>🚦 Тепловая карта трафика (Mapbox)</span>
                <span className={clsx('text-xs px-2 py-1 rounded-full', isDark ? 'bg-green-900/40 text-green-200' : 'bg-green-100 text-green-700')}>
                  Live
                </span>
              </div>
              <div className={clsx('text-[11px]', isDark ? 'text-gray-500' : 'text-gray-500')}>
                {mapboxTokenState ? 'Токен подключен' : 'Нет токена'}
              </div>
            </button>
            {!isTrafficHeatmapCollapsed && (
              <div className="p-4">
                {!mapboxTokenState && (
                  <div className={clsx('mb-3 text-xs px-3 py-2 rounded-lg', isDark ? 'bg-yellow-900/30 text-yellow-200' : 'bg-yellow-50 text-yellow-700')}>
                    ⚠️ Mapbox токен не задан в настройках. Используется дефолтный токен, рекомендуется указать собственный.
                  </div>
                )}
                <Suspense fallback={<div className={clsx('text-sm text-center py-8', isDark ? 'text-gray-400' : 'text-gray-600')}>Загрузка карты трафика...</div>}>
                  <TrafficHeatmap
                    sectorPath={sectorPathState}
                    sectorName={sectorCityName || 'Сектор'}
                    mapboxToken={mapboxTokenState}
                  />
                </Suspense>
              </div>
            )}
          </div>
        )}

          <div className={clsx(
            'mb-3 rounded-lg p-4 border text-xs space-y-2',
            isDark ? 'border-blue-800 bg-blue-900/20 text-blue-100' : 'border-blue-200 bg-blue-50 text-blue-800'
          )}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-semibold text-sm">🎛 Режим автопланирования по трафику</span>
              <div className="flex gap-1">
                {([
                  { value: 'auto', label: 'Авто' },
                  { value: 'free', label: 'Свободно' },
                  { value: 'busy', label: 'Плотно' },
                  { value: 'gridlock', label: 'Стоим' }
                ] as const).map(option => (
                  <button
                    key={option.value}
                    onClick={() => setTrafficModeOverride(option.value)}
                    className={clsx(
                      'px-2 py-1 rounded font-semibold text-[11px] transition-colors',
                      trafficModeOverride === option.value
                        ? (isDark ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white')
                        : (isDark ? 'bg-blue-900/40 text-blue-200 hover:bg-blue-900/60' : 'bg-white text-blue-600 border border-blue-200 hover:bg-blue-100')
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              Лимиты: до {trafficPreset.recommendedMaxStops} стопов · {trafficPreset.maxDistanceCap} км · {trafficPreset.maxRouteDurationCap} мин · буфер +{trafficPreset.bufferMinutes} мин
            </div>
            <div>{trafficPreset.note}</div>
          </div>

        {/* Тепловая карта загруженности */}
        {enableWorkloadHeatmap && workloadHeatmapData.length > 0 && (
          <div className={clsx('mt-6 rounded-2xl border-2 overflow-hidden transition-all', isDark ? 'border-gray-700 bg-gray-800/40' : 'border-gray-200 bg-white')}>
            <button
              onClick={() => setIsWorkloadHeatmapCollapsed(!isWorkloadHeatmapCollapsed)}
              className={clsx(
                'w-full px-4 py-3 flex items-center justify-between transition-colors',
                isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'
              )}
            >
              <div className="flex items-center gap-3">
                <div className={clsx('p-2 rounded-lg', isDark ? 'bg-blue-600/20' : 'bg-blue-100')}>
                  <ChartBarIcon className={clsx('w-5 h-5', isDark ? 'text-blue-400' : 'text-blue-600')} />
                </div>
                <span className={clsx('font-semibold', isDark ? 'text-white' : 'text-gray-900')}>
                  Тепловая карта загруженности
                </span>
              </div>
              <svg
                className={clsx('w-5 h-5 transition-transform', isWorkloadHeatmapCollapsed ? 'rotate-180' : '', isDark ? 'text-gray-400' : 'text-gray-600')}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {!isWorkloadHeatmapCollapsed && (
              <div className="p-4">
                <Suspense fallback={<div className={clsx('text-sm text-center py-8', isDark ? 'text-gray-400' : 'text-gray-600')}>Загрузка карты загруженности...</div>}>
                  <WorkloadHeatmap
                    orders={workloadHeatmapData}
                    sectorPath={sectorPathState || undefined}
                    onHeatmapDataLoad={(data) => {
                      setWorkloadHeatmapData(data as any)
                    }}
                  />
                </Suspense>
              </div>
            )}
          </div>
        )}

        {/* Анализ покрытия зоны */}
        {enableCoverageAnalysis && coverageAnalysis && (
          <div className={clsx('mt-6 rounded-xl p-4 border', isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-gray-50')}>
            <div className={clsx('text-sm font-semibold mb-3', isDark ? 'text-white' : 'text-gray-900')}>
              📊 Анализ покрытия зоны доставки
            </div>
            <div className={clsx('space-y-2 text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}>
              <div>
                Покрытие: <span className={clsx('font-bold', coverageAnalysis.coveragePercentage >= 80 ? 'text-green-600' : coverageAnalysis.coveragePercentage >= 50 ? 'text-yellow-600' : 'text-red-600')}>
                  {coverageAnalysis.coveragePercentage.toFixed(1)}%
                </span>
              </div>
              <div>Покрыто заказов: {coverageAnalysis.coveredOrders} / {coverageAnalysis.totalOrders}</div>
              <div>Не покрыто: {coverageAnalysis.uncoveredOrders}</div>
              {coverageAnalysis.coverageGaps.length > 0 && (
                <div>
                  Пробелов в покрытии: {coverageAnalysis.coverageGaps.length}
                  {coverageAnalysis.coverageGaps.filter(g => g.severity === 'high').length > 0 && (
                    <span className="text-red-600 ml-2">
                      ({coverageAnalysis.coverageGaps.filter(g => g.severity === 'high').length} критических)
                    </span>
                  )}
                </div>
              )}
              {coverageAnalysis.recommendations.length > 0 && (
                <div className={clsx('mt-3 p-3 rounded-lg', isDark ? 'bg-gray-900/50' : 'bg-gray-100')}>
                  <div className={clsx('text-xs font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>Рекомендации:</div>
                  <ul className="space-y-1 text-xs">
                    {coverageAnalysis.recommendations.map((rec, idx) => (
                      <li key={idx} className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>• {rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {(plannedRoutes.length > 0 || (isPlanning === false && excelData && ordersCount > 0 && plannedRoutes.length === 0)) && (
          <div className="mt-6" data-tour="routes">
            <div className={clsx('flex items-center justify-between mb-4 flex-wrap gap-3', isDark ? 'text-gray-300' : 'text-gray-700')}>
              <div className={clsx('text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}>
                {plannedRoutes.length > 0 
                  ? `Сформировано маршрутов: ${plannedRoutes.length}${excludedOutsideSector > 0 ? ` (исключено вне сектора: ${excludedOutsideSector})` : ''}`
                  : 'Маршруты не созданы. Проверьте фильтры и логи в консоли браузера (F12).'}
              </div>
              {plannedRoutes.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap" data-tour="analytics">
                  {/* Кнопка аналитики */}
                  <button
                    onClick={() => setShowAnalyticsModal(true)}
                    className={clsx(
                      'px-4 py-2 rounded-lg font-medium transition-all hover:scale-105 flex items-center gap-2',
                      isDark ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-purple-500 hover:bg-purple-600 text-white'
                    )}
                  >
                    <ChartBarIcon className="w-5 h-5" />
                    <span>Аналитика</span>
                  </button>
                  
                  {/* Кнопка истории */}
                  <button
                    onClick={() => {
                      setRouteHistoryEntries(routeHistory.getAll())
                      setShowHistoryModal(true)
                    }}
                    className={clsx(
                      'px-4 py-2 rounded-lg font-medium transition-all hover:scale-105 flex items-center gap-2',
                      isDark ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-indigo-500 hover:bg-indigo-600 text-white'
                    )}
                  >
                    <ClockIcon className="w-5 h-5" />
                    <span>История</span>
                    {routeHistoryEntries.length > 0 && (
                      <span className={clsx(
                        'px-2 py-0.5 rounded-full text-xs',
                        isDark ? 'bg-indigo-800 text-indigo-200' : 'bg-indigo-100 text-indigo-700'
                      )}>
                        {routeHistoryEntries.length}
                      </span>
                    )}
                  </button>
                </div>
              )}
              
              {/* Метрики эффективности и предложения */}
              {plannedRoutes.length > 0 && routeEfficiencyMetrics && (
                <div className={clsx('mt-4 p-4 rounded-xl border-2', isDark ? 'border-teal-700/50 bg-teal-900/20' : 'border-teal-200 bg-teal-50/50')}>
                  <div className={clsx('text-sm font-semibold mb-3 flex items-center gap-2', isDark ? 'text-teal-300' : 'text-teal-700')}>
                    ⚡ Эффективность распределения
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    <div>
                      <div className={clsx('text-xs opacity-70 mb-1', isDark ? 'text-gray-400' : 'text-gray-600')}>Баланс нагрузки</div>
                      <div className={clsx('text-lg font-bold', isDark ? 'text-white' : 'text-gray-900')}>
                        {((routeEfficiencyMetrics.balanceScore || 0) * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div>
                      <div className={clsx('text-xs opacity-70 mb-1', isDark ? 'text-gray-400' : 'text-gray-600')}>Использование</div>
                      <div className={clsx('text-lg font-bold', isDark ? 'text-white' : 'text-gray-900')}>
                        {((routeEfficiencyMetrics.routeUtilization || 0) * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div>
                      <div className={clsx('text-xs opacity-70 mb-1', isDark ? 'text-gray-400' : 'text-gray-600')}>Средняя дистанция</div>
                      <div className={clsx('text-lg font-bold', isDark ? 'text-white' : 'text-gray-900')}>
                        {(routeEfficiencyMetrics.avgDistancePerOrder / 1000).toFixed(1)} км
                      </div>
                    </div>
                    <div>
                      <div className={clsx('text-xs opacity-70 mb-1', isDark ? 'text-gray-400' : 'text-gray-600')}>Общая эффективность</div>
                      <div className={clsx('text-lg font-bold', isDark ? 'text-white' : 'text-gray-900')}>
                        {((routeEfficiencyMetrics.efficiencyScore || 0) * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>
                  {efficiencySuggestions.length > 0 && (
                    <div className={clsx('mt-3 p-3 rounded-lg', isDark ? 'bg-yellow-900/30 border border-yellow-700/50' : 'bg-yellow-50 border border-yellow-200')}>
                      <div className={clsx('text-xs font-semibold mb-2', isDark ? 'text-yellow-300' : 'text-yellow-700')}>💡 Предложения по улучшению:</div>
                      <ul className="space-y-1">
                        {efficiencySuggestions.map((suggestion, idx) => (
                          <li key={idx} className={clsx('text-xs', isDark ? 'text-yellow-200' : 'text-yellow-800')}>
                            • {suggestion}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {plannedRoutes.map((r) => (
                <div
                  key={r.id}
                  className={clsx(
                    'rounded-3xl p-6 border-2 transition-all duration-300 transform hover:scale-[1.02] relative overflow-hidden',
                    selectedRoute?.id === r.id
                      ? (isDark 
                          ? 'border-blue-500 bg-gradient-to-br from-blue-900/40 via-indigo-900/30 to-purple-900/40 ring-4 ring-blue-500/50 shadow-2xl' 
                          : 'border-blue-500 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 ring-4 ring-blue-500/30 shadow-2xl')
                      : (isDark 
                          ? 'border-gray-700/50 bg-gradient-to-br from-gray-800/60 to-gray-900/60 hover:border-gray-600 hover:shadow-xl' 
                          : 'border-gray-200 bg-gradient-to-br from-white to-gray-50/50 hover:border-blue-300 hover:shadow-xl')
                  )}
                >
                  {/* Декоративный градиентный фон */}
                  <div className={clsx(
                    'absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20',
                    selectedRoute?.id === r.id
                      ? 'bg-gradient-to-br from-blue-500 to-purple-500'
                      : 'bg-gradient-to-br from-gray-400 to-gray-600'
                  )}></div>
                  
                  {/* Заголовок маршрута - кликабельная область */}
                  <div 
                    className="relative z-10 flex items-start justify-between mb-4"
                  >
                    <div 
                      className="flex-1 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        // Сворачивание/разворачивание карточки
                        if (selectedRoute?.id === r.id) {
                          setSelectedRoute(null)
                        } else {
                          setSelectedRoute(r)
                        }
                      }}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <div className={clsx(
                          'p-3 rounded-2xl shadow-lg',
                          selectedRoute?.id === r.id
                            ? (isDark ? 'bg-gradient-to-br from-blue-600 to-indigo-600' : 'bg-gradient-to-br from-blue-500 to-indigo-500')
                            : (isDark ? 'bg-gradient-to-br from-gray-700 to-gray-800' : 'bg-gradient-to-br from-gray-200 to-gray-300')
                        )}>
                          <TruckIcon className={clsx('w-6 h-6', selectedRoute?.id === r.id ? 'text-white' : (isDark ? 'text-gray-300' : 'text-gray-700'))} />
                        </div>
                        <div className="flex-1">
                          <div className={clsx(
                            'text-xl font-bold mb-1',
                            selectedRoute?.id === r.id
                              ? (isDark ? 'text-white' : 'text-gray-900')
                              : (isDark ? 'text-white' : 'text-gray-900')
                          )}>
                            {r.name}
                          </div>
                          {r.hasCriticalTraffic && (
                            <div className={clsx(
                              'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium',
                              isDark ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-700'
                            )}>
                              <span>⚠️</span>
                              <span>Критические пробки</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Статистика маршрута - улучшенный дизайн */}
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className={clsx(
                          'rounded-xl p-4 border-2 backdrop-blur-sm transition-all',
                          selectedRoute?.id === r.id
                            ? (isDark ? 'border-blue-600/50 bg-blue-900/30' : 'border-blue-300 bg-blue-50/80')
                            : (isDark ? 'border-gray-700/50 bg-gray-800/50 hover:border-gray-600' : 'border-gray-200 bg-white/80 hover:border-gray-300')
                        )}>
                          <div className="flex items-center gap-2 mb-2">
                            <MapPinIcon className={clsx('w-4 h-4', isDark ? 'text-blue-400' : 'text-blue-600')} />
                            <div className={clsx('text-xs font-medium', isDark ? 'text-gray-400' : 'text-gray-600')}>Точек</div>
                          </div>
                          <div className={clsx('text-2xl font-bold', isDark ? 'text-blue-400' : 'text-blue-600')}>
                            {r.stopsCount || (1 + (r.waypoints?.length || 0))}
                          </div>
                        </div>
                        <div className={clsx(
                          'rounded-xl p-4 border-2 backdrop-blur-sm transition-all',
                          selectedRoute?.id === r.id
                            ? (isDark ? 'border-orange-600/50 bg-orange-900/30' : 'border-orange-300 bg-orange-50/80')
                            : (isDark ? 'border-gray-700/50 bg-gray-800/50 hover:border-gray-600' : 'border-gray-200 bg-white/80 hover:border-gray-300')
                        )}>
                          <div className="flex items-center gap-2 mb-2">
                            <ClockIcon className={clsx('w-4 h-4', isDark ? 'text-orange-400' : 'text-orange-600')} />
                            <div className={clsx('text-xs font-medium', isDark ? 'text-gray-400' : 'text-gray-600')}>Время</div>
                          </div>
                          <div className={clsx('text-2xl font-bold', isDark ? 'text-orange-400' : 'text-orange-600')}>
                            {r.totalDurationMin || '?'}
                          </div>
                          {r.totalTrafficDelay && r.totalTrafficDelay > 0 && (
                            <div className={clsx('text-xs mt-1', r.hasCriticalTraffic ? 'text-red-500' : 'text-orange-500')}>
                              +{r.totalTrafficDelay.toFixed(0)} мин
                            </div>
                          )}
                        </div>
                        <div className={clsx(
                          'rounded-xl p-4 border-2 backdrop-blur-sm transition-all',
                          selectedRoute?.id === r.id
                            ? (isDark ? 'border-green-600/50 bg-green-900/30' : 'border-green-300 bg-green-50/80')
                            : (isDark ? 'border-gray-700/50 bg-gray-800/50 hover:border-gray-600' : 'border-gray-200 bg-white/80 hover:border-gray-300')
                        )}>
                          <div className="flex items-center gap-2 mb-2">
                            <MapPinIcon className={clsx('w-4 h-4', isDark ? 'text-green-400' : 'text-green-600')} />
                            <div className={clsx('text-xs font-medium', isDark ? 'text-gray-400' : 'text-gray-600')}>Дистанция</div>
                          </div>
                          <div className={clsx('text-2xl font-bold', isDark ? 'text-green-400' : 'text-green-600')}>
                            {r.totalDistanceKm || '?'}
                          </div>
                          <div className={clsx('text-xs mt-1', isDark ? 'text-gray-500' : 'text-gray-500')}>км</div>
                        </div>
                      </div>
                      
                      {/* Отображаем все заказы из routeChainFull, даже если нет orderNumber */}
                        {r.routeChainFull && r.routeChainFull.length > 0 ? (
                          <div onClick={(e) => e.stopPropagation()}>
                            <span className={clsx('font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>Заказы: </span>
                            {r.routeChainFull.map((fullOrder: any, idx: number) => {
                              const orderNum = fullOrder?.orderNumber || fullOrder?.raw?.orderNumber || `#${idx + 1}`
                              return (
                                <React.Fragment key={idx}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (fullOrder) {
                                      // Используем raw из fullOrder, если есть, иначе сам fullOrder
                                      // Также проверяем, что raw содержит все поля из Excel
                                      const orderRaw = fullOrder.raw || fullOrder
                                      
                                      // Дополнительно проверяем: если raw не содержит нужные поля, но они есть в fullOrder
                                      // объединяем данные
                                      const combinedData = orderRaw === fullOrder ? fullOrder : { ...fullOrder, ...orderRaw }
                                      
                                      // Функции для парсинга времени (с поддержкой формата Excel)
                                      const parseTime = (val: any): number | null => {
                                        if (!val && val !== 0) return null
                                        const s = String(val).trim()
                                        if (!s) return null
                                        
                                        // Формат Excel дата+время: "2/11/25 13:06" или "M/d/yy HH:mm"
                                        const excelDateTimeMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i)
                                        if (excelDateTimeMatch) {
                                          let month = parseInt(excelDateTimeMatch[1], 10)
                                          let day = parseInt(excelDateTimeMatch[2], 10)
                                          let year = parseInt(excelDateTimeMatch[3], 10)
                                          let hour = parseInt(excelDateTimeMatch[4], 10)
                                          const minute = parseInt(excelDateTimeMatch[5], 10)
                                          const ampm = excelDateTimeMatch[7]
                                          
                                          if (year < 100) {
                                            year += year < 50 ? 2000 : 1900
                                          }
                                          
                                          if (ampm) {
                                            if (ampm.toUpperCase() === 'PM' && hour !== 12) {
                                              hour += 12
                                            } else if (ampm.toUpperCase() === 'AM' && hour === 12) {
                                              hour = 0
                                            }
                                          }
                                          
                                          const date = new Date(year, month - 1, day, hour, minute, 0)
                                          if (!isNaN(date.getTime())) {
                                            return date.getTime()
                                          }
                                        }
                                        
                                        // Формат только время: "HH:mm:ss AM/PM" или "HH:mm:ss"
                                        const timeOnlyMatch = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i)
                                        if (timeOnlyMatch) {
                                          let hour = parseInt(timeOnlyMatch[1], 10)
                                          const minute = parseInt(timeOnlyMatch[2], 10)
                                          const ampm = timeOnlyMatch[4]
                                          
                                          if (ampm) {
                                            if (ampm.toUpperCase() === 'PM' && hour !== 12) {
                                              hour += 12
                                            } else if (ampm.toUpperCase() === 'AM' && hour === 12) {
                                              hour = 0
                                            }
                                          }
                                          
                                          const base = new Date()
                                          base.setHours(hour, minute, 0, 0)
                                          return base.getTime()
                                        }
                                        
                                        // Формат HH:mm (простой)
                                        const simpleTimeMatch = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
                                        if (simpleTimeMatch) {
                                          const base = new Date()
                                          base.setHours(parseInt(simpleTimeMatch[1], 10), parseInt(simpleTimeMatch[2], 10), 0, 0)
                                          return base.getTime()
                                        }
                                        
                                        // Попытка распарсить как Date
                                        const d = new Date(s)
                                        if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
                                          return d.getTime()
                                        }
                                        
                                        return null
                                      }
                                      
                                      const getKitchenTime = (o: any): number | null => {
                                        
                                        // Ищем время во всех возможных полях, проверяя как точные совпадения, так и регистронезависимо
                                        const possibleFields = [
                                          'время на кухню', 'время_на_кухню', 'Время на кухню', 'Время_на_кухню', 'ВРЕМЯ НА КУХНЮ',
                                          'kitchen_time', 'kitchenTime', 'KitchenTime', 'KITCHEN_TIME',
                                          'kitchen', 'Kitchen', 'KITCHEN',
                                          'Kitchen Time', 'kitchen time', 'KITCHEN TIME',
                                          'Время готовности', 'время готовности', 'ВРЕМЯ ГОТОВНОСТИ',
                                          'Готовность', 'готовность', 'ГОТОВНОСТЬ',
                                          'kitchenTime' // Из excelProcessor
                                        ]
                                        
                                        // Сначала проверяем точные совпадения
                                        for (const field of possibleFields) {
                                          const value = o[field]
                                          if (value !== undefined && value !== null && String(value).trim() !== '') {
                                            const parsed = parseTime(value)
                                            if (parsed) {
                                              console.log(`✅ [Модальное окно] Найдено время на кухню в поле "${field}": ${value} → ${new Date(parsed).toLocaleString()}`)
                                              return parsed
                                            }
                                          }
                                        }
                                        
                                        // Затем проверяем регистронезависимо все ключи объекта на наличие полных фраз
                                        // Расширенный поиск по ключевым словам
                                        const searchPhrases = [
                                          'время на кухню', 'время_на_кухню', 'времянакухню', 'времянакухню',
                                          'kitchen_time', 'kitchentime', 'kitchen time', 'kitchentime',
                                          'время готовности', 'время_готовности', 'времяготовности',
                                          'готовность', 'ready time', 'ready_time', 'readytime',
                                          'time to kitchen', 'timetokitchen'
                                        ]
                                        
                                        // Сначала ищем по полному совпадению фразы
                                        for (const key in o) {
                                          const lowerKey = key.toLowerCase().trim()
                                          for (const phrase of searchPhrases) {
                                            if (lowerKey === phrase || lowerKey.includes(phrase)) {
                                              const parsed = parseTime(o[key])
                                              if (parsed) return parsed
                                            }
                                          }
                                        }
                                        
                                        // Если не нашли, пробуем найти по отдельным ключевым словам
                                        const keywords = ['кухню', 'kitchen', 'готовности', 'ready']
                                        for (const key in o) {
                                          const lowerKey = key.toLowerCase().trim()
                                          // Пропускаем поля, связанные с плановым временем
                                          if (lowerKey.includes('планов') || lowerKey.includes('planned') || 
                                              lowerKey.includes('дедлайн') || lowerKey.includes('deadline')) continue
                                          
                                          // Проверяем, содержит ли название поля ключевые слова
                                          for (const keyword of keywords) {
                                            if (lowerKey.includes(keyword)) {
                                              const parsed = parseTime(o[key])
                                              if (parsed) return parsed
                                            }
                                          }
                                        }
                                        
                                        return null
                                      }
                                      
                                      const getPlannedTime = (o: any): number | null => {
                                        // Используем ту же функцию parseTime, что определена выше
                                        
                                        // Ищем время во всех возможных полях
                                        const possibleFields = [
                                          'плановое время', 'плановое_время', 'Плановое время', 'Плановое_время', 'ПЛАНОВОЕ ВРЕМЯ',
                                          'plannedTime', 'planned_time', 'PlannedTime', 'PLANNED_TIME',
                                          'Planned Time', 'planned time', 'PLANNED TIME',
                                          'Дедлайн', 'дедлайн', 'ДЕДЛАЙН', 'deadline', 'Deadline', 'DEADLINE',
                                          'deadlineAt', 'deadline_at',
                                          'Время доставки', 'время доставки', 'ВРЕМЯ ДОСТАВКИ',
                                          'delivery_time', 'deliveryTime', 'DeliveryTime',
                                          'доставить к', 'доставить_к', 'Доставить к', // Из Excel таблицы
                                          'plannedTime' // Из excelProcessor
                                        ]
                                        
                                        // Сначала проверяем точные совпадения
                                        for (const field of possibleFields) {
                                          const value = o[field]
                                          if (value !== undefined && value !== null && String(value).trim() !== '') {
                                            const parsed = parseTime(value)
                                            if (parsed) {
                                              console.log(`✅ [Модальное окно] Найдено плановое время в поле "${field}": ${value} → ${new Date(parsed).toLocaleString()}`)
                                              return parsed
                                            }
                                          }
                                        }
                                        
                                        // Затем проверяем регистронезависимо все ключи объекта на наличие полных фраз (исключая поля связанные с кухней)
                                        const searchPhrases = [
                                          'плановое время', 'плановое_время', 'плановоевремя', 'плановоевремя',
                                          'planned_time', 'plannedtime', 'planned time', 'plannedtime',
                                          'дедлайн', 'deadline', 'deadline_time',
                                          'время доставки', 'время_доставки', 'времядодоставки',
                                          'delivery_time', 'deliverytime', 'delivery time', 'deliverytime'
                                        ]
                                        
                                        // Сначала ищем по полному совпадению фразы
                                        for (const key in o) {
                                          const lowerKey = key.toLowerCase().trim()
                                          // Пропускаем поля связанные с кухней
                                          if (lowerKey.includes('кухню') || lowerKey.includes('kitchen') || 
                                              lowerKey.includes('готовности') || lowerKey.includes('ready')) continue
                                          
                                          // Ищем полные фразы в названии поля
                                          for (const phrase of searchPhrases) {
                                            if (lowerKey === phrase || lowerKey.includes(phrase)) {
                                              const parsed = parseTime(o[key])
                                              if (parsed) return parsed
                                            }
                                          }
                                        }
                                        
                                        // Если не нашли, пробуем найти по отдельным ключевым словам
                                        const keywords = ['планов', 'planned', 'дедлайн', 'deadline', 'доставки', 'delivery']
                                        for (const key in o) {
                                          const lowerKey = key.toLowerCase().trim()
                                          // Пропускаем поля связанные с кухней
                                          if (lowerKey.includes('кухню') || lowerKey.includes('kitchen') ||
                                              lowerKey.includes('готовности') || lowerKey.includes('ready')) continue
                                          
                                          // Проверяем, содержит ли название поля ключевые слова
                                          for (const keyword of keywords) {
                                            if (lowerKey.includes(keyword)) {
                                              const parsed = parseTime(o[key])
                                              if (parsed) return parsed
                                            }
                                          }
                                        }
                                        
                                        return null
                                      }
                                      
                                      // ВАЖНО: Для отображения "время на кухню" используем readyAtSource (без упаковки),
                                      // а НЕ readyAt (который содержит +4 минуты упаковки)
                                      let readyAt = fullOrder.readyAtSource || null
                                      let deadlineAt = fullOrder.deadlineAt
                                      
                                      // Пробуем извлечь из combinedData (объединенные данные)
                                      if ((!readyAt || readyAt === null)) {
                                        // Сначала из combinedData (БЕЗ добавления упаковки, т.к. это время готовности)
                                        const ready = getKitchenTime(combinedData)
                                        if (ready) {
                                          readyAt = ready // БЕЗ +4 мин упаковки для отображения
                                          console.log('✅ Найдено время на кухню в combinedData:', ready)
                                        } else if (orderRaw && orderRaw !== fullOrder) {
                                          // Затем из orderRaw отдельно
                                          const ready2 = getKitchenTime(orderRaw)
                                          if (ready2) {
                                            readyAt = ready2 // БЕЗ +4 мин упаковки для отображения
                                            console.log('✅ Найдено время на кухню в orderRaw:', ready2)
                                          }
                                        }
                                        // И наконец из fullOrder напрямую
                                        if (!readyAt) {
                                          const ready3 = getKitchenTime(fullOrder)
                                          if (ready3) {
                                            readyAt = ready3 // БЕЗ +4 мин упаковки для отображения
                                            console.log('✅ Найдено время на кухню в fullOrder:', ready3)
                                          }
                                        }
                                      }
                                      
                                      if ((!deadlineAt || deadlineAt === null)) {
                                        // Сначала из combinedData
                                        const deadline = getPlannedTime(combinedData)
                                        if (deadline) {
                                          deadlineAt = deadline
                                          console.log('✅ Найдено плановое время в combinedData:', deadline)
                                        } else if (orderRaw && orderRaw !== fullOrder) {
                                          // Затем из orderRaw отдельно
                                          const deadline2 = getPlannedTime(orderRaw)
                                          if (deadline2) {
                                            deadlineAt = deadline2
                                            console.log('✅ Найдено плановое время в orderRaw:', deadline2)
                                          }
                                        }
                                        // И наконец из fullOrder напрямую
                                        if (!deadlineAt) {
                                          const deadline3 = getPlannedTime(fullOrder)
                                          if (deadline3) {
                                            deadlineAt = deadline3
                                            console.log('✅ Найдено плановое время в fullOrder:', deadline3)
                                          }
                                        }
                                      }
                                      
                                      // Отладочная информация - показываем все поля для диагностики
                                      const allKeysRaw = orderRaw ? Object.keys(orderRaw) : []
                                      const allKeysFull = Object.keys(fullOrder)
                                      const allKeysCombined = Object.keys(combinedData)
                                      
                                      const timeRelatedKeys = [...allKeysRaw, ...allKeysFull, ...allKeysCombined]
                                        .filter((key, index, self) => self.indexOf(key) === index) // уникальные
                                        .filter(key => {
                                          const lowerKey = key.toLowerCase()
                                          return lowerKey.includes('время') || lowerKey.includes('time') || 
                                                 lowerKey.includes('кухню') || lowerKey.includes('kitchen') ||
                                                 lowerKey.includes('планов') || lowerKey.includes('planned') ||
                                                 lowerKey.includes('дедлайн') || lowerKey.includes('deadline')
                                        })
                                      
                                      console.log('🔍 Отладка данных заказа:', {
                                        orderNumber: orderNum,
                                        'fullOrder.readyAt': fullOrder.readyAt,
                                        'fullOrder.deadlineAt': fullOrder.deadlineAt,
                                        'computed readyAt': readyAt,
                                        'computed deadlineAt': deadlineAt,
                                        'Все ключи orderRaw': allKeysRaw,
                                        'Все ключи fullOrder': allKeysFull,
                                        'Все ключи combinedData': allKeysCombined,
                                        'Ключи связанные со временем': timeRelatedKeys,
                                        'Значения временных полей из combinedData': timeRelatedKeys.reduce((acc, key) => {
                                          acc[key] = combinedData[key]
                                          return acc
                                        }, {} as Record<string, any>),
                                        'Значения временных полей из orderRaw': orderRaw ? timeRelatedKeys.reduce((acc, key) => {
                                          acc[key] = orderRaw[key]
                                          return acc
                                        }, {} as Record<string, any>) : {},
                                        'Значения временных полей из fullOrder': timeRelatedKeys.reduce((acc, key) => {
                                          acc[key] = fullOrder[key]
                                          return acc
                                        }, {} as Record<string, any>)
                                      })
                                      
                                      // Собираем все данные для selectedOrder, убеждаясь что raw содержит все поля из Excel
                                      const finalRaw = combinedData || orderRaw || fullOrder
                                      
                                      console.log('📦 [Установка selectedOrder]', {
                                        orderNumber: orderNum,
                                        'fullOrder.address': fullOrder.address,
                                        'combinedData?.address': combinedData?.address,
                                        'orderRaw?.address': orderRaw?.address,
                                        'finalRaw.address': finalRaw?.address,
                                        'finalRaw keys': Object.keys(finalRaw || {}).slice(0, 20),
                                        'readyAt': readyAt,
                                        'deadlineAt': deadlineAt,
                                        'finalRaw["время на кухню"]': finalRaw['время на кухню'],
                                        'finalRaw["плановое время"]': finalRaw['плановое время'],
                                        'finalRaw["доставить к"]': finalRaw['доставить к'],
                                      })
                                      
                                      // Защита от undefined и обеспечение корректной структуры
                                      const safeOrder = {
                                        orderNumber: orderNum || '',
                                        address: fullOrder?.address || combinedData?.address || orderRaw?.address || finalRaw?.address || '',
                                        readyAt: readyAt || null,
                                        readyAtSource: fullOrder?.readyAtSource || combinedData?.readyAtSource || orderRaw?.readyAtSource || null,
                                        deadlineAt: deadlineAt || null,
                                        deadlineAtSource: fullOrder?.deadlineAtSource || combinedData?.deadlineAtSource || orderRaw?.deadlineAtSource || null,
                                        raw: finalRaw || {} // Всегда объект, даже если пустой
                                      }
                                      
                                      setSelectedOrder(safeOrder)
                                    }
                                  }}
                                  className={clsx(
                                    'underline hover:no-underline cursor-pointer transition-colors',
                                    isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'
                                  )}
                                >
                                  {orderNum}
                                </button>
                                {idx < r.routeChainFull.length - 1 && <span>, </span>}
                              </React.Fragment>
                            )
                          })}
                        </div>
                      ) : r.orderNumbers && r.orderNumbers.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {r.orderNumbers.map((orderNum: string, idx: number) => (
                              <React.Fragment key={idx}>
                                <span className={clsx(
                                  'text-xs px-2 py-1 rounded cursor-pointer transition-colors',
                                  isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'
                                )}>
                                  {orderNum}
                                </span>
                                {idx < r.orderNumbers.length - 1 && <span>, </span>}
                              </React.Fragment>
                            ))}
                          </div>
                        ) : (
                          <div><span className="font-medium">-</span></div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpandedRouteModal(r) // Открываем в полноэкранном режиме
                        }}
                        className={clsx(
                          'p-2 rounded-lg transition-all hover:scale-110',
                          isDark ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                        )}
                        title="Открыть в полноэкранном режиме"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                      </button>
                      <div className={clsx(
                        'p-2 rounded-lg transition-all cursor-pointer',
                        selectedRoute?.id === r.id
                          ? (isDark ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-100 text-blue-600')
                          : (isDark ? 'bg-gray-700/50 text-gray-400' : 'bg-gray-100 text-gray-500')
                      )}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (selectedRoute?.id === r.id) {
                          setSelectedRoute(null)
                        } else {
                          setSelectedRoute(r)
                        }
                      }}
                      >
                        {selectedRoute?.id === r.id ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        )}
                    </div>
                  </div>
                  
                  {/* Развернутый контент маршрута */}
                  {selectedRoute?.id === r.id && (
                    <div 
                      className={clsx('mt-4 pt-4 border-t space-y-4', isDark ? 'border-gray-700' : 'border-gray-200')}
                      onClick={(e) => e.stopPropagation()} // Предотвращаем всплытие кликов
                    >
                      
                      {/* Порядок адресов */}
                      {r.routeChain && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <div className={clsx('text-sm font-semibold mb-2', isDark ? 'text-gray-200' : 'text-gray-800')}>
                            Порядок доставки
                          </div>
                          <div className={clsx('rounded-lg p-4', isDark ? 'bg-gray-900/30' : 'bg-gray-50')}>
                            <ol className="space-y-2">
                              {r.routeChain.map((addr: string, idx: number) => (
                                <li key={idx} className="flex items-start gap-2">
                                  <span className={clsx('flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold', isDark ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white')}>
                                    {idx + 1}
                                  </span>
                                  <span className={clsx('text-sm flex-1', isDark ? 'text-gray-300' : 'text-gray-700')}>
                                    {addr}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        </div>
                      )}
                      
                      {/* Уведомления */}
                      {enableNotifications && routeNotifications.has(r.id) && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <div className={clsx('text-sm font-semibold mb-3 flex items-center gap-2', isDark ? 'text-gray-200' : 'text-gray-800')}>
                            <span>🔔</span>
                            <span>Уведомления ({routeNotifications.get(r.id)?.length || 0})</span>
                          </div>
                          <div className={clsx('rounded-lg p-4 space-y-2 max-h-60 overflow-y-auto', isDark ? 'bg-gray-900/50' : 'bg-gray-50')}>
                            {routeNotifications.get(r.id)?.map((notification) => {
                              const formatted = formatNotificationForDisplay(notification)
                              return (
                                <div
                                  key={notification.id}
                                  className={clsx(
                                    'flex items-start gap-3 p-3 rounded-lg border-l-4',
                                    isDark ? 'bg-gray-800/50 border-gray-600' : 'bg-white border-gray-300',
                                    notification.priority === 'critical' ? 'border-red-500' :
                                    notification.priority === 'high' ? 'border-orange-500' :
                                    notification.priority === 'medium' ? 'border-blue-500' : 'border-gray-400'
                                  )}
                                >
                                  <span className="text-xl">{formatted.icon}</span>
                                  <div className="flex-1">
                                    <div className={clsx('text-xs font-medium mb-1', isDark ? 'text-gray-300' : 'text-gray-700')}>
                                      {formatted.title}
                                    </div>
                                    <div className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>
                                      {formatted.message}
                                    </div>
                                    <div className={clsx('text-xs mt-1', isDark ? 'text-gray-500' : 'text-gray-500')}>
                                      {new Date(notification.timestamp).toLocaleString('ru-RU', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Карта */}
                      <RouteMap 
                        route={r} 
                        onMarkerClick={(fullOrder) => {
                          // Находим индекс заказа в маршруте
                          const orderIdx = r.routeChainFull?.findIndex((o: any) => 
                            o.address === fullOrder.address && 
                            (o.orderNumber === fullOrder.orderNumber || o.raw?.orderNumber === fullOrder.raw?.orderNumber)
                          ) ?? -1
                          
                          if (orderIdx >= 0 && r.orderNumbers) {
                            const orderNum = r.orderNumbers[orderIdx]
                            
                            // Используем ту же логику, что и при клике на номер заказа
                            const orderRaw = fullOrder.raw || fullOrder
                            
                            // Объединяем данные из fullOrder и orderRaw
                            const combinedData = orderRaw === fullOrder ? fullOrder : { ...fullOrder, ...orderRaw }
                            
                            // Функции для парсинга времени (с поддержкой формата Excel)
                            const parseTime = (val: any): number | null => {
                              if (!val && val !== 0) return null
                              const s = String(val).trim()
                              if (!s) return null
                              
                              // Формат Excel дата+время: "2/11/25 13:06" или "M/d/yy HH:mm" (месяц/день/год)
                              // ИЛИ "29/10/25 13:30" или "DD/MM/YY HH:mm" (день/месяц/год) - когда день > 12
                              const excelDateTimeMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i)
                              if (excelDateTimeMatch) {
                                let first = parseInt(excelDateTimeMatch[1], 10)
                                let secondNum = parseInt(excelDateTimeMatch[2], 10)
                                let year = parseInt(excelDateTimeMatch[3], 10)
                                let hour = parseInt(excelDateTimeMatch[4], 10)
                                const minute = parseInt(excelDateTimeMatch[5], 10)
                                const timeSecond = excelDateTimeMatch[6] ? parseInt(excelDateTimeMatch[6], 10) : 0
                                const ampm = excelDateTimeMatch[7]
                                
                                // Определяем формат: если первое число > 12, это DD/MM/YY (день/месяц/год)
                                // Иначе это M/d/yy (месяц/день/год)
                                let month, day
                                if (first > 12) {
                                  // Формат DD/MM/YY (день/месяц/год) - например, "29/10/25"
                                  day = first
                                  month = secondNum
                                } else if (secondNum > 12) {
                                  // Формат M/d/yy (месяц/день/год) - например, "2/11/25"
                                  month = first
                                  day = secondNum
                                } else {
                                  // Неоднозначный случай: оба числа <= 12
                                  // По умолчанию считаем M/d/yy (месяц/день) - стандартный формат Excel
                                  month = first
                                  day = secondNum
                                }
                                
                                if (year < 100) {
                                  year += year < 50 ? 2000 : 1900
                                }
                                
                                if (ampm) {
                                  if (ampm.toUpperCase() === 'PM' && hour !== 12) {
                                    hour += 12
                                  } else if (ampm.toUpperCase() === 'AM' && hour === 12) {
                                    hour = 0
                                  }
                                }
                                
                                // Валидация даты
                                if (month < 1 || month > 12 || day < 1 || day > 31) {
                                  return null
                                }
                                
                                const date = new Date(year, month - 1, day, hour, minute, timeSecond)
                                if (!isNaN(date.getTime())) {
                                  return date.getTime()
                                }
                              }
                              
                              // Формат только время: "HH:mm:ss AM/PM" или "HH:mm:ss"
                              const timeOnlyMatch = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i)
                              if (timeOnlyMatch) {
                                let hour = parseInt(timeOnlyMatch[1], 10)
                                const minute = parseInt(timeOnlyMatch[2], 10)
                                const ampm = timeOnlyMatch[4]
                                
                                if (ampm) {
                                  if (ampm.toUpperCase() === 'PM' && hour !== 12) {
                                    hour += 12
                                  } else if (ampm.toUpperCase() === 'AM' && hour === 12) {
                                    hour = 0
                                  }
                                }
                                
                                const base = new Date()
                                base.setHours(hour, minute, 0, 0)
                                return base.getTime()
                              }
                              
                              // Формат "HH:MM"
                              const m = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
                              if (m) {
                                const base = new Date()
                                base.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0)
                                return base.getTime()
                              }
                              
                              // Попытка распарсить как Date
                              const d = new Date(s)
                              if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
                                return d.getTime()
                              }
                              
                              return null
                            }
                            
                            const getKitchenTime = (o: any): number | null => {
                              // Сначала проверяем точные совпадения
                              const exactFields = [
                                'время на кухню', 'время_на_кухню', 'Время на кухню', 'Время_на_кухню', 'ВРЕМЯ НА КУХНЮ',
                                // Ukrainian variants
                                'час на кухню', 'час_на_кухню', 'Час на кухню', 'Час_на_кухню',
                                'час на кухні', 'час_на_кухні', 'Час на кухні', 'Час_на_кухні',
                                'час готовності', 'Час готовності', 'готовність', 'Готовність',
                                'kitchen_time', 'kitchenTime', 'KitchenTime', 'KITCHEN_TIME',
                                'kitchen', 'Kitchen', 'KITCHEN',
                                'Kitchen Time', 'kitchen time',
                                'Время готовности', 'время готовности', 'Готовность', 'готовность',
                                'kitchenTime' // Из excelProcessor
                              ]
                              
                              for (const field of exactFields) {
                                const value = o[field]
                                if (value !== undefined && value !== null && String(value).trim() !== '') {
                                  const parsed = parseTime(value)
                                  if (parsed) {
                                    console.log(`✅ [Маркер карты] Найдено время на кухню в "${field}":`, value, '→', new Date(parsed).toLocaleString())
                                    return parsed
                                  }
                                }
                              }
                              
                              // Проверяем также raw данные если они есть
                              if (o.raw) {
                                for (const field of exactFields) {
                                  const value = o.raw[field]
                                  if (value !== undefined && value !== null && String(value).trim() !== '') {
                                    const parsed = parseTime(value)
                                    if (parsed) {
                                      console.log(`✅ [Маркер карты] Найдено время на кухню в raw.${field}:`, value, '→', new Date(parsed).toLocaleString())
                                      return parsed
                                    }
                                  }
                                }
                              }
                              
                              // Затем проверяем регистронезависимо на наличие полных фраз
                              const searchPhrases = [
                                'время на кухню', 'время_на_кухню', 'времянакухню',
                                // Ukrainian variants
                                'час на кухню', 'час_на_кухню', 'час на кухні', 'час_на_кухні',
                                'kitchen_time', 'kitchentime', 'kitchen time',
                                'время готовности', 'время_готовности',
                                'час готовності',
                                'готовность', 'готовність'
                              ]
                              
                              // Сначала ищем по точным фразам в основных полях
                              for (const key in o) {
                                if (key === 'raw') continue
                                const lowerKey = key.toLowerCase().trim()
                                for (const phrase of searchPhrases) {
                                  if (lowerKey === phrase || lowerKey.includes(phrase)) {
                                    const parsed = parseTime(o[key])
                                    if (parsed) {
                                      console.log(`✅ [Маркер карты] Найдено время на кухню в "${key}" (по фразе):`, o[key], '→', new Date(parsed).toLocaleString())
                                      return parsed
                                    }
                                  }
                                }
                              }
                              
                              // Затем ищем в raw по точным фразам
                              if (o.raw) {
                                for (const key in o.raw) {
                                  const lowerKey = key.toLowerCase().trim()
                                  for (const phrase of searchPhrases) {
                                    if (lowerKey === phrase || lowerKey.includes(phrase)) {
                                      const parsed = parseTime(o.raw[key])
                                      if (parsed) {
                                        console.log(`✅ [Маркер карты] Найдено время на кухню в raw["${key}"] (по фразе):`, o.raw[key], '→', new Date(parsed).toLocaleString())
                                        return parsed
                                      }
                                    }
                                  }
                                }
                              }
                              
                              // Если не нашли, ищем по ключевым словам (более гибкий поиск)
                              const keywords = ['кухню', 'кухні', 'kitchen', 'готовности', 'готовності', 'ready']
                              
                              // В основных полях
                              for (const key in o) {
                                if (key === 'raw') continue
                                const lowerKey = key.toLowerCase().trim()
                                
                                // Проверяем, содержит ли название ключевые слова
                                const hasKeyword = keywords.some(kw => lowerKey.includes(kw))
                                // Исключаем поля, связанные с плановым временем/дедлайном
                                const isNotDeadline = !lowerKey.includes('планов') && 
                                                       !lowerKey.includes('planned') && 
                                                       !lowerKey.includes('дедлайн') && 
                                                       !lowerKey.includes('deadline') &&
                                                       !lowerKey.includes('доставки') &&
                                                       !lowerKey.includes('delivery')
                                
                                if (hasKeyword && isNotDeadline) {
                                  const parsed = parseTime(o[key])
                                  if (parsed) {
                                    console.log(`✅ [Маркер карты] Найдено время на кухню в "${key}" (по ключевому слову):`, o[key], '→', new Date(parsed).toLocaleString())
                                    return parsed
                                  }
                                }
                              }
                              
                              // В raw данных
                              if (o.raw) {
                                for (const key in o.raw) {
                                  const lowerKey = key.toLowerCase().trim()
                                  
                                  // Проверяем, содержит ли название ключевые слова
                                  const hasKeyword = keywords.some(kw => lowerKey.includes(kw))
                                  // Исключаем поля, связанные с плановым временем/дедлайном
                                  const isNotDeadline = !lowerKey.includes('планов') && 
                                                         !lowerKey.includes('planned') && 
                                                         !lowerKey.includes('дедлайн') && 
                                                         !lowerKey.includes('deadline') &&
                                                         !lowerKey.includes('доставки') &&
                                                         !lowerKey.includes('delivery')
                                  
                                  if (hasKeyword && isNotDeadline) {
                                    const parsed = parseTime(o.raw[key])
                                    if (parsed) {
                                      console.log(`✅ [Маркер карты] Найдено время на кухню в raw["${key}"] (по ключевому слову):`, o.raw[key], '→', new Date(parsed).toLocaleString())
                                      return parsed
                                    }
                                  }
                                }
                              }
                              
                              return null
                            }
                            
                            const getPlannedTime = (o: any): number | null => {
                              // Используем ту же функцию parseTime, что определена выше
                              // Сначала проверяем точные совпадения
                              const exactFields = [
                                'плановое время', 'плановое_время', 'Плановое время', 'Плановое_время', 'ПЛАНОВОЕ ВРЕМЯ',
                                'plannedTime', 'planned_time', 'PlannedTime', 'PLANNED_TIME',
                                'Planned Time', 'planned time',
                                'Дедлайн', 'дедлайн', 'ДЕДЛАЙН', 'deadline', 'Deadline', 'DEADLINE',
                                'deadlineAt', 'deadline_at',
                                'Время доставки', 'время доставки', 'delivery_time', 'deliveryTime',
                                'доставить к', 'доставить_к', 'Доставить к', // Из Excel таблицы
                                'plannedTime' // Из excelProcessor
                              ]
                              
                              for (const field of exactFields) {
                                const value = o[field]
                                if (value !== undefined && value !== null && String(value).trim() !== '') {
                                  const parsed = parseTime(value)
                                  if (parsed) {
                                    console.log(`✅ [Маркер карты] Найден дедлайн в "${field}":`, value, '→', new Date(parsed).toLocaleString())
                                    return parsed
                                  }
                                }
                              }
                              
                              // Проверяем также raw данные если они есть
                              if (o.raw) {
                                for (const field of exactFields) {
                                  const value = o.raw[field]
                                  if (value !== undefined && value !== null && String(value).trim() !== '') {
                                    const parsed = parseTime(value)
                                    if (parsed) {
                                      console.log(`✅ [Маркер карты] Найден дедлайн в raw.${field}:`, value, '→', new Date(parsed).toLocaleString())
                                      return parsed
                                    }
                                  }
                                }
                              }
                              
                              // Затем проверяем регистронезависимо на наличие полных фраз (исключая поля связанные с кухней)
                              const searchPhrases = [
                                'плановое время', 'плановое_время', 'плановоевремя',
                                'planned_time', 'plannedtime', 'planned time',
                                'дедлайн', 'deadline',
                                'время доставки', 'время_доставки', 'времядодоставки',
                                'delivery_time', 'deliverytime', 'delivery time'
                              ]
                              for (const key in o) {
                                const lowerKey = key.toLowerCase().trim()
                                // Пропускаем поля связанные с кухней
                                if (lowerKey.includes('кухню') || lowerKey.includes('kitchen')) continue
                                
                                for (const phrase of searchPhrases) {
                                  if (lowerKey === phrase || lowerKey.includes(phrase)) {
                                    const parsed = parseTime(o[key])
                                    if (parsed) return parsed
                                  }
                                }
                              }
                              
                              return null
                            }
                            
                            // ВАЖНО: Для отображения "время на кухню" используем readyAtSource (без упаковки)
                            let readyAt = fullOrder.readyAtSource || null
                            let deadlineAt = fullOrder.deadlineAt
                            
                            // Пробуем извлечь из combinedData (объединенные данные)
                            if ((!readyAt || readyAt === null)) {
                              // Сначала из combinedData (БЕЗ добавления упаковки, т.к. это время готовности)
                              const ready = getKitchenTime(combinedData)
                              if (ready) {
                                readyAt = ready // БЕЗ +4 мин упаковки для отображения
                                console.log('✅ Найдено время на кухню в combinedData (маркер):', ready)
                              } else if (orderRaw && orderRaw !== fullOrder) {
                                  // Затем из orderRaw отдельно
                                  const ready2 = getKitchenTime(orderRaw)
                                  if (ready2) {
                                    readyAt = ready2 // БЕЗ +4 мин упаковки для отображения
                                    console.log('✅ Найдено время на кухню в orderRaw (маркер):', ready2)
                                  }
                                }
                              // И наконец из fullOrder напрямую
                              if (!readyAt) {
                                const ready3 = getKitchenTime(fullOrder)
                                if (ready3) {
                                  readyAt = ready3 // БЕЗ +4 мин упаковки для отображения
                                  console.log('✅ Найдено время на кухню в fullOrder (маркер):', ready3)
                                }
                              }
                            }
                            
                            if ((!deadlineAt || deadlineAt === null)) {
                              // Сначала из combinedData
                              const deadline = getPlannedTime(combinedData)
                              if (deadline) {
                                deadlineAt = deadline
                                console.log('✅ Найдено плановое время в combinedData (маркер):', deadline)
                              } else if (orderRaw && orderRaw !== fullOrder) {
                                // Затем из orderRaw отдельно
                                const deadline2 = getPlannedTime(orderRaw)
                                if (deadline2) {
                                  deadlineAt = deadline2
                                  console.log('✅ Найдено плановое время в orderRaw (маркер):', deadline2)
                                }
                              }
                              // И наконец из fullOrder напрямую
                              if (!deadlineAt) {
                                const deadline3 = getPlannedTime(fullOrder)
                                if (deadline3) {
                                  deadlineAt = deadline3
                                  console.log('✅ Найдено плановое время в fullOrder (маркер):', deadline3)
                                }
                              }
                            }
                            
                            // Собираем все данные для selectedOrder, убеждаясь что raw содержит все поля из Excel
                            const finalRaw = combinedData || orderRaw || fullOrder
                            
                            console.log('📦 [Установка selectedOrder из маркера]', {
                              orderNumber: orderNum,
                              'fullOrder.address': fullOrder.address,
                              'combinedData?.address': combinedData?.address,
                              'orderRaw?.address': orderRaw?.address,
                              'finalRaw.address': finalRaw?.address,
                              'finalRaw keys': Object.keys(finalRaw || {}).slice(0, 20),
                              'readyAt': readyAt,
                              'deadlineAt': deadlineAt,
                              'finalRaw["время на кухню"]': finalRaw['время на кухню'],
                              'finalRaw["плановое время"]': finalRaw['плановое время'],
                              'finalRaw["доставить к"]': finalRaw['доставить к'],
                            })
                            
                            // Защита от undefined и обеспечение корректной структуры
                            const safeOrder = {
                              orderNumber: orderNum || '',
                              address: fullOrder?.address || combinedData?.address || orderRaw?.address || finalRaw?.address || '',
                              readyAt: readyAt || null,
                              readyAtSource: fullOrder?.readyAtSource || combinedData?.readyAtSource || orderRaw?.readyAtSource || null,
                              deadlineAt: deadlineAt || null,
                              deadlineAtSource: fullOrder?.deadlineAtSource || combinedData?.deadlineAtSource || orderRaw?.deadlineAtSource || null,
                              raw: finalRaw || {} // Всегда объект, даже если пустой
                            }
                            
                            setSelectedOrder(safeOrder)
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {isPlanning && (
          <div className={clsx('mt-6 rounded-lg p-4 border', isDark ? 'border-blue-700 bg-blue-900/20' : 'border-blue-200 bg-blue-50')}>
            <div className={clsx('text-sm', isDark ? 'text-blue-200' : 'text-blue-700')}>
              ⏳ Планирование маршрутов... Пожалуйста, подождите. Откройте консоль браузера (F12) для деталей.
            </div>
          </div>
        )}
      </div>

      {/* Модальное окно с информацией о заказе */}
      {selectedOrder && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
          onClick={() => setSelectedOrder(null)}
        >
          <div 
            className={clsx(
              'relative w-full max-w-md mx-4 rounded-xl shadow-2xl',
              isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Заголовок */}
            <div className={clsx(
              'px-6 py-4 border-b flex items-center justify-between',
              isDark ? 'border-gray-700' : 'border-gray-200'
            )}>
              <h3 className={clsx('text-lg font-semibold', isDark ? 'text-white' : 'text-gray-900')}>
                Заказ {selectedOrder?.orderNumber || selectedOrder?.raw?.orderNumber || '#'}
              </h3>
              <button
                onClick={() => setSelectedOrder(null)}
                className={clsx(
                  'text-2xl leading-none hover:opacity-70 transition-opacity',
                  isDark ? 'text-gray-400' : 'text-gray-600'
                )}
              >
                ×
              </button>
            </div>

            {/* Содержимое */}
            <div className="p-6 space-y-4">
              {/* Адрес */}
              <div>
                <div className={clsx('text-xs font-medium mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                  Адрес доставки
                </div>
                <div className={clsx('text-sm', isDark ? 'text-gray-200' : 'text-gray-700')}>
                  {selectedOrder?.address || 'Не указан'}
                </div>
              </div>

              {/* Время на кухню */}
              <div>
                <div className={clsx('text-xs font-medium mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                  Время на кухню (готовность)
                </div>
                {(() => {
                  // Защита от undefined
                  if (!selectedOrder) {
                    return (
                      <div className={clsx('text-sm italic', isDark ? 'text-gray-500' : 'text-gray-400')}>
                        Данные недоступны
                      </div>
                    )
                  }
                  
                  // ВАЖНО: Для отображения "время на кухню" используем readyAtSource (без упаковки),
                  // а НЕ readyAt (который содержит +4 минуты упаковки)
                  let readyAt: number | null = selectedOrder.readyAtSource || null
                  let readyText: string | null = null // Для длительностей (например, "43мин.")
                  
                  // Если readyAtSource не найден, пробуем найти время в raw данных
                  // (getKitchenTime недоступна здесь, поэтому используем прямую проверку)
                  
                  // Локальная функция парсинга времени (без рекурсии)
                  // isKitchenTime: если true, то для Excel serial numbers извлекаем только время и применяем к дате заказа
                  const parseTimeLocal = (val: any, depth: number = 0, isKitchenTime: boolean = false): number | null => {
                    // Защита от бесконечной рекурсии
                    if (depth > 3) return null
                    
                    if (!val && val !== 0) return null
                    const s = String(val).trim()
                    if (!s) return null
                    
                    // Пропускаем некорректные значения Excel (##########)
                    if (s.includes('#')) {
                      return null
                    }
                    
                    const strVal = s.toLowerCase()
                    // Пропускаем длительности (но сохраняем их как текст)
                    if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour')) {
                      return null
                    }
                    
                    // Формат DD.MM.YYYY HH:MM:SS или DD.MM.YYYY HH:MM (например, "10.10.2025 11:02:21")
                    const dotDateTimeMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/i)
                    if (dotDateTimeMatch) {
                      const day = parseInt(dotDateTimeMatch[1], 10)
                      const month = parseInt(dotDateTimeMatch[2], 10)
                      const year = parseInt(dotDateTimeMatch[3], 10)
                      let hour = parseInt(dotDateTimeMatch[4], 10)
                      const minute = parseInt(dotDateTimeMatch[5], 10)
                      const second = dotDateTimeMatch[6] ? parseInt(dotDateTimeMatch[6], 10) : 0
                      
                      const date = new Date(year, month - 1, day, hour, minute, second)
                      if (!isNaN(date.getTime())) {
                        return date.getTime()
                      }
                    }
                    
                    // Формат только время с секундами: "HH:mm:ss AM/PM" или "HH:mm:ss" (например, "11:48:17", "10:32:21 AM")
                    const timeOnlyMatch = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i)
                    if (timeOnlyMatch) {
                      let hour = parseInt(timeOnlyMatch[1], 10)
                      const minute = parseInt(timeOnlyMatch[2], 10)
                      const second = timeOnlyMatch[3] ? parseInt(timeOnlyMatch[3], 10) : 0
                      const ampm = timeOnlyMatch[4]
                      
                      if (ampm) {
                        if (ampm.toUpperCase() === 'PM' && hour !== 12) {
                          hour += 12
                        } else if (ampm.toUpperCase() === 'AM' && hour === 12) {
                          hour = 0
                        }
                      }
                      
                      const base = new Date()
                      base.setHours(hour, minute, second, 0)
                      return base.getTime()
                    }
                    
                    // Формат HH:mm (простой)
                    const simpleTimeMatch = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
                    if (simpleTimeMatch) {
                      const base = new Date()
                      base.setHours(parseInt(simpleTimeMatch[1], 10), parseInt(simpleTimeMatch[2], 10), 0, 0)
                      return base.getTime()
                    }
                    
                    // Пробуем распарсить как Excel serial number (дата+время или только время)
                    // Сначала проверяем, является ли это числом (или строкой с числом)
                    const excelTime = typeof val === 'number' ? val : parseFloat(s)
                    if (!isNaN(excelTime) && excelTime > 0) {
                      // Если это число >= 25569 - это дата+время в формате Excel (дата с 1900-01-01)
                      // Excel epoch начинается с 1 января 1900, что соответствует serial number 1
                      // Но в JavaScript Date epoch - это 1 января 1970, что соответствует serial number 25569
                      if (excelTime >= 25569) {
                        // Excel serial date: количество дней с 1 января 1900 + дробная часть (время дня)
                        const days = Math.floor(excelTime)
                        const timeFraction = excelTime - days
                        
                        // Для "время на кухню" извлекаем только время и применяем к дате заказа
                        if (isKitchenTime) {
                          // Извлекаем только время из дробной части (более точный расчет)
                          // timeFraction - это доля дня (0.0 - 0.999...)
                          const totalHours = timeFraction * 24
                          const hours = Math.floor(totalHours)
                          const minutes = Math.floor((totalHours - hours) * 60)
                          const seconds = Math.round(((totalHours - hours) * 60 - minutes) * 60)
                          
                          // Пытаемся найти дату заказа из других полей
                          let targetDate = new Date()
                          
                          // Сначала проверяем готовые поля объекта заказа
                          if (selectedOrder?.deadlineAt) {
                            const deadlineDate = new Date(selectedOrder.deadlineAt)
                            if (!isNaN(deadlineDate.getTime())) {
                              targetDate = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate(), 0, 0, 0, 0)
                            }
                          }
                          
                          // Затем проверяем raw данные
                          if (selectedOrder?.raw && depth < 2) {
                            // Ищем дату в полях "доставить к", "плановое время" и т.д.
                            const dateKeys = ['доставить к', 'доставить_к', 'плановое время', 'плановое_время', 
                                             'Дата.доставить к', 'Дата.плановое время', 'plannedTime', 'deadlineAt']
                            for (const dateKey of dateKeys) {
                              const dateValue = selectedOrder.raw[dateKey]
                              if (dateValue !== undefined && dateValue !== null) {
                                const dateStr = String(dateValue).trim()
                                const excelDate = typeof dateValue === 'number' ? dateValue : parseFloat(dateStr)
                                if (!isNaN(excelDate) && excelDate > 25569) {
                                  // Парсим дату из Excel serial number
                                  const dateDays = Math.floor(excelDate)
                                  const excelEpoch = new Date(Date.UTC(1899, 11, 30))
                                  const parsedDate = new Date(excelEpoch.getTime() + dateDays * 86400 * 1000)
                                  if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 2000) {
                                    targetDate = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 0, 0, 0, 0)
                                    break
                                  }
                                } else if (depth < 2) {
                                  // Пробуем парсить через parseTimeLocal (с ограничением глубины рекурсии)
                                  const parsed = parseTimeLocal(dateValue, depth + 1, false)
                                  if (parsed) {
                                    const parsedDate = new Date(parsed)
                                    if (!isNaN(parsedDate.getTime())) {
                                      targetDate = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 0, 0, 0, 0)
                                      if (!isNaN(targetDate.getTime())) {
                                        break
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                          
                          // Применяем извлеченное время к дате заказа
                          targetDate.setHours(hours, minutes, seconds, 0)
                          
                          if (!isNaN(targetDate.getTime())) {
                            console.log(`✅ [parseTimeLocal] Распарсен Excel serial для времени на кухню: ${excelTime} → время ${hours}:${String(minutes).padStart(2, '0')} применено к дате ${targetDate.toLocaleDateString('ru-RU')}`)
                            return targetDate.getTime()
                          }
                        } else {
                          // Для других полей используем полную дату+время из Excel serial number
                          // Конвертируем в JavaScript Date
                          // Excel epoch: 1900-01-01, но Excel считает 1900 високосным (ошибка), поэтому нужно вычесть 1 день
                          // JavaScript Date использует UTC, поэтому используем UTC методы
                          const excelEpoch = new Date(Date.UTC(1899, 11, 30)) // 30 декабря 1899 UTC
                          const date = new Date(excelEpoch.getTime() + days * 86400 * 1000)
                          
                          // Добавляем время дня (дробная часть) - более точный расчет
                          const totalHours = timeFraction * 24
                          const hours = Math.floor(totalHours)
                          const minutes = Math.floor((totalHours - hours) * 60)
                          const seconds = Math.round(((totalHours - hours) * 60 - minutes) * 60)
                          
                          date.setUTCHours(hours, minutes, seconds, 0)
                          
                          if (!isNaN(date.getTime()) && date.getFullYear() > 2000) {
                            console.log(`✅ [parseTimeLocal] Распарсен Excel serial date+time: ${excelTime} → ${date.toLocaleString('ru-RU')}`)
                            return date.getTime()
                          }
                        }
                      }
                      // Если это число от 0 до 1 - это время дня (Excel serial time)
                      else if (excelTime >= 0 && excelTime < 1) {
                        // Используем более точный расчет для избежания ошибок округления
                        const totalMinutes = Math.round(excelTime * 24 * 60) // Общее количество минут в дне
                        const hours = Math.floor(totalMinutes / 60)
                        const minutes = totalMinutes % 60
                        
                        // Используем дату из "доставить к" или "плановое время", если она доступна
                        let targetDate = new Date()
                        if (selectedOrder?.raw && depth < 2) {
                          const dateKeys = ['доставить к', 'доставить_к', 'плановое время', 'плановое_время', 
                                           'Дата.доставить к', 'Дата.плановое время', 'plannedTime']
                          for (const dateKey of dateKeys) {
                            const dateValue = selectedOrder.raw[dateKey]
                            if (dateValue !== undefined && dateValue !== null) {
                              const dateStr = String(dateValue).trim()
                              const excelDate = typeof dateValue === 'number' ? dateValue : parseFloat(dateStr)
                              if (!isNaN(excelDate) && excelDate > 25569) {
                                const utcDate = new Date((excelDate - 25569) * 86400 * 1000)
                                const year = utcDate.getUTCFullYear()
                                const month = utcDate.getUTCMonth()
                                const day = utcDate.getUTCDate()
                                targetDate = new Date(year, month, day, 0, 0, 0, 0)
                                if (!isNaN(targetDate.getTime()) && targetDate.getFullYear() > 2000) {
                                  break
                                }
                              } else if (depth < 2) {
                                // Пробуем парсить через parseTimeLocal (с ограничением глубины рекурсии)
                                const parsed = parseTimeLocal(dateValue, depth + 1)
                                if (parsed) {
                                  const parsedDate = new Date(parsed)
                                  if (!isNaN(parsedDate.getTime())) {
                                    targetDate = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 0, 0, 0, 0)
                                    if (!isNaN(targetDate.getTime())) {
                                      break
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                        
                        targetDate.setHours(hours, minutes, 0, 0)
                        return targetDate.getTime()
                      }
                    }
                    
                    // Пробуем распарсить как дату/время
                    const date = new Date(s)
                    if (!isNaN(date.getTime()) && date.getFullYear() > 2000) {
                      return date.getTime()
                    }
                    
                    return null
                  }
                  
                  // Проверяем основные поля объекта ПЕРВЫМИ (включая русские/украинские названия)
                  const directFields = [
                    'kitchenTime', 'kitchen_time', 'KitchenTime', 'KITCHEN_TIME',
                    'kitchen', 'Kitchen', 'KITCHEN',
                    'Kitchen Time', 'kitchen time',
                    // Русские варианты
                    'время на кухню', 'время_на_кухню', 'Время на кухню', 'Время_на_кухню', 'ВРЕМЯ НА КУХНЮ',
                    'Время готовности', 'время готовности', 'Готовность', 'готовность',
                    // Украинские варианты
                    'час на кухню', 'час_на_кухню', 'Час на кухню', 'Час_на_кухню',
                    'час на кухні', 'час_на_кухні', 'Час на кухні', 'Час_на_кухні',
                    'час готовності', 'Час готовності', 'готовність', 'Готовність'
                  ]
                  for (const field of directFields) {
                    const value = selectedOrder?.[field]
                    if (value !== undefined && value !== null && String(value).trim() !== '') {
                      const strVal = String(value).trim().toLowerCase()
                      // Проверяем, это длительность или время
                      if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour')) {
                        readyText = String(value).trim()
                        console.log(`ℹ️ [Модальное окно] Найдена длительность в o.${field}: ${readyText}`)
                        break
                      } else {
                        // Для полей "время на кухню" передаем isKitchenTime: true
                        const parsed = parseTimeLocal(value, 0, true)
                        if (parsed) {
                          readyAt = parsed
                          console.log(`✅ [Модальное окно] Найдено время на кухню в o.${field}: ${value}`)
                          break
                        }
                      }
                    }
                  }
                  
                  // Если не нашли в основных полях, проверяем raw
                  if (!readyAt && !readyText && selectedOrder?.raw) {
                    // Проверяем основные поля в raw (включая русские/украинские)
                    for (const field of directFields) {
                      const value = selectedOrder.raw[field]
                      if (value !== undefined && value !== null && String(value).trim() !== '') {
                        console.log(`🔍 [Модальное окно] Проверяю raw.${field} = ${value} (тип: ${typeof value})`)
                        const strVal = String(value).trim().toLowerCase()
                        // Проверяем, это длительность или время
                        // Важно: не блокируем парсинг Excel serial numbers (числа >= 25569)
                        const isDuration = strVal.includes('мин.') || 
                                          (strVal.includes('час') && !/^\d+\.?\d*$/.test(strVal)) || 
                                          strVal.includes('min') || 
                                          strVal.includes('hour')
                        if (isDuration) {
                          readyText = String(value).trim()
                          console.log(`ℹ️ [Модальное окно] Найдена длительность в raw.${field}: ${readyText}`)
                          break
                        } else {
                          // Для полей "время на кухню" передаем isKitchenTime: true
                          const parsed = parseTimeLocal(value, 0, true)
                          if (parsed) {
                            readyAt = parsed
                            console.log(`✅ [Модальное окно] Найдено время на кухню в raw.${field}: ${value} → ${new Date(parsed).toLocaleString('ru-RU')}`)
                            break
                          } else {
                            console.log(`⚠️ [Модальное окно] Не удалось распарсить raw.${field} = ${value}`)
                          }
                        }
                      }
                    }
                    
                    // Затем проверяем регистронезависимый поиск по всем ключам в raw (на случай нестандартных названий)
                    if (!readyAt && !readyText) {
                      const raw = selectedOrder.raw
                      const searchPhrases = [
                        'время на кухню', 'время_на_кухню', 'времянакухню',
                        'час на кухню', 'час_на_кухню', 'час на кухні', 'час_на_кухні',
                        'kitchen_time', 'kitchentime', 'kitchen time',
                        'время готовности', 'время_готовности',
                        'час готовності',
                        'готовность', 'готовність'
                      ]
                      
                      // Сначала ищем по точным фразам
                      for (const key in raw) {
                        if (!raw.hasOwnProperty(key)) continue
                        const lowerKey = key.toLowerCase().trim()
                        for (const phrase of searchPhrases) {
                          if (lowerKey === phrase || lowerKey.includes(phrase)) {
                            const value = raw[key]
                            if (value !== undefined && value !== null && String(value).trim() !== '') {
                              const strVal = String(value).trim().toLowerCase()
                              if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour')) {
                                readyText = String(value).trim()
                                console.log(`ℹ️ [Модальное окно] Найдена длительность в raw["${key}"]: ${readyText}`)
                                break
                              } else {
                                // Для полей "время на кухню" передаем isKitchenTime: true
                                const parsed = parseTimeLocal(value, 0, true)
                                if (parsed) {
                                  readyAt = parsed
                                  console.log(`✅ [Модальное окно] Найдено время на кухню в raw["${key}"]: ${value}`)
                                  break
                                }
                              }
                            }
                          }
                        }
                        if (readyAt || readyText) break
                      }
                      
                      // Если не нашли, ищем по ключевым словам (более гибкий поиск)
                      if (!readyAt && !readyText) {
                        const keywords = ['кухню', 'кухні', 'kitchen', 'готовности', 'готовності', 'ready']
                        for (const key in raw) {
                          if (!raw.hasOwnProperty(key)) continue
                          const lowerKey = key.toLowerCase().trim()
                          
                          // Проверяем, содержит ли название ключевые слова
                          const hasKeyword = keywords.some(kw => lowerKey.includes(kw))
                          // Исключаем поля, связанные с плановым временем/дедлайном
                          const isNotDeadline = !lowerKey.includes('планов') && 
                                                 !lowerKey.includes('planned') && 
                                                 !lowerKey.includes('дедлайн') && 
                                                 !lowerKey.includes('deadline') &&
                                                 !lowerKey.includes('доставки') &&
                                                 !lowerKey.includes('delivery')
                          
                          if (hasKeyword && isNotDeadline) {
                            const value = raw[key]
                            if (value !== undefined && value !== null && String(value).trim() !== '') {
                              const strVal = String(value).trim().toLowerCase()
                              // Пропускаем длительности, но сохраняем их
                              if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour')) {
                                // Проверяем, не является ли это временем (например, "15:30" содержит "час" в "часов")
                                if (!/^\d+[:\s]/.test(strVal)) {
                                  readyText = String(value).trim()
                                  console.log(`ℹ️ [Модальное окно] Найдена длительность в raw["${key}"] (по ключевому слову): ${readyText}`)
                                  break
                                }
                              } else {
                                // Для полей "время на кухню" передаем isKitchenTime: true
                                const parsed = parseTimeLocal(value, 0, true)
                                if (parsed) {
                                  readyAt = parsed
                                  console.log(`✅ [Модальное окно] Найдено время на кухню в raw["${key}"] (по ключевому слову): ${value}`)
                                  break
                                }
                              }
                            }
                          }
                        }
                      }
                      
                      // Если все еще не нашли, логируем все доступные ключи для отладки
                      if (!readyAt && !readyText) {
                        const allKeys = Object.keys(raw || {})
                        const timeRelatedKeys = allKeys.filter(key => {
                          const lowerKey = key.toLowerCase()
                          return lowerKey.includes('время') || lowerKey.includes('time') || 
                                 lowerKey.includes('кухню') || lowerKey.includes('кухні') || lowerKey.includes('kitchen') ||
                                 lowerKey.includes('готовности') || lowerKey.includes('готовності') || lowerKey.includes('ready')
                        })
                        console.warn('⚠️ [Модальное окно] Время на кухню не найдено. Доступные ключи:', {
                          'Все ключи': allKeys,
                          'Ключи связанные со временем': timeRelatedKeys,
                          'Значения временных полей': timeRelatedKeys.reduce((acc, key) => {
                            acc[key] = raw[key]
                            return acc
                          }, {} as Record<string, any>)
                        })
                      }
                    }
                  }
                  
                  // Отображаем результат
                  if (readyAt) {
                    return (
                      <div className={clsx('text-sm font-medium', isDark ? 'text-blue-400' : 'text-blue-600')}>
                        {new Date(readyAt).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    )
                  } else if (readyText) {
                    return (
                      <div className={clsx('text-sm font-medium', isDark ? 'text-blue-400' : 'text-blue-600')}>
                        {readyText}
                      </div>
                    )
                  } else {
                    return (
                      <div className={clsx('text-sm italic', isDark ? 'text-gray-500' : 'text-gray-400')}>
                        Не указано
                      </div>
                    )
                  }
                })()}
              </div>

              {/* Плановое время доставки */}
              <div>
                <div className={clsx('text-xs font-medium mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                  Плановое время доставки (дедлайн)
                </div>
                {(() => {
                  // Защита от undefined
                  if (!selectedOrder) {
                    return (
                      <div className={clsx('text-sm italic', isDark ? 'text-gray-500' : 'text-gray-400')}>
                        Данные недоступны
                      </div>
                    )
                  }
                  
                  // Используем правильную логику поиска времени
                  let deadlineAt: number | null = selectedOrder.deadlineAtSource || selectedOrder.deadlineAt || null
                  let deadlineText: string | null = null // Для длительностей (например, "43мин.")
                  
                  // Локальная функция парсинга времени (без рекурсии)
                  const parseTimeLocal = (val: any, depth: number = 0): number | null => {
                    // Защита от бесконечной рекурсии
                    if (depth > 3) return null
                    if (!val && val !== 0) return null
                    const s = String(val).trim()
                    if (!s) return null
                    
                    // Пропускаем некорректные значения Excel (##########)
                    if (s.includes('#')) {
                      return null
                    }
                    
                    const strVal = s.toLowerCase()
                    // Пропускаем длительности (но сохраняем их как текст)
                    if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour')) {
                      return null
                    }
                    
                    // Формат DD.MM.YYYY HH:MM:SS или DD.MM.YYYY HH:MM (например, "10.10.2025 11:02:21")
                    const dotDateTimeMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/i)
                    if (dotDateTimeMatch) {
                      const day = parseInt(dotDateTimeMatch[1], 10)
                      const month = parseInt(dotDateTimeMatch[2], 10)
                      const year = parseInt(dotDateTimeMatch[3], 10)
                      let hour = parseInt(dotDateTimeMatch[4], 10)
                      const minute = parseInt(dotDateTimeMatch[5], 10)
                      const second = dotDateTimeMatch[6] ? parseInt(dotDateTimeMatch[6], 10) : 0
                      
                      const date = new Date(year, month - 1, day, hour, minute, second)
                      if (!isNaN(date.getTime())) {
                        return date.getTime()
                      }
                    }
                    
                    // Формат только время с секундами: "HH:mm:ss AM/PM" или "HH:mm:ss" (например, "11:48:17", "10:32:21 AM")
                    const timeOnlyMatch = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i)
                    if (timeOnlyMatch) {
                      let hour = parseInt(timeOnlyMatch[1], 10)
                      const minute = parseInt(timeOnlyMatch[2], 10)
                      const second = timeOnlyMatch[3] ? parseInt(timeOnlyMatch[3], 10) : 0
                      const ampm = timeOnlyMatch[4]
                      
                      if (ampm) {
                        if (ampm.toUpperCase() === 'PM' && hour !== 12) {
                          hour += 12
                        } else if (ampm.toUpperCase() === 'AM' && hour === 12) {
                          hour = 0
                        }
                      }
                      
                      const base = new Date()
                      base.setHours(hour, minute, second, 0)
                      return base.getTime()
                    }
                    
                    // Формат HH:mm (простой)
                    const simpleTimeMatch = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
                    if (simpleTimeMatch) {
                      const base = new Date()
                      base.setHours(parseInt(simpleTimeMatch[1], 10), parseInt(simpleTimeMatch[2], 10), 0, 0)
                      return base.getTime()
                    }
                    
                    // Пробуем распарсить как дату/время
                    const date = new Date(s)
                    if (!isNaN(date.getTime()) && date.getFullYear() > 2000) {
                      return date.getTime()
                    }
                    
                    return null
                  }
                  
                  // Проверяем основные поля объекта ПЕРВЫМИ
                  const directFields = ['plannedTime', 'planned_time', 'PlannedTime', 'PLANNED_TIME']
                  for (const field of directFields) {
                    const value = selectedOrder?.[field]
                    if (value !== undefined && value !== null && String(value).trim() !== '') {
                      const strVal = String(value).trim().toLowerCase()
                      // Проверяем, это длительность или время
                      if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour')) {
                        deadlineText = String(value).trim()
                        console.log(`ℹ️ [Модальное окно] Найдена длительность в o.${field}: ${deadlineText}`)
                        break
                      } else {
                        const parsed = parseTimeLocal(value, 0)
                        if (parsed) {
                          deadlineAt = parsed
                          console.log(`✅ [Модальное окно] Найдено плановое время в o.${field}: ${value}`)
                          break
                        }
                      }
                    }
                  }
                  
                  // Если не нашли в основных полях, проверяем raw
                  if (!deadlineAt && !deadlineText && selectedOrder?.raw) {
                    // Проверяем основные поля в raw
                    for (const field of directFields) {
                      const value = selectedOrder.raw[field]
                      if (value !== undefined && value !== null && String(value).trim() !== '') {
                        const strVal = String(value).trim().toLowerCase()
                        if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour')) {
                          deadlineText = String(value).trim()
                          console.log(`ℹ️ [Модальное окно] Найдена длительность в raw.${field}: ${deadlineText}`)
                          break
                        } else {
                          const parsed = parseTimeLocal(value, 0)
                          if (parsed) {
                            deadlineAt = parsed
                            console.log(`✅ [Модальное окно] Найдено плановое время в raw.${field}: ${value}`)
                            break
                          }
                        }
                      }
                    }
                    
                    // Затем проверяем русские названия полей в raw
                    if (!deadlineAt && !deadlineText) {
                      const raw = selectedOrder.raw
                      const timeFields = [
                        'плановое время', 'плановое_время', 'Плановое время', 'Плановое_время',
                        'plannedTime', 'planned_time', 'PlannedTime',
                        'Planned Time', 'planned time',
                        'Дедлайн', 'дедлайн', 'deadline', 'Deadline',
                        'deadlineAt', 'deadline_at',
                        'Время доставки', 'время доставки',
                        'delivery_time', 'deliveryTime',
                        'доставить к', 'доставить_к'
                      ]
                      
                      for (const field of timeFields) {
                        const value = raw?.[field]
                        if (value !== undefined && value !== null && String(value).trim() !== '') {
                          const strVal = String(value).trim().toLowerCase()
                          if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour')) {
                            deadlineText = String(value).trim()
                            console.log(`ℹ️ [Модальное окно] Найдена длительность в raw.${field}: ${deadlineText}`)
                            break
                          } else {
                            const parsed = parseTimeLocal(value, 0)
                            if (parsed) {
                              deadlineAt = parsed
                              console.log(`✅ [Модальное окно] Найдено плановое время в raw.${field}: ${value}`)
                              break
                            }
                          }
                        }
                      }
                    }
                  }
                  
                  // Отображаем результат
                  if (deadlineAt) {
                    return (
                      <div className={clsx('text-sm font-medium', isDark ? 'text-red-400' : 'text-red-600')}>
                        {new Date(deadlineAt).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    )
                  } else if (deadlineText) {
                    return (
                      <div className={clsx('text-sm font-medium', isDark ? 'text-red-400' : 'text-red-600')}>
                        {deadlineText}
                      </div>
                    )
                  } else {
                    return (
                      <div className={clsx('text-sm italic', isDark ? 'text-gray-500' : 'text-gray-400')}>
                        Не указано
                      </div>
                    )
                  }
                })()}
              </div>

              {/* Дополнительная информация */}
              {selectedOrder?.raw && Object.keys(selectedOrder.raw).length > 0 && (
                <div className={clsx('pt-4 border-t', isDark ? 'border-gray-700' : 'border-gray-200')}>
                  {(selectedOrder.raw?.clientName || selectedOrder.raw?.['Имя клиента']) && (
                    <div className="mb-2">
                      <div className={clsx('text-xs font-medium mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                        Клиент
                      </div>
                      <div className={clsx('text-sm', isDark ? 'text-gray-200' : 'text-gray-700')}>
                        {selectedOrder.raw?.clientName || selectedOrder.raw?.['Имя клиента'] || 'Не указан'}
                      </div>
                    </div>
                  )}
                  {(selectedOrder.raw?.orderSum || selectedOrder.raw?.['Сумма заказа']) && (
                    <div>
                      <div className={clsx('text-xs font-medium mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                        Сумма заказа
                      </div>
                      <div className={clsx('text-sm font-medium', isDark ? 'text-green-400' : 'text-green-600')}>
                        {selectedOrder.raw?.orderSum || selectedOrder.raw?.['Сумма заказа'] || '0'} ₴
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Кнопка закрытия */}
            <div className={clsx(
              'px-6 py-4 border-t flex justify-end',
              isDark ? 'border-gray-700' : 'border-gray-200'
            )}>
              <button
                onClick={() => setSelectedOrder(null)}
                className={clsx(
                  'px-4 py-2 rounded-lg font-medium transition-colors',
                  isDark 
                    ? 'bg-blue-600 hover:bg-blue-500 text-white' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                )}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно управления графиками курьеров */}
      {showScheduleModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
          onClick={() => {
            setShowScheduleModal(false)
            setEditingSchedule(null)
          }}
        >
          <div 
            className={clsx(
              'relative w-full max-w-4xl mx-4 max-h-[90vh] rounded-xl shadow-2xl overflow-hidden',
              isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Заголовок */}
            <div className={clsx(
              'px-6 py-4 border-b flex items-center justify-between',
              isDark ? 'border-gray-700' : 'border-gray-200'
            )}>
              <h3 className={clsx('text-lg font-semibold', isDark ? 'text-white' : 'text-gray-900')}>
                Управление графиками курьеров
              </h3>
              <button
                onClick={() => {
                  setShowScheduleModal(false)
                  setEditingSchedule(null)
                }}
                className={clsx(
                  'text-2xl leading-none hover:opacity-70 transition-opacity',
                  isDark ? 'text-gray-400' : 'text-gray-600'
                )}
              >
                ×
              </button>
            </div>

            {/* Содержимое */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="space-y-4">
                {/* Кнопка добавления */}
                <button
                  onClick={() => {
                    const newSchedule = createDefaultSchedule(
                      `courier_${Date.now()}`,
                      `Курьер ${courierSchedules.length + 1}`,
                      'car',
                      true
                    )
                    setEditingSchedule(newSchedule)
                  }}
                  className={clsx(
                    'w-full px-4 py-2 rounded-lg font-medium transition-colors',
                    isDark 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  )}
                >
                  + Добавить график курьера
                </button>

                {/* Список графиков */}
                {courierSchedules.length === 0 ? (
                  <div className={clsx('text-center py-8', isDark ? 'text-gray-400' : 'text-gray-500')}>
                    Нет добавленных графиков. Нажмите "Добавить график курьера" для создания.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {courierSchedules.map((schedule) => (
                      <div
                        key={schedule.courierId}
                        className={clsx(
                          'p-4 rounded-lg border',
                          isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'
                        )}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <div className={clsx('font-medium', isDark ? 'text-white' : 'text-gray-900')}>
                              {schedule.courierName}
                            </div>
                            <div className={clsx('text-xs mt-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                              {schedule.vehicleType === 'car' ? '🚗 Авто' : '🏍️ Мото'} • 
                              {schedule.isActive ? ' ✅ Активен' : ' ❌ Неактивен'}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingSchedule(schedule)}
                              className={clsx(
                                'px-3 py-1 text-xs rounded font-medium transition-colors',
                                isDark 
                                  ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                                  : 'bg-blue-600 hover:bg-blue-700 text-white'
                              )}
                            >
                              Редактировать
                            </button>
                            <button
                              onClick={() => {
                                setCourierSchedules(courierSchedules.filter(s => s.courierId !== schedule.courierId))
                              }}
                              className={clsx(
                                'px-3 py-1 text-xs rounded font-medium transition-colors',
                                isDark 
                                  ? 'bg-red-600 hover:bg-red-700 text-white' 
                                  : 'bg-red-600 hover:bg-red-700 text-white'
                              )}
                            >
                              Удалить
                            </button>
                          </div>
                        </div>
                        <div className={clsx('text-xs space-y-1', isDark ? 'text-gray-400' : 'text-gray-600')}>
                          {schedule.workDays.map((wd, idx) => {
                            const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
                            return (
                              <div key={idx}>
                                {dayNames[wd.dayOfWeek]}: {wd.startTime}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно редактирования графика */}
      {editingSchedule && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50"
          onClick={() => setEditingSchedule(null)}
        >
          <div 
            className={clsx(
              'relative w-full max-w-2xl mx-4 max-h-[90vh] rounded-xl shadow-2xl overflow-hidden',
              isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Заголовок */}
            <div className={clsx(
              'px-6 py-4 border-b flex items-center justify-between',
              isDark ? 'border-gray-700' : 'border-gray-200'
            )}>
              <h3 className={clsx('text-lg font-semibold', isDark ? 'text-white' : 'text-gray-900')}>
                {editingSchedule.courierId.startsWith('courier_') ? 'Добавить график' : 'Редактировать график'}
              </h3>
              <button
                onClick={() => setEditingSchedule(null)}
                className={clsx(
                  'text-2xl leading-none hover:opacity-70 transition-opacity',
                  isDark ? 'text-gray-400' : 'text-gray-600'
                )}
              >
                ×
              </button>
            </div>

            {/* Содержимое */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="space-y-4">
                {/* Имя курьера */}
                <div>
                  <label className={clsx('block text-sm font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
                    Имя курьера
                  </label>
                  <input
                    type="text"
                    value={editingSchedule.courierName}
                    onChange={(e) => setEditingSchedule({ ...editingSchedule, courierName: e.target.value })}
                    className={clsx(
                      'w-full px-3 py-2 rounded-lg border',
                      isDark 
                        ? 'bg-gray-700 border-gray-600 text-white' 
                        : 'bg-white border-gray-300 text-gray-900'
                    )}
                    placeholder="Введите имя курьера"
                  />
                </div>

                {/* Тип транспорта */}
                <div>
                  <label className={clsx('block text-sm font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
                    Тип транспорта
                  </label>
                  <select
                    value={editingSchedule.vehicleType}
                    onChange={(e) => setEditingSchedule({ 
                      ...editingSchedule, 
                      vehicleType: e.target.value as 'car' | 'motorcycle',
                      maxDistanceKm: e.target.value === 'motorcycle' ? VEHICLE_LIMITS.motorcycle.maxDistanceKm : undefined
                    })}
                    className={clsx(
                      'w-full px-3 py-2 rounded-lg border',
                      isDark 
                        ? 'bg-gray-700 border-gray-600 text-white' 
                        : 'bg-white border-gray-300 text-gray-900'
                    )}
                  >
                    <option value="car">🚗 Автомобиль (все зоны)</option>
                    <option value="motorcycle">🏍️ Мотоцикл (до {VEHICLE_LIMITS.motorcycle.maxDistanceKm} км)</option>
                  </select>
                </div>

                {/* Активность */}
                <div>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={editingSchedule.isActive}
                      onChange={(e) => setEditingSchedule({ ...editingSchedule, isActive: e.target.checked })}
                      className="rounded"
                    />
                    <span className={clsx('text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}>
                      Активен
                    </span>
                  </label>
                </div>

                {/* График работы */}
                <div>
                  <label className={clsx('block text-sm font-medium mb-3', isDark ? 'text-gray-300' : 'text-gray-700')}>
                    График работы
                  </label>
                  <div className="space-y-3">
                    {editingSchedule.workDays.map((workDay, idx) => {
                      const dayNames = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
                      return (
                        <div
                          key={idx}
                          className={clsx(
                            'p-3 rounded-lg border',
                            isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className={clsx('text-sm font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>
                              {dayNames[workDay.dayOfWeek]}
                            </span>
                            <button
                              onClick={() => {
                                const newWorkDays = editingSchedule.workDays.filter((_, i) => i !== idx)
                                setEditingSchedule({ ...editingSchedule, workDays: newWorkDays })
                              }}
                              className={clsx(
                                'text-xs px-2 py-1 rounded',
                                isDark 
                                  ? 'bg-red-600 hover:bg-red-700 text-white' 
                                  : 'bg-red-600 hover:bg-red-700 text-white'
                              )}
                            >
                              Удалить
                            </button>
                          </div>
                          <div>
                            <label className={clsx('block text-xs mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                              Время начала работы
                            </label>
                            <input
                              type="time"
                              value={workDay.startTime}
                              onChange={(e) => {
                                const newWorkDays = [...editingSchedule.workDays]
                                newWorkDays[idx] = { ...workDay, startTime: e.target.value }
                                setEditingSchedule({ ...editingSchedule, workDays: newWorkDays })
                              }}
                              className={clsx(
                                'w-full px-2 py-1 rounded border text-sm',
                                isDark 
                                  ? 'bg-gray-700 border-gray-600 text-white' 
                                  : 'bg-white border-gray-300 text-gray-900'
                              )}
                            />
                          </div>
                        </div>
                      )
                    })}
                    <div className="space-y-2">
                      <select
                        id="newDaySelect"
                        className={clsx(
                          'w-full px-3 py-2 rounded-lg border text-sm',
                          isDark 
                            ? 'bg-gray-700 border-gray-600 text-white' 
                            : 'bg-white border-gray-300 text-gray-900'
                        )}
                        defaultValue="1"
                      >
                        <option value="0">Воскресенье</option>
                        <option value="1">Понедельник</option>
                        <option value="2">Вторник</option>
                        <option value="3">Среда</option>
                        <option value="4">Четверг</option>
                        <option value="5">Пятница</option>
                        <option value="6">Суббота</option>
                      </select>
                      <button
                        onClick={() => {
                          const select = document.getElementById('newDaySelect') as HTMLSelectElement
                          const dayOfWeek = parseInt(select.value)
                          // Проверяем, не добавлен ли уже этот день
                          if (editingSchedule.workDays.some(wd => wd.dayOfWeek === dayOfWeek)) {
                            alert('Этот день недели уже добавлен')
                            return
                          }
                          const newWorkDay = {
                            dayOfWeek,
                            startTime: '09:00',
                            endTime: '18:00',
                          }
                          setEditingSchedule({
                            ...editingSchedule,
                            workDays: [...editingSchedule.workDays, newWorkDay]
                          })
                          // Сбрасываем выбор
                          select.value = '1'
                        }}
                        className={clsx(
                          'w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                          isDark 
                            ? 'bg-gray-700 hover:bg-gray-600 text-white border border-gray-600' 
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                        )}
                      >
                        + Добавить день
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Кнопки действий */}
            <div className={clsx(
              'px-6 py-4 border-t flex justify-end gap-3',
              isDark ? 'border-gray-700' : 'border-gray-200'
            )}>
              <button
                onClick={() => setEditingSchedule(null)}
                className={clsx(
                  'px-4 py-2 rounded-lg font-medium transition-colors',
                  isDark 
                    ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                )}
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  if (editingSchedule.courierName.trim() && editingSchedule.workDays.length > 0) {
                    const existingIndex = courierSchedules.findIndex(s => s.courierId === editingSchedule.courierId)
                    if (existingIndex >= 0) {
                      const updated = [...courierSchedules]
                      updated[existingIndex] = editingSchedule
                      setCourierSchedules(updated)
                    } else {
                      setCourierSchedules([...courierSchedules, editingSchedule])
                    }
                    setEditingSchedule(null)
                  } else {
                    alert('Заполните имя курьера и добавьте хотя бы один рабочий день')
                  }
                }}
                className={clsx(
                  'px-4 py-2 rounded-lg font-medium transition-colors',
                  isDark 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                )}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно аналитики */}
      {showAnalyticsModal && routeAnalytics && (
        <div 
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowAnalyticsModal(false)}
        >
          <div 
            className={clsx(
              'relative w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col mx-4',
              isDark ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border-2 border-gray-700' : 'bg-gradient-to-br from-white via-gray-50 to-white border-2 border-gray-200'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={clsx('px-8 py-6 border-b flex items-center justify-between', isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50/50')}>
              <h2 className={clsx('text-2xl font-bold flex items-center gap-3', isDark ? 'text-white' : 'text-gray-900')}>
                <ChartBarIcon className="w-8 h-8" />
                <span>Аналитика маршрутов</span>
              </h2>
              <button
                onClick={() => setShowAnalyticsModal(false)}
                className={clsx('p-3 rounded-xl hover:opacity-70 transition-all', isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700')}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-8">
              <div className="space-y-6">
                {/* Общая статистика */}
                <div className={clsx('grid grid-cols-2 md:grid-cols-4 gap-4', isDark ? 'text-gray-200' : 'text-gray-800')}>
                  <div className={clsx('p-4 rounded-xl border-2', isDark ? 'border-blue-600/30 bg-blue-900/20' : 'border-blue-200 bg-blue-50/50')}>
                    <div className="text-xs font-medium mb-1 opacity-70">Маршрутов</div>
                    <div className="text-2xl font-bold">{routeAnalytics.totalRoutes}</div>
                  </div>
                  <div className={clsx('p-4 rounded-xl border-2', isDark ? 'border-green-600/30 bg-green-900/20' : 'border-green-200 bg-green-50/50')}>
                    <div className="text-xs font-medium mb-1 opacity-70">Заказов</div>
                    <div className="text-2xl font-bold">{routeAnalytics.totalOrders}</div>
                  </div>
                  <div className={clsx('p-4 rounded-xl border-2', isDark ? 'border-orange-600/30 bg-orange-900/20' : 'border-orange-200 bg-orange-50/50')}>
                    <div className="text-xs font-medium mb-1 opacity-70">Расстояние</div>
                    <div className="text-2xl font-bold">{routeAnalytics.totalDistance.toFixed(1)}</div>
                    <div className="text-xs opacity-70">км</div>
                  </div>
                  <div className={clsx('p-4 rounded-xl border-2', isDark ? 'border-purple-600/30 bg-purple-900/20' : 'border-purple-200 bg-purple-50/50')}>
                    <div className="text-xs font-medium mb-1 opacity-70">Время</div>
                    <div className="text-2xl font-bold">{routeAnalytics.totalDuration.toFixed(0)}</div>
                    <div className="text-xs opacity-70">мин</div>
                  </div>
                </div>
                
                {/* Эффективность */}
                <div className={clsx('p-6 rounded-xl border-2', isDark ? 'border-purple-600/30 bg-purple-900/20' : 'border-purple-200 bg-purple-50')}>
                  <h3 className={clsx('text-lg font-bold mb-4', isDark ? 'text-purple-300' : 'text-purple-700')}>Эффективность</h3>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Средняя эффективность</span>
                        <span className="font-bold">{((routeAnalytics.avgEfficiency || 0) * 100).toFixed(0)}%</span>
                      </div>
                      <div className={clsx('h-3 rounded-full overflow-hidden', isDark ? 'bg-gray-700' : 'bg-gray-200')}>
                        <div 
                          className={clsx('h-full transition-all', routeAnalytics.avgEfficiency > 0.7 ? 'bg-green-500' : routeAnalytics.avgEfficiency > 0.5 ? 'bg-yellow-500' : 'bg-red-500')}
                          style={{ width: `${(routeAnalytics.avgEfficiency || 0) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div className={clsx('p-2 rounded', isDark ? 'bg-green-900/30' : 'bg-green-50')}>
                        <div className="font-bold">Отлично</div>
                        <div>{routeAnalytics.efficiencyDistribution.excellent}</div>
                      </div>
                      <div className={clsx('p-2 rounded', isDark ? 'bg-blue-900/30' : 'bg-blue-50')}>
                        <div className="font-bold">Хорошо</div>
                        <div>{routeAnalytics.efficiencyDistribution.good}</div>
                      </div>
                      <div className={clsx('p-2 rounded', isDark ? 'bg-yellow-900/30' : 'bg-yellow-50')}>
                        <div className="font-bold">Средне</div>
                        <div>{routeAnalytics.efficiencyDistribution.average}</div>
                      </div>
                      <div className={clsx('p-2 rounded', isDark ? 'bg-red-900/30' : 'bg-red-50')}>
                        <div className="font-bold">Низкая</div>
                        <div>{routeAnalytics.efficiencyDistribution.poor}</div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Временные метрики */}
                <div className={clsx('p-6 rounded-xl border-2', isDark ? 'border-orange-600/30 bg-orange-900/20' : 'border-orange-200 bg-orange-50')}>
                  <h3 className={clsx('text-lg font-bold mb-4', isDark ? 'text-orange-300' : 'text-orange-700')}>Соблюдение дедлайнов</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className={clsx('p-3 rounded-lg', isDark ? 'bg-green-900/30' : 'bg-green-50')}>
                      <div className="text-xs opacity-70">Вовремя</div>
                      <div className="text-xl font-bold">{routeAnalytics.timeWindowCompliance.onTime}</div>
                    </div>
                    <div className={clsx('p-3 rounded-lg', isDark ? 'bg-red-900/30' : 'bg-red-50')}>
                      <div className="text-xs opacity-70">Просрочено</div>
                      <div className="text-xl font-bold">{routeAnalytics.timeWindowCompliance.late}</div>
                    </div>
                    <div className={clsx('p-3 rounded-lg', isDark ? 'bg-yellow-900/30' : 'bg-yellow-50')}>
                      <div className="text-xs opacity-70">Раньше срока</div>
                      <div className="text-xl font-bold">{routeAnalytics.timeWindowCompliance.early}</div>
                    </div>
                    <div className={clsx('p-3 rounded-lg', isDark ? 'bg-gray-700/30' : 'bg-gray-50')}>
                      <div className="text-xs opacity-70">Без дедлайна</div>
                      <div className="text-xl font-bold">{routeAnalytics.timeWindowCompliance.noDeadline}</div>
                    </div>
                  </div>
                </div>
                
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Модальное окно истории */}
      {showHistoryModal && (
        <div 
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowHistoryModal(false)}
        >
          <div 
            className={clsx(
              'relative w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col mx-4',
              isDark ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border-2 border-gray-700' : 'bg-gradient-to-br from-white via-gray-50 to-white border-2 border-gray-200'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={clsx('px-8 py-6 border-b flex items-center justify-between', isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50/50')}>
              <h2 className={clsx('text-2xl font-bold flex items-center gap-3', isDark ? 'text-white' : 'text-gray-900')}>
                <ClockIcon className="w-8 h-8" />
                <span>История оптимизаций</span>
              </h2>
              <button
                onClick={() => setShowHistoryModal(false)}
                className={clsx('p-3 rounded-xl hover:opacity-70 transition-all', isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700')}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-8">
              {routeHistoryEntries.length === 0 ? (
                <div className={clsx('text-center py-12', isDark ? 'text-gray-400' : 'text-gray-500')}>
                  <p className="text-lg mb-2">История пуста</p>
                  <p className="text-sm">История оптимизаций будет сохраняться автоматически</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {routeHistoryEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className={clsx(
                        'p-6 rounded-xl border-2 transition-all hover:scale-[1.02] cursor-pointer',
                        isDark ? 'border-gray-700 bg-gray-800/50 hover:border-gray-600' : 'border-gray-200 bg-white hover:border-gray-300'
                      )}
                      onClick={() => {
                        setPlannedRoutes(entry.routes)
                        setShowHistoryModal(false)
                      }}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className={clsx('font-bold text-lg mb-1', isDark ? 'text-white' : 'text-gray-900')}>
                            {entry.name || `Оптимизация от ${new Date(entry.timestamp).toLocaleString('ru-RU')}`}
                          </div>
                          {entry.description && (
                            <div className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>
                              {entry.description}
                            </div>
                          )}
                        </div>
                        <div className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>
                          {new Date(entry.timestamp).toLocaleString('ru-RU')}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div className={clsx('p-3 rounded-lg', isDark ? 'bg-blue-900/30' : 'bg-blue-50')}>
                          <div className="text-xs opacity-70 mb-1">Маршрутов</div>
                          <div className="text-lg font-bold">{entry.stats.totalRoutes}</div>
                        </div>
                        <div className={clsx('p-3 rounded-lg', isDark ? 'bg-green-900/30' : 'bg-green-50')}>
                          <div className="text-xs opacity-70 mb-1">Заказов</div>
                          <div className="text-lg font-bold">{entry.stats.totalOrders}</div>
                        </div>
                        <div className={clsx('p-3 rounded-lg', isDark ? 'bg-orange-900/30' : 'bg-orange-50')}>
                          <div className="text-xs opacity-70 mb-1">Расстояние</div>
                          <div className="text-lg font-bold">{entry.stats.totalDistance.toFixed(1)}</div>
                          <div className="text-xs opacity-70">км</div>
                        </div>
                        <div className={clsx('p-3 rounded-lg', isDark ? 'bg-purple-900/30' : 'bg-purple-50')}>
                          <div className="text-xs opacity-70 mb-1">Время</div>
                          <div className="text-lg font-bold">{entry.stats.totalDuration.toFixed(0)}</div>
                          <div className="text-xs opacity-70">мин</div>
                        </div>
                        <div className={clsx('p-3 rounded-lg', isDark ? 'bg-indigo-900/30' : 'bg-indigo-50')}>
                          <div className="text-xs opacity-70 mb-1">Эффективность</div>
                          <div className="text-lg font-bold">{((entry.stats.avgEfficiency || 0) * 100).toFixed(0)}%</div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          routeHistory.delete(entry.id)
                          setRouteHistoryEntries(routeHistory.getAll())
                        }}
                        className={clsx(
                          'mt-3 px-3 py-1 text-xs rounded-lg transition-colors',
                          isDark ? 'bg-red-900/50 hover:bg-red-900/70 text-red-200' : 'bg-red-100 hover:bg-red-200 text-red-700'
                        )}
                      >
                        Удалить
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Модальное окно полноэкранного просмотра маршрута */}
      {expandedRouteModal && (
        <div 
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => {
            // Закрываем меню экспорта при клике на фон
            if (showExportMenu) {
              setShowExportMenu(null)
            } else {
              setExpandedRouteModal(null)
            }
          }}
        >
          <div 
            className={clsx(
              'relative w-full h-full max-w-[95vw] max-h-[95vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col',
              isDark ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border-2 border-gray-700' : 'bg-gradient-to-br from-white via-gray-50 to-white border-2 border-gray-200'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Заголовок */}
            <div className={clsx(
              'px-8 py-6 border-b flex items-center justify-between',
              isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50/50'
            )}>
              <div className="flex items-center gap-4">
                <div className={clsx(
                  'p-3 rounded-2xl shadow-lg',
                  isDark ? 'bg-gradient-to-br from-blue-600 to-indigo-600' : 'bg-gradient-to-br from-blue-500 to-indigo-500'
                )}>
                  <TruckIcon className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h2 className={clsx('text-2xl font-bold', isDark ? 'text-white' : 'text-gray-900')}>
                    {expandedRouteModal.name}
                  </h2>
                  {expandedRouteModal.hasCriticalTraffic && (
                    <div className={clsx(
                      'inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium mt-2',
                      isDark ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-700'
                    )}>
                      <span>⚠️</span>
                      <span>Критические пробки</span>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => setExpandedRouteModal(null)}
                className={clsx(
                  'p-3 rounded-xl hover:opacity-70 transition-all',
                  isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                )}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Содержимое - скроллируемое */}
            <div 
              className="flex-1 overflow-y-auto p-8"
              onClick={(e) => {
                // Закрываем меню экспорта при клике вне его
                if (showExportMenu && !(e.target as HTMLElement).closest('.relative')) {
                  setShowExportMenu(null)
                }
              }}
            >
              {/* Используем тот же контент, что и в развернутой карточке, но с улучшенным дизайном */}
              <div className="space-y-6 max-w-7xl mx-auto">
                {/* Статистика маршрута */}
                <div className={clsx(
                  'p-6 rounded-2xl border-2 grid grid-cols-2 md:grid-cols-4 gap-6',
                  isDark 
                    ? 'bg-gradient-to-br from-gray-900/80 to-gray-800/80 border-gray-700' 
                    : 'bg-gradient-to-br from-gray-50 to-white border-gray-200'
                )}>
                  <div className={clsx(
                    'p-4 rounded-xl border-2',
                    isDark ? 'border-blue-600/30 bg-blue-900/20' : 'border-blue-200 bg-blue-50/50'
                  )}>
                    <div className="flex items-center gap-2 mb-2">
                      <MapPinIcon className={clsx('w-5 h-5', isDark ? 'text-blue-400' : 'text-blue-600')} />
                      <div className={clsx('text-xs font-semibold uppercase tracking-wide', isDark ? 'text-gray-400' : 'text-gray-600')}>
                        Заказов
                      </div>
                    </div>
                    <div className={clsx('text-3xl font-bold', isDark ? 'text-blue-400' : 'text-blue-600')}>
                      {expandedRouteModal.stopsCount || expandedRouteModal.routeChainFull?.length || 0}
                    </div>
                  </div>
                  <div className={clsx(
                    'p-4 rounded-xl border-2',
                    isDark ? 'border-green-600/30 bg-green-900/20' : 'border-green-200 bg-green-50/50'
                  )}>
                    <div className="flex items-center gap-2 mb-2">
                      <MapPinIcon className={clsx('w-5 h-5', isDark ? 'text-green-400' : 'text-green-600')} />
                      <div className={clsx('text-xs font-semibold uppercase tracking-wide', isDark ? 'text-gray-400' : 'text-gray-600')}>
                        Расстояние
                      </div>
                    </div>
                    <div className={clsx('text-3xl font-bold', isDark ? 'text-green-400' : 'text-green-600')}>
                      {expandedRouteModal.totalDistanceKm || ((expandedRouteModal.totalDistance || 0) / 1000).toFixed(1)}
                    </div>
                    <div className={clsx('text-xs mt-1', isDark ? 'text-gray-500' : 'text-gray-500')}>км</div>
                  </div>
                  <div className={clsx(
                    'p-4 rounded-xl border-2',
                    isDark ? 'border-orange-600/30 bg-orange-900/20' : 'border-orange-200 bg-orange-50/50'
                  )}>
                    <div className="flex items-center gap-2 mb-2">
                      <ClockIcon className={clsx('w-5 h-5', isDark ? 'text-orange-400' : 'text-orange-600')} />
                      <div className={clsx('text-xs font-semibold uppercase tracking-wide', isDark ? 'text-gray-400' : 'text-gray-600')}>
                        Время
                      </div>
                    </div>
                    <div className={clsx('text-3xl font-bold', isDark ? 'text-orange-400' : 'text-orange-600')}>
                      {expandedRouteModal.totalDurationMin || ((expandedRouteModal.totalDuration || 0) / 60).toFixed(1)}
                    </div>
                    <div className={clsx('text-xs mt-1', isDark ? 'text-gray-500' : 'text-gray-500')}>мин</div>
                    {expandedRouteModal.totalTrafficDelay && expandedRouteModal.totalTrafficDelay > 0 && (
                      <div className={clsx(
                        'text-xs mt-2 px-2 py-1 rounded-lg font-medium',
                        expandedRouteModal.hasCriticalTraffic 
                          ? (isDark ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-700')
                          : (isDark ? 'bg-orange-900/50 text-orange-300' : 'bg-orange-100 text-orange-700')
                      )}>
                        +{expandedRouteModal.totalTrafficDelay.toFixed(1)} мин пробки
                      </div>
                    )}
                  </div>
                  <div className={clsx(
                    'p-4 rounded-xl border-2',
                    isDark ? 'border-purple-600/30 bg-purple-900/20' : 'border-purple-200 bg-purple-50/50'
                  )}>
                    <div className="flex items-center gap-2 mb-2">
                      <ChartBarIcon className={clsx('w-5 h-5', isDark ? 'text-purple-400' : 'text-purple-600')} />
                      <div className={clsx('text-xs font-semibold uppercase tracking-wide', isDark ? 'text-gray-400' : 'text-gray-600')}>
                        Эффективность
                      </div>
                    </div>
                    <div className={clsx('text-3xl font-bold', isDark ? 'text-purple-400' : 'text-purple-600')}>
                      {(() => {
                        const efficiency = expandedRouteModal.routeEfficiency || (expandedRouteModal.totalDistance && expandedRouteModal.totalDuration 
                          ? Math.min(1, (expandedRouteModal.stopsCount || 1) * 5 / ((expandedRouteModal.totalDistance / 1000) / (expandedRouteModal.totalDuration / 60 / 60)))
                          : 0.5)
                        return `${(efficiency * 100).toFixed(0)}%`
                      })()}
                    </div>
                  </div>
                </div>
                
                {/* Детальная информация о маршруте */}
                <div className={clsx('mt-6 space-y-6', isDark ? 'text-gray-200' : 'text-gray-800')}>
                  {/* Логика формирования маршрута */}
                  <div>
                      <div className={clsx('text-lg font-semibold mb-4 flex items-center gap-2', isDark ? 'text-gray-200' : 'text-gray-800')}>
                        <span>📋</span>
                        <span>Логика формирования маршрута</span>
                      </div>
                      
                      {/* Информация о пробках */}
                      {expandedRouteModal.trafficInfo && expandedRouteModal.trafficInfo.length > 0 && (
                        <div className={clsx('mb-4 p-4 rounded-xl', isDark ? 'bg-orange-900/20 border-orange-700 border-2' : 'bg-orange-50 border-orange-300 border-2', expandedRouteModal.hasCriticalTraffic ? 'border-l-4' : 'border-l-2')}>
                          <div className={clsx('text-sm font-semibold mb-2 flex items-center gap-2', isDark ? 'text-orange-300' : 'text-orange-700')}>
                            <span>🚦</span>
                            <span>Информация о пробках</span>
                            {expandedRouteModal.hasCriticalTraffic && (
                              <span className={clsx('text-xs px-2 py-1 rounded', isDark ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-700')}>
                                ⚠️ Критические пробки
                              </span>
                            )}
                          </div>
                          <div className={clsx('text-sm space-y-1', isDark ? 'text-gray-300' : 'text-gray-700')}>
                            <div>
                              <span className="font-medium">Общая задержка из-за пробок: </span>
                              <span className={expandedRouteModal.totalTrafficDelay && expandedRouteModal.totalTrafficDelay > 5 ? 'text-red-600 font-bold' : ''}>
                                {expandedRouteModal.totalTrafficDelay?.toFixed(1) || '0'} минут
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Зоны доставки */}
                      {expandedRouteModal.routeChainFull && (() => {
                        const zones = new Set<string>()
                        expandedRouteModal.routeChainFull.forEach((o: any) => {
                          const zone = o.deliveryZone || o.raw?.deliveryZone || o.raw?.['Зона доставки'] || 'Не указана'
                          if (zone && zone !== 'Не указана') zones.add(zone)
                        })
                        if (zones.size > 0) {
                          return (
                            <div className={clsx('mb-4 p-4 rounded-xl', isDark ? 'bg-gray-900/30 border-2 border-gray-700' : 'bg-gray-50 border-2 border-gray-200')}>
                              <div className={clsx('text-sm font-medium mb-2', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                Зоны доставки
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {Array.from(zones).map((zone, idx) => (
                                  <span
                                    key={idx}
                                    className={clsx(
                                      'px-3 py-1 rounded-lg text-sm font-medium',
                                      isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'
                                    )}
                                  >
                                    {zone}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )
                        }
                        return null
                      })()}

                      {/* Полезные действия */}
                      <div className={clsx('flex flex-wrap gap-3 mb-6', isDark ? 'bg-gray-800/50 p-4 rounded-xl' : 'bg-gray-100 p-4 rounded-xl')}>
                        <button
                          onClick={() => {
                            const routeText = `Маршрут: ${expandedRouteModal.name}\n` +
                              `Заказов: ${expandedRouteModal.stopsCount || 0}\n` +
                              `Расстояние: ${expandedRouteModal.totalDistanceKm || '?'} км\n` +
                              `Время: ${expandedRouteModal.totalDurationMin || '?'} мин\n` +
                              `Заказы: ${(expandedRouteModal.routeChainFull || []).map((o: any) => 
                                o.orderNumber || o.raw?.orderNumber || '?'
                              ).join(', ')}`
                            navigator.clipboard.writeText(routeText)
                            alert('Информация о маршруте скопирована в буфер обмена!')
                          }}
                          className={clsx(
                            'px-4 py-2 rounded-lg font-medium transition-all hover:scale-105',
                            isDark ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'
                          )}
                        >
                          📋 Копировать информацию
                        </button>
                        
                        {/* Меню экспорта */}
                        <div className="relative" onClick={(e) => e.stopPropagation()} data-tour="export">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setShowExportMenu(showExportMenu === expandedRouteModal.id ? null : expandedRouteModal.id)
                            }}
                            className={clsx(
                              'px-4 py-2 rounded-lg font-medium transition-all hover:scale-105 flex items-center gap-2',
                              isDark ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-green-500 hover:bg-green-600 text-white'
                            )}
                          >
                            📤 Экспорт
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          
                          {showExportMenu === expandedRouteModal.id && (
                            <div 
                              className={clsx(
                                'absolute top-full left-0 mt-2 rounded-lg shadow-xl border-2 z-[100] min-w-[200px]',
                                isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                              )}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  try {
                                    const url = exportToGoogleMaps({
                                      route: expandedRouteModal,
                                      orders: expandedRouteModal.routeChainFull || [],
                                      startAddress: expandedRouteModal.startAddress,
                                      endAddress: expandedRouteModal.endAddress
                                    })
                                    if (url) {
                                      window.open(url, '_blank')
                                    }
                                  } catch (error) {
                                    console.error('Ошибка экспорта в Google Maps:', error)
                                    alert('Ошибка при экспорте в Google Maps')
                                  }
                                  setShowExportMenu(null)
                                }}
                                className={clsx(
                                  'w-full px-4 py-3 text-left hover:bg-gray-100 flex items-center gap-2 transition-colors rounded-t-lg',
                                  isDark ? 'hover:bg-gray-700 text-gray-200' : 'text-gray-700'
                                )}
                              >
                                🗺️ Google Maps
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  try {
                                    const url = exportToWaze({
                                      route: expandedRouteModal,
                                      orders: expandedRouteModal.routeChainFull || [],
                                      startAddress: expandedRouteModal.startAddress,
                                      endAddress: expandedRouteModal.endAddress
                                    })
                                    if (url) {
                                      window.open(url, '_blank')
                                    }
                                  } catch (error) {
                                    console.error('Ошибка экспорта в Waze:', error)
                                    alert('Ошибка при экспорте в Waze')
                                  }
                                  setShowExportMenu(null)
                                }}
                                className={clsx(
                                  'w-full px-4 py-3 text-left hover:bg-gray-100 flex items-center gap-2 transition-colors',
                                  isDark ? 'hover:bg-gray-700 text-gray-200' : 'text-gray-700'
                                )}
                              >
                                🧭 Waze
                              </button>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  try {
                                    await exportToPDF({
                                      route: expandedRouteModal,
                                      orders: expandedRouteModal.routeChainFull || [],
                                      startAddress: expandedRouteModal.startAddress,
                                      endAddress: expandedRouteModal.endAddress
                                    })
                                  } catch (error) {
                                    console.error('Ошибка экспорта в PDF:', error)
                                    alert('Ошибка при экспорте в PDF')
                                  }
                                  setShowExportMenu(null)
                                }}
                                className={clsx(
                                  'w-full px-4 py-3 text-left hover:bg-gray-100 flex items-center gap-2 transition-colors rounded-b-lg',
                                  isDark ? 'hover:bg-gray-700 text-gray-200' : 'text-gray-700'
                                )}
                              >
                                📑 PDF
                              </button>
                            </div>
                          )}
                        </div>
                        {(expandedRouteModal.routeChainFull || []).length > 0 && (
                          <div className={clsx('px-4 py-2 rounded-lg', isDark ? 'bg-gray-700 text-gray-200' : 'bg-white text-gray-700')}>
                            <span className="font-medium">Порядок доставки: </span>
                            <span className="text-sm">
                              {(expandedRouteModal.routeChainFull || []).map((o: any, idx: number) => (
                                <span key={idx}>
                                  <span className="font-bold">{idx + 1}.</span> {o.orderNumber || o.raw?.orderNumber || `#${idx + 1}`}
                                  {idx < (expandedRouteModal.routeChainFull || []).length - 1 && ' → '}
                                </span>
                              ))}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Визуализация маршрута на карте */}
                      <div className="mt-6">
                        <div className={clsx('text-lg font-semibold mb-4 flex items-center gap-2', isDark ? 'text-gray-200' : 'text-gray-800')}>
                          <span>🗺️</span>
                          <span>Визуализация маршрута</span>
                        </div>
                        <RouteMap route={expandedRouteModal} />
                      </div>

                      {/* Детальная логика формирования - показываем reasons если есть */}
                      {expandedRouteModal.reasons && expandedRouteModal.reasons.length > 0 && (
                        <div className="mt-6">
                          <Suspense fallback={<div className={clsx('text-sm text-center py-8', isDark ? 'text-gray-400' : 'text-gray-600')}>Загрузка деталей маршрута...</div>}>
                            <RouteDetailsTabs reasons={expandedRouteModal.reasons} />
                          </Suspense>
                        </div>
                      )}
                    </div>
                  </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Система помощи */}
      {showHelpModal && (
        <Suspense fallback={null}>
          <HelpModal
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
              localStorage.setItem('km_has_seen_help', 'true')
              setHasSeenHelp(true)
            }}
            steps={[
          {
            id: 'upload',
            title: '📤 Загрузка Excel файла',
            content: `📋 Начните с загрузки файла Excel с данными о заказах.

✅ Обязательные колонки:
• Адрес доставки
• Плановое время доставки
• Время готовности на кухне
• Номер заказа
• Зона доставки`,
            target: '[data-tour="upload"]',
            position: 'bottom'
          },
          {
            id: 'settings',
            title: '⚙️ Настройки планирования',
            content: `🎯 Настройте параметры для оптимального планирования маршрутов:

📏 Основные параметры:
• Максимальное количество остановок (рекомендуется 3-5)
• Максимальное расстояние между заказами (км)
• Максимальная разница времени готовности (минуты)

🚦 Режим трафика:
🟢 Свободно - стандартные лимиты
🟡 Плотно - сокращенные маршруты
🔴 Стоим - минимальные маршруты
🤖 Авто - автоматический выбор по данным трафика

💡 Совет: Начните с режима "Авто" для оптимальных результатов`,
            target: '[data-tour="settings"]',
            position: 'bottom'
          },
          {
            id: 'plan',
            title: '🚀 Планирование маршрутов',
            content: `✨ После настройки параметров нажмите кнопку "Планировать маршруты"

🔄 Что происходит при планировании:
1️⃣ Система анализирует все заказы
2️⃣ Группирует заказы по зонам и времени
3️⃣ Создает оптимальные маршруты с учетом:
   • Географического расположения
   • Времени готовности заказов
   • Текущего трафика
   • Ограничений по расстоянию

⏱️ Процесс занимает несколько секунд - дождитесь завершения`,
            target: '[data-tour="plan"]',
            position: 'top'
          },
          {
            id: 'routes',
            title: '🗺️ Просмотр маршрутов',
            content: `📋 После планирования вы увидите список созданных маршрутов

🖱️ Действия с маршрутом:
• Кликните на маршрут → увидите его на карте
• Разверните → полноэкранный просмотр
• Экспортируйте → Google Maps, Waze или PDF

💡 Совет: Проверьте маршрут на карте перед отправкой курьеру`,
            target: '[data-tour="routes"]',
            position: 'top'
          },
          {
            id: 'analytics',
            title: '📊 Аналитика маршрутов',
            content: `📈 Используйте кнопку "Аналитика" для детальной статистики

📊 Что вы увидите:
• Общее количество маршрутов и заказов
• Общее расстояние и время
• Распределение эффективности
• Соответствие временным окнам

💡 Аналитика помогает:
✅ Оценить качество планирования
✅ Найти возможности для оптимизации
✅ Сравнить разные версии маршрутов`,
            target: '[data-tour="analytics"]',
            position: 'left'
          },
          {
            id: 'export',
            title: '📤 Экспорт маршрутов',
            content: `🚀 Экспортируйте маршруты для использования в навигации

📍 Google Maps
   → Открывает маршрут в браузере
   → Можно отправить ссылку курьеру

🗺️ Waze
   → Открывает в приложении Waze
   → Удобно для мобильных устройств

📄 PDF
   → Скачивает документ с маршрутом
   → Содержит адреса и порядок доставки

💡 Совет: Используйте Google Maps для просмотра, Waze для навигации`,
            target: '[data-tour="export"]',
            position: 'left'
          }
        ] as TourStep[]}
          />
        </Suspense>
      )}
    </div>
  )
}

export default AutoPlanner


