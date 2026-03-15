import { NODE_WIDTH, NODE_HEIGHT } from './dagreLayout'

// ── 색상 팔레트 ────────────────────────────────────────────────
export const GROUP_COLORS = [
  { name: 'blue',   value: '#93c5fd' },
  { name: 'green',  value: '#86efac' },
  { name: 'purple', value: '#c4b5fd' },
  { name: 'orange', value: '#fdba74' },
  { name: 'red',    value: '#fca5a5' },
  { name: 'teal',   value: '#5eead4' },
]

// ── 스키마 마이그레이션 ───────────────────────────────────────
/**
 * 구 스키마 → 신 스키마 변환:
 *   startNodeId  → startNodeIds: string[]
 *   endNodeId    → endNodeIds:   string[]  (legacy: GraphView에서 blockedEdges/terminalNodeIds로 변환)
 *   (신규) blockedEdges: Array<{ from, to }>  기본 []
 *   (신규) terminalNodeIds: string[]          기본 []
 */
export function migrateGroup(group) {
  const g = { ...group }
  if (!('startNodeIds' in g)) {
    g.startNodeIds = g.startNodeId ? [g.startNodeId] : []
  }
  if (!('endNodeIds' in g)) {
    g.endNodeIds = g.endNodeId ? [g.endNodeId] : []
  }
  if (!('blockedEdges' in g))    g.blockedEdges    = []
  if (!('terminalNodeIds' in g)) g.terminalNodeIds = []
  return g
}

export function migrateGroups(groups) {
  return groups.map(migrateGroup)
}

/**
 * 구형 endNodeIds → blockedEdges / terminalNodeIds 변환.
 * 실험 데이터(experimentMap)가 필요하므로 GraphView 로드 시점에 호출.
 * 마이그레이션이 불필요한 경우 null 반환.
 * @returns {{ blockedEdges, terminalNodeIds, endNodeIds } | null}
 */
export function migrateGroupEndNodes(group, experimentMap) {
  if (!group.endNodeIds?.length) return null

  const newBlockedEdges    = [...(group.blockedEdges    ?? [])]
  const newTerminalNodeIds = [...(group.terminalNodeIds ?? [])]

  for (const endId of group.endNodeIds) {
    const endExp   = experimentMap[endId]
    const followers = endExp?.connections?.followingExperiments ?? []
    if (followers.length > 0) {
      for (const followerId of followers) {
        if (!newBlockedEdges.some((e) => e.from === endId && e.to === followerId)) {
          newBlockedEdges.push({ from: endId, to: followerId })
        }
      }
    } else {
      if (!newTerminalNodeIds.includes(endId)) {
        newTerminalNodeIds.push(endId)
      }
    }
  }

  return { blockedEdges: newBlockedEdges, terminalNodeIds: newTerminalNodeIds, endNodeIds: [] }
}

// ── 유틸 함수 ──────────────────────────────────────────────────

/**
 * BFS 탐색. startNodeIds 큐에서 시작하여:
 * - terminalNodeIds에 해당하는 노드: 포함하되 자식 탐색 중단
 * - blockedEdges { from, to } 에 해당하는 간선: 건너뜀
 *
 * 구형 endNodeIds 호환: 있으면 terminalNodeIds로 간주.
 *
 * @returns {Set<string>}
 */
export function resolveGroupNodeIds(group, experiments) {
  const expMap   = Object.fromEntries(experiments.map((e) => [e.id, e]))
  const startIds = group.startNodeIds ?? (group.startNodeId ? [group.startNodeId] : [])

  const blockedEdges    = group.blockedEdges    ?? []
  const blockedSet      = new Set(blockedEdges.map((e) => `${e.from}→${e.to}`))
  const terminalSet     = new Set(group.terminalNodeIds ?? [])

  // 구형 endNodeIds 호환 (미마이그레이션 데이터)
  for (const id of (group.endNodeIds ?? (group.endNodeId ? [group.endNodeId] : []))) {
    terminalSet.add(id)
  }

  const result = new Set()
  const fq = [...startIds]

  while (fq.length > 0) {
    const id = fq.shift()
    if (result.has(id)) continue
    result.add(id)
    // terminalNodeIds: 포함하되 자식 탐색 중단
    if (terminalSet.has(id)) continue
    const exp = expMap[id]
    if (!exp) continue
    for (const nid of exp.connections?.followingExperiments ?? []) {
      if (result.has(nid)) continue
      // blockedEdges: 해당 간선 건너뜀
      if (blockedSet.has(`${id}→${nid}`)) continue
      fq.push(nid)
    }
  }

  return result
}

/**
 * 그룹의 끝점 노드 ID Set 반환.
 * blockedEdges의 from 측 노드 + terminalNodeIds 합산.
 * @returns {Set<string>}
 */
export function getGroupEndpointNodeIds(group) {
  const endpoints = new Set()
  for (const edge of group.blockedEdges ?? []) endpoints.add(edge.from)
  for (const id   of group.terminalNodeIds ?? []) endpoints.add(id)
  // 구형 endNodeIds 호환
  for (const id   of group.endNodeIds ?? []) endpoints.add(id)
  return endpoints
}

/**
 * 해당 노드가 그룹의 끝점인지 여부.
 */
export function isGroupEndpoint(group, nodeId) {
  if ((group.blockedEdges    ?? []).some((e) => e.from === nodeId)) return true
  if ((group.terminalNodeIds ?? []).includes(nodeId))               return true
  if ((group.endNodeIds      ?? []).includes(nodeId))               return true  // 구형 호환
  return false
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

// ── ID 생성 ────────────────────────────────────────────────────
export function generateGroupId(groups) {
  const nums = groups
    .map((g) => { const m = g.id?.match(/^group_(\d+)$/); return m ? parseInt(m[1], 10) : 0 })
    .filter(Boolean)
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
  return `group_${String(next).padStart(3, '0')}`
}
