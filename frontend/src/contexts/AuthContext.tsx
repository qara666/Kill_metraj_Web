import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
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

    // Загрузка текущего пользователя при монтировании
    useEffect(() => {
        const loadUser = async () => {
            try {
                const currentUser = await authService.getCurrentUser()
                setUser(currentUser)
                if (currentUser) {
                    await syncPresetsToLocalStorage(currentUser.id)
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
                setUser(response.data.user)
                await syncPresetsToLocalStorage(response.data.user.id)
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
        await authService.logout()
        setUser(null)
    }, [])

    const refreshUser = useCallback(async () => {
        try {
            const currentUser = await authService.getCurrentUser()
            setUser(currentUser)
            if (currentUser) {
                await syncPresetsToLocalStorage(currentUser.id)
            }
        } catch (error) {
            console.error('Failed to refresh user:', error)
        }
    }, [])

    const value: AuthContextType = {
        user,
        loading,
        login,
        logout,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
        refreshUser
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    )
}
