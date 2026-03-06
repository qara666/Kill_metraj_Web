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
    trafficModeOverride: 'auto' | TrafficPresetMode | null = null,
    maxStopsPerRoute: number = 20,
    maxRouteDurationMin: number = 480,
    maxRouteDistanceKm: number = 100,
    maxOrdersPerCourier: number = 50,
    defaultStartAddress: string = '', // Default fallback
    defaultStartLat: number | null = null,
    defaultStartLng: number | null = null,
    defaultEndAddress: string = '',   // Default fallback
    defaultEndLat: number | null = null,
    defaultEndLng: number | null = null,
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
        if (trafficModeOverride && trafficModeOverride !== 'auto') return trafficModeOverride;
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

            const startAddr = defaultStartAddress.trim()
            const endAddr = defaultEndAddress.trim()

            if (!startAddr || !endAddr) {
                setErrorMsg('Не задан адрес старта или финиша. Пожалуйста, настройте адреса в Админ-панели или выберите хаб (если в KML есть маркер Базы).')
                setIsPlanning(false)
                setOptimizationProgress(null)
                return
            }

            const checkChainFeasible = async (chain: any[], includeStartEnd: boolean = true) => {
                const gmaps = window.google.maps
                const directionsService = new gmaps.DirectionsService()

                let origin: any = includeStartEnd ? startAddr : chain[0].address
                let destination: any = includeStartEnd ? endAddr : chain[chain.length - 1].address

                // Try to use cached coordinates for start/end to ensure consistency with our geocoder
                // PRIORITY: 1. Passed explicitly from settings, 2. Cached
                if (includeStartEnd) {
                    const sLat = defaultStartLat ? Number(defaultStartLat) : null;
                    const sLng = defaultStartLng ? Number(defaultStartLng) : null;
                    
                    if (sLat && sLng) {
                         origin = new gmaps.LatLng(sLat, sLng);
                    } else {
                        const startCoords = routeOptimizationCache.getCoordinates(startAddr)
                        if (startCoords) {
                            origin = new gmaps.LatLng(startCoords.lat, startCoords.lng)
                        }
                    }

                    const eLat = defaultEndLat ? Number(defaultEndLat) : null;
                    const eLng = defaultEndLng ? Number(defaultEndLng) : null;
                    
                    if (eLat && eLng) {
                         destination = new gmaps.LatLng(eLat, eLng);
                    } else {
                        const endCoords = routeOptimizationCache.getCoordinates(endAddr)
                        if (endCoords) {
                            destination = new gmaps.LatLng(endCoords.lat, endCoords.lng)
                        }
                    }
                }

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

            // Explicitly geocode start/end addresses to ensure they are cached and valid
            // This is critical for DirectionsService to work correctly with ambiguous addresses
            await (async () => {
                if (startAddr && !routeOptimizationCache.getCoordinates(startAddr)) {
                    console.log('Geocoding start address:', startAddr)
                    const res = await GeocodingService.geocodeAndCleanAddress(startAddr, { region: 'ua' })
                    if (res.success && res.latitude && res.longitude) {
                        routeOptimizationCache.setCoordinates(startAddr, { lat: res.latitude, lng: res.longitude })
                    }
                }
                if (endAddr && !routeOptimizationCache.getCoordinates(endAddr)) {
                    console.log('Geocoding end address:', endAddr)
                    const res = await GeocodingService.geocodeAndCleanAddress(endAddr, { region: 'ua' })
                    if (res.success && res.latitude && res.longitude) {
                        routeOptimizationCache.setCoordinates(endAddr, { lat: res.latitude, lng: res.longitude })
                    }
                }
            })()

            // Define depotCoords prioritizing explicit input
            let depotCoords = null;
            // Parse to avoid string errors
            const sLat = defaultStartLat ? Number(defaultStartLat) : null;
            const sLng = defaultStartLng ? Number(defaultStartLng) : null;
            const eLat = defaultEndLat ? Number(defaultEndLat) : null;
            const eLng = defaultEndLng ? Number(defaultEndLng) : null;

            if (sLat && sLng) {
                depotCoords = { lat: sLat, lng: sLng };
            } else {
                depotCoords = routeOptimizationCache.getCoordinates(startAddr || 'Киев') || null;
            }

            if (!depotCoords) {
                setErrorMsg('Не удалось определить координаты точки старта (Базы). Убедитесь, что адрес геокодирован.');
                setIsPlanning(false);
                setOptimizationProgress(null);
                return;
            }

            let endCoords = null;
            if (eLat && eLng) {
                endCoords = { lat: eLat, lng: eLng };
            } else if (endAddr !== startAddr) {
                endCoords = routeOptimizationCache.getCoordinates(endAddr || 'Киев') || null;
            } else {
                endCoords = depotCoords;
            }

            if (!endCoords) {
                setErrorMsg('Не удалось определить координаты точки финиша. Убедитесь, что адрес геокодирован.');
                setIsPlanning(false);
                setOptimizationProgress(null);
                return;
            }

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
                endCoords,
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
        defaultStartAddress, defaultStartLat, defaultStartLng, defaultEndAddress, defaultEndLat, defaultEndLng,
        setPlannedRoutes, setRouteAnalytics, setPlanTrafficImpact, setErrorMsg, setIsPlanning, setOptimizationProgress,
        setLastPlanPreset, getPreset, getPresetMode
    ])

    return { isPlanning, optimizationProgress, planRoutes }
}
