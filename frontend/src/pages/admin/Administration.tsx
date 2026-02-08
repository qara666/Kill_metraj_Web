import React from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { clsx } from 'clsx'
import {
    ShieldCheckIcon,
    TrashIcon,
    ChartBarIcon,
    ServerIcon
} from '@heroicons/react/24/outline'
import { AdminDatabaseCleanup } from '../../components/admin/AdminDatabaseCleanup'
import { FetcherMetrics } from '../../components/admin/FetcherMetrics'
import { CollapsibleSection } from '../../components/shared/CollapsibleSection'

export const Administration: React.FC = () => {
    const { isDark } = useTheme()

    return (
        <div className="p-4 space-y-6 max-w-[1600px] mx-auto min-h-screen">
            {/* Заголовок */}
            <div className={clsx(
                "p-8 rounded-3xl shadow-2xl relative overflow-hidden mb-8 transition-all duration-500",
                isDark
                    ? "bg-gradient-to-br from-gray-900 via-blue-900/40 to-indigo-900/40 border border-blue-500/20 shadow-blue-900/20"
                    : "bg-gradient-to-br from-white via-blue-50/50 to-indigo-50/50 border border-blue-100 shadow-blue-100"
            )}>
                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 p-8 opacity-10">
                    <ServerIcon className="w-32 h-32 text-blue-500" />
                </div>

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2.5 rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-600/20">
                                <ShieldCheckIcon className="w-6 h-6 text-white" />
                            </div>
                            <h1 className={clsx(
                                'text-3xl font-black tracking-tight',
                                isDark ? 'text-white' : 'text-gray-900'
                            )}>
                                Системное администрирование
                            </h1>
                        </div>
                        <p className={clsx(
                            'text-sm font-medium max-w-2xl leading-relaxed',
                            isDark ? 'text-gray-400' : 'text-gray-600'
                        )}>
                            Инструменты обслуживания базы данных и мониторинг производительности системы.
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-8">
                {/* Административные инструменты */}
                <div className={clsx(
                    'rounded-3xl border overflow-hidden transition-all duration-500',
                    isDark
                        ? 'bg-gray-800/50 border-gray-700/50 shadow-2xl shadow-black/20'
                        : 'bg-white border-gray-200 shadow-2xl shadow-blue-100/50'
                )}>
                    <div className="p-6">
                        <CollapsibleSection
                            isDark={isDark}
                            icon={<TrashIcon className="h-5 w-5" />}
                            title="Обслуживание базы данных (Очистка)"
                            defaultOpen={true}
                        >
                            <div className="mt-4">
                                <AdminDatabaseCleanup />
                            </div>
                        </CollapsibleSection>
                    </div>
                </div>

                {/* Метрики Fetcher */}
                <div className={clsx(
                    'rounded-3xl border overflow-hidden transition-all duration-500',
                    isDark
                        ? 'bg-gray-800/50 border-gray-700/50 shadow-2xl shadow-black/20'
                        : 'bg-white border-gray-200 shadow-2xl shadow-blue-100/50'
                )}>
                    <div className="p-6">
                        <CollapsibleSection
                            isDark={isDark}
                            icon={<ChartBarIcon className="h-5 w-5" />}
                            title="Метрики и Мониторинг Fetcher"
                            defaultOpen={true}
                        >
                            <div className="mt-4">
                                <FetcherMetrics />
                            </div>
                        </CollapsibleSection>
                    </div>
                </div>
            </div>
        </div>
    )
}
