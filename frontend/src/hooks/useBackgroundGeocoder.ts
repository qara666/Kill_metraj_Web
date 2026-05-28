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
        // Обработка up to 10 at a time to leverage batching and deduplication
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
                // geocodeAddresses по умолчанию использует логику geocodeAndCleanAddress,
                // которая проходит через googleApiCache (L1 -> L2 -> L3)
                // Это означает:
                // 1. Сначала будет массовый запрос к PostgreSQL (L2).
                // 2. Если не найдено, вызовет Google Maps API (L3) с лимитом MAX_CONCURRENT=5.
                // 3. Результаты будут автоматически сохранены в кэш L1 и L2.
                await GeocodingService.geocodeAddresses(batch);
            } catch (error) {
                console.debug('[BackgroundGeocoder] batch error:', error);
            }
        }

        // Keep running until queue is empty
        if (queueRef.current.size > 0) {
            // Добавить небольшую паузу 500мс между idle-callback'ами, чтобы предотвратить голодание UI
            // при массовой (300+) загрузке заказов при первом открытии вкладки.
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
