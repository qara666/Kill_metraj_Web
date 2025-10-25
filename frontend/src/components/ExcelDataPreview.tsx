import React from 'react';
import { 
  DocumentTextIcon, 
  UserIcon, 
  MapPinIcon, 
  CurrencyDollarIcon,
  TruckIcon,
  PhoneIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';

interface ExcelDataPreviewProps {
  data: any;
  isVisible: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const ExcelDataPreview: React.FC<ExcelDataPreviewProps> = ({ 
  data, 
  isVisible, 
  onClose, 
  onConfirm 
}) => {
  if (!isVisible || !data) return null;

  const { orders, couriers, paymentMethods, addresses, errors, warnings, statistics, debug } = data;

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'доставлен':
      case 'выполнен':
      case 'completed':
        return 'text-green-600 bg-green-50';
      case 'в пути':
      case 'в дороге':
      case 'in transit':
        return 'text-blue-600 bg-blue-50';
      case 'ожидает':
      case 'pending':
        return 'text-yellow-600 bg-yellow-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('uk-UA', {
      style: 'currency',
      currency: 'UAH'
    }).format(amount);
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-center">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col m-4">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <DocumentTextIcon className="h-8 w-8 text-blue-600" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Предпросмотр данных Excel</h2>
              <p className="text-sm text-gray-500">
                Проверьте извлеченную информацию перед сохранением
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center">
                <TruckIcon className="h-8 w-8 text-blue-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-blue-600">Заказы</p>
                  <p className="text-2xl font-bold text-blue-900">{orders?.length || 0}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-green-50 rounded-lg p-4">
              <div className="flex items-center">
                <UserIcon className="h-8 w-8 text-green-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-green-600">Курьеры</p>
                  <p className="text-2xl font-bold text-green-900">{couriers?.length || 0}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="flex items-center">
                <CurrencyDollarIcon className="h-8 w-8 text-purple-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-purple-600">Способы оплаты</p>
                  <p className="text-2xl font-bold text-purple-900">{paymentMethods?.length || 0}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-orange-50 rounded-lg p-4">
              <div className="flex items-center">
                <MapPinIcon className="h-8 w-8 text-orange-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-orange-600">Адреса</p>
                  <p className="text-2xl font-bold text-orange-900">{addresses?.length || 0}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Statistics */}
          {statistics && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Статистика</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {formatAmount(statistics.totalAmount || 0)}
                  </p>
                  <p className="text-sm text-gray-500">Общая сумма</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {formatAmount(statistics.averageAmount || 0)}
                  </p>
                  <p className="text-sm text-gray-500">Средний чек</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {statistics.deliveryCount || 0}
                  </p>
                  <p className="text-sm text-gray-500">Доставки</p>
                </div>
              </div>
            </div>
          )}

          {/* Errors and Warnings */}
          {(errors?.length > 0 || warnings?.length > 0) && (
            <div className="mb-6">
              {errors?.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center mb-2">
                    <ExclamationTriangleIcon className="h-5 w-5 text-red-600 mr-2" />
                    <h3 className="text-lg font-semibold text-red-900">Ошибки ({errors.length})</h3>
                  </div>
                  <div className="space-y-2">
                    {errors.slice(0, 5).map((error: string, index: number) => (
                      <p key={index} className="text-sm text-red-700">{error}</p>
                    ))}
                    {errors.length > 5 && (
                      <p className="text-sm text-red-600">... и еще {errors.length - 5} ошибок</p>
                    )}
                  </div>
                </div>
              )}
              
              {warnings?.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center mb-2">
                    <InformationCircleIcon className="h-5 w-5 text-yellow-600 mr-2" />
                    <h3 className="text-lg font-semibold text-yellow-900">Предупреждения ({warnings.length})</h3>
                  </div>
                  <div className="space-y-2">
                    {warnings.slice(0, 5).map((warning: string, index: number) => (
                      <p key={index} className="text-sm text-yellow-700">{warning}</p>
                    ))}
                    {warnings.length > 5 && (
                      <p className="text-sm text-yellow-600">... и еще {warnings.length - 5} предупреждений</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sample Orders */}
          {orders && orders.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Примеры заказов ({orders.length} всего)
              </h3>
              <div className="space-y-3">
                {orders.slice(0, 5).map((order: any, index: number) => (
                  <div key={index} className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <span className="text-lg font-semibold text-gray-900">
                            #{order.orderNumber || order.id}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                            {order.status}
                          </span>
                          <span className="text-lg font-bold text-green-600">
                            {formatAmount(order.amount || order.financial?.amount || 0)}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div className="space-y-1">
                            {order.customerName && (
                              <div className="flex items-center">
                                <UserIcon className="h-4 w-4 text-gray-400 mr-2" />
                                <span className="text-gray-600">{order.customerName}</span>
                              </div>
                            )}
                            {order.phone && (
                              <div className="flex items-center">
                                <PhoneIcon className="h-4 w-4 text-gray-400 mr-2" />
                                <span className="text-gray-600">{order.phone}</span>
                              </div>
                            )}
                          </div>
                          
                          <div className="space-y-1">
                            {order.address && (
                              <div className="flex items-center">
                                <MapPinIcon className="h-4 w-4 text-gray-400 mr-2" />
                                <span className="text-gray-600">{order.address}</span>
                              </div>
                            )}
                            {order.courier && (
                              <div className="flex items-center">
                                <TruckIcon className="h-4 w-4 text-gray-400 mr-2" />
                                <span className="text-gray-600">{order.courier}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {order.comment && (
                          <div className="mt-2 flex items-start">
                            <ChatBubbleLeftRightIcon className="h-4 w-4 text-gray-400 mr-2 mt-0.5" />
                            <span className="text-sm text-gray-600">{order.comment}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                
                {orders.length > 5 && (
                  <div className="text-center py-4">
                    <p className="text-sm text-gray-500">
                      ... и еще {orders.length - 5} заказов
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Unique Couriers */}
          {couriers && couriers.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Уникальные курьеры ({couriers.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {couriers.map((courier: any, index: number) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                  >
                    {courier.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Payment Methods */}
          {paymentMethods && paymentMethods.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Способы оплаты ({paymentMethods.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {paymentMethods.map((method: any, index: number) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium"
                  >
                    {method.method}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Debug Info */}
          {debug && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Информация об обработке</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Всего строк: <span className="font-medium">{debug.totalRows || 0}</span></p>
                  <p className="text-gray-600">Обработано: <span className="font-medium">{debug.processedRows || 0}</span></p>
                </div>
                <div>
                  <p className="text-gray-600">Листов: <span className="font-medium">{debug.sheets?.length || 0}</span></p>
                  <p className="text-gray-600">Логов: <span className="font-medium">{debug.logs?.length || 0}</span></p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <CheckCircleIcon className="h-4 w-4 inline mr-2" />
            Подтвердить и сохранить
          </button>
        </div>
      </div>
    </div>
  );
};




