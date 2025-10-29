import React, { useState, useEffect } from 'react'
import { 
  ArrowPathIcon, 
  CheckCircleIcon, 
  ExclamationTriangleIcon,
  CloudIcon,
  WifiIcon
} from '@heroicons/react/24/outline'
import { clsx } from 'clsx'
import { useTheme } from '../contexts/ThemeContext'
import { useDataSync } from '../hooks/useDataSync'

interface SyncStatusProps {
  className?: string
}

export const SyncStatus: React.FC<SyncStatusProps> = ({ className }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle')
  const [syncMessage, setSyncMessage] = useState<string>('')
  
  const { isDark } = useTheme()
  const { lastSync, isEnabled } = useDataSync()

  // Отслеживаем статус онлайн/оффлайн
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Обновляем время последней синхронизации
  useEffect(() => {
    if (!lastSync || !(lastSync instanceof Date)) return
    if (Number.isNaN(lastSync.getTime())) return
    setLastSyncTime(lastSync)
    setSyncStatus('success')
    setSyncMessage('Данные синхронизированы')
    const t1 = setTimeout(() => {
      setSyncStatus('idle')
      setSyncMessage('')
    }, 3000)
    return () => clearTimeout(t1)
  }, [lastSync])

  // Отслеживаем изменения в localStorage для показа уведомлений о синхронизации
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'km_sync_data' && event.newValue) {
        setSyncStatus('syncing')
        setSyncMessage('Синхронизация данных...')
        
        setTimeout(() => {
          setSyncStatus('success')
          setSyncMessage('Новые данные получены')
          
          setTimeout(() => {
            setSyncStatus('idle')
            setSyncMessage('')
          }, 2000)
        }, 500)
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  const formatLastSync = () => {
    if (!lastSyncTime) return 'Никогда'
    
    const now = new Date()
    const diff = now.getTime() - lastSyncTime.getTime()
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (seconds < 60) return 'Только что'
    if (minutes < 60) return `${minutes} мин назад`
    if (hours < 24) return `${hours} ч назад`
    
    return lastSyncTime.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusIcon = () => {
    if (!isOnline) {
      return <WifiIcon className="h-4 w-4 text-red-500" />
    }
    
    switch (syncStatus) {
      case 'syncing':
        return <ArrowPathIcon className="h-4 w-4 text-blue-500 animate-spin" />
      case 'success':
        return <CheckCircleIcon className="h-4 w-4 text-green-500" />
      case 'error':
        return <ExclamationTriangleIcon className="h-4 w-4 text-yellow-500" />
      default:
        return <CloudIcon className="h-4 w-4 text-gray-500" />
    }
  }

  const getStatusText = () => {
    if (!isOnline) return 'Оффлайн'
    if (!isEnabled) return 'Синхронизация отключена'
    
    // Если есть сообщение, показываем его
    if (syncMessage) return syncMessage
    
    switch (syncStatus) {
      case 'syncing':
        return 'Синхронизация...'
      case 'success':
        return 'Синхронизировано'
      case 'error':
        return 'Ошибка синхронизации'
      default:
        return 'Готов к синхронизации'
    }
  }

  const getStatusColor = () => {
    if (!isOnline) return 'text-red-500'
    if (!isEnabled) return 'text-gray-500'
    
    switch (syncStatus) {
      case 'syncing':
        return 'text-blue-500'
      case 'success':
        return 'text-green-500'
      case 'error':
        return 'text-yellow-500'
      default:
        return isDark ? 'text-gray-400' : 'text-gray-600'
    }
  }

  return (
    <div className={clsx(
      'flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs',
      isDark ? 'bg-gray-800/50' : 'bg-gray-100/50',
      className
    )}>
      {getStatusIcon()}
      <span className={clsx('font-medium', getStatusColor())}>
        {getStatusText()}
      </span>
      {lastSyncTime && (
        <span className={clsx(
          'text-xs',
          isDark ? 'text-gray-500' : 'text-gray-400'
        )}>
          • {formatLastSync()}
        </span>
      )}
    </div>
  )
}



















