import React, { useState } from 'react'
import { AdvancedAnalyticsDashboard } from '../components/analytics/AdvancedAnalyticsDashboard'
import { CourierDeepAnalytics } from '../components/analytics/CourierDeepAnalytics'
import { AnalyticsDashboard } from '../components/analytics/AnalyticsDashboard'
import { ProblemSolverAnalytics } from '../components/analytics/ProblemSolverAnalytics'
import { FinancialDensityAnalytics } from '../components/analytics/FinancialDensityAnalytics'
import { 
    ChartBarIcon, 
    UserGroupIcon, 
    ClockIcon, 
    CpuChipIcon,
    CurrencyDollarIcon,
    PresentationChartBarIcon
} from '@heroicons/react/24/outline'
import { LoadingSpinner } from '../components/shared/LoadingSpinner'
import { useExcelData } from '../contexts/ExcelDataContext'
import { useTheme } from '../contexts/ThemeContext'
import { clsx } from 'clsx'

export const Analytics: React.FC = () => {
  const { excelData } = useExcelData()
  const { isDark } = useTheme()
  const [activeTab, setActiveTab] = useState<'overview' | 'couriers' | 'session' | 'problems' | 'financial'>('overview')

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* Header Compact v5.234 */}
      <div className={clsx(
        'rounded-3xl shadow-xl border p-8 relative overflow-hidden transition-all',
        isDark ? 'bg-gray-900 border-white/5' : 'bg-white border-gray-100 shadow-slate-200/50'
      )}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none" />
        
        <div className="relative flex flex-col xl:flex-row items-center justify-between gap-8">
          <div className="max-w-2xl text-center xl:text-left">
            <div className="flex items-center gap-3 mb-4 justify-center xl:justify-start">
               <div className="p-2.5 bg-blue-500/10 rounded-xl">
                 <PresentationChartBarIcon className="h-6 w-6 text-blue-500" />
               </div>
               <span className="text-[10px] font-black uppercase tracking-widest text-blue-500/60">Analytics Engine v2.0</span>
            </div>
            <h1 className={clsx(
              'text-4xl font-black tracking-tight leading-none',
              isDark ? 'text-white' : 'text-gray-900'
            )}>
              Аналітичний Хаб
            </h1>
            <p className={clsx(
              'mt-4 text-sm font-medium opacity-60 leading-relaxed',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              Максимальний потоковий аналіз логістичної ефективності та фінансових показників.
            </p>
          </div>

          {/* Tab Navigation Compact */}
          <div className={clsx(
            "p-2 rounded-2xl grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2 shadow-inner border",
            isDark ? "bg-black/30 border-white/5" : "bg-gray-50 border-gray-200"
          )}>
            {[
              { id: 'overview', label: 'ОГЛЯД', icon: ChartBarIcon },
              { id: 'problems', label: 'РОБОТ', icon: CpuChipIcon },
              { id: 'financial', label: 'ФІНАНСИ', icon: CurrencyDollarIcon },
              { id: 'couriers', label: 'ПЕРСОНАЛ', icon: UserGroupIcon },
              { id: 'session', label: 'СЕСІЯ', icon: ClockIcon }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={clsx(
                  "px-5 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                  activeTab === tab.id 
                    ? "bg-blue-600 text-white shadow-lg scale-105"
                    : isDark ? "text-gray-500 hover:text-white" : "text-gray-500 hover:text-gray-900"
                )}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content Rendering Compact */}
      <div className="pb-10 min-h-[50vh]">
        {activeTab === 'overview' && <AdvancedAnalyticsDashboard />}
        {activeTab === 'problems' && <ProblemSolverAnalytics />}
        {activeTab === 'financial' && <FinancialDensityAnalytics />}
        {activeTab === 'couriers' && <CourierDeepAnalytics />}
        {activeTab === 'session' && (
          !excelData?.orders?.length ? (
            <div className={clsx(
              'flex flex-col items-center justify-center p-12 rounded-3xl border-2 border-dashed transition-all',
              isDark ? 'bg-gray-900/40 border-gray-800 text-gray-500' : 'bg-gray-50 border-gray-100 text-gray-400'
            )}>
              <LoadingSpinner />
              <p className="mt-6 text-sm font-black uppercase tracking-widest opacity-30">Очікуємо потік даних...</p>
            </div>
          ) : (
            <AnalyticsDashboard />
          )
        )}
      </div>
    </div>
  )
}
