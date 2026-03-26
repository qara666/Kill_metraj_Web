import { useEffect, useRef } from 'react';
import { useExcelData } from '../contexts/ExcelDataContext';
import { groupAllOrdersByTimeWindow } from '../utils/route/routeCalculationHelpers';
import { robustGeocodingService } from '../services/robust-geocoding/RobustGeocodingService';
import { localStorageUtils } from '../utils/ui/localStorage';
import { toast } from 'react-hot-toast';
import { needsAddressClarification } from '../utils/data/addressUtils';
import { isId0CourierName, normalizeCourierName } from '../utils/data/courierName';
import { useDashboardStore } from '../stores/useDashboardStore';
import { getStableOrderId } from '../utils/data/orderId';
import { normalizeDateToIso } from '../utils/data/dateUtils';

const cleanAddressForRoute = (raw: string): string => {
    if (!raw) return '';
    return raw.replace(/,\s*(под\.|подъезд|д\/ф|эт|этаж|эт\.|под|kв|квартира|оф|офис).*$/i, '').trim();
};

export function useContinuousAutoRouting() {
    const { excelData, updateExcelData } = useExcelData();
    const isProcessingRef = useRef(false);
    const processedGroupSignatures = useRef<Set<string>>(new Set());
    const processedRefinements = useRef<Set<string>>(new Set()); 
    
    // v5.117: Keep a stable ref to excelData so the routing loop does NOT
    // restart (teardown+setup) every time data updates.
    const excelDataRef = useRef(excelData);
    const updateExcelDataRef = useRef(updateExcelData);
    useEffect(() => { excelDataRef.current = excelData; }, [excelData]);
    useEffect(() => { updateExcelDataRef.current = updateExcelData; }, [updateExcelData]);

    const autoRoutingStatus = useDashboardStore(s => s.autoRoutingStatus);
    const setAutoRoutingStatus = useDashboardStore(s => s.setAutoRoutingStatus);
    const autoRoutingStatusRef = useRef(autoRoutingStatus);
    useEffect(() => { autoRoutingStatusRef.current = autoRoutingStatus; }, [autoRoutingStatus]);

    // Stable routing function (captured once, reads data from refs)
    const runAutoRoutingRef = useRef<(() => Promise<void>) | null>(null);

    useEffect(() => {
        runAutoRoutingRef.current = async () => {
            const currentData = excelDataRef.current;
            const currentStatus = autoRoutingStatusRef.current;

            if (!currentData?.orders || !currentData?.couriers || !currentStatus.isActive) return;
            if (isProcessingRef.current) return;

            // v5.110: Date-aware execution guard
            const currentStoreDate = normalizeDateToIso(useDashboardStore.getState().apiDateShift);
            const dataDate = currentData?.creationDate || (currentData?.orders?.[0]?.creationDate);
            const dataDateStr = normalizeDateToIso(dataDate);
            
            if (currentStoreDate && dataDateStr && currentStoreDate !== dataDateStr) {
                console.warn(`[AutoRouting] Date mismatch: Store=${currentStoreDate}, Data=${dataDateStr}. Skipping.`);
                return;
            }

            isProcessingRef.current = true;
            
            try {
                const settings = localStorageUtils.getAllSettings();
                
                const isRealCourierName = (name: any) => {
                    if (!name) return false;
                    const n = String(name).trim();
                    return !isId0CourierName(n) && n !== 'Не назначено';
                };

                const getOrderCourierName = (o: any) => {
                    if (o.courier && typeof o.courier === 'object') {
                        return o.courier.name || o.courier._id || o.courier.id || '';
                    }
                    return o.courierName || o.courierId || o.courier || '';
                };

                const isEligibleForRouting = (o: any) => {
                    const status = String(o.status || '').toLowerCase();
                    const isNotCanceled = status !== 'отменен' && status !== 'отмена' && status !== 'удален';
                    return isNotCanceled && isRealCourierName(getOrderCourierName(o));
                };

                const eligibleOrders = currentData.orders.filter(isEligibleForRouting);
                
                const realCouriersSet = new Set(
                    currentData.couriers
                        .map((c: any) => c.name)
                        .filter((name: any) => isRealCourierName(name))
                );

                let processedGeocodedCount = 0;
                (currentData.routes || []).forEach((r: any) => {
                    (r.orders || []).forEach((o: any) => {
                        if (o.coords?.lat) processedGeocodedCount++;
                    });
                });
                
                const totalSystemCouriers = realCouriersSet.size;
                const courierNamesWithRoutes = new Set(
                    (currentData.routes || [])
                        .map((r: any) => r.courier?.name || r.courier)
                        .filter(n => !!n && n !== 'Не назначено')
                );

                setAutoRoutingStatus({ 
                    totalCount: eligibleOrders.length, 
                    totalCouriers: totalSystemCouriers,
                    processedCount: processedGeocodedCount,
                    processedCouriers: courierNamesWithRoutes.size,
                    lastUpdate: Date.now() 
                });

                const groupsMap = groupAllOrdersByTimeWindow(eligibleOrders, currentData.couriers);
                const eligibleGroups: any[] = [];

                for (const [courierId, timeGroups] of Array.from(groupsMap.entries())) {
                    for (const group of timeGroups) {
                        const actualCourierName = group.courierName && group.courierName !== 'Неизвестный курьер' 
                            ? group.courierName 
                            : courierId;

                        if (!actualCourierName || isId0CourierName(actualCourierName) || isId0CourierName(courierId)) {
                            continue;
                        }

                        eligibleGroups.push({ ...group, actualCourierName });
                    }
                }

                let processedOrdersInBatch = 0;
                const updatedCouriersNames = new Set<string>();
                const processedCouriersThisBatch = new Set<string>();

                for (const group of eligibleGroups) {
                    const { actualCourierName, orders } = group;
                    const MAX_ORDERS = 20;
                    const groupChunks: any[] = [];
                    for (let i = 0; i < orders.length; i += MAX_ORDERS) {
                        groupChunks.push(orders.slice(i, i + MAX_ORDERS));
                    }

                    for (const chunkOrders of groupChunks) {
                        // v5.119: Stable signature (ID + Address + Courier)
                        // Status and Time are excluded to prevent redundant recalculation on state-only changes.
                        const groupSignature = chunkOrders
                            .map((o: any) => `${getStableOrderId(o)}_${o.address}_${actualCourierName}`)
                            .sort()
                            .join('|');

                        const chunkOrderIds = chunkOrders.map((o: any) => getStableOrderId(o)).sort().join('|');

                        // v5.119: Skip if signature already processed in this context
                        if (processedGroupSignatures.current.has(groupSignature)) {
                            processedOrdersInBatch += chunkOrders.length;
                            continue;
                        }

                        // v5.117: Skip if a route with same orders already exists with distance calculated
                        const existingOptimalRoute = (currentData.routes || []).find((r: any) => {
                            const sameOrders = r.orders.map((ro: any) => getStableOrderId(ro)).sort().join('|') === chunkOrderIds;
                            const sameCourier = normalizeCourierName(r.courier) === normalizeCourierName(actualCourierName);
                            return sameOrders && sameCourier && r.totalDistance > 0;
                        });

                        if (existingOptimalRoute) {
                            console.log(`[AutoRouting] Skipping ${actualCourierName} — optimised route already exists.`);
                            processedGroupSignatures.current.add(groupSignature);
                            processedOrdersInBatch += chunkOrders.length;
                            continue;
                        }
                        
                        try {
                            const allOrderUpdates = new Map<string, any>();
                            const ordersToGeocode = chunkOrders.filter((o: any) => !o.coords?.lat);
                            
                            if (ordersToGeocode.length > 0) {
                                const uniqueAddresses = new Set<string>(ordersToGeocode.map((o: any) => cleanAddressForRoute(o.address)));
                                const batchRequests = Array.from(uniqueAddresses).map(addr => ({
                                    address: addr,
                                    options: { silent: true, turbo: true }
                                }));
                                
                                const batchResults = await robustGeocodingService.batchGeocode(batchRequests, { turbo: true });
                                
                                chunkOrders.forEach((o: any) => {
                                    if (!o.coords?.lat) {
                                        const cleanAddr = cleanAddressForRoute(o.address).toLowerCase();
                                        const res = batchResults.get(cleanAddr);
                                        if (res?.best?.raw?.geometry?.location) {
                                            const loc = res.best.raw.geometry.location;
                                            o.coords = { lat: Number(loc.lat), lng: Number(loc.lng) };
                                            o.kmlZone = res.best.kmlZone || undefined;
                                            o.kmlHub = res.best.kmlHub || undefined;
                                            o.locationType = res.best.raw.geometry.location_type || undefined;
                                            o.streetNumberMatched = res.best.streetNumberMatched;
                                            allOrderUpdates.set(getStableOrderId(o), { ...o });
                                        }
                                    }
                                });
                            }

                            const newRoute: any = {
                                id: `autoroute_${Date.now()}_rnd${Math.floor(Math.random() * 10000)}`,
                                courier: actualCourierName,
                                orders: chunkOrders.map((o: any) => {
                                    const up = allOrderUpdates.get(getStableOrderId(o));
                                    return up ? { ...o, ...up } : o;
                                }),
                                totalDistance: 0,
                                totalDuration: 0,
                                isOptimized: false,
                                createdAt: Date.now(),
                                isAutoGenerated: true,
                                hasGeoErrors: chunkOrders.some((o: any) => 
                                    needsAddressClarification({
                                        locationType: o.locationType,
                                        streetNumberMatched: o.streetNumberMatched,
                                        hasCoords: !!o.coords?.lat
                                    })
                                )
                            };

                            if (!newRoute.hasGeoErrors) {
                                // Check if previous auto-route with same orders already has geometry
                                const prevRoute = (currentData.routes || []).find((r: any) => 
                                    r.isAutoGenerated && 
                                    r.orders.map((ro: any) => getStableOrderId(ro)).sort().join('|') === chunkOrderIds
                                );

                                if (prevRoute && prevRoute.isOptimized && prevRoute.totalDistance > 0) {
                                    newRoute.totalDistance = prevRoute.totalDistance;
                                    newRoute.totalDuration = prevRoute.totalDuration;
                                    newRoute.isOptimized = prevRoute.isOptimized;
                                    newRoute.geoMeta = prevRoute.geoMeta;
                                } else {
                                    const points: any[] = [];
                                    const startLat = settings?.defaultStartLat ? Number(settings.defaultStartLat) : null;
                                    const startLng = settings?.defaultStartLng ? Number(settings.defaultStartLng) : null;
                                    
                                    if (startLat && startLng) points.push({ lat: startLat, lng: startLng });
                                    chunkOrders.forEach((o: any) => {
                                        if (o.coords?.lat) points.push({ lat: Number(o.coords.lat), lng: Number(o.coords.lng) });
                                    });
                                    
                                    const endLat = settings?.defaultEndLat ? Number(settings.defaultEndLat) : null;
                                    const endLng = settings?.defaultEndLng ? Number(settings.defaultEndLng) : null;
                                    if (endLat && endLng) points.push({ lat: endLat, lng: endLng });
                                    else if (points.length > 0) points.push(points[0]);

                                    if (points.length >= 2) {
                                        // v5.118: Use centralised routing helper with Turbo Race if standard mode fails
                                        const { calculateTurboRace } = await import('../services/routingService');
                                        const routeResult = await calculateTurboRace(points, {
                                            yapikoOsrmUrl: settings?.yapikoOsrmUrl,
                                            generouteApiKey: settings?.generouteApiKey,
                                            maxDistanceKm: settings?.maxRouteDistanceKm,
                                            verbose: true
                                        });

                                        newRoute.totalDistance = routeResult.feasible ? (routeResult.totalDistance || 0) / 1000 : 0;
                                        newRoute.totalDuration = routeResult.feasible ? (routeResult.totalDuration || 0) / 60 : 0;
                                        newRoute.isOptimized = routeResult.feasible && (routeResult.totalDistance || 0) > 0;
                                        newRoute.routingEngine = routeResult.usedEngine;

                                        newRoute.geoMeta = {
                                            origin: (startLat && startLng) ? { lat: startLat, lng: startLng } : null,
                                            waypoints: chunkOrders.map((o: any) => ({
                                                lat: Number(o.coords?.lat || o.lat || 0),
                                                lng: Number(o.coords?.lng || o.lng || 0)
                                            })).filter((w: any) => w.lat !== 0 && w.lng !== 0),
                                            destination: (endLat && endLng) ? { lat: endLat, lng: endLng } : ((startLat && startLng) ? { lat: startLat, lng: startLng } : null)
                                        };
                                    }
                                }
                            }

                            // v5.110: Final safety check before state injection
                            const latestDate = normalizeDateToIso(useDashboardStore.getState().apiDateShift);
                            if (latestDate !== dataDateStr) {
                                console.warn('[AutoRouting] Date changed during calculation. Aborting update.');
                                return;
                            }

                            updateExcelDataRef.current((prev: any) => {
                                const currentOrders = prev?.orders || [];
                                const updatedOrders = currentOrders.map((order: any) => {
                                    const updated = allOrderUpdates.get(getStableOrderId(order));
                                    return updated ? { ...order, ...updated } : order;
                                });

                                const autogeneratedIdsInChunk = new Set(chunkOrders.map((o: any) => getStableOrderId(o)));
                                
                                // v5.117: Protect manual routes — only remove AUTO-generated routes for same courier
                                const filteredRoutes = (prev?.routes || []).filter((r: any) => {
                                    // Remove any route (manual or auto) containing these exact orders
                                    const hasSameOrders = r.orders.some((ro: any) => autogeneratedIdsInChunk.has(getStableOrderId(ro)));
                                    if (hasSameOrders) return false;
                                    
                                    // Only remove auto-generated routes for the same courier (not manual ones)
                                    const sameCourier = normalizeCourierName(r.courier) === normalizeCourierName(actualCourierName);
                                    if (sameCourier && r.isAutoGenerated) return false;
                                    
                                    return true; // preserve manual routes
                                });

                                return {
                                    ...(prev || { orders: [], routes: [] }),
                                    orders: updatedOrders,
                                    routes: [...filteredRoutes, newRoute]
                                };
                            }, true);

                            processedGroupSignatures.current.add(groupSignature);
                            processedOrdersInBatch += chunkOrders.length;
                            processedCouriersThisBatch.add(actualCourierName);
                            
                            const allCouriersWithRoutes = new Set([
                                ...(currentData.routes || []).map((r: any) => r.courier?.name || r.courier),
                                ...Array.from(processedCouriersThisBatch)
                            ].filter(name => isRealCourierName(name)));

                            setAutoRoutingStatus({ 
                                processedCount: processedGeocodedCount + processedOrdersInBatch,
                                processedCouriers: allCouriersWithRoutes.size,
                                lastUpdate: Date.now()
                            });

                            if (newRoute.isOptimized) {
                                updatedCouriersNames.add(actualCourierName);
                            }
                        } catch (e) {
                            console.error(`[AutoRouting] Ошибка для ${actualCourierName}:`, e);
                        }
                    }
                }

                if (updatedCouriersNames.size > 0) {
                    const names = Array.from(updatedCouriersNames).join(', ');
                    toast.success(`Маршруты рассчитаны: ${names}`, { icon: '🤖', duration: 3000 });
                }
                
                // 3. REFINEMENT PASS (Isolated)
                try {
                    const needsRefine = currentData.orders.filter((o: any) => {
                        const stableId = getStableOrderId(o);
                        const refKey = `${stableId}_${o.address}`;
                        if (processedRefinements.current.has(refKey)) return false;
                        
                        return needsAddressClarification({
                            locationType: o.locationType,
                            streetNumberMatched: o.streetNumberMatched,
                            hasCoords: !!o.coords?.lat
                        });
                    });

                    if (needsRefine.length > 0) {
                        const batchToRefine = needsRefine.slice(0, 10); // v5.119: boosted from 3 to 10 for faster cleanup
                        const refineUpdates = new Map<string, any>();
                        
                        for (const o of batchToRefine) {
                            const sid = getStableOrderId(o);
                            const refKey = `${sid}_${o.address}`;
                            processedRefinements.current.add(refKey);

                            try {
                                const res = await robustGeocodingService.geocode(o.address, {
                                    turbo: false, 
                                    forceCityBias: true, 
                                    silent: true
                                });

                                if (res.best?.raw?.geometry?.location) {
                                    const loc = res.best.raw.geometry.location;
                                    refineUpdates.set(sid, {
                                        ...o,
                                        coords: { lat: Number(loc.lat), lng: Number(loc.lng) },
                                        kmlZone: res.best.kmlZone || undefined,
                                        kmlHub: res.best.kmlHub || undefined,
                                        locationType: res.best.raw.geometry.location_type || undefined,
                                        streetNumberMatched: res.best.streetNumberMatched
                                    });
                                }
                            } catch {}
                        }

                        if (refineUpdates.size > 0) {
                            const latestDate = normalizeDateToIso(useDashboardStore.getState().apiDateShift);
                            if (latestDate !== dataDateStr) return;

                            updateExcelDataRef.current((prev: any) => {
                                const currentOrders = prev?.orders || [];
                                const updatedOrders = currentOrders.map((order: any) => {
                                    const updated = refineUpdates.get(getStableOrderId(order));
                                    return updated ? { ...order, ...updated } : order;
                                });
                                
                                const updatedRoutes = (prev?.routes || []).map((route: any) => ({
                                    ...route,
                                    orders: route.orders.map((ro: any) => {
                                        const updated = refineUpdates.get(getStableOrderId(ro));
                                        return updated ? { ...ro, ...updated } : ro;
                                    })
                                }));

                                return {
                                    ...(prev || { orders: [], routes: [] }),
                                    orders: updatedOrders,
                                    routes: updatedRoutes
                                };
                            }, true);
                        }
                    }
                } catch (refineErr) {
                    console.error('[AutoRouting] Ошибка в фазе уточнения адресов:', refineErr);
                }
            } catch (err) {
                console.error('[AutoRouting] Критическая ошибка авто-роутинга:', err);
            } finally {
                isProcessingRef.current = false;
            }
        };
    }); // No deps — we always want the latest version of runAutoRouting

    // v5.119: EVENT-DRIVEN TRIGGER (Hyper-Reactivity)
    // Runs when orders change (count, courier assignments, or statuses)
    const lastOrdersSignatureRef = useRef('');
    useEffect(() => {
        if (!autoRoutingStatus.isActive) return;
        
        const currentOrders = excelData?.orders || [];
        const sig = currentOrders.map(o => `${getStableOrderId(o)}|${o.courier}|${o.status}`).join(',');
        
        if (sig !== lastOrdersSignatureRef.current) {
            console.log(`[AutoRouting] Orders change detected. Triggering instant calculation.`);
            lastOrdersSignatureRef.current = sig;
            // Debounce 500ms to let multiple updates (e.g. batch FO sync) settle
            const tid = setTimeout(() => runAutoRoutingRef.current?.(), 500);
            return () => clearTimeout(tid);
        }
    }, [excelData?.orders, autoRoutingStatus.isActive]);

    // Main interval loop remains as a fail-safe (slower frequency)
    useEffect(() => {
        if (!autoRoutingStatus.isActive) {
            isProcessingRef.current = false;
            return;
        }

        const run = () => runAutoRoutingRef.current?.();
        const intervalId = setInterval(run, 30000); // 30s fail-safe since we are now event-driven

        return () => clearInterval(intervalId);
    }, [autoRoutingStatus.isActive]);
}
