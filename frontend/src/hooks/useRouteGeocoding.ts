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
import { useCallback, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { googleApiCache } from '../services/googleApiCache'
import { cleanAddress, generateStreetVariants } from '../utils/data/addressUtils'
import { getUkraineTrafficForOrders, calculateTotalTrafficDelay } from '../utils/maps/ukraineTrafficAPI'
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
    getCourierVehicleType,
    updateExcelData,
    validateOrders,
    setProblemOrders,
    setCurrentProblem,
    setShowCorrectionModal,
    setShowBatchPanel,
    cleanAddressForRoute
}: UseRouteGeocodingProps) => {
    const [isCalculating, setIsCalculating] = useState(false)
    const disambQueue = useRef<Array<{ title: string; options: any[]; resolve: (val: any) => void }>>([])
    const isProcessingQueue = useRef(false)
    const [disambModal, setDisambModal] = useState<{ open: boolean; title: string; options: any[] } | null>(null)
    const disambResolver = useRef<(choice: any | null) => void>()

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

    // ─── Core geocoding ──────────────────────────────────────────────────────
    /**
     * Geocode an address, retrying with street variants only until a perfect hit is found.
     *
     * OPTIMIZATION: Stops immediately when a ROOFTOP result inside the delivery zone is found.
     * This means most addresses require only 1 API call instead of 10-20.
     */
    const geocodeWithSector = async (rawAddress: string, hintPoint?: any): Promise<any | null> => {
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

        const autoReady = !confirmAddresses && !!best && !checkTechnicalKmlZone(best.geometry.location) && !!findZoneForLoc(best.geometry.location, zones)
        if (autoReady || !confirmAddresses) return best

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
            // 1. Geocode start address (use pinned coords if available)
            const useStartCoords = settings.defaultStartAddress === route.startAddress && settings.defaultStartLat && settings.defaultStartLng
            const startCoord = useStartCoords ? { lat: Number(settings.defaultStartLat), lng: Number(settings.defaultStartLng) } : null
            const originRes = startCoord
                ? { geometry: { location: startCoord }, formatted_address: route.startAddress }
                : await geocodeWithSector(route.startAddress)

            const baseRefPoint = originRes?.geometry?.location || null

            // 2. ★ COST OPTIMIZATION: Deduplicate identical order addresses
            //    Build a map of cleaned address → geocode result, geocoding each unique address only once.
            const addressToResult = new Map<string, any>()
            const uniqueAddresses = [...new Set(route.orders.map((o: any) => cleanAddress(o.address).trim().toLowerCase()))]

            await Promise.all(uniqueAddresses.map(async (cleanAddr) => {
                const raw = route.orders.find((o: any) => cleanAddress(o.address).trim().toLowerCase() === cleanAddr)?.address || cleanAddr
                const result = await geocodeWithSector(raw, baseRefPoint)
                addressToResult.set(cleanAddr, result)
            }))

            const waypointResList: Array<any | null> = route.orders.map((o: any) =>
                addressToResult.get(cleanAddress(o.address).trim().toLowerCase()) || null
            )

            // 3. Geocode end address
            const useEndCoords = settings.defaultEndAddress === route.endAddress && settings.defaultEndLat && settings.defaultEndLng
            const endCoord = useEndCoords ? { lat: Number(settings.defaultEndLat), lng: Number(settings.defaultEndLng) } : null
            const lastWPLoc = waypointResList[waypointResList.length - 1]?.geometry?.location || baseRefPoint
            const destinationRes = route.endAddress === route.startAddress
                ? originRes
                : endCoord
                    ? { geometry: { location: endCoord }, formatted_address: route.endAddress }
                    : await geocodeWithSector(route.endAddress, lastWPLoc)

            // 4. Validate all points inside zone
            const outsidePoints = [originRes, ...waypointResList, destinationRes].filter(r => r && !isInsideSector(r.geometry.location))
            if (outsidePoints.length > 0) {
                const problems = await validateOrders(route.orders)
                if (problems.length > 0) {
                    setProblemOrders(problems)
                    setCurrentProblem(problems[0])
                    if (problems.length === 1) setShowCorrectionModal(true)
                    else setShowBatchPanel(true)
                } else {
                    toast.error('Точки вне зоны')
                }
                setIsCalculating(false)
                return
            }

            // 5. Get directions
            const request = {
                origin: originRes?.geometry?.location || cleanAddressForRoute(route.startAddress),
                destination: destinationRes?.geometry?.location || cleanAddressForRoute(route.endAddress),
                waypoints: waypointResList.map(r => ({ location: r?.geometry?.location || '', stopover: true })),
                travelMode: window.google.maps.TravelMode.DRIVING,
            }

            const result = await googleApiCache.getDirections(request as any)
            if (result) {
                let totalDistance = result.routes[0].legs.reduce((total: number, leg: any) => total + leg.distance.value, 0)
                let totalDuration = result.routes[0].legs.reduce((total: number, leg: any) => total + leg.duration.value, 0)

                // Optional Mapbox traffic adjustment
                const mapboxToken = settings.mapboxToken || localStorage.getItem('km_mapbox_token')
                const vType = getCourierVehicleType(route.courier)
                if (mapboxToken) {
                    const chainForTraffic = route.orders.map((o: any, i: number) => ({
                        ...o,
                        coords: waypointResList[i] ? {
                            lat: typeof waypointResList[i].geometry.location.lat === 'function' ? waypointResList[i].geometry.location.lat() : waypointResList[i].geometry.location.lat,
                            lng: typeof waypointResList[i].geometry.location.lng === 'function' ? waypointResList[i].geometry.location.lng() : waypointResList[i].geometry.location.lng,
                        } : null
                    })).filter((o: any) => o.coords)

                    if (chainForTraffic.length > 0) {
                        const trafficInfo = await getUkraineTrafficForOrders(chainForTraffic as any, mapboxToken)
                        let trafficDelayMin = calculateTotalTrafficDelay(trafficInfo)
                        if (vType === 'motorcycle') trafficDelayMin *= 0.5
                        totalDuration += (trafficDelayMin * 60)
                    }
                }

                updateExcelData((prev: any) => ({
                    ...prev,
                    routes: (prev?.routes || []).map((r: Route) =>
                        r.id === route.id
                            ? { ...r, totalDistance: totalDistance / 1000, totalDuration: totalDuration / 60, isOptimized: true }
                            : r
                    )
                }))
            }
        } catch (err) {
            console.error(err)
            toast.error('Ошибка расчета')
        } finally {
            setIsCalculating(false)
        }
    }

    return { calculateRouteDistance, isCalculating, disambModal, setDisambModal, disambResolver, processDisambQueue }
}
