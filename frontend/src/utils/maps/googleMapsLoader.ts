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
        return false // De-Googling: Never loaded
    }

    async load(): Promise<void> {
        console.warn('[googleMapsLoader] Google Maps load BLOCKED (De-Googling active).');
        return Promise.resolve();
    }

    onLoaded(callback: () => void): void {
        // De-Googling: Execute callback immediately but without Maps context
        callback()
    }

    // Protected method for internal use if any
    protected _loadScript(_apiKey: string): Promise<void> {
        return Promise.reject(new Error('Google Maps script injection is blocked.'));
    }

    getState(): Readonly<GoogleMapsLoaderState> {
        return { ...this.state }
    }
}

// Singleton instance
export const googleMapsLoader = new GoogleMapsLoaderClass()

declare global {
    interface Window {
        googleMapsLoaded: boolean
        google: any
        initGoogleMaps: () => void
    }
}
