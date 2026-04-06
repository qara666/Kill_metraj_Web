import React, { useMemo } from 'react'
import {
  TruckIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  BoltIcon,
  FireIcon
} from '@heroicons/react/24/outline'
import { useExcelData } from '../../contexts/ExcelDataContext'
import { useTheme } from '../../contexts/ThemeContext'
import { clsx } from 'clsx'

export const AnalyticsDashboard: React.FC = () => {
  const { excelData } = useExcelData()
  const { isDark } = useTheme()

  const liveStats = useMemo(() => {
    if (!excelData || !excelData.orders?.length) return null

    const orders = excelData.orders || []
    const couriers = excelData.couriers || []
    const routes = excelData.routes || []

    const totalOrders = orders.length
    const totalAmount = orders.reduce((sum, o) => sum + (parseFloat(o.amount) || 0), 0)
    const successCount = orders.filter(o => o.status === 'Исполнен' || o.status === 'Выполнен' || o.status === 'Доставлен').length
    const successRate = totalOrders > 0 ? ((successCount / totalOrders) * 100).toFixed(1) : 0

    // Efficiency (Orders / Route Distance)
    const totalDist = routes.reduce((sum, r) => sum + (parseFloat(r.totalDistance || r.total_distance) || 0), 0)
    const overallEfficiency = totalDist > 0 ? (totalOrders / totalDist).toFixed(2) : 0

    // Courier metrics for current session
    const courierStats = couriers.map((c: any) => {
        const cOrders = orders.filter(o => {
            const oName = (o.courier || '').toString().trim().toUpperCase()
            const cName = (c.name || '').toString().trim().toUpperCase()
            return oName === cName
        })
        const cRoutes = routes.filter(r => {
            const rName = (r.courier || r.courier_id || r.courierName || '').toString().trim().toUpperCase()
            const cName = (c.name || '').toString().trim().toUpperCase()
            return rName === cName
        })
        const dist = cRoutes.reduce((s, r) => s + (parseFloat(r.totalDistance || r.total_distance) || 0), 0)

        return {
            name: c.name,
            orders: cOrders.length,
            dist: dist.toFixed(1),
            efficiency: dist > 0 ? (cOrders.length / dist).toFixed(2) : 0,
            success: cOrders.filter(o => o.status === 'Исполнен' || o.status === 'Выполнен' || o.status === 'Доставлен').length
        }
    }).sort((a,b) => b.orders - a.orders)

    return {
        totalOrders,
        totalAmount,
        successRate,
        overallEfficiency,
        courierStats: courierStats.slice(0, 10),
        activeCouriers: courierStats.filter(c => c.orders > 0).length,
        dist: totalDist.toFixed(1)
    }
  }, [excelData])

  if (!liveStats) {
    return (
      <div className="flex items-center justify-center h-64 opacity-40">
        <p className="text-xl font-black uppercase tracking-widest">Нет активных данных в сессии...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Session Title & Active Count v5.270 */}
      <div className={clsx(
        "p-10 rounded-[3.5rem] border-2 shadow-2xl flex items-center justify-between",
        isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
      )}>
        <div>
          <h2 className="text-3xl font-black tracking-tighter">Аналитика Живой Сессии</h2>
          <p className="text-xs font-bold opacity-30 uppercase tracking-widest mt-1">Данные текущего дашборда и маршрутов</p>
        </div>
        <div className="flex gap-4">
             <div className="px-6 py-3 bg-blue-500/10 text-blue-500 rounded-2xl font-black text-xs uppercase tracking-widest">
                {liveStats.activeCouriers} Курьеров в поле
             </div>
             <div className="px-6 py-3 bg-emerald-500/10 text-emerald-500 rounded-2xl font-black text-xs uppercase tracking-widest">
                KPI {liveStats.successRate}%
             </div>
        </div>
      </div>

      {/* Main Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {[
            { label: 'Заказы в сессии', val: liveStats.totalOrders, icon: TruckIcon, color: 'text-blue-500', bg: 'bg-blue-500/10' },
            { label: 'Оборот (Сумма)', val: `${liveStats.totalAmount.toLocaleString()} грн`, icon: CurrencyDollarIcon, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
            { label: 'Плотность (КПД)', val: liveStats.overallEfficiency, icon: ArrowTrendingUpIcon, color: 'text-amber-500', bg: 'bg-amber-500/10' },
            { label: 'Пробег сессии', val: `${liveStats.dist} км`, icon: BoltIcon, color: 'text-purple-500', bg: 'bg-purple-500/10' },
        ].map((m, i) => (
            <div key={i} className={clsx(
                "p-8 rounded-[3rem] border-2 shadow-xl flex flex-col items-center group hover:scale-[1.02] transition-all",
                isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
            )}>
                <div className={clsx("p-5 rounded-[1.5rem] mb-4 shadow-inner", m.bg)}><m.icon className={clsx("w-8 h-8", m.color)} /></div>
                <h4 className="text-2xl font-black tabular-nums">{m.val}</h4>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-30 mt-2">{m.label}</p>
            </div>
        ))}
      </div>

      {/* Mini Ranking for Session */}
      <div className={clsx(
        "p-10 rounded-[4rem] border-2 shadow-2xl",
        isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
      )}>
        <div className="flex items-center gap-4 mb-10">
            <FireIcon className="w-8 h-8 text-red-500" />
            <h3 className="text-2xl font-black uppercase italic">Рейтинг за текущую сессию</h3>
        </div>

        <div className="space-y-3">
             {liveStats.courierStats.map((c, i) => (
                <div key={i} className={clsx(
                    "p-4 rounded-3xl flex items-center gap-5 transition-all hover:translate-x-2",
                    isDark ? "bg-white/5 hover:bg-white/10" : "bg-gray-50 hover:bg-white shadow-sm"
                )}>
                    <div className={clsx(
                        "w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs",
                        i === 0 ? "bg-amber-500 text-white" : "bg-gray-500/10 opacity-40"
                    )}>{i + 1}</div>
                    <div className="flex-1">
                        <h4 className="font-black text-sm uppercase tracking-tighter">{c.name}</h4>
                        <div className="flex items-center gap-4 mt-0.5">
                            <span className="text-[9px] font-black uppercase opacity-30">{c.orders} заказов</span>
                            <span className="text-[9px] font-black uppercase opacity-30">{c.dist}км</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-sm font-black text-blue-500">{c.efficiency} <span className="text-[8px] opacity-40 uppercase">зак/км</span></div>
                        <div className="text-[10px] font-black text-emerald-500 mt-0.5">{c.success} OK</div>
                    </div>
                </div>
             ))}
        </div>
      </div>
    </div>
  )
}
