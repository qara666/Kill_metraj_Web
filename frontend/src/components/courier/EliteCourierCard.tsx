import { memo, useCallback, useMemo } from 'react'
import { clsx } from 'clsx'
import {
  PencilIcon,
  TrashIcon,
  BoltIcon,
  ChartBarIcon,
  MapIcon,
  TruckIcon
} from '@heroicons/react/24/outline'

interface Courier {
  id: string
  name: string
  phone: string
  email?: string
  location: string
  isActive: boolean
  vehicleType: 'car' | 'motorcycle'
  orders: number
  ordersInRoutes?: number
  totalDistance: number
  geoErrorCount?: number
}

interface DistanceDetails {
  totalDistance: number
  history?: number[]
  totalOrders?: number
  ordersInRoutes?: number
  baseDistance?: number
  robotDistance?: number
  bonusDistance?: number
  effectivePhysicalKm?: number
}

interface EliteCourierCardProps {
  courier: Courier
  isDark: boolean
  onEdit: (courier: Courier) => void
  onDelete: (id: string) => void
  onToggleVehicle: (id: string) => void
  onRecalculate: (courier: Courier) => void
  onDistanceClick: (courier: Courier) => void
  onKpiClick: (courier: Courier) => void
  onGeoErrorClick?: (id: string) => void
  distanceDetails: DistanceDetails
}

export const EliteCourierCard: React.FC<EliteCourierCardProps> = memo(({
  courier, isDark, onEdit, onDelete, onToggleVehicle, onRecalculate, onDistanceClick, onKpiClick, distanceDetails
}) => {
  const dist = distanceDetails?.totalDistance || 0
  const bonus = distanceDetails?.bonusDistance || 0
  const physical = distanceDetails?.effectivePhysicalKm || dist - bonus
  const totalCount = distanceDetails?.totalOrders || courier.orders || 0
  const processed = distanceDetails?.ordersInRoutes || courier.ordersInRoutes || 0
  const progress = totalCount > 0 ? (processed / totalCount) * 100 : 0
  
  const isCar = courier.vehicleType === 'car'
  const isComplete = processed >= totalCount && totalCount > 0

  return (
    <div 
      className={clsx(
        'group relative w-full h-[440px] rounded-[2.5rem] p-7 transition-all duration-300 border overflow-hidden cursor-pointer flex flex-col font-sans',
        isDark 
          ? 'bg-[#0c0f16] border-white/[0.05] hover:border-blue-500/30' 
          : 'bg-white border-slate-200 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-500/5'
      )}
      onClick={() => onDistanceClick(courier)}
    >
      {/* Header Section */}
      <div className="flex items-start justify-between mb-4 shrink-0">
         <div className="flex flex-col gap-1.5 max-w-[60%]">
            <h3 className={clsx("text-lg font-bold uppercase tracking-tight leading-tight line-clamp-2", isDark ? "text-white" : "text-slate-900")}>
              {courier.name}
            </h3>
            <div className="flex items-center gap-2">
              <div className={clsx("w-3 h-3 rounded-full shadow-sm", isComplete ? "bg-emerald-500" : (courier.isActive ? "bg-blue-500" : "bg-slate-300"))} />
            </div>
         </div>
         <button 
            onClick={(e) => { e.stopPropagation(); onToggleVehicle(courier.id); }}
            className={clsx(
              "px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all active:scale-95 shadow-sm whitespace-nowrap",
              isCar 
                ? (isDark ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-emerald-50 border-emerald-100 text-emerald-600 hover:bg-emerald-100")
                : (isDark ? "bg-orange-500/10 border-orange-500/20 text-orange-400" : "bg-orange-50 border-orange-100 text-orange-600 hover:bg-orange-100")
            )}
         >
            {isCar ? 'Автомобиль' : 'Мотоцикл'}
         </button>
      </div>

      {/* Main Stats Panel */}
      <div className="flex-1 flex flex-col justify-center gap-6 overflow-hidden">
         <div className="flex items-end justify-between">
            <div className="flex flex-col">
               <div className={clsx("text-[11px] font-bold uppercase tracking-widest mb-2", isDark ? "text-slate-400" : "text-slate-500")}>Дистанция</div>
               <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black tracking-tighter leading-none">{Math.floor(dist)}</span>
                  <span className="text-xl font-bold opacity-30 leading-none">.{Math.round((dist % 1) * 10)} км</span>
               </div>
            </div>
            <div className="flex flex-col items-end">
               <div className="text-[11px] font-bold uppercase text-emerald-500 tracking-widest mb-2">Доп.</div>
               <div className="text-2xl font-black text-emerald-600 leading-none">+{bonus.toFixed(1)} км</div>
            </div>
         </div>

         {/* Progress Bar */}
         <div className="space-y-3">
            <div className="flex items-center justify-between">
               <span className={clsx("text-[11px] font-bold uppercase tracking-widest", isDark ? "text-slate-400" : "text-slate-500")}>Прогресс</span>
               <div className={clsx(
                  "px-3 py-1 rounded-lg font-black text-[10px] transition-all shadow-md",
                  isComplete ? "bg-emerald-500 text-white" : "bg-blue-600 text-white"
               )}>
                  {processed} / {totalCount} зак
               </div>
            </div>
            <div className={clsx("h-2 w-full rounded-full overflow-hidden", isDark ? "bg-white/5" : "bg-slate-100 shadow-inner")}>
               <div 
                 className={clsx("h-full transition-all duration-1000 ease-out rounded-full", isComplete ? "bg-emerald-500" : "bg-blue-600")} 
                 style={{ width: `${progress}%` }}
               />
            </div>
         </div>

         {/* Technical Breakdown */}
         <div className="grid grid-cols-2 gap-4">
            <div className={clsx("p-4 rounded-2xl border flex flex-col justify-center", isDark ? "bg-white/[0.02] border-white/5" : "bg-slate-50/50 border-slate-100")}>
               <div className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1">Чистый</div>
               <div className="text-sm font-black text-slate-800">{physical.toFixed(1)} км</div>
            </div>
            <div className={clsx("p-4 rounded-2xl border flex flex-col justify-center", isDark ? "bg-white/[0.02] border-white/5" : "bg-slate-50/50 border-slate-100")}>
               <div className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1">Среднее</div>
               <div className="text-sm font-black text-slate-800">{(dist / (totalCount || 1)).toFixed(1)} км</div>
            </div>
         </div>
      </div>

      {/* Footer Actions - ABSOLUTE FIX FOR VISIBILITY */}
      <div className="mt-auto pt-6 border-t border-slate-100 flex items-center justify-between gap-4 shrink-0">
         <div className="flex gap-2">
           <button onClick={(e) => { e.stopPropagation(); onEdit(courier); }} className="p-3 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 transition-all active:scale-90 shadow-sm" title="Редактировать">
              <PencilIcon className="w-5 h-5 text-slate-400" />
           </button>
           <button onClick={(e) => { e.stopPropagation(); onDelete(courier.id); }} className="p-3 rounded-xl border border-slate-100 bg-white hover:bg-rose-50 hover:border-rose-100 group/del transition-all active:scale-90 shadow-sm" title="Удалить">
              <TrashIcon className="w-5 h-5 text-slate-400 group-hover/del:text-rose-500" />
           </button>
         </div>
         <button 
           onClick={(e) => { e.stopPropagation(); onRecalculate(courier); }}
           className={clsx(
              "flex-1 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 shadow-xl",
              isComplete ? "bg-emerald-600 text-white shadow-emerald-500/20" : "bg-blue-600 text-white shadow-blue-500/20"
           )}
         >
            <BoltIcon className="w-4 h-4" />
            Рассчитать
         </button>
      </div>
    </div>
  )
})

EliteCourierCard.displayName = 'EliteCourierCard'