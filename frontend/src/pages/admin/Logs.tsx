import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { authService } from '../../utils/auth/authService'
import { clsx } from 'clsx'
import {
    MagnifyingGlassIcon,
    FunnelIcon,
    TrashIcon,
    EyeIcon,
    XMarkIcon,
    ArrowPathIcon,
    CheckIcon,
    ChevronUpDownIcon,
    ClockIcon,
    ComputerDesktopIcon
} from '@heroicons/react/24/outline'
import { Combobox } from '@headlessui/react'
import type { AuditLog, User } from '../../types/auth'
import { toast } from 'react-hot-toast'

export const AdminLogs: React.FC = () => {
    const { isDark } = useTheme()

    // Data States
    const [logs, setLogs] = useState<AuditLog[]>([])
    const [users, setUsers] = useState<User[]>([])
    const [total, setTotal] = useState(0)

    // UI States
    const [loading, setLoading] = useState(false)
    const [hasMore, setHasMore] = useState(true)
    const [offset, setOffset] = useState(0)
    const [autoRefresh, setAutoRefresh] = useState(false)
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

    // Filter States
    const [selectedUser, setSelectedUser] = useState<User | null>(null)
    const [userQuery, setUserQuery] = useState('')
    const [filters, setFilters] = useState({
        action: '',
        startDate: '',
        endDate: ''
    })
    const [searchTerm] = useState('')

    const observerTarget = useRef<HTMLDivElement>(null)

    // Load Users for Dropdown
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const data = await authService.getUsers()
                setUsers(data)
            } catch (error) {
                console.error('Failed to load users', error)
            }
        }
        fetchUsers()
    }, [])

    const loadLogs = useCallback(async (reset = false) => {
        if (loading && !reset) return

        setLoading(true)
        try {
            const currentOffset = reset ? 0 : offset
            const result = await authService.getLogs({
                ...filters,
                userId: selectedUser?.id,
                limit: 50,
                offset: currentOffset
            })

            if (reset) {
                setLogs(result.logs)
                setOffset(50)
            } else {
                setLogs(prev => [...prev, ...result.logs])
                setOffset(prev => prev + 50)
            }

            setTotal(result.total)
            setHasMore(result.logs.length === 50)
        } catch (error) {
            console.error('Failed to load logs:', error)
        } finally {
            setLoading(false)
        }
    }, [offset, filters, selectedUser, loading])

    // Auto-refresh interval
    useEffect(() => {
        let interval: NodeJS.Timeout
        if (autoRefresh) {
            interval = setInterval(() => {
                loadLogs(true)
            }, 5000) // Refresh every 5 seconds
        }
        return () => clearInterval(interval)
    }, [autoRefresh, loadLogs])

    // Infinite scroll
    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasMore && !loading && !autoRefresh) {
                    loadLogs()
                }
            },
            { threshold: 0.1 }
        )

        const target = observerTarget.current
        if (target) {
            observer.observe(target)
        }

        return () => {
            if (target) {
                observer.unobserve(target)
            }
        }
    }, [hasMore, loading, loadLogs, autoRefresh])

    // Initial load and filter change
    useEffect(() => {
        loadLogs(true)
    }, [filters, selectedUser, autoRefresh])

    const handleClearLogs = async () => {
        if (!confirm('Вы уверены, что хотите очистить ВСЕ логи? Это действие необратимо.')) return

        const result = await authService.clearLogs()
        if (result.success) {
            toast.success('Логи очищены')
            loadLogs(true)
        } else {
            toast.error(result.error || 'Ошибка очистки')
        }
    }

    const filteredLogs = logs.filter(log =>
        log.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.action.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const filteredUsers =
        userQuery === ''
            ? users
            : users.filter((user) =>
                user.username
                    .toLowerCase()
                    .replace(/\s+/g, '')
                    .includes(userQuery.toLowerCase().replace(/\s+/g, ''))
            )

    // Helper for friendly action names and colors
    const getActionBadge = (action: string) => {
        let colorClass = isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
        let label = action

        if (action.includes('login')) {
            colorClass = isDark ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-green-50 text-green-700 border-green-200'
            label = 'Вход в систему'
        } else if (action.includes('logout')) {
            colorClass = isDark ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'bg-orange-50 text-orange-700 border-orange-200'
            label = 'Выход'
        } else if (action.includes('create')) {
            colorClass = isDark ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-blue-50 text-blue-700 border-blue-200'
            label = 'Создание'
        } else if (action.includes('update') || action.includes('preset')) {
            colorClass = isDark ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-indigo-50 text-indigo-700 border-indigo-200'
            label = action.includes('preset') ? 'Обновление настроек' : 'Обновление'
        } else if (action.includes('delete')) {
            colorClass = isDark ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-red-50 text-red-700 border-red-200'
            label = 'Удаление'
        }

        return (
            <span className={clsx(
                "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border",
                colorClass
            )}>
                {label}
            </span>
        )
    }

    return (
        <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
            {/* Заголовок */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className={clsx(
                        'text-3xl font-black mb-2 flex items-center gap-3',
                        isDark ? 'text-white' : 'text-gray-900'
                    )}>
                        <ClockIcon className="w-8 h-8 text-blue-500" />
                        Мониторинг логов
                    </h1>
                    <p className={clsx(
                        'text-sm font-medium',
                        isDark ? 'text-gray-400' : 'text-gray-600'
                    )}>
                        Всего записей: <span className="text-blue-500 font-bold">{total}</span>
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={clsx(
                            'flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all border',
                            autoRefresh
                                ? (isDark ? 'bg-blue-500/20 border-blue-500 text-blue-400 animate-pulse' : 'bg-blue-50 border-blue-200 text-blue-700 animate-pulse')
                                : (isDark ? 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50')
                        )}
                    >
                        <ArrowPathIcon className={clsx("w-4 h-4", autoRefresh && "animate-spin")} />
                        {autoRefresh ? 'Авто-обновление' : 'Обновлять авто'}
                    </button>

                    <button
                        onClick={handleClearLogs}
                        className={clsx(
                            'flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider text-white transition-all shadow-lg shadow-red-500/20',
                            'bg-red-500 hover:bg-red-600 hover:scale-105 active:scale-95'
                        )}
                    >
                        <TrashIcon className="w-4 h-4" />
                        Очистить
                    </button>
                </div>
            </div>

            {/* Фильтры */}
            <div className={clsx(
                'rounded-3xl p-6 border shadow-xl',
                isDark ? 'bg-gray-800/50 border-gray-700/50 backdrop-blur-xl' : 'bg-white border-gray-100 shadow-blue-100/50'
            )}>
                <div className="flex items-center gap-2 mb-6">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                        <FunnelIcon className="w-5 h-5 text-blue-500" />
                    </div>
                    <h3 className={clsx(
                        'font-bold text-sm uppercase tracking-wide',
                        isDark ? 'text-white' : 'text-gray-900'
                    )}>
                        Фильтрация событий
                    </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* User Selection (Combobox) */}
                    <div className="relative z-20">
                        <label className={clsx('block text-xs font-bold mb-2 uppercase tracking-wide', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            Пользователь
                        </label>
                        <Combobox value={selectedUser} onChange={setSelectedUser} nullable>
                            <div className="relative">
                                <div className={clsx(
                                    "relative w-full cursor-default overflow-hidden rounded-xl text-left border focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 focus-visible:ring-offset-2 focus-visible:ring-offset-teal-300 sm:text-sm",
                                    isDark ? "bg-gray-900/50 border-gray-600" : "bg-white border-gray-200"
                                )}>
                                    <Combobox.Input
                                        className={clsx(
                                            "w-full border-none py-2.5 pl-3 pr-10 text-sm leading-5 focus:ring-0 font-medium bg-transparent",
                                            isDark ? "text-white" : "text-gray-900"
                                        )}
                                        displayValue={(user: User | null) => user?.username || ''}
                                        onChange={(event) => setUserQuery(event.target.value)}
                                        placeholder="Все пользователи"
                                    />
                                    <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
                                        <ChevronUpDownIcon
                                            className="h-5 w-5 text-gray-400"
                                            aria-hidden="true"
                                        />
                                    </Combobox.Button>
                                </div>
                                <Combobox.Options className={clsx(
                                    "absolute mt-1 max-h-60 w-full overflow-auto rounded-xl py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm",
                                    isDark ? "bg-gray-800 border border-gray-700" : "bg-white border border-gray-100"
                                )}>
                                    {filteredUsers.length === 0 && userQuery !== '' ? (
                                        <div className="relative cursor-default select-none py-2 px-4 text-gray-500">
                                            Ничего не найдено.
                                        </div>
                                    ) : (
                                        filteredUsers.map((user) => (
                                            <Combobox.Option
                                                key={user.id}
                                                className={({ active }) =>
                                                    clsx(
                                                        "relative cursor-default select-none py-2 pl-10 pr-4",
                                                        active ? (isDark ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-900') : (isDark ? 'text-gray-300' : 'text-gray-900')
                                                    )
                                                }
                                                value={user}
                                            >
                                                {({ selected, active }) => (
                                                    <>
                                                        <span className={clsx("block truncate font-medium", selected ? "font-bold" : "font-normal")}>
                                                            {user.username}
                                                        </span>
                                                        {selected ? (
                                                            <span className={clsx("absolute inset-y-0 left-0 flex items-center pl-3", active ? "text-white" : "text-blue-600")}>
                                                                <CheckIcon className="h-5 w-5" aria-hidden="true" />
                                                            </span>
                                                        ) : null}
                                                    </>
                                                )}
                                            </Combobox.Option>
                                        ))
                                    )}
                                </Combobox.Options>
                            </div>
                        </Combobox>
                    </div>

                    {/* Action Filter */}
                    <div>
                        <label className={clsx('block text-xs font-bold mb-2 uppercase tracking-wide', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            Тип действия
                        </label>
                        <select
                            value={filters.action}
                            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                            className={clsx(
                                'w-full px-4 py-2.5 rounded-xl border text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 transition-all',
                                isDark
                                    ? 'bg-gray-900/50 border-gray-600 text-white'
                                    : 'bg-white border-gray-200 text-gray-900'
                            )}
                        >
                            <option value="">Все действия</option>
                            <option value="login">Вход</option>
                            <option value="logout">Выход</option>
                            <option value="user_create">Создание пользователя</option>
                            <option value="user_update">Обновление пользователя</option>
                            <option value="user_delete">Удаление пользователя</option>
                            <option value="preset_update">Изменение настроек</option>
                        </select>
                    </div>

                    {/* Date Range - Start */}
                    <div>
                        <label className={clsx('block text-xs font-bold mb-2 uppercase tracking-wide', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            С даты
                        </label>
                        <input
                            type="date"
                            value={filters.startDate}
                            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                            className={clsx(
                                'w-full px-4 py-2.5 rounded-xl border text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 transition-all',
                                isDark
                                    ? 'bg-gray-900/50 border-gray-600 text-white'
                                    : 'bg-white border-gray-200 text-gray-900'
                            )}
                        />
                    </div>

                    {/* Date Range - End */}
                    <div>
                        <label className={clsx('block text-xs font-bold mb-2 uppercase tracking-wide', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            По дату
                        </label>
                        <input
                            type="date"
                            value={filters.endDate}
                            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                            className={clsx(
                                'w-full px-4 py-2.5 rounded-xl border text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 transition-all',
                                isDark
                                    ? 'bg-gray-900/50 border-gray-600 text-white'
                                    : 'bg-white border-gray-200 text-gray-900'
                            )}
                        />
                    </div>
                </div>
            </div>

            {/* Таблица логов */}
            <div className={clsx(
                'rounded-3xl border overflow-hidden shadow-2xl',
                isDark ? 'bg-gray-800/80 border-gray-700/50 shadow-black/20' : 'bg-white border-gray-200 shadow-blue-100/30'
            )}>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className={isDark ? 'bg-gray-900/50' : 'bg-gray-50/80'}>
                            <tr>
                                <th className={clsx(
                                    'px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest',
                                    isDark ? 'text-gray-400' : 'text-gray-500'
                                )}>
                                    Пользователь
                                </th>
                                <th className={clsx(
                                    'px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest',
                                    isDark ? 'text-gray-400' : 'text-gray-500'
                                )}>
                                    Действие
                                </th>
                                <th className={clsx(
                                    'px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest',
                                    isDark ? 'text-gray-400' : 'text-gray-500'
                                )}>
                                    IP & Система
                                </th>
                                <th className={clsx(
                                    'px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest',
                                    isDark ? 'text-gray-400' : 'text-gray-500'
                                )}>
                                    Время
                                </th>
                                <th className={clsx(
                                    'px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest',
                                    isDark ? 'text-gray-400' : 'text-gray-500'
                                )}>
                                    Детали
                                </th>
                            </tr>
                        </thead>
                        <tbody className={clsx(
                            'divide-y',
                            isDark ? 'divide-gray-700/50' : 'divide-gray-100'
                        )}>
                            {filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center">
                                        <div className="flex flex-col items-center justify-center gap-3">
                                            <div className={clsx("p-4 rounded-2xl", isDark ? "bg-gray-800" : "bg-gray-50")}>
                                                <MagnifyingGlassIcon className="w-8 h-8 text-gray-400" />
                                            </div>
                                            <p className={isDark ? 'text-gray-400' : 'text-gray-600'}>
                                                {loading ? 'Загрузка данных...' : 'Событий не найдено по заданным фильтрам'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredLogs.map((log) => (
                                    <tr key={log.id} className={clsx(
                                        'transition-colors group',
                                        isDark ? 'hover:bg-gray-700/30' : 'hover:bg-blue-50/30'
                                    )}>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-3">
                                                <div className={clsx(
                                                    "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs",
                                                    isDark ? "bg-gray-700 text-gray-300" : "bg-blue-100 text-blue-600"
                                                )}>
                                                    {log.username.charAt(0).toUpperCase()}
                                                </div>
                                                <div className={clsx(
                                                    'text-sm font-bold',
                                                    isDark ? 'text-white' : 'text-gray-900'
                                                )}>
                                                    {log.username}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {getActionBadge(log.action)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex flex-col">
                                                <div className={clsx(
                                                    'text-xs font-mono font-medium',
                                                    isDark ? 'text-gray-300' : 'text-gray-700'
                                                )}>
                                                    {log.ipAddress}
                                                </div>
                                                <div className={clsx(
                                                    'text-[10px] truncate max-w-[150px] opacity-60',
                                                    isDark ? 'text-gray-400' : 'text-gray-500'
                                                )} title={log.userAgent}>
                                                    {log.userAgent}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className={clsx(
                                                'text-sm font-medium',
                                                isDark ? 'text-gray-300' : 'text-gray-700'
                                            )}>
                                                {new Date(log.timestamp).toLocaleString('ru-RU')}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => setSelectedLog(log)}
                                                className={clsx(
                                                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all opacity-0 group-hover:opacity-100',
                                                    isDark
                                                        ? 'bg-gray-700 hover:bg-gray-600 text-white'
                                                        : 'bg-white hover:bg-blue-50 text-blue-600 border border-gray-200 hover:border-blue-200 shadow-sm'
                                                )}
                                            >
                                                <EyeIcon className="w-3.5 h-3.5" />
                                                Детали
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Infinite scroll trigger */}
                <div ref={observerTarget} className="h-4 w-full" />

                {loading && (
                    <div className="p-6 text-center">
                        <div className="inline-block w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin text-blue-500" />
                    </div>
                )}
            </div>

            {/* Modal for detailed view */}
            {selectedLog && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className={clsx(
                        'rounded-3xl p-8 max-w-2xl w-full shadow-2xl relative flex flex-col max-h-[90vh]',
                        isDark ? 'bg-gray-900 border border-gray-700' : 'bg-white'
                    )}>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className={clsx(
                                'text-2xl font-black flex items-center gap-3',
                                isDark ? 'text-white' : 'text-gray-900'
                            )}>
                                <div className="p-2 rounded-xl bg-blue-500/10">
                                    <ComputerDesktopIcon className="w-6 h-6 text-blue-500" />
                                </div>
                                Детали события
                            </h2>
                            <button
                                onClick={() => setSelectedLog(null)}
                                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                                <XMarkIcon className="w-6 h-6 text-gray-500" />
                            </button>
                        </div>

                        <div className="space-y-6 overflow-y-auto pr-2 custom-scrollbar">
                            <div className="grid grid-cols-2 gap-4">
                                <div className={clsx("p-4 rounded-2xl", isDark ? "bg-gray-800/50" : "bg-gray-50")}>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Время события</label>
                                    <div className={clsx("font-medium", isDark ? 'text-white' : 'text-gray-900')}>
                                        {new Date(selectedLog.timestamp).toLocaleString('ru-RU')}
                                    </div>
                                </div>
                                <div className={clsx("p-4 rounded-2xl", isDark ? "bg-gray-800/50" : "bg-gray-50")}>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Пользователь</label>
                                    <div className={clsx("font-medium", isDark ? 'text-white' : 'text-gray-900')}>
                                        {selectedLog.username}
                                    </div>
                                </div>
                                <div className={clsx("p-4 rounded-2xl", isDark ? "bg-gray-800/50" : "bg-gray-50")}>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">IP-адрес</label>
                                    <div className={clsx("font-mono", isDark ? 'text-blue-400' : 'text-blue-600')}>
                                        {selectedLog.ipAddress}
                                    </div>
                                </div>
                                <div className={clsx("p-4 rounded-2xl", isDark ? "bg-gray-800/50" : "bg-gray-50")}>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Тип действия</label>
                                    <div>{getActionBadge(selectedLog.action)}</div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Технические данные (JSON)</label>
                                <div className={clsx(
                                    'p-6 rounded-2xl font-mono text-xs overflow-auto max-h-[300px] border relative group',
                                    isDark ? 'bg-gray-950/50 border-gray-800 text-blue-300' : 'bg-slate-50 border-slate-200 text-blue-700 shadow-inner'
                                )}>
                                    <pre>{JSON.stringify(selectedLog.details, null, 2)}</pre>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 pt-4 border-t border-gray-100 dark:border-gray-800">
                            <button
                                onClick={() => setSelectedLog(null)}
                                className={clsx(
                                    'w-full py-3.5 rounded-2xl font-bold uppercase tracking-widest text-xs transition-all transform hover:scale-[1.02] active:scale-[0.98]',
                                    isDark ? 'bg-gray-800 hover:bg-gray-700 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                                )}
                            >
                                Закрыть
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
