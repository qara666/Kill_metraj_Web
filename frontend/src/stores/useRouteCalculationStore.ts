import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RouteCalculationMode, CourierRouteStatus } from '../types';

interface RouteCalculationStore {
    calculationMode: RouteCalculationMode;
    courierStatuses: Map<string, CourierRouteStatus>;
    isCalculating: boolean;
    calculatingCourierId: string | null;

    // Actions
    setCalculationMode: (mode: Partial<RouteCalculationMode>) => void;
    updateCourierStatus: (status: CourierRouteStatus) => void;
    getCourierStatus: (courierId: string) => CourierRouteStatus | undefined;
    setCalculating: (isCalculating: boolean, courierId?: string) => void;
    shouldAutoCalculate: (courierId: string) => boolean;
    resetCourierStatus: (courierId: string) => void;
    clearAllStatuses: () => void;
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

            setCalculationMode: (mode) =>
                set((state) => ({
                    calculationMode: { ...state.calculationMode, ...mode },
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
                }),
        }),
        {
            name: 'route-calculation-storage',
            // Custom serialization for Map
            partialize: (state) => ({
                calculationMode: state.calculationMode,
                courierStatuses: Array.from(state.courierStatuses.entries()),
            }),
            // Custom deserialization for Map
            merge: (persistedState: any, currentState) => ({
                ...currentState,
                ...persistedState,
                courierStatuses: new Map(persistedState.courierStatuses || []),
            }),
        }
    )
);
