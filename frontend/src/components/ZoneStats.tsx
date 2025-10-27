import React from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { clsx } from 'clsx'
import { 
  MapPinIcon, 
  ClockIcon, 
  CurrencyDollarIcon,
  UserGroupIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline'

interface ZoneStatsProps {
  zones: Array<{
    id: string
    name: string
    orders: Array<{
      amount: number
      courier: string
    }>
    couriers: string[]
    totalAmount: number
    averageTime: number
  }>
}

export const ZoneStats: React.FC<ZoneStatsProps> = ({ zones }) => {
  const { isDark } = useTheme()

  // Безопасная обработка данных
  const safeZones = zones || []
  
  const totalStats = {
    totalOrders: safeZones.reduce((sum, zone) => sum + (zone.orders?.length || 0), 0),
    totalAmount: safeZones.reduce((sum, zone) => sum + (zone.totalAmount || 0), 0),
    totalCouriers: new Set(safeZones.flatMap(zone => zone.couriers || [])).size,
    averageEfficiency: safeZones.length > 0 
      ? safeZones.reduce((sum, zone) => sum + ((zone.totalAmount || 0) / (zone.averageTime || 1)), 0) / safeZones.length 
      : 0
  }

  const topZone = safeZones.reduce((top, zone) => 
    (zone.totalAmount || 0) > (top.totalAmount || 0) ? zone : top, 
    safeZones[0] || { name: 'Нет данных', totalAmount: 0 }
  )

  const courierStats = safeZones.reduce((acc, zone) => {
    (zone.couriers || []).forEach(courier => {
      if (!acc[courier]) {
        acc[courier] = { orders: 0, amount: 0, zones: 0 }
      }
      acc[courier].orders += (zone.orders || []).filter(o => o.courier === courier).length
      acc[courier].amount += (zone.orders || []).filter(o => o.courier === courier).reduce((sum, o) => sum + (o.amount || 0), 0)
      acc[courier].zones += 1
    })
    return acc
  }, {} as { [key: string]: { orders: number; amount: number; zones: number } })

  const topCourier = Object.entries(courierStats).reduce((top, [name, stats]) => 
    stats.amount > top.amount ? { name, ...stats } : top,
    { name: 'Нет данных', amount: 0, orders: 0, zones: 0 }
  )

  return (
    <div className={clsx(
      'card p-6',
      isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
    )}>
      <div className="flex items-center space-x-2 mb-6">
        <ChartBarIcon className="h-6 w-6 text-blue-500" />
        <h3 className={clsx(
          'text-lg font-semibold',
          isDark ? 'text-gray-100' : 'text-gray-900'
        )}>
          Статистика зон
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Orders */}
        <div className="text-center">
          <div className={clsx(
            'inline-flex items-center justify-center w-12 h-12 rounded-full mb-3',
            'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
          )}>
            <MapPinIcon className="h-6 w-6" />
          </div>
          <div className={clsx(
            'text-2xl font-bold',
            isDark ? 'text-gray-100' : 'text-gray-900'
          )}>
            {totalStats.totalOrders}
          </div>
          <div className={clsx(
            'text-sm',
            isDark ? 'text-gray-400' : 'text-gray-600'
          )}>
            Всего заказов
          </div>
        </div>

        {/* Total Amount */}
        <div className="text-center">
          <div className={clsx(
            'inline-flex items-center justify-center w-12 h-12 rounded-full mb-3',
            'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
          )}>
            <CurrencyDollarIcon className="h-6 w-6" />
          </div>
          <div className={clsx(
            'text-2xl font-bold',
            isDark ? 'text-gray-100' : 'text-gray-900'
          )}>
            {totalStats.totalAmount.toLocaleString()} ₴
          </div>
          <div className={clsx(
            'text-sm',
            isDark ? 'text-gray-400' : 'text-gray-600'
          )}>
            Общая сумма
          </div>
        </div>

        {/* Total Couriers */}
        <div className="text-center">
          <div className={clsx(
            'inline-flex items-center justify-center w-12 h-12 rounded-full mb-3',
            'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
          )}>
            <UserGroupIcon className="h-6 w-6" />
          </div>
          <div className={clsx(
            'text-2xl font-bold',
            isDark ? 'text-gray-100' : 'text-gray-900'
          )}>
            {totalStats.totalCouriers}
          </div>
          <div className={clsx(
            'text-sm',
            isDark ? 'text-gray-400' : 'text-gray-600'
          )}>
            Активных курьеров
          </div>
        </div>

        {/* Average Efficiency */}
        <div className="text-center">
          <div className={clsx(
            'inline-flex items-center justify-center w-12 h-12 rounded-full mb-3',
            'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
          )}>
            <ClockIcon className="h-6 w-6" />
          </div>
          <div className={clsx(
            'text-2xl font-bold',
            isDark ? 'text-gray-100' : 'text-gray-900'
          )}>
            {totalStats.averageEfficiency.toFixed(1)}
          </div>
          <div className={clsx(
            'text-sm',
            isDark ? 'text-gray-400' : 'text-gray-600'
          )}>
            ₴/мин средняя
          </div>
        </div>
      </div>

      {/* Top Performers */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Zone */}
        <div className={clsx(
          'p-4 rounded-lg',
          isDark ? 'bg-gray-700' : 'bg-gray-50'
        )}>
          <h4 className={clsx(
            'font-semibold mb-3',
            isDark ? 'text-gray-100' : 'text-gray-900'
          )}>
            🏆 Топ зона
          </h4>
          <div className="space-y-2">
            <div className={clsx(
              'font-medium',
              isDark ? 'text-gray-200' : 'text-gray-800'
            )}>
              {topZone.name}
            </div>
            <div className={clsx(
              'text-sm',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              {topZone.totalAmount.toLocaleString()} ₴
            </div>
          </div>
        </div>

        {/* Top Courier */}
        <div className={clsx(
          'p-4 rounded-lg',
          isDark ? 'bg-gray-700' : 'bg-gray-50'
        )}>
          <h4 className={clsx(
            'font-semibold mb-3',
            isDark ? 'text-gray-100' : 'text-gray-900'
          )}>
            🚀 Топ курьер
          </h4>
          <div className="space-y-2">
            <div className={clsx(
              'font-medium',
              isDark ? 'text-gray-200' : 'text-gray-800'
            )}>
              {topCourier.name}
            </div>
            <div className={clsx(
              'text-sm',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              {topCourier.amount.toLocaleString()} ₴ • {topCourier.orders} заказов
            </div>
          </div>
        </div>
      </div>

      {/* Zone Breakdown */}
      <div className="mt-6">
        <h4 className={clsx(
          'font-semibold mb-4',
          isDark ? 'text-gray-100' : 'text-gray-900'
        )}>
          Детализация по зонам
        </h4>
        
        <div className="space-y-3">
          {safeZones.map((zone) => (
            <div
              key={zone.id}
              className={clsx(
                'flex items-center justify-between p-3 rounded-lg',
                isDark ? 'bg-gray-700' : 'bg-gray-50'
              )}
            >
              <div className="flex items-center space-x-3">
                <MapPinIcon className="h-5 w-5 text-blue-500" />
                <div>
                  <div className={clsx(
                    'font-medium',
                    isDark ? 'text-gray-200' : 'text-gray-800'
                  )}>
                    {zone.name}
                  </div>
                  <div className={clsx(
                    'text-sm',
                    isDark ? 'text-gray-400' : 'text-gray-600'
                  )}>
                    {zone.orders?.length || 0} заказов • {zone.couriers?.length || 0} курьеров
                  </div>
                </div>
              </div>
              
              <div className="text-right">
                <div className={clsx(
                  'font-semibold',
                  isDark ? 'text-gray-200' : 'text-gray-800'
                )}>
                  {(zone.totalAmount || 0).toLocaleString()} ₴
                </div>
                <div className={clsx(
                  'text-sm',
                  isDark ? 'text-gray-400' : 'text-gray-600'
                )}>
                  ~{zone.averageTime || 0} мин
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}




