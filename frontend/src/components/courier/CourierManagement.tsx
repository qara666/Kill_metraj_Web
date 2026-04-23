import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense, useDeferredValue } from 'react'
import {
  UserIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import { clsx } from 'clsx'
import { CourierCarousel } from './CourierCarousel'
import { useExcelData } from '../../contexts/ExcelDataContext'
import { useTheme } from '../../contexts/ThemeContext'
import { toast } from 'react-hot-toast'
import { normalizeCourierName, getCourierName } from '../../utils/data/courierName'
import { getStableOrderId } from '../../utils/data/orderId'
import { localStorageUtils } from '../../utils/ui/localStorage'
import { useDashboardStore } from '../../stores/useDashboardStore'
import { DashboardHeader } from '../shared/DashboardHeader'
import { KpiAnalysisModal } from './KpiAnalysisModal'
import { AddressEditModal } from '../modals/AddressEditModal'
import { EliteCourierCard } from './EliteCourierCard'
import DistanceDetailModal from './DistanceDetailModal'
import { API_URL } from '../../config/apiConfig'
import { YapikoOSRMService } from '../../services/YapikoOSRMService'

// v9.3: GEO-ERROR REPAIR HUD (STABLE)
// Added AddressEditModal, additive distance logic and clickable alerts
// RESTORED IMPORTS INTEGRITY

// MileageModal migrated to DistanceDetailModal; removed old mileage modal usage

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
  const { excelData, updateExcelData, updateRouteData } = (useExcelData() as any) || {};
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

  const { autoRoutingStatus, divisionId } = useDashboardStore();
  const currentDivisionId = String(divisionId || '');

  // Memoize ALL courier stats at once to avoid creating new objects on each render
  // vXX.X: Use refs for volatile dependencies to prevent unnecessary recalculations
  const routesRef = useRef<any[]>([]);
  const ordersRef = useRef<any[]>([]);
  const couriersRef = useRef<any[]>([]);
  
  if (excelData?.routes) routesRef.current = excelData.routes;
  if (excelData?.orders) ordersRef.current = excelData.orders;
  if (excelData?.couriers) couriersRef.current = excelData.couriers;
  
  const allCourierStatsMap = useMemo(() => {
    const map: Record<string, any> = {};
    const routes = routesRef.current;
    const orders = ordersRef.current;
    const couriers = couriersRef.current;

    const isRoutableOrder = (o: any) => {
      const status = String(o?.status || o?.deliveryStatus || '').toLowerCase().trim();
      if (status.includes('отказ') || status.includes('отменен') || status.includes('відмова')) return false;
      if (status.includes('самовывоз') || status.includes('на месте')) return false;
      return true;
    };

    const isMatchingDiv = (dId: string) => {
      if (!currentDivisionId || currentDivisionId === 'all') return true;
      if (!dId) return true;
      return dId === currentDivisionId;
    };

    // First pass: collect all unique courier names from orders + routes + couriers
    const allNames = new Set<string>();
    orders.forEach((o: any) => {
      const n = normalizeCourierName(getCourierName(o.courier));
      if (n && n !== 'Не назначено') allNames.add(n);
    });
    routes.forEach((r: any) => {
      const n = normalizeCourierName(r.courier || r.courier_id);
      if (n && n !== 'Не назначено') allNames.add(n);
    });
    couriers.forEach((c: any) => {
      const n = normalizeCourierName(c.name);
      if (n && n !== 'Не назначено') allNames.add(n);
    });

    // Second pass: calculate stats for each courier using route-based data (authoritative from DB)
    allNames.forEach(norm => {
      // Filter routes for this courier
      const courierRoutes = routes.filter((r: any) => {
        const rc = normalizeCourierName(r.courier || r.courier_id);
        const dId = String(r.divisionId || r.division_id || '');
        return rc === norm && rc !== 'Не назначено' && rc !== '' && isMatchingDiv(dId);
      });

      // Count unique orders in routes (stable: based on actual route orders from DB)
      const uniqueRouteOrderIds = new Set<string>();
      courierRoutes.forEach((r: any) => {
        (r.orders || []).forEach((o: any) => {
          const sid = getStableOrderId(o);
          if (sid) uniqueRouteOrderIds.add(sid);
        });
      });

      // Always use route-based counting (DB is authoritative)
      const ordersInRoutes = uniqueRouteOrderIds.size;
      
      // Always use route-based km (DB is authoritative)
      const routeKm = courierRoutes.reduce((sum: number, r: any) => 
        sum + ((Number(r.totalDistance || r.total_distance) > 0) ? Number(r.totalDistance || r.total_distance) : 0), 0);

      // Base data
      const base = couriers.find((cur: any) => normalizeCourierName(cur.name) === norm);
      
      // Count total FO orders assigned to this courier
      const uniqueTotalOrderIds = new Set<string>();
      orders.forEach((o: any) => {
        const dId = String(o.divisionId || o.departmentId || o.division_id || '');
        if (normalizeCourierName(getCourierName(o.courier)) === norm && isRoutableOrder(o) && isMatchingDiv(dId)) {
          const sid = getStableOrderId(o);
          if (sid) uniqueTotalOrderIds.add(sid);
        }
      });

      const ordersAssignedRaw = uniqueTotalOrderIds.size;
      const totalOrdersCount = ordersAssignedRaw > 0 ? ordersAssignedRaw : ordersInRoutes;

      const baseKm = base?.distanceKm || 0;
      const physicalDist = routeKm > 0 ? routeKm : baseKm;
      const bonusDist = ordersInRoutes * 0.5;
      const finalTotal = physicalDist + bonusDist;

      map[norm] = {
        totalDistance: finalTotal,
        history: base?.distanceHistory || [],
        totalOrders: totalOrdersCount,
        ordersInRoutes,
        baseDistance: baseKm,
        robotDistance: routeKm,
        bonusDistance: bonusDist,
        effectivePhysicalKm: physicalDist,
        routes: courierRoutes
      };
    });

    return map;
  }, [routesRef.current, ordersRef.current, couriersRef.current, currentDivisionId]);

const getCourierStats = useCallback((name: string) => {
    return allCourierStatsMap[name] || allCourierStatsMap[normalizeCourierName(name)] || { totalDistance: 0, totalOrders: 0, ordersInRoutes: 0 };
  }, [allCourierStatsMap]);

  // v37.0: ULTIMATE ROBUST COURIER LIST BUILDING
  // Combines name lists from FO orders, DB Routes, and Real-time Robot Status
  useEffect(() => {
    const orders = excelData?.orders || [];
    const routes = excelData?.routes || [];

    // v9.9: ROBUST DIVISION FILTERING
    // Filter orders and routes by the current active division before collecting names.
    // We allow empty division IDs to prevent data loss if the field is missing in the payload.
    const isMatchingDiv = (dId: string) => {
        if (!currentDivisionId || currentDivisionId === 'all') return true;
        if (!dId) return true; // Allow if no division specified (legacy/excel fallback)
        return dId === currentDivisionId;
    };

    const filteredOrders = orders.filter((o: any) => isMatchingDiv(String(o.divisionId || o.departmentId || o.division_id || '')));
    const filteredRoutes = routes.filter((r: any) => isMatchingDiv(String(r.divisionId || r.division_id || '')));
    const filteredBaseCouriers = (excelData?.couriers || []).filter((c: any) => isMatchingDiv(String(c.divisionId || c.division_id || '')));

    const names = new Set<string>();
    
    // 1. Names from orders (Primary FO Source)
    filteredOrders.forEach((o: any) => {
      const n = normalizeCourierName(getCourierName(o.courier));
      if (n && n !== 'Не назначено') names.add(n);
    });

    // 2. Names from routes (Database Fallback)
    filteredRoutes.forEach((r: any) => {
      const n = normalizeCourierName(r.courier || r.courier_id);
      if (n && n !== 'Не назначено') names.add(n);
    });

    // 3. Names from base couriers list
    filteredBaseCouriers.forEach((c: any) => {
      const n = normalizeCourierName(c.name);
      if (n && n !== 'Не назначено') names.add(n);
    });

    const list = Array.from(names).map(name => {
      const ex = (excelData?.couriers || []).find((c: any) => normalizeCourierName(c.name) === name);
      const st = getCourierStats(name);
      
      return {
        id: name,
        name: name,
        phone: ex?.phone || '',
        vehicleType: (ex?.vehicleType || 'car') as any,
        location: ex?.location || 'Base',
        isActive: true,
        orders: st.totalOrders,
        ordersInRoutes: st.ordersInRoutes,
        totalDistance: st.totalDistance,
        geoErrorCount: filteredOrders.filter((o: any) => 
          normalizeCourierName(getCourierName(o.courier)) === name && 
          (o.geoError === true || o.locationType === 'FAILED')
        ).length
      };
    });

    // Handle initial loading states better
    if (list.length > 0 || !excelData?.loading) {
      setCouriers(list);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excelData?.orders, excelData?.routes, excelData?.couriers, currentDivisionId]);


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

  const paginatedCouriers = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return visible.length > ITEMS_PER_PAGE ? visible.slice(start, start + ITEMS_PER_PAGE) : visible;
  }, [visible, currentPage])
  
  const totalPages = Math.ceil(visible.length / ITEMS_PER_PAGE);

  const pageNumbers = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < totalPages; i++) arr.push(i + 1);
    return arr;
  }, [totalPages]);

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

  const handleRecalculateUnit = useCallback(async (c: any) => {
    try {
      const token = localStorage.getItem('km_access_token');
      const divId = excelData?.divisionId || 'all';
      const todayIso = new Date().toISOString().split('T')[0];
      
      toast(`🚀 Запуск Turbo Калькулятора для ${c.name}...`, { icon: '⚡' });
      
      const res = await fetch(`${window.location.origin.includes('localhost') ? 'http://localhost:5001' : ''}/api/turbo/priority`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
      body: JSON.stringify({
        divisionId: divId,
        date: todayIso,
        force: false,
        courierName: c.name
      })
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`Розрахунок запущено для ${c.name}`);
        // v9.9: Also dispatch local event for compatibility
        window.dispatchEvent(new CustomEvent('km-force-auto-routing', { detail: { courierName: c.name } }));
      } else {
        throw new Error(data.error || data.message || 'Ошибка запуска');
      }
    } catch (e: any) {
      console.error('[CourierManagement] Failed to trigger calculation:', e);
      toast.error('Не вдалося запустити розрахунок: ' + e.message);
    }
  }, [excelData?.divisionId])

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

  const handleSaveAddress = useCallback(async (newAddr: string, coords?: { lat: number; lng: number }) => {
    if (!editingOrder) return;

    if (coords) {
        try {
            const token = localStorage.getItem('km_access_token');
            await fetch(`${API_URL}/api/geocache/manual-correct`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ address: newAddr, lat: coords.lat, lng: coords.lng })
            });
        } catch (e) { console.warn('[handleSaveAddress] Geocache persist failed:', e); }
    }

    updateExcelData?.((prev: any) => ({
        ...prev,
        orders: (prev.orders || []).map((o: any) =>
            o.id === editingOrder.id ? { ...o, address: newAddr, coords, geocoded: !!coords, geoError: false, locationType: coords ? 'ROOFTOP' : 'FAILED', manualGeocoding: true } : o
        )
    }));

    if (!editingOrderRouteId) { toast.success('Адрес сохранен'); setShowAddressModal(false); return; }

    const routes = excelData?.routes || [];
    const route = routes.find((r: any) => String(r.id) === String(editingOrderRouteId));
    if (!route) { toast.success('Адрес сохранен'); setShowAddressModal(false); return; }

    try {
        const presets = localStorageUtils.getAllSettings();
        const osrmUrl = presets.osrmUrl || 'http://116.204.153.171:5050';
        const start = route.startCoords || route.route_data?.startCoords
            || (presets.defaultStartLat ? { lat: Number(presets.defaultStartLat), lng: Number(presets.defaultStartLng) } : null)
            || { lat: 49.9935, lng: 36.2304 };
        const end = route.endCoords || route.route_data?.endCoords || route.geoMeta?.destination
            || (presets.defaultEndLat ? { lat: Number(presets.defaultEndLat), lng: Number(presets.defaultEndLng) } : null)
            || start;

        const updatedOrders = (route.orders || []).map((o: any) =>
            o.id === editingOrder.id ? { ...o, address: newAddr, coords, geocoded: !!coords, geoError: false, locationType: coords ? 'ROOFTOP' : 'FAILED', manualGeocoding: true } : o
        );

        const validOrders = updatedOrders.filter((o: any) => {
            const c = o.coords || { lat: o.lat, lng: o.lng };
            return c?.lat && c?.lng && c.lat !== 0;
        });

        let newKm = 0, newDuration = 0, geometry: any = undefined, geoMeta: any = undefined;

        if (validOrders.length > 0) {
            const waypoints = validOrders.map((o: any) => o.coords || { lat: o.lat, lng: o.lng });
            const res = await YapikoOSRMService.calculateRoute([start, ...waypoints, end], osrmUrl);
            if (res.feasible && res.totalDistance != null) {
                newKm = res.totalDistance / 1000;
                newDuration = Math.round((res.totalDuration || 0) / 60);
                geometry = res.geometry;
                geoMeta = { origin: { lat: start.lat, lng: start.lng }, destination: { lat: end.lat, lng: end.lng }, waypoints };
            }
        }

        const finalRoute = { ...route, orders: updatedOrders, totalDistance: newKm, totalDuration: newDuration, geometry, geoMeta };
        const token = localStorage.getItem('km_access_token') || localStorage.getItem('token');
        const saveRes = await fetch(`${API_URL}/api/routes/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(finalRoute)
        });
        if (!saveRes.ok) throw new Error(`Save failed: ${saveRes.status}`);

        const updatedRoutes = (excelData?.routes || []).map((r: any) =>
            String(r.id) === String(editingOrderRouteId) ? finalRoute : r
        );
        updateRouteData?.(updatedRoutes);

        toast.success(`Сохранено: ${newKm > 0 ? newKm.toFixed(1) + ' км' : 'без км'}`, { id: 'addr-save' });
        setShowAddressModal(false);
    } catch (err) {
        console.warn('[handleSaveAddress]', err);
        toast.error('Ошибка', { id: 'addr-save' });
    }
  }, [editingOrder, editingOrderRouteId, excelData?.routes, updateExcelData, updateRouteData, selectedCourier])

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

      <div className="px-10 pb-20 pt-10">
        {paginatedCouriers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {paginatedCouriers.map(c => (
              <EliteCourierCard 
                key={c.id}
                courier={c}
                isDark={isDark}
                distanceDetails={getCourierStats(c.name)}
                onEdit={handleEditClick}
                onDelete={handleDeleteCourier}
                onToggleVehicle={toggleCourierVehicleType}
                onRecalculate={handleRecalculateUnit}
                onDistanceClick={handleDistanceClick}
                onKpiClick={handleKpiModalOpen}
              />
            ))}
          </div>
        ) : (
          <div className="py-24 text-center opacity-30 uppercase tracking-tighter text-4xl font-black">Ничего не найдено</div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="px-6 py-10 flex items-center justify-center gap-6 shrink-0">
          <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} className={clsx("w-12 h-12 rounded-2xl border flex items-center justify-center", currentPage === 1 ? "opacity-20" : "bg-blue-600 text-white")}><ChevronLeftIcon className="w-5 h-5" /></button>
          <div className="flex items-center gap-2">
            {pageNumbers.map(i => (
              <button key={i} onClick={() => setCurrentPage(i)} className={clsx("w-10 h-10 rounded-xl text-[10px] font-black", currentPage === i ? "bg-blue-600 text-white" : "opacity-40")}>{i}</button>
            ))}
          </div>
          <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} className={clsx("w-12 h-12 rounded-2xl border flex items-center justify-center", currentPage === totalPages ? "opacity-20" : "bg-blue-600 text-white")}><ChevronRightIcon className="w-5 h-5" /></button>
        </div>
      )}

  {showKpiModal && selectedCourier && (
        <Suspense fallback={null}><KpiAnalysisModal courier={selectedCourier} allCouriers={couriers} isDark={isDark} onClose={() => setShowKpiModal(false)} /></Suspense>
      )}

      {showDistanceModal && selectedCourier && (
        <DistanceDetailModal 
          isOpen={showDistanceModal}
          onClose={() => setShowDistanceModal(false)}
          courierName={selectedCourier.name}
          distanceDetails={getCourierStats(selectedCourier.name)}
          onEditAddress={handleEditAddress}
          onUpdateRoutes={updateRouteData}
        />
      )}

      {showAddressModal && editingOrder && (
        <AddressEditModal isOpen={showAddressModal} onClose={() => setShowAddressModal(false)} onSave={handleSaveAddress} currentAddress={editingOrder.address} orderNumber={editingOrder.orderNumber} isDark={isDark} />
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-[150] flex justify-end overflow-hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => { setShowAddModal(false); setEditingCourier(null); }} />
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
