import { Routes, Route } from 'react-router-dom'
import { Dashboard } from './pages/Dashboard'
import { Couriers } from './pages/Couriers'
import { Routes as RoutesPage } from './pages/Routes'
import { Analytics } from './pages/Analytics'
import { Settings } from './pages/Settings'
import { Layout } from './components/Layout'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/couriers" element={<Couriers />} />
        <Route path="/routes" element={<RoutesPage />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  )
}

export default App
