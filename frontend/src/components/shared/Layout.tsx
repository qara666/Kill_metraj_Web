import { ReactNode, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  HomeIcon,
  UserGroupIcon,
  MapIcon,
  ChartBarIcon,
  CogIcon,
  Bars3Icon,
  XMarkIcon,
  SunIcon,
  MoonIcon,
  SparklesIcon,
  PaperClipIcon,
  ShieldCheckIcon,
  UsersIcon,
  DocumentTextIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
  AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline'
import { clsx } from 'clsx'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'


interface LayoutProps {
  children: ReactNode
}

const navigation = [
  { name: 'Панель управления', href: '/', icon: HomeIcon, restricted: false },
  { name: 'Маршруты', href: '/routes', icon: MapIcon, restricted: false },
  { name: 'Курьеры', href: '/couriers', icon: UserGroupIcon, restricted: false },
  { name: 'Автоматическая оптимизация маршрутов по зонам доставки', href: '/autoplanner', icon: SparklesIcon, restricted: true },
  { name: 'Аналитика', href: '/analytics', icon: ChartBarIcon, restricted: true },
  { name: 'Парсинг выгрузки в телеграм и реестре', href: '/telegram-parsing', icon: PaperClipIcon, restricted: true },
  { name: 'Настройки', href: '/settings', icon: CogIcon, restricted: false },
]

const adminNavigation = [
  { name: 'Пользователи', href: '/admin/users', icon: UsersIcon },
  { name: 'Настройки пользователей', href: '/admin/presets', icon: AdjustmentsHorizontalIcon },
  { name: 'Логи активности', href: '/admin/logs', icon: DocumentTextIcon },
]

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { toggleTheme, isDark } = useTheme()
  const { user, logout, isAdmin } = useAuth()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className={clsx(
      'min-h-screen transition-colors duration-300',
      isDark ? 'bg-gray-900' : 'bg-gray-50'
    )}>
      {/* Mobile sidebar */}
      <div className={clsx(
        'fixed inset-0 z-50 lg:hidden',
        sidebarOpen ? 'block' : 'hidden'
      )}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        <div className={clsx(
          'fixed inset-y-0 left-0 flex w-64 flex-col backdrop-blur-md shadow-2xl',
          isDark
            ? 'bg-gradient-to-br from-slate-800/90 via-blue-800/80 to-pink-300/70 border-r border-white/10'
            : 'bg-gradient-to-br from-slate-100/90 via-blue-100/80 to-pink-100/70 border-r border-gray-200/50'
        )}>
          <div className={clsx(
            'flex h-16 items-center justify-between px-4 border-b',
            isDark ? 'border-blue-800/30' : 'border-gray-200/50'
          )}>
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-pink-400 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold text-sm">KM</span>
                </div>
              </div>
              <div className="ml-3">
                <h1 className={clsx(
                  'text-sm font-semibold',
                  isDark ? 'text-white' : 'text-gray-900'
                )}>Авто рассчет км</h1>
              </div>
            </div>
            <button
              type="button"
              className={clsx(
                'p-2 rounded-lg transition-colors',
                isDark ? 'text-blue-300 hover:text-white hover:bg-blue-700/50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/50'
              )}
              onClick={() => setSidebarOpen(false)}
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
            {/* Admin section - Top priority for admins */}
            {isAdmin && (
              <>
                <div className={clsx(
                  'px-3 py-2 mt-4 mb-2 text-xs font-semibold uppercase tracking-wider',
                  isDark ? 'text-blue-400' : 'text-gray-600'
                )}>
                  <div className="flex items-center gap-2">
                    <ShieldCheckIcon className="w-4 h-4" />
                    Администрирование
                  </div>
                </div>
                {adminNavigation.map((item) => {
                  const isActive = location.pathname === item.href
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={clsx(
                        'group flex items-center px-3 py-3 text-sm font-medium rounded-xl transition-all duration-200',
                        isActive
                          ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-lg'
                          : isDark
                            ? 'text-blue-200 hover:bg-purple-800/50 hover:text-white'
                            : 'text-gray-700 hover:bg-purple-200/50 hover:text-gray-900'
                      )}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <item.icon
                        className={clsx(
                          'mr-3 h-5 w-5 flex-shrink-0 transition-colors',
                          isActive
                            ? 'text-white'
                            : isDark
                              ? 'text-purple-300 group-hover:text-white'
                              : 'text-gray-500 group-hover:text-gray-700'
                        )}
                      />
                      {item.name}
                    </Link>
                  )
                })}
                <div className="h-px bg-white/10 my-4" />
              </>
            )}

            {/* Standard navigation */}
            <div className={clsx(
              'px-3 py-2 mb-2 text-xs font-semibold uppercase tracking-wider',
              isDark ? 'text-blue-400' : 'text-gray-600'
            )}>
              Основной функционал
            </div>

            {navigation.map((item) => {
              if (item.restricted && !isAdmin) return null;
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={clsx(
                    'group flex items-center px-3 py-3 text-sm font-medium rounded-xl transition-all duration-200',
                    isActive
                      ? 'bg-gradient-to-r from-blue-600 to-pink-500 text-white shadow-lg'
                      : isDark
                        ? 'text-blue-200 hover:bg-blue-800/50 hover:text-white'
                        : 'text-gray-700 hover:bg-gray-200/50 hover:text-gray-900'
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon
                    className={clsx(
                      'mr-3 h-5 w-5 flex-shrink-0 transition-colors',
                      isActive
                        ? 'text-white'
                        : isDark
                          ? 'text-blue-300 group-hover:text-white'
                          : 'text-gray-500 group-hover:text-gray-700'
                    )}
                  />
                  {item.name}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>


      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className={clsx(
          'flex flex-col flex-grow backdrop-blur-md shadow-2xl',
          isDark
            ? 'bg-gradient-to-br from-slate-800/90 via-blue-800/80 to-pink-300/70 border-r border-white/10'
            : 'bg-gradient-to-br from-slate-100/90 via-blue-100/80 to-pink-100/70 border-r border-gray-200/50'
        )}>
          <div className={clsx(
            'flex h-16 items-center px-4 border-b',
            isDark ? 'border-blue-800/30' : 'border-gray-200/50'
          )}>
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-pink-400 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold text-sm">KM</span>
                </div>
              </div>
              <div className="ml-6">
                <h1 className={clsx(
                  'text-lg font-semibold',
                  isDark ? 'text-white' : 'text-gray-900'
                )}>Авто рассчет км для курьеров</h1>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-4 py-4 space-y-2">
            {/* Admin section - Top priority for admins */}
            {isAdmin && (
              <>
                <div className={clsx(
                  'px-3 py-2 mt-4 mb-2 text-xs font-semibold uppercase tracking-wider',
                  isDark ? 'text-blue-400' : 'text-gray-600'
                )}>
                  <div className="flex items-center gap-2">
                    <ShieldCheckIcon className="w-4 h-4" />
                    Администрирование
                  </div>
                </div>
                {adminNavigation.map((item) => {
                  const isActive = location.pathname === item.href
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={clsx(
                        'group flex items-center px-3 py-3 text-sm font-medium rounded-xl transition-all duration-200',
                        isActive
                          ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-lg'
                          : isDark
                            ? 'text-blue-200 hover:bg-purple-800/50 hover:text-white'
                            : 'text-gray-700 hover:bg-purple-200/50 hover:text-gray-900'
                      )}
                    >
                      <item.icon
                        className={clsx(
                          'mr-3 h-5 w-5 flex-shrink-0 transition-colors',
                          isActive
                            ? 'text-white'
                            : isDark
                              ? 'text-purple-300 group-hover:text-white'
                              : 'text-gray-500 group-hover:text-gray-700'
                        )}
                      />
                      {item.name}
                    </Link>
                  )
                })}
                <div className="h-px bg-white/10 my-4" />
              </>
            )}

            {/* Standard navigation */}
            <div className={clsx(
              'px-3 py-2 mb-2 text-xs font-semibold uppercase tracking-wider',
              isDark ? 'text-blue-400' : 'text-gray-600'
            )}>
              Основной функционал
            </div>

            {navigation.map((item) => {
              if (item.restricted && !isAdmin) return null;
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={clsx(
                    'group flex items-center px-3 py-3 text-sm font-medium rounded-xl transition-all duration-200',
                    isActive
                      ? 'bg-gradient-to-r from-blue-600 to-pink-500 text-white shadow-lg'
                      : isDark
                        ? 'text-blue-200 hover:bg-blue-800/50 hover:text-white'
                        : 'text-gray-700 hover:bg-gray-200/50 hover:text-gray-900'
                  )}
                >
                  <item.icon
                    className={clsx(
                      'mr-3 h-5 w-5 flex-shrink-0 transition-colors',
                      isActive
                        ? 'text-white'
                        : isDark
                          ? 'text-blue-300 group-hover:text-white'
                          : 'text-gray-500 group-hover:text-gray-700'
                    )}
                  />
                  {item.name}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className={
          clsx(
            'sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8 backdrop-blur-md',
            isDark
              ? 'border-gray-700 bg-gradient-to-r from-gray-800/90 via-blue-900/80 to-pink-900/70'
              : 'border-gray-200 bg-gradient-to-r from-white/90 via-blue-50/80 to-pink-50/70'
          )
        } >
          <button
            type="button"
            className={clsx(
              '-m-2.5 p-2.5 lg:hidden transition-colors',
              isDark ? 'text-gray-300 hover:text-white' : 'text-gray-700 hover:text-blue-600'
            )}
            onClick={() => setSidebarOpen(true)}
          >
            <Bars3Icon className="h-6 w-6" />
          </button>

          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
            <div className="flex flex-1" />
            <div className="flex items-center gap-x-4 lg:gap-x-6">


              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className={clsx(
                  'p-2 rounded-lg transition-all duration-200 hover:scale-105',
                  isDark
                    ? 'bg-gray-700/50 hover:bg-gray-600/50 text-yellow-400'
                    : 'bg-gray-200/50 hover:bg-gray-300/50 text-gray-600'
                )}
                title={isDark ? 'Переключить на светлую тему' : 'Переключить на темную тему'}
              >
                {isDark ? (
                  <SunIcon className="h-5 w-5" />
                ) : (
                  <MoonIcon className="h-5 w-5" />
                )}
              </button>

              {/* User menu */}
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className={clsx(
                    'flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200',
                    isDark
                      ? 'hover:bg-gray-700/50 text-gray-300'
                      : 'hover:bg-gray-200/50 text-gray-700'
                  )}
                >
                  <UserCircleIcon className="w-6 h-6" />
                  <span className="text-sm font-medium hidden sm:block">{user?.username}</span>
                </button>

                {/* Dropdown */}
                {userMenuOpen && (
                  <div className={clsx(
                    'absolute right-0 mt-2 w-48 rounded-lg shadow-lg border overflow-hidden z-50',
                    isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                  )}>
                    <Link
                      to="/profile"
                      onClick={() => setUserMenuOpen(false)}
                      className={clsx(
                        'flex items-center gap-2 px-4 py-3 text-sm transition-colors',
                        isDark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-50 text-gray-700'
                      )}
                    >
                      <UserCircleIcon className="w-4 h-4" />
                      Профиль
                    </Link>
                    <button
                      onClick={handleLogout}
                      className={clsx(
                        'w-full flex items-center gap-2 px-4 py-3 text-sm transition-colors',
                        isDark ? 'hover:bg-gray-700 text-red-400' : 'hover:bg-gray-50 text-red-600'
                      )}
                    >
                      <ArrowRightOnRectangleIcon className="w-4 h-4" />
                      Выход
                    </button>
                  </div>
                )}
              </div>

              {/* Status indicator */}
              <div className={clsx(
                'flex items-center gap-x-2 px-3 py-1.5 rounded-full shadow-sm border backdrop-blur-sm',
                isDark
                  ? 'bg-gray-800/80 border-green-700/50'
                  : 'bg-white/80 border-green-200'
              )}>
                <div className="h-2 w-2 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full animate-pulse" />
                <span className={clsx(
                  'text-sm font-medium',
                  isDark ? 'text-gray-300' : 'text-gray-700'
                )}>Система работает - ОПы не ловятся</span>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="py-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
































