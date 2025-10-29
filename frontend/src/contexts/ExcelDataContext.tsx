import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
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
  routes: any[]
  setExcelData: (data: ExcelData | null) => void
  updateExcelData: (data: ExcelData) => void
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
  const [routes, setRoutes] = useState<any[]>([])

  useEffect(() => {
    try {
      const stored = localStorage.getItem('km_dashboard_processed_data')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed && typeof parsed === 'object') {
          const mapped = applyCourierVehicleMap(parsed)
          setExcelDataState(mapped)
        }
      }
    } catch (error) {
      console.warn('Ошибка восстановления данных:', error)
    }
  }, [])

  useEffect(() => {
    try {
      const stored = localStorage.getItem('km_routes')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          setRoutes(parsed)
        }
      }
    } catch (error) {
      console.warn('Ошибка восстановления маршрутов:', error)
    }
  }, [])

  useEffect(() => {
    if (excelData) {
      localStorage.setItem('km_dashboard_processed_data', JSON.stringify(excelData))
    }
  }, [excelData])

  const setExcelData = (data: ExcelData | null) => {
    if (data) {
      setExcelDataState(applyCourierVehicleMap(data))
    } else {
      setExcelDataState(null)
    }
  }

  const updateExcelData = (data: ExcelData) => {
    setExcelDataState(applyCourierVehicleMap(data))
  }

  const clearExcelData = () => {
    setExcelDataState(null)
    localStorage.removeItem('km_dashboard_processed_data')
  }

  const updateRouteData = (newRoutes: any[]) => {
    setRoutes(newRoutes)
    if (excelData) {
      setExcelDataState({ ...excelData, routes: newRoutes })
    }
  }

  return (
    <ExcelDataContext.Provider value={{ 
      excelData, 
      routes, 
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

