interface GoogleMapsLoaderState {
    isLoaded: boolean
    isLoading: boolean
    loadPromise: Promise<void> | null
    loadedApiKey: string | null
}

class GoogleMapsLoaderClass {
    private state: GoogleMapsLoaderState = {
        isLoaded: false,
        isLoading: false,
        loadPromise: null,
        loadedApiKey: null,
    }

    isLoaded(): boolean {
        return false // De-Googling: никогда не загружается
    }

    async load(): Promise<void> {
        console.warn('[googleMapsLoader] Google Maps load BLOCKED (De-Googling active).');
        return Promise.resolve();
    }

    onLoaded(callback: () => void): void {
        // De-Googling: выполняем колбэк немедленно, но без контекста Maps
        callback()
    }

    // Защищённый метод для внутреннего использования
    protected _loadScript(_apiKey: string): Promise<void> {
        return Promise.reject(new Error('Google Maps script injection is blocked.'));
    }

    getState(): Readonly<GoogleMapsLoaderState> {
        return { ...this.state }
    }
}

// Синглтон-экземпляр
export const googleMapsLoader = new GoogleMapsLoaderClass()

declare global {
    interface Window {
        googleMapsLoaded: boolean
        google: any
        initGoogleMaps: () => void
    }
}
