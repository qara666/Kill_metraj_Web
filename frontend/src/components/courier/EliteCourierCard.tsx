import { memo, useCallback, useMemo, useState, useRef, useEffect } from 'react'
import { clsx } from 'clsx'
import {
  PencilIcon,
  TrashIcon,
  BoltIcon,
  ChartBarIcon,
  MapIcon,
  TruckIcon,
  PencilSquareIcon,
  ExclamationTriangleIcon,
  MapPinIcon,
  ChevronDownIcon,
  ServerIcon,
  ComputerDesktopIcon,
} from '@heroicons/react/24/outline'
import { useRouteCalculationStore } from '../../stores/useRouteCalculationStore'

interface GeoErrorOrder {
  orderNumber: string
  address: string
  errorType?: 'kml_rejected' | 'not_found'
  reason?: string
  kmlRejectedCoords?: { lat: number; lng: number } | null
}

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
  geoErrorOrders?: GeoErrorOrder[]
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
  onRecalculateFrontend?: (courier: Courier) => void
  onDistanceClick: (courier: Courier) => void
  onKpiClick: (courier: Courier) => void
  onGeoErrorClick?: (id: string) => void
  distanceDetails: DistanceDetails
  uncalculatedOrders?: Array<{
    orderNumber: string
    address: string
    errorType?: string
    reason?: string
  }>
}

// Тултип — отображается выше или ниже значка в зависимости от доступного пространства
function GeoErrorTooltip({
  errors,
  isDark,
}: {
  errors: GeoErrorOrder[]
  isDark: boolean
}) {
  const list = errors.slice(0, 8) // лимит 8 в тултипе
  const hasMore = errors.length > 8
  return (
    <div
      className={clsx(
        'absolute right-0 bottom-full mb-2 z-50 w-72 rounded-2xl border shadow-2xl p-4 text-left',
        isDark
          ? 'bg-[#11151e] border-amber-500/30 shadow-amber-900/40'
          : 'bg-white border-amber-200 shadow-amber-100/80'
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={clsx('text-[11px] font-black uppercase tracking-widest mb-3', isDark ? 'text-amber-400' : 'text-amber-600')}>
         Ошибки геокодирования ({errors.length})
      </div>
      <ul className="space-y-2">
        {list.map((e, i) => (
          <li key={i} className={clsx('flex flex-col gap-0.5 pb-2 border-b last:border-b-0', isDark ? 'border-white/5' : 'border-slate-100')}>
            <div className="flex items-center gap-1.5">
              {e.errorType === 'kml_rejected' ? (
                <MapPinIcon className="w-3 h-3 shrink-0 text-orange-400" />
              ) : (
                <ExclamationTriangleIcon className="w-3 h-3 shrink-0 text-red-400" />
              )}
              <span className={clsx('text-[10px] font-bold truncate', isDark ? 'text-white/80' : 'text-slate-700')}>
                {e.orderNumber || '—'}
              </span>
              <span className={clsx(
                'ml-auto shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black uppercase',
                e.errorType === 'kml_rejected'
                  ? 'bg-orange-500/10 text-orange-500'
                  : 'bg-red-500/10 text-red-500'
              )}>
                {e.errorType === 'kml_rejected' ? 'Вне зоны' : 'Не найден'}
              </span>
            </div>
            <span className={clsx('text-[10px] truncate pl-4.5', isDark ? 'text-slate-400' : 'text-slate-500')}>
              {e.address}
            </span>
          </li>
        ))}
      </ul>
      {hasMore && (
        <div className={clsx('mt-2 text-[10px] font-bold', isDark ? 'text-slate-500' : 'text-slate-400')}>
          + ещё {errors.length - 8} адресов...
        </div>
      )}
    </div>
  )
}

export const EliteCourierCard: React.FC<EliteCourierCardProps> = memo(({
  courier, isDark, onEdit, onDelete, onToggleVehicle, onRecalculate, onRecalculateFrontend, onDistanceClick, onKpiClick, onGeoErrorClick, distanceDetails, uncalculatedOrders
}) => {
  const getModified = useRouteCalculationStore((s) => s.getModified);
  const modifiedAt = getModified(courier.name);
  const isManuallyModified = modifiedAt && (Date.now() - modifiedAt < 15 * 60 * 1000);

  const [showGeoTooltip, setShowGeoTooltip] = useState(false)
  const [showCalcMenu, setShowCalcMenu] = useState(false)
  const calcMenuRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Закрываем тултип при клике вне его области
  useEffect(() => {
    if (!showGeoTooltip) return
    const handler = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setShowGeoTooltip(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showGeoTooltip])

  useEffect(() => {
    if (!showCalcMenu) return
    const handler = (e: MouseEvent) => {
      if (calcMenuRef.current && !calcMenuRef.current.contains(e.target as Node)) {
        setShowCalcMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCalcMenu])

  const dist = distanceDetails?.totalDistance || 0
  const bonus = distanceDetails?.bonusDistance || 0
  const physical = distanceDetails?.effectivePhysicalKm || dist - bonus
  const totalCount = distanceDetails?.totalOrders || courier.orders || 0
  const processed = distanceDetails?.ordersInRoutes || courier.ordersInRoutes || 0
  const progress = totalCount > 0 ? (processed / totalCount) * 100 : 0
  
  const isCar = courier.vehicleType === 'car'
  const isComplete = processed >= totalCount && totalCount > 0

  // v40: Данные гео-ошибок из Pass 4 бэкенда
  const geoErrors: GeoErrorOrder[] = courier.geoErrorOrders || []
  const geoErrorCount = geoErrors.length || courier.geoErrorCount || 0
  const hasGeoErrors = geoErrorCount > 0

  // v41: Нерассчитанные заказы (без координат, без маршрута)
  const uncOrders = uncalculatedOrders || []
  const uncCount = uncOrders.length
  const hasUncalculated = uncCount > 0

  return (
    <div 
      className={clsx(
        'group relative w-full h-[440px] rounded-[2.5rem] p-7 border overflow-hidden cursor-pointer flex flex-col font-sans',
        isDark 
          ? 'bg-[#0c0f16] border-white/[0.05] hover:border-blue-500/30' 
          : 'bg-white border-slate-200 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-500/5'
      )}
      onClick={() => onDistanceClick(courier)}
    >
      {/* Секция шапки */}
      <div className="flex items-start justify-between mb-4 shrink-0">
         <div className="flex flex-col gap-1.5 max-w-[60%]">
            <h3 className={clsx("text-lg font-bold uppercase tracking-tight leading-tight line-clamp-2", isDark ? "text-white" : "text-slate-900")}>
              {courier.name}
            </h3>
            <div className="flex items-center gap-2">
              <div className={clsx("w-3 h-3 rounded-full shadow-sm", isComplete ? "bg-emerald-500" : (courier.isActive ? "bg-blue-500" : "bg-slate-300"))} />
            </div>
</div>
          <div className="flex flex-col items-end gap-2">
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
            {isManuallyModified && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 shadow-sm">
                <PencilSquareIcon className="w-3 h-3 text-amber-500" />
                <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest whitespace-nowrap">Ручное изменение</span>
              </div>
            )}
          </div>
       </div>

      {/* Панель основной статистики */}
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

           {/* Полоса прогресса */}
          <div className="space-y-3">
             <div className="flex items-center justify-between">
                <span className={clsx("text-[11px] font-bold uppercase tracking-widest", isDark ? "text-slate-400" : "text-slate-500")}>Прогресс</span>
                <div className={clsx(
                   "px-3 py-1 rounded-lg font-black text-[10px] transition-all shadow-md",
                   isComplete ? "bg-emerald-500 text-white" : (hasUncalculated ? "bg-amber-500 text-white" : "bg-blue-600 text-white")
                )}>
                   {processed}{hasUncalculated ? ` (+${uncCount})` : ''} / {totalCount} зак
                </div>
             </div>
             {hasUncalculated && (
               <div className={clsx("text-[9px] font-bold px-2 py-1 rounded-lg", isDark ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-amber-50 text-amber-600 border border-amber-200")}>
                  {uncCount} без маршрута
               </div>
             )}
            <div className={clsx("h-2 w-full rounded-full overflow-hidden", isDark ? "bg-white/5" : "bg-slate-100 shadow-inner")}>
               <div 
                 className={clsx("h-full transition-all duration-1000 ease-out rounded-full", isComplete ? "bg-emerald-500" : "bg-blue-600")} 
                 style={{ width: `${progress}%` }}
               />
            </div>
         </div>

          {/* Техническая разбивка */}
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

      {/* Действия в подвале */}
      <div className="mt-auto pt-6 border-t border-slate-100 flex items-center justify-between gap-4 shrink-0">
         <div className="flex gap-2">
           <button onClick={(e) => { e.stopPropagation(); onEdit(courier); }} className="p-3 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 transition-all active:scale-90 shadow-sm" title="Редактировать">
              <PencilIcon className="w-5 h-5 text-slate-400" />
           </button>
           <button onClick={(e) => { e.stopPropagation(); onDelete(courier.id); }} className="p-3 rounded-xl border border-slate-100 bg-white hover:bg-rose-50 hover:border-rose-100 group/del transition-all active:scale-90 shadow-sm" title="Удалить">
              <TrashIcon className="w-5 h-5 text-slate-400 group-hover/del:text-rose-500" />
           </button>
         </div>
          <div 
            ref={calcMenuRef}
            className="relative flex-1"
          >
            <button 
              onClick={(e) => { e.stopPropagation(); setShowCalcMenu(v => !v); }}
              className={clsx(
                 "w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 shadow-xl",
                 isComplete ? "bg-emerald-600 text-white shadow-emerald-500/20" : "bg-blue-600 text-white shadow-blue-500/20"
              )}
            >
               <BoltIcon className="w-4 h-4" />
               Рассчитать
               <ChevronDownIcon className="w-3.5 h-3.5 opacity-60" />
            </button>
            {showCalcMenu && (
              <div className={clsx(
                "absolute bottom-full left-0 right-0 mb-2 rounded-2xl border shadow-2xl overflow-hidden z-50",
                isDark ? "bg-[#11151e] border-white/10" : "bg-white border-slate-200"
              )}>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowCalcMenu(false); onRecalculate(courier); }}
                  className={clsx(
                    "w-full flex items-center gap-3 px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest transition-colors",
                    isDark ? "hover:bg-white/5 text-white" : "hover:bg-slate-50 text-slate-800"
                  )}
                >
                  <ServerIcon className="w-4 h-4 text-blue-400 shrink-0" />
                  <div>
                    <div>Фоновый расчёт</div>
                    <div className={clsx("text-[9px] font-normal normal-case tracking-normal opacity-50 mt-0.5")}>Turbo Robot на сервере</div>
                  </div>
                </button>
                {onRecalculateFrontend && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowCalcMenu(false); onRecalculateFrontend(courier); }}
                    className={clsx(
                      "w-full flex items-center gap-3 px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest transition-colors border-t",
                      isDark ? "hover:bg-white/5 text-white border-white/5" : "hover:bg-slate-50 text-slate-800 border-slate-100"
                    )}
                  >
                    <ComputerDesktopIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <div>Фронтенд расчёт</div>
                      <div className={clsx("text-[9px] font-normal normal-case tracking-normal opacity-50 mt-0.5")}>Быстрый расчёт в браузере</div>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
      </div>

      {/* v40: Пульсирующий значок гео-ошибки — верхний правый угол, только при наличии ошибок */}
      {hasGeoErrors && (
        <div
          ref={tooltipRef}
          className="absolute top-4 left-4 z-10"
          onClick={(e) => {
            e.stopPropagation()
            setShowGeoTooltip((v) => !v)
            onGeoErrorClick?.(courier.id)
          }}
        >
          {/* Значок */}
          <div className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500 shadow-lg shadow-amber-500/40 cursor-pointer active:scale-95 transition-all">
            {/* Пульсирующее кольцо */}
            <span className="absolute inset-0 rounded-xl bg-amber-400 animate-ping opacity-40 pointer-events-none" />
            <ExclamationTriangleIcon className="w-3.5 h-3.5 text-white relative z-10" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest relative z-10 whitespace-nowrap">
              {geoErrorCount} ошибок
            </span>
          </div>

          {/* Тултип */}
          {showGeoTooltip && geoErrors.length > 0 && (
            <GeoErrorTooltip errors={geoErrors} isDark={isDark} />
          )}
        </div>
      )}
    </div>
  )
})

EliteCourierCard.displayName = 'EliteCourierCard'