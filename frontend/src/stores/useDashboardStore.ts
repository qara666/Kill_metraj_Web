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
        processedCouriers: number;
        totalCouriers: number;
        // v5.133: Detailed stats for transparency
        skippedGeocoding: number;
        skippedInRoutes: number;
        skippedNoCourier: number;
        skippedOther: number;
        isBulkImport: boolean; // v5.160: For logic reporting
    };

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
                processedCouriers: 0,
                totalCouriers: 0,
                skippedGeocoding: 0,
                skippedInRoutes: 0,
                skippedNoCourier: 0,
                skippedOther: 0,
                isBulkImport: false,
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
                    }
                };
            }
        }
    )
);
