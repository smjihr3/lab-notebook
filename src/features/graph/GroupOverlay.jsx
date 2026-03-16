import { useStore } from 'reactflow'
import { NODE_WIDTH, NODE_HEIGHT } from './dagreLayout'

// ReactFlowProvider 컨텍스트 안에서 useStore로 nodeInternals와
// transform을 구독하여 pan/zoom 시 그룹 배경을 실시간 갱신.
export default function GroupOverlay({ groups, groupNodeIdsMap, onGroupContextMenu }) {
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
            <GroupRect
              key={group.id}
              group={group}
              nodeIds={nodeIds}
              nodeInternals={nodeInternals}
              transform={transform}
              onContextMenu={onGroupContextMenu}
            />
          )
        })}
      </svg>
    </div>
  )
}

// ── 그룹 직사각형 배경 ───────────────────────────────────────────
function GroupRect({ group, nodeIds, nodeInternals, transform, onContextMenu }) {
  const [tx, ty, zoom] = transform
  const w       = NODE_WIDTH  * zoom
  const h       = NODE_HEIGHT * zoom
  const padding = 24  // 화면 픽셀

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  for (const nodeId of nodeIds) {
    const internal = nodeInternals.get(nodeId)
    if (!internal?.positionAbsolute) continue
    const sx = internal.positionAbsolute.x * zoom + tx
    const sy = internal.positionAbsolute.y * zoom + ty
    minX = Math.min(minX, sx)
    minY = Math.min(minY, sy)
    maxX = Math.max(maxX, sx + w)
    maxY = Math.max(maxY, sy + h)
  }

  if (!isFinite(minX)) return null

  minX -= padding
  minY -= padding
  maxX += padding
  maxY += padding

  return (
    <g>
      <rect
        x={minX}
        y={minY}
        width={maxX - minX}
        height={maxY - minY}
        rx={10}
        fill={group.color}
        fillOpacity={0.15}
        stroke={group.color}
        strokeWidth={2}
        strokeDasharray="6 3"
        style={{ pointerEvents: 'all', cursor: 'context-menu' }}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onContextMenu?.({ x: e.clientX, y: e.clientY, group })
        }}
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
