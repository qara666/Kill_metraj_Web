// Утилита для динамической загрузки Google Maps API с ключом из настроек

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
    // Если уже загружен, возвращаем успех
    if (this.isLoaded()) {
      return Promise.resolve()
    }

    // Если уже загружается, ждем завершения
    if (this.state.isLoading && this.state.loadPromise) {
      return this.state.loadPromise
    }

    // Получаем API ключ из настроек
    const apiKey = localStorageUtils.getApiKey()
    
    // Проверяем переменную окружения как fallback
    const envApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    
    const finalApiKey = (apiKey || envApiKey || '').trim()
    
    if (!finalApiKey) {
      throw new Error('Google Maps API ключ не найден в настройках. Пожалуйста, добавьте ключ в настройках.')
    }

    // Простая проверка валидности API ключа
    console.log('Проверяем валидность Google Maps API ключа...')
    const isValid = validateGoogleMapsApiKey(finalApiKey)
    
    if (!isValid) {
      throw new Error('Google Maps API ключ недействителен')
    }
    
    console.log('Google Maps API ключ валиден, загружаем API...')

    // Начинаем загрузку
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
      // Проверяем, не загружен ли уже скрипт
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]')
      if (existingScript) {
        console.log('Google Maps API уже загружен, удаляем старый скрипт')
        existingScript.remove()
      }

      // Проверяем, не загружается ли уже Google Maps
      if (window.google && window.google.maps) {
        console.log('Google Maps API уже доступен глобально')
        resolve()
        return
      }

      // Создаем новый скрипт
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGoogleMaps`
      script.async = true
      script.defer = true

      // Устанавливаем глобальный колбэк
      window.initGoogleMaps = () => {
        window.googleMapsLoaded = true
        console.log('Google Maps API загружен с ключом из настроек')
        resolve()
      }

      // Обработчики загрузки
      script.onload = () => {
        // Дополнительная проверка через небольшую задержку
        setTimeout(() => {
          if (window.google && window.google.maps) {
            window.googleMapsLoaded = true
            console.log('Google Maps API загружен (onload)')
            resolve()
          }
        }, 100)
      }

      script.onerror = () => {
        console.error('Ошибка загрузки Google Maps API')
        reject(new Error('Не удалось загрузить Google Maps API. Проверьте правильность API ключа.'))
      }

      // Добавляем скрипт в DOM
      document.head.appendChild(script)
    })
  }

  // Получаем текущее состояние
  getState(): GoogleMapsLoader {
    return { ...this.state }
  }
}

// Создаем единственный экземпляр
export const googleMapsLoader = new GoogleMapsLoaderClass()

// Расширяем Window интерфейс
declare global {
  interface Window {
    googleMapsLoaded: boolean
    google: any
    initGoogleMaps: () => void
  }
}









