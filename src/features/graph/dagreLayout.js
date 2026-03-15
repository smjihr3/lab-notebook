import dagre from 'dagre'

export const NODE_WIDTH  = 180
export const NODE_HEIGHT = 64

const NODESEP = 80

export function applyDagreLayout(nodes, edges, direction = 'TB', groupNodeSets = []) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: direction,
    nodesep: NODESEP,
    ranksep: 80,
    align: 'UL',
    ranker: 'tight-tree',
  })

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target)
    }
  }

  dagre.layout(g)

  const layouted = nodes.map((node) => {
    const { x, y } = g.node(node.id)
    return {
      ...node,
      position: {
        x: x - NODE_WIDTH  / 2,
        y: y - NODE_HEIGHT / 2,
      },
    }
  })

  // LR 모드: 같은 x(rank) 그룹 내 노드를 균등 간격으로 재정렬
  if (direction === 'LR') {
    respaceLRColumns(layouted)

    // 그룹별 column 압축 후처리
    if (groupNodeSets.length > 0) {
      compactGroupColumns(layouted, edges, groupNodeSets)
    }
  }

  return layouted
}

// ── LR 균등 y 간격 재정렬 ────────────────────────────────────────
function respaceLRColumns(layouted) {
  const colMap = new Map()
  for (const node of layouted) {
    const rx = Math.round(node.position.x)
    if (!colMap.has(rx)) colMap.set(rx, [])
    colMap.get(rx).push(node)
  }
  const step = NODE_HEIGHT + NODESEP
  for (const col of colMap.values()) {
    if (col.length <= 1) continue
    col.sort((a, b) => a.position.y - b.position.y)
    col.forEach((node, i) => {
      node.position = { ...node.position, y: i * step }
    })
  }
}

// ── 그룹별 column 압축 ───────────────────────────────────────────
/**
 * 각 그룹의 포함 노드가 최대한 인접한 열에 오도록 비그룹 노드를 이동.
 * 이동 조건: 그 열의 모든 노드가 순수 비그룹 노드이고,
 * 모든 선행 노드가 그룹 최소 x 이전이거나(좌이동) 모든 후행 노드가 그룹 최대 x 이후일 것(우이동).
 */
function compactGroupColumns(layouted, edges, groupNodeSets) {
  const nodeMap = new Map(layouted.map((n) => [n.id, n]))

  // 직접 선행/후행 x 범위 계산
  const maxPredX = new Map(layouted.map((n) => [n.id, -Infinity]))
  const minSuccX = new Map(layouted.map((n) => [n.id, Infinity]))

  for (const e of edges) {
    const src = nodeMap.get(e.source)
    const tgt = nodeMap.get(e.target)
    if (!src || !tgt) continue
    if (src.position.x > (maxPredX.get(e.target) ?? -Infinity)) maxPredX.set(e.target, src.position.x)
    if (tgt.position.x < (minSuccX.get(e.source) ?? Infinity))  minSuccX.set(e.source, tgt.position.x)
  }

  const allX = [...new Set(layouted.map((n) => Math.round(n.position.x)))].sort((a, b) => a - b)
  const colStep = allX.length > 1 ? allX[1] - allX[0] : NODE_WIDTH + NODESEP

  for (const groupIds of groupNodeSets) {
    const groupNodes = layouted.filter((n) => groupIds.has(n.id))
    if (groupNodes.length < 2) continue

    const groupXSet = new Set(groupNodes.map((n) => Math.round(n.position.x)))
    const minGroupX = Math.min(...groupXSet)
    const maxGroupX = Math.max(...groupXSet)
    if (minGroupX === maxGroupX) continue

    // 그룹 범위 안의 순수 비그룹 열 탐색
    const interloperXs = allX.filter((x) => {
      if (x <= minGroupX || x >= maxGroupX) return false
      if (groupXSet.has(x)) return false
      // 이 열의 모든 노드가 비그룹인지 확인
      return layouted.filter((n) => Math.round(n.position.x) === x).every((n) => !groupIds.has(n.id))
    })

    for (const col of interloperXs) {
      const nodesAtCol = layouted.filter((n) => Math.round(n.position.x) === col)

      // 좌이동 가능 여부: 모든 선행 노드 x < minGroupX
      const canLeft = nodesAtCol.every((n) => (maxPredX.get(n.id) ?? -Infinity) < minGroupX)
      if (canLeft) {
        const newX = minGroupX - colStep
        nodesAtCol.forEach((n) => { n.position = { ...n.position, x: newX } })
        continue
      }

      // 우이동 가능 여부: 모든 후행 노드 x > maxGroupX
      const canRight = nodesAtCol.every((n) => (minSuccX.get(n.id) ?? Infinity) > maxGroupX)
      if (canRight) {
        const newX = maxGroupX + colStep
        nodesAtCol.forEach((n) => { n.position = { ...n.position, x: newX } })
      }
    }
  }

  // 열 이동 후 y 간격 재정렬
  respaceLRColumns(layouted)
}
