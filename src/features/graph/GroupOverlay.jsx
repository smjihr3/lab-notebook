import { useStore } from 'reactflow'
import { NODE_WIDTH, NODE_HEIGHT } from './dagreLayout'

// ── 메인 컴포넌트 ─────────────────────────────────────────────────
export default function GroupOverlay({ groups, groupNodeIdsMap }) {
  const nodeInternals = useStore((s) => s.nodeInternals)
  const transform     = useStore((s) => s.transform)

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
      <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
        {groups.map((group) => {
          const nodeIds = groupNodeIdsMap.get(group.id)
          if (!nodeIds || nodeIds.size === 0) return null
          return (
            <GroupShape
              key={group.id}
              group={group}
              nodeIds={nodeIds}
              nodeInternals={nodeInternals}
              transform={transform}
            />
          )
        })}
      </svg>
    </div>
  )
}

// ── 그룹 도형 ────────────────────────────────────────────────────
function GroupShape({ group, nodeIds, nodeInternals, transform }) {
  const [tx, ty, zoom] = transform
  const w       = NODE_WIDTH  * zoom
  const h       = NODE_HEIGHT * zoom
  const padding = 16 * zoom

  // 각 노드의 화면 좌표 기반 패딩 포함 rect 계산
  const rects = []
  for (const nodeId of nodeIds) {
    const internal = nodeInternals.get(nodeId)
    if (!internal?.positionAbsolute) continue
    const sx = internal.positionAbsolute.x * zoom + tx
    const sy = internal.positionAbsolute.y * zoom + ty
    rects.push({
      x0: sx - padding,
      y0: sy - padding,
      x1: sx + w + padding,
      y1: sy + h + padding,
    })
  }
  if (rects.length === 0) return null

  // 격자 기반 outline polygon 계산
  const cellSize = Math.max(4, Math.min(w, h) / 2)

  const gx0 = Math.min(...rects.map((r) => r.x0))
  const gy0 = Math.min(...rects.map((r) => r.y0))
  const gx1 = Math.max(...rects.map((r) => r.x1))
  const gy1 = Math.max(...rects.map((r) => r.y1))

  const cols = Math.ceil((gx1 - gx0) / cellSize) + 1
  const rows = Math.ceil((gy1 - gy0) / cellSize) + 1

  // 셀 점유 표시
  const grid = new Uint8Array(cols * rows)
  for (const rect of rects) {
    const ixMin = Math.max(0, Math.floor((rect.x0 - gx0) / cellSize))
    const iyMin = Math.max(0, Math.floor((rect.y0 - gy0) / cellSize))
    const ixMax = Math.min(cols - 1, Math.ceil((rect.x1 - gx0) / cellSize) - 1)
    const iyMax = Math.min(rows - 1, Math.ceil((rect.y1 - gy0) / cellSize) - 1)
    for (let iy = iyMin; iy <= iyMax; iy++) {
      for (let ix = ixMin; ix <= ixMax; ix++) {
        grid[iy * cols + ix] = 1
      }
    }
  }

  function cell(ix, iy) {
    if (ix < 0 || ix >= cols || iy < 0 || iy >= rows) return false
    return grid[iy * cols + ix] === 1
  }

  // 격자 좌표 → 화면 좌표 (정수 반올림으로 부동소수점 키 충돌 방지)
  function gx(ix) { return Math.round(gx0 + ix * cellSize) }
  function gy(iy) { return Math.round(gy0 + iy * cellSize) }

  // 방향성 경계 간선 수집 (내부가 진행 방향의 왼쪽 = CCW 외곽)
  const edgeMap = new Map()
  function addEdge(x0, y0, x1, y1) {
    const k = `${x0},${y0}`
    const arr = edgeMap.get(k) ?? []
    arr.push({ x: x1, y: y1 })
    edgeMap.set(k, arr)
  }

  for (let iy = 0; iy <= rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const above = cell(ix, iy - 1)
      const below = cell(ix, iy)
      if (!above &&  below) addEdge(gx(ix),     gy(iy), gx(ix + 1), gy(iy))  // →
      if ( above && !below) addEdge(gx(ix + 1), gy(iy), gx(ix),     gy(iy))  // ←
    }
  }
  for (let ix = 0; ix <= cols; ix++) {
    for (let iy = 0; iy < rows; iy++) {
      const left  = cell(ix - 1, iy)
      const right = cell(ix,     iy)
      if (!left  &&  right) addEdge(gx(ix), gy(iy + 1), gx(ix), gy(iy))      // ↑
      if ( left  && !right) addEdge(gx(ix), gy(iy),     gx(ix), gy(iy + 1))  // ↓
    }
  }

  // 다각형 추적
  const polygons = []
  const remaining = new Map()
  for (const [k, v] of edgeMap) remaining.set(k, [...v])

  for (let guard = 0; guard < 10000 && remaining.size > 0; guard++) {
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
        // 여러 선택지: 가장 CW 방향 선택(외곽 추적)
        const prev = poly.length >= 2 ? poly[poly.length - 2] : { x: cx - 1, y: cy }
        const dx = cx - prev.x
        const dy = cy - prev.y
        next = arr.reduce((best, c) => {
          const cr1 = (c.x    - cx) * dy - (c.y    - cy) * dx
          const cr2 = (best.x - cx) * dy - (best.y - cy) * dx
          return cr1 < cr2 ? c : best
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

  return (
    <g>
      {polygons.map((pts, i) => (
        <polygon
          key={i}
          points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
          fill={group.color}
          fillOpacity={0.15}
          stroke={group.color}
          strokeWidth={2}
          strokeDasharray="6 3"
          strokeLinejoin="miter"
        />
      ))}
      <text
        x={gx0 + 8}
        y={gy0 - 8}
        fill={group.color}
        fontSize={Math.round(13 * zoom)}
        fontWeight={700}
        style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.9))', userSelect: 'none' }}
      >
        {group.name}
      </text>
    </g>
  )
}
