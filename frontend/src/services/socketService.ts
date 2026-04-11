/**
 * WebSocket Service for Real-Time Dashboard Updates
 * 
 * Manages Socket.io connection for receiving dashboard data updates
 * Features:
 * - Auto-reconnection on disconnect
 * - Token-based authentication
 * - Visibility API integration (reconnect on tab wake)
 * - Event-driven architecture
 */

import { io, Socket } from 'socket.io-client';
import { API_URL } from '../config/apiConfig';
import { useDashboardStore } from '../stores/useDashboardStore';
import { normalizeDateToIso } from '../utils/data/dateUtils';

type DashboardUpdateCallback = (data: {
    data: any;
    timestamp: string;
    status: number;
}) => void;

class SocketService {
    private socket: Socket | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private isConnecting = false;
    private callbacks: Map<string, Set<Function>> = new Map();
    private _lastRobotStatusTime: number = 0;

    /**
     * Connect to WebSocket server
     */
    connect(token: string): Socket {
        if (this.socket?.connected) {
            return this.socket;
        }

        if (this.isConnecting && this.socket) {
            return this.socket;
        }

        this.isConnecting = true;

        const apiUrl = API_URL;


        this.socket = io(apiUrl, {
            auth: { token },
            reconnection: true,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 10000,
            reconnectionAttempts: this.maxReconnectAttempts,
            transports: ['polling', 'websocket'],
            timeout: 45000,
            autoConnect: true,
            upgrade: true,
            rememberUpgrade: true
        });

        this.setupEventHandlers();
        this.setupVisibilityHandler();

        return this.socket;
    }

    // Method implementations
    private setupEventHandlers(): void {
        if (!this.socket) return;

        this.socket.on('connect', () => {
            console.log('[SocketService]  Connected to WebSocket server');
            this.reconnectAttempts = 0;
            this.isConnecting = false;
            this.emit('connected');
        });

        this.socket.on('disconnect', (reason) => {
            console.log('[SocketService]  Disconnected:', reason);
            this.isConnecting = false;
            this.emit('disconnected', reason);
        });

        this.socket.on('connect_error', (error) => {
            console.error('[SocketService] Connection error:', error.message);
            this.reconnectAttempts++;
            this.isConnecting = false;

            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.error('[SocketService] Max reconnection attempts reached');
                this.emit('max_reconnect_attempts');
            }
        });

        this.socket.on('reconnect', (attemptNumber) => {
            console.log(`[SocketService]  Reconnected after ${attemptNumber} attempts`);
            this.reconnectAttempts = 0;
            this.emit('reconnected', attemptNumber);
        });

        this.socket.on('reconnect_attempt', (attemptNumber) => {
            console.log(`[SocketService] Reconnection attempt ${attemptNumber}/${this.maxReconnectAttempts}`);
        });

        this.socket.on('reconnect_error', (error) => {
            console.error('[SocketService] Reconnection error:', error.message);
        });

        this.socket.on('reconnect_failed', () => {
            console.error('[SocketService] Reconnection failed');
            this.emit('reconnect_failed');
        });

        // v22.6: Live status updates for the Robot counter (0/126)
        this.socket.on('robot_status', (data) => {
            const now = Date.now();
            try {
                const store = useDashboardStore.getState();
                const currentDivisionStr = String(store.divisionId || 'all');
                const dashboardDate = normalizeDateToIso(store.apiDateShift);
                const robotDate = normalizeDateToIso(data.date);

                // v7.2: Unified handling for robot updates
                const isGlobalUpdate = String(data.divisionId) === 'all';
                const storeHasSpecificDivision = store.divisionId && currentDivisionStr !== 'all';

                // Skip if update is for a DIFFERENT specific division
                if (storeHasSpecificDivision && !isGlobalUpdate && String(data.divisionId) !== currentDivisionStr) {
                    return;
                }

                // Skip if date mismatch
                if (dashboardDate && robotDate && dashboardDate !== robotDate) {
                    return;
                }

                // Determine active state logic
                const currentState = store.autoRoutingStatus;
                const hasOrdersToProcess = (data.totalCount || 0) > 0 && 
                    (data.processedCount || 0) < (data.totalCount || 0);
                
                const shouldBeActive = !currentState.userStopped && hasOrdersToProcess;
                const forceActive = currentState.isActive && !currentState.userStopped;
                
                const finalActive = forceActive || shouldBeActive || data.isActive;

                // Update current UI status
                store.setAutoRoutingStatus({
                    ...data,
                    isActive: finalActive,
                    lastUpdate: now
                });

                // Update aggregate status for global view or admins
                if (currentDivisionStr === 'all' || isGlobalUpdate) {
                    store.setAggregateRoutingStatus({
                        ...data,
                        isActive: finalActive,
                        lastUpdate: now
                    });
                }

                // Dispatch event for specialized UI components
                window.dispatchEvent(new CustomEvent('km:robot:status', { detail: data }));
            } catch (e) {
                console.warn('[SocketService] robot_status handling error:', e);
            }
        });

        // v6.19: Handle aggregate global status for Admins
        this.socket.on('global_robot_status', (data) => {
            try {
                const store = useDashboardStore.getState();
                const currentDivisionStr = String(store.divisionId || 'all');
                if (currentDivisionStr !== 'all') return; // Only relevant for Admin global view

                const dashboardDate = normalizeDate(store.apiDateShift);
                const robotDate = normalizeDate(data.date);
                if (dashboardDate && robotDate && dashboardDate !== robotDate) return;

                store.setAutoRoutingStatus({
                    ...data,
                    isActive: data.isActive
                });
                
                window.dispatchEvent(new CustomEvent('km:robot:status', { detail: data }));
            } catch (e) {}
        });
    }

    private setupVisibilityHandler(): void {
        if (typeof document === 'undefined') return;

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                console.log('[SocketService] Tab became visible');
                if (!this.socket?.connected && !this.isConnecting) {
                    console.log('[SocketService] Reconnecting after tab wake...');
                    this.socket?.connect();
                }
            } else {
                console.log('[SocketService] Tab became hidden');
            }
        });
    }

    /**
     * Listen for dashboard updates
     */
    onDashboardUpdate(callback: DashboardUpdateCallback): void {
        if (!this.socket) {
            console.warn('[SocketService] Socket not initialized. Call connect() first.');
            return;
        }

        this.socket.on('dashboard:update', (data) => {
            if (data?.data && data?.source === 'turbo_calculator_enrichment') {
                window.dispatchEvent(new CustomEvent('km:turbo:dashboard_update', { detail: data.data }));
            }
            callback({ data: data?.data || null, timestamp: new Date().toISOString(), status: 200 });
        });

        this.socket.on('dashboard_update', () => {
            callback({ data: null, timestamp: new Date().toISOString(), status: 200 });
        });

        const relayStatus = (payload: any) => {
            try {
                (window as any).__divisionStatuses = (window as any).__divisionStatuses || {};
                (window as any).__divisionStatuses[payload.divisionId] = payload;
                this.emit('division_status_update', payload);
            } catch (e) {}
        };

        this.socket.on('division_status', relayStatus);
        this.socket.on('division_status_update', relayStatus);

        this.socket.on('routes_update', (data) => {
            try {
                const store = useDashboardStore.getState();
                const currentDivisionStr = String(store.divisionId || 'all');
                const dashboardDate = normalizeDate(store.apiDateShift);
                const robotDate = normalizeDate(data.date);
                
                const isGlobalUpdate = (String(data.divisionId) === 'all');
                
                if (!isGlobalUpdate && currentDivisionStr !== 'all' && String(data.divisionId) !== currentDivisionStr) {
                    return;
                }
                
                if (dashboardDate && robotDate && dashboardDate !== robotDate) {
                    return;
                }
            } catch (e) {}
            
            if (data.routes && Array.isArray(data.routes)) {
                window.dispatchEvent(new CustomEvent('km:turbo:routes_update', {
                    detail: {
                        routes: data.routes,
                        date: data.date,
                        divisionId: data.divisionId,
                        couriers: Array.isArray(data.couriers) && data.couriers.length > 0 && typeof data.couriers[0] === 'object'
                            ? data.couriers
                            : null
                    }
                }));
                try {
                    localStorage.setItem('km_routes', JSON.stringify(data.routes));
                    localStorage.setItem('km_routes_last_updated', new Date().toISOString());
                } catch (e) {}
            }
            
            callback({ data: null, timestamp: new Date().toISOString(), status: 200 });
        });

        if (!this.callbacks.has('dashboard:update')) {
            this.callbacks.set('dashboard:update', new Set());
        }
        this.callbacks.get('dashboard:update')!.add(callback);
    }

    /**
     * Remove dashboard update listener
     */
    offDashboardUpdate(callback: DashboardUpdateCallback): void {
        if (!this.socket) return;

        this.socket.off('dashboard:update', callback);
        this.callbacks.get('dashboard:update')?.delete(callback);
    }

    /**
     * Generic event listener
     */
    on(event: string, callback: Function): void {
        if (!this.callbacks.has(event)) {
            this.callbacks.set(event, new Set());
            // v36.4: If is a socket event, register the listener on the socket itself
            if (this.socket) {
                this.socket.on(event, (...args: any[]) => {
                    this.emit(event, ...args);
                });
            }
        }
        this.callbacks.get(event)!.add(callback);
    }

    /**
     * Remove generic event listener
     */
    off(event: string, callback: Function): void {
        this.callbacks.get(event)?.delete(callback);
    }

    /**
     * Emit event to local listeners
     */
    private emit(event: string, ...args: any[]): void {
        const callbacks = this.callbacks.get(event);
        if (callbacks) {
            callbacks.forEach(callback => callback(...args));
        }
    }

    /**
     * Check if socket is connected
     */
    isConnected(): boolean {
        return this.socket?.connected || false;
    }

    /**
     * Get connection state
     */
    getState(): {
        connected: boolean;
        reconnectAttempts: number;
        isConnecting: boolean;
    } {
        return {
            connected: this.isConnected(),
            reconnectAttempts: this.reconnectAttempts,
            isConnecting: this.isConnecting
        };
    }

    /**
     * Disconnect from WebSocket server
     */
    disconnect(): void {
        if (!this.socket) return;

        console.log('[SocketService] Disconnecting...');

        // Remove all listeners
        this.socket.removeAllListeners();

        // Disconnect
        this.socket.disconnect();
        this.socket = null;
        this.isConnecting = false;
        this.reconnectAttempts = 0;

        // Clear callbacks
        this.callbacks.clear();

        console.log('[SocketService]  Disconnected');
    }

    /**
     * Force reconnect
     */
    reconnect(): void {
        if (!this.socket) {
            console.warn('[SocketService] No socket to reconnect');
            return;
        }

        console.log('[SocketService] Force reconnecting...');
        this.socket.disconnect();
        this.socket.connect();
    }
}

/**
 * v5.161: Robust date normalization to avoid format mismatches (DD-MM-YYYY vs YYYY-MM-DD)
 */
function normalizeDate(dateStr: string | null): string | null {
    return normalizeDateToIso(dateStr);
}

// Export singleton instance
export const socketService = new SocketService();

// Export types
export type { DashboardUpdateCallback };
