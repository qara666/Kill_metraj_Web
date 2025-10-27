import React, { useState } from 'react'
import { 
  DocumentTextIcon,
  UserGroupIcon,
  CreditCardIcon,
  MapPinIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  TruckIcon,
  CurrencyDollarIcon,
  PhoneIcon,
  UserIcon
} from '@heroicons/react/24/outline'

interface ExcelResultsDisplayProps {
  data: any
  summary: any
}

export const ExcelResultsDisplay: React.FC<ExcelResultsDisplayProps> = ({ data, summary }) => {
  const [expandedSections, setExpandedSections] = useState({
    orders: true,
    couriers: true,
    paymentMethods: true,
    errors: true,
    warnings: true
  })
  const [courierSortBy, setCourierSortBy] = useState<'name' | 'orders'>('orders')
  const [courierSortOrder, setCourierSortOrder] = useState<'asc' | 'desc'>('desc')

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  const sortCouriers = (couriers: any[]) => {
    return [...couriers].sort((a, b) => {
      let aValue, bValue
      
      if (courierSortBy === 'name') {
        aValue = a.name || ''
        bValue = b.name || ''
      } else {
        aValue = a.orders || 0
        bValue = b.orders || 0
      }
      
      if (courierSortOrder === 'asc') {
        return aValue > bValue ? 1 : -1
      } else {
        return aValue < bValue ? 1 : -1
      }
    })
  }

  const handleCourierSort = (sortBy: 'name' | 'orders') => {
    if (courierSortBy === sortBy) {
      setCourierSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setCourierSortBy(sortBy)
      setCourierSortOrder('desc')
    }
  }

  if (!data || !summary) {
    return null
  }

  const { orders, couriers, errors, warnings } = data

  return (
    <div className="space-y-6">

      {/* Заказы */}
      {orders && orders.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div 
            className="flex items-center justify-between cursor-pointer"
            onClick={() => toggleSection('orders')}
          >
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <DocumentTextIcon className="h-5 w-5 mr-2 text-blue-600" />
              Заказы ({orders.length})
            </h3>
            {expandedSections.orders ? (
              <EyeSlashIcon className="h-5 w-5 text-gray-400" />
            ) : (
              <EyeIcon className="h-5 w-5 text-gray-400" />
            )}
          </div>
          
          {expandedSections.orders && (
            <div className="mt-4 space-y-3 max-h-96 overflow-y-auto">
              {orders.map((order: any, index: number) => (
                <div key={order.orderNumber || index} className="bg-gray-50 p-4 rounded-lg border">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className="font-medium text-gray-900">
                          #{order.orderNumber || `ORDER_${index + 1}`}
                        </span>
                        {order.amount && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CurrencyDollarIcon className="h-3 w-3 mr-1" />
                            {order.amount} грн
                          </span>
                        )}
                      </div>
                      
                      <div className="space-y-1 text-sm text-gray-600">
                        <div className="flex items-center">
                          <MapPinIcon className="h-4 w-4 mr-2 text-gray-400" />
                          <span>{order.address}</span>
                        </div>
                        
                        {order.courier && (
                          <div className="flex items-center">
                            <TruckIcon className="h-4 w-4 mr-2 text-gray-400" />
                            <span>Курьер: {order.courier}</span>
                          </div>
                        )}
                        
                        {order.paymentMethod && (
                          <div className="flex items-center">
                            <CreditCardIcon className="h-4 w-4 mr-2 text-gray-400" />
                            <span>Оплата: {order.paymentMethod}</span>
                          </div>
                        )}
                        
                        {order.customerName && (
                          <div className="flex items-center">
                            <UserIcon className="h-4 w-4 mr-2 text-gray-400" />
                            <span>Клиент: {order.customerName}</span>
                          </div>
                        )}
                        
                        {order.phone && (
                          <div className="flex items-center">
                            <PhoneIcon className="h-4 w-4 mr-2 text-gray-400" />
                            <span>Телефон: {order.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="ml-4">
                      {order.geocoded ? (
                        <CheckCircleIcon className="h-5 w-5 text-green-500" />
                      ) : (
                        <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Курьеры */}
      {couriers && couriers.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div 
              className="flex items-center cursor-pointer"
              onClick={() => toggleSection('couriers')}
            >
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <UserGroupIcon className="h-5 w-5 mr-2 text-green-600" />
                Курьеры ({couriers.length})
              </h3>
              {expandedSections.couriers ? (
                <EyeSlashIcon className="h-5 w-5 text-gray-400 ml-2" />
              ) : (
                <EyeIcon className="h-5 w-5 text-gray-400 ml-2" />
              )}
            </div>
            
            {expandedSections.couriers && (
              <div className="flex space-x-2">
                <button
                  onClick={() => handleCourierSort('name')}
                  className={`px-3 py-1 text-xs rounded ${
                    courierSortBy === 'name' 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  По имени {courierSortBy === 'name' && (courierSortOrder === 'asc' ? '↑' : '↓')}
                </button>
                <button
                  onClick={() => handleCourierSort('orders')}
                  className={`px-3 py-1 text-xs rounded ${
                    courierSortBy === 'orders' 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  По заказам {courierSortBy === 'orders' && (courierSortOrder === 'asc' ? '↑' : '↓')}
                </button>
              </div>
            )}
          </div>
          
          {expandedSections.couriers && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortCouriers(couriers).map((courier: any, index: number) => (
                <div key={courier.name || index} className="bg-gray-50 p-4 rounded-lg border">
                  <div className="flex items-center space-x-3 mb-2">
                    <TruckIcon className="h-5 w-5 text-green-600" />
                    <span className="font-medium text-gray-900">{courier.name}</span>
                  </div>
                  
                  <div className="space-y-1 text-sm text-gray-600">
                    <div className="flex justify-between">
                      <span>Заказов:</span>
                      <span className="font-medium">{courier.orders || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Статус:</span>
                      <span className="font-medium text-green-600">Активен</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Зона работы:</span>
                      <span className="font-medium">Все зоны</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Последний заказ:</span>
                      <span className="font-medium">Сегодня</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}


      {/* Ошибки */}
      {errors && errors.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6">
          <div 
            className="flex items-center justify-between cursor-pointer"
            onClick={() => toggleSection('errors')}
          >
            <h3 className="text-lg font-semibold text-red-900 flex items-center">
              <ExclamationTriangleIcon className="h-5 w-5 mr-2 text-red-600" />
              Ошибки ({errors.length})
            </h3>
            {expandedSections.errors ? (
              <EyeSlashIcon className="h-5 w-5 text-gray-400" />
            ) : (
              <EyeIcon className="h-5 w-5 text-gray-400" />
            )}
          </div>
          
          {expandedSections.errors && (
            <div className="mt-4 space-y-2 max-h-40 overflow-y-auto">
              {errors.map((error: string, index: number) => (
                <div key={index} className="bg-red-50 p-3 rounded-lg border border-red-200">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Предупреждения */}
      {warnings && warnings.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-yellow-200 p-6">
          <div 
            className="flex items-center justify-between cursor-pointer"
            onClick={() => toggleSection('warnings')}
          >
            <h3 className="text-lg font-semibold text-yellow-900 flex items-center">
              <ExclamationTriangleIcon className="h-5 w-5 mr-2 text-yellow-600" />
              Предупреждения ({warnings.length})
            </h3>
            {expandedSections.warnings ? (
              <EyeSlashIcon className="h-5 w-5 text-gray-400" />
            ) : (
              <EyeIcon className="h-5 w-5 text-gray-400" />
            )}
          </div>
          
          {expandedSections.warnings && (
            <div className="mt-4 space-y-2 max-h-40 overflow-y-auto">
              {warnings.map((warning: string, index: number) => (
                <div key={index} className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                  <p className="text-sm text-yellow-800">{warning}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}








