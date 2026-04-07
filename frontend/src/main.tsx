import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App.tsx'
import './index.css'
import './styles/themes.css'

// Contexts
import { ExcelDataProvider } from './contexts/ExcelDataContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ErrorProvider } from './contexts/ErrorContext'
import { AuthProvider } from './contexts/AuthContext'
import { ErrorBoundary } from './components/shared/ErrorBoundary'

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})

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
                        backdropFilter: 'saturate(120%) blur(4px)',
                        borderRadius: '10px'
                      },
                      success: {
                        duration: 3000,
                        iconTheme: {
                          primary: '#22c55e',
                          secondary: '#fff',
                        },
                      },
                      error: {
                        duration: 5000,
                        iconTheme: {
                          primary: '#ef4444',
                          secondary: '#fff',
                        },
                      },
                    }}
                  />
                </BrowserRouter>
              </AuthProvider>
            </ExcelDataProvider>
          </ErrorProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>,
)
