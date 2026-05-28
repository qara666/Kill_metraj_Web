import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import './index.css'

import { ExcelDataProvider } from './contexts/ExcelDataContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ErrorProvider } from './contexts/ErrorContext'
import { AuthProvider } from './contexts/AuthContext'
import { ErrorBoundary } from './components/shared/ErrorBoundary'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000,
      cacheTime: 10 * 60 * 1000,
    },
  },
})

const Toaster = React.lazy(() =>
  import('react-hot-toast').then(mod => ({ default: mod.Toaster }))
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <ThemeProvider>
          <ErrorProvider>
            <ExcelDataProvider>
              <AuthProvider>
                <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                  <App />
                  <React.Suspense fallback={null}>
                    <Toaster
                      position="top-right"
                      gutter={10}
                      containerStyle={{ top: 76, right: 16, zIndex: 60 }}
                      toastOptions={{
                        duration: 4000,
                        style: {
                          background: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-primary)',
                          boxShadow: 'var(--shadow-lg)',
                          opacity: 0.95,
                          borderRadius: '10px'
                        },
                        success: {
                          duration: 3000,
                          iconTheme: { primary: '#22c55e', secondary: '#fff' },
                        },
                        error: {
                          duration: 5000,
                          iconTheme: { primary: '#ef4444', secondary: '#fff' },
                        },
                      }}
                    />
                  </React.Suspense>
                </BrowserRouter>
              </AuthProvider>
            </ExcelDataProvider>
          </ErrorProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>,
)
