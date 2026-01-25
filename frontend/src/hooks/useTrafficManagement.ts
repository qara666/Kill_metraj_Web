import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { TrafficSnapshot, TrafficPresetMode, TrafficPresetInfo } from '../types'
import { localStorageUtils } from '../utils/ui/localStorage'

const TRAFFIC_MODE_OVERRIDE_KEY = 'km_traffic_mode_override'

export const presetTemplate = (
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

export const deriveTrafficPreset = (
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

export const useTrafficManagement = (maxStops: number, maxDuration: number, maxDistance: number) => {
    const [trafficSnapshot, setTrafficSnapshot] = useState<TrafficSnapshot | null>(null)
    const trafficSnapshotRef = useRef<TrafficSnapshot | null>(null)
    const [trafficModeOverride, setTrafficModeOverride] = useState<'auto' | TrafficPresetMode>('auto')

    const [sectorCityName, setSectorCityName] = useState<string>('')
    const [mapboxTokenState, setMapboxTokenState] = useState<string | undefined>(undefined)

    const sectorStorageKey = useMemo(() => sectorCityName?.toLowerCase().replace(/\s+/g, '_') || 'default', [sectorCityName])
    const trafficSnapshotStorageKey = useMemo(() => `km_traffic_snapshot_${sectorStorageKey}`, [sectorStorageKey])

    const trafficPreset = useMemo(() => deriveTrafficPreset(
        trafficSnapshot,
        { maxStops, maxDuration, maxDistance },
        trafficModeOverride
    ), [trafficSnapshot, maxStops, maxDuration, maxDistance, trafficModeOverride])

    const trafficAdvisory = useMemo((): 'critical' | 'high' | 'moderate' | null => {
        if (!trafficSnapshot) return null
        if (trafficPreset.mode === 'gridlock') return 'critical'
        if (trafficPreset.mode === 'busy') return 'high'
        return 'moderate'
    }, [trafficSnapshot, trafficPreset.mode])

    const syncSectorSettings = useCallback(() => {
        const settings = localStorageUtils.getAllSettings()
        const city = settings.cityBias as string || ''
        setSectorCityName(city)


        const savedMapboxToken = localStorage.getItem('km_mapbox_token')
        if (savedMapboxToken?.trim()) {
            setMapboxTokenState(savedMapboxToken.trim())
        } else if (settings.mapboxToken?.trim()) {
            setMapboxTokenState(settings.mapboxToken.trim())
        } else {
            setMapboxTokenState(undefined)
        }
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') return
        const stored = localStorage.getItem(TRAFFIC_MODE_OVERRIDE_KEY)
        if (stored === 'auto' || stored === 'free' || stored === 'busy' || stored === 'gridlock') {
            setTrafficModeOverride(stored as any)
        }
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') return
        localStorage.setItem(TRAFFIC_MODE_OVERRIDE_KEY, trafficModeOverride)
    }, [trafficModeOverride])

    // Load snapshot effect
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
                setTrafficSnapshot(null)
                trafficSnapshotRef.current = null
            }
        }

        const handleStorage = (event: StorageEvent) => {
            if (event.key === trafficSnapshotStorageKey) loadSnapshot()
        }

        const handleCustom = (event: Event) => {
            const detailKey = (event as CustomEvent<{ key?: string }>).detail?.key
            if (!detailKey || detailKey === trafficSnapshotStorageKey) loadSnapshot()
        }

        loadSnapshot()
        window.addEventListener('storage', handleStorage)
        window.addEventListener('km-traffic-snapshot-updated', handleCustom as EventListener)

        return () => {
            window.removeEventListener('storage', handleStorage)
            window.removeEventListener('km-traffic-snapshot-updated', handleCustom as EventListener)
        }
    }, [trafficSnapshotStorageKey])

    return {
        trafficSnapshot,
        trafficSnapshotRef,
        trafficModeOverride,
        setTrafficModeOverride,
        trafficPreset,
        trafficAdvisory,
        sectorCityName,
        mapboxTokenState,
        syncSectorSettings
    }
}
