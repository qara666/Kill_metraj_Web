import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { UserGroupIcon } from '@heroicons/react/24/outline'
import { CourierCard } from '../components/CourierCard'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { useExcelData } from '../contexts/ExcelDataContext'
import * as api from '../services/api'

export const Couriers: React.FC = () => {
  const { excelData } = useExcelData()
  const { data: couriersData, isLoading } = useQuery({
    queryKey: ['couriers'],
    queryFn: () => api.courierApi.getCouriers(),
  })

  if (isLoading) {
    return <LoadingSpinner />
  }

  // Используем данные из Excel если они есть, иначе из API
  const couriers = excelData?.couriers || couriersData?.data || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Couriers</h1>
            <p className="mt-1 text-sm text-gray-600">
              Manage courier information and track performance
            </p>
          </div>
          <div className="text-sm text-gray-500">
            {couriers.length} couriers
          </div>
        </div>
      </div>

      {/* Couriers Grid */}
      {couriers.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
          <div className="text-center">
            <UserGroupIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No couriers</h3>
            <p className="mt-1 text-sm text-gray-500">
              Upload an Excel file to create couriers and routes.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {couriers.map((courier) => (
            <CourierCard
              key={courier._id}
              courier={courier}
            />
          ))}
        </div>
      )}
    </div>
  )
}
