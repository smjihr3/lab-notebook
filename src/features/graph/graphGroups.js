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
 * 구 스키마(endNodeId: string|null) → 신 스키마(endNodeIds: string[])
 * 이미 마이그레이션된 그룹은 그대로 반환.
 */
export function migrateGroup(group) {
  if ('endNodeIds' in group) return group
  return {
    ...group,
    endNodeIds: group.endNodeId ? [group.endNodeId] : [],
  }
}

export function migrateGroups(groups) {
  return groups.map(migrateGroup)
}

// ── 유틸 함수 ──────────────────────────────────────────────────

/**
 * startNodeId에서 followingExperiments를 따라 BFS 탐색.
 * endNodeIds가 빈 배열이면 모든 하위 노드 포함 (열린 그룹).
 * endNodeIds에 값이 있으면:
 *   - endNodeIds에 속한 노드는 Set에 추가하되 자식 탐색 중단 (닫힘)
 *   - endNodeIds에 없는 분기는 계속 탐색 (열린 채로 유지)
 * @returns {Set<string>}
 */
export function resolveGroupNodeIds(group, experiments) {
  const expMap = Object.fromEntries(experiments.map((e) => [e.id, e]))
  // 구 스키마(endNodeId) 호환 처리
  const endSet = new Set(group.endNodeIds ?? (group.endNodeId ? [group.endNodeId] : []))

  const result = new Set()
  const fq = [group.startNodeId]
  while (fq.length > 0) {
    const id = fq.shift()
    if (result.has(id)) continue
    result.add(id)
    // endNodeIds에 속한 노드: 포함하되 자식 탐색 중단
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
