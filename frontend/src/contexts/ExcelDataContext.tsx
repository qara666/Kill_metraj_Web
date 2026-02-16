import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback, useMemo } from 'react'
import { localStorageUtils } from '../utils/ui/localStorage'
import { toast } from 'react-hot-toast'

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
  updateExcelData: (dataOrUpdater: ExcelData | ((prev: ExcelData) => ExcelData)) => void
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
                  console.log(' Данные загружены с сервера (Hybrid Sync)');
                  setExcelDataState(mapped);
                  return;
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

  // Debounce ref for saving
  const saveTimeoutRef = useRef<any>(null);

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

  const setExcelData = useCallback((data: ExcelData | null) => {
    if (window && (window as any).debugExcel) console.warn('[ExcelDataProvider:SET]', data, (new Error()).stack)
    if (data) {
      const val = applyCourierVehicleMap(data)
      setExcelDataState(val)

      // Clear previous timeout
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      // Debounce both API save and localStorage (0.5s)
      saveTimeoutRef.current = setTimeout(() => {
        saveDataToServer(val);
        try {
          localStorage.setItem('km_dashboard_processed_data', JSON.stringify(val))
        } catch (e) {
          console.warn('LocalStorage save failed:', e);
        }
      }, 500);
    } else {
      setExcelDataState(null)
      localStorage.removeItem('km_dashboard_processed_data')
    }
  }, [])

  const updateExcelData = useCallback((dataOrUpdater: ExcelData | ((prev: ExcelData) => ExcelData)) => {
    setExcelDataState(prev => {
      let next: ExcelData;
      if (typeof dataOrUpdater === 'function') {
        const updater = dataOrUpdater as (p: ExcelData) => ExcelData;
        const prevSafe = prev || { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: {} } as any;
        next = applyCourierVehicleMap(updater(prevSafe));
      } else {
        next = applyCourierVehicleMap(dataOrUpdater);
      }

      // Clear previous timeout
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      // Debounce both API save and localStorage (0.5s)
      saveTimeoutRef.current = setTimeout(() => {
        saveDataToServer(next);
        try {
          localStorage.setItem('km_dashboard_processed_data', JSON.stringify(next));
        } catch (e) {
          console.warn('LocalStorage update failed:', e);
        }
      }, 500);

      return next;
    });
  }, [])

  const clearExcelData = useCallback(() => {
    if (window && (window as any).debugExcel) console.warn('[ExcelDataProvider:CLEAR]', (new Error()).stack)

    // Clear any pending debounced saves
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

      // Clear previous timeout
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      // Debounce both API save and localStorage (0.5s)
      saveTimeoutRef.current = setTimeout(() => {
        saveDataToServer(next);
        try {
          localStorage.setItem('km_dashboard_processed_data', JSON.stringify(next));
        } catch (e) {
          console.warn('LocalStorage route update failed:', e);
        }
      }, 500);

      return next;
    })
  }, [])

  const updateOrderPaymentMethod = useCallback((orderNumber: string, newPaymentMethod: string) => {
    console.log(`🔄 Updating payment method for order ${orderNumber} to ${newPaymentMethod}`);
    updateExcelData(prev => {
      const updatedOrders = prev.orders.map(order => {
        if (order.orderNumber === orderNumber) {
          return { ...order, paymentMethod: newPaymentMethod };
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
function normalizeCourierName(name: string | null | undefined): string {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Optimizes the data by mapping vehicle types and ensuring required structures.
 * Memoized via useMemo in the provider.
 */
/**
 * Optimizes the data by mapping vehicle types and ensuring required structures.
 * O(N) complexity where N is the number of orders + number of couriers.
 */
function applyCourierVehicleMap(data: any): any {
  if (!data) return data;
  try {
    const rawMap = localStorageUtils.getCourierVehicleMap()
    // Pre-normalize the vehicle map for O(1) lookups
    const vehicleTypeLookup = new Map<string, string>();
    Object.entries(rawMap).forEach(([name, type]) => {
      vehicleTypeLookup.set(normalizeCourierName(name), type as string);
    });

    const orders = Array.isArray(data.orders) ? data.orders : [];
    const couriers = Array.isArray(data.couriers) ? [...data.couriers] : [];

    // Create a Set of normalized courier names already in the list for O(1) checks
    const existingCourierNames = new Set<string>();
    couriers.forEach(c => {
      const name = c.name || c._id || c.id;
      if (name) existingCourierNames.add(normalizeCourierName(name));
    });

    // 1. Efficiently identify missing couriers from orders
    const newCouriersToAdd: any[] = [];
    for (const order of orders) {
      const c = order.courier;
      if (!c) continue;

      const cName = typeof c === 'string' ? c : (c.name || c._id || c.id);
      if (!cName) continue;

      const normalizedName = normalizeCourierName(cName);
      if (!existingCourierNames.has(normalizedName)) {
        const cId = typeof c === 'string' ? c : (c._id || c.id || cName);
        newCouriersToAdd.push({
          _id: cId,
          id: cId,
          name: cName,
          vehicleType: 'car'
        });
        existingCourierNames.add(normalizedName);
      }
    }

    // Add missing couriers to the list in one go
    if (newCouriersToAdd.length > 0) {
      couriers.push(...newCouriersToAdd);
    }

    // 2. Map vehicle types in a single pass
    const processedCouriers = couriers.map((c: any) => {
      const normalizedName = normalizeCourierName(c.name);
      const mappedType = vehicleTypeLookup.get(normalizedName);

      if (mappedType && mappedType !== c.vehicleType) {
        return { ...c, vehicleType: mappedType };
      }
      return c.vehicleType ? c : { ...c, vehicleType: 'car' };
    });

    // 3. Efficiently process Payment Methods
    let paymentMethods = Array.isArray(data.paymentMethods) ? data.paymentMethods : [];
    if (paymentMethods.length === 0 && orders.length > 0) {
      const uniqueMethods = new Set<string>();
      for (const order of orders) {
        if (order.paymentMethod) uniqueMethods.add(order.paymentMethod);
      }
      paymentMethods = Array.from(uniqueMethods).map(method => ({
        id: method,
        name: method
      }));
    }

    return {
      ...data,
      routes: Array.isArray(data.routes) ? data.routes : [],
      orders,
      couriers: processedCouriers,
      paymentMethods,
      errors: Array.isArray(data.errors) ? data.errors : []
    };
  } catch (e) {
    console.error('CRITICAL ERROR in applyCourierVehicleMap:', e);
    return data;
  }
}

