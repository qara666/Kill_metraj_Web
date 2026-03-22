import React from 'react';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useDashboardWebSocket } from '../../hooks/useDashboardWebSocket';
import { useContinuousAutoRouting } from '../../hooks/useContinuousAutoRouting';

export const GlobalDashboardFetcher: React.FC = () => {
    const { setExcelData } = useExcelData();

    // 1. WebSocket for Dashboard updates
    useDashboardWebSocket({
        onDataLoaded: (data) => {
            console.log('🔄 Global background sync: Data updated');
            setExcelData(data);
        },
        enabled: true
    });

    // 2. Background Continuous Auto-Routing engine
    useContinuousAutoRouting();

    return null;
};
