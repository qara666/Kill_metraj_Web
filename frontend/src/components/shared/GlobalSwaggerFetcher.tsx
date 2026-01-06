import React, { useCallback } from 'react';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useAutoPlannerStore } from '../../stores/useAutoPlannerStore';
import { useSwaggerAutoRefresh } from '../../hooks/useSwaggerAutoRefresh';
import { ProcessedExcelData } from '../../types';
import { logger } from '../../utils/ui/logger';
import { mergeExcelData } from '../../utils/data/dataMerging';

export const GlobalSwaggerFetcher: React.FC = () => {
    const { updateExcelData } = useExcelData();
    const {
        swaggerAutoRefreshEnabled,
        swaggerTimeDeliveryBeg,
        swaggerTimeDeliveryEnd
    } = useAutoPlannerStore();

    const handleDataLoaded = useCallback((data: ProcessedExcelData) => {
        logger.info(`🌐 Global Fetcher: Loaded ${data.orders.length} orders`);

        // Use updateExcelData to merge with existing data, mimicking Excel upload behavior
        // This ensures tabs are populated correctly by triggering state updates with merged result
        // @ts-ignore
        updateExcelData((prevData) => {
            return mergeExcelData(data, prevData);
        });

        // Ensure routes are also updated if present and merged
        if (data.routes && data.routes.length > 0) {
            // This might need more careful handling if routes are already merged in updateExcelData
            // But updateRouteData updates 'routes' field specifically. 
            // Since mergeExcelData handles routes, we might not need this if we use updateExcelData correctly.
            // Let's rely on updateExcelData doing the job for routes too.
            // But for safety, if we want to force route update:
            // updateRouteData(data.routes); // This might overwrite. Let's trust mergeExcelData.
        }
    }, [updateExcelData]);

    useSwaggerAutoRefresh({
        enabled: swaggerAutoRefreshEnabled,
        dateTimeDeliveryBeg: swaggerTimeDeliveryBeg,
        dateTimeDeliveryEnd: swaggerTimeDeliveryEnd,
        onDataLoaded: handleDataLoaded
    });

    return null; // This component does not render anything
};
