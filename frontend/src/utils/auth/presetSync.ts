import { authService } from './authService'
import { localStorageUtils } from '../ui/localStorage'

/**
 * Synchronizes user presets from the server to the local storage.
 * This ensures that the user always has the latest settings defined by the admin.
 * @param userId - The ID of the user to sync presets for.
 * @returns The synchronized settings or null if failed/no data.
 */
export const syncPresetsToLocalStorage = async (userId: number): Promise<any | null> => {
    try {
        const presets = await authService.getUserPresets(userId)
        if (!presets || !presets.settings) return null

        const serverSettings = presets.settings
        
        // 1. Получаем текущие локальные настройки для сравнения
        const currentLocal = localStorageUtils.getAllSettings()
        
        // 2. Маппим поля сервера на ключи localStorage (обработка несовпадений)
        const mappedSettings: Record<string, any> = {
            ...serverSettings,
            // Маппим mapboxApiKey -> mapboxToken при необходимости (проверяем оба направления)
            mapboxToken: serverSettings.mapboxToken || serverSettings.mapboxApiKey || '',
            mapboxApiKey: serverSettings.mapboxApiKey || serverSettings.mapboxToken || '',
        }
        
        // 3. Обнаружение изменений, чтобы избежать лишних рассылок
        const keysToCheck = [
            'googleMapsApiKey', 'cityBias', 'kmlSourceUrl', 'kmlData',
            'selectedHubs', 'selectedZones', 'lastKmlSync', 
            'autoSyncKml', 'theme', 'courierTransportType', 
            'fastopertorApiKey', 'generouteApiKey', 'geoapifyApiKey',
            'mapboxToken', 'mapProvider', 'routingProvider', 'geocodingProvider',
            'defaultStartAddress', 'defaultStartLat', 'defaultStartLng',
            'defaultEndAddress', 'defaultEndLat', 'defaultEndLng',
            'anomalyFilterEnabled', 'anomalyMaxLegDistanceKm', 
            'anomalyMaxTotalDistanceKm', 'anomalyMaxAvgPerOrderKm',
            'addressQualityThreshold', 'enableCoordinateValidation', 'enableAdaptiveThresholds',
            'maxStopsPerRoute', 'maxRouteDurationMin', 'maxRouteDistanceKm', 'maxWaitPerStopMin',
            'maxCriticalRouteDistanceKm'
        ];

        let hasChanged = false;
        let googleMapsKeyChanged = false;

        for (const key of keysToCheck) {
            const localVal = JSON.stringify(currentLocal[key])
            const serverVal = JSON.stringify(mappedSettings[key])
            if (localVal !== serverVal) {
                hasChanged = true;
                if (key === 'googleMapsApiKey') {
                    googleMapsKeyChanged = true;
                    console.log('[presetSync] Google Maps API key changed by admin.')
                }
            }
        }

        // 4. Обработка авто-синхронизации KML, если URL изменился или данные отсутствуют
        if (mappedSettings.kmlSourceUrl && (!mappedSettings.kmlData || mappedSettings.lastKmlSync !== currentLocal.lastKmlSync)) {
            const { fetchAndParseKML } = await import('../maps/kmlSync')
            const parsed = await fetchAndParseKML(mappedSettings.kmlSourceUrl)
            if (parsed) {
                mappedSettings.kmlData = parsed
                mappedSettings.lastKmlSync = new Date().toLocaleString()
                hasChanged = true
            }
        }

        if (hasChanged) {
            console.log('[presetSync] Preset changes detected, updating local storage...')
            // 5. Сохраняем в localStorage (рассылает обновление другим вкладкам/компонентам)
            localStorageUtils.setAllSettings(mappedSettings)
            
            // Mapbox-токен отдельно (используется некоторыми компонентами карты напрямую)
            if (mappedSettings.mapboxToken) {
                localStorage.setItem('km_mapbox_token', mappedSettings.mapboxToken)
            }

            // 6. Если Google Maps API ключ изменился, перезагружаем скрипт Maps.
            // googleMapsLoader обнаружит несовпадение ключа и перезагрузит сессию браузера.
            if (googleMapsKeyChanged && mappedSettings.googleMapsApiKey) {
                const { googleMapsLoader } = await import('../maps/googleMapsLoader')
                try {
                    await googleMapsLoader.load()
                } catch (err) {
                    console.warn('[presetSync] Maps loader reload after key change:', err)
                    // Не критично — пользователь получит новый ключ при следующей попытке расчёта
                }
            }
        }

        return mappedSettings
    } catch (error) {
        console.error('Failed to sync presets from server:', error)
        return null
    }
}
