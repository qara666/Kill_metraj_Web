import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { MapIcon } from '@heroicons/react/24/outline'
import { LoadingSpinner } from '../components/LoadingSpinner'
import * as api from '../services/api'

export const Routes: React.FC = () => {
  const { data: routesData, isLoading } = useQuery({
    queryKey: ['routes'],
    queryFn: () => api.routeApi.getRoutes(),
  })

  if (isLoading) {
    return <LoadingSpinner />
  }

  const routes = routesData?.data || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Routes</h1>
            <p className="mt-1 text-sm text-gray-600">
              View and manage delivery routes
            </p>
          </div>
          <div className="text-sm text-gray-500">
            {routes.length} routes
          </div>
        </div>
      </div>

      {/* Routes List */}
      {routes.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
          <div className="text-center">
            <MapIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No routes</h3>
            <p className="mt-1 text-sm text-gray-500">
              Upload an Excel file to create routes.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">All Routes</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {routes.map((route) => (
              <div key={route._id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-gray-900">
                      Route {route._id.slice(-8)}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {route.waypoints.length} waypoints • {route.totalDistance} • {route.totalDuration}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`badge ${
                      route.isActive ? 'badge-success' : 
                      route.isCompleted ? 'badge-primary' : 'badge-gray'
                    }`}>
                      {route.isActive ? 'Active' : 
                       route.isCompleted ? 'Completed' : 'Archived'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
