import { useStore } from 'reactflow'
import { NODE_WIDTH, NODE_HEIGHT } from './dagreLayout'
import { computeGroupPolygon } from './computeGroupPolygon'

// ── 메인 컴포넌트 ─────────────────────────────────────────────────
// ReactFlowProvider 컨텍스트 안에서 useStore로 nodeInternals와
// transform을 구독하여 pan/zoom 시 SVG polygon을 실시간 갱신.
export default function GroupOverlay({ groups, groupNodeIdsMap }) {
  // ReactFlow v11: state.transform = [translateX, translateY, zoom]
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
  const w = NODE_WIDTH  * zoom
  const h = NODE_HEIGHT * zoom

  // 각 노드의 화면 좌표 rect 구성 (padding 미포함 — computeGroupPolygon에 위임)
  const rects = []
  for (const nodeId of nodeIds) {
    const internal = nodeInternals.get(nodeId)
    if (!internal?.positionAbsolute) continue
    const x = internal.positionAbsolute.x * zoom + tx
    const y = internal.positionAbsolute.y * zoom + ty
    rects.push({ x, y, w, h })
  }
  if (rects.length === 0) return null

  const padding = 16 * zoom
  const polygon = computeGroupPolygon(rects, padding)
  if (polygon.length === 0) return null

  const minX = Math.min(...polygon.map((p) => p.x))
  const minY = Math.min(...polygon.map((p) => p.y))

  return (
    <g>
      <polygon
        points={polygon.map((p) => `${p.x},${p.y}`).join(' ')}
        fill={group.color}
        fillOpacity={0.15}
        stroke={group.color}
        strokeWidth={2}
        strokeDasharray="6 3"
        strokeLinejoin="round"
      />
      <text
        x={minX + 8}
        y={minY - 6}
        fill={group.color}
        fontSize={Math.max(11, 13 * zoom)}
        fontWeight={700}
        style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.9))', userSelect: 'none' }}
      >
        {group.name}
      </text>
    </g>
  )
}
