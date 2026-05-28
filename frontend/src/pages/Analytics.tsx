import React, { useState, useMemo, useCallback, Suspense, lazy, useEffect, useRef } from 'react'
import {
    ChartBarIcon,
    UserGroupIcon,
    ClockIcon,
    CpuChipIcon,
    CurrencyDollarIcon,
    PresentationChartBarIcon,
    BoltIcon
} from '@heroicons/react/24/outline'
import { LoadingSpinner } from '../components/shared/LoadingSpinner'
import { useExcelData } from '../contexts/ExcelDataContext'
import { useTheme } from '../contexts/ThemeContext'
import { clsx } from 'clsx'
import { DashboardHeader } from '../components/shared/DashboardHeader'
import { useDashboardStore } from '../stores/useDashboardStore'

const AdvancedAnalyticsDashboard = lazy(() =>
  import('../components/analytics/AdvancedAnalyticsDashboard').then(m => ({ default: m.AdvancedAnalyticsDashboard }))
)
const CourierDeepAnalytics = lazy(() =>
  import('../components/analytics/CourierDeepAnalytics').then(m => ({ default: m.CourierDeepAnalytics }))
)
const AnalyticsDashboard = lazy(() =>
  import('../components/analytics/AnalyticsDashboard').then(m => ({ default: m.AnalyticsDashboard }))
)
const ProblemSolverAnalytics = lazy(() =>
  import('../components/analytics/ProblemSolverAnalytics').then(m => ({ default: m.ProblemSolverAnalytics }))
)
const FinancialDensityAnalytics = lazy(() =>
  import('../components/analytics/FinancialDensityAnalytics').then(m => ({ default: m.FinancialDensityAnalytics }))
)
const CourierEfficiency = lazy(() => import('./CourierEfficiency'))

const TABS = [
  { id: 'overview', label: 'ОГЛЯД', icon: ChartBarIcon },
  { id: 'problems', label: 'РОБОТ', icon: CpuChipIcon },
  { id: 'financial', label: 'ФІНАНСИ', icon: CurrencyDollarIcon },
  { id: 'couriers', label: 'ПЕРСОНАЛ', icon: UserGroupIcon },
  { id: 'session', label: 'СЕСІЯ', icon: ClockIcon },
  { id: 'efficiency', label: 'ЕФЕКТИВНІСТЬ', icon: BoltIcon },
] as const

type TabId = typeof TABS[number]['id']

export const Analytics: React.FC = () => {
  const { excelData } = useExcelData()
  const { isDark } = useTheme()
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const lastSyncRef = useRef<number>(0)
  const apiSyncStatus = useDashboardStore(s => s.apiSyncStatus)

  const ordersCount = excelData?.orders?.length || 0
  const statusMetrics = useMemo(() => [
    { label: "ЗАКАЗІВ ОБРОБЛЕНО", value: ordersCount, color: "bg-blue-600" }
  ], [ordersCount])

  useEffect(() => {
    const now = Date.now()
    if (now - lastSyncRef.current > 5000) {
      lastSyncRef.current = now
    }
  }, [activeTab, apiSyncStatus])

  return (
    <div className="space-y-6">
      <DashboardHeader
        icon={PresentationChartBarIcon}
        title="АНАЛІТИЧНИЙ ХАБ"
        subtitle="ПОТОКОВИЙ АНАЛІЗ ЕФЕКТИВНОСТІ"
        statusMetrics={statusMetrics}
      />

      <div className={clsx(
        "px-6 py-4 rounded-3xl flex flex-wrap items-center gap-2 border shadow-sm",
        isDark ? "bg-[#080b12] border-white/5" : "bg-white border-slate-100"
      )}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              "px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border transition-colors",
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

      <div className="pb-10 min-h-[50vh]">
        <Suspense fallback={<div className="flex justify-center py-20"><LoadingSpinner /></div>}>
          {activeTab === 'overview' && <AdvancedAnalyticsDashboard />}
          {activeTab === 'problems' && <ProblemSolverAnalytics />}
          {activeTab === 'financial' && <FinancialDensityAnalytics />}
          {activeTab === 'couriers' && <CourierDeepAnalytics />}
          {activeTab === 'efficiency' && <CourierEfficiency />}
          {activeTab === 'session' && (
            !excelData?.orders?.length ? (
              <div className={clsx(
                'flex flex-col items-center justify-center p-12 rounded-3xl border-2 border-dashed',
                isDark ? 'bg-gray-900/40 border-gray-800 text-gray-500' : 'bg-gray-50 border-gray-100 text-gray-400'
              )}>
                <LoadingSpinner />
                <p className="mt-6 text-sm font-black uppercase tracking-widest opacity-30">Очікуємо потік даних...</p>
              </div>
            ) : (
              <AnalyticsDashboard />
            )
          )}
        </Suspense>
      </div>
    </div>
  )
}
