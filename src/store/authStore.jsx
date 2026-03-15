import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)       // { name, email, picture }
  const [accessToken, setAccessToken] = useState(null)

  const login = ({ user, accessToken }) => {
    setUser(user)
    setAccessToken(accessToken)
  }

  const logout = () => {
    setUser(null)
    setAccessToken(null)
  }

  return (
    <AuthContext.Provider value={{ user, accessToken, isLoggedIn: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
