import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider } from './store/authStore'
import { DriveProvider } from './store/driveStore'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <DriveProvider>
          <App />
        </DriveProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
)
