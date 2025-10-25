import { useState, useEffect, useCallback, useRef } from 'react'
import { useExcelData } from '../contexts/ExcelDataContext'
import CloudSyncService from '../services/cloudSync'
import toast from 'react-hot-toast'

interface UseCloudSyncOptions {
  enabled?: boolean
  syncInterval?: number
  apiUrl?: string
}

export const useCloudSync = (options: UseCloudSyncOptions = {}) => {
  const { enabled = false, syncInterval = 10000, apiUrl } = options
  const { excelData, routes, updateExcelData, updateRouteData } = useExcelData()
  const [isConnected, setIsConnected] = useState(false)
  const [lastSync, setLastSync] = useState<string>('')
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle')
  
  const cloudSyncRef = useRef<CloudSyncService | null>(null)
  // const lastSyncRef = useRef<number>(0) // Не используется

  // Инициализируем облачную синхронизацию
  useEffect(() => {
    if (enabled) {
      cloudSyncRef.current = new CloudSyncService({
        apiUrl,
        enabled: true
      })
      setIsConnected(true)
      console.log('Облачная синхронизация включена')
    } else {
      setIsConnected(false)
      console.log('Облачная синхронизация отключена')
    }
  }, [enabled, apiUrl])

  // Сохраняем данные в облако
  const saveToCloud = useCallback(async (data: any) => {
    if (!cloudSyncRef.current || !enabled) return false

    try {
      setSyncStatus('syncing')
      const success = await cloudSyncRef.current.saveData(data)
      
      if (success) {
        setSyncStatus('idle')
        setLastSync(new Date().toLocaleString())
        console.log('Данные сохранены в облако')
        return true
      } else {
        setSyncStatus('error')
        console.error('Ошибка сохранения в облако')
        return false
      }
    } catch (error) {
      setSyncStatus('error')
      console.error('Ошибка облачной синхронизации:', error)
      return false
    }
  }, [enabled])

  // Получаем данные из облака
  const loadFromCloud = useCallback(async () => {
    if (!cloudSyncRef.current || !enabled) return null

    try {
      setSyncStatus('syncing')
      const data = await cloudSyncRef.current.getData()
      
      if (data) {
        // Обновляем данные в контексте
        if (data.excelData) {
          updateExcelData(data.excelData)
        }
        if (data.routes) {
          updateRouteData(data.routes)
        }
        
        setSyncStatus('idle')
        setLastSync(new Date().toLocaleString())
        console.log('Данные загружены из облака')
        return data
      } else {
        setSyncStatus('idle')
        console.log('Нет данных в облаке')
        return null
      }
    } catch (error) {
      setSyncStatus('error')
      console.error('Ошибка загрузки из облака:', error)
      return null
    }
  }, [enabled, updateExcelData, updateRouteData])

  // Проверяем обновления
  const checkForUpdates = useCallback(async () => {
    if (!cloudSyncRef.current || !enabled) return

    try {
      const updates = await cloudSyncRef.current.checkUpdates()
      
      if (updates) {
        // Обновляем данные в контексте
        if (updates.excelData) {
          updateExcelData(updates.excelData)
        }
        if (updates.routes) {
          updateRouteData(updates.routes)
        }
        
        setLastSync(new Date().toLocaleString())
        toast.success('Получены новые данные из облака')
        console.log('Данные обновлены из облака')
      }
    } catch (error) {
      console.error('Ошибка проверки обновлений:', error)
    }
  }, [enabled, updateExcelData, updateRouteData])

  // Поделиться данными
  const shareData = useCallback(async (data: any) => {
    if (!cloudSyncRef.current || !enabled) return null

    try {
      const shareUrl = await cloudSyncRef.current.shareData(data)
      
      if (shareUrl) {
        toast.success('Ссылка для sharing создана')
        console.log('Ссылка для sharing:', shareUrl)
        return shareUrl
      } else {
        toast.error('Ошибка создания ссылки для sharing')
        return null
      }
    } catch (error) {
      console.error('Ошибка sharing данных:', error)
      toast.error('Ошибка sharing данных')
      return null
    }
  }, [enabled])

  // Импортировать данные по ссылке
  const importData = useCallback(async (shareId: string) => {
    if (!cloudSyncRef.current || !enabled) return null

    try {
      const data = await cloudSyncRef.current.importData(shareId)
      
      if (data) {
        // Обновляем данные в контексте
        if (data.excelData) {
          updateExcelData(data.excelData)
        }
        if (data.routes) {
          updateRouteData(data.routes)
        }
        
        toast.success('Данные импортированы из облака')
        console.log('Данные импортированы из облака')
        return data
      } else {
        toast.error('Ошибка импорта данных')
        return null
      }
    } catch (error) {
      console.error('Ошибка импорта данных:', error)
      toast.error('Ошибка импорта данных')
      return null
    }
  }, [enabled, updateExcelData, updateRouteData])

  // Автоматическая синхронизация при изменении данных
  useEffect(() => {
    if (!enabled || !cloudSyncRef.current || !excelData || !routes) return

    const shareableData = {
      excelData,
      routes,
      timestamp: Date.now(),
      version: '1.0.0'
    }

    // Сохраняем в облако с задержкой
    const timeoutId = setTimeout(() => {
      saveToCloud(shareableData)
    }, 2000)

    return () => clearTimeout(timeoutId)
  }, [excelData, routes, enabled, saveToCloud])

  // Периодическая проверка обновлений
  useEffect(() => {
    if (!enabled || !cloudSyncRef.current) return

    const interval = setInterval(checkForUpdates, syncInterval)
    return () => clearInterval(interval)
  }, [enabled, syncInterval, checkForUpdates])

  return {
    isConnected,
    lastSync,
    syncStatus,
    saveToCloud,
    loadFromCloud,
    checkForUpdates,
    shareData,
    importData
  }
}

