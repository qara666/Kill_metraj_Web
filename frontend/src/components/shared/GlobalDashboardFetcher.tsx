import React from 'react';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useDashboardWebSocket } from '../../hooks/useDashboardWebSocket';

/**
 * Global component that handles background data synchronization.
 * v20.1: Relies on the Backend Turbo Robot for calculations.
 * Fixed to ensure no UI crashes from stale references.
 * v5.154: Don't overwrite data if server returns empty but we have local data
 */
export const GlobalDashboardFetcher: React.FC = () => {
    const { setExcelData, excelData } = useExcelData();
    
    // Listen for real-time updates (inc. Robot calculation signals)
    // Synchronizes the received data into the global Excel context.
    useDashboardWebSocket({ 
        onDataLoaded: (data) => {
            if (data && typeof setExcelData === 'function') {
                // v5.154: Don't overwrite existing data with empty data
                const hasNewOrders = data.orders && data.orders.length > 0;
                const hasExistingOrders = excelData?.orders && excelData.orders.length > 0;
                
                if (hasNewOrders) {
                    // New data has orders - use it
                    // New data has orders - use it
                    setExcelData(data);
                } else if (!hasExistingOrders) {
                    // No new orders AND no existing orders - OK to set
                    // No new orders AND no existing orders - OK to set
                    setExcelData(data);
                } else {
                    // No new orders but we have existing orders - skip to preserve data
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
