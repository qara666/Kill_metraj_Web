import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import {
  CogIcon,
  KeyIcon,
  MapIcon,
  ArrowPathIcon,
  CloudArrowUpIcon,
  TrashIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline'
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

interface SettingsForm {
  googleMapsApiKey: string
  mapboxToken: string
  defaultStartAddress: string
  defaultStartLat: number | null
  defaultStartLng: number | null
  defaultEndAddress: string
  defaultEndLat: number | null
  defaultEndLng: number | null
  cityBias: '' | 'Киев' | 'Харьков' | 'Полтава' | 'Одесса'
  anomalyFilterEnabled: boolean
  anomalyMaxLegDistanceKm: number
  anomalyMaxTotalDistanceKm: number
  anomalyMaxAvgPerOrderKm: number
  addressQualityThreshold: number
  enableCoordinateValidation: boolean
  enableAdaptiveThresholds: boolean
  fastopertorEndpoint: string
  enableFastopertorApi: boolean
  mapStyle: 'standard' | 'silver' | 'retro' | 'dark' | 'night' | 'aubergine'
  maxCriticalRouteDistanceKm: number
  fastopertorApiKey: string
  kmlData: any | null
  kmlSourceUrl: string
  lastKmlSync: string | null
  autoSyncKml: boolean
  selectedHubs: string[]
  selectedZones: string[]
  routingProvider: 'google' | 'generoute'
  geocodingProvider: 'google' | 'nominatim'
  generouteApiKey: string
}

export const Settings: React.FC = () => {
  const { isDark } = useTheme()
  const { isAdmin, user } = useAuth()
  const canModify = user?.canModifySettings !== false
  const [isTestingApiKey, setIsTestingApiKey] = useState(false)
  const [zoneSearchTerm, setZoneSearchTerm] = useState('')
  const [isSyncingKml, setIsSyncingKml] = useState(false)

  const { register, handleSubmit, watch, setValue } = useForm<SettingsForm>({
    defaultValues: {
      googleMapsApiKey: '',
      mapboxToken: '',
      defaultStartAddress: '',
      defaultStartLat: null,
      defaultStartLng: null,
      defaultEndAddress: '',
      defaultEndLat: null,
      defaultEndLng: null,
      cityBias: '',
      anomalyFilterEnabled: true,
      anomalyMaxLegDistanceKm: 10,
      anomalyMaxTotalDistanceKm: 35,
      anomalyMaxAvgPerOrderKm: 25,
      addressQualityThreshold: 60,
      enableCoordinateValidation: true,
      enableAdaptiveThresholds: true,
      maxCriticalRouteDistanceKm: 120,
      fastopertorApiKey: '',
      fastopertorEndpoint: '',
      enableFastopertorApi: false,
      mapStyle: 'standard',
      kmlData: null,
      kmlSourceUrl: '',
      lastKmlSync: null,
      autoSyncKml: false,
      selectedHubs: [],
      selectedZones: [],
      routingProvider: 'google',
      geocodingProvider: 'google',
      generouteApiKey: ''
    }
  })

  const googleMapsApiKey = watch('googleMapsApiKey') || ''

  const checkApiKeyStatus = async (apiKey: string) => {
    if (!apiKey.trim()) return
    try {
      validateGoogleMapsApiKey(apiKey)
    } catch (error) {
      console.error('API Key validation failed:', error)
    }
  }

  useEffect(() => {
    const settings = localStorageUtils.getAllSettings()
    setValue('googleMapsApiKey', settings.googleMapsApiKey || '')
    const savedMapboxToken = localStorage.getItem('km_mapbox_token')
    setValue('mapboxToken', (savedMapboxToken || settings.mapboxToken || '').trim())
    setValue('defaultStartAddress', settings.defaultStartAddress || '')
    setValue('defaultStartLat', settings.defaultStartLat || null)
    setValue('defaultStartLng', settings.defaultStartLng || null)
    setValue('defaultEndAddress', settings.defaultEndAddress || '')
    setValue('defaultEndLat', settings.defaultEndLat || null)
    setValue('defaultEndLng', settings.defaultEndLng || null)
    setValue('cityBias', settings.cityBias || '')
    setValue('anomalyFilterEnabled', settings.anomalyFilterEnabled ?? true)
    setValue('anomalyMaxLegDistanceKm', settings.anomalyMaxLegDistanceKm ?? 10)
    setValue('anomalyMaxTotalDistanceKm', settings.anomalyMaxTotalDistanceKm ?? 35)
    setValue('anomalyMaxAvgPerOrderKm', settings.anomalyMaxAvgPerOrderKm ?? 25)
    setValue('addressQualityThreshold', settings.addressQualityThreshold ?? 60)
    setValue('enableCoordinateValidation', settings.enableCoordinateValidation ?? true)
    setValue('enableAdaptiveThresholds', settings.enableAdaptiveThresholds ?? true)
    setValue('mapStyle', settings.mapStyle || 'standard')
    setValue('maxCriticalRouteDistanceKm', settings.maxCriticalRouteDistanceKm ?? 120)

    if (settings.googleMapsApiKey) {
      checkApiKeyStatus(settings.googleMapsApiKey)
    }

    setValue('kmlData', settings.kmlData || null)
    setValue('kmlSourceUrl', settings.kmlSourceUrl || '')
    setValue('lastKmlSync', settings.lastKmlSync || null)
    setValue('autoSyncKml', settings.autoSyncKml ?? false)
    setValue('selectedHubs', settings.selectedHubs || [])
    setValue('selectedZones', settings.selectedZones || [])
    setValue('routingProvider', settings.routingProvider || 'google')
    setValue('geocodingProvider', settings.geocodingProvider || 'google')
    setValue('generouteApiKey', settings.generouteApiKey || '')

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
        localStorageUtils.setApiKey(googleMapsApiKey)
        toast.success(' API ключ действителен и сохранен!')
      } else {
        toast.error(`API ключ недействителен: Неизвестная ошибка`)
      }
    } catch (error) {
      toast.error(`Не удалось проверить API ключ: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`)
    } finally {
      setIsTestingApiKey(false)
    }
  }

  const onSubmit = async (data: SettingsForm) => {
    const normalizedToken = (data.mapboxToken || '').trim()
    const normalizedData = { ...data, mapboxToken: normalizedToken }
    localStorageUtils.setAllSettings(normalizedData)
    if (normalizedToken) {
      localStorage.setItem('km_mapbox_token', normalizedToken)
    } else {
      localStorage.removeItem('km_mapbox_token')
    }
    toast.success('Настройки сохранены локально')
    if (data.googleMapsApiKey.trim()) {
      checkApiKeyStatus(data.googleMapsApiKey)
    }
  }

  const syncKmlFromUrl = async (url: string) => {
    if (!url.trim()) {
      toast.error('Пожалуйста, введите ссылку на Google My Maps')
      return
    }

    setIsSyncingKml(true)
    try {
      const midMatch = url.match(/mid=([^&\s]+)/)
      if (!midMatch) {
        throw new Error(`Не удалось найти ID карты (mid) в ссылке.`)
      }

      const mid = midMatch[1]
      const exportUrl = `https://www.google.com/maps/d/u/0/kml?mid=${mid}&forcekml=1`

      const { API_URL } = await import('../config/apiConfig')
      const proxyUrl = `${API_URL}/api/proxy/kml?url=${encodeURIComponent(exportUrl)}`

      const response = await fetch(proxyUrl)
      if (!response.ok) throw new Error('Ошибка сети при загрузке карты')

      const json = await response.json()
      const kmlText = json.contents

      if (!kmlText || !kmlText.includes('<kml')) {
        throw new Error('Получены некорректные данные.')
      }

      const parsed = parseKML(kmlText)
      setValue('kmlData', parsed)
      const now = new Date().toLocaleString()
      setValue('lastKmlSync', now)

      toast.success(`Синхронизировано успешно: ${parsed.polygons.length} зон`)

      localStorageUtils.setAllSettings({
        ...watch(),
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

  const handleClearAllData = async () => {
    if (window.confirm('Вы уверены, что хотите очистить все динамические данные (маршруты, логи, историю)? Настройки и API ключи будут сохранены.')) {
      try {
        const settingsBackup = localStorageUtils.getAllSettings()
        localStorageUtils.clearDynamicData()
        if (settingsBackup) {
          localStorageUtils.setAllSettings(settingsBackup)
        }
        toast.success('Динамические данные очищены, настройки сохранены!')
        setTimeout(() => window.location.reload(), 800)
      } catch (error) {
        console.error('Ошибка очистки данных:', error)
        toast.error('Ошибка при очистке данных')
      }
    }
  }

  return (
    <div className={clsx('space-y-6', isDark ? 'text-gray-100' : 'text-gray-900')}>
      <div className={clsx('rounded-2xl shadow-lg border p-8', isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200')}>
        <h1 className="text-2xl font-bold">Настройки</h1>
        <p className={clsx('mt-1 text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>Настройка приложения и API ключей</p>
      </div>

      <div className={clsx('rounded-2xl shadow-lg border p-8', isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200')}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* City Bias */}
          <CityBiasSection isDark={isDark} value={watch('cityBias')} onChange={(v) => setValue('cityBias', v)} />

          {/* KML Section */}
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
                      toast.success(`Успешно импортировано: ${parsed.polygons.length} зон`)
                    } catch (error) {
                      toast.error('Ошибка при разборе KML файла')
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
                      'px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-2 text-red-400',
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
                  <div className="flex flex-wrap gap-8 items-start border-b pb-6 border-gray-200 dark:border-gray-700">
                    <div className="flex gap-8">
                      <div>
                        <div className="text-xs text-gray-400 uppercase font-black mb-1">Зоны</div>
                        <div className="text-2xl font-black text-indigo-500">{watch('kmlData').polygons.length}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 uppercase font-black mb-1">Базы</div>
                        <div className="text-2xl font-black text-indigo-500">{watch('kmlData').markers.length}</div>
                      </div>
                    </div>

                    <div className="flex-1 min-w-[300px]">
                      <label className="text-xs font-black text-gray-400 uppercase mb-2 block">Активные ХАБЫ</label>
                      <div className="flex flex-wrap gap-2">
                        {Array.from(new Set(watch('kmlData').polygons.map((p: any) => p.folderName)))
                          .sort()
                          .map((hub: any) => {
                            const isSelected = watch('selectedHubs')?.includes(hub);
                            return (
                              <label key={hub} className={clsx(
                                "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-all",
                                isSelected
                                  ? "bg-indigo-500/20 border-indigo-500 text-indigo-400"
                                  : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600"
                              )}>
                                <input
                                  type="checkbox"
                                  className="hidden"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    const current = watch('selectedHubs') || [];
                                    const newHubs = e.target.checked
                                      ? [...current, hub]
                                      : current.filter((h: string) => h !== hub);
                                    setValue('selectedHubs', newHubs);

                                    // Auto-select/deselect zones of this hub
                                    const currentZones = watch('selectedZones') || [];
                                    const hubZoneKeys = watch('kmlData').polygons
                                      .filter((p: any) => p.folderName === hub)
                                      .map((p: any) => `${p.folderName}:${p.name}`);

                                    if (e.target.checked) {
                                      setValue('selectedZones', Array.from(new Set([...currentZones, ...hubZoneKeys])));
                                    } else {
                                      setValue('selectedZones', currentZones.filter(zk => !hubZoneKeys.includes(zk)));
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

                  {/* Active Zones Section */}
                  <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between gap-4">
                      <label className="text-xs font-black text-gray-400 uppercase">Активные ЗОНЫ (сектора)</label>
                      <div className="relative w-64">
                        <input
                          type="text"
                          value={zoneSearchTerm}
                          onChange={(e) => setZoneSearchTerm(e.target.value)}
                          placeholder="Поиск зон..."
                          className={clsx(
                            "w-full pl-8 pr-3 py-1.5 rounded-xl border text-xs font-bold outline-none transition-all",
                            isDark
                              ? "bg-gray-800 border-gray-700 focus:border-indigo-500 text-white"
                              : "bg-white border-gray-200 focus:border-indigo-400 text-gray-900"
                          )}
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
                              .filter((p: any) => watch('selectedHubs')?.includes(p.folderName))
                              .map((p: any) => `${p.folderName}:${p.name}`);
                            setValue('selectedZones', allZones);
                          }}
                          className="text-[10px] font-black text-indigo-400 uppercase hover:text-indigo-300"
                        >
                          Выбрать все
                        </button>
                        <button
                          type="button"
                          onClick={() => setValue('selectedZones', [])}
                          className="text-[10px] font-black text-red-400 uppercase hover:text-red-300"
                        >
                          Сбросить
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
                      {watch('kmlData').polygons
                        .filter((p: any) => {
                          const isFromHub = (watch('selectedHubs') || []).length === 0 || watch('selectedHubs').includes(p.folderName);
                          const matchesSearch = !zoneSearchTerm || (p.name || '').toLowerCase().includes(zoneSearchTerm.toLowerCase()) || (p.folderName || '').toLowerCase().includes(zoneSearchTerm.toLowerCase());
                          return isFromHub && matchesSearch;
                        })
                        .map((p: any) => {
                          const zoneKey = `${p.folderName}:${p.name}`;
                          const isSelected = watch('selectedZones')?.includes(zoneKey);
                          return (
                            <label key={zoneKey} className={clsx(
                              "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[10px] font-bold cursor-pointer transition-all",
                              isSelected
                                ? "bg-indigo-500/20 border-indigo-500 text-indigo-400"
                                : "bg-gray-800/30 border-gray-700/50 text-gray-500 hover:border-gray-600"
                            )}>
                              <input
                                type="checkbox"
                                className="hidden"
                                checked={isSelected}
                                onChange={(e) => {
                                  const current = watch('selectedZones') || [];
                                  if (e.target.checked) {
                                    setValue('selectedZones', [...current, zoneKey]);
                                  } else {
                                    setValue('selectedZones', current.filter((z: string) => z !== zoneKey));
                                  }
                                }}
                              />
                              <span className="opacity-50 mr-1">{p.folderName}</span>
                              {p.name}
                            </label>
                          );
                        })}
                    </div>
                  </div>
                  <KmlPreviewMap
                    isDark={isDark}
                    kmlData={watch('kmlData')}
                    selectedHubs={watch('selectedHubs') || []}
                    selectedZones={watch('selectedZones') || []}
                  />
                </div>
              )}
            </div>
          </CollapsibleSection>

          <CollapsibleSection isDark={isDark} icon={<ArrowPathIcon className="h-4 w-4" />} title="Автообновление (API Dashboard)">
            <DashboardSettingsPanel isDark={isDark} onManualSync={() => toast.success('Синхронизация запущена')} />
          </CollapsibleSection>

          {isAdmin && (
            <CollapsibleSection isDark={isDark} icon={<CogIcon className="h-4 w-4" />} title="Фильтр аномалий">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="inline-flex items-center space-x-2">
                  <input type="checkbox" className="checkbox" {...register('anomalyFilterEnabled')} disabled={!canModify} />
                  <span>Включить фильтр аномалий</span>
                </label>
                <input type="number" className="input" {...register('anomalyMaxAvgPerOrderKm')} disabled={!canModify} placeholder="Макс. среднее (км)" />
              </div>
            </CollapsibleSection>
          )}

          <CollapsibleSection isDark={isDark} icon={<KeyIcon className="h-4 w-4" />} title="API Ключи / Провайдеры">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-4 border-b border-gray-100 dark:border-gray-700">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Провайдер маршрутизации</label>
                  <select {...register('routingProvider')} className="input w-full" disabled={!canModify}>
                    <option value="google">Google Maps (Платный)</option>
                    <option value="generoute">Generoute.io (Оптимизация)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Провайдер геокодирования</label>
                  <select {...register('geocodingProvider')} className="input w-full" disabled={!canModify}>
                    <option value="google">Google Maps (Точный)</option>
                    <option value="nominatim">Nominatim / OSM (Бесплатно)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Google Maps API Ключ</label>
                  <div className="flex gap-2">
                    <input type="password" className="input flex-1" placeholder="Google Maps API Ключ" {...register('googleMapsApiKey')} disabled={!canModify} />
                    <button type="button" onClick={testApiKey} disabled={isTestingApiKey} className="btn-outline">Проверить</button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mapbox Token (для трафика)</label>
                  <input type="text" className="input" placeholder="Mapbox Token" {...register('mapboxToken')} disabled={!canModify} />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Generoute API Key</label>
                  <input type="password" className="input" placeholder="Generoute API Key" {...register('generouteApiKey')} disabled={!canModify} />
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 bg-gray-50/50 dark:bg-gray-800/20 p-6 rounded-2xl border border-gray-100 dark:border-gray-700/50">
            {/* Start Address Block */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Адрес начала маршрута</h3>
              
              <div className="p-4 rounded-xl border-2 transition-all bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 focus-within:border-blue-400 dark:focus-within:border-blue-500 focus-within:ring-4 ring-blue-50 dark:ring-blue-900/20">
                 <input 
                    type="text" 
                    className="w-full bg-transparent outline-none text-sm font-bold text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" 
                    placeholder="Введите адрес начала..." 
                    {...register('defaultStartAddress')} 
                    disabled={!canModify} 
                 />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Широта (LAT)</label>
                  <input 
                    type="number" 
                    step="any"
                    className="w-full p-3 rounded-lg border text-sm font-semibold bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700 focus:border-blue-400 dark:focus:border-blue-500 outline-none transition-all disabled:opacity-50" 
                    placeholder="50.4501" 
                    {...register('defaultStartLat', { valueAsNumber: true })} 
                    disabled={!canModify} 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Долгота (LNG)</label>
                  <input 
                    type="number" 
                    step="any"
                    className="w-full p-3 rounded-lg border text-sm font-semibold bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700 focus:border-blue-400 dark:focus:border-blue-500 outline-none transition-all disabled:opacity-50" 
                    placeholder="30.5234" 
                    {...register('defaultStartLng', { valueAsNumber: true })} 
                    disabled={!canModify} 
                  />
                </div>
              </div>
            </div>

            {/* End Address Block */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Адрес окончания маршрута</h3>
              
              <div className="p-4 rounded-xl border-2 transition-all bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 focus-within:border-blue-400 dark:focus-within:border-blue-500 focus-within:ring-4 ring-blue-50 dark:ring-blue-900/20">
                 <input 
                    type="text" 
                    className="w-full bg-transparent outline-none text-sm font-bold text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" 
                    placeholder="Введите адрес окончания..." 
                    {...register('defaultEndAddress')} 
                    disabled={!canModify} 
                 />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Широта (LAT)</label>
                  <input 
                    type="number" 
                    step="any"
                    className="w-full p-3 rounded-lg border text-sm font-semibold bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700 focus:border-blue-400 dark:focus:border-blue-500 outline-none transition-all disabled:opacity-50" 
                    placeholder="50.4501" 
                    {...register('defaultEndLat', { valueAsNumber: true })} 
                    disabled={!canModify} 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Долгота (LNG)</label>
                  <input 
                    type="number" 
                    step="any"
                    className="w-full p-3 rounded-lg border text-sm font-semibold bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700 focus:border-blue-400 dark:focus:border-blue-500 outline-none transition-all disabled:opacity-50" 
                    placeholder="30.5234" 
                    {...register('defaultEndLng', { valueAsNumber: true })} 
                    disabled={!canModify} 
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button type="button" onClick={handleClearAllData} className="px-6 py-3 rounded-xl bg-red-600 text-white">Очистить данные</button>
            <button type="submit" className="px-6 py-3 rounded-xl bg-blue-600 text-white">Сохранить настройки</button>
          </div>
        </form>
      </div>
    </div>
  )
}
