import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const formatDateTimeForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
};

interface DashboardStoreState {
    // Dashboard API settings
    apiKey: string;
    apiDepartmentId: number | null;

    // Auto-refresh settings
    apiAutoRefreshEnabled: boolean;
    apiLastSyncTime: number | null;
    apiNextSyncTime: number | null;
    apiLastVisitDate: string | null; // v5.96: New Day Detection
    apiSyncStatus: 'idle' | 'syncing' | 'error';
    apiSyncError: string | null;
    apiTimeDeliveryBeg: string; // datetime-local format
    apiTimeDeliveryEnd: string; // datetime-local format
    apiDateShift: string; // YYYY-MM-DD
    apiDateShiftFilterEnabled: boolean;
    apiTimeFilterEnabled: boolean;
    apiManualSyncTrigger: number;
    divisionId: string | null; // v5.157: For filtering socket events

    // Background Auto-Routing Status
    autoRoutingStatus: {
        isActive: boolean;
        lastUpdate: number | null;
        processedCount: number;
        totalCount: number;
        totalOrdersAll: number; // v7.x: Total orders from FO (before filtering)
        processedCouriers: number;
        totalCouriers: number;
        // v5.133: Detailed stats for transparency
        skippedGeocoding: number;
        geoErrors: { orderNumber: string; address: string; courier: string }[]; // v6.9: Failed geocode addresses
        skippedInRoutes: number;
        skippedNoCourier: number;
        skippedOther: number;
        isBulkImport: boolean; // v5.160: For logic reporting
        userStopped: boolean; // v5.202: Track if user explicitly stopped
        currentCourier?: string | null; // v36.3: Track specific courier being processed
        // v37.0: Stable KPIs Source of Truth for Frontend
        couriersSummary?: Record<string, { distanceKm: number; ordersCount: number }>;
    };

    // v6.19: Aggregate status for Admin multi-division view
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

    // Actions
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
}

export const useDashboardStore = create<DashboardStoreState>()(
    persist(
        (set) => ({
            // Dashboard defaults
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
                userStopped: false, // v5.202: Track if user explicitly stopped
                currentCourier: null, // v36.3: Track specific courier being processed
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
            setApiDateShift: (date) => set({ apiDateShift: date }),
            setApiDateShiftFilterEnabled: (enabled) => set({ apiDateShiftFilterEnabled: enabled }),
            setApiTimeFilterEnabled: (enabled) => set({ apiTimeFilterEnabled: enabled }),
            setApiManualSyncTrigger: (trigger) => set({ apiManualSyncTrigger: trigger }),
            setDivisionId: (id) => set({ divisionId: id }),
            triggerApiManualSync: () => set({ apiManualSyncTrigger: Date.now() }),
            setAutoRoutingStatus: (status: Partial<DashboardStoreState['autoRoutingStatus']>) => set((state) => {
                const newStatus = { ...state.autoRoutingStatus, ...status };
                return { autoRoutingStatus: newStatus };
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
            name: 'dashboard-sync-storage-v2', // v5.95: Bumped version to clear potentially stuck states
            partialize: (state) => {
                const {
                    apiManualSyncTrigger,
                    apiSyncStatus,
                    apiSyncError,
                    ...persistentState
                } = state;
                // v5.128: Reset transient counters on persist — only keep isActive/lastUpdate
                // Counts are recalculated at runtime from real data, not from stale localStorage
                // v5.155: Keep counters intact during active calculation to prevent reset
                return {
                    ...persistentState,
                    autoRoutingStatus: {
                        isActive: persistentState.autoRoutingStatus.isActive,
                        lastUpdate: persistentState.autoRoutingStatus.lastUpdate,
                        // v5.202: Persist userStopped flag
                        userStopped: persistentState.autoRoutingStatus.userStopped || false,
                        // v5.155: Preserve counters during active calculation
                        processedCount: persistentState.autoRoutingStatus.isActive 
                            ? persistentState.autoRoutingStatus.processedCount 
                            : 0,
                        totalCount: persistentState.autoRoutingStatus.isActive 
                            ? persistentState.autoRoutingStatus.totalCount 
                            : 0,
                        processedCouriers: persistentState.autoRoutingStatus.isActive 
                            ? persistentState.autoRoutingStatus.processedCouriers 
                            : 0,
                        totalCouriers: persistentState.autoRoutingStatus.isActive 
                            ? persistentState.autoRoutingStatus.totalCouriers 
                            : 0,
                        skippedGeocoding: persistentState.autoRoutingStatus.isActive 
                            ? persistentState.autoRoutingStatus.skippedGeocoding 
                            : 0,
                        geoErrors: persistentState.autoRoutingStatus.isActive 
                            ? (persistentState.autoRoutingStatus.geoErrors || [])
                            : [],
                        skippedInRoutes: persistentState.autoRoutingStatus.isActive 
                            ? persistentState.autoRoutingStatus.skippedInRoutes 
                            : 0,
                        skippedNoCourier: persistentState.autoRoutingStatus.isActive 
                            ? persistentState.autoRoutingStatus.skippedNoCourier 
                            : 0,
                        skippedOther: persistentState.autoRoutingStatus.isActive 
                            ? persistentState.autoRoutingStatus.skippedOther 
                            : 0,
                        isBulkImport: persistentState.autoRoutingStatus.isActive
                            ? persistentState.autoRoutingStatus.isBulkImport
                            : false,
                        currentCourier: persistentState.autoRoutingStatus.isActive
                            ? persistentState.autoRoutingStatus.currentCourier
                            : null,
                        couriersSummary: persistentState.autoRoutingStatus.isActive
                            ? (persistentState.autoRoutingStatus.couriersSummary || {})
                            : {},
                    }
                };
            }
        }
    )
);

// v36.9: Cross-tab synchronization
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
        if (event.key === 'dashboard-sync-storage-v2') {
            useDashboardStore.persist.rehydrate();
        }
    });
}
