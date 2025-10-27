import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

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
          setExcelDataState({
            ...parsed,
            routes: Array.isArray(parsed.routes) ? parsed.routes : [],
            orders: Array.isArray(parsed.orders) ? parsed.orders : [],
            couriers: Array.isArray(parsed.couriers) ? parsed.couriers : [],
            paymentMethods: Array.isArray(parsed.paymentMethods) ? parsed.paymentMethods : [],
            errors: Array.isArray(parsed.errors) ? parsed.errors : []
          })
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
    setExcelDataState(data)
  }

  const updateExcelData = (data: ExcelData) => {
    setExcelDataState(data)
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

