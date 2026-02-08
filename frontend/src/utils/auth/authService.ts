import axios from 'axios'
import { API_URL } from '../../config/apiConfig'
import type {
    User,
    LoginCredentials,
    AuthResponse,
    CreateUserData,
    UpdateUserData,
    UserPreset,
    AuditLog
} from '../../types/auth'

// Токены
const TOKEN_KEY = 'km_access_token'
const REFRESH_TOKEN_KEY = 'km_refresh_token'

export const authService = {
    // ============================================
    // АУТЕНТИФИКАЦИЯ
    // ============================================

    async login(credentials: LoginCredentials): Promise<AuthResponse> {
        try {
            const response = await axios.post(`${API_URL}/api/auth/login`, credentials)

            if (response.data.success && response.data.data) {
                // Сохраняем токены
                localStorage.setItem(TOKEN_KEY, response.data.data.accessToken)
                localStorage.setItem(REFRESH_TOKEN_KEY, response.data.data.refreshToken)

                // Устанавливаем токен в заголовки axios
                this.setAuthHeader(response.data.data.accessToken)
            }

            return response.data
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || 'Ошибка входа'
            }
        }
    },

    async logout(): Promise<void> {
        // Init logout API call while token is still in headers
        const logoutPromise = axios.post(`${API_URL}/api/auth/logout`).catch(error => {
            console.error('Logout API error (ignored):', error)
        })

        // Clear tokens and headers locally
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(REFRESH_TOKEN_KEY)
        delete axios.defaults.headers.common['Authorization']

        // Return immediately if needed, or wait for promise completion
        await logoutPromise
    },

    async getCurrentUser(): Promise<User | null> {
        try {
            const token = this.getAccessToken()
            if (!token) return null

            this.setAuthHeader(token)
            const response = await axios.get(`${API_URL}/api/auth/me`)

            return response.data.success ? response.data.data : null
        } catch (error) {
            console.error('Get current user error:', error)
            return null
        }
    },

    async refreshToken(): Promise<boolean> {
        try {
            const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
            if (!refreshToken) return false

            const response = await axios.post(`${API_URL}/api/auth/refresh`, {
                refreshToken
            })

            if (response.data.success && response.data.data) {
                localStorage.setItem(TOKEN_KEY, response.data.data.accessToken)
                this.setAuthHeader(response.data.data.accessToken)
                return true
            }

            return false
        } catch (error) {
            console.error('Refresh token error:', error)
            return false
        }
    },

    // ============================================
    // УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ (ADMIN)
    // ============================================

    async getUsers(filters?: { search?: string; role?: string; isActive?: boolean; limit?: number; offset?: number }): Promise<{ users: User[]; total: number }> {
        try {
            const response = await axios.get(`${API_URL}/api/users`, { params: filters })
            if (response.data.success) {
                return {
                    users: response.data.data,
                    total: response.data.pagination ? response.data.pagination.total : response.data.data.length
                }
            }
            return { users: [], total: 0 }
        } catch (error) {
            console.error('Get users error:', error)
            return { users: [], total: 0 }
        }
    },

    async createUser(userData: CreateUserData): Promise<{ success: boolean; data?: User; error?: string }> {
        try {
            const response = await axios.post(`${API_URL}/api/users`, userData)
            return response.data
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || 'Ошибка создания пользователя'
            }
        }
    },

    async updateUser(userId: number, userData: UpdateUserData): Promise<{ success: boolean; data?: User; error?: string }> {
        try {
            const response = await axios.put(`${API_URL}/api/users/${userId}`, userData)
            return response.data
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || 'Ошибка обновления пользователя'
            }
        }
    },

    async deleteUser(userId: number): Promise<{ success: boolean; error?: string }> {
        try {
            const response = await axios.delete(`${API_URL}/api/users/${userId}`)
            return response.data
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || 'Ошибка удаления пользователя'
            }
        }
    },

    async toggleUserActive(userId: number): Promise<{ success: boolean; data?: User; error?: string }> {
        try {
            const response = await axios.put(`${API_URL}/api/users/${userId}/toggle-active`)
            return response.data
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || 'Ошибка изменения статуса'
            }
        }
    },

    async changePassword(userId: number, newPassword: string): Promise<{ success: boolean; error?: string }> {
        try {
            const response = await axios.put(`${API_URL}/api/users/${userId}/change-password`, {
                newPassword
            })
            return response.data
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || 'Ошибка смены пароля'
            }
        }
    },

    // ============================================
    // УПРАВЛЕНИЕ ПРЕСЕТАМИ (ADMIN)
    // ============================================

    async getUserPresets(userId: number): Promise<UserPreset | null> {
        try {
            const response = await axios.get(`${API_URL}/api/presets/${userId}`)
            return response.data.success ? response.data.data : null
        } catch (error) {
            console.error('Get presets error:', error)
            return null
        }
    },

    async updateUserPresets(userId: number, settings: Record<string, any>): Promise<{ success: boolean; error?: string }> {
        try {
            const response = await axios.put(`${API_URL}/api/presets/${userId}`, { settings })
            return response.data
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || 'Ошибка обновления настроек'
            }
        }
    },

    // ============================================
    // ЛОГИ (ADMIN)
    // ============================================

    async getLogs(filters?: {
        userId?: number
        action?: string
        startDate?: string
        endDate?: string
        limit?: number
        offset?: number
    }): Promise<{ logs: AuditLog[]; total: number }> {
        try {
            const response = await axios.get(`${API_URL}/api/logs`, { params: filters })
            return response.data.success ? response.data.data : { logs: [], total: 0 }
        } catch (error) {
            console.error('Get logs error:', error)
            return { logs: [], total: 0 }
        }
    },

    async clearLogs(): Promise<{ success: boolean; error?: string }> {
        try {
            const response = await axios.delete(`${API_URL}/api/logs/clear`)
            return response.data
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || 'Ошибка очистки логов'
            }
        }
    },

    // ============================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ============================================

    getAccessToken(): string | null {
        return localStorage.getItem(TOKEN_KEY)
    },

    setAuthHeader(token: string): void {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    },

    isAuthenticated(): boolean {
        return !!this.getAccessToken()
    }
}

// Настройка axios interceptor для автоматического обновления токена
axios.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config

        // Если 401 и это не повторный запрос
        if (error.response?.status === 401 && !originalRequest._retry) {
            // Skip retry for login/logout/refresh endpoints to prevent recursion
            const url = originalRequest.url || ''
            if (url.includes('/auth/login') || url.includes('/auth/logout') || url.includes('/auth/refresh')) {
                return Promise.reject(error)
            }

            originalRequest._retry = true

            const refreshed = await authService.refreshToken()

            if (refreshed) {
                // Повторяем оригинальный запрос с новым токеном
                return axios(originalRequest)
            } else {
                // Не удалось обновить токен - разлогиниваем
                await authService.logout()
                window.location.href = '/login'
            }
        }

        return Promise.reject(error)
    }
)
