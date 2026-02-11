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
  AdjustmentsHorizontalIcon,
  BanknotesIcon
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
  { name: 'Касса рассчет', href: '/financials', icon: BanknotesIcon, restricted: false },
  { name: 'Автоматическая оптимизация маршрутов по зонам доставки', href: '/autoplanner', icon: SparklesIcon, restricted: true },
  { name: 'Аналитика', href: '/analytics', icon: ChartBarIcon, restricted: true },
  { name: 'Парсинг выгрузки в телеграм и реестре', href: '/telegram-parsing', icon: PaperClipIcon, restricted: true },
  { name: 'Настройки', href: '/settings', icon: CogIcon, restricted: false },
]

const adminNavigation = [
  { name: 'Пользователи', href: '/admin/users', icon: UsersIcon },
  { name: 'Настройки пользователей', href: '/admin/presets', icon: AdjustmentsHorizontalIcon },
  { name: 'Логи активности', href: '/admin/logs', icon: DocumentTextIcon },
  { name: 'Админ фичи', href: '/admin/system', icon: ShieldCheckIcon },
]

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { toggleTheme, isDark } = useTheme()
  const { user, logout, isAdmin } = useAuth()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className={clsx(
      'min-h-screen transition-colors duration-200',
      isDark ? 'bg-[#0B0F1A]' : 'bg-gray-50'
    )}>
      {/* Mobile sidebar */}
      <div className={clsx(
        'fixed inset-0 z-50 lg:hidden',
        sidebarOpen ? 'block' : 'hidden'
      )}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        <div className={clsx(
          'fixed inset-y-0 left-0 flex w-64 flex-col shadow-2xl transition-transform duration-300 transform-gpu glass-panel border-r-0',
          isDark
            ? 'bg-[#151B2C]/40 border-white/5'
            : 'bg-white/40 border-gray-200/50'
        )}>
          {/* Elite Gradient Border Accent */}
          <div className="absolute top-0 right-0 w-[1px] h-full bg-gradient-to-b from-transparent via-blue-500/20 to-transparent" />

          <div className={clsx(
            'flex h-16 items-center justify-between px-4 border-b',
            isDark ? 'border-white/5' : 'border-gray-200/50'
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
                        'group flex items-center px-4 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 transform-gpu active:scale-95',
                        isActive
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                          : isDark
                            ? 'text-gray-400 hover:bg-gray-800 hover:text-white'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
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
                    'group flex items-center px-4 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 transform-gpu active:scale-95',
                    isActive
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                      : isDark
                        ? 'text-gray-400 hover:bg-gray-800 hover:text-white'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
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
          'flex flex-col flex-grow shadow-sm transition-colors duration-200 relative',
          isDark
            ? 'bg-[#0F1424]/40 backdrop-blur-xl border-r border-white/5'
            : 'bg-white border-r border-gray-200'
        )}>
          {/* Glass Accent */}
          <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none" />
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
                  'text-lg font-black tracking-tight leading-none',
                  isDark ? 'text-white' : 'text-gray-900'
                )}>
                  <span className="block text-xs font-bold opacity-60 uppercase tracking-[0.2em] mt-1">Система авто рассчетов</span>
                </h1>
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
                        'group flex items-center px-4 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 transform-gpu active:scale-95',
                        isActive
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-600/10'
                          : isDark
                            ? 'text-gray-400 hover:bg-gray-800/50 hover:text-white'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
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
                    'group flex items-center px-4 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 transform-gpu active:scale-95',
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/10'
                      : isDark
                        ? 'text-gray-400 hover:bg-gray-800/50 hover:text-white'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
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
      <div className="lg:pl-64 flex flex-col min-h-screen">
        {/* Top bar - Floating Effect */}
        <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 px-4 sm:gap-x-6 sm:px-6 lg:px-8 bg-transparent pointer-events-none">
          {/* Mobile hamburger - Always visible on small screens, pointer-events-auto to be clickable */}
          <div className="flex flex-1 items-center justify-between lg:justify-end gap-x-4 lg:gap-x-6">
            <button
              type="button"
              className={clsx(
                'p-2.5 lg:hidden pointer-events-auto rounded-xl transition-all active:scale-90',
                isDark ? 'text-gray-300 hover:text-white bg-gray-800/40' : 'text-gray-700 hover:text-blue-600 bg-white/40 shadow-sm'
              )}
              onClick={() => setSidebarOpen(true)}
            >
              <Bars3Icon className="h-6 w-6" />
            </button>

            <div className="flex items-center gap-x-4 lg:gap-x-6 pointer-events-auto">
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
                'flex items-center gap-x-2 px-3 py-1.5 rounded-full border',
                isDark
                  ? 'bg-gray-900/50 border-gray-800'
                  : 'bg-gray-100 border-gray-200'
              )}>
                <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                <span className={clsx(
                  'text-xs font-semibold uppercase tracking-wider',
                  isDark ? 'text-gray-400' : 'text-gray-600'
                )}>Система работает - ОПы не ловятся</span>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="py-6 flex-1 flex flex-col">
          <div className="px-4 sm:px-6 lg:px-8 flex-1 max-w-[1600px] mx-auto w-full">
            {children}
          </div>

          {/* Premium Footer */}
          <footer className="mt-auto py-8 px-4 sm:px-6 lg:px-8 border-t border-gray-200/5 dark:border-white/5">
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="flex items-center gap-3 group cursor-pointer transition-all duration-300">
                <div className="h-px w-8 bg-gradient-to-r from-transparent to-blue-500/50 group-hover:w-12 transition-all" />
                <span className={clsx(
                  'text-sm font-black tracking-[0.3em] uppercase transition-colors',
                  isDark ? 'text-gray-500 group-hover:text-blue-400' : 'text-gray-400 group-hover:text-blue-600'
                )}>
                  Создатель MaxSun
                </span>
                <div className="h-px w-8 bg-gradient-to-l from-transparent to-blue-500/50 group-hover:w-12 transition-all" />
              </div>
              <p className={clsx(
                'text-[10px] font-bold uppercase tracking-widest opacity-30',
                isDark ? 'text-white' : 'text-black'
              )}>
                Elite System v2.1
              </p>
            </div>
          </footer>
        </main>
      </div>
    </div>
  )
}

































