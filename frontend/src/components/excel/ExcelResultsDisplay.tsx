import React, { useState, useMemo } from 'react'
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
import { useTheme } from '../../contexts/ThemeContext'
import { clsx } from 'clsx'
import { Pagination } from '../shared/Pagination'
import { usePagination } from '../../hooks/usePagination'
import { useAdaptiveItemsPerPage } from '../../hooks/useDeviceCapabilities'

interface ExcelResultsDisplayProps {
  data: any
  summary: any
}

const safeRender = (val: any): React.ReactNode => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) return val.length.toString();
  if (typeof val === 'object') {
    // If it's an object, check for known string fields or just JSON stringify
    if (val.formattedAddress) return val.formattedAddress;
    if (val.name) return val.name;
    try {
      return JSON.stringify(val);
    } catch {
      return '[Object]';
    }
  }
  return '';
};

export const ExcelResultsDisplay: React.FC<ExcelResultsDisplayProps> = ({ data, summary }) => {
  const { isDark } = useTheme()
  const [expandedCourierZones, setExpandedCourierZones] = useState<Set<string>>(new Set())
  const [expandedSections, setExpandedSections] = useState({
    couriers: true,
    orders: false,
    paymentMethods: false,
    errors: false,
    warnings: false
  })
  const [courierSortBy, setCourierSortBy] = useState<'name' | 'orders'>('orders')
  const [courierSortOrder, setCourierSortOrder] = useState<'asc' | 'desc'>('desc')

  // Adaptive items per page based on device capabilities
  const adaptiveItemsPerPage = useAdaptiveItemsPerPage(20)

  // Pagination for orders
  const ordersPagination = usePagination({
    totalItems: data?.orders?.length || 0,
    initialItemsPerPage: adaptiveItemsPerPage
  })

  // Pagination for couriers
  const couriersPagination = usePagination({
    totalItems: data?.couriers?.length || 0,
    initialItemsPerPage: adaptiveItemsPerPage
  })

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

  const { orders, couriers, routes, errors, warnings } = data

  // Memoized paginated orders
  const paginatedOrders = useMemo(() => {
    if (!orders) return []
    return orders.slice(ordersPagination.startIndex, ordersPagination.endIndex)
  }, [orders, ordersPagination.startIndex, ordersPagination.endIndex])

  // Enrich couriers with stats
  const enrichedCouriers = (couriers || []).map((courier: any) => {
    const courierName = typeof courier === 'string' ? courier : courier.name;
    const courierOrders = (orders || []).filter((o: any) => o && o.courier === courierName);
    const courierRoutes = (routes || []).filter((r: any) => r && r.courier === courierName);
    const totalAmount = courierOrders.reduce((sum: number, o: any) => sum + (o.amount || 0), 0);
    const count = courierOrders.length;
    const routesCount = courierRoutes.length;

    // Calculate zone breakdown using deliveryZone with proper fallback
    const zoneBreakdown = courierOrders.reduce((acc: Record<string, number>, order: any) => {
      const zone = order.deliveryZone || order.zone || 'Неизвестно';
      acc[zone] = (acc[zone] || 0) + 1;
      return acc;
    }, {});

    let zoneLabel = 'Малая загрузка';
    if (count >= 2 && count <= 4) {
      zoneLabel = 'Зона 2.5 - 4 заказа';
    } else if (count > 4 && count < 15) {
      zoneLabel = `Плановая загрузка (${count})`;
    } else if (count >= 15) {
      zoneLabel = `Высокая нагрузка (${count})`;
    }

    return {
      ...(typeof courier === 'string' ? { name: courier } : courier),
      ordersCount: count,
      routesCount,
      totalAmount,
      zoneLabel,
      zoneBreakdown,
      avgAmount: count > 0 ? totalAmount / count : 0,
      efficiency: routesCount > 0 ? (count / routesCount).toFixed(1) : '—'
    };
  });

  // Memoized sorted couriers
  const sortedCouriers = useMemo(() => {
    return sortCouriers(enrichedCouriers)
  }, [enrichedCouriers, courierSortBy, courierSortOrder])

  // Memoized paginated couriers
  const paginatedCouriers = useMemo(() => {
    return sortedCouriers.slice(couriersPagination.startIndex, couriersPagination.endIndex)
  }, [sortedCouriers, couriersPagination.startIndex, couriersPagination.endIndex])

  const toggleCourierZones = (courierName: string) => {
    const next = new Set(expandedCourierZones);
    if (next.has(courierName)) {
      next.delete(courierName);
    } else {
      next.add(courierName);
    }
    setExpandedCourierZones(next);
  };

  return (
    <div className="space-y-6">

      {/* Заказы */}
      {orders && orders.length > 0 && (
        <div className={clsx(
          'rounded-lg shadow-sm border p-6',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => toggleSection('orders')}
          >
            <h3 className={clsx(
              'text-lg font-semibold flex items-center',
              isDark ? 'text-gray-100' : 'text-gray-900'
            )}>
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
            <>
              <div className="mt-4 space-y-3">
                {paginatedOrders.map((order: any, index: number) => (
                  <div key={order.orderNumber || index} className={clsx(
                    'p-4 rounded-lg border',
                    isDark ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'
                  )}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <span className={clsx(
                            'font-medium',
                            isDark ? 'text-gray-100' : 'text-gray-900'
                          )}>
                            #{order.orderNumber || `ORDER_${ordersPagination.startIndex + index + 1}`}
                          </span>
                          {order.amount && (
                            <span className={clsx(
                              'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                              isDark ? 'bg-green-900/30 text-green-300' : 'bg-green-100 text-green-800'
                            )}>
                              <CurrencyDollarIcon className="h-3 w-3 mr-1" />
                              {safeRender(order.amount)} грн
                            </span>
                          )}
                        </div>

                        <div className={clsx(
                          'space-y-1 text-sm',
                          isDark ? 'text-gray-400' : 'text-gray-600'
                        )}>
                          <div className="flex items-center">
                            <MapPinIcon className="h-4 w-4 mr-2 text-gray-400" />
                            <span>{safeRender(order.address)}</span>
                          </div>

                          {order.courier && (
                            <div className="flex items-center">
                              <TruckIcon className="h-4 w-4 mr-2 text-gray-400" />
                              <span>Курьер: {safeRender(order.courier)}</span>
                            </div>
                          )}

                          {order.paymentMethod && (
                            <div className="flex items-center">
                              <CreditCardIcon className="h-4 w-4 mr-2 text-gray-400" />
                              <span>Оплата: {safeRender(order.paymentMethod)}</span>
                            </div>
                          )}

                          {order.customerName && (
                            <div className="flex items-center">
                              <UserIcon className="h-4 w-4 mr-2 text-gray-400" />
                              <span>Клиент: {safeRender(order.customerName)}</span>
                            </div>
                          )}

                          {order.phone && (
                            <div className="flex items-center">
                              <PhoneIcon className="h-4 w-4 mr-2 text-gray-400" />
                              <span>Телефон: {safeRender(order.phone)}</span>
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

              {/* Orders Pagination */}
              {orders && orders.length > 10 && (
                <div className="mt-4">
                  <Pagination
                    currentPage={ordersPagination.currentPage}
                    totalPages={ordersPagination.totalPages}
                    onPageChange={ordersPagination.setCurrentPage}
                    itemsPerPage={ordersPagination.itemsPerPage}
                    onItemsPerPageChange={ordersPagination.setItemsPerPage}
                    totalItems={orders.length}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Курьеры */}
      {couriers && couriers.length > 0 && (
        <div className={clsx(
          'rounded-lg shadow-sm border p-6',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <div className="flex items-center justify-between">
            <div
              className="flex items-center cursor-pointer"
              onClick={() => toggleSection('couriers')}
            >
              <h3 className={clsx(
                'text-lg font-semibold flex items-center',
                isDark ? 'text-gray-100' : 'text-gray-900'
              )}>
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
                  className={`px-3 py-1 text-xs rounded ${courierSortBy === 'name'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-gray-100 text-gray-600'
                    }`}
                >
                  По имени {courierSortBy === 'name' && (courierSortOrder === 'asc' ? '↑' : '↓')}
                </button>
                <button
                  onClick={() => handleCourierSort('orders')}
                  className={`px-3 py-1 text-xs rounded ${courierSortBy === 'orders'
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
            <>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {paginatedCouriers.map((courier: any, index: number) => (
                  <div key={courier.name || index} className={clsx(
                    'p-4 rounded-lg border',
                    isDark ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'
                  )}>
                    <div className="flex items-center space-x-3 mb-2">
                      <TruckIcon className="h-5 w-5 text-green-600" />
                      <span className={clsx(
                        'font-medium',
                        isDark ? 'text-gray-100' : 'text-gray-900'
                      )}>{courier.name}</span>
                    </div>

                    <div className={clsx(
                      'space-y-1 text-sm',
                      isDark ? 'text-gray-400' : 'text-gray-600'
                    )}>
                      <div className="flex justify-between">
                        <span>Заказов:</span>
                        <span className={clsx(
                          'font-medium',
                          isDark ? 'text-gray-200' : 'text-gray-900'
                        )}>{courier.ordersCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Общая сумма:</span>
                        <span className={clsx(
                          'font-medium text-green-500'
                        )}>{Math.round(courier.totalAmount)} грн</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Средний чек:</span>
                        <span className={clsx(
                          'font-medium',
                          isDark ? 'text-gray-200' : 'text-gray-900'
                        )}>{Math.round(courier.avgAmount)} грн</span>
                      </div>
                      {courier.vehicleType && (
                        <div className="flex justify-between">
                          <span>Транспорт:</span>
                          <span className={clsx(
                            'font-medium',
                            isDark ? 'text-gray-200' : 'text-gray-900'
                          )}>{courier.vehicleType === 'car' ? 'Авто' : 'Мото'}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Маршрутов:</span>
                        <span className={clsx(
                          'font-medium',
                          isDark ? 'text-gray-200' : 'text-gray-900'
                        )}>{courier.routesCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Загрузка (заказов/маршрут):</span>
                        <span className={clsx(
                          'font-medium',
                          isDark ? 'text-blue-300' : 'text-blue-600'
                        )}>{courier.efficiency}</span>
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 flex flex-col items-center">
                        <button
                          onClick={() => toggleCourierZones(courier.name)}
                          className={clsx(
                            'text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer shadow-sm',
                            courier.ordersCount >= 15
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                              : courier.ordersCount >= 2
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                          )}
                        >
                          {courier.zoneLabel}
                        </button>

                        {expandedCourierZones.has(courier.name) && (
                          <div className={clsx(
                            'mt-3 w-full p-2 rounded-lg text-xs space-y-1 animate-in fade-in slide-in-from-top-2 duration-200',
                            isDark ? 'bg-gray-800/80' : 'bg-white shadow-inner'
                          )}>
                            <div className="font-bold border-b border-gray-200 dark:border-gray-700 pb-1 mb-1 text-center">
                              Распределение по зонам
                            </div>
                            {Object.entries(courier.zoneBreakdown).map(([zone, count]) => (
                              <div key={zone} className="flex justify-between items-center px-1">
                                <span className="truncate mr-2 max-w-[120px]">{zone}</span>
                                <span className="font-bold">{count as number} зак.</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Couriers Pagination */}
              {couriers && couriers.length > 10 && (
                <div className="mt-4">
                  <Pagination
                    currentPage={couriersPagination.currentPage}
                    totalPages={couriersPagination.totalPages}
                    onPageChange={couriersPagination.setCurrentPage}
                    itemsPerPage={couriersPagination.itemsPerPage}
                    onItemsPerPageChange={couriersPagination.setItemsPerPage}
                    totalItems={couriers.length}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}


      {/* Ошибки */}
      {errors && errors.length > 0 && (
        <div className={clsx(
          'rounded-lg shadow-sm border p-6',
          isDark ? 'bg-red-900/10 border-red-800' : 'bg-white border-red-200'
        )}>
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => toggleSection('errors')}
          >
            <h3 className={clsx(
              'text-lg font-semibold flex items-center',
              isDark ? 'text-red-400' : 'text-red-900'
            )}>
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
              {errors.map((error: any, index: number) => (
                <div key={index} className="bg-red-50 p-3 rounded-lg border border-red-200">
                  <p className="text-sm text-red-800">
                    {typeof error === 'string' ? error : `Строка ${error.row}: ${error.message}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Предупреждения */}
      {warnings && warnings.length > 0 && (
        <div className={clsx(
          'rounded-lg shadow-sm border p-6',
          isDark ? 'bg-yellow-900/10 border-yellow-800' : 'bg-white border-yellow-200'
        )}>
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => toggleSection('warnings')}
          >
            <h3 className={clsx(
              'text-lg font-semibold flex items-center',
              isDark ? 'text-yellow-400' : 'text-yellow-900'
            )}>
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
                <div key={index} className={clsx(
                  'p-3 rounded-lg border',
                  isDark ? 'bg-yellow-900/20 border-yellow-800' : 'bg-yellow-50 border-yellow-200'
                )}>
                  <p className={clsx('text-sm', isDark ? 'text-yellow-200' : 'text-yellow-800')}>{warning}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
































