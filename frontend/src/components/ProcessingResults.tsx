import React from 'react'
import { 
  CheckCircleIcon, 
  ExclamationTriangleIcon, 
  UserGroupIcon, 
  TruckIcon, 
  CreditCardIcon,
  MapIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline'

interface ProcessingResultsProps {
  data: {
    orders: any[]
    couriers: any[]
    paymentMethods: any[]
    routes: any[]
    errors: string[]
  }
  summary: {
    totalRows: number
    successfulGeocoding: number
    failedGeocoding: number
    orders: number
    couriers: number
    paymentMethods: number
    errors: string[]
  }
}

export const ProcessingResults: React.FC<ProcessingResultsProps> = ({ data, summary }) => {
  const stats = [
    {
      title: 'Всього рядків',
      value: summary.totalRows,
      icon: DocumentTextIcon,
      color: 'blue'
    },
    {
      title: 'Замовлень',
      value: data.orders.length,
      icon: TruckIcon,
      color: 'green'
    },
    {
      title: 'Курєрів',
      value: data.couriers.length,
      icon: UserGroupIcon,
      color: 'purple'
    },
    {
      title: 'Спосібів оплати',
      value: data.paymentMethods.length,
      icon: CreditCardIcon,
      color: 'orange'
    },
    {
      title: 'Геокодовано',
      value: summary.successfulGeocoding,
      icon: MapIcon,
      color: 'green'
    },
    {
      title: 'Помилок',
      value: summary.errors.length,
      icon: ExclamationTriangleIcon,
      color: 'red'
    }
  ]

  const getColorClasses = (color: string) => {
    const colors = {
      blue: 'bg-blue-50 border-blue-200 text-blue-800',
      green: 'bg-green-50 border-green-200 text-green-800',
      purple: 'bg-purple-50 border-purple-200 text-purple-800',
      orange: 'bg-orange-50 border-orange-200 text-orange-800',
      red: 'bg-red-50 border-red-200 text-red-800'
    }
    return colors[color as keyof typeof colors] || colors.blue
  }

  return (
    <div className="space-y-6">
      {/* Загальна статистика */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <CheckCircleIcon className="h-5 w-5 mr-2 text-green-600" />
          Результати обробки файлу
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {stats.map((stat, index) => (
            <div key={index} className={`p-4 rounded-lg border ${getColorClasses(stat.color)}`}>
              <div className="flex items-center">
                <stat.icon className="h-6 w-6 mr-2" />
                <div>
                  <p className="text-sm font-medium">{stat.title}</p>
                  <p className="text-xl font-bold">{stat.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Детальна інформація */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Замовлення */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h4 className="text-md font-semibold text-gray-900 mb-3 flex items-center">
            <TruckIcon className="h-5 w-5 mr-2 text-green-600" />
            Замовлення ({data.orders.length})
          </h4>
          
          {data.orders.length === 0 ? (
            <p className="text-sm text-gray-500">Немає замовлень</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.orders.slice(0, 10).map((order, index) => (
                <div key={index} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm text-gray-900">
                        #{order.orderNumber}
                      </p>
                      <p className="text-xs text-gray-600 truncate">
                        {order.address}
                      </p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      order.status === 'completed' ? 'bg-green-100 text-green-800' :
                      order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {order.status}
                    </span>
                  </div>
                </div>
              ))}
              {data.orders.length > 10 && (
                <p className="text-xs text-gray-500 text-center">
                  ... та ще {data.orders.length - 10} замовлень
                </p>
              )}
            </div>
          )}
        </div>

        {/* Курєри */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h4 className="text-md font-semibold text-gray-900 mb-3 flex items-center">
            <UserGroupIcon className="h-5 w-5 mr-2 text-purple-600" />
            Курєри ({data.couriers.length})
          </h4>
          
          {data.couriers.length === 0 ? (
            <p className="text-sm text-gray-500">Немає курєрів</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.couriers.map((courier, index) => (
                <div key={index} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm text-gray-900">
                        {courier.name}
                      </p>
                      <p className="text-xs text-gray-600">
                        {courier.phone || 'Без телефону'}
                      </p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      courier.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {courier.isActive ? 'Активний' : 'Неактивний'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Способи оплати */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h4 className="text-md font-semibold text-gray-900 mb-3 flex items-center">
            <CreditCardIcon className="h-5 w-5 mr-2 text-orange-600" />
            Способи оплати ({data.paymentMethods.length})
          </h4>
          
          {data.paymentMethods.length === 0 ? (
            <p className="text-sm text-gray-500">Немає способів оплати</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.paymentMethods.map((payment, index) => (
                <div key={index} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm text-gray-900">
                        {payment.name}
                      </p>
                      <p className="text-xs text-gray-600">
                        {payment.type || 'Не вказано'}
                      </p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      payment.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {payment.isActive ? 'Активний' : 'Неактивний'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Помилки */}
      {summary.errors.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6">
          <h4 className="text-md font-semibold text-red-800 mb-3 flex items-center">
            <ExclamationTriangleIcon className="h-5 w-5 mr-2 text-red-600" />
            Помилки обробки ({summary.errors.length})
          </h4>
          
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {summary.errors.map((error, index) => (
              <div key={index} className="p-3 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}




