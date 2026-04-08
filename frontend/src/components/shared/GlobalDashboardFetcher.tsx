import * as React from 'react';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useDashboardWebSocket } from '../../hooks/useDashboardWebSocket';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { normalizeCourierName } from '../../utils/data/courierName';

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
    
    // v5.204: Clear stale data if date changes
    React.useEffect(() => {
        if (!excelData || !excelData.orders || excelData.orders.length === 0) return;
        
        const normalize = (d: string) => {
            if (!d) return '';
            const part = d.split(' ')[0];
            if (part.includes('-')) {
                const [y, m, d_] = part.split('-');
                return `${d_}.${m}.${y}`;
            }
            return part; // Assuming DD.MM.YYYY
        };
        
        const currentDataDate = normalize(excelData.creationDate || (excelData.orders?.[0]?.creationDate || ''));
        const targetDate = normalize(apiDateShift);
        
        if (currentDataDate && targetDate && currentDataDate !== targetDate) {
            console.warn(`[GlobalDashboardFetcher] Date shift detected (${currentDataDate} -> ${targetDate}). Clearing state.`);
            setExcelData(null);
        }
    }, [apiDateShift, setExcelData]);
    
    // v5.180: Validate and normalize backend data before setting
    const validateBackendData = React.useCallback((data: any) => {
        if (!data) return data;
        
        const validated = { ...data };
        
        // Validate routes - normalize courier names
        if (validated.routes && Array.isArray(validated.routes)) {
            validated.routes = validated.routes.map((route: any) => {
                const rawCourier = route.courier || route.courier_id || route.courierName || '';
                const normCourier = normalizeCourierName(rawCourier);
                
                // Skip routes with invalid couriers
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
        
        // Validate orders - normalize courier names
        if (validated.orders && Array.isArray(validated.orders)) {
            validated.orders = validated.orders.map((order: any) => ({
                ...order,
                courier: normalizeCourierName(order.courier) || order.courier,
            }));
        }
        
        // Validate couriers - normalize names
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
            // Calculate from routes
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
    
    // Helper to calculate couriers from routes
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
    
    // v36.5: Use a ref to track the latest excelData for the closure below
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
                // v5.203: ALWAYS preserve local orders - never overwrite them
                const hasExistingOrders = currentExcelData?.orders && Array.isArray(currentExcelData.orders) && currentExcelData.orders.length > 0;
                
                // v5.180: Validate backend data before setting
                const validatedData = validateBackendData(data);
                
                // v5.204: Check if total order count changed - if so, we MUST update
                const currentOrderCount = currentExcelData?.orders?.length || 0;
                const newOrderCount = validatedData.orders?.length || 0;
                const countChanged = currentOrderCount !== newOrderCount;

                // v5.203: Check for routes only - we ALWAYS preserve local orders
                const hasNewOrders = validatedData.orders && Array.isArray(validatedData.orders) && validatedData.orders.length > 0;
                const hasNewRoutes = validatedData.routes && Array.isArray(validatedData.routes) && validatedData.routes.length > 0;
                
                // v5.203: ALWAYS merge routes but PRESERVE local orders completely
                if (hasNewRoutes || (hasNewOrders && countChanged)) {
                    if (countChanged) {
                        console.log(`[GlobalDashboardFetcher] Order count changed: ${currentOrderCount} -> ${newOrderCount}. Updating.`);
                    }
                    // Enrich route orders with full order data from existing orders
                    const masterOrdersMap = new Map(
                        (currentExcelData?.orders || []).map((o: any) => [String(o.id), o])
                    );
                    const masterOrdersByNumber = new Map(
                        (currentExcelData?.orders || []).map((o: any) => [String(o.orderNumber), o])
                    );
                    
                    // Also use new orders from server if they exist (but prefer local)
                    if (hasNewOrders) {
                        validatedData.orders.forEach((o: any) => {
                            const idKey = String(o.id);
                            const numKey = String(o.orderNumber);
                            if (!masterOrdersMap.has(idKey)) {
                                masterOrdersMap.set(idKey, o);
                            }
                            if (!masterOrdersByNumber.has(numKey)) {
                                masterOrdersByNumber.set(numKey, o);
                            }
                        });
                    }
                    
                    const enrichedRoutes = validatedData.routes.map((route: any) => {
                        if (!route.orders || !Array.isArray(route.orders)) return route;
                        return {
                            ...route,
                            orders: route.orders.map((routeOrder: any) => {
                                const masterById = masterOrdersMap.get(String(routeOrder.id));
                                const masterByNumber = masterOrdersByNumber.get(String(routeOrder.orderNumber));
                                const master = masterById || masterByNumber;
                                if (master) {
                                    return { ...routeOrder, ...master };
                                }
                                return routeOrder;
                            })
                        };
                    });
                    
                    // Merge routes - keep existing, add new ones
                    const existingRouteMap = new Map(
                        (currentExcelData?.routes || []).map((r: any) => [String(r.id), r])
                    );
                    
                    enrichedRoutes.forEach((nr: any) => {
                        existingRouteMap.set(String(nr.id), nr);
                    });
                    
                    const mergedRoutes = Array.from(existingRouteMap.values());
                    
                    // Merge couriers - preserve local, update from routes
                    const mergedCouriers = mergeCouriers(
                        currentExcelData?.couriers || [],
                        validatedData.couriers || [],
                        mergedRoutes
                    );
                    
                    // v5.204: CRITICAL - Trust server orders as Source of Truth during sync, 
                    // but maintain enrichment from local master records if available
                    setExcelData({
                        ...validatedData,
                        orders: validatedData.orders && validatedData.orders.length > 0 ? validatedData.orders : (currentExcelData?.orders || []),
                        couriers: mergedCouriers,
                        routes: mergedRoutes
                    }, true); // Bypasses protectData to ensure count stays in sync
                    return;
                }
                
                // No new routes - if we have local orders, skip completely
                if (hasExistingOrders) {
                    console.log('[GlobalDashboardFetcher] Skipping - have local orders, no new routes');
                    return;
                }
                
                // No local orders and no routes - use new data
                if (hasNewOrders) {
                    setExcelData(validatedData, true);
                }
            }
        },
        enabled: true
    });

    // v20.1: All routing/geocoding is strictly offloaded to the backend robot.
    // This component now purely serves as a passive state synchronization listener.

    return null;
};
