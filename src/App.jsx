import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useAuth } from './store/authStore'
import Sidebar from './components/Sidebar'
import LoginPage from './pages/LoginPage'
import {
  DashboardPage,
  ExperimentsPage,
  ExperimentDetailPage,
  GraphPage,
  CalendarPage,
  BrowserPage,
  ReferencesPage,
  TipsPage,
  SettingsPage,
} from './pages'

function AppShell() {
  const { isLoggedIn } = useAuth()

  if (!isLoggedIn) return <LoginPage />

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 overflow-auto pb-16 md:pb-0">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/experiments" element={<ExperimentsPage />} />
            <Route path="/experiments/:id" element={<ExperimentDetailPage />} />
            <Route path="/graph" element={<GraphPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/browser" element={<BrowserPage />} />
            <Route path="/references" element={<ReferencesPage />} />
            <Route path="/tips" element={<TipsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default function App() {
  return <AppShell />
}
