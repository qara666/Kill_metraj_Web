import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChartBarIcon } from '@heroicons/react/24/outline'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { useExcelData } from '../contexts/ExcelDataContext'
import * as api from '../services/api'

export const Analytics: React.FC = () => {
  const { excelData } = useExcelData()
  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => api.analyticsApi.getDashboardAnalytics(),
  })

  if (isLoading) {
    return <LoadingSpinner />
  }

  // Используем данные из Excel если они есть, иначе из API
  const analytics = excelData?.statistics || analyticsData?.data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="mt-1 text-sm text-gray-600">
              Performance metrics and delivery statistics
            </p>
          </div>
        </div>
      </div>

      {/* Analytics Content */}
      {!analytics ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
          <div className="text-center">
            <ChartBarIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No analytics data</h3>
            <p className="mt-1 text-sm text-gray-500">
              Create some routes to see analytics.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Overview Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-sm font-medium text-gray-600">Total Routes</h3>
              <p className="text-2xl font-semibold text-gray-900">{analytics.overview.totalRoutes}</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-sm font-medium text-gray-600">Total Orders</h3>
              <p className="text-2xl font-semibold text-gray-900">{analytics.overview.totalOrders}</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-sm font-medium text-gray-600">Completion Rate</h3>
              <p className="text-2xl font-semibold text-gray-900">{analytics.overview.completionRate.toFixed(1)}%</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-sm font-medium text-gray-600">Total Distance</h3>
              <p className="text-2xl font-semibold text-gray-900">{analytics.overview.totalDistance.toFixed(1)} km</p>
            </div>
          </div>

          {/* Placeholder for charts */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Charts</h3>
            <div className="text-center py-12">
              <ChartBarIcon className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-sm text-gray-500">Charts will be implemented here</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
