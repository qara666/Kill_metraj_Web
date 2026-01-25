import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { useTheme } from '../../contexts/ThemeContext'
import { loadMapboxGL } from '../../utils/maps/mapboxLoader'
import { localStorageUtils } from '../../utils/ui/localStorage'
import {
  getTrafficSeverity
} from '../../utils/maps/mapboxTrafficAPI'

// Modular Hooks
import { useTrafficData, TrafficSegmentWithHistory } from '../../hooks/useTrafficData'
import { useMapboxLayers } from '../../hooks/useMapboxLayers'

interface TrafficHeatmapProps {
  sectorName?: string
  mapboxToken?: string
}

type DisplayMode = 'lines' | 'heatmap' | 'combined' | 'critical-only'

type MapboxFeatureFlags = {
  denseSampling: boolean
}

const DEFAULT_FEATURE_FLAGS: MapboxFeatureFlags = {
  denseSampling: true
}

const LIGHT_STYLE = 'mapbox://styles/mapbox/light-v11'
const DARK_STYLE = 'mapbox://styles/mapbox/dark-v11'


export const TrafficHeatmap: React.FC<TrafficHeatmapProps> = ({ sectorName, mapboxToken }) => {
  const { isDark } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)

  const [displayMode, setDisplayMode] = useState<DisplayMode>('combined')
  const [trafficStats, setTrafficStats] = useState<any | null>(null)
  const [filterSeverity] = useState<string[]>(['low', 'medium', 'high', 'critical'])
  const [heatmapBoost] = useState(1)
  const [featureFlags] = useState<MapboxFeatureFlags>(DEFAULT_FEATURE_FLAGS)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [showOfficialTraffic, setShowOfficialTraffic] = useState(true)

  const sectorStorageKey = useMemo(() => sectorName?.toLowerCase().replace(/\s+/g, '_') || 'default', [sectorName])
  const resolvedToken = useMemo(() => {
    const direct = (mapboxToken || '').trim()
    if (direct) return direct
    const settings = localStorageUtils.getAllSettings()
    return (settings.mapboxToken || '').trim()
  }, [mapboxToken])

  const segmentsStorageKey = `km_traffic_segments_${sectorStorageKey}`
  const trafficCacheStorageKey = `km_traffic_cache_${sectorStorageKey}`


  // Hooks integration
  const { updateTrafficLayers, updateSegmentLayer, toggleOfficialTraffic } = useMapboxLayers(heatmapBoost)

  const onDataUpdate = useCallback((allSegments: TrafficSegmentWithHistory[], timestamp: number) => {
    setLastUpdated(timestamp)
    // Minimal analytics here, full stats in hook
    const speeds = allSegments.map(s => s.speed).filter(s => s > 0)
    const avgSpeed = speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : 0

    const stats: any = {
      avgSpeed,
      coverageKm: allSegments.reduce((s, seg) => s + (seg.distance || 0), 0) / 1000,
      totalDelay: allSegments.reduce((s, seg) => s + (seg.delay || 0), 0) / 60,
      criticalCount: allSegments.filter(s => getTrafficSeverity(s.congestion) === 'critical').length,
    }
    setTrafficStats(stats)

    if (mapRef.current) {
      updateSegmentLayer(mapRef.current, allSegments, filterSeverity)
      updateTrafficLayers(mapRef.current, allSegments.map(s => ({
        coordinates: s.coordinates[0],
        severity: getTrafficSeverity(s.congestion)
      })), displayMode)
      toggleOfficialTraffic(mapRef.current, showOfficialTraffic)
    }
  }, [updateSegmentLayer, updateTrafficLayers, filterSeverity, displayMode])

  const waypoints = useMemo(() => {
    // Note: No waypoint generation without sectorPath for now.
    // In the future, this should be adapted to use selected KML Hubs.
    return []
  }, [])

  const { loading, error, loadingProgress, fetchTraffic } = useTrafficData(
    waypoints,
    resolvedToken,
    featureFlags.denseSampling,
    segmentsStorageKey,
    trafficCacheStorageKey,
    onDataUpdate
  )

  useEffect(() => {
    if (!containerRef.current || !resolvedToken) return
    let mounted = true

    const initMap = async () => {
      const mapboxgl = await loadMapboxGL()
      if (!mounted) return
      (mapboxgl as any).accessToken = resolvedToken

      const map = new mapboxgl.Map({
        container: containerRef.current!,
        style: isDark ? DARK_STYLE : LIGHT_STYLE,
        center: [30.5234, 50.4501],
        zoom: 11
      })
      mapRef.current = map

      map.on('load', () => {
        toggleOfficialTraffic(map, showOfficialTraffic)
        fetchTraffic()
      })
    }

    initMap()
    return () => { mounted = false; mapRef.current?.remove() }
  }, [isDark, resolvedToken, fetchTraffic])


  return (
    <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Сектор: <span className={isDark ? 'text-white' : 'text-gray-900'}>{sectorName || '—'}</span>
          </h3>
          {lastUpdated && (
            <div className="text-[10px] text-gray-400 mt-0.5">
              Обновлено: {new Date(lastUpdated).toLocaleTimeString()}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {loading && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-[10px] text-blue-500 font-medium uppercase">
                {Math.round((loadingProgress.current / (loadingProgress.total || 1)) * 100)}%
              </span>
            </div>
          )}
          <button
            onClick={() => fetchTraffic({ force: true })}
            disabled={loading}
            className={clsx(
              "text-[10px] uppercase font-bold px-3 py-1.5 rounded transition-all",
              loading
                ? "bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                : "bg-blue-500 hover:bg-blue-600 text-white shadow-sm"
            )}
          >
            {loading ? 'Загрузка...' : 'Обновить'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-2.5 text-[10px] bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md border border-red-100 dark:border-red-900/30">
          Ошибка: {error}
        </div>
      )}

      {trafficStats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className={clsx("p-3 border rounded-lg", isDark ? "bg-gray-800/50 border-gray-700" : "bg-white border-gray-100 shadow-sm")}>
            <div className="text-[10px] text-gray-500 uppercase font-medium">Ср. скорость</div>
            <div className="text-lg font-bold tabular-nums">{trafficStats.avgSpeed} <span className="text-[10px] font-normal text-gray-400">км/ч</span></div>
          </div>
          <div className={clsx("p-3 border rounded-lg", isDark ? "bg-gray-800/50 border-gray-700" : "bg-white border-gray-100 shadow-sm")}>
            <div className="text-[10px] text-gray-500 uppercase font-medium">Задержки</div>
            <div className="text-lg font-bold tabular-nums">{trafficStats.totalDelay.toFixed(1)} <span className="text-[10px] font-normal text-gray-400">мин</span></div>
          </div>
          <div className={clsx("p-3 border rounded-lg", isDark ? "bg-gray-800/50 border-gray-700" : "bg-white border-gray-100 shadow-sm")}>
            <div className="text-[10px] text-gray-500 uppercase font-medium">Критично</div>
            <div className={clsx("text-lg font-bold tabular-nums", trafficStats.criticalCount > 0 ? "text-red-500" : "text-green-500")}>
              {trafficStats.criticalCount}
            </div>
          </div>
          <div className={clsx("p-3 border rounded-lg", isDark ? "bg-gray-800/50 border-gray-700" : "bg-white border-gray-100 shadow-sm")}>
            <div className="text-[10px] text-gray-500 uppercase font-medium">Покрытие</div>
            <div className="text-lg font-bold tabular-nums">{trafficStats.coverageKm.toFixed(1)} <span className="text-[10px] font-normal text-gray-400">км</span></div>
          </div>
        </div>
      )}

      <div className="relative group">
        <div ref={containerRef} className="w-full h-80 border rounded-xl overflow-hidden shadow-inner bg-gray-100 dark:bg-gray-900 border-gray-200 dark:border-gray-800" />
        <div className="absolute bottom-3 left-3 flex gap-1.5 p-1.5 bg-white/90 dark:bg-gray-800/90 backdrop-blur rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          {(['lines', 'heatmap', 'combined'] as const).map(m => (
            <button
              key={m}
              onClick={() => setDisplayMode(m)}
              className={clsx(
                "px-2.5 py-1 text-[9px] uppercase font-bold rounded-md transition-all",
                displayMode === m
                  ? "bg-blue-500 text-white"
                  : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              )}
            >
              {m}
            </button>
          ))}
          <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 self-center mx-1" />
          <button
            onClick={() => {
              const newVal = !showOfficialTraffic
              setShowOfficialTraffic(newVal)
              if (mapRef.current) toggleOfficialTraffic(mapRef.current, newVal)
            }}
            className={clsx(
              "px-2.5 py-1 text-[9px] uppercase font-bold rounded-md transition-all",
              showOfficialTraffic ? "bg-green-500 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            )}
          >
            Real Roads
          </button>
        </div>
      </div>
    </div>
  )
}

export default TrafficHeatmap
