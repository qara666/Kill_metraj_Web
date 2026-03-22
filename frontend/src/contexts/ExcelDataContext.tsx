import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback, useMemo } from 'react'
import { localStorageUtils } from '../utils/ui/localStorage'
import { toast } from 'react-hot-toast'
import { normalizeCourierName } from '../utils/data/courierName'
import { enrichOrderGeodata } from '../utils/data/excelProcessor'

interface ExcelData {
  orders: any[]
  couriers: any[]
  paymentMethods: any[]
  routes: any[]
  errors: any[]
  summary: any
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
                  // Hybrid Sync: Merge server data with local manual overrides
                  const localOverrides = localStorage.getItem('km_manual_overrides');
                  if (localOverrides && serverData.orders) {
                    const overrides = JSON.parse(localOverrides);
                    serverData.orders = serverData.orders.map((o: any) => {
                      const id = String(o.id || o.orderNumber);
                      if (overrides[id]) {
                        return { ...o, ...overrides[id] };
                      }
                      return o;
                    });
                  }

                  const mapped = applyCourierVehicleMap(serverData);
                  
                  // LOGIC IMPROVEMENT: 
                  // If the server data has NO routes but our local copy DOES (for similar order count),
                  // we prefer the local copy because it probably contains the last calculated state.
                  const localStored = localStorage.getItem('km_dashboard_processed_data');
                  let localData: any = null;
                  try { if (localStored) localData = JSON.parse(localStored); } catch(e) {}

                  const serverHasRoutes = mapped.routes && mapped.routes.length > 0;
                  const localHasRoutes = localData?.routes && localData.routes.length > 0;
                  
                  if (!serverHasRoutes && localHasRoutes) {
                    console.log('⚠️ Сервер прислал пустой список маршрутов, используем локальную копию с маршрутами.');
                    // Don't set state yet, let it fall through to localStorage part below
                  } else if (mapped.orders && mapped.orders.length > 0) {
                    console.log('✅ Данные загружены с сервера (Hybrid Sync)');
                    bypassSaveRef.current = true;
                    setExcelDataState(mapped);
                    return;
                  }
                  
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
              const mapped = applyCourierVehicleMap(parsed)
              bypassSaveRef.current = true;
              setExcelDataState(mapped)
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

  const saveTimeoutRef = useRef<any>(null)
;

  /**
   * Universal LocalStorage Sync (Debounced for performance)
   */
  const syncToLocalStorage = useCallback((data: ExcelData) => {
    try {
      localStorage.setItem('km_dashboard_processed_data', JSON.stringify(data));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }, []);

  /**
   * Universal Persistence Effect
   * Watches for excelData changes and handles debounced saving
   */
  useEffect(() => {
    if (!excelData) return;
    
    // Check if we should skip this save (e.g., just loaded from server)
    if (bypassSaveRef.current) {
      bypassSaveRef.current = false;
      return;
    }

    // Immediate sync to localStorage for UI snappiness on reload
    // We don't debounce this as heavily anymore since Disk IO is usually fine
    // but we can still use a small timeout if needed.
    const lsTimeout = setTimeout(() => syncToLocalStorage(excelData), 500);

    // Debounced save to server (2.0s)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveDataToServer(excelData), 2000);

    return () => {
      clearTimeout(lsTimeout);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [excelData, syncToLocalStorage]);

  /**
   * Universal Protection Helper:
   * Prevents overwriting local routes with empty server responses if order count is similar.
   */
  const protectData = useCallback((incoming: ExcelData, current: ExcelData | null): ExcelData => {
    const val = applyCourierVehicleMap(incoming, current);
    const serverHasRoutes = val.routes && val.routes.length > 0;
    
    // Check local storage for backup if current state is null
    const localStored = localStorage.getItem('km_dashboard_processed_data');
    let localData: any = null;
    try { if (localStored) localData = JSON.parse(localStored); } catch(e) {}
    
    const backupData = current || localData;
    const backupHasRoutes = backupData?.routes && backupData.routes.length > 0;
    
    if (!serverHasRoutes && backupHasRoutes) {
      const incomingOrders = val.orders?.length || 0;
      const backupOrders = backupData.orders?.length || 0;
      
      // If order counts are close (within 10%), assume it's the same dataset
      if (Math.abs(incomingOrders - backupOrders) <= Math.max(2, backupOrders * 0.1)) {
        console.log('🛡️ Защита данных: восстановление локальных маршрутов.');
        val.routes = [...backupData.routes];
      }
    }
    return val;
  }, []);

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
        next = applyCourierVehicleMap(updater(prevSafe), prevSafe);
      } else {
        next = applyCourierVehicleMap(dataOrUpdater, prevSafe);
      }
      
      // Ensure we don't regress routes if the updater somehow returns empty routes
      // Bypassed if 'force' is true (manual clear)
      const protectedNext = force ? next : protectData(next, prevSafe);

      // Removed: Debounced Sync and server save from here.
      // The useEffect hook now handles persistence whenever excelData changes.

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

  const saveManualOverrides = useCallback((orders: any[]) => {
    try {
      const overrides: Record<string, any> = {};
      orders.forEach(o => {
        if (o.manualGroupId || o.deadlineAt) {
          const id = String(o.id || o.orderNumber);
          overrides[id] = {
            manualGroupId: o.manualGroupId,
            deadlineAt: o.deadlineAt,
            plannedTime: o.plannedTime,
            courier: o.courier
          };
        }
      });
      localStorage.setItem('km_manual_overrides', JSON.stringify(overrides));
    } catch (e) {
      console.warn('Error saving overrides:', e);
    }
  }, []);

  const contextValue = useMemo(() => ({
    excelData,
    setExcelData,
    updateExcelData,
    clearExcelData,
    updateRouteData,
    updateOrderPaymentMethod,
    saveManualOverrides
  }), [excelData, setExcelData, updateExcelData, clearExcelData, updateRouteData, updateOrderPaymentMethod, saveManualOverrides]);

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
    const orders = Array.isArray(data.orders) ? data.orders.map((o: any) => {
        if (o.coords?.lat && o.coords?.lng && o.isAddressLocked) return o;
        return enrichOrderGeodata(o);
    }) : []
    
    const couriers = Array.isArray(data.couriers) ? [...data.couriers] : []
    const courierNamesInList = new Set(couriers.map(c => c.name || c._id || c.id));

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
      routes: Array.isArray(data.routes) ? data.routes.map((r: any) => ({
        ...r,
        orders: Array.isArray(r.orders) ? r.orders.map((o: any) => enrichOrderGeodata(o)) : []
      })) : [],
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

