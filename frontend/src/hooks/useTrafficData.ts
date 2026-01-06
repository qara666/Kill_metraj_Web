import { useState, useCallback, useRef } from 'react'
import {
    getMapboxTrafficForSegment,
    MapboxTrafficData
} from '../utils/maps/mapboxTrafficAPI'
import { getUkraineTrafficForRoute } from '../utils/maps/ukraineTrafficAPI'

export interface LatLng { lat: number; lng: number }

export interface TrafficSegmentWithHistory extends MapboxTrafficData {
    timestamp: number
    history?: Array<{ timestamp: number; congestion: number; speed: number }>
    key?: string
}



const CACHE_TTL = 5 * 60 * 1000
const REFRESH_INTERVAL_MS = 30 * 60 * 1000
const BATCH_SIZE = 5
const BATCH_DELAY = 100

export const useTrafficData = (
    pairsToCheck: Array<[LatLng, LatLng]>,
    resolvedToken: string,
    denseSampling: boolean,
    segmentsStorageKey: string,
    trafficCacheStorageKey: string,
    onDataUpdate: (segments: TrafficSegmentWithHistory[], timestamp: number) => void
) => {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 })
    const segmentStoreRef = useRef<Map<string, TrafficSegmentWithHistory>>(new Map())
    const lastPersistedTimestampRef = useRef<number>(0)
    const trafficCache = useRef(new Map<string, { data: MapboxTrafficData[]; timestamp: number; key: string }>())

    // Cache helpers
    const getCachedData = useCallback((key: string): MapboxTrafficData[] | null => {
        const cached = trafficCache.current.get(key)
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data

        if (typeof window !== 'undefined') {
            try {
                const stored = localStorage.getItem(trafficCacheStorageKey)
                if (stored) {
                    const parsed = JSON.parse(stored)
                    const entry = parsed[key]
                    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
                        trafficCache.current.set(key, entry)
                        return entry.data
                    }
                }
            } catch { }
        }
        return null
    }, [trafficCacheStorageKey])

    const setCachedData = useCallback((key: string, data: MapboxTrafficData[]) => {
        const entry = { data, timestamp: Date.now(), key }
        trafficCache.current.set(key, entry)
        if (typeof window !== 'undefined') {
            try {
                const stored = localStorage.getItem(trafficCacheStorageKey)
                const cache = stored ? JSON.parse(stored) : {}
                cache[key] = entry
                localStorage.setItem(trafficCacheStorageKey, JSON.stringify(cache))
            } catch { }
        }
    }, [trafficCacheStorageKey])

    const fetchTraffic = useCallback(async (options?: { force?: boolean }) => {
        if (!resolvedToken) return
        const nowTs = Date.now()
        if (!options?.force && lastPersistedTimestampRef.current && nowTs - lastPersistedTimestampRef.current < REFRESH_INTERVAL_MS) {
            return
        }

        setLoading(true)
        setError(null)

        const totalPairs = pairsToCheck.length
        const targetSample = denseSampling ? 100 : 60
        const sampledPairs = pairsToCheck.slice(0, Math.min(targetSample, totalPairs))

        setLoadingProgress({ current: 0, total: sampledPairs.length })

        try {
            const store = segmentStoreRef.current
            for (let i = 0; i < sampledPairs.length; i += BATCH_SIZE) {
                const batch = sampledPairs.slice(i, i + BATCH_SIZE)
                const batchPromises = batch.map(async (pair) => {
                    const cacheKey = `${pair[0].lat.toFixed(6)},${pair[0].lng.toFixed(6)}|${pair[1].lat.toFixed(6)},${pair[1].lng.toFixed(6)}`
                    let segments = getCachedData(cacheKey)

                    if (!segments) {
                        try {
                            const raw = await getMapboxTrafficForSegment([pair[0].lng, pair[0].lat], [pair[1].lng, pair[1].lat], resolvedToken)
                            if (raw?.length) {
                                segments = raw.slice(0, 4) // sample limit
                                setCachedData(cacheKey, segments)
                            }
                        } catch (err) {
                            // Ukraine Traffic fallback
                            try {
                                const historical = await getUkraineTrafficForRoute([[pair[0].lng, pair[0].lat], [pair[1].lng, pair[1].lat]], resolvedToken, { fallbackToHistorical: true })
                                if (historical?.length) {
                                    segments = [{
                                        congestion: historical[0].congestion, speed: historical[0].currentSpeed,
                                        delay: historical[0].delayMinutes * 60, distance: 0, duration: 0,
                                        coordinates: [[pair[0].lng, pair[0].lat], [pair[1].lng, pair[1].lat]]
                                    }]
                                    setCachedData(cacheKey, segments)
                                }
                            } catch { }
                        }
                    }
                    return { data: segments, key: cacheKey }
                })

                const results = await Promise.all(batchPromises)
                results.forEach(res => {
                    if (res.data) {
                        res.data.forEach((seg, idx) => {
                            const key = `${res.key}#${idx}`
                            const existing = store.get(key)
                            const history = (existing?.history || []).slice(-9)
                            history.push({ timestamp: nowTs, congestion: seg.congestion, speed: seg.speed })
                            store.set(key, { ...seg, timestamp: nowTs, history, key })
                        })
                    }
                })

                setLoadingProgress({ current: Math.min(i + BATCH_SIZE, sampledPairs.length), total: sampledPairs.length })
                if (i + BATCH_SIZE < sampledPairs.length) await new Promise(r => setTimeout(r, BATCH_DELAY))
            }

            const allSegments = Array.from(store.values())
            onDataUpdate(allSegments, nowTs)
            lastPersistedTimestampRef.current = nowTs

            if (typeof window !== 'undefined') {
                localStorage.setItem(segmentsStorageKey, JSON.stringify({ timestamp: nowTs, segments: allSegments }))
            }
        } catch (err) {
            setError('Failed to load traffic data')
        } finally {
            setLoading(false)
        }
    }, [resolvedToken, pairsToCheck, denseSampling, getCachedData, setCachedData, onDataUpdate, segmentsStorageKey])

    return { loading, error, loadingProgress, fetchTraffic }
}
