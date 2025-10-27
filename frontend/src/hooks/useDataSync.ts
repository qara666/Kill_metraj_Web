import { useEffect, useRef, useCallback } from 'react'
import { useExcelData } from '../contexts/ExcelDataContext'
import { dataSharingUtils, ShareableData } from '../utils/dataSharing'

interface UseDataSyncOptions {
  syncInterval?: number // Интервал синхронизации в миллисекундах
  enabled?: boolean // Включена ли синхронизация
}

export const useDataSync = (options: UseDataSyncOptions = {}) => {
  const { syncInterval = 5000, enabled = true } = options // Установили интервал 5 секунд
  const { excelData, routes, updateExcelData, updateRouteData } = useExcelData()
  const lastSyncRef = useRef<number>(0)
  const syncKeyRef = useRef<string>('')

  // Генерируем уникальный ключ для синхронизации
  const generateSyncKey = useCallback(() => {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2)
    return `km_sync_${timestamp}_${random}`
  }, [])

  // Инициализируем ключ синхронизации
  useEffect(() => {
    if (!syncKeyRef.current) {
      syncKeyRef.current = generateSyncKey()
    }
  }, [generateSyncKey])

  // Функция для сохранения данных в localStorage с меткой времени
  const saveDataToSync = useCallback((data: ShareableData) => {
    try {
      // Сохраняем в основные ключи
      if (data.excelData) {
        localStorage.setItem('km_dashboard_processed_data', JSON.stringify(data.excelData))
      }
      if (data.routes && Array.isArray(data.routes)) {
        localStorage.setItem('km_routes', JSON.stringify(data.routes))
      }
      
      // Сохраняем для синхронизации
      const syncData = {
        ...data,
        syncKey: syncKeyRef.current,
        lastModified: Date.now()
      }
      
      localStorage.setItem('km_sync_data', JSON.stringify(syncData))
      lastSyncRef.current = Date.now()
      console.log('Данные сохранены для синхронизации:', {
        orders: data.excelData?.orders?.length || 0,
        couriers: data.excelData?.couriers?.length || 0,
        routes: data.routes?.length || 0
      })
    } catch (error) {
      console.error('Ошибка сохранения данных для синхронизации:', error)
    }
  }, [])

  // Функция для загрузки данных из localStorage
  const loadDataFromSync = useCallback((): ShareableData | null => {
    try {
      const stored = localStorage.getItem('km_sync_data')
      if (!stored) return null
      
      const syncData = JSON.parse(stored)
      if (!syncData || !dataSharingUtils.validateData(syncData)) {
        return null
      }
      
      return syncData
    } catch (error) {
      console.error('Ошибка загрузки данных синхронизации:', error)
      return null
    }
  }, [])

  // Функция для проверки обновлений
  const checkForUpdates = useCallback(() => {
    if (!enabled) return

    const storedData = loadDataFromSync()
    if (!storedData) return

    // Проверяем, не наши ли это данные
    if (storedData.syncKey === syncKeyRef.current) return

    // Проверяем, новее ли данные
    if (storedData.lastModified && storedData.lastModified <= lastSyncRef.current) return

    console.log('Обнаружены новые данные для синхронизации:', {
      syncKey: storedData.syncKey,
      lastModified: storedData.lastModified ? new Date(storedData.lastModified).toLocaleString() : 'Неизвестно',
      ordersCount: storedData.excelData?.orders?.length || 0,
      routesCount: storedData.routes?.length || 0
    })

    // Обновляем данные
    if (storedData.excelData) {
      updateExcelData(storedData.excelData)
      // Сохраняем в основной ключ ExcelDataContext
      localStorage.setItem('km_dashboard_processed_data', JSON.stringify(storedData.excelData))
      console.log('Excel данные синхронизированы и сохранены в localStorage')
    }
    if (storedData.routes && Array.isArray(storedData.routes)) {
      updateRouteData(storedData.routes)
      // Сохраняем маршруты отдельно
      localStorage.setItem('km_routes', JSON.stringify(storedData.routes))
      console.log('Маршруты синхронизированы и сохранены в localStorage:', storedData.routes.length)
    }

        lastSyncRef.current = storedData.lastModified || Date.now()
    console.log('Данные успешно синхронизированы с внешним источником')
    
    // Уведомляем пользователя о синхронизации без перезагрузки страницы
    console.log('Новые данные получены и обновлены в интерфейсе')
  }, [enabled, loadDataFromSync, updateExcelData, updateRouteData])

  // Сохраняем данные при изменении
  useEffect(() => {
    if (!enabled || !excelData || !routes || !Array.isArray(routes)) return

    const shareableData: ShareableData = {
      excelData,
      routes,
      timestamp: Date.now(),
      version: '1.0.0'
    }

    saveDataToSync(shareableData)
  }, [excelData, routes, enabled, saveDataToSync])

  // Настраиваем интервал синхронизации
  useEffect(() => {
    if (!enabled) return

    const interval = setInterval(checkForUpdates, syncInterval)
    return () => clearInterval(interval)
  }, [enabled, syncInterval, checkForUpdates])

  // Проверяем обновления при загрузке страницы
  useEffect(() => {
    if (enabled) {
      checkForUpdates()
    }
  }, [enabled, checkForUpdates])

  // Добавляем обработчик событий localStorage для мгновенной синхронизации
  useEffect(() => {
    if (!enabled) return

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'km_sync_data' && event.newValue) {
        console.log('Обнаружено изменение в localStorage, проверяем обновления...')
        setTimeout(checkForUpdates, 100) // Небольшая задержка для стабильности
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [enabled, checkForUpdates])

  return {
    syncKey: syncKeyRef.current,
    lastSync: lastSyncRef.current,
    isEnabled: enabled
  }
}





