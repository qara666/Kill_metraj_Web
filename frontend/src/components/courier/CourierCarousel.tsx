import React, { memo, useRef } from 'react'
import { clsx } from 'clsx'
import {
  BoltIcon,
  ChartBarIcon,
  PencilIcon,
  TrashIcon,
  TruckIcon
} from '@heroicons/react/24/outline'

type Courier = any

export interface DistanceDetails {
  totalDistance: number
  history?: number[]
  totalOrders?: number
  ordersInRoutes?: number
  baseDistance?: number
  robotDistance?: number
  bonusDistance?: number
  effectivePhysicalKm?: number
}

interface CourierCarouselProps {
  couriers: Courier[]
  isDark: boolean
  distanceForCourier?: (c: Courier) => DistanceDetails
  onEdit: (courier: Courier) => void
  onDelete: (id: string) => void
  onToggleVehicle: (id: string) => void
  onDistanceClick: (courier: Courier) => void
  onKpiClick: (courier: Courier) => void
  onGeoErrorClick?: (id: string) => void
}

const Sparkline: React.FC<{ data: number[]; color?: string; width?: number; height?: number }> = ({ data, color = '#3b82f6', width = 120, height = 28 }) => {
  if (!data || data.length < 2) return null
  const min = Math.min(...data); const max = Math.max(...data); const range = Math.max(1, max - min)
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="sparkline" className="overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth={2} points={pts} />
    </svg>
  )
}

export const CourierCarousel: React.FC<CourierCarouselProps> = memo(({ couriers, isDark, distanceForCourier, onEdit, onDelete, onToggleVehicle, onDistanceClick, onKpiClick, onGeoErrorClick }) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const getDetails = (c: Courier) => distanceForCourier?.(c) ?? ({} as DistanceDetails)
  const scrollBy = (delta: number) => containerRef.current?.scrollBy({ left: delta, behavior: 'smooth' })

  return (
    <div className="relative" aria-label="courier-carousel-wrapper">
      <button aria-label="Prev" onClick={() => scrollBy(-320)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/70 rounded-full p-2">‹</button>
      <button aria-label="Next" onClick={() => scrollBy(320)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/70 rounded-full p-2">›</button>
      <div ref={containerRef} style={{ display: 'flex', overflowX: 'auto', gap: 16, padding: '8px 40px', scrollbarWidth: 'none' }} aria-label="courier-carousel">
        {couriers.map((c) => {
          const d = getDetails(c)
          const dist = d.totalDistance ?? 0
          const orders = d.totalOrders ?? c.orders
          const progress = (d.ordersInRoutes ?? c.ordersInRoutes ?? 0) / (orders || 1) * 100
          return (
            <div key={c.id} style={{ minWidth: 300 }} className={clsx('flex-none rounded-xl border bg-white/90', isDark && 'bg-[#0f1115] border-white/20')}>
              <div className="p-3 flex items-center justify-between border-b">
                <div className="flex items-center gap-2">
                  <span className={clsx('w-2 h-2 rounded-full', c.isActive ? 'bg-emerald-500' : 'bg-slate-400')}></span>
                  <span className={clsx('text-sm font-bold', isDark ? 'text-white' : 'text-slate-900')}>{c.name}</span>
                </div>
                <span className={clsx('px-2 py-0.5 text-xs rounded', isDark ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-700')}>{c.vehicleType === 'car' ? 'АВТО' : 'МОТО'}</span>
              </div>
              <div className="p-3 grid grid-cols-3 gap-2 border-b">
                <div className={clsx('rounded-lg p-2 flex flex-col items-center justify-center', isDark ? 'bg-white/5' : 'bg-slate-50')}>
                  <div className={clsx('text-[9px] font-semibold', isDark ? 'text-white/70' : 'text-slate-700')}>Дистанция</div>
                  <div className={clsx('text-lg font-bold', isDark ? 'text-white' : 'text-slate-900')}>
                    {Math.floor(dist || 0)}<span className="text-sm opacity-60">.{Math.round(((dist || 0) % 1) * 10)}</span>
                  </div>
                  {d.history?.length ? (
                    <div className="mt-1"><Sparkline data={d.history} width={120} height={28} /></div>
                  ) : null}
                </div>
                <div className={clsx('rounded-lg p-2 flex flex-col items-center justify-center', isDark ? 'bg-white/5' : 'bg-slate-50')}>
                  <div className={clsx('text-[9px] font-semibold', isDark ? 'text-white/70' : 'text-slate-700')}>Заказов</div>
                  <div className={clsx('text-lg', isDark ? 'text-white' : 'text-slate-900')}>{orders}</div>
                </div>
                <div className={clsx('rounded-lg p-2 flex flex-col items-center justify-center', isDark ? 'bg-white/5' : 'bg-slate-50')}>
                  <div className={clsx('text-[9px] font-semibold', isDark ? 'text-white/70' : 'text-slate-700')}>Прогресс</div>
                  <div className={clsx('text-sm font-bold', isDark ? 'text-white' : 'text-slate-900')}>{Math.max(0, Math.min(100, progress))}%</div>
                </div>
              </div>
              <div className="h-1 w-full bg-slate-200 rounded-full mb-2 overflow-hidden">
                <div className={clsx('h-full', progress >= 100 ? 'bg-emerald-500' : 'bg-blue-500')} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
              </div>
              <div className="p-3 flex items-center justify-between border-t">
                <button className="flex-1 h-9 rounded-lg border border-slate-200 text-xs font-semibold flex items-center justify-center" onClick={() => onDistanceClick(c)}>
                  <BoltIcon className="w-4 h-4 mr-1" /> Рассчитать
                </button>
                <button className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center" onClick={() => onKpiClick(c)}>
                  <ChartBarIcon className="w-4 h-4" />
                </button>
                <button className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center" onClick={() => onEdit(c)}>
                  <PencilIcon className="w-4 h-4" />
                </button>
                <button className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center" onClick={() => onDelete(c.id)}>
                  <TrashIcon className="w-4 h-4" />
                </button>
                <button className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center" onClick={() => onToggleVehicle(c.id)}>
                  <TruckIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
});

export default CourierCarousel
