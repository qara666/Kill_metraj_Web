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

import { DashboardHeader } from '../components/shared/DashboardHeader'

export const Analytics: React.FC = () => {
  const { excelData } = useExcelData()
  const { isDark } = useTheme()
  const [activeTab, setActiveTab] = useState<'overview' | 'couriers' | 'session' | 'problems' | 'financial'>('overview')

  return (
    <div className="space-y-6">
      <DashboardHeader
        icon={PresentationChartBarIcon}
        title="АНАЛІТИЧНИЙ ХАБ"
        subtitle="ПОТОКОВИЙ АНАЛІЗ ЕФЕКТИВНОСТІ"
        statusMetrics={[
          {
            label: "ЗАКАЗІВ ОБРОБЛЕНО",
            value: excelData?.orders?.length || 0,
            color: "bg-blue-600"
          }
        ]}
      />

      {/* Tab Navigation Compact */}
      <div className={clsx(
        "px-6 py-4 rounded-3xl flex flex-wrap items-center gap-2 border shadow-sm",
        isDark ? "bg-[#080b12] border-white/5" : "bg-white border-slate-100"
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
              "px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border",
              activeTab === tab.id 
                ? "bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-600/20"
                : isDark 
                   ? "bg-white/5 border-white/5 text-gray-500 hover:text-white hover:bg-white/10" 
                   : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
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
