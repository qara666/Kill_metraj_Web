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

    /**
     * Connect to WebSocket server
     */
    connect(token: string): Socket {
        if (this.socket?.connected) {
            console.log('[SocketService] Already connected');
            return this.socket;
        }

        if (this.isConnecting) {
            console.log('[SocketService] Connection in progress');
            return this.socket!;
        }

        this.isConnecting = true;

        const apiUrl = API_URL;

        console.log('[SocketService] Connecting to:', apiUrl);

        this.socket = io(apiUrl, {
            auth: { token },
            reconnection: true,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 10000,
            reconnectionAttempts: this.maxReconnectAttempts,
            // CRITICAL: Force polling first for Render compatibility
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

    /**
     * Setup Socket.io event handlers
     */
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
    }

    /**
     * Setup visibility change handler for tab wake/sleep
     */
    private setupVisibilityHandler(): void {
        if (typeof document === 'undefined') return;

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                console.log('[SocketService] Tab became visible');

                // Reconnect if disconnected
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

        // v30.0: dashboard:update now carries enriched courier data from Turbo Robot
        // Apply the enriched data directly into ExcelDataContext via custom DOM event
        this.socket.on('dashboard:update', (data) => {
            console.log('[SocketService] 🤖 Dashboard:update received', {
                source: data?.source,
                hasCouriers: !!(data?.data?.couriers?.length),
                divisionId: data?.divisionId
            });
            
            // v30.0: If turbo robot sent enriched data, push it directly to React state
            if (data?.data && data?.source === 'turbo_calculator_enrichment') {
                console.log('[SocketService] 🚀 Applying enriched data from Turbo Robot:', {
                    couriers: data.data.couriers?.length,
                    orders: data.data.orders?.length
                });
                // Dispatch custom event — ExcelDataContext listens to this in the same tab
                window.dispatchEvent(new CustomEvent('km:turbo:dashboard_update', { detail: data.data }));
            }
            
            callback({ data: data?.data || null, timestamp: new Date().toISOString(), status: 200 });
        });

        // v19.0: Support Turbo Robot events
        this.socket.on('dashboard_update', (data) => {
            console.log('[SocketService] 🤖 Turbo Robot: Dashboard data changed', data);
            callback({ data: null, timestamp: new Date().toISOString(), status: 200 }); // Trigger refetch
        });

        // Per-division status updates (for multi-division UI)
        this.socket.on('division_status', (payload) => {
            console.log('[SocketService] division_status', payload);
            try {
                // Attach division status to a simple in-memory store
                window.__divisionStatuses = window.__divisionStatuses || {};
                window.__divisionStatuses[payload.divisionId] = payload;
                
                // v25.0: Emit local event for real-time UI updates
                this.emit('division_status_update', payload);
            } catch (e) {
                console.warn('Failed to store division_status', e);
            }
        });

        this.socket.on('routes_update', (data) => {
            console.log('[SocketService] 🤖 Turbo Robot: Routes recalculated', {
                divisionId: data.divisionId,
                date: data.date,
                count: data.routes?.length
            });
            
            // v25.0: Sanity check - Ignore updates for other divisions
            try {
                const { useDashboardStore } = require('../stores/useDashboardStore');
                const store = useDashboardStore.getState();
                const currentDivisionStr = String(store.divisionId || 'all');
                
                if (currentDivisionStr !== 'all' && String(data.divisionId) !== currentDivisionStr) {
                    console.log(`[SocketService] 🛑 Ignoring routes_update for division ${data.divisionId} (currently on ${currentDivisionStr})`);
                    return;
                }
            } catch (e) {
                // Ignore division check errors
            }
            
            // Try to trigger a direct refresh via global function
            try {
                if (typeof window !== 'undefined' && (window as any).__refreshTurboRoutes) {
                    console.log('[SocketService] 🔄 Triggering route refresh via global function');
                    setTimeout(() => (window as any).__refreshTurboRoutes(), 100);
                }
            } catch (e) {
                console.warn('[SocketService] Failed to trigger global refresh:', e);
            }

            // v30.0: Dispatch DOM CustomEvent for SAME-TAB React state update
            // localStorage 'storage' events DON'T fire in the same browser tab!
            if (data.routes && Array.isArray(data.routes)) {
                console.log('[SocketService] 📡 Dispatching km:turbo:routes_update:', data.routes.length, 'routes');
                window.dispatchEvent(new CustomEvent('km:turbo:routes_update', {
                    detail: {
                        routes: data.routes,
                        date: data.date,
                        divisionId: data.divisionId,
                        // v5.153: Pass enriched couriers for immediate km update in Couriers tab
                        couriers: Array.isArray(data.couriers) && data.couriers.length > 0 && typeof data.couriers[0] === 'object'
                            ? data.couriers
                            : null
                    }
                }));
                // Also persist for cross-tab sync / page reload recovery
                try {
                    localStorage.setItem('km_routes', JSON.stringify(data.routes));
                    localStorage.setItem('km_routes_last_updated', new Date().toISOString());
                } catch (e) {
                    console.warn('[SocketService] Failed to persist routes to localStorage:', e);
                }
            }
            
            callback({ data: null, timestamp: new Date().toISOString(), status: 200 }); // Trigger refetch
        });

        
        // v22.6: Live status updates for the Robot counter (0/126)
        this.socket.on('robot_status', (data) => {
            console.log('[SocketService] 🤖 Turbo Robot: Status update', data);
            try {
                const { useDashboardStore } = require('../stores/useDashboardStore');
                useDashboardStore.getState().setAutoRoutingStatus(data);
            } catch (e) {
                // Secondary fallback if direct import fails in this context
            }
        });

        // Store callback for cleanup
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

// Export singleton instance
export const socketService = new SocketService();

// Export types
export type { DashboardUpdateCallback };
