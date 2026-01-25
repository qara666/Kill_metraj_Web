import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { authService } from '../utils/auth/authService'
import { clsx } from 'clsx'
import {
    UserCircleIcon,
    ShieldCheckIcon,
    ClockIcon,
    GlobeAltIcon
} from '@heroicons/react/24/outline'
import type { UserPreset } from '../types/auth'

export const Profile: React.FC = () => {
    const { user } = useAuth()
    const { isDark } = useTheme()
    const [presets, setPresets] = useState<UserPreset | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const loadPresets = async () => {
            if (!user) return

            try {
                const data = await authService.getUserPresets(user.id)
                setPresets(data)
            } catch (error) {
                console.error('Failed to load presets:', error)
            } finally {
                setLoading(false)
            }
        }

        loadPresets()
    }, [user])

    if (!user) return null

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6">
            {/* Заголовок */}
            <div>
                <h1 className={clsx(
                    'text-3xl font-bold mb-2',
                    isDark ? 'text-white' : 'text-gray-900'
                )}>
                    Личный кабинет
                </h1>
                <p className={clsx(
                    'text-sm',
                    isDark ? 'text-gray-400' : 'text-gray-600'
                )}>
                    Информация о вашем аккаунте и настройках
                </p>
            </div>

            {/* Информация о пользователе */}
            <div className={clsx(
                'rounded-2xl p-6 border',
                isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            )}>
                <h2 className={clsx(
                    'text-xl font-semibold mb-4',
                    isDark ? 'text-white' : 'text-gray-900'
                )}>
                    Информация о пользователе
                </h2>

                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <UserCircleIcon className={clsx(
                            'w-5 h-5',
                            isDark ? 'text-gray-400' : 'text-gray-500'
                        )} />
                        <div>
                            <p className={clsx(
                                'text-sm',
                                isDark ? 'text-gray-400' : 'text-gray-600'
                            )}>
                                Имя пользователя
                            </p>
                            <p className={clsx(
                                'font-medium',
                                isDark ? 'text-white' : 'text-gray-900'
                            )}>
                                {user.username}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <ShieldCheckIcon className={clsx(
                            'w-5 h-5',
                            isDark ? 'text-gray-400' : 'text-gray-500'
                        )} />
                        <div>
                            <p className={clsx(
                                'text-sm',
                                isDark ? 'text-gray-400' : 'text-gray-600'
                            )}>
                                Роль
                            </p>
                            <span className={clsx(
                                'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                                user.role === 'admin'
                                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                            )}>
                                {user.role === 'admin' ? 'Администратор' : 'Пользователь'}
                            </span>
                        </div>
                    </div>

                    {user.divisionId && (
                        <div className="flex items-center gap-3">
                            <GlobeAltIcon className={clsx(
                                'w-5 h-5',
                                isDark ? 'text-gray-400' : 'text-gray-500'
                            )} />
                            <div>
                                <p className={clsx(
                                    'text-sm',
                                    isDark ? 'text-gray-400' : 'text-gray-600'
                                )}>
                                    ID Подразделения
                                </p>
                                <p className={clsx(
                                    'font-medium text-xs font-mono',
                                    isDark ? 'text-white' : 'text-gray-900'
                                )}>
                                    {user.divisionId}
                                </p>
                            </div>
                        </div>
                    )}

                    {user.lastLoginAt && (
                        <div className="flex items-center gap-3">
                            <ClockIcon className={clsx(
                                'w-5 h-5',
                                isDark ? 'text-gray-400' : 'text-gray-500'
                            )} />
                            <div>
                                <p className={clsx(
                                    'text-sm',
                                    isDark ? 'text-gray-400' : 'text-gray-600'
                                )}>
                                    Последний вход
                                </p>
                                <p className={clsx(
                                    'font-medium',
                                    isDark ? 'text-white' : 'text-gray-900'
                                )}>
                                    {new Date(user.lastLoginAt).toLocaleString('ru-RU')}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Настройки */}
            <div className={clsx(
                'rounded-2xl p-6 border',
                isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            )}>
                <h2 className={clsx(
                    'text-xl font-semibold mb-4',
                    isDark ? 'text-white' : 'text-gray-900'
                )}>
                    Настройки
                </h2>

                {loading ? (
                    <p className={clsx(
                        'text-sm',
                        isDark ? 'text-gray-400' : 'text-gray-600'
                    )}>
                        Загрузка настроек...
                    </p>
                ) : (
                    <div className="space-y-6">
                        {/* Редактируемые настройки */}
                        <div className="text-sm text-gray-500 italic">
                            Нет доступных настроек для редактирования.
                        </div>

                        {/* Только для чтения (если есть) */}
                        {presets?.settings && (
                            <div className={clsx(
                                'pt-4 border-t',
                                isDark ? 'border-gray-700' : 'border-gray-200'
                            )}>
                                <p className={clsx(
                                    'text-sm mb-3',
                                    isDark ? 'text-gray-400' : 'text-gray-600'
                                )}>
                                    Системные настройки (управляются администратором)
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {presets.settings.cityBias && (
                                        <div>
                                            <p className={clsx('text-xs', isDark ? 'text-gray-500' : 'text-gray-400')}>Город</p>
                                            <p className={isDark ? 'text-gray-300' : 'text-gray-700'}>{presets.settings.cityBias}</p>
                                        </div>
                                    )}
                                    {presets.settings.theme && (
                                        <div>
                                            <p className={clsx('text-xs', isDark ? 'text-gray-500' : 'text-gray-400')}>Тема</p>
                                            <p className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                                                {presets.settings.theme === 'dark' ? 'Темная' : 'Светлая'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
