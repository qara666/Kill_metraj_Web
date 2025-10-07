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

  // Преобразуем данные из Excel в формат Courier или используем данные из API
  const couriers = React.useMemo(() => {
    if (excelData?.couriers) {
      // Преобразуем данные Excel в формат Courier
      return excelData.couriers.map((courier: any) => ({
        _id: courier.name || `excel_${Math.random()}`,
        name: courier.name || 'Неизвестный курьер',
        location: 'Киев',
        vehicleType: 'car' as const,
        isActive: true,
        isArchived: false,
        routeCount: courier.orders || 0,
        totalOrders: courier.orders || 0,
        totalDistance: 0,
        efficiencyScore: 85,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        routes: [],
        phone: '',
        email: '',
        totalDistanceWithAdditional: 0,
        averageOrdersPerRoute: 0
      }))
    }
    return couriersData?.data || []
  }, [excelData?.couriers, couriersData?.data])

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
          {couriers.map((courier, index) => (
            <CourierCard
              key={courier._id || courier.name || index}
              courier={courier}
            />
          ))}
        </div>
      )}
    </div>
  )
}
