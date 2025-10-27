export const useDataSync = () => {
  return {
    syncData: () => {},
    checkForUpdates: () => {},
    isSyncing: false,
    lastSync: new Date(),
    isEnabled: true,
    enableSync: () => {},
    disableSync: () => {}
  }
}
