import React from 'react'
import { useExcelData } from '../contexts/ExcelDataContext'
import { RouteManagement } from '../components/RouteManagement'

export const Routes: React.FC = () => {
  const { excelData } = useExcelData()

  return (
    <RouteManagement excelData={excelData} />
  )
}
