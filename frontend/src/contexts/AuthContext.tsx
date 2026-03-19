import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react'
import { authService } from '../utils/auth/authService'
import { syncPresetsToLocalStorage } from '../utils/auth/presetSync'
import type { User } from '../types/auth'

interface AuthContextType {
    user: User | null
    loading: boolean
    login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>
    logout: () => Promise<void>
    isAuthenticated: boolean
    isAdmin: boolean
    refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}

interface AuthProviderProps {
    children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)

    const isSyncingRef = React.useRef(false)

    // Загрузка текущего пользователя при монтировании
    useEffect(() => {
        const loadUser = async () => {
            if (isSyncingRef.current) return
            try {
                const currentUser = await authService.getCurrentUser()
                setUser(currentUser)
                if (currentUser) {
                    // Загружаем пресеты в фоновом режиме, чтобы не блокировать вход
                    syncPresetsToLocalStorage(currentUser.id).catch(err =>
                        console.error('Background preset sync failed:', err)
                    )
                }
            } catch (error) {
                console.error('Failed to load user:', error)
                setUser(null)
            } finally {
                setLoading(false)
            }
        }

        loadUser()
    }, [])

    const login = useCallback(async (username: string, password: string) => {
        try {
            const response = await authService.login({ username, password })

            if (response.success && response.data) {
                const loggedInUser = response.data.user
                setUser(loggedInUser)
                // Запускаем синхронизацию в фоновом режиме, чтобы ускорить вход
                syncPresetsToLocalStorage(loggedInUser.id).catch(err =>
                    console.error('Background preset sync failed:', err)
                )
                return { success: true }
            }

            return {
                success: false,
                error: response.error || 'Ошибка входа'
            }
        } catch (error: any) {
            return {
                success: false,
                error: error.message || 'Ошибка входа'
            }
        }
    }, [])

    const logout = useCallback(async () => {
        // Оптимистичный выход: сначала очищаем состояние в UI
        setUser(null)

        // Затем вызываем сервис в фоновом режиме, не блокируя UI
        try {
            await authService.logout()
        } catch (error) {
            console.error('Logout background error:', error)
        }
    }, [])

    const refreshUser = useCallback(async () => {
        try {
            const currentUser = await authService.getCurrentUser()
            setUser(currentUser)
            if (currentUser) {
                // Синхронизация в фоне
                syncPresetsToLocalStorage(currentUser.id).catch(err =>
                    console.error('Background preset sync failed:', err)
                )
            }
        } catch (error) {
            console.error('Failed to refresh user:', error)
        }
    }, [])

    // Периодическая фоновая синхронизация пресетов
    useEffect(() => {
        if (!user) return

        const performSync = () => {
            syncPresetsToLocalStorage(user.id).catch(err =>
                console.error('Periodic background preset sync failed:', err)
            )
        }

        // 1. Initial sync on mount/user change
        performSync()

        // 2. Periodic sync every 5 minutes
        const interval = setInterval(performSync, 5 * 60 * 1000)

        // 3. Sync when window becomes visible again
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                performSync()
            }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            clearInterval(interval)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [user])

    const value: AuthContextType = useMemo(() => ({
        user,
        loading,
        login,
        logout,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
        refreshUser
    }), [user, loading, login, logout, refreshUser])

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    )
}
