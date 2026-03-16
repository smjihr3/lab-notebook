import dagre from 'dagre'

export const NODE_WIDTH  = 180
export const NODE_HEIGHT = 64

const NODESEP = 60
export const RANKSEP = 100
export const GRID_SNAP_X = NODE_WIDTH  + RANKSEP  // 280: 열 간격 단위
export const GRID_SNAP_Y = NODE_HEIGHT + NODESEP  // 124: 행 간격 단위

// ── 엣지 맵 헬퍼 ──────────────────────────────────────────────────
function buildEdgeMaps(nodes, edges) {
  const outgoing = new Map(nodes.map((n) => [n.id, []]))
  const incoming  = new Map(nodes.map((n) => [n.id, []]))
  for (const e of edges) {
    if (outgoing.has(e.source) && incoming.has(e.target)) {
      outgoing.get(e.source).push(e.target)
      incoming.get(e.target).push(e.source)
    }
  }
  return { outgoing, incoming }
}

// ── 서브트리 BFS ────────────────────────────────────────────────────
function getSubtreeNodes(rootId, outgoing) {
  const visited = new Set()
  const queue   = [rootId]
  while (queue.length > 0) {
    const id = queue.shift()
    if (visited.has(id)) continue
    visited.add(id)
    for (const nid of outgoing.get(id) ?? []) {
      if (!visited.has(nid)) queue.push(nid)
    }
  }
  return visited
}

// ── 메인 레이아웃 함수 ─────────────────────────────────────────────
export function applyDagreLayout(nodes, edges, groupNodeSets = []) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir:   'LR',
    nodesep:   NODESEP,
    ranksep:   RANKSEP,
    ranker:    'network-simplex',
    acyclicer: 'greedy',
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

  // 1. 기본 열 간격 확보
  spreadLRColumns(layouted)

  // 2. 그룹 노드 열 압축 + 비그룹 끼어들기 제거
  if (groupNodeSets.length > 0) {
    compactGroupColumns(layouted, edges, groupNodeSets)
  }

  // 3. 그룹 bounding box와 겹치는 비그룹 노드 분리
  if (groupNodeSets.length > 0) {
    separateNonGroupNodes(layouted, groupNodeSets, edges)
  }

  // 4. 분기 서브트리 간격 확보 → protectedGaps 반환
  const protectedGaps = reserveSubtreeSpace(layouted, edges)

  // 5. 분기점 선행 노드를 최상단 후속과 평행 배치
  alignParentToFirstChild(layouted, edges)

  // 6. 일대일 쌍 y 정렬 → alignedPairs 반환 (이후 y 고정)
  const alignedPairs = alignOneToOnePairs(layouted, edges)

  // 7. 겹침 최종 해소 (최대 10회)
  resolveOverlaps(layouted, alignedPairs)

  // 8. 빈 열/행 제거 (보호 간격 유지)
  compactLayout(layouted, protectedGaps, alignedPairs)

  // 9. 최종 간격 확보 (alignedPairs y 고정)
  spreadLRColumnsWithFixed(layouted, alignedPairs)

  // 10. 그리드 스냅
  for (const node of layouted) {
    node.position = {
      x: Math.round(node.position.x / GRID_SNAP_X) * GRID_SNAP_X,
      y: Math.round(node.position.y / GRID_SNAP_Y) * GRID_SNAP_Y,
    }
  }

  // 11. 스냅 후 일대일 쌍 y 재보정
  realignPairsAfterSnap(layouted, edges, alignedPairs)

  return layouted
}

// ── LR 겹침 방지 ───────────────────────────────────────────────────
function spreadLRColumns(layouted) {
  const colMap = new Map()
  for (const node of layouted) {
    const rx = Math.round(node.position.x)
    if (!colMap.has(rx)) colMap.set(rx, [])
    colMap.get(rx).push(node)
  }
  const minGap = NODE_HEIGHT + NODESEP
  for (const col of colMap.values()) {
    if (col.length <= 1) continue
    col.sort((a, b) => a.position.y - b.position.y)
    for (let i = 1; i < col.length; i++) {
      const minY = col[i - 1].position.y + minGap
      if (col[i].position.y < minY) {
        col[i].position = { ...col[i].position, y: minY }
      }
    }
  }
}

// ── 고정 노드 제외 LR 겹침 방지 ───────────────────────────────────
// fixedIds: y를 변경하지 않을 노드 ID 집합
function spreadLRColumnsWithFixed(layouted, fixedIds = new Set()) {
  const colMap = new Map()
  for (const node of layouted) {
    const rx = Math.round(node.position.x)
    if (!colMap.has(rx)) colMap.set(rx, [])
    colMap.get(rx).push(node)
  }
  const minGap = NODE_HEIGHT + NODESEP
  for (const col of colMap.values()) {
    if (col.length <= 1) continue
    col.sort((a, b) => a.position.y - b.position.y)
    // 순방향: 비고정 노드를 아래로 밀기
    for (let i = 1; i < col.length; i++) {
      const minY = col[i - 1].position.y + minGap
      if (col[i].position.y < minY && !fixedIds.has(col[i].id)) {
        col[i].position = { ...col[i].position, y: minY }
      }
    }
    // 역방향: 비고정 노드를 위로 밀기 (고정 노드 아래에 공간이 있으면)
    for (let i = col.length - 2; i >= 0; i--) {
      const maxY = col[i + 1].position.y - minGap
      if (col[i].position.y > maxY && !fixedIds.has(col[i].id)) {
        col[i].position = { ...col[i].position, y: maxY }
      }
    }
  }
}

// ── 1. 일대일 선행/후행 같은 행 정렬 ──────────────────────────────
function alignOneToOnePairs(layouted, edges) {
  const { outgoing, incoming } = buildEdgeMaps(layouted, edges)
  const nodeMap     = new Map(layouted.map((n) => [n.id, n]))
  const alignedPairs = new Set()

  // x 오름차순으로 열 순회 → 좌→우 전파
  const cols = [...new Set(layouted.map((n) => Math.round(n.position.x)))].sort((a, b) => a - b)

  for (const col of cols) {
    for (const node of layouted.filter((n) => Math.round(n.position.x) === col)) {
      const outs = outgoing.get(node.id) ?? []
      if (outs.length !== 1) continue
      const targetId = outs[0]
      if ((incoming.get(targetId) ?? []).length !== 1) continue
      const target = nodeMap.get(targetId)
      if (!target) continue
      target.position = { ...target.position, y: node.position.y }
      alignedPairs.add(targetId)
    }
  }

  // 정렬 후 겹침 해소 (alignedPairs y 고정)
  spreadLRColumnsWithFixed(layouted, alignedPairs)
  return alignedPairs
}

// ── 2. 분기점 선행 노드를 최상단 후속과 평행 배치 ──────────────────
function alignParentToFirstChild(layouted, edges) {
  const { outgoing } = buildEdgeMaps(layouted, edges)
  const nodeMap  = new Map(layouted.map((n) => [n.id, n]))
  const fixedIds = new Set()

  const cols = [...new Set(layouted.map((n) => Math.round(n.position.x)))].sort((a, b) => a - b)

  for (const col of cols) {
    for (const node of layouted.filter((n) => Math.round(n.position.x) === col)) {
      const outs = outgoing.get(node.id) ?? []
      if (outs.length < 2) continue
      const childYs = outs.map((id) => nodeMap.get(id)?.position.y).filter((y) => y != null)
      if (childYs.length === 0) continue
      node.position = { ...node.position, y: Math.min(...childYs) }
      fixedIds.add(node.id)
    }
  }

  if (fixedIds.size > 0) spreadLRColumnsWithFixed(layouted, fixedIds)
}

// ── 3. 분기 서브트리 간격 확보 ─────────────────────────────────────
function reserveSubtreeSpace(layouted, edges) {
  const { outgoing } = buildEdgeMaps(layouted, edges)
  const nodeMap      = new Map(layouted.map((n) => [n.id, n]))
  const protectedGaps = new Set()

  function subtreeHeight(rootId) {
    const ids   = getSubtreeNodes(rootId, outgoing)
    const nodes = [...ids].map((id) => nodeMap.get(id)).filter(Boolean)
    if (nodes.length === 0) return NODE_HEIGHT + NODESEP
    const ys = nodes.map((n) => n.position.y)
    return Math.max(...ys) - Math.min(...ys) + NODE_HEIGHT + NODESEP
  }

  // 공유 노드 검출: 여러 서브트리에 속하면 이동 대상에서 제외
  function exclusiveSubtree(rootId, siblingSubtrees) {
    const own    = getSubtreeNodes(rootId, outgoing)
    const shared = new Set()
    for (const other of siblingSubtrees) {
      for (const id of other) {
        if (own.has(id) && id !== rootId) shared.add(id)
      }
    }
    return { own, shared }
  }

  // x 내림차순 (하위 분기 먼저 처리)
  const branchNodes = layouted
    .filter((n) => (outgoing.get(n.id) ?? []).length >= 2)
    .sort((a, b) => b.position.x - a.position.x)

  for (const branch of branchNodes) {
    const children = (outgoing.get(branch.id) ?? [])
      .map((id) => nodeMap.get(id)).filter(Boolean)
      .sort((a, b) => a.position.y - b.position.y)
    if (children.length < 2) continue

    const siblingSubtrees = children.map((c) => getSubtreeNodes(c.id, outgoing))

    let currentY = branch.position.y
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      const { own, shared } = exclusiveSubtree(child.id, siblingSubtrees.filter((_, j) => j !== i))
      const h = subtreeHeight(child.id)

      // 현재 서브트리의 최소 y → offset 계산
      const subtreeYs = [...own].map((id) => nodeMap.get(id)?.position.y ?? Infinity)
      const minSubtreeY = Math.min(...subtreeYs)
      const offset = currentY - minSubtreeY

      if (offset !== 0) {
        for (const nodeId of own) {
          if (shared.has(nodeId)) continue
          const n = nodeMap.get(nodeId)
          if (n) n.position = { ...n.position, y: n.position.y + offset }
        }
      }

      // 인접 서브트리 루트 사이 보호 간격 등록
      if (i < children.length - 1) {
        protectedGaps.add(`${children[i].id}-${children[i + 1].id}`)
      }

      currentY += h
    }
  }

  return protectedGaps
}

// ── 4. 겹침 최종 해소 ─────────────────────────────────────────────
function resolveOverlaps(layouted, fixedIds = new Set()) {
  const minGapX = NODE_WIDTH  + 8
  const minGapY = NODE_HEIGHT + 8

  for (let iter = 0; iter < 10; iter++) {
    let anyOverlap = false
    for (let i = 0; i < layouted.length; i++) {
      for (let j = i + 1; j < layouted.length; j++) {
        const a  = layouted[i], b = layouted[j]
        const dx = Math.abs(a.position.x - b.position.x)
        const dy = Math.abs(a.position.y - b.position.y)
        if (dx >= minGapX || dy >= minGapY) continue

        anyOverlap = true
        if (dx <= dy) {
          // 같은 열 → y 방향 해소
          const needed = Math.ceil((minGapY - dy) / GRID_SNAP_Y) * GRID_SNAP_Y
          if (b.position.y >= a.position.y) {
            if (!fixedIds.has(b.id)) b.position = { ...b.position, y: b.position.y + needed }
            else if (!fixedIds.has(a.id)) a.position = { ...a.position, y: a.position.y - needed }
          } else {
            if (!fixedIds.has(a.id)) a.position = { ...a.position, y: a.position.y + needed }
            else if (!fixedIds.has(b.id)) b.position = { ...b.position, y: b.position.y - needed }
          }
        } else {
          // 다른 열 → x 방향 해소
          const needed = Math.ceil((minGapX - dx) / GRID_SNAP_X) * GRID_SNAP_X
          if (b.position.x >= a.position.x) {
            b.position = { ...b.position, x: b.position.x + needed }
          } else {
            a.position = { ...a.position, x: a.position.x + needed }
          }
        }
      }
    }
    if (!anyOverlap) break
  }
}

// ── 5. 빈 열/행 제거 (보호 간격 유지) ─────────────────────────────
function compactLayout(layouted, protectedGaps, fixedIds = new Set()) {
  // x 압축: 연속된 열 사이 빈 열 제거
  {
    const xVals = [...new Set(layouted.map((n) => Math.round(n.position.x)))].sort((a, b) => a - b)
    for (let i = 1; i < xVals.length; i++) {
      const gap = xVals[i] - xVals[i - 1]
      if (gap <= GRID_SNAP_X * 1.1) continue
      const shift = gap - GRID_SNAP_X
      for (const n of layouted) {
        if (Math.round(n.position.x) >= xVals[i]) {
          n.position = { ...n.position, x: n.position.x - shift }
        }
      }
      for (let k = i; k < xVals.length; k++) xVals[k] -= shift
    }
  }

  // y 압축: 연속된 행 사이 빈 행 제거 (보호 간격 / 고정 노드 포함 구간 유지)
  {
    const yVals = [...new Set(layouted.map((n) => Math.round(n.position.y)))].sort((a, b) => a - b)
    for (let i = 1; i < yVals.length; i++) {
      const gap = yVals[i] - yVals[i - 1]
      if (gap <= GRID_SNAP_Y * 1.1) continue

      // 보호 간격 확인
      const nodesAtPrev = layouted.filter((n) => Math.round(n.position.y) === yVals[i - 1])
      const nodesAtCurr = layouted.filter((n) => Math.round(n.position.y) === yVals[i])
      let isProtected = false
      outer: for (const a of nodesAtPrev) {
        for (const b of nodesAtCurr) {
          if (protectedGaps.has(`${a.id}-${b.id}`)) { isProtected = true; break outer }
        }
      }
      if (isProtected) continue

      // 이동 대상 구간에 고정 노드가 있으면 건너뜀
      const hasFixed = nodesAtCurr.some((n) => fixedIds.has(n.id)) ||
        layouted.some((n) => Math.round(n.position.y) > yVals[i] && fixedIds.has(n.id))
      if (hasFixed) continue

      const shift = gap - GRID_SNAP_Y
      for (const n of layouted) {
        if (Math.round(n.position.y) >= yVals[i]) {
          n.position = { ...n.position, y: n.position.y - shift }
        }
      }
      for (let k = i; k < yVals.length; k++) yVals[k] -= shift
    }
  }
}

// ── 6. 그룹 열 압축 ────────────────────────────────────────────────
function compactGroupColumns(layouted, edges, groupNodeSets) {
  const nodeMap   = new Map(layouted.map((n) => [n.id, n]))
  const maxPredX  = new Map(layouted.map((n) => [n.id, -Infinity]))
  const minSuccX  = new Map(layouted.map((n) => [n.id, Infinity]))

  for (const e of edges) {
    const src = nodeMap.get(e.source)
    const tgt = nodeMap.get(e.target)
    if (!src || !tgt) continue
    if (src.position.x > (maxPredX.get(e.target) ?? -Infinity)) maxPredX.set(e.target, src.position.x)
    if (tgt.position.x < (minSuccX.get(e.source) ?? Infinity))  minSuccX.set(e.source, tgt.position.x)
  }

  for (const groupIds of groupNodeSets) {
    const groupNodes = layouted.filter((n) => groupIds.has(n.id))
    if (groupNodes.length < 2) continue

    // 그룹 노드 열 목록 (x 오름차순)
    const groupXsSorted = [...new Set(groupNodes.map((n) => Math.round(n.position.x)))].sort((a, b) => a - b)

    // 열 간격 추정 (전체 레이아웃 기준)
    const allX    = [...new Set(layouted.map((n) => Math.round(n.position.x)))].sort((a, b) => a - b)
    const colStep = allX.length > 1 ? allX[1] - allX[0] : GRID_SNAP_X

    // 그룹 열이 비연속이면 연속 열로 압축 (dagre 좌→우 순서 유지)
    let needsCompact = groupXsSorted.some((x, i) => i > 0 && x - groupXsSorted[i - 1] > colStep + 1)
    if (needsCompact) {
      const colRemap = new Map(groupXsSorted.map((x, i) => [x, groupXsSorted[0] + i * colStep]))
      for (const n of groupNodes) {
        const rx = Math.round(n.position.x)
        if (colRemap.has(rx)) n.position = { ...n.position, x: colRemap.get(rx) }
      }
    }

    const groupXSet  = new Set(groupNodes.map((n) => Math.round(n.position.x)))
    const minGroupX  = Math.min(...groupXSet)
    const maxGroupX  = Math.max(...groupXSet)
    if (minGroupX === maxGroupX) continue

    // 그룹 범위 안의 순수 비그룹 열 이동
    const currentAllX  = [...new Set(layouted.map((n) => Math.round(n.position.x)))].sort((a, b) => a - b)
    const currentColStep = currentAllX.length > 1 ? currentAllX[1] - currentAllX[0] : GRID_SNAP_X

    const interloperXs = currentAllX.filter((x) => {
      if (x <= minGroupX || x >= maxGroupX) return false
      if (groupXSet.has(x)) return false
      return layouted.filter((n) => Math.round(n.position.x) === x).every((n) => !groupIds.has(n.id))
    })

    for (const col of interloperXs) {
      const nodesAtCol = layouted.filter((n) => Math.round(n.position.x) === col)
      const canLeft    = nodesAtCol.every((n) => (maxPredX.get(n.id) ?? -Infinity) < minGroupX)
      if (canLeft) {
        const newX = minGroupX - currentColStep
        nodesAtCol.forEach((n) => { n.position = { ...n.position, x: newX } })
        continue
      }
      const canRight = nodesAtCol.every((n) => (minSuccX.get(n.id) ?? Infinity) > maxGroupX)
      if (canRight) {
        const newX = maxGroupX + currentColStep
        nodesAtCol.forEach((n) => { n.position = { ...n.position, x: newX } })
      }
    }
  }

  spreadLRColumns(layouted)
}

// ── 7. 그룹 bounding box 겹침 비그룹 노드 분리 ────────────────────
function separateNonGroupNodes(layouted, groupNodeSets, edges) {
  const nodeMap              = new Map(layouted.map((n) => [n.id, n]))
  const { outgoing, incoming } = buildEdgeMaps(layouted, edges)
  const PADDING_X = GRID_SNAP_X / 2
  const PADDING_Y = GRID_SNAP_Y / 2

  for (const groupIds of groupNodeSets) {
    const groupNodes = layouted.filter((n) => groupIds.has(n.id))
    if (groupNodes.length === 0) continue

    const bbMinX = Math.min(...groupNodes.map((n) => n.position.x))             - PADDING_X
    const bbMinY = Math.min(...groupNodes.map((n) => n.position.y))             - PADDING_Y
    const bbMaxX = Math.max(...groupNodes.map((n) => n.position.x + NODE_WIDTH))  + PADDING_X
    const bbMaxY = Math.max(...groupNodes.map((n) => n.position.y + NODE_HEIGHT)) + PADDING_Y

    for (const node of layouted) {
      if (groupIds.has(node.id)) continue
      const { x, y } = node.position
      if (x >= bbMaxX || x + NODE_WIDTH <= bbMinX || y >= bbMaxY || y + NODE_HEIGHT <= bbMinY) continue

      const preceding    = incoming.get(node.id) ?? []
      const following    = outgoing.get(node.id) ?? []
      const parentInGroup = preceding.find((id) => groupIds.has(id)) ?? null
      const childInGroup  = following.find((id) => groupIds.has(id)) ?? null

      let isBranch = false
      let siblingsInGroup = []
      if (parentInGroup) {
        const allParentFollowers = outgoing.get(parentInGroup) ?? []
        siblingsInGroup = allParentFollowers.filter((id) => groupIds.has(id))
        isBranch = allParentFollowers.length >= 2
      }

      if (parentInGroup && !isBranch) {
        const parentNode = nodeMap.get(parentInGroup)
        node.position = {
          x: Math.ceil(bbMaxX / GRID_SNAP_X) * GRID_SNAP_X,
          y: parentNode ? parentNode.position.y : y,
        }
      } else if (parentInGroup && isBranch) {
        const siblingNodes = siblingsInGroup.map((id) => nodeMap.get(id)).filter(Boolean)
        const avgX = siblingNodes.length > 0
          ? siblingNodes.reduce((s, n) => s + n.position.x, 0) / siblingNodes.length
          : bbMaxX + GRID_SNAP_X
        node.position = {
          x: Math.round(avgX / GRID_SNAP_X) * GRID_SNAP_X,
          y: Math.ceil(bbMaxY / GRID_SNAP_Y) * GRID_SNAP_Y,
        }
      } else if (childInGroup && !parentInGroup) {
        const childNode = nodeMap.get(childInGroup)
        node.position = {
          x: Math.floor(bbMinX / GRID_SNAP_X) * GRID_SNAP_X - GRID_SNAP_X,
          y: childNode ? childNode.position.y : y,
        }
      } else {
        const overlapX = Math.min(x + NODE_WIDTH, bbMaxX)  - Math.max(x, bbMinX)
        const overlapY = Math.min(y + NODE_HEIGHT, bbMaxY) - Math.max(y, bbMinY)
        if (overlapX < overlapY) {
          const goRight = (x + NODE_WIDTH / 2) >= (bbMinX + bbMaxX) / 2
          node.position = {
            ...node.position,
            x: goRight
              ? Math.ceil(bbMaxX  / GRID_SNAP_X) * GRID_SNAP_X
              : Math.floor(bbMinX / GRID_SNAP_X) * GRID_SNAP_X - GRID_SNAP_X,
          }
        } else {
          const goDown = (y + NODE_HEIGHT / 2) >= (bbMinY + bbMaxY) / 2
          node.position = {
            ...node.position,
            y: goDown
              ? Math.ceil(bbMaxY  / GRID_SNAP_Y) * GRID_SNAP_Y
              : Math.floor(bbMinY / GRID_SNAP_Y) * GRID_SNAP_Y - GRID_SNAP_Y,
          }
        }
      }
    }
  }

  spreadLRColumns(layouted)
}

// ── 8. 스냅 후 일대일 쌍 y 재보정 ────────────────────────────────
function realignPairsAfterSnap(layouted, edges, alignedPairs) {
  if (alignedPairs.size === 0) return
  const { incoming } = buildEdgeMaps(layouted, edges)
  const nodeMap      = new Map(layouted.map((n) => [n.id, n]))
  for (const targetId of alignedPairs) {
    const target = nodeMap.get(targetId)
    if (!target) continue
    const ins = incoming.get(targetId) ?? []
    if (ins.length !== 1) continue
    const source = nodeMap.get(ins[0])
    if (!source || target.position.y === source.position.y) continue
    target.position = { ...target.position, y: source.position.y }
  }
}
