/**
 * useRouteGeocoding — Route distance calculation with heavily optimized API usage.
 *
 * COST OPTIMIZATIONS (v2):
 *  1. Early-exit: stops variant search on first ROOFTOP hit inside the delivery zone
 *  2. Suppresses `researchExhaustive()` when a perfect hit is already found
 *  3. Waypoint address deduplication — identical addresses share a single geocode result
 *  4. Start/end address coordinate pin — if coordinates are stored in settings, zero geocode calls
 *  5. All results backed by persistent googleApiCache (survives page reloads)
 *  6. Main-thread yielding between geocoding iterations to keep UI responsive
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { robustGeocodingService } from '../services/robust-geocoding/RobustGeocodingService'
import { distanceBetween } from '../services/robust-geocoding/candidateScoring'
import { Route } from '../types/route'

/** Yield control back to the browser event loop. Prevents UI jank during heavy loops. */
const yieldToMain = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

interface UseRouteGeocodingProps {
    settings: any
    selectedHubs: string[]
    selectedZones: string[]
    cachedHubPolygons: any[]
    cachedAllKmlPolygons: any[]
    confirmAddresses: boolean
    updateExcelData: (fn: (prev: any) => any) => void
    setShowCorrectionModal: (show: boolean) => void
    setShowBatchPanel: (show: boolean) => void
    startAddress: string
    endAddress: string
    cleanAddressForRoute: (raw: string) => string
}

export const useRouteGeocoding = ({
    settings,
    selectedZones,
    cachedHubPolygons,
    cachedAllKmlPolygons,
    confirmAddresses,
    updateExcelData,
    setShowCorrectionModal: _setShowCorrectionModal,
    setShowBatchPanel: _setShowBatchPanel,
    cleanAddressForRoute
}: UseRouteGeocodingProps) => {
    const [isCalculating, setIsCalculating] = useState(false)
    const [calcProgress, setCalcProgress] = useState(0)
    const disambQueue = useRef<Array<{ title: string; options: any[]; resolve: (val: any) => void }>>([])
    const isProcessingQueue = useRef(false)
    const [disambModal, setDisambModal] = useState<{ open: boolean; title: string; options: any[] } | null>(null)
    const disambResolver = useRef<(choice: any | null) => void>()

    // ─── Sync KML context into the singleton service ─────────────────────────
    useEffect(() => {
        const buildPolygon = (p: any) => ({
            key: `${(p.folderName || '').trim()}:${(p.name || '').trim()}`,
            name: p.name || '',
            folderName: p.folderName || '',
            path: p.path,
            bounds: p.bounds,
        })
        robustGeocodingService.setZoneContext({
            allPolygons: cachedAllKmlPolygons.map(buildPolygon),
            activePolygons: cachedHubPolygons.map(buildPolygon),
            selectedZoneKeys: selectedZones,
        })
        robustGeocodingService.setCityBias(settings?.cityBias || 'Киев')
    }, [cachedAllKmlPolygons, cachedHubPolygons, selectedZones, settings?.cityBias])

    // ─── Helpers ────────────────────────────────────────────────────────────────

    const extractHouseNumber = (raw: string): string | null => {
        if (!raw) return null
        // Capture floor/apt range or complex numbers: 18/14, 15б
        const m = raw.match(/\b\d+[а-яА-ЯёЁіІєЄґҐa-zA-Z]*(?:[\/\-]\d*[а-яА-ЯёЁіІєЄґҐa-zA-Z]*)?\b/u)
        return m ? m[0].toLowerCase() : null
    }

    const processDisambQueue = useCallback(async () => {
        if (isProcessingQueue.current || disambQueue.current.length === 0) return
        isProcessingQueue.current = true

        while (disambQueue.current.length > 0) {
            const next = disambQueue.current.shift()!
            const choice = await new Promise(resolve => {
                setDisambModal({ open: true, title: next.title, options: next.options })
                disambResolver.current = resolve
            })
            setDisambModal(null)
            next.resolve(choice)
        }

        isProcessingQueue.current = false
    }, [])

    /**
     * SOTA 5.68: Robust geocoding with centralized service and zone validation.
     */
    const robustGeocode = async (rawAddress: string, options: { hintPoint?: any; silent?: boolean; strictZoneFallback?: boolean; expectedDeliveryZone?: string | null; addressGeoStr?: string } = {}): Promise<any | null> => {
        const { hintPoint, silent = false, strictZoneFallback = true, expectedDeliveryZone = null, addressGeoStr } = options
        const cityBias = settings.cityBias || 'Киев'

        // 1. Delegate core logic to the central service
        const result = await robustGeocodingService.geocode(rawAddress, {
            hintPoint,
            cityBias,
            silent: silent || !confirmAddresses,
            expectedDeliveryZone,
            addressGeoStr
        })

        const best = result.best
        if (!best) return null

        const toLocLocal = (res: any): any => {
            if (!res?.geometry?.location) return null
            const loc = res.geometry.location
            return { lat: Number(loc.lat), lng: Number(loc.lng) }
        }

        // v35.9.14: Suspect Jump Protection (Iron Curtain)
        // If the best hit is far (>15km) but there are other candidates much closer (<7km),
        // we FORCE clarity even if confirmAddresses is off.
        let suspectJump = false
        if (hintPoint && result.allCandidates.length > 1) {
            const bestCoords = toLocLocal(best.raw)
            const bestDist = bestCoords ? distanceBetween(bestCoords, hintPoint) : 0
            if (bestDist > 15000) {
                const hasMuchCloser = result.allCandidates.some((c: any) => {
                    const d = distanceBetween({ lat: c.lat, lng: c.lng }, hintPoint)
                    return d < 7000 && c.score > -200000 
                })
                if (hasMuchCloser) {
                    suspectJump = true
                    console.warn(`[Расчет] ПОДОЗРИТЕЛЬНЫЙ ПРЫЖОК: дистанция=${(bestDist / 1000).toFixed(1)}км. Требуется уточнение.`)
                }
            }
        }

        if (!suspectJump && (silent || !confirmAddresses)) {
            // v35.9.26: Relaxed threshold for non-silent mode. 
            // If we are in "confirmAddresses" mode, we want the user to see candidates 
            // even if they were penalized by Lockdown (-2M), so they can confirm them manually.
            // Catastrophic rejection (-5M+) still returns null.
            if (strictZoneFallback && best.score < -5000000) return null
            return best
        }

        // 3. If confirmation is required OR suspect jump detected
        const expectedHouse = extractHouseNumber(rawAddress)
        const streetNum = (best.raw.address_components || []).find(c => c.types.includes('street_number'))?.long_name
        const houseMatched = !expectedHouse || (streetNum && streetNum.toLowerCase() === expectedHouse.toLowerCase())

        const isSuspicious = !houseMatched || !best.isInsideZone || best.isTechnicalZone

        if (!isSuspicious && result.allCandidates.length <= 1) {
            return best
        }

        // 4. Disambiguation modal
        const modalOptions = result.allCandidates
            .map((c: any) => {
                const lat = c.lat
                const lng = c.lng
                const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`
                const isActive = c.isInsideZone
                const dist = hintPoint ? distanceBetween({ lat, lng }, hintPoint) : 0

                const zoneStatus = !c.kmlZone
                    ? 'вне всех KML зон'
                    : (!isActive
                        ? `${c.kmlZone} (выкл)`
                        : (c.isTechnicalZone ? `${c.kmlZone} (АВТОРАЗГРУЗ)` : `${c.kmlZone}`))

                return {
                    label: c.raw.formatted_address || 'Кандидат',
                    mapsUrl,
                    zoneName: zoneStatus,
                    res: c.raw,
                    _dist: dist // Temporary for sorting
                }
            })
            .sort((a, b) => a._dist - b._dist)
            .map(({ _dist, ...opt }) => opt) // Clean up temp key

        const titlePrefix = suspectJump ? '⚠️ ОБНАРУЖЕН ПРЫЖОК: ' : 'Уточнение адреса: '
        const choice: any = await new Promise(resolve => {
            disambQueue.current.push({
                title: `${titlePrefix}"${rawAddress}"`,
                options: modalOptions,
                resolve
            })
            processDisambQueue()
        })

        return choice ? { ...best, raw: choice } : best
    }

    // ─── Main route calculation ──────────────────────────────────────────────

    const calculateRouteDistance = async (
        route: Route, 
        skipStateUpdate: boolean = false,
        externalCache?: Map<string, any>
    ): Promise<Route | null> => {
        if (!skipStateUpdate) setIsCalculating(true)
        if (!skipStateUpdate) setCalcProgress(0)
        try {
            // Extract LatLng from geocoder result — handles both LatLng objects and plain {lat,lng}
            const toLoc = (res: any): any => {
                if (!res?.geometry?.location) return null
                const loc = res.geometry.location
                return { lat: Number(loc.lat), lng: Number(loc.lng) }
            }

            // Helper for LatLng — use plain object if SDK missing
            const makeLatLng = (lat: number, lng: number): any => {
                return { lat, lng }
            }

            // 1. Check if we can use the "Super-Fast Fast-Path"
            // If all orders already have coordinates, we can skip the loop entirely
            const allOrdersHaveCoords = route.orders.every(o => o.coords?.lat && o.coords?.lng);
            const startLat = settings.defaultStartLat ? Number(settings.defaultStartLat) : null;
            const startLng = settings.defaultStartLng ? Number(settings.defaultStartLng) : null;
            const hasStartCoord = !!(startLat && startLng);

            // 1.1 Start point determination
            let originLoc: any = null;
            if (hasStartCoord) {
                originLoc = makeLatLng(startLat as number, startLng as number);
            } else if (route.startAddress) {
                const cleanedStart = cleanAddressForRoute(route.startAddress).toLowerCase();
                if (externalCache?.has(cleanedStart)) {
                    originLoc = toLoc(externalCache.get(cleanedStart).raw);
                } else {
                    const res = await robustGeocode(cleanAddressForRoute(route.startAddress), { silent: true, strictZoneFallback: false });
                    originLoc = res ? toLoc(res.raw) : null;
                    if (res && externalCache) externalCache.set(cleanedStart, res);
                }
            }

            if (!skipStateUpdate) setCalcProgress(5);

            if (!originLoc) {
                toast.error('Не удалось определить адрес старта. Настройте адрес Базы в Настройках.');
                if (!skipStateUpdate) setIsCalculating(false);
                return null;
            }

            // 2. Process Waypoints
            const addrCache = externalCache || new Map<string, any>();
            const waypointLocs: any[] = [];
            const orderUpdates: any[] = [];
            let lastLoc = originLoc;

            // FAST-PATH: If all orders have coordinates and we aren't confirming addresses,
            // we can map them instantly without any yields or geocoding logic.
            if (allOrdersHaveCoords && !confirmAddresses) {
                console.log(`[Fast-Path] Processing ${route.orders.length} orders bypass mode`);
                route.orders.forEach(order => {
                    const loc = { lat: order.coords!.lat, lng: order.coords!.lng };
                    waypointLocs.push(loc);
                    
                    const update: any = { 
                        id: order.id,
                        lat: loc.lat,
                        lng: loc.lng,
                        kmlZone: order.kmlZone,
                        kmlHub: order.kmlHub,
                        streetNumberMatched: true,
                        isLocked: true,
                        geocodeRes: {
                            formatted_address: order.address,
                            geometry: { location: loc, location_type: 'ROOFTOP' }
                        }
                    };
                    orderUpdates.push(update);
                });
            } else {
                // NORMAL-PATH: Loop with geocoding/cache checks
                for (const order of route.orders) {
                    const cleaned = cleanAddressForRoute(order.address)
                    const key = cleaned.toLowerCase()

                    const expectedDeliveryZone = order.deliveryZone || order.raw?.deliveryZone || order.raw?.['Зона доставки'] || null

                    // v35.9.30: High-Precision Bypass - If order already has server-provided coords (e.g. from addressGeo)
                    if (order.coords?.lat && order.coords?.lng && !addrCache.has(key)) {
                        addrCache.set(key, {
                            raw: {
                                formatted_address: order.address,
                                geometry: {
                                    location: { lat: order.coords.lat, lng: order.coords.lng },
                                    location_type: 'ROOFTOP'
                                },
                            },
                            kmlZone: order.kmlZone || order.deliveryZone,
                            kmlHub: order.kmlHub,
                            streetNumberMatched: true,
                            score: 1000000,
                            isLocked: true
                        });
                    }

                    if (!addrCache.has(key)) {
                        const res = await robustGeocode(cleaned, { 
                            silent: !confirmAddresses, 
                            expectedDeliveryZone,
                            hintPoint: lastLoc,
                            addressGeoStr: (order as any).addressGeoStr
                        })
                        
                        if (!res && confirmAddresses) {
                            toast.error(`Расчет прерван: адрес не был подтвержден (${order.address})`)
                            if (!skipStateUpdate) setIsCalculating(false)
                            return null
                        }
                        
                        addrCache.set(key, res)
                        await yieldToMain()
                    }

                    const geocodeRes = addrCache.get(key)
                    if (!geocodeRes || !toLoc(geocodeRes.raw)) {
                        console.error(`[Расчет] Адрес ОТКЛОНЕН: ${order.address}`, geocodeRes)
                        toast.error(`Проверьте адрес: ${order.address}. Не удалось найти точку в зоне обслуживания.`, { duration: 10000 })
                        if (!skipStateUpdate) setIsCalculating(false)
                        return null
                    }

                    const loc = toLoc(geocodeRes.raw)
                    waypointLocs.push(loc)
                    lastLoc = loc
                    
                    const update: any = { id: order.id }
                    if (loc) {
                        update.lat = loc.lat
                        update.lng = loc.lng
                        update.kmlZone = geocodeRes.kmlZone
                        update.kmlHub = geocodeRes.hubName || geocodeRes.kmlHub
                        update.streetNumberMatched = geocodeRes.streetNumberMatched
                        if (geocodeRes.raw.geometry?.location_type) {
                            update.locationType = geocodeRes.raw.geometry.location_type
                        }
                        update.geocodeRes = geocodeRes.raw; 
                    }
                    orderUpdates.push(update)

                    const progress = Math.min(85, 5 + Math.round((orderUpdates.length / route.orders.length) * 80))
                    if (!skipStateUpdate) setCalcProgress(progress)
                }
            }

            // 2.5 Save GEODATA IMMEDIATELY (v35.9.6: Persistence Priority)
            // This ensures KML zones and coordinates are visible even if the routing engine fails.
            // NOTE: Skip in batch mode (skipStateUpdate=true) because routes don't exist in state yet —
            // the geodata will be included in the final atomic commit in RouteManagement.tsx.
            if (!skipStateUpdate) {
                updateExcelData((prev: any) => ({
                    ...prev,
                    routes: (prev?.routes || []).map((r: Route) => {
                        if (r.id !== route.id) return r;
                        return {
                            ...r,
                            orders: r.orders.map(o => {
                                const upd = orderUpdates.find(u => u.id === o.id);
                                return upd ? { ...o, ...upd } : o;
                            })
                        };
                    })
                }));
            }


            // 2.6 Per-Leg Anomaly Guard with Disambiguation
            // Uses straight-line distances to detect geocoding errors BEFORE calling routing.
            // If a leg is suspiciously long, we surface ALL candidates for that address
            // sorted by distance from the PREVIOUS stop, letting the user pick the right one.
            {
                const { distanceBetween: legDist } = await import('../services/robust-geocoding/candidateScoring')
                const toLoc2 = (res: any): any => {
                    if (!res?.geometry?.location) return null
                    const loc = res.geometry.location
                    return { lat: Number(loc.lat), lng: Number(loc.lng) }
                }
                const getXY = (p: any) => ({ lat: typeof p.lat === 'function' ? p.lat() : p.lat, lng: typeof p.lng === 'function' ? p.lng() : p.lng })

                const legThresholdKm = settings.anomalyMaxLegDistanceKm || 25
                const allWaypointPoints = [originLoc, ...waypointLocs]

                for (let i = 0; i < allWaypointPoints.length - 1; i++) {
                    const from = allWaypointPoints[i]
                    const to = allWaypointPoints[i + 1]
                    if (!from || !to) continue

                    const segM = legDist(getXY(from), getXY(to))
                    const segKm = segM / 1000

                    if (segKm > legThresholdKm) {
                        const badOrderIdx = i
                        const badOrder = route.orders[badOrderIdx]
                        const cleaned = badOrder ? cleanAddressForRoute(badOrder.address) : ''

                        console.warn(`[Расчет] Аномальный перегон ${i}→${i+1}: ${segKm.toFixed(1)} км. Запуск уточнения для: ${badOrder?.address}`)

                        // ─── Multi-pass candidate fetch for maximum coverage ──────────────────
                        // Pass 1: with city bias (Kyiv city)
                        // Pass 2: WITHOUT city bias → discovers suburbs (e.g. Борщагівка, Вишневе)
                        // Pass 3: street-only without house number (extra fallback)
                        const [withCityResult, noCityResult] = await Promise.all([
                            robustGeocodingService.geocode(cleaned, {
                                hintPoint: from,
                                cityBias: settings.cityBias || 'Київ',
                                skipExhaustiveIfGoodHit: false,
                                expectedDeliveryZone: badOrder?.deliveryZone || null
                            }),
                            robustGeocodingService.geocode(cleaned, {
                                hintPoint: from,
                                cityBias: '',   // NO city filter → finds suburban addresses
                                skipExhaustiveIfGoodHit: false,
                                expectedDeliveryZone: null
                            })
                        ])

                        // Deduplicate by coordinate across all passes
                        const seen = new Set<string>()
                        const addCandidates = (list: any[]) => {
                            list.forEach((c: any) => {
                                if (!c.lat || !c.lng) return
                                const key = `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`
                                if (!seen.has(key)) { seen.add(key); allCandidates.push(c) }
                            })
                        }

                        const allCandidates: any[] = []
                        addCandidates(withCityResult?.allCandidates || [])
                        addCandidates(noCityResult?.allCandidates || [])

                        // Pass 3: street-only (without house number) if still few candidates
                        if (allCandidates.length < 3) {
                            const streetOnly = cleaned.replace(/\b\d+[а-яієґa-z]*\b/gi, '').trim()
                            if (streetOnly && streetOnly !== cleaned) {
                                const streetResult = await robustGeocodingService.geocode(streetOnly, {
                                    hintPoint: from,
                                    cityBias: '',  // Also unconstrained
                                    skipExhaustiveIfGoodHit: false
                                })
                                addCandidates(streetResult?.allCandidates || [])
                            }
                        }

                        if (allCandidates.length === 0) {
                            toast.error(`⛔ Не найдено вариантов для адреса: «${badOrder?.address || cleaned}». Проверьте написание адреса.`, { duration: 10000 })
            if (!skipStateUpdate) setIsCalculating(false)
                            return null
                        }

                        // Build candidate options sorted by distance from PREVIOUS stop
                        const sortedOptions = allCandidates
                            .map((c: any) => {
                                const distM = legDist(getXY(from), { lat: c.lat, lng: c.lng })
                                const isActive = c.isInsideZone
                                const zoneTxt = !c.kmlZone
                                    ? 'Вне зон доставки'
                                    : (c.isTechnicalZone ? `${c.kmlZone} (АВТОРАЗГРУЗ)` : (isActive ? c.kmlZone : `${c.kmlZone} (выкл.)`))
                                return {
                                    label: c.raw.formatted_address || 'Без названия',
                                    mapsUrl: `https://www.google.com/maps?q=${c.lat},${c.lng}`,
                                    zoneName: zoneTxt,
                                    distanceMeters: distM,
                                    res: c.raw,
                                    _dist: distM,
                                }
                            })
                            .sort((a: any, b: any) => a._dist - b._dist)
                            .slice(0, 10)
                            .map(({ _dist, ...opt }: any) => opt)

                        // Show disambiguation modal and wait for user choice
                        const choice: any = await new Promise(resolve => {
                            disambQueue.current.push({
                                title: `⚠️ Аномальный перегон (${segKm.toFixed(1)} км). Уточните адрес: «${badOrder?.address ?? cleaned}»`,
                                options: sortedOptions,
                                resolve
                            })
                            processDisambQueue()
                        })

                        if (!choice) {
                            toast.error('Маршрут не сохранён — адрес не уточнён.')
            if (!skipStateUpdate) setIsCalculating(false)
                            return null
                        }

                        // Apply user-selected correction
                        const correctedLoc = toLoc2(choice)
                        if (!correctedLoc) {
                            toast.error('Выбранный адрес не имеет координат. Маршрут не сохранён.')
            if (!skipStateUpdate) setIsCalculating(false)
                            return null
                        }

                        waypointLocs[badOrderIdx] = correctedLoc
                        allWaypointPoints[i + 1] = correctedLoc

                        // Safety check: did the user's choice actually fix the leg?
                        const fixedSegKm = legDist(getXY(from), getXY(correctedLoc)) / 1000
                        if (fixedSegKm > legThresholdKm) {
                            toast.error(`⛔ Выбранный адрес всё равно слишком далеко (${fixedSegKm.toFixed(1)} км). Маршрут не сохранён.`)
            if (!skipStateUpdate) setIsCalculating(false)
                            return null
                        }

                        // Update orderUpdates so that the corrected coord is persisted
                        const updIdx = orderUpdates.findIndex((u: any) => u.id === badOrder?.id)
                        if (updIdx >= 0) {
                            orderUpdates[updIdx].lat = correctedLoc.lat
                            orderUpdates[updIdx].lng = correctedLoc.lng
                        }

                        toast.success(`✅ Адрес уточнён: ${choice.formatted_address || 'выбран пользователем'}.`)
                        // Continue checking remaining legs in the loop
                    }
                }
            }

            // 3. End point
            let destinLoc: any = null
            const endLat = settings.defaultEndLat ? Number(settings.defaultEndLat) : null
            const endLng = settings.defaultEndLng ? Number(settings.defaultEndLng) : null
            if (endLat && endLng) {
                destinLoc = makeLatLng(endLat, endLng)
            } else if (!route.endAddress || route.endAddress === route.startAddress) {
                destinLoc = originLoc
            } else {
                const res = await robustGeocode(cleanAddressForRoute(route.endAddress), { silent: true, strictZoneFallback: false })
                destinLoc = res ? (toLoc(res.raw) || originLoc) : originLoc
            }

            if (!skipStateUpdate) setCalcProgress(90)

            // 4. Routing Pipeline (Valhalla with OSRM Fallback)
            let totalDistance = 0
            let totalDuration = 0
            let routingSuccess = false

            if (!skipStateUpdate) setCalcProgress(95)

            const points = [originLoc, ...waypointLocs, destinLoc].map(l => {
                const lat = typeof l.lat === 'function' ? l.lat() : l.lat
                const lng = typeof l.lng === 'function' ? l.lng() : (l.lng || (l as any).lon)
                return { lat: Number(lat), lng: Number(lng) }
            })

            const routingProvider = settings.routingProvider || 'valhalla'
            const yapikoUrl = (settings.yapikoOsrmUrl || '').trim()

            // SOTA 5.68: Custom OSRM Provider (Yapiko)
            if (routingProvider === 'yapiko_osrm' && yapikoUrl) {
                try {
                    const { YapikoOSRMService } = await import('../services/YapikoOSRMService')
                    const yRes = await YapikoOSRMService.calculateRoute(points, yapikoUrl)
                    if (yRes.feasible && yRes.totalDistance && yRes.totalDistance > 0) {
                        totalDistance = yRes.totalDistance
                        totalDuration = yRes.totalDuration || 0
                        routingSuccess = true
                        console.log(`[Маршрут] Yapiko OSRM — успех: ${totalDistance}м`)
                    } else {
                        console.warn('[Маршрут] Yapiko OSRM вернул 0 или ошибку. Пробую Valhalla.')
                    }
                } catch (e) {
                    console.warn('[Маршрут] Ошибка Yapiko OSRM, пробую Valhalla:', e)
                }
            }

            if (!routingSuccess) {
                // Try Valhalla first
                try {
                    const { ValhallaService } = await import('../services/valhallaService')
                    const vRes = await ValhallaService.calculateRoute(points)
                    if (vRes.feasible && vRes.totalDistance && vRes.totalDistance > 0) {
                        totalDistance = vRes.totalDistance
                        totalDuration = vRes.totalDuration || 0
                        routingSuccess = true
                        console.log(`[Маршрут] Valhalla — успех: ${totalDistance}м`)
                    } else {
                        console.warn('[Маршрут] Valhalla вернула 0 или невозможный путь. Пробую OSRM.')
                    }
                } catch (e) {
                    console.warn('[Маршрут] Ошибка Valhalla, пробую OSRM:', e)
                }

                // Try OSRM if Valhalla failed
                if (!routingSuccess) {
                    try {
                        const { OSRMService } = await import('../services/osrmService')
                        const oRes = await OSRMService.calculateRoute(points)
                        if (oRes.feasible && oRes.totalDistance && oRes.totalDistance > 0) {
                            totalDistance = oRes.totalDistance
                            totalDuration = oRes.totalDuration || 0
                            routingSuccess = true
                            console.log(`[Маршрут] OSRM — успех: ${totalDistance}м`)
                        } else {
                            console.warn('[Маршрут] OSRM также вернул 0 или невозможный путь.')
                        }
                    } catch (e) {
                        console.warn('[Маршрут] Резервный OSRM не удался:', e)
                    }
                }
            }

            // Fallback to Google ONLY if explicitly required or manually triggered (Legacy behavior preserved but not automated)
            // But per user request "забудь за гугл", we skip automated fallback to Google.
            if (!routingSuccess) {
                // If everything free failed, we return 0/failure instead of stealthy Google spend
                console.error('[Маршрут] Все бесплатные провайдеры (Valhalla, OSRM) не смогли построить путь.')
            }


            const distanceKm = totalDistance / 1000
            const anomalyThresholdKm = settings.anomalyMaxTotalDistanceKm || 65

            // ─── Per-leg anomaly check ─────────────────────────────────────────
            // Check if any single leg between consecutive stops is unrealistically long.
            // This catches cases where one waypoint was geocoded to the wrong city/region.
            const { distanceBetween: calcDist } = await import('../services/robust-geocoding/candidateScoring')
            const allPoints = [originLoc, ...waypointLocs]
            let badLegIndex = -1
            let badLegKm = 0
            const legThresholdKm = settings.anomalyMaxLegDistanceKm || 25
            for (let i = 0; i < allPoints.length - 1; i++) {
                const from = allPoints[i]
                const to = allPoints[i + 1]
                if (!from || !to) continue
                const legM = calcDist(
                    { lat: typeof from.lat === 'function' ? from.lat() : from.lat, lng: typeof from.lng === 'function' ? from.lng() : from.lng },
                    { lat: typeof to.lat === 'function' ? to.lat() : to.lat, lng: typeof to.lng === 'function' ? to.lng() : to.lng }
                )
                const legKm = legM / 1000
                if (legKm > legThresholdKm) {
                    badLegIndex = i
                    badLegKm = legKm
                    break
                }
            }

            if (badLegIndex >= 0) {
                const badAddr = badLegIndex > 0 ? route.orders[badLegIndex - 1]?.address : 'Первая точка'
                const reason = `⛔ АНОМАЛЬНЫЙ ПЕРЕГОН: ${badLegKm.toFixed(1)} км от точки ${badLegIndex + 1} ("${badAddr || '?'}") — возможна ошибка геокодирования. Маршрут не сохранён.`
                toast.error(reason, { duration: 12000 })
                console.error(`[Расчет] ОБНАРУЖЕНА АНОМАЛИЯ на перегоне ${badLegIndex}: ${badLegKm.toFixed(1)} км`)
if (!skipStateUpdate) setIsCalculating(false)
                return null
            }

            const currentCity = settings.cityBias || 'Киев'
            if (distanceKm > anomalyThresholdKm) {
                const reason = `⛔ АНОМАЛЬНАЯ ДИСТАНЦИЯ (${distanceKm.toFixed(1)} км) — превышает лимит ${anomalyThresholdKm} км для г. ${currentCity}. Вероятно, один из адресов геокодирован в другом районе. Маршрут не сохранён.`
                toast.error(reason, { duration: 12000 })
                console.error(`[Расчет] АНОМАЛИЯ ЗАБЛОКИРОВАНА: ${distanceKm.toFixed(1)}км > порога ${anomalyThresholdKm}км для ${currentCity}`)
if (!skipStateUpdate) setIsCalculating(false)
                return null
            }

            if (totalDistance === 0) {
                toast.error('Маршрут не найден', { duration: 6000 })
if (!skipStateUpdate) setIsCalculating(false)
                return null
            }

            if (distanceKm > 150) {
                 toast.error(`Ошибка: Маршрут слишком длинный (${distanceKm.toFixed(1)} км).`)
 if (!skipStateUpdate) setIsCalculating(false)
                 return null
            }

            // 5. Create final Routing Result object
            const getL = (l: any) => ({
                lat: typeof l.lat === 'function' ? l.lat() : l.lat,
                lng: typeof l.lng === 'function' ? l.lng() : l.lng
            })

            const geoMeta = {
                origin: getL(originLoc),
                destination: getL(destinLoc),
                waypoints: waypointLocs.map((loc, idx) => {
                    const addrKey = cleanAddressForRoute(route.orders[idx].address).toLowerCase();
                    const res = addrCache.get(addrKey);
                    const base = typeof loc === 'string' ? { address: loc } : getL(loc);
                    if (res) {
                        return {
                            ...base,
                            zoneName: res.kmlZone,
                            hubName: res.kmlHub,
                            locationType: res.raw.geometry?.location_type,
                            streetNumberMatched: res.streetNumberMatched,
                            score: res.score
                        };
                    }
                    return base;
                })
            }

            const updatedRoute: Route = {
                ...route,
                totalDistance: totalDistance / 1000,
                totalDuration: totalDuration / 60,
                geoMeta,
                isOptimized: true,
                // Merge geocoded coordinates into orders for persistence
                orders: route.orders.map((o: any) => {
                    const upd = orderUpdates.find((u: any) => u.id === o.id);
                    return upd ? { ...o, ...upd } : o;
                })
            }

            // If not skipping state update, save to state normally (useful for single-route calculations)
            if (!skipStateUpdate) {
                updateExcelData((prev: any) => ({
                    ...prev,
                    routes: (prev?.routes || []).map((r: Route) => r.id === route.id ? updatedRoute : r)
                }))
                toast.success(`Маршрут рассчитан: ${(totalDistance / 1000).toFixed(1)} км`)
            }

            if (!skipStateUpdate) {
                setIsCalculating(false)
                setCalcProgress(100)
                setTimeout(() => setCalcProgress(0), 1000)
            }

            return updatedRoute;

        } catch (e) {
            console.error('[Расчет] Критическая ошибка:', e)
            if (!skipStateUpdate) toast.error('Произошла критическая ошибка при расчете маршрута.')
            if (!skipStateUpdate) setIsCalculating(false)
            if (!skipStateUpdate) setCalcProgress(0)
            return null;
        }
    }

    return {
        calculateRouteDistance,
        isCalculating,
        setIsCalculating,
        calcProgress,
        setCalcProgress,
        disambModal,
        setDisambModal,
        disambResolver,
        processDisambQueue,
        robustGeocode
    }
}
