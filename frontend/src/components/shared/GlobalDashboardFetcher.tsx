import React from 'react';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useDashboardWebSocket } from '../../hooks/useDashboardWebSocket';

/**
 * Headless component that maintains a background WebSocket connection 
 * for dashboard updates. It ensures that data remains synchronized
 * across all sections of the application.
 */
export const GlobalDashboardFetcher: React.FC = () => {
    const { setExcelData } = useExcelData();

    // The logic is encapsulated in the useDashboardWebSocket hook.
    // We provide a callback to update the global Excel Data context.
    useDashboardWebSocket({
        onDataLoaded: (data) => {
            console.log('🔄 Global background sync: Data updated');
            setExcelData(data);
        },
        enabled: true // Always enabled if the component is mounted
    });

    return null;
};
