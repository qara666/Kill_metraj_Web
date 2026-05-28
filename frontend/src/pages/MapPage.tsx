import React, { useMemo, useState, useCallback, useRef, memo, useEffect } from 'react'
import { clsx } from 'clsx'
import { MapIcon, FunnelIcon, ArrowUpTrayIcon, XMarkIcon, MapPinIcon, EyeIcon, EyeSlashIcon, ArrowsPointingOutIcon, MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline'
import { useExcelData } from '../contexts/ExcelDataContext'
import { useTheme } from '../contexts/ThemeContext'
import { useKmlData } from '../hooks/useKmlData'
import { localStorageUtils } from '../utils/ui/localStorage'
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, Polygon, Tooltip, Polyline, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// ── Fix Leaflet icons ────────────────────────────────────────
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

// ── Palette ──────────────────────────────────────────────────
const PAL = ['#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#6366f1']
function courierColor(name: string) {
  if (!name) return '#64748b'
  return PAL[Math.abs(name.split('').reduce((a,b) => a+b.charCodeAt(0),0)) % PAL.length]
}

// ── Normalise any path format to [lat,lng][] ─────────────────
function normPath(path: any[]): [number,number][] {
  if (!Array.isArray(path)) return []
  return path.map(pt => {
    if (Array.isArray(pt)) return [Number(pt[0]), Number(pt[1])] as [number,number]
    const lat = typeof pt.lat === 'function' ? pt.lat() : Number(pt.lat)
    const lng = typeof pt.lng === 'function' ? pt.lng() : Number(pt.lng)
    return [lat, lng] as [number,number]
  }).filter(([a,b]) => !isNaN(a) && !isNaN(b) && !(a===0 && b===0))
}

// ── Extract coords from any order ───────────────────────────
function getCoords(o: any): [number,number] | null {
  const tryPair = (a: any, b: any): [number,number] | null => {
    let la = Number(a), lb = Number(b)
    if (!isNaN(la) && !isNaN(lb) && (la !== 0 || lb !== 0) && Math.abs(la) <= 90 && Math.abs(lb) <= 180) {
      try {
        const settings = localStorageUtils.getAllSettings()
        const depotLat = Number(settings.defaultStartLat)
        const depotLng = Number(settings.defaultStartLng)
        if (!isNaN(depotLat) && !isNaN(depotLng) && (depotLat !== 0 || depotLng !== 0)) {
          const distUnswapped = Math.abs(la - depotLat) + Math.abs(lb - depotLng)
          const distSwapped = Math.abs(lb - depotLat) + Math.abs(la - depotLng)
          if (distSwapped < distUnswapped && distSwapped < 3.0) {
            return [lb, la]
          }
        }
      } catch (e) {
        // Ignore if localStorage fails
      }
      return [la, lb]
    }
    return null
  }
  // 0. Already an array from previous pass
  if (Array.isArray(o.coords) && o.coords.length === 2) {
    const p = tryPair(o.coords[0], o.coords[1])
    if (p) return p
  }
  // 1. Pre-parsed coords object
  if (o.coords?.lat && o.coords?.lng) return tryPair(o.coords.lat, o.coords.lng)
  // 2. Flat lat/lng fields
  if (o.lat && o.lng) return tryPair(o.lat, o.lng)
  if (o.latitude && o.longitude) return tryPair(o.latitude, o.longitude)
  if (o.geo?.lat && o.geo?.lng) return tryPair(o.geo.lat, o.geo.lng)
  // 3. Parse addressGeo string from known fields
  const rawGeo = o.addressGeo || o.AddressGeo || o.address_geo || o.addressGeoStr || o.geoStr || o.raw?.addressGeo
  const geoStr = rawGeo && rawGeo !== 'null' && rawGeo !== 'undefined' ? String(rawGeo) : ''
  
  const extractFromStr = (str: string) => {
    if (str.length < 5) return null
    // Extremely permissive regex to find numbers after Lat and Long
    const latM = str.match(/Lat[^\d+-]*([-+]?\d+[.,]\d+)/i)
    const lngM = str.match(/Long[^\d+-]*([-+]?\d+[.,]\d+)/i)
    if (latM && lngM) return tryPair(latM[1].replace(',','.'), lngM[1].replace(',','.'))
    
    // Fallback: search for Latitude and Longitude
    const latM2 = str.match(/(?:Широта|Latitude)[^\d+-]*([-+]?\d+[.,]\d+)/i)
    const lngM2 = str.match(/(?:Долгота|Longitude|Lng)[^\d+-]*([-+]?\d+[.,]\d+)/i)
    if (latM2 && lngM2) return tryPair(latM2[1].replace(',','.'), lngM2[1].replace(',','.'))

    // Plain "lat, lng" pair fallback (supports dots or commas as decimal, separated by comma/semicolon/space)
    const pair = str.match(/^\s*([-+]?\d+[.,]\d+)\s*[,; \t]+\s*([-+]?\d+[.,]\d+)\s*$/)
    if (pair) return tryPair(pair[1].replace(',','.'), pair[2].replace(',','.'))
    return null
  }

  const parsed = extractFromStr(geoStr)
  if (parsed) return parsed

  // (Removed dangerous JSON.stringify fallback that could match hub/depot coordinates)
  
  return null
}

// ── Icon cache ───────────────────────────────────────────────
const ICACHE = new Map<string, L.DivIcon>()
function getIcon(color: string, label: string, isOutlier: boolean = false, isDimmed: boolean = false, isUrgent: boolean = false, isSelected: boolean = false): L.DivIcon {
  const k = `${color}|${label}|${isOutlier}|${isDimmed}|${isUrgent}|${isSelected}`
  if (!ICACHE.has(k)) {
    let shadow = '0 3px 8px rgba(0,0,0,.35)'
    if (isSelected) shadow = '0 0 0 5px rgba(59,130,246,0.5), 0 0 20px rgba(59,130,246,0.9)'
    else if (isOutlier) shadow = '0 0 0 4px rgba(239,68,68,0.5), 0 4px 12px rgba(239,68,68,0.5)'
    else if (isUrgent) shadow = '0 0 0 4px rgba(234,179,8,0.75), 0 0 15px rgba(234,179,8,0.85)'

    const opacity = isDimmed && !isSelected ? 'opacity: 0.2; filter: grayscale(40%);' : ''
    const scale = isSelected ? 'transform: scale(1.3); z-index: 100000 !important;' : isDimmed ? 'transform: scale(0.8);' : (isUrgent ? 'transform: scale(1.15); z-index: 10000 !important;' : 'transform: scale(1.05);')
    const border = isSelected ? 'border: 2px solid #3b82f6;' : isUrgent ? 'border: 2px solid #eab308;' : 'border: 2px solid #fff;'
    const triangleColor = isSelected ? '#3b82f6' : isUrgent ? '#eab308' : '#fff'
    
    ICACHE.set(k, new L.DivIcon({
      html: `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;transition:all 0.15s;${opacity}${scale}">
          ${isUrgent && !isSelected ? `<div style="position:absolute;top:-10px;background:#eab308;color:#000;font-size:7px;font-weight:900;padding:1px 4px;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,0.3);z-index:100;letter-spacing:0.05em;white-space:nowrap;">СРОЧНО</div>` : ''}
          <div style="background:linear-gradient(to bottom, rgba(255,255,255,0.18), rgba(0,0,0,0.15)), ${color};${border}border-radius:6px;min-width:34px;height:21px;display:flex;align-items:center;justify-content:center;box-shadow:${shadow};font-size:11px;font-weight:900;color:#fff;padding:0 5px;text-shadow:0 1px 2px rgba(0,0,0,0.55);line-height:1;">
            ${label}
          </div>
          <div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid ${triangleColor};margin-top:-1px;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.15));"></div>
        </div>
      `,
      className:'', iconSize:[34,26], iconAnchor:[17,26]
    }))
  }
  return ICACHE.get(k)!
}
const DEPOT_ICO = new L.DivIcon({
  html:`<div style="background:#1d4ed8;border:3px solid #fff;border-radius:8px;width:38px;height:38px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(29,78,216,.6);font-size:9px;font-weight:900;color:#fff;letter-spacing:.05em;text-align:center">ХАБ</div>`,
  className:'', iconSize:[38,38], iconAnchor:[19,19]
})

// ── Polygon Hit Test ─────────────────────────────────────────
function pointInPolygon(point: [number, number], vs: [number, number][]) {
  let x = point[0], y = point[1]
  let inside = false
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    let xi = vs[i][0], yi = vs[i][1]
    let xj = vs[j][0], yj = vs[j][1]
    let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

// ── Map Events Click Handler ─────────────────────────────────
const MapClickHandler = memo(({ onClick }: { onClick: (latlng: L.LatLng) => void }) => {
  useMapEvents({
    click(e) {
      onClick(e.latlng)
    }
  })
  return null
})



// ── Haversine ────────────────────────────────────────────────
function haverKm(a: [number,number], b: [number,number]) {
  const R=6371, dLat=(b[0]-a[0])*Math.PI/180, dLng=(b[1]-a[1])*Math.PI/180
  const x = Math.sin(dLat/2)**2 + Math.cos(a[0]*Math.PI/180)*Math.cos(b[0]*Math.PI/180)*Math.sin(dLng/2)**2
  return (R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))).toFixed(1)
}

function getUrgencyMins(timeStr: string) {
  if (!timeStr || timeStr === 'Без времени' || timeStr.includes('—')) return null;
  const [h,m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  const now = new Date();
  const target = new Date();
  target.setHours(h, m, 0, 0);
  let diff = (target.getTime() - now.getTime()) / 60000;
  if (diff < -12 * 60) diff += 24 * 60;
  if (diff > 12 * 60) diff -= 24 * 60;
  return diff; // negative = late
}

export function getOrderTime(o: any, source: string): string {
  const p = o.plannedTime || o.raw?.plannedTime || ''
  const d = o.deliverBy || o.deliveryTime || o.raw?.deliverBy || ''
  if (source === 'plannedTime') return p || 'Без времени'
  if (source === 'deliverBy') return d || 'Без времени'
  // 'all' fallback
  if (d && d !== 'Без времени') return d
  if (p && p !== 'Без времени') return p
  return 'Без времени'
}

// ── Road Info Fetch Queue & Hook (Optimized Event Emitter) ──────────────
const ROAD_ROUTE_CACHE = new Map<string, { coords: [number, number][]; distance: number; duration: number }>()
const ROUTE_LISTENERS = new Map<string, Set<(info: any) => void>>()
const ROUTE_FETCHING = new Set<string>()

const routeQueue: Array<() => Promise<void>> = []
let isProcessingQueue = false
const processRouteQueue = async () => {
  if (isProcessingQueue) return
  isProcessingQueue = true
  while (routeQueue.length > 0) {
    const task = routeQueue.shift()
    if (task) await task()
    await new Promise(r => setTimeout(r, 65)) // 65ms stagger to prevent OSRM 429 Ratelimit
  }
  isProcessingQueue = false
}

const useOrderRoadInfo = (depot: [number, number] | null, pos: [number, number] | null) => {
  const key = pos && depot ? `${depot[0]},${depot[1]};${pos[0]},${pos[1]}` : ''
  // Initial state is synchronous if cached!
  const [info, setInfo] = useState<{ coords: [number, number][]; distance: number; duration: number } | null>(
    key ? (ROAD_ROUTE_CACHE.get(key) || null) : null
  )
  
  useEffect(() => {
    if (!pos || !depot || !key) {
      setInfo(null)
      return
    }
    if (ROAD_ROUTE_CACHE.has(key)) {
      setInfo(ROAD_ROUTE_CACHE.get(key)!)
      return
    }
    
    let active = true
    const listener = (newInfo: any) => { if (active) setInfo(newInfo) }
    
    if (!ROUTE_LISTENERS.has(key)) {
      ROUTE_LISTENERS.set(key, new Set())
    }
    ROUTE_LISTENERS.get(key)!.add(listener)

    if (!ROUTE_FETCHING.has(key)) {
      ROUTE_FETCHING.add(key)
      routeQueue.push(async () => {
        try {
          const url = `https://router.project-osrm.org/route/v1/driving/${depot[1]},${depot[0]};${pos[1]},${pos[0]}?overview=full&geometries=geojson`
          const res = await fetch(url)
          const d = await res.json()
          if (d.routes?.[0]) {
            const item = {
              coords: d.routes[0].geometry?.coordinates 
                ? d.routes[0].geometry.coordinates.map((pt: any) => [pt[1], pt[0]] as [number, number])
                : [[depot[0], depot[1]], [pos[0], pos[1]]] as [number, number][],
              distance: d.routes[0].distance || 0,
              duration: d.routes[0].duration || 0
            }
            ROAD_ROUTE_CACHE.set(key, item)
            ROUTE_LISTENERS.get(key)?.forEach(cb => cb(item))
          }
        } catch (e) {
        } finally {
          ROUTE_LISTENERS.delete(key)
        }
      })
      processRouteQueue()
    }
    return () => { 
      active = false
      ROUTE_LISTENERS.get(key)?.delete(listener)
    }
  }, [key, depot, pos])

  return info
}

const OrderDistancePopup = ({ depot, pos, haverDist }: { depot: [number,number], pos: [number,number], haverDist: string }) => {
  const roadInfo = useOrderRoadInfo(depot, pos)
  if (!roadInfo) {
    return <span style={{ fontWeight:700, color:'#111827', fontSize:11, textAlign:'right' }}>...</span>
  }
  const km = (roadInfo.distance / 1000).toFixed(1)
  const min = Math.round(roadInfo.duration / 60)
  return <span style={{ fontWeight:700, color:'#111827', fontSize:11, textAlign:'right' }}>{min} мин ({km} км по дороге)</span>
}

// ── BoundsFitter (fires once) ────────────────────────────────
const BoundsFitter = memo(({ pts }: { pts: [number,number][] }) => {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (done.current || pts.length < 1) return
    done.current = true
    try { map.fitBounds(L.latLngBounds(pts), { padding:[50,50], animate:false, maxZoom:15 }) } catch {}
  }, [pts.length]) // eslint-disable-line
  return null
})

// ── SelectedOrderCentering ───────────────────────────────────
const VALID_LAT = (v: number) => !isNaN(v) && v >= -90 && v <= 90 && v !== 0
const VALID_LNG = (v: number) => !isNaN(v) && v >= -180 && v <= 180 && v !== 0
const SelectedOrderCentering = memo(({ pos, onResetPos }: { pos: [number, number] | null; onResetPos: () => void }) => {
  const map = useMap()
  const prevPos = useRef<[number, number] | null>(null)
  const isAutomated = useRef(false)
  
  useEffect(() => {
    if (pos && VALID_LAT(pos[0]) && VALID_LNG(pos[1]) && (prevPos.current?.[0] !== pos[0] || prevPos.current?.[1] !== pos[1])) {
      prevPos.current = pos
      isAutomated.current = true
      const zoom = Math.min(Math.max(map.getZoom(), 13), 17)
      map.flyTo(pos, zoom, { duration: 0.8 })
      
      const timer = setTimeout(() => {
        isAutomated.current = false
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [pos, map])

  useMapEvents({
    dragstart() {
      onResetPos()
    },
    zoomstart() {
      if (!isAutomated.current) {
        onResetPos()
      }
    }
  })

  return null
})

// ── KML Zone (memoised) ──────────────────────────────────────
const KmlZone = memo(({ name, path, color }: { name:string; path:[number,number][]; color:string }) => {
  if (path.length < 3) return null
  return (
    <Polygon positions={path}
      pathOptions={{ color, weight:1.5, fillColor:color, fillOpacity:0.06, dashArray:'6,5', interactive:true }}
      className="transition-all duration-300 hover:fill-opacity-[0.2]">
      <Tooltip direction="center" permanent={false} opacity={0.9}
        className="!bg-white/90 !border-0 !shadow-lg !px-2 !py-1 !rounded-md !text-[10px] !font-black !uppercase !text-gray-800 !pointer-events-none transition-opacity duration-300">
        {name}
      </Tooltip>
    </Polygon>
  )
})

// ── Order Marker (memoised) ──────────────────────────────────
const OrderMarker = memo(({ o, seq, depot, lineMode, isOutlier, isDimmed, isInBatch, isUrgent, isSelected, onToggleBatch, onSelect }: {
  o: any; seq: number; depot:[number,number]; lineMode: 'none' | 'straight' | 'road'; isOutlier?: boolean; isDimmed?: boolean; isInBatch?: boolean; isUrgent?: boolean; isSelected?: boolean; onToggleBatch?: (o: any) => void; onSelect?: (o: any) => void
}) => {
  const pos = getCoords(o)
  if (!pos) return null
  const color = courierColor(o.courier || o.courierName || '')
  const dist = haverKm(depot, pos)
  const orderNumberStr = String(o.orderNumber || seq)
  const label = orderNumberStr.slice(-4)
  const roadInfo = useOrderRoadInfo((lineMode === 'road' || isSelected) ? depot : null, pos)
  const showRouteForOrder = lineMode === 'road' || (lineMode === 'none' && isSelected)
  const realRoute = showRouteForOrder && roadInfo ? roadInfo.coords : []
  
  return (
    <>
      {lineMode === 'straight' && <Polyline positions={[depot, pos]} pathOptions={{ color, weight: isDimmed ? 1.5 : 3.5, opacity: isDimmed ? 0.08 : 0.75, interactive:false }} />}
      {(lineMode === 'road' || (lineMode === 'none' && isSelected)) && realRoute.length > 0 && (
        <>
          <Polyline positions={realRoute} pathOptions={{ color, weight: isDimmed ? 2 : 6, opacity: isDimmed ? 0.15 : 0.35, lineCap: 'round', lineJoin: 'round', interactive:false }} />
          <Polyline positions={realRoute} pathOptions={{ color, weight: isDimmed ? 1 : 3, opacity: isDimmed ? 0.3 : 0.9, lineCap: 'round', lineJoin: 'round', interactive:false }} />
        </>
      )}
      <Marker position={pos} icon={getIcon(color, label, isOutlier, isDimmed, isUrgent, isSelected)} eventHandlers={{
        click: () => {
          if (onSelect) onSelect(o)
        }
      }}>
        <Popup minWidth={240} autoPan={false}>
          <div style={{ fontFamily:'Inter,system-ui,sans-serif' }}>
            <div style={{ background:color, padding:'8px 12px', margin:'-8px -12px 8px', borderRadius:'6px 6px 0 0' }}>
              <b style={{ color:'#fff', fontSize:13 }}>#{orderNumberStr}</b>
              <div style={{ color:'rgba(255,255,255,.8)', fontSize:10, marginTop:2, lineHeight:1.4 }}>{o.address || '—'}</div>
            </div>
            {([
              ['Статус', o.status || o.deliveryStatus || '—'],
              ['Кухня', o.kitchenTime || o.raw?.kitchenTime || '—'],
              ['Время', o.plannedTime || o.deliverBy || o.deliveryTime || '—'],
              ['Курьер', (o.courier || o.courierName || '').toLowerCase().includes('не назначен') ? '—' : (o.courier || o.courierName || '—')],
              ['Сумма', `${o.amount || o.totalAmount || 0} грн`],
              ['Оплата', o.paymentMethod || '—'],
              ['Зона API', o.zone || o.kmlZone || o.deliveryZone || o.raw?.deliveryZone || '—'],
              ['Вне зоны', isOutlier ? '⚠️ ДА' : 'Нет'],
              ['К заказу от хаба', <OrderDistancePopup key="dist" depot={depot} pos={pos} haverDist={dist} />],
            ] as [string,string | React.ReactNode][]).map(([k,v]) => (
              <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', borderBottom:'1px solid #f3f4f6', gap:8 }}>
                <span style={{ color:'#6b7280', fontWeight:700, fontSize:10, textTransform:'uppercase', whiteSpace:'nowrap', flexShrink:0 }}>{k}</span>
                <span style={{ fontWeight:700, color: (k==='Вне зоны'&&isOutlier) ? '#ef4444' : '#111827', fontSize:11, textAlign:'right' }}>{v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (onToggleBatch) onToggleBatch(o)
                }}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  borderRadius: '6px',
                  fontSize: '10px',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  border: '1px solid #e5e7eb',
                  background: isInBatch ? '#fee2e2' : '#f3f4f6',
                  color: isInBatch ? '#ef4444' : '#374151',
                  cursor: 'pointer'
                }}
              >
                {isInBatch ? 'Убрать из маршрута (тест)' : 'Добавить в маршрут (тест)'}
              </button>
            </div>
            <div style={{ marginTop:6, fontSize:9, color:'#9ca3af', fontFamily:'monospace' }}>{pos[0].toFixed(5)}, {pos[1].toFixed(5)}</div>
          </div>
        </Popup>
      </Marker>
    </>
  )
}, (p,n) =>
  p.o.id===n.o.id &&
  p.o.status===n.o.status &&
  p.o.courier===n.o.courier &&
  p.seq===n.seq &&
  p.lineMode===n.lineMode &&
  p.isOutlier===n.isOutlier &&
  p.isDimmed===n.isDimmed &&
  p.isInBatch===n.isInBatch &&
  p.isUrgent===n.isUrgent &&
  p.isSelected===n.isSelected
)

const SidebarOrderRoadTime = memo(({ depot, pos, isSelected }: { depot: [number, number]; pos: [number, number] | null; isSelected?: boolean }) => {
  const [showReal, setShowReal] = useState(false);
  const roadInfo = useOrderRoadInfo(showReal || isSelected ? depot : null, pos);

  if (!pos) return <span className="text-[9px] text-gray-400 font-semibold opacity-70">ехать ~ ... мин</span>;

  if (roadInfo) {
    const min = Math.round(roadInfo.duration / 60)
    return <span className="text-[9px] text-blue-500 font-bold font-sans">дорога ~ {min} мин</span>
  }

  const dist = parseFloat(haverKm(depot, pos));
  const estMin = Math.ceil(dist * 3.5);
  
  return (
    <span 
      onClick={(e) => { e.stopPropagation(); setShowReal(true); }}
      className="text-[9px] text-gray-400 font-semibold opacity-70 hover:text-blue-400 cursor-pointer transition-colors"
      title="Нажмите, чтобы рассчитать точное время по дороге (OSRM)"
    >
      ~ {estMin} мин (прямо)
    </span>
  )
})

// ── Main page ─────────────────────────────────────────────────
export const MapPage: React.FC = () => {
  const { excelData } = useExcelData()
  const { isDark } = useTheme()
  const { cachedAllKmlPolygons, selectedHubs, selectedZones } = useKmlData()
  const settings = useMemo(() => localStorageUtils.getAllSettings(), [])
  const depot = useMemo<[number,number]>(() => [
    Number(settings.defaultStartLat) || 50.4501,
    Number(settings.defaultStartLng) || 30.5234,
  ], [settings.defaultStartLat, settings.defaultStartLng])

  // Filter state
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCourier, setFilterCourier] = useState('all')
  const [filterKitchen, setFilterKitchen] = useState('all') // 'all', 'ready', 'waiting'
  const [filterPaymentMethod, setFilterPaymentMethod] = useState('all')
  const [filterTimeSource, setFilterTimeSource] = useState('all') // 'all', 'plannedTime', 'deliverBy'
  const [filterUrgency, setFilterUrgency] = useState('all') // 'all', 'late', 'urgent', 'near', 'far'
  const [filterTransport, setFilterTransport] = useState('all') // 'all', 'auto', 'moto', 'foot', 'unassigned'
  const [showCouriers, setShowCouriers] = useState(true)
  const [showOutliers, setShowOutliers] = useState(false)
  const [showKml, setShowKml] = useState(false)
  const [lineMode, setLineMode] = useState<'none' | 'straight' | 'road'>('none')
  const [showNoGeo, setShowNoGeo] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [mapStyle, setMapStyle] = useState(() => {
    return isDark ? 'dark' : 'osm'
  })
  
  // Custom awesome states
  const [hoveredCourier, setHoveredCourier] = useState<string | null>(null)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [selectedOrderPos, setSelectedOrderPos] = useState<[number, number] | null>(null)

  // TSP/Batch Route states
  const [batchOrders, setBatchOrders] = useState<any[]>([])
  const [batchRoute, setBatchRoute] = useState<[number, number][]>([])
  const [batchDistance, setBatchDistance] = useState<string | null>(null)
  const [batchTime, setBatchTime] = useState<string | null>(null)
  const [isSolving, setIsSolving] = useState(false)
  const [solvedSequence, setSolvedSequence] = useState<any[]>([])



  const toggleBatchOrder = useCallback((o: any) => {
    setBatchOrders(prev => {
      const exists = prev.some(x => {
        if (x.id && o.id) return x.id === o.id;
        if (x.orderNumber && o.orderNumber) return x.orderNumber === o.orderNumber;
        return x === o;
      })
      if (exists) {
        return prev.filter(x => {
          if (x.id && o.id) return x.id !== o.id;
          if (x.orderNumber && o.orderNumber) return x.orderNumber !== o.orderNumber;
          return x !== o;
        })
      } else {
        return [...prev, o]
      }
    })
  }, [])

  const solveBatchRoute = useCallback(() => {
    if (batchOrders.length === 0) return
    setIsSolving(true)
    
    const ptsList = batchOrders.map(o => getCoords(o)!).filter(Boolean)
    const allPts = [depot, ...ptsList]
    const coordsStr = allPts.map(pt => `${pt[1]},${pt[0]}`).join(';')

    const url = `https://router.project-osrm.org/trip/v1/driving/${coordsStr}?source=first&overview=full&geometries=geojson`
    
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.trips?.[0]) {
          const trip = d.trips[0]
          if (trip.geometry?.coordinates) {
            const routePts = trip.geometry.coordinates.map((pt: any) => [pt[1], pt[0]] as [number, number])
            setBatchRoute(routePts)
          }
          setBatchDistance((trip.distance / 1000).toFixed(1))
          setBatchTime(Math.round(trip.duration / 60).toString())

          if (d.waypoints && d.waypoints.length === batchOrders.length + 1) {
            const sortedBatch = [...batchOrders].sort((a, b) => {
              const idxA = batchOrders.indexOf(a)
              const idxB = batchOrders.indexOf(b)
              const wpA = d.waypoints[idxA + 1]
              const wpB = d.waypoints[idxB + 1]
              return (wpA?.waypoint_index || 0) - (wpB?.waypoint_index || 0)
            })
            setSolvedSequence(sortedBatch)
          }
        }
        setIsSolving(false)
      })
      .catch(() => setIsSolving(false))
  }, [batchOrders])

  const batchOrderIds = useMemo(() => new Set(batchOrders.map((x: any) => x.id || x.orderNumber)), [batchOrders])

  const handleSelectOrder = useCallback((selectedO: any) => {
    const coords = getCoords(selectedO)
    if (coords && VALID_LAT(coords[0]) && VALID_LNG(coords[1])) {
      setSelectedOrderPos(coords)
    }
    setSelectedOrderId(selectedO.id || selectedO.orderNumber)
  }, [])

  const mapContainerRef = useRef<HTMLDivElement>(null)
  
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      mapContainerRef.current?.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }


  // All orders from context
  const allOrders: any[] = useMemo(() => excelData?.orders || [], [excelData?.orders])

  // 1. Pre-normalize KML zones to compute paths once!
  const kmlZones = useMemo(() => {
    if (cachedAllKmlPolygons.length === 0) return []
    const base = selectedHubs.length > 0
      ? cachedAllKmlPolygons.filter(z => selectedHubs.includes((z.folderName || '').trim()))
      : cachedAllKmlPolygons
    return base.map((z, idx) => ({
      ...z,
      normalizedPath: normPath(z.path || []),
      key: z.key || `kml-${idx}`
    }))
  }, [cachedAllKmlPolygons, selectedHubs])

  const activeKmlZones = useMemo(() => showKml ? kmlZones : [], [showKml, kmlZones])

  // 2. Precompute coordinates once!
  const processedOrders = useMemo(() => {
    const hasZones = kmlZones.length > 0
    return allOrders.map(o => {
      const coords = getCoords(o)
      const isOutlier = coords && hasZones
        ? !kmlZones.some(z => pointInPolygon(coords, z.normalizedPath))
        : false
      return { ...o, coords, isOutlier }
    })
  }, [allOrders, kmlZones])

  // Unique statuses present in API/Excel
  const uniqueStatuses = useMemo(() => {
    const s = new Set<string>()
    allOrders.forEach(o => {
      const st = o.status || o.deliveryStatus
      if (st) s.add(st.trim())
    })
    return Array.from(s).sort()
  }, [allOrders])

  useEffect(() => {
    if (filterStatus === 'all' && uniqueStatuses.includes('Собран')) {
      setFilterStatus('Собран')
    }
  }, [uniqueStatuses, filterStatus])

  // Unique payment methods
  const uniquePaymentMethods = useMemo(() => {
    const s = new Set<string>()
    allOrders.forEach(o => {
      const pm = o.paymentMethod || o.payMethod || o.payment
      if (pm) s.add(pm.trim())
    })
    return Array.from(s).sort()
  }, [allOrders])

  // Unique couriers
  const couriers = useMemo(() => {
    const s = new Set<string>()
    allOrders.forEach(o => {
      const c = o.courier || o.courierName || ''
      if (c && !c.toLowerCase().includes('не назначен') && c.toLowerCase() !== 'по') s.add(c)
    })
    return Array.from(s).sort()
  }, [allOrders])

  // Courier order counts
  const courierCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    allOrders.forEach(o => {
      const c = o.courier || o.courierName || ''
      if (c) counts[c] = (counts[c] || 0) + 1
    })
    return counts
  }, [allOrders])

  // Filtered orders
  const filtered = useMemo(() => processedOrders.filter(o => {
    const st = String(o.status||o.deliveryStatus||'')
    const cr = o.courier||o.courierName||''
    const kt = o.kitchenTime || o.raw?.kitchenTime || ''
    
    if (filterStatus !== 'all' && st !== filterStatus) return false
    if (filterCourier !== 'all' && cr !== filterCourier) return false
    
    if (filterKitchen==='ready' && !kt) return false
    if (filterKitchen==='waiting' && kt) return false
    
    if (filterUrgency !== 'all') {
      const timeToUse = getOrderTime(o, filterTimeSource)
      const diff = getUrgencyMins(timeToUse)
      if (diff === null) return false // hide if no valid time
      if (filterUrgency === 'late' && diff >= 0) return false
      if (filterUrgency === 'urgent' && (diff < 0 || diff > 15)) return false
      if (filterUrgency === 'near' && (diff <= 15 || diff > 45)) return false
      if (filterUrgency === 'far' && diff <= 45) return false
    }

    if (filterPaymentMethod !== 'all') {
      const pm = String(o.paymentMethod || o.payMethod || o.payment || '').trim()
      if (pm !== filterPaymentMethod) return false
    }

    if (filterTransport !== 'all') {
      const c = o.courier || o.courierName || ''
      const cl = c.toLowerCase()
      const isUnassigned = !c || cl.includes('не назначен')
      
      let type = 'auto'
      if (isUnassigned) {
        type = 'unassigned'
      } else if (cl.includes('мото') || cl.includes('moto') || cl.includes('скутер')) {
        type = 'moto'
      } else if (cl.includes('пеш') || cl.includes('foot') || cl.includes('піш') || cl.includes('вело') || cl.includes('bike')) {
        type = 'foot'
      }

      if (filterTransport !== type) return false
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const idStr = String(o.id || o.orderNumber || '').toLowerCase()
      const addrStr = String(o.address || '').toLowerCase()
      const clientStr = String(o.clientName || o.client || '').toLowerCase()
      const phoneStr = String(o.phone || o.clientPhone || '').toLowerCase()
      if (!idStr.includes(q) && !addrStr.includes(q) && !clientStr.includes(q) && !phoneStr.includes(q)) {
        return false
      }
    }
    
    return true
  }), [processedOrders, filterStatus, filterCourier, filterKitchen, filterTimeSource, filterUrgency, filterTransport, filterPaymentMethod, searchQuery])

  const withGeo = useMemo(() => filtered.filter(o => o.coords !== null), [filtered])
  const noGeo   = useMemo(() => filtered.filter(o => o.coords === null), [filtered])
  const pts     = useMemo<[number,number][]>(() => withGeo.map(o => o.coords!), [withGeo])

  const shownWithGeo = useMemo(() => {
    let list = withGeo
    if (showOutliers) list = list.filter(o => o.isOutlier)
    return list
  }, [withGeo, showOutliers])

  const LIMIT = 400
  const shown = shownWithGeo.slice(0, LIMIT)
  const outliersCount = useMemo(() => withGeo.filter(o => o.isOutlier).length, [withGeo])

  // Check if order is urgent (<= 10 mins remaining)
  const isOrderUrgent = useCallback((o: any) => {
    const status = (o.status || o.deliveryStatus || '').toLowerCase()
    if (status.includes('исполнен') || status.includes('доставлен') || status.includes('отменен')) return false
    
    const timeStr = getOrderTime(o, filterTimeSource)
    if (!timeStr || timeStr === 'Без времени') return false
    const mins = getUrgencyMins(timeStr)
    return mins !== null && mins <= 10
  }, [filterTimeSource])

  // Sort queue for sidebar: urgent first, then by time
  const sortedOrdersForSidebar = useMemo(() => {
    return [...shown].sort((a, b) => {
      const urgentA = isOrderUrgent(a)
      const urgentB = isOrderUrgent(b)
      if (urgentA && !urgentB) return -1
      if (!urgentA && urgentB) return 1
      
      const timeA = getOrderTime(a, filterTimeSource)
      const timeB = getOrderTime(b, filterTimeSource)
      const hasA = timeA && timeA !== 'Без времени'
      const hasB = timeB && timeB !== 'Без времени'
      if (!hasA && !hasB) return 0
      if (!hasA) return 1
      if (!hasB) return -1
      return timeA.localeCompare(timeB)
    })
  }, [shown, filterTimeSource, isOrderUrgent])

  const tileUrl = useMemo(() => {
    switch (mapStyle) {
      case 'satellite':
        return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      case 'dark':
        return 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      case 'light':
        return 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
      case 'humanitarian':
        return 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png'
      case 'cyclosm':
        return 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png'
      case 'osmfr':
        return 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png'
      case 'osm':
      default:
        return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
    }
  }, [mapStyle])

  const selClx = isDark
    ? 'bg-[#1a2035] border-white/10 text-white'
    : 'bg-gray-50 border-gray-200 text-gray-800'

  const btnBase = 'px-2.5 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all'
  const btnActive = 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20'
  const btnIdle = isDark ? 'border-white/10 text-gray-400 hover:text-white hover:border-white/20' : 'border-gray-200 text-gray-500 hover:text-gray-800'

  return (
    // flex-1 fills the main element (which is now flex-col in Layout)
    <div ref={mapContainerRef} className={clsx("flex-1 flex flex-col min-h-0 overflow-hidden", isDark ? 'bg-[#0b0f1a]' : 'bg-white')}>

      {/* ── Toolbar ─────────────────────────────────────── */}
      <div className={clsx(
        'flex flex-wrap items-center gap-y-3 gap-x-6 px-4 py-3 shrink-0 border-b text-[10px] uppercase font-black tracking-wider justify-between w-full',
        isDark ? 'bg-[#0d1222] border-white/5 text-gray-400' : 'bg-white border-gray-100 text-gray-500'
      )}>
        <div className="flex flex-wrap items-center gap-y-3 gap-x-5">
          {/* Title */}
          <div className="flex items-center gap-2 shrink-0">
            <MapIcon className="w-4 h-4 text-blue-500" />
            <span className="text-[11px] font-black uppercase tracking-widest text-blue-500">Карта</span>
          </div>

          <div className="hidden xl:block w-px h-5 bg-white/10 shrink-0" />

          {/* Group 1: Статус доставки */}
          <div className="flex items-center gap-2">
            <span className="opacity-50">Заказы:</span>
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
              className={clsx('text-[11px] font-bold uppercase px-2.5 py-1.5 rounded-lg border outline-none', selClx)}>
              <option value="all">Все статусы</option>
              {uniqueStatuses.map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>

            <select value={filterKitchen} onChange={e=>setFilterKitchen(e.target.value)}
              className={clsx('text-[11px] font-bold uppercase px-2.5 py-1.5 rounded-lg border outline-none', selClx)}>
              <option value="all">Вся кухня</option>
              <option value="ready">Готово (кухня)</option>
              <option value="waiting">Ждет кухню</option>
            </select>

            <select value={filterPaymentMethod} onChange={e=>setFilterPaymentMethod(e.target.value)}
              className={clsx('text-[11px] font-bold uppercase px-2.5 py-1.5 rounded-lg border outline-none max-w-[145px]', selClx)}>
              <option value="all">Все оплаты</option>
              {uniquePaymentMethods.map(pm => (
                <option key={pm} value={pm}>{pm}</option>
              ))}
            </select>
          </div>

          {/* Group 2: Курьеры */}
          <div className="flex items-center gap-2">
            <span className="opacity-50">Курьер:</span>
            <select value={filterCourier} onChange={e=>setFilterCourier(e.target.value)}
              className={clsx('text-[11px] font-bold uppercase px-2.5 py-1.5 rounded-lg border outline-none max-w-[145px]', selClx)}>
              <option value="all">Все курьеры</option>
              {couriers.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            
            <select value={filterTransport} onChange={e=>setFilterTransport(e.target.value)}
              className={clsx('text-[11px] font-bold uppercase px-2.5 py-1.5 rounded-lg border outline-none', selClx)}>
              <option value="all">Любой транспорт</option>
              <option value="auto">🚗 Авто</option>
              <option value="moto">🏍️ Мото / Скутер</option>
              <option value="foot">🚶 Пешком / Вело</option>
              <option value="unassigned">❓ Не назначен</option>
            </select>

            <button onClick={() => setShowCouriers(!showCouriers)}
              className={clsx('px-2.5 py-1.5 rounded-lg border transition-colors text-[11px] font-bold uppercase', 
                showCouriers ? 'bg-blue-500/10 border-blue-500/30 text-blue-500' : selClx)}>
              {showCouriers ? 'Скрыть список' : 'Списки'}
            </button>
          </div>

          {/* Group 3: Время и тайминги */}
          <div className="flex items-center gap-2">
            <span className="opacity-50">Сроки:</span>
            <select value={filterTimeSource} onChange={e=>setFilterTimeSource(e.target.value)}
              className={clsx('text-[11px] font-bold uppercase px-2.5 py-1.5 rounded-lg border outline-none', selClx)}>
              <option value="all">Все (точное + план)</option>
              <option value="plannedTime">Плановое (кухня)</option>
              <option value="deliverBy">Точное (клиенту)</option>
            </select>
            
            <select value={filterUrgency} onChange={e=>setFilterUrgency(e.target.value)}
              className={clsx('text-[11px] font-bold uppercase px-2.5 py-1.5 rounded-lg border outline-none', selClx)}>
              <option value="all">Все времена</option>
              <option value="late">Опаздывают</option>
              <option value="urgent">Горят (&lt;15м)</option>
              <option value="near">Скоро (15-45м)</option>
              <option value="far">Дальние (&gt;45м)</option>
            </select>
          </div>

          {/* Group 4: Визуализация карты */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="opacity-50">Карта:</span>
            <select value={lineMode} onChange={e=>setLineMode(e.target.value as any)}
              className={clsx('text-[11px] font-bold uppercase px-2.5 py-1.5 rounded-lg border outline-none', selClx)}>
              <option value="none">Без линий</option>
              <option value="straight">Прямые линии</option>
              <option value="road">Дороги (маршрут)</option>
            </select>

            <select value={mapStyle} onChange={e=>setMapStyle(e.target.value)}
              className={clsx('text-[11px] font-bold uppercase px-2.5 py-1.5 rounded-lg border outline-none', selClx)}>
              <option value="osm">OSM Стандарт</option>
              <option value="humanitarian">OSM HOT (Гуманитарная)</option>
              <option value="cyclosm">CyclOSM (Вело/Курьерская)</option>
              <option value="osmfr">OSM Франция</option>
              <option value="satellite">Спутник</option>
              <option value="dark">Темная карта</option>
              <option value="light">Светлая серая</option>
            </select>

            <button onClick={()=>setShowKml(v=>!v)} className={clsx(btnBase, showKml?btnActive:btnIdle)}>
              KML зоны {showKml && selectedHubs.length>0 && `(${selectedHubs.length})`}
            </button>
            
            <button onClick={()=>setShowOutliers(v=>!v)} 
              className={clsx(btnBase, showOutliers ? 'bg-red-500 border-red-400 text-white shadow-lg shadow-red-500/20' : (outliersCount > 0 ? 'bg-red-500/10 border-red-500/30 text-red-500' : btnIdle))}>
              Вне зоны ({outliersCount})
            </button>
            
            <button onClick={()=>setShowNoGeo(v=>!v)}
              className={clsx(btnBase, showNoGeo?'bg-orange-500 border-orange-400 text-white':btnIdle)}>
              Без гео ({noGeo.length})
            </button>

            <button onClick={toggleFullscreen} className={clsx(btnBase, btnIdle)}>
              <ArrowsPointingOutIcon className="inline w-3 h-3 mr-1" />
              Экран
            </button>

            {/* Clear Filters Button */}
            {(filterStatus !== 'all' || filterCourier !== 'all' || filterKitchen !== 'all' || filterTimeSource !== 'all' || filterUrgency !== 'all' || filterTransport !== 'all' || filterPaymentMethod !== 'all' || searchQuery !== '') && (
              <button 
                onClick={() => {
                  setFilterStatus('all')
                  setFilterCourier('all')
                  setFilterKitchen('all')
                  setFilterTimeSource('all')
                  setFilterUrgency('all')
                  setFilterTransport('all')
                  setFilterPaymentMethod('all')
                  setSearchQuery('')
                }}
                className={clsx(btnBase, 'bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white transition-colors')}
              >
                <XMarkIcon className="inline w-3 h-3 mr-1" />
                Сбросить фильтры
              </button>
            )}

            {/* Search Input */}
            <div className="relative flex items-center">
              <div className="absolute left-2 text-gray-400">
                <MagnifyingGlassIcon className="w-3.5 h-3.5" />
              </div>
              <input 
                type="text" 
                placeholder="Поиск по номеру, адресу..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={clsx(
                  'pl-7 pr-3 py-1.5 rounded-lg border outline-none text-[11px] font-bold w-48 transition-all',
                  isDark 
                    ? 'bg-white/5 border-white/10 text-white placeholder-gray-500 focus:border-blue-500 focus:bg-white/10' 
                    : 'bg-gray-50 border-gray-200 text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:bg-white'
                )}
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 text-gray-400 hover:text-red-500"
                >
                  <PlusIcon className="w-3.5 h-3.5 rotate-45" />
                </button>
              )}
            </div>

            {batchOrders.length > 0 && (
              <button onClick={() => {
                setBatchOrders([])
                setBatchRoute([])
                setBatchDistance(null)
                setBatchTime(null)
                setSolvedSequence([])
              }} className={clsx(btnBase, 'bg-red-600/20 border-red-500/30 text-red-500 hover:bg-red-600 hover:text-white transition-all duration-300 shadow-md shadow-red-500/10')}>
                🧹 Сбросить сборку ({batchOrders.length})
              </button>
            )}
          </div>
        </div>

        {/* Live stats */}
        <div className="flex items-center gap-3 shrink-0 ml-auto pt-2 lg:pt-0">
          {withGeo.length>LIMIT && <span className="text-[9px] text-yellow-400 font-bold">Лимит {LIMIT}/{withGeo.length}</span>}
          {([
          {v: shown.length,         l:'На карте',  c:'text-blue-400'},
          {v: withGeo.length,        l:'С геo',     c:'text-cyan-400'},
          {v: allOrders.length,      l:'Всего',     c:'text-gray-400'},
          {v: couriers.length,       l:'Курьеров',  c:'text-emerald-400'},
          ...(showKml?[{v:kmlZones.length,l:'Зон KML',c:'text-purple-400'}]:[]),
          ]).map(s=>(
            <div key={s.l} className="text-right">
              <div className={clsx('text-sm font-black tabular-nums', s.c)}>{s.v}</div>
              <div className="text-[8px] opacity-40 uppercase font-bold leading-none">{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Map */}
        <div className="flex-1 relative z-0">
          <MapContainer center={depot} zoom={12} maxZoom={18}
            style={{ height:'100%', width:'100%' }}
            zoomControl={false} preferCanvas={true} wheelPxPerZoomLevel={80} attributionControl={false}>
            <TileLayer url={tileUrl} keepBuffer={2} updateWhenZooming={false} updateWhenIdle={true} attribution="© OSM/Carto" />
            <ZoomControl position="bottomright" />
            <BoundsFitter pts={pts.length>0?pts:[depot]} />
            <SelectedOrderCentering pos={selectedOrderPos} onResetPos={() => setSelectedOrderPos(null)} />

            {/* KML server zones */}
            {activeKmlZones.map((z,i)=>{
              return <KmlZone key={z.key||i} name={z.name} path={z.normalizedPath} color={PAL[i%PAL.length]} />
            })}

            {/* Depot marker */}
            <Marker position={depot} icon={DEPOT_ICO}>
              <Popup autoPan={false}>
                <div style={{fontFamily:'Inter,system-ui,sans-serif',padding:'4px 0'}}>
                  <b>ТТ / ХАБ</b>
                  <div style={{fontSize:10,color:'#6b7280',marginTop:4,fontFamily:'monospace'}}>{depot[0].toFixed(5)}, {depot[1].toFixed(5)}</div>
                </div>
              </Popup>
            </Marker>



            {/* TSP/Batch Optimized Road Route (Neon glowing orange) */}
            {batchRoute.length > 0 && (
              <>
                <Polyline positions={batchRoute} pathOptions={{ color: '#d97706', weight: 12, opacity: 0.35, lineCap: 'round', lineJoin: 'round' }} />
                <Polyline positions={batchRoute} pathOptions={{ color: '#f59e0b', weight: 6, opacity: 0.8, lineCap: 'round', lineJoin: 'round' }} />
                <Polyline positions={batchRoute} pathOptions={{ color: '#fef08a', weight: 2.5, opacity: 1, lineCap: 'round', lineJoin: 'round' }} />
              </>
            )}

            {/* Orders */}
            {shown.map((o:any,i)=>(
              <OrderMarker
                key={o.id||o.orderNumber||i}
                o={o}
                seq={i+1}
                depot={depot}
                lineMode={lineMode}
                isOutlier={o.isOutlier}
                isDimmed={hoveredCourier !== null && (o.courier || o.courierName || '') !== hoveredCourier}
                isInBatch={batchOrderIds.has(o.id || o.orderNumber)}
                isUrgent={isOrderUrgent(o)}
                isSelected={selectedOrderId === (o.id || o.orderNumber)}
                onToggleBatch={toggleBatchOrder}
                onSelect={handleSelectOrder}
              />
            ))}
          </MapContainer>

          {/* Floaty interactive TSP/Batch Routing Panel (glassmorphism overlay) */}
          {batchOrders.length > 0 && (
            <div className="absolute bottom-4 left-4 z-[1000] w-64 bg-slate-900/90 backdrop-blur-md border border-white/10 rounded-xl p-3 text-white shadow-2xl flex flex-col gap-2.5 transition-all duration-300">
              <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  Сборка маршрута ({batchOrders.length})
                </span>
                <button
                  onClick={() => {
                    setBatchOrders([])
                    setBatchRoute([])
                    setBatchDistance(null)
                    setBatchTime(null)
                    setSolvedSequence([])
                  }}
                  className="text-[9px] font-bold text-gray-400 hover:text-white transition-colors uppercase"
                >
                  Сбросить
                </button>
              </div>

              {solvedSequence.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <div className="text-[9px] font-bold text-gray-400 uppercase">Оптимальный порядок доставки:</div>
                  <div className="flex flex-col gap-1 bg-white/[0.03] p-2 rounded-lg border border-white/5 max-h-36 overflow-y-auto">
                    {solvedSequence.map((o, idx) => (
                      <div key={o.id || o.orderNumber || idx} className="text-[10px] font-bold flex items-center gap-1.5 py-0.5 border-b border-white/5 last:border-0">
                        <span className="w-3.5 h-3.5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center text-[8px] font-black shrink-0">{idx + 1}</span>
                        <span className="text-gray-200">#{o.orderNumber || idx}</span>
                        <span className="text-gray-400 truncate max-w-[140px] text-[9px] font-medium font-sans">({o.address || '—'})</span>
                      </div>
                    ))}
                  </div>
                  
                  {batchDistance && batchTime && (
                    <div className="grid grid-cols-2 gap-2 bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg text-center mt-1">
                      <div>
                        <div className="text-[12px] font-black text-amber-400">{batchDistance} км</div>
                        <div className="text-[7px] text-gray-400 uppercase font-black">Общий путь</div>
                      </div>
                      <div>
                        <div className="text-[12px] font-black text-amber-400">{batchTime} мин</div>
                        <div className="text-[7px] text-gray-400 uppercase font-black">Время в пути</div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="text-[10px] text-gray-400 leading-snug">
                    Добавьте несколько заказов в сборку через маркеры на карте, чтобы рассчитать оптимальный порядок их доставки (задача коммивояжера) и реальный дорожный путь.
                  </div>
                  <button
                    onClick={solveBatchRoute}
                    disabled={isSolving}
                    className="w-full bg-amber-500 hover:bg-amber-600 active:scale-95 disabled:opacity-50 text-slate-950 text-[10px] font-black uppercase py-2 rounded-lg transition-all duration-150 flex items-center justify-center gap-1 shadow-lg shadow-amber-500/20"
                  >
                    {isSolving ? (
                      <span>Вычисляю оптимальный путь...</span>
                    ) : (
                      <span>Рассчитать маршрут доставки</span>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Sidebar - Queue of active orders */}
        <div className={clsx('w-56 shrink-0 flex flex-col border-l overflow-hidden transition-all duration-300',
          isDark ? 'bg-[#0f1424] border-white/5 text-white' : 'bg-gray-50 border-gray-100 text-gray-800'
        )}>
          <div className="px-3 py-2 border-b border-white/5 text-[9px] font-black uppercase tracking-widest text-blue-400 flex items-center justify-between">
            <span>Заказы ({shown.length})</span>
            <span className="opacity-40 text-[7px]">по {filterTimeSource === 'plannedTime' ? 'плану' : filterTimeSource === 'deliverBy' ? 'точным' : 'всем'}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {sortedOrdersForSidebar.map((o: any, i: number) => {
              const isUrgentThis = isOrderUrgent(o)
              const color = courierColor(o.courier || o.courierName || '')
              const timeVal = getOrderTime(o, filterTimeSource)
              const kitchenVal = o.kitchenTime || o.raw?.kitchenTime || '—'
              const orderNumberStr = String(o.orderNumber || i + 1)
              const isSelected = selectedOrderId === (o.id || o.orderNumber)

              return (
                <div key={o.id || o.orderNumber || i}
                  onClick={() => handleSelectOrder(o)}
                  className={clsx('relative p-2.5 rounded-lg border cursor-pointer transition-all duration-200 hover:scale-[1.02]',
                    isSelected 
                      ? (isDark ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-500/10' : 'bg-blue-50 border-blue-300 shadow-md')
                      : (isDark ? 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]' : 'bg-white border-gray-100 hover:bg-gray-50/50'),
                    isUrgentThis && 'border-amber-500/40 ring-1 ring-amber-500/20 bg-amber-500/[0.02]'
                  )}
                >
                  {isUrgentThis && (
                    <span className="absolute -top-1.5 right-2 bg-amber-500 text-slate-950 font-black text-[7px] px-1 py-0.5 rounded uppercase tracking-wider shadow">
                      Срочно
                    </span>
                  )}
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[10px] font-black uppercase text-gray-200" style={{ color: isSelected ? undefined : '#f3f4f6' }}>
                      #{orderNumberStr.slice(-6)}
                    </span>
                    {color && !o.courier?.toLowerCase().includes('не назначен') && o.courier !== 'по' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white" style={{ background: color }}>
                        {o.courier || o.courierName}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-semibold text-gray-400 truncate mt-1">{o.address || 'Нет адреса'}</div>
                  <div className="flex items-center justify-between text-[9px] mt-1.5 text-gray-500 font-mono">
                    <div>{timeVal}</div>
                    {kitchenVal !== '—' && <div className="text-emerald-500/90 font-sans font-bold">С кух.: {kitchenVal}</div>}
                  </div>
                  <div className="text-right mt-1">
                    <SidebarOrderRoadTime depot={depot} pos={getCoords(o)} isSelected={isSelected} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Courier legend */}
        {showCouriers && couriers.length>0 && (
          <div className={clsx('w-44 shrink-0 flex flex-col border-l overflow-hidden',
            isDark?'bg-[#0b0f1a] border-white/5':'bg-white border-gray-100')}>
            <div className="px-3 py-2 border-b border-white/5 text-[9px] font-black uppercase tracking-widest text-gray-500">
              Курьеры ({couriers.length})
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              <button onClick={()=>setFilterCourier('all')}
                className={clsx('w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[10px] font-bold text-left transition-colors',
                  filterCourier==='all'?'bg-blue-600 text-white':isDark?'hover:bg-white/5 text-gray-300':'hover:bg-gray-50 text-gray-700')}>
                <div className="w-2 h-2 rounded-full bg-gray-400 shrink-0" />
                <span className="flex-1 truncate">Все</span>
                <span className="opacity-50 text-[9px]">{allOrders.length}</span>
              </button>
              {couriers.map(c=>{
                const cnt = courierCounts[c] || 0
                const color = courierColor(c)
                return (
                  <button key={c}
                    onClick={()=>setFilterCourier(p=>p===c?'all':c)}
                    onMouseEnter={()=>setHoveredCourier(c)}
                    onMouseLeave={()=>setHoveredCourier(null)}
                    style={filterCourier===c?{background:color}:{}}
                    className={clsx('w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[10px] font-bold text-left transition-colors',
                      filterCourier===c?'text-white':isDark?'hover:bg-white/5 text-gray-300':'hover:bg-gray-50 text-gray-700')}>
                    <div className="w-2 h-2 rounded-full shrink-0" style={{background:color}} />
                    <span className="flex-1 truncate">{c}</span>
                    <span className="opacity-50 text-[9px]">{cnt}</span>
                  </button>
                )
              })}
            </div>
            {/* Depot info */}
            <div className="px-3 py-2.5 border-t border-white/5 text-[9px] font-mono text-gray-600 space-y-0.5">
              <div className="font-sans font-black text-[9px] uppercase tracking-widest text-gray-500 mb-1">Склад</div>
              <div>{depot[0].toFixed(5)}</div>
              <div>{depot[1].toFixed(5)}</div>
            </div>
          </div>
        )}

        {/* No-geo panel */}
        {showNoGeo && noGeo.length>0 && (
          <div className={clsx('w-56 shrink-0 flex flex-col border-l overflow-hidden',
            isDark?'bg-[#0b0f1a] border-white/5':'bg-white border-gray-100')}>
            <div className="px-3 py-2 border-b border-white/5 text-[9px] font-black uppercase tracking-widest text-orange-400 flex items-center gap-1.5">
              <MapPinIcon className="w-3 h-3" /> Без координат ({noGeo.length})
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {noGeo.map((o:any,i)=>(
                <div key={o.id||i} className={clsx('px-2.5 py-2 rounded-lg',
                  isDark?'bg-white/5':'bg-gray-50')}>
                  <div className="font-bold text-[10px]">#{o.orderNumber||'N/A'}</div>
                  <div className="opacity-50 truncate text-[9px] mt-0.5">{o.address||'—'}</div>
                  <div className="opacity-50 text-[9px]">{o.courier||o.courierName||'—'}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
