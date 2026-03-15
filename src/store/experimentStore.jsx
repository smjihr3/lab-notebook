import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from './authStore.jsx'
import { useDrive } from './driveStore'
import {
  findFile,
  readJsonFile,
  createJsonFile,
  updateJsonFile,
  trashFile,
} from '../services/drive/driveClient'
import { saveExperiment as saveExpDrive } from '../services/drive/driveService'

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000

const ExperimentContext = createContext(null)

function extractMeta(exp) {
  return {
    id: exp.id,
    title: exp.title ?? '',
    createdAt: exp.createdAt ?? null,
    status: exp.status ?? 'in_progress',
    outcome: exp.outcome ?? 'unknown',
    tags: exp.tags ?? [],
    _fileId: exp._fileId ?? null,
  }
}

export function ExperimentProvider({ children }) {
  const { accessToken } = useAuth()
  const { folderMap } = useDrive()

  const [experiments, setExperiments] = useState([])
  const [fetchingIds, setFetchingIds] = useState(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [isReady, setIsReady] = useState(false)

  const tokenRef      = useRef(accessToken)
  const folderMapRef  = useRef(folderMap)
  const indexFileIdRef = useRef(null)
  const experimentsRef = useRef([])
  const cacheRef       = useRef({})    // id → full experiment data

  useEffect(() => { tokenRef.current = accessToken }, [accessToken])
  useEffect(() => { folderMapRef.current = folderMap }, [folderMap])

  function _setExp(list) {
    experimentsRef.current = list
    setExperiments(list)
  }

  function _patchCache(updater) {
    cacheRef.current =
      typeof updater === 'function' ? updater(cacheRef.current) : updater
  }

  // ── Init ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!folderMap || !accessToken) {
      _setExp([])
      _patchCache({})
      indexFileIdRef.current = null
      setIsReady(false)
      return
    }
    _initStore(accessToken, folderMap)
  }, [folderMap?.root, accessToken])

  async function _initStore(token, map) {
    setIsLoading(true)
    try {
      // Load or create index file in LabNotebook root
      const indexFile = await findFile(
        'experiments_index.json', map.root, 'application/json', token
      )
      let indexData = []
      if (indexFile) {
        indexFileIdRef.current = indexFile.id
        const raw = await readJsonFile(indexFile.id, token)
        indexData = Array.isArray(raw) ? raw : []
      } else {
        const created = await createJsonFile('experiments_index.json', map.root, [], token)
        indexFileIdRef.current = created.id
      }

      _setExp(indexData)

      // Auto-load recent 6 months into cache
      const cutoff = Date.now() - SIX_MONTHS_MS
      const recent = indexData.filter(
        (e) => e._fileId && e.createdAt && new Date(e.createdAt).getTime() >= cutoff
      )
      if (recent.length > 0) {
        const results = await Promise.allSettled(
          recent.map(async (meta) => {
            const full = await readJsonFile(meta._fileId, token)
            return [meta.id, { ...full, _fileId: meta._fileId }]
          })
        )
        const newCache = {}
        for (const r of results) {
          if (r.status === 'fulfilled') {
            const [id, data] = r.value
            newCache[id] = data
          }
        }
        _patchCache(newCache)
      }

      setIsReady(true)
    } catch (err) {
      console.error('experimentStore init error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  async function _persistIndex(list) {
    const fileId = indexFileIdRef.current
    if (!fileId) return
    await updateJsonFile(fileId, list.map(extractMeta), tokenRef.current)
  }

  // ── Public API ────────────────────────────────────────────────

  /** 캐시에 있으면 즉시 반환, 없으면 Drive에서 로드 후 캐시 저장 */
  const getExperiment = useCallback(async (id) => {
    if (cacheRef.current[id]) return cacheRef.current[id]

    const meta = experimentsRef.current.find((e) => e.id === id)
    if (!meta?._fileId) return null

    setFetchingIds((prev) => new Set([...prev, id]))
    try {
      const full = await readJsonFile(meta._fileId, tokenRef.current)
      const data = { ...full, _fileId: meta._fileId }
      _patchCache((prev) => ({ ...prev, [id]: data }))
      return data
    } finally {
      setFetchingIds((prev) => { const s = new Set(prev); s.delete(id); return s })
    }
  }, [])

  /** Drive에 저장 후 캐시 + 인덱스 업데이트 */
  const createExperiment = useCallback(async (data) => {
    const saved = await saveExpDrive(data, {
      token: tokenRef.current,
      folderMap: folderMapRef.current,
    })
    _patchCache((prev) => ({ ...prev, [saved.id]: saved }))
    const newList = [extractMeta(saved), ...experimentsRef.current]
    _setExp(newList)
    _persistIndex(newList).catch(console.error)
    return saved
  }, [])

  /** 캐시 즉시 업데이트 → Drive 저장 → 인덱스 업데이트. Promise 반환 (저장 완료 시 resolve) */
  const updateExperiment = useCallback(async (data) => {
    // Optimistic
    _patchCache((prev) => ({ ...prev, [data.id]: data }))
    const optimisticList = experimentsRef.current.map((e) =>
      e.id === data.id ? { ...extractMeta(data), _fileId: e._fileId ?? data._fileId } : e
    )
    _setExp(optimisticList)

    // Drive save
    const saved = await saveExpDrive(data, {
      token: tokenRef.current,
      folderMap: folderMapRef.current,
    })
    _patchCache((prev) => ({ ...prev, [saved.id]: saved }))
    const savedList = experimentsRef.current.map((e) =>
      e.id === saved.id ? extractMeta(saved) : e
    )
    _setExp(savedList)
    await _persistIndex(savedList)
    return saved
  }, [])

  /** 캐시 + 인덱스에서 제거 후 Drive trash */
  const deleteExperiment = useCallback(async (id) => {
    const meta = experimentsRef.current.find((e) => e.id === id)
    _patchCache((prev) => { const n = { ...prev }; delete n[id]; return n })
    const newList = experimentsRef.current.filter((e) => e.id !== id)
    _setExp(newList)
    if (meta?._fileId) {
      await trashFile(meta._fileId, tokenRef.current)
    }
    await _persistIndex(newList)
  }, [])

  const isFetching = useCallback((id) => fetchingIds.has(id), [fetchingIds])

  return (
    <ExperimentContext.Provider value={{
      experiments,
      isLoading,
      isReady,
      isFetching,
      getExperiment,
      createExperiment,
      updateExperiment,
      deleteExperiment,
    }}>
      {children}
    </ExperimentContext.Provider>
  )
}

export function useExperiments() {
  const ctx = useContext(ExperimentContext)
  if (!ctx) throw new Error('useExperiments must be used within ExperimentProvider')
  return ctx
}
