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
    <div className="space-y-12 animate-in fade-in duration-1000">
      {/* Premium Header v5.500 */}
      <div className={clsx(
        'rounded-[5rem] shadow-2xl border-2 p-12 relative overflow-hidden transition-all duration-700',
        isDark ? 'bg-gray-900/40 border-gray-800' : 'bg-white border-gray-100'
      )}>
        {/* Animated Background Orbs */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[100px] -mr-64 -mt-64 animate-pulse"></div>
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-[100px] -ml-48 -mb-48 animate-pulse delay-700"></div>

        <div className="relative flex flex-col xl:flex-row xl:items-center justify-between gap-12">
          <div className="max-w-4xl">
            <div className="flex items-center gap-4 mb-6">
               <div className="p-4 bg-blue-500/10 rounded-3xl shadow-inner">
                 <PresentationChartBarIcon className="h-10 w-10 text-blue-500" />
               </div>
               <span className="text-sm font-black uppercase tracking-[0.4em] text-blue-500/80">Kill Metraj Analytics Engine v2.0</span>
            </div>
            <h1 className={clsx(
              'text-7xl font-black tracking-tighter leading-none',
              isDark ? 'text-white' : 'text-gray-900'
            )}>
              Аналитический Хаб
            </h1>
            <p className={clsx(
              'mt-6 text-xl font-medium max-w-2xl leading-relaxed opacity-60',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              Максимальный потоковый анализ логистической эффективности, финансовых показателей и операционных аномалий.
            </p>
          </div>

          {/* Tab Navigation Grid */}
          <div className={clsx(
            "p-3 rounded-[3rem] grid grid-cols-2 lg:grid-cols-3 gap-3 self-start xl:self-center shadow-2xl",
            isDark ? "bg-gray-800/80" : "bg-gray-100"
          )}>
            <button
              onClick={() => setActiveTab('overview')}
              className={clsx(
                "px-8 py-5 rounded-[2.5rem] text-[9px] font-black uppercase tracking-[0.2em] transition-all duration-500 flex items-center gap-3",
                activeTab === 'overview' 
                  ? (isDark ? "bg-blue-600 text-white shadow-2xl scale-105" : "bg-white text-blue-600 shadow-xl scale-105")
                  : (isDark ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900")
              )}
            >
              <ChartBarIcon className="w-4 h-4" />
              Обзор
            </button>
            <button
              onClick={() => setActiveTab('problems')}
              className={clsx(
                "px-8 py-5 rounded-[2.5rem] text-[9px] font-black uppercase tracking-[0.2em] transition-all duration-500 flex items-center gap-3",
                activeTab === 'problems' 
                  ? (isDark ? "bg-indigo-600 text-white shadow-2xl scale-105" : "bg-indigo-500 text-white shadow-xl scale-105")
                  : (isDark ? "text-indigo-400 hover:text-indigo-300" : "text-indigo-500 hover:bg-indigo-50")
              )}
            >
              <CpuChipIcon className="w-4 h-4" />
              Автопилот
            </button>
            <button
              onClick={() => setActiveTab('financial')}
              className={clsx(
                "px-8 py-5 rounded-[2.5rem] text-[9px] font-black uppercase tracking-[0.2em] transition-all duration-500 flex items-center gap-3",
                activeTab === 'financial' 
                  ? (isDark ? "bg-emerald-600 text-white shadow-2xl scale-105" : "bg-emerald-500 text-white shadow-xl scale-105")
                  : (isDark ? "text-emerald-400 hover:text-emerald-300" : "text-emerald-500 hover:bg-emerald-50")
              )}
            >
              <CurrencyDollarIcon className="w-4 h-4" />
              Экономика
            </button>
            <button
              onClick={() => setActiveTab('couriers')}
              className={clsx(
                "px-8 py-5 rounded-[2.5rem] text-[9px] font-black uppercase tracking-[0.2em] transition-all duration-500 flex items-center gap-3",
                activeTab === 'couriers' 
                  ? (isDark ? "bg-blue-600 text-white shadow-2xl scale-105" : "bg-white text-blue-600 shadow-xl scale-105")
                  : (isDark ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900")
              )}
            >
              <UserGroupIcon className="w-4 h-4" />
              Персонал
            </button>
            <button
              onClick={() => setActiveTab('session')}
              className={clsx(
                "px-8 py-5 rounded-[2.5rem] text-[9px] font-black uppercase tracking-[0.2em] transition-all duration-500 flex items-center gap-3",
                activeTab === 'session' 
                  ? (isDark ? "bg-blue-600 text-white shadow-2xl scale-105" : "bg-white text-blue-600 shadow-xl scale-105")
                  : (isDark ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900")
              )}
            >
              <ClockIcon className="w-4 h-4" />
              Сессия
            </button>
          </div>
        </div>
      </div>

      {/* Content Rendering v5.520 */}
      <div className="pb-20 min-h-[60vh]">
        {activeTab === 'overview' && <AdvancedAnalyticsDashboard />}
        {activeTab === 'problems' && <ProblemSolverAnalytics />}
        {activeTab === 'financial' && <FinancialDensityAnalytics />}
        {activeTab === 'couriers' && <CourierDeepAnalytics />}
        {activeTab === 'session' && (
          !excelData?.orders?.length ? (
            <div className={clsx(
              'flex flex-col items-center justify-center p-32 rounded-[5rem] border-4 border-dashed transition-all duration-1000',
              isDark ? 'bg-gray-900/20 border-gray-800 text-gray-500' : 'bg-gray-50 border-gray-100 text-gray-400'
            )}>
              <LoadingSpinner />
              <p className="mt-8 text-2xl font-black uppercase tracking-widest opacity-40 italic">Ожидаем поток данных...</p>
            </div>
          ) : (
            <AnalyticsDashboard />
          )
        )}
      </div>
    </div>
  )
}
