import { GeocodingResult } from './geocodingService';
import { API_URL } from '../config/apiConfig'

interface BulkGetResult {
    success: boolean;
    hits: Record<string, GeocodingResult>;
}

/**
 * dbGeocache uses the L2 Database cache (PostgreSQL).
 * It's optimized for batch operations via requestIdleCallback.
 * Fire-and-forget writes, and multi-read gets.
 */
export class DBGeocache {
    /**
     * Batch fetch addresses from the DB cache.
     * Guaranteed to not throw — returns empty results on error.
     */
    static async bulkGet(addresses: string[]): Promise<Record<string, GeocodingResult>> {
        if (!addresses || addresses.length === 0) return {};

        try {
            const baseUrl = API_URL.replace(/\/api$/, '');
            const response = await fetch(`${baseUrl}/api/geocache/bulk-get`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ addresses })
            });

            if (!response.ok) return {};

            const data: BulkGetResult = await response.json();
            return data.success ? (data.hits || {}) : {};
        } catch (error) {
            console.warn('[DBGeocache] Error fetching L2 cache:', error);
            return {};
        }
    }

    /**
     * Fire-and-forget write to DB cache (UPSERT).
     * @param entries Array of { address_key, result }
     */
    static bulkSetAsync(entries: { address_key: string; result: GeocodingResult }[]): void {
        if (!entries || entries.length === 0) return;

        // Try to run in idle time so network isn't blocked for critical tasks
        if ('requestIdleCallback' in window) {
            (window as any).requestIdleCallback(() => this._executeSet(entries), { timeout: 2000 });
        } else {
            setTimeout(() => this._executeSet(entries), 100);
        }
    }

    private static async _executeSet(entries: { address_key: string; result: GeocodingResult }[]) {
        try {
            const baseUrl = API_URL.replace(/\/api$/, '');
            const response = await fetch(`${baseUrl}/api/geocache/bulk-set`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entries })
            });

            if (!response.ok) {
                console.warn(`[DBGeocache] Failed to write L2 cache: ${response.status}`);
            }
        } catch (error) {
            // Silently swallow errors (fire and forget)
            console.debug('[DBGeocache] Background L2 sync failed:', error);
        }
    }
}
