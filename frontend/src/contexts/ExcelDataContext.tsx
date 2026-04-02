import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback, useMemo } from 'react'
import { localStorageUtils } from '../utils/ui/localStorage'
import { toast } from 'react-hot-toast'
import { normalizeCourierName, isId0CourierName, getCourierName } from '../utils/data/courierName'
import { enrichOrderGeodata } from '../utils/data/excelProcessor'
import { getStableOrderId } from '../utils/data/orderId'
import { normalizeDateToIso } from '../utils/data/dateUtils'
import { CourierIdResolver } from '../utils/data/courierIdMap'
import { useDashboardStore } from '../stores/useDashboardStore'

interface ExcelData {
  orders: any[]
  couriers: any[]
  paymentMethods: any[]
  routes: any[]
  errors: any[]
  summary: any
  lastModified?: number
  creationDate?: string
}

interface ExcelDataContextType {
  excelData: ExcelData | null
  setExcelData: (data: ExcelData | null) => void
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

  // Helper to fetch routes with current date
  const fetchRoutesWithDate = useCallback(async (token: string) => {
    const apiDateShift = useDashboardStore.getState().apiDateShift;
    
    console.log('[ExcelSync] 📡 Fetching routes from API, date:', apiDateShift);
    
    // v5.143: Normalize date to YYYY-MM-DD and pass to backend
    let normalizedDate = '';
    if (apiDateShift) {
      if (/^\d{2}\.\d{2}\.\d{4}$/.test(apiDateShift)) {
        const parts = apiDateShift.split('.');
        normalizedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(apiDateShift)) {
        normalizedDate = apiDateShift;
      }
    }
    
    // Build URL with date parameter
    const url = normalizedDate 
      ? `/api/routes/calculated?date=${encodeURIComponent(normalizedDate)}`
      : '/api/routes/calculated';
    
    const routesRes = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    let allRoutes = [];
    if (routesRes.ok) {
      const routesJson = await routesRes.json();
      allRoutes = routesJson.data || [];
      console.log('[ExcelSync] 📥 Got routes from API:', allRoutes.length);
    } else {
      console.log('[ExcelSync] ❌ API error:', routesRes.status);
    }
    
    console.log('[ExcelSync] ✅ Routes loaded:', { count: allRoutes.length, date: normalizedDate || 'today' });
    
    // Debug: show first few routes
    if (allRoutes.length > 0) {
      console.log('[ExcelSync] 📋 Sample route:', JSON.stringify({
        id: allRoutes[0].id,
        courier: allRoutes[0].courier,
        ordersCount: allRoutes[0].ordersCount,
        targetDate: allRoutes[0].targetDate
      }, null, 2));
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
        try {
          // 1. Сначала пробуем загрузить с сервера
          const token = localStorage.getItem('km_access_token');
          if (token) {
            try {
              const response = await fetch('/api/v1/state', {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              
              const contentType = response.headers.get('content-type');
              if (contentType && contentType.includes('text/html')) {
                  throw new Error('API returned HTML');
              }

              if (response.ok) {
                const json = await response.json();
                console.log('[ExcelSync] Server response:', json.success ? 'OK' : 'FAIL', 
                  json.data ? `orders: ${json.data.orders?.length || 0}, routes: ${json.data.routes?.length || 0}` : 'no data');
                
                // v5.152: Check if server has meaningful data (at least orders)
                const serverHasOrders = json.success && json.data && (json.data.orders?.length > 0);
                
                // v5.152: Also check localStorage for fresh data
                const localRaw = localStorage.getItem('km_dashboard_processed_data');
                let localData = null;
                if (localRaw) {
                  try {
                    localData = JSON.parse(localRaw);
                  } catch (e) {}
                }
                
                // v5.152: Use local data if it exists and has orders, OR if server has no orders
                console.log('[ExcelSync] 🔍 Data check:', {
                  localHasOrders: localData?.orders?.length || 0,
                  serverHasOrders: json.data?.orders?.length || 0,
                  localLastModified: localData?.lastModified,
                  serverLastModified: json.data?.lastModified
                });
                
                if (localData && localData.orders && localData.orders.length > 0) {
                  if (!serverHasOrders || (localData.lastModified && (!json.data.lastModified || localData.lastModified > json.data.lastModified))) {
                    console.log('[ExcelSync] 📱 Using localStorage data:', localData.orders.length, 'orders (server has', json.data?.orders?.length || 0, ')');
                    setExcelDataState(localData);
                    return;
                  } else {
                    console.log('[ExcelSync] 📱 localStorage data exists but server has newer data');
                  }
                } else {
                  console.log('[ExcelSync] 📱 localStorage has no orders (', localData?.orders?.length || 0, ')');
                }
                
                if (json.success && json.data) {
                  const serverData = json.data;
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
                            return { 
                                ...o, 
                                ...override,
                                status: override.settledDate ? (override.status || 'исполнен') : (o.status || override.status)
                            };
                        }
                        return o;
                      });
                    } catch (e) {}
                  }
                  
                  // v25.3: Also fetch routes from database when using server data
                  try {
                    const token = localStorage.getItem('km_access_token');
                    if (token) {
                      const dbRoutes = await fetchRoutesWithDate(token);
                      console.log('[ExcelSync] 🔄 DB Routes loaded:', dbRoutes.length);
                      
                      // Merge with existing routes if any
                      const existingRoutes = Array.isArray(serverData.routes) ? serverData.routes : [];
                      
                      // v5.141: Improved merging logic with deduplication
                      const allRouteIds = new Set<string>();
                      const mergedRoutes: any[] = [];
                      
                      // Add existing routes first (deduplicated)
                      existingRoutes.forEach((r: any) => {
                        const rid = String(r.id || '');
                        if (rid && !allRouteIds.has(rid)) {
                          allRouteIds.add(rid);
                          mergedRoutes.push(r);
                        }
                      });
                      
                      // Add DB routes (deduplicated, DB routes have priority)
                      dbRoutes.forEach((r: any) => {
                        const rid = String(r.id || '');
                        if (rid && !allRouteIds.has(rid)) {
                          allRouteIds.add(rid);
                          mergedRoutes.push(r);
                        }
                      });
                      
                      serverData.routes = mergedRoutes;

                      // v5.147: Update courier distances from these routes (skip "Не назначено")
                      // Normalize both courier names for proper matching
                      if (serverData.couriers && Array.isArray(serverData.couriers)) {
                        serverData.couriers.forEach((c: any) => {
                            const rawName = (c.name || c.courierName || '').toString().trim();
                            const normName = rawName.replace(/\s+/g, ' ').toUpperCase();
                            
                            // v5.141: Skip "Не назначено"
                            if (normName === 'НЕ НАЗНАЧЕНО' || !rawName) return;
                            
                            // v5.147: Normalize courier field from routes - check both courier and courier_id
                            const courierRoutes = mergedRoutes.filter((r: any) => {
                              const routeCourier = (r.courier || r.courier_id || '').toString().trim().replace(/\s+/g, ' ').toUpperCase();
                              return routeCourier === normName;
                            });
                            
                            if (courierRoutes.length > 0) {
                                const totalDist = courierRoutes.reduce((acc: number, curr: any) => acc + (Number(curr.total_distance) || 0), 0);
                                const totalOrders = courierRoutes.reduce((acc: number, curr: any) => acc + (Number(curr.ordersCount) || 0), 0);
                                c.distanceKm = Number(totalDist.toFixed(2));
                                c.calculatedOrders = totalOrders;
                                console.log(`[ExcelSync] 📍 Updated courier ${normName}: ${c.distanceKm} km, ${totalOrders} orders (${courierRoutes.length} routes)`);
                            }
                        });
                      }
                    }
                  } catch (e) {
                    console.warn('[ExcelSync] Failed to fetch routes from database:', e);
                  }

                  console.log('[ExcelSync] 🚀 Using Server data (with distances and routes).');
                  setExcelDataState(serverData);
                  return;
                }
              }
            } catch (e) {
              console.warn('[ExcelSync] Server load failed:', e);
            }
          }

            // 2. Если сервера нет или ошибка, грузим из localStorage
          const localData = localStorage.getItem('km_dashboard_processed_data')
          
          // Always try to fetch routes from database first
          let dbRoutes: any[] = [];
          try {
            const token = localStorage.getItem('km_access_token');
            if (token) {
              dbRoutes = await fetchRoutesWithDate(token);
              console.log('[ExcelSync] 🔄 DB Routes loaded:', dbRoutes.length);
            }
          } catch (e) {
            console.warn('[ExcelSync] Failed to fetch routes from database:', e);
          }
          
          if (localData) {
            const parsed = JSON.parse(localData);
            
            // Merge with DB routes
            const existingRoutes = Array.isArray(parsed.routes) ? parsed.routes : [];
            const existingRouteIds = new Set(existingRoutes.map((r: any) => r.id));
            const newDbRoutes = dbRoutes.filter((r: any) => !existingRouteIds.has(r.id));
            
            if (newDbRoutes.length > 0) {
              console.log('[ExcelSync] 🔄 Adding DB routes to local:', newDbRoutes.length);
              parsed.routes = [...existingRoutes, ...newDbRoutes];
            } else if (existingRoutes.length === 0 && dbRoutes.length > 0) {
              console.log('[ExcelSync] 🔄 Using DB routes:', dbRoutes.length);
              parsed.routes = dbRoutes;
            }
            
            // v5.147: Update courier distances when loading from localStorage + DB routes
            if (parsed.couriers && Array.isArray(parsed.couriers)) {
              const allRoutes = parsed.routes || [];
              parsed.couriers.forEach((c: any) => {
                const rawName = (c.name || c.courierName || '').toString().trim();
                const normName = rawName.replace(/\s+/g, ' ').toUpperCase();
                if (normName === 'НЕ НАЗНАЧЕНО' || !rawName) return;
                
                const courierRoutes = allRoutes.filter((r: any) => {
                  const routeCourier = (r.courier || r.courier_id || '').toString().trim().replace(/\s+/g, ' ').toUpperCase();
                  return routeCourier === normName;
                });
                
                if (courierRoutes.length > 0) {
                  const totalDist = courierRoutes.reduce((acc: number, curr: any) => acc + (Number(curr.total_distance) || 0), 0);
                  const totalOrders = courierRoutes.reduce((acc: number, curr: any) => acc + (Number(curr.ordersCount) || 0), 0);
                  c.distanceKm = Number(totalDist.toFixed(2));
                  c.calculatedOrders = totalOrders;
                  console.log(`[ExcelSync] 📍 Loaded: ${normName} = ${c.distanceKm} km, ${totalOrders} orders`);
                }
              });
            }
            
            setExcelDataState(parsed)
          } else if (dbRoutes.length > 0) {
            // No local data, but we have DB routes - create minimal state
            console.log('[ExcelSync] 🔄 Using DB routes only (no local data):', dbRoutes.length);
            setExcelDataState({
              orders: [],
              couriers: [],
              paymentMethods: [],
              routes: dbRoutes,
              errors: [],
              summary: {}
            });
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
            console.log('[ExcelSync] 🔄 Storage event (cross-tab): Routes updated by Turbo Robot:', routes.length);
            setExcelDataState(prev => {
              if (prev) {
                return { ...prev, routes };
              }
              return prev;
            });
          }
        } catch (e) {
          console.warn('[ExcelSync] Failed to parse routes from storage event:', e);
        }
      }
    };
    
    // v30.0: Listen for same-tab DOM events dispatched by socketService
    // socketService dispatches 'km:turbo:routes_update' when robot finishes routing
    const handleTurboRoutes = (e: Event) => {
      const { routes, date } = (e as CustomEvent).detail || {};
      if (routes && Array.isArray(routes) && routes.length > 0) {
        console.log('[ExcelSync] 📡 km:turbo:routes_update received:', routes.length, 'routes for', date);
        setExcelDataState(prev => {
          if (!prev) return prev;
          // DB routes take priority; remove duplicates by id
          const dbIds = new Set(routes.map((r: any) => String(r.id)));
          const manualRoutes = (prev.routes || []).filter((r: any) => {
            const id = String(r.id || '');
            return id.startsWith('route_') && !dbIds.has(id);
          });
          return { ...prev, routes: [...routes, ...manualRoutes] };
        });
      }
    };

    // v30.0: Listen for enriched dashboard data (courier km distances) from robot
    const handleTurboDashboard = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (!data) return;
      console.log('[ExcelSync] 📡 km:turbo:dashboard_update received: couriers=', data.couriers?.length);
      if (data.couriers && Array.isArray(data.couriers)) {
        setExcelDataState(prev => {
          if (!prev) return prev;
          // Merge distanceKm from robot-enriched couriers into current state
          const enrichedMap = new Map<string, number>();
          data.couriers.forEach((c: any) => {
            const name = (c.courierName || c.name || '').toString().trim().toUpperCase();
            if (name && (c.distanceKm || 0) > 0) {
              enrichedMap.set(name, Number(c.distanceKm));
            }
          });
          if (enrichedMap.size === 0) return prev;
          const updatedCouriers = (prev.couriers || []).map((c: any) => {
            const name = (c.courierName || c.name || '').toString().trim().toUpperCase();
            const km = enrichedMap.get(name);
            if (km !== undefined && km > 0) {
              return { ...c, distanceKm: km };
            }
            return c;
          });
          return { ...prev, couriers: updatedCouriers };
        });
      }
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
    
    // v5.135: Winning Logic - Protect local state from stale or partial server updates
    const localSettledCount = (current.orders || []).filter(o => !!o.settledDate).length;
    const serverSettledCount = (next.orders || []).filter(o => !!o.settledDate).length;
    
    const localRouteCount = (current.routes || []).length;
    const serverRouteCount = (next.routes || []).length;

    // Reject completely empty updates if we already have valid data
    const isNewDataEmpty = (!next.orders || next.orders.length === 0);
    const hadOrders = (current.orders && current.orders.length > 0);

    if (isNewDataEmpty && hadOrders) {
        console.warn(`[ExcelSync] Server sent EMPTY data but we have ${current.orders.length} orders. REJECTING update.`);
        return current;
    }

    // If server sends significantly LESS information, it's a regression. 
    // Return a merged version or stick with Local.
    if (serverSettledCount < localSettledCount || (serverRouteCount === 0 && localRouteCount > 0)) {
        console.warn(`[ExcelSync] Server Data Partial: Settled=${serverSettledCount} (Local=${localSettledCount}), Routes=${serverRouteCount} (Local=${localRouteCount}). Protecting Local State.`);
        return {
            ...next,
            orders: serverSettledCount < localSettledCount ? current.orders : next.orders,
            routes: serverRouteCount < localRouteCount ? current.routes : next.routes,
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
        localStorageUtils.setData('km_dashboard_processed_data', fullData);
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
  // This ensures FastOperator data persists across page reloads
  useEffect(() => {
    if (excelData && excelData.orders && excelData.orders.length > 0) {
      // Debounce save to avoid excessive writes during rapid updates
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        try {
          // v5.152: Strip geometry from routes to prevent localStorage QuotaExceededError
          const routesNoGeo = (excelData.routes || []).map((r: any) => ({ ...r, geometry: undefined }));
          const dataToSave = { ...excelData, routes: routesNoGeo, lastModified: Date.now() };
          localStorageUtils.setData('km_dashboard_processed_data', dataToSave);
          console.log('[ExcelSync] 💾 Auto-saved dashboard data to localStorage:', excelData.orders.length, 'orders');
        } catch (e) {
          console.warn('[ExcelSync] Failed to auto-save dashboard data:', e);
        }
      }, 500); // Save 500ms after last change
    }
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [excelData]);

  const setExcelData = useCallback((incomingData: ExcelData | null) => {
    if (incomingData) {
      setExcelDataState(prev => {
        const val = protectData(incomingData, prev);
        return val;
      });
    } else {
      setExcelDataState(null);
      localStorage.removeItem('km_dashboard_processed_data');
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
    localStorage.removeItem('km_dashboard_processed_data')

    if (!options?.skipServerWipe) {
      const token = localStorage.getItem('km_access_token');
      if (token) {
        const emptyState = { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: {} };
        fetch('/api/v1/state', {
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
  // v5.141: Improved deduplication to avoid duplicate routes
  const refreshRoutesFromDB = useCallback(async () => {
    try {
      const token = localStorage.getItem('km_access_token');
      if (!token) return;
      
      const dbRoutes = await fetchRoutesWithDate(token);
      console.log('[ExcelSync] 🔄 Refreshed routes from DB:', dbRoutes.length, 'routes');
      
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
      
      // Debug: show sample route
      if (uniqueDbRoutes.length > 0) {
        console.log('[ExcelSync] Sample route:', JSON.stringify({
          id: uniqueDbRoutes[0].id,
          courier: uniqueDbRoutes[0].courier,
          orders: uniqueDbRoutes[0].ordersCount,
          distance: uniqueDbRoutes[0].totalDistance,
          timeBlock: uniqueDbRoutes[0].timeBlock
        }, null, 2));
      }
      
      setExcelDataState(prev => {
        // v5.148: Even if prev is null, we should create a state with routes
        const prevSafe = prev || { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: {} };
        
        // DB routes always take priority - they come from Turbo Robot calculation
        const existingRoutes = Array.isArray(prevSafe.routes) ? prevSafe.routes : [];

        // Build a map of order IDs that are already in DB routes
        const dbOrderIds = new Set<string>();
        uniqueDbRoutes.forEach((r: any) => {
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
        const finalRoutes = [...uniqueDbRoutes, ...uniqueManualRoutes];
        console.log('[ExcelSync] Merged routes:', { db: uniqueDbRoutes.length, manual: uniqueManualRoutes.length, total: finalRoutes.length });
        return {
          ...prevSafe,
          routes: finalRoutes
        };
      });
    } catch (e) {
      console.warn('[ExcelSync] Failed to refresh routes:', e);
    }
  }, [fetchRoutesWithDate]);

  // v5.148: Auto-refresh routes when data is loaded OR on initial load
  useEffect(() => {
    // Always try to load routes from DB - they may exist even without excelData
    console.log('[ExcelSync] Auto-refreshing routes from DB...');
    refreshRoutesFromDB();
  }, [refreshRoutesFromDB]);
  
  // Also refresh when orders change
  useEffect(() => {
    if (excelData && excelData.orders?.length > 0) {
      console.log('[ExcelSync] Orders changed, refreshing routes...');
      refreshRoutesFromDB();
    }
  }, [excelData?.orders?.length, refreshRoutesFromDB]);

  // Expose refresh function globally for manual trigger
  useEffect(() => {
    (window as any).__refreshTurboRoutes = refreshRoutesFromDB;
    (window as any).__getExcelData = () => excelData;
    (window as any).__loadRoutesFromDB = async () => {
      console.log('[ExcelSync] Manual route refresh triggered');
      await refreshRoutesFromDB();
      console.log('[ExcelSync] Current routes:', excelData?.routes?.length || 0);
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

        const normName = normalizeCourierName(o.courier);
        if (normName.includes('ЗОРЯ') || normName.includes('БАГНЄВ') || normName.includes('БАГНЕВ')) {
            console.log(`[Trace-Assignment] Order ${num}: Courier="${o.courier}", CoordsFound=${!!o.coords?.lat}, MemFound=${!!existing}`);
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
        console.log(`[ExcelSync] Preserving ${localRoutes.length} local routes for date ${incomingDate}`);
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
