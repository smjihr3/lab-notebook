import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider } from './store/authStore.jsx'
import { DriveProvider } from './store/driveStore'
import { ExperimentProvider } from './store/experimentStore'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <DriveProvider>
          <ExperimentProvider>
            <App />
          </ExperimentProvider>
        </DriveProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
)
