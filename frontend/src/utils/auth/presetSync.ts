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
        // We explicitly check keys that should trigger a reload for the user, especially lastKmlSync
        const keysToCheck = [
            'googleMapsApiKey', 'cityBias', 'kmlSourceUrl', 
            'selectedHubs', 'selectedZones', 'lastKmlSync', 
            'autoSyncKml', 'theme', 'courierTransportType', 
            'fastopertorApiKey'
        ];

        let hasChanged = false;
        for (const key of keysToCheck) {
            if (JSON.stringify(currentLocal[key]) !== JSON.stringify(mappedSettings[key])) {
                hasChanged = true;
                break;
            }
        }

        if (hasChanged) {
            console.log('Detected preset changes from server, updating local storage...')
            // 4. Save to local storage (this broadcasts the update to other tabs/components)
            localStorageUtils.setAllSettings(mappedSettings)
            
            // Mapbox token specifically (used by some map components directly)
            if (mappedSettings.mapboxToken) {
                localStorage.setItem('km_mapbox_token', mappedSettings.mapboxToken)
            }
        } else {
            // console.log('Presets are up to date with server.')
        }

        return mappedSettings
    } catch (error) {
        console.error('Failed to sync presets from server:', error)
        return null
    }
}
