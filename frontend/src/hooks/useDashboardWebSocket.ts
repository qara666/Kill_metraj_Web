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
import { API_URL } from '../config/apiConfig';

interface DashboardWebSocketParams {
    onDataLoaded: (data: ProcessedExcelData) => void;
    enabled?: boolean;
}

export const useDashboardWebSocket = ({
    onDataLoaded,
    enabled = false
}: DashboardWebSocketParams) => {
    // Use stable selectors for Zustand
    const setApiLastSyncTime = useAutoPlannerStore(s => s.setApiLastSyncTime);
    const setApiSyncStatus = useAutoPlannerStore(s => s.setApiSyncStatus);
    const setApiSyncError = useAutoPlannerStore(s => s.setApiSyncError);
    const apiManualSyncTrigger = useAutoPlannerStore(s => s.apiManualSyncTrigger);
    const apiAutoRefreshEnabled = useAutoPlannerStore(s => s.apiAutoRefreshEnabled);

    const isConnectedRef = useRef(false);
    const lastProcessedTriggerRef = useRef<number | null>(null);

    /**
     * Fetch latest data from REST API (fallback or manual trigger)
     */
    const fetchLatestData = useCallback(async () => {
        setApiSyncStatus('syncing');
        setApiSyncError(null);

        try {
            logger.info(' Fetching latest dashboard data from REST API...');

            const token = localStorage.getItem('km_access_token');
            if (!token) {
                logger.warn('Dashboard WebSocket: No auth token found');
                setApiSyncError('Требуется авторизация');
                return;
            }

            const response = await fetch(`${API_URL}/api/dashboard/latest`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (result.success && result.data) {
                logger.info(` Loaded dashboard data from REST API`);

                setApiLastSyncTime(Date.now());
                setApiSyncStatus('idle');
                setApiSyncError(null);

                if (onDataLoaded) {
                    onDataLoaded(result.data);
                }
            } else {
                throw new Error(result.error || 'Failed to fetch data');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
            logger.error(' Failed to fetch latest dashboard data:', error);

            setApiSyncStatus('error');
            setApiSyncError(errorMessage);
        }
    }, [onDataLoaded, setApiLastSyncTime, setApiSyncStatus, setApiSyncError]);

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
        setApiSyncStatus('idle');
        setApiSyncError(null);

        if (onDataLoaded && update.data) {
            onDataLoaded(update.data);
        }
    }, [onDataLoaded, setApiLastSyncTime, setApiSyncStatus, setApiSyncError]);

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

    // Connect/disconnect based on enabled state
    useEffect(() => {
        if (!enabled || !apiAutoRefreshEnabled) {
            disconnectWebSocket();
            return;
        }

        // Connect to WebSocket
        connectWebSocket();

        // Note: No fetchLatestData() here anymore! 
        // Initial fetch is handled by GlobalDashboardFetcher/AutoRefresh interval

        // Cleanup on unmount
        return () => {
            disconnectWebSocket();
        };
    }, [enabled, apiAutoRefreshEnabled, connectWebSocket, disconnectWebSocket]);

    return {
        fetchLatestData,
        isConnected: isConnectedRef.current
    };
};
