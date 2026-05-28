import React, { Suspense, useMemo, useCallback, useEffect, useRef } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'

const Dashboard = React.lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const Couriers = React.lazy(() => import('./pages/Couriers').then(m => ({ default: m.Couriers })))
const RoutesPage = React.lazy(() => import('./pages/Routes').then(m => ({ default: m.Routes })))
const MapPage = React.lazy(() => import('./pages/MapPage').then(m => ({ default: m.MapPage })))
const Analytics = React.lazy(() => import('./pages/Analytics').then(m => ({ default: m.Analytics })))
const Settings = React.lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const TelegramParsing = React.lazy(() => import('./pages/TelegramParsing').then(m => ({ default: m.TelegramParsing })))
const Financials = React.lazy(() => import('./pages/Financials').then(m => ({ default: m.Financials })))

import { Login } from './pages/Login'
import { Profile } from './pages/Profile'

const AdminUsers = React.lazy(() => import('./pages/admin/Users').then(m => ({ default: m.AdminUsers })))
const AdminPresets = React.lazy(() => import('./pages/admin/Presets').then(m => ({ default: m.AdminPresets })))
const AdminLogs = React.lazy(() => import('./pages/admin/Logs').then(m => ({ default: m.AdminLogs })))
const Administration = React.lazy(() => import('./pages/admin/Administration').then(m => ({ default: m.Administration })))

import { Layout } from './components/shared/Layout'
import { GlobalDashboardFetcher } from './components/shared/GlobalDashboardFetcher'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import { ProtectedRoute } from './components/auth/ProtectedRoute'

// Полифил для requestIdleCallback (Safari/WebKit)
const rIC = (typeof requestIdleCallback !== 'undefined')
  ? requestIdleCallback
  : (cb: IdleRequestCallback) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline), 1)

function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-gray-400 font-medium">Загрузка...</span>
      </div>
    </div>
  )
}

const prefetchFns: Record<string, () => void> = {
  '/': () => { import('./pages/Dashboard') },
  '/routes': () => { import('./pages/Routes') },
  '/couriers': () => { import('./pages/Couriers') },
  '/analytics': () => { import('./pages/Analytics') },
  '/financials': () => { import('./pages/Financials') },
  '/settings': () => { import('./pages/Settings') },
  '/telegram-parsing': () => { import('./pages/TelegramParsing') },
}

let prefetched = new Set<string>()

function usePrefetch() {
  const location = useLocation()
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const current = location.pathname
    if (!prefetched.has(current) && current !== '/login') {
      prefetched.add(current)
    }
    const paths = ['/', '/routes', '/couriers', '/analytics', '/financials', '/settings']

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      rIC(() => {
        paths.forEach(p => {
          if (!prefetched.has(p)) {
            prefetched.add(p)
            prefetchFns[p]?.()
          }
        })
      })
    }, 200)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [location.pathname])
}

function App() {
  usePrefetch()

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <GlobalDashboardFetcher />
            <Layout>
              <ErrorBoundary>
              <Suspense fallback={<PageSpinner />}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/routes" element={<RoutesPage />} />
                  <Route path="/map" element={<MapPage />} />
                  <Route path="/couriers" element={<Couriers />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/telegram-parsing" element={<TelegramParsing />} />
                  <Route path="/financials" element={<Financials />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/profile" element={<Profile />} />

                  <Route
                    path="/admin/users"
                    element={
                      <ProtectedRoute requireAdmin>
                        <AdminUsers />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/presets"
                    element={
                      <ProtectedRoute>
                        <AdminPresets />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/logs"
                    element={
                      <ProtectedRoute requireAdmin>
                        <AdminLogs />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/system"
                    element={
                      <ProtectedRoute requireAdmin>
                        <Administration />
                      </ProtectedRoute>
                    }
                  />

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
              </ErrorBoundary>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default App
