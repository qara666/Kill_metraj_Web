import { useEffect, useRef } from 'react';
import { useExcelData } from '../contexts/ExcelDataContext';
import { groupAllOrdersByTimeWindow } from '../utils/route/routeCalculationHelpers';
import { robustGeocodingService } from '../services/robust-geocoding/RobustGeocodingService';
import { localStorageUtils } from '../utils/ui/localStorage';
import { toast } from 'react-hot-toast';
import { needsAddressClarification } from '../utils/data/addressUtils';
import { normalizeCourierName, getCourierName } from '../utils/data/courierName';
import { useDashboardStore } from '../stores/useDashboardStore';
import { getStableOrderId } from '../utils/data/orderId';
import { normalizeDateToIso } from '../utils/data/dateUtils';
import { YapikoOSRMService } from '../services/YapikoOSRMService';
import { ValhallaService } from '../services/valhallaService';
import { calculateDistance } from '../utils/geoUtils';

export function useContinuousAutoRouting() {
    const { excelData, updateExcelData } = useExcelData();
    const isProcessingRef = useRef(false);
    const processedGroupSignatures = useRef<Set<string>>(new Set());
    const processedRefinements = useRef<Set<string>>(new Set()); 

    
    const excelDataRef = useRef(excelData);
    const updateExcelDataRef = useRef(updateExcelData);
    useEffect(() => { excelDataRef.current = excelData; }, [excelData]);
    useEffect(() => { updateExcelDataRef.current = updateExcelData; }, [updateExcelData]);

    const autoRoutingStatus = useDashboardStore(s => s.autoRoutingStatus);
    const setAutoRoutingStatus = useDashboardStore(s => s.setAutoRoutingStatus);
    const autoRoutingStatusRef = useRef(autoRoutingStatus);
    useEffect(() => { autoRoutingStatusRef.current = autoRoutingStatus; }, [autoRoutingStatus]);

    const runAutoRoutingRef = useRef<(() => Promise<void>) | null>(null);

    useEffect(() => {
        runAutoRoutingRef.current = async () => {
            const currentData = excelDataRef.current;
            const currentStatus = autoRoutingStatusRef.current;

            if (!currentData?.orders || !currentData?.couriers || !currentStatus.isActive) return;
            if (isProcessingRef.current) return;

            const currentStoreDate = normalizeDateToIso(useDashboardStore.getState().apiDateShift);
            const dataDate = currentData?.creationDate 
                || (currentData?.orders?.find((o: any) => o.creationDate))?.creationDate
                || null;
            const dataDateStr = dataDate ? normalizeDateToIso(dataDate) : '';
            
            if (currentStoreDate && dataDateStr && currentStoreDate !== dataDateStr) {
                console.warn(`[AutoRouting] Date mismatch: Store=${currentStoreDate}, Data=${dataDateStr}. Skipping.`);
                return;
            }

            isProcessingRef.current = true;
            
            try {
                const settings = localStorageUtils.getAllSettings();
                
                const isRealCourier = (name: any) => {
                    const n = normalizeCourierName(name);
                    return !!n && n !== 'Не назначено';
                };

                const getOrderCourier = (o: any) => {
                    if (o.courier && typeof o.courier === 'object') {
                        return o.courier.name || o.courier._id || o.courier.id || '';
                    }
                    return o.courierName || o.courierId || o.courier || '';
                };

                const eligibleOrders = currentData.orders.filter((o: any) => {
                    const status = String(o.status || '').toLowerCase();
                    // Exclude fully canceled/deleted/transferred orders 
                    const isCanceled = [
                        'отменен', 'отмена', 'удален', 'скасований', 'скасовано', 
                        'canceled', 'cancelled', 'deleted'
                    ].includes(status);
                    if (isCanceled) return false;
                    const cname = getOrderCourier(o);
                    return isRealCourier(cname);
                });

                // Status Calculation
                const processedOrderIds = new Set<string>();
                (currentData.routes || []).forEach((r: any) => {
                    (r.orders || []).forEach((o: any) => {
                        const oid = getStableOrderId(o);
                        if (oid) processedOrderIds.add(oid);
                    });
                });

                let skippedGeocoding = 0;
                let skippedInRoutes = 0;
                let skippedNoCourier = 0;

                currentData.orders.forEach((o: any) => {
                    const cname = getOrderCourier(o);
                    if (!isRealCourier(cname)) {
                        skippedNoCourier++;
                        return;
                    }
                    if (processedOrderIds.has(getStableOrderId(o))) {
                        skippedInRoutes++;
                        return;
                    }
                    if (!o.coords?.lat) {
                        skippedGeocoding++;
                    }
                });

                const totalSystemCouriers = currentData.couriers.filter(c => isRealCourier(c.name)).length;
                const courierNamesWithRoutes = new Set(
                    (currentData.routes || [])
                        .map((r: any) => normalizeCourierName(getCourierName(r.courier)))
                        .filter(n => !!n && n !== 'Не назначено')
                );

                setAutoRoutingStatus({ 
                    totalCount: currentData.orders.length, 
                    totalCouriers: totalSystemCouriers,
                    processedCount: processedOrderIds.size,
                    processedCouriers: courierNamesWithRoutes.size,
                    skippedGeocoding,
                    skippedInRoutes,
                    skippedNoCourier,
                    lastUpdate: Date.now() 
                });

                // Grouping
                const groupsMap = groupAllOrdersByTimeWindow(eligibleOrders, currentData.couriers);
                const eligibleGroups: any[] = [];
                for (const [courierId, timeGroups] of Array.from(groupsMap.entries())) {
                    for (const group of timeGroups) {
                        const actualCourierName = group.courierName && group.courierName !== 'Неизвестный курьер' 
                            ? group.courierName 
                            : courierId;

                        if (isRealCourier(actualCourierName)) {
                            eligibleGroups.push({ ...group, actualCourierName });
                        }
                    }
                }

                const courierToGroupsMap = new Map<string, any[]>();
                for (const g of eligibleGroups) {
                    const list = courierToGroupsMap.get(g.actualCourierName) || [];
                    list.push(g);
                    courierToGroupsMap.set(g.actualCourierName, list);
                }

                // === TWO-PASS GEOCODING ===
                // Pass 1: Fast turbo batch for all uncoded orders
                const allOrdersToGeocode = eligibleOrders.filter((o: any) => !o.coords?.lat);
                
                const applyGeoResult = (o: any, res: any) => {
                    if (res?.best?.raw?.geometry?.location) {
                        const loc = res.best.raw.geometry.location;
                        o.coords = { lat: Number(loc.lat), lng: Number(loc.lng) };
                        o.kmlZone = res.best.kmlZone || undefined;
                        o.kmlHub = res.best.kmlHub || undefined;
                        o.locationType = res.best.raw.geometry.location_type || undefined;
                        o.streetNumberMatched = res.best.streetNumberMatched;
                        o.geocodeScore = res.best.score ?? 0;
                    }
                };

                if (allOrdersToGeocode.length > 0) {
                    // Pass 1: Turbo (fast, catches ~80% of addresses)
                    const batchRequests = allOrdersToGeocode.map(o => ({
                        address: o.address,
                        options: { 
                            silent: true, 
                            turbo: true,
                            expectedDeliveryZone: o.deliveryZone || o.kmlZone 
                        }
                    }));
                    const batchResults = await robustGeocodingService.batchGeocode(batchRequests, { turbo: true });
                    allOrdersToGeocode.forEach((o: any) => {
                        const addr = o.address || '';
                        const res = batchResults.get(addr.trim().toLowerCase());
                        applyGeoResult(o, res);
                    });

                    // Pass 2: Full non-turbo retry for addresses that turbo missed
                    // This uses all providers, more variants, all fallback levels
                    const stillFailed = allOrdersToGeocode.filter((o: any) => !o.coords?.lat);
                    if (stillFailed.length > 0) {
                        
                        // Process in small batches to avoid rate limiting
                        const RETRY_BATCH = 3;
                        for (let i = 0; i < stillFailed.length; i += RETRY_BATCH) {
                            const retryChunk = stillFailed.slice(i, i + RETRY_BATCH);
                            const retryResults = await robustGeocodingService.batchGeocode(
                                retryChunk.map(o => ({
                                    address: o.address,
                                    options: { 
                                        turbo: false, // Full mode: all providers, all variants
                                        maxVariants: 8,
                                        expectedDeliveryZone: o.deliveryZone || o.kmlZone
                                    }
                                })),
                                { turbo: false }
                            );
                            retryChunk.forEach((o: any) => {
                                const addr = o.address || '';
                                const res = retryResults.get(addr.trim().toLowerCase());
                                applyGeoResult(o, res);
                                if (o.coords?.lat) {
                                } else {
                                }
                            });
                        }
                    }
                }

                // === SAVE GEOCODING PROGRESS IMMEDIATELY ===
                // This prevents losing geocoding progress if routing fails in the same tick.
                // Critical to break the "0/371" and "337 geo errors" deadlock. (v5.145)
                const newlyGeocoded = allOrdersToGeocode.filter((o: any) => o.coords?.lat);
                if (newlyGeocoded.length > 0) {
                    const geoMap = new Map<string, any>();
                    newlyGeocoded.forEach((o: any) => geoMap.set(getStableOrderId(o), { ...o }));
                    
                    updateExcelDataRef.current((prev: any) => {
                        const nO = (prev?.orders || []).map((o: any) => {
                            const up = geoMap.get(getStableOrderId(o));
                            return up ? { ...o, ...up } : o;
                        });
                        return { ...prev, orders: nO };
                    }, true);
                }

                // === COURIER REASSIGNMENT CLEANUP ===
                // If an order moved from Courier A to Courier B, purge Courier A's route for that order
                const currentCourierByOrderId = new Map<string, string>();
                eligibleOrders.forEach((o: any) => {
                    const oid = getStableOrderId(o);
                    const cname = normalizeCourierName(getOrderCourier(o));
                    if (oid && cname) currentCourierByOrderId.set(oid, cname);
                });

                // Routing Tasks
                const routingTasks: Array<{
                    actualCourierName: string;
                    chunkOrders: any[];
                    groupSignature: string;
                }> = [];

                for (const [actualCourierName, courierGroups] of courierToGroupsMap.entries()) {
                    for (const group of courierGroups) {
                        const { orders } = group;
                        const MAX_ORDERS = 20;
                        for (let i = 0; i < orders.length; i += MAX_ORDERS) {
                            const chunkOrders = orders.slice(i, i + MAX_ORDERS);
                            const groupSignature = chunkOrders
                                .map((o: any) => `${getStableOrderId(o)}_${o.address}_${actualCourierName}`)
                                .sort()
                                .join('|');
                            const chunkOrderIds = chunkOrders.map((o: any) => getStableOrderId(o)).sort().join('|');
                            
                            if (processedGroupSignatures.current.has(groupSignature)) continue;

                            const existingRoute = (currentData.routes || []).find((r: any) => {
                                const sameOrders = r.orders.map((ro: any) => getStableOrderId(ro)).sort().join('|') === chunkOrderIds;
                                const sameCourier = normalizeCourierName(r.courier) === normalizeCourierName(actualCourierName);
                                return sameOrders && sameCourier;
                            });

                            if (existingRoute) {
                                processedGroupSignatures.current.add(groupSignature);
                                continue;
                            }

                            routingTasks.push({ actualCourierName, chunkOrders, groupSignature });
                        }
                    }
                }

                // Parallel Routing (Quantum Burst)
                const CONCURRENCY = 10;
                let taskIdx = 0;
                const batchUpdates = new Map<string, { routes: any[], orderUpdates: Map<string, any> }>();
                const updatedNames = new Set<string>();

                const runTask = async (): Promise<void> => {
                    if (taskIdx >= routingTasks.length) return;
                    const { actualCourierName, chunkOrders, groupSignature } = routingTasks[taskIdx++];
                    
                    try {
                        const newRoute: any = {
                            id: `autoroute_${Date.now()}_rnd${Math.floor(Math.random() * 10000)}`,
                            courier: actualCourierName,
                            orders: [...chunkOrders],
                            totalDistance: 0,
                            totalDuration: 0,
                            isOptimized: false,
                            createdAt: Date.now(),
                            isAutoGenerated: true,
                            hasGeoErrors: chunkOrders.some((o: any) => 
                                needsAddressClarification({
                                    locationType: o.locationType,
                                    streetNumberMatched: o.streetNumberMatched,
                                    hasCoords: !!o.coords?.lat,
                                    geocodeScore: o.geocodeScore
                                })
                            )
                        };

                        // 1. Robust Coordinate Parsing (Handles commas/dots/nulls)
                        const safeNum = (val: any) => {
                            if (val === null || val === undefined) return null;
                            const parsed = parseFloat(String(val).replace(',', '.'));
                            return isNaN(parsed) ? null : parsed;
                        };

                        const points: { lat: number; lng: number }[] = [];
                        const sLat = safeNum(settings?.defaultStartLat);
                        const sLng = safeNum(settings?.defaultStartLng);
                        
                        if (sLat !== null && sLng !== null) {
                            points.push({ lat: sLat, lng: sLng });
                        }

                        chunkOrders.forEach((o: any) => {
                            const oLat = safeNum(o.coords?.lat);
                            const oLng = safeNum(o.coords?.lng);
                            if (oLat !== null && oLng !== null) {
                                points.push({ lat: oLat, lng: oLng });
                            }
                        });

                        const eLat = safeNum(settings?.defaultEndLat);
                        const eLng = safeNum(settings?.defaultEndLng);
                        if (eLat !== null && eLng !== null) {
                            points.push({ lat: eLat, lng: eLng });
                        } else if (points.length > 0) {
                            // If end is missing, return to start point
                            points.push(points[0]);
                        }

                        // Debug Trace: What points are we actually calculating?
                        console.debug(`[AutoRoute] Trace (${actualCourierName}):`, 
                            points.map(p => `(${p.lat.toFixed(6)}, ${p.lng.toFixed(6)})`).join(' -> ')
                        );

                        if (points.length >= 2) {
                            // Detect A->A loop: Hub missing, single order, endpoint = startpoint
                            const hasHub = (sLat !== null && sLng !== null);
                            const uniquePoints = points.filter((p, i) => 
                                i === 0 || Math.abs(p.lat - points[i-1].lat) > 0.00001 || Math.abs(p.lng - points[i-1].lng) > 0.00001
                            );

                            if (uniquePoints.length < 2) {
                                // All points are at the same location — skip routing
                                console.warn(`[AutoRoute] ⚠️ ${actualCourierName}: все точки совпадают, пропускаю расчет маршрута.`);
                                newRoute.hasGeoErrors = true;
                            } else {
                                const routePoints = uniquePoints;
                                let maxL = 0;
                                for (let i = 0; i < routePoints.length - 1; i++) {
                                    const d = calculateDistance(routePoints[i], routePoints[i + 1]) / 1000;
                                    if (d > maxL) maxL = d;
                                }

                                if (maxL > 15) {
                                    newRoute.hasGeoErrors = true;
                                    console.warn(`[AutoRoute] ⚠️ ${actualCourierName}: аномальное расстояние ${maxL.toFixed(1)} км между точками.`);
                                } else {
                                    let dist = 0, dur = 0, eng = '';

                                    // Primary: Yapiko OSRM
                                    if (settings?.yapikoOsrmUrl?.trim()) {
                                        try {
                                            const yapikoUrl = settings.yapikoOsrmUrl.trim();
                                            console.debug(`[AutoRoute] Yapiko запрос (${actualCourierName}): ${routePoints.length} точек`);
                                            const r = await YapikoOSRMService.calculateRoute(routePoints, yapikoUrl);
                                            if (r.feasible) {
                                                dist = r.totalDistance || 0;
                                                dur = r.totalDuration || 0;
                                                eng = 'yapiko_osrm';
                                            } else {
                                            }
                                        } catch (e) {
                                            console.error(`[AutoRoute] Yapiko ошибка (${actualCourierName}):`, e);
                                        }
                                    }

                                    // Fallback: Valhalla
                                    if (!dist) {
                                        try {
                                            const r = await ValhallaService.calculateRoute(routePoints);
                                            if (r.feasible && (r.totalDistance || 0) > 0) {
                                                dist = r.totalDistance || 0;
                                                dur = r.totalDuration || 0;
                                                eng = 'valhalla';
                                            }
                                        } catch {}
                                    }

                                    // Last resort: Crow-flies x1.4
                                    if (!dist) {
                                        let ckm = 0;
                                        for (let i = 0; i < routePoints.length - 1; i++) ckm += calculateDistance(routePoints[i], routePoints[i + 1]) / 1000;
                                        dist = ckm * 1.4 * 1000;
                                        dur = (dist / 1000) * 2 * 60;
                                        eng = 'crow_flies';
                                    }

                                    // dist is in METERS from Yapiko/Valhalla, convert to KM for UI
                                    newRoute.totalDistanceKm = parseFloat((dist / 1000).toFixed(2));
                                    newRoute.totalDistance = parseFloat((dist / 1000).toFixed(2));
                                    newRoute.totalDuration = Math.round(dur / 60);
                                    newRoute.totalDurationMin = Math.round(dur / 60);
                                    newRoute.isOptimized = true;
                                    newRoute.routingEngine = eng;

                                    // Hub info for display
                                    if (hasHub) {
                                        newRoute.startAddress = settings.defaultStartAddress || `${sLat}, ${sLng}`;
                                        newRoute.endAddress = settings.defaultEndAddress || newRoute.startAddress;
                                    }
                                }
                            }
                        }

                        if (newRoute.isOptimized || newRoute.hasGeoErrors) {
                            const b = batchUpdates.get(actualCourierName) || { routes: [], orderUpdates: new Map<string, any>() };
                            b.routes.push(newRoute);
                            chunkOrders.forEach(o => b.orderUpdates.set(getStableOrderId(o), { ...o }));
                            batchUpdates.set(actualCourierName, b);
                            processedGroupSignatures.current.add(groupSignature);
                            updatedNames.add(actualCourierName);
                        }
                    } catch (e) {
                        console.error(`[AutoRouting] Parallel task fail:`, e);
                    } finally {
                        await runTask();
                    }
                };

                const initialWorkers = [];
                for (let i = 0; i < Math.min(CONCURRENCY, routingTasks.length); i++) {
                    initialWorkers.push(runTask());
                }
                await Promise.all(initialWorkers);

                if (batchUpdates.size > 0) {
                    updateExcelDataRef.current((prev: any) => {
                        let nO = [...(prev?.orders || [])];
                        let nR = [...(prev?.routes || [])];
                        
                        // Collect ALL order IDs that are being updated in this batch
                        const allNewOrderIds = new Set<string>();
                        batchUpdates.forEach(b => {
                            b.routes.forEach(r => r.orders.forEach((o: any) => allNewOrderIds.add(getStableOrderId(o))));
                        });

                        // 1. Global Route Purge: Remove ANY auto-generated route that:
                        //    a) Contains an order being updated (standard dedup)
                        //    b) Contains an order that has moved to a different courier (reassignment)
                        nR = nR.filter(r => {
                            if (!r.isAutoGenerated) return true; // Keep manual routes
                            
                            const routeCourierNorm = normalizeCourierName(r.courier);
                            
                            for (const ro of r.orders) {
                                const oid = getStableOrderId(ro);
                                // Standard: order is in current update batch
                                if (allNewOrderIds.has(oid)) return false;
                                // Reassignment: order's current courier doesn't match this route's courier
                                const currentCourier = currentCourierByOrderId.get(oid);
                                if (currentCourier && currentCourier !== routeCourierNorm) {
                                    return false;
                                }
                            }
                            return true;
                        });

                        // 2. Apply updates
                        batchUpdates.forEach((b) => {
                            // Update orders with geo/route metadata
                            nO = nO.map(o => {
                                const up = b.orderUpdates.get(getStableOrderId(o));
                                return up ? { ...o, ...up } : o;
                            });
                            
                            // Add the new routes
                            nR = [...nR, ...b.routes];
                        });

                        return { ...prev, orders: nO, routes: nR };
                    }, true);

                    if (updatedNames.size > 0) {
                        toast.success(`Рассчитано: ${Array.from(updatedNames).join(', ')}`, { icon: '🤖' });
                    }
                }


                // Refinement Pass
                try {
                    const needsRef = currentData.orders.filter((o: any) => {
                        const sid = getStableOrderId(o);
                        const rk = `${sid}_${o.address}`;
                        if (processedRefinements.current.has(rk)) return false;
                        return needsAddressClarification({
                            locationType: o.locationType,
                            streetNumberMatched: o.streetNumberMatched,
                            hasCoords: !!o.coords?.lat
                        });
                    });

                    if (needsRef.length > 0) {
                        const batch = needsRef.slice(0, 10);
                        const requests = batch.map(o => ({
                            address: o.address,
                            options: { turbo: false, forceCityBias: true, silent: true }
                        }));
                        const results = await robustGeocodingService.batchGeocode(requests, { turbo: false });
                        const updates = new Map<string, any>();
                        for (const o of batch) {
                            const sid = getStableOrderId(o);
                            processedRefinements.current.add(`${sid}_${o.address}`);
                            const addr = o.address || '';
                            const r = results.get(addr.trim().toLowerCase());
                            if (r?.best?.raw?.geometry?.location) {
                                const loc = r.best.raw.geometry.location;
                                updates.set(sid, {
                                    ...o,
                                    coords: { lat: Number(loc.lat), lng: Number(loc.lng) },
                                    kmlZone: r.best.kmlZone || undefined,
                                    kmlHub: r.best.kmlHub || undefined,
                                    locationType: r.best.raw.geometry.location_type || undefined,
                                    streetNumberMatched: r.best.streetNumberMatched
                                });
                            }
                        }
                        if (updates.size > 0) {
                            updateExcelDataRef.current((prev: any) => {
                                let nO = (prev?.orders || []).map((order: any) => {
                                    const u = updates.get(getStableOrderId(order));
                                    return u ? { ...order, ...u } : order;
                                });
                                let nR = (prev?.routes || []).map((route: any) => ({
                                    ...route,
                                    orders: route.orders.map((ro: any) => {
                                        const u = updates.get(getStableOrderId(ro));
                                        return u ? { ...ro, ...u } : ro;
                                    })
                                }));
                                return { ...prev, orders: nO, routes: nR };
                            }, true);
                        }
                    }
                } catch {}

            } catch (err) {
                console.error('[AutoRouting] Critical failure:', err);
            } finally {
                isProcessingRef.current = false;
            }
        };
    }, []);

    // Active Loop
    useEffect(() => {
        if (!autoRoutingStatus.isActive) {
            isProcessingRef.current = false;
            return;
        }
        const run = () => runAutoRoutingRef.current?.();
        const intervalId = setInterval(run, 60000); // v19.0: Polling reduced (Backend Robot handles primary calculations)
        const t = setTimeout(run, 2000); // Initial delay increased to allow backend push first
        return () => { clearInterval(intervalId); clearTimeout(t); };
    }, [autoRoutingStatus.isActive]);

    // Structural trigger
    const lastSigRef = useRef('');
    useEffect(() => {
        if (!autoRoutingStatus.isActive) return;
        const sig = (excelData?.orders || [])
            .map(o => `${getStableOrderId(o)}|${o.address}|${o.courier}|${o.status}`)
            .sort().join(',');
        if (sig !== lastSigRef.current) {
            lastSigRef.current = sig;
            const t = setTimeout(() => runAutoRoutingRef.current?.(), 800);
            return () => clearTimeout(t);
        }
    }, [excelData?.orders, autoRoutingStatus.isActive]);
}
