import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RouteCalculationMode, CourierRouteStatus, GroupingConfig } from '../types';
import { DEFAULT_GROUPING_CONFIG } from '../types';

interface RouteCalculationStore {
    calculationMode: RouteCalculationMode;
    courierStatuses: Map<string, CourierRouteStatus>;
    isCalculating: boolean;
    calculatingCourierId: string | null;
    groupingConfig: GroupingConfig;
    manualModified: Map<string, number>;

    setCalculationMode: (mode: Partial<RouteCalculationMode>) => void;
    setGroupingConfig: (config: Partial<GroupingConfig>) => void;
    updateCourierStatus: (status: CourierRouteStatus) => void;
    getCourierStatus: (courierId: string) => CourierRouteStatus | undefined;
    setCalculating: (isCalculating: boolean, courierId?: string) => void;
    shouldAutoCalculate: (courierId: string) => boolean;
    resetCourierStatus: (courierId: string) => void;
    clearAllStatuses: () => void;
    markModified: (courierName: string) => void;
    getModified: (courierName: string) => number | undefined;
    clearModified: (courierName?: string) => void;
}

const defaultCalculationMode: RouteCalculationMode = {
    mode: 'manual',
    autoTriggerThreshold: 3,
    recalculateOnAdd: true,
    recalculateOnRemove: false,
    notifyOnCalculation: true,
};

export const useRouteCalculationStore = create<RouteCalculationStore>()(
    persist(
        (set, get) => ({
            calculationMode: defaultCalculationMode,
            courierStatuses: new Map(),
            isCalculating: false,
            calculatingCourierId: null,
            groupingConfig: { ...DEFAULT_GROUPING_CONFIG },
            manualModified: new Map(),

            setCalculationMode: (mode) =>
                set((state) => ({
                    calculationMode: { ...state.calculationMode, ...mode },
                })),

            setGroupingConfig: (config) =>
                set((state) => ({
                    groupingConfig: { ...state.groupingConfig, ...config },
                })),

            updateCourierStatus: (status) =>
                set((state) => {
                    const newStatuses = new Map(state.courierStatuses);
                    newStatuses.set(status.courierId, status);
                    return { courierStatuses: newStatuses };
                }),

            getCourierStatus: (courierId) => {
                return get().courierStatuses.get(courierId);
            },

            setCalculating: (isCalculating, courierId) =>
                set({
                    isCalculating,
                    calculatingCourierId: isCalculating ? courierId || null : null,
                }),

            shouldAutoCalculate: (courierId) => {
                const { calculationMode, courierStatuses } = get();
                if (calculationMode.mode !== 'automatic') return false;

                const status = courierStatuses.get(courierId);
                if (!status) return false;

                return (
                    status.ordersCount >= calculationMode.autoTriggerThreshold &&
                    status.needsRecalculation
                );
            },

            resetCourierStatus: (courierId) =>
                set((state) => {
                    const newStatuses = new Map(state.courierStatuses);
                    newStatuses.delete(courierId);
                    return { courierStatuses: newStatuses };
                }),

            clearAllStatuses: () =>
                set({
                    courierStatuses: new Map(),
                    isCalculating: false,
                    calculatingCourierId: null,
                    groupingConfig: { ...DEFAULT_GROUPING_CONFIG },
                    manualModified: new Map(),
                }),

            markModified: (courierName) =>
                set((state) => {
                    const next = new Map(state.manualModified);
                    next.set(courierName, Date.now());
                    return { manualModified: next };
                }),

            getModified: (courierName) => {
                return get().manualModified.get(courierName);
            },

            clearModified: (courierName) =>
                set((state) => {
                    if (!courierName) {
                        return { manualModified: new Map() };
                    }
                    const next = new Map(state.manualModified);
                    next.delete(courierName);
                    return { manualModified: next };
                }),
        }),
        {
            name: 'route-calculation-storage',
            partialize: (state) => ({
                calculationMode: state.calculationMode,
                courierStatuses: Array.from(state.courierStatuses.entries()),
                groupingConfig: state.groupingConfig,
                manualModified: Array.from(state.manualModified.entries()),
            }),
            merge: (persistedState: any, currentState) => ({
                ...currentState,
                ...persistedState,
                courierStatuses: new Map(persistedState?.courierStatuses || []),
                groupingConfig: persistedState?.groupingConfig || DEFAULT_GROUPING_CONFIG,
                manualModified: new Map(persistedState?.manualModified || []),
            }),
        }
    )
);
