import React, { useMemo } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { useExcelData } from '../../contexts/ExcelDataContext'
import { useDashboardStore } from '../../stores/useDashboardStore'
import { isId0CourierName } from '../../utils/data/courierName'
import { 
  TruckIcon, 
  PaperAirplaneIcon, 
  ShoppingBagIcon, 
  XCircleIcon,
  CheckBadgeIcon,
  BanknotesIcon,
  CreditCardIcon,
  ChartPieIcon,
  MapIcon
} from '@heroicons/react/24/solid'

const MopedIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="5" cy="18" r="3" fill="currentColor" fillOpacity="0.15" />
    <circle cx="19" cy="18" r="3" fill="currentColor" fillOpacity="0.15" />
    <path d="M19 18V13h-4l-3-5H8L5 13H3" />
    <path d="M8 13.5h7l1 4.5" />
    <path d="M15 8h3" />
  </svg>
)

const fmt   = (v: number) => v.toLocaleString('ru-RU')
const money = (v: number) => v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct   = (a: number, b: number) => b > 0 ? ((a / b) * 100).toFixed(1) : '0.0'

const getAmount = (o: any): number => {
  const raw = o?.effectiveAmount ?? o?.amount ?? o?.totalAmount ?? o?.sum ?? o?.summa ??
    o?.raw?.amount ?? o?.raw?.sum ?? o?.raw?.totalSum ?? o?.raw?.сума ?? o?.raw?.сумма ?? o?.raw?.price ?? null
  if (raw == null) return 0
  const n = Number(raw)
  return isNaN(n) ? 0 : n
}
const getPayMethod = (o: any): string => {
  let raw = o?.paymentMethod || o?.payment_method || o?.raw?.paymentMethod || o?.raw?.payment_method || o?.оплата || ''
  raw = String(raw).trim()
  if (!raw) return 'Не указано'
  return raw
}

const isRefusal = (o: any) => { const s = String(o?.status || o?.state || '').toLowerCase(); return s.includes('відмов') || s.includes('отказ') || s.includes('cancel') }
const isPickup  = (o: any) => { const t = String(o?.orderType || o?.order_type || o?.type || o?.raw?.orderType || '').toLowerCase(); return t.includes('самовив') || t.includes('pickup') || t.includes('самовывоз') }
const isTaxi    = (o: any) => String(o?.courier || o?.courierName || '').toLowerCase().includes('такс')
const getVehicle = (o: any): 'car' | 'foot' => { const v = String(o?.vehicleType || '').toLowerCase(); return ['foot','motorcycle','bike','pedestrian'].includes(v) ? 'foot' : 'car' }

const CASH_KEYS = ['готівка','наличные','нал','cash','наличка','готовые']

const ProgressBar = ({ progress, color, height = 4 }: { progress: number, color: string, height?: number }) => (
  <div style={{ height, width: '100%', background: 'var(--bg-tertiary)', borderRadius: 999, overflow: 'hidden', display: 'flex' }}>
    <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, progress))}%`, background: color, transition: 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)', borderRadius: 999 }} />
  </div>
)

export const OrdersStatPanel: React.FC = () => {
  const { isDark } = useTheme()
  const { excelData } = useExcelData()
  const autoRoutingStatus = useDashboardStore(s => s.autoRoutingStatus)

  const s = useMemo(() => {
    const orders: any[] = excelData?.orders || []
    const routes: any[] = excelData?.routes || []
    if (!orders.length) return null
    const total = orders.length, refused = orders.filter(isRefusal).length, pickups = orders.filter(isPickup).length
    const unassigned = orders.filter(o => isId0CourierName(o.courier || o.courierName)).length
    const deliv = orders.filter(o => !isPickup(o) && !isRefusal(o) && !isId0CourierName(o.courier || o.courierName))
    const taxis = deliv.filter(isTaxi).length, couriersOnly = deliv.filter(o => !isTaxi(o))
    const cars = couriersOnly.filter(o => getVehicle(o)==='car').length, foot = couriersOnly.filter(o => getVehicle(o)==='foot').length
    const successful = total - refused
    
    let grandTotal = 0
    const payMap = new Map<string,{count:number;amount:number}>()
    orders.forEach(o => { 
      if (!isRefusal(o)) {
        const m = getPayMethod(o), a = getAmount(o); 
        const cur = payMap.get(m)||{count:0,amount:0}; 
        payMap.set(m,{count:cur.count+1,amount:cur.amount+a}); 
        grandTotal+=a 
      }
    })
    
    const paymentMethods = Array.from(payMap.entries()).map(([name, data]) => ({ name, ...data })).sort((a,b) => b.amount - a.amount)
    
    const routedCount = routes.length > 0 ? routes.reduce((acc,r) => acc+Number(r.ordersCount||r.orders_count||(Array.isArray(r.orders)?r.orders.length:0)),0) : (autoRoutingStatus?.skippedInRoutes||0)
    const totalKm = routes.reduce((acc,r) => acc+Number(r.totalDistance||r.total_distance||0),0)
    const geoErr = autoRoutingStatus?.geoErrors?.length||autoRoutingStatus?.skippedGeocoding||0
    const geoTotal = autoRoutingStatus?.totalCount||total
    const geoOk = geoTotal > 0 ? ((geoTotal-geoErr)/geoTotal*100) : 100
    
    return { total, refused, pickups, unassigned, taxis, cars, foot, successful, grandTotal, paymentMethods, routedCount, totalKm, geoErr, geoOk }
  }, [excelData, autoRoutingStatus])

  if (!s) return null

  // Group Payments into "Cash" and "Non-Cash" for the big visible blocks
  const isCash = (name: string) => {
    const l = name.toLowerCase()
    if (l.includes('безготівка') || l.includes('безнал')) return false
    return CASH_KEYS.some(k => l.includes(k))
  }
  const cashTotal = s.paymentMethods.filter(p => isCash(p.name)).reduce((sum, p) => sum + p.amount, 0)
  const nonCashTotal = s.grandTotal - cashTotal

  const cashPct  = s.grandTotal > 0 ? (cashTotal / s.grandTotal) * 100 : 0
  const successPct = parseFloat(pct(s.successful, s.total))
  const routePct = parseFloat(pct(s.routedCount, s.total))
  const avgCheck = s.successful > 0 ? s.grandTotal / s.successful : 0

  const theme = {
    '--bg-primary': isDark ? '#000000' : '#F5F5F7',
    '--bg-card': isDark ? '#1C1C1E' : '#FFFFFF',
    '--bg-tertiary': isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
    '--border': isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    '--text-primary': isDark ? '#FFFFFF' : '#000000',
    '--text-secondary': isDark ? '#8E8E93' : '#8E8E93',
    '--blue': isDark ? '#0A84FF' : '#007AFF',
    '--green': isDark ? '#30D158' : '#34C759',
    '--amber': isDark ? '#FF9F0A' : '#FF9500',
    '--red': isDark ? '#FF453A' : '#FF3B30',
  } as React.CSSProperties

  const cardStyle = {
    background: 'var(--bg-card)',
    borderRadius: '20px',
    padding: '28px',
    boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.2)' : '0 4px 20px rgba(0,0,0,0.03)',
    border: '1px solid var(--border)',
    position: 'relative' as const,
    overflow: 'hidden' as const,
  }

  return (
    <div style={{
      ...theme,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      gap: '24px'
    }}>
      
      {/* ROW 1: COMBINED VOLUMES PANEL - ULTRA-CLEAN APPLE PRESENTATION DESIGN */}
      <div style={{ 
        ...cardStyle, 
        padding: '40px 48px',
        background: 'var(--bg-card)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '48px',
        position: 'relative' as const,
        overflow: 'hidden' as const
      }}>
        
        {/* Column 1: Total Volume */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Общий объем заказов
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <span style={{ fontSize: '72px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {fmt(s.total)}
            </span>
            <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              заказов
            </span>
          </div>
        </div>

        {/* Minimal elegant dividing line */}
        <div style={{ width: '1px', height: '80px', background: 'var(--border)' }} />

        {/* Column 2: Successful Orders */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, paddingLeft: '24px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Заказы без отказов
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <span style={{ fontSize: '72px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {fmt(s.successful)}
            </span>
            <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              заказов
            </span>
          </div>
        </div>

      </div>

      {/* ROW 2: LOGISTICS (PROFESSIONAL INFOGRAPHIC DESIGN WITH LIQUID CARDS) */}
      <div style={{ ...cardStyle }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
               <MapIcon style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} />
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
              Отчет по доставке
            </h3>
        </div>
        
        {(() => {
          const totalCouriers = s.cars + s.foot;
          const carPct = totalCouriers > 0 ? (s.cars / totalCouriers) * 100 : 0;
          const footPct = totalCouriers > 0 ? (s.foot / totalCouriers) * 100 : 0;
          
          const renderFluidCard = (m: any, subtext: string) => {
            const isEmpty = m.count === 0;
            const fillHeight = m.share.toFixed(1);
            
            return (
              <div key={m.label} style={{
                background: isEmpty ? 'var(--bg-tertiary)' : `linear-gradient(to top, rgba(${m.colorRaw}, 0.15) ${fillHeight}%, rgba(${m.colorRaw}, 0.02) ${fillHeight}%)`,
                border: `1px solid rgba(${m.colorRaw}, 0.2)`,
                borderRadius: '24px',
                padding: '28px',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: isDark && !isEmpty ? `0 4px 20px rgba(${m.colorRaw}, 0.05)` : 'none',
                flex: 1
              }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '32px', zIndex: 1 }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: `rgba(${m.colorRaw}, 0.15)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                       <m.icon style={{ width: '24px', height: '24px', color: m.color }} />
                    </div>
                    <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{m.label}</span>
                 </div>
                 
                 <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', zIndex: 1 }}>
                    <span style={{ fontSize: '56px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                      {fmt(m.count)}
                    </span>
                    <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      заказов
                    </span>
                 </div>
                 
                 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '32px', zIndex: 1 }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {subtext}
                    </span>
                    <span style={{ fontSize: '24px', fontWeight: 800, color: m.color }}>
                      {fillHeight}%
                    </span>
                 </div>
              </div>
            );
          };

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              
              {/* COMPARISON BLOCK */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <TruckIcon style={{ width: '18px', height: '18px', color: 'var(--text-secondary)' }} />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Сравнение курьеров</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Всего доставлено:</span>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(totalCouriers)}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '24px' }}>
                  {renderFluidCard({ label: 'Авто', count: s.cars, share: carPct, color: 'var(--blue)', icon: TruckIcon, colorRaw: isDark ? '10, 132, 255' : '0, 122, 255' }, 'От курьеров')}
                  {renderFluidCard({ label: 'Мото/Пешком', count: s.foot, share: footPct, color: 'var(--amber)', icon: MopedIcon, colorRaw: isDark ? '255, 159, 10' : '255, 149, 0' }, 'От курьеров')}
                </div>

                {/* Thin connection bar showing exact ratio */}
                <div style={{ padding: '0 8px' }}>
                  <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', background: 'var(--bg-tertiary)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)' }}>
                    {carPct > 0 && <div style={{ width: `${carPct}%`, background: 'var(--blue)' }} />}
                    {footPct > 0 && <div style={{ width: `${footPct}%`, background: 'var(--amber)' }} />}
                  </div>
                </div>
              </div>

              {/* OTHER CHANNELS BLOCK */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
                {renderFluidCard({ label: 'Самовывоз', count: s.pickups, share: (s.pickups/s.total)*100, color: 'var(--green)', icon: ShoppingBagIcon, colorRaw: isDark ? '48, 209, 88' : '52, 199, 89' }, 'От всех')}
                {renderFluidCard({ label: 'Такси', count: s.taxis, share: (s.taxis/s.total)*100, color: '#A2845E', icon: PaperAirplaneIcon, colorRaw: '162, 132, 94' }, 'От всех')}
                {renderFluidCard({ label: 'Отказы', count: s.refused, share: (s.refused/s.total)*100, color: 'var(--red)', icon: XCircleIcon, colorRaw: isDark ? '255, 69, 58' : '255, 59, 48' }, 'От всех')}
              </div>
            </div>
          )
        })()}
      </div>

      {/* ROW 3: REVENUE & FINANCE (FULLY VISIBLE DETAILS) */}
      <div style={{ ...cardStyle }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChartPieIcon style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} />
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
            Выручка и Финансы
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '48px' }}>
          
          {/* Main Revenue */}
          <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', paddingRight: '48px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.04em' }}>Общая сумма</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '24px' }}>
                <span style={{ fontSize: '32px', fontWeight: 500, color: 'var(--text-secondary)' }}>₴</span>
                <span style={{ fontSize: '64px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {money(s.grandTotal)}
                </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '12px' }}>
               <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Средний чек</span>
               <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>₴{money(avgCheck)}</span>
            </div>
          </div>

          {/* Detailed Splits (Cash / Non-Cash + Full List) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* CASH (Massive Row) */}
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 140px', alignItems: 'center', gap: '24px', background: isDark ? 'rgba(48,209,88,0.05)' : 'rgba(52,199,89,0.05)', padding: '24px', borderRadius: '20px', border: isDark ? '1px solid rgba(48,209,88,0.1)' : '1px solid rgba(52,199,89,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                 <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <BanknotesIcon style={{ width: '24px', height: '24px', color: '#FFFFFF' }} />
                 </div>
                 <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--green)' }}>Нал</span>
              </div>
              <div style={{ width: '100%' }}>
                <ProgressBar progress={cashPct} color="var(--green)" height={8} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>₴{money(cashTotal)}</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--green)' }}>{cashPct.toFixed(1)}%</span>
              </div>
            </div>

            {/* NON-CASH (Massive Row) */}
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 140px', alignItems: 'center', gap: '24px', background: isDark ? 'rgba(10,132,255,0.05)' : 'rgba(0,122,255,0.05)', padding: '24px', borderRadius: '20px', border: isDark ? '1px solid rgba(10,132,255,0.1)' : '1px solid rgba(0,122,255,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                 <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CreditCardIcon style={{ width: '24px', height: '24px', color: '#FFFFFF' }} />
                 </div>
                 <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--blue)' }}>Безнал</span>
              </div>
              <div style={{ width: '100%' }}>
                <ProgressBar progress={100-cashPct} color="var(--blue)" height={8} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>₴{money(nonCashTotal)}</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--blue)' }}>{(100-cashPct).toFixed(1)}%</span>
              </div>
            </div>

            {/* Full Details List (Vertical Table format for high visibility) */}
            <div style={{ marginTop: '16px', background: 'var(--bg-tertiary)', borderRadius: '16px', padding: '20px' }}>
               <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 16px 0' }}>Детализация по всем типам</h4>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                 {s.paymentMethods.map(pm => (
                   <div key={pm.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                      <span style={{ fontSize: '15px', color: 'var(--text-primary)', fontWeight: 500 }}>{pm.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 600 }}>{s.grandTotal > 0 ? ((pm.amount/s.grandTotal)*100).toFixed(1) : 0}%</span>
                        <span style={{ fontSize: '16px', color: 'var(--text-primary)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', width: '100px', textAlign: 'right' }}>₴{money(pm.amount)}</span>
                      </div>
                   </div>
                 ))}
               </div>
            </div>

          </div>
        </div>
      </div>

      {/* ROW 4: ROUTING & GEO HEALTH */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div style={{ ...cardStyle, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
           <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 16px 0' }}>В маршрутах</p>
           <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', marginBottom: '16px' }}>
              <span style={{ fontSize: '48px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{fmt(s.routedCount)}</span>
              <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--blue)' }}>{routePct}%</span>
           </div>
           <ProgressBar progress={routePct} color="var(--blue)" height={8} />
           <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '20px', margin: 0 }}>
             Пробег: <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{fmt(Math.round(s.totalKm))} км</span>
           </p>
        </div>
        
        <div style={{ ...cardStyle, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
           <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 16px 0' }}>Точность геокодинга</p>
           <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', marginBottom: '16px' }}>
              <span style={{ fontSize: '48px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{s.geoOk.toFixed(1)}%</span>
           </div>
           <ProgressBar progress={s.geoOk} color={s.geoOk >= 95 ? "var(--green)" : "var(--amber)"} height={8} />
           <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '20px', margin: 0, display: 'flex', gap: '24px' }}>
              <span>Ошибки адресов: <strong style={{ color: s.geoErr > 0 ? 'var(--red)' : 'var(--text-primary)', fontWeight: 700 }}>{s.geoErr}</strong></span>
              <span>Без курьера: <strong style={{ color: s.unassigned > 0 ? 'var(--amber)' : 'var(--text-primary)', fontWeight: 700 }}>{s.unassigned}</strong></span>
           </p>
        </div>
      </div>

    </div>
  )
}

export default OrdersStatPanel
