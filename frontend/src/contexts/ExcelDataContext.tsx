import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react'
import { localStorageUtils } from '../utils/localStorage'

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
      try {
        const stored = localStorage.getItem('km_dashboard_processed_data')
        if (stored) {
          const parsed = JSON.parse(stored)
          if (parsed && typeof parsed === 'object') {
            const mapped = applyCourierVehicleMap(parsed)
            if (window && (window as any).debugExcel) console.warn('[ExcelDataProvider:INIT]', mapped, (new Error()).stack)
            setExcelDataState(mapped)
          }
        }
      } catch (error) {
        console.warn('Ошибка восстановления данных:', error)
      }
    }
  }, [])

  const setExcelData = (data: ExcelData | null) => {
    if (window && (window as any).debugExcel) console.warn('[ExcelDataProvider:SET]', data, (new Error()).stack)
    if (data) {
      const val = applyCourierVehicleMap(data)
      setExcelDataState(val)
      localStorage.setItem('km_dashboard_processed_data', JSON.stringify(val))
    } else {
      setExcelDataState(null)
      localStorage.removeItem('km_dashboard_processed_data')
    }
  }

  const updateExcelData = (dataOrUpdater: ExcelData | ((prev: ExcelData) => ExcelData)) => {
    setExcelDataState(prev => {
      let next: ExcelData;
      if (typeof dataOrUpdater === 'function') {
        next = applyCourierVehicleMap((dataOrUpdater as (p: ExcelData) => ExcelData)(prev!));
      } else {
        next = applyCourierVehicleMap(dataOrUpdater);
      }
      localStorage.setItem('km_dashboard_processed_data', JSON.stringify(next));
      return next;
    });
  }

  const clearExcelData = () => {
    if (window && (window as any).debugExcel) console.warn('[ExcelDataProvider:CLEAR]', (new Error()).stack)
    setExcelDataState(null)
    localStorage.removeItem('km_dashboard_processed_data')
  }

  const updateRouteData = (newRoutes: any[]) => {
    if (window && (window as any).debugExcel) console.warn('[ExcelDataProvider:UPDATEROUTE]', newRoutes, (new Error()).stack)
    setExcelDataState(prev => {
      if (prev) {
        return { ...prev, routes: newRoutes }
      } else {
        return {
          orders: [], couriers: [], paymentMethods: [], routes: newRoutes, errors: [], summary: undefined
        }
      }
    })
  }

  return (
    <ExcelDataContext.Provider value={{ 
      excelData, 
      setExcelData, 
      updateExcelData, 
      clearExcelData, 
      updateRouteData 
    }}>
      {children}
    </ExcelDataContext.Provider>
  )
}

// Helpers
function applyCourierVehicleMap(data: any): any {
  try {
    const map = localStorageUtils.getCourierVehicleMap()
    const couriers = Array.isArray(data.couriers) ? data.couriers.map((c: any) => ({
      ...c,
      vehicleType: map[c.name] || c.vehicleType || 'car'
    })) : []
    return {
      ...data,
      routes: Array.isArray(data.routes) ? data.routes : [],
      orders: Array.isArray(data.orders) ? data.orders : [],
      couriers,
      paymentMethods: Array.isArray(data.paymentMethods) ? data.paymentMethods : [],
      errors: Array.isArray(data.errors) ? data.errors : []
    }
  } catch {
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

