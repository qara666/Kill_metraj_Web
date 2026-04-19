import * as React from 'react'
import { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback, useMemo } from 'react'
import { localStorageUtils } from '../utils/ui/localStorage'
import { toast } from 'react-hot-toast'
import { normalizeCourierName, isId0CourierName, getCourierName } from '../utils/data/courierName'
import { enrichOrderGeodata } from '../utils/data/excelProcessor'
import { getStableOrderId } from '../utils/data/orderId'
import { normalizeDateToIso } from '../utils/data/dateUtils'
import { CourierIdResolver } from '../utils/data/courierIdMap'
import { useDashboardStore } from '../stores/useDashboardStore'
import { API_URL } from '../config/apiConfig'

interface ExcelData {
  orders: any[]
  couriers: any[]
  paymentMethods: any[]
  routes: any[]
  errors: any[]
  summary: any
  lastModified?: number
  creationDate?: string
  loading?: boolean
  divisionId?: string | number
}

interface ExcelDataContextType {
  excelData: ExcelData | null
  setExcelData: (data: ExcelData | null, force?: boolean) => void
  updateExcelData: (dataOrUpdater: ExcelData | ((prev: ExcelData) => ExcelData), force?: boolean) => void
  clearExcelData: (options?: { skipServerWipe?: boolean }) => void;
  updateRouteData: (routes: any[]) => void
  updateOrderPaymentMethod: (orderNumber: string, newPaymentMethod: string) => void
  saveManualOverrides: (orders: any[]) => void
}

const ExcelDataContext = createContext<ExcelDataContextType | undefined>(undefined)



export const useExcelData = () => {
  const context = useContext(ExcelDataContext)
  if (context === undefined) {
    throw new Error('useExcelData must be used within an ExcelDataProvider')
  }
  return context
}

interface ExcelDataProviderProps {
  children: ReactNode
}

export const ExcelDataProvider: React.FC<ExcelDataProviderProps> = ({ children }) => {
  const [excelData, setExcelDataState] = useState<ExcelData | null>(null)
  const hasInit = useRef(false)
  const excelDataRef = useRef<ExcelData | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isInitialLoadRef = useRef(true) // v36.9: Bypass socket guard on first load

  // Helper to fetch routes with current date
  const fetchRoutesWithDate = useCallback(async (token: string) => {
    const apiDateShift = useDashboardStore.getState().apiDateShift;
    const divisionId = useDashboardStore.getState().divisionId;
    
    let normalizedDate = '';
    if (apiDateShift) {
      if (/^\d{2}\.\d{2}\.\d{4}$/.test(apiDateShift)) {
        const parts = apiDateShift.split('.');
        normalizedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(apiDateShift)) {
        normalizedDate = apiDateShift;
      }
    }
    
    const params = new URLSearchParams();
    if (normalizedDate) params.set('date', normalizedDate);
    if (divisionId) params.set('divisionId', String(divisionId));
    params.set('t', String(Date.now()));
    const url = `${API_URL}/api/routes/calculated?${params.toString()}`;
    
    const routesRes = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    let allRoutes = [];
    if (routesRes.ok) {
      try {
        const text = await routesRes.text();
        const routesJson = JSON.parse(text);
        allRoutes = routesJson.data || [];
      } catch (parseErr) {
        console.warn('[fetchRoutes] JSON parse error, returning empty:', parseErr);
      }
    } else {
      console.warn('[fetchRoutes] API returned status:', routesRes.status);
    }
    
    return allRoutes;
  }, []);

  useEffect(() => {
    excelDataRef.current = excelData
  }, [excelData])

  useEffect(() => {
    if (!hasInit.current) {
      hasInit.current = true

      const loadData = async () => {
        const rehydrateManualRoutes = (data: any) => {
          if (!data || !Array.isArray(data.routes) || !Array.isArray(data.orders)) return;
          data.routes.forEach((r: any) => {
            if (String(r.id || '').startsWith('route_') && Array.isArray(r.orders)) {
              r.orders = r.orders.map((strippedOrder: any) => {
                const fullOrder = data.orders.find((po: any) => String(po.id) === String(strippedOrder.id));
                return fullOrder ? { ...strippedOrder, ...fullOrder } : strippedOrder;
              });
            }
          });
        };

        // v5.202: Enrich route orders with full order data from master orders list
        const enrichRouteOrders = (data: any) => {
          if (!data || !Array.isArray(data.routes) || !Array.isArray(data.orders)) return data;
          const masterOrdersMap = new Map(data.orders.map((o: any) => [String(o.id), o]));
          const masterOrdersByNumber = new Map(data.orders.map((o: any) => [String(o.orderNumber), o]));
          
          data.routes = data.routes.map((route: any) => {
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
          return data;
        };

        try {
          // v5.205: bumped to v3 to clear bugged 1/18 states
          const localRaw = localStorage.getItem('km_dashboard_processed_data_v3');
          let localData = null;
          if (localRaw) {
            try {
              localData = JSON.parse(localRaw);
            } catch (e) {}
          }
          
          // v5.204: VALIDATE DATE before using local data
          // Discard if date mismatch to prevent "Yesterday's orders" bug
          if (localData) {
            const currentShift = useDashboardStore.getState().apiDateShift; // YYYY-MM-DD
            
            // Normalize currentShift to DD.MM.YYYY
            let targetDate = currentShift;
            if (/^\d{4}-\d{2}-\d{2}$/.test(currentShift)) {
               const [y, m, d] = currentShift.split('-');
               targetDate = `${d}.${m}.${y}`;
            }
            
            // Normalize localData date
            const localDateRaw = localData.creationDate || (localData.orders?.[0]?.creationDate ? String(localData.orders[0].creationDate).split(' ')[0] : null);
            let localDateNormalized = localDateRaw;
            if (localDateRaw && typeof localDateRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(localDateRaw)) {
                const [y, m, d] = localDateRaw.split('-');
                localDateNormalized = `${d}.${m}.${y}`;
            }

            // v5.205: FOR TODAY - always use local data if it has orders, even without date match
            // This ensures we see previously calculated routes immediately after sync
            const todayISO = new Date().toISOString().split('T')[0];
            const isToday = currentShift === todayISO;
            
            if (!isToday && targetDate && localDateNormalized && targetDate !== localDateNormalized) {
                console.warn(`[ExcelSync] Cache date mismatch (${localDateNormalized} vs ${targetDate}). Clearing stale cache.`);
                localStorage.removeItem('km_dashboard_processed_data_v3');
                localData = null;
            }
          }
          
          // v5.202: If we have valid local data, use it IMMEDIATELY
          if (localData && localData.orders && localData.orders.length > 0) {
            // v5.202: Enrich route orders with full order data
            try { enrichRouteOrders(localData); } catch (e) {}
            
            // v5.202: Merge with DB routes for completeness
            try {
              const token = localStorage.getItem('km_access_token');
              if (token) {
                const dbRoutes = await fetchRoutesWithDate(token);
                if (dbRoutes.length > 0) {
                  const existingRoutes = Array.isArray(localData.routes) ? localData.routes : [];
                  const allRouteIds = new Set<string>();
                  const mergedRoutes: any[] = [];
                  
                  // Priority 1: DB routes
                  dbRoutes.forEach((r: any) => {
                    const rid = String(r.id || '');
                    if (rid && !allRouteIds.has(rid)) {
                      allRouteIds.add(rid);
                      mergedRoutes.push(r);
                    }
                  });
                  
                  // Priority 2: Local manual routes
                  existingRoutes.forEach((r: any) => {
                    const rid = String(r.id || '');
                    if (rid.startsWith('route_') && !allRouteIds.has(rid)) {
                      allRouteIds.add(rid);
                      mergedRoutes.push(r);
                    }
                  });
                  
                  localData.routes = mergedRoutes;
                }
              }
            } catch (e) {
              console.warn('[ExcelSync] DB route merge failed:', e);
            }
            
            rehydrateManualRoutes(localData);
            setExcelDataState(localData);
            return;
          }

          // v5.202: Only try server if local data is empty/missing
          const token = localStorage.getItem('km_access_token');
          if (token) {
            try {
              const response = await fetch(`${API_URL}/api/v1/state`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              
              const contentType = response.headers.get('content-type');
              if (!contentType || !contentType.includes('application/json')) {
                  console.warn('[ExcelSync] Server returned non-JSON response, skipping server data');
                  throw new Error('Server returned non-JSON');
              }

              if (response.ok) {
                let json: any = null;
                try {
                  const text = await response.text();
                  json = JSON.parse(text);
                } catch (parseErr) {
                  console.warn('[ExcelSync] /api/v1/state JSON parse error:', parseErr);
                }

                if (json && json.success && json.data && json.data.orders && json.data.orders.length > 0) {
                  const serverData = json.data;
                  
                  // v5.204: VALIDATE DATE of server-rehydrated state
                  const currentShift = useDashboardStore.getState().apiDateShift;
                  const normalize = (d: any): string => {
                      if (!d || typeof d !== 'string') return '';
                      try {
                          const part = d.split(' ')[0].split('T')[0];
                          if (part.includes('-')) {
                              const [y, m, d_] = part.split('-');
                              return `${d_}.${m}.${y}`;
                          }
                          return part;
                      } catch (e) {
                          return '';
                      }
                  };
                  
                  const targetDate = normalize(String(currentShift || ''));
                  const dataDate = normalize(String(serverData.creationDate || (serverData.orders?.[0]?.creationDate || '')));
                  
                  if (targetDate && dataDate && targetDate !== dataDate) {
                      console.warn(`[ExcelSync] Server state date mismatch (${dataDate} vs ${targetDate}). Ignoring.`);
                      // Will continue to fallback
                  } else {
                      const localOverrides = localStorage.getItem('km_manual_overrides');
                      if (localOverrides && serverData.orders) {
                        try {
                          const overrides = JSON.parse(localOverrides);
                          serverData.orders = serverData.orders.map((o: any) => {
                            const sid = getStableOrderId(o);
                            const num = o.orderNumber ? String(o.orderNumber) : null;
                            let override = sid ? overrides[sid] : null;
                            if (!override && num) override = overrides[num];
                            if (!override && o.id) override = overrides[Number(o.id)];

                            if (override) {
                                return { ...o, ...override, status: override.settledDate ? (override.status || 'исполнен') : (o.status || override.status) };
                            }
                            return o;
                          });
                        } catch (e) {}
                      }
                      
                      enrichRouteOrders(serverData);
                      
                      try {
                        const dbRoutes = await fetchRoutesWithDate(token);
                        const existingRoutes = Array.isArray(serverData.routes) ? serverData.routes : [];
                        const allRouteIds = new Set<string>();
                        const mergedRoutes: any[] = [];
                        
                        existingRoutes.forEach((r: any) => {
                          const rid = String(r.id || '');
                          if (rid && !allRouteIds.has(rid)) { allRouteIds.add(rid); mergedRoutes.push(r); }
                        });
                        
                        dbRoutes.forEach((r: any) => {
                          const rid = String(r.id || '');
                          if (rid && !allRouteIds.has(rid)) { allRouteIds.add(rid); mergedRoutes.push(r); }
                        });
                        
                        serverData.routes = mergedRoutes;
                        let existingCourierNames = new Set<string>();
                        if (serverData.couriers && Array.isArray(serverData.couriers)) {
                          serverData.couriers.forEach((c: any) => {
                              existingCourierNames.add(normalizeCourierName(c.name || c.courierName || '').toUpperCase());
                              if (c.calculatedOrders === undefined) c.calculatedOrders = 0;
                          });
                        }
                        
                        mergedRoutes.forEach((r: any) => {
                          const routeCourier = normalizeCourierName(r.courier || r.courier_id || '');
                          if (routeCourier && routeCourier !== 'Не назначено') {
                            const upperName = routeCourier.toUpperCase();
                            if (!existingCourierNames.has(upperName)) {
                              existingCourierNames.add(upperName);
                              serverData.couriers = serverData.couriers || [];
                              serverData.couriers.push({
                                name: routeCourier,
                                distanceKm: Number((r.totalDistance || 0).toFixed(2)),
                                calculatedOrders: Number(r.ordersCount || r.orders?.length || 0),
                                isActive: true, vehicleType: 'car'
                              });
                            }
                          }
                        });
                      } catch (e) {
                         console.warn('[ExcelSync] DB route fetch failed:', e);
                      }

                      setExcelDataState(serverData);
                      return;
                  }
                }
              }
            } catch (e) {
              console.warn('[ExcelSync] Server load failed:', e);
            }
          }


          // v5.202: Final fallback - if neither localStorage nor server worked, try DB routes only
          // This block should only be reached if localData was empty/missing at the top
          const fallbackLocalRaw = localStorage.getItem('km_dashboard_processed_data');
          if (fallbackLocalRaw) {
            try {
              const parsed = JSON.parse(fallbackLocalRaw);
              if (parsed.orders && parsed.orders.length > 0) {
                // This shouldn't normally be reached since we handle localStorage at the top
                rehydrateManualRoutes(parsed);
                setExcelDataState(parsed);
                return;
              }
            } catch (e) {}
          }
        } catch (error) {
          console.error('Error loading data:', error);
        }
      }
      loadData()
    }
  }, [])

  // v25.1: Listen for storage changes (when Turbo Robot saves routes in another tab)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'km_routes' && e.newValue) {
        try {
          const routes = JSON.parse(e.newValue);
          if (routes.length > 0) {
            // Storage event updated routes
            setExcelDataState(prev => {
              if (prev) {
                // Also update courier distances
                const updatedCouriers = (prev.couriers || []).map((c: any) => {
                    const normName = c.name?.toString().replace(/\s+/g, ' ').toUpperCase().trim();
                    if (!normName || normName === 'НЕ НАЗНАЧЕНО') return c;
                    
                    const courierRoutes = routes.filter((r: any) => {
                        const rc = (r.courier || r.courier_id || '').toString().replace(/\s+/g, ' ').toUpperCase().trim();
                        return rc === normName;
                    });
                    
                    if (courierRoutes.length > 0) {
                        const km = courierRoutes.reduce((acc: number, r: any) => acc + (Number(r.totalDistance || r.total_distance) || 0), 0);
                        const orders = courierRoutes.reduce((acc: number, r: any) => acc + (Number(r.ordersCount || r.orders_count) || (r.orders ? r.orders.length : 0)), 0);
                        return { ...c, distanceKm: Number(km.toFixed(2)), calculatedOrders: orders };
                    }
                    return c;
                });
                return { ...prev, routes, couriers: updatedCouriers };
              }
              return prev;
            });
          }
        } catch (e) {
          console.warn('[ExcelSync] Failed to parse routes from storage event:', e);
        }
      } else if (e.key === 'km_dashboard_processed_data_v3' && e.newValue) {
        // v36.9: Sync full state across tabs
        try {
          const newData = JSON.parse(e.newValue);
          if (newData && newData.orders) {
            setExcelDataState(prev => {
              // Only update if newer or if current is empty
              const nextVal = protectData(newData, prev);
              return nextVal;
            });
          }
        } catch (err) {
          console.warn('[ExcelSync] Failed to parse full data from storage event:', err);
        }
      } else if (e.key === 'km_routes_broadcast' && e.newValue) {
        // v36.9: Cross-tab routes broadcast from socketService
        try {
          const broadcast = JSON.parse(e.newValue);
          // Skip if this is our own broadcast
          if (broadcast._tabId !== (window as any)._tabId && broadcast.routes?.length > 0) {
            // Re-dispatch as a local DOM event so handleTurboRoutes processes it
            window.dispatchEvent(new CustomEvent('km:turbo:routes_update', {
              detail: {
                routes: broadcast.routes,
                date: broadcast.date,
                divisionId: broadcast.divisionId,
                couriers: broadcast.couriers || null
              }
            }));
          }
        } catch (err) {
          console.warn('[ExcelSync] Failed to process routes broadcast:', err);
        }
      }
    };
    
    // v30.0: Listen for same-tab DOM events dispatched by socketService
    // socketService dispatches 'km:turbo:routes_update' when robot finishes routing
    const handleTurboRoutes = (e: Event) => {
      const { routes, couriers: eventCouriers } = (e as CustomEvent).detail || {};
      if (routes && Array.isArray(routes) && routes.length > 0) {
        // v5.203: IMMEDIATE update for new routes - no debounce for new routes
        // Only debounce for updates to EXISTING routes (same route IDs)
        const now = Date.now();
        lastSocketRouteUpdateRef.current = now;
        lastProcessedRouteIdsRef.current = routes;
        
        // v5.180: FRONTEND VALIDATION — Normalize backend routes to match frontend expectations
        const validatedRoutes = routes.map((route: any) => {
          // Normalize courier name to match frontend grouping
          const rawCourier = route.courier || route.courier_id || route.courierName || '';
          const normCourier = normalizeCourierName(rawCourier);
          
          // v5.180: Skip routes with invalid couriers (ПО, НЕ НАЗНАЧЕНО, etc.)
          if (!normCourier || normCourier === 'Не назначено' || normCourier.toLowerCase() === 'по') {
            console.warn(`[ExcelSync] ⚠️ Dropping route with invalid courier: "${rawCourier}"`);
            return null;
          }
          
          // v5.180: Fix route courier field to match frontend courier names
          const fixedRoute = {
            ...route,
            courier: normCourier, // Use normalized name for consistent frontend matching
            courier_id: normCourier, // Also fix courier_id for backward compatibility
          };
          
          // v5.180: Validate and fix order courier names within the route
          if (route.orders && Array.isArray(route.orders)) {
            fixedRoute.orders = route.orders.map((order: any) => {
              const orderCourier = order.courier || '';
              const normOrderCourier = normalizeCourierName(orderCourier);
              return {
                ...order,
                courier: normOrderCourier || normCourier, // Fix order courier to match route
              };
            });
          }
          
          return fixedRoute;
        }).filter(Boolean); // Remove null routes
        
        if (validatedRoutes.length === 0 && routes.length > 0) {
          console.warn('[ExcelSync] ⚠️ All routes had invalid couriers, skipping');
          return;
        }
        
        // turbo:routes_update received
        setExcelDataState(prev => {
          // v6.19: Initialize if empty, to hold incoming routes until orders arrive
          if (!prev) {
              return {
                  orders: [], couriers: [], addresses: [], paymentMethods: [],
                  routes: validatedRoutes,
                  statistics: { totalOrders: 0, totalAmount: 0, averageAmount: 0, deliveryCount: 0, pickupCount: 0 },
                  summary: { orders: 0, couriers: 0, successfulGeocoding: 0, failedGeocoding: 0, totalRows: 0, paymentMethods: 0, errors: [] },
                  lastModified: Date.now()
              } as any;
          }

          // v5.160: Enrich route orders with master order data (address, courier, etc.)
          const masterOrdersMap = new Map();
          const masterOrdersByNumber = new Map();
          
          (prev.orders || []).forEach((o: any) => {
             const id = o.id || o._id;
             if (id && String(id) !== 'undefined' && String(id) !== 'null') {
                 masterOrdersMap.set(String(id), o);
             }
             if (o.orderNumber && String(o.orderNumber) !== 'undefined') {
                 masterOrdersByNumber.set(String(o.orderNumber), o);
             }
          });

          const enrichedRoutes = validatedRoutes.map((route: any) => {
            if (!route.orders) return route;

            // v5.160: Keep ALL orders for accurate load statistics
            const dedupedOrders = route.orders || [];

            // v5.160: Enrich each order with master data (address, courier, etc.)
            const enrichedOrders = dedupedOrders.map((order: any) => {
              const id = order.id || order._id;
              const safeId = id && String(id) !== 'undefined' ? String(id) : null;
              const masterById = safeId ? masterOrdersMap.get(safeId) : null;
              
              const num = order.orderNumber;
              const safeNum = num && String(num) !== 'undefined' ? String(num) : null;
              const masterByNumber = safeNum ? masterOrdersByNumber.get(safeNum) : null;
              
              const master = masterById || masterByNumber;

              if (master) {
                return {
                  // Base: master FO data (status, totalAmount, etc.)
                  ...master,
                  // Override with route-specific data (geocoded address, coords, kmlZone)
                  ...order,
                  // Preserve route's geocoded address — it's more accurate than raw FO address
                  address: order.address || master.address || (master as any).raw?.address || 'Адрес не указан',
                  orderNumber: order.orderNumber || master.orderNumber || (master as any).id || 'N/A',
                  plannedTime: order.plannedTime || master.plannedTime || (master as any).deliverBy,
                  // Ensure coords from route (geocoded) take priority
                  coords: order.coords || master.coords,
                  lat: order.lat || order.coords?.lat || master.lat || master.coords?.lat,
                  lng: order.lng || order.coords?.lng || master.lng || master.coords?.lng,
                  kmlZone: order.kmlZone || master.kmlZone || master.deliveryZone,
                  kmlHub: order.kmlHub || master.kmlHub,
                };
              }

              // No master found - ensure minimum fields
              return {
                ...order,
                address: order.address || (order as any).raw?.address || 'Адрес не указан',
                orderNumber: order.orderNumber || (order as any).id || 'N/A',
              };
            });

            return { ...route, orders: enrichedOrders };
          });

          // v36.5: MERGE logic instead of REPLACE to prevent flickering
          // Create a map of existing routes to merge new ones into
          const routesMap = new Map((prev.routes || []).map((r: any) => [String(r.id), r]));
          
          // Add/Update routes from the event
          enrichedRoutes.forEach((route: any) => {
            routesMap.set(String(route.id), route);
          });
          
          const mergedRoutes = Array.from(routesMap.values());

          // Keep couriers synchronized with live route metrics so all tabs
          // (not only CourierManagement) show consistent km/progress.
          const routeMetrics = new Map<string, { km: number; orders: number }>();
          mergedRoutes.forEach((r: any) => {
            const name = normalizeCourierName(r.courier || r.courier_id || '');
            if (!name || name === 'Не назначено') return;
            const m = routeMetrics.get(name) || { km: 0, orders: 0 };
            m.km += Number(r.totalDistance || r.total_distance || 0);
            m.orders += Number(r.ordersCount || r.orders_count || (Array.isArray(r.orders) ? r.orders.length : 0));
            routeMetrics.set(name, m);
          });

          const existingCouriers = (prev.couriers || []);
          const updatedCouriers = existingCouriers.map((c: any) => {
            const norm = normalizeCourierName(c.name || c.courierName || c.courier || '');
            const m = routeMetrics.get(norm);
            if (!m) return c;
            return {
              ...c,
              distanceKm: Number(m.km.toFixed(2)),
              calculatedOrders: m.orders
            };
          });
          // Add couriers present in routes but missing in list
          routeMetrics.forEach((m, norm) => {
            const exists = updatedCouriers.some((c: any) => normalizeCourierName(c.name || c.courierName || c.courier || '') === norm);
            if (!exists) {
              updatedCouriers.push({
                name: norm,
                courierName: norm,
                distanceKm: Number(m.km.toFixed(2)),
                calculatedOrders: m.orders,
                isActive: true
              });
            }
          });
          
          return { ...prev, routes: mergedRoutes, couriers: updatedCouriers };
        });
      }
    };


    // v30.0: Listen for enriched dashboard data (courier km distances) from robot
    const handleTurboDashboard = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (!data) return;
      // turbo:dashboard_update received
      // Note: We intentionally skip updating distanceKm here to avoid double-counting in the HUD.
      // The HUD calculates final distance as Base + Current Routes.
    };
    
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('km:turbo:routes_update', handleTurboRoutes);
    window.addEventListener('km:turbo:dashboard_update', handleTurboDashboard);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('km:turbo:routes_update', handleTurboRoutes);
      window.removeEventListener('km:turbo:dashboard_update', handleTurboDashboard);
    };
  }, [])


   const protectData = useCallback((next: ExcelData, current: ExcelData | null): ExcelData => {
     if (!current || !next) return next;
     
     // v5.204: Check dates. If dates differ (e.g. user changed date), NEVER merge/protect.
     const currentDate = normalizeDateToIso(current.creationDate || current.orders?.[0]?.creationDate);
     const nextDate = normalizeDateToIso(next.creationDate || next.orders?.[0]?.creationDate);
     
     if (currentDate && nextDate && currentDate !== nextDate) {
         console.log(`[ExcelSync] Date mismatch (${currentDate} vs ${nextDate}), bypassing data protection.`);
         return next;
     }

     // v5.202: NEVER overwrite existing orders with empty/partial data
     const hasLocalOrders = (current.orders || []).length > 0;
     const hasServerOrders = (next.orders || []).length > 0;
     
     // If server sends NO orders but we have them locally - NEVER overwrite
     if (!hasServerOrders && hasLocalOrders) {
         console.warn(`[ExcelSync] Server sent ${next.orders?.length || 0} orders but we have ${current.orders.length}. PRESERVING local data.`);
         return {
             ...next,
             orders: current.orders,
             routes: (next.routes && next.routes.length > 0) ? next.routes : current.routes,
             couriers: next.couriers && next.couriers.length > 0 ? next.couriers : current.couriers,
             lastModified: Math.max(next.lastModified || 0, current.lastModified || 0)
         };
     }
     
     // If server sends FEWER orders than local - something is wrong, preserve local
     if (hasServerOrders && hasLocalOrders && next.orders.length < current.orders.length) {
         console.warn(`[ExcelSync] Server sent ${next.orders.length} orders but we have ${current.orders.length}. PRESERVING local orders.`);
         return {
             ...next,
             orders: current.orders,
             routes: (next.routes && next.routes.length > 0) ? next.routes : current.routes,
             couriers: next.couriers && next.couriers.length > 0 ? next.couriers : current.couriers,
             lastModified: Math.max(next.lastModified || 0, current.lastModified || 0)
         };
     }
     
     return next;
   }, []);

  const performManualOverridesSave = useCallback((orders: any[]) => {
    try {
      const existing = localStorage.getItem('km_manual_overrides');
      const overrides = existing ? JSON.parse(existing) : {};
      
      orders.forEach(o => {
        const sid = getStableOrderId(o);
        const id = o.id ? String(o.id) : null;
        const num = o.orderNumber ? String(o.orderNumber) : null;
        
        let hasChanges = false;
        const ovr: any = {};
        
        if (o.settledDate) { hasChanges = true; ovr.settledDate = o.settledDate; ovr.status = o.status; }
        if (o.courier && !isId0CourierName(o.courier)) { hasChanges = true; ovr.courier = o.courier; ovr.courierId = o.courierId; }
        if (o.paymentMethodOverridden) { hasChanges = true; ovr.paymentMethod = o.paymentMethod; ovr.paymentMethodOverridden = true; }
        if (o.manualGeocoding) { hasChanges = true; ovr.coords = o.coords; ovr.manualGeocoding = true; ovr.isAddressLocked = true; }
        
        if (hasChanges) {
          if (sid) overrides[sid] = { ...(overrides[sid] || {}), ...ovr };
          if (num) overrides[num] = { ...(overrides[num] || {}), ...ovr };
          if (id)  overrides[id]  = { ...(overrides[id]  || {}), ...ovr };
        }
      });
      localStorage.setItem('km_manual_overrides', JSON.stringify(overrides));
      
      if (excelDataRef.current && excelDataRef.current.orders) {
        // v5.152: Strip geometry from routes to prevent localStorage QuotaExceededError
        const routesNoGeo = (excelDataRef.current.routes || []).map((r: any) => ({ ...r, geometry: undefined }));
        const fullData = { ...excelDataRef.current, orders: orders, routes: routesNoGeo };
        fullData.lastModified = Date.now();
        localStorageUtils.setData('km_dashboard_processed_data_v3', fullData);
      }
    } catch (e) {
      console.warn('Manual overrides save failed:', e);
    }
  }, []);

  useEffect(() => {
    if (!excelData?.orders) return;
    performManualOverridesSave(excelData.orders);
  }, [excelData?.orders, performManualOverridesSave]);

  // v5.151: Auto-save dashboard data to localStorage when it changes
  // v5.180: Optimized - increased debounce to 1000ms, skip if only routes changed
  const lastSavedRef = useRef<string>('');
  
  useEffect(() => {
    if (!excelData || !excelData.orders || excelData.orders.length === 0) return;
    
    // v5.180: Create lightweight hash to detect real changes
    const currentHash = `${excelData.orders.length}-${excelData.couriers?.length || 0}-${excelData.routes?.length || 0}-${excelData.summary?.totalOrders || 0}`;
    if (currentHash === lastSavedRef.current) {
      return;
    }
    lastSavedRef.current = currentHash;
    
    // Debounce save to avoid excessive writes during rapid updates
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      try {
        // v5.152: Strip geometry from routes to prevent localStorage QuotaExceededError
        // v5.180: Also strip heavy data from orders to save space
        const ordersLight = (excelData.orders || []).map((o: any) => ({
          id: o.id, orderNumber: o.orderNumber, courier: o.courier,
          address: o.address, status: o.status, coords: o.coords,
          deliveryZone: o.deliveryZone, kmlZone: o.kmlZone,
          settledDate: o.settledDate, totalAmount: o.totalAmount
        }));
        // v5.152: Strip geometry from routes but preserve key metrics for offline KM display
        const routesNoGeo = (excelData.routes || []).map((r: any) => ({
          ...r,
          geometry: undefined,
          // v36.9: Explicitly preserve metrics so KM works after reload without DB refresh
          ordersCount: r.ordersCount || r.orders_count || (Array.isArray(r.orders) ? r.orders.length : 0),
          totalDistance: r.totalDistance || r.total_distance || 0,
          courier: r.courier || r.courier_id || '',
          courier_id: r.courier_id || r.courier || '',
          orders: r.orders?.map((o: any) => ({ id: o.id, orderNumber: o.orderNumber }))
        }));
        const dataToSave = { 
          ...excelData, 
          orders: ordersLight, 
          routes: routesNoGeo, 
          lastModified: Date.now() 
        };
        localStorageUtils.setData('km_dashboard_processed_data_v3', dataToSave);
        // Auto-saved (optimized)
      } catch (e) {
        console.warn('[ExcelSync] Failed to auto-save dashboard data:', e);
      }
    }, 1000); // v5.180: Increased to 1000ms to reduce writes
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [excelData]);

  const setExcelData = useCallback((incomingData: ExcelData | null, force?: boolean) => {
    if (incomingData) {
      setExcelDataState(prev => {
        const val = force ? incomingData : protectData(incomingData, prev);
        return val;
      });
    } else {
      setExcelDataState(null);
      localStorage.removeItem('km_dashboard_processed_data_v3');
    }
  }, [protectData]);

  const updateExcelData = useCallback((dataOrUpdater: ExcelData | ((prev: ExcelData) => ExcelData), force?: boolean) => {
    setExcelDataState(prev => {
      let next: ExcelData;
      const prevSafe = prev || { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: {} } as any;
      
      if (typeof dataOrUpdater === 'function') {
        const updater = dataOrUpdater as (p: ExcelData) => ExcelData;
        const updaterResult = updater(prevSafe);
        next = applyCourierVehicleMap(updaterResult, prevSafe);
      } else {
        next = applyCourierVehicleMap(dataOrUpdater, prevSafe);
      }
      
      const protectedNext = force ? next : protectData(next, prevSafe);
      return protectedNext;
    });
  }, [protectData]);

  const clearExcelData = useCallback((options?: { skipServerWipe?: boolean }) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    setExcelDataState(null)
    localStorage.removeItem('km_dashboard_processed_data_v3')

    if (!options?.skipServerWipe) {
      const token = localStorage.getItem('km_access_token');
      if (token) {
        const emptyState = { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: {} };
        fetch(`${API_URL}/api/v1/state`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ data: emptyState })
        }).catch(err => console.error('Error clearing server state:', err));
      }
    }
  }, [])

  const updateRouteData = useCallback((newRoutes: any[]) => {
    setExcelDataState(prev => {
      const next = prev ? { ...prev, routes: newRoutes } : {
        orders: [], couriers: [], paymentMethods: [], routes: newRoutes, errors: [], summary: undefined
      } as any;
      return next;
    })
  }, [])

  const updateOrderPaymentMethod = useCallback((orderNumber: string, newPaymentMethod: string) => {
    updateExcelData(prev => {
      const updatedOrders = prev.orders.map(order => {
        if (order.orderNumber === orderNumber) {
          return { ...order, paymentMethod: newPaymentMethod, paymentMethodOverridden: true };
        }
        return order;
      });
      return { ...prev, orders: updatedOrders };
    });
    toast.success(`Способ оплаты изменен на ${newPaymentMethod}`, { duration: 2000 });
  }, [updateExcelData])

  const contextValue = useMemo(() => ({
    excelData,
    setExcelData,
    updateExcelData,
    clearExcelData,
    updateRouteData,
    updateOrderPaymentMethod,
    saveManualOverrides: performManualOverridesSave
  }), [excelData, setExcelData, updateExcelData, clearExcelData, updateRouteData, updateOrderPaymentMethod, performManualOverridesSave]);

  useEffect(() => {
    const handleBeforeUnload = () => {};
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // v25.4: Refresh routes from database when excelData is loaded
  // v5.141: Improved deduplication to avoid stale DB overwrites
  // v5.180: Track last socket route update to prevent stale DB overwrites
  const lastSocketRouteUpdateRef = useRef<number>(0);
  const lastProcessedRouteIdsRef = useRef<any[]>([]); // v5.203: Track route IDs for immediate new route detection
  
  const refreshRoutesFromDB = useCallback(async () => {
    try {
      const token = localStorage.getItem('km_access_token');
      if (!token) return;
      
      // v5.180: Skip if socket routes were updated in the last 30 seconds (prevent stale DB overwrite during calculation)
      // v36.9: But NEVER skip on the initial page load
      const timeSinceSocketUpdate = Date.now() - lastSocketRouteUpdateRef.current;
      const isInitialLoad = isInitialLoadRef.current;
      if (isInitialLoad) {
        isInitialLoadRef.current = false; // Mark initial load as done
      } else if (timeSinceSocketUpdate < 30000 && lastSocketRouteUpdateRef.current > 0) {
        console.log(`[ExcelSync] Skipping DB refresh - socket routes updated ${timeSinceSocketUpdate}ms ago`);
        return;
      }
      
      const dbRoutes = await fetchRoutesWithDate(token);
      // Refreshed routes from DB
      
      // v5.141: Deduplicate DB routes by ID first
      const seenRouteIds = new Set<string>();
      const uniqueDbRoutes: any[] = [];
      dbRoutes.forEach((r: any) => {
        const rid = String(r.id || '');
        if (rid && !seenRouteIds.has(rid)) {
          seenRouteIds.add(rid);
          uniqueDbRoutes.push(r);
        }
      });
      if (uniqueDbRoutes.length < dbRoutes.length) {
        console.warn(`[ExcelSync] ⚠️ Removed ${dbRoutes.length - uniqueDbRoutes.length} duplicate DB routes`);
      }
      
      // v5.180: FRONTEND VALIDATION — Normalize DB routes to match frontend expectations
      const validatedDbRoutes = uniqueDbRoutes.map((route: any) => {
        const rawCourier = route.courier || route.courier_id || route.courierName || '';
        const normCourier = normalizeCourierName(rawCourier);
        
        // Skip routes with invalid couriers
        if (!normCourier || normCourier === 'Не назначено' || normCourier.toLowerCase() === 'по') {
          console.warn(`[ExcelSync] ⚠️ Dropping DB route with invalid courier: "${rawCourier}"`);
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
      
      
      setExcelDataState(prev => {
        // v5.148: Even if prev is null, we should create a state with routes
        const prevSafe = prev || { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: {} };
        
        // DB routes always take priority - they come from Turbo Robot calculation
        const existingRoutes = Array.isArray(prevSafe.routes) ? prevSafe.routes : [];

        // v5.180: Use validated DB routes (courier names normalized)
        const dbRoutesToMerge = validatedDbRoutes;

        // Build a map of order IDs that are already in DB routes
        const dbOrderIds = new Set<string>();
        dbRoutesToMerge.forEach((r: any) => {
          (r.orders || []).forEach((o: any) => {
            const oid = String(o.id || o.orderNumber || '');
            if (oid) dbOrderIds.add(oid);
          });
        });

        // Manual routes: keep only those that do not duplicate DB orders
        const manualRoutes = existingRoutes.filter((r: any) => {
          const id = String(r.id || '');
          // Only manual routes
          if (!id.startsWith('route_')) return false;
          const manualOrderIds = (r.orders || []).map((o: any) => String(o.id || o.orderNumber || ''));
          const hasDup = manualOrderIds.some((oid: string) => dbOrderIds.has(oid));
          return !hasDup;
        });

        // v5.141: Also deduplicate manual routes by ID
        const seenManualIds = new Set<string>();
        const uniqueManualRoutes = manualRoutes.filter((r: any) => {
          const rid = String(r.id || '');
          if (!rid || seenManualIds.has(rid)) return false;
          seenManualIds.add(rid);
          return true;
        });

        // Final routes: DB routes + manual routes without duplicates
        const finalRoutes = [...dbRoutesToMerge, ...uniqueManualRoutes];
        // Merged routes complete

        // v5.153: Update courier distanceKm from DB routes immediately
        // This ensures the Couriers tab shows correct km after refreshRoutesFromDB (robot finish / page load)
        // v5.201: Fixed - create couriers from routes if they don't exist
        let updatedCouriers = prevSafe.couriers || [];
        
        // Calculate metrics from all routes (DB + manual)
        const distMap = new Map<string, { km: number; orders: number }>();
        finalRoutes.forEach((r: any) => {
            const rawCourier = (r.courier || r.courier_id || '').toString().trim();
            const normKey = normalizeCourierName(rawCourier);
            if (!normKey || normKey === 'Не назначено') return;
            const existing = distMap.get(normKey) || { km: 0, orders: 0 };
            existing.km += Number(r.totalDistance || r.total_distance || 0);
            existing.orders += Number(r.ordersCount || r.orders_count || (r.orders?.length) || 0);
            distMap.set(normKey, existing);
        });
        
        if (distMap.size > 0) {
            // Update existing couriers with new metrics
            const existingCourierNames = new Set((updatedCouriers || []).map((c: any) => 
                normalizeCourierName(c.name || c.courierName || '').toUpperCase()
            ));
            
            updatedCouriers = (updatedCouriers || []).map((c: any) => {
                const rawName = (c.name || c.courierName || '').toString().trim();
                const normName = normalizeCourierName(rawName).toUpperCase();
                const calc = distMap.get(normName);
                if (calc && calc.km > 0) {
                    return { ...c, distanceKm: Number(calc.km.toFixed(2)), calculatedOrders: calc.orders };
                }
                return c;
            });
            
            // Add new couriers from routes that don't exist yet
            distMap.forEach((metrics, courierName) => {
                if (!existingCourierNames.has(courierName.toUpperCase())) {
                    updatedCouriers.push({
                        name: courierName,
                        distanceKm: Number(metrics.km.toFixed(2)),
                        calculatedOrders: metrics.orders,
                        isActive: true,
                        vehicleType: 'car'
                    });
                }
            });
        }

        return {
          ...prevSafe,
          routes: finalRoutes,
          couriers: updatedCouriers
        };

      });
    } catch (e) {
      console.warn('[ExcelSync] Failed to refresh routes:', e);
    }
  }, [fetchRoutesWithDate]);

  // v5.148: Auto-refresh routes when data is loaded OR on initial load
  useEffect(() => {
    // Always try to load routes from DB - they may exist even without excelData
    // Auto-refreshing routes
    refreshRoutesFromDB();
  }, [refreshRoutesFromDB]);
  
  // Also refresh when orders change (debounced — long enough to let robot finish a batch)
  useEffect(() => {
    if (excelData && excelData.orders?.length > 0) {
      // Debounce long enough that we don't refresh mid-calculation every 2s
      const t = setTimeout(() => refreshRoutesFromDB(), 10000);
      return () => clearTimeout(t);
    }
  }, [excelData?.orders?.length, refreshRoutesFromDB]);

  // Expose refresh function globally for manual trigger
  useEffect(() => {
    (window as any).__refreshTurboRoutes = refreshRoutesFromDB;
    (window as any).__getExcelData = () => excelData;
    (window as any).__loadRoutesFromDB = async () => {
      // Manual refresh
      await refreshRoutesFromDB();
    };
    return () => { 
      delete (window as any).__refreshTurboRoutes;
      delete (window as any).__getExcelData;
      delete (window as any).__loadRoutesFromDB;
    };
  }, [refreshRoutesFromDB, excelData]);

  return (
    <ExcelDataContext.Provider value={contextValue}>
      {children}
    </ExcelDataContext.Provider>
  )
}

function applyCourierVehicleMap(data: any, current?: any): any {
  if (!data) return data;
  if (current && data === current) return data;
  
  try {
    const rawMap = localStorageUtils.getCourierVehicleMap()
    const bruteNormalizedMap: Record<string, string> = {};
    Object.keys(rawMap).forEach(name => {
      bruteNormalizedMap[normalizeCourierName(name).toLowerCase()] = rawMap[name];
    });

    const currentOrdersMap = new Map<string, any>((current?.orders || []).map((o: any) => [getStableOrderId(o), o]));

    let persistedOverrides: Record<string, any> = {};
    try {
      const raw = localStorage.getItem('km_manual_overrides');
      if (raw) persistedOverrides = JSON.parse(raw);
    } catch (_) {}

    const rawCouriers = Array.isArray(data.couriers) ? data.couriers : [];
    CourierIdResolver.registerList(rawCouriers);

    const orders = Array.isArray(data.orders) ? data.orders.map((o: any) => {
        const sid = getStableOrderId(o);
        const existing = currentOrdersMap.get(sid) as any;

        const oId  = o.id   ? String(o.id)          : null;
        const oNum = o.orderNumber ? String(o.orderNumber) : null;
        let earlyOvr = (oId && persistedOverrides[oId]) ? persistedOverrides[oId] : null;
        if (!earlyOvr && oNum) earlyOvr = persistedOverrides[oNum] ?? null;
        if (!earlyOvr && oId) earlyOvr = persistedOverrides[Number(oId)] ?? null;

        if (earlyOvr?.courier && !isId0CourierName(earlyOvr.courier) && earlyOvr.courier !== 'Не назначено') {
            o = { ...o, courier: earlyOvr.courier };
        }

        const isId = o.courier && /^[0-9a-f]{24}$/i.test(String(o.courier));
        const isIncomingUnassigned = !o.courier || isId0CourierName(o.courier) || o.courier === 'Не назначено' || isId;
        const existingHasCourier = existing?.courier && !isId0CourierName(existing.courier) && existing.courier !== 'Не назначено';

        if (existing?.settledDate && !o.settledDate) {
            return existing;
        }

        if (existing) {
            if (existingHasCourier && isIncomingUnassigned) {
                o = { ...o, courier: existing.courier, courierId: existing.courierId };
            } else if (isIncomingUnassigned) {
                const rawVal = getCourierName(o.courier);
                const cachedName = CourierIdResolver.resolve(rawVal);
                if (cachedName) o = { ...o, courier: cachedName };
            }

            const incomingHasGeo = o.coords?.lat && o.coords?.lng;
            const memoryHasGeo = existing.coords?.lat && existing.coords?.lng;
            if (!incomingHasGeo && memoryHasGeo) {
                o = { 
                    ...o, 
                    coords: existing.coords,
                    locationType: existing.locationType,
                    latitude: existing.latitude,
                    longitude: existing.longitude,
                    isAddressLocked: existing.isAddressLocked,
                    isLocked: existing.isLocked,
                    hasGeoErrors: existing.hasGeoErrors,
                    streetNumberMatched: existing.streetNumberMatched,
                    kmlZone: o.kmlZone || existing.kmlZone,
                    kmlHub: o.kmlHub || existing.kmlHub,
                    deliveryZone: o.deliveryZone || existing.deliveryZone
                };
            }
        } else if (isIncomingUnassigned) {
            const rawVal = getCourierName(o.courier);
            const cachedName = CourierIdResolver.resolve(rawVal);
            if (cachedName) o = { ...o, courier: cachedName };
        }

        if (existing && !earlyOvr &&
            existing.address === o.address && 
            existing.status === o.status && 
            existing.courier === o.courier &&
            existing.coords?.lat === o.coords?.lat &&
            !!existing.settledDate === !!o.settledDate) {
            return existing;
        }

        let base = (o.coords?.lat && o.coords?.lng && o.isAddressLocked) ? o : enrichOrderGeodata(o);

        const id  = o.id   ? String(o.id)          : null;
        const num = o.orderNumber ? String(o.orderNumber) : null;
        let ovr = (id  && persistedOverrides[id])  ? persistedOverrides[id]  : null;
        if (!ovr && num) ovr = persistedOverrides[num] ?? null;
        if (!ovr && id)  ovr = persistedOverrides[Number(id)] ?? null;

        let isSafeToApplyOverride = !!ovr;
        if (ovr && (ovr.creationDate || ovr.dateShift) && (o.creationDate || data.creationDate)) {
             const ovrNorm = normalizeDateToIso(ovr.creationDate || ovr.dateShift);
             const ordNorm = normalizeDateToIso(o.creationDate || data.creationDate);
             if (ovrNorm && ordNorm && ovrNorm !== ordNorm) {
                 isSafeToApplyOverride = false;
             }
        }


        if (isSafeToApplyOverride) {
            return {
                ...base,
                ...ovr,
                status: ovr.settledDate ? (ovr.status || 'исполнен') : (base.status || ovr.status)
            };
        }

        return base;
    }) : []
    
    const couriers = rawCouriers.map((c: any) => ({
        ...c,
        vehicleType: String(c.vehicleType || 'car').toLowerCase().trim()
    }));
    
    const courierNamesInList = new Set(couriers.map((c: any) => c.name || c._id || c.id));

    for (let i = 0; i < orders.length; i++) {
      const c = orders[i].courier;
      if (c) {
        const cName = typeof c === 'string' ? c : (c.name || c._id || c.id);
        const normalizedCName = normalizeCourierName(cName);

        if (cName && !Array.from(courierNamesInList).some(n => normalizeCourierName(n).toLowerCase() === normalizedCName.toLowerCase())) {
          const cId = typeof c === 'string' ? c : (c._id || c.id || cName);
          couriers.push({
            _id: cId,
            id: cId,
            name: cName,
            vehicleType: 'car'
          });
          courierNamesInList.add(cName);
        }
      }
    }

    const processedCouriers = couriers.map((c: any) => {
      const normalizedName = normalizeCourierName(c.name).toLowerCase();
      const mappedType = bruteNormalizedMap[normalizedName];
      if (mappedType && mappedType !== c.vehicleType) {
        return { ...c, vehicleType: mappedType };
      }
      return c.vehicleType ? c : { ...c, vehicleType: 'car' };
    });

    let paymentMethods = Array.isArray(data.paymentMethods) ? data.paymentMethods : []
    if (paymentMethods.length === 0 && orders.length > 0) {
      const uniqueMethods = new Set<string>();
      for (let i = 0; i < orders.length; i++) {
        if (orders[i].paymentMethod) uniqueMethods.add(orders[i].paymentMethod);
      }
      paymentMethods = Array.from(uniqueMethods).map(method => ({
        id: method,
        name: method
      }));
    }

    // v5.135: Route Preservation Guard
    // If incoming routes are empty but we have local routes for the same date, preserve them.
    const incomingRoutes = Array.isArray(data.routes) ? data.routes : [];
    const localRoutes = Array.isArray(current?.routes) ? current.routes : [];
    
    const incomingDate = normalizeDateToIso(data.creationDate || (orders.find((o: any) => o.creationDate))?.creationDate || "");
    const localDate = normalizeDateToIso(current?.creationDate || (current?.orders?.find((o:any) => o.creationDate))?.creationDate || "");
    
    let routesToProcess = incomingRoutes;
    if (incomingRoutes.length === 0 && localRoutes.length > 0 && incomingDate === localDate) {
        // Preserving local routes
        routesToProcess = localRoutes;
    }

    return {
      ...data,
      creationDate: data.creationDate || current?.creationDate,
      routes: routesToProcess.map((r: any) => {
        const existingRoute = localRoutes.find((cr: any) => cr.id === r.id);
        
        if (existingRoute) {
            const currentRIds = (existingRoute.orders || []).map((o: any) => getStableOrderId(o)).sort().join('|');
            const incomingRIds = (r.orders || []).map((o: any) => getStableOrderId(o)).sort().join('|');
            
            if (currentRIds === incomingRIds && 
                (existingRoute.totalDistance === r.totalDistance || r.totalDistance === 0) && 
                (existingRoute.totalDuration === r.totalDuration || r.totalDuration === 0) &&
                (existingRoute.isOptimized === r.isOptimized || r.totalDistance === 0)) {
               return existingRoute;
            }
        }
        return {
          ...r,
          orders: Array.isArray(r.orders) ? r.orders.map((o: any) => {
             // v5.135: Deep Geodata Preservation for Route Orders
             const sid = getStableOrderId(o);
             const memOrder = currentOrdersMap.get(sid);
             if (memOrder && memOrder.coords?.lat && !o.coords?.lat) {
                 return { ...o, ...memOrder };
             }
             return o.coords?.lat ? o : enrichOrderGeodata(o);
          }) : []
        };
      }),
      orders,
      couriers: processedCouriers.length > 0 ? processedCouriers : (current?.couriers || []),
      paymentMethods,
      errors: Array.isArray(data.errors) ? data.errors : []
    }
  } catch (e) {
    console.error('CRITICAL ERROR in applyCourierVehicleMap:', e);
    return data;
  }
}
