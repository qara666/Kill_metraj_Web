import { ReactNode, useState, useMemo, useCallback, memo } from 'react'
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
  PaperClipIcon,
  ShieldCheckIcon,
  UsersIcon,
  DocumentTextIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
  AdjustmentsHorizontalIcon,
  BanknotesIcon,
  TruckIcon
} from '@heroicons/react/24/outline'
import { clsx } from 'clsx'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { CalculationOverlay } from '../common/CalculationOverlay'

interface LayoutProps {
  children: ReactNode
}

const NAVIGATION = [
  { id: 'dashboard', name: 'Панель управления', href: '/', icon: HomeIcon, restricted: false },
  { id: 'map', name: 'Карта', href: '/map', icon: MapIcon, restricted: false },
  { id: 'routes', name: 'Маршруты', href: '/routes', icon: TruckIcon, restricted: false },
  { id: 'couriers', name: 'Курьеры', href: '/couriers', icon: UserGroupIcon, restricted: false },
  { id: 'financials', name: 'Касса рассчет', href: '/financials', icon: BanknotesIcon, restricted: false },
  { id: 'analytics', name: 'Аналитика', href: '/analytics', icon: ChartBarIcon, restricted: true },
  { id: 'telegram-parsing', name: 'Парсинг выгрузки в телеграм и реестре', href: '/telegram-parsing', icon: PaperClipIcon, restricted: true },
  { id: 'settings', name: 'Настройки', href: '/settings', icon: CogIcon, restricted: false },
] as const

const ADMIN_NAVIGATION = [
  { name: 'Пользователи', href: '/admin/users', icon: UsersIcon },
  { name: 'Настройки пользователей', href: '/admin/presets', icon: AdjustmentsHorizontalIcon },
  { name: 'Логи активности', href: '/admin/logs', icon: DocumentTextIcon },
  { name: 'Админ фичи', href: '/admin/system', icon: ShieldCheckIcon },
] as const

const NavLink = memo(function NavLink({
  item,
  isActive,
  isDark,
  onClick,
}: {
  item: { name: string; href: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }
  isActive: boolean
  isDark: boolean
  onClick?: () => void
}) {
  return (
    <Link
      to={item.href}
      onClick={onClick}
      className={clsx(
        'group flex items-center px-4 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-colors duration-100',
        isActive
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
          : isDark ? 'text-gray-400 hover:bg-white/5 hover:text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-black'
      )}
    >
      <item.icon className="mr-4 h-5 w-5 shrink-0" />
      {item.name}
    </Link>
  )
})

const DesktopNavLink = memo(function DesktopNavLink({
  item,
  isActive,
  isDark,
  isCollapsed,
}: {
  item: { name: string; href: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }
  isActive: boolean
  isDark: boolean
  isCollapsed: boolean
}) {
  return (
    <Link
      to={item.href}
      className={clsx(
        'group flex items-center px-4 py-4 rounded-2xl transition-colors duration-100 relative',
        isActive
          ? 'bg-blue-600/90 text-white shadow-md'
          : isDark ? 'text-gray-500 hover:text-gray-200 hover:bg-white/[0.03]' : 'text-gray-500 hover:text-gray-800 hover:bg-black/[0.03]'
      )}
    >
      <item.icon className="h-5 w-5 shrink-0" />
      <span className={clsx(
        "ml-5 text-[11px] font-black uppercase tracking-[0.15em] whitespace-nowrap transition-all duration-200",
        isCollapsed ? "opacity-0 translate-x-10 group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0" : "opacity-100 translate-x-0"
      )}>{item.name}</span>
    </Link>
  )
})

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(() =>
    localStorage.getItem('km_sidebar_collapsed') !== 'false'
  )
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const location = useLocation()
  const navigate = useNavigate()
  const { toggleTheme, isDark } = useTheme()
  const { user, logout, isAdmin } = useAuth()

  const handleLogout = useCallback(() => {
    logout()
    navigate('/login')
  }, [logout, navigate])

  const toggleSidebar = useCallback(() => {
    setIsCollapsed(prev => {
      const next = !prev
      localStorage.setItem('km_sidebar_collapsed', String(next))
      return next
    })
  }, [])

  const closeMobileSidebar = useCallback(() => setSidebarOpen(false), [])

  const visibleNavItems = useMemo(() =>
    NAVIGATION.filter(item => {
      if (isAdmin) return true
      return user?.allowedTabs ? user.allowedTabs.includes(item.id) : !item.restricted
    }),
    [isAdmin, user?.allowedTabs]
  )

  const currentPath = location.pathname

  return (
    <div className={clsx(
      'min-h-screen',
      isDark ? 'bg-[#0B0F1A]' : 'bg-gray-50'
    )}>
      {/* Mobile sidebar */}
      <div className={clsx(
        'fixed inset-0 z-50 lg:hidden transition-opacity duration-200',
        sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
      )}>
        <div className="fixed inset-0 bg-black/40" onClick={closeMobileSidebar} />
        <div className={clsx(
          'fixed inset-y-0 left-0 flex w-72 flex-col shadow-2xl transition-transform duration-200 ease-out transform-gpu will-change-transform',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          isDark ? 'bg-[#151B2C]' : 'bg-white'
        )}>
           <div className="flex h-16 items-center justify-between px-6 border-b border-black/5 dark:border-white/5">
             <div className="flex items-center gap-3">
               <div className="h-9 w-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg">
                 <span className="text-white font-black text-xs">KM</span>
               </div>
               <span className={clsx("font-black tracking-tight", isDark ? "text-white" : "text-black")}>МЕНЮ</span>
             </div>
             <button onClick={closeMobileSidebar} className="p-2 opacity-50 hover:opacity-100">
               <XMarkIcon className="w-6 h-6" />
             </button>
           </div>
           <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
             {visibleNavItems.map((item) => (
               <NavLink
                 key={item.id}
                 item={item}
                 isActive={currentPath === item.href}
                 isDark={isDark}
                 onClick={closeMobileSidebar}
               />
             ))}
           </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div
        className={clsx(
          "hidden lg:fixed lg:inset-y-0 lg:flex lg:flex-col transition-[width] duration-200 ease-out z-[100] group/sidebar",
          isCollapsed ? "lg:w-20 hover:lg:w-72" : "lg:w-72"
        )}
      >
        <div className={clsx(
          'flex flex-col flex-grow shadow-lg border-r relative overflow-hidden',
          isDark ? 'bg-[#0F1424] border-white/5' : 'bg-white border-gray-100'
        )}>
          {/* Header */}
          <div className={clsx(
            'flex h-20 items-center px-5 border-b shrink-0',
            isDark ? 'border-white/5' : 'border-gray-100'
          )}>
            <div className="flex items-center w-full">
              <div className="flex-shrink-0">
                <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white font-black text-xs">KM</span>
                </div>
              </div>
              <div className={clsx(
                "ml-6 transition-all duration-200",
                isCollapsed ? "opacity-0 pointer-events-none group-hover/sidebar:opacity-100 group-hover/sidebar:pointer-events-auto" : "opacity-100"
              )}>
                <h1 className={clsx(
                  'text-[10px] font-black tracking-[0.3em] uppercase whitespace-nowrap',
                  isDark ? 'text-gray-500' : 'text-gray-400'
                )}>
                  СИСТЕМА КОНТРОЛЯ
                </h1>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-4 py-8 space-y-2 overflow-y-auto overflow-x-hidden">
            {isAdmin && (
              <div className="mb-8">
                 <div className={clsx(
                   "px-4 mb-4 text-[9px] font-black uppercase tracking-[0.25em] transition-opacity duration-200",
                   isCollapsed ? "opacity-0 group-hover/sidebar:opacity-30" : "opacity-30"
                 )}>АДМИНИСТРИРОВАНИЕ</div>
                {ADMIN_NAVIGATION.map((item) => (
                    <DesktopNavLink
                      key={item.href}
                      item={item}
                      isActive={currentPath === item.href}
                      isDark={isDark}
                      isCollapsed={isCollapsed}
                    />
                ))}
              </div>
            )}

            <div className={clsx(
               "px-4 mb-4 text-[9px] font-black uppercase tracking-[0.25em] opacity-30 transition-opacity duration-200",
               isCollapsed ? "opacity-0" : "opacity-30"
             )}>ГЛАВНОЕ МЕНЮ</div>
            {visibleNavItems.map((item) => (
              <DesktopNavLink
                key={item.id}
                item={item}
                isActive={currentPath === item.href}
                isDark={isDark}
                isCollapsed={isCollapsed}
              />
            ))}
          </nav>

          {/* Toggle Button */}
          <div className="p-4 border-t border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.01]">
             <button
               onClick={toggleSidebar}
               className={clsx(
                 "w-full h-12 rounded-xl flex items-center justify-center transition-colors bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 active:scale-95",
               )}
               title={isCollapsed ? "Развернуть" : "Свернуть"}
             >
               <Bars3Icon className={clsx("h-5 w-5 transition-transform duration-300", isCollapsed ? "rotate-90" : "rotate-0")} />
             </button>
          </div>
        </div>
      </div>

      {/* Main content wrapper */}
      <div className={clsx(
        "flex flex-col min-h-screen transition-[padding] duration-200 ease-out",
        isCollapsed ? "lg:pl-20" : "lg:pl-64"
      )}>
        {/* Header */}
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between px-6 pointer-events-none">
          <div className="flex-1" />
          <div className="flex items-center gap-4 pointer-events-auto">
            <button
               onClick={toggleTheme}
               className={clsx(
                 'p-2.5 rounded-xl border transition-colors active:scale-95 shadow-lg',
                 isDark ? 'bg-gray-800 border-white/5 text-yellow-500' : 'bg-white border-gray-100 text-gray-400'
               )}
            >
              {isDark ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
            </button>

            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-xl border transition-colors shadow-lg active:scale-95',
                  isDark ? 'bg-gray-800 border-white/5' : 'bg-white border-gray-100'
                )}
              >
                <UserCircleIcon className="w-6 h-6 opacity-50" />
                <span className="text-[10px] font-black uppercase tracking-widest hidden sm:block">{user?.username}</span>
              </button>

              {userMenuOpen && (
                <div className={clsx(
                  'absolute right-0 mt-2 w-48 rounded-xl shadow-2xl border overflow-hidden',
                  isDark ? 'bg-[#151B2C] border-white/10' : 'bg-white border-gray-100'
                )}>
                  <Link to="/profile" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-colors">
                    <UserCircleIcon className="w-4 h-4" /> Профиль
                  </Link>
                  <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-500 hover:text-white transition-colors">
                    <ArrowRightOnRectangleIcon className="w-4 h-4" /> Выход
                  </button>
                </div>
              )}
            </div>

            <div className={clsx(
              "px-4 py-2 rounded-full border text-[9px] font-black uppercase tracking-[0.2em] shadow-lg hidden md:flex items-center gap-2",
              isDark ? "bg-gray-800 border-white/5 text-gray-500" : "bg-white border-gray-100 text-gray-400"
            )}>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              СИСТЕМА АКТИВНА
            </div>
          </div>
        </header>

        <main className={clsx(
          'flex-1 w-full max-w-[1920px] mx-auto flex flex-col',
          currentPath === '/map' ? 'overflow-hidden' : 'px-4 lg:px-8 py-4'
        )}>
          {children}
        </main>

        {currentPath !== '/map' && (
          <footer className="py-10 border-t border-black/5 dark:border-white/5">
             <div className="flex flex-col items-center gap-2 opacity-20">
                <span className="text-[10px] font-black uppercase tracking-[0.4em]">Powered by MaxSun Elite</span>
                <span className="text-[8px] font-bold uppercase tracking-[0.2em]">v5.300 optimized</span>
             </div>
          </footer>
        )}
      </div>

      <CalculationOverlay isDark={isDark} />
    </div>
  )
}
