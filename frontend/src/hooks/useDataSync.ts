// Легкий стаб-хук без побочных перерендеров
export const useDataSync = () => {
  return {
    syncData: () => {},
    checkForUpdates: () => {},
    isSyncing: false,
    // Важно: не создавать новый Date() на каждом рендере — иначе бесконечный цикл эффектов
    lastSync: null as unknown as Date | null,
    isEnabled: true,
    enableSync: () => {},
    disableSync: () => {}
  }
}
