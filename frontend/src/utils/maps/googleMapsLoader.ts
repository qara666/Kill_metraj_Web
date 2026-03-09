import { localStorageUtils } from '../ui/localStorage'
import { validateGoogleMapsApiKey } from '../api/apiKeyValidator'

interface GoogleMapsLoaderState {
    isLoaded: boolean
    isLoading: boolean
    loadPromise: Promise<void> | null
    /** The API key that was used to load the current Maps script. */
    loadedApiKey: string | null
}

class GoogleMapsLoaderClass {
    private state: GoogleMapsLoaderState = {
        isLoaded: false,
        isLoading: false,
        loadPromise: null,
        loadedApiKey: null,
    }

    private callbacks: (() => void)[] = []

    /**
     * Returns true only if Maps is loaded AND the loaded key matches the
     * key currently stored in localStorage (set via admin preset sync).
     */
    isLoaded(): boolean {
        if (!this.state.isLoaded) return false
        if (!window.google?.maps) return false
        if (!localStorageUtils.hasApiKey()) return false

        const currentKey = (localStorageUtils.getApiKey() || '').trim()
        // If the key changed since we last loaded, treat as "not loaded"
        // so the next load() call will pick up the new key.
        if (this.state.loadedApiKey && currentKey && this.state.loadedApiKey !== currentKey) {
            console.log('[googleMapsLoader] API key changed — will reload with new key.')
            this.reset()
            return false
        }
        return true
    }

    /** Reset state so the next load() re-fetches the script. */
    private reset(): void {
        this.state.isLoaded = false
        this.state.isLoading = false
        this.state.loadPromise = null
        // Keep loadedApiKey so we can log the change, clear it before the next load
    }

    async load(): Promise<void> {
        if (this.isLoaded()) {
            return Promise.resolve()
        }

        // If already loading, piggyback on the existing promise
        if (this.state.isLoading && this.state.loadPromise) {
            return this.state.loadPromise
        }

        const apiKey = localStorageUtils.getApiKey()
        const envApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
        const finalApiKey = (apiKey || envApiKey || '').trim()

        if (!finalApiKey) {
            throw new Error('Google Maps API ключ не найден в настройках. Пожалуйста, добавьте ключ в настройках.')
        }

        if (!validateGoogleMapsApiKey(finalApiKey)) {
            throw new Error('Google Maps API ключ недействителен')
        }

        this.state.isLoading = true
        this.state.loadedApiKey = null // Clear before load so isLoaded() won't shortcircuit
        this.state.loadPromise = this._loadScript(finalApiKey)

        try {
            await this.state.loadPromise
            this.state.isLoaded = true
            this.state.isLoading = false
            this.state.loadedApiKey = finalApiKey // Record which key we used

            console.log('[googleMapsLoader] Loaded with key:', finalApiKey.slice(0, 8) + '...')

            this.callbacks.forEach(cb => cb())
            this.callbacks = []
        } catch (error) {
            this.state.isLoading = false
            this.state.loadPromise = null
            this.state.loadedApiKey = null
            throw error
        }
    }

    onLoaded(callback: () => void): void {
        if (this.isLoaded()) {
            callback()
        } else {
            this.callbacks.push(callback)
        }
    }

    private _loadScript(apiKey: string): Promise<void> {
        return new Promise((resolve, reject) => {
            // Remove any previously injected Maps script (e.g. from old key)
            document.querySelectorAll('script[src*="maps.googleapis.com"]').forEach(s => s.remove())

            // If Maps is already present in window AND we haven't reset, it matches — resolve immediately
            if (window.google?.maps && this.state.loadedApiKey === apiKey) {
                window.googleMapsLoaded = true
                resolve()
                return
            }

            // If Maps was loaded by a DIFFERENT key, we need a page-level reload because
            // the Maps SDK doesn't support swapping keys after load.
            // We set a flag + swap the key, then force a reload only on the next navigation.
            if (window.google?.maps && this.state.loadedApiKey && this.state.loadedApiKey !== apiKey) {
                // Key changed — store the new key and mark for reload
                console.warn(
                    '[googleMapsLoader] Google Maps already loaded with a different key.' +
                    ' The browser session will reload to apply the new key.'
                )
                // The key was already saved by presetSync, so a reload will pick it up.
                window.location.reload()
                return
            }

            const script = document.createElement('script')
            script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,drawing,geometry,visualization&loading=async&callback=initGoogleMaps`
            script.async = true
            script.defer = true

            window.initGoogleMaps = () => {
                window.googleMapsLoaded = true
                resolve()
            }

            script.onload = () => {
                // Fallback: if callback hasn't fired within 200 ms, resolve anyway
                setTimeout(() => {
                    if (window.google?.maps) {
                        window.googleMapsLoaded = true
                        resolve()
                    }
                }, 200)
            }

            script.onerror = () => {
                reject(new Error('Не удалось загрузить Google Maps API. Проверьте правильность API ключа.'))
            }

            document.head.appendChild(script)
        })
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
