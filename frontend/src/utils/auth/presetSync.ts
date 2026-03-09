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
        
        // 1. Get current local settings to compare
        const currentLocal = localStorageUtils.getAllSettings()
        
        // 2. Map server fields to local storage keys (handling mismatches)
        const mappedSettings: Record<string, any> = {
            ...serverSettings,
            // Map mapboxApiKey -> mapboxToken if needed (checking both directions)
            mapboxToken: serverSettings.mapboxToken || serverSettings.mapboxApiKey || '',
            mapboxApiKey: serverSettings.mapboxApiKey || serverSettings.mapboxToken || '',
        }
        
        // 3. Change detection to avoid redundant broadcasts
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

        // 4. Handle KML Auto-Sync if URL changed or data is missing
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
            // 5. Save to local storage (this broadcasts the update to other tabs/components)
            localStorageUtils.setAllSettings(mappedSettings)
            
            // Mapbox token specifically (used by some map components directly)
            if (mappedSettings.mapboxToken) {
                localStorage.setItem('km_mapbox_token', mappedSettings.mapboxToken)
            }

            // 6. If the Google Maps API key changed, trigger a reload of the Maps script.
            // The googleMapsLoader will detect the key mismatch and reload the browser session.
            if (googleMapsKeyChanged && mappedSettings.googleMapsApiKey) {
                const { googleMapsLoader } = await import('../maps/googleMapsLoader')
                try {
                    await googleMapsLoader.load()
                } catch (err) {
                    console.warn('[presetSync] Maps loader reload after key change:', err)
                    // Non-fatal — the user will get a fresh key on next calculation attempt
                }
            }
        }

        return mappedSettings
    } catch (error) {
        console.error('Failed to sync presets from server:', error)
        return null
    }
}
