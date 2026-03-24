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
    BanknotesIcon,
    ChevronLeftIcon
} from '@heroicons/react/24/outline'
import { asNonEmptyString, isId0CourierName } from '../../utils/data/courierName'
import { isOrderCompleted } from '../../utils/data/orderStatus'
import {
    Bars3BottomRightIcon,
    BarsArrowDownIcon,
    BarsArrowUpIcon,
    CurrencyDollarIcon,
    FunnelIcon
} from '@heroicons/react/20/solid'

export const FinancialsManagement: React.FC = () => {
    const { excelData } = useExcelData()
    const { isDark } = useTheme()
    const { user } = useAuth()
    const [selectedCourier, setSelectedCourier] = useState<string | null>(null)
    const [courierFilter, setCourierFilter] = useState<'all' | 'car' | 'motorcycle'>('all')
    const [searchTerm, setSearchTerm] = useState('')
    const [sortOrder, setSortOrder] = useState<'name-asc' | 'name-desc' | 'debt-desc'>('name-asc')
    const [debtFilter, setDebtFilter] = useState<'all' | 'has-debt' | 'no-debt'>('all')

    // Helper to calculate debt for all couriers
    const courierStats = useMemo(() => {
        const stats: Record<string, { debt: number; totalOrders: number }> = {}
        if (!excelData?.orders) return stats

        excelData.orders.forEach((o: any) => {
            const name = asNonEmptyString(o?.courier)
            if (!name || isId0CourierName(name)) return

            if (!stats[name]) stats[name] = { debt: 0, totalOrders: 0 }
            stats[name].totalOrders++

            const isComp = isOrderCompleted(o.status)
            const isSettled = !!o.settledDate
            const pMethod = String(o.paymentMethod || '').toLowerCase()

            const isRefused = pMethod.includes('отказ')
            const isCash = !isRefused && (
                pMethod.includes('готівка') || 
                pMethod.includes('наличные') || 
                pMethod.includes('налич') || 
                pMethod === 'cash' || 
                pMethod === ''
            ) && !pMethod.includes('безготів')

            if (isComp && !isSettled && isCash) {
                stats[name].debt += (Number(o.amount) || 0)
            }
        })
        return stats
    }, [excelData])

    // Get unique couriers from orders and courier list
    const couriers = useMemo(() => {
        const names = new Set<string>()
        if (excelData?.orders) {
            excelData.orders.forEach((o: any) => {
                const courierName = asNonEmptyString(o?.courier)
                if (courierName && !isId0CourierName(courierName)) {
                    names.add(courierName)
                }
            })
        }
        if (excelData?.couriers) {
            excelData.couriers.forEach((c: any) => {
                const courierName = asNonEmptyString(c?.name)
                if (courierName) names.add(courierName)
            })
        }

        let courierList = Array.from(names)

        // Apply Sorting
        return courierList.sort((a, b) => {
            if (sortOrder === 'name-asc') return a.localeCompare(b, 'ru')
            if (sortOrder === 'name-desc') return b.localeCompare(a, 'ru')
            if (sortOrder === 'debt-desc') {
                const debtA = courierStats[a]?.debt || 0
                const debtB = courierStats[b]?.debt || 0
                if (debtB !== debtA) return debtB - debtA
                return a.localeCompare(b, 'ru')
            }
            return 0
        })
    }, [excelData, sortOrder, courierStats])

    const getCourierVehicleType = useCallback((name: string) => {
        if (!excelData?.couriers) return 'car'
        const c = excelData.couriers.find((curr: any) => curr.name === name)
        return c?.vehicleType || 'car'
    }, [excelData])

    const filteredCouriers = useMemo(() => {
        return couriers.filter(name => {
            const type = getCourierVehicleType(name)
            const debt = courierStats[name]?.debt || 0
            
            const matchesType = courierFilter === 'all' || type === courierFilter
            const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase())
            
            let matchesDebt = true
            if (debtFilter === 'has-debt') matchesDebt = debt > 0
            if (debtFilter === 'no-debt') matchesDebt = debt === 0
            
            return matchesType && matchesSearch && matchesDebt
        })
    }, [couriers, courierFilter, searchTerm, debtFilter, getCourierVehicleType, courierStats])

    return (
        <div className="flex flex-col md:flex-row h-[calc(100vh-120px)] md:gap-6 gap-0 relative">
            {/* Sidebar: Courier List */}
            <div className={clsx(
                "w-full md:w-96 flex-col rounded-[32px] border-2 overflow-hidden transition-all duration-300",
                isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100 shadow-xl shadow-slate-200/50",
                selectedCourier ? "hidden md:flex" : "flex h-full"
            )}>
                <div className="p-6 border-b-2 border-inherit">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <BanknotesIcon className="w-6 h-6 text-blue-500" />
                            <h2 className={clsx("text-xl font-black tracking-tight", isDark ? "text-white" : "text-gray-900")}>
                                Расчеты
                            </h2>
                        </div>
                        <div className="flex items-center gap-1">
                            <button 
                                onClick={() => setSortOrder(prev => prev === 'name-asc' ? 'name-desc' : 'name-asc')}
                                title="Сортировка по имени"
                                className={clsx(
                                    "p-2 rounded-lg transition-all",
                                    sortOrder.startsWith('name') ? "bg-blue-500/10 text-blue-500" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                                )}
                            >
                                {sortOrder === 'name-desc' ? <BarsArrowUpIcon className="w-5 h-5" /> : <BarsArrowDownIcon className="w-5 h-5" />}
                            </button>
                            <button 
                                onClick={() => setSortOrder('debt-desc')}
                                title="Сначала должники"
                                className={clsx(
                                    "p-2 rounded-lg transition-all",
                                    sortOrder === 'debt-desc' ? "bg-amber-500/10 text-amber-500" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                                )}
                            >
                                <Bars3BottomRightIcon className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="relative mb-6">
                        <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Поиск по имени..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={clsx(
                                "w-full pl-11 pr-4 py-3 rounded-2xl text-sm border-2 font-bold focus:ring-0 outline-none transition-all",
                                isDark
                                    ? "bg-gray-800 border-gray-700 text-white focus:border-blue-500"
                                    : "bg-gray-100 border-gray-100 focus:bg-white focus:border-blue-400"
                            )}
                        />
                    </div>

                    {/* Filters Tabs */}
                    <div className="space-y-4">
                        <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
                            {(['all', 'car', 'motorcycle'] as const).map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setCourierFilter(f)}
                                    className={clsx(
                                        "flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                                        courierFilter === f
                                            ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm"
                                            : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    )}
                                >
                                    {f === 'all' ? 'Все' : f === 'car' ? 'Авто' : 'Мото'}
                                </button>
                            ))}
                        </div>
                        
                        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                            {(['has-debt', 'no-debt'] as const).map((df) => (
                                <button
                                    key={df}
                                    onClick={() => setDebtFilter(prev => prev === df ? 'all' : df)}
                                    className={clsx(
                                        "whitespace-nowrap px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all",
                                        debtFilter === df
                                            ? "bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/20"
                                            : isDark ? "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600" : "bg-white border-gray-100 text-gray-500 hover:border-blue-100"
                                    )}
                                >
                                    {df === 'has-debt' ? 'С долгом' : 'Без долга'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* List of Couriers */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {filteredCouriers.length === 0 ? (
                        <div className="text-center py-12">
                            <FunnelIcon className="w-10 h-10 text-gray-300 mx-auto mb-3 opacity-20" />
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Никого не найдено</p>
                        </div>
                    ) : (
                        filteredCouriers.map((name) => {
                            const type = getCourierVehicleType(name)
                            const isSelected = selectedCourier === name
                            const debt = courierStats[name]?.debt || 0
                            return (
                                <button
                                    key={name}
                                    onClick={() => setSelectedCourier(name)}
                                    className={clsx(
                                        "w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all group",
                                        isSelected
                                            ? isDark ? "bg-blue-500/10 border-blue-500" : "bg-blue-50 border-blue-500 shadow-md translate-x-1"
                                            : isDark ? "bg-gray-800/40 border-transparent hover:border-gray-700" : "bg-white border-transparent hover:border-blue-100 shadow-sm"
                                    )}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={clsx(
                                            "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                                            isSelected ? "bg-blue-500 text-white" : isDark ? "bg-gray-700 text-gray-500 group-hover:bg-gray-600" : "bg-gray-100 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500"
                                        )}>
                                            {type === 'car' ? <TruckIcon className="w-5 h-5" /> : <UserIcon className="w-5 h-5" />}
                                        </div>
                                        <div className="text-left">
                                            <p className={clsx("font-black text-sm tracking-tight", isDark ? "text-white" : "text-slate-900")}>
                                                {name}
                                            </p>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                                                {type === 'car' ? 'Автомобиль' : 'Мотоцикл'}
                                            </p>
                                        </div>
                                    </div>

                                    {debt > 0 && (
                                        <div className={clsx(
                                            "px-3 py-1.5 rounded-lg flex items-center gap-1.5",
                                            isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-600"
                                        )}>
                                            <CurrencyDollarIcon className="w-3.5 h-3.5" />
                                            <span className="text-xs font-black tabular-nums">{Math.round(debt).toLocaleString()} ₴</span>
                                        </div>
                                    )}
                                </button>
                            )
                        })
                    )}
                </div>
            </div>

            {/* Main Content: Financials */}
            <div className={clsx(
                "flex-1 overflow-y-auto w-full h-full",
                !selectedCourier ? "hidden md:block" : "block"
            )}>
                {selectedCourier ? (
                    <div className="h-full flex flex-col">
                        <button
                            onClick={() => setSelectedCourier(null)}
                            className={clsx(
                                "md:hidden mb-4 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all w-full",
                                isDark ? "bg-gray-800 text-white hover:bg-gray-700" : "bg-white text-gray-700 hover:bg-gray-50 shadow-sm border"
                            )}
                        >
                            <ChevronLeftIcon className="w-4 h-4" />
                            <span>Назад к списку</span>
                        </button>

                        <CourierFinancials
                            courierId={selectedCourier}
                            courierName={selectedCourier}
                            divisionId={user?.divisionId || 'all'}
                            isDark={isDark}
                        />
                    </div>
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
                            Выберите курьера в списке слева, чтобы увидеть подробно сколько кур должен и финотчет по заказам которые доставлял
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}