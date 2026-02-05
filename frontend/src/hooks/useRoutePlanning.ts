import { useState, useCallback, useMemo } from 'react'
import {
    type RoutePlanningSettings,
    type TrafficSnapshot,
    type TrafficPresetInfo,
    type TrafficPresetMode,
    type Order
} from '../types'

export type { TrafficPresetMode }
import { GoogleAPIManager } from '../utils/api/googleAPIManager'
import { GeocodingService } from '../services/geocodingService'
import { routeOptimizationCache } from '../utils/routes/routeOptimizationCache'
import { routeHistory } from '../utils/routes/routeHistory'
import { runRoutePlanningAlgorithm } from '../utils/routes/routePlanAlgorithm'
import { calculateRouteAnalytics } from '../utils/routes/routeAnalytics'
import { generateRouteNotifications } from '../utils/ui/notifications'
import { googleMapsLoader } from '../utils/maps/googleMapsLoader'
import { isValidAddress } from '../utils/data/orderEnrichment'

// --- Interfaces & Types ---

export interface OptimizationProgress {
    current: number
    total: number
    message: string
}

// --- Hook ---

export const useRoutePlanning = (
    orders: Order[] | null,
    settings: RoutePlanningSettings,
    trafficSnapshotRef: React.MutableRefObject<TrafficSnapshot | null>,
    filteredOrders: Order[],
    notificationPreferences: any,
    trafficModeOverride: 'auto' | 'moderate' | 'heavy' | null = null,
    maxStopsPerRoute: number = 20,
    maxRouteDurationMin: number = 480,
    maxRouteDistanceKm: number = 100,
    maxOrdersPerCourier: number = 50,
    defaultStartAddress: string = 'г. Киев, ул. Большая Васильковская, 100', // Default fallback
    defaultEndAddress: string = 'г. Киев, ул. Большая Васильковская, 100',   // Default fallback
    setPlannedRoutes: (routes: any[]) => void,
    setErrorMsg: (msg: string | null) => void,
    setPlanTrafficImpact: (impact: any) => void,
    setLastPlanPreset: (preset: any) => void,
    setRouteAnalytics: (analytics: any) => void
) => {
    const [isPlanning, setIsPlanning] = useState(false)
    const [optimizationProgress, setOptimizationProgress] = useState<OptimizationProgress | null>(null)

    const runtimeMaxStopsPerRoute = useMemo(() => Math.max(maxStopsPerRoute, maxOrdersPerCourier), [maxStopsPerRoute, maxOrdersPerCourier])
    const runtimeMaxRouteDurationMin = maxRouteDurationMin
    const runtimeMaxRouteDistanceKm = maxRouteDistanceKm

    const getPresetMode = useCallback((): TrafficPresetMode => {
        const snapshot = trafficSnapshotRef.current;
        if (trafficModeOverride && trafficModeOverride !== 'auto') return trafficModeOverride as TrafficPresetMode;
        if (!snapshot) return 'free';
        const avgSpeed = snapshot.stats.avgSpeed;
        const slowShare = snapshot.stats.slowSharePercent ?? 0;
        if (avgSpeed < 18 || slowShare >= 55) return 'gridlock';
        if (avgSpeed < 28 || slowShare >= 35) return 'busy';
        return 'free';
    }, [trafficModeOverride, trafficSnapshotRef]);

    const getPreset = useCallback((mode: TrafficPresetMode): TrafficPresetInfo => {
        const defaults = { maxStops: runtimeMaxStopsPerRoute, maxDuration: runtimeMaxRouteDurationMin, maxDistance: runtimeMaxRouteDistanceKm }
        if (mode === 'gridlock') return {
            mode, bufferMinutes: 20, groupingMultiplier: 0.6, recommendedMaxStops: 6,
            maxRouteDurationCap: 240, maxDistanceCap: 20, note: 'Gridlock', reliability: 0.4, slowSharePercent: 60
        }
        if (mode === 'busy') return {
            mode, bufferMinutes: 12, groupingMultiplier: 0.8, recommendedMaxStops: 9,
            maxRouteDurationCap: 210, maxDistanceCap: 30, note: 'Busy', reliability: 0.7, slowSharePercent: 30
        }
        return {
            mode: 'free', bufferMinutes: 5, groupingMultiplier: 1.0, recommendedMaxStops: defaults.maxStops,
            maxRouteDurationCap: defaults.maxDuration, maxDistanceCap: defaults.maxDistance, note: 'Free', reliability: 0, slowSharePercent: 0
        }
    }, [runtimeMaxStopsPerRoute, runtimeMaxRouteDurationMin, runtimeMaxRouteDistanceKm])

    const planRoutes = useCallback(async () => {
        if (!orders || orders.length === 0) {
            setErrorMsg('Загрузите файл с заказами')
            return
        }

        const validOrders = ((filteredOrders && filteredOrders.length > 0) ? filteredOrders : []).filter(o => {
            const addr = o.address || o.raw?.address || '';
            return isValidAddress(addr);
        });

        if (validOrders.length === 0) {
            setErrorMsg('Нет валидных заказов для планирования (проверьте адреса)')
            return
        }

        setIsPlanning(true)
        setErrorMsg(null)
        setOptimizationProgress({ current: 0, total: validOrders.length, message: 'Инициализация...' })

        try {
            await googleMapsLoader.load()

            const optimizedSettings = Object.freeze({
                ...settings,
                minRouteEfficiency: settings.minRouteEfficiency || 0.5,
                maxReadyTimeDifferenceMinutes: settings.maxReadyTimeDifferenceMinutes || 60,
                maxDistanceBetweenOrdersKm: settings.maxDistanceBetweenOrdersKm || 15
            })

            const startAddr = defaultStartAddress.trim() || 'г. Киев, ул. Большая Васильковская, 100'
            const endAddr = defaultEndAddress.trim() || 'г. Киев, ул. Большая Васильковская, 100'

            const checkChainFeasible = async (chain: any[], includeStartEnd: boolean = true) => {
                const gmaps = window.google.maps
                const directionsService = new gmaps.DirectionsService()
                const origin = includeStartEnd ? startAddr : chain[0].address
                const destination = includeStartEnd ? endAddr : chain[chain.length - 1].address
                const waypoints = includeStartEnd
                    ? chain.map(n => ({ location: n.address, stopover: true }))
                    : chain.slice(1, -1).map(n => ({ location: n.address, stopover: true }))

                return new Promise<any>((resolve) => {
                    directionsService.route({
                        origin, destination, waypoints: waypoints.length > 0 ? waypoints : undefined,
                        travelMode: gmaps.TravelMode.DRIVING,
                        drivingOptions: {
                            departureTime: new Date(),
                            trafficModel: gmaps.TravelModel.PESSIMISTIC
                        }
                    }, (r: any, status: any) => {
                        if (status === 'OK' && r?.routes[0]) {
                            const legs = r.routes[0].legs
                            const durTraffic = legs.reduce((acc: number, l: any) => acc + (l.duration_in_traffic?.value || l.duration?.value || 0), 0)
                            const durPure = legs.reduce((acc: number, l: any) => acc + (l.duration?.value || 0), 0)
                            const dist = legs.reduce((acc: number, l: any) => acc + (l.distance?.value || 0), 0)
                            resolve({
                                feasible: true,
                                legs,
                                totalDuration: durTraffic,
                                pureDuration: durPure,
                                totalDistance: dist
                            })
                        } else resolve({ feasible: false })
                    })
                })
            }

            const apiManager = new GoogleAPIManager({
                checkChainFeasible,
                defaultStartAddress: startAddr,
                defaultEndAddress: endAddr,
                maxDistanceKm: optimizedSettings.maxDistanceBetweenOrdersKm,
                maxReadyTimeDiffMinutes: optimizedSettings.maxReadyTimeDifferenceMinutes
            })

            // Geocoding
            setOptimizationProgress({ current: 0, total: validOrders.length, message: 'Геокодирование...' })
            const addresses = Array.from(new Set(validOrders.map(o => o.address).filter(Boolean)))

            for (let i = 0; i < addresses.length; i++) {
                const addr = addresses[i]
                if (!routeOptimizationCache.getCoordinates(addr)) {
                    const result = await GeocodingService.geocodeAndCleanAddress(addr, { region: 'ua' })
                    if (result.success && result.latitude && result.longitude) {
                        routeOptimizationCache.setCoordinates(addr, {
                            lat: result.latitude,
                            lng: result.longitude
                        })
                    }
                }

                if (i % 5 === 0 || i === addresses.length - 1) {
                    setOptimizationProgress({
                        current: i + 1,
                        total: addresses.length,
                        message: `Геокодирование... (${i + 1}/${addresses.length})`
                    })
                }
            }

            const depotCoords = routeOptimizationCache.getCoordinates(startAddr)
            const mode = getPresetMode()
            const preset = getPreset(mode)
            setLastPlanPreset(preset)

            const finalRoutes = await runRoutePlanningAlgorithm(validOrders, {
                apiManager,
                runtimeMaxStopsPerRoute,
                runtimeMaxRouteDurationMin,
                runtimeMaxRouteDistanceKm,
                optimizedSettings,
                trafficSnapshot: trafficSnapshotRef.current,
                depotCoords,
                defaultStartAddress: startAddr,
                defaultEndAddress: endAddr,
                setOptimizationProgress
            });

            setPlannedRoutes(finalRoutes)

            if (finalRoutes.length > 0) {
                const analytics = calculateRouteAnalytics(finalRoutes)
                setRouteAnalytics(analytics)

                routeHistory.save(finalRoutes, {
                    maxRouteDurationMin: runtimeMaxRouteDurationMin,
                    maxRouteDistanceKm: runtimeMaxRouteDistanceKm,
                    maxStopsPerRoute: runtimeMaxStopsPerRoute,
                    trafficMode: mode,
                    ...settings
                }, {
                    totalRoutes: finalRoutes.length,
                    totalOrders: finalRoutes.reduce((s: number, r: any) => s + r.stopsCount, 0),
                    totalDistance: finalRoutes.reduce((s: number, r: any) => s + (r.totalDistance || 0), 0) / 1000,
                    totalDuration: finalRoutes.reduce((s: number, r: any) => s + (r.totalDuration || 0), 0) / 60,
                    avgEfficiency: 0
                })

                setPlanTrafficImpact({
                    totalDelay: finalRoutes.reduce((s: number, r: any) => s + (r.totalTrafficDelay || 0), 0),
                    criticalRoutes: finalRoutes.filter((r: any) => r.hasCriticalTraffic).length,
                    avgSegmentSpeed: trafficSnapshotRef.current?.stats.avgSpeed || 0,
                    presetMode: mode,
                    bufferMinutes: preset.bufferMinutes
                })

                // Notifications
                for (const route of finalRoutes) {
                    try {
                        generateRouteNotifications(route, notificationPreferences)
                    } catch (err) { console.error('Notification error', err) }
                }
            } else {
                setPlanTrafficImpact(null)
                setErrorMsg('Не удалось создать маршруты')
            }

        } catch (e: any) {
            console.error('Planning error:', e)
            setErrorMsg(`Ошибка: ${e.message} `)
        } finally {
            setIsPlanning(false)
            setOptimizationProgress(null)
        }
    }, [
        orders, filteredOrders, settings, runtimeMaxStopsPerRoute, runtimeMaxRouteDurationMin,
        runtimeMaxRouteDistanceKm, trafficModeOverride, trafficSnapshotRef, notificationPreferences,
        defaultStartAddress, defaultEndAddress,
        setPlannedRoutes, setRouteAnalytics, setPlanTrafficImpact, setErrorMsg, setIsPlanning, setOptimizationProgress,
        setLastPlanPreset, getPreset, getPresetMode
    ])

    return { isPlanning, optimizationProgress, planRoutes }
}
