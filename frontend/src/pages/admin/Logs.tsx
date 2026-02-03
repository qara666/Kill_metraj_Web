import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
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
    ComputerDesktopIcon,
    DocumentDuplicateIcon,
    CalendarDaysIcon,
    UserCircleIcon,
    CpuChipIcon,
    GlobeAltIcon
} from '@heroicons/react/24/outline'
import { Combobox } from '@headlessui/react'
import type { AuditLog, User } from '../../types/auth'
import { toast } from 'react-hot-toast'

export const AdminLogs: React.FC = () => {
    const { isDark } = useTheme()

    // Data States
    const [autoRefresh, setAutoRefresh] = useState(false)
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

    // Filter States
    const [selectedUser, setSelectedUser] = useState<User | null>(null)
    const [userQuery, setUserQuery] = useState('')
    const [filters, setFilters] = useState({
        action: '',
        startDate: new Date(Date.now() - 86400000).toISOString().split('T')[0], // Default last 24h
        endDate: new Date().toISOString().split('T')[0]
    })
    const [searchTerm] = useState('')

    const observerTarget = useRef<HTMLDivElement>(null)

    const queryClient = useQueryClient()

    // Load Users for Dropdown
    const { data: usersData } = useQuery({
        queryKey: ['admin_users_dropdown'],
        queryFn: () => authService.getUsers({ limit: 100 }),
        staleTime: 60000
    })
    const users = usersData?.users || []

    const queryKey = ['admin_audit_logs', filters, selectedUser?.id]

    // Infinite Query for Logs
    const {
        data: infiniteData,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading: loading,
        refetch
    } = useInfiniteQuery({
        queryKey,
        queryFn: ({ pageParam = 0 }) => authService.getLogs({
            ...filters,
            userId: selectedUser?.id,
            limit: 50,
            offset: pageParam
        }),
        getNextPageParam: (lastPage, allPages) => {
            const currentTotal = allPages.reduce((acc, page) => acc + page.logs.length, 0)
            return lastPage.logs.length === 50 ? currentTotal : undefined
        },
        staleTime: 5000 // Cache for 5 seconds
    })

    const logs = useMemo(() => infiniteData?.pages.flatMap(page => page.logs) || [], [infiniteData])
    const total = infiniteData?.pages[0]?.total || 0

    // Auto-refresh using refetch
    useEffect(() => {
        let interval: NodeJS.Timeout
        if (autoRefresh) {
            interval = setInterval(() => {
                refetch()
            }, 5000)
        }
        return () => clearInterval(interval)
    }, [autoRefresh, refetch])

    // Infinite scroll
    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage && !autoRefresh) {
                    fetchNextPage()
                }
            },
            { threshold: 0.1 }
        )

        const target = observerTarget.current
        if (target) observer.observe(target)
        return () => { if (target) observer.unobserve(target) }
    }, [hasNextPage, isFetchingNextPage, fetchNextPage, autoRefresh])

    // Clear Logs Mutation
    const clearMutation = useMutation({
        mutationFn: () => authService.clearLogs(),
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey })
            const previousData = queryClient.getQueryData(queryKey)
            queryClient.setQueryData(queryKey, {
                pages: [{ logs: [], total: 0 }],
                pageParams: [0]
            })
            return { previousData }
        },
        onError: (_err, _variables, context: any) => {
            queryClient.setQueryData(queryKey, context.previousData)
            toast.error('Ошибка очистки логов')
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey })
        },
        onSuccess: () => {
            toast.success('Логи очищены')
        }
    })

    const handleClearLogs = async () => {
        if (!confirm('Вы уверены, что хотите очистить ВСЕ логи? Это действие необратимо.')) return
        clearMutation.mutate()
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
        let icon = <CpuChipIcon className="w-3.5 h-3.5" />
        let label = action

        if (action.includes('login')) {
            colorClass = isDark ? 'bg-green-500/20 text-green-300 border-green-500/30' : 'bg-green-50 text-green-700 border-green-200'
            icon = <ArrowPathIcon className="w-3.5 h-3.5" />
            label = 'Вход в систему'
        } else if (action.includes('logout')) {
            colorClass = isDark ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' : 'bg-yellow-50 text-yellow-700 border-yellow-200'
            icon = <XMarkIcon className="w-3.5 h-3.5" />
            label = 'Выход'
        } else if (action.includes('create')) {
            colorClass = isDark ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 'bg-blue-50 text-blue-700 border-blue-200'
            icon = <CheckIcon className="w-3.5 h-3.5" />
            label = action === 'user_create' ? 'Создание польз.' : 'Создание'
        } else if (action.includes('update') || action.includes('preset')) {
            colorClass = isDark ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-indigo-50 text-indigo-700 border-indigo-200'
            icon = <ArrowPathIcon className="w-3.5 h-3.5" />
            label = action.includes('preset') ? 'Обновление настроек' : 'Обновление'
        } else if (action.includes('delete') || action.includes('clear')) {
            colorClass = isDark ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-red-50 text-red-700 border-red-200'
            icon = <TrashIcon className="w-3.5 h-3.5" />
            label = 'Удаление'
        }

        return (
            <span className={clsx(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border",
                colorClass
            )}>
                {icon}
                {label}
            </span>
        )
    }

    const resetFilters = () => {
        setSelectedUser(null)
        setFilters({ action: '', startDate: '', endDate: '' })
        setUserQuery('')
        toast.success('Фильтры сброшены')
    }

    const copyDetails = (details: any) => {
        navigator.clipboard.writeText(JSON.stringify(details, null, 2))
        toast.success('Скопировано в буфер обмена')
    }

    return (
        <div className="p-6 space-y-6 max-w-[1600px] mx-auto pb-20">
            {/* Header */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
                <div>
                    <h1 className={clsx(
                        'text-3xl font-black mb-2 flex items-center gap-3',
                        isDark ? 'text-white' : 'text-gray-900'
                    )}>
                        <div className="p-2.5 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30">
                            <ClockIcon className="w-8 h-8 text-white" />
                        </div>
                        Мониторинг событий
                    </h1>
                    <p className={clsx(
                        'text-sm font-medium ml-1',
                        isDark ? 'text-gray-400' : 'text-gray-500'
                    )}>
                        Полный журнал действий пользователей и системы • Всего записей: <span className="text-blue-500 font-bold">{total}</span>
                    </p>
                </div>

                <div className="flex items-center gap-3 w-full xl:w-auto">
                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={clsx(
                            'flex-1 xl:flex-none justify-center items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all border shadow-sm',
                            autoRefresh
                                ? (isDark ? 'bg-blue-500/20 border-blue-500 text-blue-400 animate-pulse' : 'bg-blue-50 border-blue-200 text-blue-700 animate-pulse')
                                : (isDark ? 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50')
                        )}
                    >
                        <ArrowPathIcon className={clsx("w-4 h-4", autoRefresh && "animate-spin")} />
                        {autoRefresh ? 'Live Mode' : 'Авто-обновление'}
                    </button>

                    <button
                        onClick={handleClearLogs}
                        className={clsx(
                            'flex-1 xl:flex-none justify-center items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider text-white transition-all shadow-lg shadow-red-500/20',
                            'bg-red-500 hover:bg-red-600 hover:scale-105 active:scale-95'
                        )}
                    >
                        <TrashIcon className="w-4 h-4" />
                        Очистить всё
                    </button>
                </div>
            </div>

            {/* Filters Section */}
            <div className={clsx(
                'rounded-3xl p-6 border shadow-xl relative overflow-hidden',
                isDark ? 'bg-gray-800/50 border-gray-700/50 backdrop-blur-sm' : 'bg-white border-gray-100 shadow-blue-100/50'
            )}>
                {/* Decoration */}
                <div className={clsx(
                    "absolute top-0 right-0 w-64 h-64 rounded-full filter blur-3xl opacity-10 pointer-events-none translate-x-1/2 -translate-y-1/2",
                    isDark ? "bg-blue-500" : "bg-blue-600"
                )} />

                <div className="flex flex-col lg:flex-row items-center gap-6 relative z-10">
                    <div className="flex items-center gap-3 w-full lg:w-auto border-r border-gray-200 dark:border-gray-700 pr-6 mr-2">
                        <div className={clsx("p-2 rounded-xl", isDark ? "bg-blue-500/20" : "bg-blue-50")}>
                            <FunnelIcon className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                            <h3 className={clsx('font-bold text-sm', isDark ? 'text-white' : 'text-gray-900')}>Фильтры</h3>
                            <button
                                onClick={resetFilters}
                                className="text-[10px] font-bold uppercase tracking-wider text-blue-500 hover:text-blue-400 transition-colors"
                            >
                                Сбросить
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                        {/* User Selection */}
                        <div className="relative group">
                            <label className={clsx('block text-[10px] font-bold mb-1.5 uppercase tracking-wide ml-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                Пользователь
                            </label>
                            <Combobox value={selectedUser} onChange={setSelectedUser} nullable>
                                <div className="relative">
                                    <div className={clsx(
                                        "relative w-full cursor-default overflow-hidden rounded-xl text-left border transition-all",
                                        "focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500",
                                        isDark ? "bg-gray-900/80 border-gray-600" : "bg-gray-50 border-gray-200"
                                    )}>
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <UserCircleIcon className="h-5 w-5 text-gray-400" />
                                        </div>
                                        <Combobox.Input
                                            className={clsx(
                                                "w-full border-none py-2.5 pl-10 pr-10 text-sm leading-5 focus:ring-0 font-medium bg-transparent",
                                                isDark ? "text-white placeholder-gray-500" : "text-gray-900 placeholder-gray-500"
                                            )}
                                            displayValue={(user: User | null) => user?.username || ''}
                                            onChange={(event) => setUserQuery(event.target.value)}
                                            placeholder="Поиск..."
                                        />
                                        <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
                                            <ChevronUpDownIcon className="h-4 w-4 text-gray-400" aria-hidden="true" />
                                        </Combobox.Button>
                                    </div>
                                    <Combobox.Options className={clsx(
                                        "absolute mt-1 max-h-60 w-full overflow-auto rounded-xl py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm z-50",
                                        isDark ? "bg-gray-800 border border-gray-700" : "bg-white border border-gray-100"
                                    )}>
                                        {filteredUsers.length === 0 && userQuery !== '' ? (
                                            <div className="relative cursor-default select-none py-3 px-4 text-gray-500 text-center text-xs">
                                                Ничего не найдено
                                            </div>
                                        ) : (
                                            filteredUsers.map((user) => (
                                                <Combobox.Option
                                                    key={user.id}
                                                    className={({ active }) =>
                                                        clsx(
                                                            "relative cursor-pointer select-none py-2.5 pl-10 pr-4 transition-colors",
                                                            active ? (isDark ? 'bg-blue-600/20 text-blue-300' : 'bg-blue-50 text-blue-900') : (isDark ? 'text-gray-300' : 'text-gray-700')
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
                                                                <span className={clsx("absolute inset-y-0 left-0 flex items-center pl-3", active ? "text-blue-300" : "text-blue-500")}>
                                                                    <CheckIcon className="h-4 w-4" aria-hidden="true" />
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
                            <label className={clsx('block text-[10px] font-bold mb-1.5 uppercase tracking-wide ml-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                Тип действия
                            </label>
                            <div className="relative">
                                <select
                                    value={filters.action}
                                    onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                                    className={clsx(
                                        'w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm font-medium outline-none appearance-none transition-all',
                                        'focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500',
                                        isDark
                                            ? 'bg-gray-900/80 border-gray-600 text-white'
                                            : 'bg-gray-50 border-gray-200 text-gray-900'
                                    )}
                                >
                                    <option value="">Все действия</option>
                                    <option value="login">Вход</option>
                                    <option value="logout">Выход</option>
                                    <option value="user_create">Создание польз.</option>
                                    <option value="user_update">Обновление польз.</option>
                                    <option value="user_delete">Удаление польз.</option>
                                    <option value="preset_update">Настройки</option>
                                </select>
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <CpuChipIcon className="h-5 w-5 text-gray-400" />
                                </div>
                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                    <ChevronUpDownIcon className="h-4 w-4 text-gray-400" />
                                </div>
                            </div>
                        </div>

                        {/* Date Range - Start */}
                        <div>
                            <label className={clsx('block text-[10px] font-bold mb-1.5 uppercase tracking-wide ml-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                С даты
                            </label>
                            <div className="relative">
                                <input
                                    type="date"
                                    value={filters.startDate}
                                    onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                                    className={clsx(
                                        'w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm font-medium outline-none transition-all',
                                        'focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500',
                                        isDark
                                            ? 'bg-gray-900/80 border-gray-600 text-white placeholder-gray-500'
                                            : 'bg-gray-50 border-gray-200 text-gray-900'
                                    )}
                                />
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <CalendarDaysIcon className="h-5 w-5 text-gray-400" />
                                </div>
                            </div>
                        </div>

                        {/* Date Range - End */}
                        <div>
                            <label className={clsx('block text-[10px] font-bold mb-1.5 uppercase tracking-wide ml-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                По дату
                            </label>
                            <div className="relative">
                                <input
                                    type="date"
                                    value={filters.endDate}
                                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                                    className={clsx(
                                        'w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm font-medium outline-none transition-all',
                                        'focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500',
                                        isDark
                                            ? 'bg-gray-900/80 border-gray-600 text-white placeholder-gray-500'
                                            : 'bg-gray-50 border-gray-200 text-gray-900'
                                    )}
                                />
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <CalendarDaysIcon className="h-5 w-5 text-gray-400" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className={clsx(
                'rounded-3xl border overflow-hidden shadow-2xl relative',
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
                                    Инфо
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
                                    Действия
                                </th>
                            </tr>
                        </thead>
                        <tbody className={clsx(
                            'divide-y',
                            isDark ? 'divide-gray-700/50' : 'divide-gray-100'
                        )}>
                            {filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center justify-center gap-4">
                                            <div className={clsx("p-4 rounded-3xl", isDark ? "bg-gray-800" : "bg-gray-50")}>
                                                <MagnifyingGlassIcon className="w-10 h-10 text-gray-400" />
                                            </div>
                                            <div>
                                                <p className={clsx('text-lg font-bold', isDark ? 'text-white' : 'text-gray-900')}>
                                                    Событий не найдено
                                                </p>
                                                <p className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                                    Попробуйте изменить параметры фильтрации
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredLogs.map((log) => (
                                    <tr key={log.id} className={clsx(
                                        'transition-all group',
                                        isDark ? 'hover:bg-gray-700/30' : 'hover:bg-blue-50/40'
                                    )}>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={clsx(
                                                    "w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shadow-sm",
                                                    isDark ? "bg-gradient-to-br from-gray-700 to-gray-600 text-white" : "bg-gradient-to-br from-white to-gray-50 text-blue-600 border border-gray-100"
                                                )}>
                                                    {log.username.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className={clsx(
                                                        'text-sm font-bold',
                                                        isDark ? 'text-white' : 'text-gray-900'
                                                    )}>
                                                        {log.username}
                                                    </div>
                                                    <div className={clsx('text-[10px] font-mono opacity-50', isDark ? 'text-gray-300' : 'text-gray-600')}>
                                                        ID: {log.userId}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {getActionBadge(log.action)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <GlobeAltIcon className="w-3.5 h-3.5 text-gray-400" />
                                                    <span className={clsx(
                                                        'text-xs font-mono font-medium',
                                                        isDark ? 'text-gray-300' : 'text-gray-700'
                                                    )}>
                                                        {log.ipAddress}
                                                    </span>
                                                </div>
                                                <div className={clsx(
                                                    'text-[10px] truncate max-w-[150px] opacity-60 flex items-center gap-1.5',
                                                    isDark ? 'text-gray-400' : 'text-gray-500'
                                                )} title={log.userAgent}>
                                                    <ComputerDesktopIcon className="w-3 h-3" />
                                                    {log.userAgent}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className={clsx(
                                                'text-xs font-semibold tabular-nums',
                                                isDark ? 'text-gray-300' : 'text-gray-700'
                                            )}>
                                                {new Date(log.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            <div className={clsx('text-[10px] opacity-50', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                                {new Date(log.timestamp).toLocaleDateString('ru-RU')}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => setSelectedLog(log)}
                                                className={clsx(
                                                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0',
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
                    <div className="p-4 flex justify-center border-t border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider animate-pulse">
                            <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" />
                            <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce delay-75" />
                            <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce delay-150" />
                            Загрузка...
                        </div>
                    </div>
                )}
            </div>

            {/* Modal for detailed view */}
            {selectedLog && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div
                        className={clsx(
                            'rounded-3xl max-w-2xl w-full shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden',
                            isDark ? 'bg-gray-900 border border-gray-700' : 'bg-white'
                        )}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className={clsx(
                            "px-8 py-6 border-b flex items-center justify-between",
                            isDark ? "border-gray-800 bg-gray-900" : "border-gray-100 bg-gray-50/50"
                        )}>
                            <div>
                                <h2 className={clsx(
                                    'text-xl font-black flex items-center gap-3',
                                    isDark ? 'text-white' : 'text-gray-900'
                                )}>
                                    <div className="p-2 rounded-xl bg-blue-500/10">
                                        <ComputerDesktopIcon className="w-6 h-6 text-blue-500" />
                                    </div>
                                    Детали события
                                </h2>
                                <p className={clsx('text-xs mt-1 font-mono opacity-50', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                    ID: {selectedLog.id}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedLog(null)}
                                className="p-2 rounded-full hover:bg-gray-200/50 dark:hover:bg-gray-700 transition-colors"
                            >
                                <XMarkIcon className="w-6 h-6 text-gray-500" />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-8 overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-2 gap-4 mb-8">
                                <div className={clsx("p-4 rounded-2xl border", isDark ? "bg-gray-800/50 border-gray-700" : "bg-white border-gray-100 shadow-sm")}>
                                    <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                                        <CalendarDaysIcon className="w-3.5 h-3.5" />
                                        Время события
                                    </label>
                                    <div className={clsx("font-medium text-sm", isDark ? 'text-white' : 'text-gray-900')}>
                                        {new Date(selectedLog.timestamp).toLocaleString('ru-RU')}
                                    </div>
                                </div>
                                <div className={clsx("p-4 rounded-2xl border", isDark ? "bg-gray-800/50 border-gray-700" : "bg-white border-gray-100 shadow-sm")}>
                                    <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                                        <UserCircleIcon className="w-3.5 h-3.5" />
                                        Пользователь
                                    </label>
                                    <div className={clsx("font-medium text-sm", isDark ? 'text-white' : 'text-gray-900')}>
                                        {selectedLog.username}
                                    </div>
                                </div>
                                <div className={clsx("p-4 rounded-2xl border", isDark ? "bg-gray-800/50 border-gray-700" : "bg-white border-gray-100 shadow-sm")}>
                                    <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                                        <GlobeAltIcon className="w-3.5 h-3.5" />
                                        IP-адрес
                                    </label>
                                    <div className={clsx("font-mono text-sm", isDark ? 'text-blue-400' : 'text-blue-600')}>
                                        {selectedLog.ipAddress}
                                    </div>
                                </div>
                                <div className={clsx("p-4 rounded-2xl border", isDark ? "bg-gray-800/50 border-gray-700" : "bg-white border-gray-100 shadow-sm")}>
                                    <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                                        <CpuChipIcon className="w-3.5 h-3.5" />
                                        Тип действия
                                    </label>
                                    <div>{getActionBadge(selectedLog.action)}</div>
                                </div>
                            </div>

                            <div className="relative">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                        Технические данные (JSON payload)
                                    </label>
                                    <button
                                        onClick={() => copyDetails(selectedLog.details)}
                                        className="text-[10px] font-bold uppercase tracking-wider text-blue-500 hover:text-blue-400 flex items-center gap-1.5"
                                    >
                                        <DocumentDuplicateIcon className="w-3.5 h-3.5" />
                                        Копировать
                                    </button>
                                </div>
                                <div className={clsx(
                                    'p-6 rounded-2xl font-mono text-xs overflow-auto max-h-[300px] border shadow-inner',
                                    isDark ? 'bg-black/30 border-gray-700 text-blue-300' : 'bg-slate-50 border-slate-200 text-blue-900'
                                )}>
                                    <pre>{JSON.stringify(selectedLog.details, null, 2)}</pre>
                                </div>
                            </div>
                        </div>

                        <div className={clsx(
                            "p-6 border-t",
                            isDark ? "border-gray-800 bg-gray-900" : "border-gray-100 bg-gray-50"
                        )}>
                            <button
                                onClick={() => setSelectedLog(null)}
                                className={clsx(
                                    'w-full py-4 rounded-xl font-bold uppercase tracking-widest text-xs transition-all transform hover:scale-[1.01] active:scale-[0.99] shadow-lg',
                                    isDark ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
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
