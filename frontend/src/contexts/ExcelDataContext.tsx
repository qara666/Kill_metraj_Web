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
                  const mapped = applyCourierVehicleMap(json.data);
                  console.log(' Данные загружены с сервера');
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

      // Debounce save (0.5s)
      saveTimeoutRef.current = setTimeout(() => {
        saveDataToServer(val);
      }, 500);

      // Update localStorage immediately
      try {
        localStorage.setItem('km_dashboard_processed_data', JSON.stringify(val))
      } catch (e) {
        console.warn('LocalStorage save failed:', e);
      }
    } else {
      setExcelDataState(null)
      localStorage.removeItem('km_dashboard_processed_data')
      // TODO: Add API call to clear state if needed
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

      // Update localStorage immediately
      try {
        localStorage.setItem('km_dashboard_processed_data', JSON.stringify(next));
      } catch (e) {
        console.warn('LocalStorage update failed:', e);
      }

      // Debounce save (0.5s for updates)
      saveTimeoutRef.current = setTimeout(() => {
        saveDataToServer(next);
      }, 500);

      return next;
    });
  }, [])

  const clearExcelData = useCallback(() => {
    if (window && (window as any).debugExcel) console.warn('[ExcelDataProvider:CLEAR]', (new Error()).stack)

    // Clear any pending debounced saves to prevent data from reappearing
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    setExcelDataState(null)
    localStorage.removeItem('km_dashboard_processed_data')

    // Also clear on server
    const token = localStorage.getItem('km_access_token');
    if (token) {
      fetch('/api/v1/state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ data: null })
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

      // Update localStorage immediately
      try {
        localStorage.setItem('km_dashboard_processed_data', JSON.stringify(next));
      } catch (e) {
        console.warn('LocalStorage route update failed:', e);
      }

      // Debounce save (0.5s)
      saveTimeoutRef.current = setTimeout(() => {
        saveDataToServer(next);
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

  const contextValue = useMemo(() => ({
    excelData,
    setExcelData,
    updateExcelData,
    clearExcelData,
    updateRouteData,
    updateOrderPaymentMethod
  }), [excelData, setExcelData, updateExcelData, clearExcelData, updateRouteData, updateOrderPaymentMethod]);

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

function applyCourierVehicleMap(data: any): any {
  try {
    const rawMap = localStorageUtils.getCourierVehicleMap()
    // Create a normalized version of the map for lookup
    const map: Record<string, string> = {};
    Object.keys(rawMap).forEach(name => {
      map[normalizeCourierName(name)] = rawMap[name];
    });

    const orders = Array.isArray(data.orders) ? data.orders : []

    // 1. Process Couriers
    let couriers = Array.isArray(data.couriers) ? [...data.couriers] : []

    // If couriers array is empty or lacks couriers present in orders, derive them
    const courierNamesInList = new Set(couriers.map(c => c.name || c._id || c.id));

    orders.forEach((order: any) => {
      const c = order.courier;
      if (c) {
        const cName = typeof c === 'string' ? c : (c.name || c._id || c.id);
        const cId = typeof c === 'string' ? c : (c._id || c.id || cName);
        const normalizedCName = normalizeCourierName(cName);

        if (cName && !Array.from(courierNamesInList).some(n => normalizeCourierName(n) === normalizedCName)) {
          couriers.push({
            _id: cId,
            id: cId,
            name: cName,
            vehicleType: 'car' // Default
          });
          courierNamesInList.add(cName);
        }
      }
    });

    // Apply vehicle types from map
    couriers = couriers.map((c: any) => {
      const normalizedName = normalizeCourierName(c.name);
      return {
        ...c,
        vehicleType: map[normalizedName] || c.vehicleType || 'car'
      };
    })

    // 2. Process Payment Methods
    let paymentMethods = Array.isArray(data.paymentMethods) ? [...data.paymentMethods] : []
    if (paymentMethods.length === 0 && orders.length > 0) {
      const uniqueMethods = new Set<string>();
      orders.forEach((o: any) => {
        if (o.paymentMethod) uniqueMethods.add(o.paymentMethod);
      });
      paymentMethods = Array.from(uniqueMethods).map(method => ({
        id: method,
        name: method
      }));
    }

    return {
      ...data,
      routes: Array.isArray(data.routes) ? data.routes : [],
      orders,
      couriers,
      paymentMethods,
      errors: Array.isArray(data.errors) ? data.errors : []
    }
  } catch (e) {
    console.error('CRITICAL ERROR in applyCourierVehicleMap:', e);
    return {
      ...data,
      routes: Array.isArray(data.routes) ? data.routes : [],
      orders: Array.isArray(data.orders) ? data.orders : [],
      couriers: Array.isArray(data.couriers) ? data.couriers : [],
      paymentMethods: Array.isArray(data.paymentMethods) ? data.paymentMethods : [],
      errors: Array.isArray(data.errors) ? data.errors : []
    }
  }
}

