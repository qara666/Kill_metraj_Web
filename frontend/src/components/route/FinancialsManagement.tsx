import React, { useState, useMemo, useCallback } from 'react'
import { useExcelData } from '../../contexts/ExcelDataContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { CourierFinancials } from './CourierFinancials'
import { clsx } from 'clsx'
import {
    UserIcon,
    TruckIcon,
    MagnifyingGlassIcon,
    BanknotesIcon
} from '@heroicons/react/24/outline'

export const FinancialsManagement: React.FC = () => {
    const { excelData } = useExcelData()
    const { isDark } = useTheme()
    const { user } = useAuth()
    const [selectedCourier, setSelectedCourier] = useState<string | null>(null)
    const [courierFilter, setCourierFilter] = useState<'all' | 'car' | 'motorcycle'>('all')
    const [searchTerm, setSearchTerm] = useState('')

    // Get unique couriers from orders and courier list
    const couriers = useMemo(() => {
        const names = new Set<string>()
        if (excelData?.orders) {
            excelData.orders.forEach((o: any) => {
                if (o.courier && o.courier !== 'ID:0' && !o.courier.startsWith('ID:0')) {
                    names.add(o.courier)
                }
            })
        }
        if (excelData?.couriers) {
            excelData.couriers.forEach((c: any) => {
                if (c.name) names.add(c.name)
            })
        }
        return Array.from(names).sort((a, b) => a.localeCompare(b, 'ru'))
    }, [excelData])

    const getCourierVehicleType = useCallback((name: string) => {
        if (!excelData?.couriers) return 'car'
        const c = excelData.couriers.find((curr: any) => curr.name === name)
        return c?.vehicleType || 'car'
    }, [excelData])

    const filteredCouriers = useMemo(() => {
        return couriers.filter(name => {
            const type = getCourierVehicleType(name)
            const matchesFilter = courierFilter === 'all' || type === courierFilter
            const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase())
            return matchesFilter && matchesSearch
        })
    }, [couriers, courierFilter, searchTerm, getCourierVehicleType])

    return (
        <div className="flex h-[calc(100vh-120px)] gap-6">
            {/* Sidebar: Courier List */}
            <div className={clsx(
                "w-80 flex flex-col rounded-2xl border-2 overflow-hidden",
                isDark ? "bg-gray-900/50 border-gray-800" : "bg-white border-gray-100 shadow-xl"
            )}>
                <div className="p-4 border-b-2 border-inherit">
                    <div className="flex items-center gap-2 mb-4">
                        <BanknotesIcon className="w-6 h-6 text-blue-500" />
                        <h2 className={clsx("text-lg font-bold", isDark ? "text-white" : "text-gray-900")}>
                            Расчеты
                        </h2>
                    </div>

                    {/* Search */}
                    <div className="relative mb-4">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Поиск курьера..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={clsx(
                                "w-full pl-9 pr-4 py-2 rounded-xl text-sm border-2 focus:ring-0 outline-none transition-all",
                                isDark
                                    ? "bg-gray-800 border-gray-700 text-white focus:border-blue-500"
                                    : "bg-gray-50 border-gray-100 focus:border-blue-400"
                            )}
                        />
                    </div>

                    {/* Filters */}
                    <div className="flex gap-2">
                        {(['all', 'car', 'motorcycle'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setCourierFilter(f)}
                                className={clsx(
                                    "flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                                    courierFilter === f
                                        ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30"
                                        : isDark ? "bg-gray-800 text-gray-400 hover:bg-gray-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                )}
                            >
                                {f === 'all' ? 'Все' : f === 'car' ? 'Авто' : 'Мото'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* List of Couriers */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {filteredCouriers.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-sm text-gray-500">Курьеры не найдены</p>
                        </div>
                    ) : (
                        filteredCouriers.map((name) => {
                            const type = getCourierVehicleType(name)
                            const isSelected = selectedCourier === name
                            return (
                                <button
                                    key={name}
                                    onClick={() => setSelectedCourier(name)}
                                    className={clsx(
                                        "w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all",
                                        isSelected
                                            ? isDark ? "bg-blue-500/10 border-blue-500" : "bg-blue-50 border-blue-500 shadow-md"
                                            : isDark ? "bg-gray-800/50 border-transparent hover:border-gray-700" : "bg-white border-transparent hover:border-blue-200 shadow-sm"
                                    )}
                                >
                                    <div className={clsx(
                                        "p-2 rounded-lg",
                                        isSelected ? "bg-blue-500 text-white" : isDark ? "bg-gray-700 text-gray-400" : "bg-gray-100 text-gray-400"
                                    )}>
                                        {type === 'car' ? <TruckIcon className="w-5 h-5" /> : <UserIcon className="w-5 h-5" />}
                                    </div>
                                    <div className="text-left overflow-hidden">
                                        <p className={clsx("font-bold text-sm truncate", isDark ? "text-white" : "text-gray-900")}>
                                            {name}
                                        </p>
                                        <p className="text-[10px] text-gray-500 uppercase font-black">
                                            {type === 'car' ? 'Автомобиль' : 'Мотоцикл'}
                                        </p>
                                    </div>
                                </button>
                            )
                        })
                    )}
                </div>
            </div>

            {/* Main Content: Financials */}
            <div className="flex-1 overflow-y-auto">
                {selectedCourier ? (
                    <CourierFinancials
                        courierId={selectedCourier}
                        courierName={selectedCourier}
                        divisionId={user?.divisionId || 'all'}
                        isDark={isDark}
                    />
                ) : (
                    <div className={clsx(
                        "h-full flex flex-col items-center justify-center rounded-2xl border-2 border-dashed",
                        isDark ? "bg-gray-900/30 border-gray-800" : "bg-gray-50 border-gray-200"
                    )}>
                        <div className="p-6 rounded-full bg-blue-500/10 mb-4">
                            <BanknotesIcon className="w-12 h-12 text-blue-500 opacity-50" />
                        </div>
                        <h3 className={clsx("text-lg font-bold mb-2", isDark ? "text-white" : "text-gray-900")}>
                            Выберите курьера для просмотра расчетов
                        </h3>
                        <p className="text-sm text-gray-500 max-w-xs text-center">
                            Выберите курьера в списке слева, чтобы увидеть подробную финансовую информацию и закрыть смену
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
