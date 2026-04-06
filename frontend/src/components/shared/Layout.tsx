import { ReactNode, useState, useEffect } from 'react'
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
  BanknotesIcon
} from '@heroicons/react/24/outline'
import { clsx } from 'clsx'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'


interface LayoutProps {
  children: ReactNode
}

const navigation = [
  { id: 'dashboard', name: 'Панель управления', href: '/', icon: HomeIcon, restricted: false },
  { id: 'routes', name: 'Маршруты', href: '/routes', icon: MapIcon, restricted: false },
  { id: 'couriers', name: 'Курьеры', href: '/couriers', icon: UserGroupIcon, restricted: false },
  { id: 'financials', name: 'Касса рассчет', href: '/financials', icon: BanknotesIcon, restricted: false },
  { id: 'analytics', name: 'Аналитика', href: '/analytics', icon: ChartBarIcon, restricted: true },
  { id: 'telegram-parsing', name: 'Парсинг выгрузки в телеграм и реестре', href: '/telegram-parsing', icon: PaperClipIcon, restricted: true },
  { id: 'settings', name: 'Настройки', href: '/settings', icon: CogIcon, restricted: false },
]

const adminNavigation = [
  { name: 'Пользователи', href: '/admin/users', icon: UsersIcon },
  { name: 'Настройки пользователей', href: '/admin/presets', icon: AdjustmentsHorizontalIcon },
  { name: 'Логи активности', href: '/admin/logs', icon: DocumentTextIcon },
  { name: 'Админ фичи', href: '/admin/system', icon: ShieldCheckIcon },
]

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  // v5.228: Persistence handled in useEffect to avoid dispatcher context issues
  useEffect(() => {
    const saved = localStorage.getItem('km_sidebar_collapsed')
    if (saved === 'true') {
      setIsCollapsed(true)
    }
  }, [])
  const location = useLocation()
  const navigate = useNavigate()
  const { toggleTheme, isDark } = useTheme()
  const { user, logout, isAdmin } = useAuth()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const toggleSidebar = () => {
    setIsCollapsed(prev => {
      const next = !prev
      localStorage.setItem('km_sidebar_collapsed', String(next))
      return next
    })
  }

  return (
    <div className={clsx(
      'min-h-screen transition-colors duration-200',
      isDark ? 'bg-[#0B0F1A]' : 'bg-gray-50'
    )}>
      {/* Mobile sidebar (Overlays content) */}
      <div className={clsx(
        'fixed inset-0 z-50 lg:hidden transition-opacity duration-300',
        sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
      )}>
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
        <div className={clsx(
          'fixed inset-y-0 left-0 flex w-72 flex-col shadow-2xl transition-transform duration-300 ease-out transform-gpu will-change-transform',
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
             <button onClick={() => setSidebarOpen(false)} className="p-2 opacity-50 hover:opacity-100">
               <XMarkIcon className="w-6 h-6" />
             </button>
           </div>
           <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto custom-scrollbar">
             {/* Shared menu contents for mobile */}
             {navigation.map((item) => {
               const isAllowed = user?.allowedTabs ? user.allowedTabs.includes(item.id) : !item.restricted;
               if (!isAdmin && !isAllowed) return null;
               const isActive = location.pathname === item.href;
               return (
                 <Link
                   key={item.name}
                   to={item.href}
                   onClick={() => setSidebarOpen(false)}
                   className={clsx(
                     'group flex items-center px-4 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all',
                     isActive
                       ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                       : isDark ? 'text-gray-400 hover:bg-white/5 hover:text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-black'
                   )}
                 >
                   <item.icon className="mr-4 h-5 w-5 shrink-0" />
                   {item.name}
                 </Link>
               );
             })}
           </nav>
        </div>
      </div>


      {/* Desktop sidebar - Optimized for weak PCs v5.240 */}
      <div className={clsx(
        "hidden lg:fixed lg:inset-y-0 lg:flex lg:flex-col transition-[width] duration-500 ease-in-out z-50 will-change-[width]",
        isCollapsed ? "lg:w-20" : "lg:w-64"
      )}>
        <div className={clsx(
          'flex flex-col flex-grow shadow-lg transition-colors border-r relative overflow-hidden',
          isDark
            ? 'bg-[#0F1424] border-white/5'
            : 'bg-white border-gray-200'
        )}>
          {/* Static header for performance */}
          <div className={clsx(
            'flex h-16 items-center px-4 border-b shrink-0',
            isDark ? 'border-white/5' : 'border-gray-200'
          )}>
            <div className="flex items-center w-full">
              <div className="flex-shrink-0">
                <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg transform transition-transform hover:rotate-12 active:scale-95 cursor-pointer">
                  <span className="text-white font-black text-xs">KM</span>
                </div>
              </div>
              <div className={clsx(
                "ml-6 transition-all duration-500 overflow-hidden",
                isCollapsed ? "opacity-0 w-0 -translate-x-4" : "opacity-100 w-auto"
              )}>
                <h1 className={clsx(
                  'text-xs font-black tracking-[0.2em] uppercase whitespace-nowrap',
                  isDark ? 'text-gray-400' : 'text-gray-500'
                )}>
                  СИСТЕМА РАССЧЕТОВ
                </h1>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto overflow-x-hidden custom-scrollbar scroll-smooth">
            {/* Admin Section */}
            {isAdmin && (
              <div className="mb-6">
                {!isCollapsed && (
                  <div className="px-4 mb-2 text-[10px] font-black uppercase tracking-widest opacity-30">Админ</div>
                )}
                {adminNavigation.map((item) => (
                    <Link
                      key={item.href}
                      to={item.href}
                      className={clsx(
                        'group flex items-center px-4 py-3 rounded-xl transition-all duration-300 relative will-change-transform',
                        location.pathname === item.href
                          ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20 translate-x-1'
                          : isDark ? 'text-gray-500 hover:text-white hover:bg-white/5' : 'text-gray-400 hover:text-black hover:bg-gray-50'
                      )}
                      title={isCollapsed ? item.name : undefined}
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      {!isCollapsed && <span className="ml-4 text-xs font-black uppercase tracking-widest truncate">{item.name}</span>}
                    </Link>
                ))}
              </div>
            )}

            {/* Standard Nav */}
            {!isCollapsed && (
              <div className="px-4 mb-2 text-[10px] font-black uppercase tracking-widest opacity-30">Меню</div>
            )}
            {navigation.map((item) => {
              const isAllowed = user?.allowedTabs ? user.allowedTabs.includes(item.id) : !item.restricted;
              if (!isAdmin && !isAllowed) return null;
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.id}
                  to={item.href}
                  className={clsx(
                    'group flex items-center px-4 py-3 rounded-xl transition-all duration-300 relative will-change-transform',
                    isActive
                      ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/20 translate-x-1'
                      : isDark ? 'text-gray-500 hover:text-white hover:bg-white/5' : 'text-gray-400 hover:text-black hover:bg-gray-50'
                  )}
                  title={isCollapsed ? item.name : undefined}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {!isCollapsed && <span className="ml-4 text-xs font-black uppercase tracking-widest truncate">{item.name}</span>}
                </Link>
              )
            })}
          </nav>

          {/* Toggle Button at the bottom for better reach */}
          <div className="p-4 border-t border-black/5 dark:border-white/5">
             <button
               onClick={toggleSidebar}
               className={clsx(
                 "w-full py-3 rounded-xl flex items-center justify-center transition-all bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 group",
                 isCollapsed ? "px-0" : "px-4"
               )}
             >
               <Bars3Icon className={clsx("h-5 w-5 transition-transform duration-500", isCollapsed ? "rotate-90" : "")} />
             </button>
          </div>
        </div>
      </div>

      {/* Main content wrapper */}
      <div className={clsx(
        "flex flex-col min-h-screen transition-all duration-500 ease-in-out transform-gpu will-change-[padding]",
        isCollapsed ? "lg:pl-20" : "lg:pl-64"
      )}>
        {/* Simplified Header for performance */}
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between px-6 pointer-events-none">
          <div className="flex-1" />
          <div className="flex items-center gap-4 pointer-events-auto">
            <button
               onClick={toggleTheme}
               className={clsx(
                 'p-2.5 rounded-xl border transition-all active:scale-95 shadow-lg',
                 isDark ? 'bg-gray-800 border-white/5 text-yellow-500' : 'bg-white border-gray-100 text-gray-400'
               )}
            >
              {isDark ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
            </button>

            <div className="relative group">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-xl border transition-all shadow-lg active:scale-95',
                  isDark ? 'bg-gray-800 border-white/5' : 'bg-white border-gray-100'
                )}
              >
                <UserCircleIcon className="w-6 h-6 opacity-50" />
                <span className="text-[10px] font-black uppercase tracking-widest hidden sm:block">{user?.username}</span>
              </button>
              
              {userMenuOpen && (
                <div className={clsx(
                  'absolute right-0 mt-2 w-48 rounded-xl shadow-2xl border overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200',
                  isDark ? 'bg-[#151B2C] border-white/10' : 'bg-white border-gray-100'
                )}>
                  <Link to="/profile" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all">
                    <UserCircleIcon className="w-4 h-4" /> Профиль
                  </Link>
                  <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-500 hover:text-white transition-all">
                    <ArrowRightOnRectangleIcon className="w-4 h-4" /> Выход
                  </button>
                </div>
              )}
            </div>

            <div className={clsx(
              "px-4 py-2 rounded-full border text-[9px] font-black uppercase tracking-[0.2em] shadow-lg hidden md:flex items-center gap-2",
              isDark ? "bg-gray-800 border-white/5 text-gray-500" : "bg-white border-gray-100 text-gray-400"
            )}>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              SYSTEM ACTIVE
            </div>
          </div>
        </header>

        <main className="flex-1 w-full max-w-[1920px] mx-auto px-4 lg:px-8 py-4">
          {children}
        </main>

        <footer className="py-10 border-t border-black/5 dark:border-white/5">
           <div className="flex flex-col items-center gap-2 opacity-20">
              <span className="text-[10px] font-black uppercase tracking-[0.4em]">Powered by MaxSun Elite</span>
              <span className="text-[8px] font-bold uppercase tracking-[0.2em]">v5.240 optimized</span>
           </div>
        </footer>
      </div>
    </div>
  )
}

