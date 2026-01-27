import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { clsx } from 'clsx'
import { toast } from 'react-hot-toast'
import { LockClosedIcon, UserIcon } from '@heroicons/react/24/outline'

export const Login: React.FC = () => {
    const navigate = useNavigate()
    const location = useLocation()
    const { login } = useAuth()
    const localIsDark = true // Login page is always dark

    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [errors, setErrors] = useState<{ username?: string; password?: string }>({})

    const from = (location.state as any)?.from?.pathname || '/'

    const validateForm = (): boolean => {
        const newErrors: { username?: string; password?: string } = {}

        if (!username.trim()) {
            newErrors.username = 'Введите имя пользователя'
        }

        if (!password) {
            newErrors.password = 'Введите пароль'
        } else if (password.length < 4) {
            newErrors.password = 'Пароль должен быть не менее 4 символов'
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!validateForm()) {
            return
        }

        setIsLoading(true)

        try {
            const result = await login(username, password)

            if (result.success) {
                toast.success('Вход выполнен успешно')
                navigate(from, { replace: true })
            } else {
                toast.error(result.error || 'Неверное имя пользователя или пароль')
            }
        } catch (error) {
            toast.error('Ошибка при входе в систему')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-gray-900">
            <div className="w-full max-w-md">
                {/* Логотип и заголовок */}
                <div className="text-center mb-8">
                    <div className={clsx(
                        'inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4',
                        localIsDark
                            ? 'bg-gradient-to-br from-blue-600 to-purple-600'
                            : 'bg-gradient-to-br from-blue-500 to-indigo-600'
                    )}>
                        <LockClosedIcon className="w-8 h-8 text-white" />
                    </div>
                    <h1 className={clsx(
                        'text-3xl font-bold mb-2',
                        localIsDark ? 'text-white' : 'text-gray-900'
                    )}>
                        Вход в 
                    </h1>
                    <p className={clsx(
                        'text-sm',
                        localIsDark ? 'text-gray-400' : 'text-gray-600'
                    )}>
                        K_M - Система управления маршрутами
                    </p>
                </div>

                {/* Форма входа */}
                <div className={clsx(
                    'rounded-2xl shadow-xl p-8',
                    localIsDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
                )}>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Поле username */}
                        <div>
                            <label
                                htmlFor="username"
                                className={clsx(
                                    'block text-sm font-medium mb-2',
                                    localIsDark ? 'text-gray-200' : 'text-gray-700'
                                )}
                            >
                                Имя пользователя
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <UserIcon className={clsx(
                                        'h-5 w-5',
                                        localIsDark ? 'text-gray-500' : 'text-gray-400'
                                    )} />
                                </div>
                                <input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => {
                                        setUsername(e.target.value)
                                        setErrors({ ...errors, username: undefined })
                                    }}
                                    className={clsx(
                                        'block w-full pl-10 pr-3 py-3 rounded-lg border text-sm transition-colors',
                                        localIsDark
                                            ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
                                        errors.username && 'border-red-500'
                                    )}
                                    placeholder="Введите имя пользователя"
                                    disabled={isLoading}
                                    autoComplete="username"
                                />
                            </div>
                            {errors.username && (
                                <p className="mt-1 text-sm text-red-500">{errors.username}</p>
                            )}
                        </div>

                        {/* Поле password */}
                        <div>
                            <label
                                htmlFor="password"
                                className={clsx(
                                    'block text-sm font-medium mb-2',
                                    localIsDark ? 'text-gray-200' : 'text-gray-700'
                                )}
                            >
                                Пароль
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <LockClosedIcon className={clsx(
                                        'h-5 w-5',
                                        localIsDark ? 'text-gray-500' : 'text-gray-400'
                                    )} />
                                </div>
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value)
                                        setErrors({ ...errors, password: undefined })
                                    }}
                                    className={clsx(
                                        'block w-full pl-10 pr-3 py-3 rounded-lg border text-sm transition-colors',
                                        localIsDark
                                            ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
                                        errors.password && 'border-red-500'
                                    )}
                                    placeholder="Введите пароль"
                                    disabled={isLoading}
                                    autoComplete="current-password"
                                />
                            </div>
                            {errors.password && (
                                <p className="mt-1 text-sm text-red-500">{errors.password}</p>
                            )}
                        </div>

                        {/* Кнопка входа */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className={clsx(
                                'w-full py-3 px-4 rounded-lg font-medium text-white transition-all',
                                'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500',
                                isLoading
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : localIsDark
                                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
                                        : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700'
                            )}
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center">
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Вход...
                                </span>
                            ) : (
                                'Войти'
                            )}
                        </button>
                    </form>

                    {/* Информация */}
                    <div className={clsx(
                        'mt-6 pt-6 border-t text-center text-sm',
                        localIsDark ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-600'
                    )}>
                        <p>
                            Для восстановления доступа обратитесь к администратору
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
