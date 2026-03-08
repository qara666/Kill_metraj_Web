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
import { robustGeocodingService } from '../services/robust-geocoding/RobustGeocodingService'
import { Route } from '../types/route'

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

    const findZoneForLoc = (locInput: any, _targetPolygons: any[]) => {
        const coords = robustGeocodingService.findZoneForCoords(
            typeof locInput.lat === 'function' ? locInput.lat() : locInput.lat,
            typeof locInput.lng === 'function' ? locInput.lng() : locInput.lng
        )
        if (!coords) return null
        return { name: coords.zoneName, folderName: coords.hubName }
    }

    /**
     * SOTA 5.68: Robust geocoding with centralized service and zone validation.
     */
    const robustGeocode = async (rawAddress: string, options: { hintPoint?: any; silent?: boolean } = {}): Promise<any | null> => {
        const { hintPoint, silent = false } = options
        const cityBias = settings.cityBias || 'Киев'

        // 1. Delegate core logic to the central service
        const result = await robustGeocodingService.geocode(rawAddress, {
            hintPoint,
            cityBias,
            silent: silent || !confirmAddresses
        })

        if (!result.best) return null

        // 2. If it's a silent call or confirmation is off, return the best hit immediately
        if (silent || !confirmAddresses) {
            // Strict rejection: if the score is horribly penalized (e.g. out of zone or disabled zone), reject it
            if (result.best.score <= -1000) return null
            return result.best.raw
        }

        // 3. If confirmation is required, check if we need to show the disambiguation modal
        const best = result.best
        const expectedHouse = extractHouseNumber(rawAddress)
        const streetNum = (best.raw.address_components || []).find(c => c.types.includes('street_number'))?.long_name
        const houseMatched = !expectedHouse || (streetNum && streetNum.toLowerCase() === expectedHouse.toLowerCase())
        
        const isSuspicious = !houseMatched || !best.isInsideZone || best.isTechnicalZone

        if (!isSuspicious && result.allCandidates.length <= 1) {
            return best.raw
        }

        // 4. Disambiguation modal
        const modalOptions = result.allCandidates.map(c => {
            const lat = c.lat
            const lng = c.lng
            const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`
            const isActive = c.isInsideZone
            
            const zoneStatus = !c.kmlZone 
                ? 'вне всех KML зон' 
                : (!isActive 
                    ? `${c.kmlZone} (выкл)` 
                    : (c.isTechnicalZone ? `${c.kmlZone} (АВТОРАЗГРУЗ)` : `${c.kmlZone}`))

            return {
                label: c.raw.formatted_address || 'Кандидат',
                mapsUrl,
                zoneName: zoneStatus,
                res: c.raw
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
        
        return choice || best.raw
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
                if (geocodeRes === null) {
                    toast.error(`Адрес вне активных зон доставки: ${order.address}`);
                    setIsCalculating(false);
                    return; // Prevent 100km routes
                }

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
