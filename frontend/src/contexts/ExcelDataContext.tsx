import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface ExcelData {
  orders: any[]
  couriers: any[]
  paymentMethods: any[]
  addresses: any[]
  routes: any[]
  errors: any[]
  warnings: any[]
  statistics: any
  summary: any
}

interface ExcelDataContextType {
  excelData: ExcelData | null
  routes: any[]
  setExcelData: (data: ExcelData | null) => void
  updateExcelData: (data: ExcelData) => void
  clearExcelData: () => void
  updateRouteData: (routes: any[]) => void
  updateCourierData: (couriers: any[]) => void
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

  // Загружаем данные из localStorage при инициализации
  useEffect(() => {
    try {
      const stored = localStorage.getItem('km_dashboard_processed_data')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed && typeof parsed === 'object') {
          // Убеждаемся, что routes всегда массив
          const normalizedData = {
            ...parsed,
            routes: Array.isArray(parsed.routes) ? parsed.routes : [],
            orders: Array.isArray(parsed.orders) ? parsed.orders : [],
            couriers: Array.isArray(parsed.couriers) ? parsed.couriers : [],
            paymentMethods: Array.isArray(parsed.paymentMethods) ? parsed.paymentMethods : [],
            errors: Array.isArray(parsed.errors) ? parsed.errors : [],
            warnings: Array.isArray(parsed.warnings) ? parsed.warnings : []
          }
          setExcelDataState(normalizedData)
        }
      }
    } catch (error) {
      console.warn('Ошибка восстановления данных Excel из localStorage:', error)
    }
  }, [])

  // Сохраняем данные в localStorage при изменении
  useEffect(() => {
    try {
      if (excelData) {
        localStorage.setItem('km_dashboard_processed_data', JSON.stringify(excelData))
      }
    } catch (error) {
      console.warn('Ошибка сохранения данных Excel в localStorage:', error)
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
    try {
      localStorage.removeItem('km_dashboard_processed_data')
    } catch (error) {
      console.warn('Ошибка очистки данных Excel из localStorage:', error)
    }
  }

  const updateRouteData = (routes: any[]) => {
    if (excelData) {
      setExcelDataState({
        ...excelData,
        routes: Array.isArray(routes) ? routes : []
      })
    }
  }

  const updateCourierData = (couriers: any[]) => {
    if (excelData) {
      setExcelDataState({
        ...excelData,
        couriers: couriers
      })
    }
  }

  return (
    <ExcelDataContext.Provider value={{ excelData, routes: excelData?.routes || [], setExcelData, updateExcelData, clearExcelData, updateRouteData, updateCourierData }}>
      {children}
    </ExcelDataContext.Provider>
  )
}
