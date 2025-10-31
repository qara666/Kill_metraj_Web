import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { CogIcon, KeyIcon, MapIcon, ChevronDownIcon, ChevronUpIcon, TruckIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { CitySectorsEditor, CitySectors } from '../components/CitySectorsEditor'
import { localStorageUtils } from '../utils/localStorage'
import { validateGoogleMapsApiKey } from '../utils/apiKeyValidator'
import { useTheme } from '../contexts/ThemeContext'
import { useExcelData } from '../contexts/ExcelDataContext'
import { clsx } from 'clsx'

interface SettingsForm {
  googleMapsApiKey: string
  defaultStartAddress: string
  defaultEndAddress: string
  cityBias: '' | 'Киев' | 'Харьков' | 'Полтава' | 'Одесса'
  citySectors: CitySectors
  anomalyFilterEnabled: boolean
  anomalyMaxLegDistanceKm: number
  anomalyMaxTotalDistanceKm: number
  anomalyMaxAvgPerOrderKm: number
  addressQualityThreshold: number // Минимальный порог качества адреса (0-100)
  enableCoordinateValidation: boolean // Включить проверку координат
  enableAdaptiveThresholds: boolean // Включить адаптивные пороги
  courierVehicleMap: Record<string, 'car' | 'motorcycle'>
  maxCriticalRouteDistanceKm: number
}

const CourierVehicleEditor: React.FC<{
  value: Record<string, 'car' | 'motorcycle'>
  onChange: (map: Record<string, 'car' | 'motorcycle'>) => void
  isDark: boolean
  courierNames: string[]
}> = ({ value, onChange, isDark, courierNames }) => {
  const [isExpanded, setIsExpanded] = useState(false)

  const toggleType = (courierName: string) => {
    const currentType = value[courierName] || 'car'
    onChange({ ...value, [courierName]: currentType === 'car' ? 'motorcycle' : 'car' })
  }

  const sortedCouriers = [...courierNames].sort((a, b) => a.localeCompare(b, 'ru'))

  return (
    <div className={clsx('rounded-lg border', isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200')}>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={clsx(
          'w-full flex items-center justify-between p-4 transition-colors',
          isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
        )}
      >
        <div className="flex items-center space-x-3">
          <TruckIcon className={clsx('h-5 w-5', isDark ? 'text-gray-400' : 'text-gray-600')} />
          <span className={clsx('font-medium', isDark ? 'text-gray-200' : 'text-gray-900')}>
            Тип транспорта курьеров
          </span>
          <span className={clsx(
            'px-2 py-1 rounded-full text-xs font-medium',
            isDark ? 'bg-gray-700' : 'bg-gray-100'
          )}>
            {sortedCouriers.length}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUpIcon className={clsx('h-5 w-5', isDark ? 'text-gray-400' : 'text-gray-600')} />
        ) : (
          <ChevronDownIcon className={clsx('h-5 w-5', isDark ? 'text-gray-400' : 'text-gray-600')} />
        )}
      </button>

      {isExpanded && (
        <div className={clsx('border-t p-4', isDark ? 'border-gray-700' : 'border-gray-200')}>
          {sortedCouriers.length === 0 ? (
            <p className={clsx('text-sm text-center py-4', isDark ? 'text-gray-400' : 'text-gray-500')}>
              Загрузите Excel файл, чтобы курьеры появились здесь
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {sortedCouriers.map((courierName) => {
                const type = value[courierName] || 'car'
                const hasCustomType = value[courierName] !== undefined
                return (
                  <div
                    key={courierName}
                    className={clsx(
                      'flex items-center justify-between rounded-lg px-3 py-2 border transition-all',
                      isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleType(courierName)}
                      className="flex items-center space-x-2 flex-1 text-left"
                    >
                      <span className={clsx('font-medium truncate', isDark ? 'text-gray-200' : 'text-gray-900')}>
                        {courierName}
                      </span>
                      <span className={clsx(
                        'px-2 py-0.5 rounded-full text-xs font-medium',
                        type === 'car'
                          ? (isDark ? 'bg-green-600/20 text-green-300' : 'bg-green-100 text-green-800')
                          : (isDark ? 'bg-orange-600/20 text-orange-300' : 'bg-orange-100 text-orange-800')
                      )}>
                        {type === 'car' ? 'Авто' : 'Мото'}
                      </span>
                    </button>
                    {hasCustomType && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          const updated = { ...value }
                          delete updated[courierName]
                          onChange(updated)
                          localStorageUtils.removeCourierFromMap(courierName)
                        }}
                        className={clsx(
                          'ml-2 px-2 py-1 rounded text-xs transition-colors',
                          isDark 
                            ? 'bg-red-600/20 text-red-300 hover:bg-red-600/30' 
                            : 'bg-red-50 text-red-600 hover:bg-red-100'
                        )}
                        title="Удалить настройку типа (полностью из памяти)"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const CollapsibleSection: React.FC<{ isDark: boolean; icon: React.ReactNode; title: string; children: React.ReactNode }>
  = ({ isDark, icon, title, children }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  return (
    <div className={clsx('rounded-lg border', isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200')}>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={clsx('w-full flex items-center justify-between p-4 transition-colors', isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50')}
      >
        <div className="flex items-center space-x-3">
          <span className={clsx('h-5 w-5', isDark ? 'text-gray-400' : 'text-gray-600')}>{icon}</span>
          <span className={clsx('font-medium', isDark ? 'text-gray-200' : 'text-gray-900')}>{title}</span>
        </div>
        {isExpanded ? (
          <ChevronUpIcon className={clsx('h-5 w-5', isDark ? 'text-gray-400' : 'text-gray-600')} />
        ) : (
          <ChevronDownIcon className={clsx('h-5 w-5', isDark ? 'text-gray-400' : 'text-gray-600')} />
        )}
      </button>
      {isExpanded && (
        <div className={clsx('border-t p-4', isDark ? 'border-gray-700' : 'border-gray-200')}>
          {children}
        </div>
      )}
    </div>
  )
}

const CityBiasSection: React.FC<{ isDark: boolean; value: '' | 'Киев' | 'Харьков' | 'Полтава' | 'Одесса'; onChange: (v: '' | 'Киев' | 'Харьков' | 'Полтава' | 'Одесса') => void }>
  = ({ isDark, value, onChange }) => {
  const [isExpanded, setIsExpanded] = useState(true)
  return (
    <div className={clsx('rounded-lg border', isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200')}>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={clsx('w-full flex items-center justify-between p-4 transition-colors', isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50')}
      >
        <div className="flex items-center space-x-3">
          <MapIcon className={clsx('h-5 w-5', isDark ? 'text-gray-400' : 'text-gray-600')} />
          <span className={clsx('font-medium', isDark ? 'text-gray-200' : 'text-gray-900')}>Город для маршрутов (обязателен)</span>
        </div>
        {isExpanded ? (
          <ChevronUpIcon className={clsx('h-5 w-5', isDark ? 'text-gray-400' : 'text-gray-600')} />
        ) : (
          <ChevronDownIcon className={clsx('h-5 w-5', isDark ? 'text-gray-400' : 'text-gray-600')} />
        )}
      </button>
      {isExpanded && (
        <div className={clsx('border-t p-4', isDark ? 'border-gray-700' : 'border-gray-200')}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="text-sm">Выберите город</label>
            <select
              className="input md:col-span-2"
              value={value}
              onChange={(e) => onChange(e.target.value as any)}
            >
              <option value="">— Не выбран —</option>
              <option value="Киев">Киев</option>
              <option value="Харьков">Харьков</option>
              <option value="Полтава">Полтава</option>
              <option value="Одесса">Одесса</option>
            </select>
          </div>
          <p className={clsx('mt-2 text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>
            Расчёт и геокодирование будут учитывать только выбранный город. Без выбора города создание маршрута запрещено.
          </p>
        </div>
      )}
    </div>
  )
}

export const Settings: React.FC = () => {
  const { isDark } = useTheme()
  const { excelData } = useExcelData()
  const [isTestingApiKey, setIsTestingApiKey] = useState(false)
  const [apiKeyStatus, setApiKeyStatus] = useState<'unknown' | 'valid' | 'invalid'>('unknown')
  const [apiKeyDetails, setApiKeyDetails] = useState<string>('')

  // Извлекаем имена курьеров из Excel данных
  const courierNames = React.useMemo(() => {
    if (!excelData?.couriers || !Array.isArray(excelData.couriers)) {
      return []
    }
    return excelData.couriers.map((courier: any) => courier.name || courier).filter(Boolean)
  }, [excelData?.couriers])

  const { register, handleSubmit, watch, setValue } = useForm<SettingsForm>({
    defaultValues: {
      googleMapsApiKey: '',
      defaultStartAddress: '',
      defaultEndAddress: '',
      cityBias: '',
      citySectors: {},
      anomalyFilterEnabled: true,
      anomalyMaxLegDistanceKm: 10,
      anomalyMaxTotalDistanceKm: 35,
      anomalyMaxAvgPerOrderKm: 25,
      addressQualityThreshold: 60,
      enableCoordinateValidation: true,
      enableAdaptiveThresholds: true,
      courierVehicleMap: {},
      maxCriticalRouteDistanceKm: 120
    }
  })

  // Safe watches
  const googleMapsApiKey = watch('googleMapsApiKey') || ''
  const courierVehicleMap = watch('courierVehicleMap') || {}

  // Load settings from localStorage on component mount
  useEffect(() => {
    const settings = localStorageUtils.getAllSettings()
    
    setValue('googleMapsApiKey', settings.googleMapsApiKey)
    setValue('defaultStartAddress', settings.defaultStartAddress)
    setValue('defaultEndAddress', settings.defaultEndAddress)
    setValue('cityBias', settings.cityBias || '')
    setValue('citySectors', settings.citySectors || {})
    // Аномалии (с дефолтами)
    setValue('anomalyFilterEnabled', settings.anomalyFilterEnabled ?? true)
    setValue('anomalyMaxLegDistanceKm', settings.anomalyMaxLegDistanceKm ?? 10)
    setValue('anomalyMaxTotalDistanceKm', settings.anomalyMaxTotalDistanceKm ?? 35)
    setValue('anomalyMaxAvgPerOrderKm', settings.anomalyMaxAvgPerOrderKm ?? 25)
    setValue('addressQualityThreshold', settings.addressQualityThreshold ?? 60)
    setValue('enableCoordinateValidation', settings.enableCoordinateValidation ?? true)
    setValue('enableAdaptiveThresholds', settings.enableAdaptiveThresholds ?? true)
    setValue('courierVehicleMap', settings.courierVehicleMap ?? {})
    setValue('maxCriticalRouteDistanceKm', settings.maxCriticalRouteDistanceKm ?? 120)
    
    // Check if API key is valid when loading
    if (settings.googleMapsApiKey) {
      checkApiKeyStatus(settings.googleMapsApiKey)
    }
  }, [setValue])

  const checkApiKeyStatus = async (apiKey: string) => {
    if (!apiKey.trim()) return
    
    try {
      const validationResult = validateGoogleMapsApiKey(apiKey)
      if (validationResult) {
        setApiKeyStatus('valid')
        setApiKeyDetails('OK')
      } else {
        setApiKeyStatus('invalid')
        setApiKeyDetails('Неизвестная ошибка')
      }
    } catch (error) {
      setApiKeyStatus('invalid')
      setApiKeyDetails(error instanceof Error ? error.message : 'Ошибка проверки')
    }
  }

  

  const testApiKey = async () => {
    if (!googleMapsApiKey.trim()) {
      toast.error('Пожалуйста, введите Google Maps API ключ')
      return
    }

    setIsTestingApiKey(true)
    try {
      const validationResult = validateGoogleMapsApiKey(googleMapsApiKey)
      if (validationResult) {
        setApiKeyStatus('valid')
        setApiKeyDetails('OK')
        // Save API key to localStorage when it's valid
        localStorageUtils.setApiKey(googleMapsApiKey)
        toast.success('✓ API ключ действителен и сохранен!')
      } else {
        setApiKeyStatus('invalid')
        setApiKeyDetails('Неизвестная ошибка')
        toast.error(`API ключ недействителен: Неизвестная ошибка`)
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

  // Persist courier vehicle map immediately when user toggles types
  useEffect(() => {
    if (Object.keys(courierVehicleMap).length > 0) {
      try {
        localStorageUtils.setCourierVehicleMap(courierVehicleMap)
      } catch {}
    }
  }, [courierVehicleMap])

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
        // Дополнительно очищаем сохраненные маршруты и связанные данные
        localStorage.removeItem('km_routes')
        localStorage.removeItem('km_excel_data')
        
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
          {/* City Bias */}
          <CityBiasSection isDark={isDark} value={watch('cityBias')} onChange={(v) => setValue('cityBias', v)} />

          {/* City Sectors (polygons) */}
          <CollapsibleSection
            isDark={isDark}
            icon={<MapIcon className="h-4 w-4" />}
            title="Сектор города (зона допустимых адресов)"
          >
            <CitySectorsEditor
              isDark={isDark}
              city={watch('cityBias')}
              value={watch('citySectors')}
              onChange={(next) => setValue('citySectors', next)}
            />
          </CollapsibleSection>
          {/* Фильтр аномалий маршрута (collapsible) */}
          <CollapsibleSection
            isDark={isDark}
            icon={<CogIcon className="h-4 w-4" />}
            title="Фильтр аномалий (расстояние)"
          >
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="inline-flex items-center space-x-2">
                <input type="checkbox" className="checkbox" {...register('anomalyFilterEnabled')} />
                <span className={clsx(isDark ? 'text-gray-200' : 'text-gray-800')}>Включить фильтр аномалий</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 col-span-1 md:col-span-2">
                <div>
                  <div className="text-xs mb-1">Макс. расстояние между точками (км)</div>
                  <input type="number" step="1" min="1" className="input" {...register('anomalyMaxLegDistanceKm', { valueAsNumber: true })} />
                </div>
                <div>
                  <div className="text-xs mb-1">Макс. общий километраж маршрута (км)</div>
                  <input type="number" step="1" min="1" className="input" {...register('anomalyMaxTotalDistanceKm', { valueAsNumber: true })} />
                </div>
                <div>
                  <div className="text-xs mb-1">Макс. среднее на заказ (км)</div>
                  <input type="number" step="1" min="1" className="input" {...register('anomalyMaxAvgPerOrderKm', { valueAsNumber: true })} />
                </div>
              </div>
            </div>
              {/* Расширенная фильтрация (перенесено сюда) */}
            <div className="mt-4 space-y-3">
              <div className="flex items-center">
                <input type="checkbox" className="checkbox" {...register('enableCoordinateValidation')} />
                <span className="ml-2 text-sm">Проверять координаты на разумность</span>
              </div>
              <div className="flex items-center">
                <input type="checkbox" className="checkbox" {...register('enableAdaptiveThresholds')} />
                <span className="ml-2 text-sm">Использовать адаптивные пороги</span>
              </div>
              <div>
                <div className="text-xs mb-1">Минимальный порог качества адреса (0-100)</div>
                <input type="number" step="5" min="0" max="100" className="input" {...register('addressQualityThreshold', { valueAsNumber: true })} />
                <div className="text-xs text-gray-500 mt-1">Адреса с оценкой ниже этого порога будут помечены как подозрительные</div>
              </div>
            </div>
          </CollapsibleSection>
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

          {/* Тип транспорта для курьеров */}
          <div>
            <label className="label">
              <TruckIcon className="h-4 w-4 inline mr-2" />
              Тип транспорта курьеров
            </label>
            <p className={clsx('text-xs mb-3', isDark ? 'text-gray-400' : 'text-gray-500')}>
              Выберите тип транспорта для каждого курьера (сохраняется и применяется при загрузке Excel)
            </p>
            <CourierVehicleEditor value={watch('courierVehicleMap')} onChange={(map) => setValue('courierVehicleMap', map)} isDark={isDark} courierNames={courierNames} />
          </div>

          {/* Критический лимит для маршрута (collapsible) */}
          <CollapsibleSection
            isDark={isDark}
            icon={<ShieldCheckIcon className="h-4 w-4" />}
            title="Критический лимит для маршрута"
          >
            <div className="mt-2">
              <div className="text-xs mb-1">Крит. максимальное расстояние маршрута (км)</div>
              <input type="number" step="1" min="1" className="input" {...register('maxCriticalRouteDistanceKm', { valueAsNumber: true })} />
              <div className="text-xs text-gray-500 mt-1">
                Если маршрут превышает это значение — будет показан критический warning, маршрут НЕ будет пересчитан
              </div>
            </div>
          </CollapsibleSection>

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




























