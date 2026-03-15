import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useAuth } from './store/authStore'
import { useDrive } from './store/driveStore'
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
  const { isLoggedIn, accessToken } = useAuth()
  const { status, error, init, reset } = useDrive()

  useEffect(() => {
    if (isLoggedIn && accessToken) {
      init(accessToken)
    } else {
      reset()
    }
  }, [isLoggedIn, accessToken])

  if (!isLoggedIn) return <LoginPage />

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Drive 연결 중...</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={() => init(accessToken)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          재시도
        </button>
      </div>
    )
  }

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
