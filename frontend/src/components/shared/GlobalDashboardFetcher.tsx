import React, { useCallback } from 'react';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useAutoPlannerStore } from '../../stores/useAutoPlannerStore';
import { useDashboardWebSocket } from '../../hooks/useDashboardWebSocket';
import { ProcessedExcelData } from '../../types';
import { logger } from '../../utils/ui/logger';
import { mergeExcelData } from '../../utils/data/dataMerging';

export const GlobalDashboardFetcher: React.FC = () => {
    const { updateExcelData } = useExcelData();
    const { apiAutoRefreshEnabled } = useAutoPlannerStore();

    const handleDataLoaded = useCallback((data: ProcessedExcelData) => {
        logger.info(`🌐 Global Fetcher: Loaded ${data.orders.length} orders from Dashboard API (WebSocket)`);

        // Use updateExcelData to merge with existing data
        updateExcelData((prevData) => {
            return mergeExcelData(data, prevData);
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
            logger.info(`🔌 WebSocket connection status: ${isConnected ? 'Connected' : 'Disconnected'}`);
        }
    }, [isConnected, apiAutoRefreshEnabled]);

    return null; // This component does not render anything
};
