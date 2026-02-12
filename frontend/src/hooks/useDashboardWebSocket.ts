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
import { useAutoPlannerStore } from '../stores/useAutoPlannerStore';
import { socketService } from '../services/socketService';
import { ProcessedExcelData } from '../types';
import { logger } from '../utils/ui/logger';
import { formatDateForApi } from '../utils/data/apiDataTransformer';
import { dashboardApiService } from '../utils/api/dashboardApiService';

interface DashboardWebSocketParams {
    onDataLoaded: (data: ProcessedExcelData) => void;
    enabled?: boolean;
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export const useDashboardWebSocket = ({
    onDataLoaded,
    enabled = false
}: DashboardWebSocketParams) => {
    // Use stable selectors for Zustand
    const setApiLastSyncTime = useAutoPlannerStore(s => s.setApiLastSyncTime);
    const setApiNextSyncTime = useAutoPlannerStore(s => s.setApiNextSyncTime);
    const setApiSyncStatus = useAutoPlannerStore(s => s.setApiSyncStatus);
    const setApiSyncError = useAutoPlannerStore(s => s.setApiSyncError);
    const apiManualSyncTrigger = useAutoPlannerStore(s => s.apiManualSyncTrigger);
    const apiAutoRefreshEnabled = useAutoPlannerStore(s => s.apiAutoRefreshEnabled);

    // Filters and settings
    const apiDateShift = useAutoPlannerStore(s => s.apiDateShift);
    const apiTimeDeliveryBeg = useAutoPlannerStore(s => s.apiTimeDeliveryBeg);
    const apiTimeDeliveryEnd = useAutoPlannerStore(s => s.apiTimeDeliveryEnd);
    const apiTimeFilterEnabled = useAutoPlannerStore(s => s.apiTimeFilterEnabled);
    const apiDepartmentId = useAutoPlannerStore(s => s.apiDepartmentId);

    const isConnectedRef = useRef(false);
    const lastProcessedTriggerRef = useRef<number | null>(null);
    const intervalRef = useRef<any>(null);
    const lastFetchTimeRef = useRef<number>(0);

    // Use ref to store latest callback to avoid re-connecting when callback changes
    const onDataLoadedRef = useRef(onDataLoaded);
    useEffect(() => {
        onDataLoadedRef.current = onDataLoaded;
    }, [onDataLoaded]);

    /**
     * Fetch latest data from REST API (fallback or manual trigger)
     */
    const fetchLatestData = useCallback(async () => {
        // Simple throttle: prevent fetching more than once every 2 seconds
        const now = Date.now();
        if (now - lastFetchTimeRef.current < 2000) {
            logger.info('Skipping fetch (throttled)');
            return;
        }
        lastFetchTimeRef.current = now;

        setApiSyncStatus('syncing');
        setApiSyncError(null);

        try {
            logger.info(' Fetching latest dashboard data from REST API...');

            // Use dashboardApiService which handles date conversion and consistent fetching
            const dateStr = apiDateShift || formatDateForApi(new Date());

            // Convert to DD.MM.YYYY required by API service
            const apiDate = dashboardApiService.convertDateToApiFormat(dateStr);

            logger.info(` Fetching dashboard for ${apiDate} (force=true)`);

            const response = await dashboardApiService.fetchDataForDate({
                date: apiDate,
                force: true // Force refresh to ensure sync with FastOperator
            });

            if (response.success && response.data) {
                logger.info(` Loaded dashboard data via Service (${response.data.orders?.length || 0} orders)`);

                setApiLastSyncTime(Date.now());
                setApiNextSyncTime(Date.now() + REFRESH_INTERVAL_MS);
                setApiSyncStatus('idle');
                setApiSyncError(null);

                if (onDataLoadedRef.current) {
                    onDataLoadedRef.current(response.data);
                }
            } else {
                throw new Error(response.error || 'Failed to fetch data via Service');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
            logger.error(' Failed to fetch latest dashboard data:', error);

            setApiSyncStatus('error');
            setApiSyncError(errorMessage);
        }
    }, [
        setApiLastSyncTime,
        setApiNextSyncTime,
        setApiSyncStatus,
        setApiSyncError,
        apiDateShift,
        apiTimeDeliveryBeg,
        apiTimeDeliveryEnd,
        apiTimeFilterEnabled,
        apiDepartmentId
    ]);

    /**
     * Handle WebSocket dashboard updates
     */
    const handleDashboardUpdate = useCallback((update: {
        data: any;
        timestamp: string;
        status: number;
    }) => {
        logger.info(' Received dashboard update via WebSocket', {
            timestamp: update.timestamp,
            status: update.status
        });

        setApiLastSyncTime(Date.now());
        setApiNextSyncTime(Date.now() + REFRESH_INTERVAL_MS);
        setApiSyncStatus('idle');
        setApiSyncError(null);

        if (onDataLoadedRef.current && update.data) {
            onDataLoadedRef.current(update.data);
        }
    }, [setApiLastSyncTime, setApiNextSyncTime, setApiSyncStatus, setApiSyncError]);

    /**
     * Connect to WebSocket server
     */
    const connectWebSocket = useCallback(() => {
        if (isConnectedRef.current) {
            logger.info('WebSocket already connected');
            return;
        }

        const token = localStorage.getItem('km_access_token');
        if (!token) {
            logger.warn('No auth token found, cannot connect to WebSocket');
            return;
        }

        logger.info(' Connecting to WebSocket server...');

        socketService.connect(token);

        // Listen for dashboard updates
        socketService.onDashboardUpdate(handleDashboardUpdate);

        // Listen for connection events
        socketService.on('connected', () => {
            logger.info(' WebSocket connected successfully');
            isConnectedRef.current = true;
            setApiSyncStatus('idle');
            setApiSyncError(null);
        });

        socketService.on('disconnected', (reason: string) => {
            logger.warn(' WebSocket disconnected:', reason);
            isConnectedRef.current = false;
            setApiSyncStatus('error');
            setApiSyncError(`WebSocket отключен: ${reason}`);
        });

        socketService.on('reconnected', (attemptNumber: number) => {
            logger.info(` WebSocket reconnected after ${attemptNumber} attempts`);
            isConnectedRef.current = true;
            setApiSyncStatus('idle');
            setApiSyncError(null);
        });

        socketService.on('max_reconnect_attempts', () => {
            logger.error(' Max WebSocket reconnection attempts reached');
            setApiSyncStatus('error');
            setApiSyncError('Не удалось подключиться к серверу');
        });

    }, [handleDashboardUpdate, setApiSyncStatus, setApiSyncError]);

    /**
     * Disconnect from WebSocket server
     */
    const disconnectWebSocket = useCallback(() => {
        if (!isConnectedRef.current) {
            return;
        }

        logger.info(' Disconnecting from WebSocket server...');
        socketService.disconnect();
        isConnectedRef.current = false;
    }, []);

    // Manual sync trigger listener
    useEffect(() => {
        if (apiManualSyncTrigger && apiManualSyncTrigger !== lastProcessedTriggerRef.current) {
            lastProcessedTriggerRef.current = apiManualSyncTrigger;
            logger.info(' Manual sync trigger detected, fetching latest data...');
            fetchLatestData();
        }
    }, [apiManualSyncTrigger, fetchLatestData]);

    // Connect/disconnect based on enabled state and handle periodic refresh
    useEffect(() => {
        if (!enabled || !apiAutoRefreshEnabled) {
            disconnectWebSocket();
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            return;
        }

        // Connect to WebSocket
        connectWebSocket();

        // Perform initial fetch
        fetchLatestData();

        // Setup periodic refresh as a fallback
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
            logger.info(' Periodic background refresh triggered (10 min)');
            fetchLatestData();
        }, REFRESH_INTERVAL_MS);

        // Cleanup on unmount
        return () => {
            disconnectWebSocket();
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [enabled, apiAutoRefreshEnabled, connectWebSocket, disconnectWebSocket, fetchLatestData]);

    return {
        fetchLatestData,
        isConnected: isConnectedRef.current
    };
};
