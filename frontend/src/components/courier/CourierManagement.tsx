import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense, useDeferredValue } from 'react'
import {
  UserIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import { clsx } from 'clsx'
import { EliteCourierCard } from './EliteCourierCard'
import { useExcelData } from '../../contexts/ExcelDataContext'
import { useTheme } from '../../contexts/ThemeContext'
import { toast } from 'react-hot-toast'
import { normalizeCourierName, getCourierName } from '../../utils/data/courierName'
import { localStorageUtils } from '../../utils/ui/localStorage'
import { DashboardHeader } from '../shared/DashboardHeader'
import { KpiAnalysisModal } from './KpiAnalysisModal'
import { AddressEditModal } from '../modals/AddressEditModal'

// v9.3: GEO-ERROR REPAIR HUD (STABLE)
// Added AddressEditModal, additive distance logic and clickable alerts
// RESTORED IMPORTS INTEGRITY

const MileageModal = lazy(() => import('../modals/MileageModal').then(m => ({ default: m.MileageModal })))

interface Courier {
  id: string
  name: string
  phone: string
  vehicleType: 'car' | 'motorcycle'
  location: string
  isActive: boolean
  orders: number
  ordersInRoutes?: number
  totalDistance: number
  geoErrorCount?: number
}

const ITEMS_PER_PAGE = 8;

export const CourierManagement: React.FC<{ excelData?: any }> = () => {
  const { excelData, updateExcelData } = useExcelData() || {};
  const { isDark } = useTheme()
  const [couriers, setCouriers] = useState<Courier[]>([])
  const [editingCourier, setEditingCourier] = useState<Courier | null>(null)
  const [activeVehicleTab, setActiveVehicleTab] = useState<'all' | 'car' | 'motorcycle'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false)
  const [showDistanceModal, setShowDistanceModal] = useState(false)
  const [showKpiModal, setShowKpiModal] = useState(false)
  const [selectedCourier, setSelectedCourier] = useState<Courier | null>(null)
  
  // Geocoding edit state
  const [showAddressModal, setShowAddressModal] = useState(false)
  const [editingOrder, setEditingOrder] = useState<any>(null)
  const [editingOrderRouteId, setEditingOrderRouteId] = useState<string | null>(null)

  const deferredSearchTerm = useDeferredValue(searchTerm)

  const getCourierStats = useCallback((name: string) => {
    const norm = normalizeCourierName(name);
    // Base data from uploaded excel/db
    const base = (excelData?.couriers || []).find((cur: any) => normalizeCourierName(cur.name) === norm);
    
    // Dynamic data from currently calculated routes (real-time sync)
    const routes = (excelData?.routes || []).filter((r: any) => {
      const rc = normalizeCourierName(r.courier || r.courier_id);
      return rc === norm && rc !== 'Не назначено';
    });
    
    const routeOrders = routes.reduce((sum: number, r: any) => 
      sum + (Number(r.ordersCount || r.orders_count || (r.orders ? r.orders.length : 0))), 0);

    const baseKm = base?.distanceKm || 0;

    // v9.7: REPLACEMENT logic to prevent double counting
    // The robot physical distance is a refined version of the base distance, NOT an addition to it.
    const robotPhysicalKm = routes.reduce((sum: number, r: any) => 
      sum + ((r.isOptimized && Number(r.totalDistance) > 0) ? Number(r.totalDistance) : 0), 0);
    
    const bonusKm = routes.reduce((sum: number, r: any) => 
      sum + (Number(r.ordersCount || r.orders_count || (r.orders ? r.orders.length : 0)) * 0.5), 0);

    // Final Physical is Robot if available, else File Base
    const effectivePhysicalKm = robotPhysicalKm > 0 ? robotPhysicalKm : baseKm;
    const totalDist = effectivePhysicalKm + bonusKm;

    return {
      totalDistance: totalDist,
      history: base?.distanceHistory || [],
      totalOrders: base?.calculatedOrders || (excelData?.orders || []).filter((o: any) => normalizeCourierName(getCourierName(o.courier)) === norm).length,
      ordersInRoutes: routeOrders,
      baseDistance: baseKm,
      robotDistance: robotPhysicalKm,
      bonusDistance: bonusKm,
      effectivePhysicalKm: effectivePhysicalKm
    }
  }, [excelData])

  const getCourierRoutes = useCallback((name: string) => {
    const n = normalizeCourierName(name);
    return (excelData?.routes || []).filter((r: any) => normalizeCourierName(getCourierName(r.courier || r.courier_id)) === n)
  }, [excelData])

  useEffect(() => {
    if (!excelData?.orders) return
    const names = new Set(
      (excelData.orders || [])
        .map((o: any) => normalizeCourierName(getCourierName(o.courier)))
        .filter((n: string) => n && n !== 'Не назначено')
    )
    const list = Array.from(names).map(name => {
      const ex = (excelData.couriers || []).find((c: any) => normalizeCourierName(c.name) === name)
      const st = getCourierStats(name as string);
      return {
        id: name as string,
        name: name as string,
        phone: ex?.phone || '',
        vehicleType: (ex?.vehicleType || 'car') as any,
        location: ex?.location || 'Base',
        isActive: true,
        orders: st.totalOrders,
        ordersInRoutes: st.ordersInRoutes,
        totalDistance: st.totalDistance,
        geoErrorCount: (excelData.orders || []).filter((o: any) =>
          normalizeCourierName(getCourierName(o.courier)) === name &&
          (o.geoError || o.locationType === 'FAILED' || o.locationType === 'APPROXIMATE')
        ).length
      }
    })
    setCouriers(list)
  }, [excelData, getCourierStats])

  const filtered = useMemo(() => {
    const s = deferredSearchTerm.toLowerCase();
    return couriers
      .filter(c => !s || c.name.toLowerCase().includes(s) || c.phone.toLowerCase().includes(s))
      .sort((a, b) => {
        if (a.vehicleType !== b.vehicleType) return a.vehicleType === 'car' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [couriers, deferredSearchTerm])

  const visible = useMemo(() => {
    if (activeVehicleTab === 'all') return filtered;
    return filtered.filter(c => activeVehicleTab === 'car' ? c.vehicleType === 'car' : c.vehicleType === 'motorcycle');
  }, [activeVehicleTab, filtered])

  const paginatedCouriers = useMemo(() => visible.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE), [visible, currentPage])
  const totalPages = Math.ceil(visible.length / ITEMS_PER_PAGE);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(totalPages);
  }, [totalPages, currentPage])

  const toggleCourierVehicleType = useCallback((id: string) => {
    setCouriers(prev => {
      const n = [...prev]; const i = n.findIndex(c => c.id === id);
      if (i !== -1) {
        const t = n[i].vehicleType === 'car' ? 'motorcycle' : 'car';
        n[i] = { ...n[i], vehicleType: t };
        updateExcelData?.((d: any) => ({
          ...d,
          couriers: (d.couriers || []).map((c: any) =>
            normalizeCourierName(c.name) === n[i].name ? { ...c, vehicleType: t } : c
          )
        }));
        toast.success(`Транспорт ${n[i].name}: ${t === 'car' ? 'Авто' : 'Мото'}`);
      }
      return n;
    })
  }, [updateExcelData])

  const handleRecalculateUnit = useCallback((c: any) => {
    window.dispatchEvent(new CustomEvent('km-force-auto-routing', { detail: { courierName: c.name } }));
  }, [])

  const handleDeleteCourier = useCallback((id: string) => {
    if (window.confirm('Удалить курьера?')) setCouriers(p => p.filter(c => c.id !== id));
  }, [])

  const handleKpiModalOpen = useCallback((c: Courier) => { setSelectedCourier(c); setShowKpiModal(true); }, [])
  const handleDistanceClick = useCallback((c: Courier) => { setSelectedCourier(c); setShowDistanceModal(true); }, [])
  const handleGeoErrorClick = useCallback((id: string) => {
    const c = couriers.find(cur => cur.id === id);
    if (c) { setSelectedCourier(c); setShowDistanceModal(true); toast('Проверьте адреса с меткой "Уточнить"', { icon: '🔍' }); }
  }, [couriers])

  const handleEditAddress = useCallback((order: any, routeId: string) => {
    setEditingOrder(order);
    setEditingOrderRouteId(routeId);
    setShowAddressModal(true);
  }, [])

  const handleSaveAddress = useCallback((newAddr: string, coords?: { lat: number; lng: number }) => {
    if (!editingOrder) return;
    updateExcelData?.((prev: any) => {
        const newData = { ...prev };
        newData.orders = (prev.orders || []).map((o: any) => o.id === editingOrder.id ? { ...o, address: newAddr, coords, geocoded: !!coords, geoError: false, locationType: coords ? 'ROOFTOP' : 'FAILED' } : o);
        newData.routes = (prev.routes || []).map((r: any) => ({
            ...r,
            orders: (r.orders || []).map((o: any) => o.id === editingOrder.id ? { ...o, address: newAddr, coords, geocoded: !!coords, geoError: false, locationType: coords ? 'ROOFTOP' : 'FAILED' } : o)
        }));
        return newData;
    });
    toast.success('Адрес обновлен');
    if (editingOrderRouteId) window.dispatchEvent(new CustomEvent('km-force-auto-routing', { detail: { routeId: editingOrderRouteId, reason: 'manual_fix' } }));
    setShowAddressModal(false);
  }, [editingOrder, editingOrderRouteId, updateExcelData])

  const handleEditClick = useCallback((c: Courier) => {
    setEditingCourier(c); setShowAddModal(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [])

  return (
    <div className="space-y-0 hud-grid min-h-screen">
      <DashboardHeader
        icon={UserIcon}
        title="КУРЬЕРСКИЙ ХАБ"
        statusMetrics={[{ label: "В СЕТИ", value: couriers.filter(c => c.isActive).length, color: "bg-[#10b981]" }, { label: "КУРЬЕРОВ", value: couriers.length }]}
        actions={<button onClick={() => setShowAddModal(true)} className="px-8 py-3.5 rounded-2xl font-black bg-blue-600 text-white flex items-center gap-3 shadow-xl active:scale-95 transition-all"><PlusIcon className="w-4 h-4" /><span>ДОБАВИТЬ КУРЬЕРА</span></button>}
      />

      <div className={clsx('px-6 py-4 flex flex-col md:flex-row gap-6 items-center justify-between border-b', isDark ? 'bg-[#080b12] border-white/5' : 'bg-slate-50 border-slate-200')}>
        <div className="flex-1 max-w-lg relative w-full group">
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-20 group-focus-within:opacity-100 transition-opacity" />
          <input type="text" placeholder="ПОИСК..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className={clsx('w-full pl-12 pr-12 py-3.5 rounded-2xl outline-none text-[10px] font-black uppercase tracking-widest', isDark ? 'bg-[#0c0f16] border border-white/5 text-white' : 'bg-white border text-slate-900')} />
        </div>
        <div className={clsx("flex p-1.5 gap-1.5 rounded-2xl border", isDark ? "bg-white/[0.03] border-white/5" : "bg-slate-100 border-slate-200")}>
          {['all', 'car', 'motorcycle'].map(tab => (
            <button key={tab} onClick={() => { setActiveVehicleTab(tab as any); setCurrentPage(1); }} className={clsx("py-3 px-6 rounded-xl text-[10px] font-black uppercase transition-all", activeVehicleTab === tab ? "bg-blue-600 text-white" : (isDark ? "text-white/40" : "text-slate-500"))}>{tab === 'all' ? 'ВСЕ' : tab === 'car' ? 'АВТО' : 'МОТО'}</button>
          ))}
        </div>
      </div>

      <div className="px-6 pb-6 pt-2 flex-1">
        {paginatedCouriers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {paginatedCouriers.map(c => (
              <EliteCourierCard key={c.id} courier={c} isDark={isDark} onEdit={handleEditClick} onDelete={handleDeleteCourier} onToggleVehicle={toggleCourierVehicleType} onRecalculate={handleRecalculateUnit} onDistanceClick={handleDistanceClick} onKpiClick={handleKpiModalOpen} onGeoErrorClick={handleGeoErrorClick} distanceDetails={getCourierStats(c.name)} />
            ))}
          </div>
        ) : (
          <div className="py-24 text-center opacity-30 uppercase tracking-tighter text-2xl font-black">Ничего не найдено</div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="px-6 py-10 flex items-center justify-center gap-6 shrink-0">
          <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} className={clsx("w-12 h-12 rounded-2xl border flex items-center justify-center", currentPage === 1 ? "opacity-20" : "bg-blue-600 text-white")}><ChevronLeftIcon className="w-5 h-5" /></button>
          <div className="flex items-center gap-2">
            {[...Array(totalPages)].map((_, i) => (
              <button key={i+1} onClick={() => setCurrentPage(i+1)} className={clsx("w-10 h-10 rounded-xl text-[10px] font-black", currentPage === i+1 ? "bg-blue-600 text-white" : "opacity-40")}>{i+1}</button>
            ))}
          </div>
          <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} className={clsx("w-12 h-12 rounded-2xl border flex items-center justify-center", currentPage === totalPages ? "opacity-20" : "bg-blue-600 text-white")}><ChevronRightIcon className="w-5 h-5" /></button>
        </div>
      )}

      {showKpiModal && selectedCourier && (
        <Suspense fallback={null}><KpiAnalysisModal courier={selectedCourier} allCouriers={couriers} isDark={isDark} onClose={() => setShowKpiModal(false)} /></Suspense>
      )}

      {showDistanceModal && selectedCourier && (
        <Suspense fallback={null}><MileageModal courier={selectedCourier} isDark={isDark} onClose={() => setShowDistanceModal(false)} getCourierStats={getCourierStats} getCourierRoutes={getCourierRoutes} onEditAddress={handleEditAddress} onDeleteRoute={() => {}} /></Suspense>
      )}

      {showAddressModal && editingOrder && (
        <AddressEditModal isOpen={showAddressModal} onClose={() => setShowAddressModal(false)} onSave={handleSaveAddress} currentAddress={editingOrder.address} orderNumber={editingOrder.orderNumber} isDark={isDark} />
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-[150] flex justify-end overflow-hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setShowAddModal(false); setEditingCourier(null); }} />
          <div className={clsx("relative w-full max-w-lg h-full shadow-2xl border-l flex flex-col", isDark ? "bg-[#080a0f] border-white/5" : "bg-white border-slate-100")}>
            <div className="p-10 border-b flex items-center justify-between shrink-0">
               <h3 className="text-2xl font-black uppercase">{editingCourier ? 'Правка курьера' : 'Новый курьер'}</h3>
               <button onClick={() => { setShowAddModal(false); setEditingCourier(null); }} className="p-4 rounded-3xl bg-white/5 border border-white/10 opacity-40 hover:opacity-100">✕</button>
            </div>
            <div className="flex-1 p-10 space-y-10 overflow-y-auto">
               <div className="space-y-6">
                 <div className="space-y-2"><label className="text-[9px] font-black uppercase opacity-30 ml-1">Имя курьера</label><input type="text" readOnly value={editingCourier?.name || ''} className={clsx("w-full p-5 rounded-3xl border font-black", isDark ? "bg-white/5 border-white/10 text-white/40" : "bg-slate-50 border-slate-100 text-slate-400")} /></div>
                 <div className="space-y-5 p-8 rounded-[2.5rem] border-2 border-blue-600/20 bg-blue-600/[0.03]">
                   <label className="text-[10px] font-black uppercase text-blue-500">Целевой КПД (км/зак)</label>
                   <input type="number" id="cp-target" step="0.1" defaultValue={(localStorageUtils.getCourierSettings() as any)[editingCourier?.name || '']?.targetKmPerOrder || 5.0} className={clsx("w-full p-6 h-20 rounded-3xl border-2 text-4xl font-black outline-none", isDark ? "bg-white/5 border-white/10 focus:border-blue-600" : "bg-white border-slate-100 focus:border-blue-600")} />
                 </div>
               </div>
            </div>
            <div className={clsx("p-10 border-t sticky bottom-0", isDark ? "bg-[#05070a]" : "bg-white")}>
               <button onClick={() => {
                   if (editingCourier) {
                       const v = parseFloat((document.getElementById('cp-target') as HTMLInputElement)?.value || '5.0');
                       const s = localStorageUtils.getCourierSettings();
                       s[editingCourier.name] = { ...s[editingCourier.name], targetKmPerOrder: v };
                       localStorageUtils.setCourierSettings(s);
                       toast.success('Параметры сохранены');
                       setCouriers(prev => [...prev]);
                   }
                   setShowAddModal(false); setEditingCourier(null);
               }} className="w-full h-20 bg-blue-600 text-white font-black uppercase rounded-3xl shadow-xl active:scale-95 transition-all">Применить настройки</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
