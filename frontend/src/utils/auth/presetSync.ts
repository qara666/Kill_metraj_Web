import { authService } from './authService';
import { localStorageUtils } from '../ui/localStorage';

/**
 * Synchronizes user presets from the server to the local storage.
 * This ensures that the user always has the latest settings defined by the admin.
 * @param userId - The ID of the user to sync presets for.
 */
export const syncPresetsToLocalStorage = async (userId: number): Promise<void> => {
    try {
        console.log(`Starting preset sync for user ${userId}...`);
        const preset = await authService.getUserPresets(userId);

        if (preset && preset.settings) {
            console.log('Received presets from server:', preset.settings);

            // Map server settings to local storage format
            // The server settings structure matches what localStorageUtils expects,
            // but we need to ensure specific keys like mapboxToken match if naming differs.
            // Based on UserPreset.js: mapboxApiKey is used, but Settings.tsx uses mapboxToken

            const serverSettings = preset.settings;
            console.log('Mapping server settings to local:', serverSettings);

            const settingsToSave = {
                ...serverSettings,
                // Map differing keys with fallbacks
                mapboxToken: serverSettings.mapboxToken || serverSettings.mapboxApiKey || '',
                anomalyFilterEnabled: serverSettings.anomalyFilterEnabled ?? serverSettings.anomalyFilter ?? false,

                // Ensure default addresses are set
                defaultStartAddress: serverSettings.defaultStartAddress || '',
                defaultEndAddress: serverSettings.defaultEndAddress || '',
                // Ensure API key is set for consistency (though it's saved separately too)
                googleMapsApiKey: serverSettings.googleMapsApiKey || '',
            };

            // Save to localStorage using the utility which broadcasts the update event
            localStorageUtils.setAllSettings(settingsToSave);

            console.log('Presets successfully synced to localStorage');
        } else {
            console.log('No specific presets found for user, using defaults.');
        }
    } catch (error) {
        console.error('Failed to sync presets to localStorage:', error);
        // We don't throw here to avoid blocking login if sync fails (e.g. offline)
    }
};
