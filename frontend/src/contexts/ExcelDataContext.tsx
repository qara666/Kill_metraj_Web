import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback, useMemo } from 'react'
import { localStorageUtils } from '../utils/ui/localStorage'
import { toast } from 'react-hot-toast'
import { normalizeCourierName, isId0CourierName, getCourierName } from '../utils/data/courierName'
import { enrichOrderGeodata } from '../utils/data/excelProcessor'
import { isOrderCompleted } from '../utils/data/orderStatus'
import { getStableOrderId } from '../utils/data/orderId'
import { normalizeDateToIso } from '../utils/data/dateUtils'
import { CourierIdResolver } from '../utils/data/courierIdMap'

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
  const bypassSaveRef = useRef(false)
  const excelDataRef = useRef<ExcelData | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

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
                  
                  // Проверяем локальное кэшированное состояние
                  const localRaw = localStorage.getItem('km_dashboard_processed_data');
                  if (localRaw) {
                    const localData = JSON.parse(localRaw);
                    if (localData.lastModified && serverData.lastModified && localData.lastModified > serverData.lastModified) {
                      console.log('[ExcelSync] Local data is NEWER than server. Using Local.');
                      setExcelDataState(localData);
                      return;
                    }
                  }

                  console.log('[ExcelSync] Using Server data.');
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
          if (localData) {
            setExcelDataState(JSON.parse(localData))
          }
        } catch (error) {
          console.error('Error loading data:', error);
        }
      }
      loadData()
    }
  }, [])

  const protectData = useCallback((next: ExcelData, current: ExcelData | null): ExcelData => {
    if (!current || !next) return next;
    
    // v5.135: Winning Logic - Protect local state from stale or partial server updates
    const localSettledCount = (current.orders || []).filter(o => !!o.settledDate).length;
    const serverSettledCount = (next.orders || []).filter(o => !!o.settledDate).length;
    
    const localRouteCount = (current.routes || []).length;
    const serverRouteCount = (next.routes || []).length;

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
        const fullData = { ...excelDataRef.current, orders: orders };
        fullData.lastModified = Date.now();
        localStorage.setItem('km_dashboard_processed_data', JSON.stringify(fullData));
      }
    } catch (e) {
      console.warn('Manual overrides save failed:', e);
    }
  }, []);

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
    } catch (error) {
      console.error('Ошибка сохранения на сервер:', error);
      toast.error('Ошибка сохранения на сервер', { id: 'save-error' });
    }
  };

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
    
    const incomingDate = normalizeDateToIso(data.creationDate || (orders.find(o => o.creationDate))?.creationDate || "");
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
