import React from 'react';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useDashboardWebSocket } from '../../hooks/useDashboardWebSocket';
import { normalizeCourierName } from '../../utils/data/courierName';

/**
 * Global component that handles background data synchronization.
 * v20.1: Relies on the Backend Turbo Robot for calculations.
 * Fixed to ensure no UI crashes from stale references.
 * v5.154: Don't overwrite data if server returns empty but we have local data
 * v5.180: Validate and normalize backend data to match frontend expectations
 */
export const GlobalDashboardFetcher: React.FC = () => {
    const { setExcelData, excelData } = useExcelData();
    
    // v5.180: Validate and normalize backend data before setting
    const validateBackendData = React.useCallback((data: any) => {
        if (!data) return data;
        
        const validated = { ...data };
        
        // Validate routes - normalize courier names
        if (validated.routes && Array.isArray(validated.routes)) {
            validated.routes = validated.routes.map((route: any) => {
                const rawCourier = route.courier || route.courier_id || route.courierName || '';
                const normCourier = normalizeCourierName(rawCourier);
                
                // Skip routes with invalid couriers
                if (!normCourier || normCourier === 'Не назначено' || normCourier.toLowerCase() === 'по') {
                    return null;
                }
                
                return {
                    ...route,
                    courier: normCourier,
                    courier_id: normCourier,
                    orders: (route.orders || []).map((o: any) => ({
                        ...o,
                        courier: normalizeCourierName(o.courier) || normCourier,
                    })),
                };
            }).filter(Boolean);
        }
        
        // Validate orders - normalize courier names
        if (validated.orders && Array.isArray(validated.orders)) {
            validated.orders = validated.orders.map((order: any) => ({
                ...order,
                courier: normalizeCourierName(order.courier) || order.courier,
            }));
        }
        
        // Validate couriers - normalize names
        if (validated.couriers && Array.isArray(validated.couriers)) {
            validated.couriers = validated.couriers.map((c: any) => ({
                ...c,
                name: normalizeCourierName(c.name) || c.name,
            })).filter((c: any) => {
                const norm = normalizeCourierName(c.name);
                return norm && norm !== 'Не назначено';
            });
        }
        
        return validated;
    }, []);
    
    // Listen for real-time updates (inc. Robot calculation signals)
    // Synchronizes the received data into the global Excel context.
    useDashboardWebSocket({ 
        onDataLoaded: (data) => {
            if (data && typeof setExcelData === 'function') {
                // v5.180: Validate backend data before setting
                const validatedData = validateBackendData(data);
                
                // v5.154: Don't overwrite existing data with empty data
                // v5.180: Also check for routes - robot may send route updates without orders
                const hasNewOrders = validatedData.orders && validatedData.orders.length > 0;
                const hasExistingOrders = excelData?.orders && excelData.orders.length > 0;
                const hasNewRoutes = validatedData.routes && validatedData.routes.length > 0;
                
                if (hasNewOrders) {
                    // New data has orders - use it
                    setExcelData(validatedData);
                } else if (hasNewRoutes) {
                    // v5.180: New data has routes - merge them in
                    setExcelData({
                        ...validatedData,
                        orders: excelData?.orders || validatedData.orders || [],
                        couriers: validatedData.couriers || excelData?.couriers || [],
                    });
                } else if (!hasExistingOrders) {
                    // No new orders AND no existing orders - OK to set
                    setExcelData(validatedData);
                } else {
                    // No new orders but we have existing orders - skip to preserve data
                }
            }
        },
        enabled: true
    });

    // v20.1: All routing/geocoding is strictly offloaded to the backend robot.
    // This component now purely serves as a passive state synchronization listener.

    return null;
};
