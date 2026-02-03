export const getBaseUrl = (): string => {
    // 1. Check environment variable (baked in at build time by Vite)
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
    if (import.meta.env.VITE_BACKEND_URL) return import.meta.env.VITE_BACKEND_URL;

    // 2. Check if running on Render environment at runtime
    if (typeof window !== 'undefined' && window.location.hostname.includes('onrender.com')) {
        // Automatically infer backend URL: replace '-frontend' with '-backend' or '-ui' with '-api'
        // This makes the code portable across different Render service names
        const hostname = window.location.hostname;

        // If the current hostname contains '-frontend', try to replace it with '-backend'
        if (hostname.includes('-frontend')) {
            return `https://${hostname.replace('-frontend', '-backend')}`;
        }

        // If it's a specific live URL mentioned in logs
        if (hostname === 'yapiko-auto-km-frontend-live.onrender.com') {
            return 'https://yapiko-auto-km-backend-live.onrender.com';
        }

        // Fallback for the known legacy domain
        if (hostname === 'kill-metraj.onrender.com' || hostname.includes('kill-metraj-frontend')) {
            return 'https://kill-metraj-backend.onrender.com';
        }

        // Final fallback: try to guess based on standard naming or just use relative if proxy is set up
        // But on Render, frontend and backend are usually separate services with separate domains.
    }

    // 3. Local fallback
    return 'http://localhost:5001';
};

export const API_URL = getBaseUrl();
