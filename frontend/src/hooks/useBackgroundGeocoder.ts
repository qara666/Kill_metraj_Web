import { useEffect, useRef } from 'react';
import { googleApiCache } from '../services/googleApiCache';
import { GeocodingService } from '../services/geocodingService';
import { Order } from '../types';

/**
 * Background Pre-geocoder
 * 
 * Silently warms up the geocode cache (L1 and L2) when orders are loaded.
 * Uses requestIdleCallback so it never blocks UI rendering or route calculation.
 */
export function useBackgroundGeocoder(orders: Order[]) {
    const queueRef = useRef<Set<string>>(new Set());
    const isProcessingRef = useRef(false);

    useEffect(() => {
        if (!orders || orders.length === 0) return;

        // 1. Find all addresses we haven't seen yet and that aren't already in L1 cache
        const newAddresses = orders
            .map(o => o.address?.trim())
            .filter(addr => addr && addr.length > 5);

        let added = false;
        newAddresses.forEach(addr => {
            // Check if already in L1 localStorage
            // We do a fast synchronous check. If it's already in L1, no need to pre-geocode.
            const L1hit = googleApiCache.hasGeocodeCacheSync(addr);
            if (!L1hit && !queueRef.current.has(addr)) {
                queueRef.current.add(addr);
                added = true;
            }
        });

        if (added && !isProcessingRef.current) {
            processQueue();
        }
    }, [orders]);

    const processQueue = () => {
        if (queueRef.current.size === 0) {
            isProcessingRef.current = false;
            return;
        }

        isProcessingRef.current = true;

        if ('requestIdleCallback' in window) {
            (window as any).requestIdleCallback(doWork, { timeout: 2000 });
        } else {
            setTimeout(doWork, 500);
        }
    };

    const doWork = async () => {
        // Process up to 10 at a time to leverage batching and deduplication
        const batch: string[] = [];
        const it = queueRef.current.values();
        for (let i = 0; i < 10; i++) {
            const next = it.next();
            if (next.done) break;
            batch.push(next.value);
            queueRef.current.delete(next.value);
        }

        if (batch.length > 0) {
            try {
                // geocodeAddresses defaults to geocodeAndCleanAddress logic,
                // which routes through googleApiCache (L1 -> L2 -> L3)
                // This means:
                // 1. It will hit PostgreSQL (L2) in bulk first.
                // 2. If missed, it will call Google Maps API (L3) with MAX_CONCURRENT=5 limit.
                // 3. Results will be saved to both L1 and L2 caches automatically.
                await GeocodingService.geocodeAddresses(batch);
            } catch (error) {
                console.debug('[BackgroundGeocoder] batch error:', error);
            }
        }

        // Keep running until queue is empty
        if (queueRef.current.size > 0) {
            if ('requestIdleCallback' in window) {
                (window as any).requestIdleCallback(doWork, { timeout: 2000 });
            } else {
                setTimeout(doWork, 500);
            }
        } else {
            isProcessingRef.current = false;
        }
    };
}
