import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { clsx } from 'clsx'
import { useTheme } from '../contexts/ThemeContext'
import {
    MagnifyingGlassIcon,
    FunnelIcon,
    ChatBubbleLeftRightIcon,
    DocumentTextIcon,
    ArrowPathIcon,
    LinkIcon,
    XMarkIcon
} from '@heroicons/react/24/outline'
import { telegramService } from '../services/telegramService'
import { toast } from 'react-hot-toast'
import { DashboardHeader } from '../components/shared/DashboardHeader'

interface TelegramChat {
    id: string
    name: string
    type: 'group' | 'channel' | 'private'
    isSelected: boolean
}

interface SearchResult {
    chatId: string
    chatName: string
    messageId: number
    messageText: string
    date: Date
    author?: string
    matchedQuery: string
}

interface TelegramConnection {
    apiId: string
    apiHash: string
    phoneNumber: string
}

export const TelegramParsing: React.FC = () => {
    const { isDark } = useTheme()
    const [activeTab, setActiveTab] = useState<'telegram' | 'registry'>('telegram')

    // Состояния для подключения к Telegram
    const [showConnectionModal, setShowConnectionModal] = useState(false)

    // Загружаем сохраненные данные подключения из localStorage
    const loadSavedConnectionData = useCallback(() => {
        try {
            const saved = localStorage.getItem('telegram_connection_data')
            if (saved) {
                return JSON.parse(saved)
            }
        } catch (error) {
            console.error('Ошибка загрузки сохраненных данных подключения:', error)
        }
        return { apiId: '', apiHash: '', phoneNumber: '' }
    }, [])

    const [connectionData, setConnectionData] = useState<TelegramConnection>(loadSavedConnectionData)
    const [isConnecting, setIsConnecting] = useState(false)
    const [isConnected, setIsConnected] = useState(false)
    const [needsAuth, setNeedsAuth] = useState(false)
    const [phoneCodeHash, setPhoneCodeHash] = useState<string | null>(null)
    const [phoneCode, setPhoneCode] = useState('')

    // Сохранение данных подключения в localStorage
    useEffect(() => {
        if (connectionData.apiId || connectionData.apiHash) {
            localStorage.setItem('telegram_connection_data', JSON.stringify(connectionData))
        }
    }, [connectionData])

    // Состояния для парсинга Telegram
    const [searchQuery, setSearchQuery] = useState('')
    const [isSearching, setIsSearching] = useState(false)
    const [searchResults, setSearchResults] = useState<SearchResult[]>([])
    const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set())
    const [availableChats, setAvailableChats] = useState<TelegramChat[]>([])
    const [showChatFilter, setShowChatFilter] = useState(false)
    const [chatFilterType, _setChatFilterType] = useState<'all' | 'group' | 'channel' | 'private' | 'favorites'>('all')
    const [chatSearchTerm, setChatSearchTerm] = useState('')
    const [favoriteChats, setFavoriteChats] = useState<Set<string>>(new Set())

    // Извлечение семизначных цифр из запроса
    const extractSevenDigitNumbers = useCallback((text: string): string[] => {
        return telegramService.extractSevenDigitNumbers(text)
    }, [])

    // Загрузка списка чатов (определяем раньше, чтобы использовать в других функциях)
    const loadChats = useCallback(async () => {
        if (!isConnected) return
        try {
            const chats = await telegramService.getChats()
            const telegramChats: TelegramChat[] = chats.map(chat => ({
                id: chat.id,
                name: chat.name,
                type: chat.type,
                isSelected: false // По умолчанию все выключены
            }))
            setAvailableChats(telegramChats)
            setSelectedChats(new Set()) // По умолчанию ничего не выбрано
        } catch (error) {
            console.error('Ошибка загрузки чатов:', error)
            toast.error('Не удалось загрузить список чатов. Проверьте подключение к Telegram.')
        }
    }, [isConnected])

    // Валидация данных подключения (номер телефона опционален)
    /*
    const _validateConnectionData = useCallback((data: TelegramConnection): string | null => {
        // Валидация API ID
        if (!data.apiId || data.apiId.trim().length === 0) {
            return 'API ID не может быть пустым'
        }
        const apiIdNum = parseInt(data.apiId.trim())
        if (isNaN(apiIdNum) || apiIdNum <= 0) {
            return 'API ID должен быть положительным числом'
        }

        // Валидация API Hash
        if (!data.apiHash || data.apiHash.trim().length < 20) {
            return 'API Hash должен быть строкой длиной не менее 20 символов'
        }

        // Очищаем API Hash от всех невидимых символов
        const cleanApiHash = data.apiHash.replace(/[\s\n\r\t\u00A0\u2000-\u200B\u2028\u2029\uFEFF]/g, '').trim()
        if (cleanApiHash.length < 20) {
            return `API Hash должен быть строкой длиной не менее 20 символов (после очистки: ${cleanApiHash.length})`
        }

        // Проверяем, что API Hash содержит только hex символы
        if (!/^[a-f0-9]+$/i.test(cleanApiHash)) {
            return 'API Hash должен содержать только шестнадцатеричные символы (0-9, a-f)'
        }

        // Валидация номера телефона (опционально - только если указан)
        if (data.phoneNumber && data.phoneNumber.trim()) {
            // Убираем все нецифровые символы кроме плюса в начале
            let cleanPhone = data.phoneNumber.trim()
            // Убираем пробелы, дефисы, скобки
            cleanPhone = cleanPhone.replace(/[\s\-\(\)]/g, '')
            // Если есть плюс, убираем его для проверки
            const phoneWithoutPlus = cleanPhone.startsWith('+') ? cleanPhone.substring(1) : cleanPhone
            // Проверяем, что после плюса только цифры
            if (!/^\d+$/.test(phoneWithoutPlus)) {
                return 'Номер телефона должен содержать только цифры (можно с + в начале)'
            }
            // Проверяем длину (от 7 до 15 цифр)
            if (phoneWithoutPlus.length < 7 || phoneWithoutPlus.length > 15) {
                return 'Номер телефона должен содержать от 7 до 15 цифр'
            }
            // Проверяем, что номер не начинается с 0
            if (phoneWithoutPlus.startsWith('0')) {
                return 'Номер телефона не должен начинаться с 0. Используйте формат +380XXXXXXXXX или 380XXXXXXXXX'
            }
        }
        return null
    }, [])
    */

    // Подключение к Telegram
    const handleConnect = useCallback(async () => {
        if (!connectionData.apiId || !connectionData.apiHash) {
            toast.error('Заполните API ID и API Hash для подключения')
            return
        }
        setIsConnecting(true)
        try {
            // Очищаем API Hash от всех невидимых символов перед отправкой
            const cleanApiHash = connectionData.apiHash.replace(/[\s\n\r\t\u00A0\u2000-\u200B\u2028\u2029\uFEFF]/g, '').trim()
            const result = await telegramService.initialize(
                connectionData.apiId.trim(),
                cleanApiHash,
                connectionData.phoneNumber?.trim() || ''
            )

            if (result.success) {
                // Сохраняем данные подключения в localStorage
                localStorage.setItem('telegram_connection_data', JSON.stringify(connectionData))
                // Устанавливаем состояние подключения
                setIsConnected(true)
                setNeedsAuth(false)
                setShowConnectionModal(false)
                // Загружаем список чатов сразу
                await loadChats()
                toast.success('Успешно подключено к Telegram!')
                // Проверяем статус в фоне для синхронизации
                setTimeout(async () => {
                    const status = await telegramService.checkConnectionStatus()
                    if (status) {
                        setIsConnected(true)
                    }
                }, 1000)
            } else if (result.needsAuth) {
                // Требуется код подтверждения
                setNeedsAuth(true)
                setPhoneCodeHash(result.phoneCodeHash || null)
                toast.success('Код подтверждения отправлен в Telegram')
            } else {
                const errorMsg = result.error || 'Не удалось подключиться к Telegram. Проверьте данные.'
                toast.error(errorMsg)
            }
        } catch (error: any) {
            console.error('Ошибка подключения:', error)
            toast.error(`Ошибка подключения: ${error.message || 'Неизвестная ошибка'}`)
        } finally {
            setIsConnecting(false)
        }
    }, [connectionData, loadChats])

    // Завершение авторизации с кодом
    const handleCompleteAuth = useCallback(async () => {
        if (!phoneCode || phoneCode.trim().length < 4) {
            toast.error('Введите код подтверждения (минимум 4 символа)')
            return
        }
        if (!phoneCodeHash) {
            toast.error('Ошибка: сессия истекла. Попробуйте подключиться заново.')
            return
        }
        setIsConnecting(true)
        try {
            const cleanApiHash = connectionData.apiHash.replace(/[\s\n\r\t\u00A0\u2000-\u200B\u2028\u2029\uFEFF]/g, '').trim()
            const result = await telegramService.completeAuth(
                connectionData.apiId.trim(),
                cleanApiHash,
                connectionData.phoneNumber?.trim() || '',
                phoneCode.trim(),
                phoneCodeHash
            )

            if (result.success) {
                localStorage.setItem('telegram_connection_data', JSON.stringify(connectionData))
                setIsConnected(true)
                setNeedsAuth(false)
                setPhoneCode('')
                setPhoneCodeHash(null)
                setShowConnectionModal(false)
                await loadChats()
                toast.success('Авторизация завершена!')
                setTimeout(async () => {
                    const status = await telegramService.checkConnectionStatus()
                    if (status) {
                        setIsConnected(true)
                    }
                }, 1000)
            } else {
                toast.error(result.error || 'Не удалось завершить авторизацию.')
            }
        } catch (error: any) {
            console.error('Ошибка завершения авторизации:', error)
            toast.error(`Ошибка: ${error.message || 'Неизвестная ошибка'}`)
        } finally {
            setIsConnecting(false)
        }
    }, [connectionData, phoneCode, phoneCodeHash, loadChats])

    // Отключение от Telegram
    const handleDisconnect = useCallback(async () => {
        try {
            await telegramService.disconnect()
            setIsConnected(false)
            setAvailableChats([])
            setSelectedChats(new Set())
            setSearchResults([])
            localStorage.removeItem('telegram_connection_data')
            setConnectionData({ apiId: '', apiHash: '', phoneNumber: '' })
        } catch (error) {
            console.error('Ошибка отключения:', error)
        }
    }, [])

    // Обработка поиска
    const handleSearch = useCallback(async () => {
        if (!searchQuery.trim()) {
            toast.error('Введите запрос для поиска')
            return
        }

        const actualStatus = await telegramService.checkConnectionStatus()
        setIsConnected(actualStatus)

        if (!actualStatus) {
            toast.error('Сначала подключитесь к Telegram')
            setShowConnectionModal(true)
            return
        }

        if (selectedChats.size === 0) {
            toast.error('Выберите хотя бы один чат для поиска')
            return
        }

        setIsSearching(true)
        setSearchResults([])
        try {
            const numbers = extractSevenDigitNumbers(searchQuery)
            const now = new Date()
            const weekAgo = new Date(now)
            weekAgo.setDate(weekAgo.getDate() - 7)
            weekAgo.setHours(0, 0, 0, 0)

            const messages = await telegramService.searchMessages({
                query: searchQuery,
                chatIds: Array.from(selectedChats),
                dateFrom: weekAgo,
                dateTo: now,
                limit: 30
            })

            const results: SearchResult[] = messages.map(msg => {
                let matched = searchQuery.trim()
                let matchedVariant = ''
                for (const num of numbers) {
                    if (telegramService.containsNumberOrPart(msg.text, num)) {
                        if (msg.text.includes(num)) {
                            matched = num
                            matchedVariant = num
                        } else {
                            const variants = telegramService.generateSearchVariants(num)
                            for (const variant of variants) {
                                if (variant !== num && msg.text.includes(variant)) {
                                    matched = num
                                    matchedVariant = `${variant} (часть ${num})`
                                    break
                                }
                            }
                        }
                        break
                    }
                }

                if (!matchedVariant) {
                    const partialNumbers = telegramService.extractPartialNumbers(searchQuery)
                    for (const part of partialNumbers) {
                        const fullNumbers = telegramService.extractFullNumbersEndingWith(msg.text, part)
                        if (fullNumbers.length > 0) {
                            matched = fullNumbers[0]
                            matchedVariant = `${part} → ${fullNumbers[0]}`
                            break
                        } else if (msg.text.includes(part)) {
                            matched = part
                            matchedVariant = part
                        }
                    }
                }

                return {
                    chatId: msg.chatId,
                    chatName: msg.chatName,
                    messageId: msg.id,
                    messageText: msg.text,
                    date: msg.date,
                    author: msg.author,
                    matchedQuery: matchedVariant || matched
                }
            })

            setSearchResults(results)
            if (results.length === 0) {
                toast.error('Сообщения не найдены. Попробуйте изменить запрос или выбрать другие чаты.')
            }
        } catch (error: any) {
            console.error('Ошибка поиска в Telegram:', error)
            toast.error(`Ошибка при выполнении поиска: ${error.message || 'Неизвестная ошибка'}`)
        } finally {
            setIsSearching(false)
        }
    }, [searchQuery, extractSevenDigitNumbers, selectedChats])

    // Фильтрация чатов
    const filteredChats = useMemo(() => {
        let filtered = availableChats
        if (chatFilterType === 'favorites') {
            filtered = filtered.filter(chat => favoriteChats.has(chat.id))
        } else if (chatFilterType !== 'all') {
            filtered = filtered.filter(chat => chat.type === chatFilterType)
        }
        if (chatSearchTerm.trim()) {
            const term = chatSearchTerm.toLowerCase()
            filtered = filtered.filter(chat => chat.name.toLowerCase().includes(term))
        }
        return filtered
    }, [availableChats, chatFilterType, chatSearchTerm, favoriteChats])

    // Переключение избранного
    /*
    const _toggleFavorite = useCallback((chatId: string) => {
        setFavoriteChats(prev => {
            const next = new Set(prev)
            if (next.has(chatId)) {
                next.delete(chatId)
            } else {
                next.add(chatId)
            }
            localStorage.setItem('telegram_favorite_chats', JSON.stringify(Array.from(next)))
            return next
        })
    }, [])
    */

    // Загрузка избранных чатов
    useEffect(() => {
        try {
            const saved = localStorage.getItem('telegram_favorite_chats')
            if (saved) {
                setFavoriteChats(new Set(JSON.parse(saved)))
            }
        } catch (error) {
            console.error('Ошибка загрузки избранных чатов:', error)
        }
    }, [])

    // Переключение выбора чата
    const toggleChatSelection = useCallback((chatId: string) => {
        setSelectedChats(prev => {
            const next = new Set(prev)
            if (next.has(chatId)) {
                next.delete(chatId)
            } else {
                next.add(chatId)
            }
            return next
        })
    }, [])

    // Выбор всех/отмена всех
    /*
    const _toggleAllChats = useCallback((select: boolean) => {
        if (select) {
            setSelectedChats(new Set(filteredChats.map(c => c.id)))
        } else {
            setSelectedChats(new Set())
        }
    }, [filteredChats])
    */

    // Проверка статуса подключения при загрузке
    useEffect(() => {
        const checkStatusAndRestore = async () => {
            const connected = await telegramService.checkConnectionStatus()
            setIsConnected(connected)
            if (connected) {
                await loadChats()
            } else {
                const savedData = loadSavedConnectionData()
                if (savedData.apiId && savedData.apiHash) {
                    try {
                        const cleanApiHash = savedData.apiHash.replace(/[\s\n\r\t\u00A0\u2000-\u200B\u2028\u2029\uFEFF]/g, '').trim()
                        const result = await telegramService.initialize(
                            savedData.apiId.trim(),
                            cleanApiHash,
                            savedData.phoneNumber?.trim() || ''
                        )
                        if (result.success) {
                            setIsConnected(true)
                            await loadChats()
                        } else if (result.needsAuth) {
                            setNeedsAuth(true)
                            setPhoneCodeHash(result.phoneCodeHash || null)
                            setShowConnectionModal(true)
                        }
                    } catch (error) {
                        console.error('Ошибка восстановления сессии:', error)
                    }
                }
            }
        }
        checkStatusAndRestore()
    }, [loadChats, loadSavedConnectionData])

    return (
        <div className="space-y-6 p-6">
            <DashboardHeader
                icon={ChatBubbleLeftRightIcon}
                title="ТЕЛЕГРАМ ХАБ"
                subtitle="МОНІТОРИНГ ТА ПАРСИНГ"
                statusMetrics={[
                    {
                        label: isConnected ? "ПІДКЛЮЧЕНО" : "НЕ ПІДКЛЮЧЕНО",
                        value: isConnected ? "ONLINE" : "OFFLINE",
                        color: isConnected ? "bg-[#10b981]" : "bg-red-500"
                    }
                ]}
                actions={
                    <div className="flex items-center gap-3">
                        {activeTab === 'telegram' && (
                            <>
                                {isConnected ? (
                                    <button onClick={handleDisconnect} className={clsx('px-6 py-3 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] transition-all flex items-center gap-3 border shadow-sm', isDark ? 'bg-red-600/10 border-red-500/20 text-red-400 hover:bg-red-600 hover:text-white' : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-600 hover:text-white')}>
                                        <XMarkIcon className="w-4 h-4" />
                                        <span>ВІДКЛЮЧИТИСЯ</span>
                                    </button>
                                ) : (
                                    <button onClick={() => setShowConnectionModal(true)} className={clsx('px-6 py-3 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] transition-all flex items-center gap-3 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20')}>
                                        <LinkIcon className="w-4 h-4" />
                                        <span>ПІДКЛЮЧИТИСЯ</span>
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                }
            />

            {/* Вкладки */}
            <div className={clsx('rounded-xl border-2 p-1', isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white')}>
                <div className="flex space-x-2">
                    <button onClick={() => setActiveTab('telegram')} className={clsx('flex-1 px-4 py-3 rounded-lg font-medium transition-all', activeTab === 'telegram' ? (isDark ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white') : (isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-900'))}>
                        <div className="flex items-center justify-center gap-2">
                            <ChatBubbleLeftRightIcon className="w-5 h-5" />
                            <span>Парсинг в Telegram</span>
                        </div>
                    </button>
                    <button onClick={() => setActiveTab('registry')} className={clsx('flex-1 px-4 py-3 rounded-lg font-medium transition-all', activeTab === 'registry' ? (isDark ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white') : (isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-900'))}>
                        <div className="flex items-center justify-center gap-2">
                            <DocumentTextIcon className="w-5 h-5" />
                            <span>Парсинг на сайте</span>
                        </div>
                    </button>
                </div>
            </div>

            {activeTab === 'telegram' && (
                <div className="space-y-6">
                    <div className={clsx('rounded-xl border-2 p-6', isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white')}>
                        <label className={clsx('block text-sm font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
                            Запрос для поиска
                        </label>
                        <textarea
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Введите семизначный номер (например: 1214508) или его часть (например: 4508)..."
                            className={clsx('w-full px-4 py-3 rounded-lg border-2 focus:ring-2 focus:ring-blue-500 transition-colors resize-none', isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900')}
                            rows={4}
                        />
                        <div className="mt-2 flex items-center justify-between">
                            <div className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                {extractSevenDigitNumbers(searchQuery).length > 0 ? (
                                    <span>Найдено номеров: {extractSevenDigitNumbers(searchQuery).length}</span>
                                ) : null}
                            </div>
                            <button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()} className={clsx('px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2', isSearching || !searchQuery.trim() ? (isDark ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed') : (isDark ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'))}>
                                {isSearching ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <MagnifyingGlassIcon className="w-5 h-5" />}
                                <span>{isSearching ? 'Поиск...' : 'Начать поиск'}</span>
                            </button>
                        </div>
                    </div>

                    <div className={clsx('rounded-xl border-2', isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white')}>
                        <button onClick={() => setShowChatFilter(!showChatFilter)} className={clsx('w-full px-6 py-4 flex items-center justify-between transition-colors', isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50')}>
                            <div className="flex items-center gap-3">
                                <FunnelIcon className="w-5 h-5 text-gray-400" />
                                <span className="font-medium">Фильтр чатов</span>
                                <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700">Выбрано: {selectedChats.size}</span>
                            </div>
                            <ChevronDownIcon className={clsx('w-5 h-5 transition-transform', showChatFilter && 'rotate-180')} />
                        </button>
                        {showChatFilter && (
                            <div className="p-6 border-t border-gray-200 dark:border-gray-700">
                                <input
                                    type="text"
                                    placeholder="Поиск чата..."
                                    value={chatSearchTerm}
                                    onChange={(e) => setChatSearchTerm(e.target.value)}
                                    className="w-full px-4 py-2 mb-4 rounded-lg border dark:bg-gray-700"
                                />
                                <div className="max-h-64 overflow-y-auto space-y-2">
                                    {filteredChats.map(chat => (
                                        <label key={chat.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer">
                                            <input type="checkbox" checked={selectedChats.has(chat.id)} onChange={() => toggleChatSelection(chat.id)} />
                                            <span>{chat.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {searchResults.length > 0 && (
                        <div className="space-y-3">
                            {searchResults.map((result, idx) => (
                                <div key={idx} className="p-4 rounded-xl border-2 dark:bg-gray-800">
                                    <div className="font-bold mb-1">{result.chatName}</div>
                                    <div className="text-sm dark:text-gray-300">{result.messageText}</div>
                                    <div className="text-xs mt-2 text-gray-500">{result.date.toLocaleString()}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Connection Modal */}
            {showConnectionModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">Настройки Telegram</h2>
                        <div className="space-y-4">
                            <input type="text" placeholder="API ID" value={connectionData.apiId} onChange={e => setConnectionData({ ...connectionData, apiId: e.target.value })} className="w-full p-2 border rounded" />
                            <input type="text" placeholder="API Hash" value={connectionData.apiHash} onChange={e => setConnectionData({ ...connectionData, apiHash: e.target.value })} className="w-full p-2 border rounded" />
                            <input type="text" placeholder="Phone" value={connectionData.phoneNumber} onChange={e => setConnectionData({ ...connectionData, phoneNumber: e.target.value })} className="w-full p-2 border rounded" />
                            {needsAuth && <input type="text" placeholder="Code" value={phoneCode} onChange={e => setPhoneCode(e.target.value)} className="w-full p-2 border rounded" />}
                            <div className="flex gap-2">
                                <button onClick={() => setShowConnectionModal(false)} className="flex-1 p-2 bg-gray-200 rounded">Отмена</button>
                                <button onClick={needsAuth ? handleCompleteAuth : handleConnect} className="flex-1 p-2 bg-blue-600 text-white rounded">
                                    {isConnecting ? '...' : (needsAuth ? 'ОК' : 'Войти')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

const ChevronDownIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
)

export default TelegramParsing