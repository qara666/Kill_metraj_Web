import { useState, useEffect, useCallback } from 'react'
import { CloudSyncService } from '../services/cloudSync'

interface CloudSyncState {
  isConnected: boolean
  lastSync: number | null
  syncStatus: 'idle' | 'syncing' | 'error' | 'success'
  error: string | null
}

interface UseCloudSyncOptions {
  enabled: boolean
  apiUrl: string
  syncInterval?: number
}

export const useCloudSync = (options: UseCloudSyncOptions) => {
  const { enabled, apiUrl, syncInterval = 30000 } = options
  
  const [state, setState] = useState<CloudSyncState>({
    isConnected: false,
    lastSync: null,
    syncStatus: 'idle',
    error: null
  })

  const cloudSyncService = new CloudSyncService(apiUrl)

  // Проверяем подключение к облаку
  const checkConnection = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, syncStatus: 'syncing' }))
      
      // Простая проверка подключения
      const response = await fetch(`${apiUrl}/health`, {
        method: 'GET',
        timeout: 5000
      } as any)
      
      if (response.ok) {
        setState(prev => ({
          ...prev,
          isConnected: true,
          syncStatus: 'success',
          error: null
        }))
      } else {
        throw new Error('Сервер недоступен')
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isConnected: false,
        syncStatus: 'error',
        error: error instanceof Error ? error.message : 'Ошибка подключения'
      }))
    }
  }, [apiUrl])

  // Синхронизация данных
  const shareData = useCallback(async (data: any) => {
    try {
      setState(prev => ({ ...prev, syncStatus: 'syncing' }))
      
      const result = await cloudSyncService.shareData(data)
      
      setState(prev => ({
        ...prev,
        lastSync: Date.now(),
        syncStatus: 'success',
        error: null
      }))
      
      return result
    } catch (error) {
      setState(prev => ({
        ...prev,
        syncStatus: 'error',
        error: error instanceof Error ? error.message : 'Ошибка синхронизации'
      }))
      throw error
    }
  }, [cloudSyncService])

  const importData = useCallback(async (shareId: string) => {
    try {
      setState(prev => ({ ...prev, syncStatus: 'syncing' }))
      
      const result = await cloudSyncService.importData(shareId)
      
      setState(prev => ({
        ...prev,
        lastSync: Date.now(),
        syncStatus: 'success',
        error: null
      }))
      
      return result
    } catch (error) {
      setState(prev => ({
        ...prev,
        syncStatus: 'error',
        error: error instanceof Error ? error.message : 'Ошибка импорта'
      }))
      throw error
    }
  }, [cloudSyncService])

  // Автоматическая проверка подключения
  useEffect(() => {
    if (enabled) {
      checkConnection()
      
      const interval = setInterval(checkConnection, syncInterval)
      return () => clearInterval(interval)
    }
  }, [enabled, checkConnection, syncInterval])

  return {
    ...state,
    shareData,
    importData,
    checkConnection
  }
}
