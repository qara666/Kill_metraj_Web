import { useEffect, useRef } from 'react';
import { useExcelData } from '../contexts/ExcelDataContext';
import { groupAllOrdersByTimeWindow } from '../utils/route/routeCalculationHelpers';
import { robustGeocodingService } from '../services/robust-geocoding/RobustGeocodingService';
import { localStorageUtils } from '../utils/ui/localStorage';
import { toast } from 'react-hot-toast';
import { normalizeCourierName, getCourierName } from '../utils/data/courierName';
import { useDashboardStore } from '../stores/useDashboardStore';
import { getStableOrderId } from '../utils/data/orderId';
import { normalizeDateToIso } from '../utils/data/dateUtils';
import { needsAddressClarification } from '../utils/data/addressUtils';
import { YapikoOSRMService } from '../services/YapikoOSRMService';
import { ValhallaService } from '../services/valhallaService';
import { calculateDistance } from '../utils/geoUtils';
import { useRouteCalculationStore } from '../stores/useRouteCalculationStore';
import { API_URL } from '../config/apiConfig';

export function useContinuousAutoRouting() {
    const { excelData, updateExcelData } = useExcelData();
    const { groupingConfig } = useRouteCalculationStore();
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

    const runAutoRoutingRef = useRef<((forcedCourierName?: string) => Promise<void>) | null>(null);

    useEffect(() => {
        runAutoRoutingRef.current = async (forcedCourierName?: string) => {
            const currentData = excelDataRef.current;
            const currentStatus = autoRoutingStatusRef.current;

            if (!currentData?.orders || !currentData?.couriers) return;
            if (!currentStatus.isActive && !forcedCourierName) return;
            if (isProcessingRef.current) return;

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

                const totalSystemCouriers = currentData.couriers?.length || 0;
                const courierNamesWithRoutes = new Map<string, number>();
                let skippedGeocoding = 0;
                let skippedInRoutes = 0;
                let skippedNoCourier = 0;
                const seenSolo = new Set<string>();
                const soloGeoOrders: any[] = [];
                const routeTasks: { actualCourierName: string; groupOrders: any[]; groupSignature: string; windowLabel: string }[] = [];
                let eligibleOrders = currentData.orders.filter((o: any) => {
                    const status = String(o.status || '').toLowerCase();
                    // Исключить полностью отменённые/удалённые/переданные заказы
                    const isCanceled = [
                        'отменен', 'отмена', 'удален', 'скасований', 'скасовано', 
                        'canceled', 'cancelled', 'deleted'
                    ].includes(status);
                    if (isCanceled) return false;
                    const cname = getOrderCourier(o);
                    return isRealCourier(cname);
                });

                // Расчёт статуса
                const processedOrderIds = new Set<string>();
                const normForced = forcedCourierName ? normalizeCourierName(forcedCourierName) : null;

                (currentData.routes || []).forEach((r: any) => {
                    const rCourier = normalizeCourierName(getCourierName(r.courier));
                    // v7.2: Если принудительный пересчет для курьера - НЕ добавляем его заказы в processed,
                    // чтобы они попали в новый цикл группировки.
                    if (normForced && rCourier === normForced) return;

                    (r.orders || []).forEach((o: any) => {
                        const oid = getStableOrderId(o);
                        if (oid) processedOrderIds.add(oid);
                    });
                });

                eligibleOrders = currentData.orders.filter((o: any) => {
                    const status = String(o.status || '').toLowerCase();
                    const isCanceled = ['отменен', 'отмена', 'удален', 'скасований', 'скасовано', 'canceled', 'cancelled', 'deleted'].includes(status);
                    if (isCanceled) return false;

                    const oid = getStableOrderId(o);
                    if (oid && processedOrderIds.has(oid)) return false;

                    const cname = getOrderCourier(o);
                    const isReal = isRealCourier(cname);
                    if (!o.address || o.address.trim().length === 0) return false;
                    
                    if (!isReal) {
                        return !o.coords?.lat;
                    }
                    return true;
                });

                if (eligibleOrders.length === 0) return;

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

                if (forcedCourierName) {
                    toast.success(`Розрахунок для ${forcedCourierName} завершено`);
                }

                // Grouping
                const groupsMap = groupAllOrdersByTimeWindow(eligibleOrders, currentData.couriers, groupingConfig);
                for (const [courierNameKey, timeGroups] of Array.from(groupsMap.entries())) {
                    const isUnassigned = courierNameKey.toLowerCase().includes('unassigned') || 
                                       courierNameKey === 'неназначенные' ||
                                       courierNameKey === 'неизвестный курьер';

                    for (const group of timeGroups) {
                        const groupOrders = group.orders || [];
                        if (groupOrders.length === 0) continue;

                        const groupSignature = `${courierNameKey}|${group.windowLabel}|${groupOrders.map((o: any) => getStableOrderId(o)).sort().join(',')}`;
                        if (processedGroupSignatures.current.has(groupSignature)) continue;

                        if (isUnassigned) {
                            groupOrders.forEach(o => {
                                const oid = getStableOrderId(o);
                                if (oid && !o.coords?.lat && !seenSolo.has(oid)) {
                                    soloGeoOrders.push(o);
                                    seenSolo.add(oid);
                                }
                            });
                        } else {
                            routeTasks.push({ 
                                actualCourierName: group.courierName, 
                                groupOrders, 
                                groupSignature, 
                                windowLabel: group.windowLabel 
                            });
                        }
                    }
                }

                if (routeTasks.length === 0 && soloGeoOrders.length === 0) return;

                // === П0: ПРИОРИТЕТ — addressGeo из FO API ===
                // Каждый заказ имеет GPS координаты от FO (Lat="..." Long="...") в поле addressGeo.
                // Это самые точные координаты — без API вызовов, мгновенно, бесплатно.
                // Парсим их как ПЕРВЫЙ шаг, потом проверяем по активным секторам.
                const parseAddressGeoStr = (geoStr: string): { lat: number; lng: number } | null => {
                    if (!geoStr || geoStr === 'null' || geoStr === 'undefined') return null;
                    const s = String(geoStr);
                    const latM = s.match(/Lat\s*=\s*"?([\d.+-]+)"?/i);
                    const lngM = s.match(/Long\s*=\s*"?([\d.+-]+)"?/i);
                    if (latM && lngM) {
                        const lat = parseFloat(latM[1]);
                        const lng = parseFloat(lngM[1]);
                        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0 && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
                            return { lat, lng };
                        }
                    }
                    // Запасной формат: "lat,lng"
                    const pair = s.match(/^([\-+]?\d+\.\d+)\s*,\s*([\-+]?\d+\.\d+)$/);
                    if (pair) {
                        const lat = parseFloat(pair[1]);
                        const lng = parseFloat(pair[2]);
                        if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
                            return { lat, lng };
                        }
                    }
                    return null;
                };

                // Применяем addressGeo GPS ко всем заказам у которых нет coords
                let addressGeoApplied = 0;
                eligibleOrders.forEach((o: any) => {
                    if (o.coords?.lat) return; // уже есть
                    const rawGeo = o.addressGeo || o.AddressGeo || o.address_geo || o.raw?.addressGeo || '';
                    const gps = parseAddressGeoStr(rawGeo);
                    if (!gps) return;

                    // Валидация по активным секторам с tolerance 2.5km
                    const zoneInfo = robustGeocodingService.findZoneForCoords(gps.lat, gps.lng);
                    const ctx = robustGeocodingService.getZoneContext();
                    const hasActiveZones = ctx && (ctx.activePolygons?.length > 0);

                    if (zoneInfo || !hasActiveZones) {
                        // GPS точно в секторе — принимаем
                        o.coords = { lat: gps.lat, lng: gps.lng };
                        o.locationType = 'GPS_FO';
                        o.geocodeScore = 1.0;
                        if (zoneInfo) {
                            o.kmlZone = zoneInfo.zoneName;
                            o.kmlHub = zoneInfo.hubName;
                        }
                        addressGeoApplied++;
                    } else {
                        // GPS не в секторе — но может быть рядом (tolerance). Принимаем с пометкой.
                        // findZoneForCoords уже проверяет tolerance в kmlZoneChecker (tolerance=0.025)
                        // Если вернул null — реально далеко, идём в geocoding pipeline
                        o._addressGeoCandidate = gps; // Сохраняем для fallback в геокодинге
                    }
                });

                if (addressGeoApplied > 0) {
                    // Немедленно сохраняем GPS результаты
                    const gpsMap = new Map<string, any>();
                    eligibleOrders.filter((o: any) => o.locationType === 'GPS_FO').forEach((o: any) => gpsMap.set(getStableOrderId(o), { ...o }));
                    updateExcelDataRef.current((prev: any) => {
                        const nO = (prev?.orders || []).map((o: any) => {
                            const up = gpsMap.get(getStableOrderId(o));
                            return up ? { ...o, ...up } : o;
                        });
                        return { ...prev, orders: nO };
                    }, false);
                }

                // === ДВУХПРОХОДНОЕ ГЕОКОДИРОВАНИЕ (для заказов без addressGeo GPS) ===
                // Проход 1: Быстрый турбо-батч для всех некодированных заказов
                const allOrdersToGeocode = eligibleOrders.filter((o: any) => !o.coords?.lat);
                
                const applyGeoResult = async (o: any, res: any) => {
                    // P0.5: Fallback к addressGeo GPS если geocoder тоже не нашел ничего в секторе
                    if (!res?.best && o._addressGeoCandidate) {
                        o.coords = o._addressGeoCandidate;
                        o.locationType = 'GPS_FO_FALLBACK';
                        o.geocodeScore = 0.7;
                        return;
                    }
                    if (res?.best?.raw?.geometry?.location) {
                        const loc = res.best.raw.geometry.location;
                        o.coords = { lat: Number(loc.lat), lng: Number(loc.lng) };
                        o.kmlZone = res.best.kmlZone || undefined;
                        o.kmlHub = res.best.kmlHub || undefined;
                        o.locationType = res.best.raw.geometry.location_type || undefined;
                        o.streetNumberMatched = res.best.streetNumberMatched;
                        o.geocodeScore = res.best.score ?? 0;

                        try {
                            const { RobustGeocodingService } = await import('../services/robust-geocoding/RobustGeocodingService');
                            RobustGeocodingService.saveToPermanentCache(o.address, o.coords.lat, o.coords.lng, o.geocodeScore);
                        } catch (e) {
                            console.warn('[Robot] Cache persist fail:', e);
                        }
                    }
                };

                if (allOrdersToGeocode.length > 0) {
                    // Проход 1: Турбо (быстро, покрывает ~80% адресов)
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

                    // Проход 2: Полный повтор без турбо для адресов, пропущенных турбо
                    // Использует все провайдеры, больше вариантов, все уровни запасных вариантов
                    const stillFailed = allOrdersToGeocode.filter((o: any) => !o.coords?.lat);
                    if (stillFailed.length > 0) {
                        // v44: Увеличен чанк до 10 для ускорения повторного геокодирования
                        const RETRY_BATCH = 10;
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
                            });
                        }
                    }
                }

                // === СОХРАНИТЬ ПРОГРЕСС ГЕОКОДИРОВАНИЯ НЕМЕДЛЕННО ===
                // Предотвращает потерю прогресса геокодирования, если маршрутизация упадёт в том же тике.
                // Критично для разрушения блокировки "0/371" и "337 geo errors". (v5.145)
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

                // === ОЧИСТКА ПРИ ПЕРЕНАЗНАЧЕНИИ КУРЬЕРА ===
                // Если заказ перемещён от Курьера A к Курьеру B, удалить маршрут Курьера A для этого заказа
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

                for (const [actualCourierName, courierGroups] of groupsMap.entries()) {
                    for (const group of courierGroups) {
                        const groupOrders = group.orders || [];
                        const MAX_ORDERS = 20;
                        for (let i = 0; i < groupOrders.length; i += MAX_ORDERS) {
                            const chunkOrders = groupOrders.slice(i, i + MAX_ORDERS);
                            const groupSignature = chunkOrders
                                .map((o: any) => `${getStableOrderId(o)}_${o.address}_${actualCourierName}`)
                                .sort()
                                .join('|');
                            const chunkOrderIds = chunkOrders.map((o: any) => getStableOrderId(o)).sort().join('|');

                            const newRoute: any = {
                                id: `autoroute_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                                courier: actualCourierName,
                                orders: JSON.parse(JSON.stringify(chunkOrders)),
                                windowLabel: group.windowLabel,
                                totalDistance: 0,
                                totalDuration: 0,
                                isOptimized: false,
                                createdAt: Date.now(),
                                isAutoGenerated: true,
                                hasGeoErrors: false
                            };

                            routingTasks.push({ actualCourierName, chunkOrders, groupSignature });
                        }
                    }
                }

                // Parallel Routing (Quantum Burst)
                const CONCURRENCY = 10;
                const taskQueue = [...routingTasks];
                const batchUpdates = new Map<string, { routes: any[], orderUpdates: Map<string, any> }>();
                const updatedNames = new Set<string>();

                const runTask = async (): Promise<void> => {
                    while (taskQueue.length > 0 && autoRoutingStatusRef.current.isActive) {
                        const task = taskQueue.shift();
                        if (!task) break;
                        const { actualCourierName, chunkOrders, groupSignature } = task;

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
                                }) || o._kmlRejected
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

                        const sectorFilteredOrders: any[] = [];
                        chunkOrders.forEach((o: any) => {
                            const oLat = safeNum(o.coords?.lat);
                            const oLng = safeNum(o.coords?.lng);
                            if (oLat !== null && oLng !== null) {
                                // v44: Заказы с APPROXIMATE_ZONE/APPROXIMATE_CITY locationType — это центроиды зоны из L8-L10 фолбека.
                                // Они уже в правильном месте (центроид зоны), исключать их из маршрута нельзя.
                                const isApproximate = ['APPROXIMATE_ZONE', 'APPROXIMATE_CITY'].includes(o.locationType || '');
                                if (isApproximate) {
                                    points.push({ lat: oLat, lng: oLng });
                                    sectorFilteredOrders.push(o);
                                    return;
                                }
                                const zoneInfo = robustGeocodingService.findZoneForCoords(oLat, oLng);
                                if (zoneInfo) {
                                    points.push({ lat: oLat, lng: oLng });
                                    sectorFilteredOrders.push(o);
                                } else {
                                    const ctx = robustGeocodingService.getZoneContext();
                                    if (ctx && (ctx.activePolygons?.length > 0 || ctx.allPolygons?.length > 0)) {
                                        o._kmlRejected = true;
                                    } else {
                                        points.push({ lat: oLat, lng: oLng });
                                        sectorFilteredOrders.push(o);
                                    }
                                }
                            }
                        });

                        const eLat = safeNum(settings?.defaultEndLat);
                        const eLng = safeNum(settings?.defaultEndLng);
                        if (eLat !== null && eLng !== null) {
                            points.push({ lat: eLat, lng: eLng });
                        } else if (points.length > 0) {
                            points.push(points[0]);
                        }

                        if (sectorFilteredOrders.length === 0 && chunkOrders.length > 0) {
                            console.warn(`[AutoRoute] ${actualCourierName}: ВСЕ заказы вне активных секторов — маршрут пропущен`);
                            newRoute.hasGeoErrors = true;
                            newRoute.orders = [...chunkOrders];
                        } else if (sectorFilteredOrders.length < chunkOrders.length) {
                            newRoute.orders = [...sectorFilteredOrders];
                            console.warn(`[AutoRoute] ${actualCourierName}: ${chunkOrders.length - sectorFilteredOrders.length} заказ(ов) вне секторов — исключены из маршрута`);
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
                                console.warn(`[AutoRoute]  ${actualCourierName}: все точки совпадают, пропускаю расчет маршрута.`);
                                newRoute.hasGeoErrors = true;
                            } else {
                                const routePoints = uniquePoints;
                                let maxL = 0;
                                for (let i = 0; i < routePoints.length - 1; i++) {
                                    const d = calculateDistance(routePoints[i], routePoints[i + 1]) / 1000;
                                    if (d > maxL) maxL = d;
                                }

                                if (maxL > 30) {
                                    newRoute.hasGeoErrors = true;
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

                             // 4. Update Global State
                             updateExcelDataRef.current((prev: any) => {
                                 if (!prev) return prev;
                                 const chunkIds = new Set(chunkOrders.map((o: any) => getStableOrderId(o)));
                                 const nonMatchingRoutes = (prev.routes || []).filter((r: any) => 
                                     !r.isAutoGenerated || !r.orders.some((ro: any) => chunkIds.has(getStableOrderId(ro)))
                                 );
                                 const orderMap = new Map();
                                 chunkOrders.forEach((o: any) => orderMap.set(getStableOrderId(o), { ...o }));
                                 const updatedOrders = (prev.orders || []).map((o: any) => orderMap.get(getStableOrderId(o)) || o);
                                 return { ...prev, orders: updatedOrders, routes: [...nonMatchingRoutes, newRoute], lastModified: Date.now() };
                             }, true);

                            processedGroupSignatures.current.add(groupSignature);
                            updatedNames.add(actualCourierName);

                            // v18.2: CRITICAL SAFETY SLEEP (Break between OSRM hits)
                            await new Promise(res => setTimeout(res, 250));
                        }

                        } catch (taskErr) {
                            console.error('[Robot] Task failed:', groupSignature, taskErr);
                        }
                    }
                    toast.dismiss('autoroute-progress');
                }

                if (batchUpdates.size > 0) {
                    updateExcelDataRef.current((prev: any) => {
                        let nO = [...(prev?.orders || [])];
                        let nR = [...(prev?.routes || [])];
                        
                        // Collect ALL order IDs that are being updated in this batch
                        const allNewOrderIds = new Set<string>();
                        batchUpdates.forEach(b => {
                            b.routes.forEach(r => r.orders.forEach((o: any) => allNewOrderIds.add(getStableOrderId(o))));
                        });

                        // 1. Глобальная очистка маршрутов: Удалить ЛЮБОЙ автогенерированный маршрут, который:
                        //    a) Содержит заказ, который обновляется (стандартная дедупликация)
                        //    b) Содержит заказ, который передан другому курьеру (переназначение)
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
                            // Обновление orders with geo/route metadata
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
                        toast.success(`Рассчитано: ${Array.from(updatedNames).join(', ')}`, { icon: '' });
                    }
                }

                if (updatedNames.size > 0) {
                    toast.success(`Робот: Оновив ${updatedNames.size} кур'єрів`, { icon: '🤖' });
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
                        const batch = needsRef.slice(0, 50); // v5.150: was 10 — 50 handles all errors in one cycle
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
                setAutoRoutingStatus({ lastUpdate: Date.now() });
            }
        };
    }, [robustGeocodingService, setAutoRoutingStatus]); // Add minimal dependencies

    useEffect(() => {
        if (!autoRoutingStatus.isActive) {
            isProcessingRef.current = false;
            return;
        }
        const run = () => runAutoRoutingRef.current?.();
        const intervalId = setInterval(run, 15000);
        const t = setTimeout(run, 500);

        return () => { 
            clearInterval(intervalId); 
            clearTimeout(t); 
        };
    }, [autoRoutingStatus.isActive]);

    // Manual triggers listener (always active)
    useEffect(() => {
        const forceHandler = async (e: any) => {
            const target = e.detail?.courierName;
            const mode = e.detail?.mode;

            if (mode === 'frontend') {
                console.log(`[AutoRouting] Force frontend run triggered via event for ${target || 'all'}`);
                processedGroupSignatures.current.clear();
                runAutoRoutingRef.current?.(target);
            } else {
                // Backend trigger
                console.log(`[AutoRouting] Redirecting calculation request to BACKEND Turbo Robot${target ? ` for ${target}` : ''}`);
                processedGroupSignatures.current.clear();
                try {
                    toast.loading(target ? `Синхронизация ${target}...` : 'Запуск Турбо-Робота...', { id: 'turbo-trigger' });
                    
                    const token = localStorage.getItem('km_access_token') || localStorage.getItem('token');
                    const { divisionId, apiDateShift } = useDashboardStore.getState();
                    
                    const res = await fetch(`${API_URL}/api/turbo/priority`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            divisionId,
                            date: apiDateShift,
                            force: true,
                            ...(target ? { courierName: target } : {})
                        })
                    });
                    
                    if (!res.ok) {
                        const err = await res.json();
                        throw new Error(err.error || err.message || `Server error ${res.status}`);
                    }
                    
                    toast.success(target ? `Расчет для ${target} запущен` : 'Турбо-Робот запущен', { id: 'turbo-trigger' });
                } catch (err: any) {
                    console.error('[AutoRouting] Backend trigger failed:', err);
                    toast.error(`Ошибка запуска: ${err.message}`, { id: 'turbo-trigger' });
                    // Fallback to frontend calculation
                    toast('Переход на локальный расчет (fallback)...', { id: 'turbo-fallback' });
                    runAutoRoutingRef.current?.(target);
                }
            }
        };

        window.addEventListener('km-force-auto-routing', forceHandler);
        return () => {
            window.removeEventListener('km-force-auto-routing', forceHandler);
        };
    }, []);

    // Structural trigger
    const lastSigRef = useRef('');
    useEffect(() => {
        if (!autoRoutingStatus.isActive || !excelData?.orders) return;
        const sig = excelData.orders
            .map(o => `${getStableOrderId(o)}|${o.address}|${getCourierName(o.courier)}|${o.status}`)
            .sort().join(',');

        if (sig !== lastSigRef.current) {
            lastSigRef.current = sig;
            const t = setTimeout(() => runAutoRoutingRef.current?.(), 1000);
            return () => clearTimeout(t);
        }
    }, [excelData?.orders, autoRoutingStatus.isActive]);
}
