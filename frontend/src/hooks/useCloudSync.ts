import { useState, useEffect, useCallback } from 'react'
import { cloudSyncService } from '../services/cloudSync'

export const useCloudSync = () => {
  const [isConnected, setIsConnected] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle')

  useEffect(() => {
    checkConnection()
  }, [])

  const checkConnection = async () => {
    try {
      const response = await fetch('http://localhost:5001/health')
      setIsConnected(response.ok)
    } catch (error) {
      setIsConnected(false)
    }
  }

  const shareData = useCallback(async (data: any): Promise<string> => {
    setSyncStatus('syncing')
    try {
      const shareId = await cloudSyncService.shareData(data)
      setSyncStatus('idle')
      return shareId
    } catch (error) {
      setSyncStatus('error')
      throw error
    }
  }, [])

  const importData = useCallback(async (shareId: string): Promise<any> => {
    setSyncStatus('syncing')
    try {
      const data = await cloudSyncService.importData(shareId)
      setSyncStatus('idle')
      return data
    } catch (error) {
      setSyncStatus('error')
      throw error
    }
  }, [])

  return {
    isConnected,
    syncStatus,
    shareData,
    importData,
    checkConnection
  }
}

