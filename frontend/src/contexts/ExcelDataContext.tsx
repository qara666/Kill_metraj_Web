import * as React from 'react'
import { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback, useMemo } from 'react'
import { localStorageUtils } from '../utils/ui/localStorage'
import { toast } from 'react-hot-toast'
import { normalizeCourierName, isId0CourierName } from '../utils/data/courierName'
import { normalizeDateToIso } from '../utils/data/dateUtils'
import { getStableOrderId } from '../utils/data/orderId'
import { CourierIdResolver } from '../utils/data/courierIdMap'
import { useDashboardStore } from '../stores/useDashboardStore'
import { API_URL } from '../config/apiConfig'
import { crossTabSync } from '../services/crossTabSync'

// Встроенные гео-утилиты (ранее из excelProcessor)
const parseAddressGeo = (str: string): { lat?: number; lng?: number; address?: string } => {
  if (!str) return {};
  const res: any = {};
  const latMatch = str.match(/Lat=["']?([^"'\s>]+)["']?/i);
  const lngMatch = str.match(/Long=["']?([^"'\s>]+)["']?/i);
  const addrMatch = str.match(/AddressStr=["']?([^"'>]+)["']?/i);
  if (latMatch) { const lat = parseFloat(latMatch[1].replace(',','.')); if (!isNaN(lat)) res.lat = lat; }
  if (lngMatch) { const lng = parseFloat(lngMatch[1].replace(',','.')); if (!isNaN(lng)) res.lng = lng; }
  if (addrMatch) res.address = addrMatch[1].trim();
  if (!res.lat || !res.lng) {
    const latTextMatch = str.match(/(?:Широта|Latitude|Lat)[:\s]+([-+]?\d+[.,]\d+)/i);
    const lngTextMatch = str.match(/(?:Долгота|Longitude|Long|Lng)[:\s]+([-+]?\d+[.,]\d+)/i);
    if (latTextMatch) { const lat = parseFloat(latTextMatch[1].replace(',','.')); if (!isNaN(lat)) res.lat = lat; }
    if (lngTextMatch) { const lng = parseFloat(lngTextMatch[1].replace(',','.')); if (!isNaN(lng)) res.lng = lng; }
  }
  if (!res.lat || !res.lng) {
    const pairMatch = str.match(/^\s*([-+]?\d+[.,]\d+)\s*[,; \t]+\s*([-+]?\d+[.,]\d+)\s*$/);
    if (pairMatch) { res.lat = parseFloat(pairMatch[1].replace(',','.')); res.lng = parseFloat(pairMatch[2].replace(',','.')); }
  }
  
  if (res.lat && res.lng) {
    try {
      const settings = localStorageUtils.getAllSettings()
      const depotLat = Number(settings.defaultStartLat)
      const depotLng = Number(settings.defaultStartLng)
      if (!isNaN(depotLat) && !isNaN(depotLng) && (depotLat !== 0 || depotLng !== 0)) {
        const distUnswapped = Math.abs(res.lat - depotLat) + Math.abs(res.lng - depotLng)
        const distSwapped = Math.abs(res.lng - depotLat) + Math.abs(res.lat - depotLng)
        if (distSwapped < distUnswapped && distSwapped < 3.0) {
          const tmp = res.lat
          res.lat = res.lng
          res.lng = tmp
        }
      }
    } catch (e) {
      // Ignore if localStorage is not ready
    }
  }
  return res;
};

const enrichOrderGeodata = (order: any): any => {
  if (!order) return order;
  if (order.coords?.lat && order.coords?.lng && order.isAddressLocked) return order;
  const geoRaw = order.addressGeo || order.address_geo || order.coords ||
                 order['координаты'] || order['широта/долгота'] || order['lat/lng'] ||
                 order.location || order.point;
  if (geoRaw) {
    const geoData = parseAddressGeo(String(geoRaw));
    if (geoData.lat && geoData.lng) {
      return {
        ...order,
        coords: { lat: geoData.lat, lng: geoData.lng },
        latitude: geoData.lat,
        longitude: geoData.lng,
        isAddressLocked: true,
        addressGeoStr: geoData.address || order.addressGeoStr || String(geoRaw)
      };
    }
  }
  return order;
};


interface ExcelData {
  orders: any[]
  couriers: any[]
  paymentMethods: any[]
  routes: any[]
  errors: any[]
  uncalculatedOrders?: any[]
  summary: any
  lastModified?: number
  creationDate?: string
  loading?: boolean
  divisionId?: string | number
  _lastManualRouteUpdate?: number
}

interface ExcelDataContextType {
  excelData: ExcelData | null
  setExcelData: (data: ExcelData | null, force?: boolean) => void
  updateExcelData: (dataOrUpdater: ExcelData | ((prev: ExcelData) => ExcelData), force?: boolean) => void
  clearExcelData: (options?: { skipServerWipe?: boolean }) => void;
  updateRouteData: (routes: any[]) => void
  updateOrderPaymentMethod: (orderNumber: string, newPaymentMethod: string) => void
  saveManualOverrides: (orders: any[]) => void
}

const ExcelDataContext = createContext<ExcelDataContextType | undefined>(undefined)



export const useExcelData = () => {
  const context = useContext(ExcelDataContext)
  if (context === undefined) {
    throw new Error('useExcelData must be used within an ExcelDataProvider')
  }
  return context
}

interface ExcelDataProviderProps {
  children: ReactNode
}

export const ExcelDataProvider: React.FC<ExcelDataProviderProps> = ({ children }) => {
  const [excelData, setExcelDataState] = useState<ExcelData | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const local = localStorage.getItem('km_dashboard_processed_data');
      return local ? JSON.parse(local) : null;
    } catch { return null; }
  });
  const hasInit = useRef(false)
  const excelDataRef = useRef<ExcelData | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isInitialLoadRef = useRef(true)
  const lastSetTimeRef = useRef<number>(0)

  // Вспомогательная функция для получения маршрутов с текущей датой
  const fetchRoutesWithDate = useCallback(async (token: string) => {
    const storeState = useDashboardStore.getState();
    const apiDateShift = storeState.apiDateShift;
    const divisionId = storeState.divisionId;
    const apiDepartmentId = storeState.apiDepartmentId;
    
    const excelDivId = excelDataRef.current?.divisionId;
    
    const effectiveDivisionId = apiDepartmentId ? String(apiDepartmentId)
        : (divisionId || (excelDivId ? String(excelDivId) : ''));
    
    let normalizedDate = '';
    if (apiDateShift) {
      if (/^\d{2}\.\d{2}\.\d{4}$/.test(apiDateShift)) {
        const parts = apiDateShift.split('.');
        normalizedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(apiDateShift)) {
        normalizedDate = apiDateShift;
      }
    }
    
    const params = new URLSearchParams();
    if (normalizedDate) params.set('date', normalizedDate);
    if (effectiveDivisionId) params.set('divisionId', effectiveDivisionId);
    params.set('t', String(Date.now()));
    const url = `${API_URL}/api/routes/calculated?${params.toString()}`;
    
    const routesRes = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    let allRoutes = [];
    if (routesRes.ok) {
      try {
        const text = await routesRes.text();
        const routesJson = JSON.parse(text);
        allRoutes = routesJson.data || [];
      } catch (parseErr) {
        console.warn('[fetchRoutes] JSON parse error, returning empty:', parseErr);
      }
    } else {
      console.warn('[fetchRoutes] API returned status:', routesRes.status);
    }
    
    return allRoutes;
  }, []);

  useEffect(() => {
    excelDataRef.current = excelData
  }, [excelData])

  useEffect(() => {
    if (!hasInit.current) {
      hasInit.current = true

      const loadData = async () => {
        const rehydrateManualRoutes = (data: any) => {
          if (!data || !Array.isArray(data.routes) || !Array.isArray(data.orders)) return;
          data.routes.forEach((r: any) => {
            if (String(r.id || '').startsWith('route_') && Array.isArray(r.orders)) {
              r.orders = r.orders.map((strippedOrder: any) => {
                const fullOrder = data.orders.find((po: any) => String(po.id) === String(strippedOrder.id));
                return fullOrder ? { ...strippedOrder, ...fullOrder } : strippedOrder;
              });
            }
          });
        };

        // v5.202: Обогащение заказов маршрута полными данными из главного списка
        const enrichRouteOrders = (data: any) => {
          if (!data || !Array.isArray(data.routes) || !Array.isArray(data.orders)) return data;
          const masterOrdersMap = new Map(data.orders.map((o: any) => [String(o.id), o]));
          const masterOrdersByNumber = new Map(data.orders.map((o: any) => [String(o.orderNumber), o]));
          
          data.routes = data.routes.map((route: any) => {
            if (!route.orders || !Array.isArray(route.orders)) return route;
            return {
              ...route,
              orders: route.orders.map((routeOrder: any) => {
                const masterById = masterOrdersMap.get(String(routeOrder.id));
                const masterByNumber = masterOrdersByNumber.get(String(routeOrder.orderNumber));
                const master = masterById || masterByNumber;
                if (master) {
                  return { ...routeOrder, ...master };
                }
                return routeOrder;
              })
            };
          });
          return data;
        };

        try {
          // v5.205: обновлено до v3 для очистки баганутых состояний 1/18
          const localRaw = localStorage.getItem('km_dashboard_processed_data_v4');
          let localData = null;
          if (localRaw) {
            try {
              localData = JSON.parse(localRaw);
            } catch (e) {}
          }
          
    // v5.204+: ПРОВЕРКА ДАТЫ перед использованием локальных данных
    // Отбрасывать если даты не совпадают чтобы избежать бага "вчерашние заказы"
          if (localData) {
            const currentShift = useDashboardStore.getState().apiDateShift; // ГГГГ-ММ-ДД или ДД.ММ.ГГГГ
            
            // v5.210: Вспомогательная функция: любой формат даты → ДД.ММ.ГГГГ
            const toDisplayDate = (raw: any): string => {
              if (!raw) return '';
              // Числовой timestamp (Unix ms) — конвертируем через Date
              if (typeof raw === 'number' || (typeof raw === 'string' && /^\d{10,}$/.test(raw))) {
                const d = new Date(Number(raw));
                if (!isNaN(d.getTime())) {
                  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
                }
                return '';
              }
              const s = String(raw).split(' ')[0].split('T')[0];
              // ГГГГ-ММ-ДД → ДД.ММ.ГГГГ
              if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
                const [y, m, d] = s.split('-');
                return `${d}.${m}.${y}`;
              }
              // ДД.ММ.ГГГГ — уже нужный формат
              if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return s;
              return '';
            };

            // Целевая дата: из стора или сегодня как фолбэк (КРИТИЧНО: никогда не оставлять пустым)
            const todayForCheck = (() => {
              const now = new Date();
              return `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`;
            })();
            const targetDate = toDisplayDate(currentShift) || todayForCheck;
            
            // Нормализация даты localData: приоритет у top-level creationDate, затем первый заказ
            const localDateNormalized = toDisplayDate(localData.creationDate)
              || toDisplayDate(localData.orders?.[0]?.creationDate)
              || '';

            // v5.210: СТРОГАЯ ПРОВЕРКА ДАТЫ — сбрасывать кэш при любом несовпадении
            // Если localDateNormalized пуст — тоже сбрасывать (неизвестные данные опасны)
            if (!localDateNormalized || targetDate !== localDateNormalized) {
                console.warn(`[ExcelSync] Cache date guard: target=${targetDate}, cached=${localDateNormalized || 'UNKNOWN'}. Clearing stale cache.`);
                localStorage.removeItem('km_dashboard_processed_data_v4');
                localData = null;
            }
          }
          
          // v5.202: Если есть валидные локальные данные, использовать их НЕМЕДЛЕННО
          if (localData && localData.orders && localData.orders.length > 0) {
            // v5.202: Обогащение заказов маршрута полными данными
            try { enrichRouteOrders(localData); } catch (e) {}
            
            // v5.202: Объединение с маршрутами БД для полноты
            try {
              const token = localStorage.getItem('km_access_token');
              if (token) {
                const dbRoutes = await fetchRoutesWithDate(token);
                if (dbRoutes.length > 0) {
                  const existingRoutes = Array.isArray(localData.routes) ? localData.routes : [];
                  const allRouteIds = new Set<string>();
                  const mergedRoutes: any[] = [];
                  
                  // Приоритет 1: Маршруты БД
                  dbRoutes.forEach((r: any) => {
                    const rid = String(r.id || '');
                    if (rid && !allRouteIds.has(rid)) {
                      allRouteIds.add(rid);
                      mergedRoutes.push(r);
                    }
                  });
                  
                  // Приоритет 2: Локальные ручные маршруты
                  existingRoutes.forEach((r: any) => {
                    const rid = String(r.id || '');
                    if (rid.startsWith('route_') && !allRouteIds.has(rid)) {
                      allRouteIds.add(rid);
                      mergedRoutes.push(r);
                    }
                  });
                  
                  localData.routes = mergedRoutes;
                }
              }
            } catch (e) {
              console.warn('[ExcelSync] DB route merge failed:', e);
            }
            
            rehydrateManualRoutes(localData);
            const timeSinceLastSet = Date.now() - lastSetTimeRef.current;
            if (timeSinceLastSet > 2000 || lastSetTimeRef.current === 0) {
              setExcelDataState(localData);
            } else {
              console.info('[ExcelSync] Skipping localStorage load — fresh data already set externally');
            }
            return;
          }

          // v5.202: Пробовать сервер только если локальные данные пусты/отсутствуют
          const token = localStorage.getItem('km_access_token');
          if (token) {
            try {
              const response = await fetch(`${API_URL}/api/v1/state`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              
              if (response.ok) {
                const json = await response.json();
                if (json.success && json.data) {
                  setExcelDataState(json.data);
                  return;
                }
              }
            } catch (e) {
              console.warn('[ExcelSync] Server load failed:', e);
            }
          }

          // v5.202: Финальный откат - если ни localStorage ни сервер не сработали, пробуем только маршруты БД

          // Этот блок должен выполняться только если localData был пуст/отсутствовал в начале
          const fallbackLocalRaw = localStorage.getItem('km_dashboard_processed_data');
          if (fallbackLocalRaw) {
            try {
              const parsed = JSON.parse(fallbackLocalRaw);
              if (parsed.orders && parsed.orders.length > 0) {
                // Обычно сюда не должны попадать так как localStorage обрабатывается в начале
                rehydrateManualRoutes(parsed);
                setExcelDataState(parsed);
                return;
              }
            } catch (e) {}
          }
        } catch (error) {
          console.error('Error loading data:', error);
        }
      }
      loadData()
    }
  }, [])

  // Cross-tab sync via BroadcastChannel (replaces localStorage storage events)
  useEffect(() => {
    const handleTurboRoutes = (e: Event) => {
      const { routes, couriers: eventCouriers, geoErrorOrders: eventGeoErrors, uncalculatedOrders: eventUncalc, skippedNoCourier, skippedGeocoding, centroidFallbackCount } = (e as CustomEvent).detail || {};
      if (routes && Array.isArray(routes) && routes.length > 0) {
        const now = Date.now();
        lastSocketRouteUpdateRef.current = now;
        lastProcessedRouteIdsRef.current = routes;
        
        const courierGeoErrorMap: Record<string, any[]> = {};
        if (Array.isArray(eventGeoErrors)) {
          eventGeoErrors.forEach((e: any) => {
            const cn = normalizeCourierName(e.courier || '');
            if (!cn) return;
            if (!courierGeoErrorMap[cn]) courierGeoErrorMap[cn] = [];
            courierGeoErrorMap[cn].push(e);
          });
        }
        if (Array.isArray(eventCouriers)) {
          eventCouriers.forEach((ec: any) => {
            const cn = normalizeCourierName(ec.courierName || ec.name || '');
            if (cn && Array.isArray(ec.geoErrorOrders) && ec.geoErrorOrders.length > 0) {
              courierGeoErrorMap[cn] = ec.geoErrorOrders;
            }
          });
        }
        
        const validatedRoutes = routes.map((route: any) => {
          const rawCourier = route.courier || route.courier_id || route.courierName || '';
          const normCourier = normalizeCourierName(rawCourier);
          
          if (!normCourier || normCourier === 'Не назначено' || normCourier.toLowerCase() === 'по') {
            return null;
          }
          
          const fixedRoute = {
            ...route,
            courier: normCourier,
            courier_id: normCourier,
          };
          
          if (route.orders && Array.isArray(route.orders)) {
            fixedRoute.orders = route.orders.map((order: any) => {
              const orderCourier = order.courier || '';
              const normOrderCourier = normalizeCourierName(orderCourier);
              return {
                ...order,
                courier: normOrderCourier || normCourier,
              };
            });
          }
          
          return fixedRoute;
        }).filter(Boolean);
        
        if (validatedRoutes.length === 0 && routes.length > 0) {
          return;
        }
        
        setExcelDataState(prev => {
          if (!prev) {
              return {
                  orders: [], couriers: [], addresses: [], paymentMethods: [],
                  routes: validatedRoutes,
                  statistics: { totalOrders: 0, totalAmount: 0, averageAmount: 0, deliveryCount: 0, pickupCount: 0 },
                  summary: { orders: 0, couriers: 0, successfulGeocoding: 0, failedGeocoding: 0, totalRows: 0, paymentMethods: 0, errors: [] },
                  lastModified: Date.now()
              } as any;
          }

          const masterOrdersMap = new Map();
          const masterOrdersByNumber = new Map();
          
          (prev.orders || []).forEach((o: any) => {
             const id = o.id || o._id;
             if (id && String(id) !== 'undefined' && String(id) !== 'null') {
                 masterOrdersMap.set(String(id), o);
             }
             if (o.orderNumber && String(o.orderNumber) !== 'undefined') {
                 masterOrdersByNumber.set(String(o.orderNumber), o);
             }
          });

          const enrichedRoutes = validatedRoutes.map((route: any) => {
            if (!route.orders) return route;

            const dedupedOrders = route.orders || [];

            const enrichedOrders = dedupedOrders.map((order: any) => {
              const id = order.id || order._id;
              const safeId = id && String(id) !== 'undefined' ? String(id) : null;
              const masterById = safeId ? masterOrdersMap.get(safeId) : null;
              
              const num = order.orderNumber;
              const safeNum = num && String(num) !== 'undefined' ? String(num) : null;
              const masterByNumber = safeNum ? masterOrdersByNumber.get(safeNum) : null;
              
              const master = masterById || masterByNumber;

              if (master) {
                return {
                  ...master,
                  ...order,
                  address: order.address || master.address || (master as any).raw?.address || 'Адрес не указан',
                  orderNumber: order.orderNumber || master.orderNumber || (master as any).id || 'N/A',
                  plannedTime: order.plannedTime || master.plannedTime || (master as any).deliverBy,
                  coords: order.coords || master.coords,
                  lat: order.lat || order.coords?.lat || master.lat || master.coords?.lat,
                  lng: order.lng || order.coords?.lng || master.lng || master.coords?.lng,
                  kmlZone: order.kmlZone || master.kmlZone || master.deliveryZone,
                  kmlHub: order.kmlHub || master.kmlHub,
                };
              }

              return {
                ...order,
                address: order.address || (order as any).raw?.address || 'Адрес не указан',
                orderNumber: order.orderNumber || (order as any).id || 'N/A',
              };
            });

            return { ...route, orders: enrichedOrders };
          });

          const routesMap = new Map<string, any>();
          
          const currentDateStr = normalizeDateToIso(prev.creationDate || prev.orders?.[0]?.creationDate);
          
          if (currentDateStr) {
            (prev.routes || []).forEach((r: any) => {
              const rDate = normalizeDateToIso(r.target_date || r.creationDate);
              if (!rDate || rDate === currentDateStr) {
                routesMap.set(String(r.id), r);
              }
            });
          } else {
            (prev.routes || []).forEach((r: any) => {
              routesMap.set(String(r.id), r);
            });
          }
          
          enrichedRoutes.forEach((route: any) => {
            routesMap.set(String(route.id), route);
          });
          
          const mergedRoutes = Array.from(routesMap.values());

          const routeMetrics = new Map<string, { km: number; orders: number }>();
          mergedRoutes.forEach((r: any) => {
            const name = normalizeCourierName(r.courier || r.courier_id || '');
            if (!name || name === 'Не назначено') return;
            const m = routeMetrics.get(name) || { km: 0, orders: 0 };
            m.km += Number(r.totalDistance || r.total_distance || 0);
            m.orders += Number(r.ordersCount || r.orders_count || (Array.isArray(r.orders) ? r.orders.length : 0));
            routeMetrics.set(name, m);
          });

          const existingCouriers = (prev.couriers || []);
          const updatedCouriers = existingCouriers.map((c: any) => {
            const norm = normalizeCourierName(c.name || c.courierName || c.courier || '');
            const m = routeMetrics.get(norm);
            const geoErrOrders = courierGeoErrorMap[norm] || [];
            if (!m && geoErrOrders.length === 0) return c;
            const bonusDist = (m?.orders || 0) * 0.5;
            return {
              ...c,
              ...(m ? {
                distanceKm: Number(m.km.toFixed(2)),
                bonusDistance: Number(bonusDist.toFixed(2)),
                totalDistance: Number(((m.km || 0) + bonusDist).toFixed(2)),
                calculatedOrders: m.orders
              } : {}),
              geoErrorCount: geoErrOrders.length > 0 ? geoErrOrders.length : (c.geoErrorCount || 0),
              geoErrorOrders: geoErrOrders.length > 0 ? geoErrOrders : (c.geoErrorOrders || []),
            };
          });
          routeMetrics.forEach((m, norm) => {
            const exists = updatedCouriers.some((c: any) => normalizeCourierName(c.name || c.courierName || c.courier || '') === norm);
            if (!exists) {
              const geoErrOrders = courierGeoErrorMap[norm] || [];
              updatedCouriers.push({
                name: norm,
                courierName: norm,
                distanceKm: Number(m.km.toFixed(2)),
                calculatedOrders: m.orders,
                isActive: true,
                geoErrorCount: geoErrOrders.length,
                geoErrorOrders: geoErrOrders,
              });
            }
          });
          
          return { ...prev, routes: mergedRoutes, couriers: updatedCouriers, uncalculatedOrders: eventUncalc || [] };
        });
      }
    };

    const handleTurboDashboard = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (!data) return;
    };
    
    const unsubRoutes = crossTabSync.on('routes_update', (broadcast: any) => {
      if (broadcast.routes?.length > 0) {
        window.dispatchEvent(new CustomEvent('km:turbo:routes_update', {
          detail: {
            routes: broadcast.routes,
            date: broadcast.date,
            divisionId: broadcast.divisionId,
            couriers: broadcast.couriers || null,
            geoErrorOrders: broadcast.geoErrorOrders || [],
          }
        }));
      }
    });

    const unsubDashboardData = crossTabSync.on('dashboard_data', (newData: any) => {
      if (newData && newData.orders) {
        setExcelDataState(prev => {
          if (!prev || !prev.orders || prev.orders.length === 0) {
            return protectData(newData, prev);
          }
          
          const prevDate = normalizeDateToIso(prev.creationDate || prev.orders?.[0]?.creationDate);
          const nextDate = normalizeDateToIso(newData.creationDate || newData.orders?.[0]?.creationDate);
          
          if (prevDate && nextDate && prevDate !== nextDate) {
            return protectData(newData, prev);
          }
          
          // Merge logic: update existing orders with new fields (keeping address, raw, etc.)
          // CRITICAL: Never overwrite settled financial fields from local state with incoming server data
          const SETTLEMENT_FIELDS = ['settledDate','settlementSessionId','sessionTotalReceived','sessionTotalDifference','sessionTotalExpected','untakenChange','originalChangeAmount','settledAmount','settlementNote'];
          const orderUpdates = new Map(newData.orders.map((o: any) => [String(o.id || o.orderNumber), o]));
          const mergedOrders = prev.orders.map((o: any) => {
            const update = orderUpdates.get(String(o.id || o.orderNumber));
            if (!update) return o;
            // If local order is already settled, protect its settlement fields
            if (o.settledDate) {
              const safeUpdate: any = { ...update };
              SETTLEMENT_FIELDS.forEach(f => { delete safeUpdate[f]; });
              return { ...o, ...safeUpdate };
            }
            return { ...o, ...update };
          });
          
          // Add any completely new orders that weren't in prev
          const prevOrderIds = new Set(prev.orders.map((o: any) => String(o.id || o.orderNumber)));
          newData.orders.forEach((o: any) => {
            if (!prevOrderIds.has(String(o.id || o.orderNumber))) {
              mergedOrders.push(o);
            }
          });
          
          const mergedData = {
            ...prev,
            ...newData,
            orders: mergedOrders,
            couriers: newData.couriers || prev.couriers,
            routes: newData.routes || prev.routes,
          };
          
          return protectData(mergedData, prev);
        });
      }
    });
    
    window.addEventListener('km:turbo:routes_update', handleTurboRoutes);
    window.addEventListener('km:turbo:dashboard_update', handleTurboDashboard);
    return () => {
      window.removeEventListener('km:turbo:routes_update', handleTurboRoutes);
      window.removeEventListener('km:turbo:dashboard_update', handleTurboDashboard);
      unsubRoutes();
      unsubDashboardData();
    };
  }, [])


   const protectData = useCallback((next: ExcelData, current: ExcelData | null): ExcelData => {
     if (!current || !next) return next;

     // v5.210: Целевая дата из стора; фолбэк — сегодня (защита от неинициализированного стора)
     const targetDateShift = useDashboardStore.getState().apiDateShift;
     const todayISO = (() => {
       const n = new Date();
       return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
     })();
     const currentShiftDateStr = normalizeDateToIso(targetDateShift) || todayISO;

     const currentDate = normalizeDateToIso(current.creationDate || current.orders?.[0]?.creationDate);

     // Если целевая дата изменилась — разрешаем перезапись (смена дня)
     if (currentDate && currentShiftDateStr !== currentDate) {
         return next;
     }

     const nextDate = normalizeDateToIso(next.creationDate || next.orders?.[0]?.creationDate);

     // Если новые данные пришли за другой день — разрешаем (правильная дата приоритетнее)
     if (currentDate && nextDate && currentDate !== nextDate) {
         return next;
     }

     // v5.202: НИКОГДА не перезаписывать существующие заказы пустыми/частичными данными
      const hasLocalOrders = (current.orders || []).length > 0;
      const hasServerOrders = (next.orders || []).length > 0;
      
      if (!hasServerOrders && hasLocalOrders) {
          return {
              ...next,
              orders: current.orders,
              routes: (next.routes && next.routes.length > 0) ? next.routes : current.routes,
              couriers: next.couriers && next.couriers.length > 0 ? next.couriers : current.couriers,
              lastModified: Math.max(next.lastModified || 0, current.lastModified || 0)
          };
      }
      
      if (hasServerOrders && hasLocalOrders) {
          const nextOrderCount = (next.orders || []).length;
          const currentOrderCount = (current.orders || []).length;
          const nextLastModified = next.lastModified || 0;
          const currentLastModified = current.lastModified || 0;
          
          if (currentOrderCount > 0 && nextOrderCount > currentOrderCount * 1.5 && nextLastModified <= currentLastModified) {
              return {
                  ...next,
                  orders: current.orders,
              };
          }
      }
     
     return next;
   }, []);

   const performManualOverridesSave = useCallback((orders: any[]) => {
     try {
       const existing = localStorage.getItem('km_manual_overrides');
       const overrides = existing ? JSON.parse(existing) : {};
       
       orders.forEach(o => {
         const sid = getStableOrderId(o);
         const id = o.id ? String(o.id) : null;
         const num = o.orderNumber ? String(o.orderNumber) : null;
         
         let hasChanges = false;
         const ovr: any = {};
         
         if (o.settledDate) { 
           hasChanges = true; 
           ovr.settledDate = o.settledDate; 
           ovr.status = o.status; 
           ovr.settlementSessionId = o.settlementSessionId;
           ovr.sessionTotalReceived = o.sessionTotalReceived;
           ovr.sessionTotalDifference = o.sessionTotalDifference;
           ovr.sessionTotalExpected = o.sessionTotalExpected;
           ovr.untakenChange = o.untakenChange;
           ovr.originalChangeAmount = o.originalChangeAmount;
           ovr.settledAmount = o.settledAmount;
           ovr.settlementNote = o.settlementNote;
           ovr.changeAmount = o.changeAmount;
           ovr.amount = o.amount;
           ovr.effectiveAmount = o.effectiveAmount;
         }
         if (o.courier && !isId0CourierName(o.courier)) { hasChanges = true; ovr.courier = o.courier; ovr.courierId = o.courierId; }
         if (o.paymentMethodOverridden) { hasChanges = true; ovr.paymentMethod = o.paymentMethod; ovr.paymentMethodOverridden = true; }
         if (o.manualGeocoding) { hasChanges = true; ovr.coords = o.coords; ovr.manualGeocoding = true; ovr.isAddressLocked = true; }
         
         if (hasChanges) {
           if (sid) overrides[sid] = { ...(overrides[sid] || {}), ...ovr };
           if (num) overrides[num] = { ...(overrides[num] || {}), ...ovr };
           if (id)  overrides[id]  = { ...(overrides[id]  || {}), ...ovr };
         }
       });
       localStorage.setItem('km_manual_overrides', JSON.stringify(overrides));
       
       if (excelDataRef.current && excelDataRef.current.orders) {
         const routesNoGeo = (excelDataRef.current.routes || []).map((r: any) => ({ ...r, geometry: undefined }));
         const fullData = { ...excelDataRef.current, orders: orders, routes: routesNoGeo };
         fullData.lastModified = Date.now();
         localStorageUtils.setData('km_dashboard_processed_data_v4', fullData);
       }

       crossTabSync.broadcastBatched('dashboard_data', {
         orders: orders.map(o => ({
           id: o.id, orderNumber: o.orderNumber, courier: o.courier,
           status: o.status, coords: o.coords, settledDate: o.settledDate,
           totalAmount: o.totalAmount, paymentMethod: o.paymentMethod,
           amount: o.amount, effectiveAmount: o.effectiveAmount, changeAmount: o.changeAmount,
           settlementSessionId: o.settlementSessionId,
           sessionTotalReceived: o.sessionTotalReceived,
           sessionTotalDifference: o.sessionTotalDifference,
           sessionTotalExpected: o.sessionTotalExpected,
           untakenChange: o.untakenChange,
           originalChangeAmount: o.originalChangeAmount,
           settledAmount: o.settledAmount,
           settlementNote: o.settlementNote
         })),
       }, 100);
     } catch (e) {
       console.warn('Manual overrides save failed:', e);
     }
   }, []);

  useEffect(() => {
    if (!excelData?.orders) return;
    performManualOverridesSave(excelData.orders);
  }, [excelData?.orders, performManualOverridesSave]);

   // v5.151: Автосохранение данных дашборда в localStorage при изменении

   // v5.180: Оптимизировано - увеличен debounce до 1000мс, пропускать если изменились только маршруты

   const lastSavedRef = useRef<string>('');
  
  useEffect(() => {
    if (!excelData || !excelData.orders || excelData.orders.length === 0) return;
    
    // v5.180: Создание легковесного хеша для обнаружения реальных изменений
    // v42: Включаем settled count и payment overrides — без этого расчёты не сохранялись при reload
    const settledCount = (excelData.orders || []).filter((o: any) => !!o.settledDate).length;
    const paymentOverrideCount = (excelData.orders || []).filter((o: any) => !!o.paymentMethodOverridden).length;
    const currentHash = `${excelData.orders.length}-${excelData.couriers?.length || 0}-${excelData.routes?.length || 0}-${excelData.summary?.totalOrders || 0}-${settledCount}-${paymentOverrideCount}`;
    if (currentHash === lastSavedRef.current) {
      return;
    }
    lastSavedRef.current = currentHash;
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
       try {
         const ordersLight = (excelData.orders || []).map((o: any) => ({
           id: o.id, orderNumber: o.orderNumber, courier: o.courier,
           address: o.address, status: o.status, coords: o.coords,
           deliveryZone: o.deliveryZone, kmlZone: o.kmlZone,
           settledDate: o.settledDate, totalAmount: o.totalAmount,
           settlementSessionId: o.settlementSessionId,
           sessionTotalReceived: o.sessionTotalReceived,
           sessionTotalDifference: o.sessionTotalDifference,
           sessionTotalExpected: o.sessionTotalExpected,
           untakenChange: o.untakenChange,
           originalChangeAmount: o.originalChangeAmount,
           settledAmount: o.settledAmount,
           settlementNote: o.settlementNote,
           changeAmount: o.changeAmount,
           amount: o.amount,
           effectiveAmount: o.effectiveAmount,
           paymentMethod: o.paymentMethod,
           paymentMethodOverridden: o.paymentMethodOverridden,
           manualGeocoding: o.manualGeocoding,
           phone: o.phone,
           customerName: o.customerName,
           plannedTime: o.plannedTime,
           deadlineAt: o.deadlineAt,
           handoverAt: o.handoverAt,
           creationDate: o.creationDate,
           orderType: o.orderType,
           deliveryTime: o.deliveryTime,
           totalTime: o.totalTime
         }));
         const routesNoGeo = (excelData.routes || []).map((r: any) => ({
           ...r,
           geometry: undefined,
           ordersCount: r.ordersCount || r.orders_count || (Array.isArray(r.orders) ? r.orders.length : 0),
           totalDistance: r.totalDistance || r.total_distance || 0,
           courier: r.courier || r.courier_id || '',
           courier_id: r.courier_id || r.courier || '',
           orders: r.orders?.map((o: any) => ({ id: o.id, orderNumber: o.orderNumber }))
         }));
         const dataToSave = { 
           ...excelData, 
           orders: ordersLight, 
           routes: routesNoGeo, 
           lastModified: Date.now() 
         };
         localStorageUtils.setData('km_dashboard_processed_data_v4', dataToSave);
         
         crossTabSync.broadcastBatched('dashboard_data', dataToSave, 300);
       } catch (e) {
         console.warn('[ExcelSync] Failed to auto-save dashboard data:', e);
       }
    }, 300);
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [excelData]);

  const setExcelData = useCallback((incomingData: ExcelData | null, force?: boolean) => {
    if (incomingData) {
      lastSetTimeRef.current = Date.now();
      if (force) {
        try {
          const staleRaw = localStorage.getItem('km_dashboard_processed_data_v4');
          if (staleRaw) {
            const stale = JSON.parse(staleRaw);
            const staleCount = (stale?.orders || []).length;
            const newCount = (incomingData?.orders || []).length;
            if (staleCount > 0 && newCount > 0 && Math.abs(staleCount - newCount) > Math.max(staleCount, newCount) * 0.3) {
              localStorage.removeItem('km_dashboard_processed_data_v4');
              localStorage.removeItem('km_dashboard_processed_data');
            }
          }
        } catch {}
      }
      setExcelDataState(prev => {
        const val = force ? incomingData : protectData(incomingData, prev);
        return val;
      });
    } else {
      setExcelDataState(null);
      localStorage.removeItem('km_dashboard_processed_data_v4');
    }
  }, [protectData]);

  const updateExcelData = useCallback((dataOrUpdater: ExcelData | ((prev: ExcelData) => ExcelData), force?: boolean) => {
    setExcelDataState(prev => {
      let next: ExcelData;
      const prevSafe = prev || { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: {} } as any;
      
      if (typeof dataOrUpdater === 'function') {
        const updater = dataOrUpdater as (p: ExcelData) => ExcelData;
        const result = updater(prevSafe);
        next = applyCourierVehicleMap(result, prevSafe);
      } else {
        next = applyCourierVehicleMap(dataOrUpdater, prevSafe);
      }
      
      return force ? next : protectData(next, prevSafe);
    });
  }, [protectData]);

  const clearExcelData = useCallback((options?: { skipServerWipe?: boolean }) => {
    setExcelDataState(null)
    localStorage.removeItem('km_dashboard_processed_data_v4')
    crossTabSync.broadcast('dashboard_data', { orders: [], couriers: [], routes: [] });
    if (!options?.skipServerWipe) {
      const token = localStorage.getItem('km_access_token');
      if (token) {
        const emptyState = { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: {} };
        fetch(`${API_URL}/api/v1/state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ data: emptyState })
        }).catch(() => {});
      }
    }
  }, [])

  const updateRouteData = useCallback((newRoutes: any[]) => {
    setExcelDataState(prev => {
      const next = prev ? { ...prev, routes: newRoutes, _lastManualRouteUpdate: Date.now() } : {
        orders: [], couriers: [], paymentMethods: [], routes: newRoutes, errors: [], summary: undefined, _lastManualRouteUpdate: Date.now()
      } as any;
      return next;
    })
  }, [])

  const updateOrderPaymentMethod = useCallback((orderNumber: string, newPaymentMethod: string) => {
    updateExcelData(prev => {
      const updatedOrders = prev.orders.map(order => 
        order.orderNumber === orderNumber 
          ? { ...order, paymentMethod: newPaymentMethod, paymentMethodOverridden: true }
          : order
      );
      return { ...prev, orders: updatedOrders };
    });
    toast.success(`Способ оплаты: ${newPaymentMethod}`);
  }, [updateExcelData])

  const contextValue = useMemo(() => ({
    excelData, setExcelData, updateExcelData, clearExcelData,
    updateRouteData, updateOrderPaymentMethod,
    saveManualOverrides: performManualOverridesSave
  }), [excelData, setExcelData, updateExcelData, clearExcelData, updateRouteData, updateOrderPaymentMethod, performManualOverridesSave]);

  useEffect(() => {
    const handleBeforeUnload = () => {};
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // v25.4: Обновление маршрутов из базы данных при загрузке excelData
  // v5.141: Улучшенное удаление дубликатов чтобы избежать устаревших перезаписей БД
  // v5.180: Отслеживание последнего обновления маршрутов сокета чтобы избежать устаревших перезаписей БД
  const lastSocketRouteUpdateRef = useRef<number>(0);
   const lastProcessedRouteIdsRef = useRef<any[]>([]); // v5.203: Отслеживание ИД маршрутов для немедленного обнаружения новых маршрутов
  
  const refreshRoutesFromDB = useCallback(async () => {
    try {
      const token = localStorage.getItem('km_access_token');
      if (!token) return;
      
      // Всегда обновлять немедленно - без логики пропуска
      const dbRoutes = await fetchRoutesWithDate(token);
      // Обновленные маршруты из БД
      
      // v5.141: Удаление дубликатов маршрутов БД сначала по ID
      const seenRouteIds = new Set<string>();
      const uniqueDbRoutes: any[] = [];
      dbRoutes.forEach((r: any) => {
        const rid = String(r.id || '');
        if (rid && !seenRouteIds.has(rid)) {
          seenRouteIds.add(rid);
          uniqueDbRoutes.push(r);
        }
      });
      if (uniqueDbRoutes.length < dbRoutes.length) {
        console.warn(`[ExcelSync]  Removed ${dbRoutes.length - uniqueDbRoutes.length} duplicate DB routes`);
      }
      
      // v5.180: ФРОНТЕНД ВАЛИДАЦИЯ — Нормализация маршрутов БД под ожидания фронтенда
      const validatedDbRoutes = uniqueDbRoutes.map((route: any) => {
        const rawCourier = route.courier || route.courier_id || route.courierName || '';
        const normCourier = normalizeCourierName(rawCourier);
        
        // Пропуск маршрутов с невалидными курьерами
        if (!normCourier || normCourier === 'Не назначено' || normCourier.toLowerCase() === 'по') {
          console.warn(`[ExcelSync]  Dropping DB route with invalid courier: "${rawCourier}"`);
          return null;
        }
        
        return {
          ...route,
          courier: normCourier,
          courier_id: normCourier,
          orders: (route.orders || []).map((o: any) => ({
            ...o,
            courier: normalizeCourierName(o.courier) || normCourier,
          })),
        };
      }).filter(Boolean);
      
      
      setExcelDataState(prev => {
        const prevSafe = prev || { orders: [], couriers: [], paymentMethods: [], routes: [], errors: [], summary: {} };
        
        const existingRoutes = Array.isArray(prevSafe.routes) ? prevSafe.routes : [];
        const dbRoutesToMerge = validatedDbRoutes;

        if (dbRoutesToMerge.length === 0) {
            if (existingRoutes.length === 0) {
                return prevSafe;
            }
            return { ...prevSafe, _lastManualRouteUpdate: prevSafe._lastManualRouteUpdate };
        }

        const routesMap = new Map<string, any>();
        
        existingRoutes.forEach((r: any) => {
            const rid = String(r.id || '');
            if (rid && rid.startsWith('route_')) {
                routesMap.set(rid, r);
            }
        });
        
        dbRoutesToMerge.forEach((r: any) => {
            const rid = String(r.id || '');
            if (rid) routesMap.set(rid, r);
        });

        const dbOrderIds = new Set<string>();
        dbRoutesToMerge.forEach((r: any) => {
          (r.orders || []).forEach((o: any) => {
            const oid = String(o.id || o.orderNumber || '');
            if (oid) dbOrderIds.add(oid);
          });
        });

        const seenIds = new Set<string>();
        const finalRoutes = Array.from(routesMap.values()).filter((r: any) => {
            const rid = String(r.id || '');
            if (seenIds.has(rid)) return false;
            seenIds.add(rid);
            
            if (!rid.startsWith('route_')) return true;
            
            const manualOrderIds = (r.orders || []).map((o: any) => String(o.id || o.orderNumber || ''));
            return !manualOrderIds.some((oid: string) => dbOrderIds.has(oid));
        });

        // v5.153: Обновление distanceKm курьеров из маршрутов БД немедленно
        // Это гарантирует что вкладка Курьеры показывает верные км после refreshRoutesFromDB
        // vFIX: Используем lowercase-ключи везде для консистентного поиска
        let updatedCouriers = prevSafe.couriers || [];
        
        // Вычисление метрик из всех маршрутов (БД + ручные) — ключ: нижний регистр
        const distMap = new Map<string, { km: number; orders: number }>();
        finalRoutes.forEach((r: any) => {
            const rawCourier = (r.courier || r.courier_id || '').toString().trim();
            const normKey = normalizeCourierName(rawCourier).toLowerCase();
            if (!normKey || normKey === 'не назначено') return;
            const existing = distMap.get(normKey) || { km: 0, orders: 0 };
            existing.km += Number(r.totalDistance || r.total_distance || 0);
            existing.orders += Number(r.ordersCount || r.orders_count || (r.orders?.length) || 0);
            distMap.set(normKey, existing);
        });
        
        if (distMap.size > 0) {
            // Множество существующих курьеров в нижнем регистре
            const existingCourierNames = new Set((updatedCouriers || []).map((c: any) => 
                normalizeCourierName(c.name || c.courierName || '').toLowerCase()
            ));
            
            updatedCouriers = (updatedCouriers || []).map((c: any) => {
                const rawName = (c.name || c.courierName || '').toString().trim();
                // vFIX: использовать lowercase для поиска в distMap
                const normName = normalizeCourierName(rawName).toLowerCase();
                const calc = distMap.get(normName);
                if (calc && calc.km > 0) {
                    return { ...c, distanceKm: Number(calc.km.toFixed(2)), calculatedOrders: calc.orders };
                }
                return c;
            });
            
            // Добавление новых курьеров из маршрутов которые еще не существуют
            distMap.forEach((metrics, courierNameLower) => {
                if (!existingCourierNames.has(courierNameLower)) {
                    updatedCouriers.push({
                        name: courierNameLower,
                        distanceKm: Number(metrics.km.toFixed(2)),
                        calculatedOrders: metrics.orders,
                        isActive: true,
                        vehicleType: 'car'
                    });
                }
            });
        }

        const lastManualUpdate = prevSafe._lastManualRouteUpdate;
        const timeSinceManual = lastManualUpdate ? Date.now() - lastManualUpdate : Infinity;
        
        return {
          ...prevSafe,
          routes: finalRoutes,
          couriers: updatedCouriers,
          _lastManualRouteUpdate: timeSinceManual < 60000 ? lastManualUpdate : undefined
        };

      });
    } catch (e) {
      console.warn('[ExcelSync] Failed to refresh routes:', e);
    }
  }, [fetchRoutesWithDate]);

   // v5.148: Автообновление маршрутов при загрузке данных ИЛИ при начальной загрузке
  useEffect(() => {
    refreshRoutesFromDB();
  }, [refreshRoutesFromDB]);
  
  // Debounced route refresh on order count change
  const ordersLengthRef = useRef<number>(0);
  useEffect(() => {
    if (excelData && excelData.orders?.length > 0 && excelData.orders.length !== ordersLengthRef.current) {
      ordersLengthRef.current = excelData.orders.length;
      const timer = setTimeout(() => {
        refreshRoutesFromDB();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [excelData?.orders?.length, refreshRoutesFromDB]);

  // Предоставление функции обновления глобально для ручного вызова
  useEffect(() => {
    (window as any).__refreshTurboRoutes = refreshRoutesFromDB;
    (window as any).__getExcelData = () => excelData;
    (window as any).__loadRoutesFromDB = async () => {
      // Ручное обновление
      await refreshRoutesFromDB();
    };
    return () => { 
      delete (window as any).__refreshTurboRoutes;
      delete (window as any).__getExcelData;
      delete (window as any).__loadRoutesFromDB;
    };
  }, [refreshRoutesFromDB, excelData]);

  return (
    <ExcelDataContext.Provider value={contextValue}>
      {children}
    </ExcelDataContext.Provider>
  )
}

function applyCourierVehicleMap(data: any, current?: any): any {
  if (!data) return data;
  try {
    let effectiveCurrent = current;
    if (data && current) {
      const dataDate = normalizeDateToIso(data.creationDate || data.orders?.[0]?.creationDate);
      const currDate = normalizeDateToIso(current.creationDate || current.orders?.[0]?.creationDate);
      if (dataDate && currDate && dataDate !== currDate) {
         effectiveCurrent = null; // Completely drop old data if dates differ!
      }
    }

    const rawMap = localStorageUtils.getCourierVehicleMap()
    const bruteNormalizedMap: Record<string, string> = {};
    Object.keys(rawMap).forEach(name => {
      bruteNormalizedMap[normalizeCourierName(name).toLowerCase()] = rawMap[name];
    });

    const currentOrdersMap = new Map<string, any>((effectiveCurrent?.orders || []).map((o: any) => [getStableOrderId(o), o]));

    const overrideMap = new Map<string, any>();
    try {
      const raw = localStorage.getItem('km_manual_overrides');
      if (raw) {
        const parsed = JSON.parse(raw);
        Object.entries(parsed).forEach(([k, v]) => overrideMap.set(String(k), v));
      }
    } catch (_) {}

    const rawCouriers = Array.isArray(data.couriers) ? data.couriers : [];
    const freshOrdersMap = new Map<string, any>();

    const orders = Array.isArray(data.orders) ? data.orders.map((o: any) => {
        const base = (o.coords?.lat && o.coords?.lng && o.isAddressLocked) ? o : enrichOrderGeodata(o);
        const sid = getStableOrderId(base);
        const id  = o.id ? String(o.id) : null;
        const num = o.orderNumber ? String(o.orderNumber) : null;
        const ovr = (id && overrideMap.get(id)) || (num && overrideMap.get(num)) || null;

        let isSafeToApplyOverride = !!ovr;
        if (ovr && (ovr.creationDate || ovr.dateShift) && (o.creationDate || data.creationDate)) {
             const ovrNorm = normalizeDateToIso(ovr.creationDate || ovr.dateShift);
             const ordNorm = normalizeDateToIso(o.creationDate || data.creationDate);
             if (ovrNorm && ordNorm && ovrNorm !== ordNorm) {
                 isSafeToApplyOverride = false;
             }
        }

        if (isSafeToApplyOverride) {
            return {
                ...base,
                ...ovr,
                status: ovr.settledDate ? (ovr.status || 'исполнен') : (base.status || ovr.status)
            };
        }
        if (sid) freshOrdersMap.set(sid, base);
        return base;
    }) : [];
    
    const couriers = rawCouriers.map((c: any) => ({
        ...c,
        vehicleType: String(c.vehicleType || 'car').toLowerCase().trim()
    }));
    
    const courierNamesInList = new Set(couriers.map((c: any) => c.name || c._id || c.id));
    for (let i = 0; i < orders.length; i++) {
        const c = orders[i].courier;
        if (c) {
            const rawName = typeof c === 'object' ? (c.name || c._id || c.id) : String(c);
            const normName = normalizeCourierName(rawName);
            if (rawName && !Array.from(courierNamesInList).some(n => normalizeCourierName(n).toLowerCase() === normName.toLowerCase())) {
                const cId = typeof c === 'object' ? (c._id || c.id || rawName) : rawName;
                couriers.push({ _id: cId, id: cId, name: rawName, vehicleType: 'car' });
                courierNamesInList.add(rawName);
            }
        }
    }

    const processedCouriers = couriers.map((c: any) => {
      const normalizedName = normalizeCourierName(c.name).toLowerCase();
      const mappedType = bruteNormalizedMap[normalizedName];
      return mappedType ? { ...c, vehicleType: mappedType } : { ...c, vehicleType: c.vehicleType || 'car' };
    });

    let paymentMethods = Array.isArray(data.paymentMethods) ? data.paymentMethods : []
    if (paymentMethods.length === 0 && orders.length > 0) {
      const uniqueMethods = new Set<string>();
      for (let i = 0; i < orders.length; i++) {
        if (orders[i].paymentMethod) uniqueMethods.add(orders[i].paymentMethod);
      }
      paymentMethods = Array.from(uniqueMethods).map(method => ({
        id: method,
        name: method
      }));
    }
    // v5.135: Страж сохранения маршрутов

    // Если входящие маршруты пусты но у нас есть локальные маршруты на ту же дату, сохранить их.
    const incomingRoutes = Array.isArray(data.routes) ? data.routes : [];
    const localRoutes = Array.isArray(effectiveCurrent?.routes) ? effectiveCurrent.routes : [];
    
    const incomingDate = normalizeDateToIso(data.creationDate || (orders.find((o: any) => o.creationDate))?.creationDate || "");
    const localDate = normalizeDateToIso(effectiveCurrent?.creationDate || (effectiveCurrent?.orders?.find((o:any) => o.creationDate))?.creationDate || "");
    
    let routesToProcess = incomingRoutes;
    if (incomingRoutes.length === 0 && localRoutes.length > 0 && incomingDate === localDate) {
        // Сохранение локальных маршрутов
        routesToProcess = localRoutes;
    }

    return {
      ...data,
      creationDate: data.creationDate || effectiveCurrent?.creationDate,
      routes: routesToProcess.map((r: any) => {
        const existingRoute = localRoutes.find((cr: any) => cr.id === r.id);
        
        if (existingRoute) {
            const currentRIds = (existingRoute.orders || []).map((o: any) => getStableOrderId(o)).sort().join('|');
            const incomingRIds = (r.orders || []).map((o: any) => getStableOrderId(o)).sort().join('|');
            
            if (currentRIds === incomingRIds && 
                (existingRoute.totalDistance === r.totalDistance || r.totalDistance === 0) && 
                (existingRoute.totalDuration === r.totalDuration || r.totalDuration === 0) &&
                (existingRoute.isOptimized === r.isOptimized || r.totalDistance === 0)) {
               return existingRoute;
            }
        }
        return {
          ...r,
          orders: Array.isArray(r.orders) ? r.orders.map((o: any) => {
             // v5.135: Глубокое сохранение геоданных для заказов маршрута
             const sid = getStableOrderId(o);
             const memOrder = currentOrdersMap.get(sid);
             if (memOrder && memOrder.coords?.lat && !o.coords?.lat) {
                 return { ...o, ...memOrder };
             }
             return o.coords?.lat ? o : enrichOrderGeodata(o);
          }) : []
        };
      }),
      orders,
      couriers: processedCouriers.length > 0 ? processedCouriers : (effectiveCurrent?.couriers || []),
      paymentMethods,
      errors: Array.isArray(data.errors) ? data.errors : []
    }
  } catch (e) {
    console.error('CRITICAL ERROR in applyCourierVehicleMap:', e);
    return data;
  }
}
