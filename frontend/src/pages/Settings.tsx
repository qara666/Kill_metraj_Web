import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { CogIcon, KeyIcon, MapIcon } from '@heroicons/react/24/outline'
import { LoadingSpinner } from '../components/LoadingSpinner'
import * as api from '../services/api'
import { localStorageUtils } from '../utils/localStorage'

interface SettingsForm {
  googleMapsApiKey: string
  defaultStartAddress: string
  defaultEndAddress: string
}

export const Settings: React.FC = () => {
  const [isTestingApiKey, setIsTestingApiKey] = useState(false)
  const [apiKeyStatus, setApiKeyStatus] = useState<'unknown' | 'valid' | 'invalid'>('unknown')

  const { register, handleSubmit, watch, setValue } = useForm<SettingsForm>({
    defaultValues: {
      googleMapsApiKey: '',
      defaultStartAddress: 'Макіївська 7, Київ, Україна',
      defaultEndAddress: 'Макіївська 7, Київ, Україна'
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
      const result = await api.uploadApi.testApiKey(apiKey)
      if (result.data?.isValid) {
        setApiKeyStatus('valid')
      } else {
        setApiKeyStatus('invalid')
      }
    } catch (error) {
      setApiKeyStatus('invalid')
    }
  }

  const googleMapsApiKey = watch('googleMapsApiKey')

  const testApiKey = async () => {
    if (!googleMapsApiKey.trim()) {
      toast.error('Please enter a Google Maps API key')
      return
    }

    setIsTestingApiKey(true)
    try {
      const result = await api.uploadApi.testApiKey(googleMapsApiKey)
      if (result.data?.isValid) {
        setApiKeyStatus('valid')
        // Save API key to localStorage when it's valid
        localStorageUtils.setApiKey(googleMapsApiKey)
        toast.success('API key is valid and saved!')
      } else {
        setApiKeyStatus('invalid')
        toast.error('API key is invalid or quota exceeded')
      }
    } catch (error) {
      setApiKeyStatus('invalid')
      toast.error('Failed to test API key')
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
    
    toast.success('Settings saved successfully!')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            <p className="mt-1 text-sm text-gray-600">
              Configure application settings and API keys
            </p>
          </div>
        </div>
      </div>

      {/* Settings Form */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Google Maps API Key */}
          <div>
            <label className="label">
              <KeyIcon className="h-4 w-4 inline mr-2" />
              Google Maps API Key
            </label>
            <div className="mt-1 flex rounded-md shadow-sm">
              <input
                type="password"
                className="input rounded-r-none"
                placeholder="Enter your Google Maps API key"
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
                  'Test'
                )}
              </button>
            </div>
            {apiKeyStatus === 'valid' && (
              <p className="mt-1 text-sm text-success-600">✓ API key is valid</p>
            )}
            {apiKeyStatus === 'invalid' && (
              <p className="mt-1 text-sm text-danger-600">✗ API key is invalid</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Required for geocoding addresses and calculating routes. Get your API key from{' '}
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
                Default Start Address
              </label>
              <input
                type="text"
                className="input"
                placeholder="Enter default start address"
                {...register('defaultStartAddress')}
              />
              <p className="mt-1 text-xs text-gray-500">
                Default starting point for all routes
              </p>
            </div>

            <div>
              <label className="label">
                <MapIcon className="h-4 w-4 inline mr-2" />
                Default End Address
              </label>
              <input
                type="text"
                className="input"
                placeholder="Enter default end address"
                {...register('defaultEndAddress')}
              />
              <p className="mt-1 text-xs text-gray-500">
                Default ending point for all routes
              </p>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button type="submit" className="btn-primary">
              <CogIcon className="h-4 w-4 mr-2" />
              Save Settings
            </button>
          </div>
        </form>
      </div>

      {/* API Setup Instructions */}
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
        <h3 className="text-lg font-medium text-blue-900 mb-4">
          Google Maps API Setup
        </h3>
        <div className="text-sm text-blue-800 space-y-2">
          <p>To use this application, you need to set up a Google Maps API key:</p>
          <ol className="list-decimal list-inside space-y-1 ml-4">
            <li>Go to <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="underline">Google Cloud Console</a></li>
            <li>Create a new project or select an existing one</li>
            <li>Enable the following APIs:
              <ul className="list-disc list-inside ml-4 mt-1">
                <li>Geocoding API</li>
                <li>Directions API</li>
                <li>Maps JavaScript API</li>
              </ul>
            </li>
            <li>Create credentials (API Key)</li>
            <li>Restrict the API key to your domain for security</li>
            <li>Enter the API key in the field above</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
