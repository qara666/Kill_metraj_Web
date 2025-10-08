import { ReactNode, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { 
  HomeIcon, 
  UserGroupIcon, 
  MapIcon, 
  ChartBarIcon, 
  CogIcon,
  Bars3Icon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import { clsx } from 'clsx'

interface LayoutProps {
  children: ReactNode
}

const navigation = [
  { name: 'Панель управления', href: '/', icon: HomeIcon },
  { name: 'Маршруты', href: '/routes', icon: MapIcon },
  { name: 'Курьеры', href: '/couriers', icon: UserGroupIcon },
  { name: 'Аналитика', href: '/analytics', icon: ChartBarIcon },
  { name: 'Настройки', href: '/settings', icon: CogIcon },
]

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <div className={clsx(
        'fixed inset-0 z-50 lg:hidden',
        sidebarOpen ? 'block' : 'hidden'
      )}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 shadow-2xl">
          <div className="flex h-16 items-center justify-between px-4 border-b border-blue-800/30">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold text-sm">KM</span>
                </div>
              </div>
              <div className="ml-3">
                <h1 className="text-lg font-semibold text-white">Kill_metraj</h1>
              </div>
            </div>
            <button
              type="button"
              className="text-blue-300 hover:text-white transition-colors"
              onClick={() => setSidebarOpen(false)}
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
          <nav className="flex-1 px-4 py-4 space-y-2">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={clsx(
                    'group flex items-center px-3 py-3 text-sm font-medium rounded-xl transition-all duration-200',
                    isActive
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
                      : 'text-blue-200 hover:bg-blue-800/50 hover:text-white'
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon
                    className={clsx(
                      'mr-3 h-5 w-5 flex-shrink-0 transition-colors',
                      isActive ? 'text-white' : 'text-blue-300 group-hover:text-white'
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
        <div className="flex flex-col flex-grow bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 shadow-2xl">
          <div className="flex h-16 items-center px-4 border-b border-blue-800/30">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold text-sm">KM</span>
                </div>
              </div>
              <div className="ml-3">
                <h1 className="text-lg font-semibold text-white">Kill_metraj</h1>
                <p className="text-xs text-blue-300">Створюй маршрути (майже автоматизовано усе), бо руками то влом</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 px-4 py-4 space-y-2">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={clsx(
                    'group flex items-center px-3 py-3 text-sm font-medium rounded-xl transition-all duration-200',
                    isActive
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
                      : 'text-blue-200 hover:bg-blue-800/50 hover:text-white'
                  )}
                >
                  <item.icon
                    className={clsx(
                      'mr-3 h-5 w-5 flex-shrink-0 transition-colors',
                      isActive ? 'text-white' : 'text-blue-300 group-hover:text-white'
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
        <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-gradient-to-r from-white via-blue-50 to-indigo-50 px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
          <button
            type="button"
            className="-m-2.5 p-2.5 text-gray-700 lg:hidden hover:text-blue-600 transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Bars3Icon className="h-6 w-6" />
          </button>

          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
            <div className="flex flex-1" />
            <div className="flex items-center gap-x-4 lg:gap-x-6">
              {/* Status indicator */}
              <div className="flex items-center gap-x-2 bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-green-200">
                <div className="h-2 w-2 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full animate-pulse" />
                <span className="text-sm text-gray-700 font-medium">Система работает - ОПы не ловятся</span>
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
