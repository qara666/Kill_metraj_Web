import { useMemo, useCallback } from 'react'

export interface TrafficStats {
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
}

export interface TrafficHistoryEntry {
    timestamp: number
    avgSpeed: number
    totalDelay: number
    criticalCount: number
}

export const useTrafficAnalytics = (trafficStats: TrafficStats | null, trafficHistory: TrafficHistoryEntry[]) => {
    const trafficMood = useMemo(() => {
        if (!trafficStats) return null
        if (trafficStats.avgSpeed < 18 || trafficStats.criticalCount >= 6 || trafficStats.slowSharePercent >= 55) return 'gridlock'
        if (trafficStats.avgSpeed < 28 || trafficStats.highCount >= 6 || trafficStats.slowSharePercent >= 35) return 'busy'
        return 'free'
    }, [trafficStats])

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

    return {
        trafficMood,
        severityDistribution,
        historyChartData
    }
}
