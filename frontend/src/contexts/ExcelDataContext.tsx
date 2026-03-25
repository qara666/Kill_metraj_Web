import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback, useMemo } from 'react'
import { localStorageUtils } from '../utils/ui/localStorage'
import { toast } from 'react-hot-toast'
import { normalizeCourierName } from '../utils/data/courierName'
import { enrichOrderGeodata } from '../utils/data/excelProcessor'
import { isOrderCompleted } from '../utils/data/orderStatus'
import { getStableOrderId } from '../utils/data/orderId'

interface ExcelData {
  orders: any[]
  couriers: any[]
  paymentMethods: any[]
  routes: any[]
  errors: any[]
  summary: any
  lastModified?: number
}

interface ExcelDataContextType {
  excelData: ExcelData | null
  setExcelData: (data: ExcelData | null) => void
  updateExcelData: (dataOrUpdater: ExcelData | ((prev: ExcelData) => ExcelData), force?: boolean) => void
  clearExcelData: () => void
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
  const bypassSaveRef = useRef(false)

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
              if (response.ok) {
                const json = await response.json();
                if (json.success && json.data) {
                  const serverData = json.data;
                  const localOverrides = localStorage.getItem('km_manual_overrides');
                  if (localOverrides && serverData.orders) {
                    try {
                      const overrides = JSON.parse(localOverrides);
                      serverData.orders = serverData.orders.map((o: any) => {
                        const id = o.id ? String(o.id) : null;
                        const num = o.orderNumber ? String(o.orderNumber) : null;
                        
                        // v5.97: Advanced Dual-Key Lookup (ID + OrderNumber)
                        let override = id ? overrides[id] : null;
                        if (!override && num) override = overrides[num];
                        
                        // Fallback for cases where ID might have been saved as a number or string
                        if (!override && id) override = overrides[Number(id)];
                        
                        if (override) {
                            return { 
                                ...o, 
                                ...override,
                                // v5.97: Ensure status consistency using normalized comparison
                                status: override.settledDate ? (override.status || 'исполнен') : (o.status || override.status)
                            };
                        }
                        return o;
                      });
                    } catch (e) { console.warn('Sync overrides failed:', e); }
                  }

                  const localStored = localStorage.getItem('km_dashboard_processed_data');
                  let localData: any = null;
                  try { if (localStored) localData = JSON.parse(localStored); } catch(e) {}

                  // v38.5: HYBRID PRIORITY - Prefer local data if it has more settled orders or is newer
                  const localSettledCount = (localData?.orders || []).filter((o: any) => !!o.settledDate).length;
                  const serverSettledCount = (serverData?.orders || []).filter((o: any) => !!o.settledDate).length;
                  
                  const isLocalFresher = (localData?.lastModified || 0) > (serverData?.lastModified || 0);
                  const isLocalMoreComplete = localSettledCount > serverSettledCount;

                  if ((isLocalFresher || isLocalMoreComplete) && localSettledCount > 0) {
                    console.log(`🛡️ Hybrid Sync: Using local data (Settled: ${localSettledCount} vs Server: ${serverSettledCount})`);
                    // v5.101: ACTUALLY LOAD LOCAL DATA AND EXIT to prevent server overwrite
                    setExcelData(localData);
                    return;
                  }
                  
                  console.log('✅ Данные загружены с сервера (Hybrid Sync)');
                  // v5.98: Re-apply overrides to server data
                  if (localOverrides) {
                      try {
                         const overrides = JSON.parse(localOverrides);
                         serverData.orders = serverData.orders.map((o: any) => {
                             const num = o.orderNumber ? String(o.orderNumber) : null;
                             const sid = o.id ? String(o.id) : null;
                             let ovr = num ? overrides[num] : null;
                             if (!ovr && sid) ovr = overrides[sid];
                             if (ovr) return { ...o, ...ovr, status: ovr.settledDate ? (ovr.status || 'исполнен') : (o.status || ovr.status) };
                             return o;
                         });
                      } catch(e) {}
                  }
                  setExcelData(applyCourierVehicleMap(serverData));
                  return;
                  
                  console.log('⚠️ Переходим к проверке локальной копии...');
                }
              }
            } catch (apiError) {
              console.warn('Не удалось загрузить данные с сервера:', apiError);
            }
          }

          // 2. Fallback to localStorage (для старых данных или оффлайн)
          const stored = localStorage.getItem('km_dashboard_processed_data')
          if (stored) {
            const parsed = JSON.parse(stored)
            if (parsed && typeof parsed === 'object') {
              // ... overrides logic stays same ...
              const mapped = applyCourierVehicleMap(parsed)
              // v5.99: USE UNIFIED SETTER
              setExcelData(mapped)
              console.log('️ Данные загружены из localStorage (legacy)');
            }
          }
        } catch (error) {
          console.warn('Ошибка восстановления данных:', error)
          toast.error('Ошибка загрузки данных')
        }
      };

      loadData();
    }
  }, [])

  const saveTimeoutRef = useRef<any>(null);
  const excelDataRef = useRef<ExcelData | null>(null);

  /**
   * Universal LocalStorage Sync (Debounced for performance)
   */
  const syncToLocalStorage = useCallback((data: ExcelData) => {
    try {
      const dataToSave = { ...data, lastModified: Date.now() };
      localStorage.setItem('km_dashboard_processed_data', JSON.stringify(dataToSave));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }, []);

  useEffect(() => {
    excelDataRef.current = excelData;
    if (!excelData) return;
    
    // Check if we should skip this save (e.g., just loaded from server)
    if (bypassSaveRef.current) {
      bypassSaveRef.current = false;
      return;
    }
      // Immediate sync to localStorage for UI snappiness on reload
      syncToLocalStorage(excelData);

      // Debounced save to server (2.0s)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => saveDataToServer(excelData), 2000);

      return () => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      }
    }, [excelData, syncToLocalStorage]);

  /**
   * Universal Protection Helper:
   * Prevents overwriting local routes with empty server responses if order count is similar.
   */
  const protectData = useCallback((incoming: ExcelData, current: ExcelData | null): ExcelData => {
    const val = applyCourierVehicleMap(incoming, current);
    
    // Check local storage for backup if current state is null
    const localStored = localStorage.getItem('km_dashboard_processed_data');
    let localData: any = null;
    try { if (localStored) localData = JSON.parse(localStored); } catch(e) {}
    
    const backupData = current || localData;
    const backupHasRoutes = backupData?.routes && backupData.routes.length > 0;
    const incomingHasRoutes = val.routes && val.routes.length > 0;
    
    // v5.99: AGGRESSIVE ROUTE PROTECTION
    // If incoming is empty or has fewer routes/orders than backup, RESTORE FROM BACKUP
    if (backupHasRoutes) {
      const incomingOrderInRoutes = (val.routes || []).reduce((acc: number, r: any) => acc + (r.orders?.length || 0), 0);
      const backupOrderInRoutes = (backupData.routes || []).reduce((acc: number, r: any) => acc + (r.orders?.length || 0), 0);
      
      const shouldRestore = !incomingHasRoutes || 
                           (backupOrderInRoutes > incomingOrderInRoutes && Math.abs(val.orders?.length - backupData.orders?.length) < 5);

      if (shouldRestore) {
        console.log(`🛡️ Защита данных: восстановление маршрутов (${backupOrderInRoutes} заказов)`);
        val.routes = [...backupData.routes];
      }
    }
    return val;
  }, []);

  /**
   * Core logic for manual overrides persistence
   */
  const performManualOverridesSave = useCallback((orders: any[]) => {
    if (!orders) return;
    try {
      const overrides: Record<string, any> = {};
      orders.forEach((o: any) => {
        const isSettled = isOrderCompleted(o.status);
        if (o.manualGroupId || o.deadlineAt || o.isAddressLocked || o.settledDate || o.paymentMethodOverridden || isSettled) {
          const overrideData = {
            manualGroupId: o.manualGroupId,
            deadlineAt: o.deadlineAt,
            plannedTime: o.plannedTime,
            courier: o.courier,
            address: o.address,
            lat: o.lat,
            lng: o.lng,
            coords: o.coords,
            isAddressLocked: o.isAddressLocked,
            locationType: o.locationType,
            status: o.status,
            paymentMethod: o.paymentMethod,
            paymentMethodOverridden: o.paymentMethodOverridden,
            settlementNote: o.settlementNote,
            settledAmount: o.settledAmount,
            settledDate: o.settledDate,
            settlementSessionId: o.settlementSessionId,
            sessionTotalReceived: o.sessionTotalReceived,
            sessionTotalDifference: o.sessionTotalDifference,
            sessionTotalExpected: o.sessionTotalExpected,
            untakenChange: o.untakenChange,
            originalChangeAmount: o.originalChangeAmount
          };
          
          // Index by BOTH keys for maximum durability
          if (o.id) overrides[String(o.id)] = overrideData;
          if (o.orderNumber) overrides[String(o.orderNumber)] = overrideData;
        }
      });
      localStorage.setItem('km_manual_overrides', JSON.stringify(overrides));
      
      // v35.19: CRITICAL - Force immediate sync of the entire state to localStorage
      // v35.20: Use CURRENT orders passed to this function instead of stale ref
      // v38.6: Save to localStorage ONLY if next orders actually exist
      if (excelDataRef.current && excelDataRef.current.orders) {
        const fullData = { ...excelDataRef.current, orders: orders };
        fullData.lastModified = Date.now(); // FORCE freshening of local data
        localStorage.setItem('km_dashboard_processed_data', JSON.stringify(fullData));
      }
    } catch (e) {
      console.warn('Manual overrides save failed:', e);
    }
  }, []);

  /**
   * Automatic Manual Overrides Persistence
   * v35.16: Decoupled from bypassSaveRef to ensure first change is ALWAYS saved.
   */
  useEffect(() => {
    if (!excelData?.orders) return;
    performManualOverridesSave(excelData.orders);
  }, [excelData?.orders, performManualOverridesSave]);



  const saveDataToServer = async (data: ExcelData) => {
    const token = localStorage.getItem('km_access_token');
    if (!token) return;

    try {
      const response = await fetch('/api/v1/state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ data })
      });

      if (!response.ok) {
        throw new Error('Ошибка сервера');
      }
      // console.log(' Данные сохранены на сервере');
    } catch (error) {
      console.error('Ошибка сохранения на сервер:', error);
      toast.error('Ошибка сохранения на сервер', { id: 'save-error' });
    }
  };

  const setExcelData = useCallback((incomingData: ExcelData | null) => {
    if (window && (window as any).debugExcel) console.warn('[ExcelDataProvider:SET]', incomingData, (new Error()).stack)
    
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
      
      // Ensure routes are protected. Pass `next` (not prevSafe) as current so that
      // the settlement guard in applyCourierVehicleMap sees already-settled orders
      // and doesn't overwrite them in the second pass.
      const protectedNext = force ? next : protectData(next, next);

      return protectedNext;
    });
  }, [protectData]);

  const clearExcelData = useCallback(() => {
    if (window && (window as any).debugExcel) console.warn('[ExcelDataProvider:CLEAR]', (new Error()).stack)

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    setExcelDataState(null)
    localStorage.removeItem('km_dashboard_processed_data')

    // Also clear on server
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
  }, [])

  const updateRouteData = useCallback((newRoutes: any[]) => {
    if (window && (window as any).debugExcel) console.warn('[ExcelDataProvider:UPDATEROUTE]', newRoutes, (new Error()).stack)
    setExcelDataState(prev => {
      const next = prev ? { ...prev, routes: newRoutes } : {
        orders: [], couriers: [], paymentMethods: [], routes: newRoutes, errors: [], summary: undefined
      } as any;
      return next;
    })
  }, [])

  const updateOrderPaymentMethod = useCallback((orderNumber: string, newPaymentMethod: string) => {
    console.log(`🔄 Updating payment method for order ${orderNumber} to ${newPaymentMethod}`);
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

  // Handle unsaved changes on refresh/close
  useEffect(() => {
    const handleBeforeUnload = () => {
      // If there's a pending debounced save, we can't easily wait for it
      // in beforeunload without using synchronous XHR (deprecated) or 
      // navigator.sendBeacon. However, we've already saved to localStorage
      // immediately above, so at worst the server will be a few seconds behind
      // but the next load will prefer localStorage anyway.

      // We could trigger an immediate save here if we had access to the latest data
      // but since it's debounced, we'll rely on the immediate localStorage save.
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return (
    <ExcelDataContext.Provider value={contextValue}>
      {children}
    </ExcelDataContext.Provider>
  )
}

// Helpers
// (Local normalizeCourierName removed, using global one from ../utils/data/courierName)

/**
 * Optimizes the data by mapping vehicle types and ensuring required structures.
 * Fast-path included: skips processing if data identity hasn't changed.
 */
function applyCourierVehicleMap(data: any, current?: any): any {
  if (!data) return data;
  
  // v5.6: Performance Fast-Path
  // If we're passing the same object reference, skip expensive processing
  if (current && data === current) return data;
  
  try {
    const rawMap = localStorageUtils.getCourierVehicleMap()
    // Create a normalized version of the map for lookup
    const bruteNormalizedMap: Record<string, string> = {};
    Object.keys(rawMap).forEach(name => {
      bruteNormalizedMap[normalizeCourierName(name).toLowerCase()] = rawMap[name];
    });

    // v5.6: Efficiently process orders: skip expensive enrichment if coords already present
    // v5.101: Identity Stability v2 - Use getStableOrderId for persistent identity cross-refresh
    const currentOrdersMap = new Map<string, any>((current?.orders || []).map((o: any) => [getStableOrderId(o), o]));

    // 🔑 CRITICAL FIX: Load local overrides ONCE here so settled orders are NEVER
    // erased by stale server/Socket data when applyCourierVehicleMap is called.
    let persistedOverrides: Record<string, any> = {};
    try {
      const raw = localStorage.getItem('km_manual_overrides');
      if (raw) persistedOverrides = JSON.parse(raw);
    } catch (_) {}

    const orders = Array.isArray(data.orders) ? data.orders.map((o: any) => {
        const sid = getStableOrderId(o);
        const existing = currentOrdersMap.get(sid) as any;

        // 🔐 SETTLEMENT GUARD (highest priority):
        // If the existing in-memory order is settled but the incoming order isn't,
        // ALWAYS keep the settled version. Server/Socket data can never erase a local settlement.
        if (existing?.settledDate && !o.settledDate) {
            return existing;
        }

        // Fast-path: if the order hasn't changed at all, keep existing reference
        // 🔑 v5.105: Added settledDate check. If settlement status changed, MUST bypass fast-path.
        if (existing && 
            existing.address === o.address && 
            existing.status === o.status && 
            existing.courier === o.courier &&
            !!existing.settledDate === !!o.settledDate) {
            return existing;
        }

        // Enrich geodata first (preserves all custom fields via spread)
        let base = (o.coords?.lat && o.coords?.lng && o.isAddressLocked) ? o : enrichOrderGeodata(o);

        // Always re-apply persisted overrides (settlements, payment method changes, etc.)
        // This handles the page-reload case where in-memory state is empty.
        const id  = o.id   ? String(o.id)          : null;
        const num = o.orderNumber ? String(o.orderNumber) : null;
        let ovr = (id  && persistedOverrides[id])  ? persistedOverrides[id]  : null;
        if (!ovr && num) ovr = persistedOverrides[num] ?? null;
        if (!ovr && id)  ovr = persistedOverrides[Number(id)] ?? null;

        if (ovr) {
            return {
                ...base,
                ...ovr,
                // Preserve status: if override marks order as settled, use settled status
                status: ovr.settledDate ? (ovr.status || 'исполнен') : (base.status || ovr.status)
            };
        }

        return base;
    }) : []
    
    const couriers = Array.isArray(data.couriers) ? data.couriers.map((c: any) => ({
        ...c,
        vehicleType: String(c.vehicleType || 'car').toLowerCase().trim()
    })) : []
    const courierNamesInList = new Set(couriers.map((c: any) => c.name || c._id || c.id));

    // 1. Process Couriers from orders (efficiently)
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

    // 2. Map vehicle types once
    const processedCouriers = couriers.map((c: any) => {
      const normalizedName = normalizeCourierName(c.name).toLowerCase();
      const mappedType = bruteNormalizedMap[normalizedName];
      if (mappedType && mappedType !== c.vehicleType) {
        return { ...c, vehicleType: mappedType };
      }
      return c.vehicleType ? c : { ...c, vehicleType: 'car' };
    });

    // 3. Process Payment Methods (if missing)
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

    return {
      ...data,
      routes: Array.isArray(data.routes) ? data.routes.map((r: any) => {
        // v5.101: Route identity preservation enhanced with stable order IDs comparison
        const existingRoute = (current?.routes || []).find((cr: any) => cr.id === r.id);
        
        if (existingRoute) {
            const currentRIds = (existingRoute.orders || []).map((o: any) => getStableOrderId(o)).sort().join('|');
            const incomingRIds = (r.orders || []).map((o: any) => getStableOrderId(o)).sort().join('|');
            
            if (currentRIds === incomingRIds && 
                existingRoute.totalDistance === r.totalDistance && 
                existingRoute.totalDuration === r.totalDuration &&
                existingRoute.isOptimized === r.isOptimized) {
               return existingRoute;
            }
        }
        return {
          ...r,
          orders: Array.isArray(r.orders) ? r.orders.map((o: any) => enrichOrderGeodata(o)) : []
        };
      }) : [],
      orders,
      couriers: processedCouriers,
      paymentMethods,
      errors: Array.isArray(data.errors) ? data.errors : []
    }
  } catch (e) {
    console.error('CRITICAL ERROR in applyCourierVehicleMap:', e);
    return data;
  }
}

