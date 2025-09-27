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

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  if (!data || !summary) {
    return null
  }

  const { orders, couriers, paymentMethods, errors, warnings } = data

  return (
    <div className="space-y-6">
      {/* Сводка */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <CheckCircleIcon className="h-5 w-5 mr-2 text-green-600" />
          Сводка обработки
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="flex items-center">
              <DocumentTextIcon className="h-5 w-5 text-blue-600 mr-2" />
              <div>
                <p className="text-sm font-medium text-blue-800">Заказы</p>
                <p className="text-2xl font-bold text-blue-900">{summary.totalOrders || 0}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <div className="flex items-center">
              <UserGroupIcon className="h-5 w-5 text-green-600 mr-2" />
              <div>
                <p className="text-sm font-medium text-green-800">Курьеры</p>
                <p className="text-2xl font-bold text-green-900">{summary.totalCouriers || 0}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
            <div className="flex items-center">
              <CreditCardIcon className="h-5 w-5 text-purple-600 mr-2" />
              <div>
                <p className="text-sm font-medium text-purple-800">Способы оплаты</p>
                <p className="text-2xl font-bold text-purple-900">{summary.totalPaymentMethods || 0}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
            <div className="flex items-center">
              <MapPinIcon className="h-5 w-5 text-yellow-600 mr-2" />
              <div>
                <p className="text-sm font-medium text-yellow-800">Геокодировано</p>
                <p className="text-2xl font-bold text-yellow-900">{summary.successfulGeocoding || 0}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

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
          <div 
            className="flex items-center justify-between cursor-pointer"
            onClick={() => toggleSection('couriers')}
          >
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <UserGroupIcon className="h-5 w-5 mr-2 text-green-600" />
              Курьеры ({couriers.length})
            </h3>
            {expandedSections.couriers ? (
              <EyeSlashIcon className="h-5 w-5 text-gray-400" />
            ) : (
              <EyeIcon className="h-5 w-5 text-gray-400" />
            )}
          </div>
          
          {expandedSections.couriers && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {couriers.map((courier: any, index: number) => (
                <div key={courier.name || index} className="bg-gray-50 p-4 rounded-lg border">
                  <div className="flex items-center space-x-3 mb-2">
                    <TruckIcon className="h-5 w-5 text-green-600" />
                    <span className="font-medium text-gray-900">{courier.name}</span>
                  </div>
                  
                  <div className="space-y-1 text-sm text-gray-600">
                    <div className="flex justify-between">
                      <span>Заказов:</span>
                      <span className="font-medium">{courier.orderCount || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Сумма:</span>
                      <span className="font-medium">{courier.totalAmount || 0} грн</span>
                    </div>
                    {courier.orderCount > 0 && (
                      <div className="flex justify-between">
                        <span>Средний чек:</span>
                        <span className="font-medium">
                          {Math.round((courier.totalAmount || 0) / courier.orderCount)} грн
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Способы оплаты */}
      {paymentMethods && paymentMethods.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div 
            className="flex items-center justify-between cursor-pointer"
            onClick={() => toggleSection('paymentMethods')}
          >
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <CreditCardIcon className="h-5 w-5 mr-2 text-purple-600" />
              Способы оплаты ({paymentMethods.length})
            </h3>
            {expandedSections.paymentMethods ? (
              <EyeSlashIcon className="h-5 w-5 text-gray-400" />
            ) : (
              <EyeIcon className="h-5 w-5 text-gray-400" />
            )}
          </div>
          
          {expandedSections.paymentMethods && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paymentMethods.map((payment: any, index: number) => (
                <div key={payment.name || index} className="bg-gray-50 p-4 rounded-lg border">
                  <div className="flex items-center space-x-3 mb-2">
                    <CreditCardIcon className="h-5 w-5 text-purple-600" />
                    <span className="font-medium text-gray-900">{payment.name}</span>
                  </div>
                  
                  <div className="space-y-1 text-sm text-gray-600">
                    <div className="flex justify-between">
                      <span>Заказов:</span>
                      <span className="font-medium">{payment.orderCount || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Сумма:</span>
                      <span className="font-medium">{payment.totalAmount || 0} грн</span>
                    </div>
                    {payment.orderCount > 0 && (
                      <div className="flex justify-between">
                        <span>Средний чек:</span>
                        <span className="font-medium">
                          {Math.round((payment.totalAmount || 0) / payment.orderCount)} грн
                        </span>
                      </div>
                    )}
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
