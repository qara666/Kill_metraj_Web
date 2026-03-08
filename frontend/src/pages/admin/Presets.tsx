import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTheme } from '../../contexts/ThemeContext'
import { authService } from '../../utils/auth/authService'
import { syncPresetsToLocalStorage } from '../../utils/auth/presetSync'
import { clsx } from 'clsx'
import { toast } from 'react-hot-toast'
import {
    MagnifyingGlassIcon,
    CogIcon,
    KeyIcon,
    ArrowPathIcon,
    ShieldCheckIcon,
    MapIcon,
    CloudArrowUpIcon,
    TrashIcon
} from '@heroicons/react/24/outline'
import { parseKML } from '../../utils/maps/kmlParser'
import { KmlPreviewMap } from '../../components/zone/KmlPreviewMap'
import { useAuth } from '../../contexts/AuthContext'
import type { UserPreset } from '../../types/auth'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { CollapsibleSection } from '../../components/shared/CollapsibleSection'
import { DashboardSettingsPanel } from '../../components/autoplanner/DashboardSettingsPanel'
import { CityBiasSection } from '../../components/zone/CityBiasSection'

export const AdminPresets: React.FC = () => {
    const { isDark } = useTheme()
    const { isAdmin, user: currentUser } = useAuth()
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
    const [settings, setSettings] = useState<Record<string, any>>({})
    const [searchTerm, setSearchTerm] = useState('')
    const [zoneSearchTerm, setZoneSearchTerm] = useState('')
    const [userFields, setUserFields] = useState({ divisionId: '', canModifySettings: true })

    // If not admin, force selection to current user's ID
    React.useEffect(() => {
        if (!isAdmin && currentUser?.id) {
            setSelectedUserId(currentUser.id)
        }
    }, [isAdmin, currentUser])

    const queryClient = useQueryClient()

    // Users Query
    const { data: usersData } = useQuery({
        queryKey: ['admin_users_list'],
        queryFn: () => authService.getUsers({ limit: 50 }),
        staleTime: 60000
    })
    const users = usersData?.users || []

    const filteredUsers = users.filter(user =>
        user.username.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const selectedUser = users.find(u => u.id === selectedUserId)

    // Presets Query
    const { data: currentPreset, isLoading: isPresetsLoading } = useQuery<UserPreset | null>({
        queryKey: ['user_presets', selectedUserId],
        queryFn: () => selectedUserId ? authService.getUserPresets(selectedUserId) : Promise.resolve(null),
        enabled: !!selectedUserId
    })

    React.useEffect(() => {
        if (currentPreset?.settings) {
            setSettings(currentPreset.settings)
        }
        if (selectedUser) {
            setUserFields({
                divisionId: selectedUser.divisionId || '',
                canModifySettings: selectedUser.canModifySettings !== false
            })
        }
    }, [currentPreset, selectedUser])

    // Save Preset Mutation
    const saveMutation = useMutation({
        mutationFn: ({ userId, settings }: { userId: number; settings: any }) =>
            authService.updateUserPresets(userId, settings),
        onMutate: async ({ userId, settings }) => {
            await queryClient.cancelQueries({ queryKey: ['user_presets', userId] })
            const previousPresets = queryClient.getQueryData(['user_presets', userId])

            queryClient.setQueryData(['user_presets', userId], (old: any) => ({
                ...old,
                settings: { ...old?.settings, ...settings }
            }))

            return { previousPresets }
        },
        onError: (_err, variables, context: any) => {
            queryClient.setQueryData(['user_presets', variables.userId], context.previousPresets)
            toast.error('Не удалось сохранить настройки')
        },
        onSettled: (_data, _err, variables) => {
            queryClient.invalidateQueries({ queryKey: ['user_presets', variables.userId] })
        },
        onSuccess: (_, { userId }) => {
            queryClient.invalidateQueries({ queryKey: ['user_presets', userId] })
            toast.success('Настройки успешно сохранены')
            
            // If saving for CURRENT user (admin themselves), sync local storage immediately
            if (userId === currentUser?.id) {
                syncPresetsToLocalStorage(userId).catch(err => 
                    console.error('Immediate preset sync failed:', err)
                )
            }
        }
    })

    // Save User fields mutation
    const updateUserMutation = useMutation({
        mutationFn: ({ userId, data }: { userId: number; data: any }) =>
            authService.updateUser(userId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin_users_list'] })
        }
    })

    const handleSave = async () => {
        if (!selectedUserId) return
        
        // Save presets
        saveMutation.mutate({ userId: selectedUserId, settings })
        
        // Save user fields (if admin)
        if (isAdmin) {
            updateUserMutation.mutate({ 
                userId: selectedUserId, 
                data: userFields 
            })
        }
    }

    return (
        <div className="p-4 space-y-6 max-w-[1600px] mx-auto min-h-screen">
            {/* Header omitted for brevity in rewrite, focused on functionality */}
            <div className={clsx(
                "p-8 rounded-3xl shadow-2xl relative overflow-hidden mb-8",
                isDark ? "bg-gray-900 border border-blue-500/20 shadow-blue-900/20" : "bg-white border border-blue-100 shadow-blue-100"
            )}>
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2.5 rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/20">
                                <CogIcon className="w-6 h-6 text-white" />
                            </div>
                            <h1 className={clsx('text-3xl font-black tracking-tight', isDark ? 'text-white' : 'text-gray-900')}>
                                Управление пользователями
                            </h1>
                        </div>
                        <p className={clsx('text-sm font-medium max-w-2xl leading-relaxed', isDark ? 'text-gray-400' : 'text-gray-600')}>
                            Настройка API ключей и пресетов для пользователей.
                        </p>
                    </div>
                    {selectedUser && (
                        <button
                            onClick={handleSave}
                            disabled={saveMutation.isPending}
                            className="px-6 py-3 rounded-xl bg-blue-600 text-white font-bold shadow-lg hover:scale-105 transition-all"
                        >
                            {saveMutation.isPending ? 'Сохранение...' : 'Сохранить изменения'}
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Users List - Hidden for non-admins */}
                {isAdmin && (
                    <div className={clsx(
                        'lg:col-span-3 rounded-3xl border p-6 flex flex-col h-[calc(100vh-250px)] sticky top-4',
                        isDark ? 'bg-gray-800/80 border-gray-700/50 backdrop-blur-xl' : 'bg-white/80 border-gray-200 shadow-xl'
                    )}>
                        <div className="relative mb-6">
                            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Найти пользователя..."
                                className={clsx(
                                    'w-full pl-11 pr-4 py-3 rounded-2xl border text-sm transition-all outline-none',
                                    isDark ? 'bg-gray-900 border-gray-700 text-white' : 'bg-gray-50 border-gray-200'
                                )}
                            />
                        </div>
                        <div className="space-y-2 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                            {filteredUsers.map((user) => (
                                <button
                                    key={user.id}
                                    onClick={() => setSelectedUserId(user.id)}
                                    className={clsx(
                                        'w-full text-left p-4 rounded-2xl transition-all border',
                                        selectedUserId === user.id ? 'bg-blue-600 border-blue-500 text-white' : 'hover:bg-gray-700/50 text-gray-300'
                                    )}
                                >
                                    <div className="font-bold">{user.username}</div>
                                    <div className="text-xs opacity-60">ID: {user.divisionId || 'N/A'}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Editor */}
                <div className={clsx(
                    isAdmin ? 'lg:col-span-9' : 'lg:col-span-12',
                    'rounded-3xl border p-8 transition-all',
                    isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-200'
                )}>
                    {!selectedUser ? (
                        <div className="text-center py-20 text-gray-500">Пользователь не выбран</div>
                    ) : isPresetsLoading ? (
                        <div className="flex justify-center py-20"><LoadingSpinner /></div>
                    ) : (
                        <div className="space-y-6">
                            {/* User Profile Section (Admin only) */}
                            {isAdmin && (
                                <CollapsibleSection isDark={isDark} icon={<ShieldCheckIcon className="h-5 w-5" />} title="Права и Идентификация" defaultOpen={true}>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold uppercase text-gray-500">ID Подразделения (Fastopertor)</label>
                                            <input
                                                type="text"
                                                value={userFields.divisionId}
                                                onChange={(e) => setUserFields({ ...userFields, divisionId: e.target.value })}
                                                className="input"
                                                placeholder="Напр. 101"
                                            />
                                        </div>
                                        <div className="flex items-center gap-3 pt-6">
                                            <input
                                                type="checkbox"
                                                id="canModifySettings"
                                                checked={userFields.canModifySettings}
                                                onChange={(e) => setUserFields({ ...userFields, canModifySettings: e.target.checked })}
                                                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                            <label htmlFor="canModifySettings" className="text-sm font-bold text-gray-700 dark:text-gray-300 cursor-pointer">
                                                Разрешить пользователю менять настройки
                                            </label>
                                        </div>
                                    </div>
                                </CollapsibleSection>
                            )}
                            {/* City Bias - Syced with Settings.tsx */}
                            <CityBiasSection 
                                isDark={isDark} 
                                value={settings.cityBias || ''} 
                                onChange={(v) => isAdmin && setSettings({ ...settings, cityBias: v })} 
                            />

                            <CollapsibleSection isDark={isDark} icon={<KeyIcon className="h-5 w-5" />} title="API Ключи / Провайдеры" defaultOpen={isAdmin}>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold uppercase text-gray-500">Google Maps API Key</label>
                                        <input
                                            type="password"
                                            value={settings.googleMapsApiKey || ''}
                                            onChange={(e) => isAdmin && setSettings({ ...settings, googleMapsApiKey: e.target.value })}
                                            className="input"
                                            placeholder="AIza..."
                                            disabled={!isAdmin}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold uppercase text-gray-500">Mapbox Token (для трафика)</label>
                                        <input
                                            type="text"
                                            value={settings.mapboxToken || ''}
                                            onChange={(e) => isAdmin && setSettings({ ...settings, mapboxToken: e.target.value })}
                                            className="input"
                                            placeholder="pk..."
                                            disabled={!isAdmin}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold uppercase text-gray-500">Generoute API Key</label>
                                        <input
                                            type="password"
                                            value={settings.generouteApiKey || ''}
                                            onChange={(e) => isAdmin && setSettings({ ...settings, generouteApiKey: e.target.value })}
                                            className="input"
                                            placeholder="gen_..."
                                            disabled={!isAdmin}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold uppercase text-gray-500">Geoapify API Key</label>
                                        <input
                                            type="password"
                                            value={settings.geoapifyApiKey || ''}
                                            onChange={(e) => isAdmin && setSettings({ ...settings, geoapifyApiKey: e.target.value })}
                                            className="input"
                                            placeholder="geo_..."
                                            disabled={!isAdmin}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold uppercase text-gray-500">Провайдер карты</label>
                                        <select
                                            value={settings.mapProvider || 'google'}
                                            onChange={(e) => isAdmin && setSettings({ ...settings, mapProvider: e.target.value })}
                                            className="input"
                                            disabled={!isAdmin}
                                        >
                                            <option value="google">Google Maps</option>
                                            <option value="osm">OpenStreetMap (Бесплатно)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold uppercase text-gray-500">Провайдер маршрутизации</label>
                                        <select
                                            value={settings.routingProvider || 'google'}
                                            onChange={(e) => isAdmin && setSettings({ ...settings, routingProvider: e.target.value })}
                                            className="input"
                                            disabled={!isAdmin}
                                        >
                                            <option value="google">Google Maps (Платный)</option>
                                            <option value="generoute">Generoute.io (Оптимизация)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold uppercase text-gray-500">Провайдер геокодирования</label>
                                        <select
                                            value={settings.geocodingProvider || 'google'}
                                            onChange={(e) => isAdmin && setSettings({ ...settings, geocodingProvider: e.target.value })}
                                            className="input"
                                            disabled={!isAdmin}
                                        >
                                            <option value="google">Google Maps (Точный)</option>
                                            <option value="nominatim">Nominatim / OSM (Бесплатно)</option>
                                            <option value="geoapify">Geoapify (Бесплатно/Лимит)</option>
                                        </select>
                                    </div>
                                </div>
                            </CollapsibleSection>

                            <CollapsibleSection isDark={isDark} icon={<ArrowPathIcon className="h-5 w-5" />} title="Интеграция FastOperator / Dashboard" defaultOpen={false}>
                                <DashboardSettingsPanel
                                    isDark={isDark}
                                    initialSettings={settings}
                                    onSettingsChange={(newS) => isAdmin && setSettings(prev => ({ ...prev, ...newS }))}
                                />
                            </CollapsibleSection>

                            <CollapsibleSection isDark={isDark} icon={<MapIcon className="h-5 w-5" />} title="Адреса маршрутов по умолчанию (Старт/Финиш)">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 bg-gray-50/50 dark:bg-gray-800/20 p-6 rounded-2xl border border-gray-100 dark:border-gray-700/50">
                                    {/* Start Address Block */}
                                    <div className="space-y-4">
                                        <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Адрес начала маршрута</h3>
                                        
                                        <div className="p-4 rounded-xl border-2 transition-all bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 focus-within:border-blue-400 dark:focus-within:border-blue-500 focus-within:ring-4 ring-blue-50 dark:ring-blue-900/20">
                                            <input 
                                                type="text" 
                                                className="w-full bg-transparent outline-none text-sm font-bold text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" 
                                                placeholder="Введите адрес начала..." 
                                                value={settings.defaultStartAddress || ''}
                                                onChange={(e) => isAdmin && setSettings({ ...settings, defaultStartAddress: e.target.value })}
                                                disabled={!isAdmin}
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
                                                value={settings.defaultStartLat || ''}
                                                onChange={(e) => isAdmin && setSettings({ ...settings, defaultStartLat: e.target.value ? parseFloat(e.target.value) : null })}
                                                disabled={!isAdmin}
                                            />
                                            </div>
                                            <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Долгота (LNG)</label>
                                            <input 
                                                type="number" 
                                                step="any"
                                                className="w-full p-3 rounded-lg border text-sm font-semibold bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700 focus:border-blue-400 dark:focus:border-blue-500 outline-none transition-all disabled:opacity-50" 
                                                placeholder="30.5234" 
                                                value={settings.defaultStartLng || ''}
                                                onChange={(e) => isAdmin && setSettings({ ...settings, defaultStartLng: e.target.value ? parseFloat(e.target.value) : null })}
                                                disabled={!isAdmin}
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
                                                value={settings.defaultEndAddress || ''}
                                                onChange={(e) => isAdmin && setSettings({ ...settings, defaultEndAddress: e.target.value })}
                                                disabled={!isAdmin}
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
                                                value={settings.defaultEndLat || ''}
                                                onChange={(e) => isAdmin && setSettings({ ...settings, defaultEndLat: e.target.value ? parseFloat(e.target.value) : null })}
                                                disabled={!isAdmin}
                                            />
                                            </div>
                                            <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Долгота (LNG)</label>
                                            <input 
                                                type="number" 
                                                step="any"
                                                className="w-full p-3 rounded-lg border text-sm font-semibold bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700 focus:border-blue-400 dark:focus:border-blue-500 outline-none transition-all disabled:opacity-50" 
                                                placeholder="30.5234" 
                                                value={settings.defaultEndLng || ''}
                                                onChange={(e) => isAdmin && setSettings({ ...settings, defaultEndLng: e.target.value ? parseFloat(e.target.value) : null })}
                                                disabled={!isAdmin}
                                            />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CollapsibleSection>

                            <CollapsibleSection isDark={isDark} icon={<MapIcon className="h-5 w-5" />} title="Зона расчета заказов Google My Maps (KML)" defaultOpen={true}>
                                <div className="space-y-6">
                                    <div className={clsx(
                                        'p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4',
                                        isDark ? 'bg-blue-500/10 border-blue-500/30 text-blue-200' : 'bg-blue-50 border-blue-500 text-blue-800'
                                    )}>
                                        <div className="space-y-1">
                                            <p className="text-sm font-bold">Зоны доставки (KML)</p>
                                            <p className="text-[10px] opacity-70">
                                                Рассчет киллометража через выбранные секторы локации по зонам
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const globalKmlData = JSON.parse(localStorage.getItem('km_kml_data') || 'null');
                                                const globalKmlUrl = localStorage.getItem('km_kml_source_url') || '';
                                                const globalHubs = JSON.parse(localStorage.getItem('km_selected_hubs') || '[]');
                                                const globalZones = JSON.parse(localStorage.getItem('km_selected_zones') || '[]');

                                                setSettings(prev => ({
                                                    ...prev,
                                                    kmlData: globalKmlData,
                                                    kmlSourceUrl: globalKmlUrl,
                                                    selectedHubs: globalHubs,
                                                    selectedZones: globalZones
                                                }));
                                                toast.success('Настройки KML скопированы из общих');
                                            }}
                                            className="px-4 py-2 rounded-xl bg-blue-600/20 text-blue-400 text-[10px] font-black uppercase hover:bg-blue-600/30 transition-all border border-blue-500/30"
                                        >
                                            Копировать из настроек
                                        </button>
                                    </div>

                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={settings.kmlSourceUrl || ''}
                                            onChange={(e) => setSettings({ ...settings, kmlSourceUrl: e.target.value })}
                                            className="input flex-1"
                                            placeholder="Ссылка Google My Maps..."
                                        />
                                    </div>
                                    <div className="flex items-center gap-4 mt-2">
                                        <label className="inline-flex items-center space-x-2 cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                className="checkbox" 
                                                checked={settings.autoSyncKml ?? false}
                                                onChange={(e) => setSettings({ ...settings, autoSyncKml: e.target.checked })}
                                            />
                                            <span className="text-sm">Обновлять автоматически при загрузке страницы</span>
                                        </label>
                                        {settings.lastKmlSync && (
                                            <span className="text-[10px] text-gray-500 italic">Последнее обновление: {settings.lastKmlSync}</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <input
                                            type="file"
                                            accept=".kml"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0]
                                                if (!file) return
                                                try {
                                                    const text = await file.text()
                                                    const parsed = parseKML(text)
                                                    setSettings({ ...settings, kmlData: parsed })
                                                    toast.success(`Успешно импортировано: ${parsed.polygons.length} зон`)
                                                } catch (error) {
                                                    toast.error('Ошибка при разборе KML файла')
                                                }
                                            }}
                                            className="hidden"
                                            id="preset-kml-upload"
                                        />
                                        <label
                                            htmlFor="preset-kml-upload"
                                            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold cursor-pointer"
                                        >
                                            <CloudArrowUpIcon className="h-4 w-4 inline mr-2" />
                                            Загрузить KML
                                        </label>

                                        {settings.kmlData && (
                                            <button
                                                type="button"
                                                onClick={() => setSettings({ ...settings, kmlData: null })}
                                                className="text-red-400 text-xs font-bold"
                                            >
                                                <TrashIcon className="h-4 w-4 inline mr-2" />
                                                Очистить
                                            </button>
                                        )}
                                    </div>

                                    {settings.kmlData && (
                                        <div className={clsx(
                                            'p-6 rounded-xl border flex flex-col gap-6',
                                            isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'
                                        )}>
                                            <div className="flex flex-wrap gap-8 items-start border-b pb-6 border-gray-200 dark:border-gray-700">
                                                <div className="flex gap-8">
                                                    <div>
                                                        <div className="text-xs text-gray-400 uppercase font-black mb-1">Зоны</div>
                                                        <div className="text-2xl font-black text-indigo-500">{settings.kmlData.polygons.length}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-xs text-gray-400 uppercase font-black mb-1">Базы</div>
                                                        <div className="text-2xl font-black text-indigo-500">{settings.kmlData.markers.length}</div>
                                                    </div>
                                                </div>

                                                <div className="flex-1 min-w-[300px]">
                                                    <label className="text-xs font-black text-gray-400 uppercase mb-2 block">Активные ХАБЫ</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {Array.from(new Set(settings.kmlData.polygons.map((p: any) => p.folderName)))
                                                            .sort()
                                                            .map((hub: any) => {
                                                                const isSelected = settings.selectedHubs?.includes(hub);
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
                                                                                const currentHubs = settings.selectedHubs || [];
                                                                                const newHubs = e.target.checked
                                                                                    ? [...currentHubs, hub]
                                                                                    : currentHubs.filter((h: string) => h !== hub);

                                                                                // Auto-select/deselect zones of this hub
                                                                                const currentZones = settings.selectedZones || [];
                                                                                const hubZoneKeys = settings.kmlData.polygons
                                                                                    .filter((p: any) => (p.folderName || '').trim() === (hub as string).trim())
                                                                                    .map((p: any) => `${(p.folderName || '').trim()}:${(p.name || '').trim()}`);

                                                                                let newZones = currentZones;
                                                                                if (e.target.checked) {
                                                                                    newZones = Array.from(new Set([...currentZones, ...hubZoneKeys]));
                                                                                } else {
                                                                                    newZones = currentZones.filter((zk: string) => !hubZoneKeys.includes(zk));
                                                                                }

                                                                                setSettings({
                                                                                    ...settings,
                                                                                    selectedHubs: newHubs,
                                                                                    selectedZones: newZones
                                                                                });
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
                                                                const currentHubs = settings.selectedHubs || [];
                                                                const allZones = settings.kmlData.polygons
                                                                    .filter((p: any) => currentHubs.includes((p.folderName || '').trim()))
                                                                    .map((p: any) => `${(p.folderName || '').trim()}:${(p.name || '').trim()}`);
                                                                setSettings({ ...settings, selectedZones: allZones });
                                                            }}
                                                            className="text-[10px] font-black text-indigo-400 uppercase hover:text-indigo-300"
                                                        >
                                                            Выбрать все
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setSettings({ ...settings, selectedZones: [] })}
                                                            className="text-[10px] font-black text-red-400 uppercase hover:text-red-300"
                                                        >
                                                            Сбросить
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
                                                    {settings.kmlData.polygons
                                                        .filter((p: any) => {
                                                            const isFromHub = (settings.selectedHubs || []).length === 0 || settings.selectedHubs.includes(p.folderName);
                                                            const matchesSearch = !zoneSearchTerm || (p.name || '').toLowerCase().includes(zoneSearchTerm.toLowerCase()) || (p.folderName || '').toLowerCase().includes(zoneSearchTerm.toLowerCase());
                                                            return isFromHub && matchesSearch;
                                                        })
                                                        .map((p: any) => {
                                                            const zoneKey = `${p.folderName}:${p.name}`;
                                                            const isSelected = settings.selectedZones?.includes(zoneKey);
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
                                                                            const current = settings.selectedZones || [];
                                                                            if (e.target.checked) {
                                                                                setSettings({ ...settings, selectedZones: [...current, zoneKey] });
                                                                            } else {
                                                                                setSettings({ ...settings, selectedZones: current.filter((z: string) => z !== zoneKey) });
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

                                            <div className="border border-gray-700 rounded-xl overflow-hidden h-60">
                                                <KmlPreviewMap
                                                    isDark={isDark}
                                                    kmlData={settings.kmlData}
                                                    selectedHubs={settings.selectedHubs || []}
                                                    selectedZones={settings.selectedZones || []}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </CollapsibleSection>

                             <CollapsibleSection isDark={isDark} icon={<ShieldCheckIcon className="h-5 w-5" />} title="Фильтры аномалий" defaultOpen={false}>
                                <div className="space-y-4">
                                    <div className="flex items-center gap-4">
                                        <input
                                            type="checkbox"
                                            checked={settings.anomalyFilterEnabled ?? true}
                                            onChange={(e) => isAdmin && setSettings({ ...settings, anomalyFilterEnabled: e.target.checked })}
                                            className="checkbox"
                                            disabled={!isAdmin}
                                        />
                                        <span className="text-sm">Включить фильтр аномалий</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold uppercase text-gray-500">Макс. расстояние сегмента (км)</label>
                                            <input 
                                                type="number" 
                                                value={settings.anomalyMaxLegDistanceKm || ''}
                                                onChange={(e) => isAdmin && setSettings({ ...settings, anomalyMaxLegDistanceKm: parseFloat(e.target.value) })}
                                                className="input"
                                                disabled={!isAdmin}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold uppercase text-gray-500">Макс. общее расстояние (км)</label>
                                            <input 
                                                type="number" 
                                                value={settings.anomalyMaxTotalDistanceKm || ''}
                                                onChange={(e) => isAdmin && setSettings({ ...settings, anomalyMaxTotalDistanceKm: parseFloat(e.target.value) })}
                                                className="input"
                                                disabled={!isAdmin}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold uppercase text-gray-500">Макс. среднее расстояние на заказ (км)</label>
                                            <input 
                                                type="number" 
                                                value={settings.anomalyMaxAvgPerOrderKm || ''}
                                                onChange={(e) => isAdmin && setSettings({ ...settings, anomalyMaxAvgPerOrderKm: parseFloat(e.target.value) })}
                                                className="input"
                                                disabled={!isAdmin}
                                                placeholder="25"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-gray-700/50">
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-4">
                                                <input
                                                    type="checkbox"
                                                    checked={settings.enableCoordinateValidation ?? true}
                                                    onChange={(e) => isAdmin && setSettings({ ...settings, enableCoordinateValidation: e.target.checked })}
                                                    className="checkbox"
                                                    disabled={!isAdmin}
                                                />
                                                <span className="text-sm">Валидация координат (Украина)</span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <input
                                                    type="checkbox"
                                                    checked={settings.enableAdaptiveThresholds ?? true}
                                                    onChange={(e) => isAdmin && setSettings({ ...settings, enableAdaptiveThresholds: e.target.checked })}
                                                    className="checkbox"
                                                    disabled={!isAdmin}
                                                />
                                                <span className="text-sm">Адаптивные пороги (на базе статистики)</span>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold uppercase text-gray-500">Порог качества адреса (%)</label>
                                            <div className="flex items-center gap-4">
                                                <input 
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    step="5"
                                                    value={settings.addressQualityThreshold || 60}
                                                    onChange={(e) => isAdmin && setSettings({ ...settings, addressQualityThreshold: parseInt(e.target.value) })}
                                                    className="flex-1 accent-blue-500"
                                                    disabled={!isAdmin}
                                                />
                                                <span className="text-sm font-bold w-10 text-center">{settings.addressQualityThreshold || 60}%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CollapsibleSection>

                            <CollapsibleSection isDark={isDark} icon={<CogIcon className="h-5 w-5" />} title="Интерфейс и Ограничения" defaultOpen={false}>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold uppercase text-gray-500">Стиль карты Google</label>
                                        <select
                                            value={settings.mapStyle || 'standard'}
                                            onChange={(e) => isAdmin && setSettings({ ...settings, mapStyle: e.target.value })}
                                            className="input"
                                            disabled={!isAdmin}
                                        >
                                            <option value="standard">Стандартный</option>
                                            <option value="silver">Серебро</option>
                                            <option value="retro">Ретро</option>
                                            <option value="dark">Темный</option>
                                            <option value="night">Ночной</option>
                                            <option value="aubergine">Баклажан</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold uppercase text-gray-500">Макс. критическая дистанция (км)</label>
                                        <input 
                                            type="number" 
                                            value={settings.maxCriticalRouteDistanceKm || ''}
                                            onChange={(e) => isAdmin && setSettings({ ...settings, maxCriticalRouteDistanceKm: parseFloat(e.target.value) })}
                                            className="input"
                                            disabled={!isAdmin}
                                        />
                                        <p className="text-[10px] text-gray-400">Маршруты длиннее этого значения помечаются как критические</p>
                                    </div>
                                </div>
                            </CollapsibleSection>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
