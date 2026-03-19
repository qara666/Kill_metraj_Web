export const getBaseUrl = (): string => {
    // 1. Check if running on Render environment at runtime (HIGHEST PRIORITY)
    if (typeof window !== 'undefined' && window.location.hostname.includes('onrender.com')) {
        const hostname = window.location.hostname;

        // EXPLICIT MAPPING FOR LIVE (Failsafe)
        if (hostname === 'yapiko-auto-km-frontend-live.onrender.com') {
            const url = 'https://yapiko-auto-km-backend.onrender.com';
            console.log(`[Config] Live environment detected. Forcing backend: ${url}`);
            return url;
        }

        // Handle cases where hostname doesn't contain 'frontend' explicitly
        let inferredBackend = hostname;
        if (hostname.includes('frontend')) {
            inferredBackend = hostname.replace('frontend', 'backend');
        } else if (hostname.includes('-ui')) {
            inferredBackend = hostname.replace('-ui', '-api');
        } else if (hostname.includes('client')) {
            inferredBackend = hostname.replace('client', 'server');
        } else {
            // Default suffix replacement if no standard naming found
            inferredBackend = hostname + '-api'; // risky but better than nothing
        }

        const url = `https://${inferredBackend}`;
        console.log(`[Config] Render.com detected. Inferred backend: ${url}`);
        return url;
    }

    // 2. Fallback to environment variables
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
    if (import.meta.env.VITE_BACKEND_URL) return import.meta.env.VITE_BACKEND_URL;

    // 3. Local fallback
    return 'http://localhost:5001';
};

export const API_URL = getBaseUrl();
export const OSRM_PROXY_URL = `${API_URL}/api/proxy/osrm`;
