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
 * 해당 노드가 그룹에 차단/말단 설정을 가지고 있는지 여부.
 * (컨텍스트 메뉴 표시 여부 판단 등 등록 여부만 확인할 때 사용)
 */
export function isGroupEndpoint(group, nodeId) {
  if ((group.blockedEdges    ?? []).some((e) => e.from === nodeId)) return true
  if ((group.terminalNodeIds ?? []).includes(nodeId))               return true
  if ((group.endNodeIds      ?? []).includes(nodeId))               return true  // 구형 호환
  return false
}

/**
 * 해당 노드가 그룹 내에서 실질적인 끝점(마지막 포함 노드)인지 판단.
 *
 * 두 조건을 모두 만족해야 끝점:
 *   1. 그룹 내 활성 자식(groupNodeIds에 포함된 followingExperiments)이 하나도 없을 것
 *      (= 모든 자식 방향이 차단됐거나 자식이 없는 노드)
 *   2. terminalNodeIds에 포함되거나 blockedEdges의 from으로 등록된 경우
 *
 * @param {string}     nodeId
 * @param {object}     group
 * @param {Set<string>} groupNodeIds  resolveGroupNodeIds 결과
 * @param {object[]}   experiments   followingExperiments가 포함된 실험 배열
 */
export function isEndNode(nodeId, group, groupNodeIds, experiments) {
  // 조건 2: 차단/말단 등록 여부
  if (!isGroupEndpoint(group, nodeId)) return false
  // 조건 1: 그룹 내 활성 자식이 없을 것
  const exp = experiments.find((e) => e.id === nodeId)
  const activeChildren = (exp?.connections?.followingExperiments ?? [])
    .filter((id) => groupNodeIds.has(id))
  return activeChildren.length === 0
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

/**
 * 포함 노드들의 union of padded bounding boxes를 직각 다각형으로 반환.
 * 격자 기반 경계 추적으로 90도 꼭짓점만 가지는 외곽 polygon 계산.
 * @returns {{ points: Array<{x,y}>, bounds: {x,y,width,height} } | null}
 */
export function getGroupPolygon(nodeIds, rfNodes, padding = 32) {
  const relevant = rfNodes.filter(
    (n) => nodeIds.has(n.id) && !n.id.startsWith('group-bg-')
  )
  if (relevant.length === 0) return null

  // 각 노드의 padding 포함 bounding rect
  const rects = relevant.map((n) => {
    const w = n.width  ?? NODE_WIDTH
    const h = n.height ?? NODE_HEIGHT
    return {
      x0: n.position.x - padding,
      y0: n.position.y - padding,
      x1: n.position.x + w + padding,
      y1: n.position.y + h + padding,
    }
  })

  // 좌표 압축
  const xs = [...new Set(rects.flatMap((r) => [r.x0, r.x1]))].sort((a, b) => a - b)
  const ys = [...new Set(rects.flatMap((r) => [r.y0, r.y1]))].sort((a, b) => a - b)
  const nx = xs.length - 1
  const ny = ys.length - 1

  // 격자 셀 점유 여부
  const grid = Array.from({ length: ny }, (_, iy) =>
    Array.from({ length: nx }, (_, ix) => {
      const cx = (xs[ix] + xs[ix + 1]) / 2
      const cy = (ys[iy] + ys[iy + 1]) / 2
      return rects.some((r) => cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1)
    })
  )

  function cell(ix, iy) {
    return ix >= 0 && ix < nx && iy >= 0 && iy < ny && grid[iy][ix]
  }

  // 방향성 경계 간선 수집 (내부가 진행 방향의 왼쪽 = CCW 외곽)
  const edgeMap = new Map()

  function addEdge(x0, y0, x1, y1) {
    const k = `${x0},${y0}`
    const arr = edgeMap.get(k) ?? []
    arr.push({ x: x1, y: y1 })
    edgeMap.set(k, arr)
  }

  for (let iy = 0; iy <= ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const above = cell(ix, iy - 1)
      const below = cell(ix, iy)
      if (!above &&  below) addEdge(xs[ix],     ys[iy], xs[ix + 1], ys[iy])  // →
      if ( above && !below) addEdge(xs[ix + 1], ys[iy], xs[ix],     ys[iy])  // ←
    }
  }

  for (let ix = 0; ix <= nx; ix++) {
    for (let iy = 0; iy < ny; iy++) {
      const left  = cell(ix - 1, iy)
      const right = cell(ix,     iy)
      if (!left  &&  right) addEdge(xs[ix], ys[iy + 1], xs[ix], ys[iy])      // ↑
      if ( left  && !right) addEdge(xs[ix], ys[iy],     xs[ix], ys[iy + 1])  // ↓
    }
  }

  // 다각형 추적 (남은 간선이 없을 때까지 반복 → 단일/복수 루프 모두 처리)
  const polygons = []
  const remaining = new Map()
  for (const [k, v] of edgeMap) remaining.set(k, [...v])

  for (let guard = 0; guard < 10000 && remaining.size > 0; guard++) {
    // 시작점 탐색
    let startKey = null
    for (const [k, arr] of remaining) {
      if (arr.length > 0) { startKey = k; break }
    }
    if (!startKey) break

    const poly = []
    let cur = startKey

    for (let g2 = 0; g2 < 10000; g2++) {
      const arr = remaining.get(cur)
      if (!arr || arr.length === 0) break

      const [cx, cy] = cur.split(',').map(Number)
      poly.push({ x: cx, y: cy })

      let next
      if (arr.length === 1) {
        next = arr.shift()
        if (arr.length === 0) remaining.delete(cur)
      } else {
        // 여러 선택지: 가장 CW 방향(외곽 추적)
        const prevPt = poly.length >= 2 ? poly[poly.length - 2] : { x: cx - 1, y: cy }
        const dx = cx - prevPt.x
        const dy = cy - prevPt.y
        next = arr.reduce((best, c) => {
          const cross1 = (c.x    - cx) * dy - (c.y    - cy) * dx
          const cross2 = (best.x - cx) * dy - (best.y - cy) * dx
          return cross1 < cross2 ? c : best
        })
        const idx = arr.findIndex((p) => p.x === next.x && p.y === next.y)
        arr.splice(idx, 1)
        if (arr.length === 0) remaining.delete(cur)
      }

      const nextKey = `${next.x},${next.y}`
      if (nextKey === startKey) break
      cur = nextKey
    }

    if (poly.length >= 4) polygons.push(poly)
  }

  if (polygons.length === 0) return null

  // 면적 계산 (shoelace formula)
  function polyArea(pts) {
    return Math.abs(pts.reduce((s, { x, y }, i, a) => {
      const n = a[(i + 1) % a.length]
      return s + x * n.y - n.x * y
    }, 0)) / 2
  }

  // 모든 다각형 반환 (외곽 + hole 포함), 면적 내림차순
  polygons.sort((a, b) => polyArea(b) - polyArea(a))

  const allPts = polygons.flat()
  const allX   = allPts.map((p) => p.x)
  const allY   = allPts.map((p) => p.y)

  return {
    polygons,
    bounds: {
      x:      Math.min(...allX),
      y:      Math.min(...allY),
      width:  Math.max(...allX) - Math.min(...allX),
      height: Math.max(...allY) - Math.min(...allY),
    },
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
