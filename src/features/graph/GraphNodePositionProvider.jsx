import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from '../../store/authStore'
import { useDrive } from '../../store/driveStore'
import { findFile, readJsonFile, createJsonFile, updateJsonFile } from '../../services/drive/driveClient'

const GraphNodePositionContext = createContext(null)
const FILE_NAME = 'node_positions.json'

export function GraphNodePositionProvider({ children }) {
  const { accessToken } = useAuth()
  const { folderMap } = useDrive()

  const [nodePositions, setNodePositions] = useState({}) // { [nodeId]: {x, y} }
  const fileIdRef   = useRef(null)
  const tokenRef    = useRef(accessToken)
  const debounceRef = useRef(null)

  useEffect(() => { tokenRef.current = accessToken }, [accessToken])

  // 초기 로드
  useEffect(() => {
    if (!folderMap?.root || !accessToken) { setNodePositions({}); return }
    ;(async () => {
      try {
        const file = await findFile(FILE_NAME, folderMap.root, 'application/json', accessToken)
        if (file) {
          fileIdRef.current = file.id
          const data = await readJsonFile(file.id, accessToken)
          setNodePositions(data && typeof data === 'object' && !Array.isArray(data) ? data : {})
        } else {
          const created = await createJsonFile(FILE_NAME, folderMap.root, {}, accessToken)
          fileIdRef.current = created.id
          setNodePositions({})
        }
      } catch (err) {
        console.error('nodePositions load error:', err)
      }
    })()
  }, [folderMap?.root, accessToken])

  async function _persist(data) {
    if (!fileIdRef.current) return
    try {
      await updateJsonFile(fileIdRef.current, data, tokenRef.current)
    } catch (err) {
      console.error('nodePositions save error:', err)
    }
  }

  const savePositions = useCallback((posMap) => {
    // posMap: Map<nodeId, {x, y}>
    const obj = Object.fromEntries(posMap)
    setNodePositions(obj)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { _persist(obj) }, 500)
  }, [])

  return (
    <GraphNodePositionContext.Provider value={{ nodePositions, savePositions }}>
      {children}
    </GraphNodePositionContext.Provider>
  )
}

export function useGraphNodePositions() {
  const ctx = useContext(GraphNodePositionContext)
  if (!ctx) throw new Error('useGraphNodePositions must be used within GraphNodePositionProvider')
  return ctx
}
