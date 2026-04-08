import * as React from 'react'
import { useExcelData } from '../contexts/ExcelDataContext'
import { RouteManagement } from '../components/route/RouteManagement'

export const Routes: React.FC = () => {
  const { excelData } = useExcelData()

  return (
    <RouteManagement excelData={excelData} />
  )
}
