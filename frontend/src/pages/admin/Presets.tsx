import React, { useState, useEffect } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { authService } from '../../utils/auth/authService'
import { clsx } from 'clsx'
import { toast } from 'react-hot-toast'
import {
    MagnifyingGlassIcon,
    CloudArrowUpIcon,
    TrashIcon,
    CogIcon,
    KeyIcon,
    ArrowPathIcon,
    ShieldCheckIcon,
    MapIcon
} from '@heroicons/react/24/outline'
import { KmlPreviewMap } from '../../components/zone/KmlPreviewMap'
import { parseKML } from '../../utils/maps/kmlParser'
import type { User, UserPreset } from '../../types/auth'
import { CityBiasSection } from '../../components/zone/CityBiasSection'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { CollapsibleSection } from '../../components/shared/CollapsibleSection'
import { DashboardSettingsPanel } from '../../components/autoplanner/DashboardSettingsPanel'

export const AdminPresets: React.FC = () => {
    const { isDark } = useTheme()
    const [users, setUsers] = useState<User[]>([])
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
    const [presets, setPresets] = useState<UserPreset | null>(null)
    const [settings, setSettings] = useState<Record<string, any>>({})
    const [loading, setLoading] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const [zoneSearchTerm, setZoneSearchTerm] = useState('')
    const [isSyncingKml, setIsSyncingKml] = useState(false)

    const syncKmlFromUrl = async (url: string) => {
        if (!url) return
        setIsSyncingKml(true)
        try {
            const baseUrl = import.meta.env.VITE_API_URL || ''
            const response = await fetch(`${baseUrl}/api/proxy/kml?url=${encodeURIComponent(url)}`)
            if (!response.ok) throw new Error('Network response was not ok')
            const text = await response.text()
            const parsed = parseKML(text)

            const now = new Date().toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            })

            setSettings(prev => ({
                ...prev,
                kmlData: parsed,
                lastKmlSync: now,
                selectedHubs: parsed.polygons.map((p: any) => p.folderName).filter((v: any, i: any, a: any) => a.indexOf(v) === i),
                selectedZones: parsed.polygons.map((p: any) => `${p.folderName}:${p.name}`)
            }))
            toast.success(`Синхронизировано: ${parsed.polygons.length} зон`)
        } catch (error: any) {
            console.error('KML Sync error:', error)
            toast.error(`Ошибка синхронизации: ${error.message || 'Неизвестная ошибка'}`)
        } finally {
            setIsSyncingKml(false)
        }
    }

    useEffect(() => {
        loadUsers()
    }, [])

    useEffect(() => {
        if (selectedUserId) {
            loadPresets(selectedUserId)
        }
    }, [selectedUserId])

    const loadUsers = async () => {
        const data = await authService.getUsers()
        setUsers(data)
    }

    const handleKmlUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        try {
            const text = await file.text()
            const kmlData = parseKML(text)
            setSettings({
                ...settings,
                kmlData,
                selectedHubs: kmlData.polygons.map(p => p.folderName).filter((v, i, a) => a.indexOf(v) === i),
                selectedZones: kmlData.polygons.map(p => `${p.folderName}:${p.name}`)
            })
            toast.success('KML файл успешно загружен')
        } catch (error) {
            toast.error('Ошибка при разборе KML файла')
        }
    }

    const loadPresets = async (userId: number) => {
        setLoading(true)
        try {
            const data = await authService.getUserPresets(userId)
            setPresets(data)
            setSettings(data?.settings || {})
        } catch (error) {
            toast.error('Ошибка загрузки настроек')
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
        if (!selectedUserId) return

        const result = await authService.updateUserPresets(selectedUserId, settings)
        if (result.success) {
            toast.success('Настройки обновлены')
            loadPresets(selectedUserId)
        } else {
            toast.error(result.error || 'Ошибка сохранения')
        }
    }

    const filteredUsers = users.filter(user =>
        user.username.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const selectedUser = users.find(u => u.id === selectedUserId)

    return (
        <div className="p-4 space-y-6 max-w-[1600px] mx-auto min-h-screen">
            {/* Заголовок */}
            <div className={clsx(
                "p-8 rounded-3xl shadow-2xl relative overflow-hidden mb-8 transition-all duration-500",
                isDark
                    ? "bg-gradient-to-br from-gray-900 via-blue-900/40 to-indigo-900/40 border border-blue-500/20 shadow-blue-900/20"
                    : "bg-gradient-to-br from-white via-blue-50/50 to-indigo-50/50 border border-blue-100 shadow-blue-100"
            )}>
                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 p-8 opacity-10">
                    <CloudArrowUpIcon className="w-32 h-32 text-blue-500" />
                </div>

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2.5 rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/20 group-hover:scale-110 transition-transform duration-300">
                                <CogIcon className="w-6 h-6 text-white" />
                            </div>
                            <h1 className={clsx(
                                'text-3xl font-black tracking-tight',
                                isDark ? 'text-white' : 'text-gray-900'
                            )}>
                                Управление юзерами
                            </h1>
                        </div>
                        <p className={clsx(
                            'text-sm font-medium max-w-2xl leading-relaxed',
                            isDark ? 'text-gray-400' : 'text-gray-600'
                        )}>

                            API ключи и настройка пользователя.
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Список пользователей */}
                <div className={clsx(
                    'lg:col-span-3 rounded-3xl border p-6 flex flex-col h-[calc(100vh-250px)] sticky top-4',
                    isDark
                        ? 'bg-gray-800/80 border-gray-700/50 backdrop-blur-xl'
                        : 'bg-white/80 border-gray-200 backdrop-blur-xl shadow-xl shadow-gray-200/50'
                )}>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className={clsx(
                            'text-lg font-black tracking-tight',
                            isDark ? 'text-white' : 'text-gray-900'
                        )}>
                            Операторы
                        </h2>
                        <span className={clsx(
                            "px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest",
                            isDark ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-600"
                        )}>
                            {filteredUsers.length} всего
                        </span>
                    </div>

                    {/* Поиск */}
                    <div className="relative mb-6">
                        <MagnifyingGlassIcon className={clsx(
                            'absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors',
                            isDark ? 'text-gray-500 group-focus-within:text-blue-400' : 'text-gray-400 group-focus-within:text-blue-500'
                        )} />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Найти пользователя..."
                            className={clsx(
                                'w-full pl-11 pr-4 py-3 rounded-2xl border text-sm font-medium transition-all outline-none',
                                isDark
                                    ? 'bg-gray-900/50 border-gray-700 text-white placeholder-gray-600 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10'
                                    : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
                            )}
                        />
                    </div>

                    {/* Список */}
                    <div className="space-y-2 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        {filteredUsers.map((user) => (
                            <button
                                key={user.id}
                                onClick={() => setSelectedUserId(user.id)}
                                className={clsx(
                                    'w-full text-left p-4 rounded-2xl transition-all duration-300 border group box-border',
                                    selectedUserId === user.id
                                        ? isDark
                                            ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/30'
                                            : 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20'
                                        : isDark
                                            ? 'bg-gray-900/30 border-transparent hover:bg-gray-700/50 text-gray-300'
                                            : 'bg-white border-transparent hover:border-blue-100 hover:bg-blue-50/50 text-gray-700 shadow-sm'
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={clsx(
                                        "w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 transition-transform group-hover:scale-105 duration-300",
                                        selectedUserId === user.id
                                            ? "bg-white/20 text-white"
                                            : isDark ? "bg-gray-800 text-blue-400" : "bg-blue-50 text-blue-600"
                                    )}>
                                        {user.username.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="font-black text-sm truncate">{user.username}</div>
                                        <div className={clsx(
                                            "text-[10px] font-bold truncate transition-colors",
                                            selectedUserId === user.id ? "text-blue-100" : "text-gray-500"
                                        )}>
                                            {user.divisionId ? `ID: ${user.divisionId} ` : 'Без группы'}
                                        </div>
                                    </div>
                                    {selectedUserId === user.id && (
                                        <div className="ml-auto">
                                            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                        </div>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Редактор настроек */}
                <div className={clsx(
                    'lg:col-span-9 rounded-3xl border flex flex-col min-h-[calc(100vh-250px)] transition-all duration-500',
                    isDark
                        ? 'bg-gray-800/50 border-gray-700/50 shadow-2xl shadow-black/20'
                        : 'bg-white border-gray-200 shadow-2xl shadow-blue-100/50'
                )}>
                    {!selectedUser ? (
                        <div className="flex flex-col items-center justify-center p-20 text-center space-y-4">
                            <div className={clsx(
                                "w-20 h-20 rounded-3xl flex items-center justify-center mb-4",
                                isDark ? "bg-gray-700/50" : "bg-gray-50"
                            )}>
                                <MagnifyingGlassIcon className="w-10 h-10 text-gray-400" />
                            </div>
                            <h3 className={clsx(
                                "text-xl font-black",
                                isDark ? "text-white" : "text-gray-900"
                            )}>
                                Пользователь не выбран
                            </h3>
                            <p className={clsx(
                                "text-sm max-w-xs",
                                isDark ? "text-gray-400" : "text-gray-500"
                            )}>
                                Выбор учетки слева
                            </p>
                        </div>
                    ) : loading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <LoadingSpinner />
                        </div>
                    ) : (
                        <div className="flex flex-col h-full overflow-hidden">
                            {/* User Header */}
                            <div className={clsx(
                                "p-8 border-b transition-colors",
                                isDark ? "border-gray-700/50 bg-gray-900/20" : "border-gray-100 bg-gray-50/30"
                            )}>
                                <div className="flex items-center justify-between gap-6">
                                    <div className="flex items-center gap-5">
                                        <div className={clsx(
                                            "w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black shadow-xl",
                                            isDark ? "bg-blue-600 text-white" : "bg-blue-500 text-white"
                                        )}>
                                            {selectedUser.username.substring(0, 1).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3 mb-1">
                                                <h2 className={clsx(
                                                    'text-2xl font-black tracking-tight',
                                                    isDark ? 'text-white' : 'text-gray-900'
                                                )}>
                                                    {selectedUser.username}
                                                </h2>
                                                <span className={clsx(
                                                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                                                    selectedUser.role === 'admin'
                                                        ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                                                        : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                                )}>
                                                    {selectedUser.role}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4 text-sm font-medium">
                                                <span className={isDark ? "text-gray-400" : "text-gray-500"}>
                                                    {selectedUser.email}
                                                </span>
                                                {selectedUser.divisionId && (
                                                    <>
                                                        <div className="w-1 h-1 rounded-full bg-gray-600" />
                                                        <span className="text-blue-500">Подразделение: {selectedUser.divisionId}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="hidden md:flex flex-col items-end text-right">
                                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Статус Редактирования</div>
                                        <div className={clsx(
                                            "px-4 py-2 rounded-xl text-xs font-black border flex items-center gap-2 transition-all",
                                            selectedUser.canModifySettings
                                                ? "bg-green-500/10 text-green-400 border-green-500/20"
                                                : "bg-red-500/10 text-red-400 border-red-500/20"
                                        )}>
                                            <div className={clsx("w-2 h-2 rounded-full", selectedUser.canModifySettings ? "bg-green-500" : "bg-red-500")} />
                                            {selectedUser.canModifySettings ? 'РАЗРЕШЕНО' : 'ЗАБЛОКИРОВАНО'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar p-1">

                                {/* SECTION: API Keys */}
                                <CollapsibleSection
                                    isDark={isDark}
                                    icon={<KeyIcon className="h-5 w-5" />}
                                    title="API Ключи и Интеграции"
                                    defaultOpen={true}
                                >
                                    <div className="space-y-4">
                                        <div>
                                            <label className={clsx('block text-xs font-bold mb-1.5 uppercase tracking-wide', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                                Google Maps API Key
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type="password"
                                                    value={settings.googleMapsApiKey || ''}
                                                    onChange={(e) => setSettings({ ...settings, googleMapsApiKey: e.target.value })}
                                                    placeholder="AIza..."
                                                    className={clsx(
                                                        'w-full pl-10 pr-4 py-2.5 rounded-xl border font-mono text-sm transition-all focus:ring-2',
                                                        isDark
                                                            ? 'bg-gray-900/50 border-gray-600 text-white focus:border-blue-500 focus:ring-blue-500/20'
                                                            : 'bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500/20'
                                                    )}
                                                />
                                                <KeyIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className={clsx('block text-xs font-bold mb-1.5 uppercase tracking-wide', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                                    Mapbox Token для загруженности дорог
                                                </label>
                                                <input
                                                    type="password"
                                                    value={settings.mapboxToken || ''}
                                                    onChange={(e) => setSettings({ ...settings, mapboxToken: e.target.value })}
                                                    placeholder="pk..."
                                                    className={clsx(
                                                        'w-full px-4 py-2.5 rounded-xl border font-mono text-xs transition-all focus:ring-2',
                                                        isDark
                                                            ? 'bg-gray-900/50 border-gray-600 text-white focus:border-blue-500 focus:ring-blue-500/20'
                                                            : 'bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500/20'
                                                    )}
                                                />
                                            </div>
                                            <div>
                                                <label className={clsx('block text-xs font-bold mb-1.5 uppercase tracking-wide', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                                    FastOperator ключ
                                                </label>
                                                <input
                                                    type="password"
                                                    value={settings.fastopertorApiKey || ''}
                                                    onChange={(e) => setSettings({ ...settings, fastopertorApiKey: e.target.value })}
                                                    placeholder="Secret Key"
                                                    className={clsx(
                                                        'w-full px-4 py-2.5 rounded-xl border font-mono text-xs transition-all focus:ring-2',
                                                        isDark
                                                            ? 'bg-gray-900/50 border-gray-600 text-white focus:border-blue-500 focus:ring-blue-500/20'
                                                            : 'bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500/20'
                                                    )}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </CollapsibleSection>

                                {/* (KML) */}
                                <CollapsibleSection
                                    isDark={isDark}
                                    icon={<MapIcon className="h-5 w-5" />}
                                    title="Зоны доставки (KML)"
                                >
                                    <div className="space-y-4">
                                        <div className={clsx(
                                            'p-4 rounded-xl border-l-4 mb-4',
                                            isDark ? 'bg-blue-500/10 border-blue-500 text-blue-200' : 'bg-blue-50 border-blue-500 text-blue-800'
                                        )}>
                                            <p className="text-xs leading-relaxed opacity-90">
                                                Настройка зон.
                                            </p>
                                        </div>

                                        {/* Ссылка для синхронизации */}
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Ссылка на Google My Maps</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    className={clsx(
                                                        'flex-1 px-4 py-2.5 rounded-xl border text-sm transition-all focus:ring-2',
                                                        isDark
                                                            ? 'bg-gray-900/50 border-gray-600 text-white focus:border-blue-500 focus:ring-blue-500/20 placeholder-gray-600'
                                                            : 'bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500/20'
                                                    )}
                                                    placeholder="https://www.google.com/maps/d/viewer?mid=..."
                                                    value={settings.kmlSourceUrl || ''}
                                                    onChange={(e) => setSettings({ ...settings, kmlSourceUrl: e.target.value })}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => syncKmlFromUrl(settings.kmlSourceUrl)}
                                                    disabled={isSyncingKml || !settings.kmlSourceUrl}
                                                    className={clsx(
                                                        'px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 text-xs shadow-lg shadow-blue-500/20',
                                                        isDark ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white',
                                                        (isSyncingKml || !settings.kmlSourceUrl) && 'opacity-50 cursor-not-allowed shadow-none'
                                                    )}
                                                >
                                                    {isSyncingKml ? <LoadingSpinner size="sm" /> : <ArrowPathIcon className="h-4 w-4" />}
                                                    {isSyncingKml ? '...' : 'Синхронизация'}
                                                </button>
                                            </div>
                                            <div className="flex items-center justify-between mt-2">
                                                <label className="inline-flex items-center space-x-2 cursor-pointer group">
                                                    <input
                                                        type="checkbox"
                                                        className="checkbox rounded-md"
                                                        checked={settings.autoSyncKml || false}
                                                        onChange={(e) => setSettings({ ...settings, autoSyncKml: e.target.checked })}
                                                    />
                                                    <span className="text-xs text-gray-500 group-hover:text-blue-500 transition-colors">Авто-обновление при входе</span>
                                                </label>
                                                {settings.lastKmlSync && (
                                                    <span className="text-[10px] text-gray-400 font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg">
                                                        Обновлено: {settings.lastKmlSync}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="relative py-2">
                                            <div className="absolute inset-0 flex items-center">
                                                <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                                            </div>
                                            <div className="relative flex justify-center text-xs uppercase">
                                                <span className={clsx("px-2 font-black tracking-widest text-gray-400", isDark ? "bg-gray-800" : "bg-white")}>
                                                    ИЛИ
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-3">
                                            <input
                                                type="file"
                                                accept=".kml"
                                                onChange={handleKmlUpload}
                                                className="hidden"
                                                id="admin-kml-upload"
                                            />
                                            <label
                                                htmlFor="admin-kml-upload"
                                                className={clsx(
                                                    'px-4 py-3 rounded-xl font-medium cursor-pointer transition-all flex items-center gap-2 text-sm border border-dashed flex-1 justify-center',
                                                    isDark
                                                        ? 'bg-gray-800/50 border-gray-600 hover:border-blue-500 hover:bg-blue-500/10 text-gray-300 hover:text-blue-400'
                                                        : 'bg-gray-50 border-gray-300 hover:border-blue-500 hover:bg-blue-50 text-gray-600 hover:text-blue-600'
                                                )}
                                            >
                                                <CloudArrowUpIcon className="h-5 w-5" />
                                                Загрузить файл вручную (.kml)
                                            </label>

                                            {settings.kmlData && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSettings({
                                                            ...settings,
                                                            kmlData: null,
                                                            selectedHubs: [],
                                                            selectedZones: []
                                                        })
                                                        toast.success('Данные KML удалены')
                                                    }}
                                                    className={clsx(
                                                        'px-4 py-3 rounded-xl font-medium transition-all flex items-center gap-2 text-sm',
                                                        isDark ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400' : 'bg-red-50 hover:bg-red-100 text-red-600'
                                                    )}
                                                >
                                                    <TrashIcon className="h-5 w-5" />
                                                </button>
                                            )}
                                        </div>

                                        {settings.kmlData && (
                                            <div className={clsx(
                                                'p-5 rounded-2xl border space-y-6',
                                                isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'
                                            )}>
                                                {/* Preview Map */}
                                                <div className="h-64 rounded-xl overflow-hidden shadow-inner border border-gray-200 dark:border-gray-700">
                                                    <KmlPreviewMap
                                                        isDark={isDark}
                                                        kmlData={settings.kmlData}
                                                        selectedHubs={settings.selectedHubs || []}
                                                        selectedZones={settings.selectedZones || []}
                                                    />
                                                </div>

                                                {/* Hub Selection */}
                                                <div className="space-y-3">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                                                        Активные локации
                                                    </label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {Array.from(new Set(settings.kmlData.polygons.map((p: any) => p.folderName)))
                                                            .sort()
                                                            .map((hub: any) => {
                                                                const isSelected = settings.selectedHubs?.includes(hub);
                                                                return (
                                                                    <label key={hub} className={clsx(
                                                                        "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-all select-none",
                                                                        isSelected
                                                                            ? (isDark ? "bg-indigo-500/20 border-indigo-500 text-indigo-400 shadow-sm shadow-indigo-900/20" : "bg-indigo-50 border-indigo-500 text-indigo-700")
                                                                            : (isDark ? "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600" : "bg-white border-gray-200 text-gray-400 hover:border-gray-300")
                                                                    )}>
                                                                        <input
                                                                            type="checkbox"
                                                                            className="hidden"
                                                                            checked={isSelected}
                                                                            onChange={(e) => {
                                                                                const current = settings.selectedHubs || [];
                                                                                if (e.target.checked) {
                                                                                    setSettings({ ...settings, selectedHubs: [...current, hub] });
                                                                                } else {
                                                                                    const newHubs = current.filter((h: string) => h !== hub);
                                                                                    const newZones = (settings.selectedZones || []).filter((z: string) => !z.startsWith(`${hub}:`));
                                                                                    setSettings({ ...settings, selectedHubs: newHubs, selectedZones: newZones });
                                                                                }
                                                                            }}
                                                                        />
                                                                        {hub as string}
                                                                    </label>
                                                                );
                                                            })}
                                                    </div>
                                                </div>

                                                {/* Hub and Zone Selection */}
                                                {settings.selectedHubs?.length > 0 && (
                                                    <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Активные сектора / Зоны</label>
                                                            <div className="flex flex-wrap items-center gap-3">
                                                                <div className="relative group min-w-[200px]">
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Поиск зоны..."
                                                                        value={zoneSearchTerm}
                                                                        onChange={(e) => setZoneSearchTerm(e.target.value)}
                                                                        className={clsx(
                                                                            "w-full pl-8 pr-3 py-1.5 rounded-xl border text-[11px] font-bold outline-none transition-all",
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
                                                                            const allSelectedHubZones = settings.kmlData.polygons
                                                                                .filter((p: any) => settings.selectedHubs.includes(p.folderName))
                                                                                .map((z: any) => `${z.folderName}:${z.name}`);
                                                                            setSettings({ ...settings, selectedZones: allSelectedHubZones });
                                                                        }}
                                                                        className="text-[10px] font-black uppercase tracking-tighter text-gray-500 hover:text-gray-400 transition-colors"
                                                                    >
                                                                        Выбрать все
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setSettings({ ...settings, selectedZones: [] })}
                                                                        className="text-[10px] font-black uppercase tracking-tighter text-gray-500 hover:text-gray-400 transition-colors"
                                                                    >
                                                                        Сбросить
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className={clsx(
                                                            "flex flex-wrap gap-1.5 max-h-60 overflow-y-auto p-1 custom-scrollbar",
                                                            isDark ? "scrollbar-thumb-gray-700" : "scrollbar-thumb-gray-300"
                                                        )}>
                                                            {settings.kmlData.polygons
                                                                .filter((p: any) => settings.selectedHubs.includes(p.folderName))
                                                                .filter((p: any) => !zoneSearchTerm || p.name.toLowerCase().includes(zoneSearchTerm.toLowerCase()) || p.folderName.toLowerCase().includes(zoneSearchTerm.toLowerCase()))
                                                                .sort((a: any, b: any) => a.name.localeCompare(b.name))
                                                                .map((zone: any) => {
                                                                    const zoneKey = `${zone.folderName}:${zone.name}`;
                                                                    const isSelected = settings.selectedZones?.includes(zoneKey);
                                                                    return (
                                                                        <label key={zoneKey} className={clsx(
                                                                            "flex items-center gap-2 px-2 py-1 rounded-xl border text-[10px] font-bold cursor-pointer transition-all",
                                                                            isSelected
                                                                                ? (isDark ? "bg-purple-500/20 border-purple-500 text-purple-400" : "bg-purple-50 border-purple-500 text-purple-700")
                                                                                : (isDark ? "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600" : "bg-white border-gray-200 text-gray-400 hover:border-gray-300")
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
                                                                                        const newZones = current.filter((z: string) => z !== zoneKey);
                                                                                        setSettings({ ...settings, selectedZones: newZones });
                                                                                    }
                                                                                }}
                                                                            />
                                                                            <span className="opacity-40 font-black mr-0.5 text-[8px]">{zone.folderName}:</span>
                                                                            {zone.name}
                                                                        </label>
                                                                    );
                                                                })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </CollapsibleSection>

                                {/* Auto-sync FO (Swagger) */}
                                <CollapsibleSection
                                    isDark={isDark}
                                    icon={<ArrowPathIcon className="h-5 w-5" />}
                                    title="Интеграция FastOperator API"
                                >
                                    <DashboardSettingsPanel
                                        isDark={isDark}
                                        initialSettings={settings}
                                        onSettingsChange={(newSettings) => setSettings(prev => ({ ...prev, ...newSettings }))}
                                        onManualSync={() => {
                                            toast.success('Запущен процесс синхронизации Dashboard API...')
                                        }}
                                    />
                                </CollapsibleSection>

                                {/* Filter Anomaly */}
                                <CollapsibleSection
                                    isDark={isDark}
                                    icon={<ShieldCheckIcon className="h-5 w-5" />}
                                    title="Контроль качества и Фильтры"
                                >
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between p-4 rounded-xl border bg-gradient-to-r from-transparent to-gray-50 dark:to-gray-800/50 border-gray-200 dark:border-gray-700">
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="checkbox"
                                                    id="preset_anomalyFilter"
                                                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    checked={settings.anomalyFilterEnabled ?? true}
                                                    onChange={(e) => setSettings({ ...settings, anomalyFilterEnabled: e.target.checked })}
                                                />
                                                <div>
                                                    <label htmlFor="preset_anomalyFilter" className={clsx('block text-sm font-bold', isDark ? 'text-white' : 'text-gray-900')}>
                                                        Активный фильтр аномалий
                                                    </label>
                                                    <p className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                                        Автоматически помечать подозрительные заказы
                                                    </p>
                                                </div>
                                            </div>
                                            <div className={clsx("px-2 py-1 rounded text-[10px] font-black uppercase", settings.anomalyFilterEnabled ? "bg-green-500/10 text-green-500" : "bg-gray-500/10 text-gray-500")}>
                                                {settings.anomalyFilterEnabled ? 'ON' : 'OFF'}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <label className={clsx('block text-xs font-bold mb-2', isDark ? 'text-gray-400' : 'text-gray-600')}>
                                                    Макс. среднее на заказ (км)
                                                </label>
                                                <input
                                                    type="number" step="1" min="1"
                                                    className={clsx('w-full px-3 py-2 rounded-lg border text-sm', isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300')}
                                                    value={settings.anomalyMaxAvgPerOrderKm ?? 25}
                                                    onChange={(e) => setSettings({ ...settings, anomalyMaxAvgPerOrderKm: parseInt(e.target.value) })}
                                                />
                                            </div>
                                            <div>
                                                <label className={clsx('block text-xs font-bold mb-2', isDark ? 'text-gray-400' : 'text-gray-600')}>
                                                    Качество адреса (0-100)
                                                </label>
                                                <input
                                                    type="number" step="5" min="0" max="100"
                                                    className={clsx('w-full px-3 py-2 rounded-lg border text-sm', isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300')}
                                                    value={settings.addressQualityThreshold ?? 60}
                                                    onChange={(e) => setSettings({ ...settings, addressQualityThreshold: parseInt(e.target.value) })}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-3 pt-2">
                                            <label className="flex items-center gap-3 p-3 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-colors cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                                                    checked={settings.enableCoordinateValidation ?? true}
                                                    onChange={(e) => setSettings({ ...settings, enableCoordinateValidation: e.target.checked })}
                                                />
                                                <span className={clsx('text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}>Проверять координаты на разумность (Geocoding)</span>
                                            </label>
                                            <label className="flex items-center gap-3 p-3 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-colors cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                                                    checked={settings.enableAdaptiveThresholds ?? true}
                                                    onChange={(e) => setSettings({ ...settings, enableAdaptiveThresholds: e.target.checked })}
                                                />
                                                <span className={clsx('text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}>Использовать адаптивные пороги для разных городов</span>
                                            </label>
                                        </div>
                                    </div>
                                </CollapsibleSection>

                                {/* Critical Route Limit */}
                                <CollapsibleSection
                                    isDark={isDark}
                                    icon={<TrashIcon className="h-5 w-5" />} // Using trash icon as placeholder 'danger' icon logic
                                    title="Критические лимиты"
                                >
                                    <div>
                                        <div className={clsx('text-xs mb-2 font-bold', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                            Максимально допустимое расстояние маршрута (км)
                                        </div>
                                        <input
                                            type="number" step="1" min="1"
                                            className={clsx('w-full px-3 py-2 rounded-lg border text-sm font-mono', isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300')}
                                            value={settings.maxCriticalRouteDistanceKm ?? 120}
                                            onChange={(e) => setSettings({ ...settings, maxCriticalRouteDistanceKm: parseInt(e.target.value) })}
                                        />
                                        <div className={clsx('text-[10px] mt-2 leading-relaxed', isDark ? 'text-gray-500' : 'text-gray-500')}>
                                            Внимание: Если маршрут превысит это значение, он будет помечен как критический, и система выдаст предупреждение. Это защита от построения нереалистичных маршрутов.
                                        </div>
                                    </div>
                                </CollapsibleSection>

                                {/* SECTION: General Settings */}
                                <CollapsibleSection
                                    isDark={isDark}
                                    icon={<CogIcon className="h-5 w-5" />}
                                    title="Общие настройки"
                                    defaultOpen={true}
                                >
                                    <div className="space-y-6">
                                        <CityBiasSection
                                            isDark={isDark}
                                            value={settings.cityBias || ''}
                                            onChange={(v) => setSettings({ ...settings, cityBias: v })}
                                        />

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className={clsx('block text-xs font-bold mb-1.5 uppercase tracking-wide', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                                    Адрес начала маршрута
                                                </label>
                                                <input
                                                    type="text"
                                                    value={settings.defaultStartAddress || ''}
                                                    onChange={(e) => setSettings({ ...settings, defaultStartAddress: e.target.value })}
                                                    placeholder="Например: Макеевская 7, Киев"
                                                    className={clsx('w-full px-3 py-2 rounded-lg border text-sm', isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300')}
                                                />
                                            </div>
                                            <div>
                                                <label className={clsx('block text-xs font-bold mb-1.5 uppercase tracking-wide', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                                    Адрес окончания маршрута
                                                </label>
                                                <input
                                                    type="text"
                                                    value={settings.defaultEndAddress || ''}
                                                    onChange={(e) => setSettings({ ...settings, defaultEndAddress: e.target.value })}
                                                    placeholder="Например: Макеевская 7, Киев"
                                                    className={clsx('w-full px-3 py-2 rounded-lg border text-sm', isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300')}
                                                />
                                            </div>
                                        </div>


                                    </div>
                                </CollapsibleSection>

                                <div className="pt-6 sticky bottom-0 z-20 pb-4 border-t mt-4 backdrop-blur-md bg-opacity-90 transition-all">
                                    <div className="bg-inherit absolute inset-0 opacity-95"></div>
                                    <button
                                        onClick={handleSave}
                                        className={clsx(
                                            'relative w-full px-4 py-4 rounded-2xl font-black text-lg text-white shadow-2xl transition-all transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-3',
                                            isDark
                                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-900/40'
                                                : 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 shadow-blue-200/50'
                                        )}
                                    >
                                        <CloudArrowUpIcon className="h-6 w-6" />
                                        <span>Сохранить настройки</span>
                                    </button>
                                </div>
                            </div>

                            {/* Информация об обновлении */}
                            {presets?.updatedAt && (
                                <div className={clsx(
                                    'mt-4 p-3 rounded-lg text-sm',
                                    isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-50 text-gray-600'
                                )}>
                                    Последнее обновление: {new Date(presets.updatedAt).toLocaleString('ru-RU')}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
