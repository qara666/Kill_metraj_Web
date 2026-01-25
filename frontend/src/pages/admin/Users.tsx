import React, { useState, useEffect } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { authService } from '../../utils/auth/authService'
import { clsx } from 'clsx'
import { toast } from 'react-hot-toast'
import {
    UserPlusIcon,
    PencilIcon,
    TrashIcon,
    MagnifyingGlassIcon
} from '@heroicons/react/24/outline'
import type { User, CreateUserData, UpdateUserData } from '../../types/auth'

export const AdminUsers: React.FC = () => {
    const { isDark } = useTheme()
    const [users, setUsers] = useState<User[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [roleFilter, setRoleFilter] = useState<'all' | 'user' | 'admin'>('all')
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [showEditModal, setShowEditModal] = useState(false)
    const [selectedUser, setSelectedUser] = useState<User | null>(null)

    useEffect(() => {
        loadUsers()
    }, [])

    const loadUsers = async () => {
        setLoading(true)
        try {
            const data = await authService.getUsers()
            setUsers(data)
        } catch (error) {
            toast.error('Ошибка загрузки пользователей')
        } finally {
            setLoading(false)
        }
    }



    const handleDelete = async (user: User) => {
        if (!confirm(`Удалить пользователя ${user.username}?`)) return

        const result = await authService.deleteUser(user.id)
        if (result.success) {
            toast.success('Пользователь удален')
            loadUsers()
        } else {
            toast.error(result.error || 'Ошибка удаления')
        }
    }

    const filteredUsers = users.filter(user => {
        const username = user.username?.toLowerCase() || ''
        const email = user.email?.toLowerCase() || ''
        const search = searchTerm.toLowerCase()
        const matchesSearch = username.includes(search) || email.includes(search)
        const matchesRole = roleFilter === 'all' || user.role === roleFilter
        return matchesSearch && matchesRole
    })

    return (
        <div className="p-6 space-y-6">
            {/* Заголовок */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className={clsx(
                        'text-3xl font-bold mb-2',
                        isDark ? 'text-white' : 'text-gray-900'
                    )}>
                        Управление пользователями
                    </h1>
                    <p className={clsx(
                        'text-sm',
                        isDark ? 'text-gray-400' : 'text-gray-600'
                    )}>
                        Создание, редактирование и управление учетными записями
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className={clsx(
                        'flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-colors',
                        isDark
                            ? 'bg-blue-600 hover:bg-blue-700'
                            : 'bg-blue-500 hover:bg-blue-600'
                    )}
                >
                    <UserPlusIcon className="w-5 h-5" />
                    Создать пользователя
                </button>
            </div>

            {/* Фильтры */}
            <div className={clsx(
                'rounded-xl p-4 border flex gap-4',
                isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            )}>
                {/* Поиск */}
                <div className="flex-1 relative">
                    <MagnifyingGlassIcon className={clsx(
                        'absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5',
                        isDark ? 'text-gray-500' : 'text-gray-400'
                    )} />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Поиск по имени или email..."
                        className={clsx(
                            'w-full pl-10 pr-3 py-2 rounded-lg border text-sm',
                            isDark
                                ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                                : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                        )}
                    />
                </div>

                {/* Фильтр по роли */}
                <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value as any)}
                    className={clsx(
                        'px-3 py-2 rounded-lg border text-sm',
                        isDark
                            ? 'bg-gray-700 border-gray-600 text-white'
                            : 'bg-white border-gray-300 text-gray-900'
                    )}
                >
                    <option value="all">Все роли</option>
                    <option value="user">Пользователи</option>
                    <option value="admin">Администраторы</option>
                </select>
            </div>

            {/* Таблица пользователей */}
            <div className={clsx(
                'rounded-xl border overflow-hidden',
                isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            )}>
                {loading ? (
                    <div className="p-8 text-center">
                        <p className={isDark ? 'text-gray-400' : 'text-gray-600'}>
                            Загрузка...
                        </p>
                    </div>
                ) : filteredUsers.length === 0 ? (
                    <div className="p-8 text-center">
                        <p className={isDark ? 'text-gray-400' : 'text-gray-600'}>
                            Пользователи не найдены
                        </p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className={isDark ? 'bg-gray-700' : 'bg-gray-50'}>
                            <tr>
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
                                    Роль
                                </th>
                                <th className={clsx(
                                    'px-6 py-3 text-left text-xs font-medium uppercase tracking-wider',
                                    isDark ? 'text-gray-300' : 'text-gray-500'
                                )}>
                                    Последний вход
                                </th>
                                <th className={clsx(
                                    'px-6 py-3 text-left text-xs font-medium uppercase tracking-wider',
                                    isDark ? 'text-gray-300' : 'text-gray-500'
                                )}>
                                    ID подразделения
                                </th>
                                <th className={clsx(
                                    'px-6 py-3 text-right text-xs font-medium uppercase tracking-wider',
                                    isDark ? 'text-gray-300' : 'text-gray-500'
                                )}>
                                    Действия
                                </th>
                            </tr>
                        </thead>
                        <tbody className={clsx(
                            'divide-y',
                            isDark ? 'divide-gray-700' : 'divide-gray-200'
                        )}>
                            {filteredUsers.map((user) => (
                                <tr key={user.id} className={isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={clsx(
                                            'text-sm font-medium',
                                            isDark ? 'text-white' : 'text-gray-900'
                                        )}>
                                            {user.username}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={clsx(
                                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                                            user.role === 'admin'
                                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                                                : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                        )}>
                                            {user.role === 'admin' ? 'Админ' : 'Пользователь'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={clsx(
                                            'text-sm',
                                            isDark ? 'text-gray-300' : 'text-gray-600'
                                        )}>
                                            {user.lastLoginAt
                                                ? new Date(user.lastLoginAt).toLocaleDateString('ru-RU')
                                                : '—'
                                            }
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={clsx(
                                            'text-sm',
                                            isDark ? 'text-gray-300' : 'text-gray-600'
                                        )}>
                                            {user.divisionId || '—'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => {
                                                    setSelectedUser(user)
                                                    setShowEditModal(true)
                                                }}
                                                className={clsx(
                                                    'p-1.5 rounded-lg transition-colors',
                                                    isDark
                                                        ? 'hover:bg-gray-600 text-gray-400 hover:text-white'
                                                        : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                                                )}
                                                title="Редактировать"
                                            >
                                                <PencilIcon className="w-4 h-4" />
                                            </button>

                                            <button
                                                onClick={() => handleDelete(user)}
                                                className={clsx(
                                                    'p-1.5 rounded-lg transition-colors',
                                                    isDark
                                                        ? 'hover:bg-red-900/50 text-gray-400 hover:text-red-400'
                                                        : 'hover:bg-red-50 text-gray-600 hover:text-red-600'
                                                )}
                                                title="Удалить"
                                            >
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Модальные окна будут добавлены отдельно */}
            {showCreateModal && (
                <CreateUserModal
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={loadUsers}
                />
            )}

            {showEditModal && selectedUser && (
                <EditUserModal
                    user={selectedUser}
                    onClose={() => {
                        setShowEditModal(false)
                        setSelectedUser(null)
                    }}
                    onSuccess={loadUsers}
                />
            )}
        </div>
    )
}

// Модальное окно создания пользователя (упрощенная версия)
const CreateUserModal: React.FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose, onSuccess }) => {
    const { isDark } = useTheme()
    const [formData, setFormData] = useState<CreateUserData>({
        username: '',
        email: '',
        password: '',
        role: 'user',
        divisionId: '',
        canModifySettings: true
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        const result = await authService.createUser(formData)
        if (result.success) {
            toast.success('Пользователь создан')
            onSuccess()
            onClose()
        } else {
            toast.error(result.error || 'Ошибка создания')
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className={clsx(
                'rounded-2xl p-6 max-w-md w-full',
                isDark ? 'bg-gray-800' : 'bg-white'
            )}>
                <h2 className={clsx(
                    'text-xl font-bold mb-4',
                    isDark ? 'text-white' : 'text-gray-900'
                )}>
                    Создать пользователя
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                        type="text"
                        placeholder="Имя пользователя"
                        value={formData.username}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        className={clsx(
                            'w-full px-3 py-2 rounded-lg border',
                            isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                        )}
                        required
                    />

                    <input
                        type="password"
                        placeholder="Пароль"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className={clsx(
                            'w-full px-3 py-2 rounded-lg border',
                            isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                        )}
                        required
                    />
                    <select
                        value={formData.role}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                        className={clsx(
                            'w-full px-3 py-2 rounded-lg border',
                            isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                        )}
                    >
                        <option value="user">Пользователь</option>
                        <option value="admin">Администратор</option>
                    </select>

                    <input
                        type="text"
                        placeholder="ID Подразделения (опционально)"
                        value={formData.divisionId || ''}
                        onChange={(e) => setFormData({ ...formData, divisionId: e.target.value })}
                        className={clsx(
                            'w-full px-3 py-2 rounded-lg border',
                            isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                        )}
                    />

                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="create-can-modify"
                            checked={formData.canModifySettings}
                            onChange={(e) => setFormData({ ...formData, canModifySettings: e.target.checked })}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label
                            htmlFor="create-can-modify"
                            className={clsx('text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}
                        >
                            Разрешить редактирование личных настроек
                        </label>
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            Создать
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className={clsx(
                                'flex-1 px-4 py-2 rounded-lg',
                                isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
                            )}
                        >
                            Отмена
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// Модальное окно редактирования (упрощенная версия)
const EditUserModal: React.FC<{ user: User; onClose: () => void; onSuccess: () => void }> = ({ user, onClose, onSuccess }) => {
    const { isDark } = useTheme()
    const [formData, setFormData] = useState<UpdateUserData>({
        email: user.email || '',
        role: user.role,
        isActive: user.isActive,
        divisionId: user.divisionId || '',
        password: '',
        canModifySettings: user.canModifySettings ?? true
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        const result = await authService.updateUser(user.id, formData)
        if (result.success) {
            toast.success('Пользователь обновлен')
            onSuccess()
            onClose()
        } else {
            toast.error(result.error || 'Ошибка обновления')
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className={clsx(
                'rounded-2xl p-6 max-w-md w-full',
                isDark ? 'bg-gray-800' : 'bg-white'
            )}>
                <h2 className={clsx(
                    'text-xl font-bold mb-4',
                    isDark ? 'text-white' : 'text-gray-900'
                )}>
                    Редактировать: {user.username}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                        type="password"
                        placeholder="Новый пароль (оставьте пустым, если не хотите менять)"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className={clsx(
                            'w-full px-3 py-2 rounded-lg border',
                            isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                        )}
                    />
                    <select
                        value={formData.role}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                        className={clsx(
                            'w-full px-3 py-2 rounded-lg border',
                            isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                        )}
                    >
                        <option value="user">Пользователь</option>
                        <option value="admin">Администратор</option>
                    </select>

                    <input
                        type="text"
                        placeholder="ID Подразделения"
                        value={formData.divisionId || ''}
                        onChange={(e) => setFormData({ ...formData, divisionId: e.target.value })}
                        className={clsx(
                            'w-full px-3 py-2 rounded-lg border',
                            isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                        )}
                    />

                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="edit-can-modify"
                            checked={formData.canModifySettings}
                            onChange={(e) => setFormData({ ...formData, canModifySettings: e.target.checked })}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label
                            htmlFor="edit-can-modify"
                            className={clsx('text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}
                        >
                            Разрешить редактирование личных настроек
                        </label>
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            Сохранить
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className={clsx(
                                'flex-1 px-4 py-2 rounded-lg',
                                isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
                            )}
                        >
                            Отмена
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
