
import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { LoadingSpinner } from '../shared/LoadingSpinner'

interface ProtectedRouteProps {
    children: React.ReactNode
    requireAdmin?: boolean
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
    children,
    requireAdmin = false
}) => {
    const { user, loading, isAdmin } = useAuth()
    const location = useLocation()

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <LoadingSpinner size="lg" />
            </div>
        )
    }

    if (!user) {
        // Перенаправляем на страницу входа, сохраняя текущий URL
        return <Navigate to="/login" state={{ from: location }} replace />
    }

    if (requireAdmin && !isAdmin) {
        // Если требуется admin, но пользователь не admin - на главную
        return <Navigate to="/" replace />
    }

    return <>{children}</>
}ss