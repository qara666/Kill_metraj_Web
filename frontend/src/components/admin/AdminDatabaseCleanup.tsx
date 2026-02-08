import React, { useState } from 'react';
import { TrashIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';
import { useTheme } from '../../contexts/ThemeContext';
import { authService } from '../../utils/auth/authService';

export const AdminDatabaseCleanup: React.FC = () => {
    const { isDark } = useTheme();
    const [isLoading, setIsLoading] = useState(false);

    const handleCleanup = async () => {
        if (!window.confirm('Вы уверены, что хотите очистить кэш и историю статусов? Это действие необратимо.')) {
            return;
        }

        setIsLoading(true);
        try {
            const token = authService.getAccessToken();
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api/v1'}/dashboard/cleanup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (data.success) {
                toast.success(data.message || 'База данных успешно очищена');
            } else {
                throw new Error(data.error || 'Ошибка при очистке');
            }
        } catch (error) {
            console.error('Cleanup error:', error);
            toast.error(error instanceof Error ? error.message : 'Ошибка при очистке базы данных');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className={clsx(
                'p-4 rounded-lg flex items-start gap-4',
                isDark ? 'bg-red-900/20 border border-red-800' : 'bg-red-50 border border-red-200'
            )}>
                <ExclamationTriangleIcon className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                <div>
                    <h3 className={clsx('font-medium mb-1', isDark ? 'text-red-400' : 'text-red-800')}>
                        Очистка Базы Данных
                    </h3>
                    <p className={clsx('text-sm', isDark ? 'text-red-300' : 'text-red-600')}>
                        Внимание! Эта операция удалит весь кэш заказов и историю изменений статусов, полученных от внешнего API.
                        Настройки пользователей, аккаунты и маршруты НЕ будут затронуты.
                    </p>
                </div>
            </div>

            <div className="flex gap-4">
                <button
                    type="button"
                    onClick={handleCleanup}
                    disabled={isLoading}
                    className={clsx(
                        'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
                        'bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                >
                    {isLoading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <TrashIcon className="w-5 h-5" />
                    )}
                    {isLoading ? 'Очистка...' : 'Очистить кэш и историю'}
                </button>
            </div>
        </div>
    );
};
