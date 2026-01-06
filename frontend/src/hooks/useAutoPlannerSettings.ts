import { useState, useCallback, useEffect } from 'react';

const SETTINGS_STORAGE_KEY = 'km_planner_settings';

export const useAutoPlannerSettings = () => {
    const [maxStopsPerRoute, setMaxStopsPerRoute] = useState(12);
    const [maxRouteDurationMin, setMaxRouteDurationMin] = useState(120);
    const [maxRouteDistanceKm, setMaxRouteDistanceKm] = useState(80);
    const [maxWaitPerStopMin, setMaxWaitPerStopMin] = useState(15);

    const [routePlanningSettings, setRoutePlanningSettings] = useState({
        orderPriority: 'deliveryTime' as 'deliveryTime' | 'distance' | 'zone' | 'none',
        prioritizeUrgent: true,
        urgentThresholdMinutes: 30,
        loadBalancing: 'equal' as 'equal' | 'byZone' | 'byDistance' | 'none',
        maxOrdersPerCourier: null as number | null,
        minOrdersPerRoute: 1,
        groupingStrategy: 'proximity' as 'proximity' | 'zone' | 'timeWindow' | 'paymentMethod' | 'none',
        proximityGroupingRadius: 1000,
        timeWindowGroupingMinutes: 60,
        optimizationGoal: 'balance' as 'distance' | 'time' | 'balance' | 'turns',
        avoidTraffic: true,
        preferMainRoads: false,
        minRouteEfficiency: 0.5,
        allowRouteSplitting: true,
        preferSingleZoneRoutes: true,
        maxReadyTimeDifferenceMinutes: 45,
        maxDistanceBetweenOrdersKm: 15 as number | null,
        enableOrderCombining: true,
        combineMaxDistanceMeters: 500,
        combineMaxTimeWindowMinutes: 30,
        trafficImpactLevel: 'medium' as 'low' | 'medium' | 'high',
        lateDeliveryPenalty: 50
    });

    // Load from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.maxStopsPerRoute) setMaxStopsPerRoute(parsed.maxStopsPerRoute);
                if (parsed.maxRouteDurationMin) setMaxRouteDurationMin(parsed.maxRouteDurationMin);
                if (parsed.maxRouteDistanceKm) setMaxRouteDistanceKm(parsed.maxRouteDistanceKm);
                if (parsed.maxWaitPerStopMin) setMaxWaitPerStopMin(parsed.maxWaitPerStopMin);

                setRoutePlanningSettings(prev => ({
                    ...prev,
                    ...parsed.routePlanningSettings,
                    ...parsed // Support flat structure if it was saved that way
                }));
            }
        } catch (e) {
            console.error('Failed to load settings', e);
        }
    }, []);

    // Save to localStorage
    useEffect(() => {
        const settings = {
            maxStopsPerRoute,
            maxRouteDurationMin,
            maxRouteDistanceKm,
            maxWaitPerStopMin,
            ...routePlanningSettings
        };
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    }, [maxStopsPerRoute, maxRouteDurationMin, maxRouteDistanceKm, maxWaitPerStopMin, routePlanningSettings]);

    const updatePlanningSettings = useCallback((updates: Partial<typeof routePlanningSettings>) => {
        setRoutePlanningSettings(prev => ({ ...prev, ...updates }));
    }, []);

    return {
        maxStopsPerRoute,
        setMaxStopsPerRoute,
        maxRouteDurationMin,
        setMaxRouteDurationMin,
        maxRouteDistanceKm,
        setMaxRouteDistanceKm,
        maxWaitPerStopMin,
        setMaxWaitPerStopMin,
        routePlanningSettings,
        updatePlanningSettings
    };
};
