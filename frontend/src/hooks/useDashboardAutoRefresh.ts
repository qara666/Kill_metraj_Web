import { useEffect, useRef, useCallback } from 'react';
import { useAutoPlannerStore } from '../stores/useAutoPlannerStore';
import { dashboardApi } from '../services/dashboardApi';
import { ProcessedExcelData } from '../types';
import { formatDateForApi, formatDateTimeForApi } from '../utils/data/apiDataTransformer';
import { logger } from '../utils/ui/logger';

interface DashboardAutoRefreshParams {
    dateTimeDeliveryBeg: string; // datetime-local format
    dateTimeDeliveryEnd: string; // datetime-local format
    onDataLoaded: (data: ProcessedExcelData) => void;
    enabled?: boolean;
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 10000; // 10 seconds

// Парсинг datetime-local в Date объект
const parseDateTimeFromInput = (dateTimeString: string): Date => {
    return new Date(dateTimeString);
};

export const useDashboardAutoRefresh = ({
    dateTimeDeliveryBeg,
    dateTimeDeliveryEnd,
    onDataLoaded,
    enabled = false,
}: DashboardAutoRefreshParams) => {
    const {
        apiKey,
        apiDepartmentId,
        apiAutoRefreshEnabled,
        setApiLastSyncTime,
        setApiNextSyncTime,
        setApiSyncStatus,
        setApiSyncError,
        apiManualSyncTrigger,
        apiDateShift,
        apiDateShiftFilterEnabled
    } = useAutoPlannerStore();

    const intervalRef = useRef<any>(null);
    const retryCountRef = useRef(0);
    const isMountedRef = useRef(true);

    // Use refs for values that don't need to trigger re-sync but are needed inside performSync
    const latestValuesRef = useRef({
        apiKey,
        apiDepartmentId,
        dateTimeDeliveryBeg,
        dateTimeDeliveryEnd,
        apiDateShift,
        apiDateShiftFilterEnabled,
        apiAutoRefreshEnabled,
        onDataLoaded // Store callback in ref
    });

    // Update ref when values change
    useEffect(() => {
        latestValuesRef.current = {
            apiKey,
            apiDepartmentId,
            dateTimeDeliveryBeg,
            dateTimeDeliveryEnd,
            apiDateShift,
            apiDateShiftFilterEnabled,
            apiAutoRefreshEnabled,
            onDataLoaded
        };
    }, [apiKey, apiDepartmentId, dateTimeDeliveryBeg, dateTimeDeliveryEnd, apiDateShift, apiDateShiftFilterEnabled, apiAutoRefreshEnabled, onDataLoaded]);

    const performSync = useCallback(async () => {
        const {
            apiKey: apiKey,
            apiDepartmentId: deptId,
            dateTimeDeliveryBeg: start,
            dateTimeDeliveryEnd: end,
            apiDateShift: dateShiftVal,
            apiDateShiftFilterEnabled: dateShiftEnabled,
            onDataLoaded: callback
        } = latestValuesRef.current;

        if (!apiKey || !apiKey.trim()) {
            logger.warn('Dashboard API auto-refresh: API key not configured');
            setApiSyncError('API ключ не настроен');
            return;
        }

        setApiSyncStatus('syncing');
        setApiSyncError(null);

        try {
            // Парсинг datetime из input
            const deliveryStart = parseDateTimeFromInput(start);
            const deliveryEnd = parseDateTimeFromInput(end);

            // Получение dateShift: если задана явно И включена - используем её
            let dateShift = '';
            if (dateShiftEnabled && dateShiftVal && dateShiftVal.trim()) {
                // Если формат YYYY-MM-DD, преобразуем в dd.mm.yyyy
                const [y, m, d] = dateShiftVal.split('-').map(Number);
                const shiftDate = new Date(y, m - 1, d);
                dateShift = formatDateForApi(shiftDate);
            }
            // Если dateShift не указана, оставляем пустой - API будет искать только по времени

            const params: any = {
                apiKey: apiKey.trim(),
                timeDeliveryBeg: formatDateTimeForApi(deliveryStart),
                timeDeliveryEnd: formatDateTimeForApi(deliveryEnd),
                departmentId: deptId || undefined,
                top: 1000,
            };

            // Добавляем dateShift только если она указана
            if (dateShift) {
                params.dateShift = dateShift;
            }

            logger.info('🔄 Dashboard API auto-refresh: Starting sync...', params);

            // Add timeout to prevent endless sync
            const timeoutPromise = new Promise<{ success: boolean, error?: string }>((_, reject) => {
                setTimeout(() => reject(new Error('Timeout: API did not respond in 30s')), 30000);
            });

            const result = await Promise.race([
                dashboardApi.fetchOrdersFromDashboard(params),
                timeoutPromise
            ]) as { success: boolean; data?: any; error?: string };

            console.log('[useDashboardAutoRefresh] Fetch finished. Is mounted?', isMountedRef.current, 'Result:', result.success);

            if (!isMountedRef.current) {
                console.warn('[useDashboardAutoRefresh] ⚠️ Component unmounted during fetch. Proceeding anyway to ensure data reaches Context.');
            }

            if (result.success && result.data) {
                logger.info(`✅ Dashboard API auto-refresh: Loaded ${result.data.orders.length} orders, ${result.data.couriers.length} couriers`);

                setApiLastSyncTime(Date.now());
                setApiNextSyncTime(Date.now() + REFRESH_INTERVAL_MS);
                setApiSyncStatus('idle');
                setApiSyncError(null);
                retryCountRef.current = 0;

                console.log('[useDashboardAutoRefresh] 🟢 SUCCEEDED! calling onDataLoaded', result.data.orders.length, 'orders');
                if (callback) {
                    callback(result.data);
                }
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (error) {
            if (!isMountedRef.current) return;

            const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
            logger.error('❌ Dashboard API auto-refresh: Sync failed', error);

            setApiSyncStatus('error');
            setApiSyncError(errorMessage);

            // Exponential backoff retry
            if (retryCountRef.current < MAX_RETRY_ATTEMPTS) {
                retryCountRef.current++;
                const retryDelay = RETRY_DELAY_MS * Math.pow(2, retryCountRef.current - 1);
                logger.info(`🔄 Dashboard API auto-refresh: Retrying in ${retryDelay / 1000}s (attempt ${retryCountRef.current}/${MAX_RETRY_ATTEMPTS})`);

                setTimeout(() => {
                    if (isMountedRef.current && latestValuesRef.current.apiAutoRefreshEnabled) {
                        performSync();
                    }
                }, retryDelay);
            } else {
                logger.error('❌ Dashboard API auto-refresh: Max retry attempts reached, giving up');
            }
        }
    }, [
        setApiLastSyncTime,
        setApiNextSyncTime,
        setApiSyncStatus,
        setApiSyncError,
    ]);

    // Track the last processed trigger to avoid re-running on mount/remount
    const lastProcessedTriggerRef = useRef<number | null>(null);

    // Manual sync trigger listener
    useEffect(() => {
        if (apiManualSyncTrigger && apiManualSyncTrigger !== lastProcessedTriggerRef.current) {
            lastProcessedTriggerRef.current = apiManualSyncTrigger;
            logger.info('🔄 Dashboard API auto-refresh: Manual trigger detected');
            performSync();
        }
    }, [apiManualSyncTrigger, performSync]);

    // Setup interval
    useEffect(() => {
        if (!enabled || !apiAutoRefreshEnabled) {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            if (useAutoPlannerStore.getState().apiSyncStatus === 'syncing') {
                setApiSyncStatus('idle');
            }
            return;
        }

        logger.info('🔄 Dashboard API auto-refresh: Auto-refresh enabled, scheduling...');
        performSync();

        intervalRef.current = setInterval(() => {
            performSync();
        }, REFRESH_INTERVAL_MS);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [enabled, apiAutoRefreshEnabled, performSync, setApiSyncStatus]);

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    return {
        performSync,
    };
};
