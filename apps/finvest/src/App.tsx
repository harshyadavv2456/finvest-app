import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import IntelligencePage from './pages/IntelligencePage'
import MarketsPage from './pages/MarketsPage'
import PilotPage from './pages/PilotPage'
import FinSightPage from './pages/FinSightPage'
import FinDashPage from './pages/FinDashPage'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/intelligence" element={<IntelligencePage />} />
        <Route path="/intelligence/:market" element={<IntelligencePage />} />
        <Route path="/markets" element={<MarketsPage />} />
        <Route path="/pilot" element={<PilotPage />} />
        <Route path="/finsight/*" element={<FinSightPage />} />
        <Route path="/findash/*" element={<FinDashPage />} />
      </Routes>
    </Layout>
  )
}

export default App

