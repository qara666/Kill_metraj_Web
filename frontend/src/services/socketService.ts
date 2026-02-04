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
            reconnectionDelay: 1000,
            reconnectionDelayMax: 10000, // Increased for stability
            reconnectionAttempts: this.maxReconnectAttempts,
            // Prioritize websocket to bypass Render sticky session issues with polling
            transports: ['websocket', 'polling'],
            timeout: 20000, // Increased timeout for slow mobile networks
            autoConnect: true
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

        this.socket.on('dashboard:update', (data) => {
            console.log('[SocketService]  Dashboard update received:', {
                timestamp: data.timestamp,
                status: data.status
            });
            callback(data);
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
