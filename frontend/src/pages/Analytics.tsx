import React, { useState } from 'react'
import { 
  ChartBarIcon, 
  MapPinIcon, 
  SparklesIcon,
  EyeIcon,
  BoltIcon
} from '@heroicons/react/24/outline'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { AnalyticsDashboard } from '../components/AnalyticsDashboard'
import { SmartRouteOptimizer } from '../components/SmartRouteOptimizer'
import { RoutePlanner } from '../components/RoutePlanner'
import { MonitoringSystem } from '../components/MonitoringSystem'
import { VisualizationDashboard } from '../components/VisualizationDashboard'
import { AIFeatures } from '../components/AIFeatures'
import { useExcelData } from '../contexts/ExcelDataContext'
import { useTheme } from '../contexts/ThemeContext'
import { clsx } from 'clsx'

export const Analytics: React.FC = () => {
  const { excelData } = useExcelData()
  const { isDark } = useTheme()
  const [activeTab, setActiveTab] = useState<'dashboard' | 'optimization' | 'planning' | 'monitoring' | 'visualization' | 'ai'>('dashboard')

  // Показываем загрузку только если нет данных Excel
  if (!excelData) {
    return (
      <div className={clsx(
        'flex items-center justify-center h-64',
        isDark ? 'text-gray-400' : 'text-gray-600'
      )}>
        <div className="text-center">
          <LoadingSpinner />
          <p className="mt-4">Загрузите Excel файл для просмотра аналитики</p>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'dashboard', label: 'Дашборд', icon: ChartBarIcon },
    { id: 'optimization', label: 'Оптимизация', icon: BoltIcon },
    { id: 'planning', label: 'Планирование', icon: MapPinIcon },
    { id: 'monitoring', label: 'Мониторинг', icon: EyeIcon },
    { id: 'visualization', label: 'Визуализация', icon: SparklesIcon },
    { id: 'ai', label: 'ИИ функции', icon: ChartBarIcon }
  ]

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <AnalyticsDashboard />
      case 'optimization':
        return <SmartRouteOptimizer />
      case 'planning':
        return <RoutePlanner />
      case 'monitoring':
        return <MonitoringSystem />
      case 'visualization':
        return <VisualizationDashboard />
      case 'ai':
        return <AIFeatures />
      default:
        return <AnalyticsDashboard />
    }
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
              Расширенная аналитика, оптимизация маршрутов и ИИ функции
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

      {/* Tabs */}
      <div className={clsx(
        'rounded-lg shadow-sm border',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={clsx(
                    'flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-screen">
        {renderTabContent()}
      </div>
    </div>
  )
}













