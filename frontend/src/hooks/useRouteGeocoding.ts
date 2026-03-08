/**
 * useRouteGeocoding — Route distance calculation with heavily optimized API usage.
 *
 * COST OPTIMIZATIONS (v2):
 *  1. Early-exit: stops variant search on first ROOFTOP hit inside the delivery zone
 *  2. Suppresses `researchExhaustive()` when a perfect hit is already found
 *  3. Waypoint address deduplication — identical addresses share a single geocode result
 *  4. Start/end address coordinate pin — if coordinates are stored in settings, zero geocode calls
 *  5. All results backed by persistent googleApiCache (survives page reloads)
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { googleApiCache } from '../services/googleApiCache'
import { cleanAddress, generateStreetVariants } from '../utils/data/addressUtils'
import { robustGeocodingService } from '../services/robust-geocoding/RobustGeocodingService'
import { Route, Order } from '../types/route'

interface UseRouteGeocodingProps {
    settings: any
    selectedHubs: string[]
    selectedZones: string[]
    cachedHubPolygons: any[]
    cachedAllKmlPolygons: any[]
    confirmAddresses: boolean
    isInsideSector: (loc: any) => boolean
    checkTechnicalKmlZone: (latLng: any) => boolean
    checkDeliveryKmlZone: (latLng: any) => boolean
    getCourierVehicleType: (name: string) => string
    updateExcelData: (fn: (prev: any) => any) => void
    validateOrders: (orders: Order[]) => Promise<any[]>
    setProblemOrders: (problems: any[]) => void
    setCurrentProblem: (problem: any) => void
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
    isInsideSector,
    checkTechnicalKmlZone,
    checkDeliveryKmlZone,
    getCourierVehicleType: _getCourierVehicleType,
    updateExcelData,
    validateOrders: _validateOrders,
    setProblemOrders: _setProblemOrders,
    setCurrentProblem: _setCurrentProblem,
    setShowCorrectionModal: _setShowCorrectionModal,
    setShowBatchPanel: _setShowBatchPanel,
    cleanAddressForRoute
}: UseRouteGeocodingProps) => {
    const [isCalculating, setIsCalculating] = useState(false)
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
            googlePoly: p.googlePoly,
            bounds: p.bounds,
            path: p.path,
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
        const m = raw.match(/\d+[\/\-\wа-яА-ЯёЁіІєЄґҐ]*/)
        return m ? m[0] : null
    }

    const extractPostal = (raw: string): string | null => {
        const m = raw.match(/\b\d{5}\b/)
        return m ? m[0] : null
    }

    const distBetween = (a: any, b: any): number => {
        try { return window.google.maps.geometry.spherical.computeDistanceBetween(a, b) } catch { return Infinity }
    }

    const scoreCandidate = (candidate: any, opts: { refPoint?: any; expectedHouse?: string | null; expectedPostal?: string | null; inside: boolean }): number => {
        let score = 0
        const loc = candidate.geometry.location
        const type = candidate.geometry.location_type

        if (type === 'ROOFTOP') score += 100
        if (type === 'RANGE_INTERPOLATED') score += 50
        if (opts.inside) score += 200
        if (opts.refPoint) {
            const d = distBetween(loc, opts.refPoint)
            if (d < 5000) score += 30
            if (d < 2000) score += 20
        }
        if (opts.expectedHouse) {
            const streetNum = (candidate.address_components || []).find((c: any) => c.types.includes('street_number'))?.long_name
            if (streetNum && streetNum.toLowerCase() === opts.expectedHouse.toLowerCase()) score += 150
        }
        return score
    }

    /** Check if a geocode result is a "perfect hit" — no need to try more variants */
    const isPerfectHit = (r: any, expectedHouse: string | null, cityBias: string): boolean => {
        const lt = r.geometry?.location_type
        if (lt !== 'ROOFTOP' && lt !== 'RANGE_INTERPOLATED') return false
        if (!isInsideSector(r.geometry.location)) return false
        if (checkTechnicalKmlZone(r.geometry.location)) return false
        if (expectedHouse) {
            const comps = r.address_components || []
            const streetNum = comps.find((c: any) => c.types?.includes('street_number'))?.long_name
            if (!streetNum || streetNum.toLowerCase() !== expectedHouse.toLowerCase()) return false
        }
        const addr = (r.formatted_address || '').toLowerCase()
        return addr.includes(cityBias.toLowerCase()) || addr.includes('ukraine') || addr.includes('україна')
    }

    // ─── Disambiguation queue ───────────────────────────────────────────────────

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

    // ─── Exhaustive fallback research ─────────────────────────────────────────
    // Only called when primary geocoding completely fails (0 usable results).

    const researchExhaustive = async (rawAddress: string, hintPoint?: any): Promise<any[]> => {
        const cityBias = settings.cityBias || 'Киев'
        const request: any = { address: rawAddress, region: 'UA', componentRestrictions: { country: 'UA' } }
        let candidates: any[] = []

        // Only try first 3 variants in exhaustive mode to limit cost
        const variants = generateStreetVariants(rawAddress, cityBias).slice(0, 3)

        for (const variant of variants) {
            const res: any = await googleApiCache.geocode({ ...request, address: variant })
            if (res && res.length > 0) {
                candidates = [...candidates, ...res]
                const bestFound = res.find((r: any) =>
                    r.geometry?.location_type === 'ROOFTOP' &&
                    isInsideSector(r.geometry.location) &&
                    !checkTechnicalKmlZone(r.geometry.location)
                )
                if (bestFound) break // Early exit on first ROOFTOP inside zone
            }
        }

        // Hint-based expansion (only when we have nothing at all)
        if (candidates.length === 0 && hintPoint) {
            const rev: any = await googleApiCache.geocode({ location: hintPoint })
            const sub = (rev || []).find((r: any) => (r.address_components || []).some((c: any) =>
                c.types?.includes('sublocality') || c.types?.includes('neighborhood')
            ))?.address_components?.find((c: any) =>
                c.types?.includes('sublocality') || c.types?.includes('neighborhood')
            )?.long_name
            if (sub) {
                const subRes: any = await googleApiCache.geocode({ ...request, address: `${cleanAddress(rawAddress)}, ${sub}` })
                if (subRes) candidates = [...candidates, ...subRes]
            }
        }

        // Deduplicate by coordinate
        const seen = new Set<string>()
        return candidates.filter(c => {
            const lat = typeof c.geometry.location.lat === 'function' ? c.geometry.location.lat() : c.geometry.location.lat
            const lng = typeof c.geometry.location.lng === 'function' ? c.geometry.location.lng() : c.geometry.location.lng
            const key = `${lat.toFixed(5)},${lng.toFixed(5)}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
        })
    }

    const findZoneForLoc = (locInput: any, targetPolygons: any[]) => {
        let loc: any
        if (typeof locInput.lat === 'function') {
            loc = locInput
        } else {
            loc = new window.google.maps.LatLng(locInput.lat, locInput.lng)
        }

        const activeMatch = cachedHubPolygons.find((p: any) => {
            try {
                if (selectedZones.length > 0) {
                    const zoneKey = `${(p.folderName || '').trim()}:${(p.name || '').trim()}`
                    if (!selectedZones.includes(zoneKey)) return false
                }
                if (p.bounds && !p.bounds.contains(loc)) return false
                const poly = p.googlePoly
                return window.google.maps.geometry.poly.containsLocation(loc, poly) ||
                    window.google.maps.geometry.poly.isLocationOnEdge(loc, poly, 0.001)
            } catch { return false }
        })
        if (activeMatch) return activeMatch

        return targetPolygons.find((p: any) => {
            try {
                if (p.bounds && !p.bounds.contains(loc)) return false
                const poly = p.googlePoly || new window.google.maps.Polygon({ paths: p.path })
                return window.google.maps.geometry.poly.containsLocation(loc, poly) ||
                    window.google.maps.geometry.poly.isLocationOnEdge(loc, poly, 0.001)
            } catch { return false }
        })
    }

    /**
     * SOTA 5.67: Robust geocoding with zone validation.
     * Geocode an address, retrying with street variants only until a perfect hit is found.
     *
     * @param options.silent If true, suppresses disambiguation modals (auto-pick best).
     */
    const robustGeocode = async (rawAddress: string, options: { hintPoint?: any; silent?: boolean } = {}): Promise<any | null> => {
        const { hintPoint, silent = false } = options
        const expectedHouse = extractHouseNumber(rawAddress)
        const expectedPostal = extractPostal(rawAddress)
        const refPoint = hintPoint || null
        const hasRestriction = cachedHubPolygons.length > 0
        const kmlLoaded = cachedAllKmlPolygons.length > 0
        const zones = settings.kmlData?.polygons || []
        const cityBias = settings.cityBias || 'Киев'

        const searchVariants = generateStreetVariants(rawAddress, cityBias)
        let candidatesByVariant: any[] = []

        for (const variant of searchVariants) {
            try {
                const res: any = await googleApiCache.geocode({
                    address: variant,
                    region: 'UA',
                    componentRestrictions: { country: 'UA' }
                })

                if (res && res.length > 0) {
                    candidatesByVariant = [...candidatesByVariant, ...res]

                    // ★ COST OPTIMIZATION: Early-exit on perfect hit
                    const perfect = res.find((r: any) => isPerfectHit(r, expectedHouse, cityBias))
                    if (perfect) return perfect  // Zero more API calls needed

                    // Good-enough early exit (ROOFTOP or RANGE_INTERPOLATED, inside zone)
                    const goodEnough = res.find((r: any) =>
                        (r.geometry?.location_type === 'ROOFTOP' || r.geometry?.location_type === 'RANGE_INTERPOLATED') &&
                        (!hasRestriction || isInsideSector(r.geometry.location)) &&
                        !checkTechnicalKmlZone(r.geometry.location) &&
                        (!kmlLoaded || checkDeliveryKmlZone(r.geometry.location))
                    )
                    if (goodEnough && !confirmAddresses) break
                }
            } catch (e) {
                console.error(`Geocode error for variant "${variant}":`, e)
            }
        }

        // Score and pick best from candidates so far
        let best = candidatesByVariant[0] || null
        let bestScore = best ? scoreCandidate(best, { refPoint, expectedHouse, expectedPostal, inside: isInsideSector(best.geometry.location) }) : -Infinity
        for (let i = 1; i < candidatesByVariant.length; i++) {
            const c = candidatesByVariant[i]
            const s = scoreCandidate(c, { refPoint, expectedHouse, expectedPostal, inside: isInsideSector(c.geometry.location) })
            if (s > bestScore) { best = c; bestScore = s }
        }

        const inTechZone = best ? checkTechnicalKmlZone(best.geometry.location) : false
        const bestInAnyZone = best ? !!findZoneForLoc(best.geometry.location, zones) : false
        const houseMatchedExactly = !expectedHouse || (() => {
            const streetNum = best ? (best.address_components || []).find((c: any) => c.types?.includes('street_number'))?.long_name : null
            return streetNum && streetNum.toLowerCase() === expectedHouse.toLowerCase()
        })()

        const isSuspicious = !best || !houseMatchedExactly || inTechZone || !bestInAnyZone

        // ★ COST OPTIMIZATION: Only call exhaustive research when truly needed
        const alreadyHasGoodHit = best && candidatesByVariant.some(c =>
            isInsideSector(c.geometry.location) &&
            (c.geometry.location_type === 'ROOFTOP' || c.geometry.location_type === 'RANGE_INTERPOLATED') &&
            (!expectedHouse || (c.address_components || []).some((comp: any) =>
                comp.types.includes('street_number') && comp.long_name.toLowerCase() === expectedHouse.toLowerCase()
            ))
        )

        if (isSuspicious && !alreadyHasGoodHit) {
            const exhaustive = await researchExhaustive(rawAddress, refPoint)
            exhaustive.forEach(r => {
                const exists = candidatesByVariant.some(c => distBetween(c.geometry.location, r.geometry.location) < 100)
                if (!exists) candidatesByVariant.push(r)
            })

            // Re-score after exhaustive research
            let finalBest = candidatesByVariant[0]
            let finalBestScore = scoreCandidate(finalBest, { refPoint, expectedHouse, expectedPostal, inside: isInsideSector(finalBest.geometry.location) })
            for (let i = 1; i < candidatesByVariant.length; i++) {
                const c = candidatesByVariant[i]
                const s = scoreCandidate(c, { refPoint, expectedHouse, expectedPostal, inside: isInsideSector(c.geometry.location) })
                if (s > finalBestScore) { finalBest = c; finalBestScore = s }
            }
            best = finalBest
        }

        if (candidatesByVariant.length === 0) return null

        const autoReady = (!confirmAddresses || silent) && !!best && !checkTechnicalKmlZone(best.geometry.location) && !!findZoneForLoc(best.geometry.location, zones)
        if (autoReady || (!confirmAddresses || silent)) return best

        // Disambiguation modal (only in confirmAddresses mode)
        const modalOptions = candidatesByVariant.map((r: any) => {
            let d: number | undefined
            let mapsUrl = ''
            let zoneFound = null
            const loc = r.geometry.location
            try {
                if (refPoint) d = window.google.maps.geometry.spherical.computeDistanceBetween(loc, refPoint)
                const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat
                const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng
                mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`
                zoneFound = findZoneForLoc(loc, zones)
            } catch { }
            const isInActive = isInsideSector(loc)
            return {
                label: r.formatted_address || 'Кандидат',
                distanceMeters: d,
                mapsUrl,
                zoneName: !zoneFound ? 'вне всех KML зон' : (!isInActive ? `${zoneFound.name} (выкл)` : (checkTechnicalKmlZone(loc) ? `${zoneFound.name} (АВТОРАЗГРУЗ)` : `${zoneFound.name}`)),
                res: r
            }
        })

        const choice: any = await new Promise(resolve => {
            disambQueue.current.push({
                title: `Уточнение адреса: "${rawAddress}"`,
                options: modalOptions,
                resolve
            })
            processDisambQueue()
        })
        return choice || best
    }

    // ─── Main route calculation ──────────────────────────────────────────────

    const calculateRouteDistance = async (route: Route) => {
        setIsCalculating(true)
        try {
            // Extract LatLng from geocoder result — handles both LatLng objects and plain {lat,lng}
            const toLoc = (res: any): any => {
                if (!res?.geometry?.location) return null
                const loc = res.geometry.location
                if (typeof loc.lat === 'function') return loc
                try { return new window.google.maps.LatLng(Number(loc.lat), Number(loc.lng)) } catch { return null }
            }

            // 1. Start point
            let originLoc: any = null
            const startLat = settings.defaultStartLat ? Number(settings.defaultStartLat) : null
            const startLng = settings.defaultStartLng ? Number(settings.defaultStartLng) : null
            if (startLat && startLng) {
                originLoc = new window.google.maps.LatLng(startLat, startLng)
            } else if (route.startAddress) {
                const res = await robustGeocode(cleanAddressForRoute(route.startAddress), { silent: true })
                originLoc = toLoc(res)
            }

            if (!originLoc) {
                toast.error('Не удалось определить адрес старта. Настройте адрес Базы в Настройках.')
                setIsCalculating(false)
                return
            }

            // 2. Waypoints (order addresses) — geocode each unique address once
            const addrCache = new Map<string, any>()
            const waypointLocs: any[] = []
            const orderUpdates: any[] = []

            for (const order of route.orders) {
                const cleaned = cleanAddressForRoute(order.address)
                const key = cleaned.toLowerCase()
                
                if (!addrCache.has(key)) {
                    addrCache.set(key, await robustGeocode(cleaned, { silent: true }))
                }
                
                const geocodeRes = addrCache.get(key)
                const loc = toLoc(geocodeRes)
                waypointLocs.push(loc || cleaned) // text fallback if geocode fails

                // Track zone and coords for each order
                const update: any = { id: order.id }
                if (loc) {
                    update.lat = loc.lat()
                    update.lng = loc.lng()
                    const zone = findZoneForLoc(loc, cachedAllKmlPolygons)
                    if (zone) {
                        update.kmlZone = zone.name
                        update.kmlHub = zone.folderName
                    }
                }
                orderUpdates.push(update)
            }

            // 3. End point
            let destinLoc: any = null
            const endLat = settings.defaultEndLat ? Number(settings.defaultEndLat) : null
            const endLng = settings.defaultEndLng ? Number(settings.defaultEndLng) : null
            if (endLat && endLng) {
                destinLoc = new window.google.maps.LatLng(endLat, endLng)
            } else if (!route.endAddress || route.endAddress === route.startAddress) {
                destinLoc = originLoc
            } else {
                const res = await robustGeocode(cleanAddressForRoute(route.endAddress), { silent: true })
                destinLoc = toLoc(res) || originLoc
            }

            // 4. Google Directions API (chunks of max 23 waypoints)
            const MAX_WP = 23
            const allWpDefs = waypointLocs.map(loc => ({ location: loc, stopover: true }))
            const chunks: any[][] = []
            for (let i = 0; i < allWpDefs.length; i += MAX_WP) chunks.push(allWpDefs.slice(i, i + MAX_WP))
            if (chunks.length === 0) chunks.push([])

            let totalDistance = 0
            let totalDuration = 0

            for (let ci = 0; ci < chunks.length; ci++) {
                const chunkOrigin = ci === 0 ? originLoc : allWpDefs[(ci * MAX_WP) - 1].location
                const chunkDest = ci === chunks.length - 1
                    ? destinLoc
                    : allWpDefs[Math.min((ci + 1) * MAX_WP, allWpDefs.length) - 1].location

                const dirResult: any = await new Promise((resolve) => {
                    try {
                        new window.google.maps.DirectionsService().route(
                            {
                                origin: chunkOrigin,
                                destination: chunkDest,
                                waypoints: chunks[ci],
                                travelMode: window.google.maps.TravelMode.DRIVING,
                                region: 'UA',
                            },
                            (res: any, status: any) => {
                                if (status === 'OK' && res) resolve(res)
                                else { console.error('[DirectionsService]', status); resolve(null) }
                            }
                        )
                    } catch (e) { console.error('[DirectionsService error]', e); resolve(null) }
                })

                if (dirResult?.routes?.[0]?.legs) {
                    for (const leg of dirResult.routes[0].legs) {
                        totalDistance += leg.distance?.value || 0
                        totalDuration += leg.duration?.value || 0
                    }
                }
            }

            if (totalDistance === 0) {
                toast.error('Google Directions вернул 0 км. Проверьте адреса маршрута.')
                setIsCalculating(false)
                return
            }

            // 5. Save result
            updateExcelData((prev: any) => ({
                ...prev,
                routes: (prev?.routes || []).map((r: Route) => {
                    if (r.id !== route.id) return r

                    const geoMeta = {
                        origin: { lat: originLoc.lat(), lng: originLoc.lng() },
                        destination: { lat: destinLoc.lat(), lng: destinLoc.lng() },
                        waypoints: waypointLocs.map(loc => 
                            typeof loc === 'string' ? { address: loc } : { lat: loc.lat(), lng: loc.lng() }
                        )
                    }

                    const updatedOrders = r.orders.map(o => {
                        const upd = orderUpdates.find(u => u.id === o.id)
                        return upd ? { ...o, ...upd } : o
                    })

                    return { 
                        ...r, 
                        totalDistance: totalDistance / 1000, 
                        totalDuration: totalDuration / 60, 
                        orders: updatedOrders,
                        geoMeta,
                        isOptimized: true 
                    }
                })
            }))
            toast.success(`Маршрут рассчитан: ${(totalDistance / 1000).toFixed(1)} км`)
        } catch (err) {
            console.error('[calculateRouteDistance]', err)
            toast.error('Ошибка расчета')
        } finally {
            setIsCalculating(false)
        }
    }

        return { calculateRouteDistance, isCalculating, disambModal, setDisambModal, disambResolver, processDisambQueue, robustGeocode }
}
