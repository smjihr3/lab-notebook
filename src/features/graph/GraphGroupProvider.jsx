import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from '../../store/authStore'
import { useDrive } from '../../store/driveStore'
import { findFile, readJsonFile, createJsonFile, updateJsonFile } from '../../services/drive/driveClient'
import { migrateGroups } from './graphGroups'

const GraphGroupContext = createContext(null)
const FILE_NAME = 'graph_groups.json'

export function GraphGroupProvider({ children }) {
  const { accessToken } = useAuth()
  const { folderMap } = useDrive()

  const [groups, setGroups] = useState([])
  const fileIdRef = useRef(null)
  const tokenRef  = useRef(accessToken)

  useEffect(() => { tokenRef.current = accessToken }, [accessToken])

  // 초기 로드
  useEffect(() => {
    if (!folderMap?.root || !accessToken) { setGroups([]); return }
    ;(async () => {
      try {
        const file = await findFile(FILE_NAME, folderMap.root, 'application/json', accessToken)
        if (file) {
          fileIdRef.current = file.id
          const data = await readJsonFile(file.id, accessToken)
          setGroups(Array.isArray(data) ? migrateGroups(data) : [])
        } else {
          const created = await createJsonFile(FILE_NAME, folderMap.root, [], accessToken)
          fileIdRef.current = created.id
          setGroups([])
        }
      } catch (err) {
        console.error('graphGroups load error:', err)
      }
    })()
  }, [folderMap?.root, accessToken])

  async function _persist(list) {
    if (!fileIdRef.current) return
    try {
      await updateJsonFile(fileIdRef.current, list, tokenRef.current)
    } catch (err) {
      console.error('graphGroups save error:', err)
    }
  }

  const addGroup = useCallback((group) => {
    setGroups((prev) => {
      const next = [...prev, group]
      _persist(next)
      return next
    })
  }, [])

  const updateGroup = useCallback((id, partial) => {
    setGroups((prev) => {
      const next = prev.map((g) => g.id === id ? { ...g, ...partial } : g)
      _persist(next)
      return next
    })
  }, [])

  const removeGroup = useCallback((id) => {
    setGroups((prev) => {
      const next = prev.filter((g) => g.id !== id)
      _persist(next)
      return next
    })
  }, [])

  return (
    <GraphGroupContext.Provider value={{ groups, addGroup, updateGroup, removeGroup }}>
      {children}
    </GraphGroupContext.Provider>
  )
}

export function useGraphGroups() {
  const ctx = useContext(GraphGroupContext)
  if (!ctx) throw new Error('useGraphGroups must be used within GraphGroupProvider')
  return ctx
}
