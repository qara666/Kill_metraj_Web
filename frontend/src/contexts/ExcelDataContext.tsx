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
  setExcelData: (data: ExcelData | null) => void
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
          setExcelDataState(parsed)
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
        routes: routes
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
    <ExcelDataContext.Provider value={{ excelData, setExcelData, clearExcelData, updateRouteData, updateCourierData }}>
      {children}
    </ExcelDataContext.Provider>
  )
}
