import { createContext, useContext, useState, useCallback } from 'react'
import { initDriveStructure, loadDriveStructure, loadSettings } from '../services/drive/driveStructure'
import { DEFAULT_SETTINGS } from '../schema/defaults'

const DriveContext = createContext(null)

export function DriveProvider({ children }) {
  const [folderMap, setFolderMap] = useState(null)
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS })
  const [status, setStatus] = useState('idle')   // 'idle' | 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null)

  const init = useCallback(async (token) => {
    setStatus('loading')
    setError(null)
    try {
      let map = await loadDriveStructure(token)
      if (!map) {
        map = await initDriveStructure(token)
      }
      const s = await loadSettings(map, token)
      setFolderMap(map)
      setSettings(s)
      setStatus('ready')
    } catch (err) {
      console.error('Drive init error:', err)
      setError(err.message ?? 'Drive 연결 실패')
      setStatus('error')
    }
  }, [])

  const reset = useCallback(() => {
    setFolderMap(null)
    setSettings({ ...DEFAULT_SETTINGS })
    setStatus('idle')
    setError(null)
  }, [])

  return (
    <DriveContext.Provider value={{ folderMap, settings, setSettings, status, error, init, reset }}>
      {children}
    </DriveContext.Provider>
  )
}

export function useDrive() {
  const ctx = useContext(DriveContext)
  if (!ctx) throw new Error('useDrive must be used within DriveProvider')
  return ctx
}
