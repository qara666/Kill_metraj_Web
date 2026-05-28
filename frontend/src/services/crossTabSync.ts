type MessageHandler = (data: any) => void;

class CrossTabSync {
    private channel: BroadcastChannel | null = null;
    private handlers: Map<string, Set<MessageHandler>> = new Map();
    private tabId: string;
    private fallbackStorageHandler: ((event: StorageEvent) => void) | null = null;
    private useBroadcastChannel: boolean;
    private queue: Array<{ type: string; payload: any }> = [];
    private flushScheduled = false;

    constructor() {
        this.tabId = Math.random().toString(36).substring(2, 10);
        (window as any).__tabId = this.tabId;
        this.useBroadcastChannel = typeof BroadcastChannel !== 'undefined';

        if (this.useBroadcastChannel) {
            this.channel = new BroadcastChannel('km_sync_channel');
            this.channel.onmessage = (event: MessageEvent) => {
                const { type, payload, senderTabId } = event.data;
                if (senderTabId === this.tabId) return;
                this.dispatch(type, payload);
            };
        } else {
            this.fallbackStorageHandler = (event: StorageEvent) => {
                if (event.key !== 'km_cross_tab_sync' || !event.newValue) return;
                try {
                    const msg = JSON.parse(event.newValue);
                    if (msg.senderTabId === this.tabId) return;
                    this.dispatch(msg.type, msg.payload);
                } catch {}
            };
            window.addEventListener('storage', this.fallbackStorageHandler);
        }
    }

    broadcast(type: string, payload: any): void {
        const message = { type, payload, senderTabId: this.tabId, ts: Date.now() };

        if (this.useBroadcastChannel && this.channel) {
            this.channel.postMessage(message);
        } else {
            try {
                localStorage.setItem('km_cross_tab_sync', JSON.stringify(message));
                requestAnimationFrame(() => {
                    localStorage.removeItem('km_cross_tab_sync');
                });
            } catch {}
        }
    }

    broadcastBatched(type: string, payload: any, delay: number = 16): void {
        const existing = this.queue.findIndex(q => q.type === type);
        if (existing >= 0) {
            this.queue[existing].payload = payload;
        } else {
            this.queue.push({ type, payload });
        }
        if (!this.flushScheduled) {
            this.flushScheduled = true;
            setTimeout(() => {
                this.flushScheduled = false;
                for (const item of this.queue) {
                    this.broadcast(item.type, item.payload);
                }
                this.queue = [];
            }, delay);
        }
    }

    on(type: string, handler: MessageHandler): () => void {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, new Set());
        }
        this.handlers.get(type)!.add(handler);
        return () => this.handlers.get(type)?.delete(handler);
    }

    off(type: string, handler: MessageHandler): void {
        this.handlers.get(type)?.delete(handler);
    }

    private dispatch(type: string, payload: any): void {
        const handlers = this.handlers.get(type);
        if (handlers) {
            for (const handler of handlers) {
                try {
                    handler(payload);
                } catch (e) {
                    console.warn(`[CrossTabSync] handler error for "${type}":`, e);
                }
            }
        }
    }

    getTabId(): string {
        return this.tabId;
    }

    destroy(): void {
        if (this.channel) {
            this.channel.close();
            this.channel = null;
        }
        if (this.fallbackStorageHandler) {
            window.removeEventListener('storage', this.fallbackStorageHandler);
            this.fallbackStorageHandler = null;
        }
        this.handlers.clear();
        this.queue = [];
    }
}

export const crossTabSync = new CrossTabSync();

export type SyncMessageType =
    | 'robot_status'
    | 'routes_update'
    | 'dashboard_data'
    | 'store_update'
    | 'manual_sync_trigger'
    | 'date_shift_change';
