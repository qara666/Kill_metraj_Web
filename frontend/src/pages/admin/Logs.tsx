import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { authService } from '../../utils/auth/authService'
import { clsx } from 'clsx'
import { MagnifyingGlassIcon, FunnelIcon, TrashIcon, EyeIcon, XMarkIcon } from '@heroicons/react/24/outline'
import type { AuditLog } from '../../types/auth'
import { toast } from 'react-hot-toast'

export const AdminLogs: React.FC = () => {
    const { isDark } = useTheme()
    const [logs, setLogs] = useState<AuditLog[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(false)
    const [hasMore, setHasMore] = useState(true)
    const [offset, setOffset] = useState(0)
    const [filters, setFilters] = useState({
        userId: '',
        action: '',
        startDate: '',
        endDate: ''
    })
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
    const observerTarget = useRef<HTMLDivElement>(null)

    const loadLogs = useCallback(async (reset = false) => {
        if (loading) return

        setLoading(true)
        try {
            const currentOffset = reset ? 0 : offset
            const result = await authService.getLogs({
                ...filters,
                userId: filters.userId ? parseInt(filters.userId) : undefined,
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
    }, [offset, filters, loading])

    // Infinite scroll
    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasMore && !loading) {
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
    }, [hasMore, loading, loadLogs])

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

    // Initial load
    useEffect(() => {
        loadLogs(true)
    }, [filters])

    const filteredLogs = logs.filter(log =>
        log.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.action.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const getActionColor = (action: string) => {
        if (action.includes('login')) return 'text-green-600 dark:text-green-400'
        if (action.includes('delete') || action.includes('logout')) return 'text-red-600 dark:text-red-400'
        if (action.includes('update') || action.includes('create')) return 'text-blue-600 dark:text-blue-400'
        return isDark ? 'text-gray-400' : 'text-gray-600'
    }

    return (
        <div className="p-6 space-y-6">
            {/* Заголовок */}
            <div className="flex justify-between items-start">
                <div>
                    <h1 className={clsx(
                        'text-3xl font-bold mb-2',
                        isDark ? 'text-white' : 'text-gray-900'
                    )}>
                        Мониторинг логов
                    </h1>
                    <p className={clsx(
                        'text-sm',
                        isDark ? 'text-gray-400' : 'text-gray-600'
                    )}>
                        Просмотр активности пользователей и системных событий
                    </p>
                </div>
                <button
                    onClick={handleClearLogs}
                    className={clsx(
                        'flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-colors h-fit',
                        'bg-red-500 hover:bg-red-600'
                    )}
                >
                    <TrashIcon className="w-5 h-5" />
                    Очистить логи
                </button>
            </div>

            {/* Фильтры */}
            <div className={clsx(
                'rounded-xl p-4 border space-y-4',
                isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            )}>
                <div className="flex items-center gap-2">
                    <FunnelIcon className={clsx(
                        'w-5 h-5',
                        isDark ? 'text-gray-400' : 'text-gray-500'
                    )} />
                    <h3 className={clsx(
                        'font-medium',
                        isDark ? 'text-white' : 'text-gray-900'
                    )}>
                        Фильтры
                    </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Поиск */}
                    <div className="relative">
                        <MagnifyingGlassIcon className={clsx(
                            'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4',
                            isDark ? 'text-gray-500' : 'text-gray-400'
                        )} />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Поиск..."
                            className={clsx(
                                'w-full pl-9 pr-3 py-2 rounded-lg border text-sm',
                                isDark
                                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                            )}
                        />
                    </div>

                    {/* Действие */}
                    <select
                        value={filters.action}
                        onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                        className={clsx(
                            'px-3 py-2 rounded-lg border text-sm',
                            isDark
                                ? 'bg-gray-700 border-gray-600 text-white'
                                : 'bg-white border-gray-300 text-gray-900'
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

                    {/* Дата от */}
                    <input
                        type="date"
                        value={filters.startDate}
                        onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                        className={clsx(
                            'px-3 py-2 rounded-lg border text-sm',
                            isDark
                                ? 'bg-gray-700 border-gray-600 text-white'
                                : 'bg-white border-gray-300 text-gray-900'
                        )}
                    />

                    {/* Дата до */}
                    <input
                        type="date"
                        value={filters.endDate}
                        onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                        className={clsx(
                            'px-3 py-2 rounded-lg border text-sm',
                            isDark
                                ? 'bg-gray-700 border-gray-600 text-white'
                                : 'bg-white border-gray-300 text-gray-900'
                        )}
                    />
                </div>

                {/* Статистика */}
                <div className={clsx(
                    'text-sm',
                    isDark ? 'text-gray-400' : 'text-gray-600'
                )}>
                    Всего записей: {total}
                </div>
            </div>

            {/* Таблица логов */}
            <div className={clsx(
                'rounded-xl border overflow-hidden',
                isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            )}>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className={isDark ? 'bg-gray-700' : 'bg-gray-50'}>
                            <tr>
                                <th className={clsx(
                                    'px-6 py-3 text-left text-xs font-medium uppercase tracking-wider',
                                    isDark ? 'text-gray-300' : 'text-gray-500'
                                )}>
                                    Время
                                </th>
                                <th className={clsx(
                                    'px-6 py-3 text-left text-xs font-medium uppercase tracking-wider',
                                    isDark ? 'text-gray-300' : 'text-gray-500'
                                )}>
                                    Пользователь
                                </th>
                                <th className={clsx(
                                    'px-6 py-3 text-left text-xs font-medium uppercase tracking-wider',
                                    isDark ? 'text-gray-300' : 'text-gray-500'
                                )}>
                                    Действие
                                </th>
                                <th className={clsx(
                                    'px-6 py-3 text-left text-xs font-medium uppercase tracking-wider',
                                    isDark ? 'text-gray-300' : 'text-gray-500'
                                )}>
                                    IP-адрес
                                </th>
                                <th className={clsx(
                                    'px-6 py-3 text-left text-xs font-medium uppercase tracking-wider',
                                    isDark ? 'text-gray-300' : 'text-gray-500'
                                )}>
                                    Детали
                                </th>
                            </tr>
                        </thead>
                        <tbody className={clsx(
                            'divide-y',
                            isDark ? 'divide-gray-700' : 'divide-gray-200'
                        )}>
                            {filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center">
                                        <p className={isDark ? 'text-gray-400' : 'text-gray-600'}>
                                            {loading ? 'Загрузка...' : 'Логи не найдены'}
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                filteredLogs.map((log) => (
                                    <tr key={log.id} className={isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'}>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className={clsx(
                                                'text-sm',
                                                isDark ? 'text-gray-300' : 'text-gray-900'
                                            )}>
                                                {new Date(log.timestamp).toLocaleString('ru-RU')}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className={clsx(
                                                'text-sm font-medium',
                                                isDark ? 'text-white' : 'text-gray-900'
                                            )}>
                                                {log.username}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={clsx(
                                                'text-sm font-medium',
                                                getActionColor(log.action)
                                            )}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className={clsx(
                                                'text-sm font-mono',
                                                isDark ? 'text-gray-400' : 'text-gray-600'
                                            )}>
                                                {log.ipAddress}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => setSelectedLog(log)}
                                                className={clsx(
                                                    'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors',
                                                    isDark
                                                        ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                                                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                                )}
                                            >
                                                <EyeIcon className="w-3.5 h-3.5" />
                                                Подробнее
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Infinite scroll trigger */}
                <div ref={observerTarget} className="h-4" />

                {loading && (
                    <div className="p-4 text-center">
                        <p className={isDark ? 'text-gray-400' : 'text-gray-600'}>
                            Загрузка...
                        </p>
                    </div>
                )}
            </div>

            {/* Modal for detailed view */}
            {
                selectedLog && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className={clsx(
                            'rounded-2xl p-6 max-w-2xl w-full shadow-2xl relative',
                            isDark ? 'bg-gray-800' : 'bg-white'
                        )}>
                            <button
                                onClick={() => setSelectedLog(null)}
                                className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                                <XMarkIcon className="w-6 h-6 text-gray-500" />
                            </button>

                            <h2 className={clsx(
                                'text-xl font-bold mb-4 pr-10',
                                isDark ? 'text-white' : 'text-gray-900'
                            )}>
                                Детали события: {selectedLog?.action}
                            </h2>

                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <label className="block text-gray-500 mb-1">Время</label>
                                        <div className={isDark ? 'text-white' : 'text-gray-900'}>
                                            {selectedLog ? new Date(selectedLog.timestamp).toLocaleString('ru-RU') : ''}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-gray-500 mb-1">Пользователь</label>
                                        <div className={isDark ? 'text-white' : 'text-gray-900'}>
                                            {selectedLog?.username}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-gray-500 mb-1">IP-адрес</label>
                                        <div className={isDark ? 'text-white font-mono' : 'text-gray-900 font-mono'}>
                                            {selectedLog?.ipAddress}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-gray-500 mb-1">User-Agent</label>
                                        <div className={clsx('truncate', isDark ? 'text-white' : 'text-gray-900')} title={selectedLog?.userAgent}>
                                            {selectedLog?.userAgent}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-gray-500 text-sm mb-1">Данные (Details)</label>
                                    <div className={clsx(
                                        'p-4 rounded-xl font-mono text-xs overflow-auto max-h-[300px]',
                                        isDark ? 'bg-gray-900 text-blue-400' : 'bg-gray-50 text-blue-600'
                                    )}>
                                        <pre>{selectedLog ? JSON.stringify(selectedLog.details, null, 2) : ''}</pre>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6">
                                <button
                                    onClick={() => setSelectedLog(null)}
                                    className={clsx(
                                        'w-full py-2.5 rounded-xl font-medium transition-colors',
                                        isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                                    )}
                                >
                                    Закрыть
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div>
    )
}
