import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
    lastApiImport: {
        dateShift: string;
        timeDeliveryBeg: string;
        timeDeliveryEnd: string;
    } | null;

    // UI Actions
    setTrafficHeatmapCollapsed: (collapsed: boolean) => void;
    setWorkloadHeatmapCollapsed: (collapsed: boolean) => void;
    setFiltersExpanded: (expanded: boolean) => void;

    toggleCoverageAnalysis: () => void;
    toggleWorkloadHeatmap: () => void;
    toggleScheduleFiltering: () => void;
    setEnableScheduleFiltering: (enabled: boolean) => void;

    // Dashboard API actions
    setLastApiImport: (params: { dateShift: string; timeDeliveryBeg: string; timeDeliveryEnd: string }) => void;
}

export const useAutoPlannerStore = create<AutoPlannerUIState>()(
    persist(
        (set) => ({
            isFiltersExpanded: false,

            // Dashboard defaults
            lastApiImport: null,

            // Collapsed states defaults
            isTrafficHeatmapCollapsed: true,
            isWorkloadHeatmapCollapsed: true,
            enableCoverageAnalysis: false,
            enableWorkloadHeatmap: false,
            enableScheduleFiltering: false,

            setTrafficHeatmapCollapsed: (collapsed) => set({ isTrafficHeatmapCollapsed: collapsed }),
            setWorkloadHeatmapCollapsed: (collapsed) => set({ isWorkloadHeatmapCollapsed: collapsed }),
            setFiltersExpanded: (expanded) => set({ isFiltersExpanded: expanded }),

            toggleCoverageAnalysis: () => set((state) => ({ enableCoverageAnalysis: !state.enableCoverageAnalysis })),
            toggleWorkloadHeatmap: () => set((state) => ({ enableWorkloadHeatmap: !state.enableWorkloadHeatmap })),
            toggleScheduleFiltering: () => set((state) => ({ enableScheduleFiltering: !state.enableScheduleFiltering })),
            setEnableScheduleFiltering: (enabled) => set({ enableScheduleFiltering: enabled }),

            setLastApiImport: (params) => set({ lastApiImport: params }),
        }),
        {
            name: 'autoplanner-ui-storage-v2',
            partialize: (state) => {
                const {
                    ...persistentState
                } = state;
                return persistentState;
            }
        }
    )
);
