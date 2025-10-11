import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { CogIcon, KeyIcon, MapIcon } from '@heroicons/react/24/outline'
import { LoadingSpinner } from '../components/LoadingSpinner'
import * as api from '../services/api'
import { localStorageUtils } from '../utils/localStorage'
import { validateGoogleMapsApiKey } from '../utils/apiKeyValidator'
import { useTheme } from '../contexts/ThemeContext'
import { clsx } from 'clsx'

interface SettingsForm {
  googleMapsApiKey: string
  defaultStartAddress: string
  defaultEndAddress: string
}

export const Settings: React.FC = () => {
  const { isDark } = useTheme()
  const [isTestingApiKey, setIsTestingApiKey] = useState(false)
  const [apiKeyStatus, setApiKeyStatus] = useState<'unknown' | 'valid' | 'invalid'>('unknown')
  const [apiKeyDetails, setApiKeyDetails] = useState<string>('')

  const { register, handleSubmit, watch, setValue } = useForm<SettingsForm>({
    defaultValues: {
      googleMapsApiKey: '',
      defaultStartAddress: 'Макеевская 7, Киев, Украина',
      defaultEndAddress: 'Макеевская 7, Киев, Украина'
    }
  })

  // Load settings from localStorage on component mount
  useEffect(() => {
    const settings = localStorageUtils.getAllSettings()
    
    setValue('googleMapsApiKey', settings.googleMapsApiKey)
    setValue('defaultStartAddress', settings.defaultStartAddress)
    setValue('defaultEndAddress', settings.defaultEndAddress)
    
    // Check if API key is valid when loading
    if (settings.googleMapsApiKey) {
      checkApiKeyStatus(settings.googleMapsApiKey)
    }
  }, [setValue])

  const checkApiKeyStatus = async (apiKey: string) => {
    if (!apiKey.trim()) return
    
    try {
      const validationResult = await validateGoogleMapsApiKey(apiKey)
      if (validationResult.isValid) {
        setApiKeyStatus('valid')
        setApiKeyDetails(validationResult.details?.status || 'OK')
      } else {
        setApiKeyStatus('invalid')
        setApiKeyDetails(validationResult.error || 'Неизвестная ошибка')
      }
    } catch (error) {
      setApiKeyStatus('invalid')
      setApiKeyDetails(error instanceof Error ? error.message : 'Ошибка проверки')
    }
  }

  const googleMapsApiKey = watch('googleMapsApiKey')

  const testApiKey = async () => {
    if (!googleMapsApiKey.trim()) {
      toast.error('Пожалуйста, введите Google Maps API ключ')
      return
    }

    setIsTestingApiKey(true)
    try {
      const validationResult = await validateGoogleMapsApiKey(googleMapsApiKey)
      if (validationResult.isValid) {
        setApiKeyStatus('valid')
        setApiKeyDetails(validationResult.details?.status || 'OK')
        // Save API key to localStorage when it's valid
        localStorageUtils.setApiKey(googleMapsApiKey)
        toast.success('✓ API ключ действителен и сохранен!')
      } else {
        setApiKeyStatus('invalid')
        setApiKeyDetails(validationResult.error || 'Неизвестная ошибка')
        toast.error(`API ключ недействителен: ${validationResult.error}`)
      }
    } catch (error) {
      setApiKeyStatus('invalid')
      toast.error(`Не удалось проверить API ключ: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`)
    } finally {
      setIsTestingApiKey(false)
    }
  }

  const onSubmit = (data: SettingsForm) => {
    // Save settings to localStorage
    localStorageUtils.setAllSettings(data)
    
    // Check API key status after saving
    if (data.googleMapsApiKey.trim()) {
      checkApiKeyStatus(data.googleMapsApiKey)
    }
    
    toast.success('Настройки успешно сохранены!')
  }

  const handleClearAllData = () => {
    if (window.confirm('Вы уверены, что хотите очистить все данные? Это действие нельзя отменить.')) {
      try {
        // Сохраняем Google Maps API Key перед очисткой
        const currentApiKey = localStorageUtils.getApiKey()
        
        // Очищаем все данные из localStorage
        localStorage.removeItem('km_dashboard_logs')
        localStorage.removeItem('km_dashboard_processed_data')
        localStorage.removeItem('km_dashboard_excel_logs')
        localStorage.removeItem('km_default_start_address')
        localStorage.removeItem('km_default_end_address')
        
        // Очищаем все настройки
        localStorageUtils.clearAllSettings()
        
        // Восстанавливаем Google Maps API Key
        if (currentApiKey) {
          localStorageUtils.setApiKey(currentApiKey)
        }
        
        toast.success('Все данные очищены!')
        
        // Перезагружаем страницу для полной очистки состояния
        window.location.reload()
      } catch (error) {
        console.error('Ошибка очистки данных:', error)
        toast.error('Ошибка при очистке данных')
      }
    }
  }

  return (
    <div className={clsx(
      'space-y-6 transition-colors duration-300',
      isDark ? 'text-gray-100' : 'text-gray-900'
    )}>
      {/* Header */}
      <div className={clsx(
        'rounded-lg shadow-sm border p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className={clsx(
              'text-2xl font-bold',
              isDark ? 'text-gray-100' : 'text-gray-900'
            )}>Настройки</h1>
            <p className={clsx(
              'mt-1 text-sm',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              Настройка приложения и API ключей
            </p>
          </div>
        </div>
      </div>

      {/* Settings Form */}
      <div className={clsx(
        'rounded-lg shadow-sm border p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Google Maps API Key */}
          <div>
            <label className="label">
              <KeyIcon className="h-4 w-4 inline mr-2" />
              Google Maps API Ключ
            </label>
            <div className="mt-1 flex rounded-md shadow-sm">
              <input
                type="password"
                className="input rounded-r-none"
                placeholder="Введите ваш Google Maps API ключ"
                {...register('googleMapsApiKey', { required: true })}
              />
              <button
                type="button"
                onClick={testApiKey}
                disabled={isTestingApiKey || !googleMapsApiKey.trim()}
                className="btn-outline rounded-l-none border-l-0"
              >
                {isTestingApiKey ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  'Проверить'
                )}
              </button>
            </div>
            {apiKeyStatus === 'valid' && (
              <div className="mt-1">
                <p className="text-sm text-green-600">✓ API ключ действителен</p>
                {apiKeyDetails && (
                  <p className="text-xs text-gray-500">Статус: {apiKeyDetails}</p>
                )}
              </div>
            )}
            {apiKeyStatus === 'invalid' && (
              <div className="mt-1">
                <p className="text-sm text-red-600">✗ API ключ недействителен</p>
                {apiKeyDetails && (
                  <p className="text-xs text-gray-500">Ошибка: {apiKeyDetails}</p>
                )}
              </div>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Необходим для геокодирования адресов и расчета маршрутов. Получите API ключ в{' '}
              <a 
                href="https://console.cloud.google.com/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-500"
              >
                Google Cloud Console
              </a>
            </p>
          </div>

          {/* Default Addresses */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">
                <MapIcon className="h-4 w-4 inline mr-2" />
                Адрес начала по умолчанию
              </label>
              <input
                type="text"
                className="input"
                placeholder="Введите адрес начала по умолчанию"
                {...register('defaultStartAddress')}
              />
              <p className="mt-1 text-xs text-gray-500">
                Точка начала по умолчанию для всех маршрутов
              </p>
            </div>

            <div>
              <label className="label">
                <MapIcon className="h-4 w-4 inline mr-2" />
                Адрес окончания по умолчанию
              </label>
              <input
                type="text"
                className="input"
                placeholder="Введите адрес окончания по умолчанию"
                {...register('defaultEndAddress')}
              />
              <p className="mt-1 text-xs text-gray-500">
                Точка окончания по умолчанию для всех маршрутов
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between">
            <button 
              type="button" 
              onClick={handleClearAllData}
              className="btn-danger"
            >
              <CogIcon className="h-4 w-4 mr-2" />
              Очистить все данные
            </button>
            <button type="submit" className="btn-primary">
              <CogIcon className="h-4 w-4 mr-2" />
              Сохранить настройки
            </button>
          </div>
        </form>
      </div>

    </div>
  )
}
