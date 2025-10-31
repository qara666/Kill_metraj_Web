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
import { useTheme } from '../contexts/ThemeContext'

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
  const { isDark } = useTheme()
  
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
        'p-4 cursor-pointer transition-all duration-200 hover:shadow-md rounded-lg border',
        isSelected 
          ? isDark 
            ? 'ring-2 ring-blue-500 bg-blue-900/20 border-blue-500/30' 
            : 'ring-2 ring-blue-500 bg-blue-50 border-blue-200'
          : isDark 
            ? 'bg-gray-800 border-gray-700 hover:bg-gray-750' 
            : 'bg-white border-gray-200 hover:bg-gray-50',
        className
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <div className={clsx(
              'h-10 w-10 rounded-full flex items-center justify-center',
              isDark ? 'bg-gray-700' : 'bg-gray-100'
            )}>
              <UserIcon className={clsx('h-6 w-6', isDark ? 'text-gray-300' : 'text-gray-600')} />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={clsx(
              'text-sm font-medium truncate',
              isDark ? 'text-gray-100' : 'text-gray-900'
            )}>
              {courier.name || 'Неизвестный курьер'}
            </h3>
            <p className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-500')}>{courier.location || 'Не указано'}</p>
            <div className="flex items-center space-x-2 mt-1">
              <span className="text-lg">{getVehicleIcon(courier.vehicleType || 'car')}</span>
              <span className={clsx(
                'px-2 py-1 rounded-full text-xs font-medium',
                getStatusColor(courier.isActive !== false) === 'success' 
                  ? isDark 
                    ? 'bg-green-900/20 text-green-400' 
                    : 'bg-green-100 text-green-800'
                  : isDark 
                    ? 'bg-red-900/20 text-red-400' 
                    : 'bg-red-100 text-red-800'
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
            <MapIcon className={clsx('h-4 w-4', isDark ? 'text-gray-500' : 'text-gray-400')} />
            <span className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>Routes</span>
          </div>
          <p className={clsx('text-lg font-semibold', isDark ? 'text-gray-100' : 'text-gray-900')}>
            {courier.routeCount || 0}
          </p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center space-x-1">
            <TruckIcon className={clsx('h-4 w-4', isDark ? 'text-gray-500' : 'text-gray-400')} />
            <span className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>Orders</span>
          </div>
          <p className={clsx('text-lg font-semibold', isDark ? 'text-gray-100' : 'text-gray-900')}>
            {courier.totalOrders || 0}
          </p>
        </div>
      </div>

      <div className={clsx(
        'mt-4 pt-4 border-t',
        isDark ? 'border-gray-700' : 'border-gray-200'
      )}>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-1">
            <ClockIcon className={clsx('h-4 w-4', isDark ? 'text-gray-500' : 'text-gray-400')} />
            <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>Distance</span>
          </div>
          <span className={clsx('font-medium', isDark ? 'text-gray-200' : 'text-gray-900')}>
            {formatDistance(courier.totalDistance || 0)}
          </span>
        </div>
        
        <div className="mt-2 flex items-center justify-between text-sm">
          <div className="flex items-center space-x-1">
            <CheckCircleIcon className={clsx('h-4 w-4', isDark ? 'text-gray-500' : 'text-gray-400')} />
            <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>Efficiency</span>
          </div>
          <span className={clsx('font-medium', isDark ? 'text-gray-200' : 'text-gray-900')}>
            {(courier.efficiencyScore || 0).toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  )
}
































