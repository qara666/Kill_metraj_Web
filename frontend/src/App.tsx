import React, { Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

// Lazy load pages
const Dashboard = React.lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const Couriers = React.lazy(() => import('./pages/Couriers').then(m => ({ default: m.Couriers })))
const RoutesPage = React.lazy(() => import('./pages/Routes').then(m => ({ default: m.Routes })))
const Analytics = React.lazy(() => import('./pages/Analytics').then(m => ({ default: m.Analytics })))
const AutoPlanner = React.lazy(() => import('./pages/AutoPlanner').then(m => ({ default: m.AutoPlanner })))
const Settings = React.lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const TelegramParsing = React.lazy(() => import('./pages/TelegramParsing').then(m => ({ default: m.TelegramParsing })))

// Auth pages
import { Login } from './pages/Login'
import { Profile } from './pages/Profile'

// Admin pages
const AdminUsers = React.lazy(() => import('./pages/admin/Users').then(m => ({ default: m.AdminUsers })))
const AdminPresets = React.lazy(() => import('./pages/admin/Presets').then(m => ({ default: m.AdminPresets })))
const AdminLogs = React.lazy(() => import('./pages/admin/Logs').then(m => ({ default: m.AdminLogs })))
const Administration = React.lazy(() => import('./pages/admin/Administration').then(m => ({ default: m.Administration })))

// Components
import { Layout } from './components/shared/Layout'
import { GlobalDashboardFetcher } from './components/shared/GlobalDashboardFetcher'
import { ProtectedRoute } from './components/auth/ProtectedRoute'

// Contexts
import { ExcelDataProvider } from './contexts/ExcelDataContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ErrorProvider } from './contexts/ErrorContext'
import { AuthProvider } from './contexts/AuthContext'
import { ErrorBoundary } from './components/shared/ErrorBoundary'

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ErrorProvider>
          <AuthProvider>
            <ExcelDataProvider>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<Login />} />

                {/* Protected routes */}
                <Route
                  path="/*"
                  element={
                    <ProtectedRoute>
                      <GlobalDashboardFetcher />
                      <Layout>
                        <Suspense fallback={<div className="p-6 text-sm text-gray-500">Загрузка...</div>}>
                          <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/routes" element={<RoutesPage />} />
                            <Route path="/couriers" element={<Couriers />} />
                            <Route path="/autoplanner" element={<AutoPlanner />} />
                            <Route path="/analytics" element={<Analytics />} />
                            <Route path="/telegram-parsing" element={<TelegramParsing />} />
                            <Route path="/settings" element={<Settings />} />
                            <Route path="/profile" element={<Profile />} />

                            {/* Admin routes - require admin role */}
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
                                <ProtectedRoute requireAdmin>
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

                            {/* Fallback */}
                            <Route path="*" element={<Navigate to="/" replace />} />
                          </Routes>
                        </Suspense>
                      </Layout>
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </ExcelDataProvider>
          </AuthProvider>
        </ErrorProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
