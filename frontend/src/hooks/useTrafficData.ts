import { useState, useCallback, useRef } from 'react'
import {
    getMapboxTraffic,
    MapboxTrafficData
} from '../utils/maps/mapboxTrafficAPI'

export interface LatLng { lat: number; lng: number }

export interface TrafficSegmentWithHistory extends MapboxTrafficData {
    timestamp: number
    history?: Array<{ timestamp: number; congestion: number; speed: number }>
    key?: string
}

const REFRESH_INTERVAL_MS = 30 * 60 * 1000
const MAPBOX_WAYPOINT_LIMIT = 25
const BATCH_DELAY = 1000 // Increase delay to be safe with rate limits

export const useTrafficData = (
    waypoints: LatLng[],
    resolvedToken: string,
    _denseSampling: boolean,
    segmentsStorageKey: string,
    _trafficCacheStorageKey: string, // Kept for signature compatibility if needed
    onDataUpdate: (segments: TrafficSegmentWithHistory[], timestamp: number) => void
) => {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 })
    const segmentStoreRef = useRef<Map<string, TrafficSegmentWithHistory>>(new Map())
    const lastPersistedTimestampRef = useRef<number>(0)

    const fetchTraffic = useCallback(async (options?: { force?: boolean }) => {
        if (!resolvedToken || !waypoints?.length) return
        const nowTs = Date.now()

        if (!options?.force && lastPersistedTimestampRef.current && nowTs - lastPersistedTimestampRef.current < REFRESH_INTERVAL_MS) {
            return
        }

        setLoading(true)
        setError(null)

        // Split waypoints into groups of 25
        const batches: LatLng[][] = []
        for (let i = 0; i < waypoints.length; i += MAPBOX_WAYPOINT_LIMIT) {
            batches.push(waypoints.slice(i, i + MAPBOX_WAYPOINT_LIMIT))
        }

        setLoadingProgress({ current: 0, total: batches.length })

        try {
            const store = segmentStoreRef.current
            // Optional: clear store on "force" refresh if desired, 
            // but keeping history might be better. 
            // For full sector coverage update, we just overwrite by key.

            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i]
                if (batch.length < 2) continue

                try {
                    const coords: Array<[number, number]> = batch.map(p => [p.lng, p.lat])
                    const segments = await getMapboxTraffic(coords, resolvedToken)

                    if (segments && segments.length > 0) {
                        segments.forEach((seg, idx) => {
                            // Create a stable key based on coordinates
                            const start = seg.coordinates[0]
                            const key = `batch_${i}_seg_${idx}_${start[0].toFixed(5)},${start[1].toFixed(5)}`

                            const existing = store.get(key)
                            const history = (existing?.history || []).slice(-9)
                            history.push({
                                timestamp: nowTs,
                                congestion: seg.congestion,
                                speed: seg.speed
                            })

                            store.set(key, { ...seg, timestamp: nowTs, history, key })
                        })
                    }
                } catch (err) {
                    console.error('Batch traffic fetch error:', err)
                }

                setLoadingProgress({ current: i + 1, total: batches.length })
                if (i < batches.length - 1) {
                    await new Promise(r => setTimeout(r, BATCH_DELAY))
                }
            }

            const allSegments = Array.from(store.values())
            onDataUpdate(allSegments, nowTs)
            lastPersistedTimestampRef.current = nowTs

            if (typeof window !== 'undefined') {
                localStorage.setItem(segmentsStorageKey, JSON.stringify({
                    timestamp: nowTs,
                    segments: allSegments
                }))
            }
        } catch (err) {
            setError('Failed to load traffic data')
        } finally {
            setLoading(false)
        }
    }, [resolvedToken, waypoints, onDataUpdate, segmentsStorageKey])

    return { loading, error, loadingProgress, fetchTraffic }
}
