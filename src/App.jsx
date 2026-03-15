import { useEffect } from 'react'
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom'
import { useAuth } from './store/authStore.jsx'
import { useDrive } from './store/driveStore'
import Sidebar from './components/Sidebar'
import LoginPage from './pages/LoginPage'
import ExperimentListPage from './features/experiment/ExperimentListPage'
import ExperimentDetailPage from './features/experiment/ExperimentDetailPage'
import ExperimentNewPage from './features/experiment/ExperimentNewPage'
import {
  DashboardPage,
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
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto pb-16 md:pb-0">
        <Outlet />
      </main>
    </div>
  )
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true,                element: <DashboardPage /> },
      { path: 'experiments',        element: <ExperimentListPage /> },
      { path: 'experiments/new',    element: <ExperimentNewPage /> },
      { path: 'experiments/:id',    element: <ExperimentDetailPage /> },
      { path: 'graph',              element: <GraphPage /> },
      { path: 'calendar',           element: <CalendarPage /> },
      { path: 'browser',            element: <BrowserPage /> },
      { path: 'references',         element: <ReferencesPage /> },
      { path: 'tips',               element: <TipsPage /> },
      { path: 'settings',           element: <SettingsPage /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
