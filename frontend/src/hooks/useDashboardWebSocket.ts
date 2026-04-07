/**
 * WebSocket-based Dashboard Auto-Refresh Hook
 * 
 * Replaces polling with real-time WebSocket updates
 * Features:
 * - Connects to Socket.io server on mount
 * - Receives real-time dashboard updates
 * - Falls back to REST API for initial load
 * - Auto-reconnects on disconnect
 * - Manual sync trigger support
 */

import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { useDashboardStore } from '../stores/useDashboardStore';
import { socketService } from '../services/socketService';
import { ProcessedExcelData } from '../types';
import { logger } from '../utils/ui/logger';
import { formatDateForApi, transformDashboardData } from '../utils/data/apiDataTransformer';
import { dashboardApiService } from '../utils/api/dashboardApiService';

interface DashboardWebSocketParams {
    onDataLoaded: (data: ProcessedExcelData) => void;
    enabled?: boolean;
}

const REFRESH_INTERVAL_MS = 60 * 1000; // v5.115: 1 minute (Faster auto-update)

export const useDashboardWebSocket = ({
    onDataLoaded,
    enabled = false
}: DashboardWebSocketParams) => {
    // Selectors
    const setApiLastSyncTime = useDashboardStore(s => s.setApiLastSyncTime);
    const setApiNextSyncTime = useDashboardStore(s => s.setApiNextSyncTime);
    const setApiSyncStatus = useDashboardStore(s => s.setApiSyncStatus);
    const setApiSyncError = useDashboardStore(s => s.setApiSyncError);
    const apiManualSyncTrigger = useDashboardStore(s => s.apiManualSyncTrigger);
    const apiAutoRefreshEnabled = useDashboardStore(s => s.apiAutoRefreshEnabled);
    const apiDateShift = useDashboardStore(s => s.apiDateShift);
    const apiDepartmentId = useDashboardStore(s => s.apiDepartmentId);
    const apiKey = useDashboardStore(s => s.apiKey);

    // Refs for stable logic
    const isConnectedRef = useRef(false);
    const isFetchingRef = useRef(false);
    const lastProcessedTriggerRef = useRef<number | null>(null);
    const lastFetchTimeRef = useRef<number>(0);
    const lastDataSignatureRef = useRef<string | null>(null);
    const onDataLoadedRef = useRef(onDataLoaded);
    const intervalRef = useRef<any>(null);

    // Keep state refs updated for the async fetch function to avoid dependency cycles
    const stateRef = useRef({
        apiDateShift,
        apiDepartmentId,
        apiManualSyncTrigger,
        apiKey
    });

    useEffect(() => {
        stateRef.current = { apiDateShift, apiDepartmentId, apiManualSyncTrigger, apiKey };
    }, [apiDateShift, apiDepartmentId, apiManualSyncTrigger, apiKey]);

    useEffect(() => {
        onDataLoadedRef.current = onDataLoaded;
    }, [onDataLoaded]);

    /**
     * Core fetch function - stable reference
     */
    const fetchLatestData = useCallback(async (options: { isManual?: boolean } = {}) => {
        const { isManual = false } = options;
        const now = Date.now();

        // Prevent overlapping fetches
        if (isFetchingRef.current) {
            logger.info('Skipping fetch (already in progress)');
            return;
        }

        // Throttle manual/auto requests (2s)
        if (now - lastFetchTimeRef.current < 2000) {
            logger.info('Skipping fetch (throttled)');
            return;
        }

        isFetchingRef.current = true;
        lastFetchTimeRef.current = now;

        const { apiDateShift: dateShift, apiDepartmentId: deptId, apiKey: key } = stateRef.current;
        const dateStr = dateShift || formatDateForApi(new Date());
        const apiDate = dashboardApiService.convertDateToApiFormat(dateStr);

        setApiSyncStatus('syncing');
        setApiSyncError(null);

        let toastId: string | undefined;
        if (isManual) {
            toastId = toast.loading(`Обновление данных за ${apiDate}...`);
        }

        try {
            logger.info(` Fetching dashboard for ${apiDate} (isManual=${isManual})`);
            const response = await dashboardApiService.fetchDataForDate({
                date: apiDate,
                divisionId: deptId ? String(deptId) : 'all',
                force: true,
                apiKey: key // Pass the user-specific API key
            });

            if (response.success && response.data) {
                const ordersRaw = response.data.orders || [];
                const ordersCount = ordersRaw.length;

                // v5.119: Content-based Diffing (Hyper-Drive Sync)
                // Filter out volatile fields like 'updatedAt' if they exist, to only trigger on real changes.
                const currentSignature = JSON.stringify({
                    orders: ordersRaw.map((o: any) => ({
                        id: o.orderNumber || o.id,
                        s: o.status,
                        c: o.courier || o.driver,
                        a: o.address,
                        t: o.plannedTime || o.deliverBy
                    })),
                    // v6.9: MUST track courier metrics to trigger re-render when background engine finishes!
                    couriers: (response.data.couriers || []).map((c: any) => ({
                        n: c.name || c.courierName,
                        d: c.distanceKm || 0,
                        o: c.calculatedOrders || 0
                    }))
                });

                if (currentSignature === lastDataSignatureRef.current && !isManual) {
                    logger.info(`[Sync] Skipping update — no content change detected (${ordersCount} orders)`);
                    setApiLastSyncTime(Date.now());
                    setApiNextSyncTime(Date.now() + REFRESH_INTERVAL_MS);
                    setApiSyncStatus('idle');
                    return;
                }
                lastDataSignatureRef.current = currentSignature;

                logger.info(` Loaded dashboard data (${ordersCount} orders)`);

                setApiLastSyncTime(Date.now());
                setApiNextSyncTime(Date.now() + REFRESH_INTERVAL_MS);
                setApiSyncStatus('idle');
                setApiSyncError(null);
                
                // v5.115: Always run through transformDashboardData to ensure numeric timestamps 
                // for routing (readyAtSource/deadlineAt) are populated correctly.
                const fallbackDate = apiDate;
                const transformed = transformDashboardData(response.data, apiDate, fallbackDate);
                
                const enrichedData = {
                    ...transformed,
                    creationDate: transformed.creationDate || apiDate
                };

                if (isManual) {
                    toast.success(`Данные обновлены! Загружено ${ordersCount} заказов.`, { id: toastId });
                }

                if (onDataLoadedRef.current) {
                    onDataLoadedRef.current(enrichedData);
                }
            } else {
                throw new Error(response.error || 'Failed to fetch data');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
            logger.error(' Failed to fetch latest data:', error);

            // Silent error for background updates - keep 'idle' but log the failure
            setApiSyncStatus(isManual ? 'error' : 'idle');
            if (isManual) {
                setApiSyncError(errorMessage);
                toast.error(`Ошибка: ${errorMessage}`, { id: toastId });
            }

            // Ensure timer resets even on failure so it retries later
            setApiNextSyncTime(Date.now() + REFRESH_INTERVAL_MS);
        } finally {
            isFetchingRef.current = false;
        }
    }, [setApiLastSyncTime, setApiNextSyncTime, setApiSyncStatus, setApiSyncError]);

    const handleDashboardUpdate = useCallback((update: any) => {
        // v5.136: Robust Date Normalization for comparison
        const normalize = (val: string) => (val || '').split(' ')[0].replace(/\./g, '-');
        const currentStoreDate = normalize(stateRef.current.apiDateShift);
        
        const updateRaw = update.data?.creationDate || (update.data?.orders?.[0]?.creationDate);
        const updateDateStr = normalize(updateRaw);

        if (currentStoreDate && updateDateStr && currentStoreDate !== updateDateStr) {
            logger.info(`Ignoring WebSocket update for mismatched date: Update is ${updateDateStr}, UI is ${currentStoreDate}`);
            return;
        }

        logger.info(' Received dashboard update via WebSocket');
        setApiLastSyncTime(Date.now());
        setApiNextSyncTime(Date.now() + REFRESH_INTERVAL_MS);
        setApiSyncStatus('idle');
        setApiSyncError(null);
        
        if (onDataLoadedRef.current && update.data) {
            // v5.115: Also transform WebSocket updates to maintain consistency
            const apiDate = stateRef.current.apiDateShift || formatDateForApi(new Date());
            const transformed = transformDashboardData(update.data, apiDate);
            onDataLoadedRef.current(transformed);
        } else if (!update.data) {
            // v19.0: If update has no data (Turbo Robot notification), trigger a full refetch
            logger.info('[Sync] 🤖 Turbo Robot signaled change — triggering refetch');
            lastDataSignatureRef.current = null; // v5.136: Force state reset to allow same-data update
            
            // v25.1: Check if routes were saved to localStorage
            const savedRoutes = localStorage.getItem('km_routes');
            if (savedRoutes) {
                logger.info('[Sync] 🤖 Using routes from localStorage');
                // Reload from localStorage instead of fetching from server
                const localData = localStorage.getItem('km_dashboard_processed_data');
                if (localData && onDataLoadedRef.current) {
                    try {
                        const parsed = JSON.parse(localData);
                        const apiDate = stateRef.current.apiDateShift || formatDateForApi(new Date());
                        const transformed = transformDashboardData(parsed, apiDate);
                        onDataLoadedRef.current(transformed);
                        logger.info('[Sync] 🤖 Reloaded data with routes from localStorage');
                    } catch (e) {
                        logger.warn('[Sync] Failed to parse localStorage data:', e);
                        fetchLatestData();
                    }
                } else {
                    fetchLatestData();
                }
            } else {
                fetchLatestData();
            }
        }
    }, [setApiLastSyncTime, setApiNextSyncTime, setApiSyncStatus, setApiSyncError]);

    const connectWebSocket = useCallback(() => {
        if (isConnectedRef.current) return;
        const token = localStorage.getItem('km_access_token');
        if (!token) return;

        logger.info(' Connecting to WebSocket...');
        socketService.connect(token);
        socketService.onDashboardUpdate(handleDashboardUpdate);

        socketService.on('connected', () => {
            isConnectedRef.current = true;
            setApiSyncStatus('idle');
            setApiSyncError(null);
        });

        socketService.on('disconnected', (reason: string) => {
            logger.warn(' WebSocket disconnected:', reason);
            isConnectedRef.current = false;
        });
    }, [handleDashboardUpdate, setApiSyncStatus, setApiSyncError]);

    const disconnectWebSocket = useCallback(() => {
        if (!isConnectedRef.current) return;
        socketService.offDashboardUpdate(handleDashboardUpdate);
        isConnectedRef.current = false;
    }, [handleDashboardUpdate]);

    // Effect for manual triggers
    useEffect(() => {
        if (apiManualSyncTrigger && apiManualSyncTrigger !== lastProcessedTriggerRef.current) {
            lastProcessedTriggerRef.current = apiManualSyncTrigger;
            fetchLatestData({ isManual: true });
        }
    }, [apiManualSyncTrigger, fetchLatestData]);

    // Main lifecycle effect - stable dependencies
    useEffect(() => {
        if (!enabled || !apiAutoRefreshEnabled) {
            disconnectWebSocket();
            if (intervalRef.current) clearInterval(intervalRef.current);
            return;
        }

        connectWebSocket();
        fetchLatestData(); // Initial load

        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
            const currentStoreState = useDashboardStore.getState();
            if (currentStoreState.apiAutoRefreshEnabled && currentStoreState.apiNextSyncTime) {
                // If the timer has lapsed according to the store, fetch and reset.
                // This correctly synchronizes with pushes from the WebSocket.
                if (Date.now() >= currentStoreState.apiNextSyncTime) {
                    fetchLatestData();
                }
            } else if (!currentStoreState.apiNextSyncTime) {
                // Fallback if somehow missing
                fetchLatestData();
            }
        }, 1000); // Check every second to synchronize flawlessly with the UI countdown

        return () => {
            disconnectWebSocket();
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [enabled, apiAutoRefreshEnabled, apiDateShift, apiDepartmentId, connectWebSocket, disconnectWebSocket, fetchLatestData]);

    return {
        fetchLatestData,
        isConnected: isConnectedRef.current
    };
};
