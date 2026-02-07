import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { CogIcon, KeyIcon, MapIcon, ShieldCheckIcon, ArrowPathIcon, CloudArrowUpIcon, TrashIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { parseKML } from '../utils/maps/kmlParser'
import { LoadingSpinner } from '../components/shared/LoadingSpinner'
import { DashboardSettingsPanel } from '../components/autoplanner/DashboardSettingsPanel'
import { localStorageUtils } from '../utils/ui/localStorage'
import { validateGoogleMapsApiKey } from '../utils/api/apiKeyValidator'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { clsx } from 'clsx'
import { CityBiasSection } from '../components/zone/CityBiasSection'
import { CollapsibleSection } from '../components/shared/CollapsibleSection'
import { KmlPreviewMap } from '../components/zone/KmlPreviewMap'
import { authService } from '../utils/auth/authService'


interface SettingsForm {
  googleMapsApiKey: string
  mapboxToken: string // Токен Mapbox для отслеживания пробок
  defaultStartAddress: string
  defaultEndAddress: string
  cityBias: '' | 'Киев' | 'Харьков' | 'Полтава' | 'Одесса'
  anomalyFilterEnabled: boolean
  anomalyMaxLegDistanceKm: number
  anomalyMaxTotalDistanceKm: number
  anomalyMaxAvgPerOrderKm: number
  addressQualityThreshold: number // Минимальный порог качества адреса (0-100)
  enableCoordinateValidation: boolean // Включить проверку координат
  enableAdaptiveThresholds: boolean // Включить адаптивные пороги
  fastopertorEndpoint: string
  enableFastopertorApi: boolean
  mapStyle: 'standard' | 'silver' | 'retro' | 'dark' | 'night' | 'aubergine'
  maxCriticalRouteDistanceKm: number
  fastopertorApiUrl: string
  fastopertorApiKey: string
  kmlData: any | null
  kmlSourceUrl: string
  lastKmlSync: string | null
  autoSyncKml: boolean
  selectedHubs: string[]
  selectedZones: string[]
}



export const Settings: React.FC = () => {
  const { isDark } = useTheme()
  const { isAdmin, user } = useAuth()
  const canModify = user?.canModifySettings !== false
  const [isTestingApiKey, setIsTestingApiKey] = useState(false)
  const [apiKeyStatus, setApiKeyStatus] = useState<'unknown' | 'valid' | 'invalid'>('unknown')
  const [apiKeyDetails, setApiKeyDetails] = useState<string>('')
  const [zoneSearchTerm, setZoneSearchTerm] = useState('')


  const { register, handleSubmit, watch, setValue } = useForm<SettingsForm>({
    defaultValues: {
      googleMapsApiKey: '',
      mapboxToken: '', // Пустое поле по умолчанию
      defaultStartAddress: '',
      defaultEndAddress: '',
      cityBias: '',
      anomalyFilterEnabled: true,
      anomalyMaxLegDistanceKm: 10,
      anomalyMaxTotalDistanceKm: 35,
      anomalyMaxAvgPerOrderKm: 25,
      addressQualityThreshold: 60,
      enableCoordinateValidation: true,
      enableAdaptiveThresholds: true,
      maxCriticalRouteDistanceKm: 120,
      fastopertorApiUrl: '',
      fastopertorApiKey: '',
      fastopertorEndpoint: '',
      enableFastopertorApi: false,
      mapStyle: 'standard',
      kmlData: null,
      kmlSourceUrl: '',
      lastKmlSync: null,
      autoSyncKml: false
    }
  })

  // Safe watches
  const googleMapsApiKey = watch('googleMapsApiKey') || ''

  const checkApiKeyStatus = async (apiKey: string) => {
    if (!apiKey.trim()) return

    try {
      const validationResult = validateGoogleMapsApiKey(apiKey)
      if (validationResult) {
        setApiKeyStatus('valid')
        setApiKeyDetails('Ключ активен')
      } else {
        setApiKeyStatus('invalid')
        setApiKeyDetails('Неизвестная ошибка')
      }
    } catch (error) {
      setApiKeyStatus('invalid')
      setApiKeyDetails(error instanceof Error ? error.message : 'Ошибка проверки')
    }
  }

  // Load settings from localStorage on component mount
  useEffect(() => {
    const settings = localStorageUtils.getAllSettings()

    setValue('googleMapsApiKey', settings.googleMapsApiKey)
    const savedMapboxToken = localStorage.getItem('km_mapbox_token')
    setValue('mapboxToken', (savedMapboxToken || settings.mapboxToken || '').trim())
    setValue('defaultStartAddress', settings.defaultStartAddress)
    setValue('defaultEndAddress', settings.defaultEndAddress)
    setValue('cityBias', settings.cityBias || '')
    setValue('anomalyFilterEnabled', settings.anomalyFilterEnabled ?? true)
    setValue('anomalyMaxLegDistanceKm', settings.anomalyMaxLegDistanceKm ?? 10)
    setValue('anomalyMaxTotalDistanceKm', settings.anomalyMaxTotalDistanceKm ?? 35)
    setValue('anomalyMaxAvgPerOrderKm', settings.anomalyMaxAvgPerOrderKm ?? 25)
    setValue('addressQualityThreshold', settings.addressQualityThreshold ?? 60)
    setValue('enableCoordinateValidation', settings.enableCoordinateValidation ?? true)
    setValue('enableAdaptiveThresholds', settings.enableAdaptiveThresholds ?? true)
    setValue('enableAdaptiveThresholds', settings.enableAdaptiveThresholds ?? true)
    setValue('mapStyle', settings.mapStyle || 'standard')
    setValue('maxCriticalRouteDistanceKm', settings.maxCriticalRouteDistanceKm ?? 120)
    setValue('kmlData', settings.kmlData || null)
    setValue('kmlSourceUrl', settings.kmlSourceUrl || '')
    setValue('lastKmlSync', settings.lastKmlSync || null)
    setValue('autoSyncKml', settings.autoSyncKml ?? false)
    setValue('selectedHubs', settings.selectedHubs || [])
    setValue('selectedZones', settings.selectedZones || [])

    if (settings.googleMapsApiKey) {
      checkApiKeyStatus(settings.googleMapsApiKey)
    }

    // Auto-sync KML if enabled
    if (settings.autoSyncKml && settings.kmlSourceUrl) {
      syncKmlFromUrl(settings.kmlSourceUrl)
    }
  }, [setValue])

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
        setApiKeyDetails('Ключ активен')
        localStorageUtils.setApiKey(googleMapsApiKey)
        toast.success(' API ключ действителен и сохранен!')
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


  const onSubmit = async (data: SettingsForm) => {
    // Нормализуем и сохраняем локально немедленно (Optimistic UI)
    const normalizedToken = (data.mapboxToken || '').trim()
    const normalizedData = { ...data, mapboxToken: normalizedToken }

    // Save locally
    localStorageUtils.setAllSettings(normalizedData)
    if (normalizedToken) {
      localStorage.setItem('km_mapbox_token', normalizedToken)
    } else {
      localStorage.removeItem('km_mapbox_token')
    }

    // Сообщаем об успехе немедленно для лучшего UX
    toast.success('Настройки сохранены локально и синхронизируются...')

    // Save to backend if user is logged in (Background)
    if (user?.id) {
      authService.updateUserPresets(user.id, normalizedData)
        .then(result => {
          if (!result.success) {
            console.warn('Failed to save settings to backend:', result.error)
            toast.error('Не удалось синхронизировать настройки с сервером')
          }
        })
        .catch(error => {
          console.error('Error saving settings to backend:', error)
          toast.error('Ошибка синхронизации данных')
        })
    }

    // Check API key status after saving
    if (data.googleMapsApiKey.trim()) {
      checkApiKeyStatus(data.googleMapsApiKey)
    }
  }



  const handleClearAllData = async () => {
    if (window.confirm('Вы уверены, что хотите очистить все динамические данные (маршруты, логи, историю)? Настройки и API ключи будут сохранены.')) {
      try {
        // 1. Сохраняем все текущие настройки во временную переменную
        const settingsBackup = localStorageUtils.getAllSettings()

        // 2. Очищаем динамические данные локально
        localStorageUtils.clearDynamicData()

        // 3. Очищаем данные на сервере (если пользователь админ)
        if (isAdmin) {
          try {
            const token = localStorage.getItem('token');
            if (token) {
              await fetch('/api/maintenance/cleanup', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                }
              });
              toast.success('Серверные данные очищены');
            }
          } catch (serverError) {
            console.error('Ошибка очистки на сервере:', serverError);
            toast.error('Не удалось очистить данные на сервере');
          }
        }

        // 4. Восстанавливаем настройки обратно
        if (settingsBackup) {
          localStorageUtils.setAllSettings(settingsBackup)
        }

        toast.success('Динамические данные очищены, настройки сохранены!')

        // 5. Перезагружаем страницу для полной синхронизации состояния UI
        setTimeout(() => window.location.reload(), 800)
      } catch (error) {
        console.error('Ошибка очистки данных:', error)
        toast.error('Ошибка при очистке данных')
      }
    }
  }

  // Функция для синхронизации KML из URL
  const [isSyncingKml, setIsSyncingKml] = useState(false)

  const syncKmlFromUrl = async (url: string) => {
    if (!url.trim()) {
      toast.error('Пожалуйста, введите ссылку на Google My Maps')
      return
    }

    setIsSyncingKml(true)
    try {
      // Экстракция mid из URL - более гибкий паттерн
      const midMatch = url.match(/mid=([^&\s]+)/)
      if (!midMatch) {
        throw new Error(`Не удалось найти ID карты (mid) в ссылке. Убедитесь, что это ссылка на Google My Maps.\n\nПример: https://www.google.com/maps/d/viewer?mid=ABC123\n\nВаша ссылка: ${url}`)
      }

      const mid = midMatch[1]
      // Используем наш бэкенд прокси
      const exportUrl = `https://www.google.com/maps/d/u/0/kml?mid=${mid}&forcekml=1`

      // Используем API_URL из конфига
      const { API_URL } = await import('../config/apiConfig')
      const proxyUrl = `${API_URL}/api/proxy/kml?url=${encodeURIComponent(exportUrl)}`

      const response = await fetch(proxyUrl)
      if (!response.ok) throw new Error('Ошибка сети при загрузке карты')

      const json = await response.json()
      const kmlText = json.contents

      if (!kmlText || !kmlText.includes('<kml')) {
        throw new Error('Получены некорректные данные. Проверьте, что карта открыта для доступа по ссылке.')
      }

      const parsed = parseKML(kmlText)
      setValue('kmlData', parsed)
      const now = new Date().toLocaleString()
      setValue('lastKmlSync', now)

      toast.success(`Синхронизировано успешно: ${parsed.polygons.length} зон и ${parsed.markers.length} точек`)

      // Сразу сохраняем в localStorage
      const currentValues = watch()
      localStorageUtils.setAllSettings({
        ...currentValues,
        kmlData: parsed,
        lastKmlSync: now
      })

    } catch (error: any) {
      console.error('KML Sync Error:', error)
      toast.error(`Ошибка синхронизации: ${error.message}`)
    } finally {
      setIsSyncingKml(false)
    }
  }

  return (
    <div className={clsx(
      'space-y-6 transition-colors duration-300',
      isDark ? 'text-gray-100' : 'text-gray-900'
    )}>
      {/* Header */}
      <div className={clsx(
        'rounded-2xl shadow-lg border p-8',
        isDark
          ? 'bg-gray-800 border-gray-700'
          : 'bg-white border-gray-200'
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
        'rounded-2xl shadow-lg border p-8',
        isDark
          ? 'bg-gray-800 border-gray-700'
          : 'bg-white border-gray-200'
      )}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* City Bias */}
          <CityBiasSection isDark={isDark} value={watch('cityBias')} onChange={(v) => setValue('cityBias', v)} />


          {/* KM Integrated */}
          <CollapsibleSection
            isDark={isDark}
            icon={<MapIcon className="h-5 w-5" />}
            title="Зона расчета заказов Google My Maps (KML)"
          >
            <div className="space-y-6">
              <div className={clsx(
                'p-4 rounded-xl border-l-4 mb-4',
                isDark ? 'bg-blue-500/10 border-blue-500 text-blue-200' : 'bg-blue-50 border-blue-500 text-blue-800'
              )}>
                <p className="text-sm">
                  Рассчет киллометража через выбранные секторы локации по зонам
                </p>
              </div>
              {/* Ссылка для синхронизации */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ссылка на Google My Maps</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input flex-1"
                    placeholder="https://www.google.com/maps/d/viewer?mid=..."
                    {...register('kmlSourceUrl')}
                    disabled={!canModify}
                  />
                  <button
                    type="button"
                    onClick={() => syncKmlFromUrl(watch('kmlSourceUrl'))}
                    disabled={isSyncingKml || !watch('kmlSourceUrl') || !canModify}
                    className={clsx(
                      'px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-2',
                      isDark ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-indigo-500 hover:bg-indigo-600 text-white',
                      (isSyncingKml || !watch('kmlSourceUrl') || !canModify) && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {isSyncingKml ? <LoadingSpinner size="sm" /> : <ArrowPathIcon className="h-5 w-5" />}
                    {isSyncingKml ? 'Синхронизация...' : 'Синхронизировать'}
                  </button>
                </div>
                <div className="flex items-center gap-4 mt-2">
                  <label className="inline-flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" className="checkbox" {...register('autoSyncKml')} disabled={!canModify} />
                    <span className="text-sm">Обновлять автоматически при загрузке страницы</span>
                  </label>
                  {watch('lastKmlSync') && (
                    <span className="text-[10px] text-gray-500 italic">Последнее обновление: {watch('lastKmlSync')}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 pt-2">
                <div className="h-px bg-gray-200 dark:bg-gray-700 flex-1"></div>
                <span className="text-[10px] text-gray-400 font-bold uppercase">или загрузить вручную</span>
                <div className="h-px bg-gray-200 dark:bg-gray-700 flex-1"></div>
              </div>

              <div className="flex items-center gap-4">
                <input
                  type="file"
                  accept=".kml"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return

                    const text = await file.text()
                    try {
                      const parsed = parseKML(text)
                      setValue('kmlData', parsed)
                      toast.success(`Успешно импортировано: ${parsed.polygons.length} зон и ${parsed.markers.length} точек`)
                    } catch (error) {
                      toast.error('Ошибка при разборе KML файла')
                      console.error(error)
                    }
                  }}
                  className="hidden"
                  id="kml-upload"
                  disabled={!canModify}
                />
                <label
                  htmlFor="kml-upload"
                  className={clsx(
                    'px-4 py-2 rounded-xl font-medium cursor-pointer transition-all flex items-center gap-2',
                    isDark ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white',
                    !canModify && 'opacity-50 cursor-not-allowed pointer-events-none'
                  )}
                >
                  <CloudArrowUpIcon className="h-5 w-5" />
                  Загрузить KML
                </label>

                {watch('kmlData') && (
                  <button
                    type="button"
                    onClick={() => {
                      setValue('kmlData', null)
                      toast.success('Данные KML удалены')
                    }}
                    className={clsx(
                      'px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-2',
                      isDark ? 'bg-red-600/20 hover:bg-red-600/30 text-red-400' : 'bg-red-50 hover:bg-red-100 text-red-600',
                      !canModify && 'opacity-50 cursor-not-allowed pointer-events-none'
                    )}
                    disabled={!canModify}
                  >
                    <TrashIcon className="h-5 w-5" />
                    Очистить KML
                  </button>
                )}
              </div>

              {watch('kmlData') && (
                <div className={clsx(
                  'p-6 rounded-xl border flex flex-col gap-6',
                  isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'
                )}>
                  {/* Статистика и выбор Хабов */}
                  <div className="flex flex-wrap gap-8 items-start border-b pb-6 border-gray-200 dark:border-gray-700">
                    <div className="flex gap-8">
                      <div>
                        <div className="text-xs text-gray-400 uppercase font-black tracking-widest mb-1">Сектора/Зоны</div>
                        <div className="text-2xl font-black text-indigo-500">{watch('kmlData').polygons.length}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 uppercase font-black tracking-widest mb-1">Точки (Базы)</div>
                        <div className="text-2xl font-black text-indigo-500">{watch('kmlData').markers.length}</div>
                      </div>
                    </div>

                    <div className="flex-1 min-w-[300px]">
                      <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">Активные локации (ХАБЫ)</label>
                      <div className="flex flex-wrap gap-2">
                        {Array.from(new Set(watch('kmlData').polygons.map((p: any) => p.folderName)))
                          .sort()
                          .map((hub: any) => {
                            const isSelected = watch('selectedHubs')?.includes(hub);
                            return (
                              <label key={hub} className={clsx(
                                "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-all",
                                isSelected
                                  ? (isDark ? "bg-indigo-500/20 border-indigo-500 text-indigo-400" : "bg-indigo-50 border-indigo-500 text-indigo-700")
                                  : (isDark ? "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600" : "bg-white border-gray-200 text-gray-400 hover:border-gray-300"),
                                !canModify && !isSelected && "hidden"
                              )}>
                                <input
                                  type="checkbox"
                                  className="hidden"
                                  checked={isSelected}
                                  disabled={!canModify}
                                  onChange={(e) => {
                                    const current = watch('selectedHubs') || [];
                                    if (e.target.checked) {
                                      setValue('selectedHubs', [...current, hub]);
                                    } else {
                                      setValue('selectedHubs', current.filter((h: string) => h !== hub));
                                      // Также сбрасываем выбранные зоны этого хаба
                                      const currentZones = watch('selectedZones') || [];
                                      setValue('selectedZones', currentZones.filter((z: string) => !z.startsWith(`${hub}:`)));
                                    }
                                  }}
                                />
                                {hub as string}
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  </div>

                  {/* Выбор конкретных зон */}
                  {watch('selectedHubs')?.length > 0 && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-4 duration-500">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Активные сектора / Зоны</label>
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="relative group min-w-[200px]">
                            <input
                              type="text"
                              placeholder="Поиск зоны..."
                              value={zoneSearchTerm}
                              onChange={(e) => setZoneSearchTerm(e.target.value)}
                              className={clsx(
                                "w-full pl-8 pr-3 py-1.5 rounded-xl border text-xs font-bold outline-none transition-all",
                                isDark
                                  ? "bg-gray-800 border-gray-700 focus:border-indigo-500 text-white"
                                  : "bg-white border-gray-200 focus:border-indigo-400 text-gray-900"
                              )}
                              disabled={!canModify}
                            />
                            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                              <MagnifyingGlassIcon className="h-3.5 w-3.5 text-gray-400" />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const allZones = watch('kmlData').polygons
                                  .filter((p: any) => watch('selectedHubs').includes(p.folderName))
                                  .map((z: any) => `${z.folderName}:${z.name}`);
                                setValue('selectedZones', allZones);
                              }}
                              disabled={!canModify}
                              className={clsx(
                                "text-[10px] font-black uppercase tracking-tighter text-gray-500 hover:text-gray-400 transition-colors",
                                !canModify && "hidden"
                              )}
                            >
                              Выбрать все
                            </button>
                            <button
                              type="button"
                              onClick={() => setValue('selectedZones', [])}
                              disabled={!canModify}
                              className={clsx(
                                "text-[10px] font-black uppercase tracking-tighter text-gray-500 hover:text-gray-400 transition-colors",
                                !canModify && "hidden"
                              )}
                            >
                              Сбросить
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className={clsx(
                        "flex flex-wrap gap-2 max-h-60 overflow-y-auto p-1 scrollbar-thin",
                        isDark ? "scrollbar-thumb-gray-700" : "scrollbar-thumb-gray-300"
                      )}>
                        {watch('kmlData').polygons
                          .filter((p: any) => watch('selectedHubs').includes(p.folderName))
                          .filter((p: any) => !zoneSearchTerm || p.name.toLowerCase().includes(zoneSearchTerm.toLowerCase()) || p.folderName.toLowerCase().includes(zoneSearchTerm.toLowerCase()))
                          .sort((a: any, b: any) => a.name.localeCompare(b.name)) // Сортируем только по имени зоны
                          .map((zone: any) => {
                            const zoneKey = `${zone.folderName}:${zone.name}`;
                            const isSelected = watch('selectedZones')?.includes(zoneKey);
                            return (
                              <label key={zoneKey} className={clsx(
                                "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[11px] font-bold cursor-pointer transition-all",
                                isSelected
                                  ? (isDark ? "bg-purple-500/20 border-purple-500 text-purple-400 shadow-sm shadow-purple-900/20" : "bg-purple-50 border-purple-500 text-purple-700 shadow-sm shadow-purple-200/50")
                                  : (isDark ? "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600" : "bg-white border-gray-200 text-gray-400 hover:border-gray-300"),
                                !canModify && !isSelected && "hidden"
                              )}>
                                <input
                                  type="checkbox"
                                  className="hidden"
                                  checked={isSelected}
                                  disabled={!canModify}
                                  onChange={(e) => {
                                    const current = watch('selectedZones') || [];
                                    if (e.target.checked) {
                                      setValue('selectedZones', [...current, zoneKey]);
                                    } else {
                                      setValue('selectedZones', current.filter((z: string) => z !== zoneKey));
                                    }
                                  }}
                                />
                                <span className="opacity-40 font-black mr-1 text-[9px]">{zone.folderName}:</span>
                                {zone.name}
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Визуальная карта */}
                  <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-black text-gray-400 uppercase tracking-widest">Визуализация выбранных областей</div>
                      <div className="text-[10px] text-gray-400 italic font-medium">Наведите на зону чтобы увидеть название</div>
                    </div>
                    <KmlPreviewMap
                      isDark={isDark}
                      kmlData={watch('kmlData')}
                      selectedHubs={watch('selectedHubs') || []}
                      selectedZones={watch('selectedZones') || []}
                    />
                  </div>
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* Автообновление FO (Swagger) */}
          <CollapsibleSection
            isDark={isDark}
            icon={<ArrowPathIcon className="h-4 w-4" />}
            title="Автообновление с фаста (API Dashboard)"
          >
            <DashboardSettingsPanel
              isDark={isDark}
              onManualSync={() => {
                toast.success('Запущен процесс синхронизации Dashboard API...')
              }}
            />
          </CollapsibleSection>

          {/* Фильтр аномалий маршрута (collapsible) */}
          {isAdmin && (
            <CollapsibleSection
              isDark={isDark}
              icon={<CogIcon className="h-4 w-4" />}
              title="Фильтр аномалий (расстояние)"
            >
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="inline-flex items-center space-x-2">
                  <input type="checkbox" className="checkbox" {...register('anomalyFilterEnabled')} disabled={!canModify} />
                  <span className={clsx(isDark ? 'text-gray-200' : 'text-gray-800', !canModify && 'opacity-50')}>Включить фильтр аномалий</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 col-span-1 md:col-span-2">
                  <div>
                    <div className={clsx('text-xs mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>Макс. среднее на заказ (км)</div>
                    <input type="number" step="1" min="1" className="input" {...register('anomalyMaxAvgPerOrderKm', { valueAsNumber: true })} disabled={!canModify} />
                  </div>
                </div>
              </div>
              {/* Расширенная фильтрация (перенесено сюда) */}
              <div className="mt-4 space-y-3">
                <div className="flex items-center">
                  <input type="checkbox" className="checkbox" {...register('enableCoordinateValidation')} disabled={!canModify} />
                  <span className={clsx("ml-2 text-sm", !canModify && "opacity-50")}>Проверять координаты на разумность</span>
                </div>
                <div className="flex items-center">
                  <input type="checkbox" className="checkbox" {...register('enableAdaptiveThresholds')} disabled={!canModify} />
                  <span className={clsx("ml-2 text-sm", !canModify && "opacity-50")}>Использовать адаптивные пороги</span>
                </div>
                <div>
                  <div className={clsx('text-xs mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>Минимальный порог качества адреса (0-100)</div>
                  <input type="number" step="5" min="0" max="100" className="input" {...register('addressQualityThreshold', { valueAsNumber: true })} disabled={!canModify} />
                  <div className={clsx('text-xs mt-1', isDark ? 'text-gray-400' : 'text-gray-500')}>Адреса с оценкой ниже этого порога будут помечены как подозрительные</div>
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* API Settings Spoiler */}
          {
            isAdmin && (
              <CollapsibleSection
                isDark={isDark}
                icon={<KeyIcon className="h-4 w-4" />}
                title="Настройки api для маршрутизации"
              >
                <div className="space-y-6">
                  {/* Mapbox Token */}
                  <div>
                    <label className="label">
                      <MapIcon className="h-4 w-4 inline mr-2" />
                      Mapbox Token (для отслеживания пробок)
                    </label>
                    <div className="mt-1">
                      <input
                        type="text"
                        className="input"
                        placeholder="Введите ваш Mapbox токен"
                        {...register('mapboxToken')}
                        disabled={!canModify}
                      />
                      <p className={clsx('mt-1 text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>
                        Используется для отслеживания пробок в реальном времени в Украине/Киеве.
                        Бесплатный лимит: 50,000 запросов/месяц.
                      </p>
                    </div>
                  </div>

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
                        {...register('googleMapsApiKey')}
                        disabled={!canModify}
                      />
                      <button
                        type="button"
                        onClick={testApiKey}
                        disabled={isTestingApiKey || !googleMapsApiKey.trim() || !canModify}
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
                        <p className="text-sm text-green-500 font-medium"> API ключ действителен</p>
                        {apiKeyDetails && (
                          <p className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>Статус: {apiKeyDetails}</p>
                        )}
                      </div>
                    )}
                    {apiKeyStatus === 'invalid' && (
                      <div className="mt-1">
                        <p className="text-sm text-red-500 font-medium"> API ключ недействителен</p>
                        {apiKeyDetails && (
                          <p className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>Ошибка: {apiKeyDetails}</p>
                        )}
                      </div>
                    )}
                    <p className={clsx('mt-1 text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>
                      Необходим для геокодирования адресов и расчета маршрутов. Получите API ключ в{' '}
                      <a
                        href="https://console.cloud.google.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
                      >
                        Google Cloud Console
                      </a>
                    </p>
                  </div>
                </div>
              </CollapsibleSection>
            )
          }

          {/* дефф точка старта */}
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
                disabled={!canModify}
              />
              <p className={clsx('mt-1 text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>
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
                disabled={!canModify}
              />
              <p className={clsx('mt-1 text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>
                Точка окончания по умолчанию для всех маршрутов
              </p>
            </div>
          </div>


          {/* Критический лимит для маршрута (collapsible) */}
          {isAdmin && (
            <CollapsibleSection
              isDark={isDark}
              icon={<ShieldCheckIcon className="h-4 w-4" />}
              title="Критический лимит для маршрута"
            >
              <div className="mt-2">
                <div className={clsx('text-xs mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>Крит. максимальное расстояние маршрута (км)</div>
                <input type="number" step="1" min="1" className="input" {...register('maxCriticalRouteDistanceKm', { valueAsNumber: true })} />
                <div className={clsx('text-xs mt-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                  Если маршрут превышает это значение — будет показан критический warning, маршрут НЕ будет пересчитан
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* Кннопки */}
          <div className="flex justify-between gap-4">
            <button
              type="button"
              onClick={handleClearAllData}
              className={clsx(
                'px-6 py-3 rounded-xl font-semibold transition-all duration-200 flex items-center gap-2 shadow-lg hover:scale-105',
                isDark
                  ? 'bg-gradient-to-r from-red-600/80 to-red-700/80 hover:from-red-700 hover:to-red-800 text-white border border-red-500/50'
                  : 'bg-gradient-to-r from-red-500/80 to-red-600/80 hover:from-red-600 hover:to-red-700 text-white border border-red-400/50'
              )}
            >
              <CogIcon className="h-5 w-5" />
              Очистить все данные
            </button>
            <button
              type="submit"
              className={clsx(
                'px-6 py-3 rounded-xl font-semibold transition-all duration-200 flex items-center gap-2 shadow-lg hover:scale-105',
                'bg-gradient-to-r from-blue-600 via-blue-500 to-pink-500 hover:from-blue-700 hover:via-blue-600 hover:to-pink-600 text-white'
              )}
            >
              <CogIcon className="h-5 w-5" />
              Сохранить настройки
            </button>
          </div>
        </form >
      </div >

    </div >
  )
}




























