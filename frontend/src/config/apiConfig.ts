export const getBaseUrl = (): string => {
    // 1. Check if running on Render environment at runtime (HIGHEST PRIORITY to ensure correctness)
    if (typeof window !== 'undefined' && window.location.hostname.includes('onrender.com')) {
        const hostname = window.location.hostname;

        // Smart inference: map frontend to backend
        // This handles cases like:
        // - yapiko-auto-km-frontend-live -> yapiko-auto-km-backend-live
        // - yapiko-auto-km-frontend -> yapiko-auto-km-backend
        let inferredBackend = hostname.replace('-frontend', '-backend');

        // Special case for some common naming patterns if replace didn't do anything
        if (inferredBackend === hostname) {
            if (hostname.includes('frontend')) inferredBackend = hostname.replace('frontend', 'backend');
            else if (hostname.includes('ui')) inferredBackend = hostname.replace('ui', 'api');
        }

        const url = `https://${inferredBackend}`;
        console.log(`[Config] Render.com detected. Smart-inferred backend: ${url}`);
        return url;
    }

    // 2. Fallback to environment variables
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
    if (import.meta.env.VITE_BACKEND_URL) return import.meta.env.VITE_BACKEND_URL;

    // 3. Local fallback
    return 'http://localhost:5001';
};

export const API_URL = getBaseUrl();
