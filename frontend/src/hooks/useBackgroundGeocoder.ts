import { useEffect, useRef } from 'react';
import { GeocodingService } from '../services/geocodingService';
import { Order } from '../types';

// Rate-limit: avoid spamming during search
const sessionGeocoded = new Set<string>();

/**
 * Background Pre-geocoder
 * 
 * Silently warms up the geocode cache when orders are loaded.
 */
export function useBackgroundGeocoder(orders: Order[]) {
    const queueRef = useRef<Set<string>>(new Set());
    const isProcessingRef = useRef(false);

    useEffect(() => {
        if (!orders || orders.length === 0) return;

        const newAddresses = orders
            .map(o => o.address?.trim())
            .filter(addr => addr && addr.length > 5);

        let added = false;
        newAddresses.forEach(addr => {
            if (!sessionGeocoded.has(addr) && !queueRef.current.has(addr)) {
                queueRef.current.add(addr);
                added = true;
                sessionGeocoded.add(addr);
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
            // Add a small 500ms breather even between idle callbacks to prevent UI starvation 
            // during massive (300+) order loads when the tab is first opened.
            setTimeout(() => {
                if ('requestIdleCallback' in window) {
                    (window as any).requestIdleCallback(doWork, { timeout: 3000 });
                } else {
                    setTimeout(doWork, 1000);
                }
            }, 500);
        } else {
            isProcessingRef.current = false;
        }
    };
}
