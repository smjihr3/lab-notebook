import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider } from './store/authStore.jsx'
import { DriveProvider } from './store/driveStore'
import { ExperimentProvider } from './store/experimentStore'
import { GraphGroupProvider } from './features/graph/graphGroups'
import './index.css'
import 'reactflow/dist/style.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <DriveProvider>
          <ExperimentProvider>
            <GraphGroupProvider>
              <App />
            </GraphGroupProvider>
          </ExperimentProvider>
        </DriveProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
)
