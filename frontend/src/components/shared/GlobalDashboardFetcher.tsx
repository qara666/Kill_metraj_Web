import React, { useCallback } from 'react';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useAutoPlannerStore } from '../../stores/useAutoPlannerStore';
import { useDashboardAutoRefresh } from '../../hooks/useDashboardAutoRefresh';
import { ProcessedExcelData } from '../../types';
import { logger } from '../../utils/ui/logger';
import { mergeExcelData } from '../../utils/data/dataMerging';

export const GlobalDashboardFetcher: React.FC = () => {
    const { updateExcelData } = useExcelData();
    const {
        apiAutoRefreshEnabled,
        apiTimeDeliveryBeg,
        apiTimeDeliveryEnd
    } = useAutoPlannerStore();

    const handleDataLoaded = useCallback((data: ProcessedExcelData) => {
        logger.info(`🌐 Global Fetcher: Loaded ${data.orders.length} orders from Dashboard API`);

        // Use updateExcelData to merge with existing data
        updateExcelData((prevData) => {
            return mergeExcelData(data, prevData);
        });
    }, [updateExcelData]);

    useDashboardAutoRefresh({
        enabled: apiAutoRefreshEnabled,
        dateTimeDeliveryBeg: apiTimeDeliveryBeg,
        dateTimeDeliveryEnd: apiTimeDeliveryEnd,
        onDataLoaded: handleDataLoaded
    });

    return null; // This component does not render anything
};
