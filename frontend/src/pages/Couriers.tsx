import React from 'react'
import { useExcelData } from '../contexts/ExcelDataContext'
import { CourierManagement } from '../components/courier/CourierManagement'

export const Couriers: React.FC = () => {
  const { excelData } = useExcelData()

  return (
    <CourierManagement excelData={excelData} />
  )
}
