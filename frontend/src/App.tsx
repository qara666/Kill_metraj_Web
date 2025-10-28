import React, { Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
const Dashboard = React.lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const Couriers = React.lazy(() => import('./pages/Couriers').then(m => ({ default: m.Couriers })))
const RoutesPage = React.lazy(() => import('./pages/Routes').then(m => ({ default: m.Routes })))
const Zones = React.lazy(() => import('./pages/Zones').then(m => ({ default: m.Zones })))
const Analytics = React.lazy(() => import('./pages/Analytics').then(m => ({ default: m.Analytics })))
const Settings = React.lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
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
              <Route path="/couriers" element={<Couriers />} />
              <Route path="/routes" element={<RoutesPage />} />
              <Route path="/zones" element={<Zones />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Suspense>
        </Layout>
      </ExcelDataProvider>
    </ThemeProvider>
  )
}

export default App
