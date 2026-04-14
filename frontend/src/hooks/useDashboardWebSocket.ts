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
import { normalizeDateToIso } from '../utils/data/dateUtils';

interface DashboardWebSocketParams {
    onDataLoaded: (data: ProcessedExcelData) => void;
    enabled?: boolean;
}

const REFRESH_INTERVAL_MS = 120 * 1000; // v5.136: 2 minutes (Unified sync)

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
    const setAutoRoutingStatus = useDashboardStore(s => s.setAutoRoutingStatus);
    const autoRoutingStatus = useDashboardStore(s => s.autoRoutingStatus);

    // Refs for stable logic
    const isConnectedRef = useRef(false);
    const isFetchingRef = useRef(false);
    const lastProcessedTriggerRef = useRef<number | null>(null);
    const lastFetchTimeRef = useRef<number>(0);
    const robotSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
    const fetchLatestData = useCallback(async (options: { isManual?: boolean; isSilent?: boolean } = {}) => {
        const { isManual = false, isSilent = false } = options;
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
                force: isManual, // v38.2: Use cache for initial loads, force only for manual syncs
                apiKey: key // Pass the user-specific API key
            });

            if (response.success && response.data) {
                const ordersRaw = response.data.orders || [];
                const ordersCount = ordersRaw.length;

                // v36.1: Content-based Diffing (Hyper-Drive Sync)
                // MUST track orders, couriers, routes AND statistics to trigger re-render
                // v36.9: Improved Content-based Diffing
                // Include total length and samples from start/middle/end to detect shifts
                const ordersSample = (ordersRaw || []);
                const currentSignature = JSON.stringify({
                    len: ordersSample.length,
                    // Sample of 30 orders spread across the list
                    orders: [0, 0.25, 0.5, 0.75, 0.99].flatMap(p => {
                        const idx = Math.floor(ordersSample.length * p);
                        const o = ordersSample[idx];
                        return o ? { id: o.id || o.orderNumber, s: o.status } : null;
                    }).filter(Boolean),
                    couriers: (response.data.couriers || []).map((c: any) => ({
                        n: c.name,
                        d: c.distanceKm || 0,
                        o: c.calculatedOrders || 0
                    })),
                    routes: (response.data.routes || []).map((r: any) => ({
                        id: r.id,
                        d: r.totalDistance || 0,
                        c: r.orders_count || 0
                    })),
                    stats: response.data.statistics || {}
                });

                if (currentSignature === lastDataSignatureRef.current && !isManual) {
                    logger.info(`[Sync] Skipping update — no content change detected (${ordersCount} orders)`);
                    setApiLastSyncTime(Date.now());
                    if (!isSilent) {
                        setApiNextSyncTime(Date.now() + REFRESH_INTERVAL_MS);
                    }
                    setApiSyncStatus('idle');
                    return;
                }
                lastDataSignatureRef.current = currentSignature;

                logger.info(` Loaded dashboard data (${ordersCount} orders)`);

                setApiLastSyncTime(Date.now());
                
                // v7.2: Synchronize Robot status stats so that archival dates visually mirror loaded data immediately
                const routableOrders = ordersRaw.filter((o: any) => {
                    const c = String(o.courier || o.courierName || o.courierId || '').toUpperCase().trim();
                    const s = String(o.status || o.deliveryStatus || '').toLowerCase().trim();
                    if (!c || c === 'НЕ НАЗНАЧЕНО' || c === 'UNASSIGNED' || c === 'ПО' || c === 'ID:0') return false;
                    if (s.includes('отказ') || s.includes('отменен') || s.includes('відмова')) return false;
                    if (s.includes('самовывоз') || s.includes('на месте')) return false;
                    return true;
                });
                
                const routesArr = response.data.routes || [];
                const ordersInRoutes = routesArr.reduce((acc: number, r: any) => {
                    const cnt = parseInt(r.ordersCount || r.orders_count) || r.orders?.length || 0;
                    return acc + cnt;
                }, 0);
                
                // Keep `dateStr` comparison robust
                const isHistorical = apiDate !== dashboardApiService.convertDateToApiFormat(formatDateForApi(new Date()));
                const todayISO = formatDateForApi(new Date());
                const isToday = apiDate === dashboardApiService.convertDateToApiFormat(todayISO);

                // v5.206: For TODAY - always set full stats including processedCount
                // For historical dates - mark as complete
                const prevStatus = useDashboardStore.getState().autoRoutingStatus;
                if (isToday) {
                    // Today: Show real stats - total routes and orders already in routes
                    const nextTotal = Math.max(prevStatus.totalCount || 0, routableOrders.length);
                    const nextProcessed = Math.min(
                        nextTotal,
                        Math.max(prevStatus.processedCount || 0, ordersInRoutes)
                    );
                    setAutoRoutingStatus({
                        totalCount: nextTotal,
                        processedCount: nextProcessed, // keep monotonic while robot is active
                        skippedInRoutes: ordersInRoutes,
                        skippedGeocoding: response.data.statistics?.geoErrors?.length || 0,
                        isActive: autoRoutingStatus.isActive, // Keep active for robot to continue
                        lastUpdate: Date.now()
                    });
                } else if (isHistorical || !autoRoutingStatus.isActive) {
                    // Historical/archive: Mark as complete
                    setAutoRoutingStatus({
                        totalCount: routableOrders.length,
                        processedCount: routableOrders.length,
                        skippedInRoutes: ordersInRoutes,
                        skippedGeocoding: response.data.statistics?.geoErrors?.length || 0,
                        isActive: false,
                        lastUpdate: Date.now()
                    });
                } else if (autoRoutingStatus.isActive) {
                    // Fallback for active robot
                    const nextTotal = Math.max(prevStatus.totalCount || 0, routableOrders.length);
                    const nextProcessed = Math.min(
                        nextTotal,
                        Math.max(prevStatus.processedCount || 0, ordersInRoutes)
                    );
                    setAutoRoutingStatus({ 
                        totalCount: nextTotal,
                        processedCount: nextProcessed,
                        lastUpdate: Date.now() 
                    });
                }

                if (!isSilent) {
                    setApiNextSyncTime(Date.now() + REFRESH_INTERVAL_MS);
                }
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

            // Ensure timer resets even on failure so it retries later (unless silent)
            if (!isSilent) {
                setApiNextSyncTime(Date.now() + REFRESH_INTERVAL_MS);
            }
        } finally {
            isFetchingRef.current = false;
        }
    }, [setApiLastSyncTime, setApiNextSyncTime, setApiSyncStatus, setApiSyncError]);

    const handleDashboardUpdate = useCallback((update: any) => {
        // v5.165: Robust Date Normalization (handles YYYY-MM-DD, DD-MM-YYYY, DD.MM.YYYY)
        const currentStoreDate = normalizeDateToIso(stateRef.current.apiDateShift);
        
        const updateRaw = update.data?.creationDate || (update.data?.orders?.[0]?.creationDate) || update.targetDate || update.date;
        const updateDateStr = normalizeDateToIso(updateRaw);

        if (currentStoreDate && updateDateStr && currentStoreDate !== updateDateStr) {
            logger.info(`Ignoring WebSocket update for mismatched date: Update is ${updateDateStr}, UI is ${currentStoreDate}`);
            return;
        }

        logger.info(' Received dashboard update via WebSocket');
        setApiLastSyncTime(Date.now());
        
        // v5.204: Reset the refresh timer to align with this push update
        setApiNextSyncTime(Date.now() + REFRESH_INTERVAL_MS);
        
        // v36.9: Synchronize Robot status timestamp with the WebSocket push
        if (autoRoutingStatus.isActive) {
            setAutoRoutingStatus({ lastUpdate: Date.now() });
        }

        // v5.137: WebSocket updates are "Silent" by default — they don't reset the scheduled timer
        // unless they are the primary source of truth for the user.
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
            lastDataSignatureRef.current = null; // v36.1: Force state reset to allow same-data update
            
            // v36.1: Removed localStorage fallback—always fetch fresh from source of truth
            fetchLatestData({ isSilent: true });
        }
    }, [setApiLastSyncTime, setApiNextSyncTime, setApiSyncStatus, setApiSyncError]);

    const connectWebSocket = useCallback(() => {
        if (isConnectedRef.current) return;
        const token = localStorage.getItem('km_access_token');
        if (!token) return;

        logger.info(' Connecting to WebSocket...');
        socketService.connect(token);
        // v36.9: Debounced robot-triggered sync (avoid spamming API)
        const triggerRobotSync = () => {
            if (robotSyncTimeoutRef.current) clearTimeout(robotSyncTimeoutRef.current);
            robotSyncTimeoutRef.current = setTimeout(() => {
                logger.info('[Sync] 🤖 Robot signaled change — triggering debounced refetch');
                lastDataSignatureRef.current = null; // Force update
                fetchLatestData({ isSilent: true });
            }, 2000); // 2-second debounce
        };

        socketService.onDashboardUpdate((update: any) => {
            if (update.data) {
                handleDashboardUpdate(update);
            } else {
                triggerRobotSync();
            }
        });
        
        // v36.4: routes_update is already handled inside SocketService (km:turbo:routes_update + dashboard signals).
        // Avoid double-refetch loops by not subscribing here.

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
