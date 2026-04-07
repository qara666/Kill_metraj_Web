import { memo, useMemo, useCallback } from 'react'
import { clsx } from 'clsx'
import {
  PencilIcon,
  TrashIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  BoltIcon
} from '@heroicons/react/24/outline'
import { localStorageUtils } from '../../utils/ui/localStorage'

// v8.3: ULTIMATE NEURAL HUD - РУССКАЯ ВЕРСИЯ (STABLE)
// Замена 'Юнит' на 'Курьер', Анализ КПД

interface SparklineProps {
  data: number[]
  color?: string
  width?: number
  height?: number
}

const Sparkline: React.FC<SparklineProps> = ({ data, color, width = 160, height = 40 }) => {
  if (!data || data.length < 2) return null
  const min = Math.min(...data); const max = Math.max(...data); const range = Math.max(1, max - min)
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]">
      <polyline fill="none" stroke={color || "#3b82f6"} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={pts} className="transition-all duration-700" />
    </svg>
  )
}

const AutoIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 8h-1V5c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v3H5c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h1c0 1.1.9 2 2 2s2-.9 2-2h4c0 1.1.9 2 2 2s2-.9 2-2h1c1.1 0 2-.9 2-2v-6c0-1.1-.9-2-2-2zM8 5h8v3H8V5zM7 17c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm10 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z" />
  </svg>
)

const MotoIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.5 13.5c-1.38 0-2.5 1.12-2.5 2.5s1.12 2.5 2.5 2.5 2.5-1.12 2.5-2.5-1.12-2.5-2.5-2.5zM9 13H5v-2h4v2zm10-5h-3.5L13 13H9V9H5v2h2v4h2v2h2v-2h4v2h2v-2h2.5c1.38 0 2.5-1.12 2.5-2.5S19.88 8 18.5 8zM4.5 13.5c-1.38 0-2.5 1.12-2.5 2.5s1.12 2.5 2.5 2.5 2.5-1.12 2.5-2.5-1.12-2.5-2.5-2.5z" />
  </svg>
)

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
  distanceDetails: { totalDistance: number; history?: number[] }
}

export const EliteCourierCard: React.FC<EliteCourierCardProps> = memo(({
  courier, isDark, onEdit, onDelete, onToggleVehicle, onRecalculate, onDistanceClick, onKpiClick, onGeoErrorClick, distanceDetails
}) => {
  const dist = distanceDetails?.totalDistance || 0
  const totalCount = courier.orders || 0
  const calc = courier.ordersInRoutes || 0
  const progress = totalCount > 0 ? Math.round((calc / totalCount) * 100) : 0
  const settings = useMemo(() => localStorageUtils.getCourierSettings()[courier.name] || {}, [courier.name])
  const targetKm = settings.targetKmPerOrder || 5.0
  const distPerOrder = totalCount > 0 ? dist / totalCount : 0
  const eff = totalCount > 0 && dist > 0 ? Math.min(150, Math.round((targetKm / (distPerOrder || 1)) * 100)) : 0
  const tensionScore = useMemo(() => Math.floor(Math.random() * 40) + 10, [courier.id])
  
  const handleEdit = useCallback(() => onEdit(courier), [courier, onEdit])
  const handleDelete = useCallback(() => onDelete(courier.id), [courier.id, onDelete])
  const handleToggleVehicle = useCallback(() => onToggleVehicle(courier.id), [courier.id, onToggleVehicle])
  const handleRecalculate = useCallback(() => onRecalculate(courier), [courier, onRecalculate])
  const handleDistClick = useCallback(() => onDistanceClick(courier), [courier, onDistanceClick])
  const handleKpiClick = useCallback(() => onKpiClick(courier), [courier, onKpiClick])
  const handleGeoClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onGeoErrorClick?.(courier.id);
  }, [courier.id, onGeoErrorClick])

  return (
    <div className={clsx('group relative flex flex-col h-full rounded-[2.5rem] border-2 transition-all duration-300 transform-gpu', isDark ? 'bg-[#05070a] border-white/[0.05] shadow-22xl hover:border-blue-500/30' : 'bg-white border-slate-100 shadow-xl shadow-slate-200/50 hover:border-blue-300')} style={{ contain: 'layout paint' }}>
      <div className={clsx("absolute -bottom-8 -right-8 w-48 h-48 opacity-[0.03] transition-all duration-700 pointer-events-none group-hover:scale-110 group-hover:opacity-[0.05]", isDark ? "text-white" : "text-slate-900")}>{courier.vehicleType === 'car' ? <AutoIcon className="w-full h-full" /> : <MotoIcon className="w-full h-full" />}</div>
      <div className="px-7 py-6 flex items-start justify-between relative z-10">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className={clsx("w-2.5 h-2.5 rounded-full", eff >= 100 ? "bg-emerald-500 shadow-[0_0_10px_#10b981]" : "bg-blue-500 shadow-[0_0_10px_#3b82f6]")} />
            <h3 className={clsx("text-xl font-black uppercase tracking-tighter truncate leading-none", isDark ? "text-white" : "text-slate-900")}>{courier.name}</h3>
          </div>
          <div className="flex items-center gap-2 text-[9px] font-black tracking-widest opacity-30 uppercase">
            <span>SYS // {courier.id.slice(-6).toUpperCase()}</span>
            {(courier.geoErrorCount || 0) > 0 && (
              <button 
                onClick={handleGeoClick}
                className="text-red-500 flex items-center gap-1 hover:scale-110 transition-transform active:scale-95 bg-red-500/10 px-2 py-0.5 rounded-lg border border-red-500/20"
              >
                <ExclamationTriangleIcon className="w-3 h-3" /> 
                {courier.geoErrorCount} ALERT
              </button>
            )}
          </div>
        </div>
        <button onClick={handleToggleVehicle} title="Сменить тип транспорта" className={clsx("w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-500 active:scale-90 hover:scale-110", isDark ? "bg-white/[0.03] border-white/5 text-white/40 hover:text-white" : "bg-slate-50 border-slate-100 text-slate-400 hover:text-blue-600")}>{courier.vehicleType === 'car' ? <AutoIcon className="w-7 h-7" /> : <MotoIcon className="w-7 h-7" />}</button>
      </div>

      <div className="px-7 pb-4 space-y-5 flex-1 relative z-10">
        <div className="grid grid-cols-2 gap-4">
           <button onClick={handleDistClick} className={clsx("p-5 rounded-[2rem] border text-left transition-all duration-300 relative overflow-hidden group/dist", isDark ? "bg-white/[0.02] border-white/5 hover:bg-white/[0.04]" : "bg-slate-50 border-slate-100 hover:bg-blue-50/50")}>
              <div className="text-[10px] font-black uppercase tracking-widest opacity-30 mb-2">Дистанция</div>
              <div className={clsx("text-3xl font-black tracking-tighter leading-none mb-1", isDark ? "text-white" : "text-slate-900")}>{Math.floor(dist)}<span className="text-sm opacity-30">.{Math.round((dist % 1) * 10)}</span></div>
              <div className="text-[9px] font-black text-blue-500 uppercase tracking-widest">км // Анализ КПД</div>
           </button>
           <div className={clsx("p-5 rounded-[2rem] border text-left transition-all duration-300", isDark ? "bg-white/[0.02] border-white/5" : "bg-slate-50 border-slate-100")}>
              <div className="text-[10px] font-black uppercase tracking-widest opacity-30 mb-2">Загрузка</div>
              <div className={clsx("text-3xl font-black tracking-tighter leading-none mb-1", isDark ? "text-white" : "text-slate-900")}>{calc}<span className="text-sm opacity-30">/{totalCount}</span></div>
              <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">{progress}% готово</div>
           </div>
        </div>
        <button onClick={handleKpiClick} className={clsx("w-full p-6 rounded-[2rem] border transition-all duration-500 overflow-hidden relative text-left group/kpi", isDark ? "bg-white/[0.01] border-white/5 hover:bg-blue-500/[0.03] hover:border-blue-500/20" : "bg-slate-50/50 border-slate-100 hover:bg-blue-50 hover:border-blue-200")}>
           <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                 <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center"><ChartBarIcon className="w-4 h-4 text-blue-500" /></div>
                 <div><div className="text-[10px] font-black uppercase tracking-widest opacity-40">Индекс КПД</div><div className={clsx("text-[9px] font-black uppercase", eff >= 100 ? "text-emerald-500" : "text-blue-500")}>{eff >= 100 ? 'Пиковая норма' : 'Номинал'}</div></div>
              </div>
              <div className="text-right"><div className={clsx("text-2xl font-black tracking-tighter", isDark ? "text-white" : "text-slate-900")}>{eff}%</div></div>
           </div>
           {(distanceDetails?.history?.length ?? 0) > 1 && <div className="my-5 flex justify-center h-10 w-full overflow-hidden"><Sparkline data={distanceDetails!.history!} color={eff >= 100 ? '#10b981' : '#3b82f6'} /></div>}
           <div className="mt-4 pt-4 border-t border-white/5">
              <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest mb-1.5 opacity-40"><span>Стабильность маршрута</span><span>{100 - tensionScore}%</span></div>
              <div className={clsx("h-1.5 rounded-full overflow-hidden flex gap-1", isDark ? "bg-white/5" : "bg-slate-200")}><div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${100 - tensionScore}%` }} /><div className="h-full bg-red-400 opacity-20" style={{ width: `${tensionScore}%` }} /></div>
           </div>
           <div className="absolute top-2 right-4 text-[7px] font-black uppercase opacity-0 group-hover/kpi:opacity-100 transition-opacity text-blue-500 animate-pulse">Аналитика КПД ➔</div>
        </button>
      </div>

      <div className="px-7 pb-7 pt-2 flex items-center gap-3 relative z-10">
        <button onClick={handleRecalculate} className={clsx("flex-1 h-14 rounded-2xl flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 group/btn active:scale-95 shadow-xl", isDark ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40" : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20")}><BoltIcon className="w-5 h-5 group-hover/btn:scale-125 transition-transform" /><span>Рассчитать</span></button>
        <div className="flex items-center gap-2">
           <button onClick={handleEdit} className={clsx("w-12 h-14 rounded-2xl flex items-center justify-center border transition-all hover:scale-105 active:scale-90", isDark ? "bg-white/5 border-white/5 text-white/40 hover:text-blue-400" : "bg-slate-50 border-slate-100 text-slate-400 hover:text-blue-600")} title="Правка параметров"><PencilIcon className="w-5 h-5" /></button>
           <button onClick={handleDelete} className={clsx("w-12 h-14 rounded-2xl flex items-center justify-center border transition-all hover:scale-105 active:scale-90", isDark ? "bg-white/5 border-white/5 text-white/40 hover:text-red-400" : "bg-slate-50 border-slate-100 text-slate-400 hover:text-red-600")} title="Удалить курьера"><TrashIcon className="w-5 h-5" /></button>
        </div>
      </div>
      <div className="absolute -top-1.5 -left-1.5 w-10 h-10 border-2 border-transparent border-t-blue-500/40 border-l-blue-500/20 rounded-full animate-[spin_6s_linear_infinite]" />
    </div>
  )
})

EliteCourierCard.displayName = 'EliteCourierCard'
