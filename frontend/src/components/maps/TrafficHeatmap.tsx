import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { useTheme } from '../../contexts/ThemeContext'
import { loadMapboxGL } from '../../utils/maps/mapboxLoader'
import { localStorageUtils } from '../../utils/ui/localStorage'
import {
  getMapboxTrafficForSegment,
  MapboxTrafficData,
  calculateTrafficDelay,
  getTrafficSeverity
} from '../../utils/maps/mapboxTrafficAPI'
import { getUkraineTrafficForRoute } from '../../utils/maps/ukraineTrafficAPI'

interface TrafficHeatmapProps {
  sectorPath?: Array<{ lat: number; lng: number }>
  sectorName?: string
  mapboxToken?: string
}

type LatLng = { lat: number; lng: number }

type DisplayMode = 'lines' | 'heatmap' | 'combined' | 'critical-only'

interface TrafficPoint {
  coordinates: [number, number]
  delayMinutes: number
  severity: 'low' | 'medium' | 'high' | 'critical'
  speed: number
  timestamp: number
  confidence: number
}

interface TrafficSegmentWithHistory extends MapboxTrafficData {
  timestamp: number
  history?: Array<{ timestamp: number; congestion: number; speed: number }>
  key?: string
}

interface TrafficCacheEntry {
  data: MapboxTrafficData[]
  timestamp: number
  key: string
}

interface TrafficHistoryEntry {
  timestamp: number
  avgSpeed: number
  totalDelay: number
  criticalCount: number
}

interface TrafficAlertEntry {
  timestamp: number
  message: string
}

type MapboxFeatureFlags = {
  denseSampling: boolean
  enableAlerts: boolean
  enableHeatmapControl: boolean
}

const DEFAULT_FEATURE_FLAGS: MapboxFeatureFlags = {
  denseSampling: true,
  enableAlerts: true,
  enableHeatmapControl: true
}

const SOURCE_ID = 'km-traffic-source'
const HEATMAP_LAYER_ID = 'km-traffic-heatmap'
const POINT_LAYER_ID = 'km-traffic-points'
const SEGMENT_SOURCE_ID = 'km-traffic-segments'
const SEGMENT_LAYER_ID = 'km-traffic-segments-line'
const SECTOR_SOURCE_ID = 'km-traffic-sector'
const SECTOR_FILL_LAYER_ID = 'km-traffic-sector-fill'
const SECTOR_LINE_LAYER_ID = 'km-traffic-sector-line'
const LIGHT_STYLE = 'mapbox://styles/mapbox/light-v11'
const DARK_STYLE = 'mapbox://styles/mapbox/dark-v11'
const GRID_BASE_DENSITY = 40
const MAX_SEGMENTS = 600
const MAX_NEW_REQUESTS_PER_FETCH = 100
const CACHE_TTL = 5 * 60 * 1000 // 5 минут
const BATCH_SIZE = 5 // Размер батча для параллельных запросов
const BATCH_DELAY = 100 // Задержка между батчами (мс)
const FEATURE_FLAGS_STORAGE_KEY = 'km_mapbox_flags'
const SEGMENTS_PER_PAIR_LIMIT = 4

// Кэш для данных о трафике
const trafficCache = new Map<string, TrafficCacheEntry>()

// Мониторинг производительности и метрики API
interface PerformanceMetrics {
  apiCalls: number
  cacheHits: number
  cacheMisses: number
  totalLoadTime: number
  averageResponseTime: number
  errors: number
  lastUpdate: number
}

const performanceMetrics: PerformanceMetrics = {
  apiCalls: 0,
  cacheHits: 0,
  cacheMisses: 0,
  totalLoadTime: 0,
  averageResponseTime: 0,
  errors: 0,
  lastUpdate: Date.now()
}

const updateMetrics = (cacheHit: boolean, responseTime: number, error?: boolean) => {
  performanceMetrics.apiCalls++
  if (cacheHit) {
    performanceMetrics.cacheHits++
  } else {
    performanceMetrics.cacheMisses++
  }
  performanceMetrics.totalLoadTime += responseTime
  performanceMetrics.averageResponseTime = performanceMetrics.totalLoadTime / performanceMetrics.apiCalls
  if (error) {
    performanceMetrics.errors++
  }
  performanceMetrics.lastUpdate = Date.now()
  
  // Логирование метрик каждые 50 запросов
  if (performanceMetrics.apiCalls % 50 === 0) {
    console.log('📊 Traffic API Metrics:', {
      calls: performanceMetrics.apiCalls,
      cacheHitRate: `${((performanceMetrics.cacheHits / performanceMetrics.apiCalls) * 100).toFixed(1)}%`,
      avgResponseTime: `${performanceMetrics.averageResponseTime.toFixed(0)}ms`,
      errors: performanceMetrics.errors,
      errorRate: `${((performanceMetrics.errors / performanceMetrics.apiCalls) * 100).toFixed(1)}%`
    })
  }
}

const REFRESH_INTERVAL_MS = 30 * 60 * 1000
const getRefreshInterval = (): number => REFRESH_INTERVAL_MS

// Адаптивная плотность сетки на основе зума
const getAdaptiveDensity = (zoom: number, baseDensity: number): number => {
  if (zoom > 13) return Math.min(baseDensity * 1.8, 50)
  if (zoom > 11) return Math.min(baseDensity * 1.3, 45)
  if (zoom > 9) return baseDensity
  return Math.max(baseDensity * 0.8, 15)
}

const isPointInPolygon = (point: LatLng, polygon: LatLng[]): boolean => {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng
    const yi = polygon[i].lat
    const xj = polygon[j].lng
    const yj = polygon[j].lat

    const intersect =
      ((yi > point.lat) !== (yj > point.lat)) &&
      (point.lng <
        ((xj - xi) * (point.lat - yi)) / (yj - yi + Number.EPSILON) + xi)

    if (intersect) inside = !inside
  }
  return inside
}

const generateGridPoints = (polygon: LatLng[], zoom?: number): { points: LatLng[]; columns: number } => {
  if (!polygon || polygon.length < 3) return { points: [], columns: 0 }

  const lats = polygon.map(p => p.lat)
  const lngs = polygon.map(p => p.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)

  const latSpan = maxLat - minLat
  const lngSpan = maxLng - minLng
  
  const area = latSpan * lngSpan
  const baseSteps = zoom !== undefined ? getAdaptiveDensity(zoom, GRID_BASE_DENSITY) : GRID_BASE_DENSITY
  const areaMultiplier = Math.min(2.5, Math.max(1, area * 1000))
  const steps = Math.max(baseSteps, Math.round(baseSteps * areaMultiplier))
  
  const maxSteps = 50
  const finalSteps = Math.min(steps, maxSteps)

  const latStep = latSpan / finalSteps
  const lngStep = lngSpan / finalSteps

  const points: LatLng[] = []
  for (let i = 0; i <= finalSteps; i++) {
    for (let j = 0; j <= finalSteps; j++) {
      const candidate = { lat: minLat + i * latStep, lng: minLng + j * lngStep }
      if (isPointInPolygon(candidate, polygon)) {
        points.push(candidate)
      }
    }
  }

  return { points, columns: finalSteps + 1 }
}

const buildGridPairs = (points: LatLng[], columns: number): Array<[LatLng, LatLng]> => {
  if (!points.length || columns <= 1) return []
  const pairs: Array<[LatLng, LatLng]> = []

  for (let idx = 0; idx < points.length; idx++) {
    const row = Math.floor(idx / columns)
    const col = idx % columns

    const rightIndex = row * columns + (col + 1)
    const downIndex = (row + 1) * columns + col
    const diagIndex = (row + 1) * columns + (col + 1)

    if (rightIndex < points.length) pairs.push([points[idx], points[rightIndex]])
    if (downIndex < points.length) pairs.push([points[idx], points[downIndex]])
    if (diagIndex < points.length && (col + 1) < columns) {
      pairs.push([points[idx], points[diagIndex]])
    }
  }

  return pairs
}

const getPolygonBounds = (polygon: LatLng[]) => {
  const lats = polygon.map(p => p.lat)
  const lngs = polygon.map(p => p.lng)
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs)
  }
}

const pickRandomPointInside = (polygon: LatLng[]): LatLng | null => {
  if (polygon.length < 3) return null
  const bounds = getPolygonBounds(polygon)
  const maxAttempts = 20
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = {
      lat: bounds.minLat + Math.random() * (bounds.maxLat - bounds.minLat),
      lng: bounds.minLng + Math.random() * (bounds.maxLng - bounds.minLng)
    }
    if (isPointInPolygon(candidate, polygon)) {
      return candidate
    }
  }
  return null
}

// Улучшенная генерация внутренних хорд с квазиравномерным распределением
const generateInteriorChords = (polygon: LatLng[], count: number): Array<[LatLng, LatLng]> => {
  const chords: Array<[LatLng, LatLng]> = []
  if (!polygon || polygon.length < 3 || count <= 0) return chords
  
  const bounds = getPolygonBounds(polygon)
  const latSpan = bounds.maxLat - bounds.minLat
  const lngSpan = bounds.maxLng - bounds.minLng
  
  // Используем квазиравномерную сетку для лучшего покрытия
  const gridSize = Math.ceil(Math.sqrt(count * 2))
  const latStep = latSpan / (gridSize + 1)
  const lngStep = lngSpan / (gridSize + 1)
  
  const validPoints: LatLng[] = []
  
  // Генерируем точки на квазиравномерной сетке
  for (let i = 1; i <= gridSize; i++) {
    for (let j = 1; j <= gridSize; j++) {
      const candidate = {
        lat: bounds.minLat + i * latStep + (Math.random() - 0.5) * latStep * 0.3,
        lng: bounds.minLng + j * lngStep + (Math.random() - 0.5) * lngStep * 0.3
      }
      if (isPointInPolygon(candidate, polygon)) {
        validPoints.push(candidate)
      }
    }
  }
  
  // Если квазиравномерная сетка дала мало точек, добавляем случайные
  while (validPoints.length < count && validPoints.length < count * 2) {
    const random = pickRandomPointInside(polygon)
    if (random) {
      validPoints.push(random)
    } else {
      break
    }
  }
  
  // Создаем пары между соседними точками для лучшего покрытия
  for (let i = 0; i < validPoints.length && chords.length < count; i++) {
    const start = validPoints[i]
    
    // Находим ближайшие точки для создания пар
    const distances: Array<{ point: LatLng; dist: number }> = []
    for (let j = i + 1; j < validPoints.length && distances.length < 5; j++) {
      const dist = Math.sqrt(
        Math.pow(start.lat - validPoints[j].lat, 2) +
        Math.pow(start.lng - validPoints[j].lng, 2)
      )
      if (dist > 0.005 && dist < 0.05) { // Оптимальная длина хорды
        distances.push({ point: validPoints[j], dist })
      }
    }
    
    distances.sort((a, b) => a.dist - b.dist)
    distances.slice(0, 2).forEach(d => {
      if (chords.length < count) {
        chords.push([start, d.point])
      }
    })
  }
  
  // Если не хватило пар, добавляем случайные
  while (chords.length < count) {
    const start = pickRandomPointInside(polygon)
    const end = pickRandomPointInside(polygon)
    if (start && end) {
      const dist = Math.sqrt(
        Math.pow(start.lat - end.lat, 2) +
        Math.pow(start.lng - end.lng, 2)
      )
      if (dist > 0.005 && dist < 0.08) {
        chords.push([start, end])
      }
    } else {
      break
    }
  }
  
  return chords.slice(0, count)
}

const sampleRouteSegments = (segments: MapboxTrafficData[], limit: number = SEGMENTS_PER_PAIR_LIMIT): MapboxTrafficData[] => {
  if (!segments || segments.length === 0) return []
  if (segments.length <= limit) return segments.slice()
  if (limit <= 1) return [segments[Math.floor(segments.length / 2)]]
  const sampled: MapboxTrafficData[] = []
  const step = (segments.length - 1) / (limit - 1)
  for (let i = 0; i < limit; i++) {
    const idx = Math.min(segments.length - 1, Math.round(i * step))
    sampled.push(segments[idx])
  }
  return sampled
}

const buildPairKeyFromLatLng = (start: LatLng, end: LatLng) =>
  `${start.lat.toFixed(6)},${start.lng.toFixed(6)}|${end.lat.toFixed(6)},${end.lng.toFixed(6)}`

const buildPairKeyFromCoords = (start: [number, number], end: [number, number]) =>
  `${start[1].toFixed(6)},${start[0].toFixed(6)}|${end[1].toFixed(6)},${end[0].toFixed(6)}`

type TrafficMood = 'free' | 'busy' | 'gridlock'

const getTrafficMood = (stats: { avgSpeed: number; criticalCount: number; highCount: number; slowSharePercent: number }): TrafficMood => {
  if (!stats) return 'free'
  if (stats.avgSpeed < 18 || stats.criticalCount >= 6 || stats.slowSharePercent >= 55) return 'gridlock'
  if (stats.avgSpeed < 28 || stats.highCount >= 6 || stats.slowSharePercent >= 35) return 'busy'
  return 'free'
}

// Кластеризация точек для больших секторов
const clusterPoints = (points: TrafficPoint[], maxClusters: number = 50): TrafficPoint[] => {
  if (points.length <= maxClusters) return points
  
  // Простая кластеризация по сетке
  const clusters = new Map<string, TrafficPoint[]>()
  const gridSize = 0.01 // ~1км
  
  points.forEach(point => {
    const clusterKey = `${Math.floor(point.coordinates[1] / gridSize)},${Math.floor(point.coordinates[0] / gridSize)}`
    if (!clusters.has(clusterKey)) {
      clusters.set(clusterKey, [])
    }
    clusters.get(clusterKey)!.push(point)
  })
  
  // Агрегируем кластеры
  const aggregated: TrafficPoint[] = []
  for (const clusterPoints of clusters.values()) {
    if (clusterPoints.length === 0) continue
    
    const avgLat = clusterPoints.reduce((sum, p) => sum + p.coordinates[1], 0) / clusterPoints.length
    const avgLng = clusterPoints.reduce((sum, p) => sum + p.coordinates[0], 0) / clusterPoints.length
    const severityOrder: Array<'low' | 'medium' | 'high' | 'critical'> = ['low', 'medium', 'high', 'critical']
    let maxSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low'
    for (const p of clusterPoints) {
      const maxIdx = severityOrder.indexOf(maxSeverity)
      const pIdx = severityOrder.indexOf(p.severity)
      if (pIdx > maxIdx) {
        maxSeverity = p.severity
      }
    }
    const avgDelay = clusterPoints.reduce((sum, p) => sum + p.delayMinutes, 0) / clusterPoints.length
    const avgSpeed = clusterPoints.reduce((sum, p) => sum + p.speed, 0) / clusterPoints.length
    const avgConfidence = clusterPoints.reduce((sum, p) => sum + p.confidence, 0) / clusterPoints.length
    
    aggregated.push({
      coordinates: [avgLng, avgLat],
      delayMinutes: avgDelay,
      severity: maxSeverity,
      speed: avgSpeed,
      timestamp: Math.max(...clusterPoints.map(p => p.timestamp)),
      confidence: avgConfidence
    })
  }
  
  return aggregated.slice(0, maxClusters)
}

export const TrafficHeatmap: React.FC<TrafficHeatmapProps> = ({ sectorPath, sectorName, mapboxToken }) => {
  const { isDark } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const mapboxglRef = useRef<any>(null)
  const popupRef = useRef<any>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSegmentsRef = useRef<TrafficSegmentWithHistory[]>([])
  const handlersAddedRef = useRef(false)
  const zoomLevelRef = useRef<number>(11)
  const animationFrameRef = useRef<number | null>(null)
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 })
  const [displayMode, setDisplayMode] = useState<DisplayMode>('combined')
  const [trafficStats, setTrafficStats] = useState<{
    avgSpeed: number
    medianSpeed: number
    rawAvgSpeed: number
    coverageKm: number
    reliabilityScore: number
    slowSharePercent: number
    pressureScore: number
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
  } | null>(null)
  const [filterSeverity, setFilterSeverity] = useState<('low' | 'medium' | 'high' | 'critical')[]>(['low', 'medium', 'high', 'critical'])
  const filterSeverityRef = useRef(filterSeverity)
  const trafficMood = useMemo<TrafficMood | null>(() => {
    if (!trafficStats) return null
    return getTrafficMood({
      avgSpeed: trafficStats.avgSpeed,
      criticalCount: trafficStats.criticalCount,
      highCount: trafficStats.highCount,
      slowSharePercent: trafficStats.slowSharePercent
    })
  }, [trafficStats])
  useEffect(() => {
    filterSeverityRef.current = filterSeverity
  }, [filterSeverity])
  const severityDistribution = useMemo(() => {
    if (!trafficStats || trafficStats.totalSegments === 0) return []
    const total = trafficStats.totalSegments || 1
    return [
      { label: 'Critical', value: trafficStats.criticalCount, color: 'bg-red-500' },
      { label: 'High', value: trafficStats.highCount, color: 'bg-orange-500' },
      { label: 'Medium', value: trafficStats.mediumCount, color: 'bg-yellow-500' },
      { label: 'Low', value: trafficStats.lowCount, color: 'bg-green-500' }
    ].map(entry => ({
      ...entry,
      percent: Math.round((entry.value / total) * 100)
    }))
  }, [trafficStats])
  const [heatmapBoost, setHeatmapBoost] = useState(1)
  const [trafficHistory, setTrafficHistory] = useState<TrafficHistoryEntry[]>([])
  const [alertHistory, setAlertHistory] = useState<TrafficAlertEntry[]>([])
  const [alertStatus, setAlertStatus] = useState<string | null>(null)
  const [featureFlags, setFeatureFlags] = useState<MapboxFeatureFlags>(DEFAULT_FEATURE_FLAGS)
  const [metricsSnapshot, setMetricsSnapshot] = useState(performanceMetrics)
  const pairCursorRef = useRef(0)

  const sectorStorageKey = useMemo(() => sectorName?.toLowerCase().replace(/\s+/g, '_') || 'default', [sectorName])
  const resolvedToken = useMemo(() => {
    const direct = (mapboxToken || '').trim()
    if (direct) return direct
    const stored = typeof window !== 'undefined' ? (localStorage.getItem('km_mapbox_token') || '').trim() : ''
    if (stored) return stored
    const settings = localStorageUtils.getAllSettings()
    const fromSettings = (settings.mapboxToken || '').trim()
    if (fromSettings) return fromSettings
    return ''
  }, [mapboxToken])
  const historyStorageKey = useMemo(() => `km_traffic_history_${sectorStorageKey}`, [sectorStorageKey])
  const snapshotStorageKey = useMemo(() => `km_traffic_snapshot_${sectorStorageKey}`, [sectorStorageKey])
  const alertsStorageKey = useMemo(() => `km_traffic_alerts_${sectorStorageKey}`, [sectorStorageKey])
  const segmentsStorageKey = useMemo(() => `km_traffic_segments_${sectorStorageKey}`, [sectorStorageKey])
  const trafficCacheStorageKey = useMemo(() => `km_traffic_cache_${sectorStorageKey}`, [sectorStorageKey])
  const segmentStoreRef = useRef<Map<string, TrafficSegmentWithHistory & { key?: string }>>(new Map())
  const lastPersistedTimestampRef = useRef<number>(0)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = localStorage.getItem(historyStorageKey)
      if (stored) {
        const parsed = JSON.parse(stored) as TrafficHistoryEntry[]
        setTrafficHistory(parsed)
      } else {
        setTrafficHistory([])
      }
    } catch (err) {
      console.warn('Не удалось загрузить историю трафика', err)
      setTrafficHistory([])
    }
  }, [historyStorageKey])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = localStorage.getItem(alertsStorageKey)
      if (stored) {
        const parsed = JSON.parse(stored) as TrafficAlertEntry[]
        setAlertHistory(parsed)
      } else {
        setAlertHistory([])
      }
    } catch (err) {
      console.warn('Не удалось загрузить историю алертов', err)
      setAlertHistory([])
    }
  }, [alertsStorageKey])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = localStorage.getItem(FEATURE_FLAGS_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<MapboxFeatureFlags>
        setFeatureFlags({ ...DEFAULT_FEATURE_FLAGS, ...parsed })
      }
    } catch (err) {
      console.warn('Не удалось загрузить флаги Mapbox', err)
    }
  }, [])

  const sectorGeoJSON = useMemo(() => {
    if (!sectorPath || sectorPath.length < 3) return null
    const ring = [...sectorPath, sectorPath[0]].map(point => [point.lng, point.lat])
    return {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: { name: sectorName || 'Сектор' }
    }
  }, [sectorPath, sectorName])

  const sectorCenter = useMemo(() => {
    if (!sectorPath || sectorPath.length === 0) return { lat: 50.4501, lng: 30.5234 }
    const lat = sectorPath.reduce((sum, p) => sum + p.lat, 0) / sectorPath.length
    const lng = sectorPath.reduce((sum, p) => sum + p.lng, 0) / sectorPath.length
    return { lat, lng }
  }, [sectorPath])

  const historyChartData = useMemo(() => {
    if (trafficHistory.length === 0) return null
    const width = 120
    const height = 40
    const maxSpeed = Math.max(...trafficHistory.map(entry => entry.avgSpeed), 1)
    const minSpeed = Math.min(...trafficHistory.map(entry => entry.avgSpeed), 0)
    const span = Math.max(maxSpeed - minSpeed, 1)
    const path = trafficHistory
      .map((entry, idx) => {
        if (trafficHistory.length === 1) {
          const y = height / 2
          return `M0,${y} L${width},${y}`
        }
        const x = (idx / (trafficHistory.length - 1)) * width
        const normalized = (entry.avgSpeed - minSpeed) / span
        const y = height - normalized * (height - 6) - 3
        return `${idx === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
      })
      .join(' ')
    return {
      path,
      width,
      height,
      minSpeed,
      maxSpeed
    }
  }, [trafficHistory])

  const gridData = useMemo(() => {
    if (!sectorPath || sectorPath.length < 3) return { points: [] as LatLng[], columns: 0 }
    return generateGridPoints(sectorPath, zoomLevelRef.current)
  }, [sectorPath])

  const pairsToCheck = useMemo(() => {
    if (!sectorPath || sectorPath.length < 3) return []
    
    const boundaryPairs: Array<[LatLng, LatLng]> = []
    for (let i = 0; i < sectorPath.length; i++) {
      const current = sectorPath[i]
      const next = sectorPath[(i + 1) % sectorPath.length]
      boundaryPairs.push([current, next])
    }

    const gridPairs = buildGridPairs(gridData.points, gridData.columns)
    
    const radialPairs: Array<[LatLng, LatLng]> = []
    for (let i = 0; i < sectorPath.length; i += 2) {
      radialPairs.push([sectorCenter, sectorPath[i]])
    }
    
    const gridPointsForRadial = gridData.points.filter((_, idx) => idx % 3 === 0)
    gridPointsForRadial.forEach(point => {
      radialPairs.push([sectorCenter, point])
    })
    
    const crossPairs: Array<[LatLng, LatLng]> = []
    const gridPoints = gridData.points
    for (let i = 0; i < gridPoints.length; i++) {
      const neighbors: Array<{ point: LatLng; dist: number }> = []
      for (let j = 0; j < gridPoints.length; j++) {
        if (i === j) continue
        const dist = Math.sqrt(
          Math.pow(gridPoints[i].lat - gridPoints[j].lat, 2) +
          Math.pow(gridPoints[i].lng - gridPoints[j].lng, 2)
        )
        if (dist < 0.03) {
          neighbors.push({ point: gridPoints[j], dist })
        }
      }
      neighbors.sort((a, b) => a.dist - b.dist)
      neighbors.slice(0, 4).forEach(n => {
        crossPairs.push([gridPoints[i], n.point])
      })
    }

    const interiorPairs: Array<[LatLng, LatLng]> = []
    if (gridPoints.length > 0) {
      // Генерируем больше внутренних пар для лучшего покрытия
      const targetCount = featureFlags.denseSampling 
        ? Math.floor(MAX_SEGMENTS * 0.3)
        : Math.floor(MAX_SEGMENTS * 0.2)
      
      // Используем несколько стратегий для создания пар
      // 1. Пары между соседними точками сетки (с пропуском)
      const hop = Math.max(1, Math.floor(gridPoints.length / Math.max(20, gridData.columns)))
      for (let i = 0; i < gridPoints.length && interiorPairs.length < targetCount * 0.4; i += hop) {
        for (let offset = 1; offset <= 3 && interiorPairs.length < targetCount * 0.4; offset++) {
          const targetIndex = (i + hop * offset) % gridPoints.length
          if (targetIndex !== i) {
            const dist = Math.sqrt(
              Math.pow(gridPoints[i].lat - gridPoints[targetIndex].lat, 2) +
              Math.pow(gridPoints[i].lng - gridPoints[targetIndex].lng, 2)
            )
            if (dist > 0.003 && dist < 0.06) {
              interiorPairs.push([gridPoints[i], gridPoints[targetIndex]])
            }
          }
        }
      }
      
      // 2. Пары между точками на разных "уровнях" сетки
      const midPoint = Math.floor(gridPoints.length / 2)
      for (let i = 0; i < midPoint && interiorPairs.length < targetCount * 0.6; i += 2) {
        const j = gridPoints.length - 1 - i
        if (j > i) {
          const dist = Math.sqrt(
            Math.pow(gridPoints[i].lat - gridPoints[j].lat, 2) +
            Math.pow(gridPoints[i].lng - gridPoints[j].lng, 2)
          )
          if (dist > 0.005 && dist < 0.08) {
            interiorPairs.push([gridPoints[i], gridPoints[j]])
          }
        }
      }
    }
    const randomInteriorPairs = featureFlags.denseSampling
      ? generateInteriorChords(sectorPath, Math.floor(MAX_SEGMENTS * 0.4))
      : generateInteriorChords(sectorPath, Math.floor(MAX_SEGMENTS * 0.3))

    // Приоритет внутренним парам для лучшего покрытия сектора
    const randomLimit = featureFlags.denseSampling ? Math.floor(MAX_SEGMENTS * 0.35) : Math.floor(MAX_SEGMENTS * 0.25)
    const interiorLimit = featureFlags.denseSampling ? Math.floor(MAX_SEGMENTS * 0.25) : Math.floor(MAX_SEGMENTS * 0.15)
    const gridLimit = Math.floor(MAX_SEGMENTS * 0.25)
    const crossLimit = featureFlags.denseSampling ? Math.floor(MAX_SEGMENTS * 0.1) : Math.floor(MAX_SEGMENTS * 0.05)
    const radialLimit = Math.floor(MAX_SEGMENTS * 0.05)
    const boundaryLimit = Math.min(boundaryPairs.length, Math.floor(MAX_SEGMENTS * 0.05))
    
    // Сначала внутренние пары (приоритет), потом сетка, потом граница
    const combined = [
      ...randomInteriorPairs.slice(0, randomLimit),
      ...interiorPairs.slice(0, interiorLimit),
      ...gridPairs.slice(0, gridLimit),
      ...crossPairs.slice(0, crossLimit),
      ...radialPairs.slice(0, radialLimit),
      ...boundaryPairs.slice(0, boundaryLimit)
    ]
    
    const uniquePairs = new Set<string>()
    const deduplicated: Array<[LatLng, LatLng]> = []
    for (const pair of combined) {
      const key1 = `${pair[0].lat.toFixed(6)},${pair[0].lng.toFixed(6)}|${pair[1].lat.toFixed(6)},${pair[1].lng.toFixed(6)}`
      const key2 = `${pair[1].lat.toFixed(6)},${pair[1].lng.toFixed(6)}|${pair[0].lat.toFixed(6)},${pair[0].lng.toFixed(6)}`
      if (!uniquePairs.has(key1) && !uniquePairs.has(key2)) {
        uniquePairs.add(key1)
        uniquePairs.add(key2)
        deduplicated.push(pair)
      }
    }
    
    return deduplicated.slice(0, MAX_SEGMENTS)
  }, [sectorPath, sectorCenter, gridData, featureFlags])

  // Загрузка кэша из localStorage при монтировании
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = localStorage.getItem(trafficCacheStorageKey)
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, { data: MapboxTrafficData[]; timestamp: number; key: string }>
        const now = Date.now()
        let loadedCount = 0
        for (const [k, v] of Object.entries(parsed)) {
          if (now - v.timestamp < CACHE_TTL) {
            trafficCache.set(k, v)
            loadedCount++
          }
        }
        if (loadedCount > 0) {
          console.log(`✅ Загружено ${loadedCount} записей кэша трафика из localStorage`)
        }
      }
    } catch (err) {
      console.warn('Не удалось загрузить кэш трафика из localStorage', err)
    }
  }, [trafficCacheStorageKey])

  // Проверка кэша (сначала в памяти, потом в localStorage)
  const getCachedData = useCallback((key: string): MapboxTrafficData[] | null => {
    // Проверяем кэш в памяти
    const cached = trafficCache.get(key)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data
    }
    if (cached) {
      trafficCache.delete(key)
    }
    
    // Проверяем localStorage
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(trafficCacheStorageKey)
        if (stored) {
          const parsed = JSON.parse(stored) as Record<string, { data: MapboxTrafficData[]; timestamp: number; key: string }>
            const entry = parsed[key]
            if (entry) {
              const now = Date.now()
              if (now - entry.timestamp < CACHE_TTL) {
                // Восстанавливаем в памяти
                trafficCache.set(key, entry)
                console.log(`💾 Cache HIT из localStorage для ключа: ${key.substring(0, 40)}...`)
                return entry.data
              } else {
                // Удаляем устаревшую запись
                delete parsed[key]
                localStorage.setItem(trafficCacheStorageKey, JSON.stringify(parsed))
              }
            }
        }
      } catch (err) {
        console.warn('Ошибка чтения кэша из localStorage', err)
      }
    }
    
    return null
  }, [trafficCacheStorageKey])

  // Сохранение в кэш (в память и localStorage)
  const setCachedData = useCallback((key: string, data: MapboxTrafficData[]) => {
    const entry = { data, timestamp: Date.now(), key }
    // Сохраняем в память
    trafficCache.set(key, entry)
    
    // Сохраняем в localStorage
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(trafficCacheStorageKey)
        const cache: Record<string, { data: MapboxTrafficData[]; timestamp: number; key: string }> = stored ? JSON.parse(stored) : {}
        cache[key] = entry
        
        // Очистка старых записей из localStorage
        const now = Date.now()
        const keysToDelete: string[] = []
        for (const [k, v] of Object.entries(cache)) {
          if (now - v.timestamp > CACHE_TTL * 2) {
            keysToDelete.push(k)
          }
        }
        keysToDelete.forEach(k => delete cache[k])
        
        // Ограничиваем размер кэша (максимум 500 записей)
        const entries = Object.entries(cache)
        if (entries.length > 500) {
          const sorted = entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
          const excess = entries.length - 500
          for (let i = 0; i < excess; i++) {
            delete cache[sorted[i][0]]
          }
        }
        
        localStorage.setItem(trafficCacheStorageKey, JSON.stringify(cache))
      } catch (err) {
        console.warn('Не удалось сохранить кэш в localStorage', err)
      }
    }
    
    // Очистка старых записей из памяти
    if (trafficCache.size > 500) {
      const now = Date.now()
      for (const [k, v] of trafficCache.entries()) {
        if (now - v.timestamp > CACHE_TTL * 2) {
          trafficCache.delete(k)
        }
      }
    }
  }, [trafficCacheStorageKey])

  const convertSegmentsToPoints = useCallback((segments: MapboxTrafficData[]): TrafficPoint[] => {
    const points: TrafficPoint[] = []
    const now = Date.now()
    segments.forEach(segment => {
      const severity = getTrafficSeverity(segment.congestion)
      const delayMinutes = segment.delay
        ? segment.delay / 60
        : calculateTrafficDelay(segment.congestion, segment.duration)

      segment.coordinates.forEach((coord, index) => {
        if (index % 2 !== 0) return
        points.push({
          coordinates: [coord[0], coord[1]],
          delayMinutes: Number(delayMinutes.toFixed(1)),
          severity,
          speed: Math.max(segment.speed, 1),
          timestamp: now,
          confidence: 0.8
        })
      })
    })
    return points
  }, [])

  const updateLayers = useCallback((map: any, points: TrafficPoint[], mode: DisplayMode) => {
    const features = points.map(point => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: point.coordinates },
      properties: {
        severity: point.severity,
        delay: point.delayMinutes,
        speed: point.speed,
        weight:
          point.severity === 'critical' ? 1 :
          point.severity === 'high' ? 0.85 :
          point.severity === 'medium' ? 0.6 : 0.35
      }
    }))

    const geojson = { type: 'FeatureCollection', features }

    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, { type: 'geojson', data: geojson })
      
      if (mode === 'heatmap' || mode === 'combined') {
        map.addLayer({
          id: HEATMAP_LAYER_ID,
          type: 'heatmap',
          source: SOURCE_ID,
          maxzoom: 15,
          paint: {
            'heatmap-weight': ['get', 'weight'],
            'heatmap-intensity': 1.1 * heatmapBoost,
            'heatmap-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              9, 20 * heatmapBoost,
              12, 32 * heatmapBoost,
              15, 42 * heatmapBoost
            ],
            'heatmap-opacity': 0.9,
            'heatmap-color': [
              'interpolate',
              ['linear'], ['heatmap-density'],
              0, 'rgba(0, 255, 0, 0)',
              0.2, 'rgba(255, 255, 0, 0.5)',
              0.4, 'rgba(255, 166, 0, 0.8)',
              0.7, 'rgba(255, 100, 0, 0.95)',
              1, 'rgba(255, 0, 0, 1)'
            ]
          }
        })
      }
      
      if (mode === 'lines' || mode === 'combined') {
        map.addLayer({
          id: POINT_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          minzoom: 10,
          paint: {
            'circle-radius': [
              'case',
              ['==', ['get', 'severity'], 'critical'], 8,
              ['==', ['get', 'severity'], 'high'], 6,
              ['==', ['get', 'severity'], 'medium'], 5,
              4
            ],
            'circle-color': [
              'match',
              ['get', 'severity'],
              'critical', '#FF0000',
              'high', '#FF8C00',
              'medium', '#FFB300',
              '#FFEA00'
            ],
            'circle-opacity': 0.85,
            'circle-stroke-color': '#FFFFFF',
            'circle-stroke-width': 1.5
          }
        })
      }
    } else {
      (map.getSource(SOURCE_ID) as any).setData(geojson)
    }
    
    // Обновляем видимость слоев
    if (map.getLayer(HEATMAP_LAYER_ID)) {
      map.setLayoutProperty(HEATMAP_LAYER_ID, 'visibility', 
        (mode === 'heatmap' || mode === 'combined') ? 'visible' : 'none')
    }
    if (map.getLayer(POINT_LAYER_ID)) {
      map.setLayoutProperty(POINT_LAYER_ID, 'visibility', 
        (mode === 'lines' || mode === 'combined') ? 'visible' : 'none')
    }
  }, [heatmapBoost])

  const updateSectorLayer = useCallback((map: any) => {
    if (!sectorGeoJSON) return
    if (!map.getSource(SECTOR_SOURCE_ID)) {
      map.addSource(SECTOR_SOURCE_ID, { type: 'geojson', data: sectorGeoJSON })
      map.addLayer({
        id: SECTOR_FILL_LAYER_ID,
        type: 'fill',
        source: SECTOR_SOURCE_ID,
        paint: {
          'fill-color': '#2563eb',
          'fill-opacity': 0.08
        }
      })
      map.addLayer({
        id: SECTOR_LINE_LAYER_ID,
        type: 'line',
        source: SECTOR_SOURCE_ID,
        paint: {
          'line-color': '#2563eb',
          'line-width': 2
        }
      })
    } else {
      (map.getSource(SECTOR_SOURCE_ID) as any).setData(sectorGeoJSON)
    }
  }, [sectorGeoJSON])

  const updateSegmentLayer = useCallback((map: any, segments: TrafficSegmentWithHistory[], mode: DisplayMode) => {
    if (!segments || segments.length === 0) return
    
    let filteredSegments = segments
    
    if (mode === 'critical-only') {
      filteredSegments = segments.filter(s => getTrafficSeverity(s.congestion) === 'critical')
    }
    
    const features = filteredSegments
      .filter(segment => segment.coordinates && segment.coordinates.length > 1)
      .map(segment => {
        const severity = getTrafficSeverity(segment.congestion)
        const delayMinutes = segment.delay ? segment.delay / 60 : calculateTrafficDelay(segment.congestion, segment.duration)
        return {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: segment.coordinates
          },
          properties: {
            severity,
            congestion: segment.congestion,
            speed: segment.speed,
            delayMinutes: Number(delayMinutes.toFixed(1)),
            distance: segment.distance,
            duration: segment.duration,
            timestamp: segment.timestamp || Date.now(),
            history: segment.history || []
          }
        }
      })

    const filteredFeatures = features.filter(f => filterSeverity.includes(f.properties.severity))
    const data = {
      type: 'FeatureCollection',
      features: filteredFeatures
    }

    if (!map.getSource(SEGMENT_SOURCE_ID)) {
      map.addSource(SEGMENT_SOURCE_ID, { type: 'geojson', data })
      map.addLayer({
        id: SEGMENT_LAYER_ID,
        type: 'line',
        source: SEGMENT_SOURCE_ID,
        paint: {
          'line-color': [
            'match',
            ['get', 'severity'],
            'critical', '#ff0000',
            'high', '#ff7b00',
            'medium', '#f5c518',
            '#4ade80'
          ],
          'line-width': [
            'interpolate',
            ['linear'],
            ['get', 'congestion'],
            0, 2,
            40, 4,
            80, 6,
            100, 8
          ],
          'line-opacity': [
            'match',
            ['get', 'severity'],
            'critical', 0.95,
            'high', 0.85,
            'medium', 0.75,
            0.65
          ]
        }
      })
      
      if (!handlersAddedRef.current && mapboxglRef.current) {
        map.on('click', SEGMENT_LAYER_ID, (e: any) => {
          if (!e.features || e.features.length === 0) return
          const props = e.features[0].properties || {}
          const coords = e.lngLat
          const safeNumber = (value: any): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)
          const congestion = safeNumber(props.congestion) ?? 0
          const speed = safeNumber(props.speed)
          const delayMinutes = safeNumber(props.delayMinutes)
          const distanceMeters = safeNumber(props.distance)
          const durationSeconds = safeNumber(props.duration)
          let history: Array<{ timestamp: number; congestion: number }> = []
          if (props.history) {
            if (typeof props.history === 'string') {
              try {
                history = JSON.parse(props.history)
              } catch {
                history = []
              }
            } else if (Array.isArray(props.history)) {
              history = props.history
            }
          }
          const timestamp = safeNumber(props.timestamp) ?? Date.now()
          
          if (popupRef.current) {
            popupRef.current.remove()
          }
          
          // Прогноз на основе истории
          let forecast = 'Стабильно'
          if (history.length >= 2) {
            const recent = history.slice(-3)
            const trend = recent[recent.length - 1].congestion - recent[0].congestion
            if (trend > 10) forecast = 'Ухудшение'
            else if (trend < -10) forecast = 'Улучшение'
          }
          
          const popup = new mapboxglRef.current.Popup({ closeOnClick: true, maxWidth: '300px' })
            .setLngLat(coords)
            .setHTML(`
              <div style="font-family: system-ui, -apple-system, sans-serif; min-width: 200px;">
                <div style="font-weight: 600; margin-bottom: 8px; font-size: 14px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px;">
                  ${props.severity === 'critical' ? '🔴 Критическая пробка' :
                    props.severity === 'high' ? '🟠 Высокая загрузка' :
                    props.severity === 'medium' ? '🟡 Средняя загрузка' : '🟢 Низкая загрузка'}
                </div>
                <div style="font-size: 12px; line-height: 1.8; color: #333;">
                  <div><strong>Загрузка:</strong> ${congestion.toFixed(0)}%</div>
                  <div><strong>Скорость:</strong> ${speed !== null ? `${speed} км/ч` : '—'}</div>
                  <div><strong>Задержка:</strong> ${delayMinutes !== null ? `${delayMinutes.toFixed(1)} мин` : '—'}</div>
                  <div><strong>Расстояние:</strong> ${distanceMeters !== null ? `${(distanceMeters / 1000).toFixed(2)} км` : '—'}</div>
                  <div><strong>Время:</strong> ${durationSeconds !== null ? `${(durationSeconds / 60).toFixed(1)} мин` : '—'}</div>
                  ${history.length > 0 ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;"><strong>Прогноз:</strong> ${forecast}</div>` : ''}
                  <div style="margin-top: 4px; font-size: 10px; color: #6b7280;">
                    Обновлено: ${new Date(timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            `)
            .addTo(map)
          popupRef.current = popup
        })
        
        map.on('mouseenter', SEGMENT_LAYER_ID, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        
        map.on('mouseleave', SEGMENT_LAYER_ID, () => {
          map.getCanvas().style.cursor = ''
        })
        
        handlersAddedRef.current = true
      }
    } else {
      (map.getSource(SEGMENT_SOURCE_ID) as any).setData(data)
    }
    
    // Анимация пульсации для критических сегментов
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    
    const animateCritical = () => {
      if (!map.getLayer(SEGMENT_LAYER_ID)) return
      const time = Date.now() / 1000
      const pulse = (Math.sin(time * 2) + 1) / 2 * 0.2 + 0.8
      
      map.setPaintProperty(SEGMENT_LAYER_ID, 'line-opacity', [
        'case',
        ['==', ['get', 'severity'], 'critical'],
        pulse,
        ['match',
          ['get', 'severity'],
          'high', 0.85,
          'medium', 0.75,
          0.65
        ]
      ])
      
      animationFrameRef.current = requestAnimationFrame(animateCritical)
    }
    
    const criticalCount = filteredFeatures.filter(f => f.properties.severity === 'critical').length
    if (criticalCount > 0) {
      animateCritical()
    }
  }, [filterSeverity])

  // Батчинг запросов с прогрессом
  const appendHistoryEntry = useCallback((entry: TrafficHistoryEntry) => {
    setTrafficHistory(prev => {
      const next = [...prev, entry].slice(-24)
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(historyStorageKey, JSON.stringify(next))
        } catch (err) {
          console.warn('Не удалось сохранить историю трафика', err)
        }
      }
      return next
    })
  }, [historyStorageKey])

  const pushAlertEntry = useCallback((message: string) => {
    setAlertHistory(prev => {
      const entry = { timestamp: Date.now(), message }
      const next = [entry, ...prev].slice(0, 10)
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(alertsStorageKey, JSON.stringify(next))
        } catch (err) {
          console.warn('Не удалось сохранить историю алертов', err)
        }
      }
      return next
    })
  }, [alertsStorageKey])

  const sendTrafficAlert = useCallback(async () => {
    if (!trafficStats) return
    const messageLines = [
      `🚦 ${sectorName || 'Сектор'}: ${trafficStats.criticalCount} критических, ${trafficStats.highCount} высоких участков`,
      `Средняя скорость ${trafficStats.avgSpeed} км/ч, суммарная задержка ${trafficStats.totalDelay} мин.`,
      trafficStats.topCriticalSegments.length > 0
        ? `Топ: ${trafficStats.topCriticalSegments.slice(0, 2).map(seg => `${seg.congestion.toFixed(0)}%/${seg.speed}км/ч`).join(', ')}`
        : ''
    ].filter(Boolean)
    const message = messageLines.join('\n')
    const canUseNavigator = typeof navigator !== 'undefined'
    let shared = false
    if (canUseNavigator) {
      const canShare = typeof navigator.share === 'function'
      const canCopy = !!navigator.clipboard?.writeText
      if (canShare) {
        try {
          await navigator.share({ title: 'Алерт по трафику', text: message })
          shared = true
        } catch (err) {
          console.warn('Не удалось использовать Web Share API', err)
        }
      }
      if (!shared && canCopy) {
        try {
          await navigator.clipboard.writeText(message)
          shared = true
        } catch (err) {
          console.warn('Не удалось скопировать алерт в буфер обмена', err)
        }
      }
    }
    if (shared) {
      setAlertStatus('Алерт подготовлен: текст скопирован/отправлен')
      pushAlertEntry(message)
    } else {
      setAlertStatus('Не удалось подготовить алерт')
    }
    setTimeout(() => setAlertStatus(null), 4000)
  }, [trafficStats, sectorName, pushAlertEntry])

  const updateFeatureFlag = useCallback((flag: keyof MapboxFeatureFlags, value: boolean) => {
    setFeatureFlags(prev => {
      const next = { ...prev, [flag]: value }
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(FEATURE_FLAGS_STORAGE_KEY, JSON.stringify(next))
        } catch (err) {
          console.warn('Не удалось сохранить флаги Mapbox', err)
        }
      }
      return next
    })
  }, [])

  const focusOnSegment = useCallback((segment: { coordinates?: Array<[number, number]> }) => {
    if (!mapRef.current || !segment?.coordinates || segment.coordinates.length === 0 || !mapboxglRef.current) return
    const map = mapRef.current
    const mapboxgl = mapboxglRef.current
    const first = segment.coordinates[0]
    const bounds = segment.coordinates.reduce((acc: any, coord) => acc.extend(coord as [number, number]), new mapboxgl.LngLatBounds(first, first))
    map.fitBounds(bounds, { padding: 60, maxZoom: 15 })
    map.easeTo({ bearing: 0, pitch: 0 })
  }, [])

  const renderSegments = useCallback((segments: TrafficSegmentWithHistory[], timestamp: number, options: { skipHistory?: boolean } = {}) => {
    lastSegmentsRef.current = segments
    if (mapRef.current) {
      const points = convertSegmentsToPoints(segments)
      const filteredPoints = points.filter(point => filterSeverityRef.current.includes(point.severity))
      const clusteredPoints = clusterPoints(filteredPoints)
      updateLayers(mapRef.current, clusteredPoints, displayMode)
      updateSectorLayer(mapRef.current)
      updateSegmentLayer(mapRef.current, segments, displayMode)
    }
    if (segments.length === 0) {
      setTrafficStats(null)
      setLastUpdated(timestamp)
      return null
    }
    const speeds = segments.map(s => s.speed).filter(s => Number.isFinite(s) && s > 0)
    const validSpeedSegments = segments.filter(s => Number.isFinite(s.speed) && (s.speed ?? 0) > 1 && Number.isFinite(s.distance) && (s.distance ?? 0) > 0)
    const totalDistanceMeters = validSpeedSegments.reduce((sum, seg) => sum + (seg.distance || 0), 0)
    const rawAvgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0
    const weightedSpeed = totalDistanceMeters > 0
      ? validSpeedSegments.reduce((sum, seg) => sum + seg.speed * (seg.distance || 0), 0) / totalDistanceMeters
      : rawAvgSpeed
    const sortedSpeeds = validSpeedSegments.map(s => s.speed).sort((a, b) => a - b)
    const medianSpeed = sortedSpeeds.length > 0
      ? (sortedSpeeds.length % 2 === 1
        ? sortedSpeeds[Math.floor(sortedSpeeds.length / 2)]
        : (sortedSpeeds[sortedSpeeds.length / 2 - 1] + sortedSpeeds[sortedSpeeds.length / 2]) / 2)
      : rawAvgSpeed
    const coverageKm = Math.round((totalDistanceMeters / 1000) * 10) / 10
    const reliabilityScore = segments.length > 0
      ? Math.round((validSpeedSegments.length / segments.length) * 100)
      : 0
    const slowSharePercent = segments.length > 0
      ? Math.round((segments.filter(s => (s.speed ?? 0) < 20).length / segments.length) * 100)
      : 0
    const freeFlowBaseline = 45
    const pressureScore = Math.min(100, Math.max(0, Math.round((1 - (weightedSpeed || 0) / freeFlowBaseline) * 100)))
    const delays = segments.map(s => {
      const delay = s.delay ? s.delay / 60 : calculateTrafficDelay(s.congestion, s.duration)
      return delay
    })
    const severities = segments.map(s => getTrafficSeverity(s.congestion))
    const criticalSegments = segments
      .filter(s => getTrafficSeverity(s.congestion) === 'critical')
      .sort((a, b) => b.congestion - a.congestion)
      .slice(0, 6)
      .map(s => ({
        key: s.key || (s.coordinates && s.coordinates.length > 1
          ? buildPairKeyFromCoords(s.coordinates[0], s.coordinates[s.coordinates.length - 1])
          : `${s.congestion}-${s.speed}-${Math.random()}`),
        congestion: s.congestion,
        speed: s.speed,
        distance: s.distance,
        severity: getTrafficSeverity(s.congestion),
        start: s.coordinates?.[0],
        end: s.coordinates?.[s.coordinates.length - 1],
        coordinates: s.coordinates
      }))
    const stats = {
      avgSpeed: Math.max(0, Math.round(weightedSpeed || 0)),
      medianSpeed: Math.max(0, Math.round(medianSpeed || 0)),
      rawAvgSpeed: Math.max(0, Math.round(rawAvgSpeed || 0)),
      coverageKm: Number.isFinite(coverageKm) ? coverageKm : 0,
      reliabilityScore,
      slowSharePercent,
      pressureScore,
      totalDelay: Math.round(delays.reduce((a, b) => a + b, 0) * 10) / 10,
      criticalCount: severities.filter(s => s === 'critical').length,
      highCount: severities.filter(s => s === 'high').length,
      mediumCount: severities.filter(s => s === 'medium').length,
      lowCount: severities.filter(s => s === 'low').length,
      totalSegments: segments.length,
      topCriticalSegments: criticalSegments
    }
    setTrafficStats(stats)
    if (!options.skipHistory) {
      appendHistoryEntry({
        timestamp,
        avgSpeed: stats.avgSpeed,
        totalDelay: stats.totalDelay,
        criticalCount: stats.criticalCount
      })
    }
    setLastUpdated(timestamp)
    return stats
  }, [appendHistoryEntry, convertSegmentsToPoints, displayMode, updateLayers, updateSegmentLayer, updateSectorLayer])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = localStorage.getItem(segmentsStorageKey)
      if (stored) {
        const parsed = JSON.parse(stored) as { timestamp: number; segments: Array<TrafficSegmentWithHistory & { key?: string }> }
        const mapEntries: Array<[string, TrafficSegmentWithHistory & { key?: string }]> = parsed.segments.map(seg => {
          const key = seg.key || (seg.coordinates && seg.coordinates.length > 0
            ? buildPairKeyFromCoords(seg.coordinates[0], seg.coordinates[seg.coordinates.length - 1])
            : `${Math.random()}`)
          return [key, { ...seg, key }]
        })
        segmentStoreRef.current = new Map(mapEntries)
        lastPersistedTimestampRef.current = parsed.timestamp
        renderSegments(parsed.segments, parsed.timestamp, { skipHistory: true })
      } else {
        segmentStoreRef.current.clear()
      }
    } catch (err) {
      console.warn('Не удалось загрузить сохранённые сегменты', err)
      segmentStoreRef.current.clear()
    }
  }, [renderSegments, segmentsStorageKey])

  const fetchTraffic = useCallback(async (options?: { force?: boolean }) => {
    if (!resolvedToken) {
      setError('Укажите Mapbox token в настройках, чтобы загрузить трафик')
      setLoading(false)
      return
    }
    if (!mapRef.current || !sectorPath || sectorPath.length < 3) return
    const nowTs = Date.now()
    if (!options?.force && lastPersistedTimestampRef.current && nowTs - lastPersistedTimestampRef.current < REFRESH_INTERVAL_MS) {
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    const totalPairs = pairsToCheck.length
    const targetSample = featureFlags.denseSampling ? MAX_NEW_REQUESTS_PER_FETCH : Math.max(40, Math.floor(MAX_NEW_REQUESTS_PER_FETCH * 0.6))
    const boundaryAlways = pairsToCheck.slice(0, Math.min(20, totalPairs))
    const dynamicSampleSize = Math.max(0, Math.min(targetSample, totalPairs) - boundaryAlways.length)
    const sampledPairs: Array<[LatLng, LatLng]> = [...boundaryAlways]
    if (dynamicSampleSize > 0 && totalPairs > boundaryAlways.length) {
      let i = 0
      while (sampledPairs.length < boundaryAlways.length + dynamicSampleSize && i < totalPairs) {
        const idx = (pairCursorRef.current + i) % totalPairs
        const candidate = pairsToCheck[idx]
        if (!sampledPairs.includes(candidate)) {
          sampledPairs.push(candidate)
        }
        i++
      }
      pairCursorRef.current = (pairCursorRef.current + dynamicSampleSize) % Math.max(1, totalPairs)
    }
    setLoadingProgress({ current: 0, total: sampledPairs.length })
    
    try {
      const store = segmentStoreRef.current
      const now = Date.now()
      
      // Разбиваем на батчи
      for (let i = 0; i < sampledPairs.length; i += BATCH_SIZE) {
        const batch = sampledPairs.slice(i, i + BATCH_SIZE)
        
        const batchPromises = batch.map(async (pair) => {
          const cacheKey = buildPairKeyFromLatLng(pair[0], pair[1])
          const startTime = Date.now()
          
          let segmentsArray = getCachedData(cacheKey)
          
          if (!segmentsArray) {
            try {
              const apiStartTime = Date.now()
              const rawSegments = await getMapboxTrafficForSegment(
                [pair[0].lng, pair[0].lat],
                [pair[1].lng, pair[1].lat],
                resolvedToken
              )
              const apiResponseTime = Date.now() - apiStartTime
              
              if (rawSegments && rawSegments.length > 0) {
                segmentsArray = sampleRouteSegments(rawSegments)
                setCachedData(cacheKey, segmentsArray)
                updateMetrics(false, apiResponseTime, false)
              }
            } catch (err) {
              console.warn('Ошибка загрузки сегмента:', err)
              const errorResponseTime = Date.now() - startTime
              updateMetrics(false, errorResponseTime, true)
              
              // Fallback на исторические данные
              try {
                const fallbackStartTime = Date.now()
                const historical = await getUkraineTrafficForRoute(
                  [[pair[0].lng, pair[0].lat], [pair[1].lng, pair[1].lat]],
                  resolvedToken,
                  { fallbackToHistorical: true }
                )
                const fallbackResponseTime = Date.now() - fallbackStartTime
                
                if (historical.length > 0) {
                  const h = historical[0]
                  segmentsArray = sampleRouteSegments([{
                    congestion: h.congestion,
                    speed: h.currentSpeed,
                    delay: h.delayMinutes * 60,
                    distance: 0,
                    duration: 0,
                    coordinates: [[pair[0].lng, pair[0].lat], [pair[1].lng, pair[1].lat]]
                  }])
                  updateMetrics(false, fallbackResponseTime, false)
                  setCachedData(cacheKey, segmentsArray)
                }
              } catch (fallbackErr) {
                console.warn('Fallback также не сработал:', fallbackErr)
                const fallbackErrorTime = Date.now() - startTime
                updateMetrics(false, fallbackErrorTime, true)
              }
            }
          } else {
            const cacheResponseTime = Date.now() - startTime
            updateMetrics(true, cacheResponseTime, false)
          }
          
          return { data: segmentsArray, key: cacheKey }
        })
        
        const batchResults = await Promise.all(batchPromises)
        batchResults.forEach(result => {
          if (result.data && result.data.length > 0) {
            result.data.forEach((segmentData, index) => {
              const segmentKey = `${result.key}#${index}`
              const existing = store.get(segmentKey)
              const history = existing?.history || []
              if (history.length >= 10) history.shift()
              history.push({ timestamp: now, congestion: segmentData.congestion, speed: segmentData.speed })
              
              store.set(segmentKey, {
                ...segmentData,
                timestamp: now,
                history,
                key: segmentKey
              })
            })
          }
        })
        
        setLoadingProgress({ current: Math.min(i + BATCH_SIZE, sampledPairs.length), total: sampledPairs.length })
        
        if (i + BATCH_SIZE < sampledPairs.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
        }
      }
      
      for (const [key, value] of store.entries()) {
        if (now - (value.timestamp || now) > REFRESH_INTERVAL_MS) {
          store.delete(key)
        }
      }
      if (store.size > MAX_SEGMENTS) {
        const sorted = Array.from(store.values()).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
        const excess = store.size - MAX_SEGMENTS
        for (let i = 0; i < excess; i++) {
          const entry = sorted[i]
          if (entry?.key) store.delete(entry.key)
        }
      }

      const mergedSegments = Array.from(store.values())
      const stats = renderSegments(mergedSegments, now)
      lastPersistedTimestampRef.current = now
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(segmentsStorageKey, JSON.stringify({ timestamp: now, segments: mergedSegments }))
        } catch (err) {
          console.warn('Не удалось сохранить сегменты трафика', err)
        }
      }
      if (stats && typeof window !== 'undefined') {
        try {
          const snapshot = {
            timestamp: now,
            stats,
            severitySummary: {
              critical: stats.criticalCount,
              high: stats.highCount,
              medium: stats.mediumCount,
              low: stats.lowCount
            },
            sampleSegments: mergedSegments.slice(0, 30).map(seg => ({
              start: seg.coordinates[0],
              end: seg.coordinates[seg.coordinates.length - 1],
              congestion: seg.congestion,
              speed: seg.speed,
              severity: getTrafficSeverity(seg.congestion)
            }))
          }
          localStorage.setItem(snapshotStorageKey, JSON.stringify(snapshot))
          window.dispatchEvent(new CustomEvent('km-traffic-snapshot-updated', { detail: { key: snapshotStorageKey, stats } }))
        } catch (err) {
          console.warn('Не удалось сохранить снимок трафика', err)
        }
      }
    } catch (err) {
      console.error('Ошибка загрузки трафика:', err)
      setError('Не удалось загрузить данные о трафике. Попробуйте обновить позже.')
    } finally {
      setLoading(false)
      setLoadingProgress({ current: 0, total: 0 })
    }
  }, [pairsToCheck, resolvedToken, sectorPath, getCachedData, setCachedData, renderSegments, snapshotStorageKey, featureFlags, segmentsStorageKey])

  useEffect(() => {
    if (!resolvedToken) {
      setError('Укажите Mapbox token в настройках, чтобы увидеть карту')
      return
    }
    if (!sectorPath || sectorPath.length < 3 || !containerRef.current) return
    let mounted = true

    const init = async () => {
      try {
        const mapboxgl = (await loadMapboxGL()) as typeof import('mapbox-gl')
        if (!mounted) return
        mapboxglRef.current = mapboxgl
        ;(mapboxgl as any).accessToken = resolvedToken
        const containerEl = containerRef.current
        if (!containerEl) return
        const map = new mapboxgl.Map({
          container: containerEl,
          style: isDark ? DARK_STYLE : LIGHT_STYLE,
          center: [sectorCenter.lng, sectorCenter.lat],
          zoom: 11
        })
        mapRef.current = map
        handlersAddedRef.current = false
        zoomLevelRef.current = 11
        
        map.on('zoom', () => {
          zoomLevelRef.current = map.getZoom()
        })
        
        map.on('load', async () => {
          updateSectorLayer(map)
          if (sectorGeoJSON) {
            const polygon = sectorGeoJSON.geometry.coordinates[0]
            const firstPoint = polygon[0] as [number, number]
            const bounds = polygon.slice(1).reduce(
              (acc, coord) => acc.extend(coord as [number, number]),
              new mapboxgl.LngLatBounds(firstPoint, firstPoint)
            )
            map.fitBounds(bounds, { padding: 40 })
          }
          if (segmentStoreRef.current.size > 0 && lastPersistedTimestampRef.current) {
            const segments = Array.from(segmentStoreRef.current.values())
            renderSegments(segments, lastPersistedTimestampRef.current, { skipHistory: true })
          }
          await fetchTraffic()
        })
      } catch (err) {
        console.error('Ошибка инициализации карты:', err)
        setError('Не удалось инициализировать карту Mapbox')
      }
    }

    init()

    return () => {
      mounted = false
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [sectorPath, isDark, resolvedToken, fetchTraffic, sectorGeoJSON, sectorCenter, updateSectorLayer])

  useEffect(() => {
    if (!mapRef.current) return
    const map = mapRef.current
    map.setStyle(isDark ? DARK_STYLE : LIGHT_STYLE)
    map.on('style.load', () => {
      updateSectorLayer(map)
      if (lastSegmentsRef.current.length > 0) {
        updateSegmentLayer(map, lastSegmentsRef.current, displayMode)
      }
      fetchTraffic()
    })
  }, [isDark, fetchTraffic, updateSectorLayer, updateSegmentLayer, displayMode])

  useEffect(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current)
    }
    const interval = getRefreshInterval()
    refreshTimerRef.current = setInterval(() => fetchTraffic(), interval)
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [fetchTraffic])

  useEffect(() => {
    const id = setInterval(() => {
      setMetricsSnapshot({ ...performanceMetrics })
    }, 5000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!featureFlags.enableHeatmapControl) {
      setHeatmapBoost(1)
    }
  }, [featureFlags.enableHeatmapControl])

  useEffect(() => {
    if (mapRef.current && lastSegmentsRef.current.length > 0) {
      updateSegmentLayer(mapRef.current, lastSegmentsRef.current, displayMode)
      const points = convertSegmentsToPoints(lastSegmentsRef.current)
      const filteredPoints = points.filter(point => filterSeverity.includes(point.severity))
      const clusteredPoints = clusterPoints(filteredPoints)
      updateLayers(mapRef.current, clusteredPoints, displayMode)
    }
  }, [filterSeverity, displayMode, updateSegmentLayer, updateLayers, convertSegmentsToPoints])

  if (!sectorPath || sectorPath.length < 3) {
    return (
      <div className={clsx('p-4 rounded-lg border', isDark ? 'border-gray-700 bg-gray-800/40' : 'border-gray-200 bg-gray-50')}>
        <div className={clsx('text-sm font-medium mb-1', isDark ? 'text-gray-100' : 'text-gray-800')}>
          Не задан периметр сектора
        </div>
        <div className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>
          Укажите границы сектора в настройках, чтобы видеть тепловую карту трафика.
        </div>
      </div>
    )
  }

  const lastUpdatedText = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : '—'

  const toggleFilter = (severity: 'low' | 'medium' | 'high' | 'critical') => {
    setFilterSeverity(prev => 
      prev.includes(severity) 
        ? prev.filter(s => s !== severity)
        : [...prev, severity]
    )
  }

  const refreshIntervalText = '30 минут'

  return (
    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={clsx('text-xs font-semibold uppercase tracking-wide', isDark ? 'text-gray-200' : 'text-gray-700')}>
          Сектор: {sectorName || '—'}
        </div>
        <div className="flex items-center gap-2">
          <div className={clsx('text-[11px]', isDark ? 'text-gray-400' : 'text-gray-500')}>
            Обновлено: {lastUpdatedText}
          </div>
          <button
            onClick={() => fetchTraffic({ force: true })}
            disabled={loading}
            className={clsx(
              'px-2 py-1 rounded text-[11px] font-medium transition-colors',
              isDark 
                ? 'bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-50' 
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700 disabled:opacity-50'
            )}
          >
            🔄
          </button>
        </div>
      </div>
      
      {/* Расширенная статистика */}
{trafficStats && (
  <div className={clsx('space-y-3', isDark ? 'text-gray-100' : 'text-gray-800')}>
    <div className="flex flex-wrap items-center gap-3 text-[11px]">
      {trafficMood && (
        <span className={clsx(
          'px-2 py-1 rounded-full font-semibold flex items-center gap-1',
          trafficMood === 'gridlock'
            ? (isDark ? 'bg-red-900/70 text-red-100' : 'bg-red-100 text-red-700')
            : trafficMood === 'busy'
              ? (isDark ? 'bg-yellow-900/60 text-yellow-100' : 'bg-yellow-100 text-yellow-700')
              : (isDark ? 'bg-emerald-900/50 text-emerald-100' : 'bg-emerald-100 text-emerald-700')
        )}>
          {trafficMood === 'gridlock' ? '⚠️ Город стоит' : trafficMood === 'busy' ? '⛔ Плотный трафик' : '✅ Движение умеренное'}
        </span>
      )}
      <span className={clsx('text-[11px]', isDark ? 'text-gray-400' : 'text-gray-500')}>
        Надежность: {trafficStats.reliabilityScore}% · Покрытие: {trafficStats.coverageKm.toFixed(1)} км
      </span>
      <span className={clsx('text-[11px]', isDark ? 'text-gray-400' : 'text-gray-500')}>
        Давление трафика: {trafficStats.pressureScore}%
      </span>
    </div>
    <div className={clsx('grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 p-3 rounded-lg border', isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-gray-50')}>
            <div>
              <div className={clsx('text-[10px] uppercase tracking-wide mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                Средняя скорость
              </div>
              <div className={clsx('text-sm font-semibold', isDark ? 'text-gray-100' : 'text-gray-800')}>
                {trafficStats.avgSpeed} км/ч
              </div>
              <div className={clsx('text-[10px]', isDark ? 'text-gray-500' : 'text-gray-500')}>
                без веса: {trafficStats.rawAvgSpeed} км/ч
              </div>
            </div>
            <div>
              <div className={clsx('text-[10px] uppercase tracking-wide mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                Медианная скорость
              </div>
              <div className={clsx('text-sm font-semibold', isDark ? 'text-gray-100' : 'text-gray-800')}>
                {trafficStats.medianSpeed} км/ч
              </div>
            </div>
            <div>
              <div className={clsx('text-[10px] uppercase tracking-wide mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                Общая задержка
              </div>
              <div className={clsx('text-sm font-semibold', isDark ? 'text-gray-100' : 'text-gray-800')}>
                {trafficStats.totalDelay} мин
              </div>
            </div>
            <div>
              <div className={clsx('text-[10px] uppercase tracking-wide mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                Критические
              </div>
              <div className={clsx('text-sm font-semibold', trafficStats.criticalCount > 0 ? 'text-red-500' : isDark ? 'text-gray-100' : 'text-gray-800')}>
                {trafficStats.criticalCount}
              </div>
            </div>
            <div>
              <div className={clsx('text-[10px] uppercase tracking-wide mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                Покрытие
              </div>
              <div className={clsx('text-sm font-semibold', isDark ? 'text-gray-100' : 'text-gray-800')}>
                {trafficStats.coverageKm.toFixed(1)} км
              </div>
            </div>
            <div>
              <div className={clsx('text-[10px] uppercase tracking-wide mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                Надежность данных
              </div>
              <div className={clsx('text-sm font-semibold', isDark ? 'text-gray-100' : 'text-gray-800')}>
                {trafficStats.reliabilityScore}%
              </div>
            </div>
    </div>
    <div className={clsx('grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]', isDark ? 'text-gray-400' : 'text-gray-600')}>
      <div>Всего сегментов: {trafficStats.totalSegments}</div>
      <div>Доля &lt; 20 км/ч: {trafficStats.slowSharePercent}%</div>
      <div>Давление трафика: {trafficStats.pressureScore}%</div>
      <div className="flex items-center gap-1">
        <span>Режим сбора:</span>
        <span className={clsx('px-2 py-0.5 rounded-full text-[10px]', 
          trafficStats.reliabilityScore >= 70
            ? (isDark ? 'bg-emerald-800/60 text-emerald-100' : 'bg-emerald-100 text-emerald-700')
            : (isDark ? 'bg-yellow-800/60 text-yellow-100' : 'bg-yellow-100 text-yellow-700')
        )}>
          {trafficStats.reliabilityScore >= 70 ? 'стабильно' : 'ограничено'}
        </span>
      </div>
    </div>
    {severityDistribution.length > 0 && (
      <div className={clsx('p-3 rounded-lg border space-y-2', isDark ? 'border-gray-700 bg-gray-900/30' : 'border-gray-200 bg-white')}>
        <div className={clsx('text-[10px] uppercase tracking-wide', isDark ? 'text-gray-400' : 'text-gray-500')}>
          Распределение уровней
        </div>
        <div className="flex items-center gap-3 text-[11px] flex-wrap">
          <div className="flex-1 h-2 rounded-full overflow-hidden flex">
            {severityDistribution.map(entry => (
              <div
                key={entry.label}
                className={clsx(entry.color, 'h-full')}
                style={{ width: `${entry.percent}%` }}
              />
            ))}
          </div>
          {severityDistribution.map(entry => (
            <span key={`${entry.label}-label`}>
              {entry.label}: {entry.value} ({entry.percent}%)
            </span>
          ))}
        </div>
      </div>
    )}
    
    {/* Топ-5 критических участков */}
    {trafficStats.topCriticalSegments.length > 0 && (
      <div className={clsx('p-3 rounded-lg border', isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-gray-50')}>
        <div className={clsx('text-[10px] uppercase tracking-wide mb-2', isDark ? 'text-gray-400' : 'text-gray-500')}>
          Топ-5 критических участков
        </div>
        <div className="space-y-2">
          {trafficStats.topCriticalSegments.map((segment, idx) => (
                  <div
              key={segment.key || idx}
              className={clsx(
                'text-xs flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1 border',
                isDark ? 'border-red-900/40 bg-red-900/10 text-red-100' : 'border-red-100 bg-red-50 text-red-700'
              )}
            >
              <div>
                <div className="font-semibold">#{idx + 1} · {segment.congestion.toFixed(0)}% загрузка</div>
                      <div>Скорость: {segment.speed} км/ч · {typeof segment.distance === 'number' ? (segment.distance / 1000).toFixed(1) : '—'} км</div>
              </div>
              <button
                onClick={() => focusOnSegment(segment)}
                className={clsx(
                  'text-[11px] px-2 py-1 rounded font-medium',
                  isDark ? 'bg-red-800/60 text-white hover:bg-red-700/70' : 'bg-red-500 text-white hover:bg-red-600'
                )}
              >
                👁 Фокус
              </button>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
)}
      {historyChartData && (
        <div className={clsx('p-3 rounded-lg border flex flex-col gap-2', isDark ? 'border-gray-700 bg-gray-900/30' : 'border-gray-200 bg-white')}>
          <div className={clsx('text-[10px] uppercase tracking-wide', isDark ? 'text-gray-400' : 'text-gray-500')}>
            История скорости (последние ~12 часов)
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <svg
              width={historyChartData.width}
              height={historyChartData.height}
              viewBox={`0 0 ${historyChartData.width} ${historyChartData.height}`}
              className="overflow-visible"
            >
              <path
                d={historyChartData.path}
                fill="none"
                stroke={isDark ? '#60a5fa' : '#2563eb'}
                strokeWidth={2}
                strokeLinecap="round"
              />
            </svg>
            <div className="text-xs">
              <div>Макс: {historyChartData.maxSpeed.toFixed(0)} км/ч</div>
              <div>Мин: {historyChartData.minSpeed.toFixed(0)} км/ч</div>
            </div>
            <div className="flex-1">
              <ul className="space-y-1 text-[11px]">
                {trafficHistory.slice(-3).reverse().map(entry => (
                  <li key={entry.timestamp} className={clsx(isDark ? 'text-gray-300' : 'text-gray-600', 'flex justify-between')}>
                    <span>{new Date(entry.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>{entry.avgSpeed} км/ч · критич: {entry.criticalCount}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
      
      {/* Режимы отображения */}
      <div className="flex flex-wrap items-center gap-2">
        <div className={clsx('text-[11px] font-medium', isDark ? 'text-gray-300' : 'text-gray-600')}>
          Режим:
        </div>
        {(['lines', 'heatmap', 'combined', 'critical-only'] as DisplayMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => setDisplayMode(mode)}
            className={clsx(
              'px-2 py-1 rounded text-[11px] font-medium transition-all',
              displayMode === mode
                ? isDark ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'
                : isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-600'
            )}
          >
            {mode === 'lines' ? '📊 Линии' :
             mode === 'heatmap' ? '🔥 Heatmap' :
             mode === 'combined' ? '🔀 Комбинированный' : '⚠️ Только критические'}
          </button>
        ))}
      </div>
      
      {/* Фильтры */}
      <div className="flex flex-wrap items-center gap-2">
        <div className={clsx('text-[11px] font-medium', isDark ? 'text-gray-300' : 'text-gray-600')}>
          Фильтр:
        </div>
        {(['critical', 'high', 'medium', 'low'] as const).map(severity => (
          <button
            key={severity}
            onClick={() => toggleFilter(severity)}
            className={clsx(
              'px-2 py-1 rounded text-[11px] font-medium transition-all',
              filterSeverity.includes(severity)
                ? severity === 'critical' ? 'bg-red-500 text-white' :
                  severity === 'high' ? 'bg-orange-500 text-white' :
                  severity === 'medium' ? 'bg-yellow-500 text-white' :
                  'bg-green-500 text-white'
                : isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-600'
            )}
          >
            {severity === 'critical' ? '🔴 Критическая' :
             severity === 'high' ? '🟠 Высокая' :
             severity === 'medium' ? '🟡 Средняя' : '🟢 Низкая'}
          </button>
        ))}
      </div>
      
    {featureFlags.enableHeatmapControl && (
      <div className="flex flex-wrap items-center gap-3">
        <div className={clsx('text-[11px] font-medium', isDark ? 'text-gray-300' : 'text-gray-600')}>
          Тепловая карта suka ne rabotaet stabil'no:
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0.7}
            max={1.4}
            step={0.1}
            value={heatmapBoost}
            onChange={e => setHeatmapBoost(Number(e.target.value))}
            className="w-32 accent-blue-500"
          />
          <span className={clsx('text-[11px] font-medium', isDark ? 'text-gray-300' : 'text-gray-600')}>
            Интенсивность {Math.round(heatmapBoost * 100)}%
          </span>
        </div>
      </div>
    )}

    {featureFlags.enableAlerts && trafficStats && trafficStats.criticalCount > 0 && (
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <button
          onClick={sendTrafficAlert}
          className={clsx(
            'px-3 py-1.5 rounded font-semibold transition-colors',
            isDark ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-red-500 hover:bg-red-600 text-white'
          )}
        >
          ⚠️ Поделиться предупреждением
        </button>
        {alertStatus && (
          <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-600')}>
            {alertStatus}
          </span>
        )}
      </div>
    )}

    {featureFlags.enableAlerts && alertHistory.length > 0 && (
      <div className={clsx('text-[11px] space-y-1 p-2 rounded border', isDark ? 'border-gray-700 bg-gray-900/40 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-600')}>
        <div className="uppercase tracking-wide text-[10px]">Последние алерты</div>
        <ul className="space-y-1">
          {alertHistory.slice(0, 3).map(entry => (
            <li key={entry.timestamp} className="flex flex-col">
              <span className="font-semibold">
                {new Date(entry.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span>{entry.message}</span>
            </li>
          ))}
        </ul>
      </div>
    )}

    <div className={clsx('text-[11px] space-y-1 p-3 rounded border', isDark ? 'border-gray-700 bg-gray-900/40 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-600')}>
      <div className="uppercase tracking-wide text-[10px]">Флаги Mapbox</div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={featureFlags.denseSampling}
          onChange={e => updateFeatureFlag('denseSampling', e.target.checked)}
        />
        <span>Плотная выборка внутри сектора</span>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={featureFlags.enableHeatmapControl}
          onChange={e => updateFeatureFlag('enableHeatmapControl', e.target.checked)}
        />
        <span>Ручная интенсивность heatmap</span>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={featureFlags.enableAlerts}
          onChange={e => updateFeatureFlag('enableAlerts', e.target.checked)}
        />
        <span>Алерты и шаринг пробок</span>
      </label>
    </div>

    <div className={clsx('text-[11px] grid grid-cols-2 gap-2 p-3 rounded border', isDark ? 'border-gray-700 bg-gray-900/40 text-gray-200' : 'border-gray-200 bg-gray-50 text-gray-700')}>
      <div>
        <div className="uppercase tracking-wide text-[10px]">API calls</div>
        <div className="text-sm font-semibold">{metricsSnapshot.apiCalls}</div>
      </div>
      <div>
        <div className="uppercase tracking-wide text-[10px]">Cache hit</div>
        <div className="text-sm font-semibold">
          {metricsSnapshot.apiCalls > 0 ? ((metricsSnapshot.cacheHits / metricsSnapshot.apiCalls) * 100).toFixed(1) : '—'}%
        </div>
      </div>
      <div>
        <div className="uppercase tracking-wide text-[10px]">Avg response</div>
        <div className="text-sm font-semibold">{metricsSnapshot.averageResponseTime.toFixed(0)} мс</div>
      </div>
      <div>
        <div className="uppercase tracking-wide text-[10px]">Ошибки</div>
        <div className="text-sm font-semibold">{metricsSnapshot.errors}</div>
      </div>
    </div>
    
      <div
        ref={containerRef}
        className={clsx('w-full h-64 rounded-lg border overflow-hidden relative', isDark ? 'border-gray-700' : 'border-gray-200')}
      >
        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className={clsx('px-4 py-2 rounded-lg text-sm', isDark ? 'bg-red-900/40 text-red-200' : 'bg-red-50 text-red-600')}>
              {error}
            </div>
          </div>
        )}
        {loading && (
          <div className="absolute top-2 right-2 z-10">
            <div className={clsx('text-xs px-2 py-1 rounded bg-black/50 text-white backdrop-blur mb-1')}>
              Обновление… {loadingProgress.total > 0 ? `${Math.round((loadingProgress.current / loadingProgress.total) * 100)}%` : ''}
            </div>
            {loadingProgress.total > 0 && (
              <div className={clsx('w-32 h-1 rounded-full overflow-hidden', isDark ? 'bg-gray-700' : 'bg-gray-200')}>
                <div 
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${(loadingProgress.current / loadingProgress.total) * 100}%` }}
                />
              </div>
            )}
          </div>
        )}
        {trafficStats && trafficStats.criticalCount > 0 && (
          <div className={clsx('absolute top-2 left-2 px-2 py-1 rounded text-xs font-medium bg-red-500 text-white z-10 animate-pulse')}>
            ⚠️ {trafficStats.criticalCount} критических участков
          </div>
        )}
      </div>
      
      <div className={clsx('text-xs flex flex-wrap gap-4', isDark ? 'text-gray-400' : 'text-gray-500')}>
        <span>🔴 Критическая · 🟠 Высокая · 🟡 Средняя · 🟢 Низкая</span>
        <span>Клик по линии = детали</span>
        <span>Обновление каждые {refreshIntervalText}</span>
      </div>
    </div>
  )
}

// Default export для более надежной загрузки на Render
export default TrafficHeatmap
