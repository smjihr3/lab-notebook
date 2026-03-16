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

// ── 1단계 마이그레이션: 필드 기본값 보장 ─────────────────────
/**
 * 구 스키마 → 신 스키마 변환 (실험 데이터 불필요):
 *   startNodeId  → startNodeIds
 *   openEdges, blockedEdges, terminalNodeIds 기본값
 *   endNodeIds: 구형 endNodeId 또는 blockedEdges.from + terminalNodeIds에서 유도
 */
export function migrateGroup(group) {
  const g = { ...group }

  if (!('startNodeIds' in g)) {
    g.startNodeIds = g.startNodeId ? [g.startNodeId] : []
  }
  if (!('openEdges' in g))       g.openEdges       = []
  if (!('blockedEdges' in g))    g.blockedEdges    = []
  if (!('terminalNodeIds' in g)) g.terminalNodeIds = []

  if (!('endNodeIds' in g)) {
    // 구형 단일 endNodeId 또는 blockedEdges.from + terminalNodeIds에서 유도
    if (g.endNodeId) {
      g.endNodeIds = [g.endNodeId]
    } else {
      const derived = new Set()
      for (const e of g.blockedEdges)    derived.add(e.from)
      for (const id of g.terminalNodeIds) derived.add(id)
      g.endNodeIds = [...derived]
    }
  }

  return g
}

export function migrateGroups(groups) {
  return groups.map(migrateGroup)
}

// ── 구형 endNodeIds → blockedEdges / terminalNodeIds 일괄 변환 ──
/**
 * groups 배열을 순회하며 endNodeIds 필드가 있는 그룹을
 * blockedEdges / terminalNodeIds 기반 스키마로 변환.
 * 변경 없는 그룹은 같은 객체 참조를 그대로 반환.
 *
 * @param {object[]} groups
 * @param {object[]} experiments  followingExperiments 포함된 실험 배열
 * @returns {object[]}
 */
export function migrateGroupEndNodes(groups, experiments) {
  const experimentMap = Object.fromEntries(experiments.map((e) => [e.id, e]))
  return groups.map((group) => {
    if (!group.endNodeIds || group.endNodeIds.length === 0) return group

    const newBlockedEdges    = [...(group.blockedEdges    ?? [])]
    const newTerminalNodeIds = [...(group.terminalNodeIds ?? [])]
    let changed = false

    for (const endId of group.endNodeIds) {
      const followers = experimentMap[endId]?.connections?.followingExperiments ?? []
      if (followers.length > 0) {
        for (const followerId of followers) {
          if (!newBlockedEdges.some((e) => e.from === endId && e.to === followerId)) {
            newBlockedEdges.push({ from: endId, to: followerId })
            changed = true
          }
        }
      } else {
        if (!newTerminalNodeIds.includes(endId)) {
          newTerminalNodeIds.push(endId)
          changed = true
        }
      }
    }

    if (!changed) return group
    const { endNodeIds: _removed, ...rest } = group
    return { ...rest, blockedEdges: newBlockedEdges, terminalNodeIds: newTerminalNodeIds }
  })
}

// ── 2단계 마이그레이션: 실험 데이터가 필요한 변환 ────────────
/**
 * - 구형 endNodeIds → blockedEdges + terminalNodeIds 생성 (endNodeIds 유지)
 * - startNodeIds의 선행 실험 → openEdges 생성
 * 변경 없으면 null 반환.
 */
export function migrateGroupData(group, experimentMap) {
  let changed = false
  const newOpenEdges       = [...(group.openEdges       ?? [])]
  const newBlockedEdges    = [...(group.blockedEdges    ?? [])]
  const newTerminalNodeIds = [...(group.terminalNodeIds ?? [])]

  // endNodeIds → blockedEdges / terminalNodeIds 변환
  for (const endId of group.endNodeIds ?? []) {
    const endExp    = experimentMap[endId]
    const followers = endExp?.connections?.followingExperiments ?? []
    if (followers.length > 0) {
      for (const followerId of followers) {
        if (!newBlockedEdges.some((e) => e.from === endId && e.to === followerId)) {
          newBlockedEdges.push({ from: endId, to: followerId })
          changed = true
        }
      }
    } else {
      if (!newTerminalNodeIds.includes(endId)) {
        newTerminalNodeIds.push(endId)
        changed = true
      }
    }
  }

  // startNodeIds의 선행 → openEdges 생성
  for (const startId of group.startNodeIds ?? []) {
    const startExp = experimentMap[startId]
    for (const precId of startExp?.connections?.precedingExperiments ?? []) {
      if (!newOpenEdges.some((e) => e.from === precId && e.to === startId)) {
        newOpenEdges.push({ from: precId, to: startId })
        changed = true
      }
    }
  }

  if (!changed) return null
  return { openEdges: newOpenEdges, blockedEdges: newBlockedEdges, terminalNodeIds: newTerminalNodeIds }
}

// ── resolveGroupNodeIds ───────────────────────────────────────
/**
 * BFS로 그룹 포함 노드 ID Set 반환.
 *   시작: startNodeIds
 *   차단: blockedEdges
 *   중단: terminalNodeIds (포함하되 자식 탐색 중단)
 *   openEdges는 UI 메타데이터 — BFS에 영향 없음
 *
 * @param {object}   group
 * @param {object[]} experiments  followingExperiments 포함된 실험 배열
 * @returns {Set<string>}
 */
export function resolveGroupNodeIds(group, experiments) {
  const expMap   = Object.fromEntries(experiments.map((e) => [e.id, e]))
  const startIds = group.startNodeIds ?? (group.startNodeId ? [group.startNodeId] : [])

  const blockedSet  = new Set((group.blockedEdges    ?? []).map((e) => `${e.from}→${e.to}`))
  const terminalSet = new Set(group.terminalNodeIds  ?? [])

  const result = new Set()
  const fq = [...startIds]

  while (fq.length > 0) {
    const id = fq.shift()
    if (result.has(id)) continue
    result.add(id)

    if (terminalSet.has(id)) continue

    const exp = expMap[id]
    if (!exp) continue

    for (const nid of exp.connections?.followingExperiments ?? []) {
      if (result.has(nid)) continue
      if (blockedSet.has(`${id}→${nid}`)) continue
      fq.push(nid)
    }
  }

  return result
}

// ── 끝점 유틸 ─────────────────────────────────────────────────

/**
 * 노드가 그룹의 endNodeIds에 포함되는지 여부 (UI용).
 */
export function isGroupEndpoint(group, nodeId) {
  return (group.endNodeIds ?? []).includes(nodeId)
}

/**
 * 그룹의 끝점 노드 ID Set 반환 (endNodeIds 기반).
 */
export function getGroupEndpointNodeIds(group) {
  return new Set(group.endNodeIds ?? [])
}

/**
 * 노드가 그룹 내의 실질적인 끝점인지:
 *   endNodeIds에 포함되고 groupNodeIds에도 있는 노드.
 */
export function isEndNode(nodeId, group, groupNodeIds) {
  return (group.endNodeIds ?? []).includes(nodeId) && groupNodeIds.has(nodeId)
}

// ── 바운딩 박스 ──────────────────────────────────────────────
/**
 * nodeIds에 해당하는 ReactFlow 노드들의 바운딩 박스 (padding 포함).
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
