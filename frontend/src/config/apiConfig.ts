export const getBaseUrl = (): string => {
    // 1. Check environment variable (baked in at build time by Vite)
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
    if (import.meta.env.VITE_BACKEND_URL) return import.meta.env.VITE_BACKEND_URL;

    // 2. Check if running on Render environment at runtime
    if (typeof window !== 'undefined' && (
        window.location.hostname.includes('onrender.com') ||
        window.location.hostname === 'kill-metraj.onrender.com'
    )) {
        // Explicitly point to the backend service domain
        return 'https://kill-metraj-backend.onrender.com';
    }

    // 3. Local fallback
    return 'http://localhost:5001';
};

export const API_URL = getBaseUrl();
