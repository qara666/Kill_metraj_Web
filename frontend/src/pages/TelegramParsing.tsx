import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { clsx } from 'clsx'
import { useTheme } from '../contexts/ThemeContext'
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  LinkIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import { telegramService } from '../services/telegramService'

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
  const [connectionData, setConnectionData] = useState<TelegramConnection>({
    apiId: '',
    apiHash: '',
    phoneNumber: ''
  })
  const [isConnecting, setIsConnecting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [phoneCodeHash, setPhoneCodeHash] = useState<string | null>(null)
  const [phoneCode, setPhoneCode] = useState('')

  // Состояния для парсинга Telegram
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set())
  const [availableChats, setAvailableChats] = useState<TelegramChat[]>([])
  const [showChatFilter, setShowChatFilter] = useState(false)
  const [chatFilterType, setChatFilterType] = useState<'all' | 'group' | 'channel' | 'private'>('all')
  const [chatSearchTerm, setChatSearchTerm] = useState('')

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
        isSelected: true // По умолчанию выбираем все
      }))
      setAvailableChats(telegramChats)
      setSelectedChats(new Set(telegramChats.map(c => c.id)))
    } catch (error) {
      console.error('Ошибка загрузки чатов:', error)
      alert('Не удалось загрузить список чатов. Проверьте подключение к Telegram.')
    }
  }, [isConnected])

  // Валидация данных подключения
  const validateConnectionData = useCallback((data: TelegramConnection): string | null => {
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

    // Валидация номера телефона
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

    return null
  }, [])

  // Подключение к Telegram
  const handleConnect = useCallback(async () => {
    if (!connectionData.apiId || !connectionData.apiHash || !connectionData.phoneNumber) {
      alert('Заполните все поля для подключения')
      return
    }

    // Валидация данных
    const validationError = validateConnectionData(connectionData)
    if (validationError) {
      alert(validationError)
      return
    }

    setIsConnecting(true)
    try {
      const result = await telegramService.initialize(
        connectionData.apiId.trim(),
        connectionData.apiHash.trim(),
        connectionData.phoneNumber.trim()
      )
      
      if (result.success) {
        setIsConnected(true)
        setNeedsAuth(false)
        setShowConnectionModal(false)
        // Загружаем список чатов после подключения
        await loadChats()
        alert('Успешно подключено к Telegram!')
      } else if (result.needsAuth) {
        // Требуется код подтверждения
        setNeedsAuth(true)
        setPhoneCodeHash(result.phoneCodeHash || null)
        alert('Введите код подтверждения из Telegram')
      } else {
        alert(result.error || 'Не удалось подключиться к Telegram. Проверьте данные.')
      }
    } catch (error: any) {
      console.error('Ошибка подключения:', error)
      let errorMessage = error.message || 'Неизвестная ошибка'
      if (errorMessage.includes('pattern') || errorMessage.includes('format')) {
        errorMessage = 'Неверный формат данных. Проверьте все поля.'
      }
      alert(`Ошибка подключения: ${errorMessage}`)
    } finally {
      setIsConnecting(false)
    }
  }, [connectionData, validateConnectionData, loadChats])

  // Завершение авторизации с кодом
  const handleCompleteAuth = useCallback(async () => {
    if (!phoneCode || phoneCode.trim().length < 4) {
      alert('Введите код подтверждения (минимум 4 символа)')
      return
    }

    if (!phoneCodeHash) {
      alert('Ошибка: отсутствует phoneCodeHash. Попробуйте подключиться заново.')
      return
    }

    // Валидация данных подключения
    const validationError = validateConnectionData(connectionData)
    if (validationError) {
      alert(validationError)
      return
    }

    setIsConnecting(true)
    try {
      const result = await telegramService.completeAuth(
        connectionData.apiId.trim(),
        connectionData.apiHash.trim(),
        connectionData.phoneNumber.trim(),
        phoneCode.trim(),
        phoneCodeHash
      )
      
      if (result.success) {
        setIsConnected(true)
        setNeedsAuth(false)
        setPhoneCode('')
        setPhoneCodeHash(null)
        setShowConnectionModal(false)
        // Загружаем список чатов после подключения
        await loadChats()
        alert('Авторизация завершена!')
      } else {
        let errorMessage = result.error || 'Не удалось завершить авторизацию. Проверьте код.'
        if (errorMessage.includes('code') || errorMessage.includes('PHONE_CODE')) {
          errorMessage = 'Неверный код подтверждения. Проверьте код и попробуйте снова.'
        } else if (errorMessage.includes('expired') || errorMessage.includes('timeout')) {
          errorMessage = 'Код подтверждения истек. Запросите новый код.'
        }
        alert(errorMessage)
      }
    } catch (error: any) {
      console.error('Ошибка завершения авторизации:', error)
      let errorMessage = error.message || 'Неизвестная ошибка'
      if (errorMessage.includes('pattern') || errorMessage.includes('format')) {
        errorMessage = 'Неверный формат данных. Проверьте все поля.'
      }
      alert(`Ошибка: ${errorMessage}`)
    } finally {
      setIsConnecting(false)
    }
  }, [connectionData, phoneCode, phoneCodeHash, validateConnectionData, loadChats])

  // Отключение от Telegram
  const handleDisconnect = useCallback(async () => {
    try {
      await telegramService.disconnect()
      setIsConnected(false)
      setAvailableChats([])
      setSelectedChats(new Set())
      setSearchResults([])
    } catch (error) {
      console.error('Ошибка отключения:', error)
    }
  }, [])

  // Обработка запроса
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      alert('Введите запрос для поиска')
      return
    }

    if (!isConnected) {
      alert('Сначала подключитесь к Telegram')
      setShowConnectionModal(true)
      return
    }

    if (selectedChats.size === 0) {
      alert('Выберите хотя бы один чат для поиска')
      return
    }

    setIsSearching(true)
    setSearchResults([])

    try {
      // Извлекаем семизначные цифры
      const numbers = extractSevenDigitNumbers(searchQuery)
      
      if (numbers.length === 0) {
        console.warn('В запросе не найдено семизначных цифр. Поиск будет выполнен по тексту.')
      }

      // Поиск через Telegram API
      const messages = await telegramService.searchMessages({
        query: searchQuery,
        chatIds: Array.from(selectedChats),
        limit: 100
      })

      // Преобразуем результаты в формат для отображения
      const results: SearchResult[] = messages.map(msg => {
        // Находим совпавший номер или текст
        const matched = numbers.find(num => msg.text.includes(num)) || searchQuery.trim()
        
        return {
          chatId: msg.chatId,
          chatName: msg.chatName,
          messageId: msg.id,
          messageText: msg.text,
          date: msg.date,
          author: msg.author,
          matchedQuery: matched
        }
      })

      setSearchResults(results)

      if (results.length === 0) {
        alert('Сообщения не найдены. Попробуйте изменить запрос или выбрать другие чаты.')
      }
    } catch (error: any) {
      console.error('Ошибка поиска в Telegram:', error)
      alert(`Ошибка при выполнении поиска: ${error.message || 'Неизвестная ошибка'}`)
    } finally {
      setIsSearching(false)
    }
  }, [searchQuery, extractSevenDigitNumbers, isConnected, selectedChats])

  // Фильтрация чатов
  const filteredChats = useMemo(() => {
    let filtered = availableChats

    // Фильтр по типу
    if (chatFilterType !== 'all') {
      filtered = filtered.filter(chat => chat.type === chatFilterType)
    }

    // Фильтр по поиску
    if (chatSearchTerm.trim()) {
      const term = chatSearchTerm.toLowerCase()
      filtered = filtered.filter(chat => 
        chat.name.toLowerCase().includes(term)
      )
    }

    return filtered
  }, [availableChats, chatFilterType, chatSearchTerm])

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
  const toggleAllChats = useCallback((select: boolean) => {
    if (select) {
      setSelectedChats(new Set(filteredChats.map(c => c.id)))
    } else {
      setSelectedChats(new Set())
    }
  }, [filteredChats])

  // Проверка статуса подключения при загрузке
  useEffect(() => {
    const checkStatus = async () => {
      const connected = await telegramService.checkConnectionStatus()
      setIsConnected(connected)
      if (connected) {
        loadChats()
      }
    }
    checkStatus()
  }, [loadChats])

  return (
    <div className="space-y-6 p-6">
      {/* Заголовок */}
      <div className={clsx(
        'rounded-2xl p-6 shadow-lg border-2',
        isDark 
          ? 'bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 border-gray-700' 
          : 'bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border-blue-200'
      )}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className={clsx(
              'text-3xl font-bold mb-2',
              isDark ? 'text-white' : 'text-gray-900'
            )}>
              Парсинг выгрузки в телеграм и реестре
            </h1>
            <p className={clsx(
              'text-sm',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              Поиск сообщений в Telegram по текстовому запросу
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Индикатор статуса подключения */}
            {activeTab === 'telegram' && (
              <>
                <div className={clsx(
                  'flex items-center gap-2 px-3 py-2 rounded-lg',
                  isConnected
                    ? isDark ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700'
                    : isDark ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-700'
                )}>
                  <div className={clsx(
                    'w-2 h-2 rounded-full',
                    isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'
                  )} />
                  <span className="text-sm font-medium">
                    {isConnected ? 'Подключено' : 'Не подключено'}
                  </span>
                </div>
                {isConnected ? (
                  <button
                    onClick={handleDisconnect}
                    className={clsx(
                      'px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2',
                      isDark
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-red-600 hover:bg-red-700 text-white'
                    )}
                  >
                    <XMarkIcon className="w-5 h-5" />
                    <span>Отключиться</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setShowConnectionModal(true)}
                    className={clsx(
                      'px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2',
                      isDark
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    )}
                  >
                    <LinkIcon className="w-5 h-5" />
                    <span>Подключиться</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Вкладки */}
      <div className={clsx(
        'rounded-xl border-2 p-1',
        isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
      )}>
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('telegram')}
            className={clsx(
              'flex-1 px-4 py-3 rounded-lg font-medium transition-all',
              activeTab === 'telegram'
                ? isDark
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-600 text-white'
                : isDark
                  ? 'text-gray-400 hover:text-gray-300'
                  : 'text-gray-600 hover:text-gray-900'
            )}
          >
            <div className="flex items-center justify-center gap-2">
              <ChatBubbleLeftRightIcon className="w-5 h-5" />
              <span>Парсинг в Telegram</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('registry')}
            className={clsx(
              'flex-1 px-4 py-3 rounded-lg font-medium transition-all',
              activeTab === 'registry'
                ? isDark
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-600 text-white'
                : isDark
                  ? 'text-gray-400 hover:text-gray-300'
                  : 'text-gray-600 hover:text-gray-900'
            )}
          >
            <div className="flex items-center justify-center gap-2">
              <DocumentTextIcon className="w-5 h-5" />
              <span>Парсинг на сайте</span>
            </div>
          </button>
        </div>
      </div>

      {/* Контент для парсинга Telegram */}
      {activeTab === 'telegram' && (
        <div className="space-y-6">
          {/* Поле ввода запроса */}
          <div className={clsx(
            'rounded-xl border-2 p-6',
            isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
          )}>
            <label className={clsx(
              'block text-sm font-medium mb-2',
              isDark ? 'text-gray-300' : 'text-gray-700'
            )}>
              Запрос для поиска
            </label>
            <textarea
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Введите текст с семизначными номерами для поиска (например: 1234567, 7654321)..."
              className={clsx(
                'w-full px-4 py-3 rounded-lg border-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none',
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              )}
              rows={4}
            />
            <div className="mt-2 flex items-center justify-between">
              <div className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>
                {extractSevenDigitNumbers(searchQuery).length > 0 && (
                  <span>
                    Найдено семизначных номеров: {extractSevenDigitNumbers(searchQuery).length}
                  </span>
                )}
              </div>
              <button
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className={clsx(
                  'px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2',
                  isSearching || !searchQuery.trim()
                    ? isDark
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : isDark
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                )}
              >
                {isSearching ? (
                  <>
                    <ArrowPathIcon className="w-5 h-5 animate-spin" />
                    <span>Поиск...</span>
                  </>
                ) : (
                  <>
                    <MagnifyingGlassIcon className="w-5 h-5" />
                    <span>Начать поиск</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Фильтр чатов */}
          <div className={clsx(
            'rounded-xl border-2',
            isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
          )}>
            <button
              onClick={() => setShowChatFilter(!showChatFilter)}
              className={clsx(
                'w-full px-6 py-4 flex items-center justify-between transition-colors',
                isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
              )}
            >
              <div className="flex items-center gap-3">
                <FunnelIcon className={clsx('w-5 h-5', isDark ? 'text-gray-400' : 'text-gray-600')} />
                <span className={clsx('font-medium', isDark ? 'text-gray-200' : 'text-gray-900')}>
                  Фильтр чатов и групп
                </span>
                <span className={clsx(
                  'px-2 py-1 rounded-full text-xs',
                  isDark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-700'
                )}>
                  Выбрано: {selectedChats.size}
                </span>
              </div>
              <svg
                className={clsx(
                  'w-5 h-5 transition-transform',
                  showChatFilter ? 'rotate-180' : '',
                  isDark ? 'text-gray-400' : 'text-gray-600'
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showChatFilter && (
              <div className={clsx(
                'px-6 py-4 border-t',
                isDark ? 'border-gray-700' : 'border-gray-200'
              )}>
                {/* Поиск чатов */}
                <div className="mb-4">
                  <input
                    type="text"
                    placeholder="Поиск чата..."
                    value={chatSearchTerm}
                    onChange={(e) => setChatSearchTerm(e.target.value)}
                    className={clsx(
                      'w-full px-4 py-2 rounded-lg border-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                      isDark 
                        ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    )}
                  />
                </div>

                {/* Фильтр по типу */}
                <div className="mb-4">
                  <div className="flex gap-2">
                    {(['all', 'group', 'channel', 'private'] as const).map(type => (
                      <button
                        key={type}
                        onClick={() => setChatFilterType(type)}
                        className={clsx(
                          'px-3 py-1 rounded-lg text-sm font-medium transition-colors',
                          chatFilterType === type
                            ? isDark
                              ? 'bg-blue-600 text-white'
                              : 'bg-blue-600 text-white'
                            : isDark
                              ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        )}
                      >
                        {type === 'all' ? 'Все' : type === 'group' ? 'Группы' : type === 'channel' ? 'Каналы' : 'Личные'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Кнопки выбора */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => toggleAllChats(true)}
                    className={clsx(
                      'px-3 py-1 rounded-lg text-sm font-medium',
                      isDark ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30' : 'bg-green-100 text-green-700 hover:bg-green-200'
                    )}
                  >
                    Выбрать все
                  </button>
                  <button
                    onClick={() => toggleAllChats(false)}
                    className={clsx(
                      'px-3 py-1 rounded-lg text-sm font-medium',
                      isDark ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30' : 'bg-red-100 text-red-700 hover:bg-red-200'
                    )}
                  >
                    Снять все
                  </button>
                </div>

                {/* Список чатов */}
                <div className={clsx(
                  'max-h-64 overflow-y-auto rounded-lg border',
                  isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'
                )}>
                  {filteredChats.length === 0 ? (
                    <div className={clsx('p-4 text-center text-sm', isDark ? 'text-gray-400' : 'text-gray-500')}>
                      Чаты не найдены
                    </div>
                  ) : (
                    filteredChats.map(chat => (
                      <label
                        key={chat.id}
                        className={clsx(
                          'flex items-center gap-3 p-3 cursor-pointer transition-colors',
                          isDark 
                            ? 'hover:bg-gray-700' 
                            : 'hover:bg-gray-100',
                          selectedChats.has(chat.id) && (
                            isDark ? 'bg-blue-900/30' : 'bg-blue-50'
                          )
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selectedChats.has(chat.id)}
                          onChange={() => toggleChatSelection(chat.id)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <div className={clsx('font-medium', isDark ? 'text-gray-200' : 'text-gray-900')}>
                            {chat.name}
                          </div>
                          <div className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            {chat.type === 'group' ? 'Группа' : chat.type === 'channel' ? 'Канал' : 'Личные сообщения'}
                          </div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Результаты поиска */}
          {searchResults.length > 0 && (
            <div className={clsx(
              'rounded-xl border-2 p-6',
              isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
            )}>
              <div className="flex items-center justify-between mb-4">
                <h2 className={clsx('text-xl font-bold', isDark ? 'text-white' : 'text-gray-900')}>
                  Результаты поиска ({searchResults.length})
                </h2>
                <button
                  onClick={() => setSearchResults([])}
                  className={clsx(
                    'px-3 py-1 rounded-lg text-sm font-medium',
                    isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  )}
                >
                  Очистить
                </button>
              </div>

              <div className="space-y-3">
                {searchResults.map((result, idx) => (
                  <div
                    key={`${result.chatId}_${result.messageId}_${idx}`}
                    className={clsx(
                      'p-4 rounded-lg border-2',
                      isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'
                    )}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <ChatBubbleLeftRightIcon className={clsx('w-4 h-4', isDark ? 'text-blue-400' : 'text-blue-600')} />
                          <span className={clsx('font-medium', isDark ? 'text-gray-200' : 'text-gray-900')}>
                            {result.chatName}
                          </span>
                          {result.author && (
                            <>
                              <span className={clsx('text-sm', isDark ? 'text-gray-500' : 'text-gray-400')}>•</span>
                              <span className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>
                                {result.author}
                              </span>
                            </>
                          )}
                        </div>
                        <div className={clsx('text-sm mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
                          {result.messageText}
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className={clsx(isDark ? 'text-gray-500' : 'text-gray-500')}>
                            {result.date.toLocaleString('ru-RU')}
                          </span>
                          {result.matchedQuery && (
                            <span className={clsx(
                              'px-2 py-1 rounded',
                              isDark ? 'bg-green-900/30 text-green-300' : 'bg-green-100 text-green-700'
                            )}>
                              Найдено: {result.matchedQuery}
                            </span>
                          )}
                        </div>
                      </div>
                      <CheckCircleIcon className={clsx('w-5 h-5 flex-shrink-0', isDark ? 'text-green-400' : 'text-green-600')} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Пустое состояние результатов */}
          {!isSearching && searchResults.length === 0 && searchQuery && (
            <div className={clsx(
              'rounded-xl border-2 p-12 text-center',
              isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
            )}>
              <XCircleIcon className={clsx('w-12 h-12 mx-auto mb-4', isDark ? 'text-gray-600' : 'text-gray-400')} />
              <p className={clsx('text-lg font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
                Результаты не найдены
              </p>
              <p className={clsx('text-sm', isDark ? 'text-gray-500' : 'text-gray-500')}>
                Попробуйте изменить запрос или проверить выбранные чаты
              </p>
            </div>
          )}
        </div>
      )}

      {/* Контент для парсинга на сайте (заглушка) */}
      {activeTab === 'registry' && (
        <div className={clsx(
          'rounded-xl border-2 p-12 text-center',
          isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
        )}>
          <DocumentTextIcon className={clsx('w-16 h-16 mx-auto mb-4', isDark ? 'text-gray-600' : 'text-gray-400')} />
          <p className={clsx('text-lg font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
            Парсинг на сайте
          </p>
          <p className={clsx('text-sm', isDark ? 'text-gray-500' : 'text-gray-500')}>
            Функция будет реализована позже
          </p>
        </div>
      )}

      {/* Модальное окно подключения к Telegram */}
      {showConnectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowConnectionModal(false)}
          />
          
          {/* Modal */}
          <div className={clsx(
            'relative w-full max-w-md rounded-2xl border-2 shadow-2xl',
            isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
          )}>
            {/* Header */}
            <div className={clsx(
              'flex items-center justify-between p-6 border-b',
              isDark ? 'border-gray-700' : 'border-gray-200'
            )}>
              <h2 className={clsx('text-xl font-bold', isDark ? 'text-white' : 'text-gray-900')}>
                Подключение к Telegram
              </h2>
              <button
                onClick={() => setShowConnectionModal(false)}
                className={clsx(
                  'p-2 rounded-lg transition-colors',
                  isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
                )}
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <p className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>
                Для работы с парсингом Telegram необходимо получить API ID и API Hash на{' '}
                <a
                  href="https://my.telegram.org/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  my.telegram.org/apps
                </a>
              </p>

              <div>
                <label className={clsx(
                  'block text-sm font-medium mb-2',
                  isDark ? 'text-gray-300' : 'text-gray-700'
                )}>
                  API ID
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={connectionData.apiId}
                  onChange={(e) => {
                    // Разрешаем только цифры
                    const value = e.target.value.replace(/\D/g, '')
                    setConnectionData(prev => ({ ...prev, apiId: value }))
                  }}
                  placeholder="Например: 12345678"
                  className={clsx(
                    'w-full px-4 py-2 rounded-lg border-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                    isDark 
                      ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  )}
                />
                <p className={clsx('text-xs mt-1', isDark ? 'text-gray-500' : 'text-gray-500')}>
                  Положительное число (например: 12345678)
                </p>
              </div>

              <div>
                <label className={clsx(
                  'block text-sm font-medium mb-2',
                  isDark ? 'text-gray-300' : 'text-gray-700'
                )}>
                  API Hash
                </label>
                <input
                  type="text"
                  value={connectionData.apiHash}
                  onChange={(e) => setConnectionData(prev => ({ ...prev, apiHash: e.target.value.trim() }))}
                  placeholder="Например: abc123def456..."
                  className={clsx(
                    'w-full px-4 py-2 rounded-lg border-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm',
                    isDark 
                      ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  )}
                />
                <p className={clsx('text-xs mt-1', isDark ? 'text-gray-500' : 'text-gray-500')}>
                  Строка длиной не менее 20 символов
                </p>
              </div>

              <div>
                <label className={clsx(
                  'block text-sm font-medium mb-2',
                  isDark ? 'text-gray-300' : 'text-gray-700'
                )}>
                  Номер телефона
                </label>
                <input
                  type="tel"
                  value={connectionData.phoneNumber}
                  onChange={(e) => {
                    // Автоматически добавляем + если его нет
                    let value = e.target.value
                    if (value && !value.startsWith('+') && !value.startsWith('380')) {
                      value = '+' + value.replace(/[^\d]/g, '')
                    } else {
                      value = value.replace(/[^\d+]/g, '')
                    }
                    setConnectionData(prev => ({ ...prev, phoneNumber: value }))
                  }}
                  placeholder="+380XXXXXXXXX"
                  disabled={needsAuth}
                  className={clsx(
                    'w-full px-4 py-2 rounded-lg border-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                    isDark 
                      ? needsAuth
                        ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400'
                      : needsAuth
                        ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  )}
                />
                <p className={clsx('text-xs mt-1', isDark ? 'text-gray-500' : 'text-gray-500')}>
                  Формат: +380XXXXXXXXX или 380XXXXXXXXX
                </p>
              </div>

              {/* Поле для кода подтверждения */}
              {needsAuth && (
                <div>
                  <label className={clsx(
                    'block text-sm font-medium mb-2',
                    isDark ? 'text-gray-300' : 'text-gray-700'
                  )}>
                    Код подтверждения из Telegram
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={phoneCode}
                    onChange={(e) => {
                      // Разрешаем только цифры и буквы (код может содержать буквы)
                      const value = e.target.value.replace(/[^a-zA-Z0-9]/g, '')
                      setPhoneCode(value)
                    }}
                    placeholder="Введите код из Telegram"
                    maxLength={10}
                    className={clsx(
                      'w-full px-4 py-2 rounded-lg border-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center text-lg font-mono',
                      isDark 
                        ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    )}
                  />
                  <p className={clsx('text-xs mt-1', isDark ? 'text-gray-500' : 'text-gray-500')}>
                    Код был отправлен в Telegram на номер {connectionData.phoneNumber}
                  </p>
                </div>
              )}

              <div className={clsx(
                'p-3 rounded-lg text-xs',
                isDark ? 'bg-blue-900/20 text-blue-300' : 'bg-blue-50 text-blue-700'
              )}>
                <p className="font-medium mb-1">⚠️ Важно:</p>
                <p>
                  Данные для подключения хранятся локально в браузере и не передаются на сервер.
                  {needsAuth ? ' Введите код подтверждения, который пришел в Telegram.' : ' Убедитесь, что Telegram Desktop открыт и авторизован.'}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className={clsx(
              'flex items-center justify-end gap-3 p-6 border-t',
              isDark ? 'border-gray-700' : 'border-gray-200'
            )}>
              <button
                onClick={() => setShowConnectionModal(false)}
                className={clsx(
                  'px-4 py-2 rounded-lg font-medium transition-colors',
                  isDark
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                Отмена
              </button>
              {needsAuth ? (
                <button
                  onClick={handleCompleteAuth}
                  disabled={isConnecting || !phoneCode}
                  className={clsx(
                    'px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2',
                    isConnecting || !phoneCode
                      ? isDark
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : isDark
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                  )}
                >
                  {isConnecting ? (
                    <>
                      <ArrowPathIcon className="w-5 h-5 animate-spin" />
                      <span>Авторизация...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="w-5 h-5" />
                      <span>Подтвердить</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={isConnecting || !connectionData.apiId || !connectionData.apiHash || !connectionData.phoneNumber}
                  className={clsx(
                    'px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2',
                    isConnecting || !connectionData.apiId || !connectionData.apiHash || !connectionData.phoneNumber
                      ? isDark
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : isDark
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                  )}
                >
                  {isConnecting ? (
                    <>
                      <ArrowPathIcon className="w-5 h-5 animate-spin" />
                      <span>Подключение...</span>
                    </>
                  ) : (
                    <>
                      <LinkIcon className="w-5 h-5" />
                      <span>Подключиться</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TelegramParsing

