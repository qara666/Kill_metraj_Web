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
import { useCalculationProgress } from '../store/calculationProgressStore'

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

export const hashString = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return hash;
};

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
    const robustGeocode = async (rawAddress: string, options: { 
        hintPoint?: any; 
        silent?: boolean; 
        strictZoneFallback?: boolean; 
        expectedDeliveryZone?: string | null; 
        addressGeoStr?: string;
        turbo?: boolean;
        skipNormalization?: boolean;
        forceManualSelection?: boolean;
    } = {}): Promise<any | null> => {
        const { hintPoint, silent = false, strictZoneFallback = true, expectedDeliveryZone = null, addressGeoStr } = options
        const cityBias = settings.cityBias || 'Киев'

        // 1. Delegate core logic to the central service
        const result = await robustGeocodingService.geocode(rawAddress, {
            hintPoint,
            cityBias,
            silent: silent || !confirmAddresses,
            expectedDeliveryZone,
            addressGeoStr,
            turbo: options.turbo ?? true, // Default to turbo in hook
            skipNormalization: options.skipNormalization
        })

        if (!result.best && options.forceManualSelection) {
            // v38: Manual Refinement Requested
            // If no variants found automatically, show modal anyway to allow manual map pick
             const choice: any = await new Promise(resolve => {
                disambQueue.current.push({
                    title: `УТОЧНЕНИЕ: "${rawAddress}" (Автопоиск не дал результатов)`,
                    options: [], // Empty options triggers map-only mode
                    resolve
                })
                processDisambQueue()
            })
            if (choice) {
                return {
                    best: {
                        raw: choice,
                        score: 1000,
                        isInsideZone: true,
                        kmlZone: 'Выбрано вручную',
                        streetNumberMatched: true,
                        locationType: 'ROOFTOP'
                    },
                    allCandidates: [],
                    resolvedVariant: choice
                }
            }
        }

        const best = result.best
        if (!best) return result // Return empty result so caller knows it failed

        const toLocLocal = (res: any): any => {
            if (!res?.geometry?.location) return null
            const loc = res.geometry.location
            return { lat: Number(loc.lat), lng: Number(loc.lng) }
        }

        // v35.9.14: Suspect Jump Protection (Iron Curtain)
        // Skip in turbo/silent mode to avoid extra provider calls
        let suspectJump = false
        if (!options.turbo && hintPoint && result.allCandidates.length > 1) {
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
            if (strictZoneFallback && best.score < -5000000) return null
            return result
        }

        // 3. If confirmation is required OR suspect jump detected
        const expectedHouse = extractHouseNumber(rawAddress)
        const streetNum = (best.raw.address_components || []).find((c: any) => c.types.includes('street_number'))?.long_name
        const houseMatched = !expectedHouse || (streetNum && streetNum.toLowerCase() === expectedHouse.toLowerCase())

        const isSuspicious = !houseMatched || !best.isInsideZone || best.isTechnicalZone

        // ─── Smart Auto-Select: skip modal if top candidate is clearly the best ───
        // Conditions for auto-skip:
        //   a) House number matches
        //   b) Inside delivery zone  
        //   c) Score is high (above threshold)
        //   d) Not a suspect jump
        //   e) Only 1 candidate OR top candidate significantly outscores #2
        const HIGH_CONFIDENCE_SCORE = -50000; // Tunable threshold
        const isHighConfidence = houseMatched && best.isInsideZone && !best.isTechnicalZone && (best.score >= HIGH_CONFIDENCE_SCORE);
        const topScoreLead = result.allCandidates.length >= 2
            ? (best.score - (result.allCandidates[1]?.score ?? -Infinity))
            : Infinity;
        const hasStrongLead = topScoreLead > 50000; // Top candidate clearly wins

        if (!suspectJump && isHighConfidence && (result.allCandidates.length <= 1 || hasStrongLead)) {
            return result; // Auto-select the best candidate, no modal needed
        }

        if (!isSuspicious && result.allCandidates.length <= 1) {
            return result
        }

        // 4. Disambiguation modal (only when genuinely ambiguous)
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

        if (choice) {
            result.best = { 
                ...best, 
                raw: choice,
                locationType: choice.geometry?.location_type || 'ROOFTOP'
            };
        }
        return result;
    }


    // ─── Main route calculation ──────────────────────────────────────────────

    const calculateRouteDistance = async (
        route: Route, 
        skipStateUpdate: boolean = false,
        externalCache?: Map<string, any>
    ): Promise<Route | null> => {
        if (!skipStateUpdate) setIsCalculating(true)
        if (!skipStateUpdate) useCalculationProgress.getState().setProgress(0)
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
                const cachedRes = externalCache?.get(cleanedStart) as any;
                if (cachedRes && cachedRes.best) {
                    originLoc = toLoc(cachedRes.best.raw);
                } else {
                    const res = await robustGeocode(cleanAddressForRoute(route.startAddress), { silent: true, strictZoneFallback: false });
                    originLoc = (res && res.best) ? toLoc(res.best.raw) : null;
                    if (res && externalCache) externalCache.set(cleanedStart, res);
                }
            }

            if (!skipStateUpdate) useCalculationProgress.getState().setProgress(5);

            if (!originLoc) {
                toast.error('Не удалось определить адрес старта. Настройте адрес Базы в Настройках.');
                if (!skipStateUpdate) setIsCalculating(false);
                return null;
            }

            // 2. Process Waypoints (Lightning Parallel Batch)
            const addrCache = externalCache || new Map<string, any>();
            const orderUpdates: any[] = [];
            const waypointLocs: any[] = [];

            // FAST-PATH: If all orders have coordinates and we aren't confirming addresses,
            // we can map them instantly without any yields or geocoding logic.
            if (allOrdersHaveCoords && !confirmAddresses) {
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
            // NORMAL-PATH (v36 Parallel)
            // FAST-PATH: Basic bypass for orders with pre-existing coordinates
            const ordersToGeocode: any[] = [];
            
            route.orders.forEach(order => {
                const cleaned = cleanAddressForRoute(order.address);
                const key = cleaned.toLowerCase();
                const addressGeoStr = (order as any).addressGeoStr;

                // Priority 1: Check internal cache
                if (addrCache.has(key)) return;

                // Priority 2: addressGeo bypass (v36: Lightning Transformer)
                if (order.coords?.lat && order.coords?.lng) {
                    const loc = { lat: order.coords.lat, lng: order.coords.lng };
                    
                    // v38.2: Lookup zone if missing but coords exist to ensure badges are visible
                    let kz = order.kmlZone;
                    let kh = order.kmlHub;
                    
                    // Always try to lookup KML zone if it's missing or ID:0, even if deliveryZone (OP) exists
                    const isInvalidZone = !kz || (typeof kz === 'string' && kz.toUpperCase().includes('ID:0'));
                    if (isInvalidZone) {
                        const zoneRes = robustGeocodingService.findZoneForCoords(loc.lat, loc.lng);
                        if (zoneRes) {
                            kz = zoneRes.zoneName;
                            kh = zoneRes.hubName;
                        }
                    }

                    addrCache.set(key, {
                        best: {
                            raw: {
                                formatted_address: order.address,
                                geometry: {
                                    location: loc,
                                    location_type: 'ROOFTOP'
                                },
                            },
                            kmlZone: kz,
                            kmlHub: kh,
                            streetNumberMatched: true,
                            score: 1000000,
                            isLocked: true
                        },
                        streetNumberMatched: true,
                        score: 1000000,
                        isLocked: true
                    });
                    return;
                }

                // If not matched, add to batch geocode queue
                ordersToGeocode.push({ 
                    address: cleaned, 
                    options: { 
                        addressGeoStr: addressGeoStr,
                        expectedDeliveryZone: order.deliveryZone || null,
                        hintPoint: originLoc,
                        turbo: true,
                        silent: true
                    }
                });
            });

            if (ordersToGeocode.length > 0) {
                if (!skipStateUpdate) useCalculationProgress.getState().setProgress(10);
                
                // v37: Use optimized batchGeocode
                const batchResult = await robustGeocodingService.batchGeocode(ordersToGeocode, { turbo: true });
                
                // Merge back to addrCache
                batchResult.forEach((res, addr) => {
                    addrCache.set(addr.toLowerCase(), res);
                });
                
                if (!skipStateUpdate) useCalculationProgress.getState().setProgress(70); 
            }

            // Map results back to route waypoints
            for (const order of route.orders) {
                const cleaned = cleanAddressForRoute(order.address);
                const key = cleaned.toLowerCase();
                const geocodeRes = addrCache.get(key);

                let best = geocodeRes?.best;
                let loc: any = null;

                if (!best || !toLoc(best.raw)) {
                     // v5.153: Enhanced fallback strategies for failed geocoding
                     
                     // Strategy 1: Try without house number (just street)
                     const streetOnly = cleaned.replace(/\d+[а-яА-Яa-zA-Z]?\s*$/g, '').trim();
                     let fallbackRes = await robustGeocode(streetOnly, { 
                         silent: true, 
                         strictZoneFallback: false,
                         hintPoint: originLoc 
                     });
                     
                     // Strategy 2: Try with simplified address (remove special chars, floor, apt info)
                     if (!fallbackRes?.best) {
                         const simplified = order.address
                             .replace(/(?:под|подъезд|п)\s*\d+/gi, '')
                             .replace(/(?:эт|этаж|этаж)\s*\d+/gi, '')
                             .replace(/(?:кв|квартира)\s*\d+/gi, '')
                             .replace(/д\/ф\s*\w*/gi, '')
                             .replace(/\s+/g, ' ')
                             .trim();
                         fallbackRes = await robustGeocode(simplified, { 
                             silent: true, 
                             strictZoneFallback: false,
                             hintPoint: originLoc 
                         });
                     }
                     
                     // Strategy 3: Try with just city + street name
                     if (!fallbackRes?.best) {
                         const cityMatch = order.address.match(/(Київ|Киев|область)/i);
                         const streetMatch = order.address.match(/(вул|просп|пр-т|пров|пер|бульвар)\s*[\w\s'-]+/i);
                         if (streetMatch) {
                             const minimalAddr = cityMatch ? `${cityMatch[1]}, ${streetMatch[0]}` : streetMatch[0];
                             fallbackRes = await robustGeocode(minimalAddr, { 
                                 silent: true, 
                                 strictZoneFallback: false,
                                 hintPoint: originLoc 
                             });
                         }
                     }
                     
                     if (fallbackRes?.best) {
                         best = fallbackRes.best;
                         addrCache.set(key, fallbackRes);
                     } else {
                         // Last resort: Skip this order with warning instead of blocking entire route
                         toast(`Адрес пропущен: ${order.address.substring(0, 50)}...`, { icon: '⚠️', duration: 3000 });
                         continue; // Skip this order, continue with others
                     }
                 }
                 
                 loc = toLoc(best.raw);
                 if (!loc) continue; // Skip if no valid location
                 
                 waypointLocs.push(loc);
                 const update: any = { 
                     id: order.id,
                     lat: loc.lat, 
                     lng: loc.lng,
                     kmlZone: best.kmlZone,
                     kmlHub: best.kmlHub,
                     streetNumberMatched: best.streetNumberMatched,
                     geocodeRes: best.raw
                 };
                 if (best.raw.geometry?.location_type) {
                     update.locationType = best.raw.geometry.location_type;
                 }
                 orderUpdates.push(update);
             }
            } // End of else (NORMAL-PATH)

             // 2.5 Save GEODATA IMMEDIATELY (v35.9.6: Persistence Priority)
            // This ensures KML zones and coordinates are visible even if the routing engine fails.
            // NOTE: Skip in batch mode (skipStateUpdate=true) because routes don't exist in state yet —
            // the geodata will be included in the final atomic commit in RouteManagement.tsx.
            if (!skipStateUpdate && orderUpdates.length > 0) {
                updateExcelData((prev: any) => {
                    const next = { ...prev };
                    
                    // 1. Update orders in routes
                    next.routes = (prev?.routes || []).map((r: Route) => {
                        if (r.id !== route.id) return r;
                        return {
                            ...r,
                            orders: r.orders.map(o => {
                                const upd = orderUpdates.find(u => u.id === o.id);
                                return upd ? { ...o, ...upd } : o;
                            })
                        };
                    });

                    // 2. Update orders in global list (for consistent badges in Courier tab etc)
                    next.orders = (prev?.orders || []).map((o: any) => {
                        const upd = orderUpdates.find(u => String(u.id) === String(o.id));
                        return upd ? { ...o, ...upd } : o;
                    });

                    return next;
                });
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
                destinLoc = (res && res.best) ? (toLoc(res.best.raw) || originLoc) : originLoc
            }

            if (!skipStateUpdate) useCalculationProgress.getState().setProgress(90)

            // ─── TURBO INSTANT MODE ───────────────────────────────────────────────────
            // When routingProvider is 'turbo_instant':
            //   - Immediately use order.coords (skip geocoding chain entirely)
            //   - Race all 3 routing engines in parallel — take the first valid result
            //   - Skip ALL anomaly checks, per-leg disambiguation, etc.
            const routingProvider = settings.routingProvider || 'turbo_instant'
            
            if (routingProvider === 'turbo_instant') {
                // Super-fast path: use raw cached coords directly
                const turboPoints = [originLoc, ...waypointLocs, destinLoc].map(l => {
                    const lat = typeof l.lat === 'function' ? l.lat() : l.lat
                    const lng = typeof l.lng === 'function' ? l.lng() : (l.lng || (l as any).lon)
                    return { lat: Number(lat), lng: Number(lng) }
                })

                const yapikoUrl = (settings.yapikoOsrmUrl || '').trim()

                // Race all 3 engines in parallel — return first valid result
                const raceResults = await Promise.allSettled([
                    // 1. Yapiko OSRM (custom local server)
                    yapikoUrl ? (async () => {
                        const { YapikoOSRMService } = await import('../services/YapikoOSRMService')
                        const r = await YapikoOSRMService.calculateRoute(turboPoints, yapikoUrl)
                        if (r.feasible && (r.totalDistance ?? 0) > 0) return { dist: r.totalDistance ?? 0, dur: r.totalDuration ?? 0, src: 'Yapiko' }
                        throw new Error('Yapiko returned 0')
                    })() : Promise.reject('No Yapiko URL'),

                    // 2. Public OSRM
                    (async () => {
                        const { OSRMService } = await import('../services/osrmService')
                        const r = await OSRMService.calculateRoute(turboPoints)
                        if (r.feasible && (r.totalDistance ?? 0) > 0) return { dist: r.totalDistance ?? 0, dur: r.totalDuration ?? 0, src: 'OSRM' }
                        throw new Error('OSRM returned 0')
                    })(),

                    // 3. Valhalla
                    (async () => {
                        const { ValhallaService } = await import('../services/valhallaService')
                        const r = await ValhallaService.calculateRoute(turboPoints)
                        if (r.feasible && (r.totalDistance ?? 0) > 0) return { dist: r.totalDistance ?? 0, dur: r.totalDuration ?? 0, src: 'Valhalla' }
                        throw new Error('Valhalla returned 0')
                    })()
                ])

                const winner = raceResults.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<any> | undefined

                if (winner) {
                    const totalDistance = winner.value.dist
                    const totalDuration = winner.value.dur

                    const geoMeta = {
                        origin: originLoc,
                        destination: destinLoc,
                        waypoints: waypointLocs.map((loc, idx) => {
                            const base = typeof loc === 'string' ? { address: loc } : loc;
                            const orderId = route.orders[idx].id;
                            const upd = orderUpdates.find(u => u.id === orderId);
                            if (upd) {
                                return {
                                    ...base,
                                    zoneName: upd.kmlZone,
                                    hubName: upd.kmlHub,
                                    locationType: upd.locationType,
                                    streetNumberMatched: upd.streetNumberMatched
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
                        orders: route.orders.map((o: any) => {
                            const upd = orderUpdates.find((u: any) => u.id === o.id)
                            return upd ? { ...o, ...upd } : o
                        })
                    }

                    if (!skipStateUpdate) {
                        updateExcelData((prev: any) => ({
                            ...prev,
                            routes: (prev?.routes || []).map((r: Route) => r.id === route.id ? updatedRoute : r)
                        }))
                        toast.success(`⚡ Turbo: ${(totalDistance / 1000).toFixed(1)} км`)
                        setIsCalculating(false)
                        useCalculationProgress.getState().setProgress(100)
                        setTimeout(() => useCalculationProgress.getState().setProgress(0), 1000)
                    }
                    return updatedRoute
                }

                // All engines failed
                if (!skipStateUpdate) {
                    toast.error('Ошибка: Все провайдеры недоступны. Проверьте сеть.')
                    setIsCalculating(false)
                }
                return null
            }

            // ─── STANDARD ANOMALY GUARD ──────────────────────────────────────────────

            // Declare standard routing vars for non-turbo path
            const points = [originLoc, ...waypointLocs, destinLoc].map(l => {
                const lat = typeof l.lat === 'function' ? l.lat() : l.lat
                const lng = typeof l.lng === 'function' ? l.lng() : (l.lng || (l as any).lon)
                return { lat: Number(lat), lng: Number(lng) }
            })
            const yapikoUrl = (settings.yapikoOsrmUrl || '').trim()
            let totalDistance = 0
            let totalDuration = 0
            let routingSuccess = false

            if (!skipStateUpdate) useCalculationProgress.getState().setProgress(95)


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
                    if (res && res.best) {
                        return {
                            ...base,
                            zoneName: res.best.kmlZone,
                            hubName: res.best.kmlHub,
                            locationType: res.best.raw.geometry?.location_type,
                            streetNumberMatched: res.best.streetNumberMatched,
                            score: res.best.score
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
                hasGeoErrors: false, // Ensure the warning triangle disappears
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
                useCalculationProgress.getState().setProgress(100)
                setTimeout(() => useCalculationProgress.getState().setProgress(0), 1000)
            }

            return updatedRoute;

        } catch (e) {
            console.error('[Расчет] Критическая ошибка:', e)
            if (!skipStateUpdate) toast.error('Произошла критическая ошибка при расчете маршрута.')
            if (!skipStateUpdate) setIsCalculating(false)
            if (!skipStateUpdate) useCalculationProgress.getState().setProgress(0)
            return null;
        }
    }

    return {
        calculateRouteDistance,
        isCalculating,
        setIsCalculating,
        disambModal,
        setDisambModal,
        disambResolver,
        processDisambQueue,
        robustGeocode,
        batchGeocode: robustGeocodingService.batchGeocode.bind(robustGeocodingService)
    }
}
