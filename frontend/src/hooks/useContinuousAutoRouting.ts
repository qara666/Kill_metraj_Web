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
    
    const autoRoutingStatus = useDashboardStore(s => s.autoRoutingStatus);
    const setAutoRoutingStatus = useDashboardStore(s => s.setAutoRoutingStatus);

    useEffect(() => {
        if (!excelData?.orders || !excelData?.couriers || !autoRoutingStatus.isActive) {
            if (!autoRoutingStatus.isActive && isProcessingRef.current) {
                isProcessingRef.current = false;
            }
            return;
        }

        if (excelData.orders.length > 0 && (!excelData.routes || excelData.routes.length === 0)) {
            const now = Date.now();
            const lastMod = excelData.lastModified || 0;
            if (now - lastMod < 5000) { 
                console.log('[AutoRouting] Waiting for Hybrid Sync to restore routes...');
                return;
            }
        }

        const runAutoRouting = async () => {
            if (isProcessingRef.current || !autoRoutingStatus.isActive) return;
            
            // v5.110: Date-aware execution guard (Normalized comparison)
            const currentStoreDate = normalizeDateToIso(useDashboardStore.getState().apiDateShift);
            const dataDate = excelData?.creationDate || (excelData?.orders?.[0]?.creationDate);
            const dataDateStr = normalizeDateToIso(dataDate);
            
            if (currentStoreDate && dataDateStr && currentStoreDate !== dataDateStr) {
                console.warn(`[AutoRouting] Date mismatch: Store is ${currentStoreDate}, Data is ${dataDateStr}. Skipping calculation.`);
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

                // 1. Фильтруем заказы, которые могут быть рассчитаны (не отменены и имеют РЕАЛЬНОГО курьера)
                const isEligibleForRouting = (o: any) => {
                    const status = String(o.status || '').toLowerCase();
                    const isNotCanceled = status !== 'отменен' && status !== 'отмена' && status !== 'удален';
                    return isNotCanceled && isRealCourierName(getOrderCourierName(o));
                };

                const eligibleOrders = excelData.orders.filter(isEligibleForRouting);
                
                const realCouriersSet = new Set(
                    excelData.couriers
                        .map((c: any) => c.name)
                        .filter((name: any) => isRealCourierName(name))
                );

                const totalOrders = eligibleOrders.length;
                let processedGeocodedCount = 0;
                
                (excelData.routes || []).forEach((r: any) => {
                    (r.orders || []).forEach((o: any) => {
                        if (o.coords?.lat) {
                            processedGeocodedCount++;
                        }
                    });
                });
                
                const totalSystemCouriers = realCouriersSet.size;
                const courierNamesWithRoutes = new Set(
                    (excelData.routes || [])
                        .map((r: any) => r.courier?.name || r.courier)
                        .filter(n => !!n && n !== 'Не назначено')
                );
                const couriersWithRoutesCount = courierNamesWithRoutes.size;

                setAutoRoutingStatus({ 
                    totalCount: totalOrders, 
                    totalCouriers: totalSystemCouriers,
                    processedCount: processedGeocodedCount,
                    processedCouriers: couriersWithRoutesCount,
                    lastUpdate: Date.now() 
                });

                const groupsMap = groupAllOrdersByTimeWindow(eligibleOrders, excelData.couriers);
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
                        const groupSignature = chunkOrders
                            .map((o: any) => `${getStableOrderId(o)}_${o.address}_${actualCourierName}_${o.status}`)
                            .sort()
                            .join('|');

                        if (processedGroupSignatures.current.has(groupSignature)) {
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
                                // v5.115: Check if we already have a calculated route for exactly these orders
                                const chunkOrderIds = chunkOrders.map((o: any) => getStableOrderId(o)).sort().join('|');
                                const prevRoute = (excelData.routes || []).find((r: any) => 
                                    r.isAutoGenerated && 
                                    r.orders.map((ro: any) => getStableOrderId(ro)).sort().join('|') === chunkOrderIds
                                );

                                if (prevRoute && prevRoute.isOptimized && prevRoute.totalDistance > 0) {
                                    // Reuse geometry and distance if the orders are exactly the same (only status/metadata changed)
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
                                        let calculatedDist = 0;
                                        let calculatedDur = 0;

                                        if (settings?.yapikoOsrmUrl) {
                                            try {
                                                const { YapikoOSRMService } = await import('../services/YapikoOSRMService');
                                                const r = await YapikoOSRMService.calculateRoute(points, settings.yapikoOsrmUrl);
                                                if (r.feasible) {
                                                    calculatedDist = r.totalDistance || 0;
                                                    calculatedDur = r.totalDuration || 0;
                                                }
                                            } catch {}
                                        }

                                        if (!calculatedDist) {
                                            try {
                                                const { ValhallaService } = await import('../services/valhallaService');
                                                const r = await ValhallaService.calculateRoute(points);
                                                if (r.feasible) {
                                                    calculatedDist = r.totalDistance || 0;
                                                    calculatedDur = r.totalDuration || 0;
                                                }
                                            } catch {}
                                        }

                                        newRoute.totalDistance = calculatedDist / 1000;
                                        newRoute.totalDuration = calculatedDur / 60;
                                        newRoute.isOptimized = calculatedDist > 0;

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

                            updateExcelData((prev: any) => {
                                const currentOrders = prev?.orders || [];
                                const updatedOrders = currentOrders.map((order: any) => {
                                    const updated = allOrderUpdates.get(getStableOrderId(order));
                                    return updated ? { ...order, ...updated } : order;
                                });

                                const autogeneratedIdsInChunk = new Set(chunkOrders.map((o: any) => getStableOrderId(o)));
                                // v5.116: Strict Deduplication - remove any existing route for this courier
                                // to ensure the new optimized path is the only one active.
                                const filteredRoutes = (prev?.routes || []).filter((r: any) => {
                                    // 1. If it contains the same orders, remove it
                                    const hasSomeOrders = r.orders.some((ro: any) => autogeneratedIdsInChunk.has(getStableOrderId(ro)));
                                    if (hasSomeOrders) return false;
                                    
                                    // 2. If it's for the same courier, remove it (Avoid dual-routing)
                                    if (normalizeCourierName(r.courier) === normalizeCourierName(actualCourierName)) {
                                        return false;
                                    }
                                    
                                    return true;
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
                                ...(excelData.routes || []).map((r: any) => r.courier?.name || r.courier),
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
                    const needsRefine = excelData.orders.filter((o: any) => {
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
                        const batchToRefine = needsRefine.slice(0, 5); 
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
                            // v5.110: Final safety check before state injection
                            const latestDate = normalizeDateToIso(useDashboardStore.getState().apiDateShift);
                            if (latestDate !== dataDateStr) return;

                            updateExcelData((prev: any) => {
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

        if (!autoRoutingStatus.isActive) return;

        // v5.116: Execute FIRST run immediately when excelData changes (or on mount)
        // We use a small timeout to debounce rapid changes (e.g. multi-order updates)
        const immediateId = setTimeout(runAutoRouting, 1000);

        // Then continue with the background interval
        const intervalId = setInterval(runAutoRouting, 10000);

        return () => {
            clearTimeout(immediateId);
            clearInterval(intervalId);
        };
    }, [excelData, updateExcelData, autoRoutingStatus.isActive, setAutoRoutingStatus]);
}
