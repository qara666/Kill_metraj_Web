import React, { Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
const Dashboard = React.lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const Couriers = React.lazy(() => import('./pages/Couriers').then(m => ({ default: m.Couriers })))
const RoutesPage = React.lazy(() => import('./pages/Routes').then(m => ({ default: m.Routes })))
const Analytics = React.lazy(() => import('./pages/Analytics').then(m => ({ default: m.Analytics })))
const AutoPlanner = React.lazy(() => import('./pages/AutoPlanner').then(m => ({ default: m.AutoPlanner })))
const Settings = React.lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const TelegramParsing = React.lazy(() => import('./pages/TelegramParsing').then(m => ({ default: m.TelegramParsing })))
import { Layout } from './components/Layout'
import { ExcelDataProvider } from './contexts/ExcelDataContext'
import { ThemeProvider } from './contexts/ThemeContext'

function App() {
  return (
    <ThemeProvider>
      <ExcelDataProvider>
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
            </Routes>
          </Suspense>
        </Layout>
      </ExcelDataProvider>
    </ThemeProvider>
  )
}

export default App
