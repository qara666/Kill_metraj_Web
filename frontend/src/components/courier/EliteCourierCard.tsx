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
    <div className={clsx(
      'group relative flex flex-col h-full rounded-[2.5rem] border-2 transition-all duration-500 transform-gpu overflow-hidden',
      isDark 
        ? 'bg-[#0a0c10] border-white/[0.05] shadow-[0_20px_50px_rgba(0,0,0,0.5)] hover:border-blue-500/40 hover:shadow-[0_20px_60px_rgba(59,130,246,0.1)]' 
        : 'bg-white border-slate-100 shadow-[0_15px_35px_rgba(0,0,0,0.03)] hover:border-blue-200 hover:shadow-[0_20px_45px_rgba(0,0,0,0.06)]'
    )} style={{ contain: 'layout paint' }}>
      
      {/* Premium Background Glows */}
      <div className={clsx(
        "absolute -top-24 -left-24 w-64 h-64 rounded-full blur-[80px] opacity-0 group-hover:opacity-10 transition-opacity duration-1000 pointer-events-none",
        isDark ? "bg-blue-500" : "bg-blue-400"
      )} />
      
      {/* Background Vehicle Watermark */}
      <div className={clsx(
        "absolute -bottom-6 -right-6 w-40 h-40 opacity-[0.02] group-hover:opacity-[0.05] group-hover:scale-110 transition-all duration-1000 pointer-events-none",
        isDark ? "text-white" : "text-slate-900"
      )}>
        {courier.vehicleType === 'car' ? <AutoIcon className="w-full h-full" /> : <MotoIcon className="w-full h-full" />}
      </div>

      <div className="px-8 py-7 flex items-start justify-between relative z-10">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-1.5">
            <div className={clsx(
              "w-2.5 h-2.5 rounded-full relative", 
              eff >= 100 ? "bg-emerald-500" : "bg-blue-500"
            )}>
              <div className={clsx(
                "absolute inset-0 rounded-full animate-ping opacity-40",
                eff >= 100 ? "bg-emerald-500" : "bg-blue-500"
              )} />
              <div className={clsx(
                "absolute -inset-1 blur-sm rounded-full opacity-50",
                eff >= 100 ? "bg-emerald-500" : "bg-blue-500"
              )} />
            </div>
            <h3 className={clsx(
              "text-xl font-black uppercase tracking-tight truncate leading-none", 
              isDark ? "text-white" : "text-slate-900"
            )}>{courier.name}</h3>
          </div>
          <div className="flex items-center gap-2.5 text-[9px] font-black tracking-[0.15em] opacity-40 uppercase">
            <span>ID // {courier.id.slice(-6).toUpperCase()}</span>
            {(courier.geoErrorCount || 0) > 0 && (
              <button 
                onClick={handleGeoClick}
                className="text-red-500 flex items-center gap-1.5 hover:scale-105 transition-transform active:scale-95 bg-red-500/10 px-2 py-0.5 rounded-lg border border-red-500/20"
              >
                <ExclamationTriangleIcon className="w-3 h-3" /> 
                {courier.geoErrorCount} ALERT
              </button>
            )}
          </div>
        </div>
        <button 
          onClick={handleToggleVehicle} 
          className={clsx(
            "w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-500 active:scale-90 hover:scale-110 group/veh", 
            isDark 
              ? "bg-white/[0.03] border-white/5 text-white/40 hover:text-blue-400 hover:border-blue-500/30" 
              : "bg-slate-50 border-slate-100 text-slate-400 hover:text-blue-600 hover:border-blue-200"
          )}
        >
          {courier.vehicleType === 'car' ? <AutoIcon className="w-7 h-7" /> : <MotoIcon className="w-7 h-7" />}
        </button>
      </div>

      <div className="px-8 pb-4 flex flex-col gap-4 flex-1 relative z-10">
        <div className="grid grid-cols-2 gap-4 flex-1">
           <button 
              onClick={handleDistClick} 
              className={clsx(
                "p-6 rounded-[2.5rem] border text-left transition-all duration-500 relative overflow-hidden group/dist h-full flex flex-col justify-center backdrop-blur-md", 
                isDark 
                  ? "bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-blue-500/20" 
                  : "bg-slate-50/50 border-slate-100 hover:bg-blue-50/50 hover:border-blue-200"
              )}
           >
              <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-30 mb-2.5">Дистанция</div>
              <div className={clsx(
                "text-4xl font-black tracking-tighter leading-none mb-1.5 transition-transform group-hover/dist:scale-110 origin-left duration-500", 
                isDark ? "text-white" : "text-slate-900"
              )}>
                {Math.floor(dist + (Number(settings.additionalKm) || 0))}
                <span className="text-sm opacity-30">.{Math.round(((dist + (Number(settings.additionalKm) || 0)) % 1) * 10)}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1 text-[9px] font-black uppercase tracking-widest">
                <span className="text-blue-500">км</span>
                {Number(settings.additionalKm) > 0 && (
                   <span className={clsx(
                     "px-2 py-0.5 rounded-lg font-bold", 
                     isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700"
                   )}>
                     +{settings.additionalKm} ДОП
                   </span>
                )}
              </div>
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 blur-2xl opacity-0 group-hover/dist:opacity-100 transition-opacity" />
           </button>
           
           <div className={clsx(
             "p-6 rounded-[2.5rem] border text-left transition-all duration-500 h-full flex flex-col justify-center backdrop-blur-md", 
             isDark 
               ? "bg-white/[0.02] border-white/5" 
               : "bg-slate-50/50 border-slate-100"
           )}>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-30 mb-2.5">Загрузка</div>
              <div className={clsx(
                "text-4xl font-black tracking-tighter leading-none mb-1.5", 
                isDark ? "text-white" : "text-slate-900"
              )}>
                {calc}<span className="text-sm opacity-30">/{totalCount}</span>
              </div>
              <div className={clsx(
                "text-[9px] font-black uppercase tracking-widest flex items-center gap-2",
                progress === 100 ? "text-emerald-500" : "text-blue-500"
              )}>
                <div className={clsx("w-1.5 h-1.5 rounded-full", progress === 100 ? "bg-emerald-500" : "bg-blue-500")} />
                {progress}% готово
              </div>
           </div>
        </div>
      </div>

      <div className="px-8 pb-8 pt-2 flex items-center gap-4 relative z-10">
        <button 
          onClick={handleRecalculate} 
          className={clsx(
            "flex-1 h-16 rounded-[1.5rem] flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-[0.25em] transition-all duration-500 group/btn active:scale-95 shadow-lg", 
            isDark 
              ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20 hover:shadow-emerald-500/40" 
              : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20 hover:shadow-emerald-500/40"
          )}
        >
          <BoltIcon className="w-5 h-5 group-hover/btn:scale-125 transition-transform duration-500" />
          <span>Рассчитать</span>
        </button>
        <div className="flex items-center gap-3">
           <button 
             onClick={handleEdit} 
             className={clsx(
               "w-12 h-16 rounded-[1.5rem] flex items-center justify-center border transition-all duration-500 hover:scale-105 active:scale-90 hover:shadow-lg", 
               isDark 
                 ? "bg-white/5 border-white/5 text-white/40 hover:text-blue-400 hover:border-blue-500/30" 
                 : "bg-slate-50 border-slate-100 text-slate-400 hover:text-blue-600 hover:border-blue-200"
             )}
           >
             <PencilIcon className="w-5 h-5" />
           </button>
           <button 
             onClick={handleDelete} 
             className={clsx(
               "w-12 h-16 rounded-[1.5rem] flex items-center justify-center border transition-all duration-500 hover:scale-105 active:scale-90 hover:shadow-lg", 
               isDark 
                 ? "bg-white/5 border-white/5 text-white/40 hover:text-red-400 hover:border-red-500/30" 
                 : "bg-slate-50 border-slate-100 text-slate-400 hover:text-red-600 hover:border-red-200"
             )}
           >
             <TrashIcon className="w-5 h-5" />
           </button>
        </div>
      </div>
      
      {/* Decorative Corner Element */}
      <div className="absolute top-0 right-0 w-24 h-24 pointer-events-none">
        <div className={clsx(
          "absolute top-0 right-0 w-[2px] h-12 transition-all duration-700 group-hover:h-24",
          isDark ? "bg-gradient-to-b from-blue-500/0 via-blue-500/40 to-blue-500/0" : "bg-gradient-to-b from-blue-400/0 via-blue-400/40 to-blue-400/0"
        )} />
      </div>
    </div>
  )
})

EliteCourierCard.displayName = 'EliteCourierCard'
