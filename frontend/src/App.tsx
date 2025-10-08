import { Routes, Route } from 'react-router-dom'
import { Dashboard } from './pages/Dashboard'
import { Couriers } from './pages/Couriers'
import { Routes as RoutesPage } from './pages/Routes'
import { Zones } from './pages/Zones'
import { Analytics } from './pages/Analytics'
import { Settings } from './pages/Settings'
import { Layout } from './components/Layout'
import { ExcelDataProvider } from './contexts/ExcelDataContext'
import { ThemeProvider } from './contexts/ThemeContext'

function App() {
  return (
    <ThemeProvider>
      <ExcelDataProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/couriers" element={<Couriers />} />
            <Route path="/routes" element={<RoutesPage />} />
            <Route path="/zones" element={<Zones />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Layout>
      </ExcelDataProvider>
    </ThemeProvider>
  )
}

export default App
