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
import { robustGeocodingService } from '../services/robust-geocoding/RobustGeocodingService'
import { routeOptimizationCache } from '../utils/routes/routeOptimizationCache'
import { routeHistory } from '../utils/routes/routeHistory'
import { runRoutePlanningAlgorithm } from '../utils/routes/routePlanAlgorithm'
import { calculateRouteAnalytics } from '../utils/routes/routeAnalytics'
import { generateRouteNotifications } from '../utils/ui/notifications'
import { isValidAddress } from '../utils/data/orderEnrichment'
import { localStorageUtils } from '../utils/ui/localStorage'
import { GenerouteService } from '../services/generouteService'

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
    selectedZones: string[] = [],
    cachedHubPolygons: any[] = [],
    cachedAllKmlPolygons: any[] = [],
    setPlannedRoutes: (routes: any[]) => void,
    setErrorMsg: (msg: string | null) => void,
    setPlanTrafficImpact: (impact: any) => void,
    setLastPlanPreset: (preset: any) => void,
    setRouteAnalytics: (analytics: any) => void
) => {
    const [isPlanning, setIsPlanning] = useState(false)
    const [optimizationProgress, setOptimizationProgress] = useState<OptimizationProgress | null>(null)

    // --- Sync KML context before planning ---
    const syncKmlContext = useCallback(() => {
        const buildPolygon = (p: any) => ({
            key: `${(p.folderName || '').trim()}:${(p.name || '').trim()}`,
            name: p.name || '',
            folderName: p.folderName || '',
            path: p.path,
        })
        robustGeocodingService.setZoneContext({
            allPolygons: (cachedAllKmlPolygons || []).map(buildPolygon),
            activePolygons: (cachedHubPolygons || []).map(buildPolygon),
            selectedZoneKeys: selectedZones || [],
        })
        robustGeocodingService.setCityBias(localStorageUtils.getAllSettings()?.cityBias || 'Киев')
    }, [cachedAllKmlPolygons, cachedHubPolygons, selectedZones])

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

        // 1. Sync KML context to ensure geocoding respects active/selected zones
        syncKmlContext()

        try {
            // Google Maps loader removed

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
                const appSettings = localStorageUtils.getAllSettings()
                const generouteKey = appSettings.generouteApiKey
                
                // Redirect all routing to free providers
                const rawLocations = []
                
                if (includeStartEnd) {
                    const sLat = defaultStartLat ? Number(defaultStartLat) : null;
                    const sLng = defaultStartLng ? Number(defaultStartLng) : null;
                    if (sLat && sLng) {
                        rawLocations.push({ lat: sLat, lng: sLng });
                    } else {
                        const startCoords = routeOptimizationCache.getCoordinates(startAddr)
                        if (startCoords) rawLocations.push(startCoords)
                        else {
                            const res = await GeocodingService.geocodeAddressMulti(startAddr)
                            if (res[0]?.success) rawLocations.push({ lat: res[0].latitude, lng: res[0].longitude })
                        }
                    }
                }

                chain.forEach(o => {
                    const coords = o.coords || routeOptimizationCache.getCoordinates(o.address)
                    if (coords) rawLocations.push(coords)
                })

                if (includeStartEnd) {
                    const eLat = defaultEndLat ? Number(defaultEndLat) : null;
                    const eLng = defaultEndLng ? Number(defaultEndLng) : null;
                    if (eLat && eLng) {
                        rawLocations.push({ lat: eLat, lng: eLng });
                    } else {
                        const endCoords = routeOptimizationCache.getCoordinates(endAddr)
                        if (endCoords) rawLocations.push(endCoords)
                        else {
                            const res = await GeocodingService.geocodeAddressMulti(endAddr)
                            if (res[0]?.success) rawLocations.push({ lat: res[0].latitude, lng: res[0].longitude })
                        }
                    }
                }

                const locations: { lat: number; lng: number }[] = rawLocations.filter(l => typeof l.lat === 'number' && typeof l.lng === 'number') as any

                if (locations.length < 2) return { feasible: false }
                
                const yapikoUrl = appSettings.yapikoOsrmUrl

                // 1. Try Yapiko OSRM if it's the selected provider
                if (appSettings.routingProvider === 'yapiko_osrm' && yapikoUrl) {
                  try {
                    const { YapikoOSRMService } = await import('../services/YapikoOSRMService')
                    const res = await YapikoOSRMService.calculateRoute(locations, yapikoUrl)
                    if (res.feasible) return res
                  } catch (e) {
                     console.warn('[AutoPlanner] Yapiko OSRM failed fallback to others:', e)
                  }
                }

                // 2. Try Valhalla (supports vehicle costing)
                try {
                    const { ValhallaService } = await import('../services/valhallaService')
                    const res = await ValhallaService.calculateRoute(locations)
                    if (res.feasible) return res
                } catch {}

                // 3. Try OSRM / Generoute
                try {
                    const res = await GenerouteService.calculateRoute(locations, generouteKey)
                    return res
                } catch {
                    return { feasible: false }
                }
            }

            const apiManager = new GoogleAPIManager({
                checkChainFeasible,
                defaultStartAddress: startAddr,
                defaultEndAddress: endAddr,
                maxDistanceKm: optimizedSettings.maxDistanceBetweenOrdersKm,
                maxReadyTimeDiffMinutes: optimizedSettings.maxReadyTimeDifferenceMinutes
            })

            // Geocoding
            // setOptimizationProgress({ current: 0, total: validOrders.length, message: 'Геокодирование...' }) // Removed
            const addresses = Array.from(new Set(validOrders.map(o => o.address).filter(Boolean)))

            // Parallel Quantum Geocoding (v36.8)
            setOptimizationProgress({ current: 0, total: addresses.length, message: 'Квантовый геокодинг (Параллельно)...' })
            
            const geocodeRequests = addresses.map(addr => {
                const orderForAddr = validOrders.find(o => (o.address || o.raw?.address || '') === addr);
                const expectedDeliveryZone = orderForAddr?.sector || orderForAddr?.deliveryZone;
                return { 
                    address: addr, 
                    options: { 
                        silent: true, 
                        expectedDeliveryZone 
                    } 
                };
            });

            const resultsMap = await robustGeocodingService.batchGeocode(geocodeRequests);
            
            // Map results to optimization cache
            resultsMap.forEach((result, key) => {
                if (result.best && result.best.score > -900000) { // Respect "Iron Dome"
                    // Find original address from input list to ensure cache sync
                    const originalAddr = addresses.find(a => a.trim().toLowerCase() === key);
                    if (originalAddr) {
                        routeOptimizationCache.setCoordinates(originalAddr, {
                            lat: result.best.lat,
                            lng: result.best.lng
                        });
                    }
                }
            });

            setOptimizationProgress({
                current: addresses.length,
                total: addresses.length,
                message: `Геокодинг завершен (${addresses.length} адресов)`
            });

            // Parallel geocode start/end addresses (v36.8)
            const specialAddresses = [startAddr, endAddr].filter(a => a && !routeOptimizationCache.getCoordinates(a));
            if (specialAddresses.length > 0) {
                console.log('[Quantum Planning] Geocoding special addresses:', specialAddresses);
                const results = await GeocodingService.geocodeAddresses(specialAddresses, { region: 'ua' });
                results.forEach((res, i) => {
                    const addr = specialAddresses[i];
                    if (res.success && res.latitude && res.longitude) {
                        routeOptimizationCache.setCoordinates(addr, { lat: res.latitude, lng: res.longitude });
                    }
                });
            }

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

            // Strict filter: EXCLUDE any order whose address failed our zone-aware geocoding (i.e. not in cache)
            // This prevents Google Directions API from falling back to raw strings and bypassing zone rejection.
            const routeableOrders = validOrders.filter(o => {
                const addr = o.address || o.raw?.address || '';
                const hasCoords = !!routeOptimizationCache.getCoordinates(addr);
                if (!hasCoords) {
                    console.warn(`[AutoPlanner] Отклонен адрес вне зон: ${addr}`);
                }
                return hasCoords;
            });

            if (routeableOrders.length === 0) {
                setErrorMsg('Ни один из заказов не попал в активную зону доставки. Все адреса были отклонены как находящиеся вне КML зон.');
                setIsPlanning(false);
                setOptimizationProgress(null);
                return;
            }

            const finalRoutes = await runRoutePlanningAlgorithm(routeableOrders, {
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
        defaultStartAddress, defaultStartLat, defaultStartLng, defaultEndAddress,
        defaultEndLat, defaultEndLng,
        selectedZones, cachedHubPolygons, cachedAllKmlPolygons,
        setPlannedRoutes, setRouteAnalytics, setPlanTrafficImpact, setErrorMsg, setIsPlanning, setOptimizationProgress,
        setLastPlanPreset, getPreset, getPresetMode, syncKmlContext
    ])

    return { isPlanning, optimizationProgress, planRoutes }
}
