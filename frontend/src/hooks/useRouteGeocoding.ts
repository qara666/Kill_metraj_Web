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
    const robustGeocode = async (rawAddress: string, options: { hintPoint?: any; silent?: boolean; strictZoneFallback?: boolean; expectedDeliveryZone?: string | null } = {}): Promise<any | null> => {
        const { hintPoint, silent = false, strictZoneFallback = true, expectedDeliveryZone = null } = options
        const cityBias = settings.cityBias || 'Киев'

        // 1. Delegate core logic to the central service
        const result = await robustGeocodingService.geocode(rawAddress, {
            hintPoint,
            cityBias,
            silent: silent || !confirmAddresses,
            expectedDeliveryZone
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
                    console.warn(`[useRouteGeocoding] SUSPECT JUMP DETECTED: best=${(bestDist / 1000).toFixed(1)}km. Forcing clarity.`)
                }
            }
        }

        if (!suspectJump && (silent || !confirmAddresses)) {
            // Strict rejection: only if the score is catastrophically low (e.g. city mismatch or technical zone)
            if (strictZoneFallback && best.score < -800000) return null
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

    const calculateRouteDistance = async (route: Route) => {
        setIsCalculating(true)
        setCalcProgress(0)
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


            // 1. Start point
            let originLoc: any = null
            const startLat = settings.defaultStartLat ? Number(settings.defaultStartLat) : null
            const startLng = settings.defaultStartLng ? Number(settings.defaultStartLng) : null
            if (startLat && startLng) {
                originLoc = makeLatLng(startLat, startLng)
            } else if (route.startAddress) {
                const res = await robustGeocode(cleanAddressForRoute(route.startAddress), { silent: true, strictZoneFallback: true })
                originLoc = res ? toLoc(res.raw) : null
            }

            setCalcProgress(5)

            if (!originLoc) {
                toast.error('Не удалось определить адрес старта. Настройте адрес Базы в Настройках.')
                setIsCalculating(false)
                return
            }

            // 2. Waypoints (order addresses)
            const addrCache = new Map<string, any>()
            const waypointLocs: any[] = []
            const orderUpdates: any[] = []
            
            // v35.9.16: Chain Logic - Use the previous coordinate as a hint for the next one
            let lastLoc = originLoc

            for (const order of route.orders) {
                const cleaned = cleanAddressForRoute(order.address)
                const key = cleaned.toLowerCase()

                const expectedDeliveryZone = order.deliveryZone || order.raw?.deliveryZone || order.raw?.['Зона доставки'] || null

                if (!addrCache.has(key)) {
                    // v35.9.16: Pass lastLoc as hintPoint to help disambiguate and trigger Suspect Jump modal
                    addrCache.set(key, await robustGeocode(cleaned, { 
                        silent: true, 
                        expectedDeliveryZone,
                        hintPoint: lastLoc
                    }))
                    await yieldToMain()
                }

                const geocodeRes = addrCache.get(key)
                if (!geocodeRes || !toLoc(geocodeRes.raw)) {
                    console.error(`[useRouteGeocoding] Address REJECTED: ${order.address}`, geocodeRes)
                    toast.error(`Адрес не прошел проверку безопасности (слишком далеко или другой город): ${order.address}. Проверьте правильность написания.`)
                    setIsCalculating(false)
                    return
                }

                const loc = toLoc(geocodeRes.raw)
                waypointLocs.push(loc)
                lastLoc = loc // Update hint for next stop
                
                const update: any = { id: order.id }
                if (loc) {
                    const lLat = typeof loc.lat === 'function' ? loc.lat() : loc.lat
                    const lLng = typeof loc.lng === 'function' ? loc.lng() : loc.lng
                    update.lat = lLat
                    update.lng = lLng
                    
                    // Use the metadata captured during geocoding
                    update.kmlZone = geocodeRes.kmlZone
                    update.kmlHub = geocodeRes.hubName || geocodeRes.kmlHub // Handle potential naming variations
                    update.streetNumberMatched = geocodeRes.streetNumberMatched
                    
                    if (geocodeRes.raw.geometry?.location_type) {
                        update.locationType = geocodeRes.raw.geometry.location_type
                    }
                    update.geocodeRes = geocodeRes.raw; 
                }
                orderUpdates.push(update)

                // Update progress: From 5% to 85% based on waypoints
                const progress = Math.min(85, 5 + Math.round((orderUpdates.length / route.orders.length) * 80))
                setCalcProgress(progress)
            }

            // 2.5 Save GEODATA IMMEDIATELY (v35.9.6: Persistence Priority)
            // This ensures KML zones and coordinates are visible even if the routing engine fails.
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

                        console.warn(`[useRouteGeocoding] Bad leg ${i}→${i+1}: ${segKm.toFixed(1)} km. Triggering disambiguation for: ${badOrder?.address}`)

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
                            setIsCalculating(false)
                            return
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
                            setIsCalculating(false)
                            return
                        }

                        // Apply user-selected correction
                        const correctedLoc = toLoc2(choice)
                        if (!correctedLoc) {
                            toast.error('Выбранный адрес не имеет координат. Маршрут не сохранён.')
                            setIsCalculating(false)
                            return
                        }

                        waypointLocs[badOrderIdx] = correctedLoc
                        allWaypointPoints[i + 1] = correctedLoc

                        // Safety check: did the user's choice actually fix the leg?
                        const fixedSegKm = legDist(getXY(from), getXY(correctedLoc)) / 1000
                        if (fixedSegKm > legThresholdKm) {
                            toast.error(`⛔ Выбранный адрес всё равно слишком далеко (${fixedSegKm.toFixed(1)} км). Маршрут не сохранён.`)
                            setIsCalculating(false)
                            return
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

            setCalcProgress(90)

            // 4. Routing Pipeline (Valhalla with OSRM Fallback)
            let totalDistance = 0
            let totalDuration = 0
            let routingSuccess = false

            setCalcProgress(95)

            const points = [originLoc, ...waypointLocs, destinLoc].map(l => {
                const lat = typeof l.lat === 'function' ? l.lat() : l.lat
                const lng = typeof l.lng === 'function' ? l.lng() : (l.lng || (l as any).lon)
                return { lat: Number(lat), lng: Number(lng) }
            })

            const useFreeRouting = true // Always try free providers first

            if (useFreeRouting) {
                // Try Valhalla first
                try {
                    const { ValhallaService } = await import('../services/valhallaService')
                    const vRes = await ValhallaService.calculateRoute(points)
                    if (vRes.feasible && vRes.totalDistance && vRes.totalDistance > 0) {
                        totalDistance = vRes.totalDistance
                        totalDuration = vRes.totalDuration || 0
                        routingSuccess = true
                        console.log(`[useRouteGeocoding] Valhalla successful: ${totalDistance}m`)
                    } else {
                        console.warn('[useRouteGeocoding] Valhalla returned 0 or unfeasible. Trying OSRM fallback.')
                    }
                } catch (e) {
                    console.warn('[useRouteGeocoding] Valhalla failed, trying OSRM fallback:', e)
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
                            console.log(`[useRouteGeocoding] OSRM successful: ${totalDistance}m`)
                        } else {
                            console.warn('[useRouteGeocoding] OSRM also returned 0 or unfeasible.')
                        }
                    } catch (e) {
                        console.warn('[useRouteGeocoding] OSRM fallback failed:', e)
                    }
                }
            }

            // Fallback to Google ONLY if explicitly required or manually triggered (Legacy behavior preserved but not automated)
            // But per user request "забудь за гугл", we skip automated fallback to Google.
            if (!routingSuccess) {
                // If everything free failed, we return 0/failure instead of stealthy Google spend
                console.error('[useRouteGeocoding] All free routing providers failed (Valhalla, OSRM).')
            }


            const isKyiv = (settings.cityBias || '').toLowerCase().includes('киев') || (settings.cityBias || '').toLowerCase().includes('київ')
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
                console.error(`[useRouteGeocoding] BAD LEG DETECTED at index ${badLegIndex}: ${badLegKm.toFixed(1)} km`)
                setIsCalculating(false)
                return
            }

            if (isKyiv && distanceKm > anomalyThresholdKm) {
                const reason = `⛔ АНОМАЛЬНАЯ ДИСТАНЦИЯ (${distanceKm.toFixed(1)} км) — превышает лимит ${anomalyThresholdKm} км для Киева. Вероятно, один из адресов геокодирован в другом районе. Маршрут не сохранён.`
                toast.error(reason, { duration: 12000 })
                console.error(`[useRouteGeocoding] ANOMALY BLOCKED: ${distanceKm.toFixed(1)}km > ${anomalyThresholdKm}km threshold`)
                setIsCalculating(false)
                return
            }

            if (totalDistance === 0) {
                toast.error('Маршрут не найден', { duration: 6000 })
                setIsCalculating(false)
                return
            }

            if (distanceKm > 150) {
                 toast.error(`Ошибка: Маршрут слишком длинный (${distanceKm.toFixed(1)} км).`)
                 setIsCalculating(false)
                 return
            }

            // 5. Save final Routing result
            updateExcelData((prev: any) => ({
                ...prev,
                routes: (prev?.routes || []).map((r: Route) => {
                    if (r.id !== route.id) return r

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
                                    hubName: res.kmlHub, // Correct property name: res.kmlHub
                                    locationType: res.raw.geometry?.location_type,
                                    streetNumberMatched: res.streetNumberMatched,
                                    score: res.score
                                };
                            }
                            return base;
                        })
                    }

                    return {
                        ...r,
                        totalDistance: totalDistance / 1000,
                        totalDuration: totalDuration / 60,
                        geoMeta,
                        isOptimized: true
                    }
                })
            }))
            toast.success(`Маршрут рассчитан: ${(totalDistance / 1000).toFixed(1)} км`)
            setIsCalculating(false)
            setCalcProgress(100)
            setTimeout(() => setCalcProgress(0), 1000)

        } catch (e) {
            console.error('[useRouteGeocoding] Fatal Error:', e)
            toast.error('Произошла критическая ошибка при расчете маршрута.')
            setIsCalculating(false)
            setCalcProgress(0)
        }
    }

    return {
        calculateRouteDistance,
        isCalculating,
        calcProgress,
        disambModal,
        setDisambModal,
        disambResolver,
        processDisambQueue,
        robustGeocode
    }
}
