import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { crossTabSync } from '../services/crossTabSync';

const formatDateTimeForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
};

interface DashboardStoreState {
    // Настройки Dashboard API
    apiKey: string;
    apiDepartmentId: number | null;

    // Настройки автообновления
    apiAutoRefreshEnabled: boolean;
    apiLastSyncTime: number | null;
    apiNextSyncTime: number | null;
    apiLastVisitDate: string | null; // v5.96: Обнаружение нового дня
    apiSyncStatus: 'idle' | 'syncing' | 'error';
    apiSyncError: string | null;
    apiTimeDeliveryBeg: string; // формат datetime-local

    apiTimeDeliveryEnd: string; // формат datetime-local

    apiDateShift: string; // ГГГГ-ММ-ДД
    apiDateShiftFilterEnabled: boolean;
    apiTimeFilterEnabled: boolean;
    apiManualSyncTrigger: number;
    divisionId: string | null; // v5.157: Для фильтрации socket-событий

    // Статус фоновой автомаршрутизации
    autoRoutingStatus: {
        isActive: boolean;
        lastUpdate: number | null;
        processedCount: number;
        totalCount: number;
        totalOrdersAll: number; // v7.x: Всего заказов из FO (до фильтрации)
        processedCouriers: number;
        totalCouriers: number;
        // v5.133: Детальная статистика для прозрачности
        skippedGeocoding: number;
        geoErrors: { orderNumber: string; address: string; courier: string }[]; // v6.9: Ошибки геокодирования
        skippedInRoutes: number;
        skippedNoCourier: number;
        skippedOther: number;
        isBulkImport: boolean; // v5.160: Для логики отчётов
        userStopped: boolean; // v5.202: Пользователь явно остановил
        currentCourier?: string | null; // v36.3: Текущий обрабатываемый курьер
        // v37.0: Стабильные КПЭ — единый источник истины
        couriersSummary?: Record<string, { distanceKm: number; ordersCount: number }>;
    };

    // v6.19: Агрегированный статус для админки (мультиподразделения)
    aggregateRoutingStatus: {
        isActive: boolean;
        lastUpdate: number | null;
        processedCount: number;
        totalCount: number;
        totalOrdersAll: number;
        processedCouriers: number;
        totalCouriers: number;
        skippedGeocoding: number;
        geoErrors: { orderNumber: string; address: string; courier: string }[];
        skippedInRoutes: number;
        skippedNoCourier: number;
        skippedOther: number;
        isBulkImport: boolean;
        userStopped: boolean;
        currentCourier?: string | null;
        couriersSummary?: Record<string, { distanceKm: number; ordersCount: number }>;
    };
    setAggregateRoutingStatus: (status: Partial<DashboardStoreState['autoRoutingStatus']>) => void;

    // Действия
    setApiKey: (apiKey: string) => void;
    setApiDepartmentId: (departmentId: number | null) => void;
    setApiAutoRefreshEnabled: (enabled: boolean) => void;
    setApiLastSyncTime: (time: number | null) => void;
    setApiNextSyncTime: (time: number | null) => void;
    setApiSyncStatus: (status: 'idle' | 'syncing' | 'error') => void;
    setApiSyncError: (error: string | null) => void;
    setApiLastVisitDate: (date: string) => void;
    setApiTimeDeliveryBeg: (time: string) => void;
    setApiTimeDeliveryEnd: (time: string) => void;
    setApiDateShift: (date: string) => void;
    setApiDateShiftFilterEnabled: (enabled: boolean) => void;
    setApiTimeFilterEnabled: (enabled: boolean) => void;
    setApiManualSyncTrigger: (trigger: number) => void;
    setDivisionId: (id: string | null) => void;
    triggerApiManualSync: () => void;
    setAutoRoutingStatus: (status: Partial<DashboardStoreState['autoRoutingStatus']>) => void;
    clearCourierDistanceKm: (courierName: string) => void;
}

export const useDashboardStore = create<DashboardStoreState>()(
    persist(
        (set) => ({
            // Значения по умолчанию
            apiKey: '',
            apiDepartmentId: null,
            apiAutoRefreshEnabled: false,
            apiLastSyncTime: null,
            apiNextSyncTime: null,
            apiLastVisitDate: null,
            apiSyncStatus: 'idle',
            apiSyncError: null,
            apiTimeDeliveryBeg: (() => {
                const now = new Date();
                now.setHours(11, 0, 0, 0);
                return formatDateTimeForInput(now);
            })(),
            apiTimeDeliveryEnd: (() => {
                const now = new Date();
                now.setHours(23, 0, 0, 0);
                return formatDateTimeForInput(now);
            })(),
            apiDateShift: (() => {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            })(),
            apiDateShiftFilterEnabled: true,
            apiTimeFilterEnabled: false,
            apiManualSyncTrigger: 0,
            divisionId: null,

            autoRoutingStatus: {
                isActive: false,
                lastUpdate: null,
                processedCount: 0,
                totalCount: 0,
                totalOrdersAll: 0,
                processedCouriers: 0,
                totalCouriers: 0,
                skippedGeocoding: 0,
                geoErrors: [],
                skippedInRoutes: 0,
                skippedNoCourier: 0,
                skippedOther: 0,
                isBulkImport: false,
                userStopped: false, // v5.202: Пользователь явно остановил
                currentCourier: null, // v36.3: Текущий обрабатываемый курьер
                couriersSummary: {}, // v37.0
            },

            setApiKey: (key) => set({ apiKey: key }),
            setApiDepartmentId: (id) => set({ apiDepartmentId: id }),
            setApiAutoRefreshEnabled: (enabled) => set({ apiAutoRefreshEnabled: enabled }),
            setApiLastSyncTime: (time) => set({ apiLastSyncTime: time }),
            setApiNextSyncTime: (time) => set({ apiNextSyncTime: time }),
            setApiSyncStatus: (status) => set({ apiSyncStatus: status }),
            setApiSyncError: (error) => set({ apiSyncError: error }),
            setApiLastVisitDate: (date) => set({ apiLastVisitDate: date }),
            setApiTimeDeliveryBeg: (time) => set({ apiTimeDeliveryBeg: time }),
            setApiTimeDeliveryEnd: (time) => set({ apiTimeDeliveryEnd: time }),
            setApiDateShift: (date) => set((state) => {
                if (typeof window !== 'undefined') {
                    try { crossTabSync.broadcast('date_shift_change', { dateShift: date }); } catch {}
                }
                return { apiDateShift: date };
            }),
            setApiDateShiftFilterEnabled: (enabled) => set({ apiDateShiftFilterEnabled: enabled }),
            setApiTimeFilterEnabled: (enabled) => set({ apiTimeFilterEnabled: enabled }),
            setApiManualSyncTrigger: (trigger) => set({ apiManualSyncTrigger: trigger }),
            setDivisionId: (id) => set({ divisionId: id }),
            triggerApiManualSync: () => set((state) => {
                const trigger = Date.now();
                if (typeof window !== 'undefined') {
                    try { crossTabSync.broadcast('manual_sync_trigger', { trigger }); } catch {}
                }
                return { apiManualSyncTrigger: trigger };
            }),
            setAutoRoutingStatus: (status: Partial<DashboardStoreState['autoRoutingStatus']>) => set((state) => {
                const newStatus = { ...state.autoRoutingStatus, ...status };
                return { autoRoutingStatus: newStatus };
            }),
            clearCourierDistanceKm: (courierName: string) => set((state) => {
                const summary = { ...(state.autoRoutingStatus?.couriersSummary || {}) };
                const norm = courierName.toLowerCase().trim();
                for (const key of Object.keys(summary)) {
                    if (key.toLowerCase().trim() === norm) {
                        delete summary[key];
                    }
                }
                return {
                    autoRoutingStatus: {
                        ...state.autoRoutingStatus,
                        couriersSummary: summary,
                    }
                };
            }),
            aggregateRoutingStatus: {
                isActive: false,
                lastUpdate: null,
                processedCount: 0,
                totalCount: 0,
                totalOrdersAll: 0,
                processedCouriers: 0,
                totalCouriers: 0,
                skippedGeocoding: 0,
                geoErrors: [],
                skippedInRoutes: 0,
                skippedNoCourier: 0,
                skippedOther: 0,
                isBulkImport: false,
                userStopped: false,
                currentCourier: null,
                couriersSummary: {}, // v37.0
            },
            setAggregateRoutingStatus: (status: Partial<DashboardStoreState['autoRoutingStatus']>) => set((state) => {
                const newStatus = { ...state.aggregateRoutingStatus, ...status };
                return { aggregateRoutingStatus: newStatus };
            }),
        }),
        {
            name: 'dashboard-sync-storage-v2',
            onRehydrateStorage: () => (state) => {
                if (state) {
                    const now = new Date();
                    const year = now.getFullYear();
                    const month = String(now.getMonth() + 1).padStart(2, '0');
                    const day = String(now.getDate()).padStart(2, '0');
                    const todayStr = `${year}-${month}-${day}`;
                    
                    if (state.apiLastVisitDate !== todayStr) {
                        setTimeout(() => {
                            useDashboardStore.setState({ 
                                apiDateShift: todayStr,
                                apiLastVisitDate: todayStr 
                            });
                        }, 0);
                    }
                }
            },
            partialize: (state) => {
                const {
                    apiManualSyncTrigger,
                    apiSyncStatus,
                    apiSyncError,
                    ...persistentState
                } = state;

                const status = persistentState.autoRoutingStatus;
                const lastUpdate = status.lastUpdate || 0;
                const isRecentUpdate = (Date.now() - lastUpdate) < 60_000;
                const keepCounters = status.isActive || isRecentUpdate;

                return {
                    ...persistentState,
                    autoRoutingStatus: {
                        isActive: status.isActive,
                        lastUpdate: status.lastUpdate,
                        userStopped: status.userStopped || false,
                        processedCount: keepCounters ? status.processedCount : 0,
                        totalCount: keepCounters ? status.totalCount : 0,
                        processedCouriers: keepCounters ? status.processedCouriers : 0,
                        totalCouriers: keepCounters ? status.totalCouriers : 0,
                        skippedGeocoding: keepCounters ? status.skippedGeocoding : 0,
                        geoErrors: keepCounters ? (status.geoErrors || []) : [],
                        skippedInRoutes: keepCounters ? status.skippedInRoutes : 0,
                        skippedNoCourier: keepCounters ? status.skippedNoCourier : 0,
                        skippedOther: keepCounters ? status.skippedOther : 0,
                        isBulkImport: keepCounters ? status.isBulkImport : false,
                        currentCourier: keepCounters ? status.currentCourier : null,
                        couriersSummary: keepCounters ? (status.couriersSummary || {}) : {},
                    }
                };
            }
        }
    )
);

// Cross-tab sync via BroadcastChannel
if (typeof window !== 'undefined') {
    crossTabSync.on('store_update', (payload: any) => {
        if (payload?.key === 'dashboard-sync-storage-v2') {
            useDashboardStore.persist.rehydrate();
        }
    });

    crossTabSync.on('manual_sync_trigger', (payload: any) => {
        const store = useDashboardStore.getState();
        if (payload?.trigger && payload.trigger !== store.apiManualSyncTrigger) {
            useDashboardStore.setState({ apiManualSyncTrigger: payload.trigger });
        }
    });

    crossTabSync.on('date_shift_change', (payload: any) => {
        const store = useDashboardStore.getState();
        if (payload?.dateShift && payload.dateShift !== store.apiDateShift) {
            useDashboardStore.setState({ apiDateShift: payload.dateShift });
        }
    });
}
