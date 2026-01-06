import { useEffect, useRef, useCallback } from 'react';
import { useAutoPlannerStore } from '../stores/useAutoPlannerStore';
import { fastopertorApi } from '../services/fastopertorApi';
import { ProcessedExcelData } from '../types';
import { formatDateForSwagger, formatDateTimeForSwagger } from '../utils/data/swaggerDataTransformer';
import { logger } from '../utils/ui/logger';

interface SwaggerAutoRefreshParams {
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

export const useSwaggerAutoRefresh = ({
    dateTimeDeliveryBeg,
    dateTimeDeliveryEnd,
    onDataLoaded,
    enabled = false,
}: SwaggerAutoRefreshParams) => {
    const {
        swaggerApiKey,
        swaggerDepartmentId,
        swaggerAutoRefreshEnabled,
        setSwaggerLastSyncTime,
        setSwaggerNextSyncTime,
        setSwaggerSyncStatus,
        setSwaggerSyncError,
        swaggerManualSyncTrigger,
        swaggerDateShift,
        swaggerDateShiftFilterEnabled
    } = useAutoPlannerStore();

    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const retryCountRef = useRef(0);
    const isMountedRef = useRef(true);

    // Use refs for values that don't need to trigger re-sync but are needed inside performSync
    const latestValuesRef = useRef({
        swaggerApiKey,
        swaggerDepartmentId,
        dateTimeDeliveryBeg,
        dateTimeDeliveryEnd,
        swaggerDateShift,
        swaggerDateShiftFilterEnabled, // Added
        swaggerAutoRefreshEnabled,
        onDataLoaded // Store callback in ref
    });

    // Update ref when values change
    useEffect(() => {
        latestValuesRef.current = {
            swaggerApiKey,
            swaggerDepartmentId,
            dateTimeDeliveryBeg,
            dateTimeDeliveryEnd,
            swaggerDateShift,
            swaggerDateShiftFilterEnabled,
            swaggerAutoRefreshEnabled,
            onDataLoaded
        };
    }, [swaggerApiKey, swaggerDepartmentId, dateTimeDeliveryBeg, dateTimeDeliveryEnd, swaggerDateShift, swaggerDateShiftFilterEnabled, swaggerAutoRefreshEnabled, onDataLoaded]);

    const performSync = useCallback(async () => {
        const {
            swaggerApiKey: apiKey,
            swaggerDepartmentId: deptId,
            dateTimeDeliveryBeg: start,
            dateTimeDeliveryEnd: end,
            swaggerDateShift: dateShiftVal,
            swaggerDateShiftFilterEnabled: dateShiftEnabled,
            onDataLoaded: callback
        } = latestValuesRef.current;

        if (!apiKey.trim()) {
            logger.warn('Swagger auto-refresh: API key not configured');
            setSwaggerSyncError('API ключ не настроен');
            return;
        }

        setSwaggerSyncStatus('syncing');
        setSwaggerSyncError(null);

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
                dateShift = formatDateForSwagger(shiftDate);
            }
            // Если dateShift не указана, оставляем пустой - API будет искать только по времени

            const params: any = {
                apiKey: apiKey.trim(),
                timeDeliveryBeg: formatDateTimeForSwagger(deliveryStart),
                timeDeliveryEnd: formatDateTimeForSwagger(deliveryEnd),
                departmentId: deptId || undefined,
                top: 200,
            };

            // Добавляем dateShift только если она указана
            if (dateShift) {
                params.dateShift = dateShift;
            }

            logger.info('🔄 Swagger auto-refresh: Starting sync...', params);

            // Add timeout to prevent endless sync
            const timeoutPromise = new Promise<{ success: boolean, error?: string }>((_, reject) => {
                setTimeout(() => reject(new Error('Timeout: API did not respond in 30s')), 30000);
            });

            const result = await Promise.race([
                fastopertorApi.fetchOrdersFromSwagger(params),
                timeoutPromise
            ]) as { success: boolean; data?: any; error?: string };

            console.log('[useSwaggerAutoRefresh] Fetch finished. Is mounted?', isMountedRef.current, 'Result:', result.success);

            if (!isMountedRef.current) {
                console.warn('[useSwaggerAutoRefresh] ⚠️ Component unmounted during fetch. Proceeding anyway to ensure data reaches Context.');
                // return; // REMOVED to fix Strict Mode data loss
            }

            if (result.success && result.data) {
                logger.info(`✅ Swagger auto-refresh: Loaded ${result.data.orders.length} orders, ${result.data.couriers.length} couriers`);

                setSwaggerLastSyncTime(Date.now());
                setSwaggerNextSyncTime(Date.now() + REFRESH_INTERVAL_MS);
                setSwaggerSyncStatus('idle');
                setSwaggerSyncError(null);
                retryCountRef.current = 0;

                console.error('[useSwaggerAutoRefresh] 🟢 SUCCEEDED! calling onDataLoaded callback now with', result.data.orders.length, 'orders');
                if (callback) {
                    callback(result.data);
                } else {
                    console.error('[useSwaggerAutoRefresh] 🔴 CRITICAL: Callback is undefined!');
                }
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (error) {
            if (!isMountedRef.current) return;

            const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
            logger.error('❌ Swagger auto-refresh: Sync failed', error);

            setSwaggerSyncStatus('error');
            setSwaggerSyncError(errorMessage);

            // Don't retry on certain errors (like 422 Validation Error)
            const isValidationError = errorMessage.includes('422') || errorMessage.toLowerCase().includes('validation');

            // Exponential backoff retry
            if (!isValidationError && retryCountRef.current < MAX_RETRY_ATTEMPTS) {
                retryCountRef.current++;
                const retryDelay = RETRY_DELAY_MS * Math.pow(2, retryCountRef.current - 1);
                logger.info(`🔄 Swagger auto-refresh: Retrying in ${retryDelay / 1000}s (attempt ${retryCountRef.current}/${MAX_RETRY_ATTEMPTS})`);

                setTimeout(() => {
                    if (isMountedRef.current && latestValuesRef.current.swaggerAutoRefreshEnabled) {
                        performSync();
                    }
                }, retryDelay);
            } else {
                logger.error('❌ Swagger auto-refresh: Max retry attempts reached, giving up');
            }
        }
    }, [
        // onDataLoaded removed from deps as it's correctly used from latestValuesRef.current
        setSwaggerLastSyncTime,
        setSwaggerNextSyncTime,
        setSwaggerSyncStatus,
        setSwaggerSyncError,
    ]);

    // Reset stuck sync status on mount
    useEffect(() => {
        if (useAutoPlannerStore.getState().swaggerSyncStatus === 'syncing') {
            logger.warn('Swagger auto-refresh: Resetting stuck "syncing" status on mount');
            setSwaggerSyncStatus('idle');
        }
    }, [setSwaggerSyncStatus]);

    // Track the last processed trigger to avoid re-running on mount/remount
    const lastProcessedTriggerRef = useRef<number | null>(null);

    // Manual sync trigger listener
    useEffect(() => {
        if (swaggerManualSyncTrigger && swaggerManualSyncTrigger !== lastProcessedTriggerRef.current) {
            lastProcessedTriggerRef.current = swaggerManualSyncTrigger;
            logger.info('🔄 Swagger auto-refresh: Manual trigger detected');
            performSync();
        }
    }, [swaggerManualSyncTrigger, performSync]);

    // Setup interval
    useEffect(() => {
        // Only run auto-refresh logic if BOTH 'enabled' prop AND 'swaggerAutoRefreshEnabled' store value are true
        if (!enabled || !swaggerAutoRefreshEnabled) {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            // Reset status if it was stuck in syncing when disabled
            if (useAutoPlannerStore.getState().swaggerSyncStatus === 'syncing') {
                setSwaggerSyncStatus('idle');
            }
            return;
        }

        logger.info('🔄 Swagger auto-refresh: Auto-refresh enabled, scheduling...');

        // Perform initial sync ONLY if we haven't synced recently or if it's strictly required.
        // But user asked to NOT sync on load without permission. 
        // So we might skip the immediate performSync() here?
        // Actually, if "Auto Refresh" is checked, user EXPECTS it to keep data fresh.
        // But maybe we should debounce/wait for stability.
        performSync();

        // Setup recurring sync
        intervalRef.current = setInterval(() => {
            performSync();
        }, REFRESH_INTERVAL_MS);

        return () => {
            // Cleanup interval
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [enabled, swaggerAutoRefreshEnabled, performSync]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            isMountedRef.current = false;
            // Clean up potentially stuck syncing status
            if (useAutoPlannerStore.getState().swaggerSyncStatus === 'syncing') {
                useAutoPlannerStore.getState().setSwaggerSyncStatus('idle');
            }
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    return {
        performSync,
    };
};
