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
 *   endNodeId    → endNodeIds:   string[]
 */
export function migrateGroup(group) {
  const g = { ...group }
  if (!('startNodeIds' in g)) {
    g.startNodeIds = g.startNodeId ? [g.startNodeId] : []
  }
  if (!('endNodeIds' in g)) {
    g.endNodeIds = g.endNodeId ? [g.endNodeId] : []
  }
  return g
}

export function migrateGroups(groups) {
  return groups.map(migrateGroup)
}

// ── 유틸 함수 ──────────────────────────────────────────────────

/**
 * 각 startNodeIds에서 followingExperiments를 따라 BFS 탐색.
 *
 * endNodeIds: 해당 노드는 result에 추가하되 자식 탐색 중단 (닫힘).
 *             빈 배열이면 열린 그룹 (모든 하위 탐색).
 *
 * @returns {Set<string>}
 */
export function resolveGroupNodeIds(group, experiments) {
  const expMap   = Object.fromEntries(experiments.map((e) => [e.id, e]))
  const endSet   = new Set(group.endNodeIds ?? (group.endNodeId ? [group.endNodeId] : []))
  // 구 스키마(startNodeId) 호환
  const startIds = group.startNodeIds ?? (group.startNodeId ? [group.startNodeId] : [])

  const result = new Set()
  const fq = [...startIds]

  while (fq.length > 0) {
    const id = fq.shift()
    if (result.has(id)) continue
    result.add(id)
    // endNodeIds 도달: result에 추가(확인) 후 자식 탐색 중단
    if (endSet.size > 0 && endSet.has(id)) continue
    const exp = expMap[id]
    if (!exp) continue
    for (const nid of exp.connections?.followingExperiments ?? []) {
      if (!result.has(nid)) fq.push(nid)
    }
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

// ── ID 생성 ────────────────────────────────────────────────────
export function generateGroupId(groups) {
  const nums = groups
    .map((g) => { const m = g.id?.match(/^group_(\d+)$/); return m ? parseInt(m[1], 10) : 0 })
    .filter(Boolean)
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
  return `group_${String(next).padStart(3, '0')}`
}
