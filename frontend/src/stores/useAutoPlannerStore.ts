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

interface AutoPlannerUIState {
    // Collapsed states
    isTrafficHeatmapCollapsed: boolean;
    isWorkloadHeatmapCollapsed: boolean;
    isFiltersExpanded: boolean;

    // Feature toggles
    enableCoverageAnalysis: boolean;
    enableWorkloadHeatmap: boolean;
    enableScheduleFiltering: boolean;

    // Swagger API settings
    swaggerApiKey: string;
    swaggerDepartmentId: number | null;
    lastSwaggerImport: {
        dateShift: string;
        timeDeliveryBeg: string;
        timeDeliveryEnd: string;
    } | null;

    // Auto-refresh settings
    swaggerAutoRefreshEnabled: boolean;
    swaggerLastSyncTime: number | null;
    swaggerNextSyncTime: number | null;
    swaggerSyncStatus: 'idle' | 'syncing' | 'error';
    swaggerSyncError: string | null;
    swaggerTimeDeliveryBeg: string; // datetime-local format
    swaggerTimeDeliveryEnd: string; // datetime-local format
    swaggerDateShift: string; // YYYY-MM-DD
    swaggerDateShiftFilterEnabled: boolean; // Toggle for dateShift
    swaggerManualSyncTrigger: number | null;

    // UI Actions
    setTrafficHeatmapCollapsed: (collapsed: boolean) => void;
    setWorkloadHeatmapCollapsed: (collapsed: boolean) => void;
    setFiltersExpanded: (expanded: boolean) => void;

    toggleCoverageAnalysis: () => void;
    toggleWorkloadHeatmap: () => void;
    toggleScheduleFiltering: () => void;
    setEnableScheduleFiltering: (enabled: boolean) => void;

    // Swagger API actions
    setSwaggerApiKey: (apiKey: string) => void;
    setSwaggerDepartmentId: (departmentId: number | null) => void;
    setLastSwaggerImport: (params: { dateShift: string; timeDeliveryBeg: string; timeDeliveryEnd: string }) => void;

    // Auto-refresh actions
    setSwaggerAutoRefreshEnabled: (enabled: boolean) => void;
    setSwaggerLastSyncTime: (time: number | null) => void;
    setSwaggerNextSyncTime: (time: number | null) => void;
    setSwaggerSyncStatus: (status: 'idle' | 'syncing' | 'error') => void;
    setSwaggerSyncError: (error: string | null) => void;
    setSwaggerTimeDeliveryBeg: (time: string) => void;
    setSwaggerTimeDeliveryEnd: (time: string) => void;
    setSwaggerDateShift: (date: string) => void;
    setSwaggerDateShiftFilterEnabled: (enabled: boolean) => void;
    triggerSwaggerManualSync: () => void;
}

export const useAutoPlannerStore = create<AutoPlannerUIState>()(
    persist(
        (set) => ({
            isFiltersExpanded: false,

            // Swagger defaults
            swaggerApiKey: '',
            swaggerDepartmentId: null,
            swaggerAutoRefreshEnabled: false,
            swaggerLastSyncTime: null,
            swaggerNextSyncTime: null,
            swaggerSyncStatus: 'idle',
            swaggerSyncError: null,
            swaggerTimeDeliveryBeg: (() => {
                const now = new Date();
                now.setHours(11, 0, 0, 0);
                return formatDateTimeForInput(now);
            })(),
            swaggerTimeDeliveryEnd: (() => {
                const now = new Date();
                now.setHours(23, 0, 0, 0);
                return formatDateTimeForInput(now);
            })(),
            swaggerDateShift: (() => {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            })(),
            swaggerDateShiftFilterEnabled: true,
            swaggerManualSyncTrigger: null,

            // Collapsed states defaults
            isTrafficHeatmapCollapsed: true,
            isWorkloadHeatmapCollapsed: true,
            enableCoverageAnalysis: false,
            enableWorkloadHeatmap: false,
            enableScheduleFiltering: false,
            lastSwaggerImport: null,

            setTrafficHeatmapCollapsed: (collapsed) => set({ isTrafficHeatmapCollapsed: collapsed }),
            setWorkloadHeatmapCollapsed: (collapsed) => set({ isWorkloadHeatmapCollapsed: collapsed }),
            setFiltersExpanded: (expanded) => set({ isFiltersExpanded: expanded }),

            toggleCoverageAnalysis: () => set((state) => ({ enableCoverageAnalysis: !state.enableCoverageAnalysis })),
            toggleWorkloadHeatmap: () => set((state) => ({ enableWorkloadHeatmap: !state.enableWorkloadHeatmap })),
            toggleScheduleFiltering: () => set((state) => ({ enableScheduleFiltering: !state.enableScheduleFiltering })),
            setEnableScheduleFiltering: (enabled) => set({ enableScheduleFiltering: enabled }),

            setSwaggerApiKey: (key) => set({ swaggerApiKey: key }),
            setSwaggerDepartmentId: (id) => set({ swaggerDepartmentId: id }),
            setLastSwaggerImport: (params) => set({ lastSwaggerImport: params }),

            setSwaggerAutoRefreshEnabled: (enabled) => set({ swaggerAutoRefreshEnabled: enabled }),
            setSwaggerLastSyncTime: (time) => set({ swaggerLastSyncTime: time }),
            setSwaggerNextSyncTime: (time) => set({ swaggerNextSyncTime: time }),
            setSwaggerSyncStatus: (status) => set({ swaggerSyncStatus: status }),
            setSwaggerSyncError: (error) => set({ swaggerSyncError: error }),
            setSwaggerTimeDeliveryBeg: (time) => set({ swaggerTimeDeliveryBeg: time }),
            setSwaggerTimeDeliveryEnd: (time) => set({ swaggerTimeDeliveryEnd: time }),
            setSwaggerDateShift: (date) => set({ swaggerDateShift: date }),
            setSwaggerDateShiftFilterEnabled: (enabled) => set({ swaggerDateShiftFilterEnabled: enabled }),
            triggerSwaggerManualSync: () => set({ swaggerManualSyncTrigger: Date.now() }),
        }),
        {
            name: 'autoplanner-ui-storage',
        }
    )
);
