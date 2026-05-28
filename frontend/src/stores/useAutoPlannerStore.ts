import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AutoPlannerUIState {
    // Свёрнутые панели
    isTrafficHeatmapCollapsed: boolean;
    isWorkloadHeatmapCollapsed: boolean;
    isFiltersExpanded: boolean;

    // Переключатели функций
    enableCoverageAnalysis: boolean;
    enableWorkloadHeatmap: boolean;
    enableScheduleFiltering: boolean;

    // Настройки Dashboard API
    lastApiImport: {
        dateShift: string;
        timeDeliveryBeg: string;
        timeDeliveryEnd: string;
    } | null;

    // Действия интерфейса
    setTrafficHeatmapCollapsed: (collapsed: boolean) => void;
    setWorkloadHeatmapCollapsed: (collapsed: boolean) => void;
    setFiltersExpanded: (expanded: boolean) => void;

    toggleCoverageAnalysis: () => void;
    toggleWorkloadHeatmap: () => void;
    toggleScheduleFiltering: () => void;
    setEnableScheduleFiltering: (enabled: boolean) => void;

    // Действия Dashboard API
    setLastApiImport: (params: { dateShift: string; timeDeliveryBeg: string; timeDeliveryEnd: string }) => void;
}

export const useAutoPlannerStore = create<AutoPlannerUIState>()(
    persist(
        (set) => ({
            isFiltersExpanded: false,

            // Значения по умолчанию
            lastApiImport: null,

            // Свёрнутые панели по умолчанию
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
