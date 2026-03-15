import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from '../../store/authStore'
import { useDrive } from '../../store/driveStore'
import { findFile, readJsonFile, createJsonFile, updateJsonFile } from '../../services/drive/driveClient'
import { NODE_WIDTH, NODE_HEIGHT } from './dagreLayout'

// ── 색상 팔레트 ────────────────────────────────────────────────
export const GROUP_COLORS = [
  { name: 'blue',   value: '#3b82f6' },
  { name: 'green',  value: '#22c55e' },
  { name: 'purple', value: '#a855f7' },
  { name: 'orange', value: '#f97316' },
  { name: 'red',    value: '#ef4444' },
  { name: 'teal',   value: '#14b8a6' },
]

// ── 유틸 함수 ──────────────────────────────────────────────────

/**
 * startNodeId에서 followingExperiments를 따라 BFS 탐색.
 * endNodeId가 null이면 모든 하위 노드 포함.
 * endNodeId가 있으면 start→end 경로상의 노드만 포함.
 * @returns {Set<string>}
 */
export function resolveGroupNodeIds(group, experiments) {
  const expMap = Object.fromEntries(experiments.map((e) => [e.id, e]))

  // 전방 BFS: startNodeId → followingExperiments
  const forward = new Set()
  const fq = [group.startNodeId]
  while (fq.length > 0) {
    const id = fq.shift()
    if (forward.has(id)) continue
    forward.add(id)
    const exp = expMap[id]
    if (!exp) continue
    for (const nid of exp.connections?.followingExperiments ?? []) {
      if (!forward.has(nid)) fq.push(nid)
    }
  }

  if (!group.endNodeId) return forward

  // 후방 BFS: endNodeId ← precedingExperiments
  const backward = new Set()
  const bq = [group.endNodeId]
  while (bq.length > 0) {
    const id = bq.shift()
    if (backward.has(id)) continue
    backward.add(id)
    const exp = expMap[id]
    if (!exp) continue
    for (const pid of exp.connections?.precedingExperiments ?? []) {
      if (!backward.has(pid)) bq.push(pid)
    }
  }

  // 교집합 (start→end 경로상 노드)
  const result = new Set()
  for (const id of forward) {
    if (backward.has(id)) result.add(id)
  }
  return result
}

/**
 * nodeIds에 해당하는 ReactFlow 노드들의 바운딩 박스 계산.
 * padding 32px 포함.
 * @returns {{ x, y, width, height } | null}
 */
export function getGroupBounds(nodeIds, rfNodes, padding = 32) {
  const relevant = rfNodes.filter(
    (n) => nodeIds.has(n.id) && !n.id.startsWith('group-bg-')
  )
  if (relevant.length === 0) return null

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of relevant) {
    const w = n.width  ?? NODE_WIDTH
    const h = n.height ?? NODE_HEIGHT
    minX = Math.min(minX, n.position.x)
    minY = Math.min(minY, n.position.y)
    maxX = Math.max(maxX, n.position.x + w)
    maxY = Math.max(maxY, n.position.y + h)
  }

  return {
    x:      minX - padding,
    y:      minY - padding,
    width:  maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  }
}

// ── Context Store ──────────────────────────────────────────────

const GraphGroupContext = createContext(null)
const FILE_NAME = 'graph_groups.json'

export function GraphGroupProvider({ children }) {
  const { accessToken } = useAuth()
  const { folderMap } = useDrive()

  const [groups, setGroups] = useState([])
  const fileIdRef  = useRef(null)
  const tokenRef   = useRef(accessToken)
  const folderRef  = useRef(folderMap)

  useEffect(() => { tokenRef.current  = accessToken }, [accessToken])
  useEffect(() => { folderRef.current = folderMap   }, [folderMap])

  // 초기 로드
  useEffect(() => {
    if (!folderMap?.root || !accessToken) { setGroups([]); return }
    ;(async () => {
      try {
        const file = await findFile(FILE_NAME, folderMap.root, 'application/json', accessToken)
        if (file) {
          fileIdRef.current = file.id
          const data = await readJsonFile(file.id, accessToken)
          setGroups(Array.isArray(data) ? data : [])
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

// ── ID 생성 ────────────────────────────────────────────────────
export function generateGroupId(groups) {
  const nums = groups
    .map((g) => { const m = g.id?.match(/^group_(\d+)$/); return m ? parseInt(m[1], 10) : 0 })
    .filter(Boolean)
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
  return `group_${String(next).padStart(3, '0')}`
}
