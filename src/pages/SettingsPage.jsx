import { useGoogleLogin } from '@react-oauth/google'
import { useAuth } from '../store/authStore'

export default function SettingsPage() {
  const { user, logout } = useAuth()

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">설정</h1>

      {/* 계정 정보 */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">계정</h2>
        {user && (
          <div className="flex items-center gap-3 mb-4">
            {user.picture && (
              <img src={user.picture} alt={user.name} className="w-10 h-10 rounded-full" />
            )}
            <div>
              <p className="text-sm font-medium text-gray-900">{user.name}</p>
              <p className="text-xs text-gray-500">{user.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 font-medium transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
          </svg>
          로그아웃
        </button>
      </section>
    </div>
  )
}
