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

    // Dashboard API settings
    apiKey: string;
    apiDepartmentId: number | null;
    lastApiImport: {
        dateShift: string;
        timeDeliveryBeg: string;
        timeDeliveryEnd: string;
    } | null;

    // Auto-refresh settings
    apiAutoRefreshEnabled: boolean;
    apiLastSyncTime: number | null;
    apiNextSyncTime: number | null;
    apiSyncStatus: 'idle' | 'syncing' | 'error';
    apiSyncError: string | null;
    apiTimeDeliveryBeg: string; // datetime-local format
    apiTimeDeliveryEnd: string; // datetime-local format
    apiDateShift: string; // YYYY-MM-DD
    apiDateShiftFilterEnabled: boolean; // Toggle for dateShift
    apiTimeFilterEnabled: boolean; // Toggle for timeDeliveryBeg/End
    apiManualSyncTrigger: number | null;

    // UI Actions
    setTrafficHeatmapCollapsed: (collapsed: boolean) => void;
    setWorkloadHeatmapCollapsed: (collapsed: boolean) => void;
    setFiltersExpanded: (expanded: boolean) => void;

    toggleCoverageAnalysis: () => void;
    toggleWorkloadHeatmap: () => void;
    toggleScheduleFiltering: () => void;
    setEnableScheduleFiltering: (enabled: boolean) => void;

    // Dashboard API actions
    setApiKey: (apiKey: string) => void;
    setApiDepartmentId: (departmentId: number | null) => void;
    setLastApiImport: (params: { dateShift: string; timeDeliveryBeg: string; timeDeliveryEnd: string }) => void;

    // Auto-refresh actions
    setApiAutoRefreshEnabled: (enabled: boolean) => void;
    setApiLastSyncTime: (time: number | null) => void;
    setApiNextSyncTime: (time: number | null) => void;
    setApiSyncStatus: (status: 'idle' | 'syncing' | 'error') => void;
    setApiSyncError: (error: string | null) => void;
    setApiTimeDeliveryBeg: (time: string) => void;
    setApiTimeDeliveryEnd: (time: string) => void;
    setApiDateShift: (date: string) => void;
    setApiDateShiftFilterEnabled: (enabled: boolean) => void;
    setApiTimeFilterEnabled: (enabled: boolean) => void;
    triggerApiManualSync: () => void;
}

export const useAutoPlannerStore = create<AutoPlannerUIState>()(
    persist(
        (set) => ({
            isFiltersExpanded: false,

            // Dashboard defaults
            apiKey: '',
            apiDepartmentId: null,
            apiAutoRefreshEnabled: false,
            apiLastSyncTime: null,
            apiNextSyncTime: null,
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
            apiManualSyncTrigger: null,

            // Collapsed states defaults
            isTrafficHeatmapCollapsed: true,
            isWorkloadHeatmapCollapsed: true,
            enableCoverageAnalysis: false,
            enableWorkloadHeatmap: false,
            enableScheduleFiltering: false,
            lastApiImport: null,

            setTrafficHeatmapCollapsed: (collapsed) => set({ isTrafficHeatmapCollapsed: collapsed }),
            setWorkloadHeatmapCollapsed: (collapsed) => set({ isWorkloadHeatmapCollapsed: collapsed }),
            setFiltersExpanded: (expanded) => set({ isFiltersExpanded: expanded }),

            toggleCoverageAnalysis: () => set((state) => ({ enableCoverageAnalysis: !state.enableCoverageAnalysis })),
            toggleWorkloadHeatmap: () => set((state) => ({ enableWorkloadHeatmap: !state.enableWorkloadHeatmap })),
            toggleScheduleFiltering: () => set((state) => ({ enableScheduleFiltering: !state.enableScheduleFiltering })),
            setEnableScheduleFiltering: (enabled) => set({ enableScheduleFiltering: enabled }),

            setApiKey: (key) => set({ apiKey: key }),
            setApiDepartmentId: (id) => set({ apiDepartmentId: id }),
            setLastApiImport: (params) => set({ lastApiImport: params }),

            setApiAutoRefreshEnabled: (enabled) => set({ apiAutoRefreshEnabled: enabled }),
            setApiLastSyncTime: (time) => set({ apiLastSyncTime: time }),
            setApiNextSyncTime: (time) => set({ apiNextSyncTime: time }),
            setApiSyncStatus: (status) => set({ apiSyncStatus: status }),
            setApiSyncError: (error) => set({ apiSyncError: error }),
            setApiTimeDeliveryBeg: (time) => set({ apiTimeDeliveryBeg: time }),
            setApiTimeDeliveryEnd: (time) => set({ apiTimeDeliveryEnd: time }),
            setApiDateShift: (date) => set({ apiDateShift: date }),
            setApiDateShiftFilterEnabled: (enabled) => set({ apiDateShiftFilterEnabled: enabled }),
            setApiTimeFilterEnabled: (enabled) => set({ apiTimeFilterEnabled: enabled }),
            triggerApiManualSync: () => set({ apiManualSyncTrigger: Date.now() }),
        }),
        {
            name: 'autoplanner-ui-storage-v2', // Updated storage name to force clean slate or handle migration
        }
    )
);
