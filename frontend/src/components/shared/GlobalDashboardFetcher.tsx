import * as React from 'react';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useDashboardWebSocket } from '../../hooks/useDashboardWebSocket';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { normalizeDateToIso } from '../../utils/data/dateUtils';
import { normalizeCourierName } from '../../utils/data/courierName';
import { crossTabSync } from '../../services/crossTabSync';

import { useContinuousAutoRouting } from '../../hooks/useContinuousAutoRouting';

/**
 * Global component that handles background data synchronization.
 * v20.1: Relies on the Backend Turbo Robot for calculations.
 * Fixed to ensure no UI crashes from stale references.
 * v5.154: Don't overwrite data if server returns empty but we have local data
 * v5.180: Validate and normalize backend data to match frontend expectations
 * v5.200: Improved merge logic to preserve local routes when robot sends updates
 * v5.201: Fixed courier merge to preserve local data and update metrics from server
 */
export const GlobalDashboardFetcher: React.FC = () => {
    const { setExcelData, excelData } = useExcelData();
    const apiDateShift = useDashboardStore(s => s.apiDateShift);
    
    // v37.5: Включаем фоновую локальную маршрутизацию (Iron Dome)
    useContinuousAutoRouting();
    
    // v5.212: Only check date shift when apiDateShift actually changes (not on every excelData update)
    const prevDateRef = React.useRef(apiDateShift);
    React.useEffect(() => {
        // Only act when date actually changed
        if (apiDateShift === prevDateRef.current && prevDateRef.current !== undefined) return;
        prevDateRef.current = apiDateShift;

        const targetDate = normalizeDateToIso(apiDateShift);

        // v5.212: Check BOTH localStorage keys (v3 is the primary one)
        let localHasTargetDate = false;
        for (const key of ['km_dashboard_processed_data_v4', 'km_dashboard_processed_data']) {
            const raw = localStorage.getItem(key);
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    const dateRaw = parsed.creationDate || parsed.orders?.[0]?.creationDate;
                    const dateNorm = normalizeDateToIso(dateRaw);
                    if (dateNorm && dateNorm === targetDate) { localHasTargetDate = true; break; }
                } catch {}
            }
        }

        // Only wipe if date changed AND no local data for target date
        if (excelData && excelData.orders && excelData.orders.length > 0) {
            const currentDataDate = normalizeDateToIso(excelData.creationDate || excelData.orders?.[0]?.creationDate);
            if (currentDataDate && targetDate && currentDataDate !== targetDate) {
                if (!localHasTargetDate) {
                    console.warn(`[GlobalDashboardFetcher] Date shift (${currentDataDate} -> ${targetDate}). Wiping stale data.`);
                    setExcelData(null);
                    localStorage.removeItem('km_dashboard_processed_data');
                    localStorage.removeItem('km_dashboard_processed_data_v3');
                    localStorage.removeItem('km_dashboard_processed_data_v4');
                    localStorage.removeItem('km_routes');
                } else {
                    console.info('[GlobalDashboardFetcher] Local data exists for target date; preserving.');
                }
            }
        }
    }, [apiDateShift]);
    
    // v5.180: Validate and normalize backend data before setting
    const validateBackendData = React.useCallback((data: any) => {
        if (!data) return data;
        
        const validated = { ...data };
        
        // Валидация routes - normalize courier names
        if (validated.routes && Array.isArray(validated.routes)) {
            validated.routes = validated.routes.map((route: any) => {
                const rawCourier = route.courier || route.courier_id || route.courierName || '';
                const normCourier = normalizeCourierName(rawCourier);
                
                // Пропускать маршруты с некорректными курьерами
                if (!normCourier || normCourier === 'Не назначено' || normCourier.toLowerCase() === 'по') {
                    return null;
                }
                
                return {
                    ...route,
                    courier: normCourier,
                    courier_id: normCourier,
                    orders: (route.orders || []).map((o: any) => ({
                        ...o,
                        courier: normalizeCourierName(o.courier) || normCourier,
                    })),
                };
            }).filter(Boolean);
        }
        
        // Валидация orders - normalize courier names
        if (validated.orders && Array.isArray(validated.orders)) {
            validated.orders = validated.orders.map((order: any) => ({
                ...order,
                courier: normalizeCourierName(order.courier) || order.courier,
            }));
        }
        
        // Валидация couriers - normalize names
        if (validated.couriers && Array.isArray(validated.couriers)) {
            validated.couriers = validated.couriers.map((c: any) => ({
                ...c,
                name: normalizeCourierName(c.name) || c.name,
            })).filter((c: any) => {
                const norm = normalizeCourierName(c.name);
                return norm && norm !== 'Не назначено';
            });
        }
        
        return validated;
    }, []);
    
    // v5.201: Merge couriers intelligently - preserve local data, update metrics from server
    const mergeCouriers = (localCouriers: any[], serverCouriers: any[], routes: any[]): any[] => {
        if (!localCouriers || localCouriers.length === 0) {
            // No local couriers - use server couriers or calculate from routes
            if (serverCouriers && serverCouriers.length > 0) {
                return serverCouriers;
            }
            // Вычисление from routes
            return calculateCouriersFromRoutes(routes);
        }
        
        // Build distance map from routes
        const routeMetrics = new Map<string, { km: number; orders: number }>();
        (routes || []).forEach((r: any) => {
            const courier = normalizeCourierName(r.courier || r.courier_id || '');
            if (!courier || courier === 'Не назначено') return;
            const existing = routeMetrics.get(courier) || { km: 0, orders: 0 };
            existing.km += Number(r.totalDistance || r.total_distance || 0);
            existing.orders += Number(r.ordersCount || r.orders_count || r.orders?.length || 0);
            routeMetrics.set(courier, existing);
        });
        
        // Merge: keep local couriers, update metrics from routes
        return localCouriers.map((c: any) => {
            const normName = normalizeCourierName(c.name || '');
            const metrics = routeMetrics.get(normName);
            if (metrics && metrics.km > 0) {
                return { 
                    ...c, 
                    distanceKm: Number(metrics.km.toFixed(2)), 
                    calculatedOrders: metrics.orders 
                };
            }
            return c;
        });
    };
    
    // Вспомогательная функция to calculate couriers from routes
    const calculateCouriersFromRoutes = (routes: any[]): any[] => {
        const courierMap = new Map<string, { km: number; orders: number }>();
        (routes || []).forEach((r: any) => {
            const courier = normalizeCourierName(r.courier || r.courier_id || '');
            if (!courier || courier === 'Не назначено') return;
            const existing = courierMap.get(courier) || { km: 0, orders: 0 };
            existing.km += Number(r.totalDistance || r.total_distance || 0);
            existing.orders += Number(r.ordersCount || r.orders_count || r.orders?.length || 0);
            courierMap.set(courier, existing);
        });
        
        return Array.from(courierMap.entries()).map(([name, metrics]) => ({
            name,
            distanceKm: Number(metrics.km.toFixed(2)),
            calculatedOrders: metrics.orders,
            isActive: true,
            vehicleType: 'car'
        }));
    };
    
    // v36.5: Используем ref для отслеживания актуального excelData в замыкании ниже
    const excelDataRef = React.useRef(excelData);
    React.useEffect(() => {
        excelDataRef.current = excelData;
    }, [excelData]);
    
    // Listen for real-time updates (inc. Robot calculation signals)
    // Synchronizes the received data into the global Excel context.
    useDashboardWebSocket({ 
         onDataLoaded: (data) => {
             const currentExcelData = excelDataRef.current;
             if (data && typeof setExcelData === 'function') {
                 const validatedData = validateBackendData(data);
                 
                 const targetDate = normalizeDateToIso(apiDateShift);
                 const incomingDate = normalizeDateToIso(validatedData.creationDate || validatedData.orders?.[0]?.creationDate);
                 const todayISO = new Date().toISOString().split('T')[0];
                 const isToday = normalizeDateToIso(apiDateShift) === todayISO;
                 
                 if (!isToday && targetDate && incomingDate && targetDate !== incomingDate) {
                     console.log(`[GlobalDashboardFetcher] Blocking stale data for ${incomingDate} (Target: ${targetDate})`);
                     return;
                 }

                 const hasNewOrders = validatedData.orders && Array.isArray(validatedData.orders) && validatedData.orders.length > 0;
                 const hasNewRoutes = validatedData.routes && Array.isArray(validatedData.routes) && validatedData.routes.length > 0;
                 
                 const incomingDateNorm = normalizeDateToIso(validatedData.creationDate || validatedData.orders?.[0]?.creationDate);
                 const currentDateNorm = normalizeDateToIso(currentExcelData?.creationDate || currentExcelData?.orders?.[0]?.creationDate);
                 const datesMatch = !incomingDateNorm || !currentDateNorm || incomingDateNorm === currentDateNorm;

                 if (hasNewRoutes || hasNewOrders) {
                     const masterOrdersMap = new Map();
                     const masterOrdersByNumber = new Map();
                     
                     (currentExcelData?.orders || []).forEach((o: any) => {
                        if (o.orderNumber) masterOrdersByNumber.set(String(o.orderNumber), o);
                        const id = o.id || o._id;
                        if (id && String(id) !== 'undefined' && String(id) !== 'null') masterOrdersMap.set(String(id), o);
                     });
                     
                     if (hasNewOrders) {
                         validatedData.orders.forEach((o: any) => {
                             if (o.orderNumber && !masterOrdersByNumber.has(String(o.orderNumber))) {
                                 masterOrdersByNumber.set(String(o.orderNumber), o);
                             }
                             const idKey = o.id || o._id;
                             if (idKey && String(idKey) !== 'undefined' && String(idKey) !== 'null' && !masterOrdersMap.has(String(idKey))) {
                                 masterOrdersMap.set(String(idKey), o);
                             }
                         });
                     }
                     
                     const enrichedRoutes = (validatedData.routes || []).map((route: any) => {
                         if (!route.orders || !Array.isArray(route.orders)) return route;
                         return {
                             ...route,
                             orders: route.orders.map((routeOrder: any) => {
                                 const num = routeOrder.orderNumber;
                                 const safeNum = num && String(num) !== 'undefined' && String(num) !== 'null' ? String(num) : null;
                                 const masterByNumber = safeNum ? masterOrdersByNumber.get(safeNum) : null;
                                 
                                 const id = routeOrder.id || routeOrder._id;
                                 const safeId = id && String(id) !== 'undefined' && String(id) !== 'null' ? String(id) : null;
                                 const masterById = safeId ? masterOrdersMap.get(safeId) : null;
                                 
                                 const master = masterByNumber || masterById;
                                 if (master) {
                                     return { ...routeOrder, ...master };
                                 }
                                 return routeOrder;
                             })
                         };
                     });
                     
                     let mergedRoutes;
                     if (datesMatch) {
                         const existingRouteMap = new Map(
                             (currentExcelData?.routes || []).map((r: any) => [String(r.id), r])
                         );
                         enrichedRoutes.forEach((nr: any) => {
                             existingRouteMap.set(String(nr.id), nr);
                         });
                         mergedRoutes = Array.from(existingRouteMap.values());
                     } else {
                         mergedRoutes = enrichedRoutes;
                     }
                     
                     const mergedCouriers = mergeCouriers(
                         currentExcelData?.couriers || [],
                         validatedData.couriers || [],
                         mergedRoutes
                     );

                     const divisionId = validatedData.orders?.find((o: any) => o.departmentId || o.divisionId)?.departmentId
                         || validatedData.orders?.find((o: any) => o.departmentId || o.divisionId)?.divisionId
                         || null;

                     const payload = {
                         ...validatedData,
                         orders: validatedData.orders && validatedData.orders.length > 0 
                             ? validatedData.orders 
                             : (datesMatch ? (currentExcelData?.orders || []) : []),
                         couriers: mergedCouriers,
                         routes: mergedRoutes,
                         divisionId: divisionId || currentExcelData?.divisionId,
                     };
                     
                     setExcelData(payload, true);
                     crossTabSync.broadcastBatched('dashboard_data', {
                         ...payload,
                         lastModified: Date.now(),
                     }, 16);
                     return;
                 }
                 
                 const hasExistingOrders = currentExcelData?.orders && Array.isArray(currentExcelData.orders) && currentExcelData.orders.length > 0;
                 if (hasExistingOrders && datesMatch) {
                     return;
                 }
                 
                 if (hasNewOrders) {
                     setExcelData(validatedData, true);
                     crossTabSync.broadcast('dashboard_data', {
                         ...validatedData,
                         lastModified: Date.now(),
                     });
                 }
             }
         },
        enabled: true
    });

    // v20.1: All routing/geocoding is strictly offloaded to the backend robot.
    // This component now purely serves as a passive state synchronization listener.

    return null;
};
