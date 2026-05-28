import { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL } from '../config/apiConfig';
import { useDashboardStore } from '../stores/useDashboardStore';

interface AnalyticsCacheEntry {
    data: any;
    key: string;
    timestamp: number;
}

const CACHE_TTL = 60_000;
let globalCache: AnalyticsCacheEntry | null = null;
let inflightKey: string | null = null;
let inflightPromise: Promise<any> | null = null;

function getCacheKey(startDate: string, endDate: string, divisionId: string): string {
    return `${startDate}_${endDate}_${divisionId}`;
}

function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('km_access_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

export function useAnalyticsData(daysBack: number = 14) {
    const divisionId = useDashboardStore(s => s.divisionId);
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const mountedRef = useRef(true);

    const startDate = useCallback(() => {
        const d = new Date();
        d.setDate(d.getDate() - daysBack);
        return d.toISOString().split('T')[0];
    }, [daysBack]);

    const endDate = useCallback(() => {
        return new Date().toISOString().split('T')[0];
    }, []);

    const fetchAnalytics = useCallback(async (force = false) => {
        const s = startDate();
        const e = endDate();
        const div = divisionId || 'all';
        const key = getCacheKey(s, e, div);

        if (!force && globalCache && globalCache.key === key && (Date.now() - globalCache.timestamp) < CACHE_TTL) {
            setData(globalCache.data);
            setError(null);
            return;
        }

        if (inflightPromise && inflightKey === key) {
            const result = await inflightPromise;
            if (result) setData(result);
            return;
        }

        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();
        const signal = abortRef.current.signal;

        setLoading(true);
        setError(null);

        inflightKey = key;
        inflightPromise = (async () => {
            try {
                const params = new URLSearchParams({ startDate: s, endDate: e, divisionId: div });
                const res = await fetch(`${API_URL}/api/v1/dashboard/analytics/full?${params}`, {
                    headers: getAuthHeaders(),
                    signal
                });

                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const result = await res.json();

                if (!mountedRef.current) return null;

                if (result.success) {
                    globalCache = { data: result.data, key, timestamp: Date.now() };
                    setData(result.data);
                    return result.data;
                } else {
                    setError(result.error || 'Ошибка загрузки');
                    return null;
                }
            } catch (err: any) {
                if (err.name === 'AbortError') return null;
                if (mountedRef.current) setError(err.message || 'Ошибка сети');
                return null;
            } finally {
                if (mountedRef.current) setLoading(false);
                if (inflightKey === key) {
                    inflightKey = null;
                    inflightPromise = null;
                }
            }
        })();

        return inflightPromise;
    }, [startDate, endDate, divisionId]);

    useEffect(() => {
        mountedRef.current = true;
        fetchAnalytics();
        return () => {
            mountedRef.current = false;
            if (abortRef.current) abortRef.current.abort();
        };
    }, [fetchAnalytics]);

    return { data, loading, error, refetch: () => fetchAnalytics(true) };
}
