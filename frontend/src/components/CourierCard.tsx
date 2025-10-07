import React from 'react'
import { clsx } from 'clsx'
import { 
  UserIcon, 
  TruckIcon, 
  MapIcon, 
  CheckCircleIcon,
  ClockIcon
} from '@heroicons/react/24/outline'
import type { Courier } from '../types'

interface CourierCardProps {
  courier: Courier
  isSelected?: boolean
  onSelect?: () => void
  className?: string
}

export const CourierCard: React.FC<CourierCardProps> = ({
  courier,
  isSelected = false,
  onSelect,
  className
}) => {
  const formatDistance = (meters: number) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`
    }
    return `${meters} m`
  }

  const getVehicleIcon = (vehicleType: string) => {
    return vehicleType === 'car' ? '🚗' : '🏍️'
  }

  const getStatusColor = (isActive: boolean) => {
    return isActive ? 'success' : 'danger'
  }

  return (
    <div
      className={clsx(
        'card p-4 cursor-pointer transition-all duration-200 hover:shadow-md',
        isSelected && 'ring-2 ring-primary-500 bg-primary-50',
        className
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <div className="h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center">
              <UserIcon className="h-6 w-6 text-gray-600" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-gray-900 truncate">
              {courier.name || 'Неизвестный курьер'}
            </h3>
            <p className="text-sm text-gray-500">{courier.location || 'Не указано'}</p>
            <div className="flex items-center space-x-2 mt-1">
              <span className="text-lg">{getVehicleIcon(courier.vehicleType || 'car')}</span>
              <span className={clsx(
                'badge',
                getStatusColor(courier.isActive !== false) === 'success' ? 'badge-success' : 'badge-danger'
              )}>
                {courier.isActive !== false ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="text-center">
          <div className="flex items-center justify-center space-x-1">
            <MapIcon className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-600">Routes</span>
          </div>
          <p className="text-lg font-semibold text-gray-900">
            {courier.routeCount || 0}
          </p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center space-x-1">
            <TruckIcon className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-600">Orders</span>
          </div>
          <p className="text-lg font-semibold text-gray-900">
            {courier.totalOrders || 0}
          </p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-1">
            <ClockIcon className="h-4 w-4 text-gray-400" />
            <span className="text-gray-600">Distance</span>
          </div>
          <span className="font-medium text-gray-900">
            {formatDistance(courier.totalDistance || 0)}
          </span>
        </div>
        
        <div className="mt-2 flex items-center justify-between text-sm">
          <div className="flex items-center space-x-1">
            <CheckCircleIcon className="h-4 w-4 text-gray-400" />
            <span className="text-gray-600">Efficiency</span>
          </div>
          <span className="font-medium text-gray-900">
            {(courier.efficiencyScore || 0).toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  )
}
