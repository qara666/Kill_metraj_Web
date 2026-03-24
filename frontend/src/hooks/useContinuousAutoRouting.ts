import { useEffect, useRef } from 'react';
import { useExcelData } from '../contexts/ExcelDataContext';
import { groupAllOrdersByTimeWindow } from '../utils/route/routeCalculationHelpers';
import { robustGeocodingService } from '../services/robust-geocoding/RobustGeocodingService';
import { localStorageUtils } from '../utils/ui/localStorage';
import { toast } from 'react-hot-toast';
import { needsAddressClarification } from '../utils/data/addressUtils';
import { isId0CourierName } from '../utils/data/courierName';
import { useDashboardStore } from '../stores/useDashboardStore';
import { getStableOrderId } from '../utils/data/orderId';

const cleanAddressForRoute = (raw: string): string => {
    if (!raw) return '';
    return raw.replace(/,\s*(под\.|подъезд|д\/ф|эт|этаж|эт\.|под|kв|квартира|оф|офис).*$/i, '').trim();
};

export function useContinuousAutoRouting() {
    const { excelData, updateExcelData } = useExcelData();
    const isProcessingRef = useRef(false);
    const processedGroupSignatures = useRef<Set<string>>(new Set());
    
    // v5.80: Global Store Integration
    const autoRoutingStatus = useDashboardStore(s => s.autoRoutingStatus);
    const setAutoRoutingStatus = useDashboardStore(s => s.setAutoRoutingStatus);

    useEffect(() => {
        if (!excelData?.orders || !excelData?.couriers || !autoRoutingStatus.isActive) {
            if (!autoRoutingStatus.isActive && isProcessingRef.current) {
                isProcessingRef.current = false;
            }
            return;
        }

        // v5.102: Initialization Guard - Wait for data to be "settled" from sync
        // If orders exist but routes are missing AND it's the first few seconds of a session, wait.
        if (excelData.orders.length > 0 && (!excelData.routes || excelData.routes.length === 0)) {
            const now = Date.now();
            const lastMod = excelData.lastModified || 0;
            if (now - lastMod < 5000) { // 5s grace period for Hybrid Sync to settle
                console.log('[AutoRouting] Waiting for Hybrid Sync to restore routes...');
                return;
            }
        }

        // v5.102: Initialization Guard - Wait for data to be "settled" from sync
        // If orders exist but routes are missing AND it's the first few seconds of a session, wait.
        if (excelData.orders.length > 0 && (!excelData.routes || excelData.routes.length === 0)) {
            const now = Date.now();
            const lastMod = excelData.lastModified || 0;
            if (now - lastMod < 5000) { // 5s grace period for Hybrid Sync to settle
                console.log('[AutoRouting] Waiting for Hybrid Sync to restore routes...');
                return;
            }
        }

        const runAutoRouting = async () => {
            if (isProcessingRef.current || !autoRoutingStatus.isActive) return;
            isProcessingRef.current = true;
            
            try {
                const settings = localStorageUtils.getAllSettings();
                
                // 1. Identify unrouted orders
                const routedOrderIds = new Set<string>();
                if (excelData.routes) {
                    excelData.routes.forEach((route: any) => {
                        route.orders.forEach((ro: any) => routedOrderIds.add(getStableOrderId(ro)));
                    });
                }

                const unroutedMap = new Map<string, any>();
                excelData.orders.forEach((o: any) => {
                    const sid = getStableOrderId(o);
                    if (!routedOrderIds.has(sid)) {
                        if (!unroutedMap.has(sid)) {
                            unroutedMap.set(sid, o);
                        }
                    }
                });
                
                const unroutedOrders = Array.from(unroutedMap.values());
                
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

                const realOrders = excelData.orders.filter((o: any) => isRealCourierName(getOrderCourierName(o)));
                const realCouriersSet = new Set(
                    excelData.couriers
                        .map((c: any) => c.name)
                        .filter((name: any) => isRealCourierName(name))
                );

                const totalOrders = realOrders.length;
                let processedGeocodedCount = 0;
                
                // Count orders that are both in a route AND geocoded
                (excelData.routes || []).forEach((r: any) => {
                    (r.orders || []).forEach((o: any) => {
                        const stableId = getStableOrderId(o);
                        const isRealOrder = realOrders.some((ro: any) => getStableOrderId(ro) === stableId);
                        if (isRealOrder && o.coords?.lat) {
                            processedGeocodedCount++;
                        }
                    });
                });
                
                const totalSystemCouriers = realCouriersSet.size;
                const couriersWithRoutesCount = new Set(
                    (excelData.routes || [])
                        .map((r: any) => r.courier?.name || r.courier)
                        .filter((name: any) => isRealCourierName(name))
                ).size;

                if (unroutedOrders.length === 0) {
                    setAutoRoutingStatus({ 
                        processedCount: processedGeocodedCount, 
                        totalCount: totalOrders, 
                        processedCouriers: couriersWithRoutesCount, 
                        totalCouriers: totalSystemCouriers, 
                        lastUpdate: Date.now() 
                    });
                    isProcessingRef.current = false;
                    return;
                }

                // 2. Grouping & Selection
                const groupsMap = groupAllOrdersByTimeWindow(unroutedOrders, excelData.couriers);
                const updatedCouriersNames = new Set<string>();
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

                setAutoRoutingStatus({ 
                    totalCount: totalOrders, 
                    totalCouriers: totalSystemCouriers,
                    processedCount: processedGeocodedCount,
                    processedCouriers: couriersWithRoutesCount,
                    lastUpdate: Date.now() 
                });

                let processedOrdersInBatch = 0;
                const processedCouriersThisBatch = new Set<string>();

                for (const group of eligibleGroups) {
                    const { actualCourierName, orders } = group;

                    // Chunking
                    const MAX_ORDERS = 20;
                    const groupChunks: any[] = [];
                    for (let i = 0; i < orders.length; i += MAX_ORDERS) {
                        groupChunks.push(orders.slice(i, i + MAX_ORDERS));
                    }

                    for (const chunkOrders of groupChunks) {
                        const groupSignature = chunkOrders
                            .map((o: any) => `${getStableOrderId(o)}_${o.address}_${actualCourierName}`)
                            .sort()
                            .join('|');

                        if (processedGroupSignatures.current.has(groupSignature)) {
                            processedOrdersInBatch += chunkOrders.length;
                            continue;
                        }

                        processedGroupSignatures.current.add(groupSignature);

                        try {
                            const allOrderUpdates = new Map<string, any>();
                            const ordersToGeocode = chunkOrders.filter((o: any) => !o.coords?.lat);
                            
                            if (ordersToGeocode.length > 0) {
                                const uniqueAddresses = new Set<string>(ordersToGeocode.map((o: any) => cleanAddressForRoute(o.address)));
                                const batchRequests = Array.from(uniqueAddresses).map(addr => ({
                                    address: addr,
                                    options: { silent: true, turbo: false }
                                }));
                                
                                const batchResults = await robustGeocodingService.batchGeocode(batchRequests, { turbo: false });
                                
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

                            // Route Calculation
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

                            updateExcelData((prev: any) => {
                                const currentOrders = prev?.orders || [];
                                const updatedOrders = currentOrders.map((order: any) => {
                                    const updated = allOrderUpdates.get(getStableOrderId(order));
                                    return updated ? { ...order, ...updated } : order;
                                });

                                return {
                                    ...(prev || { orders: [], routes: [] }),
                                    orders: updatedOrders,
                                    routes: [...(prev?.routes || []), newRoute]
                                };
                            }, true);

                            processedOrdersInBatch += chunkOrders.length;
                            
                            // v5.93: Correctly calculate processed couriers by deduplicating
                            const allCouriersWithRoutes = new Set([
                                ...Array.from(realCouriersSet).filter(name => 
                                    (excelData?.routes || []).some((r: any) => (r.courier?.name || r.courier) === name) ||
                                    processedCouriersThisBatch.has(name)
                                )
                            ]);

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
            } catch (err) {
                console.error('[AutoRouting] Критическая ошибка авто-роутинга:', err);
            } finally {
                isProcessingRef.current = false;
            }
        };

        const intervalId = setInterval(runAutoRouting, 10000);
        runAutoRouting();

        return () => clearInterval(intervalId);
    }, [excelData, updateExcelData, autoRoutingStatus.isActive, setAutoRoutingStatus]);
}
