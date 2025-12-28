import { localStorageUtils } from './localStorage'
import { validateGoogleMapsApiKey } from './apiKeyValidator'

interface GoogleMapsLoader {
    isLoaded: boolean
    isLoading: boolean
    loadPromise: Promise<void> | null
}

class GoogleMapsLoaderClass {
    private state: GoogleMapsLoader = {
        isLoaded: false,
        isLoading: false,
        loadPromise: null
    }

    private callbacks: (() => void)[] = []

    // Проверяем, загружен ли Google Maps API
    isLoaded(): boolean {
        return this.state.isLoaded && 
               window.google && 
               window.google.maps && 
               localStorageUtils.hasApiKey()
    }

    // Загружаем Google Maps API с ключом из настроек
    async load(): Promise<void> {
        if (this.isLoaded()) {
            return Promise.resolve()
        }

        if (this.state.isLoading && this.state.loadPromise) {
            return this.state.loadPromise
        }

        const apiKey = localStorageUtils.getApiKey()
        const envApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
        const finalApiKey = (apiKey || envApiKey || '').trim()

        if (!finalApiKey) {
            throw new Error('Google Maps API ключ не найден в настройках. Пожалуйста, добавьте ключ в настройках.')
        }

        const isValid = validateGoogleMapsApiKey(finalApiKey)

        if (!isValid) {
            throw new Error('Google Maps API ключ недействителен')
        }

        this.state.isLoading = true
        this.state.loadPromise = this.loadScript(finalApiKey)

        try {
            await this.state.loadPromise
            this.state.isLoaded = true
            this.state.isLoading = false
            
            // Вызываем все колбэки
            this.callbacks.forEach(callback => callback())
            this.callbacks = []
        } catch (error) {
            this.state.isLoading = false
            this.state.loadPromise = null
            throw error
        }
    }

    // Добавляем колбэк, который будет вызван после загрузки
    onLoaded(callback: () => void): void {
        if (this.isLoaded()) {
            callback()
        } else {
            this.callbacks.push(callback)
        }
    }

    // Загружаем скрипт Google Maps API
    private loadScript(apiKey: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const existingScript = document.querySelector('script[src*="maps.googleapis.com"]')
            if (existingScript) {
                existingScript.remove()
            }

            if (window.google && window.google.maps) {
                window.googleMapsLoaded = true; // Убедимся, что строка завершена корректно
                resolve(); 
                return;
            }

            const script = document.createElement('script')
            script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,drawing,geometry,visualization&loading=async&callback=initGoogleMaps`
            script.async = true
            script.defer = true

            window.initGoogleMaps = () => {
                window.googleMapsLoaded = true
                resolve(); // Убедимся, что строка завершена корректно
            }

            script.onload = () => {
                setTimeout(() => {
                    if (window.google && window.google.maps) {
                        window.googleMapsLoaded = true
                        resolve();
                    }
                }, 100)
            }

            script.onerror = () => {
                reject(new Error('Не удалось загрузить Google Maps API. Проверьте правильность API ключа.'))
            }

            document.head.appendChild(script)
        })
    }

    getState(): GoogleMapsLoader {
        return { ...this.state }
    }
}

// Создаем единственный экземпляр
export const googleMapsLoader = new GoogleMapsLoaderClass()

// Расширяем интерфейс Window
declare global {
    interface Window {
        googleMapsLoaded: boolean
        google: any
        initGoogleMaps: () => void
    }
}
