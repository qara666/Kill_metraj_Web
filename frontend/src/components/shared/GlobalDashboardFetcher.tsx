import React, { useCallback } from 'react';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useDashboardWebSocket } from '../../hooks/useDashboardWebSocket';
import { ProcessedExcelData } from '../../types';
import { logger } from '../../utils/ui/logger';
import { syncDashboardData } from '../../utils/data/dataMerging';

export const GlobalDashboardFetcher: React.FC = () => {
    const { updateExcelData } = useExcelData();
    const { apiAutoRefreshEnabled } = useDashboardStore();

    const handleDataLoaded = useCallback((data: ProcessedExcelData) => {
        logger.info(` Global Fetcher: Loaded ${data.orders.length} orders from Dashboard API (WebSocket/Auto-Refresh)`);

        // Use updateExcelData to sync with existing data (replaces logic)
        updateExcelData((prevData) => {
            return syncDashboardData(data, prevData);
        });
    }, [updateExcelData]);

    // Use WebSocket-based updates instead of polling
    const { isConnected } = useDashboardWebSocket({
        enabled: apiAutoRefreshEnabled,
        onDataLoaded: handleDataLoaded
    });

    // Log connection status
    React.useEffect(() => {
        if (apiAutoRefreshEnabled) {
            logger.info(` WebSocket connection status: ${isConnected ? 'Connected' : 'Disconnected'}`);
        }
    }, [isConnected, apiAutoRefreshEnabled]);

    return null; // This component does not render anything
};
