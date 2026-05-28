export const getBaseUrl = (): string => {
    // 1. Проверка среды Render в runtime (ВЫСШИЙ ПРИОРИТЕТ)
    if (typeof window !== 'undefined' && window.location.hostname.includes('onrender.com')) {
        const hostname = window.location.hostname;

        // ЯВНОЕ СОПОСТАВЛЕНИЕ ДЛЯ LIVE (ЗАЩИТА)
        if (hostname === 'yapiko-auto-km-frontend-live.onrender.com') {
            const url = 'https://yapiko-auto-km-backend.onrender.com';
            console.log(`[Config] Live environment detected. Forcing backend: ${url}`);
            return url;
        }

        // Обработка случаев, когда имя хоста не содержит 'frontend' явно
        let inferredBackend = hostname;
        if (hostname.includes('frontend')) {
            inferredBackend = hostname.replace('frontend', 'backend');
        } else if (hostname.includes('-ui')) {
            inferredBackend = hostname.replace('-ui', '-api');
        } else if (hostname.includes('client')) {
            inferredBackend = hostname.replace('client', 'server');
        } else {
            // Суффикс по умолчанию, если стандартное именование не найдено
            inferredBackend = hostname + '-api'; // risky but better than nothing
        }

        const url = `https://${inferredBackend}`;
        console.log(`[Config] Render.com detected. Inferred backend: ${url}`);
        return url;
    }

    // 2. Резервное использование переменных среды
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
    if (import.meta.env.VITE_BACKEND_URL) return import.meta.env.VITE_BACKEND_URL;

    // 3. Локальный резерв
    return 'http://127.0.0.1:5001';
};

export const API_URL = getBaseUrl();
