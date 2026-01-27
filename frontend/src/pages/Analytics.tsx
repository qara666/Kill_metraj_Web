import React from 'react'
import { ChartBarIcon } from '@heroicons/react/24/outline'
import { LoadingSpinner } from '../components/shared/LoadingSpinner'
import { AnalyticsDashboard } from '../components/analytics/AnalyticsDashboard'
import { useExcelData } from '../contexts/ExcelDataContext'
import { useTheme } from '../contexts/ThemeContext'
import { clsx } from 'clsx'

export const Analytics: React.FC = () => {
  const { excelData } = useExcelData()
  const { isDark } = useTheme()

  // Показываем загрузку только если нет данных Excel
  if (!excelData) {
    return (
      <div className={clsx(
        'flex items-center justify-center h-64',
        isDark ? 'text-gray-400' : 'text-gray-600'
      )}>
        <div className="text-center">
          <LoadingSpinner />
          <p className="mt-4">Загрузите любые данные для просмотра аналитики</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={clsx(
        'rounded-lg shadow-sm border p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className={clsx(
              'text-2xl font-bold',
              isDark ? 'text-white' : 'text-gray-900'
            )}>
              Аналитика и отчеты
            </h1>
            <p className={clsx(
              'mt-1 text-sm',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              Расширенная аналитика и статистика
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <ChartBarIcon className="h-6 w-6 text-blue-600" />
            <span className={clsx(
              'text-sm font-medium',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              Аналитика
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-screen">
        <AnalyticsDashboard />
      </div>
    </div>
  )
}































